# EX-BE-06 — Multiplexed SSE, Resume, Gap Recovery and Backpressure

Status: `FOUNDATION_COMPLETE / SOURCE_AND_ACTIVATION_EVIDENCE_PENDING`  
Date: 2026-08-21  
Authority: Portal delivery edge only. Trading System was not changed and remains
the execution/risk/accounting authority.

## 1. Delivered boundary

The screen opens one same-origin stream:

`GET /api/v1/execution/command-center/stream?cursor={epoch}:{sequence}`

The TypeScript Control API validates the active Portal session, derives user,
workspace, role and session identity, then issues a short-lived RS256 assertion
for the exact `execution:command-center` resource. The assertion stays on the
server. A reusable mTLS HTTP/2 session multiplexes private requests to:

`GET /internal/v1/realtime/stream`

Rust verifies audience, environment, read scope and exact resource, then owns
replay, epoch decisions and SSE delivery. The browser never receives a source
credential, edge certificate or delegated token.

## 2. Rust delivery architecture

- `realtime-sse` defines `execution.realtime.v1`, typed projection envelopes,
  gap reasons and a bounded Tokio broadcast hub.
- One PostgreSQL journal poller per edge process tails committed ACTIVE/RETAINED
  projection events. It does not poll once per browser.
- Each browser receiver has a bounded queue. Broadcast lag produces one
  terminal `projection.gap(reason=slow_consumer)` and closes; it never grows an
  unbounded buffer or silently drops data.
- The replay/live race is cursor-deduplicated. A non-contiguous Portal sequence,
  a `GAP_APPLIED` source observation or an epoch change becomes a typed gap.
- Event `id` is exactly `{projection_epoch}:{projection_sequence}`. Source
  cursor/sequence remain separate nullable facts.
- Replay is capped at 1,024 events by default and at 2,048 by validation. A
  larger recovery becomes `replay_window_exceeded` and requires a snapshot.
- Heartbeats are typed and do not advance the Last-Event-ID. The stream emits
  `auth.expiring` and closes before the maximum 60-second assertion expires.

Resume uses the EX-BE-03 decision unchanged:

1. same active epoch and retained history present → bounded replay, then live;
2. cursor precedes retained history → `history_evicted`;
3. prior/unknown epoch → `epoch_changed` plus deterministic server-assigned
   `resnapshot_not_before` jitter;
4. source or Portal sequence discontinuity → visible stale/resnapshot path.

## 3. TypeScript same-origin boundary

- Initial connect requires the snapshot cursor query parameter; reconnect uses
  `Last-Event-ID`. Conflicting, repeated, missing or malformed cursors fail 400.
- The proxy pins HTTPS, a configured CA and client certificate/key, and requests
  ALPN `h2`. Redirects and browser-supplied upstream origins do not exist.
- One HTTP/2 session is reused; the proxy caps four streams per Portal session
  and 512 per process. Node stream piping preserves transport backpressure.
- The Portal session lease is rechecked every five seconds. Revocation, expiry
  or database uncertainty cancels the private stream. Rust's short JWT lifetime
  additionally forces periodic reconnect through `SessionGuard`.
- `no-store`, `X-Accel-Buffering: no` and `nosniff` are applied on both hops.

## 4. Docker and activation

Both switches default false:

- AWS edge: `EDGE_REALTIME_SSE_ENABLED=false`;
- SGP proxy: `FEATURE_EXECUTION_REALTIME_SSE=false`.

`deploy/compose.execution-realtime.yaml` is an opt-in SGP overlay with read-only
root-owned mTLS/delegation secrets. `deploy/compose.execution-edge.yaml` owns
bounded queue/replay/poll/heartbeat/jitter values. Do not include the overlay or
change registry `sse_enabled` until source projection, WireGuard/PKI and
cross-cell qualification evidence exist.

## 5. Evidence

- Rust gate: `./scripts/execution-edge-test.sh` — PostgreSQL 16 migration and
  restart, replay repository, 51 Rust tests, `cargo fmt`, strict Clippy.
- Load/backpressure unit: one publish reaches 100 concurrent screen receivers;
  a 4× queue burst makes a slow receiver gap and terminate; replay/live
  duplicates are suppressed and a real sequence hole gaps.
- PostgreSQL integration: exact active availability, bounded `has_more` replay,
  workspace scope, global journal high-water tail and invalid limit fail closed.
- TypeScript gate: `./scripts/control-api-test.sh` — production build plus
  102/102 tests on PostgreSQL, including exact resource assertion, cursor,
  session-lease revocation/expiry and HTTPS/mTLS configuration policy.
- Cursor signatures and payloads must be canonical Base64URL; the verifier
  rejects alternative encodings before HMAC comparison. Base, standalone AWS
  edge and base-plus-SGP-realtime Compose definitions all render cleanly.

The tests prove the foundation, not live SGP↔AWS operation. Still required:
real source projection integration, proxy↔edge mTLS test with provisioned PKI,
100-client cross-cell soak, H2/H3 browser-edge proof, reconnect/revocation drill,
metrics/SLO acceptance and registry activation.

## 6. Frontend handoff to Claude

Claude should now implement the M3 transport adapter against the existing pure
subscription reducer:

1. snapshot first and open exactly one `EventSource` per Command Center screen;
2. map typed data events to `DELTA` without parsing decimals as numbers;
3. on `projection.gap`, keep the last-good view visibly aging, clear the resume
   cursor and resnapshot no earlier than `resnapshot_not_before`;
4. on `auth.expiring`/disconnect, show reconnecting and let same-origin retry;
5. add fixture tests for slow consumer, history eviction, source discontinuity,
   epoch jitter and heartbeat-without-cursor-advance;
6. keep the registry profile `fixture` and do not mark the endpoint live.

In parallel, Claude can finish the EX-BE-04b previous/next cursor UI, server-
interval zoom re-query and cold-retention fixtures. The next backend slice is
`EX-BE-07a`, which will publish pure analytics contracts for Gate R2, Blotter,
Alpha/Portfolio/Account 360 without activating a source endpoint.
