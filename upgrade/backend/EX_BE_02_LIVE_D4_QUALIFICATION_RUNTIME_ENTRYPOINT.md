# EX-BE-02-LIVE — D4 BUILDING Qualification Runtime Entrypoint

Date: 2026-08-25  
Status: `D4_RUNTIME_ENTRYPOINT_OFFLINE_ACCEPTED / LIVE_WINDOW_PENDING / NO_SOURCE_CALL`

## Outcome

The Portal Execution Edge image now contains a finite, owner-windowed D4
runtime path. It is not attached to the long-running Edge HTTP server and it
cannot expose a listener. Two explicit commands exist:

- `d4-prepare-building` idempotently creates exactly the owner-declared epoch
  UUID in `BUILDING`; and
- `d4-qualify` resumes the durable snapshot/event checkpoint, calls only the
  enum-derived D4 read contract through mTLS Source Proxy, writes only the
  Portal projection database and emits a sanitized evidence report.

Neither command can activate an epoch or provide Query API, analytics, SSE,
commands, registry promotion or Trading System mutation authority.

## Corrected implementation boundary

The interrupted implementation was not kept as an untested partial patch. It
was completed and tightened before commit:

1. the exact caller UUID, Paper scope, adapter version, source facade digest,
   capability digest, creation time and lifecycle state are locked in one
   transaction;
2. retrying the same identity returns `ALREADY_DURABLE`;
3. reusing the UUID with metadata/time/scope/status drift fails closed;
4. the owner change window is revalidated inside the Rust process and is
   limited to two hours, with a ten-second shutdown margin;
5. the deployment/mapper commit, D2/D3 predecessors, dedicated read-identity
   evidence, encrypted-storage evidence and all permanent false authority
   flags must match before opening the database or constructing a client;
6. source transport remains fixed to HTTPS, TLS 1.3, workload mTLS, HTTP/2,
   two concurrent requests, five-second request timeout and 1-MiB response;
7. the Trading System read key is structurally absent from the Rust config;
   only Source Proxy owns and injects it; and
8. the run is capped at 10,000 requests, 7,200 seconds, three transient retries
   and the remaining owner window, whichever is stricter.

## Deployment assets

- `services/portal-execution-edge-rs/crates/edge-service/src/d4_command.rs`
- `deploy/execution-d4/qualification-runtime.env.example`
- `deploy/execution-d4/compose.paper-read-shadow.yaml`
- `scripts/execution-d4-qualification-preflight.sh`
- `deploy/runbooks/execution-d4-paper-shadow-and-rollback.md`

`paper-read-qualifier` is Compose-profile gated, has no ports, runs as UID
65532, uses a read-only filesystem, drops every Linux capability and exits
after one bounded qualification. The D4 owner input is injected as a non-secret
environment file only after the canonical Python readiness validator accepts
it. A separate qualifier env binds the SHA-256 of those exact validated bytes;
it is deliberately not added to the older D1 env schema.

## Verification

Offline evidence completed on 2026-08-25:

- 142 Rust tests passed across the workspace;
- the PostgreSQL integration test proves explicit-UUID idempotency, metadata /
  time collision rejection and Paper-only BUILDING status;
- rustfmt and strict `cargo clippy -- -D warnings` passed;
- fresh PostgreSQL replay, restart, gap, source-backed repository and bounded
  load gates passed;
- custom-format PostgreSQL dump/restore produced the same projection signature;
- the D4 Nginx/Compose gate proved exactly four routes, correct profile/command,
  no published source/database port and no source API key in the qualifier; and
- the workspace remains source-dark: no live Source Proxy, source credential,
  Paper business request, projection epoch or registry change was made by this
  implementation/test slice.

## Remaining live gate

This is executable preparation, not D4 acceptance. A new owner-approved window
must still:

1. build/publish the committed image and bind its immutable digest;
2. install the separate qualifier env and combined mTLS client identity;
3. pass owner, storage, Source Proxy and qualifier readiness preflights;
4. start encrypted PostgreSQL and run migrations;
5. prepare the declared BUILDING epoch;
6. start only the D4 Source Proxy and run the finite qualifier;
7. capture replay/parity/cursor-gap/freshness/restart/load/backup-restore
   evidence; and
8. roll Source Proxy/qualifier back to accepted D2 dark while leaving the epoch
   non-queryable.

Until that window succeeds, status remains `LIVE_WINDOW_PENDING`; D4 is not
accepted and the objective is not complete.
