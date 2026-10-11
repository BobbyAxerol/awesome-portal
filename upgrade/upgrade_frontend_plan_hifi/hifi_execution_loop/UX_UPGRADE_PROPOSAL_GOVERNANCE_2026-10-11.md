# Đề xuất nâng cấp UI/UX — Approval Inbox · Gate R1 · Gate R2 · Request mới (Claude, 2026-10-11)

Nguồn đọc: màn thật trên research preview (1280px, `claude-preview`; inbox đang trống) + trang fixture `/execution/_fixtures` (có dữ liệu mẫu) cho Inbox, R1, R2.
Chưa sửa code. Chờ Bobby chốt ba quyết định ở §7.

## 1. Đánh giá thẳng: vì sao chưa hợp với Research loop

| # | Quan sát trên màn | Hậu quả |
|---|---|---|
| 1 | Research nói bằng **câu** ("Run này đã freeze, 30 fold…"); Governance nói bằng **chip + mã**: `GATE R1`, `PENDING 1/2`, `WF 1a`, `BR-EX-67`, `visibility ≠ authority`, `row → gate review screen` | Người duyệt phải dịch mã trước khi quyết. Mã ticket nội bộ (BR-EX-67) và nhãn wireframe (WF 4a) lộ ra như nội dung |
| 2 | R1 chia 4 khung 2×2 độ rộng lệch nhau (Passport / Checklist / Limitations / Decision), rồi 1 thanh quyết định ở cuối. **Kết luận ("duyệt được hay không") nằm trong khung Checklist bên phải**, thanh nút ở cuối trang | Phải đọc hết để biết câu trả lời; nút Approve xám với lý do bị gập ("▸ 1 more reason") |
| 3 | Khung `UNAVAILABLE … not published yet (BR-EX-67)` xuất hiện 3–4 lần/màn, mỗi lần một khung to | Trung thực nhưng ồn: chiếm diện tích bằng bằng chứng thật. Research đã giải bài này bằng **một dòng claim** thay cho nhiều khung vắng mặt |
| 4 | Inbox: 7 pill lọc trộn 4 loại tiêu chí (của tôi / cổng / môi trường / trạng thái); bảng 7 cột bị cắt chữ ("Carry v…", "OKX TE…", "Mean…"); tuổi hiển thị `26h 00m 00s / 24h` | Không biết "việc tiếp theo của tôi là gì". Cột nào cũng ngang hàng nhau |
| 5 | **Request mới bắt gõ tay 3 id** (alpha, evidence run, methodology claim), ghi rõ "no candidate list is published" | Đứt luồng: Research đã có Run Library, Report và RC; R1 lại bắt người dùng sao chép id. Luồng đúng là *từ RC bấm "Đưa sang R1"* |
| 6 | R2 lặp lại ba khung "Portfolio fit" (một UNAVAILABLE, một có số), cộng thêm dòng trần "stage_eligibility is not published" | Cùng một chủ đề xuất hiện 2–3 lần với trạng thái khác nhau — người đọc không biết số nào đúng |
| 7 | Đang dùng bảng màu/chữ riêng của Execution (mono dày, viền chip nhiều màu); Research S08 dùng 1 accent, đường mảnh, ít chip | Hai loop trông như hai sản phẩm |

Việc đã đúng và **giữ**: tách người tạo ≠ người duyệt hiển thị rõ; điều kiện duyệt là object có owner/hạn; Deny không bao giờ bị khoá; số chỉ do server tính; trạng thái vắng mặt có kiểu (không bịa 0).

## 2. Nguyên tắc nâng cấp (theo yêu cầu: rõ nguồn · đẹp · ít chữ · luồng sạch)

1. **Một câu hỏi mỗi màn.** Inbox: "việc gì cần tôi quyết?". R1: "bằng chứng nghiên cứu này có đủ để mở cổng?". R2: "vận hành có sẵn sàng nhận vốn?".
2. **Kết luận trước, bằng chứng sau.** Dải *Verdict* ở đầu mọi gate, nút quyết định đi liền với nó.
3. **Mỗi con số có nguồn bấm được**: "Report S09 · run_5512 · attempt 2" → mở đúng màn Research. Đây là thứ nối hai loop.
4. **Vắng mặt gom lại**: một dòng "3 mục chưa có dữ liệu ▸" mở ra danh sách + lý do có kiểu; mã ticket nằm trong Details.
5. **Cùng ngôn ngữ với Research**: token hiện có (Governance Light), 1 accent, đường mảnh, chip chỉ cho trạng thái thật; bỏ nhãn WF/ticket khỏi mặt chính.
6. **Luồng là một sợi**: Report → RC → R1 → R2 → Paper → Sandbox → Canary → Live, hiển thị bằng *một thanh bước* dùng chung ở mọi gate.

## 3. Luồng đề xuất

```
Research  Report (S09) ──[Đưa sang R1]──▶  Request tự điền (alpha, run, claim, digest)
                                               │ người gửi chỉ viết 1 câu tóm tắt
Governance Inbox "Cần bạn quyết" ──▶ Gate R1 ──approve──▶ Gate R2 ──approve──▶ Paper → Sandbox → Canary → Live
                                      ▲ mỗi gate cùng một khung: Thanh bước · Verdict · Bằng chứng · Quyết định
```
- Request mới vẫn có mặt (cho trường hợp không đi từ RC) nhưng chọn từ **danh sách run đã có RC**, không gõ id.
- Khi Inbox trống: nói rõ bước kế ("Chưa có hồ sơ. Mở một Report đã freeze và bấm Đưa sang R1") với liên kết — thay cho "Nothing in this view".

## 4. Wireframe

### 4.1 Approval Inbox — "Cần bạn quyết"
```
Approval Inbox                                   [ Của tôi | Tất cả ]  [ Cổng ▾ ]   + Yêu cầu mới
─────────────────────────────────────────────────────────────────────────────────────────────────
CẦN BẠN QUYẾT · 3
 ● Carry v3.2 → sandbox OKX            R2   quá hạn 2h      Broker sync cũ 1 phiên      [ Mở ]
   chờ 0/2 · bạn là người duyệt đầu tiên
 ● RSI v1.7                            R1   còn 22h         Không có blocker            [ Mở ]
 ● Grid v2.2 → paper exit              EXIT còn 44h         1 điều kiện chờ             [ Mở ]
ĐANG CHỜ NGƯỜI KHÁC · 1        Grid v2.2 · Live canary · bạn không thể duyệt (tách nhiệm vụ)
BỊ CHẶN · 1                    Mean v1.1 · R1 · "audit replay thất bại" ▸ xem lý do
Đã quyết gần đây (30 ngày) ▸    ← gập mặc định
```
Bỏ: 7 pill, cột Quorum/Target riêng, "visibility ≠ authority", "row → gate review screen". Tuổi: "quá hạn 2h" / "còn 22h", thanh SLA mảnh. Hàng cao hơn, không cắt chữ (tên alpha đủ dài, dùng 2 dòng).

### 4.2 Khung chung của Gate R1 / R2 / Live / Exit
```
[Report]─[RC-41]─( R1 )─[ R2 ]─[Paper]─[Sandbox]─[Canary]─[Live]        ← thanh bước dùng chung
RSI v1.7 · Duyệt bằng chứng nghiên cứu                      Gửi bởi Minh · còn 22h · bạn là người duyệt 1/2
┌─ VERDICT ───────────────────────────────────────────────────────────────────────────────────────┐
│ Có thể duyệt, kèm 1 điều kiện đề xuất        6/7 kiểm tra đạt · 0 blocker · 1 cảnh báo           │
│ "Dữ liệu khối lượng chỉ phủ top-3 symbol"  → điều kiện gợi ý đã điền sẵn                         │
│                          [ Duyệt kèm điều kiện ]  [ Chưa duyệt ▾ yêu cầu sửa / từ chối ]           │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
BẰNG CHỨNG (mỗi dòng: kết luận · nguồn bấm được)
 ✓ Engine + dữ liệu + phiên bản khớp digest          Report S09 ▸
 ✓ Audit replay tái lập được (checksum khớp)          run_5512 · attempt 2 ▸
 ✓ Holdout chưa bị chạm khi chọn tham số              S07 Freeze ▸
 ! Capacity: khối lượng chỉ phủ top-3                 → điều kiện gợi ý
 ○ 3 mục chưa có dữ liệu ▸   (chuỗi bằng chứng · phạm vi vốn · chính sách cổng) — mở ra thấy lý do có kiểu
GIỚI HẠN & HẠN CHẾ ĐỀ XUẤT   (một khối, mỗi dòng 1 câu)
```
- Passport (digest, entrypoint, params…) xuống **Details ▸** có thể copy; mặt chính chỉ giữ kết luận + nguồn.
- Nút: **một** nút chính theo verdict; "Chưa duyệt ▾" gom Request changes / Deny. Deny luôn bật. Nút chính xám thì lý do nằm *cạnh nút* trong một dòng, không gập.
- Thanh quyết định dính đáy màn hình (sticky) trên màn dài; trên 660px thành bottom sheet.

### 4.3 R2 — thêm đúng phần khác biệt
Verdict cũng có chữ về R1 ("R1 đã duyệt bởi Minh 07-30, hết hạn 11-01 — còn 51 ngày"; R1 hết hạn ⇒ cả khung khoá, như hiện tại nhưng nói bằng câu). Bên dưới chia **hai** khối thay vì ba–bốn: *Tài khoản & rủi ro* (margin, risk, matcher, order types) và *Tác động vốn* (trọng số, tương quan, trùng symbol — một khối, nếu server chưa publish thì một dòng vắng mặt, không hai khung).

### 4.4 Request mới
Từ Report: nút "Đưa sang R1" → màn xác nhận có sẵn alpha, run, claim, digest (chỉ đọc) + ô tóm tắt. Từ menu: chọn một run đã freeze/đã có RC từ danh sách (nguồn: RC publication của Research), không gõ id.

## 5. Dữ liệu & rõ nguồn
- Verdict, đếm kiểm tra, blocker, điều kiện gợi ý: **server đã tính** (checklist/policy) — UI chỉ trình bày, không tự suy.
- Liên kết nguồn: `run_id`, `release_candidate_id`, `artifact digest` đã có trong payload R1; route Research đích đã tồn tại (S07/S09, RC deep link giữ `workspace_id`).
- Chưa có contract: danh sách run đủ điều kiện để chọn trong Request mới (hiện "no candidate list is published") → **Backend request cho Codex**; trước mắt giữ ô gõ id nhưng thêm nút "Dán từ RC".
- Bỏ khỏi mặt chính, giữ trong Details/Inspector: mã BR-EX-*, nhãn WF, digest đầy đủ, `delivery_profile`.

## 6. Kế hoạch giao (3 lát, mỗi lát duyệt xong mới sang lát sau)

| Lát | Nội dung | Rủi ro / cổng |
|---|---|---|
| A | **Khung gate chung + Verdict + thanh bước + decision dock** áp cho R1 và R2 (giữ nguyên dữ liệu & test an toàn) | Đụng baseline hình của R1/R2 → ghi lại có quy trình; test "Deny không khoá", separation-of-duty phải giữ nguyên |
| B | **Inbox "Cần bạn quyết"** (nhóm theo việc, bỏ pill, đỡ cột) + trạng thái trống có hướng dẫn | Đụng baseline Inbox |
| C | **Nối từ Research**: nút "Đưa sang R1" ở Report/RC, Request mới tự điền, danh sách run (cần contract) | Phụ thuộc Codex ở phần danh sách; phần nút không phụ thuộc |
Sau đó Live gate / Exit review / Waivers dùng lại khung A.

## 7. Cần Bobby chốt
1. **Phạm vi trước:** (khuyến nghị) A → B → C theo thứ tự trên, hay làm Inbox trước?
2. **Thanh quyết định:** một nút chính + menu "Chưa duyệt ▾" (khuyến nghị, ít chữ) hay giữ cả 4 nút ngang như hiện tại?
3. **Mã nội bộ (BR-EX-*, WF):** (khuyến nghị) ẩn khỏi mặt chính, chỉ ở Details/Inspector — đồng ý?
Khi chốt, tôi dựng mock tĩnh (HTML) của Inbox + R1 để duyệt hình trước khi viết code.

## 8. Đã giao (2026-10-11, Bobby duyệt A → B → C, một nút chính + menu "Not yet ▾", ẩn mã nội bộ)

| Lát | Giao | Ghi chú trung thực |
|---|---|---|
| A | `components/gateFrame.tsx` (thanh bước · Verdict · một dòng vắng mặt · nút quyết định) áp cho **R1 và R2**; passport gập, checklist + giới hạn một hàng; mọi lý do khoá nằm một dòng cạnh nút (bỏ "n more reasons") | Verdict chỉ đếm các dấu server đã trả; không có verdict mới. Live gate / Exit review / Waivers chưa chuyển sang khung này |
| B | Inbox: subject dẫn đầu, một cột "what's next" (cần bạn / không phải bạn / chờ người khác / blocker), SLA là câu ("overdue 2h", "22h left"), 3 điều khiển lọc (Mine·All, gate ▾, Overdue) cùng 9 view của server, "Recently decided" gập, trạng thái trống chỉ bước kế | Lọc vẫn là một view server mỗi lần; không nhóm lại phía client (sẽ nói dối về số đếm) — "nhóm" được thể hiện bằng cột what's next |
| C | Request mới: dòng nói lối vào thường là publish RC ở Research (đã có sẵn, tạo R1 kèm evidence pack); chọn **run đã COMPLETED từ Run Library** (điền cả alpha); `?alpha=&run=&claim=` điền sẵn | Phát hiện: nút "Đưa sang R1" **đã tồn tại** (publish ở màn RC). Claim vẫn gõ vì Research chỉ liệt kê claim theo từng RC; danh sách claim theo run vẫn là backend request nếu muốn bỏ hẳn bước gõ |
| chung | WF xx ẩn khỏi mặt chính (CSS), BR-EX-xx chỉ còn trong Policy & references / dòng vắng mặt | Selector e2e/Playwright bấm Deny/Request changes (nếu có) cần mở menu; không có spec nào bấm hiện nay |

Evidence: vitest frontend 384 file / 6495 pass; tsc -b sạch; browser (research preview, 1280/660): Inbox, New request, R1/R2/Inbox trên fixtures, 0 tràn ngang, 0 lỗi trang. Baseline hình Execution **chưa** ghi lại — các màn này đổi hình, cần chạy quy trình baseline riêng khi Bobby duyệt hình.

## 9. Vòng refine thứ hai (2026-10-11) — soi lại trên route thật (Governance Light), không chỉ fixture

Sửa ngay (đã giao): menu "Not yet ▾" **không đóng bằng Escape / bấm ra ngoài / Tab đi chỗ khác** (đo: sau Escape vẫn `open`) → đóng được cả ba cách; Waivers mở đầu bằng khối "Command authority / source health / journal" khổng lồ với mã thô trước cả sổ nghĩa vụ → sổ lên đầu, khối chứng cứ gập ở dưới; Request mới còn câu "no candidate list is published" dù đã có danh sách run, và dòng schema id → câu đúng theo trạng thái, bỏ schema id; gate không đọc được in mã thô `WORKSPACE_NOT_FOUND` → câu thường + mã trong ngoặc + link về Approval Inbox.

Chưa sửa, cần Bobby quyết (đụng quyết định Phase 8 "giữ khung panel khi record vắng"): xem phần trả lời.
