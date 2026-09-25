# P22 — Thanhvuong rollback (Screen 11 publication + approval mirror)

Luật rollback P22 (Unified `#rl-p22`): **dừng intake publish mới, giữ receipt và reconciliation có thẩm quyền, không bao giờ revoke approval để rollback.** Tài liệu này ghi code **thật sự** làm gì (đọc ở `d55beca7`), không phải điều mong muốn.

P22 chưa deploy và flag chưa bật ở môi trường nào, nên hôm nay rollback = không merge / revert commit trên nhánh contributor. Các mục 1–3 áp dụng nếu sau này một môi trường đã bật flag.

## 1. Dừng intake publish mới — `FEATURE_RESEARCH_PUBLICATION=false`

Code (`release-candidate-publication.service.ts`):
- `enabled()` (`:133–135`) = `FEATURE_RESEARCH_RELEASE_CANDIDATES === "true" && FEATURE_RESEARCH_PUBLICATION === "true"`.
- `publish` (`:144`), `reconcile` (`:187`) **và cả `mirror`** (`:193`) gọi `requireEnabled()` → **503 `RESEARCH_PUBLICATION_DISABLED`** (`:457–461`). Tắt flag nên dừng cả đọc mirror qua route riêng, không chỉ POST.
- Compose (`release-candidate.service.ts`) đi qua `view()` (`publication.service.ts:212`): flag tắt → `{enabled:false, context:null, mirror:null}` và **không đọc bảng publication**. Hệ quả trên response compose:
  - `actions.publish.blocked_reason = P22_PUBLICATION_DISABLED` (`:398`); khối `publication` là absence `P22_PUBLICATION_DISABLED` (`:420`); `mirror: null`, `source_absences.approval_mirror = P22_PUBLICATION_DISABLED` (`:364`); taxonomy predecessor UNSET `P22_PUBLICATION_DISABLED` (`:459`).
  - **`state` quay về `DRAFT` kể cả với candidate đã DELIVERED**, vì `published` chỉ tính từ `view.context` (`:249–250`). Theo đó `may_edit_draft` trở lại `true` (`:352`, `immutable = published && sourceCurrent`), seal không còn bị chặn `P22_ALREADY_PUBLISHED` (`:264`), và guard 409 của `patchDraft` bị bỏ qua vì chỉ chạy khi `publication?.enabled()` (`:177`).
  - Nghĩa là: khi tắt flag, fact publication **không bị xoá** nhưng **bị ẩn** khỏi S11 và INPUT sửa được lại. Frozen pack/pin P21 vẫn bất biến (guard 055), approval vẫn nằm nguyên ở governance. Ghi debt `S11-P22-FLAG-OFF-HIDES-PUBLICATION` (đề xuất: khi tắt flag vẫn đọc bảng publication để giữ PUBLISHED/read-only, chỉ chặn intake). Bobby/Codex quyết trước khi bật flag ở đâu.
- Frontend: S11 không có flag riêng; với compose như trên, card publish hiện disabled + nhãn `P22_PUBLICATION_DISABLED`, mirror ghost. Route mirror 503 → `unavailable` (hoặc `stale` nếu đã có lần đọc trước).

## 2. Giữ receipt

- Tắt flag **không xoá** gì: `research.release_candidate_publications_v1`, `release_candidate_delivery_states_v1`, `release_candidates.lifecycle_state`, `audit_log` (`RESEARCH_RELEASE_CANDIDATE_PUBLISH_*`) giữ nguyên.
- Guard migration 056 cấm DELETE trên publications (55000 "retained for audit"), cấm đổi intent/identity/payload, cấm sửa sau DELIVERED; guard delivery states cấm DELETE và cấm sửa receipt đã DELIVERED; guard lifecycle cấm DELETE `research.release_candidates`.
- **Down migration 056 chỉ dùng trước deploy.** Nó `RAISE 55000 'P22 publication facts exist; rollback is reader/flag-only'` nếu có bất kỳ row publication, rc ở `DELIVERY_PENDING/ACKNOWLEDGED/REJECTED`, hoặc delivery state khác `NOT_DELIVERED/NOT_APPROVED`. Chỉ khi sạch mới revoke grant, bỏ guard lifecycle, khôi phục guard + CHECK 055 và **drop bảng publications**.
- Migration 056 và spec của nó **chưa từng chạy** (không có Postgres trên host), nên hành vi Down ở trên là đọc từ SQL, chưa chứng minh (debt `S11-P22-MIGRATION-056-UNPROVEN`).
- Reconciliation có thẩm quyền: chỉ intent actor, chỉ khi flag bật, replay đúng payload đã lưu qua request key `rcpub:<rc>` (governance trả approval sẵn có `replayed:true` hoặc tạo lần đầu nếu lần trước chưa commit). Tắt flag thì reconcile cũng 503; row PENDING/UNKNOWN nằm chờ tới khi bật lại.

## 3. Không bao giờ revoke approval

- Đường ghi governance **duy nhất** của P22: `this.governance.createApproval(...)` tại `release-candidate-publication.service.ts:246`, trong `deliver()`. `deliver()` được gọi từ `publish()` (`:183`) và `recover()` (`:233`); `recover()` được gọi từ `publish()` khi row PENDING/UNKNOWN (`:157`) và từ `reconcile()` (`:189`).
- Đọc governance: `governanceDenial` (hàm thuần) và `GovernanceRepository.detail` (chỉ đọc) cho mirror.
- Không có lời gọi decide/revoke/reset/expire/stop/flatten nào; `apps/control-api/src/{governance,facade,repos,execution,auth}` không đổi so với `a5455848` (P22-T09 rỗng). Rollback P22 **không** đụng approval đã tạo; approval sống theo vòng đời governance (SLA/expiry/decision) của nó.

## 4. Revert commit (nhánh `feat/thanhvuong/research-p17-p21`, mới nhất trước)

Lệnh mẫu: `git revert --no-edit <sha>`, rồi `apps/portal/frontend`: `npx tsc -b --noEmit && npm run build && npx vitest run`; `apps/control-api`: `npm run build && npm run test -- research-release-candidate`; `packages/contracts`: `npm test && python3 tooling/snapshot.py --check`.

| # | Commit | Nội dung | Ảnh hưởng khi revert |
|---|---|---|---|
| 0 | `docs(research): P22 §13 row, implementation note and contributor handoff` | Unified §13 dòng P22 + note `#p22-thanhvuong-implementation-note--screen-11-2026-09-25` + `evidence/P22/frontend-handoff-claude.md` | Chỉ mất hồ sơ. Revert docs trước code |
| 1 | `docs(research): P22 Thanhvuong packet — …` | 5 file `evidence/P22/thanhvuong-*` (gồm file này) | Chỉ mất hồ sơ |
| 2 | `d55beca7` feat(research): S11 publishes the local seal and mirrors the R1 approval | 6 file FE (+1564/−66): card publish/unknown/published/mirror, hook mirror poll, client publish/reconcile/mirror, S11-U34…U55 | S11 quay về ghost P21 **nhưng** contract `51a944eb` vẫn bắt buộc `publication` và compose `state` có `PUBLISHED`: FE P21 không đọc các field mới (tsc có thể vẫn qua vì đọc thiếu field không lỗi) — chạy lại tsc + vitest S11 sau revert. Revert trước `51a944eb` |
| 3 | `51a944eb` feat(research): P22 Release Candidate publication saga and R1 approval mirror | 19 file backend/contract (+3077/−108): migration 056, service/repository/controller, flag, contract, test | Gỡ 3 route, flag, compose P22 trở lại P21. **Nếu migration 056 đã chạy ở môi trường nào**: không revert file migration khi đã có publication fact (Down sẽ refuse); tắt flag (mục 1) và để bảng lại. Nếu chưa chạy ở đâu (hiện trạng): revert an toàn |

Nếu đã tích hợp vào baseline: migration phải đã được đổi số (debt `S11-P22-MIGRATION-NUMBER-COLLISION`); revert tay đúng vùng P22.

## 5. Dữ liệu và artefact

- Không có secret, token, cookie, CSRF hay session nào được lưu (bảng publication chỉ giữ id, digest, code, actor user id).
- Ảnh/log ở `~/tv-shots/p22/` không nằm trong repo; probe tvp22/tvp22b là file tạm đã xoá (hash trong [test results](./thanhvuong-test-results.json)).
- S11 không ghi localStorage.
