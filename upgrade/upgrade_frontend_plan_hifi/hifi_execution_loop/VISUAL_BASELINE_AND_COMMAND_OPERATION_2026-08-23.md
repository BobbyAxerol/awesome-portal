# Baseline ảnh cho Execution Loop + tiêu thụ `execution.command-operation.v1` — 2026-08-23

Goal Bobby duyệt: làm #1 trước rồi #2 — dựng baseline ảnh, vì nó soi ra đúng loại lỗi trình bày mà
1.470 unit test không thấy; làm trước thì #2 sửa gì cũng có lưới hứng.

---

## Phần 1 — Baseline ảnh: từ 0 lên 80

### Trước khi làm

101 ảnh baseline của repo phủ **QuantBT**. Bốn ảnh có chữ "execution" trong tên là tab *run execution*
của QuantBT, không phải bề mặt này. **17 màn và 116 case fixture của Execution Loop có 0 pixel được kiểm**,
suốt nhiều phase được gọi là "hifi".

### Cách chụp và vì sao

- **Theo từng group, không theo trang.** Một ảnh của trang 116 case thì không ai soi được, và ngân sách
  diff 0,2% trên một khung cao ngần ấy sẽ nuốt trọn một panel hỏng.
- **Chỉ laptop + workstation**, theo đúng lý lẽ `visual.spec.ts` đã áp cho màn Research: không ai được
  yêu cầu vận hành deployment trên điện thoại.
- **Một theme là đủ — nhưng phải chứng minh.** Surface Carbon do wrapper quyết định qua `data-theme`
  (không phải class name, tôi đã đoán sai lần đầu và test đỏ). Có hai test đo **độ sáng nền thật** dưới
  cả `research` lẫn `operations`: governance phải sáng, deployments phải tối. Chứng minh xong thì ma trận
  theme mới bỏ đi được mà không mất gì.
- **Địa chỉ tường minh.** 40 group được gắn `data-group` viết thẳng trong `Fixtures.tsx`, không suy từ
  tiêu đề: ba group trùng tiêu đề ("Equity", "Allocate capital"), slug suy ra sẽ **đè baseline của nhau** —
  độ phủ trông như có mà không có.
- **Hai test cấu trúc**: danh sách group trên trang phải khớp **đúng thứ tự** với danh sách trong spec
  (thứ tự cũng là một lập luận), và không hai group nào trùng địa chỉ. Group mới sẽ làm đỏ, buộc người ta
  quyết định, thay vì được chụp âm thầm rồi pass mãi mãi.

### Ba vấn đề tìm ra trong lúc dựng

**1 — Hai ảnh workstation đỏ ngay cả khi đang sinh baseline.** `admin-action-drawer` và `paper-workbench`,
laptop thì xanh. Nghi bất ổn layout, nhưng **đo trước khi sửa**: lấy bounding box 8 lần trong một giây →
một kích thước duy nhất, không dao động. Chụp trần bằng `screenshot()` → **625KB trong 1976ms**.
`toHaveScreenshot` chụp **hai lần để so** cho chắc ổn định, nên 2×2s cộng overhead vượt ngân sách 5s mặc
định. Nới lên 30s, kèm số đo trong chú thích — không phải nới bừa cho hết đỏ.

**2 — Topbar của shell in đè ngang giữa ảnh.** `.portal-topbar` là `position: sticky; z-index: 30`, nên
với group đủ cao để bị cuộn xuống dưới nó, cả một thanh chọn workspace và ô tìm kiếm cắt ngang ba
command drawer. Đó là hành vi sticky bình thường, **không phải lỗi** — nhưng nó làm bẩn baseline của bề
mặt bên dưới và chỉ bẩn ở group cao, nên các ảnh không so được với nhau. Ẩn bằng `visibility`, **không**
`display`: phần tử sticky vẫn chiếm chỗ trong flow, nên cách này bỏ pixel mà không xê dịch gì; `display:
none` sẽ nới rộng nội dung và ta đi baseline một layout không ai gặp.

**3 — Và bộ so ảnh không nhìn thấy vấn đề 2.** Đây mới là phần đáng ghi.

Sau khi ẩn topbar, tôi sinh lại và **chỉ 28/80 ảnh được ghi đè**. Ảnh `command-center` vẫn còn nguyên dải
topbar, mà chạy lại vẫn **xanh**. Lý do: dải đó là chrome tối trên nền tối, và `toHaveScreenshot` bỏ qua
chênh lệch màu mỗi pixel dưới `threshold` mặc định 0,2 — chỉ vài nét chữ trong dải được tính là khác, quá
nhỏ so với ngân sách 0,2% khung. **Suite xanh trên một bộ baseline pha trộn.**

Kiểm chứng bằng cách chụp cùng một phần tử hai lần trong một phiên: `before=158741` byte,
`visHidden=154717` byte — style có ăn, chỉ là bộ so không phân biệt được.

Xử lý: **xoá sạch thư mục ảnh rồi sinh lại toàn bộ 80**, để mọi ảnh cùng một điều kiện. Và thêm một chốt
trong spec: sau khi chèn style, **assert `getComputedStyle(topbar).visibility === "hidden"`**. Nếu class
bị đổi tên, dòng đó đỏ — thay vì lặng lẽ đi baseline những ảnh nhiễm bẩn mà bộ so không cãi được.

### Xác nhận trực quan

Soi ảnh, không chỉ sinh ảnh:
- Dải bước trong drawer hiện `✓ PLAN · → APPLY · VERIFY` sạch — **không** còn chữ `(done)/(current)/
  (not reached)` lộ ra. Đây là lỗi `exec-sr-only` sửa sáng nay, giờ có bằng chứng pixel.
- Câu của `streamGate` đọc trọn vẹn trên Command Center.
- Chip `BLOCKED` (amber) và `NOT_STARTED` (mute) của phần 2 hiện đúng vị trí, đúng tông.

### Tính tất định

Chạy lại độc lập lần hai: **185 passed / 0 failed** (101 QuantBT + 84 execution). Mỗi ảnh tái tạo được.

---

## Phần 2 — `execution.command-operation.v1`: đọc 2 trường trên 12

Hợp đồng đã publish, nằm sẵn trong `packages/contracts/fixtures/`, và `pollOperation` đọc **hai** trường.
Nạp chính file đó vào test tìm ra **năm** lỗi:

| # | Trường | Đang bị sao | Hậu quả |
|---|--------|-------------|---------|
| 1 | `status: "BLOCKED"` | không có trong `OPERATION_STATUSES` | `readEnum` chấm **ví dụ chuẩn của chính hợp đồng** là token lạ; container bỏ đi ⇒ poll một operation bị chặn thì **không thấy trạng thái nào** |
| 2 | `verification_result: "NOT_STARTED"` | không có trong `VerificationResult` | trạng thái **khởi đầu của mọi operation** bị coi là không đọc được; walk đứng ở "build này không nhận ra" |
| 3 | `relay_receipt` | đọc nhầm tên `receipt`/`receipt_id` | luôn null — bằng chứng relay đã làm gì **không bao giờ tới màn** |
| 4 | `blockers: ["COMMAND_RELAY_DISABLED"]` | không ai đọc | màn nói được "đang kẹt" mà **không nói được vì sao** |
| 5 | `source_side_effect_requested` | không ai đọc | sau apply, **không có câu trả lời nào** cho "cái đó có tới Trading System không" |

Lỗi 2 đáng chú ý: `operations.ts` **có** `NOT_STARTED` từ đầu. Hai bản sao của **cùng một trục** với thành
viên khác nhau, và chỉ một bản khớp hợp đồng. Đúng họ với lỗi `deployment_resume_requested` sáng nay.

### Đã nối tới đâu

Sửa reader thôi thì trường mới vẫn không tới được người dùng, nên đi hết chuỗi: `contracts.ts` (vốn từ) →
`adapter.ts` (đọc) → `ports.ts` (`OperationSnapshot`) → `httpApi.ts` + `fixtureApi.ts` → `containers.tsx`
→ `decision.ts` (state + **cả bốn nhánh** ra khỏi case `POLLED`).

Bốn nhánh là chi tiết quan trọng: đặt trường mới lên một nhánh nghĩa là nó vô hình trên ba nhánh kia — đúng
hình dạng của một nửa số lỗi tìm được hôm nay. Có test `it.each` chạy qua từng nhánh.

`initialDecision` khởi tạo `sourceSideEffectRequested: true` — cùng chiều fail-closed mà gate
`failClosed.test.ts` đang canh: một intent chưa biết kết cục thì **không được đọc thành "chưa đụng gì"**.

### Hai `Record` toàn phần bắt phải quyết định

Thêm giá trị vào union làm `tsc` đỏ ở `badges.tsx` hai lần — đúng việc của nó. `BLOCKED: "warn"` (lệnh
không *thất bại*, chỉ là không có gì được relay — "bad" sẽ báo một kết cục chưa hề xảy ra, "mute" sẽ làm
một operation bị chặn trông như vô hại). `NOT_STARTED: "mute"` như `PENDING`.

Cả hai giá trị cũng được đưa lên trang fixtures: bề mặt bằng chứng mà thiếu một trạng thái hợp đồng có
publish thì đó là lỗ trong bằng chứng, không phải một danh sách gọn hơn.

---

## Còn lại

- `execution-projection-page.valid.json` vẫn **chưa màn nào đọc** — phong bì keyset chuẩn
  (`total_count`, `filtered_count`, `applied_filters`). Việc kế tiếp làm được ngay, không cần codex.
- Ngưỡng màu mặc định 0,2 của `toHaveScreenshot` vẫn là điểm mù cho chrome tối trên nền tối. Chốt
  visibility che đúng trường hợp đã gặp; nếu sau này thêm overlay tối khác thì phải cân nhắc siết
  `threshold` cho riêng spec này — chưa siết vì `expect` là cấu hình dùng chung với `visual.spec.ts`.
