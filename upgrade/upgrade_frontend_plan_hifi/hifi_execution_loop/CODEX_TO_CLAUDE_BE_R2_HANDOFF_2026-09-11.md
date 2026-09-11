# Codex → Claude: BE-R2 frontend coordination handoff

**Date:** 2026-09-11  
**Status:** `PLANNED_ONLY / NO_IMPLEMENTATION_STARTED`  
**Owner decision:** Bobby has approved the six BE-R2 directions. Codex has
recorded the backend campaign in the canonical Portal plan, but Bobby has not
started any BE-R2 implementation phase yet.

This file is deliberately separate from
`EDS_FRONTEND_DATA_CONTRACT_TRACKER.md`: that tracker has Claude-owned
uncommitted work. Do not overwrite, stage or rewrite it merely to acknowledge
this handoff.

## 1. Read order and source of truth

1. This handoff.
2. The proposed Round-2 Phase 8–11 section in
   `EDS_FRONTEND_DATA_CONTRACT_TRACKER.md`.
3. Canonical Portal plan:
   `upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md` §18,
   **BE-R2 operational closeout campaign**.
4. `apps/portal/registry/FRONTEND_HANDOFF.md` §8.56 after the Codex docs commit
   is present in your base.

The authoritative runtime data path remains:

```text
Browser → same-origin named Screen BFF → Portal local projection/bounded cache
        → private mTLS + short-lived delegated assertion → AWS-HK Manager-v2
        → Trading System authority
```

Never add a browser Edge/Data Layer/Trading System call, generic relation
consumer, raw source cursor, cross-cell credential, client-side source polling
or fixture fallback to a product route.

## 2. Backend decisions now locked

| Decision | Frontend consequence |
|---|---|
| Bounded expired-cache cleanup only; no `VACUUM FULL` | No UI work is needed for cache deletion. Do not make cache health a business status. |
| One GET-only D3 transport/audit window | Do not add a client transport or test a command/Trading CLI. |
| Market Context qualifies Paper first, then each profile independently | Charts must represent `READY`, `EMPTY`, `PARTIAL`, `STALE`, `UNAVAILABLE`, `DENIED`, `ERROR`; no profile fallback or synthetic candles. |
| `live_data_executor` is a Paper candidate/archive, not a Portal source | No frontend inference from raw DB-style names or metadata. |
| V1 `pinned_watchlist` returns as deprecated compatibility | Do not remove/hand-edit generated consumer types. Treat it as additive compatibility, not new UI state. |
| Command relay and Live mutation remain off | The Admin Action Drawer may display server-approved read/workflow states only; never advertise operational CLI authority. |

## 3. Assigned frontend lanes (prepare now; implement only when Bobby starts the named frontend slice)

### Round-2 Phase 8 — rich, truthful empty composition

Own the visual/semantic correction for Gate R1/R2/Live, Canary Control Room and
Sandbox Certification:

- retain the reviewed panel hierarchy when a permitted record is absent;
- use one concise actor/next-source explanation at screen level, not repeated
  boilerplate in each panel;
- add producer relation names to `not reported` states for F10;
- use an explicit semantic allowlist for record-dependent panels that would be
  dishonest without a record—do not impose a blanket “every empty page must
  have N characters” requirement;
- do not seed an approval, incident, risk grant, account or Trading System fact
  just to make the screen look populated.

Expected evidence: focused empty-state fixtures, one structural test per screen
class, authenticated browser screenshots for the five screens and a written
allowlist rationale.

### Round-2 Phase 9 — presentation and interaction regression guards

Own three known defects and a bounded regression strategy:

- normalize Account/Broker 360 exact-decimal display through the established
  formatter while retaining raw exact value in an accessible title/inspection
  affordance;
- ensure the known disabled QuantBT `Open` control has a meaningful reason;
- restore raw numeric title accessibility for the named Portfolio 360 numeric
  field;
- use focused formatter/unit tests plus targeted browser probes. Any allowlist
  is per control/route and explains why it is safe.

Do not create an expensive blanket browser scan on every PR. Demonstrate each
new guard fails on a deliberate temporary regression, then record the proof.

### Round-2 Phase 10 — process and contract discipline

Before every future UI slice:

- acknowledge the relevant Codex handoff in `PHASE_TRACKER.md` as **read**;
- supply the required seven-part delivery report and reuse report;
- reconcile required tracking files against current `dev`;
- do not modify generated files or published V1 contracts by hand. If an
  emitted type looks wrong, return the source contract/generator path to Codex.

### Round-2 Phase 11 — named BFF consumer preparation

Prepare—not invent—the consumer adaptations for:

- Command Center and Operations panels: Portal-owned governance may be truly
  empty; render panel-local truth.
- Blotter: source `exact_total: null` remains unavailable until the BFF marks a
  local complete-scope total as `DERIVED`; never count a partial browser page.
- Gate/Approval panels: server policy/refusal text is authoritative.
- Admin Action Drawer: surface task/workflow/read affordances only while command
  relay stays disabled.

Use product BFF doubles with all typed states. A UI can be ready to consume a
DTO without claiming the DTO exists at runtime.

### BE-R2 Market Context and realtime preparation

When Codex later publishes a named operation:

- charts accept exact decimal strings, UTC milliseconds, coverage/range,
  freshness and provenance/`DERIVED` labels;
- realtime indicators map only actual `live`, `connecting`, `recovering` and
  `closed` states from the local Portal stream;
- preserve last-good panel content through `STALE` or `RECOVERING` and avoid
  fake timer animation;
- Paper acceptance must precede Sandbox or Live consumer activation. A route
  must never borrow another profile's data.

## 4. Explicit boundaries

Do not edit any of the following for BE-R2 frontend work:

- Control API, Rust Edge, Source Proxy, Terraform/network, database migrations,
  feature flags, runtime Compose/containers;
- generated contract output or a source contract merely to unblock UI;
- browser transport, relation/cursor input, mTLS/JWT/delegation input;
- command relay, CLI dispatch, Live mutation or retry behavior.

For a missing fact, retain the rich panel with its typed source state. It is a
single `SOURCE_GAP_CONFIRMED`, not a client-side workaround.

## 5. Return packet to Codex after each started frontend slice

Return one concise packet containing:

1. phase ID, commit SHA and changed product routes/components;
2. named BFF operation IDs/double scenarios consumed (never raw relation
   selectors);
3. state matrix (`READY`, `EMPTY`, `PARTIAL`, `STALE`, `UNAVAILABLE`, `DENIED`,
   `ERROR`) and profile isolation proof;
4. TypeScript, unit, browser/DOM-warning and authenticated same-origin network
   results;
5. screenshot/visual review URLs or files for changed empty/rich states;
6. any needed backend field described as a named DTO gap, including why the
   current contract is insufficient; and
7. confirmation that no direct source call, fixture fallback, generated-file
   edit or command behavior was introduced.

Codex will then decide whether the item belongs to a named BE-R2 backend phase
or is a real Trading System capability gap. Do not create a separate backend
request without that classification.
