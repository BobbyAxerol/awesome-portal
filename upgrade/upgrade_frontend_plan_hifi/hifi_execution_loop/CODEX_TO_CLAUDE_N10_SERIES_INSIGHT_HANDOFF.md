# Codex → Claude — N10 Series / Insight Contract Handoff

Backend status: `CONTRACT_COMPLETE / PRODUCTION_INACTIVE`.

Canonical consumer entrypoints:

- `packages/contracts/generated/execution-analytics-series.d.ts`;
- `packages/contracts/fixtures/execution-analytics.equity-projection.valid.json`;
- six `execution-analytics.insight-{line,histogram,funnel,waterfall,heatmap,bar}.valid.json` fixtures;
- `packages/contracts/fixtures/execution-events.corpus.valid.json`;
- `packages/contracts/openapi/execution-analytics-series.openapi.json`.

Claude may now implement exact readers/renderers:

1. line keeps nulls disconnected and renders explicit gaps;
2. approved band comes only from returned run/digest lineage;
3. histogram/funnel/waterfall/heatmap/bar use their semantic series, never a line substitute;
4. browser never recomputes conversion, waterfall totals, coverage, aggregation or currency sums;
5. `INSUFFICIENT_DATA` and `UNAVAILABLE` remain honest tile states;
6. `execution.event.v1` is a string; reject integer version and discriminator/payload mismatch.

Do not call the two route paths in product mode: they are intentionally
unmounted with `runtime_active=false`. Keep SMOKE until the generated reader
and all six renderer fixture tests land. Then remove `alpha360.smoke.ts` in
that same frontend commit; do not leave a silent fixture fallback.

Recommended parallel frontend slice:

- discriminated `InsightSeries` reader from generated types;
- one renderer test per canonical kind fixture;
- EquityChart canonical fixture test for null gap, band and raw decimal tooltip;
- ten-event consumer parity test;
- tracker update without claiming live/source activation.

Evidence and non-goals:
`upgrade/backend/EX_BE_07_N10_SERIES_AND_INSIGHT_ANALYTICS_CONTRACTS.md`.

