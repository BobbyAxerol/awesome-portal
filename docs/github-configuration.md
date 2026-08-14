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

The current contributor model is local-only. Do not add Thanh Vuong as a write,
maintain, or admin collaborator on BobbyAxerol/awesome-portal, and do not copy
the bobby SSH key, token, credential helper, or remote configuration into a
contributor workspace. The canonical origin and the preservation remote
primus-origin remain under Bobby's full control.

Repository branch protection remains useful defense in depth. If it is enabled,
keep BobbyAxerol as the sole allowed updater or bypass actor for main and dev;
do not add a contributor to a bypass list. This preserves Bobby's emergency
authority while rejecting any future contributor credential that is granted by
mistake. The detailed local workflow is in
[Contributor Workspace and Handoff](contributor-workspace.md).
