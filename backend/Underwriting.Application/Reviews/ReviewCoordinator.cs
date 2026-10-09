using Underwriting.Application.Abstractions;
using Underwriting.Application.Investigations;
using Underwriting.Domain.Investigations;
using Underwriting.Domain.Reviews;

namespace Underwriting.Application.Reviews;

public sealed record ReviewHistory(string ReviewId, string At, Review Review);

/// <summary>Owns each review's mutable state. Stage handlers return at explicit pause boundaries.</summary>
public sealed class ReviewCoordinator(IRepository<Review> reviews, IRepository<Branch> branches,
    IRepository<Intervention> interventions, IRepository<ReviewHistory> history, ReviewProgress progress,
    IndependentReviewStage independent, CoverageAuditStage audit, CrossReviewStage cross,
    FindingResponseStage responses, LeadSummaryStage lead, IReviewTelemetry telemetry)
{
    private static readonly string[] StageNames = ["Independent review", "Cross-review", "Responses", "Lead brief"];

    public async Task ExecuteAsync(string owner, string reviewId, CancellationToken cancellationToken)
    {
        var review = reviews.Get(owner, reviewId);
        if (review is null || review.Status is not ("running" or "paused" or "completed")) return;
        try
        {
            if (review.Status != "running") { await DrainAsync(owner, review, cancellationToken); return; }
            while (review.Stage < 4)
            {
                progress.EnsureActive(owner, review, cancellationToken);
                review.StageName = StageNames[review.Stage];
                progress.Save(owner, review);
                progress.Emit(owner, review, "stage.started", new { stage = review.StageName });
                var timing = System.Diagnostics.Stopwatch.StartNew();
                switch (review.Stage)
                {
                    case 0:
                        await independent.ExecuteAsync(owner, review, cancellationToken);
                        await audit.ExecuteAsync(owner, review, cancellationToken);
                        break;
                    case 1 when review.Mode == "cross": await cross.ExecuteAsync(owner, review, cancellationToken); break;
                    case 2 when review.Mode == "cross": await responses.ExecutePeersAsync(owner, review, cancellationToken); break;
                    case 3: await lead.ExecuteAsync(owner, review, cancellationToken); break;
                }
                progress.EnsureActive(owner, review, cancellationToken);
                telemetry.StageCompleted(review.Id, review.StageName, timing.Elapsed);
                review.Stage = review.Stage == 0 && review.Mode == "specialist" ? 3 : review.Stage + 1;
                progress.Save(owner, review);
                progress.Emit(owner, review, "stage.completed", new { stage = review.StageName });
                if (Queued(owner, review.Id).Count > 0)
                {
                    review.Status = "paused";
                    review.PauseRequested = true;
                    progress.Save(owner, review);
                    progress.Emit(owner, review, "review.paused", new { reason = "Human intervention at completed stage boundary" });
                    await DrainAsync(owner, review, cancellationToken);
                    return;
                }
                if (review.PauseRequested && review.Stage < 4)
                {
                    review.Status = "paused";
                    progress.Save(owner, review);
                    progress.Emit(owner, review, "review.paused");
                    return;
                }
            }
            review.Status = "completed";
            review.StageName = review.Mode == "specialist" ? "Specialist review complete" : "Review complete";
            review.CompletedAt = progress.Now();
            review.DurationMs = (DateTimeOffset.Parse(review.CompletedAt) - DateTimeOffset.Parse(review.CreatedAt)).TotalMilliseconds;
            progress.Save(owner, review);
            progress.Emit(owner, review, "review.completed");
            await DrainAsync(owner, review, cancellationToken);
        }
        catch (Exception exception)
        {
            var saved = reviews.Get(owner, review.Id);
            if (saved is null || saved.Status == "cancelled") return;
            review.Status = cancellationToken.IsCancellationRequested ? "interrupted" : "failed";
            review.Error = cancellationToken.IsCancellationRequested ? "Server stopped during review. Start a new review; partial evidence and messages are preserved." : exception.Message;
            foreach (var activity in review.Activities.Where(activity => activity.State == "running")) activity.State = "interrupted";
            if (progress.Save(owner, review)) progress.Emit(owner, review, $"review.{review.Status}", new { message = review.Error });
            foreach (var intervention in Queued(owner, review.Id))
            {
                intervention.State = "failed";
                intervention.Error = "Review failed before intervention could be processed.";
                interventions.Save(owner, intervention.Id, intervention);
            }
        }
    }

    private List<Intervention> Queued(string owner, string reviewId) => interventions.List(owner)
        .Where(intervention => intervention.ReviewId == reviewId && intervention.State == "queued").OrderBy(intervention => intervention.CreatedAt).ToList();

    private async Task DrainAsync(string owner, Review review, CancellationToken cancellationToken)
    {
        while (Queued(owner, review.Id).FirstOrDefault() is { } intervention)
        {
            progress.EnsureActive(owner, review, cancellationToken);
            intervention.State = "processing";
            interventions.Save(owner, intervention.Id, intervention);
            progress.Emit(owner, review, "intervention.processing", new { interventionId = intervention.Id }, findingId: intervention.FindingId);
            try
            {
                if (branches.Get(owner, review.BranchId)?.Revision != intervention.Revision || review.Revision != intervention.Revision)
                    throw new InvalidOperationException("Case revision changed. Run a full review of current evidence before intervening.");
                history.Save(owner, CaseService.NewId(), new(review.Id, progress.Now(), review));
                var response = await responses.ExecuteHumanAsync(owner, review, intervention, cancellationToken);
                progress.EnsureActive(owner, review, cancellationToken);
                await lead.ExecuteAsync(owner, review, cancellationToken);
                progress.EnsureActive(owner, review, cancellationToken);
                intervention.Response = response.Explanation;
                intervention.Disposition = response.Disposition;
                intervention.State = "completed";
                progress.Save(owner, review);
            }
            catch (Exception exception)
            {
                intervention.State = "failed";
                intervention.Error = exception.Message;
                review.NeedsRerun = true;
                review.Error = $"Intervention or lead update incomplete: {exception.Message}";
                progress.Save(owner, review);
            }
            if (reviews.Get(owner, review.Id) is not { Status: not "cancelled" }) return;
            interventions.Save(owner, intervention.Id, intervention);
            progress.Emit(owner, review, $"intervention.{intervention.State}", new { intervention }, findingId: intervention.FindingId);
            cancellationToken.ThrowIfCancellationRequested();
        }
    }
}
