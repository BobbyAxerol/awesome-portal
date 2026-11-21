# P17 phase report — route-aware replay and state-at-cursor

Date: 2026-09-22  
Base before P17: `622c10c3` (`docs/research-loop-plan`)  
Status: **BACKEND_CURRENT_SOURCE_CONTRACT_COMPLETE; feature-dark; no frontend,
runtime, source artifact, worker, command or deployment claim.**

## 1. Scope delivered

P17 adds one named, session/workspace-scoped same-origin BFF reader:

1. It reads only P13's immutable Hub and `EQUITY_OOS` series through
   `ResearchEvidenceService`; it does not query a worker, raw data, artifact,
   source DB, Execution Edge, broker, Redis or CLI.
2. It derives an immutable P17 revision from the retained P13 Hub/series
   revisions and P04 transform digest. A page or direct-seek cursor is signed
   by the existing Portal keyring and bound to workspace, run, exact revision,
   resource and direction.
3. It returns no more than 100 chronological source display samples under a
   1 MiB response budget. `at` returns a bounded window around one exact
   selected sample; page cursors and playhead cursors are intentionally
   different resources and cannot be substituted.
4. It preserves exact decimals, UTC milliseconds, sampling kind and source
   observation count. A selected sample is explicitly retrospective equity,
   never an inferred execution account, position, order, fill, trade or event
   state.
5. It exposes all unprovided P04 replay panels as stable typed source gaps.
   P11 lifecycle progress is never reused as an execution sequence.

No TSX/CSS/HiFi/frontend fixture was modified by Codex. Claude's P12 work was
left unstaged and untouched.

## 2. Authority, safety and resource model

| Layer | Implementation | Guard |
|---|---|---|
| source reader | existing P13 persisted evidence Hub + `EQUITY_OOS` reader | session/workspace scope inherited from Research evidence service; no direct source reads |
| replay reader | `ResearchReplayService` | `FEATURE_RESEARCH_REPLAY=true` plus P13 enabled; source adapter/revision/sampling compatibility checked before issuing data |
| HTTP BFF | `GET /api/v1/quantbt/runs/:runId/execute/replay` | session guard, membership concealment, strict run/query schema, ETag and typed 400/404/503 response |
| cursor | existing `KeysetCursorCodec` | signed keyring, TTL, workspace/run/revision/fingerprint/direction binding; invalid/expired/change-of-revision is 400, never fallback scan |
| response | generated `research-replay.v1` | exact strings/UTC ms, ≤100 items, ≤1 MiB; no source cursor/relation/raw inputs exposed |
| persistence | **none added** | no table, migration, cache, worker, volume, job, checkpoint or background loop |

## 3. Capability conclusion

The installed fixed P04 source contains no execution evidence ledger. The
current slice is intentionally useful for one truthful equity playhead, but
cannot satisfy generic replay expectations such as original order/fill IDs,
partial fills, OCO graph, funding, multi-leg, candles, MAE/MFE, actual
same-timestamp causal order, fold capital convention or child audit lineage.

Those are **typed source capability boundaries**, not skipped implementation
work. See [source-capability-matrix.md](./source-capability-matrix.md).

## 4. Test evidence

| Gate | Command | Result / coverage |
|---|---|---|
| P17 service/controller/contract/config | `cd apps/control-api && npx vitest run test/research-replay.contract.spec.ts test/research-replay.service.spec.ts test/research-replay.controller.spec.ts test/config.spec.ts` | pass: 4 files / 24 tests; validates bounds, typed absences, page/direct-seek isolation, revision/workspace binding, ETag and dark-flag dependency |
| Generated contract | `npm --prefix packages/contracts test -- --run test/research-replay.spec.ts` | pass: 1 file / 3 tests; named operation and no command/source authority |
| Fresh P17 PostgreSQL proof | `scripts/research-loop-v11/test-p17-postgres.sh` | pass: 1 focused P10→P13→P17 case in a named tmpfs PostgreSQL 16 container; direct/far seek reads retained samples only; no P17 relation, new job or event is created |
| Production TypeScript build | `npm --prefix apps/control-api run build` | pass |
| Generated snapshot/verifier | `python3 packages/contracts/tooling/snapshot.py` and `packages/contracts/tooling/verify-generated.sh` | pass: 11 files / 164 contract tests and all generated declarations match their source OpenAPI |
| Route ownership ledger | `npm --prefix apps/portal/frontend test -- --run src/execution/r2Ledger.test.ts` | pass: 22 tests; P17 route classified/owned with evidence |

Tests that require actual orders/fills/OCO/funding/multi-leg/candles/MAE-MFE,
or browser Screen-08 UI are not claimed as P17-A success. They are blocked by
the source fact set or owned by the frontend phase respectively.

## 5. Cleanup and rollback

One `research-p17-postgres-*` test container was created with tmpfs PostgreSQL
data and removed by its shell EXIT trap. No broad prune, volume/image/cache
deletion, restart, runtime configuration change, deployment, source-data
change or Execution/Trading System call occurred.

Rollback is a signed release with `FEATURE_RESEARCH_REPLAY=false`; P13
immutable evidence remains retained and no P17 data rollback exists.

## 6. Handoff

**P17-A has no known backend technical debt.** The full generic replay target
requires new versioned source evidence and must not be filled through direct
DB/artifact access or browser inference. Claude owns Screen 08 consumption;
see [frontend-handoff-claude.md](./frontend-handoff-claude.md).

## RS-01 corrective amendment — 2026-09-22

The original ETag statement is replaced by the [RS-01](../RS-01/phase-report.md)
cache/cursor rule: replay responses are `Cache-Control: private, no-store` and
never 304, because a cursor-bearing page cannot safely reuse an HTTP body.
Opaque cursor expiry is `409 RESEARCH_REPLAY_CURSOR_EXPIRED`; an explicit
`at_ordinal` is the safe public re-location input. Replay now receives a
single revision-pinned Hub/series bundle and scoped cancellation/admission.
This closes A05/A06/A08 correctness only; execution-ledger source facts and
full S08 acceptance remain RS-02/RS-03 work.

## RS-02 delivery amendment — 2026-09-22

The admitted Advanced-WFO lane now serves bounded retrospective model
observation/return samples and relation-bound opaque playheads from local
retained data. It never accepts a raw source ordinal or exposes an internal
relation/cursor. Orders, fills, candles, broker state and authoritative live
execution replay remain typed source gaps. See the
[RS-02 matrix](../RS-02/field-action-coverage-matrix.md).
