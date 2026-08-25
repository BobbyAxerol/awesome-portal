# Design grammar v3 — Execution surface (owner override 2026-08-25)

> Bobby, 2026-08-25: *"không cần tuân thủ hi-fi nữa, cứ thoải mái sáng tạo"*. Từ đây hi-fi `.dc.html`
> là **tham chiếu nội dung** (màn nào có gì), không còn là pixel authority; DS §7 "flat geometry"
> nghỉ. File này là grammar thay thế, áp cho 17 màn Execution; Research/Planning không đổi
> (mọi rule scoped `.exec-surface`).

## 1. Bốn luật

| Luật | Giá trị | Vì sao |
|---|---|---|
| **Radius** | panel/nút 8px · chip pill · tab 4px trên · lifecycle rail 8/4 | góc vuông + viền 1px đọc như form nội bộ |
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
