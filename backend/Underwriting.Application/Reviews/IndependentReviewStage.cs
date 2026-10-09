using Underwriting.Application.Investigations;
using Underwriting.Domain.Evidence;
using Underwriting.Domain.Reviews;

namespace Underwriting.Application.Reviews;

public sealed class IndependentReviewStage(ReviewerCatalog catalog, CoverageService coverage, ReviewPrompts prompts,
    StageExecutor executor, ReviewProgress progress)
{
    public Task ExecuteAsync(string owner, Review review, CancellationToken cancellationToken)
    {
        if (review.CoverageVersion is null) coverage.Initialize(review);
        var roles = review.Mode == "specialist" ? [review.SelectedReviewer!] : review.Mode == "single" ? ["lead"] : catalog.Roles;
        return executor.RunAsync<SpecialistResponse>(owner, review, roles, "Independent review", "review",
            role => prompts.Independent(review, role), Validate, (role, response) =>
            {
                var findings = response.Findings.Select(finding =>
                {
                    finding.Id = CaseService.NewId();
                    finding.Reviewer = role;
                    return CitationValidator.ValidateFinding(finding, review.Snapshot);
                }).ToList();
                review.Findings.AddRange(findings);
                coverage.Record(review, role, response.Coverage);
                progress.Message(owner, review, new() { Reviewer = role, Text = response.Summary, Citations = findings.SelectMany(finding => finding.Citations).Take(5).ToList() });
            }, cancellationToken);
    }

    public static void Validate(string role, SpecialistResponse response)
    {
        if (response.Findings.Select(finding => finding.IssueCode).Distinct().Count() != response.Findings.Count)
            throw new InvalidModelResponseException($"{role} returned duplicate issue codes.");
        if (response.Findings.Any(finding => finding.Category == "missing_document" && string.IsNullOrWhiteSpace(finding.MissingDocument)))
            throw new InvalidModelResponseException("Missing-document findings must identify the missing document.");
    }
}
