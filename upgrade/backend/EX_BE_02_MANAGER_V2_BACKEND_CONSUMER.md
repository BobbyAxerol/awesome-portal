# EX-BE-02 — Manager-v2 Backend Consumer

Status: **COMPLETE / BACKEND_ONLY / NO_RUNTIME_ACTIVATION**

Date: 2026-08-28  
Portal branch: `feat/manager-v2-paper-read`  
Predecessor: [`EX_BE_02_MANAGER_V2_PAPER_READ_HANDOFF.md`](./EX_BE_02_MANAGER_V2_PAPER_READ_HANDOFF.md)

## Goal

Add the smallest reusable Rust backend boundary that can consume the already
qualified private Manager-v2 Paper routes through the Portal Source Proxy. It
is a typed, bounded read-through client library only; it does not create a
browser route, UI, Portal API, projection/cache, database write, poller or
runtime activation.

## Approved scope

1. Add a dependency-light `manager-v2-contract` crate that validates and
   embeds the imported owner pack. It owns the sealed five-operation request
   model, typed Manager envelope/unavailable DTOs, catalogue-bound relation
   references, opaque cursor/record-key binding, recursive tagged values and
   fixed Paper/runtime-revision validation.
2. Add a separate `manager-v2-client` crate. It may use the existing Portal
   workload mTLS CA/client identity **only as byte inputs** to a pathless HTTPS
   Source Proxy origin. It creates no JWT, carries no issuer/DB/Redis/broker/
   CLI credential and sends no V1/API-key/Authorization fallback.
3. Implement exactly the five owner-published GET operations: catalogue,
   capabilities, named projection, catalogue-derived relation page and
   catalogue-derived record-by-key. Pages stay bounded to 1..=200 rows and
   response bodies to 1 MiB.
4. Import the owner DTO handoff and historical runtime-wire overlay as
   hash-pinned evidence. The source-dark OpenAPI remains immutable; the client
   recognizes the separately published runtime contract revision and its
   required `record_key` addition.

## Invariants

- `PAPER_BINANCE_USDM` only; no caller-selectable profile, Sandbox, Canary or
  Live.
- No `ts-transport`/V1 reuse or widening. The new client has its own sealed
  request and response boundary.
- No generic method, URL, SQL, header, field, sort, relation or raw key API.
  A relation, cursor and record key must originate from the validated catalogue
  or a preceding Manager response with the same catalogue/profile binding.
- No direct Trading System database access; no issuer signing key/JWT, command,
  Event/SSE/replay, Redis, broker or CLI execution authority.
- No change to Source Proxy, D2/D3/D4/V1, Execution Edge runtime configuration,
  edge-service routes, projection PostgreSQL, migrations, cache, scheduled
  work, UI/frontend or browser listener.

## Test gates

- Contract-pack digest/route/runtime-overlay integrity, including exact five
  GET paths and no secret-shaped imported material.
- DTO negative tests for profile/revision/envelope/value/identifier/cursor/key
  drift, unknown/unsafe fields and typed 503 unavailable results.
- Local transport tests for exact GET/path/query, absence of Authorization and
  V1/API-key headers, TLS/mTLS constructor requirements, origin/redirect/body/
  queue bounds and relation/cursor/key binding.
- `cargo fmt --check`, strict Clippy, targeted contract/client tests and
  `git diff --check`. No source/runtime call is necessary to accept this
  library slice; the already-recorded private route qualification remains the
  runtime proof.

## Rollback and decision boundary

Rollback is source-only: revert the two new crates, contract-import additions
and journals. It changes no active route/container/credential/database state.

This phase deliberately stops before integrating the client into `edge-service`
or exposing a Portal backend API. A future backend request may select one
specific internal consumer/read model and its freshness/error semantics. UI is
outside this document and this implementation.

## Recorded implementation slice — 2026-08-28

Completed in the Portal worktree:

- Imported and hash-pinned the owner Rust DTO handoff plus the historical
  runtime-wire overlay in
  `services/portal-execution-edge-rs/contracts/manager-v2-paper-read-v1/`.
  The build-time contract gate verifies all 15 locked owner artifacts, the
  immutable source-dark contract, the current private publication, the exact
  five `GET` paths, `PAPER_BINANCE_USDM`, the runtime revision and the required
  `record_key` wire addition.
- Added `manager-v2-contract`, independent of `ts-transport`. It accepts no
  arbitrary URL/method/field/sort/profile/key input; its relation, record key
  and cursor requests are bound to a validated catalogue/profile/digest.
  Tagged decimals remain exact strings and all record fields must match the
  owner catalogue safe-column set.
- Added `manager-v2-client`, a TLS 1.3/mTLS-only bounded client for the fixed
  Source Proxy origin. It sends only enum-derived `GET` requests plus an
  internally generated request ID; it has no JWT/API-key/issuer/DB/Redis/
  broker/CLI configuration and no retry loop. It fails closed on redirect,
  contract-header/content-type drift, body/queue bounds and unexpected status;
  a `503` is returned as `ManagerUnavailable` rather than an empty success.
- Kept `edge-service`, Source Proxy, D2/D3/D4/V1, Portal routes, cache/
  projection, database, scheduled work and all runtime configuration untouched.

Executed in the pinned Rust 1.85.1 CI image with a writable worktree mount and
otherwise read-only container, temporary Cargo/target paths only:

- `cargo fmt --all -- --check` — pass.
- `cargo clippy --locked -p manager-v2-contract -p manager-v2-client --all-targets -- -D warnings` — pass.
- `cargo test --locked -p manager-v2-contract -p manager-v2-client` — pass:
  11 unit tests, 0 failed; 0 doc tests.
- `./scripts/execution-d2-test.sh` — pass: `PRE-IAM-05 D2 dark manifest,
  preflight and rollback gates passed. No service started.` The offline gate
  rechecked the expanded 15-file Manager import lock, historical runtime
  overlay, exact five GET paths and dark D2/V1 invariants.

The tests cover runtime/owner-pack drift, strict DTO parsing, exact decimals,
safe field/cursor/key binding, typed `503`, fixed GET path/query generation,
no Authorization/V1/API-key header, mTLS constructor/origin requirements and
response/queue/redirect bounds. This is local isolated evidence only; it does
not re-qualify or invoke the already-qualified private source route.

Cleanup completed: the two exact `/tmp/manager-v2-*` Cargo/target test paths
and the locally built `portal-execution-edge-ci:rust-1.85.1` image were removed
after the gates; no test container remained. No source route, Portal runtime,
database, credential or business data was created, changed or retained.
