# Phase 5 — release candidate & UAT checklist

> Status: **imported into the Portal monorepo; gateway UAT is still required
> before a production release.** This document does not authorize a production
> rollout or a live Discord notification.

## What is in the candidate

- React/Vite UI preserves the legacy localStorage schema and can operate
  local-first with no API.
- V1 persistence is versioned, audited and has an explicit import decision.
- Task and Roadmap editors expose an on-demand, immutable activity timeline in
  V1 only. It does not poll or show notes/webhook secrets.
- FastAPI/SQLite has migration, backup/restore, error and outbox contracts.
- Browser parity tests cover create → reload for both Task Board and Roadmap.

## Required local gates

Run these from this repository before promoting source:

```bash
python -m pytest backend/tests
cd frontend
npm ci
npm audit --package-lock-only --audit-level=moderate
npm test
npm run build
npx playwright install --with-deps chromium
npm run e2e
```

Root Portal CI runs the same backend, frontend and Chromium gates on push/PR,
then runs a three-container smoke flow through the parent gateway.

## Gateway UAT

The parent gateway has two safe modes:

| Mode | Build variables | Expected behaviour |
| --- | --- | --- |
| Stable fallback | `ROADMAP_TASK_BOARD_LOCAL_ONLY=true` | Browser localStorage stays the active workspace; no API is required. |
| Audited candidate | `ROADMAP_TASK_BOARD_LOCAL_ONLY=false`, `ROADMAP_TASK_BOARD_PERSISTENCE=v1`, `ROADMAP_TASK_BOARD_API_BASE=/roadmap-task-board/api` | Same-origin UI uses the private API route, optimistic versions and activity history. |

Use the parent smoke command for the audited candidate; it sets the second mode
by default and verifies route → create task → transition to `Done` → activity.
Manual UAT must also confirm on desktop and mobile that task drag/drop, task
editor, roadmap editor, Refresh, initialization warning, activity drawer,
theme, print and legacy hash routes remain usable.

## Portal release sequence

Roadmap Phase 5 source is now committed directly in the parent Portal Git.
Review the Portal branch into `dev`, then run the root gates:

```bash
./scripts/portal verify
./scripts/portal smoke
```

Promote the stable composed stack from `dev` to `main`. There is no child
repository lock or source-promotion step; the reviewed Portal commit is the
release definition.

## Data and rollback

Before enabling the audited candidate for a shared workspace, export the
existing Task and Roadmap JSON and take a SQLite backup. `backup` and `restore`
require explicit paths/`--replace`; see `docs/TASK_ROADMAP_BACKEND.md`.

Rollback is a build-flag switch back to local-first plus restoration of the
known-good SQLite backup if server state was used. Do not delete `data/` or a
production volume as a cleanup action.

## Safe cleanup

After all checks finish, remove only reproducible artifacts:

```bash
tooling/clean-generated.sh
tooling/clean-generated.sh --dependencies  # also removes npm install trees
```

The script deliberately leaves data, backups, `.env` files, exports and Git
metadata intact.
