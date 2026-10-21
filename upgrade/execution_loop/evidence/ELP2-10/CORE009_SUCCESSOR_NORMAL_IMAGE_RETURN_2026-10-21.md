# Core009 successor — frozen normal/image and commissioning return

**NORMAL_FAILED / FOCUSED_RETAKE_PASS / IMAGE_BUILT_AND_INSTALLED /
NOT_CONNECTED_READY**, latest cut21Oct19:02UTC; earlier observations below retain their times.
Actual installation is in the separately delivered [installed owner return](CORE009_SUCCESSOR_INSTALLED_OWNER_RETURN_2026-10-21.md).
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

## 5. Actual in-progress failures / owner intake21Oct18:29UTC

The same frozen normal is still running, **not PASS**. Its API sublane has
already reported4failed cases in2unchanged files:

- `test/elp207-instance-registration-transaction.spec.ts`: the four
  abort-ignoring provider-slot/ten-second timeout case(100590ms).
- `test/facade.spec.ts`: Planning session actor(15733ms), ADMIN snapshot
  initialization(37284ms), mismatched CSRF header(21615ms).

Final stacks/terminal are pending; timing/resource starvation is a hypothesis,
not an established flake. These files are outside the5path successor diff;
independent diagnosis is checking the exact source. The existing continuation
requires actual normalEXIT0 and therefore will refuse image build on failure.
Keep the original complete result. Per rules§10.10c.5, retake only failed files
after terminal/cleanup, at the same source, not another full normal. Any
remaining gate coverage or actual source defect must still be resolved before
landing/image readiness; never overwrite the normal terminal to0.

The [counted capacity/Claude delta return](CORE009_COUNTED_WINDOW_AND_CAPACITY_RETURN_2026-10-21.md)
was actually delivered to the approved Edge and PM public Markdown mailboxes
at18:25:11UTC, both verified SHA256
`7b915aed2479035ccc25494240575e8d48cec49c81f470af39d669c93720a67c`.
Delivery is not owner acceptance. No secret or Git push was involved.

Incoming Edge§10.1 now specifies the **actual complete original08 case set**:
positive HTTP7+Q, two sequential subscriptions with total admitted/prepared
framesB, maintenanceM; require reviewed `C >= H + R + 7 + Q + B + M`, currently
`36 + Q + B + M`. Root ACKs this selected case set; its minimum38(Q0/B2/M0)
is not an approved cap. The earlier2driver formula38+2R+F+C in the sent count
note describes that separate provisional variant, not an additional mandatory
suite or authority to replace the now explicit original08 schedule. Preserve
20reserve and real9history; derive authoritative frame and maintenance bounds,
then submit the concrete numeric decision. No cap/reserve/grant was changed.

## 6. Actual normal terminal and minimal continuation21Oct18:39UTC

The original frozen8ac normal completed **18:36:13UTC, EXIT1**, not PASS:
API486files =480PASS/2FAIL/4SKIP;9829cases =9818PASS/4FAIL/7SKIP.
Contract91files/1629PASS remains a different sublane, not added into API totals.
Final stacks establish:

1. Registration: final `finishMutation` authority deadline
   (`instance-registration.service.ts:110`, `ACCESS_RETRY_REQUIRED`). The
   source refused after expiry; no proof the provider slot was released early.
2. Planning: PG statement_timeout in `UsersRepository.lockById:78` via
   `AdminService.resetCredential` and `seedUser:194`, before the Planning call.
   A statement timeout alone does not identify a row-lock blocker.
3. ADMIN and mismatched-CSRF cases: real20s test timeouts; no proof yet of a
   changed authorization outcome. Preserve assertions/TTLs/security fences.

The image continuation ended18:36:16 EXIT1 without any build/install, correctly
requiring the original normalEXIT0. That controller/result is immutable.
The focused continuation owns only the2failed files(62cases), same8ac source,
fresh disposable PG, unchanged caps/timeouts and official restore drill. Its
private controller is `retake-failed.sh`; it waits without a heavy lock for
>=6GiB MemAvailable, stops after10minutes if unavailable, then locks only the
official `control-api-test.sh` command. No other full normal is scheduled.

The previously uncovered static suffix now actuallyPASS: N29, offline R3-2
closure and Execution tracking. N29 reports changed:false/written:false;
frozen source remains clean. PG restore is NOT_RUN until focused API passes.
If focused gates pass, report the original FAIL plus exact retake/suffix
qualification transparently; never edit `normal-exit.txt` to0 or call this a
green original hook. A qualified build continuation must explicitly verify
that aggregate coverage, not bypass an unresolved failure.

## 7. Focused terminal / qualified image continuation21Oct18:44UTC

Actual failed-file continuation started18:39:06, terminal **18:43:41 EXIT0**:
**2files/62casesPASS**, official forward migration/build and full scoped-access
row-digest restorePASS. The registration case now took10228ms with the SAME
source, authority fences, fixture TTLs and assertions; no timeout/permission
was weakened. The four previous failures are resolved on this exact-source
retake, not relabeled as a successful original normal.

| Artifact | Actual SHA256 |
| --- | --- |
| Original normal log, retained FAIL | `a40ca655a5cad267e613a5db6621efd9ca30a78fdbc506c0a1b1ac1ce1c8cf92` |
| Original normal terminal, retained EXIT1 | `1d755f770e4278a7172d12d45669c2a454b944cff1fe2bb062a3370cbd2e61d8` |
| Focused2file/restore log | `489a6905fea0092ab3819998321e8a3e1d98039c5adfae72bbfda80b6d7eec9d` |
| Focused terminal EXIT0 | `1d1c7f94bcbb064c65f146d2fb8dcb67318ee3b5b08cd5a76655a2e6dc90f3a5` |
| N29 uncovered suffix | `a72bc182ab5ef6585625435cbe29184e54471bb90814f1f74b331cf0589282d6` |
| R3-2closure suffix | `c3b4426ef142b6194d27b32faa3e23b89e2a738b340d7c3ca63b9452709edce4` |
| Tracking suffix | `1a45ec29669974f84c3c599d697d7f2994c666ccb4e7703b447ca24775d8352b` |

Qualification follows campaign§10.10c.5: retain whole original result, retake
only failed files and supply the uncovered suffix/restore. No second normal
hook and no addition of repeat test counts as new coverage. Exact retake
Node/PG/network cleanup is verified separately at closeout.

Image build started **18:44:05UTC**, same frozen8ac, session34681, approved
3CPU/3GiB/900s/disk guards. The NEW transparent continuation
`build-qualified-successor.sh` checks `qualified-gates.json` and every actual
log hash before building. It does not alter/reuse the old EXIT0-only script
or pretend the original normal passed. No image ID is claimed until actual
terminal `image-receipt.txt`. No install, policy/session/source change.

[Finite original08 proposal](CORE009_FINITE_08_BOUNDS_PROPOSAL_2026-10-21.md)
now returns concrete **C288 / one60s STREAM / K1 / reserve20**, PROPOSAL_ONLY,
including the current single-principal independent-scope gap and safe retained
limit rollback. It is not production budget/calibration or permission to
issue a grant. Owner review/current source pins remain mandatory.

## 8. Actual image terminal / safe serving preflight21Oct18:56UTC

The guarded build completed **18:47:40UTC, EXIT0**, at the unchanged frozen
source8ac4f553/tree4a29ae9e. Actual image `.Id` is
**`sha256:a96c754dfbd52801f6d451dfa329eeeb3ab37fe9e467db145e201c9fa9acf121`**;
tag `local/elp210-core009-candidate:8ac4f5530adf`. Do not substitute BuildKit's
different configuration digest for this Docker image identity.

| Artifact | Actual SHA256 |
| --- | --- |
| Guarded build controller | `65f901dc30d6df3a56b601b2af1dedff4314e8e43c509c9ff5a00b9197352af0` |
| Build log | `633cbc97c31ea8167f1a6ee8c1c99e34202a279838e0745fc7835a585b4038ac` |
| Image input Git tree listing | `01eb162fb30a75935cd6459359eff4c13b7e6c522310e53bfca5af787ce85585` |
| Explicit focused-retake qualification record | `728dee188387a364140ca6a007e92a5c0f85e6bef511c76530ec8f60be935d66` |
| Protected runtime before AND after | `5191596564aab277203668044bb22e6e0570d377b9b09ec4f6a9e0ec335cd8ab` |

Qualification is **QUALIFIED_AFTER_FOCUSED_RETAKE_NOT_ORIGINAL_NORMAL_PASS**.
The build verified those real log hashes and did not change the original
EXIT1. No duplicate full suite was run. Build-entry caps3CPU/3GiB/900s held;
post-build free disk150853402624/665811062784bytes(22.66%). The exact owned
successful build context was removed, evidence and rollback images retained.

Operational image checks PASS: successor CLI exists and parses, migration149
SQL is readable, npm is absent, custody schema is still826e4e08/root0644.
An initial check incorrectly looked for a migration `.js`; that operator
locator failure is retained and the corrected `.sql` check passed. A root-UID
config check correctly refused a Bobby-owned private artifact. The unchanged
real Research bundle was then constructed at the **actual serving UID1000:1000**
in an offline/read-only/no-network container: **EXPIRED_RUNTIME_CONSTRUCTIBLE**.
No DB connection, grant, session, source request or new authority resulted.
All of these small check containers used `--rm`.

The existing target is managed by its private resolved Compose artifact, NOT
the currently absent `execution-native/runtime.env` helper path. Image-only
rollout must clone that exact private configuration, preserve its mounted
runtime/auth references, and replace **both** API and migrator image pins.
Use official forward migration135–149 after backup/quiesce; retain the expired
authority bundle. This can install qualified code/schema without pretending
finite source/grants are ready. No migration or installation has happened at
this cut. A peer-owned PG gate is active; no overlapping heavy job is started.

The concrete60s/C288 proposal was delivered **18:47:34UTC** to both approved
PM/Edge public Markdown mailboxes; both readbacks match
`8db9c9fa5dd3d273815c82263a76a6c25a34332b711dce3f3d70e8220e8ceebe`.
It uses **B244**(240poll opportunities+4boundary allowances), not the earlier
review draft's242. Edge18:52 source-mechanism ACK is conditional; numeric
approval remains pending, cap32 stays unchanged. Edge offers19:15–19:45UTC;
match actual install/config/source pins before any finite request. The
independent-control scope remains NOT_PROVED, not waived by either proposal.

Root is landing only the two already-qualified writer commits. Claude is
currently rebasing its own lane with a debt-register conflict; Root does not
touch that tree or import incomplete peer work. Manager issuance, financial
source leaves, production numeric/calibration, G2 and real browser gates
remain independently OPEN; no new UI field is required by this writer.

## 9. Actual landing/installation successor21Oct19:02UTC

Writer landed ff-only as424a6c35/2a372de3, exact non-Markdown bytes and image
inputs equal frozen8ac; no code loss or duplicate hook/build. Official135–149
migrations and a96 image-only installation actually EXIT0 at19:02:20.
All21 protected table hashes/counts and peer runtime snapshots unchanged,
API healthy/direct readiness200; old native authority/cap32 remains expired.
Detailed backup/config/target/cleanup and source-owner action pins are in
the separate installed return above. Its bytes were actually copied to the
approved PM+Edge mailboxes19:04:42 with SHA256
`1bfc387d03bf0648fa656d3afebf7c260c81217d35a83f2d572c06e075b576cf`.
Delivery is not fresh source/window ACK or connected READ acceptance.
