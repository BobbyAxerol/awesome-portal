# EXECUTION_SCALE_AND_REFINE.md

> **Status:** v2 — owner figures and the four blocking decisions locked 2026-08-21.
> **Audience:** Claude (frontend lead) and codex (backend lead). Sections 1–5 are
> the shared contract surface; section 6 is frontend working detail.
> **Authority:** subordinate to `uploads/ALPHA_POOL_TO_LIVE_PORTFOLIO_PORTAL_DESIGN_SPEC_v0.7_vi.md`.
> This file does not restate spec §16.4 / §21.1 / §21.4 — it applies them at the
> figures below and fills the one gap they leave: **per-screen layout and
> interaction behaviour when N grows.**

The hi-fi screens are composed at one 1440px viewport over the nine-deployment
`CANONICAL_CAST`. That cast proves the design; it does not prove the design
survives production cardinality. Every screen in `IMPLEMENTATION_PHASES.md` is
answered here against the six fields required by `CLAUDE.md` §8.

---

## 1. Scale envelope

Owner figures, 2026-08-21. **This table is the single source of truth for N.**
Neither side may assume a different number without changing it here first.

| Dimension | Value | Note |
|---|---|---|
| Portfolios | **3–5** | current stage; each is a capital container |
| Alphas per portfolio | **50–100** | "smooth and realtime" is required at this number, not aspirational |
| Venues | **5** | BINANCE / OKX / DERIBIT / VN MARKET + 1 headroom |
| Orders + fills per day | **1,000** | combined, all deployments |
| Order/fill retention, default view | **6 months** | older rows remain queryable; see §8 decision 3 |
| Other domain data retention | longer / unbounded | approvals, audit, operations, incidents, equity |
| Equity & chart default resolution | **1h**, tunable per window | |

### 1.1 Derived figures

| Derived | Calculation | Result |
|---|---|---|
| Deployments, system-wide | 3–5 portfolios × 50–100 | **150–500** |
| Full Blotter rows at 6 months | 1,000/day × 182 d | **~182,000** |
| Orders+fills per deployment per day | 1,000 ÷ 150–500 | ~2–7 |
| Execution event rate, average | 1,000/day | **0.7 / min** |
| Execution event rate, 20× burst | | ~14 / min |
| Equity points, 1h × 6 months | 24 × 182 | 4,368 |
| Equity points, 1h × 1 year | 24 × 365 | 8,760 — **over budget** |
| Correlation cells, per portfolio | 100 × 100 | **10,000** (4,950 unique pairs) |
| Correlation samples per pair, 1h × 6 mo | | 4,368 — ample |
| Virtual accounts per physical broker ref | 500 ÷ ~5 refs | **up to ~100** — see §2.3 |
| Alpha 360° insight tiles at full resolution | 12 × 4,368 | 52,416 points on one screen |

> **One figure to confirm:** 1,000 orders+fills/day across 150–500 deployments is
> ~2–7 per deployment per day. That is coherent for low-frequency alphas, and
> every budget here is built on it. If the real mix includes higher-frequency
> alphas, this is the number that moves first — and it moves the blotter, the
> event rate and the workbench budgets together.

### 1.2 What these figures rule OUT

Stating the non-requirements is as valuable as stating the requirements: each
line below is a workstream that must **not** be built.

| Not needed | Why |
|---|---|
| Approximate / estimated row counts | 182k rows counts exactly in milliseconds on an indexed column. `COUNT` stays exact, so no `~` prefix and no "10,000+" label anywhere. |
| Event coalescing or batching for execution events | 0.7/min average, ~14/min burst. Naive per-event rendering is already correct. |
| WebSocket transport | Spec §16.4 reserves WS for "dense tape". 1,000 events/day is not dense tape. **SSE covers every Execution Loop surface.** |
| VenueScope overflow / multiselect summary | 5 chips fit the hi-fi chip row as drawn. Keep the threshold rule documented (§4 M4) but build nothing. |
| Virtualization in workbench blotters | ~2–7 rows/day/deployment. Plain DOM. Virtualization applies to Full Blotter and history tabs only. |
| Portfolio switcher search / filter | 3–5 portfolios. A plain select. |

---

## 2. Identity model

Every scope filter, breadcrumb, aggregate and cross-link in the Execution Loop
rides on these relationships. Getting one wrong produces a screen that looks
authoritative and is arithmetically false, so they are written out rather than
assumed. Source: `upgrade/DB_ALPHA_PORTFOLIO_ACCOUNT_SCHEMA_GUIDE.md`
(Layer 2 §4, Layer 3 §5, Layer 5 §8, Layer 9 §12).

```mermaid
flowchart TD
  T[traders<br/>trader_id] --> S[strategies<br/>strategy_id<br/><i>= 'alpha' in Portal language</i>]
  S --> A[accounts<br/>account_id<br/><b>UNIQUE strategy + mode + venue</b>]
  A --> VA[venue_accounts<br/>external_account_ref<br/><i>physical broker</i>]
  S --> D[strategy_deployments<br/>deployment_id<br/><b>UNIQUE strategy + account + mode + venue</b>]
  A --> D
  P[portfolios<br/>portfolio_id<br/><i>capital container</i>] --> D
  P --> AL[portfolio_allocations<br/>allocation_id<br/><b>UNIQUE portfolio + strategy + account + mode + venue + currency</b>]
  D --> AL
  A --> AL
  P --> CL[portfolio_capital_ledger<br/>append-only]
```

### 2.1 The rules that matter to the UI

| # | Rule | Source | UI consequence |
|---|---|---|---|
| I-1 | **One account per (strategy, mode, venue). Accounts are never shared across strategies.** | `accounts` convention | An account chip always resolves to exactly one alpha. Account 360° may state its alpha without ambiguity. |
| I-2 | `strategy_deployments` is unique on (strategy, account, mode, venue) — the same key `accounts` is unique on. **Deployment : account is 1 : 1.** | `strategy_deployments` | The lineage strip's `deployment` and `account` chips are two views of one row, not two hops. Do not render them as if a deployment could span accounts. |
| I-3 | `portfolio_id` lives **on the deployment**, not on the strategy. | `strategy_deployments.portfolio_id` | A deployment belongs to exactly one portfolio. **The same alpha may appear in two portfolios through two deployments** — so Alpha 360° is portfolio-scoped, and its scope bar's Portfolio select is load-bearing, not decoration. |
| I-4 | Allocation is unique per **currency**: (portfolio, strategy, account, mode, venue, currency). | `portfolio_allocations` | One deployment can carry several allocations. Capital panels must group by currency and must never sum across currencies without an FX policy — the schema makes the multi-currency case normal, not exceptional. |
| I-5 | **Many virtual accounts may share one `external_account_ref`.** Isolation is by (strategy, account, mode, venue); the broker snapshot is aggregate. | `venue_accounts` binding rule | This is why Account/Broker 360°'s aggregate headroom check exists, and why spec §13.1 forbids assigning a physical position to a single alpha. See §2.3. |
| I-6 | Capital movement is an append-only ledger with before/after amounts. | `portfolio_capital_ledger` | The Portfolio 360° Capital Ledger tab is append-only by construction; it grows without bound and never edits in place. |

### 2.2 Portal language ↔ schema

The hi-fi says "alpha"; the schema says `strategies`. The mapping is exact and
should be stated once rather than re-derived per screen:

| Hi-fi / spec term | Schema | |
|---|---|---|
| Alpha | `strategies.strategy_id` | Alpha *versions* (`av_2041`) are Portal-side identity (spec §3), not a Trading System column |
| Deployment (`dep_88`) | `strategy_deployments.deployment_id` | |
| Account (`acct-live-grid-v21`) | `accounts.account_id` | virtual/internal |
| Broker binding (`binance_main_01`) | `venue_accounts.external_account_ref` | physical |
| Portfolio (`PF-CRYPTO`) | `portfolios.portfolio_id` | |
| Venue | `venues.venue` | registry-driven per D5 |

### 2.3 The consequence nobody has costed yet

I-5 plus §1.1 produces a number the hi-fi never faced. With 150–500 virtual
accounts over roughly five physical broker references, **one binding can have on
the order of 100 linked virtual accounts.** `HiFi Account Broker 360.dc.html`
shows three, and its footer sums them in the browser:

```
Σ virtual 41,000 vs physical 43,120 → headroom +2,120
```

That sum is the screen's core safety claim, and spec §13.2 says this screen is
where over-exposure is detected. Summing rows the browser happens to have loaded
is safe at three rows and **silently wrong at one hundred** the moment the table
paginates or virtualizes. The aggregate must therefore be computed server-side
over the full set and delivered as a value (BR-EX-14), leaving the table free to
scroll. Recorded here because it is a scale problem that only appears once the
identity model is taken seriously.

---

## 3. Budgets derived from the spec

### 3.1 Chart resolution ladder

Spec §16.4 caps an interactive series at **≤5,000 points**. The server selects
the interval; the client sends a range and an intent and never an interval
(BR-EX-04, ruled MODIFY).

**Revised 2026-08-21** after the backend master plan landed. The rule is not a
table of range brackets — it is *"the finest interval whose point count is
≤ 5,000"*. Stating it as brackets was a mistake in the first draft and the same
mistake is in master plan §4.2; see `BACKEND_PLAN_REVIEW.md` F-2.

| Interval | Fits a range up to | At the top of its band |
|---|---|---:|
| 1m | 3.47 days | 4,999 |
| **5m** | 17.4 days | 4,999 |
| 15m | 52 days | 4,999 |
| 1h | 208 days | 4,999 |
| 4h | 2.3 years | 4,999 |
| 1d | 13.7 years | 4,999 |

The 5m rung is the one the bracket form dropped, and it is the expensive one to
drop: a 10-day window under brackets gets 15m and 960 points, under this rule
gets 5m and 2,880. Four to seventeen days is the post-incident and weekly-review
window, so the loss lands exactly where it is felt.

**Every rung lands under 5,000, so no rung requires lossy downsampling.** This is
the cleanest possible answer to spec §16.3 "no smoothing that moves extrema":
we never decimate a series, we select the interval it was aggregated at. Bucket
aggregation is OHLC-preserving by construction; point decimation is not.

If a future window/interval combination does exceed the cap, the fallback is
**LTTB or M4 with extrema retention**, never stride sampling — stride sampling
silently deletes the drawdown spike that the screen exists to show. Whichever
path is used, `downsample_method` and `source_rows`/`returned_rows` are already
mandatory envelope fields (§16.2) and must be rendered in the caption.

### 3.2 Table budgets

| Rule | Value |
|---|---|
| Keyset page size | 100 rows |
| Virtualize above | 200 loaded rows |
| Max rows resident in memory | 2,000 (drop the far end when scrolling past) |
| Count | exact, filtered and total, both from the server |
| Pagination | keyset cursor only — never `OFFSET` (spec §16.4, hi-fi footer `c_ab34…`) |

### 3.3 Realtime budgets

Cadence targets are spec §21.1 verbatim; the right column is what they mean for
the client at our figures.

| Data class | §21.1 target | Client consequence |
|---|---|---|
| Order / fill / position state | event-driven, visible age < 1–2 s | SSE, render per event, no batching |
| Account / portfolio equity | event + bounded periodic, < 2–5 s | 150–500 deployments × one projection — **the heaviest steady-state stream in the product**; memoise per cell, never re-render a panel |
| Broker sync | per venue policy, exact age shown | age ticks locally between pushes; ticking must not re-render its panel |
| Rolling return / correlation | 1m/5m buckets | |
| Full correlation matrix | 1–5 min or on demand | never on the interactive path |
| Heavy attribution / report | background artifact job | poll the job, not the data |

Two hard rules follow from §16.4 "no per-card polling every second":

1. **Command Center opens exactly one subscription**, not one per fleet cell or
   watchlist row. Fleet counts now span 150–500 deployments; 500 cells behind
   500 streams is the failure §16.4 names, at ten times the scale it names it.
2. **A sequence gap is a state, not a retry.** On discontinuity in
   `projection_sequence` (revised — see M3): mark the surface `STALE`, re-fetch
   the REST snapshot, resume from the snapshot's `{epoch}:{sequence}`. Never
   interpolate across the gap and never let a stale projection keep rendering as
   live truth.

---

## 4. Shared mechanisms

Defined once here; the seventeen screens reference them by id rather than each
inventing a variant.

**M1 — Keyset table.** *Built 2026-08-21 as `components/table.tsx`; BR-EX-17 was
accepted, so it is bidirectional.* Mutually exclusive `after`/`before` in,
`next_cursor`/`prev_cursor` out, stable sort with an immutable-ID tie-break, no
`OFFSET`. Virtualize above 200 loaded rows at a fixed 32px row height. Sticky
header. Horizontal overflow scrolls **inside the panel**, never the page
(DS §8). Exact `total` and `filtered` counts from the server.

Three rules the component enforces rather than documents:

- **No page-number control exists.** Keyset cannot seek to page *n*, so offering
  one would advertise a capability the contract does not have. The component
  cannot be configured to render one.
- **Counts never come from `rows.length`** (M7). A count taken from loaded rows
  is right until the list paginates and confidently wrong afterwards.
- **A numeric column ignores a caller's truncate flag** (M6). Per-column opt-out
  of "never ellipsis a number" would make the rule advisory.

Rows are a fixed height because the funnel opens in a **drawer**, not inline.
The Full Blotter hi-fi draws an expand caret; the owner chose the drawer, and
variable-height rows are the reason — they make virtualization at 182k rows
unworkable, which is the same argument that produced BR-EX-13.

**M2 — Resolution-selected series.** Client sends a range and an intent, **never
an interval**; the server selects per §3.1 and returns the full §16.2 envelope.
`dataZoom` past the current interval's usefulness **re-queries at the next rung
down** — it never zooms into an already-aggregated array, which would render a
shape the data does not have. The caption always states the interval actually
served. *(Re-query behaviour is the unruled half of BR-EX-05; see review §5.)*

**M3 — Subscription with gap resync.** *Revised 2026-08-21: BR-EX-11 was ruled
MODIFY and the mechanism changes with it.* REST snapshot first, then SSE resumed
via `Last-Event-ID` = `{projection_epoch}:{projection_sequence}`. One
subscription per screen.

- **Sequence gap within an epoch** → `STALE` + resnapshot (§3.3).
- **Epoch change** → the previous cursor is void. Full resnapshot, never a
  resume, and the client waits for a server-assigned delay if one is supplied
  rather than inventing its own backoff (review F-5).
- **Disconnect** → visible `reconnecting` state carrying the last-good `as_of`,
  never a silent freeze that looks live.

What this mechanism can and cannot claim has to be said plainly, because the
screens are built on it: a contiguous `projection_sequence` proves nothing was
lost between the edge and the browser. It does **not** prove nothing was lost
between the Trading System and the edge — only `ORDER_STATUS` is event-driven
today and everything else is polled, so a value that changed and changed back
between two polls leaves a contiguous sequence and no trace. That is what
BR-EX-16 asks for and until it lands, M3's guarantee stops at the edge.

**M4 — Representation switch by cardinality.** Where a visual encoding stops
being readable past a threshold, the switch is a declared rule, not a judgement
call at implementation time:

| Encoding | ≤ threshold | above |
|---|---|---|
| Labelled correlation matrix | ≤ 15 alphas | clustered canvas heatmap, labels on axes only |
| Clustered heatmap | ≤ 150 alphas | ranked top-N pair list; heatmap becomes secondary |
| Chip row (venue, status) | ≤ 8 chips | multiselect with "3 of 15" summary |
| Un-virtualized table | ≤ 200 rows | M1 |

At 50–100 alphas per portfolio the correlation surface is a **clustered canvas
heatmap**: 100 × 100 at 6px per cell is a 600px square, which reads as structure
and resolves individual values on hover. Spec §16.3 already assumes this
("correlation heatmap always has numeric tooltip and sample coverage"); the
hi-fi's labelled grid is an artefact of a nine-alpha cast.

**M5 — Honest capping.** Any capped, ranked or truncated view states its own
truncation in the UI: `showing top 10 of 214`. A capped list without that label
is a lie of omission, and it is the exact failure mode the Execution Loop's state
discipline exists to prevent. Corollary: because counts are exact (§1.2), the
label carries a real denominator, never an estimate.

**M6 — Numeric column sizing.** DS §3 forbids abbreviating numerics in blotters,
therefore a numeric cell may never ellipsis. Columns are sized from instrument
precision metadata (tick size, decimals, currency) so the widest legal value
fits. What may truncate — with a title attribute — is prose: alpha names,
reasons, actor names. **Never an ID, never an amount.**

**M7 — Server-side aggregates.** Any figure that asserts something about a whole
set — headroom sums, fleet counts, gate progress, contribution shares — is
computed by the server over the full set and delivered as a value. **A total
derived from the rows currently loaded in the browser is forbidden**, because it
stays correct until the day the list paginates and then becomes confidently
wrong. See §2.3 for the case that forced this rule.

---

## 5. Backend contract requests

For codex. Each maps to screens in §6 and to a spec section. Written to be
actionable, not aspirational.

| ID | Request | Why (UI consequence if absent) | Spec |
|---|---|---|---|
| **BR-EX-01** | Keyset cursor on every list endpoint: orders/fills, operations, approvals, audit, sessions, sync history, findings, capital ledger. Opaque cursor, stable composite sort key, `next_cursor`. | `OFFSET` paging over 182k rows drifts rows across pages while events arrive; the hi-fi footer already promises a keyset cursor. | §16.4 |
| **BR-EX-02** | Server-side **filter and sort**, with filter sets matching the hi-fi chips exactly: Blotter `All/Filled/Partial/Rejected/Open`; Inbox `Mine/All/R1/R2/Exit/Live gates/Overdue`; Queue `Needs attention/Mine/All (24h)`. | `IMPLEMENTATION_PHASES` Phases 1/7/14 say "filters actually filter rows", which reads as client-side. Correct at 100 rows, structurally wrong at 182k. | §16.4 |
| **BR-EX-03** | Exact `total` and `filtered` counts in every list response. | Drives the hi-fi footer "412 in selection / 48,213 total" and M5 capping labels. Exact is affordable at 182k, so no estimate is acceptable. | §1.2 |
| **BR-EX-04** | Series endpoint accepting `window` + optional `interval`; server selects per the §3.1 ladder; response carries the full §16.2 envelope including `interval`, `source_rows`, `returned_rows`, `downsample_method`, `coverage`. | Without a served `interval` the caption cannot state what was actually rendered, and the chart silently misrepresents its own resolution. | §16.2, §16.4 |
| **BR-EX-05** | Re-query at the next ladder rung on zoom, within the §21.4 cached-chart budget (p95 < 500 ms). | Zooming an aggregated array shows a shape the data does not have. | §21.4 |
| **BR-EX-06** | Batch endpoint for Alpha 360°'s 12 insight tiles at **preview** resolution (~600 points/tile) in one request; full ladder resolution only for an expanded tile. | 12 round-trips at 4,368 points each is 52k points and 12 requests for a screen that is mostly glanced at. | §16.4 |
| **BR-EX-07** | Correlation snapshot for a portfolio: pairwise values + per-pair `samples` and `coverage` + `formula_version` + **server-computed clustering order**. Cadence 1–5 min or on demand. At 100 alphas this is 4,950 pairs — deliver as **packed parallel arrays** (values, samples, coverage) with an id index, not 4,950 JSON objects. | 4,950 pairs cannot be clustered client-side per render, a client-chosen order would differ between users viewing the same portfolio, and an object-per-pair payload is roughly 500 KB where a packed one is tens of KB. | §21.1, §21.3 |
| **BR-EX-08** | Ranked triage endpoint for Command Center: server ranks by severity → SLA → age, returns top-N **and** the total. | Phase 9 defines the ranking as the screen's whole point. Ranking client-side requires shipping every open item to rank ten of them, and the M5 label needs the denominator. | §21.1 |
| **BR-EX-09** | Alert grouping by (typed object, account) with occurrence counts. | Phase 7's rail renders one card per alert. Repeated findings on one account produce a wall of near-identical cards and bury the critical one. | §21.1 |
| **BR-EX-10** | One combined fleet + triage + watchlist subscription for Command Center. | §16.4 explicitly forbids per-card polling; fleet counts now span 150–500 deployments. | §16.4 |
| **BR-EX-11** | `source_sequence` continuity guarantees, a resume token, and **documented gap semantics** on the event stream. | M3 cannot detect a gap it has no contract for, and an undetected gap turns a stale projection into rendered "live" truth. | §16.2, §21.3 |
| **BR-EX-12** | Instrument precision metadata: tick size, decimals, quote currency, per instrument. | M6 sizes numeric columns from it. Without it a VND amount beside an 8-decimal USDT amount either wraps or gets ellipsised — and ellipsising a number is forbidden. | §15.3, §16.3 |
| **BR-EX-13** | Order funnel detail (`signal → intent → risk grant → ACK → fill`, per-hop timestamps) as a **separate per-order endpoint**, not embedded in blotter list rows. | Phase 14 expands the funnel inside the row. Embedding it makes rows variable-height, which breaks virtualization; fetching on demand keeps rows uniform. | §16.4 |
| **BR-EX-14** | **Server-computed aggregate exposure per broker binding**: Σ virtual across *all* linked accounts, physical exposure, headroom, and the linked-account count — as values, independent of any page of the linked-accounts table. | §2.3. One physical reference can back ~100 virtual accounts; a browser-side sum over loaded rows is the screen's safety claim quietly computed on a subset. | §13.2, M7 |
| **BR-EX-15** | Portfolio scope on Alpha 360° reads: the same alpha may be deployed in two portfolios (I-3), so every alpha query takes `portfolio_id` and states which one it answered. | Without it, an alpha in two portfolios silently mixes their deployments, capital and PnL into one screen that belongs to neither. | §12, I-3 |

Two requests are **removed** relative to the pre-figures draft, and are recorded
here so they are not re-raised: approximate counts (unnecessary at 182k) and
event batching (unnecessary at 0.7/min).

**Status, 2026-08-21.** All fifteen are ruled in master plan §15.1 — eleven
ACCEPT, four MODIFY, none refused. The four MODIFYs strengthen the request rather
than narrow it, except `BR-EX-05`, whose behavioural half was not addressed.
Seven further requests, **BR-EX-16 … BR-EX-22**, were raised after reading that
plan and live in [`BACKEND_PLAN_REVIEW.md`](BACKEND_PLAN_REVIEW.md) §4 rather
than being appended here — this table is the record of what the *screens* need at
scale, and those seven come from what the *backend contract* turned out to leave
open.

---

## 6. Per-screen refine

Screens whose cardinality is bounded by construction are marked **BOUNDED** with
the reason, and are not padded with invented analysis.

### Phase 0 — Shell & shared components
**BOUNDED.** Sidebar is registry-driven with a fixed group set; the component
fixture page renders one instance of each state. The only scale obligation is
that **every shared component is built against M1–M7 from the start** —
retrofitting virtualization, honest capping or server aggregates into eleven
components later is the expensive path.

### Phase 1 — Approval Inbox
- **Cardinality** — hi-fi 5 pending / 4 decided. Real: pending scales with fleet (150–500 deployments × gates), tens at a time; decided history is unbounded and retained beyond 6 months.
- **Break point** — the pending table stays small; **Recently-decided is the unbounded one** and breaks past ~200 rows.
- **Degradation** — pending list un-virtualized (it is a work queue; if it exceeds 200 the problem is operational, not visual — surface that honestly rather than paginating it away). Recently-decided gets M1 with a default 30-day window.
- **Server contract** — BR-EX-01, BR-EX-02 (the seven filter chips), BR-EX-03.
- **Invariant** — SoD-dimmed rows (`AP-311`, "not you") are **dimmed, never filtered out**; a server-side filter must not drop them, because their visibility is the separation-of-duty proof. Overdue sort order survives paging.
- **Perf budget** — no virtualization; one snapshot + SSE for new arrivals.

### Phase 2 — Gate R1 Review
**BOUNDED.** One release candidate, one evidence pack, one checklist. Cardinality
is fixed by the artifact. Watch only: an evidence pack with many waiver/condition
rows — cap the composer list at M4's table threshold and scroll inside its panel.

### Phase 3 — Gate R2 Review
**BOUNDED.** One decision, one R1 reference, one capital preview. The dark
operational preview strip recomputes from a single requested amount. Note I-4:
the capital diff is **per currency**, so the strip must name its currency rather
than implying a single number.

### Phase 4 — Paper Workbench
- **Cardinality** — ~2–7 orders/day for this deployment; 30-day observation ⇒ ~60–210 blotter rows. Equity 1h × 30 days = 720 points. Positions: single digits.
- **Break point** — none at these numbers. Comfortably inside budget.
- **Degradation** — none required. Blotter un-virtualized, capped at the observation window with "full blotter →" for the rest.
- **Server contract** — BR-EX-04 for the equity series; M7 for gate progress.
- **Invariant** — the `STALE` demo state must **mark the projection, not hide it**; the panel stays visible and stale. Gate progress (`12/30 days · 184/300 trades`) is server-computed (M7), never counted from visible rows.
- **Perf budget** — one M3 subscription; equity redraws on bucket close, not per fill.

### Phase 5 — Paper Exit Review
**BOUNDED.** One exit request, four evidence panels, a fixed decision footer.
Evidence numbers link out rather than embedding lists.

### Phase 6 — Admin Action Drawer
**BOUNDED.** 21 commands in 6 groups, fixed by the CLI guide. The verify timeline
grows with sub-intents (single digits).
- **Invariant worth restating** — `202 — NOT success yet` is the first timeline line and `PARTIAL` never renders green, however long the verify list grows.

### Phase 7 — Operations Queue
- **Cardinality** — hi-fi 5 rows. Operations track mutations, not fills — tens per day, retained beyond 6 months. Alert rail: one card per alert today.
- **Break point** — "All (24h)" is bounded; unbounded history breaks past ~200. The rail breaks at ~15 cards, well before the table does.
- **Degradation** — table M1 with the 24h default preserved. Rail uses BR-EX-09 grouping: one card per (typed object, account) carrying an occurrence count.
- **Server contract** — BR-EX-01, BR-EX-02 (three chips), BR-EX-09.
- **Invariant** — grouping must not merge distinct severities; a group containing a CRITICAL renders CRITICAL. The badge still counts **CRITICAL only**. `ack ≠ resolve` survives grouping.
- **Perf budget** — one M3 subscription shared with the rail.

### Phase 8 — Incident Detail
**BOUNDED.** One incident, one finding, a forward-only state rail, a handful of
operation rows. The timeline grows with the incident's own life — M1 only if it
exceeds 200 entries, which would itself be a signal.

### Phase 9 — Command Center
- **Cardinality** — hi-fi 4 triage rows, 6 fleet cells, 5 watchlist pins. Real: triage draws from every open incident/approval/operation across **150–500 deployments**; watchlist capped at 5 by design.
- **Break point** — the "Needs you now" panel is a **ranked view, not the whole truth**, from the first busy morning. Ranking 200 items client-side needs all 200 shipped.
- **Degradation** — server-ranked top-N (BR-EX-08) with an M5 label `showing top 10 of 214` and a link to the full queue. Fleet cells are counts only (as drawn) and link to stage lists.
- **Server contract** — BR-EX-08, BR-EX-10; fleet counts via M7.
- **Invariant** — triage must derive from **the same typed objects as the alert rail** (Phase 9's DoD); two ranking implementations would drift. `QUIET` means genuinely nothing open — never "nothing in the top N".
- **Perf budget** — **one** subscription (BR-EX-10). This screen carries the product's heaviest steady-state update rate (§3.3): each equity change must repaint only its own cell — memoise per cell, keyed on value, not on object identity.

### Phase 10 — Sandbox Certification
**BOUNDED.** One deployment, 7 fixed certification steps, a 3-column triptych, a
findings table in single digits. The cert run is capped at 30 minutes by policy,
which bounds its own event volume.

### Phase 11 — Canary Control Room
- **Cardinality** — one deployment, day 9/14, canary-window blotter (~30–100 rows), 5 KPIs, envelope compliance bars.
- **Break point** — none at these numbers.
- **Degradation** — none required.
- **Server contract** — BR-EX-04.
- **Invariant** — the **protective/scale asymmetry is the screen** (`brokerSync STALE` blocks scale-up, leaves halt/reduce/close enabled). No loading, empty or degraded state may disable a protective action — degradation must never remove the ability to stop trading.
- **Perf budget** — one M3 subscription; the guard band renders from state, never from a timer.

### Phase 12 — Live Full Operations
- **Cardinality** — as Phase 11, plus an open-order footer.
- **Break point** — none at these numbers.
- **Degradation** — none required.
- **Server contract** — BR-EX-04, BR-EX-11.
- **Invariant** — `brokerState MISMATCH` **replaces the broker panel and suppresses every broker-derived value on the screen**. This interacts with M3: a sequence gap on the broker stream must reach MISMATCH/STALE handling, not quietly leave last-good numbers on a live screen.
- **Perf budget** — as Phase 11.

### Phase 13 — Paper Workbench VNM
- **Cardinality** — as Phase 4, ~6/30 sessions, VND amounts (the largest digit count in the system).
- **Break point** — **column width, not row count.** VND beside 8-decimal USDT is the widest numeric pairing in the product, and I-4 makes that pairing normal rather than exceptional.
- **Degradation** — M6 sizing from BR-EX-12; the panel scrolls before any number is abbreviated.
- **Server contract** — BR-EX-12, plus the venue calendar for the paused-freshness clock.
- **Invariant** — `SUSPENDED_BY_CALENDAR` is neutral gray, the banner is INFO tone, and freshness **pauses** against the venue calendar rather than aging to STALE. A generic freshness implementation that ignores the calendar renders a false STALE every night — this is the screen's whole reason to exist.
- **Perf budget** — the paused clock must stop ticking, not tick and get suppressed at render.

### Phase 14 — Full Blotter
- **Cardinality** — **~182,000 rows** in the default 6-month view; 9 columns; funnel expansion per FILLED row.
- **Break point** — DOM dies around 2,000 un-virtualized rows. Separately: **inline row expansion makes row height variable, which is what breaks virtualization** — the two features in the hi-fi are in direct tension.
- **Degradation** — M1 throughout. Funnel moves to a right-hand drawer fed by BR-EX-13 (owner decision, §8.2), keeping list rows uniform.
- **Server contract** — BR-EX-01, BR-EX-02, BR-EX-03, BR-EX-13.
- **Invariant** — counts stay exact on both sides of the cross-filter chip ("412 in selection" ↔ "48,213 total"). REJECTED rows keep their risk reason **inline** — the reason is why the row exists and must not be demoted into the drawer. Numerics never abbreviate (M6). The footer states the 6-month default horizon so an empty older range reads as *the current view's window*, not as *no activity* (§8.3).
- **Perf budget** — 100-row pages, 2,000 resident, fixed row height, sticky header; drawer fetch on demand.

### Phase 15 — Alpha 360°
- **Cardinality** — **the heaviest screen**: 9 tables, 9 tabs, 12 insight tiles, a deployment map of ≤5 venue rows for this alpha *within the selected portfolio* (I-3).
- **Break point** — tiles, not tables. 12 charts at 4,368 points each will not hold an interactive frame budget; per-tab tables are small for a single alpha.
- **Degradation** — tiles render at ~600-point preview resolution via BR-EX-06; expanding a tile fetches the full ladder rung. Orders & Fills / Sessions / Audit tabs use M1. The tab row scrolls horizontally, never the page.
- **Server contract** — BR-EX-06, BR-EX-04, BR-EX-15, BR-EX-01/02 for the tabbed tables.
- **Invariant** — a `venueScope` change must re-filter **all nine tabs and the KPIs** (Phase 15 DoD), so scope belongs in the query, not in client-side row filtering, or tabs will silently disagree. **Portfolio scope is equally load-bearing** (I-3): the screen must name which portfolio it is answering for, since the same alpha can live in two. `INSUFFICIENT_DATA` stays a rendered tile state; a preview-resolution tile still carries its envelope caption.
- **Perf budget** — one batched tile request; charts in inactive tabs are not mounted; `large: true` on any series over 2,000 points.

### Phase 16 — Portfolio 360°
- **Cardinality** — hi-fi ~9 alphas (81 cells). Real: **50–100 alphas per portfolio ⇒ up to 10,000 cells / 4,950 unique pairs**, each with ~4,368 hourly samples over 6 months. Capital ledger is append-only and unbounded (I-6).
- **Break point** — cell labels become unreadable around **15 alphas**; 10,000 DOM cells make hover and repaint stutter long before that matters.
- **Degradation** — M4: clustered canvas heatmap (100 × 100 at 6px ⇒ ~600px square), axis labels only, hover by coordinate hit-test; **leader lens becomes the primary way in**, the matrix becomes context. Capital Ledger and Audit tabs use M1. Alpha rows table (50–100) stays un-virtualized, just under the M1 threshold.
- **Server contract** — BR-EX-07 (packed arrays + clustering order + per-pair samples/coverage), BR-EX-01 for the ledger.
- **Invariant** — pairs below the sample threshold render a **visible `INSUFFICIENT_DATA` cell, not a blank**. With staggered deployment dates this will be common, and the honest matrix is legitimately patchy — the hi-fi's fully-populated grid is a nine-alpha artefact, not a target. Clustering reorders display only; it never alters a value. Contribution shares come from M7, not from summing visible rows. Overview tab stays the honest APX-6 empty state.
- **Perf budget** — canvas, not 10,000 nodes; repaint ≤ 16 ms; the matrix refreshes on the §21.1 1–5 min cadence, never on the interactive path.

### Phase 17 — Account/Broker 360°
- **Cardinality** — one account; 3-column triptych; **linked virtual accounts up to ~100 per physical binding** (§2.3, I-5); sync history and findings grow continuously.
- **Break point** — the linked-accounts table past ~50 rows, and sync history past ~200.
- **Degradation** — M1 on sync history, findings **and the linked-accounts table**. The table may paginate *only because* the aggregate no longer depends on it (BR-EX-14).
- **Server contract** — BR-EX-14 (the aggregate), BR-EX-01 (histories), BR-EX-12 (amount columns).
- **Invariant** — the headroom figure (`Σ virtual 41,000 vs physical 43,120 → +2,120`) is **server-computed over every linked account** (M7). It must never be summed from a page, and the panel must state the linked-account count so a reader can see the sum covers more rows than the table shows. Per spec §13.1 a physical position is never attributed to a single alpha.
- **Perf budget** — one M3 subscription; the `SYNC OK 0.9s` age ticks without re-rendering the triptych.

---

## 7. Deltas from the hi-fi

Where implementation must deviate from the mock, recorded so the difference
reads as a decision rather than as drift.

| # | Screen | Hi-fi shows | Implementation | Reason |
|---|---|---|---|---|
| D-1 | Portfolio 360° | labelled correlation matrix | clustered canvas heatmap, axis labels only | up to 10,000 cells at 100 alphas; spec §16.3 already assumes a heatmap |
| D-2 | Full Blotter | funnel expands inline in the row | funnel in a right drawer | variable row height breaks virtualization at 182k rows (owner-approved, §8.2) |
| D-3 | Alpha 360° | 12 tiles at full fidelity | preview resolution; full only on expand | 52,416 points on one screen |
| D-4 | Inbox / Queue / Blotter | filters described as filtering rows | filters are server-side query parameters | correct at 100 rows, structurally wrong at 182k |
| D-5 | Command Center | triage panel reads as the complete list | server-ranked top-N + `showing top 10 of 214` | ranking 200 items client-side ships all 200 |
| D-6 | Operations Queue | one rail card per alert | grouped by (object, account) with counts | repeated findings bury the critical card |
| D-7 | Account/Broker 360° | 3 linked accounts, summed in the footer | paginated table + server-computed aggregate | one binding can back ~100 virtual accounts (§2.3) |
| D-8 | Alpha 360° | scope bar without a portfolio dimension | portfolio is part of the scope | the same alpha can be deployed in two portfolios (I-3) |

None of these change layout proportion, hierarchy or copy — they change what
feeds the layout. The hi-fi remains the visual truth (HANDOFF §3b).

---

## 8. Decisions

### 8.1 Theme — LOCKED: follow the hi-fi
Operations Dark is the IBM Carbon identity of DS §7; the hex values rendered in
the hi-fi files are authoritative. Individual components may be adjusted where
the mock is visually weak, but the direction is the hi-fi's.

Constraint that shapes *how*: `CLAUDE.md` §0 forbids touching Research or
Planning, and 46 of the 100 committed visual baselines are operations-theme.
Carbon therefore lands as an **Execution-scoped surface** — the shared
`data-theme="operations"` that Research renders in is not restyled. Mechanism
(a separate theme value vs. route-scoped tokens) is an implementation choice to
settle in Phase 0; the constraint is that no Research baseline moves.

### 8.2 Blotter funnel — LOCKED: drawer
Right-hand drawer fed by BR-EX-13. Rows stay uniform height, virtualization
stays simple. Costs one click versus the mock.

### 8.3 History beyond 6 months — LOCKED: defer, keep honest
Older execution data remains queryable; a user reaches it by request to an
admin, and an admin-side range control is a later, low-priority design. **No
Portal UI is built for it now.** The obligation this leaves on Phase 14 is only
that the blotter footer names its 6-month window, so an empty older range reads
as the view's horizon rather than as an absence of trading.

### 8.4 Portfolio and alpha cardinality — LOCKED
3–5 portfolios, 50–100 alphas each. Folded into §1 and §2, and it is what moves
Phase 16 from a 2,500-cell surface to a 10,000-cell one.

### 8.5 Still open
1. **The orders/fills ratio** flagged in §1.1: 1,000/day across 150–500
   deployments is ~2–7 per deployment per day. Confirm, or name the
   higher-frequency subset — it is the figure the blotter, event and workbench
   budgets all rest on.
2. **Registry revision 3** — the hi-fi's nav groups (COMMAND / GOVERNANCE /
   DEPLOYMENTS / ADMINISTRATION) and its seventeen screens do not exist in
   registry revision 2. Nav is registry-driven by hard rule, and `registry.json`
   is backend-owned, so Phase 0's nav half stays blocked on codex regardless of
   the component half.

---

## BR-EX-23 — R2 review row phải mang `portfolio_id` và `currency`

**Ngày raise:** 2026-08-22, sau khi `EX-BE-07b` giao
`POST /api/v1/execution/approvals/{approvalId}/capital-preview`.

**Endpoint/field cần:** thêm `portfolio_id` và `currency` vào payload của
`GET /api/v1/execution/governance/approvals/{id}/r2`.

**Lý do UI:** `CapitalPreviewRequest` bắt buộc ba trường — `portfolio_id`,
`requested_amount`, `currency`. Gate R2 có `requested_amount` (nằm trong
request), nhưng **không có hai trường kia**: row R2 hiện chỉ trả `capital[]` đã
dựng sẵn, không nói deployment này thuộc portfolio nào.

**Ảnh hưởng hiện tại:** `GateR2ReviewContainer` đang nhận chúng qua prop với
default trỏ vào fixture (`PF-1` / `USDT`). Chạy được với fixture, **không chạy
được với endpoint thật** — mỗi màn R2 sẽ hỏi preview của cùng một portfolio.

**Vì sao không tự suy ra:** có thể đoán currency từ nhãn trong `capital[]`, và
đoán portfolio từ `subject` (`"Carry v3.2 → PF-MAIN · Paper · BINANCE"`). Cả hai
đều là **màn hình tự quyết định nó đang nhìn portfolio nào** để rồi hỏi tiền của
portfolio đó. Parse sai một chuỗi hiển thị thì reviewer duyệt vốn cho nhầm
portfolio — nên chỗ này đợi field thật, không đoán.

**Đề xuất schema** (chỉ đề xuất — codex quyết):

```json
{ "approval": { "portfolio_id": "PF-1", "currency": "USDT" } }
```

**Trạng thái:** đang treo. Cho tới khi giao, R2 chạy fixture với prop mặc định,
và `containers.tsx` ghi rõ lý do ngay tại chỗ.

**ĐÃ LÀM — `d7cab88`.**
`governance.controller.ts:63-71`, `governance.service.ts:277-302` và
`governance.repository.ts:407-452` tạo `GET /api/v1/execution/governance/approvals/{id}/r2`:
read-only, workspace-bound R2 review trả immutable `portfolio_id` / `currency`.
Repository dùng một `REPEATABLE READ READ ONLY` snapshot, không lộ scope
cross-workspace, closed hoặc expired. Test
`governance.spec.ts:475-525` chứng minh ADMIN/USER/cross-workspace/expired;
OpenAPI, fixture và generated type đã có. Claude cần map hai field từ
`readGateR2Detail` và bỏ default `PF-1` / `USDT` khi dùng endpoint.

---

## BR-EX-24 — Full Blotter cần endpoint list order (keyset)

**Ngày raise:** 2026-08-22, khi dựng phase 14.

**Endpoint/field cần:** một endpoint list order theo keyset, ví dụ
`GET /api/v1/execution/orders` với `filter` (bucket 5 chip), `after`/`before`,
`limit`, `scope` (alpha/deployment/venue/time), trả `keyset-page.v1` với
`total_count` **và** `filtered_count`.

**Lý do UI:** `EX-BE-07b` đã giao `/orders/{orderId}/funnel` — nhưng đó là chi
tiết một order. Không có gì trả **danh sách** order. Màn blotter là màn duy nhất
có p95 10⁵–10⁷ dòng, nên nó không thể lấy dữ liệu từ chỗ khác rồi lọc.

**Ảnh hưởng hiện tại:** `FullBlotter` chạy bằng typed props +
`blotter.fixtures.ts`, đúng cách Gate R1/R2 chạy trước khi `EX-BE-05a` giao.
Khi endpoint có, chỉ thêm một mapper — màn không đổi.

**Hai thứ server phải giữ, không phải client:**

1. **Bucket 5 chip phải server-side.** `BLOTTER_BUCKET` trong `contracts.ts` là
   *đề xuất* map 12 `OrderStatus` → 5 chip. Hai bên phải bucket **giống hệt**,
   nếu không count ở footer sẽ không khớp số dòng trong bảng. Chip lọc ở browser
   là nói dối ở quy mô này: 9 dòng `FILLED` cạnh footer "48,213 total" là hai
   con số mô tả hai population, trình bày như một.
2. **Hai count riêng.** `total_count` và `filtered_count` là hai trường, không
   phải một số client trừ đi.

**Trạng thái:** đang treo.

**CẦN BOBBY —** source runtime hiện chỉ có `GET /v1/orders` với `ALPHA_KEY`;
không có delegated Portal capability, keyset, bucket semantics hay hai count.
Rust generic query foundation không được expose thành raw evaluator. Cần source
publish read capability versioned/scope-bound, snapshot-completeness, cursor,
`total_count` + `filtered_count`, và mapping server-side cho 5 bucket; trước đó
Full Blotter tiếp tục fixture. Không có commit/backend route cho request này.

---

## BR-EX-25 — Funnel: hi-fi vẽ 5 hop, contract publish 4 stage

**Ngày raise:** 2026-08-22.

**Chênh lệch:** `HiFi Full Blotter.dc.html` vẽ `signal → intent → risk grant →
order ACK → fill`. `EX-BE-07a` publish `SUBMIT → SOURCE_ACK → BROKER_ACK →
FILL`. Không phải đổi tên: `signal` (`sig_7f21`) và `intent` (`int_9c04`) là hai
bước **upstream của order**, endpoint funnel không mang.

**Đã xử lý thế nào:** render đúng 4 stage server publish, và **nói thẳng trên
màn** rằng hai hop kia không nằm trong endpoint này. Không bịa card `signal` từ
stage `SUBMIT` — đó là vẽ một hop không nguồn nào bảo đảm, trên đúng màn có
nhiệm vụ nói ta nắm được sự thật nào.

**Hỏi codex:** hai hop upstream có tồn tại trong source không? Nếu có, xin thêm
vào `OrderFunnelData.stages` (và nới `maxItems` 4 → 6). Nếu không, hi-fi cần sửa
— và đây là chỗ `IMPLEMENTATION_PHASES` §14 ("`signal → intent → risk grant ✓ →
order ACK → fill`") mô tả thứ backend không có.

**Trạng thái:** đang treo, cần codex trả lời trước khi đóng phase 14.

**KHÔNG LÀM —** source-backed funnel chỉ có bốn stage
`SUBMIT → SOURCE_ACK → BROKER_ACK → FILL`
(`analytics/src/funnel.rs:14-25,59-67`). Không có lifecycle fact signal/intent
đủ identity, timestamp, order binding và completeness; `intent` trong command
hay `risk_grant_id` không đủ để bịa hai hop. Hi-fi giữ 4 stage và limitation rõ
ràng; muốn 5/6 hop cần source publish fact mới. Không có commit cho request
này.

---

## BR-EX-26 — Aggregate headroom phải do server phán, không phải browser cộng

**Ngày raise:** 2026-08-22, khi dựng phase 17.

**Endpoint/field cần:** thêm vào `BindingExposureData` (hoặc endpoint riêng):

```json
{ "aggregate": {
    "virtual_total": "41000.00", "physical_total": "43120.00",
    "headroom": "+2120.00", "currency": "USDT",
    "verdict": "OK" } }
```

`verdict` ∈ `OK | EXCEEDED | UNKNOWN`.

**Lý do UI:** hi-fi 1g ghi *"the aggregate check is THIS screen's job"* và
`IMPLEMENTATION_PHASES` §17 ghi *"headroom computes from the linked-accounts
table, not a hardcoded value"*. Đọc kỹ thì hai câu đó nói **hai việc khác nhau**,
và chỉ một việc thuộc về frontend:

- *Hiển thị* aggregate ở màn này — **đúng**, đây là chỗ duy nhất kết luận được,
  vì một physical account đỡ nhiều virtual account.
- *Tính* aggregate ở browser — **không**. Đây là control **fail-closed**: nếu
  browser cộng ra `+2,120` trong khi execution cell giữ `46,800` và chặn mọi
  lệnh, màn hình vừa nói với operator điều **ngược lại** với thứ sắp xảy ra. Một
  phán quyết an toàn phải đến từ thứ thi hành nó.

Và browser **không thể** cộng đúng kể cả khi muốn: nó chỉ thấy `linked[]` mà
endpoint trả về. `BindingExposureData` có sẵn `account_count` vs
`expected_account_count` chính vì population có thể thiếu — cộng 21 dòng rồi gọi
là tổng của 24 account là đúng thứ `isFullPopulation` sinh ra để chặn.

**Ảnh hưởng hiện tại:** `AccountBroker360` đọc prop `aggregate`; `null` render
thành panel `unavailable` kèm lý do, **không** render thành OK. Fixture cấp cả
ba verdict. Không có phép cộng nào trong màn — test chứng minh bằng cách đổi
verdict mà giữ nguyên các dòng: banner đi theo verdict, không theo số học.

**Trạng thái:** đang treo.

**CẦN BOBBY —** Portal chỉ có virtual exposure input, không có physical broker
exposure authoritative, reconciliation epoch/as-of/freshness hay verdict để
phán (`analytics/src/exposure.rs:26-53,66-74`). Browser không được cộng thay.
Cần source capability trả full virtual population + physical amount theo
currency, `as_of`/freshness/reconciliation và `OK|EXCEEDED|UNKNOWN`; thiếu hoặc
stale phải là `UNKNOWN`. Không có commit cho request này.

---

## BR-EX-27 — Packed correlation matrix cần `sample_counts`

**Ngày raise:** 2026-08-22, khi dựng phase 16.

**Endpoint/field cần:** thêm mảng song song vào `PackedMatrixRepresentation.matrix`:

```json
{ "dimension": 47,
  "packing": "LOWER_INCLUDING_DIAGONAL_ROW_MAJOR",
  "values": ["1", "0.31", ...],
  "sample_counts": [720, 720, 96, ...] }
```

Cùng cách index `row×(row+1)/2 + column`, cùng độ dài `n(n+1)/2`.

**Lý do UI:** `IMPLEMENTATION_PHASES` §16 đóng phase bằng đúng câu *"correlation
panels render INSUFFICIENT_DATA when samples < threshold instead of numbers"*.
Hiện **không làm được per-cell**: `CorrelationPair` (RANKED_PAIRS) có
`sample_count`, còn `PackedMatrixRepresentation` **không có gì**. Hai
representation của cùng một phép đo mà một cái kiểm được đủ dữ liệu, một cái
không.

**Ảnh hưởng hiện tại:** `readCorrelation` đọc `sample_counts` nếu có (forward
compatible, mảng thiếu độ dài thì **từ chối** chứ không pad — index sai sẽ làm
luật insufficiency bắn nhầm ô, tệ hơn là không bắn). Khi vắng, màn **nói thẳng**
trên caption: *"per-pair sample counts are not published for a packed matrix, so
the 200-sample floor could not be applied to individual cells"*.

Im lặng ở đây là tệ nhất: các con số sẽ đọc như đã qua một bước kiểm chưa từng
chạy. Và **không** đánh dấu ô là insufficient chỉ vì thiếu count — "không kiểm
được" khác "kiểm rồi và không đạt".

**Trạng thái:** đang treo.

**CẦN BOBBY —** off-diagonal pairs có `sample_count`, nhưng diagonal `1` đang
được synthesize và self-pair bị source từ chối
(`analytics/src/correlation.rs:20-25,50-61,173-218`), nên không có số count
trung thực cho mọi packed cell. Cần chọn semantics source: publish self-pair
counts (khuyến nghị) hoặc contract cho phép diagonal nullable; sau đó mới
publish `sample_counts` cùng packing/độ dài với `values`. Không thêm số giả và
không có commit cho request này.

---

## CẦN BOBBY — Phase 6 Admin Action Drawer: đối chiếu capability (2026-08-22)

| Nguồn | Fact đã publish | Hệ quả / quyết định cần owner |
|---|---|---|
| Hi-fi `HiFi Admin Action Drawer.dc.html` | Thực tế có **24** entry, không phải 21: `7 + 4 + 4 + 2 + 4 + 3` trong 6 group. Phần mutation chung vẽ flow `Generate plan → Apply → Verify`. | Đây là UX mục tiêu, không phải source authority; con số 21 trong §Phase 6 cần được sửa sau khi Bobby chốt scope. |
| `command-catalog.yaml` | 13 action family; chỉ **emergency close/protective action** có `plan: true`, `apply: true`, `verify: true`. 12 family còn lại `plan: false`; destructive lab reset bị block. | Hi-fi hiện khái quát flow plan/apply/verify vượt capability publish cho đa số action. |
| `extract/cli-command-map.json` | 19 noun / 64 action: 47 HTTP, 10 HTTP+Postgres+Redis, 2 Postgres direct, 5 Redis direct; 7 action không có HTTP equivalent. | “Portal reachable” không phải authorization. 10 mixed, 7 direct-only, host-only lab reset và shared-testnet reset không được Portal gọi. |

**Câu hỏi chốt cho Bobby:** với từng mutation muốn giữ trong drawer, chọn một
trong hai: (1) source xuất capability `plan/apply/verify` versioned,
scope-bound, audited và delegated; hoặc (2) hi-fi hiển thị capability hiện có
(`plan: false` / unavailable). Không suy luận quyền từ CLI hay bật runtime flag.

---

## BR-EX-29 — Plan payload cần `conditions[]`, không phải một chuỗi

**Ngày raise:** 2026-08-22.

**Hiện trạng:** `DecisionPlanRequestSchema` nhận
`payload.condition: string | null`. Frontend giờ đã gửi nó — trước đó
`APPROVE_WITH_CONDITION` đi ra **không kèm condition nào**, tức quyết định mà
toàn bộ ý nghĩa nằm ở điều kiện đính kèm lại không đính kèm gì.

**Vấn đề còn lại:** một `TypedCondition` trên UI có **owner, deadline, expiry**
— hi-fi footnote R2 ghi rõ *"conditions are typed objects with owner/deadline/
expiry, never free text"*. Contract chỉ nhận một chuỗi, nên frontend đang phải
**bẹp cấu trúc thành câu**:

```
"reduce max position notional · owner Lan · deadline 2026-09-15 · expires 2026-10-01"
```

Server nhận được một chuỗi. Nghĩa là **server không cưỡng chế được gì**: không
biết deadline nào đã qua, không nhắc được owner nào, không hết hạn được điều
kiện nào. Một điều kiện không cưỡng chế được là một ghi chú.

Và Approval Inbox có cột `conditions` đếm *"2 active · exp 2026-10-01"* — con số
đó chỉ đúng nếu server hiểu cấu trúc.

**Đề xuất:**

```json
{ "payload": { "decision": "APPROVE_WITH_CONDITION",
    "conditions": [
      { "text": "...", "owner": "usr_lan",
        "deadline": "2026-09-15", "expires_at": "2026-10-01" }
    ] } }
```

Nhiều điều kiện vì hi-fi cho phép đính nhiều. Giữ `condition` chuỗi làm
deprecated alias nếu cần chuyển dần.

**Ảnh hưởng hiện tại:** frontend gửi điều kiện mới nhất, bẹp thành chuỗi, và
`describeCondition` trong `containers.tsx` ghi rõ tại chỗ vì sao. Khi
`conditions[]` có, xoá hàm đó và gửi mảng.

---

## BR-EX-30 — R2 response thiếu bảy trường màn R2 đang đọc

**Phát hiện:** 2026-08-22, trong lúc làm C-PI04-01 (audit contract consumption).
**Cách tìm:** đối chiếu bằng máy mọi tên snake_case reader frontend đọc với
`packages/contracts/generated/*.d.ts`, rồi tra ngược từng cái không khớp.

### Vấn đề

`execution-governance-r2-review.v1.schema.json` publish `data.actor` và
`data.approval` (25 khoá). `readGateR2Detail` đọc **bảy** tên không có ở đó:

| Trường frontend đọc | Có trong R2 schema | Có trong contract pack | Có trong Control API |
|---|---|---|---|
| `r1_reference` | ❌ | ❌ | ❌ |
| `r1_state` | ❌ | ❌ | ❌ |
| `r1_id` | ❌ | ❌ | ❌ |
| `grant_name` | ❌ | ❌ | ❌ |
| `approver_role` | ❌ | ❌ | ❌ |
| `plan_author` | ❌ | ❌ | ❌ |
| `evidence_manifest` | ❌ | ❌ | 1 lần |

Chúng được viết từ hi-fi **trước khi** schema tồn tại. Với endpoint thật, cả
bảy trả `null` — chip lineage R1, tên grant, vai trò người duyệt và passport
bằng chứng trên Gate R2 sẽ **trống**, và không gì nói tại sao.

### Vì sao đây là việc của backend

Hi-fi 1b bắt Gate R2 phải cho người duyệt thấy **R2 này dựa trên R1 nào**. Đó
là yêu cầu an toàn, không phải trang trí: duyệt cấp vốn mà không thấy chuỗi
thẩm quyền phía trước là duyệt mù. Frontend không bịa được thứ contract không
gửi.

### Xin codex

Publish trong `R2ReviewResponse` (tên là đề xuất, codex quyết):

```
data.approval.r1_reference: { approval_id, state, decided_at } | null
data.approval.grant_name: string | null
data.approval.approver_role: string | null
data.approval.plan_author: string | null
data.evidence_manifest: { entries[] } | null
```

Nếu một trong số đó **cố ý không publish**, xin nói rõ — frontend sẽ hiện
`unavailable` kèm lý do thay vì để trống.

### Frontend đã làm gì

`contractFixtures.test.ts` có một gate khẳng định bảy tên này **vẫn vắng**.
Ngày codex publish bất kỳ cái nào, test đỏ và reader thôi đoán. Đây là bản ghi
sống của khoảng trống, không phải chấp nhận lỗi.

---

## BR-EX-31 — `delivery_policy` chưa có cờ cho **write của Portal**

**Phát hiện:** 2026-08-22, khi làm B8 (policy Portal-governance-write riêng).

### Vấn đề

`portal-registry-source.v1.schema.json` publish **7** cờ trong `delivery_policy`:

```
query_enabled · projection_ingestion_enabled · sse_enabled
paper_commands_enabled · sandbox_commands_enabled
live_protective_commands_enabled · live_risk_increasing_commands_enabled
```

Không cờ nào mô tả **ghi governance của Portal** — duyệt, từ chối, gia hạn,
reject. Nên frontend đang phải mượn `paper_commands_enabled`, và **sai cả hai
chiều**:

| Tình huống | Hệ quả hôm nay | Đúng ra |
|---|---|---|
| Workspace tắt lệnh paper | **không ghi được một quyết định nào**, dù duyệt chỉ cấp thẩm quyền và không chạy gì | ghi được |
| Workspace bật lệnh paper | **quyết được cả live gate**, vì tier đang duyệt không liên quan tới cờ được tra | phải theo cờ riêng |

Duyệt **không phải** là chạy lệnh. Duyệt cấp thẩm quyền; lệnh mới là thứ dùng
thẩm quyền đó. Gộp hai thứ vào một cờ nghĩa là bật một cái là bật cái kia.

### Xin codex

Thêm vào `delivery_policy` (tên là đề xuất):

```
governance_write_enabled: boolean
```

Nếu cần chi tiết hơn theo tier đang duyệt, xin nói rõ hình dạng — frontend sẽ
theo, miễn là nó **không** phải cờ lệnh Trading System.

### Frontend đã làm gì

Gom toàn bộ chỗ nhập nhằng vào **một** hàm `governanceWriteBlocked(policy)` ở
`profile.ts`, thay vì rải `commandBlockedReason(policy, "R1")` ở từng call site.
Thông báo cho operator nêu thẳng đây là cờ mượn và trỏ tới BR-EX-31. Ngày cờ
thật xuất hiện, đây là **một** chỗ sửa chứ không phải một cuộc tìm kiếm.

---

## BR-EX-32 — `GET /operations` thiếu filter theo actor

**Phát hiện:** 2026-08-23, khi audit phase 7.

### Vấn đề

Hi-fi 4e vẽ ba chip: **Needs attention · Mine · All (24h)**. Endpoint publish
12 tham số — `workspace_id`, `after`, `before`, `limit`, `triage_state`,
`environment`, `source_status`, `verification_result`, `severity`,
`target_type`, `command_key`, `sort` — **không có** actor, assignee, owner hay
user.

Nên chip "Mine" gửi **y hệt** chip "All (24h)" và trả về **cùng một danh sách**.
Một chip ghi *Mine* mà hiện công việc của mọi người không phải chip vô dụng — nó
là chip người vận hành **tin tưởng** và bị dẫn sai.

### Xin

Một tham số lọc theo người, tên tuỳ codex chọn:

```
GET /api/v1/execution/operations?assigned_to=me
```

hoặc `actor_user_id=<id>`. Ngữ nghĩa "của tôi" cũng cần codex chốt: người
**acknowledge**, người **resolve**, hay người được **giao**? Ba nghĩa khác nhau
và hi-fi không nói rõ.

### Frontend đã làm gì

Chip vẫn **hiện** và bị **disable**, kèm lý do — chứ không xoá. Chip biến mất
đọc như một lựa chọn thiết kế; chip lặng lẽ trả về mọi thứ thì tệ hơn cả hai.

`operations.test.tsx` có gate khẳng định endpoint **vẫn chưa** có tham số nào
khớp `actor|assignee|owner|user`. Ngày codex publish, test đỏ — đó là tín hiệu
bật chip, không phải hỏng.
