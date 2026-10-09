# The Underwriting Room

A local, synthetic title-insurance investigation demo: six AI specialists, a lead reviewer, cited findings, human challenges, coverage checks, and branch comparison. A human retains the underwriting decision. This independent prototype is not FCT's internal system or guidance.

## Run on Windows

Install **.NET 10 SDK**, **Node.js 24+**, and Codex signed in with access to `gpt-5.6-terra`. The desktop Codex window does not need to stay open; the backend starts its app-server process.

```powershell
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:4317** and enter the code printed in the terminal. Alternatively, double-click `start.cmd`. Keep its terminal open. `npm run dev` starts the backend watcher and Vite at port 5173.

The C# application starts with **fresh `.data-dotnet` storage**. Old TypeScript cases remain untouched in `.data`. Do not point the two implementations at the same directory. Sessions retain the original 24-hour expiry and browser isolation. Only synthetic documents belong in this demo; model review sends their text to the signed-in service.

## Find the code

| Location | Responsibility |
|---|---|
| `backend/Underwriting.Domain` | Cases, evidence, findings, coverage concepts, deterministic and citation rules |
| `backend/Underwriting.Application` | Use cases, review stages, prompts, comparison and focused dependency interfaces |
| `backend/Underwriting.Infrastructure` | SQLite, private PDFs, PdfPig, Codex stdio, bounded queue and restart recovery |
| `backend/Underwriting.Api` | ASP.NET Core routes, sessions, local access checks, dependency injection and workers |
| `src/features` | React case, document, review, discussion, finding, comparison and notes UI |
| `src/hooks` | Session, workspace loading, commands and SSE/poll subscriptions |
| `src/generated` / `contracts` | NSwag transport DTOs / generated OpenAPI; do not hand-edit |
| `backend/Underwriting.Tests` / `tests` | C# rules, deterministic workflows, paired API and browser tests |
| `output/pdf` | Synthetic upload packs and answer keys |
| `server` | Preserved TypeScript baseline, used by compatibility tests and legacy startup |

Start with the [code-navigation guide](docs/CODE-NAVIGATION.md), [click-to-database walkthrough](docs/REVIEW-WALKTHROUGH.md), and [architecture](docs/ARCHITECTURE.md). [Operations](docs/OPERATIONS.md) covers configuration, recovery, concurrency and Docker. [Laptop setup](docs/LAPTOP-SETUP.md) covers this public portfolio.

This public portfolio excludes private presentation files, local reports, credentials and historical Git metadata. See [publication scope](docs/PUBLICATION.md).

## Check the implementation

```powershell
npm test
npm run test:dotnet
npm run test:contracts
npx playwright install chromium
npm run test:ui
npm run test:load
npm run lint
npm run format:check
npm run format:backend:check
npm run contracts:generate
```

Build first. Tests use isolated databases and explicit test-only models; the normal application always uses Codex. CI checks generated contracts for drift. Live evaluation is separate: start the real server, set `FCT_ACCESS_CODE` and `FCT_EVALUATION_URL=http://127.0.0.1:4317/api/v1`, then `npm run evaluate`. It consumes subscription usage.

Read [validation results and limits](docs/VALIDATION.md): deterministic parity checks passed, but live model interpretation is not guaranteed. The corrected-case smoke still recorded one incomplete coverage topic and an authority question; this is visible, not silently treated as cleared.

## Demo flow

1. Open or create a case. Upload the synthetic PDFs together and confirm extracted working details.
2. Run the team. Inspect specialist progress, cited findings and coverage.
3. Challenge a finding with a question or page reference. The specialist responds and the lead updates its brief. Assertions alone are not evidence.
4. Branch the deal, upload corrective records, and review the new revision.
5. Compare topic outcomes and remaining human work. Add a note, export the brief, and finalize with a handoff reason.

OpenAPI is available at `/api/openapi.json`, with a readable route/contract browser at `/api/docs`. The same `/api/v1` commands can serve a future VR client; no browser-only underwriting rules are required.

## Original implementation

The retained TypeScript baseline supports compatibility tests and `npm run start:legacy`. This portfolio starts with a fresh Git history; no private historical branches or tags are published.

Dependency versions are locked in `package-lock.json`, NuGet `packages.lock.json`, and `dotnet-tools.json`. See [third-party notices](docs/THIRD-PARTY.md). This is an independent public portfolio prototype, not an official FCT product.
