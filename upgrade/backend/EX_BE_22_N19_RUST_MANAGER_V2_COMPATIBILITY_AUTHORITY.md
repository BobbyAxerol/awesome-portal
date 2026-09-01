# EX-BE-22 — N19 Rust Manager-v2 Compatibility Authority

**Date:** 2026-08-30  
**Decision:** `N19_RUST_MANAGER_COMPATIBILITY_AUTHORITY_COMPLETE`  
**Runtime effect:** `SOURCE_DARK / PRODUCT_ROUTES_UNCHANGED / NO_STABLE_DEPLOYMENT`  
**Input authority:** N18 census digest `sha256:cb577bdd67eb8ffaf8ec8bb73ac273f064623f2acc7210cc8b2955439411cfe3`  
**Next named phase:** `N20_CANONICAL_SCREEN_BFF_CONTRACTS` (ready, not started)

## 1. Goal and result

N19 moves source compatibility ownership out of TypeScript relation mapping
and into one versioned Rust boundary. The Edge now loads the N18 96-relation
census and the N19 adapter matrix at startup, verifies their SHA-256 identity,
then binds every Manager request to the configured environment, exact profile,
delegated resource and owner contract revision before transport.

The result is complete for N19: all five owner-published Manager GET primitives
are constructible only through sealed Rust types; all 96 relation pages are
N18-allowlisted and authenticated-catalogue-bound; record keys and cursors stay
opaque; seven projections are fixed; current and simulated-future adapter
selection/rollback is versioned. No browser, TypeScript or caller can supply a
generic source URL, method, header, field list, SQL, Redis operation or
uncatalogued relation.

## 2. Delivered architecture

### Rust authority crate

`manager-compat-authority` is the canonical compatibility policy:

- compile-time includes the N18 census and N19 adapter matrix;
- verifies the exact N18 digest, 96 unique `public.*` relations, five GET
  operations and source-dark authority flags;
- recognizes exactly `paper/PAPER_BINANCE_USDM`,
  `sandbox/SANDBOX_BINANCE_USDM` and `live/LIVE_BINANCE_USDM` with delegated
  resource `execution:manager-v2:read`, while permitting a transport bind only
  for the qualified Paper profile; Sandbox and Live remain typed, dormant and
  fail closed until their later qualification phases;
- selects the current deployable owner runtime revision and rejects a
  qualification-only simulated-future adapter in a production binding;
- validates the complete owner catalogue as an exact set: missing and extra
  relations both fail closed;
- constructs catalogue, capabilities, relation-page, single-record and
  projection requests only through `manager-v2-contract`;
- publishes an explicit future-simulation → current rollback mapping without
  claiming that Trading System has published a new revision.

### Edge integration

`edge-service` loads the authority during startup. Startup fails if the census,
matrix or authority surface drifts. Private Manager handlers now obtain a
deployment-bound `BoundManagerAuthority`; catalogue and capability responses
are checked before being returned, and relation/projection requests are built
by the authority instead of directly by route code.

The accepted current-source path also validates the whole authenticated
Manager catalogue through the same Rust authority before applying its narrower
screen/source binding. TypeScript remains responsible for actor, workspace,
RBAC, governance and future narrow screen composition—not source relation
compatibility.

### Transport boundary retained

The existing `manager-v2-client` remains the only network transport and is
unchanged in authority:

- HTTPS-only, TLS 1.3-only mTLS;
- exact configured Source Proxy origin, no proxy inheritance;
- GET-only sealed request blueprints;
- redirect disabled and rejected;
- only `Accept` and generated `X-Request-ID` headers;
- no automatic retry;
- maximum two concurrent requests per replica;
- 200 rows, 1 MiB body and 4 KiB opaque cursor bounds;
- typed source/unavailable/contract errors and exact decimal preservation.

## 3. Version and rollback contract

| Adapter | Owner revision | State | Production bind | Rollback |
| --- | --- | --- | --- | --- |
| `portal.execution.manager-adapter.runtime-v1` | `trading-system.portal-execution.manager-v2.runtime.v1` | `ACTIVE_CURRENT` | allowed | current baseline |
| `portal.execution.manager-adapter.future-simulation-v2` | simulated compatible v2 | `QUALIFICATION_ONLY` | denied | runtime-v1 |

The simulated adapter proves coexistence, switch selection and rollback
without changing any Portal-facing screen contract or implying source
availability. A real future owner revision must enter as another immutable
matrix revision and pass the same exact-set/negative gates.

## 4. Tests and evidence

Dedicated gate:

```bash
./scripts/execution-n19-manager-compat-test.sh
```

Rust evidence:

- `manager-compat-authority`: 8/8 tests passed;
- `edge-service`: 25/25 tests passed;
- `manager-v2-contract`: 7/7 tests passed;
- `manager-v2-client`: 7/7 tests passed, including queue saturation,
  body/header/redirect bounds and typed 503 without automatic retry;
- Clippy for both packages/all targets: zero warnings;
- full-catalogue loop: 96/96 approved relations produce only sealed GET
  blueprints;
- five/five Manager primitives validated;
- wrong profile/resource/revision, unqualified Sandbox/Live transport and
  non-deployable future binding rejected;
- missing/extra relation catalogue drift rejected;
- cross-relation cursor reuse rejected;
- record key remains source-issued, and decimal `12.5000` remains exact;
- simulated future selection and explicit rollback to current passed;
- existing Manager client bounded concurrency/body/redirect/TLS tests remain
  in the full Rust Edge gate.

The static gate also verifies the contract manifest, exact transport policy,
no secret-shaped values and Edge integration. CI and the monorepo verifier run
the same gate before the full Rust workspace gate.

## 5. Security and runtime statement

N19 did not call AWS-HK, enable Source Proxy traffic, read business rows, add a
browser/product endpoint, change a database, activate Paper/Sandbox/Live,
enable SSE or command relay, publish an image, deploy dev/stable or change
credentials. The existing private internal Manager endpoints remain mTLS and
delegated-JWT protected and are not a browser contract.

No source, product route, profile flag, command, image or stable runtime was
changed by this phase.

## 6. Debt closeout

`TD-EX-03` is closed. Rust now owns the 96-relation/version/cursor/key
compatibility boundary, while TypeScript can be reduced in N20 to stable narrow
screen BFF composition. No unnamed N19 implementation debt remains; branch
merge and later runtime activation are explicit owner-governed transitions,
not completed effects of this phase.

Items owned by named later phases are not N19 debt:

- N20: browser-facing workspace/resource-scoped screen contracts;
- N21: Edge-global multi-replica admission (`TD-EX-02`);
- N22 onward: profile activation, durable projection, analytics/SSE and
  commands under their declared gates.

## 7. Next action

After Bobby explicitly starts it, N20 should build canonical TypeScript screen
BFF contracts over these unchanged Rust primitives. Claude can design against
typed N20 fixtures/states; it must not consume raw Manager envelopes or remove
smoke data before a matching N20 screen slice passes.
