# EDS-04 — Alpha, Portfolio, Account and Binding resource BFFs

**Status:** `COMPLETE / VERIFIED / SERVER_SIDE_ONLY / NO_RUNTIME_MUTATION`  
**Campaign branch:** `feat/eds-current-bff`  
**Scope date:** 2026-09-05

## Goal

Replace the remaining resource-detail joins in the browser with four named,
same-origin Portal operations:

| Product resource | Named Portal operation | Route |
|---|---|---|
| Alpha 360 | `executionAlpha360ResourceV1` | `GET /api/v1/execution/resources/alphas/{alpha_id}` |
| Portfolio 360 | `executionPortfolio360ResourceV1` | `GET /api/v1/execution/resources/portfolios/{portfolio_id}` |
| Account / Broker 360 | `executionAccount360ResourceV1` | `GET /api/v1/execution/resources/accounts/{account_id}` |
| Binding detail | `executionBindingResourceV1` | `GET /api/v1/execution/resources/bindings/{binding_id}` |

The existing Fleet, Portfolio register and Binding register remain named
server-side list operations.  Rich React components stay mounted; only their
data adapter changes.  A missing branch changes that panel to an exact typed
state, never the whole screen to a generic unavailable page.

## Boundary and invariants

- The browser sends only an opaque resource id and optional environment where
  the operation permits it. It never receives relation names, source cursors,
  Edge URLs, mTLS material, delegated JWTs, source handles or database input.
- The Control API reads the already accepted SGP profile-bound projection only.
  It does not connect to the Trading System database, Source Proxy, Redis,
  broker, CLI or an arbitrary Edge route.
- Identity is resolved from the complete local projection **before** applying
  the 200-row/1-MiB product page bound. A detail operation must not fetch a
  bounded Fleet/list page and filter it afterwards.
- A resource resolver may use only declared keys:
  `alpha_id -> strategy_id`, `deployment_id -> strategy_id/account_id/mode/venue`,
  `portfolio_id -> allocation -> deployment_id`, `account_id`, and
  `binding_id -> venue_account -> account_id`.
- `portfolio_id` alone is permitted only for the portfolio row, portfolio
  allocation and portfolio-equity relations. It is never used to select an
  account, position, order, fill or session. Transactional rows require an
  explicit deployment id or a declared full tuple that is unique in the
  resolved resource scope; the historic two-of-four heuristic is forbidden.
- `READY`, `PARTIAL`, and `STALE` carry non-null panel data. `EMPTY`,
  `UNAVAILABLE`, and `DENIED` carry typed null/empty branches with a precise
  reason code. Financial values remain exact decimal strings with explicit
  currency; mixed or missing currency is a typed refusal, never a float sum.
- Returned temporal fields retain canonical UTC milliseconds (`read_at_ms`,
  `as_of_ms`) plus ISO compatibility aliases. Current observations and
  retained range observations remain separately labelled.

## Delivery design

```text
private Edge Manager-v2 -> existing profile projection -> exact resource resolver
                                                        -> named resource DTO
                                                        -> same-origin BFF
                                                        -> frozen rich UI panels
```

1. Read all relevant Paper/Sandbox/Live snapshots only after the existing
   freshness ceiling check. Preserve each profile's availability, freshness,
   completeness, as-of and projection revision.
2. Resolve resource parent identity in every profile. Duplicate or ambiguous
   keys return `PARTIAL`, not an arbitrary first row. Absence from a complete
   profile is `EMPTY`; absence from a partial profile is `PARTIAL`.
3. Derive a server-private scope from the accepted parent rows, then select
   every child relation with that exact scope. Orphan rows are rejected and
   represented in panel metadata rather than attached to another resource.
4. Compose source facts, balances/margin/sync/binding, positions, deployment
   and allocation branches, equity/performance windows, reconciliation and
   safe Portal derivations. Preserve valuation/mark lineage warnings when the
   current source cannot prove an aggregate.
5. Make the frontend call exactly one named resource operation per detail
   screen. Existing query analytics stays an additive named BFF branch; it
   cannot erase identity/current facts if unavailable.

## Test matrix

- exact parent identity, unknown parent, duplicate parent and orphan child;
- target outside the first 200 global rows;
- source profile isolation and multi-profile resource composition;
- no `portfolio_id`-only transaction selection; no two-of-four tuple match;
- mixed/missing currency aggregate refusals;
- empty binding, margin and sync branches;
- opaque cursor / relation / source-address non-leakage;
- Alpha, Portfolio, Account and Binding rich route traversal, including all
  currently published tabs and a typed panel-local absence;
- same-origin HTTP consumer paths plus the existing contracts, Control API
  PostgreSQL restore, frontend unit and production-build gates.

## Out of scope

No profile activation, source polling/caching policy, runtime container,
network, Edge contract, Trading System, direct database, command relay or
mutation change is part of EDS-04.  Those remain separately governed.

## Closure rule

EDS-04 closes only when every resource detail surface consumes its named BFF,
all source coverage is visible as direct/derived/typed-gap at panel level, the
identity/deep-page/currency tests pass, and no browser code performs a Fleet
or register join to reconstruct a resource detail.

## Delivered implementation record

### Named server operations

`ResourceReadController` and `ResourceReadService` now expose only the four
named resource operations in the goal table.  They are authenticated by the
existing Portal session guard, validate an opaque resource identifier, check
membership, and pin the request to the configured projection workspace before
reading data. They accept only the optional `paper`, `sandbox`, or `live`
environment selector. There is no generic browser relation API.

The service reads only `ExecutionProfileProjectionRepository` after its
configured local-projection and freshness gates.  It does not connect to a
Trading System database, Source Proxy, Redis, broker, CLI, or raw Edge route.
The browser wire is stripped through the published field allowlist; internal
broker references, source cursors, relation handles, URLs, mTLS material and
delegated credentials cannot cross this boundary.

### Exact resource semantics

- Complete accepted snapshots establish resource identity before any page is
  bounded, so a valid target beyond a global first page remains addressable.
- Alpha, portfolio, account and binding scopes follow only the declared
  identity graph.  Portfolio-only selection never attaches transactional
  orders/fills/positions/sessions; a full deployment tuple must be unique.
- Each relation is capped at 200 rows and the final DTO at 1 MiB.  Both return
  panel-local typed `PARTIAL` states (`EDS04_RESOURCE_RELATION_ROW_BOUND` or
  `EDS04_RESOURCE_RESPONSE_BYTE_BOUND`), never an invented next cursor or an
  oversized response.
- Profile allowlisting is the union of already published profile schemas, not
  a new poll or activation.  This preserves accepted `margin_balances` facts
  when a detail view composes more than one execution profile.
- Projection deduplication includes account, binding, sync, currency,
  instrument and symbol identity.  In particular, same-account multi-currency
  balances can no longer collapse into one row.

### Rich UI integration

The four frontend containers consume one same-origin resource DTO per detail
route.  Alpha 360, Portfolio 360 and Account/Broker 360 keep their approved
rich composition even when a source branch is empty, partial or unavailable;
only the affected panel receives a typed state.  Binding detail is likewise
resource-backed.  No client Fleet/register join remains to reconstruct a
detail screen.  `deployment.active` is explicitly fail-closed: absent is not
an active deployment.

## Verification evidence

- `./scripts/control-api-test.sh`: Control API TypeScript build, **41 test
  files / 360 tests**, real disposable PostgreSQL and restore-signature drill
  passed.
- CI-equivalent Portal frontend run in a complete disposable repository
  mirror: **98 test files / 1,829 tests passed / 1 skipped**, then
  `tsc -b && vite build` passed.
- Visual review confirmed that the Alpha, Portfolio and Account detail
  compositions remain rich while their panels now render accepted resource
  facts. Their three reviewed baselines were intentionally refreshed from the
  inspected BFF output, then the exact no-update replay passed **3/3**. The
  visual runner uses a disposable full mirror; it never records a baseline
  implicitly in the source worktree.

## Closure and next phase

EDS-04 has no remaining implementation debt within its approved scope.
Current-source facts that are not published remain explicit typed gaps at the
panel boundary; they are source truth, not hidden client fallbacks.  The next
backend phase is **EDS-05 — Portal derivations, governance and operational
composition**.
