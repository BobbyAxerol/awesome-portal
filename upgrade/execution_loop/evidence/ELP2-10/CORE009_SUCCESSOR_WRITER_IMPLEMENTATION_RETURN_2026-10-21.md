# Core009 successor writer — implementation / one-writer reservation

## Scope BEFORE implementation

Bobby's latest assignment explicitly prioritizes the successor writer for
READ/STREAM. Codex takes this **one named implementation slice**, supplementing
the general Claude implementation ownership in campaign §10.13. Claude keeps
UI, observation, financial reducer and other backend work; Codex remains the
sole integrator. This is not permission to activate source or trading.

- Baseline: canonical `7f3204026be1946d60af36c898c00b5a6e282f92`;
  Claude last read `413674701b5bdab38ac70840a5700419f98e86e4`, clean.
- Private worktree: `/home/bobby/portal-core009-successor`, branch
  `chore/core009-successor-20261021`, created from the canonical source.
- Codex reserves `execution-v2/access.service.ts`,
  `execution-v2/current-human-mutations.ts`, new
  `execution-v2/manager-domain-successor.ts`, new
  `cli/execution-native-successor.ts`, and successor-specific tests under
  `apps/control-api/`. Please do not write these paths concurrently; the
  observer's previously ACKed paths are separate and remain Claude-owned.
- Implementation refinement: the existing verified `INSTALL_POLICY` coordinator
  purpose already provides the required serialization/drain. No change to
  `current-human-mutations.ts` is needed; that reservation is released.
- No HTTP endpoint, public OpenAPI change, migration, account/session creation,
  SQL grant patch, authority widening, stable/dev/main or source mutation.
- Goal: official owner-pinned finite successor/CAS with preserved predecessor
  policy/grants/audit, separately selected READ and STREAM; exact replay is
  historical only. Same current-human drain, UNKNOWN and recovery fences.
- Validation: pure planning/file-boundary regressions and existing first-install
  tests; disposable PostgreSQL successor/concurrency/drain tests, then a frozen
  affected-code gate/image. Do not repeat the already-passed432 normal gate.
- Budget: light focused tests first; one disposable PG command at a time under
  the existing heavy-lock/cell caps. No connected load or calibration constants.
- Rollback: revert only this new source slice before activation. No runtime or
  DB change has been made; older proof/source bytes are retained.

**Current status: IMPLEMENTATION_IN_PROGRESS / NOT_INSTALLED / NOT_READY.**
The earlier successor request remains the canonical requirement:
[ELP2-REQ-10-010](CORE009_SUCCESSOR_AUTHORITY_REQUEST_2026-10-21.md).
No new Edge window is requested until qualified source/image actually exists.

## Independent parallel work

Read-only Fleet cancellation review, PM/Edge issuer+financial source refresh,
and budget/calibration/coexistence readiness review are disjoint. No agent may
edit shared source, use credentials, run a heavy gate or activate a provider.
Manager issuer, genuine financial mapping, numeric bounds/calibration and
consumer browser acceptance remain separate open gates, not writer prerequisites.

## First source / independent review return

The private module, service and offline CLI now exist in the isolated worktree.
The planner supports unchanged-policy renewal only inside its existing seal,
or an explicit successor policy that changes no identity/field/action semantics.
Advancing policy refuses any legacy fact or still-active native constraint;
grant IDs/revisions are fresh and predecessor facts are never modified.

- Actual focused pure test: **73/73 PASS**, synthetic planning evidence only;
  no DB or connected READ/STREAM proof.
- Independent security review accepted CAS, scope/no-widening, append-only
  grant/audit and current-human drain design. Its final-window finding was
  implemented: fresh DB clock after actual inserts plus synchronous expiry
  fence rechecked by the coordinator immediately before COMMIT.
- One combined disposable PostgreSQL gate started **17:03 UTC**, four focused
  files (successor pure/PG and historical install/revoke regressions), with
  standard build and scoped restore. Status **RUNNING**, not prewritten PASS.
- Two duplicate local typecheck attempts were explicitly stopped (EXIT143);
  neither is reported as PASS. The one PG gate owns the needed source build.

No installer invocation, new grant/session, Edge activation or runtime swap has
occurred. Source-only implementation does not yet justify a finite window ACK.

Documentation publication: **Verification: R0**, explicit Markdown-only paths,
`git diff --check` and `scripts/execution-tracking-test.sh` PASS. No code gate
is claimed by this documentation commit; the running PG result is separate.
