# Phase 5 — release candidate & UAT checklist

> Status: **packaged locally; source promotion and gateway UAT are still
> required before a parent release.** This document does not authorize a
> production rollout or a live Discord notification.

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
npm test
npm run build
npx playwright install --with-deps chromium
npm run e2e
```

The source CI at `.github/workflows/ci.yml` runs the same backend, frontend and
Chromium gates on push/PR. The integration repository additionally runs a
three-container smoke flow through the parent gateway.

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

## Source promotion sequence

The integration lock must never point to a source commit that has not reached
the source remote. The current parent manifest tracks `manager-portal-v2`, so
merge this candidate into that approved source branch (or explicitly change the
manifest branch in a reviewed parent PR) first.

```bash
# in this source repository: commit is already local; push after review
git push -u origin feat/phase5-release-readiness

# after the approved source branch contains the commit, in portal/
./scripts/portal sync
./scripts/portal lock
git diff -- repos.lock
./scripts/portal verify --require-sources
./scripts/portal smoke
```

Commit the parent `repos.lock` change separately, review it into `dev`, then
promote a stable composed stack to `main`. Do not copy this repository into the
parent Git history and do not deploy a parent lock that still resolves the old
source revision.

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
