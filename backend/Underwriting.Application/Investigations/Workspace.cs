using Underwriting.Application.Abstractions;
using Underwriting.Domain.Evidence;
using Underwriting.Domain.Investigations;
using Underwriting.Domain.Reviews;

namespace Underwriting.Application.Investigations;

public sealed record Note(string Id, string BranchId, string Text, string CreatedAt);
public sealed record DetailHistory(string BranchId, CaseDetails Details, string At);
public sealed record Reveal(string Id, string Title);
public sealed record Workspace(CaseRecord Case, Branch Branch, Snapshot Snapshot, EvidenceChecks Checks,
    IReadOnlyList<Branch> Branches, IReadOnlyList<Review> Reviews, IReadOnlyList<Intervention> Interventions,
    IReadOnlyList<Note> Notes, IReadOnlyList<Reveal> Reveals, long LastEventId);

public sealed record CreateCaseRequest(string CommandId, string Name, string Address = "",
    string? ClosingDate = null, decimal? PurchasePrice = null, decimal? LoanAmount = null);
public sealed record CreateCaseResult(CaseRecord Case, string CaseId, string BranchId);
public record CaseCommand(string CaseId, string BranchId, int ExpectedRevision, string CommandId);
public sealed record StatusRequest(string CommandId, int ExpectedVersion, string Status, string Note);
