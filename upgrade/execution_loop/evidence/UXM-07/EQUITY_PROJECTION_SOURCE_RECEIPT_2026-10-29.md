# R-C: source-backed equity projection V2, dark producer (receipt, 29 October 2026)

Branch `claude/ft-be` (base `claude/slice-followthrough` @ 04a0ceafe). Design: `EQUITY_PROJECTION_SOURCE_CONTRACT_DESIGN_2026-10-29.md`. Backend authority is Codex; this is a proposal for review.

## Plainly

* **The producer exists.** Contract V2, port, service, controller and a strict FE reader are built and tested.
* **Authorization and bounds are tested** against the real access engine (PostgreSQL cell): no grant / other workspace / explicit-workspace mismatch / wrong environment / exact audit DENY are all 404 before the port is touched; mid-flight grant revoke defeats the body; limit above 5000, zero, non-integer, bad window/intent/environment, unknown or duplicated key are 400; a malformed cursor is a distinct 400; no session is 401.
* **The source is NOT commissioned.** The only port implementation is `SourceNotCommissionedPort` (no I/O, no table, no query, no value). Every real body is typed absence for both series and band (`SOURCE_NOT_COMMISSIONED`). A fake in-memory port exists in tests only, to prove the service renders AVAILABLE correctly and refuses mismatches; it is not exported to production wiring.
* **The route is unmounted by default.** It mounts only when `ControlApiDependencies.equityProjectionSource === "SOURCE_DARK"`, which production does not set; no config flag was added. Asserted by a test against `AppModule.register`.
* **V1 is unchanged and still fixture-only** (`runtime_active` is still the constant false; its schema, OpenAPI, fixture, generated types, fixture-BFF and reader were not edited).
* **No screen is wired to V2.** B-P2's V1 fixture consumers are untouched. No V2 fixture route was added.
* **The connected receipt needs the Edge/Research-qualified inputs** listed in the design note (retained per-deployment series with workspace/currency/timestamp semantics/revision/digest/gaps/retention; approved immutable Research band with reference and digest; drawdown derivation confirmed by the source authority; `EQUITY_SERIES`/`EQUITY_BAND` policy purposes; schema/runtime qualification with real rows). Until they exist, no connected or browser acceptance is claimed.

## Decision for Codex: no field purpose added now

`LIVE_BLOCKERS` fits because it discloses columns of one governed row inside an environment-bound parent root. An equity series is a derived analytic that applies to any environment, while parent-field purposes are environment-bound with a fixed table. Independent series and band purposes would be 2 purposes x 3 environments = **6 new seals, raising `PARENT_FIELD_SEAL_CAP` from 32 to 38**, plus a new environment rule for the purposes, which is a policy-schema change better written against the commissioned source's real field list than guessed now. While dark, no source field is disclosed, so the exact current `audit.read` leaf on the DEPLOYMENT in the explicit environment is sufficient and is also the deployment-anchor check (no deployment table is invented; an ungranted deployment is the same 404 as any governed read). `NOT_AUTHORIZED` stays in each section's reason vocabulary for the future per-section authorization. Please confirm or request the purposes now.

## Contract summary

Sibling route `GET /api/v1/execution/deployments/{deploymentId}/equity-projection/source` (operationId `executionEquityProjectionSource`), body `execution.analytics.equity-projection.source.v2`, with explicit `workspace_id` and `environment`, `window`, `intent`, `limit` (hard max 5000), `cursor`. Series and band are independent AVAILABLE|ABSENT with closed per-section reason codes; the series has its own lineage (contract, revision, digest, as_of) and stated drawdown derivation; the band requires its own lineage (RESEARCH, immutable, approval reference, digest). Missing buckets are null, never 0; there is no interpolation.

## Commands and results

| Command | Result |
|---|---|
| `PATH=<scratchpad>/dockerbin:$PATH HOST_UID=$(id -u) HOST_GID=$(id -g) flock /tmp/portal-heavy.lock ./scripts/control-api-test.sh test/elp204-positive-parent.spec.ts` (disposable PostgreSQL cell; includes the cell's own build) | **345 passed / 345, exit 0** (317 existing incl. R-B, plus 28 new R-C test cases; no SQL of this change) |
| `npx tsc --noEmit -p tsconfig.build.json` (apps/control-api) | clean (exit 0) |
| `npx tsc --noEmit -p tsconfig.json` (apps/control-api, includes tests) | no errors in the new or edited files |
| `npx vitest run` (packages/contracts, host) | **113 files, 1918 tests passed** (includes the new `execution-equity-projection-source.spec.ts`, 16 tests) |
| `./scripts/contracts-test.sh` under flock (proves the new copy-list entry) | **113 files, 1918 tests passed, exit 0** |
| `python3 packages/contracts/tooling/snapshot.py --check` | matches **716** tracked files (711 + 5 new) |
| FE `vitest run`: cockpit, readers (incl. `equityProjectionV2.conformance.test.ts`, 42 tests) and the seven hygiene tests (disabledReason, absentValues, failClosed, productBoundary, titleAbsence, ticketGuard, v2Hygiene) | **63 files, 67795 passed + 5 expected fail** |
| FE `npx tsc --noEmit -p tsconfig.json` (errors under `features/roadmap-task-board` filtered as dependency noise) | clean |
| `scripts/execution-n29-product-acceptance.py --refresh-evidence --write`, then `execution-eds12-qualification.py refresh-static-input-digests --write` | **changed: true** both (new pinned inputs); pin files committed |

Earlier in the slice, `src/fixtureBff` had failures when run concurrently with tsc and the PG cell; it passed alone (53 files, 918 tests) and the final combined FE run above is green.

## Not done / not claimed

* No connected, Edge-source or browser acceptance; no screen consumes V2; no V2 fixture route.
* No SQL, migration or PG-spec of its own, by design.
* The generated `.d.ts` is checked by `verify-generated.sh` wiring but that script was not run separately (the generator `--check` mode and `snapshot.py --check` were).
