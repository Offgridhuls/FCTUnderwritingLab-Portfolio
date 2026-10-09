using System.Security.Cryptography;
using Underwriting.Application.Documents;
using Underwriting.Application.Investigations;

namespace Underwriting.Api.Endpoints;

public static class DocumentEndpoints
{
    public static void MapDocumentEndpoints(this WebApplication app)
    {
        var routes = app.MapGroup("/api/v1/documents");
        routes.MapGet("/{documentId}", (string documentId, HttpContext context, DocumentService documents) =>
        {
            var document = documents.Get(context.Owner(), documentId);
            return new { document.Id, document.Title, document.Kind, document.Pages, document.Warnings, document.CreatedAt };
        });
        routes.MapGet("/{documentId}/file", async (string documentId, HttpContext context, DocumentService documents) =>
            Results.File(await documents.ReadAsync(context.Owner(), documentId, context.RequestAborted), "application/pdf"));
        routes.MapPost("/reveal", (RevealRequest input, HttpContext context, DocumentService documents) => documents.Reveal(context.Owner(), input));
        routes.MapPost("", async (HttpContext context, DocumentService documents) =>
        {
            var form = await context.Request.ReadFormAsync(context.RequestAborted);
            CaseService.Require(form.Files.Count == 1, "Attach one PDF");
            var file = form.Files[0];
            if (file.Length > 10 * 1024 * 1024) throw new Underwriting.Domain.DomainException("too_large", "PDF exceeds 10 MB");
            using var content = new MemoryStream();
            await file.CopyToAsync(content, context.RequestAborted);
            var bytes = content.ToArray();
            CaseService.Require(int.TryParse(form["expectedRevision"], out var revision), "Invalid revision.");
            var title = form["title"].ToString(); if (title == "") title = file.FileName;
            string? Optional(string key) => string.IsNullOrEmpty(form[key]) ? null : form[key].ToString();
            var input = new UploadRequest(form["caseId"].ToString(), form["branchId"].ToString(), revision,
                form["commandId"].ToString(), title, Optional("kind"), Optional("replaces"), Convert.ToHexStringLower(SHA256.HashData(bytes)));
            return await documents.UploadAsync(context.Owner(), input, bytes, context.RequestAborted);
        });
    }
}
