# Execution V2 kit — hợp đồng cho mọi màn

Mọi màn chỉ viết phần `<main>`; `kit.js` dựng shell (thanh preview, top bar, **thanh ngữ cảnh duy nhất**, nav 7–9 mục theo vai trò, ⌘K), `kit.css` là design system, `charts.js` có `equityChart`, `spark`, `divBars`. Module riêng của từng concept nằm ở `modules/`.

```html
<link rel="stylesheet" href="kit.css">
<body data-page="Alpha Fleet" data-nav="fleet" data-crumb="Execution / Alpha Fleet" [data-window-lock="24H Operations"]>
<main><div class="stack">…</div></main>
<script src="kit.js"></script><script src="charts.js"></script><script src="modules/xxx.js"></script><script>/* KIT.on(fn) vẽ lại khi đổi vai trò, dữ liệu, môi trường, khung thời gian */</script>
```

## Quy tắc
1. **Vai trò và dữ liệu:** `data-roles="manager operator"` (hiện cho vai nào), `data-hide-roles="researcher"`, `data-data="ok"|"nq"` (nguồn đạt / chưa đạt). Mỗi màn phải đúng ở 4 vai × 2 trạng thái dữ liệu. `KIT.state` = `{role,data,env,win}`.
2. **Ngữ cảnh chỉ ở thanh ngữ cảnh:** môi trường (Real-funded / Paper / Sandbox), khung thời gian 7D/30D/90D/ALL (mặc định 90D), tiền tệ. Trang không tự vẽ lại bộ chọn; nếu cố định khung thì `data-window-lock`. Chữ khung thời gian trong nhãn là `<span class="win">90D</span>`.
3. **Cờ trạng thái:** `<span class="flag" data-k="pending">Pending</span>`; `data-k` ∈ ok, pending, recall, partial, unknown, applied, rejected, display, stale, paused, approval, incident, operation, attention, na. Chọn theo **nghĩa**, không theo chữ. Chấm `.dot` chỉ cho độ tươi/trạng thái sống. Không bao giờ xanh cho PARTIAL.
4. **Điều khiển bị chặn:** `KIT.disabled("Approve","noGrant")` (nút tắt + một dòng lý do + link My access); không dùng tooltip một mình. Từ điển lý do: `KIT.WHY`.
5. **Giá trị thiếu:** "Not available" + lý do ngắn; không "—", không 0, không viết tắt k/M; tiền 2 chữ số thập phân nhất quán; dấu trừ U+2212; ngày `17 Oct 09:14Z`; ID là nhãn phụ mono.
6. **Chữ tối giản:** phụ đề ≤60 ký tự, tối đa ~4 chuỗi ≥60 ký tự mỗi màn, giải thích cơ chế đặt trong `<details>`; không đoạn văn.
7. **Thuật ngữ** (review2/06 + sổ quyết định E): Real-funded (miền) vs Live (stage) · Approvals · Incidents · NAV · "Not scored" cho score chưa có policy · "Display" cho chiều hiển thị sau lệnh · "Source not qualified" · "R1 gate".
8. **Bố cục:** panel `.panel` + header `.ph`; KPI `.kpis > .kpi` (một cỡ); bảng `.tw > table`; bảng duyệt ≤660px dùng `table.cards` + `td[data-l]`; drawer một kiểu `.drawer.dock`; tab `.tabs > button[aria-selected]`; segmented `.seg`. CSS riêng của trang chỉ để bố cục, ≤40 dòng; thiếu component thì báo để đưa vào kit.
9. **Chart:** màu từ token (`--series`, `--series-2/3/4`, `--series-dd` chỉ cho drawdown/lỗ, `--series-sim` chỉ cho mô phỏng); xanh/đỏ chỉ ở chữ có dấu, không ở series; có readout, nhấn điểm cuối, hatch cho phần mô phỏng, hover + phím mũi tên.
10. **Researcher:** thấy allocation + PnL của mình, ẩn Accounts, Portfolios, heat map; ⌘K đã lọc quyền; chỉ "Your slice only".
11. **Một theme Carbon** cho mọi màn, kể cả duyệt.
