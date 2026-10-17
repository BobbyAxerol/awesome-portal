# UXM-01 — IA, URL context và metric dictionary (Claude, nháp để Bobby duyệt)

Nguồn: guide v1.1 §4–§8, §11, §14; contract Manager dataset (`manager-model.contract.ts`, pin `docs/research-loop-plan` @ `0aad2697`);
sổ đồng bộ §3–§4. **Đề xuất thiết kế, chưa phải implementation.** Lowfi tương ứng: [lowfi/](lowfi/).

## 1. Sitemap (manager-first)

| Nav | Màn | Route đề xuất | Tương thích V1 |
| --- | --- | --- | --- |
| Overview | M01 | `/execution` (**cần Bobby quyết**: hiện là Command Center triage) hoặc `/execution/overview` | Triage hiện có chuyển thành khối "Needs attention" của M01 và giữ ở Operations |
| Portfolios | M02, M04 | `/deployments/portfolios`, `/…/:id` | Giữ route hiện có |
| Alpha Fleet | M03, M05, M07 | `/deployments/alphas`, `/…/:id`, deployment giữ `/deployments/{stage}/:id` | Giữ route + deep link |
| Accounts | M06 | `/deployments/accounts`, `/…/:id` | Giữ |
| Archived Alphas | M08 | `/deployments/alphas/archived` (đề xuất) | Mới |
| Operations | M09 | `/execution/operations`, incidents | Giữ |
| Profile & Access | M10 | `/administration/profile-access` | Mở rộng thành self-view |

Nguyên tắc: **không đổi route đã tồn tại**; thêm route mới; mọi deep link cũ vẫn vào được. "All" là view, không là stage thứ năm. "Archive" là lifecycle.

## 2. Context chung trong URL (state không bao giờ im lặng reset)

| Param | Giá trị | Mặc định | Ghi chú |
| --- | --- | --- | --- |
| `env` | `live` \| `paper` \| `sandbox` | `live` | **Bắt buộc ở backend; không có ALL.** Đổi env = đổi partition |
| `window` | `7d` \| `30d` \| `90d` \| `from..to` | `30d` | Ngày UI → khoảng nửa mở UTC qua contract; "Equity 30D" luôn 30D, không đổi theo window |
| `ccy` | mã tiền | partition đầu tiên có dữ liệu | Không cộng khác tiền; không quy đổi hiển thị thành sự thật sổ cái |
| `stage` | `all` \| `live` \| `canary` \| `sandbox` \| `paper` | `all` | Filter; count là unique alpha |
| `q` | chuỗi | trống | **Chờ FE-008** (contract chưa có tìm theo tên) |
| `f.<field>` | giá trị | trống | Chỉ field trong allowlist; op `EQ/GTE/LTE/IS_NULL`; tối đa 16 |
| `sort` | `field:dir,…` ≤3 | `name:asc` | Server-side; null luôn cuối cả hai chiều; tie-break theo ID bất biến |
| `group` | ≤2 trong `portfolio_id, owner_user_id, alpha_id, stage_presence, venue, health, source_state, lifecycle` | trống | Header ghi "alphas" hay "deployments" |
| `cursor` | opaque | — | Xóa khi đổi filter/sort; 409 → xóa pin và nói rõ |
| `sel` | ID hàng | — | Mở peek drawer |
| `tab` | theo màn | tab đầu | Giữ như V1 |

Khi mở lại (deep link/saved view) mà một filter không còn hợp lệ do quyền đổi: **giải thích và bỏ filter**, không âm thầm. Saved view không cấp quyền; chờ quyết định có/không (FE-016).

## 3. Metric dictionary (nhãn cho người dùng, nguồn và cách hiển thị khi thiếu)

Ký hiệu nguồn: **D**=Manager dataset `metrics[<scalar>]`; **S**=`capital_statements[].metrics[<statement_field>]`; **P**=`scores.*`. Mọi giá trị là chuỗi decimal chính xác, không bao giờ rút gọn k/M.

| Nhãn UI | Nguồn / key | Grain | Format | Khi `AVAILABLE` | Khi thiếu (copy gốc, mã đi kèm ở chi tiết) |
| --- | --- | --- | --- | --- | --- |
| Net asset value | S `current_nav` | partition | tiền | số + tiền | "Not available · source not qualified" |
| Net PnL | D `net_pnl` | hàng/partition | tiền có dấu | số có dấu | "Not available · fees & funding incomplete" (khi `PARTIAL`: số + chip Partial) |
| Unrealized PnL | D `unrealized_pnl` / S `unrealized_pnl` | hàng/partition | tiền có dấu | số | "Not available · valuation not reconciled" |
| Realized PnL | S `realized_pnl` | partition | tiền có dấu | số | như trên |
| Return (window) | D `return_30d_pct` | hàng/portfolio | % + nhãn method | số + "Modified-Dietz, not TWR" | "Not available · method not certified" |
| Equity 30D | D `equity_30d_end_value` | hàng | tiền + sparkline | số cuối + đường | "Not available · no NAV series" |
| Drawdown (current/max) | _chưa có scalar_ | portfolio | % | — | "Not available · needs NAV series" (**request FE-013**) |
| Allocation | D `allocation` | hàng | tiền | số | "Not available · allocation source not ready" |
| Account balance | D `balance_total` | internal account | tiền | số; native custody là field riêng | "Not available · account not reconciled" |
| Initial / Added funds | S `initial_funds`, `added_funds` | partition | tiền | số | "Not available · capital source not ready" |
| Returned capital | S `returned_capital` | partition | tiền | số | như trên; có thể **không bao giờ publish** (RETURN) |
| Net external flows | tính từ S ở FE? **Không** — hiển thị chỉ khi backend trả | partition | tiền | số | Không tự cộng ở client |
| Budget approved / used | S `current_budget`, `initial_budget`, `locked_amount`, `exposure_cap` | partition | tiền | số | như trên |
| Pending recall/amount | S `pending_amount`, `recall_applied`, `decreases_applied` | partition | tiền | số | như trên |
| Fees / Funding | S `actual_fees`, `pending_fees`, `funding`, `interest` | partition | tiền có dấu | số | "partial" nếu thiếu nguồn |
| QBTS / Alpha score | D `score` + P `raw` | hàng/portfolio | 0–100 + band | số + band + "Provisional" khi `provisional` | **Hiện tại luôn "Pending · score policy pending"** |
| Portfolio score | P `direct_nav` | portfolio | 0–100 | như trên | như trên |
| Composition score | P `composition` | portfolio | 0–100 | như trên | `policy_pending / partial_coverage / incomparable_basis / no_allocation` có copy riêng |
| Regime fit | P `regime` + `regime_details` | alpha/deployment | trạng thái | `supported / weak_support / out_of_support` | `unavailable / unbound / insufficient_data / stale` — luôn độc lập với score |
| Health | D `health` | hàng | chip | OK / Needs attention | typed, không suy từ màu |
| Source state | D `source_state` | hàng | chip | Fresh / Stale / Unknown | `UNKNOWN` ≠ lỗi |
| Stage presence | `stage_presence[]` | hàng | pills | Live/Canary/Sandbox/Paper | tập từ vựng, không xếp hạng rủi ro |
| Funding-bucket PnL | `funding_bucket_pnl` | — | — | — | Luôn "Not available · method not approved" |

Quy ước chung: không bao giờ hiển thị `0`, `-` hay `N/A` thay cho null; mọi số tiền kèm partition + currency; chip chất lượng (`COMPLETE/PARTIAL/UNRESOLVED`, `FRESH/STALE/UNKNOWN`) không bao giờ xanh khi `PARTIAL`.

## 4. Từ vựng trạng thái (copy tiếng Anh, bảng này là bản dịch cho **public copy dictionary** — FE-015)

| Điều kiện | Chip/copy |
| --- | --- |
| `availability=UNAVAILABLE` | "Not available" + lý do ngắn từ bảng ánh xạ `reason_code` (mã gốc ở tooltip/chi tiết) |
| `availability=PARTIAL` | số + chip "Partial" + lý do |
| `availability=NOT_APPLICABLE` | "Not applicable" + lý do |
| `freshness=FRESH/STALE/UNKNOWN` | "Fresh · as of …" / "Stale · …" / "Freshness unknown" (Edge `AGING`/`PAUSED`: chờ FE-004) |
| HTTP 503 `EXECUTION_READ_PUBLICATION_NOT_QUALIFIED` | Banner "Most figures are not available yet — the data source has not been qualified for this environment. Nothing is estimated." |
| Quyền thấp | Banner own-slice, không icon khoá còn tải giá trị ẩn |
| 409 (cursor/snapshot) | "The data changed while you were browsing. Showing the latest — your position was reset." |

## 5. Sổ chính sách còn mở (cần owner)

| # | Vấn đề | Owner | Ảnh hưởng thiết kế |
| --- | --- | --- | --- |
| P1 | M01 ở `/execution` hay route mới; số phận triage | Bobby | Điều hướng, deep link |
| P2 | Có hiển thị Initial|Added theo funding source không (cần attribution được duyệt) | Bobby/PM | Khối Capital |
| P3 | Return/DD: có chứng nhận phương pháp không; nhãn Modified-Dietz | TS/Portal (FE-006) | Ô return/DD |
| P4 | Score policy khi nào hết `pending` | Portal | Cột QBTS, thẻ Score |
| P5 | Researcher view: field policy §3.2 chưa duyệt | Bobby | Mọi màn có own-slice |
| P6 | Tab "All" semantics, tìm theo tên, export, saved views | Bobby/Portal | M03 |
| P7 | 660px có là điểm kiểm cho Execution V2 | Bobby | Gate responsive |
