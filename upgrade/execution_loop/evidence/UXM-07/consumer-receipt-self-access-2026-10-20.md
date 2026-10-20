# UXM-07 — Consumer receipt: self-eligibility / self-navigation timestamps (FE-057), 2026-10-20

Người viết: Claude (FE writer F8). Consumer receipt theo Rules §10.12.4 cho giao hàng Codex `7818d563` ([self-access-consumer-return](../ELP2-03/self-access-consumer-return-2026-10-19.md), [c7-priority-round](../ELP2-10/c7-priority-round-2026-10-19.md)). Đây là ghi nhận của consumer, **không phải ACK của Bobby** (§10.3); sổ `FRONTEND_BACKEND_SYNC.md` và `UNIFIED_IMPLEMENTATION_PLAN.md` **không được sửa ở đây** (Codex có thay đổi chưa commit): phần "ô đề xuất" ở §6 để Codex hoặc vòng sau dán vào.

## 0. Pin

| Mục | Giá trị |
| --- | --- |
| Producer | Codex `7818d563` "fix(execution): deliver reader contracts and exact unused identity cleanup", đã ghép vào `claude/fe-parity` (`792319bb`) |
| Consumer | `claude/fe-parity` @ `75432400` + commit reader/gate `03a6d748` (nhánh worktree của F8); chưa push, chưa ff vào nhánh Codex |
| Chứng cứ đọc | `packages/contracts/openapi/execution-access.openapi.json` (`AccessEligibility`, `AccessSelfNavigation`), `generated/execution-access.d.ts`, `fixtures/execution-access.synthetic.valid.json` (6 thân: 2 eligibility, 4 navigation), `tooling/generate-execution-access.mjs`; không đọc nguồn HK (source-dark, §10.12.2c) |
| Lane | FIXTURE/schema; **không** có đọc runtime thật: image đang cài vẫn là `f4643915` và chưa phục vụ trường mới (return của Codex nói rõ) |

## 1. Vì sao 244 test đỏ (khác biệt published vs reader, đủ danh sách)

Diff `7818d563^..7818d563` trên bốn tệp hợp đồng access. Chỉ **hai** thứ đổi hình dạng body; mọi thứ khác reader đã khớp (các so sánh L0 từng chữ giữ nguyên xanh).

| # | Khác biệt đã publish | Reader trước đây | Hệ quả |
| --- | --- | --- | --- |
| 1 | `AccessEligibility` thêm **required** `observed_at_ms`, `valid_until_ms` (integer, 0..`MAX_SAFE_INTEGER`; object đóng) | danh sách khóa đóng không có hai khóa này | mọi body eligibility bị từ chối (`null`) |
| 2 | `AccessSelfNavigation` thêm cùng hai khóa required | như trên | mọi body navigation bị từ chối |
| 3 | Fixture canonical: cả 6 thân mang `1792094400000` / `1792094405000` (và `examples` trong schema) | test dựng từ fixture nên đỏ cùng lúc | 244 test đỏ / 2309 (hai file) |
| 4 | Mô tả: `observed_at_ms` = "Portal evaluation time ... not source observation time"; `valid_until_ms` = "End-exclusive ceiling of this actor's current session only, greater than observed_at_ms (producer invariant) ... Not a cache TTL, permission lease or readiness guarantee" | không có | ngữ nghĩa mới, schema **không** diễn đạt được `valid_until_ms > observed_at_ms` (chỉ ghi chú) |
| 5 | OpenAPI + generated: HTTP 500 có kiểu (`AccessProblem`, `Cache-Control: private, no-store`) trên cả 10 operation access (FE-061 follow-through) | reader không thấy mã HTTP (lớp fetch/phân loại lỗi ở ngoài) | không ảnh hưởng đọc body; ghi ở §4 |
| 6 | Không đổi: enum (action, family, reason, authority, feature, read mode), 28 luật family/step-up, 28 luật action x kind, operationId, đường dẫn, query chặt, `self_entry` | đã khớp | giữ nguyên |

Không có từ vựng nào khác đổi trong hợp đồng access (oracle "closed words ... word for word" và bảng 28 + 28 luật vẫn xanh không sửa). Thay đổi ở `governance`/`manager-lists`/`paper-read`/`analytics` trong cùng commit **không thuộc receipt này** (chưa được review ở đây).

## 2. Đã làm trong reader (`v2/readers/accessSelf.ts`)

- Đọc `observed_at_ms`, `valid_until_ms` đúng bằng số nguyên ms an toàn (`Number.isSafeInteger && >= 0`); float, chuỗi, `null`, âm, `> MAX_SAFE`, `NaN` làm vô hiệu cả lần đọc. Object vẫn đóng: một khóa thừa (`ttl_ms`, `revision`, `expires_at_ms`, deadline workspace) hay đổi tên là từ chối.
- **Bất biến producer** `valid_until_ms > observed_at_ms` được enforce ở reader (nghiêm hơn schema, có tên và test); `==` hoặc `<` bị từ chối, không "sửa".
- Kiểu `AccessEligibility`/`AccessSelfNavigation` có `observedAtMs`, `validUntilMs`.
- `selfProjectionExpiry(projection, nowMs)`: **chỉ để đóng**. Hết hạn khi `nowMs >= valid_until_ms` (end-exclusive), không grace, không bù lệch giờ, không "cửa sổ làm mới" tự nghĩ; `nowMs` không hữu hạn thì hết hạn với lý do `CLOCK_UNREADABLE`. `observed_at_ms` **không** so với đồng hồ client (client chậm hơn Portal không phân biệt được với câu trả lời mới, và "quá sớm" không phải lý do đã publish).
- `eligibilityRowNow` (hết hạn thì mọi action trả `expired`, không bao giờ `ALLOWED` cũ; `absent` vẫn khác "not allowed"), `enterableSelfNavFeaturesNow` (hết hạn thì không mục nào).

## 3. Đã làm ở shell (`v2/shell/selfNavGate.ts`, tệp mới cạnh `roleNav.ts`)

`roleNav.ts` không đổi (Sidebar của V1 import nó; thêm import reader sẽ kéo reader vào chunk V1). Cổng mới là "W2 cách A" của review F8c:

- `selfNavigationGate(nav | null, nowMs)` -> `none` (chưa đọc: hành vi hôm nay) | `live` (token cho từng mục `ENTERABLE`, 4 token `execution.*` đã có trong `V2_CAPABILITY`) | `expired` (**không token**, kèm `reason` và `message`).
- `navCapabilities(session, gate)` = session ∪ token của cổng; phần session không bao giờ bị đụng, projection chỉ **thêm** mục liệt kê, không bao giờ cấp quyền.
- Câu từ chối thật: "The navigation read for your session ended at <UTC> (Portal clock) and is no longer shown. Reload to check again." (không có "valid until", "permission"; bỏ mốc giờ khi ceiling vượt miền `Date` để `toISOString` không ném RangeError). Văn bản này là **đề xuất copy, chờ Bobby duyệt**.
- Test chứng minh qua `applyV2Nav` và `goToEntries`: còn hạn thì Portfolios/Accounts/Blotter hiện; đúng `valid_until_ms` thì rail chỉ còn phần session, Blotter biến khỏi "Go to".
- `contextFacts.ts` **không đổi**: nó chỉ chở `scope`/`ccy` do màn công bố; trạng thái hết hạn thuộc rail, không thuộc ContextBar.

## 4. Field published vs consumed, cố ý bỏ, chưa nối

| Mục | Published | Consumed | Ghi chú |
| --- | --- | --- | --- |
| Trường mới trên body | 2 x 2 (`observed_at_ms`, `valid_until_ms` trên eligibility và navigation) | 4/4 | đọc chính xác, bất biến enforce |
| Thân fixture | 6 | 6/6 đọc và qua oracle schema | `canonicalDigest` không đổi |
| Đã có từ trước, không đổi | mọi trường khác | giữ nguyên | |
| Cố ý **không** dùng | `observed_at_ms` làm "độ mới dữ liệu"/so đồng hồ; `valid_until_ms` làm TTL cache, lease quyền hay lý do giữ rail sống; bất kỳ grace | không | đúng ngữ nghĩa return: chỉ để đóng |
| Cố ý bỏ | HTTP 500 có kiểu | không nằm trong `accessSelf` | lớp fetch/phân loại lỗi giữ từ vựng đóng của FE; 500 trên mutation **không** chứng minh rollback, không tự gửi lại (chưa có hook nào để kiểm) |
| **Chưa nối** | W1 hook `useSelfNavigation` (fetch, khóa theo workspace/env/session, bỏ câu trả lời muộn, làm lại khi mount/env/focus/409 một lần), W3 `PortalShell` gộp token, dòng "Navigation unavailable" thấy được, hook eligibility cho Rail, bộ double e2e | không | chưa có nơi nào trong shell fetch self-navigation, nên hôm nay hai hàm mới chỉ được test thuần, chưa có chứng cứ trình duyệt |

## 5. Test (không Docker, không visual, không hook)

| Gate | Kết quả |
| --- | --- |
| Trước khi sửa, `vitest run src/execution/v2/readers/accessSelf` | 244 đỏ / 2309 |
| Sau khi sửa, cùng đường dẫn + ma trận I mới | 2460 xanh (accessSelf unit + conformance) |
| `vitest run src/execution/v2 src/app --maxWorkers=2` | 136 file xanh; 36412 pass, 8 expected-fail (đã có sẵn), 3 skipped |
| `tsc --noEmit -p .` | exit 0, không dòng nào |
| Chưa chạy | visual pinned-image, Playwright, hook R2/R3, đọc runtime (image chưa phục vụ trường mới) |

Conformance mới (`accessSelf.conformance.test.ts`): `observed_at_ms`/`valid_until_ms` thêm vào danh sách trường required và `integerCases` của L3 (hai body); **ma trận I**: schema là oracle cho vô hướng (16 giá trị x 2 khóa x 2 body: reader nhận <=> schema hợp lệ và bất biến), cặp `==`/`<` hợp lệ theo schema nhưng reader từ chối (đếm là "nghiêm hơn, có chủ ý"), khóa thừa/đổi tên, đồng hồ client x cặp (11 mốc: trước observed, đúng ceiling, +1 ms, +1 s, MAX_SAFE, NaN, ±Infinity), và thông điệp lý do. Không test nào bị đổi kỳ vọng để cho xanh: 244 test cũ xanh trở lại vì reader đọc hợp đồng mới, không vì nới.

## 6. Verdict và các ô

**FE-057: ACCEPTED (mức hợp đồng và reader).** Hai trường published đúng như return mô tả, fixture/schema/generated nhất quán, reader đọc đủ và dùng theo một chiều đóng. Điều kiện còn lại để thành VERIFIED: hook W1/W3 (§4) và nghiệm thu trình duyệt trên image phục vụ trường mới.

**FE-058: CHANGES_REQUESTED trong phạm vi FE (không phải với Codex).** Q1-Q5 đã được trả lời và FE chấp nhận ngữ nghĩa (Q1 chỉ dùng cho nav affordance; Q2 env của ContextBar, không hợp ba env; Q3 BLOTTER <= `alpha.read` là gợi ý hiển thị, Approvals vẫn theo `governance.*` thật, không có `execution.accounts.manage`; Q4 `route:null` cần bề mặt self-only riêng, không dẫn người thường sang `/administration/profile-access`; Q5 chỉ là quan sát Portal + trần session). Phần shell chưa làm nên ô **chưa đóng**: DEBT-UXM07-005 (`execution.accounts.manage` -> bỏ hoặc đổi tên, không map sang `account.read`), W1/W3, bề mặt Profile self-only (FE-038), 7 mục rail vẫn chỉ phủ 4 (Overview/Alpha Fleet/Approvals ngoài projection theo thiết kế).

**FE-059: không đổi, vẫn OPEN.** Return không giao eligibility nhiều resource; hợp đồng vẫn là một resource, 1..16 action. Ô cho nút hành động trên bảng chưa có nền.

**FE-037: vẫn "đóng một phần"** (4/4 tên có projection thay; thiếu ba mục rail và `accounts.manage`, như Codex xác nhận ở Q3). **FE-038/039:** không bị giao hàng này đụng tới.

Ô đề xuất cho sổ (Codex/vòng sau dán, tôi không sửa tệp): `FE-057 | DELIVERED -> consumer ACCEPTED 2026-10-20 (reader 03a6d748; hook shell chưa nối) | FE-058 | Q1-Q5 đã nhận; shell W1/W3 + route Profile self-only mở | FE-059 | OPEN, chưa giao`.

## 7. Còn lại (chủ và điều kiện đóng)

1. Claude: W1 `useSelfNavigation` + W3 gộp token trong `PortalShell`, kèm dòng "Navigation unavailable"; điều kiện đóng: test 5 pha, bỏ câu trả lời muộn khi đổi env/workspace/session, 409 một lần, không `localStorage`, double e2e.
2. Claude + Bobby: copy hết hạn ở §3 và bề mặt Profile self-only (Bobby duyệt).
3. Codex: record receipt này vào sổ FE-057/058/059; image mang trường mới khi tới mốc tích hợp.
4. Rollback: bỏ `selfNavGate.ts` và các hàm `*Now`; reader quay về trạng thái từ chối (fail closed), không khôi phục quyền nào.
