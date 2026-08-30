# Codex → Claude: N25 Query and Analytics Handoff

Status: canonical contracts complete; signed dev deployment pending.

## What frontend may consume

Use generated type
`packages/contracts/generated/execution-query-analytics.d.ts`, strict schema
`execution-query-analytics.v1.schema.json` and fixture
`execution-query-analytics.empty.valid.json`.

The four authenticated BFF routes are:

- `/api/v1/execution/deployments/:deploymentId/query-analytics`;
- `/api/v1/execution/alphas/:alphaId/query-analytics`;
- `/api/v1/execution/portfolios/:portfolioId/query-analytics`; and
- `/api/v1/execution/live-gates/:approvalId/query-analytics`.

Frontend may replace matching derived smoke/fixture blocks only after the
selected dev profile reports N25 active. Until then, keep the canonical typed
unavailable state.

## Rendering rules

- Display server-provided exact decimal strings; never sum, correlate or derive
  financial truth in the browser.
- Keep relation and currency partitions separate.
- Render `chart_series` from `chart-series.rules.v1`; do not resample again.
- Treat `EMPTY`, `PARTIAL` and `UNAVAILABLE` as distinct product states.
- Show capability `reason_code` in diagnostic/empty-state copy, not raw source
  payload or hashes in the primary visual hierarchy.
- Replay markers and trade-log rows share journal identity; candles remain
  unavailable until a real market-data source is added.
- Live may be valid and empty. Never present an empty Live profile as an error
  or fabricate Paper data into it.

## Honest source gaps

N25 deliberately leaves market candles, benchmark rho, cross-profile canary
drift and broker ACK latency unavailable because Manager-v2 does not publish
those exact semantics. Their codes are stable for UI handling. N28, not the
browser, owns any future adapter.

## Claude parallel work

Claude can now bind the canonical response to Paper Workbench, Alpha 360,
Portfolio 360, Account/Binding exposure and Live-gate diagnostics; verify
loading/stale/partial/unavailable/empty states at compact and comfortable
density. Do not add a second frontend analytics model. N26 will add realtime
transport without changing this snapshot contract.
