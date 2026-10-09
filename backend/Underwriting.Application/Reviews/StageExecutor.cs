using System.Threading.Channels;
using Underwriting.Domain.Reviews;

namespace Underwriting.Application.Reviews;

/// <summary>Collects concurrent results on one coordinator continuation, preserving successful partial output.</summary>
public sealed class StageExecutor(ModelReviewer reviewer, ReviewProgress progress)
{
    public async Task RunAsync<T>(string owner, Review review, IEnumerable<string> roles, string label, string schema,
        Func<string, string> task, Action<string, T>? validate, Action<string, T> accept, CancellationToken cancellationToken)
    {
        var signals = Channel.CreateUnbounded<(ReviewerActivity Activity, ModelCallProgress Signal)>();
        var pending = roles.Select(role =>
        {
            var activity = progress.Start(owner, review, role, label);
            var completion = reviewer.AskAsync<T>(review, role, task(role), schema, value => validate?.Invoke(role, value), cancellationToken,
                signal => signals.Writer.TryWrite((activity, signal)));
            return (Role: role, Activity: activity, Completion: completion);
        }).ToList();
        Exception? failure = null;
        while (pending.Count > 0)
        {
            var signalReady = signals.Reader.WaitToReadAsync().AsTask();
            await Task.WhenAny(pending.Select(item => (Task)item.Completion).Append(signalReady));
            while (signals.Reader.TryRead(out var update))
            {
                update.Activity.Attempt = update.Signal.Attempt;
                if (update.Signal.Usage is { } usage) review.Usage.Add(usage);
                if (update.Signal.State == "retrying")
                {
                    update.Activity.Label = $"{label} · retry {update.Signal.Attempt}";
                    progress.Emit(owner, review, "reviewer.retrying", new { activity = update.Activity, reason = "Response validation", message = update.Signal.Message }, update.Activity.Reviewer);
                }
                progress.Save(owner, review);
            }
            var completed = pending.Select(item => item.Completion).FirstOrDefault(task => task.IsCompleted);
            if (completed is null) continue;
            var item = pending.Single(item => item.Completion == completed);
            pending.Remove(item);
            try
            {
                var result = await completed;
                progress.EnsureActive(owner, review, cancellationToken);
                accept(item.Role, result.Value);
                item.Activity.Label = label;
                progress.Finish(owner, review, item.Activity, true, result.Attempts);
            }
            catch (Exception exception)
            {
                failure ??= exception;
                progress.Finish(owner, review, item.Activity, false);
            }
        }
        if (failure is not null) System.Runtime.ExceptionServices.ExceptionDispatchInfo.Capture(failure).Throw();
    }
}
