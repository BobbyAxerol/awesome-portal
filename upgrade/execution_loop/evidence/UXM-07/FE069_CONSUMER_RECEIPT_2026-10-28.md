# FE-069 consumer receipt: run-derived alpha catalogue (2026-10-28)

Agent B-P2, branch `claude/b-p2` on `claude/step-b-integrate@8ddf7c3ef`. Lane: FIXTURE_LAB. Not a real-API, browser or acceptance receipt.

Read: `ELP2-10/CLAUDE_FE069_PAGINATION_HANDOFF_2026-10-27.md` (docs/research-loop-plan), `CORE_INDEPENDENT_BACKEND_2026-10-27.md` (final landing receipt, backend `feafe56a`), `research-run-library.openapi.json` and `research-run-library.d.ts` (operation `researchRunLibraryAlphaCatalogueV1`), canonical `research-run-library-alpha-catalogue.synthetic.valid.json`.

## Per-ID verdict

| ID | Verdict | Evidence |
|---|---|---|
| `researchRunLibraryAlphaCatalogueV1` contract (`RunLibraryAlphaCatalogueResponse`, 200/400/401/403/404/503) | ACCEPTED | The one canonical valid body is schema-valid and read; 31 mutation negatives, every one refused with a closed word. |
| Cursor semantics (opaque, signed, workspace- and page-size-bound, expires; every page a fresh snapshot) | ACCEPTED as published; consumed as "restart, never resume" | No cursor outlives one traversal; a refused cursor ends it and the next attempt starts at page one. |
| "Not the Alpha Registry, not a complete strategy list, not create authorization" | ACCEPTED | The reader names the data `alphaCatalogue`, exposes no eligibility, and the picker still only lists candidates (server validates the triple on submit). |
| Canonical negative fixtures | CHANGES_REQUESTED (small) | Codex publishes ONE valid fixture and no negative file for this operation. Negatives here are mutations of that body (schema-invalid ones are proven schema-invalid first). Request: publish `research-run-library-alpha-catalogue.synthetic.negative.json` (more-pages with and without cursor, 201 items, out of order, repeated id) so consumers need not mutate. |
| Backend gap: none new | n/a | Nothing parsed from server strings; failure words come from HTTP status plus the one published error code `RESEARCH_RUN_LIBRARY_CURSOR_INVALID`. |

Fixture-lane finding, not a backend gap: the existing run double (`bffDoubleStage` RUN_ITEMS) serves alpha ids with underscores (`alpha_sol_break`). They are not valid `AlphaId` (`^[a-z][a-z0-9-]{2,63}$`), so the strict reader cannot list them and the catalogue fixture serves the world's alphas in the published spelling (`alpha-btc-trend`). On the fixture lane a catalogue alpha therefore has no run in the run double, and the reader types the run id (the existing typed-id path). That is a double fault in a file owned by another agent (`bffDoubleStage.ts`), left untouched.

## What was delivered

1. Reader, traversal and port method (`apps/portal/frontend/src/execution/v2/readers/runLibraryAlphaCatalogue.ts`): `readAlphaCataloguePage` (closed key allowlists, published id pattern, name hygiene, page-size and has_more/cursor pairing, in-page strict order, never throws), `alphaCatalogueUrl`, `failureForStatus`, `fetchAlphaCataloguePage` (typed failure words, no server prose), `traverseAlphaCatalogue` (cursor lives in the call only; cross-page order check; repeated cursor and page cap are refusals; `isCurrent` fence after every await). Port method `getRunLibraryAlphaCataloguePage?` added to `ExecutionApi` (`api/ports.ts`) and implemented in `api/httpApi.ts`; optional, so a port that lacks it leaves the form exactly as before.
2. Fence semantics. `complete` is the only state that is "the list". Partial (a later page failed: UNAVAILABLE, NETWORK, CURSOR_REFUSED, ORDER, PAGE_CAP) carries no alphas into the picker. Revocation or session loss (404 WORKSPACE_NOT_OBSERVABLE, 403, 401) and abort drop everything read. A cursor of another workspace or page size is refused by the server (modelled in the fixture) and by construction is never sent: the workspace and limit are fixed per traversal.
3. Consumer wiring (`screens/request/runLibrary.ts`, one argument in `useNewRequest.ts`): `useRunLibrary(enabled, api?, workspaceId?)` runs the traversal; the picker's `catalog` is the complete traversal. Otherwise it falls back to the run list's own `filter_catalog` only when that facet is under its 200 cap (a full facet is truncated), and never after a revocation. New state `alphaCatalogue` (`idle|loading|complete|partial|failed`) and `restartCatalogue()`. A workspace change resets to `loading` with nothing carried over, aborts the read and drops late answers. The form markup, copy and CSS are not touched (the existing "alphas of the loaded runs only" wording already covers the null case). No Research or Planning file changed.
4. Fixture route (`apps/portal/fixture-bff/alpha-catalogue.ts`, new; one import and one dispatch block in `fixture-bff/app.ts` inside `WP-B2-P2` markers; row in `routeTable.ts`/`ROUTES.md`; exact nginx location in `deploy/research-preview/nginx/fixture-bff/fixture-bff.conf` and its config test): world native alphas plus 230 synthetic `fixture-alpha-NNN`, sorted bytewise, 2 pages at 200 and 3 at 100; signed-looking cursor bound to workspace and limit; scenario workspaces `ws_TEST_CATALOGUE_EMPTY`, `_REVOKED` (404), `_FAIL_P2` (503 from page two).

## Tests run (all green)

| Command scope | Result |
|---|---|
| `readers/runLibraryAlphaCatalogue.conformance.test.ts` (new): canonical valid, 31 named negatives, required/null, schema_version, pollution, bad roots, URL, status mapping, fetch behaviour | 55 passed |
| `src/fixtureBff/alphaCatalogue.test.ts` (new): fixture route schema-valid per page, >200 traversal, empty, cursor fences, page failure, revoke, workspace change, snapshot drift | 25 passed |
| `screens/request/runLibrary.catalogue.test.ts` (new): hook over the traversal (11 tests) | included in the next row |
| `src/execution/v2/screens/request` whole folder (incl. the new hook test and all existing request/lookup/eligibility suites, unchanged) | 8 files, 506 passed |
| Hygiene and fixture lane: titleAbsence, ticketGuard, v2Hygiene, boundary, boundary.conformance, absentValues, `src/fixtureBff` (incl. ROUTES.md generated-table check) | 52 files passed, 1 skipped; 1766 passed, 1 skipped |
| disabledReason, productBoundary, failClosed | 3 files, 11 passed |
| `scripts/research-preview/fixture-bff-config.test.mjs` (node:test) | 19 passed |
| `npx tsc --noEmit -p .` | no error in any touched file after one unused-parameter fix; the only other output is the pre-existing missing-`react` noise from `features/roadmap-task-board` (that package has no linked node_modules in this worktree) |

No assertion was weakened; the nginx config test gained the new exact location in its allowlist and its one-quantbt-location assertion now names both exact locations.

## What remains real-source

Everything. This is fixture proof only: no call to the real `alpha-catalogue` route, no PostgreSQL-backed traversal in the consumer, no browser receipt and no picture of the form. The integrator still has to land backend `feafe56a` in the running image, and a real-API traversal must be seen with more than 200 run-derived alphas, a real revoke and a real expired cursor. The workspace id is not yet passed by the request screen (it has no workspace in hand; the session workspace applies), so the switch path is proven in the hook but not wired to a screen-level workspace until the shell exposes one.
