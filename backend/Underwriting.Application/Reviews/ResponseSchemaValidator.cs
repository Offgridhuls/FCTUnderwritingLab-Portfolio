using System.Text.Json;

namespace Underwriting.Application.Reviews;

public sealed class InvalidModelResponseException(string message) : Exception(message);

/// <summary>Validates the JSON-schema subset exported from the existing Zod contracts.</summary>
public static class ResponseSchemaValidator
{
    public static void Validate(JsonElement value, JsonElement schema, string path = "response")
    {
        if (schema.TryGetProperty("anyOf", out var alternatives))
        {
            foreach (var alternative in alternatives.EnumerateArray())
            {
                try { Validate(value, alternative, path); return; }
                catch (InvalidModelResponseException) { }
            }
            throw new InvalidModelResponseException($"{path} does not match an allowed shape.");
        }
        if (schema.TryGetProperty("type", out var type))
        {
            var types = type.ValueKind == JsonValueKind.Array ? type.EnumerateArray().Select(item => item.GetString()).ToArray() : [type.GetString()];
            bool Matches(string? expected) => expected switch
            {
                "object" => value.ValueKind == JsonValueKind.Object,
                "array" => value.ValueKind == JsonValueKind.Array,
                "string" => value.ValueKind == JsonValueKind.String,
                "boolean" => value.ValueKind is JsonValueKind.True or JsonValueKind.False,
                "integer" => value.ValueKind == JsonValueKind.Number && value.TryGetInt64(out _),
                "number" => value.ValueKind == JsonValueKind.Number,
                "null" => value.ValueKind == JsonValueKind.Null,
                _ => throw new InvalidOperationException($"Unsupported schema type: {expected}")
            };
            if (!types.Any(Matches)) throw new InvalidModelResponseException($"{path} has the wrong type.");
        }
        if (schema.TryGetProperty("enum", out var choices) && !choices.EnumerateArray().Any(choice => JsonElement.DeepEquals(choice, value)))
            throw new InvalidModelResponseException($"{path} is not an allowed value.");
        if (value.ValueKind == JsonValueKind.Object)
        {
            if (schema.TryGetProperty("required", out var required))
                foreach (var name in required.EnumerateArray())
                    if (!value.TryGetProperty(name.GetString()!, out _)) throw new InvalidModelResponseException($"{path}.{name.GetString()} is required.");
            if (schema.TryGetProperty("properties", out var properties))
                foreach (var property in value.EnumerateObject())
                {
                    if (properties.TryGetProperty(property.Name, out var child)) Validate(property.Value, child, $"{path}.{property.Name}");
                    else if (schema.TryGetProperty("additionalProperties", out var additional) && additional.ValueKind == JsonValueKind.False)
                        throw new InvalidModelResponseException($"{path}.{property.Name} is not allowed.");
                }
        }
        if (value.ValueKind == JsonValueKind.Array)
        {
            Bounds(value.GetArrayLength(), "minItems", "maxItems");
            if (schema.TryGetProperty("items", out var items))
            {
                var index = 0;
                foreach (var item in value.EnumerateArray()) Validate(item, items, $"{path}[{index++}]");
            }
        }
        if (value.ValueKind == JsonValueKind.String) Bounds(value.GetString()!.Length, "minLength", "maxLength");
        if (value.ValueKind == JsonValueKind.Number) Bounds(value.GetDouble(), "minimum", "maximum");

        void Bounds(double number, string minimum, string maximum)
        {
            if (schema.TryGetProperty(minimum, out var lower) && number < lower.GetDouble() ||
                schema.TryGetProperty(maximum, out var upper) && number > upper.GetDouble())
                throw new InvalidModelResponseException($"{path} is outside the allowed bounds.");
        }
    }
}
