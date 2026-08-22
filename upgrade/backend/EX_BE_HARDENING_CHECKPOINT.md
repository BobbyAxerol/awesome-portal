# Execution Backend Hardening Checkpoint

> **Scope:** Portal-owned TypeScript Control API and Rust Execution Edge only  
> **Trading System authority:** unchanged; no source, database, Redis, CLI or
> runtime mutation is permitted  
> **Activation:** none; registry profiles remain `fixture` and runtime flags
> remain false

This checkpoint closes defects found by reviewing `EX-BE-03`, `EX-BE-06` and
`EX-BE-07b` as one delivery path before beginning offline `EX-BE-08a` source
qualification. It is intentionally split into independently reviewable commits.

## H1 — realtime lifecycle, epoch cutover and freshness

**Status: complete (2026-08-22).**

- The TypeScript BFF now owns an SSE stream until the downstream response
  closes, the upstream aborts, or the authenticated Portal session lease is no
  longer valid. Each terminal path removes listeners, stops the lease monitor
  and cancels the private HTTP/2 stream exactly once.
- The Rust journal poller now follows a cursor per **ACTIVE epoch**. BUILDING
  epoch records cannot advance or poison a global cursor. On activation the
  first authoritative record terminates old-epoch subscribers with the existing
  typed `epoch_changed` recovery contract, while rebuild history is not fanned
  out as live traffic.
- Poller startup and later PostgreSQL failures no longer kill the background
  task. Readiness fails closed while the poller is unavailable and recovers only
  after a successful poll without discarding epoch cursors.
- Realtime events use the same versioned, server-evaluated freshness model as
  snapshots. The envelope carries `freshness_policy_version`; venue state is an
  explicit bounded configuration and defaults to `UNKNOWN` until an audited
  source/calendar owns it.

Evidence:

- `./scripts/execution-edge-test.sh`: 74/74 Rust/PostgreSQL tests, `cargo fmt`
  and strict Clippy passed.
- `./scripts/control-api-test.sh`: production build and 107/107 tests passed.
- PostgreSQL coverage proves BUILDING is ignored before cutover and the new
  ACTIVE epoch becomes the only realtime watermark after cutover.
- TypeScript coverage proves downstream close and lost-session cleanup.

## H2 — identity and governance binding

**Status: complete (2026-08-22).**

- `auth_time` in both realtime and analytics delegated JWTs now comes from the
  immutable Portal session creation time loaded from PostgreSQL; issuing or
  refreshing a short-lived edge assertion cannot make the user appear newly
  authenticated.
- A new append-only `governance_approval_analytics_scopes` relation binds one
  R2 approval to exactly one workspace, portfolio and currency. A composite
  foreign key proves the parent request is the same workspace and gate.
- Capital Preview is ADMIN-only, hides missing/cross-workspace/closed/expired
  scopes, validates a strict exact-decimal request, and refuses any client body
  whose portfolio or currency differs from the immutable approval binding.
- This only authorizes a read-only preview. It does not approve, allocate,
  deploy or relay a command, and the analytics feature remains dark.

Evidence:

- `./scripts/control-api-test.sh`: production build, fresh PostgreSQL migration
  and 109/109 tests passed.
- Tests cover historical `auth_time`, ADMIN/USER behavior, scope mismatch,
  disabled-runtime behavior and database rejection of scope rebinding.

## H3 — analytics integrity and resource isolation

**Status: pending.** Close insight subset drift, source digest/quality/session
integrity, payload bounds, HTTP/2 timeout/GOAWAY behavior and analytics
concurrency/queue limits.

## Gate before offline EX-BE-08a

H1–H3 must all be committed, the Rust and Control API gates must be green on a
fresh PostgreSQL test database, contracts/workspace verification must pass, and
no delivery profile or production flag may be activated. Only then may the
offline EX-BE-08a corpus/replay/qualification harness begin.
