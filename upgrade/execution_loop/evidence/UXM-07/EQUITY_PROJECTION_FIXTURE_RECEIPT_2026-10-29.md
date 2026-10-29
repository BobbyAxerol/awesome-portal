# R-C equity projection: fixture-only lane receipt (2026-10-29)

Agent B-P2, branch `claude/slice-rc` on `claude/slice-codex-consumers@868662724`. Lane: FIXTURE_LAB. Not a real-API, browser or acceptance receipt.

Decision applied (Codex, `CODEX_TO_CLAUDE_FOUR_REQUESTS_2026-10-29.md` section R-C, 9b8d4ed2c): `GET /api/v1/execution/deployments/{deploymentId}/equity-projection` is source-dark/unmounted (`EquityProjectionResponse.runtime_active` is the constant `false`). Real screens keep their typed absence. This slice builds a fixture-only route, a typed port method and a strict closed reader, and wires NO screen (no design or layout change was requested).

## What exists

| Piece | File |
|---|---|
| Fixture route (WP-R-C markers: one import, one dispatch block in `fixture-bff/app.ts`; row in `routeTable.ts` and regenerated `ROUTES.md`) | `apps/portal/fixture-bff/equity-projection.ts` |
| Strict reader, request builder, typed failure words, same-origin fetch | `apps/portal/frontend/src/execution/v2/readers/equityProjection.ts` |
| Port method `getEquityProjection?` (optional) | `src/execution/api/ports.ts`, `src/execution/api/httpApi.ts` |
| Reader conformance over the published fixture | `readers/equityProjection.conformance.test.ts` |
| Route over every world deployment | `src/fixtureBff/equityProjection.test.ts` |
| Reader guard group W125 | `src/fixtureBff/readerConformance.test.ts` |
| World ties W200 to W203 | `scripts/fixture-ties.mjs` (`runWorldTies`), `worldTies.test.ts`, `WORLD_TIE_CATALOGUE_2026-10-28.md` |

## How the fixture body is the world's

- Equity is the book's one level path (`bookLevels` over the deployment, the same path every other chart of it draws): it opens at the allocation on the first stage day and ends at `equityOf(deployment)` (allocation + realized + unrealized; a retired deployment has no open PnL). No account equity is read.
- A retired deployment (booked or history record) ends at its exit; the window is clamped to the deployment's life, so nothing is drawn or zero-filled before it began or after it ended.
- Drawdown = value / running max - 1 over the projection's own buckets (fraction, six decimals, `0` at a high).
- Currency and deployment id are the deployment's and the asked id. Interval is the finest canonical one at or below 5,000 buckets; buckets are aligned backwards from the last instant, so the last bucket is the end of the book. No gaps are served (the world has none); the gap, partial and zero-point cases are covered by the published fixture and its mutations.
- The band is an illustrative fixture band (equity -3% / +3%), joined to a fixture run id and digest, and the body carries the warning `FIXTURE_ILLUSTRATIVE_BAND`. It is not an approved, immutable Research artifact. Retention says `retention.fixture.v1`.

## Reader rules (beyond the schema, named groups)

runtime_active and source_side_effect_requested are READ as the constants false; closed keys at every level (an own `__proto__` is an unknown key); decimals stay text; identity (asked deployment id, asked window); interval/seconds pair; RFC 3339 instants; strictly ascending points on the interval lattice of `requested_from` and inside the window; a null equity only inside a declared gap and always paired with a null drawdown; gaps ordered, non-overlapping, inside the window; `returned_buckets` equals the equities listed, `coverage` equals returned / expected; COMPLETE claims no gap and no missing bucket; zero returned buckets may not claim ok/partial and is exposed as `isEmpty` with no invented point; drawdown in [-1, 0]; the band names the joined run and the series' digest; 5,000 cap on points, band points and gaps. It never throws; the port wrapper returns `projection` or `failed` with one of `INVALID_REQUEST NOT_FOUND DENIED UNAVAILABLE NETWORK ABORTED UNREADABLE UNSUPPORTED_SHAPE MISMATCH NOT_OFFERED` (plus the named refusal reason); server prose is never read.

## Tests run (all green)

| Scope | Result |
|---|---|
| `equityProjection.conformance.test.ts` (new): published fixture (schema-valid, digest-checked), dark-route constants, 40 named negatives (zero points, missing, gap, mismatched deployment, mismatched band lineage, over the cap, unknown key and more; schema-invalid ones proven invalid first), required keys, pollution, bad roots, request, fetch | 58 passed |
| `src/fixtureBff/equityProjection.test.ts` (new): every world deployment (booked, retired, history, generated at medium scale) at 1d/7d/30d/90d/1y: schema-valid (all ids at 1d/7d, first and last id at every window), strict-reader accepted, last equity = world equity, retired end at exit, drawdown formula, band lineage, interval choice, determinism, refusals | 11 passed |
| `worldTies.test.ts` with W200 to W203 (checks: 201 / 9 / 102,280 / 160, 0 violations) | 87 passed |
| `readerConformance.test.ts` with group W125 | 28 passed |
| titleAbsence, ticketGuard, v2Hygiene, boundary, absentValues, failClosed, productBoundary, disabledReason, `fixtureBff/server.test.ts` (ROUTES.md generated table) | 9 files, 454 passed |
| `scripts/research-preview/fixture-bff-config.test.mjs` | 19 passed (no nginx change: the route is under the existing fixture BFF proxy of `/api/v1/execution/`) |
| `tsc --noEmit -p .` (one complete run, background) | no error outside `features/roadmap-task-board` (worktree dependency noise) |

## What is fixture-only

Everything. The route exists only in the fixture BFF; the port method is optional and the HTTP port will get a 404/501 from the real API (typed `NOT_FOUND`/`UNAVAILABLE`). No screen reads it. The band, run id, digest, retention policy and the whole series are generated from the world, not a source.

## What a real producer would need (Codex's list)

1. Source equity and lineage for the deployment (same-deployment series, not account equity or the existing local query analytics series).
2. An authorized, same-workspace deployment (access decision before any read).
3. An approved, immutable Research run and band (run id and artifact digest that the Research side can attest).
4. An exact cut: the as-of, the bucket lattice, and how `requested_to` relates to the source cut.
5. Gaps and retention: real `gaps[]` reasons and the retention policy actually applied.
6. Source contracts for each input (equity, drawdown, run/band artifact).
7. Schema and runtime qualification: the schema's `runtime_active: false` constant would have to change under a new version (this reader would then need its own reader, by design), with the route mounted and qualified.

## Not covered

No screen, DOM, browser or visual check; no real-API call; no gaps served by the fixture route (only the published fixture and mutations exercise gaps); schema validation of the 1y windows is sampled (first and last deployment id) for run time; the interval/window rule is the fixture's reading of "finest canonical interval at or below 5,000 points", not a producer's.
