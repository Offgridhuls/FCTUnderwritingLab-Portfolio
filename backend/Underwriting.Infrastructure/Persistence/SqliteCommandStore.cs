using Underwriting.Application.Abstractions;
using Underwriting.Domain;

namespace Underwriting.Infrastructure.Persistence;

public sealed class SqliteCommandStore(SqliteDatabase database) : ICommandStore
{
    public T Execute<T>(string owner, string commandId, string fingerprint, Func<T> action)
    {
        if (commandId.Length is < 8 or > 100) throw new DomainException("invalid", "Invalid command ID.");
        return database.Transaction(() =>
        {
            var old = database.Query("SELECT fingerprint,result FROM commands WHERE owner=$owner AND key=$key",
                row => (Fingerprint: row.GetString(0), Result: row.GetString(1)), ("$owner", owner), ("$key", commandId));
            if (old.Count != 0)
            {
                if (old[0].Fingerprint != fingerprint)
                    throw new DomainException("conflict", "Command ID already used for a different command");
                return StorageJson.Deserialize<T>(old[0].Result);
            }
            var result = action();
            database.Execute("INSERT INTO commands VALUES($owner,$key,$fingerprint,$result)",
                ("$owner", owner), ("$key", commandId), ("$fingerprint", fingerprint),
                ("$result", StorageJson.Serialize(result)));
            return result;
        });
    }
}
