# Research Loop — hàng đợi backend cho Codex (Claude soạn, Bobby giao, 2026-09-30)

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

**Bobby quyết (gom một lần):** BR-D4-2 · E10-O2 · E10-O3a · E10-O4 · E13-O3 (`CLONE_OF` migration 078+) · `candle_overview` vs `market_overview` · E5-O6 · D5 · CG-P21-05 / CG-FG-S11-03 (VD-FG-01-26) · CG-FG-S10-04 (VD-FG-01-18) · CG-FG-S10-02 (từ vựng trạng thái attempt) · CG-FG-S02-01 / S04-06 (chính sách cert cap) · CG-FG-S08-02 (E16-R1 đã đóng per-bar) · CG-FG-S09-02 (lộ path) · AN-29 backfill · owner ≤P21 nếu muốn trả về Claude.

## 8. Dọn sổ (docs; làm cùng mục liên quan — cập nhật, không xoá, A13.1)

Unified: U:3636 (board P23), U:3637 (P24 → Codex), U:3691 (OL-12), U:3692/3695 (T02-01/T12-02 đã xong — mig 077), U:3693/3696 (T05-01/T03-01 cần note supersede), U:3701 (CG-FG-S04-03/04/05: 03 xong qua E11, 04 N/A, 05 → BR-AN-01), U:3712 (CG-FG-R2-01 xong `0b868c6f`), U:3756 (OL-24: lý do thật là host), U:3782 (E11 rolling Sharpe63 → supersede D-AN-01), U:3957-3959 (§G "(c) chờ Codex" đã đóng), dòng P10 U:3623 (CG-P10-01 xong `996eef6c`), U:3625 (CG-P12-01 `status_counts` đã phục vụ từ `c81e8dc2`), board RF-03 U:3615 (CG-RF02-01 xong `ad7491cf`). Evidence: `P21/thanhvuong-backend-requests.md` (CG-P21-02 xong `f1deb763`), `P22/…:156-168`, `P23/…:165-175` + debt-register JSON, `P23/frontend-handoff-claude.md` §3–4, `CODEX_REQUESTS_FROM_CLAUDE_P11_P15.md:76` (CG-P13-04 → supersede), S14-RW-BR-03 (xong `4e343fe9`), debt-register P02/P04/P05. Chi tiết: §4 của A3/A4, §4 của A2, "STALE" của A1/A5.

## 9. Trạng thái (Codex điền khi làm)

| Id | Commit | Test | Contract đổi (Claude cần nối FE) | Ghi chú |
|---|---|---|---|---|
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
| CG-FG-S03-02 / S04-01 | BACKEND_CANDIDATE (preview/full hook pending) | Focused Control API 35/35; contracts 11/11; build pass | `ProgressRead.claims?: MethodologyClaim[4]`, `EvidenceHub.claims?: MethodologyClaim[7]`; FORECAST Atlas, ISSUED sealed QuantBT, typed absence | Claude binds S03/S04; no singular-claim string parsing. `evidence/P13/CG-FG-S03-02_S04-01_claim_strip_2026-10-01.md`. |
