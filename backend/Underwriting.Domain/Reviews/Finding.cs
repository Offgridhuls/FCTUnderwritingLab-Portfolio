using Underwriting.Domain.Evidence;

namespace Underwriting.Domain.Reviews;

public sealed class Finding
{
    public string Id { get; set; } = "";
    public string IssueCode { get; set; } = "";
    public string Reviewer { get; set; } = "";
    public string Title { get; set; } = "";
    public string Severity { get; set; } = "attention";
    public string Status { get; set; } = "open";
    public string Explanation { get; set; } = "";
    public string NextCheck { get; set; } = "";
    public bool? RequiresHumanReview { get; set; }
    public string? Category { get; set; }
    public string? MissingDocument { get; set; }
    public string? Impact { get; set; }
    public string? Action { get; set; }
    public string? Known { get; set; }
    public string? Uncertain { get; set; }
    public string? ChangeEvidence { get; set; }
    public List<ReviewQuestion> ReviewQuestions { get; set; } = [];
    public List<Citation> Citations { get; set; } = [];
    public List<string> ValidationWarnings { get; set; } = [];

    public bool IsActionable() => RequiresHumanReview == true || (Status == "open" && Severity != "clear");
}

public sealed record ReviewQuestion(string Question, string Answer, List<Citation> Citations);
