using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using Underwriting.Application.Abstractions;
using Underwriting.Application.Documents;
using Underwriting.Domain;
using Underwriting.Domain.Investigations;

namespace Underwriting.Application.Investigations;

public sealed record BranchRequest(string CaseId, string BranchId, int ExpectedRevision, string CommandId,
    string Name, string? ClosingDate = null, string? Assumption = null) : CaseCommand(CaseId, BranchId, ExpectedRevision, CommandId);
public sealed record EditBranchRequest(string CaseId, string BranchId, int ExpectedRevision, string CommandId,
    string? ClosingDate = null, List<string>? Assumptions = null) : CaseCommand(CaseId, BranchId, ExpectedRevision, CommandId);
public sealed record ConfirmDetailsRequest(string CaseId, string BranchId, int ExpectedRevision, string CommandId,
    Dictionary<string, string> Values) : CaseCommand(CaseId, BranchId, ExpectedRevision, CommandId);

public sealed class BranchService(CaseService cases, IRepository<Branch> branches, IRepository<CaseRecord> records,
    IRepository<DetailHistory> history)
{
    public Branch Create(string owner, BranchRequest input)
    {
        CaseService.Require(input.Name.Length is > 0 and <= 80, "Scenario name must be between 1 and 80 characters.");
        CaseService.Require(input.Assumption?.Length is null or <= 2000, "Assumption exceeds 2000 characters.");
        CaseService.ValidateDate(input.ClosingDate);
        return cases.Mutate(owner, input, CaseService.Fingerprint("branch", input), original =>
        {
            var next = JsonSerializer.Deserialize<Branch>(JsonSerializer.Serialize(original))!;
            next.Id = CaseService.NewId(); next.ParentId = original.Id; next.Revision = 1;
            next.Name = input.Name; next.CreatedAt = cases.Now();
            next.ClosingDate = input.ClosingDate ?? original.ClosingDate;
            if (!string.IsNullOrEmpty(input.Assumption)) next.Assumptions.Add(input.Assumption);
            if (input.ClosingDate != null && input.ClosingDate != original.ClosingDate)
                next.Assumptions.Add($"Hypothetical closing date: {input.ClosingDate}. Lender agreement is not verified.");
            if (original.Details != null) next.Details = DetailExtractor.Extract(cases.Snapshot(owner, original).Documents, 1);
            branches.Save(owner, next.Id, next);
            var item = cases.GetCase(owner, original.CaseId);
            item.BranchIds.Add(next.Id); records.Save(owner, item.Id, item);
            return next;
        });
    }

    public Branch Edit(string owner, EditBranchRequest input)
    {
        CaseService.ValidateDate(input.ClosingDate);
        CaseService.Require(input.Assumptions is null || input.Assumptions.Count <= 10 && input.Assumptions.All(value => value.Length <= 2000), "Invalid assumptions.");
        return cases.Mutate(owner, input, CaseService.Fingerprint("edit-branch", input), branch =>
        {
            CaseService.Require(branch.ParentId != null, "Use Branch the Deal to change hypothetical facts.");
            if (input.ClosingDate != null) branch.ClosingDate = input.ClosingDate;
            if (input.Assumptions != null) branch.Assumptions = input.Assumptions;
            return cases.Changed(owner, branch);
        });
    }

    public Branch Confirm(string owner, ConfirmDetailsRequest input) => cases.Mutate(owner, input,
        CaseService.Fingerprint("confirm-details", input), branch =>
        {
            CaseService.Require(branch.Details != null && branch.DocumentIds.Count > 0, "Upload documents to extract details first.");
            cases.RequireIdle(owner, branch.CaseId, branch.Id);
            var values = new Dictionary<string, string>();
            foreach (var field in new[] { "seller", "buyer", "address", "parcel", "purchasePrice", "loanAmount", "closingDate" })
            {
                CaseService.Require(input.Values.TryGetValue(field, out var value) && value != null, $"Missing detail field: {field}");
                value = value!.Trim();
                CaseService.Require(value.Length <= 300, "Detail exceeds 300 characters.");
                if (field == "closingDate") CaseService.ValidateDate(value);
                if (field is "purchasePrice" or "loanAmount" && value != "")
                {
                    CaseService.Require(Regex.IsMatch(value, @"^[0-9]+(?:\.[0-9]{1,2})?$") &&
                        decimal.TryParse(value, CultureInfo.InvariantCulture, out var amount) && amount <= 1_000_000_000 &&
                        (field != "purchasePrice" || amount > 0), "Invalid amount");
                }
                values[field] = value;
            }
            history.Save(owner, CaseService.NewId(), new(branch.Id, branch.Details!, cases.Now()));
            branch.Revision++;
            var details = branch.Details!;
            details.Revision = branch.Revision; details.Confirmed = true; details.Values = values;
            details.Origins = values.ToDictionary(pair => pair.Key, pair => pair.Value == "" ? "unknown" :
                details.Candidates.GetValueOrDefault(pair.Key)?.Any(candidate => candidate.Value == pair.Value) == true ? "document" : "user");
            branch.ClosingDate = values["closingDate"];
            branch.PurchasePrice = values["purchasePrice"] == "" ? 0 : decimal.Parse(values["purchasePrice"], CultureInfo.InvariantCulture);
            branch.LoanAmount = values["loanAmount"] == "" ? 0 : decimal.Parse(values["loanAmount"], CultureInfo.InvariantCulture);
            branches.Save(owner, branch.Id, branch);
            cases.Publish(owner, branch, "case.changed", new { requiresFullReview = true });
            return branch;
        });
}
