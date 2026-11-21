# Hard-coded prose trim — Research screens (2026-09-30)

Read-only audit of `apps/portal/frontend/src/research` at `6ac69315`, against live https://research-portal.primusspark.com (1440 px, full-page screenshots in this folder), run R-WFO-017 `rrun_17f762128acf8c998ac7cc44d13f663f`. S13 was opened at `/alphas/delta-rsi-polynomial-alpha/compare`.

**Method.** For each screen I pulled every visible DOM text node of 8+ words (`checkVisibility`, so sr-only/hidden text is excluded), traced each one to source with a 4-word window grep, and dropped the ones that are **server data** (claim sentences, engine descriptor text in Atlas, report scope notes, trajectory text, reason sentences from the API). Those aren't hard-coded, so they aren't counted. Section titles with a long `— explanatory tail` are included even when they're under 8 words, because they're the same pattern. Word counts are for visible words only. After = 0 for REMOVE and MOVE-TO-TOOLTIP, the short version's length for SHORTEN, and unchanged for KEEP.

**Guard rails kept.** No typed-absence reason is removed; where one is long it's SHORTENED to `<thing> — not published` plus its reason-code chip. Scope/window/unit labels (`headline = OOS only`, `2 folds · retained source`, fee rate, legends, axis labels) stay.

**HiFi column.** Many of these sentences are verbatim HiFi (subtitles, `rules of this screen`). Bobby's 2026-09-30 direction overrides them, so each one quoted there is a **recorded HiFi deviation** (DQ-02 “HiFi wins on copy” gets reversed for prose). Tests pin several of these constants verbatim (`runLibrary.rf06`, `splitDetail`, `searchDetail`, `freezeDetail`, `executeReplay`, `compareDetail` tests + `e2e/research-foundation/atlas.json`), so the change needs test edits, and the visual baselines will shift.

## Totals

| Screen | hard-coded prose words before | after | cut | screenshot |
|---|---:|---:|---:|---|
| S01 Run Library | 115 | 18 | 84% | `S01_library.png` |
| S03 Run Progress | 149 | 16 | 89% | `S03_progress.png` |
| S04 Evidence Flow · Summary | 397 | 46 | 88% | `S04_summary.png` |
| S04 · #stage=split (tab-only items; + S05 shared block) | 304 | 60 | 80% | `S04_split.png` |
| S04 · #stage=search (tab-only; + S06 shared block) | 605 | 175 | 71% | `S04_search.png` |
| S04 · #stage=freeze (tab-only; + S07 shared block) | 448 | 101 | 77% | `S04_freeze.png` |
| S04 · #stage=execute (tab-only; + S08 shared block) | 432 | 148 | 65% | `S04_execute.png` |
| S04 · #stage=claim | 170 | 28 | 83% | `S04_claim.png` |
| S04 · #stage=atlas | 157 | 24 | 84% | `S04_atlas.png` |
| S05 Split | 300 | 56 | 81% | `S05_split.png` |
| S06 Search | 611 | 167 | 72% | `S06_search.png` |
| S07 Freeze | 450 | 94 | 79% | `S07_freeze.png` |
| S08 Execute | 441 | 147 | 66% | `S08_execute.png` |
| S09 Report | 290 | 58 | 80% | `S09_report.png` |
| S12 Atlas | 139 | 16 | 88% | `S12_atlas.png` |
| S13 Compare | 508 | 56 | 88% | `S13_compare.png` |
| **All screens (as a reader sees them; shared components counted per screen)** | **5516** | **1210** | **78%** | |
| **Unique hard-coded strings (each source string once)** | **3648** | **703** | | |

S04 stage tabs render the same components as S05–S08 (`SplitDetail`, `SearchDetail`, `FreezeDetail`, `ExecuteCandleReplay`), so the S04 tab totals include those shared blocks plus the claim-strip note (13→4). Fixing a shared component fixes both places.

## Biggest offenders (one edit, largest cut)

1. **−210 words** · S13 Compare · `CompareDetail.tsx:106` · claim-family gloss — printed on EVERY ladder card (15×14 words) → **MOVE-TO-TOOLTIP**
1. **−88 words** · S04 Evidence Flow · Summary · `EvidenceFlow.tsx:2524-2530` · per-fold verdict footer → **SHORTEN**
1. **−79 words** · S07 Freeze · `FreezeDetail.tsx:90 (render :1887)` · "rules of this screen" footer → **REMOVE**
1. **−79 words** · S13 Compare · `CompareDetail.tsx:207 (render :942)` · "rules of this screen" footer → **REMOVE**
1. **−64 words** · S01 Run Library · `RunLibrary.tsx:74 (render :2330)` · "rules of this screen" footer → **REMOVE**
1. **−60 words** · S13 Compare · `CompareDetail.tsx:160` · "rule of this mode" callout → **REMOVE**
1. **−53 words** · S05 Split · `SplitDetail.tsx:99 (render :1990)` · "rules of this screen" footer → **REMOVE**
1. **−50 words** · S06 Search · `SearchSurface.tsx:529` · B4 θ* journey caption → **SHORTEN**
1. **−48 words** · S04 · #stage=atlas · `EngineAtlas.tsx:1028-1030` · "rules of this screen" footer → **REMOVE**
1. **−45 words** · S08 Execute · `ExecuteDetail.tsx:78 (render :1648)` · "rules of this screen" footer → **REMOVE**
1. **−43 words** · S04 Evidence Flow · Summary · `EvidenceFlow.tsx:105 (render :3462)` · page footer under charts → **REMOVE**
1. **−41 words** · S06 Search · `SearchDetail.tsx:1141` · B3 best-trial caption → **SHORTEN**
1. **−39 words** · S05 Split · `retainedLane.ts:141` · protocol strip — long sentence under the fields → **SHORTEN**
1. **−38 words** · S04 Evidence Flow · Summary · `EvidenceFlow.tsx:1934-1938` · EChart 3 behavior — caption → **REMOVE**
1. **−36 words** · S06 Search · `SearchDetail.tsx:92` · header subtitle → **REMOVE**

The pattern is consistent. The **`rules of this screen` footers** (8 screens, 22–79 words each) and the **"the UI computes nothing / renders, never infers" captions under the Evidence Flow charts** make up about a third of all hard-coded prose, and a reader loses nothing when they're removed. The Compare ladder repeats a 14-word claim-family gloss on **every card** (210 words on this alpha). That's the single largest block, and the chip already has a `title` attr to take it.

## S01 Run Library

Screenshot: `S01_library.png` · listed items 115 → 18 words

| file:line | block | text (≤120 chars) | words before→after | HiFi equivalent at that spot | recommendation |
|---|---|---|---:|---|---|
| `RunLibrary.tsx:70` | header subtitle | Every run wears its claim, its certification, and its evidence trail on the outside. No number without the conditions… | 23→0 | HiFi 01: “…try point Every run wears its claim, its certification, and its evidence trail on the outside. No number witho…” | **REMOVE** — title already names the screen |
| `RunLibrary.tsx:74 (render :2330)` | "rules of this screen" footer | Certification and claim strings come from each run's Stage 5 — the library renders them, it ranks nothing. Compare on… | 64→0 | HiFi 01: “…is screen Certification and claim strings come from each run's Stage 5 — the library renders them, it ranks no…” | **REMOVE** — move the ComparisonContractKey rule to the disabled Compare button's title attr |
| `RunProgress.tsx:1496 (NOT_ISSUED fallback)` | card claim quote (failed runs) | NOT ISSUED — The run failed before Stage 5 issued a claim. | 12→12 | HiFi 01: “…o claim — the run failed before Stage 5; failure detail lives in the run console", seed: 17, alphaName: "alpha…” | **KEEP** — typed absence of the claim |
| `RunLibrary.tsx:78` | card claim quote (no-claim runs) | no claim — the run failed before Stage 5; failure detail lives in the run console | 16→6 | HiFi 01: “…, claim: "no claim — the run failed before Stage 5; failure detail lives in the run console", seed: 17, alphaN…” | **SHORTEN** — no claim — failed before Stage 5 |

## S03 Run Progress

Screenshot: `S03_progress.png` · listed items 149 → 16 words

| file:line | block | text (≤120 chars) | words before→after | HiFi equivalent at that spot | recommendation |
|---|---|---|---:|---|---|
| `RunProgress.tsx:63` | header subtitle | The same screen becomes the evidence: claims sit in forecast state while the engine works, and flip to issued the mom… | 28→0 | HiFi 03: “…eTitle }} The same screen becomes the evidence: claims sit in forecast state while the engine works, and flip…” | **REMOVE** |
| `RunProgress.tsx:2134` | fold gantt panel title | fold gantt — the evidence cursor follows the fold you pick | 11→2 | HiFi 03: “…— live · the evidence cursor follows the running fold {{ foldPlanNote }} compact plan — one cell per fold · f…” | **SHORTEN** — fold gantt |
| `RunProgress.tsx:960` | evidence-cursor caption under gantt | handed to Evidence Flow at completion — you land on the same fold you watched | 15→0 | HiFi 03: “…params }} handed to Evidence Flow at completion — you land on the same fold you watched artifacts — appearing…” | **MOVE-TO-TOOLTIP** — title attr on the EVIDENCE CURSOR label |
| `RunProgress.tsx:2162` | artifacts panel title | artifacts — appearing as they are built | 6→1 | HiFi 03: “…u watched artifacts — appearing as they are built manifest preview {{ a.name }} {{ a.state }} {{ a.note }} Eac…” | **SHORTEN** — artifacts |
| `RunProgress.tsx:86` | artifacts panel note | Sealed means the bytes are ready — reading them is a separate, authorized route this release does not publish. | 19→4 | no | **SHORTEN** — reader route — not published |
| `artifacts.ts:86` | retained-table card | The server has not published an export action for this artifact. | 11→3 | no | **SHORTEN** — export — not published |
| `RunProgress.tsx:2198` | console tab strip | terminal surface keeps its own palette in both themes | 9→0 | HiFi 03: “…"live" ? "terminal surface keeps its own palette in both themes (§15.7)" : "structured ledger — replay of stat…” | **REMOVE** — design note, not reader info |
| `RunProgress.tsx:1549` | run-complete banner | No claim was issued for this run. Continue into the evidence with the cursor you watched: | 16→6 | HiFi 03: “…ritative. Continue into the evidence with the cursor you watched: S1 split S2 search S3 freeze S4 replay S5 cl…” | **SHORTEN** — No claim issued · open evidence at: |
| `RunProgress.tsx:82 (render :1869)` | "rules of this screen" footer | SSE accelerates, polling underneath never stops — the screen degrades in speed, not in truth. Claims stay in forecast… | 34→0 | HiFi 03: “…is screen SSE accelerates, polling underneath never stops — the screen degrades in speed, not in truth. Claims…” | **REMOVE** |

## S04 Evidence Flow · Summary

Screenshot: `S04_summary.png` · listed items 397 → 46 words

| file:line | block | text (≤120 chars) | words before→after | HiFi equivalent at that spot | recommendation |
|---|---|---|---:|---|---|
| `EvidenceFlow.tsx:557-560` | claim strip, right note (every tab) | Claims issued by quantbt-engine 1.1.1. The UI renders them — it never infers. | 13→4 | HiFi 04: “…rtNote }} Claims issued by quantbt-engine 1.1.1 from mode × schedule. The UI renders them — it never infers. {…” | **SHORTEN** — issued by quantbt-engine 1.1.1 |
| `EvidenceFlow.tsx:95` | window disclosure next to IS/OOS tabs (Summary + Claim) | headline = OOS only — IS and holdout never enter the headline row. | 13→4 | no | **SHORTEN** — headline = OOS only |
| `EvidenceFlow.tsx:2988/2997/3013` | 3 KPI tile captions | mean of fold OOS Sharpe · QuantBT fold score / mean of fold decay · QuantBT fold score / sum of published per-fold OO… | 27→12 | no | **SHORTEN** — oos mean of folds · oos mean of folds · oos sum of folds (Report's wording) |
| `EvidenceFlow.tsx:2625` | EChart 1 equity — absence line | No IS equity series is drawn: The retained walk-forward lane holds one stitched account and no in-sample equity, so t… | 28→6 | no | **SHORTEN** — IS equity — not published · <reason_code chip> |
| `EvidenceFlow.tsx:2652` | EChart 2 underwater — caption | Drawdown is a restatement of the equity series above, not a separate metric the engine computes. | 16→0 | HiFi 04: “…down is a restatement of the equity series above, not a separate metric the engine computes. The marked trough…” | **REMOVE** — chart title already says "drawdown derived from equity" |
| `EvidenceFlow.tsx:2655` | EChart 2 underwater — caption | Dashed lines mark where each fold's test window starts, from the retained fold plan. | 14→4 | no | **SHORTEN** — legend: ┆ fold test start |
| `EvidenceFlow.tsx:2329` | per-fold verdict title | per-fold verdict — which fold carries the run, which fold drags it | 12→2 | HiFi 04: “…efers to. per-fold verdict — which fold carries the run, which fold drags it {{ verdictSummary }} {{ vo.label…” | **SHORTEN** — per-fold verdict |
| `EvidenceFlow.tsx:2370` | per-fold verdict sub-caption | research.fold-verdict.v1 · click a row to move the cursor | 9→1 | HiFi 04: “…· click a row to move the cursor fold OOS sharpe Δ decay trades max dd contribution worst moment verdict open…” | **SHORTEN** — research.fold-verdict.v1 (hint → row title) |
| `EvidenceFlow.tsx:2524-2530` | per-fold verdict footer | fold_01, fold_02 drag — decay is a cause, so open search to see how the parameters were picked. S_OOS, decay and trad… | 94→6 | HiFi 04: “…ow \u2014 open search to see the funnel that picked prm_3b81c7, or replay to watch the \u22124.8% bar. fold_05…” | **SHORTEN** — fold_01, fold_02 drag · rule v1 ⓘ (thresholds in the ⓘ tooltip) |
| `EvidenceFlow.tsx:1934-1938` | EChart 3 behavior — caption | The retained walk-forward lane publishes neither series, so neither is drawn; the UI computes nothing. A Sharpe that … | 38→0 | HiFi 04: “…d series; the UI computes nothing. A Sharpe that only lives in one regime, or a beta drifting toward 1, is a b…” | **REMOVE** — each half already carries its own not-published + reason |
| `EvidenceFlow.tsx:3406` | EChart 4 return distribution — footnote | Bucket edges and counts as the retained lane published them — the UI bins nothing. | 15→0 | no | **REMOVE** — source chip FULL_RETURN_HISTOGRAM_V2 already in header |
| `EvidenceFlow.tsx:3427` | monthly returns — footnote | One cell per calendar month, value in %. Depth of tint = magnitude; the reading to look for is clustering — three red… | 32→6 | HiFi 04: “….label }} One cell per calendar month, value in %. Depth of tint = magnitude; the reading to look for is clust…” | **SHORTEN** — monthly return, % · tint = magnitude |
| `EvidenceFlow.tsx:3173` | behavior tiles title | behavior — engine-published, UI renders | 5→1 | HiFi 04: “…ot noise. behavior — engine-published, UI renders segment oos {{ bt.k }} {{ bt.v }} {{ bt.sub }} Stage 1 · Spl…” | **SHORTEN** — behavior |
| `EvidenceFlow.tsx:3200-3206` | behavior tiles footnote | The retained walk-forward lane publishes no behaviour analytic, and no benchmark for the two benchmark tiles. The UI … | 25→0 | HiFi 04: “…d series; the UI computes nothing. A Sharpe that only lives in one regime, or a beta drifting toward 1, is a b…” | **REMOVE** — every tile already reads "not published"; scope chip says "retained walk-forward lane" |
| `EvidenceFlow.tsx:3450` | EChart 5 rolling return — footnote | Read from the retained lane's published rolling series — the UI computes nothing. | 13→0 | HiFi 04: “…published series; the UI computes nothing. A Sharpe that only lives in one regime, or a beta drifting toward 1…” | **REMOVE** |
| `EvidenceFlow.tsx:105 (render :3462)` | page footer under charts | a chart is a bounded view of the source series; sampling changes the picture, never a metric above it. The retained e… | 43→0 | no | **REMOVE** — each chart header already prints "N points from M source observations · <sampling>" |

## S04 · #stage=split (tab-only items; + S05 shared block)

Screenshot: `S04_split.png` · listed items 17 → 0 words

| file:line | block | text (≤120 chars) | words before→after | HiFi equivalent at that spot | recommendation |
|---|---|---|---:|---|---|
| `EvidenceFlow.tsx:151` | Split tab — TabHeading subtitle | How time was divided before anything was searched. If this is wrong, every later stage is wrong. | 17→0 | HiFi 04: “…struction How time was divided before anything was searched. If this is wrong, every later stage is wrong. fol…” | **REMOVE** |

## S04 · #stage=search (tab-only; + S06 shared block)

Screenshot: `S04_search.png` · listed items 27 → 7 words

| file:line | block | text (≤120 chars) | words before→after | HiFi equivalent at that spot | recommendation |
|---|---|---|---:|---|---|
| `EvidenceFlow.tsx:155` | Search tab — title | Stage 2 · Search — why these params | 7→7 | HiFi 04: “…Stage 2 · Search — why these params Every trial, the funnel that narrowed them, and the decision that picked o…” | **KEEP** |
| `EvidenceFlow.tsx:157` | Search tab — subtitle | Every trial, the funnel that narrowed them, and the decision that picked one — for the fold under the cursor. | 20→0 | HiFi 04: “…se params Every trial, the funnel that narrowed them, and the decision that picked one — for the fold under th…” | **REMOVE** |

## S04 · #stage=freeze (tab-only; + S07 shared block)

Screenshot: `S04_freeze.png` · listed items 21 → 3 words

| file:line | block | text (≤120 chars) | words before→after | HiFi equivalent at that spot | recommendation |
|---|---|---|---:|---|---|
| `EvidenceFlow.tsx:161` | Freeze tab — title | Stage 3 · Freeze — the hinge between Search and Execute | 11→3 | HiFi 04: “…Stage 3 · Freeze — the hinge between Search and Execute What was frozen, when, and proof that nothing drifted…” | **SHORTEN** — Stage 3 · Freeze |
| `EvidenceFlow.tsx:162` | Freeze tab — subtitle | What was frozen, when, and proof that nothing drifted afterwards. | 10→0 | HiFi 04: “…d Execute What was frozen, when, and proof that nothing drifted afterwards. three timestamps — ordering is the…” | **REMOVE** |

## S04 · #stage=execute (tab-only; + S08 shared block)

Screenshot: `S04_execute.png` · listed items 22 → 0 words

| file:line | block | text (≤120 chars) | words before→after | HiFi equivalent at that spot | recommendation |
|---|---|---|---:|---|---|
| `EvidenceFlow.tsx:168` | Execute tab — subtitle | The frozen params trading the OOS tape, one event at a time. Replay reads immutable artifacts — it never re-runs the … | 22→0 | HiFi 04: “…le replay The frozen params trading the OOS tape, one event at a time. Replay reads immutable artifacts — it n…” | **REMOVE** |

## S04 · #stage=claim

Screenshot: `S04_claim.png` · listed items 157 → 24 words

| file:line | block | text (≤120 chars) | words before→after | HiFi equivalent at that spot | recommendation |
|---|---|---|---:|---|---|
| `EvidenceFlow.tsx:3880` | Claim tab — title | Stage 5 · Claim — what this run is allowed to say | 12→3 | HiFi 04: “…Stage 5 · Claim — what this run is allowed to say The claim passport only aggregates. Nothing here is computed…” | **SHORTEN** — Stage 5 · Claim |
| `EvidenceFlow.tsx:3881` | Claim tab — subtitle | The claim passport only aggregates. Nothing here is computed on this screen. | 12→0 | HiFi 04: “…ed to say The claim passport only aggregates. Nothing here is computed on this screen. certification — min of…” | **REMOVE** |
| `EvidenceFlow.tsx:3912-3914` | claim panel, under the quoted NOT_ISSUED sentence | The server's own sentence, quoted: no release claim was issued for this run, so nothing on this screen may be read as… | 23→0 | no | **REMOVE** — the NOT_ISSUED state + quoted server sentence stay |
| `EvidenceFlow.tsx:3651` | certification panel title | certification — min of the caps, never issued here | 8→1 | HiFi 04: “…s screen. certification — min of the caps, never issued here cert_chain.json stage condition observed cap {{ c…” | **SHORTEN** — certification |
| `EvidenceFlow.tsx:3679` | certification panel header | binding: not published — the rule is the engine's, never applied here. | 12→3 | no | **SHORTEN** — binding — not published |
| `EvidenceFlow.tsx:3696` | certification caps row | [per-stage caps not published] — the engine publishes the certificate it issued, not the caps behind it; this screen … | 19→9 | no | **SHORTEN** — keep only the Withheld chip: per-stage caps — not published |
| `EvidenceFlow.tsx:3780` | window disclosure panel footer | Each row prints only what a read on this screen publishes; a window no read describes keeps its row, marked. | 20→0 | no | **REMOVE** |
| `RunProgress.tsx:86` | artifacts row (reused) | Sealed means the bytes are ready — reading them is a separate, authorized route this release does not publish. | 19→4 | no | **SHORTEN** — reader route — not published |
| `EvidenceFlow.tsx:4001` | SOON hook — Register for Paper Trading | will carry the claim passport and the evidence link; deployment params must equal frozen params or declare a refit. | 19→0 | HiFi 04: “…passport, evidence link — deployment params must equal frozen params or declare a refit. Atlas — how to read m…” | **MOVE-TO-TOOLTIP** — title attr on the SOON hook |
| `EvidenceFlow.tsx:95` | window disclosure (reused) | headline = OOS only — IS and holdout never enter the headline row. | 13→4 | no | **SHORTEN** — headline = OOS only |

## S04 · #stage=atlas

Screenshot: `S04_atlas.png` · listed items 144 → 20 words

| file:line | block | text (≤120 chars) | words before→after | HiFi equivalent at that spot | recommendation |
|---|---|---|---:|---|---|
| `EvidenceFlow.tsx:4025` | Atlas tab — title | Atlas — how to read modes and routes | 7→7 | HiFi 04: “…a refit. Atlas — how to read modes and routes Reference, not a stage. Every cell deep-links into the stages w…” | **KEEP** |
| `EvidenceFlow.tsx:4026` | Atlas tab — subtitle | Reference, not a stage. Every cell deep-links into the stages with the cursor it describes. | 15→0 | HiFi 04: “…ce, not a stage. Every cell deep-links into the stages with the cursor it describes. {{ at.label }} optimizati…” | **REMOVE** |
| `EngineAtlas.tsx:1066-1080` | rule one banner | The claim comes from mode × schedule, never from the mode alone. mode_1_decay + per_fold_causal is strict outer OOS; … | 36→8 | HiFi 04: “…OOS) ≤ D The claim comes from mode × schedule , never from the mode alone. Two enums, two layers: this table…” | **SHORTEN** — claim = mode × schedule, not mode alone |
| `EngineAtlas.tsx:1088-1091` | rule two banner | Two selector layers, never mixed: optimization_mode belongs to this page; the execution route does not. | 15→0 | HiFi 12: “…rule two Two selector layers, never mixed: optimization_mode (this page) belongs to the walk-forward endpoint…” | **MOVE-TO-TOOLTIP** — ⓘ on the optimization_mode column header |
| `EngineAtlas.tsx:1011-1014` | avoid-when row (label is hard-coded, sentence is the server's reason) | AVOID WHEN · NOT P3648LISHED — QuantBT 1.1.1 publishes no avoid-when guidance for this mode; the Portal does not write … | 23→5 | no | **SHORTEN** — avoid when — not published · <reason_code> |
| `EngineAtlas.tsx:1028-1030` | "rules of this screen" footer | Claim strings are the engine's, rendered verbatim from the mode × schedule matrix — the UI never composes its own. In… | 48→0 | HiFi 12: “…is screen Claim strings are the engine's, rendered verbatim from the mode × schedule matrix — the UI never com…” | **REMOVE** |

## S05 Split

Screenshot: `S05_split.png` · listed items 300 → 56 words

| file:line | block | text (≤120 chars) | words before→after | HiFi equivalent at that spot | recommendation |
|---|---|---|---:|---|---|
| `SplitDetail.tsx:83` | header subtitle | The protocol decides what a fold even is. If this stage is wrong, every later stage is wrong — and no metric downstre… | 26→0 | HiFi 05: “…s divided The protocol decides what a fold even is. If this stage is wrong, every later stage is wrong — and n…” | **REMOVE** |
| `retainedLane.ts:141` | protocol strip — long sentence under the fields | advanced walk-forward · weekly · expanding: 2 outer folds observed in the retained source. One global study selected … | 46→7 | no | **SHORTEN** — one global θ* traded on every fold |
| `SplitDetail.tsx:1748` | fold timeline legend | warmup = grey · IS = mist · outer OOS = accent · holdout = gold hatch | 17→17 | no | **KEEP** — legend |
| `SplitDetail.tsx:1342` | holdout row, second line | No holdout segment exists in this profile, so nothing is sealed and nothing can be unlocked. | 16→0 | no | **REMOVE** — duplicates the typed absence one line above (holdout n/a · P10_DELTA_WFO_PROFILE_HAS_NO_HOLDOUT_SEGMENT), which stays |
| `SplitDetail.tsx:2260` | θ* flow header scope | θ* per fold GLOBAL · one θ* shared by every fold | 11→4 | no | **SHORTEN** — θ* per fold: GLOBAL (shared) |
| `SplitDetail.tsx:2335` | θ* flow caption | Shared params (global schedule): one study over the whole walk-forward selected θ*, and every fold's test window was … | 28→0 | no | **REMOVE** — repeats the header scope and every row's "shared params (global schedule)" |
| `SplitDetail.tsx:2612` | fold table footer | 2 folds from the retained source · click a row or use the arrow keys to move the cursor — Search follows it | 23→4 | HiFi 05: “…ick a row to move the cursor — Search, Freeze and Execute follow it", checks, stitchedNote: full ? "No stitche…” | **SHORTEN** — 2 folds · retained source (hint → row title) |
| `SplitDetail.tsx:1817` | integrity card title | boundary integrity — read from the split, not recomputed | 9→2 | HiFi 05: “…leFoot }} boundary integrity — read from fold_plan, not recomputed digest sha256:2ba4… {{ c.mark }} {{ c.k }}…” | **SHORTEN** — boundary integrity |
| `SplitDetail.tsx:1901` | stitched OOS provenance card | The retained fold plan publishes 2 test windows, one per fold; the stitched OOS series itself is on Evidence Flow. | 20→7 | HiFi 05: “…freezes — one ❖ per fold, the pattern repeats every step" : "search-trace → parameter_set → series · one freez…” | **SHORTEN** — 2 test windows · series on Evidence Flow → |
| `SplitDetail.tsx:1247` | stitched OOS provenance card | verified against fold boundaries · 2 segments, 336 retained observations | 10→10 | HiFi 05: “…6:7e01… · verified against fold boundaries", capText: full ? "≤ D — calibration protocol" : "≤ B while the hol…” | **KEEP** — scope |
| `SplitDetail.tsx:1252` | stitched OOS provenance card | the Portal's digest of the retained stitch plan — QuantBT publishes none | 12→5 | no | **SHORTEN** — Portal digest · QuantBT: not published |
| `SplitDetail.tsx:1933` | "what this stage feeds forward" card | Stage 2 ran one global study across the whole walk-forward. Stage 3 froze its one selected θ*, and Stage 4 trades eve… | 29→0 | no | **REMOVE** — keep only the "next: S4 Execute →" link and the certificate absence line |
| `SplitDetail.tsx:99 (render :1990)` | "rules of this screen" footer | This screen renders the boundaries the server published — it never constructs a fold and never recomputes a date. Whe… | 53→0 | HiFi 05: “…nders it, it never constructs folds. Train/Test is not a separate screen: it is this machinery with n_folds =…” | **REMOVE** |

## S06 Search

Screenshot: `S06_search.png` · listed items 611 → 167 words

| file:line | block | text (≤120 chars) | words before→after | HiFi equivalent at that spot | recommendation |
|---|---|---|---:|---|---|
| `SearchDetail.tsx:88` | header title | Search & Selection — how parameters were searched and selected | 10→3 | HiFi 06: “…Freeze → Search & Selection — how parameters were searched and selected Stage A searches on IS. The pool free…” | **SHORTEN** — Search & Selection |
| `SearchDetail.tsx:92` | header subtitle | Stage A searches on IS. The pool freezes. Stage B selects on the frozen pool. Information crosses the freeze line one… | 36→0 | HiFi 06: “…d Stage A searches on IS. The pool freezes. Stage B selects on the frozen pool. Information crosses the freeze…” | **REMOVE** |
| `SearchDetail.tsx:113` | mode strip, right | a real run's mode is fixed at submit. | 8→0 | no | **REMOVE** |
| `SearchDetail.tsx:215` | mode strip, right column | Two selector layers, two enums: optimization_mode belongs to the walk-forward endpoint; CandidateSelector.mode belong… | 22→0 | HiFi 06: “…torTag }} Two selector layers, two enums: optimization_mode belongs to the walk-forward endpoint; CandidateSel…” | **MOVE-TO-TOOLTIP** — ⓘ on the OPTIMIZATION_MODE label |
| `SearchFoldStrip.tsx:139` | "what this mode reads" strip | Refit after reading the full span: the gold OOS pulses against time order — retrospective evidence, never a deploymen… | 20→5 | HiFi 06: “…ctive" ? "Refit after reading the full span: the gold OOS pulses against time order — retrospective evidence,…” | **SHORTEN** — retrospective — not a deployment claim |
| `SearchDetail.tsx:1615` | mode strip, stage explainer | Stage A (is_search) scores trials on IS — no trial's OOS was seen by Optuna; Stage B (oos_candidate_selection) re-sco… | 29→0 | no | **REMOVE** — the STAGE A / STAGE B column headers already say this |
| `SearchDetail.tsx:1325` | A1 search space footer | 3 trials sampled a declared grid of 21,379,147,776 points — every conclusion below is about the sampled region, not t… | 22→6 | HiFi 06: “…sts grid. Every conclusion below is about the sampled region, not the whole space.", surfaceTitle: "512 trials…” | **SHORTEN** — 3 of 21,379,147,776 grid points sampled |
| `SearchSurface.tsx:137` | A2 trial surface caption | all 3 retained trials drawn — nothing sampled away. Positions are the server's placement inside each declared range; … | 37→9 | no | **SHORTEN** — 3 of 3 trials drawn · colour = IS quintile (−3.95 … −1.44) |
| `SearchSurface.tsx:286` | A3 legend | objective in trial order · gold = best-so-far | 8→8 | HiFi 06: “….label }} objective in trial order · gold = best-so-far {{ railNote }} {{ concTitle }} {{ concNote }} A4 · per…” | **KEEP** — legend |
| `SearchSurface.tsx:331` | A3 prune note | No trial was pruned (capability probe: 0 of 3). | 9→4 | no | **SHORTEN** — pruned 0 of 3 |
| `SearchSurface.tsx:336` | A3 right chart title | window by trial order — where the sampler contracts | 9→4 | HiFi 06: “….conc + " by trial order — where the sampler contracts", concPts, concThetaStyle: "position:absolute; left:0;…” | **SHORTEN** — window by trial order |
| `SearchSurface.tsx:367` | A3 right chart caption | 3 trials — too few to read where the sampler contracts; each dot is one trial's window, the green line θ*. | 21→8 | HiFi 06: “…ression — where the sampler contracts param {{ a.label }} objective in trial order · gold = best-so-far {{ rai…” | **SHORTEN** — too few trials (3) to read · green = θ* |
| `SearchSurface.tsx:386` | A4 legend | darker bar = higher objective · green tick = θ* | 10→10 | HiFi 06: “…er region darker bar = higher objective · green tick = θ* {{ d.name }} {{ d.summary }} {{ d.lo }} θ* {{ d.thet…” | **KEEP** — legend |
| `SearchSurface.tsx:477` | A5 absence | not applicable — 3 complete trials; a rank correlation needs at least 8. QuantBT itself publishes no parameter import… | 22→7 | no | **SHORTEN** — not applicable — 3 trials, needs ≥ 8 |
| `SearchStageB.tsx:38` | B1 feasible row | does not arise — QuantBT's walk-forward study declares no constraints | 10→4 | no | **SHORTEN** — n/a — no constraints declared |
| `SearchStageB.tsx:155` | B1 re-evaluated row | on every outer fold — the OOS column enters the ranking | 10→5 | no | **SHORTEN** — every outer fold · OOS ranks |
| `SearchStageB.tsx:209` | B1 pool-freeze callout | K = ⌈n_trials × top_is_fraction⌉ = ⌈3 × 0.1⌉ = 1 — the pool closes BEFORE any OOS value is computed. Stage B then ran… | 35→11 | HiFi 06: “…0⌉ = 52 — the pool closes BEFORE any " + (isM5 ? "robustness" : "OOS") + " value is computed. This boundary is…” | **SHORTEN** — K = ⌈3 × 0.1⌉ = 1 · pool closes before OOS |
| `SearchDetail.tsx:1043-1045` | B2 formula — 3 term descriptions | S̄_OOS — mean OOS Sharpe over the outer folds · value −5.35 × weight 1 (+ σ(decay)…, max(0, D̄)…) | 45→14 | no | **SHORTEN** — mean OOS Sharpe · × 1 / decay dispersion · × −0.5 / positive mean decay · × −0.5 |
| `SearchDetail.tsx:1086` | B2 J row | as QuantBT ranked it — 4 of 4 retained objectives recompose from their terms | 14→4 | no | **SHORTEN** — 4 of 4 recompose |
| `SearchStageB.tsx:258` | B2 decay bars title | per-fold decay of θ* — the sign matters | 7→4 | no | **SHORTEN** — per-fold decay of θ* |
| `SearchStageB.tsx:303` | B2 decay bars caption | QuantBT's d = S_IS − S_OOS per fold, for θ* | 10→10 | no | **KEEP** — formula/unit |
| `SearchStageB.tsx:336 / :371` | B2 scatter title + axis | pool on the S_IS × S̄_OOS plane · diagonal = zero decay / x S_IS · y S̄_OOS · below the diagonal = positive decay (IS… | 27→27 | HiFi 06: “…S_IS × S̄_OOS plane · diagonal = zero decay below the diagonal = positive decay (IS > OOS) synthetic Sharpe di…” | **KEEP** — axis labels |
| `SearchDetail.tsx:1141` | B3 best-trial caption | The IS best and the selected candidate are the same trial here, but the two numbers measure different things: the IS … | 46→5 | no | **SHORTEN** — same trial · centroid — not applicable |
| `SearchSurface.tsx:529` | B4 θ* journey caption | One global study selected θ* for every fold, so each row is a single dot — there is no per-fold journey to draw. Righ… | 58→8 | no | **SHORTEN** — global θ* — no per-fold journey · right: top-decile share |
| `SearchDetail.tsx:2389` | fold inspection card | The retained ledger was read without a fold filter: 3 of 3 trials matched. Every trial and candidate row states its o… | 28→7 | no | **SHORTEN** — no fold filter · 3 of 3 trials |
| `SearchDetail.tsx:666` | trial ledger title | trial ledger — around θ* · Optuna trials only; candidate replays are a separate ledger | 15→4 | HiFi 06: “…ound θ* · Optuna trials only; candidate replays are a separate ledger {{ ledgerMeta }} trial seed state S_IS {…” | **SHORTEN** — trial ledger — Optuna trials |
| `SearchDetail.tsx:731` | candidate replay footer | The OOS column has four states from the mode × schedule matrix — never a boolean. The UI recomputes no objective. | 21→0 | HiFi 06: “…pruning. The OOS column has four states from the mode × schedule matrix — never a boolean. The UI recomputes…” | **REMOVE** |
| `SearchDetail.tsx:100 (render :2445)` | "rules of this screen" footer | A panel degrades when a field is missing; it never infers one. The frontend never clusters, never ranks and never com… | 22→0 | HiFi 06: “…degraded: the frontend never clusters, never computes J. class Component extends DCLogic { constructor(props)…” | **REMOVE** |

## S07 Freeze

Screenshot: `S07_freeze.png` · listed items 450 → 94 words

| file:line | block | text (≤120 chars) | words before→after | HiFi equivalent at that spot | recommendation |
|---|---|---|---:|---|---|
| `FreezeDetail.tsx:87` | header subtitle | What was frozen, and what that freeze can honestly be checked against. Every match below names what it was checked ag… | 36→0 | no | **REMOVE** |
| `FreezeDetail.tsx:1374` | F1 panel title | F1 · two axes — deliberately separate, not the same units | 11→3 | HiFi 07: “…fig. F1 · two axes — deliberately separate, not the same units plotting a wall-clock timestamp on the data-tim…” | **SHORTEN** — F1 · two axes |
| `FreezeDetail.tsx:1378` | F1 data-time lane title | data time — which bars each fold read · 2 folds | 11→4 | HiFi 07: “…be a lie DATA TIME — which bars each frozen set governs {{ d.id }} ❖ {{ d.digest }} {{ dataNote }} WALL CLOCK…” | **SHORTEN** — data time · 2 folds |
| `FreezeDetail.tsx:852` | F1 data-time caption | One θ* was selected after every outer fold's OOS window had been read, so no fold's OOS is held out from the selectio… | 31→9 | no | **SHORTEN** — θ* chosen after all OOS read — report evidence only |
| `FreezeDetail.tsx:856` | F1 wall-clock lane | QuantBT publishes no freeze or OOS-read timestamps on this route, so no wall-clock tick is drawn. | 16→4 | no | **SHORTEN** — wall-clock timestamps — not published |
| `FreezeDetail.tsx:94` | F1 footer | two clocks, never one axis — wall-clock proves WHO knew WHEN; data-time proves WHAT was knowable. | 16→0 | no | **REMOVE** |
| `FreezeDetail.tsx:1200` | frozen set scope | shared params — global schedule, one θ* for folds 1–2 | 10→10 | no | **KEEP** — scope |
| `FreezeDetail.tsx:1203` | frozen set scope tail | · one optimizer study selected it for every fold, so its objective is study-wide, not a per-fold best. | 18→3 | no | **SHORTEN** — · objective is study-wide |
| `FreezeDetail.tsx:1295` | frozen set note | Read-only by decision: writing onto a frozen set breaks the invariant the claim rests on. Manually entered params hav… | 27→0 | HiFi 07: “…p.note }} Read-only by decision: writing onto a frozen set breaks the invariant the claim rests on. Manually e…” | **MOVE-TO-TOOLTIP** — "read-only" chip with the sentence as title |
| `DigestChain.tsx:306` | digest chain header | Verify re-reads the retained digests and compares them with the values the engine recorded. The screen never issues a… | 31→5 | HiFi 07: “…is checks artifact integrity — not selection correctness. Note: fixed_params (issl = True) stays out of the pa…” | **SHORTEN** — checks artifact integrity, not selection |
| `FreezeDetail.tsx:412` | digest chain state | No verification has been requested for these bytes. A read never re-opens them; verify now does. | 16→3 | no | **SHORTEN** — not verified yet |
| `FreezeDetail.tsx:829` | integrity scope note | A match here means the retained manifest, its row counts and its batch receipt agree with what Portal imported. It is… | 39→8 | HiFi 04: “…cute A mismatch here means the bundle was rebuilt after freeze → certification BLOCKED. The check re-runs at S…” | **SHORTEN** — match = manifest, row counts, batch receipt only |
| `Stage4Binding.tsx:126` | S4 binding card | Compared by QuantBT's own identities: the sealed θ*'s candidate id against the candidate each fold's out-of-sample ge… | 33→0 | no | **MOVE-TO-TOOLTIP** — ⓘ on the binding card title |
| `Stage4Binding.tsx:147` | S4 binding card | 8 declared parameters are inside the params digest. | 8→8 | no | **KEEP** — scope |
| `Stage4Binding.tsx:158` | S4 binding card | Code-fixed values: not published — outside the params digest, covered by the code digest 34dc1847… inside the adapter… | 20→7 | HiFi 07: “…_params — outside the params digest, inside the bundle digest", noteStyle: "padding:7px 12px; font-size:10.5px…” | **SHORTEN** — code-fixed values — not published · code digest 34dc1847… |
| `WhatIfCard.tsx:30` | what-if card | a what-if never writes onto frozen params — commit creates a SIBLING ATTEMPT with its own config_hash, lineage-linked… | 21→3 | HiFi 04: “…atif }} + What-if never writes onto frozen params — it drafts a new attempt with its own lineage. {{ a.label }…” | **SHORTEN** — commit → sibling attempt |
| `WhatIfCard.tsx:366-370` | what-if axis/definition line | ΔJ₁ = J at the node − J at θ* · mode 1 decay j over the global study is folds · seed 42 · er_quantbt_111 · dataset e6… | 27→27 | no | **KEEP** — unit/scope — but fix "global study is folds" (lower-cased GLOBAL_STUDY_IS_FOLDS reads as a verb) |
| `FreezeDetail.tsx:90 (render :1887)` | "rules of this screen" footer | A digest mismatch BLOCKS — it never warns. Verify re-reads the retained bindings and the sealed artifact bytes agains… | 79→0 | HiFi 04: “…tifacts — it never re-runs the strategy. execution contract {{ r.label }} {{ routeNoticeTag }} {{ routeNotice…” | **REMOVE** |

## S08 Execute

Screenshot: `S08_execute.png` · listed items 441 → 147 words

| file:line | block | text (≤120 chars) | words before→after | HiFi equivalent at that spot | recommendation |
|---|---|---|---:|---|---|
| `ExecuteDetail.tsx:71` | header title | S4 · Execute Replay — what this source can replay | 10→3 | no | **SHORTEN** — S4 · Execute Replay |
| `ExecuteCandleReplay.tsx:50` | header subtitle | The run's own candles, one bar at a time. A marker is a target transition QuantBT settled at the bar close; this rout… | 34→0 | no | **REMOVE** — the route-contract line says it |
| `ExecuteCandleReplay.tsx:53` | route contract callout | ROUTE CONTRACT close_target_v2 — the route this run executed. Accounting happens at the close only: QuantBT emitted 0… | 43→9 | HiFi 08: “…rget_v2 — the route this run executed. Accounting happens at close only: order, intent and fill DO NOT EXIST.…” | **SHORTEN** — close_target_v2 · close-only accounting · 0 orders · 0 fills · 0 trades |
| `ExecuteCandleReplay.tsx:1202` | execution contract line | → contract close_target_v2 · signal bar close · fill same close @ close · accounting certified by QuantBT | 18→18 | no | **KEEP** — contract facts |
| `ExecuteCandleReplay.tsx:548` | stitched-account minimap caption | whole run · 1,056 bars in 151 candles of 7 bars — each high/low is the true extreme of its bars · range 57758.6 – 740… | 32→14 | no | **SHORTEN** — whole run · 1,056 bars → 151 candles of 7 · range … · shaded = OOS folds |
| `ExecuteCandleReplay.tsx:1261` | chart legend | markers: T = target transition at the close (▼ short · ▲ long · ● flat) | 16→16 | no | **KEEP** — legend |
| `ExecuteCandleReplay.tsx:739` | inspector strip | the account's own checkpoint at this bar — research model state, not a broker account | 15→6 | no | **SHORTEN** — model state, not a broker account |
| `ExecuteCandleReplay.tsx:1306` | window nav hint | a fold, a window or a transition outside it is read only when you ask; playing stops at the end of this window. | 23→0 | no | **REMOVE** |
| `ExecuteCandleReplay.tsx:1341` | transition ledger intro | Each row is a bar where QuantBT changed the accepted position, with the account's own notional and fee. The numbers a… | 36→0 | no | **MOVE-TO-TOOLTIP** — ⓘ on the ledger title |
| `ExecuteCandleReplay.tsx:10` | transition ledger footer | 8 of 8 transitions · target transition settled at close not a fill | 13→4 | no | **SHORTEN** — 8 of 8 transitions |
| `ExecuteCandleReplay.tsx:998` | trade anatomy title | trade anatomy — close-target schema, every link from the retained bar | 11→2 | no | **SHORTEN** — trade anatomy |
| `ExecuteCandleReplay.tsx:962/975` | trade anatomy order/fill rows | not_applicable — close_target_v2 emits no order records (0 published) / not_applicable — accounting settles at the cl… | 21→21 | no | **KEEP** — typed absence |
| `ExecuteCandleReplay.tsx:897` | child audit intro | Each row is a strategy instance QuantBT created for fold 0, as QuantBT recorded it. The marked row generated the out-… | 24→7 | no | **SHORTEN** — fold 0 instances · marked = OOS generation |
| `ExecuteCandleReplay.tsx:942` | child audit footer | 6 of 6 records for this fold · run total 12 · policy isolated_v1 · dropped by QuantBT 0 · run fingerprint f7fc11ce5800… | 23→23 | no | **KEEP** — counts/scope |
| `ExecuteCandleReplay.tsx:1361` | trade blotter | QuantBT emitted 0 trade records on this route. Pairing the transitions above into trades would be the screen's guess,… | 24→6 | no | **SHORTEN** — 0 trade records on this route (reason chip below stays) |
| `ExecuteCandleReplay.tsx:1367` | MAE × MFE | Per-trade excursions need trade records; this route has none. | 9→9 | no | **KEEP** — typed absence |
| `ExecuteCandleReplay.tsx:1366` | MAE × MFE title | MAE × MFE — pain vs potential per trade | 7→3 | HiFi 08: “…b.exit }} MAE × MFE — pain vs potential per trade Dots below the diagonal suffered more than they ever promise…” | **SHORTEN** — MAE × MFE |
| `ExecuteCandleReplay.tsx:1065` | cost timeline footnote | One column per bar in the window; a full column is a bar the account paid a fee on. Fee rate 0.0005 one way, slippage… | 27→6 | no | **SHORTEN** — fee 0.0005 one-way · slippage 0 bps |
| `ExecuteCandleReplay.tsx:1373` | route-aware facts intro | What close_target_v2 cannot produce, each with the run's own reason. | 10→0 | no | **REMOVE** — the rows carry their own reasons |
| `ExecuteDetail.tsx:78 (render :1648)` | "rules of this screen" footer | The transport is the only clock — every panel listens to the same sample. A missing artifact is declared with its rea… | 45→0 | no | **REMOVE** |

## S09 Report

Screenshot: `S09_report.png` · listed items 290 → 58 words

| file:line | block | text (≤120 chars) | words before→after | HiFi equivalent at that spot | recommendation |
|---|---|---|---:|---|---|
| `ReportDetail.tsx:73` | screen-only action bar | this bar does not print — Export → PDF gives the clean sheet | 13→0 | HiFi 09: “…un Report this bar does not print — Export → PDF gives the clean sheet Quant Ecosystem Portal · Backtest Evide…” | **MOVE-TO-TOOLTIP** — title on the Print button |
| `reportClient.ts:390` | partial banner | Sealed report. The source did not publish 2 of 7 headline values, 4 of 10 artifact digests, 1 of 6 passport facts; ea… | 30→9 | no | **SHORTEN** — Partial — not published: 2/7 headline · 4/10 digests · 1/6 passport |
| `ReportDetail.tsx:86` | claim passport title | Claim passport — issued by the engine, quoted verbatim | 9→2 | HiFi 09: “…ut sealed Claim passport — issued by the engine, quoted verbatim validation_claim STRICT_OUTER_OOS chronologic…” | **SHORTEN** — Claim passport |
| `ReportDetail.tsx:624` | metrics block title | metrics — as the sealed Evidence Hub published them | 8→1 | no | **SHORTEN** — metrics |
| `ReportDetail.tsx:670` | equity chart title | Equity — IS account vs stitched OOS (2 folds, frozen params each) | 12→12 | HiFi 09: “…, sealed. Equity — IS account vs stitched OOS (5 folds, frozen params each) series/stitched.parquet · UTC · di…” | **KEEP** — title + scope |
| `ReportDetail.tsx:825-826` | equity chart footer | fold boundaries marked at each fold's first OOS bar · params handoff at each boundary: rvol=1.2 · rsi_l=30 · … · sign… | 30→4 | no | **SHORTEN** — ┆ = fold OOS start (params already in Identity) |
| `ReportDetail.tsx:917` | per-fold verdict footer | fold_01, fold_02 drag the run. Verdicts under research.fold-verdict.v1 — pass: OOS Sharpe ≥ 0.6, decay ≤ 0.35, drawdo… | 36→5 | no | **SHORTEN** — fold_01, fold_02 drag · rule v1 (pass: S ≥ 0.6 · decay ≤ 0.35 · dd ≥ −15%) |
| `ReportDetail.tsx:1020` | certification chain footer | Each check is one sourced fact with its source key; a stage's progress is not its check. No source publishes a certif… | 28→4 | no | **SHORTEN** — certification cap — not published |
| `ReportDetail.tsx:1057` | key artifacts footer | Sealed part digests of the retained artifact; bytes are never reopened by a read (P05_SOURCE_BYTES_WERE_VERIFIED_AT_I… | 19→5 | no | **SHORTEN** — download — not available · P05_… chip |
| `ReportDetail.tsx:1191` | print footer | R-WFO-017 · report 2026-09-30 07:06Z · page prints on letter or A4 | 12→12 | HiFi 09: “…09:41Z · page prints on letter or A4 class Component extends DCLogic { constructor(props) { super(props); thi…” | **KEEP** — HiFi print footer |
| `ReportDetail.tsx:1259` | exports block footer | Exports are built by the server from this sealed report. The file downloads only when you follow its link; no PDF is … | 29→0 | no | **REMOVE** |
| `ReportDetail.tsx:140` | annotation title | approval annotation — stored separately, not part of the sealed report | 11→4 | no | **SHORTEN** — approval annotation · not printed |
| `ReportDetail.tsx:1283` | annotation body | Display only and never printed: the annotation is a mutable row kept apart from the frozen core, so the printed sheet… | 26→0 | no | **REMOVE** — covered by the shortened title |
| `ReportDetail.tsx:117 (render :1387)` | footer | Every value on this sheet is read from the sealed report; the sheet computes nothing. An absent fact keeps its place … | 27→0 | no | **REMOVE** |

## S12 Atlas

Screenshot: `S12_atlas.png` · listed items 139 → 16 words

| file:line | block | text (≤120 chars) | words before→after | HiFi equivalent at that spot | recommendation |
|---|---|---|---:|---|---|
| `EngineAtlas.tsx:1358` | header subtitle | Reference, not a stage — modes, execution routes, and what each contract may claim. Read from er_quantbt_111. | 17→3 | HiFi 12: “…ce, not a stage — modes, execution routes, and what each contract may claim. Read from er_quantbt_1_1_1. open…” | **SHORTEN** — Read from er_quantbt_111 |
| `EngineAtlas.tsx:1066-1080` | rule one banner | The claim comes from mode × schedule, never from the mode alone. mode_1_decay + per_fold_causal is strict outer OOS; … | 36→8 | HiFi 12: “…rule one The claim comes from mode × schedule , never from the mode alone. mode_1_decay + per_fold_causal is…” | **SHORTEN** — claim = mode × schedule, not mode alone |
| `EngineAtlas.tsx:1088-1091` | rule two banner | Two selector layers, never mixed: optimization_mode belongs to this page; the execution route does not. | 15→0 | HiFi 12: “…rule two Two selector layers, never mixed: optimization_mode (this page) belongs to the walk-forward endpoint…” | **MOVE-TO-TOOLTIP** — ⓘ on the optimization_mode column header |
| `EngineAtlas.tsx:1011-1014` | avoid-when row (label is hard-coded, sentence is the server's reason) | AVOID WHEN · NOT P3648LISHED — QuantBT 1.1.1 publishes no avoid-when guidance for this mode; the Portal does not write … | 23→5 | no | **SHORTEN** — avoid when — not published · <reason_code> |
| `EngineAtlas.tsx:1028-1030` | "rules of this screen" footer | Claim strings are the engine's, rendered verbatim from the mode × schedule matrix — the UI never composes its own. In… | 48→0 | HiFi 12: “…is screen Claim strings are the engine's, rendered verbatim from the mode × schedule matrix — the UI never com…” | **REMOVE** |

## S13 Compare

Screenshot: `S13_compare.png` · listed items 508 → 56 words

| file:line | block | text (≤120 chars) | words before→after | HiFi equivalent at that spot | recommendation |
|---|---|---|---:|---|---|
| `CompareDetail.tsx:134` | header title | Compare — three different questions, three different rules | 8→1 | HiFi 13: “…/ Compare Compare — three different questions, three different rules Attempts of one idea rank by claim before…” | **SHORTEN** — Compare |
| `CompareDetail.tsx:138` | header subtitle | Attempts of one idea rank by claim before number. One idea across markets refuses overlay. Two runs on one key overla… | 30→0 | HiFi 13: “…ent rules Attempts of one idea rank by claim before number. One idea across markets refuses overlay. Two ideas…” | **REMOVE** — the three mode tabs carry the three questions |
| `CompareDetail.tsx:160` | "rule of this mode" callout | Same alpha, same key — every chart may overlay. But numbers across claim classes never rank each other: a retrospecti… | 60→0 | HiFi 13: “…this mode Same alpha, same key — every chart may overlay. But numbers across claim classes never rank each oth…” | **REMOVE** — the ladder header already states it |
| `compareClient.ts:151` | ladder header | claims rank before numbers — a weaker claim with a prettier Sharpe still ranks lower. | 15→4 | HiFi 13: “…owed, but claims rank before numbers and only the ACTIVE node may promote. One alpha across markets: keys diff…” | **SHORTEN** — claims rank before numbers |
| `CompareDetail.tsx:987` | ladder scope | 15 with a claim · 36 returned · strongest claim on the right | 13→13 | no | **KEEP** — scope |
| `CompareDetail.tsx:106` | claim-family gloss — printed on EVERY ladder card (15×14 words) | Walk-forward OOS calibrated across the folds after the fact — not a causal claim. | 210→0 | no | **MOVE-TO-TOOLTIP** — title on the WALK_FORWARD_OOS_COMPATIBILITY chip (already has a title attr) |
| `CompareDetail.tsx:1036` | ladder off-ladder note | 19 FAILED · 2 READY — no claim family published, so they do not stand on the ladder | 18→8 | no | **SHORTEN** — 21 without a claim family — off the ladder |
| `CompareDetail.tsx:171` | fold chart title | OOS Sharpe per fold, per attempt — same folds, same tape, different honesty | 13→6 | HiFi 13: “…EChart 1 OOS Sharpe per fold, per attempt — same folds, same tape, different honesty {{ cs.label }} {{ foldCh…” | **SHORTEN** — OOS Sharpe per fold, per attempt |
| `CompareDetail.tsx:1150` | fold chart scope | 9 attempts · 2 folds · retained per-fold QuantBT metric | 10→10 | no | **KEEP** — scope |
| `CompareDetail.tsx:174` | config diff title | config diff — the only keys that changed anywhere in the tree | 11→2 | HiFi 13: “…rtNote }} config diff — the only keys that changed anywhere in the tree gold = differs from ACTIVE att_03 key…” | **SHORTEN** — config diff |
| `CompareDetail.tsx:1335 (+DIFF_FOOTER :177)` | config diff footer | 21 attempts without a claim are not columns here. diffs are config keys from PORTAL_PERSISTED_RESEARCH — never inferr… | 26→8 | HiFi 13: “…{{ c.v }} diffs are config keys from attempts.json — never inferred from results. Full tree with parents: Atte…” | **SHORTEN** — 21 without a claim not shown · Attempt Lineage → |
| `CompareDetail.tsx:1366-1380` | "what this trajectory says" card — hard-coded link line (first sentence is server text) | the tree records every attempt, and the release candidate only ever reads the ACTIVE node. | 15→4 | HiFi 13: “…mptation, and the release candidate only ever reads the ACTIVE node. rule of this mode Three different Compari…” | **SHORTEN** — Attempt Lineage → · release candidate → |
| `CompareDetail.tsx:207 (render :942)` | "rules of this screen" footer | Three modes, three rules. Attempts of one alpha: overlay allowed, but claims rank before numbers and only the ACTIVE … | 79→0 | HiFi 13: “…is screen Three modes, three rules. Attempts of one alpha: overlay allowed, but claims rank before numbers and…” | **REMOVE** |

## Server-supplied prose seen but NOT counted (not hard-coded — raise with backend if it should shrink)

- Claim quotes on library cards and in S04/S09 (`The Delta walk-forward study sealed its artifacts but did not issue a release claim.`): KEEP, it's the typed claim state.
- S09 metrics scope note `Net return and drawdown are the retained final-account path … not OOS-only …` (58 w): comes from the report read. Scope is needed, but ask for a ≤12-word version.
- S09 warnings `QuantBT reports that selection saw the outer test windows …` / `… retrospective global calibration …`: KEEP (claim caveats).
- S12/S04-atlas term descriptions, SUSPECT lines, `Use when …` cells: engine descriptor. Already collapsed behind `<summary>`, so fine.
- S06 `oos_use USED — With the release-default candidate_selection_metric robust_decay …`: engine contract text.
- S13 trajectory first sentence (`trajectory.text`).
- Long `title=` tooltips (e.g. the S01 sparkline title at `RunLibrary.tsx:506`, ~40 words) are already tooltips. No action needed.

## Side findings

- `WhatIfCard.tsx:367` lower-cases `objective_scope`, so `GLOBAL_STUDY_IS_FOLDS` renders as “over the global study **is** folds”, which reads as a verb. Keep `IS` upper-case (or map the enum to words).
- `usePlayAcrossFolds.ts:48` `ACROSS_HELP` (68 words) is sr-only + `title`. It's not visible and was excluded, but it's too long even for a tooltip.
- S13 fold chart y-axis prints only `0`, `-2.910` and `-7.800` (the data values themselves) rather than ticks. That's not prose, but it showed up in the screenshot.
