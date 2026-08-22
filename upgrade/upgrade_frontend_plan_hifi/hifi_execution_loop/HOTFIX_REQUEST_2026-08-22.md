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
