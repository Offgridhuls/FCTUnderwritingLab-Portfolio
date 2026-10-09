using System.Text.Json;
using Underwriting.Application.Investigations;
using Underwriting.Domain.Evidence;
using Underwriting.Domain.Reviews;

namespace Underwriting.Application.Reviews;

public sealed class CoverageAuditStage(CoverageService coverage, ReviewPrompts prompts, StageExecutor executor, ReviewProgress progress)
{
    public async Task ExecuteAsync(string owner, Review review, CancellationToken cancellationToken)
    {
        await executor.RunAsync<AuditResponse>(owner, review, ["lead"], "Coverage check", "audit", _ => prompts.Audit(review),
            (_, response) =>
            {
                if (response.Questions.Any(question => review.Coverage.All(entry => entry.TopicId != question.TopicId)))
                    throw new InvalidModelResponseException("Coverage audit returned a topic outside the assigned scope.");
            }, (_, response) =>
            {
                foreach (var question in response.Questions)
                {
                    var entry = review.Coverage.Single(entry => entry.TopicId == question.TopicId);
                    var citations = question.Citations.Select(citation => CitationValidator.Validate(citation, review.Snapshot)).ToList();
                    entry.AuditQuestion = string.Join('\n', new[] { entry.AuditQuestion, question.Text }.Where(value => !string.IsNullOrEmpty(value)));
                    entry.AuditAddressed = null;
                    entry.AuditResolved = false;
                    entry.AuditResponse = null;
                    if (citations.Any(citation => citation.Verified != true)) entry.AuditQuestion += " Audit source references failed validation; independently recheck this topic.";
                    progress.Message(owner, review, new() { Reviewer = "lead", Target = review.Mode == "single" ? "lead" : entry.Reviewer, Kind = "coverage-check", Text = question.Text, Citations = citations });
                }
            }, cancellationToken);
        review.CoverageAuditDone = true;
        coverage.Validate(review);
        progress.Save(owner, review);
        var affected = review.Coverage.Where(entry => entry.Gaps.Count > 0).Select(entry => review.Mode == "single" ? "lead" : entry.Reviewer).Distinct().ToList();
        foreach (var role in affected)
        {
            if (review.CoverageRechecked.Contains(role)) continue;
            review.CoverageRechecked.Add(role);
            var previous = review.Findings.Where(finding => finding.Reviewer == role).ToList();
            var ownCoverage = review.Coverage.Where(entry => role == "lead" || entry.Reviewer == role).ToList();
            review.CoverageHistory.Add(new(role, Clone(previous), Clone(ownCoverage), progress.Now()));
            progress.Save(owner, review);
            await executor.RunAsync<SpecialistResponse>(owner, review, [role], "Specialist recheck", "review", _ => prompts.Recheck(review, role),
                (_, response) =>
                {
                    IndependentReviewStage.Validate(role, response);
                    var warnings = response.Findings.SelectMany(finding => CitationValidator.ValidateFinding(finding, review.Snapshot).ValidationWarnings).ToList();
                    if (warnings.Count > 0) throw new InvalidModelResponseException(string.Join(' ', warnings.Take(8)) + " Original findings preserved.");
                }, (_, response) =>
                {
                    foreach (var finding in response.Findings)
                    {
                        finding.Id = previous.Find(item => item.IssueCode == finding.IssueCode)?.Id ?? CaseService.NewId();
                        finding.Reviewer = role;
                    }
                    var codes = response.Findings.Select(finding => finding.IssueCode).ToHashSet();
                    review.Findings = review.Findings.Where(finding => finding.Reviewer != role).Concat(previous.Where(finding => !codes.Contains(finding.IssueCode))).Concat(response.Findings).ToList();
                    coverage.Record(review, role, response.Coverage);
                    progress.Message(owner, review, new() { Reviewer = role, Kind = "coverage-recheck", Text = response.Summary, Citations = response.Findings.SelectMany(finding => finding.Citations).Take(8).ToList() });
                }, cancellationToken);
        }
        coverage.Validate(review);
        progress.Save(owner, review);
        progress.Emit(owner, review, "coverage.completed", new { status = review.CoverageStatus, coverage = review.Coverage });
    }

    private static T Clone<T>(T value) => JsonSerializer.Deserialize<T>(JsonSerializer.Serialize(value))!;
}
