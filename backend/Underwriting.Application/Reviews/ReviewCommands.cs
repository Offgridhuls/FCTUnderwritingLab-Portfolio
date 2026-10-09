using Underwriting.Application.Abstractions;
using Underwriting.Application.Investigations;
using Underwriting.Domain;
using Underwriting.Domain.Evidence;
using Underwriting.Domain.Reviews;

namespace Underwriting.Application.Reviews;

public sealed record StartReviewRequest(string CaseId, string BranchId, int ExpectedRevision, string CommandId) : CaseCommand(CaseId, BranchId, ExpectedRevision, CommandId)
{
    public string Mode { get; set; } = "cross";
    public string? SelectedReviewer { get; set; }
    public string? RebuildBriefFrom { get; set; }
}

public sealed record InterventionRequest(string CaseId, string BranchId, int ExpectedRevision, string CommandId) : CaseCommand(CaseId, BranchId, ExpectedRevision, CommandId)
{
    public string ReviewId { get; set; } = "";
    public string FindingId { get; set; } = "";
    public string Kind { get; set; } = "question";
    public string Text { get; set; } = "";
    public Citation? Citation { get; set; }
}

public sealed class ReviewCommands(CaseService cases, IRepository<Review> reviews, IRepository<Intervention> interventions,
    IReviewQueue queue, ReviewProgress progress, ReviewerCatalog catalog)
{
    public Review Get(string owner, string id) => reviews.Get(owner, id) ?? throw new DomainException("missing", "Review not found");
    public IReadOnlyList<Review> List(string owner, string branchId)
    {
        cases.GetBranch(owner, branchId);
        return reviews.List(owner).Where(review => review.BranchId == branchId).ToList();
    }

    public Review Start(string owner, StartReviewRequest input)
    {
        CaseService.Require(input.Mode is "single" or "independent" or "cross" or "specialist", "Invalid review mode.");
        CaseService.Require(input.Mode == "specialist" ? catalog.Roles.Contains(input.SelectedReviewer ?? "") : input.SelectedReviewer is null, "selectedReviewer requires specialist mode and a valid specialist.");
        IReviewReservation? reservation = null;
        try
        {
            var result = cases.Mutate(owner, input, CaseService.Fingerprint("review", input), branch =>
            {
                CaseService.Require(branch.DocumentIds.Count > 0, "Upload evidence before starting a review.");
                if (branch.Details is { Confirmed: false }) throw new DomainException("conflict", "Review and confirm extracted case details before starting a review.");
                cases.RequireIdle(owner, branch.CaseId, branch.Id);
                var review = new Review
                {
                    Id = CaseService.NewId(),
                    CaseId = branch.CaseId,
                    BranchId = branch.Id,
                    Revision = branch.Revision,
                    Snapshot = cases.Snapshot(owner, branch),
                    Mode = input.Mode,
                    SelectedReviewer = input.SelectedReviewer,
                    CreatedAt = progress.Now(),
                    StageName = "Waiting to start"
                };
                if (input.RebuildBriefFrom is not null)
                {
                    var source = Get(owner, input.RebuildBriefFrom);
                    if (source.BranchId != branch.Id || source.Revision != branch.Revision || source.Status != "completed" || source.NeedsRerun)
                        throw new DomainException("conflict", "A completed current review is required to rebuild its lead brief.");
                    review.Mode = source.Mode;
                    review.SelectedReviewer = source.SelectedReviewer;
                    review.Snapshot = source.Snapshot;
                    review.Findings = source.Findings;
                    review.Exchanges = source.Exchanges.Where(exchange => exchange.Kind != "lead").ToList();
                    review.Activities = source.Activities.Where(activity => activity.Reviewer != "lead").ToList();
                    review.CoverageVersion = source.CoverageVersion;
                    review.Coverage = source.Coverage;
                    review.CoverageStatus = source.CoverageStatus;
                    review.CoverageAuditDone = source.CoverageAuditDone;
                    review.CoverageRechecked = source.CoverageRechecked;
                    review.CoverageHistory = source.CoverageHistory;
                    review.Stage = 3;
                }
                reservation = queue.Reserve();
                reviews.Save(owner, review.Id, review);
                progress.Emit(owner, review, "review.queued", new { waiting = true });
                return review;
            });
            reservation?.Enqueue(owner, result.Id);
            return Get(owner, result.Id);
        }
        finally { reservation?.Dispose(); }
    }

    public Review Control(string owner, string id, string action, CaseCommand input)
    {
        IReviewReservation? reservation = null;
        try
        {
            var review = cases.Mutate(owner, input, CaseService.Fingerprint(action + ":" + id, input), branch =>
            {
                var current = Get(owner, id);
                if (current.BranchId != branch.Id) throw new DomainException("missing", "Review does not belong to this branch.");
                if (action != "cancel" && current.Revision != branch.Revision) throw new DomainException("conflict", "Review uses an old case revision. Start a fresh review.");
                switch (action)
                {
                    case "pause":
                        if (current.Status != "running") throw new DomainException("conflict", "Only a running review can pause");
                        current.PauseRequested = true;
                        break;
                    case "resume":
                        if (current.Status != "paused") throw new DomainException("conflict", "Review is not paused");
                        if (interventions.List(owner).Any(item => item.ReviewId == id && item.State is "queued" or "processing")) throw new DomainException("conflict", "Wait for the intervention to finish");
                        reservation = queue.Reserve();
                        current.PauseRequested = false;
                        current.Status = "running";
                        break;
                    case "cancel":
                        current.Status = "cancelled";
                        foreach (var item in interventions.List(owner).Where(item => item.ReviewId == id && item.State is "queued" or "processing"))
                        {
                            item.State = "failed";
                            item.Error = "The review was cancelled.";
                            interventions.Save(owner, item.Id, item);
                            progress.Emit(owner, current, "intervention.failed", new { intervention = item }, findingId: item.FindingId);
                        }
                        break;
                    default: throw new DomainException("invalid", "Unknown review action.");
                }
                reviews.Save(owner, id, current);
                progress.Emit(owner, current, $"review.{action}");
                return current;
            });
            reservation?.Enqueue(owner, id);
            if (action == "cancel") queue.Cancel(owner, id);
            return Get(owner, review.Id);
        }
        finally { reservation?.Dispose(); }
    }

    public Intervention Intervene(string owner, InterventionRequest input)
    {
        CaseService.Require(input.Kind is "question" or "challenge" or "evidence" or "hypothetical", "Invalid intervention kind.");
        CaseService.Require(input.Text.Length is >= 3 and <= 2000, "Question must be between 3 and 2000 characters.");
        if (input.Kind == "hypothetical") throw new DomainException("hypothetical", "Hypothetical changes must create a branch through POST /branches. They are not verified evidence.");
        if (input.Citation is { } reference)
            CaseService.Require(reference.Page > 0 && reference.Quote.Length is >= 8 and <= 1200, "Invalid evidence reference.");
        IReviewReservation? reservation = null;
        try
        {
            var result = cases.Mutate(owner, input, CaseService.Fingerprint("intervention", input), branch =>
            {
                var review = Get(owner, input.ReviewId);
                if (review.BranchId != branch.Id) throw new DomainException("missing", "Review does not belong to this branch.");
                if (reviews.List(owner).LastOrDefault(item => item.BranchId == branch.Id)?.Id != review.Id) throw new DomainException("conflict", "Select the latest review. Historical reviews remain preserved for inspection.");
                if (interventions.List(owner).Any(item => item.ReviewId != review.Id && item.State is "queued" or "processing")) throw new DomainException("conflict", "Another review has an intervention queued or processing. Wait for it to finish.");
                if (review.Revision != branch.Revision) throw new DomainException("conflict", "Evidence changed. Run a full review first.");
                if (review.Status is not ("running" or "paused" or "completed")) throw new DomainException("conflict", "Cannot intervene on an incomplete or cancelled review; start a fresh review.");
                if (!review.Findings.Any(finding => finding.Id == input.FindingId)) throw new DomainException("missing", "Finding not available yet");
                if (input.Citation is not null && CitationValidator.Validate(input.Citation, review.Snapshot).Verified != true) throw new DomainException("invalid", "Evidence reference does not match this snapshot");
                if (review.Status != "running") reservation = queue.Reserve();
                var intervention = new Intervention
                {
                    Id = CaseService.NewId(),
                    CaseId = branch.CaseId,
                    BranchId = branch.Id,
                    Revision = branch.Revision,
                    ReviewId = review.Id,
                    FindingId = input.FindingId,
                    Kind = input.Kind,
                    Text = input.Text,
                    Citation = input.Citation,
                    CreatedAt = progress.Now()
                };
                interventions.Save(owner, intervention.Id, intervention);
                progress.Emit(owner, review, "intervention.queued", new { intervention }, findingId: intervention.FindingId);
                return intervention;
            });
            reservation?.Enqueue(owner, result.ReviewId);
            return interventions.Get(owner, result.Id)!;
        }
        finally { reservation?.Dispose(); }
    }
}
