# RS-02 frontend handoff — current-source S04–S08 client integration

**Backend state:** `BACKEND_COMPLETE · FEATURE_DARK`. This is a consumer
contract handoff, not approval to enable a feature, touch a runtime container,
change a database, or replace rich product composition.

## Read and regenerate first

1. [RS-02 report](./phase-report.md), [coverage matrix](./field-action-coverage-matrix.md)
   and [Unified RS-02 row](../../../UNIFIED_IMPLEMENTATION_PLAN.md#rl-rs-02).
2. P13–P17 original handoffs plus the Astra remediation guide.
3. The S04–S08 HiFi HTML/spec **in a browser** at 1280px and 660px before
   altering a product component.

```bash
npm --prefix packages/contracts run generate:research-current-source
```

Consume only generated named operations from
`packages/contracts/generated/research-current-source.d.ts`:

- `researchCurrentSourceEvidenceGetV1`
- `researchCurrentSourceEvidenceSeriesGetV1`
- `researchCurrentSourceSplitGetV1`
- `researchCurrentSourceSearchGetV1`
- `researchCurrentSourceFreezeGetV1`
- `researchCurrentSourceReplayGetV1`

Do not define manual DTOs, parse raw server strings, decode/recreate a cursor,
send a table kind/source ordinal/artifact locator/relation ID, compute returns
or dates in the browser, or call QuantBT/worker/artifact/Execution/Trading
System directly. The only replay playhead input is a previously minted opaque
`at` token. On a typed cursor failure, discard it and do one explicit fresh
read—never retry in a loop.

## Composition rules

- Retain every rich HiFi shell, card, fold anatomy, ledger and replay layout.
  Replace only the contents of the individual panel that lacks a fact.
- Render returned exact decimal strings and UTC milliseconds as server facts;
  do not round/recompute or make a chart sample look like a metric source.
- Do not expect raw fold/candidate payloads: those remain private P05 custody
  metadata. Use the generated structured fields and at most 24 parameters;
  never add a browser fallback that opens or mirrors an unbounded payload.
- For all `NOT_PUBLISHED`, `NOT_APPLICABLE`, legacy, pending, 400/401/403/404/
  409/503 cases, preserve the panel and use the project typed-error grammar.
  Never replace the route with a generic unavailable page.
- S07 `MATCH` is only `PORTAL_RETAINED_MANIFEST_ROW_COUNTS_AND_BATCH_RECEIPT`.
  It is not an artifact-byte, causal-order, strategy-selection or broker pass.
- S08 is retrospective model data only. Local play/pause may move within an
  already loaded bounded result; no network call per animation frame and no
  invented order/fill/candle/execution-account state.
- Keep demo/fixture visual lanes visibly marked and entirely separate from a
  product-route response. No fixture may populate an omitted current-source
  field.

## Browser acceptance required for RS-03

For every S04–S08 route, record
`HiFi element / interaction / product component → generated operation/field →
typed state → browser assertion`, at 1280px and 660px. Cover loading,
available/partial, pending, legacy, source gap, 400/401/403/404/409/503,
hard-refresh/deep link, keyboard/focus and overflow. Distinguish component
fixture, product route and real API evidence. Do not re-record broad visual
baselines to mask unrelated drift.

Return one `CG-RS02-*` request only when a specific source-supported fact is
absent from the generated contract, including the exact source locator and
expected/actual typed shape. Do not change RS-02 backend files in the shared
worktree; report a conflict before touching them.
