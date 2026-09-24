# P19 — Thanhvuong frontend rollback (Screen 10)

Rollback này chỉ đụng frontend: không đổi contract, backend, migration, data hay feature flag.

Thứ tự: revert commit mới nhất trước. Sau mỗi bước Portal vẫn build được.

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
git revert --no-edit 74f26200 30dcbdfc 0ec4b6af 3a11bfd3
```

Hook vẫn chạy như thường. Không dùng `--no-verify`.

## Docs commit

Docs commit gồm packet này, một dòng §13 và implementation note `#rl-p19`. Nó chỉ thêm evidence, và được revert cùng với phần code nó mô tả.

## Backend

Trong mọi trường hợp, backend giữ nguyên:

- `CONTROL_API_FEATURE_RESEARCH_LINEAGE=false`.
- Attempt, exposure fact, promotion fact và index không bị động tới. Rollback của backend là flag-only theo runbook P19.
