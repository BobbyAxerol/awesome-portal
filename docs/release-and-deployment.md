# Release and Deployment

## Branch, runtime and data authority

Each release channel has one source authority and one isolated runtime:

| Channel | Source authority | Public hostname | Compose/DB namespace |
|---|---|---|---|
| Feature preview | reviewed `feat/*`, `fix/*`, `chore/*` or `docs/*` branch | `dev-portal.primusspark.com` | disposable `portal` stack |
| Canonical development | exact `origin/dev` commit | `dev-portal.primusspark.com` | `portal` stack, rebuilt after merge |
| Stable production | exact `origin/main` commit and `sha-<40-hex>` images | `portal.primusspark.com` | stable-only stack and volumes |

`dev-portal` may temporarily serve a feature preview for owner review. Once its
pull request is merged, rebuild that same hostname from the isolated `dev`
worktree so the runtime again matches `origin/dev`. Stable is never built from
the feature or `dev` worktree. Run `scripts/verify-release-channel.sh` before a
source-managed build to fail closed on branch, commit, origin, port or stack
namespace drift.

Git promotes source and migration files; it never promotes database contents.
Do not copy the dev database into stable. A main deployment keeps the existing
stable volumes, creates consistent PostgreSQL and Roadmap SQLite backups, then
runs only pending forward migrations from the immutable main image. Existing
migration files are append-only and CI enforces that with
`scripts/verify-migration-history.sh`; schema changes require a new migration.

The AWS-HK Execution Edge projection PostgreSQL is a fourth, independent data
boundary. It is not the SGP control-plane database, not a dev/stable Portal
volume and not the Trading System database. Its D2/D4 admission, backup, replay
and rollback runbooks govern it; no Portal branch merge copies or rewrites its
rows. Trading System remains source authority and Portal consumes only the
published compatibility contract.

## Release a Portal version

1. Complete source changes in one or more focused feature branches from `dev`.
2. Run `./scripts/portal verify`, the affected module tests and
   `./scripts/portal smoke`.
3. Open a Portal pull request into `dev`. Root CI validates tracked monorepo
   source directly, including the composed stack.
4. Promote reviewed, stable `dev` to `main`. The image-publish workflow builds
   immutable `sha-<parent-commit>` images for Portal API, Portal web and Roadmap
   API from that exact commit. A `v*` tag additionally receives a release tag.

Pull requests also reject deletion or modification of migrations already
present in their base branch. Manual image publication and production deploys
must be dispatched from `main`. Production accepts only `sha-<40-hex>` image
tags whose commit is reachable from main, allowing a reviewed older-main image
for rollback without permitting a feature/dev image.

There is no child source lock or separate source promotion step. The Portal
commit is the reproducible release definition. Roadmap's UI is compiled into the
public web image; its stateful API remains a private companion image and volume.
The web gateway is the only public entry.

Before enabling Roadmap V1 persistence for a shared workspace, complete its
backup/restore dry-run and browser UAT. Start local deployments with the
local-first flag and make the V1 rollout an explicit reviewed configuration
change.

## Prepare a deployment host

1. Install Docker Engine and the Docker Compose plugin.
2. Create `/srv/portal`, then copy `deploy/compose.production.yaml` and create
   `/srv/portal/.env.production` from `deploy/.env.production.example`.
3. Set a lowercase `PORTAL_IMAGE_PREFIX`, an immutable image tag, canonical
   `PORTAL_HISTORICAL_DATA_DIR=/srv/primus/historical-market-data/storage` and
   the numeric `PORTAL_HMD_READER_GID`. The mount is read-only and only serves
   backtest/research; it does not provide realtime or paper-trading state.
   Resolve the GID from the host reader group rather than copying the Portal
   container UID:

   ```bash
   getent group primus-market-data-readers | cut -d: -f3
   ```

   Before `up`, `./scripts/portal` now fails fast if that GID cannot traverse
   the mount or read `_primus_metadata/release_manifest.json`. Do not work
   around a mismatch by making market data world-readable.
4. If the GHCR package is private, authenticate the host with an account or
   token permitted to pull it.
5. Put TLS, authentication and public-network policy in a reverse proxy or load
   balancer in front of the web service. Do not expose either API container.

Run manually on the host:

```bash
cd /srv/portal
docker compose --env-file .env.production -f deploy/compose.production.yaml pull
docker compose --env-file .env.production -f deploy/compose.production.yaml up -d --remove-orphans
```

For the source-managed local/stable stack, verify the exact container identity,
reader wheel and accepted release without loading bars:

```bash
./scripts/portal hmd-doctor
```

`deploy/systemd/portal.service.example` is available when the host should keep
the Compose stack supervised by systemd.

## GitHub production deployment workflow

The manual workflow requires the GitHub `production` environment and these
environment secrets:

- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_SSH_PRIVATE_KEY`
- `DEPLOY_KNOWN_HOSTS` (the pinned host-key line, not an unverified scan)

Image publishing additionally requires repository/environment secret
`HMD_READER_WHEEL_BASE64`, containing the approved code-only
`primus_historical_market_data-0.1.0rc3-py3-none-any.whl`. The workflow verifies
SHA-256 before building and fails if the wheel is absent or different. Do not
store the wheel, Historical Market Data source or storage in Portal Git.

The host must already contain `.env.production` and be authenticated to pull
the registry. The workflow transfers only the non-secret Compose definition.
Before pulling or migrating it writes a timestamped, mode-`0700` backup under
`<deployment_path>/backups/`: a PostgreSQL custom-format dump and, when the
Roadmap service is running, an SQLite online backup. It records SHA-256 checks,
runs the Compose migration/bootstrap gates, waits for health, probes each API
and atomically records `deployed-release.env` with branch, commit, image tag and
deployment time. Configure environment-protection reviewers before enabling
real production use, retain backups according to the operational policy and
regularly prove restore in an isolated database.
