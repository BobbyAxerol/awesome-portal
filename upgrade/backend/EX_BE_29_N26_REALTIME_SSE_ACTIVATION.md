# EX-BE-29 — N26 Realtime SSE Activation

**Status:** `COMPLETE / IMPLEMENTATION_AND_RELEASE_QUALIFIED / SIGNED_DEV_DEPLOYMENT_PENDING`  
**Date:** 2026-08-30  
**Branch:** `feat/execution-manager-campaign`  
**Runtime effect:** no dev/stable deployment, source mutation or command activation

## 1. Result

N26 adds one authenticated realtime path over the durable N24/N25 Portal
projection. It does not add another Trading System poller. One complete
Manager projection cycle becomes one shared PostgreSQL journal observation;
all Edge replicas resume from that epoch/sequence and fan out through bounded
in-process queues.

```text
complete N24 projection cycle
  -> atomic complete-cycle realtime sequence + observation
  -> shared PostgreSQL journal
  -> profile-bound Rust Edge snapshot/resume
  -> bounded local SSE fan-out
  -> session/workspace guarded TypeScript BFF
  -> browser
```

## 2. Complete-cycle publication invariant

Migration `0014_manager_realtime_cycle_journal.sql` adds an immutable,
per-epoch `realtime_sequence` and `realtime_observation` to completed Manager
cycles. The sequence is assigned in the same transaction that seals the cycle.
Per-feed projection writes are never visible through N26, so a source failure
halfway through 13 feeds cannot publish a partial UI delta.

Historical N24 cycles remain immutable and receive no fabricated N26 cursor.
An epoch becomes N26-capable only after a new complete cycle. The manager
realtime repository reads only those complete-cycle observations, retains
profile/environment/workspace isolation and returns a valid empty Live
snapshot when the complete cycle contains zero facts.

## 3. Runtime authority and transport

The new owner evidence uses the closed authority bundle
`PROJECTION_QUERY_REALTIME_COMMANDS_DISABLED`; independently flipping a command
boolean cannot widen a reviewed manifest. Acceptance also pins all three
profiles, audiences, catalogue digests, projection/adapter/contract revisions,
image digests, named evidence digests and owner approval.

The Edge exposes manager projection snapshot/resume only when:

- Manager reads and N25 analytics Query are enabled;
- the exact profile/environment and delegated JWT resource
  `execution:manager-realtime` match;
- the ACTIVE epoch has an N26 complete-cycle high-water; and
- the accepted activation manifest matches the running release.

Each replica polls the shared journal in batches of at most 512 and publishes
to a 256-message subscriber queue. Retention loss, cursor-ahead, sequence gap,
epoch change and slow consumer produce one terminal `projection.gap` with
`reconnect_required=false`. Portal-session expiry produces one terminal
`auth.expired`, closes the upstream stream and ends the browser response.
`auth.expiring` remains the only normal credential-refresh reconnect path: the
BFF then mints a new delegated JWT from a still-valid Portal session.

## 4. Release and rollback

The release profile, profile-isolated AWS-HK/SGP Compose overlays, environment
templates and runbook are checked in. Realtime flags are independent from
Query, projection worker and commands. Rollback disables SGP SSE first and
then the selected Edge SSE profile; bounded snapshot polling and N25 Query stay
available. An epoch rollback to a pre-N26 cycle requires realtime to remain
off until that epoch seals a new complete cycle.

The checked-in activation JSON is deliberately a non-authoritative candidate:
owner approval is false and all release evidence remains placeholder data.
Only the normal signed dev release process may replace it; this phase does not
deploy or modify runtime.

## 5. Verification

- exact three-profile owner-evidence acceptance and negative widening tests;
- complete-cycle-only PostgreSQL integration, truthful empty Live and shared
  multi-replica high-water tests;
- cursor resume, eviction/ahead/gap/epoch/restart and retention tests;
- 100-client bounded fan-out and slow-consumer terminal-gap tests;
- mTLS/delegated JWT/profile/resource negative matrix;
- Portal session-expiry terminal event and upstream cancellation tests;
- source-loss behavior: incomplete cycles publish no delta;
- independent Compose/config rollback and secret/static bounds gates;
- full Rust all-target tests, fresh migrations, rustfmt and zero-warning
  Clippy; and
- full Control API build and PostgreSQL integration/restore gate.

## 6. Closeout

There is no open internal N26 implementation debt. Signed dev deployment,
browser consumer adoption and post-deploy latency/soak evidence are release
operations, not hidden unfinished code. Claude must close terminal EventSource
instances exactly as described in the N26/N27 handoff before realtime is
enabled for a product profile.
