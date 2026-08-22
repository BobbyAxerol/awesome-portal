# Frontend ↔ Backend contract audit — 2026-08-22

**Người soát:** Claude (frontend lead)
**Phạm vi:** mọi chỗ frontend đang tiêu thụ contract backend, đối chiếu với
source thật trong `services/portal-execution-edge-rs/`, `apps/control-api/`,
`packages/contracts/` và `trading_system_portal_contract_pack/extract/`.
**Cách soát:** đọc source, không đọc doc. Doc mô tả ý định; source mô tả cái sẽ
chạy. Mọi mục dưới đây có `file:line`.

> **@codex — đọc ngay mục A.** A-1 là lỗi của backend và nó làm **mọi
> EventSource reconnect chết vĩnh viễn**. A-2 là hai contract cùng tồn tại.
> Mục B là lỗi của tôi, tôi tự sửa, ghi ở đây để hai bên khớp mô hình.

---

## A. Lỗi/khoảng trống phía backend — cần codex

### A-1 · `REALTIME_CURSOR_AMBIGUOUS`: browser reconnect **luôn** 400 · nặng

`apps/control-api/src/execution/realtime.proxy.ts:36-50`

```ts
if ((lastEventId && snapshotCursor && lastEventId !== snapshotCursor)
    || (!lastEventId && !snapshotCursor)) {
  throw new RealtimeProxyError("REALTIME_CURSOR_AMBIGUOUS", 400);
}
```

`apps/control-api/src/execution/realtime.controller.ts:40,48` — `cursor` đọc từ
**query**, `last-event-id` đọc từ **header**.

**Vì sao vỡ.** Native `EventSource` tự reconnect bằng cách **gọi lại đúng URL
cũ** và **thêm header `Last-Event-ID`**. Nên:

1. Connect `GET /command-center/stream?cursor=snap-1` → OK.
2. Nhận event, id mới nhất `e1:105`. Kết nối rớt.
3. Browser tự reconnect: URL vẫn `?cursor=snap-1`, header
   `Last-Event-ID: e1:105`.
4. Hai giá trị **khác nhau** → **400**.

`EventSource` coi 400 là lỗi không hồi phục → **đóng stream vĩnh viễn**. Không
phải ca hiếm: đây là **mọi** lần reconnect sau event đầu tiên.

**Đề xuất (codex quyết):** khi cả hai có mặt, `Last-Event-ID` **thắng** thay vì
400 — nó luôn mới hơn `cursor` trong URL, và đó chính là ngữ nghĩa resume. Chỉ
400 khi **không có cái nào**. Nếu muốn giữ chặt, cần một cách để client bỏ
`cursor` khỏi URL sau snapshot đầu — mà `EventSource` không cho đổi URL, nên
thực tế là không có cách.

**Test đề nghị:** một test dựng đúng chuỗi 1→4 ở trên. Hiện chưa có test nào
cover, vì test hiện tại truyền hai giá trị **bằng nhau** hoặc chỉ một.

---

### A-2 · Hai hình dạng keyset page cùng tồn tại · nặng, còn tiềm ẩn

| Nguồn | cursor tiến | cursor lùi | sort |
|---|---|---|---|
| `crates/query-api/src/lib.rs:479-492` (Rust, EX-BE-04b) | `next` | `previous` | `applied_sorts` |
| `apps/control-api/src/query/contracts.ts:34-45` (TS, EX-BE-04a) | `next_cursor` | `prev_cursor` | `applied_sort` |
| `packages/contracts/fixtures/keyset-page.valid.json` | `next_cursor` | `prev_cursor` | `applied_sort` |
| Frontend (`adapter.ts:349-353`) | `next_cursor` | `prev_cursor` | `applied_sort` |

`ProjectionQueryPage` **chưa expose qua HTTP** (chỉ dùng trong `query-api` và
`projection-store-pg`), nên chưa vỡ. Ngày EX-BE-08a expose nó, frontend đọc
`next_cursor` sẽ thấy `undefined` → **`hasMore` false** → bảng nói "hết dữ liệu"
trong khi còn 48,000 dòng. **Im lặng, không phải lỗi 500.**

Không có `#[serde(rename)]` trên struct đó (`lib.rs:478`), đã kiểm.

**Đề xuất:** một tên duy nhất. Fixture đã publish và TS đã dùng
`next_cursor`/`prev_cursor`/`applied_sort`, nên đổi phía Rust rẻ hơn.

---

### A-3 · `aggregates_by_currency` bị rơi ở tầng TS · vừa

`crates/query-api/src/lib.rs:491` có `aggregates_by_currency: Vec<CurrencyAggregate>`
— đây là M7 (server-side aggregate, exact decimal, không qua float). Contract TS
(`query/contracts.ts:34-45`) **không có trường này**, nên frontend không có
đường nào lấy được.

Hệ quả: footer chỉ có `total_count`. Muốn hiện tổng theo currency thì frontend
phải tự cộng — đúng thứ BR-EX-26 vừa cấm.

---

### A-4 · Series retention không đến được page consumer · vừa

`crates/query-api/src/lib.rs:644` — `retention: RetentionDecision` nằm trên
**series**, không nằm trên page. Frontend `contracts.ts` khai `KeysetPage.retention`
và `components/table.tsx` dùng nó để phân biệt *"rỗng thật"* với *"cold/purged"*.

Đây **cũng là lỗi của tôi** (B-7), nhưng câu hỏi cho backend vẫn còn: một
keyset page rỗng vì dữ liệu đã bị purge thì client biết bằng cách nào? Hiện
không có đường nào.

**Đề xuất:** thêm `retention` vào page response, cùng typed enum
`HOT/PARTIAL_HOT/COLD_REQUESTABLE/PURGED/UNKNOWN` đã có.

---

### A-5 · `projection.gap` mang bốn trường không ai dùng được · nhẹ

`crates/realtime-sse/src/lib.rs:117-125`: `last_good_cursor`,
`earliest_available_sequence`, `missed_events`, `active_epoch_id`.

Đây là thông tin tốt và frontend nên hiện (`missed_events` cho phép nói "1,204
sự kiện không được giao" thay vì suy ra từ sequence). Tôi sẽ đọc chúng (B-5).
Chỉ cần xác nhận: **chúng có được populate không**, hay luôn `None`?
`GapEnvelope::new` (`lib.rs:129-140`) khởi tạo cả bốn là `None`.

---

### A-6 · `auth.expiring` không nói khi nào hết hạn · nhẹ

`crates/edge-service/src/main.rs:1061-1069` gửi
`{event_type, schema_version, reconnect_required: true}`.

Không có `expires_at`. Nên UI chỉ nói được "sắp hết hạn", không nói được "còn 4
phút" — mà cái sau mới giúp operator quyết định có bắt đầu một thao tác dài hay
không.

---

### A-7 · Còn treo từ trước, nhắc lại

- **BR-EX-24** — chưa có endpoint list order (Full Blotter).
- **BR-EX-25** — hi-fi funnel 5 hop vs contract 4 stage.
- **BR-EX-26** — aggregate headroom phải do server phán.
- **BR-EX-27** — `sample_counts` trên packed correlation matrix.

---

## B. Lỗi phía frontend — của tôi, tôi sửa

Ghi ở đây để codex thấy tôi đã hiểu sai chỗ nào, và để mô hình hai bên khớp.

### B-1 · Adapter SSE nghe **sai toàn bộ** tên event · nặng

Tên thật (`crates/realtime-sse/src/lib.rs:63-72`, `edge-service/src/main.rs:1050,1061,1104`):

```
order.updated · fill.recorded · position.updated · runtime.updated
account.updated · broker_binding.updated · reconciliation.updated
performance.updated · operation.updated
projection.gap · projection.heartbeat · auth.expiring
```

`sse.ts` của tôi nghe `snapshot`, `delta`, `heartbeat`, `epoch.changed`. **Không
tên nào tồn tại.** Adapter sẽ nhận đúng một loại event: `projection.gap`.

**Không có event `snapshot` hay `delta`.** Snapshot đến qua HTTP riêng; delta là
**event theo entity kind**. Mô hình của tôi sai từ gốc.

### B-2 · Query param sai tên

Controller nhận `?cursor=` (`realtime.controller.ts:40`). Tôi gửi
`?snapshot_cursor=`. Server thấy không có cursor **và** không có header →
`REALTIME_CURSOR_AMBIGUOUS` ngay từ lần connect đầu.

### B-3 · `last_event_id` gửi qua query là vô nghĩa

Server chỉ đọc header (`realtime.controller.ts:48`). `EventSource` không set
header được, nên **client không tự resume được** — chỉ browser tự reconnect mới
gửi header. Cách đúng: luôn dùng `?cursor=`, và giá trị là snapshot cursor lần
đầu, là `Last-Event-ID` khi tự reconnect. Xem A-1 về cái bẫy đi kèm.

### B-4 · `?topic=` không tồn tại

Route là `/command-center/stream` cố định (`realtime.controller.ts:36`), không
nhận topic. "Một stream nhiều topic" là tôi suy diễn từ chữ *multiplexed* trong
README — multiplex ở đây là **nhiều client trên một mTLS HTTP/2 session**, không
phải nhiều topic trên một stream.

### B-5 · Không đọc `missed_events` / `last_good_cursor`

Xem A-5.

### B-6 · Bỏ qua `source_discontinuity` trên mỗi envelope

`crates/realtime-sse/src/lib.rs:48` — cờ này nằm trên **mọi** envelope, không
riêng gap. Một delta mang `source_discontinuity: true` nghĩa là **Trading System
tự nó nhảy số**, và tôi đang render nó như dữ liệu liền mạch.

### B-7 · ~~`KeysetPage.retention`~~ — **soát lại: không phải lỗi**

Đã kiểm `components/retention.tsx:60-72`: `emptyMeansEmpty(undefined)` trả
`false`, nên một page rỗng không có `retention` hiện *"No retention policy was
published with this result, so it cannot be read as complete."* Fail-safe đúng
hướng — code là forward-compatible, không phải lỗi.

Giữ lại A-4 (backend nên cấp `retention` trên page) nhưng **rút mục này khỏi
danh sách lỗi frontend**. Ghi lại thay vì xoá, vì một bug list dài hơn sự thật
thì lần sau không ai tin nó.

### B-8 · Test của tôi mã hoá chính giả định sai · **bài học chính**

Fake `EventSource` trong `sse.test.ts` phát `snapshot` và `delta` — hai event
server không bao giờ gửi. Nên 24 test xanh trong khi adapter không chạy được với
server thật.

**Đây là bài học đáng giá nhất của lần soát này:** fake do tôi viết theo mô hình
tôi tưởng tượng thì nó chỉ chứng minh tôi nhất quán với chính mình. Sửa: fake
phải phát **đúng tên event lấy từ source**, và có một test đọc thẳng danh sách
tên đó để nó đỏ khi backend đổi.

---

## C. Không có lỗi — đã đối chiếu và khớp

Ghi lại để lần sau không soát lại:

| Chỗ | Kết quả |
|---|---|
| `GapReason` 5 giá trị | khớp hoàn toàn (`realtime-sse/src/lib.rs:108-114`) |
| `KeysetPage` TS ↔ frontend ↔ fixture | khớp (`next_cursor`/`prev_cursor`/`applied_sort`) |
| Sáu route analytics + verb | khớp sau khi sửa POST (`analytics.controller.ts:30-71`) |
| `CapitalPreviewRequest` ba trường | khớp, đã type theo generated schema |
| `PopulationCompleteness`, `SourceAuthority`, `DeliveryProfile` | khớp OpenAPI |
| Luật resume "đúng một cursor" | khớp — nhưng xem A-1 |


---

## D. Trạng thái sau lần soát (2026-08-22)

**Mục B đã sửa xong** trong commit cùng ngày:

- `sse.ts` nghe đúng 12 tên event lấy từ source, và **export danh sách đó** —
  `SSE_EVENTS`. Một test so danh sách với đúng chuỗi đọc từ Rust, nên backend
  đổi tên là test đỏ.
- `?cursor=` thay cho `?snapshot_cursor=`; bỏ `?topic=`; bỏ `last_event_id`
  khỏi query; thêm chặn cursor > 80 byte trước khi gửi.
- **`fetchSnapshot` giờ dispatch `SNAPSHOT`.** Trước đó nó chỉ trả cursor, nên
  reducer kẹt ở `snapshotting` và guard delta (thêm ở §16) drop mọi event —
  stream kết nối được, nhận được, và hiện **không gì cả**. Đây là lỗi nặng nhất
  trong mục B và nó sống được vì fake `EventSource` của tôi phát `snapshot`.
- Đọc `missed_events` + `last_good_cursor`; banner nói *"1,204 events were not
  delivered"* thay vì suy ra khoảng từ hai số sequence.
- `source_discontinuity` trên delta giờ chuyển phase sang `gap`.
- `auth.expiring` chấp nhận không có `expires_at` (A-6).

**Evidence:** vitest 940 passed / 1 skipped, tsc sạch.

**Mục A vẫn treo — chờ codex.** A-1 là mục cần đọc trước tiên.
