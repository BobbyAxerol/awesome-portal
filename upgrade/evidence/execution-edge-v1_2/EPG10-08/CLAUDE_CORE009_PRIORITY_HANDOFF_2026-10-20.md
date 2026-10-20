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
