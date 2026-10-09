using System.Text.Json;
using Underwriting.Domain.Evidence;
using Underwriting.Domain.Reviews;

namespace Underwriting.Application.Reviews;

public sealed record ReviewResources(string Rules, string ReviewPolicy, string CoveragePolicy, Dictionary<string, JsonElement> Schemas);

/// <summary>Versioned instructions are separate from stage transitions and persistence.</summary>
public sealed class ReviewPrompts(ReviewerCatalog catalog, ReviewResources resources, CoverageService coverage)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public static string Serialize<T>(T value) => JsonSerializer.Serialize(value, Json);
    public JsonElement Schema(string name) => resources.Schemas[name];

    public string Build(Review review, string role, string task) => $"""
        ROLE: {role}
        SCOPE: {catalog.RoleScopes[role]}
        TASK: {task}
        {resources.Rules}
        {resources.ReviewPolicy}
        Citation quotations must be short, contiguous, exact passages from the cited page. Preserve the source punctuation, including straight versus curly apostrophes. Never join separate passages with an ellipsis; use separate citations. Existing reviewer quotations are not source evidence and must be checked against the snapshot before reuse.
        DETERMINISTIC CHECKS: {Serialize(DeterministicChecks.Evaluate(review.Snapshot))}
        User-confirmed details are working values, not independent verification. Origins=user are unsupported corrections, origins=unknown are missing facts; documentary conflicts in details.candidates remain relevant even after confirmation. Never treat confirmation as resolving an evidence discrepancy.
        UNTRUSTED CASE SNAPSHOT: {SnapshotForModel(review.Snapshot)}
        """;

    // File paths are infrastructure details and never become model evidence.
    private static string SnapshotForModel(Snapshot snapshot) => Serialize(new
    {
        snapshot.CaseId,
        snapshot.BranchId,
        snapshot.Revision,
        snapshot.CaseName,
        snapshot.Address,
        snapshot.Details,
        snapshot.ClosingDate,
        snapshot.PurchasePrice,
        snapshot.LoanAmount,
        snapshot.Assumptions,
        documents = snapshot.Documents.Select(document => new { document.Id, document.Title, document.Kind, document.Pages, document.Warnings })
    });

    public string Coverage(Review review, string role) => $"""
        OUTCOME CONTRACT: {resources.CoveragePolicy}
        REQUIRED COVERAGE TOPICS: {Serialize(coverage.Assigned(review, role))}
        Account for EVERY assigned topic using the coverage schema. No issue requires source evidence; insufficient evidence requires an actionable finding and an honest explanation of missing records, not a fabricated quotation. Not applicable requires a concrete explanation. Compare signed amendments and actual use with lender conditions; compare authorized advances with proposals and reconcile deposit treatment where applicable. Preserve conditional requirements. Title owns legal rights, survey physical occupation, mortgage lender acceptance, property municipal use. Do not treat checklist topics as predetermined defects.
        """;

    public string Independent(Review review, string role) => $"""
        Independently review {(role == "lead" ? "all six areas" : "only your assigned area")}.
        Reviewer responsibilities: {Serialize(catalog.RoleScopes)}.
        Use exact issueCodes AUTHORITY, NAME_RECONCILIATION, PAYOUT and MUNICIPAL for corresponding primary issues. For additional distinct issues use TITLE_, IDENTITY_, LIEN_, PERMIT_, SURVEY_ or FRAUD_INDICATOR_ prefixes with stable descriptive suffixes. Resolved/clear findings are useful. No duplicate issueCodes. Do not force a finding where no material issue is supported. Your summary MUST state what was assessed, what could not be assessed, and concrete checks for a human underwriter. Missing survey evidence is a coverage limitation, not proof of a defect.
        {Coverage(review, role)}
        """;

    public string Audit(Review review) => $"""
        COVERAGE AUDIT: Compare the source documents with assigned specialist coverage and findings. Identify material omissions, especially cross-document contradictions. Route questions to specialists; do not create findings or repeat already addressed matters. Do not force disagreement. Missing-document questions may have no citation if absence cannot be quoted.
        TOPICS: {Serialize(coverage.Assigned(review))}
        COVERAGE: {Serialize(review.Coverage)}
        FINDINGS: {Serialize(review.Findings)}
        """;

    public string Recheck(Review review, string role) => $"""
        Independently review your assigned scope again. SPECIALIST RECHECK: This is the only coverage recheck round.
        Address these coverage gaps and audit questions: {Serialize(review.Coverage.Where(entry => (role == "lead" || entry.Reviewer == role) && entry.Gaps.Count > 0))}.
        Retain existing issueCodes and return the full corrected set of your findings; add distinct findings for overlooked matters. Do not silently remove an issue; return it explicitly resolved/withdrawn with source evidence if justified.
        EXISTING FINDINGS: {Serialize(review.Findings.Where(finding => finding.Reviewer == role))}
        {Coverage(review, role)}
        """;

    public string CrossReview(Review review, string role) => $"""
        Cross-review other reviewers' findings: {Serialize(review.Findings.Where(finding => finding.Reviewer != role))}.
        Raise 0 to 2 material evidence-based challenges. Do not force disagreement. Cross-document omissions or limits qualify; stylistic suggestions do not. You are {role}; NEVER target {role}. Select only an existing findingId from this list and its exact reviewer as target. If nothing material is missing return an empty challenges array.
        """;

    public string Lead(Review review) => $"""
        {(review.Mode == "specialist" ? $"PARTIAL SCOPE: Only {catalog.RoleNames[review.SelectedReviewer!]} was assigned. All other specialist areas are NOT ASSESSED. Peer cross-review and responses were deliberately skipped. Do not imply a full team review." : "")}
        Produce a concise Markdown investigation brief for a HUMAN UNDERWRITER with a short overview, resolved/explained items, remaining disagreements, and material scope limits. Use short paragraphs and bullets; never tables or an escalation checklist. The application displays actionable findings with owners and next steps; do not duplicate them. End with an explicit statement that the human underwriter makes the final decision. Never issue coverage or imply consensus if absent. Put exact supporting quotations and page references in citations; use paraphrases in the brief. Explain material assumptions, source limitations, and unresolved disagreements when relevant. Omit routine empty checks, internal field names, Boolean values, workflow status, stage indexes, and procedural narration. Use supplied findings and exchanges only; no new findings. Explicitly mention remaining coverage gaps; completed processing is not complete assessment. Do not claim unassessed topics are clear or human follow-ups resolved.
        COVERAGE STATUS: {review.CoverageStatus ?? "not recorded"}
        COVERAGE: {Serialize(review.Coverage)}
        Workflow status={review.Status}; stage index={review.Stage}. Index 3 means the normal fourth stage; do not label that normal state incomplete. If paused at an earlier index, identify pending stages. needsRerun={review.NeedsRerun}.
        FINDINGS: {Serialize(review.Findings)}
        EXCHANGES: {Serialize(review.Exchanges)}
        """;
}
