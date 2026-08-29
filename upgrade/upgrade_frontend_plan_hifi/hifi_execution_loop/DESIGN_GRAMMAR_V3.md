# Design grammar v3 — Execution surface (owner override 2026-08-25)

> Bobby, 2026-08-25: *"không cần tuân thủ hi-fi nữa, cứ thoải mái sáng tạo"*. Từ đây hi-fi `.dc.html`
> là **tham chiếu nội dung** (màn nào có gì), không còn là pixel authority; DS §7 "flat geometry"
> nghỉ. File này là grammar thay thế, áp cho 17 màn Execution; Research/Planning không đổi
> (mọi rule scoped `.exec-surface`).

## 1. Bốn luật (góc vuông là luật số 0)

| Luật | Giá trị | Vì sao |
|---|---|---|
| **Góc** | **0 — không bo** (Bobby chốt lần 2, 2026-08-25: nguyên lý terminal). Mọi token radius trong Execution = 0; chip/nút/panel vuông. | bo góc phá ngôn ngữ terminal của sản phẩm |
| **Bề mặt thay viền** | panel = `--surface-3` không viền; ô trong panel = `--surface-2`; viền chỉ còn ở bảng và input | 4 tầng viền chồng nhau làm mắt không biết nhìn đâu |
| **Nhịp 24** | giữa khối 24px · trong panel 16px · KPI gap 12px · rail section gap 24px | 12px khắp nơi = "khít" |
| **Chữ** | Inter cho mọi prose kể cả meta/caption (12/16) · mono chỉ cho `num` `kpi` `id` `term` | mono ở caption/state làm cả trang thành log |

## 2. Khung trang

- **Banner preview**: 1 dòng 32px, radius 8, không viền; `Details` và `Inspector` gấp bên phải.
- **Masthead**: tên · id (mono) · chip trạng thái (pill) · **một** câu purpose ≤60 ký tự · một action chính. Không gạch chân masthead.
- **KPI strip**: ô nổi radius 8, basis 120px (5 ô/hàng ở 1440), số mono 24.
- **Tabs**: gạch chân, panel cách 16px.
- **Rail phải**: **một cột chữ**, không hộp. Chỉ khối *Next/Decide* là card (có action). Tiêu đề phụ 11px uppercase mờ. **Khối rỗng không render** ("None named." bị ẩn).
- **Governance canvases** (`.exec-inbox/.exec-gate/.exec-exit`): không còn hộp bao; workspace là khung.

## 3. Copy budget (giữ §7.2 handoff)

- một câu state · một hệ quả · một hành động; note cơ chế → `<Hint>` ("How to read").
- Không lặp cùng ý ở masthead + rail + footer (Exit Review từng lặp 3 lần).

## 4. Chưa làm / cần quyết

- Sidebar badge `PREVIEW`/`PROTOTYPE` lặp 12 lần — thuộc shell dùng chung (ngoài §0). Đề xuất: một chip ở đầu nhóm.
- Tabs Alpha 360 là nút (không phải gạch chân) — đồng bộ ở lô sau.
- Lifecycle rail (R1→LIVE) còn hairline; giữ vì là timeline.

## 5. Visual grammar cho màn stage (vòng 4)

- Hàng 1: chart chính (2/3) + gauge tiêu thụ so với cap (1/3). Gauge: thanh 6px, màu theo tỉ lệ
  (≥80% vàng, ≥100% đỏ) trừ `target` (30/30 ngày) luôn xanh.
- Hàng 2: histogram ACK latency (p50/p95 ở đầu) + 2 sparkline có trần (đường đứt đỏ).
- Bảng positions nằm trong tab, trước các `SourceTile` trạng thái nguồn.
- Mọi visual từ smoke in **một dòng** cảnh báo vàng; KPI lấp bằng smoke ghi chú "smoke". Không bao
  giờ lấp KPI `suppressed`.

## 6. Quy trình "từng màn, Bobby pass" (từ 2026-08-25, bắt đầu với Command Center)

- Mỗi màn = một commit riêng, đúng hi-fi của màn đó về **font, cỡ chữ, bố cục, kích thước component**; scale
  theo dữ liệu thật do Claude quyết; góc vuông; shell (sidebar/topbar) liền mạch với nội dung.
- Fonts: **IBM Plex Sans** (300/400/500/600) cho chữ, **IBM Plex Mono** (400/500/600) cho số/mã/nhãn —
  bundle thật qua `@fontsource/ibm-plex-*`; test EL-V2-02 cập nhật.
- Command Center (hi-fi 5a) đã dựng: masthead h1 300/22 + chip mono; panel viền 1px trên nền nổi, header
  10/14 tiêu đề mono 11 uppercase .08em, meta mono 10 phải; hàng triage 10/14 viền trái 3px theo severity,
  rank mono 12/600, chip loại mono 10/600, tiêu đề sans 13, SLA mono 11, action link mono 11; Fleet cells
  1px-gap, nhãn mono 10 uppercase, giá trị mono 16; Pinned mono 12; Today mono 11; **không rail phải**.
- Sidebar dưới theme carbon: 228px nền sunken, nhãn nhóm mono 10 uppercase .1em, item 6/16 sans 13, active
  nền #262626 + thanh accent 3px, ẩn badge PREVIEW. Topbar: brand mono 12/600 .12em, chip mono 10.
- Trạng thái: **chờ Bobby pass Command Center**; màn kế tiếp làm khi Bobby gửi.

## 7. Chuyển động (owner cho phép 2026-08-25 — "vừa phải, không thêm component mới")

Hai lớp, cả hai tắt dưới `prefers-reduced-motion`:

| Lớp | Gì | Ở đâu | Xoá khi |
|---|---|---|---|
| **Sản phẩm** (giữ) | **thanh SLA** trên mỗi hàng triage: đầy khi mới phát sinh, rút dần tới hạn (DUE SOON vàng), OVERDUE đỏ đầy + nhấp nháy + đếm quá hạn · thanh funnel chạy vào khi mở (700ms) · viền hàng CRITICAL thở 2.8s · vệt sáng quét thanh funnel 6s · **không** chấm/ô freshness trên màn này (Bobby: "không hợp vibe") | CSS `execution.css` khối "Command Center v4 · motion" | không xoá |
| **Smoke motion** (tạm) | đồng hồ `as_of` chạy giây · tuổi hàng triage tăng · broker sync `age x.xs` nhấp nhô 2s · figure pinned nhích ±2 mỗi 3s kèm flash | `commandCenter.smoke.ts` `CC_SMOKE_MOTION` + `useSmokeTick` | khi stream thật (BR-EX-43/SSE) thay thế — xoá cùng file smoke |

Quy tắc cho các màn khác: cùng hai lớp; smoke motion luôn nằm trong file `*.smoke.ts` của màn đó, không
trộn vào component; e2e đóng băng đồng hồ (`page.clock.install`) nên baseline không đổi.

## 8. Fixture → dữ liệu thật: gỡ theo từng màn (Bobby chốt 2026-08-25)

Luật: **không có banner/chip "fixture" trong UI**. Mỗi màn đang chạy smoke có (a) một file `*.smoke.ts`
với cờ duy nhất và hợp đồng xoá ở đầu file, (b) một dòng cảnh báo `SMOKE DATA` in ngay trong panel dùng
smoke. Khi contract của màn đó về và verify xong → xoá file smoke + dòng cảnh báo **của riêng màn đó**,
re-record baseline màn đó, tick bảng này. Không trộn: smoke chưa bao giờ đè lên giá trị đã publish.

| Màn | File smoke | Cờ | Gỡ khi (BR) | Trạng thái |
|---|---|---|---|---|
| Command Center | `commandCenter.smoke.ts` | `CC_SMOKE`, `CC_SMOKE_MOTION` | BR-EX-42/43/44/45 | smoke |
| Incident Detail | `incident.smoke.ts` | `INCIDENT_SMOKE` | BR-EX-46 (+43 stream) | smoke |
| Operations Queue | `operationsQueue.smoke.ts` | `QUEUE_SMOKE`, `QUEUE_SMOKE_MOTION` | BR-EX-47 (+43 alerts) | smoke |
| Full Blotter | `blotter.smoke.ts` | `BLOTTER_SMOKE`, `BLOTTER_SMOKE_MOTION` | BR-EX-48 (+24/25/43) | smoke |
| Alpha Fleet | `alphaFleet.smoke.ts` | `FLEET_SMOKE`, `FLEET_SMOKE_MOTION` | BR-EX-49 (+43) | smoke |
| Alpha 360 · Trade Replay | `alphaReplay.smoke.ts` | `REPLAY_SMOKE`, `REPLAY_SMOKE_MOTION` | BR-EX-50 (+43/48) | smoke |
| Portfolio 360 | `portfolio360.smoke.ts` | `PF_SMOKE`, `PF_SMOKE_MOTION` | BR-EX-51 (+43) | smoke |
| Accounts & Bindings · Binding Detail · Account 360 | `accounts.smoke.ts` | `ACCOUNTS_SMOKE`, `ACCOUNTS_SMOKE_MOTION` | BR-EX-52/53/54 (+43) | smoke |
| Live Overview · Live Full Operations | `live.smoke.ts` | `LIVE_SMOKE`, `LIVE_SMOKE_MOTION` | BR-EX-56/57 (+43) | smoke |
| Canary Control Room | `canary.smoke.ts` | `CANARY_SMOKE`, `CANARY_SMOKE_MOTION` | BR-EX-59 (+41/43) | smoke |
| Sandbox Overview · Sandbox Certification | `sandbox.smoke.ts` | `SANDBOX_SMOKE`, `SANDBOX_SMOKE_MOTION` | BR-EX-60/61 (+41/58) | smoke |
| Paper Workbench · Paper VNM · Paper Exit Review | `paper.smoke.ts` | `PAPER_SMOKE`, `PAPER_SMOKE_MOTION` | BR-EX-62/63 (+41) | smoke |
| Alpha 360 · Insight | `alpha360.smoke.ts` | `ALPHA_INSIGHT_SMOKE` | BR-EX-34/40 | smoke |
| Paper / Sandbox / Canary / Live | `stage.smoke.ts` | `STAGE_SMOKE` | BR-EX-41 | smoke |
| Inbox · R1 · R2 · Exit · Queue · Blotter · Portfolio · Account · Drawer | — | — | (chưa dựng theo hi-fi mới; smoke khi Bobby gửi màn) | fixture contract |
