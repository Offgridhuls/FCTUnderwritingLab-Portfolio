using Underwriting.Application.Abstractions;
using Underwriting.Application.Investigations;
using Underwriting.Application.Reviews;
using Underwriting.Domain;
using Underwriting.Domain.Investigations;
using Underwriting.Domain.Reviews;

namespace Underwriting.Application.Comparison;

public sealed class ComparisonService(CaseService cases, IRepository<Review> reviews, IRepository<Intervention> interventions,
    ReviewerCatalog catalog, CoverageService coverage)
{
    public ComparisonResult Compare(string owner, string beforeBranchId, string afterBranchId, string? beforeReviewId = null, string? afterReviewId = null)
    {
        var beforeBranch = cases.GetBranch(owner, beforeBranchId);
        var afterBranch = cases.GetBranch(owner, afterBranchId);
        CaseService.Require(beforeBranch.CaseId == afterBranch.CaseId, "Branches belong to different cases");
        CaseService.Require(beforeBranch.Id != afterBranch.Id, "Select two different branches");
        var allReviews = reviews.List(owner);
        foreach (var (id, branch) in new[] { (beforeReviewId, beforeBranch), (afterReviewId, afterBranch) })
            if (id is not null && !allReviews.Any(review => review.Id == id && review.BranchId == branch.Id))
                throw new DomainException("missing", "Review not found in selected branch");
        var pending = interventions.List(owner);
        var left = SelectReview(allReviews, beforeBranch, beforeReviewId);
        var right = SelectReview(allReviews, afterBranch, afterReviewId);
        // Repositories return detached records; validation here must never rewrite saved history.
        if (left is not null) coverage.Validate(left);
        if (right is not null) coverage.Validate(right);
        var topics = catalog.CoverageTopics.Select(topic =>
        {
            var before = Side(left, beforeBranch, topic.Id, pending);
            var after = Side(right, afterBranch, topic.Id, pending);
            if (left?.CoverageVersion is not null && right?.CoverageVersion is not null && left.CoverageVersion != right.CoverageVersion)
                after.Reasons.Add("Checklist versions differ.");
            if (left?.CoverageVersion is not null and not ("demo-coverage-1" or "demo-coverage-2")) before.Reasons.Add("Unsupported checklist version.");
            if (right?.CoverageVersion is not null and not ("demo-coverage-1" or "demo-coverage-2")) after.Reasons.Add("Unsupported checklist version.");
            var old = Active(before);
            var current = Active(after);
            var outcome = before.Reasons.Count > 0 || after.Reasons.Count > 0 || before.Status == "unassessed" || after.Status == "unassessed" ? "uncertain"
                : old && after.Status == "no_issue" && !current ? "addressed"
                : current && !old ? "new" : current ? "action" : "unchanged";
            return new TopicComparison(topic.Id, topic.Label, topic.Reviewer, outcome,
                outcome == "uncertain" || before.Status != after.Status || old != current, before, after);
        }).ToList();
        var beforeMapped = topics.SelectMany(topic => topic.Before.Findings.Concat(topic.Before.Limitations)).Select(finding => finding.Id).ToHashSet();
        var afterMapped = topics.SelectMany(topic => topic.After.Findings.Concat(topic.After.Limitations)).Select(finding => finding.Id).ToHashSet();
        var leftDocuments = left?.Snapshot.Documents ?? [];
        var rightDocuments = right?.Snapshot.Documents ?? [];
        var leftCitations = Cited(left);
        var rightCitations = Cited(right);
        var leftValues = Values(left);
        var rightValues = Values(right);
        var details = leftValues.Keys.Union(rightValues.Keys).Where(key => !Equals(leftValues.GetValueOrDefault(key), rightValues.GetValueOrDefault(key)))
            .Select(key => new DetailChange(key, leftValues.GetValueOrDefault(key), rightValues.GetValueOrDefault(key))).ToList();
        var reasons = Reasons(left, beforeBranch, pending).Select(reason => "Before: " + reason)
            .Concat(Reasons(right, afterBranch, pending).Select(reason => "After: " + reason)).ToList();
        if (topics.Any(topic => topic.Outcome == "uncertain")) reasons.Add("Some topic assessments cannot be reliably compared.");
        var codes = (left?.Findings ?? []).Concat(right?.Findings ?? []).Select(finding => finding.IssueCode).Distinct();
        var legacy = codes.Select(code =>
        {
            var before = left?.Findings.Find(finding => finding.IssueCode == code);
            var after = right?.Findings.Find(finding => finding.IssueCode == code);
            var state = before is null ? "new" : after is null ? "not reassessed"
                : before.Status == "open" && after.Status != "open" ? "resolved"
                : before.Status != after.Status || before.Severity != after.Severity || before.Explanation != after.Explanation ? "changed" : "unchanged";
            return new LegacyChange(code, state, before, after);
        }).ToList();
        return new(left, right, beforeBranch, afterBranch,
            allReviews.Where(review => review.BranchId == beforeBranch.Id).OrderByDescending(review => review.CreatedAt, StringComparer.Ordinal).ToList(),
            allReviews.Where(review => review.BranchId == afterBranch.Id).OrderByDescending(review => review.CreatedAt, StringComparer.Ordinal).ToList(),
            reasons.Count > 0, reasons, topics,
            new((left?.Findings ?? []).Where(finding => !beforeMapped.Contains(finding.Id)).ToList(), (right?.Findings ?? []).Where(finding => !afterMapped.Contains(finding.Id)).ToList()),
            new(rightDocuments.Where(document => !leftDocuments.Any(item => item.Id == document.Id)).Select(document => new DocumentReference(document.Id, document.Title)).ToList(),
                leftDocuments.Where(document => !rightDocuments.Any(item => item.Id == document.Id)).Select(document => new DocumentReference(document.Id, document.Title)).ToList(),
                rightDocuments.Where(document => rightCitations.Contains(document.Id) && !leftCitations.Contains(document.Id)).Select(document => new DocumentReference(document.Id, document.Title)).ToList()),
            details, new(left?.Snapshot.Assumptions ?? [], right?.Snapshot.Assumptions ?? []), legacy);
    }

    public static Review? SelectReview(IEnumerable<Review> reviews, Branch branch, string? id = null)
    {
        var own = reviews.Where(review => review.BranchId == branch.Id).OrderByDescending(review => review.CreatedAt, StringComparer.Ordinal).ThenByDescending(review => review.Id, StringComparer.Ordinal).ToList();
        return id is not null ? own.Find(review => review.Id == id)
            : own.Find(review => review.Status == "completed" && review.Mode != "specialist" && review.Revision == branch.Revision) ?? own.FirstOrDefault();
    }

    private static bool Active(TopicSide side) => side.Status is "issue" or "insufficient" || side.Findings.Any(finding => finding.IsActionable());

    private static List<string> Reasons(Review? review, Branch branch, IReadOnlyList<Intervention> interventions)
    {
        if (review is null) return ["No review available."];
        var result = new List<string>();
        if (review.Status != "completed") result.Add($"Review is {review.Status}.");
        if (review.Revision != branch.Revision) result.Add($"Outdated evidence: assessed revision {review.Revision}, current revision {branch.Revision}.");
        if (review.NeedsRerun) result.Add("Full rerun required.");
        if (review.Mode == "specialist") result.Add("Partial specialist scope; other areas were not assessed.");
        if (review.CoverageStatus == "incomplete") result.Add("Coverage incomplete; inspect individual topics.");
        if (review.CoverageVersion is null) result.Add("Historical review: coverage checklist not recorded.");
        if (interventions.Any(item => item.ReviewId == review.Id && item.State is "queued" or "processing")) result.Add("Human challenge pending.");
        return result;
    }

    private static TopicSide Side(Review? review, Branch branch, string topicId, IReadOnlyList<Intervention> interventions)
    {
        var entry = review?.Coverage.Find(entry => entry.TopicId == topicId);
        var reasons = Reasons(review, branch, interventions).Where(reason => !reason.StartsWith("Coverage incomplete", StringComparison.Ordinal) && !reason.StartsWith("Partial specialist", StringComparison.Ordinal)).ToList();
        if (entry is null) return new("unassessed", "No topic assessment recorded in this review.", [], [], [], [.. reasons, "Topic not assessed."]);
        var linked = review!.Findings.Where(finding => entry.FindingIds.Contains(finding.Id)).ToList();
        var scenario = entry.Scenario;
        var findings = scenario is null ? linked.Where(finding => finding.Category != "assessment_limit").ToList() : review.Findings.Where(finding => scenario.FindingIds.Contains(finding.Id)).ToList();
        var limitations = scenario is null ? linked.Where(finding => finding.Category == "assessment_limit").ToList() : review.Findings.Where(finding => scenario.LimitationIds.Contains(finding.Id)).ToList();
        if (scenario is null && limitations.Count > 0 && !findings.Any(finding => finding.IsActionable()) && entry.Status is "issue" or "insufficient")
            reasons.Add("Saved assessment does not separate the scenario outcome from verification limitations.");
        return new(scenario?.Status ?? entry.Status, scenario?.Explanation ?? entry.Explanation, scenario?.Citations ?? entry.Citations, findings, limitations, [.. reasons, .. entry.Gaps]);
    }

    private static HashSet<string> Cited(Review? review) => (review?.Findings.SelectMany(finding => finding.Citations) ?? [])
        .Concat(review?.Coverage.SelectMany(entry => entry.Citations.Concat(entry.Scenario?.Citations ?? [])) ?? []).Select(citation => citation.DocumentId).ToHashSet();

    private static Dictionary<string, object?> Values(Review? review)
    {
        if (review is null) return [];
        var values = review.Snapshot.Details?.Values.ToDictionary(pair => pair.Key, pair => (object?)pair.Value) ?? [];
        values["closingDate"] = review.Snapshot.ClosingDate;
        values["purchasePrice"] = review.Snapshot.PurchasePrice;
        values["loanAmount"] = review.Snapshot.LoanAmount;
        return values;
    }
}
