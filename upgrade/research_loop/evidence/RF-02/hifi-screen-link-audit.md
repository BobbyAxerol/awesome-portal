# HiFi release-v1.1 vs build — screens and links (2026-09-23)

Bobby asked: "the branch is at P16 on the frontend, why is there so little UI?"
This file answers that and is the checklist for the screen-by-screen review.

Method: every `QuantBT NN *.dc.html` in `upgrade/research_loop/release-v1.1/`
rendered in Chromium at 1440px, every anchor to another HiFi screen collected;
every built route opened on research-portal (commit `361f68b4`, run
`rrun_80d3c2f4cd15e8a3b04c7f8e2adee9ed`, COMPLETED) and every anchor in `<main>`
collected. Links that only appear after a click inside a HiFi (a later step, a
different tab) are not in the HiFi column.

## 1. Why it looks small

| Reason | Effect |
|---|---|
| HiFi has **15 screens**; this branch builds **10** (00–07, 12, 14). | 08, 09, 10, 11, 13 are not here. |
| S08 Execute Replay (P17) and S09 Run Report (P18) exist **only** on `feat/thanhvuong/research-p17-p21` (+5,335/−110 in the frontend, 34 commits ahead, 18 behind this branch). | Not merged here, so not on research-portal. |
| S10 Lineage (P19), S11 Release Candidate (P21), S13 Compare (P20) are **not built on any branch**. Backend + typed contract are complete for all three (Unified §13: `S10/S11/S13_…_PENDING_CLAUDE`). | Buttons "Generate report → 09" and "Release candidate → 11" on S04 are disabled. |
| The Journey Map (S00) reads the server descriptor `apps/control-api/src/research/journey.descriptor.ts`, last changed at P09 (`cac85b43`). It still marks New Run, Run Progress, Trial Review, Evidence Pack, Compare and Release Candidate `PLANNED`. | The front door says **SOON** for screens that already work. Its 10 cards also don't match the HiFi's 15-screen map. |
| S03–S07 are per-run: the only way in is **open evidence →** on a run card in S01. | Nothing in the header or on the Journey Map leads there. |

## 2. Screen matrix

| HiFi | Phase | Route | This branch | Links in HiFi that the build is missing |
|---|---|---|---|---|
| 00 Journey Map | P09 | `/journey` | built · stale descriptor | 15 screen cards + 7 deep-dive cards → build has 10 cards, 8 disabled |
| 01 Run Library | P12 | `/runs` | built | journey map ↗ · attempt lineage (10) · rc_ chip (11); RUNNING card → 03 (build sends every card to 04) |
| 02 New Run | P10 | `/runs/new` | built | runs of this av_ → 01 · import new version → 14 · lineage → 10 · see where this lands → 11 |
| 03 Run Progress | P11/P14 | `/runs/:id/progress` | built | breadcrumb Runs → 01 |
| 04 Evidence Flow | P13 | `/runs/:id/evidence` | built | journey map ↗ · run report → 09 (disabled) · promotion → 11 (disabled); stage deep links are tab buttons in the build (fine) |
| 05 S1 Split | P14 | `/runs/:id/split` | built | hash carries `stage=summary` where the HiFi carries `stage=split` |
| 06 S2 Search | P15 | `/runs/:id/search` | built | same hash-stage point |
| 07 S3 Freeze | P16 | `/runs/:id/freeze` | built | next: S4 Execute → 08 · sibling attempt → 10 |
| 08 S4 Execute Replay | P17 | — | **thanhvuong branch only** | — |
| 09 Run Report | P18 | — | **thanhvuong branch only** | — |
| 10 Attempt Lineage | P19 | — | **not built** | — |
| 11 Release Candidate | P21 | — | **not built** | — |
| 12 Engine Atlas | P09/RF-02 | `/atlas` | built | "open demo → 06" per mode: the build sends to `/runs?mode=` when no run is chosen (spec 12 T03, recorded decision) |
| 13 Compare | P20 | — | **not built** | — |
| 14 Alpha Import | P07 | `/alpha-import` | built | Journey → 00 · next: New Run → 02 |

## 3. Already visible without opening a HiFi

- S04 summary metrics print full engine precision (`19965.998848845535`,
  `-0.00154494124018563545…`): readable only as a wall of digits. The HiFi
  shows formatted values; the rule against abbreviating is about blotters.
  Needs a decision: display precision per metric unit, full value on hover or copy.
- Header "Runs (1)" counts the legacy library, not the 6 runs S01 shows.

## 4. Who does what

**(a) Bobby decides**
1. Merge `feat/thanhvuong/research-p17-p21` (S08, S09) into this branch so
   research-portal shows them? It is Thanhvuong's accepted work: merging
   needs his/your go-ahead, and the preview then runs his code too.
2. Journey Map: rewrite the descriptor to the HiFi's 15-screen map (Codex's
   file, backend change) or have the frontend draw the HiFi map itself?
3. Metric display precision on S04 (§3).

**(b) Claude, no wait**
1. Links whose target exists: 01 journey map ↗; 02 runs of this av_ → 01,
   import new version → 14; 04 journey map ↗; 14 Journey → 00, next: New Run → 02;
   01 RUNNING card → 03; 05/06 hash `stage=`; header Runs count.
2. Links whose target does not exist yet render as disabled with the phase
   that delivers it, not as dead anchors.
3. Screen-by-screen HiFi review with Bobby, one row of §2 at a time.

**(c) Waiting**
- S10/S11/S13 frontend (P19/P20/P21): backend ready, frontend pending Claude,
  not started. Order after S08/S09 land.
- Journey descriptor, if (a)2 goes to Codex.
