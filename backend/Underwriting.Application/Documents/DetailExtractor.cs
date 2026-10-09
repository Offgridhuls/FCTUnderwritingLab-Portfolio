using System.Globalization;
using System.Text.RegularExpressions;
using Underwriting.Domain.Evidence;
using Underwriting.Domain.Investigations;

namespace Underwriting.Application.Documents;

public static class DetailExtractor
{
    private static readonly Dictionary<string, string> Labels = new()
    {
        ["seller"] = "(?:Seller|Vendor|Registered owner)",
        ["buyer"] = "(?:Buyer|Purchaser|Borrower)",
        ["address"] = "(?:Property address|Security address|Property)",
        ["parcel"] = "(?:Property identifier|Parcel identifier|Parcel identifier number|PIN)",
        ["purchasePrice"] = "(?:Purchase price|Price)",
        ["loanAmount"] = "(?:New loan|Authorized advance|Loan amount)",
        ["closingDate"] = "(?:Proposed closing|Closing date|Authorized completion date|Completion)"
    };

    public static CaseDetails Extract(IEnumerable<EvidenceDocument> documents, int revision)
    {
        var result = new CaseDetails { Revision = revision };
        foreach (var (field, label) in Labels)
        {
            var candidates = new List<DetailCandidate>();
            result.Candidates[field] = candidates;
            foreach (var document in documents)
            {
                var actualLabel = field == "buyer" && document.Kind != "lender" ? "(?:Buyer|Purchaser)" : label;
                var numeric = field is "purchasePrice" or "loanAmount";
                var pattern = numeric ? @"(?:(?:CAD|\$)\s*)?([0-9][0-9,]*(?:\.[0-9]{2})?)" :
                    field == "closingDate" ? @"(\d{4}-\d{2}-\d{2}|[A-Za-z]+ \d{1,2},? \d{4})" : @"([^.;\n]{2,160})";
                for (var page = 0; page < document.Pages.Count; page++)
                    foreach (Match match in Regex.Matches(document.Pages[page], @"\b" + actualLabel + @"\s*(?::|\bis\b)?\s+" + pattern, RegexOptions.IgnoreCase))
                    {
                        var value = match.Groups[1].Value.Trim();
                        if (field is "seller" or "buyer" or "address" or "parcel" && !Regex.IsMatch(value, "^[A-Z0-9]")) continue;
                        if (numeric) value = decimal.Parse(value.Replace(",", ""), CultureInfo.InvariantCulture).ToString("G29", CultureInfo.InvariantCulture);
                        if (field == "closingDate")
                        {
                            if (!DateOnly.TryParseExact(value, ["yyyy-MM-dd", "MMMM d, yyyy", "MMMM d yyyy"], CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)) continue;
                            value = date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
                        }
                        if (!candidates.Any(candidate => candidate.Value == value && candidate.Citation.DocumentId == document.Id && candidate.Citation.Page == page + 1))
                            candidates.Add(new(value, new(document.Id, page + 1, match.Value, true)));
                    }
            }
        }
        return result;
    }

    public static string InferKind(string title, List<string> pages)
    {
        var text = title + " " + (pages.FirstOrDefault() ?? "")[..Math.Min(700, (pages.FirstOrDefault() ?? "").Length)];
        if (Regex.IsMatch(text, "payout", RegexOptions.IgnoreCase))
            return Regex.IsMatch(text, "updated payout|payout update", RegexOptions.IgnoreCase) ? "payout-update" : "payout";
        foreach (var (pattern, kind) in new[] {
            ("lender instruction", "lender"), ("purchase agreement|agreement of purchase", "agreement"),
            ("parcel.register|registry extract", "title"), ("municipal", "municipal"),
            ("representative authority|power of attorney", "authority-request"),
            ("identity|name.reconciliation", "identity"), ("survey", "survey") })
            if (Regex.IsMatch(text, pattern, RegexOptions.IgnoreCase)) return kind;
        return "uploaded";
    }
}
