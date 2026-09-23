# P18 — Thanhvuong backend request receipt (Screen 09)

Receipt riêng cho mọi việc S09 cần từ backend (@codex) và từ Bobby. Receipt
chính: [thanhvuong-frontend-receipt.md](./thanhvuong-frontend-receipt.md).
Evidence máy đọc được: [thanhvuong-test-results.json](./thanhvuong-test-results.json),
[thanhvuong-debt-register.json](./thanhvuong-debt-register.json).

**Ngày kiểm lại:** 2026-09-23. Kiểm trên nhánh `feat/thanhvuong/research-p17-p21`
(`aea76f69`, kiểm lại ở `47165016`) và trên baseline `primus-origin/docs/research-loop-plan` = `e39bacfa`
(CLAUDE.md §7.6, §7.9). Lúc đóng packet baseline đã tiến tới `6a87f77b`; kiểm
lại ở đó cho cùng kết quả.

- `git diff e39bacfa HEAD --stat -- packages/contracts/openapi/research-report.openapi.json packages/contracts/generated/research-report.d.ts`
  rỗng (với `6a87f77b` cũng rỗng). Contract `version 1.0.0`, SHA-256
  `7faa3c5dcf644024…`.
- `git ls-tree -r <ref> --name-only | grep -i "fixtures.*report"` exit 1 ở
  `e39bacfa`, `6a87f77b` và `HEAD`: chưa có fixture report ở bên nào.
- Commit `e39bacfa..6a87f77b` (preview RF-02, worker idle fix, auto-login
  preview) không chạm report. Lane preview RF-02 không bật `FEATURE_RESEARCH_REPORTS`.

**Cả mười một `CG-P18-*` vẫn mở.** Số `01…09` giữ như báo cáo code (gói A);
`10` thêm từ receipt browser (gói B, N3); `11` thêm ở audit 2026-09-23 (spec
identity §16.3 / T05 chưa có request).

**Kiểm lại lần hai (audit 2026-09-23):** baseline đã tiến tới `361f68b4`.
`git diff --stat 361f68b4 47165016 -- packages/contracts/openapi/research-report.openapi.json packages/contracts/generated/research-report.d.ts`
rỗng; `git ls-tree -r 361f68b4 --name-only | grep -i "fixtures.*report"` exit 1.
Mọi claim "actual" đã đối chiếu lại với `research-report.d.ts`: GET report khai
200/304/400/401/403/404/503 (không 409); status GET không 409; download có 409;
`ReportFact` không key/label; `Promotion.state` hằng `NOT_PUBLISHED`;
`Provenance.verdict_rule_revision` hằng; `Stage.state` PENDING/RUNNING/DONE;
`FoldRow` 4 field; `Artifact` không filename. Không request nào thừa.

Luật ghi (handoff campaign `THANHVUONG_P17_P21_FRONTEND_HANDOFF.md` + CLAUDE.md
§5): mỗi request có locator, actual, expected, đề xuất nhỏ nhất an toàn, test
cần có, fallback đang chạy. Đề xuất chỉ là đề xuất; Codex quyết. Frontend không
sửa backend, contract hay runtime để màn hình xanh.

## 1. `CG-P18-*` — khoảng trống phía consumer

### CG-P18-01 — key và label cho claim passport

```text
Backend request
- Endpoint/field cần: researchReportDetailGetV1 → frozen_core.passport[].key + .label
- Lý do UI: hi-fi/spec in passport dạng "key — value"; ReportFact chỉ có state/text/reason_code/availability
- Ảnh hưởng hiện tại: /research/quantbt/runs/:runId/report khối passport in "fact n — value"
- Đề xuất schema: ReportFact += { key: enum(6), label: string } — additive
```

| Mục | Nội dung |
|---|---|
| Locator | `research-report.openapi.json` `ReportFact`; `report.service.ts` thứ tự passport (reason `P18_SOURCE_ADAPTER…`, `P18_ENGINE_VERSION…`, `P18_INPUT_SCOPE…`, `P18_SPLIT_PROTOCOL…`, `P18_SOURCE_PROFILE…`, `P18_INTEGRITY_NOT_PUBLISHED`) |
| Actual | Mảng 6 phần tử không tên. Frontend không được suy tên từ vị trí hay từ reason code |
| Expected | Mỗi fact mang `key` ổn định và `label` in được |
| Đề xuất nhỏ nhất | Thêm `key` (enum 6 giá trị) + `label` vào `ReportFact`, giữ nguyên thứ tự |
| Test khi có | U05 assert label theo contract; browser: passport in "label — value" |
| Fallback đang chạy | "fact n — value" + chú thích vì sao không có tên |

### CG-P18-02 — certification grade

```text
Backend request
- Endpoint/field cần: certification grade/box cho report (hoặc xác nhận không bao giờ có ở P18)
- Lý do UI: hi-fi đặt box grade "B" ở góc phải header
- Ảnh hưởng hiện tại: [data-cert] in "not published · not a field of the report contract"
- Đề xuất schema: frozen_core.certification = { state, grade|null, reason_code } — additive
```

| Mục | Nội dung |
|---|---|
| Locator | `FrozenCore` (không có field certification); `ReportDetail.tsx` `[data-cert]` |
| Actual | Không có field |
| Expected | Grade có nguồn (min of caps) hoặc câu xác nhận S09 không in grade |
| Đề xuất nhỏ nhất | Codex xác nhận "không có ở P18" → Bobby quyết bỏ box (B2); hoặc field additive |
| Test khi có | U02/U30 theo field |
| Fallback đang chạy | Box giữ vị trí, typed absence |

### CG-P18-03 — title theo run (strategy · symbol · timeframe)

```text
Backend request
- Endpoint/field cần: tên strategy cho title; symbol/timeframe đã có ở identity
- Lý do UI: hi-fi title "R-WFO-118 — mom_breakout_v3 on BTCUSDT · 4h"
- Ảnh hưởng hiện tại: title cố định "QuantBT Run Report"
- Đề xuất schema: identity += strategy_id (label "Strategy") hoặc report.title — additive
```

| Mục | Nội dung |
|---|---|
| Locator | `IdentityField` keys (run_id, source_adapter, engine_version, input_scope, dataset_id, symbol, timeframe, 5 revision) |
| Actual | Không có strategy id/tên |
| Expected | Một field strategy để ghép title không phải đoán |
| Đề xuất nhỏ nhất | Thêm identity `strategy_id` |
| Test khi có | U03 assert title |
| Fallback đang chạy | Title cố định, `VISUAL_DECISION_REQUIRED` (B2) |

### CG-P18-04 — cột per-fold (params / IS / OOS / Δ decay / contribution)

```text
Backend request
- Endpoint/field cần: FoldRow += params, is_metric, oos_metric, decay, contribution
- Lý do UI: hi-fi bảng fold 8 cột; FoldRow chỉ có fold_id/start/end/verdict
- Ảnh hưởng hiện tại: bảng 3 cột + caption nêu cột thiếu
- Đề xuất schema: ExactDecimal|null + availability cho từng cột — additive
```

| Mục | Nội dung |
|---|---|
| Locator | `FoldRow`; `Folds.reason_code` `P04_SOURCE_DID_NOT_PUBLISH_PER_FOLD_REPORT_ROWS` |
| Actual | 4 field mỗi hàng |
| Expected | Cột số per-fold có scope, chuỗi decimal chính xác |
| Đề xuất nhỏ nhất | Additive từng cột, `null` + reason khi nguồn không publish |
| Test khi có | U07 thêm cột; browser 32-fold (spec T03) cần kèm `CG-P18-09` |
| Fallback đang chạy | 3 cột + caption |

### CG-P18-05 — kết quả từng stage (pass/fail/cap)

```text
Backend request
- Endpoint/field cần: Stage += result (PASS/FAIL/…) + cap/text
- Lý do UI: spec 5 dòng "PASS", hi-fi "min of the caps"; contract chỉ PENDING/RUNNING/DONE
- Ảnh hưởng hiện tại: timeline state + UTC; caption "a state is progress, not a pass"
- Đề xuất schema: Stage.result enum|null + reason_code — additive
```

| Mục | Nội dung |
|---|---|
| Locator | `Stage` schema |
| Actual | Chỉ tiến độ |
| Expected | Kết quả kiểm tra có nguồn, tách với tiến độ |
| Đề xuất nhỏ nhất | `result` nullable |
| Test khi có | U05: không in PASS khi `result=null` |
| Fallback đang chạy | Timeline, không bao giờ in PASS |

### CG-P18-06 — IS equity series

```text
Backend request
- Endpoint/field cần: equity series IS (stitched IS vs OOS như hi-fi)
- Lý do UI: hi-fi vẽ IS và stitched OOS
- Ảnh hưởng hiện tại: SVG chỉ vẽ một series sealed
- Đề xuất schema: frozen_core.equity_is (cùng shape Equity) — additive
```

| Mục | Nội dung |
|---|---|
| Locator | `FrozenCore.equity`; `report.service.ts` chỉ lấy `EQUITY_OOS` |
| Actual | Một series |
| Expected | Series IS cùng quy ước sampling/counts |
| Đề xuất nhỏ nhất | Additive, `NOT_PUBLISHED` khi không có |
| Test khi có | U06 vẽ hai path; caption đếm điểm từng series |
| Fallback đang chạy | Một series, caption nói rõ |

### CG-P18-07 — artifact filename và bytes lấy được

```text
Backend request
- Endpoint/field cần: Artifact += filename; operation tải artifact (khi P04 publish bytes)
- Lý do UI: hi-fi 9 hàng có filename; contract 7 key, digest-only
- Ảnh hưởng hiện tại: bảng key + digest/state + reason, không link
- Đề xuất schema: Artifact.filename string|null — additive; download để sau
```

| Mục | Nội dung |
|---|---|
| Locator | `Artifact` schema; README P18 "every physical artifact is currently NOT_PUBLISHED" |
| Actual | Không filename, không bytes |
| Expected | Filename server-derived; download có auth khi nguồn publish |
| Đề xuất nhỏ nhất | `filename` nullable trước |
| Test khi có | U05 in filename; không link khi chưa có operation |
| Fallback đang chạy | Label + digest/state, không download giả |

### CG-P18-08 — caption "params handoff at each boundary"

```text
Backend request
- Endpoint/field cần: params theo fold/boundary (gộp được vào CG-P18-04)
- Lý do UI: hi-fi/spec §2.6 caption "params handoff at each boundary"
- Ảnh hưởng hiện tại: caption equity chỉ in trạng thái/reason của folds
- Đề xuất schema: không field riêng; dùng FoldRow.params của CG-P18-04
```

| Mục | Nội dung |
|---|---|
| Locator | hi-fi caption equity; `FoldRow` |
| Actual | Không có fact params theo boundary |
| Expected | Params theo fold (cùng `CG-P18-04`) để caption có nguồn |
| Đề xuất nhỏ nhất | Gộp vào `CG-P18-04`, không cần field riêng |
| Test khi có | Caption boundary in params |
| Fallback đang chạy | Caption boundary in reason folds |

### CG-P18-09 — fixture canonical P18

```text
Backend request
- Endpoint/field cần: fixture versioned cho researchReportDetailGetV1 + ExportJob
- Lý do UI: CLAUDE.md §7.8 — test phải nạp fixture đã publish, không tự dựng object
- Ảnh hưởng hiện tại: test S09 + probe stub theo shape report.service.ts
- Đề xuất schema: không đổi schema; chỉ thêm file fixture
```

| Mục | Nội dung |
|---|---|
| Locator | `packages/contracts/` (không có fixture report); `apps/control-api/test/research-report.service.spec.ts`; `apps/portal/registry/fixtures/` |
| Actual | Không fixture. `reportDetail.test.tsx` và probe dựng body từ `report.service.ts` + spec |
| Expected | Fixture: fixed profile hiện tại (mọi artifact NOT_PUBLISHED), partial, equity `EXTREMA_BUCKET_V1`, folds 32 hàng (spec T03), ExportJob QUEUED/RUNNING/READY/FAILED, Problem 400/401/403/404/409/503 |
| Đề xuất nhỏ nhất | Xuất các body service spec đang assert ra `packages/contracts/fixtures/research-report.*.valid.json` |
| Test khi có | Test S09 + probe nạp fixture; spec T03/T04 chạy được; test fixture ↔ OpenAPI |
| Fallback đang chạy | Stub theo shape service, ghi rõ trong đầu file test |

### CG-P18-10 — 409 trên GET report chưa khai trong OpenAPI

```text
Backend request
- Endpoint/field cần: xác nhận GET /api/v1/quantbt/runs/{runId}/report có trả 409 không
- Lý do UI: client map 409 → stale "not sealed yet"; OpenAPI không liệt kê 409 cho GET
- Ảnh hưởng hiện tại: mapping phòng thủ; run chưa seal hiện ra 404 "empty"
- Đề xuất schema: hoặc thêm 409 vào responses GET, hoặc ghi rõ "chưa seal = 404"
```

| Mục | Nội dung |
|---|---|
| Locator | `research-report.openapi.json` GET responses 200/304/400/401/403/404/503; `report.service.ts` `read()` → 404 `RESEARCH_REPORT_NOT_FOUND`; `report.error.ts` có `RESEARCH_REPORT_NOT_READY` 409 (materialize, export create) |
| Actual | GET không khai 409; code đọc trả 404 khi chưa có report. Status GET cũng không khai 409 |
| Expected | Contract và code nói cùng một điều |
| Đề xuất nhỏ nhất | Một dòng trong OpenAPI (thêm 409 hoặc description "unsealed → 404") |
| Test khi có | U15 theo xác nhận; nếu không bao giờ 409 thì bỏ nhánh |
| Fallback đang chạy | 409 → stale; 404 → empty trung tính (F-04) |

### CG-P18-11 — identity theo spec §16.3 và binding cho biến thể scratch (thêm ở audit 2026-09-23)

```text
Backend request
- Endpoint/field cần: researchReportDetailGetV1 → frozen_core.identity thêm alpha, alpha_version (+ binding PUBLISHABLE/scratch), protocol, route, runtime authority, optimization, selected params, random seed; hoặc xác nhận P18 không bao giờ có
- Lý do UI: spec 09 §2.4/§16.3 có 12 nhãn identity; spec T05/§10 cần "scratch — NOT_PUBLISHABLE" và câu promotion scratch
- Ảnh hưởng hiện tại: identity in 12 hàng của service (run_id, source_adapter, engine_version, input_scope, dataset_id, symbol, timeframe, 5 revision); spec T05 không làm được
- Đề xuất schema: IdentityField thêm các key trên với value null + availability NOT_PUBLISHED khi nguồn không có — additive
```

| Mục | Nội dung |
|---|---|
| Locator | `report.service.ts` `buildCore` `identity: [...]` (12 key trên); `IdentityField` key là `string` tự do; spec 09 §16.3, §10, T05 |
| Actual | Không có alpha/alpha_version/binding/protocol/route/runtime authority/optimization/selected params/seed. `config digest` gần nhất là `source_digests.requested_spec_digest`/`effective_spec_digest` (đang in ở provenance) |
| Expected | Hoặc các key có mặt (value hoặc typed absence), hoặc Codex xác nhận vắng thật để spec T05 được ghi `NOT_APPLICABLE_PROVEN` |
| Đề xuất nhỏ nhất | Thêm key với `availability NOT_PUBLISHED` + reason; không cần đổi schema (key là string) |
| Test khi có | U05 assert thứ tự key; biến thể scratch (spec T05) khi có fixture `CG-P18-09` |
| Fallback đang chạy | In đúng 12 identity service cấp; `CG-P18-03` (strategy) là một phần của request này |

## 2. Không có hàng source-capability riêng

P18 không có `source-capability-matrix.md`. Các absence nguồn (per-fold rows,
audited fills, selection trace, artifact bytes, promotion approval,
execution-state replay) đã có reason code trong contract và được in nguyên
văn; frontend không cấp ID mới cho chúng ngoài `CG-P18-*` ở trên.

## 3. Việc Bobby quyết (không phải backend)

| # | Việc | Lý do | Đề xuất |
|---|---|---|---|
| B1 | Tích hợp baseline `e39bacfa` (nay `6a87f77b`) | File P18 cũng đổi trên baseline: chỉ `EvidenceFlow.tsx` (`git diff --name-only 30fb9f21 e39bacfa -- apps/portal/frontend` ∩ diff P18); `git merge-file` ba bản: 0 xung đột. `QuantBTModule.tsx`, `tsconfig.json`, `researchBoundary.test.ts`: 0 xung đột. Xung đột `FreezeDetail.tsx` của P17 vẫn còn | Bobby merge/rebase hoặc cho phép Thanhvuong làm; S09 chuyển `toReportRefusal` → `toResearchRefusal` + `RefusalNote`, thêm `RESEARCH_REPORT_*` vào `SURFACE_CODES`; chạy lại toàn bộ test + 128 probe |
| B2 | `VISUAL_DECISION_REQUIRED`: tiêu đề S09 + badge certification | hi-fi theo run + grade "B"; contract không có field | Giữ "QuantBT Run Report" + box typed absence đến khi có `CG-P18-02/03` |
| B3 | axe | axe-core không có trong lock | như P16/P17 |
| B4 | PDF Letter/A4 làm PR artifact | PDF không commit được (A4.1) | Đính kèm `p18-print-letter.pdf` `74a52a0347d9f02c`, `p18-print-a4.pdf` `0ae364b761bf4d15` khi mở PR |
| B5 | Flake `PortalShell.test.tsx` ngoài diff | fail gián đoạn khi chạy full, pass khi chạy riêng (P16/P17/P18) | `fix/*` riêng nếu cần |
| B6 | 401 → màn session-expired | S09 chỉ hiện copy; màn session-expired thuộc U07 | để U07 |

## 4. Trạng thái

| ID | Chủ | Trạng thái 2026-09-23 |
|---|---|---|
| CG-P18-01 | Codex | OPEN |
| CG-P18-02 | Codex | OPEN (kèm B2) |
| CG-P18-03 | Codex | OPEN (kèm B2) |
| CG-P18-04 | Codex | OPEN |
| CG-P18-05 | Codex | OPEN |
| CG-P18-06 | Codex | OPEN |
| CG-P18-07 | Codex | OPEN |
| CG-P18-08 | Codex | OPEN (gộp được vào 04) |
| CG-P18-09 | Codex | OPEN |
| CG-P18-10 | Codex | OPEN |
| CG-P18-11 | Codex | OPEN (thêm ở audit 2026-09-23) |
| B1–B6 | Bobby | chờ quyết |
