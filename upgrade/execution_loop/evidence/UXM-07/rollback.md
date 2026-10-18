# UXM-07 S0 · rollback

- **Cờ là cách tắt chính:** bỏ `VITE_EXECUTION_V2_SCREENS` (mặc định rỗng) thì mọi màn quay về V1; không cần revert code. Cờ chưa có trong Dockerfile (FE-040) nên môi trường hiện có không bật được V2 dù code đã vào.
- **Revert theo commit:** mỗi đơn vị S0 nằm trong một commit code duy nhất cộng một commit docs; `git revert <sha>` là đủ. Điểm chạm vào file dùng chung chỉ có: `tokens.css` (một hunk append-only trong khối carbon), `tokens.test.ts` (thêm test), `vite-env.d.ts` (một biến), `ExecutionPreviewRoute.tsx` (export `PreviewFrame` + một dòng có điều kiện), `productBoundary.test.ts` (thêm entry V2).
- **Ảnh hưởng khi revert:** không dữ liệu, không migration, không HK. Token mới không được V1 tham chiếu nên xoá hunk không đổi pixel.
- **Không đổi:** `execution.css`, `shell.css`, `Fixtures.tsx`, playwright, baseline, Dockerfile, `packages/contracts/generated`.
