using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using Underwriting.Application.Abstractions;
using Underwriting.Application.Investigations;
using Underwriting.Domain.Investigations;

namespace Underwriting.Api.Endpoints;

public static class InvestigationEndpoints
{
    private static readonly ConcurrentDictionary<string, (int Count, DateTimeOffset At)> Failures = new();
    public sealed record SignIn(string AccessCode);

    public static void MapInvestigationEndpoints(this WebApplication app)
    {
        var routes = app.MapGroup("/api/v1");
        routes.MapPost("/sessions", async (SignIn input, HttpContext context, SessionService sessions, ServerOptions options) =>
        {
            var ip = context.Connection.RemoteIpAddress?.ToString() ?? "local";
            var old = Failures.GetValueOrDefault(ip);
            if (old.Count >= 8 && DateTimeOffset.UtcNow - old.At < TimeSpan.FromMinutes(1))
                return Results.Json(new { message = "Too many attempts. Try again in one minute." }, statusCode: 429);
            CaseService.Require(input.AccessCode is { Length: <= 200 }, "Invalid access code.");
            if (!CryptographicOperations.FixedTimeEquals(SHA256.HashData(Encoding.UTF8.GetBytes(input.AccessCode)), SHA256.HashData(Encoding.UTF8.GetBytes(options.AccessCode))))
            {
                Failures[ip] = (old.Count + 1, DateTimeOffset.UtcNow);
                return Results.Json(new { message = "Access code is incorrect" }, statusCode: 401);
            }
            Failures.TryRemove(ip, out _);
            var result = await sessions.CreateAsync(context.RequestAborted);
            context.Response.Cookies.Append("fct_session", result.Token, new() { HttpOnly = true, SameSite = SameSiteMode.Strict, Path = "/", MaxAge = TimeSpan.FromDays(1) });
            return Results.Ok(result);
        }).Produces<SessionResult>();
        routes.MapGet("/sessions", (HttpContext context, CaseService cases) => new { cases = cases.List(context.Owner(), false), model = "gpt-5.6-terra", rulesVersion = "DEMO-ONTARIO-1.0" });
        routes.MapDelete("/sessions", (HttpContext context, SessionService sessions) =>
        {
            sessions.Delete(context.Owner()); context.Response.Cookies.Delete("fct_session", new() { Path = "/" }); return new { deleted = true };
        });
        routes.MapPost("/sessions/reset", async (HttpContext context, SessionService sessions) =>
        {
            sessions.Delete(context.Owner()); var ids = await sessions.InitializeAsync(context.Owner(), context.RequestAborted);
            return new { caseId = ids.CaseId, branchId = ids.BranchId };
        });
        routes.MapGet("/cases", (HttpContext context, CaseService cases) => cases.List(context.Owner()));
        routes.MapPost("/cases", (CreateCaseRequest input, HttpContext context, CaseService cases) => cases.Create(context.Owner(), input));
        routes.MapGet("/cases/{caseId}", (string caseId, HttpContext context, CaseService cases, IRepository<Branch> branches) =>
            new { @case = cases.GetCase(context.Owner(), caseId), branches = branches.List(context.Owner()).Where(branch => branch.CaseId == caseId) });
        routes.MapPost("/cases/{caseId}/status", (string caseId, StatusRequest input, HttpContext context, CaseService cases) => cases.SetStatus(context.Owner(), caseId, input));
        routes.MapGet("/branches/{branchId}/snapshot", (string branchId, HttpContext context, CaseService cases, IDemoEvidence demo) =>
        {
            var branch = cases.GetBranch(context.Owner(), branchId);
            var reveals = cases.GetCase(context.Owner(), branch.CaseId).Template != "blank"
                ? demo.Reveals.Where(reveal => !branch.DocumentIds.Contains(reveal.Id)).ToList() : [];
            return cases.Workspace(context.Owner(), branchId, reveals);
        });
        routes.MapPost("/branches", (BranchRequest input, HttpContext context, BranchService branches) => branches.Create(context.Owner(), input));
        routes.MapPatch("/branches/{branchId}", (string branchId, EditBranchRequest input, HttpContext context, BranchService branches) =>
        {
            CaseService.Require(branchId == input.BranchId, "Branch mismatch"); return branches.Edit(context.Owner(), input);
        });
        routes.MapPost("/branches/{branchId}/details", (string branchId, ConfirmDetailsRequest input, HttpContext context, BranchService branches) =>
        {
            CaseService.Require(branchId == input.BranchId, "Branch mismatch"); return branches.Confirm(context.Owner(), input);
        });
        routes.MapGet("/branches/{branchId}/details/history", (string branchId, HttpContext context, CaseService cases, IRepository<DetailHistory> history) =>
        {
            cases.GetBranch(context.Owner(), branchId); return history.List(context.Owner()).Where(item => item.BranchId == branchId);
        });
    }
}
