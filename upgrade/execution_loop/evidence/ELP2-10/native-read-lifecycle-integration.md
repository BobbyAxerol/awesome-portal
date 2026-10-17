# ELP2-10 NC-03 — genuine finite native lifecycle

Status at entry: APPLIED_UNCOMMITTED / NOT_RUN / NOT_MOUNTED. This is the same
approved native current-human commissioning requirement, not a new phase or
new runtime authority. Final producer SHA/test results will be recorded only
after their actual terminal controller. ELP2-11 is not entry-ready.

## Scope, authority and preservation

Main owns integration on `/home/bobby/portal-research`,
`docs/research-loop-plan`. NC-02 normal hook actually finished21:44:15UTC,
landed `43e877fd5801cf710df164184ef1c342bb52bcc8`; main checkout/index were
clean at terminal. Main revalidated this SHA/clean state with its preparation
lease held21:47UTC; no peer source/index was overwritten. During NC-02's hook only private
proposed files outside the repository were changed. Preserve peer Unified notes.

## Previous NC-02 actual terminal, not new NC-03 coverage

Controller `native-lifecycle-primitives-land-211636` exited0/PASS21:44:15UTC:
67contract files/791tests, API build,379API files/6192tests PASS with2existing
skipped files/3existing skipped tests. API duration1258.03s. Scoped PostgreSQL
restore and all four scoped-access row digests PASS; source/index freeze and
eight protected runtime tuples unchanged; owned Node/PG/network absent and
its own lease released. Later unrelated PM lease belongs to its owner.
Log SHA256 `5defcb842382bb33726c9ca7e7326a155338edb7e5b28dd612fb23fefe42fdab`;
terminal controller JSON
`9670e3ce1be70d8ac13718693da9c6c54e34a17e51487713a1c86a53d151e8ae`.
Landed diff15files +2686/−12:7implementation +914/−12,3tests +1387/−0,
5docs +385/−0 (includes14preserved peer Unified lines, not primary authorship).
This supersedes only pending NC-02 landing; it is not installed source authority.

Post-terminal shared host snapshot: root155GiB free/24%, RAM10399MiB available;
Docker328images88.82GB,59containers,97volumes32.52GB,build-cache195.8GB.
Not a measured peak or an instruction to prune shared resources. No runner
process found by `ps -eo pid,comm`; matching systemd unit query returned0units,
not a claim about every possible runner namespace. C4-GOV-CAPACITY-01 remains.

## Scope boundaries and installation

Approved boundary: bounded isolated Core correctness; no preview/stable/dev/
probe runtime mounts, operational schema/grants/users, source credentials,
upstream command, frontend, push, dev/main, signing a release or deployment.
Reuse existing `elp210_candidate.native_read_obligations`, authority lock,
unified pending/recovery accounting, selected-source wrapper and finite egress.
Do not create a second ledger, dispatcher, timer or unqualified field policy.

Candidate SQL is a **fresh disposable installer**, not a forward migration of
any previously installed schema. A dependency-closed operational installation,
writer integration and preservation gate remains separate mandatory work.

Resource ceiling: one existing reviewed controller, one global resource lease,
root-namespace guard, disposable internal-network PG 1 GiB + Node 3 GiB, total
4 CPU / 4 GiB / 8 GiB transient. No host ports, image pull, frontend rebuild,
source server build or operational SQL. Exact owned resources must be gone,
four existing access-row digests and eight protected runtime tuples preserved.
Correctness resource measurements are not approved production budgets.

## Requirement / implementation / affected proof

| Existing finding | Accepted implementation | Done-when / gate |
| --- | --- | --- |
| NC03-P1 | Native global pending is `NOT source_reconciled`, including local terminal. Positive authentic same-key cancel/resolve ACK must be durably committed before releasing custody. | Actual PG + TLS/HTTP terminal, lost source/local ACK, repeated recovery and mutation coordinator preserve one receipt and pending until the matching ACK. |
| NC03-P2 | Use captured real selected-source methods and private WeakMap authenticated observations; bind action, exact Base, source identity, response digest and original correlation. | Shapes/clones/Proxy/incorrect lifecycle cannot create an actual source grant or settlement; unchanged component receipts reused only at exact source hashes. |
| NC03-P3 | Exact UTC-microsecond original Base, minimal integer JWT second covering it, bounded independently by current authority, original admission TTL and installation. Shorter actual source expiry only shortens send eligibility. Recheck after actual asynchronous signing. | Real synthetic-PM TLS verifier enforces its cached actual parser predicate for BOTH ISSUE and ENTER; fractional/offset Base, shorter lease, cap equality and post-sign drain negatives. |
| NC03-P4 | Reserve actual response/copied body before physical SENDING COMMIT/pool release. Only same owner's real egress observation or already durable immutable receipt can produce a terminal. | Actual response/socket finish or abort, lost COMMIT ACK, cold SENDING stays UNKNOWN, owning pre-SENDING abort remains atomic and no second HTTP send occurs. |

Cold lost ENTER with no owning HTTP observation is deliberately **UNKNOWN**.
A DB no-future-send fence and authenticated source status are not an HTTP abort
witness. That obligation remains pending; no TTL, restart or expired actor can
invent FINAL_HTTP_ABORT_CONFIRMED. This honest conservative liveness debt stays
open until the selected real source supports and qualifies a legitimate
reconciliation route. Do not relabel this branch fully recovered or released.

Source-only disposition for the SAME cached PM v1 bundle is recorded in
`nc03-lifecycle-review-2/cold-enter-reconciliation.md` (111 lines; SHA256
`20e1d42422c3d9c302deb042c286e9740faf6d0627a0c95887ba07f3ac40afea`).
Primary read it in full. Existing status is non-terminal; cancel-unentered
rejects ENTERED/UNKNOWN even after expiry; resolve requires an authentic final
HTTP terminal; re-enter accepts ISSUED only. Existing mocked/test terminals
do not supply the missing producer proof. Keep this subfinding under existing
05-001/07-001/NC03-P4, not a duplicate queue or new claimed implementation.
A distinct jointly frozen producer-recognized pre-send cancellation transition
is the minimum proposed automatic recovery extension, not an accepted wire.

No protected response is sent until physical SENDING COMMIT acknowledgement
and pool release. Every signer, selected-source TLS call and socket operation
stays outside Core row locks. A failed call preserves its original error and
same recovery key; immutable terminal readback can retry settlement, not READ.

## Source reviews and pins

Primary read the full peer candidate/SQL/spec and both independent reviews.
Original finite2 source is historical, not accepted wholesale. Only reviewed
semantics are integrated into the existing candidate. Private proposed inputs:

- Candidate TS `d2c255cbe0f3a030f4eac9a526976539caec06004c343939afc49112fca27298`.
- Candidate SQL `31fd42d7637210742ab414b9f7496286a93dc86eeff9fa5229e20884040e01a3`.
- Selected-source accessor proposal `cea9c64fd7059c39f1182d9e06466ad0a8d8a13bb0dd85a4e8fabc24a03494c8`.
- Egress unchanged `16e282b5e5d2b79ea3bbba8ad8ca0538dc361324dedd6fe53f19aae29021dad5`.
- Current snapshot `cece7955df57ced17dd60407b4a8718d361e48418e873fcb71ad7ec75cd73feb`;
  current domain policy `ac072eafe31e4da83e51f7a7cc6900653b7bffc58ca999bf82982a65b329534e`.

Independent source review retake `nc03-lifecycle-review-2/source-review.md`,
206 lines, SHA256
`3ecc1642b33e70aa9a7abb2e964eae24af16b1b07e04f819646339c4bd76e7d2`:
ACCEPT_SOURCE_ONLY_WITH_TESTS_PENDING. It accepted removal of bodyless abort,
atomic genuine owning pre-SENDING abort and existing immutable receipt reuse;
actual affected proof is still required. Historical CHANGES_REQUIRED retained.

Independent producer/clock intake `nc03-selected-lifecycle-intake.md` §6,
SHA256 `77ca8b3daedba53ac458f6b1071f7fbf93e38b1134991ce85e0ad66938f7944e`:
ACCEPT_SOURCE_ONLY_WITH_TESTS_PENDING. Original P3 floor/shorter-lease finding
is resolved in corrected source, not in the old peer test receipt.

These are private source reviews, **not Claude acknowledgements** or runtime
qualification. Current cached PM parser bytes
`1e8e5074989202e1792a3b8cc51ff649d8e78fccf1dc9f078e39b4b2019c2528`
require `now < original deadline <= human JWT exp`; no new HK deployment or
fresh source acceptance is inferred from reading that cache.

Primary read the full fresh bounded read-only intake
`nc03-source-repin.md`, SHA256
`7901e4b5901078ce569b7615359ef59aac4486def8841dc395d3d86ee5d4900b`:
one successful HK SSH pass21:46:32–33UTC, PM
`92a6a26331b91174be93d39293405e8dc500a85b`, branch
`feat/portfolio-account-v1_1-parallel`. Provider/verifier/fence/held-bridge
bytes match the exact cached bundle; provider is no longer a dirty path.
Execution-history/readiness owner WIP is preserved. Current read handoff
`19bd909b6f9db25b43f431085d97a9abad9ce352cffca8b439f184ebea044a81`
still says `NONE_FAIL_CLOSED`; dirty readiness
`f4456151c911856cb4b930b44afb07d2fa8e5a05ce3a0ee71be37a40841f9046`
says `DRAFT_NOT_APPROVED_FOR_EXECUTION` and `TEST_ONLY` signers. Genuine
trust/provider/grant installation remains NOT_VERIFIED, not absent code.
The safe output filter omitted false/null leaves; no fresh literal-false
config assertion or operational deployment is inferred. Finite v1 tests do
not qualify the distinct existing v2 scoped-notice protocol.

Primary also read that bundle's complete
`services/portal_execution_owner/identity/human.py`, SHA256
`9c1f2929e09d65fac5fd65ade31c8fe1b6e874aa6190a2351255213570bb0932`.
Its trust policy allows at most60s signed lifetime; the TEST_ONLY verifier now
checks `iat <= nbf < exp <= iat + 60` as well as the exact Base/JWT deadline.
The independently bounded original admitted TTL prevents covering-second
rounding from extending authority. A real installation still needs its exact
accepted trust-policy maximum, not this fixture's default treated as approval.

## Tests and receipt plan

NOT_RUN at entry. One affected actual disposable-PG/TLS/finite-HTTP suite plus
existing custody/current-human/installation/writer/recovery regressions;
normal hook once for the coherent source/docs batch, no bypass. New tests use
canonical `./harness`, no separate minimal schema/harness. Internal test URL
must match `control-api-test-postgres-<pid>/portal_control_test` before any DB
client/migration. No opt-in flag silently excludes them from the normal hook.

Synthetic PM verifies real signatures over actual loopback TLS1.3/mTLS; it is
not the actual PM provider or an installation of economic/app authority. Lost
COMMIT ACK injection follows actual PG COMMIT and is not a network failover.
Do not combine this suite with overlapping prior tests as extra coverage.

New canonical test proposal (30 expanded cases; not yet observed):
`elp210-native-http-selected.spec.ts`, SHA256
`0df361cf341b3dd14ae947c5febe0bf311e847489ea1a6607a789ae6350868a5`.
Applied source matched all four proposed hashes at21:47UTC, entry HEAD
`43e877fd5801cf710df164184ef1c342bb52bcc8`, clean prior checkout/index.
Focus controller `native-lifecycle-integration-focus-214550`, source wrapper
`27d23dbf9ad656413dda1b5b32b9060933d78245a58baef7d515727879e51a45`,
uses reviewed template `d23e8c1c00687f6f055f9c9f51e9bcabd1515a87469ec41b4226ca12d139556b`.
Tests remain NOT_RUN until its actual terminal, no planned receipt counted.

Retain failed attempts, exact test/source/controller/log hashes, restoration,
cleanup and capacity snapshots. Parent controller's terminal status is required;
passing test text without teardown/runtime preservation is not a gate PASS.

## Contract, Claude, next work and rollback

Private candidate interfaces/SQL only; no public route/OpenAPI/generated type,
browser design or existing six-operation consumer semantics change. Claude
UXM is NOT_STARTED_BY_OWNER_DIRECTION / AWAITING_CONSUMER_REVIEW. Recurring
Claude intake follows campaign §7.3; new review/request goes into its owning
phase record with disposition/owner/test/dependency/done-when, never a second
queue or invented acknowledgement.

Next backend within ELP2-10: affected lifecycle gate and coherent landing;
then dependency-closed real trust/provider/current authority-writer installation
and connected proof. Separately required numeric budget/calibration approval,
source-connected coexistence/applicable original P184 G2 and assigned consumer/
browser acceptance remain open. Local synthetic-source PASS cannot close them.

Rollback keeps the candidate unmounted; dispose only the controller's exact
named resources. Preserve operational data, owner anchors, grants, immutable
obligations/receipts, peer source work and all failed/accepted evidence.

<a id="focused-terminal-20261017-215417"></a>
## Actual focused terminal — 2026-10-17T21:54:17Z

`native-lifecycle-integration-focus-214550` actually exited0/PASS at
21:54:17.317784UTC. API build and **7files/241tests PASS,0FAIL/0SKIP**;
Vitest duration82.46s. Counts30new native HTTP +38current-human +28native
custody +68installation +43selected-source +30lifecycle +4workspace =241.
These overlapping regressions are not added to NC-02's prior full-suite count.

The30new cases used actual disposable PG/loopback TLS1.3/mTLS/finite HTTP.
They prove same-family custody, exact Base/JWT ceilings, physical COMMIT then
injected lost application ACK, actual owning socket close/completion,
immutable receipt, authentic synthetic-source settlement and coordinator
revoke ordering. Cold ENTER without a real HTTP witness deliberately stays
UNKNOWN/pending. Synthetic PM is not genuine PM provider qualification and
an application ACK injection is not a real network/cluster failover.

Scoped PostgreSQL restore and four access-row digests PASS. Source/index
remained frozen, HEAD remained43e877fd, eight protected runtime tuples were
unchanged, and owned Node/PG/internal network are absent. Controller released
only its own resource lease; any subsequent foreign lease remains untouched.
Post-terminal read-only host snapshot: root155GiB free/24%, RAM10290MiB
available, not a measured peak/production capacity. Existing named shared-cache
follow-up C4-GOV-CAPACITY-01 remains; no broad cleanup or runtime change.

- Log SHA256 `2303fabfb1011a6678f87e8d68f63dde7b53e70ccad63f1dd9635f364dd982fd`.
- Terminal controller JSON SHA256
  `db83e593d3efb84ae1846d5562ec4c610e52384427a84239a74cb49d19f0bf5d`.
- Controller/template and four tested source hashes are the exact pins above;
  canonical source is unchanged after this result. Only receipt/index Markdown
  is appended after the completed frozen gate; it does not need a second focus.

Current delivery: **FOCUSED_CORRECTNESS_PASS / NORMAL_HOOK_PENDING /
UNCOMMITTED / NOT_MOUNTED**. One coherent normal-hook landing remains next.
Actual dependency-closed provider/trust/writer installation, cold producer
reconciliation extension, approved budgets/calibration, coexistence/P184G2 and
assigned consumer/browser remain open. No new Claude type/field/assignment or
acknowledgement; ELP2-11 remains NOT_ENTRY_READY.

<a id="normal-hook-terminal-20261017-222420"></a>
## Actual normal-hook landing — 2026-10-17T22:24:20Z

Landed `0ccdc5edfbbf6d4e911baa375cd25cf3d4e0e6c1`, parent43e877fd.
Controller `native-lifecycle-integration-land-215549` terminated0/PASS at
22:24:20.093345UTC: **67contract files/791tests PASS**, API build PASS,
**380API files/6222tests PASS**,2existing skipped files/3existing skipped tests;
API duration1300.71s. Normal repository hook, scoped PostgreSQL restore and
four scoped-access row digests PASS. Source/index frozen; eight protected
runtime tuples unchanged; owned Node/PG/network absent and own lease removed.
Do not add the overlapping focused241tests as new full-suite coverage.

- Log SHA256 `721624bdc2f8caac7c78fc39ba41ff4c0d45f76ff6e92ef6b8cf1f84b9bdb8fe`.
- Terminal controller JSON SHA256
  `781032556752da4538073731d9538329d7d7e90463b38bc31a0c6db04172b8c7`.
- Commit10files +1688/−62:3implementation +707/−62,1test +653/−0,
  6docs +328/−0; no frontend or unrelated contributor paths.

This supersedes pending local landing only. Candidate remains unmounted;
actual provider/trust/writer installation, cold no-HTTP reconciliation,
budget/calibration/coexistence/P184G2 and assigned consumer/browser are still
OPEN. No push, dev/main, release/deploy or Claude acknowledgement follows.
