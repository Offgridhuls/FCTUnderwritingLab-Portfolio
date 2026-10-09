using Underwriting.Domain;
using Underwriting.Domain.Investigations;
using Underwriting.Infrastructure.Persistence;
using Xunit;

namespace Underwriting.Tests;

public sealed class PersistenceTests : IDisposable
{
    private readonly string directory = Path.Combine(Path.GetTempPath(), "fct-dotnet-test-" + Guid.NewGuid());

    [Fact]
    public void RecordsAreOwnerScopedAndDetached()
    {
        using var database = new SqliteDatabase(directory);
        var records = new SqliteRepository<CaseRecord>(database, "case");
        records.Save("alice", "case", new() { Id = "case", Name = "Original" });
        Assert.Null(records.Get("bob", "case"));
        records.Get("alice", "case")!.Name = "Unsaved edit";
        Assert.Equal("Original", records.Get("alice", "case")!.Name);
    }

    [Fact]
    public void DuplicateCommandsReturnOriginalResultAndRejectChangedPayloads()
    {
        using var database = new SqliteDatabase(directory);
        var commands = new SqliteCommandStore(database);
        var calls = 0;
        Assert.Equal(1, commands.Execute("alice", "command-1", "payload", () => ++calls));
        Assert.Equal(1, commands.Execute("alice", "command-1", "payload", () => ++calls));
        Assert.Throws<DomainException>(() => commands.Execute("alice", "command-1", "different", () => ++calls));
        Assert.Equal(1, calls);
    }

    [Fact]
    public void FailedCommandRollsBackItsRecordsAndCanBeRetried()
    {
        using var database = new SqliteDatabase(directory);
        var records = new SqliteRepository<CaseRecord>(database, "case");
        var commands = new SqliteCommandStore(database);
        Assert.Throws<InvalidOperationException>(() => commands.Execute<int>("alice", "command-2", "payload", () =>
        {
            records.Save("alice", "case", new() { Id = "case" });
            throw new InvalidOperationException("Failure after write");
        }));
        Assert.Null(records.Get("alice", "case"));
        Assert.Equal(7, commands.Execute("alice", "command-2", "payload", () => 7));
    }

    [Fact]
    public void TwoServerInstancesCannotOwnTheSameDataDirectory()
    {
        using var first = new SqliteDatabase(directory);
        Assert.Throws<IOException>(() => new SqliteDatabase(directory));
    }

    public void Dispose() { if (Directory.Exists(directory)) Directory.Delete(directory, true); }
}
