using System.Text.Json;
using Underwriting.Application.Reviews;
using Underwriting.Domain.Evidence;
using Underwriting.Domain.Reviews;
using Xunit;

namespace Underwriting.Tests;

public sealed class CitationCorrectionTests
{
    [Fact]
    public void RetryIdentifiesNestedRejectedQuotesWithoutAcceptingThem()
    {
        var snapshot = new Snapshot { Documents = [new() { Id = "record", Pages = ["Seller's direction. No funds sent."] }] };
        var invalid = new Citation("record", 1, "Seller’s direction... No funds sent.");
        var valid = new Citation("record", 1, "No funds sent.");
        var response = ReviewPrompts.Serialize(new { findings = new[] { new { reviewQuestions = new[] { new { citations = new[] { invalid, valid } } } } } });
        var feedback = CitationCorrectionFeedback.Build(response, snapshot);
        Assert.Contains("rejectedQuote", feedback);
        Assert.Contains(JsonSerializer.Serialize(invalid.Quote), feedback);
        Assert.DoesNotContain(JsonSerializer.Serialize(valid.Quote), feedback);
        Assert.Contains("separate citations", feedback);
        Assert.False(CitationValidator.Validate(invalid, snapshot).Verified);
    }

    [Theory]
    [InlineData("not json")]
    [InlineData("{\"quote\":null,\"page\":\"wrong\",\"documentId\":17}")]
    [InlineData("{\"citations\":[]}")]
    public void MalformedResponsesDoNotBreakCorrectionHandling(string response)
    {
        Assert.Empty(CitationCorrectionFeedback.Build(response, new()));
    }
}
