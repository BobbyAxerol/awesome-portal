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
4. Promote reviewed, stable `dev` to `main`. Publication waits for **all three**
   successful, same-commit Portal CI gates: `Validate Portal monorepo stack`,
   `Portal web visual baseline`, and `Validate Portal application build and
   browser flows`. The checks run in independently bounded jobs, but no one
   green check authorizes publication by itself. Only then does the publisher
   build six immutable images: Portal API, Portal web, Control API, Roadmap API,
   Rust Execution Edge and Source Proxy. Every image receives SBOM/SLSA
   provenance, Trivy evidence and a keyless signature. A `v*` tag additionally
   receives a release tag. The signed `main` Portal web image explicitly
   compiles the reviewed Execution product routes
   (`EXECUTION_PREVIEW_ENABLED=true`). This is a **build-time** Vite input:
   setting an environment variable after an immutable image is published cannot
   enable the routes. The Dockerfile still defaults it to `false` for an
   unreviewed local build, while
   `scripts/execution-image-publication-test.sh` guards the main-publisher
   override against a silent regression to legacy feature previews.
   The publication gate itself is bounded at 150 minutes: the declared
   60-minute authority job plus the 75-minute dependent browser path and a
   15-minute scheduling margin. Its 210-minute job budget leaves 60 minutes
   for immutable image build, signing and evidence. Change the CI graph and
   this tested bound together; never replace it with an unbounded wait.
5. Review the uploaded `portal-release-candidate-<commit>` artifact and its
   manifest SHA-256. It binds all six image digests, migration chain,
   compatibility/profile matrix and rollback contract. A CRITICAL finding
   blocks publication; HIGH findings require explicit owner acceptance.

Pull requests also reject deletion or modification of migrations already
present in their base branch. Manual image publication and production deploys
must be dispatched from `main`. Production accepts only `sha-<40-hex>` image
tags whose commit is reachable from main, allowing a reviewed older-main image
for rollback without permitting a feature/dev image.

When a tracked EDS-12 release input changes (including CI, publisher or its
static verifier), refresh the derived qualification ledger before opening the
pull request:

```bash
./scripts/refresh-release-integrity-ledgers.sh --write
```

Commit the resulting N29 and EDS-12 evidence/manifest files together with the
source change. The helper refreshes N29 before EDS-12, validates the fixed
input lists and writes only non-secret SHA-256 bindings; it cannot authorize a
runtime, command, mutation or deployment. Run it with `--check` in CI or when
reviewing a diff. Never hand-edit those hashes.

There is no child source lock or separate source promotion step. The Portal
commit is the reproducible release definition. Roadmap's UI is compiled into the
public web image; its stateful API remains a private companion image and volume.
The web gateway is the only public entry.

Before enabling Roadmap V1 persistence for a shared workspace, complete its
backup/restore dry-run and browser UAT. Start local deployments with the
local-first flag and make the V1 rollout an explicit reviewed configuration
change.

## Fast stable release runbook (main only)

This is the sole repeatable path for a stable version. It deliberately makes
the source promotion fast while keeping the data transition explicit and
recoverable.

1. Merge the approved release into `main`; do not build Stable from `dev`, a
   feature branch, or a local worktree. Confirm the exact `origin/main` SHA and
   wait for all three named **Portal CI** checks and **Build and publish Portal
   images** for that same SHA to pass. A cancelled, timed-out or stale check is
   a release failure, never a reason to accept an earlier green check.
2. Inspect `portal-release-candidate-<commit>` from the successful publication
   run. Record its exact `sha256:...` release-manifest digest. The candidate
   binds the six image digests, migration chain, compatibility matrix and
   signed provenance; an image tag alone is not sufficient.
3. In GitHub Actions, dispatch **Deploy Portal stack** from `main` using only
   the candidate's immutable `sha-<40-hex>` tag, publication run ID and
   release-manifest digest. Explicitly accept the candidate's vulnerability
   evidence. Do not run `docker compose up` manually on the established stable
   host.
4. Let the protected workflow perform its ordered transition: prove the stable
   project/volume identity, create a PostgreSQL custom dump and a Roadmap/Task
   Board SQLite online backup, checksum them, pull images by digest, run
   append-only forward migrations, wait for health, and atomically write the
   deployed release marker. The workflow has a bounded 60-minute window so a
   large valid PostgreSQL backup finishes before any migration begins. Compose is
   deliberately detached from the SSH script's stdin, so it cannot consume the
   post-start marker/evidence steps; a missing marker is a release failure, not
   a reason to guess deployment state.
5. Verify the deployment marker, all stable service health checks, loopback
   `HTTP 200`, and the public Access boundary. Stable must remain at
   `portal.primusspark.com`; `dev-portal.primusspark.com` remains the separate
   development route. The workflow neither edits Cloudflare Tunnel/Access nor
   creates users, resets passwords, changes account data, replaces named
   volumes, or contacts the Trading System.
6. Fast-forward `dev` from the deployed `main` SHA only after the protected
   rollout passes, so the next campaign starts from one source baseline.

If runtime rollback is required, dispatch the same protected workflow with a
previously verified, signed candidate whose source commit is reachable from
`main`. Never reverse a migration in place and never copy a dev database into
Stable. Use the timestamped pre-rollout backups for isolated restore validation
or data recovery, not as a shortcut around a forward schema transition.

### Stable invariants

- `portal.primusspark.com` keeps the established Stable Docker project,
  loopback port, named volumes, Cloudflare Tunnel and Zero Trust Access policy.
- Existing Portal accounts, sessions and Roadmap/Task Board records stay in
  their persistent volumes; release code changes only add approved forward
  schema migrations.
- `dev-portal.primusspark.com` is never a source of production code, volumes
  or data.
- A failed backup or migration is fail-closed: no image recreation occurs
  before a valid, checksummed backup exists.

## Prepare a deployment host

1. Install Docker Engine and the Docker Compose plugin.
2. For a new host, create `/srv/portal` and provision `.env.production` from
   `deploy/.env.production.example`. For the established SGP stable host, do
   **not** manually invent a second project, port or volume namespace. The
   protected deploy workflow runs `scripts/prepare-stable-release-takeover.py`
   first. It proves the existing `portal-stable-v1-0-1` project, loopback port
   `18081`, five mutable stable volumes and all four active execution overlays,
   then atomically writes a host-only mode-`0600` `.env.production`. It never
   prints credentials, starts containers or contacts Trading System.
3. Set a lowercase `PORTAL_IMAGE_PREFIX`, an immutable image tag, all four SGP
   `PORTAL_*_IMAGE=image@sha256` references from the accepted manifest, canonical
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

The signed deployment uses one ordered Compose bundle rather than the base
file alone:

1. `compose.production.yaml`
2. `compose.production.stable-runtime.yaml`
3. current-source, local-projection, analytics and realtime overlays

The bundle is SHA-256-bound by the release candidate. This preserves the
existing NATS, MinIO, worker, stable volumes and read-only execution runtime;
it does not enable the command relay or any live mutation.

Do not run the base Compose file manually against the established stable host.
Use the protected workflow. If emergency inspection is needed, source the
non-secret `COMPOSE_RELEASE_DIR` from `deployed-release.env` and pass the same
ordered file list. The rollout always makes a PostgreSQL custom dump and a
Roadmap SQLite backup first.

For a genuinely new isolated host only, the minimal manual command is:

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

### GitHub API identity and release metadata

The deployment host may use a separate fine-grained PAT for GitHub REST API
operations. It does not need a public repository and it is not a deployment
credential. Its selected-repository scope is `BobbyAxerol/awesome-portal`;
`Contents: write` is required to create a GitHub Release, while Actions,
Pull requests and Workflows permissions are granted only as documented in
[GitHub Automation Access](github-automation-access.md).

Create the GitHub Release only after the matching commit has passed Portal CI,
security analysis and immutable-image publication. Record the deployed tag,
source commit and hashes of the private release manifest/decision. Keep the
full runtime manifest in the private deployment store unless an explicitly
reviewed redaction is approved for publication.

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

Dispatch additionally requires the immutable image tag, the image-publication
run ID, the exact reviewed `sha256:<manifest>` and explicit acceptance of the
bound vulnerability evidence. The protected environment reviewer therefore
approves bytes, not a branch name. Deployment downloads only the exact
candidate, validates it, creates a hash-bound `ACCEPT_SOURCE_DARK` decision,
keyless-signs and verifies both manifest and decision, and selects all stable
service bytes by digest. That decision cannot enable Projection, Query, SSE,
commands or accept a Trading System release.

For a new isolated host, the host must already contain `.env.production` and
be authenticated to pull the registry. For the established stable host, the
takeover helper creates that host-only file only after proving the existing
runtime identity. The workflow transfers the non-secret Compose definition and
signed release pack.
Before pulling or migrating it writes a timestamped, mode-`0700` backup under
`<deployment_path>/backups/`: a PostgreSQL custom-format dump and, when the
Roadmap service is running, an SQLite online backup. It records SHA-256 checks,
runs the Compose migration/bootstrap gates, waits for health, probes each API
and atomically records `deployed-release.env` with branch, commit, exact image
digests, manifest/decision digests and deployment time. Configure
environment-protection reviewers before enabling
real production use, retain backups according to the operational policy and
regularly prove restore in an isolated database.

N14A's source-dark release and rollback authority is documented in
[`EX_BE_17_N14A_PORTAL_RELEASE_AUTHORITY_SOURCE_DARK.md`](../upgrade/backend/EX_BE_17_N14A_PORTAL_RELEASE_AUTHORITY_SOURCE_DARK.md).
