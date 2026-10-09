using System.Security.Cryptography;
using System.Text;
using Underwriting.Application.Abstractions;
using Underwriting.Domain;
using Underwriting.Domain.Evidence;
using Underwriting.Domain.Investigations;

namespace Underwriting.Application.Investigations;

public sealed record SessionResult(string CaseId, string BranchId, string Token);

public sealed class SessionService(ISessionStore sessions, IDemoEvidence demo,
    IRepository<CaseRecord> cases, IRepository<Branch> branches, IRepository<EvidenceDocument> documents,
    IPrivateFiles files, TimeProvider clock)
{
    public static string Owner(string token) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
    public bool IsValid(string token) => sessions.IsValid(Owner(token), clock.GetUtcNow().ToUnixTimeMilliseconds());

    public async Task<SessionResult> CreateAsync(CancellationToken cancellationToken)
    {
        var token = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(32));
        var ids = await InitializeAsync(Owner(token), cancellationToken);
        return new(ids.CaseId, ids.BranchId, token);
    }

    public async Task<(string CaseId, string BranchId)> InitializeAsync(string owner, CancellationToken cancellationToken)
    {
        var seed = await demo.InstallAsync(owner, cancellationToken);
        var caseId = CaseService.NewId(); var branchId = CaseService.NewId();
        var createdAt = clock.GetUtcNow().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'");
        sessions.Save(owner, clock.GetUtcNow().AddHours(24).ToUnixTimeMilliseconds());
        cases.Save(owner, caseId, new()
        {
            Id = caseId,
            SessionId = owner,
            Name = "The Alder Lane purchase",
            Address = "18 Alder Lane, Kingston, Ontario",
            Template = null,
            Status = null,
            Version = null,
            BranchIds = [branchId],
            CreatedAt = createdAt
        });
        branches.Save(owner, branchId, new()
        {
            Id = branchId,
            CaseId = caseId,
            ClosingDate = "2026-10-15",
            PurchasePrice = 700000,
            LoanAmount = 500000,
            CreatedAt = createdAt,
            DocumentIds = seed.Where(item => !item.Reveal).Select(item => item.Document.Id).ToList()
        });
        foreach (var item in seed) documents.Save(owner, item.Document.Id, item.Document);
        return (caseId, branchId);
    }

    public void Delete(string owner) { sessions.Remove(owner); files.DeleteSession(owner); }
}
