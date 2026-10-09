using Underwriting.Domain.Evidence;

namespace Underwriting.Domain.Reviews;

public sealed class CoverageRecord
{
    public string TopicId { get; set; } = "";
    public string Reviewer { get; set; } = "";
    public string Status { get; set; } = "unassessed";
    public string Explanation { get; set; } = "No assessment recorded.";
    public List<Citation> Citations { get; set; } = [];
    public List<string> FindingIds { get; set; } = [];
    public List<string> Gaps { get; set; } = [];
    public string? OutcomeVersion { get; set; }
    public ScenarioAssessment? Scenario { get; set; }
    public string? AuditQuestion { get; set; }
    public string? AuditResponse { get; set; }
    public bool? AuditResolved { get; set; }
    public bool? AuditAddressed { get; set; }
}

public sealed class ScenarioAssessment
{
    public string Status { get; set; } = "unassessed";
    public string Explanation { get; set; } = "";
    public List<Citation> Citations { get; set; } = [];
    public List<string> FindingIds { get; set; } = [];
    public List<string> LimitationIds { get; set; } = [];
}
