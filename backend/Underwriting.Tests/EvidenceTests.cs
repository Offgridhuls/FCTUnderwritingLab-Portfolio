using Underwriting.Application.Documents;
using Underwriting.Domain;
using Underwriting.Domain.Evidence;
using Underwriting.Domain.Reviews;
using Underwriting.Infrastructure.Documents;
using Xunit;

namespace Underwriting.Tests;

public sealed class EvidenceTests
{
    [Fact]
    public void CitationRequiresTheRightDocumentPageAndNormalizedQuotation()
    {
        var snapshot = new Snapshot { Documents = [new() { Id = "payout", Pages = ["Valid through:  2026-10-12", "Amount: 100"] }] };
        Assert.True(CitationValidator.Validate(new("payout", 1, "Valid through: 2026-10-12"), snapshot).Verified);
        Assert.False(CitationValidator.Validate(new("payout", 2, "Valid through: 2026-10-12"), snapshot).Verified);
        Assert.False(CitationValidator.Validate(new("other", 1, "Valid through: 2026-10-12"), snapshot).Verified);
    }

    [Fact]
    public void HumanFollowupCannotBeHiddenBehindAClearFinding()
    {
        var finding = new Finding { Status = "resolved", Severity = "clear", RequiresHumanReview = true };
        CitationValidator.ValidateFinding(finding, new());
        Assert.Equal("open", finding.Status);
        Assert.Equal("attention", finding.Severity);
        Assert.True(finding.IsActionable());
        Assert.NotEmpty(finding.ValidationWarnings);
    }

    [Fact]
    public void DetailExtractionKeepsConflictingSourcesAndDoesNotGuessBuyerFromSellerPayout()
    {
        var details = DetailExtractor.Extract([
            new() { Id = "agreement", Kind = "agreement", Pages = ["Seller: Morgan. Purchase price: $700,000. Closing date: 2026-10-15"] },
            new() { Id = "draft", Pages = ["Seller: Alex."] },
            new() { Id = "payout", Kind = "payout", Pages = ["Borrower: Morgan."] }
        ], 1);
        Assert.Equal(2, details.Candidates["seller"].Count);
        Assert.Empty(details.Candidates["buyer"]);
        Assert.Equal("700000", details.Candidates["purchasePrice"].Single().Value);
        Assert.False(details.Confirmed);
    }

    [Fact]
    public void PayoutComparisonUsesTheUpdatedStatementAndUnknownAmountsRemainUnknown()
    {
        var snapshot = new Snapshot
        {
            ClosingDate = "2026-10-15",
            Details = new(),
            Documents = [
            new() { Id = "old", Kind = "payout", Pages = ["Valid through: 2026-10-12"] },
            new() { Id = "new", Kind = "payout-update", Pages = ["Valid through: 2026-10-20"] }
        ]
        };
        var checks = DeterministicChecks.Evaluate(snapshot);
        Assert.False(checks.PayoutExpiresBeforeClosing);
        Assert.Equal("new", checks.PayoutDocumentId);
        Assert.Null(checks.LoanExceedsPurchase);
        Assert.Null(checks.PurchasePrice);
    }

    [Fact]
    public void InvalidAndOversizePdfsAreRejected()
    {
        var extractor = new PdfPigExtractor();
        Assert.Throws<DomainException>(() => extractor.Extract([1, 2, 3]));
        Assert.Equal("too_large", Assert.Throws<DomainException>(() => extractor.Extract(new byte[10 * 1024 * 1024 + 1])).Code);
    }
}
