# Start review: from click to database

1. **React gathers an explicit command.** The selected case, branch and expected evidence revision accompany a fresh command ID. `useCommand` supplies busy/error handling; `api.ts` sends JSON with the session cookie.
2. **ASP.NET Core authenticates and binds it.** `LocalRequestMiddleware` checks local origin/session ownership. `ReviewEndpoints` deserializes a typed `StartReviewRequest` and calls `ReviewCommands.Start`.
3. **The application validates before writing.** The case must be open, the revision current, and the requested reviewer/mode valid. Duplicate commands return the saved result; reused IDs with different payloads fail. A queue reservation must succeed before a new review is committed.

```csharp
public sealed record StartReviewRequest(
    string CaseId, string BranchId, int ExpectedRevision, string CommandId)
    : CaseCommand(CaseId, BranchId, ExpectedRevision, CommandId)
{
    public string Mode { get; set; } = "cross";
    public string? SelectedReviewer { get; set; }
    public string? RebuildBriefFrom { get; set; }
}
```

4. **A short transaction saves the snapshot and command result.** SQLite stores detached JSON records. The snapshot contains the specific document pages, working details and assumptions used by this review. Later evidence changes do not rewrite it. The queue receives the committed review ID, not a mutable object shared with the browser.
5. **A hosted worker runs the coordinator.** Two workers can execute reviews; twenty further jobs can wait. `ReviewCoordinator` dispatches independent review, audit/recheck substeps, cross-review, responses, then lead synthesis. Single-specialist mode runs the chosen specialty and a scoped lead summary.
6. **Specialists return results to one owner.** `StageExecutor` can await multiple calls, but only its coordinator applies findings, exchanges and usage to the review. A process-wide six-call semaphore bounds model activity. No database transaction stays open during a model call.

```csharp
// The interface belongs to Application; Codex and test adapters implement it.
public interface IModelClient
{
    Task<ModelReply> CompleteAsync(
        string prompt, JsonElement outputSchema, CancellationToken cancellationToken);
}
```

7. **Validation precedes acceptance.** The JSON schema and typed response must agree. Quotes must occur on the cited snapshot page. Coverage topics must belong to the specialist and link to valid findings. These checks establish structure/provenance, not the correctness of the model's interpretation. A bounded correction attempt can recover invalid output; persistent failure preserves partial work.
8. **Persistence and events make progress recoverable.** `ReviewProgress` saves the review and appends durable events with revision, review, reviewer and relevant document/finding identifiers. Browser SSE reconnects using event IDs; polling can load the latest snapshot when streaming fails.
9. **Human challenges use the same workflow.** An intervention is stored, queued, and processed at a completed-stage boundary. The responsible specialist retains/narrows/withdraws with evidence, then the lead updates. Unsupported assertions are not accepted as facts; hypothetical changes require a branch. Revision changes during an answer prevent it being applied as a current answer.
10. **Completion is not clearance.** A completed run can retain actionable findings, disagreements and coverage gaps. The lead is a human investigation aid, never permission to close or issue insurance.

## Where SOLID helps

The coordinator decides **when** a stage runs; a stage decides **what** evidence task to perform; the model adapter decides **how** to transport it; repositories decide **how** to persist it. Focused interfaces cross those boundaries. Plain helpers remain plain helpers—there is no inheritance framework or interface for every function.
