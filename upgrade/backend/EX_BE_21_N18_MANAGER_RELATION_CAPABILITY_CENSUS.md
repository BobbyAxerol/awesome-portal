# EX-BE-21 — N18 Manager Relation & Capability Census

Date: 2026-08-30  
Decision: `N18_CAPABILITY_DATA_COVERAGE_CENSUS_COMPLETE`  
Runtime effect: `NONE`  
Next gate: `N19_RUST_MANAGER_COMPATIBILITY_AUTHORITY`

## 1. Goal and result

N18 creates the single authoritative, source-dark inventory used by the
N19–N29 Manager Surface Expansion campaign. It closes the planning ambiguity
between the Trading System contract pack, the already-qualified Manager-v2
Paper subset, Portal capabilities and Claude's commissioned screens.

The exit gate passes: every known relation, read capability, command
capability and BR-EX request has a source, profile state, owner, consumer and
exactly one delivery phase. There are no duplicate or unclassified entries.

## 2. Frozen inventory

| Surface | Frozen count | N18 treatment |
|---|---:|---|
| Manager relations | 96 | classified and profiled, no source rows retained |
| Manager-v2 GET primitives | 5 | exact owner-published paths, N19 consumer |
| Gateway operations | 104 | 56 GET and 48 mutation candidates |
| CLI actions | 64 | seven direct-only actions explicitly forbidden to Portal |
| Portal read capabilities | 27 | screen consumers and profile truth frozen |
| Requested command contracts | 9 | inventory only; all runtime unavailable |
| Commissioned frontend requests | 31 | BR-EX-41 through BR-EX-71, one phase each |

Relation classification is complete: 54 `SCREEN_BOUND`, 16
`PROJECTION_INPUT`, 13 `AUDIT_ONLY` and 13 `INTERNAL_ONLY`. N18 does not turn
those into 96 raw table pages. Rust owns compatibility; TypeScript owns BFF
and control policy; the browser never selects raw relations.

## 3. Honest profile truth

The sanitized owner capture is reduced to `NONEMPTY` or `EMPTY`; approximate
row counts are intentionally discarded. Portal profile availability is kept
separate from source existence.

| Profile | NONEMPTY | EMPTY | UNAVAILABLE | NOT_APPLICABLE |
|---|---:|---:|---:|---:|
| Paper | 3 | 3 | 77 | 13 |
| Sandbox | 0 | 0 | 80 | 16 |
| Live | 0 | 0 | 80 | 16 |

`UNAVAILABLE` means the Portal adapter is not yet accepted; it does not claim
that the relation or business data is absent. Paper-only matcher relations are
`NOT_APPLICABLE` to Sandbox/Live. Internal relations are not product-profile
surfaces.

The corrected N17B exact baseline is frozen as:

- `account_equity_snapshots`
- `execution_sessions`
- `performance_snapshots`
- `portfolio_equity_snapshots`
- `positions_v2`
- `strategy_deployments`

Its accepted capabilities are `deployments.positions`,
`deployments.execution-quality` and `sessions.current`; product runtime stays
disabled.

## 4. Request allocation

The canonical §7.2 ledger now contains BR-EX-41–71 with one valid 17-column
row each. BR-EX-68 Admin Action Drawer and BR-EX-69–71 governance additions
are no longer hidden in prose. Delivery allocation is finite:

- N20: 16 canonical screen/BFF requests;
- N22: one full Paper read request;
- N23: five isolated Sandbox/Live requests;
- N25: five analytics/series requests;
- N26: one realtime request;
- N27: three governed command/workflow requests.

The later phase is the delivery plan, not unresolved N18 debt.

## 5. Immutable artifacts

- `services/portal-execution-edge-rs/contracts/manager-surface-census-v1/manager-surface-census.v1.json`
- `services/portal-execution-edge-rs/contracts/manager-surface-census-v1/manager-surface-census.v1.schema.json`
- `services/portal-execution-edge-rs/contracts/manager-surface-census-v1/MANIFEST.sha256`
- `scripts/execution-n18-census.py`
- `scripts/test_execution_n18_census.py`
- `scripts/execution-n18-census-test.sh`

The census binds thirteen sanitized source artifacts by SHA-256. A source,
ledger or canonical fixture change requires a reviewed regeneration and fails
the existing gate until then.

## 6. Verification

`./scripts/execution-n18-census-test.sh` passes:

- deterministic render equals the canonical fixture;
- exact completeness counts and duplicate-key rejection;
- 96/96 relation classification and three-profile coverage;
- corrected six-relation N17B baseline;
- 31/31 unique request IDs and exact phase allocation;
- 10 fail-closed mutation cases: duplicate relation/request, unclassified
  relation, missing profile, request-phase drift, secret/business-row content,
  authority widening and source digest drift;
- JSON parse, secret-shaped scan and manifest checksums.

The monorepo verifier and CI invoke the same N18 gate.

## 7. Scope and debt closeout

N18 made no network call and changed no AWS-HK, Source Proxy, Trading System,
database, Redis, CLI, migration, public route, credential, runtime flag or
stable deployment. No technical debt remains inside N18: all delivery work is
named in N19–N29 with an owner and exit gate. N19 may now build the Rust
compatibility authority against this exact frozen inventory.

