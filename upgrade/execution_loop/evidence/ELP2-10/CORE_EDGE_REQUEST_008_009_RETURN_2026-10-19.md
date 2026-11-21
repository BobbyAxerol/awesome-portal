# Core acknowledgement — Edge requests008/009, 2026-10-19

Producer baseline `f46439157fe25892fc4372dda532bd1f8bdc4773`, active
`docs/research-loop-plan`. The initial acknowledgement is preserved below;
the appended implementation return supersedes its source status, not its
installation/connected limits. No runtime credential, session, DB row,
provider28445 or service changed in this repair.

## 008 — ACKNOWLEDGED / IN_PROGRESS, actual repair NOT_DELIVERED

Accepted as a genuine defect in the private unused-identity finish path:
`beginDrain` retires a never-entered lease, but bootstrap `ownedTerminal`
requires a source terminal/unentered-source-rollback which a truly unused
identity cannot have. Source locators and original pins are preserved in
[the owning request](EDGE_TO_CORE_EPG10_08_REQUEST_2026-10-19.md#2-p1--sửa-cleanup-khi-mất-phản-hồi-issue-identity-trước-khi-edge-sử-dụng).
No observed orphan is claimed; the reported READY/zero-callback state is dated.

Next coherent Core package:

- Separate **private** unused-finish eligibility under the existing committed
  drain/authority transaction; exact original lease/session/user/workspace/
  environment/workload/request and revisions, RETIRED with null attempt and
  receipt, complete ISSUED→RETIRED history, no callback/unresolved obligations.
- Preserve `ownedTerminal`, actual COMMIT/UNKNOWN/source receipts, one-view
  restart semantics and immutable custody. Never synthesize ROLLED_BACK/ACK.
- Original issuance revision must be captured, not guessed from current drain
  revision or labels. Cleanup must still work for expired/revoked sessions;
  it is not a new grant and must not require a fresh login snapshot.
- Focused real-PG race/retry/lost-response negatives and a reproducible
  source/installer patch before any narrowly bounded runtime replacement.
  Keep source-only and actual installation pins/receipt separate.

Independent source review confirms the defect; implementation/tests and
installation remain pending. Do **not** issue a genuine assertion against the
old bootstrap merely because this acknowledgement exists.

## 009 — ACKNOWLEDGED, existing source seams / runtime NOT_COMPOSED

Reuse `prepareNativeCoreRuntime` / `composeNativeCore` /
`nativeCoreManagerReadConsumer` / existing `AppModule` dependency seam. Same
Core pool, trust, mutation/recovery coordinator and retained recovery registry;
no second app, authority engine or SQL seed. The currently installed reverse
bootstrap is identity-only, not proof that the native reader is mounted.

Existing reviewed owner intake is fresh-policy-only, hash-pinned/root0600 and
bound to physical DB/login, protected owner, exact subject/workspace and
catalogue/profile/field seals. A conflicting/nonempty policy must not be
overwritten. It returns `stream_commissioned:false`: READ, STREAM, effective
subscription and source ingestion require separate explicit evidence.

Source owners still must publish their qualified operator and real operational
manifest/config ACK, finite window and authenticated recovery28446 READY;
then physical identity receipt + Core ACK supplies TS UUID/version. No identity
mapping from usernames or stable-owner copy. Provider28445/six stable bindings
must not be restarted or have trust/leaf/key replaced by this work.

## Next return / scope / rollback

008 repair + installed/source-only receipt can be returned independently of009.
Operator isolated67PASS means65 overlapping regressions+2TLS loopbacks, not
actual Core/PM SDK/DB/connected08 proof. Never convert source code or file
delivery into the receiving owner's ACK.

Current reader batch has focused validation; ordinary R3 has not landed it
(latest hook failed). Its results do not close008/009. No new public FE field or design
change from this acknowledgement. Claude may consume the separate
[reader contract handoff](claude-reader-priority-return-2026-10-19.md).
No command/Live, production/dev/main, push or ELP2-11 permission is added.
Rollback this note only by an attributed follow-up; preserve previous records
and custody. Overall10 **NOT_MET**,11 **NOT_ENTRY_READY**.

## Core implementation return — SOURCE_ONLY / NOT_INSTALLED, 2026-10-19

008: **SOURCE_IMPLEMENTED_TESTED_UNCOMMITTED / NOT_INSTALLED**, focused PG receipts
below. 009: source-map preparation delivered; runtime NOT_COMPOSED. Independent
dispositions: neither is an Edge consumer ACK or connected08 acceptance.

### 008 implementation / unchanged fences

Only candidate private issuance/finish, its focused tests and reproducible
nonsecret Research bootstrap source changed; no public API/schema/migration/FE.

- `issue()` returns the authority revision from its actual committed issuance;
  bootstrap fsyncs original revision/lease/session/request before outer IPC reply.
- `finishUnusedIdentityDrain()` shares the actual authority transaction/lock
  with ENTER/drain: exact current drain ID/revision, all-family DRAIN_READY/zero
  unresolved, original nine-axis binding, RETIRED/null attempt/null terminal,
  immutable **exactly ISSUED→RETIRED** history. Missing/extra/used/source-rollback
  facts refuse unused cleanup; no attempt/receipt/ACK is synthesized.
- Complete trusted local callback counters must synchronously be zero under
  the fence. No IPC witness, network under lock, async function/promise/thenable
  or incomplete/nonzero counters. Late ENTER remains fenced.
- `ownedTerminal`, actual COMMIT/rollback/UNKNOWN/native-obligation checks and
  stop/listen/readiness/signals remain byte-identical. Expired/revoked holder
  cleanup creates no identity/grant. No source fence relaxed.
- Durable `identity_issue_started` marker fsynced **before** issue prevents
  internal COMMIT ACK/signing/original-save ambiguity from looking pre-issue.
  Only explicit false SESSION marker may skip identity cleanup. Old/missing
  originals retain custody for review, never SQL reconstruction or reissue.
- LOGOUT persisted before existing exact `AuthService.logout`; FINISHED needs
  actual same-session REVOKED readback. Lost ACK retries same session/intent,
  not a new login. Restart cannot recreate/store a one-view cookie.
- Full nonsecret bootstrap and standalone test are in `scripts/execution-v2/`;
  no private descriptor/trust/key/config dump. Startup refuses before listeners/
  issuance if image lacks the new method; never pair new bootstrap with old image.

### Exact byte pins / uncommitted delta

Base commit remains `f46439157fe25892fc4372dda532bd1f8bdc4773`.
**No new commit/push/image/migration/installation claimed.** Older staged reader
work preserved. No peer edits/merge.

| File | SHA256 |
| --- | --- |
| `apps/control-api/src/execution-v2/current-human-candidate.ts` | `a2bd8435ed79eba998ca436e312826c463a0b532bf6aaa4672f22f1473a9c8b0` |
| `scripts/execution-v2/research-reverse-bootstrap.cjs` | `cc6ae429c0283105818b1c8ab7133a5380fbe49f6834fe5910daa1eb9dd1c5f4` |
| `scripts/execution-v2/research-reverse-bootstrap.test.cjs` | `8d6ec9ee1bf86d4509bd7a48c98841c3ce283a698f293036c56d6ebf2664d7b1` |
| `apps/control-api/test/elp210-current-human-candidate.spec.ts` | `06f048f5597eda428a613bc88650066e468b6cb8fc05f14346abb45c24d5c1c5` |
| `apps/control-api/test/elp210-native-core-obligations.spec.ts` | `cf40012b45c51b06c38906be783d4214e41c502fc06a6d2fd82658bfba0008ea` |
| `apps/control-api/test/elp210-auth-logout.spec.ts` | `231ae3cc805301670a68af8e1093588f3642188bbf3d5ec2cfdf9e3e9aa576f8` |
| candidate SQL, unchanged | `826e4e083c8db536fc80a0f0ec272e3a71387a5e5d53a9cde48563f41fe32728` |

Exact six-file008 diff SHA256:
`e95acc5fc2ab0beb444d0c29c736ba65ff3a9dbc3ead388ca549dba150ff34a3`.
Reproduce from named checkout: concatenate `git diff HEAD --` candidate source,
candidate test, native-obligations test, auth-logout test in that order; then
`git diff --no-index -- /dev/null` bootstrap and then its test; SHA256 resulting
bytes. Reader/docs deltas excluded; file pins are portable byte authority.

**NOT_INSTALLED:** historical image
`sha256:16bf254b5e8b9fb7781cd9f08379706f5a9c06577e48f8b5d2603dacabfdc5e5`;
private installed bootstrap
`e997debdcbc0500dd91252f6ff5a79ad31f5571d3ddbd6caae077ec2fb298cea`.
[Historical installed image/config/schema/physical target](CORE_INSTALLED_EDGE_HANDOFF_2026-10-19.md)
is not008 installed acceptance. No new READY/callback/COMMIT observation.
**Edge must not issue genuine assertion on old bootstrap for008 acceptance.**
No secret/token/cookie in this return or Git; provider28445/six stable bindings
and stable/dev/main unchanged.

### Tests, prior failed hook and cleanup

- `node --check scripts/execution-v2/research-reverse-bootstrap.cjs`: PASS.
- `node scripts/execution-v2/research-reverse-bootstrap.test.cjs`: **28/28 PASS,
  0 fail/skip**,107.835433ms; actual command/save/ownedTerminal/IPC handler
  extracted into VM with injected fs/net/Auth/candidate. Lost issue reply,
  original revision/fsync, internal ambiguity, callback negatives, unused finish,
  finish/logout ACK loss, exact retry, source UNKNOWN and cookie loss covered.
  **MODEL/orchestration only**, not physical socket/PG/PM COMMIT/Core ACK.
  Log `008-bootstrap-focused.log` SHA256
  `b40889108d1f7379b28079fb407657fbca0cecbd0038b37bde3f4dd868228b41`.
- Focused real-PG first result: **311PASS/1FAIL,0skip**,7files,172.36s at
  16:23:12UTC. Candidate99, issuance26, logout9 (including actual physical
  COMMIT ACK-loss), transport17, explicit-resource88 and Blotter42 all PASS;
  native30PASS/1connection-timeout at final readback in an old UNKNOWN test.
  No008 new assertion failed. Retake **only native file:31/31PASS**,0skip,
  35.75s at16:26:50UTC, same code/timeouts/resources; the failed case505ms.
  Preserve the initial failure;31 overlaps30 prior successes, never343 unique
  tests or a single312/312 run. All requested008 cases have passing receipts.
  No source guard/timeout changed to obtain that retake.
- Two queued ordinary-cell dispatches were cancelled **before** cell startup
  (first corrects a filename, second avoids waiting for Claude's450-shot visual
  gate). Instead used one bounded **focused**, non-build cell: Node22
  `sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32`,
  PostgreSQL `sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6`,
  total2CPU/1.5GiB/300s, one test worker, internal-only network/no host ports,
  selected source/deps/contracts mounted read-only; no npm/network acquisition.
  Existing deps match lock:Vitest4.1.11,Vite8.2.2,PG8.23.0,jose5.10.0,TS5.9.3;
  package-lock SHA256 `81f9975ea19b321aea0e2e71ef6eead1b4ad19838434119e958ce59bafc76fa1`.
  This does **not** replace normal build/full-hook/scoped-restore acceptance.
  First loader startup refused EROFS before tests; switched only Vite's
  existing `--configLoader runner --no-cache`, preserving read-only source.
  No runtime DB write/credential/session or physical source proof.
- Actual sample during focused gate: Node355.5MiB/20.81%CPU and
  PG243.9MiB/21.32%CPU; sample, **not peak/load/coexistence measurement**.
  Owned cell `elp210-008-focus-20261019-1630-{node,pg,net}` removed; retake
  trap reports `OWNED_CELL_CLEANUP_PASS`, final independent container/network
  name filters empty. No persistent volume/general prune or peer cleanup.
  `scripts/execution-tracking-test.sh` and `git diff --check`: PASS.
- Focused typecheck: PASS, actual TypeScript5.9.3 program rooted at
  `src/execution-v2/current-human-candidate.ts`,657transitive/declaration files,
  compiler options parsed from the repo `tsconfig.build.json`, noEmit/no
  incremental output, hostNode20.20.2/1024MiB V8 ceiling. This checks the changed
  module/imports, **not all API consumers or the normal Node22 build**.
  An earlier whole-project noEmit attempt at that small heap exited134/OOM;
  preserve it, not a source/build PASS. No core file in checkout or `/var/crash`.
  No heap/contract/guard changed to force a green full-project result.
- Prior reader normal R3 exit1: contracts1147PASS; API8448PASS/1FAIL/3SKIP,
  426files:423PASS/1FAIL/2SKIP. Old scoped-resource test expected global exact
  mirror metadata. Test now walks both actual authorized pages and checks
  PARTIAL/no borrowed counts/aggregates, peer exclusion/cursor-limit refusal.
  Guards/SLO unchanged. Failed log `claude-reader-normal-hook-final.log`
  SHA256 `be696c9715d49bb52a745a98e903234f6a8e92d237c9c821659f21520ed8d463`.
  Focused repair is not full-hook PASS. Normal R3 required **at commit**, no
  bypass; no extra full suite solely to return SOURCE_ONLY for pin review.

Private logs under
`/home/bobby/.local/state/portal-execution-elp210/20261019/research-commission/`.
Fixture signatures TEST_ONLY; no actual Research session/identity/grant or source
operation. Model creates no service; PG lane closed after exact trap teardown.
No general prune or deletion of peer work. Rollback is reviewed forward source
repair/revert of own paths; installed custody/grants/audit/data remain unchanged.
Financial publication, approved budget/calibration, matched coexistence/P184G2
and Claude browser remain separate.10 NOT_MET;11 NOT_ENTRY_READY.

| Private verification file | SHA256 |
| --- | --- |
| `008-core-focused-bounded.log` — initial loader refusal/no tests | `4cd3596c35c364e2fe63196c1d74f297a1bbef5d6fb556b22ebc71d3aed4c61c` |
| `008-core-focused-bounded-v2.log` —311PASS/1connection-timeout | `c51277852c6e51626174416fea9317c449b173ab660f30035e950af78619aca5` |
| `008-native-focused-retake.log` —31PASS + actual cleanup | `b157465632b10f9cf49a12a8557ebc821f708e232a55aa2b55edd68ed197dd7b` |
| `008-focused-cell.sh` — exact private bounded runner | `fc5f379163ee6729dbcfce99557e3c126fb1e534485ab18aeba35af2f3e39785` |
| `008-candidate-typecheck.log` — focused657files PASS | `8a30f791df04c0e3b96d07cacf4e711bacf7f548ca9b7a41d37307cccdbccb50` |
| `008-control-api-typecheck.log` — whole-project1024MiB OOM | `9014d4a9cd8dbe40043aa6fbe0d86492f02a2a8bbacef21ed097e896da2964d7` |

### Late peer incident — runtime is NOT currently READY

Claude's peer `3b0c72c195d50bdd31ac7bfbf31cc27b791ac811` is clean; five new
FE/incident-only commits since3e831b25, no official request-file delta. Its
`7b5446ca` incident reports restarting preview control-api after public review
hit `CURRENT_HUMAN_CAPACITY_EXHAUSTED`. Read-only Core confirmation: actual
container exited1, started/finished2026-10-19T16:12:11Z, unchanged16bf image;
safe log ends `BOOTSTRAP_STARTUP_REFUSED_REVIEW_CUSTODY`. Host-mapped private
IPC path is a0600 socket/not symlink; expected state file absent. These facts
do **not** establish zero unresolved DB custody or permission to unlink/reset.
No Core restart, state deletion, cap increase or manual SQL was attempted.
First unmounted-path metadata check returned ENOENT; only the subsequent
container-mount-to-host mapping above is used for this custody observation.
The image remaining unchanged must not be mistaken for a healthy listener.
No assertion/finite window until the Core owner reviews actual custody,
socket ownership, retained capacity and coherent008 install/recovery; this is
Core's next runtime task, **not an input delegated to Edge**. Preview browser
acceptance is unavailable meanwhile. Preserve source-only008 for pin review
now; do not make it wait for009/financial gates. Provider28445 untouched here.

## 009 — source-ready composition; native READ/STREAM NOT_COMMISSIONED

Prepared for primary integration only; **not an Edge operational ACK, executable
manifest, policy approval, grant, session, installed change or runtime receipt**.
Owning request: `upgrade/execution_loop/evidence/ELP2-10/EDGE_TO_CORE_EPG10_08_REQUEST_2026-10-19.md`
§§3–5, SHA256 `da94a406d0c22c0c17ee4de5bcdc7ea95367e3a7dae7780007be0a6633ceab57`.
Core source baseline `f46439157fe25892fc4372dda532bd1f8bdc4773` plus preserved
primary WIP. The six source-byte pins below were rechecked locally; no change
from the private `core-read-stream-readiness.md` cut at15:20:43UTC.

Primary-reported SSH source delta16:08–16:09UTC (not independently probed here):
Edge HEAD `6adc398b573e297b731863e5ed93f0f7f59ab2fd`; operator WIP SHA256
`58b6f79743f6e50f95ba905b38949dd55e337dd349267ce530fe151d29b52018`, tests WIP
`e15000e4aeb27998bef412e50f35b35cdea4b35884f08fa7021b5e8aaeb2ac5b` are not
published/accepted operator pins. PM HEAD `adbf25ca4a55c764d9812c8df84eeedaf44a66ad`
contains the ambiguous Paper-config fix after `e7f32b0`; HEAD metadata does not
replace selected-runtime pins or prove identity COMMIT/Core ACK, still unobserved.

### Reuse, not a second authority/application

`nativeCoreRuntimeReference` → `prepareNativeCoreRuntime` → `composeNativeCore`
→ `nativeCoreManagerReadConsumer` uses the existing Core pool, physical-target
check, one current-human mutation/drain coordinator and SAME-source retained
recovery registry. Existing `AppModule`/application-owner seams own startup and
shutdown; unresolved custody prevents dropping the pool. Installed historical
reverse bootstrap is identity-only: this source map does not mount native reads.

All paths below are relative to `apps/control-api/src/execution-v2/`:

| Source | Exact SHA256 |
| --- | --- |
| `native-core-runtime.ts` | `4243bbaf8a1c4f2a3b65dbdaeec7008ee4a2fe663e18313ef0d795b53b5b0761` |
| `native-core-composition.ts` | `d6d21d9b0aadb0c53511a4d1f050a5368aaeb98a22d343eaf28c556a2f0c170e` |
| `core-owner-commissioning.ts` | `b532e8bf74a8d3ffb447c9cf9edfbb75fdeb5737e82ee8017c78ad80aa90ca33` |
| `native-manager-consumer.ts` | `66f5caf7e52f0ab8cba1a17794a30036bfcbd3e0931b1c7504f3a886cbbcaac2` |
| `native-business-read-codec.ts` | `9d346ef6f7d7f8361e71171efa9b0cd7d7fe0ddde89d369b1cd2181be2bbec56` |
| `current-human-snapshot.ts` | `5238093f65a164d50d21bca2ee2759c19fa7a8e0d5658a24beffa6813d1cf51d` |

### READ and STREAM are independent

Finite `serve` and `serveProfileSnapshot` require current READ admission and
source-held delivery proof. A READ baseline token is not STREAM permission.
`serveProfileStream` → `authorizeManagerNativeStream` →
`evaluateManagerDomainStream` selects current READ **and** `stream.subscribe`
from one current snapshot; the replay hub and candidate retain frame/custody
checks. Positive SSE requires compatible real ingestion and a new committed
source observation, not merely an idle socket or successful TLS/health check.

`privateOwnerCommissioning` / `installReviewedManagerDomainPolicy` is existing
fresh-policy-only intake: root-owned0600 artifact, independent raw hash, exact
physical target/owner/principal/workspace, reviewed domain/field seals and
revisions. Nonempty/conflicting policy is not overwritten. Its return remains
`DOMAIN_READ_ONLY`, `stream_commissioned:false`, `command_commissioned:false`;
storing a STREAM intent does not attest an effective subscription.

### Exact missing inputs — owner and done-when

| Owner | Required input / verifiable done-when |
| --- | --- |
| Core008 + Edge operator | Deliver installed cleanup repair separately; Edge publishes its qualified operator and acknowledges exact installed Core/config/helper pins, genuine recovery28446 readiness and a finite window. Source-only008 does not permit issuance on the old bootstrap. File/TLS receipt is not operational ACK. |
| Core + PM/Edge identity | Exact Research issuer `portal-control-api.native-manager-read`, subject `usr_5a38d5dfb08b44748f5776fbe04a1434`, workspace `ws_06G19F61YB8CFR7TEWMS7HQ660`: genuine same-attempt physical COMMIT plus actual Core terminal ACK yields TS identity/mapping revision; then exact window/session cleanup. No username inference or stable-subject/grant copy. |
| Native source owner | Accept exact native28445 client/issuer/key/workload without restarting/rekeying28445 or changing its six stable bindings. Return genuine catalogue/profile/field-policy seals; native permission receipt/revision/digests, owner-mapping/semantic revisions, source fingerprint and bounded validity. Identity mapping alone supplies none of that permission. |
| Core policy owner | Independently approved/pinned `portal.private-owner-manager-commissioning.v1` artifact for the exact app principal/workspace/environment/domain with explicit READ/STREAM intent and reviewed field seals; existing installer returns actual ACK or typed conflict. No manual SQL or fixture grant. |
| Core integration | Only after concrete accepted inputs, bind existing `portal.native-core-runtime.v1` through `CONTROL_API_NATIVE_CORE_CONFIG_FILE` + `_SHA256`; coherent approved pool/limits/window, selected source, owner intake and original recovery selections share the same composition. No placeholder manifest or invented production budgets. |
| Source ingestion + Core | Genuine finite response, READ baseline, independent STREAM and a new-source frame; revoke/no-late-byte, wrong-workspace/cache/cursor, restart/shutdown and SAME-obligation recovery receipts. Empty/denied/unavailable and source-update versus Portal-observation semantics stay distinct. |

Current disposition: composition seams **SOURCE_CONFIRMED**; native manifest,
reviewed app policy, source native acceptance, installed binding and connected
READ/STREAM qualification **NOT_DELIVERED/NOT_PROVEN by this return**. Existing
trust expiry2026-10-20T08:00:59Z must be rechecked in the actual approved window;
expiry is not custody release. Financial publications, calibration/budget and
coexistence/G2 retain their own owners and acceptance;009 does not certify them.

Claude delta checked read-only at `3e831b252c49aa99f9760162db5734f3d5e35475`:
`18867cac` adds FE-066…072 and S3-U1…U4 in `UXM-07/backend-requests.md` and sync§6.
These remain a separate intake (FE records OPEN/not-yet-sent); no new public FE
field is delivered by009. Consumer/browser acceptance stays separate. No tests,
build, SSH, runtime/DB/credential action or resource installation ran for this
draft; primary owns canonical integration. ELP2-10 remains NOT_MET,11 not opened;
no command/Live, dev/main, push, signed-release or frontend-design authorization.

## Subsequent owner assignment —2026-10-20: R3 → install008 → real009

Bobby explicitly approves finishing the normal R3, installing008 coherently on
Research and returning actual source/image/bootstrap/config/schema/READY pins
plus existing native009 composition. This supersedes the earlier installation
pending-approval note, not the actual SOURCE_ONLY evidence above. Source at
entry remains f46439157fe25892fc4372dda532bd1f8bdc4773 plus owned uncommitted
reader/008 changes. Actual normal R3, install and connected gates are PENDING.

Scope: preserve concurrent WIP, stable/dev/main and provider28445/six stable
bindings; no command/Live, push, release or new phase. Review stopped preview
custody and capacity before any narrow recovery. Preserve all original UNKNOWN,
source-terminal, exact-session and one-view fences.008 installation is delivered
independently;009 may reuse sequential existing lifecycle after actual identity
COMMIT/Core ACK, exact finish/shutdown and zero reverse custody, rather than
creating a second simultaneous app/coordinator. Missing source authority is not
manufactured by local config. Three reused read-only agents assist peer source,
custody review and composition; primary owns integration/resources/runtime.

Actual follow-through: [normal R3/7818d563, installed008 READY, new image/config/
schema/backup pins and HK-delivered manifest; real009 remaining owner inputs](CORE_008_INSTALLED_READY_009_RETURN_2026-10-19.md).
This newer receipt supersedes the installation-PENDING line above.009 remains
NOT_COMPOSED, not a fictional READ/STREAM qualification.

