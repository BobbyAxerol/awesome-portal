# Yêu cầu ưu tiên gửi Codex — 2026-10-19

Chủ: Claude (FE). Nguồn: bảng trạng thái FE-005…065 đọc tại tip Codex `678cf731` (đọc từ OpenAPI, schema, fixture và grep mã FE, không suy từ commit message). Sổ gốc: [FRONTEND_BACKEND_SYNC.md](../../FRONTEND_BACKEND_SYNC.md); locator chi tiết: [backend-requests.md](backend-requests.md).

## 0. Hai giới hạn áp cho cả bảng (từ Codex)
1. Mọi family Manager, Access, command đều là `SOURCE_DARK`, mount `UNKNOWN`; không dòng nào là `EXISTS_MOUNTED`. Financial normalized source vẫn `MISSING`. PM mapping cho Research Bobby trả `NO_ACTIVE_MAPPING`.
2. Chưa kiểm: normal-hook terminal của `678cf731` (`PENDING_AT_TRACKED_SOURCE_CUT`).

Hệ quả cho người xem: các màn V2 đọc API thật trên preview sẽ hiện "Not published" hoặc "Unavailable" ở những ô thuộc các request dưới đây. Đó là trung thực, không phải lỗi giao diện.

## 1. Tám việc nên nhờ Codex làm trước (theo mức chặn màn)
| # | Việc (request) | Vì sao ưu tiên | Contract nhỏ nhất để mở khóa |
| --- | --- | --- | --- |
| 1 | **Manager financial publication có receipt thật** (FE-005, 006, 010, 017, 025) | Chặn mọi con số tiền trên Overview và Portfolio 360 | Một fixture `REAL_RECEIPT` đã che của `GET /manager/fund-overview` và `/fleet`, có `capital_statements` và `net_pnl`/`allocation` AVAILABLE cho một partition Paper (từ Research-only install đang làm). Hiện chỉ có fixture synthetic |
| 2 | **Series NAV** (FE-013) | Overview và Portfolio 360 không có đường cong ở mức fund/portfolio | Một read series (decimal string + `methodology_ref` + `window`) cho portfolio và fund, hoặc phát hành decimal-string cho `cross-equity` / `equity-projection` hiện có |
| 3 | **Blotter** (FE-052) | Màn đã xong nhưng thiếu số fill và phí | Field nullable `deployment_id`, `filled_quantity`, `average_fill_price`, `fee` trên relation orders; 4 filter `stage`, `deployment_id`, `account_id`, `alpha_id` trong query `/screens/blotter` |
| 4 | **Stage hiện tại và số ngày** (FE-027, amendment FE-012) | Chặn spine của Cockpit, header Alpha 360, sort Fleet | `current_stage`, `days_in_stage`, `entered_at_ms` là scalar sort được trên `ManagerDatasetRow`, mỗi cái có reason khi thiếu |
| 5 | **Navigation cho role không phải owner** (FE-058, FE-057) | Nav V2 đang fail-closed ẩn Portfolios/Accounts/Operations/Blotter với mọi người kể cả owner | `observed_at_ms`/`valid_until_ms` trên hai projection, và trả lời Q1–Q4 trong `consumer-review-self-contracts-2026-10-19.md` §9 (phạm vi 7 mục rail, BLOTTER ⇐ `alpha.read`?, tên cho `accounts.manage`) |
| 6 | **Compare** (FE-033) | Compare chỉ đọc list, không có series | Op `IN` trong `filters` Manager; series căn chỉnh cho 2–4 subject, lỗi có kiểu khi lẫn tiền tệ |
| 7 | **Ledger Portfolio 360** (FE-046, FE-032) | Ledger bị cap 250 dòng | Cursor công khai cho capital-ledger, kèm `seq`/`command_id`/`receipt_ref` nullable |
| 8 | **Portfolios list** (FE-044 `q`, FE-045 `portfolio_id`) | Body legacy gộp tiền thật và mô phỏng | `q` (authority trước search, cursor gắn `q`); `portfolio_id` nullable trên hàng inbox theo lineage từng gate |

## 2. Việc Claude tự làm (không cần Codex)
FE-056, FE-049, FE-061 (lát backend FE-contract, additive): **đã làm xong và có test DB thật**, cần Codex review (xem mục 5); FE-042/043 render ở màn Operations; reader `managerDataset`; FE-054 decimal stage-drift v2; FE-048 (bỏ `?? 0`); FE-037/038/039 nối `self-navigation` khi Q1 được trả lời.

## 3. Câu hỏi chờ quyết (Bobby hoặc Codex)
- **Q1** projection `self-navigation` có thay 4 tên capability tạm (`execution.portfolios.read`…) không. **Q2** môi trường nào rail hỏi. **Q3** BLOTTER ⇐ `alpha.read` có chủ ý? Tên cho account management? **Q4** registry rev 7 có liệt kê `PROFILE_ACCESS` cho non-admin? **Q5** thêm `observed_at_ms`/`valid_until_ms`? **Q6** (Bobby) duyệt copy tiếng Anh cho `reason_class`.
- **M2 (B1):** đếm `status_counts` luôn bật có làm hỏng cả trang khi chậm: chọn opt-in `include=`, `SAVEPOINT` với `UNAVAILABLE` có kiểu, hoặc `GROUPING SETS`.
- Ô "Not published (FE-015)" cho eligibility từng hành động có thể sai chữ vì body đã publish: đề xuất "Not read yet by this screen" cho tới khi route được serve và nối.

## 4. Đã giải quyết cho FE (giữ để Codex biết đã được ghi nhận)
FE-008 (search/`q_mode`), FE-014 (`environment` trên portfolios), FE-040, FE-042, FE-043 (B1 ACCEPTED_FOR_INTEGRATION), FE-036 (current-only), FE-055; CC-1/CC-2/SE-1 (Codex `d0789674`); r2Ledger row cho `governance_approval_decision_inbox`.

## 5. Claude đã làm backend thay Codex trong đợt này (cần Codex review)
| Request | Thay đổi | Việc Codex cần quyết |
| --- | --- | --- |
| FE-056 | `operator-tasks.ts`: 24 tác vụ có `display_name`, `description`, `scope_label` (tùy chọn, bounded, không control/bidi); schema/fixture/generated/snapshot đã sinh lại; `catalogue_revision` giữ 3 | Duyệt nội dung 24 mô tả; fixture có `required` per-param cũ lệch emitter (đã có từ trước, chưa sửa) |
| FE-049 | `execution-alpha-fleet-list.v2.schema.json`: `Decimal.maxLength 128`, `MetricState` thêm `PARTIAL` | Server chưa chặn 128 ký tự ở `exact()`/`sumExact`: có ép phía phát không |
| FE-061 | Từ vựng mã lỗi đóng cho `AccessProblem` (36 mã) và `PendingControlProblem` (tập cha), nguồn chung cho hai generator | Duyệt superset cho pending; `INTERNAL_ERROR` ở 500 chưa khai báo; có thêm retry class (field mới + đổi server) |
| F1 index | migration `1723680000145`: index `(workspace_id, operation_id, created_at DESC, incident_id DESC)` cho bảng link incident (review độc lập M1) | M2: đếm `status_counts` luôn bật có làm hỏng cả trang khi chậm; chọn opt-in `include=`, SAVEPOINT + `UNAVAILABLE`, hoặc GROUPING SETS |

Khoảng trống phía Codex mà reader Manager dataset phát hiện (mỗi cái có test `it.fails` sẽ đỏ khi sửa): MD-1 `returned_count` khớp số hàng và `limit`; MD-2 metric trong partition mang đúng tiền tệ; MD-3 partition không trùng; MD-4 preset không publish thì không có window; MD-5 Decimal nhận `-0`; MD-6 `row_key` duy nhất; MD-7 group key thuộc `group_fields`; MD-8 tiền ở hàng khớp tiền tệ partition.

## 6. Thêm từ S3 (năm màn stage dựng xong, 2026-10-19): OPEN, chưa gửi Codex

Thẻ đầy đủ: [backend-requests.md](backend-requests.md) mục "S3"; ledger: [FRONTEND_BACKEND_SYNC.md](../../FRONTEND_BACKEND_SYNC.md) §6. Năm màn Paper, Sandbox, Canary, Live, New request đã dựng sau cờ riêng; trên nguồn tối ba màn stage hiện `Not published (FE-xxx)` ở các ô dưới đây. Thứ tự theo mức chặn màn (đề xuất của FE, Bobby chọn lúc gửi):

| # | Việc | Vì sao | Contract nhỏ nhất |
| --- | --- | --- | --- |
| S1 | **FE-072** hàng và chuỗi có kiểu cho Sandbox/Canary/Live | Chặn Triad, bảng Positions/Orders, chart, gap window, cột Opened/Envelope/Author của cả ba màn | Schema có kiểu cho `source_panels.*.data`, `positions`/`orders` rows, `series.points`, `continuity.gap {from,to}` + fixture SOURCE_BACKED |
| S2 | **FE-067** runtime_state, đối soát, phiên | Chip Runtime/Reconciliation của cả năm màn đang `Not published`; tab Sessions trống | `runtime_state` + `since`, `reconciliation {verdict, unknown_order_count}`, `sessions[]` (hoặc xác nhận nhánh `Records` đã có trong `execution-paper-read.v1`) |
| S3 | **FE-071** Canary envelope, rollback, trial | Gauge Used, "Within envelope", Rollback readiness, "Exit review in N days" | `envelope_compliance.rows[]` có verdict server, `rollback_readiness.items[]` có `checked_at`, `lifecycle.started_at` / `exit_review_opens_at` |
| S4 | **S3-U1** route `shadow-panel` + qualification | Profile Paper ~7,4 MB và ~6 s, đọc một lần | Xác nhận route đã serve/qualified; có thay được orders/positions của profile |
| S5 | **S3-U2** schema + fixture canonical cho alpha-resource, subject-records, observed-timeline, market-candles | Alpha 360 / Replay chỉ được kiểm bằng double viết tay; FE đọc v1 trong khi v2 đã có | Schema + fixture rỗng/1/nhiều/keyset; chốt v1 hay v2 |
| S6 | **FE-066** tên alpha/portfolio; **FE-068** self-eligibility 11 action | Crumb/tiêu đề chỉ có id; nút bị tắt không nói được lý do thật | Field nullable; mở rộng `self-eligibility.v1` |
| S7 | **FE-069**, **FE-070**, **S3-U3**, **S3-U4** (FE-051 cho vị thế deployment) | Picker alpha 50 run; chip VN; chưa kiểm hai cổng chart/analytics theo `deployment`; Long/Short/Gross | Theo từng thẻ |

Chưa kiểm (nói thẳng): server có phục vụ `getFinancialChart({subjectKind:"deployment"})` / `getQueryAnalytics("deployments")` hay không (S3-U3); server có điền nhánh `sessions` / `reconciliation` của profile Paper không (FE không đọc chúng).

Hai kết quả review độc lập về S3 (nếu có file) chưa có trong cây này tại thời điểm viết; nếu muộn hơn, chúng được ghi ở `evidence/UXM-07/` và README mục 5.
