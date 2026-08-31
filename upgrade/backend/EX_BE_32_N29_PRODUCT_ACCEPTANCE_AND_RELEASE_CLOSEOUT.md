# EX-BE-32 — N29 Product Acceptance and Release Closeout

**Date:** 2026-08-31  
**Branch:** `feat/execution-manager-campaign`  
**Runtime effect:** none  
**Backend verdict:** `ACCEPTED`  
**Product release verdict:** `NO_GO`

## 1. Outcome

N29 closes the finite N18–N29 backend campaign without hiding unfinished
backend work. The accepted inventory remains exact:

- 96 Trading System relations: 54 screen-bound, 16 projection inputs, 13
  audit-only and 13 intentionally internal;
- all 31 commissioned requests `BR-EX-41` through `BR-EX-71` have a named
  backend disposition;
- all 27 Portal read capabilities are connected, derived, deliberately dark
  or typed unavailable according to the N18/N28 registries;
- all nine requested command capabilities remain typed fail-closed until the
  single N28 owner contract is returned and verified;
- 23 screen contracts contain 22 available backend APIs and one honest typed
  unavailable API (`EXECUTION_ACCOUNT_BROKER_360_SCREEN`, owner gap MC-01).

The backend candidate is accepted. A product release is not authorized yet:
the reviewed frontend route still uses `createFixtureApi()`, and signed image
evidence can only be produced by the protected `main` publication workflow.
These are explicit delivery gates, not unnamed technical debt.
Existing React test warnings for async `act(...)`, duplicate keys and invalid
table whitespace are named under the same frontend acceptance gate and must be
cleared before Claude returns Product GO evidence.

## 2. Product gaps closed in N29

The final census review found two product requests whose underlying governance
foundation existed but whose narrow product API did not:

1. `BR-EX-69` — create an R1 approval from a completed research run;
2. `BR-EX-71` — query the stateful conditions/waivers register.

They are now closed rather than deferred.

### 2.1 Approval creation

`POST /api/v1/execution/governance/approvals` is a session-, workspace-,
origin- and CSRF-guarded TypeScript control-plane mutation. The server, not the
browser, resolves and pins the completed run artifact, creator, schema,
methodology claim and capture time. The write runs at PostgreSQL
`SERIALIZABLE`, uses a requester-scoped idempotency key, rejects a reused key
with different content, rejects duplicate open alpha/run requests, and writes
immutable audit evidence in the same transaction.

### 2.2 Conditions and waivers

`GET /api/v1/execution/governance/waivers` is a bounded, allowlisted,
bidirectional-keyset API backed by `governance_conditions_register`. It returns
exact total and filtered counts and derives `OPEN`, `WAIVED`, `EXPIRING` and
`LAPSED` server-side. Conditional approvals and change requests persist their
conditions atomically as immutable waivers/restrictions. Expiring or lapsed
conditions also enter the existing Command Center attention stream.

### 2.3 Storage compatibility

Migration `1723680000015_execution-product-governance.sql` extends existing run
and governance models without replacing their authority. It adds pinned run
artifact metadata, approval request provenance/idempotency fields, two partial
uniqueness boundaries and the read-only conditions view. Fresh migration and
custom-format PostgreSQL backup/restore are both required gates.

### 2.4 Frontend contract compatibility discovered by acceptance

The product-wide consumer gate found and closed three stale assertions rather
than carrying them as debt: the UI now recognises the Edge's two additional
typed 422 analytics failures (`ANALYTICS_CHART_RULE_VIOLATION` and
`ANALYTICS_RISK_SERIES_INVALID`), and its typed-unavailable fixture names the
actual unavailable Account/Broker 360 screen. These are compatibility fixes;
they do not replace the fixture-only route or claim frontend Product GO.

## 3. Release authority and evidence

The digest-bound N29 pack lives at
`services/portal-execution-edge-rs/contracts/n29-product-acceptance-v1/` and is
validated independently by Python and the pure Rust `product-acceptance`
crate. It binds the N18 census, N28 registry and owner request, screen
catalogue, frontend route, accepted N17B Paper evidence, release workflow,
recovery runbook and the four new governance artifacts.

The release profile, provisional SLO, dashboard template and rollback runbook
are committed under `deploy/`. They do not publish, deploy, open a network,
activate source traffic or widen command/Live authority.

The debt register is explicit:

- internal technical debt: zero;
- typed external owner gaps: nine, not backend-release-blocking and fail-closed;
- intentional exclusions: three, not release-blocking;
- product release blockers: `N29-FE-01` and `N29-REL-01` only.

## 4. Verification

Required gates and final results:

- Control API build, 27 files / 246 tests, fresh PostgreSQL and restore drill:
  pass;
- contracts, schemas, fixtures and generated OpenAPI types, 108 tests: pass;
- Rust workspace format, all-target tests, clippy `-D warnings`, qualification
  CLI and projection PostgreSQL restore: pass;
- frontend contract consumers, 91 files / 1,773 passed / 3 intentionally
  skipped, plus the production TypeScript/Vite build: pass;
- N20 screen-catalogue gate: pass;
- N29 manifest, inventory, authority, sensitive-pattern and debt gate: pass;
- campaign static gates N18–N29 and workspace/CI gate: pass.

The N29 tests cover mutation security, server-owned evidence, idempotent
replay, key conflicts, duplicate intent, missing/ineligible evidence,
cross-workspace isolation, concurrent retries, immutable conditions, exact
keyset/count semantics, lapsed state and Command Center integration.

The frontend run still emits pre-existing React `act(...)`, duplicate-key and
invalid table-row whitespace warnings. They do not invalidate the backend
candidate, but the warning-clean requirement remains explicit in
`N29-FE-01`; no Product GO evidence may be issued while those warnings or the
fixture-only transport remain.

## 5. Release sequence

1. Claude replaces the fixture-only frontend transport with the documented
   same-origin BFF calls and supplies UI consumer/parity evidence. The browser
   must never call Rust Edge or Trading System directly.
2. Re-run this N29 gate with the reviewed frontend digest and change
   `frontend_http_consumer` only after parity passes.
3. Bobby merges through the normal protected path. The `main` workflow builds,
   signs and attests immutable images.
4. Bind those protected image digests into the release manifest, run the
   documented smoke/rollback rehearsal, then issue Product GO in a new evidence
   revision.

No automatic merge, stable deployment or runtime mutation is part of N29.
