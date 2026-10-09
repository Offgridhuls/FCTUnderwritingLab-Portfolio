using Underwriting.Application.Abstractions;

namespace Underwriting.Infrastructure.Documents;

public sealed class PrivateFiles(string directory) : IPrivateFiles
{
    private readonly string root = Path.GetFullPath(Path.Combine(directory, "uploads"));

    private string ContainedPath(params string[] parts)
    {
        var path = Path.GetFullPath(Path.Combine([root, .. parts]));
        if (!path.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("File path is outside private storage.");
        return path;
    }

    public async Task<string> SaveAsync(string owner, string id, byte[] content, CancellationToken cancellationToken)
    {
        var path = ContainedPath(owner, id + ".pdf");
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await File.WriteAllBytesAsync(path, content, cancellationToken);
        return path;
    }

    public Task<byte[]> ReadAsync(string path, CancellationToken cancellationToken) =>
        File.ReadAllBytesAsync(ContainedPath(Path.GetRelativePath(root, path)), cancellationToken);

    public void DeleteSession(string owner)
    {
        var path = ContainedPath(owner);
        if (Directory.Exists(path)) Directory.Delete(path, true);
    }

    public void Delete(string path) => File.Delete(ContainedPath(Path.GetRelativePath(root, path)));
}
