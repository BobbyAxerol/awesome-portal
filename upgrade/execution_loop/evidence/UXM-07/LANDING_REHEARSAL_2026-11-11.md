# Landing rehearsal: claude/slice-followthrough onto Codex's working tree (11 Nov 2026)

Done by Claude in its own worktree (`/tmp/land-int`, local branch `integrate/ft-plus-codex-wip-lead`). Codex's checkout `/home/bobby/portal-research` was only read (`git diff`, `git ls-files --others`, `rsync` from it); nothing was written, staged or built there. The result is a snapshot: Codex's tree is live.

## Snapshot

| | |
| --- | --- |
| Codex HEAD | `2faa8968fddbde59b2e59525e334ba3d83886144` (`docs/research-loop-plan`) |
| Taken | 2026-11-11T09:51:37Z (first snapshot 09:44:27Z; tracked diff identical in both) |
| Tracked diff | 30 files, +3,168 / -217, sha256 `e1975bc935288c09c0204f4b651ac07b14a685c632fb79164eae19dfe03ec079` |
| Untracked | 434 paths, all copied |
| Claude tip rehearsed | `0e2acb4b4` then cherry-picked `51babbca4` and `5966787c7` on top (clean) |

## Conflicts

`git apply --3way` of Codex's diff onto Claude's tip: 29 of 30 files apply cleanly, including `apps/control-api/src/app.module.ts` (disjoint hunks). Only `apps/control-api/src/main.ts` conflicts, in two places, both mechanical. Resolution keeps both sides:

1. imports (near line 19): keep both
   `import { typedAbsenceDependency } from "./typed-absence/typed-absence.bootstrap";`
   `import { assertC2P7ReviewSchemaCommissioned, c2P7ReviewRuntimeReference, prepareC2P7ReviewRuntime } from "./execution-v2/c2-p7-review-runtime";`
2. the `dependencies` spread: keep both `...(p7Review??{})` (Codex) and `...typedAbsenceDependency(config)` (Claude), i.e.
   `...(nativeCurrent?{nativeCurrent}:{}),...(commandStatus?{commandStatus}:{}),...(nativeRoot?{nativeRoot}:{}),...(p7Review??{}),...approvalEvidenceDependency(config),...equityProjectionSourceDependency(config),...typedAbsenceDependency(config) };`

The two mounts are independent: typed absence is gated on `retained_review_v1`; the P7 candidate path is gated on the native Research review profile plus a private runtime reference.

## Verification on the combined tree

- `test/elp204-positive-parent.spec.ts` (full `AppModule` boot with the three dark sets, Postgres cell, `scripts/control-api-test.sh`) 357 of 357, with `test/typed-absence-http.spec.ts` 38 of 38: 395 passed, cell exit 0.
- Codex's database-free specs among the 44 non-`-pg` specs in the diff: 22 files passed, 1 skipped, 293 tests passed, 6 skipped (vitest, `--maxWorkers=2`).
- `tsc --noEmit` in `apps/control-api` on the combined tree: **14 errors, all in three Codex spec files**: `test/c2-p7-owner-intent-candidate-pg.spec.ts` (12, `signed` is `unknown`, one bad overload), `test/c2-delivery-procedure-pg.spec.ts` (1), `test/command-source-assertion.spec.ts` (1, `Promise<void>` vs `Promise<undefined>`). Claude's branch alone type-checks clean in control-api and frontend, so these belong to the uncommitted Codex specs. Owner: Codex.
- Not run: the 21 `-pg` Codex specs and the rest of the Docker cell (they need Codex's own gates), the full pre-commit hook, the Edge Rust tree.

## What Codex runs to land

1. Commit (or set aside) the working tree on `docs/research-loop-plan`.
2. `git merge claude/slice-followthrough` (a fast-forward is impossible once Codex has new commits; a merge commit is fine). Resolve `main.ts` as above.
3. `scripts/refresh-release-integrity-ledgers.sh --write` then `--check` (the staged Edge Rust tree, if landed in the same step, moves the EDS-12 and N29 pins), and `node scripts/research-loop-v11/p01-baseline.mjs --write-live-routes` (341 routes on this branch; Codex's c2 routes will add to it).
4. Fix the 14 type errors in the three Codex specs; then run the full hook once at the tip.
