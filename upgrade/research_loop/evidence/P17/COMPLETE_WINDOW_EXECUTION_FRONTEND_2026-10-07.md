# WEX — completed windows and native execution: frontend receipt (Claude, 2026-10-07)

Handoff: [`COMPLETE_WINDOW_EXECUTION_CLAUDE_HANDOFF_2026-10-07.md`](./COMPLETE_WINDOW_EXECUTION_CLAUDE_HANDOFF_2026-10-07.md); backend receipt:
[`COMPLETE_WINDOW_EXECUTION_BACKEND_2026-10-07.md`](./COMPLETE_WINDOW_EXECUTION_BACKEND_2026-10-07.md). Lane `claude/fe-parity`, base `716000f8`.
Frontend only: no backend, engine, seal, deployment flag or protected-kernel file was touched; no run was created by this work; every request this work
makes is a GET (asserted by the e2e).

**Status: frontend CONNECTED and actual-API verified for the four operations; the Research visual gate (30 cells, laptop + mobile) compares clean with no baseline re-recorded.
Not product/release acceptance.**

## What was connected (all four named operations, no hand parsing)

| Operation | Consumer | Where |
|---|---|---|
| `researchWindowAnalyticsGetV1` | `windowExecutionApi.analytics`, `useWindowAnalytics` (one read per window/fold, aborted on run change, never polled) | **S04 Overview** `WindowAnalyticsPanel` for IS and Holdout (and a Walk-forward fold's IS); **S09 Report** collapsed supplement |
| `researchWindowObservationsGetV1` | `windowExecutionApi.observations`, `WindowReplayCard` (keyset-paged ≤ 200 rows, cursor stack keyed to the selector) | **S08 Replay** "Complete window · retained bars and engine journal" |
| `researchNativeExecutionRecordsGetV1` | `windowExecutionApi.records` (FILL for markers, any kind for the journal table) | **S08 Replay** (open on arrival for a native route, one click otherwise) |
| `researchWindowCompareGetV1` | `useWindowCompare`, `WindowCompareSection` | **S13 Compare**, pair mode, window and engine fold in the URL beside `runs`; nothing asked until a window is picked |

Files: `windowExecutionClient.ts`, `windowAnalyticsView.ts`, `useWindowAnalytics.ts`, `useWindowCompare.ts`, `WindowCompareSection.tsx`, `WindowReplayCard.tsx`,
`WindowAnalyticsSupplement.tsx`; edits in `EvidenceFlow.tsx`, `EvidenceFlowRoute.tsx`, `EvidenceCharts.tsx` (`WindowCompareChart`, `WindowReplayChart`), `CompareRoute.tsx`,
`CompareDetail.tsx`, `ExecuteRoute.tsx`, `ExecuteDetail.tsx`, `ReportRoute.tsx`, `ReportDetail.tsx`, `replayClient.ts`, `tsconfig.json` (contract alias).

## Rules kept (from the handoff)

- **Window semantics.** Completed Three Window Holdout is a complete account (`FROZEN_PARAMETER_POST_SELECTION_ACCOUNT`); a Walk-forward IS is read by the engine
  `fold_id` (never the one-based display ordinal) and is worded as a *post-selection training diagnostic, not one stitched IS account*; a Walk-forward has no independent Holdout
  (`NOT_APPLICABLE · WFO_PROTOCOL_HAS_NO_INDEPENDENT_HOLDOUT`, never an RBAC lock). Fold is sent only on a Walk-forward run (the verdict rows exist and `protocol_disclosure` does not); a native
  Three Window run refuses a fold. IS is asked only after the lane (and so the protocol) is known.
- **Typed absence everywhere.** 25 facts per block, each a value or `NOT_PUBLISHED`/`NOT_APPLICABLE` with its reason and tooltip (origin, scope, source ref, input digest). A record field absent in the source
  says `not published` (the server guarantees null ⇔ `missing_fields`). An unpublished journal relation (ORDER on intrabar) is `NOT_PUBLISHED`, not "0 orders"; a published empty journal says it is empty.
- **Old seals** that never kept their companion stay a typed absence; sampled legacy facts are drawn only under a one-line note, never promoted to complete history.
- **Fills** are drawn at the actual fill price and source bar, beside the candle body (offset), with distinct glyphs (entry ▲, take-profit ◆, stop-loss ■, other ●). Stop / take-profit are step lines that **break** where
  the engine published none. The engine encodes "no level" as `"0"` while the account is flat (115 of 168 Bracket bars), so a level is drawn only while a position is open and the level is a positive price
  (finding BR-S02-19 below). No parent/child/OCO connector, no level from a tag, no price where the source gave none.
- **Compare** shows each run's own descriptor and facts side by side. The browser publishes **no** delta and merges **no** curve (two series on independent time axes); correlation is the server's exact shared-UTC-ms value
  or a typed N/A (`WINDOW_COMPARE_CONSTANT_RETURN_SERIES`), never 0.
- **Report supplement** is collapsed, says it is not part of the sealed report and that the report's pinned revision is unchanged, reads only when opened, and enters no seal, RC or export.
- **Native copy.** On a native route the equity-sample panel and the "not published" block now say they describe the *equity-sample read* and point to the engine journal; non-native copy is unchanged.
- A cursor is never reused across a selector change: the page stack is keyed to the selector (a unit test pins that the very first render after a window change asks without the old cursor — a real bug found and fixed here).

## Evidence

Real preview API (images as rebuilt by Codex for WEX; Vite proxy from this lane's source), GET-only, `_preview-research-wex.spec.ts`: **16/16 PASS at 1280 and 660**
(8 cases × 2): Overview Three A IS/Holdout, OOS unchanged; Walk-forward fold IS with `fold_id=1` for display fold 2 and Holdout N/A; pre-WEX Bracket V3 seal typed absence; Compare A/B on IS/Holdout/OOS
(URL restored on reload, constant-series correlation N/A, no delta column); Bracket V4 Replay (BUY `63557.1` qty `0.03146776677979329` fee `0.9999999999999999` `entry` at 2026-06-12 16:00Z, SELL `65209.5846` `take_profit`
at 2026-06-14 21:00Z, ORDER `ENGINE_EXECUTION_RELATION_NOT_PUBLISHED`); Reactive / Event-driven one fill each with `not published` for the rest; Three Window Holdout readable, Walk-forward Holdout N/A, fold IS pages 200 of 792
and back; Report supplement. No console error, no failed request (the Report's existing linked-audit reader answers its handled typed 409), no non-GET request, no horizontal scroll.

Runs: Three A `rrun_729c3604…`, Three B `rrun_1aeb8159…`, Walk-forward `rrun_6f7e63ce…`, Bracket V4 `rrun_c2329924…`, Reactive `rrun_fbf968c1…`, Event `rrun_9f127033…`, old Bracket V3 `rrun_ea0e06b9…`.
Unit: `windowAnalytics.test.tsx` (19), `windowCompare.test.tsx` (11), `windowReplay.test.tsx` (10) plus the existing Overview / Compare / Replay / Report suites unchanged and green; tsc clean.

## Not done / open

- **Visual:** `scripts/portal-web-visual.sh e2e/research-loop.visual.spec.ts` in the pinned image: **30 passed, 0 re-recorded**. The new surfaces do not appear in any existing cell (the Replay card and the Report supplement are collapsed, IS/Holdout/Compare windows are not part of a cell), so there is no baseline for them: the real-API screenshots at 1280/660 are the only visual evidence, and no new baseline cell was added. The two S02 cells that failed were a fixture gap (the new `version-options` read was unstubbed), fixed in the spec (`64e0f934`, `fa4b58cd`), not by touching an image.
- **Pending-run Holdout protection** (`RUN_NOT_COMPLETED_WINDOW_PROTECTED`) is unit-pinned as a typed absence but was not observed on a real pending run (none was available).
- **Limit / OCO Alpha** has no real run: the journal table shows only fields the source publishes and DTO support is not claimed as browser acceptance.
- S06 pruned / 6400 paging and the P24 73-cell matrix on the new bundle remain open.

## Backend finding (BR-S02-19, for Codex; no action taken)

`observations[].payload.active_stop` / `active_take_profit` are the string `"0"` (not `null`) while the account is flat (Bracket V4: 115 flat bars `0|0`, 53 in-position bars with real levels). A level of 0 is not a level; the
frontend suppresses it by rule (position open and level > 0). If the engine means "none", publishing `null` with the field's typed absence would remove the need for that rule.

## Update 2026-10-08 — BR-S02-19 consumed, clean rebuild, S06, matrix

- **BR-S02-19 (Codex `9ea01f89`)**: Replay draws the served `active_stop` / `active_take_profit` (null breaks the line) and prints each level's typed state under the chart; `source_value` is never drawn; the position-bound rule stays only for a server that serves no
  `active_level_availability`. Real API on the clean rebuild: Bracket V4 = **115 flat bars → null (`NOT_APPLICABLE / POSITION_FLAT`), 53 open bars → exact prices (`AVAILABLE`)**; the page line reads "Stop · 53 bars drawn · 115 not applicable (position flat)" (e2e asserted).
- **Clean preview** rebuilt from `938fa74d`, running images = built tags. `_preview-research-wex.spec.ts` **16/16 on the served bundle at 1280 and 660** (no Vite).
- **P24 matrix on that bundle**: 613 PASS / 0 FAIL / 69 NA — see `../P24/FE_SCREEN_ACTION_MATRIX_RERUN_2026-10-08.md`.
- **S06**: a real-API spec on two 400-trial runs with PRUNED trials found and fixed a pruned trial drawn as `0.00` (BR-S02-20, §46). 6,400-row paging, pending-run Holdout and a real Limit/OCO run still have no real run and are not claimed.
- The Replay card, window compare and Report supplement are `no-print` (interactive explorers, not part of a printed document).
