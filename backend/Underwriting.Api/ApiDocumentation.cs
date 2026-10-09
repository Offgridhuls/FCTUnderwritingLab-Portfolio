namespace Underwriting.Api;

internal static class ApiDocumentation
{
    public const string Html = """
        <!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>The Underwriting Room API</title><style>body{font:16px system-ui;color:#253d40;background:#f6f7f5;max-width:960px;margin:40px auto;padding:0 24px}article{padding:16px;border-bottom:1px solid #dfe6e2}code{color:#22695f}summary{cursor:pointer}pre{overflow:auto;padding:12px;background:white;font-size:13px}a{color:#22695f}</style></head>
        <body><h1>The Underwriting Room API</h1><p>Local synthetic investigation service. Sign in through POST /api/v1/sessions. Use its HttpOnly cookie or Bearer session token for other endpoints.</p>
        <p>Commands carry caseId, branchId, expectedRevision and commandId. Reuse a command ID only for the same request. Lifecycle changes use expectedVersion. A 409 requires refreshing state; 429 indicates retryable queue saturation.</p>
        <p><a href="/api/openapi.json">Download OpenAPI specification</a> · <a href="/">Return to the application</a></p><main id="routes">Loading routes…</main>
        <script>fetch('/api/openapi.json').then(r=>r.json()).then(api=>{const root=document.getElementById('routes');root.textContent='';for(const [path,methods] of Object.entries(api.paths)){for(const [method,operation] of Object.entries(methods)){if(!['get','post','put','patch','delete'].includes(method))continue;const section=document.createElement('article'),heading=document.createElement('h2'),details=document.createElement('details'),summary=document.createElement('summary'),content=document.createElement('pre');heading.textContent=method.toUpperCase()+' '+path;summary.textContent='Request and response contract';content.textContent=JSON.stringify(operation,null,2);details.append(summary,content);section.append(heading,details);root.append(section);}}}).catch(()=>{document.getElementById('routes').textContent='Unable to load the specification. Reload to retry.'});</script></body></html>
        """;
}
