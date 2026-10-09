using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text.Json;
using Underwriting.Api;
using Underwriting.Application.Abstractions;

namespace Underwriting.FixtureHost;

/// <summary>Runs the original deterministic fixture with correlated concurrent replies, like the real transport.</summary>
public sealed class SharedFixtureModel : IModelClient, IAsyncDisposable
{
    private readonly SemaphoreSlim writes = new(1, 1);
    private readonly ConcurrentDictionary<long, TaskCompletionSource<ModelReply>> pending = new();
    private readonly Process bridge;
    private readonly Task reader;
    private long nextId;

    public SharedFixtureModel(ServerOptions options)
    {
        var start = new ProcessStartInfo("node")
        {
            WorkingDirectory = options.ProjectRoot,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        start.ArgumentList.Add("--import");
        start.ArgumentList.Add("tsx");
        start.ArgumentList.Add("tests/migration/model-bridge.ts");
        bridge = Process.Start(start)!;
        bridge.ErrorDataReceived += (_, _) => { };
        bridge.BeginErrorReadLine();
        reader = ReadRepliesAsync();
    }

    public async Task<ModelReply> CompleteAsync(string prompt, JsonElement outputSchema, CancellationToken cancellationToken)
    {
        var id = Interlocked.Increment(ref nextId);
        var completion = new TaskCompletionSource<ModelReply>(TaskCreationOptions.RunContinuationsAsynchronously);
        pending[id] = completion;
        try
        {
            await writes.WaitAsync(cancellationToken);
            try
            {
                // Finish the frame before honoring per-request cancellation.
                await bridge.StandardInput.WriteLineAsync(JsonSerializer.Serialize(new { id, prompt, schema = outputSchema }));
                await bridge.StandardInput.FlushAsync();
            }
            finally { writes.Release(); }
            return await completion.Task.WaitAsync(cancellationToken);
        }
        finally { pending.TryRemove(id, out _); }
    }

    private async Task ReadRepliesAsync()
    {
        try
        {
            while (await bridge.StandardOutput.ReadLineAsync() is { } line)
            {
                using var message = JsonDocument.Parse(line);
                var reply = message.RootElement;
                // Cancelled requests are still drained and cannot be mistaken for another call.
                if (!pending.TryRemove(reply.GetProperty("id").GetInt64(), out var completion)) continue;
                if (reply.TryGetProperty("error", out var error))
                    completion.TrySetException(new InvalidOperationException(error.GetString()));
                else completion.TrySetResult(new(reply.GetProperty("text").GetString()!, reply.GetProperty("usage").Clone()));
            }
        }
        catch (Exception error)
        {
            foreach (var completion in pending.Values) completion.TrySetException(error);
        }
        finally
        {
            foreach (var completion in pending.Values) completion.TrySetException(new IOException("Fixture bridge disconnected."));
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (!bridge.HasExited) bridge.Kill(true);
        await reader;
        bridge.Dispose();
        writes.Dispose();
    }
}
