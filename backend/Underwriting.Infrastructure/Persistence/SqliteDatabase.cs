using Microsoft.Data.Sqlite;

namespace Underwriting.Infrastructure.Persistence;

/// <summary>Serializes short local database operations; never hold the gate across model calls.</summary>
public sealed class SqliteDatabase : IDisposable
{
    private readonly FileStream ownership;
    private readonly SqliteConnection connection;
    private readonly object gate = new();
    private SqliteTransaction? transaction;
    public string DirectoryPath { get; }

    public SqliteDatabase(string directory)
    {
        DirectoryPath = Path.GetFullPath(directory);
        Directory.CreateDirectory(DirectoryPath);
        ownership = new FileStream(Path.Combine(DirectoryPath, "server.lock"), FileMode.OpenOrCreate,
            FileAccess.ReadWrite, FileShare.None);
        connection = new SqliteConnection(new SqliteConnectionStringBuilder
        {
            DataSource = Path.Combine(DirectoryPath, "lab.sqlite"),
            Pooling = false
        }.ToString());
        try
        {
            connection.Open();
            var version = Query("PRAGMA user_version;", row => row.GetInt32(0)).Single();
            if (version > 1) throw new InvalidOperationException("This database was created by a newer application. Use that version; no data was changed.");
            Execute("PRAGMA journal_mode=WAL;");
            if (version == 0) Transaction(() => Execute("""
            CREATE TABLE IF NOT EXISTS records(kind TEXT,id TEXT,owner TEXT,data TEXT,PRIMARY KEY(kind,id,owner));
            CREATE INDEX IF NOT EXISTS owner_idx ON records(owner,kind);
            CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,owner TEXT,data TEXT);
            CREATE INDEX IF NOT EXISTS event_owner_idx ON events(owner,id);
            CREATE TABLE IF NOT EXISTS commands(owner TEXT,key TEXT,fingerprint TEXT,result TEXT,PRIMARY KEY(owner,key));
            PRAGMA user_version=1;
            """));
        }
        catch
        {
            connection.Dispose();
            ownership.Dispose();
            throw;
        }
    }

    public T Locked<T>(Func<T> action) { lock (gate) return action(); }

    public T Transaction<T>(Func<T> action) => Locked(() =>
    {
        if (transaction is not null) throw new InvalidOperationException("Nested command transaction.");
        using var current = connection.BeginTransaction();
        transaction = current;
        try { var result = action(); current.Commit(); return result; }
        catch { current.Rollback(); throw; }
        finally { transaction = null; }
    });

    public int Execute(string sql, params (string Name, object? Value)[] parameters) => Locked(() =>
    {
        using var command = Command(sql, parameters);
        return command.ExecuteNonQuery();
    });

    public List<T> Query<T>(string sql, Func<SqliteDataReader, T> read,
        params (string Name, object? Value)[] parameters) => Locked(() =>
    {
        using var command = Command(sql, parameters);
        using var reader = command.ExecuteReader();
        var values = new List<T>();
        while (reader.Read()) values.Add(read(reader));
        return values;
    });

    private SqliteCommand Command(string sql, (string Name, object? Value)[] parameters)
    {
        var command = connection.CreateCommand();
        command.CommandText = sql;
        command.Transaction = transaction;
        foreach (var (name, value) in parameters) command.Parameters.AddWithValue(name, value ?? DBNull.Value);
        return command;
    }

    public void Dispose() { connection.Dispose(); ownership.Dispose(); }
}
