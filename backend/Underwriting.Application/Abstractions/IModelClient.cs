using System.Text.Json;

namespace Underwriting.Application.Abstractions;

public sealed record ModelReply(string Text, JsonElement Usage);

public interface IModelClient
{
    Task<ModelReply> CompleteAsync(string prompt, JsonElement outputSchema, CancellationToken cancellationToken);
}
