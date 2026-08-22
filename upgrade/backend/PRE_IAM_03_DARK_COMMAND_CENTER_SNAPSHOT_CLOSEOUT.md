# PRE-IAM-03 — Dark Command Center Snapshot Backend Closeout

Date: 2026-08-22  
Branch: `feat/execution_loop`  
Status: `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`  
Scope: bounded, read-only Command Center snapshot on the SGP TypeScript control plane

## 1. Acceptance decision

The backend snapshot lane of Execution product Phase 9 is accepted dark on
SGP. The Portal now publishes one canonical, session-bound snapshot contract
that can combine Portal governance with future Execution projections without
converting an absent source into an empty or healthy source.

This is not Command Center product activation. Registry delivery remains
`fixture`; projection ingestion, source reads, SSE and every Execution command
flag remain false. The current runtime can only expose real Portal approval
work and user-owned pins. Incident, operation and fleet facts remain explicitly
uncommissioned until an authenticated Execution source is activated.

## 2. Delivered boundary

### 2.1 Canonical contract and route

- `GET /api/v1/execution/command-center`;
- optional `workspace_id`, validated against the authenticated session's
  workspace membership;
- schema `execution.command-center-snapshot.v1`;
- generated TypeScript declaration and dedicated OpenAPI document;
- five canonical response fixtures: busy, empty, partial, stale and
  unavailable.

The endpoint is controlled independently by
`FEATURE_EXECUTION_COMMAND_CENTER_SNAPSHOT`, defaults to `false`, and is fixed
false in development and production Compose manifests. It does not require an
AWS Execution Edge identity while dark and does not silently enable any source,
realtime or command capability.

### 2.2 Server-owned composition

The response has four bounded panels:

| Panel | Bound | Current authority |
|---|---:|---|
| Needs You | 10 ranked rows | real Portal governance plus future Execution incident/operation slices |
| Fleet Health | six fixed cells | future Execution projection; unavailable today |
| Pinned Watchlist | five user-owned pins | pin record is Portal; target state remains Execution |
| Today | 12 chronological rows | real Portal reviews plus future verified Execution operations |

Needs You is ranked on the server using
`command-center.triage-rank.v1`: severity, then SLA due time, then age, then a
stable kind/ID tie-break. Returned rows never define the denominator. Each
source supplies its own authority, availability, completeness, cursor,
epoch/sequence, freshness, age, lag, capability snapshot and delivery profile.

Composite totals are exact only when every contributing source has an exact
available total. With a source gap, `total_count` and `truncated` are `null`;
`observed_total_count` remains the exact sum of available sources. `QUIET` is
possible only when every contributing source is complete and the exact triage
total is zero. Conflicting Fleet exact totals or malformed fixed cells fail
closed as `FLEET_SNAPSHOT_INVARIANT_FAILED`.

### 2.3 PostgreSQL repository and user pins

Migration `1723680000005_command-center-pins` creates only Portal-owned
watchlist preferences. It does not duplicate Trading System or projection
facts. Composite workspace membership is enforced by foreign key; slots are
limited to 1–5; entity IDs, labels and same-origin deployment paths are bounded.

The repository reads approvals, Today reviews and pins in one
`REPEATABLE READ READ ONLY` transaction with a one-second statement timeout.
Approval/Today queries compute exact counts before their response caps. The
20,000-row qualification corpus proves that only the bounded top set crosses
the API while the exact available denominator is preserved.

### 2.4 Dark realtime identity

The snapshot intentionally returns null projection epoch/sequence/cursor and
`stream_available=false`. It does not mint synthetic continuity. EX-BE-06's
SSE transport remains a separate dark foundation; snapshot/SSE parity, resume,
gap and auth-expiry evidence are later Phase 9 activation gates.

## 3. Security, failure and performance properties

- live opaque session and workspace membership are mandatory;
- repository failures return one sanitized 503 without DSN/path leakage;
- the endpoint returns 404 while its feature flag is false;
- serialized response is capped by `COMMAND_CENTER_MAX_RESPONSE_BYTES`, default
  128 KiB, and breaches fail with a sanitized 503;
- unavailable/error/stale/partial are distinct states, never fake zero;
- source gaps force screen mode `DEGRADED` and a typed warning;
- exact financial or execution values are not computed in this TypeScript
  composer; future decimals remain governed by the Rust contract boundary;
- no AWS, Trading System, broker, Redis, SSE or command side effect exists in
  this slice.

## 4. Qualification evidence

### 4.1 Fresh PostgreSQL and Control API

Command: `sudo -n ./scripts/control-api-test.sh`

- clean PostgreSQL 16 applied every migration including `0005`;
- production TypeScript build passed;
- 15 suites and 139/139 tests passed;
- Command Center passed 10/10 focused cases;
- 20,000 real approval rows returned ten ranked rows, exact observed count
  20,000 and a response below 128 KiB within the 1.5-second test budget;
- auth/workspace isolation, five-slot/path constraints, default-off feature,
  partial/stale/unavailable states, exact denominator, sanitized repository
  error, response budget and contradictory Fleet count all passed;
- the existing 182,000-row governance corpus and all auth/facade/Paper Exit
  regression suites remained green.

### 4.2 Canonical contract gate

Command: `sudo -n ./scripts/contracts-test.sh`

- 26/26 schema/fixture tests passed;
- all five Command Center fixtures validate against the strict JSON Schema;
- OpenAPI and generated TypeScript declarations are synchronized;
- contract snapshot includes the new schema, fixtures, OpenAPI and generated
  type and no stale generated diff remains.

### 4.3 Runtime isolation gate

Only the development `portal` Control API plus its one-shot migration/bootstrap
dependencies were rebuilt for this closeout.

- migration ledger contains `1723680000005_command-center-pins`;
- `portal-control-api-1` is healthy and public-gateway
  `/api/control/readyz` reports PostgreSQL ready with non-dev
  `cloudflare_access_local_password` auth;
- runtime `FEATURE_EXECUTION_COMMAND_CENTER_SNAPSHOT=false`;
- unauthenticated Command Center through the public gateway returns typed 401
  `SESSION_REQUIRED`, proving the mapped route stays session fail-closed;
- no Execution source is contacted and no snapshot profile is activated.

The separate `portal-stable-v1-0-1` Compose project was not rebuilt or changed.

## 5. Claude handoff for Phase 9

Claude can wire the screen against the generated contract and fixtures while
Codex starts PRE-IAM-04. Frontend-owned work is:

1. consume the same-origin snapshot route and generated declaration rather
   than inventing a second view model;
2. preserve busy, empty, partial, stale and unavailable fixtures as distinct
   visual states;
3. use server rank and `formula_version`; do not re-rank in the browser;
4. show `observed_total_count` only as the known subset when `exact_total=false`;
   never present it as a global total;
5. render panel authority/freshness independently and never infer global green
   from one healthy Portal panel;
6. keep live subscription/profile controls absent while
   `stream_available=false` and registry delivery is `fixture`;
7. keep a pinned target visibly unavailable when the Portal pin exists but the
   Execution Fleet source does not.

Claude's latest `BR-EX-28` Phase 6 audit remains a separate queue item. Codex
confirmed its new finding against the supplied Trading System contract pack:
the eight `ops` actions all inherit the emergency-close handler paths in the
CLI extract, while the OpenAPI actually exposes only the four emergency-close
paths. Phase 9 therefore still needs purpose-built, read-only `streams` and
`alpha-activity` contracts before they can become source slices. They must not
be folded into this snapshot as guessed routes, and generic Redis `get`/`scan`
remains prohibited. No Claude-owned frontend file was changed by this backend
slice.

## 6. Residual work and exact next slice

PRE-IAM-03 is complete only at
`INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`. Phase 9 still needs:

- authenticated real incident, operation and fleet source repositories;
- owner-published purpose-built `streams` and `alpha-activity` read contracts
  identified by `BR-EX-28` §8.1, without Portal-to-Redis access;
- snapshot/SSE parity and active epoch/cursor continuity;
- overlap/jitter/gap/resnapshot, slow-consumer and auth-expiry evidence;
- source parity, load/soak and reviewed registry activation.

The next item in the canonical six-phase queue is `PRE-IAM-04`: offline
security, contract, load, replay, restore and rollback hardening that requires
no AWS source or IAM change. Claude should continue the Phase 9 fixture/adapter
handoff above in parallel and keep all real delivery flags dark.
