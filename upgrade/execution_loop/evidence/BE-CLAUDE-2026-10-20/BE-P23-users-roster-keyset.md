# BE-P23 — Roster Users phân trang keyset đầu-cuối

Ngày 2026-10-21. Nhánh `claude/post-freeze-20261021`. Đóng phần còn lại của
DEBT-UXM07-031 ("roster đọc một lần không phân trang, cửa sổ 10 thẻ chỉ là cái nhìn
lên danh sách đã đọc hết"). Bobby giao làm thẳng, không qua Codex request; Codex review sau.
Trạng thái: **ĐÃ ÁP DỤNG trên nhánh; Codex review 2026-10-22 = CHANGES_REQUESTED, đã sửa ở §7; spec PG chạy lại ở §7 (log sha256 822a4e3f82840b09…, §7); so sánh visual chưa chạy.**
Không DB/Docker/hook/lock/visual ở lượt này (RULES §10.10b/§10.10c).

## 1. Route và contract

`GET /api/admin/accounts` — **cùng đường dẫn, không thêm route** (ledger route sống vẫn PASS 319).

| Query | Ý nghĩa |
| --- | --- |
| không có gì | như cũ: cả roster, không `page`, không `counts` (chuyển tiếp cho màn V1 và CLI smoke) |
| `limit` 1..200 (mặc định 50), `cursor`, `q` (≤64, chứa, không phân biệt hoa thường, username hoặc tên hiển thị), `role`, `state` | một trang keyset |

Thân trang = thân cũ + `page {limit, returned_count, has_more, next_cursor}` + `counts
{total, matching, by_state, by_role, locked, awaiting_first_password}`. Cộng thêm, không đổi
`required` cũ (`schema_version`, `accounts`) nên người đọc cũ vẫn đọc được.
Lỗi: 400 `ROSTER_QUERY_INVALID` / `ROSTER_CURSOR_INVALID`; 409 `ROSTER_CURSOR_CHANGED` /
`ROSTER_CURSOR_EXPIRED`. Câu chữ cố định, không lặp lại cursor, bộ lọc hay username.

Sinh lại bằng công cụ repo: `openapi-typescript` -> `generated/portal-account-lifecycle.d.ts`
(thêm `AccountRoster`, `RosterPage`, `RosterCounts`); fixture mới
`fixtures/portal-account-lifecycle.roster-page.synthetic.valid.json`. `snapshot.py --check` PASS
(547 tệp; hợp đồng này không nằm trong TRACKED), `p01-baseline --live-routes` PASS.

## 2. Backend

- `src/admin/account-roster-page.ts` (mới): schema query đóng (`strict`), mã hóa cursor, lắp thân.
- `UsersRepository.rosterPage` (`src/repos/users.ts`): **một câu SQL** = một snapshot cho cả hàng và
  `counts` (không cần transaction REPEATABLE READ). Khóa sắp xếp là `username` — đã `UNIQUE` nên
  thứ tự toàn phần, **không cần tie-break và không cần migration**: `portal_users_username_key`
  phục vụ `username > $1 ORDER BY username LIMIT limit+1`. Vì vậy không thêm số migration, không
  dòng persistence-ownership. `counts` là một lượt gộp trên bảng (O(số tài khoản), không trả hàng).
- Cursor: `KeysetCursorCodec` có sẵn (ký HMAC, TTL cấu hình), ràng buộc owner (slot workspace),
  bộ lọc và `limit` qua `queryFingerprint`. Biên = `[username]`.
- Quyền: **không đổi**. `OwnerAccessGuard` chạy trước; trang đọc không mở rộng ai được đọc,
  không có existence oracle (người không phải owner nhận cùng 403 dù `q` có khớp hay không;
  cursor của owner dùng ở phiên khác cũng là 403 trước khi vào dữ liệu).
- Lỗi driver vẫn qua `lifecycleFailure` (câu cố định, 500).
- Lựa chọn: không có query -> vẫn trả cả roster (màn V1 `UsersAccess` và `adminCli.smoke` đọc
  không phân trang). Gỡ nhánh này khi màn V1 gỡ (ghi trong DEBT-031).

## 3. Frontend

- `rosterReader.ts`: `readRosterPage` (nghiêm, đóng) — hàng như cũ; `page` (`limit` 1..200,
  `returned_count` = số hàng và ≤ `limit`, `has_more` đúng khi có `next_cursor`, cần ≥1 hàng,
  cursor ≤4096 không ký tự điều khiển); `counts` (số nguyên không âm, trạng thái và vai trò mỗi
  nhóm cộng đúng `total`, `matching` ≤ `total` và ≥ số hàng). Thân cũ không có `page` bị từ chối
  `ROSTER_MALFORMED`. `rosterPath`, `readRosterPageFromServer`, `readDetailAccount`.
- `index.tsx`: trang đầu 50 hàng (10 ở ≤660px); Load more gửi cursor + cùng `limit`
  (cursor gắn với limit nên cả lượt đi dùng một limit); tối đa 200 hàng (4 trang 50, 20 trang 10).
  Lượt đi bị thay bởi bộ lọc thì trang muộn bị bỏ. Trang lặp `user_id` đã đọc -> từ chối
  `row N, user_id (repeated)`. Cursor bị server từ chối -> trạng thái "unavailable" kèm mã + Try again.
- **Tìm kiếm / lọc: chuyển sang phía server** (không dùng ghi chú "lọc trên hàng đã tải").
  Lý do: lọc trên hàng đã tải sẽ nói "No accounts match" cho tài khoản có thật ở trang chưa đọc,
  và `matching`/số liệu thẻ sẽ sai. Thẻ KPI, số trong ô chọn vai trò/trạng thái là `counts` của
  server (toàn roster), `matching` cho dòng "Showing N of M". Hệ quả: tìm kiếm có trễ debounce
  300 ms trước khi hàng đổi (trước đây đổi ngay trong bộ nhớ).
- Liên kết `?sel=` tới tài khoản ở trang chưa đọc: drawer lấy tài khoản từ chính lần đọc detail
  (`account`), không nói "Account not in the roster read" trong lúc chờ.
- Không câu chữ mới: "Load more", "Showing N of M accounts, K in the roster read" giữ nguyên.
  Nút Load more `disabled` khi đang chờ trang (không đổi chữ).
- Bỏ `filterAccounts`, `matchesQuery`, `rosterCounts` khỏi `usersModel.ts` (không còn người dùng).
- Double `e2e/bffDoubleUsers.ts`: không query = cả danh sách (khớp contract chuyển tiếp);
  có query = trang keyset, cursor ràng buộc limit/bộ lọc (409/400 như server). `routeTable.ts` thêm
  `GET /api/admin/accounts [paged]` + oracle schema `AccountRoster` (xanh); `ROUTES.md` sinh lại.

## 4. Test đã chạy (không PG)

- `apps/control-api`: `be-p23-account-roster-page.spec.ts` 17/17 (đi qua 123 tài khoản, ràng buộc cursor,
  hết hạn, giả mạo, kiểu biên sai, lọc/đếm, không lộ trường nhạy cảm); `tsc --noEmit` không lỗi ở tệp đã chạm (lỗi còn lại ở test khác là lệch phiên bản vitest/node_modules chung, có sẵn).
- `packages/contracts`: `portal-account-lifecycle.spec.ts` 17/17 (tham số, cộng thêm không phá `required`,
  bất biến `RosterPage`/`RosterCounts`).
- `apps/portal/frontend`: `users.test.tsx` + `PortalRoutes.users.test.tsx` 270/270 (reader L0–L3 cho
  page/counts, request, screen, cap 200, race, cursor 409, trang lặp, double); cộng v2Hygiene, linkTargets,
  titleAbsence, absentValues, testHygiene, failClosed, budgets, flagOn/flagOff, uxm10Css, fixtureBff
  (server + route table + oracle) xanh: 1009 + 6 test. `tsc` không lỗi ở tệp đã chạm
  (lỗi còn lại là thiếu `uplot`/`lightweight-charts`/`axe-core` trong node_modules chung, có sẵn từ trước).
- `scripts/refresh-release-integrity-ledgers.sh --check`: **N29 evidence ledger is stale** — không tệp nào
  tôi chạm nằm trong danh sách ghim của N29/EDS-12; coi là có sẵn trên nhánh, chưa xác minh trên tip sạch,
  **không** chạy `--write`.

## 5. Spec PG viết chưa chạy (cho lead)

`apps/control-api/test/be-p23-users-roster-keyset.pg.spec.ts` (cần `TEST_DATABASE_URL` dùng một lần, bỏ qua nếu thiếu):
đi hết bảng thật ở limit 50 đúng thứ tự `ORDER BY username` của DB (hoa/thường, `-`, `_`), `counts` bằng
`COUNT(*)` độc lập, lọc `q`/`role`/`state` (ARCHIVED thắng status), `%`/`_` là chữ thường, không query vẫn
không phân trang, EXPLAIN dùng `portal_users_username_key` (seqscan tắt), 400/409 không lặp đầu vào,
non-owner ADMIN nhận cùng 403 cho `q` khớp/không khớp và cho cursor của owner, không đăng nhập bị từ chối.

## 6. Ô V2 có thể đổi

Không kỳ vọng đổi điểm ảnh: trang đầu vẫn 50 hàng (10 ở 390), cùng chữ, cùng bố cục.
Cần một lần so sánh chế độ verify (không ghi baseline) cho: `v2-users-*` (hai độ rộng, ô `users`) và ô
"Not published" của Users (`execution-v2-visual.spec.ts` dòng 124). Nếu lệch, tìm trước ở nút Load more `disabled`
và thứ tự hàng (theo username server, trùng thứ tự id của double).

## 7. Sửa theo Codex review 2026-10-22 (CHANGES_REQUESTED)

Nguồn: `ELP2-10/CODEX_TO_CLAUDE_LANDING_ACK_2026-10-22.md` (BE-P23).

1. **Một đồng hồ cho đếm và hàng.** `readRosterPage` lấy `now` một lần, truyền cho SQL và cho
   `projectAccount(row, now)` (tham số `now` mới, mặc định `new Date()`; `account-lifecycle.service`
   đổi `users.map(projectAccount)` thành `users.map((user) => projectAccount(user))` để chỉ số `map`
   không thành `now`). Hồi quy: `be-p23-account-roster-page.spec.ts` có hai ca ranh giới
   (khóa còn hạn lúc đọc thì đếm VÀ in là locked dù đồng hồ thật đã qua; khóa hết đúng lúc đọc thì không).
2. **Đo câu truy vấn thật.** Câu SQL production là hằng `ROSTER_PAGE_SQL` (`src/repos/users.ts`); pha đếm dùng
   CTE `f`, còn `page` đọc thẳng `portal_users` (không qua `f`), điều kiện lọc viết một lần (`rosterMatchSql`).
   Ca PG chạy `EXPLAIN (ANALYZE, FORMAT JSON)` đúng `ROSTER_PAGE_SQL` với tham số thật. Không lọc: nút quét
   `portal_users_username_key` đọc ≤ 51 hàng. Có lọc: quét cùng index tới khi đủ 51 hàng khớp, ghi số hàng
   thật đọc và loại bỏ, không khẳng định `limit + 1`. Số đo thật: đo trên 40.121 hàng (121 + 40.000 hàng tạm, rollback): trang = `Index Scan` trên `portal_users_username_key`,
   Limit 51, đọc đúng 51 hàng; pha đếm = `Seq Scan` 40.121 hàng (chi phí O(số tài khoản), nêu thẳng). Có lọc
   (`role=USER`, `q=bulk-03`): cùng index, trả 51 hàng, loại 30.006 hàng theo filter (không phải `limit + 1`).
3. **Biên nhận.** "27 PG" trong báo cáo trước là sai: đúng là **10 PG + 17 unit** (nay unit là 19 với hai ca
   ranh giới). §5 ghi `NOT_RUN` là đúng tại thời điểm viết; log PG thật của nguồn hiện tại: PG_LOG_PENDING.
   Không nhân đôi test chỉ để sửa mô tả.
4. **Lịch sử chạy (không viết lại).** Lần 1 (`be-p23-pg` + unit, log sha256 7c10e438f0f381bc…): 28 pass / 1 fail, ca
   EXPLAIN mới fail vì điều kiện tìm nút quá chặt. Lần 2: kế hoạch thật trên bảng 121 hàng là
   `Bitmap Index Scan` đọc 107 hàng rồi Sort (planner không đại diện ở quy mô này), nên ca đổi sang bảng
   40.121 hàng. Lần 3: 10/10 PG pass. EXPLAIN chạy trên cùng một client với bảng tạm (cùng transaction).
