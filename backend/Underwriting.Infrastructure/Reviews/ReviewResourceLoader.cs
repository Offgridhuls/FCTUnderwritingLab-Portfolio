using System.Text.Json;
using Underwriting.Application.Reviews;
using Underwriting.Infrastructure.Documents;
using Underwriting.Infrastructure.Persistence;

namespace Underwriting.Infrastructure.Reviews;

public static class ReviewResourceLoader
{
    public static ReviewerCatalog Catalog()
    {
        using var resource = DemoEvidence.Resource("reviewers.json");
        return JsonSerializer.Deserialize<ReviewerCatalog>(resource, StorageJson.Options)!;
    }

    public static ReviewResources Load()
    {
        var schemas = new Dictionary<string, JsonElement>();
        foreach (var name in new[] { "review", "cross", "response", "lead", "peer", "audit" })
        {
            using var resource = DemoEvidence.Resource(name + "-output-schema.json");
            using var document = JsonDocument.Parse(resource);
            schemas.Add(name, document.RootElement.Clone());
        }
        return new(Read("demonstration-rules.txt"), Read("review-policy-v1.txt"), Read("coverage-policy-v1.txt"), schemas);
    }

    private static string Read(string name)
    {
        using var stream = DemoEvidence.Resource(name);
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
