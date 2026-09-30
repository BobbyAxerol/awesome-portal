# Screen 04 · Split tab draws its real body (Claude, 2026-09-30)

Base: `784bb19d` (integrate/research-loop-2026-09-30). Uncommitted, left for the coordinator to merge.

## Defect

The Split tab on `/research/quantbt/runs/:runId/evidence` (Screen 04) rendered
`StagePreviewTab`. That component shows a stage-state row and four `SourceGap` boxes, each reading
"not published — the Evidence Hub publishes this stage's timeline, not its content. Screen 05 reads it."
HiFi 04 (`QuantBT 04 Evidence Flow.dc.html`, `isSplit`, L320–409) draws the whole stage inside the
tab: the fold timeline, the holdout, the fold table, inner-validation containment and stitched OOS
provenance. The sentence was also untrue. Screen 05 reads that data for the same `:runId`, and
it draws it too.

## Fix (reuse only, no new reads, nothing inferred)

- `SplitDetail.tsx`: `SplitScreen` takes `embedded?: boolean`. When it is set, the component skips
  `SCREEN_FRAME`/`max-w-[1440px]` and the header (breadcrumb, h1/subtitle, as-of,
  copy-evidence-link), and it marks the root `data-embedded="hub"`. Every body block, data attribute
  and the rules footer stay the same.
- `SplitRoute.tsx`: the reads and the fold clamp move into an exported `SplitRouteBody`, which takes
  its cursor from the caller. `SplitRoute` still owns `useEvidenceCursor({stage:"split"})` and
  `RouteCursorNotice`, and it renders the same DOM as before.
- New `hubStageSplit.tsx`: `HubSplitBody({runId, cursor, onFold})` renders
  `SplitRouteBody … embedded`. **It is driven by the hub's cursor, not a second hook.**
  `useEvidenceCursor` writes the hash with `replaceState`, which fires no `hashchange` event. Two
  hook instances on one page would drift apart: a fold-row click would move the hash but not the
  hub's fold chip. The browser check confirms the fix: clicking fold_02 in the tab updates the hub
  tab label to "DONE · fold 2".
- `EvidenceFlow.tsx` (local to split): `StagePreviewTab` takes an optional `body`. When `body` is
  given, it replaces the stage row, the shells and the "carries …" line. The tab h2
  "Stage 1 · Split — fold construction", its subtitle and the "open deep dive → 05 Split" link stay.
  The switch has one new branch: `cursor.stage === "split"`. Search, freeze and execute are
  untouched.

## Tests

- New `src/research/hubStageSplit.test.tsx`, 5 tests. It uses the real fixtures
  `w3RealWfo.fixture.json` and `w3bRealWfo.fixture.json`, the same ones splitDetail and
  evidenceFlow load. It checks four things:
  - the body blocks render inside `[data-panel='split']`: fold construction, protocol, 2 fold rows
    and the retained holdout;
  - the "publishes this stage's timeline" sentence, the stage row and the shells are gone;
  - the h2 and the deep-dive link are kept, with no h1, breadcrumb or cursor notice;
  - a fold row calls the hub's `onFold(2)`.
  It also checks that the deep-dive route still has its h1, back-to-hub link, max-width frame and
  footer, with no `data-embedded`.
- `evidenceFlow.test.tsx` FE-S04-11: one assertion changed. It used to read `[data-stage-state]` from
  the split tab's preview row. That row is gone, so it now reads the same enum from the tab label
  (`[data-tab='split'] [data-tab-sub]` = "DONE · fold 1").
- Run: hubStageSplit + evidenceFlow + evidenceFlow.rf05 + splitDetail + composition →
  **5 files, 285/285 passed**. `npx tsc -b --noEmit`: clean.
- Not run: `npm run build`, the pre-commit hook, visual and lane suites (out of scope by instruction).

## Browser (Vite 5241 → preview API 8095; server stopped, temp config deleted)

| shot | run | sha256[0:16] |
|---|---|---|
| hub split tab 1440 | R-WFO-017 `rrun_17f7…` | `e91bf1b87333208c` |
| hub split tab 660 | R-WFO-017 | `3c721477039efe64` |
| hub full page 1440 | R-WFO-017 | `3df1d2360fab79d8` |
| hub split tab 1440 | R-P04-018 `rrun_464bf9c3dd8979af87e44388ea6910ef` | `179d1192c53a5e45` |
| hub split tab 660 | R-P04-018 | `eb0d1181a5dc595e` |
| deep dive `/split` 1440 (unchanged) | R-WFO-017 | `2339648f89674e74` |
| HiFi 04, Split tab 1440 | synthetic | `38d716b34c5f902a` |

The P04 id given in the task (`rrun_464bf9c38b3c…`) returns "Run not available". The id above
comes from the run list and matches `g8RealP04.fixture.json`. None of the pages scrolls
horizontally at 660; the fold table scrolls inside its own card, as the HiFi's does.

## What the tab shows now vs HiFi

On R-WFO-017 the tab shows:
- the heading and the deep-dive link;
- the protocol strip (advanced walk-forward · weekly · expanding, GLOBAL);
- the S1 fold construction timeline: 2 folds, holdout n/a with a P10 reason;
- the S2 θ* flow;
- the fold table with IS/OOS Sharpe and decay;
- boundary integrity, stitched-OOS provenance and "what this stage feeds forward".

On R-P04-018 it shows the three-window version: a warmup/IS/OOS strip, the holdout, a single IS/OOS
row, and "not in read" cells.

## Remaining differences vs HiFi

1. The screen-level blocks from Screen 05 sit above the timeline (protocol strip, provenance
   disclosure) and below it (S2 θ* flow, boundary-integrity card, "what this stage feeds forward",
   "rules of this screen" footer). The HiFi tab has only timeline → table → containment/stitch.
   Following "nothing else changes", these blocks were kept. The footer's words "this screen" read
   oddly inside the hub; hiding the footer under `embedded` is a one-line follow-up for the
   coordinator to decide.
2. The HiFi puts the fold table (2/3) beside the containment and stitch cards (1/3). The embedded
   body uses Screen 05's layout: a full-width table, then three cards below it.
3. The HiFi shows a gold "SEALED · LOCKED" hatched holdout and "inner ⊂ outer IS — VERIFIED". The
   real runs publish no holdout on WFO (P10 n/a) and no inner folds. Screen 05 renders those
   absences honestly, and nothing is invented.
