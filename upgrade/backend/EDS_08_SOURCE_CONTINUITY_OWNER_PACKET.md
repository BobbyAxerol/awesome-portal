# EDS-08 — Source continuity and authoritative event contract lane

**Status:** `CONTRACT_PREPARATION_COMPLETE / SOURCE_OWNER_ACTION_REQUIRED / RUNTIME_INACTIVE`  
**Scope:** Portal-owned portable contract preparation only.  
**Baseline:** accepted E7 Manager-v2 current-page return pack, pinned by digest
in `eds08-source-continuity-v1/owner-request.v1.json`.

## 1. Decision

The current Manager-v2 read plane remains a qualified **current-page** surface.
It is valuable and stays source-as-is, but it is not an ordered owner event
source. Current rows, page hashes, a Portal projection delta, or
`domain_events` without an exact `source_sequence` cannot be described as owner
replay.

EDS-08 creates one minimal handoff packet. It does not require the Trading
System to replace its current plane or build a global event platform for every
field. It asks for strict continuity semantics only where product truth
genuinely needs replayable lifecycle history.

## 2. Exact gap ownership

| Owner lane | E7 gaps | Requested result |
| --- | --- | --- |
| Event | `position-version-history`, `order-broker-ack-clocks`, `fill-correction-replay`, `session-funnel-and-producer-version`, `signal-intent-funnel`, `risk-event-correction` | Three authoritative event classes plus named acknowledgement/funnel capabilities where sufficient. |
| Market | `market-latest-ticks`, `market-ohlcv`, `market-benchmark`, `market-session-calendar`, `market-vnm-constraints` | Typed observations/series/calendar/constraints; no generic event requirement. |
| Valuation | `portfolio-profile-equity-direct`, `position-mark-provenance`, `valuation-mark-provenance` | Scope-qualified snapshots and mark provenance. |
| Operations | `reconciliation-ack-evidence` | Immutable acknowledgement evidence or explicit current-status-only classification. |
| Command | `command-safe-reference-payload-contract` | Allowlisted terminal evidence, never raw payloads. |
| Artifact | `artifact-signed-reference` | Digest/retention/expiry-bound reference metadata only. |
| Research | `research-run-linkage` | Immutable producer-owned linkage only. |

Each E7 gap appears exactly once. Partial owner publication is allowed: an
accepted entry is independently useful, while every other entry remains a
typed source-owner gap.

## 3. The only EDS-08 event classes

| Event class | Gap | Why it needs the full contract |
| --- | --- | --- |
| `execution.position-lifecycle.v1` | `position-version-history` | Mutable position rows cannot prove a retained lifecycle/version history. |
| `execution.fill-lifecycle.v1` | `fill-correction-replay` | Trade Replay needs correction/tombstone-safe fill history, not a bounded fill page. |
| `risk.decision-lifecycle.v1` | `risk-event-correction` | A current risk decision does not encode corrected decision history. |

An accepted event class must publish profile/workspace/venue/resource binding,
source epoch and contiguous exact decimal-string `u64` sequence, immutable
event/entity-version identifiers, UTC epoch-millisecond times,
correction/tombstone causality, retention floor, opaque resumable cursor and a
snapshot high-watermark followed strictly by `W + 1` tail. A gap, epoch change
or retention boundary must force an explicit resnapshot.

The source owner may use an immutable journal, outbox, CDC bridge or
append-only keyset tail. Portal does not prescribe a table, database schema,
queue, cache, route path or internal implementation.

## 4. Portable deliverable

The machine authority is
[`eds08-source-continuity-v1`](../../services/portal-execution-edge-rs/contracts/eds08-source-continuity-v1/):

- `owner-request.v1.json` pins E7 and contains all seven lanes.
- `source-event-envelope.v1.schema.json` and `snapshot-tail.v1.schema.json`
  freeze the future cross-cell event boundary.
- `owner-return.v1.schema.json` rejects credentials, private keys, DSNs/raw
  SQL, business rows, Portal runtime changes and Portal direct DB/Redis/CLI
  authority.
- `owner-return.pending.example.json` has all 18 entries as
  `SOURCE_GAP_CONFIRMED`; it is intentionally non-evidence.
- Eight synthetic fixtures cover duplicate, gap, correction, tombstone, epoch
  reset, retention boundary, cross-profile rejection and snapshot+tail.
- `MANIFEST.sha256` is a complete exact file index.

Owner-side validation:

```bash
python3 services/portal-execution-edge-rs/tools/validate_eds08_source_continuity.py
```

To validate a returned sanitized owner publication:

```bash
python3 services/portal-execution-edge-rs/tools/validate_eds08_source_continuity.py \
  --owner-return /safe/path/owner-return.v1.json
```

The second command rejects the pending template and only permits
`EVENT_SOURCE_ACCEPTED`, `CAPABILITY_ACCEPTED_NON_EVENT`, or an honest
`SOURCE_GAP_CONFIRMED` state for each gap.

## 5. Verification and no-runtime ruling

EDS-08 verifies the packet, full manifest and Control API contract test. The
test covers the E7 pin, seven-lane/18-gap mapping, three-event minimum scope,
all eight cases, and mutations that try to insert a duplicate gap, number-
encode a sequence or falsely accept the pending template.

There is no runtime activation in EDS-08: no Manager-v2/D4, Source Proxy or
Trading System mutation; no source relation/cursor/mTLS/delegated JWT exposure;
no direct Trading System DB, Redis, broker or CLI; and no cache, projection,
SSE or command-plane change. Existing current-page BFFs and typed product
panels are unchanged.

## 6. EDS-09 admission rule and closeout

EDS-09 may start ingest only for a returned `EVENT_SOURCE_ACCEPTED` entry whose
real owner publication independently passes verifier, manifest/schema
compatibility and an approved activation scope. A
`CAPABILITY_ACCEPTED_NON_EVENT` entry can improve only its named BFF; it does
not unlock replay. A source gap stays typed and visible.

All Portal-owned EDS-08 deliverables are present, versioned, testable and
source-dark. There is no untracked Portal technical debt from this phase. The
remaining work is explicit external source-owner publication, so EDS-09 is
correctly gated rather than falsely started.
