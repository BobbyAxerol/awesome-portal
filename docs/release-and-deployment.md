# Release and Deployment

## Release a composed Portal version

1. Finish, test and push changes in the relevant child repository.
2. In this workspace, fetch the child repositories and advance the lock:

   ```bash
   ./scripts/portal sync
   ./scripts/portal lock
   git diff -- repos.lock
   ```

3. Open a parent-repository pull request containing the lock, deployment and
   documentation changes. The integration CI checks the exact locked source,
   backend tests, frontend tests/build and a full Docker smoke test.
4. Merge the approved parent PR into `main`. The image-publish workflow builds
   the locked source and publishes immutable `sha-<parent-commit>` image tags
   to GHCR. A Git tag beginning with `v` also receives a release tag.

The source of a child repository is not copied into parent Git history. A
parent commit plus `repos.lock` is the reproducible release definition.

## Prepare a deployment host

1. Install Docker Engine and the Docker Compose plugin.
2. Create `/srv/portal`, then copy `deploy/compose.production.yaml` and create
   `/srv/portal/.env.production` from `deploy/.env.production.example`.
3. Set a lowercase `PORTAL_IMAGE_PREFIX`, an immutable image tag and an
   absolute `PORTAL_MARKET_DATA_DIR` outside Git.
4. If the GHCR package is private, authenticate the host with an account or
   token permitted to pull it.
5. Put TLS, authentication and public-network policy in a reverse proxy or
   load balancer in front of the web service. Do not expose the API container
   directly.

Run manually on the host:

```bash
cd /srv/portal
docker compose --env-file .env.production -f deploy/compose.production.yaml pull
docker compose --env-file .env.production -f deploy/compose.production.yaml up -d --remove-orphans
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

The host must already contain `.env.production` and be authenticated to pull
the registry. The workflow transfers only the non-secret Compose definition,
passes an immutable image tag at runtime, validates the rendered stack, pulls
images and starts the services. Configure environment protection reviewers in
GitHub before enabling real production use.
