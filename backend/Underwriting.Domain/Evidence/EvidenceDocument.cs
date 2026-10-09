namespace Underwriting.Domain.Evidence;

public sealed class EvidenceDocument
{
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    public string Kind { get; set; } = "other";
    public List<string> Pages { get; set; } = [];
    public string File { get; set; } = "";
    public List<string> Warnings { get; set; } = [];
    public string CreatedAt { get; set; } = "";
}

public sealed record Citation(string DocumentId, int Page, string Quote, bool? Verified = null);

public sealed class Snapshot
{
    public Investigations.CaseDetails? Details { get; set; }
    public string? CaseName { get; set; }
    public string? Address { get; set; }
    public string CaseId { get; set; } = "";
    public string BranchId { get; set; } = "";
    public int Revision { get; set; }
    public string ClosingDate { get; set; } = "";
    public decimal PurchasePrice { get; set; }
    public decimal LoanAmount { get; set; }
    public List<string> Assumptions { get; set; } = [];
    public List<EvidenceDocument> Documents { get; set; } = [];
    public string RulesVersion { get; set; } = "DEMO-ONTARIO-1.0";
}
