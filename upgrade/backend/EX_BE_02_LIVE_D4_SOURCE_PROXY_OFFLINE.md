# EX-BE-02-LIVE — D4 Source Proxy Offline Boundary

Date: 2026-08-25  
Status: `D4_SOURCE_PROXY_OFFLINE_ACCEPTED / LIVE_SOURCE_DARK`

## Outcome

Portal now has a D4-specific Source Proxy profile for the owner-published
`d4.paper-read.v1` facade. It does not reuse the legacy D1/D3 alpha Gateway
profile.

The profile is locked to:

- one private bridge listener with HTTP/2 and TLS 1.3 mutual TLS;
- the imported, digest-verified four-route GET include only;
- the facade loopback origin `127.0.0.1:8011`;
- a dedicated `X-Portal-Paper-Read-Key` plus exact contract header injected
  only by the owner-installed runtime include;
- 120 requests/minute per mTLS peer with a bounded burst;
- safe access logs containing method, path, status and timings, never query
  strings, headers, credentials or payloads; and
- explicit denial of legacy `X-API-Key`, Gateway `127.0.0.1:8000`, discovery,
  admin, command, mutation, QUIC and HTTP/3 surfaces.

## Assets

- `deploy/execution-d4/source-proxy/nginx.conf.template`
- `deploy/execution-d4/source-proxy/trading-system-read-header.conf.example`
- `deploy/execution-d4/compose.paper-read-shadow.yaml`
- `scripts/execution-d4-render-source-proxy.sh`
- `scripts/execution-d4-source-proxy-preflight.sh`
- `scripts/execution-d4-source-proxy-test.sh`

The renderer reads only non-secret listener metadata. The readiness preflight
verifies owner authorization, imported-manifest identity, installed ownership,
certificate/key consistency and the two-line identity include without printing
the key. It never starts a container or sends a request.

## Verification

The offline test proves:

1. the five imported contract artifacts still match `MANIFEST.sha256`;
2. the rendered Nginx config parses in the pinned unprivileged image;
3. HTTP/2, TLS 1.3, mTLS, rate limit and exact include are mandatory;
4. exactly orders/fills/positions/events target port 8011;
5. legacy port/header and contract drift fail closed; and
6. no Source Proxy or Trading System service is started.

## Remaining live gate

This evidence does not authorize a D4 read. A new owner window, installed
runtime files, immutable deployment image, BUILDING-only qualifier command and
readiness pass are still required. Query, analytics, SSE, command relay,
activation and registry delivery remain disabled.
