# Selected native integration reconciliation and PG retake — 2026-11-06

**PARTIAL SOURCE REVIEW AND SYNTHETIC INTEGRATION.** Not a complete branch
audit, frozen candidate, installed runtime, connected Edge acceptance or phase
pass. Checkout `docs/research-loop-plan@2faa8968fddbde59b2e59525e334ba3d83886144`
contains shared uncommitted work; preserve it and all other worktrees.

## Candidate reconciliation

`feat/execution-native-read-integration@b87f73dbd` has one commit outside HEAD
by ancestry. Do not blindly cherry-pick it: the selected per-path patch IDs of
`native-core-runtime.ts`, `manager-observation-source.ts`, both maximum-data
operation controller/service files, and the native-frame and execution realtime
tests match the corresponding changes in HEAD ancestor `d0789674a`. This is
path-specific evidence, not equivalence of the entire 25-file commit.

The patches for `native-core-composition.ts`, `native-manager-consumer.ts` and
the realtime controller differ. Comparison of those files at the two commits
shows additional trust-delegate checks, READ authority placement, typed stream
headers and bounded/joined stream preparation/shutdown in `d0789674a`. Current
HEAD has further changes, including Research-only binding and optional cache
observation. Preserve and review the later implementation; do not overwrite it
with the earlier branch. Other files in that commit and all other unmatched
branches remain subject to full integration review.

The selected branches `chore/core-provider-assembly-20261025`,
`chore/core-policy-wire-20261024`, `chore/core-policy-integrated-20261023`,
`chore/backend-residuals-20261025`, `chore/core009-approved-closeout-20261023`
and `chore/research-source-integration-20261025` are ancestors of HEAD. That is
ancestry evidence only, not proof that later code, config or runtime satisfies
every acceptance gate. `chore/manager-scoped-notices-20261026` diverges and was
not dispositioned; do not merge or delete it based on this review.

## Focused verification

- Four selected Vitest files on the shared worktree: **90 PASS / 52 SKIP**;
  the skipped file requires its guarded PostgreSQL URL. This is not 142 passes.
- `bash scripts/test-elp2-native-frame-coupled-pg.sh`: final run **52/52 PASS,
  exit 0** against a disposable PostgreSQL, synthetic mTLS source and real
  local Core HTTP/SSE sockets. READ-versus-STREAM grants, revoke, cursor,
  same-frame settlement and lost-ACK negative paths are among the test cases.
  The source is synthetic and is not the deployed Edge/PM source.
- An earlier run reported 52 tests passed but the script exited **127** because
  its file was edited while Bash was still executing it. It is not counted as
  the gate; the script was fixed and retaken. That first run mounted the entire
  checkout read-only into an internal-network cell. The successful retake
  mounted only the Control API, contract packs and bootstrap input read-only;
  no secret values were printed or intentionally used.
- The successful cell was limited to 2 CPU and 1.5 GiB total. One sample showed
  Node 490.2 MiB and PostgreSQL 246.5 MiB; these are **not measured peaks**.
  Exact test containers and their network were checked absent after cleanup.
  No live DB, runtime, grant, UI, command or remote changed.

| Direct WIP input | SHA-256 |
| --- | --- |
| `scripts/test-elp2-native-frame-coupled-pg.sh` | `fd9dc1659e055ff73f96f260231c2bc682b14794987e938f8909a2344f840adc` |
| `apps/control-api/src/execution-v2/native-core-runtime.ts` | `258575001c2f4d0a125c97b804053841cc4605c905c542d26179ef1b5385a296` |
| `apps/control-api/src/execution-v2/native-core-composition.ts` | `ea875f8947be74265ed18a1fe95baea7eaa1f0ed2c6bdb34bbe5edf5fa090385` |
| `apps/control-api/src/execution-v2/native-manager-consumer.ts` | `af117e14771f1015880edcc82c522a3d58d1f20b8c3d0825ef88d58e9ea273e3` |
| `apps/control-api/test/elp210-native-frame-coupled.spec.ts` | `f3df488467612cc0e27f7a6f73d18a072c733bf1a2ae1e23da962a67655c2a86` |

These direct hashes are not a transitive dependency, final source tree or image
pin. Complete the remaining WIP/branch review, P7 owner authority, durable
financial multi-delivery, V2 fencing/restore, real Edge READ/STREAM and ACK,
then run affected gates on the frozen candidate and the normal hook once.
No frontend contract/action follows from this test. Rollback: leave the runner
unused and preserve both branches; no production or user data was removed.
