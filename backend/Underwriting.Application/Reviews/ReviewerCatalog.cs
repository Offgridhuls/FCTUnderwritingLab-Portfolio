namespace Underwriting.Application.Reviews;

public sealed record CoverageTopic(string Id, string Reviewer, string Label);

public sealed class ReviewerCatalog
{
    public List<string> Roles { get; set; } = [];
    public Dictionary<string, string> RoleNames { get; set; } = [];
    public Dictionary<string, string> RoleScopes { get; set; } = [];
    public List<CoverageTopic> CoverageTopics { get; set; } = [];
    public string CoverageVersion { get; set; } = "demo-coverage-1";
    public string RulesVersion { get; set; } = "DEMO-ONTARIO-1.0";
}
