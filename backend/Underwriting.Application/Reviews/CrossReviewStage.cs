using Underwriting.Domain.Evidence;
using Underwriting.Domain.Reviews;

namespace Underwriting.Application.Reviews;

public sealed class CrossReviewStage(ReviewerCatalog catalog, ReviewPrompts prompts, StageExecutor executor, ReviewProgress progress)
{
    public Task ExecuteAsync(string owner, Review review, CancellationToken cancellationToken) =>
        executor.RunAsync<CrossReviewResponse>(owner, review, catalog.Roles.Where(role => review.Findings.Any(finding => finding.Reviewer != role)),
            "Cross-review", "cross", role => prompts.CrossReview(review, role), (role, response) =>
            {
                foreach (var challenge in response.Challenges)
                {
                    if (challenge.Target == role || !review.Findings.Any(finding => finding.Id == challenge.FindingId && finding.Reviewer == challenge.Target))
                        throw new InvalidModelResponseException("Cross-review target must match an existing finding owned by another reviewer.");
                    if (challenge.Citations.Any(citation => CitationValidator.Validate(citation, review.Snapshot).Verified != true))
                        throw new InvalidModelResponseException("Cross-review references do not match the cited source page.");
                }
            }, (role, response) =>
            {
                foreach (var challenge in response.Challenges)
                    progress.Message(owner, review, new() { Reviewer = role, Target = challenge.Target, FindingId = challenge.FindingId, Kind = "challenge", Text = challenge.Text, Citations = challenge.Citations });
            }, cancellationToken);
}
