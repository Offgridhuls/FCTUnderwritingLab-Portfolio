using System.Text.Json;
using System.Text.Json.Nodes;
using Underwriting.Application.Abstractions;
using Underwriting.Domain.Reviews;

namespace Underwriting.Application.Reviews;

public sealed record ReviewerResult<T>(T Value, List<JsonElement> Usage, int Attempts);
public sealed record ModelCallProgress(int Attempt, string State, JsonElement? Usage = null, string? Message = null);

/// <summary>Retries malformed or unsupported evidence responses, never transport or quota errors.</summary>
public sealed class ModelReviewer(IModelClient model, ReviewPrompts prompts, ModelCallLimiter limiter)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task<ReviewerResult<T>> AskAsync<T>(Review review, string role, string task, string schemaName,
        Action<T>? validate, CancellationToken cancellationToken, Action<ModelCallProgress>? onProgress = null)
    {
        var prompt = prompts.Build(review, role, task);
        var schema = prompts.Schema(schemaName);
        var usage = new List<JsonElement>();
        var feedback = "";
        for (var attempt = 1; attempt <= 3; attempt++)
        {
            onProgress?.Invoke(new(attempt, "running"));
            ModelReply reply;
            await limiter.EnterAsync(cancellationToken);
            try { reply = await model.CompleteAsync(prompt + feedback, schema, cancellationToken); }
            finally { limiter.Exit(); }
            usage.Add(reply.Usage);
            onProgress?.Invoke(new(attempt, "usage", reply.Usage));
            try
            {
                using var document = JsonDocument.Parse(reply.Text);
                ResponseSchemaValidator.Validate(document.RootElement, schema);
                var node = JsonNode.Parse(reply.Text)!;
                RemoveOptionalNulls(node, schema);
                var result = node.Deserialize<T>(Json) ?? throw new InvalidModelResponseException("Model returned no response.");
                validate?.Invoke(result);
                return new(result, usage, attempt);
            }
            catch (Exception exception) when (exception is JsonException or InvalidModelResponseException)
            {
                if (attempt == 3) throw new InvalidModelResponseException($"Model response failed validation after three attempts: {exception.Message}");
                onProgress?.Invoke(new(attempt + 1, "retrying", Message: exception.Message));
                feedback = $"\nCORRECTION REQUIRED: {exception.Message} Regenerate the complete response from the original immutable source evidence. Do not invent or relocate quotations. The previous output was not accepted." +
                    CitationCorrectionFeedback.Build(reply.Text, review.Snapshot);
            }
        }
        throw new InvalidOperationException("Unreachable retry state.");
    }

    // The Codex schema encodes optional Zod fields as required nullable fields.
    // Omit only those nulls before typed deserialization so DTO defaults remain valid.
    private static void RemoveOptionalNulls(JsonNode node, JsonElement schema)
    {
        if (node is JsonObject obj && schema.TryGetProperty("properties", out var properties))
        {
            foreach (var property in obj.ToArray())
            {
                if (!properties.TryGetProperty(property.Key, out var childSchema)) continue;
                if (property.Value is null) obj.Remove(property.Key);
                else if (property.Key is "known" or "uncertain" or "changeEvidence" && property.Value is JsonArray lines)
                    obj[property.Key] = string.Join('\n', lines.Select(line => line!.GetValue<string>()));
                else RemoveOptionalNulls(property.Value, childSchema);
            }
        }
        else if (node is JsonArray array && schema.TryGetProperty("items", out var items))
            foreach (var item in array.OfType<JsonNode>()) RemoveOptionalNulls(item, items);
        else if (schema.TryGetProperty("anyOf", out var alternatives))
            foreach (var alternative in alternatives.EnumerateArray())
                if (alternative.TryGetProperty("properties", out _) || alternative.TryGetProperty("items", out _)) RemoveOptionalNulls(node, alternative);
    }
}
