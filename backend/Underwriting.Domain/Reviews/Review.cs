using System.Text.Json;
using Underwriting.Domain.Evidence;

namespace Underwriting.Domain.Reviews;

public sealed class Review
{
    public string Id { get; set; } = "";
    public string CaseId { get; set; } = "";
    public string BranchId { get; set; } = "";
    public int Revision { get; set; }
    public Snapshot Snapshot { get; set; } = new();
    public string Mode { get; set; } = "cross";
    public string? SelectedReviewer { get; set; }
    public string Status { get; set; } = "running";
    public int Stage { get; set; }
    public string StageName { get; set; } = "Waiting to start";
    public bool PauseRequested { get; set; }
    public List<Finding> Findings { get; set; } = [];
    public List<Exchange> Exchanges { get; set; } = [];
    public string Brief { get; set; } = "";
    public bool NeedsRerun { get; set; }
    public bool? CrossSpecialtyFollowup { get; set; }
    public int StatusPolicyVersion { get; set; } = 2;
    public string? Error { get; set; }
    public string CreatedAt { get; set; } = "";
    public string? CompletedAt { get; set; }
    public double? DurationMs { get; set; }
    public List<JsonElement> Usage { get; set; } = [];
    public List<ReviewerActivity> Activities { get; set; } = [];
    public string? CoverageVersion { get; set; }
    public List<CoverageRecord> Coverage { get; set; } = [];
    public string? CoverageStatus { get; set; }
    public bool CoverageAuditDone { get; set; }
    public List<string> CoverageRechecked { get; set; } = [];
    public List<CoverageHistory> CoverageHistory { get; set; } = [];
}

public sealed class Exchange
{
    public string Id { get; set; } = "";
    public string Reviewer { get; set; } = "";
    public string? Target { get; set; }
    public string? FindingId { get; set; }
    public string Kind { get; set; } = "review";
    public string Text { get; set; } = "";
    public List<Citation> Citations { get; set; } = [];
    public string? Disposition { get; set; }
    public bool? Unresolved { get; set; }
}

public sealed class ReviewerActivity
{
    public string Id { get; set; } = "";
    public string Reviewer { get; set; } = "";
    public int Stage { get; set; }
    public string Label { get; set; } = "";
    public string State { get; set; } = "running";
    public string StartedAt { get; set; } = "";
    public string? CompletedAt { get; set; }
    public int? Attempt { get; set; }
}

public sealed record CoverageHistory(string Reviewer, List<Finding> Findings, List<CoverageRecord> Coverage, string At);
