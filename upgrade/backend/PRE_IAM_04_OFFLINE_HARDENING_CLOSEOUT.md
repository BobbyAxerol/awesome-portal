# PRE-IAM-04 — Offline Security, Contract, Load, Replay, Restore and Rollback Closeout

Date: 2026-08-22  
Branch: `feat/execution_loop`  
Status: `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`  
Scope: credential-free Portal Control API and Rust Execution Edge hardening on SGP

## 1. Acceptance decision

PRE-IAM-04 is accepted at the offline integration boundary. Confirmed H-series
defects are closed, six analytics responses have executable schema/serde parity,
bounded high-cardinality views preserve exact global facts, cursor/gap failures
are distinguishable, and both Portal PostgreSQL stores have executable restore
evidence. A pinned adapter qualification corpus also proves that a failed
candidate cannot replace or poison the rollback target.

This is not production activation. The gate uses no AWS credential, WireGuard
peer, live source, broker, Trading System command or production flag. Registry
delivery profiles remain `fixture`; source reads, projection ingestion, SSE and
commands remain inactive. Stable v1.0.1 was not rebuilt or changed.

## 2. H-series disposition

| Finding | Disposition | Contract/result |
|---|---|---|
| H-1 decimal rounding | previously closed, re-verified | exact decimal parsing rejects values beyond the supported scale instead of rounding |
| H-2 filter/view ambiguity | previously closed, re-verified | canonical `view` selector; unknown legacy filter fails closed |
| H-3 epoch recovery facts | closed | live `epoch_changed` carries active epoch and deterministic `resnapshot_not_before` jitter |
| H-4 sequence-gap reason | closed | non-contiguous projection sequences emit `projection_sequence_gap`, not source discontinuity |
| H-5 cursor ahead of active epoch | closed | emits `cursor_ahead` plus `latest_available_sequence`; it is not mislabeled epoch change |
| H-6 analytics error collapse | closed | safe typed 422 problem codes for contract/scope/accounting/duplicate/correlation faults; arithmetic infrastructure overflow remains 503 |
| H-7 ledger/funnel hard ceiling | closed | whole-source validation and exact aggregates with deterministic bounded latest windows |
| H-8 cursor failure collapse | closed | malformed/tampered, expired and context-mismatched cursors have distinct stable codes |
| H-9 operation response ambiguity | previously closed, re-verified | explicit operation status and verification result remain separate |
| H-10 fixture schema gate | closed | all six analytics fixtures validate against their exact OpenAPI response components |
| H-11 Rust/OpenAPI parity | closed | all six canonical fixtures deserialize into the corresponding Rust response envelope/type |
| H-12 incomplete fixture coverage | closed | funnel, insight batch, correlation, capital ledger and binding exposure join capital preview |

## 3. Delivered hardening boundary

### 3.1 Loss-detectable realtime recovery

Realtime recovery now distinguishes seven causes rather than forcing unrelated
failures into one generic gap. `projection_sequence_gap` identifies a missing
projection sequence, `cursor_ahead` identifies a client cursor beyond the
active epoch watermark, and `epoch_changed` identifies a real epoch cutover.
Recovery facts include the active epoch, latest available sequence where
applicable, and a deterministic client-stable resnapshot deadline bounded by
the configured jitter. This supports staggered recovery without inventing
continuity or hiding source discontinuity.

### 3.2 Cursor and analytics failure contracts

The TypeScript signed cursor codec validates structure and signature before
evaluating lease and context. Callers can now respond differently to
`INVALID_CURSOR`, `CURSOR_EXPIRED` and `CURSOR_CONTEXT_MISMATCH` without
receiving secret material or a raw parsing exception.

Rust analytics failures now use bounded, sanitized Problem JSON. Contract,
scope, accounting, duplicate and correlation failures are client-correctable
422 responses with stable codes. Exact-decimal arithmetic overflow remains a
503 service failure. Internal paths, source identifiers and payload content are
not reflected.

### 3.3 Bounded views with exact global facts

Capital Ledger validates and aggregates the complete supplied population, then
returns the latest 250 rows. It publishes exact per-currency gross totals,
`entry_count`, `returned_entry_count`, `has_more` and `window=LATEST`.

Order Funnel validates the complete supplied event history, retains the first
event for every lifecycle stage, and fills the remaining latest window up to
1,024 rows. It publishes exact total and per-stage counts, returned count,
truncation and `window=EARLIEST_PER_STAGE_THEN_LATEST`. A bounded response is
therefore never mislabeled as the full population.

These are functional bounds and correctness properties. The offline test
budgets are regression alarms, not production latency/SLO claims.

### 3.4 Executable contract and fixture parity

The contract suite now owns one canonical fixture for each of the six narrow
analytics screens. Strict Ajv validation resolves the exact OpenAPI response
component, including local references, and rejects drift. The Rust edge suite
deserializes the same six files into the six concrete output types. JSON Schema,
OpenAPI, generated TypeScript declarations, Rust serde models and the contract
snapshot therefore fail together when an envelope drifts.

### 3.5 Replay, restore and rollback evidence

- projection replay remains deterministic across the locked six-month corpus;
- realtime fan-out remains bounded at the locked 100-subscriber functional
  corpus;
- analytics/query/source qualification caps remain executable, including the
  5,000-record source boundary;
- a rejected, unapproved adapter candidate cannot alter the pinned adapter or
  its accepted corpus result;
- the Control API custom-format PostgreSQL backup restores migrations, users,
  governance and Paper Exit rows to an identical signature;
- the Execution Edge custom-format PostgreSQL backup restores migrations and
  critical active-epoch/projection rows to an identical signature.

The restore drill proves logical consistency for the test database. It does not
replace encrypted production backup, cross-region recovery or owner-witnessed
RTO/RPO evidence.

## 4. Qualification evidence

### 4.1 Contract gate

Command: `./scripts/contracts-test.sh`

- 32/32 schema, fixture and generated-contract tests passed;
- six analytics fixtures passed exact OpenAPI component validation;
- realtime gap fixture/schema/OpenAPI/generated declarations agree;
- contract snapshot regeneration produced no stale generated diff.

### 4.2 TypeScript Control API gate

Command: `./scripts/control-api-test.sh`

- production TypeScript build passed;
- 15 suites and 139/139 tests passed against fresh PostgreSQL 16;
- the existing 182,000-row governance corpus remained green;
- cursor invalid/expired/context mismatch tests passed;
- custom-format dump/restore produced an identical control-plane signature.

### 4.3 Rust Execution Edge gate

Command: `./scripts/execution-edge-test.sh`

- 89 Rust/PostgreSQL tests passed across analytics, auth, edge service,
  contracts, projection, query, realtime, source qualification, adapter,
  TypeScript contract and transport crates;
- six-month replay, 100-subscriber fan-out, PostgreSQL query scale and 5,000
  source-record cap remained green;
- large funnel/ledger windows preserve exact global counts/totals;
- rejected-adapter rollback target and projection PostgreSQL restore signatures
  remained identical;
- `cargo fmt --check` and Clippy with warnings denied passed.

The focused gate found and forced correction of a compile-time decimal
assertion, an inverted gap-reason mapping and an overlong funnel function before
acceptance. This is useful regression evidence; it is not a claim that no
future defect exists.

### 4.4 Canonical offline wrapper

`./scripts/execution-offline-hardening-test.sh` now composes the three gates
above. It requires no cloud or source credential and does not make a network or
runtime activation change.

## 5. Runtime and worktree isolation

- no AWS-HK host, WireGuard peer, IAM role or Security Group was contacted or
  changed;
- no Source Proxy, projection ingestion, SSE or command authority was enabled;
- no Trading System database, Redis, CLI, broker or runtime was read or
  mutated;
- no Portal production/stable image or service was rebuilt;
- temporary PostgreSQL test containers and restored databases are scoped to
  the test scripts and removed by their traps;
- Claude-owned frontend work and the user-supplied hi-fi export remain outside
  this backend commit.

## 6. Claude parallel handoff

Claude can continue frontend integration while Codex prepares PRE-IAM-05:

1. regenerate/consume the published contract declarations rather than copying
   local view-model fields;
2. map `projection_sequence_gap` and `cursor_ahead`, display
   `latest_available_sequence` when supplied, and do not resubscribe before
   `resnapshot_not_before`;
3. distinguish invalid, expired and context-mismatched cursor recovery;
4. consume ledger/funnel `*_count`, returned-count, `has_more`/`truncated` and
   `window`; never label the returned window as the complete history;
5. keep exact gross/per-stage aggregates visually separate from bounded row
   windows;
6. preserve typed 422 analytics problems and all partial/stale/unavailable/gap
   states instead of replacing them with an empty success state;
7. use the five new canonical analytics fixtures alongside capital preview;
8. keep Lane B, realtime and source controls dark and do not infer a production
   latency promise from the offline test budget.

No Claude-owned frontend file was changed by PRE-IAM-04.

## 7. Residual work and exact next slice

PRE-IAM-04 is complete only at
`INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`. Production still needs owner-gated
cross-cell identity/network evidence, live source compatibility, snapshot/SSE
parity, sustained soak, encrypted backup/restore and witnessed rollback/RTO/RPO
drills.

The next item in the canonical queue is `PRE-IAM-05`: prepare the D2 dark
Execution Edge and Source Proxy images, configuration and service manifests;
verify non-root/read-only execution, offline preflight and rollback. It must
leave interfaces/routes/source reads and all production flags off. Claude can
perform the fixture/contract integration above in parallel.
