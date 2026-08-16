# QuantBT Portal Backend

Typed FastAPI compatibility API and service adapters for the QuantBT backtest
portal. Runtime strategy and optimization work is delegated to worker services;
the API imports QuantBT lazily. The target mother-Portal control plane remains
TypeScript as specified by the v0.4 architecture.

Historical requests use the approved `primus-historical-market-data==0.1.0rc3`
reader wheel, accepted release manifest and canonical read-only storage.
`GET /api/datasets` advertises availability plus explicit backtest/research
scope; realtime and paper-trading data are separate service boundaries.
`POST /api/runs/preflight` supplies symbol, timeframe and bounded calibration
dates. Unit tests inject an in-memory/fake reader; production paths remain
server-owned and fail closed.

Mother-Portal metadata is supplied by the image-owned registry sidecar. The
API validates its schemas and cross-references before readiness, then exposes
the hidden-safe immutable projection through `GET /api/v1/portal/registry`
with deterministic digest, ETag and conditional `304` support. `GET /api/ready`
is the deployment healthcheck; `GET /api/health` remains lightweight liveness.

BAR-01-BE3/BE4 compose internal, read-only QuantBT and Planning summary
adapters. They preserve per-source evidence, map unavailable values to `null`
and never read another service's database directly. Planning API mode uses a
fixed private HTTP origin, strict `planning.summary.v1` validation, a 500 ms
default deadline and a 64 KB response ceiling; browser-local mode returns
`LOCAL_ONLY_STATE` without guessed counts. The public
`GET /api/v1/portal/summary` route remains intentionally absent until the
deadline-aware aggregator lands in BAR-01-BE5. These Python adapters are
compatibility bridges, not the target TypeScript control-plane boundary.
