# EX-BE-32 — N29 Product Acceptance and Release Closeout

**Date:** 2026-08-31  
**Branch:** `feat/execution-manager-campaign`  
**Runtime effect:** none  
**Backend verdict:** `ACCEPTED`  
**Product release verdict:** `RELEASE_CANDIDATE_READY_PROTECTED_RELEASE_PENDING`

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
  unavailable API (`EXECUTION_ACCOUNT_BROKER_360_SCREEN`, owner gap MC-05).

The backend candidate remains accepted. Claude's N29-FE-01 return is now
independently accepted: the product import graph uses the same-origin HTTP BFF,
the fixture implementation is lab/test-only, the console guard is clean and
the controlled browser double rejects requests that leave the Portal origin.
BR-EX-72 is now delivered and independently verified: bounded Alpha Fleet and
Accounts & Bindings list/detail contracts use Portal projections over the exact
qualified Manager-v2 source set; both test doubles share one canonical Live
Review fixture; registry revision 6 publishes truthful delivery metadata. The
candidate is ready for the protected release path. Signed image evidence can
only be produced by the protected `main` publication workflow, so deployment is
still not authorized by this branch alone.

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
they do not claim frontend Product GO.

### 2.5 N29 closeout amendment

The frontend return exposed three request-attribution errors. The canonical
catalogue now pins Command Center promotion pipeline to `BR-EX-45`, Incident
Detail to `BR-EX-46`, Operations Queue to `BR-EX-47`, and Approval Inbox to its
historical approval-history request `BR-EX-35`. Tests assert the exact mapping
for every one of the 23 screens; a global-set equality can no longer hide a
swap. The Account/Broker 360 report reference is corrected from `MC-01` to
`MC-05`.

`BR-EX-72` was the only consolidated request admitted after the freeze. It owns
Alpha Fleet list, Accounts & Bindings list/detail, one canonical Live Review
fixture and the registry delivery-metadata amendment. It is a named product
request with a bounded acceptance contract, not hidden technical debt and not
permission to activate a source or command. Its delivery is recorded in
[`EX_BE_33_BR_EX_72_MANAGER_LISTS_REGISTRY_CLOSEOUT.md`](./EX_BE_33_BR_EX_72_MANAGER_LISTS_REGISTRY_CLOSEOUT.md).

## 3. Release authority and evidence

The digest-bound N29 pack lives at
`services/portal-execution-edge-rs/contracts/n29-product-acceptance-v1/` and is
validated independently by Python and the pure Rust `product-acceptance`
crate. It binds the N18 census, N28 registry and owner request, screen
catalogue, frontend route and import-boundary test, Claude return/evidence,
same-origin browser double, accepted N17B Paper evidence, release workflow,
recovery runbook and the four new governance artifacts.

The release profile, provisional SLO, dashboard template and rollback runbook
are committed under `deploy/`. They do not publish, deploy, open a network,
activate source traffic or widen command/Live authority.

The debt register is explicit:

- internal technical debt: zero;
- typed external owner gaps: nine, not backend-release-blocking and fail-closed;
- intentional exclusions: three, not release-blocking;
- resolved delivery gates: `N29-FE-01` and `N29-BE-72`;
- protected release blocker: `N29-REL-01` only.

## 4. Verification

Required gates and final results:

- Control API build, 28 files / 253 tests, fresh PostgreSQL and restore drill:
  pass;
- contracts, schemas, fixtures and generated OpenAPI types, 112 tests: pass;
- Rust workspace format, all-target tests, clippy `-D warnings`, qualification
  CLI and projection PostgreSQL restore: pass;
- frontend contract consumers after the integrated Codex amendment, 1,785
  passed / 3 intentionally skipped / zero failures, plus the
  production TypeScript/Vite build: pass;
- the focused same-origin preview/journey return remains 66 passed; the wider
  integrated Playwright parity is 309 passed / 16 intentional skips / zero
  failures, including 40 responsive viewport audits, origin containment,
  console/page-error rejection and the fixture-lab visual set;
- N20 screen-catalogue gate: pass;
- N29 manifest, inventory, authority, sensitive-pattern and debt gate: pass;
- campaign static gates N18–N29 and workspace/CI gate: pass.

The N29 tests cover mutation security, server-owned evidence, idempotent
replay, key conflicts, duplicate intent, missing/ineligible evidence,
cross-workspace isolation, concurrent retries, immutable conditions, exact
keyset/count semantics, lapsed state and Command Center integration.

The product graph boundary scan reports zero reachable fixture producers from
`ExecutionPreviewRoute.tsx`. `createFixtureApi()` remains only in lab/tests and
cannot satisfy the product acceptance gate. N29-FE-01 and N29-BE-72 are closed;
the candidate now waits only for protected release evidence.

## 5. Release sequence

1. Bobby merges through the normal protected path. The `main` workflow builds,
   signs and attests immutable images.
2. Bind those protected image digests into the release manifest, run the
   documented smoke/rollback rehearsal, then issue Product GO in a new evidence
   revision.

No automatic merge, stable deployment or runtime mutation is part of N29.
