using Underwriting.Application.Abstractions;
using Underwriting.Application.Investigations;
using Underwriting.Application.Reviews;
using Underwriting.Domain;
using Underwriting.Domain.Reviews;

namespace Underwriting.Api.Endpoints;

public static class ReviewEndpoints
{
    public static void MapReviewEndpoints(this WebApplication app)
    {
        var routes = app.MapGroup("/api/v1");
        routes.MapPost("/reviews", (HttpContext context, StartReviewRequest request, ReviewCommands commands) => commands.Start(context.Owner(), request));
        routes.MapGet("/branches/{branchId}/reviews", (HttpContext context, string branchId, ReviewCommands commands) => commands.List(context.Owner(), branchId));
        routes.MapGet("/reviews/{reviewId}", (HttpContext context, string reviewId, ReviewCommands commands) => commands.Get(context.Owner(), reviewId));
        routes.MapGet("/reviews/{reviewId}/findings", (HttpContext context, string reviewId, ReviewCommands commands) => commands.Get(context.Owner(), reviewId).Findings);
        routes.MapGet("/reviews/{reviewId}/exchanges", (HttpContext context, string reviewId, ReviewCommands commands) => commands.Get(context.Owner(), reviewId).Exchanges);
        routes.MapGet("/reviews/{reviewId}/history", (HttpContext context, string reviewId, ReviewCommands commands, IRepository<ReviewHistory> history) =>
        {
            commands.Get(context.Owner(), reviewId);
            return history.List(context.Owner()).Where(item => item.ReviewId == reviewId);
        });
        foreach (var action in new[] { "pause", "resume", "cancel" })
            routes.MapPost($"/reviews/{{reviewId}}/{action}", (HttpContext context, string reviewId, CaseCommand request, ReviewCommands commands) => commands.Control(context.Owner(), reviewId, action, request));
        routes.MapPost("/interventions", (HttpContext context, InterventionRequest request, ReviewCommands commands) => commands.Intervene(context.Owner(), request));
        routes.MapGet("/interventions/{interventionId}", (HttpContext context, string interventionId, IRepository<Intervention> interventions) => interventions.Get(context.Owner(), interventionId) ?? throw new DomainException("missing", "Intervention not found"));
    }
}
