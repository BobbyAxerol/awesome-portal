# GitHub Configuration Checklist

The files in `.github/` define the repository automation, but GitHub settings
must be configured after this parent repository receives its own remote.

## First push

Create a dedicated GitHub repository for this parent workspace, then add its
remote and push the reviewed initial commit. Do not point the parent `origin`
at a child application repository.

## Branch protection

For `main`, require pull requests, require the `Portal integration CI` check,
require CODEOWNERS review if the ownership mapping is confirmed, block force
pushes and restrict direct pushes. Accept promotions only from the reviewed
`dev` branch, which is the stable integration candidate.

For `dev`, require pull requests and the `Portal integration CI` check, block
force pushes, and use it as the target for `feat/*`, `fix/*`, `chore/*`, and
`docs/*` branches. This makes every new portal change start from `dev` rather
than from `main`.

Update `.github/CODEOWNERS` from the initial single-owner placeholder to the
actual team before making it a required rule.

## Repository secrets and access

- `PORTAL_REPOS_TOKEN`: optional but required when CI must clone private child
  repositories that the default repository-scoped `GITHUB_TOKEN` cannot read.
  Grant read-only access only.
- The image-publish workflow uses `GITHUB_TOKEN` and needs GitHub Packages
  write permission. Verify that Actions can publish to GHCR for this repository.
- Keep deployment secrets only in the protected `production` Environment, not
  as broad repository secrets.

## Production Environment

Create a GitHub Environment named `production`, add required reviewers and add
the secrets documented in [release and deployment](release-and-deployment.md).
The `Deploy Portal stack` workflow is intentionally manual and never deploys on
every push. It requires an already prepared host and uses the immutable image
tag selected at dispatch time.

## Child repositories

Each child repository should retain its own branch protection, Dependabot and
application-level CI. Parent CI protects only the cross-repository composition
recorded in `repos.lock`.
