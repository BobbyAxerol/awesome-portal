# Plan — PRE-IAM-04 frontend handoff

**Ngày:** 2026-08-22 · **Nguồn:** `CODEX_TO_CLAUDE_PRE_IAM_04_FRONTEND_HANDOFF.md`
(backend commit `5e28693`) · **Trạng thái:** *chưa làm — chờ Bobby duyệt thứ tự*

> Tôi đã **đo thật** từng work package chứ không chép lại doc. Cột "hiện có" dưới
> đây là kết quả đối chiếu code với `packages/contracts`, không phải phỏng đoán.

---

## 0. Tóm tắt — 6 gói, 4 gói có lỗ thật

| Gói | Nội dung | Frontend hiện có | Việc |
|---|---|---|---|
| **C-PI04-02** | Realtime recovery | thiếu **2/7 reason**, thiếu **3 trường** | 🔴 lớn |
| **C-PI04-04** | Funnel + Ledger bounded | **0/7** trường bounded được đọc | 🔴 lớn |
| **C-PI04-05** | Typed analytics 422 | **0/7** mã lỗi được biết | 🔴 lớn |
| **C-PI04-03** | Cursor failure UX | có 2/3 mã | 🟠 vừa |
| **C-PI04-06** | 6 fixture canonical | **1/6** đang nạp từ contract | 🟠 vừa |
| **C-PI04-01** | Audit trùng transport type | chưa đo hết | 🟡 nhỏ, làm cuối |
| **§9** | Sửa tracking (H-1…H-12) | roadmap đang ghi sai | 🟡 nhỏ, làm ngay |

---

## 1. C-PI04-02 — realtime recovery 🔴

**Đo được:**

`GapReason` trong [subscription.ts](../../../apps/portal/frontend/src/execution/subscription.ts)
có 5 reason + `unknown`. Contract có **7**. Hai cái mới rơi vào `unknown`:

| Reason | Frontend |
|---|---|
| `projection_sequence_gap` | ❌ → `unknown` |
| `cursor_ahead` | ❌ → `unknown` |
| `epoch_changed` · `source_discontinuity` · `slow_consumer` · `history_evicted` · `replay_window_exceeded` | ✅ |

Trường của gap envelope:

| Trường | Frontend |
|---|---|
| `resnapshot_not_before` · `missed_events` · `last_good_cursor` | ✅ đọc |
| `latest_available_sequence` | ❌ |
| `earliest_available_sequence` | ❌ |
| `active_epoch_id` | ❌ |

**Việc:**

1. Thêm 2 reason vào `GapReason` và bộ đọc; **không** để `cursor_ahead` bị gộp
   thành `epoch_changed` (H-5 tồn tại chính vì lỗi này).
2. Đọc 3 trường còn thiếu.
3. Bốn nhánh recovery riêng biệt:
   - `projection_sequence_gap` → mất liên tục, giữ dữ liệu cũ **dán nhãn stale**,
     snapshot lại **không sớm hơn** `resnapshot_not_before`;
   - `cursor_ahead` → **xoá cursor** không dùng được, hiện `latest_available_sequence`,
     snapshot sau deadline;
   - `epoch_changed` → bỏ liên tục của epoch cũ, snapshot `active_epoch_id`;
   - `source_discontinuity` → **không** đổi nhãn thành gap thường.
4. `resnapshot_not_before` là **deadline chấp hành**, không phải chữ trang trí —
   và `null` phải có nhánh riêng.
5. Không cho reconnect đồng loạt (retry herd).

**Không làm:** không gắn reducer vào EventSource thật. `stream_available=false`.

---

## 2. C-PI04-04 — Funnel và Capital Ledger bounded 🔴

**Đo được:** `readOrderFunnel` và `readCapitalLedger` trong
[analytics.ts](../../../apps/portal/frontend/src/execution/analytics.ts) đọc
**không một trường bounded nào**.

| Trường | Đọc |
|---|---|
| `event_count` · `returned_event_count` · `has_more` · `window` | ❌ ❌ ❌ ❌ |
| `stages[].event_count` · `stages[].returned_event_count` · `stages[].truncated` | ❌ ❌ ❌ |
| `entry_count` | ✅ |
| `returned_entry_count` · `has_more` · `window` (ledger) | ❌ ❌ ❌ |

**Hệ quả hiện tại:** màn đang hiện một cửa sổ bị chặn **như thể là toàn bộ lịch
sử**. Đây đúng loại lỗi §3.3 cấm — và nó đang sống.

**Việc:**

1. Đọc đủ 7 trường; nhãn `showing X of Y` khi `has_more=true`.
2. `window=LIFECYCLE_AND_LATEST` / `window=LATEST` phải **hiện ra cho operator**,
   không nuốt.
3. Tổng chính xác (`event_count`, gross totals theo currency) tách khỏi số dòng
   trả về — **không cộng lại ở browser** (gate `MONEY_ARITHMETIC` đã canh).
4. Thêm case fixture `has_more=true` và test khẳng định UI **không** nói là đủ.
5. Giữ ràng buộc bảng cố định chiều cao của Full Blotter.

---

## 3. C-PI04-05 — typed analytics failures 🔴

**Đo được:** **0/7** mã lỗi xuất hiện trong toàn bộ frontend.

Sáu mã **422 người dùng sửa được**: `ANALYTICS_INPUT_LIMIT_EXCEEDED` ·
`ANALYTICS_INVALID_CURRENCY` · `ANALYTICS_ACCOUNTING_MISMATCH` ·
`ANALYTICS_SCOPE_MISMATCH` · `ANALYTICS_DUPLICATE_IDENTIFIER` ·
`ANALYTICS_CORRELATION_INVALID`.
Một mã **503 hạ tầng**: `ANALYTICS_ARITHMETIC_UNAVAILABLE`.

**Việc:**

1. Một adapter problem **thuần** dùng chung, không mỗi màn tự map.
2. 422 → giữ dữ liệu cũ **dán nhãn stale** (nơi policy cho phép) + hành động sửa
   **có phạm vi**; 503 → retry/unavailable.
3. Mã lạ → **fail closed**.
4. Không lộ id nguồn, đường dẫn nội bộ, hay text exception.

**Lưu ý riêng, không có trong doc:** H-1 nay **từ chối** decimal vượt scale thay
vì làm tròn. Nghĩa là một lệnh gọi trước đây thành công (với số bị làm tròn) giờ
có thể **422**. Adapter này phải xử lý được, nếu không lỗi sẽ hiện ra như "backend
hỏng".

---

## 4. C-PI04-03 — cursor failure UX 🟠

**Đo được:** `INVALID_CURSOR` ✅ · `CURSOR_EXPIRED` ✅ ·
`CURSOR_CONTEXT_MISMATCH` ❌ (chưa có ở đâu).

**Việc:**

| Mã | Hồi phục |
|---|---|
| `INVALID_CURSOR` | bỏ cursor, xin trang đầu, trạng thái "vị trí đã lưu không hợp lệ" **có giới hạn** |
| `CURSOR_EXPIRED` | giải thích lease hết hạn, xin trang đầu, **giữ nguyên filter/sort** |
| `CURSOR_CONTEXT_MISMATCH` | **xoá** cursor vì workspace/filter/sort đổi; **không bao giờ** replay sang context mới |

Cộng test: context mismatch **không thể** tái dùng dòng của context khác. Không
hiện signature/cursor thô/stack.

---

## 5. C-PI04-06 — sáu fixture canonical 🟠

**Đo được:** chỉ **capital-preview** đang nạp từ `packages/contracts`
([analytics.test.ts](../../../apps/portal/frontend/src/execution/analytics.test.ts)).
Năm cái còn lại chưa. `analytics.fixtures.ts` (514 dòng) là fixture **viết tay
hình dạng backend** — chính thứ doc bảo phải thay.

**Việc:**

1. Sáu test nạp-contract, mỗi fixture một cái.
2. Assertion trình bày cho các trường bounded/error/recovery mới.
3. Fixture scale tự viết **được giữ**, nhưng phải đổi tên rõ là
   *presentation/scale*, không phải ví dụ backend.

---

## 6. C-PI04-01 — audit trùng transport type 🟡

Làm **cuối**, vì bốn gói trên sẽ tự thay phần lớn hình dạng. Sau đó mới thấy
cái gì còn trùng thật.

**Việc:** dùng declaration sinh ra làm transport type; adapter thuần chỉ ở nơi
trình bày cần khác; thêm coverage đỏ khi contract đổi.

---

## 7. §9 — sửa tracking (làm ngay, rẻ) 🟡

Roadmap của tôi đang **ghi sai**: mục E liệt kê H-1…H-12 là còn treo. PRE-IAM-04
đã đóng cả 12, có evidence từng dòng.

1. Mục E: H-1…H-12 → **đóng bởi PRE-IAM-04**.
2. B10 vẫn *implement được*, nhưng **chặn activation** bởi snapshot/SSE parity.
3. BR-EX-24…29 vẫn là request mở riêng.
4. **A1a giữ nguyên**: 8 route `ops` vẫn chưa có, và Portal **không** được thay
   bằng đọc thẳng DB/Redis.

---

## 8. Thứ tự tôi đề xuất

| # | Gói | Vì sao ở đây |
|---|---|---|
| 1 | **§9 tracking** | rẻ, và đang sai — để lâu thì mọi quyết định đọc từ nó đều lệch |
| 2 | **C-PI04-04** bounded | lỗi **đang sống**: màn nói "toàn bộ lịch sử" khi chỉ có một cửa sổ |
| 3 | **C-PI04-05** typed 422 | mở khoá cách hiển thị lỗi cho cả 6 màn; H-1 làm nó gấp hơn |
| 4 | **C-PI04-03** cursor | nhỏ, cùng vùng adapter với #3 |
| 5 | **C-PI04-02** realtime | lớn nhưng **dark** — không ai thấy nó sai hôm nay |
| 6 | **C-PI04-06** fixture | sau #2–#5 thì assertion mới có cái để khẳng định |
| 7 | **C-PI04-01** audit | dọn sau cùng |

**Lý do #2 đứng trước #5:** gói 04 sai **ngay bây giờ** trên màn Bobby xem được;
gói 02 chuẩn bị cho thứ chưa bật. Sửa cái đang nói dối trước cái chưa chạy.

---

## 9. Ranh giới tôi giữ

Không đụng Rust · Control API · schema/OpenAPI/generated · migration · Compose ·
AWS · D1/D2. Không bật `query_enabled`/`realtime_enabled`/source/command/Lane B.
**Không tạo EventSource** khi `stream_available=false`. Không suy ra dữ liệu
Trading System qua DB/Redis/CLI/SSH/HTTP đoán. Không biến missing/partial/stale/
unavailable/gap/typed-error thành màn rỗng-thành-công.

## 10. Cần Bobby quyết

Chỉ một: **thứ tự ở §8 có đúng ý bạn không.** Nếu bạn muốn realtime (C-PI04-02)
lên trước vì nó là gói lớn nhất, tôi làm — nhưng tôi khuyên không, vì nó dark.

Bốn quyết định A1–A5 trong `ROADMAP_FRONTEND.md` **không** bị gói này thay thế và
vẫn đang chờ bạn.
