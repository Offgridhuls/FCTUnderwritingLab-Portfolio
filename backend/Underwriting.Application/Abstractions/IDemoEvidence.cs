using Underwriting.Application.Investigations;
using Underwriting.Domain.Evidence;

namespace Underwriting.Application.Abstractions;

public sealed record DemoDocument(EvidenceDocument Document, bool Reveal);
public interface IDemoEvidence
{
    Task<IReadOnlyList<DemoDocument>> InstallAsync(string owner, CancellationToken cancellationToken);
    IReadOnlyList<Reveal> Reveals { get; }
}
