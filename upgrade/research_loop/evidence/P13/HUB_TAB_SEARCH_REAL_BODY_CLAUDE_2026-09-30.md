# Screen 04 · Search tab draws its real body (Claude, 2026-09-30)

Base: `784bb19d` (integrate/research-loop-2026-09-30). Uncommitted worktree change; the coordinator merges it.

## Defect

On `/research/quantbt/runs/:runId/evidence#stage=search`, the hub rendered `StagePreviewTab`. It showed a stage row and four boxes that said "not published — the Evidence Hub publishes this stage's timeline, not its content. Screen 06 reads it." That text was wrong in two ways:

- HiFi 04 (`QuantBT 04 Evidence Flow.dc.html`, `sc-if isSearch`) draws the whole Search stage inside the tab: configuration, candidate funnel, selection decision, progression chart, lineage and trial ledger.
- Screen 06 already reads and draws that same data for the same run and cursor.

## Fix (reuse, no new reads)

- `SearchDetail.tsx` · `SearchScreen` accepts a new optional prop, `embedded`. When it is set, the screen leaves out `SCREEN_FRAME`/`max-w-[1560px]` and the header (breadcrumb, h1/subtitle, AsOf, copy evidence link), and marks the root with `data-embedded="hub"`. The screen still makes the same reads and draws the same panels, footer and `data-*` attributes. With `embedded=false`, the JSX is the same as before.
- `SearchRoute.tsx` accepts `embedded` too. When it is set, the route leaves out `RouteCursorNotice` (the hub has its own) and passes `embedded` down. It still takes `:runId` from `useParams` and the cursor from the hash (`useEvidenceCursor`), which the hub shares.
- New `hubStageSearch.tsx` exports `HubSearchBody`, which renders `<SearchRoute embedded />` inside `[data-hub-stage-body='search']`.
- `EvidenceFlow.tsx` gets one new branch in the tab switch for `search`. The branch keeps the HiFi h2 "Stage 2 · Search — why these params" and its subtitle (`TabHeading`), keeps the "open deep dive → 06 Search" link, and renders `<HubSearchBody />`. The other preview stages still use `StagePreviewTab`.

## Tests

- New `src/research/hubStageSearch.test.tsx` has 2 tests and loads the real captures `w3bRealWfo.fixture.json` and `w3RealWfo.fixture.json`.
  - Hub test: the Screen 06 blocks render inside `[data-panel='search']` (source strip, claim row, mode `mode_1_decay`, schedule `global`, inspection). Inside the embedded body there is no header, h1 or back-to-hub link. `[data-stage-shells]` is absent and the "timeline" sentence does not appear.
  - Standalone test: `/search` still has the header, back-to-hub href, h1 and `max-w-[1560px]`, and has no `data-embedded`.
- `evidenceFlow.test.tsx` · P13-T05 "carries the cursor into a deep dive…" had asserted the preview's `[data-carried-cursor]` line, which no longer exists on the Search tab. The test now stubs fetch and waits for the embedded read to settle; without that wait the console guard fails it with an act() warning. The cursor is still asserted through the deep-dive link's `fold=4`.
- Results: 7 files, **284/284 pass** (hubStageSearch 2, searchDetail 65, searchFoldStrip.g8 41, searchStageB.e5 15, searchSurface.x2 11, evidenceFlow 115, evidenceFlow.rf05 35).
- `npx tsc -b --noEmit`: 0 errors outside `features/roadmap-task-board`.

## Browser check (Vite dev on :5242, proxy to preview :8095)

| Shot | Run | Width | SHA-256 (first 16) | Checks |
|---|---|---|---|---|
| hub Search tab | R-WFO-017 `rrun_17f76212…` | 1440 | `dc5ff7ce5d2d88e4` | 12 S06 panels, no preview sentence, no h-scroll |
| hub Search tab | R-WFO-017 | 660 | `36b417f3e0aaad82` | same, no h-scroll |
| hub Search tab | R-P04-018 `rrun_464bf9c3dd8979af87e44388ea6910ef` | 1440 | `d40a30daf0ea730a` | typed not-applicable panels with reason codes |
| hub Search tab | R-P04-018 | 660 | `909212ea50321ec4` | no h-scroll |
| deep dive `/search` | R-WFO-017 | 1440 | `fffcd63ad930d693` | header + h1 present (unchanged) |
| deep dive `/search` | R-P04-018 | 1440 | `3458b176b160bdfd` | header + h1 present (unchanged) |
| HiFi 04 Search tab | demo | 1440 | `13d2bfac506c6d9f` | reference |

The P04 id in the task (`rrun_464bf9c38b3c…`) returned 404. The real R-P04-018 id came from `GET /api/v1/quantbt/runs?limit=50`.

## Remaining differences vs HiFi 04 Search tab

- Layout: HiFi uses three cards (configuration / funnel / decision), then the chart, lineage and ledger. The tab now uses Screen 06's accepted layout: mode×schedule card, claim row, Stage A | Stage B columns, ledger. It is richer than the HiFi tab, and the tab is longer (about 2970 px at 1440 on WFO-017).
- The HiFi's right-hand pill "fold N · OOS a → b" next to the heading is not drawn. The deep-dive link sits there instead.
- The HiFi's lineage chip row (trial → candidate → params → freeze → OOS → claim) is not part of Screen 06 and is not drawn.
- The progression chart has no schedule switcher. A run has one schedule, and Screen 06 shows it read-only by design.
- Two readiness cells now show on the hub: the hub header's (`COMPLETE`) and Screen 06's (`partial`/`READY`). They describe different reads, and both were already on screen before this change.
