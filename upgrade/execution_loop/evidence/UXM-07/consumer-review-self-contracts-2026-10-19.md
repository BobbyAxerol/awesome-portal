# UXM-07 — Consumer review F8c: self-eligibility, self-navigation và `currency` trên status, 2026-10-19

Người viết: Claude (subagent F8c). Review là **ghi nhận, không phải ACK** (Rules §10.3): ACK chỉ khi Bobby giao UXM tương ứng. Mọi verdict là **đề xuất**. Bổ sung cho [consumer-review-2026-10-18.md](consumer-review-2026-10-18.md) (F8) và [consumer-review-pending-control-2026-10-18.md](consumer-review-pending-control-2026-10-18.md) (F8b): file này trả lời phần Codex đã giao trong `e19ad906` mà FE chưa đọc, và cập nhật R-1/R-2 của F8b.

## 0. Pin, phương pháp, giới hạn

| Mục | Giá trị |
| --- | --- |
| Producer | `e19ad906` "feat(execution): align self access and manager read composition" (Codex, 2026-10-18 22:29Z). Là tổ tiên của HEAD FE `eff7dcf1` (nhánh `claude/fe-parity`, đã rebase qua `35953e07`) |
| Bằng chứng Codex đã đọc | `evidence/ELP2-03/README.md` (mục "C3 follow-through"), `ELP2-03/researcher-field-policy-proposal-2026-10-18.md` (FE-026, **không** phải hợp đồng này), `ELP2-07/pending-control.md` (terminal R3 của `5291a80f`), `ELP2-10/manager-intake-2026-10-18.md` (bảng C3, dòng F8-08, các mục R3 follow-through), `ELP2-10/claude-review-intake-2026-10-18.md`; mã nguồn `apps/control-api/src/execution-v2/{self-eligibility,access.controller,pending-control.contract,command.contract}.ts`, `facade/session.guard.ts` |
| SHA-256 (đầu…cuối) | fixture access `3a8071be…48573afa` · fixture command-currency `8f1954ff…1c14b1cc` · fixture pending-control-currency `6f3c04d1…82192384` · openapi access `3d5b9131…8e74bc60` · openapi trusted-commands `8cc936de…eb08f315` · openapi pending-control `f08611de…3e21ac00` · generated `execution-access.d.ts` `27844fca…d504e89d` · fixture trusted-commands `7b68525c…aa3ca609` |
| Lane | Mọi fixture ghi `lane: TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT` (hai file currency thêm `runtime_qualified: false`). Commit nói "source-dark… No runtime activation". Route đã gắn vào `ExecutionAccessController`, nhưng mount/policy/provider thật **UNKNOWN** (Board hàng 6). Lane = **SOURCE_DARK + SYNTHETIC_ONLY**, chưa có mẫu runtime |
| Không làm | Không chạy lại test của Codex (số liệu "self-eligibility 92", "mounted HTTP 16/16" là của Codex, chưa kiểm). Không SSH. Không nối reader vào màn/`roleNav`. Không sửa ledger FE, Board, bất kỳ file Codex. Không commit. Một nhánh agent khác đang sửa `accessEffective.ts`/`.conformance.test.ts` trong cùng worktree; tôi chỉ import hằng và kiểu từ đó |
| Công cụ | `testkit/schema.validateAgainst` đọc thẳng OpenAPI qua đường dẫn tương đối: `validateAgainst("../openapi/execution-access.openapi.json", "/components/schemas/AccessEligibility", body)`. Ba schema này **không** dùng `discriminator` nên không cần workaround như F8b. Checker xử lý đúng `prefixItems`+`items:false`, `contains/maxContains`, `if/then/else`, lookbehind. Giới hạn nhỏ: `maxLength` đếm UTF-16 unit, JSON Schema đếm codepoint (chỉ lệch với ký tự ngoài BMP) |

## 1. Hợp đồng

| operationId | Route | schema_version | Query (đúng 5 / 2 khóa, `additionalProperties:false`) | Lỗi (`AccessProblem`) |
| --- | --- | --- | --- | --- |
| `portalScopedAccessEligibilityGetV1` | `GET /api/admin/profile-access/v2/eligibility` | `portal.self-eligibility.v1` | `workspace_id`, `environment` (paper/sandbox/live), `resource_kind` (8 giá trị), `resource_id`, `actions` = **một** chuỗi CSV 1–16 hành động duy nhất, không khoảng trắng, không lặp khóa (`style: form, explode: false`) | 400, 401, 403, 404, 409, 503 |
| `portalScopedAccessSelfNavigationGetV1` | `GET /api/admin/profile-access/v2/self-navigation` | `portal.self-navigation.v1` | `workspace_id`, `environment` | cùng bộ |
| `executionCapitalCommandStatusV1` (+ collection, reconcile, `WorkflowCapital.status`) | `GET /api/v1/execution/capital-commands/{id}` … | `portal.execution.command-status.v1` | không đổi | không đổi |
| `executionPendingControlStatusV1` (+ submit, reconcile) | `GET /api/v1/execution/pending-recalls/{id}` … | `portal.execution.pending-recall-status.v1` | không đổi | không đổi |

Header 200 bắt buộc `Cache-Control: private, no-store` (đã gắn vào `session.guard.ts` cho hai route tự xem). Quyền: chỉ cần session; membership workspace hiện hành bắt buộc, **không có ngoại lệ owner** (`assertOwnMember`: không phải thành viên → 404 `ACCESS_RESOURCE_NOT_FOUND`). Mã lỗi đọc được từ mã nguồn (schema để mở): 400 `ACCESS_INPUT_INVALID`, 403 `CURRENT_ACTOR_AUTHORITY_REQUIRED`, 404 `ACCESS_RESOURCE_NOT_FOUND`, 409 `ACCESS_RETRY_REQUIRED`, 503 `ACCESS_SCOPE_LIMIT_EXCEEDED`/`POLICY_PENDING`.

## 2. Trường

### 2.1 `AccessEligibility` (18 lá; FE đọc 18/18)

| Trường | Kiểu / từ vựng | Ghi chú FE |
| --- | --- | --- |
| `schema_version`, `current_only: true`, `advisory_only: true` | hằng | hằng kiểu hóa trong reader, không phải cờ |
| `workspace_id`, `environment`, `resource{kind,id}` | echo của câu hỏi | server cũng giới hạn ≤256 byte UTF-8 + UTF-16 hợp lệ; reader giữ cả hai (chặt hơn schema) và có `eligibilityAnswers()` để kiểm "đúng câu hỏi" |
| `actions[1..16]` mỗi hàng 11 trường | `action` (28 tên) · `permission` ALLOWED/UNAVAILABLE · `reason_class` = `public_copy_key` (5 từ) · `grant_ref` (id grant **của chính người gọi**, hoặc null) · `authority_mode` VERSIONED_CURRENT/LEGACY_COMPATIBILITY/APP_ONLY/NOT_ESTABLISHED · `step_up_required` true/false/null · `family_check` (8) · `step_up_freshness`/`challenge_availability`/`command_readiness` = hằng `NOT_CHECKED` | Schema mã hóa **toàn bộ** quan hệ chéo: 28 khối `if/then` (action → family + step-up), permission → reason/grant/authority, copy key = reason, mỗi action tối đa một hàng. Bảng: 13 action `step_up=false`, 11 `true`, 4 (`governance.*.decide`) `null` = "plan quyết", reader giữ `null`, không đổi thành `false` |

Nghĩa: `ALLOWED` = "người gọi đang có grant hiện hành cho action trên resource này". **Không** nói entity tồn tại, family/nguồn/field đã qualify, step-up còn tươi, challenge có sẵn, hay lệnh sẵn sàng. Mô tả schema: "Not a permit or TS activation".

### 2.2 `AccessSelfNavigation` (18 lá; FE đọc 18/18)

| Trường | Kiểu / từ vựng | Ghi chú FE |
| --- | --- | --- |
| `schema_version`, `current_only`, `advisory_only` | hằng | như trên |
| `workspace_id`, `environment` | echo | `navigationAnswers()` |
| `current_read_mode` | LEGACY_COMPATIBILITY / SCOPED_V2 / NOT_ESTABLISHED | metadata định tuyến reader của Core, **không phải grant**; `authority_mode=SCOPED_CURRENT` **không phải** `SCOPED_V2` (Codex nhấn mạnh trong `manager-intake`) |
| `features[4]` đúng thứ tự | `EXECUTION_PORTFOLIOS`, `EXECUTION_ACCOUNTS_BINDINGS`, `EXECUTION_OPERATIONS`, `EXECUTION_BLOTTER`; mỗi mục `state` ENTERABLE/HIDDEN, `authority_mode` SCOPED_CURRENT/APP_ONLY/NOT_ESTABLISHED (HIDDEN ⇔ NOT_ESTABLISHED; Operations không bao giờ APP_ONLY), bốn hằng `family_check/source_readiness/field_readiness/command_readiness = NOT_CHECKED` | không có id đích, digest, grant của người khác, bí danh capability |
| `self_entry` | `{feature: PROFILE_ACCESS, mode: SELF_ONLY, permission: ALLOWED, route: null, consumer_state: AWAITING_CONSUMER_ROUTER}` — **toàn hằng** | không mang quyết định nào; FE là router |

Từ mã nguồn `projectNavigation` (đọc, không chạy): PORTFOLIOS ← `portfolio.read|read_restricted|discover_linked` trên PORTFOLIO; ACCOUNTS_BINDINGS ← `account.read` (ACCOUNT) hoặc `binding.read` (BINDING); OPERATIONS ← `audit.read` (ACCOUNT/PORTFOLIO/DEPLOYMENT, cần TS-accepted + current audit read); **BLOTTER ← `alpha.read`** (ALPHA/ALPHA_VERSION/DEPLOYMENT). `APP_ONLY` = grant miền Manager do server cấu hình (`serverProfileId`), chỉ cho ba mục không phải Operations. Giới hạn công việc: ≤2 000 resource ứng viên, ≤20 000 lần thử, ≤10 000 grant, ≤64 principal; vượt → **503 `ACCESS_SCOPE_LIMIT_EXCEEDED`**, không trả một phần.

### 2.3 Status phục vụ có `currency`

| | `CommandStatus` (capital) | `PendingControlStatus` |
| --- | --- | --- |
| Trường mới | `currency` (bắt buộc, cấp trên cùng) | `currency` (bắt buộc, cấp trên cùng) |
| Ý nghĩa | **Một** đơn vị cho cả status, sao từ intent gốc bất biến sau khi server xác thực lại. Không phải báo giá, không đoán từ receipt, không mặc định USD. Status lưu cũ không có `currency` và **không** được phục vụ trực tiếp | giống |
| Ngữ pháp | text PM: 1–512 ký tự, ≤512 byte UTF-8, không điều khiển ASCII, không khoảng trắng đầu/cuối kiểu Python (`USDT`, `BTC`, `usdt`, `USD Coin` đều hợp lệ) | giống |
| Lá (FE đọc) | 24/24 (13 cấp trên + resource 2 + business 4 + amounts 5) | 39/39 (17 + resource 2 + business 3 + amounts 5 + receipt 12; trước đây 38 lá, +1 là `currency`) |
| Fixture | `execution-command-currency` (`stored_status` vs `public_status`), 9 status trong `execution-workflows`, 1 trong collection, 1 trong capital-workflow | `execution-pending-control-currency` (8 status) |

`stored_status` = `public_status` bỏ `currency` (đã kiểm bằng test). Cả schema (`$.currency: required`) lẫn reader đều từ chối bản cũ.

## 3. Conformance (đo thật)

| Phép đo | Kết quả |
| --- | --- |
| L0, schema qua `validateAgainst`: 2 eligibility + 4 navigation + `examples` của hai schema | **8/8 hợp lệ**, reader đọc cả 8 |
| L0, status: `public_status`, 8 pending-control, 11 capital nhúng | **20/20 hợp lệ** và đọc được; `stored_status` + 8 bản pending bỏ `currency` → schema từ chối đúng `$.currency: required`, reader `null` |
| Từ vựng reader vs enum schema | so từng chữ: 10 tập ở access (28 action, 8 family, 5 reason, 4 authority, 4 feature, 2 state, 3 nav authority, 3 read mode, maxItems…) và 20 tập ở status (8 operation capital, 7 business state, 6 pending state, 5 source operation, delivery/projection/venue/next_action/authority, khóa amounts và versions…): **khớp** |
| Bảng action → family/step-up | so với 28 khối `if/then` của schema: **khớp** (test sẽ đỏ nếu schema thêm action) |
| L1 hàng eligibility, pairwise 8 trục (23 040 tổ hợp, 50 trạng thái phủ 431/431 cặp) | reader nhận ⇔ schema hợp lệ, **0 lệch** (gồm cả tổ hợp mâu thuẫn) |
| L1 permission×reason×copy×grant×authority (160) | khớp bảng viết tay từ câu chữ hợp đồng **và** schema (7 ô hợp lệ) |
| L1 navigation: read mode (3) × trạng thái của 4 feature (3⁴) = 243; mọi thứ tự 4 feature = 24 | chỉ thứ tự gốc và "Operations ≠ APP_ONLY" hợp lệ; `current_read_mode` không đổi tập ENTERABLE |
| L1 pending: 2 160 tổ hợp delivery×state×applied×next×amounts×receipt×blockers | khớp oracle viết tay **và** schema (14 ô hợp lệ) |
| L1 pending: state × 12 dạng amounts (60) | schema nhận **60/60**, reader nhận 11: phần reader chặt hơn là đúng các bất biến runtime mà schema không nói được (partition `requested = applied+pending+cancelled+rejected` bằng BigInt, bảng state×partition của `assertStatePartition`) |
| L1 capital: 8 operation × 7 state × 5 delivery × amounts × revision = 1 680 | **tất cả hợp lệ, tất cả đọc được**: hợp đồng capital không có quy tắc chéo, reader không bịa ra quy tắc (không tính tổng, không so sánh) |
| L1 currency 28 dạng × 2 status; counter 24 dạng; decimal 22 dạng × 2 | reader không bao giờ lỏng hơn schema; chặt hơn đúng ở các điểm ở bảng 3.1 |
| L2 | 16 hàng eligibility độ rộng tối đa 0,3 ms; pending-control rộng nhất (128 blocker × 512 byte, 68 KiB) 1,2 ms; 2 000 lần đọc: eligibility 63 ms, navigation 11 ms, capital 37 ms, pending 85 ms (ngân sách 600 ms) |
| L3 âm: eligibility 367 ca, navigation 385, capital 602, pending 1 021 | reader nhận **0/340, 0/361, 0/566, 0/985** payload sai schema; không throw, không rò probe, prototype sạch |

### 3.1 Reader chặt hơn schema (có chủ đích, có test)

| Điểm | Lý do |
| --- | --- |
| text chỉ khoảng trắng; ký tự zero-width/bidi/C1 (`U+200B-200F`, `202A-202E`, `2060-2064`, `2066-2069`, `061C`, `180E`, `FEFF`) trong `workspace_id`, `resource.id`, `grant_ref`, `currency`, mọi id/blocker | schema chỉ cấm `U+0000-001F`, `007F` (L-1 của F8b **vẫn còn**). Cùng tập với bản `accessEffective.ts` đang được harden. Từ chối nguyên status, không làm sạch |
| selector >256 byte UTF-8 hoặc surrogate lẻ; `currency` >512 byte | schema đếm codepoint, server đếm byte |
| decimal >28 chữ số thập phân | `readDecimal` của boundary (từ chối nguyên giá trị, không làm tròn) |
| `business.revision` > int64 | schema capital cho 19 chữ số (tới 9 999 999 999 999 999 999), server `pmCounter` dừng ở int64 (**DEFECT CC-2**) |
| partition, state×partition, `updated ≥ created` (pending) | schema không nói được; server thực thi |
| `created/updated_at_ms` | `readUtcEpochMs` hẹp hơn `2^53-1` (như mọi reader V2) |

## 4. Đóng / còn mở

| Mục | Trước | Sau `e19ad906` (đề xuất) | Còn lại |
| --- | --- | --- | --- |
| **FE-015** lý do nút tắt (Rail, Account, Access, Operations dock, `laneModel` stepUp) | 403 trơ, không có `reason_class` | **Đóng một phần**: `reason_class`/`public_copy_key` (4 lý do + "tiếp tục kiểm family"), `grant_ref`, `step_up_required`, `family_check` cho 28 action trên **một** resource | Không đóng: lý do preview `allowed:false`, step-up còn tươi hay không, challenge, nguồn/field đã qualify, command readiness — tất cả `NOT_CHECKED` (xem FE-060 đề xuất) |
| **FE-037** tên capability nav | tên tạm `execution.*` | **Đóng một phần**: 4/4 tên nav có projection thay thế (bảng §8) | Chưa đóng: Overview/Alpha Fleet/Approvals không nằm trong projection (Approvals vẫn theo `governance.*` thật); `execution.accounts.manage` (`account/model.ts:79`) không có tương ứng; thiếu thời điểm/hạn hiệu lực; môi trường (FE-058 đề xuất) |
| **FE-038** Profile & Access tự xem | chưa có | `self_entry` toàn hằng, `route: null`: **không mang thông tin để tiêu thụ**. FE đã có "My access" ở `ContextBar` và rule `PROFILE_ACCESS` không `needs` | Phần còn là registry: `PROFILE_ACCESS.permissions = [administration.profile_access.manage]` ở registry rev 7 — cần Codex xác nhận người không phải admin vẫn được liệt kê (câu hỏi Q4) |
| **FE-039** ẩn `APPROVALS` cũ | — | registry rev 7 thêm `navigation.scoped_v2_replacement {feature_id: EXECUTION_APPROVALS, read_mode: SCOPED_V2}` cho `APPROVALS`; điều kiện ẩn: shell V2 bật **và** replacement hiển thị **và** `current_read_mode == SCOPED_V2` cùng workspace (thiếu/không rõ thì giữ mục cũ) | FE chưa đọc trường này (chỉ `execution.test.tsx` nhắc). `current_read_mode` là đầu vào duy nhất cho điều kiện thứ ba → liên quan trực tiếp tới reader nav |
| **Pending-control R-2** (thiếu `currency`) | MAJOR | **Phần (a) ĐÓNG**: `PendingControlStatus.currency` (và `CommandStatus.currency`) bắt buộc, đã xác thực với intent gốc | (b) preview/prediction vẫn không có `currency` — chấp nhận được vì client đang giữ intent (hạ xuống NOTE); (c) **`recipient_account_id` vẫn thiếu** trên status khi `resource.kind=DEPLOYMENT` (FE-063) |
| **Pending-control R-1** (đầu vào không khám phá được) | MAJOR | **Chưa đóng.** Có một cải thiện nhỏ: sau khi đã có một status, `original_recall_id`, `currency` và `receipt.versions` là đủ để soạn lệnh nối tiếp (APPLY → CANCEL) mà không gõ tay | Lệnh đầu tiên vẫn cần khám phá recall còn pending + 5 counter (FE-062) |
| **F8-08** (currency trên status) | OPEN | **Đóng** cho status phục vụ | — |

## 5. Rủi ro

| # | Rủi ro | Giảm thiểu |
| --- | --- | --- |
| RK-1 | **Nav projection thành thẩm quyền.** ENTERABLE bị dùng để bật dữ liệu/nút. Hôm nay các token `V2_CAPABILITY` còn quyết định nội dung: `alpha/index.tsx:113-114` (sliceOnly), `blotter/index.tsx:149`, `overview/index.tsx:122` (fundWide), `portfolios/portfolio/index.tsx:106-107` | Dùng projection **chỉ** cho menu/command bar (courtesy). Mọi màn vẫn nhận từ chối của chính API của nó và hiển thị `denied`, không để trống. Không bao giờ dùng ENTERABLE để bật mutation |
| RK-2 | **Eligibility "ALLOWED" bị đọc là "được làm".** | Nút chỉ được bật tới mức **mở preview**; submit chỉ sau preview `allowed:true` + step-up + digest. Hiển thị `authority_mode` bằng chữ, không in enum. Bốn hằng `NOT_CHECKED` là kiểu `unchecked` trong reader nên không thể in thành "passed" |
| RK-3 | **Hết hạn không biết.** Cả hai body không có `observed_at_ms`/`valid_until_ms`/revision, dù server tính `projectionDeadline` nội bộ | Không lưu ngoài bộ nhớ (no-store; không localStorage). Khóa theo (workspace, env, session). Lấy lại khi mount, đổi env, quay lại tab sau >60 s, sau 409 `ACCESS_RETRY_REQUIRED` (thử lại một lần). Không in "as of" (FE-057 đề xuất) |
| RK-4 | **Môi trường.** Projection theo từng `environment`, rail V2 không gắn với một env | Hỏi Codex/Bobby (Q2) trước khi nối: chọn env của ContextBar, hay hợp của ba lần gọi |
| RK-5 | **503 khi quản lý nhiều resource** (ngưỡng ở §2.2) làm rail rỗng | Phân biệt `unavailable` (503/mạng) với `hidden` (200, HIDDEN). Rail hiện "Navigation unavailable", không phải "no access"; không tự mở thêm mục |
| RK-6 | **N+1 trên danh sách.** Eligibility 1 resource/lần | Dùng ở trang một resource (Rail Portfolio, Account 360): ≤16 action/lần. Danh sách nhiều hàng không dùng được (FE-059 đề xuất) |
| RK-7 | **Chủ sở hữu/admin không là thành viên workspace → 404** (không có ngoại lệ owner) | Hiển thị đúng "not a member of this workspace", không giả định quyền admin |
| RK-8 | **`current_read_mode` dùng sai** làm ẩn mục Approvals cũ khi chưa đủ ba điều kiện FE-039 → mất lối vào | Một hàm duy nhất `legacyApprovalsSuppressed(nav, shell, registry)` kiểm đủ ba điều kiện; thiếu một thì giữ mục cũ |
| RK-9 | **`currency` là text PM mở (≤512 byte)** in cạnh mọi số tiền: tràn layout và giả mạo | Reader từ chối bidi/zero-width. UI: cắt hiển thị ở nhãn đơn vị (không cắt số), `title` giữ nguyên; luôn render escaped. Xin ngữ pháp hữu hạn (FE-065) |
| RK-10 | Status cũ (không `currency`) lọt tới FE do triển khai lệch | Reader từ chối nguyên status: màn phải nói "status unavailable", không hiện số không có đơn vị. Chỉ nối reader khi server phục vụ schema mới |
| RK-11 | `authority: TEST_ONLY` | Hiển thị là dữ liệu tổng hợp; không bao giờ coi là `OWNER_VERIFIED` |

## 6. Phát hiện và yêu cầu (ELP2-REV, severity theo §10.3)

| ID | Sev | Quan sát → hệ quả → đề xuất nhỏ nhất |
| --- | --- | --- |
| S-1 | MAJOR (cho việc nối nav) | Cả hai projection không có thời điểm quan sát, hạn hiệu lực hay revision → FE không biết khi nào phải hỏi lại → thêm `observed_at_ms` + `valid_until_ms` (server đã tính `projectionDeadline`). FE-057 |
| S-2 | MAJOR (cho việc nối nav) | `features` chỉ có 4 trên 7 mục rail; Approvals/Alpha Fleet/Overview không nằm trong; BLOTTER suy từ `alpha.read` (rộng hơn "blotter"); `execution.accounts.manage` không có tương ứng → xác nhận: Approvals tiếp tục theo `governance.*` của session, BLOTTER ⇐ `alpha.read` là chủ ý, và tên cho quản trị account. FE-058 |
| S-3 | MINOR | Projection theo từng env nhưng shell chưa gắn env → nêu cách dùng (env ngữ cảnh hay hợp). FE-058 |
| S-4 | MINOR | **DEFECT SE-1** — bảng "action hợp lệ với `resource.kind` nào" (`RULES[action].kinds` trong `self-eligibility.ts`) không nằm trong schema: schema nhận `portfolio.read` ALLOWED trên ACCOUNT, và `ACTION_TARGET_UNSUPPORTED` trên PORTFOLIO — hai cặp server không bao giờ sinh. Đề xuất: đưa `kinds` vào các khối `if/then` hiện có. Hai `it.fails` ghim hành vi |
| S-5 | MINOR | Không có dạng nhiều resource → danh sách phải N lần gọi → xin quyết định "không" hoặc dạng có giới hạn. FE-059 |
| S-6 | MINOR | `AccessProblem.error.code` mở hoàn toàn (như L-3 của F8b); FE cần enum đóng + lớp thử lại (409 `ACCESS_RETRY_REQUIRED` = thử lại; 503 `ACCESS_SCOPE_LIMIT_EXCEEDED` = không). FE-061 |
| S-7 | MINOR | `step_up_freshness`, `challenge_availability`, `command_readiness` là hằng `NOT_CHECKED` ở mọi hàng → không có cách biết trước khi bấm rằng cần step-up ngay. FE-060 |
| S-8 | MINOR | **DEFECT CC-1** — `execution-trusted-commands.synthetic.valid.json#ack_only` vẫn là status cũ (không `currency`) trong khi schema phục vụ yêu cầu `currency`; test của Codex tự thay bằng `command-currency#public_status` (`packages/contracts/test/execution-operation-reader.spec.ts:26`). Xóa hoặc đổi tên thành bản lưu |
| S-9 | MINOR | **DEFECT CC-2** — `CommandStatus.business.revision` pattern 19 chữ số nhận quá int64 mà server từ chối; `PendingControlVersions` thì đã đúng int64. Đồng bộ pattern |
| S-10 | MINOR | `currency` là text PM mở: không ràng buộc ký hiệu tiền, vẫn nhận bidi/zero-width (L-1 vẫn mở). Hợp đồng cũ của FE (`readExactDecimal`) dùng `^[A-Z]{3,12}$`. Xin ngữ pháp hữu hạn trên intent và status. FE-065 |
| S-11 | MAJOR (còn mở từ F8b) | R-1 (khám phá recall còn pending + versions) và R-2(c) (`recipient_account_id`) chưa được giao. FE-062, FE-063 |
| S-12 | NOTE | `self_entry` toàn hằng, `public_copy_key` luôn bằng `reason_class`, hằng `current_only/advisory_only`: dư thừa nhưng vô hại; FE-038 phần còn lại là registry (Q4) |
| S-13 | NOTE | **DEFECT CC-3** — status lưu và status phục vụ dùng chung `schema_version`; chỉ `currency` phân biệt. Cân nhắc `.v2` nếu bản lưu có thể tới trình duyệt (không được) |
| S-14 | NOTE | Terminal PASS của hook cho `e19ad906` không có trong bằng chứng đã đọc (mục cuối `manager-intake` là "NOT_STARTED, đợi làn nặng rảnh" lúc 22:20Z; commit 22:29Z tự ghi "Verification: R3"). Cùng loại R-3 của F8b |
| S-15 | NOTE tích cực | Schema mã hóa gần hết bất biến (28 khối `if/then`, `prefixItems` cho thứ tự feature, `maxContains` cho trùng action), Zod server phản chiếu đúng, hằng `NOT_CHECKED`/`advisory_only` nói thẳng những gì **không** được kiểm. Không lộ grant người khác, id đích, digest hay alias capability. `currency` được xác thực với intent gốc, không đoán |

## 7. Verdict đề xuất

| Hợp đồng | Verdict | Lý do |
| --- | --- | --- |
| `portal.self-eligibility.v1` | **ACCEPTED** (đọc) | Khớp schema 100% trên mọi phép đo; chặt ở những chỗ nguy hiểm; hạn chế đã được tự khai (NOT_CHECKED). Yêu cầu S-4…S-7 không chặn reader. Nối vào Rail cần UXM giao + FE-015 copy được duyệt |
| `portal.self-navigation.v1` | **CHANGES_REQUESTED** (không BLOCKER) | Reader đọc được ngay, nhưng **chưa nên thay `V2_CAPABILITY`** khi chưa có S-1 (hạn/thời điểm), S-2 (4/7 mục, tên manage), S-3 (env). Cần xác nhận Bobby/Codex rằng projection thay tên tạm (Q1) |
| `CommandStatus.currency` + `PendingControlStatus.currency` | **ACCEPTED** | Đóng R-2(a)/F8-08; reader từ chối bản cũ, mỗi số tiền mang đơn vị. S-8, S-9, S-10 là chỉnh nhỏ; R-1 và R-2(c) vẫn mở (S-11) |

## 8. FE sẽ đổi gì (khi được xác nhận) và tên tạm nào bị thay

**Chưa nối gì trong lượt này.** Reader đã sẵn: `v2/readers/accessSelf.ts` (`readAccessEligibility`, `readAccessSelfNavigation`, `accessEligibilityUrl`, `accessSelfNavigationUrl`, `eligibilityAnswers`, `navigationAnswers`, `enterableSelfNavFeatures`, `selfNavItem`) và `v2/readers/commandCurrency.ts` (`readCommandStatusV1`, `readPendingControlStatusV1`).

| Tên tạm trong `roleNav.ts` `V2_CAPABILITY` | Bị thay bởi | Ghi chú |
| --- | --- | --- |
| `portfoliosRead` = `execution.portfolios.read` (dòng 35; dùng tại 88, 220, 236, 242 và 4 màn) | `EXECUTION_PORTFOLIOS` ENTERABLE | |
| `accountsRead` = `execution.accounts.read` (36) | `EXECUTION_ACCOUNTS_BINDINGS` ENTERABLE | |
| `operationsRead` = `execution.operations.read` (37) | `EXECUTION_OPERATIONS` ENTERABLE (chỉ SCOPED_CURRENT) | |
| `blotterRead` = `portal.execution.blotter.read` (38) | `EXECUTION_BLOTTER` ENTERABLE | suy từ `alpha.read` (S-2) |
| `governance.*` (8 tên) | **không đổi** | tên thật trong `PORTAL_CAPABILITIES` |
| `execution.accounts.manage` (`screens/account/model.ts:79`) | **không có thay thế** | DEBT-UXM07-005 còn mở (S-2) |

Các bước (mỗi bước nhỏ, theo thứ tự):

| # | Việc | File |
| --- | --- | --- |
| W1 | Hook `useSelfNavigation(workspaceId, environment)` theo mẫu `useAccessEffective`: `accessSelfNavigationUrl` → fetch cùng origin, `no-store`, `credentials` từ cookie → `readAccessSelfNavigation` → `navigationAnswers`; pha idle/loading/denied/unavailable/ready, giữ bản tốt cuối và đánh dấu stale; làm lại theo RK-3 | `v2/shell/useSelfNavigation.ts` (mới) |
| W2 | Bộ chuyển `navTokens(nav): ReadonlySet<string>`: ENTERABLE → thêm token của mục đó. **Cách A (ít đổi nhất):** `holds()`, `V2_NAV_RULES`, `V2_ROLE_PRESETS` và test giữ nguyên; token trở thành khái niệm nội bộ của FE, đổi tên khỏi `execution.*`. **Cách B (sạch hơn):** `CapabilityNeed` thêm `navFeature: SelfNavFeature`, `holds` nhận cả hai tập; 4 `needs` đổi | `v2/shell/roleNav.ts` |
| W3 | `PortalShell.tsx:69-72`: `capabilities = session ∪ navTokens`. Đang tải/lỗi → chỉ session (hành vi hôm nay, fail closed) kèm dòng "Navigation unavailable" thấy được, không im lặng | `app/PortalShell.tsx`, `v2/shell/Sidebar`/`CommandBar` |
| W4 | Tách mục đích: giữ `holds(...)` ở các vị trí màn (khoảng 10, liệt kê ở RK-1 và `compare`, `replay`, `account/model`) chỉ để ẩn tab/lối vào; **không** để quyết định dữ liệu (RK-1). Cân nhắc bỏ `permitted` ở `portfolios/index.tsx:103`, `compare/index.tsx:96`, `portfolio/index.tsx:106` để chỉ còn từ chối của API | các màn nêu trong RK-1 |
| W5 | `legacyApprovalsSuppressed()` đọc `scoped_v2_replacement` (registry rev 7) + `current_read_mode`; chỉ khi đủ ba điều kiện FE-039 | `v2/shell/roleNav.ts` hoặc `portal/navigation.ts` |
| W6 | Hook `useEligibility(request)` cho Rail Portfolio và Account 360: một lần/(resource, env), ≤16 action; hàng `ALLOWED` chỉ bật "Preview"; `UNAVAILABLE` hiện lý do theo bảng copy dưới. Cần danh sách action tương ứng 6 hành động của Rail từ ledger FE-015 | `v2/screens/portfolios/portfolio/Rail.tsx`, `screens/account/*` |
| W7 | `e2e/bffDoubleAccess.ts`: thêm hai route trả đúng 6 ca fixture, kiểm query chặt như server (năm khóa, `actions` CSV); nếu không, rail ở e2e luôn "unavailable" | `apps/portal/frontend/e2e/bffDoubleAccess.ts` |
| W8 | Test: `roleNav` (hai tập), hook (5 pha, stale, 409 thử lại một lần), RK-1 (không màn nào đổi dữ liệu theo nav) | `v2/shell/*.test.*` |

Copy đề xuất cho `reason_class` (UI tiếng Anh, **chờ Bobby duyệt**): `NO_CURRENT_PERMISSION` "You don't have access to this action here" · `POLICY_PENDING` "Access policy isn't active for your workspace yet" · `FIELD_POLICY_PENDING` "Restricted view isn't available yet" · `ACTION_TARGET_UNSUPPORTED` "Not available for this kind of item" · `FAMILY_CHECK_REQUIRED` (ALLOWED) bật "Preview", không có chữ nào hứa lệnh sẽ chạy.

## 9. Câu hỏi cho Codex / Bobby (cần trả lời trước W1–W3)

| # | Câu hỏi | Ai |
| --- | --- | --- |
| Q1 | Projection thay hẳn bốn tên tạm `execution.*` trong `V2_CAPABILITY` (FE-037) — đồng ý? Các token còn lại (`governance.*`) giữ nguyên | Bobby + Codex |
| Q2 | Rail V2 dùng env nào để hỏi: env của ContextBar, hay hợp ba env? Cần cách dùng được ghi trong hợp đồng | Codex |
| Q3 | BLOTTER ⇐ `alpha.read` có chủ ý? Approvals/Alpha Fleet/Overview có vào projection không, hay mãi theo session capabilities? Tên cho quản trị account? | Codex |
| Q4 | Registry rev 7 có liệt kê `PROFILE_ACCESS` cho người không có `administration.profile_access.manage` không (FE-038)? | Codex |
| Q5 | Có đồng ý thêm `observed_at_ms` + `valid_until_ms` (S-1)? | Codex |
| Q6 | Copy trong §8 | Bobby |

## 10. FE-id đề xuất mới (không sửa ledger; FE-056 đã được `/operator-tasks` dùng, nên đánh lại R-5 của F8b từ FE-057)

| Id | P | Nội dung | Gốc |
| --- | --- | --- | --- |
| FE-057 | P2 | `observed_at_ms` + `valid_until_ms` (và revision nếu có) trên `portal.self-eligibility.v1` / `portal.self-navigation.v1` | S-1 |
| FE-058 | P2 | Phạm vi và ngữ nghĩa của nav projection: mục thiếu (Approvals/Alpha Fleet/Overview) hoặc xác nhận "theo session", dùng env nào, tên cho quản trị account, BLOTTER⇐`alpha.read` | S-2, S-3 (thu hẹp FE-037) |
| FE-059 | P3 | Eligibility cho danh sách: dạng nhiều resource có giới hạn hoặc quyết định "không" | S-5 |
| FE-060 | P3 | Đọc step-up còn tươi / challenge trước khi bấm (thay hằng `NOT_CHECKED` bằng đọc thật qua family) | S-7 (nuôi FE-015, `laneModel` stepUp) |
| FE-061 | P3 | Từ vựng đóng cho `AccessProblem.error.code` + lớp thử lại; cùng việc `PendingControlProblem` (L-3 của F8b) | S-6, = R-5(d) F8b |
| FE-062 | P2 | Khám phá recall còn pending: `original_recall_id`, `currency`, `pending`, `versions` trước khi soạn | R-1, = R-5(a) F8b |
| FE-063 | P3 | `recipient_account_id` trên `PendingControlStatus` khi `resource.kind=DEPLOYMENT` | R-2(c), = R-5(b) F8b rút gọn |
| FE-065 | P3 | Ngữ pháp hữu hạn cho `currency` (và cấm bidi/zero-width trên các text PM) | S-10, L-1 |

(FE-064 để trống có chủ ý: dành cho hàng Board "`latest_operation` NOT_PUBLISHED", đó là hàng Board, không phải yêu cầu Codex.) Nợ debt đề xuất: DEBT cho S-8/S-9 (fixture/pattern của Codex) chỉ là theo dõi, không phải nợ FE.

## 11. Đề xuất sửa Source Truth Board (chưa sửa)

| Hàng | Cột | Giá trị đề xuất |
| --- | --- | --- |
| 6 Access effective / self | FE consumer / Fixture-reader | thêm `v2/readers/accessSelf.ts` (eligibility + navigation) · L0 6/6 + examples 2/2 · reader **chưa nối màn** · consumer receipt: eligibility ACCEPTED, navigation CHANGES_REQUESTED (đề xuất) |
| 6 | Ô "Not published" | FE-015 còn: step-up/challenge/family/command readiness (`NOT_CHECKED`); FE-037: 4/4 thay được, thiếu hạn/env/coverage; FE-038: registry |
| 12 Pending recall | FE consumer / Fixture-reader | `v2/readers/commandCurrency.ts` đọc `PendingControlStatus` (8/8) và `CommandStatus` (11/11 + collection); R-2(a) đóng; R-1, R-2(c) mở |
| mục "Hợp đồng mới chưa có reader FE" | | xóa `self-eligibility`, `self-navigation`, `CommandStatus.currency` khỏi danh sách chưa đọc |

## 12. Receipt FE (tầng R1)

| Hạng mục | Kết quả |
| --- | --- |
| File mới | `v2/readers/accessSelf.ts` 459 · `accessSelf.test.ts` 302 · `accessSelf.conformance.test.ts` 676 · `commandCurrency.ts` 486 · `commandCurrency.test.ts` 264 · `commandCurrency.conformance.test.ts` 722 (tổng 2 909 dòng, 0 file sửa) |
| Test mới | accessSelf 75 + 2 067 (2 `it.fails`: SE-1a, SE-1b) · commandCurrency 78 + 5 726 (2 `it.fails`: CC-1, CC-2) = **7 946 test, 4 expected-fail, 0 đỏ** |
| Gate | vitest focused trên `readers/ testkit/ boundary* v2Hygiene` 17 file: 25 570 passed + 4 expected fail; `tsc --noEmit` exit 0; `scripts/refresh-release-integrity-ledgers.sh --check` exit 0 (`changed:false`, không cần `--write`) |
| Không chạy | Playwright, build, baseline ảnh (không chạm pixel), test backend của Codex |
