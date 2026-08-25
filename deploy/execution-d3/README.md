# Execution D3 — Contract and Authentication Probes

Status: `D3_TRANSPORT_ACCEPTED / BUSINESS_SOURCE_DARK / D2_RUNTIME_RESTORED`

D3 is a reversible probe-only delta on top of an accepted D2 dark deployment.
It proves the SGP→AWS-HK application boundary without reading account/alpha
business data and without creating a projection epoch.

## Locked runtime delta

| Capability | D2 | D3 |
|---|---:|---:|
| public `/v1/contracts`, `/v1/health`, `/v1/health/capabilities` probes | off | on |
| `EDGE_PROBE_ALPHA_ID` | empty | empty |
| orders/fills/positions/events source routes | 503 | 503 |
| projection ingestion | off | off |
| Query API | off | off |
| SSE | off | off |
| analytics | off/`fixture` | off/`fixture` |
| command relay | off | off |

`contract-probe` keeps the exact harmless header
`X-Portal-Source-Mode: dark`; it does not mount or inject a Trading System API
key. `paper-read` and its dedicated source identity belong to D4.

## Versioned assets

- `compose.probes.yaml`: the only D3 AWS runtime overlay.
- `../../scripts/execution-d3-render-probe-env.sh`: derives a new D3 env and
  separate Source Proxy config from an accepted D2 env without printing values.
- `../../scripts/execution-d3-live-probe.sh`: enforces HTTP/2 + TLS 1.3 mTLS,
  the positive/negative JWT matrix, bounded latency and fail-closed routes.
- Control API `probe:d3-assertions`: emits a 45-second canonical assertion and
  ten negative variants into a caller-owned mode-0700 directory; all files are
  mode 0600 and no token is logged.
- `../runbooks/execution-d3-contract-auth-probes-and-rollback.md`: live window,
  source-loss drill, acceptance and rollback.

The publication workflow has a separate `execution-d3` scope. It retains the
signed D2 Edge/Proxy chain and additionally builds, scans, signs and verifies
the exact Control API image used to issue the assertion corpus.

## Offline gate

```bash
./scripts/execution-d2-test.sh
./scripts/execution-d3-test.sh
./scripts/execution-image-publication-test.sh
```

The D3 gate renders Compose and exercises a redacted 19-case probe harness with
a fake curl. The real SGP→AWS-HK matrix was then accepted on 2026-08-24 at
commit `5ec282ec8c00c60696f66a70186ffd80b051d8a0`: HTTP/2, TLS 1.3 mTLS, all JWT
positive/negative cases, bounded latency, source loss/recovery and D2 rollback
passed. Only the three public source paths were observed, business reads and
projection ingestion stayed off, and runtime exited on D2 source-dark.

See
[`../../upgrade/backend/EX_BE_02_LIVE_D3_TRANSPORT_ACCEPTANCE.md`](../../upgrade/backend/EX_BE_02_LIVE_D3_TRANSPORT_ACCEPTANCE.md)
for the redacted evidence index and the still-closed D4 gates.
