# Recovery V2 — independent authority readback candidate

**SOURCE/TEST ONLY.** This follows [the closed-observation journal](CORE_C2_RECOVERY_CLOSED_OBSERVATION_JOURNAL_20261106.md). It is not a restore authorization, an independently commissioned authority, or a connected source/ACK receipt. No shared runtime, database, grant, frontend or deployment changed.

## Change and boundary

The unmounted reader connects only to the separately pinned authority cluster, not the closed source database. It requires a caller-supplied exact checkpoint head and operation, checks the cluster identifier, verifies the complete bounded hash chain and every retained closed-observation preimage, and returns the selected observation as `VERIFIED_JOURNAL_NOT_CUTOVER`. The expected head must come from a separately qualified trust channel. In this test it is read from the same disposable authority database and is **not** evidence of that channel.

The first concurrency test showed that PostgreSQL `ACCESS SHARE` does **not** stop `DISABLE TRIGGER`; its assertion failed and the run was **22/23**, not a pass. The candidate now uses a narrowly provisioned `SECURITY DEFINER` lock helper to obtain `SHARE` locks on the three journal relations, verifies the actual lock modes from the reader's transaction, and checks the guards and journal while locks are held. The reader uses `READ COMMITTED`: a repeatable-read snapshot established by the initial helper call before waiting for DDL could otherwise predate that DDL. The separately created test reader has SELECT and helper EXECUTE, but no table INSERT/UPDATE.

The helper is an **unmounted candidate**, not a production migration. Its ownership, SQL body, EXECUTE privileges, trusted installation, operator independence and contention/availability impact require qualification. `SHARE` blocks journal writers while readback is active; bounded timeouts limit this candidate's waits, but no production resource or latency qualification was performed. The check is a point-in-time observation; it does not authenticate the operator or stop a privileged authority administrator from rewriting the entire database and an untrusted anchor. Old-holder/source fencing and complete post-snapshot terminal/ACK reconciliation remain open. Keep V2 restore refusal in place.

## Validation and exact pins

- `scripts/test-elp2-restore-checkpoint-pg.sh`: final **23/23 PASS** across two disposable PostgreSQL clusters, with an actual separate SELECT-only authority login and a closed source DB. The selected case covers wrong head/operation/source pin, changed event history, disabled guard, changed/missing preimage, concurrent `DISABLE TRIGGER` blocked during read, and a replaced no-op helper refused because the actual locks are absent. Earlier PASS runs overlap and are not additive.
- Strict focused TypeScript check for the reader: exit 0. `git diff --check`: exit 0 for tracked changes. No project-wide typecheck or normal hook was run.
- The runner removed its own isolated containers/network; a read-only Docker census found no `elp2-ckpt-` containers or networks. Peak resource use was not measured.

| Local candidate | SHA-256 |
| --- | --- |
| `restore-checkpoint-authority-reader.ts` | `931673dfc5a59478bafd32d55c5b1bdb2af14fd0853b4e0e988cd09fc5ad714d` |
| `restore-checkpoint-read-lock-candidate.sql` | `a0ffaec1ae0c57f94066d907087ed267e9a3fb03b6edd71ac814ff406516b12a` |
| `restore-checkpoint-authority-pg.spec.ts` | `0d7afbbf708633835da2f1d484aedf800a67d60d5d6f733dc7de64cb52fd2e7e` |

The test hash above supersedes that file's pin in the earlier journal receipt; the earlier source/schema hashes and scoped result are unchanged.

## Next / rollback / handoff

Core still needs independently operated checkpoint/owner authority, an old-holder and source fence, authoritative terminal/ACK completeness after snapshot, representative restore and integrated candidate qualification. P7/issuer and full A2 remain uncommissioned; B2 remains unsigned. Rollback is to leave these new files unmounted: no runtime schema has been installed. No frontend contract or consumer action is requested.
