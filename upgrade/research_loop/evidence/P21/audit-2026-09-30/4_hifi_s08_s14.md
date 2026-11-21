# Audit 4 — HiFi ↔ frontend, Research Loop screens 08–14 (read-only, 2026-09-30)

Question: do S08–S14 (plus the P22 publication / S11→R1 bridge) match the HiFi and are they complete, when evaluated on the **union** of the code lines as they would be after consolidation?

## 0. Scope, sources, method

**HiFi (canonical):** `upgrade/research_loop/release-v1.1/QuantBT {08 S4 Execute Replay, 09 Run Report, 10 Attempt Lineage, 11 Release Candidate and Publish, 12 Mode Atlas, 13 Compare, 14 Alpha Import}.dc.html`. There is **no separate HiFi** for P22 publication or an S11→R1 bridge. The publish card and the "what the Approval Inbox sees · R1 · RESEARCH EVIDENCE" mirror are blocks of HiFi 11, so they are audited under S11. (`upgrade/upgrade_frontend_plan_hifi/` only holds the Execution Loop HiFi; its "Gate R1 Review" screen is Execution, not Research.)

**Routes** (`apps/portal/frontend/src/research/screenRoutes.ts`, Unified §13):

| Screen | Route |
|---|---|
| S08 | `/research/quantbt/runs/:id/execute` |
| S09 | `…/runs/:id/report` |
| S10 | `…/alphas/:alpha/lineage` |
| S11 | `…/runs/:id/release-candidate`, plus `…/release-candidates/:rc` |
| S12 | `…/atlas#tab=modes\|routes\|claims` |
| S13 | `…/alphas/:alpha/compare?mode=attempts\|markets\|pair` (resolver `…/compare`) |
| S14 | `…/alpha-import` |

**Code lines evaluated.** Tags used in the tables below:

| Tag | Line |
|---|---|
| **both** | On both main lines. Both descend from `a00df203`. |
| **W** | Claude line `/home/bobby/portal-research-w1-build`: HEAD `d7db1cb3`, plus uncommitted `TopBar.tsx`/`shell.css` (topbar option A) and `AlphaImport.tsx` (the `--shadow-e1` token). The G5 S09 print fix (`d7db1cb3`), the G10 S10 tree order (`6a4cb383`) and the S14 receipt id (`49256a2a`) are **already committed** on W, not uncommitted. None of them is on C. |
| **C** | Codex line `/home/bobby/portal-research`. It is now at **`c2ec1443`**, not `2bfeb53e`: the 3 commits after `2bfeb53e` are docs/tests only. It contains the FG slices: FG-04a `b896d98d`, FG-05 `f0f7cc3d`/`ad404196`, FG-08 `a1d7bf3f`, D1-O1 `08fa8ee0`/`8ad39e83`, S14 token `602e8410`, and the bounded-replay reveal fix in `ExecuteCandleReplay.tsx` (merge `decb5f6c`). |
| **G1** | `.claude/worktrees/agent-afd8dfc9e6b74d586`, uncommitted: D7 play-across-folds. |
| **G3** | `…agent-ab5c79763ddadbbd8`, uncommitted: labels S05–S09/S11/S13. It overlaps C's D1-O1. |
| **G4** | `…agent-a12f335d67f8f4878`, uncommitted: S13 ladder grid, which competes with C's FG-04a, plus the G7 axe probe. |

**Audits and receipts read (not re-derived):**
- `evidence/HIFI_AUDIT_S00_S14_CLAUDE_2026-09-26.md`: the block lists 8.x–14-x.
- C `evidence/FG/FG-01-screen-audit-matrix.md`: the newest per-block audit, at `8783461e`, which contains `a00df203` (fixture lane).
- C `FG-owner-decisions.md` (VD-FG-*) and `FG-slice2-receipt.md`.
- Unified §13.4.1 E/F/G.
- `FRONTEND_GAPS_STATUS_CLAUDE_2026-09-30.md` §6–8.
- Records: E7 (`P20/E7_…`), E6 (`P10/E6_S14_HIFI…`), `P10/S14_REAL_WRITE_RECEIPT…`, `P18/G5_S09…`, `G10_WRITABLE_PREVIEW_RECEIPT…`, `P17/G1_D7…` (G1), `P20/G4_G7_…` (G4), `P19/G3_D1O1…` (G3).

**Spot-checked in code:** every "open" claim below that carries a file locator was re-read on the current tree.

**Verdict vocabulary**

| Verdict | Meaning |
|---|---|
| YES | Built as the HiFi draws it. |
| PARTIAL | Partly built. |
| NO | Not built. |
| DEV-A (id) | A deviation or decision that is approved or delegated. It counts as matched-by-decision, not as a gap. |
| DEV-U | A deviation recorded but not approved. |
| BE | Waits on a backend field. |

**Approval sources for DEV-A:**
- D1–D10: decisions Claude closed under the 2026-09-25 delegation; Bobby can veto.
- VD-P19-*, VD-P20-*, VD-P22-*, W5B D*, W6A-D*, X1-D*, DQ-*, CG-P07-*, RF-02 items: earlier recorded decisions, cited in the 09-26 audit.
- VD-RF04-01/02: approved 2026-09-30.
- The S14 E6 deviation table (#1–#12): approved 2026-09-30. That approval also resolves C's `VD-FG-01-31`.

VD-FG-* are **open** unless marked RESOLVED (only `VD-FG-05-02`, `-06`, `-07`, `-11` are resolved). VD-G4-*, VD-G7-01 and the G1 width deviation are **not approved**.

**Sizes:** S ≤ ½ day · M 1–2 days · L > 2 days.

---

## S08 — Execute Replay (HiFi 08)

| HiFi block | State | Where | Note |
|---|---|---|---|
| Title "Execute — the frozen params trading the tape" | DEV-A (W5B D12) | both | C's `VD-FG-01-15` re-asks for the HiFi title (open). |
| Header artifact line + COPY EVIDENCE LINK | PARTIAL / DEV-A (W5B D13) | both (E2a) | The copy link is built. The artifact line is decided out. |
| Route selector ×5, lens manager/quant/audit, scale demo | DEV-A (P17 §4.1, W5B D13) | — | — |
| Stitched-account fold chain | YES | both, `ExecuteCandleReplay.tsx` | The per-fold return is **computed in FE** (`end/start−1`, FG 08-06, P2). Per-fold `params prm_…` is BE `CG-FG-S08-01`. |
| IS/OOS/HOLDOUT band | YES | both (E2c) | Drawn from published bounds. |
| Candle chart + markers (WFO) | YES | both | — |
| Candle chart (P04 lane) | PARTIAL | both (E16-R1, `candle_overview`) | Overview strip only. Per-bar candles are BE `CG-FG-S08-02`. C also publishes a parallel `market_overview` that FE does not read; Bobby picks one. |
| Reveal geometry / no future candle | PARTIAL | W has a leak; **C fixes it** | W draws buckets whose `first_ordinal ≤ cut` and prints the full-run range. C keeps only whole buckets and a "revealed range" (`ExecuteCandleReplay.tsx` ~497–546). Take C's version at merge. |
| Price/position/equity panes + axes | YES | both (E2b) | — |
| Trade tape | DEV-A (W5B D14) | — | — |
| Transport `\|◀ ◀◀ ◀ ▶ ▶ ▶▶ ▶\|` + speeds | YES | both (E2a/b) | FG 08-03: P04 glyph meanings differ (P3). FG 08-04: default speed is 1× vs HiFi 4× (P3). |
| "play across folds" | YES / DEV-A (D7: default OFF vs HiFi ON) | **G1 only (uncommitted)** | 36 tests pass. The pill is 406 px vs 154 px because of the disclosure label: **DEV-U**. No real-API lane cell yet. |
| Readout `t · bar · seq · position · equity` | PARTIAL | both | WFO is fine. **P04 "state at cursor" still prints raw floats**: `ExecuteDetail.tsx:1648–1649` (`equity ${at.equity}`, `drawdown ${at.drawdown_fraction}`) and `:911` (FG 08-05, P2). The readout says `fold 0` where the chip says `fold_01` (08-16, P3). |
| Event / sample ledger | YES | both (E1/E2) | Formatted. `ExecuteDetail.tsx:378–379` prints raw values only inside the sr-only table. |
| Trade blotter · MAE×MFE · PnL distribution | DEV-A (W5B D14) | — | The PnL card is missing entirely instead of showing a typed absence (08-09, P3). |
| Trade anatomy (default selection, row click) | YES | both (E2a) | — |
| Cost timeline | YES | both | The window fee is summed in FE and the fee rate is raw (08-07, P2). |
| Verdict tiles (P04) | BE | — | `CG-FG-S08-03`. |
| Run label on a cold link (`R-P04-018`) | PARTIAL | **G3 only** | G13: S08 has no read that carries `display_label` on C. |
| a11y | PARTIAL | — | G7 axe finds `heading-order` (`<h3>` "execution contract"). Contrast is D-B1 only. |
| Bucket resolution (WFO 151/160 vs P04 47–48) | DEV-U | — | `VD-FG-04-02` / `-03` (eyebrow, wick-only candles) are open. S08-3/-4 caption formatting are debt. |

**Verdict:** layout-complete against HiFi within the decided deviations. Open FE: raw P04 state-at-cursor (S); FE-derived money and returns 08-06/08-07 (S); fold label and speed polish (S); PnL absence card (S); heading-order (S). Merge must take C's reveal fix and G1's switch. Open BE: `CG-FG-S08-01/02/03` and the overview field choice. Owner items: G1 pill width, `VD-FG-04-02/03`, `VD-FG-01-15`.

## S09 — Run Report (HiFi 09)

| HiFi block | State | Where | Note |
|---|---|---|---|
| No-print bar + exports | YES / DEV-A (X2-D09: Parquet/Archive disabled) | both | — |
| Title `R-WFO-### — …` | YES on C | C (`08fa8ee0` + `reportClient.ts` `rememberRunLabel`) | G3 duplicates this. **Do not merge G3's S09 part**: it reads `run.display_label`, while C serves the label at top level. |
| Meta line "from immutable artifacts … engine" | PARTIAL | both | Raw tokens `research.report-presentation.v1`, `RS02_RETAINED_CURRENT_SOURCE` (09-02, P3). |
| Certification box | DEV-A (W6A-D03) | — | — |
| PARTIAL notice (counts) | YES / DEV-U (`VD-FG-01-16`, FE counting) | both (E3) | — |
| Claim passport | YES | both | — |
| Identity rows | DEV-A (CG-P18-11, full digests) | — | — |
| P04 "declared, not executed" qualifier | YES | both (E14) | Real receipt PASS (G10). |
| Headline tiles incl. OOS RETURN | YES | both (E14) | `NET_RETURN` real receipt PASS. |
| Tile sign colours | PARTIAL | both | OOS Sharpe is coloured, but the HiFi keeps Sharpe in ink (09-04, P3). **`OOS_SHARPE` prints a hyphen-minus `-5.355`** while fractions print `−`: `researchFormat.ts:31,40` (Intl `GROUPED` for `currency`/`ratio`). This is shared (it also hits S13's big number and S10), S. |
| Metrics / warnings | DEV-A (P18 §4.1); print warnings `VD-FG-04-06` open | — | — |
| Equity: 6 rules, extremes labelled, fold marks, underwater + deepest | YES / DEV-A (VD-P20-27) | both; the G5 fixes are **W only** (`d7db1cb3`: deepest label hangs inward, x labels at equal time steps) | Fold marks print raw `fold_id` (`0`,`1`): `ReportDetail.tsx:683` (09-03, P2). The 6-rule grid has not been looked at on real data (G5 real half NOT RUN; the preview login was origin-blocked). |
| Per-fold verdict + footnote | YES | both | Δ decay has no red at >0.3 and no DRAG row tint, although `failed_criteria` is served (09-05, P3). |
| Certification chain | DEV-A (W6A-D03/D05) | — | — |
| Key artifacts | DEV-A (W6A-D07) | — | The equity series digest/path is BE `CG-FG-S09-02`. |
| Promotion state | BE P22+ (OL-03) | — | Typed absence. |
| Provenance + evidence link | YES | both (E14) | Verified on real data. |
| Footer "prints on letter or A4" | YES | both | — |
| Print Letter/A4 | PARTIAL | W (G5 D1–D4 fixes) + C (FG-04c probe spec `e4b9447e`) | Page counts are 4/4 on the fixtures. `VD-FG-04-04/05` (card split, multi-page vs one sheet) are open; G5 D4 already chose "flow". Real-run print NOT RUN. |
| 404 → neutral denied | YES | both | — |

**Verdict:** complete in structure. Remaining FE (all S): fold-mark labels; the minus glyph (shared formatter); decay tint; Sharpe colour; meta tokens. The real-data print re-check is still owed (G5 second half). Merge needs W's G5 commit plus C's label binding.

## S10 — Attempt Lineage (HiFi 10)

| HiFi block | State | Where | Note |
|---|---|---|---|
| Crumb `Attempt Lineage — alpha · market · tf` | DEV-A (D8: no market/tf) | both | C's `VD-FG-01-18` duplicates this (open). |
| Title / subtitle / source chip | YES / DEV-A (D8: chip names `PORTAL_PERSISTED_RESEARCH`) | both | — |
| Root card + links | YES | both | Extra links: `VD-FG-01-19` open. |
| Version band (chip, digest, entrypoint, outcome, attempt chips, ● has rc) | YES | both | `+N probes` is computed in FE (10-08, P3). |
| Exercised / untried + "declare at New Run" | YES | both | — |
| PROMOTION PICK banner | PARTIAL | both | The lineage pick is bound. The P22 pick states (PENDING_APPROVAL/WRITTEN/REJECTED) are not read (`VD-FG-05-05`, open). The `prm_` slot shows an approval digest: BE `CG-FG-S10-01`. |
| Run label `R-WFO-###` on pick/cards/rows | **NO** | neither line | `LineageDetail.tsx:594` `sid()` = `shortId()` only and bypasses `runLabels` (used at :956, :1082, :1308…). C fixed the same pattern in `CompareDetail` (`runLabelFor`) but not here. FG 10-11, P2, S (one line). |
| Filters + probe toggle + counter | DEV-A (VD-P19-01/07) | both | — |
| Status pill per node | PARTIAL / BE | both | The status is derived in FE: a FAILED attempt counts and shows as ACTIVE. Needs `CG-FG-S10-02` `lineage_status`. |
| Tree nested by parent + change note + diff vs parent | YES | both for E13 (real receipt PASS in G10); **depth-first order is W only** (`6a4cb383`) | Without W's fix, a clone draws under the wrong parent. |
| Full cards (spec line, diff, mini metrics) | YES / DEV-A (D-W6B-04: 3 dp) | both | Spec-line fallback prints raw `CLONE_FOR_EXPERIMENT · space …` (10-17, P3). |
| Selected panel, 5 rows + "weakest number, strongest claim" line | DEV-A (D8: technical rows in a disclosure) | both | Default selection = first card, not ACTIVE (`VD-FG-01-20`, open). Raw enums in the technical rows (10-21, P3). Claim family is BE `CG-FG-S10-03`. |
| Diff panel | YES | both | — |
| Promotion rule box | DEV-A (VD-P19-05) | — | — |
| Counts panel (not in HiFi) | DEV-A (D8) | — | — |
| PARTIAL screen notice | DEV-A (D8 removed the duplicate) | — | The notice still says the pick is "not published" while the banner shows a published pick (`VD-FG-01-22`, needs Codex semantics). |
| Rules footer | YES | both | — |
| Bounded history + load older | PARTIAL | both | Counts not mono; `mergeOlder` recounts in FE and sets COMPLETE (10-28, P3). Tree-empty copy is wrong when only the probe toggle hides rows (10-29, P2). |
| a11y — SUPERSEDED/ABANDONED dimmed rows | **DEV-U (Bobby)** | both | G7 axe: 12 non-D-B1 contrast nodes (1.91–3.88:1) from `opacity .82/.75` (`LineageDetail.tsx:380,417`). Proposed fix: `--ink-soft`, no opacity. |
| Gutter x=272 | NO | both | S10 is not in `OWN_FRAME_SCREEN` (`QuantBTModule.tsx:247`); x = 280 (X-2, P3). |

**Verdict:** structurally complete and nests correctly on real data (with W's fix). Remaining FE: the label bypass (S, the biggest visible miss); tree-empty copy (S); raw enums/fallbacks (S); bounded-note recount (S); gutter (S). Owner: dimmed-row contrast. BE: `CG-FG-S10-01/02/03`, P22 pick binding (`VD-FG-05-05`).

## S11 — Release Candidate & Publish, incl. the P22 publication / R1 bridge (HiFi 11)

| HiFi block | State | Where | Note |
|---|---|---|---|
| Crumb `Evidence Flow / R-WFO-### / RC & Publish` | YES on C | C (D1-O1, `releaseCandidateClient.ts`) | G3 duplicates this. |
| State chip + lifecycle | PARTIAL | both | Raw `SEALED_LOCAL NOT_DELIVERED · NOT_APPROVED` (11-03, P3). |
| NOT_PUBLISHABLE / unbound banner | YES (code) | both | NOT_RUN: no truthful fixture. |
| Lineage rail | YES | both | Selected params show the bundle digest + raw `TRIAL` (BE `CG-FG-S11-02`). |
| Frozen pack, 12 rows, sentence-case items | YES | both (E1 fixed the `th` uppercase, `.rc-pack .item` `text-transform:none`) | — |
| Pack header on one line, chips right | NO | both | No `margin-left:auto` on `.rc-packhead` (`ReleaseCandidateDetail.tsx:335`); chips wrap (11-08, P3). |
| Digests short `sha256:3fe4a1…` | PARTIAL | both | CSS ellipsis on the full value, not `shortDigest()`. Full 64-hex in the publish confirm and published card (11-10/15/17, P3). |
| Change taxonomy vs last published rc | BE P22 | C serves it; typed absence until a DELIVERED predecessor exists | — |
| YAML record preview | DEV-U (`VD-FG-01-23`: 17 keys, full digest, byte-for-byte) | both | — |
| copy yaml / local seal / publish CTA + confirm | YES / DEV-A (X1-D01/D05) | both | Publish retry after 503 has no second confirm (`VD-FG-01-24`, open). |
| **Publish write** (1 POST, typed refusals, re-read) | YES | **C only** (FG-05: 3 P22 ops, 401 → Frame 01D, 403 = 404, one POST in flight, re-read GET) | Missing from W entirely: `data-mirror-*` / `reportSessionExpired` have 0 hits in W's `ReleaseCandidateDetail.tsx`. |
| **Approval-Inbox mirror "R1 · RESEARCH EVIDENCE"** (raw vs effective status, pool, conditions, decisions, SLA, conflict link) | YES (fixture lane) | **C only** (FG-05 G5–G19; `VD-FG-05-02` resolved) | Open decisions: `VD-FG-05-04` (SLA absolute vs "4d 21h left"), `-08` (pool as user vs team name), `-09` (enum vs HiFi words), `-10` (raw/effective split), `-12`; `VD-FG-01-25` ("open in Approval Inbox" link). |
| FE-synthesised `P22_${state}` codes | NO (defect) | both, `ReleaseCandidateDetail.tsx:1977,2147,2157` | Prints a code that is not in the contract enum (11-26, P2, S). |
| Published card | YES | C | Full digests (P3). |
| Pack route (sealed) | PARTIAL | both | The identity card stretches about 380 px empty; raw SEALED_LOCAL (11-28, P3). |
| Real Delta→RunSync→R1 receipt (OL-05) and S11 browser acceptance on real data | NOT RUN | — | P22 is "backend real-preview done, product browser pending". No lane cell is VERIFIED on the real lane. |
| Gutter | NO | both | x = 280 (X-2, P3). |

**Verdict:** complete in code **only after C is merged**; W alone lacks the whole P22 consumer. Remaining FE (S each): `P22_${state}` synthesis; pack-header wrap; short digests; raw lifecycle words; identity-card stretch. The owner must close about 8 VD-FG items. The real R1 bridge receipt (OL-05) and a real-data browser S11 pass are still missing.

## S12 — Engine / Mode Atlas (HiFi 12)

| HiFi block | State | Where | Note |
|---|---|---|---|
| Crumb, title, subtitle, CURRENT chip, engine version | YES | both | The release block `min-w-[260px]` overruns by 3 px at 1280/1440 (`EngineAtlas.tsx:1176`, FG 12-02, P3). |
| Tabs modes / routes / claims | YES | both | `aria-controls` missing (P3). Replace vs push: `VD-FG-01-27`. |
| Mode cards, 3 columns | YES / **DEV-A (VD-RF04-01/02)** | both (E7 + RF-04) | 2,478 px vs HiFi 2,273; the rest is measured engine text. |
| Objective: one formula + disclosure | YES | both | — |
| `← this run` marker | YES (code) | both (E7) | NOT_RUN on a fixture with run identity. The fallback line is shown when progress has no identity. |
| Rule Two (CandidateSelector list) | DEV-A (E7 12-4, recorded) | both | BE `CG-FG-S12-02` if the list is to be printed. |
| Routes card (14 rows) | YES / DEV-A (D-1, VD-RF04, `VD-FG-01-28` column order) | both | Clicking an open row does not deselect it (R-15, P3). |
| Claims card (4 columns, never-claims gold, cert word, foot) | YES | both (E7) | **Product probe: "3 elements need sideways scroll" on the Claims tab** (G7 §2.4, `e2e/_probe-research-product.spec.ts:116–120`). The elements are not yet identified. Open, S. |
| Rules footer on every tab | YES | both | Copy drift vs HiFi (P3). |
| Historical release view | PARTIAL | both | The e2e fixture `atlas-historical.json` violates the DTO union and the subtitle still says er_111 (12-12, P2). |
| States | PARTIAL | both | 503 has no "read again" button (12-15, P2). 403/404 lose the request id (P3). A 404 selection-miss renders EMPTY (`VD-FG-01-29`, open). |
| 660 restack | YES | both | — |
| Gutter | NO | both | x = 280 (X-2, P3). |

**Verdict:** matches the HiFi by decision (RF-04 closed). Remaining FE (S each): the sideways-scroll finding; 503 recovery button; historical fixture/subtitle; `aria-controls`; 3 px overrun. No blocking gap.

## S13 — Compare (HiFi 13)

| HiFi block | State | Where | Note |
|---|---|---|---|
| Crumb `Runs / Compare` | PARTIAL | both | The alpha name is appended to the crumb (13-01, P3). |
| Mode segment | YES | both | — |
| Attempts ladder: 4 cards, `claim ↑ →` only between cards | YES, **two competing builds** | **C: FG-04a** (`b896d98d`, flex + clipped absolute arrow; header keeps "strongest claim on the right") · **G4** (grid + container queries, `n/N` tabs, `<ol>`, header "weakest claim first, strongest last") | G4 carries DEV-U VD-G4-01…04. C carries `VD-FG-04-01` (header wording, open). Bobby picks one. The merge conflict is about 6 hunks. |
| **Equal-claim connector wording** | DEV-U (open) | — | On the real alpha all 14–15 claimed attempts are one family, so every connector reads `claim ↑` between equal claims. Option: print `same claim →` when ranks are equal. The gold `ATTEMPTS_RULE` banner ("strengthens at every step") is also wrong at ≤900 px (G4 §6.1–6.2). |
| Density > 12 claimed attempts; unclaimed compact rows | DEV-A (D10) for compact rows; > 12 claimed is a Bobby item | both | 15 cards wrap to 4 rows at 1440. |
| Card head: short id + run label | YES on C | C (`8ad39e83` `runLabelFor` in `sid`) | Bare `rc_` link text (13-04, P3). |
| Claim line = family + sentence | YES | both (E7) | — |
| Big number + cert | YES / BE (`CG-FG-S13-02` grade) | both | Hyphen-minus `-5.355` (shared formatter). |
| Per-fold bars | YES | both (E7) | Axis reads `fold 1` vs HiFi `fold_01`; FE adds a `0` tick (13-06, P3). |
| Trajectory narrative + links to tree / rc | PARTIAL | both | Links are built (E7). The raw `P20_ATTEMPT_TRAJECTORY_V1` id is visible (`CompareDetail.tsx:1328`, P3). |
| Config diff | PARTIAL | both | Columns = claimed attempts (`ladderOrder`), 15 on real data, in a focusable scroll region. No cap; same density question. |
| Markets: one card per market | YES | both (E7/D10) | Real grouping verified (1 card). |
| Pair: overlay, deltas, ρ, weaker-claim, refusal guard | YES | both | pp shown as %; raw window/missing-policy tokens in one branch (`CompareDetail.tsx:1888`) (13-11, P3). |
| Resolver without alpha | YES | **C only** (FG-04a D-2) | — |
| 660 | YES | both | — |
| Gutter | NO | both | x = 280 (P3). |

**Verdict:** complete. The open items are one owner choice (FG-04a vs G4) and the connector/banner wording. FE polish is all S.

## S14 — Alpha Import (HiFi 14)

| HiFi block | State | Where | Note |
|---|---|---|---|
| Title + QUARANTINE/lifecycle chip + subtitle + meta | YES / **DEV-A (E6 #2, #3)** | both (E6) | — |
| Crumb `Journey / Alpha Import · next: New Run →` | YES | both | — |
| Stepper | YES / DEV-A (E6 #1, 3 steps) | both | Arrow keys / roving tabindex missing (14-04, P3). |
| Two columns: mirror + drop zone + entrypoint card | YES / DEV-A (E6 #4, #5, #7) | both | — |
| Mirror table 3 columns + rules foot | YES / DEV-A (E6 #6) | both | `quarantine_code` is not rendered (P3). |
| Pipeline gates | YES / DEV-A (E6 #8) | both | Timing via `toFixed(3) ms` (`AlphaImport.tsx:481`, P3). |
| Gate receipt id shown short | YES | **W only** (`49256a2a`) | C prints all 32 characters of a real `rgate_`+ULID. |
| Register / activate | YES | both | Real E2E parse→gates→register→activate PASS on a real server (W `P10/S14_REAL_WRITE_RECEIPT…`). |
| "new run with this av_ →" | DEV-A (E6 #9, OL-01) | both | The RUN_NOT_ADMITTED copy is stale (14-12, P2). BE `CG-FG-S14-03`. |
| Signed publication row | DEV-A (E6 #10) → **NO binding** | both | C now publishes `import_attestation`; FE still hard-codes NOT_PUBLISHED (14-09, P2). |
| Registry strip | YES / DEV-A (E6 #12) | both | Chip not linked to lineage (P3). No cap "top N / total" (G9, S; BE `CG-FG-S14-04`). Registry 503 has no retry button (14-18, P2). Empty-registry copy unreachable (P3). |
| Rules footer | YES | both (`AlphaImport.tsx:1319`) | — |
| Refusals | PARTIAL | both | Parse 403/404 banners print the raw `RESEARCH_*` code, so 403 ≠ 404 visibly (14-21/22, P2). **The origin refusal sentence misdescribes the cause**: `alphaImportClient.ts:248` "The import request is not valid…" is used for a 403 `RESEARCH_ALPHA_IMPORT_INVALID` origin denial (S14-C1, Bobby copy). |
| DRAFT note vs OL-01 sentence | DEV-U (S14-C1, Bobby copy) | both | `AlphaImport.tsx:70` "a DRAFT version can run as evidence…" contradicts `:121` "refuses a DRAFT as RESEARCH_RUN_ALPHA_NOT_ACTIVE". |
| Token gate (`--shadow-e1`) | YES | C committed `602e8410`; W uncommitted, same change | — |
| Gutter | YES | both | x = 272. |

**Verdict:** the HiFi deviations are approved and real writes are proven. Remaining FE (S each): two copy decisions (S14-C1); P2 refusal-code leak; registry retry; `import_attestation` binding; stale OL-01 copy; keyboard stepper. BE: `S14-RW-BR-01..03` (replay-after-activate 500, FAIL row, 201 vs 200), `CG-FG-S14-01..04`. OL-01 still blocks running an imported alpha.

---

## Cross-screen

| Item | State | Note |
|---|---|---|
| Shell crumb `Research / … / R-label / screen` | YES (D1, `c81e8dc2`) + topbar option A (W uncommitted) | Visual baselines for Research laptop will change: `VD-FG-07-01` (8 drifts). G6 re-run is still pending. |
| Gutter 272 vs 280 for S09–S13 | NO (P3, S) | Add those routes to `OWN_FRAME_SCREEN` (`QuantBTModule.tsx:247`). |
| Minus glyph | NO (S) | `researchFormat.formatMetric` currency/ratio use hyphen-minus. It hits S09, S10, S13 (and S08 tooltips). |
| Server prose in refusal details | DEV-U (`VD-FG-01-01`, P1 weight, open) | Mostly S05–S07; blocks 15 FG-07 runner cells. |
| D-B1 `--ink-faint` | DEV-U (token step) | 2,389 axe nodes. |
| Real-API lane | not re-run | F3 54/54 is owed after merge and rebuild. The FG fixture lane is not a real receipt. |

## Remaining HiFi gaps, sized (after consolidation)

| Screen | Merge needs | FE gaps (owner Claude) | Owner decisions still open |
|---|---|---|---|
| S08 | C reveal fix + G1 | P04 raw state-at-cursor (S); FE money/return (S); fold label / speed / PnL card / heading-order (S) | G1 pill width; VD-FG-04-02/03; VD-FG-01-15 |
| S09 | W G5 + C label | fold-mark labels (S); decay tint (S); Sharpe colour (S); meta tokens (S); real print check (S) | VD-FG-01-16; VD-FG-04-04/05/06 |
| S10 | W tree order | label bypass `sid()` (S); tree-empty copy (S); raw enums (S); mergeOlder (S) | dimmed-row contrast; VD-FG-01-19/20/22; VD-FG-05-05 |
| S11 | **C FG-05 (whole P22 consumer)** | `P22_${state}` (S); pack header / short digests / lifecycle words / identity stretch (S) | about 8 VD-FG (SLA, pool, enums, confirm, link, YAML) |
| S12 | — | sideways scroll (S); 503 retry (S); historical fixture (S); aria-controls (S) | VD-FG-01-27/29 |
| S13 | FG-04a **or** G4 | trajectory id / fold axis / pair units / crumb (S) | ladder build; equal-claim wording; > 12 density |
| S14 | W receipt-id fix | refusal code leak (S); registry retry (S); attestation bind (S); stale copy (S); keys (S) | S14-C1 (origin sentence, DRAFT note) |

**Total open FE:** about 30 items, all S (about 3–5 days together). There is no L and no missing HiFi block that is undecided. Everything still NO is P2/P3 polish or a single-line fix (S10 labels, the minus glyph, the gutter).
