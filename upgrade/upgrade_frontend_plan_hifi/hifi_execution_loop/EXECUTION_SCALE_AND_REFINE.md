# EXECUTION_SCALE_AND_REFINE.md

> **Status:** v1 — owner scale figures locked 2026-08-21, awaiting backend plan.
> **Audience:** Claude (frontend lead) and codex (backend lead). Sections 1–4 are
> the shared contract surface; section 5 is frontend working detail.
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
| Alphas deployed concurrently | **50** | early phase; "smooth and realtime" is required at this number, not aspirational |
| Venues | **5** | BINANCE / OKX / DERIBIT / VN MARKET + 1 headroom |
| Orders + fills per day | **1,000** | combined, all deployments |
| Order/fill retention in Portal | **6 months** | older execution rows are not queried from Portal |
| Other domain data retention | longer / unbounded | approvals, audit, operations, incidents, equity |
| Equity & chart default resolution | **1h**, tunable per window | |

### 1.1 Derived figures

| Derived | Calculation | Result |
|---|---|---|
| Full Blotter rows at full retention | 1,000/day × 182 d | **~182,000** |
| Orders+fills per deployment per day | 1,000 ÷ 50 | **~20** |
| Execution event rate, average | 1,000/day | **0.7 / min** |
| Execution event rate, 20× burst | | ~14 / min |
| Equity points, 1h × 6 months | 24 × 182 | 4,368 |
| Equity points, 1h × 1 year | 24 × 365 | 8,760 — **over budget** |
| Equity points, 1m × 3 days | 60 × 24 × 3 | 4,320 |
| Correlation cells, 50 alphas | 50 × 50 | **2,500** (1,225 unique pairs) |
| Correlation samples per pair, 1h × 6 mo | | 4,368 — ample |
| Deployments | 50 alphas × 1–5 venues | 50–250; plan for **≤100** |
| Alpha 360° insight tiles at full resolution | 12 × 4,368 | 52,416 points on one screen |

### 1.2 What these figures rule OUT

Stating the non-requirements is as valuable as stating the requirements: each
line below is a workstream that must **not** be built.

| Not needed | Why |
|---|---|
| Approximate / estimated row counts | 182k rows counts exactly in milliseconds on an indexed column. `COUNT` stays exact, so no `~` prefix and no "10,000+" label anywhere. |
| Event coalescing or batching for execution events | 0.7/min average, ~14/min burst. Naive per-event rendering is already correct. |
| WebSocket transport | Spec §16.4 reserves WS for "dense tape". 1,000 events/day is not dense tape. **SSE covers every Execution Loop surface.** |
| VenueScope overflow / multiselect summary | 5 chips fit the hi-fi chip row as drawn. Keep the threshold rule documented (§3 M4) but build nothing. |
| Virtualization in workbench blotters | ~20 rows/day/deployment. Plain DOM. Virtualization applies to Full Blotter and history tabs only. |

---

## 2. Budgets derived from the spec

### 2.1 Chart resolution ladder

Spec §16.4 caps an interactive series at **≤5,000 points**. Applying that to the
owner's "1h, tunable" gives a deterministic ladder. The server picks `interval`
from `window` whenever the client omits it.

| Window | Interval | Points | |
|---|---|---|---|
| ≤ 3 days | 1m | ≤ 4,320 | intraday detail |
| ≤ 30 days | 15m | ≤ 2,880 | |
| ≤ 6 months | **1h** | ≤ 4,368 | **default** |
| ≤ 2 years | 4h | ≤ 4,380 | |
| > 2 years | 1d | 365 / year | |

**Every rung lands under 5,000, so no rung requires lossy downsampling.** This is
the cleanest possible answer to spec §16.3 "no smoothing that moves extrema":
we never decimate a series, we select the interval it was aggregated at. Bucket
aggregation is OHLC-preserving by construction; point decimation is not.

If a future window/interval combination does exceed the cap, the fallback is
**LTTB or M4 with extrema retention**, never stride sampling — stride sampling
silently deletes the drawdown spike that the screen exists to show. Whichever
path is used, `downsample_method` and `source_rows`/`returned_rows` are already
mandatory envelope fields (§16.2) and must be rendered in the caption.

### 2.2 Table budgets

| Rule | Value |
|---|---|
| Keyset page size | 100 rows |
| Virtualize above | 200 loaded rows |
| Max rows resident in memory | 2,000 (drop the far end when scrolling past) |
| Count | exact, filtered and total, both from the server |
| Pagination | keyset cursor only — never `OFFSET` (spec §16.4, hi-fi footer `c_ab34…`) |

### 2.3 Realtime budgets

Cadence targets are spec §21.1 verbatim; the column on the right is what they
mean for the client at our figures.

| Data class | §21.1 target | Client consequence |
|---|---|---|
| Order / fill / position state | event-driven, visible age < 1–2 s | SSE, render per event, no batching |
| Account / portfolio equity | event + bounded periodic, < 2–5 s | 50 deployments × one projection = 10–25 cell updates/s — **memoise per cell**, never re-render the panel |
| Broker sync | per venue policy, exact age shown | age ticks locally between pushes; ticking must not re-render its panel |
| Rolling return / correlation | 1m/5m buckets | |
| Full correlation matrix | 1–5 min or on demand | never on the interactive path |
| Heavy attribution / report | background artifact job | poll the job, not the data |

Two hard rules follow from §16.4 "no per-card polling every second":

1. **Command Center opens exactly one subscription**, not one per fleet cell or
   watchlist row. 50 cells behind 50 streams is the failure §16.4 names.
2. **A sequence gap is a state, not a retry.** On discontinuity in
   `source_sequence`: mark the surface `STALE`, re-fetch the REST snapshot,
   resume the stream from the snapshot's sequence. Never interpolate across the
   gap and never let the stale projection keep rendering as live truth.

---

## 3. Shared mechanisms

Defined once here; the seventeen screens reference them by id rather than each
inventing a variant.

**M1 — Keyset table.** Cursor in, `next_cursor` out, stable composite sort key,
no `OFFSET`. Virtualize above 200 loaded rows with a fixed row height. Sticky
header. Horizontal overflow scrolls **inside the panel**, never the page
(DS §8). Exact `total` and `filtered` counts from the server.

**M2 — Resolution-selected series.** Client sends `window`; server returns the
ladder interval (§2.1) plus the full §16.2 envelope. `dataZoom` past the current
interval's usefulness **re-queries at the next rung down** — it never zooms into
an already-aggregated array, which would render a shape the data does not have.
The caption always states the interval actually served.

**M3 — Subscription with gap resync.** REST snapshot first, then SSE resumed
from that snapshot's `source_sequence`. One subscription per screen. Gap →
`STALE` + resnapshot (§2.3). Disconnect → visible `reconnecting` state carrying
the last-good `as_of`, never a silent freeze that looks live.

**M4 — Representation switch by cardinality.** Where a visual encoding stops
being readable past a threshold, the switch is a declared rule, not a judgement
call at implementation time:

| Encoding | ≤ threshold | above |
|---|---|---|
| Labelled correlation matrix | ≤ 15 alphas | clustered canvas heatmap, labels on axes only |
| Clustered heatmap | ≤ 80 alphas | ranked top-N pair list; heatmap becomes secondary |
| Chip row (venue, status) | ≤ 8 chips | multiselect with "3 of 15" summary |
| Un-virtualized table | ≤ 200 rows | M1 |

At 50 alphas, the correlation surface is a **clustered heatmap**. Spec §16.3
already assumes this ("correlation heatmap always has numeric tooltip and sample
coverage"); the hi-fi's labelled grid is an artefact of a nine-alpha cast.

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

---

## 4. Backend contract requests

For codex. Each maps to screens in §5 and to a spec section. Written to be
actionable, not aspirational.

| ID | Request | Why (UI consequence if absent) | Spec |
|---|---|---|---|
| **BR-EX-01** | Keyset cursor on every list endpoint: orders/fills, operations, approvals, audit, sessions, sync history, findings. Opaque cursor, stable composite sort key, `next_cursor`. | `OFFSET` paging over 182k rows drifts rows across pages while events arrive; the hi-fi footer already promises a keyset cursor. | §16.4 |
| **BR-EX-02** | Server-side **filter and sort** on those endpoints, with the filter sets matching the hi-fi chips exactly: Blotter `All/Filled/Partial/Rejected/Open`; Inbox `Mine/All/R1/R2/Exit/Live gates/Overdue`; Queue `Needs attention/Mine/All (24h)`. | `IMPLEMENTATION_PHASES` Phases 1/7/14 say "filters actually filter rows", which reads as client-side. Correct at 100 rows, structurally wrong at 182k — the filtered subset must be computed where the data is. | §16.4 |
| **BR-EX-03** | Exact `total` and `filtered` counts in every list response. | Drives the hi-fi footer "412 in selection / 48,213 total" and M5 capping labels. Exact is affordable at 182k, so no estimate is acceptable. | §1.2 |
| **BR-EX-04** | Series endpoint accepting `window` + optional `interval`; server selects per the §2.1 ladder; response carries the full §16.2 envelope including `interval`, `source_rows`, `returned_rows`, `downsample_method`, `coverage`. | Without a served `interval` the caption cannot state what was actually rendered, and the chart silently misrepresents its own resolution. | §16.2, §16.4 |
| **BR-EX-05** | Re-query at the next ladder rung on zoom, within the §21.4 cached-chart budget (p95 < 500 ms). | Zooming an aggregated array shows a shape the data does not have. | §21.4 |
| **BR-EX-06** | Batch endpoint for Alpha 360°'s 12 insight tiles at **preview** resolution (~600 points/tile) in one request; full ladder resolution only for an expanded tile. | 12 round-trips at 4,368 points each is 52k points and 12 requests for a screen that is mostly glanced at. | §16.4 |
| **BR-EX-07** | Correlation snapshot: pairwise values + per-pair `samples` and `coverage` + `formula_version` + **server-computed clustering order**. Cadence 1–5 min or on demand. | 1,225 pairs cannot be clustered client-side per render, and a client-chosen order would differ between users looking at the same portfolio. | §21.1, §21.3 |
| **BR-EX-08** | Ranked triage endpoint for Command Center: server ranks by severity → SLA → age, returns top-N **and** the total. | Phase 9 defines the ranking as the screen's whole point. Ranking client-side requires shipping every open item to rank ten of them, and the M5 label needs the denominator. | §21.1 |
| **BR-EX-09** | Alert grouping by (typed object, account) with occurrence counts. | Phase 7's rail renders one card per alert. Repeated findings on one account produce a wall of near-identical cards and bury the critical one. | §21.1 |
| **BR-EX-10** | One combined fleet + triage + watchlist subscription for Command Center. | §16.4 explicitly forbids per-card polling; 50 fleet cells must not be 50 streams. | §16.4 |
| **BR-EX-11** | `source_sequence` continuity guarantees, a resume token, and **documented gap semantics** on the event stream. | M3 cannot detect a gap it has no contract for, and an undetected gap turns a stale projection into rendered "live" truth — the failure the whole authority model exists to prevent. | §16.2, §21.3 |
| **BR-EX-12** | Instrument precision metadata: tick size, decimals, quote currency, per instrument. | M6 sizes numeric columns from it. Without it, columns are guessed and a VND amount beside a 8-decimal USDT amount either wraps or gets ellipsised — and ellipsising a number is forbidden. | §15.3, §16.3 |
| **BR-EX-13** | Order funnel detail (`signal → intent → risk grant → ACK → fill`, with per-hop timestamps) as a **separate per-order endpoint**, not embedded in blotter list rows. | Phase 14 expands the funnel inside the row. Embedding it makes list rows variable-height, which is what breaks virtualization; fetching on demand keeps rows uniform. | §16.4 |

Two requests are **removed** relative to the pre-figures draft, and are recorded
here so they are not re-raised: approximate counts (unnecessary at 182k) and
event batching (unnecessary at 0.7/min).

---

## 5. Per-screen refine

Screens whose cardinality is bounded by construction are marked
**BOUNDED** with the reason, and are not padded with invented analysis.

### Phase 0 — Shell & shared components
**BOUNDED.** Sidebar is registry-driven with a fixed group set; the component
fixture page renders one instance of each state. The only scale obligation is
that **every shared component is built against M1–M6 from the start** — retrofitting
virtualization or honest capping into eleven components later is the expensive path.

### Phase 1 — Approval Inbox
- **Cardinality** — hi-fi 5 pending / 4 decided. Real: pending scales with fleet (50 deployments × gates), tens at a time; decided history is unbounded and retained beyond 6 months.
- **Break point** — the pending table stays small; **Recently-decided is the unbounded one** and breaks past ~200 rows.
- **Degradation** — pending list un-virtualized (it is a work queue; if it exceeds 200 the problem is operational, not visual — surface that honestly rather than paginating it away). Recently-decided gets M1 with a default 30-day window.
- **Server contract** — BR-EX-01, BR-EX-02 (the seven filter chips), BR-EX-03.
- **Invariant** — SoD-dimmed rows (`AP-311`, "not you") are **dimmed, never filtered out**; a server-side filter must not drop them, because their visibility is the separation-of-duty proof. Overdue sort order survives paging.
- **Perf budget** — no virtualization; one snapshot + SSE for new arrivals.

### Phase 2 — Gate R1 Review
**BOUNDED.** One release candidate, one evidence pack, one checklist. Cardinality
is fixed by the artifact. Watch only: an evidence pack with many waiver/condition
rows — cap the composer list at M4's table threshold and let it scroll inside its panel.

### Phase 3 — Gate R2 Review
**BOUNDED.** One decision, one R1 reference, one capital preview. The dark
operational preview strip recomputes from a single requested amount.

### Phase 4 — Paper Workbench
- **Cardinality** — ~20 orders/day for this deployment; 30-day observation ⇒ ~600 blotter rows. Equity 1h × 30 days = 720 points. Positions: single digits.
- **Break point** — none at these numbers. The screen is comfortably inside budget.
- **Degradation** — none required. Blotter un-virtualized, capped at the observation window with "full blotter →" for the rest.
- **Server contract** — BR-EX-04 for the equity series.
- **Invariant** — the `STALE` demo state must **pause the freshness clock's meaning, not hide the panel**; the projection panel stays visible and marked stale. Gate progress (`12/30 days · 184/300 trades`) is server-computed, never derived client-side from the visible row count.
- **Perf budget** — one M3 subscription; equity redraw on bucket close, not per fill.

### Phase 5 — Paper Exit Review
**BOUNDED.** One exit request, four evidence panels, a fixed decision footer.
Evidence numbers link out rather than embedding lists.

### Phase 6 — Admin Action Drawer
**BOUNDED.** 21 commands in 6 groups, fixed by the CLI guide. The verify timeline
grows with sub-intents (single digits).
- **Invariant worth restating** — `202 — NOT success yet` is the first timeline line and `PARTIAL` never renders green, regardless of how long the verify list grows.

### Phase 7 — Operations Queue
- **Cardinality** — hi-fi 5 rows. Real: operations track mutations, not fills — tens per day, retained beyond 6 months. Alert rail: one card per alert today.
- **Break point** — "All (24h)" is bounded; unbounded history breaks past ~200. Rail breaks at ~15 cards, well before the table does.
- **Degradation** — table M1 with the 24h default preserved. Rail uses BR-EX-09 grouping: one card per (typed object, account) carrying an occurrence count.
- **Server contract** — BR-EX-01, BR-EX-02 (three chips), BR-EX-09.
- **Invariant** — grouping must not merge distinct severities into one chip; a group containing a CRITICAL renders CRITICAL. The badge still counts **CRITICAL only**. `ack ≠ resolve` survives grouping.
- **Perf budget** — one M3 subscription shared with the rail.

### Phase 8 — Incident Detail
**BOUNDED.** One incident, one finding, a forward-only state rail, a handful of
operation rows. The timeline grows with the incident's own life — M1 only if a
long-running incident exceeds 200 timeline entries, which would itself be a signal.

### Phase 9 — Command Center
- **Cardinality** — hi-fi 4 triage rows, 6 fleet cells, 5 watchlist pins. Real: triage draws from every open incident/approval/operation across 50 deployments; fleet cells count over ≤100 deployments; watchlist capped at 5 by design.
- **Break point** — the "Needs you now" panel is a **ranked view, not the whole truth**, from the first busy morning. Ranking 200 items client-side needs all 200 shipped.
- **Degradation** — server-ranked top-N (BR-EX-08), rendered with an M5 label `showing top 10 of 214` and a link to the full queue. Fleet cells are counts only (as drawn) and link to stage lists.
- **Server contract** — BR-EX-08, BR-EX-10.
- **Invariant** — triage must derive from **the same typed objects as the alert rail** (Phase 9's stated DoD); two ranking implementations would drift. The `QUIET` state means genuinely nothing open — never "nothing in the top N".
- **Perf budget** — **one** subscription (BR-EX-10). 10–25 equity cell updates/s must repaint only their own cell: memoise per cell, keyed on value not on object identity.

### Phase 10 — Sandbox Certification
**BOUNDED.** One deployment, 7 fixed certification steps, a 3-column triptych, a
findings table in single digits. The timeboxed cert run is capped at 30 minutes
by policy, which bounds its own event volume.

### Phase 11 — Canary Control Room
- **Cardinality** — one deployment, day 9/14, live blotter for the canary window (~20/day ⇒ ~280 rows), 5 KPIs, envelope compliance bars.
- **Break point** — none at these numbers.
- **Degradation** — none required.
- **Server contract** — BR-EX-04.
- **Invariant** — the **protective/scale asymmetry is the screen** (`brokerSync STALE` blocks scale-up, leaves halt/reduce/close enabled). No loading, empty or degraded state may disable a protective action — degradation must never remove the ability to stop trading.
- **Perf budget** — one M3 subscription; guard band renders from state, never from a timer.

### Phase 12 — Live Full Operations
- **Cardinality** — as Phase 11, plus open-order footer.
- **Break point** — none at these numbers.
- **Degradation** — none required.
- **Server contract** — BR-EX-04, BR-EX-11.
- **Invariant** — `brokerState MISMATCH` **replaces the broker panel and suppresses every broker-derived value on the screen**. This interacts with M3: a sequence gap on the broker stream must reach MISMATCH/STALE handling, not quietly leave last-good numbers on a live screen.
- **Perf budget** — as Phase 11.

### Phase 13 — Paper Workbench VNM
- **Cardinality** — as Phase 4, ~6/30 sessions, VND amounts (largest digit count in the system).
- **Break point** — **column width, not row count.** VND amounts beside USDT 8-decimal amounts is the widest numeric pairing in the product.
- **Degradation** — M6 sizing from BR-EX-12; the panel scrolls before any number is abbreviated.
- **Server contract** — BR-EX-12, plus venue calendar for the paused-freshness clock.
- **Invariant** — `SUSPENDED_BY_CALENDAR` is neutral gray and the banner is INFO tone; freshness **pauses** against the venue calendar rather than aging to STALE. A generic freshness implementation that ignores the calendar will render a false STALE every night — this is the screen's whole reason to exist.
- **Perf budget** — the paused clock must stop ticking, not tick and get suppressed at render.

### Phase 14 — Full Blotter
- **Cardinality** — **~182,000 rows** at full retention; 9 columns; funnel expansion per FILLED row.
- **Break point** — DOM dies around 2,000 un-virtualized rows. Separately: **inline row expansion makes row height variable, which is what breaks virtualization** — the two features in the hi-fi are in direct tension.
- **Degradation** — M1 throughout. Funnel moves to a right-hand drawer fed by BR-EX-13, keeping list rows uniform. (Alternative: variable-height virtualization with measurement — more complex, more jitter. See §7 decision 2.)
- **Server contract** — BR-EX-01, BR-EX-02, BR-EX-03, BR-EX-13.
- **Invariant** — counts stay exact on both sides of the cross-filter chip ("412 in selection" ↔ "48,213 total"). REJECTED rows keep their risk reason **inline** — the reason is why the row exists and must not be demoted into the drawer. Numerics never abbreviate (M6). The 6-month horizon is stated in the footer, so an empty older range reads as *retention*, not as *no activity*.
- **Perf budget** — 100-row pages, 2,000 resident, fixed row height, sticky header; drawer fetch on demand.

### Phase 15 — Alpha 360°
- **Cardinality** — **the heaviest screen**: 9 tables, 9 tabs, 12 insight tiles, deployment map of ≤5 venue rows for this alpha. Tiles at full resolution = 52,416 points.
- **Break point** — tiles, not tables. 12 charts at 4,368 points each will not hold an interactive frame budget; the per-tab tables are small for a single alpha.
- **Degradation** — tiles render at ~600-point preview resolution via BR-EX-06; expanding a tile fetches the full ladder rung. Orders & Fills / Sessions / Audit tabs use M1. Tab row scrolls horizontally (never the page).
- **Server contract** — BR-EX-06, BR-EX-04, BR-EX-01/02 for the tabbed tables.
- **Invariant** — a `venueScope` change must re-filter **all nine tabs and the KPIs** (Phase 15 DoD) — so scope belongs in the query, not in client-side row filtering, or tabs will silently disagree with each other. `INSUFFICIENT_DATA` stays a rendered tile state; a preview-resolution tile still carries its envelope caption.
- **Perf budget** — one batched tile request; charts in non-active tabs are not mounted; `large: true` on any series over 2,000 points.

### Phase 16 — Portfolio 360°
- **Cardinality** — hi-fi ~9 alphas (81 cells). Real: **50 alphas ⇒ 2,500 cells / 1,225 unique pairs**, each with ~4,368 hourly samples over 6 months. Capital ledger is append-only and unbounded.
- **Break point** — cell labels become unreadable around **15 alphas**; 2,500 DOM cells make hover and repaint stutter well before that matters.
- **Degradation** — M4: clustered canvas heatmap with labels on the axes only; hover by coordinate hit-test; **leader lens becomes the primary way in**, the matrix becomes context. Capital Ledger and Audit tabs use M1.
- **Server contract** — BR-EX-07 (values + per-pair samples/coverage + formula version + clustering order), BR-EX-01 for the ledger.
- **Invariant** — pairs below the sample threshold render a **visible `INSUFFICIENT_DATA` cell, not a blank**. At 50 alphas with staggered deployment dates this will be common, and the honest matrix is legitimately patchy — the hi-fi's fully-populated grid is a nine-alpha artefact, not a target. Clustering reorders display only; it never alters a value. Overview tab stays the honest APX-6 empty state.
- **Perf budget** — canvas, not 2,500 nodes; repaint ≤ 16 ms; matrix refreshes on the §21.1 1–5 min cadence, never on the interactive path.

### Phase 17 — Account/Broker 360°
- **Cardinality** — one account; 3-column triptych; linked virtual accounts (3 in cast, realistically ≤10 per physical); sync history and findings grow continuously.
- **Break point** — sync history past ~200 rows.
- **Degradation** — M1 on sync history and findings with a default window; the linked-accounts table stays whole (it is the aggregate check's evidence and must not paginate).
- **Server contract** — BR-EX-01 for history, BR-EX-12 for the amount columns.
- **Invariant** — the headroom sum (`Σ virtual 41,000 vs physical 43,120 → +2,120`) is computed **from the full linked-accounts set, never from a page**. If that table ever paginates, the aggregate silently becomes wrong while still looking authoritative — this is the screen's core safety claim.
- **Perf budget** — one M3 subscription; the `SYNC OK 0.9s` age ticks without re-rendering the triptych.

---

## 6. Deltas from the hi-fi

Where implementation must deviate from the mock, recorded so the difference
reads as a decision rather than as drift.

| # | Screen | Hi-fi shows | Implementation | Reason |
|---|---|---|---|---|
| D-1 | Portfolio 360° | labelled correlation matrix | clustered canvas heatmap, axis labels only | 2,500 cells at 50 alphas; spec §16.3 already assumes a heatmap |
| D-2 | Full Blotter | funnel expands inline in the row | funnel in a right drawer (pending §7.2) | variable row height breaks virtualization at 182k rows |
| D-3 | Alpha 360° | 12 tiles at full fidelity | preview resolution; full only on expand | 52,416 points on one screen |
| D-4 | Inbox / Queue / Blotter | filters described as filtering rows | filters are server-side query parameters | correct at 100 rows, structurally wrong at 182k |
| D-5 | Command Center | triage panel reads as the complete list | server-ranked top-N + `showing top 10 of 214` | ranking 200 items client-side ships all 200 |
| D-6 | Operations Queue | one rail card per alert | grouped by (object, account) with counts | repeated findings bury the critical card |

None of these change layout proportion, hierarchy or copy — they change what
feeds the layout. The hi-fi remains the visual truth (HANDOFF §3b).

---

## 7. Open decisions

1. **Carbon theme placement.** DS §7 replaces Operations Dark with an IBM Carbon
   identity, while D6 says tokens are extended and never forked. `CLAUDE.md` §0
   forbids touching Research screens, and 46 of 100 committed visual baselines
   are operations-theme — so restyling the shared `data-theme="operations"` is
   out. Remaining options: a separate `operations-carbon` theme scoped to
   Execution routes, or deferring Carbon. **Owner decision required before any
   shared component is built**, because it determines which tokens all eleven
   components read.

2. **Blotter funnel: drawer or variable-height virtualization?** Drawer is
   simpler, keeps rows uniform, and costs one click. Variable-height
   virtualization preserves the hi-fi exactly but needs row measurement and
   tends to jitter while streaming. Recommendation: **drawer**.

3. **Orders/fills beyond 6 months.** Is older execution history absent from
   Portal entirely, or reachable through a slower path? The blotter footer must
   say which, so an empty older range never reads as "no trading happened".

4. **Is 50 alphas per portfolio or across all portfolios?** This changes the
   correlation surface materially: 50 per portfolio keeps M4's heatmap rung;
   50 across several portfolios means each matrix is smaller and the labelled
   grid may survive. Sizing for the wrong one costs a rebuild of Phase 16.
