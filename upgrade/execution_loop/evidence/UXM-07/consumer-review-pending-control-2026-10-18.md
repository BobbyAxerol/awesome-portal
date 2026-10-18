# UXM-07 — Consumer review F8 (vòng 2): pending-recall control, 2026-10-18

Người viết: Claude (subagent F8b, chỉ đọc code; đây là file repo duy nhất F8b ghi). Review là **ghi nhận, không phải ACK** (Rules §10.3): ACK chỉ khi Bobby giao UXM tương ứng. Mọi verdict là **đề xuất**. Thay thế mục §6 và dòng W1 "NOT_REVIEWABLE" của [consumer-review-2026-10-18.md](consumer-review-2026-10-18.md) (gói khi đó là WIP chưa commit).

## 0. Pin, phương pháp, giới hạn

| Mục | Giá trị |
| --- | --- |
| Producer | `5291a80f` "feat(execution): add source-dark durable pending recall controls" (Codex; FE `claude/fe-parity` đã rebase lên, đọc từ working tree) |
| SHA-256 | fixture `4ef719b5…8af8d0` · openapi `894a3aa6…d90320` · generated d.ts `4901a1da…9534f3` |
| Lane | fixture ghi `lane: TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT`, `runtime_qualified: false`; trust mặc định `unqualifiedPendingControlTrust` (`prepare → null`); `authority` trong status là `OWNER_VERIFIED \| TEST_ONLY`. **SOURCE_DARK + SYNTHETIC_ONLY**, không có mẫu runtime |
| Reader FE có sẵn | **Không có** (grep `pending-recall` trong `v2/` = 0). Dùng thứ FE đã có: `testkit/loadCanonical` (fixture L0), `testkit/schema.validateAgainst`, `testkit/negative` (L3), `v2/boundary.readDecimal/readAsOf` |
| Script scratch | `/tmp/claude-1000/-home-bobby/e9193882-3547-4d96-bd79-71735ca75103/scratchpad/f8b/` : `pending.f8b.test.ts`, `vitest.f8b.config.mts`, `ajv2.mjs`, `pending.nodisc.openapi.json`, `out.json` |
| Không làm | Không chạy test của Codex (`contracts/test/execution-pending-control.spec.ts`, `elp207-*`): số liệu 34/34, 42/42, 130/130 trong ELP2-07 là của Codex, chưa kiểm lại. Không SSH nguồn. Không full suite/Playwright/build |
| Lưu ý receipt | `evidence/ELP2-07/pending-control.md` trong commit **kết thúc ở "First normal R3 terminal — FAIL_OR_INCOMPLETE; retake pending"**, trong khi commit đã hạ cánh. Terminal PASS của hook không có trong repo → xin Codex ghi (R-3 dưới) |

## 1. Hợp đồng

| operationId | Route | Body → 200 | Ghi chú FE |
| --- | --- | --- | --- |
| `executionPendingControlPreviewV1` | `POST /api/v1/execution/pending-recalls/preview` | `PendingControlIntent` → `PendingControlPreview` | rollback-only; headers `x-portal-idempotency-key` (= `business_payload.idempotency_key`), `Origin`, `x-portal-csrf` |
| `executionPendingControlSubmitV1` | `POST /api/v1/execution/pending-recalls` | `PendingControlSubmit {intent, preview_digest}` → `PendingControlStatus` | cùng header; replay cùng key trả status đã lưu **không** cần digest còn đúng |
| `executionPendingControlStatusV1` | `GET /api/v1/execution/pending-recalls/{id}?workspace_id=` | → `PendingControlStatus` | `{id}` = `ecm_<32 hex>` do **server** sinh (UUID ngẫu nhiên), FE không tính trước được |
| `executionPendingControlReconcileV1` | `POST /api/v1/execution/pending-recalls/{id}/reconcile` | `PendingControlQuery {workspace_id}` → `PendingControlStatus` | header idempotency của **request**, không thay key gốc; không bao giờ gửi lại APPLY |

- Cả bốn: `Cache-Control: private, no-store`; lỗi 400/401/403/404/409/503 dùng `PendingControlProblem`; 404 gộp unknown/hidden/sai workspace.
- **Không có list/collection** và không có tra theo `idempotency_key` hay theo resource (`GET /pending-recalls` không tồn tại; test của Codex khẳng định). Cũng không nằm trong `CommandCollection`.
- schema_version: `portal.execution.pending-recall-intent.v1` · `…-preview.v1` · `…-status.v1`; body nguồn `pma.operator-control.v1`.
- Field published (lá, theo fixture): intent 18-20 · preview 23 (allowed) · status 38 (đã có receipt) / 23 (UNKNOWN). **FE consumed = 0** (chưa có reader).
- Quyền: preview/submit cần `capital.apply_pending` **hoặc** `capital.cancel_remaining` (theo `operation`) chính xác, scope PORTFOLIO hoặc DEPLOYMENT_ACCOUNT, grant TS-accepted hiện hành, DENY thắng, cầu singleton cũ bị từ chối. Status/reconcile chỉ cần `audit.read` riêng (+ membership đích hiện hành), không cần grant ghi.

## 2. Conformance (đo thật)

| Phép đo | Kết quả |
| --- | --- |
| L0: 15 mẫu fixture × `validateAgainst` (OpenAPI `components/schemas/*`) | **15/15 PASS** (intent, intent_deployment, submit, query, preview_blocked/allowed/cancel, status ×8). Hai khóa không ánh xạ: `lane`, `runtime_qualified` (metadata của file) |
| Checker thứ hai AJV 2020 (`ajv2.mjs`) | **15/15 PASS** |
| Giới hạn của testkit | `validateAgainst` **ném lỗi** trên từ khóa OpenAPI `discriminator` (có trong `PendingControlBody`). Phải bỏ `discriminator` (chỉ là chú thích, `oneOf` vẫn phân biệt bằng `recipient_kind` const) mới chạy; bản đã bỏ ở `pending.nodisc.openapi.json`. Reader thật sẽ cần cùng xử lý hoặc nạp schema từ `components` có tiền xử lý |
| `readDecimal` trên 25 giá trị `amounts` + `delta` của fixture | 26/26 đọc được (`"100"`→`100.00`, `"0"` → `zero:true`) |
| Decimal hợp lệ theo schema nhưng **FE từ chối** | `scale > 28` bị `readExactDecimal` loại: `"1".repeat(30)+"."+…` (len 61, 102, 121) schema nhận, `readDecimal` trả `null`. Số thật (USDT ≤18dp) không dính; nhưng cần quy ước "từ chối nguyên giá trị, hiện Not available", không cắt |
| Counter int64 | `"9007199254740993"` → `Number()` = `9007199254740992` (**mất chính xác**). Reader phải giữ chuỗi; chỉ so sánh bằng `BigInt` |
| Instant | `created_at_ms`, `expires_at_ms` qua `readAsOf` đọc được (safe integer ≤ 2^53-1; schema cho 0..9007199254740991, `readUtcEpochMs` còn cắt theo `DATE_RANGE_MS`) |

Giá trị FE phải từ chối dù schema nhận (cần trong reader, vì schema không nói được): xem bảng bất biến §5.

## 3. Quyền và mô hình capability FE

| Điểm | Quan sát | Hệ quả |
| --- | --- | --- |
| `AccessAction` | +2: `capital.apply_pending`, `capital.cancel_remaining` (enum sinh ra: 55 tên). **Chỉ** trong từ vựng V2, **không** vào `PORTAL_CAPABILITIES` hay CHECK SQL | Session `capabilities` không bao giờ mang hai tên này → `roleNav.V2_CAPABILITY`/`holds()` không dùng được để bật nút. Chỉ `AccessEffective.grants[]` (theo resource + environment + `current` + `tsAuthority`) mới nói có grant hay không |
| `readers/accessEffective.ts` | `action` là token mở (`ACTION` regex), nên 2 tên mới **không** làm vỡ reader; bảng grant in token thô (`screens/access/index.tsx:152`). `MAX_GRANTS=500` < contract 10000 (đã ghi F8) | Không cần sửa để không vỡ. Cần nhãn người đọc cho 2 tên nếu hiển thị |
| `screens/access/model.ts doRows` | chỉ có Decide ×4, Manage grants, Manage users | Hàng "Apply / cancel pending recall" không có; thêm khi có màn, lấy từ grants chứ không từ session |
| FE-015 (eligibility + lý do tắt) | preview thiếu grant → **403** `PendingControlProblem` (code mở), không có `reason_class/grant_ref/step_up_required` | **Không đóng được FE-015.** Nút phải tắt kèm "Not published (FE-015)" cho tới khi có eligibility; không đoán từ grant |
| Step-up | mô tả route nói "submit requires fresh step-up", nhưng OpenAPI **không có** header/field step-up | Câu hỏi cho Codex (R-6) |

## 4. Màn V2 có thể chứa, và ô "Not published" đóng/để mở

| Màn | Khả năng | Điều kiện / chặn |
| --- | --- | --- |
| Operations dock theo `command_id` đã biết | **Có thể**: thêm `sel=cmd:ecm_…` mở một dock "Recall control" (GET status + Reconcile). Không đi qua `OperationDock` hiện tại, vì queue V2 là grain `op_…` (F0), còn đây là `ecm_…` (FE-032 đã ghi) | cần `command_id` + `workspace_id` (lấy từ `AccessEffective.workspaceId`); `command_id` phải do client lưu từ phản hồi submit (§6.R-1) |
| Portfolios Actions rail (`Rail.tsx`) | **Chỉ hàng "Recall budget"** (mô tả sẵn "Pending until orders fill or cancel") có thể có hai hành động tiếp nối; 5 hành động còn lại (grant/target/return/lock/deploy) **không liên quan** | chặn: không đọc được `original_recall_id`, `currency`, 5 counter `expected_versions` trước khi soạn intent (R-1). Chưa có màn tạo recall (capital command, C8/C11 chưa có reader) |
| Cockpit / Approvals | Không. Lệnh, không phải approval (FE-034 Capital lane vẫn trống) | — |

| Ô "Not published" | Trạng thái sau gói này |
| --- | --- |
| FE-015 eligibility (Rail, Account, Access, Operations dock, laneModel stepUp) | **Mở** (403 chỉ là từ chối, không là lý do có cấu trúc) |
| FE-020 command preview (Rail `Preview unavailable`, ActionPane "What would change") | **Đóng một phần**: chỉ cho tiếp nối recall (Apply pending/Cancel remaining) khi source-qualified; `allowed:false`+`PENDING_CONTROL_NOT_QUALIFIED` là mặc định hôm nay → vẫn là nút tắt có lý do. Governance "what changes" (FE-030) không liên quan |
| FE-032 Operations dock "Amounts: requested, applied, pending" | **Mở, không đóng**: số `requested/applied/pending/cancelled/rejected` của gói này thuộc `ecm_` pending-recall, không phải F0 `op_…`; không gán cho hàng queue |
| FE-032 ledger (`seq/command_id/receipt_ref/state pending|applied|recall`), FE-046 | **Mở**; status có `control_receipt_id/latest_receipt_id` nhưng không có `seq` hay phân trang |
| FE-017 (tên/đơn vị metric), FE-021 audit "ai làm gì", FE-042/043 | Mở, không liên quan (status không có actor) |
| `business.receipt.latest_operation` | Ô mới, có kiểu sẵn: `{latest_operation: null, availability: NOT_PUBLISHED, reason: SOURCE_OPERATION_NOT_PUBLISHED}`. Cần hàng board + FE-id (đề xuất R-5) trước khi hiện "Not published" |

## 5. Rủi ro ngữ nghĩa đã ghi, kiểm lại với fixture + schema

| # | Rủi ro | Kết quả đo | Quy tắc cho reader/UI |
| --- | --- | --- | --- |
| 1 | `business_applied:false` ở CANCELLED, REJECTED, PARTIALLY_APPLIED_CANCELLED, **và WAITING_ENCUMBRANCE có applied>0** | đúng: chỉ APPLIED là `true`; schema ép `if state=APPLIED then true else false` | không dịch `false` thành "chưa có gì xảy ra"; hiện cả 5 amounts. WAITING không là thành công; `next_action: QUERY_SAME_INTENT` = hỏi lại, không gửi lại |
| 2 | `FAILED_BEFORE_SEND` + `business.state: UNKNOWN` | đúng: `business_applied/amounts/receipt: null`, `blockers: []`, `next_action: REVIEW_BLOCKER` | hiện "Not sent" từ `delivery`; không hiện business UNKNOWN như lỗi nghiệp vụ. Lưu ý `blockers` rỗng nhưng action là REVIEW_BLOCKER → không có gì để xem: cần copy riêng |
| 3 | Hằng `projection:"UNKNOWN"`, `venue:"NOT_APPLICABLE"`, `economic_cash_changed:false`, `physical_transfer_performed:false` kể cả APPLIED | đúng, đều là `const` | không in "synced / filled / cash moved"; nên không render thành chip trạng thái |
| 4 | Counter int64 > 2^53 | fixture dùng `"9007199254740993"`; `Number()` làm hỏng | chuỗi nguyên văn, `BigInt` để so; không `formatExact` |
| 5 | `blockers[]` mờ | mỗi mục ≤512 ký tự, ≤128 mục; **nhận được bidi U+202E và zero-width U+200B**; trùng lặp được phép | in như văn bản thô trong `<bdi>`/escape, không dịch, không suy diễn; cắt hiển thị nhưng giữ đủ trong tooltip |
| 6 | Thiếu `currency` trên amounts | **vẫn thiếu** (status/preview/prediction không có; chỉ intent có `business_payload.currency`) | sau reload không in được tiền; hiện số với nhãn "currency not published" hoặc chỉ khi client còn intent. Xem R-2 |
| 7 | Hai id receipt | `control_receipt_id` bất biến; `latest_receipt_id` tiến; `latest_operation` có thể null | hiển thị tách; `linked_operation_not_published` là mẫu canonical |
| 8 | Preview mặc định `allowed:false` | fixture `preview_blocked`: mọi trường khác null, `reason_code: PENDING_CONTROL_NOT_QUALIFIED`, HTTP 200 | nút tắt có lý do, không phải lỗi. **Nhưng** chỉ khi người gọi đã có grant; không có grant là 403, không phải `allowed:false` |
| 9 | Tên trùng: `business_payload.command_id` (id recall **gốc** của PM) vs `status.command_id` (`ecm_…` của Portal) | `status.original_recall_id` = intent `command_id` | đặt tên nội bộ khác nhau (`originalRecallId` / `commandId`) để không nhầm khi dựng URL |
| 10 | `delivery` PREPARED/SENDING | schema nhận, **fixture không có** | reader phải nhận; UI hiện "Sending…" như trạng thái trung gian, polling qua reconcile, không POST lại |

Bất biến schema **không nói được** (probe tay, schema nhận, runtime Codex từ chối): `requested = applied+pending+cancelled+rejected`; state×partition (APPLIED⇒pending=cancelled=rejected=0; CANCELLED⇒applied=pending=rejected=0; WAITING⇒pending>0; PARTIALLY⇒applied>0 và cancelled>0); `updated_at_ms ≥ created_at_ms`; `operation × state` (CANCEL_REMAINING+APPLIED, APPLY_PENDING+CANCELLED đều được nhận); `recipient_deployment_id === resource.id`; tiến trình đơn điệu `versions`. Reader FE phải tự kiểm các điều này (BigInt/decimal chuỗi) và coi vi phạm là `unsupported_shape`, không "sửa".

## 6. L3 sanity: schema có chặt không? (testkit/negative nhằm vào schema, không qua reader)

1 699 ca âm (status 813, preview 454, intent 341, submit 18, query 29, preview_blocked 30, bad-root 14 + liên quan): decimal (số JS, mũ, `-0`, `01`, 70 000 chữ số), enum (rộng-hẹp, hoa-thường), required/null, mảng, counter (số JS 2^53+1, `2^63`, `01`, `1e3`, full-width), khóa thừa, prototype-pollution, schema_version đổi. **Không ca nào lọt ở decimal, counter, enum, required, khóa thừa, maxItems, pattern digest/id.** Điểm lỏng thật (đã lọc artefact của generator):

| # | Điểm lỏng | Minh chứng | Đề nghị cho Codex |
| --- | --- | --- | --- |
| L-1 | **Bidi override U+202E và ký tự vô hình** lọt mọi trường văn bản (`blockers[]`, `reason`, `currency`, `original_recall_id`, `control_receipt_id`…), pattern chỉ cấm `\u0000-\u001f\u007f` | `"‮evil"` accepted ở status/preview/intent/query | cấm `‪-‮⁦-⁩​-‏⁠﻿` hoặc nêu rõ "FE phải escape" trong mô tả |
| L-2 | `pendingText` (workspace_id, resource.id, profile_ref, expected_policy_revision) nhận chuỗi **chỉ khoảng trắng** và khoảng trắng đầu/cuối; trường PM-source thì cấm | `"   "` accepted ở `profile_ref`, `resource.id`, `workspace_id` | cùng pattern strip-boundary như `pmText`, hoặc ghi opaque-by-design |
| L-3 | `PendingControlProblem` mở hoàn toàn: `error.code` string tự do, `message` không `maxLength`, `request_id` không pattern/length, `public_copy_key` tự do | `code:"ANYTHING"`, message 100 KB, `request_id:""` đều accepted (AJV cũng vậy) | enum đóng cho `error.code` (gồm `PENDING_CONTROL_INPUT_INVALID` mà controller phát nhưng **không có** trong `PendingControlReason` 9 mã; và mã access/CSRF/origin), `maxLength` cho message/`request_id` |
| L-4 | `blockers` không `uniqueItems` | `["x","x"]` accepted | thêm `uniqueItems` hoặc nói rõ có thể trùng |
| L-5 | `blockers` ở trạng thái UNKNOWN chỉ `maxItems:0` qua `if/then` (đã có), nhưng `FAILED_BEFORE_SEND` + `blockers:[]` + `next_action:REVIEW_BLOCKER` không có gì để xem | fixture `failed_before_send` | thêm `reason_code` (vì sao không gửi) hoặc đổi action |
| L-6 | Cross-field không biểu diễn (mục §5 cuối) | probe tay: 12 ca cross-field đều được nhận | không đòi schema; xin **fixture âm (invalid) canonical** để FE test reader từ chối đúng cùng ca với runtime của Codex |
| L-7 | `expires_at_ms: 0` và `created_at_ms: 2^53-1` nhận | probe | `minimum` có nghĩa (> 0), hoặc ghi nguồn đồng hồ |
| L-8 | Độ dài tính theo ký tự, runtime theo byte UTF-8 (đã nói trong `description`) | — | NOTE, không xin sửa; reader FE tính theo code point và chấp nhận chặt hơn |

Độ bao phủ fixture còn thiếu (L0 chưa đủ cho reader): không có `delivery` PREPARED/SENDING; không có `environment` sandbox/live; không có status `DEPLOYMENT` hoặc intent PORTFOLIO preview CANCEL cho DEPLOYMENT; chỉ một `blockers` mỗi mẫu (không ca nhiều/128); không có counter `9223372036854775807`; không có cặp trước/sau của một recall WAITING tiến triển (để test đơn điệu); không có mẫu 4xx/5xx `PendingControlProblem`; `receipt.latest_operation` `AVAILABLE` chỉ với op bằng `operation` của lệnh.

## 7. Phát hiện và yêu cầu (ELP2-REV, severity theo §10.3)

| ID | Sev | Quan sát → hệ quả → đề xuất nhỏ nhất |
| --- | --- | --- |
| R-1 | MAJOR | **Đầu vào không khám phá được.** Intent bắt buộc `business_payload.command_id` (recall gốc), `currency`, và 5 counter `expected_versions` (budget/source/parent/book/command). Không route nào publish chúng (ledger FE-046 chỉ xin `seq/command_id/receipt_ref`; không có versions). Người dùng phải gõ tay 5 chuỗi int64. Thêm đọc "recall còn pending": `original_recall_id`, `currency`, `pending`, `versions`, `resource`; hoặc cho `preview` nhận intent không versions và trả `prediction.versions` làm base. Kèm: submit mất phản hồi thì **không có `ecm_` id** để GET; đường phục hồi duy nhất là POST lại **đúng body + key** (replay) → FE phải lưu `(intent, key)` trước khi gửi; xin ghi rõ trong contract hoặc cho tra theo key |
| R-2 | MAJOR | Thiếu `currency` trên status/preview/prediction (F8-08 vẫn còn) và thiếu `recipient_account_id` khi `resource.kind=DEPLOYMENT`. Thêm `currency` (và recipient) vào `PendingControlStatus` |
| R-3 | MINOR | Receipt hook không có trong repo: `pending-control.md` kết thúc ở "FAIL_OR_INCOMPLETE… retake pending" nhưng commit đã vào. Ghi terminal PASS/log SHA, và chạy `Board hàng 12` cập nhật theo đó. Không có thì FE không tính "DELIVERED→VERIFIED" |
| R-4 | MINOR | Điểm lỏng schema L-1…L-7 (bảng §6), nhất là L-1 (bidi) và L-3 (Problem mở): FE chưa thể liệt kê mọi `error.code` để chọn copy |
| R-5 | MINOR | Xin FE-id cho: (a) đọc recall còn pending + versions (R-1), (b) `currency` + recipient trên status (R-2), (c) `latest_operation` NOT_PUBLISHED, (d) Problem vocabulary (L-3). Đề xuất FE-056…059, **chờ Bobby duyệt** trước khi tạo (theo quy ước vòng trước) |
| R-6 | NOTE | Câu hỏi: "fresh step-up" của submit đi qua kênh nào (OpenAPI không có header/field)? `expires_at_ms` của preview vs hạn digest? Reconcile có giới hạn tần suất/`Retry-After`? Có đi cùng `CommandCollection` không (câu cũ F8 còn mở) |
| R-7 | NOTE | Tích cực: hợp đồng giữ đúng các trục tách rời (delivery/business/projection/venue), UNKNOWN có `null` chứ không `0`, counter là chuỗi, id receipt tách, không có amount/URL/credential vào browser, một lỗi cố định cho 404. `discriminator` OpenAPI làm testkit ném lỗi (ghi cho DEBT testkit, không phải lỗi producer) |

## 8. Verdict đề xuất

**CHANGES_REQUESTED** (không BLOCKER). Lý do: hợp đồng đọc (preview/status/reconcile) khớp schema 15/15 và chặt ở các chỗ nguy hiểm (decimal, int64, enum, khóa thừa), nên **phần đọc ACCEPTED**; nhưng **phần ghi chưa dựng được từ FE** vì R-1 (không có nguồn cho recall gốc + 5 counter, và không phục hồi được khi mất phản hồi submit) và R-2 (không có currency), cộng R-3 (thiếu receipt hook). Không làm FE chặn: reader và dock đọc có thể dựng được ngay trên fixture.

Việc FE nhỏ nhất (đề xuất, **không viết trong lượt này**):

| Mục | Đề xuất |
| --- | --- |
| File | `apps/portal/frontend/src/execution/v2/readers/pendingControl.ts` (+ `pendingControl.test.ts`, `pendingControl.conformance.test.ts` theo mẫu `liveSourceOperations`) |
| Shape | `readPendingControlPreviewV1(raw): PendingPreview \| null` và `readPendingControlStatusV1(raw): PendingStatus \| null` (+ `PendingControlProblem` reader nhẹ). Kiểu: `amounts` là `Record<"requested"\|…, BoundaryDecimal>` hoặc `null`; `versions: Record<…, {exact: string}>` (chuỗi + so `BigInt`); `state/delivery/next_action` là union đóng; `latestOperation: {kind:"available",op}\|{kind:"not_published"}`; `receipt.ids: {control, latest}`; **không có trường `currency`** (hiện `Not published (FE-0xx)`) |
| Kiểm trong reader | schema nhận + các bất biến §5 (partition BigInt, state×partition, chrono, next_action); từ chối `schema_version` khác → `unsupported_shape` qua `dispatch.ts`; bidi/zero-width trong text → escape khi render |
| Test | L0 nạp 15 mẫu; L1 ma trận delivery×state×operation; L2 ~128 blockers; L3 `decimalCases/enumCases/requiredCases/pollutionCases`; fixture âm cho các ca cross-field ở §6 L-6 |
| Màn (sau đó, nhỏ): | dock `sel=cmd:ecm_…` trên Operations (GET + Reconcile, `DockAction` Apply/Cancel tắt "Not published (FE-015)"); chưa đụng Rail |
| Chặn thật | UXM-08/09 giao + R-1/R-2 trả lời + Source Truth hàng 12 thành `EXISTS_MOUNTED` |

## 9. Đề xuất sửa Source Truth Board hàng 12 (chưa sửa)

| Cột | Giá trị đề xuất |
| --- | --- |
| Trạng thái nguồn | giữ `SOURCE_DARK`; thay "Local C1 WIP, no final commit here" bằng "**landed `5291a80f`** (R3 hook terminal chưa có trong repo; ELP2-07 kết thúc ở retake pending); provider/mount UNKNOWN; fixture `TEST_ONLY` + `runtime_qualified=false`" |
| FE consumer | "chưa có màn; dock `sel=cmd:ecm_…` (Operations) đề xuất; Rail chỉ hàng Recall budget; **không** thêm list vì chưa có list read" |
| Fixture / reader | `execution-pending-control.synthetic.valid.json` · reader chưa có; đề xuất `v2/readers/pendingControl.ts`. Đọc mẫu thêm: "L0 15/15 testkit + 15/15 AJV; reader NONE" |
| Ô "Not published" | FE-015 (eligibility; 403 không có cấu trúc) · FE-020 một phần (tiếp nối recall) · FE-032 (không gán cho `op_`) · `latest_operation` (ô mới, FE-id chờ duyệt) · currency (R-2) · đầu vào recall/versions (R-1) |
| Đọc mẫu | `NOT_DONE` (không SSH) → ghi "fixture L0 MATCH@`5291a80f`; SYNTHETIC_ONLY, không phải mẫu nguồn" |
| Request | R-1, R-2, R-3, R-4, R-5 (FE-056…059 chờ Bobby), R-6 |
| Mở rộng gap check | thêm "chưa đọc": `execution-pending-control` (reader), và `discriminator` làm testkit `validateAgainst` ném lỗi (DEBT testkit); Consumer receipt (F8): **CHANGES_REQUESTED (đề xuất)** |
