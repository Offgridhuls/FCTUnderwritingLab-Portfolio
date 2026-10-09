using Underwriting.Application.Abstractions;
using Underwriting.Application.Investigations;
using Underwriting.Domain;
using Underwriting.Domain.Evidence;
using Underwriting.Domain.Investigations;

namespace Underwriting.Application.Documents;

public sealed record UploadRequest(string CaseId, string BranchId, int ExpectedRevision, string CommandId,
    string Title, string? Kind, string? Replaces, string Digest) : CaseCommand(CaseId, BranchId, ExpectedRevision, CommandId);
public sealed record UploadResult(EvidenceDocument Document, Branch Branch);
public sealed record RevealRequest(string CaseId, string BranchId, int ExpectedRevision, string CommandId,
    string DocumentId) : CaseCommand(CaseId, BranchId, ExpectedRevision, CommandId);

public sealed class DocumentService(CaseService cases, IRepository<EvidenceDocument> documents,
    IPdfExtractor extractor, IPrivateFiles files, IDemoEvidence demo)
{
    public EvidenceDocument Get(string owner, string id) => documents.Get(owner, id) ?? throw new DomainException("missing", "Document not found");
    public Task<byte[]> ReadAsync(string owner, string id, CancellationToken cancellationToken) => files.ReadAsync(Get(owner, id).File, cancellationToken);

    public async Task<UploadResult> UploadAsync(string owner, UploadRequest input, byte[] content, CancellationToken cancellationToken)
    {
        var extracted = extractor.Extract(content);
        var id = CaseService.NewId();
        var file = await files.SaveAsync(owner, id, content, cancellationToken);
        try
        {
            var result = cases.Mutate(owner, input, CaseService.Fingerprint("upload", input), branch =>
            {
                CaseService.Require(string.IsNullOrEmpty(input.Replaces) || branch.DocumentIds.Contains(input.Replaces), "Replacement document is not active");
                var active = branch.DocumentIds.Where(documentId => documentId != input.Replaces).ToList();
                CaseService.Require(active.Sum(documentId => Get(owner, documentId).Pages.Count) + extracted.Pages.Count <= 100, "Active case exceeds 100 pages");
                var kind = !string.IsNullOrEmpty(input.Replaces) ? Get(owner, input.Replaces).Kind : input.Kind ?? DetailExtractor.InferKind(input.Title, extracted.Pages);
                CaseService.Require(new[] { "uploaded", "agreement", "title", "lender", "payout", "payout-update", "identity", "authority-request", "municipal", "survey" }.Contains(kind), "Invalid document kind.");
                var document = new EvidenceDocument
                {
                    Id = id,
                    Title = input.Title[..Math.Min(input.Title.Length, 160)],
                    Kind = kind,
                    Pages = extracted.Pages,
                    Warnings = extracted.Warnings,
                    File = file,
                    CreatedAt = cases.Now()
                };
                documents.Save(owner, id, document);
                branch.DocumentIds = [.. active, id];
                cases.Changed(owner, branch);
                return new UploadResult(document, branch);
            });
            if (result.Document.Id != id) files.Delete(file);
            return result;
        }
        catch { files.Delete(file); throw; }
    }

    public Branch Reveal(string owner, RevealRequest input) => cases.Mutate(owner, input, CaseService.Fingerprint("reveal", input), branch =>
    {
        CaseService.Require(cases.GetCase(owner, branch.CaseId).Template != "blank", "Prepared reveals belong only to the demo case.");
        CaseService.Require(demo.Reveals.Any(item => item.Id == input.DocumentId), "Unknown evidence reveal");
        if (!branch.DocumentIds.Contains(input.DocumentId)) branch.DocumentIds.Add(input.DocumentId);
        return cases.Changed(owner, branch);
    });
}
