# 01 · QuantBT Backtest — IA & wiring (release v1.0)

> Supersedes IA_AND_WIRING_V2. Per-screen detail: 02_SCREEN_SPECS.md · binding: 03_ALPHA_RC_BINDING.md · engine surface: 04_ENGINE_ROUTE_MATRIX.md

## HI-FI contract (applied to all 14 screens, audited by script)

Fidelity target is the shipped portal, verified against `apps/portal/frontend/src/styles/tokens.css` + `shell.css` + `charts/theme.ts`:

- Typography: `--font-display` Newsreader · `--font-body` Inter · `--font-mono` JetBrains Mono — including every ECharts/lightweight-charts `fontFamily` string. Zero occurrences of the wireframe-era Space Grotesk / IBM Plex Mono remain.
- Shell metrics: sidebar `--sidebar-w` 248px, topbar 56px, content gutter 32px, `--content-max` 1440px (exception: 06 Search keeps 1560px — the three-column Stage A | freeze | Stage B grid is the one deliberate horizontal-scroll screen). 00 Journey Map (pan-zoom canvas) and 09 Run Report (printable artifact) intentionally carry no shell.
- Interaction: 120ms `cubic-bezier(.2,0,.2,1)` transitions on controls; focus ring `0 0 0 2px paper, 0 0 0 4px accent` (`--focus-ring`).
- Palette was already token-true (Fund Paper) and did not change.
- Every screen root carries `data-screen-label` for review-comment anchoring.

## Audit status at packaging (scripted, objective)

- 14 screens, 0 broken cross-links; deep-dive chain has next-stage nav S1→S2→S3→S4→Run Report; screen map below matches files on disk.
- Engine release consistent everywhere: er_quantbt_1_1_1 / quantbt-engine==1.1.1 on 02/04/09/11/12.
- Evidence-cursor hash contract (`#fold=&trial=&params=`): read+write on 04/05/06/07/08; 12 Atlas emits deep links (`#mode=&schedule=`) into 06; other screens don't participate by design.
- Canonical fold digests (prm_9d44f2 · 3b81c7 · 7c1a9e · c25a1d · 66e09b) verified on 03/04/05/07/08/09.
- Chart CDNs pinned consistently: echarts@5.5.0, lightweight-charts@5.
- Scale demos (5 ↔ 32 folds) verified on 03/05/06/08/13; synthetic scale data never enters the canonical cursor.

- Supersedes: BACKTEST_IA_AND_FLOW.md, QUANTBT_SCREEN_WIRING.md (v1 wireframes in `baseline/`)
- Theme: Research Light (portal tokens verbatim) · fonts Newsreader / Inter / JetBrains Mono · title 22px/300 · card radius 8px · gutters 16/24
- Every screen wears the shipped portal shell (topbar + sidebar registry). All screens are `.dc.html`, numbered in reading order.

## Flow order (files)

| # | File | Role | Replaces / deepens (shipped hi-fi) |
|---|------|------|------------------------------------|
| 00 | QuantBT 00 Journey Map | reading map, links every screen both ways | index.html contact sheet |
| 01 | QuantBT 01 Run Library | entry point; evidence trail chips S1–S5, cert + claim on card face; RUNNING cards open Run Progress | 04-run-library |
| 02 | QuantBT 02 New Run Preflight | 8 steps: Context (alpha·av_ binding or scratch=NOT_PUBLISHABLE, strategy pinned by av_) → Strategy → Route (14-route grid, per-route params) → Data → Walk-forward (fold-plan preview) → Parameters (sweep/pin per param, swept-dims ceiling 8) → Optimization → Review + preflight | 05-new-run |
| 03 | QuantBT 03 Run Progress | live run: stage stepper, tqdm-grade progress + ETA, fold Gantt, dark console, artifacts appearing; claim passport in FORECAST state flips to ISSUED at completion and hands its cursor to Evidence Flow | 06-run-progress |
| 04 | QuantBT 04 Evidence Flow | run hub: claim bar (mode × schedule), evidence cursor (fold · trial · params · seq), 7 stages, summary analytics | 07-run-overview |
| 05 | QuantBT 05 S1 Split | fold anatomy, nested inner folds, holdout seal (cap ≤ B), θ* per fold | — (no shipped tab) |
| 06 | QuantBT 06 S2 Search and Selection | search cinema, freeze line (Stage A IS-only / Stage B frozen pool), J₁…J₅ formulas, best ≠ selected, θ* journey, A6 interactions | 08-run-optimization |
| 07 | QuantBT 07 S3 Freeze | data-time vs wall-clock ordering verdict, digest chain, drift → BLOCKED, what-if = sibling attempt | 09-run-parameters |
| 08 | QuantBT 08 S4 Execute Replay | event-level replay transport, trade tape, causal chain per fill, route-honest not_applicable, MAE×MFE | 10-run-execution |
| 09 | QuantBT 09 Run Report | one-sheet printable evidence artifact (doc-page): claim passport verbatim, identity + digests, equity/underwater, per-fold verdict, cert chain, promotion state | — |
| 10 | QuantBT 10 Attempt Lineage | attempt tree (engine-recorded): parent links, config-key diffs vs parent, ACTIVE/SUPERSEDED/ABANDONED/DRAFT states, promotion rule + multiple-testing disclosure | — |
| 11 | QuantBT 11 Release Candidate and Publish | lineage rail alpha→av_→run→prm_→rc_, change-taxonomy verdict, 12-item R1 evidence pack (each row links its proving screen), YAML record preview, publish → immutable rc_ + approval-inbox mirror (read-model) | 11-run-audit |
| 12 | QuantBT 12 Mode Atlas (Engine Atlas) | 3 tabs: WFO modes (KaTeX objectives, term tables, SUSPECT signatures) · 14 execution routes (support matrix) · claims by contract (engine cert L0–L4 ⊥ methodology A–D) | — |
| 13 | QuantBT 13 Compare | three modes, three rules: (1) attempts of one alpha — claim ladder, per-fold bars per attempt, config diff, claims rank before numbers; (2) one alpha × markets — small multiples, overlay refused across keys; (3) two alphas one key — overlay + deltas + engine-published OOS-return correlation (the second-slot question) | — |

## Wiring invariants

- The evidence cursor crosses FILES via the URL hash (`#stage=&fold=&trial=&params=&schedule=&route=`): the hub writes it on every change, deep-dive links carry it out, breadcrumbs carry it back, and each screen reads it on entry. Landing on fold 2 in Execute and returning to the hub keeps you on fold 2.

- Run Progress is the same surface as Evidence Flow in time: forecast claims (dashed) while RUNNING, issued claims (solid) at COMPLETED, one button into the evidence with the watched cursor. SSE accelerates; polling floor stays underneath.

- Evidence cursor travels across stages and into deep links (`portal://…&fold=&trial=&params=&event_seq=`); switching stages never resets it.
- Claim bar values come from engine tables (mode × schedule); the UI renders, never infers. Schedule switch demoes STRICT_OUTER_OOS ↔ SELECTION_ADJUSTED_OOS with cert B ↔ C.
- Cert = min of stage caps; binding cap links to the stage that set it.
- Route-aware rendering: close_target_v2 shows not_applicable for orders/fills (honesty, not absence); intrabar/lifecycle are previews on sample tapes.
- Holdout: LOCKED only this round (unlock = attempt att_06 pattern, audited one-time read, B→A).
- Promotion: the promotable unit is rc_ (screen 11), never a bare run_id; publish is the only verb; approval decisions live on the Execution side and are mirrored read-only. Journey Map P8 marks the handoff swimlane (Inbox → R1 → R2 → Paper).
- Alpha scoping: 01 filters/groups by alpha·av_; 10 roots the attempt tree in the version ledger with PROMOTION PICK; scratch runs are first-class but NOT_PUBLISHABLE.
- What-if (Freeze) and methodology changes create sibling attempts with new config_hash; nothing writes onto frozen artifacts.
- Compare refuses mismatched ComparisonContractKeys; the weaker claim gates promotion of a pair.
- Dataset identity drawer (hub passport chip): digest pinned at submit, coverage bar (IS/OOS/holdout windows + patched bars), reads the run's manifest — Data Catalog module stays SOON.
- Fold digests are canonical everywhere a real run is shown: prm_9d44f2 · 3b81c7 · 7c1a9e · c25a1d · 66e09b (fold_01…05). Any screen minting a different digest for these folds is a bug.

## Scale readiness (2020→2026, 20–40 WFO folds, ~1000 trades)

Every per-fold surface carries a "scale demo" toggle (5 ↔ 32 folds) so reviewers can see the at-scale rendering without a real long run. Synthetic scale data NEVER writes into the canonical cursor/hash — hand-offs drop fold/trial/params when the scale demo is active.

- 02 New Run: fold plan preview — `frequency × (splitMode → dataEnd) ⇒ ≈ N folds`, mini-strip (train/OOS per fold), amber warning > 20 folds (trial budget), red < 2 (degenerate); repeated on the review rail.
- 03 Run Progress: compact fold strip (one cell per fold, fill = trial progress, click to inspect); detail rows + stage log window to running fold ± neighbours; console collapses earlier folds to one line; canonical digests (prm_9d44f2…66e09b) used verbatim at N = 5.
- 05 Split: 32-row slim gantt (7px tracks, k-th labels, 2020→2026 axis) for rolling/expanding.
- 06 Search: B4 θ* journey switches dots → density strip (darker bin = more folds froze θ* there; amber line = current fold); two dark bands read as regime migration, not noise.
- 08 Execute: fold navigator (prev/select/next), 32-segment filmstrip, blotter filters (side/win-loss) + sorts (time/worst pnl/deepest MAE) + pagination, MAE×MFE on ECharts, marker LOD ±80 bars past 160 events, tape ticks auto-hide.
- 04 Hub: per-fold verdict header counts DRAG/WARN/PASS + "worst first" sort; equity markLines thin to ≤ 8.
- 13 Compare: per-fold chart flips grouped bars → one line per attempt past 8 folds (ACTIVE heavier).

## Known engine/portal gaps surfaced in UI (deliberate)

- fees/funding/margin series: absent (portal endpoint gap, stated in manifest + Execute cost panel)
- SelectionTraceV1 fields missing ⇒ Search panels render degraded, never computed frontend-side
- bundle_frozen_at / outer_oos_first_read_at / runtime_bundle_digest owed by engine for Freeze verdicts
