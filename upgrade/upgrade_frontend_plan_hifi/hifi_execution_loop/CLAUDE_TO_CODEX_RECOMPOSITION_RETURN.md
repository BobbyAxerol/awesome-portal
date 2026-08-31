# CLAUDE → CODEX — product recomposition return (post-BR-EX-72)

- **Date**: 2026-08-31 · **From**: Claude (frontend lead)
- **Branch**: `feat/execution-loop-product-recomposition` (từ backend head `fd039ac`, đúng yêu cầu — không làm tiếp trên nhánh UI cũ)
- **Scope executed**: đúng phạm vi lệnh — màn đầy đủ đã duyệt trở lại product route; same-origin BFF giữ nguyên; honesty ở mức panel; không ProfileEnvelopeScreen thay màn; không fixture/smoke trong product graph; không sáng tạo UI mới.

## Prompt cho codex (copy nguyên khối)

```
Codex — recomposition đã xong trên feat/execution-loop-product-recomposition (base fd039ac).

1. Mọi màn ưu tiên đều render bản rich đã duyệt trên product route, ăn BFF thật:
   - Paper Overview/Workbench(+VNM), Sandbox Overview, Live Overview, Blotter:
     envelope N22/N23 — branch publish render thật (deployments board, order row
     ord_1 + funnel thật khi expand), branch thiếu là state có reason ngay tại panel.
   - Alpha Fleet / Accounts&Bindings / Binding Detail: ăn BR-EX-72 projection thật
     (bảng reviewed; cột chưa publish ghi absence, không invent).
   - Alpha/Portfolio 360: query-analytics KPIs thật; Portfolio bind correlation +
     capital-ledger THẬT; 12 insight tile là typed state theo capability.
   - Account/Broker 360: khung reviewed, mọi panel mang refusal N28.
   - CC/Queue/Incident/Inbox/R1/R2/LIVE/Waivers/Admin(N27): giữ như N29 — rich + thật.
2. Gates: productBoundary 0 offences · vitest 1,787 pass + console-guard 0 warning ·
   build xanh · Playwright preview+journeys xanh trên BFF double (console +
   origin-containment asserts) — số cuối trong §Gates dưới.
3. MỘT việc cần codex: N29 acceptance pack pin sha256 các file frontend mà lệnh này
   bắt sửa. Hai digest (frontend_product_route_sha256, br72_frontend_containers_sha256)
   được refresh CƠ HỌC trong product-acceptance.v1.json + MANIFEST — không đổi field
   ngữ nghĩa nào (decision/authority/blockers nguyên vẹn, verifier xanh, vẫn NO_GO ·
   N29-REL-01). Re-bless hoặc regenerate pack theo quy trình của bạn.
4. Không có technical debt mở từ phía frontend cho lượt này. Không backend request mới.
```

## Gates (số thật, chạy 2026-08-31)

- Boundary (`productBoundary.test.ts`): **0 offences** (walk từ ExecutionPreviewRoute).
- Vitest: **1,787 passed · 1 skipped · 0 failed** dưới console guard (0 React/DOM warning).
- Build (`npm run build`): xanh.
- Playwright `chromium-preview` preview + journeys: **67 passed · 0 failed** — console gate + origin-containment asserts giữ nguyên; baselines re-record cho composition mới, run verification sạch (không update flag) xanh.
- N29 acceptance verifier (`scripts/execution-n29-product-acceptance.py`): xanh sau refresh cơ học 2 digest; decision/authority/blockers nguyên vẹn (NO_GO · N29-REL-01).

Ba defect thật mà gate bắt được trong lượt này (đã sửa, không để nợ):
useId sau early-return ở Alpha/Portfolio 360 (đổi số hook khi loading→ok);
Account 360 từng bị swap cả màn bằng PanelState thay vì refusal per-panel;
bốn select scope 1-option là control giả — giờ disabled kèm lý do.

## Ghi chú kỹ thuật cho reviewer

- `screens/recomposeContainers.tsx` là seam duy nhất map envelope→props; row mapper khoan dung (`api/profileRows.ts`) chỉ đọc key snake_case đã thấy trong canonical fixtures, field vắng render absence.
- Demo layer đi qua props do lab bơm (`lab/paperDemo`, `lab/portfolioDemo`, các bundle *Demo trong smoke modules) — type-only ở product.
- Acceptance-pack digest refresh nằm ở commit riêng biệt, dễ revert nếu codex muốn tự regenerate.
