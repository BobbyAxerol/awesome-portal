# R-B blocker snapshot: receipt (29 October 2026)

Branch `claude/ft-be` (base `claude/slice-followthrough` @ 02cc16b91). Design: `RB_BLOCKER_SNAPSHOT_DESIGN_2026-10-29.md`. Backend authority is Codex; this is a proposal for review. No connected-source, deployed or browser acceptance is claimed; no seal is installed in any real environment.

## What changed

* Backend: purpose `LIVE_BLOCKERS` (live only, own digest `sha256:6216db52...9231`; `LIVE_ROOT` digest unchanged `sha256:d6d63a6b...ed6d`), seal cap 31 -> 32; `qualifyLiveParentDetailed` selects it through the existing exact-leaf selector and folds it into the qualification proof; `LiveParentRepository.protectedDetails(selected, {blockers})` reads `blocker_count`/`blocker_summary` in the same root statement of the existing `REPEATABLE READ READ ONLY` transaction; the private revision witness includes them only when requested; `LiveParentReads` passes the flag to decode and to the final `isUnchanged` fence; optional `blockers` block (AVAILABLE / ABSENT) omitted when the purpose is not authorized.
* Contracts: generator `execution-positive-parent-reader.mjs` -> `execution-operations.v1.schema.json`, `execution-governance.d.ts`, `execution-profile-read.d.ts`, fixtures `live_blockers`, `live_blockers_zero`, `live_blockers_absent`, `contracts-snapshot.json`; all produced by `npm run generate:execution-operation-reader` and `snapshot.py`, none hand-edited.
* Frontend: `readLiveParentV2` decodes the optional block (`unauthorized | absent | available`) and refuses a body whose block names another approval id/version or contradicts count/summary; `liveBlockerLine(parent)` reads only that block; the inbox-row cross-read was removed from the UI path with no fallback (props `blockerRow`/`requestedWorkspace`/`inboxCurrent` deleted).
* Finding: blocker columns are DB-immutable after capture (migration 142 trigger); the hazard closed is pairing them with a gate body of another lifecycle moment. Tests mutate status/version.

## Commands and results

| Command | Result |
|---|---|
| `PATH=<scratchpad>/dockerbin:$PATH HOST_UID=$(id -u) HOST_GID=$(id -g) flock /tmp/portal-heavy.lock ./scripts/control-api-test.sh test/elp204-positive-parent.spec.ts` (disposable PostgreSQL cell; includes the cell's own `tsc -p tsconfig.build.json` build) | first run 313/317 (4 failures in my new block: test assumed blocker columns mutable, and a spy-argument assertion); fixed; rerun **317 passed / 317, exit 0** (11 new R-B tests, incl. the real-DB concurrent-mutation test) |
| `npx tsc --noEmit -p tsconfig.build.json` (apps/control-api) | clean |
| `npx vitest run` (packages/contracts, host) | 112 files, 1902 tests passed |
| `python3 packages/contracts/tooling/snapshot.py --check` | matches all 711 tracked files |
| FE vitest: cockpit, readers (incl. `governanceParents*` conformance, 10809 tests) and the seven hygiene tests (disabledReason, absentValues, failClosed, productBoundary, titleAbsence, ticketGuard, v2Hygiene) | 17 files / 1813 tests passed in the last combined run; the `governanceParents` pair 10809 passed |
| FE `npx tsc --noEmit -p tsconfig.json` | one real error (unused import) fixed; rerun clean apart from `features/roadmap-task-board` dependency noise |
| `execution-n29-product-acceptance.py --refresh-evidence --write` / `execution-eds12-qualification.py refresh-static-input-digests --write` | `changed: false` both (no pinned input changed) |

A first FE run of `readers/alphaResourceScoped.conformance.test.ts` timed out under host load (21 s); it passed in isolation. It does not touch this change.

## What the real-DB receipt shows

The `REAL DB` test wraps the repository's pooled client: right after the root statement it commits (second connection, autocommit) `status='DENIED', approval_version+1`. Same client, same transaction, probe query returns version 1 / `APPROVED` while a separate connection returns version 2 / `DENIED` (so the transaction really is repeatable-read). The returned snapshot is version 1 / `APPROVED` with blockers `{2, summary}` and `approval_id`/`approval_version` equal to the gate's; `isUnchanged(..., {blockers:true})` is then `false` (fence); a second read returns version 2 / `DENIED` with the same immutable blockers. Service-level test: a mutation between decode and finish yields `OPERATIONAL_READ_CHANGED` (409). Also: unauthorized purpose = no `blockers` key and no `blocker_*` column in any SQL; `LIVE_BLOCKERS` without `LIVE_ROOT` = 503 purpose-unavailable before protected SQL; live-read DENY = 404 before protected SQL; overlong/control-character summary = typed ABSENT; zero blockers = AVAILABLE count 0, not absence; mismatched id/version, missing fields and extra fields rejected by the zod contract; JSON-Schema negatives in `packages/contracts/test/execution-positive-parent.spec.ts`.

## Not run / not claimed

* Playwright `e2e/execution-v2-rb-fixture.spec.ts` was rewritten to the snapshot model but **not executed** (needs the local Vite fixture build; the earlier timing flake was not investigated in this backend slice).
* Other control-api specs were not run (only `elp204-positive-parent.spec.ts`; `grep` shows it is the only spec referencing the changed symbols).
* Mid-flight revocation of the `LIVE_BLOCKERS` seal itself is covered by construction (the seal+grant is in the qualification proof compared at every fence) but has no dedicated test; the mid-flight row-mutation fence does.
* The policy owner must still review and install a `LIVE_BLOCKERS` seal and matching `audit.read` grant for any real workspace; until then real bodies omit the block and the cockpit shows the generic state.
