# Hook R2 đầy đủ trên SHA đóng băng — Claude chạy một lần để người hạ cánh dùng lại (2026-10-21)

Lý do: không có cổng R2/R3 nào được xếp cho SHA đóng băng và máy đang rảnh (Codex không có hook/job nặng đang chạy lúc 14:10 UTC), nên Claude chạy **đúng một hook** theo §10.10c. Codex (người hạ cánh) **dùng lại kết quả này**, không chạy bản thứ hai trừ khi SHA hoặc tree đổi.

| Mục | Giá trị |
| --- | --- |
| SHA | `d58361eafe071bbc9922a7e87c58f0a9d00b7ea2` (mã `f394c0a1` + tài liệu) |
| Tree | `64bcd56558684200d575761c3b197fd0e0c68594` |
| Nơi chạy | worktree sạch detached `/tmp/frozen-wt`, không đụng nhánh `claude/fe-parity` (SHA không đổi) |
| Lệnh | `git commit --allow-empty` qua pre-commit → `scripts/verify-workspace.sh`, một lệnh bọc `flock /tmp/portal-heavy.lock` |
| Bắt đầu | 14:10:50 UTC |
| Log | `/tmp/claude-1000/-home-bobby/e9193882-3547-4d96-bd79-71735ca75103/scratchpad/hook-frozen2.log` (tóm tắt và sha256 ghi vào `HOOK_RESULT_2026-10-20.md` khi xong) |
| Kết thúc | 15:00:47 UTC, **exit=0**, commit rỗng detached `4c113437` được tạo (hook qua) trong worktree sạch; nhánh `claude/fe-parity` không đổi |
| Contracts | 90 file / 1.577 test PASS |
| Control API (PG dùng một lần) | 480 file PASS, 4 skip file / 9.729 test PASS, 7 skip; restore drill PASS |
| Gate khác | N29 (`changed:false`), EDS-12, route census, R3-2, tracking reconciliation, "Portal monorepo verification passed" |
| sha256 log (đã bỏ mã màu) | `afb8290dd953e48dff7b0f91834c7cb6cd252b709d6d68d8770939c26522418d` (`hook-frozen2.plain`) |
| Giới hạn | đây là hook **R2** trên SHA đóng băng ở máy này; không phải R3 trên ứng viên Core, không phải ảnh pinned toàn bộ (ảnh V2 61 ô đã so sánh riêng), chưa qua cổng ff-only của tích hợp viên |

## So sánh ảnh pinned toàn bộ trên cùng SHA (2026-10-21, 15:03–15:34 UTC)
Một lệnh `scripts/portal-web-visual.sh --workers=2` bọc khóa heavy, trong worktree sạch detached ở `d58361ea`, ảnh `mcr.microsoft.com/playwright:v1.62.1-noble`, chế độ so sánh (không `--update`). **Kết quả: 683 đạt / 0 lỗi / 16 bỏ qua, exit=0** (lần so sánh toàn bộ trước đó trên tip cũ: 580/37/16 rồi 609/7/16; các lỗi đó đã sửa). Gồm 61 ô baseline V2, các ô V1 (`execution-fixtures`, `execution-journeys`, `surface-audit`), research-loop và visual shell. sha256 log (đã bỏ mã màu): `4a1be04bb3aff8bcf48d6e422441ffee4535080a08f6a49576cbcb2e4e0d8422` (`visual-frozen.plain`). Giới hạn: FIXTURE_LAB/BFF_DOUBLE, không phải nguồn thật; 16 ca bỏ qua là ca chỉ chạy ở cấu hình khác (preview thật cần credential).
