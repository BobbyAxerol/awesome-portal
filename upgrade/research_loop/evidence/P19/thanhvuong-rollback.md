# P19 — Thanhvuong frontend rollback (Screen 10)

Rollback này chỉ đụng frontend: không đổi contract, backend, migration, data hay feature flag.

Thứ tự: revert commit mới nhất trước. Sau mỗi bước Portal vẫn build được.

## R3. `9c4afb18` — thứ tự band và bước rail theo hi-fi (Bobby 2026-09-24)

- **Nội dung commit:** `LineageDetail.tsx` +4/−7 (`bandOrder` trả nguyên thứ tự server, `RAIL_STEP` 22 → 26), `lineageDetail.test.tsx` +3/−3 (U04, U46, `railWidth`).
- **Ảnh hưởng khi revert:** band quay về ACTIVE trước (spec T01), bước rail 22px (spec §9.2). `VD-P19-02` và `VD-P19-04` khi đó lại lệch hi-fi.
- **Dữ liệu và request:** không đổi (vẫn 1 GET `limit=128`, không mutation).
- **Thứ tự:** revert đầu tiên, trước `c9dd195e`.

## R1. `c9dd195e` — khớp hi-fi 7 điểm (Bobby 2026-09-24)

- **Nội dung commit:** `LineageDetail.tsx` +811/−613 (4 filter hi-fi + `lineageStatus`, `bandOrder` ACTIVE trước, chip wrap, rail có chấm, promotion rule và rules nguyên văn hi-fi, toggle probes disabled `CG-P19-03`, bỏ expand-all, card đóng khi tải), `lineageDetail.test.tsx` +292/−41 (U14/U15/U18 sửa, U44–U52 mới).
- **Ảnh hưởng khi revert:** màn quay về bản trước R1 (tree `6b7e0419`): 6 nhóm state thô, band theo thứ tự server, chip cuộn trong band 8.5px, thụt DFS, promotion rule viết lại, expand-all, card mở sẵn khi ≤ 40 attempt. Ledger `VD-P19-01…07` khi đó không còn đúng với code.
- **Dữ liệu và request:** không đổi (vẫn 1 GET `limit=128`, không mutation). Client, hook, route không đổi trong commit này.
- **Thứ tự:** revert sau `9c4afb18`, trước `1fb29010`.

## 0. `1fb29010` — sửa sau audit (A1–A3)

- **Nội dung commit:** `LineageDetail.tsx` +101/−2 (reset `:where(.ln-page) button`, `PendingFrame`), `lineageClient.ts` +10/−9 (404 → denied), `lineageDetail.test.tsx` +52/−5 (U01/U29–U33, U43).
- **Ảnh hưởng khi revert:** A1–A3 quay lại.
  - Chip band / filter / toggle / retry lại hiện 12px Inter thay vì mono.
  - Loading và refusal chỉ còn header · notice · rules.
  - 404 lại là `empty` ("∅ EMPTY"), khác badge 403.
- **Dữ liệu và request:** không đổi (vẫn 1 GET `limit=128`, không mutation).
- **Thứ tự:** revert sau `c9dd195e`, trước `74f26200`.

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
git revert --no-edit 9c4afb18 c9dd195e 1fb29010 74f26200 30dcbdfc 0ec4b6af 3a11bfd3
```

Hook vẫn chạy như thường. Không dùng `--no-verify`.

## Docs commit

Docs commit `7b0dda84` gồm packet này, một dòng §13 và implementation note `#rl-p19`. Docs commit sau audit chỉ sửa packet và note. Cả hai chỉ thêm evidence; revert docs commit sau audit trước `7b0dda84`, cùng với phần code nó mô tả. Chỉ revert riêng `1fb29010` thì phải revert cả docs commit sau audit, vì packet mô tả tree `6b7e0419`.

Docs commit `docs(research): P19 hi-fi alignment, visual decision ledger and packet` (sau `dacbbd75`) sửa dòng §13, note `#rl-p19` (ledger `VD-P19-01…07` + rule P20+), addendum cuối handoff và 5 file packet để mô tả tree `46d101c0`. Chỉ revert riêng `c9dd195e` thì revert cả docs commit này trước (mới nhất trước), vì ledger và receipt §13 mô tả code R1. Thứ tự revert toàn bộ docs: docs commit R3 → docs commit R2 `715321f5` → `dacbbd75` → `4f1ee187` → `7b0dda84`.

Docs commit `docs(research): P19 closes VD-P19-02/04 on the hi-fi` (sau `9c4afb18`) sửa dòng §13, ledger `VD-P19-02`/`04`, addendum handoff và 5 file packet để mô tả tree `9f3f917f`. Chỉ revert riêng `9c4afb18` thì revert docs commit R3 này trước.

## Backend

Trong mọi trường hợp, backend giữ nguyên:

- `CONTROL_API_FEATURE_RESEARCH_LINEAGE=false`.
- Attempt, exposure fact, promotion fact và index không bị động tới. Rollback của backend là flag-only theo runbook P19.
