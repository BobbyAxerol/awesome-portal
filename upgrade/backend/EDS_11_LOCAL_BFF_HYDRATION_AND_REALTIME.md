# EDS-11 — Local BFF Hydration and Observation Revalidation

**Status:** `IMPLEMENTED / CONTRACT_VERIFIED / CURRENT_SOURCE_ONLY / RUNTIME_INACTIVE`  
**Date:** 2026-09-05  
**Owner:** Portal Control API (Codex); rich visual composition and client
consumption remain Claude-owned.

## 1. Decision

The verified EDS-09 owner return leaves all 18 Event requirements and all
three lifecycle Event classes as `SOURCE_GAP_CONFIRMED`.  EDS-11 therefore
does not create an Event consumer, event acknowledgement, global ordering,
replay, correction, broker-ack or direct Trading System path.

It completes the useful current-data route:

```text
existing Manager-v2 current pages
  -> one profile-isolated SGP durable projection
  -> named same-origin screen BFFs
  -> one local observation journal tail
  -> browser-safe named-operation revalidation hint
  -> rich product panel refresh
```

The journal is a Portal observation lane.  It is bounded current-state change
notification, not retained source history.  It preserves profile,
availability, freshness, completeness, declared source contract, UTC
milliseconds, exact-decimal values in the BFFs, and the local projection
epoch/sequence/digest.

## 2. Browser contract

`portal.execution.profile-realtime.v1` keeps its existing snapshot, delta,
heartbeat, auth-expired and projection-gap transport shapes.  A `delta`
payload now adds the fixed, safe shape:

```ts
{
  schema_version: "portal.execution.observation-revision.v1";
  observation_authority: "PORTAL_OBSERVATION";
  observation_semantics: "BOUNDED_CURRENT_PAGE";
  operation_id: "EXECUTION_PROFILE_OBSERVATION_REVISION";
  affected_screen_ids: string[];
  revalidation: {
    schema_version: "portal.execution.observation-revalidation.v1";
    mode: "REFETCH_CURRENT_ROUTE_NAMED_BFF";
    profile_scope: "CURRENT_STREAM_PROFILE_ONLY";
    affected_screen_ids: string[];
    affected_operation_ids: string[];
    revision_tick: {
      projection_epoch: string;
      projection_sequence: number;
      payload_digest: string;
    };
    redaction: {
      raw_source_relation: "WITHHELD";
      source_cursor: "WITHHELD";
      resource_selector: "WITHHELD";
    };
  };
}
```

The revalidation operation list is calculated from the frozen Screen BFF
registry at emission time.  It is not trusted from persisted payload JSON,
which means legacy/forensic journal entries cannot create a browser generic
query channel.  It contains only available `GET` operations.

The client retains its current route and selected resource; it may re-fetch
only if that route's named BFF operation appears in `affected_operation_ids`
and its active profile is the stream profile.  There is no URL, relation,
source cursor, resource selector, Edge origin, delegated JWT, mTLS input or
credential in the frame.

## 3. Maximum-current mapping

The revision mapper includes direct EDS projection bindings plus explicit
profile-specific composition links for the already published rich screen BFFs:

- Paper: overview/workbench/VNM/blotter, Alpha 360, Portfolio 360,
  Account/Broker 360 and Fleet where current strategy/deployment/account,
  balances, position, session, performance/equity, order/fill or conditional
  facts can affect them.
- Sandbox: overview/certification, Alpha 360, Portfolio 360 and Account/Broker
  360 for the current Sandbox/Fleet/session/margin/sync/risk facts.
- Live: overview/canary/full-operations, Alpha 360, Portfolio 360 and
  Account/Broker 360 for the current Live/Fleet/session/margin/sync/order/fill
  facts.

An unknown, cross-profile or non-read screen maps to nothing.  The browser
cannot use an observation revision to discover a source relation or request a
different resource.

## 4. Cursor and source boundary

Raw Manager source checkpoints remain in the durable SGP projection for
server-side drains and compatibility checks.  They are now explicitly `null`
in both local ProductRead projection output and the screen-composer panel
envelope. The older bounded profile-read adapters also expose only semantic
product group IDs (for example `strategies`, never a `manager.*` selector),
and Command Center source descriptors null their source checkpoint. Product
pagination continues to use only Portal-signed opaque continuations. This
changes no durable checkpoint, upstream transport, source read, profile
activation, Edge route, cache, container, command or runtime flag.

## 5. Realtime behaviour

One local tail group per `(workspace, environment, profile)` polls only the
committed projection journal.  It fans a contiguous revision to all browser
subscribers and never contacts AWS-HK/Trading System during browser fanout.
It preserves:

- `Last-Event-ID` local epoch/sequence resume;
- terminal typed gap for invalid epoch, evicted history or non-contiguous
  local history;
- slow-client removal and one local journal tail rather than one source read
  per tab; and
- terminal `auth.expired` behaviour without a browser-side source retry.

The existing rich client keeps the panel mounted.  On a matching revision it
re-fetches its same-origin BFF and changes only the relevant panel state.  On
`projection.gap` or stale data, it uses its existing bounded BFF recovery;
it must not retry a source origin or present the delta as replay.

## 6. Current source gaps — visible `Soon`, not EDS-11 blockers

The following remain source-owned and must stay panel-local typed gaps until
the Trading System publishes them with a separate accepted contract:

1. immutable position/fill/risk lifecycle replay, correction/tombstone
   causality and global ordering;
2. broker acknowledgement clock and terminal command evidence;
3. ticks, OHLCV, benchmark, venue calendar and VNM market constraints; and
4. mark provenance, direct profile equity producer, artifact reference and
   research linkage.

Existing observed timeline and derived mark-context continue to serve what is
actually present under `PORTAL_OBSERVATION`/`DERIVED` labels.  EDS-11 never
waits for this future lane.

## 7. Acceptance evidence

Focused regression coverage proves:

1. Paper/Sandbox/Live mapping stays profile-local and unknown relations expose
   no BFF operation;
2. journal payloads have only known screen IDs and known read operation IDs;
3. raw Manager relation selectors and raw source checkpoints stay absent from
   ProductRead, panel composition, legacy read adapters, Command Center,
   persisted browser payload and SSE;
4. a contiguous resumable delta remains local and carries the exact revision
   tick; and
5. 100 simultaneous subscribers share one local journal read and receive the
   same safe delta without source fanout.

Versioned fixture examples live at
[`eds11-observation-revalidation.v1.json`](../../apps/control-api/test/fixtures/eds11-observation-revalidation.v1.json).
The full Control API fresh-PostgreSQL migration/build/restore gate remains the
integration evidence.  Runtime activation is intentionally outside this code
slice and continues to require its separately approved operational profile.

## 8. Claude handoff

Claude may consume this only through the existing same-origin realtime hook:

1. retain the reviewed rich screen and every panel; never swap an entire route
   for an observation envelope;
2. compare the current named screen BFF operation against
   `affected_operation_ids`, then re-fetch only the current route/resource;
3. use `revision_tick` for harmless panel motion/revalidation bookkeeping,
   never as business data or a source cursor;
4. preserve `EMPTY`, `PARTIAL`, `STALE`, `UNAVAILABLE`, `DENIED` and `ERROR`
   at panel level; and
5. keep authoritative replay/candles/ACK as typed `Soon ·
   SOURCE_GAP_CONFIRMED`, not a generic screen failure.
