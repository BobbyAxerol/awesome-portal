# FG slice 1 — Backend requests (CG-FG-*) cho Codex

**Người yêu cầu:** Thanhvuong (frontend, gói FG) · **Owner mọi packet:** Codex (backend/contract) · **State mọi packet:** OPEN · **Ngày:** 2026-09-28 · **Candidate:** `feat/gap_frontend_thanhvuong` @ `8783461e`. **Cập nhật slice 2 (2026-09-29):** thêm `CG-FG-R2-01` (§7) và đính chính mô tả fail `r2Ledger` (§8).

Nguồn: `FG-01-screen-audit-matrix.md` (ma trận hợp nhất của A1/A2/A3) và audit A1/A2/A3/A6 (authoritative khi khác báo cáo agent). Mỗi packet theo template Backend request của `CLAUDE.md` §5, kèm source locator, fallback FE hôm nay và exit gate. Thanhvuong không sửa OpenAPI, service, migration hay `packages/contracts/**`; field nào chưa có thì màn giữ typed absence có reason, không hiện `0`/`-`/`N/A`, không suy từ id, thứ tự hay cache trình duyệt. Tên field trong ô "Đề xuất schema" chỉ là đề xuất — Codex quyết hình dạng.

Viết tắt locator: `R/` = `apps/portal/frontend/src/research/`; `*.d.ts` = `packages/contracts/generated/`. Các viết tắt file giữ đúng như ma trận FG-01 §1 (CS = `research-current-source.d.ts`, RSd = `research-search.d.ts`, RPd = `research-replay.d.ts`, LD = `LineageDetail.tsx`, RCD = `ReleaseCandidateDetail.tsx`, AI = `AlphaImport.tsx`, CO = `upgrade/research_loop/evidence/P22/frontend-handoff-codex-closeout.md`, GEN = `research-release-candidate-publication.d.ts`).

## 1. Bảng tổng hợp

| Id | Màn | Field cần | Hàng ma trận | Ghi chú |
|---|---|---|---|---|
| `CG-FG-D1-O1` | S09 · S11 · S13 | `display_label` trên report / compose+pack / compare read | 09-01, 11-01, 13-04 | gộp `CG-FG-S09-01`, `CG-FG-S11-01`, `CG-FG-S13-01` (audit A2, A3) |
| `CG-FG-P22-01` | S11 | `Problem.error.details.downstream_code` hoặc sửa câu CO:39 | A6 G10 | A6 §4, discrepancy D2 |
| `CG-FG-S02-01` | S02 | cert ceiling theo mode × schedule trên atlas/foundation read | 02-10 |  |
| `CG-FG-S02-02` | S02 | số bar theo cửa sổ IS/OOS/holdout từ dataset coverage | 02-10 |  |
| `CG-FG-S03-01` | S03 | danh sách fold dự kiến + tổng trên ProgressSnapshot | 03-G |  |
| `CG-FG-S03-02` | S03 | 4 methodology claim (dự báo rồi phát hành) trên progress read | 03-2 |  |
| `CG-FG-S03-03` | S03 | tổng study/trial ("study N of M") | 03-2 |  |
| `CG-FG-S03-04` | S03 | artifact manifest theo run (7 dòng, holdout DENIED) | 03-5 |  |
| `CG-FG-S04-01` | S04 | 7 field claim strip (VALIDATION, CHRONOLOGICAL, OOS_USED_FOR_SELECTION, HOLDOUT_STATE, CAUSALITY, EXECUTION_CONTRACT, RUNTIME_AUTHORITY) | 04-1 |  |
| `CG-FG-S04-02` | S04 | dataset coverage bar, gaps, columns | 04-DS |  |
| `CG-FG-S04-03` | S04 | series link `EQUITY_IS` | 04-EQ |  |
| `CG-FG-S04-04` | S04 | per-fold metrics | 04-PF |  |
| `CG-FG-S04-05` | S04 | benchmark, rolling Sharpe/beta, return distribution, behaviour analytics | 04-BH |  |
| `CG-FG-S04-06` | S04 | cert cap theo từng stage | 04-CC |  |
| `CG-FG-S04-07` | S04 | số đếm window disclosure | 04-WD |  |
| `CG-FG-S05-01` | S05 | `SplitGuards.train_test_disjoint` (verdict + basis) | 05-16 (+ FE 05-15) |  |
| `CG-FG-S06-01` | S06 | `search_contract.selector_confidence` (CONFIRMED/INFERRED) | 06-02 |  |
| `CG-FG-S06-02` | S06 | `Parameter.levels` trên DTO P04/research-search | 06-03 |  |
| `CG-FG-S06-03` | S06 | `surface.grid` (mean IS objective 2-D theo ô) | 06-05 |  |
| `CG-FG-S06-04` | S06 | publish `surface.interactions` (đang ghim NOT_PUBLISHED) | 06-06 |  |
| `CG-FG-S06-05` | S06 | `pool.frozen_at_utc_ms` | 06-07 |  |
| `CG-FG-S06-06` | S06 | `Trial.seed`, `Trial.params_digest` | 06-08 |  |
| `CG-FG-S08-01` | S08 | `FoldSegment.params_digest` | 08-11 |  |
| `CG-FG-S08-02` | S08 | `candle_windows` per-bar cho replay P04 | 08-12 |  |
| `CG-FG-S08-03` | S08 | `execution.counts` cho replay P04 | 08-13 |  |
| `CG-FG-S09-02` | S09 | `EquityV2.digest` + artifact path | 09-11 |  |
| `CG-FG-S10-01` | S10 | `PromotionPick.param_set_id` / `selected_trial_id` trên lineage pick | 10-12 |  |
| `CG-FG-S10-02` | S10 | `AttemptNode.lineage_status` + `superseded_by_attempt_id` | 10-14, 10-19 |  |
| `CG-FG-S10-03` | S10 | `RunFacts.claim.family` trên lineage projection | 10-18 |  |
| `CG-FG-S10-04` | S10 | (có điều kiện) `alpha.default_market/default_timeframe`; `counts.promotion_*` | 10-01, 10-23 | có điều kiện — chờ owner decision |
| `CG-FG-S11-02` | S11 | `selected_params.param_set_id` + `selected_trial_number` trên compose/pack | 11-07 |  |
| `CG-FG-S11-03` | S11 | (Bobby trước) `PackResponse.claim_ceiling/engine_cert/counts` | 11-29 | có điều kiện — chờ owner decision |
| `CG-FG-S12-01` | S12 | contract fixture atlas `HISTORICAL` (`atlas: null` + `historical_identity`) | 12-12 |  |
| `CG-FG-S12-02` | S12 | từ vựng `CandidateSelector.mode` khớp mode của atlas | 12-19 |  |
| `CG-FG-S13-02` | S13 | certification grade trên compare | 13-05 |  |
| `CG-FG-S14-01` | S14 | tên CSRF header trong contract | 14-25 |  |
| `CG-FG-S14-02` | S14 | mã `may_activate_reason` | 14-11 |  |
| `CG-FG-S14-03` | S14 | fact run-admission theo version (`may_create_run` / execution binding) | 14-12 |  |
| `CG-FG-S14-04` | S14 | `total` / cursor cho registry list | 14-16 |  |
| `CG-FG-R2-01` | — (unit gate, không phải màn) | evidence của route `INTENTIONALLY_UNEXPOSED` `POST /internal/research/progress/sources/imported` trong R2 capability inventory phải nêu lý do (hoặc nới regex của test) | — | slice 2 (2026-09-29); owner codex; §7 |
| `CG-FG-S09-01` | S09 | — | 09-01 | gộp vào `CG-FG-D1-O1` |
| `CG-FG-S11-01` | S11 | — | 11-01 | gộp vào `CG-FG-D1-O1` |
| `CG-FG-S13-01` | S13 | — | 13-04 | gộp vào `CG-FG-D1-O1` |

Tổng: 39 packet mở (1 gộp D1-O1 + 1 P22 + 37 theo màn, trong đó 2 có điều kiện) và 3 id đã gộp.

Slice 2 (2026-09-29): +1 packet `CG-FG-R2-01` (§7) → 40 packet mở, vẫn 3 id đã gộp.

## 2. CG-FG-D1-O1 — `display_label` trên ba named read (S09 / S11 / S13)

**Codex backend checkpoint 2026-09-29 — SOURCE/CONTRACT READY, real-API và FE receipt còn mở.** Report detail, Release Candidate compose/pack và mọi Compare run nay trả `display_label: string | null` theo cùng `runDisplayLabel`/`runDisplayOrdinalSql` của Library/Progress/Evidence. Chỉ run PRIMARY có profile đã biết mới có nhãn; run lịch sử/child/profile lạ trả `null`, không đoán từ ID hay browser cache. OpenAPI và ba generated type đã cập nhật; hai fixture FE chỉ thêm `null`, không đổi UI. Report ETag nay bám đúng representation (kể cả nhãn và approval annotation), còn `report_revision`, `frozen_core`, RC fingerprint/pack digest không đổi.

**Test scope:** Control API build; 58/58 focused Report/RC/Compare tests; 196/196 contract tests; 187/187 focused FE tests; FE typecheck; fixture comparison xác nhận frozen core/revision nguyên byte-semantic. Disposable PostgreSQL migration/read suite sẽ chạy trong commit hook đúng test cell; lệnh Vitest trực tiếp trên host không có PostgreSQL ở `127.0.0.1:5432` và không được tính là PASS. P23 cell vẫn là image trước commit: cần real-API GET cho một WFO và một P04, rồi Thanhvuong bind 3 deep link từ chính named read + browser receipt. Không ghi `CLOSED` trước các receipt đó.

**Codex addendum sau commit `08fa8ee0`:** full hook qua (Control API 1338 pass, 1 skip; contracts 196 pass). Trong P23 cell cô lập đã rebuild từ commit sạch, named real-API GET trả 200 và nhãn canonical cho WFO `rrun_60d8225bff3da70df696c5abd2c6d784` (`R-WFO-075`) và fixed P04 `rrun_d8e174e6268aedbf868de56edd062b29` (`R-P04-001`) ở Report/RC compose; Compare attempts cũng có cả hai nhãn; sealed RC pack có `R-WFO-011`. Không tạo pack/run mới cho phép thử này. **Backend + real-API subset DELIVERED; FE cold deep-link binding/browser receipt S09/S11/S13 còn mở**, nên không đánh dấu toàn packet CLOSED. Nội dung checkpoint trước addendum là trạng thái tại thời điểm ghi, không phải kết quả cuối.
**FE data-binding addendum:** Report/RC/Compare named-read clients now record the published label; S09/S11/S13 consume it with short-ID fallback. Focused tests 204/203 and typecheck pass. [Detailed receipt](./D1_O1_CLIENT_BINDING_2026-09-29.md). This is code/unit evidence, not the cold real-browser receipt.


Toàn văn lấy từ `~/tv-shots/fg/plan/CG-FG-D1-O1.draft.md` (không đổi nội dung):

**Owner:** Codex (backend/contract) · **Người yêu cầu:** Thanhvuong (FG-06) · **State:** OPEN · **Ngày:** 2026-09-28 · **Candidate:** `feat/gap_frontend_thanhvuong` @ `8783461e`.
Thanhvuong không sửa OpenAPI/service/migration; không ghép `R-WFO-###` từ id, thứ tự hay cache trình duyệt.

```text
Backend request
- Endpoint/field cần: thêm field additive `display_label: string | null` (cùng định nghĩa D1 như các read đã có) vào identity của run trong:
    1. `researchReportDetailGetV1`            — packages/contracts/openapi/research-report.openapi.json → generated research-report.d.ts:18 (operation), run identity :526/:544 (`run_id`), kèm `final_audit_run_id`/`audited_run_id` :451–452 nếu màn in nhãn cho các run đó.
    2. `researchReleaseCandidateComposeGetV1` và `researchReleaseCandidatePackGetV1` — research-release-candidate.openapi.json → generated research-release-candidate.d.ts:18/:78, run identity :165/:239/:313/:327.
    3. `researchCompareGetV1`                 — research-compare.openapi.json → generated research-compare.d.ts:18/:345, mỗi attempt/market/pair row có `run_id` :76/:118/:136.
- Lý do UI: mở trực tiếp 3 URL sau hard refresh phải thấy cùng nhãn server như Library/Progress/Evidence/Lineage mà không cần ghé Library trước.
- Ảnh hưởng hiện tại: S09 dùng `ShortId` (ReportDetail.tsx:486, :1176) — chỉ có nhãn khi cache `runLabels.ts:54–108` đã được S01/S03/S04/S10 nạp trong cùng phiên trang; S11 (`shortId()` ReleaseCandidateDetail.tsx:561, :701–709, :2047) và S13 (`sid()` CompareDetail.tsx:93–95, :1491) không bao giờ hiện nhãn. Deep link lạnh: cả ba in short id (typed, an toàn).
- Đề xuất schema (chỉ đề xuất — Codex quyết): dùng đúng rule đã publish ở `research-attempt-lineage.d.ts:217–218` ("execution profile kind + vị trí trong các logical run cùng kind của workspace, theo thứ tự tạo; lấy từ Run Library row; presentation only; `null` khi không suy được") để bốn read hiện có và ba read mới không thể lệch nhau.
```

| Mục | Nội dung |
|---|---|
| Source locator hiện có (đã publish) | `research-attempt-lineage.d.ts:218`, `research-evidence.d.ts:215`, `research-progress.d.ts:539`, `research-run-library.d.ts:122` |
| Generated type/test cần khi giao | regenerate `packages/contracts/generated/research-{report,release-candidate,compare}.d.ts`; contract test + snapshot; ví dụ thật (một run WFO, một run P04) trong fixtures |
| Việc FE sau khi backend giao | regenerate client; S09/S11/S13 in `display_label` từ chính read của màn; `null` → short id như hiện tại; test deep link lạnh 3 URL |
| Fallback trước contract | typed absence: short id, không nhãn; không đọc cache để "điền hộ" trên S11/S13 |
| Exit gate | Codex: commit + receipt contract; Thanhvuong: `PRODUCT_ROUTE_BROWSER_RECEIPT` 3 deep link sau hard refresh (fixture) + `REAL_API_E2E_RECEIPT` khi có cell. Thanhvuong không tự ghi CLOSED |

## 3. CG-FG-P22-01 — `details.downstream_code` không có trong `Problem` đã sinh

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: hoặc thêm `details.downstream_code` vào `Problem` của ba operation P22 (researchReleaseCandidatePublicationGetV1, researchReleaseCandidatePublishV1, researchAlphaVersionPublicationGetV1), hoặc sửa câu CO:39 cho khớp contract thật (`downstream_code` ở top-level `PublicationResponse`, GEN:176).
- Lý do UI: CO:39 bảo FE giữ `details.downstream_code`; `Problem` đã sinh (GEN:209–215) không có `details`, nên FE không thể làm đúng câu chữ. FG-05 in `downstream_code` từ top-level PublicationResponse.
- Ảnh hưởng hiện tại: S11 publish / unknown-outcome / published / pack-ghost card (`PublicationConflict`, FG-05) in id conflict + `downstream_code` top-level; lỗi refusal không có downstream code.
- Đề xuất schema (chỉ đề xuất — codex quyết): ưu tiên sửa câu CO:39 nếu top-level là thiết kế đúng; nếu refusal cũng cần mã downstream thì thêm `details: { downstream_code?: string }` vào Problem.
```

| Mục | Nội dung |
|---|---|
| Source locator | CO:39; GEN:176 (`downstream_code` top-level), GEN:209–215 (`Problem`, không `details`); A6 gap table G10, discrepancy D2 |
| Owner / state | Codex · OPEN |
| Fallback FE hôm nay | FG-05 (commit `f0f7cc3d`; unit lane PASS; `VERIFIED — fixture lane` qua B G5) in `downstream_code` top-level khi có, kèm câu và mã; không đọc `details` |
| Test khi có | unit S11-U55 mở rộng cho nguồn mới; receipt fixture của nhánh hiện tại: B G5 — conflict same-origin là link `/governance/approvals/apr_01J9P22CONFLICT000000001/r1` kèm `data-downstream-code=P22_GOVERNANCE_APPROVAL_CONFLICT`, href foreign thành text `[data-conflicting-approval-unrouted]` (`fgb/s11.json` `fb6b436bdf2c3875`) |
| Exit gate | Codex: commit contract hoặc commit sửa CO:39. Thanhvuong: đổi binding nếu contract đổi, unit + fixture receipt. Không tự ghi CLOSED |

## 4. Packet theo màn

### S02

#### CG-FG-S02-01 — cert ceiling theo mode × schedule trên atlas/foundation read

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: cert ceiling cho từng mode × schedule trên foundation/atlas read (slot `cert_cap` đang là `AtlasNotPublishedFact`)
- Lý do UI: HiFi H02:422 "CERT CEILING C / want B?" ở bước chọn mode
- Ảnh hưởng hiện tại: hàng 02-10 — S02 in "cert ceiling not published" (typed absence kèm reason của fixture)
- Đề xuất schema (chỉ đề xuất — codex quyết): publish giá trị cho slot `cert_cap` đã có (grade + reason) thay vì luôn NOT_PUBLISHED
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | `apps/portal/frontend/src/research/NewRun.tsx:1513`; `packages/contracts/generated/research-foundation.d.ts:191` |
| Audit | audit-A1 (hàng 02-10) |
| Owner / state | Codex · OPEN |
| Fallback FE hôm nay | typed absence `cert ceiling not published` + reason server |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

#### CG-FG-S02-02 — số bar theo cửa sổ IS/OOS/holdout từ dataset coverage

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: số bar của từng cửa sổ IS / OOS / holdout, lấy từ dataset coverage
- Lý do UI: HiFi H02:410 timeline cửa sổ có số bar
- Ảnh hưởng hiện tại: hàng 02-10 — timeline in "not declared → not declared"
- Đề xuất schema (chỉ đề xuất — codex quyết): thêm danh sách `{role, bar_count}` theo cửa sổ vào coverage của dataset read
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | `NewRun.tsx` bước Windows (A1 02-10); dataset read `datasetClient.ts` |
| Audit | audit-A1 (hàng 02-10) |
| Owner / state | Codex · OPEN |
| Fallback FE hôm nay | typed absence "not declared" |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

### S03

#### CG-FG-S03-01 — danh sách fold dự kiến + tổng trên ProgressSnapshot

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: planned fold list và tổng số fold trên `ProgressSnapshot`
- Lý do UI: HiFi H03:130 gantt hiện fold dự kiến
- Ảnh hưởng hiện tại: hàng 03-G — gantt chỉ có 3 fold "reported", không có danh sách dự kiến hay tổng
- Đề xuất schema (chỉ đề xuất — codex quyết): `ProgressSnapshot.planned_folds[]` + `planned_fold_count`
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | `packages/contracts/generated/research-progress.d.ts:162`; RunProgress gantt |
| Audit | audit-A1 (hàng 03-G) |
| Owner / state | Codex · OPEN |
| Fallback FE hôm nay | chỉ vẽ fold đã report |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

#### CG-FG-S03-02 — 4 methodology claim (dự báo rồi phát hành) trên progress read

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: 4 methodology claim (forecast, sau đó issued) trên progress read
- Lý do UI: HiFi H03:431 claim head
- Ảnh hưởng hiện tại: hàng 03-2 — không có claim nào trên màn
- Đề xuất schema (chỉ đề xuất — codex quyết): mảng claim `{kind, state: FORECAST|ISSUED, text}` trên progress
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | `research-progress.d.ts:162`; RunProgress passport |
| Audit | audit-A1 (hàng 03-2) |
| Owner / state | Codex · OPEN |
| Fallback FE hôm nay | không hiển thị khối claim |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

#### CG-FG-S03-03 — tổng study/trial ("study N of M")

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: tổng số study / trial để in "study N of M"
- Lý do UI: HiFi H03 progress head
- Ảnh hưởng hiện tại: hàng 03-2 — in "study 3 / not published"
- Đề xuất schema (chỉ đề xuất — codex quyết): `study_total` (hoặc `trial_total`) trên progress
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | `research-progress.d.ts:162` |
| Audit | audit-A1 (hàng 03-2) |
| Owner / state | Codex · OPEN |
| Fallback FE hôm nay | typed absence "not published" |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

#### CG-FG-S03-04 — artifact manifest theo run (7 dòng, holdout DENIED)

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: artifact manifest theo run (7 dòng, trong đó holdout DENIED)
- Lý do UI: HiFi H03:162 manifest 7 dòng
- Ảnh hưởng hiện tại: hàng 03-5 — chỉ liệt kê artifact của fixture; không có nguồn manifest
- Đề xuất schema (chỉ đề xuất — codex quyết): `artifact_manifest[]` `{kind, state, reason}` trên progress
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | `research-progress.d.ts:200` (chỉ `artifacts`) |
| Audit | audit-A1 (hàng 03-5) |
| Owner / state | Codex · OPEN |
| Fallback FE hôm nay | danh sách artifact hiện có |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

### S04

#### CG-FG-S04-01 — 7 field claim strip (VALIDATION, CHRONOLOGICAL, OOS_USED_FOR_SELECTION, HOLDOUT_STATE, CAUSALITY, EXECUTION_CONTRACT, RUNTIME_AUTHORITY)

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: 7 field claim strip (VALIDATION, CHRONOLOGICAL, OOS_USED_FOR_SELECTION, HOLDOUT_STATE, CAUSALITY, EXECUTION_CONTRACT, RUNTIME_AUTHORITY) trên evidence hub read
- Lý do UI: HiFi H04:108
- Ảnh hưởng hiện tại: hàng 04-1 — S04 7 field in "not published"; claim issued + grade B vẫn hiện
- Đề xuất schema (chỉ đề xuất — codex quyết): additive field trên `research-evidence` (hình dạng do Codex chọn; nếu nguồn không có thì giữ `source_absences` có reason)
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | `EvidenceFlow.tsx:354` `UNPUBLISHED_CLAIM_FIELDS`, claim bar :425–520; `research-evidence.d.ts:265` |
| Audit | audit-A1 (hàng 04-1) |
| Owner / state | Codex · OPEN |
| Fallback FE hôm nay | typed absence có reason |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

#### CG-FG-S04-02 — dataset coverage bar, gaps, columns

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: dataset coverage bar, gaps, columns trên evidence hub read
- Lý do UI: HiFi H04:71
- Ảnh hưởng hiện tại: hàng 04-DS — S04 chỉ có chip dataset, không có coverage
- Đề xuất schema (chỉ đề xuất — codex quyết): additive field trên `research-evidence` (hình dạng do Codex chọn; nếu nguồn không có thì giữ `source_absences` có reason)
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | `EvidenceFlow.tsx:697`; `research-evidence.d.ts:323` `run_identity` |
| Audit | audit-A1 (hàng 04-DS) |
| Owner / state | Codex · OPEN |
| Fallback FE hôm nay | typed absence có reason |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

#### CG-FG-S04-03 — series link `EQUITY_IS`

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: series link `EQUITY_IS` trên evidence hub read
- Lý do UI: HiFi H04:195 (EChart 1 IS + OOS)
- Ảnh hưởng hiện tại: hàng 04-EQ — S04 không có series IS
- Đề xuất schema (chỉ đề xuất — codex quyết): additive field trên `research-evidence` (hình dạng do Codex chọn; nếu nguồn không có thì giữ `source_absences` có reason)
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | `research-evidence.d.ts:287` `SeriesLink` |
| Audit | audit-A1 (hàng 04-EQ) |
| Owner / state | Codex · OPEN |
| Fallback FE hôm nay | typed absence có reason |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

#### CG-FG-S04-04 — per-fold metrics

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: per-fold metrics trên evidence hub read
- Lý do UI: HiFi H04:221 per-fold verdict
- Ảnh hưởng hiện tại: hàng 04-PF — S04 typed absence dưới "declared source absences"
- Đề xuất schema (chỉ đề xuất — codex quyết): additive field trên `research-evidence` (hình dạng do Codex chọn; nếu nguồn không có thì giữ `source_absences` có reason)
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | `research-evidence.d.ts:337` `source_absences.per_fold_metrics` (`P04_CHILD_PUBLISHES_RUN_FINAL_ONLY`) |
| Audit | audit-A1 (hàng 04-PF) |
| Owner / state | Codex · OPEN |
| Fallback FE hôm nay | typed absence có reason |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

#### CG-FG-S04-05 — benchmark, rolling Sharpe/beta, return distribution, behaviour analytics

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: benchmark, rolling Sharpe/beta, return distribution, behaviour analytics trên evidence hub read
- Lý do UI: HiFi H04:269, H04:277
- Ảnh hưởng hiện tại: hàng 04-BH — S04 typed absence
- Đề xuất schema (chỉ đề xuất — codex quyết): additive field trên `research-evidence` (hình dạng do Codex chọn; nếu nguồn không có thì giữ `source_absences` có reason)
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | `EvidenceFlow.tsx:1886–1894`; `research-evidence.d.ts:295` `summary_analytics`; `source_absences.benchmark` |
| Audit | audit-A1 (hàng 04-BH) |
| Owner / state | Codex · OPEN |
| Fallback FE hôm nay | typed absence có reason |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

#### CG-FG-S04-06 — cert cap theo từng stage

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: cert cap theo từng stage trên evidence hub read
- Lý do UI: HiFi H04:723 cert chain
- Ảnh hưởng hiện tại: hàng 04-CC — S04 chỉ có grade
- Đề xuất schema (chỉ đề xuất — codex quyết): additive field trên `research-evidence` (hình dạng do Codex chọn; nếu nguồn không có thì giữ `source_absences` có reason)
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | `EvidenceFlow.tsx:3671`; `research-evidence.d.ts:270` `methodology_certificate` |
| Audit | audit-A1 (hàng 04-CC) |
| Owner / state | Codex · OPEN |
| Fallback FE hôm nay | typed absence có reason |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

#### CG-FG-S04-07 — số đếm window disclosure

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: số đếm window disclosure trên evidence hub read
- Lý do UI: HiFi H04:750
- Ảnh hưởng hiện tại: hàng 04-WD — S04 "headline = OOS only", không có số
- Đề xuất schema (chỉ đề xuất — codex quyết): additive field trên `research-evidence` (hình dạng do Codex chọn; nếu nguồn không có thì giữ `source_absences` có reason)
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | EvidenceFlow window disclosure |
| Audit | audit-A1 (hàng 04-WD) |
| Owner / state | Codex · OPEN |
| Fallback FE hôm nay | typed absence có reason |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

### S05

#### CG-FG-S05-01 — `SplitGuards.train_test_disjoint` (verdict + basis)

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: `SplitGuards.train_test_disjoint` (verdict + basis) trên current-source split
- Lý do UI: HiFi H05:374 dòng "train ∩ test = ∅ (every fold)" ✓; FE không được tự khẳng định
- Ảnh hưởng hiện tại: hàng 05-16 (+ FE 05-15) — FE tự vẽ ✓ khi fold plan sẵn sàng (`SplitDetail.tsx:1873–1875`) — đây là FE_GAP P2 05-15, phải thành typed absence
- Đề xuất schema (chỉ đề xuất — codex quyết): `guards.train_test_disjoint: {verdict: PASS|FAIL, basis}`
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | `SplitDetail.tsx:1873–1875`; `research-current-source.d.ts` guards; `research-split.d.ts` |
| Audit | audit-A2 (hàng 05-16 (+ FE 05-15)) |
| Owner / state | Codex · OPEN |
| Fallback FE hôm nay | (sau khi sửa 05-15) typed absence "not published" |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

### S06

#### CG-FG-S06-01 — `search_contract.selector_confidence` (CONFIRMED/INFERRED)

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: `search_contract.selector_confidence` (CONFIRMED/INFERRED)
- Lý do UI: HiFi H06:70 tag trên `candidate_selection_metric`
- Ảnh hưởng hiện tại: hàng 06-02 — metric hiện không có tag
- Đề xuất schema (chỉ đề xuất — codex quyết): `selector_confidence: CONFIRMED|INFERRED`
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | `SearchDetail.tsx:1998`; CS `search_contract` L518–533 |
| Audit | audit-A2 (hàng 06-02) |
| Owner / state | Codex · OPEN |
| Fallback FE hôm nay | typed absence có reason |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

#### CG-FG-S06-02 — `Parameter.levels` trên DTO P04/research-search

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: `Parameter.levels` trên DTO P04/research-search
- Lý do UI: HiFi H06:139 cột levels A1
- Ảnh hưởng hiện tại: hàng 06-03 — P04: sr-only "levels not published" ×4; WFO có levels
- Đề xuất schema (chỉ đề xuất — codex quyết): `Parameter.levels` như CS L768
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | `SearchDetail.tsx:2186`; RSd `Parameter` L71–83 (CS có `levels` L768) |
| Audit | audit-A2 (hàng 06-03) |
| Owner / state | Codex · OPEN |
| Fallback FE hôm nay | typed absence có reason |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

#### CG-FG-S06-03 — `surface.grid` (mean IS objective 2-D theo ô)

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: `surface.grid` (mean IS objective 2-D theo ô)
- Lý do UI: HiFi H06:268–275 heatmap window × entry_z
- Ảnh hưởng hiện tại: hàng 06-05 — không có gì
- Đề xuất schema (chỉ đề xuất — codex quyết): `surface.grid` `{x_param, y_param, cells[]}`
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | không có grid 2-D trong CS/RSd |
| Audit | audit-A2 (hàng 06-05) |
| Owner / state | Codex · OPEN |
| Fallback FE hôm nay | typed absence có reason |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

#### CG-FG-S06-04 — publish `surface.interactions` (đang ghim NOT_PUBLISHED)

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: publish `surface.interactions` (đang ghim NOT_PUBLISHED)
- Lý do UI: HiFi ma trận |ρ| A6 (H06:249–265)
- Ảnh hưởng hiện tại: hàng 06-06 — EmptyPanel `QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_PARAMETER_INTERACTIONS`
- Đề xuất schema (chỉ đề xuất — codex quyết): publish giá trị cho slot đã có
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | `SearchDetail.tsx:2203–2254`; CS `surface.interactions` L983–987 |
| Audit | audit-A2 (hàng 06-06) |
| Owner / state | Codex · OPEN |
| Fallback FE hôm nay | typed absence có reason |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

#### CG-FG-S06-05 — `pool.frozen_at_utc_ms`

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: `pool.frozen_at_utc_ms`
- Lý do UI: HiFi H06:284/300 "POOL FROZEN … · {time}", `pool_frozen_at`
- Ảnh hưởng hiện tại: hàng 06-07 — dòng freeze không có thời điểm
- Đề xuất schema (chỉ đề xuất — codex quyết): `pool.frozen_at_utc_ms`
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | `SearchDetail.tsx:1642–1703`; CS pool L831/855–868 |
| Audit | audit-A2 (hàng 06-07) |
| Owner / state | Codex · OPEN |
| Fallback FE hôm nay | typed absence có reason |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

#### CG-FG-S06-06 — `Trial.seed`, `Trial.params_digest`

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: `Trial.seed`, `Trial.params_digest`
- Lý do UI: HiFi H06:449 cột seed + digest ở ledger
- Ảnh hưởng hiện tại: hàng 06-08 — "not published" ở cả hai cột
- Đề xuất schema (chỉ đề xuất — codex quyết): `Trial.seed`, `Trial.params_digest`
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | `SearchDetail.tsx:860, 884`; CS `Trial` L365–376 |
| Audit | audit-A2 (hàng 06-08) |
| Owner / state | Codex · OPEN |
| Fallback FE hôm nay | typed absence có reason |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

### S08

#### CG-FG-S08-01 — `FoldSegment.params_digest`

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: `FoldSegment.params_digest`
- Lý do UI: HiFi H08:68–70 / 81–88 `params prm_…` theo fold
- Ảnh hưởng hiện tại: hàng 08-11 — contract strip không có params
- Đề xuất schema (chỉ đề xuất — codex quyết): `FoldSegment.params_digest`
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | `ExecuteCandleReplay.tsx:1112–1113, 377–408`; CS `FoldSegment` L1422–1437 |
| Audit | audit-A2 (hàng 08-11) |
| Owner / state | Codex · OPEN |
| Fallback FE hôm nay | typed absence / không tile |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

#### CG-FG-S08-02 — `candle_windows` per-bar cho replay P04

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: `candle_windows` per-bar cho replay P04
- Lý do UI: HiFi H08:108–112 candle chart (P04)
- Ảnh hưởng hiện tại: hàng 08-12 — "CANDLE WINDOWS not published P04_SOURCE_DID_NOT_PUBLISH_REPLAY_CANDLE_WINDOWS"; vẽ equity samples + overview 48 bucket
- Đề xuất schema (chỉ đề xuất — codex quyết): publish `candle_windows` trên replay P04
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | `ExecuteDetail.tsx:275–387`; RPd `candle_windows` NOT_PUBLISHED |
| Audit | audit-A2 (hàng 08-12) |
| Owner / state | Codex · OPEN |
| Fallback FE hôm nay | typed absence / không tile |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

#### CG-FG-S08-03 — `execution.counts` cho replay P04

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: `execution.counts` cho replay P04
- Lý do UI: HiFi H08:177–187 verdict tiles (P04)
- Ảnh hưởng hiện tại: hàng 08-13 — không có tile trên P04 (WFO có)
- Đề xuất schema (chỉ đề xuất — codex quyết): `execution.counts` như lane WFO
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | RPd không có counts |
| Audit | audit-A2 (hàng 08-13) |
| Owner / state | Codex · OPEN |
| Fallback FE hôm nay | typed absence / không tile |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

### S09

#### CG-FG-S09-02 — `EquityV2.digest` + artifact path

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: `EquityV2.digest` và artifact path trên report read
- Lý do UI: HiFi H09:90 caption equity `series/stitched.parquet · digest sha256:…`
- Ảnh hưởng hiện tại: hàng 09-11 — caption chỉ có counts + sampling + UTC
- Đề xuất schema (chỉ đề xuất — codex quyết): `EquityV2.digest`, `EquityV2.artifact_path`
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | `ReportDetail.tsx:704–707`; `research-report.d.ts` EquityV2 L286–296 |
| Audit | audit-A2 (hàng 09-11) |
| Owner / state | Codex · OPEN |
| Fallback FE hôm nay | caption không digest |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

### S10

#### CG-FG-S10-01 — `PromotionPick.param_set_id` / `selected_trial_id` trên lineage pick

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: `PromotionPick.param_set_id` và/hoặc `selected_trial_id` trên pick của lineage read
- Lý do UI: HiFi H10:95 slot `prm_7c1a9e` trong banner PROMOTION PICK
- Ảnh hưởng hiện tại: hàng 10-12 — LD:1054 in `source_digest` của approval vào slot param-set (` · 99999999`) — hoặc FE đọc pick P22 (FG-05, xem `VD-FG-05-05`)
- Đề xuất schema (chỉ đề xuất — codex quyết): `PromotionPick.param_set_id: string | null`, `selected_trial_id: string | null`
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | `LineageDetail.tsx:1054`; `research-attempt-lineage.d.ts:99` (`source_digest`), :93–111 |
| Audit | audit-A3 (hàng 10-12) |
| Owner / state | Codex · OPEN |
| Fallback FE hôm nay | digest nguồn approval (cần đổi thành typed absence khi FE sửa) |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

#### CG-FG-S10-02 — `AttemptNode.lineage_status` + `superseded_by_attempt_id`

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: trạng thái lineage cấp attempt (`lineage_status`) và `superseded_by_attempt_id`
- Lý do UI: HiFi H10:112, :122 pill ACTIVE/SUPERSEDED/ABANDONED/DRAFT theo node; "why superseded" cấp attempt (H10:197–217)
- Ảnh hưởng hiện tại: hàng 10-14, 10-19 — FE tự suy status (`lineageStatus` LD:195–210, vi phạm rule 5): attempt FAILED att_07 bị đếm và hiện là ACTIVE; "why superseded" dùng supersession cấp version + prose FE "code re-import"
- Đề xuất schema (chỉ đề xuất — codex quyết): `AttemptNode.lineage_status: ACTIVE|SUPERSEDED|ABANDONED|DRAFT`, `superseded_by_attempt_id`
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | `LineageDetail.tsx:195–210`, :1687–1695; `research-attempt-lineage.d.ts:209`, :118, :129–135 |
| Audit | audit-A3 (hàng 10-14, 10-19) |
| Owner / state | Codex · OPEN |
| Fallback FE hôm nay | suy ở FE (FE_GAP ngầm theo rule 5) — owner Codex (+Bobby về từ vựng) |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

#### CG-FG-S10-03 — `RunFacts.claim.family` trên lineage projection

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: `RunFacts.claim.family` (token họ claim) trên lineage projection
- Lý do UI: HiFi H10:197–217 giá trị claim là token họ
- Ảnh hưởng hiện tại: hàng 10-18 — panel chọn in `claim issued` + câu
- Đề xuất schema (chỉ đề xuất — codex quyết): `RunFacts.claim.family: string | null`
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | `LineageDetail.tsx:1664–1677`; `research-attempt-lineage.d.ts:75–79` |
| Audit | audit-A3 (hàng 10-18) |
| Owner / state | Codex · OPEN |
| Fallback FE hôm nay | state + text của claim |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

#### CG-FG-S10-04 — (có điều kiện) `alpha.default_market/default_timeframe`; `counts.promotion_*`

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: (a) `alpha.default_market` / `default_timeframe` — chỉ khi Bobby giữ market/tf trong crumb (`VD-FG-01-18`); (b) `counts.promotion_*` — chỉ khi Bobby muốn số server thay vì FE đếm (`VD-FG-01-21`)
- Lý do UI: HiFi H10:48 crumb `… — mom_breakout_v3 · BTCUSDT · 4h`; H10:174–177 promotion rule box
- Ảnh hưởng hiện tại: hàng 10-01, 10-23 — crumb `Runs / Attempt Lineage — Momentum BTC`; standing line đếm ở FE trên attempt trả về (LD:1842–1846, đã quyết VD-P19-05)
- Đề xuất schema (chỉ đề xuất — codex quyết): field additive trên `alpha` và `counts`
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | `LineageDetail.tsx:795–799`, :1840–1871; `research-attempt-lineage.d.ts:269–276`, :280–282 |
| Audit | audit-A3 (hàng 10-01, 10-23) |
| Owner / state | Codex · OPEN · có điều kiện: chỉ làm sau owner decision |
| Fallback FE hôm nay | như hiện tại; chờ owner decision |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

### S11

#### CG-FG-S11-02 — `selected_params.param_set_id` + `selected_trial_number` trên compose/pack

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: `selected_params.param_set_id` và `selected_trial_number` trên compose (P21) và pack
- Lý do UI: HiFi 11 `prm_7c1a9e · trial #412` ở rail
- Ảnh hưởng hiện tại: hàng 11-07 — rail in `77777777 TRIAL` (digest bundle + kind thô)
- Đề xuất schema (chỉ đề xuất — codex quyết): `selected_params.param_set_id`, `selected_trial_number`
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | RCD rail node params; `research-release-candidate.d.ts` compose :160–188, pack :321–340 |
| Audit | audit-A3 (hàng 11-07) |
| Owner / state | Codex · OPEN |
| Fallback FE hôm nay | digest bundle + kind |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

#### CG-FG-S11-03 — (Bobby trước) `PackResponse.claim_ceiling/engine_cert/counts`

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: `PackResponse.claim_ceiling`, `engine_cert`, `counts` — chỉ khi Bobby muốn chúng trên pack (`VD-FG-01-26`)
- Lý do UI: chip pack header (route pack VD-P21-09, không có HiFi)
- Ảnh hưởng hiện tại: hàng 11-29 — chip in typed absence "… — not part of the frozen pack"
- Đề xuất schema (chỉ đề xuất — codex quyết): field additive trên PackResponse
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | RCD pack header; `research-release-candidate.d.ts:321–340` |
| Audit | audit-A3 (hàng 11-29) |
| Owner / state | Codex · OPEN · có điều kiện: chỉ làm sau owner decision |
| Fallback FE hôm nay | typed absence |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

### S12

#### CG-FG-S12-01 — contract fixture atlas `HISTORICAL` (`atlas: null` + `historical_identity`)

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: một contract fixture `HISTORICAL` trong `packages/contracts/fixtures` theo union DTO (`atlas: null` + `historical_identity`)
- Lý do UI: route `?release_id=` hiện render full atlas vì fixture e2e sai union; cần fixture chuẩn để FE bind `facts_reason`
- Ảnh hưởng hiện tại: hàng 12-12 — chip `HISTORICAL · er_quantbt_108` nhưng subtitle vẫn `Read from er_quantbt_111` và full atlas body
- Đề xuất schema (chỉ đề xuất — codex quyết): fixture `research-foundation.atlas-historical.valid.json` (tên do Codex chọn)
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | `e2e/research-foundation/atlas-historical.json`; `foundationRoutes.tsx`; `research-foundation.d.ts` union |
| Audit | audit-A3 (hàng 12-12) |
| Owner / state | Codex · OPEN |
| Fallback FE hôm nay | fixture e2e lệch union (FE_GAP P2 12-12, lane T8) |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

#### CG-FG-S12-02 — từ vựng `CandidateSelector.mode` khớp mode của atlas

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: `CandidateSelector.mode` dùng cùng từ vựng với `atlas.modes[]`
- Lý do UI: một vocabulary mode giữa selector và atlas (static row 12-19)
- Ảnh hưởng hiện tại: hàng 12-19 — static; không lộ lỗi trên fixture
- Đề xuất schema (chỉ đề xuất — codex quyết): enum chung hoặc map chính thức
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | `EngineAtlas.tsx`; `research-foundation.d.ts` |
| Audit | audit-A3 (hàng 12-19) |
| Owner / state | Codex · OPEN |
| Fallback FE hôm nay | hiển thị theo từng nguồn |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

### S13

#### CG-FG-S13-02 — certification grade trên compare

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: `certification.grade` (đang là hằng null) trên compare read
- Lý do UI: HiFi H13:86–87 chip cert cạnh số lớn
- Ảnh hưởng hiện tại: hàng 13-05 — `cert not published P20_NO_SOURCE_PUBLISHES_A_CERTIFICATION_GRADE`
- Đề xuất schema (chỉ đề xuất — codex quyết): publish grade cho slot đã có
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | `CompareDetail.tsx:936–948`, :594–603; `research-compare.d.ts` |
| Audit | audit-A3 (hàng 13-05) |
| Owner / state | Codex · OPEN |
| Fallback FE hôm nay | typed absence |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

### S14

#### CG-FG-S14-01 — tên CSRF header trong contract

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: ghi rõ tên CSRF header trong contract alpha import (`x-csrf-token` vs `x-portal-csrf`)
- Lý do UI: client write S14 phải gửi đúng header; hiện code và contract dùng hai tên
- Ảnh hưởng hiện tại: hàng 14-25 — static
- Đề xuất schema (chỉ đề xuất — codex quyết): một tên header trong OpenAPI security/parameters
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | `alphaImportClient.ts`; `research-alpha-import.d.ts` |
| Audit | audit-A3 (hàng 14-25) |
| Owner / state | Codex · OPEN |
| Fallback FE hôm nay | client giữ header hiện tại |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

#### CG-FG-S14-02 — mã `may_activate_reason`

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: `may_activate_reason` (mã) bên cạnh boolean `may_activate`
- Lý do UI: copy "not admitted" phải nói lý do từ server, không suy ADMIN ở FE (rule 5)
- Ảnh hưởng hiện tại: hàng 14-11 — FE tự nêu lý do ADMIN (AI:713–714)
- Đề xuất schema (chỉ đề xuất — codex quyết): `may_activate_reason: string | null`
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | `AlphaImport.tsx:713–714`; `research-alpha-import.d.ts` |
| Audit | audit-A3 (hàng 14-11) |
| Owner / state | Codex · OPEN |
| Fallback FE hôm nay | câu FE (FE_GAP P3 14-11) |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

#### CG-FG-S14-03 — fact run-admission theo version (`may_create_run` / execution binding)

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: fact run-admission theo từng version trên registry entry (`may_create_run` hoặc execution binding)
- Lý do UI: link "new run with this av_ →" (OL-01) cần fact server
- Ảnh hưởng hiện tại: hàng 14-12 — typed absence + copy RUN_NOT_ADMITTED cũ (trích dòng run-admission cũ)
- Đề xuất schema (chỉ đề xuất — codex quyết): `registry[].may_create_run: boolean` + reason
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | `AlphaImport.tsx:1235–1252`; `research-alpha-import.d.ts` |
| Audit | audit-A3 (hàng 14-12) |
| Owner / state | Codex · OPEN |
| Fallback FE hôm nay | typed absence (copy cũ = FE_GAP P2 14-12) |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

#### CG-FG-S14-04 — `total` / cursor cho registry list

```text
Backend request (@codex) — 2026-09-28
- Endpoint/field cần: `total` và cursor trên `RegistryListResponse`
- Lý do UI: strip registry cần biết list bị cắt và lọc phía server
- Ảnh hưởng hiện tại: hàng 14-16 — lọc phía client trên list có giới hạn (AI:814)
- Đề xuất schema (chỉ đề xuất — codex quyết): `total`, `next_cursor`
```

| Mục | Nội dung |
|---|---|
| Source locator @HEAD 8783461e | `AlphaImport.tsx:814`; `research-alpha-import.d.ts` RegistryListResponse |
| Audit | audit-A3 (hàng 14-16) |
| Owner / state | Codex · OPEN |
| Fallback FE hôm nay | lọc client (FE_GAP P3 14-16) |
| Exit gate | Codex: commit additive + OpenAPI + `packages/contracts/generated/*.d.ts` sinh lại + contract fixture có giá trị thật + contract test. Thanhvuong: bind field từ chính read của màn, unit test, `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture) ở 1280/1440/660, sau đó `REAL_API_E2E_RECEIPT` khi có cell (FG-runtime-activation-request.md). Thanhvuong không tự ghi CLOSED. |

## 5. Id đã gộp (không phải packet riêng)

| Id cũ | Hàng | Gộp vào | Vì sao |
|---|---|---|---|
| `CG-FG-S09-01` (`ReportDetail.display_label`, D:521–535) | 09-01 | `CG-FG-D1-O1` | cùng field, audit-A2 |
| `CG-FG-S11-01` | 11-01 | `CG-FG-D1-O1` | cùng field, audit-A3 |
| `CG-FG-S13-01` | 13-04 | `CG-FG-D1-O1` | cùng field, audit-A3 |

## 6. Ranh giới

- Không packet nào ở đây cho phép FE tự điền giá trị trước khi contract có; fallback là typed absence có reason.
- `CG-FG-S10-02`: cho tới khi có field, suy `lineage_status` ở FE (LD:195–210) là vi phạm rule 5 của `CLAUDE.md` và được ghi trong debt register; không sửa trong slice 1.
- `CG-FG-S10-04` và `CG-FG-S11-03` chỉ mở sau `VD-FG-01-18`, `VD-FG-01-21`, `VD-FG-01-26` (FG-owner-decisions.md).
- Mọi exit gate real-API phụ thuộc cell thanhvuong (FG-runtime-activation-request.md); không có cell thì trạng thái là `BLOCKED_BY_RUNTIME`, không VERIFIED.

## 7. Slice 2 (2026-09-29) — CG-FG-R2-01 — evidence route `INTENTIONALLY_UNEXPOSED` trong R2 capability inventory

```text
Backend request (@codex) — 2026-09-29
- Endpoint/field cần: sửa evidence của route INTENTIONALLY_UNEXPOSED `POST /internal/research/progress/sources/imported` trong `upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/r2_ledger/capability-inventory.v1.json` :1628–1637, hoặc nới regex của test.
- Lý do UI: không phải UI. Unit gate `src/execution/r2Ledger.test.ts` > "R2-0 · capability inventory" > "makes every INTENTIONALLY_UNEXPOSED route say why" (:83–87) đòi evidence khớp `/design|infrastructure|probe|forbidden|auth/i`; evidence hiện tại mô tả custody bằng principal ký nhưng không chứa từ nào trong năm từ đó. Đây là fail duy nhất còn lại của full suite frontend.
- Ảnh hưởng hiện tại: full vitest trên tree slice 2: 201 file (200 pass / 1 fail); 3930 test (3928 pass / 1 fail / 1 skip). Gate NOT GREEN. FE không được sửa ledger hay `src/execution/**`.
- Đề xuất schema (chỉ đề xuất — codex quyết): (a) viết lại evidence cho nó nêu lý do auth (route chỉ tới được bằng principal `research_progress_writer` đã ký), hoặc (b) nới regex (ví dụ thêm `principal|custody|worker`).
```

Codex closeout 2026-09-29: CG-FG-R2-01 DELIVERED 0b868c6f; r2Ledger 22/22 and full Vitest 201 files, 3929 pass, 1 skip, 0 fail. Earlier OPEN/40 counts in this packet are the Thanhvuong handoff snapshot; 39 other packets remain open.

| Mục | Nội dung |
|---|---|
| Source locator | ledger `capability-inventory.v1.json:1628–1637` (owner `codex`, test_owner `codex`, controller `research/progress-ingress.controller.ts`); route `apps/control-api/src/research/progress-ingress.controller.ts:124` `@Post("sources/imported")`; test `apps/portal/frontend/src/execution/r2Ledger.test.ts:83–87` |
| Nguồn gốc | entry ledger và decorator route cùng được thêm bởi `5a5c79b7` (BobbyAxerol, 2026-09-27, "feat(research): qualify imported DRAFT execution end to end"): tổ tiên của base `8783461e`, **không** phải tổ tiên của baseline `a00df203` (ở baseline file test pass 22/22). Phân loại `INHERITED_FROM_BASE`; slice 1 và slice 2 không đụng ledger |
| Bằng chứng (ngoài repo, sha256/16) | A3 report `~/tv-shots/fg2/a3/A3-report.md` `2f745a065fca04b1`; vitest head `c019014538761fd4` (FAIL), base `65452be367015505` (FAIL, giống hệt), baseline `2d13f5f850746d94` (PASS 22/22); full suite `~/tv-shots/fg2/audit/vitest-full-2.log` `a12c4e9d392aa55d` |
| Đếm theo revision | head: 192 route, 12 `INTENTIONALLY_UNEXPOSED`, 1 vi phạm (chỉ route này); base: giống head; baseline: 190 / 11 / 0 |
| Owner / state | codex (Bobby duyệt) · OPEN |
| Fallback FE hôm nay | không có — FE không sửa ledger, regex hay `src/execution/**` |
| Exit gate | `npx vitest run src/execution/r2Ledger.test.ts` xanh (trong `apps/portal/frontend`), rồi full suite xanh. Không tự ghi CLOSED |

## 8. Đính chính slice 1 (2026-09-29) — mô tả fail `r2Ledger`

- Rà soát file này: **không có** câu slice 1 nào trong file này mô tả fail `r2Ledger` là thiếu route, nên không có câu nào phải gạch ở đây.
- Câu sai của slice 1 nằm ở [FG-debt-register.json](./FG-debt-register.json) (`inherited_test_failures` → `CG-P22-C`, trường `what`: "capability inventory thiếu route P22"). Câu cũ được giữ, gạch ngang, kèm ghi chú đính chính có ngày tại chỗ. Dòng T14 ở [FG-01 §6](./FG-01-screen-audit-matrix.md) được nối thêm cùng đính chính. Note slice 1 trong Unified §13 (dòng "`r2Ledger` → `CG-P22-C`") không được sửa; đính chính nằm trong note slice 2.
- Đúng là: test "covers exactly the routes the controllers publish" **pass** ở head, base và baseline. Assertion fail là rule câu chữ evidence của route `INTENTIONALLY_UNEXPOSED` `POST /internal/research/progress/sources/imported` (xem §7). Packet mới: `CG-FG-R2-01`.
