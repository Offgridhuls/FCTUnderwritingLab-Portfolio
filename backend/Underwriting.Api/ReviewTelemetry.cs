using Underwriting.Application.Abstractions;

namespace Underwriting.Api;

public sealed class ReviewTelemetry(ILogger<ReviewTelemetry> logger) : IReviewTelemetry
{
    public void StageCompleted(string reviewId, string stage, TimeSpan elapsed) =>
        logger.LogInformation("Review {ReviewId} finished stage {Stage} in {DurationMs} ms", reviewId, stage, elapsed.TotalMilliseconds);
}
