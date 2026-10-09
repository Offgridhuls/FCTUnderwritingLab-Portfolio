using Underwriting.Domain.Evidence;
using Underwriting.Domain.Reviews;

namespace Underwriting.Application.Reviews;

public sealed class CoverageService(ReviewerCatalog catalog)
{
    public List<CoverageTopic> Assigned(Review review, string? role = null) => catalog.CoverageTopics
        .Where(topic => (review.Mode != "specialist" || topic.Reviewer == review.SelectedReviewer) &&
            (role is null or "lead" || topic.Reviewer == role)).ToList();

    public void Initialize(Review review)
    {
        review.CoverageVersion = catalog.CoverageVersion;
        review.Coverage = Assigned(review).Select(topic => new CoverageRecord { TopicId = topic.Id, Reviewer = topic.Reviewer, Gaps = ["Topic not assessed."] }).ToList();
        review.CoverageStatus = "pending"; review.CoverageRechecked = [];
    }

    public void Record(Review review, string role, List<CoverageResponse> records)
    {
        var assigned = Assigned(review, role);
        foreach (var topic in assigned)
        {
            var matches = records.Where(record => record.TopicId == topic.Id).ToList();
            var previous = review.Coverage.Single(record => record.TopicId == topic.Id);
            if (matches.Count == 0) { previous.Status = "unassessed"; previous.Gaps = ["Topic not assessed."]; continue; }
            var entry = matches[0];
            var own = review.Findings.Where(finding => finding.Reviewer == (review.Mode == "single" ? "lead" : topic.Reviewer)).ToList();
            List<string> Links(List<string> codes) => codes.SelectMany(code => own.Where(finding => finding.IssueCode == code).Select(finding => finding.Id)).ToList();
            bool Invalid(List<string> codes) => codes.Any(code => own.Count(finding => finding.IssueCode == code) != 1);
            var next = new CoverageRecord
            {
                TopicId = topic.Id,
                Reviewer = topic.Reviewer,
                Status = entry.Status,
                Explanation = entry.Explanation,
                Citations = entry.Citations.Select(citation => CitationValidator.Validate(citation, review.Snapshot)).ToList(),
                FindingIds = Links(entry.FindingIssueCodes),
                AuditQuestion = previous.AuditQuestion,
                AuditResponse = entry.AuditResponse,
                AuditAddressed = entry.AuditAddressed,
                AuditResolved = entry.AuditResolved
            };
            if (matches.Count != 1) next.Gaps.Add("Duplicate coverage entries.");
            if (records.Any(record => !assigned.Any(item => item.Id == record.TopicId))) next.Gaps.Add("Reviewer returned topics outside its assigned scope.");
            if (Invalid(entry.FindingIssueCodes)) next.Gaps.Add("Finding link is missing or ambiguous.");
            if (entry.Scenario is { } scenario)
            {
                next.OutcomeVersion = "scenario-1";
                next.Scenario = new()
                {
                    Status = scenario.Status,
                    Explanation = scenario.Explanation,
                    Citations = scenario.Citations.Select(citation => CitationValidator.Validate(citation, review.Snapshot)).ToList(),
                    FindingIds = Links(scenario.FindingIssueCodes),
                    LimitationIds = Links(scenario.LimitationIssueCodes)
                };
                if (Invalid([.. scenario.FindingIssueCodes, .. scenario.LimitationIssueCodes])) next.Gaps.Add("Finding link in scenario is missing or ambiguous.");
            }
            review.Coverage[review.Coverage.IndexOf(previous)] = next;
        }
        Validate(review);
    }

    public void Validate(Review review)
    {
        if (review.CoverageVersion is null) return;
        foreach (var entry in review.Coverage)
        {
            var gaps = entry.Gaps.Where(gap => gap.StartsWith("Duplicate", StringComparison.Ordinal) || gap.StartsWith("Reviewer returned", StringComparison.Ordinal) || gap.StartsWith("Finding link", StringComparison.Ordinal)).ToList();
            if (entry.Status == "unassessed") gaps.Add("Topic not assessed.");
            if (string.IsNullOrWhiteSpace(entry.Explanation)) gaps.Add("Assessment explanation missing.");
            entry.Citations = entry.Citations.Select(citation => CitationValidator.Validate(citation, review.Snapshot)).ToList();
            if (entry.Citations.Any(citation => citation.Verified != true)) gaps.Add("Coverage citation failed validation.");
            if (entry.Status is "issue" or "no_issue" && entry.Citations.Count == 0) gaps.Add("Documentary support is missing.");
            var linked = entry.FindingIds.Select(id => review.Findings.Find(finding => finding.Id == id)).ToList();
            if (linked.Any(finding => finding == null || finding.Reviewer != (review.Mode == "single" ? "lead" : entry.Reviewer))) gaps.Add("Finding link has wrong ownership or is missing.");
            if (linked.Any(finding => finding?.ValidationWarnings.Count > 0)) gaps.Add("Linked finding has unverified evidence.");
            if (linked.OfType<Finding>().Any(finding => finding.Citations.Concat(finding.ReviewQuestions.SelectMany(question => question.Citations)).Any(citation => CitationValidator.Validate(citation, review.Snapshot).Verified != true))) gaps.Add("Linked finding citation failed validation.");
            if (entry.Status is "issue" or "insufficient" && !linked.Any(finding => finding?.IsActionable() == true)) gaps.Add("Unresolved topic needs an actionable finding.");
            if (entry.Status is "no_issue" or "not_applicable" && linked.Any(finding => finding?.IsActionable() == true && (entry.Scenario == null || finding.Category != "assessment_limit"))) gaps.Add("Assessment conflicts with linked actionable findings.");
            if (entry.Scenario is { } scenario) ValidateScenario(review, entry, scenario, gaps);
            if (!string.IsNullOrEmpty(entry.AuditQuestion) && (string.IsNullOrWhiteSpace(entry.AuditResponse) || !(entry.AuditAddressed ?? entry.AuditResolved ?? false))) gaps.Add("Audit question remains unaddressed.");
            entry.Gaps = gaps.Distinct().ToList();
        }
        review.CoverageStatus = review.CoverageAuditDone && Assigned(review).All(topic => review.Coverage.Count(entry => entry.TopicId == topic.Id) == 1) && review.Coverage.All(entry => entry.Gaps.Count == 0) ? "complete" : "incomplete";
    }

    private static void ValidateScenario(Review review, CoverageRecord entry, ScenarioAssessment scenario, List<string> gaps)
    {
        scenario.Citations = scenario.Citations.Select(citation => CitationValidator.Validate(citation, review.Snapshot)).ToList();
        if (scenario.Citations.Any(citation => citation.Verified != true) || scenario.Status is "issue" or "no_issue" && scenario.Citations.Count == 0) gaps.Add("Scenario evidence is missing or invalid.");
        if (string.IsNullOrWhiteSpace(scenario.Explanation)) gaps.Add("Scenario explanation missing.");
        var substantive = scenario.FindingIds.Select(id => review.Findings.Find(finding => finding.Id == id)).ToList();
        var limits = scenario.LimitationIds.Select(id => review.Findings.Find(finding => finding.Id == id)).ToList();
        var ids = scenario.FindingIds.Concat(scenario.LimitationIds).ToList();
        if (ids.Distinct().Count() != ids.Count || ids.Any(id => !entry.FindingIds.Contains(id)) || entry.FindingIds.Any(id => !ids.Contains(id))) gaps.Add("Scenario links do not partition the topic findings.");
        if (substantive.Any(finding => finding == null || finding.Category == "assessment_limit") || limits.Any(finding => finding == null || finding.Category != "assessment_limit")) gaps.Add("Scenario finding categories conflict.");
        if (scenario.Status == "issue" && !substantive.Any(finding => finding?.IsActionable() == true)) gaps.Add("Scenario issue needs a substantive actionable finding.");
        if (scenario.Status == "insufficient" && !substantive.Concat(limits).Any(finding => finding?.IsActionable() == true)) gaps.Add("Insufficient scenario evidence needs an actionable follow-up.");
        if (scenario.Status is "no_issue" or "not_applicable" && substantive.Any(finding => finding?.IsActionable() == true)) gaps.Add("Scenario outcome conflicts with actionable findings.");
    }
}
