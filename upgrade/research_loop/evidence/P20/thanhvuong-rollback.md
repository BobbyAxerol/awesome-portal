# P20 — Thanhvuong frontend rollback (Screen 13)

Rollback này chỉ đụng frontend: không đổi contract, backend, migration, cache, data hay feature flag. Backend P20 vẫn `CONTROL_API_FEATURE_RESEARCH_COMPARE=false`; rollback transform/cache phía server là việc của Codex ([rollback backend](./rollback.md)).

Thứ tự: revert commit mới nhất trước. Sau mỗi bước Portal vẫn build được. Lệnh mẫu: `git revert --no-edit <sha>` trên nhánh `feat/thanhvuong/research-p17-p21`, rồi `npx tsc -b --noEmit && npm run build && npx vitest run` trong `apps/portal/frontend`.

## 0. Docs (2 commit docs P20)

- **Nội dung:** packet 5 file `evidence/P20/thanhvuong-*`; dòng §13 P20 + implementation note `#p20-thanhvuong-frontend-implementation-note--screen-13-2026-09-24` trong Unified; mục "Thanhvuong addendum" cuối `evidence/P20/frontend-handoff-claude.md`.
- **Ảnh hưởng khi revert:** chỉ mất hồ sơ; code không đổi. Nếu revert code mà giữ docs thì phải sửa dòng §13 + note cho khớp.
- **Thứ tự:** revert docs trước code (commit docs 2 rồi docs 1).

## 1. `034aef11` — nhãn ngày mini chart và copy banner markets

- **Nội dung commit:** `CompareDetail.tsx` +11/−3 (`miniPlot` chỉ giữ nhãn trục X đầu/cuối; `MARKETS_RULE_TAIL` bỏ cụm "Small multiples only:" lặp, VD-P20-20).
- **Ảnh hưởng khi revert:** ở 1280 nhãn trục X của mini chart lại chồng nhau (gói B finding 1, `575e025b89d9cd86`); banner markets lại in "small multiples only" hai lần.
- **Dữ liệu và request:** không đổi.

## 2. `009cedb8` — ladder đọc weak → strong như hi-fi

- **Nội dung commit:** `CompareDetail.tsx` +14/−10 (bày mảng attempts server đảo ngược, `data-ladder-order=server-reversed`, mũi tên "claim ↑ →", `ATTEMPTS_RULE` hi-fi verbatim, nhãn "server order, read right to left"); `compareDetail.test.tsx` +6/−3 (U02).
- **Ảnh hưởng khi revert:** ladder quay về thứ tự server (strong → weak), mũi tên trơn "→", câu rule cuối viết lại. VD-P20-14 khi đó lại lệch hi-fi.
- **Dữ liệu và request:** không đổi (vẫn 1 GET, không sort).
- **Thứ tự:** sau `034aef11`.

## 3. `f3d6169d` — unit `S13-U01…U23`

- **Nội dung commit:** thêm `compareDetail.test.tsx`, +669.
- **Ảnh hưởng khi revert:** chỉ xoá test. Revert sau `009cedb8` (commit đó sửa file này).

## 4. `0910ecc3` — màn hình, route và link

- **Nội dung commit:**
  - `CompareDetail.tsx` (+1539), `CompareRoute.tsx` (+84).
  - `QuantBTModule.tsx` +7/−1: route `alphas/:alphaId/compare` và `compare` (resolver) trước `alphas/:alphaId/:version`; regex `onReferenceRoute`.
  - `LineageDetail.tsx` +8: link "compare →" (`.ln-compare`).
  - `RunLibrary.tsx` +5/−1: CompareBar `compareEntryHref(selected, sharedAlpha)`.
- **Ảnh hưởng khi revert:**
  - Gỡ `/research/quantbt/alphas/:alphaId/compare`: URL rơi vào `alphas/:alphaId/:version` (route legacy, version = "compare").
  - `/research/quantbt/compare` quay về hành vi cũ (redirect `:tab` của module).
  - CompareBar quay về `/research/quantbt/compare?runs=a,b` (không `alpha=`); S10 mất "compare →".
  - Không đổi logic P12 hay S10 nào khác.
- **Thứ tự:** sau `f3d6169d` (test import từ `CompareDetail.tsx`).

## 5. `92cdc844` — client, hook, alias, allowlist

- **Nội dung commit:** `compareClient.ts` (+335), `useCompare.ts` (+141), `researchBoundary.test.ts` +1 (allowlist), `tsconfig.json` +3 (alias `@portal/contracts-research-compare`).
- **Ảnh hưởng khi revert:** gỡ consumer `researchCompareGetV1`; không còn request compare nào từ browser.
- **Thứ tự:** cuối cùng (`0910ecc3` import từ `compareClient.ts`).

## Cờ feature và dữ liệu

- Không có cờ frontend riêng cho S13; màn chỉ nhận dữ liệu thật khi backend bật `CONTROL_API_FEATURE_RESEARCH_COMPARE`. Khi cờ tắt, route S13 hiện refusal typed theo status server trả (400/401/403/404/503 đều có state riêng), giữ layout.
- S13 chỉ GET, không mutation, không ghi localStorage; revert không để lại state.
- Ảnh/log ở `~/tv-shots/p20/` không nằm trong repo; không cần dọn khi revert.
