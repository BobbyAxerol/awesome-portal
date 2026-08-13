# Portal Workspace

`portal/` is the parent integration project for independently versioned source
repositories. It builds service source and embedded feature source into one
deployable stack; developers do not need to start and manually connect each
application.

## Current stack

| Source repository | Role in the parent stack |
| --- | --- |
| `apps/quantbt-portal` | FastAPI API and React/Nginx web portal |
| `features/manager-portal` | Migration Tracker static UI embedded at `/migration/` in the existing web container; no extra Compose service |

The backend installs `quantbt-engine==1.0.8` from PyPI. No local QuantBT source
repository is required.

## Run the whole portal

```bash
cp .env.example .env
./scripts/portal up
```

If the current account cannot access `/var/run/docker.sock`, use
`sudo ./scripts/portal up` or configure Docker group access according to the
host's security policy.

Open `http://localhost:8080` for the QuantBT portal or
`http://localhost:8080/migration/` for the embedded Migration Tracker. The
public web service proxies `/api` to the internal API service, so all portal
components use a single deployment entry point. Use `./scripts/portal logs`, `./scripts/portal status`, and
`./scripts/portal down` to operate the stack.

The default market-data mount is `runtime/market-data`. For live backtests,
point `PORTAL_MARKET_DATA_DIR` in `.env` to the directory that contains the
compatible `data_loader.py` implementation and any required non-committed data.

## Tracked source repositories

`repos.conf` is the workspace manifest. To clone/fetch every configured source
repository, prune stale remotes, fetch tags, and make every remote branch a
local tracking branch, run:

```bash
./scripts/portal sync
```

`repos.lock` pins the exact source commit used for CI and image publishing. To
promote a deliberately chosen source revision after its own repository has been
committed and pushed, run `./scripts/portal lock`, review the lockfile diff and
commit that parent change. See [the architecture guide](docs/architecture.md).

To integrate a future deployable sub-portal:

1. Add its independent repository under `apps/` and add it to `repos.conf`.
2. Add its image build and service definition to `compose.yaml`.
3. Give it a health endpoint and connect it through the private `portal`
   network or through the web gateway as appropriate.
4. Keep credentials, market data, artifacts, and generated output outside Git.

This makes source integration explicit and reproducible: `docker compose build`
uses the workspace source tree, while runtime communication happens through
container services rather than cross-repository filesystem imports.

For an embedded UI feature, add it to `repos.conf` with role
`embedded-feature`, test and lock its source independently, then compile it
into an existing public image and mount it on a route. Do not add a Compose
service unless it has a separately approved runtime boundary.

## Quality, CI/CD and deployment

The parent repository includes GitHub Actions for locked-source integration CI,
CodeQL analysis, immutable GHCR image publishing and a protected manual
production deployment workflow. Before the first push, configure branch
protection for `main` and `dev`, require the integration CI, and set a
`production` GitHub Environment with reviewers. `dev` is the primary
development branch: create each new `feat/*`, `fix/*`, `chore/*`, or `docs/*`
branch from it, merge back to `dev` through review, then promote stable work to
`main`. Direct commits to an existing local `main` branch are blocked by the
parent hook.

For private tracked source repositories, provide a `PORTAL_REPOS_TOKEN` repository
secret with read access to them. The default `GITHUB_TOKEN` is used when that
secret is not needed. Deployment-specific secrets and host preparation are
documented in [release and deployment](docs/release-and-deployment.md); GitHub
repository settings are listed in the [GitHub configuration checklist](docs/github-configuration.md).

Useful parent commands:

```bash
./scripts/install-git-hooks.sh
./scripts/portal verify
./scripts/portal smoke
make help
```

See [operations](docs/operations.md), [contributing](CONTRIBUTING.md) and
[security policy](SECURITY.md) for the standing runbook and guardrails.
