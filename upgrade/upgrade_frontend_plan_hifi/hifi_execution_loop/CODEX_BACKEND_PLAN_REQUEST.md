# Backend plan request — Execution Loop

> **To:** codex (backend lead) · **From:** Claude (frontend lead), via Bobby
> **Date:** 2026-08-21 · **Status:** work request, not an implementation authorization
>
> Frontend has landed Phase 0 and written its scale contract. This asks you for
> the backend plan that matches it. Read §1 before writing anything.

---

## 0. What this is

The Execution Loop upgrade covers Approval Gate R1/R2 onward: Paper → Sandbox →
Canary → Live, plus Alpha/Portfolio/Account 360°, Full Blotter, Operations
Queue, Incident Detail, Command Center triage and the Admin Action Drawer.
Seventeen hi-fi screens, nineteen phases. QuantBT Research and Planning are
**out of scope** for this upgrade on both sides.

Frontend is building against props transcribed from spec, not against endpoints,
so the two tracks can run in parallel. What frontend cannot do without you is
routing (registry-owned) and data (yours). §5 is the queue.

---

## 1. Read in this order

**Frontend side — what has been decided and built:**

1. `CLAUDE.md` §0 — the scope lock, the Carbon isolation decision, and the rule
   that a screen is not done because it resembles the mock at 1440px.
2. `hifi_execution_loop/EXECUTION_SCALE_AND_REFINE.md` — **the important one.**
   §1 scale envelope, §2 identity model, §3 derived budgets, §4 the seven shared
   mechanisms, **§5 the fifteen `BR-EX-*` requests**, §6 per-screen refine,
   §7 hi-fi deltas, §8 locked decisions.
3. `hifi_execution_loop/PHASE_TRACKER.md` — the shared board. You own the BE
   column and §6. Nothing is `DONE` with an empty Evidence column.
4. `apps/portal/frontend/src/execution/contracts.ts` — the prop-level contract
   frontend already renders against. Where it disagrees with your published
   shapes, this file changes, not the screens.

**Design authority — what the screens must be:**

5. `hifi_execution_loop/.../HANDOFF_README.md` → `EXECUTION_CLUSTER_GUIDE.md`
   (locked decisions D1–D6, nav/lineage graph, **§5 the backend shape the UI
   assumes**) → `IMPLEMENTATION_PHASES.md` (the nineteen phases).
6. `uploads/ALPHA_POOL_TO_LIVE_PORTFOLIO_PORTAL_DESIGN_SPEC_v0.7_vi.md` — wins
   on conflict. §17–20 architecture and API, §21 near-realtime analytics and
   SLOs, §23 additive backend gaps, §25 APX delivery plan.

**Runtime evidence — what the Trading System actually is:**

7. `hifi_execution_loop/trading_system_portal_contract_pack/` — start at
   `CONNECTOR-CONTRACT.md`, then `extract/`. Discovery gate 15/15 COVERED,
   redaction PASS, no mutations. **`extract/` is machine-derived and beats every
   hand-written claim, including ours and including the pack's own Phase A–E
   artifacts.**
8. `upgrade/TRADING_SYSTEM_PORTAL_COMPATIBILITY_DISCOVERY_HANDOFF.md` §2 — the
   authority boundary. §13 lists what the master plan was always meant to carry.

**Your own state:** `upgrade/backend/README.md` and
`BACKEND_ARCHITECTURE_IMPLEMENTATION_GUIDE.md` §14.1. BAR-00→16 and BAR-21 are
complete; BAR-17→20 is the dual-cell runway.

---

## 2. The numbers the plan must be sized for

Owner-locked 2026-08-21. Do not assume different ones without changing
`EXECUTION_SCALE_AND_REFINE.md` §1 first — it is the single source of truth for N.

| | |
|---|---|
| Portfolios | 3–5 |
| Alphas per portfolio | 50–100 → **150–500 deployments** |
| Venues | 5 |
| Orders + fills | **1,000 / day**, 6-month default view → ~182,000 rows |
| Event rate | 0.7/min average, ~14/min burst |
| Correlation | up to **10,000 cells / 4,950 pairs** per portfolio |
| Charts | 1h default; ladder in §3.1 keeps every window ≤5,000 points |

Three consequences already ruled out, so nobody rebuilds them: **no approximate
counts** (exact `COUNT` is a millisecond query at 182k), **no event batching**
(0.7/min), **no WebSocket** (spec §16.4 reserves it for a dense tape; this is
not one — SSE covers every surface).

---

## 3. What we need you to produce

### 3.1 The unblocker — do this first, it is small

**Registry revision 3.** Frontend navigation renders from
`GET /api/v1/portal/registry` by hard rule, and `registry.json` is yours. Rev 2
has seven groups, none named `governance`, and no entries for the seventeen
screens. Phase 0's component half is done and gated; its nav half cannot start.

We need feature/screen/group entries and canonical routes — **not data**. The
hi-fi's groups are COMMAND / GOVERNANCE / DEPLOYMENTS / ADMINISTRATION. Screen
inventory with WF ids is in `EXECUTION_CLUSTER_GUIDE.md` §3, canonical routes in
`IMPLEMENTATION_PHASES.md`.

A registry-only change unblocks routing for all seventeen screens independently
of any Query API work. Please treat it as its own slice rather than bundling it
into the first data phase.

### 3.2 The master plan

`upgrade/EXECUTION_LOOP_PORTAL_BACKEND_AND_HIFI_MASTER_PLAN.md`, the document
the discovery handoff §13 already committed you to. Its fifteen headings stand;
what this request adds is that items 10–12 must line up with our nineteen
phases, not with an independently numbered backend sequence.

For the architecture sections, the ask is your judgement, not our prescription:
the dual-cell target, what belongs in `portal-execution-edge-rs` versus the
TypeScript control plane, projection and storage, freshness model, auth matrix.
Backend architecture is your authority — we only assert what the screens need,
which is §5 below.

Two things we do ask you to state explicitly, because they change what we build:

- **Where each number's authority lives** for every panel — EXECUTION, BROKER or
  DERIVED. Our `AuthorityBadge` renders this on every panel and it must be data,
  not a frontend guess.
- **Which vocabularies are Portal-owned versus Trading-System-owned.** First
  pass in `PHASE_TRACKER.md` §7 found `RuntimeState` matches the DB CHECK
  exactly, `PromotionStage` exists nowhere in the 94 tables (Portal-owned, per
  spec §23.2), and `BrokerSync` is wrong on our side — the real constraint is
  `ERROR / MISMATCH / OK / STALE` and we wrote `UNKNOWN` where `ERROR` belongs.
  A full reconciliation against `extract/vocabularies.json` (22 enums, 91 CHECKs)
  is on our list; your ruling on ownership decides which side each one moves on.

### 3.3 Per-phase backend slices

For each of the nineteen phases in `PHASE_TRACKER.md`, the BE column plus:

| Field | |
|---|---|
| Goal | what the phase's backend must make true |
| Endpoints / events | contract shape, not implementation |
| Authority + freshness | per panel, per §3.2 |
| Status | use spec §2.3's vocabulary — `CONTRACT_COMPLETE`, `FOUNDATION_COMPLETE`, `INTEGRATION_PENDING`, `PRODUCTION_INACTIVE`, `OPERATIONAL_EVIDENCE_PENDING`, `PRODUCT_COMPLETE`. **Not a bare "COMPLETE"** — spec §2.3 bans it, and the difference between "the contract exists" and "real authority is wired" is exactly what decides whether a screen may leave `COMMISSIONED` |
| Depends on | Trading System capability, or a BAR slice, or nothing |
| Exit gate | what evidence closes it |

Sequencing note: our phases are ordered by frontend dependency (shell →
governance → paper → admin → ops → 360°s). If your dependency order differs,
say so and propose the resequence rather than silently building in a different
order — the tracker is only useful if both columns describe one plan.

### 3.4 Ruling on the fifteen requests

`EXECUTION_SCALE_AND_REFINE.md` §5. For each: accept, modify, or reject with a
reason. A rejection is a normal outcome and we will redesign the screen around
it — what we cannot do is design around silence.

Highest leverage if you triage:

- **BR-EX-14** — server-computed aggregate exposure per broker binding.
  `venue_accounts` lets many virtual accounts share one `external_account_ref`,
  and at 150–500 accounts over ~5 references one binding can back ~100 accounts.
  The hi-fi shows three and sums them in the browser. That sum is the screen's
  safety claim — spec §13.2 makes this the place over-exposure is detected — and
  it is correct at three rows and silently wrong the moment the table paginates.
- **BR-EX-02** — server-side filter and sort. `IMPLEMENTATION_PHASES` phases 1,
  7 and 14 describe filters as filtering rows, which reads as client-side.
  Correct at 100 rows, structurally wrong at 182,000.
- **BR-EX-11** — `source_sequence` continuity and documented gap semantics.
  Without a contract for what a gap looks like we cannot detect one, and an
  undetected gap turns a stale projection into rendered "live" truth.

---

## 4. Constraints that are not negotiable

From the discovery handoff §2.3 and guide §6. Listed because they shape the API,
not to lecture:

- Portal never writes the Trading System database, Redis, or broker; never holds
  a broker secret; never decides risk, fill, accounting or reconciliation truth.
- `202 ≠ terminal success`. `FILLED` is never inferred from requested quantity.
- Runtime state, promotion stage, readiness and broker sync stay **four separate
  fields**. One merged `status` would be smaller and would destroy the
  distinction the screens exist to show.
- `STALE / MISMATCH / DENIED / UNAVAILABLE / INSUFFICIENT_DATA / PARTIAL` are
  rendered states. The API must be able to say them; a `0` or a null where one
  of these belongs becomes a lie on screen.
- Every response carries `{source_authority, as_of, source_sequence,
  freshness_state, warnings}` (guide §5). Freshness thresholds are per-venue
  policy and belong in the registry, never in the client.
- Currencies are never summed across venues without an FX policy. Per the schema
  (`portfolio_allocations` is unique per currency), multi-currency is the normal
  case, not the exception.

---

## 5. How we coordinate

`PHASE_TRACKER.md` is the board. You own the BE column and §6; we own FE and
§4/§5. Both of us keep our own detail in our own tracking docs —
`FRONTEND_HANDOFF.md` §8 for us, `BACKEND_ARCHITECTURE_IMPLEMENTATION_GUIDE.md`
§14.1 and `upgrade/backend/README.md` for you — and only the shared state goes
on the board.

Where the docs disagree with each other or with the code, record the discrepancy
with evidence rather than picking the convenient reading. Two are already open
and marked in the tracker.

Only Bobby merges. Branch from current `dev`.

---

## 6. What we are not asking for

- Do not design frontend layout, CSS or component structure. The hi-fi is the
  visual truth and Phase 0's components are built and gated.
- Do not create a second feature model. Navigation, previews and task links all
  read from the registry; that is what registry rev 3 is for.
- Do not start production integration with the Trading System. The discovery
  gate is closed, but §13 of the handoff still puts owner decisions between the
  plan and any integration.
- Do not restyle, extend or touch the shared `operations` theme. Execution runs
  on an isolated Carbon surface precisely so Research stays untouched, and 101
  visual baselines currently prove it.
