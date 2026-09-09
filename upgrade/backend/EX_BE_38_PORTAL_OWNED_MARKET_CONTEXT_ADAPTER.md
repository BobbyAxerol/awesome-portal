# EX-BE-38 — Portal-owned Market Context Data Layer adapter

Status: `IMPLEMENTED / STATIC_AND_UNIT_VERIFIED / DEPLOYMENT_EVIDENCE_PENDING`

Date: 2026-09-07

## Outcome

Market Context no longer waits for a new Trading System Manager-v2 capability.
The existing Data Layer on the AWS-HK execution cell already exposes the
minimum current-price and bounded-kline data required by the approved Portal
screens.  This slice packages it behind the existing private Portal boundary:

```text
same-origin Portal BFF
  -> mTLS + short-lived delegated JWT
  -> Rust Execution Edge
  -> mTLS Source Proxy (two exact routes)
  -> 127.0.0.1:8100 Data Layer
```

The browser never receives an Edge relation route, source cursor, mTLS
material, delegated JWT, Data Layer URL, database credential, Redis, broker or
CLI capability.

## Fixed source surface

| Named Portal operation | Edge route | Fixed Data Layer route | Bound | Truthful semantics |
|---|---|---|---:|---|
| `managerMarketContextLatestV1` | `/internal/v2/manager/market/latest` | `/v1/binance/price-last/{instrument}?market=usdm` | at most 200 requested observations | current provider observation; no event/replay claim |
| `managerMarketContextCandlesV1` | `/internal/v2/manager/market/candles` | `/v1/binance/futures/klines/{instrument}` | raw provider limit at most 1,500; Portal public request remains at most 2,000 | bounded provider series; `coverage=UNKNOWN`, `sampling=SOURCE_BOUNDED`, no replay claim |

The Source Proxy emits the required adapter revision header
`X-Portal-Source-Adapter: portal.execution.market-context-data-layer.v1`.
Rust rejects a missing or changed header, unexpected HTTP status, profile or
venue drift, malformed decimal, malformed timestamps, response oversize and
unrecognised raw shape.  It normalizes only the approved browser-safe DTO.

## Authority

- Read-only `BINANCE_USDM` current observations and bounded candles only.
- Paper, Sandbox and Live are exact profile labels; profile data is not merged.
- Source errors remain typed (`502`/`503`/`429`) and are never converted to an
  empty successful response or an automatic retry loop.
- No Trading System source, direct DB/Redis/broker/CLI access, command,
  profile activation or Live mutation is widened by this change.

## Evidence in this commit

- Immutable adapter manifest:
  `services/portal-execution-edge-rs/contracts/portal-market-context-data-layer-adapter-v1/`.
- Static route/manifest verifier:
  `scripts/execution-market-context-data-layer-adapter-test.sh`.
- Rust contract and client tests covering raw normalization, header failure,
  profile/venue/decimal drift, bounded candles and typed upstream failures.
- Control API acceptance tests for all three profile labels and source-adapter
  intake validation.

## Deployment gate

This document is not deployed evidence.  `PRODUCT_ACTIVE` remains false until
the protected-main image includes this exact contract digest, the rendered
AWS-HK Source Proxy accepts only the two listed routes, the Control API has
`FEATURE_EXECUTION_MARKET_CONTEXT=true`, and authenticated Paper/Sandbox/Live
probes plus redaction/rollback evidence are recorded in the EDS-12 packet.

## Deliberately not claimed

- authoritative market event replay, correction/tombstone or global ordering;
- more than the provider-bounded candle window;
- benchmark, calendar or VNM constraints outside an exact published Data Layer
  response;
- any source-side mutation authority.
