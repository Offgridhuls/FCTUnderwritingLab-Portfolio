using Underwriting.Domain.Evidence;
using Underwriting.Domain.Investigations;
using Underwriting.Domain.Reviews;

namespace Underwriting.Application.Comparison;

public sealed record TopicSide(string Status, string Explanation, List<Citation> Citations, List<Finding> Findings, List<Finding> Limitations, List<string> Reasons);
public sealed record TopicComparison(string Id, string Label, string Reviewer, string Outcome, bool Changed, TopicSide Before, TopicSide After);
public sealed record Sides<T>(T Before, T After);
public sealed record DocumentReference(string Id, string Title);
public sealed record EvidenceChanges(List<DocumentReference> Added, List<DocumentReference> Removed, List<DocumentReference> NewlyCited);
public sealed record DetailChange(string Field, object? Before, object? After);
public sealed record LegacyChange(string IssueCode, string State, Finding? Before, Finding? After);
public sealed record ComparisonResult(Review? Left, Review? Right, Branch BeforeBranch, Branch AfterBranch,
    List<Review> BeforeReviews, List<Review> AfterReviews, bool Incomplete, List<string> Reasons,
    List<TopicComparison> Topics, Sides<List<Finding>> Unmapped, EvidenceChanges Evidence,
    List<DetailChange> Details, Sides<List<string>> Assumptions, List<LegacyChange> Changes);
