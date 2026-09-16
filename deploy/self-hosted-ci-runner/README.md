# Isolated self-hosted Portal CI and publication runner

`portal-ci-publish-sgp1` replaces only exhausted GitHub-hosted compute for the
private Portal repository.  It preserves the GitHub Actions workflow model:
Actions still checks out the reviewed commit, gets its short-lived
`GITHUB_TOKEN`, publishes to GHCR, produces Buildx SBOM/provenance, and obtains
the GitHub OIDC identity used by Cosign.  There is no database, data, release
directory or secret “sync” from the host back into GitHub.

It is **not** the production deployment runner:

| Runner | Labels | Role | Production authority |
| --- | --- | --- | --- |
| `portal-ci-publish-sgp1` | `portal-ci`, `portal-publish` | CI, browser tests, CodeQL and immutable image publication | None. Rootless Docker only; no SSH deployment key, no rootful Docker socket, no Portal volume or deployment environment secret. |
| `portal-deploy-sgp1` | `portal-deploy` | Reviewed deployment and feature-profile workflow only | Receives a transient protected-environment deployment secret only during an approved deploy. It must never run CI or image publication. |

## Security and resource boundary

- Linux identity: `portal-ci-runner`, system user, no login shell, no sudo and
  never in the host `docker` group.
- Docker: a separate rootless daemon at
  `/srv/portal-ci-runner/runtime/docker.sock`; the host rootful Docker socket,
  stable containers, production volumes and `/srv/portal` are not mounted or
  reachable through the runner configuration.
- The rootless daemon alone permits the setuid `newuidmap`/`newgidmap` helpers
  needed to create its user namespace. On this host, kernel mount/proc/device
  sandboxing blocks that namespace setup, so the daemon relies on its separate
  non-login Unix user, private rootless socket, no deployment material and
  slice rather than pretending those incompatible directives protect it. The
  Actions runner remains non-root with `NoNewPrivileges=yes`; this is not host
  Docker or deployment authority.
- Filesystem: systemd permits writes only under `/srv/portal-ci-runner`, plus
  service-private tmpfs mounts at `/tmp` and `/var/tmp`.  Those mounts are
  mode `1777`, disappear with the service namespace and are never the host
  temporary directories.  CI, security and publication workflows additionally
  bind `TMPDIR` to GitHub's per-job `RUNNER_TEMP`, so disposable build/test
artifacts remain in the exact workspace removed by the completion hook.
- Privileged ownership/readiness drills do not run on this runner.  For the D4
  qualifier specifically, ordinary CI runs its rootless template/static lane;
  an owner-approved deployment or workstation drill must invoke
  `./scripts/execution-d4-qualification-preflight-test.sh --require-root` to
  prove real root ownership and file modes.
  The GitHub completion hook is root-owned outside that writable tree.
- Resource envelope: the rootless Docker daemon and runner share
  `portal-ci-publish.slice` (at most 6 CPU cores, 20 GiB RAM, no swap).
  This leaves capacity for Portal services, terminal/SSH and the host.
- Docker uses `cgroupfs` inside that system-service slice because this host has
  no per-user systemd manager for the non-login CI account. This intentionally
  avoids a fictitious per-container quota; the parent slice remains the real
  aggregate CPU/RAM/no-swap boundary for every CI process and container.
- Test-cell and lint images preserve the ordinary unprivileged UID/GID when
  Docker is rootful. Only after `docker info` proves `name=rootless` do the
  dedicated CI paths use UID 0 *inside the container*: that UID maps back to
  `portal-ci-runner` on the host and is needed to read the runner's private
  checkout and mode-0600 disposable inputs. It is never host root and cannot
  reach the rootful Docker socket, production files or Portal volumes.
- Network: outbound GitHub/GHCR/package access only; no listener or inbound
  firewall change is created.
- Tokens: a fine-grained PAT with repository **Administration: write** is used
  only to create the one-time registration token. The installer shreds that
  token file. The PAT, deployment key, database URL and production secrets are
  never put in the runner service or worktree.

This is suitable for a private repository whose `dev` and `main` branches are
protected and whose merge authority remains Bobby. It does not make arbitrary
unreviewed fork code trusted; the rootless/no-secret boundary is retained even
for a same-repository pull request job.

## One-time installation

Run from the reviewed source checkout that contains this directory. The
registration token expires quickly and must not be printed, pasted into a
workflow, or retained in shell history.

```bash
set -a
. /home/bobby/secure/portal-release-github.env
set +a

umask 077
curl --fail-with-body --silent --show-error \
  -X POST \
  -H "Authorization: Bearer ${GH_TOKEN}" \
  -H 'Accept: application/vnd.github+json' \
  https://api.github.com/repos/BobbyAxerol/awesome-portal/actions/runners/registration-token \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])' \
  > /tmp/portal-ci-runner-registration-token

sudo ./scripts/install-portal-ci-publish-runner.sh \
  --repository-url https://github.com/BobbyAxerol/awesome-portal \
  --registration-token-file /tmp/portal-ci-runner-registration-token \
  --lock-file deploy/self-hosted-ci-runner/actions-runner.lock.json \
  --install-browser-deps
```

`--install-browser-deps` installs only the explicitly listed Linux runtime
packages required by Chromium/Playwright. Node, Python and Playwright's browser
revision remain workflow-managed and are placed under the isolated runner home.
The installer waits for rootless Docker's bounded containerd/BuildKit startup
before registering the Actions service; it does not treat an initial missing
socket as a reason to keep a partial runner.

Validate without printing secrets:

```bash
sudo systemctl status portal-ci-rootless-docker.service --no-pager
sudo systemctl status portal-gh-ci-publish-runner.service --no-pager
sudo journalctl -u portal-gh-ci-publish-runner.service -n 80 --no-pager
```

GitHub must show one online runner named `portal-ci-publish-sgp1` with both
custom labels. The deployment runner remains online separately.

## Automatic cleanup and retention

The GitHub runner completion hook runs after every CI, security or publication
job, including a failed test where the runner stays alive. It:

1. clears only the exact finished job workspace beneath its own `_work` tree;
2. prunes stopped rootless containers/networks older than 24 hours;
3. prunes rootless images and Buildx cache older than seven days;
4. prunes Playwright browser revisions unused for 30 days and orphaned runner
   temp directories older than one day; and
5. never prunes Docker volumes, rootful Docker resources, stable images,
   `/srv/portal`, execution services, databases, backups or deployment
   evidence.

The runner itself remains installed because it is reusable infrastructure, not
per-release build output. If capacity needs investigation, read only:

```bash
sudo -u portal-ci-runner \
  HOME=/srv/portal-ci-runner \
  XDG_RUNTIME_DIR=/srv/portal-ci-runner/runtime \
  DOCKER_HOST=unix:///srv/portal-ci-runner/runtime/docker.sock \
  docker system df
```

Do not run `docker system prune` against the host rootful Docker daemon as a
CI cleanup shortcut.

## Recovery and removal

If a job is stuck, cancel it from GitHub first. Then inspect the two dedicated
services. Restarting the CI runner does not restart Portal services:

```bash
sudo systemctl restart portal-gh-ci-publish-runner.service
```

To retire the runner, first verify it is idle in GitHub and that no CI/publish
workflow still uses its labels. Remove it from GitHub, then disable the two
services and remove only these exact CI paths:

- `/srv/portal-ci-runner`
- `/usr/local/lib/portal-ci-runner`
- `/etc/systemd/system/portal-ci-rootless-docker.service`
- `/etc/systemd/system/portal-gh-ci-publish-runner.service`
- `/etc/systemd/system/portal-ci-publish.slice`

Never retire `portal-gh-deploy-runner`, `/srv/portal`, or a Docker volume as
part of this operation.
