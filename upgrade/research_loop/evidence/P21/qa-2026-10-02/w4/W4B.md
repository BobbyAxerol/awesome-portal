# W4B — S04 hub: tab = summary (base bfbf5ca4)

Decision (Bobby 2026-10-02): hub tab = summary card, deep dive = full body.

- `hubStageSummary.tsx` (new): `StageSummaryCard` (Split/Search/Freeze/Execute) = heading + `stageChip` + facts from reads already loaded
  (hub fold navigation, window disclosure, dataset coverage; progress snapshot trials and the fold's selection, else the retained lane's
  global selection, else the hand-off cursor that names the fold) + primary `Open S5..S8 ... →` link built by `runLinks` (cursor + window).
  `AtlasSummaryCard`: mode/schedule/route cell + `Open S12 Atlas →`.
- Removed: the four embedded deep-dive mounts, `StagePreviewTab`, `AtlasTab`, `hubStage*.tsx` + their tests (nothing imports them).
- Not-sealed run (queued/running/failed/cancelled/attention, no retained evidence): header + one `SealNotice` (banner + exits); tabs only for
  stages that started (DONE/RUNNING); no Summary/Claim/Atlas tab, no claim passport, no cursor bar, no stage nav.
- Shell: claim passport shows claim, certification, execution contract + ONE `N not published` count (names + reason in tooltip, focusable);
  raw tokens humanised (`not issued`, `complete`); passport note -> one word with engine/registry in tooltip; header meta -> `created ...` with
  engine/adapter/route in tooltip; tab sub-label = stage state word only; Promotion SOON cell removed; cursor bar: unserved trial/params/seq
  -> one muted `cursor: fold N · window OOS`, schedule chip and S1-S4/journey links dropped; one `<h1>` (run) on the hub.
- Summary: retained passport no longer repeats final equity / account return / max drawdown; Sharpe/Sortino dropped from the
  strategy-vs-benchmark cells (Sharpe = hero tile, Sortino = Behavior); `Engine trades: N` sentence removed, its number + scope is the
  `Trade count` tile's tooltip (`data-engine-trades`, `data-trade-scope`); drawdown episodes top 3 on the hub (`limit` prop; S09 unchanged).
- Reset: `useEvidenceCursor.reset` returns to the arrival cursor (keeps the tab); `EvidenceFlowRoute` uses the progress `handoff_cursor`
  when published; the progress read is now asked on the four stage tabs too.
- `w4ShimW4B.ts`: local `humanise` with W4A's contract (swap for `./humanise` when W4A lands).
