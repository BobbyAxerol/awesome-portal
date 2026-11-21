# P22 — Thanhvuong receipt (Screen 11 publication + approval mirror)

**Trạng thái:** `IMPLEMENTED-CONTRIBUTOR (outside D3) · FAKE_REPO_AND_BROWSER_STUB_RECEIPT · MIGRATION_056_NEVER_EXECUTED · đã push lên primus-origin, chưa PR · NOT_VERIFIED · REQUIRES_BOBBY_DECISION: accept or discard`. Code head **`d55beca7`** (tree `7660572d`), trên P21 head `9ecf6f9d`.

- Receipt này ghi cả backend lẫn frontend của P22, vì P22 **không có** handoff codex: Thanhvuong làm cả hai phía trên nhánh contributor.
- Không đổi rule hay phase gate; **không** gọi P22 là `VERIFIED`. `READ` ≠ `IMPLEMENTED` ≠ `VERIFIED` (A4.1).
- Rule Bobby 2026-09-24 (note P19) áp dụng như P20/P21: màn khớp hi-fi + spec; lệch được ghi `VD-P22-NN` ở ba nơi ([§6](#6-visual-decision-ledger-vd-p22-0114), [handoff](./frontend-handoff-claude.md), Unified). Hard rule hiển thị trung thực (CLAUDE.md §3.3) đứng trên hi-fi.

## 0. Phạm vi ngoài D3 (đọc trước)

| Mục | Nội dung |
|---|---|
| Quyết định Bobby D3 | `BACKEND_DEBT_P01_P21_CLAUDE_2026-09-24.md` §6 (commit `0fa3c385`): "Claude làm tạm đến P21; P22+ của Codex". CLAUDE.md hard rule 1 cấm Claude sửa backend |
| Chỉ đạo của user 2026-09-25 | Giao P22 kể cả phần backend tự xử lý được; phần nào rule dành cho Bobby thì không đụng |
| Nơi nằm | Toàn bộ trên nhánh contributor `feat/thanhvuong/research-p17-p21`, **chưa merge** vào `docs/research-loop-plan`, dev hay main. Không PR, không tag, không deploy, không bật flag ở môi trường nào |
| Hệ quả | `REQUIRES_BOBBY_DECISION: accept or discard` (B-P22-01). Discard = không merge 2 commit code (và docs), không có gì cần dọn ở môi trường vì chưa deploy |
| Không đụng (đúng PLAN §0) | `apps/control-api/src/{governance,facade,repos,execution,auth}` (P22-T09: `git diff --stat a5455848 -- …` rỗng), `apps/portal/strategy/**`, control-plane, `package.json`/lock, dev/main/tags, preview 4317–4320 của Bobby, `/home/bobby`, ledger r2 dưới `upgrade/upgrade_frontend_plan_hifi/**` (xem CG-P22-C) |
| **Xung đột baseline mới thấy lúc đóng packet** | `primus-origin/docs/research-loop-plan` = **`85c1b113`** (lúc lập plan `28da9470`). Commit `85c1b113` đổi dòng P22 của Unified trên baseline thành "**BACKEND_AND_TYPED_CONTRACT_COMPLETE · PRODUCT_BROWSER_AND_REAL_PREVIEW_PENDING — Codex**" với packet `evidence/P22/README.md` và operation `researchReleaseCandidatePublicationGetV1` / `researchReleaseCandidatePublishV1`; dòng RF-03 ghi "Codex stopped, its P22 WIP parked on `codex/p22-wip-2026-09-24`". Nhánh đó **không có** trên `primus-origin` (`git ls-remote` chỉ thấy `verify/codex-preview`) và `evidence/P22/` **không có** trên tree `85c1b113`. Vậy có **hai bản P22** (Codex WIP và bản này). Bobby chọn một (B-P22-01, B-P22-06) |
| Migration số trùng | File mới `1723680000056_research-release-candidate-publication-v1.sql` **trùng số 056** với `1723680000056_research-journey-descriptor-v2.sql` đã có trên baseline từ `ea221dc2` (2026-09-23; có ở cả `28da9470` và `85c1b113`; baseline cũng đã dùng 057, 060–062). Phải đổi số trước khi tích hợp (debt `S11-P22-MIGRATION-NUMBER-COLLISION`, B-P22-02) |

### 0.1 Backend đã giao (commit `51a944eb`)

- **Migration 056** (`research-release-candidate-publication-v1`, SHA-256 `198f7905ea674212…`): bảng `research.release_candidate_publications_v1` (PK `(workspace_id, release_candidate_id)`, `request_key = 'rcpub:' || release_candidate_id`, `payload_digest` hex64, `publication_state` ∈ PENDING/DELIVERED/UNKNOWN/REFUSED/CONFLICT, `approval_id`, `conflicting_approval_id`, `downstream_code`, `downstream_receipt_digest`, `attempt_count`, actor); CHECK DELIVERED ⇔ approval_id ⇔ receipt, CONFLICT ⇔ conflicting_approval_id, REFUSED ⇒ downstream_code; guard không DELETE, intent/identity/payload bất biến, không sửa sau DELIVERED, attempt chỉ tăng. Delivery states 055: bỏ CHECK không tên, thêm CHECK có tên (+`EXPIRED`), guard 055 thay bằng `CREATE OR REPLACE` thêm "DELIVERED bất biến". Guard mới `research_release_candidates_lifecycle_guard`: SEALED→DELIVERY_PENDING→{ACKNOWLEDGED, REJECTED}, REJECTED→DELIVERY_PENDING, revision +1. Down refuse (55000) khi đã có publication fact.
- **Grants mới cho `portal_research_runtime`** (dòng 194–200): SELECT, INSERT + UPDATE cột trên publications; UPDATE `(delivery_state, approval_state, downstream_receipt_digest, downstream_updated_at)` trên delivery states; UPDATE `(lifecycle_state, revision)` trên `research.release_candidates`. Đây là "narrow transition grant" mà comment migration 055 hẹn; cần Bobby review (B-P22-02).
- **Service / repository / controller mới:** `release-candidate-publication.{service,repository,controller}.ts` (466 / 527 / 154 dòng). Route: `POST /api/v1/research/release-candidates/:id/publish` (201 mới, 200 replay, 202 UNKNOWN), `POST …/publish/reconcile` (chỉ intent actor), `GET …/mirror` (`cache-control: private, no-store`, không etag). POST qua `assertActionSecurity`; workspace/member như P21 (non-member → 404).
- **Flag** `FEATURE_RESEARCH_PUBLICATION` (`config.ts:144`, default `false`; validation `:492–497` đòi `FEATURE_RESEARCH_RELEASE_CANDIDATES=true`). Đăng ký provider/controller ở `app.module.ts`.
- **Contract:** OpenAPI `research-release-candidate.openapi.json` (version vẫn `1.0.0`, SHA-256 `bfea70462aefcddf…`), 7 path (4 P21 + 3 P22: `researchReleaseCandidatePublishV1`, `researchReleaseCandidatePublishReconcileV1`, `researchReleaseCandidateApprovalMirrorGetV1`); d.ts regenerate bằng `npm run generate:research-release-candidate` (SHA-256 `4edd818b8a86fb93…`); `contracts-snapshot.json` qua `tooling/snapshot.py`; zod superRefine (PUBLISHED ⇔ publication DELIVERED; mirror ⇔ published cùng approval_id; publish enabled ⇒ SEALED_LOCAL + không blocker). Chữ `publish-intent` / `approval_payload` vẫn bị cấm và vắng.

**Sự thật thiết kế (từ A1, đã audit):**

| Câu hỏi | Trả lời trong code |
|---|---|
| Research `run_id` có cùng id space với `public.run_read_models`? | **Có, cho run dispatch qua P10**: `run-create.service.ts:95` `stableId("rrun", …)` → `:223` `proxy.handleWrite` → `proxy.service.ts:432/:468` seed cùng id khi 202. **Nhưng child final-audit (`AUDIT_OF_SELECTION`) không bao giờ được mirror**: chỉ `repository.ts:3741 createChildRun` tạo, không qua proxy ⇒ mọi candidate S11 thật bị 422 `RESEARCH_PUBLICATION_RUN_NOT_MIRRORED` (trường hợp local-only id của P22-T11). `CG-P22-02`, chặn P22-T01 real path |
| Luật hiển thị mirror | Giống inbox: `governanceDenial({access, gate:"r1", mode:"read", workspaceId})` (`publication.service.ts:359`), owner bypass, **không** có ngoại lệ requester (inbox lọc theo gate, `governance/contracts.ts:72/276/478`). Bị từ chối → chỉ `approval_id` + `href` + `availability {NOT_APPLICABLE, GOVERNANCE_R1_READ_DENIED}`, mọi fact null, không đọc governance. Được phép → `GovernanceRepository.detail` + kiểm gate R1, subject, `computeEvidenceManifestHash(evidence) === evidenceSetHash` (sai → PARTIAL `GOVERNANCE_EVIDENCE_INTEGRITY_FAILED`) |
| Receipt digest | `sha256(canonical{approval_id, evidence_set_hash, created_at, approval_version})` (`publication.service.ts:111`); digest thứ năm, khác `pack_digest`, `source_fingerprint`, `artifact_sha256`, `evidence_set_hash` |
| Payload digest | hex riêng trên `canonicalResearchJson({gate:"R1", alpha_id, evidence_run_id, methodology_claim_id, summary})`; không phải payloadHash nội bộ của governance |
| Input governance | Tất cả suy từ server: alpha từ frozen core, run = rc run, claim từ `run_read_models.methodology_claim_ids` (`CG-P22-01`); summary `Release candidate <rc> · pack sha256:<pack_digest> · evidence run <run_id>`. Pre-check RUN_NOT_MIRRORED / ALPHA_MISMATCH / CLAIM_NOT_MIRRORED / CLAIM_CHOICE_REQUIRED **trước** mọi lời gọi governance |
| Lời gọi governance | `GovernanceService.createApproval` in-process, **không đổi** (`publication.service.ts:246`); không HTTP, không token |
| States | publication PENDING → DELIVERED / UNKNOWN (202) / REFUSED / CONFLICT; serialization 409 giữ PENDING + `downstream_code` (409 `RESEARCH_PUBLICATION_RETRYABLE`); CONFLICT/REFUSED → delivery NOT_DELIVERED + rc REJECTED (A1 discrepancy 2); delivery `approval_state` là snapshot lúc giao (CHANGES_REQUESTED → UNKNOWN), mirror là đọc sống |
| Attach an toàn | `verifyApproval` (`:283`): gate R1, subject = alpha, requester = caller, evidence ghim run; lệch → CONFLICT `P22_APPROVAL_SUBJECT_MISMATCH`, không attach. DUPLICATE_OPEN_APPROVAL → CONFLICT + `conflicting_approval_id`, 409 `RESEARCH_PUBLICATION_OPEN_APPROVAL_EXISTS` |
| Recovery | PENDING/UNKNOWN chỉ intent actor replay payload đã lưu (request key `rcpub:<rc>`); người khác 409 `RESEARCH_PUBLICATION_RECOVERY_ACTOR_MISMATCH`; REFUSED/CONFLICT → 409 `RESEARCH_PUBLICATION_NOT_RECONCILABLE`; publish lại sau REFUSED/CONFLICT chỉ cùng payload |
| Compose | `state` DRAFT/PUBLISHED; `actions.publish {enabled, blocked_reason, release_candidate_id}` với blocker `P22_PUBLICATION_DISABLED`, `P21_LOCAL_SEAL_NOT_CREATED`, `P22_ALREADY_PUBLISHED`, `P22_PUBLICATION_PENDING_RECONCILE`, `P22_PACK_NOT_CURRENT`, `P22_RUN_NOT_MIRRORED`, `P22_ALPHA_MISMATCH`, `P22_CLAIM_NOT_MIRRORED`; khối `publication` (`reconcile_allowed` chỉ intent actor); `mirror`; `may_edit_draft=false` khi đã publish; `patchDraft` 409 khi source published còn hiện hành; predecessor so digest bằng nhau (code/params/dataset) → UNCHANGED/CHANGED, không có → UNSET `P22_NO_PUBLISHED_PREDECESSOR`; verdict "R1 + R2 must run — …" khi CHANGED |
| Grants / lưu trữ | Không lưu token, session, cookie, CSRF; refusal chỉ giữ code ổn định, không echo message governance |

## 1. Packet và những gì đã đọc

| File | Nội dung |
|---|---|
| `thanhvuong-frontend-receipt.md` | Receipt này |
| [thanhvuong-backend-requests.md](./thanhvuong-backend-requests.md) | `CG-P22-01…06`, `CG-P22-A/B/C` (@codex) + mục Bobby review cho backend đã làm |
| [thanhvuong-test-results.json](./thanhvuong-test-results.json) | Gate máy đọc được, digest log/ảnh (không commit), `not_run` |
| [thanhvuong-debt-register.json](./thanhvuong-debt-register.json) | Nợ mở, deferred, đã đóng trong phase, downstream gate `P22-FE-DG-01…05`, `bobby_decisions` |
| [thanhvuong-rollback.md](./thanhvuong-rollback.md) | Dừng intake, giữ receipt, không revoke approval, revert từng commit |
| [frontend-handoff-claude.md](./frontend-handoff-claude.md) | Handoff contributor ngoài D3 + handoff cho P23 (Codex) |

Đã đọc (`READ`; commit cuối chạm file ở nhánh `d55beca7`):

| File | Commit |
|---|---|
| `RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md` §P22 (`P22-T01…T14`, `V11-P22-DR/BR/GX`) | `a402f7b9` |
| `release-v1.1/docs/screens/11_release_candidate.md` (T01–T19, §3 transitions, §7 copy) | `4a974015` |
| `release-v1.1/QuantBT 11 Release Candidate and Publish.dc.html` (nhánh published) | `a402f7b9` |
| `evidence/P21/thanhvuong-*` + `frontend-handoff-claude.md` (mẫu format) | `9ecf6f9d` |
| `upgrade/UNIFIED_IMPLEMENTATION_PLAN.md` §13 + `#rl-p22` | nhánh `9ecf6f9d`; baseline `85c1b113` (chỉ so sánh) |
| `apps/control-api/src/governance/{governance.service,contracts}.ts`, `facade/proxy.service.ts`, `research/run-create.service.ts`, `research/repository.ts` (chỉ đọc) | không đổi so với `a5455848` |

## 2. Git

| Mục | Giá trị |
|---|---|
| Branch | `feat/thanhvuong/research-p17-p21`; remote duy nhất `primus-origin` |
| Base P22 | `9ecf6f9d` (docs P21 D15). Remote trước lần push này cũng là `9ecf6f9d`, nên push này mang lên 2 commit code + 2 commit docs |
| Commit code | `51a944eb3128e568a7d4cd513916af6a091fce97` feat(research): P22 Release Candidate publication saga and R1 approval mirror (tree `4b57bf93`; 19 file +3077/−108)<br>`d55beca753c3047443d12f3f0671f4427d268a69` feat(research): S11 publishes the local seal and mirrors the R1 approval (tree `7660572d`; 6 file +1564/−66) |
| Tổng P22 | `git diff --shortstat 9ecf6f9d d55beca7`: **25 file +4641/−174**. Cả chuỗi P21+P22 trên 3 thư mục (`git diff --shortstat a5455848 HEAD -- apps/control-api packages/contracts apps/portal/frontend`): 32 file +7608/−145 |
| Fable sửa trước commit | dòng trống thừa cuối `release-candidate-publication.service.ts` (`git diff --check`), không đổi hành vi (A1 N9) |
| Docs commit | `docs(research): P22 Thanhvuong packet — …` (5 file, chứa file này) · `docs(research): P22 §13 row, implementation note and contributor handoff` (Unified + handoff). Commit không tự ghi được SHA; xem `git log` |
| Tác giả | `Vuong <thanhvuong11052003@gmail.com>`, trailer `Co-Authored-By: Claude Fable 5.1` |
| Baseline | `docs/research-loop-plan`: `28da9470` lúc lập plan, **`85c1b113`** lúc đóng packet (2 commit mới: `4626448d` fix P04 retained receipt, `85c1b113` docs RF-03/RF-05 + dòng P22 Codex). merge-base nhánh/baseline `a5455848`. **Chưa merge/rebase** |

`numstat` theo commit (`git show --numstat`):

| + | − | File | Commit |
|---:|---:|---|---|
| 264 | 0 | `apps/control-api/migrations/1723680000056_research-release-candidate-publication-v1.sql` | `51a944eb` |
| 6 | 0 | `apps/control-api/src/app.module.ts` | `51a944eb` |
| 13 | 0 | `apps/control-api/src/config.ts` | `51a944eb` |
| 154 | 0 | `apps/control-api/src/research/release-candidate-publication.controller.ts` | `51a944eb` |
| 527 | 0 | `apps/control-api/src/research/release-candidate-publication.repository.ts` | `51a944eb` |
| 466 | 0 | `apps/control-api/src/research/release-candidate-publication.service.ts` | `51a944eb` |
| 185 | 8 | `apps/control-api/src/research/release-candidate.contract.ts` | `51a944eb` |
| 30 | 8 | `apps/control-api/src/research/release-candidate.error.ts` | `51a944eb` |
| 1 | 1 | `apps/control-api/src/research/release-candidate.repository.ts` | `51a944eb` |
| 186 | 24 | `apps/control-api/src/research/release-candidate.service.ts` | `51a944eb` |
| 160 | 0 | `apps/control-api/test/research-release-candidate-publication-migration.spec.ts` | `51a944eb` |
| 116 | 0 | `apps/control-api/test/research-release-candidate-publication.controller.spec.ts` | `51a944eb` |
| 372 | 0 | `apps/control-api/test/research-release-candidate-publication.service.spec.ts` | `51a944eb` |
| 124 | 41 | `apps/control-api/test/research-release-candidate.contract.spec.ts` | `51a944eb` |
| 87 | 2 | `apps/control-api/test/research-release-candidate.service.spec.ts` | `51a944eb` |
| 2 | 2 | `packages/contracts/contracts-snapshot.json` | `51a944eb` |
| 298 | 15 | `packages/contracts/generated/research-release-candidate.d.ts` | `51a944eb` |
| 55 | 4 | `packages/contracts/openapi/research-release-candidate.openapi.json` | `51a944eb` |
| 31 | 3 | `packages/contracts/test/research-release-candidate.spec.ts` | `51a944eb` |
| 496 | 28 | `apps/portal/frontend/src/research/ReleaseCandidateDetail.tsx` | `d55beca7` |
| 5 | 2 | `apps/portal/frontend/src/research/ReleaseCandidateRoute.tsx` | `d55beca7` |
| 135 | 5 | `apps/portal/frontend/src/research/releaseCandidateClient.ts` | `d55beca7` |
| 649 | 29 | `apps/portal/frontend/src/research/releaseCandidateDetail.test.tsx` | `d55beca7` |
| 100 | 2 | `apps/portal/frontend/src/research/useReleaseCandidate.ts` | `d55beca7` |
| 179 | 0 | `apps/portal/frontend/src/research/useReleaseCandidateMirror.ts` | `d55beca7` |

## 3. Frontend đã giao (commit `d55beca7`)

- **Client** (`releaseCandidateClient.ts`): `publish`, `reconcile`, `mirror` typed trên d.ts generated qua `releaseCandidateApi` (fetch boundary giữ); `RC_PUBLICATION_CODE` `satisfies` code refusal của contract; `toRcPublishRefusal()` chọn câu 409 theo code (conflict / open approval / retryable / refused downstream / actor mismatch / not reconcilable), 422 terminal, 403 = 404 (F-04); không bao giờ dùng `error.message`. Bỏ 2 code P21 "not commissioned".
- **Hook** (`useReleaseCandidate.ts`): 2 write op mới, slot `published` / `unknown`; sau 201/200/202 đọc lại compose, chỉ `state` của server lật chip; 409 đọc lại; 401/403/404 khoá write; guard trước khi gửi (`actions.publish.enabled`, rc id, `pack_digest`, claim khi >1 candidate); reconcile theo `publication.reconcile_allowed`.
- **Mirror poll** (`useReleaseCandidateMirror.ts`, mới): 60 s (`MIRROR_POLL_MS`) chỉ khi PUBLISHED + tab visible + write không khoá + chưa denied; setTimeout chain + AbortController; ẩn tab/unmount → clear + abort; `nextMirrorView`: 401/403/404 → `denied` (sticky, bỏ mirror, không cache), 5xx/mạng có đọc trước → `stale` + `as_of_utc_ms` ISO, chưa có → `unavailable`.
- **Màn** (`ReleaseCandidateDetail.tsx`): `PublishCard` (copy hi-fi, nút `Publish release candidate {rc_id}`, một click, `aria-disabled` + `aria-describedby` nhãn · code; pending `publishing…`), `UnknownOutcomeCard` (+ reconcile), `PublishedCard`, `MirrorCard`; `MirrorGhost` giữ cho draft và pack route. Chip PUBLISHED dùng `--good` / `--good-bg`; INPUT mất nút edit khi `may_edit_draft=false`; radio claim khi >1; SoD note chuyển từ seal card sang publish card (hi-fi :157). Panel: header, meta, banner, identity, pack, record, seal, sealed, publish | publish-unknown | published, mirror | mirror-ghost, rules.
- **Route:** không đổi route (P21); link ra mới `/governance/approvals/{id}/r1` (route R1 có sẵn ở execution module, `httpApi.ts:708`) lấy từ `mirror.href` server.
- Grep hex trong 6 file FE P22 = 0; `scrollIntoView` gọi trong code = 0; không format/sort/đếm/diff ở FE.

## 4. Screen / state coverage

Lane: `api-vs-ui` = vitest FE trên body theo d.ts; `persistence-vs-api` = spec control-api với **repository giả** (không có Postgres); `visual-fixture` / `browser-real` = Playwright trên preview riêng 4417 với **API stub same-origin** (phần browser là thật, dữ liệu là stub). `delta-real-data`, `direct-vs-portal`, `dev-host-review` = **NOT RUN** ở mọi hàng: không có run thật nào được seed tới `run_read_models` (và child final-audit không được mirror, `CG-P22-02`), `FEATURE_PROXY_PORTAL` tắt, không có dev host.

### 4.1 Guide `P22-T01…T14`

| ID | Test | Lane | Kết quả |
|---|---|---|---|
| T01 | publication.service spec happy path (1 lời gọi governance, receipt tất định khác các digest khác); S11-U36; tvp22 Q01 | persistence-vs-api (fake repo) · api-vs-ui · visual-fixture | PASS trên fake/stub. **Real path NOT RUN**: child final-audit không ở `run_read_models` → RUN_NOT_MIRRORED (`CG-P22-02`, debt `S11-P22-REAL-E2E`) |
| T02 | controller spec + contract spec (body strict, field thừa 400); contracts test "P22-T02 request shape" | persistence-vs-api · contract | PASS |
| T03 | service spec: run not mirrored, alpha mismatch, no claim, claim choice, pack CAS, source cũ — tất cả trước governance | persistence-vs-api (fake repo) | PASS |
| T04 | service spec replay (DELIVERED trả lại, không approval thứ hai); advisory lock `pg_advisory_xact_lock` chỉ chứng minh được trên DB | persistence-vs-api (fake repo) | PASS phần logic; **concurrency thật NOT RUN** (migration spec cần Postgres) |
| T05 | service spec UNKNOWN 202 → reconcile, publish lại recover; S11-U37; tvp22 Q02 | persistence-vs-api · api-vs-ui · visual-fixture | PASS trên fake/stub |
| T06 | service spec DUPLICATE_OPEN_APPROVAL + approval subject lạ → CONFLICT, không attach; S11-U39; tvp22 Q03 | persistence-vs-api · api-vs-ui · visual-fixture | PASS |
| T07 | service spec actor mismatch + patchDraft 409 khi đã publish; S11-U36 (không nút edit), S11-U54 (reconcile chỉ khi server cho) | persistence-vs-api · api-vs-ui | PASS; phiên hết hạn thật qua gateway NOT RUN |
| T08 | service spec raw status / expiry projection / `rc_superseded`; S11-U51 | persistence-vs-api · api-vs-ui | PASS |
| T09 | `git diff --stat a5455848 HEAD -- control-api/src/{governance,facade,repos,execution,auth}` | tĩnh | **Rỗng** (0 byte, `t09-diff.txt` `e3b0c44298fc1c14`) |
| T10 | Spec S11 còn lại, [§4.2](#42-spec-11-t01t19-phần-p22) | — | Một phần (§4.2) |
| T11 | service spec RUN_NOT_MIRRORED trước false success; compose blocker `P22_RUN_NOT_MIRRORED` (S11-U35) | persistence-vs-api · api-vs-ui | Nhánh "local-only id bị phát hiện": PASS. Nhánh "seed/refresh/publish thành công qua facade": **NOT RUN** (`CG-P22-02`, `CG-P22-05`) |
| T12 | service spec so predecessor chỉ bằng digest; approval cùng alpha khác evidence → CONFLICT | persistence-vs-api | PASS |
| T13 | Không có đường code nào gửi revoke/reset/stop/flatten: governance chỉ có 1 lời gọi `createApproval` (§0.1); execution src không đổi (T09) | tĩnh (review) | PASS bằng đọc code; không có test chạy riêng |
| T14 | service spec actor mismatch, payload giống hệt; không service account | persistence-vs-api | PASS trên fake |
| `V11-P22-DR` | — | delta-real-data | **NOT RUN** |
| `V11-P22-BR` | tvp22 18/18 + tvp22b 16/16 trên preview 4417 (stub) | visual-fixture · browser-real (stub) | Một phần; không phải dev host |
| `V11-P22-GX` | hook tay, `git diff --check`, T09 rỗng, hex 0 | tĩnh | Một phần: `open_implementation_debt` **không rỗng**; không có rebuild/deploy receipt |

### 4.2 Spec 11 T01–T19 (phần P22)

| Spec | Nội dung | Test | Lane | Kết quả |
|---|---|---|---|---|
| T02 | publish click → PUBLISHING → PUBLISHED, rail xanh, mirror PENDING SLA, chip PUBLISHED | S11-U34, U36; tvp22 Q01 (chip = `--good` `rgb(30, 123, 79)`, nền `--good-bg`; ghost dashed / mirror solid); tvp22b "published" | api-vs-ui · visual-fixture | PASS; SLA in ISO, không countdown (VD-P22-01) |
| T07 | INPUT read-only sau publish | S11-U36; service spec patchDraft 409 | api-vs-ui · persistence-vs-api | PASS |
| T08 | 409 race → banner + refetch | S11-U38 (pack moved), U40 (retryable ≠ "evidence changed"); P21 U18 (PATCH 409) còn xanh | api-vs-ui | PASS; browser 409 pack-moved không có gate riêng (tvp22b "conflict" là 409 open approval) |
| T10 | taxonomy CHANGED + verdict "R1 + R2 must run…" | server: service spec predecessor digest (`release-candidate.service.ts:286`, `:457`); FE in server (P21 U07) | persistence-vs-api · api-vs-ui | PASS unit; **browser CHANGED NOT RUN** |
| T11 | mirror poll SUPERSEDED | S11-U45 (poll 60 s), U51 (`rc_superseded` dòng riêng) | api-vs-ui | PASS unit; browser superseded NOT RUN |
| T15 | publish 401 | S11-U42; tvp22 Q04 (khoá write, click ép không gửi, PUBLISH=1 MIRROR=0) | api-vs-ui · visual-fixture | PASS |
| T16 | publish 403 / typed refusal | S11-U43 (403 = 404 cùng câu), U53 (không prose server); tvp22b conflict/terminal có `SECRET-SERVER-PROSE` → không hiện | api-vs-ui · visual-fixture | PASS |
| T17 | 502/503/timeout | S11-U44; tvp22 Q05 (GET=1, retry bật); tvp22b "publish unavailable" | api-vs-ui · visual-fixture | PASS |
| T18 | mirror 5xx sau snapshot có `as_of` → stale; thiếu → unavailable; poll dừng khi hidden/denied | S11-U45, U48, U49; tvp22 Q06 (stale), Q07 (403 denied, dừng sau +180 s), Q08 (hidden 0 lần đọc) | api-vs-ui · visual-fixture | PASS; `unavailable` **chỉ unit** (U48) vì compose PUBLISHED luôn mang mirror (debt `S11-P22-MIRROR-UNAVAILABLE-ROUTE`) |
| T19 | 422 | S11-U41; tvp22b "terminal 422" | api-vs-ui · visual-fixture | PASS |
| Guide FE | denied mirror "not readable", claim radio, không prose, token | S11-U50, U52, U53, U55; tvp22 Q09 | api-vs-ui · visual-fixture | PASS |
| T14 | axe | — | — | **NOT RUN** (axe-core không có trong lock, `S11-AXE`) |

Mọi RECEIPT tvp22 (2 lượt × 22 dòng, `shots/probe.log` `4b0a952684096986`) và 20 receipt tvp22b: overflow 0, console 0, bare 0, inline hex 0, server prose false, foreign 0, mutation lạ 0. CSRF: preview không có cookie nên probe không assert `x-portal-csrf`; vitest assert (như P21).

## 5. Hi-fi check

Hi-fi `QuantBT 11 Release Candidate and Publish.dc.html` (`a402f7b9`), nhánh published. Ảnh hi-fi published chụp ở P21 (file hi-fi không đổi): `p21-hifi-published-1280.png` `c47a59d779970d09`, `-660` `6751f37459f70cd2`. Product (`~/tv-shots/p22/final/shots/`, không commit): `p22-published-1280.png` `6db421a1a036c816`, `-660` `eeceebd44f54a814`; `p22-draft-1280.png` `ef407162e64856f6`; `p22-unknown-1280.png` `75ed67fc2839d328`; `p22-mirror-stale-1280.png` `a8c8731e4bd708a1`; `p22-mirror-not-readable-1280.png` `6ba80c2593773ed0`; `p22-claims-1280.png` `70a2df26d1771803`. So ở mức bố cục + copy, không pixel-diff.

Copy hi-fi có verbatim (audit A2): câu publish ("Publishing freezes this exact combination…"), SoD, "published — immutable", câu supersede, "what the approval inbox sees", "R1 · RESEARCH EVIDENCE", prose decision outcomes, note reviewer.

## 6. Visual decision ledger `VD-P22-01…14`

Nguồn: 01–08 từ PLAN §3, 09–14 từ báo cáo A2 (đánh số A2 thay chỗ trùng). Dòng FE ở `d55beca7`. State: `REQUIRES_BOBBY_DECISION` (8), `FIELD_DRIVEN` (4), `RULE_OVER_HIFI` (2).

| VD | Hi-fi | Product | Evidence | State |
|---|---|---|---|---|
| `VD-P22-01` | "SLA 5d · 4d 21h left" (hi-fi :292) | `sla_due_at` + `expires_at` ISO của server + "time left — not published"; không tính countdown | `ReleaseCandidateDetail.tsx:219` (`MIRROR_LEFT_ABSENT`) | `REQUIRES_BOBBY_DECISION` (rule 3 > hi-fi) |
| `VD-P22-02` | "assignee pool: Quant Reviewers" (hi-fi :183) | "assignee pool: not published" | `:208`; `CG-P22-03` | `FIELD_DRIVEN` |
| `VD-P22-03` | "published_at … · by researcher@bobby" | `published_at` = `iso(publication.updated_at_utc_ms)`, `by` = `publication.intent_actor.username` | `:1414–1450` (A2) | `FIELD_DRIVEN` |
| `VD-P22-04` | Nút publish một click; Guide: "publish confirm" | Một click như hi-fi, disabled/pending, không modal | `:164`, `:1273` (A2) | `REQUIRES_BOBBY_DECISION` |
| `VD-P22-05` | (không có cell) | Card unknown-outcome + nút reconcile + banner conflict dưới card publish, copy FE | `:181`, `:1363` (A2) | `REQUIRES_BOBBY_DECISION` |
| `VD-P22-06` | (không có cell) | Radio "methodology claim to attach" khi server mirror > 1 claim | `:169–170` | `REQUIRES_BOBBY_DECISION` |
| `VD-P22-07` | Status "SUPERSEDED" trong mirror | `rc_superseded` là fact Research, dòng riêng; raw status không đổi (P22-T08) | `:215` | `RULE_OVER_HIFI` |
| `VD-P22-08` | Outcomes "APPROVED · APPROVED_WITH_CONDITIONS · CHANGES_REQUESTED · REJECTED · SUPERSEDED · EXPIRED" | Prose hi-fi giữ verbatim (`:198`); dòng facts in `decision_outcomes` server (enum governance `APPROVED/APPROVED_WITH_CONDITION/DENIED/CHANGES_REQUESTED`) | hi-fi :183 vs `:198` | `REQUIRES_BOBBY_DECISION` |
| `VD-P22-09` | Pack route không có publish/mirror | Ghost publish/mirror ở pack route viết lại: publication nằm trên composition theo run | `:188`, `:1845–1846` (A2) | `FIELD_DRIVEN` |
| `VD-P22-10` | YAML có dòng `created_at` (hi-fi :271) | Chỉ in 17 field server (không có `created_at`) | hi-fi :271; `CG-P22-06` | `FIELD_DRIVEN` |
| `VD-P22-11` | Chỉ một status | "effective {effective_status}" in cạnh raw status, không thay | `:1538` | `RULE_OVER_HIFI` |
| `VD-P22-12` | (không có) | Copy FE cho actor mismatch / not reconcilable / refused downstream | `releaseCandidateClient.ts:332–336` (A2) | `REQUIRES_BOBBY_DECISION` |
| `VD-P22-13` | SoD note trong card publish (hi-fi :157) | SoD note chỉ ở card publish (P21 để ở seal card); khớp hi-fi, đổi so với P21 | `:147`, `:1358` (A2) | `REQUIRES_BOBBY_DECISION` (xác nhận đóng) |
| `VD-P22-14` | Published card chỉ in evidence digest | Thêm dòng mono receipt digest + approval id | `:1446` (A2) | `REQUIRES_BOBBY_DECISION` |

VD P21 mà P22 đã thay trong code (Bobby đóng): `VD-P21-01` (chip PUBLISHED nay thật), `VD-P21-02` (card publish thật), `VD-P21-04` (taxonomy so predecessor thật), `VD-P21-16` (INPUT read-only sau publish), `VD-P21-20` (mirror status thật khi PUBLISHED; ghost giữ cho draft).

## 7. Reuse report (v0.5 §11.3)

| Tái dùng | Từ đâu |
|---|---|
| `Absent`, `Header`, `Notice`, `WriteNotice` (mở rộng: notice published), `iso()`, `reasonOf`, `isLocalPath` | primitive Research / P21 S11 |
| Mẫu nút seal: `aria-disabled` + `aria-describedby` + span code | `SealCard` P21 |
| Class `rc-seal` / `rc-sealed` / `rc-ghost` / `rc-notice` | CSS scoped `.rc-page` P21 |
| Pipeline refusal `PortalApiError` (`toRcWriteRefusal`) | `releaseCandidateClient.ts` P21 |
| Slot machine write của `useReleaseCandidate` (thêm 2 op) | P21 |
| Harness + fixture pack/field của probe tvp21 (chép sang tvp22, không commit) | P21 |
| Router `Link`; token Fund Paper `--good`, `--good-bg`, `--accent-2`, `--line`, `--shadow-e1` | `tokens.test.ts` xanh |
| Backend: `GovernanceService.createApproval`, `governanceDenial`, `GovernanceRepository.detail`, `computeEvidenceManifestHash`, `OwnerAccessService`, `canonicalResearchJson`, `transaction()` + mapping pg error của repository P21 | không đổi, gọi in-process |

Mới: `useReleaseCandidateMirror` (không hook poll nào có đủ visibility + abort + sticky deny), `PublishCard`, `UnknownOutcomeCard`, `PublishedCard`, `MirrorCard`, CSS `.rc-claims`, `.rc-pubfacts`, `.rc-unknown`, `.rc-mirror`, `.rc-mstatus`, `.rc-meff`; backend 3 file publication + migration 056. Không thêm dependency, không màu raw, không asset ngoài.

## 8. Test report (gói B, head `d55beca7`)

Log ở `~/tv-shots/p22/final/` (không commit), digest = `sha256sum | cut -c1-16`; `hashes.txt` 265 dòng.

| Gate | Kết quả | Log |
|---|---|---|
| P22-T09 diff | rỗng | `t09-diff.txt` `e3b0c44298fc1c14` |
| control-api `npm run typecheck` | exit 2: 80 lỗi **có từ trước**, tất cả dưới `test/` (25 file); 0 ở file release-candidate/publication | `ca-typecheck.log` `f17d00f9884c170b` |
| control-api `npm run build` | **0** | `ca-build.log` `0f603bbeb59ae94d` |
| control-api `npm run test` (full) | exit 1: 117 file (41 fail / 76 pass); test 10 fail / 434 pass / 388 skip. Mọi fail là môi trường: 24 × `ECONNREFUSED 127.0.0.1:5432`, teardown cascade, 3 × ENOENT `eds08` (có từ trước `5d904fb8`) | `ca-test.log` `09e53a9cb711d15f` |
| control-api `-- research-release-candidate governance` | 11 file: 6 pass / 5 fail (DB). Spec P22 pass: publication.service 16, publication.controller 5, rc.service 9, rc.contract 5, rc.controller 3, governance-token 3 | `ca-test-rc-gov.log` `fc2189a1c2bcde34` |
| **Migration 056 spec** | **NEVER RUN**: `research-release-candidate-publication-migration.spec.ts` `ECONNREFUSED 5432` ở `beforeAll` | cùng log |
| contracts `npm test` | **0**: 14 file / 177 test | `contracts-test.log` `5e32a2fe513d6933` |
| `tooling/snapshot.py --check` | **0**: khớp 198 file | `contracts-snapshot-check.log` `65f68bff80347506` |
| FE `npx tsc -b --noEmit` | **0** | `fe-tsc.log` `e3b0c44298fc1c14` |
| FE `npm run build` | **0** (cảnh báo chunk có từ trước) | `fe-build.log` `1c7e1afda1d7cd98` |
| FE `npx vitest run` | exit 1: 173 file (1 fail); 3154 pass / 1 fail / 1 skip. Fail = `src/execution/r2Ledger.test.ts` (ledger thiếu 3 route P22, `CG-P22-C`) | `fe-vitest-all.log` `3194e519eb106d76` |
| FE S11 vitest | **61/61** | `fe-vitest-s11.log` `d77e92ba5864899a` |
| tvp22 riêng `--workers=1` | **18/18**, 31.4 s | `pw-tvp22.log` `48845f77c8d9a4d4` |
| Research suite lượt 2 (fixtures + product + tvp20 + tvp22) | **180/180**, 3.7 phút (8 / 76 / 80 / 18) | `pw-research-all-run2.log` `beec1414544bcbaa` |
| Research suite lượt 1 (có tvp21) | ngắt tay sau 11.5 phút: 161 pass / 5 fail / 1 interrupted / 95 không chạy | `pw-research-all-run1-interrupted.log` `e072adf4633f891f` |
| tvp20 `304 keeps revision @1280` | fail lượt 1, pass lượt 2 → **flaky** | hai log trên |
| tvp21 (probe P21) trên tree P22 | 18 pass / 64 fail: stub compose thiếu `publication` (bắt buộc ở P22) → `ReleaseCandidateDetail.tsx:1671` throw, màn trắng; panel `publish-ghost` đổi tên `publish`. **tvp21 RETIRED** (quyết định Fable), receipt còn giá trị đã phủ lại bởi tvp22/tvp22b | `pw-tvp21-on-p22.log` `61ccaf0f0035548e` |
| Kiểm tay tvp22b (10 kịch bản × 2 width, 20 receipt) | **16/16** test, quét `N/A`/`undefined`/`null`/prose bí mật/ô "—" = 0 | `pw-manual.log` `71437b54710cbed4` |
| `scrollIntoView` / hex | gọi trong code 0 / hex 0 trong 6 file FE P22 | `static-greps.log` `6601abfd8a5525da` |
| Dọn | spec/config tạm đã chép `.copy` rồi xoá; `git status --short` rỗng; 4417 free; 4317–4320 không đụng | `temp-files.sha256` `e654dd289c789b7e` |

Probe tạm (không commit): `tvp22.spec.ts` `c4640d355eed8b53`, `tvp22.config.ts` `c6d48ca31456cd4b`, `tvp22b.spec.ts` `69e3e757c6a84e51`, `tvp22b.config.ts` `b4896067626d0ac0`, `tvp22all.config.ts` `4960a20154448306`.

## 9. Backend request

Chi tiết ở [backend requests](./thanhvuong-backend-requests.md). Tất cả OPEN, @codex:

| ID | Nội dung |
|---|---|
| `CG-P22-01` | claim id phía Research trong `ReleaseCandidateSource` (đang lấy từ `run_read_models.methodology_claim_ids`) |
| `CG-P22-02` | đường mirror/dispatch cho child `AUDIT_OF_SELECTION` tới `run_read_models` — **chặn publish thật** |
| `CG-P22-03` | field assignee/approver pool cho mirror |
| `CG-P22-04` | fixture governance approval-create cho test P22 |
| `CG-P22-05` | RunSync / `FEATURE_PROXY_PORTAL` cho lane REAL_API và refresh claim trước pre-check |
| `CG-P22-06` | `created_at` trong YAML hi-fi không thuộc 17 field |
| `CG-P22-A` | `href` cho `conflicting_approval_id` |
| `CG-P22-B` | `details.downstream_code` trong body lỗi (http-error.filter chỉ mang `details` cho GovernanceError) |
| `CG-P22-C` | thêm 3 route P22 vào `upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/r2_ledger/capability-inventory.v1.json` (Fable thử, classifier từ chối sửa ledger chung; `r2Ledger.test.ts` fail 1/3156 tới khi có) |

## 10. Debt

[debt register](./thanhvuong-debt-register.json):
- **Open:** `S11-P22-DECISION-MAP` (A1 N1), `S11-P22-APPROVAL-STATE-SNAPSHOT` (N3), `S11-P22-PRECHECK-BEFORE-RUNSYNC` (N5), `S11-P22-HARNESS-TABLES` (N7), `S11-P22-MIRROR-UNAVAILABLE-ROUTE` (A2 N2), `S11-COMPOSE-SHAPE-GUARD` (mới: body thiếu field bắt buộc → màn trắng thay vì terminal typed), `S11-P22-R2LEDGER` (`CG-P22-C`); thêm ở gói C: `S11-P22-MIGRATION-NUMBER-COLLISION`, `S11-P22-FLAG-OFF-HIDES-PUBLICATION` (xem [rollback](./thanhvuong-rollback.md)). Mang từ P21: `S11-RAIL-DIGEST-WRAP`, `S11-LOCAL-DUPLICATION`.
- **Deferred:** `S11-P22-MIGRATION-056-UNPROVEN`, `S11-P22-REAL-E2E`, `S11-AXE`, `S11-REAL-API`, `S11-P22-TVP21-RETIRED`.
- **Downstream gate:** `P22-FE-DG-01…05`.

## 11. Việc Bobby quyết

| ID | Việc |
|---|---|
| `B-P22-01` | Chấp nhận hay bỏ công việc P22 ngoài D3 (backend + contract + FE trên nhánh contributor). Nay có thêm bản Codex WIP (`codex/p22-wip-2026-09-24`, không có trên remote) mà dòng Unified baseline `85c1b113` đã ghi BACKEND_COMPLETE: chọn một bản |
| `B-P22-02` | Review migration 056 (grant mới, guard thay thế, Down refuse) + **đổi số** (056 trùng journey-descriptor-v2 trên baseline) + chạy migration spec trên Postgres dùng một lần trước mọi deploy |
| `B-P22-03` | Thêm 3 route P22 vào ledger r2 (`CG-P22-C`); sửa contract/ledger do Thanhvuong làm cần owner xác nhận |
| `B-P22-04` | `CG-P22-02` đường mirror cho child final-audit — chặn publish thật |
| `B-P22-05` | VD copy/layout `VD-P22-01/04/05/06/08/12/13/14` |
| `B-P22-06` | Tích hợp baseline: nhánh chưa merge; baseline lúc đóng packet `85c1b113` (lúc plan `28da9470`); trùng số migration; trùng tên operation `researchReleaseCandidatePublishV1` với bản Codex; theo D1 Codex merge |
| `B-P22-07` | Thứ tự bật `FEATURE_RESEARCH_PUBLICATION`: chỉ sau DG-01…04; lane REAL_API (`FEATURE_PROXY_PORTAL`, `CG-P22-05`) |

## 12. Audit Fable P22

- **A1 (backend, `51a944eb`)** PASS: A1-1 governance path không đổi; A1-2 idempotency/CAS; A1-3 unknown outcome; A1-4 attach an toàn; A1-5 luật mirror = inbox; A1-6 raw vs projected status; A1-7 không token; A1-8 contract 7 path. NOTES → N1 `S11-P22-DECISION-MAP`, N2 CONFLICT/REFUSED → NOT_DELIVERED (chấp nhận), N3 snapshot approval_state, N4 `CG-P22-B`, N5 pre-check trước RunSync, N6 migration chưa chạy, N7 harness, N8 `CG-P22-02` (blocker real e2e), N9 dòng trống EOF (Fable sửa).
- **A2 (frontend, `d55beca7`)** PASS: A2-1 client/hook, A2-2 poll, A2-3 T07, A2-4 probe 18/18, A2-5 reuse. NOTES → N1 `CG-P22-C`, N2 `S11-P22-MIRROR-UNAVAILABLE-ROUTE`, N3 CSRF preview, N4 VD-P22-13, N5 `CG-P22-06`, N6 A2 dùng `git worktree add --detach /tmp/p22base` (đã xoá; ngoài danh sách ràng buộc, vô hại, ghi nhận).
- **Sau gói B:** tvp21 RETIRED (fixture trước contract P22); lớp lỗi "body thiếu field bắt buộc → màn trắng" ghi `S11-COMPOSE-SHAPE-GUARD`. Không sửa `src`.

## 13. Kết luận có phạm vi

- **`IMPLEMENTED-CONTRIBUTOR (outside D3)`**: saga publication phía Research trên governance R1 không đổi, mirror theo luật inbox, S11 publish/published/unknown/mirror, chứng minh trên fake repository + browser stub.
- **Chưa `VERIFIED`, và không thể verified trên nhánh này** khi chưa có: migration 056 chạy thật (DG-02), đường mirror child final-audit (`CG-P22-02`, DG-03), lane REAL_API (`FEATURE_PROXY_PORTAL`), ledger r2 (DG-04), axe, dev host, và quyết định Bobby về D3 + bản Codex (DG-01).
