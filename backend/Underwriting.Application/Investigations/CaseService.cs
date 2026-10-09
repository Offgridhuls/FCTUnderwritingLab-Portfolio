using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Underwriting.Application.Abstractions;
using Underwriting.Application.Documents;
using Underwriting.Domain;
using Underwriting.Domain.Evidence;
using Underwriting.Domain.Investigations;
using Underwriting.Domain.Reviews;

namespace Underwriting.Application.Investigations;

public sealed class CaseService(
    IRepository<CaseRecord> cases, IRepository<Branch> branches, IRepository<EvidenceDocument> documents,
    IRepository<Review> reviews, IRepository<Intervention> interventions, IRepository<Note> notes,
    IRepository<DetailHistory> detailsHistory, ICommandStore commands, IEventStore events, TimeProvider clock)
{
    public string Now() => clock.GetUtcNow().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
    public static string NewId() => Guid.NewGuid().ToString();
    public static string Fingerprint<T>(string kind, T input) => Convert.ToHexStringLower(
        SHA256.HashData(Encoding.UTF8.GetBytes(kind + JsonSerializer.Serialize(input))));

    public CaseRecord GetCase(string owner, string id) => cases.Get(owner, id) ?? throw new DomainException("missing", "Case not found");
    public Branch GetBranch(string owner, string id) => branches.Get(owner, id) ?? throw new DomainException("missing", "Branch not found");

    public IReadOnlyList<CaseRecord> List(string owner, bool includeDisplayAddress = true)
    {
        var result = cases.List(owner);
        if (!includeDisplayAddress) return result;
        foreach (var item in result)
        {
            var primary = item.BranchIds.Count > 0 ? branches.Get(owner, item.BranchIds[0]) : null;
            item.DisplayAddress = primary?.Details?.Confirmed == true ? primary.Details.Values.GetValueOrDefault("address") : null;
            if (string.IsNullOrEmpty(item.DisplayAddress)) item.DisplayAddress = item.Address;
        }
        return result;
    }

    public CreateCaseResult Create(string owner, CreateCaseRequest input)
    {
        var name = input.Name.Trim();
        Require(name.Length is > 0 and <= 160, "Case name must be between 1 and 160 characters.");
        Require(input.Address.Length <= 300, "Address exceeds 300 characters.");
        ValidateDate(input.ClosingDate);
        Require(input.PurchasePrice is null or > 0 and <= 1_000_000_000 && input.LoanAmount is null or >= 0 and <= 1_000_000_000, "Invalid amount");
        return commands.Execute(owner, input.CommandId, Fingerprint("create-case", input), () =>
        {
            var branchId = NewId();
            var item = new CaseRecord { Id = NewId(), SessionId = owner, Name = name, Address = input.Address.Trim(), BranchIds = [branchId], CreatedAt = Now(), Template = "blank", Status = "open", Version = 1 };
            var branch = new Branch
            {
                Id = branchId,
                CaseId = item.Id,
                CreatedAt = Now(),
                Details = DetailExtractor.Extract([], 1),
                ClosingDate = input.ClosingDate ?? "",
                PurchasePrice = input.PurchasePrice ?? 0,
                LoanAmount = input.LoanAmount ?? 0
            };
            cases.Save(owner, item.Id, item);
            branches.Save(owner, branch.Id, branch);
            return new CreateCaseResult(item, item.Id, branch.Id);
        });
    }

    public void RequireIdle(string owner, string caseId, string? branchId = null)
    {
        if (reviews.List(owner).Any(review => review.CaseId == caseId && (branchId == null || review.BranchId == branchId) && review.Status is "running" or "paused") ||
            interventions.List(owner).Any(intervention => intervention.CaseId == caseId && (branchId == null || intervention.BranchId == branchId) && intervention.State is "queued" or "processing"))
            throw new DomainException("conflict", "Finish or cancel active reviews and wait for interventions before changing case state.");
    }

    public T Mutate<T>(string owner, CaseCommand input, string fingerprint, Func<Branch, T> action) =>
        commands.Execute(owner, input.CommandId, fingerprint, () =>
        {
            Require(input.ExpectedRevision > 0, "Invalid revision.");
            var branch = GetBranch(owner, input.BranchId);
            if (branch.CaseId != input.CaseId) throw new DomainException("missing", "Case and branch do not match");
            if (GetCase(owner, branch.CaseId).Status == "finalized") throw new DomainException("conflict", "Case is finalized. Reopen it before making changes.");
            if (branch.Revision != input.ExpectedRevision) throw new DomainException("conflict", $"Stale case revision. Expected {input.ExpectedRevision}; current is {branch.Revision}. Refresh before editing.");
            return action(branch);
        });

    public CaseRecord SetStatus(string owner, string caseId, StatusRequest input)
    {
        Require(input.Status is "open" or "finalized", "Invalid case status.");
        Require(input.Note.Trim().Length is > 0 and <= 3000, "A handoff note or reopening reason is required.");
        return commands.Execute(owner, input.CommandId, Fingerprint("status:" + caseId, input), () =>
        {
            var item = GetCase(owner, caseId);
            if ((item.Version ?? 1) != input.ExpectedVersion) throw new DomainException("conflict", "Case changed. Refresh before updating its status.");
            RequireIdle(owner, caseId);
            if ((item.Status ?? "open") == input.Status) throw new DomainException("conflict", "Case already has that status.");
            item.Status = input.Status;
            item.Version = (item.Version ?? 1) + 1;
            (item.Lifecycle ??= []).Add(new(input.Status == "finalized" ? "finalized" : "reopened", Now(), input.Note.Trim()));
            if (input.Status == "finalized") { item.FinalizedAt = Now(); item.FinalizationNote = input.Note.Trim(); }
            cases.Save(owner, item.Id, item);
            foreach (var id in item.BranchIds) Publish(owner, GetBranch(owner, id), "case.status", new { status = item.Status });
            return item;
        });
    }

    public Snapshot Snapshot(string owner, Branch branch)
    {
        var item = GetCase(owner, branch.CaseId);
        return new()
        {
            CaseId = item.Id,
            BranchId = branch.Id,
            Revision = branch.Revision,
            CaseName = item.Name,
            Address = branch.Details?.Confirmed == true ? branch.Details.Values.GetValueOrDefault("address", "") : item.Address,
            Details = branch.Details,
            ClosingDate = branch.ClosingDate,
            PurchasePrice = branch.PurchasePrice,
            LoanAmount = branch.LoanAmount,
            Assumptions = [.. branch.Assumptions],
            Documents = branch.DocumentIds.Select(id => documents.Get(owner, id)).OfType<EvidenceDocument>().ToList()
        };
    }

    public Workspace Workspace(string owner, string branchId, IReadOnlyList<Reveal>? reveals = null)
    {
        var branch = GetBranch(owner, branchId);
        var snapshot = Snapshot(owner, branch);
        return new(GetCase(owner, branch.CaseId), branch, snapshot, DeterministicChecks.Evaluate(snapshot),
            branches.List(owner).Where(item => item.CaseId == branch.CaseId).ToList(),
            reviews.List(owner).Where(review => review.BranchId == branchId).ToList(),
            interventions.List(owner).Where(intervention => intervention.BranchId == branchId).ToList(),
            notes.List(owner).Where(note => note.BranchId == branchId).ToList(), reveals ?? [], events.LastId(owner));
    }

    public Branch Changed(string owner, Branch branch)
    {
        // Running reviews retain their immutable snapshot; new evidence creates a later revision.
        branch.Revision++;
        if (GetCase(owner, branch.CaseId).Template == "blank")
        {
            if (branch.Details != null) detailsHistory.Save(owner, NewId(), new(branch.Id, branch.Details, Now()));
            branch.Details = DetailExtractor.Extract(Snapshot(owner, branch).Documents, branch.Revision);
        }
        branches.Save(owner, branch.Id, branch);
        Publish(owner, branch, "case.changed", new { requiresFullReview = true });
        return branch;
    }

    public void Publish<T>(string owner, Branch branch, string type, T data) => events.Append(new(
        0, owner, branch.CaseId, branch.Id, branch.Revision, type, JsonSerializer.SerializeToElement(data), Now()));

    public static void Require(bool condition, string message)
    {
        if (!condition) throw new DomainException("invalid", message);
    }

    public static void ValidateDate(string? value)
    {
        if (value is not null && value != "") Require(DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _), "Invalid date.");
    }
}
