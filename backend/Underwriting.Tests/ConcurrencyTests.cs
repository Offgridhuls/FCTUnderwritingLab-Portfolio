using Underwriting.Application.Reviews;
using Underwriting.Domain.Reviews;
using Underwriting.Infrastructure.Persistence;
using Xunit;

namespace Underwriting.Tests;

public sealed class ConcurrencyTests
{
    [Fact]
    public async Task EvidenceChangeDuringReviewPreservesItsOriginalSnapshot()
    {
        using var fixture = new WorkflowFixture();
        var ids = await fixture.Sessions.InitializeAsync("owner", default);
        var review = fixture.Commands.Start("owner", new(ids.CaseId, ids.BranchId, 1, "revision-start"));
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        fixture.Model.BeforeReply = _ => { entered.TrySetResult(); return release.Task; };
        var task = fixture.Coordinator.ExecuteAsync("owner", review.Id, default);
        await entered.Task.WaitAsync(TimeSpan.FromSeconds(5));
        fixture.Cases.Changed("owner", fixture.Cases.GetBranch("owner", ids.BranchId));
        release.SetResult();
        await task;
        var saved = fixture.Commands.Get("owner", review.Id);
        Assert.Equal("completed", saved.Status);
        Assert.Equal(1, saved.Snapshot.Revision);
        Assert.Equal(2, fixture.Cases.GetBranch("owner", ids.BranchId).Revision);
    }

    [Fact]
    public async Task EvidenceChangeDuringHumanResponseDoesNotApplyStaleAnswer()
    {
        using var fixture = new WorkflowFixture();
        var ids = await fixture.Sessions.InitializeAsync("owner", default);
        var review = fixture.Commands.Start("owner", new(ids.CaseId, ids.BranchId, 1, "human-revision-start"));
        await fixture.Coordinator.ExecuteAsync("owner", review.Id, default);
        var saved = fixture.Commands.Get("owner", review.Id);
        saved.Findings.Add(new() { Id = "test-finding", IssueCode = "TEST", Reviewer = "ownership", Explanation = "Original explanation" });
        fixture.Repository<Review>("review").Save("owner", review.Id, saved);
        var intervention = fixture.Commands.Intervene("owner", new(ids.CaseId, ids.BranchId, 1, "human-revision-question")
        { ReviewId = review.Id, FindingId = "test-finding", Text = "Does the evidence support this?" });
        fixture.Model.BeforeReply = _ =>
        {
            fixture.Cases.Changed("owner", fixture.Cases.GetBranch("owner", ids.BranchId));
            return Task.CompletedTask;
        };
        await fixture.Coordinator.ExecuteAsync("owner", review.Id, default);
        var failed = fixture.Repository<Intervention>("intervention").Get("owner", intervention.Id)!;
        Assert.Equal("failed", failed.State);
        Assert.Contains("revision changed", failed.Error);
        Assert.DoesNotContain(fixture.Commands.Get("owner", review.Id).Exchanges, exchange => exchange.Kind == "human-response");
        Assert.Equal("Original explanation", fixture.Commands.Get("owner", review.Id).Findings.Single().Explanation);
    }

    [Fact]
    public async Task ProcessLimiterNeverAllowsMoreThanSixModelCalls()
    {
        var limiter = new ModelCallLimiter();
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var sixStarted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var executing = 0;
        var maximum = 0;
        var gate = new object();
        var tasks = Enumerable.Range(0, 24).Select(async _ =>
        {
            await limiter.EnterAsync(default);
            lock (gate) { executing++; maximum = Math.Max(maximum, executing); if (executing == 6) sixStarted.TrySetResult(); }
            await release.Task;
            lock (gate) executing--;
            limiter.Exit();
        }).ToArray();
        await sixStarted.Task.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Equal(6, executing);
        release.SetResult();
        await Task.WhenAll(tasks);
        Assert.Equal(6, maximum);
    }

    [Fact]
    public async Task CancellationDuringParallelReviewCannotBeOverwrittenByLateResults()
    {
        using var fixture = new WorkflowFixture();
        var ids = await fixture.Sessions.InitializeAsync("owner", default);
        var review = fixture.Commands.Start("owner", new(ids.CaseId, ids.BranchId, 1, "start-cancel-race"));
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        fixture.Model.BeforeReply = _ => { entered.TrySetResult(); return release.Task; };
        var task = fixture.Coordinator.ExecuteAsync("owner", review.Id, default);
        await entered.Task.WaitAsync(TimeSpan.FromSeconds(5));
        fixture.Commands.Control("owner", review.Id, "cancel", new(ids.CaseId, ids.BranchId, 1, "cancel-race-1"));
        release.SetResult();
        await task;
        Assert.Equal("cancelled", fixture.Commands.Get("owner", review.Id).Status);
        Assert.Empty(fixture.Commands.Get("owner", review.Id).Brief);
    }

    [Fact]
    public async Task SessionDeletionDuringModelWorkDoesNotRecreateRecordsOrEvents()
    {
        using var fixture = new WorkflowFixture();
        var ids = await fixture.Sessions.InitializeAsync("owner", default);
        var review = fixture.Commands.Start("owner", new(ids.CaseId, ids.BranchId, 1, "start-delete-race"));
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        fixture.Model.BeforeReply = _ => { entered.TrySetResult(); return release.Task; };
        var task = fixture.Coordinator.ExecuteAsync("owner", review.Id, default);
        await entered.Task.WaitAsync(TimeSpan.FromSeconds(5));
        fixture.Sessions.Delete("owner");
        release.SetResult();
        await task;
        Assert.Empty(fixture.Repository<Review>("review").List("owner"));
        Assert.Empty(new SqliteEventStore(fixture.Database).ReadAfter("owner", 0));
    }

    [Fact]
    public async Task SimultaneousSameCommandStartsExactlyOneReview()
    {
        using var fixture = new WorkflowFixture();
        var ids = await fixture.Sessions.InitializeAsync("owner", default);
        var request = new StartReviewRequest(ids.CaseId, ids.BranchId, 1, "same-command-race");
        var started = await Task.WhenAll(Enumerable.Range(0, 12).Select(_ => Task.Run(() => fixture.Commands.Start("owner", request))));
        Assert.Single(started.Select(review => review.Id).Distinct());
        Assert.Single(fixture.Commands.List("owner", ids.BranchId));
        Assert.Equal(1, fixture.Queue.WaitingCount);
    }
}
