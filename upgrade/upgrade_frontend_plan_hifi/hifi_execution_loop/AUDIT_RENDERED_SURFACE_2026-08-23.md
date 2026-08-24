# Soi lỗi trên bề mặt đã render — 2026-08-23 (đợt 2)

Goal: *"Tiếp tục soi lại các lỗi ở các màn nhé, kỹ hơn"*.

Đợt trước soi **mã nguồn** và tìm ra 8 lỗi. Đợt này soi **thứ trình duyệt thật sự vẽ ra**, vì vừa có
80 ảnh baseline làm lưới. Nhưng soi bằng mắt trên 116 case thì bỏ sót nhiều hơn là bắt được, nên tôi
viết một máy quét chạy trên DOM đang sống của cả trang, ở hai breakpoint.

Điểm cần nói trước: **ảnh baseline không đủ.** Nó chứng minh một màn *không đổi*; nó không nói được
thứ nó đóng băng ban đầu có đúng hay không. Và mọi lỗi dưới đây đều **không** làm ảnh đổi đủ nhiều —
một cột bị cắt và một cột xuống dòng chênh nhau vài pixel mà ngân sách 0,2% tha thứ hết.

---

## Lỗi tìm được và đã sửa

### 1. Trang cuộn ngang ở **cả hai** breakpoint

`1295 > 1280` và `1762 > 1728`. Đây là vi phạm trực tiếp luật của dự án. Thanh cuộn ngang không phải
lời phàn nàn thẩm mỹ: nó nằm dưới đáy cửa sổ và đẩy lệch mọi màn phía trên.

Ba nguồn lan tới thân trang:

| Nguồn | Đo được | Nguyên nhân |
|---|---|---|
| `.exec-cert-blocker` | token 234px trong ô 172px | `SANDBOX_STEP_RECONCILIATION_UNAVAILABLE` không có chỗ ngắt, nên track grid phình ra và dải bước đẩy quá bề mặt của chính nó |
| `.exec-authority` | 431px trong cột 321px | `white-space: nowrap` trên một dòng gồm ISO timestamp + age + digest |
| `.exec-360-sync` | 497 > 486 | bảng drift `width: 100%` không có khung cuộn |

Bản sửa `.exec-authority` đáng nói: các phần được nối bằng `" · "` và **không phần nào chứa khoảng
trắng**, nên cho xuống dòng bình thường chỉ có thể ngắt **giữa các phần** — dấu thời gian không bao giờ
bị bẻ đôi, đúng thứ mà `nowrap` đang bảo vệ.

### 2. Bảng tiền bị cắt mất, không cuộn tới được

`exec-gate-capital` trong Gate R2 Review: **731 > 544**, và máy quét xác nhận `CLIPPED (no scroller)` —
không tổ tiên nào cuộn được. 187px của một **bảng tiền** bị vẽ ra ngoài panel và không cách nào đọc.
Đã bọc trong `.exec-scroll-x`. M6 cấm cắt số, nên cuộn là câu trả lời duy nhất.

### 3. 22 id DOM trùng nhau

Ba màn hard-code id tab: `paper-tab-Orders`, `alpha-tab-Overview`, `pf-tabpanel`… Trang fixtures render
**năm** bản Paper Workbench, nên năm bộ tab cùng mang một id.

Đây không phải lỗi validator. `aria-controls` và `aria-labelledby` phân giải về **kết quả khớp đầu tiên**,
nên tab của bản thứ hai đến thứ năm đều trỏ về panel của **bản thứ nhất**. Đã đổi sang `useId()` —
trước đợt này `useId` chưa được dùng ở đâu trong dự án.

---

## Đã kiểm và **không** phải lỗi

- **M6 — số không bao giờ bị cắt: giữ vững.** Máy quét báo 12 ô bảng bị cắt, nhưng đo tiếp thì cả 20 ô
  bị cắt trên trang đều là `data-truncate="true"` **có `title`**, và **không ô `data-numeric` nào** bị
  cắt. Đúng luật đã ghi trong chính stylesheet: *"Prose may truncate, and only with a title attribute
  supplied by the caller."* Luật đó giờ đã thành test chạy được, thay vì một câu chú thích.
- **Khối CLI trong drawer**: thoạt nhìn tưởng bị cắt (`406 > 293`), nhưng nó nằm trong khung cuộn được —
  đúng cách xử lý đã quy định cho nội dung rộng. Loại khỏi danh sách sau khi siết phép đo.
- **Tương phản chữ**: 0 lỗi WCAG AA trên toàn bộ 116 case, ở cả hai breakpoint. Đo bằng cách **đi ngược
  lên cây tìm nền thật**, vì gần như mọi token ở đây vẽ trên nền trong suốt — chấm với `transparent` là
  so chữ với hư không và cái gì cũng đạt.
- **Nút không tên / phần tử kích thước 0**: 0.

---

## Gate mới: `execution-surface-audit.spec.ts` (14 test)

Máy quét được giữ lại thành gate thường trực, vì nó hỏi câu mà ảnh không hỏi được:

1. trang không bao giờ cuộn ngang;
2. không nội dung nào bị cắt mà không có đường cuộn tới;
3. ô bảng bị cắt phải là prose **và** phải mang `title` (M6 thành mã);
4. không id nào dùng hai lần;
5. mọi control có tên tiếp cận;
6. chữ đạt WCAG AA so với **nền thật phía sau nó**;
7. và một test khẳng định trang có ≥40 group và >2000 phần tử — vì sáu test trên đều là dạng "không có
   vi phạm", mà một trang trắng thì không có vi phạm nào cả.

## Một bản sửa của tôi hoá ra thừa — và test chứng minh điều đó

Tôi sửa dải cert bằng **hai** thay đổi: `min-width: 0` trên step và `overflow-wrap: anywhere` trên
blocker. Khi mutation-test, đảo `min-width` về `auto` → **14 xanh, không bắt được**; đảo `overflow-wrap`
về `normal` → **4 đỏ**.

Nên chỉ `overflow-wrap` là bản sửa thật. `min-width: 0` được giữ lại nhưng chú thích đã viết lại cho
đúng sự thật: nó không phải thứ vá lỗi này, nó phòng trường hợp khác (một **phần tử con** rộng, thứ mà
ngắt chữ không giải quyết được). Chú thích cũ nói sai và sẽ đánh lừa người đọc sau.

---

## Còn lại

- `execution-projection-page.valid.json` vẫn chưa màn nào đọc.
- Máy quét mới chỉ chạy trên trang fixtures. Nó không phủ trạng thái sau tương tác (drawer đã mở, tab đã
  đổi, bảng đã cuộn) — những trạng thái đó chỉ tồn tại sau một cú click và cần fixture riêng.
