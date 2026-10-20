# Portal → Edge: ưu tiên bốn input để đóng connected acceptance

Owner: Bobby. Ngày20/10/2026, snapshot checkout23:16ICT (16:16UTC).
Phạm vi: original EPG10-08/read09,07,03,01/06 đã được giao; không mở phase mới.
Trạng thái khi giao: `AWAITING_PORTAL_ACK`; không phải installed/connected PASS.
Đây là một bản điều phối, không tạo thêm ledger hay thay các request gốc.

## 1. Đúng người, repo và thứ tự đọc

- Portal canonical/integrator: `/home/bobby/portal-research`,
  `docs/research-loop-plan@7818d5631e0da37563bca5715fd46d40b66ef1de`.
  Cây có Markdown WIP của owner: không stash/revert/commit hộ hay blind merge.
- Portal implementation/Claude: `/home/bobby/portal-research-fe`,
  `claude/fe-parity@105775f0371aca10a5614fdcecffbc121feeaf61` tại snapshot.
  Canonical `upgrade/execution_loop/AGENT_WORKING_RULES.md`§10.13 mới giao
  Claude toàn bộ backend Portal còn lại; Codex review/integrate. FE copy rules
  chưa có addendum đó: đọc bản canonical, không dùng phân vai B1/B2 cũ để chờ.
- Edge HK: `/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2`,
  `feat/execution-edge-upgrade-v1_2`, repository `BobbyAxerol/awesome-portal`.
  Source đã push: `bc4b8fe14cf6524411acfc7ffbf08ec4e5175996`.
  Canonical Edge checkout riêng là `/home/bobby/.worktrees/portal-execution-manager-v2`,
  `feat/manager-v2-paper-read@54c6f5f3cccd68f400f4dd25ae6f4b17320a7db4`;
  không nhầm worktree source với runtime deployment.

Đọc rules `/home/bobby/AGENTS.md`, nearest `AGENTS.md`, campaign rules mới nhất,
rồi `upgrade/UNIFIED_IMPLEMENTATION_PLAN.md`§14 trên SGP. Tài liệu chi tiết:

1. SGP `upgrade/execution_loop/evidence/ELP2-10/CLAUDE_ALL_BACKEND_HANDOFF_2026-10-20.md`
   ở canonical Core và `BE-CLAUDE-2026-10-20/HANDOFF_TO_CODEX.md` ở Claude.
2. Cùng ELP2-10: `EDGE_TO_CORE_EPG10_08_REQUEST_2026-10-19.md`,
   `CORE_008_INSTALLED_READY_009_RETURN_2026-10-19.md`,
   `CORE009_PREPARED_OWNER_RETURN_2026-10-20.md`,
   `CORE009_OPERATOR_RUNBOOK_2026-10-20.md` và
   `CLAUDE_CORE009_PRIORITY_HANDOFF_2026-10-20.md`; các file có thể ở hai
   checkout: repin trước dùng, không lấy đoạn lịch sử làm current truth.
3. Edge branch: `upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md`,
   mục original08/07/03/01–06 cuối journal. Detailed guide:
   `upgrade/upgrade_v1.2/EXECUTION_PORTAL_EDGE_UPGRADE_GUIDE_v1.2_VI.md`.
4. Edge phase owner packets: `upgrade/evidence/execution-edge-v1_2/EPG10-08/CONNECTED_READ_BINDING_OWNER_ACTION.md`,
   `EPG10-07/COMMAND_RELAY_AND_OWNER_RETURN.md`,
   `EPG10-03/CAPTURE_CONTRACT_AND_OWNER_RETURN.md`,
   `EPG10-06/RESOURCE_ENVELOPE_AND_HOT_PATH.md` dưới cùng evidence root.

## 2. Bốn nhóm cần trả — không gộp thành một blanket blocker

| Ưu tiên / phase | Implementation hoặc source owner | Input thật còn thiếu | Done-when phía producer |
| --- | --- | --- | --- |
| P0 Core009 →08/read09 | Claude Portal backend; Core Codex review/integrate/release; Edge nguồn HK | Reviewed landed source/image, prepared config/artifact templates/selection/schema/policy, private genuine session ref và finite joint window | Trả PREPARED-ready templates/selection/window; ghép fresh Edge inputs rồi review final config/artifact pins trước install; sau đó INSTALLED readback/receipt, READ/STREAM độc lập |
| P1 PM →07 | PM/TS authority owner; Portal consumer owner phối hợp, không sửa hộ TS/PM | Actual authenticated submit/status target, current human/workload/delegation authority và held-COMMIT revoke proof | Target được commissioning theo operation/mode/native profile; genuine submit/status/UNKNOWN/recovery/one-effect evidence |
| P1 TS →03 | TS native journal/publisher owner; Portal/Edge phối hợp source return | Native publisher fence, writer/export coverage và publication runtime được chấp nhận | Frozen source/epoch/order/retention/coverage contract cùng endpoint/identity refs và matched runtime evidence |
| P1 target owner →01/06 | PM/TS/DL/Research owners của từng target; Edge đo bằng existing harness | Actual target roster, approved numeric bounds, storage/admission và finite measurement window | Reproducible source/config/image pins, budgets được chốt; measured coexistence hoặc pilot được phân loại đúng phạm vi |

Portal làm ngay phần Portal đã được giao, gửi/điều phối request gốc tới đúng
PM/TS/target owner cho phần họ giữ. Handoff này không cấp quyền sửa DB/provider
HK hoặc tự approve numeric bounds. Không đợi command/N03/load để chuẩn bị
Core009; không đợi Core009 để chuẩn bị TEST_ONLY pilot độc lập.

## 3. P0 Core009 — làm và trả như thế nào

### Không làm lại các việc đã xong

- Core008/schema134/genuine identity COMMIT + Core ACK đã có. Attempt gốc,
  physical receipt và mapping phải giữ; không issue lại identity hay patch
  helper44ee/551a lên bản mới. Native28446 trước đã drain/retire; acceptance
  revision2 revoked. READY cũ và trust hết hạn08:00:59UTC20Oct không còn dùng.
- Ba lỗi session cleanup/short-write/dry-run đã sửa ở revision3. Edge đã chạy
  focused89PASS gồm3PG thật, build/restore PASS; không yêu cầu làm lại lỗi cũ.
  Đây không phải ordinary R3 hay installed009/connected proof.
- `field_policy_ref` thực đã PROVIDED trong packet revision3; không phát minh
  ref từ hash, không gọi static seal là current runtime authorization.
- Claude105775f0 vừa sửa runner/template layout và test expectations. Review
  current source + terminal hook receipt; không mặc định vẫn thiếu mount,
  cũng không coi commit đó tự chứng minh full R3 hoặc installed image.

### Trình tự ghép, tránh vòng chờ

1. Review/land đúng gói Core009 theo existing ownership, clean-tree và gates;
   không lấy toàn bộ peer diff chưa review làm bản deploy. Giữ mọi WIP khác.
   Trả source SHA/dirty diff hash, ordinary gate result và immutable image.
2. Chuẩn bị reviewed owner artifact và strict native runtime config trên đúng
   Research DB `portal_control`, physical system `7688673963308855330` đã
   được kiểm trước; xác minh lại target/schema/role hiện tại trước mutation.
   Dùng owning installer/coordinator, không INSERT grant trực tiếp. SAME Pool,
   trust, recovery registry và actual AppModule consumer phải được compose.
3. Chọn READ và STREAM grant riêng, current subject/domain/field/capability
   seals và hạn dùng. READ không tự cấp STREAM; source permission riêng.
   Trả **PREPARED-ready source/image + reviewed config/artifact templates,
   exact selection + proposed finite window** trước. Final config/artifact còn
   phụ thuộc fresh Edge pins: không yêu cầu final hashes trước khi có input đó.
   Không bắt Edge mở listener ngồi chờ, không đợi fully installed009 mới phối
   hợp. Khi ready, Edge renew trust theo owning PKI/maintenance path, append
   current-head native acceptance qua SDK và trả fresh observer pins; Core
   fill/re-pin và review final config/owner/revoke artifacts trước install.
4. Trong window đã khớp, Core chứng minh zero unresolved custody hoặc giữ
   original recovery. Dùng bootstrap IPC shutdown đúng protocol trước swap;
   không generic restart làm mất Pool/attempt/ACK. Install đúng reviewed
   Research-only image/config/schema, rồi readback actual native selection.
5. Issue/resolve genuine Research acceptance session qua AuthService/coordinator,
   trả exact `session_id`/subject khớp producer return, private0600 path/hash/
   expiry và execution UID cho runner. Không token,
   cookie, JWT, password, private key trong Git/chat. Đây là Research app-session
   evidence, không giả Cloudflare/password/human-presence của stable/main.
6. Phối hợp Edge chạy positive READ, wrong-scope/expired/uncommissioned negatives,
   independent STREAM, old/new cursor, official manager-domain/native revoke,
   active SSE, cache và recovery. Giữ actual Core obligation + source receipt +
   physical egress correlation. Egress binding có attempt/lease/scope/body và
   stream/frame ordinal; không tự tạo exporter/schema mới hay đồng nhất các
   loại digest chưa có producer definition. Không suy cache HIT từ repeated GET,
   không suy no-late-byte/final-egress từ EOF hoặc reconnect403. Unaffected
   scope cần genuine independent positive control, không fake grant.

Return Core dùng existing009 owner-return và Unified/sync, ghi từng mức
`PREPARED / INSTALLED / CONNECTED_VERIFIED` đúng evidence. Gửi Edge ngay phần
đã đủ dùng; không chờ hết PM/TS/calibration. Core/Edge cùng chịu trách nhiệm
giữ terminal/recovery, logout/revoke đúng session và cleanup exact test scope.

## 4. PM07 và TS03 — yêu cầu đúng owner

PM worktree HK `/home/bobby/.worktrees/trading-system-pm-v1_1`,
`feat/portfolio-account-v1_1-parallel@ff2bb673bbd3200367cde9871ad46c6790337e12`.
Đọc `contracts/baseline/portfolio-account-v1_1/pma11-14-edge-command-{transport,handoff}.json`
và main plan/PM guide R2 hiện hành trong chính worktree đó. Descriptor
`83d251e847169571bdfd13839d9a2bcace7db3dda1e5be5b340650a56a6437ba`,
handoff `7b62d7e17198347c85adc5267a319a175733adc2cb3b540d167a35135ed04a0b`.
Codec/durable relay/HTTP client phía Edge đã có; isolated source không là
commissioned target. PM trả actual authenticated human/workload/session/
delegation transport, current revisions và authority held xuyên outer COMMIT;
status/recovery đúng quyền hiện hành, original/latest complete outcome lineage,
retention, idempotency và exact native target/profile cells. Không dùng always-
true grant/read JWT/CLI shell shortcut. UNKNOWN giữ cùng key/custody, không retry
key mới hoặc nói APPLIED là filled. Dùng request RG03/RG04/RG16/RG17 gốc, cập
nhật stale TLS claims bằng evidence mới, không tự kết luận cert cũ vẫn là blocker.

TS canonical `/home/bobby/trading_system@668e10320c0bf5a9089e33b72f317d8d7c7215c3`;
active next-upgrade `/home/bobby/.worktrees/trading-system-next-upgrade@0cd356dab20dc385d9effbda408a0ea53280aa4b`.
N03 `contracts/portal-execution-owner/ts-oc-02/n03-source-implementation/owner-implementation.manifest.json`
SHA `f3a496034abbb9fc3e29789d147b8040825015ed700113725717dd460d414872`
vẫn `OWNER_IMPLEMENTED_SOURCE_DARK_NOT_ACCEPTED`, owner_accepted:false tại cut.
TS owner trả native publisher fence + writer/export coverage, committed ordering/
source epoch/barrier, delta/correction/retention/recovery semantics theo contract
đã chốt và query/installed runtime proof. Kèm source/image/config pins, endpoint
và identity **references**, window, acceptance result và limitations. Không lấy
polled fill ACK, copy outbox hay manifest SOURCE_DARK làm journal authority.
Edge chạy lại chính03 khi return đủ, không tự sửa TS hoặc tạo phase mới.

## 5. Target01/06 — chuẩn bị độc lập, đo đúng phạm vi

- Owner chốt exact TS–DL–Research/PM target roster, service/image/config/physical
  DB/storage refs, headroom, numeric approval refs, workload/burst/outage/resync,
  duration/repeats, stop/rollback và finite window. Không coi peer P184 test image
  là TS writer thực hoặc suy full coexistence từ isolated result.
- PM pilot source hiện ở `pma11-16-finite-pilot-{proposal,evidence}.json` cùng
  baseline directory. Proposal SHA
  `77a7b9859386cc32d9b0017b0b92ab79db381bcc74556c6d43a1034c1dfefaaa`;
  evidence `57d37691f1b8a350a7033cd8186737ead0eec3694c1529472269b126d53cbcae`.
  `execution_ready:false`, resource status `PROPOSED_NOT_APPROVED` tại cut.
  Proposed PG2CPU/2GiB + worker1CPU/512MiB không phải approved production budget.
- Pilot20operations/arm,1op/s, tracingOFF/ON, independent restores/60s arms có
  thể chuẩn bị trước Core009/TS publication. Cần exact real-filesystem device/
  quota/durability/admission, frozen source/config/image closure, independent
  restore/probes và named target. Owner làm phần mình ngay, không đợi Edge.
- Existing Edge01 explicit-roster observer hỗ trợ10–120s; dùng lại cho từng arm
  với cùng instrumentation. Không cần adapter/framework mới. Không nhét pilot
  vào B0/B1/B2 6k/9k canonical TRADE events/s,600s/two repeats/12cells hoặc hạ
  validator để PASS. Paired delta dưới shared load khác absolute capacity;
  absolute thresholds cần đúng measurement window theo root34b.
- Edge113test Manager materialization PASS ởbc4b8fe1 chỉ là isolated correctness:
  opt-in logical JSON limits + shared feed cache, không RSS/SQL-map/capacity/
  deployed OOM-fix proof. Old Paper worker restart/OOM không được giấu hoặc
  coi đã sửa chỉ vì candidate test xanh. Không tự nâng cap/restart worker.

## 6. Format trả lại để Edge đọc và nghiệm thu

ACK ngay tại existing request/Unified/sync: receiver/owner, accepted hoặc
changes_requested có lý do, selected source pin, owned files, first runnable
slice và exact return path. Delivery của file này không tự là ACK.

Mỗi nhóm trả một phần trong existing owner-return, không cần service/API mới:

| Trường | Nội dung thực cần có |
| --- | --- |
| Scope/status | Original phase/request IDs; PREPARED/INSTALLED/CONNECTED; profile/mode/operation; NOT_RUN rõ |
| Source/release | Repo/worktree/branch/full SHA; dirty diff hash nếu có; immutable image digest; config revision/hash |
| Target/authority | Exact DB/system/schema/role hoặc source domain; selected current policy/grant/native revisions; endpoint và secure refs |
| Joint window | Proposed start/end UTC+ICT; prepared templates/selection trước fresh Edge inputs, final config/artifact hashes sau ghép và trước install; freshness/trust/session expiry |
| Tests/receipts | Exact commands/cases/counts; new vs inherited; actual owning receipt/attempt/frame/commit correlation; declared limitations |
| Safety/cleanup | Stop/rollback/revoke owner; UNKNOWN recovery; before/after resource/runtime proof; exact retained rollback/evidence |
| Edge action | Input đủ cho case nào, còn thiếu gì; ready-for-binding không tự là Edge accepted |

Không gửi secret values. Nếu return chỉ reference private file trên SGP, gửi
path + hash + session_id/subject nếu là session, scope/expiry/UID; Edge sẽ đọc đúng quyền trên host đó. Public
sanitized return ở Git dùng hashes, bounded metrics, identifiers/provenance.

## 7. Edge sẽ làm tiếp, không đẩy trách nhiệm nghiệm thu sang Portal

1. Đọc current return và code/journal ở đúng branch; verify source/config/image/
   schema/trust/current grant pins và freshness. Mâu thuẫn trả CHANGES_REQUESTED
   theo request gốc, không coi owner báo READY là PASS.
2. P0 ready-window → fresh native source/trust/observer → installed Core009
   binding → actual08 READ/STREAM/revoke/cache/cursor/SSE/recovery. Ghi đúng
   case PASS/FAIL/NOT_RUN, rollback/cleanup exact; không fake cookie/frame/grant.
3. Chạy scoped read09 ngay khi own dependencies đủ; không chờ command/N03/
   calibration không liên quan, không báo full09 PASS khi còn missing scope.
4. Bind PM07, rerun TS03 và measure từng01/06 target độc lập khi chính return
   đó đủ điều kiện. Giữ source authority, correctness-before-performance,
   structured bounded evidence, same-key recovery và no financial activation.

Không mở UI task mới; không sửa stable `portal.primusspark.com`, dev preview,
provider28445/six existing bindings, shared DB/volumes/credentials hay bật Live
financial traffic. Paper là specimen đầu tiên, không thu hẹp product scope.
Source/independent implementation đã xong không đồng nghĩa master request/full
connected phase đã hoàn tất. Giữ request mở tới consumer verification thật.
