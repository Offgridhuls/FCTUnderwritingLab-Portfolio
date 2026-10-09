using System.Globalization;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace Underwriting.Domain.Evidence;

public sealed record EvidenceChecks(
    [property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] string? ClosingDate,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] string? PayoutDocumentId,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] string? PayoutValidThrough,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] bool? PayoutExpiresBeforeClosing,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] decimal? PurchasePrice,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] decimal? LoanAmount,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] bool? LoanExceedsPurchase,
    List<string> UnreadablePages, List<string> Assumptions);

public static class DeterministicChecks
{
    public static EvidenceChecks Evaluate(Snapshot snapshot)
    {
        var payouts = snapshot.Documents.Where(document => document.Kind is "payout" or "payout-update").ToList();
        var active = payouts.Find(document => document.Kind == "payout-update") ?? payouts.FirstOrDefault();
        var rawDate = Regex.Match(string.Join(' ', active?.Pages ?? []), @"Valid through:\s*(\d{4}-\d{2}-\d{2})").Groups[1].Value;
        var valid = DateOnly.TryParseExact(rawDate, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _);
        var priceKnown = snapshot.Details == null || !string.IsNullOrEmpty(snapshot.Details.Values.GetValueOrDefault("purchasePrice"));
        var loanKnown = snapshot.Details == null || !string.IsNullOrEmpty(snapshot.Details.Values.GetValueOrDefault("loanAmount"));
        return new(string.IsNullOrEmpty(snapshot.ClosingDate) ? null : snapshot.ClosingDate,
            active?.Id, valid ? rawDate : null,
            valid && snapshot.ClosingDate.Length > 0 ? string.CompareOrdinal(rawDate, snapshot.ClosingDate) < 0 : null,
            priceKnown ? snapshot.PurchasePrice : null, loanKnown ? snapshot.LoanAmount : null,
            priceKnown && loanKnown ? snapshot.LoanAmount > snapshot.PurchasePrice : null,
            snapshot.Documents.SelectMany(document => document.Warnings).ToList(), snapshot.Assumptions);
    }
}
