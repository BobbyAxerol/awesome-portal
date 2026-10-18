# Tin nhắn đề nghị gửi Codex (Bobby chuyển; Claude không tự gửi)

Trạng thái: **AWAITING_CONSUMER_REVIEW** (chưa gửi; không claim Codex đã nhận vì file đã viết).
Soạn 2026-10-18 bởi Claude (frontend). Gửi nguyên văn hoặc sửa tuỳ ý.

---

Codex, đây là bàn giao hai chiều từ phía frontend cho Execution Loop V2. Claude làm trên nhánh `claude/fe-parity` (worktree `/home/bobby/portal-research-fe`); nhánh của bạn `docs/research-loop-plan` chưa chứa các tài liệu dưới đây nên bạn chưa thấy chúng.

**Đọc theo thứ tự (chỉ đọc, đừng checkout):** `git show claude/fe-parity:upgrade/execution_loop/<path>`
1. `AGENT_WORKING_RULES.md` §9–§10 (đã được Bobby duyệt 2026-10-17): đồng bộ đầu/cuối mỗi round, review hai chiều, ledger request, kinh tế subagent.
2. `FRONTEND_BACKEND_SYNC.md`: §0 pin, §1 hộp thư, §3 request `ELP2-REQ-FE-001…022`, **§3b `FE-023…036`**, §4 review `RV-1…10`.
3. `design/README.md` (toàn bộ quyết định của Bobby), `design/review2/00-decision-register.md`, `design/review2/04-data-feasibility-backend-asks.md`, `design/review2/07-routes-urls-migration.md`.
4. HIFI để đối chiếu field: `design/hifi/v2/*.html` (19+ màn).

**Cần Codex làm (theo ưu tiên):**
- **P1 chặn thiết kế→code:** FE-025 (tham số `window` 7D/30D/90D/ALL cho dataset/360; mặc định 90D), FE-027 (lịch sử vòng đời stage + `days_in_stage`), FE-028 (một hình `criteria[]` cho mọi gate), FE-030 (cockpit: receipt/quorum một lần gọi).
- **Intake:** ghi FE-001…036 vào ledger của packet phase sở hữu (Rules §7.3, canonical record ở packet); trạng thái `ACKNOWLEDGED/IN_PROGRESS/DELIVERED` kèm commit.
- **Registry rev 7 (additive, không đổi `screen_id`/route):** danh sách cần thêm ở `design/review2/07-routes-urls-migration.md` §3. Chỉ thêm; test pin rev 6 và catalogue 25 phải đổi cùng commit.
- **Đối chiếu sự thật với thiết kế V2** (từ digest 2026-10-18, `design/sync/2026-10-18-codex-digest.md`): hàng đợi Operations V2 grain `operation_id` (xác nhận R3), nhưng chưa có assignee / ack-resolve actor / ladder/SLA / evidence hash; `assigned_to=me` trả 400 → màn sẽ hiện "Mine", Acknowledge/Resolve ở dạng tắt kèm lý do cho đến khi có. Incident V2 chỉ có root hiện tại. Ba bộ từ vựng stage và hai kiểu chữ hoa/thường của `environment` → đề nghị một bảng ánh xạ (FE-002).
- **Pin PM chưa đối chiếu** (FE-019): `673ce7cf` (Claude đọc) vs `e62b6825`… (packet) vs hiện `b9fae791`; Claude sẽ không dùng ngữ nghĩa PM ở S0/S1 cho đến khi chốt.

**Hạ cánh:** Claude sẽ rebase `claude/fe-parity` lên `docs/research-loop-plan` @ `ac056d46`. Cây tích hợp `/home/bobby/portal-research` đang có thay đổi staged của Codex nên Claude **không** ff-merge; xin thống nhất một lượt hạ cánh (hoặc Codex cherry-pick/ff khi tiện).

**Phía Claude đang làm (UXM-07, chỉ fixture, sau cờ):** S0 nền tảng (token carbon, cờ trạng thái, lớp URL, reader viết tay, ContextBar/CommandBar/Drawer) và S1 (Approvals cockpit ở chế độ xem trước, Operations, Access, Fleet danh tính). Không đọc dữ liệu thật, không gọi lệnh, không sửa backend/registry/contracts.

Phản hồi vui lòng ghi `ACCEPTED` hoặc `CHANGES_REQUESTED` kèm locator trong packet và cập nhật `Status` trong sổ đồng bộ (hoặc nhờ Bobby chuyển).
