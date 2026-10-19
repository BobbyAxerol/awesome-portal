# Fixture BFF on the Research preview

**FIXTURE_LAB lane. Not acceptance evidence.** Every screen served while this is on shows sample data
of the right shape, not data read from a Trading System, a broker or a database. A fixed yellow banner
says so on every page, the login page included: `FIXTURE DATA - sample data for UI/UX review, not real
data, not acceptance evidence`.

## What it is

An opt-in overlay for the isolated Research preview (`portal-research-preview`, port 8095) that adds a
private service, `portal-fixture-bff` (`apps/portal/fixture-bff`), and changes `portal-web`'s nginx so
that only these paths reach it:

- `/api/v1/execution/**`
- `/api/admin/access/self`
- `/api/admin/profile-access/v2/effective` (exact)
- `/api/admin/accounts` and `/api/admin/accounts/**`
- `/api/admin/step-up`
- `/__fixture/**` (lane marker and health check)

Everything else (`/api/auth/*`, `/api/v1/portal/*`, the legacy profile-access reads, the shell registry,
Research and Planning) stays on the real services. These fixture paths skip the Control API's session
check on purpose, because the fixture server answers synthetic data only; turn the overlay off to get
the real, authenticated reads back.

## Turn it on

1. In the preview env file (outside the checkout, never printed) set the build-time V2 screen list and,
   if the shell is signed in through the real `portal-api`, the user id (see "FIXTURE_USER_ID" below):

   ```
   PORTAL_EXECUTION_V2_SCREENS=fleet,archived,portfolios,alpha,workbench,sandbox,canary,live,request,account,ops,profile,overview,cockpit,shell,compare,blotter,admin,users,replay
   FIXTURE_USER_ID=<real principal id>
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

The Access screen refuses a body that names another user than the signed-in one. When the shell signs in
through the real `portal-api`, set `FIXTURE_USER_ID` to the real principal id, or the Access screen will
refuse the fixture's. Find it by opening the preview in a browser and reading the **real** session
endpoint (`/api/auth/context`, which stays on the real services); copy the principal id from that
response. It is an identifier, not a secret, and it belongs in the env file, not in this repo.

## Honest limits

- Age labels ("3m ago") are computed in the browser from its own clock against fixed fixture timestamps
  (`FIXTURE_NOW_ISO`), so they drift from what a reviewer expects as time passes.
- The governance parent's V2 bodies are not served; those routes answer `404 FIXTURE_ROUTE_NOT_SERVED`.
- `/api/auth/*` and the rest of the shell stay real, so the preview still needs a working real session.
- The banner is injected by nginx into HTML documents it serves from disk; an HTML error page from an
  upstream is not guaranteed to carry it.
- Offsets of a few sticky panels that start at the top of the viewport are shifted under the banner;
  any other sticky element added later may slide under it while scrolling.
- A screenshot from this stack shows how a screen looks with data of this shape. It proves nothing about
  what the real read returns.

See `apps/portal/fixture-bff/README.md` and `ROUTES.md` for the server, its environment and its route table.
