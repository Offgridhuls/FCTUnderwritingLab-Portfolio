using System.Text;
using Underwriting.Application.Reviews;

namespace Underwriting.Application.Investigations;

public sealed class BriefExporter(CaseService cases, ReviewerCatalog catalog)
{
    public string Export(string owner, string branchId)
    {
        var workspace = cases.Workspace(owner, branchId);
        var review = workspace.Reviews.LastOrDefault();
        var text = new StringBuilder();
        if (review?.Mode == "specialist") text.Append($"> Partial scope: {catalog.RoleNames[review.SelectedReviewer!]} only. Other specialist areas not assessed. No peer cross-review.\n\n");
        text.Append($"# The Underwriting Room\n\nFictional Ontario transaction. Demonstration rules {catalog.RulesVersion}; not FCT policy, legal advice, identity authentication or a coverage decision.\n\nCase: {workspace.Case.Name}. Status: {workspace.Case.Status}.\n");
        if (workspace.Case.FinalizationNote is { } note) text.Append("Last finalization note: " + note);
        text.Append($"\n\n## {workspace.Branch.Name}\n\nCase revision: {workspace.Branch.Revision}. Closing: {workspace.Branch.ClosingDate}.\nReview: {review?.Status ?? "not started"}; assessed revision: {review?.Revision.ToString() ?? "none"}. ");
        if (review?.Revision != workspace.Branch.Revision || review?.NeedsRerun == true) text.Append("CURRENT ASSESSMENT REQUIRED.");
        text.Append('\n');
        if (review?.Error is { } error) text.Append("Incomplete work: " + error);
        text.Append($"\n\n{review?.Brief ?? "No completed lead brief."}\n\n## Evidence\n");
        if (review?.CoverageVersion is not null)
        {
            text.Append($"\n## Review coverage ({review.CoverageStatus})\n");
            foreach (var entry in review.Coverage)
                text.Append($"- {catalog.RoleNames[entry.Reviewer]} / {entry.TopicId}: {entry.Status}. {entry.Explanation}{(entry.Gaps.Count > 0 ? " GAPS: " + string.Join("; ", entry.Gaps) : "")}\n");
        }
        else text.Append("\nCoverage checklist not recorded.\n");
        foreach (var finding in review?.Findings ?? [])
        {
            var category = finding.Category == "assessment_limit" ? "Not assessed (not a confirmed defect)" : finding.Category == "missing_document" ? "Missing document" : "Issue";
            text.Append($"\n### {finding.Title} ({finding.Status})\nReviewer: {catalog.RoleNames[finding.Reviewer]}\nCategory: {category}\n{finding.Explanation}\n");
            if (!string.IsNullOrEmpty(finding.MissingDocument)) text.Append($"Missing: {finding.MissingDocument}\n");
            if (!string.IsNullOrEmpty(finding.Impact)) text.Append($"Why it matters: {finding.Impact}\n");
            text.Append($"Next step: {finding.Action ?? finding.NextCheck}\n");
            foreach (var citation in finding.Citations) text.Append($"- {citation.DocumentId}, p.{citation.Page}: \"{citation.Quote}\" [{(citation.Verified == true ? "quotation matched" : "INVALID CITATION")}]\n");
            text.Append('\n');
        }
        text.Append("\n## Human notes (unverified)\n" + string.Join('\n', workspace.Notes.Select(note => "- " + note.Text)));
        text.Append("\n\n## Branch assumptions (hypothetical)\n" + string.Join('\n', workspace.Branch.Assumptions.Select(assumption => "- " + assumption)));
        text.Append("\n\n## Team discussion\n");
        foreach (var exchange in review?.Exchanges ?? []) text.Append($"- {exchange.Reviewer} / {exchange.Kind}{(exchange.Disposition is not null ? " / " + exchange.Disposition : "")}{(exchange.Unresolved == true ? " / UNRESOLVED" : "")}: {exchange.Text}\n");
        return text.ToString();
    }
}
