# P19 — Thanhvuong backend request receipt (Screen 10)

Receipt này gom mọi việc S10 cần từ backend (@codex) và từ Bobby.

- Receipt chính: [thanhvuong-frontend-receipt.md](./thanhvuong-frontend-receipt.md).
- Evidence máy đọc được: [thanhvuong-test-results.json](./thanhvuong-test-results.json), [thanhvuong-debt-register.json](./thanhvuong-debt-register.json).

**Ngày kiểm lại:** 2026-09-24, theo CLAUDE.md §7.6 và §7.9.

Nơi kiểm:
- Nhánh `feat/thanhvuong/research-p17-p21`, code head `74f26200`.
- Baseline `primus-origin/docs/research-loop-plan` = `9060a7c4` (lúc lập plan).
- Baseline `62d7d864` (sau `git fetch` lúc đóng packet).

Kết quả kiểm:
- `git diff --stat 9060a7c4 62d7d864 -- packages/contracts/openapi/research-attempt-lineage.openapi.json packages/contracts/generated/research-attempt-lineage.d.ts apps/control-api/src/research/lineage* upgrade/research_loop/evidence/P19` cho kết quả **rỗng**.
  - Contract vẫn là `version 1.0.0`, SHA-256 `9bdfae71d1b850c6…` (OpenAPI) và `c6e8b25f01f61b59…` (d.ts).
  - Cả hai file đều có commit cuối là `5e844a90` ở cả ba ref.
- `git ls-tree -r <ref> --name-only | grep -i "fixtures.*lineage"` exit 1 ở `HEAD`, `9060a7c4` và `62d7d864`. Chưa có fixture lineage ở đâu.
- `9060a7c4..62d7d864` chỉ gồm `62d7d864` (RF-03 preflight/progress) và không chạm lineage.

**Cả mười hai `CG-P19-*` đều OPEN.** Chúng được liệt kê ở §1.

Luật ghi (handoff `THANHVUONG_P17_P21_FRONTEND_HANDOFF.md` + CLAUDE.md §5):
- Mỗi request có locator, actual, expected, đề xuất nhỏ nhất an toàn, test cần có và fallback đang chạy.
- Đề xuất chỉ là đề xuất; Codex quyết.
- Frontend không sửa backend, contract hay runtime để màn hình xanh.
- Không request nào đòi endpoint mới ngoài `researchAttemptLineageGetV1`. Mọi đề xuất đều là field additive trên DTO hiện có, hoặc một câu xác nhận "không có".

Một số request có thể được trả lời bằng "không có ở P19" (03, 05, 06, 07, 12). Câu trả lời đó cũng đủ: frontend sẽ ghi `NOT_APPLICABLE_PROVEN` và Bobby chốt `VISUAL_DECISION` tương ứng.

## 1. `CG-P19-*` — khoảng trống phía consumer

### CG-P19-01 — fixture canonical P19

```text
Backend request (@codex)
- Endpoint/field cần: packages/contracts/fixtures/research-attempt-lineage.*.valid.json (healthy / partial / empty / bounded) + Problem 400/401/403/404/503
- Lý do UI: CLAUDE.md §7.8 — test và probe phải nạp fixture canonical, không tự dựng object
- Ảnh hưởng hiện tại: /research/quantbt/alphas/:alphaId/lineage — lineageDetail.test.tsx và probe dựng body từ lineage.contract.ts / lineage.service.ts
- Đề xuất schema: không đổi schema; chỉ thêm file fixture
```

| Mục | Nội dung |
|---|---|
| Locator | `packages/contracts/fixtures/` (không có file `*lineage*`); `apps/control-api/test/` có spec lineage đang assert body; spec 10 §10 mô tả fixture 52 attempt |
| Actual | Không có fixture. Stub của S10 suy `counts` / `source_absences` / `coverage` theo logic service (submitted = state ≠ DRAFT; PARTIAL ⇔ `hasMore`) |
| Expected | Có các fixture sau: **healthy** (2 version, ≥ 6 attempt, tree 3 cấp, 1 pick PUBLISHED, child runs với `relationship_kind` thật, exposure RECORDED); **partial** (`coverage=PARTIAL` với đúng 128 returned, child `PARTIAL`, pick/diff/exposure NOT_PUBLISHED); **empty** (0 attempt, version vẫn có); **bounded** (> 128) |
| Đề xuất nhỏ nhất | Xuất body mà service spec đang assert ra fixture `research-attempt-lineage.{healthy,partial,empty,bounded}.valid.json`, kèm fixture Problem |
| Test khi có | `S10-U*` và probe nạp fixture; thêm test fixture ↔ OpenAPI |
| Fallback đang chạy | Stub theo shape service, ghi rõ ở đầu file test. Hạn chế đã biết: stub partial có returned 4 < 128 (N5) |

### CG-P19-02 — ETag / 304 cho GET lineage

```text
Backend request (@codex)
- Endpoint/field cần: researchAttemptLineageGetV1 → ETag + If-None-Match → 304 (private, no-store như các GET Research khác), hoặc xác nhận cố ý không có
- Lý do UI: FRONTEND_HANDOFF quy ước ETag/304; S10 quay lại bằng back/forward sẽ GET lại toàn bộ graph (≤ 128 attempt + child runs)
- Ảnh hưởng hiện tại: mỗi lần vào S10 là một GET đầy đủ; probe G8 đếm 4 GET lineage cho mount + reload + 2 lần quay lại
- Đề xuất schema: header ETag trên 200; response 304 — additive
```

| Mục | Nội dung |
|---|---|
| Locator | `research-attempt-lineage.openapi.json` chỉ khai 200 / 400 / 401 / 403 / 404 / 503; `lineage.controller.ts` không đặt ETag (grep `ETag\|304` rỗng) |
| Actual | Không có validator |
| Expected | ETag ổn định theo (workspace, alpha, limit, revision graph), hoặc một câu "không có ETag vì …" |
| Đề xuất nhỏ nhất | Như `researchReportDetailGetV1` / evidence: ETag private + 304 |
| Test khi có | U03 đổi thành "gửi If-None-Match khi đang giữ ETag"; browser G8: SPA quay lại → 304 |
| Fallback đang chạy | Không gửi `If-None-Match`, không giữ bản cache. Mỗi lần vào là một GET (U03: đúng 1 GET, không validator) |

### CG-P19-03 — phân loại storied / probe

```text
Backend request (@codex)
- Endpoint/field cần: AttemptNode.presentation_kind: "STORIED" | "PROBE" (server phân loại theo spec 10 §3 / §14), hoặc xác nhận P19 không có phân loại
- Lý do UI: hi-fi và spec vẽ 6 storied card + 46 probe row nhóm theo tuần, cùng toggle "show 46 probes"; spec T01/T02/T04 dựa vào đây
- Ảnh hưởng hiện tại: mọi attempt là node cùng loại; toggle probes được thay bằng expand-all (VISUAL_DECISION_REQUIRED)
- Đề xuất schema: field enum + reason_code khi nguồn không phân loại — additive
```

| Mục | Nội dung |
|---|---|
| Locator | `research-attempt-lineage.d.ts` `AttemptNode` (không có `kind`); spec 10 §3 "probe/storied do server phân loại (storied = có rc, hoặc đổi ≥ 2 key chiến lược, hoặc được đánh dấu)" |
| Actual | Không có field. Handoff cấm frontend tự suy ("do not … derive") |
| Expected | Server cấp nhãn, hoặc xác nhận vắng thật để spec T01/T02 ghi `NOT_APPLICABLE_PROVEN` |
| Đề xuất nhỏ nhất | `presentation_kind` + `availability` |
| Test khi có | U20 counter theo storied/probe; probe T01 "showing 6 of 52"; T02 toggle |
| Fallback đang chạy | Expand-all; counter "showing n of m attempts · total" |

### CG-P19-04 — release-candidate ref trên attempt / pick

```text
Backend request (@codex)
- Endpoint/field cần: AttemptNode.release_candidate { rc_id, state } | null và/hoặc PromotionPick.release_candidate (cho "rc_ draft composed · gate R1 next")
- Lý do UI: hi-fi có rc chip ● vàng trên node và banner pick "→ rc_ (draft) · gate R1 next"; spec T07 click rc → Screen 11
- Ảnh hưởng hiện tại: không vẽ rc chip; "rc & publish" là span refused (Screen 11 chưa có route)
- Đề xuất schema: ref additive với state + availability; không cần payload RC
```

| Mục | Nội dung |
|---|---|
| Locator | `AttemptNode`, `PromotionPick` trong d.ts (không có rc); spec 10 §2.2, §2.3, T07 |
| Actual | Không có field |
| Expected | Ref rc typed, hoặc xác nhận rc thuộc P21 và không bao giờ nằm trên lineage |
| Đề xuất nhỏ nhất | `release_candidate: { rc_id, state } \| null` + availability |
| Test khi có | Chip rc; link sang Screen 11 khi có route (downstream `P19-FE-DG-05`) |
| Fallback đang chạy | Không có chip rc; banner pick in attempt + run + source rev/digest/as-of |

### CG-P19-05 — mini-metrics cert / OOS / decay

```text
Backend request (@codex)
- Endpoint/field cần: AttemptNode.metrics { certification, oos, decay } (ExactDecimal|null + availability), hoặc một link typed tới report contract (researchReportDetailGetV1) theo primary_run.run_id
- Lý do UI: hi-fi hàng 4 "cert · OOS · decay"; panel selected có "OOS sharpe / cert"
- Ảnh hưởng hiện tại: panel selected in "certification · OOS · decay — not a field of the lineage contract"
- Đề xuất schema: additive; hoặc chỉ xác nhận "đọc ở S09 report", khi đó S10 giữ link "run report"
```

| Mục | Nội dung |
|---|---|
| Locator | `AttemptNode.primary_run` (run_id, state, digests, engine_release_id, technical_retry_count); `LineageDetail.tsx` `NOT_IN_CONTRACT` (dòng 66) |
| Actual | Không có metric. Frontend không được tính hay gộp |
| Expected | Metric có scope, hoặc Codex xác nhận S10 không in metric và dùng link sang S09 |
| Đề xuất nhỏ nhất | Xác nhận "không có ở P19" |
| Test khi có | U22 theo field |
| Fallback đang chạy | NOT_IN_CONTRACT + link "run report" `/runs/{id}/report` |

### CG-P19-06 — exercised / untried trên version

```text
Backend request (@codex)
- Endpoint/field cần: LineageVersion.exercised { routes[], modes[], param_ranges } + untried[] (hoặc xác nhận không có)
- Lý do UI: hi-fi và spec §2.2 hàng 3; spec T08 "untried link → 02"
- Ảnh hưởng hiện tại: cả hai hàng in NOT_IN_CONTRACT; link "declare at New Run →" vẫn còn
- Đề xuất schema: additive, mỗi phần kèm availability
```

| Mục | Nội dung |
|---|---|
| Locator | `LineageVersion` trong d.ts (label, lifecycle_state, code_digest, entrypoint, registered_at_utc_ms, promotion_pick); spec 10 §2.2 |
| Actual | Không có |
| Expected | Danh sách route/mode/range do server cấp, không suy từ các attempt trả về |
| Đề xuất nhỏ nhất | Additive, hoặc xác nhận |
| Test khi có | U27 đổi từ NOT_IN_CONTRACT sang render; probe T08 |
| Fallback đang chạy | NOT_IN_CONTRACT |

### CG-P19-07 — outcome text và "why superseded"

```text
Backend request (@codex)
- Endpoint/field cần: LineageVersion.outcome / superseded_reason và AttemptNode.outcome (chuỗi server), hoặc xác nhận không có
- Lý do UI: hi-fi band có outcome; card có "outcome 1 câu"; version SUPERSEDED cần lý do
- Ảnh hưởng hiện tại: chỉ in `reason` khi ABANDONED/FAILED; band không có outcome
- Đề xuất schema: string|null + availability — additive
```

| Mục | Nội dung |
|---|---|
| Locator | `AttemptNode.reason` (hiện có); `LineageVersion` không có outcome |
| Actual | Không có outcome / why superseded |
| Expected | Chuỗi server in nguyên văn, hoặc xác nhận vắng |
| Đề xuất nhỏ nhất | Additive |
| Test khi có | U04 / U12 thêm outcome |
| Fallback đang chạy | NOT_IN_CONTRACT cho outcome; `reason` in nguyên văn |

### CG-P19-08 — spec line / config label

```text
Backend request (@codex)
- Endpoint/field cần: AttemptNode.spec_line (ví dụ "signal_notional · mode_1_decay × per_fold_causal · space (6p · 5 swept / 1 pinned)") hoặc các field cấu thành đã chuẩn hoá phía server
- Lý do UI: hi-fi hàng 2 mono; spec §2.3; frontend không được parse config
- Ảnh hưởng hiện tại: node in "spec {effective_spec_digest rút gọn}" + space_signature rút gọn
- Đề xuất schema: string|null + availability — additive
```

| Mục | Nội dung |
|---|---|
| Locator | `primary_run.effective_spec_digest`, `space_signature`; README P19 "raw requested/effective specs never exposed" |
| Actual | Chỉ có digest |
| Expected | Nhãn do server dựng từ allow-list (giống semantic diff) |
| Đề xuất nhỏ nhất | Additive `spec_label` |
| Test khi có | U06 in spec line |
| Fallback đang chạy | Digest 12 ký tự + "…", bản đầy đủ trong `title` |

### CG-P19-09 — paging/cursor khi > 128 attempt, và thứ tự

```text
Backend request (@codex)
- Endpoint/field cần: hoặc thứ tự newest-first khi bị cắt, hoặc cursor (opaque, server cấp) cho trang kế
- Lý do UI: repository ORDER BY created_at ASC LIMIT limit+1 → khi history > 128, S10 chỉ nhận 128 attempt CŨ NHẤT; các attempt mới nhất (thường là ACTIVE và promotion pick) bị cắt
- Ảnh hưởng hiện tại: S10 in PARTIAL + "Bounded history: {returned} of {total} attempts" và không gọi thêm (contract không có cursor); attempt mới nhất không hiện
- Đề xuất schema: (a) tham số order=newest|oldest, hoặc (b) next_cursor trong coverage — Codex chọn
```

| Mục | Nội dung |
|---|---|
| Locator | `lineage.repository.ts` dòng 223–225 (`ORDER BY attempt.created_at ASC, attempt.attempt_id ASC LIMIT $3`, `limit + 1`), dòng 294 `hasMore`; OpenAPI mô tả "chronological and bounded to 128" |
| Actual | Chỉ có prefix cũ nhất; không có cursor. README cấm browser gửi cursor không do server cấp |
| Expected | Người xem history dài phải thấy được attempt mới nhất, hoặc có cách đọc tiếp |
| Đề xuất nhỏ nhất | Khi `hasMore`, trả 128 attempt mới nhất và giữ `oldest_returned_created_at_utc_ms` (field đã có), hoặc thêm `next_cursor` |
| Test khi có | Fixture `bounded` (`CG-P19-01`); probe 140 attempt; U19 |
| Fallback đang chạy | Disclosure PARTIAL rõ ràng, không gọi prefix là complete (U19; browser G3) |

### CG-P19-10 — promotion pick DR-03: nguồn và lộ trình

```text
Backend request (@codex)
- Endpoint/field cần: lộ trình để research.attempt_promotion_pick_facts_v1 có row source-attested (DR-03) — không đổi schema
- Lý do UI: exit gate P19 "DR03 resolved for mandatory field"; hôm nay mọi version trả NOT_PUBLISHED (P19_SOURCE_DID_NOT_PUBLISH_PROMOTION_PICK), nên nhánh PUBLISHED của S10 chỉ được thử bằng stub
- Ảnh hưởng hiện tại: banner PICK_ABSENT ở mọi band trên dữ liệu thật
- Đề xuất schema: không; chỉ hỏi ai ghi fact và khi nào
```

| Mục | Nội dung |
|---|---|
| Locator | P19 `phase-report.md` "Explicit non-goals"; migration `1723680000053`; `PromotionPick` |
| Actual | Không có source nào publish pick; runtime chỉ có `SELECT` |
| Expected | Chủ source và thời điểm có fact thật, để chạy `REAL_API_E2E_RECEIPT` cho nhánh PUBLISHED |
| Đề xuất nhỏ nhất | Một dòng trả lời trong README P19 |
| Test khi có | Real-API probe: banner PUBLISHED link đúng attempt/run |
| Fallback đang chạy | PICK_ABSENT + reason (U17) |

### CG-P19-11 — chính sách badge 403 / 404 (F-04), chỉ hỏi

```text
Backend request (@codex) — chỉ hỏi, frontend tự sửa được
- Endpoint/field cần: xác nhận F-04 có đòi badge/state giống hệt cho 403 và 404 không
- Lý do UI: 404 được trả cả khi user không phải member workspace; S10 in cùng câu trung tính cho 403 và 404, nhưng state khác nhau (403 denied "⊘ DENIED", 404 empty "∅ EMPTY") theo tiền lệ S09
- Ảnh hưởng hiện tại: người xem vẫn phân biệt được 403 với 404 qua badge
- Đề xuất schema: không
```

| Mục | Nội dung |
|---|---|
| Locator | `lineageClient.ts` dòng 115–171 (`LINEAGE_NEUTRAL_REFUSAL` cho 403 và 404; 404 → empty); `lineage.error.ts` `RESEARCH_LINEAGE_FORBIDDEN` (403, declared), `RESEARCH_LINEAGE_NOT_FOUND` (404) |
| Actual | Câu giống nhau, badge khác nhau |
| Expected | Một quy tắc chung cho Research (S09 và S10 đang dùng chung tiền lệ) |
| Đề xuất nhỏ nhất | Codex/Bobby trả lời; nếu cần giống hệt thì frontend map 404 → denied ở cả S09 và S10 |
| Test khi có | U31 assert state |
| Fallback đang chạy | Như trên (B3) |

### CG-P19-12 — telemetry spec 10 §12

```text
Backend request (@codex)
- Endpoint/field cần: sink/contract cho lineage_view, lineage_probe_toggle, lineage_pick_click, lineage_untried_click, lineage_chip_nav — hoặc xác nhận telemetry Research chưa có
- Lý do UI: spec 10 §12 liệt kê 5 event; nhánh không có sink telemetry nào đã publish
- Ảnh hưởng hiện tại: chưa phát event
- Đề xuất schema: dùng sink chung nếu có
```

| Mục | Nội dung |
|---|---|
| Locator | spec 10 §12; không có operation telemetry trong contract Research |
| Actual | Không có sink |
| Expected | Sink đã publish, hoặc xác nhận chưa có |
| Đề xuất nhỏ nhất | Xác nhận |
| Test khi có | Unit assert event |
| Fallback đang chạy | Không phát (ghi `not_run`) |

## 2. Không có hàng source-capability riêng

P19 không có `source-capability-matrix.md`. Các absence nguồn (promotion pick, historical semantic diff, exposure fact, active version, bounded graph/child) đều đã có reason code `P19_*` trong contract và được in nguyên văn. Frontend không cấp ID mới cho chúng ngoài `CG-P19-*` ở trên.

## 3. Việc Bobby quyết (không phải backend)

| # | Việc | Lý do | Đề xuất |
|---|---|---|---|
| B1 | Tích hợp baseline `9060a7c4` (nay `62d7d864`) | File S10 không trùng với baseline (cả 10 file giống nhau giữa `9060a7c4` và `62d7d864`). `62d7d864` đổi `research-alpha-import.d.ts` (thêm field required `check`, `note`, `expires_at_utc_ms`), ảnh hưởng AlphaImport khi tích hợp. Xung đột `FreezeDetail.tsx` của P17 vẫn còn | Bobby merge/rebase hoặc cho phép Thanhvuong làm; chạy lại toàn bộ unit và 119 probe |
| B2 | `VISUAL_DECISION_REQUIRED` | storied/probe (toggle → expand-all); rc/cert/OOS/decay; chip cuộn trong band vs wrap; rail chấm vs thụt DFS; thứ tự band theo server vs ACTIVE-first (T01) | Giữ như hiện tại đến khi có `CG-P19-03…05`; rail chấm có thể làm theo hi-fi nếu Bobby muốn |
| B3 | F-04 badge 403 ≠ 404 | Câu giống nhau, badge khác nhau (`CG-P19-11`) | Chốt chung cho S09 và S10 |
| B4 | axe | axe-core không có trong lock | Như P16–P18 |
| B5 | Poll legacy `GET /api/runs` 4 s trong `QuantBTModule.tsx` (dòng 231) chạy trên mọi route, kể cả S10 | Ngoài S10 | `fix/*` riêng nếu cần |
| B6 | Flake `PortalShell.test.tsx` và `tradeReplayEvents.test.tsx` | Ngoài diff; vòng này full chạy 1 lần là pass | `fix/*` riêng nếu cần |

## 4. Trạng thái

| ID | Chủ | Trạng thái 2026-09-24 (baseline `9060a7c4` / `62d7d864`) |
|---|---|---|
| CG-P19-01 | Codex | OPEN |
| CG-P19-02 | Codex | OPEN |
| CG-P19-03 | Codex | OPEN (kèm B2) |
| CG-P19-04 | Codex | OPEN (kèm B2) |
| CG-P19-05 | Codex | OPEN (kèm B2) |
| CG-P19-06 | Codex | OPEN |
| CG-P19-07 | Codex | OPEN |
| CG-P19-08 | Codex | OPEN |
| CG-P19-09 | Codex | OPEN |
| CG-P19-10 | Codex | OPEN (chặn exit gate DR-03) |
| CG-P19-11 | Codex / Bobby | OPEN (chỉ hỏi, kèm B3) |
| CG-P19-12 | Codex | OPEN |
| B1–B6 | Bobby | Chờ quyết |
