# EDS-10b — Observed Timeline and Derived Mark Context

**Status:** `IMPLEMENTED / CONTRACT_VERIFIED / CURRENT_SOURCE_ONLY / RUNTIME_INACTIVE`  
**Date:** 2026-09-05  
**Owner:** Portal Control API (Codex); rich visual composition remains Claude-owned.

## 1. Decision and scope

The immutable EDS-09 owner return classifies all three lifecycle Event classes
and all 18 related source requirements as `SOURCE_GAP_CONFIRMED`.  Therefore
this slice does **not** implement EDS-10's future authoritative replay or
market-event plane.  It implements the approved current-source replacement:

```text
bounded Manager current pages
  -> profile-isolated Portal projection
  -> EDS-10b named BFF
  -> OBSERVED_TIMELINE + DERIVED · mark-context panels
```

No Trading System DB, Redis, broker, CLI, source route, source cursor,
credential, container, image, profile activation or command authority changes.

## 2. Named product operation

Authenticated same-origin route:

```text
GET /api/v1/execution/views/observed-timeline
  ?environment=paper|sandbox|live
  &subject_kind=deployment|alpha|portfolio|account
  &subject_id=<opaque product identifier>
  &[limit=1..200]
  &[after=<Portal-signed cursor>]
```

Logical operation: `executionObservedTimelineV1`  
Response contract: `portal.execution.observed-timeline-bff.v1`

The endpoint is a fixed BFF operation, not a generic relation reader.  It
never accepts a schema, relation, Edge path, source cursor, filter expression
or browser-provided credential.

`after` is a Portal query-keyring-signed continuation bound to the viewer
workspace, named resource, environment, fixed ascending order, page limit and
the exact local projection digest.  A changed projection produces typed
`EDS10_OBSERVED_TIMELINE_CURSOR_STALE`; malformed/context-mismatched cursors
are rejected.  It contains no Manager relation or source cursor.

## 3. Panel truth contract

`observed_timeline` is a `PanelEnvelope` with:

- `label: OBSERVED_TIMELINE`;
- `observation_authority: PORTAL_OBSERVATION` and
  `observation_semantics: BOUNDED_CURRENT_PAGE`;
- exact UTC epoch-millisecond clocks (`observed_at_ms`); and
- original-clock classes for orders, fills, sessions and command-journal rows.

Its fixed sort is
`OBSERVED_AT_MS_THEN_CLOCK_CLASS_THEN_SOURCE_IDENTIFIER_V1`.  This is display
order only.  The reducer does not join order/fill/command rows by client id and
does not infer a causal chain, broker ACK, global sequence, correction,
tombstone, Event, lifecycle transition or total history.

Values are passed only when the source supplied a valid exact decimal **string**.
JavaScript numeric values are omitted and surfaced as field-name-only
`rejected_exact_value_fields`; no lossy conversion reaches the browser.

The `mark_context` sibling panel is explicitly
`DERIVED · mark-context`.  It uses current `mark_price` only when a source
`mark_price_at` and exact decimal string exist, plus current/retained equity
context already owned by Portal.  It never fabricates OHLCV, candles,
benchmark, broker clock or mark provenance.  Its market panel remains typed:
`EDS10_MARKET_OHLCV_SOURCE_GAP_CONFIRMED`.

Both panels preserve freshness, profile, source-contract revision, projection
revision, completeness, coverage and `as_of` metadata.  Every response is
limited to 200 timeline entries and 1 MiB.

## 4. Compatibility and frontend handoff

The legacy `analytics.replay` shape remains only as an empty typed compatibility
shell:

```text
state = UNAVAILABLE
reason_code = EDS10_AUTHORITATIVE_REPLAY_SOURCE_GAP_CONFIRMED
trade_log = []
```

It must not be rendered as a whole-screen failure.  Claude should bind the rich
timeline panel to `executionObservedTimelineV1`, label it **Observed timeline**
with visible `PORTAL_OBSERVATION`, retain the composition for
ready/partial/stale/empty/unavailable states, and keep true trade replay and
candles as `Soon · SOURCE_GAP_CONFIRMED` panel-local gaps.

## 5. Acceptance evidence

Focused Control API regressions prove:

1. alpha/account resource isolation, including absence of another alpha's
   rows;
2. fixed mixed-clock ordering and Portal-only cursor continuation;
3. no source cursor, raw relation, client-order join or Event/replay claim in
   browser output;
4. exact-decimal preservation/rejection, mark-context provenance and typed
   OHLCV/ACK/correction/global-sequence gaps; and
5. disabled-profile rejection before any projection read.

The frontend-facing state corpus is pinned at
[`apps/control-api/test/fixtures/eds10-observed-timeline-panel-states.v1.json`](../../apps/control-api/test/fixtures/eds10-observed-timeline-panel-states.v1.json).
It covers `READY`, `EMPTY`, `PARTIAL`, `STALE` and `UNAVAILABLE` for both
panels. `DENIED` and `ERROR` remain endpoint-level typed HTTP outcomes rather
than invented panel data states.

The general Control API fresh-PostgreSQL build/test/restore gate remains the
phase integration gate.  EDS-11 may consume this operation only as local
current-data observation; it cannot promote it into authoritative replay.
