# P21 — Thanhvuong frontend rollback (Screen 11)

Rollback này chỉ đụng frontend: không đổi contract, backend, migration, cache, data hay feature flag. Backend P21 vẫn `CONTROL_API_FEATURE_RESEARCH_RELEASE_CANDIDATES=false`. Seal, pin và draft phía server không bao giờ bị xoá; rollback backend là việc của Codex ([rollback backend](./rollback.md)).

Thứ tự: revert commit mới nhất trước. Sau mỗi bước Portal vẫn build được.

Lệnh mẫu, trên nhánh `feat/thanhvuong/research-p17-p21`:
1. `git revert --no-edit <sha>`
2. Trong `apps/portal/frontend`: `npx tsc -b --noEmit && npm run build && npx vitest run`

## 0. Docs (2 commit docs P21)

Chuỗi docs, mới nhất trước:
0. `docs(research): P21 D15 closed — S11-A1-BOTH-NULL resolved at c16ece61`: cập nhật packet (5 file), Unified §13 dòng P21 + note, handoff addendum cho commit `c16ece61`.
1. `docs(research): P21 §13 row, implementation note and handoff addendum` (`d0558af8`): Unified §13 dòng P21 (phần Thanhvuong) + note `#p21-thanhvuong-frontend-implementation-note--screen-11-2026-09-24` + mục "Thanhvuong addendum" cuối `evidence/P21/frontend-handoff-claude.md`.
2. `docs(research): P21 Thanhvuong packet — S11 Release Candidate receipt, requests, debt, rollback` (`c6c563b2`): 5 file packet `evidence/P21/thanhvuong-*`, gồm file này.

SHA của hai commit xem `git log`, vì một commit không tự ghi được SHA của chính nó.

- **Ảnh hưởng khi revert:** chỉ mất hồ sơ; code không đổi. Nếu revert code mà giữ docs thì phải sửa dòng §13 + note cho khớp.
- **Thứ tự:** revert docs trước code (0 → 1 → 2).

## 0b. `c16ece61` — khôi phục chặn hai declaration null (revert `cad8bed9`, D15)

- **Nội dung commit:** `git revert cad8bed9`: `ReleaseCandidateDetail.tsx` +6/−3 (gate "at least one declaration is required" trong `useDeclarationEditor`, đúng câu của contract) và `releaseCandidateDetail.test.tsx` +5/−8 (U17 trở lại: refused before sending).
- **Ảnh hưởng khi revert:** hai ô trống lại gửi PATCH `null`/`null`, server trả 400 và panel vào `terminal` (trái contract, D15). Không nên revert riêng commit này.
- **Thứ tự:** trước `3af31923`, vì mới nhất.

## 1. `3af31923` — rail chia đều, DEGRADED dùng tint state (audit C1, C2)

- **Nội dung commit:** `ReleaseCandidateDetail.tsx` +3/−3 (`.rc-rail > li { flex: 1 1 150px; max-width: 100% }`, `.rc-node { flex: 1 1 auto; min-width: 0; max-width: 100% }`, `tr[data-s="DEGRADED"] > td { background: var(--state-degraded-bg) }`).
- **Ảnh hưởng khi revert:** rail lại xuống 2 hàng ở 1280 (`li` 549 px); hàng DEGRADED quay về `--accent-soft` (xanh xám). Probe tvp21 G02/G05 sẽ đỏ.
- **Dữ liệu và request:** không đổi.

## 2. `e4c47d6a` — sửa theo receipt gói B (audit B1–B5)

- **Nội dung commit:** `ReleaseCandidateDetail.tsx` +7/−7 và `releaseCandidateDetail.test.tsx` +3:
  - mirror status "status not published" + `data-mirror-status`;
  - cap `.rc-node`;
  - DEGRADED `--accent-soft`;
  - digest pack 1 dòng ellipsis + `title`;
  - `overflow-wrap: anywhere` cho reason code.
- **Ảnh hưởng khi revert:**
  - mirror lại in "—" trần, vi phạm hard rule 3;
  - digest xuống 2 dòng;
  - reason code gãy giữa chữ ở 660.
- **Thứ tự:** sau `3af31923`, vì hai commit sửa cùng khối CSS.

## 3. `cad8bed9` — bỏ rule declaration rỗng ở FE (audit A1)

- **Nội dung commit:** `ReleaseCandidateDetail.tsx` +3/−6 (bỏ chặn "at least one declaration is required" trong `useDeclarationEditor`) và `releaseCandidateDetail.test.tsx` +8/−5 (U17: hai ô trống gửi null).
- **Ảnh hưởng khi revert:** FE lại chặn PATCH khi cả hai declaration trống, trước khi gửi. Hành vi này **khớp contract** (OpenAPI `DraftPatch.not`, server `superRefine`; D15). **Đã revert ở `c16ece61`** (mục 0b), nên trong chuỗi hiện tại commit này đã bị hoàn lại; revert lần nữa sẽ xung đột với `c16ece61`.
- **Thứ tự:** sau `e4c47d6a`.

## 4. `ed92ac4a` — unit `S11-U01…U33`

- **Nội dung commit:** thêm `releaseCandidateDetail.test.tsx` (+905).
- **Ảnh hưởng khi revert:** chỉ xoá test. Revert sau `cad8bed9` và `e4c47d6a`, vì hai commit đó sửa file này.

## 5. `65e74a7b` — màn hình, pack route và link vào

- **Nội dung commit:**
  - `ReleaseCandidateDetail.tsx` (+1433), `ReleaseCandidateRoute.tsx` (+38).
  - `QuantBTModule.tsx` +6/−2: route `runs/:runId/release-candidate` và `release-candidates/:releaseCandidateId` trước `runs/:runId/*`; regex `activeRunId` và `onReferenceRoute`.
  - `EvidenceFlow.tsx` +9/−21: link "release candidate → 11".
  - `ReportDetail.tsx` +3/−9 và `reportDetail.test.tsx` +6/−4: link NoPrintBar.
  - `LineageDetail.tsx` +6/−1: câu `RC_UNROUTED`.
- **Ảnh hưởng khi revert:**
  - `/research/quantbt/runs/:id/release-candidate` rơi vào `runs/:runId/*` (workspace legacy).
  - `/research/quantbt/release-candidates/:id` rơi vào redirect `:tab` của module.
  - Evidence Flow và Run Report quay về nhãn unrouted.
- **Tích hợp baseline:** `QuantBTModule.tsx` và `EvidenceFlow.tsx` cũng đổi trên baseline `0fa3c385` (B1). Nếu revert sau khi Codex đã merge, cần revert tay đúng vùng S11.
- **Thứ tự:** sau `ed92ac4a`, vì test import từ `ReleaseCandidateDetail.tsx`.

## 6. `0dea25f8` — client, hook, alias, allowlist

- **Nội dung commit:** `releaseCandidateClient.ts` (+326), `useReleaseCandidate.ts` (+294), `researchBoundary.test.ts` +1 (`NETWORK_MODULES`), `tsconfig.json` +3 (alias `@portal/contracts-research-release-candidate`).
- **Ảnh hưởng khi revert:** gỡ consumer 4 operation P21; browser không còn request release-candidate nào.
- **Thứ tự:** cuối cùng, vì `65e74a7b` import từ client và hook.

## Cờ feature và dữ liệu

- S11 không có cờ frontend riêng; màn chỉ nhận dữ liệu thật khi backend bật `CONTROL_API_FEATURE_RESEARCH_RELEASE_CANDIDATES`.
- Khi cờ tắt, route S11 hiện `unavailable` typed (503 `RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE`) với "read again", giữ layout.
- PATCH draft và POST seal chỉ chạy khi người dùng bấm. Revert frontend không xoá draft, seal hay pin đã ghi ở server, vì các record đó bất biến theo P21.
- S11 không ghi localStorage.
- Ảnh/log ở `~/tv-shots/p21/` không nằm trong repo, nên không cần dọn khi revert.
