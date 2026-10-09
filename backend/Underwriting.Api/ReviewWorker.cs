using Underwriting.Application.Abstractions;
using Underwriting.Application.Reviews;
using Underwriting.Domain.Reviews;
using Underwriting.Infrastructure.Reviews;

namespace Underwriting.Api;

public sealed class ReviewWorker(ReviewJobQueue queue, ReviewCoordinator coordinator, ReviewProgress progress, IRepository<Review> reviews,
    IRepository<Intervention> interventions, ILogger<ReviewWorker> logger) : BackgroundService
{
    protected override Task ExecuteAsync(CancellationToken stoppingToken) => Task.WhenAll(ConsumeAsync(stoppingToken), ConsumeAsync(stoppingToken));

    private async Task ConsumeAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            ReviewJob job;
            try { job = await queue.TakeAsync(stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
            var started = System.Diagnostics.Stopwatch.StartNew();
            logger.LogInformation("Review {ReviewId} started; {QueueDepth} waiting", job.ReviewId, queue.WaitingCount);
            try { await coordinator.ExecuteAsync(job.Owner, job.ReviewId, queue.Begin(job, stoppingToken)); }
            catch (Exception exception) { logger.LogError("Review {ReviewId} worker failed: {ErrorType}", job.ReviewId, exception.GetType().Name); }
            finally { queue.Complete(job); }
            logger.LogInformation("Review {ReviewId} worker finished in {DurationMs} ms", job.ReviewId, started.ElapsedMilliseconds);
            // Close the handoff race: commands may arrive after the coordinator's final queue check.
            var saved = reviews.Get(job.Owner, job.ReviewId);
            if (!stoppingToken.IsCancellationRequested && (saved?.Status == "running" ||
                saved is { Status: "paused" or "completed" } && interventions.List(job.Owner).Any(item => item.ReviewId == job.ReviewId && item.State == "queued")))
            {
                try { using var reservation = queue.Reserve(); reservation.Enqueue(job.Owner, job.ReviewId); }
                catch (Underwriting.Domain.DomainException)
                {
                    // A resume may race the final handoff while other jobs fill the queue.
                    // Leave it explicitly paused and retryable, never "running" with no worker.
                    if (saved?.Status == "running")
                    {
                        saved.Status = "paused";
                        saved.PauseRequested = true;
                        saved.StageName = "Queue full — resume when capacity is available";
                        if (progress.Save(job.Owner, saved)) progress.Emit(job.Owner, saved, "review.paused");
                    }
                    foreach (var item in interventions.List(job.Owner).Where(item => item.ReviewId == job.ReviewId && item.State == "queued"))
                    {
                        item.State = "failed";
                        item.Error = "The review queue is full. Submit the intervention again.";
                        interventions.Save(job.Owner, item.Id, item);
                    }
                }
            }
        }
    }
}
