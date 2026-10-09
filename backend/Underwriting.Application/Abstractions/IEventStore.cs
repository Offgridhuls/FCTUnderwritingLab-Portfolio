using System.Text.Json;

namespace Underwriting.Application.Abstractions;

public sealed record ProgressEvent(
    long Id, string SessionId, string CaseId, string BranchId, int Revision,
    string Type, JsonElement Data, string CreatedAt,
    string? ReviewId = null, string? Reviewer = null, string? FindingId = null, string? DocumentId = null);

public interface IEventStore
{
    ProgressEvent Append(ProgressEvent value);
    IReadOnlyList<ProgressEvent> ReadAfter(string owner, long cursor);
    long LastId(string owner);
}
