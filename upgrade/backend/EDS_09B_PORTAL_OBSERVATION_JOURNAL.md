# EDS-09b — Portal Observation Bridge and Local Revision Journal

**Status:** `IMPLEMENTED · VERIFIED_SOURCE_DARK · RUNTIME_INACTIVE`  
**Implemented:** 2026-09-05  
**Owner:** Portal backend / Control API  
**Depends on:** EDS-01 through EDS-07, EDS-09 Trading System owner-return
receipt, and the existing profile projection/durable mirror.  
**Does not depend on:** a new Trading System Event transport or source upgrade.

## 1. Purpose

The current private Manager-v2 read plane supplies bounded current pages. Its
owner return confirms that the three requested Event classes and all 18 source
gaps are still `SOURCE_GAP_CONFIRMED`. A current page must therefore never be
presented as an owner lifecycle Event, a replay stream, a correction feed or a
globally ordered history.

EDS-09b turns the already accepted, server-side projection refresh into one
**Portal-owned observation revision**. This gives same-origin product screens a
small, resumable movement signal without making each browser refresh query
AWS-HK or exposing Source Proxy / Manager internals.

## 2. Exact authority boundary

```text
Trading System Manager-v2 current pages
        │  private mTLS + delegated JWT, server only
        ▼
Control API lease / shared admission / profile projection
        │  accepted bounded current page + retained range write
        ▼
Portal durable mirror + compatibility snapshot + local journal
        │  Portal-local revision only
        ▼
same-origin SSE v1 / named screen BFFs
        │
        ▼
browser rich panels
```

The browser may receive only:

- `PORTAL_OBSERVATION` and `BOUNDED_CURRENT_PAGE` semantics;
- Portal screen IDs affected by the revision;
- workspace/profile/environment scope, declared source contract revision,
  UTC-millisecond `as_of`/received timestamps and
  availability/freshness/completeness; and
- a local opaque revision cursor for resume.

The browser must never receive Manager relation names, raw source cursors,
source route/hostnames, relation-bound source cursor material, delegated JWT,
mTLS material, source database data paths or an Event/replay assertion.

## 3. Data model and admission rule

Migration `1723680000024_execution-portal-observation-journal.sql` adds three
expand-only fields to `execution_profile_projection_journal`:

| Field | Value / rule |
| --- | --- |
| `observation_authority` | fixed `PORTAL_OBSERVATION` |
| `observation_semantics` | fixed `BOUNDED_CURRENT_PAGE` |
| `source_contract_revision` | declared revision, nullable only for old retained rows; never inferred |

For a new refresh, the projection repository calculates the proposed Portal
epoch/sequence and asks the existing durable mirror to commit it first in the
same PostgreSQL transaction.

| Durable result | Snapshot / checkpoint | Journal / SSE revision | Forensic mirror state |
| --- | --- | --- | --- |
| `COMMITTED` | advance only when document digest changed | write one safe local revision | committed |
| `DISABLED` | retains existing pre-existing projection behaviour | normal local revision only | no mirror write |
| `QUARANTINED` | **do not advance** | **do not publish** | batch/revision/conflict recorded as quarantined |

The quarantine case is a same-key/different-digest retained range conflict. It
is a source coherency failure, not a new observation. The paced worker exposes
the typed `EDS09B_DURABLE_OBSERVATION_QUARANTINED` cycle failure after the
forensic transaction commits, retaining the last known-good visible snapshot.

## 4. Browser wire contract (additive v1)

The outer wire schema stays `portal.execution.profile-realtime.v1`, so existing
same-origin consumers remain compatible. New fields are additive:

```json
{
  "availability": "AVAILABLE",
  "observation": {
    "authority": "PORTAL_OBSERVATION",
    "semantics": "BOUNDED_CURRENT_PAGE",
    "derived": false,
    "operation_id": "EXECUTION_PROFILE_OBSERVATION_REVISION",
    "scope": {
      "workspace_id": "...",
      "environment": "paper",
      "profile_id": "PAPER_BINANCE_USDM",
      "resource_kind": "PROFILE",
      "resource_id": "PAPER_BINANCE_USDM",
      "venue": null
    },
    "source": {
      "contract_revision": "declared-by-source",
      "catalogue_revision": null,
      "as_of_ms": 0,
      "received_at_ms": 0
    },
    "coverage": {
      "kind": "CURRENT_PROFILE_PROJECTION",
      "relation_count": 0
    }
  },
  "payload": {
    "schema_version": "portal.execution.observation-revision.v1",
    "affected_screen_ids": ["EXECUTION_ALPHA_FLEET_LIST_SCREEN"]
  }
}
```

`payload.affected_screen_ids` is a sorted, de-duplicated set from the frozen
Portal projection catalogue. It is not a generic source selector. Unknown or
legacy journal payload keys are removed by the SSE serializer.

`heartbeat` and `auth.expired` retain `availability: UNKNOWN` and
`observation: null`; they do not pretend to describe an observation.

## 5. Product and frontend handoff

Frontend consumers should retain their rich approved composition and use an
observation revision only to revalidate the named current panel(s). They must:

1. label the provenance as `PORTAL_OBSERVATION` when it is displayed;
2. preserve panel-level typed `empty`, `partial`, `stale` and `unavailable`
   states rather than replace a whole route with an envelope;
3. treat the SSE cursor as opaque and resubscribe/resync on a terminal gap;
4. never infer replay, correction, broker acknowledgement, global ordering or
   total history from a revision tick; and
5. keep source gaps visible as `Soon · SOURCE_GAP_CONFIRMED`, not as fake
   charts or fake lifecycle data.

The corresponding additive consumer guidance is in
[`apps/portal/registry/FRONTEND_HANDOFF.md`](../../apps/portal/registry/FRONTEND_HANDOFF.md).

## 6. Verification and rollback

The focused Control API regressions prove:

- duplicate suppression and contiguous local replay;
- source contract revision plus `PORTAL_OBSERVATION` provenance;
- no Manager selector or raw cursor in journal/SSE browser payload;
- profile isolation, opaque resume cursors and no browser-triggered AWS read;
- a changed projection combined with a retained-range conflict cannot advance
  snapshot, source checkpoint or journal; and
- ordinary source-loss behaviour retains the last visible snapshot.

The repository Control API gate additionally builds TypeScript, applies all
migrations to fresh PostgreSQL, runs its complete test suite and performs a
PostgreSQL restore drill.

**Recorded evidence:** Node 22 TypeScript build passed; fresh PostgreSQL suite
passed **45 test files / 384 tests**; the restore drill passed. The E7 return
validator, maximum-data manifest and EDS-08 owner-return validator also passed
at the same source revision.

Rollback is a normal revert of this commit. The migration is additive and
retains legacy rows safely; runtime flags, Edge images, containers, source
identity, source proxy and command authority are unchanged.

## 7. Explicit non-goals and next work

EDS-09b does **not** activate a source Event consumer or add a new source
capability. These remain visible `Soon` items until the owner publishes an
accepted contract:

- authoritative position/fill/risk lifecycle replay;
- corrections, tombstones, global source ordering and source ACK;
- OHLCV/ticks/benchmark/calendar/VNM market context;
- broker terminal acknowledgement proof; and
- source-provenance/artifact/research linkage not present in the current plane.

The non-blocking current-source path continues with:

1. **EDS-10b:** observed timelines and clearly derived mark/equity context
   from the retained current data already available; then
2. **EDS-11:** named same-origin screen hydration and local observation-SSE
   consumption across the frozen rich product routes.

Neither step requires direct Trading System DB, Redis, broker or CLI access,
and neither may repurpose this observation lane as authoritative Event replay.
