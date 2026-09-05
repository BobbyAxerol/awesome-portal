# EDS-07 — Retained financial chart and decision-query API

**Status:** `CODE_COMPLETE / SOURCE_DARK / RUNTIME_NOT_ACTIVATED`.

EDS-07 adds a Portal-owned financial query plane over the durable SGP mirror.
It does not open an AWS-HK connection during a browser refresh, does not query
the Trading System database, and does not activate a source, cache, command,
runtime container, or deployment.

## Product operations

Both endpoints are same-origin and require a normal Portal session plus
membership in the configured local-projection workspace.

| Named operation | Route | Purpose |
|---|---|---|
| `executionFinancialChartV1` | `GET /api/v1/execution/views/equity-chart` | retained financial/equity time series |
| `executionRiskGrantRecordsV1` | `GET /api/v1/execution/views/risk-decisions?decision_kind=risk_grants` | retained risk-grant decision records |
| `executionSizingDecisionRecordsV1` | `GET /api/v1/execution/views/risk-decisions?decision_kind=sizing_decisions` | retained sizing-decision records |

The chart route accepts only `environment`, `subject_kind`, `subject_id`,
`metric`, optional `from_ms`/`to_ms`, `viewport_px`, and
`include_benchmark`. The decision route accepts its named decision kind,
bounded range, `limit <= 200`, and an opaque Portal handle. Unknown fields,
including `relation`, source routes, raw cursors, JWTs, or certificate inputs,
are rejected before the service is called.

## Fixed source mapping

The browser cannot choose a source relation. The service owns this mapping:

| Product subject | Retained relation | Direct values |
|---|---|---|
| Alpha / deployment | `manager.performance:performance_snapshots` | equity, PnL, cash, notional and published exposure values |
| Account | `manager.performance:account_equity_snapshots` | account equity/PnL/cash/margin/drawdown/notional |
| Portfolio | `manager.performance:portfolio_equity_snapshots` | portfolio equity/PnL/cash/margin/drawdown/notional/allocation |
| Alpha / account R1 | `manager.risk:sizing_decisions` | decision id, strategy/account, mode, venue, created-at |
| Alpha / account R2 / Live Review | `manager.risk:risk_grants` | grant id, strategy/account, mode, venue, created-at |

Deployment and portfolio decision records are deliberately `UNAVAILABLE`:
the current source does not publish a safe direct linkage for those joins.
The records are decision records only, never promoted into a signal funnel,
complete risk-event replay, correction stream, or command authority.

The two decision relations are retained as separate `EDS07` acceptance overlays
for Paper, Sandbox and Live. They do not rewrite the historical N22/N23
acceptance records or widen any arbitrary Manager route.

## Truth, precision and chart bounds

* Every read uses a `REPEATABLE READ, READ ONLY` PostgreSQL transaction over
  `execution_durable_mirror_*`; it is anchored to one committed local mirror
  revision while retained range rows remain historical observations.
* Timestamps leave the BFF as exact, browser-safe UTC epoch milliseconds.
  Financial values remain decimal strings; no JavaScript floating-point result
  or cross-currency aggregate is emitted.
* Output is partitioned by source currency. FX aggregation has no published
  authority and is therefore not inferred.
* A chart target is derived from viewport (`2x`, clamped to 512–4096 points)
  and responses are capped at 1 MiB.
* Dense series use `MIN_MAX_LAST_BUCKET_V1`, preserving each series' first and
  last observed point plus per-bucket extrema/last values. It carries exact
  source/numeric/rejected/returned counts and visible retained coverage.
* Log scale is selected only when every returned value is strictly positive;
  otherwise the response is linear.
* A requested benchmark returns typed `UNAVAILABLE`
  (`EDS07_BENCHMARK_AUTHORITY_UNPUBLISHED`). Gaps and markers remain explicitly
  false because the source has not published those semantics.

`source_total` is always `null`, and `retention_floor_state=UNKNOWN`: retained
range is useful current history, not total history or event replay.

## Cursor and access boundary

Durable keysets (`kc1.*`) are integrity-protected server state and never leave
Portal. Decision pagination returns only `fqc1.<uuid>` handles stored in
`execution_financial_query_cursors`. A handle is bound to the named operation,
workspace, user/role digest, environment, profile, exact filter fingerprint,
and TTL; it cannot be replayed by another user or query. Expired, malformed,
or mismatched handles return `EDS07_CURSOR_INVALID_OR_EXPIRED`.

## Runtime and activation posture

The default flags remain off:

```text
FEATURE_EXECUTION_DURABLE_MIRROR=false
FEATURE_EXECUTION_DURABLE_MIRROR_READS=false
```

With either flag off the BFF returns the typed
`EDS07_DURABLE_MIRROR_READS_DISABLED` envelope without calling Edge/AWS-HK.
Activation needs a separately approved owner window and durable-mirror
preflight; EDS-07 neither changes that gate nor provides any command or live
mutation path.

No query cache is installed. This is deliberate: caching may be added only
after an invalidation measurement proves it preserves the committed-revision
contract. It is not a fallback or hidden source-read path.

## Verification evidence

Focused EDS-07 cases cover:

1. dark runtime produces no source read;
2. committed local financial range, exact decimal extrema, UTC, downsample
   bound and typed benchmark gap;
3. non-positive drawdown selects linear scale;
4. user-bound opaque decision pagination with no raw relation/keyset leak;
5. all three profile ladders retain only their published decision semantics;
6. strict controller input and workspace boundary rejection.

The final fresh-PostgreSQL Control API gate also verifies migrations, the
existing full contract suite, backup/restore parity and no runtime dependency
on a production container.

Final clean evidence on 2026-09-05: E7 return validation passed (`34`
capabilities, `18` genuine source gaps and three measured profiles); every
`MANIFEST.sha256` entry passed; and `./scripts/control-api-test.sh` passed
the TypeScript build, **44 test files / 379 tests**, fresh PostgreSQL
migrations and the backup/restore drill.

## Frontend handoff

`PrimusFinancialChart` can consume the chart envelope directly. It must keep
the rich panel composition, render decimal strings/UTC correctly, use the
server-provided `scale_mode` and sampling metadata, and render typed
benchmark/coverage states rather than synthesising a benchmark or total
history. Risk and sizing panels consume the named decision endpoint only; no
frontend code should call Manager, Edge, or durable-mirror storage.
