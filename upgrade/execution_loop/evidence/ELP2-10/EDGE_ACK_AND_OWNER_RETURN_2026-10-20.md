# ACK và owner-return Core009 — Portal backend (Claude) → Edge (2026-10-20)

Trả lời `EDGE_CONNECTED_ACCEPTANCE_PRIORITY_HANDOFF_2026-10-20.md` (snapshot 23:16 ICT / 16:16 UTC) §3 P0 và §6.
Bản này là **ACK + owner-return mức `PREPARED_SOURCE_ONLY`**. Không phải INSTALLED, không phải CONNECTED, không phải Edge accepted.
Không runtime, DB, Docker, SSH, secret, session, grant hay policy nào bị chạm khi viết. Giao file này **không** là ACK của Edge, Codex hay Bobby.
Mọi ô `PENDING` là đầu vào thật chưa có; Claude không tự điền giờ, hash, session id hay pin.

## A. ACK (§6 đoạn đầu)

| Trường | Nội dung |
| --- | --- |
| Receiver / owner | Claude, Portal backend owner theo `AGENT_WORKING_RULES.md` §10.13 (Bobby, 2026-10-20). Codex = review / integrate / release / vận hành hoán đổi runtime. |
| Quyết định | **ACCEPTED** cho P0 Core009 → 08/read09. Không CHANGES_REQUESTED với handoff. P1 (PM07, TS03, target01/06) không thuộc Claude: xem `PORTAL_TO_OWNERS_COORDINATION_2026-10-20.md`, Claude chỉ điều phối, không giữ quyền thay owner. |
| Selected source pin | `claude/fe-parity` @ `105775f0371aca10a5614fdcecffbc121feeaf61` (`git rev-parse HEAD` của worktree gốc khi viết). **Repin về SHA cuối khi landing**: bản này không phải pin phát hành. Base canonical Core đã nhập: `7818d5631e0da37563bca5715fd46d40b66ef1de` (tổ tiên). Image đang cài `sha256:7b2c7f34f134323201f447084440973b9aefd22318fdb09ff1e1bc35c4c4395d` build từ `7818d563`, **không** chứa Plan B / revoke / session CLI. |
| Tracked state | Cây sạch tại pin. Chỉ thêm docs (hai file `ELP2-10/` này) trong commit docs-only kế tiếp; không đổi code. |
| Owned files (Claude, một writer) | `apps/control-api/src/execution-v2/`: `native-core-runtime.ts`, `core-owner-commissioning.ts`, `core009-preparation.ts`, `manager-domain-revoke.ts`, `research-acceptance-session.ts`, `private-root-file.ts`, `owner-target.ts`. `apps/control-api/src/cli/`: `core009-validate.ts`, `execution-native-revoke.ts`, `execution-native-session.ts`, `execution-native-install.ts` (chỉ phần Plan B). `apps/control-api/src/auth/auth.service.ts` (`issueResearchAcceptanceSession`). `deploy/research-preview/native-core-templates/**`. Spec `apps/control-api/test/*core009*`, `*be-p10*`. Tài liệu: `ELP2-10/CORE009_*`, `BE-CLAUDE-2026-10-20/BE-P9..P11`. |
| Không thuộc Claude | Hoán đổi runtime, IPC shutdown, cài, `node dist/main.js` trên SGP (Codex). Duyệt artifact `approval_ref` (Bobby). Mọi file Edge/PM/TS bên HK. `main.ts`, `app.module.ts`, `composeNativeCore`, `research-reverse-bootstrap.cjs` (không đổi). Registry. |
| First runnable slice | Offline, không runtime: build `apps/control-api` từ commit đã land → `core009-validate --plan read-and-stream --trust-expires-at <PENDING>` trên hai file private đã điền (cả `--runtime-uid` service và `0`) → `--dry-run` của `execution-native-revoke` / `execution-native-session issue|revoke`. Điều kiện trước: Edge trả pin trust/acceptance/observer mới (cột Edge action, mục B.4). Không chạy được trước đó vì runtime manifest cần các pin này. Mức đã có: `NOT_RUN` tất cả. |
| Return path (chính xác) | (1) Public sanitized: file này + `CORE009_PREPARED_OWNER_RETURN_2026-10-20.md` trên nhánh `worktree-agent-a279bfe2117f1ff0c` (base `claude/fe-parity`), Codex landing ff-only. (2) Private bounded: đường dẫn + sha256 + `session_id` / subject / expiry / execution UID trên SGP, **chưa có** (PENDING). (3) Đề nghị dán vào `UNIFIED_IMPLEMENTATION_PLAN.md` §14 và `FRONTEND_BACKEND_SYNC.md`: Claude **chưa dán** (hai file thuộc lane Codex / lead). |

## B. P0 Core009 owner-return (bảng §6)

Mức: **PREPARED_SOURCE_ONLY**. Bảng trạng thái từng claim ở `CORE009_PREPARED_OWNER_RETURN_2026-10-20.md` §1 vẫn đúng và không bị file này gộp lại.

### B.1 Bảng chính

| Trường | Nội dung thực | Edge action |
| --- | --- | --- |
| Scope / status | Request gốc `EPG10-08` (Core009) → `read09`. Mức: **PREPARED_SOURCE_ONLY**. Profile / mode: `paper` / `PAPER_BINANCE_USDM` (test cell, không phải trần sản phẩm). Operation: READ `business.read_all` và STREAM `stream.subscribe`, hai grant riêng (Plan B). `NOT_RUN`: filled runtime manifest, filled owner artifact, validator trên file thật, build image, ordinary R3 trên byte cuối, PG-backed spec của revoke/session, quiesce, install, compose, session issue, READ, STREAM, revoke, cache, cursor, SSE, recovery. | Chưa có gì để chạy. Chỉ đọc và kiểm pin; ready-for-binding không là Edge accepted. |
| Source / release | Repo `/home/bobby/portal-research-fe`, branch `claude/fe-parity`, pin `105775f0371aca10a5614fdcecffbc121feeaf61` (**repin về SHA landing**). Dirty diff: không (tracked sạch). Immutable image digest: **PENDING** (build từ commit đã land, sau R3). Config revision / hash: **PENDING** (cần pin Edge). Pin byte đã tính tại `105775f0`: `research-acceptance-session.ts` `6a4ed7dc790318d60c4fd2593e48ac1845629afde444b38b11bbfba3661d1eb3`, `execution-native-session.ts` `fa353d3398acd79fdff8525972c1130622c8978306d0c2227c2e092be4290257` (khớp pin Edge ghi cho revision 3). Runbook rev 2 hiện tại sha256 `bd9c908ba238f7cc9eabd2d2c13764ab1ab6ceee30ff1e0b22b6c129f7dcb35e` **≠** `3417afbdf9d0bc0c3b5f06e44ec654899f55916fd4864881927ce79eef5c0bb1` Edge ghi (runbook được sửa tại chỗ sau đó): Edge repin trước khi dùng. | Repin runbook / source về SHA landing khi Core công bố. Không dùng hash trong `CORE009_PREPARED_OWNER_RETURN` §2 (cũ, theo commit `2062fcdc`, đã bị BE-P10 thay). |
| Target / authority | DB `portal_control`, system `7688673963308855330`, login/role `portal`. Subject = protected owner `usr_5a38d5dfb08b44748f5776fbe04a1434`; workspace `ws_06G19F61YB8CFR7TEWMS7HQ660`; issuer `portal-control-api.native-manager-read`; TS identity `608dcbd6-e8df-4aa4-b0fc-bc0881d0aafd`, mapping 1; TS owner khác, không thay. Retained recovery `[]` (cần đọc lại ở G5). Seals: Edge đã **PROVIDED** `field_policy_ref` tĩnh và các hash file (field policy `b9fbe07d1a9826d3e9270798162c052dda3687d27a04809eb38c4ad9e1a054f3`, relation-catalogue file `9040f0897d8f452a486e51ce35abb7f3165b2238d07221b6b0e684d9829b012e`, catalogue seal `0c71b72cd5d23cb21e902837d2a6c496d11da5bd09af70123dca3918cd9b1b44`, profile-domains `8bd82a118c9f189b9fb9447f3933e0a4fe0c0157b8acd02692ceee5a46d98e9f`). Claude **chưa** ánh xạ từng hash vào `catalogue_sha256` / `profile_sha256` / `field_policy_sha256` và **chưa** kiểm "catalogue = named relation `account-balances`": **PENDING** (Core điền, Codex review). Policy revision, `approval_ref`, grant id / revision: **PENDING** (Bobby duyệt, Core điền). Endpoint: `research-portal.primusspark.com` (theo handoff Edge); origin source / transport / `workload_id`: PENDING (Edge). Secure refs: không có giá trị ở đây. | Cung cấp pin nguồn mục B.4; xác nhận ánh xạ seal ↔ relation `account-balances` khi Core gửi bản nháp. |
| Joint window | Tất cả **PENDING**; xem B.2. Quy tắc cứng (validator): trust gia hạn là trần; mỗi grant ≤ 2 giờ và ≤ hết trust; installation ≤ 24 giờ, không quá trust, không quá `expires_at` của native acceptance; ≥ 15 phút còn lại khi validate; acceptance native `effective_from ≤ now`. Trust ứng viên cũ hết `2026-10-20T08:00:59Z` (đã qua). | Đề xuất sớm nhất / muộn nhất Edge phục vụ; gia hạn trust; mở window hữu hạn chỉ khi hai bên đã khớp. |
| Tests / receipts | **Mới trong tác vụ này: 0** (docs-only, không chạy lệnh). **Thừa kế, không nâng mức:** (a) Edge isolated qualification revision 3, bản `2325dd94`: 3 file / 89 distinct PASS (63 session + 23 CLI + 3 PG thật), build/restore PASS; log `d32cdc0f14946dc1dfd26ac2539617224e770c81d01978a5eaa7b67eaa522e8b` (Edge). (b) Claude BE-P10: focused fake-backed (revoke 40, running-consumer 8, Plan B 26, session 38, template 18; PG-gated 3 `NOT_RUN`), xem `BE-P10.md` §5. (c) PREPARED return trước: 9 file / 144 PASS, fakes. Hook R2/R3 terminal cho `105775f0`: `HOOK_RESULT_2026-10-20.md` (pending). Commit `105775f0` sửa mount của hook (contracts + template Core009) và expectation test; **không** chứng minh R3 đầy đủ hay image cài. Chưa có receipt / attempt / frame / commit correlation vì chưa có kết nối. Giới hạn: fake, không PG cho install thật, không Docker, không TLS/source. | Không dùng 89 PASS hay 144 PASS làm bằng chứng installed / connected. Chờ receipt hook terminal. |
| Safety / cleanup | Stop / rollback: **Codex** vận hành swap theo runbook §4–§6, §8.3, §9. Revoke grant: `execution-native-revoke` (READ và STREAM riêng), artifact soạn và review **trước** window (G12). Revoke session: `execution-native-session revoke` đúng `session_id`. Cleanup token file và session: operator (Codex), chỉ xóa token đúng của session đó (`RETAINED_NOT_BOUND_TO_SESSION` giữ nguyên). UNKNOWN / custody khác 0: dừng, giữ bootstrap cũ, giữ attempt / receipt / ACK gốc; hết hạn không phải release. Rollback chỉ qua revoke + hết hạn grant (policy / grant / event là lịch sử bất biến; không rollback bằng SQL). Image cũ `7b2c7f34…`, bootstrap `cc6ae429…` + descriptor giữ làm đường lui. Before / after resource proof: PENDING (operator ghi). Claude không tạo tài nguyên runtime nào cần dọn. | Cleanup phía HK (listener, source acceptance revoke, scope test) là của Edge; revoke acceptance native source đi đường maintenance chính thức. |
| Edge action (tổng) | Xem B.3 và B.4. Điều kiện để Edge bắt đầu chạy 08: Core công bố INSTALLED + readback + `session_id` / file token; hiện **chưa**. | — |

### B.2 Cửa sổ chung đề xuất (placeholder, không phải thời điểm đã thống nhất)

| Mục | Giá trị |
| --- | --- |
| Start UTC / ICT | PENDING |
| End UTC / ICT | PENDING |
| Trust gia hạn hết hạn (UTC) | PENDING (Edge + PM; owning PKI/maintenance path) |
| Native acceptance mới: revision, `receipt_id`, `receipt_digest`, `document_digest`, `effective_from`, `expires_at` | PENDING (Edge append qua SDK; **không** dùng revision 1/2 của `b922c105…`) |
| Fresh observer pins (`source_fingerprint`, `pm_leaf_sha256`, `workload_id`, `deadline_ms`, `request_bytes`, `response_bytes`, `max_inflight`, origin) | PENDING (Edge) |
| Hash artifact owner cuối, hash manifest runtime cuối | PENDING (sau khi ghép pin; review trước install) |
| Image digest cuối | PENDING |
| Policy revision, `approval_ref`, READ grant id + hạn, STREAM grant id + hạn | PENDING (Bobby / Core) |
| Session: `session_id`, subject, TTL / expiry UTC, đường dẫn file token (0600), hash, execution UID | PENDING; chỉ có sau khi cài + compose. Token không bao giờ vào Git / chat. |
| Số intent đột biến còn lại (G9) | PENDING (operator đọc block B) |

### B.3 Ai làm gì, theo thứ tự (hoán đổi runtime theo runbook)

| Bước | Việc | Owner | Edge action |
| --- | --- | --- | --- |
| 1 | Review / land gói Core009; build image từ commit đã land; R3 trên byte cuối (mount `deploy/research-preview/native-core-templates` read-only cho fixture) | Codex (Claude cung cấp source) | Không. |
| 2 | Chuẩn bị template, selection, window đề xuất (đã có B.1 / B.2); soạn artifact revoke và session-revoke, review trước window | Claude, review Codex | Không. |
| 3 | **Edge cung cấp:** (a) gia hạn trust quá `2026-10-20T08:00:59Z` theo owning PKI/maintenance; (b) append native acceptance current-head mới qua SDK; (c) fresh observer pins. Không mở listener ngồi chờ | Edge + PM | **Có.** Trả pin theo B.2. Không replay revision cũ. |
| 4 | Core điền runtime manifest + owner artifact, `sha256`, validator Plan B ở hai uid, reviewer thứ hai so với đầu vào (G1–G4) | Claude điền, Codex review, Bobby `approval_ref` | Xác nhận pin đã khớp nếu được hỏi. |
| 5 | Readback block A–F, backup (G8), **IPC quiesce** bootstrap (`status` → `shutdown`), đọc lại block B, custody = 0 hoặc DỪNG và giữ bootstrap cũ | Codex | Window nguồn đóng / drain trước khi swap. |
| 6 | Cài policy (`execution-native-install policy`, Plan B) → ACK; readback C/E; ghi grant id + revision vào artifact revoke | Codex | Không. |
| 7 | Compose: `node dist/main.js` với cặp env, kiểm image ID, `readyz` / `healthz`, STREAM route reachable (cờ SSE overlay là `"false"`, phải xác nhận từ process chạy) | Codex | Không. |
| 8 | Cấp session qua AuthService (`execution-native-session issue`), giao **đường dẫn + `session_id`** qua kênh đã duyệt, không giao token | Codex vận hành | Đọc đúng UID sở hữu file 0600 (không chmod / chown mở rộng). |
| 9 | Edge chạy 08: READ dương, âm (sai scope / hết hạn / chưa commission), STREAM độc lập, cursor cũ / mới, revoke chính thức (manager-domain, native), SSE active, cache, recovery; giữ obligation Core + source receipt + tương quan egress vật lý | Edge + Core | **Có.** Kết quả PASS / FAIL / NOT_RUN theo đúng case. Reconnect 403 và EOF không phải bằng chứng cut SSE hay no-late-byte. |
| 10 | Cuối window / nghi ngờ: revoke READ+STREAM, revoke session, readback E/F, giữ receipt, danh sách NOT_RUN thật | Codex (operator), Edge (nguồn) | Revoke acceptance nguồn. |

### B.4 Edge phải cung cấp (checklist đầu vào)

1. Trust gia hạn (hết hạn sau window; ghi mốc UTC cho `--trust-expires-at`).
2. Native acceptance mới, append-only, current-head qua SDK; trả `revision`, `receipt_id`, `receipt_digest`, `document_digest`, `policy_revision`, `owner_mapping_revision`, `semantic_revision`, `effective_from`, `expires_at`.
3. Fresh observer pins: origin, `pm_leaf_sha256`, `workload_id`, `deadline_ms`, `request_bytes`, `response_bytes`, `max_inflight`, `source_fingerprint`, audience / `key_id` + tham chiếu file signer / TLS của Core (Core giữ key private).
4. Xác nhận ánh xạ seal field-policy và relation `account-balances` đã review (hiện chỉ có tên file / hash; chưa là đầu vào đã đối chiếu).
5. Sớm nhất / muộn nhất Edge phục vụ window.
6. UID thực thi runner, để Core ghi vào file token 0600 đúng chủ.

### B.5 Owner của dọn dẹp, rollback, revoke

| Việc | Owner |
| --- | --- |
| Revoke grant manager-domain (READ, STREAM) | Codex vận hành (`execution-native-revoke`); Claude soạn artifact; Bobby duyệt |
| Revoke session nghiệm thu | Codex vận hành (`execution-native-session revoke`) |
| Cleanup file token, scope test | Operator (Codex); Edge dọn phía HK |
| Rollback server | Codex: SIGTERM graceful (`owner.close()`); không SIGKILL; nếu `CONTROL_API_NATIVE_SHUTDOWN_RECOVERY_REQUIRED` thì giữ nguyên |
| Quay về bootstrap cũ | Chỉ sau custody = 0, là bước lifecycle review riêng |
| UNKNOWN / recovery nguồn | Giữ bản gốc; owner nguồn là Edge + PM |

## C. Không khẳng định

Không phải: cài đặt, window đã thống nhất, owner approval, source acceptance, READ / STREAM PASS, session reference, R2/R3 cho byte cuối, quyền restart container. Stable / dev / main, provider28445, command / Live: không đụng. `HOOK_RESULT_2026-10-20.md` (pending) là receipt hook terminal duy nhất của đợt này; trước khi nó tồn tại, không có mức gate nào trên `105775f0` được coi là đã đạt.
