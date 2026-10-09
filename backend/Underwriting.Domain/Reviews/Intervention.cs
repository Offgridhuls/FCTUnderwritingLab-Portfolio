using Underwriting.Domain.Evidence;

namespace Underwriting.Domain.Reviews;

public sealed class Intervention
{
    public string Id { get; set; } = "";
    public string CaseId { get; set; } = "";
    public string BranchId { get; set; } = "";
    public int Revision { get; set; }
    public string ReviewId { get; set; } = "";
    public string FindingId { get; set; } = "";
    public string Kind { get; set; } = "question";
    public string Text { get; set; } = "";
    public Citation? Citation { get; set; }
    public string State { get; set; } = "queued";
    public string? Response { get; set; }
    public string? Disposition { get; set; }
    public string? Error { get; set; }
    public string CreatedAt { get; set; } = "";
}
