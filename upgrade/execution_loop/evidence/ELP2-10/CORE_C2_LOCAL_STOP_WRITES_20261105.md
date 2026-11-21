# C2 recovery — local stop-writes candidate

2026-11-05. Branch `docs/research-loop-plan`, committed HEAD
`2faa8968fddbde59b2e59525e334ba3d83886144`; all files in this receipt are
uncommitted working-source candidates. **Not installed; V2 restore remains
refused.** This is not a physical old-holder, public-authority, in-flight HTTP,
external source, terminal or ACK fence, and is not permission to cut over.

## Local behavior and pins

The existing database-local generation fence can now stop admitting its
selected writer without first choosing a new writer. `stop_writes` takes the
head lock, waits for transactions admitted by the selected database guards,
then atomically disables the head and records an operation ID with the exact
prior generation and role. It admits a retry of that same operation only if
the matching stopped generation is still current; a changed input or a later
rotation fails closed. The recorded stop is not durable until its transaction
commits. Callers need a short, dedicated transaction with bounded timeouts and
must not acquire application or authority locks after the fence lock.

The writer safety checks also reject direct modification of the stop history or
execution of administrative fence functions. The stop-history trigger
rejects non-owner direct inserts and update/delete/truncate. The installing
owner/superuser remains trusted and can change DDL: this is not tamper-proof
against a database administrator. The inventory candidate now includes the new
table and uses `portal.restore-c2-inventory.candidate.v2`; old v1 inventory
commitments must not be silently relabelled as v2.

| Working-source input | SHA-256 |
| --- | --- |
| `restore-local-generation-fence-candidate.sql` | `70e2c00068a20c06d2e3b0388b2a15d568d8c82d33e1b65ef52041064280c8a0` |
| `restore-local-generation-c2-extension-candidate.sql` | `ea854dce504c71c3585ac6fd0cd860fcf0bac96cc853d843c8a6e3d8ca8de915` |
| `restore-local-generation-delivery-extension-candidate.sql` | `864968b96bdaa9c360801a8093ef5921da4881325ab978dd8d08447229746ed3` |
| `restore-c2-inventory.ts` | `2e4fc247cf450c6299bd4e1c141be46797c9630e4e5a42f3dd5ace127e4d7470` |
| `restore-local-generation-fence-pg.spec.ts` | `eb5f337142754eeec9454292003411102fc8bbdf67a957ee6608a6e4064e8fd8` |
| `restore-local-generation-c2-extension-pg.spec.ts` | `38903499900a5c7393fecadaabc05dbd9dfea30cd1050dda78951916cddcfa3d` |
| `restore-local-generation-delivery-extension-pg.spec.ts` | `d9d954e4eb1e56556674558b95315da435d77f1990303d26ebc9c11a636a5044` |
| `restore-checkpoint-authority-pg.spec.ts` | `5b3b9cad667211e4404b0c3b415dce4e5206826882e2e95eb2aa4a14816a6336` |

## Verification

- Disposable local fence PostgreSQL: **2/2 PASS**. The test covers an in-flight
  transaction draining, rolled-back stop, lost-response retry, changed input,
  stale stop after later rotation, writer privilege escalation, forged receipt,
  immutable history and denial of the old writer.
- Disposable C2 and delivery extensions: **2/2 + 2/2 PASS**, including the
  added writer privilege negatives under the 18- and 21-table guards.
- Disposable two-PostgreSQL checkpoint retake: **8/8 PASS** with the v2
  inventory, including its actual migrated/candidate-schema test.
- Two earlier local attempts failed first on SQL syntax and then on a trusted
  superuser role-membership check. They were corrected and are not counted as
  passes. No full hook or product migration was run.
- The scripts created only bounded disposable containers/networks with tmpfs;
  teardown ran. A read-only container-name check found no remaining test
  `elp2-restore-rls`, `elp2-ckpt`, `control-api-test-postgres`, or
  `control-api-test-authority` containers.

## Remaining / handoff

This operation only fences the exact tables and database to which the selected
local extension is applied. Public user/session/grant tables, a different or
restored database, HTTP delivery and remote source state remain outside it.
Independent old-holder fencing, a complete authenticated post-snapshot
terminal/ACK census, representative restore, migration/ACL review, final
candidate integration and the normal hook remain open. Source and schema
changes require the affected receipts and transitive pins to be retaken.
Claude has no new frontend consumer request from this internal candidate.
