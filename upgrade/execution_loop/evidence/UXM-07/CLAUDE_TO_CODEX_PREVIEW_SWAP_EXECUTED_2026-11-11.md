# Claude -> Codex: Research control-api swap EXECUTED (11 Nov 2026)

Supersedes the "NOT SWAPPED" receipt of 10 Nov for item G5 only. Scope: Research preview `control-api` container, nothing else. No dev/main/stable, Edge, command or Live change. No secret value is in this file.

## Authorisation

Bobby answered the G5 question explicitly (11 Nov, via the question tool): the 20 terminal `native_read_obligations` rows count as G5 satisfied for a restart of this non-custody API, and the swap may go ahead. Nothing was deleted, closed or reset.

## Checks before

- Running container: `portal-research-preview-control-api-1`, image `sha256:a5e3968c...` (tag `20261110-2faa8968f`), started 10 Nov 14:12:30Z, 0 restarts, healthy. It is the rollback.
- Custody (Research `portal_control`): authority revision 162 (was 128 on 10 Nov), drain null, lease epoch 118; one lease `COMMITTED` expired 20 Oct; view `portal_native_current_read_obligations` 0 rows; 20 terminal obligations all expired by 22 Oct (2 without a terminal reason are the `cancel-unentered` rows); unpublished outbox 0.
- Queue: `quant-worker-py` has been `Exited (127)` since 10 Nov 14:12:26Z (NATS `no response from stream` while publishing), so no worker is consuming and the QUEUED run `rrun_5e1185f8...` cannot be in flight. That worker failure is separate and was not touched.
- Quiet: no control-api log lines in the 2 minutes before. portal-api and the other services unchanged since 10 Nov 14:12Z.
- Backup (G8): `~/.config/portal-research-preview/swap-20261111/portal_control-pre-swap.dump` (0600), 31,283,482 bytes, SHA256 `950f4b3584d30ba20dd2fb4bf773993a7f88d66403ab60b34eaaa18797126287`, `pg_restore -l` lists 1,822 entries.
- Compose: the six files of the container's label are byte-identical between canonical and the `claude/slice-followthrough` worktree used as ROOT (`git diff 2faa8968f HEAD -- compose.yaml deploy/` is empty). Rendered environment of the new container differs from the running one only in `PORTAL_BUILD_COMMIT` (set to `2e31b74da...`, the image's revision label); `NODE_ENV` is an image variable.

## Swap

`PORTAL_BUILD_COMMIT=<2e31b74da full sha> scripts/research-preview/preview.sh compose -f <override: control-api image> up -d --no-deps --no-build --force-recreate control-api`. `--no-deps` kept `control-api-bootstrap` and `control-api-migrate` from running. The override file only sets `image: local/portal-research-preview-control-api:20261111-2e31b74da`; no tag was moved.

After: image `sha256:d15e8e21bdebacd9c972b9350ef38a7a07509c61a9231f157b898b3c2c78410a`, label revision `2e31b74da...`, started 2026-11-11T09:24:30Z, 0 restarts, healthy. Migrations were not run (DB stays at the previous last migration; `...155` to `...158` still unapplied).

## Checks after (inside the container, port 4000)

- Startup: "successfully started"; all three dark route sets mapped (approval evidence, equity-projection source, ten typed-absence reads).
- No session: evidence, equity-projection source and the ten typed-absence reads answer **401**; `/readiness` and `/search` answer **404** (still unserved, as documented).
- Preview auto-login session (no retained-review grant): `governance/approvals` 200; `operations/incidents/:id/children` typed 404 `EXECUTION_READ_NOT_AVAILABLE`; evidence for an unknown id 404 `APPROVAL_NOT_FOUND`; the other typed-absence reads answer 404 `REQUEST_REJECTED`. Cause (not a defect of the image): `SessionGuard` under `retained_review_v1` throws `NotFoundException("Workspace not found.")` for any non-core Execution path when the caller has no read access to the configured projection workspace; the typed-absence controller is never reached for this principal. A caller with that access (owner anchor, member, or active retained-review grant) is the only one that gets the typed-absence bodies. Not proven on this stack: those 200 bodies with a granted caller. They are proven in the Postgres test cell only.
- Public paths via port 8095: `/`, `/api/auth/context`, `/api/v1/execution/governance/approvals`, `/execution`, `/deployments/alphas` all 200. Zero error lines in the control-api log for 5 minutes. Fleet at 1440 still 1128/1128 and at 390 326/326.

## Rollback

Recreate from the previous image with the same command, override `image: local/portal-research-preview-control-api:20261110-2faa8968f` (ID `a5e3968c...`, still present). Data fallback: the dump above.

## Left open

Landing into `docs/research-loop-plan` (Codex's uncommitted `app.module.ts`/`main.ts`), the `quant-worker-py` exit 127, migrations `...155`-`...158`, a granted-caller check of the typed-absence bodies, and the stale `account-acct-live-grid-v21` baseline.
