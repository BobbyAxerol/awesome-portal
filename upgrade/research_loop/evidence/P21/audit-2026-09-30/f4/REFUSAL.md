# F4 · GROUP REFUSAL (VD-FG-01-01, 04-AC)

Decision (Bobby 2026-10-01): the server's sentence is no longer printed in a refusal/absence note. Reason-code chip + request id on screen; the sentence is `title` + accessible name.

## Items
- DONE `RefusalNote` (ResearchPanel.tsx): fixed sentence + code chip (`[data-refusal-code]`) + `request_id` (`[data-refusal-request]`); wrapper `[data-refusal-detail]` has `title` = server sentence, `role="note"`, `aria-label` = "code — sentence — request_id".
- DONE `StateNotice` `<details>` (ResearchPanel.tsx): replaced by the same chips when the state came from `refusalState`. A hand-built `state.detail` with no diagnostics keeps the old `<details>` (other callers/tests untouched).
- DONE researchRefusal.ts, additive: `RefusalDiagnostics`, `ResearchStateWithDiagnostics`, `refusalDiagnostics()`; `refusalState` now also returns `diagnostics`. `refusalDetail()` and `state.detail` unchanged.
- DECISION APPLIED (F-04): for neutral 403/404 refusals (no code, RESEARCH_WORKSPACE_FORBIDDEN, or a *_FORBIDDEN / *_NOT_FOUND surface code) the sentence is NOT offered even as a tooltip (it can name an owner/workspace). Code + request id stay. Typed lane codes (e.g. NOT_ADMITTED) keep the tooltip.
- Typed absence: no code/sentence/request id -> no chip row at all; nothing invented.

## Tests
- NEW `src/research/researchPanel.refusal.test.tsx` (9): value path, no-code path, absence path, F-04 neutral (4 cases), panel notice with/without diagnostics.
- Changed prose assertions only: evidenceFlow.test.tsx (P13-T06), freezeDetail.test.tsx, splitDetail.test.tsx, searchDetail.test.tsx -> chip text + title, text must not contain the sentence.
- vitest src/research: 94 files, 2220 tests pass. Full `vitest run`: 1 flaky failure (searchF2 "names the cursor fold...") under load; passes alone (13/13) and in the src/research run. tsc -b: clean (excl. roadmap-task-board).

## e2e expectations updated (NOT run)
- `e2e/_probe-research-rf01.spec.ts` S05 503 cell: `[data-research-detail]` details -> `[data-refusal-detail]` chip, code text, title regex, sentence absent from text.
- `e2e/_probe-research-product.spec.ts`: S04 passport (~l.1216), S05 fold (~l.1463), S07 retained (~l.1746): `toContainText("does not admit")` -> chip code `RESEARCH_CURRENT_SOURCE_NOT_ADMITTED` + title regex.
- `_probe-p23-matrix` `noServerProse` (the 15 runner cells, VD-FG-01-01) needed no edit: it asserts the sentinel is absent from `body.textContent`, which a `title` attribute satisfies. Cells for S01, S04-S07 should now go green; not run.
- `_probe-research-rf01.spec.ts` denied cell (l.~186) unchanged: its reason-line check still holds (chips are the 3rd child span; neutral denial has no title).

## Browser (Vite 5325, real run R-P04-018 + injected refusals via page.route on /api only)
- 503 split, 1440 and 660: notice = UNAVAILABLE / fixed sentence / `RESEARCH_SPLIT_UNAVAILABLE  request_id rq-demo-503`; title carries "upstream split reader timed out"; innerText has no server prose; no horizontal overflow.
- 404 NOT_ADMITTED on freeze, 1440 and 660: chip + title, no leak, no overflow.
- 403 EVIDENCE_FORBIDDEN: no tooltip (F-04), no `ws_quant_desk` anywhere in innerText.
- Real runs currently refuse nowhere on S01-S07, so the chip appears only under injected refusals. Screenshots (outside git): scratchpad/refusal-shots/after-*.png. No "before" captures taken.
- Words on the refusal notes: before = fixed sentence + `(code · server sentence · request_id X)` (about 25 extra words); after = fixed sentence + code chip + `request_id X` (server sentence 0 words on screen).

## Not touched, outside my files (follow-ups for the owning group)
- `EvidenceFlow.tsx` ~2299: S04 passport cause branch prints `refusalDetail(refusal)` (code · server sentence · request id) as inline text. Needs the chip treatment (`refusalDiagnostics` + same markup).
- `AlphaImport.tsx` ~998/1081: server sentence inside a collapsed `<details>`; pinned by alphaImport.f1.test.tsx (`data-refusal-details`). Left alone.
- `RefusalChips` is not exported; if EvidenceFlow wants it, export it from ResearchPanel.tsx.

## Backend requests
None.
