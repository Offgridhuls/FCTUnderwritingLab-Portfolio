using System.Text.Json;
using System.Text.Json.Nodes;
using Underwriting.Application.Abstractions;
using Underwriting.Application.Investigations;
using Underwriting.Application.Reviews;
using Underwriting.Domain.Evidence;
using Underwriting.Domain.Investigations;
using Underwriting.Domain.Reviews;
using Underwriting.Infrastructure.Documents;
using Underwriting.Infrastructure.Persistence;
using Underwriting.Infrastructure.Reviews;

namespace Underwriting.Tests;

internal sealed class WorkflowFixture : IDisposable
{
    private readonly string directory = Path.Combine(Path.GetTempPath(), "fct-workflow-test-" + Guid.NewGuid());
    public SqliteDatabase Database { get; }
    public CaseService Cases { get; }
    public SessionService Sessions { get; }
    public ReviewCommands Commands { get; }
    public ReviewCoordinator Coordinator { get; }
    public ReviewJobQueue Queue { get; } = new();
    public FixtureModel Model { get; } = new();
    public CoverageService Coverage { get; }
    public ReviewerCatalog Catalog { get; } = ReviewResourceLoader.Catalog();
    public IRepository<T> Repository<T>(string kind) where T : class => new SqliteRepository<T>(Database, kind);

    public WorkflowFixture()
    {
        Database = new(directory);
        var cases = Repository<CaseRecord>("case");
        var branches = Repository<Branch>("branch");
        var documents = Repository<EvidenceDocument>("document");
        var reviews = Repository<Review>("review");
        var interventions = Repository<Intervention>("intervention");
        var events = new SqliteEventStore(Database);
        Cases = new(cases, branches, documents, reviews, interventions, Repository<Note>("note"), Repository<DetailHistory>("details-history"), new SqliteCommandStore(Database), events, TimeProvider.System);
        var files = new PrivateFiles(directory);
        Sessions = new(new SqliteSessionStore(Database), new DemoEvidence(files), cases, branches, documents, files, TimeProvider.System);
        Coverage = new(Catalog);
        var prompts = new ReviewPrompts(Catalog, ReviewResourceLoader.Load(), Coverage);
        var progress = new ReviewProgress(reviews, cases, events, TimeProvider.System);
        var executor = new StageExecutor(new ModelReviewer(Model, prompts, new()), progress);
        var response = new FindingResponseStage(Catalog, executor, progress, branches);
        var lead = new LeadSummaryStage(Catalog, Coverage, prompts, executor, progress);
        Coordinator = new(reviews, branches, interventions, Repository<ReviewHistory>("review-history"), progress,
            new(Catalog, Coverage, prompts, executor, progress), new(Coverage, prompts, executor, progress),
            new(Catalog, prompts, executor, progress), response, lead, new SilentTelemetry());
        Commands = new(Cases, reviews, interventions, Queue, progress, Catalog);
    }

    public void Dispose() { Database.Dispose(); Directory.Delete(directory, true); }

    private sealed class SilentTelemetry : IReviewTelemetry
    {
        public void StageCompleted(string reviewId, string stage, TimeSpan elapsed) { }
    }
}

/// <summary>Test-only model. Explicit fixtures verify coordination, not underwriting accuracy.</summary>
internal sealed class FixtureModel : IModelClient
{
    public string? FailRole { get; set; }
    public bool OmitCoverage { get; set; }
    public int Calls { get; private set; }
    public int Rechecks { get; private set; }
    public bool InvalidLeadCitation { get; set; }
    public Func<string, Task>? BeforeReply { get; set; }

    public async Task<ModelReply> CompleteAsync(string prompt, JsonElement schema, CancellationToken cancellationToken)
    {
        Calls++;
        if (BeforeReply is not null) await BeforeReply(prompt);
        cancellationToken.ThrowIfCancellationRequested();
        var role = prompt.Split('\n')[0][6..].Trim();
        if (role == FailRole) throw new IOException("Fixture transport failure");
        var properties = schema.GetProperty("properties");
        object output;
        using var snapshot = JsonDocument.Parse(prompt.Split("UNTRUSTED CASE SNAPSHOT: ")[1].Split("\nCORRECTION REQUIRED:")[0]);
        var document = snapshot.RootElement.GetProperty("documents")[0];
        var citation = new { documentId = document.GetProperty("id").GetString(), page = 1, quote = document.GetProperty("pages")[0].GetString()!.Split('\n').First(line => line.Length > 10) };
        if (properties.TryGetProperty("findings", out _))
        {
            if (prompt.Contains("SPECIALIST RECHECK", StringComparison.Ordinal)) Rechecks++;
            var topics = ReviewResourceLoader.Catalog().CoverageTopics.Where(topic => role == "lead" || topic.Reviewer == role);
            output = new
            {
                findings = Array.Empty<object>(),
                summary = "Fixture scope assessed.",
                coverage = OmitCoverage ? [] : topics.Select(topic => new
                {
                    topicId = topic.Id,
                    status = "no_issue",
                    explanation = "Fixture assessment only.",
                    citations = new[] { citation },
                    findingIssueCodes = Array.Empty<string>(),
                    scenario = new { status = "no_issue", explanation = "Fixture assessment only.", citations = new[] { citation }, findingIssueCodes = Array.Empty<string>(), limitationIssueCodes = Array.Empty<string>() }
                }).ToArray()
            };
        }
        else if (properties.TryGetProperty("questions", out _)) output = new { questions = Array.Empty<object>() };
        else if (properties.TryGetProperty("challenges", out _)) output = new { challenges = Array.Empty<object>() };
        else if (properties.TryGetProperty("brief", out _)) output = new { brief = "# Fixture brief\n\nA human makes the final decision.", citations = new[] { new { citation.documentId, page = InvalidLeadCitation ? 99 : 1, citation.quote } } };
        else output = new { disposition = "retain", explanation = "The assertion needs documentary support.", citations = new[] { citation }, revisedFinding = (object?)null, crossDomainImpact = false, unresolved = true };
        var node = JsonSerializer.SerializeToNode(output)!;
        AddSchemaNulls(node, schema);
        return new(node.ToJsonString(), JsonSerializer.SerializeToElement(new { fixture = true }));
    }

    private static void AddSchemaNulls(JsonNode node, JsonElement schema)
    {
        if (schema.TryGetProperty("anyOf", out var alternatives))
        {
            foreach (var alternative in alternatives.EnumerateArray())
                if (alternative.TryGetProperty("properties", out _) || alternative.TryGetProperty("items", out _)) AddSchemaNulls(node, alternative);
        }
        if (node is JsonObject obj && schema.TryGetProperty("properties", out var properties))
            foreach (var property in properties.EnumerateObject())
            {
                if (!obj.ContainsKey(property.Name)) obj[property.Name] = null;
                else if (obj[property.Name] is { } child) AddSchemaNulls(child, property.Value);
            }
        if (node is JsonArray array && schema.TryGetProperty("items", out var items))
            foreach (var item in array.OfType<JsonNode>()) AddSchemaNulls(item, items);
    }
}
