using System.Text;
using System.Text.RegularExpressions;
using Underwriting.Domain.Reviews;

namespace Underwriting.Domain.Evidence;

public static class CitationValidator
{
    private static string Normalize(string value) => Regex.Replace(value.Normalize(NormalizationForm.FormKC), @"\s+", " ").Trim();

    public static Citation Validate(Citation citation, Snapshot snapshot)
    {
        var document = snapshot.Documents.Find(document => document.Id == citation.DocumentId);
        var matched = document != null && !string.IsNullOrWhiteSpace(citation.Quote) && citation.Page > 0 && citation.Page <= document.Pages.Count &&
            Normalize(document.Pages[citation.Page - 1]).Contains(Normalize(citation.Quote), StringComparison.Ordinal);
        return citation with { Verified = matched };
    }

    public static Finding ValidateFinding(Finding finding, Snapshot snapshot)
    {
        finding.Citations = finding.Citations.Select(citation => Validate(citation, snapshot)).ToList();
        finding.ReviewQuestions = finding.ReviewQuestions.Select(question => question with
        {
            Citations = question.Citations.Select(citation => Validate(citation, snapshot)).ToList()
        }).ToList();
        if (finding.RequiresHumanReview == true)
        {
            finding.Status = "open";
            if (finding.Severity == "clear") finding.Severity = "attention";
        }
        finding.ValidationWarnings = finding.ReviewQuestions.SelectMany(question => question.Citations)
            .Where(citation => citation.Verified != true)
            .Select(citation => $"Review question has an invalid citation: {citation.DocumentId} p.{citation.Page}.").ToList();
        if (finding.Citations.Count == 0)
            finding.ValidationWarnings.Add("No documentary citation supplied. Finding is unverified.");
        finding.ValidationWarnings.AddRange(finding.Citations.Where(citation => citation.Verified != true)
            .Select(citation => $"Invalid quotation or page: {citation.DocumentId} p.{citation.Page}. Do not rely on this finding."));
        return finding;
    }
}
