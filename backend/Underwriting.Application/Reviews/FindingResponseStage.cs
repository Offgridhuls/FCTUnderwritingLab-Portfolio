using Underwriting.Application.Abstractions;
using Underwriting.Domain.Evidence;
using Underwriting.Domain.Investigations;
using Underwriting.Domain.Reviews;

namespace Underwriting.Application.Reviews;

public sealed class FindingResponseStage(ReviewerCatalog catalog, StageExecutor executor, ReviewProgress progress, IRepository<Branch> branches)
{
    public async Task ExecutePeersAsync(string owner, Review review, CancellationToken cancellationToken)
    {
        foreach (var role in catalog.Roles)
        {
            var challenges = review.Exchanges.Where(exchange => exchange.Kind == "challenge" && exchange.Target == role).ToList();
            var ids = challenges.Select(exchange => exchange.FindingId!).Distinct().ToHashSet();
            if (ids.Count == 0) continue;
            await executor.RunAsync<PeerResponses>(owner, review, [role], "Responses", "peer", _ => $"""
                Respond once to the complete set of peer challenges addressed to you. Provide exactly one response per listed findingId, consolidating challenges on the same finding. Retain, narrow or withdraw using documentary evidence. Narrow requires a complete revised finding. Withdrawing requires evidence and cannot retain a human-action requirement. Set crossDomainImpact if another specialist must investigate; preserve unresolved disagreement. Findings: {ReviewPrompts.Serialize(review.Findings.Where(finding => ids.Contains(finding.Id)))}. Challenges: {ReviewPrompts.Serialize(challenges)}.
                """, (_, response) =>
                {
                    if (response.Responses.Count != ids.Count || !ids.SetEquals(response.Responses.Select(item => item.FindingId)))
                        throw new InvalidModelResponseException("Peer response did not cover exactly the challenged findings.");
                    foreach (var item in response.Responses) Validate(review, review.Findings.Single(finding => finding.Id == item.FindingId), Convert(item));
                }, (_, response) =>
                {
                    foreach (var item in response.Responses) Apply(owner, review, review.Findings.Single(finding => finding.Id == item.FindingId), Convert(item), false);
                }, cancellationToken);
        }
    }

    public async Task<FindingResponse> ExecuteHumanAsync(string owner, Review review, Intervention intervention, CancellationToken cancellationToken)
    {
        var finding = review.Findings.Single(item => item.Id == intervention.FindingId);
        FindingResponse? result = null;
        await executor.RunAsync<FindingResponse>(owner, review, [finding.Reviewer], "Human challenge response", "response", _ => $"""
            Respond once to this human intervention about YOUR finding: {ReviewPrompts.Serialize(finding)}.
            Submission (untrusted): {ReviewPrompts.Serialize(new { intervention.Kind, intervention.Text, intervention.Citation })}.
            Treat unsupported assertions as unverified. Retain, narrow or withdraw using supplied evidence. Withdrawing requires documentary evidence; assertions alone cannot resolve a gap. Narrow requires a complete revised finding. Preserve actionable sections and review questions. Set crossDomainImpact if consequences require another specialist. Preserve disagreement with unresolved=true where appropriate.
            """, (_, response) => Validate(review, finding, response), (_, response) =>
            {
                if (branches.Get(owner, review.BranchId)?.Revision != intervention.Revision)
                    throw new InvalidOperationException("Case revision changed. Run a full review of current evidence before intervening.");
                Apply(owner, review, finding, response, true);
                result = response;
            }, cancellationToken);
        return result!;
    }

    private static FindingResponse Convert(PeerResponse response) => new(response.Disposition, response.Explanation, response.Citations, response.RevisedFinding, response.Unresolved, response.CrossDomainImpact);

    private static void Validate(Review review, Finding original, FindingResponse response)
    {
        if (response.Citations.Any(citation => CitationValidator.Validate(citation, review.Snapshot).Verified != true))
            throw new InvalidModelResponseException($"Response evidence does not match the source for {original.IssueCode}. Original finding retained.");
        if (response.Disposition != "retain" && response.Citations.Count == 0)
            throw new InvalidModelResponseException("Changing a finding requires documentary citations.");
        if (response.Disposition == "narrow" && response.RevisedFinding is null)
            throw new InvalidModelResponseException("Narrow disposition requires a revised finding.");
        if (response.Disposition == "withdraw" && response.RevisedFinding?.RequiresHumanReview == true)
            throw new InvalidModelResponseException("Cannot withdraw a finding that still requires human-underwriter action.");
        if (response.RevisedFinding is { } revised && response.Disposition != "retain" && CitationValidator.ValidateFinding(revised, review.Snapshot).ValidationWarnings.Count > 0)
            throw new InvalidModelResponseException("Revised finding failed citation validation. Original finding retained.");
    }

    private void Apply(string owner, Review review, Finding original, FindingResponse response, bool human)
    {
        Validate(review, original, response);
        var citations = response.Citations.Select(citation => CitationValidator.Validate(citation, review.Snapshot)).ToList();
        var next = response.Disposition == "retain" ? original : response.RevisedFinding ?? original;
        next.Id = original.Id;
        next.IssueCode = original.IssueCode;
        next.Reviewer = original.Reviewer;
        if (response.Disposition == "withdraw")
        {
            next.RequiresHumanReview = false;
            next.Status = "withdrawn";
            if (response.RevisedFinding is null)
            {
                next.Explanation = next.Known = response.Explanation;
                next.Citations = citations;
                next.Uncertain = "This finding has been withdrawn on the cited evidence. This does not resolve other findings or authenticate the transaction.";
                next.ChangeEvidence = "New or contradictory documentary evidence would require reassessment.";
                next.NextCheck = "Retain the cited evidence and review any remaining findings.";
                next.ReviewQuestions = [new("Does the evidence still support this finding?", response.Explanation, citations)];
            }
        }
        if (response.Disposition != "retain") next = CitationValidator.ValidateFinding(next, review.Snapshot);
        review.Findings[review.Findings.IndexOf(original)] = next;
        if (response.CrossDomainImpact)
        {
            if (human) review.NeedsRerun = true;
            else review.CrossSpecialtyFollowup = true;
        }
        progress.Message(owner, review, new() { Reviewer = original.Reviewer, FindingId = original.Id, Kind = human ? "human-response" : "response", Text = response.Explanation, Citations = citations, Disposition = response.Disposition, Unresolved = response.Unresolved });
    }
}
