# 02 · Screen specs — one block per screen

Format: **Purpose · Data (engine truth consumed) · States · Interactions · Links out · Acceptance.**
Global: every screen wears the portal shell (topbar 56px + sidebar 248px) except 00 (canvas map) and 09 (printable sheet). Every id (run, av_, prm_, rc_, claim_) is a navigable chip. UI renders engine values, never recomputes. Viewport ≥ 660px content column must not overflow horizontally (fluid wrappers, `overflow-x:auto` on wide tables).

## 00 Journey Map
- Purpose: reading map — 8 phases P1…P8, shipped vs redesign vs execution-side cards, tab-mapping table.
- Data: static registry of files.
- Interactions: every card is a link; P8 cards (Approval Inbox → R1 → R2 → Paper) marked `execution`.
- Acceptance: 0 broken links; each redesign card names what it adds.

## 01 Run Library — entry point
- Purpose: pick a run by evidence, not by Sharpe.
- Data: runs list — status, mode×schedule, `alphaName·av`, rc {id,state}, cert, claim string, stage trail S1–S5, per-run stats.
- States: RUNNING (opens 03), COMPLETED, FAILED (failure reason on face), superseded attempt strip; scratch runs = dashed NOT_PUBLISHABLE chip.
- Interactions: text filter (matches run/alpha/av/rc), status + mode + alpha chips, **group by alpha·av** (section headers), counter `N of M runs`; compare select (max 2) guarded by ComparisonContractKey — refuses mismatched keys with the reason.
- Links: card → 04 (hash cursor), RUNNING → 03, rc chip → 11, new run → 02.
- Acceptance: claim/cert come only from Stage 5 output; library ranks nothing.

## 02 New Run — context · route · preflight
- Purpose: declare everything the engine will pin; forecast the claim before compute.
- Data: alpha registry (versions, import state U14, entrypoint, digests, last rc), route support matrix, strategy declarations (timeframes, warmup, seed_required, cols), parameter space, engine release ceilings.
- Steps: Context → Strategy → Route → Data → Walk-forward → Parameters → Optimization → Review.
- Context: alpha + av_ picker (immutable after submit) or **scratch** ⇒ NOT_PUBLISHABLE banner + chip by the title; bound ⇒ strategy pinned by av_ entrypoint (other cards PINNED OUT).
- Route: 14 cards (see 04_ENGINE_ROUTE_MATRIX); disabled-with-reason; per-route param forms for intrabar (level_mode, same_bar_policy, tick), portfolio (mode × sizing), reactive (runtime R0–R3B, audit_mode), dca (base/safety/step_scale); tape routes collapse Methodology to the tape span.
- Parameters: per-param **sweep | pin** toggle — pin = fixed value, out of sweep dims; ceiling counts SWEPT dims (≤ 8), pinned frees room; categorical pinnable; violations block.
- Walk-forward: fold-plan preview `frequency × (splitMode → dataEnd)` ⇒ ≈N folds strip + trials budget note; N<2 red, N>20 amber.
- Review rail: alpha binding row, route → contract, fold plan, `entries · swept · pinned`, mode×schedule (claim forecast, cert ceiling), account/fees. Preflight names the failing gate; run creates R-WFO-119 → 03.
- Acceptance: nothing outside the declared space is submittable; claim forecast visible before any compute.

## 03 Run Progress
- Purpose: watch a run without lying about what exists yet.
- Data: SSE stage stepper (poll floor), per-fold Gantt (compact ≥20 folds), trial console, artifacts appearing, RuntimeBudget bar + fail-closed error codes.
- States: RUNNING (claim passport FORECAST, dashed) → COMPLETED (ISSUED, solid, cursor handoff button) / FAILED (engine reason verbatim).
- Links: stage rail → 05/06/07/08 with `#fold=`; done → 04.
- Acceptance: forecast vs issued visually distinct; no claim string before Stage 5.

## 04 Evidence Flow — run hub
- Purpose: one hub, one cursor, seven stages: Summary · Split · Search · Freeze · Execute · Claim · Atlas.
- Data: claim strip (validation/chronological/oos_used/holdout SEALED/causality/**execution_contract**/**runtime authority** resolved+reason/cert=min-of-caps), run header (alpha·av chip, dataset drawer, route, engine er_quantbt_1_1_1), summary analytics (equity+underwater, rolling Sharpe/beta, monthly heat, behavior tiles), per-fold verdict table (OOS bar, decay, trades, dd, contrib, worst moment, PASS/WARN/DRAG + sort worst-first), fold selector chip (‹ dropdown ›).
- Cursor: `#stage=&fold=&trial=&params=&schedule=&route=` read+write; all deep-dive links carry it; breadcrumbs carry it back.
- Links: S2→06, S3→07, S4→08, S5 panel → 09 (generate report) + 11 (release candidate), Atlas→12.
- Acceptance: engine release identical on 04/09/11; verdict rows all clickable into stage screens at the right fold.

## 05 S1 Split
- Purpose: fold anatomy — how the data was cut before anything was searched.
- Data: fold table (train/test spans, purge 24h, embargo 72h, θ* digest per fold), nested inner folds diagram, holdout seal (cap ≤ B binding), gap scan.
- Scale: 5 ↔ 32-fold demo; compact gantt at N≥20.
- Links: crumb → 04; next: S2 →; per-fold → 06 `#fold=`.

## 06 S2 Search & Selection
- Purpose: the search and the selection, separated by the freeze line.
- Data: Stage A (IS only): A1 declared space + θ* position (edge flags), A2 trial surface (x/y axis pickers, click → lineage), A3 progression + concentration + pruned rail, A4 per-param sampled regions, A5 Spearman importance (labeled proxy, not fANOVA); freeze line (K = ⌈n·fraction⌉, arrow per schedule: sealed / ◀OOS / retro / ×); Stage B: pool funnel, **J-formula panel in KaTeX** + per-term table + values, mode-specific evidence (decay bars+scatter / bootstrap hist / cluster table / shard heatmap / full-sample banner), best ≠ selected cards, θ* journey + seed consensus, trial ledger (4-state OOS column, PRUNED=duplicate tooltips).
- Modes: one run = one mode; switcher opens demo runs; invalid schedules struck through with reason.
- Links: crumb → 04 · next: S3 →; ledger/surface click sync; evidence-link copy.
- Acceptance: no OOS label under IS-only objectives; formulas match 04_ENGINE_ROUTE_MATRIX §3.

## 07 S3 Freeze
- Purpose: prove ordering and integrity of the frozen selection.
- Data: two-axis timeline (wall clock vs data time) → ordering verdict; digest chain (config → params → bundle) with drift ⇒ BLOCKED; frozen θ* table; fold navigator (‹ select ›, shared/full chips for global/mode-5).
- What-if: sliders preview J impact, **creates a sibling attempt** — never writes onto frozen params.
- Links: crumb → 04 · next: S4 →; attempt → 10.

## 08 S4 Execute Replay
- Purpose: replay execution bar-by-bar with route-honest artifacts.
- Data: candle replay (lightweight-charts) + markers, stitched-account fold strip (param handoff ⇄), transport (play/speed/seek/cross-fold), event ledger, trade blotter (filters/sort/pager), causal chain per selection, MAE×MFE scatter (per-axis rounded max, diagonal to min), exit-leg labels, verdict tiles (manager persona), audit persona.
- Routes: close_target_v2 (contract; orders/fills **not_applicable**), intrabar_bracket_v1 (SL/TP price lines, ⚠ ambiguous-bar flag + same_bar_policy), event_lifecycle_v2 (OCO chain), **reactive_r2** (wake-trace strip: price/timer/order-event ticks, N of M bars, audit_mode note), **dca_ladder** (rung-by-rung basket chain).
- Validation (tweak): nautilus parity card — equity Δ, fills matched, funding Δ, PARITY PASS ⇒ engine cert L4.
- Links: crumb → 04 · next: Run Report →; fold navigator syncs hash.
- Acceptance: artifacts that don't exist on a route are declared not_applicable, never rendered empty.

## 09 Run Report — one sheet
- Purpose: printable evidence artifact to attach to the approval.
- Data: claim passport verbatim, identity block (**alpha · av_ · import state · PUBLISHABLE**, strategy pinned-by, dataset digest, protocol, route → contract, **runtime authority + engine release**, seed, config, bundle), headline metrics (OOS only, holdout absent by design), equity/underwater, per-fold verdict, stage checks, key artifacts + digests, promotion state, report provenance.
- Print: doc-page; screen chrome (`.no-print` bar) does not print.
- Links: crumb → 04 · Release Candidate & Publish.

## 10 Attempt Lineage
- Purpose: the idea's honest history at 50–100-attempt scale.
- Data: **version ledger root card** — per av_ band: chip+state, digest, entrypoint, outcome, clickable attempt chips (● = has rc), exercised (route · modes×schedules · param ranges), untried routes → 02; **PROMOTION PICK** banner (single promotable attempt → rc draft → R1). Tree: 6 storied attempts (full cards: spec line `route · mode×schedule · space (Np · swept/pinned)`, gold diff-vs-parent, av chip, rc chip) + **46 probe attempts** as one-line compact rows, hidden behind toggle; status filter + `showing N of M`.
- Rules: attempts immutable; code change = new av_ ⇒ gates reset (shown as diff row); abandoning is a state; attempt count disclosed as multiple-testing info.
- Links: root → 01/02/11; per-attempt → 04/09.

## 11 Release Candidate & Publish
- Purpose: compose, pin, publish the ONLY promotable unit.
- Blocks: (1) identity & lineage rail alpha→av_→run/att→prm_→rc_ + change-taxonomy table vs last rc + gate verdict; (2) **evidence pack** — 12 R1 items, status COMPLETE/DEGRADED/INPUT/MISSING, digest, source link to the proving screen (04/05/06/07/08/09), DEGRADED travels, MISSING blocks; chip pair `claim ceiling` ⊥ `engine cert`; (3) YAML record preview (17 pinned fields, copyable) + Publish (rc_ immutable, no approval implied) + **approval-inbox mirror** (ghost until published; then PENDING · SLA · 6 outcomes, read-model only).
- Scratch run: NOT_PUBLISHABLE banner; publish disabled with reason.
- Tweaks: demoState draft/published, binding bound/unbound.

## 12 Engine Atlas
- Purpose: reference, not a stage — three tabs.
- Tab modes: 5 WFO mode cards — data-usage animation, **KaTeX objective**, per-term table, SUSPECT line (failure signature), artifacts line, schedule→claim chips, when-to-reach table, rule one/two.
- Tab routes: 14 routes × family/contract/backend/report levels/status (+refusal reason), links declare→02 / replay→08.
- Tab claims: 7 contracts × engine cert L1–L4 × numeric guarantee × **never claims**; footer `cert = min(engine cert, methodology cap, artifact completeness)`.

## 13 Compare — within one alpha
- Purpose: methodology trajectory, not a leaderboard.
- Modes: attempts of one alpha (claim ladder — claims rank before numbers), one alpha × markets (small multiples, no overlay across keys), two runs one key (overlay + deltas + engine-published correlation).
- Guard: ComparisonContractKey (symbol·tf·route·protocol); mismatch refuses with reason; weaker claim gates the pair.
- Links: ← 01, tree → 10, release candidate → 11.

## 14 Alpha Import (U14)
- Purpose: standardize an alpha code artifact into an immutable av_ — manifest mirror of DELTA_RSI_SPECIFICATION, 6-gate fail-closed quarantine, registry DRAFT→ACTIVE.
- Steps: Manifest & package → Quarantine pipeline → Register av_ (links: New Run context, Lineage, Library).
- Acceptance: digest verify first; declared endpoints capability-gated (GATED, not enabled); browser never executes code; every import = new av_.
- Detail: docs/screens/14_alpha_import.md.
