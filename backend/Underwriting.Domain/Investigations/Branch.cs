namespace Underwriting.Domain.Investigations;

public sealed class Branch
{
    public string Id { get; set; } = "";
    public string CaseId { get; set; } = "";
    public string Name { get; set; } = "Original deal";
    public int Revision { get; set; } = 1;
    [System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.Never)]
    public string? ParentId { get; set; }
    public string ClosingDate { get; set; } = "";
    public decimal PurchasePrice { get; set; }
    public decimal LoanAmount { get; set; }
    public CaseDetails? Details { get; set; }
    public List<string> Assumptions { get; set; } = [];
    public List<string> DocumentIds { get; set; } = [];
    public string CreatedAt { get; set; } = "";
}

public sealed class CaseDetails
{
    public int Revision { get; set; }
    public Dictionary<string, List<DetailCandidate>> Candidates { get; set; } = [];
    public bool Confirmed { get; set; }
    public Dictionary<string, string> Values { get; set; } = [];
    public Dictionary<string, string> Origins { get; set; } = [];
}

public sealed record DetailCandidate(string Value, Evidence.Citation Citation);
