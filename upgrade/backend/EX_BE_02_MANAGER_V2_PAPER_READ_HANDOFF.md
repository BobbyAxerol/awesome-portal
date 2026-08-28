# EX-BE-02 — Manager-v2 Paper Read Route and Owner Handoff

Status: **COMPLETE / PRIVATE_PAPER_ROUTE_QUALIFIED / NO_PRODUCT_CONSUMER**

Date: 2026-08-28  
Portal branch: `feat/manager-v2-paper-read`  
Trading System owner branch: `feat/portal-execution-owner-campaign-v2`

This is the Portal-side detailed guide for the owner-approved TS-OC-03F
publication and associated Manager-v2 route/client qualification. It is
additive to, and does not alter, the existing D2/D3/D4 or Trading System V1
contracts. The relevant owner bytes are the frozen Manager-v2 contract revision
`trading-system.portal-execution.manager-v2.v1`, its qualified runtime overlay
`trading-system.portal-execution.manager-v2.runtime.v1`, and the forthcoming
TS-OC-03F publication manifest. The exact imported pack is
`services/portal-execution-edge-rs/contracts/manager-v2-paper-read-v1/` and
is locked by `contract-pack.lock.json`.

## Scope and topology

```text
Portal Execution Edge mTLS client
  -> Portal Source Proxy, five exact Manager-v2 GET routes
     -> 127.0.0.1 Manager token issuer (mTLS, short-lived cert-bound JWT)
     -> 127.0.0.1 Trading System Manager facade (mTLS + JWT)
     -> facade-only READ ONLY database login
```

The Source Proxy is the Portal-side outbound client in this slice. It holds a
dedicated Manager client leaf and public trust anchor only. It never holds an
issuer private key, Trading System DSN/role, Redis/broker/CLI credential or
command authority. The issuer has no database connection and issues only the
fixed Paper Manager assertion after its direct mTLS peer has matched the
owner-configured SPIFFE subject. The facade retains the only database login.

The permitted external locations are exactly:

- `GET /portal/execution/v2/manager/catalog`
- `GET /portal/execution/v2/manager/capabilities`
- `GET /portal/execution/v2/manager/projections/{kind}`
- `GET /portal/execution/v2/manager/records/{schema}/{relation}`
- `GET /portal/execution/v2/manager/records/{schema}/{relation}/{key}`

Their identifier validation, Paper profile, safe-column/redaction, canonical
keyset, response row/body, timeout and concurrency limits are Trading
System-owned. The Proxy has no catch-all Manager upstream or generic URL
forwarding. It obtains a new token for each request through an internal Nginx
`auth_request`; a static JWT is forbidden because the owner contract caps it
at 300 seconds and binds it to the Proxy client certificate.

## Invariants

- Only `PAPER_BINANCE_USDM` is enabled. Sandbox, Canary and Live remain false.
- Existing V1/D4 locations retain their current hard guards. This is not a D4
  paper-read or projection/epoch activation.
- `EDGE_SOURCE_PROBES_ENABLED`, projection ingestion, analytics query, SSE and
  command relay remain false. Execution Edge and projection containers are not
  restarted or recreated.
- No browser/public listener, Trading System database access, generic SQL,
  command/mutation, Event/SSE/replay or direct secret delivery is added.
- The frozen 24-path N11-v1 catalogue is published separately. The five
  Manager-v2 routes must never be described as a complete N11-v1 surface.

## Implementation and evidence gates

1. Import and hash-pin the owner Manager-v2 contract/publication artifacts in
   the Portal worktree; reject missing, drifted or secret-shaped files.
2. Extend the Source Proxy renderer/preflight with the distinct
   `manager-paper-read` mode. It must render only the five allowlisted
   locations, TLS 1.3/mTLS on both hops, bounded timeouts/rate limits and no
   V1 widening. Configuration is validated before any runtime change.
3. The Trading System adds the separate issuer, uses only a new loopback
   service and a pinned runtime image, and provisions new private material
   outside Git. It starts only `portal_manager_issuer` and
   `portal_manager_read` after private file/mode checks pass.
4. Qualify through the real Source Proxy with the existing Portal inbound mTLS
   client: catalogue/capabilities and one bounded record/projection request
   must succeed without logging a business response. Missing/wrong mTLS,
   POST/HEAD, unknown paths, V1 routes and issuer/facade loss must fail closed.
5. Record only sanitized status, counts, timing, hashes and cleanup evidence.
   A same-host route check is neither HA nor a D4/production-authoritative
   acceptance claim.

### Recorded implementation slice — 2026-08-28

The renderer/preflight implementation is complete and tested offline. The
normal template has only an include placeholder. `manager-paper-read` renders
the separate `manager-v2-locations.conf` and its mTLS material; D2/D3/D4 render
only a comment, so they cannot fail startup from a missing Manager file. The
preflight pins the exact six-location file, rejects a drifted facade upstream
or missing Manager leaf, verifies the client-auth chain/key uniqueness, keeps
the legacy read-header dark marker, and asserts no V1 or API-key use.

`./scripts/execution-d2-test.sh` passed with its isolated temporary fixture;
it did not start a Portal service. Trading System's corresponding issuer/auth
test slice passed 26 focused tests in a no-network/read-only test image.

### Final execution record — 2026-08-28

The owner publication and the Portal import are complete. The Portal pack
contains the byte-pinned source-dark OpenAPI/fixtures, the exact TS-OC-03F
publication subtree and the exact Source Proxy location template. The updated
offline gate recomputes every locked digest, rejects unpinned/secret-shaped
content, requires exactly the five GET operations, confirms that all 24
N11-v1 entries remain `TYPED_UNAVAILABLE`, and confirms that the imported
location template is byte-identical to the active renderer input.

Both `./scripts/execution-d2-test.sh` and
`./scripts/execution-d2-test.sh --build-images` passed. The latter used only
named temporary test resources and cleaned them; neither command changed the
deployed Portal runtime.

Within the approved private window, two new host-loopback Trading System
containers (`portal_manager_issuer` and `portal_manager_read`) were started
from the owner-qualified image and only
`portal-execution-edge-source-proxy-1` was atomically recreated with the
separate `manager-paper-read` config. The real mTLS route qualified catalogue
(96 relations), capabilities (five), one bounded record and one bounded
projection without writing a business response to evidence. POST and HEAD
were denied, an unknown Manager path was denied, no-client mTLS was denied and
the existing V1 route remained dark. A final read-only mTLS status probe
returned `200`.

Fault/recovery was exercised by stopping each new dependency independently:
issuer loss returned `500`, facade loss returned `502`, and recovery returned
`200`. The rollback rehearsal restored only the prior D2-dark Source Proxy
config and observed Manager route `404`; reapplying the separate Manager
config returned `200`. Execution Edge, projection PostgreSQL, D4/V1
configuration, database schema/data/roles/grants/indexes and all existing
containers remained untouched. Sanitized hashes/counts/statuses are bound in
the imported owner publication; private certificates, runtime values and
evidence remain outside Git.

This is a private same-host Paper route qualification, not a public listener,
D4 activation, HA/independent-failure-domain, Sandbox, Canary, Live or
production-authoritative result. The existing Rust Edge has no Manager-v2
consumer by design; a later bounded client/projection/UI slice remains a
separate product request.

## Deployment and rollback boundary

The runtime change is limited to two new Trading System loopback containers
and one atomic recreation of `portal-execution-edge-source-proxy-1` with a
separate Manager-v2 config/env. It does not modify the Execution Edge,
projection PostgreSQL, D4 configuration, V1 gateway, roles/grants/indexes or
business data.

Rollback restores the exact previous D2-dark Source Proxy env/config and
recreates only that proxy, then stops the two new Manager containers. It
revokes/removes only the new Manager leaf/key/runtime material after the
facade-login session check is zero. Any failed preflight or acceptance step
uses this rollback; it never falls back to a V1 route or direct database read.

## Decision boundary

This establishes the private source route and owner handoff. It deliberately
does not add a generic Manager call into the existing V1-only Rust transport or
turn returned data into a Portal projection/UI feature. A later screen or
projection request consumes the imported typed contract through a new bounded
Manager client, with its own data mapping and freshness semantics. That is a
separate product-consumer slice, not a reason to widen this route.
