# EDS-03 — Maximum current truth for Paper, Sandbox and Live stage screens

**Status:** `BFF_READY / FRONTEND_COMPATIBLE / VERIFIED / NO_RUNTIME_MUTATION`  
**Campaign branch:** `feat/eds-current-bff`  
**Scope date:** 2026-09-05

## Result

EDS-03 connects the frozen, rich Paper, Sandbox and Live product surfaces to
the maximum truthful subset of the current private Manager-v2 read plane. It
does this through named, server-side Portal BFF operations over the existing
profile-bound local projection; it does not make a browser query the Trading
System, Edge, Source Proxy, Redis, broker or CLI.

```text
Execution Edge Manager-v2 (private mTLS + delegated read identity)
                         │
                         ▼
            SGP profile-bound PostgreSQL projection
                         │ exact resource resolver, before pagination
                         ▼
      named Paper/Profile/Live same-origin Portal BFF DTOs
                         │ typed panels + UTC milliseconds + exact decimals
                         ▼
        existing approved rich Paper/Sandbox/Live screen composition
```

The rich route remains mounted on every accepted state. A missing, stale,
partial or unqualified branch changes only its own panel; it never replaces a
whole product route with a generic `Unavailable` page.

## Input authority and hard boundary

- E7 return validation remains pinned at **34 capabilities, 18 genuine source
  gaps and three measured profiles**. Every item in
  `maximum-data-return-v1/MANIFEST.sha256` verifies before implementation or
  test.
- This phase reuses the sealed EDS-01 Manager client and its profile,
  audience, delegated-JWT and mTLS binding. It introduces no generic route,
  relation, cursor, source address, credential or certificate to the browser.
- `ExecutionProductReadSource` reads only the accepted local
  profile-bound projection when `FEATURE_EXECUTION_LOCAL_PROJECTION=true`.
  A detail read cannot fall back to an Edge/global-page request.
- No Trading System database, Source Proxy, Redis, broker, CLI, command
  relay, profile activation, runtime container, cache policy or network
  topology changed in EDS-03.

## Exact resource semantics

`resolveDeploymentScope()` first finds the requested deployment in the full
accepted local snapshot, then creates an internal scope containing the exact
deployment, strategy, account, mode, venue and optional portfolio/external
account identity. The scope is applied **before** the Portal keyset/page bound
of 200 rows.

The resolver refuses the old unsafe joins:

- no first-global-page filtering;
- no `portfolio_id`-only detail lookup;
- no account-only expansion for transactional rows;
- no historical “two of four” strategy/account/mode/venue heuristic.

An explicit `deployment_id` wins. A relation without that key may use the full
four-part tuple only when that tuple identifies exactly one deployment.
Account-level records use the exact account key, broker records use the unique
external account reference, and portfolio equity uses the explicit portfolio
key. Missing or ambiguous identity stays `PARTIAL` with an `EDS03_*` reason;
absence from a complete projection is `EMPTY`, never a fabricated 404.

## Current stage coverage

| Product surface | Source-backed current truth now composed | Honest panel-local gaps retained |
|---|---|---|
| Paper Overview | deployments, sessions, account equity and the existing Portal-owned derived overview insight | unactivated candles/latest/calendar and VNM constraints remain typed per E7 |
| Paper Workbench | exact deployment, positions, sessions, orders, fills, accounts, balances, margin, account/broker sync, venue account, reconciliation, account/portfolio equity and performance page branches | only a relation the current catalogue does not publish is typed unavailable/partial; no cross-deployment widening |
| Sandbox Overview / Certification | profile-bound deployment, account, position, session, balances, margin, account/broker sync, venue account and reconciliation branches | unsupported certification/runtime facts remain individual typed panels, not synthetic pass/fail facts |
| Live Overview / Full Operations | current deployment, position, orders/fills, balances/margin, broker sync and reconciliation branches; source-backed Live works even when Portal-owned Canary governance has no predecessor row | Canary comparison, market ticks, rollback evidence and production command activation remain typed gaps/false |

An authoritative complete Live source with zero rows is returned as `EMPTY`.
If the source itself is unavailable, Live preserves its typed source refusal;
an absent Canary record never disguises source failure as a fake source-backed
screen.

## Wire truth and financial safety

Every stage response adds the EDS-02 canonical `read_at_ms` and `as_of_ms`
clocks, plus recursively added `*_ms` values for recognized source timestamps.
The ISO fields remain only as compatibility aliases for older specialised
renderers. Exact decimal strings remain strings; no floating-point conversion
is introduced.

The current `positions_v2` publication does **not** prove a per-position
currency and mark/valuation lineage sufficient for a Portal monetary aggregate.
EDS-03 therefore shows the source rows but refuses to compute gross notional
or daily P&L. Those KPIs carry
`E5_POSITION_CURRENCY_AND_MARK_LINEAGE_UNQUALIFIED` instead of a plausible but
false number.

Balance and broker aggregates are emitted only when every included value has
one explicit, uniform currency compatible with the deployment/Canary currency.
Missing currency, mixed currency or mismatch yields a typed null
(`EXACT_DECIMAL_VALUES_REQUIRE_EXPLICIT_CURRENCY`,
`CROSS_CURRENCY_AGGREGATE_FORBIDDEN`, or an `EDS03_*_CURRENCY_MISMATCH`
reason). This is a closed safety rule, not a presentation workaround.

Each stage relation also gets a generated panel envelope with exact
availability, freshness, completeness, coverage/counts, opaque Portal cursor,
history semantics and panel-local gap reason. Current state and retained-range
semantics are distinct: equity/performance declare
`RETAINED_RANGE_OR_CURRENT_WINDOW`; transactional/account branches declare
`CURRENT_STATE_ONLY`.

## Frontend integration

The product consumers read canonical millisecond clocks and generated panels
first, retaining the old ISO route fields only during the versioned DTO
transition. Paper Overview uses the already-published server-side
`derived_insights` block for its cumulative-return/funnel panels; it does not
compute business truth in React. Sandbox and Live preserve their approved
tables/boards and use direct source rows only inside those panels.

No route hierarchy, CSS, approved layout, fixture lab, chart composition or
visual baseline was changed by this backend slice.

## Verification

```bash
python3 services/portal-execution-edge-rs/tools/validate_maximum_data_e7.py
(cd services/portal-execution-edge-rs/contracts/maximum-data-return-v1 && sha256sum --check MANIFEST.sha256)
sudo -n docker run --rm --read-only ... node tooling/generate-eds02-contract-source.mjs --check
./scripts/contracts-test.sh
CONTROL_API_TEST_NETWORK=eds03-control-api-final ./scripts/control-api-test.sh
# clean Node 22 Portal + embedded Planning graph
npm test && npm run build
```

**Recorded result:**

- E7 validator passed: **34 capabilities / 18 genuine source gaps / 3 profiles**.
- Every immutable return-pack manifest entry verified.
- EDS-02 generated-source reproducibility check passed in a read-only pinned
  Node 22 container.
- Contract workspace passed **117/117** and generated OpenAPI types are
  reproducible.
- Fresh PostgreSQL Control API build/test/restore passed **40 files / 354
  tests**. Focused regressions cover a deployment outside the first 200 global
  rows, profile/resource isolation, empty/partial scope, no direct AWS-HK
  fallback, unsafe mixed/missing currency aggregates and a source-backed Live
  page without a Canary predecessor.
- The N20, N29 and Phase-2 screen-BFF gates were repaired to pin the actual authority:
  **23 immutable E3 rows + exactly two BR-EX-72 list extensions = 25**. Its
  former hard-coded 23-total assertion contradicted the already verified
  EDS-02 contract authority; the replacement verifies the two extension IDs,
  operations, paths and N29 delivery phase individually.
- Clean Node 22 frontend gate passed **98 files / 1,826 tests / 3 skipped**,
  followed by a production build. The existing Vite chunk-size advisory is
  unchanged and EDS-03 adds no bundle/layout workaround.

The expected Nest warning lines in the integration suite are fault-injection
assertions; the suite and PostgreSQL restore drill completed successfully.

## Closed scope and next phase

There is no EDS-03 implementation debt. Current-source limits are represented
by exact E7/EDS03 typed reasons in the DTO rather than hidden, guessed or
deferred behavior. Deployment/runtime/browser acceptance remains a separate
owner-controlled release action because this phase deliberately does not alter
containers, credentials, runtime flags or network paths.

**Next:** **EDS-04 — Alpha, Portfolio, Account and Binding resource BFFs.** It
will reuse this exact resolver and panel contract for resource screens; it may
not reintroduce global-page filtering or client-side business joins.
