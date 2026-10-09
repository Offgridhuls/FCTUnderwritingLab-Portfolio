using System.Security.Cryptography;

namespace Underwriting.Api;

public sealed record ServerOptions(string ProjectRoot, string DataDirectory, int Port, string AccessCode)
{
    public static ServerOptions FromEnvironment()
    {
        var root = new DirectoryInfo(Environment.GetEnvironmentVariable("FCT_PROJECT_ROOT") ?? Directory.GetCurrentDirectory());
        while (!File.Exists(Path.Combine(root.FullName, "package.json")))
            root = root.Parent ?? throw new InvalidOperationException("Run from the project or set FCT_PROJECT_ROOT.");
        var data = Environment.GetEnvironmentVariable("FCT_DOTNET_DATA_DIR") ?? Path.Combine(root.FullName, ".data-dotnet");
        return new(root.FullName, Path.GetFullPath(data), int.Parse(Environment.GetEnvironmentVariable("PORT") ?? "4317"),
            Environment.GetEnvironmentVariable("FCT_ACCESS_CODE") ?? Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(5)));
    }
}
