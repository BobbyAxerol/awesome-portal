# Core → Edge EPG10-08 owner return — Research only

**Latest actual12:34UTC return:** Core implementation`f46439157fe2` passed the
normal hook and is installed on Research, exact forward134/custody verified,
reverse READY. Nine-file PM inputs and actual manifest were transferred and
verified on HK. [Installed return, exact hashes, owner next actions and remaining
phases](CORE_INSTALLED_EDGE_HANDOFF_2026-10-19.md) supersedes the older pending
installation statements below, preserving their failed/historical evidence.
Edge owner ACK/physical COMMIT/Core ACK/READ/STREAM remain NOT_RUN.

## 1. Authority, publication and exact status

**Latest cut11:17:31UTC:** affected5-file gate **200/200PASS**, including native
HTTP33, build and scoped restore; log SHA256
`b23379961e0b6ce056c51fd3e54015de72075c5d0444b8a3df6bdf19c1fd177f`.
Eight protected runtimes unchanged, test resources0. The old PM measurement
reservation is owner-settled and absent. Fresh ordinary-hook landing, image,
forward134/schema and reverse installation remain pending at this cut. The
earlier17:58 checkpoint below is preserved history, not the current blocker.
Do not execute historical custom source-intake runner: it pins obsolete helper
bytes and requires40s versus genuine Core30s JWT. Use the adopted official
helper and JIT unchanged raw request only after owner ACK of the actual bundle.

2026-10-19, Asia/Saigon. This is the continuation of Bobby's approved Research
Paper READ/STREAM commissioning, not a new campaign, command activation,
frontend change, dev/main promotion, signed release or stable deployment.

Core repo `BobbyAxerol/awesome-portal`, checkout `/home/bobby/portal-research`,
branch `docs/research-loop-plan`, source baseline
`678cf7313a1767197ad57a59b22b3b173efde537`. The commit containing this file is
the recovery repair's landing locator; resolve it from Git, not from the older
baseline or running image. Source is not pushed. Owned code changes are only
`current-human-candidate.ts` and its two regression-test files; remaining paths are
tracking and the non-executable source companion patch. Peer FE/B1 WIP is untouched.

| Component | Status at this return cut | Evidence / missing condition |
| --- | --- | --- |
| Core recovery repair | SOURCE_QUALIFIED | Actual167/167 affected tests below; normal-hook landing separately recorded, not borrowed from678cf731 |
| Companion source repair | SOURCE_QUALIFIED, TEST_ONLY | Actual8 affected +18 reused PG15 cases; explicit Core model, not connected qualification |
| Research deployed Core | INSTALLED, older image | `sha256:d13cef069471be8b34c7d6f0cda4b6df55e892812c7ea8bf0f17846256e76e6d`; not this source repair |
| Research schema134 / registered custody schema | BLOCKED, not installed at cut | Actual127 migrations ending133; `elp210_candidate` absent; Core owns exact forward install and backup |
| New Research mTLS/signers | GENERATED, NOT_INSTALLED | Fresh independent private PKI refs below; public fingerprints are not proof of a listener |
| HK original producer28445 | INSTALLED, commissioning-only | Frozen PM source/image; not genuine Research mapping/READ/STREAM authority |
| HK receipt schema + identity role | INSTALLED | `elp210_human_candidate`, `ts_portal_research_identity` dormant/NOLOGIN/cap1; do not reinstall |
| Genuine Research identity COMMIT + Core ACK | BLOCKED / NOT_RUN | Core release/reverse listener + Edge-reviewed helper/window must be joined |
| Research READ/STREAM | BLOCKED / NOT_RUN | Mapping plus independent source READ and app READ/STREAM acceptance; connected gates still required |

No item is CONNECTED_ACCEPTED at this cut. Actual subsequent installation
evidence must name its image/config/schema and terminal receipt; this table is
not permission to label a prepared descriptor installed. Core's private live
owner-input index is the coordination entry below, not a business authority.

**Current checkpoint17:58 Asia/Saigon:** ordinary093342 failed one concurrent
capacity-test assertion (contracts1141PASS; API8307PASS/1FAIL/3skip), so its
downstream build correctly refused. The strict test correction is reviewed,
not yet run. A separate PM job104819's unsettled SGP measurement reservation
currently prevents Core test admission; Core does not remove foreign locks.
[Exact blocker/owner/next action and preserved evidence](research-temporary-session-recovery-2026-10-19.md#external-measurement-window-checkpoint--2026-10-19).
No new build/install/session/window and no connected ACK are claimed. The
Core waiter releases heavy-work lock while waiting for that owner's cleanup.

## 2. Source/runtime pins and protected targets

Latest read-only HK Edge source:
`6adc398b573e297b731863e5ed93f0f7f59ab2fd`, branch
`feat/execution-edge-upgrade-v1_2`, worktree
`/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2`.
Read current entrypoints under `upgrade/integration/execution-native-read-v1/`:
`README.md`, `current-core-reconciliation/README.md`,
`research-identity-intake/README.md` and `qualification.json`; Original08 newest
journal at Unified23096–23166. These are current owner publication, not a
request to reapply historical e19/5291 patches. Owner has now adopted the
recovery helper, SHA256
`5f1a0f293311f752d934de72666f8b2e9d671c899eec115d08d7ccd30265dec2`;
its AST matches the tested78b711 companion below. Do not apply that older patch
over the adopted owner helper. Tracked source is clean; three unrelated untracked
paths remain untouched. Owner89PASS remains isolated, not connected acceptance.

PM current branch `feat/portfolio-account-v1_1-parallel`, observed HEAD
`b203b77aac2826113c54c25224bdad1107fff3af`; selected15 runtime files remain
byte-identical to frozen `f5ee331fc2b8334cb203ea406df7ed6f466920b7`.
Provider release `pm-f5ee331fc2b8-9e7d34554000`, image
`sha256:28ea39588edd1b4fee1715d1e9ca6bd289effac82a573a920b217a8c350226b3`.
Concurrent PM WIP/dataset18 is not adopted or counted as installed.

Research consumer `research-portal.primusspark.com`; actual Core DB
`portal_control`, physical system **7688673963308855330**, DB/session role
`portal`. Protected existing Bobby
`usr_5a38d5dfb08b44748f5776fbe04a1434`, workspace
`ws_06G19F61YB8CFR7TEWMS7HQ660`. Actual read08:27:57UTC confirmed
`AUTH_MODE=dev`, `PORTAL_ENV=local`, public auto-login **claude-preview**.
No Bobby public auto-login, account reset or generation bump.

TS source DB `live_data_executor`, physical system **7674585245102796834**,
owner `bobby`. Preserve all three original native roles and caps2/2/1. Existing
source lookup found **NO_ACTIVE_EXACT_MAPPING** for this Research issuer/subject;
it does not authorize overwriting an inactive mapping. Stable subjects,
workspaces, sessions, grants and databases are not substitutes.

## 3. Core composition, config and migration references

Core owns reviewed image/config, one SAME Core pool/coordinator for auth,
access, reverse custody and native current-human; Execution storage remains a
separate explicit pool. Canonical entrypoints:
`apps/control-api/src/execution-v2/native-core-runtime.ts`,
`native-core-composition.ts`, `current-human-schema.ts`,
`current-human-candidate.ts`, `current-human-transport.ts`,
`current-human-recovery-client.ts` and `current-human-mutations.ts`.

Exact forward migration:
`apps/control-api/migrations/1723680000134_execution-access-policy-v2.sql`,
SHA256 `279a15abf0bf03058e9c06dbf2d4d01516cb4d7f4eb233eab260e5ec8437862c`.
Registered custody SQL SHA256
`826e4e083c8db536fc80a0f0ec272e3a71387a5e5d53a9cde48563f41fe32728`.
Core uses the official exact-name/count1 forward runner and registered schema
installer, not unbounded application migration CLI, manual ledger writes,
DOWN, seed or source-schema preparation. Backup/existing owner/access digests
and source/config/image pins are required before install. Retire only the old
Research Core writer before installing mandatory guards; do not leave a live
uncoordinated writer under them.

Private owner-input **index, no credentials in Git**:
`/home/bobby/secure/portal-research-c7-20261019/owner-input/README.md`.
Private operators/evidence base:
`/home/bobby/.local/state/portal-execution-elp210/20261019/research-commission/`.
Versioned reverse/bootstrap/schema/native descriptors and session IPC references
are indexed there **when actually prepared**; an absent entry stays NOT_PREPARED.
No native acceptance/version/config digest is invented before the mapping exists.

## 4. Exact wire and trust handoff

| Seam | Wire / acceptance | Owner |
| --- | --- | --- |
| Identity operation coordinate | POST `/internal/elp210/current-human/identity`; exact raw JSON `pma.current-human-identity-request.v1` + UUID4 `request_id`, max4096bytes; operation-bound SHA256 of actual method/path/raw bytes | Edge official SDK; coordinate only, **not a mounted public identity listener** |
| Reverse ENTER | POST `/internal/elp210/current-human/enter`; `pma.current-human-enter.v1` with `human_token`/`source_assertion`; ACK `pma.current-human-enter-ack.v1`, exact lease/attempt | Core listener, PM verifies real ACK |
| Physical terminal ACK | POST `/internal/elp210/current-human/resolve`; `pma.current-human-resolve.v1` + signed source assertion; ACK exactly `{replayed:boolean,phase}` | Core checks exact lease/attempt/workspace/Paper/workload/request/physical receipt |
| Same-attempt recovery | POST `/internal/elp210/current-human/recover`; `pma.current-human-recover.v1`; ACK `pma.current-human-recover-ack.v1` including phase and `portal_acknowledged` | PM recovery server/source physical readback; Core selected client |

Human assertion schema `pma.identity.v1`, genuine issuer
**portal-control-api.native-manager-read**, audience equals selected PM issuer.
Source assertion `pma.current-human-lease.v1`, source audience equals that
genuine human issuer. Research candidate ID
`elp210-e2aad424-fcd4-48c0-b8b0-63e54b98e2e9`; PM issuer
`urn:elp210-e2aad424-fcd4-48c0-b8b0-63e54b98e2e9:pm`, PM workload/key-id
`elp210-e2aad424-fcd4-48c0-b8b0-63e54b98e2e9:pm`; Core key-id same prefix`:core`.
Private trust manifest raw SHA256
`0ec109fcd43d963d3a8095a8403347cb52054266720e55f307232bab6cbf6ac3`.

Public SHA256 fingerprints, DER certificate / signer SPKI respectively:

| Role | TLS certificate | Signer SPKI |
| --- | --- | --- |
| Core | `a7fe6cb9069e85cb77ba0de475b016e025098f66e2b033f77c7f7961dff66c6d` | `50ffbdd43bd81ece58f9f9f7f6749aa72ed03c2725046ba97d02f14fa660fabc` |
| PM | `1ad74ad741cd4c5bf2882777891e929209c28d93ae804329d354d3a7c8123a3e` | `bb9a835642d78c8bedce071a41298348add7c68cba47ab149e5a071a5801b55f` |

CA DER fingerprint
`29423bef5009f16694635a75d58ef964877b4b6011e6eb84bd6774aedce29859`.
TLS1.3/mTLS; separate TLS/signing keys. SAN names
`core.elp210.candidate.invalid` / `pm.elp210.candidate.invalid` need explicit
WireGuard name resolution, never TLS hostname verification disabled.
Proposed Core `10.70.0.1:28444` / recovery `10.70.0.2:28446` are
**NOT_RESERVED/NOT_LISTENING** at cut; do not confuse with existing producer28445.
Exact bound origins, deadlines and payload limits must be pinned by actual
installed descriptors. New PKI expiry remains finite; no access renewal inferred.

Private trust root:
`/home/bobby/secure/portal-research-c7-20261019/elp210-trust-nNGqjQ/`.
Mount only Core-owned `core/` into Core; PM-owned `pm/` transfer/mount belongs
to Edge owner after secure receipt. No whole-parent mount, private key, DSN,
password, cookie or token in Git/chat/log. PREVIEW session is issued JIT via
real AuthService/private IPC, never reconstructed after a lost one-view cookie.
No session issued at cut; exact issue/revoke metadata will be private, with no
credential bytes. PREVIEW proves app session only, not password/CF/human presence.

## 5. Repair, actual tests and Edge adoption

Core repair source SHA256
`74aa99af7e02056dd5552185069b4ed5195a3f2f40ea8398d709f8d8102bedd3`.
Only authenticated exactly bound source ROLLED_BACK can settle ISSUED/RETIRED
before ENTER. Legal retirement + immutable `SOURCE_ROLLED_BACK_UNENTERED` is
atomic. Exact replay ACK is idempotent; conflicting attempt/digest, wrong scope,
pre-ENTER COMMITTED/UNKNOWN and late ENTER remain refused. No synthetic ENTER,
execution receipt or SDK `finished`; SAME-key recovery remains constructible
after installation expiry, while new issue/ENTER stay expiry-gated.

Companion patch [recovery-source/identity_role_window.patch](recovery-source/identity_role_window.patch)
targets original Edge helper under
`upgrade/integration/execution-native-read-v1/research-identity-intake/`, base
`44ee6c186de9e0822f587c37069738a8f410ae58`, original SHA256
`2d6c7df277f1cd7be85a21eff4550c2c077d0c399d8baeb09b5a91661afe008e`.
Patched helper SHA256
`78b71144293694ca7233d0cc42a4f8ee9699f607931d5cea612d3729645c5152`;
Public zero-context patch raw SHA256
`64184e9aadc7ae018c3e914b260d9ff5d973f7ad026a75cd39bdd62532fd0d11`;
review with `git apply --check --unidiff-zero` in the helper directory before
adopting. Exact original-source hash above is mandatory, not fuzzy applicability.
The private full-context equivalent has raw SHA256
`556f12337c63117e699aa0ff6da3a5c2ea1a434a69ccfd7ebbf98a5fbdad1905`.
**Edge reviews/adopts it in Edge-owned source**, resolving any actual later
delta; Core has not applied it on HK or overwritten WIP. Existing72helper
tests are isolated baseline, not new boundary/genuine Core acceptance.

Actual focused Core **167/167PASS**, Node22/PostgreSQL, four files, ended
15:29:33 Asia/Saigon. Log SHA256
`e8a5ce9e33e66b41b59f97cc5698ceb69b3625ea0a1ec1d24c90e49c8e431474`.
Build/restore/four access digests PASS; eight protected runtimes unchanged;
owned resources0. Exact private receipt
`research-recovery-focus-082500/controller.json` under operators base.

Actual source test **8 affected +18 reused PASS**,6.764s; PG15 image
`sha256:fe0737ba566a2c5b2a28f34433c0a423261900ec17b9bf7ad115e1aae7e57f1b`,
Python image `sha256:f699da1f7fde3a6cc83cd43488a85c2ae68ec781ca0f24ba168a23b0ebb16b44`.
2CPU/1.5GiB, internal disposable network/tmpfs, no pull/build/host port;
all existing runtime tuples unchanged, own containers/network0.
Private `source-recovery-test/attempt-083611-80a8f3/receipt.json`, raw SHA256
`ef6a99916bd5c08641b98fbe615a80075faa3b4211c81421d1db03fa906c121e`;
tests log `ccb41c3dea44e632ec16cb6e6745743d3dd13da7dab29741931ec09eb177f305`.
Core model is explicit TEST_ONLY; official PM SDK/SCRAM/fence/physical receipt
are real disposable PG. Test closure and source manifest live beside receipt,
manifest SHA256 `6e2d2900c95a392e242cd46efb68adebcb44f48da86c6c249ab7e2019dda5573`.
Normal-hook landing result: `research-recovery-land-*/controller.json` under
same base, terminal only when it actually exists/PASS; do not borrow678cf731 R3.
First landing attempt084023 stopped at whitespace precheck of the patch's
blank context lines, before tests/build. Public zero-context formatting fixes
only that packaging; tested Core/helper bytes are unchanged. Retry uses the
ordinary hook, not an evidence waiver.

Attempt084158's Git/hook parent was terminated at09:13:40UTC (log contains
`Terminated`), before a successful commit. Its API child cell remained running
after the parent returned1. This is **INCOMPLETE**, not a test PASS or evidence
that the repair failed; termination cause is UNKNOWN. Protected runtimes and
source/index were unchanged at the controller cut. Preserve that log/controller
and let the exact owned child settle under the same resource window before any
new heavy work. No build/install is accepted from that interrupted hook. A new
ordinary hook landing must finish; no hooks bypass or partial-suite substitution.

## 6. Window, rollback/custody and exact next actions

**Core next:** land normal R3; build only Core from that source; backup Research;
exact134 forward + registered schema, same-pool guard-aware reverse bootstrap,
actual WG/mTLS descriptors; provide real bound config/image receipt via private
index. Mint temporary Bobby session only when Edge reviewed/helper window ready.
No request for Bobby cookie file is needed. Exact-session logout after settlement.

**Edge next:** the owner helper adoption is now committed at6adc398b above;
do not reinitialize receipt schema/dormant role or reapply the old companion.
Return available finite window and secure intake acknowledgement after Core's
actual install. Consume Core private manifest/TLS references after
actual install, then official same-attempt SDK identity COMMIT + real Core ACK;
report source receipt/retirement metadata, not credentials. Changed source needs
affected tests, not full repeated unchanged qualification. No blanket native ACL
grant or manual SQL mapping seed. Source identity helper writer is not a command
or financial mutation authority.

After COMMIT/ACK, source owner separately installs reviewed
`pma.business-root-read.install.v1` through
`BusinessRootReadMaintenance.install(exactRawManifest)`, matching status on
uncertainty; Core separately installs reviewed `business.read_all` and
`stream.subscribe` owner policy using actual TS UUID/version and catalogue/
field-policy hashes. Exact scope Paper / `PAPER_BINANCE_USDM`, reviewed dataset
set only; no Sandbox/Live inference. Native READ acceptance is not STREAM grant.
Record actual returned policy/config revisions; no fixture hash as approval.

Then prove finite positive/wrong scope, permission revoke/current-auth cache and
cursor invalidation, SSE final-egress/reconnect/restart and lost-response
recovery. Idle heartbeat is not a source-update frame. The28445 authority
producer is not Manager data HTTP or a projection writer; actual authorized
data ingestion must be established before claiming rich-screen/event replay.

Shared heavy lock + actual free measurement window; source candidate ceiling
2CPU/1.5GiB/initial300s, no simultaneous competing test/build. 300s is admission/
measurement bound, **never permission to kill unresolved custody**. UNKNOWN
retains owning process/pool/key/source window; only same-attempt fenced recovery
and authenticated terminal ACK permit physical ACL/role drain and exact cleanup.
Rollback owner: Core for app/image/config/session/guards, Edge for source
role/recovery/mTLS. Do not drop audit/schema/custody or restore revoked grants.
Old-image rollback only after quiescent settled state and compatibility readback;
otherwise preserve guard-aware process or stop admission and forward-repair.

## 7. Independent surfaces and frontend handoff

- **08 READ/STREAM:** above genuine Research acceptance, finite/SSE and recovery.
- **07 command submit/status:** trusted-command catalogue/executor/current-human
  gates remain separately owned; no command/Live enablement from08.
- **03 dataset publication:** source publisher fencing and actual financial
  inputs separate; finite authority producer is not a publication writer.
- **01/06 capacity/coexistence:** approved numerical budget/calibration and
  matched G2 remain open; do not use isolated fixture limits as production values.

Contract locators: Core `packages/contracts/openapi/execution-access*`,
`execution-scoped-realtime*`, `execution-history*`,
`execution-publication-catalogue*`, `execution-trusted-commands*`, generated DTOs;
Edge `contracts/execution-catalogue-v1/`, `manager-v2-paper-read-v1/`,
`maximum-data-return-v1/` under `services/portal-execution-edge-rs/`; PM
`contracts/baseline/portfolio-account-v1_1/` dataset-discovery, selected-history
and edge-command handoffs. Family/logical catalogue count is not mounted endpoint
count; UNMOUNTED/runtime_enabled=false remain unavailable.

Claude: no new browser DTO/layout/baseline changes from this repair. FE-054
decimal subrequest already landed; other subrequests need individual receipts.
Provider/source acceptance, financial inputs, budget/calibration, matched G2 and
consumer/browser remain distinct OPEN gates. ELP2-10 NOT_MET; ELP2-11 unopened.
