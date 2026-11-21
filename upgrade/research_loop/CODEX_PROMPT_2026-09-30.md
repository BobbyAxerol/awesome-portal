# Prompt gửi Codex (2026-09-30)

```text
Codex, Bobby giao bạn làm toàn bộ gap backend còn tồn đọng của Research Loop V1.1, tuần tự.

1. Đọc trước, theo đúng thứ tự:
   - AGENTS.md (root)
   - upgrade/research_loop/CODEX_BACKEND_GAPS_2026-09-30.md  ← hàng đợi bạn làm theo (từ §2 xuống §6)
   - upgrade/research_loop/D-AN-01_PORTAL_ANALYTICS_ALL_TIME.md  ← quyết định Bobby: Portal tự tính analytics mô tả (Sharpe, Sortino, beta/corr vs benchmark, skew…) từ dữ liệu thô QuantBT, ALL TIME, không rolling; chỉ thẻ S01 dùng last-30D
   - Khi làm mục nào thì đọc bằng chứng của mục đó trong upgrade/research_loop/evidence/P21/audit-2026-09-30/codex-inventory/A1…A5 (đã kiểm trong code tại f7c76bae, có file:line).
   - Unified plan §13: board ~L3600–3720, note dưới #rl-pXX, quyết định §13.4.1. Addendum sau thắng bản gốc (không xoá cũ, A13.1). Dòng board mâu thuẫn với phụ lục → tin phụ lục, sửa dòng board (§8 của file hàng đợi).

2. Nhánh và worktree:
   - Nhánh chính duy nhất: docs/research-loop-plan (hiện f7c76bae). Checkout /home/bobby/portal-research chỉ để hạ cánh + build preview.
   - Tạo làn riêng: git -C /home/bobby/portal-research worktree add -b codex/be-gaps /home/bobby/portal-research-be docs/research-loop-plan
   - Làm ở /home/bobby/portal-research-be. Mỗi gói: rebase lên docs/research-loop-plan → commit qua hook (không --no-verify) → khi checkout chính sạch: git -C /home/bobby/portal-research merge --ff-only codex/be-gaps → báo Claude SHA. Không push origin/primus-origin khi Bobby chưa bảo.
   - Claude làm frontend song song ở /home/bobby/portal-research-fe (claude/fe-parity). Bạn không sửa apps/portal/frontend/**. Migration của bạn từ 078. Contract đổi thì regenerate bằng script repo và ghi vào §9 của file hàng đợi để Claude nối FE.

3. Làm tuần tự: B1 (chặn nghiệm thu FE) → B2 (BR-AN-01 analytics v2) → B3 (fact nguồn cho màn) → B4 (contract/khác) → B5 (P23/P24). Mục bị chặn (Bobby quyết / engine / ops) thì ghi lý do rồi làm mục kế. Mỗi mục: test + receipt ngắn trong evidence/P<phase>/ + điền §9. Không đổi UI/logic/contract đã nghiệm thu của Claude ngoài những gì file hàng đợi ghi.

4. Mục cần Bobby quyết đã gom ở §7 — hỏi Bobby một lần, đừng tự chọn.
```
