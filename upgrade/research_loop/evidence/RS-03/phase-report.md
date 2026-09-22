# RS-03 backend phase report — independent retained-current-source acceptance

Date: 2026-09-22  
Status: **BACKEND_INDEPENDENT_ACCEPTANCE_COMPLETE; feature-dark; frontend
integration and product/P18 acceptance remain pending.**

## Delivered scope

`apps/control-api/test/research-rs03-current-source-acceptance.spec.ts` runs
against a new UUID-named PostgreSQL database inside one disposable tmpfs-only
PostgreSQL container. The test creates two real local accounts/workspaces,
uses the normal dev-session login path, imports five bounded retained relation
batches through `ResearchCurrentSourceRepository`, writes the immutable seal,
then calls the six actual HTTP BFF operations.

| Assertion | Evidence from the actual HTTP/database path |
|---|---|
| named contract | all six response schemas parse; no manual client DTO is involved |
| exact source truth | seal count is `3/2/2/1/1`, decimal values remain strings and UTC stays epoch milliseconds |
| privacy / authority | unauthenticated request is `401`; a different workspace is hidden as typed `404` |
| cursor correctness | a Search cursor is rejected by Replay; a Replay playhead yields only `RESEARCH_MODEL_SAMPLE_NOT_BROKER_EXECUTION_STATE` |
| HTTP cache correctness | Evidence ETag returns `304`; Search/Replay are `private, no-store` |
| bound / raw escape | `limit=201` is typed `400`; every document is below 1 MiB and the retained private sentinel cannot leave through any BFF response |
| no producer side effect | the sealed local lane has nine retained rows / one seal while `research.runs`, `research.jobs` and `research.run_progress_events` stay empty |

The corpus is an explicitly labelled **synthetic contract corpus**, not a
claim that it is a production QuantBT result. It is sufficient to exercise
the exact custody-to-browser boundary without recomputing an engine run. The
separate RS-02 adapter and P05 reader evidence remain the authority for
source-adapter/reader conformance.

## Tests actually run

| Gate | Command | Result |
|---|---|---|
| RS-03 fresh PostgreSQL + authenticated BFF | `bash scripts/research-loop-v11/test-rs03-postgres.sh` | **3 passed**; new tmpfs container/database removed by trap |
| RS-02 focused BFF/custody regressions | `cd apps/control-api && npm test -- test/research-current-source.service.spec.ts test/research-current-source.controller.spec.ts test/research-current-source.repository.spec.ts` | **13 passed** |
| production TypeScript compilation | `cd apps/control-api && npm run build` | **pass** |

`npm run typecheck` remains red on pre-existing broad test-fixture/type issues
outside RS-03 (the repository's test-aware `tsconfig` includes historical
Execution specs); it is not used to certify this slice. The new RS-03 spec is
compiled/transformed and passed by Vitest and the production build is green.
No broad frontend build, visual-baseline re-record or runtime test was run:
none was changed and each would be a false RS-03 receipt.

## Boundary, rollback and next owner

The implementation is test/evidence-only: no migration, API shape,
feature-default, source adapter, runtime container, database data, credential
or deployment setting changed. Rollback is simply to remove this acceptance
test/evidence from a development branch; retained immutable facts must never
be deleted as a rollback shortcut.

Claude owns the next step: connect generated RS-02 operations into the rich
S04–S08 product routes and return visual/browser receipts. Bobby reviews the
combined packet before P18. See [frontend-handoff-claude.md](./frontend-handoff-claude.md).
