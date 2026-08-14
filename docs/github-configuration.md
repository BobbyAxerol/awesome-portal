# GitHub Configuration Checklist

The files in `.github/` automate the shared Portal monorepo. Configure the
repository settings after the reviewed migration is pushed to its Portal remote.

## Branch protection

For `main`, require pull requests, the `Portal CI` check and CODEOWNERS review
once the ownership map is confirmed. Block force pushes and direct pushes.
Accept only reviewed stable promotions from `dev`.

For `dev`, require pull requests and the `Portal CI` check, block force pushes,
and use it as the target for `feat/*`, `fix/*`, `chore/*` and `docs/*` branches.
This keeps all Portal source—including `apps/` and `features/`—under the same
review and release policy.

Update `.github/CODEOWNERS` from the initial single-owner placeholder before
making CODEOWNERS review mandatory.

## Repository and production secrets

- The image-publish workflow uses `GITHUB_TOKEN` and needs GitHub Packages write
  permission. Verify that Actions can publish to GHCR for this repository.
- Keep deployment secrets only in the protected `production` Environment, not
  as broad repository secrets.
- Do not retain `PORTAL_REPOS_TOKEN`: Portal CI no longer clones child source.

## Production Environment

Create a GitHub Environment named `production`, add required reviewers and add
the secrets documented in [release and deployment](release-and-deployment.md).
The `Deploy Portal stack` workflow is intentionally manual and never deploys on
every push. It requires an already prepared host and the immutable image tag
selected at dispatch time.

## Contributor access boundary

Do not add Thanh Vuong as a write, maintain, or admin collaborator on
BobbyAxerol/awesome-portal, and do not copy the bobby SSH key, token, or
credential helper into a contributor workspace. Contributor work is published
only to primus-origin from the contributor's own GitHub identity.

The Primus repository owner must allow Thanh to push feature branches while
protecting main and dev: require pull requests, block direct and force updates,
and keep both BobbyAxerol and thanhvuong1105 out of any bypass or
allowed-updater list unless the owner deliberately changes that policy. This is
what prevents a web PR merge; local hooks cannot enforce GitHub permissions.
The detailed workflow is in
[Contributor Workspace and Pull Request Flow](contributor-workspace.md).
