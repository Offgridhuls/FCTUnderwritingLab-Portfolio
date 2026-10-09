using Underwriting.Application.Investigations;
using Underwriting.Application.Reviews;
using Underwriting.Domain;
using Underwriting.Domain.Reviews;
using Underwriting.Infrastructure.Reviews;
using Xunit;

namespace Underwriting.Tests;

public sealed class WorkflowTests
{
    [Fact]
    public async Task FullReviewCompletesAllTopicsAndLeadWithoutForcedDisagreement()
    {
        using var fixture = new WorkflowFixture();
        var ids = await fixture.Sessions.InitializeAsync("owner", default);
        var review = fixture.Commands.Start("owner", new(ids.CaseId, ids.BranchId, 1, "start-review-1"));
        await fixture.Coordinator.ExecuteAsync("owner", review.Id, default);
        var saved = fixture.Commands.Get("owner", review.Id);
        Assert.Null(saved.Error);
        Assert.Equal("completed", saved.Status);
        Assert.Equal("complete", saved.CoverageStatus);
        Assert.Equal(19, saved.Coverage.Count);
        Assert.Equal(4, saved.Stage);
        Assert.Single(saved.Exchanges, exchange => exchange.Kind == "lead");
        Assert.DoesNotContain(saved.Exchanges, exchange => exchange.Kind == "challenge");
    }

    [Fact]
    public async Task MissingTopicsGetExactlyOneRecheckAndStayVisible()
    {
        using var fixture = new WorkflowFixture();
        fixture.Model.OmitCoverage = true;
        var ids = await fixture.Sessions.InitializeAsync("owner", default);
        var review = fixture.Commands.Start("owner", new(ids.CaseId, ids.BranchId, 1, "start-review-2"));
        await fixture.Coordinator.ExecuteAsync("owner", review.Id, default);
        var saved = fixture.Commands.Get("owner", review.Id);
        Assert.Equal("completed", saved.Status);
        Assert.Equal("incomplete", saved.CoverageStatus);
        Assert.Equal(6, fixture.Model.Rechecks);
        Assert.All(saved.Coverage, entry => Assert.NotEmpty(entry.Gaps));
    }

    [Fact]
    public async Task FailedReviewerPreservesOtherSpecialistsAndDoesNotInventBrief()
    {
        using var fixture = new WorkflowFixture();
        fixture.Model.FailRole = "identity";
        var ids = await fixture.Sessions.InitializeAsync("owner", default);
        var review = fixture.Commands.Start("owner", new(ids.CaseId, ids.BranchId, 1, "start-review-3"));
        await fixture.Coordinator.ExecuteAsync("owner", review.Id, default);
        var saved = fixture.Commands.Get("owner", review.Id);
        Assert.Equal("failed", saved.Status);
        Assert.Equal(5, saved.Exchanges.Count);
        Assert.Empty(saved.Brief);
        Assert.Equal(6, fixture.Model.Calls); // Transport errors are never retried.
    }

    [Fact]
    public async Task PauseResumesAtBoundaryAndDuplicateStartDoesNotCreateAnotherReview()
    {
        using var fixture = new WorkflowFixture();
        var ids = await fixture.Sessions.InitializeAsync("owner", default);
        var request = new StartReviewRequest(ids.CaseId, ids.BranchId, 1, "start-review-4");
        var review = fixture.Commands.Start("owner", request);
        Assert.Equal(review.Id, fixture.Commands.Start("owner", request).Id);
        fixture.Commands.Control("owner", review.Id, "pause", new(ids.CaseId, ids.BranchId, 1, "pause-review-4"));
        await fixture.Coordinator.ExecuteAsync("owner", review.Id, default);
        Assert.Equal("paused", fixture.Commands.Get("owner", review.Id).Status);
        Assert.Equal(1, fixture.Commands.Get("owner", review.Id).Stage);
        fixture.Commands.Control("owner", review.Id, "resume", new(ids.CaseId, ids.BranchId, 1, "resume-review-4"));
        await fixture.Coordinator.ExecuteAsync("owner", review.Id, default);
        Assert.Equal("completed", fixture.Commands.Get("owner", review.Id).Status);
    }

    [Fact]
    public async Task SaturationRejectsBeforeCreatingReviewAndReleasesUnusedReservation()
    {
        using var fixture = new WorkflowFixture();
        var reservations = Enumerable.Range(0, 20).Select(_ => fixture.Queue.Reserve()).ToList();
        var ids = await fixture.Sessions.InitializeAsync("owner", default);
        var request = new StartReviewRequest(ids.CaseId, ids.BranchId, 1, "start-review-5");
        Assert.Throws<DomainException>(() => fixture.Commands.Start("owner", request));
        Assert.Empty(fixture.Commands.List("owner", ids.BranchId));
        reservations.ForEach(reservation => reservation.Dispose());
        Assert.NotNull(fixture.Commands.Start("owner", request));
    }

    [Fact]
    public async Task SingleSpecialistEndsWithScopedLeadAndOnlyAssignedCoverage()
    {
        using var fixture = new WorkflowFixture();
        var ids = await fixture.Sessions.InitializeAsync("owner", default);
        var review = fixture.Commands.Start("owner", new(ids.CaseId, ids.BranchId, 1, "start-review-6") { Mode = "specialist", SelectedReviewer = "identity" });
        await fixture.Coordinator.ExecuteAsync("owner", review.Id, default);
        var saved = fixture.Commands.Get("owner", review.Id);
        Assert.Equal("completed", saved.Status);
        Assert.All(saved.Coverage, entry => Assert.Equal("identity", entry.Reviewer));
        Assert.Contains("Partial scope", saved.Brief);
    }

    [Fact]
    public async Task InvalidLeadCitationsRetryWithoutProducingACompletedSummary()
    {
        using var fixture = new WorkflowFixture();
        fixture.Model.InvalidLeadCitation = true;
        var ids = await fixture.Sessions.InitializeAsync("owner", default);
        var review = fixture.Commands.Start("owner", new(ids.CaseId, ids.BranchId, 1, "start-review-7") { Mode = "specialist", SelectedReviewer = "identity" });
        await fixture.Coordinator.ExecuteAsync("owner", review.Id, default);
        var saved = fixture.Commands.Get("owner", review.Id);
        Assert.Equal("failed", saved.Status);
        Assert.Empty(saved.Brief);
        Assert.Equal(5, fixture.Model.Calls);
    }

    [Fact]
    public async Task RestartMarksWorkInterruptedWithoutModelCalls()
    {
        using var fixture = new WorkflowFixture();
        var ids = await fixture.Sessions.InitializeAsync("owner", default);
        var review = fixture.Commands.Start("owner", new(ids.CaseId, ids.BranchId, 1, "start-review-8"));
        new ReviewRecovery(fixture.Database).Recover();
        Assert.Equal("interrupted", fixture.Commands.Get("owner", review.Id).Status);
        Assert.Equal(0, fixture.Model.Calls);
    }
}
