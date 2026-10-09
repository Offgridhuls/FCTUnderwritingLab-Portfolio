using System.Text.Json;
using System.Text.Json.Serialization;

namespace Underwriting.Infrastructure.Persistence;

public static class StorageJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    public static string Serialize<T>(T value) => JsonSerializer.Serialize(value, Options);
    public static T Deserialize<T>(string value) => JsonSerializer.Deserialize<T>(value, Options)
        ?? throw new InvalidDataException("Stored record is null.");
}
