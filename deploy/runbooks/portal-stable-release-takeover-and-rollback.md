# Stable Portal release takeover and rollback

Status: `READY_FOR_SIGNED_MAIN_RELEASE`

This runbook is for the existing SGP stable runtime only. It adopts the current
`portal-stable-v1-0-1` Docker Compose namespace; it never creates a parallel
`portal-stable` volume set, reuses the dev project, or changes AWS-HK runtime.

## Guarded transition

The protected workflow performs these steps in order:

1. Verify the protected-main candidate, image signatures, SBOM, provenance,
   vulnerability decision and the ordered deployment Compose bundle.
2. Run `prepare-stable-release-takeover.py` against live Docker metadata. It
   requires all eight established services, port `127.0.0.1:18081`, exact named
   volumes, four execution overlays and command relay `false`.
3. Create `/srv/portal/.env.production` only when absent. It maps current host
   settings without logging them; pre-existing keyring files are retained. If
   the legacy runtime exposes no query/governance keyring, it creates fresh
   independent ephemeral keyrings, which only invalidates bounded cursors and
   governance plans—not users, sessions, database data or execution identity.
4. Back up the verified running PostgreSQL and Roadmap SQLite containers before
   image pull, migration or restart. Each backup receives a SHA-256 checksum.
5. Pull digest-pinned images, run the forward migration/bootstrap gates and
   recreate the same project with the exact ordered bundle. Command relay and
   live mutation remain false.
6. Probe readiness for Control API, Portal API and Roadmap API, then atomically
   write `deployed-release.env` with the commit, image digests and Compose-bundle
   digest.

## Abort conditions

Stop before `docker compose up` if any preflight differs: project name, port,
container label, volume identity, read-only historical mount, execution overlay
set, command relay state, missing secret mount or backup checksum.

## Rollback / forward fix

Database migrations are forward-only. Do not restore a production backup over
the live stable volume as a first response. Roll back application bytes only by
dispatching a previous signed main candidate whose source commit is still
reachable from `main`; retain the current DB schema and create a forward fix
when a migration compatibility issue exists. The two backups under
`/srv/portal/backups/` are recovery evidence and must be restored only into an
isolated recovery target first.

The source transition itself is reversible: retain the prior release directory
referenced by `COMPOSE_RELEASE_DIR`, then dispatch its signed manifest. Never
hand-edit an active Compose file or replace a named volume.
