using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Underwriting.Application.Documents;
using Underwriting.Domain;
using Underwriting.Domain.Evidence;
using Underwriting.Domain.Investigations;
using Underwriting.Infrastructure.Documents;
using Underwriting.Infrastructure.Persistence;
using Xunit;

namespace Underwriting.Tests;

public sealed class PdfParityTests
{
    [Theory]
    [InlineData(20, false)]
    [InlineData(21, true)]
    public void PageLimitIsEnforcedAndPagesWithoutTextRemainExplicitlyUnreadable(int count, bool rejected)
    {
        using var builder = new UglyToad.PdfPig.Writer.PdfDocumentBuilder();
        for (var index = 0; index < count; index++) builder.AddPage(612, 792);
        var bytes = builder.Build();
        var extractor = new PdfPigExtractor();
        if (rejected)
        {
            Assert.Contains("20 pages", Assert.Throws<DomainException>(() => extractor.Extract(bytes)).Message);
            return;
        }
        var result = extractor.Extract(bytes);
        Assert.Equal(count, result.Pages.Count);
        Assert.Equal(count, result.Warnings.Count);
        Assert.All(result.Warnings, warning => Assert.Contains("OCR is not supported", warning));
    }

    private sealed record Baseline(string Path, List<string> Pages, List<string> Warnings, CaseDetails Details);
    public static string Root()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (!File.Exists(Path.Combine(directory.FullName, "package.json"))) directory = directory.Parent ?? throw new InvalidOperationException("Project root missing");
        return directory.FullName;
    }

    [Fact]
    public void SeedAndOriginalAndCorrectivePacksPreservePageTextAndExtractedValues()
    {
        var fixtures = StorageJson.Deserialize<List<Baseline>>(File.ReadAllText(Path.Combine(Root(), "tests/fixtures/pdf-baseline.json")));
        var extractor = new PdfPigExtractor();
        foreach (var fixture in fixtures)
        {
            var extracted = extractor.Extract(File.ReadAllBytes(Path.Combine(Root(), fixture.Path)));
            Assert.Equal(fixture.Pages.Count, extracted.Pages.Count);
            for (var page = 0; page < fixture.Pages.Count; page++)
                Assert.True(Normalize(fixture.Pages[page]) == Normalize(extracted.Pages[page]), $"Text differs: {fixture.Path} page {page + 1}");
            var document = new EvidenceDocument { Id = fixture.Path, Title = Path.GetFileName(fixture.Path), Kind = DetailExtractor.InferKind(fixture.Path, extracted.Pages), Pages = extracted.Pages };
            var details = DetailExtractor.Extract([document], 1);
            foreach (var field in fixture.Details.Candidates.Keys)
            {
                Assert.True(fixture.Details.Candidates[field].Select(candidate => candidate.Value).SequenceEqual(details.Candidates[field].Select(candidate => candidate.Value)),
                    $"{fixture.Path} {field}: expected {JsonSerializer.Serialize(fixture.Details.Candidates[field].Select(candidate => candidate.Value))}; actual {JsonSerializer.Serialize(details.Candidates[field].Select(candidate => candidate.Value))}");
                foreach (var candidate in details.Candidates[field]) Assert.True(CitationValidator.Validate(candidate.Citation, new() { Documents = [document] }).Verified);
            }
        }
    }

    [Fact]
    public void EncryptedPdfIsRejected()
    {
        var error = Assert.Throws<DomainException>(() => new PdfPigExtractor().Extract(File.ReadAllBytes(Path.Combine(Root(), "tests/fixtures/encrypted.pdf"))));
        Assert.Contains("encrypted", error.Message, StringComparison.OrdinalIgnoreCase);
    }

    private static string Normalize(string text) => Regex.Replace(text.Normalize(NormalizationForm.FormKC), @"\s+", " ").Trim();
}
