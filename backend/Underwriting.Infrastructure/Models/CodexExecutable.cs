namespace Underwriting.Infrastructure.Models;

public static class CodexExecutable
{
    public static string Resolve()
    {
        var configured = Environment.GetEnvironmentVariable("CODEX_BIN");
        if (!string.IsNullOrWhiteSpace(configured))
        {
            var path = Path.GetFullPath(configured);
            return File.Exists(path) ? path : throw new InvalidOperationException("CODEX_BIN points to a missing executable. Update it and restart the server.");
        }

        var name = OperatingSystem.IsWindows() ? "codex.exe" : "codex";
        foreach (var entry in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator))
        {
            var directory = entry.Trim('"');
            if (Path.IsPathFullyQualified(directory) && File.Exists(Path.Combine(directory, name)))
                return Path.Combine(directory, name);
        }

        if (OperatingSystem.IsWindows())
        {
            var root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "OpenAI", "Codex", "bin");
            if (Directory.Exists(root))
            {
                var candidate = Directory.EnumerateDirectories(root).Select(directory => Path.Combine(directory, name))
                    .Where(File.Exists).OrderByDescending(File.GetLastWriteTimeUtc).FirstOrDefault();
                if (candidate is not null) return candidate;
            }
        }

        throw new InvalidOperationException("Codex executable not found. Install Codex or set CODEX_BIN to its full executable path, then restart the server.");
    }
}
