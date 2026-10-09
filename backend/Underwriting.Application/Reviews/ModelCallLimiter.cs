namespace Underwriting.Application.Reviews;

/// <summary>One singleton per application, including when a test transport replaces Codex.</summary>
public sealed class ModelCallLimiter
{
    private readonly SemaphoreSlim slots = new(6, 6);
    public Task EnterAsync(CancellationToken cancellationToken) => slots.WaitAsync(cancellationToken);
    public void Exit() => slots.Release();
}
