# P22 frontend handoff — Screen 11 publication + R1 approval mirror (contributor, outside D3)

> Historical contributor packet. The current generated-contract handoff is [frontend-handoff-codex-closeout.md](./frontend-handoff-codex-closeout.md); route/field status below is preserved as audit history, not live truth.

**Trạng thái:** `IMPLEMENTED-CONTRIBUTOR (outside D3) · FAKE_REPO_AND_BROWSER_STUB_RECEIPT · FLAG_DARK · REQUIRES_BOBBY_DECISION`.

Theo D3 (`0fa3c385`), P22+ là việc của Codex. Bản P22 này do Thanhvuong (Claude) làm theo yêu cầu của Vuong trên nhánh contributor `feat/thanhvuong/research-p17-p21` (code `51a944eb` backend + contract, `d55beca7` frontend). Chưa merge, chưa PR. Bobby quyết giữ hay bỏ (`B-P22-01`); baseline `85c1b113` còn ghi một bản Codex WIP (`codex/p22-wip-2026-09-24`, không có trên `primus-origin`) cùng tên operation `researchReleaseCandidatePublishV1`. Handoff này mô tả **đúng code đang có**, không phải contract đã được owner duyệt.

Hồ sơ: [receipt](./thanhvuong-frontend-receipt.md) · [backend requests](./thanhvuong-backend-requests.md) · [test results](./thanhvuong-test-results.json) · [debt](./thanhvuong-debt-register.json) · [rollback](./thanhvuong-rollback.md).

## Codex integration note (2026-09-25)

The contributor handoff above is retained as historical evidence. On the
shared `docs/research-loop-plan` integration branch, the Codex P21/P22
generated contracts are authoritative. The current publication contract
publishes `GET /api/v1/research/release-candidates/{id}/publication` and
`POST /api/v1/research/release-candidates/{id}/publish`; it does not publish a
separate `/publish/reconcile` route or a `/mirror` route. The browser adapter
therefore normalises the P21 composition with the publication read, sends the
exact idempotent publish request, and replays that same request on the current
`/publish` endpoint. It never invents `PUBLISHED`: the state is rendered only
after the publication response says `DELIVERED`. The focused Screen 11 lane is
61/61; no backend, migration, feature flag or runtime file was changed by this
integration.

## 1. Contract (generated, không viết tay)

- OpenAPI `packages/contracts/openapi/research-release-candidate.openapi.json` (version `1.0.0`, SHA-256 `bfea70462aefcddf…`), d.ts `packages/contracts/generated/research-release-candidate.d.ts` (`4edd818b8a86fb93…`). Regenerate: `npm --prefix packages/contracts run generate:research-release-candidate`.
- Flag `CONTROL_API_FEATURE_RESEARCH_PUBLICATION` (default `false`, đòi `FEATURE_RESEARCH_RELEASE_CANDIDATES=true`). Flag tắt → cả 3 route dưới trả 503 `RESEARCH_PUBLICATION_DISABLED`, compose chặn publish bằng `P22_PUBLICATION_DISABLED` (xem debt `S11-P22-FLAG-OFF-HIDES-PUBLICATION`).

```text
GET  /api/v1/research/release-candidates/{releaseCandidateId}/publication  researchReleaseCandidatePublicationGetV1 private, no-store
POST /api/v1/research/release-candidates/{releaseCandidateId}/publish       researchReleaseCandidatePublishV1 201 new · 200 replay · 202 unknown outcome
```

- Request publish `research.release-candidate-publish-request.v1` (strict): `{schema_version, workspace_id?, expected_pack_digest, methodology_claim_id?}`. Browser chỉ gửi digest pack đang thấy và claim người dùng chọn khi server mirror > 1 claim; alpha, run, summary, gate đều do server suy ra. POST đi qua CSRF same-origin như P21.
- Compose P21 nay mang thêm: `state` ∈ `DRAFT`/`PUBLISHED`; `actions.publish {enabled, blocked_reason, release_candidate_id}`; khối `publication` (`availability`, `state` PENDING/DELIVERED/UNKNOWN/REFUSED/CONFLICT, `release_candidate_id`, `approval_id`, `conflicting_approval_id`, `downstream_code`, `downstream_receipt_digest`, `attempt_count`, `intent_actor`, `updated_at_utc_ms`, `reconcile_allowed`, `claim_candidates`; absence typed qua `availability`). Response publish/reconcile `research.release-candidate-publication.v1` (`publication_state` DELIVERED/UNKNOWN, `replayed`, `approval_id`, `href`, `delivery_state`, `approval_state`, …); `mirror`; `source_absences.approval_mirror`; `actions.may_edit_draft=false` sau publish.
- Mirror `research.release-candidate-approval-mirror.v1`: `approval_id, href, availability, gate, subject_id, subject_label, status, effective_status, sla_due_at, expires_at, created_at, quorum, approval_version, evidence_set_hash, blocker_count, condition_count, conditions, decision_outcomes, rc_superseded, as_of_utc_ms`. Luật đọc giống inbox R1: không có quyền đọc R1 → chỉ `approval_id` + `href` + `availability {NOT_APPLICABLE, GOVERNANCE_R1_READ_DENIED}`, mọi fact `null`.

### Error codes (Problem `code`)

`RESEARCH_PUBLICATION_INVALID`, `_NOT_FOUND`, `_CONFLICT`, `_PACK_NOT_CURRENT`, `_RUN_NOT_MIRRORED`, `_ALPHA_MISMATCH`, `_CLAIM_NOT_MIRRORED`, `_CLAIM_CHOICE_REQUIRED`, `_OPEN_APPROVAL_EXISTS`, `_REFUSED_DOWNSTREAM`, `_RETRYABLE`, `_RECOVERY_ACTOR_MISMATCH`, `_NOT_RECONCILABLE`, `_DISABLED`, `_MIRROR_UNAVAILABLE`.

### Reason codes (render nguyên văn)

`P22_ALPHA_MISMATCH`, `P22_ALREADY_PUBLISHED`, `P22_APPROVAL_SUBJECT_MISMATCH`, `P22_CLAIM_NOT_MIRRORED`, `P22_NOT_PUBLISHED`, `P22_NO_PUBLISHED_PREDECESSOR`, `P22_PACK_NOT_CURRENT`, `P22_PUBLICATION_DISABLED`, `P22_PUBLICATION_PENDING_RECONCILE`, `P22_RUN_NOT_MIRRORED`, `GOVERNANCE_R1_READ_DENIED`, `GOVERNANCE_EVIDENCE_INTEGRITY_FAILED`, `GOVERNANCE_MIRROR_UNAVAILABLE`, `GOVERNANCE_MIRROR_INCOMPATIBLE`, `GOVERNANCE_APPROVAL_NOT_FOUND`, `GOVERNANCE_REFUSED`.

## 2. Hành vi S11 ở `d55beca7`

| Tình huống | S11 làm gì |
|---|---|
| Draft đã local seal, không blocker | Card publish một click (`VD-P22-04`), disabled khi pending; SoD note ở card publish (`VD-P22-13`) |
| 201 / 200 replay | Refetch compose → chip `PUBLISHED` (token `--good`), card published: `published_at`, `by`, evidence digest + receipt digest + approval id mono (`VD-P22-14`); INPUT read-only |
| 202 unknown | Card unknown-outcome + nút reconcile chỉ khi `reconcile_allowed` (`VD-P22-05`) |
| 409 open approval / conflict | Banner dưới card publish, link approval chỉ khi server có href (`CG-P22-A`) |
| 401/403 | `denied`, khoá thao tác ghi, không retry tự động |
| 422 / 400 / 404 | terminal typed trong panel |
| 502/503/timeout | `unavailable`, giữ compose đã nhận, retry chỉ bằng nút |
| Mirror | Poll khi tab hiện, dừng khi tab ẩn và khi 401/403; lỗi sau lần đọc tốt → `stale` giữ facts cũ kèm `as_of`; không đọc được R1 → `not readable` + href; không tự tính countdown SLA (`VD-P22-01`); `effective_status` in cạnh `status` (`VD-P22-11`); `rc_superseded` dòng riêng (`VD-P22-07`) |
| Claim > 1 | Radio chọn claim (`VD-P22-06`) |

Không bao giờ in `0`/`-`/`N/A` thay cho `null`; không localStorage; không màu hex ngoài token.

## 3. VD / CG / debt còn mở

- VD `REQUIRES_BOBBY_DECISION`: `VD-P22-01, 04, 05, 06, 08, 12, 13, 14`. Field-driven: `02, 03, 09, 10`. Rule-over-hifi: `07, 11`. Bảng đầy đủ ở receipt §6.
- CG mở: `CG-P22-01` (claim id phía Research), **`CG-P22-02`** (child `AUDIT_OF_SELECTION` không tới `run_read_models` → mọi candidate S11 thật bị `RUN_NOT_MIRRORED`; chặn publish thật), `CG-P22-03` (assignee pool), `CG-P22-04` (fixture governance), `CG-P22-05` (lane REAL_API + thứ tự RunSync), `CG-P22-06` (`created_at`), `CG-P22-A` (href conflicting approval), `CG-P22-B` (`details.downstream_code`), `CG-P22-C` (ledger r2, dành cho Bobby).
- Debt mở: `S11-P22-DECISION-MAP`, `S11-P22-APPROVAL-STATE-SNAPSHOT`, `S11-P22-PRECHECK-BEFORE-RUNSYNC`, `S11-P22-HARNESS-TABLES`, `S11-P22-MIRROR-UNAVAILABLE-ROUTE`, `S11-COMPOSE-SHAPE-GUARD`, `S11-P22-R2LEDGER`, `S11-P22-MIGRATION-NUMBER-COLLISION`, `S11-P22-FLAG-OFF-HIDES-PUBLICATION`; mang từ P21 `S11-RAIL-DIGEST-WRAP`, `S11-LOCAL-DUPLICATION`. Deferred: `S11-P22-MIGRATION-056-UNPROVEN`, `S11-P22-REAL-E2E`, `S11-AXE`, `S11-REAL-API`, `S11-P22-TVP21-RETIRED`.

## 4. Handoff for P23 (Codex)

1. **Trước mọi thứ, Bobby chọn bản P22** (`B-P22-01`, `B-P22-06`): nhánh này hay Codex WIP. Nếu giữ nhánh này: đổi số migration 056 (trùng `1723680000056_research-journey-descriptor-v2.sql` trên baseline; baseline còn dùng 057, 060–062), chạy migration + `research-release-candidate-publication-migration.spec.ts` trên Postgres dùng một lần (`S11-P22-MIGRATION-056-UNPROVEN`), review grant mới cho `portal_research_runtime`.
2. **Đóng `CG-P22-02`** trước khi coi publish là thật; sau đó chạy P22-T01 real path, T11 seed/refresh/publish và một REAL_API receipt (`CG-P22-05`).
3. Thêm 3 route vào ledger r2 (`CG-P22-C`) để `r2Ledger.test.ts` xanh lại.
4. Quyết `S11-P22-FLAG-OFF-HIDES-PUBLICATION` trước khi bật flag ở đâu; thứ tự bật theo `B-P22-07` (DG-01…04 trước).
5. P23 đọc `publication` (approval mirror nằm trong cùng DTO) trong compose; **không** gọi governance từ browser, **không** revoke approval để rollback (đường ghi governance duy nhất là `createApproval` trong `deliver()`).
6. Probe tạm `tvp21` đã retired; nếu cần hồi quy S11 trên Playwright thì dựng spec committed mới từ fixture canonical (`CG-P22-01`/`CG-P22-04`), không hồi sinh stub P21.
7. Reuse cho P23: `releaseCandidateClient.ts` (call/refusal mapper — gộp với `researchRefusal.ts` của baseline, `S11-LOCAL-DUPLICATION`), hook poll mirror có dừng khi tab ẩn, card/rail/chip token Fund Paper hiện có.

## 5. Chưa chạy

Migration 056 trên Postgres; REAL_API; delta-real-data; direct-vs-portal; dev-host-review; axe; CHANGED/SUPERSEDED trong browser; mirror `unavailable` qua route product; CSRF header trong probe (có ở vitest). Chi tiết `not_run` trong [test results](./thanhvuong-test-results.json).

## OL-11 canonical-route resolution (Codex, 2026-09-26)

The historical contributor three-route sketch above is not the active contract.
The canonical inventory has exactly two operations: `GET …/publication` and
`POST …/publish`. Reconcile is a replay of the actor-bound `/publish` intent,
and the approval mirror is returned in the same publication DTO; no `/mirror` or
`/publish/reconcile` route may be added. The P22 isolated stack and generated
client must be checked against these two paths only.
