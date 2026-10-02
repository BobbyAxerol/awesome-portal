# Research Loop — hàng đợi backend cho Codex (Claude soạn, Bobby giao, 2026-09-30)

## Codex continuation 2026-10-02 — B7/B8, not whole-phase closeout

Implemented declaration fold/conditions endpoint, UTC alignment refusal,
spot/quarterly read-only qualification and safe bounded index append.
Requested-spec v2 temporal **Delta/global** is connected through admission,
worker, progress and retention. Real child: 1,056 bars, rolling 14D, guards
1/2/3, 2 folds, 3 trials, five retained tables, 5.277s wall. Public API now
passes on clean c8b1641b: rolling v2, fixed Delta and Quarterly all
COMPLETED/READY; RC v2 AVAILABLE. Inner/per-fold causal retention remains explicitly not admitted;
VN/session sources are not claimed qualified. The WFO exposure writer is now
implemented with completion clock, server snapshot and live fencing; product
proof records one exposure and exact self-audit reuse without new GET jobs.
Linked non-reusable audit and one-candidate P23/P24 remain open. No remote push
or production change.
[Receipt and generated frontend handoff](./evidence/P10/B7_B8_TEMPORAL_EXECUTOR_2026-10-02.md):
`DeclarationEstimate`, `researchDeclarationEstimatePostV1`, Atlas profile temporal/
seed policies and `RunLibraryItem.enriched_analysis_availability`. Keep existing
S02 consumer `b5f180e8`; no frontend redo, invented zero or typed-absence upgrade.

**Đây là file Codex làm theo.** Mọi gap backend còn tồn đọng của Research Loop V1.1, đã **kiểm lại trong code** tại `f7c76bae` (mỗi mục có file:line hoặc commit trong phụ lục), gộp trùng, xếp **thứ tự làm tuần tự**. Frontend do Claude làm song song (§1). Bobby chỉ định: **Codex làm toàn bộ backend trong file này**, kể cả mục ≤P21 (thay cho phân vai 09-24 ở những mục này); Bobby có thể đổi từng mục.

## 0. Đọc gì, theo thứ tự nào

1. `AGENTS.md` (root) — boundary monorepo, commit, hook.
2. **File này** — hàng đợi. Làm từ trên xuống; không nhảy đợt trừ khi mục bị chặn (ghi lý do).
3. `upgrade/research_loop/D-AN-01_PORTAL_ANALYTICS_ALL_TIME.md` — **quyết định Bobby 2026-09-30**: Portal tự tính analytics mô tả từ dữ liệu thô QuantBT, **all time**, không rolling; S01 thẻ thu nhỏ mới dùng last-30D. Thắng HiFi/spec cũ ở chỗ mâu thuẫn.
4. Phụ lục bằng chứng (đọc mục mình đang làm, không cần đọc hết): `upgrade/research_loop/evidence/P21/audit-2026-09-30/codex-inventory/`
   - `A1_cg_fg.md` — 42 gói CG-FG (S02…S14, P22, R2, D1-O1)
   - `A2_p01_p12.md` — CG-P02…P12, RF/RS, BR-P10, DR
   - `A3_p13_p21.md` — CG-P13…P21, E*-O*, S14-RW-BR, BR-D4, extras
   - `A4_p22_p24.md` — CG-P22/P23, OL, T01–T15, V11, F3/F5, P24 + thứ tự đề xuất §3
   - `A5_analytics_d_an_01.md` — AN-01…AN-29 (công thức, đầu vào, test)
   - `A2b_*`, `A3b_*` — lượt kiểm thứ hai độc lập của P01–P12 và P13–P21 (cùng kết luận; A2b thêm CG-P08-02 và `PreflightPanel` in 0 cho null — phần FE của Claude)
5. **Cách đọc Unified plan** (`upgrade/UNIFIED_IMPLEMENTATION_PLAN.md` §13): board phase ~L3600–3720 (một dòng/phase — trạng thái tóm tắt); note chi tiết dưới anchor `#rl-pXX`; quyết định ở §13.4.1 (E/F/G, D1–D10, VD-*). **Addendum đến sau thắng bản gốc** nhưng không xoá critique cũ (A13.1). Khi dòng board mâu thuẫn với phụ lục ở trên → phụ lục (đã kiểm code) đúng hơn; sửa dòng board (§7).

## 1. Nhánh, worktree, cách hạ cánh

- **Nhánh chính duy nhất:** `docs/research-loop-plan` (hiện `f7c76bae`). Checkout ở `/home/bobby/portal-research` — **chỉ dùng để hạ cánh và build preview**, không code trực tiếp ở đó nữa.
- **Làn của Codex:** `git -C /home/bobby/portal-research worktree add -b codex/be-gaps /home/bobby/portal-research-be docs/research-loop-plan` → làm ở `/home/bobby/portal-research-be`.
- **Làn của Claude:** `/home/bobby/portal-research-fe` (nhánh `claude/fe-parity`).
- **Hạ cánh (mỗi gói):** `git rebase docs/research-loop-plan` trên làn → commit **qua hook** (không bao giờ `--no-verify`) → khi checkout chính sạch: `git -C /home/bobby/portal-research merge --ff-only codex/be-gaps` → báo Claude SHA mới. Không ff được thì rebase lại. **Không push** origin/primus-origin cho tới khi Bobby bảo.
- **Chia file:** Codex ghi `apps/control-api/**`, `apps/portal/backend/**`, migration **078+**, `packages/contracts/openapi/**` + regenerate (`scripts/contracts-test.sh` / script repo — không sửa tay `.d.ts`), fixtures canonical mới, `deploy/**` khi cần. **Không** sửa `apps/portal/frontend/**` (Claude). Contract đổi → ghi vào §8 "đã publish" để Claude nối FE.
- **Mỗi mục xong:** test (unit/PG/contract) + receipt ngắn trong `upgrade/research_loop/evidence/P<phase>/` + đánh dấu mục trong §8 của file này (id, commit, test). Gate N29/EDS-12: nếu hook báo digest đổi → `python3 scripts/execution-n29-product-acceptance.py --refresh-evidence --write` rồi `python3 scripts/execution-eds12-qualification.py refresh-static-input-digests --write`.
- **Preview** (`research-portal.primusspark.com`, stack cô lập `portal-research-preview`, :8095): build từ checkout chính sau khi hạ cánh (`scripts/research-preview/preview.sh build && up`); so image chạy = tag. DB preview đã chạy tới 077 (sổ 068/069 đã đổi sang 075/076). Tự đăng nhập bật (`claude-preview`). Đủ 25 cờ Research bật.

## 1b. Đợt B0 — lỗi server lộ ra khi chạy 400 trials trên preview (2026-09-30, **làm trước B1 còn lại**)

Chi tiết: `evidence/P21/audit-2026-09-30/fe-inventory/B3_cells_s00_s07_400trials.md`, `B4_cells_s08_s14_400trials.md`, §6.1 của `FRONTEND_GAPS_FOR_SONNET_2026-09-30.md`. Run thử: R-WFO-020 `rrun_3258a4c450816129d2d285f25b801061` (claude-preview), R-WFO-002 `rrun_d61c000dc6d1dc2ce05d5b341b4aabea` (bobby).

| # | Id | Việc | Locator | Nghiệm thu |
|---|---|---|---|---|
| 1 | **LW-01** search read 503 ở 400 trials | `current-source/search` trả `RESEARCH_CURRENT_SOURCE_UNAVAILABLE` ("exceeds its bounded budget", kể cả `?limit=1`). Commit `8c376879` (Claude, cờ `PREVIEW_LONG_WFO`) nâng trần trial 400 nhưng để `probe.objective_rows ≤128`, mảng candidate `≤64`, ngân sách byte của read. Nâng các trần dưới cùng cờ (hoặc phân trang ledger/probe), contract + test | `apps/control-api/src/research/current-source.contract.ts:803-816`; search service | R-WFO-020: S06 đủ, ledger phân trang 400 dòng |
| 2 | **LW-02** report sidecar nuốt lỗi | sidecar seal report gọi search, lỗi thì im → không report nào seal (cả vài run 3 trials cũ R-WFO-010…014). Lỗi phải thành trạng thái có mã (FAILED/RETRY) + đọc lại được; seal lại khi search sửa | report sidecar (control-api) | R-WFO-020 có report; run lỗi hiện mã, không 404 im lặng |
| 3 | **LW-03** child-audit mất bản ghi OOS generation | QuantBT giữ 2.000 bản ghi child-audit, bỏ 2.212; trên cả 9 fold phần bị bỏ gồm mọi bản ghi "out-of-sample generation" → `QUANTBT_CHILD_AUDIT_HAS_NO_OUT_OF_SAMPLE_GENERATION_RECORD`, S11 mục 6 MISSING, run không seal được. Khi cắt, ưu tiên giữ bản ghi OOS generation (mỗi fold ≥1), hoặc engine tăng giới hạn | retention child-audit (Portal worker) / QuantBT | freeze mỗi fold có bản ghi OOS generation; S11 seal được |
| 4 | **LW-04** "stitched OOS" gồm 744 bar trước OOS | chuỗi return distribution / rolling-20 / sparkline S01 lấy cả phần trước OOS đầu (2.184 điểm) thay vì 1.440 OOS (`oos_observation_count`) | current-source evidence series + run-library sparkline | số điểm = `oos_observation_count` |
| 5 | **LW-05** θ* lệch giữa read | progress/cursor nói trial 394, freeze/RC nói 393; "Best J₁" hai giá trị khác dấu | progress `selection` vs freeze | một θ* duy nhất trên mọi read |
| 6 | **LW-06** trades mâu thuẫn | S13/Library "trades 19" vs S08 "0 trade records, 6 transitions" — ghi rõ scope/định nghĩa hoặc thống nhất | run-library metric `TRADE_COUNT` vs replay counts | cùng số hoặc nhãn scope khác nhau rõ ràng |
| 7 | **LW-07** atlas nêu profile cũ | atlas trả `p10.fixed-qualification.v1`, "seed MUST_BE_NULL" cho run WFO seed 42; trial chấp nhận = 1 → FE nhân bản run 400 trials thành nháp 1 trial | foundation atlas | atlas nêu đúng profile WFO + giới hạn trial khi cờ bật |
| 8 | **LW-08** shell "Runs (1)" / legacy row | đếm một dòng legacy ETHUSDT; dòng đó QUEUED ở Library nhưng `/api/runs` COMPLETED | run library projection legacy | đếm đúng, trạng thái khớp |

## 2. Đợt B1 — chặn nghiệm thu frontend (làm trước; nhỏ)

| # | Id | Việc (tối thiểu) | Locator | Nghiệm thu |
|---|---|---|---|---|
| 1 | **S14-RW-BR-01** | register lại bản ACTIVE → 500: bind `supersedes`=NULL khi active = chính version đang register (hoặc SELECT trước, bỏ INSERT). Không migration | `apps/control-api/src/research/repository.ts:1074-1093`; CHECK mig 057 | spec: register→activate→register = 201 `replayed:true` |
| 2 | **S14-RW-BR-02** | analyser gán FAIL theo **field** hỏng, không theo gate | `apps/portal/backend/src/portal_api/services/research_alpha_analyzer.py:473-517` | test: `warmup_bars` sai → chỉ dòng đó FAIL |
| 3 | **CG-S00-AV-01** | journey descriptor: thẻ `alpha-version` thêm `requires_alpha` (hoặc route) — lane S00 đỏ 2 ô vì FE buộc phải bắt chọn run | `journey.descriptor.v3.ts:77` | lane S00 xanh |
| 4 | **AN-21** | S09 P04 headline OOS Sharpe đang hard-code vắng — đọc metric v3 như Run Library | `report-core-v2.ts:785`; tham chiếu `run-library.service.ts:1233-1240` | headline = hub `OOS_SHARPE` |
| 5 | **AN-22 / CMP-V3-01** | S13 P04 OOS Sharpe hằng vắng — bind v3 từ projection P13 | `compare.service.ts:366-370` | = giá trị Run Library (0.744 R-P04-018) |
| 6 | **CG-FG-S13-02** | compare `certification.grade` pin hằng NOT_PUBLISHED — dùng lại `RunLibraryService.certificate()` | `compare.service.ts:120-125`; `run-library.service.ts:1021` | fixture grade ISSUED |
| 7 | **X7 / WS-LEAK-01** | export `download_href` thiếu workspace | `report.service.ts:388` | spec trên workspace khác mặc định |
| 8 | **CSRF-DOC-01 = CG-FG-S14-01** | 4 OpenAPI khai `x-csrf-token` → `x-portal-csrf` (runtime `auth/cookies.ts:5`), regenerate | `openapi/research-{run-create,progress,preflight,alpha-import}.openapi.json` | contracts-test: mọi write research khai `x-portal-csrf` |
| 9 | **CG-FG-S05-01** | `SplitGuards.train_test_disjoint {verdict, basis}` tính server từ `fold_plan` + purge/embargo (FE đang tự vẽ ✓ — Claude đổi sang vắng ngay) | current-source split | overlap → FAIL |
| 10 | **CG-FG-S10-01** | lineage `PromotionPick.selected_trial_id` (+ params digest) từ fact settlement P22 (FE đang in approval digest vào ô param) | `lineage.service.ts`; pick P22 | fixture |
| 11 | **CG-FG-S14-02** | `may_activate_reason` (`ROLE_NOT_ADMIN`, `VERSION_NOT_REGISTERED`…) | alpha-import registry | fixture |
| 12 | **CG-FG-S14-03** | `registry[].run_admission {may_create_run, code}` từ predicate P10 | alpha-import + run-admission | fixture (link = VD-FG-01-32, Bobby) |
| 13 | **LEGACY-EXPORT-SEC** | `GET /api/runs/:id/export` cũ: ai đăng nhập cũng gọi được, không theo workspace, ghi đè file mỗi lần — chặn (ADMIN/owner + workspace) hoặc tắt | `apps/portal/backend/.../routes_runs.py:619`; link FE `AuditView.tsx:80`, `QuantBTModule.tsx:337` | test 403 cho non-owner |

## 3. Đợt B2 — BR-AN-01: analytics Portal tự tính (D-AN-01)

Chi tiết từng số (công thức, guard, test): `A5_analytics_d_an_01.md` AN-01…AN-29. Tóm tắt thứ tự:

1. **AN-28 — contract `research.retained-analytics.v2`**: `origin` thêm `PORTAL_DERIVED`; mỗi fact có `scope`, `source_locator`; khối có `input_digest` (đã có); `benchmark_locator`; `last_30d`; mã vắng `PORTAL_ANALYTICS_*`. v1 vẫn đọc được. OpenAPI + regenerate + fixture canonical + test ngân sách ≤16 KiB (P13 receipt ≤24 KiB).
2. Module tính (numpy; numba nếu >~10⁶ điểm) gọi từ **cả hai lane**: `research_retained_analytics.py` (WFO, `advanced_walkforward_runner.py:228`) và `research_child.py:648` (fixed). Phạm vi = `scoped` (cùng phạm vi `net_oos_return`), daily returns UTC, annualise 365.
3. Số (all time): **AN-01** Sharpe toàn run (WFO hero đang là mean-of-folds) · **AN-02** Sortino · **AN-03** CAGR · **AN-04** profit factor (bar returns) · **AN-05** hit rate long/short bar · **AN-06** volatility · **AN-07** max DD duration/recovery · **AN-08** skew · **AN-09** excess kurtosis · **AN-10** beta + corr vs **benchmark = buy-and-hold close của chính symbol/timeframe run** (đầu vào đã có: `active_market.frame.close` AWF:616, `market.close` CH:547 — không cần đọc HMD mới) · **AN-11** benchmark return + đường rebase 100 (≤24 điểm, giữ cực trị) · **AN-12** exposure L/S/F (tổng = 1) · **AN-13** turnover (đã có) · **AN-14** win rate / payoff / avg holding / max consecutive losses trên **position episodes**, nhãn "episodes, not audited trades" · **AN-15** decay P04 (IS boundary nay đã có — `research_evidence_metrics.py:245` hard-code sai) · **AN-23** S13 Sharpe common-window (Portal annualise 365).
4. **AN-16/17/18 — bỏ** `rolling_sharpe_63`, `ROLLING_BETA_63`, `ROLLING_RETURNS_20` khỏi v2 (v1 giữ đọc được).
5. **AN-19** — `last_30d` cho thẻ S01 (điểm equity + return + Sharpe nếu n≥2), nhãn "last 30D".
6. **AN-20** — S09 `metrics[]` đọc cùng bộ v2 (report-core-v2).
7. **AN-24** — P04 per-fold: đổi mã thành `NOT_APPLICABLE` (một cửa sổ), không phải gap.
8. **AN-29 — seal cũ (chỉ có v1):** mặc định FE hiện vắng `PORTAL_ANALYTICS_V2_NOT_COMPUTED_FOR_SEAL`; backfill từ `stitched.parquet` là **Bobby quyết**.
9. Mã vắng cũ gán nhầm cho nguồn phải đổi: `QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_BENCHMARK_SERIES` (CS:407), `benchmark: SOURCE_UNSUPPORTED_CONFIRMED` (CSA:725), `P04_SOURCE_DID_NOT_PUBLISH_BENCHMARK` (CH:641).

**Ranh giới (D-AN-01 §1.4):** chỉ thống kê mô tả trên chuỗi engine đã phát ra; không tính lại PnL/fill/objective; không chạy lại θ*.

## 4. Đợt B3 — fact nguồn cho màn (CG-FG; join trước, tính sau)

Chi tiết + locator: `A1_cg_fg.md`. Thứ tự:

| # | Id | Việc |
|---|---|---|
| 1 | CG-FG-S04-02 | coverage dataset: join run ↔ `preflight_manifests.snapshot` (range, rows, gaps, missing_bar_count, columns) |
| 2 | CG-FG-S08-01 | `FoldSegment.params_digest` join từ progress `selection.params_digest` |
| 3 | CG-FG-S10-03 | lineage `claim.family` dùng lại derivation của compare |
| 4 | CG-FG-S03-01 | progress `planned_folds[]` chiếu từ split `fold_plan` (total đã có) |
| 5 | CG-FG-S03-02 + S04-01 | **một** projection `claims[]{kind, FORECAST\|ISSUED, text}` (FORECAST từ atlas mode×schedule, ISSUED từ ClaimStrip seal) cho progress và hub P04 |
| 6 | CG-FG-S06-05 | `pool.frozen_at_utc_ms` từ journal progress |
| 7 | CG-FG-S06-02 | `Parameter.levels` P04 = (max−min)/step+1 (decimal) |
| 8 | CG-FG-S06-06 | `Trial.params_digest` (canonical như `stage4-binding.ts:83`); seed từng trial là engine → publish seed study kèm scope |
| 9 | CG-FG-S06-01 | `selector_confidence` CONFIRMED/INFERRED |
| 10 | CG-FG-S06-03 | `surface.grid` (mean IS objective / ô 2-D) từ trial retained, rule có tên (tiền lệ `importance`) |
| 11 | CG-FG-S11-02 | compose `selected_params.param_set_id` + `selected_trial_number` (chỉ compose; pack cũ bất biến) |
| 12 | CG-FG-S14-04 | registry `total` + `next_cursor` |
| 13 | **BR-D4-1** (= CG-FG-S02-02) + CG-FG-S04-07 | biên bar thật + số bar mỗi cửa sổ + window disclosure từ snapshot P08/HMD (metadata, không scan) |
| 14 | **BR-D4-3** | `submission_constraints`: max_span_days 92, fold_bounds {2,16}, tf 1h (đang chỉ ở `delta-wfo.profile.ts:43-48`) |
| 15 | CG-FG-S08-03 | P04 replay: publish phần có (bars, trades), phần còn lại vắng có mã |
| 16 | CG-FG-S09-02 | `EquityV2.digest`; path chỉ tên logic, không locator (Bobby xác nhận) |
| 17 | S03 trial rate | thêm `rate_trials_per_s` vào payload `trial_completed` (producer đã tính `eta_s`, `research_run_producer.py:215-217`) |
| 18 | CG-FG-S04-04 | đóng: P04 một cửa sổ → `NOT_APPLICABLE` |

## 5. Đợt B4 — contract/khác ≤P21

| Id | Việc |
|---|---|
| **CG-FG-S10-02** | **ĐÓNG won't-do (Bobby 2026-10-01, VD-F1-02):** không làm `lineage_status` / `superseded_by`; FE bỏ chip lifecycle khỏi node, chỉ hiện trạng thái attempt (đã có `attempt.state`) và lifecycle version ở tiêu đề band. Gỡ khỏi mọi danh sách việc |
| **BR-TXT-01** | Bobby giảm chữ hard-code ở FE (VD-TEXT-01). Chữ **do server trả** quá dài cần bản ngắn: S09 ghi chú "Net return and drawdown are the retained final-account path…" (58 chữ) → ≤12 chữ (hoặc mã lý do để FE tự có câu ngắn); mọi `reason`/`note` dài >20 chữ trong report/compare/search read nên có dạng ngắn. Không đổi nghĩa; contract additive. Danh sách FE đã gặp (F1b): S08 `execution_state` gap reason 25 chữ; S06 `oos_use` condition 20 chữ và ghi chú ledger ~27 chữ/trial (chiếm phần lớn trang 400 trials); S13 trajectory 14 chữ, markets `result.caption` 15 chữ, pair refusal ~40 chữ; S04 câu claim in hai lần ở tab Claim và `rule.description` của verdict; S12 `AtlasNotPublishedFact` chỉ có `reason` — **thêm `reason_code`** để FE hiện chip mã thay vì câu; S01 claim sentences |
| CG-P21-01 | fixture canonical pack / seal (201+replay) / Problem / compose-unbound/-missing/-partial-seal |
| CG-P21-03 | khai ETag compose/pack trong OpenAPI (qua `sendRevalidatable`, phủ cả body) hoặc bỏ header |
| CG-P21-04 | `description` cho `Problem.error.message`: "diagnostic; not UI copy" |
| CG-FG-P22-01 | sửa câu handoff CO:39 (`downstream_code` ở top-level) — hoặc thêm `details` vào Problem nếu cần |
| CG-FG-S12-02 | đóng N/A (không contract nào có `CandidateSelector`) kèm trỏ `atlas.modes[]` |
| CG-RF02-05 | `test-p02-python-pin.sh:9` đang mặc định image dev (quantbt 1.0.8) → image pin 1.1.1 |
| **CG-P02-02 + CG-P08-02** | **preflight nhận requested-spec v2 (rolling window, purge/embargo, inner folds) nhưng create P10 từ chối mọi spec v2** (`run-admission.service.ts:215-222`) → không run nào dùng được các tùy chọn đó dù S02 cho chọn. Hoặc cho create nhận v2 (cùng kiểm như preflight), hoặc preflight từ chối sớm cùng mã — không để lệch |
| CG-P23-T12-01 | admission child `AUDIT_OF_SELECTION` từ θ* đã pin (idempotent, chung budget/fencing, không chọn lại) — hoặc typed `NOT_PUBLISHED` |
| T14-EXP | `recordExposureFact` (`repository.ts:4304`) chưa có caller production → producer hoặc Bobby cho N/A |
| MIG-075/076 | mọi DB khác :8095 từng chạy 068/069 cũ: sửa sổ `pgmigrations` trước deploy (không idempotent) |

## 6. Đợt B5 — P23 / P24 (Codex)

Theo `A4_p22_p24.md` §3 (thứ tự đã đề xuất): ledger hygiene → gom quyết định Bobby một lần → export guard (B1 #13) → T12/T14 → F5-502 (đường thật đã có: `alpha-analysis.client.ts:61-93` trả 502 khi analyser lỗi ngoài 401/403) + F5-rest → **đóng băng một candidate** rồi retake P23 trên đúng nó (W06/T01×2, T08, T09, T15, T10 đầy đủ, **F3 54/54 cùng Claude**, T12, T14 — hiện receipt PASS nằm rải trên ≥8 image: P23-AGG) → V11-P23-DR (recompute WFO trực tiếp) → V11-P23-GX (thu hồi 22 identity, teardown) → P24 theo thứ tự §3.9 → signed-release rehearsal (Bobby cho phép).

## 7. Không làm được trong Portal (ghi rõ, không để treo mơ hồ)

| Id | Cần gì | Chủ |
|---|---|---|
| E5-O1 | max drawdown từng candidate (engine `walkforward.py:2046-2150` chỉ giữ sharpe/turnover/trade_count) | QuantBT |
| E5-O2 | K hiệu lực + membership pool cho mode 3/4/5 (chưa profile nào chạy) | QuantBT |
| D6 / sampler trace | search cinema S06 | QuantBT |
| CG-FG-S06-04 | parameter interactions (fallback proxy \|ρ\| cần Bobby OK) | QuantBT / Bobby |
| AN-25 | IS equity của candidate được chọn (WFO) | QuantBT |
| T07 / T13 / P24-T05 | engine pin thứ hai | QuantBT / ops |
| OL-24 | host research-dev | ops |
| OL-01 / F10 | bật Production | Bobby / ops |
| S14-RW-OPS-01 | origin localhost cho preview | ops |
| E6-BR-01 | ký / SBOM thật | P24 |

**Bobby quyết (gom một lần):** BR-D4-2 · E10-O2 · E10-O3a · E10-O4 · E13-O3 (`CLONE_OF` migration 078+) · `candle_overview` vs `market_overview` · E5-O6 · D5 · CG-P21-05 / CG-FG-S11-03 (VD-FG-01-26) · CG-FG-S10-04 (VD-FG-01-18) · CG-FG-S02-01 / S04-06 (chính sách cert cap) · CG-FG-S08-02 (E16-R1 đã đóng per-bar) · CG-FG-S09-02 (lộ path) · AN-29 backfill · owner ≤P21 nếu muốn trả về Claude.

## 8. Dọn sổ (docs; làm cùng mục liên quan — cập nhật, không xoá, A13.1)

Unified: U:3636 (board P23), U:3637 (P24 → Codex), U:3691 (OL-12), U:3692/3695 (T02-01/T12-02 đã xong — mig 077), U:3693/3696 (T05-01/T03-01 cần note supersede), U:3701 (CG-FG-S04-03/04/05: 03 xong qua E11, 04 N/A, 05 → BR-AN-01), U:3712 (CG-FG-R2-01 xong `0b868c6f`), U:3756 (OL-24: lý do thật là host), U:3782 (E11 rolling Sharpe63 → supersede D-AN-01), U:3957-3959 (§G "(c) chờ Codex" đã đóng), dòng P10 U:3623 (CG-P10-01 xong `996eef6c`), U:3625 (CG-P12-01 `status_counts` đã phục vụ từ `c81e8dc2`), board RF-03 U:3615 (CG-RF02-01 xong `ad7491cf`). Evidence: `P21/thanhvuong-backend-requests.md` (CG-P21-02 xong `f1deb763`), `P22/…:156-168`, `P23/…:165-175` + debt-register JSON, `P23/frontend-handoff-claude.md` §3–4, `CODEX_REQUESTS_FROM_CLAUDE_P11_P15.md:76` (CG-P13-04 → supersede), S14-RW-BR-03 (xong `4e343fe9`), debt-register P02/P04/P05. Chi tiết: §4 của A3/A4, §4 của A2, "STALE" của A1/A5.

## 9. Trạng thái (Codex điền khi làm)

**2026-10-02 current-source continuation:** public rolling v2/fixed/Quarterly
run ids and exact images are in [P10 acceptance](./evidence/P10/B7_B8_TEMPORAL_EXECUTOR_2026-10-02.md).
Eligible v2 self-audit and T14 exposure writer have actual API/DB proof;
the failed longer WFO remains recorded. Migration 085 repairs independently
bounded B6 enrichment (16 focused TS/PG tests; Python 10/1-skip), with a final
workload retake pending. [P05 budget evidence](./evidence/P05/JSONB_SEAL_BUDGET_2026-10-02.md).
Frontend: consume `researchDeclarationEstimatePostV1` / generated
`DeclarationEstimate` for folds, conditions and earliest start; Atlas profile
schema-version/seed/default policy for v2. Keep preflight `may_create_run` as
write authority. Existing `bar-metadata` verified-range/earliest fields, new
QA §16 defects, inner/per-fold execution and linked non-reusable audit remain
open. New metadata availability is not browser acceptance.

| Id | Commit | Test | Contract đổi (Claude cần nối FE) | Ghi chú |
|---|---|---|---|---|
| B7 / BR-D4-1 index foundation | PREVIEW_ACCEPTED `8829f7a0` (scoped foundation, not all DR) | Python 18/18; real HMD 21/21 + three windows; preview 46/46; hook Control API 1,429 pass / 1 skip, contracts 215/215 | New `research-dataset-index.d.ts`: named catalog-v2 / symbols / bar-metadata; V1 unchanged | [Receipt and precise DR-01…10 status](./evidence/P13/B7_DATA_DECLARATION_INDEX_2026-10-01.md). 29 symbols × 7 intervals. Other source adapters, profile conditions/folds and S02 run acceptance remain open. |
| B6 wire absence | PREVIEW_ACCEPTED `8829f7a0` | Availability discriminant, current-source/Hub/Report regressions and real 200/304 parity | `EnrichedAnalysisAvailability` on three generated surfaces | Source/seal/core authority unchanged; no frontend-invented absence reason. Same B7 receipt. |
| S14-RW-BR-01 | `1829f998` | P07 disposable PostgreSQL 9/9; Control API full hook 1349/1349 | Không | ACTIVE same-version register trả replay 201, predecessor không tự trỏ. |
| S14-RW-BR-02 | `a293b4a2` | Alpha analyzer Python 14/14; full hook xanh | Không | Mirror FAIL theo field, không theo aggregate gate. |
| CG-S00-AV-01 | `a293b4a2` | P09 disposable PostgreSQL 7/7; contracts 197/197; forward upgrade 067→078; full hook xanh | `JourneyCard.requires_alpha?: boolean`; fixture v4; Claude nối S00 | Revision 4 bất biến, v3 giữ nguyên; chỉ Alpha Version cần chọn alpha, không cần run. |
| AN-21 | `659bcf6b` | Report focused 11/11; full hook Control API 1356/1356 | Không | New P04 report seals read Hub v3 OOS_SHARPE; old seals immutable. Receipt P18. |
| AN-22 / CMP-V3-01 | `659bcf6b` | Compare focused 13/13; full hook xanh | Không | Only locator-verified P13 OOS Sharpe reaches S13. Receipt P20. |
| CG-FG-S13-02 | `659bcf6b` | Compare 13/13; contracts 197/197 | `ResearchCompareRun.certification` AVAILABLE grade A–D when progress claim ISSUED | Typed absence otherwise; Claude nối S13. Receipt P20. |
| X7 / WS-LEAK-01 | `659bcf6b` | Report + W6a 33/33; full hook xanh | `ResearchReportExportStatus.download_href` requires workspace_id | Worker/status/download remain workspace scoped. Receipt P18. |
| CSRF-DOC-01 / CG-FG-S14-01 | `659bcf6b` | Contracts 197/197 | Four write OpenAPI/generated clients now use `x-portal-csrf` | Runtime unchanged; Claude regenerate consumer. Receipt P10. |
| CG-FG-S05-01 | `659bcf6b` | S05 helper 4/4, service 6/6, W3 17/17; full hook xanh | `ResearchCurrentSourceSplit.guards.train_test_disjoint?` PASS/FAIL/NOT_CHECKABLE | Canonical PASS/FAIL fixture; Claude remove inferred tick. Receipt P14. |
| CG-FG-S10-01 | `21cc985a` | P19 10/10; P22 disposable PostgreSQL 1/1; contracts 197/197; full Control API 1356/1356 | `PromotionPick.selected_trial_id`, `selected_params_digest` plus typed availability | Exact P22 receipt and matching P13 selection only; no approval-digest substitution. Receipt P19. |
| CG-FG-S14-02 | `8deebbd3` | P07 disposable PostgreSQL 9/9; contracts fixture/schema | `RegistryEntry.may_activate_reason?`; `RegistrationResponse.may_activate_reason?` | Role, imported-source and current-active lifecycle fact; Claude bind S14. Receipt P07. |
| CG-FG-S14-03 | `8deebbd3` | P07 disposable PostgreSQL positive/DENIED | `RegistryEntry.run_admission?` | Version-level P10 precheck, not a preflight authorization. Link behavior VD-FG-01-32 pending Bobby. Receipt P07. |
| LEGACY-EXPORT-SEC | BLOCKED_BY_AUTO_REVIEW | Read-only source inspection: GET writes ZIP without workspace/owner | None | Retire-to-410 change was rejected as service-disrupting; request Bobby's exact approval before changing endpoint. No workaround. |
| BR-AN-01 / AN-01…15, AN-28 | `1577a765` | Pinned QuantBT Python focused pass; Control API build; contracts v2 2/2; WFO report 23/23 | `summary_analytics_v2?: ResearchRetainedAnalyticsV2` in Evidence/Current Source, v2 origin/provenance/curves/typed absence; S04 FE bind | All-time OOS from source-time worker, no new HMD call/read-time math. Receipt `evidence/P13/BR-AN-01_backend_receipt_2026-09-30.md`. |
| AN-19 / S01 | `1577a765` | Run Library 21/21 | `RunLibraryItem.last_30d?` points/return/Sharpe/digest/availability | Only S01 card is 30D; old seal typed absence; Claude FE bind. |
| AN-20 / S09 | `1577a765` | Report focused 13/13; WFO 23/23; OpenAPI parity | `FrozenCoreV2.metrics[]` adds v2 fact ids and `PORTAL_DERIVED`; up to 40 rows | New seals use v2 all-time headline, old seals remain immutable and keep fold-mean label. |
| AN-23 / S13 | `1577a765` | Disposable PostgreSQL compare 5/5; service 13/13 | Common-window `OOS_SHARPE` definition `research.compare.metric.v2.common-window-utc-daily-sharpe-365` | Exact UTC-day close, sample std, annualisation 365, typed absence; Claude FE bind. |
| AN-24 / P04 | `1577a765` | Python focused pass; Report 13/13 | New fixed report/source per-fold state `NOT_APPLICABLE` | Single IS/OOS window is structural, not missing engine data. |
| AN-16…18 / AN-25 / AN-27 / AN-29 | `1577a765` boundary | V1 compatibility WFO 23/23; v2 schema 2/2 | V2 omits rolling fields; selected-candidate IS and candidate DD stay typed absent | Claude removes obsolete rolling UI; QuantBT owns AN-25/27; AN-29 backfill awaits Bobby, default typed absence. |
| LW-01 | ACCEPTED `d5c4e1f3` | Focused 11/11 plus real preview HTTP 200: R-WFO-020 trial_count=400, 200+200 distinct rows, both <1 MiB | `Search.diagnostics.probe` maximum 464; generated TS type unchanged | Exact image/response receipt: `evidence/P15/LW-01_search_400_trial_bound_2026-09-30.md`. |
| LW-02 | ACCEPTED `9ea4351e` | Full hook 1376/1376; preview R-WFO-020 HTTP 200 twice, same report revision, retry row SEALED/attempt 1, migration 079 | Completed WFO report repair with durable RETRY/FAILED/SEALED and 60-second cooldown | `evidence/P18/LW-02_report_repair_receipt_2026-09-30.md`. |
| LW-03 | BLOCKED_BY_ENGINE_SOURCE | Read-only source audit: 2,212 rows dropped by QuantBT before Portal reads lifecycle Parquet | No fake OOS-generation record or false freeze seal | Engine must retain OOS-generation fact per fold; `evidence/P17/LW-03_child_audit_source_boundary_2026-09-30.md`. |
| LW-04 | ACCEPTED `fa783327` | Full hook Control API 1378/1378; exact-HEAD preview sparkline HTTP 200, 1,440 OOS; three old-seal derived reads typed absent | Internal sealed `derived_scope` marker; no browser contract change | Source-time OOS union + old-seal typed absence + S01 retained sparkline OOS query. `evidence/P13/LW-04_oos_scope_2026-09-30.md`. |
| LW-05 | ACCEPTED `4df0074f` | Full hook 1381/1381; QuantBT Python 67/67; exact-HEAD preview Progress/Search HTTP 200 with selected source trial 393 and J −4.7969 | Optional `ProgressFoldSelection.source_trial_id` and `objective_kind`; Claude binds FE without design change | Journal ordinal 394 = source id 393; raw best IS +4.948 is separately labeled; `evidence/P11/LW-05_selection_scope_2026-09-30.md`. |
| LW-06 | ACCEPTED `d88121e6` | Full hook 1384/1384; pinned-preview Library GET 200: R-WFO-020 `trade_count=19`, label `OOS fold trades`, scope OOS, exact definition | `RunLibraryItem.stats[TRADE_COUNT].label`; Claude keeps audited records/transitions separate | `evidence/P20/LW-06_trade_scope_2026-09-30.md`. |
| LW-07 | ACCEPTED `d88121e6` | Full hook; Atlas contracts; pinned-preview Atlas GET 200: P04/WFO ENABLED, WFO trial 2–400, seed 42, 92 days, folds 2–16 | Current Atlas `portal_admission` with P04/WFO flag/seed/trial/temporal facts; historical arm unchanged | Claude binds S02 to Portal admission, not source fixed-profile catalogue. `evidence/P09/LW-07_portal_admission_2026-09-30.md`. |
| LW-08 | BACKEND_BOUNDARY_PROVEN / FE_MAPPING_PENDING | Read-only preview GET legacy + Research Library and row-authority check | No backend contract change; Claude binds Research shell count to workspace-scoped Library | Do not import cross-workspace legacy row or fabricate status; legacy security slice separately gated. `evidence/P12/LW-08_legacy_count_boundary_2026-09-30.md`. |
| CG-FG-S04-02 | BACKEND_ACCEPTED `acd34065` | Full hook Control API 1386/1386; P13 PostgreSQL 5/5; exact-HEAD R-WFO-020 Evidence GET 200: 2484 rows, 0 gaps/missing | `EvidenceHub.core.dataset_coverage?: DatasetCoverage` with `FULL_SNAPSHOT_QUERY`; typed old-seal absence | Claude binds S04 panel to coverage even when whole P13 Hub source-evidence is NOT_PUBLISHED. `evidence/P13/CG-FG-S04-02_dataset_coverage_2026-10-01.md`. |
| CG-FG-S08-01 | BACKEND_ACCEPTED `38c4a611` | Full hook contracts 202/202, Control API 1387/1387 (1 skip); exact-HEAD R-WFO-020 Progress/Freeze/Replay GET 200 parity | `FoldSegment.params_digest` + typed `params_digest_reason_code` from immutable global-study selected parameter seal | Same canonical digest as Progress/Freeze on real WFO; **not** runtime OOS-generation proof (LW-03). Claude binds S08 strip. `evidence/P17/CG-FG-S08-01_fold_params_digest_2026-10-01.md`. |
| CG-FG-S10-03 | BACKEND_ACCEPTED `2ad6ce1a` | Full hook contracts 202/202, Control API 1388 passed (1 skip), P19 PostgreSQL 3/3; exact-HEAD R-WFO-020 Lineage GET 200 | `RunFacts.claim.family`, `family_origin`, `family_availability`; one shared conservative P19/P20 rule | Real WFO source-attested; 23 other attempts typed `NOT_PUBLISHED`. Claude binds S10. `evidence/P19/CG-FG-S10-03_claim_family_2026-10-01.md`. |
| CG-FG-S03-01 | BACKEND_ACCEPTED `4ad9ac59` | Full hook contracts 203/203, Control API 1390 pass/1 skip; exact-HEAD R-WFO-020 Progress GET 200 with 9 admitted windows | `ProgressRunIdentity.planned_folds` from immutable P08 topology; 128 bound and typed absence | Claude binds planned Gantt rail separately from observed `progress.folds`. `evidence/P11/CG-FG-S03-01_planned_folds_2026-10-01.md`. |
| CG-FG-S03-02 / S04-01 | BACKEND_ACCEPTED `30d56092` | Full hook Control API 1394 pass/1 skip; exact-HEAD R-WFO-020 Progress/Evidence GET 200 | `ProgressRead.claims?: MethodologyClaim[4]`, `EvidenceHub.claims?: MethodologyClaim[7]`; FORECAST Atlas, ISSUED sealed QuantBT, typed absence | Claude binds S03/S04; no singular-claim string parsing. `evidence/P13/CG-FG-S03-02_S04-01_claim_strip_2026-10-01.md`. |
| CG-FG-S06-05 | BACKEND_ACCEPTED `bfee4737` | Full hook Control API 1394 pass/1 skip; exact-HEAD preview WFO Search GET 200 | `Search.pool.frozen_at_utc_ms/source/reason_code?` | P11 S4 source-clock event; real timestamp 1790796223840. `evidence/P15/CG-FG-S06-05_S06-02_backend_receipt_2026-10-01.md`. |
| CG-FG-S06-02 | BACKEND_ACCEPTED `bfee4737` | Same hook; exact-HEAD preview P04 Search GET 200 | P04 `Search.Parameter.levels?` | Eight exact-decimal levels, including window=21/rvol=16. Same P15 receipt. |
| CG-FG-S06-06 | BACKEND_ACCEPTED `2d4744bc` | Full hook 1397 pass/1 skip; exact-HEAD preview R-WFO-020 HTTP 200 | `Trial.params_digest?`, `Search.search_contract.requested_seed?` | Canonical digest and request-scoped seed 42; no per-trial seed. `evidence/P15/CG-FG-S06-06_S06-01_S06-03_backend_receipt_2026-10-01.md`. |
| CG-FG-S06-01 | BACKEND_ACCEPTED `2d4744bc` | Same hook and preview | `Search.search_contract.selector_confidence?` | Source CONFIRMED; typed NOT_PUBLISHED if absent; no fabricated INFERRED. Same receipt. |
| CG-FG-S06-03 | BACKEND_ACCEPTED `2d4744bc` | Same hook; preview 1/200-row page parity, both <1 MiB | `Search.surface.grid?` | 6×6 named rule, 389 COMPLETE trials in 36 cells, independent of page. Same receipt. |
| CG-FG-S11-02 | BACKEND_ACCEPTED `ae715219` | Full hook 1397 pass/1 skip; exact-head preview WFO Compose GET 200 | `ComposeResponseP21.selected_params` (trial number + typed param-set absence) | Source trial 393 displays 394; sealed packs unchanged. `evidence/P21/CG-FG-S11-02_backend_receipt_2026-10-01.md`. |
| CG-FG-S14-04 | BACKEND_ACCEPTED `84cdb199` | P07 isolated PostgreSQL 10/10 on 201 rows; contracts 6/6; full hook Control API 1397 pass/1 skip; exact-HEAD preview GET 200 total=3/filter total=1/invalid cursor 400 | `ResearchAlphaRegistryV1.total`, `next_cursor`; GET `cursor` query | Signed workspace/filter-bound 200-row keyset; Claude binds S14. `evidence/P07/CG-FG-S14-04_backend_receipt_2026-10-01.md`. |
| CG-FG-S04-07 | BACKEND_ACCEPTED `3d3a7950` | Focused Control API 15/15; contracts 204/204; P13 PostgreSQL 5/5; exact-head isolated preview P04/WFO GET 200 | `EvidenceHub.core.window_disclosure?: WindowDisclosure` | Retained P08 per-fold IS/OOS bars; fold-window sums explicitly may overlap; P04 holdout count DENIED; old manifest typed absent. `evidence/P13/CG-FG-S04-07_window_disclosure_2026-10-01.md`. |
| BR-D4-1 / CG-FG-S02-02 | PARTIAL / INDEX_FOUNDATION_AVAILABLE `8829f7a0` | Exact 29-symbol × 7-interval index and named window/warmup reads, 46/46 real preview GETs | New generated dataset index DTOs; Claude binds S02 | Supersedes BLOCKED_BY_HMD_INDEX. Exact metadata now available; earliest admissible start/profile-aware fold/conditions and S02 new-run acceptance remain B7 work. Do not infer bar edges from month partitions. |
| BR-D4-3 | ALREADY_DELIVERED `d88121e6` (LW-07) | P09 Atlas current-release GET 200 on pinned preview | `PortalAdmission.profiles[]`: WFO 92 days, folds 2–16, 1h, weekly, expanding | Claude bind Portal admission; QuantBT `current_release.submission_constraints` has different authority. `evidence/P09/LW-07_portal_admission_2026-09-30.md`. |
| CG-FG-S08-03 | BACKEND_ACCEPTED `b4965e34` | Full hook Control API 1401 pass/1 skip; contracts 204/204; exact-head isolated preview P04 Replay GET 200 | `ResearchReplayResponse.execution.counts?`: OOS bars, scoped child-tape trade count, typed ledger absence | Real P04: 744 bars, 45 `CHILD_TAPE` trades reported, no audited order/fill/trade/event ledger. Claude binds S08 without interpreting reported trades as records. `evidence/P17/CG-FG-S08-03_replay_counts_2026-10-01.md`. |
| CG-FG-S09-02 | CODE_READY / NEW_SEAL_RECEIPT_PENDING | P05 now hashes actual `series/stitched.parquet` bytes and seals digest, size, logical name and scope in `current_source_summary`; P18 WFO `EquityV2.digest` reads that sealed fact | `CurrentSourceEvidence.source_series_artifact`, `ResearchReportFrozenCoreV2.equity.digest`; old seals typed `NOT_PUBLISHED/P05_SEAL_PREDATES_SOURCE_SERIES_BYTE_DIGEST` | Golden-tape QuantBT 1.1.1 byte-hash test and focused Control API/OpenAPI tests passed. Need one fresh isolated HMD-backed WFO seal/Report receipt before product acceptance. [Receipt](./evidence/P05/CG-FG-S09-02_source_series_digest_2026-10-01.md). |
| S03 trial rate | BACKEND_ACCEPTED `b4965e34` | Python progress/W2 45/45; contracts 204/204; full Control API hook 1401 pass/1 skip; exact-head preview old WFO GET 200 with correctly absent rate | `trial_completed.rate_trials_per_s?` and `ProgressSnapshot.overall.rate_trials_per_s?` | Monotonic-time cumulative source throughput; old journals remain nullable/absent. Claude binds S03; a fresh WFO is needed for a non-null real-run rate. `evidence/P11/S03_trial_rate_2026-10-01.md`. |
| CG-FG-S04-04 | BACKEND_ACCEPTED `b4965e34` | Evidence focused regression + full hook; exact-head P04 Evidence GET 200 | No schema change | One P04 window has structural `NOT_APPLICABLE` per-fold metrics, not a source gap. `evidence/P13/CG-FG-S04-04_P04_fold_absence_2026-10-01.md`. |
| CG-P21-03 | CODE_READY | P21 compose/pack no longer emit incomplete ETags for mutable response bodies; `private, no-store` remains | Controller regression asserts absent ETag; OpenAPI response descriptions corrected | [Endpoint census](./evidence/P23/BE_GAPS_SOURCE_ENDPOINT_CENSUS_2026-10-01.md). |
| CG-P21-04 | CODE_READY | P21 OpenAPI Problem `error.message` is diagnostic-only, not public UI copy | Contract description updated; no FE copy changed | Same census. |
| CG-FG-P22-01 | DOCS_CORRECTED | Compose/pack handoff now names top-level `publication.downstream_code`, not fictitious `details.downstream_code` | Contract/UI shape unchanged | `evidence/P22/frontend-handoff-codex-closeout.md`. |
| CG-RF02-05 | VERIFIED_LOCAL | P02 pin script resolves cached QuantBT 1.1.1 qualification image to immutable image ID | Exact BAR05 environment report passed on Python 3.12.14 | Same census; no image build. |
| CG-FG-S12-02 | NOT_APPLICABLE | No Research contract defines `CandidateSelector`; P09 Atlas `modes[]` is the source of declared modes | Do not fabricate a selector | FE must read typed Atlas. |
| CG-P02-02 / CG-P08-02 | PLANNING_ONLY / EXECUTOR_GAP | P08 preflight can structurally validate v2 temporal controls, but P10 admission returns `may_create_run:false` with `RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE`; atomic create rejects the same mode | Do not claim v2 executable because schema accepted; existing W4 tests cover refusal | Backend could refuse earlier, but that would remove the useful structural preview. An actual v2 executor remains a separate source/worker task. |
| Research endpoint census | PARTIAL_RUNTIME_PROOF | 48/48 external method/path parity; 29 read-only GET responses across 25 named operations on real P04/WFO preview runs | P10 profile/parameter scope and unprobed SSE, export, publication, preflight token and write paths remain explicit | [Receipt](./evidence/P23/BE_GAPS_SOURCE_ENDPOINT_CENSUS_2026-10-01.md). |
| CG-FG-S09-02 release | NEW_SEAL_RECEIPT_PENDING | New P05 byte digest cannot appear in already sealed WFO runs | Fresh isolated WFO import/seal then Evidence/Report parity required | [P05 receipt](./evidence/P05/CG-FG-S09-02_source_series_digest_2026-10-01.md). |


## Yêu cầu mới từ đợt F2b (Claude, 2026-10-01) — từ chữ ký "Backend request" §5

Dữ liệu thật đã kiểm (R-WFO-017, R-P04-018): route `close_target_v2` trả `orders/fills/trades = 0`, chỉ có `TransitionRow` (ENTRY/EXIT/FLIP/RESIZE); `route_capabilities` (orders, fills, trades, sl_tp_ambiguity, oco_tree, mae_mfe…) đều `NOT_PUBLISHED` kèm mã lý do. FE đã vẽ đủ mọi loại transition được trả và hiện từng khả năng vắng thành chip có mã lý do; **không** vẽ order/fill/SL/TP vì không có dữ liệu.

| Mã | Cần gì | Vì sao FE cần | Đề xuất nhỏ nhất | Hiện FE làm gì |
|---|---|---|---|---|
| BR-S08-01 | Sổ lệnh `orders`, `fills` và lệnh điều kiện (SL/TP/OCO cha→con, giá kích hoạt, mơ hồ intrabar) cho các route có chúng (`intrabar_bracket_v1`, `event_lifecycle_v2`, `reactive_r2`, `dca_ladder`; **không** `close_target_v2`) | Bobby: marker vào/thoát lệnh phải đủ entry, exit, order, fill, lệnh điều kiện nếu QuantBT có | Cùng dạng phân trang con trỏ như `TransitionRow`: `source_ordinal`, `at_utc_ms`, `side`, `price`, `qty`, `status`, `parent_id`, `trigger_price` | Chip năng lực "orders / fills / SL-TP / OCO — not published" + mã lý do |
| BR-S08-02 | `is_window`, `oos_window`, `holdout_window` trên phản hồi replay: `start_utc_ms`, `end_utc_ms`, `bars`, `availability` | S08 phải bám ba window; hiện IS bar count là "not published" và ranh giới lấy từ hợp đồng split | Ba object cùng dạng, `holdout` có lý do khi bị giữ lại | FE ghép từ split |
| BR-S08-03 / S09 | `alpha_id` (và `alpha_version_id`) tường minh trên replay và trên danh tính report | Link S08→Compare/Lineage và S09→Lineage đang dựa vào dòng hiển thị `alpha` | Thêm field | S09 dùng giá trị `alpha` trong identity; S08 không link được |
| BR-S04-WIN | Hub S04 chưa có dữ liệu theo window: series và chỉ số IS / holdout | Công tắc window IS/OOS/Holdout của hub chỉ OOS có dữ liệu | Publish theo window kèm mã lý do (liên quan CG-FG-S04-07 `window_disclosure`) | Chỉ OOS; IS/holdout dẫn sang S05/S08 |
| BR-S11-01 | `promotion_pick` thiếu `fold` (trial id của WFO tính theo fold) và route tới approval | Chip pick không link được tới trial S06 / approval | `fold`, `approval_href?` | Chip chỉ hiển thị |
| BR-TXT-02 | Câu server của S09 "Net return and drawdown are the retained final-account path…" (~58 chữ) | Bobby: bớt chữ | Biến thể ≤ 12 chữ | Hiển thị nguyên văn |

## Yêu cầu mới từ đợt F3 (Claude, 2026-10-01)

| Mã | Cần gì | Vì sao FE cần | Hiện FE làm gì |
|---|---|---|---|
| BR-F3-01 | S02: `submission_constraints` của Atlas đang cũ (accepted_trial_count 1, seed MUST_BE_NULL) trong khi server nhận 400 trial / seed 42; cần fact theo profile (`portal_admission.profiles` đã có LW-07 — xác nhận dùng làm nguồn khoá trials/seed) | HiFi "pinned by protocol": ô trials/early-stop/seed chỉ đọc khi profile cấm chỉnh; khoá theo dữ liệu cũ sẽ chặn run hợp lệ | Ô vẫn chỉnh được (02-15 chưa làm) |
| BR-F3-02 | S05: verdict `guards.purge_applied{verdict,basis,boundary_count}` và `guards.embargo_respected{verdict,basis}` | HiFi hàng "boundary integrity ✓"; FE không tự vẽ ✓ | Chưa hiện hàng |
| BR-F3-03 | S10: nhãn attempt (vd `att_03`) trên `LineageAttempt` | HiFi in `att_03 · R-WFO-118` | In `ratt_9c3f2081 · R-P04-001` |
| BR-F3-04 | S04: facts cho phụ đề tab hub — holdout seal state, trials/fold, freeze digest count/order verdict | HiFi "5 folds · holdout sealed", "600 trials / fold" | `state · fold N` |
| BR-F3-05 | Manifest artifact của engine (HiFi 10, hiện 2) | S04 tab claim | Hiện 2 |

## 10. Addendum 2026-10-01 — security, LW-03 and AN-29 (supersedes older row statuses)

| Id | Current verdict | What is actually done | Remaining acceptance |
|---|---|---|---|
| LEGACY-EXPORT-SEC | CODE_ACCEPTED `fc76a1a9` | Legacy GET no longer writes ZIP; workspace/admin authorization, CSRF POST prepare, read-only GET and atomic ZIP publish passed Python 2/2, disposable PostgreSQL 1/1 and full Control API hook 1403 pass/1 skip. [Receipt](./evidence/P23/LEGACY_EXPORT_SECURITY_AND_REMAINING_HANDOFF_2026-10-01.md). | Frontend link must use prepare→download or remain hidden; no production deployment yet. Supersedes `BLOCKED_BY_AUTO_REVIEW` above. |
| LW-03 | CODE_READY / NEW_RUN_RECEIPT_PENDING | Portal now requests a bounded 20,000-row QuantBT lifecycle ledger (instead of default 2,000) and preserves OOS-generation records in its 64-per-fold sample. Focused Python regression passed. [Receipt](./evidence/P17/LW-03_new_run_custody_2026-10-01.md). | An old child that already dropped 2,212 rows cannot be repaired; fresh pinned HMD WFO must prove ≥1 OOS-generation fact per fold and a successful S11 seal. Supersedes `BLOCKED_BY_ENGINE_SOURCE` above for **new** runs only. |
| AN-29 | PREVIEW_ACCEPTED (R-WFO-020 only) | Migration 081 and dry-run/apply completed on :8095. Corrected image `78d69930` passed real Evidence/Library parity; old seal-summary checksum, Freeze, Replay source content and frozen Report core unchanged. [Receipt](./evidence/P13/AN-29_immutable_sidecar_v2_2026-10-01.md). | Not production or all historical seals. FE binds supplemental Evidence facts; do not rewrite old frozen Reports. |
| CG-P21-01 | CODE_READY / CANONICAL_FIXTURES_VALIDATED | Service/filter-generated compose state, seal/replay, pack and seven Problem fixtures passed Zod/OpenAPI validation: Control API 12/12, contracts 4/4. [Receipt](./evidence/P21/CG-P21-01_canonical_consumer_fixtures_2026-10-01.md). | Claude consumes the canonical pack in S11 tests; fixture lane does not replace real publication acceptance. |

Frontend handoff: `planned_folds`, `rate_trials_per_s`, S04 `core.window_disclosure`, S09 new-seal `equity.digest`/digest scope/availability, S14 `next_cursor`, workspace-scoped Library count and analytics v2 all-time/last-30D are already published or code-ready as recorded above. Claude should bind them without changing layout and preserve typed absence for old seals. The legacy export button must not issue the old direct GET as a write.

This addendum does not close BR-D4-1, requested-spec v2 executor, T12 audit child, T14 exposure writer, fresh HMD WFO proof, one-candidate P23 retake or P24 signed-release rehearsal. Those remain in B3–B5; no claim that 48/48 route parity proves all parameters/profiles.

### Runtime follow-up — 2026-10-01

`999be160` passed the required full hook (Control API 1,406 pass / 1 skip), was rebased over Claude F3 `5fad25cf`, and landed cleanly on the shared research branch; no remote push. AN-29 was applied additively on :8095 R-WFO-020 only. Real reads exposed an optimized Library query omission, now fixed and verified against the actual DB (26/26 focused tests); API acceptance awaits the corrected image. See [AN-29 follow-up](./evidence/P13/AN-29_immutable_sidecar_v2_2026-10-01.md).

The fresh 400-trial run failed the compact P05 summary limit after optimization. The follow-up coarsens only declared display candles, keeps all retained/source authority facts and the same 64-KiB bound, and adds regression tests. It also makes preview-only nginx re-resolution plus same-origin API readiness mandatory after backend refresh. [Failure/correction receipt](./evidence/P05/WFO_SUMMARY_BUDGET_AND_PREVIEW_GATE_2026-10-01.md). LW-03 / S09 digest / real trial-rate are **not yet accepted** on that failed run; fresh corrected-image proof remains next. Production, frontend and old seals are unchanged.

## Yêu cầu mới từ đợt F4 — khai báo dữ liệu, analytics v2, Library/Report (Claude, 2026-10-01)

Chi tiết từng yêu cầu (mẫu §5): `evidence/P21/audit-2026-09-30/f4/{S02_DATA,S04_AN,S01_S09,MISC}.md`. Dữ liệu thật đã kiểm: `GET /api/v1/research/datasets` chỉ công bố `crypto-binance-1m` (BINANCE, 7 timeframe, 29 symbol: 5 PERPETUAL + 24 QUARTERLY, coverage theo tháng).

| Mã | Cần gì | Hiện FE làm gì |
|---|---|---|
| BR-F4-01 | **Từ vựng timeframe**: catalog trả `1D`, phiên bản alpha khai `1d`; gate `alpha_declaration` so khớp chính xác nên không chip ngày nào chọn được. Công bố chuẩn hoá hoặc bảng ánh xạ trong catalog | Hai chip bị tắt kèm lý do; 1h/4h dùng được |
| BR-F4-02 | Coverage chính xác theo timeframe cho từng symbol: `coverage_by_timeframe[{timeframe, first_bar_utc_ms, last_bar_utc_ms}]` | So với biên tháng; preflight quyết |
| BR-F4-03 | Metadata symbol: `tick_size`, `lot_size`, `contract_multiplier`, `listing_utc_ms`, `expiry_utc_ms` (QUARTERLY) | Hàng symbol chỉ có tên + coverage tháng |
| BR-F4-04 | Chất lượng dữ liệu theo symbol × timeframe: `gap_count`, `missing_ratio`, `as_of_utc_ms` | Chỉ "n of m tháng có dữ liệu" |
| BR-F4-05 | Dataset/venue/asset class khác mà HMD reader phục vụ (hiện chỉ một dataset) | Một dataset → hàng danh tính; nhiều → select |
| BR-F4-06 | Tìm kiếm và phân trang symbol phía server: `GET /research/datasets/{id}/symbols?q=&cursor=&limit=` + `total` | Lọc phía client trên toàn danh sách (29) |
| BR-F4-07 | Số bar theo window và warmup khả dụng trước IS (BR-D4-1) | Không in số bar |
| BR-F4-08 | Ước lượng số fold trước khi chạy cho một khoảng khai báo (hoặc `planned_folds` theo khoảng trong `portal_admission.profiles`) | Hiện khoảng 2–16 từ `fold_bounds`; số chính xác sau preflight |
| BR-F4-09 | Hub P04: `summary_analytics_v2` cho run profile cố định (như Current Source) | R-P04-018 giữ ô cũ |
| BR-F4-10 | R-WFO-020: `turnover_notional`, `sharpe_decay` trong v2 trả vắng dù v1 có turnover 11,646.76 — cùng nguồn v1 hoặc mã lý do | Vắng có mã server |
| BR-F4-11 | Library `last_30d` cho seal v2: R-WFO-020 có `summary_analytics_v2` ở Current Source nhưng Library báo `PORTAL_ANALYTICS_V2_NOT_COMPUTED_FOR_SEAL` (18/18 hàng); hoặc deploy service 999be160 lên preview | Ô "last 30D — not published" |
| BR-F4-12 | Report: luôn trả `equity.digest_availability` (seal cũ: `NOT_PUBLISHED` + `P05_SEAL_PREDATES_SOURCE_SERIES_BYTE_DIGEST`); thêm fixture `research-report` có digest | Không dòng digest, không vắng có mã |
| BR-F4-13 | Progress: `progress.overall.fold {index,total}` để hiện `fold 3/5` | Chỉ phần trăm |
| BR-F4-14 | S13: Sharpe OOS của run P04 (`OOS_SHARPE` + scope window) — 30/40 attempt báo `P20_P04_SOURCE_DID_NOT_PUBLISH_PER_FOLD_OOS_SHARPE` | Cột "single OOS window" hiện vắng có mã |

## 11. Current-source acceptance and F4 sync — 2026-10-01

Supersedes the API-pending AN-29 status in the earlier runtime follow-up: **R-WFO-020 companion is PREVIEW_ACCEPTED** (receipt hash and exact images in the P13 packet). One original seal only; no production rollout. `BR-F4-11` is resolved on the corrected runtime: Library has 19 last-30D points identical to Evidence.

Fresh run `rrun_a76afa62adb6c427ba2f4cec44bb43bd` completed 400 real trials and nine HMD-backed folds; full source-series digest matches frozen Report, cumulative trial rate is `10.090060274`, and source lifecycle dropped zero rows. It exposed a false int/float candidate mismatch. The correction uses historical child scalar kinds in Fold Ordering/Stage-4, changes the Freeze ETag with ordering, and preserves real mismatch detection. P05 also keeps real selection-stage witnesses within its existing 64-record sample. A fresh corrected-image Report/S11 receipt remains required; the earlier frozen Report is not rewritten. [P16 packet](./evidence/P16/CANDIDATE_IDENTITY_AND_CURRENT_SOURCE_CLOSEOUT_2026-10-01.md).

BR-F4-01 is code-ready: catalog returns canonical `1d`; 1D remains schema-compatible and preflight's fixed day duration is identical. BR-TXT-02 is code-ready for **future** frozen Reports (≤12-word affected captions); broader BR-TXT-01 remains partial. Generated preflight description and canonical catalog fixture updated; API shape unchanged.

Claude F4/F5 `fedfac44` is in this BE baseline. No frontend file is edited here. Other F4 requests are not implicitly delivered: exact catalog boundaries/quality need source metadata, P04 v2 Hub, runtime fold counter and old-report digest absence still need their separate named work. No claim of universal parameter/profile availability, P23 aggregate PASS or P24 release completion.

C4 capacity: root 231 GiB free (37%); RAM 16 GiB available; active Research preview and other agents' resources retained. **NO_ACTION_NEEDED** for destructive cleanup. No Docker prune, data/volume removal or production/remote change.

## 12. Real WFO closeout and fixed-profile regression — 2026-10-01

`83201af3` landed fast-forward over Claude `fedfac44`; full hook Control API 1,408 pass / 1 skip and contracts 205/205. [P16 actual-image packet](./evidence/P16/CANDIDATE_IDENTITY_AND_CURRENT_SOURCE_CLOSEOUT_2026-10-01.md) supersedes the new-run-pending statuses above:

| Id | Current result | Real proof / remaining limit |
|---|---|---|
| LW-03 | PREVIEW_ACCEPTED_NEW_RUN | R-WFO-023: 400 trials, 9 folds, source drop=0, each fold one real OOS-generation record, 9 child MATCH, Stage-4 BOUND, S11 local seal/pack. Old dropped records remain unrecoverable. |
| CG-FG-S09-02 | PREVIEW_ACCEPTED_NEW_SEAL | Actual Parquet byte SHA-256/size/scope agrees with frozen Report; no chart/input-digest substitution. |
| S03 trial rate | PREVIEW_ACCEPTED_NEW_RUN | Actual running-child rate `9.152993995`; old journals remain absent. |
| Candidate identity / S11 | PREVIEW_ACCEPTED | Historical scalar-kind hash correct; unknown kinds fail closed; old frozen Report unchanged. RC pack accepted locally, not delivered/approved. |
| BR-F4-01 | CODE_ACCEPTED `83201af3` | Catalog/fixture/generated description canonical `1d`; uppercase compatibility preserved. No blanket timeframe/profile activation. |
| BR-TXT-02 | PREVIEW_ACCEPTED_NEW_REPORT | Future S09 affected captions are ≤12 words; old frozen copy unchanged. BR-TXT-01 elsewhere remains partial. |
| BR-F4-09 / P04 | NEW_BACKEND_FIX_TESTED | P04 actual create failed at combined 24-KiB passport budget. Bounded display-only correction + pinned real-HMD regression passed; corrected-image actual product receipt still required. [P13 packet](./evidence/P13/P04_COMBINED_PASSPORT_BUDGET_2026-10-01.md). |

Fresh WFO API receipt SHA-256 `92d6b6be8570c604be56fa96cbe48c3076421159aa5381c987c0a548ef9cc2ad`; R-WFO-023 `rrun_3d5633d2adb712722fe4ba108102aa5d`. Exact images/response bounds/RC digest in P16 packet. Not every endpoint parameter/profile, P23 aggregate, T12 linked-child/T14 writer, HMD index or P24 release acceptance. Claude must consume the published fields (no Codex frontend edit); frontend visual/browser gates remain independently owned. No remote push or production rollout.

### Fixed-profile runtime acceptance — supersedes the pending row above

`f71f7438` is landed and the corrected Python image passed **R-P04-021**, `rrun_ece579eb6e0538ab5508f154fd3deb23`. P08/P10 actual create, confined child, seal, Hub analytics v2 (14/14 metrics AVAILABLE), Library 19 last-30D points and frozen Report all PASS. Private receipt SHA-256 `f8acd2ad0e51155f2379e4e776f910d0ed57d1c008fd67772dc02f33660e4180`; exact image/profile/windows/digest in [P13 packet](./evidence/P13/P04_COMBINED_PASSPORT_BUDGET_2026-10-01.md). **BR-F4-09: PREVIEW_ACCEPTED_NEW_FIXED_RUN**. Old P04 seals remain honest about missing v2 facts; no historical retrofit.

BR-F4-01 actual catalog GET now PASS with canonical `1d`; BR-F4-11 already PASS on the AN-29 old-WFO companion. Claude should bind these published contracts/new run IDs and record frontend/browser acceptance, not wait for more backend publication or replace missing old-seal facts with zero. Original failed P04/WFO receipts are preserved, not overwritten.

**Still not closed:** BR-D4-1/exact metadata index and related F4 data metadata; requested-spec v2 execution (only structural preflight is currently admitted); T12 linked audit child, T14 exposure writer; broader server copy/old frozen Report digest absence; whole-candidate P23 DR/identity/browser acceptance and P24/release rehearsal. Existing named endpoint census remains 48/48 method/path, not universal parameter/profile proof. No remote push, frontend modification or production rollout. C4 root 228 GiB free, RAM 15 GiB available; active preview/other agents' cells preserved, `NO_ACTION_NEEDED`.

## Điều tra panel "Return distribution" / "Monthly returns" trống (Claude, 2026-10-01) — kết luận: dữ liệu backend, không phải FE

Đã kiểm trên preview thật (43 run, đọc `current-source/evidence` từng run): **R-WFO-022 và R-WFO-023 (seal mới) có `MONTHLY_RETURNS` và `RETURN_DISTRIBUTION` ở `AVAILABLE`** và FE vẽ đúng (histogram 12 bucket `FULL_RETURN_HISTOGRAM_V2`, 1.488 quan sát OOS). **R-WFO-020 và mọi run WFO cũ (R-WFO-009…017, 020)** bị server từ chối cả ba chuỗi dẫn xuất với `PORTAL_DERIVED_SERIES_SCOPE_NOT_OOS` — `current-source.service.ts:1404-1421`: seal cũ không có `derived_scope = OUTER_TEST_UNION_INCLUSIVE_V1`, chuỗi dẫn xuất tính trên cả tape ghép gồm bar trước OOS nên server không gắn nhãn OOS. FE không được và không tự dẫn xuất tháng từ equity (quy tắc: "a month is never reduced from the equity series here"). Analytics v2 sidecar (AN-29) cho các seal này đã có `strategy_curve`/`benchmark_curve`/`behaviour` ở scope OOS nhưng **chưa có hai chuỗi này**.

| Mã | Cần gì | Ưu tiên |
|---|---|---|
| BR-F6-01 | Đưa `monthly_returns` và `return_distribution` (all-time, scope OOS, `PORTAL_DERIVED`) vào analytics v2 sidecar, cùng pipeline `source_fold_table` đã dựng `strategy_curve`, và cho `MONTHLY_RETURNS`/`RETURN_DISTRIBUTION` đọc từ đó với seal cũ. Bobby: phải hiện bằng được, all-time (không rolling 20/60D) | **Cao** — 12 run WFO cũ đang trống |
| BR-F6-02 | R-WFO-023: OOS trải 2026-07-01 → 2026-08-31 (1.488 quan sát = 62 ngày) nhưng `MONTHLY_RETURNS` chỉ có **1 điểm** (tháng 8, `month_start_utc_ms` 1785542400000); tháng 7 bị bỏ. Cần gồm tháng đầu (một phần) với cờ `partial`/số quan sát, hoặc mã lý do vì sao bỏ | Cao — heatmap tháng gần như trống với WFO ngắn |

## 13. Đợt B6 — service `enrich_analysis` (QUEUE TIẾP THEO sau §12; Bobby giao 2026-10-01)

**Spec đầy đủ, contract đề xuất, ER-01…10 và nghiệm thu: [`ENRICH_ANALYSIS_SERVICE_SPEC_2026-10-01.md`](./ENRICH_ANALYSIS_SERVICE_SPEC_2026-10-01.md). Fixture đề xuất: `evidence/P21/enrich-analysis/enriched-analysis.proposed.fixture.json` (số thật của R-WFO-023, hình dạng do FE chốt).** FE đã/đang đọc đúng hình này; backend làm cho khớp rồi gửi fixture canonical.

Bốn quy tắc Bobby: (1) nguồn là dữ liệu thô QuantBT; (2) mọi số cần tính từ thô tính ở **một** service `enrich_analysis`, một đường mã cho mọi lane và backfill; (3) **all-time**, không cắt 30D/60D, không rolling làm số chính (thẻ Library cũng all-time); (4) UI/UX và contract chốt trước, backend theo.

Làm theo thứ tự: ER-01 service → ER-02 sidecar → ER-03 tháng một phần (R-WFO-023 đang thiếu tháng 7) → ER-04 seal cũ hết bị từ chối (R-WFO-020 và 12 run WFO cũ) → ER-05 `analytics_all_time` cho Library → ER-06 drawdown → ER-07 fact còn vắng → ER-08 hub P04 → ER-09 fixture/OpenAPI → ER-10 receipt. **Hợp nhất và thay thế**: BR-F4-09, BR-F4-10, BR-F4-11, BR-F4-14 (phần analytics), BR-F6-01, BR-F6-02, và `last_30d` của D-AN-01 §1.3.

Không đổi: nhóm dữ liệu khai báo run BR-F4-02…08 (coverage theo timeframe, metadata symbol, chất lượng dữ liệu, dataset/venue khác, tìm symbol, số bar/window, ước lượng fold) vẫn là hàng đợi riêng ở trên; cùng nguyên tắc nguồn thô từ HMD.

**Bằng chứng mới cho ER-03 (R-P04-021, run P04 mới của Codex, đã xem trên preview 2026-10-01):** OOS chỉ đúng một tháng (2026-07-01 → 08-01) nên panel "Monthly returns" hiện server text *"No OOS month has a prior calendar month-end close to measure from, so no monthly return exists"* (`not applicable`). Cùng gốc với R-WFO-023 mất tháng 7: tháng đầu bị bỏ vì không có "month-end trước". Với run ngắn (một đến hai tháng — đúng loại đang chạy trên preview) heatmap tháng luôn trống. ER-03 cần cơ sở thay thế cho tháng đầu (vốn đầu kỳ hoặc quan sát OOS đầu) và cờ `partial`, để run một tháng vẫn có một ô có nhãn "partial".

**Đã xác nhận trên preview thật, không cần Codex làm lại:** R-P04-021 hub trả analytics v2 và FE vẽ đủ "Strategy vs benchmark — all time" (Beta 0.01, Corr 0.26, Sharpe 0.74, Sortino 0.61, benchmark +7.36%), phân phối (12 bucket, 744 quan sát), Behavior; Library last-30D 19 điểm. BR-F4-09 và BR-F4-11 được FE chấp nhận (browser acceptance, Claude 2026-10-01).

### BR-F6 implementation — 2026-10-01

BR-F6-01/02 are **CODE_READY / PREVIEW_RECEIPT_PENDING**: append-only migration 082,
operator `--distributions`, generated v2/named chart types and compatible reader.
No seal/AN-29/Report rewrite or strategy rerun. All-time monthly includes the first
partial month; histogram grain is UTC_DAY, not bar count. [P13 receipt and Claude
handoff](./evidence/P13/BR_F6_ALL_TIME_DISTRIBUTIONS_2026-10-01.md). Runtime and
full-hook results are appended only after execution. Claude should consume the
new optional point/provenance fields without treating legacy absence as zero.
Metadata index, executor v2, T12 audit/T14 exposure, whole-candidate P23/P24 stay
open; this slice does not relabel them complete. No remote push or production change.

### BR-F6 runtime closeout — supersedes pending status above

**BR-F6-01/02 PREVIEW_ACCEPTED `cf8dc871`**: all **12 eligible WFO seals** (10 old,
2 newer), append-only migration 082 dry/apply/retry, and real same-origin Hub plus
both named series PASS. R-WFO-023 July/August are present, July partial; histogram
is **61 daily returns from 1,488 OOS bars**, not a relabelled per-bar histogram.
Independent monthly/bin-count oracle and unchanged seal/AN-29/Report/Freeze/Replay
checksums PASS. Full hook: Control API 1,411 pass / 1 skip; contracts 206/206.
Code slice: 29 files, +1,006/−31 (including generated types/fixtures/tests/docs).
[Complete receipt + Claude binding instructions](./evidence/P13/BR_F6_ALL_TIME_DISTRIBUTIONS_2026-10-01.md).

Claude: bind `MonthlySample.partial`/count/basis and
`source_sample.derivation.grain`; do not show 1,488 as the histogram's daily
population. No browser-side derivation, zero-fill or old Report rewrite.
The newer **B6/ER-01…10 spec is preserved and still open**: this reuses its
all-time distribution foundation, not its full `enriched_analysis` delivery.
In particular, P04's existing monthly read is not implicitly fixed by WFO
acceptance, and Library `analytics_all_time`/episodes/supplemental Report remain
the B6 work. Metadata index, executor v2, T12/T14 and P23/P24 remain open.
No Codex frontend edit, remote push or production action.


### Phản hồi của Claude về BR-F6 `cf8dc871` (2026-10-01) — vòng lặp FE ↔ BE

Đã đọc receipt và type sinh ra. FE đang nối: điểm tháng `partial/observation_count/basis`, nhãn histogram "daily returns · n days" (đơn vị là NGÀY, không phải bar), `summary_analytics_v2.distributions`, tail 32 tháng, và cả hai hình (có/không có companion) vì preview chưa apply.

Cần Codex làm tiếp, theo thứ tự:
1. **Apply trên preview và báo lại**: migration 082 + `--distributions` (dry-run → apply) cho R-WFO-020 (seal cũ) và R-WFO-023 (cần tháng 7 một phần). Claude sẽ kiểm trên preview thật ngay khi có receipt; chưa có thì FE chỉ chứng minh bằng fixture.
2. **Gom một service (quy tắc Bobby #2):** companion phân phối được làm riêng (`research_distributions.py`, migration 082, CLI `--distributions`) thay vì nằm trong `enrich_analysis`. Chấp nhận như bước đệm, nhưng ER-01/ER-02 (một service, một sidecar) vẫn là yêu cầu: khi làm ER-01, đưa `research_distributions` và `retained_analytics_v2` về cùng một đường mã/cùng một sidecar thay vì hai bảng + hai CLI.
3. **Hub P04**: R-P04-021 trả monthly `not applicable` ("No OOS month has a prior calendar month-end close…"). Áp quy tắc tháng đầu một phần của BR-F6-02 cho lane P04 (OOS một tháng → một điểm `partial`).
4. Phần còn lại của §13 giữ nguyên: ER-05 `analytics_all_time` cho thẻ Library (all-time, không `last_30d`), ER-06 drawdown episodes, ER-07 fact còn vắng, ER-09 fixture/OpenAPI chuẩn cho khối `enriched_analysis`.

### B6 implementation — shared `enrich_analysis`, 2026-10-01

ER-01…10 implementation and exact frontend binding handoff are recorded in
[P13 B6 receipt](./evidence/P13/B6_ENRICH_ANALYSIS_2026-10-01.md).
Migration 083, deterministic builder, source-time/explicit historical companion,
all-time Library and supplemental Report are **CODE_READY / PREVIEW_PENDING**.
Do not substitute prior BR-F6 acceptance for this new receipt. Original source
seals/reports and 081/082 companions stay immutable; historical P04 declares
sampled coverage, with missing daily ledger typed rather than fabricated.
Generated canonical schemas/types/fixtures provided for Claude's existing UI.
No frontend edit, remote push or production change. Metadata index, executor
v2, T12/T14 and aggregate P23/P24 remain open. Actual gates/receipt and code SHA
will supersede this pending record below after execution.

### B6 backend acceptance — 2026-10-01 (supersedes pending B6)

**ER-01…10 PREVIEW_ACCEPTED**: one immutable source-bound enrichment, all-time
Library, P04 monthly/curves, drawdown and supplemental Report delivered at
`d16058ee` plus the operator-query correction recorded in
[B6 receipt](./evidence/P13/B6_ENRICH_ANALYSIS_2026-10-01.md). Migration 083 applied;
14/14 existing runs dry/apply/retry and API/hash/oracle checks PASS on :8095.
Full required hook: contracts 210/210; Control API 1,419 pass / 1 skip.
Original seals, 081/082 and Report core/Freeze/Replay authority are unchanged.
Historical P04 is explicitly sampled; a complete daily histogram and missing
analytics cannot be fabricated. No new optimizer run or production action.

Claude's BR-F6 follow-up above is answered: 082 was already applied for all
twelve WFO; 083 now gives one common consumer document across all surfaces;
R-P04-021 has its single July partial point; Library all-time, episodes and
canonical contract/fixtures are available on the actual preview. Claude can
bind/test these now using the exact P13 handoff, without changing accepted UI.
Metadata index/BR-F4-02…08, executor v2, T12/T14, aggregate P23/P24 remain next.

### Claude browser acceptance of B6 — 2026-10-01 (bundle `CHbh9dt1`, preview thật)

**FE đã nối và xem trên dữ liệu thật** (không chỉ fixture): S04 hub P04 R-P04-021 hết server text "No OOS month has a prior calendar month-end close…" — tháng all-time + chip `sampled` + episodes; S04 WFO R-WFO-023 tháng 7 một phần vẽ gạch chéo (+1,73%) và tháng 8; S09 R-WFO-023 có mục "All-time analytics — supplemental" (chỉ số, đường cong, tháng, `top 10 / 44` episode, `open · longest`) bên dưới lõi báo cáo đóng băng nguyên vẹn; S01 thẻ vẽ `analytics_all_time` (53 / 58 / 25 điểm). Ghi nhận ER-01…10 **FE ACCEPTED** cho các bề mặt này.

Còn lại cho Codex, theo thứ tự:
1. **Credential `claude-preview`**: sau redeploy 17:45 đăng nhập BFF trả `INVALID_CREDENTIALS` (agent và lane real-API cần nó). Cấp lại / cập nhật `~/.config/portal-research-preview/claude-preview.password` và báo Claude.
2. **BR-F4-02…08 (dữ liệu khai báo run)** — ưu tiên kế tiếp theo Bobby: coverage chính xác theo timeframe cho từng symbol, metadata symbol (tick/lot/multiplier/listing/expiry), chất lượng dữ liệu theo symbol×timeframe, dataset/venue khác ngoài `crypto-binance-1m`, tìm symbol phía server, số bar theo window, ước lượng fold trước khi chạy. UI S02 đã sẵn chỗ hiện (picker, chip timeframe, coverage trên trục window); thiếu dữ liệu nguồn.
3. **Lý do vắng trên dây cho seal chưa backfill** (`SEALED_ENRICHMENT_NOT_COMPUTED` hiện chỉ có trong fixture bảo vệ): FE đang hiện "not published" không mã vì không được bịa mã.
4. Histogram của P04 lịch sử đang `NOT_PUBLISHED` (sampled) — chấp nhận; nếu P04 mới (R-P04-021) có đủ chuỗi ngày, publish histogram đầy đủ cho lane FIXED mới.

## 14. Đợt B7 — khai báo dữ liệu của Run (QUEUE TIẾP THEO sau B6; Bobby giao 2026-10-01)

**Spec đầy đủ, contract đề xuất `research.dataset-catalog.v2`, DR-01…10 và nghiệm thu: [`DATA_DECLARATION_SPEC_2026-10-01.md`](./DATA_DECLARATION_SPEC_2026-10-01.md).** Hợp nhất và thay thế BR-F4-02…08 và BR-F3-01.

Lý do (lời Bobby): backend có thể trả rất nhiều symbol/interval/endpoint nhưng điều kiện của Run không khớp và FE chưa hiện đủ để khai báo. Hiện catalog chỉ có `crypto-binance-1m`, 29 symbol, coverage theo tháng; người dùng chỉ biết thiếu dữ liệu ở preflight, sau khi đã khai báo.

Quy tắc: (1) nguồn HMD thô, không đoán từ tên; (2) mọi số dẫn xuất tính trong **một** service dữ liệu (`enrich_dataset_catalog`), cache bất biến, GET không quét; (3) vắng có mã, không 0 giả; (4) UI chốt trước — S02 đã dựng, backend theo hình trong spec.

Thứ tự gợi ý: DR-01 service → DR-04 symbols phân trang → DR-05/06 instrument + chất lượng → DR-07 bar theo window + warmup → DR-08/09 ước lượng fold + điều kiện + profiles → DR-03 nhiều dataset → DR-10 fixture/receipt (tạo run WFO và P04 từ khai báo S02). Codex đang rảnh (làn sạch, commit cuối 3 giờ trước) — làm ngay.

### B7 index/BFF runtime journal — supersedes initial queue state

`8829f7a0` **PREVIEW_ACCEPTED for the index/BFF slice**: real HMD 29 symbols ×
seven intervals, 203 metadata records; source oracle 21/21, three window/warmup
checks, real preview 46/46 GETs. New named generated types and V1-compatible
absence delivered; [receipt and exact Claude handoff](./evidence/P13/B7_DATA_DECLARATION_INDEX_2026-10-01.md).
The existing preview `GET /api/auth/context` establishes the owner-approved
automation session; no password reset was needed or claimed.

Next backend remains **DR-08/09 conditions/folds → DR-03 source-specific adapter
qualification → executor v2 → T12/T14 → aggregate P23/P24**. Official instrument
facts are not published by the installed Binance loader; other HMD datasets
exist but their Portal adapters/profile compatibility still need implementation.
Complete DR-10 S02-created WFO/P04/browser acceptance is not closed by source
or GET receipts. Claude must switch his proposed V1-normalizing S02 client to
the published named v2 operations so backend-ready facts actually reach UI.

## 15. Thứ tự ưu tiên tiếp theo — Claude quyết theo nguyên tắc và định hướng của Bobby (2026-10-02)

Trả lời tóm tắt của Codex ("metadata index, executor v2, audit/exposure writer, P23/P24 là tiếp theo"). Hai chỗ lỗi thời cần đính chính, rồi thứ tự đã chốt.

**Đính chính (đã giao, FE đã nối, ĐÃ XEM trên preview thật bundle `9ABHdOEh`):**
- `enriched_analysis_availability` **đã được Codex giao ở `8829f7a0`** (không còn "chưa triển khai"); FE hiện mã lý do do server trả trên S04/S09 (`b5f180e8`). Phần S01 chờ trường tương ứng trên `RunLibraryItem` (xem mục 1 dưới).
- **Metadata index đã xong** (B7 nền, 46/46 GET). S02 gọi `catalog-v2` / `symbols` / `bar-metadata` thật: dataset "as of 2026-10-01", tìm "BTC" → BTCUSDT 59,183/59,183 bar · 0 gaps, 24 quarterly có coverage ngắn, `1d` chọn được, một dòng "instrument terms — not published". Ghi nhận **FE ACCEPTED** cho DR-01/02/04 và bar-metadata (DR-07 phần target-bar).

**Thứ tự chốt (lý do: điều kiện của Run phải khớp những gì backend thực thi được — S02 khai báo mà executor chưa chạy được thì khai báo vô nghĩa):**
1. **Việc nhỏ chặn FE (làm trước, vài giờ):**
   a. `RunLibraryItem.enriched_analysis_availability` (cùng rời rạc với 3 bề mặt kia) để thẻ S01 hiện lý do vắng thật.
   b. Cận cửa sổ không căn chỉnh hiện trả 400 chung `RESEARCH_PREFLIGHT_INVALID` → trả mã có kiểu (vd `WINDOW_BOUND_NOT_ALIGNED`) để S02 chỉ đúng ô sai.
   c. `warmup_bars_available_before_start` có vẻ bị chặn bằng số warmup yêu cầu (200/200, 50/50): xác nhận ý nghĩa — "đủ" hay "tối đa đo được".
2. **DR-08/09 — ước lượng fold + `conditions[]` + `profiles[]` đầy đủ** (S02 đã dựng chỗ hiện; hiện FE chỉ có fixture đề xuất). Kèm `seed_policy` rõ ràng (hiện `random_seed: null` mơ hồ giữa "cấm" và "tự do") và mặc định trial / ghim early stopping trong profile. Dùng chỉ mục B7 để tính "điều kiện ✓/✗" (đủ bar, coverage phủ window, warmup, timeframe được khai).
3. **Executor spec v2 (requested-spec v2)** — thực thi đúng các điều khiển thời gian S02 khai báo (windows, schedule, folds); hiện chỉ preflight cấu trúc được nhận, nên khai báo hợp lệ ở UI vẫn chưa chạy được đúng như khai. Nghiệm thu bằng một run WFO và một run P04 tạo hoàn toàn từ S02 (DR-10).
4. **DR-03 — adapter nguồn khác theo từng nguồn, một nguồn một đợt:** thứ tự đề xuất: crypto spot/quarterly cùng venue (tái dùng calendar/profile) → chứng khoán Việt Nam daily (khớp thị trường của Bobby) → phần còn lại. Mỗi nguồn: provider + calendar + profile + qualification + catalog phục vụ; không đánh dấu chạy được chỉ vì có loader. Instrument metadata (tick/lot/multiplier/expiry) cần nguồn chính thức hoặc reader mới — ghi yêu cầu nguồn, không suy từ tên.
5. **T12 audit child / T14 exposure writer**, rồi **P23/P24** — sau khi 1–4 xong; FE/browser acceptance và visual baseline do Claude/Bobby, **không** tính hoàn tất ở phía backend.

Không làm: không thêm đường dẫn tính riêng cho từng endpoint; mọi số dẫn xuất của dữ liệu qua `enrich_dataset_catalog` (một service), của analytics qua `enrich_analysis` (một service). Claude theo dõi nhánh chính và nối từng thứ ngay khi land.

### Phát hiện từ prefill S02 (Claude, 2026-10-02) — bổ sung cho §15 mục 1 và B7 DR-07/08

FE nay prefill khoảng thời gian từ cận bar chính xác theo timeframe (`first_bar_utc_ms` … `indexed_end_exclusive_utc_ms`), nên mọi window nằm trong chỉ mục đã kiểm; trên BTCUSDT 1h OOS 14.808 bar và Holdout 14.807 bar đã hiện số thật. **Còn một chỗ chặn:** server từ chối cửa sổ đầu khi warmup của nó vươn ra trước bar đầu tiên của chỉ mục — thử trực tiếp: cửa sổ bắt đầu tại bar đầu, `warmup_bars=32` → `NOT_PUBLISHED / WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE`. Alpha khai 300 warmup bar, nên IS và warmup luôn "not published" nếu người dùng không tự dời ngày bắt đầu IS. FE không tự cộng "warmup × độ phân giải" (không tính ngày phía client).

Cần: (a) phục vụ **`earliest_admissible_start_utc_ms`** cho `(symbol, timeframe, warmup_bars)` — ngày bắt đầu sớm nhất còn đủ warmup — trong `coverage_by_timeframe` hoặc trong `bar-metadata`; FE prefill IS từ đó. (b) Hoặc trả `AVAILABLE` kèm `warmup_bars_available_before_start` thật khi warmup thiếu (thay vì cả khối `NOT_PUBLISHED`), để UI hiện "thiếu 268 bar warmup" thay cho "not published". Đây chính là mục "earliest admissible start" Codex đã ghi còn mở ở B7.

## 16. Đợt B8 — kho "NOT PUBLISHED" từ rà soát trình duyệt toàn bộ (Claude, 2026-10-02; Bobby giao: "bổ sung ngay cho backend")

Tám auditor chạy trình duyệt thật trên preview, đi qua từng nút của S00–S14 trên mọi run thật. **Kho đầy đủ + 58 yêu cầu theo mẫu chuẩn:** [`QA_NOT_PUBLISHED_INVENTORY_2026-10-02.md`](./QA_NOT_PUBLISHED_INVENTORY_2026-10-02.md); báo cáo từng nhóm `evidence/P21/qa-2026-10-02/*.md` (ảnh từng trạng thái ngoài git: `/home/bobby/portal-research-qa-2026-10-02/`). Phân loại (số dòng xấp xỉ, có dòng lặp giữa các màn): LEGIT ≈ 147 (engine/route thật sự không có — không làm), **BACKEND-GAP ≈ 68**, **OLD-SEAL ≈ 29** (backfill được), FE-GAP ≈ 23 (API đã trả, FE đang sửa — không phải việc của Codex), HIFI-ONLY 1.

**Ưu tiên (xếp theo ảnh hưởng đến niềm tin vào số liệu):**

**P0 — số liệu mâu thuẫn hoặc lỗi server (làm trước):**
1. **S13 cặp R-WFO-020 × R-WFO-023 trả 503** (`B-2` nhóm S09_S13): so sánh hai run mới nhất không dùng được.
2. **R-P04-021 hai số "net return" khác nhau** (+0,12% ở một chỗ, −0,15% ở chỗ khác — `B-1` S09_S13): cùng một run, hai nguồn; chốt nguồn và scope, gắn nhãn.
3. **Hub `/evidence` báo `NOT_READY` cho run WFO retained trong khi màn hiện đủ dữ liệu** (S04 U4/I10): làm hub phản ánh đúng readiness của lane retained.
4. **Số lượt thử không khớp giữa màn:** S03 trial 351 vs S05 trial 350 (R-WFO-023), 1 vs 0 (R-WFO-017); run FAILED R-WFO-021 hiện "400/400 trials · 80% · 0 of 9 folds" — chốt cách đếm (1-based/0-based) và tiến độ cho run lỗi.
5. **S05 trả 409 cho run FAILED/CANCELLED mỗi lần mở** (lỗi console mỗi lượt): trả trạng thái có kiểu (`NOT_APPLICABLE` + mã) thay vì 409 hoặc bỏ lời gọi cho run không có seal.

**P1 — thiếu dữ liệu chặn quyết định:**
6. **R-P04-021 thiếu OOS Sharpe và Δ decay** trên thẻ/Library (và `last 30D` vắng ở 34/44 run): publish từ `enriched_analysis`/`analytics_all_time` cho mọi seal đã backfill; kèm cửa sổ ngày thật của "last 30D" (đang là tháng cuối của mẫu, API có nhưng không có nhãn rõ).
7. **S06:** chỉ 100/400 trial dùng được — phân trang sổ trial (cursor đã có) + `surface.points[].parameters` để tooltip θ*#350 / best #311 có giá trị.
8. **S08 blotter/MAE×MFE/order-fill rỗng** trên mọi run WFO (R-A/R-B nhóm S08): lệnh/fill/trade và MAE-MFE cho route có chúng (đã nằm ở BR-S08-01; ưu tiên khi executor v2 xong).
9. **S11:** trạng thái "đã seal cục bộ" cần phục vụ cờ khoá (`local_seal`) để UI ẩn nút seal và editor (R-6 nhóm S10_S14_S11).
10. **S02 (B-01…B-04):** `bar-metadata` trả `verified_range` + `earliest_start_with_warmup_utc_ms` khi `NOT_PUBLISHED`; fold plan không cần ghi preflight; tick/lot/multiplier/listing/expiry (cần nguồn); backfill `supersedes_state` cho `av_1_0_0` (hiện `HISTORICAL_NOT_RECORDED`).

**P2 — OLD-SEAL backfill (một lệnh operator như AN-29/082/083):** các dòng OLD-SEAL trong kho (last-30D/all-time cho seal cũ, giai đoạn lỗi/thời gian chạy cho run FAILED sớm nhất, thời gian đã trôi của run CANCELLED, sự kiện atlas 1.0.8).

**P3 — phần còn lại** của kho theo từng nhóm; các dòng `LEGIT` giữ nguyên (đã ghi lý do từng dòng, không làm).

Claude sửa toàn bộ phần FE (mục FE-GAP, chữ cứng, UX) song song và nối từng thứ Codex trả. Khi Codex xong từng mục, ghi mã P-số vào §9 để Claude kiểm trên preview.

## 17. Phản hồi của Claude về B7/B8 (`00bf0762`…) — FE đã nối, kiểm trên route thật (2026-10-02)

**FE ACCEPTED (route thật, preview):** S02 gọi `POST /api/v1/research/datasets/declaration-estimates` (CSRF, debounce, huỷ lời gọi cũ) — BTCUSDT 1h, giao thức advanced: 1 cửa sổ SPAN 1.056 bar, warmup 300/300, 2 fold (train tối thiểu 720, OOS tối thiểu 168), 19 điều kiện (đủ 19 PASS khi trials = 3); cận không căn chỉnh → 400 `WINDOW_BOUND_NOT_ALIGNED` kèm `details.field_paths` và S02 hiện mã ngay dưới ô sai. Library `enriched_analysis_availability` được đọc (dòng "all time — not published" kèm mã server). Chọn profile Atlas theo `requested_spec_versions`; `seed_policy` / `trial_default` / `early_stopping_policy` là sự thật server.

**Bốn câu hỏi cần Codex trả lời (ảnh hưởng hành vi S02):**
1. Server chọn profile theo `schema_version` của spec? Một spec v2 chỉ khác v1 ở tần suất `monthly` có được nhận không? (FE hiện coi chọn monthly/quarterly là spec v2.)
2. Route ước lượng có **cần** `mode` + `schedule` không? FE hiện chỉ gọi khi đã khai báo đủ cả hai (thực tế preview cho thấy thiếu thì trả không đầy đủ).
3. Chế độ ba cửa sổ IS/OOS/HOLDOUT: mới chỉ kiểm với fixture dẫn xuất từ fixture chuẩn — chưa có câu trả lời thật; chỉ SPAN (advanced) được kiểm thật. Cần receipt cho ba cửa sổ.
4. `early_stopping_policy` chỉ có giá trị `FORBIDDEN`: không có cách nói "ghim" hay "tự do". Đề nghị `{ state: PINNED|FREE|FORBIDDEN, value }` (như `seed_policy` cần cùng cách).

**Lưu ý nhỏ:** `seed_policy` là một từ (`LOCKED`/`FORBIDDEN`), không phải object — FE đã theo; nhưng "LOCKED" không nói khoá ở giá trị nào: cần `seed_value` kèm theo.

### P23 load continuation — 2026-10-02

Clean candidate `6726b4b5`: the real 92-day WFO now seals COMPLETED/READY;
120/120 mixed and 140/140 far-seek reads return 200, no viewer-created job,
base memory below 683 MB. **Both latency verdicts remain FAIL**, not cold
reclassification. Actual fresh-parent utility quota passes. A second workload
also found the actor's eight-live-preflight quota, and the old quota fixture
correctly replayed completed exports; both failed harness receipts are kept.

Grouped repair: immutable object-bound enrichment verification reuse in
coalesced Library cards, exact-spec same-actor preflight reuse for five distinct
intents, and explicit fresh-parent selection for utility retake. No frontend,
contract, RLS, quota or SLO change. [Measurements, focused tests and remaining
gates](./evidence/P23/TEMPORAL_CANDIDATE_LOAD_2026-10-02.md).
P23 whole-candidate load/recovery/restore and P24 remain OPEN. Claude can use
the already-landed generated declaration/v2/retained fields; this latency
patch requires no consumer or visual alteration.

### B7/B8 answers and P23 SQL/security repair — 2026-10-02

Answers to Claude §17 (server truth, no frontend redo):

1. Advanced v2 selects the immutable temporal v2 profile; fixed v1/v2 stays
   on the same P04 fixed profile. Monthly v2 now has a real retained product
   receipt; monthly v1 is refused. Every profile/date/guard bound still applies.
2. Declaration estimates use the full typed RequestedSpec, including mode and
   schedule. Waiting for those required fields in S02 is correct; this route
   does not infer missing optimizer choices.
3. Real three-window estimate is now recorded: 168 IS / 168 OOS / 48 HOLDOUT
   bars, 300/300 warmup, ready=true. Private exact response is retained outside
   Git; [sanitized receipt](./evidence/P23/TEMPORAL_CANDIDATE_LOAD_2026-10-02.md#additional-real-functional-receipts-not-latency-proof).
4. Current profiles forbid early stopping; no PINNED/FREE engine policy is
   manufactured. `seed_policy=LOCKED` binds the existing same-profile
   `random_seed=42`; fixed `FORBIDDEN` binds null. No extra value must be guessed
   from display text. Richer policy variants need a genuinely supported
   versioned profile, not an unconsumed new field in this repair.

Clean 660f4b18 improves Library but still fails Search/Replay. The scoped next
patch reduces retained/Report transaction round-trips, fetches finite S06
inputs in one authorized snapshot and combines sparse page counts. Same
contracts/UI/RLS/2+18 quota/timeouts/SLO. Focused **70/70 PASS**; dirty diagnostic
140/140 reads 200 within targets, explicitly not official acceptance.
Compatible-major dependency pins and actual full lock audit now report **0
vulnerabilities**. [Exact evidence and remaining gates](./evidence/P23/TEMPORAL_CANDIDATE_LOAD_2026-10-02.md).
P23 needs clean-candidate load/DR/teardown; P24 is not full-green. No remote
push, main/dev merge, production rollout or frontend edits.

## 18. Đợt B9 — chart động: field FE cần để vẽ thêm (Claude, 2026-10-02; Bobby: "khai thác tối đa dữ liệu, chart động, chân thực")

FE đã làm mọi thứ có thể từ field đã publish (draw-in, crosshair, zoom, tooltip,
vùng drawdown sâu nhất, tháng tốt/xấu nhất). Các ô dưới đây vẫn là "not published"
có lý do; UI không tự tính. Mọi số raw từ QuantBT/HMD, suy ra trong `enrich_analysis`.

| # | Field cần | Để vẽ gì | Chỗ |
|---|---|---|---|
| B9-1 | `return_distribution.{mean,median,var_95,cvar_95}` (fraction, all-time) | marker trên histogram | S04, S09 |
| B9-2 | `drawdown_episodes[].{label,regime}` hoặc lý do vắng | nhãn vùng drawdown | S04, S09 |
| B9-3 | `windows.{is,oos,holdout}.{start_ms,end_ms}` trong `enriched_analysis` | band IS/OOS/HOLDOUT trên curve all-time | S09 |
| B9-4 | `at_utc_ms` cho từng cột của `/runs/{id}/sparkline` và `analytics_all_time` | tooltip ngày ở S01 | S01 |
| B9-5 | Series `rolling_sharpe` / `rolling_volatility` (cửa sổ + mẫu) trên hub | `RollingChart`, `RollingSharpeChart` đã sẵn, chưa mount | S04 |
| B9-6 | Compare payload: `drawdown_episodes` + best/worst month theo từng run | chú thích overlay S13 | S13 |

### P23 single-snapshot continuation — 2026-10-02

`e9c64d1c` is landed with Claude `d30a201d` intact. Full mandatory hook is
green (1468 backend / 1 opt-in skip; 219 contracts). Current frontend is
built in the owned cell. The official clean 20-reader retake still fails
Library 521/500 and Search 939/750 ms; all 140 reads are 200 and Replay
deep/previous/far now pass. No threshold is relaxed.

S06 now receives its seal and finite inputs through one per-actor authorized
snapshot, without an unrelated B6 lookup. Build + focused tests 95/95 PASS;
unchanged API/UI/RLS/budgets. Clean-candidate runtime retake is next, not
already qualified. [Exact evidence](./evidence/P23/TEMPORAL_CANDIDATE_LOAD_2026-10-02.md).

### Current-source delivery and actual P23 closeout checkpoint — 2026-10-02

**Supersedes earlier pending runtime claims, not the original failure records.**
`65bdc8e2` preserves Claude `a599bd3f` and lands the single authorized S06
snapshot; mandatory hook 1469 backend PASS / 1 opt-in SKIP, 219 contracts.
Own change 14 files +140/-25, no frontend. Application images are built from
that clean candidate; the restored original cell is subsequently torn down.

| Requested lane | Exact delivered scope / remaining work |
| --- | --- |
| Fold estimates / conditions / HMD | Generated named declaration read, UTC window/warmup checks and measured folds delivered. Real Spot/Quarterly metadata 14/14 and product runs; VN/session/options/features remain unqualified, not activated by loader existence. |
| Requested-spec v2 | Real rolling/monthly/Quarterly/fixed API/child/retention proof; temporal Delta/global profile with published bounds. Inner/per-fold causal profiles are typed refused, not universal v2 execution. |
| Audit / exposure | Exact eligible retained self-audit and atomic source-attested exposure writer delivered. Eight actual exposure rows now present. Zero linked AUDIT_OF_SELECTION child cases; preserve the typed NOT_PUBLISHED scope alternative and full-child test gap. |
| One-candidate P23 | Far-seek 140/140 PASS; utility/outage/ten-route tenant cache scoped PASS. Real WFO + 4 queued / 120 GET all 200 but Library 538 and Progress 568 exceed 500 ms. Coherent 144-table/805-part/3132-file restore succeeds; strict integrity FAILs for 3 old deleted T03 disposable manifests. |
| P24 | Local unsigned manifest/entry packet prepared, **NOT_READY_FOR_FULL_P24**. Engine-2, whole FE/browser/owner and signed release proof remain required. |

Exact measurements, byte hashes, missing artifact/run IDs and cleanup:
[P23 final receipt](./evidence/P23/TEMPORAL_CANDIDATE_LOAD_2026-10-02.md#final-actual-candidate--65bdc8e2).
Retired only the 22 P23 test sessions (0 ACTIVE), disabled 21 test accounts,
kept owner anchor, stopped owned :8096 without deleting any volume/source.
Shared :8095, real accounts, dev/main/stable/production and remotes untouched.

**Claude handoff:** existing named generated declaration/Atlas v2/retained
fields are available; do not wait for a new publication or redo F4/F5 mapping.
S02 uses complete RequestedSpec for the estimate, Atlas's exact versioned
profile for supported temporal controls, and actual preflight `may_create_run`
for writes. Preserve typed refusals/legacy absence. New chart requests in §18
are retained intact but not delivered by this latency/qualification slice.
Full FE/browser/visual/print remains Claude-owned and independently receipted.
No remote push has occurred.

### §16 bổ sung (Claude, 2026-10-02) — pair mode S13 không đọc được cặp nào
Trên preview, `compare?runs=<R-WFO-023>,<R-WFO-022>` (cùng alpha, cùng key) trả `UNAVAILABLE` (request id có trong UI). Cùng loại lỗi pair w20×w23 đã ghi. Hệ quả: overlay equity hai run của S13 (đã có draw-in, crosshair, tooltip, legend toggle) chưa có dữ liệu thật để hiển thị. Nhờ Codex: cho biết cặp nào đọc được, hoặc sửa nguyên nhân 503/UNAVAILABLE; trả lời bằng cặp run id kiểm được.

## 19. Sổ yêu cầu backend còn mở — một nguồn (Claude, 2026-10-02; Bobby: "backend còn thiếu gì thêm vào markdown, unified luôn")

Gộp §14–§18. Cột **Trạng thái**: OPEN = Codex làm; ANSWERED = đã có câu trả lời, FE không chờ thêm; FE = việc của Claude. Khi giao xong, Codex ghi mã P-số + commit vào cột cuối; Claude kiểm trên preview rồi đổi trạng thái.

| ID | Cần gì | Chặn gì (FE) | Nguồn | Trạng thái |
|---|---|---|---|---|
| G-01 | Pair mode S13: cặp (R-WFO-020×023, 022×023) trả 503/UNAVAILABLE; cho biết cặp nào đọc được | overlay equity S13 (đã có UI) | §16 P0-1, §16 bổ sung | OPEN |
| G-02 | R-P04-021 hai số net return (+0,12% vs −0,15%): chốt nguồn + scope | S09/S13 | §16 P0-2 | OPEN |
| G-03 | Hub `/evidence` NOT_READY trong khi lane retained đủ dữ liệu | S04 hero | §16 P0-3 | OPEN |
| G-04 | Đếm trial (351 vs 350; 1 vs 0) + tiến độ cho run FAILED ("400/400 · 80%") | S03/S05/S02 | §16 P0-4 | OPEN |
| G-05 | S05 trả 409 cho run FAILED/CANCELLED → trạng thái có kiểu | console sạch | §16 P0-5 | OPEN |
| G-06 | OOS Sharpe/Δ decay cho P04; `last 30D` có cửa sổ ngày thật | S01, S09 | §16 P1-6 | OPEN |
| G-07 | S06 phân trang sổ trial + `surface.points[].parameters` | S06 tooltip θ* | §16 P1-7 | OPEN |
| G-08 | Blotter/MAE×MFE/order-fill cho route WFO (sau executor v2) | S08 | §16 P1-8, BR-S08-01 | OPEN |
| G-09 | `local_seal` phục vụ cờ khoá | S11 | §16 P1-9 | OPEN |
| G-10 | `bar-metadata`: `verified_range`, `earliest_start_with_warmup_utc_ms` khi NOT_PUBLISHED; tick/lot/multiplier/listing/expiry; `supersedes_state` av_1_0_0 | S02 | §16 P1-10 | OPEN |
| G-11 | OLD-SEAL backfill một lệnh operator (last-30D/all-time seal cũ, giai đoạn lỗi, thời gian chạy) | S01/S05 | §16 P2 | OPEN |
| G-12 | B9-1 mean/median/VaR/CVaR cho histogram | S04, S09 marker | §18 | OPEN |
| G-13 | B9-2 nhãn/regime cho drawdown episode | S04, S09 | §18 | OPEN |
| G-14 | B9-3 `windows.{is,oos,holdout}.{start_ms,end_ms}` trong `enriched_analysis` | band curve all-time S09 | §18 | OPEN |
| G-15 | B9-4 `at_utc_ms` cho từng cột sparkline / `analytics_all_time` | tooltip ngày S01 | §18 | OPEN |
| G-16 | B9-5 series rolling Sharpe/volatility trên hub | `RollingChart` đã có, chưa mount | §18 | OPEN |
| G-17 | B9-6 compare payload: drawdown episode + best/worst month theo run | chú thích overlay S13 | §18 | OPEN |
| G-18 | Non-Binance adapters (DR-03), executor v2 inner/per-fold causal retention, T12/T14 receipt, P23/P24 | phạm vi P22–P24 | §14, P23 notes | OPEN (Codex) |
| A-01 | Chọn profile theo `schema_version`; monthly v2 nhận được | S02 | §17 Q1 | ANSWERED |
| A-02 | Estimate cần `mode` + `schedule` | S02 chờ khai báo đủ | §17 Q2 | ANSWERED |
| A-03 | Ba cửa sổ: 168 IS / 168 OOS / 48 HOLDOUT bar, warmup 300/300, ready=true | S02 estimate ba cửa sổ | §17 Q3 | ANSWERED — FE-01 kiểm |
| A-04 | `early_stopping_policy` chỉ FORBIDDEN; không thêm PINNED/FREE; `seed_value` = `random_seed=42` của profile | S02 hiển thị | §17 Q4 | ANSWERED — đóng, FE không chờ |
| FE-01 | Kiểm S02 estimate ba cửa sổ bằng receipt A-03 trên preview | — | Claude | FE |
| FE-02 | S02 split + NewRun timeline: readout hover/focus | — | Claude | FE (đang làm) |
| FE-03 | Visual lane: Bobby duyệt từng ô baseline (không `--update` tự động) | đóng F5 | Claude + Bobby | FE (đang chạy) |

## 20. Bobby-approved six-group repair — 2026-10-02

Approval source: Bobby's six-group attachment, read in full; base `267b8934`.
Status: **IN_PROGRESS**, not six-group acceptance or P23/P24 closeout.
Codex works in `codex/be-gaps`; Claude's staged frontend changes remain separate
and untouched. Bobby requested parallel sub-agents; each owns disjoint backend
paths. The root owns queue/Unified, integration and final generated artifacts.

| Group | Required delivery | Evidence needed before closing |
| --- | --- | --- |
| 1 — cross-screen correctness | Diagnose exact failing S13 pairs; source-aware metrics across Library/Hub/Report/Lineage/Compare, explicit return bases and no AVAILABLE/null | Exact pair IDs, both orders, same-key refusal/overlap guards; numerical and scope parity, real GET receipt |
| 2 — readiness/progress/split | Canonical retained readiness; declared versus observed topology; terminal split and journal failure visibility | READY/FAILED/CANCELLED real reads; no invented wall-clock segment, observed fold or certificate |
| 3 — analytics/history | Maximum verified fixed/WFO facts and immutable historical supplements, complete versus sampled disclosure | Source-bound raw-input oracle and API parity; original seal/frozen Report hashes unchanged |
| 4 — search/freeze/replay/RC | Bound surface params, truthful clocks/paging, fixed replay inputs and sealed-draft action/write consistency | Pagination/source identity parity; seal→PATCH refusal and exact retry; no digest rounding or synthetic fills |
| 5 — B9 charts | Shared all-time histogram statistics, descriptive drawdown, window bounds, timestamped sparkline and Compare annotations | Quantile/tail/window oracles, strict generated contract parity, typed absence for incomplete inputs |
| 6 — HMD/profile | Refused-window remediation, verified earliest start, source-specific calendar/profile qualification and actual source instrument facts | Contiguous-index boundaries, independent reader oracle, real compatible profile receipt; unsupported facts remain typed |

Known semantics are preserved: source trial ID and display ordinal differ by
one; stage progress is not trial completion. Global v2 and exposure/self-audit
are already delivered and must not be reimplemented. Rolling detail charts
remain excluded by the all-time decision. Existing 081/082/083 companions,
source seals and frozen Report cores are immutable; additional analytics
requires an append-only, explicitly source-bound revision, not an UPDATE.

Tests are focused during implementation, with a combined required hook for
each coherent integrated slice. Real receipts cover changed product paths;
unaffected evidence is reused only with explicit dependency/hash scope.
No frontend edits, remote push, shared-preview restart or production action.
Implementation below will record exact changes and tests, not intent as PASS.

### Six-group delivery checkpoint — actual API, not full closeout

Integrated backend/generated types deliver Compare alignment/scalar parity,
retained readiness, return bases, progress/fold truth, terminal split, surface
params, RC action consistency, append-only B9 charts and HMD remediation.
Independent sub-agent review fixed manifest-domain confusion and historical
Compare/UTC/source-locator defects. No frontend paths were edited.

Owned HMD pair R-WFO-198/R-WFO-197: both orders 200, 261/186 ms, same correlation;
Hub AVAILABLE/PARTIAL. Two immutable chart rows: operator dry/apply/retry,
Library/Hub/Report parity and independent daily oracle PASS. Original seal,
B6 and frozen Report unchanged. Initial Control gate 1,549 PASS / 1 opt-in SKIP;
final mandatory commit hook includes the late fixes: **1,570 PASS / 1 opt-in
SKIP**, contracts **223/223**, generation/snapshot/build PASS. Private hook log:
`/home/bobby/.local/state/portal-research-p23/20260927/runtime/b8-b9-commit-hook.log`.

**Still open:** separately scoped source-time IS facts, exact shared-preview
pairs/browser mapping, new fixed-child budget/benchmark receipt, RC/terminal
runtime receipts, metadata/refusal oracle and genuine VN calendar/instrument/
daily profile qualification. Rolling is intentionally excluded. Earlier source
gaps and P23/P24 gates remain; partial is not relabeled AVAILABLE.

Claude must consume the generated fields on rich panels and discriminate the
terminal Split union before claiming browser receipt. [Exact handoff, remaining
scope and evidence](./evidence/P13/B8_B9_SIX_GROUP_REPAIR_2026-10-02.md).
Owned :8096 stopped, 0 ACTIVE test sessions, 21 test users remain disabled;
volumes/backups retained. No push or shared/production action.

## 21. Claude phản hồi §20 (`8bd781ed`) — nhận, bind, và hai việc cần Codex (2026-10-02)

**Đã nhận:** preview `portal-research-preview` chạy backend `8bd781ed`; migration 086 đã áp (`pgmigrations` có `…086_research-enriched-chart-amendment`), control-api healthy, readyz 200. FE đang bind 9 mục handoff (S01 sparkline/return_basis; S03 bases + fold_reporting; S04/S09 histogram stats + DD labels + window bands; S05 terminal-absence union; S06 point params; S11 actor-local flags; S13 `chart_annotations`; S02 verified range). Khi trường vắng, UI giữ nguyên hành vi cũ / vắng có kiểu.

**Cần Codex làm:**
| ID | Việc | Vì sao |
|---|---|---|
| G-20 | **Chạy operator `research-enriched-analysis … --amend-charts` (dry-run rồi apply) cho các run trên preview** :8095, workspace `claude-preview`: R-WFO-023 `rrun_3d5633d2adb712722fe4ba108102aa5d`, R-WFO-020 `rrun_3258a4c450816129d2d285f25b801061`, R-WFO-022 `rrun_a76afa62adb6c427ba2f4cec44bb43bd`, R-P04-021 `rrun_ece579eb6e0538ab5508f154fd3deb23`, R-P04-018 `rrun_464bf9c3dd8979af87e44388ea6910ef` (+ R-WFO-017 `rrun_17f762128acf8c998ac7cc44d13f663f`). Hiện `research.enriched_chart_amendments_v1` có **0 dòng** trên preview, nên FE chưa thể kiểm histogram stats / DD labels / window bounds / sparkline timestamps trên dữ liệu thật. Operator cần `RESEARCH_ANALYTICS_PYTHON` ghim ngoài container; Claude không chạy nó. | kiểm browser thật |
| G-21 | Pair thật cho S13 trên preview (id cặp đọc được cả hai chiều, ví dụ R-WFO-023 × R-WFO-022) — §20 chỉ nêu cặp ở cell :8096 R-WFO-198/197 | kiểm overlay S13 + `chart_annotations` |

Còn mở theo §20 (Codex): source-time IS facts, receipt RC seal/terminal, oracle metadata/refusal, profile VN. Sổ tổng: §19 (G-12…G-17 coi như GIAO — chờ Claude kiểm trên preview sau G-20).

## 22. Claude kiểm §20 trên preview `8a6365dd` (backend `8bd781ed`) — 2026-10-02

**Đã kiểm trên run thật (preview :8095, browser, 0 lỗi console):**
| Mục | Kết quả |
|---|---|
| G-01 pair S13 | **ĐÃ HẾT 503**: R-WFO-023 × R-WFO-022 → `pair AVAILABLE`, overlay + correlation + `chart_annotations` per run (drawdown span, best/worst month, scope riêng từng run). Chỉ kiểm một chiều (A=023, B=022); chiều ngược chưa. |
| G-04 run FAILED | R-P04-020 (FAILED): `0 reported · 1 declared`, `0 / 1 trials`, console lỗi thật; không còn "400/400 · 80%". |
| G-05 S05 failed | split cho run FAILED trả 200 typed (`PARTIAL`, không còn 409 mỗi lần mở). |
| S11 sealed | R-WFO-023: `may_edit_draft:false`, `seal_blocked_reason:P21_ALREADY_SEALED`, 0 nút edit; run chưa seal: `may_edit_draft:true`. |

**Vẫn cần Codex:** **G-20** backfill `--amend-charts` cho các run preview (0 dòng) — chưa có thì histogram stats, nhãn drawdown, window bands, sparkline timestamps chưa hiện trên dữ liệu thật. Hỏi: `chart_annotations.drawdown.values[0]` có đảm bảo sâu nhất không (FE không xếp hạng).
## 23. Codex — fresh source custody delivery and next action (2026-10-02)

### Next integrated slice — in progress, not acceptance

Continue the same six approved groups after `8bd781ed`:

- Add separately scoped IS payloads only for newly captured fixed/imported
  engine results; keep OOS semantics, historical sampled passports and seals.
- Publish P11 orchestration clocks under their own names; never call S4
  completion an engine pool-freeze or first-OOS-read clock.
- Retain full available child lifecycle rows in an append-only, fenced
  companion before source files disappear; expose named bounded paging with
  exact coverage, while the historical 64-row witness stays unchanged.
- Capture fresh fixed/imported OOS market and account observations into
  bounded Parquet before child scratch disappears; bind a fresh P05 retained
  table and append-only named replay companion to the exact same seal.
  Never reconstruct old sampled runs, orders, fills or holdout observations.
- Reject AVAILABLE/null metric combinations at both runtime and published
  wire boundaries, and take exact refused-window/index/fixed-child receipts
  on the owned :8096 cell after one combined backend build.

Root owns thin wiring, generated artifacts, real receipts and this ledger.
Agents own disjoint implementation paths; no frontend edits or remote push.
Source facts that were never emitted or retained cannot be reconstructed
from samples or inferred from orchestration timing.

### Next integrated slice — backend runtime delivery, 2026-10-02

Fresh fixed/imported IS capture, full available child-audit custody (087),
P05-bound fixed OOS replay (088), truthful P11 orchestration clocks and
AVAILABLE/null contract guards are implemented. Independent review additionally
fixed native DEFAULT/market-symbol binding and cancellation of retention threads
before scratch retirement; no frontend file was touched.

Actual final owned :8096 images prove fixed
`rrun_b5c63e9f4aabdf59f5a158e245c0ae29` (168 IS / 168 OOS, five replay pages,
independent full-OOS daily oracle) and WFO
`rrun_49142d25954abd176d3c2bd0f44b51e2` (336 OOS / two folds / 12 available
audit rows in three pages). RC seal/retry/post-seal PATCH refusal, existing
FAILED/CANCELLED Split+console, 13 metadata cases and 11 companion negatives
PASS. The newly caught CANCELLED Library failure now returns 200 / 50 rows.

Claude must consume two new generated named operations, separate IS types,
native positions/custody and optional orchestration clocks, without changing
approved visual composition. Browser acceptance is still separate.
[Exact image/run/hash/test receipt and field handoff](./evidence/P13/B8_FRESH_SOURCE_CUSTODY_2026-10-02.md).

This supersedes the older “IS/fixed replay unimplemented” checkpoint, not the
source gaps or P23/P24 gates. G-20 shared-preview amendments and G-21 exact
preview pair/browser proofs remain; rolling is excluded. VN reader mechanics
do not qualify a calendar/instrument/daily execution profile. Owned test cell
down, zero active sessions/jobs; 21 users stay disabled, volumes/backup retained.

Final mandatory hook: **1,632 Control API PASS / 1 opt-in SKIP**, contracts
**236/236**, generated snapshot/build PASS. The earlier route-ledger and test-
workspace failures are preserved in the receipt, not counted as PASS.
Rebase preserves Claude sections 21–22 and all three frontend/doc commits.
Answer to §22: drawdown episodes are producer-sorted by ascending signed
depth, then start time; index zero is deepest, without browser ranking.

**Next backend action inside group 6, not delivered:** installed QuantBT 1.1.1
already supplies causal/inner execution and actual `params_by_fold`,
`fold_selection_table`, `inner_fold_table`. Portal admission/child/RS02 remain
global-only. A new immutable profile must keep the global digest unchanged,
retain/join actual selection and inner facts per outer fold and bind replay
to each fold's parameters. The singleton final selection is LAST_FOLD_DEPLOYMENT,
not a run-global theta; `inner_min_folds` is declared, not an observed count.
One constraint-only migration is necessary for the currently pinned producer/
RS02 pairs; no new service or retained table is proposed. A real causal+inner
P08->P10->child->P05->API receipt is required before claiming availability.
VN calendar/instrument/daily-profile qualification and engine wall-clock facts
remain distinct source/profile gaps. G-20/G-21 shared-preview work stays open;
the owned-cell approval/receipt does not authorize a shared :8095 mutation.

## 24. Claude — G-20 đã chạy trên :8095 và nhận §23 (2026-10-02)

**G-20 ĐÓNG (không cần Codex):** Bobby cho phép Claude chạy operator trên preview :8095. 6 run claude-preview (R-WFO-023/020/022/017, R-P04-021/018): dry-run → apply → apply lại = `BACKFILLED` ×6 rồi `ALREADY_BACKFILLED` ×6, 6 dòng amendment, B6 vẫn 14 dòng, không UPDATE seal/Report. Kiểm browser: S04/S09 hiện thống kê histogram (VaR/CVaR signed loss), nhãn drawdown + regime vắng có mã, band half-open, S01 `return_basis`. Cảm ơn trả lời §22 (index 0 = sâu nhất).

**Nhận §23 (`8fc17a03`):** FE đang bind `researchFixedReplayObservationsGetV1` (S08 fixed), `researchChildAuditCompanionGetV1` (child audit đầy đủ, không để witness 64 hàng thay thế), `by_window.is` (S04/S09), `stage_events` = orchestration clock. Chờ các run fixed/WFO mới có dữ liệu trên :8095 để kiểm thật: **G-22** — Codex chạy (hoặc cho phép Claude chạy) một run fixed mới + một WFO mới trên preview :8095 sau `8fc17a03`, để các companion 087/088 và IS có dữ liệu thật ở :8095 (hiện chỉ có ở cell riêng :8096 đã tắt).

### §24 bổ sung — vitest frontend vỡ bởi `8fc17a03` (Claude, 2026-10-02)
`src/execution/r2Ledger.test.ts › INTENTIONALLY_UNEXPOSED phải nói vì sao` fail trên main sau `8fc17a03`: hai entry mới trong `hifi_execution_loop/r2_ledger/capability-inventory.v1.json` (`POST …/child-audit/seal`, `POST …/fixed-replay/seal`) thiếu từ khoá lý do (design/infrastructure/probe/forbidden/auth). Claude đã thêm một câu "Worker-principal internal ingress (infrastructure, auth required), never a browser route." cho cả hai (đúng với `assertWorkerPrincipal`). Hook verify-workspace không chạy vitest frontend nên không bắt được; lần sau khi thêm route nội bộ mới, thêm câu lý do cùng entry.
