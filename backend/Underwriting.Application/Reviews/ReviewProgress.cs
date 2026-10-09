using System.Text.Json;
using Underwriting.Application.Abstractions;
using Underwriting.Application.Investigations;
using Underwriting.Domain.Evidence;
using Underwriting.Domain.Investigations;
using Underwriting.Domain.Reviews;

namespace Underwriting.Application.Reviews;

/// <summary>Called only by the coordinator; parallel model calls do not mutate saved review state.</summary>
public sealed class ReviewProgress(IRepository<Review> reviews, IRepository<CaseRecord> cases, IEventStore events, TimeProvider clock)
{
    public string Now() => clock.GetUtcNow().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'");

    public void EnsureActive(string owner, Review review, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var saved = reviews.Get(owner, review.Id);
        if (saved is null || saved.Status is "cancelled" or "interrupted" or "failed" || cases.Get(owner, review.CaseId) is null)
            throw new OperationCanceledException("Review cancelled or interrupted.", cancellationToken);
        review.PauseRequested = saved.PauseRequested;
    }

    public bool Save(string owner, Review review)
    {
        return reviews.SaveIf(owner, review.Id, review, saved =>
        {
            if (cases.Get(owner, review.CaseId) is null || saved.Status == "cancelled") return false;
            if (saved.PauseRequested && review.Status == "running") review.PauseRequested = true;
            return true;
        });
    }

    public void Emit(string owner, Review review, string type, object? data = null, string? reviewer = null, string? findingId = null)
    {
        events.Append(new(0, owner, review.CaseId, review.BranchId, review.Revision, type,
            JsonSerializer.SerializeToElement(data ?? new { }, new JsonSerializerOptions(JsonSerializerDefaults.Web)), Now(), review.Id, reviewer, findingId));
    }

    public ReviewerActivity Start(string owner, Review review, string reviewer, string label)
    {
        var activity = new ReviewerActivity { Id = CaseService.NewId(), Reviewer = reviewer, Stage = review.Stage, Label = label, StartedAt = Now() };
        review.Activities.Add(activity);
        Save(owner, review);
        Emit(owner, review, "reviewer.started", new { stage = label }, reviewer);
        return activity;
    }

    public void Finish(string owner, Review review, ReviewerActivity activity, bool success, int? attempts = null)
    {
        activity.State = success ? "completed" : "failed";
        activity.CompletedAt = Now();
        activity.Attempt = attempts;
        Save(owner, review);
        Emit(owner, review, "reviewer.progress", new { activity }, activity.Reviewer);
    }

    public void Message(string owner, Review review, Exchange exchange)
    {
        exchange.Id = CaseService.NewId();
        exchange.Citations = exchange.Citations.Select(citation => CitationValidator.Validate(citation, review.Snapshot)).ToList();
        review.Exchanges.Add(exchange);
        Save(owner, review);
        Emit(owner, review, "reviewer.completed", new { exchange }, exchange.Reviewer, exchange.FindingId);
    }
}
