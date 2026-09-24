# P20 — Thanhvuong backend request receipt (Screen 13)

Receipt này gom mọi việc S13 cần từ backend (@codex) và từ Bobby.

- Receipt chính: [thanhvuong-frontend-receipt.md](./thanhvuong-frontend-receipt.md).
- Evidence máy đọc được: [thanhvuong-test-results.json](./thanhvuong-test-results.json), [thanhvuong-debt-register.json](./thanhvuong-debt-register.json).

**Ngày kiểm lại:** 2026-09-24, theo CLAUDE.md §7.6 và §7.9.

Nơi kiểm:
- Nhánh `feat/thanhvuong/research-p17-p21`, code head `034aef11`.
- Baseline `primus-origin/docs/research-loop-plan` = `bb25bf39` (lúc lập plan) và **`72d2638b`** (sau `git fetch` lúc đóng packet).

Kết quả kiểm:
- `git diff --stat bb25bf39 72d2638b -- packages/contracts/openapi/research-compare.openapi.json packages/contracts/generated/research-compare.d.ts apps/control-api/src/research/compare* upgrade/research_loop/evidence/P20` **rỗng**. Contract vẫn `version 1.0.0`, SHA-256 `cd393d5664637adc…` (OpenAPI) / `6d7b51a94e8adb53…` (d.ts), commit cuối `a4acd5e2` ở cả ba ref.
- `git ls-tree -r <ref> --name-only | grep -i "fixtures.*compare"` exit 1 ở `HEAD`, `bb25bf39`, `72d2638b`: chưa có fixture compare ở đâu.
- `bb25bf39..72d2638b` gồm 7 commit (RF-04/RF-06, S01/S04/S05/S06), không chạm compare contract/service/evidence P20. `3e7055d5` viết lại `RunLibrary.tsx` và `8bd81b01` sửa `QuantBTModule.tsx` — hai file S13 cũng sửa (xem §3 B1).

Luật ghi (handoff `THANHVUONG_P17_P21_FRONTEND_HANDOFF.md` + CLAUDE.md §5):
- Mỗi request có locator, actual, expected, đề xuất nhỏ nhất an toàn, test cần có và fallback đang chạy.
- Đề xuất chỉ là đề xuất; Codex quyết.
- Frontend không sửa backend, contract hay runtime để màn hình xanh.
- Không request nào đòi endpoint mới ngoài `researchCompareGetV1`. Mọi đề xuất là field additive trên DTO hiện có, file fixture, hoặc một câu xác nhận "không có".

Nhiều request (02, 03, 04, 05, 06 win rate, 08) có thể được trả lời "không có ở P20 / source không publish". Câu đó cũng đủ: frontend ghi `NOT_APPLICABLE_PROVEN`, giữ typed absence, và Bobby chốt VD tương ứng (có thể mở version hi-fi mới bỏ ô đó).

## 1. `CG-P20-*` — khoảng trống phía consumer

### CG-P20-01 — fixture canonical compare

```text
Backend request (@codex)
- Endpoint/field cần: packages/contracts/fixtures/research-compare.*.valid.json cho 5 case spec 13 §10 + Problem 400/401/403/404/503
- Lý do UI: CLAUDE.md §7.8 — test và probe phải nạp fixture canonical, không tự dựng object
- Ảnh hưởng hiện tại: /research/quantbt/alphas/:alphaId/compare — compareDetail.test.tsx và probe dựng body từ compare.contract.ts / compare.service.ts
- Đề xuất schema: không đổi schema; chỉ thêm file fixture
```

| Mục | Nội dung |
|---|---|
| Locator | `packages/contracts/fixtures/` (không có `*compare*`); spec 13 §10 (CMP_ATTEMPTS, CMP_MARKETS, CMP_PAIR_OK, CMP_PAIR_MISMATCH, CMP_PAIR_NOCORR); `apps/control-api/test/research-compare.service.spec.ts` đang assert body |
| Actual | Không có fixture. Stub S13 dựng theo shape service: attempts rank 3/3/null (COMPLETE + PARTIAL 140), markets 3 card (AVAILABLE / NOT_PUBLISHED chart / QUEUED), pair AVAILABLE / PARTIAL / REFUSED, correlation zero-variance |
| Expected | Fixture cho: **attempts** (≥ 3 attempt, thứ tự server thật, 1 NOT_PUBLISHED claim, coverage COMPLETE và PARTIAL); **markets** (3 key khác nhau, 1 chart NOT_PUBLISHED); **pair_ok** (overlay, common_window 3 metric, correlation PORTAL_DERIVED); **pair_mismatch** (`REFUSED`, `P20_CONTRACT_KEY_MISMATCH`, timeframe lệch); **pair_nocorr** (`P20_ZERO_VARIANCE_RAW_RETURNS` hoặc `P20_INSUFFICIENT_COMMON_RAW_RETURNS`); kèm Problem mỗi status. Alpha id theo regex contract (xem `07`) |
| Đề xuất nhỏ nhất | Xuất body mà service spec đang assert ra `research-compare.{attempts,markets,pair-ok,pair-mismatch,pair-nocorr}.valid.json` |
| Test khi có | `S13-U*` và probe nạp fixture; test fixture ↔ OpenAPI |
| Fallback đang chạy | Stub theo shape service, ghi rõ ở đầu file test và spec probe |

### CG-P20-02 — schedule / mode per run

```text
Backend request (@codex)
- Endpoint/field cần: Run.schedule_label (hoặc Run.spec{mode, schedule}) trong researchCompareGetV1 — hoặc xác nhận "không publish"
- Lý do UI: hi-fi 13 in "sched mode_1 × global" trên thẻ ladder và thẻ market
- Ảnh hưởng hiện tại: thẻ attempt/market in "sched — not published · not a field of the compare contract (CG-P20-02)"
- Đề xuất schema: Run.schedule {mode: string, schedule: string, availability} — additive
```

| Mục | Nội dung |
|---|---|
| Locator | `research-compare.d.ts` `components.schemas.Run` (không có schedule/mode); schedule chỉ xuất hiện dạng `intentional_differences[].path` ở pair |
| Actual | Absent + `CG-P20-02` (VD-P20-03) |
| Expected | Nhãn schedule/mode của spec P08 mà run chạy, hoặc câu "không có" |
| Đề xuất nhỏ nhất | Field `schedule` additive trên `Run`, lấy từ P08 spec đã parse (server đã có cho `comparison_contract_key`) |
| Test khi có | U04/U06 đổi absent → giá trị; probe attempts/markets |
| Fallback đang chạy | Typed absence đúng vị trí hi-fi |

### CG-P20-03 — cert / certification per run

```text
Backend request (@codex)
- Endpoint/field cần: Run.certification {grade, source, availability} — hoặc xác nhận "không có cert ở P20"
- Lý do UI: hi-fi chip "cert B/C" trên thẻ ladder và market; handoff cấm bịa chip certification
- Ảnh hưởng hiện tại: "cert — not published · not a field of the compare contract (CG-P20-03)"
- Đề xuất schema: additive, nullable, có availability + reason_code
```

| Mục | Nội dung |
|---|---|
| Locator | `Run` không có cert; S10 cũng thiếu (`CG-P19-05`) |
| Actual | `CertAbsent` (VD-P20-03) |
| Expected | Cert thật từ source hoặc "không có" |
| Đề xuất nhỏ nhất | Tái dùng câu trả lời của `CG-P19-05` cho cả S10 và S13 |
| Test khi có | U04, U06 |
| Fallback đang chạy | Typed absence |

### CG-P20-04 — OOS Sharpe per fold

```text
Backend request (@codex)
- Endpoint/field cần: AttemptResult.fold_series[] {run_id, folds[{fold_index, oos_sharpe: Decimal|null, availability}]} — hoặc xác nhận "không publish"
- Lý do UI: hi-fi EChart 1 "OOS Sharpe per fold, per attempt — same folds, same tape, different honesty"
- Ảnh hưởng hiện tại: khung figure giữ caption hi-fi, thân "per-fold OOS sharpe — not published (CG-P20-04)"; không toggle 5/32
- Đề xuất schema: additive, bounded (≤ 128 attempt × ≤ 32 fold), Decimal string
```

| Mục | Nội dung |
|---|---|
| Locator | `AttemptResult` chỉ có `attempts`, `coverage`, `trajectory`; `original_metrics[OOS_SHARPE]` là 1 số/run, thường `P20_SOURCE_DID_NOT_PUBLISH_OOS_SHARPE` |
| Actual | Absent (VD-P20-04) |
| Expected | Series per-fold từ P14 outer-OOS receipt, hoặc "không có" |
| Đề xuất nhỏ nhất | Field additive; FE vẽ bar SVG, không tính |
| Test khi có | U04 + probe attempts: số bar = số fold server |
| Fallback đang chạy | Khung + caption + absent |

### CG-P20-05 — intentional differences ở attempts mode

```text
Backend request (@codex)
- Endpoint/field cần: AttemptResult.config_diff[] {path, per_attempt[{attempt_id, value}]} (cùng allow-list P19 semantic diff) — hoặc xác nhận "chỉ có ở pair"
- Lý do UI: hi-fi card "config diff — the only keys that changed anywhere in the tree"
- Ảnh hưởng hiện tại: card giữ header hi-fi, thân "attempts mode publishes no config diff (CG-P20-05)" + link Attempt Lineage
- Đề xuất schema: additive; server chuẩn hoá như P19 semantic_diff / P20 intentional_differences
```

| Mục | Nội dung |
|---|---|
| Locator | `intentional_differences` chỉ nằm trong `PairResult.pair` |
| Actual | Absent (VD-P20-05) |
| Expected | Bảng key × attempt hoặc "không có" (khi đó FE đề xuất Bobby bỏ card ở version hi-fi mới, link sang S10) |
| Đề xuất nhỏ nhất | Tái dùng allow-list diff của P19 |
| Test khi có | U04 + probe |
| Fallback đang chạy | Khung + absent + link S10 |

### CG-P20-06 — win rate + OOS Sharpe common-window (stitched)

```text
Backend request (@codex)
- Endpoint/field cần: common_window.metrics thêm WIN_RATE_FRACTION và OOS_SHARPE (stitched) với definition_id riêng — hoặc xác nhận "không định nghĩa"
- Lý do UI: hi-fi bảng delta có hàng "OOS sharpe (stitched)" và "win rate"
- Ảnh hưởng hiện tại: hàng OOS có A/B từ original_metrics (scope P13) nhưng Δ absent; win rate absent CG-P20-06
- Đề xuất schema: thêm key vào enum CommonWindowMetric.key — additive
```

| Mục | Nội dung |
|---|---|
| Locator | `CommonWindow.metrics[3]` = NET_RETURN_FRACTION, MAX_DRAWDOWN_FRACTION, TRADE_COUNT (NOT_APPLICABLE) |
| Actual | Δ OOS absent; win rate absent (VD-P20-06) |
| Expected | Metric common-window có định nghĩa, hoặc "không có" |
| Đề xuất nhỏ nhất | Thêm key, `NOT_APPLICABLE` + reason khi không định nghĩa được |
| Test khi có | U07/U08 |
| Fallback đang chạy | Typed absence, FE không trừ |

### CG-P20-07 — alpha id của fixture run-library vs regex compare

```text
Backend request (@codex)
- Endpoint/field cần: sửa fixture run-library (binding.alpha_id) theo regex AlphaId, hoặc xác nhận regex nào đúng
- Lý do UI: CompareBar lấy binding.alpha_id để dựng /alphas/{alphaId}/compare
- Ảnh hưởng hiện tại: fixture cho "alpha_momentum_btc" → href alpha=alpha_momentum_btc → server thật trả 400 RESEARCH_COMPARE_INVALID
- Đề xuất schema: không đổi schema; sửa fixture thành "alpha-momentum-btc" (Lineage đã dùng dạng này)
```

| Mục | Nội dung |
|---|---|
| Locator | `apps/portal/frontend/e2e/research-foundation/run-library.json` (`binding.alpha_id = alpha_momentum_btc`); `compare.contract.ts:14` `ResearchCompareAlphaIdSchema = /^[a-z][a-z0-9-]{2,63}$/` |
| Actual | Gói B entry-links: `…&alpha=alpha_momentum_btc`; S13 không sửa fixture (ngoài phạm vi S13) |
| Expected | Fixture và contract dùng cùng một dạng alpha id |
| Đề xuất nhỏ nhất | Sửa fixture run-library; hoặc xác nhận run-library binding có thể chứa `_` và compare phải chấp nhận |
| Test khi có | Probe entry-links assert href khớp regex |
| Fallback đang chạy | FE gửi nguyên id, server là authority (400 → terminal typed) |

### CG-P20-08 — lifecycle ACTIVE / SUPERSEDED per run

```text
Backend request (@codex)
- Endpoint/field cần: Run.alpha_version_lifecycle (ACTIVE|SUPERSEDED|DRAFT|ABANDONED) trong researchCompareGetV1 — hoặc xác nhận "không publish"
- Lý do UI: hi-fi status pill ACTIVE/SUPERSEDED trên thẻ ladder, viền đậm thẻ ACTIVE, footer "only the ACTIVE node may promote"
- Ảnh hưởng hiện tại: pill in run_state (READY/QUEUED…), không viền ACTIVE (FE không suy diễn)
- Đề xuất schema: additive enum, lấy từ alpha version lifecycle như P19 lineage
```

| Mục | Nội dung |
|---|---|
| Locator | `Run` có `run_state`, `alpha_version_id`, `alpha_version_label`; không có lifecycle |
| Actual | Pill = `run_state` (VD-P20-03) |
| Expected | Lifecycle version (như `alpha.versions[].lifecycle_state` P19) hoặc "không có" |
| Đề xuất nhỏ nhất | Field additive; liên quan `CG-P19-14` (status promotion cấp attempt) |
| Test khi có | U02/U04 + probe attempts: pill + viền |
| Fallback đang chạy | `run_state` |

## 2. Không có hàng source-capability riêng

P20 không có matrix source-capability; source absence là reason code `P20_*` trong contract (`P20_STRUCTURED_CLAIM_FAMILY_NOT_PUBLISHED`, `P20_SOURCE_DID_NOT_PUBLISH_OOS_SHARPE`, `P20_P13_EQUITY_SERIES_NOT_AVAILABLE`, …) và được in nguyên văn.

Không mở request cho: ETag/304 (contract đã có, S13 dùng), badge 403/404 (S13 dùng câu F-04 chung như S10), tô đỏ keypart (VD-16; server có thể trả danh sách phần lệch nếu Codex muốn, không cần cho hiển thị hiện tại).

## 3. Việc Bobby quyết (không phải backend)

- **B1 — Tích hợp baseline** `bb25bf39 → 72d2638b` (7 commit, chưa merge/rebase):
  - `3e7055d5` viết lại `RunLibrary.tsx` (+968/−463): CompareBar thành nút **disabled** "Screen 13 Compare is not built yet — phase P20 delivers it". Thay đổi S13 (`compareEntryHref`, `alpha=`) sẽ xung đột và phải nối lại vào nút mới.
  - `8bd81b01`: DQ-01 bỏ module header trên màn Research Loop (giải G1 phần header thừa); state rule 404 → terminal `notFound` (S13/S10 đang 403 = 404 `denied`); DQ-08 `researchFormat.ts` (hiển thị theo đơn vị) trái với cách S13 in Decimal nguyên chuỗi. Cần chốt một chuẩn khi tích hợp.
  - Không commit nào chạm compare contract/service/evidence P20. Xung đột `FreezeDetail.tsx` (P17) và `research-alpha-import.d.ts` (P19 B1) vẫn còn.
- **B2 — Copy lệch hi-fi** `VD-P20-01/02/10/11/13/14/15/17` (+ `VD-P20-20`, banner markets): copy/hướng đọc hi-fi mâu thuẫn contract. **Đề xuất mở version hi-fi mới** ("two runs, one key", Portal-derived correlation, ladder theo thứ tự server hoặc chốt đảo ngược, bỏ narrative demo).
- **B3 — `VD-P20-08`** dòng meta disclosure: cùng nhóm `S10-COUNTS-PANEL` (giữ, bỏ, hay chuẩn hoá thành panel chung).
- **B4 — axe** (spec T10): axe-core không có trong lock.
- **B5 — `REAL_API_E2E_RECEIPT` / `V11-P20-DR`**: cần bật `CONTROL_API_FEATURE_RESEARCH_COMPARE` trên một lane preview + cặp run Delta thật.
- **B6 — `data-compare-state` cho REFUSED**: hiện `available` cho cả pair REFUSED và pair zero-variance (response 200 hợp lệ); có muốn state màn phản ánh refusal (vd `refused`) không.

## 4. Trạng thái

| ID | Owner | State | Ghi chú |
|---|---|---|---|
| `CG-P20-01` | Codex | OPEN | fixture 5 case + Problem |
| `CG-P20-02` | Codex | OPEN | schedule/mode per run |
| `CG-P20-03` | Codex | OPEN | cert per run (cùng câu hỏi `CG-P19-05`) |
| `CG-P20-04` | Codex | OPEN | OOS Sharpe per fold |
| `CG-P20-05` | Codex | OPEN | config diff ở attempts |
| `CG-P20-06` | Codex | OPEN | win rate + OOS stitched common-window |
| `CG-P20-07` | Codex | OPEN | alpha id fixture run-library |
| `CG-P20-08` | Codex | OPEN | lifecycle ACTIVE/SUPERSEDED per run (liên quan `CG-P19-14`) |
| B1–B6 | Bobby | AWAITING_DECISION | §3 |
