using Underwriting.Application.Comparison;
using Underwriting.Domain.Evidence;
using Underwriting.Domain.Investigations;
using Underwriting.Domain.Reviews;
using Xunit;

namespace Underwriting.Tests;

public sealed class ComparisonTests
{
    [Theory]
    [InlineData("no_issue", "addressed")]
    [InlineData("not_applicable", "unchanged")]
    [InlineData("issue", "action")]
    public void OutcomesUseTopicsRatherThanRenamedFindingCodes(string afterStatus, string expected)
    {
        using var fixture = new WorkflowFixture();
        var (before, after) = Prepare(fixture);
        SetIssue(before, "OLD_CODE");
        if (afterStatus == "issue") SetIssue(after, "RENAMED_CODE");
        else { after.Coverage[0].Status = afterStatus; after.Coverage[0].Scenario!.Status = afterStatus; }
        Save(fixture, before, after);
        var result = Service(fixture).Compare("owner", "before", "after");
        Assert.Equal(expected, result.Topics[0].Outcome);
    }

    [Fact]
    public void ResolvedSubstantiveIssueCanRetainSeparateHumanVerificationWork()
    {
        using var fixture = new WorkflowFixture();
        var (before, after) = Prepare(fixture);
        SetIssue(before, "AUTHORITY");
        var limit = new Finding { Id = "limit", Reviewer = before.Coverage[0].Reviewer, Category = "assessment_limit", RequiresHumanReview = true, Citations = [Citation] };
        after.Findings.Add(limit);
        after.Coverage[0].FindingIds.Add(limit.Id);
        after.Coverage[0].Scenario!.LimitationIds.Add(limit.Id);
        Save(fixture, before, after);
        var topic = Service(fixture).Compare("owner", "before", "after").Topics[0];
        Assert.Equal("addressed", topic.Outcome);
        Assert.Single(topic.After.Limitations);
        Assert.True(topic.After.Limitations[0].IsActionable());
    }

    [Fact]
    public void MissingAssessmentCannotResolveAnEarlierIssueOrHideOtherReliableTopics()
    {
        using var fixture = new WorkflowFixture();
        var (before, after) = Prepare(fixture);
        SetIssue(before, "AUTHORITY");
        after.Coverage.RemoveAt(0);
        Save(fixture, before, after);
        var result = Service(fixture).Compare("owner", "before", "after");
        Assert.Equal("uncertain", result.Topics[0].Outcome);
        Assert.Equal("unchanged", result.Topics[1].Outcome);
    }

    [Fact]
    public void HistoricalFixtureIsNeverRewrittenOrMatchedByWording()
    {
        using var fixture = new WorkflowFixture();
        using var document = System.Text.Json.JsonDocument.Parse(File.ReadAllText(Path.Combine(PdfParityTests.Root(), "tests/fixtures/saved-branch-comparison.json")));
        var branches = Underwriting.Infrastructure.Persistence.StorageJson.Deserialize<List<Branch>>(document.RootElement.GetProperty("branches").GetRawText());
        var reviews = Underwriting.Infrastructure.Persistence.StorageJson.Deserialize<List<Review>>(document.RootElement.GetProperty("reviews").GetRawText());
        fixture.Repository<CaseRecord>("case").Save("owner", branches[0].CaseId, new() { Id = branches[0].CaseId });
        foreach (var branch in branches) fixture.Repository<Branch>("branch").Save("owner", branch.Id, branch);
        foreach (var review in reviews) fixture.Repository<Review>("review").Save("owner", review.Id, review);
        var before = fixture.Repository<Review>("review").List("owner").Select(Underwriting.Infrastructure.Persistence.StorageJson.Serialize).ToList();
        var result = Service(fixture).Compare("owner", branches[0].Id, branches[1].Id);
        Assert.Equal(19, result.Topics.Count);
        Assert.Equal(before, fixture.Repository<Review>("review").List("owner").Select(Underwriting.Infrastructure.Persistence.StorageJson.Serialize));
    }

    private static readonly Citation Citation = new("document", 1, "Supported fixture evidence.", true);
    private static ComparisonService Service(WorkflowFixture fixture) => new(fixture.Cases, fixture.Repository<Review>("review"), fixture.Repository<Intervention>("intervention"), fixture.Catalog, fixture.Coverage);
    private static (Review Before, Review After) Prepare(WorkflowFixture fixture)
    {
        fixture.Repository<CaseRecord>("case").Save("owner", "case", new() { Id = "case" });
        Review Make(string id)
        {
            fixture.Repository<Branch>("branch").Save("owner", id, new() { Id = id, CaseId = "case" });
            var review = new Review { Id = id + "-review", BranchId = id, CaseId = "case", Revision = 1, Status = "completed", CreatedAt = "2026-10-09T00:00:00Z", Snapshot = new() { Documents = [new() { Id = "document", Pages = [Citation.Quote] }] } };
            fixture.Coverage.Initialize(review);
            review.CoverageAuditDone = true;
            foreach (var entry in review.Coverage)
            {
                entry.Status = "no_issue";
                entry.Explanation = "Supported fixture assessment.";
                entry.Citations = [Citation];
                entry.Scenario = new() { Status = "no_issue", Explanation = entry.Explanation, Citations = [Citation] };
            }
            return review;
        }
        return (Make("before"), Make("after"));
    }
    private static void SetIssue(Review review, string code)
    {
        var entry = review.Coverage[0];
        var finding = new Finding { Id = code, IssueCode = code, Reviewer = entry.Reviewer, Category = "issue", Citations = [Citation] };
        review.Findings.Add(finding);
        entry.Status = entry.Scenario!.Status = "issue";
        entry.FindingIds = entry.Scenario.FindingIds = [finding.Id];
    }
    private static void Save(WorkflowFixture fixture, params Review[] reviews)
    {
        foreach (var review in reviews) fixture.Repository<Review>("review").Save("owner", review.Id, review);
    }
}
