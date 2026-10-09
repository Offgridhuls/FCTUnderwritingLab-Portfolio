using System.Text.Json.Serialization;
using Underwriting.Api;
using Underwriting.Api.Endpoints;
using Underwriting.Application.Abstractions;
using Underwriting.Application.Comparison;
using Underwriting.Application.Documents;
using Underwriting.Application.Investigations;
using Underwriting.Application.Reviews;
using Underwriting.Domain.Evidence;
using Underwriting.Domain.Investigations;
using Underwriting.Domain.Reviews;
using Underwriting.Infrastructure.Documents;
using Underwriting.Infrastructure.Models;
using Underwriting.Infrastructure.Persistence;
using Underwriting.Infrastructure.Reviews;

namespace Underwriting.Api;

public static class ApplicationBootstrap
{
    public static WebApplication Build(string[] args, Action<IServiceCollection>? configure = null)
    {
        var builder = WebApplication.CreateBuilder(args);
        var options = ServerOptions.FromEnvironment();
        builder.WebHost.UseUrls($"http://127.0.0.1:{options.Port}");
        builder.Services.AddSingleton(options);
        builder.Services.ConfigureHttpJsonOptions(json =>
        {
            json.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
            json.SerializerOptions.RespectNullableAnnotations = true;
            json.SerializerOptions.RespectRequiredConstructorParameters = true;
        });
        builder.WebHost.ConfigureKestrel(server => server.Limits.MaxRequestBodySize = 11 * 1024 * 1024);
        builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(form => form.MultipartBodyLengthLimit = 11 * 1024 * 1024);
        builder.Services.AddOpenApi(document => document.AddDocumentTransformer((description, _, _) =>
        {
            description.Info.Title = "The Underwriting Room API";
            description.Info.Version = "v1";
            description.Servers = [new() { Url = "/" }];
            return Task.CompletedTask;
        }).AddSchemaTransformer((schema, context, _) =>
        {
            if (schema.Properties?.Count > 0)
            {
                schema.AdditionalPropertiesAllowed = false;
                if (context.JsonTypeInfo.Type.Namespace?.StartsWith("Underwriting.Domain", StringComparison.Ordinal) == true)
                {
                    var nullability = new System.Reflection.NullabilityInfoContext();
                    foreach (var property in context.JsonTypeInfo.Type.GetProperties())
                    {
                        if (nullability.Create(property).ReadState == System.Reflection.NullabilityState.Nullable) continue;
                        var name = System.Text.Json.JsonNamingPolicy.CamelCase.ConvertName(property.Name);
                        if (schema.Properties.ContainsKey(name)) (schema.Required ??= new HashSet<string>()).Add(name);
                    }
                }
            }
            return Task.CompletedTask;
        }));
        builder.Services.AddSingleton(TimeProvider.System);
        builder.Services.AddSingleton(new SqliteDatabase(options.DataDirectory));
        RegisterRepository<CaseRecord>("case");
        RegisterRepository<Branch>("branch");
        RegisterRepository<EvidenceDocument>("document");
        RegisterRepository<Review>("review");
        RegisterRepository<Intervention>("intervention");
        RegisterRepository<Note>("note");
        RegisterRepository<DetailHistory>("details-history");
        RegisterRepository<ReviewHistory>("review-history");
        builder.Services.AddSingleton<ICommandStore, SqliteCommandStore>();
        builder.Services.AddSingleton<ISessionStore, SqliteSessionStore>();
        builder.Services.AddSingleton<IEventStore, SqliteEventStore>();
        builder.Services.AddSingleton<IPrivateFiles>(new PrivateFiles(options.DataDirectory));
        builder.Services.AddSingleton<IDemoEvidence, DemoEvidence>();
        builder.Services.AddSingleton<IPdfExtractor, PdfPigExtractor>();
        builder.Services.AddSingleton<CaseService>();
        builder.Services.AddSingleton<BranchService>();
        builder.Services.AddSingleton<DocumentService>();
        builder.Services.AddSingleton<SessionService>();
        builder.Services.AddSingleton(ReviewResourceLoader.Catalog());
        builder.Services.AddSingleton(ReviewResourceLoader.Load());
        builder.Services.AddSingleton<CoverageService>();
        builder.Services.AddSingleton<ReviewPrompts>();
        builder.Services.AddSingleton<IModelClient>(_ => new CodexModelClient(options.DataDirectory));
        builder.Services.AddSingleton<ModelReviewer>();
        builder.Services.AddSingleton<ModelCallLimiter>();
        builder.Services.AddSingleton<ReviewProgress>();
        builder.Services.AddSingleton<StageExecutor>();
        builder.Services.AddSingleton<IndependentReviewStage>();
        builder.Services.AddSingleton<CoverageAuditStage>();
        builder.Services.AddSingleton<CrossReviewStage>();
        builder.Services.AddSingleton<FindingResponseStage>();
        builder.Services.AddSingleton<LeadSummaryStage>();
        builder.Services.AddSingleton<ReviewCoordinator>();
        builder.Services.AddSingleton<IReviewTelemetry, ReviewTelemetry>();
        builder.Services.AddSingleton<ReviewCommands>();
        builder.Services.AddSingleton<ComparisonService>();
        builder.Services.AddSingleton<BriefExporter>();
        builder.Services.AddSingleton<ReviewJobQueue>();
        builder.Services.AddSingleton<IReviewQueue>(services => services.GetRequiredService<ReviewJobQueue>());
        builder.Services.AddSingleton<ReviewRecovery>();
        builder.Services.AddHostedService<ReviewWorker>();
        configure?.Invoke(builder.Services);
        var app = builder.Build();
        app.Services.GetRequiredService<ReviewRecovery>().Recover();
        app.UseMiddleware<LocalRequestMiddleware>();
        app.MapInvestigationEndpoints();
        app.MapDocumentEndpoints();
        app.MapReviewEndpoints();
        app.MapWorkspaceEndpoints();
        app.MapOpenApi("/api/openapi.json");
        app.MapGet("/api/docs", () => Results.Content(ApiDocumentation.Html, "text/html"));
        var dist = Path.Combine(options.ProjectRoot, "dist");
        if (Directory.Exists(dist))
        {
            var files = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(dist);
            app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = files });
            app.UseStaticFiles(new StaticFileOptions { FileProvider = files });
            app.MapFallback((HttpContext context) => context.Request.Path.StartsWithSegments("/api") || context.Request.Path.StartsWithSegments("/assets")
                ? Results.NotFound(new { message = "Endpoint not found" })
                : Results.File(Path.Combine(dist, "index.html"), "text/html"));
        }
        Console.WriteLine($"THE UNDERWRITING ROOM — C# migration\nLocal API: http://127.0.0.1:{options.Port}\nAccess code: {options.AccessCode}");
        return app;

        void RegisterRepository<T>(string kind) where T : class => builder.Services.AddSingleton<IRepository<T>>(services =>
            new SqliteRepository<T>(services.GetRequiredService<SqliteDatabase>(), kind));

    }
}
