# EDS-01 — Sealed Manager-v2 E5 deployment BFF

**Status:** `BFF_AUTHORITY_COMPLETE / CONTRACT_FAIL_CLOSED / NO_RUNTIME_MUTATION`  
**Campaign branch:** `feat/eds-current-bff`  
**Scope date:** 2026-09-04

## Result

EDS-01 publishes the first accepted E5 product operation, and only that
operation:

```text
GET /api/v1/execution/manager/deployments
```

The browser may choose only `workspace_id`, `environment` (`paper`, `sandbox`
or `live`), a page size from 1 through 200, and a Portal-issued opaque cursor.
It cannot select an Edge origin, Manager relation/schema, source alias,
profile, audience, capability, raw source cursor, certificate or delegated
token.

The fixed operation is `maximumDataDeploymentPageV1`:

| Portal field | Fixed Manager source |
|---|---|
| E5 field | `deployment_current` |
| source alias | `manager.deployments` |
| relation | `public.strategy_deployments` |
| source meaning | current page only; no replay, correction, global ordering or total-history claim |
| accepted fields | deployment/strategy/account/portfolio IDs, mode, venue, currency, state, active, created/updated timestamps |

The operation reuses `ExecutionCurrentSourceProxy`: deployment-bound HTTP/2
TLS 1.3 mTLS and an exact, short-lived
`execution:manager-v2:read` delegated assertion are issued only on the server.
The existing proxy continues to bind the exact source environment, profile,
audience and accepted screen. No new generic transport or generic Manager
route exists.

## Boundary and semantics

`MaximumDataOperationRegistry` is compiled into the Control API and pins the
accepted E5 source contract and catalogue SHA-256. Profile capacity remains
the observed return-pack policy: Paper=1, Sandbox=1, Live=2 concurrent named
pages; the fixed operation has a source-wide maximum of 4. The existing shared
admission/repository coalesces equivalent 1/10/100-client requests and retains
the configured global source rate budget. It does not relax it.

The BFF preserves source availability, freshness, completeness, as-of time and
profile in the product response. Timestamps are UTC epoch milliseconds;
source text values remain strings and there is no numeric conversion of
financial values. A source `AVAILABLE` empty page becomes `EMPTY`; partial or
stale source meaning remains `PARTIAL`/`STALE`; an unavailable 2xx source
envelope is never fabricated into `EMPTY`.

The source continuation stays in Portal PostgreSQL in
`execution_manager_operation_continuations`. The external value is a short
`mdc1.<uuid>` handle bound to the named operation, workspace, authenticated
principal/role digest, environment/profile and exact source contract/catalogue
pins. It expires under the existing cursor TTL and cannot replay across an
environment or identity. The raw Edge cursor, `record_key`, trace identifier
and fields outside the frozen allowlist are never emitted.

The request has no redirects or automatic retry, page length is bounded at
200, upstream response length at 1 MiB, and private source cursors at 4 KiB.
Source refusals `400/401/403/404/502/503` remain typed and faithful instead
of being converted to a generic unavailable/empty result.

## What this phase does not do

EDS-01 does not change a V1/D4 path, Edge/Source Proxy, Trading System DB,
Redis, broker, CLI, command authority, profile activation, cache/runtime
configuration, container or network. It neither deploys an image nor probes
AWS-HK from the runtime-manifest endpoint. The manifest now truthfully says
the fixed E5 BFF operation is published; that is not evidence of profile
activation.

Rich stage composition is deliberately owned by EDS-03 after generated
screen/panel contracts in EDS-02. That sequencing is a stated product-layer
boundary, not EDS-01 technical debt: this phase closes the sealed server-side
authority and its contract matrix completely.

## Verification

The completed gate runs:

```bash
python3 services/portal-execution-edge-rs/tools/validate_maximum_data_e7.py
(cd services/portal-execution-edge-rs/contracts/maximum-data-return-v1 && sha256sum --check MANIFEST.sha256)
./scripts/control-api-test.sh
```

The focused contract suite proves Paper populated, Sandbox partial and Live
authoritative empty handling; source/profile/catalogue/relation/row drift;
opaque continuation binding and cross-environment rejection; no raw source
leakage; same-origin query injection rejection; all required upstream refusal
statuses; and EDS-01 capacity/coalescing behavior. The full Control API gate
also runs fresh PostgreSQL migration/restore checks, including the continuation
table. The final isolated run passed TypeScript build plus **39 test files /
341 tests** and the PostgreSQL restore drill.

Because EDS-01 deliberately tightens the existing `current-source.proxy.ts`
boundary, the N29 acceptance evidence pin for that source boundary and its
four-file manifest were regenerated in the same change. The N29 release
decision, scope, debt register and runtime authority are unchanged.

## Next phase

**EDS-02 — Generated screen, panel, action and UTC/exact-value contracts.**
It consumes this one named DTO to establish generated product contracts before
the richer Paper/Sandbox/Live screens widen beyond the E5 deployment page.
