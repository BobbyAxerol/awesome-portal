# Fixture BFF on the Research preview

**FIXTURE_LAB lane. Not acceptance evidence.** Every screen served while this is on shows sample data
of the right shape, not data read from a Trading System, a broker or a database. A fixed yellow banner
says so on every page, the login page included: `FIXTURE DATA - sample data for UI/UX review, not real
data, not acceptance evidence`.

## What it is

An opt-in overlay for the isolated Research preview (`portal-research-preview`, port 8095) that adds a
private service, `portal-fixture-bff` (`apps/portal/fixture-bff`), and changes `portal-web`'s nginx so
that only these paths reach it:

- the shell bootstrap, so the preview signs itself in with no Control API: `GET /api/auth/context`
  (a synthetic "Fixture reviewer"), `/api/v1/portal/registry`, `/api/v1/portal/links`,
  `/api/v1/portal/summary` (see "Shell bootstrap" below)
- `/api/v1/execution/**`
- `/api/admin/access/self`
- `/api/admin/profile-access/v2/effective`, `/self-navigation`, `/eligibility`, `/eligibility/batch` and
  `/self-context` (each exact)
- `/api/admin/accounts` and `/api/admin/accounts/**`
- `/api/admin/step-up`
- `/__fixture/**` (lane marker and health check)

Every other `/api/**` path (research, QuantBT, runs, the legacy profile-access reads, Planning) is sent by
`portal.conf`'s catch-all to `PORTAL_WEB_UPSTREAM`, which the overlay points at the fixture server itself
(`FIXTURE_WEB_UPSTREAM`, default `portal-fixture-bff:4100`), so it is **refused** there (`404
FIXTURE_ROUTE_NOT_SERVED`) and never forwarded to a Control API. The other four `/api/auth/*` routes
(`csrf`, `login`, `change-password`, `logout`) are also listed explicitly in the fragment, so a sign-in or
sign-out is refused even if `FIXTURE_WEB_UPSTREAM` is pointed back at a real Control API. `/api/health`
and `/api/ready` are exact locations of `portal.conf` and still go to `portal-api`. These fixture paths skip the Control API's session check on purpose, because the fixture server
answers synthetic data only; turn the overlay off to get the real, authenticated reads back.

## Turn it on

1. In the preview env file (outside the checkout, never printed) set the build-time V2 screen list:

   ```
   PORTAL_EXECUTION_V2_SCREENS=fleet,archived,portfolios,alpha,workbench,sandbox,canary,live,request,account,ops,profile,overview,cockpit,shell,compare,blotter,admin,users,replay
   ```

   That is all 20 keys. Only `archived` and `replay` are reserved: the build accepts them and they mount
   nothing (the Archived lens is part of `fleet`, Trade Replay is a tab of `alpha`), so listing or omitting
   them changes no screen. `workbench` (Paper), `sandbox`, `canary`, `live` and `request` (New request) are
   live screens: each key turns on its own V2 screen, and the cockpit's New request drawer rides `cockpit`.
   On this overlay the stage screens read the fixture doubles, so most of their cells say `Not available` or
   `Not published (FE-xxx)` by design.

   The umbrella flag `VITE_EXECUTION_PREVIEW_ENABLED` is already true in the preview overlay. Optional:
   `FIXTURE_SCALE=small|medium|large` (default `medium`), `FIXTURE_WRITES=refuse|doubles`,
   `FIXTURE_NOW_ISO`, `FIXTURE_VARIANTS` (see `apps/portal/fixture-bff/README.md`).
2. `scripts/research-preview/preview.sh fixture on` (creates the marker `fixture-bff.enabled`; it runs no
   docker and prints the next command).
3. `scripts/research-preview/preview.sh build portal-web portal-fixture-bff`, then
   `scripts/research-preview/preview.sh up`. The V2 screen list is baked into the `portal-web` image at
   build time, so changing it needs a rebuild.

`preview.sh fixture status` shows whether the marker is set. The marker only takes effect on the next `up`.

Nothing here needs the stack's `control-api` to be running: the sign-in state, the registry and every V2
read are answered by `portal-fixture-bff`, and `portal-web`'s upstream is the fixture service, so nginx
starts without resolving `control-api` (a stopped container has no DNS entry). Roll it out with the scoped
form, which never touches `control-api`: `preview.sh up portal-fixture-bff` then `preview.sh up portal-web`
(both run `compose up --no-deps`). The bare `preview.sh up` starts `portal-web` with its dependencies, which
include `control-api`: do not use it while the Control API must stay down. After a scoped `up` the script
probes `/__fixture/healthz` (not `/api/control/readyz`) while the marker is set.

## Shell bootstrap: what is served, how to cut over to the real API

The browser asks four things before it draws any screen. While the lane is on, nginx sends exactly these
to the fixture server, from `apps/portal/frontend/e2e/bffDoubleShell.ts` (the registry, links and summary
are the canonical fixtures `e2e/fixtures.ts` already stubs for Playwright; a test compares them):

| Request | Answer |
|---|---|
| `GET /api/auth/context` | `AUTHENTICATED` as **"Fixture reviewer"**, `authnMethods: ["fixture"]`, `fixture: true`, `lane: FIXTURE_LAB`. `principalId` is `FIXTURE_USER_ID` (default `principal-visual-baseline`) |
| `GET /api/v1/portal/registry`, `/links`, `/summary` | the canonical `registry.public.json`, `links.public.json`, `summary.healthy.json` |
| `GET /api/admin/access/self` | the manager capabilities the V2 Playwright lane grants (14 names), for that same user id |

Refused, never forwarded to a real API while the lane is on: `GET /api/auth/csrf`, `POST /api/auth/login`,
`/logout`, `/change-password` (404, or 405 with `FIXTURE_WRITES=refuse`) and `GET /api/v1/portal/capabilities`
(404), and every path below. No session, cookie, token or credential is minted or accepted: the server sets no `Set-Cookie`, reads
no `Cookie`, `Authorization` or CSRF header, and `sessionId` is the label `fixture-lab-no-session`. Not
served by the fixture, so refused with 404: `/api/v1/research/**`, `/api/v1/quantbt/**` (except `GET /api/v1/quantbt/runs`, the Run
Library list, which the fixture serves), `/api/runs`, `/api/strategies`, `/api/v1/alphas`, Planning. `/api/health` and
`/api/ready` still reach `portal-api`.

**Cut over to the real API:** `scripts/research-preview/preview.sh fixture off`, then
`scripts/research-preview/preview.sh up` (details below; the `portal-web` recreate needs a running
`control-api`, because its upstream is the Control API again). The nginx fragment is no longer mounted and
`PORTAL_WEB_UPSTREAM` is back to `control-api:4000`, so `/api/auth/*`, `/api/v1/portal/*` and the rest go
to the real Control API, the real login returns, and the frontend is unchanged. To keep the fixture
screens but let the other paths reach a healthy Control API, set `FIXTURE_WEB_UPSTREAM=control-api:4000`
in the env file instead of turning the lane off.

## Turn it off later

`scripts/research-preview/preview.sh fixture off`, then `scripts/research-preview/preview.sh up`. `portal-web`
is recreated without the fixture locations and the banner, and the same paths reach the real Control API
again. Remove the leftover container once with the `docker rm -f portal-research-preview-portal-fixture-bff-1`
line that `fixture off` prints (compose keeps an orphaned service running). **Nothing in the frontend
changes**: it has no fixture mode and always calls `/api/v1/execution/**` and `/api/admin/**`. Clear
`PORTAL_EXECUTION_V2_SCREENS` (or leave it) according to which screens the real backends can serve.

## What it does not do

- No database, no migration, no secret, no outbound network call. The container has a read-only
  filesystem, no capabilities and no published port.
- It never touches stable, dev or the Execution probe: `preview.sh` fixes the project name and refuses
  those ports, and the overlay is applied by the preview script only.
- It stores nothing. The same request twice returns the same bytes.

## Writes: `FIXTURE_WRITES`

The default is **`refuse`**: every non-GET answers `405 FIXTURE_METHOD_NOT_ALLOWED`, so the preview never
shows a fake successful command. `FIXTURE_WRITES=doubles` answers the canned successes the Playwright
specs use (an approval "created", an operation "acknowledged"); they change nothing on the next read, so
use it only when a reviewer needs to see the success state and knows it is canned.

## FIXTURE_USER_ID

The Access screen refuses a body that names another user than the signed-in one. The fixture signs
itself in (`/api/auth/context` is the fixture's), and both it and `/api/admin/access/self` use
`FIXTURE_USER_ID`, so the default (`principal-visual-baseline`) already agrees with itself and
nothing needs setting. It is a label, not an account. Set it only to make the fixture name a specific
id; it is an identifier, not a secret, and belongs in the env file, not in this repo.

## Honest limits

- Age labels ("3m ago") are computed in the browser from its own clock against fixed fixture timestamps
  (`FIXTURE_NOW_ISO`), so they drift from what a reviewer expects as time passes.
- The governance parent's V2 bodies are not served; those routes answer `404 FIXTURE_ROUTE_NOT_SERVED`.
- The sign-in is synthetic: there is no way to sign in or out, and nothing a reviewer does here is
  attributed to anyone. The Research, QuantBT and Planning modules call paths the fixture does not serve,
  so they show their error states (404) on this stack. The sign-in plate's service strip (`/api/health`) is never shown, because the
  fixture user is already signed in.
- The banner is injected by nginx into HTML documents it serves from disk; an HTML error page from an
  upstream is not guaranteed to carry it.
- Offsets of a few sticky panels that start at the top of the viewport are shifted under the banner;
  any other sticky element added later may slide under it while scrolling.
- A screenshot from this stack shows how a screen looks with data of this shape. It proves nothing about
  what the real read returns.

See `apps/portal/fixture-bff/README.md` and `ROUTES.md` for the server, its environment and its route table.
