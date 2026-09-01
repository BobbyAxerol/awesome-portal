# EX-BE-29 — N26 Realtime SSE Activation

**Status:** `COMPLETE / MANAGER_REPLAY_FIXED / THREE_PROFILE_DEV_SSE_ACCEPTED`  
**Date:** 2026-09-01  
**Branch:** `feat/execution-data-activation`  
**Runtime effect:** Paper/Sandbox/Live Edge SSE and analytics are active in dev;
the same-origin Command Center BFF is Paper-bound; commands and Live mutation remain off

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

The original N26 implementation and browser lifecycle contract remain closed.
During the first current-source Paper live probe, the snapshot route selected
the Manager projection correctly but the resume path still read the legacy
projection journal. The resulting terminal `projection.gap` was observed
before the same-origin product flag was enabled. Paper was immediately rolled
back to analytics-only; Sandbox and Live SSE were never enabled.

The replay path now carries the selected authority through
`RealtimeResumePolicy` and calls the same authority-aware repository used by
the poller. A focused lineage regression test, the N26/N27 static gate and the
full Rust/fresh-PostgreSQL/Clippy/restore suite pass. Commit `771715b` is
deployed as content-addressed image
`sha256:47ea4d78099347706710879bf26e46a15cfaf80e4ef7ac22879f0a71f12c3077`.
All three exact-profile mTLS/JWT snapshot→resume probes pass without widening
command or Live mutation authority. There is no remaining internal N26 debt.

## 7. Dev live-probe evidence and fail-closed result

The pre-fix Paper probe established the transport boundary without exposing
the defect to the browser:

- Manager snapshot returned HTTP/2 `200`, schema
  `execution.manager-realtime-snapshot.v2`, profile
  `PAPER_BINANCE_USDM`, `AVAILABLE`, `fact_count=8797`;
- the same mTLS client without a delegated JWT returned `401`;
- resume with the returned cursor produced a terminal `projection.gap`, which
  identified the journal-selection defect; and
- Control API `FEATURE_EXECUTION_REALTIME_SSE` stayed false throughout, then
  the Edge Paper overlay was restored to analytics-only.

Post-fix source verification is green: 31 Edge-service tests including
`realtime_lineage_selects_its_own_replay_journal`, the complete Rust workspace,
zero-warning Clippy, migration `0016` and PostgreSQL dump/restore.

The final dev acceptance used owner manifest SHA-256
`97e5964c7f693f2731773d7f87c7108bfc4bdd875c3549a0494e03eeaab43d57`,
which pins the exact Edge and Control API image digests, three profiles,
catalogue revision and closed command-disabled authority set. Results:

| Profile | Snapshot | Facts | Cursor | Resume first event | Negative auth |
|---|---:|---:|---:|---|---|
| Paper | `200 / AVAILABLE` | 8,797 | 47 | `projection.heartbeat` through TypeScript BFF | no JWT `401`; no client cert rejected |
| Sandbox | `200 / AVAILABLE` | 317 | 46 | `projection.heartbeat` | no JWT `401`; no client cert rejected |
| Live | `200 / AVAILABLE` | 87 | 1 | `projection.heartbeat` | no JWT `401`; no client cert rejected |

The same-origin Paper snapshot and stream proxy both pass; unauthenticated
snapshot and stream requests return `401`. The current BFF remains deliberately
bound to one exact profile rather than accepting a browser-selected upstream;
Sandbox and Live Edge streams are separately profile/audience bound. All three
Edge services, projection workers, projection databases and Source Proxies are
healthy with zero Edge restarts after the final manifest reload. Runtime envs
have `.pre-771715b` rollback copies. Command relay, projection ingestion on the
serving Edge and every Live mutation remain false.
