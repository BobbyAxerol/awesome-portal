# Màn con và tab của V1: dùng lại, gộp hay bỏ (Claude, 2026-10-18, nháp để Bobby duyệt)

Nguồn: [sweep/](sweep/), [V1_DEEP_INVENTORY.md](V1_DEEP_INVENTORY.md), [V1_SCREEN_REVIEW.md](V1_SCREEN_REVIEW.md). Quy ước: **REUSE** giữ component, đổi chỗ đặt · **MERGE** gộp vào chỗ khác · **REFINE** sửa nội dung · **DROP** bỏ.
Nguyên tắc: chart/component đã tốt thì dùng lại; tab chỉ là con trỏ hoặc trống thì gộp; chỉ bỏ cái gây hiểu sai hoặc là mã nội bộ.

## Alpha 360 (10 tab V1)

| V1 | V2 | Ghi chú |
| --- | --- | --- |
| Overview | MERGE: ma trận venue×stage → dải "Where it runs" ở header (journey spine); lưới KPI execution quality → Orders & Fills; equity theo stage + contribution theo venue → Performance; rollup hoạt động → Activity & Decisions | Giữ EquityChart, ContributionChart, bảng Deployments in scope |
| Insight Charts (12 tile chính + tối đa 6 phụ; ~6 vẽ được, ~10 trống) | **Tan vào tab chứa nó**, chỉ vẽ khi có dữ liệu; còn lại là một dòng "N chart chưa có" | Xem bảng tile bên dưới |
| Trade Replay | **REUSE nguyên** (chart làm tốt nhất sản phẩm); dùng chung cho Account 360 và "open on chart" từ Blotter | Thêm dải sự kiện C3 dưới nến; khi chưa có nến: bảng log + một dòng thật thà |
| Positions | REFINE, More ▾ | Link deployment/account; thêm tóm tắt long/short/gross |
| Orders & Fills | REFINE, tab chính | Venue/client id, phí, hạt fills; "Open ↗" tới blotter có phạm vi |
| Risk | MERGE vào Positions | Mới chỉ có notional; tab riêng khi có hạn mức |
| Sessions | MERGE vào Activity (một loại sự kiện) | Sửa "1 accounting recoveries" |
| Accounting | MERGE: chi phí → Performance, phân bổ → Allocations/Portfolio | Dùng một ô số chung (20,000.00, không 20000) |
| Reconciliation | REUSE, More ▾ | Link findings sang Account 360; thời gian "Oct 02 06:00Z" |
| Audit | MERGE vào Activity & Decisions | Một timeline có lọc loại |

### 12 tile Insight Charts đi đâu

| Tile | V2 |
| --- | --- |
| 1 Equity by stage | Performance (spine + dải stage; mô phỏng gạch chéo) |
| 2 Drawdown & underwater | Performance (panel drawdown đã có trong kit) |
| 3 Rolling corr vs benchmark | Risk (Positions), chỉ khi đủ lịch sử nhiều alpha |
| 4 Venue contribution | Performance (R9) |
| 5 Execution quality by venue | Orders & Fills |
| 6 Order funnel | Orders & Fills |
| 7 Return histogram | Performance ("More charts") |
| 8 Execution density 7×24 | Orders & Fills |
| 9 Regime-shaded equity | Regime Fit (chưa vẽ được: chưa có nhãn regime) |
| 10 Paper vs live drift | Performance (so sánh facet) + Exit review |
| 11 Risk utilization | Risk, khi nguồn có hồ sơ rủi ro (hiện từ chối) |
| 12 Cost drag waterfall | Performance (thẻ chi phí; sửa trục lặp −0.01) |
| Tile phụ: exact query surface | **DROP** (hạ tầng nội bộ, không phải chart cho người dùng) |
| Tile phụ: exposure profile | Positions |
| Tile phụ: trade replay journal, market candles | Trade Replay |

## Portfolio 360 (6 tab V1)

| V1 | V2 | Ghi chú |
| --- | --- | --- |
| Overview (equity, cross-portfolio, config log) | REFINE: equity → Overview; config log → Activity; **bảng Cross-portfolio DROP** (M02 + Compare thay) | |
| Structure & Correlation | MERGE: holdings → Allocations; ma trận/ranked pairs → Risk & Health khi có dữ liệu; **influence graph DROP** (trống ở 2 alpha); drawdown overlap để khi có dữ liệu | Giữ chế độ ma trận / leader lens / ranked pairs |
| Capital Ledger | MERGE: **Allocations có hai khối Real-funded / Simulated, mỗi khối có ledger**, kèm capital flow (C2) | Số vốn theo môi trường thành hai khối |
| Approvals, Incidents | REUSE dưới "More ▾" | Giữ cách báo "chưa publish" thật thà của Incidents |
| Audit | MERGE vào People & Activity | |
| Report pack | REUSE nút; cần xuất thật | |
| Rebalance plan | **DROP bản V1** (in số mẫu cứng "Grid v2.1 69.8%→60.0%" cho mọi portfolio, dễ hiểu sai); thay bằng Actions rail có xem trước thật (F2) | |

## Màn stage

| V1 | V2 | Ghi chú |
| --- | --- | --- |
| Paper Workbench, 7 tab | Overview + Orders / Fills / Positions / Sessions; thanh tab lên đầu | Overview giữ runtime health, accounting, drift, execution quality; EquityChart có dải approved band (kit đã hỗ trợ) |
| Sandbox Cert: Reconciliation, Steps(7), Promotion plans, Timeline | REUSE, thêm `?tab=`, thêm dải hành trình (V1 thiếu) | Form "Record review note" giữ (POST thật duy nhất ở stage) |
| Canary: Envelope, Positions & orders, Reconciliation, Guard rule | REUSE, thêm `?tab=`; biểu đồ Live vs Paper vs Backtest là hạt giống của timeline M05 (StageLinesChart) | Envelope: CapGauges + bảng hạn mức |
| Live Ops: Exposure & orders, Continuity, Predecessor envelope, Guard rules | REUSE; thang bảo vệ halt→reduce→close giữ; bộ ba Internal / Broker / Difference giữ | Giảm mã BLOCKING lặp 3 lần |
| Bộ ba Internal / Broker / Difference | **REUSE một component** cho Sandbox, Live, Account 360 | |
| Blotter (conditional groups, funnel strip, "open on chart") | REUSE; lọc theo URL (stage/deployment/account/alpha) | Chip đếm đang sai; vừa 1440px |
| Waivers: runway | REFINE: thẻ runway thành timeline thật (trục ngày đến hạn) | |
| Binding Detail | MERGE vào M06 view Physical binding | Xoay credential: admin action |
| Admin task detail (R0 read, journal) | REUSE ở route admin rút gọn | |

## Tóm lại cho Bobby

- **Dùng lại gần như nguyên:** Trade Replay, EquityChart, ContributionChart, KeysetTable, bộ ba Internal/Broker/Difference, Envelope/CapGauges, thang bảo vệ Live, form Record review note, các bảng Positions/Reconciliation, Approvals/Incidents.
- **Gộp:** Insight Charts (tan vào tab chứa), Risk, Sessions, Accounting, Audit, Structure & Correlation, Capital Ledger, Binding Detail.
- **Bỏ:** tile "exact query surface", bảng Cross-portfolio, influence graph, Rebalance plan bản số mẫu.
- **Nâng cấp bằng concept đã duyệt:** Trade Replay + dải sự kiện (C3), Capital Ledger + capital flow (C2), Overview của Alpha + journey spine (C3), Insight Charts + Compare (C2).
- Chưa vẽ HIFI cho các màn này; sẽ vẽ theo lô sau khi bạn duyệt bảng này.
