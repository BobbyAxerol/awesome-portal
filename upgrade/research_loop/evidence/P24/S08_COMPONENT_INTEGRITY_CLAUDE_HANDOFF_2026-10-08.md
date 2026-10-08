# S08 — Accepted component integrity: Claude frontend handoff

2026-10-08 · Bobby owner instruction · source baseline `ace069ee`.

## Assignment and verdict

Bobby reports that the two S08 charts do not follow the accepted component
composition. **Codex owns backend only for this follow-up; Claude owns all
frontend/component fixes**, including the remaining §51 setup mappings.
No frontend source, theme, chart implementation or visual baseline is changed
by this handoff. No engine rerun, migration, runtime change or remote push.

The earlier S08 browser receipt proves real API/data mapping, actual
parent/OCO/lifecycle rendering and basic browser checks. It does **not** prove
accepted HiFi/component/visual integrity. That frontend gate remains open;
API success or absence of console errors must not be relabelled visual PASS.

## Read before changing frontend

1. Unified §13 rules and the latest owner addendum linking this packet;
   `CLAUDE-FOR-thanhvuong.md` A13.1–A13.4.
2. `release-v1.1/docs/screens/08_s4_execute.md`, including the test matrix,
   and **`release-v1.1/QuantBT 08 S4 Execute Replay.dc.html` in a browser**.
   The spec names lightweight-charts v5 for candle replay; accepted chart,
   marker, transport and theme components are the presentation authority.
3. P17 `COMPLETE_WINDOW_EXECUTION_CLAUDE_HANDOFF_2026-10-07.md`,
   `BR_S02_19_ACTIVE_LEVEL_ABSENCE_2026-10-07.md`, and all later S08 consumer
   amendments. Retain explicit observation-versus-execution distinctions.
4. [§51 actual run, generated contracts and limitations](./LIMIT_OCO_MULTICYCLE_SHARED_PREVIEW_AND_CLAUDE_HANDOFF_2026-10-08.md).
   The immutable P10 qualification packet linked there is not editable.

## Screenshot issues and concrete source locations

| Surface | Current implementation | Required Claude outcome |
|---|---|---|
| “Complete window · retained bars and engine journal” | `WindowReplayCard.tsx` lazy-loads `EvidenceCharts.tsx:WindowReplayChart`, an ECharts candle/scatter implementation | Reuse the accepted S08 candle/marker composition instead of maintaining a second inconsistent candle renderer; keep window/journal data and typed states. |
| “OOS observation replay — market and account” | `ExecuteDetail.tsx:FixedObservationPanel` uses `ExecuteCandleReplay.tsx:FixedCandleChart` | Fix the overlapping date/OHLC/count readout shown in Bobby's screenshot; use the existing accepted header/legend and responsive component rules. |
| Large grey fill circles | `EvidenceCharts.tsx:windowReplayOption` scatter series | Use the approved glyph/legend language, near the appropriate candle, with the actual fill timestamp/price available in the tooltip. Do not guess entry/exit or PnL from side alone. |
| Market/equity/native position | Existing fixed/native chart uses distinct data units | Preserve correctly separated scale/pane semantics and the accepted transport; don't combine account/position/market units into one misleading scale. |
| Two panels for the same OOS range | Observation replay and execution journal have different authorities | Reconcile the composition within the accepted S08 design. Do not delete the journal, fabricate fills in the observation lane, or introduce another design to hide the duplication. |

Relevant existing components: `ExecuteCandleReplay.tsx`, `ExecuteMarkers.tsx`,
`chartContract.tsx`/chart-contract helpers and the shared chart/theme wrappers.
Reuse presentation, not a semantic shortcut: existing transition markers are
**not** native order/fill identities. Keep their data adapters separate. Any
genuine HiFi/spec disagreement needs a recorded COR/owner decision, not a
silent layout or baseline change. Final component composition belongs to
Claude, not a new design prescribed by Codex.

## Backend contract to consume, without inference

Generated authority: `packages/contracts/generated/research-window-execution.d.ts`.
Consumer: `windowExecutionClient.ts`; exact named reads are:

- `researchWindowObservationsGetV1`: `GET /api/v1/quantbt/runs/{runId}/windows/observations`.
- `researchNativeExecutionRecordsGetV1`: `GET /api/v1/quantbt/runs/{runId}/execution/records`.

Carry the same `workspace_id`, explicit `window`, applicable `fold_id` and
revision. Respect ≤200-row/1-MiB pages and opaque selector-bound cursors.
“200 of 432” is a loaded page, not the whole loaded window. Journal pagination
is independent: don't treat its first page as the complete journal or infer
absence when a fill belongs to another page. Reset/abort on selector changes;
no request/engine job per animation frame, hover or play tick.

`NativeExecutionRecord` publishes actual source-backed fields including
`price`, `fill_price`, `trigger_price`, `working_price`,
`working_trigger_price`, `order_id`, `target_order_id`, `parent_order_id`,
`oco_group_id`, `activation_policy`, `reduce_only`, `status`, `event_name`,
`exit_reason`, and UTC-ms lifecycle timestamps. `missing_fields` gives typed
source absence; nullable fields are not invented values. Use these typed
relationships, not ID suffixes, row adjacency or prose parsing. Preserve exact
decimal strings in disclosures; rendering conversion must not overwrite DTOs.

Observation `active_level_availability` controls `active_stop` and
`active_take_profit`: unavailable levels are null; `source_value` is provenance,
not a level to draw. The screenshot's 108 flat / 92 not-published observations
do not prove that the native journal lacks protective orders. Conversely,
journal order-intent prices do not by themselves prove per-bar active levels.
Don't paint continuous SL/TP lines from an order price without source-backed
activation/cancel/fill state. If a necessary fact or time association is absent,
file a reproducible backend request with the generated field and source row.
The title must retain “engine audit, not a broker record” semantics.

## Other pending frontend mappings owned by Claude

- `dataDeclarationV2.ts:RecipePins.family`: derive from the generated recipe
  type and accept `NATIVE_OPTIMIZED` (the current hand-maintained union omits it).
- Two `NewRun.tsx` Parameters/Review `fixedNative` predicates: native input
  existence is not fixed-input authority. Preserve the old fixed optimizer
  `NOT_APPLICABLE_FIXED_DELTA_INPUT_NOT_SCALAR_OPTIMIZER`; distinguish the new
  `PINNED_QUANTBT_NATIVE_IS_SHARPE_V1` searched recipe.
- Consume available native optimization summaries on Progress/Evidence/Split.
  Detailed native S06/S07/full Report is **not delivered** by §51; retain the
  exact typed unsupported states and report missing backend, not a fake scalar
  WFO ledger, certificate or sampler trace.

## Real run and exit gate

Use the existing completed run; **do not rerun the engine for UI changes**:

[S08: `rrun_ee50cb82d6de9e495e10b32323b62f8c`](https://research-portal.primusspark.com/research/quantbt/runs/rrun_ee50cb82d6de9e495e10b32323b62f8c/execute?workspace_id=ws_06GCVTHWC9WVPGEPR85AB15K82).

100 real trials / 21 chosen-realization parent cycles / 84 orders / 42 fills;
OOS 2026-08-03→2026-08-21 UTC, end-exclusive. These are not 100 independent
product-run journals. Native Holdout is unexecuted and remains typed absence.

Claude closes this frontend slice only with:

1. Targeted typecheck and affected component/adapter tests, including old
   fixed-native behavior, pagination/selector changes and null/zero distinctions.
2. Rebuild **web only when frontend source changes**, identify served bundle
   and image, preserve existing shared backend/DB/runtime and historical runs.
3. Browser comparison of both HiFi and the product at 1280/660 px; no overlapping
   labels, consistent accepted candle/marker components, responsive panel
   composition, keyboard/transport and no console/network/document overflow.
4. Real-API screenshots/assertions for actual Limit/OCO links/lifecycle and
   page navigation; typed flat/missing protection and unexecuted Holdout stay
   honest. Keep screenshots/session files private, journal only hashes/locators.
5. Update the Unified Plan and this packet with the **actual** component/visual
   and API receipts; record any remaining backend request with exact expected /
   actual DTO. No broad re-record, hidden fallback or P24/release claim.

Work through the established FE lane onto `docs/research-loop-plan`; commit
only owned frontend/evidence paths, preserve concurrent backend work. No
dev/main/production change or remote push without Bobby's instruction.

## Ready-to-send prompt

> Claude — Bobby assigns S08 frontend/component correction to you; Codex stays
> backend-only. Read this packet, Unified's latest owner addendum, S08 spec +
> HiFi in a browser and the linked P17/§51 handoff chain. Reuse the accepted
> candle/marker/transport components; fix the two inconsistent panels, overlapping
> readout and fill glyphs without changing approved design or inventing facts.
> Finish the listed NATIVE_OPTIMIZED/fixedNative mappings. Use the linked
> completed 100-trial run for 1280/660 real-API and HiFi visual receipts; rebuild
> only web, not engine/backend. Missing DTO facts become named backend requests.
> Update Unified/evidence and report what truly passed; don't call the earlier
> functional browser receipt visual acceptance or claim P24/release completion.
