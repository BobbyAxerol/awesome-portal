# EX-BE-02-LIVE — D3 gateway identity remediation

Status: `D3_ATTEMPT_REJECTED_FAIL_CLOSED / D2_RESTORED / SIGNED_EDGE_REPUBLISH_REQUIRED`  
Observed: 2026-08-24 UTC  
Change window: `d3-live-20260824-01`  
Owner: Bobby

## 1. Outcome first

The first live D3 candidate was correctly rejected before the SGP delegated-JWT
matrix. The immutable Edge image pinned the previously captured Trading System
gateway digest prefix `sha256:4f63dc9949f8`, while the currently running
gateway is `sha256:8a81f121f068...` at revision
`b39349dce09adaaa36e31d0bd3b98c19266ed5f4`. The Edge therefore produced an
incompatible capability snapshot, kept readiness failed closed and made no
source request.

This is a safe identity-drift rejection, not an mTLS, network, resource or
Trading System outage. The D3 overlay was rolled back to the unchanged D2 dark
configuration. D4 remains unauthorized.

## 2. What was proved live

- SGP and AWS-HK clocks were synchronized and WireGuard `10.70.0.1 ↔
  10.70.0.2` was healthy; private RTT was about 36.6 ms.
- Public AWS TCP 8000/8443/8444/5432 remained denied.
- The D3 env passed `probe-readiness`; its only intended runtime delta was
  `SOURCE_PROXY_SOURCE_MODE=contract-probe` and
  `EDGE_SOURCE_PROBES_ENABLED=true`.
- Ingestion, Query, analytics, SSE and command relay remained false; alpha
  probe scope remained empty.
- Source Proxy workload mTLS succeeded and returned the exact bounded matrix:
  contracts/health/capabilities `200`; orders/fills/positions/events `503`.
- Trading System health remained `200`; PostgreSQL retained four migrations,
  zero epochs and zero business/projection rows.
- All Portal containers retained zero restarts and zero OOM events.
- D2 rollback restored both Edge and Source Proxy to healthy with source probes
  false and no post-rollback Source Proxy access.

Private redacted attempt evidence is stored outside Git at
`/home/bobby/secure/portal-execution-d3-attempt-20260824-01.env` with SHA-256
`e29fdafa43e31d31c9520c40013597c2207ced53470f91b73120c7c9faebe695`.
It contains no certificate, key, assertion or response payload.

## 3. Compatibility evidence for the current gateway

Fresh read-only checks reproduced the D0 compatibility result:

| Evidence | Current SHA-256 | Result |
|---|---|---|
| `/openapi.json` | `c4f6530981752cb9a9610b704416ee422094abc89c1d63d96ceb7918b38a19f6` | matches the D0/contract-pack route surface |
| `/v1/contracts` | `8f5fca84f42cba9f819593f8d4634520bab9d842514dd33fbd980f1913e5d192` | API/contract/schema revision remains v1 |
| `/v1/health/capabilities` | `2c056581d4b5d6484a0bf96dde729c32b6a213264a665533a4a58cb705cd9fe3` | public capabilities available |

The existing contract-pack manifest and its typed shapes remain unchanged.
Only the observed runtime identity/revision lock changes. The Portal does not
modify the Trading System to achieve this remediation.

## 4. Remediation and non-bypass rule

The versioned lock now pins the observed gateway prefix
`sha256:8a81f121f068` and revision
`b39349dce09adaaa36e31d0bd3b98c19266ed5f4`. This change must pass the full
Rust/PostgreSQL/replay/restore gate and D2/D3 route tests, then be merged to
`main` and republished by the protected image workflow.

The shared D2/D3/D4 preflight now also parses that lock and rejects a runtime
gateway digest that does not start with the locked prefix. A stale identity is
therefore stopped before Compose changes runtime, while the Edge retains the
same independent fail-closed comparison as defense in depth.

D3 may resume only with the new immutable Edge digest after provenance, SBOM,
Trivy and OIDC-Cosign verification. Operators must not put the old digest in the
runtime env, disable the digest comparison, use a locally built unsigned image,
or extend the failed window.

## 5. Next accepted sequence

1. publish the remediated signed Edge image from protected `main`;
2. update a fresh private D3 env with that exact image digest and re-run
   `probe-readiness`;
3. open a new bounded D3 window;
4. require Edge readiness plus only three Source Proxy public-route probes;
5. run the H2/TLS 1.3 mTLS and delegated-JWT positive/negative matrix;
6. prove latency, Source Proxy loss/recovery, unchanged projection counts and
   D2 rollback;
7. record `D3_ACCEPTED / BUSINESS_SOURCE_DARK` only after all checks pass.

Only then may D4 request a dedicated Paper read-only identity and encrypted
projection storage. This checkpoint unlocks no frontend source profile.
