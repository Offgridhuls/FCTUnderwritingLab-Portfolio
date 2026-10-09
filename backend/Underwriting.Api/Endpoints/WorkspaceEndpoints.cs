using System.Text.Json;
using Underwriting.Application.Abstractions;
using Underwriting.Application.Comparison;
using Underwriting.Application.Investigations;
using Underwriting.Domain;

namespace Underwriting.Api.Endpoints;

public sealed record NoteRequest(string CaseId, string BranchId, int ExpectedRevision, string CommandId, string Text) : CaseCommand(CaseId, BranchId, ExpectedRevision, CommandId);

public static class WorkspaceEndpoints
{
    public static void MapWorkspaceEndpoints(this WebApplication app)
    {
        var routes = app.MapGroup("/api/v1");
        routes.MapPost("/notes", (HttpContext context, NoteRequest request, CaseService cases, IRepository<Note> notes) =>
        {
            CaseService.Require(request.Text.Length is > 0 and <= 10000, "Note must be between 1 and 10000 characters.");
            return cases.Mutate(context.Owner(), request, CaseService.Fingerprint("note", request), branch =>
            {
                var note = new Note(CaseService.NewId(), branch.Id, request.Text, cases.Now());
                notes.Save(context.Owner(), note.Id, note);
                return note;
            });
        });
        routes.MapGet("/comparisons", (HttpContext context, string left, string right, string? beforeReviewId, string? afterReviewId, ComparisonService comparison) =>
            comparison.Compare(context.Owner(), left, right, beforeReviewId, afterReviewId));
        routes.MapGet("/branches/{branchId}/export", (HttpContext context, string branchId, BriefExporter exporter) =>
        {
            context.Response.Headers.ContentDisposition = "attachment; filename=\"underwriting-brief.md\"";
            return Results.Text(exporter.Export(context.Owner(), branchId), "text/markdown");
        });
        routes.MapGet("/events", (HttpContext context, IEventStore events) =>
        {
            var after = Cursor(context.Request.Query["after"]);
            return new { events = events.ReadAfter(context.Owner(), after), lastEventId = events.LastId(context.Owner()) };
        });
        routes.MapGet("/events/stream", StreamAsync);
    }

    private static long Cursor(string? raw)
    {
        if (string.IsNullOrEmpty(raw)) return 0;
        if (!long.TryParse(raw, out var cursor) || cursor < 0 || cursor > 9_007_199_254_740_991) throw new DomainException("invalid", "Invalid event cursor");
        return cursor;
    }

    private static async Task StreamAsync(HttpContext context, IEventStore events)
    {
        var cursor = Cursor(context.Request.Headers["Last-Event-ID"].FirstOrDefault() ?? context.Request.Query["after"].FirstOrDefault());
        context.Response.ContentType = "text/event-stream";
        context.Response.Headers.CacheControl = "no-cache";
        context.Response.Headers.Connection = "keep-alive";
        context.Response.Headers["X-Accel-Buffering"] = "no";
        var cancellation = context.RequestAborted;
        await context.Response.WriteAsync(": connected\n\n", cancellation);
        await context.Response.Body.FlushAsync(cancellation);
        var heartbeat = DateTimeOffset.UtcNow;
        while (!cancellation.IsCancellationRequested)
        {
            var batch = events.ReadAfter(context.Owner(), cursor);
            foreach (var item in batch)
            {
                await context.Response.WriteAsync($"id: {item.Id}\ndata: {JsonSerializer.Serialize(item, new JsonSerializerOptions(JsonSerializerDefaults.Web))}\n\n", cancellation);
                cursor = item.Id;
            }
            if (DateTimeOffset.UtcNow - heartbeat >= TimeSpan.FromSeconds(15))
            {
                await context.Response.WriteAsync(": heartbeat\n\n", cancellation);
                heartbeat = DateTimeOffset.UtcNow;
            }
            await context.Response.Body.FlushAsync(cancellation);
            if (batch.Count < 500) await Task.Delay(250, cancellation);
        }
    }
}
