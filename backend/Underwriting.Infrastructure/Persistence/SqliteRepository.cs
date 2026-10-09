using Underwriting.Application.Abstractions;

namespace Underwriting.Infrastructure.Persistence;

public sealed class SqliteRepository<T>(SqliteDatabase database, string kind) : IRepository<T> where T : class
{
    public T? Get(string owner, string id) => database.Query(
        "SELECT data FROM records WHERE kind=$kind AND id=$id AND owner=$owner",
        row => StorageJson.Deserialize<T>(row.GetString(0)), ("$kind", kind), ("$id", id), ("$owner", owner)).FirstOrDefault();

    public IReadOnlyList<T> List(string owner) => database.Query(
        "SELECT data FROM records WHERE kind=$kind AND owner=$owner ORDER BY rowid",
        row => StorageJson.Deserialize<T>(row.GetString(0)), ("$kind", kind), ("$owner", owner));

    public void Save(string owner, string id, T value) => database.Execute(
        "INSERT INTO records(kind,id,owner,data) VALUES($kind,$id,$owner,$data) ON CONFLICT(kind,id,owner) DO UPDATE SET data=excluded.data",
        ("$kind", kind), ("$id", id), ("$owner", owner), ("$data", StorageJson.Serialize(value)));

    public bool SaveIf(string owner, string id, T value, Func<T, bool> predicate) => database.Locked(() =>
    {
        var current = Get(owner, id);
        if (current is null || !predicate(current)) return false;
        Save(owner, id, value);
        return true;
    });
}
