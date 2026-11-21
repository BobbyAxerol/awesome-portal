# C2 recovery — journal forward-upgrade preparation, 2026-11-05

**SOURCE/TEST ONLY, UNCOMMITTED, UNMOUNTED.** These SQL files are not Portal
migrations, installation approval, V2 restore authority or a connected receipt.
Committed repository HEAD was `2faa8968fddbde59b2e59525e334ba3d83886144`;
shared tracked and untracked WIP is preserved and no image/schema/runtime was
changed. Resource usage was not measured; the existing disposable two-PG runner
sets each PG to 0.4 CPU/320 MiB and the test process to 1.2 CPU/896 MiB.

The [journal guard candidate](CORE_C2_RECOVERY_AUTHORITY_JOURNAL_GUARDS_20261105.md)
added guards to fresh candidate schemas but could not upgrade an already-created
candidate schema without recreating it. Two separate transactional SQL candidates
now add the respective journal trigger in place, taking bounded table locks,
checking expected table/column layouts, refusing existing guard objects and, for
custody, refusing a missing/disabled source-proof guard. They do not update or
recreate journal rows. The checkpoint test replays the same operation after
upgrade; this is not an Edge original or ACK.

## Test and limits

- `bash scripts/test-elp2-restore-checkpoint-pg.sh`: final **13/13 PASS** (8
  existing checkpoint tests and 5 upgrade tests), on two disposable PG clusters.
  The old candidate schemas were constructed **synthetically from current
  source with the new journal guards removed**, not from an actual historical
  production backup. Test includes data preservation, same checkpoint replay,
  mismatched columns, disabled proof guard, reapplication and active-writer lock
  timeout without partial upgrade.
- First direct execution of the untracked script failed with permission denied;
  invoking it with Bash in the restricted sandbox then failed to access Docker.
  After approved escalation, the first PG run was **11 PASS / 1 FAIL** because
  custody TRUNCATE hit the FK precheck before the expected trigger. The corrected
  test explicitly includes the FK child; a 12/12 retake passed, followed by the
  final 13/13 after adding the old-writer/schema checks. Neither earlier run is
  represented as the final result.
- The SQL checks column names/types and selected guard existence, **not** full
  schema constraints, guard function bodies, all ACLs, trusted history, physical
  storage independence, or a privileged owner's ability to replace routines.
  Stopping old writers and verifying original history/source proofs/target and
  ACLs independently before upgrade are required but **not enforced** by these
  scripts. Thus an external precheck followed by a still-running writer is not
  an atomic trust barrier. The synthetic custody row tests preservation only;
  it is not a valid source proof or custody-chain qualification.
- Existing candidate schemas require a reviewed target-specific upgrade and
  pre/post integrity verification; failures roll back the current SQL
  transaction and must not be bypassed by dropping guards or history. The runner
  owns disposable resources and its cleanup trap ran; no broad cleanup occurred.
  Direct Docker inspection lacked socket permission; the read-only
  `sudo -n docker ps -a --filter name=elp2-ckpt-` retake returned no matching
  containers. Full typecheck, normal hook, real restore and cutover NOT RUN.

| Input | SHA-256 |
| --- | --- |
| `restore-checkpoint-authority-journal-upgrade-candidate.sql` | `836eac70f18bcc4528488d68817f3e9192b14e13ffd40c34f739dbc86e7a5dfe` |
| `restore-independent-custody-journal-upgrade-candidate.sql` | `f3e1fa2186cea826c558f47e4e673a7889f773a4cdb81c7937a32aab55561010` |
| `restore-authority-upgrade-pg.spec.ts` | `f5e47b5c6fb76d44ada886f7cfb8ac19a1b11e5569622aa2d9d4e05cd928a6bf` |
| `test-elp2-restore-checkpoint-pg.sh` | `4ca1381d5b599b983fcdf17861c6f1e0c04afb4407f09a30a27e5ac1f58a74fe` |

## Remaining and handoff

Core must still build the independently controlled writer/DDL/old-holder and
HTTP/source fences, verify complete post-snapshot terminals/ACK and perform a
representative restore with legitimate independent authority. P7/A2, Edge
connected acceptance and final candidate qualification remain open. No frontend
contract changed; Claude has no new consumer action from this internal slice.
