namespace Underwriting.Application.Abstractions;

/// <summary>Owner-scoped record storage. All implementations return detached values.</summary>
public interface IRepository<T> where T : class
{
    T? Get(string owner, string id);
    IReadOnlyList<T> List(string owner);
    void Save(string owner, string id, T value);
    bool SaveIf(string owner, string id, T value, Func<T, bool> predicate);
}

public interface ICommandStore
{
    T Execute<T>(string owner, string commandId, string fingerprint, Func<T> action);
}

public interface ISessionStore
{
    bool IsValid(string owner, long now);
    void Save(string owner, long expires);
    void Remove(string owner);
}
