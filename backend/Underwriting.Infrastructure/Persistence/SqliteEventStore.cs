using Underwriting.Application.Abstractions;

namespace Underwriting.Infrastructure.Persistence;

public sealed class SqliteEventStore(SqliteDatabase database) : IEventStore
{
    public ProgressEvent Append(ProgressEvent value) => database.Locked(() =>
    {
        if (!database.Query("SELECT 1 FROM records WHERE kind='case' AND id=$id AND owner=$owner", row => row.GetInt32(0),
            ("$id", value.CaseId), ("$owner", value.SessionId)).Any()) return value;
        database.Execute("INSERT INTO events(owner,data) VALUES($owner,$data)",
            ("$owner", value.SessionId), ("$data", StorageJson.Serialize(value)));
        var id = database.Query("SELECT last_insert_rowid()", row => row.GetInt64(0)).Single();
        return value with { Id = id };
    });

    public IReadOnlyList<ProgressEvent> ReadAfter(string owner, long cursor) => database.Query(
        "SELECT id,data FROM events WHERE owner=$owner AND id>$cursor ORDER BY id LIMIT 500",
        row => StorageJson.Deserialize<ProgressEvent>(row.GetString(1)) with { Id = row.GetInt64(0) },
        ("$owner", owner), ("$cursor", cursor));

    public long LastId(string owner) => database.Query(
        "SELECT COALESCE(MAX(id),0) FROM events WHERE owner=$owner", row => row.GetInt64(0), ("$owner", owner)).Single();
}
