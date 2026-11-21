# C2 frozen local checkpoint candidate — 2026-11-05

**SOURCE ONLY; NOT A RESTORE OR CUTOVER PERMIT.** On branch
`docs/research-loop-plan`, committed HEAD `2faa8968fddbde59b2e59525e334ba3d83886144`,
the files below remain uncommitted. No runtime, protected database or source
authority was installed or changed.

## Change

`captureFrozenAndAppend` captures the actual bounded source inventory with its
tables locked, requires the exact active drain and authority revision, and
verifies a committed local `stop_writes` operation against the current frozen
head. The source locks stay held while the independent checkpoint is appended.
It rejects a currently unresolved local lease, native delivery, C2 delivery
obligation or potentially signed B2 attempt. The checkpoint commitment binds
the source, drain, revision, freeze operation and writer generation. The result
is still `STORED_NOT_CUTOVER`. It does not stop writers by itself.

The present delivery candidate has no final state or deletion path: **any C2
delivery obligation blocks this capture**, even after its deadline. That is
deliberately conservative, not a completed delivery/ACK lifecycle. No timeout,
local socket close or invented ACK resolves an original.

`FROZEN_SOURCE_CAPTURE` is a new event-kind value in the isolated candidate
schema. An existing checkpoint schema must not be silently treated as upgraded:
the forward constraint migration, history compatibility and ACLs still need
review and rehearsal before any installation. This change does not install a
migration or make earlier checkpoint receipts evidence for this source.

## Focused checks

- `bash scripts/test-elp2-restore-checkpoint-pg.sh`: **8/8 PASS** against two
  disposable PostgreSQL clusters. The actual migrated plus candidate schema
  test rejects an absent or stale freeze and a `RESERVED` original, then
  settles the same synthetic original, freezes a new generation and captures.
  It also verifies replay, rejects a mismatched writer, holds the local freeze
  against a competing mutation through independent COMMIT, and retries the
  same event after an injected lost COMMIT response. No real B2 was signed.
- Checkpoint and inventory unit suites: **19/19 PASS**.
- Focused strict TypeScript check of the changed source and PG test: exit 0.
  `git diff --check`: exit 0. Neither is a full project typecheck or hook.
- Test runner used throwaway, resource-bounded containers and network with
  teardown. No retained fixture data is production or connected evidence.

## Pins for this selection

| File | SHA-256 |
| --- | --- |
| `restore-checkpoint-authority.ts` | `52265367d3f11b773fc9b166deb00b9d54caa7c988e66e0bfee09d5368bb5ce3` |
| `restore-checkpoint-authority.sql` | `ef9b52f2fdfc6c30044abe05d3fe248bc75812d11dc029af06de72252bc55bfa` |
| `restore-checkpoint-authority-pg.spec.ts` | `6bc06c3fe491eec5ffee5cd0941a01b4420c2077829cdb8235032bcee965ca29` |
| `restore-c2-inventory.ts` | `2e4fc247cf450c6299bd4e1c141be46797c9630e4e5a42f3dd5ace127e4d7470` |
| `test-elp2-restore-checkpoint-pg.sh` | `37b4c824a46fc1bc6eff4392e277da20fed472a8c5353913639527998991c50e` |

Revalidate all transitive dependencies, schema, roles and environment on the
final candidate; matching only these pins is insufficient for receipt reuse.

## Remaining work

This local fence does not prevent writes on an old clone or an independently
administered system, prove recipient delivery/ACK or complete the source
terminal census, fence in-flight HTTP, establish independent failure domains,
or restore a representative historical backup. P7 and the issuer remain
uncommissioned. Keep V2 restore refused; complete those barriers and run a
representative final-candidate rehearsal before considering cutover. A2/B2,
connected acceptance, G2 and final integration remain open. No frontend
contract or action is introduced by this test-only candidate.
