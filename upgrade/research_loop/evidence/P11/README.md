# P11 backend and contract packet — Progress, console and artifact readiness

Status: **BACKEND_AND_TYPED_CONTRACT_COMPLETE; feature-dark; S03 consumer and
browser acceptance remain Claude-owned.** This packet does not claim a running
Research job, deployment, browser receipt or a release claim.

## Delivered boundary

P11 adds a source-owned, structured journal for one exact P10/P06 worker lease
and a bounded Control API materialisation. It is not a parser for legacy
stdout, a direct QuantBT/Data Loader/Execution Edge connection, a CLI, or a
browser-to-worker transport.

| Surface | Contractual behaviour |
|---|---|
| Source journal | Atomic snapshot plus fsync NDJSON segments; max 128 events per segment, 80 segments retained; reopen validates the compact snapshot shape and an explicit `retention_floor_sequence` prevents invented replay continuity. |
| Private callback | `POST /internal/research/progress/events`; short-lived signed `research_progress_writer` principal plus exact workspace/run/job/worker-attempt/lease tuple. It is intentionally not public or façade reachable. |
| Durable read | PostgreSQL immutable event rows and compact current snapshot; the snapshot advances only when its exact latest event is committed and is capped at 256 KiB (full artifact/log history remains outside P11). |
| Same-origin BFF | Generated `research-progress.openapi.json` exposes exactly progress, SSE, bounded console and cooperative cancel. `ProgressEvent` is an event-type discriminated union rather than an untyped payload bag; public DTOs deliberately omit `attempt_id`, `lease_epoch`, source roots, broker/NATS and principal inputs. P11 sealed artifacts always have `reader_href: null` until a separate authorized reader exists. |
| SSE | 20 in-process viewers/run, live buffer 16, persisted catch-up max 500, terminal/gap/auth frames close the connection. The browser must fall back to bounded snapshot polling. |
| Completion | `COMPLETED` requires source mandatory readiness `SEALED`; Control cancellation wins a concurrent source completion and is projected as `CONTROL_CANCELLATION`. |
| HIFI display facts | `fold_timeline` and `claim.methodology_certificate` are now source-owned, typed facts. The current P04 adapter publishes explicit `NOT_PUBLISHED`, not fabricated Search/OOS/freeze segments or an A–D certificate. |

The Portal worker writes actual P10 hook facts, artifact-writing/sealed events
and a P11 bundle receipt. If the Control API callback is unavailable, source
journal recovery relays the fsync'd records later; it never starts/retries a
run or changes a sealed bundle.

## Screen-03 display-fact amendment

`CG-P11-01` and `CG-P11-02` are resolved at the contract boundary by
[the display-fact amendment](./contract-amendment-display-facts.md). It adds
an exact `fold_segment_observed` source event and a separate methodology
certificate object. The source—not the browser—can now publish a true
search/OOS/freeze timeline or a real A–D certificate in a future adapter.

The current P04 qualification deliberately remains `NOT_PUBLISHED` for both
surfaces: it exposes only a whole-fold lifecycle and an optional claim, not a
segmented methodology/certificate fact. Screen 03 must retain one honest band
and omit the chip until that changes. This is a complete typed outcome, not a
generic unavailable state or a deferred frontend parsing task.

## Feature and deployment state

All P10/P11 flags default to `false`; no image, runtime container, database
outside an isolated test cell, dev stack or deployment was changed. The
additive overlay and rollback procedure are in
[the dark-runbook](../../../../deploy/runbooks/research-p11-progress-dark-and-rollback.md).

Production activation requires a separately approved change window and all
four P10/P11 feature flags together. P11 does not activate itself merely
because the migration exists.

## Evidence run

All commands ran against this worktree and passed.

| Proof | Command | Result |
|---|---|---|
| Source journal / rotation / seal / relay ACK / recovery discovery / compact-snapshot bound / no-inference display facts | `cd apps/portal/backend && PYTHONPATH=src:.. /home/bobby/pool_alpha/.venv/bin/python -m pytest -q -c pyproject.toml tests/test_research_progress.py` | 9 passed |
| P11 source-terminal crash recovery / reclaimed-journal fence / P10-P11 worker regression | `cd apps/portal/backend && PYTHONPATH=src:.. /home/bobby/pool_alpha/.venv/bin/python -m pytest -q -c pyproject.toml tests/test_research_progress.py tests/test_research_run_producer.py tests/test_durable_worker.py` | 26 passed; uses the repository-pinned `quantbt-engine 1.1.1` |
| P11 durable PostgreSQL integration | `bash scripts/research-loop-v11/test-p11-postgres.sh` | 3 passed; fresh migrations in a disposable tmpfs PostgreSQL container, automatically removed |
| Control contract / activation guard / bounded snapshot / revoked-stream close / slow-auth backpressure / exact display-fact shapes / rolling-source normalization | `npm --prefix apps/control-api test -- --run test/research-progress.contract.spec.ts test/research-progress.controller.spec.ts test/config.spec.ts` | 18 passed |
| Control compilation | `npm --prefix apps/control-api run build` | pass |
| Generated contract / pinned output | `npm --prefix packages/contracts run generate:research-progress && npm --prefix packages/contracts test -- --run test/research-progress.spec.ts && bash packages/contracts/tooling/verify-generated.sh` | 3 focused + 146 generated-contract tests passed |
| Route ownership | `npm --prefix apps/portal/frontend test -- --run src/execution/r2Ledger.test.ts` | 22 passed |
| Compose render-only | `docker compose -f compose.yaml -f deploy/compose.research-progress.yaml config -q` | pass |

The isolated PostgreSQL test starts an accepted P10 intent and tests: duplicate
callback idempotency, gap rejection, stale lease rejection, database restart
readback, source completion versus cancellation CAS, and rejection of an
unsealed completion before a P06 terminal change. It also proves that a new,
contradictory terminal source event is rejected before it can be inserted after
Control cancellation. No raw data, secret, worker
handle or artifact path is captured in this packet.

The source crash proof is intentionally stricter than a broker-notification
test: after a source `COMPLETED` journal and immutable bundle have been fsync'd,
a redelivery may reconcile the local attempt but must not invoke the engine
again. Conversely, a reclaimed non-terminal journal is fenced as `LEASE_LOST`;
P11 has no in-place retry/reset semantics, so a later P12 retry must create a
new attempt rather than duplicate work or rewrite its progress history.

## Exit-gate accounting

- Backend-owned P11 authority, contract, source hook, recovery, bounded
  buffers, migration and dark rollback: **complete**.
- `P11-T01…T07`, backend portions of `T11/T12`: covered by source/contract/
  fresh-PostgreSQL proofs above, including the 20-viewer cap and a revoked
  workspace membership closing the SSE boundary on its next five-second lease
  check. A slow lease lookup cannot accumulate monitor promises between ticks.
- Screen-03 HIFI composition, EventSource lifecycle, 5-second polling UI,
  console interaction/a11y, visual/browser acceptance (`P11-T08…T10` and
  browser portions of `T11/T12`): **not claimed; Claude-owned**.
- `V11-P11-DR/BR/GX` real-run / browser / deployment evidence: **not run by
  design while features remain dark**.

## Next owner

Claude should use the generated contract only and follow
[the S03 handoff](./frontend-handoff-claude.md), including the display-fact
amendment. A later activation owner must follow the dark-runbook; no caller
should bypass it with a manual release-dir edit or a direct service/database
connection.

## RS-01 corrective amendment — 2026-09-22

Terminal source completion is now not enough to make the public state
`COMPLETED`: the immutable `run_terminal_materializations_v1` checkpoint must
be visible after evidence/split sidecars and durable lifecycle application.
Until then the BFF exposes `FINISHING` plus `terminal_materialization=PENDING`.
An exact duplicate terminal callback is an allowed recovery input: it may
re-fanout after the checkpoint but never reruns QuantBT or rewrites a journal
fact. The additive migration/grants and retry/restart proof are recorded in
[RS-01](../RS-01/phase-report.md).
