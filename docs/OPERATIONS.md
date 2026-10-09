# Operations and configuration

## Start and stop

Use `npm ci`, `npm run build`, then `npm start` from the repository root. `start.cmd` calls the PowerShell helper which performs missing dependency installation and a build first. Stop with Ctrl+C; keep the terminal open while presenting. Use `DOTNET_BIN` if your installed SDK is not on PATH. The helper also discovers `%LOCALAPPDATA%/Microsoft/dotnet/dotnet.exe` on Windows.

`npm run dev` runs a .NET watcher and Vite. A rebuild interrupts active reviews; use the normal start for a demo. For side-by-side development, set `PORT=4320`; Vite's proxy uses the same variable. The original server is `npm run start:legacy` and uses `.data` by default.

| Variable | Purpose |
|---|---|
| `PORT` | Local API and production UI port, default 4317 |
| `FCT_ACCESS_CODE` | Optional stable local code; otherwise generated each start |
| `FCT_DOTNET_DATA_DIR` | C# database and private PDFs, default `.data-dotnet` |
| `FCT_PROJECT_ROOT` | Repository/application root when launched elsewhere |
| `DOTNET_BIN` | SDK executable path for npm helper scripts |
| `CODEX_BIN` | Native installed Codex executable path |
| `CODEX_HOME` | Existing signed-in Codex home outside the repository |
| `FCT_EVALUATION_URL` | Separate live evaluation target, including `/api/v1` |

The `.env.example` file is explanatory: set variables in your shell; there is no dotenv loader. Credentials stay outside the repository. The access code appears only at startup; structured request/stage logs omit tokens, document text and prompts. Request IDs appear in `X-Request-ID`; worker logs identify review IDs, stage durations, queue depth and failure types.

## Failure recovery

- **Port occupied:** stop the old server or choose another `PORT`. Never start two instances over the same database.
- **Data-directory lock:** another process owns it; stop that process normally. A leftover lock filename is harmless—the open file handle is the lock.
- **Missing Codex / ENOENT:** install/sign in locally or set `CODEX_BIN` to the actual executable. Do not copy another computer's credentials.
- **Usage limit, network or model failure:** partial work remains visible. Resolve the service problem and start a new review. No automatic unlimited retries or fallback model.
- **Invalid output/citation:** up to two repair attempts (three attempts total) preserve the same evidence. Persistent invalidity is incomplete, never fabricated.
- **Restart during work:** the saved review/intervention is marked interrupted/incomplete. Explicitly run a fresh assessment when appropriate; restart does not call the model automatically.
- **Coverage incomplete:** inspect the topic gap. Processing completion does not imply all topics were supported. Better evidence or a corrected assessment may be needed.
- **Stale revision:** refresh; review the new revision. Historical output stays available against its snapshot.
- **Queue full (429):** wait for a worker to free capacity, then retry. Failed admission has not created a review.
- **SSE disconnected:** polling/replay recover from saved state; a browser disconnect does not cancel backend work.

Back up the entire data directory only while the server is stopped. Do not copy just the SQLite file while its WAL is active. Session deletion removes that session's records and PDFs. Old TypeScript storage is not read or migrated by C#.

## Docker packaging

The multi-stage Dockerfile builds React and publishes ASP.NET Core 10. Its runtime includes the pinned Codex CLI. It deliberately keeps loopback binding. Use **host networking on a compatible Linux Docker host or a Docker Desktop installation with host networking enabled**; ordinary `-p` bridge publishing will not reach a loopback-only listener.

```sh
docker build -t underwriting-room .
docker run --rm --network host \
  -e FCT_ACCESS_CODE=your-local-demo-code \
  -v underwriting-data:/data \
  -v /absolute/path/to/dedicated-signed-in-codex-home:/home/app/.codex \
  underwriting-room
```

The external Codex home must be accessible to the image's non-root `app` user. Sign in separately; never bake credentials into the image. Docker runtime verification requires a local Docker engine and is reported separately in VALIDATION.md. Native Windows startup is the verified presentation path.

## Local scaling boundary

Two workers execute review jobs, six permits bound model calls, and twenty jobs may wait. All SQL writes use one local connection/gate and short transactions. This avoids unbounded work but does not provide multi-host scale. The load check measures local admission and read responsiveness, not production throughput or an SLA. External model latency and subscription limits usually dominate.
