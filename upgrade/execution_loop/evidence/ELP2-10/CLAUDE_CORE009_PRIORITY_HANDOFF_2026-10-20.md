# Claude — ưu tiên Core009 để Edge nghiệm thu08/read09

Owner assignment,20Oct2026: Bobby yêu cầu Edge SSH sang SGP, giao handoff này
cho Claude **làm Core009 ngay và ưu tiên**, trong khi Edge hoàn thiện runner.
Đây là giao việc backend cụ thể; không phải giao UI mới, mở phase mới hoặc cho
phép sửa stable/dev/main. Chỉ assignment này bổ sung phạm vi Claude so với bảng
B1/B2 cũ; giữ nguyên business/security invariants và ranh giới file đang sửa.

## 1. Đúng checkout, không đụng phần song song

- Core integration/source hiện tại: `/home/bobby/portal-research`,
  `docs/research-loop-plan@7818d5631e0da37563bca5715fd46d40b66ef1de`.
  Có5Markdown đang sửa; không stash/revert/ghi đè hoặc commit hộ gói đó.
- Claude: `/home/bobby/portal-research-fe`, `claude/fe-parity`, vừa kiểm
  `e4383f22d852d7b1d256acee4f4a32d43f462f4c`, tracked/index clean trước handoff.
  Làm trong checkout được giao; phối hợp Core owner trước shared-file/runtime
  change. Không ghi code trực tiếp vào checkout Codex, không tự merge/rebase/push.
- Edge HK: `/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2`,
  `feat/execution-edge-upgrade-v1_2@0af33fdf97861edde07a5ca85e367dc9a315a092`
  là publication hiện tại. Runner mới đang được Edge sửa/test; lấy pin cuối
  sau publication, không chạy draft hoặc áp lại helper44ee/551a cũ.

Đọc `/home/bobby/AGENTS.md`, nearest `AGENTS.md`, `CLAUDE.md`, Unified§14,
`upgrade/execution_loop/AGENT_WORKING_RULES.md` trước khi làm. Root34b là rule
mới: correctness có cap không lấy measurement lock; không giữ lock chờ peer.

## 2. Đọc đúng bằng chứng đã có, không lặp identity

Trong Core checkout, đọc hết:

1. `upgrade/execution_loop/evidence/ELP2-10/EDGE_TO_CORE_EPG10_08_REQUEST_2026-10-19.md`
   (các append20Oct supersede prerequisite cũ).
2. `upgrade/execution_loop/evidence/ELP2-10/CORE_008_INSTALLED_READY_009_RETURN_2026-10-19.md`,
   đặc biệt§4 composition009; raw SHA256
   `230c7c66769f0293415fbb9c8d492391496402ddc0c56c34ec30d73712bb161f`.
3. `/home/bobby/secure/portal-edge-original08-return-20261020/`
   `final-publication-return.json`, `finite-source-closeout.json`,
   `connected-source-return.json`. Chỉ file cuối là historical READY snapshot;
   không coi đó là authority hiện hành. Không đưa private config vào Git/chat.
4. Edge main plan trên HK:
   `upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md`, section
   `Original08 resumed — Core009 binding, then scoped read09 —20Oct05:40UTC`;
   guide08/09 tại `upgrade/upgrade_v1.2/EXECUTION_PORTAL_EDGE_UPGRADE_GUIDE_v1.2_VI.md`.

Đã xong thật: identity attemptbc91a536 COMMITTED + genuine Core ACK, TS user
`608dcbd6-e8df-4aa4-b0fc-bc0881d0aafd`, mapping1; role dormant, original session
FINISHED/logout, zero unresolved. **Không issue lại identity/session cũ.**
Portal subject `usr_5a38d5dfb08b44748f5776fbe04a1434`, workspace
`ws_06G19F61YB8CFR7TEWMS7HQ660`; issuer `portal-control-api.native-manager-read`.
Research protected Portal owner là chính subject này. Protected TS owner khác,
không đổi TS owner hoặc copy grant stable để lấp chỗ trống.

Native source28446 đã graceful drain/retire; acceptance
`b922c105-4e99-4830-8be2-bb2e1f41b5d9` head2/revoked. Không replay1 hoặc gọi
source snapshot cũ là live. Candidate trust hết hạn **20Oct08:00:59UTC**;
window sau đó cần trust thật đã renew, không tự ký giả identity hay tắt TLS.

## 3. Gap đã kiểm tra bằng runtime/DB, không phải đoán

20Oct05:45:21UTC: actual Core container
`5f3252b7d270a40079d2767cc78f513681c5720fc092b9b51da69b1098efb954`, image
`sha256:7b2c7f34f134323201f447084440973b9aefd22318fdb09ff1e1bc35c4c4395d`,
restart0; chưa có `CONTROL_API_NATIVE_CORE_CONFIG_FILE/SHA256` selected.
Actual `portal_control`, system7688673963308855330, roleportal: exact workspace
có0policy-state/0grants/0policy-events. Bobby ACTIVE, không must-change/archive.
Check là1connection BEGIN READ ONLY,5s statement bound, ROLLBACK/pool.end;
không tạo session/grant. **Core008 READY không đồng nghĩa Core009 composed.**

## 4. Việc Claude cần làm ngay — existing components, không framework mới

1. Chuẩn bị và review artifact root0600 hiện có
   `portal.private-owner-manager-commissioning.v1`: đúng physical DB/role,
   protected Portal owner/principal/workspace, genuine TS mapping và reviewed
   manager domain/field seals. Dùng `core-owner-commissioning.ts`/
   `installReviewedManagerDomainPolicy`, không INSERT grant/policy SQL.
   Nonempty/conflicting policy phải typed conflict; không reset/repair âm thầm.
2. Chuẩn bị strict `portal.native-core-runtime.v1` theo
   `native-core-runtime.ts`. Dùng standard `main.ts` →
   `prepareNativeCoreRuntime` → `composeNativeCore` → actual AppModule consumer,
   SAME actual Pool/trust/mutation coordinator/recovery registry. Không dựng
   app thứ hai hoặc chỉ thêm env mà không mount consumer.
3. READ và STREAM độc lập. Installer `DOMAIN_READ_ONLY/stream_commissioned:false`
   không phải STREAM approval. Nghiệm thu STREAM cần đúng reviewed domain grant
   và source publication/notice hiện hữu; không fake frame/financial data để PASS.
4. Trả **prepared config/artifact pins + exact domain/selection + window** cho
   Edge trước khi mở source. Edge dùng official maintenance current-head CAS,
   mở finite28446 qua qualified lifecycle và trả fresh observer pins. Core dùng
   những pin mới đó để select/install009. Đừng bắt Edge giữ listener chờ Core;
   cũng đừng đợi fully installed009 mới phối hợp window — tránh vòng chờ nhau.
5. Review exact **Research-only** image/config/schema/backup/rollback delta,
   dùng normal R2/R3/identical-tree inheritance đúng rules, rồi thực hiện gói009
   thuộc assignment08 đã duyệt. Kiểm zero custody hoặc retain original recovery
   trước replacement; một restart không giữ nguyên JS Pool cũ. Không restart
   stable/dev/main, provider28445/six stable bindings, hoặc bật command/Live.
6. Cấp/tra cứu session nghiệm thu bằng actual AuthService/private reference
   theo existing approved Research flow; không fake cookie/assertion, đổi password,
   copy stable session hoặc gọi Research PREVIEW là Cloudflare-main acceptance.

Paper là specimen nghiệm thu trước, không hạ product scope các mode khác. Current
deployment catalogue và relation catalogue có thể khác nhau: review exact Core
selection/domain trước khi claim named `account-balances` native-ready. API200
cùng schema legacy, health, migration hoặc transport TLS không thay authority.

## 5. Handback cần gì để Edge chạy tiếp, không thêm API/gate mới

Trả vào existing Core009 owner-return/Unified và một bounded private return:

- source SHA/dirty hashes, immutable image, config/owner-artifact hashes,
  schema/physical DB readback, actual selected domain/subject and policy/native
  revisions, install ACK; explicit PREPARED vs INSTALLED vs CONNECTED;
- actual API route/origin, secure genuine session reference/expiry (không value),
  separate READ/STREAM commissioning, current source observation pins/window;
- official manager-domain/native revoke mechanism và correlated receipt, không
  dùng public root-grant revoke thay native manager revoke. PM deny có thể đóng
  connection zero bytes; EOF chung không phải PASS nếu thiếu actual custody/
  receipt/recovery correlation;
- nguồn nào thực sự ingest/frame được, negative/revoke/cache/cursor/recovery cases
  đã chạy và NOT_RUN rõ; command/calibration/load không gộp thành blocker đọc;
- exact cleanup/retention, callbacks/pools/socket/task terminal, unchanged protected
  runtimes và rollback owner/path. UNKNOWN giữ original objects/recovery/receipts.

Không cần code một exporter/endpoint mới cho format runner: Edge có thể nối
metadata từ existing installer/config/receipt vào private harness input. Cần
producer facts thật và secure references, không một `installed=true` tự khai.

Edge đang hoàn thiện `scripts/epg10-08/connected_read.py` + pure tests, fixed GET
routes trên **research-portal.primusspark.com**, không reverse28444. Baseline và
post-revoke có scope/cursor provenance; cap200rows/1MiB/finite deadline. Không
mint JWT/session, grants, SQL hay mutation; không coi reconnect denial là active
SSE revoke hoặc repeated read là cache HIT. Actual final-egress/revoke/SSE cần
matched Core/source receipts. Sau actual08 tương ứng, Edge chạy read09 theo đúng
dependency có thật, không đợi command/N03/calibration không liên quan.

**ACK requested:** Claude ghi ACCEPTED/CHANGES_REQUESTED, source pin, owned files,
first runnable slice và exact return path trong packet/Unified của mình. Handoff
được đặt trên SGP chưa có nghĩa Claude đã nhận/chạy hoặc009/08/09 đã PASS.


### Core009 revision2 — CHANGES_REQUESTED before commissioning —20Oct

Reviewed FE0deeee706849a02660da0ef94e7405ecb4765cc9; later792647d5
frontend-only changes do not replace the pinned backend bytes below. Revision2
supersedes the earlier missing-code observations: Plan B installer, official
manager-domain revoke and actual AuthService session issuer/revoker exist.
No fake grant/session or public autologin is needed. Core still reports actual
PG/R3/image/install NOT_RUN. Edge publication e37a5e39009abd57c1b2d0356ea120053058eb9b
contains the completed original07 custody slice, normal-hook PASS and cleanup;
original08 connected runner is being bound to the official token-file shape.

**Priority corrections for Core/Claude, in the same009 assignment:**

1. `apps/control-api/src/execution-v2/research-acceptance-session.ts`
   SHA256`2bd35bb2a13a77373e9b6b2777c87c9effd31d031393e4cbbdb4d0074ff80f48`:
   revoke cleanup must be bound to the exact session/file. Reproducer without
   any operational call: issue S1 at P → revoke S1 → issue S2 at reused P →
   replay S1 revoke currently removes S2's live token while S2 remains ACTIVE.
   Refuse/retain a mismatched token; preserve exact terminal/recovery semantics.
   Add replay/reused-path/absent/mismatched-session tests, not a runtime demo.
2. Same module's token sink ignores `FileHandle.write().bytesWritten`.
   A short/zero write is fsynced and falsely acknowledged after session COMMIT.
   Require complete bounded writing/verification, compensating exact-session
   revoke on failure, and injected partial/zero-write tests. No weakened fsync.
3. `apps/control-api/src/cli/execution-native-session.ts`
   SHA256`df0f327756000183d776cdcb65f1dd80e7f456edbc1fbd87bc4cfa399a93a773`:
   `--dry-run` branches only after schema DB read/composition. Honor its stated
   offline/no-DB contract before those calls; test that dry-run cannot build
   a pool, connect, mutate or issue a session.

Return corrected source/test pins and run the actual disposable-PG/normal R3
gates on the final composition. Refresh the lead-owned persistence ingress
ledger for revoke/session tools. No expiry-only substitution for a revoke.
Use existing publication/runner and Core templates, no new framework. Ordinary
source review is not installer acceptance; do not open a source window merely
to wait for these fixes/tests. Core operator runbook rev2 SHA256
`3417afbdf9d0bc0c3b5f06e44ec654899f55916fd4864881927ce79eef5c0bb1`.

Edge will directly read the actual six-field
`portal.research-acceptance-session-token.v1` file in its current08 runner,
with producer/session-id/subject/expiry/hash binding. The file remains private;
no token transfer in public Markdown, stdout, chat or Git. Exact execution UID
must own its0600 input; using the root-owned Core file requires an operator
running the runner under that same UID, not chmod/chown widening. Evidence is
`RESEARCH_APPLICATION_SESSION_NOT_CLOUDFLARE_NOT_PASSWORD_NOT_HUMAN_PRESENCE`.
Known source seals/mapping above remain historical inputs; renewal/current
source head and reviewed field-policy reference must come from real artifacts.
Existing08 approval covers this correction/binding work; no new phase or blanket
approval requested. Full08NOT_MET; scoped connected09NOT_STARTED.



#### Edge official-session binding published —20Oct08:40UTC

Edge source now6e8f7f2df585688dc4a75614ff15ddb77c977f32, origin/feat/execution-edge-upgrade-v1_2 in BobbyAxerol/awesome-portal, normal nonforce push and remote SHA verified.
Existing GET-only runner consumes the official6-field AuthService token file directly, exact producer/session-id/subject/hash/UTC expiry binding, no credential copy or reissue.
Driver18cb1a352d8e3d9cd37ddaafcd3340d0e60e6657b6245db0a248e18313d67d92; tests754914fc3db8702b63e984bdae211dadf4e873fe2a45242e1a0649cdd754ec8f. Actual40unitPASS (11new), normal130contracts/717API PASS, PG restore/build PASS.
Exact own offline hook image removed;19protected HK tuples unchanged; no SGP test resources, genuine session/source calls or runtime changes.
The three Core corrections immediately above remain CHANGES_REQUESTED on source pins rechecked08:37UTC. Core corrects/tests them; then review final PG/R3/image/config, coordinate fresh source/trust, zero-custody swap and actual08 READ/STREAM/revoke. No blanket approval or new phase.
This receipt is source/isolated proof, never Cloudflare/password/human-presence or connected08/09 acceptance. Preserve peer index/source/runtime; no commit/push on Core or FE by Edge.


### Published Edge runner and offline preparation batch —20Oct e766034c

Bobby-approved original08/Core009 priority handoff, not a new approval/phase.
Fetch awesome-portal origin branch feat/execution-edge-upgrade-v1_2 at
e766034c51b050182fc38b94c2286aec5f9e293d. This is source publication, not runtime.
Commits: 3bbc44171593e04888f5b39ecfca0bc4d1b9ed15 (08 runner) and
e766034c51b050182fc38b94c2286aec5f9e293d (01/06 offline lock correction).
Both normal hooks terminal PASS:130contract/717API cases each, build/PG restore;
717 includes57 unchanged peer-egress cases, not717new. Focused unit fixtures:
66 runner cases (40prior+26new),60 helper cases (53prior+7new),0FAIL/SKIP.
No real session/source/native connected acceptance was exercised by those tests.
Own2hook images/cells/networks cleaned;19HK protected runtime tuples unchanged,
339shared BuildKit records retained;0SGP test resources/runtime mutation.

Current source pins:
- scripts/epg10-08/connected_read.py:
  cad1eeb6b8f3cd8244cdf7e3f3dd0001a7fefb32a105bdbfab60d7ecc519debf
- scripts/epg10-08/test_connected_read.py:
  a173beac18bb67c7a6e4290fccbb171425ed456ad74de2b83f763ff67afd8d2b

Read the updated existing owner packet in that branch:
upgrade/evidence/execution-edge-v1_2/EPG10-08/CONNECTED_READ_BINDING_OWNER_ACTION.md,
and current08/01/06 sections at the end of
upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md.
These supersede earlier40-case runner pins, not the genuine original identity
attempt/physical receipt/Core ACK. Do not repeat identity issuance or patch
old44ee/551a helper bytes over the published source.

Runner remains GET-only, fixed Research origin/TLS/private references and bounds.
Opt-in observe_active_stream holds the same response past its first source
notice with8frame/1MiB/60s caps. Client UTC/monotonic/hash/termination facts are
OBSERVED_ONLY/final_egress_proved:false, not final-egress or revoke-SLO proof.
Independent STREAM removal uses revoke_action:"stream.subscribe", distinct
installed STREAM grant ID and actual artifact/current-readback revisions;
READ policy/grant/native stay unchanged and READ must still be positive.
The actual official CLI envelope must contain exactly one fresh selected
STREAM REVOKED receipt; no mixed READ removal/NOOP/expiry/replay substitute.
READ-positive native snapshot/page and new/old-cursor STREAM403 are separate
from active-stream/cache-HIT/independent-unaffected-scope acceptance.

Core/Claude PLEASE PRIORITIZE the three already documented CHANGES_REQUESTED
in the SAME009 task:
1. Bind token-file revoke cleanup to the exact named session; old S1 replay
   must not wipe the current S2 token at a reused path.
2. Complete/verify bounded token writes; short/zero write cannot falsely ACK
   after COMMIT; retain exact-session compensation/recovery semantics.
3. Session --dry-run must run before Pool/schema/native composition, no DB.
Revoke/session code already exists; do not repeat the stale "missing code" claim.
Then return corrected source/test pins, actual PG and normal R3/image/config/
installed current-policy/session private references. No secret/token in docs.

Coordinate a fresh reviewed trust/source window only when the final target is
ready, preserve UNKNOWN/attempt/receipt custody, prove zero reverse custody and
use the installed bootstrap IPC shutdown seam before swapping it. Core008/
schema134/genuine identity are not new blockers. Never generic restart/reset or
expiry-only substitute for actual manager-domain revoke. Stable/provider28445
remain protected. Full08NOT_MET/09connectedNOT_STARTED. Edge will bind genuine
returns and run08 then scoped read09 under the existing approval.
