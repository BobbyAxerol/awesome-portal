# Kiểm tra toàn bộ màn hình Execution Loop — 2026-08-23

Mục tiêu Bobby giao: *"test lại hết tất cả các màn, lẫn soi kỹ từng lỗi có thể xảy ra, rồi fix luôn"*.

Đây không phải lần chạy lại test. Suite cũ đã xanh **1.457/1.457** trước khi bắt đầu và vẫn xanh sau khi
tìm ra 8 lỗi — nên câu hỏi dẫn đường của đợt này là: *lỗi nào có thể sống sót qua một suite xanh?*
Cách làm là quét theo **lớp lỗi**, mỗi lớp là một tính chất kiểm được bằng máy trên toàn thư mục,
chứ không đọc lần lượt từng màn.

---

## 1. Lỗi đã tìm và đã sửa

| # | Lớp lỗi | Chỗ | Hậu quả nếu để nguyên |
|---|---------|-----|------------------------|
| 1 | Chiều fail-closed sai | `commandPlan.ts:105` | Màn **trấn an sai**: cờ không đọc được → nói *"Nothing was asked of the Trading System"* |
| 2 | Một trường đọc hai chiều | `operations.ts:421` vs `:502` | Chưa lộ (màn đọc bản an toàn), sẽ lộ khi có người tiêu thụ thứ hai |
| 3 | Cầu xây một đầu | `commandCenterStream.ts` | Hook stream **không ai gọi**; nhánh live không bao giờ nhận được state |
| 4 | `null` in ra như giá trị | `screens/CommandCenter.tsx` | In `Live — UNKNOWN` dưới `data-live="true"` khi **không giữ subscription nào** |
| 5 | Class CSS không có rule | `components/drawer.tsx:247` | Chữ dành cho trình đọc màn hình `(done)/(current)/(not reached)` **hiện ra màn hình** |
| 6 | `?? 0` trên một phép đếm | `screens/PortfolioThreeSixty.tsx:537` | *"Bounded window — 0 of 4,180 entries were returned"* — khẳng định không dòng nào trả về |
| 7 | Bịa ra một khẳng định | `screens/PaperWorkbench.tsx:420` | Không có drift note → caption tự nói *"Linked to the approved run by artifact digest"* |
| 8 | Test bỏ phiếu trắng | `execution.test.tsx` ×6 | `if (!r.ok) return;` → route hỏng / cursor bị huỷ vẫn **xanh** |

### Ghi chú từng lỗi

**#1 — nghiêm trọng nhất.** `source_side_effect_requested` được ba reader (`certification`, `liveFull`,
`operations`) đọc bằng `!== false`, riêng `commandPlan` đọc bằng `=== true`. Cờ này quyết định câu
`planOutcomeText` in ra. Với `=== true`, một payload thiếu trường → `false` → màn nói **không có gì
được gửi tới Trading System**. Đó là hướng sai duy nhất không thể chấp nhận: thà nói *có thể đã xảy ra*
còn hơn hứa là *chưa xảy ra*.

**#4 — `UNKNOWN` không phải chỗ trống.** `FreshnessState = "OK" | "AGING" | "STALE" | "PAUSED" | "UNKNOWN"`.
Nên `live?.freshness ?? "UNKNOWN"` không để trống một ô — nó **báo cáo một giá trị enum hợp lệ** mà stream
chưa từng gửi. Đã tách thành ba câu: *cổng đóng* / *đã công bố nhưng chưa nối* / *đang live*. Chỉ câu
thứ ba mang `data-live="true"`, vì cờ là của server còn socket là của mình.

**#3 — vì sao chưa ai thấy.** Cả 5 fixture Command Centre đều `stream_available: false`, nên nhánh sau
cổng **chưa từng chạy trong bất kỳ test nào**. Ngày codex bật cờ là ngày nó chạy lần đầu, trên production.
Đã nối hook qua container `CommandCenterLive`; hook vẫn từ chối mở khi `stream_available=false` **và** khi
không có factory, nên trang fixtures truyền `null` và chứng minh được là nó không mở gì.

**#8 — 6 chỗ rỗng, 17 chỗ vô hại.** Chỗ tệ nhất là test *"returns nothing for a view it does not
recognise"*: nếu API trả `!ok` thì test xanh — đúng ngay chỗ nó sinh ra để phân biệt **rỗng** với **hỏng**.
Đã đổi cả 23 chỗ sang `throw`: hẹp kiểu y hệt `return` nhưng đỏ thay vì im lặng.

---

## 2. Hai gate cấu trúc mới (để không tái diễn)

Sửa 8 lỗi là việc của hôm nay; hai lỗi #1 và #2 sống sót qua **1.457 test xanh** nên bản thân việc sửa
không đủ.

- **`failClosed.test.ts`** — khai báo với mỗi cờ **giá trị nào là nguy hiểm**, rồi bắt reader dùng đúng
  toán tử để giá trị vắng rơi về phía an toàn. Chiều không đồng nhất và không thể đồng nhất:
  `source_side_effect_requested: true` là giá trị nguy hiểm, `source_status_unchanged: true` là giá trị
  trấn an — hai cái fail closed ngược nhau. Gate còn bắt **một trường đọc hai chiều**, và **liệt kê cờ mới
  chưa được phân loại** thay vì mặc định bỏ qua.
  Bốn cờ `*_required` của catalogue được tách riêng: chúng **mô tả giao thức**, không cấp quyền cũng
  không cảnh báo, và hiện không chặn gì (`AdminActionDrawer` chưa mở đường plan/apply nào vì relay đang tắt).
- **`testHygiene.test.ts`** — cấm `if (!x.ok) return;` trong thân test.

Cả hai gate đều **tự kiểm bản thân**: có một test khẳng định số file/so sánh quét được lớn hơn ngưỡng,
vì một gate quét ra rỗng sẽ xanh vĩnh viễn — đúng kiểu hỏng mà nó sinh ra để cấm.

---

## 3. Chứng minh, không phải khai báo

Mỗi bản sửa đều được **đảo ngược lại** rồi chạy test để xem có đỏ không:

| Bản sửa | Đảo lại → số test đỏ |
|---------|----------------------|
| #1 chiều fail-closed | 2 |
| #4 banner Live | 2 |
| #6 + #7 hai câu bịa | 2 |

Một lần chạy mutation đầu tiên báo "0 đỏ" — do lệnh docker thiếu tên image nên `npx` bị hiểu thành image
và lệnh hỏng hoàn toàn. Đã chạy lại đúng. Ghi lại đây vì "0 đỏ" từ một lệnh hỏng trông y hệt "0 đỏ" từ
một test rỗng.

---

## 4. Các lớp đã quét và **không** ra lỗi

Kết quả âm tính cũng là kết quả — ghi lại để lần sau không quét lại:

- **Màn/container không được mount** — cả 17 màn và toàn bộ container đều có mặt trên `/execution/_fixtures`.
  Chỉ một component chết: `ApprovalInboxUnavailable` (đã xoá — `KeysetTable` nhận `status`+`reason` và đã
  tự trình bày mọi trạng thái, nên nó thừa và lời hứa an toàn trong doc-comment của nó là hứa suông).
- **Class CSS không có rule** — chỉ #5. Hoá ra dự án **đã có sẵn** `.sr-only` ở `styles/base.css:370`;
  tôi tự đặt ra `exec-sr-only` rồi quên viết rule. Đã dùng lại class có sẵn.
- **`expect` so hai vế cùng nguồn** — không có.
- **Nút không có tên tiếp cận / `aria-hidden` bọc phần tử focus được** — không có.
- **`??` sinh giá trị thay vì đánh dấu vắng mặt** — quét 30 chỗ, 28 chỗ đúng (`"not stated"`,
  `"an unpublished number of"`), 2 chỗ sai là #6 và #7.
- **Reader đọc trường không hợp đồng nào công bố** — 27 ứng viên, tất cả là dương tính giả.

---

## 5. Chuyển cho codex (không phải lỗi frontend)

`expected_approval_version` và `due_soon` **có** trong `apps/control-api/` nhưng **không** được khai báo
trong `packages/contracts/`. Frontend gửi/đọc đúng, nhưng chúng đang nằm ngoài hợp đồng công bố nên không
có gì ràng buộc chúng khỏi thay đổi. Đề nghị codex đưa vào contract.

---

## 6. Trạng thái gate sau đợt kiểm

```
tsc          sạch
vitest       1.470 passed / 1 skipped (65 files)   [+13 test, +2 file so với trước]
vite build   sạch
playwright   101/101 baseline ảnh
```

## 7. Còn lại

- Hai fixture hợp đồng chưa màn nào đọc: `command-operation`, `projection-page`.
- Phase 1 và 3 vẫn `WIP` trên bảng.
- F0 §4 còn 6 test phủ một phần: #5, #6, #7, #9, #13, #14.
- Chờ Bobby quyết: outcome *"Request changes"* của R1/R2 (backend chưa có động từ này).
- Bàn giao mới nhất `CODEX_TO_CLAUDE_EX_BE_05B_F4_HANDOFF.md` (23-08 11:37) đã được ghi nhận trong
  `PHASE_TRACKER.md` và `ROADMAP_FRONTEND.md`.
