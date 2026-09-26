# P22 — Thanhvuong backend request receipt (Screen 11 publication + mirror)

Receipt này gom mọi việc P22 cần từ backend (@codex) và từ Bobby.

- Receipt chính: [thanhvuong-frontend-receipt.md](./thanhvuong-frontend-receipt.md). Evidence máy đọc được: [thanhvuong-test-results.json](./thanhvuong-test-results.json), [thanhvuong-debt-register.json](./thanhvuong-debt-register.json).
- **Khác P21:** P22 nằm ngoài D3 (Bobby: P22+ là Codex). Theo chỉ đạo của user 2026-09-25, Thanhvuong đã tự làm phần backend tự xử lý được (migration 056, service/repository/controller, flag, contract). Vì vậy receipt có hai phần: request cho phần **chưa** làm được (§1, @codex) và danh sách review cho phần **đã** làm (§3, Bobby) — không phần nào được bật ở môi trường nào trước khi owner review.

**Ngày kiểm:** 2026-09-25. Nơi kiểm: nhánh `feat/thanhvuong/research-p17-p21` code head `d55beca7`; baseline `primus-origin/docs/research-loop-plan` = `28da9470` (lúc plan) và **`85c1b113`** (sau `git fetch primus-origin` lúc đóng packet).

Kết quả kiểm baseline:
- `28da9470..85c1b113` = 2 commit (`4626448d`, `85c1b113`), 13 file +260/−43; không chạm `apps/control-api/src/research/release-candidate*`, contract release-candidate hay `evidence/P21|P22`.
- `85c1b113` đổi dòng P22 trong Unified baseline thành Codex `BACKEND_AND_TYPED_CONTRACT_COMPLETE · PRODUCT_BROWSER_AND_REAL_PREVIEW_PENDING`, trỏ `evidence/P22/README.md` (file không có trên tree `85c1b113`) và operation `researchReleaseCandidatePublicationGetV1` / `researchReleaseCandidatePublishV1`; RF-03 ghi Codex WIP P22 ở `codex/p22-wip-2026-09-24` (không có trên `primus-origin`). → Bobby B-P22-01 / B-P22-06.
- Migration `1723680000056_research-journey-descriptor-v2.sql` có trên baseline từ `ea221dc2` (2026-09-23), trùng số với migration P22 `1723680000056_research-release-candidate-publication-v1.sql`.

Luật ghi (CLAUDE.md §5): mỗi request có locator, actual, expected, đề xuất nhỏ nhất, test khi có, fallback đang chạy. Đề xuất chỉ là đề xuất; Codex quyết.

## 1. `CG-P22-*` — cần từ backend (@codex)

### CG-P22-01 — methodology claim id phía Research

```text
Backend request (@codex) — 2026-09-25
- Endpoint/field cần: ReleaseCandidateSource (và frozen core) mang methodology_claim_id của Research
- Lý do UI/saga: governance.createApproval cần methodology_claim_id; nguồn Research chỉ có claimText/certificate*
- Ảnh hưởng hiện tại: publish lấy claim từ public.run_read_models.methodology_claim_ids; nhiều claim → S11 hiện radio chọn (VD-P22-06)
- Đề xuất schema: additive methodology.claim_id trong source + frozen core (chỉ đề xuất — codex quyết)
```

| Mục | Nội dung |
|---|---|
| Locator | `release-candidate-publication.service.ts:331` (`claimFor`), `release-candidate-publication.repository.ts:422` (đọc `run_read_models`) |
| Actual | 0 claim → 422 `RESEARCH_PUBLICATION_CLAIM_NOT_MIRRORED`; >1 → 422 `RESEARCH_PUBLICATION_CLAIM_CHOICE_REQUIRED` nếu body không chọn; compose `publication.claim_candidates` |
| Expected | Claim đi cùng pack đã seal, không phụ thuộc bản mirror legacy |
| Test khi có | service spec đổi nguồn claim; S11-U52 có thể bỏ radio |
| Fallback | Claim server-side từ `run_read_models`; FE chỉ chọn trong danh sách server |

### CG-P22-02 — child `AUDIT_OF_SELECTION` không bao giờ tới `run_read_models` (chặn publish thật)

```text
Backend request (@codex) — 2026-09-25
- Endpoint/field cần: đường mirror hoặc dispatch cho run final-audit (AUDIT_OF_SELECTION) vào public.run_read_models, cùng id space
- Lý do UI/saga: governance R1 chỉ nhận evidence run có trong run_read_models; candidate S11 là child final-audit
- Ảnh hưởng hiện tại: mọi candidate S11 thật bị 422 RESEARCH_PUBLICATION_RUN_NOT_MIRRORED; compose blocker P22_RUN_NOT_MIRRORED; P22-T01/T11 real path không đạt được
- Đề xuất schema: không đổi contract P22; cần producer/seed phía run (codex quyết)
```

| Mục | Nội dung |
|---|---|
| Locator | `apps/control-api/src/research/repository.ts:3741` (`createChildRun`, DRAFT insert, không qua proxy); đối chiếu run thường `run-create.service.ts:95/:223/:256` + `facade/proxy.service.ts:432/:468` (`seedLegacyRunIfAccepted`) |
| Actual | Run P10 dispatch có row cùng id; child final-audit không có |
| Expected | Child final-audit có row `run_read_models` (status, strategy_id = alpha, artifact_sha256, methodology_claim_ids) như run P10 |
| Test khi có | P22-T01 / P22-T11 trên Postgres dùng một lần + lane REAL_API |
| Fallback | Refusal typed trước mọi lời gọi governance; FE in blocker (S11-U35) |

### CG-P22-03 — assignee / approver pool cho mirror

```text
Backend request (@codex) — 2026-09-25
- Endpoint/field cần: mirror.assignee_pool (hoặc approver pool) từ governance detail
- Lý do UI: hi-fi :183 "assignee pool: Quant Reviewers"
- Ảnh hưởng hiện tại: MirrorCard in "assignee pool: not published" (VD-P22-02)
- Đề xuất schema: additive nullable string/array + availability
```

| Locator | Actual | Fallback |
|---|---|---|
| `governance.r1-review.v1` không có field pool; `ReleaseCandidateDetail.tsx:208` | Typed absence | Giữ vị trí hi-fi + absence |

### CG-P22-04 — fixture governance approval-create cho test P22

```text
Backend request (@codex) — 2026-09-25
- Endpoint/field cần: fixture canonical governance.approval-create.v1 (success, DUPLICATE_OPEN_APPROVAL, EVIDENCE_RUN_NOT_ELIGIBLE, serialization 409) + governance.r1-review.v1
- Lý do: service spec P22 dùng fake in-memory theo shape đã publish; CLAUDE.md §7.8 muốn fixture canonical
- Ảnh hưởng hiện tại: research-release-candidate-publication.service.spec.ts (16 test) dựng body tay
- Đề xuất schema: không đổi schema; chỉ thêm file fixture
```

### CG-P22-05 — RunSync / `FEATURE_PROXY_PORTAL` cho lane REAL_API

```text
Backend request (@codex) — 2026-09-25
- Endpoint/field cần: một lane preview có FEATURE_PROXY_PORTAL=true (RunSync) + FEATURE_RESEARCH_RELEASE_CANDIDATES + FEATURE_RESEARCH_PUBLICATION
- Lý do: V11-P22-DR và REAL_API_E2E_RECEIPT; pre-check claim/alpha của P22 đọc run_read_models TRƯỚC runSync?.refresh của governance
- Ảnh hưởng hiện tại: một run mà claim chỉ tới sau refresh bị P22 từ chối trong khi governance có thể nhận (debt S11-P22-PRECHECK-BEFORE-RUNSYNC)
- Đề xuất: cho phép P22 gọi refresh trước pre-check, hoặc xác nhận thứ tự hiện tại (codex quyết)
```

Locator: `governance.service.ts:332` (`runSync?.refresh`, chỉ khi `FEATURE_PROXY_PORTAL=true`); `release-candidate-publication.service.ts:171`.

### CG-P22-06 — `created_at` trong YAML hi-fi

```text
Backend request (@codex) — 2026-09-25
- Endpoint/field cần: fields/yaml có created_at (thời điểm publish) hoặc xác nhận không thuộc 17 field
- Lý do UI: hi-fi :271 { k: "created_at", v: pub ? "2026-09-14T09:12Z" : "— (on publish)" }
- Ảnh hưởng hiện tại: product chỉ in 17 field server (VD-P22-10); mirror có created_at của approval, không phải của rc
- Đề xuất schema: additive field thứ 18, hoặc một câu xác nhận
```

### CG-P22-A — `href` cho `conflicting_approval_id`

```text
Backend request (@codex) — 2026-09-25
- Endpoint/field cần: publication.conflicting_approval_href (cùng regex ^/governance/approvals/<id>/r1$ như mirror.href)
- Lý do UI: banner 409 open approval nên mở được approval đang chặn; FE không tự dựng URL
- Ảnh hưởng hiện tại: id in không link (ReleaseCandidateDetail.tsx:1263–1266)
- Đề xuất schema: additive nullable string
```

### CG-P22-B — `details.downstream_code` trong body lỗi

```text
Backend request (@codex) — 2026-09-25
- Endpoint/field cần: body 409/422 của publish mang details.downstream_code
- Lý do UI: màn chỉ biết code downstream sau khi đọc lại compose (publication.downstream_code)
- Ảnh hưởng hiện tại: http-error.filter.ts:104–108 chỉ phát details cho GovernanceError / CurrentSourceProxyError; file ngoài allow-list P22
- Đề xuất: cho ResearchReleaseCandidateError mang details (codex quyết)
```

### CG-P22-C — ledger r2 thiếu 3 route P22

```text
Backend/ledger request (@codex + Bobby) — 2026-09-25
- Endpoint/field cần: upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/r2_ledger/capability-inventory.v1.json thêm
  POST /api/v1/research/release-candidates/:releaseCandidateId/publish
  POST /api/v1/research/release-candidates/:releaseCandidateId/publish/reconcile
  GET  /api/v1/research/release-candidates/:releaseCandidateId/mirror
- Lý do: src/execution/r2Ledger.test.ts "covers exactly the routes the controllers publish" fail 1/3156
- Ảnh hưởng hiện tại: FE full vitest exit 1 tới khi có entry
- Ghi chú: Fable thử thêm 3 entry (owner "thanhvuong (outside D3, pending Bobby)"); classifier auto-mode từ chối sửa ledger chung → KHÔNG làm; ledger dành cho Bobby
```

## 2. Không mở request

- Luật hiển thị mirror: đã có trong governance (`governanceDenial` r1 read, owner bypass, không requester bypass); P22 dùng lại, không cần contract mới.
- Mirror etag/304: PLAN chọn không etag; `cache-control: private, no-store`.
- `Problem.error.message`: như `CG-P21-04` (vẫn OPEN ở P21); FE P22 cũng không render message.

## 3. Bobby review — backend ĐÃ làm (trước khi bất kỳ môi trường nào bật flag)

| # | Mục | Nơi | Vì sao cần owner |
|---|---|---|---|
| R1 | Grant mới cho `portal_research_runtime`: SELECT, INSERT + UPDATE cột trên `research.release_candidate_publications_v1`; UPDATE `(delivery_state, approval_state, downstream_receipt_digest, downstream_updated_at)` trên `release_candidate_delivery_states_v1`; UPDATE `(lifecycle_state, revision)` trên `research.release_candidates` | migration 056 dòng 194–200 | Mở quyền ghi trên bảng P21 mà 055 cố ý chỉ cho INSERT |
| R2 | Bảng mới `research.release_candidate_publications_v1` + guard; guard delivery 055 bị thay bằng `CREATE OR REPLACE`; guard lifecycle mới trên `research.release_candidates`; CHECK 055 không tên bị drop qua `pg_constraint` và thay bằng CHECK có tên (+`EXPIRED`) | migration 056 dòng 9–184 | Đổi guard/CHECK của migration P21 đã có |
| R3 | Down refuse 55000 khi đã có publication fact; nếu chưa có thì revoke, restore guard/CHECK 055, drop bảng | migration 056 từ dòng 207 | Down chỉ dùng trước deploy |
| R4 | **Số migration 056 trùng** `1723680000056_research-journey-descriptor-v2.sql` trên baseline | `apps/control-api/migrations/` | Phải đổi số (ví dụ sau 062) trước khi tích hợp; chưa làm vì cần Bobby chọn bản P22 |
| R5 | **Migration + spec chưa từng chạy** (không có Postgres trên host) | `test/research-release-candidate-publication-migration.spec.ts` | Chạy trên Postgres dùng một lần trước khi deploy (DG-02) |
| R6 | Flag `FEATURE_RESEARCH_PUBLICATION` (default false, đòi `FEATURE_RESEARCH_RELEASE_CANDIDATES=true`) | `config.ts:144`, `:492–497` | Giữ false tới DG-01…04 (B-P22-07) |
| R7 | Contract `research-release-candidate` đổi (7 path, compose `state` DRAFT/PUBLISHED, `publication`, `mirror`), **version vẫn `1.0.0`** | OpenAPI SHA-256 `bfea70462aefcddf…`, d.ts `4edd818b8a86fb93…` | Sửa contract do Thanhvuong làm; owner quyết có bump version không; tên operation `researchReleaseCandidatePublishV1` trùng tên bản Codex |
| R8 | Đăng ký provider/controller | `app.module.ts` (+6) | File dùng chung |
| R9 | `test/harness.ts` TEST_TABLES chưa có bảng mới (file ngoài allow-list; cleanup vẫn qua `TRUNCATE … CASCADE`) | `harness.ts:595` | Owner harness thêm (debt `S11-P22-HARNESS-TABLES`) |

## 4. Trạng thái

| ID | Owner | State | Ghi chú |
|---|---|---|---|
| `CG-P22-01` | Codex | OPEN | claim id phía Research |
| `CG-P22-02` | Codex | OPEN | **blocker** publish thật (child final-audit không mirror) |
| `CG-P22-03` | Codex | OPEN | assignee pool |
| `CG-P22-04` | Codex | OPEN | fixture governance create/detail |
| `CG-P22-05` | Codex + Bobby | OPEN | lane RunSync / `FEATURE_PROXY_PORTAL`; thứ tự refresh |
| `CG-P22-06` | Codex | OPEN | `created_at` YAML hi-fi |
| `CG-P22-A` | Codex | OPEN | href conflicting approval |
| `CG-P22-B` | Codex | OPEN | `details.downstream_code` |
| `CG-P22-C` | Codex + Bobby | OPEN | ledger r2 thêm 3 route |
| R1–R9 | Bobby | AWAITING_REVIEW | §3 |
| B-P22-01…07 | Bobby | AWAITING_DECISION | [receipt §11](./thanhvuong-frontend-receipt.md#11-việc-bobby-quyết) |


## OL-11 route disposition (Codex, 2026-09-26)

`CG-P22-C` is resolved on the canonical integration branch: the R2 ledger and
OpenAPI publish only `GET /api/v1/research/release-candidates/{id}/publication`
and `POST /api/v1/research/release-candidates/{id}/publish`. The contributor
`/mirror` and `/publish/reconcile` proposals are historical and are not to be
implemented or added to the ledger.
