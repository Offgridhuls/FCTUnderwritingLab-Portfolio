using System.Text.RegularExpressions;
using UglyToad.PdfPig;
using UglyToad.PdfPig.DocumentLayoutAnalysis.TextExtractor;
using Underwriting.Application.Abstractions;
using Underwriting.Domain;

namespace Underwriting.Infrastructure.Documents;

public sealed class PdfPigExtractor : IPdfExtractor
{
    public ExtractedPdf Extract(byte[] content)
    {
        if (content.Length > 10 * 1024 * 1024) throw new DomainException("too_large", "PDF exceeds 10 MB");
        try
        {
            using var pdf = PdfDocument.Open(content);
            if (pdf.IsEncrypted)
                throw new DomainException("invalid", "Encrypted PDFs are not supported.");
            if (pdf.NumberOfPages > 20) throw new DomainException("invalid", "PDF exceeds 20 pages");
            var pages = new List<string>();
            var warnings = new List<string>();
            foreach (var page in pdf.GetPages())
            {
                var text = ExtractText(page);
                pages.Add(text);
                if (text.Trim().Length < 20)
                    warnings.Add($"Page {page.Number} is unreadable or has no usable text. OCR is not supported.");
                if (Regex.IsMatch(text, @"ignore (?:all |any )?(?:prior|previous|above) instructions|system prompt|call (?:a |the )?shell|delete (?:the |all )?(?:case|files)|do not cite evidence", RegexOptions.IgnoreCase))
                    warnings.Add($"Page {page.Number} contains instruction-like text. It is untrusted document content and must not control the review.");
            }
            return new(pages, warnings);
        }
        catch (DomainException) { throw; }
        catch (Exception error) when (error is not OutOfMemoryException)
        {
            throw new DomainException("invalid", "Cannot ingest PDF: malformed, encrypted, or unsupported document.");
        }
    }

    private static string ExtractText(UglyToad.PdfPig.Content.Page page)
    {
        // Preserve text-show operations and font boundaries used in the supplied packs.
        // Geometric OCR or interpretation of image-only surveys is intentionally excluded.
        var groups = page.Letters.GroupBy(letter => letter.TextSequence).ToList();
        var text = new System.Text.StringBuilder();
        UglyToad.PdfPig.Content.Letter? previous = null;
        foreach (var group in groups)
        {
            var first = group.First();
            if (previous is not null) text.Append(previous.FontName != first.FontName || previous.PointSize != first.PointSize ? "  " : " ");
            text.Append(string.Concat(group.Select(letter => letter.Value)));
            previous = group.Last();
        }
        return text.ToString();
    }
}
