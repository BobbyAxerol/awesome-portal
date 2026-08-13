# Security Policy

## Supported baseline

Security fixes are applied to the current reviewed `main` branch and the image
tags built from it. Deployment hosts should run immutable image tags, not a
moving branch tag.

## Reporting a vulnerability

Do not open a public issue for a suspected credential exposure, data-access
issue or remotely exploitable vulnerability. Use GitHub's private security
advisory flow for this repository when available, or contact the repository
maintainers through an existing private channel. Include reproduction steps,
affected service/image tag and any mitigation already applied.

## Operational expectations

- Keep production environment files, market data and artifact backups outside
  Git and outside Docker build contexts.
- Pin a host key in `DEPLOY_KNOWN_HOSTS`; never accept a deployment host key
  interactively in CI.
- Protect the GitHub `production` environment with reviewers before enabling
  the deployment workflow.
- Rotate a credential immediately if it reaches a commit, CI log or image.
