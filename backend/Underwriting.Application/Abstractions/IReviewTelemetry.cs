namespace Underwriting.Application.Abstractions;

public interface IReviewTelemetry
{
    void StageCompleted(string reviewId, string stage, TimeSpan elapsed);
}
