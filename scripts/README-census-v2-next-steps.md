# Census v2: what changes when v2 is pinned

Status: the v2 candidate is `implemented` and `tested locally` (offline Python gate
`scripts/execution-n18-census-v2-test.sh`, and the Rust census-touching crates in a container). The pin slice
that follows this candidate moved the compat authority (Rust), the N19 matrix and activation, the N28 registry
and the N29 closeout to v2; the table below records what moved. Release behaviour is unchanged: a release
manifest enables only the relations it names (`restrict_to_pinned_catalogue`), so no T1 relation is readable
until a release file lists it. Defaults without a release manifest (`canonical()`) now require the full 109
relation catalogue, no longer 96.

## Warning for Core's compiler

Three relations inside the 96 v1 relations are `SOURCE_IDENTITY_SCOPE_GAP` in the E1 capture of
2026-11-16T10:54:04Z (`select_granted=false`, keyset `UNAVAILABLE_SOURCE_IDENTITY_SCOPE_GAP`), although
v1 recorded them as readable: `dnse_trading_tokens`, `venue_credentials`, `engine_authority_decisions`.
The v2 census keeps their v1 entries byte-identical, so the census alone does not say they are unreadable.
The compiler must take `access_status` from `maximum-data-return-v2/DATABASE_RELATION_CENSUS.csv` and
must not treat these three as readable.

## Rust constants and pins (moved in the pin slice)

All `sha256:` values below are computed in scratch from the committed v1 files by replacing only the
`n18_census_sha256` (matrix) or `adapter_matrix_sha256` (activation) string.

| Site | Was (v1) | Now (v2) |
|---|---|---|
| manager-compat-authority `src/lib.rs:39-40` `N18_CENSUS_DIGEST` | `sha256:cb577bdd67eb8ffaf8ec8bb73ac273f064623f2acc7210cc8b2955439411cfe3` | `sha256:cab031d8495c61b8d319bb84b5a7506840011daa263e08d3ee06b5f2cf48516c` |
| same file `:41-42` `N19_MATRIX_DIGEST` | `sha256:51d971d7029ac6d3028f5b8168bafbf40f6cd58c0cdd24fe4fc262316c5e3102` | `sha256:9ff30c0df4a1a2f1f123c0b4c9592116d9449def645f3ccc8a8dbad7724bbb8d` |
| same file `:43-44` `RUNTIME_ACTIVATION_DIGEST` | `sha256:6f38c74ac1cbd42aa6b17755e584fafdc9a429dd64217ccb37da88a5b2b460fa` | `sha256:d33e5c19627f2abaa1cc59b68e2d074d1ecc050632fa8ec6a516d506949f4c68` |
| same file census schema_version literal | `portal.execution.manager-surface-census.v1` | `portal.execution.manager-surface-census.v2` |
| same file `:875,877,878` relation counts | 96 | 109 |
| manager-compat-authority `src/tests.rs:83` `approved_relation_count()` | 96 | 109 |
| edge-service `src/main.rs:4792` test `approved_relation_count()` | 96 | 109 |
| product-acceptance `src/lib.rs:101` `summary.relation_count != 96` | 96 | 109 |
| product-acceptance `src/lib.rs:234` test `result.relation_count` | 96 | 109 |
| N28 registry file sha (derived artifact) | `93b6e3f4cae8709b4e7ed0c2f34d798076802a3026c155acc90e0f03437010b8` | `f655a6a5decc6be04e03cff7d3d42160d4743bbe25bc896240dfc150b8f9ec6b` |

The `schema_version` literal moved from ~:754 to :870 after the pinned-catalogue unit B.

Data files that also changed: the matrix `n18_census_sha256`, the activation `adapter_matrix_sha256`, the
N28 registry and N29 `n18_census_sha256`, the N29 relation counts (`scripts/execution-n29-product-acceptance.py`
:130/:497) and the N29 and EDS-12 ledgers. The N29 and EDS-12 values are produced by
`scripts/refresh-release-integrity-ledgers.sh --write`, committed separately after the pin slice.

## What stays on v1 on purpose

- `maximum-data-adapter` `src/lib.rs:67` and `:1067`, `src/tests.rs:29`, `maximum-data-acceptance`
  `src/lib.rs:54` (E5 and the maximum-data acceptance stay on v1: they pin the E5 publication, whose
  `manager_census_sha256` is the v1 census digest), `scripts/validate_maximum_data_e7.py:246`, the control-api
  EDS-11R registry generator and `scripts/control-api-test.sh`.
- Consequence: the compat authority knows 109 relations while the E5 publication and the TypeScript registry
  still describe the 96 of v1. The two are not cross-checked in code; a release that enables a T1 relation
  needs its own E5/registry update before Portal can show it.
- Every v1 file: `manager-surface-census-v1`, `maximum-data-return-v1`.
