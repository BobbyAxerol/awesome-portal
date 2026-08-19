# Release and Deployment

## Release a Portal version

1. Complete source changes in one or more focused feature branches from `dev`.
2. Run `./scripts/portal verify`, the affected module tests and
   `./scripts/portal smoke`.
3. Open a Portal pull request into `dev`. Root CI validates tracked monorepo
   source directly, including the composed stack.
4. Promote reviewed, stable `dev` to `main`. The image-publish workflow builds
   immutable `sha-<parent-commit>` images for Portal API, Portal web and Roadmap
   API from that exact commit. A `v*` tag additionally receives a release tag.

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
the registry. The workflow transfers only the non-secret Compose definition,
passes an immutable image tag at runtime, validates the rendered stack, pulls
images and starts the services. Configure environment-protection reviewers
before enabling real production use.
