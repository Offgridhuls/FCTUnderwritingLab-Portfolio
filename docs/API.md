# Shared API: browser and future VR

Base URL: `http://127.0.0.1:4317/api/v1`.

The default implementation is ASP.NET Core. Generated OpenAPI is at `/api/openapi.json`; `/api/docs` browses routes and schemas. `npm run contracts:generate` refreshes the committed OpenAPI and NSwag TypeScript DTOs. The original TypeScript implementation is retained for paired compatibility tests.

`POST /sessions` with `{ "accessCode": "..." }` creates a private fictional case and returns `caseId`, `branchId`, and a session `token`. Browsers use the HttpOnly SameSite cookie. Native clients use `Authorization: Bearer <token>`. Keep this token out of logs. Sessions last 24 hours.

Every case command carries this envelope:

```json
{
  "caseId": "case-uuid",
  "branchId": "branch-uuid",
  "expectedRevision": 1,
  "commandId": "unique-command-uuid"
}
```

Generate a command ID once and reuse it for network retries of **that exact payload**. A different payload with the same ID is rejected. On 409, fetch the current snapshot; do not silently change the revision and resubmit the user's old command.

| Operation                 | Endpoint                                                                        |
| ------------------------- | ------------------------------------------------------------------------------- |
| Session / delete          | `GET /sessions`, `DELETE /sessions`                                             |
| Reset synthetic workspace | `POST /sessions/reset`                                                          |
| Cases                     | `GET /cases`, `GET /cases/:caseId`                                              |
| Create / lifecycle | `POST /cases` with name and commandId; `POST /cases/:caseId/status` with status, note, expectedVersion and commandId |
| Working details | `POST /branches/:branchId/details` with the case command envelope and values |
| Snapshot plus history     | `GET /branches/:branchId/snapshot`                                              |
| Create a scenario         | `POST /branches` with name, optional closingDate and assumption                 |
| Edit branch facts         | `PATCH /branches/:branchId` with closingDate and/or assumptions                 |
| Reveal supplied evidence  | `POST /documents/reveal` with documentId                                        |
| Upload / replace PDF      | `POST /documents`, multipart envelope fields before the file; optional replaces |
| Document metadata / bytes | `GET /documents/:documentId`, `GET /documents/:documentId/file`                 |
| Full review               | `POST /reviews` with mode: single, independent, or cross                        |
| One specialist / lead regeneration | `POST /reviews` with mode `specialist`, selectedReviewer; optional rebuildBriefFrom for the lead |
| Review state / history    | `GET /reviews/:reviewId`, `GET /reviews/:reviewId/history`                      |
| Pause / resume / cancel   | `POST /reviews/:reviewId/pause`, `/resume`, `/cancel`                           |
| Findings / exchanges      | `GET /reviews/:reviewId/findings`, `/exchanges`                                 |
| Human intervention        | `POST /interventions`                                                           |
| Intervention status       | `GET /interventions/:id`                                                        |
| Save note                 | `POST /notes` with text                                                         |
| Compare branches          | `GET /comparisons?left=branch-id&right=branch-id`                               |
| Export                    | `GET /branches/:branchId/export`                                                |
| Poll events               | `GET /events?after=event-id`                                                    |
| Stream events             | `GET /events/stream?after=event-id`                                             |

An intervention adds these fields to the command envelope:

```json
{
  "reviewId": "review-uuid",
  "findingId": "finding-uuid",
  "kind": "challenge",
  "text": "Does the authorization on page three address the scope concern?",
  "citation": {
    "documentId": "authorization",
    "page": 3,
    "quote": "An exact passage copied from the supplied page"
  }
}
```

The example quote is a placeholder and will fail validation; use a real page passage. Allowed kinds are question, challenge and evidence. A hypothetical submission receives 422 with instructions to create a branch. The response starts queued, moves to processing, then completed or failed. Completion includes retain/narrow/withdraw and a public explanation. Reviewer responses and lead updates are also available in exchanges. Only one intervention is processed at a time.

## VR translation

| Future room interaction       | Existing API action                                                         |
| ----------------------------- | --------------------------------------------------------------------------- |
| Enter a room                  | Start session, fetch case snapshot                                          |
| Point at a finding            | Select its stable finding ID locally                                        |
| Place a document on the table | Select a supplied document/page reference; upload if genuinely new evidence |
| Ask the specialist a question | Submit intervention against current revision                                |
| Say “what if closing moves?”  | Create a branch with a hypothetical closing date                            |
| Pause deliberation            | Request pause; wait for completed-stage event                               |
| Rejoin after disconnect       | Fetch snapshot, resume SSE/polling cursor                                   |

Avatar appearance, voice and spatial placement belong to client presentation. Underwriting facts and reviewer decisions remain on the backend. No browser-side underwriting logic is required.
