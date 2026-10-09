# Migration validation — 2026-10-09

## Scope and baseline

The original TypeScript implementation remains available in `server`; private Git history is not included. Before migration: 82 Vitest tests, 18 Playwright tests, and the frontend build passed. No existing database was migrated or rewritten. C# uses separate fresh storage.

## Deterministic checks

| Check | Result |
|---|---|
| .NET 10 solution build | Passed, zero warnings/errors |
| C# xUnit | 38 passed (including citation correction regressions): persistence, rules, provenance, coverage, workflow, concurrency, comparison, PDF boundaries and architecture |
| Existing Vitest | 82 passed after frontend extraction; includes original API/workflow regression suite |
| Paired TypeScript/C# API checks | 25 passed with equivalent test-only model responses; only generated IDs, session tokens and timestamps normalized |
| Playwright against C# | 19 passed: cases/lifecycle, delayed branch navigation, intake, historical comparison, findings, discussion, challenges, voice, themes, mobile, keyboard, SSE fallback |
| PDF parity | 21 supplied synthetic PDFs matched normalized page text and working-detail candidate values/citations against PDF.js fixtures |
| Negative PDF checks | Encrypted, malformed and oversized inputs rejected; 20 blank pages retained with warnings, 21 pages rejected |
| Concurrent state checks | Cancellation and session deletion cannot be overwritten by late results; duplicate parallel commands create one review; revision changes preserve old snapshots and reject stale human responses |
| Process model limit | 24 competing test calls never exceed six executing calls |
| npm dependency audit | Zero reported vulnerabilities after three development-package updates within existing ranges |
| Generated transport contracts | Regeneration produces no OpenAPI/TypeScript diff |

Paired contracts cover representative authenticated commands, lifecycle, details, branches, snapshots, completed review data and human challenge responses. They are regression evidence, not an exhaustive proof over every malformed request or possible model output. Browser fixture models test application behavior; they do not measure underwriting accuracy.

The same response schema/provenance boundary applies to fixture and real model adapters. The real adapter is separately exercised below. Browser voice tests simulate recognition events; actual microphone/provider availability depends on the browser.

## Load check

Raw local reports are excluded from this public snapshot. With a delayed synthetic model: 26 simultaneous starts yielded 22 admitted jobs (two workers plus twenty waiting slots) and four 429 rejections. Rejections created no reviews. Maximum measured sequential case-list + event-poll pair was 11 ms in the latest run (earlier runs ranged from 8–78 ms under different validation loads). Jobs were cancelled after admission/read checks; this is not a completed-review throughput test or an SLA. The separate semaphore test verifies the six-call ceiling.

## Live Terra smoke evaluation

The following summarizes a prior local live evaluation; raw reports are excluded. Calls used the installed signed-in Codex app-server and `gpt-5.6-terra`, independently of deterministic fixtures.

| Evidence | Processing | Coverage | Duration | Findings | Invalid citations |
|---|---|---|---|---|---|
| Original seeded Alder case | Completed | Complete | 247.852 s | 15 | 0 |
| Corrective reveals added | Completed | Incomplete: one permit topic | 345.522 s | 15 | 0 |

The original run identified missing representative authority, the payout-date problem and the municipal clarification issue. The name explanation was retained as resolved rather than a fraud accusation. The corrected run marked payout and municipal findings resolved and retained an authority/proceeds-scope question. Its `permit_scope` assessment failed internal consistency checks (unresolved/insufficient scenario evidence without the corresponding actionable link, and conflicting finding categories). That gap remains visible.

**Misses/incomplete results:** the corrected permit topic was not fully supported. **Unsupported conclusions:** no invalid page quotation was accepted, but this smoke did not include an independent expert adjudication of every conclusion. Provenance does not establish semantic correctness; the authority question requires human inspection. The small sample does not establish detection rates or promise an all-clear corrected case. No model wording equality is required between implementations.

## UI and packaging

The existing desktop/mobile light/dark browser suite passed after feature extraction. Generated screenshots under ignored `artifacts` were inspected for the lead summary layout; they are QA output, not maintained source assets. Build retains a Vite large-chunk warning for the PDF/graph-rich client; it is not a build failure.

The first remote Windows CI run exposed two five-second assertion deadlines and a branch-navigation race: old workspace controls could remain usable while a new branch loaded. Navigation now waits for the selected snapshot, older refresh responses cannot replace newer accepted responses, and a delayed-loading browser regression verifies that evidence reaches the new branch without altering the original. C# browser assertions allow fifteen seconds for the bounded fixture queue; failures are not hidden behind automatic test retries.

A subsequent CI run showed in-progress reviews exceeding those waits. The test transport now correlates concurrent replies instead of globally serializing all browser/load model calls. Paired cross-language payload checks explicitly use ordered fixture completion so exact chronological arrays can be compared without sorting or normalizing away differences. Cancellation drains or ignores the correct response; per-review cancellation cannot truncate a shared JSON line. CI retains structured fixture-server logs on failure for stage timing and state diagnosis.

CI is configured for locked builds, strict frontend checks, C# formatting, architecture tests, paired contracts, generated-contract drift, browser tests and the fake-model load check. Live subscription calls are excluded.

A fresh local Git clone on Windows installed dependencies, restored locked NuGet packages, built both applications, and passed frontend/backend formatting. Its normal production API served the frontend, accepted sign-in and loaded the seeded snapshot at the default port 4317 with a fresh isolated directory and no model call. The existing unit, paired API and browser suites were also exercised from that checkout. This verifies Windows setup with the installed Node 24 and .NET 10.0.401 SDK; it is not a second physical laptop or office-network test.

Docker packaging is updated but **not runtime-tested: Docker is not installed on this machine**. Native Windows startup is the verified presentation path. This public snapshot is published separately from the private development repository.

## Known boundaries

- Tests exercise supplied text PDFs; arbitrary multi-column/rotated/image-only layouts may need extraction work. OCR and survey-image interpretation remain deferred.
- The app is local and single-process. SQLite locks, queue bounds and revisions are not distributed-worker support.
- No guarantee of identical model wording, perfect coverage or insurance eligibility.
- Local evaluation scripts generate reports under ignored `docs/evaluation`; raw reports may contain local paths and should not be committed.
