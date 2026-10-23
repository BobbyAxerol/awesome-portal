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
| `FIXTURE_SCENARIO` | `positive` | WP-P review scenario (populated and layout-stress profiles; the sparse-realistic profile ignores it): `positive` (complete, linked world), `partial`, `stale`, `denied`, `empty`, `missing` (the former source-dark default), `zero`, `dense`. Switch at run time with `GET /__fixture/scenario?set=<name>` or `POST /__fixture/scenario {"scenario":"stale"}`, reset with `{"reset":true}`; in memory only. With `FIXTURE_WRITES=doubles` the lane-internal command story (`POST /__fixture/command-story/plan`, `/{operation_id}/apply`, `/retry`, `GET /{operation_id}/status`) walks plan, apply, status and retry in memory with one id set; it never reaches the product command routes |
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
- **SIMULATED derived metrics** (added 22 October 2026; every metric keeps `methodology_ref` / provenance `FIXTURE_LAB`,
  availability AVAILABLE unless stated). Exact decimals by integer arithmetic only; every sum, ratio and share stays inside
  ONE economic partition (domain, currency, basis, profile). `query_options.metric_keys` and `sort_fields` list the three
  row keys; `economic_partition_required_for` adds the two money ones.

| key | level | rule (SIMULATED) | real Edge source expected |
|---|---|---|---|
| `balance_total` | row (per partition) | allocation + net_pnl of that partition; typed absence when either is unpublished | account/ledger balance snapshot |
| `equity_30d_end_value` | row (per partition) | balance_total + unrealized_pnl; typed absence when unrealized PnL is unpublished (about 1 row in 7) | last point of the 30-day equity series |
| `return_30d_pct` | row | net_pnl * 100 / allocation, 6 places truncated, unit PERCENT, currency null; exact `0` when net_pnl is a true zero | certified 30D return with methodology |
| `net_pnl` | capital statement (per partition) | sum of that partition's rows' net_pnl, window null | fund/portfolio ledger PnL for the selected window |
| `return_30d_pct` | capital statement | net_pnl * 100 / initial_funds (denominator = initial_funds); typed absence for the second partition | TWR or money-weighted return on contributed capital |
| `max_drawdown_pct` | capital statement | first partition exact `0` (true zero), others a deterministic value -2.00 to -19.99 | peak-to-trough on the NAV series |
| `current_nav` | group by `portfolio_id` (per partition) | sum of the members' balance_total in that partition | portfolio NAV statement |
| `return_30d_pct` | group | group net_pnl * 100 / group allocation | portfolio return |
| `max_drawdown_pct` | group | deterministic negative; typed absence for about 1 group in 6 | portfolio NAV drawdown |
| `max_drawdown_pct` | row (per partition) | exact `0` when net_pnl is a true zero, else deterministic -2.00 to -19.99 (scaled by window); typed absence when allocation is unpublished | NAV-series drawdown of the book |
| `cost_drag_fees` / `_funding` / `_slippage` | row (per partition) | allocation * 5 / 2 / 1 bp * window days / 30, bigint, USDT of the partition; slippage a typed absence for about 1 row in 4 | fee, funding and fill-benchmark ledgers |
| `forward_observation_days` | row (per partition) | 5..40 whole days, unit DAYS, currency null, no window | forward-observation day count |
| small-scale rows | rows | with no generated universe the lane answers the e2e suite ids: alpha_a, alpha_b, alpha_c, alpha_d, alpha_btc_trend in portfolios pf_main (Main), pf_sat (Satellite), pf_core (Core); one single-book partition per row | real fleet / alpha rows |
| window presets | all six surfaces | `window` 7D / 30D / 90D, bare or JSON-quoted: `selected_window.resolved` = [FIXTURE_NOW - N days, FIXTURE_NOW]; AVAILABLE `net_pnl`, `return_30d_pct`, `max_drawdown_pct`, `equity_30d_end_value` (rows, capital, groups) carry that window; allocation, balance and NAV keep window null. net_pnl is the 30D base times 1/4 (7D), 1 (30D), 5/2 (90D), bigint; derived keys follow; a true zero stays `0`. `ALL` is the typed gap (`ALL_HISTORY_WINDOW_NOT_PUBLISHED`) with the windowed metrics as typed absences. Custom ranges stay 400 | a windowed metric published per preset by the source |
| `concentration_hhi` | group | sum of squared allocation shares of the members in that partition, unit RATIO, 0..1; typed absence when any allocation is unpublished | portfolio concentration (HHI) publication |

- **SIMULATED screen facts** (added 22 October 2026, `e2e/bffSimulated.ts`; opt-in: `simulated`, implied by `reviewManager`, on for the
  populated and layout-stress profiles, off for sparse-realistic). Same routes and readers as the real Edge; each key is an optional scalar on
  an open row or a published optional block, so the published schemas still validate. Exact decimals, bigint arithmetic, one currency per figure.

| key | route | rule (SIMULATED) | real Edge source expected |
|---|---|---|---|
| `page.status_counts` (FE-043) | `GET /operations` | integer tally of the same rows, each dimension ignoring its own filter, closed domain zero-filled (a bucket with no rows is a true `0`) | the server's own counts over the filtered query |
| `broker_sync.wallet_balance`, `.native_equity` | `GET /resources/accounts/{id}` | newest broker report of `acc_bnc_core`: 412880.25 / 414010.40 USDT; `acc_bnc_sub` has the wallet balance (118050.00) and no native equity (typed absence) | venue wallet balance and native equity from the broker report |
| `portfolio_allocations.budget_used`, `.budget_approved` | `GET /resources/accounts/{id}` | `acc_bnc_core` / `dep_btc_live`: used = `allocated_capital` 80000.00, approved 100000.00 USDT | PM budget statement (FE-017) |
| `portfolio_allocations.exposure_long`, `_short`, `_gross` | `GET /resources/accounts/{id}` | 61300.00 / 35100.00 (the published position notionals); gross = long + short by integer addition in USDT | PM exposure by side (A360-1) |
| `portfolio_name`, `strategy_name`, `deployment_name` | `GET /resources/accounts/{id}` (deployment and allocation rows) | Core, BTC Trend, BTC Trend live for `pf_core`, `btc_trend`, `dep_btc_live`; other ids stay ids | names on a deployment (FE-066) |
| `drawdown` series | `GET /views/equity-chart?metric=drawdown` (account) | running-peak ratio of the published equity points, six places truncated, currency null; a gap stays a gap; the equity series carries one dip (87400.00) so it is not flat | the financial drawdown series |
| `broker_sync.wallet_balance` + `GET /broker-bindings/{id}/exposure` (Accounts list) | `GET /resources/accounts/{id}`, `GET /broker-bindings/{id}/exposure` | Accounts list Physical equity = the account's `broker_sync.native_equity` (the wallet balance is a different figure and never a fallback); Σ Virtual = the exposure bucket `used` in the SAME currency, Headroom = the published bucket `headroom` (simulated for `bnc_main@BINANCE` as native equity less used, 216510.40 USDT, by integer arithmetic); Check = exact decimal comparison of virtual against physical, "Not available" when either is absent; Sleeves = `expected_account_count` else `account_count`. One account read and one exposure read per row for the first 50 rows, four at a time; later rows say so (the bindings row schema is closed) | bindings list carrying native equity, virtual sum, headroom and sleeve count per binding |
| `deployment_id`, `average_fill_price`, `fee`, `fee_currency` | `GET /screens/blotter` (FILLED order rows) | `dep_btc_live`, 61250.40, 12.35 USDT | order row publication (FE-052) |

  Not simulated, because the published shape forbids it: the queue `health.*` block (pending receipts, display lag, open exceptions: `OperationalQueueV2.page` is closed), queue-row Intent and Display (`OperationalQueueRowV2` is closed), and the incident children
  (evidence, operations taken, resolution gate, timeline: the incident path answers the strict V2 root, and `execution.incident-detail.v1` cannot share its path). Those stay typed absences.

- This does not fill a missing contract or a hard-coded UI placeholder. Consumer gaps belong in
  the Claude handoff; they must not be hidden by relabelling synthetic source facts as qualified.

### Package6 linked finance refinement — 24 October 2026 (Asia/Saigon)

For generated Accounts in populated/layout-stress, `review-finance.ts` joins the
same deployment graph as Manager, fenced by account/environment/portfolio and
currency. It publishes the graph's portfolio/alpha labels, not IDs renamed as
names. Existing native/adverse fixtures are preserved.

The synthetic PM scenario explicitly sets risk/margin budget used to10% of gross
exposure and approved to used+500 currency units. This is **fixture methodology**,
not a production leverage/budget rule or a rename of allocated capital. Gross
exposure is the graph's deployment exposure; alternate long/short books partition
it, with zero a real scenario value. Currency and source `updated_at` follow that
deployment. Wallet/equity stay distinct through the existing shared physical book.

Blotter order facts reuse the existing exact VWAP/fee helper over complete bounded
25-order source pages when the public100-fill array is cut. Up to60 in-process
fixture pages, no network/real adapter. The returned order/fill page is unchanged;
only already-selected order IDs with matching account/mode/venue/client IDs are
enriched. Missing/failed source traversal removes uncertain summary facts; mixed
commission currencies never become one scalar fee. No fixture constant or derived
amount is promoted into a real producer allowlist.

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
