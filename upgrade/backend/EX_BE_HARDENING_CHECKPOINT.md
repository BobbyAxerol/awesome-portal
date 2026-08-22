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

**Status: complete (2026-08-22).** The source repository now verifies a canonical ordered
fact digest before decoding, evaluates venue-aware quality across every
correlation fact, preflights exact fact count and a 32 MiB aggregate payload
ceiling, and enforces bounded identifiers, fact payloads and canonical SHA-256
digests in PostgreSQL. Insight batches accept a validated portfolio-wide source
superset but allow only requested IDs to affect the result or quality floor.

The TypeScript analytics bridge now has independent request and queue deadlines,
a configurable FIFO concurrency/queue bulkhead, single-settlement response
handling, response byte and JSON content checks, aborted-stream handling and
HTTP/2 GOAWAY retirement. These limits apply before assertion issuance and
connection acquisition, so overload cannot create an unbounded pending-work
set.

Evidence:

- `./scripts/execution-edge-test.sh`: 75/75 Rust/PostgreSQL tests, the 182,000-row
  corpus, `rustfmt`, and Clippy with `-D warnings` passed.
- `./scripts/control-api-test.sh`: production TypeScript build, fresh PostgreSQL
  migrations and 111/111 tests passed.
- Tests cover source-superset selection, tamper detection, multi-authority and
  paused-session quality, queue saturation, queue expiry and permit recovery.
- Runtime flags remain false and every registry delivery profile remains
  `fixture`.

## Gate before offline EX-BE-08a

H1–H3 are implemented in commits `9249819`, `469485d` and `c3fd2ba`; component
gates and root workspace verification are green, and no delivery profile or
production flag changed. The stop-gate is closed. The independently documented
offline EX-BE-08a corpus/replay/qualification harness may proceed; live-source
or cross-cell work still requires its own owner-gated evidence.
