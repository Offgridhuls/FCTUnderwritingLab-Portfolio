using System.Threading.Channels;
using Underwriting.Application.Abstractions;
using Underwriting.Domain;

namespace Underwriting.Infrastructure.Reviews;

public sealed record ReviewJob(string Owner, string ReviewId);

/// <summary>Twenty waiting reservations, consumed by two hosted workers. One job owns a review at a time.</summary>
public sealed class ReviewJobQueue : IReviewQueue
{
    private readonly object gate = new();
    private readonly SemaphoreSlim waiting = new(20, 20);
    private readonly Channel<ReviewJob> jobs = Channel.CreateBounded<ReviewJob>(new BoundedChannelOptions(20)
    {
        SingleWriter = false,
        SingleReader = false,
        FullMode = BoundedChannelFullMode.Wait
    });
    private readonly Dictionary<ReviewJob, CancellationTokenSource?> scheduled = [];
    public int WaitingCount => 20 - waiting.CurrentCount;

    public IReviewReservation Reserve()
    {
        if (!waiting.Wait(0)) throw new DomainException("busy", "The review queue is full. Retry when a waiting review starts.");
        return new Reservation(this);
    }

    private sealed class Reservation(ReviewJobQueue queue) : IReviewReservation
    {
        private int consumed;
        public void Enqueue(string owner, string reviewId)
        {
            if (Interlocked.Exchange(ref consumed, 1) != 0) throw new InvalidOperationException("Reservation already consumed.");
            lock (queue.gate)
            {
                var job = new ReviewJob(owner, reviewId);
                if (queue.scheduled.ContainsKey(job)) { queue.waiting.Release(); return; }
                queue.scheduled.Add(job, null);
                if (!queue.jobs.Writer.TryWrite(job))
                {
                    queue.scheduled.Remove(job);
                    queue.waiting.Release();
                    throw new InvalidOperationException("Review worker is stopping.");
                }
            }
        }
        public void Dispose() { if (Interlocked.Exchange(ref consumed, 1) == 0) queue.waiting.Release(); }
    }

    public async Task<ReviewJob> TakeAsync(CancellationToken cancellationToken)
    {
        var job = await jobs.Reader.ReadAsync(cancellationToken);
        waiting.Release();
        return job;
    }

    public CancellationToken Begin(ReviewJob job, CancellationToken shutdown)
    {
        lock (gate)
        {
            var source = CancellationTokenSource.CreateLinkedTokenSource(shutdown);
            scheduled[job] = source;
            return source.Token;
        }
    }

    public void Complete(ReviewJob job)
    {
        lock (gate)
            if (scheduled.Remove(job, out var source)) source?.Dispose();
    }

    public void Cancel(string owner, string reviewId)
    {
        lock (gate)
            if (scheduled.TryGetValue(new(owner, reviewId), out var source)) source?.Cancel();
    }
}
