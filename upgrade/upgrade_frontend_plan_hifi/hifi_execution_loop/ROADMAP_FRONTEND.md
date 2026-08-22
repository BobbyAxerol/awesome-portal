# Roadmap frontend — Execution Loop

**Cập nhật:** 2026-08-22 · **Giữ bởi:** Claude · **Đọc cùng:** `PHASE_TRACKER.md`
(trạng thái sống, chi tiết từng slice) và `EXECUTION_SCALE_AND_REFINE.md` (BR-EX-*)

> Tài liệu này trả lời đúng một câu: **Bobby cần quyết gì tiếp theo, và trong lúc
> đó Claude làm gì.** Mọi thứ khác nằm ở hai file kia.

---

## A. Bobby cần quyết — 5 việc, xếp theo mức mở khoá

Không việc nào cần bạn viết code. Mỗi việc là một câu trả lời.

### A1 · Endpoint `ops` và catalogue canonical → **mở 6 màn** 🔴 lớn nhất

**Đã đổi nội dung ngày 2026-08-22.** Màn phase 6 **đã dựng xong** trên Lane A —
21 lệnh / 6 nhóm, xem tại `/execution/_fixtures`. Nên A1 không còn là "chờ để
dựng màn" nữa; nó là hai thứ khác:

**A1a — 8 endpoint `ops` còn thiếu.** Khi dựng catalogue tôi đối chiếu từng dòng
`extract/` với OpenAPI và thấy `extract` gán path của *handler* cho mọi action
trong handler. Hệ quả: 8 action `ops` trông như tới được, thực ra **không có
route nào**.

| Thiếu | Chặn màn |
|---|---|
| `command-journal`, `findings` | phase 7 Operations Queue |
| `alerts`, `dead-letters`, `trace-order` | phase 8 Incident Detail |
| `streams`, `alpha-activity` | phase 9 Command Center |

Nghĩa là khoảng trống thật là **15 action**, không phải 7. Và mở catalogue thôi
**không đủ** để ba màn kia có dữ liệu.

**A1b — catalogue canonical trong `packages/contracts`.** Vẫn cần, nhưng giờ chỉ
để **đổi nguồn**: màn đang chạy catalogue fixture và tự nói ra điều đó trên
giao diện. Không có nó thì phase 6 không activate được, nhưng đã dựng xong.

**Bạn cần làm:** giục codex theo thứ tự **A1a trước A1b**. A1a chặn ba màn chưa
dựng; A1b chỉ chặn việc activate một màn đã dựng.

Chi tiết: `BR_EX_28_PHASE6_CATALOGUE_AND_UNBLOCK.md` §8.

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
| B3 | Map mọi panel failure state | 5 | ✅ panel không đọc được **chặn promote** |
| B4 | Bind extend/reject vào `can_extend_observation` / `can_reject` | 5 | ✅ |
| B5 | Chọn plan schema + decision vocabulary cho Paper Exit | 5 | ✅ + **sửa route sai** |
| B6 | CSRF double-submit same-origin trên mọi mutation | 1, 2, 5 | ✅ |
| B7 | Canonical `view` param + registry activation review | 1 | ⏳ |
| B8 | Canonical plan/apply/poll route + policy Portal-governance-write riêng | 2 | ⏳ |
| B9 | Dùng `portfolio_id`/`currency` sinh ra, bỏ default fixture | 3 | ✅ xong `8d8779a` |
| B10 | Tiêu thụ SSE expiry/gap semantics đã publish | 9 | ⏳ **code được ngay** (C-PI04-02); chặn *activation* bởi snapshot/SSE parity + profile evidence thật |

**Lane Command Center — codex giao 2026-08-22 (PRE-IAM-03, tracker §24A.3).**
Backend đã giao `GET /api/v1/execution/command-center` + schema
`execution.command-center-snapshot.v1` + 5 fixture. Phase 9 chuyển từ *chờ
backend* sang **việc của tôi**.

| # | Việc | Trạng thái |
|---|---|---|
| B11 | Dựng màn Command Center (5a) trên Lane A | ✅ |
| B12 | Map đủ 5 state: busy / empty / partial / stale / unavailable | ✅ |
| B13 | Giữ authority + freshness **theo từng panel**, không gộp | ✅ |
| B14 | `observed_total_count` là tập con đã thấy khi `exact_total=false` | ✅ |
| B15 | **Không xếp hạng lại** — rank do server sở hữu | ✅ |
| B16 | Pin trỏ tới thứ không có Fleet phải hiện `unavailable`, không ẩn | ✅ |
| B17 | Ẩn control EventSource/profile khi `stream_available=false` | ✅ |

Codex nói rõ: **không** gộp catalogue BR-EX-28 vào Command Center, và **không**
thêm generic Redis read.

**Đã xong:** B3–B6 (phase 5) · B11–B17 (phase 9). **Tiếp theo:** B7 (canonical `view` + registry, phase 1) → B8 (policy Portal-governance-write riêng, phase 2).

---

## C. 17 màn — ai đang chặn

| Phase | Màn | UI | Chặn bởi |
|---|---|---|---|
| 0 | Shell & components | ✅ | — |
| 1 | Approval Inbox | ✅ | **Claude** B6, B7 |
| 2 | Gate R1 | ✅ | **Claude** B6, B8 |
| 3 | Gate R2 | ✅ | source activation (codex) |
| 4 | Paper Workbench | ✅ | screen API (codex) |
| 5 | Paper Exit | ✅ | Lane A đóng; chờ Paper source thật |
| 6 | Admin Drawer | ✅ | A1b — catalogue để activate |
| 7 | Operations Queue | ⛔ | **A1a** — `command-journal`, `findings` |
| 8 | Incident Detail | ⛔ | **A1a** — `alerts`, `dead-letters`, `trace-order` |
| 9 | Command Center | ✅ | Lane A đóng; nguồn thật cần **A1a** |
| 10 | Sandbox Certification | ⛔ | phase 4–6 + TS sandbox capability |
| 11 | Canary Control Room | ⛔ | phase 10 + cổng owner |
| 12 | Live Full Operations | ⛔ | phase 11 + EX-BE-08 |
| 13 | Paper Workbench VNM | ✅ | screen API (codex) |
| 14 | Full Blotter | ✅ | **A2 — Bobby** |
| 15 | Alpha 360° | ✅ | source activation (codex) |
| 16 | Portfolio 360° | ✅ | **A4 — Bobby** |
| 17 | Account/Broker 360° | ✅ | **A3 — Bobby** |
| 18 | Hardening | ⛔ | EX-BE-08 |

**12 màn có UI. 5 màn chưa — ba trong năm nằm sau A1a.**

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

### E.1 · H-1…H-12 — **đã đóng** bởi PRE-IAM-04 (`5e28693`)

Tôi từng liệt kê cả 12 là còn treo. Sai — chúng đóng rồi. Đã kiểm chứng bốn
claim nặng nhất bằng code chứ không tin lời:

| Mã | Bằng chứng tôi tự kiểm |
|---|---|
| **H-1** decimal | `DecimalString::parse` dùng `from_str_exact` — **lỗi** thay vì làm tròn âm thầm. Đây đúng chỗ tôi báo. |
| **H-10** schema gate | `packages/contracts/test/fixtures.spec.ts` map **cả 6** fixture vào component OpenAPI của nó |
| **H-11** Rust parity | `edge-service/src/main.rs` deserialize thẳng 6 file fixture vào type Rust |
| **H-12** phủ fixture | `ls` cho ra **6/6**: capital-preview, order-funnel, insight-batch, correlation, capital-ledger, binding-exposure |
| H-2…H-9 | ghi trong `PRE_IAM_04_OFFLINE_HARDENING_CLOSEOUT.md` §26–35 kèm evidence từng dòng |

**Hệ quả cho frontend, không phải cho backend:** H-1 nay *từ chối* decimal vượt
scale. Một lệnh gọi trước đây thành công (với số bị làm tròn) giờ có thể trả
**422** — nên `C-PI04-05` mới gấp.

### E.2 · Vẫn đang mở

| Mã | Nội dung | Mức |
|---|---|---|
| **BR-EX-28 §8.1** | **8 endpoint `ops` chưa tồn tại** — Portal **không** được thay bằng đọc thẳng DB/Redis | → A1a 🔴 |
| BR-EX-28 §4 | catalogue canonical | → A1b |
| BR-EX-28 §8.2 | `allocation` còn UNCLASSIFIED | 🟠 |
| BR-EX-24 | endpoint list order | → A2 |
| BR-EX-26 | aggregate headroom verdict | → A3 |
| BR-EX-27 | `sample_counts` | → A4 |
| BR-EX-25 | funnel 5 hop vs 4 stage | 🟡 chờ trả lời |
| BR-EX-29 | `conditions[]` thay cho một chuỗi | 🟡 |

BR-EX-24…29 **không** bị PRE-IAM-04 đóng; chúng chờ contract của chính chúng.
Codex xác nhận trong §10 bước 3 rằng BR-EX-28 và BR-EX-29 nằm trong EX-BE-05b/F0.

---

## E2. Việc codex vừa giao — PRE-IAM-04 (2026-08-22)

Sáu gói `C-PI04-01…06` cộng một mục sửa tracking. Đã đo từng gói, **bốn gói có
lỗ thật**, lớn nhất là Funnel/Ledger đang hiện cửa sổ bị chặn như thể toàn bộ
lịch sử. Kế hoạch và thứ tự đề xuất: **`PLAN_PRE_IAM_04_FRONTEND.md`**.

Chưa bắt đầu — chờ bạn duyệt thứ tự ở §8 của tài liệu đó.

---

## F. Nếu bạn chỉ làm một việc

**Giục codex mở 8 endpoint `ops` (A1a).** Ba màn chưa dựng — Operations Queue,
Incident Detail, Command Center — đều chờ đúng tám endpoint đó, và không có
đường vòng nào cho chúng.
