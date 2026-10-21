# Core009 successor — frozen normal/image and commissioning return

**RUNNING / NOT_INSTALLED / NOT_CONNECTED_READY**, read cut21Oct18:06UTC.
This is the new return for corrected source. Earlier first-focused and
sequential returns already sent to HK remain immutable. No push, dev/main,
stable/provider28445, command/Live, UI or source activation is authorized by
this Markdown. Parent: [implementation/ownership](CORE009_SUCCESSOR_WRITER_IMPLEMENTATION_RETURN_2026-10-21.md)
and [real sequential correction](CORE009_SUCCESSOR_SEQUENTIAL_AUTHORITY_RETURN_2026-10-21.md).

## 1. Frozen source, actual tests and one build continuation

- Branch `chore/core009-successor-20261021`, isolated checkout
  `/home/bobby/portal-core009-successor`.
- Frozen full source `8ac4f5530adfcfc6f5ecfb92da55bb56329df92d`, tree
  `4a29ae9e0c96ac2a3718423584ddd708e366266c`; clean throughout the gate.
- Five owned paths, **+755/-0**: access-service writer87, private planner121,
  CLI52, pure tests310 and PG tests185. No public contract/schema migration
  or current-human coordinator change. Historical predecessor CAS and current
  exact seal identity are distinct; READ advancement cannot strand an
  independently requested later STREAM successor.
- Actual focused proof:73 pure+9 disposable-PG+6 unchanged installer+3
  unchanged revoke = **91 distinct current cases**. PG build/scoped restore
  passed. Old72PASS/1FAIL source reproducer and obsolete normal143 remain
  retained failures, not added successes or hidden flakes.
- Fresh normal began **17:37:56UTC**, exact source above. It is still running;
  terminal verdict/hash/count will be added only after `normal-exit.txt`.
  Existing contract verdict91files/1629PASS is one sublane, not full normal
  PASS. No parallel heavy gate or duplicate normal was started.
- Private state:
  `/home/bobby/.local/state/portal-execution-elp210/20261021/successor-frozen-ErfjOY`.
  Normal controller SHA256
  `e4469ee868f674074062d91714c6e717af5bca0343a7b00b0208a5c8d7dfad99`.
  Build controller SHA256
  `e7c966433ffa4c182ee562c4e00adad8307899c800db59cabda9587689898d88`.
- Actual continuation started **18:05:01UTC**, session85550, waiting on the
  immutable terminal file, with **no heavy lock held while waiting**. SHA256
  `21f792dbeb2e48a3ee974fe8c8c8e117b06c3d6ec69c48e7d754d0acc87b9a4e`.
  Only matching normalEXIT0 permits the image build. It refuses changed/
  dirty source, a busy heavy slot, disk below20%/16GiB or free memory below
  6GiB. Build-only ceiling3CPU/3GiB/900s; protect runtime before/after, stop
  on excessive disk growth, clean only the exact owned successful context.
  It starts no hook, installation, session, grant or source.
- A first continuation exited1 before starting any build because its
  unprivileged PID check could not see the host namespace. Its script/log/
  terminal are preserved as `after-normal-*`; it is **not** the normal-gate
  result. The replacement uses terminal-file evidence, not PID assumptions.
- **Image ID/digest: NOT_BUILT at this cut.** Intended tag
  `local/elp210-core009-candidate:8ac4f5530adf` is a label, not proof.

## 2. Actual Research target / forward-migration preflight

Read-only actual intake17:39:41, migration ledger17:47:28 and index metadata
17:58:46; no SQL writes or authority artifact/session was created:

| Pin | Observed value |
| --- | --- |
| Database/system/role | `portal_control` /`7688673963308855330` /`portal` |
| Protected owner | `usr_5a38d5dfb08b44748f5776fbe04a1434` |
| Workspace | `ws_06G19F61YB8CFR7TEWMS7HQ660` |
| Installed image | `sha256:9cf5fffac3e0bf55ea4b23c9df2b85565da556b973fbb1ce6928936f49a2950c` |
| Installed runtime/config SHA256 | `f3fe876df8c47acdf82da46a2046cc9878362614b47339ad888f67b9457863b9` |
| Custody schema SHA256, unchanged | `826e4e083c8db536fc80a0f0ec272e3a71387a5e5d53a9cde48563f41fe32728` |
| Last applied migration | `1723680000134_execution-access-policy-v2` |
| Candidate forward delta | **135–149**, not already installed |
| Index145 base table | `execution_incident_operation_links`:16384bytes |
| Index149 base table | `execution_operation_queue_items`:49152bytes |

Both new indexes are absent. PostgreSQL row estimate-1 means no estimate,
**not zero rows**. Metadata was obtained in a READ ONLY transaction with a
3s statement timeout. All15 migrations were read: additive tables/guards/
indexes and forward view/constraint changes, no user/grant seeds or data
rewrite. Ordinary CREATE INDEX145/149 takes a write-blocking SHARE lock;
quiesce before forward migration, even though these base tables are small.

Intake JSON SHA256
`df9b846f0a8922eb06edba4a88162efacf3e29d78597e50316a0ae334e649889`.
Original custody DONE, revoked acceptance session/token removal, predecessor
history and ordinary session baseline remain preserved. Do not call the
first-install policy/schema tool, resurrect an expired grant or reset login.

**Actual census18:12:38UTC**, independently read in the same exact target:
retained9/unresolved0, native8/unreconciled0. The installed32 ceiling with
20 reserved recovery obligations permits at most **3 new admissions**, not
23, and not a full default multi-request/SSE driver. Keep original rows.
One earlier read attempt was NOT_EXECUTED because automatic approval timed
out; the explicitly permitted single retry produced this actual result.
`admission-census-181238.json` is retained beside the private intake.
Before a full connected campaign Edge must return a per-case admission/frame/
recovery census and reviewed bounds; no implicit cap raise, row purge,
restart-as-reset or shrinking the acceptance story to get a false PASS.
This does not block one eligible READ with the current finite reserve.

## 3. Ready subset / commissioning sequence within existing approval

After actual normal/image terminal, Root returns those pins to Edge. Edge
then returns the actual matched finite acceptance/window, not another
compatibility ACK. No short-lived source/session is opened while waiting.

1. Repin exact target, current policy/predecessor CAS, zero UNKNOWN/unresolved
   custody/in-flight and the actual Edge pause/maintenance acknowledgement.
2. Validate the compact newly pinned Research runtime/private references;
   prepare successor and exact revoke/session cleanup artifacts with separate
   READ/STREAM grants, <=source/trust/runtime cap and <=2h. No stable copying.
3. Quiesce, graceful SIGTERM/natural exit, authoritative backup+TOC/hash; run
   official forward migrations135–149 and verify actual ledger. The custody
   schema is unchanged; do not reinstall it or fabricate recovery receipts.
4. Run the official successor CLI using the exact image/runtime/schema pins;
   dry-run is not DB CAS/READY. Install through the verified mutation fence,
   preserve predecessor/audit/session rows, then read back the genuine receipt.
5. Start only Research control-api through the scoped preview helper/native
   overlay; verify actual image/config/schema/health and nginx upstream.
6. Issue the bounded acceptance session through the official CLI, transfer
   only private references. Qualify READ first, then independently authorized
   STREAM; run actual revoke/restart/recovery with source-terminal/UNKNOWN
   fences. Keep Core32 cumulative receipts with>=20 reserved for recovery;
   stop and repin actual counters between finite requests.
7. Revoke only exact new grants/session via official CLIs, reconcile genuine
   source ACK, remove transient tokens, verify ordinary sessions unchanged.

Rollback: pause clients, settle original custody, officially revoke new
authority and return exact prior image/config when drained. Preserve schema,
policy/grant/audit history; no SQL deletes, force kill or blind DB restore.

## 4. Separate owners and immediate next work

- **Claude:** fix delayed quiet/Fleet/pre-I/O tabs/G2 ingestion and actual
  private observer factory; [independent review](CODEX_PRE_WINDOW_MEASUREMENT_AND_FLEET_REVIEW_2026-10-21.md).
  The latter is a cache-HIT-case input, not an eligible READ prerequisite.
  P21/P22 source acceptance and Claude's328 PG tests are not installed proof.
- **Edge:** new actual acceptance/runtime/window pins after source/image
  return; existing section9 compatibility and section10 case request received.
- **Manager issuer:** genuine leaf/chain or controlled issuer-service return
  still absent; no self-signed substitute or stable-key copying.
- **Financial owner:** PM61edc761 staging/generation work does not publish C5
  economic leaves/census/valuation/full costs; mapping still pending.
- **Budget/calibration/coexistence/G2/browser:** D1–D7 direction stays approved;
  numeric production bounds, independent calibration population and actual
  source-authorized measurement window remain distinct inputs. Do not use
  fixture values or candidate correctness ceilings as those approvals.

**Exit:** code-focused qualified; normal/image/installed/connected not yet
qualified at this cut. ELP2-10 OPEN, ELP2-11 not entered. Verification:R0 for
this Markdown only; no duplicate tests for documentation.
