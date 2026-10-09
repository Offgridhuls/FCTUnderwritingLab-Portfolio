using Underwriting.Application.Abstractions;

namespace Underwriting.Infrastructure.Persistence;

public sealed class SqliteSessionStore(SqliteDatabase database) : ISessionStore
{
    private sealed record Session(long Expires);
    private readonly SqliteRepository<Session> sessions = new(database, "session");
    public bool IsValid(string owner, long now) => sessions.Get(owner, owner)?.Expires > now;
    public void Save(string owner, long expires) => sessions.Save(owner, owner, new(expires));
    public void Remove(string owner) => database.Transaction(() =>
    {
        database.Execute("DELETE FROM records WHERE owner=$owner", ("$owner", owner));
        database.Execute("DELETE FROM events WHERE owner=$owner", ("$owner", owner));
        database.Execute("DELETE FROM commands WHERE owner=$owner", ("$owner", owner));
        return true;
    });
}
