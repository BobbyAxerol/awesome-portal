# Roadmap frontend — Execution Loop

**Cập nhật:** 2026-08-22 · **Giữ bởi:** Claude · **Đọc cùng:** `PHASE_TRACKER.md`
(trạng thái sống, chi tiết từng slice) và `EXECUTION_SCALE_AND_REFINE.md` (BR-EX-*)

> Tài liệu này trả lời đúng một câu: **Bobby cần quyết gì tiếp theo, và trong lúc
> đó Claude làm gì.** Mọi thứ khác nằm ở hai file kia.

---

## A. Bobby cần quyết — 5 việc, xếp theo mức mở khoá

Không việc nào cần bạn viết code. Mỗi việc là một câu trả lời.

### A1 · Catalogue Admin Drawer → **mở 6 màn** 🔴 lớn nhất

**Câu hỏi:** Drawer liệt kê lệnh theo nguồn nào?

| Nguồn | Nội dung |
|---|---|
| Hi-fi 1i | 21 lệnh / 6 nhóm |
| `command-catalog.yaml` | 13 family, 1 có `plan` |
| `extract/cli-command-map.json` | 19 noun / 64 action, 7 không có HTTP |

**Bạn đã trả lời một nửa:** phương án B — mở HTTP cho 7 action, ưu tiên ngay.
Codex đã xác nhận *"không cho phép Portal-to-Redis hay generic `get`/`scan`"*.

**Còn thiếu:** codex publish **catalogue canonical** trong `packages/contracts`
(mỗi action kèm `portal_reachable`, `http_path`, `blocked_reason`). Đây mới là
thứ mở phase 6 — không phải 7 capability kia.

**Bạn cần làm:** giục codex ưu tiên catalogue **trước** 7 endpoint. Chi tiết:
`BR_EX_28_PHASE6_CATALOGUE_AND_UNBLOCK.md`.

**Mở ra:** phase 6 → 7, 8, 9, 10, 11, 12.

---

### A2 · Endpoint list order → mở Full Blotter 🟠

**Câu hỏi:** Portal được đọc danh sách order ở phạm vi nào?

Hiện chỉ có `/orders/{id}/funnel` — chi tiết một order, không có danh sách.
Màn đã dựng xong, chạy fixture.

**Bạn cần làm:** duyệt `BR-EX-24`. Kèm hai ràng buộc tôi xin giữ: bucket 5 chip
**server-side**, và `total_count`/`filtered_count` là **hai** trường.

---

### A3 · Verdict aggregate exposure → mở Account/Broker 360 🟠

**Câu hỏi:** ai phán "còn headroom hay không"?

Đây là control **fail-closed**. Browser cộng ba dòng thấy được ra `+2,120`
trong khi execution cell giữ `46,800` và chặn mọi lệnh → **màn nói ngược với
thứ sắp xảy ra**. Và browser không cộng đúng được: nó chỉ thấy `linked[]` mà
endpoint trả.

**Trạng thái:** màn hiện `unavailable` kèm lý do khi không có verdict. Không bao
giờ tự cộng.

**Bạn cần làm:** duyệt `BR-EX-26`.

---

### A4 · `sample_counts` cho correlation → đóng Portfolio 360 🟡

**Câu hỏi:** packed matrix có gửi số mẫu từng cặp không?

`IMPLEMENTATION_PHASES` §16 đóng phase bằng *"render INSUFFICIENT_DATA when
samples < threshold"*. Hiện **không làm được per-cell**: `RANKED_PAIRS` có
`sample_count`, packed matrix không có gì.

**Trạng thái:** màn nói thẳng trên caption rằng sàn 200 mẫu **không áp được**.
Không đánh dấu ô nào là insufficient chỉ vì thiếu count.

**Bạn cần làm:** duyệt `BR-EX-27`.

---

### A5 · "Request changes" là outcome gì? 🟡

**Câu hỏi:** R1/R2 có outcome thứ tư ngoài Approve / Approve-with-condition /
Deny không?

Hi-fi vẽ nó. Backend **không có verb này** (`R1_DECISIONS` chỉ ba giá trị). Đây
là **quyết định sản phẩm**, không phải một cái nút: "request changes" nghĩa là
request quay lại người nộp ở trạng thái nào, ai đóng nó, nó có hết hạn không.

**Bạn cần làm:** trả lời có/không. Có thì tôi viết BR-EX cho codex.

---

## B. Claude đang làm — không chờ ai

Codex giao lane này ngày 2026-08-22 (PHASE_TRACKER §24A.2).

| # | Việc | Phase | Trạng thái |
|---|---|---|---|
| B1 | Đọc `review_version` từ schema Paper Exit | 5 | ✅ xong `f063ca9` |
| B2 | LifecycleRail dựng theo stage | 5 | ✅ xong `f063ca9` |
| B3 | Map mọi panel failure state (partial/stale/unavailable/error) | 5 | ⏳ tiếp theo |
| B4 | Bind extend/reject vào `can_extend_observation` / `can_reject` | 5 | ⏳ |
| B5 | Chọn plan schema + decision vocabulary cho Paper Exit | 5 | ⏳ |
| B6 | CSRF double-submit same-origin trên mọi mutation | 1, 2, 5 | ⏳ |
| B7 | Canonical `view` param + registry activation review | 1 | ⏳ |
| B8 | Canonical plan/apply/poll route + policy Portal-governance-write riêng | 2 | ⏳ |
| B9 | Dùng `portfolio_id`/`currency` sinh ra, bỏ default fixture | 3 | ✅ xong `8d8779a` |
| B10 | Tiêu thụ SSE expiry/gap semantics đã publish | 9 | ⏳ chờ phase 9 |

**Thứ tự tôi làm:** B3 → B4 → B5 (đóng phase 5) → B6 (chạm 3 phase) → B7, B8.

---

## C. 17 màn — ai đang chặn

| Phase | Màn | UI | Chặn bởi |
|---|---|---|---|
| 0 | Shell & components | ✅ | — |
| 1 | Approval Inbox | ✅ | **Claude** B6, B7 |
| 2 | Gate R1 | ✅ | **Claude** B6, B8 |
| 3 | Gate R2 | ✅ | source activation (codex) |
| 4 | Paper Workbench | ✅ | screen API (codex) |
| 5 | Paper Exit | ✅ | **Claude** B3–B5 |
| 6 | Admin Drawer | ⛔ | **A1 — Bobby** |
| 7 | Operations Queue | ⛔ | phase 6 |
| 8 | Incident Detail | ⛔ | phase 6 |
| 9 | Command Center | ⛔ | phase 6 |
| 10 | Sandbox Certification | ⛔ | phase 6 |
| 11 | Canary Control Room | ⛔ | phase 6 + cổng owner |
| 12 | Live Full Operations | ⛔ | phase 11 + EX-BE-08 |
| 13 | Paper Workbench VNM | ✅ | screen API (codex) |
| 14 | Full Blotter | ✅ | **A2 — Bobby** |
| 15 | Alpha 360° | ✅ | source activation (codex) |
| 16 | Portfolio 360° | ✅ | **A4 — Bobby** |
| 17 | Account/Broker 360° | ✅ | **A3 — Bobby** |
| 18 | Hardening | ⛔ | EX-BE-08 |

**10 màn có UI. 7 màn chưa — sáu trong bảy nằm sau A1.**

---

## D. Lane A và Lane B

**Lane A** = màn chạy fixture, **không** gắn route sản phẩm. *Fixture data ở
route sản phẩm là thứ ranh giới này cấm.* Xem được ở `/execution/_fixtures`.

**Lane B** = gắn route, dữ liệu thật. Bắt đầu khi **cả hai** điều kiện đủ:

1. Registry bật `query_enabled` cho screen đó
2. Backend phục vụ dữ liệu thật (`EX-BE-08a` source activation)

Rồi Lane B là **một dòng trong `MODULES`** của `PortalRoutes.tsx`. Không viết
lại màn.

**Hiện tại: 0 màn ở Lane B.** Đúng thiết kế.

---

## E. Request đang treo với codex

| Mã | Nội dung | Mức |
|---|---|---|
| **H-1** | `DecimalString::parse` làm tròn âm thầm quá 28 chữ số | 🔴 nặng nhất |
| **H-11** | Không test nào chứng minh Rust analytics khớp OpenAPI | 🔴 |
| H-3 | Live `epoch_changed` gap thiếu jitter deadline → thundering herd | 🟠 |
| H-10 | Analytics là contract duy nhất không có schema gate | 🟠 |
| H-12 | 5/6 endpoint analytics không có fixture | 🟠 |
| H-4…H-9 | reason gap, 503 cho lỗi client, cap cứng, cursor code, operation status | 🟡 |
| BR-EX-24 | endpoint list order | → A2 |
| BR-EX-25 | funnel 5 hop vs 4 stage | 🟡 chờ trả lời |
| BR-EX-26 | aggregate headroom verdict | → A3 |
| BR-EX-27 | `sample_counts` | → A4 |
| BR-EX-28 | catalogue canonical | → A1 |
| BR-EX-29 | `conditions[]` thay cho một chuỗi | 🟡 |

---

## F. Nếu bạn chỉ làm một việc

**Giục codex publish catalogue canonical (A1).** Nó mở sáu màn — nhiều hơn bốn
quyết định còn lại cộng lại.
