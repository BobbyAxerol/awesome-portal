# EX-BE-06 / N08 SSE real-source activation

Status: `PORTAL_IMPLEMENTATION_COMPLETE / OWNER_PROMOTION_APPROVED /
RUNTIME_FAIL_CLOSED / REAL_SOURCE_EVIDENCE_PENDING`

Date: 2026-08-26

## 1. Outcome

N08 is closed as a Portal implementation and owner-decision slice. A boolean
feature flag can no longer open the stream by itself. Rust requires one exact,
owner-approved activation manifest tied to accepted N06 evidence, the active
N07 screen manifest and the same active projection epoch. TypeScript exposes a
same-origin snapshot-before-stream pair over a reusable mTLS HTTP/2 session;
the browser receives neither delegated JWT nor source credentials.

Bobby approved promotion of this named Paper shadow scope on 2026-08-26. Do not
request that decision again. Runtime remains deliberately off until a real
owner-published `d4.paper-read.v2` source pack produces accepted N06 evidence.
Fixture or synthetic reports cannot satisfy that missing external dependency.

No Trading System file, database, process, network policy or command authority
was changed in N08.

## 2. End-to-end boundary

```text
browser Portal session
  | GET realtime-snapshot
  | GET stream?cursor={epoch}:{sequence}
  v
TypeScript Control API on SGP
  SessionGuard + workspace identity
  bounded exact snapshot parser
  short read-only delegated JWT
  reusable TLS 1.3 mTLS / HTTP/2 connection
  v
Rust Portal Execution Edge on AWS-HK
  accepted N08 manifest capability
  still-active N07 authority + epoch check
  one shared projection journal tailer
  bounded replay + bounded broadcast fan-out
  v
Portal-owned projection PostgreSQL
```

The two public routes are:

```text
GET /api/v1/execution/command-center/realtime-snapshot
GET /api/v1/execution/command-center/stream?cursor={epoch}:{sequence}
```

The private Edge routes are:

```text
GET /internal/v1/realtime/snapshot
GET /internal/v1/realtime/stream
```

All four routes and the fixed Paper workspace/environment are part of the
activation evidence. Route or scope drift invalidates acceptance.

## 3. Activation authority

`source-qualification::realtime_activation` defines exact schema
`execution.realtime-activation.v1`. Acceptance binds:

- active epoch and exact N07 activation-manifest digest;
- source contract `d4.paper-read.v2` and realtime contract
  `execution.realtime.v1`;
- Edge image, Control API image and snapshot-contract digests;
- accepted N06 report for the same epoch, source revision and Paper scope;
- mTLS/H2, positive/negative auth, snapshot/resume, epoch/gap/cursor,
  100-client fan-out, slow-consumer, source-loss/recovery, terminal-client and
  rollback evidence hashes;
- runtime intent with projection, Query, commissioned screen and realtime true,
  while command remains false;
- explicit owner identity, evidence digest and approval timestamp.

Candidate mode can only produce `READY_FOR_OWNER_REVIEW`. Acceptance produces
the private `AcceptedRealtimeActivation` capability. Raw JSON is never runtime
authority.

When `EDGE_REALTIME_SSE_ENABLED=true`, the Edge must also receive a root-owned
`EDGE_REALTIME_ACTIVATION_MANIFEST_FILE`. Startup fails if the file is absent,
malformed, unaccepted or mismatched. Startup also requires ingestion, the N07
shadow Query path and the commissioned Paper Workbench screen to be enabled;
the TypeScript BFF enforces the same Query+screen dependency before exposing
its public SSE route. Every snapshot and stream request then
rechecks that:

1. request workspace/environment equal the accepted scope;
2. the N07 manifest is still valid and ACTIVE in PostgreSQL;
3. N07 epoch, manifest digest and capability snapshot equal N08;
4. realtime availability points to the same active epoch.

This prevents stale evidence or a standalone environment variable from
keeping realtime open after rollback.

## 4. Snapshot and stream semantics

The exact `execution.realtime-snapshot.v1` response carries delivery profile,
workspace, environment, active epoch, sequence, canonical cursor, capability
snapshot and N08 manifest digest. The BFF caps it at 64 KiB and rejects extra
keys, invalid integers, cursor/epoch mismatch, wrong scope/profile, malformed
digest or non-JSON response.

The stream preserves the existing EX-BE-06 guarantees:

- `Last-Event-ID` takes precedence over the original snapshot cursor on native
  EventSource reconnect;
- event ID is exactly `{projection_epoch}:{projection_sequence}`;
- replay is bounded and deduplicated against the live tail;
- epoch change, history eviction, cursor ahead, source gap and slow consumer
  produce typed terminal recovery instead of silent loss;
- one shared PostgreSQL journal tailer feeds bounded receivers; there is no
  per-browser source poll;
- 100 concurrent receivers and slow-consumer termination are tested;
- delegated auth expiry closes before token expiry and returns through
  `SessionGuard`.

The browser transport now calls `close()` for generic errors as well as typed
session-expiry errors. Native EventSource therefore cannot retry forever every
few seconds after a dead Portal session.

## 5. Paper-fast evidence rule

N06 now has two explicit profiles:

| Profile | Minimum observation | Maximum sample gap | Intended use |
|---|---:|---:|---|
| `PAPER_FAST_ACCEPTANCE` | 1,800 s | 30 s | Paper shadow development promotion |
| `EXTENDED_24H` | 86,400 s | 300 s | stable/release and later confidence |

Both require the same twelve drills, parity, zero mutation, load, recovery,
restore and rollback checks. Paper-fast is a shorter real observation window,
not a synthetic shortcut. A background container may collect the 30-minute
window, but N08 never turns a template into real evidence.

## 6. Runtime switches and rollback

All defaults remain false:

```text
EDGE_PROJECTION_INGESTION_ENABLED
EDGE_SHADOW_QUERY_ENABLED
EDGE_PAPER_WORKBENCH_SHADOW_ENABLED
EDGE_REALTIME_SSE_ENABLED
FEATURE_EXECUTION_SHADOW_QUERY
FEATURE_EXECUTION_PAPER_WORKBENCH_SHADOW
FEATURE_EXECUTION_REALTIME_SSE
```

N08 adds only the manifest mount/input; it does not widen the defaults. Once
the external source pack and Paper-fast evidence exist, activate in this order:

1. accept N06 real evidence for the BUILDING epoch;
2. atomically accept/activate the exact N07 screen manifest;
3. generate and verify the N08 candidate, then acceptance manifest using
   Bobby's already-recorded approval;
4. install the accepted manifest root-only on the Edge;
5. enable Edge realtime, verify private snapshot/stream and negative auth;
6. enable SGP BFF realtime, verify public snapshot/resume/session revocation;
7. change only the commissioned registry screen `sse_enabled` flag;
8. run fixture-vs-shadow/honest-state review.

Rollback is the reverse: registry SSE off, SGP realtime off, Edge realtime off,
then N07 screen/Query/projection rollback if needed. Evidence and retained
epochs are not deleted. Commands remain false throughout.

## 7. Verification

Repository gates for this slice are:

```bash
./scripts/execution-edge-test.sh
./scripts/control-api-test.sh
./scripts/contracts-test.sh
./scripts/portal verify
```

Focused evidence includes:

- four N08 activation-authority tests covering deterministic candidate,
  accepted owner manifest, N06/N07/command rejection and exact route/schema;
- Rust replay, gap, source-loss, 100-client fan-out and slow-consumer tests;
- five Control API realtime tests covering snapshot exactness/scope and stream
  auth/transport behavior;
- two Control API configuration tests proving realtime cannot outlive its N07
  Query and commissioned-screen prerequisites;
- frontend SSE/recovery/hardening tests, including terminal `close()`;
- generated OpenAPI/TypeScript contract snapshot and Compose verification;
- full PostgreSQL migration/restore and the pre-existing 182,000-row backend
  corpus.

The N07 filter-echo test also exposed and fixed a real compatibility defect:
the canonical server contract uses `operator`/`values`, while the frontend
reader handled only legacy `op`/`value`. The reader now accepts canonical and
legacy representations without inventing constraints.

## 8. One remaining external dependency

The only activation blocker is not another Bobby approval and not another
Portal phase: Trading System ownership must publish the accepted N02/N03
`d4.paper-read.v2` implementation bytes so N04 can consume them and N06 can
record a real Paper-fast window. Report this once as
`REAL_SOURCE_EVIDENCE_PENDING`; do not rediscover or rename it in later phases.

## 9. Claude handoff

Claude should consume the canonical snapshot route before opening the stream,
keep one EventSource per Command Center screen, use the returned cursor, render
typed gap/source-loss/session-expiry states and never add a custom infinite
reconnect loop. The preview fixture remains explicit until the accepted runtime
is actually enabled. See
`CODEX_TO_CLAUDE_N08_SSE_ACTIVATION_HANDOFF.md` on the shared board path.

## 10. Next backend phase

N09 is next: Portal-owned governance/workflow gaps that do not require a live
source. N10 analytics contracts can proceed in parallel. N08 operational
activation resumes only when the single external source pack arrives; Bobby's
promotion decision is already complete.
