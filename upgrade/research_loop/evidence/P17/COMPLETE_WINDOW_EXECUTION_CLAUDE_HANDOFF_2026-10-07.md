# WEX — completed windows and native execution: Claude handoff

Scope approved by Bobby: backend §44, Overview / Compare / Replay / native
execution. This is a frontend integration handoff, not product/release approval.
No frontend file or visual baseline was changed by Codex. Backend receipt and
qualification status are linked from the §44 queue before delivery.

[Backend receipt: actual runs, final OCI IDs, custody and source limits](./COMPLETE_WINDOW_EXECUTION_BACKEND_2026-10-07.md).
Backend APIs are ready on isolated research preview; the unchanged frontend
bundle does not yet consume these reads. Do not mark frontend DONE from this.

## Read first / authority

1. `AGENTS.md`, Research A13 working rules, Unified §13 and queue §44.
2. This packet and its final backend receipt.
3. `packages/contracts/openapi/research-window-execution.openapi.json` and
   `packages/contracts/generated/research-window-execution.d.ts`.
4. The owning S04/S08/S09/S12 specs + HiFi, current consumers and latest Claude
   commits. Preserve accepted layout, tokens, typography and compositions.

Generate mechanically with `npm run generate:research-window-execution` in
`packages/contracts`; never hand-parse server strings or reconstruct order/PnL.
The existing OOS API is not a substitute for the new complete-window reads.
Foundation's generated `PortalAdmission` also includes the additive profile
`p10.delta-intrabar-bracket-fixed-1h.v4`; keep V1–V3 run identities unchanged.
If regenerating the complete catalogue, use the repository generation targets,
not an independently maintained profile enum.

## Named same-origin reads (all authenticated / workspace-scoped)

| operationId | Path | Query / meaning |
|---|---|---|
| `researchWindowAnalyticsGetV1` | `/api/v1/quantbt/runs/{runId}/windows/analytics` | `workspace_id?`, `window=IS\|OOS\|HOLDOUT\|FULL_SAMPLE`, `fold_id?`; one full-population analytical block |
| `researchWindowObservationsGetV1` | `/api/v1/quantbt/runs/{runId}/windows/observations` | same scope + `limit` 1–200, opaque `cursor?`, exact `at_utc_ms?`; complete retained observations, not a display sample |
| `researchNativeExecutionRecordsGetV1` | `/api/v1/quantbt/runs/{runId}/execution/records` | same + `record_kind?=ORDER\|FILL\|TRADE\|COMMAND\|ORDER_REPORT\|LIFECYCLE`; actual engine journal only |
| `researchWindowCompareGetV1` | `/api/v1/quantbt/windows/compare` | `runs=rrun_left,rrun_right`, `workspace_id?`, explicit same `window`, optional same `fold_id`; independent account scopes, no forward fill |

Use generated `WindowExecutionPage`, `WindowDescriptor`, `WindowAnalytics`,
`NativeExecutionRecord`, `WindowCompare`. `rows` is discriminated by `kind`;
each row has exact `window`, `fold_id`, source ordinal and UTC milliseconds.
`revision` binds the P05 companion to the original requested/effective/profile/
dataset digests and sealed manifest. `next_cursor` is bound to actor, workspace,
run, operation, window, fold, filters, limit and revision. Never reuse it after
changing any selector; reset the page. Pages are at most 200 rows / 1 MiB;
maintain bounded frontend memory, request only visible/detail scopes and abort
obsolete requests. All responses are private/no-store.

## Window semantics / UI integration

- **Completed optimized Three Window:** IS, OOS and Holdout are separately
  retained, evaluated accounts. `AVAILABLE` is authorized only after the run is
  `COMPLETED`. The Replay navigation's Holdout `access_basis` is
  `COMPLETED_THREE_WINDOW_RETAINED_ACCOUNT`. A pre-completion read returns
  `NOT_PUBLISHED / RUN_NOT_COMPLETED_WINDOW_PROTECTED`, never leaked rows.
- **WFO:** OOS is the complete stitched account. IS is selected by actual
  `fold_id` from Split's `fold_plan.folds` and evaluated using that fold's frozen
  selected parameters on its exact engine training interval. Its authority is
  `FROZEN_PARAMETER_POST_SELECTION_TRAINING_DIAGNOSTIC`: this is not the original
  optimizer trial trajectory, not an independent stitched IS equity, and must
  not be described as untouched evaluation. Training windows overlap; never
  sum them. There is no independent WFO Holdout: render **Not applicable**,
  `WFO_PROTOCOL_HAS_NO_INDEPENDENT_HOLDOUT`, not an RBAC lock.
- **Full-sample:** read `FULL_SAMPLE`; IS/Holdout are not independent windows.
- **Fixed native profiles:** current child retains IS/OOS; it does not execute
  the declared Holdout. It remains typed `NOT_PUBLISHED /
  FIXED_NATIVE_PROFILE_DID_NOT_EXECUTE_HOLDOUT`, not falsely completed/available.
- **Old immutable seals:** if the companion bytes were never retained, show
  `HISTORICAL_WINDOW_EXECUTION_CUSTODY_NOT_RECORDED`. Do not promote sampled
  curves or summaries into complete history, or rerun/overwrite an old seal.

Overview S04/S09: add/consume the scope selector inside the existing rich
composition. Every number, equity/DD series, monthly return, distribution and
episode uses the selected window/fold block. There are 25 individually typed
metric facts, including explicit absence for audited trade count where an
account series cannot supply it. ALL TIME means the full selected retained
window, not rolling or only the current chart page. The 64-point display curves
are documented presentation samples; analytics are computed at writer time on
the full population. Use observations for detailed Replay/crosshair. Keep
metric origin/input digest/scope in evidence tooltips.

S09 supplemental views must stay distinct from an immutable sealed Report's
pinned revision. No silent report/RC regeneration or relabeling.

Compare S12: one shared window selector, explicit fold for WFO IS; do not mix
IS of one run with OOS of the other. `correlation` uses exact common UTC-ms
return observations in local custody, not sampled curves. Constant or too few
matched returns are typed N/A, never a zero correlation. Absent scope on either
side stays explicit; do not fall back to OOS silently.

## Native journal, marker and bracket rules

Records carry source relation and **relation-local** ordinal, not a fabricated
global causal sequence. Source supplies may include order/target/parent/group/
OCO/trade IDs; side/type/TIF/activation policy/status/event/reason; working and
filled quantities/prices/trigger; fee and realized PnL; bar/sequence; source
activation/cancel/fill/expiry/open/close UTC timestamps. Each nullable absent
field is named in `missing_fields` with `SOURCE_FIELD_NOT_PUBLISHED`.

- Treat `COMMAND`, `ORDER_REPORT`, `LIFECYCLE`, `FILL`, `TRADE` as distinct facts.
  A command is not a fill; trigger, order price and execution price differ.
- Draw markers at the actual retained **fill price and source bar** near the
  candle body with small pixel offsets. No high/low of an unfinished bucket,
  no y=0 for missing price. Distinct glyphs for entry/exit/SL/TP; accessible
  tooltip preserves full exact decimal, side, source relation and bar clock.
- SL/TP diagnostic active levels may be drawn from observation
  `active_stop`/`active_take_profit`; missing levels do not create horizontal
  lines. Parent/child/OCO connectors require actual IDs; never infer a tree
  from adjacent rows or tags. In the pinned intrabar facade those IDs may not
  be published even though actual exit reasons/fill prices/levels exist.
- LIMIT/STOP/TRIGGER/activation/cancel UI shows only the actual record fields;
  the built-in Delta recipes do not create every possible order type. Typed
  DTO support alone is not positive browser acceptance for a Limit/OCO Alpha.
- `execution_availability` is retained source publication evidence per record
  kind: a present empty source journal is true empty; a relation not published
  remains `NOT_PUBLISHED`, not `0 orders`. Native records are engine simulation
  audit, **not broker lifecycle replay**. Preserve route-specific known-close /
  next-open or next-close labels.
- Bracket V4 corrects sizing via a new pinned adapter; original V3 descriptors,
  adapter bytes and old zero-fill results stay unchanged. Do not relabel an old
  run as V4 or insert new fills into it.

## Required frontend exit gates

Real run examples:Three A `rrun_729c36043209ed38a4a966b90f85568a`, Three B
`rrun_1aeb8159b2ed7560d4df1a58651f61e7`; WFO
`rrun_6f7e63ce32cbbe57698e5f4c883201f8` (fold0/1/2:792/960/1128 IS bars).
Bracket V4 `rrun_c2329924a32a26e8d9d5bf9d5c1f809a`:entry fill_price `63557.1`,
fill_qty `0.03146776677979329`, filled_at_utc_ms1781280000000; exit
fill_price `65209.5846`, filled_at_utc_ms1781470800000, exit_reason `take_profit`.
ORDER is source NOT_PUBLISHED, not zero. Reactive
`rrun_fbf968c1075a2b020a03bd04fd7a8024`, Event
`rrun_9f127033d7ed4ccd4692d0be1f6aec53`:old sealed alias fields may stay
absent; their raw source price/qty are still available. Respect missing_fields,
never rewrite old DTO rows. Exact final API responses are in private packet
`/home/bobby/.local/state/portal-research-p23/window-execution-20261007/final-readback/`.

1. Unit/typecheck: all four generated operations + scope/absence/error paths;
   no hand parsing, zero substitution or silent window fallback.
2. Real preview: fresh completed Three IS/OOS/Holdout on Overview / Compare /
   Replay; pending Holdout protected; WFO fold IS explicitly diagnostic and
   independent Holdout N/A; historical missing custody caption.
3. Real native: Bracket V4 / Reactive / Event-driven journal pages, exact fill
   prices and exit reasons/clock; absent OCO/IDs/relations stay absent; cursor
   page changes do not duplicate/skip records.
4. Browser at 1280 + 660 and owning HiFi: body-adjacent markers, keyboard and
   accessible tooltips, no console warnings or failed same-origin requests.
   Update only affected baselines through the canonical visual script and
   approved visual scope; do not blanket re-record Execution/Planning.
5. Record run IDs, exact runtime images, API revision, screenshots, truth vs
   absent fields, and receipt path in the owning packet + Unified. State
   frontend DONE only after product-route actual API receipt, not fixtures.

## Copy/paste prompt for Claude

```text
Claude — integrate the completed-window/native backend in Research §44.
Read this handoff and its backend receipt, then generated
research-window-execution.d.ts + the owning HiFi/specs and recent FE commits.
Keep accepted rich UI; do not modify backend/engine/seals or deployment flags.
Consume all four named same-origin operations above, not sampled OOS summary
as IS/Holdout. Completed Three Holdout is available; pending stays protected;
WFO IS is per-fold post-selection diagnostic and WFO Holdout is N/A.
Connect Overview/Report scope views, Compare window selection, Replay detailed
observations/native records. Position actual fill markers beside candle bodies;
render SL/TP/Limit/activation/OCO only from typed source facts. Missing stays
typed; commands are not fills and native audit is not broker replay.
Follow the five frontend exit gates above. Record receipt and any new backend
request in the owning evidence packet + Unified. Work in the current FE lane,
normal hooks/own paths; no push/merge/main/dev/release unless Bobby asks.
```
