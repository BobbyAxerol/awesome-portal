# EX-BE-02-LIVE — D1 offline preparation package

> Status: `OFFLINE_PREPARATION_COMPLETE / D1_OWNER_EXECUTION_PENDING`  
> Branch: `feat/execution_loop`  
> Runtime/source impact: none  
> Trading System impact: none

## 1. Delivered boundary

This slice converts the D0 decision sheet into reviewable, testable assets
without executing D1:

- versioned owner-input schema with fail-closed safety locks;
- separate SGP/AWS WireGuard `/30` templates with exact peer `/32`s, no default
  route, no forwarding and no embedded firewall commands;
- separate mTLS workload profiles plus SGP-only RS256 delegated-read identity
  inventory and overlap/revocation rules;
- D2 render-only Edge/Source Proxy overlay with immutable-image placeholders,
  non-root/read-only/cap-drop/resource boundaries and every runtime flag dark;
- Source Proxy TLS 1.3 mTLS, bridge-only listener and exact seven-route GET
  allowlist to the Trading System loopback gateway;
- real Trading System read credential confined to Source Proxy. The existing
  edge transport receives only a non-TS admission sentinel; Source Proxy
  discards it before injecting its own source identity;
- non-sourcing, value-redacting preflight validator with separate template,
  readiness and production modes; parser failures suppress library tracebacks
  and never echo the rejected private value;
- offline test gate covering parser injection, safety-lock refusal, deferred
  metadata behavior, exact proxy routes, dark flags and Compose rendering;
- operator acceptance/rollback runbook with independent D1/D2/D3/D4 gates.

## 2. Deferred-field ruling

`AWS_EIP_ALLOCATION_ID` and `AWS_ROUTE_TABLE_ID` are not D1 runtime inputs.
Their absence produces warnings in `--mode readiness` because:

- the Elastic IP value and EC2/SG identity are sufficient for the D1 data
  plane while allocation-ID automation is deferred;
- the host-to-host WireGuard `/30` is a connected Linux route and D1 makes no
  VPC route-table change.

They become hard errors in `--mode production`. This is the recorded reminder
before production certification and provides the later IAM/control-plane audit
hook requested by the owner.

## 3. Security decisions

1. SSH remains operator/deployment access only.
2. WireGuard is only the private carrier.
3. Edge mTLS authenticates SGP Control API independently from JWT.
4. Delegated JWT is RS256, SGP-signed, audience/environment/resource-bound and
   at most 60 seconds; AWS receives public JWKS only.
5. Source Proxy uses a second mTLS trust boundary that cannot reuse the SGP
   client identity.
6. Source Proxy does not forward arbitrary headers. Public compatibility
   probes carry no API key; only four alpha-scoped GET locations inject the
   dedicated source credential.
7. Query, ingestion, SSE, analytics, commands, Live and registry activation all
   remain false/forbidden.

## 4. Test contract

The slice is accepted only when:

```bash
bash -n scripts/execution-d1-preflight.sh scripts/execution-d1-test.sh
./scripts/execution-d1-test.sh
./scripts/portal verify
git diff --check
```

The test uses documentation-only example IP ranges, never the private owner
file, AWS, WireGuard, PKI or Trading System. A live D1 pass cannot be inferred
from this evidence.

## 5. Rollback and next gate

No runtime rollback is required because this slice changes source/docs only.
Code rollback is one commit. The future D1 rollback disables `portal0`, removes
only recorded D1 firewall/SG rules and restores the preflight route baseline;
it never touches Trading System.

Next backend/live step is owner-executed **D1 network-only** after the private
input passes readiness on both hosts. After D1 evidence is accepted, a separate
owner decision may open **D2 dark services**. D3 then proves H2/mTLS/JWT and
capability failures without business reads; D4 alone may begin a Paper
BUILDING-epoch shadow with the dedicated source identity.

Claude may continue fixture/failure-state frontend work. D1 preparation does
not change any screen BE status, profile or runtime flag.
