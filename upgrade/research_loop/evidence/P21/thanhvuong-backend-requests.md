# P21 — Thanhvuong backend request receipt (Screen 11)

Receipt này gom mọi việc S11 cần từ backend (@codex) và từ Bobby.

- Receipt chính: [thanhvuong-frontend-receipt.md](./thanhvuong-frontend-receipt.md).
- Evidence máy đọc được: [thanhvuong-test-results.json](./thanhvuong-test-results.json), [thanhvuong-debt-register.json](./thanhvuong-debt-register.json).

**Ngày kiểm lại:** 2026-09-24, theo CLAUDE.md §7.6 và §7.9.

Nơi kiểm:
- Nhánh `feat/thanhvuong/research-p17-p21`, code head `3af31923`.
- Baseline `primus-origin/docs/research-loop-plan` = `4d296c06` (lúc lập plan) và **`0fa3c385`** (sau `git fetch` lúc đóng packet).

Kết quả kiểm:
- Contract `research-release-candidate` `version 1.0.0`, SHA-256 `aaad7744854dc7b8…` (OpenAPI) / `5558743b960eb48c…` (d.ts). Commit cuối là `454b99c6` ở cả ba ref; `apps/control-api/src/research/release-candidate.*` và `evidence/P21/{README,phase-report,rollback,frontend-handoff-claude}.md` cũng vậy.
- `4d296c06..0fa3c385` gồm 11 commit, không chạm contract/service/evidence P21. Trong `packages/contracts` chỉ có `tooling/verify-generated.sh` +4, thêm release-candidate vào verify.
- Không có fixture release-candidate ở `packages/contracts/fixtures` hay `apps/portal/registry/fixtures`, ở cả `HEAD`, `4d296c06` và `0fa3c385` (grep = 0).

Luật ghi (handoff `THANHVUONG_P17_P21_FRONTEND_HANDOFF.md` + CLAUDE.md §5):
- Mỗi request có locator, actual, expected, đề xuất nhỏ nhất an toàn, test cần có và fallback đang chạy.
- Đề xuất chỉ là đề xuất; Codex quyết.
- Frontend không sửa backend, contract hay runtime để màn hình xanh.
- Không request nào đòi endpoint mới ngoài 4 operation P21. Mỗi đề xuất thuộc một trong ba dạng: field additive, file fixture, hoặc một câu xác nhận.

Plan P21 §4 dự kiến 5 request, và gói C kiểm lại từng cái trên contract trước khi mở:
- **Mở:** 01 fixture, 02 href, 03 ETag, 04 `Problem.message`.
- **Không mở:** request "maxLength declaration". OpenAPI `DraftPatch` đã khai `minLength 1 / maxLength 4096 | null` và khối `not` cấm cả hai null.
- **Thêm mới:** `CG-P21-05` (`PackResponse` không có `pack_counts` / `certification_axes`), phát hiện ở gói A (VD-P21-18) và xác nhận trên d.ts.

## 1. `CG-P21-*` — khoảng trống phía consumer

### CG-P21-01 — fixture canonical compose / pack

```text
Backend request (@codex) — 2026-09-24
- Endpoint/field cần: packages/contracts/fixtures/research-release-candidate.*.valid.json cho compose (bound VIRTUAL, bound READY/PERSISTED, unbound scratch, MISSING, DEGRADED, PARTIAL integrity, SEALED_LOCAL), SealResponse (201 + replay), PackResponse, và Problem 400/401/403/404/409/422/503
- Lý do UI: CLAUDE.md §7.8 — test và probe phải nạp fixture canonical, không tự dựng object; handoff P21 cho phép test double có nhãn chỉ khi API dark
- Ảnh hưởng hiện tại: /research/quantbt/runs/:runId/release-candidate và /research/quantbt/release-candidates/:id — releaseCandidateDetail.test.tsx (34 test) và probe tvp21 (82 test) dựng body từ release-candidate.contract.ts / release-candidate.service.ts
- Đề xuất schema: không đổi schema; chỉ thêm file fixture
```

| Mục | Nội dung |
|---|---|
| Locator | `packages/contracts/fixtures/` (không có `*release-candidate*`); `apps/control-api/test/research-release-candidate.*.spec.ts` đang assert body; spec 11 §9/§10 |
| Actual | Không có fixture. Stub S11 dựng theo shape service: rail 5 / taxonomy 4 UNSET / fields = yaml 17 / pack 12 (COMPLETE, DEGRADED hàng 9, INPUT 10/12, MISSING) / `seal_blocked_reason` theo thứ tự service / SEALED_LOCAL + replay cùng id |
| Expected | Một fixture cho mỗi case trên. Riêng trường hợp `local_seal.availability=PARTIAL P21_LOCAL_SEAL_REFERENCES_PRIOR_SOURCE_FINGERPRINT` cần có fixture (probe hiện không dựng) |
| Đề xuất nhỏ nhất | Xuất body mà service spec đang assert ra `research-release-candidate.{compose-virtual,compose-ready,compose-unbound,compose-missing,compose-partial,compose-sealed,seal,pack}.valid.json` |
| Test khi có | `S11-U*` và probe nạp fixture; test fixture ↔ OpenAPI |
| Fallback đang chạy | Stub theo shape service, ghi rõ "controlled same-origin test double" ở đầu file test và spec probe |

### CG-P21-02 — `pack[].source.href` lệch route frontend canonical

```text
Backend request (@codex) — 2026-09-24
- Endpoint/field cần: researchReleaseCandidateComposeGetV1 / PackGetV1 → pack[].source.href trỏ đúng route SPA hiện có (hoặc xác nhận frontend phải map)
- Lý do UI: handoff "Deep-link evidence screens in the same SPA context"; FE không được rewrite href (không suy diễn)
- Ảnh hưởng hiện tại: cột source của bảng pack; 4/10 link rơi vào route không đúng màn
- Đề xuất schema: không đổi schema; sửa chuỗi href trong service
```

| Mục | Nội dung |
|---|---|
| Locator | `release-candidate.service.ts:363–412` (`alphaHref`, `runHref = /research/quantbt/runs/{id}` :364); `release-candidate.contract.ts:100` regex `^/research/…`; FE `QuantBTModule.tsx:351–394` |
| Actual | Hàng 1 Alpha 360° `/research/alphas/{alphaId}`: không có route trong module QuantBT. Hàng 2 Engine Atlas `/research/quantbt`: về gốc module, không phải `atlas`. Hàng 3 Data snapshots `/research/quantbt/runs/{id}`: `runs/:runId/*` (workspace legacy). Hàng 6 Replay `…/replay`: không có route `replay`, rơi vào `runs/:runId/*`; màn thực thi là `…/execute`. Hàng 9 Compare `/research/alphas/{alphaId}/compare`: canonical S13 là `/research/quantbt/alphas/{alphaId}/compare`. Hàng 4, 5, 7, 8, 11 (`/evidence`, `/search`, `/report`, `/split`, `/freeze`) khớp |
| Expected | Href trỏ đúng màn hi-fi ghi (spec 11 §3 "10 link đúng màn") |
| Đề xuất nhỏ nhất | `/research/quantbt/atlas`, `…/execute`, `/research/quantbt/alphas/{id}/compare`. Với Alpha 360° / data snapshots: `href:null` nếu chưa có màn, hoặc route mà Codex chọn |
| Test khi có | U11 đổi expectation href; probe thêm assert route đích render đúng màn |
| Fallback đang chạy | Link = chuỗi server nguyên văn (VD-P21-07); href null/ngoài same-origin → span + title (VD-P21-12) |

### CG-P21-03 — ETag gửi nhưng không khai trong contract

```text
Backend request (@codex) — 2026-09-24
- Endpoint/field cần: GET compose + GET pack — khai header ETag (+ 304 / If-None-Match) trong OpenAPI, hoặc bỏ header
- Lý do UI: FE chỉ dùng hành vi đã khai; S04/S13 có ETag/304 khai rõ, S11 thì không
- Ảnh hưởng hiện tại: không có; FE không gửi If-None-Match, mỗi identity đọc 1 lần
- Đề xuất schema: responses.200.headers.etag + response 304; hoặc xoá reply.header("etag")
```

| Mục | Nội dung |
|---|---|
| Locator | `release-candidate.controller.ts:54` (`etag = "source_fingerprint"`), `:109` (`etag = "pack_digest"`); OpenAPI không có `etag`/`304`/`If-None-Match` (grep = 0) |
| Actual | Header có ở runtime, contract không có, controller không đọc `If-None-Match` |
| Expected | Contract và runtime khớp nhau |
| Đề xuất nhỏ nhất | Chọn một: khai header (không cần 304), hoặc bỏ header |
| Test khi có | Contract test header; nếu có 304 thì unit hook |
| Fallback đang chạy | Bỏ qua header; `cache-control: private, no-store` được tôn trọng |

### CG-P21-04 — `Problem.error.message` có dành cho UI không

```text
Backend request (@codex) — 2026-09-24
- Endpoint/field cần: Problem.error.message (required string) — xác nhận không phải copy UI
- Lý do UI: message có thể chứa prose server (ví dụ superRefine "at least one declaration is required"); P20 đã thấy message lộ prose
- Ảnh hưởng hiện tại: mọi refusal S11 chỉ in error.code + request_id + câu FE theo status
- Đề xuất schema: không đổi; một câu xác nhận trong handoff
```

| Mục | Nội dung |
|---|---|
| Locator | `research-release-candidate.d.ts:348` `Problem.error.message: string`; `release-candidate.contract.ts:33` |
| Actual | FE không render `message` (grep `error.message` = 0 trong file S11) |
| Expected | Xác nhận message chỉ để log/debug, hoặc là copy an toàn cho UI |
| Đề xuất nhỏ nhất | Một dòng trong handoff P21/P22 |
| Test khi có | Nếu message là copy UI: U26/U27 assert in message |
| Fallback đang chạy | Code + request id + câu FE theo status (F-04 cho 403/404) |

### CG-P21-05 — `PackResponse` không có `pack_counts` / `certification_axes`

```text
Backend request (@codex) — 2026-09-24
- Endpoint/field cần: researchReleaseCandidatePackGetV1 → frozen_core.pack_counts và frozen_core.certification_axes (hoặc xác nhận cố ý không đóng băng)
- Lý do UI: hi-fi pack có counter "N COMPLETE · N DEGRADED · …" và 2 chip cert; FE không được đếm status
- Ảnh hưởng hiện tại: /research/quantbt/release-candidates/:id in "counts are not part of the frozen pack" và chip cert ghost "not part of the frozen pack"
- Đề xuất schema: additive trong frozen_core, cùng shape ComposeResponse.pack_counts / CertificationAxes
```

| Mục | Nội dung |
|---|---|
| Locator | d.ts `PackResponse` (:325): `frozen_core{fields, pack, source_fingerprint, draft}` + `delivery`; `ComposeResponse` có `certification_axes` (:177) và `pack_counts` (:183) |
| Actual | Pack route không có counts/cert |
| Expected | Hoặc frozen core mang counts + cert lúc seal, hoặc xác nhận "cert/counts không thuộc pack bất biến" |
| Đề xuất nhỏ nhất | Thêm 2 field additive vào `frozen_core` (đã có sẵn lúc seal) |
| Test khi có | U30 đổi absent → giá trị; probe pack-route |
| Fallback đang chạy | Typed absence đúng vị trí hi-fi (VD-P21-18) |

## 2. Không có hàng source-capability riêng

P21 không có matrix source-capability. Source absence là reason code `P21_*` / `P22_*` trong contract và được in nguyên văn. Ví dụ: `P21_ALPHA_BINDING_NOT_PUBLISHED`, `P21_METHODOLOGY_CERTIFICATION_NOT_PUBLISHED`, `P21_ENGINE_EXECUTION_CERTIFICATION_NOT_PUBLISHED`, `P22_PUBLISHED_COMPARISON_NOT_COMMISSIONED`, `P22_PUBLICATION_NOT_COMMISSIONED`.

Không mở request cho:
- **maxLength / minLength declaration:** đã có trong OpenAPI `DraftPatch`.
- **Rule hai declaration null:** đã có trong OpenAPI `not` và server `superRefine`. Chỗ lệch nằm ở FE (`cad8bed9`, audit A1), không phải backend; xem B2 và debt `S11-A1-BOTH-NULL`.
- **Mirror / publish / taxonomy predecessor:** là phạm vi P22 (B5), không phải khoảng trống P21.
- **Badge 403/404:** S11 dùng câu F-04 chung như S10/S13; điểm lệch với handoff là việc Bobby quyết (B1/D7).

## 3. Việc Bobby quyết (không phải backend)

- **B1 — Baseline và tích hợp** `4d296c06 → 0fa3c385` (11 commit, chưa merge/rebase):
  - Quyết định D1 (`0fa3c385`, `BACKEND_DEBT_P01_P21_CLAUDE_2026-09-24.md` §6): Codex merge nhánh Thanhvuong vào base, giữ commit, không rebase/force. Xung đột dự kiến ở `QuantBTModule.tsx`, `EvidenceFlow.tsx`, `FreezeDetail.tsx`, `RunLibrary.tsx`, và Claude không sửa 4 file này tới khi merge.
  - S11 `65e74a7b` (14:23 UTC) đã sửa `QuantBTModule.tsx` (+6/−2, 2 route S11) và `EvidenceFlow.tsx` (+9/−21, link S11) **trước** commit quyết định (14:48 UTC). Codex cần giữ 2 route và link đó khi merge. Baseline `6a3f15cc` cũng viết lại `EvidenceFlow.tsx`.
  - Doc quyết định ghi "S11 RC composer: TV không → làm mới toàn bộ". Dòng này đã cũ: S11 nay có trên nhánh, 6 commit code.
  - Baseline có `researchRefusal.ts` (404 → terminal `notFound`, DQ-08 format số), trong khi S11 dùng 403 = 404 `denied` và in chuỗi nguyên. Cần chốt một chuẩn; điểm lệch với handoff codex P21 (404 terminal) là D7 / VD-P21-11.
  - Xung đột `FreezeDetail.tsx` (P17) và `RunLibrary.tsx` (P20) vẫn còn như trước.
- **B2 — VD copy/layout** `VD-P21-01/02/03/04/08/10/11/13/14/15/16/20/21` (`REQUIRES_BOBBY_DECISION`):
  - Đề xuất mở version hi-fi 11 cho P21 local seal (nút "Local seal evidence pack", card sealed, meta line, mirror "status not published", digest dài). Bản publish/mirror thật để P22.
  - Kèm theo: debt `S11-A1-BOTH-NULL` (Fable/Bobby chọn khôi phục chặn trước khi gửi hay giữ server quyết), và D13 "Code anatomy" (handoff nhắc nhưng hi-fi/spec không có khối này).
- **B3 — axe** (spec T14): axe-core không có trong lock.
- **B4 — `REAL_API_E2E_RECEIPT` / `V11-P21-DR`**: cần bật `CONTROL_API_FEATURE_RESEARCH_RELEASE_CANDIDATES` trên một lane preview, cùng một run bound thật có final audit.
- **B5 — Ranh giới P22**: publish, Approval mirror, spec T02/T11/T18 là `PENDING_OWNER_PHASE`. Theo quyết định D3, P22+ thuộc Codex. Codex (P22) cần chốt:
  - chip PUBLISHED;
  - INPUT read-only sau publish (T07, VD-P21-16);
  - taxonomy so predecessor (T10);
  - mirror status.

## 4. Trạng thái

| ID | Owner | State | Ghi chú |
|---|---|---|---|
| `CG-P21-01` | Codex | OPEN | fixture compose/seal/pack + Problem |
| `CG-P21-02` | Codex | OPEN | href source lệch route FE (atlas, execute, compare, alpha 360°) |
| `CG-P21-03` | Codex | OPEN | ETag gửi ở runtime, không khai trong OpenAPI |
| `CG-P21-04` | Codex | OPEN | `Problem.error.message` có dành cho UI không |
| `CG-P21-05` | Codex | OPEN | `PackResponse` thiếu `pack_counts` / `certification_axes` |
| (maxLength) | — | NOT_OPENED | OpenAPI đã khai `minLength 1 / maxLength 4096` |
| B1–B5 | Bobby | AWAITING_DECISION | §3 |
