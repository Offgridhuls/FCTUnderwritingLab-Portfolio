# Code navigation

Read a vertical slice first; you do not need to read every file sequentially.

| Question | Start here | Follow to |
|---|---|---|
| Where is the server assembled? | `backend/Underwriting.Api/Program.cs` | `ApplicationBootstrap.cs` registers constructor dependencies |
| How does login work? | `Api/Endpoints/InvestigationEndpoints.cs` | `Application/Investigations/SessionService.cs`, `Api/LocalRequestMiddleware.cs` |
| What happens when I run a reviewer? | `src/App.tsx` | `Api/Endpoints/ReviewEndpoints.cs`, `Application/Reviews/ReviewCommands.cs` |
| How do stages run? | `Api/ReviewWorker.cs` | `Application/Reviews/ReviewCoordinator.cs` and individual `*Stage.cs` handlers |
| How are simultaneous results handled? | `Application/Reviews/StageExecutor.cs` | channel of results, applied by one coordinator; `ModelCallLimiter.cs` |
| What does the model receive? | `Application/Reviews/ReviewPrompts.cs` | embedded `Infrastructure/Resources` rules, schemas and catalog |
| How are hallucinated citations rejected? | `Domain/Evidence/CitationValidator.cs` | `Application/Reviews/ModelReviewer.cs`, `ResponseSchemaValidator.cs` |
| How do documents become pages? | `Application/Documents/DocumentService.cs` | `Infrastructure/Documents/PdfPigExtractor.cs` |
| How are details suggested? | `Application/Documents/DetailExtractor.cs` | `Application/Investigations/BranchService.cs` confirms origins/revision |
| How is branch comparison decided? | `Application/Comparison/ComparisonService.cs` | `src/features/comparison` presents saved topic outcomes |
| Where are records stored? | `Infrastructure/Persistence/SqliteRepository.cs` | `SqliteDatabase.cs`, `SqliteCommandStore.cs`, `SqliteEventStore.cs` |
| How are model requests sent? | `Infrastructure/Models/CodexModelClient.cs` | `CodexExecutable.cs`; stdio JSON-RPC, restricted ephemeral threads |
| How do UI updates arrive? | `src/hooks/useReviewEvents.ts` | SSE and polling from `Api/Endpoints/WorkspaceEndpoints.cs` |

Paths in the last column are relative to `backend/Underwriting.*` unless marked `src`.

## Familiar C# concepts

- A **record** such as `StartReviewRequest` carries data. A **service** such as `ReviewCommands` executes a use case.
- Constructor parameters are dependencies supplied by ASP.NET Core's built-in container. Domain objects do not locate services themselves.
- `IRepository<Review>` stores reviews; it does not execute HTTP requests or model prompts. The SQLite implementation is replaceable without putting SQL in the workflow.
- `Task<T>` is an asynchronous result. `await` lets a request or worker wait without reserving a thread for the entire network delay. It does not remove the need for locks or bounds.
- `CancellationToken` carries stop requests. Late results cannot overwrite a cancelled review, and incomplete work remains visible on restart.
- Nullable annotations (`Citation?`) make absence explicit. String status values retain the existing JSON contract; transitions are guarded in commands/coordinator rather than spread across the UI.

## Frontend responsibilities

`App.tsx` is the navigation and interaction composition root. Feature components render data and emit user actions; hooks own loading, sessions, commands and subscriptions. `api.ts` is the transport boundary. Generated DTOs describe transport shapes; `shared/types.ts` retains richer view-model unions and legacy-compatible data used by the UI and original tests.

CSS imports preserve the previous cascade: tokens → controls → workspace → responsive/session → cases/review details → comparison. `dark.css` supplies theme overrides. The migration deliberately retains the same screens and interaction patterns.

## Small, safe changes

Change a business rule in Domain/Application and add a relevant deterministic test. Change a transport shape in C#, regenerate contracts, and inspect the diff. Change presentation in its feature directory and run the matching browser test. Keep model wording tests separate from deterministic correctness; fake models verify coordination, not underwriting expertise.
