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
real, and the published schema its body is judged against. Of the 96 rows, 31 bodies validate against
a published schema, 11 are known to differ from one (reported as `DRIFT`, never hidden), and 54 have
no published schema that fits.

It never reads a request header, so it cannot be told who is calling; the session capabilities and
the user id are configuration. Anything it does not model is refused, not invented:

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
| `FIXTURE_NOW_ISO` | `2026-08-22T13:00:00Z` | instant the generated operations are placed relative to (see the clock note in `ROUTES.md`) |
| `FIXTURE_USER_ID` | `principal-visual-baseline` | the user the session and access reads describe; set it to the real principal id when the shell is signed in through the real `portal-api` |
| `FIXTURE_WRITES` | `doubles` | `refuse` turns every non-GET into `405` |
| `FIXTURE_VARIANTS` | none | JSON picking a double's state, for example `{"overview":{"blotter":"stale","admin":"partial"},"users":"verified"}`. Keys and values are validated: `overview` takes `commandCenter`, `fleet`, `operations`, `blotter`, `admin`, `stream` (see `bffDoubleOverview.ts`), `users` takes `paged`, `verified`, `empty`, `denied`, `broken`. The access screen's states are chosen by `?workspace_id=` (`ws_TEST_ONLY`, `ws_TEST_GRANTS`, `ws_TEST_EMPTY`, `ws_TEST_DENIED`, `ws_TEST_UNAVAILABLE`, `ws_TEST_MALFORMED`, `ws_TEST_OTHER_USER`) |

Limits: request bodies are capped at 1 MiB (`413`), header and request timeouts are 10 s and 15 s,
there is no outbound network call and no state between requests. Answers are deterministic: the same
request twice gives the same bytes (volume is generated from a fixed seed, with no `Math.random`
and no clock).

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
