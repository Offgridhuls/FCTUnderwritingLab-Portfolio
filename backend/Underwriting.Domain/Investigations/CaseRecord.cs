namespace Underwriting.Domain.Investigations;

public sealed class CaseRecord
{
    public string Id { get; set; } = "";
    public string SessionId { get; set; } = "";
    public string Name { get; set; } = "";
    public string Address { get; set; } = "";
    public string? DisplayAddress { get; set; }
    public string? Template { get; set; }
    public string? Status { get; set; }
    public int? Version { get; set; }
    public List<string> BranchIds { get; set; } = [];
    public string CreatedAt { get; set; } = "";
    public string? FinalizedAt { get; set; }
    public string? FinalizationNote { get; set; }
    public List<LifecycleEntry>? Lifecycle { get; set; }
}

public sealed record LifecycleEntry(string Action, string At, string Note);
