# Hot-fix request → @codex — 2026-08-22

Từ một lần soát toàn bộ frontend+backend (9 lăng kính, mỗi phát hiện qua 3
refuter độc lập). File này chỉ chứa những mục **tôi đã tự đọc source và xác
nhận**, không phải mọi thứ agent báo. Phần còn lại sẽ bổ sung sau khi vòng
verify chạy xong.

---

## H-1 · `DecimalString::parse` làm tròn **âm thầm** · NẶNG NHẤT

`services/portal-execution-edge-rs/crates/execution-contracts/src/lib.rs:112-116`

```rust
pub fn parse(raw: &str) -> Result<Self, ContractError> {
    Decimal::from_str(raw)          // ← làm tròn, không báo lỗi
        .map(Self)
        .map_err(|_| ContractError::InvalidDecimal(raw.to_owned()))
}
```

`rust_decimal::Decimal` giữ được ~28–29 chữ số có nghĩa. `FromStr` gặp giá trị
dài hơn thì **làm tròn và trả Ok**. `Decimal::from_str_exact` mới là hàm trả
`Error::Underflow` thay vì làm tròn.

**Vì sao đây là lỗi nặng nhất trong cả lần soát.** Toàn bộ hệ này dựng trên một
lời hứa: decimal đi qua dưới dạng chuỗi và **không bao giờ mất chữ số**. Test
`decimal_requires_a_json_string_and_round_trips_scale` chứng minh nó không đi
qua float — nhưng không chứng minh nó không bị làm tròn.

**Kịch bản thật, không phải giả định:** một token 18 decimals cộng notional cỡ
trăm tỷ →
`123456789012.000000000000000001` là **30 chữ số có nghĩa** → làm tròn thành
`123456789012.00000000000000000` và trả `Ok`. Không lỗi, không cảnh báo, không
log. Con số sai đi thẳng vào capital preview, ledger, exposure — đúng những chỗ
frontend bị cấm tính lại vì "server là authority".

**Đề xuất:** đổi sang `Decimal::from_str_exact`, và thêm test với một giá trị
30 chữ số khẳng định nó **bị từ chối** chứ không phải bị làm tròn. Nếu miền
giá trị thật cần quá 28 chữ số thì `rust_decimal` là sai kiểu, cần `BigDecimal`.

---

## H-2 · Inbox filter: frontend gửi `filter=`, BFF đọc `view=` · NẶNG

`apps/control-api/src/governance/contracts.ts:302`

```ts
const view = typeof raw.view === "string" ? raw.view : "INBOX";
```

`apps/portal/frontend/src/execution/api/httpApi.ts:101` gửi
`new URLSearchParams({ filter: query.filter })`.

**Hệ quả:** mọi chip lọc (R1, PAPER, SANDBOX, LIVE_GATES, EXIT_REVIEWS, OVERDUE)
**im lặng rơi về INBOX**. Không 400, không cảnh báo — người dùng bấm "Overdue"
và nhận đúng inbox, tin rằng đó là danh sách quá hạn.

**Đây là lỗi của tôi ở phía frontend, tôi sửa** (gửi `view=`). Ghi ở đây vì hai
việc cần bạn:

1. **Xác nhận `view` là tên canonical** — nếu bạn định đổi sang `filter`, nói
   trước khi tôi sửa nhầm hướng.
2. **Cân nhắc fail-closed thay vì mặc định**: một tham số lọc không nhận ra
   hiện đang mặc định `INBOX`. Với một filter sai chính tả, người dùng nhận một
   danh sách trông hợp lệ mà không phải cái họ hỏi. 400 sẽ trung thực hơn — và
   sẽ bắt được lỗi này ngay ngày đầu thay vì để nó sống tới hôm nay.

---

## Còn lại

Vòng verify đối kháng đang chạy trên ~120 phát hiện. Những mục backend đang chờ
xác nhận, sẽ bổ sung vào file này khi xong — trong đó có: gap `epoch_changed`
không mang `resnapshot_not_before`, edge map mọi lỗi validation thành 5xx, và
cap cứng 250/1024 trên ledger/funnel.

Các request cũ **A-5, BR-EX-24, BR-EX-25, BR-EX-26, BR-EX-27** vẫn chưa thấy
trong working tree của bạn — xem `FE_BE_CONTRACT_AUDIT_2026-08-22.md` mục E.

---

# Bổ sung sau khi vòng verify chạy xong

Audit 9 lăng kính: **116 phát hiện**, 64 qua được vòng bác bỏ đối kháng (≥2/3
refuter độc lập không bác được), 15 bị bác thật, **37 không kịp verify** (agent
lỗi vì session limit — *không* coi là đã bác).

Frontend đã sửa xong toàn bộ 17 high, commit `2e3a42a`, `8d8779a`. Dưới đây là
phần thuộc backend.

---

## H-3 · Live-path `epoch_changed` không mang deadline · NẶNG

`crates/realtime-sse/src/lib.rs:260-266`

```rust
if cursor.epoch_id != self.last_good_cursor.epoch_id {
    self.terminal = true;
    return SubscriptionDelivery::Gap(
        GapEnvelope::new(GapReason::EpochChanged, Some(self.last_good_cursor)));
}
```

`GapEnvelope::new` để `resnapshot_not_before: None` và `active_epoch_id: None`.
Chỉ **đường resume** (`main.rs:961-963`) gán jitter deadline.

**Hệ quả:** epoch cutover trong lúc 100 màn đang kết nối → cả 100 nhận
`epoch_changed` **không deadline** → `mayResnapshot()` phía client trả `true`
ngay → cả 100 resnapshot cùng lúc vào một projection vừa rebuild xong nên cache
lạnh. Đúng thundering herd mà cơ chế jitter sinh ra để chặn. Chỉ client nào
tình cờ đang mất kết nối mới được jitter.

**Đề xuất:** nhánh live gọi `server_jitter_deadline(new_epoch, client_sid, now,
jitter)` giống đường resume — cần truyền `sid`/`jitter` vào
`RealtimeSubscription`.

---

## H-4 · `source_discontinuity` bị dùng cho hai nguyên nhân khác nhau · vừa

`crates/realtime-sse/src/lib.rs:274` — một `projection_sequence` không liền
mạch **trong cùng epoch** (lỗi journal/fan-out của Portal edge) được phát ra là
`GapReason::SourceDiscontinuity` — đúng reason dành cho
`envelope.source_discontinuity`, tức **Trading System tự nhảy số**.

Frontend hiện hiện câu *"The Trading System reported a break in its own
sequence"*. Nếu thật ra lỗi ở edge của ta thì màn hình vừa đổ lỗi cho Trading
System. Operator sẽ đi kiểm nhầm hệ thống.

**Đề xuất:** thêm reason riêng (`projection_discontinuity` hoặc `delivery_gap`)
cho lỗi contiguity phía edge; giữ `source_discontinuity` cho đúng cờ envelope.
Frontend đã có `GapReason` narrow nên chỉ cần thêm một giá trị.

---

## H-5 · Cursor vượt journal báo thành `epoch_changed` · nhẹ

`crates/query-api/src/lib.rs:786` — khi `cursor.sequence >
latest_available_sequence` trong **cùng** epoch, `resume_decision` rơi xuống
`Resnapshot` và edge phát `epoch_changed` với `active_epoch_id` bằng chính epoch
của cursor. Epoch không đổi; client được bảo là đã đổi.

**Đề xuất:** reason riêng (`cursor_ahead`, hoặc `history_evicted` kèm
earliest/latest) cho cursor ngoài dải trong cùng epoch.

---

## H-6 · Mọi lỗi validation của engine thành 503 · vừa

`crates/edge-service/src/main.rs:777` — `analytics_response` gộp **mọi**
`AnalyticsError` thành `SERVICE_UNAVAILABLE`: `BatchLimit` (>64 insight, >1024
funnel event, >250 ledger entry), `DuplicateIdentifier`, `ScopeMismatch`,
`NegativeAmount`.

Bốn cái đầu là **lỗi của client**. Trả 503 cho chúng nghĩa là: client thấy
"service unavailable", thử lại, thất bại lại — vĩnh viễn; còn on-call thì đi tìm
một sự cố hạ tầng không tồn tại.

**Đề xuất:** phân biệt 400/422 (client) với 503 (data fault) và trả Problem JSON
có `type` để frontend phân nhánh được.

---

## H-7 · Cap cứng 250/1024 trên tập vô hạn · vừa

`crates/analytics/src/ledger.rs:110` và funnel. Ledger nạp **mọi** fact của
portfolio rồi **báo lỗi** khi quá 250; funnel làm tương tự trên 1.024 event —
mà `fills` **không có retention policy**, nên nó lớn mãi.

Nghĩa là: một portfolio đủ lâu năm thì tab Capital Ledger **ngừng hoạt động
hoàn toàn**, không phải hiện ít đi. Cùng vậy với một order nhiều fill.

Frontend đã xử lý phần của mình: cả hai panel giờ nói rõ chúng là **cửa sổ**
chứ không phải toàn bộ, và đọc `entry_count` nếu server cấp. Nhưng phía server
vẫn cần keyset page (`after`/`before`, `limit`, cursor gắn epoch) hoặc trả trang
mới nhất kèm gross totals server tính.

---

## H-8 · BFF gộp `CursorExpired` và `CursorContextMismatch` · nhẹ

`apps/control-api/src/query/cursor.ts:37` ném một `INVALID_CURSOR` duy nhất cho
malformed, tampered, expired và scope-mismatched — trong khi Rust `query-api`
phân biệt ba variant.

Frontend giờ đã recover được (bỏ cursor, xin trang đầu), nhưng nó phải nhận
diện bằng **regex trên chuỗi lý do**, không phải bằng mã. Xin
`CURSOR_EXPIRED` và `CURSOR_CONTEXT_MISMATCH` riêng, ghi vào error catalog.

---

## H-9 · Contract: operation response nên có **hai** trường

`governance.service.ts:478-495` publish `status` ∈ {PENDING, SUCCEEDED,
EXPIRED} và **không có** `verification_result`.

Frontend từng đọc `verification_result` nên token luôn vắng, walk không bao giờ
rời "unknown", và **một quyết định đã thành công thật chưa bao giờ được báo là
thành công**. Đã sửa để đọc `status`, vẫn ưu tiên `verification_result` cho ngày
nó xuất hiện.

**Đề xuất:** publish cả hai như hai trường riêng — `status` (workflow) và
`verification_result` (observed) — với một danh sách enum duy nhất trong
`packages/contracts`. Một workflow đã kết thúc và một hiệu ứng chỉ landing một
phần là **hai sự thật khác nhau**, và `PARTIAL` không diễn đạt được bằng
`status` hiện tại.

---

## Nhắc lại: H-1 và H-2 ở đầu file vẫn treo

**H-1** `DecimalString::parse` làm tròn âm thầm — vẫn là mục nặng nhất cả lần
soát. **H-2** `view=` đã sửa phía frontend; vẫn xin xác nhận tên canonical và
cân nhắc fail-closed thay vì mặc định `INBOX`.

Và **A-5, BR-EX-24, 25, 26, 27** từ audit trước vẫn chưa thấy trong tree.

---

# Đợt ba — soát chéo contract đã publish (2026-08-22, chiều muộn)

Không soát code lần này mà soát **hàng rào**: cái gì đã publish, cái gì được
gate giữ, và chỗ nào một thay đổi đi lọt.

**Ba thứ đã kiểm và SẠCH** — ghi lại để khỏi soát lại:

- `contracts-snapshot.json` phủ **26/26** file, digest khớp hết, không file nào
  publish mà nằm ngoài snapshot.
- `npm run generate` chạy lại (exit 0, bốn file) rồi diff: **generated types
  khớp hoàn toàn** với OpenAPI. Không stale.
- `execution-analytics.capital-preview.valid.json` **hợp lệ** với
  `CapitalPreviewResponse` — tôi tự compile schema từ OpenAPI và validate.

Ba mục dưới đây là lỗ thật.

---

## H-10 · Analytics là contract duy nhất **không có schema gate** · NẶNG

`packages/contracts/test/fixtures.spec.ts:29-45` map 8 fixture sang 8 schema.
`execution-analytics.capital-preview.valid.json` **không nằm trong bảng đó**.

Nó có digest trong snapshot, nhưng digest và validation là hai bảo đảm khác
nhau: digest bắt *"file đổi mà snapshot không cập nhật"*; nó **không** bắt
*"fixture không còn khớp schema của chính nó"*. Sửa cả hai cùng lúc thì đi lọt.

Và đây là contract mang **mọi con số tiền** trên bề mặt này.

**Đề xuất:** thêm `execution-analytics-*.v1.schema.json` (hoặc validate thẳng
theo OpenAPI như tôi vừa làm — đoạn Ajv chỉ mất 10 dòng) và đưa vào bảng
`fixtures.spec.ts`.

---

## H-11 · Không test nào chứng minh Rust analytics khớp OpenAPI · NẶNG

`crates/query-api/src/lib.rs:863`
`projection_query_page_serializes_canonical_keyset_field_names` — serialize
struct Rust rồi so với `keyset-page.valid.json`. Đúng thứ cần, và bạn thêm nó
**sau khi** tôi báo A-2.

`crates/analytics/src/*.rs` **không có gì tương đương**. Grep toàn crate không
ra một dòng nào chạm `packages/contracts`, `openapi` hay `valid.json`.

Nghĩa là với **sáu màn analytics**, thứ duy nhất nối tên trường trong struct
Rust với OpenAPI mà frontend type theo là: **một người đã viết cả hai**.

A-2 chính là lỗi đó xảy ra thật ở keyset page — `next`/`previous` bên Rust,
`next_cursor`/`prev_cursor` bên contract, hai bên cùng tồn tại và không ai biết
cho tới khi tôi đọc chéo. Sáu màn analytics hiện đang ở đúng trạng thái đó.

**Đề xuất:** một test serde-vs-fixture cho mỗi màn, giống hệt cái ở `query-api`.

---

## H-12 · Năm trong sáu endpoint analytics không có fixture nào · vừa

Đã publish: `capital-preview`. Chưa có: **funnel, insight batch, correlation,
capital ledger, exposure**.

Hệ quả: fixture frontend cho năm màn đó là **tôi tự viết từ OpenAPI**. Tốt hơn
đoán, nhưng chưa từng được đối chiếu với serde output thật của engine — và
`readCapitalPreview` đã cho thấy điều gì xảy ra khi làm theo prose: **9 tên
trường sai**.

**Đề xuất:** mỗi endpoint một fixture, **sinh từ serde output của engine** chứ
không viết tay, rồi đưa cả sáu vào H-10 và H-11.

---

# Bobby đã chốt catalogue phase 6 — xem BR-EX-28

**Phương án B**: bảy action hiện chỉ chạy qua Postgres/Redis trực tiếp **sẽ
được mở, ưu tiên ngay**. Chi tiết đầy đủ ở
[`BR_EX_28_PHASE6_CATALOGUE_AND_UNBLOCK.md`](./BR_EX_28_PHASE6_CATALOGUE_AND_UNBLOCK.md).

Ba điều quan trọng nhất trong đó:

1. **"Mở" nghĩa là codex build HTTP endpoint**, không phải Portal nối thẳng
   Redis. Ranh giới handoff §2.3 giữ nguyên.
2. **Năm trong bảy** mở được dạng endpoint có kiểu. **Hai cái còn lại
   (`redis get`, `redis scan`) là truy cập key tuỳ ý** — mở dạng nguyên bản là
   cấp cho Portal một vòi dữ liệu đa dụng vào runtime Trading System, và nó
   không kiểm toán được. Đề nghị hỏi *"màn nào cần gì sau hai lệnh đó"* rồi mở
   đúng thứ ấy. **Cần Bobby chốt lại riêng mục này.**
3. **Đường ngắn nhất tới sáu màn** không phải bảy capability, mà là **một
   catalogue canonical trong `packages/contracts`**. Nó một mình mở phase 6, và
   phase 6 một mình mở 7, 8, 9, 10, 11, 12.
