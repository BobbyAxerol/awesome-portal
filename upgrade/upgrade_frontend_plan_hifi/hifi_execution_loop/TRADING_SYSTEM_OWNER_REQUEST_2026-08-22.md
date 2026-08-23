# Xin chủ Trading System — bốn thứ Portal đang thiếu

**Ngày:** 2026-08-22 · **Người xin:** Portal frontend (Claude), qua Bobby
**Đã duyệt:** Bobby, 2026-08-22 · **Backend Portal (codex) đã xác nhận** cả bốn
nằm ngoài phạm vi họ tự giải quyết được.

> **Portal không xin quyền đọc thẳng Postgres, Redis, CLI hay SSH.** Ranh giới
> đó do chính codex đặt (handoff §2.3, stop gate EX-BE-05b/F0) và chúng tôi
> không xin nới. Bốn mục dưới đây đều xin **HTTP có kiểu**.

---

## Vì sao gửi cả bốn cùng lúc

Bốn thứ này cùng một chủ. Tách ra thì mỗi lần lại tốn một vòng chờ, và ba trong
bốn màn đã dựng xong đang đứng yên chỉ vì thiếu một trường.

**Hiện tại không màn nào nói dối.** Cả bốn đã xuống cấp trung thực — chúng nói
ra thứ chúng không có. Nên đây không phải yêu cầu khẩn cấp về tính đúng đắn; nó
là yêu cầu về **năng lực**.

**Một ngoại lệ đáng để lên đầu:** mục 1 (`sample_counts`) là chỗ duy nhất người
vận hành có thể bị **một con số trông chắc chắn** dẫn sai.

---

## 1. `sample_counts` cho packed correlation matrix 🔴

**Màn:** Portfolio 360° · **Mã cũ:** BR-EX-27

### Vấn đề

Ma trận correlation vẽ `0.9` **y hệt nhau** dù nó tính từ 4 mẫu hay 4.000 mẫu.
Portal không có cách nào phân biệt, nên không đánh dấu ô nào được.

Đây là mục duy nhất trong bốn mục mà lỗi là **một con số trông hợp lý**, chứ
không phải một khoảng trống. Ba mục kia màn đã nói "tôi không có"; mục này màn
vẽ ra một con số.

### Xin

Trong `PackedMatrixRepresentation`, thêm `sample_counts` **đóng gói cùng cách
với `values`** (`LOWER_INCLUDING_DIAGONAL_ROW_MAJOR`, độ dài `n(n+1)/2`):

```json
"matrix": {
  "dimension": 24,
  "packing": "LOWER_INCLUDING_DIAGONAL_ROW_MAJOR",
  "values": ["1", "0.25", "1", "..."],
  "sample_counts": [4180, 4180, 3921, "..."]
}
```

### Vì sao nên dễ

Bạn **đã gửi** `sample_count` cho từng cặp trong `RANKED_PAIRS`. Đây là **cùng
dữ liệu**, chỉ khác cách đóng gói.

### Portal đã sẵn sàng

Reader đọc `sample_counts` forward-compatible từ trước; màn đã có luật
"dưới 200 mẫu thì không vẽ số, vẽ `—`" và **có test cả hai nhánh**. Ngày trường
này tới, không dòng code màn nào phải đổi.

---

## 2. Verdict aggregate exposure 🟠

**Màn:** Account/Broker 360° · **Mã cũ:** BR-EX-26

### Vấn đề

Màn phải trả lời "binding này còn headroom không". Đây là **control fail-closed**
— nếu nó nói sai, người vận hành đặt lệnh vào chỗ đã hết room.

Browser **không thể** tự cộng, kể cả nếu muốn: nó chỉ thấy `linked[]` mà endpoint
chọn trả về. Cộng chúng lại là trả lời một câu hỏi về **response**, không phải
về **binding**. Ví dụ thật đã gặp: browser cộng ra `+2.120` trong khi execution
cell giữ `46.800` và chặn mọi lệnh — màn nói **ngược** với thứ sắp xảy ra.

### Xin

Trong `BindingExposureData`, thêm `aggregate` do **server phán**:

```json
"aggregate": {
  "verdict": "OK",
  "headroom": "46800.00",
  "virtual_total": "12000.00",
  "physical_total": "58800.00",
  "currency": "USDT",
  "evaluated_by": "execution-cell",
  "as_of": "2026-08-22T10:00:00Z"
}
```

`verdict` là `OK` · `EXCEEDED` · `UNKNOWN`. `UNKNOWN` là **câu trả lời hợp lệ**
— một dân số không hoàn chỉnh thì không đỡ được `OK` lẫn `EXCEEDED`, và nói ra
điều đó khác với im lặng.

Hai `*_total` là **bằng chứng** đứng sau verdict. Hi-fi hiện cả hai, vì một
verdict không có phần tính hiện ra là một lời khẳng định, và màn này từ chối
khẳng định về exposure.

### Portal đã sẵn sàng

Reader đọc `aggregate` forward-compatible (`analytics.ts`), màn hiện
`unavailable` kèm lý do khi thiếu và **không bao giờ tự cộng**. Có test khẳng
định trường này **vẫn vắng** — ngày bạn publish, test đỏ và Portal dùng ngay.

---

## 3. Tám route HTTP có kiểu cho `ops` 🟠

**Màn:** Operations Queue (7), Incident Detail (8), Command Center (9)
**Mã cũ:** BR-EX-28 §8.1

### Vấn đề

Tám action này CLI chạy được, Portal thì không — không có route HTTP nào:

| Action | Màn cần |
|---|---|
| `ops command-journal` · `ops findings` | Operations Queue |
| `ops alerts` · `ops dead-letters` · `ops trace-order` | Incident Detail |
| `ops streams` · `ops alpha-activity` | Command Center |
| `ops redis-retention` | Command Center / hardening |

Toàn bộ bề mặt `/ops` trong OpenAPI hiện có **4 path, đều là emergency-close**.

Lưu ý: `extract/cli-command-map.json` **trông như** tám cái này tới được, vì nó
gán path của *handler* cho mọi action trong handler. Đó là ảo giác — chúng tôi
đã đối chiếu ngược với OpenAPI.

### Xin

Tám route `GET` có kiểu, mỗi cái một schema response. Không cần gộp, không cần
generic.

### Portal không xin gì khác

Codex đã ghi tám action này `portal_reachable=false` trong catalogue canonical
và đưa vào stop gate là **phải hiện ra ở trạng thái không dùng được**. Portal
**không** thay thế chúng bằng đọc thẳng DB/Redis. Đây là chỗ duy nhất mở được.

---

## 4. Endpoint list order theo keyset 🟠

**Màn:** Full Blotter · **Mã cũ:** BR-EX-24

### Vấn đề

Có `GET /orders/{id}/funnel` cho **một** order. Không có gì cho **danh sách**.
Full Blotter đã dựng xong, chạy fixture, không lên được route sản phẩm.

### Xin

Một endpoint list theo keyset, **bounded theo scope**:

```
GET /v1/.../orders?scope=...&after=<cursor>&limit=<n>&status=<bucket>&sort=...
```

Ba điều kiện Portal cần giữ:

1. **Lọc và sắp xếp phía server.** Chip trạng thái báo cáo và query lại; chúng
   không lọc trang đã tải. Một chip lọc phía client sẽ hiện 9 dòng "FILLED"
   cạnh chân trang ghi "48.213 total" — hai con số mô tả hai dân số khác nhau,
   trình bày như một.
2. **`total_count` và `filtered_count` là hai trường riêng**, không phải một số
   để trừ.
3. **Bounded rõ ràng**: nếu response là cửa sổ thì `has_more` + `window` như
   funnel và ledger đã làm. Portal hiện "showing X of Y" và **không** đọc cửa
   sổ như toàn bộ lịch sử.

### Portal đã sẵn sàng

Bảng keyset, chip re-query, cap trung thực và ràng buộc chiều cao cố định đều đã
dựng và có test. Thiếu đúng cái endpoint.

---

## Tóm tắt

| # | Xin | Màn | Mức |
|---|---|---|---|
| 1 | `sample_counts` trong packed matrix | Portfolio 360° | 🔴 |
| 2 | `aggregate` verdict trong binding exposure | Account/Broker 360° | 🟠 |
| 3 | 8 route HTTP có kiểu cho `ops` | Phase 7, 8, 9 | 🟠 |
| 4 | Endpoint list order theo keyset | Full Blotter | 🟠 |

**Nếu chỉ làm được một: mục 1.** Nó mở ít nhất, nhưng là cái duy nhất người vận
hành hiện có thể bị một con số trông hợp lý dẫn sai.
