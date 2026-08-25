# F0 §4 test 13 + hợp đồng `projection-page` — 2026-08-23 (đợt 3)

Goal: làm #1 (test 13 của F0 §4) rồi #2 (`execution-projection-page`), và lập luận về việc
assert 401/502 cho SSE run của QuantBT để Bobby duyệt.

---

## 0. Một lỗ trong chính rule 8 của tôi

Rule 8 chạy `ls -t CODEX_TO_CLAUDE_*.md | head -5`. Có **7 file**, nên nó **luôn giấu**
`CODEX_TO_CLAUDE_EX_BE_05B_F0_HANDOFF.md` — đúng cái gói còn nợ test. `head -5` giả định handoff cũ
thì đã xong, và giả định đó sai ngay từ ngày tôi viết luật. Đề nghị bỏ `head` hoặc đổi thành liệt kê
gói nào **chưa được đánh dấu đã đọc** trong `PHASE_TRACKER.md`.

---

## 1. F0 §4 test 13 — "keyboard/focus/reduced-motion and narrow drawer states remain covered"

Chữ **"remain"** hoá ra là chính xác: hành vi đã đúng sẵn. Thứ không tồn tại là test sẽ nhận ra khi nó
thôi đúng — grep `prefers-reduced-motion`, `focus`, `keyboard`, viewport hẹp trên toàn bộ file test của
execution trả về **0 file**.

### Đo trước, viết sau

| Thuộc tính | Đo được | Kết luận |
|---|---|---|
| Bàn phím | hàng click được có `role="button"`, `tabIndex={0}`, xử lý Enter và Space | đã đúng; test đã có ở `execution.test.tsx:4752` |
| Focus | 21 rule `:focus-visible` trong `execution.css`; 0/60 control không đổi style khi focus | đã đúng, **chưa có test** |
| Reduced motion | `execution.css` có **0** transition/animation; `base.css` có reset chuẩn | đã đúng, **chưa có test** |
| Drawer khổ hẹp | 390 → `324>324`, 834 → 0 clip bên trong | đã đúng, **chưa có test** |

Không có lỗi nào để sửa ở phần này — nên việc đúng là **ghim ba thuộc tính chưa được ghim**, không phải
bịa ra lỗi để tỏ ra hữu ích.

### Thứ tôi cố ý **không** assert

`.exec-drawer` là `<section aria-label>` nằm trong flow, `max-width: 490px`, không backdrop, không chặn
trang. Nó là **panel nội tuyến, không phải overlay**. Nên focus trap, `aria-modal`, Escape-to-close là
hợp đồng nó không có — assert chúng sẽ đẩy người sau vào việc đi cài một modal mà thiết kế không đòi.

### Gate mới: `execution-interaction-audit.spec.ts` (4 test)

Mỗi assert đều **mutation-proven**:

| Đảo ngược | Kết quả |
|---|---|
| giết `:focus-visible` của nút drawer/filter | **1 đỏ** |
| gỡ reset reduced-motion trong `base.css` + thêm transition 300ms | **1 đỏ** |
| ép `.exec-drawer { min-width: 520px }` | **2 đỏ** (cả 390 và 834) |

Mutation thứ ba đáng kể: **bản test đầu tiên của tôi không bắt được nó.** Tôi đo tràn *bên trong*
drawer, mà một drawer bị ghim 520px trong viewport 390px thì nội dung vừa khít 520 — `scrollWidth -
clientWidth` bằng 0 trong khi panel thò hẳn ra ngoài màn hình. Đã thêm hai phép đo nữa: rộng hơn
viewport, và rộng hơn khung chứa.

### Phát hiện phụ — **ngoài phạm vi test 13, cần Bobby quyết**

Đo ở khổ hẹp thì bản thân drawer ổn, nhưng **các màn 360° thì không**:

| Khổ | Thân trang | Số gốc bị cắt |
|---|---|---|
| 834 (tablet) | `932 > 834` — cuộn ngang | 8 |
| 390 (phone) | `932 > 390` | 96 |

`account-broker-360-1g` rộng cứng **900px** trong khung 770px. Câu hỏi không phải "sửa thế nào" mà
**"tablet có phải breakpoint được hỗ trợ không"**. Tôi đã lập luận (và vẫn giữ) rằng không ai vận hành
deployment trên điện thoại, nên 390 không đáng theo đuổi — nhưng **834 thì hợp lý**, và ở đó thân trang
đang cuộn ngang thật. Chưa sửa, chờ quyết định.

---

## 2. `execution-projection-page.v1` — hợp đồng cuối chưa ai đọc

Đọc nó ra **hai lỗi**, cả hai đều thuộc họ đã gặp:

### 2.1 `KeysetPage.retention` được khai từ phase 0 và **không reader nào điền vào**

`readKeysetPage` trả về `rows`, `totalCount`, `filteredCount`, `nextCursor`, `prevCursor`, `hasMore`,
`hasPrevious`, `appliedSort`, `appliedFilters` — **và bỏ `retention`**. Nghĩa là cả module retention
(5 outcome, luật "rỗng vì lạnh ≠ rỗng vì không khớp", nút xin restore) nằm sau một trường **không ai
phân tích**: mọi trang trong sản phẩm đều mang `retention: undefined` bất kể server gửi gì.

Đây đúng là kiểu "cầu xây một đầu" đã sửa ở `useCommandCentreStream`, lần này ở chiều ngược lại —
đầu tiêu thụ dựng xong, đầu đọc không có.

### 2.2 Tên trường là `availability`, không phải `outcome`

Hợp đồng công bố `{ "availability": "UNKNOWN", "policy_version": "UNCONFIGURED" }`. Frontend đọc
`retention.outcome`. Tôi truy ngược: `EX-BE-04b` **gọi tên năm giá trị trong văn xuôi mà không hề đặt
tên cho trường**, và đây là hợp đồng **duy nhất** công bố retention. Nên `outcome` là tôi tự đoán.

Hậu quả nếu để nguyên nặng hơn "không đọc được": `retentionReason` tra bảng chữ bằng chính giá trị đó,
nên `OUTCOME_TEXT[undefined]` sẽ in ra **chữ "undefined"** cho người vận hành. Fail-closed đúng ở phần
trạng thái (`emptyMeansEmpty` trả false), nhưng câu giải thích thì hỏng.

### Đã sửa

`readRetention` mới: đọc `availability`, vẫn chấp nhận `outcome` để một server lỡ dùng tên đoán kia
không bị đọc sai; giá trị lạ hoặc thiếu → **`UNKNOWN`, không bao giờ `HOT`** ("tất cả đang online" là
câu trả lời tệ nhất có thể ở đây); giữ nguyên `UNCONFIGURED` vì đó là một **câu trả lời đã công bố**,
không phải trường thiếu.

11 test trong `projectionPage.test.ts`, nạp thẳng file hợp đồng. Mutation: gỡ nối retention → **5 đỏ**;
chỉ đọc `outcome` → **1 đỏ**.

### 2.3 Chưa làm, cố ý: `aggregates_by_currency`

Hợp đồng công bố tổng hợp phía server (M7) theo từng loại tiền:

```json
{ "currency": "USDT", "row_count": 45500, "quantity_count": 45500,
  "quantity": "125000.250000000000000001", "notional_count": 45500,
  "notional": "4875000.750000000000000001", "invalid_numeric_count": 0 }
```

**Không màn nào đọc.** Full Blotter hiện đếm dòng và phí từng dòng, không có tổng theo tiền tệ — tức
đang thiếu tính năng chứ không nói sai.

Tôi **cố ý không** thêm reader cho nó lúc này: thêm reader mà không màn nào hiển thị chính là lớp lỗi
"cầu xây một đầu" tôi vừa dành ba đợt để xoá. Đề nghị làm thành một bước riêng có UI thật, và khi làm
phải giữ ba điều: ba biến đếm (`row_count`/`quantity_count`/`notional_count`) **không được gộp** — chúng
trả lời "tổng này phủ bao nhiêu dòng"; `invalid_numeric_count > 0` phải hiện, vì nó nghĩa là có dòng
server không đọc được số; và các số là **chuỗi 18 chữ số thập phân**, `Number()` sẽ mất chính xác (đã
có test ghim điều này).

---

## 3. Còn lại

- Quyết định breakpoint 834 (mục 1).
- `aggregates_by_currency` + UI tổng theo tiền tệ (mục 2.3).
- Sửa rule 8 (mục 0).
- Ba dòng phase 1/2/3 trên `PHASE_TRACKER.md` vẫn `WIP` trong khi ghi chú nói phần frontend đã xong —
  nên sửa cho hết nợ giả.
