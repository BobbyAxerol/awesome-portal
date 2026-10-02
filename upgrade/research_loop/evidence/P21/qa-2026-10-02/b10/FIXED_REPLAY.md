# B10 FIXED_REPLAY — S08 fixed/imported observation replay (2026-10-02)

Base 8fc17a03. Operation `researchFixedReplayObservationsGetV1`,
`GET /api/v1/quantbt/runs/:runId/replay/observations`.

- replayClient.ts: `replayApi.fixedObservations` (limit capped 200, opaque
  cursor, read-only), generated types re-exported, `FIXED_ROUTE_NOTE`,
  `fixedPageServesRows`, `fixedFreshAbsence`.
- useReplay.ts: `fixed` slot, asked once after the hub answers a
  RETROSPECTIVE_EQUITY_ONLY route; later pages only on the reader's "later";
  "earlier" steps over loaded pages (no request); one bounded 409 recovery;
  failed later page keeps loaded pages. Not counted in `requestCount`.
- ExecuteCandleReplay.tsx: `FixedCandleChart` (candles, one step line per native
  position key, equity; readout/crosshair on playhead; entry animation gated by
  smokeMotionAllowed; no marker layer, no orders/fills).
- ExecuteDetail.tsx: `FixedObservationPanel` added UNDER the legacy equity-sample
  panel; `TransportBar` generalised (ordinalLabel). Market symbol chip separate
  from native position-label chips. Fresh-absent run: chip with the server code.
- Absent / not-applicable / not-recorded / refused: nothing drawn; legacy lane and
  "equity samples only" unchanged (visual baselines unaffected).

Tests: executeFixedReplay.test.tsx (new, canonical fixtures + typed 5-page
builder); executeReplay.test.tsx U07 reads now route the fixed read apart.

NEEDS-SHARED: tsconfig.json path alias `@portal/contracts-research-fixed-replay-companion`
(currently a type-only relative import in replayClient.ts).
Open: hub card still lists `candle_windows` as not published by the P04 hub next to
the fixed panel (the hub body says so); not rewritten here.
