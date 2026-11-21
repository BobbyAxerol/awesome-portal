# FE-W1–W5 — Research Loop frontend campaign, closure evidence packet

**Trạng thái:** `W1–W5 code landed on claude/fe-parity · preview real-API gates measured 2026-10-03 · NOT_VERIFIED` ở mức sản phẩm.
Chưa có: print acceptance, browser acceptance đầy đủ của Bobby, release ký. Packet này không gọi phase nào là `VERIFIED` hay closed.

- Nhánh `claude/fe-parity`, lane copy HEAD `c5795c71` (tree `f1d1d5ec`), base `b2098a81`. `b2098a81..HEAD` = 450 file, +19352/-5529 (ảnh baseline tính 0/0).
- W1 `02e16865`, W2 `c77d4aa7`, W3 `bfbf5ca4` nằm trước base; W4 từ `e92f74ca`, W5 từ `c4d84d1a`.
- Kế hoạch/audit: `FRONTEND_AUDIT_2026-10-02.md`, `FRONTEND_FIX_PLAN_W1_W5_2026-10-02.md`, `evidence/P21/audit-2026-10-02-final/SPEC_W1.md`, `SPEC_W5.md`. Ledger: `FRONTEND_GAPS_FOR_SONNET_2026-09-30.md` (W1–W5, closeout).

## Packet (năm file, CLAUDE.md §7.10)

| File | Nội dung |
|---|---|
| [thanhvuong-frontend-receipt.md](./thanhvuong-frontend-receipt.md) | Commit, mapping W1–W5 → màn/file, quyết định, gate đo được, giới hạn |
| [thanhvuong-backend-requests.md](./thanhvuong-backend-requests.md) | G-25/G-26, B-1..B-5 (đóng), §31 mục 1–3 (mở) |
| [thanhvuong-test-results.json](./thanhvuong-test-results.json) | Số đếm gate, bundle, run thật, baseline |
| [thanhvuong-debt-register.json](./thanhvuong-debt-register.json) | Nợ mở, phụ thuộc Codex, caveat baseline, `NOT_VERIFIED` |
| [thanhvuong-rollback.md](./thanhvuong-rollback.md) | Revert từng commit, preview, token |
