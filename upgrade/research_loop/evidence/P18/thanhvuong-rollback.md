# P18 — Thanhvuong frontend rollback (Screen 09)

Chỉ frontend. Không đổi contract, backend, migration hay feature flag. Revert
commit mới nhất trước; sau mỗi bước Portal vẫn build được.

- `29c28f4a` (bảng sr-only equity trong wrapper `.rr-sr`, ô bảng giữ nguyên chữ,
  một `h1`, verdict rule từ provenance): revert đưa lại ~2 800 px cuộn trống ở
  1280, PDF Letter 7 trang (2 trang trắng cuối), chữ bị bẻ trong ô bảng
  ("seal/ed"), 2 `h1` và verdict rule hard-code. Revert trước `aea76f69`
  (cùng file).
- `aea76f69` (long identifiers, cert box, `@page`, nhãn Archive): revert làm
  provenance line cắt mất đuôi revision trên màn hình và trên giấy, cert box rớt
  dòng ở 1280, PDF không có lề. Không nên revert riêng.
- `93a435bb` (warnings trong sheet, annotation screen-only): revert đưa approval
  annotation (row mutable) trở lại bản in, trái exit gate "print fields/digests
  match original revision".
- `6057a4c8` (unit `S09-U01…U26`): chỉ xoá test. Revert sau hai commit trên
  (chúng sửa cùng file test).
- `1757b7d5` (screen, route, link, `utcMinute.ts`): revert gỡ route
  `/research/quantbt/runs/:runId/report`; Hub "generate report → 09" và S08
  `next: Run Report` quay về span refused; `report` quay lại lookup
  `/api/runs/:id` cũ. `utcMinute.ts` nằm trong **cùng commit** với thay đổi
  `ExecuteDetail.tsx`, nên revert cả commit trả `iso()` về lại
  `ExecuteDetail.tsx` và S08 vẫn chạy. Không revert riêng phần `utcMinute.ts`
  mà giữ import trong `ExecuteDetail.tsx`.
- `70044e40` (client, hooks, `reportEquity.ts`, alias tsconfig, boundary
  allowlist): revert xoá `reportClient.ts`, `useReport.ts`, `useReportExport.ts`,
  `reportEquity.ts`, alias `@portal/contracts-research-report` và dòng
  `reportClient.ts` trong `researchBoundary.test.ts`. Phải revert sau
  `1757b7d5` (ReportDetail import từ các file này).

Docs commit (packet này + một dòng §13 + implementation note `#rl-p18`) chỉ
thêm evidence; revert cùng với code nó mô tả. Backend giữ
`FEATURE_RESEARCH_REPORTS=false` trong mọi trường hợp; report bất biến và job
export đã hoàn tất không bị động tới.
