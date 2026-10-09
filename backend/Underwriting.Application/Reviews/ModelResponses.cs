using Underwriting.Domain.Evidence;
using Underwriting.Domain.Reviews;

namespace Underwriting.Application.Reviews;

public sealed class SpecialistResponse
{
    public List<Finding> Findings { get; set; } = [];
    public string Summary { get; set; } = "";
    public List<CoverageResponse> Coverage { get; set; } = [];
}

public sealed class CoverageResponse
{
    public string TopicId { get; set; } = "";
    public string Status { get; set; } = "unassessed";
    public string Explanation { get; set; } = "";
    public List<Citation> Citations { get; set; } = [];
    public List<string> FindingIssueCodes { get; set; } = [];
    public string? AuditResponse { get; set; }
    public bool? AuditAddressed { get; set; }
    public bool? AuditResolved { get; set; }
    public ScenarioResponse? Scenario { get; set; }
}

public sealed class ScenarioResponse
{
    public string Status { get; set; } = "unassessed";
    public string Explanation { get; set; } = "";
    public List<Citation> Citations { get; set; } = [];
    public List<string> FindingIssueCodes { get; set; } = [];
    public List<string> LimitationIssueCodes { get; set; } = [];
}

public sealed record AuditQuestion(string TopicId, string Text, List<Citation> Citations);
public sealed record AuditResponse(List<AuditQuestion> Questions);
public sealed record PeerChallenge(string Target, string FindingId, string Text, List<Citation> Citations);
public sealed record CrossReviewResponse(List<PeerChallenge> Challenges);
public sealed record LeadResponse(string Brief, List<Citation> Citations);
public sealed record FindingResponse(string Disposition, string Explanation, List<Citation> Citations,
    Finding? RevisedFinding = null, bool Unresolved = false, bool CrossDomainImpact = false);
public sealed record PeerResponse(string FindingId, string Disposition, string Explanation, List<Citation> Citations,
    Finding? RevisedFinding = null, bool Unresolved = false, bool CrossDomainImpact = false);
public sealed record PeerResponses(List<PeerResponse> Responses);
