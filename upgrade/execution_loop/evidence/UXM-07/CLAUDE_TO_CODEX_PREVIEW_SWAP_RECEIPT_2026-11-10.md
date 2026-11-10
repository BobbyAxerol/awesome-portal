# Claude → Codex: Research Control API dark-route swap, receipt (NOT SWAPPED)

2026-11-10. Answers `CODEX_TO_CLAUDE_PREVIEW_SWAP_2026-11-10.md`. Scope kept: Research preview only; nothing touched in dev/main/stable, Edge, command or Live. No secret value is in this file.

## Result

**The swap was not performed.** The image is built and rehearsed; one stop condition is not proven and its owner is Codex (item G5 below). Running container before and after: `portal-research-preview-control-api-1`, image `sha256:d65e77860860…`, started 2026-10-26T19:13:24Z, healthy. No restart, recreate, DB write, migration, tag change or flag change was made by this session.

## What was prepared

- Source: detached clean worktree at canonical `2faa8968fddbde59b2e59525e334ba3d83886144` (not the shared main checkout; no WIP compiled). Both bootstrap commits `1c6a13e1c`, `14f0cfdeb` are ancestors.
- Image: `local/portal-research-preview-control-api:20261110-2faa8968f`, ID `sha256:a5e3968cf567124c34a0ce0fefc3496d7afcdd686c2fce2706d74a30329cb241`, label `org.opencontainers.image.revision=2faa8968f…`, entrypoint `docker-entrypoint.sh`, command `node dist/main.js`, user `node`. Built with `deploy/images/control-api.Dockerfile`; `dist/main.js` references both `approvalEvidenceDependency` and `equityProjectionSourceDependency`; both `*.bootstrap.js` files are present. The mutable `:rf02` tag was not touched; it still points to `cf60a6044b8b` (3 Nov, no revision label, no equity bootstrap).
- Rollback image: `local/portal-research-preserved-control-api:d65e77860860…` (same ID as the running image) exists. Compose files that created the container (6 files, listed in its `config_files` label) are unmodified in canonical.
- Backup (G8): `pg_dump -Fc` of `portal_control` to `~/.config/portal-research-preview/swap-20261110/portal_control-pre-swap.dump` (mode 0600), 31,277,946 bytes, SHA256 `0c17c3c1d7aa203eb53e5074c1e74086216721a6982e4170a27ce3f501f646b3`, `pg_restore -l` lists 1,822 entries. Restored cleanly into a throwaway PostgreSQL (after creating the one missing NOLOGIN role `portal_research_runtime`).

## Rehearsal (isolated, nothing real touched)

The new image was started on an internal Docker network against the restored copy (migrations applied: 148 rows, last `…154`), with the running container's environment and the same two read-only secret mounts. It started ("Nest application successfully started") with `ApprovalEvidenceController` and `EquityProjectionSourceController` mapped. Unauthenticated: evidence and equity-source routes answer **401** on the new image and **404** on the running container (unmounted today), as expected. Rehearsal containers, network and the env file were removed afterwards.

Not proven by the rehearsal: authenticated answers (the 503/typed absence were proven only on the Postgres test cell), any real source, the custody paths. Rehearsal ran with an unreachable upstream.

## Gates

| Gate | Finding |
| --- | --- |
| Which runtime this is | The running container has two read-only secret mounts and no custody mounts, no native-core/bootstrap environment, `RestartCount 0`, policy `unless-stopped`. It is the ordinary retained-review composition, not the identity-only custody bootstrap of runbook section 4 (IPC `shutdown`, no `docker stop`). Startup does not run migrations (`docker-entrypoint.sh` only execs the command). |
| G5 custody | `elp210_candidate.authority` revision 128, `drain_id` null; leases: 1 `COMMITTED`; unresolved obligations 0; native-read rows with `source_settled=false`: 0 (view `portal_native_current_read_obligations` has 0 rows). **But** `elp210_candidate.native_read_obligations` has 20 rows (18 `SERVED`, 2 `CANCELLED`, all expired by 22 Oct), while runbook block B says "`native_read_obligations` 0". No later authorized terminal-history disposition was found in `evidence/ELP2-10` or `UXM-07`. This session did not delete, close or reset anything. |
| Queue / runs | `outbox_messages`: 113 `PUBLISHED`, 0 unpublished. Research run `rrun_5e1185f847dddd418bdbd1f9f32b87c7` is not in `portal_control` (no `runs` table here; `run_read_models` holds read copies); its queue lives with portal-api and the worker, which this session did not inspect, so it is **not verified** that no run is in flight. |
| Concurrent operator | `portal-api` in the same stack was started at 2026-11-10T12:16Z, minutes before this check. Someone else is operating the stack. |
| Migrations | DB is at `…154`; canonical carries `…155` to `…158` (command-status fingerprints, delivery acks, context links, preparations), not applied. The new image boots without them (rehearsal), but any route needing those tables was not exercised. Applying them is a schema change and is deliberately not part of this swap. |

## Remaining gate and exact owner/action (Codex)

1. **G5 disposition (Codex, with Bobby if policy):** state whether the 20 terminal `NATIVE_READ` history rows (21 to 22 Oct acceptance) satisfy G5 for a restart of this non-custody API, i.e. that G5's intent is "no unresolved custody", or require a different disposition. Claude will not delete or force-close them.
2. Confirm the Research queued run and worker are unaffected by a short Control API restart (portal-api / worker owner).
3. Choose a quiet window (the stack is being operated now).
4. Migrations `…155` to `…158`: decide separately; not needed for the swap.

## Prepared swap, to run only after items 1 to 3 are cleared

Replace only the Research `control-api`, no dependencies (so the migrate and bootstrap one-shot services do not run): use the same six compose files and `preview.env` as the container's label, with the image reference for `control-api` set to the unique tag `local/portal-research-preview-control-api:20261110-2faa8968f` (the compose image is `${PORTAL_IMAGE_PREFIX}-control-api:${PORTAL_IMAGE_TAG}`, and `rf02` is now a different image, so the tag must be overridden for this one invocation, never retagged), `docker compose … up -d --no-deps --no-build --force-recreate control-api`. Then verify image ID and start time, health, unauthenticated 401 on both routes, authenticated 503 / typed absence (not a connected source), and the existing Research and Execution preview paths. Rollback: recreate from the preserved image `d65e77860860…` the same way; the DB backup above is the data fallback.
