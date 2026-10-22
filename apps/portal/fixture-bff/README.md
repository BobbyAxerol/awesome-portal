# Fixture BFF

A server-side stand-in for the Control API BFF, so the Execution V2 screens can be reviewed for UI
and UX on a deployed preview with full, realistic fixture data.

> **NOT acceptance evidence.** Lane `FIXTURE_LAB`. Everything it answers comes from the e2e doubles
> and the published synthetic fixtures. Nothing here was read from a Trading System, a broker or a
> database, and nothing a reviewer does here is stored. A screenshot from this server shows how a
> screen *looks* with data of this shape; it proves nothing about what the real read returns.

## What it is

The Playwright specs already run the V2 screens against "doubles" (`apps/portal/frontend/e2e/bffDouble*.ts`)
that answer the BFF routes with contract-shaped bodies. This package puts the same doubles behind
`node:http` (no framework, no new dependency) so a browser, not only Playwright, can use them.

| Piece | Where |
|---|---|
| The pure answerer: request in, response out, `null` for "not mine" | `apps/portal/frontend/e2e/bffAnswerer.ts` |
| The doubles it composes | `apps/portal/frontend/e2e/bffDouble*.ts` |
| Volume (`FIXTURE_SCALE`) | `apps/portal/frontend/e2e/bffScale.ts` |
| The HTTP server | `app.ts`, entry `server.ts` |
| The bundle | `build.mjs` writes `dist/server.mjs` |
| The route table | `ROUTES.md` |
| The tests | `apps/portal/frontend/src/fixtureBff/` |

The Playwright stubs are unchanged in behaviour: a golden file recorded from `stubExecutionBff`
before this package existed (882 requests) is asserted byte for byte, and the new answerer is held to
the same answers (`src/fixtureBff/equivalence.test.ts`).

## How it relates to the real BFF

It answers the same routes with the same body shapes as `apps/control-api` for the reads the V2
screens make, and nothing else. `ROUTES.md` lists every route, who answers it here, who serves it for
real, and the published schema its body is judged against. Of the 100 rows, 31 bodies validate against
a published schema, 11 are known to differ from one (reported as `DRIFT`, never hidden), and 58 have
no published schema that fits.

It never reads a request header, so it cannot be told who is calling; the session capabilities and
the user id are configuration. It also answers the four reads the browser shell makes before any screen
(`/api/auth/context`, `/api/v1/portal/registry|links|summary`; `e2e/bffDoubleShell.ts`), so the preview
needs no Control API to sign in: the identity is a synthetic, labelled "Fixture reviewer" (`fixture: true`),
and no session, cookie or token is ever minted or accepted. Sign-in, sign-out, password change and CSRF
are refused. Anything it does not model is refused, not invented:

- an unknown path is `404 {"error":"FIXTURE_ROUTE_NOT_SERVED"}`;
- a write the doubles do not model is `405 {"error":"FIXTURE_METHOD_NOT_ALLOWED"}`;
- the writes the doubles do model answer exactly as they do for the specs (a command plan is always
  the canonical `BLOCKED` answer, with `source_side_effect_requested: false`).

Be aware of what the modelled writes are: answers that **store nothing**. Creating an approval,
acknowledging an operation or "applying" one answers success here and changes nothing on the next
read, while the real relay is off (the published `apply` route answers `409 COMMAND_RELAY_DISABLED`).
If that would mislead a reviewer, set `FIXTURE_WRITES=refuse`: every non-GET is then `405`.

Every response, including every refusal, carries `X-Fixture-Lane: FIXTURE_LAB`.
`GET /__fixture/lane` returns `{"lane":"FIXTURE_LAB","not_acceptance":true,"source":"e2e doubles + published synthetic fixtures", ...}`
plus the active scale, clock and write mode.

## Run it

```bash
cd apps/portal/frontend && npm ci          # rolldown (already a Vite dependency) is the bundler
cd ../fixture-bff
node build.mjs                             # -> dist/server.mjs, plain Node >= 20, no node_modules needed
PORT=4100 FIXTURE_SCALE=medium node dist/server.mjs
curl -si localhost:4100/__fixture/lane
```

`dist/server.mjs` reads the published fixtures at start from `<root>/packages/contracts/fixtures`,
found by the same relative path the doubles use from `e2e/` (four levels up). `dist/` is the same
depth as `e2e/`, so an image must place `dist/` and `packages/contracts/fixtures/` at matching
positions under one root, for example `/app/apps/portal/fixture-bff/dist/server.mjs` and
`/app/packages/contracts/fixtures/`.

Tests (run from `apps/portal/frontend`; they build and spawn the bundle too):

```bash
npx vitest run src/fixtureBff
```

## Environment

Read through `loadConfig`; no file, no secret. A bad value stops the process with exit code 2.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `4100` | listen port |
| `FIXTURE_HOST` | `0.0.0.0` | bind address. Wide open on purpose: the container network is private and nginx is the only caller. Never publish this port |
| `FIXTURE_LANE_LABEL` | `FIXTURE_LAB` | value of `X-Fixture-Lane`; must start with `FIXTURE_LAB` |
| `FIXTURE_SCALE` | `medium` | `small` (the specs' rows), `medium`, `large`: see `ROUTES.md` |
| `FIXTURE_REVIEW_PROFILE` | `sparse-realistic` | `sparse-realistic` preserves existing answers; `populated` adds Manager data and known account links; `layout-stress` also uses long display labels and denser series. Server/test-only, not a UI flag |
| `FIXTURE_NOW_ISO` | `2026-08-22T13:00:00Z` | instant the generated operations are placed relative to (see the clock note in `ROUTES.md`) |
| `FIXTURE_USER_ID` | `principal-visual-baseline` | the id of the fixture user: `/api/auth/context`, `/api/admin/access/self` and the Access screen all describe it. It is a label, not an account; there is no reason to change it now that the fixture signs itself in |
| `FIXTURE_WRITES` | `doubles` | `refuse` turns every non-GET into `405` |
| `FIXTURE_VARIANTS` | none | JSON picking a double's state, for example `{"overview":{"blotter":"stale","admin":"partial"},"users":"verified"}`. Keys and values are validated: `overview` takes `commandCenter`, `fleet`, `operations`, `blotter`, `admin`, `stream` (see `bffDoubleOverview.ts`), `users` takes `paged`, `verified`, `empty`, `denied`, `broken`. The access screen's states are chosen by `?workspace_id=` (`ws_TEST_ONLY`, `ws_TEST_GRANTS`, `ws_TEST_EMPTY`, `ws_TEST_DENIED`, `ws_TEST_UNAVAILABLE`, `ws_TEST_MALFORMED`, `ws_TEST_OTHER_USER`) |

Limits: request bodies are capped at 1 MiB (`413`), header and request timeouts are 10 s and 15 s,
there is no outbound network call and no state between requests. Answers are deterministic: the same
request twice gives the same bytes (volume is generated from a fixed seed, with no `Math.random`
and no clock).

## Explicit populated/layout review (22 October 2026)

Use the **same HTTP API and the same accepted frontend**, but a separate fixture origin/process.
Never catch a failed real Edge read and substitute a fixture. The existing sparse-realistic default
and L0 canonical files are unchanged. `X-Fixture-Profile`, `X-Fixture-Lane`, `/__fixture/lane` and
`/__fixture/review` identify the active lane. `/__fixture/review.html` is a plain link index, not a
new product screen.

- `populated`: all six Manager dataset surfaces; exact-string NAV/RETURN/NET_PNL with 240 points;
  shared scaled resource IDs, text search/filter/sort/grouping and bound forward/back cursors.
- `layout-stress`: the same contract, with 1440 points and long UTF-8 display labels. Select
  `FIXTURE_SCALE=large` for 120 generated Alphas, 240 accounts and 1500 blotter orders. Responses
  remain paginated/bounded; a large universe is not permission to render all rows at once.
- Both retain true zero, negative values, null/typed absence, explicit gaps and mixed-currency
  separation. Score remains `policy_pending`. Unsupported numeric/window/economic dataset queries
  are explicit 400s, not silently ignored. `ALL` and special negative workspaces keep their gaps.
- Three known Portfolio account aliases resolve to existing Account fixtures. This fixes links,
  **not** an economic tie-out across the historical fixture books. Unmatched IDs stay refused.
- This does not fill a missing contract or a hard-coded UI placeholder. Consumer gaps belong in
  the Claude handoff; they must not be hidden by relabelling synthetic source facts as qualified.

Run a disposable private process (stop with Ctrl-C):

```bash
cd apps/portal/fixture-bff
node build.mjs
FIXTURE_HOST=127.0.0.1 PORT=4100 FIXTURE_SCALE=large FIXTURE_REVIEW_PROFILE=populated FIXTURE_WRITES=refuse node dist/server.mjs
```

The standalone bundle build takes no product build. For browser measurements against an already
running loopback preview, run the focused config from `apps/portal/frontend`:

```bash
npx playwright test -c playwright.fixture-review.config.ts --workers=1
```

It starts its **own** bundled fixture servers on ephemeral loopback ports, intercepts every API
request inside the test browser only, and measures 25 routes/subtabs × two profiles × 1280/660px.
It records API bytes/status, console, page overflow and table/chart/panel bounds in test attachments.
No shared nginx, API credentials, database, accepted pixel baseline or real service is changed.
It is a fixture/UI probe, **not** a HiFi comparison or connected API acceptance receipt. Servers
are stopped after the run. Remove the profile environment variable to restore sparse answers;
turn the existing fixture overlay off for actual API review. No migration or data cleanup is needed.

## Cutover to the real BFF

When the real backends serve these reads, turn the switch off in the deployment (the compose service
and the nginx locations in `ROUTES.md`): the same paths then reach the real `control-api` again.
Nothing in the frontend changes, because the frontend has no fixture mode: it calls
`/api/v1/execution/**` and `/api/admin/**` as it always does, and
`src/execution/productBoundary.test.ts` keeps fixture producers out of the product bundle. This
package imports from the frontend's `e2e/` and `src/execution/*.fixtures`; nothing flows the other way.

## Keeping it honest

- Change a double and run `npx vitest run src/fixtureBff`. If the Playwright answers moved, the
  equivalence test names the request; re-record the golden file only on purpose
  (`FIXTURE_BFF_CAPTURE=1`, from a tree whose stub behaviour is the reference).
- Add a route to a double: add its row to `src/fixtureBff/routeTable.ts`, then regenerate the table
  with `FIXTURE_BFF_WRITE_ROUTES=1 npx vitest run src/fixtureBff/server.test.ts`.
- A route marked `DRIFT` is asserted to still drift. When a double is brought back in line with its
  schema the test goes red until the row's drift note is removed.
