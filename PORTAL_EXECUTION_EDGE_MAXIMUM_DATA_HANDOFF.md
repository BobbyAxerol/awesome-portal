# Portal Execution Edge — Maximum Data implementer handoff

**Status:** `PUBLISHED_SOURCE_HANDOFF / P_S_L_MANAGER_V2_READ_READY / NO_NEW_RUNTIME_MUTATION`  
**Pullable ref:** `origin/feat/execution-data-activation`  
**Governing request:** [`PORTAL_EXECUTION_EDGE_MAXIMUM_DATA_DISCOVERY_PUBLICATION_AND_RETURN_REQUEST_v1.md`](./PORTAL_EXECUTION_EDGE_MAXIMUM_DATA_DISCOVERY_PUBLICATION_AND_RETURN_REQUEST_v1.md)

This is the short operational index for the Portal agent who will build the
server-side consumer/BFF. It does not grant direct database, Source Proxy,
Redis, broker, CLI, certificate or token access.

## Start here

Read in this order. Do not infer source semantics from a table name or a
current page.

1. This handoff, then the seven-stage status in
   [`upgrade/UNIFIED_IMPLEMENTATION_PLAN.md`](./upgrade/UNIFIED_IMPLEMENTATION_PLAN.md#ex-dp-07--e7-resilience-capacity-and-complete-owner-return).
2. The accepted return summary:
   [`MASTER_RESPONSE.md`](./services/portal-execution-edge-rs/contracts/maximum-data-return-v1/MASTER_RESPONSE.md).
3. The machine result and its integrity index:
   [`owner-response.v2.json`](./services/portal-execution-edge-rs/contracts/maximum-data-return-v1/owner-response.v2.json),
   [`e7-return-pack.manifest.json`](./services/portal-execution-edge-rs/contracts/maximum-data-return-v1/e7-return-pack.manifest.json), and
   [`MANIFEST.sha256`](./services/portal-execution-edge-rs/contracts/maximum-data-return-v1/MANIFEST.sha256).
4. The exact product mapping and domain rulings:
   [`e5-existing-data-publication.v1.json`](./services/portal-execution-edge-rs/contracts/maximum-data-return-v1/e5-existing-data-publication.v1.json),
   [`e6-domain-acceptance.v1.json`](./services/portal-execution-edge-rs/contracts/maximum-data-return-v1/e6-domain-acceptance.v1.json), and
   [`EVENT_CONTINUITY_REPORT.md`](./services/portal-execution-edge-rs/contracts/maximum-data-return-v1/EVENT_CONTINUITY_REPORT.md).
5. The deployed multi-profile activation contract:
   [`runtime-activation.v1.json`](./services/portal-execution-edge-rs/contracts/manager-profile-activation-v1/runtime-activation.v1.json) and
   [`qualification-evidence.v1.json`](./services/portal-execution-edge-rs/contracts/manager-profile-activation-v1/qualification-evidence.v1.json).
6. Only when changing the Rust Edge itself, read
   [`edge-service/src/main.rs`](./services/portal-execution-edge-rs/crates/edge-service/src/main.rs),
   [`maximum-data-adapter`](./services/portal-execution-edge-rs/crates/maximum-data-adapter/src/lib.rs), and
   [`maximum-data-return`](./services/portal-execution-edge-rs/crates/maximum-data-return/src/lib.rs).

Validate the imported result before starting a consumer:

```bash
python3 services/portal-execution-edge-rs/tools/validate_maximum_data_e7.py
cd services/portal-execution-edge-rs/contracts/maximum-data-return-v1
sha256sum --check MANIFEST.sha256
```

## Service truth available now

The private Manager-v2 **current-page** read plane is already running for all
three profiles. A read-only reconciliation on 2026-09-04 found these active,
healthy services on the same immutable Edge image:

| Environment | Profile | Manager-v2 read | Projection cache |
| --- | --- | --- | --- |
| Paper | `PAPER_BINANCE_USDM` | enabled | disabled |
| Sandbox | `SANDBOX_BINANCE_USDM` | enabled | disabled |
| Live | `LIVE_BINANCE_USDM` | enabled | disabled |

The active Edge image is
`sha256:47ea4d78099347706710879bf26e46a15cfaf80e4ef7ac22879f0a71f12c3077`.
All three `execution-edge` and Source Proxy services were healthy; all three
projection-database services were running. The Edge binds only its private
WireGuard address; it does not publish a browser-facing port. No restart,
image build, deployment or configuration mutation was required for this
handoff.

`EDGE_MANAGER_PROJECTION_ENABLED=false` is intentional: the current service
does read-through rather than silently copying all current relations into a
new cache. A Portal BFF may add a deliberately selected cache/read model only
where repeated reads have a measured need and must preserve source freshness,
completeness and as-of metadata.

## What the Portal BFF calls

The BFF calls the **private Edge**, never the Trading System database and never
the Source Proxy. The currently registered Edge GET routes are:

| Edge route | Use |
| --- | --- |
| `GET /internal/v2/manager/catalogue` | discover the active catalogue and safe relation metadata for the one bound profile |
| `GET /internal/v2/manager/capabilities` | inspect the fixed Manager capability envelope |
| `GET /internal/v2/manager/projections/:kind` | read a named Manager projection supported by the catalogue |
| `GET /internal/v2/manager/relations/:schema/:relation?limit=1..200&cursor=<opaque>` | obtain one bounded, catalogue-validated current relation page |

The Edge performs its own mTLS call to the Source Proxy. The Source Proxy's
`/portal/execution/v2/manager/...` paths are implementation detail and are not
a Portal BFF integration target. The browser must call the Portal API only;
it must never receive a relation selector, opaque cursor, JWT, mTLS material,
source origin or raw Manager payload.

For each request the BFF uses its private mTLS identity to reach the matching
Edge profile and asks the Control API for a short-lived delegated JWT whose
environment, audience, `profile_id` and GET-only resource exactly match the
target deployment. The resource is `execution:manager-v2:read`. The Edge
rejects a missing token with `401`, wrong identity/scope/profile with `403`,
an invalid `limit` or cursor with `400`, a non-catalogued relation with `404`,
and source unavailability or an invalid upstream contract as typed `503` or
`502`. Do not auto-retry a `503` into an empty response.

The active catalogue presently has 96 readable relations. The sanitized E1
census has 99 relations / 1,387 columns, but census presence is **not** a claim
that every relation is an active page or a historical/event source. The 34
frozen request mappings identify 22 direct capabilities, five Portal-derived
capabilities, six genuine source-owner gaps and one Canary incompatibility.

## Product binding rule

The route is broad enough to read any relation that is present in the current
catalogue, but the Portal BFF must keep the relation and selected fields in a
server-owned, named operation. It may reuse the one generic Edge relation route
for many named BFF operations; it must not expose a browser-controlled generic
table browser or SQL interface.

Start with the named E5 mappings in `e5-existing-data-publication.v1.json`.
For a newly needed current relation that is catalogued but not yet one of those
34 frozen mappings, add a small named BFF DTO/fixture/contract and preserve:

- `availability`, `freshness`, `completeness`, `as_of`, profile and catalogue
  binding from the Edge envelope;
- UTC epoch-millisecond timestamps and exact decimal strings;
- opaque, relation-bound pagination only; each transport page is at most
  200 rows / 1 MiB;
- typed empty, unavailable and partial states—never convert them to zero,
  full-history or replay claims.

Current orders/fills/positions are current-page or bounded retained facts at
the semantics stated by the pack. They are not a global-sequence Event stream,
correction-aware replay or a promise of total historical coverage. Use
`EVENT_CONTINUITY_REPORT.md` before implementing any realtime/history view.

## Implementation route for the Portal agent

1. Fetch this branch and start a new consumer branch from it; do not edit the
   immutable E7 return pack to make product decisions.
2. Add one server-side BFF client for the matching private Edge endpoint. Keep
   mTLS and delegated-JWT minting in the server/control plane, never in Rust
   browser code or frontend state.
3. Choose one named data need, map it to an E5 direct/derived status, and
   return a small Portal DTO with the source-status envelope intact.
4. Test happy, authoritative-empty, partial, unavailable, invalid cursor,
   wrong profile and wrong resource cases using the checked-in fixtures before
   binding a screen.
5. Release the Portal BFF as its own immutable-image change. The currently
   running Edge needs no restart to serve the existing Manager-v2 GET routes.

Do not change legacy V1/D4 routes, direct database grants, Redis/broker access,
CLI/command relay, Event/SSE/replay, or a profile's activation merely to build
this consumer.

## Copy/paste prompt for the receiving agent

```text
You are implementing a server-side Portal consumer for the existing private
Execution Edge Manager-v2 current-page read plane. First fetch and branch from
origin/feat/execution-data-activation. Read
PORTAL_EXECUTION_EDGE_MAXIMUM_DATA_HANDOFF.md, then the EX-DP-07 section in
upgrade/UNIFIED_IMPLEMENTATION_PLAN.md, MASTER_RESPONSE.md,
owner-response.v2.json, e5-existing-data-publication.v1.json,
e6-domain-acceptance.v1.json, EVENT_CONTINUITY_REPORT.md and the Manager
profile runtime-activation contract. Run the E7 validator and MANIFEST hash
check before editing.

Implement only a server-side BFF/client path. Call the private Edge
/internal/v2/manager routes through the existing deployment-bound mTLS and a
short-lived Control-API delegated JWT for execution:manager-v2:read. Bind the
environment, audience and profile exactly; never connect to Trading System DB,
Source Proxy, Redis, broker or CLI, and never expose relation/cursor/JWT/mTLS
inputs to the browser. Use one named Portal operation/DTO per product need,
even though the Edge internally supports its catalogue-bound relation route.

Preserve availability/freshness/completeness/as_of/profile/catalogue metadata,
UTC milliseconds, exact decimal strings, 200-row/1-MiB page bounds and opaque
relation-bound cursor semantics. Treat 401/403/400/404/502/503 and
authoritative empty/partial states faithfully. Do not infer event replay,
global ordering, correction or total history from a current page.

Start with an E5 mapping whose status is AVAILABLE_DIRECT or
AVAILABLE_DERIVED_AT_PORTAL. Any source-owner gap or Canary incompatibility
must remain typed. Add focused contract/fixture tests and update the Unified
Plan journal in the same commit. Do not change V1/D4, commands, direct DB,
profile activation, caches or runtime containers unless Bobby separately
approves that exact scope.
```

## Handoff boundary

`EX-DP-01` through `EX-DP-07` are complete for the requested discovery,
semantic classification, mapping, existing-data publication, qualification,
resilience evidence and portable return. This handoff does not claim that a
Portal BFF/UI consumer has already been built. That is the receiving agent's
product task; the deployed private Edge GET service and the digest-bound
contract/evidence needed to begin it are ready now.
