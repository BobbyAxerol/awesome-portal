# EX-BE-23 — N20 Canonical Screen BFF Contracts

**Status:** `COMPLETE / SOURCE_DARK / TD-EX-01_CLOSED / N21_READY_NOT_STARTED`  
**Date:** 2026-08-30  
**Branch:** `feat/execution-manager-campaign`  
**Runtime effect:** none

## 1. Goal and result

N20 establishes one browser-safe, workspace/resource-scoped contract boundary
for every commissioned Execution screen. The browser no longer has a supported
route to Manager relation envelopes. Existing narrow screen APIs remain
available; unfinished payload APIs are represented by an explicit,
non-retryable `TYPED_UNAVAILABLE` branch rather than smoke or a generic query.

The resulting catalogue contains exactly:

- 23 screen surfaces;
- all 31 requests `BR-EX-41` through `BR-EX-71`;
- 10 already-available narrow APIs;
- 13 stable future APIs marked `TYPED_UNAVAILABLE` with an exact reason and
  delivery phase;
- seven canonical UI states: `ready`, `empty`, `stale`, `partial`, `denied`,
  `unavailable`, `error`.

BR-EX-55 is declared as a dependency of every screen. BR-EX-58 is declared
only on Paper/Sandbox/Canary/Live stage workbenches. BR-EX-61 is bound to the
Sandbox Certification screen. This closes the cross-screen gap without
inventing a raw table API.

## 2. Public contract

Session-guarded Control API endpoints:

```text
GET /api/v1/execution/screen-contracts
GET /api/v1/execution/screen-contracts/{screen_id}
```

Both endpoints resolve the active Portal actor and workspace. Detail requests
also enforce the declared resource kind and whether `resource_id` is required.
Admin-only screens are removed from a USER catalogue and return a typed 403 on
direct access.

Each screen definition publishes only:

- UI route and resource scope;
- required Portal roles and BR-EX ownership;
- semantic source authorities and capability names;
- one narrow versioned data API or a typed-unavailable API contract;
- the seven-state UI contract;
- an explicit `SERVER_ONLY` composition policy for joins, verdicts, counts,
  filtering, sorting, SLA and permissions.

Manager relations, SQL names, Redis keys, upstream hosts, credentials and raw
source envelopes are absent from the public schema.

## 3. Contract artifacts

- JSON Schema: `packages/contracts/schemas/execution-screen-bff.v1.schema.json`
- OpenAPI: `packages/contracts/openapi/execution-screen-bff.openapi.json`
- generated TypeScript: `packages/contracts/generated/execution-screen-bff.d.ts`
- canonical UI-state fixture:
  `packages/contracts/fixtures/execution-screen-bff.ui-states.valid.json`
- typed-unavailable fixture:
  `packages/contracts/fixtures/execution-screen-bff.unavailable.valid.json`
- strict frontend compatibility reader:
  `apps/portal/frontend/src/execution/screenBff.ts`

The generated type is produced by the normal contracts generator, not copied
by hand. The frontend reader rejects unknown schema versions, incomplete state
sets and undeclared delivery statuses.

## 4. Raw source retirement

The two former browser-shaped current-source routes now return HTTP 410 with:

```json
{
  "error": { "code": "N20_RAW_SOURCE_BROWSER_FORBIDDEN" },
  "details": {
    "availability": "UNAVAILABLE",
    "reason_code": "USE_CANONICAL_SCREEN_BFF",
    "retryable": false
  }
}
```

This does not remove the sealed Rust/Source Proxy compatibility authority used
server-to-server. It removes only the browser's ability to select or consume a
Manager relation. `TD-EX-01` is therefore closed.

## 5. Verification

- contracts generator: pass;
- dedicated `execution-n20-screen-bff-test.sh` static gate: pass;
- schema/generated-type/fixture suite: 88/88 pass;
- Control API TypeScript build: pass;
- full fresh-PostgreSQL Control API suite: 23/23 files, 212/212 tests pass;
- focused N20 auth/RBAC/workspace/resource/raw-route suite: 6/6 pass;
- frontend contract consumer: 2/2 pass;
- production frontend build: pass;
- dump/restore rehearsal on the isolated N20 PostgreSQL database: pass;
- raw-source/secret/source-origin scan and `git diff --check`: pass.

The test database, containers, network and Vite caches used for this phase are
temporary and are removed after evidence capture.

## 6. Explicit non-effects

N20 did not enable Paper, Sandbox or Live source traffic; publish an image;
change registry delivery profiles; migrate stable data; contact AWS-HK; alter
Trading System; or merge to `dev`/`main`. No frontend smoke payload is removed
by this contract-only phase.

## 7. Next phase

N21 is the next backend phase, but it has not started. It must close shared
multi-replica admission, cache isolation, freshness propagation, bounded
coalescing and `TD-EX-02` before wider source activation.
