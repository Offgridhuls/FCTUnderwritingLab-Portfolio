using Underwriting.Application.Investigations;
using Underwriting.Domain;

namespace Underwriting.Api;

public sealed class LocalRequestMiddleware(RequestDelegate next, ILogger<LocalRequestMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context, SessionService sessions, ServerOptions options)
    {
        var timing = System.Diagnostics.Stopwatch.StartNew();
        context.Response.Headers["X-Request-ID"] = context.TraceIdentifier;
        try
        {
            if (context.Request.Host.Host is not ("localhost" or "127.0.0.1"))
            { await Reject(context, 403, "Localhost access only"); return; }
            if (context.Request.Headers.TryGetValue("Origin", out var origin) &&
                (!Uri.TryCreate(origin, UriKind.Absolute, out var uri) || uri.Host is not ("localhost" or "127.0.0.1") ||
                uri.Port != options.Port && uri.Port != 5173))
            { await Reject(context, 403, "Foreign origin denied"); return; }
            context.Response.Headers["X-Content-Type-Options"] = "nosniff";
            context.Response.Headers["Referrer-Policy"] = "no-referrer";
            context.Response.Headers.CacheControl = "no-store";
            if (context.Request.Path.StartsWithSegments("/api/v1") &&
                !(context.Request.Path == "/api/v1/sessions" && context.Request.Method == "POST"))
            {
                var token = context.Request.Cookies["fct_session"];
                if (string.IsNullOrEmpty(token))
                {
                    var authorization = context.Request.Headers.Authorization.ToString();
                    token = authorization.StartsWith("Bearer ", StringComparison.Ordinal) ? authorization[7..] : "";
                }
                if (!sessions.IsValid(token))
                { await Reject(context, 401, "Enter your local access code to start a private session."); return; }
                context.Items["owner"] = SessionService.Owner(token);
            }
            await next(context);
        }
        catch (DomainException error)
        {
            var status = error.Code switch
            {
                "missing" => 404,
                "conflict" => 409,
                "too_large" => 413,
                "hypothetical" => 422,
                "busy" => 429,
                _ => 400
            };
            await Reject(context, status, error.Message);
        }
        catch (BadHttpRequestException error) { await Reject(context, error.StatusCode, "Invalid request."); }
        catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested) { }
        catch (Exception error)
        {
            logger.LogError("Request {RequestId} failed with {ErrorType}", context.TraceIdentifier, error.GetType().Name);
            if (!context.Response.HasStarted) await Reject(context, 500, "The request could not be completed.");
        }
        finally
        {
            logger.LogInformation("Request {RequestId} {Method} {Path} returned {StatusCode} in {DurationMs} ms",
                context.TraceIdentifier, context.Request.Method, context.Request.Path.Value, context.Response.StatusCode, timing.ElapsedMilliseconds);
        }
    }

    private static Task Reject(HttpContext context, int status, string message)
    {
        context.Response.StatusCode = status;
        return context.Response.WriteAsJsonAsync(new { message });
    }
}

public static class RequestOwner
{
    public static string Owner(this HttpContext context) => context.Items["owner"] as string
        ?? throw new InvalidOperationException("Authenticated session required.");
}
