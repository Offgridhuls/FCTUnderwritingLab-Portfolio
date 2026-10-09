namespace Underwriting.Application.Abstractions;

public interface IReviewQueue
{
    /// <summary>Reserves capacity before a review record is created; disposal releases an unused reservation.</summary>
    IReviewReservation Reserve();
    void Cancel(string owner, string reviewId);
}

public interface IReviewReservation : IDisposable
{
    void Enqueue(string owner, string reviewId);
}
