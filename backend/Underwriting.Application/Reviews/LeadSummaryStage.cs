using Underwriting.Domain.Evidence;
using Underwriting.Domain.Reviews;

namespace Underwriting.Application.Reviews;

public sealed class LeadSummaryStage(ReviewerCatalog catalog, CoverageService coverage, ReviewPrompts prompts, StageExecutor executor, ReviewProgress progress)
{
    public Task ExecuteAsync(string owner, Review review, CancellationToken cancellationToken)
    {
        coverage.Validate(review);
        return executor.RunAsync<LeadResponse>(owner, review, ["lead"], "Lead brief", "lead", _ => prompts.Lead(review),
            (_, response) =>
            {
                if (response.Citations.Any(citation => CitationValidator.Validate(citation, review.Snapshot).Verified != true))
                    throw new InvalidModelResponseException("Lead source references do not match. Previous brief preserved.");
            }, (_, response) =>
            {
                review.Brief = (review.Mode == "specialist" ? $"> Partial scope: {catalog.RoleNames[review.SelectedReviewer!]} only. Other specialist areas not assessed. No peer cross-review.\n\n" : "") + response.Brief;
                progress.Message(owner, review, new() { Reviewer = "lead", Kind = "lead", Text = review.Brief, Citations = response.Citations });
            }, cancellationToken);
    }
}
