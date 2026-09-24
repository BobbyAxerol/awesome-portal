# P19 — Thanhvuong frontend rollback (Screen 10)

Rollback này chỉ đụng frontend: không đổi contract, backend, migration, data hay feature flag.

Thứ tự: revert commit mới nhất trước. Sau mỗi bước Portal vẫn build được.

## 0. `1fb29010` — sửa sau audit (A1–A3)

- **Nội dung commit:** `LineageDetail.tsx` +101/−2 (reset `:where(.ln-page) button`, `PendingFrame`), `lineageClient.ts` +10/−9 (404 → denied), `lineageDetail.test.tsx` +52/−5 (U01/U29–U33, U43).
- **Ảnh hưởng khi revert:** A1–A3 quay lại.
  - Chip band / filter / toggle / retry lại hiện 12px Inter thay vì mono.
  - Loading và refusal chỉ còn header · notice · rules.
  - 404 lại là `empty` ("∅ EMPTY"), khác badge 403.
- **Dữ liệu và request:** không đổi (vẫn 1 GET `limit=128`, không mutation).
- **Thứ tự:** revert đầu tiên, trước `74f26200`.

## 1. `74f26200` — cột 660 và copy của root

- **Nội dung commit:** `.ln-grid` `align-items: stretch` trong media 900 px; dòng diff của root. File: `LineageDetail.tsx`, +2/−2.
- **Ảnh hưởng khi revert:** lỗi B1 quay lại.
  - Ở ≤ 900 px trang tràn ngang 2 029 px (full) và 7 665 px (120 attempt).
  - Chip không còn cuộn trong band.
  - Root in "root — no parent" hai lần.
- **Dữ liệu và request:** không đổi.

## 2. `30dcbdfc` — unit `S10-U01…U42`

- **Nội dung commit:** thêm `lineageDetail.test.tsx`, +958.
- **Ảnh hưởng khi revert:** chỉ xoá test.
- **Thứ tự:** revert sau `74f26200`.

## 3. `0ec4b6af` — màn hình, route và link

- **Nội dung commit:**
  - `LineageDetail.tsx`, `LineageRoute.tsx`.
  - Route `alphas/:alphaId/lineage` và regex `onReferenceRoute` trong `QuantBTModule.tsx`.
  - Link "lineage →" trong `RunLibrary.tsx` (`RunGroup.alphaId`) và `AlphaImport.tsx`.
- **Ảnh hưởng khi revert:**
  - Gỡ `/research/quantbt/alphas/:alphaId/lineage`. URL này sẽ rơi vào `alphas/:alphaId/:version`, là route legacy với version = "lineage".
  - Run Library và Alpha Import mất link "lineage →".
  - Không đổi logic nào khác của P12 hay S14.
- **Thứ tự:** revert sau `30dcbdfc`, vì test import từ `LineageDetail.tsx`.

## 4. `3a11bfd3` — client, hook, alias, allowlist

- **Nội dung commit:**
  - Xoá `lineageClient.ts` và `useLineage.ts`.
  - Xoá alias `@portal/contracts-research-attempt-lineage` trong `tsconfig.json`.
  - Xoá dòng `lineageClient.ts` trong `researchBoundary.test.ts`.
- **Thứ tự:** revert sau cùng, vì `LineageDetail.tsx` import từ các file này.

## Lệnh

```bash
git revert --no-edit 1fb29010 74f26200 30dcbdfc 0ec4b6af 3a11bfd3
```

Hook vẫn chạy như thường. Không dùng `--no-verify`.

## Docs commit

Docs commit `7b0dda84` gồm packet này, một dòng §13 và implementation note `#rl-p19`. Docs commit sau audit chỉ sửa packet và note. Cả hai chỉ thêm evidence; revert docs commit sau audit trước `7b0dda84`, cùng với phần code nó mô tả. Chỉ revert riêng `1fb29010` thì phải revert cả docs commit sau audit, vì packet mô tả tree `6b7e0419`.

## Backend

Trong mọi trường hợp, backend giữ nguyên:

- `CONTROL_API_FEATURE_RESEARCH_LINEAGE=false`.
- Attempt, exposure fact, promotion fact và index không bị động tới. Rollback của backend là flag-only theo runbook P19.
