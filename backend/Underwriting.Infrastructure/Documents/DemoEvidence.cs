using System.Reflection;
using System.Text.Json;
using Underwriting.Application.Abstractions;
using Underwriting.Application.Investigations;
using Underwriting.Domain.Evidence;
using Underwriting.Infrastructure.Persistence;

namespace Underwriting.Infrastructure.Documents;

public sealed class DemoEvidence(IPrivateFiles files) : IDemoEvidence
{
    private readonly List<SeedEntry> entries = ReadEntries();
    private sealed class SeedEntry
    {
        public string Id { get; set; } = "";
        public string Title { get; set; } = "";
        public string Kind { get; set; } = "";
        public List<string> Pages { get; set; } = [];
        public List<string> Warnings { get; set; } = [];
        public string CreatedAt { get; set; } = "";
        public bool Reveal { get; set; }
    }
    public IReadOnlyList<Reveal> Reveals => entries.Where(entry => entry.Reveal).Select(entry => new Reveal(entry.Id, entry.Title)).ToList();

    public static Stream Resource(string suffix) => typeof(DemoEvidence).Assembly.GetManifestResourceStream(
        "Underwriting.Infrastructure.Resources." + suffix) ?? throw new InvalidOperationException("Missing embedded resource: " + suffix);

    private static List<SeedEntry> ReadEntries()
    {
        using var stream = Resource("seed.json");
        return JsonSerializer.Deserialize<List<SeedEntry>>(stream, StorageJson.Options)!;
    }

    public async Task<IReadOnlyList<DemoDocument>> InstallAsync(string owner, CancellationToken cancellationToken)
    {
        var installed = new List<DemoDocument>();
        foreach (var entry in entries)
        {
            await using var stream = Resource("Seed." + entry.Id + ".pdf");
            using var content = new MemoryStream();
            await stream.CopyToAsync(content, cancellationToken);
            var path = await files.SaveAsync(owner, entry.Id, content.ToArray(), cancellationToken);
            installed.Add(new(new()
            {
                Id = entry.Id,
                Title = entry.Title,
                Kind = entry.Kind,
                Pages = entry.Pages,
                Warnings = entry.Warnings,
                File = path,
                CreatedAt = entry.CreatedAt
            }, entry.Reveal));
        }
        return installed;
    }
}
