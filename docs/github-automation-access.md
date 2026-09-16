# GitHub Automation Access

This repository remains **private by default**. A repository does not need to
be public for the Portal deployment host, an approved automation agent, or
GitHub Actions to clone source, inspect Actions, create pull requests, create
releases, or dispatch a protected deployment.

There are deliberately two separate identities:

| Identity | Where it is used | Scope |
| --- | --- | --- |
| SSH Git identity | Git fetch/push from approved Portal worktrees | Repository Git transport only; branch rules still apply. |
| Fine-grained PAT | GitHub REST API from the approved host | Selected repository and only the API permissions listed below. |
| `GITHUB_TOKEN` | GitHub Actions jobs | Scoped to the workflow run; publishes CI artifacts and immutable images. |
| Production environment secrets | Protected deploy workflow only | Host connection and registry/deployment material; never copied to a worktree or PAT file. |

For self-hosted compute, the fine-grained owner token is used only to mint a
one-time runner registration token. It is never installed as a runner
environment variable or workflow secret. See
[the isolated CI/publication runner guide](../deploy/self-hosted-ci-runner/README.md)
for the separate CI/publication and deployment boundaries.

The PAT is not a substitute for SSH, environment protection, Cloudflare Access,
or the Stable release workflow. It is only for authenticated GitHub API work.

## Create or update the automation PAT

Open GitHub **Settings → Developer settings → Personal access tokens → Fine-grained tokens**,
then edit the existing Portal automation token or create a replacement.

1. Set **Resource owner** to `BobbyAxerol`.
2. Set **Repository access** to **Only select repositories** and select
   `awesome-portal`. Do not select every repository.
3. Set an expiry that fits the operating cycle (90 days is a sensible default)
   and rotate before it expires.
4. Grant the following repository permissions:

| Permission | Level | Why it is needed |
| --- | --- | --- |
| Contents | Read and write | Read source/release metadata and create or amend a GitHub Release. This is required for `POST /repos/{owner}/{repo}/releases`. |
| Pull requests | Read and write | Open, update and inspect the approved PR workflow. |
| Actions | Read and write | Inspect CI/artifacts and dispatch or re-run an explicitly approved workflow. |
| Workflows | Read and write | Needed only when the automation updates a `.github/workflows/*` file or uses an API path that requires workflow write access. |

Do **not** grant Administration, Secrets, Variables, Environments, Deployments,
Webhooks, or Organization-wide access to this PAT for normal Portal work. Those
actions remain owner-controlled and use the GitHub UI or a separately approved
credential when genuinely needed.

`Packages` is also not needed for this host-side PAT: immutable image
publication is performed by the repository workflow's `GITHUB_TOKEN`, and the
Stable host uses its own pull-only registry credential.

GitHub documents that creating a release with a fine-grained token requires
`Contents: write`; adding `Workflows: write` preserves the ability to handle
workflow-bearing refs without replacing the token later. See GitHub's
[fine-grained permission matrix](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens)
and [release endpoint documentation](https://docs.github.com/en/rest/releases/releases).

## Store and verify the token safely

Keep the token outside Git, in the owner-only host file:

```bash
install -d -m 0700 /home/bobby/secure
umask 077
editor /home/bobby/secure/portal-release-github.env
```

The file contains only the variable assignment below; do not paste its value in
a terminal transcript, issue, chat, CI log, Docker environment, or `.env`
inside the repository:

```bash
GH_TOKEN=github_pat_REDACTED
```

Set file mode `0600`. After changing the token, validate permissions without
printing the token:

```bash
set -a
. /home/bobby/secure/portal-release-github.env
set +a

curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer ${GH_TOKEN}" \
  -H 'Accept: application/vnd.github+json' \
  https://api.github.com/repos/BobbyAxerol/awesome-portal/releases
```

For release creation specifically, the owner can make a harmless draft release
against a temporary test tag or let the approved automation create the intended
release. Never test by changing an existing Stable release or deleting an
asset.

## GitHub Release versus private runtime manifest

The exact deployed `release-manifest.json` can contain internal compose,
profile, rollback and service metadata. It remains in the private deployment
store. A GitHub Release records:

- the immutable Git tag and deployed source commit;
- SHA-256 of the private manifest and release decision;
- an operator-readable, non-secret summary; and
- links to the successful CI and image-publication runs.

Do not upload the full private runtime manifest as a public release asset
unless Bobby explicitly approves a separately reviewed redacted artifact.

## Private-repository access model

With the selected-repository PAT above, private visibility has no adverse
effect on the approved automation. GitHub checks both identity and repository
permission; it does not require public visibility. A token that cannot read a
private repository, create a release, or inspect workflow artifacts is missing
either the selected repository grant, the named permission, or (for an
organization-owned repository) required SSO/token approval.

Revoke the PAT immediately if it is exposed, then replace the value in the
owner-only file. Do not attempt to recover by making the repository public.

## CodeQL in the private repository

CodeQL can analyse this private repository without exposing it. Uploading its
SARIF to GitHub's **Code Scanning** product is a separate entitlement: GitHub
Code Security must first be enabled for this repository. Until Bobby enables
that product, the tracked security workflow runs both Python and
JavaScript/TypeScript scans with CodeQL upload set to `never`, then stores the
resulting SARIF as a 30-day private Actions artifact named
`portal-codeql-<language>-<commit>`.

This is intentionally not a skipped scan or a green-on-error workaround. The
analysis and query evaluation still run; only the unavailable Code Scanning
upload is replaced by private evidence retention. If GitHub Code Security is
enabled later, change `upload` back to `always` in the same reviewed PR and
preserve the artifact step for operator evidence.
