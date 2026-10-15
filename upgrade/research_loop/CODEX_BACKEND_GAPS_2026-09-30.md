# Research Loop — hàng đợi backend cho Codex (Claude soạn, Bobby giao, 2026-09-30)

## Codex continuation 2026-10-02 — B7/B8, not whole-phase closeout

The causal/inner refusal in the earlier temporal journal below is historical:
the later **§25** supplies an additional admitted bounded profile and real
product proof. Its frontend consumer/compile follow-up remains explicitly
open; no existing global profile digest or old seal is rewritten.

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

## 25. Codex — causal/inner current-source integration (2026-10-02)

Status **SCOPED_BACKEND_DELIVERED_WITH_REAL_RECEIPT**, within approved group 6;
source-time base `8fc17a03`, preserve newer Claude frontend commits at landing.
QuantBT 1.1.1 already executes Mode 1 per-fold causal selection with inner
folds. Portal now wires one additional immutable bounded profile, leaving
the fixed and global profiles, digests and historical seals unchanged.

Root owns admission/create, exact profile bindings, constraint-only migration,
contract generation and the owned :8096 product receipt. Python lane owns
child execution and source retention; TypeScript lanes own current-source
read models and ancillary immutable consumers. No frontend change, shared
:8095 mutation, remote push or production action is included.

Actual proof: P08 -> P10 -> isolated child -> P05 -> named API over real
BTCUSDT/1h history, multiple outer studies with actual inner folds, per-fold
selected parameters/digests, outer OOS excluded from selection, exact retained
source identity and existing all-time analytics. Retain source-reported
counts, not the declared minimum. The final singleton selection is explicitly
LAST_FOLD_DEPLOYMENT, never a run-global theta. Engine wall-clock omissions
remain typed. Focused negatives precede one combined build and mandatory hook.

Real `rrun_becde1e160a2770d49246f7f665208ce` is COMPLETED/READY: **2 outer
studies / 6 trials / 7 observed inner folds**, exact own-fold params/digests,
2 own generation-child MATCHes, 9 authenticated named APIs 200 and **13/13
GET-only negative cases PASS** with unchanged jobs/preflights. Source/P05
identity is exact. Singleton selection is last-fold deployment; causal
surfaces are bounded per study, not a global ranking. Legacy global surfaces
and profiles remain unchanged. Shifted P08 bounds, mixed inner scores and
contradictory source claims are rejected under the existing seal lock.

[Exact image/hash/source/negative/test receipt and Claude screen handoff](./evidence/P10/B8_CAUSAL_INNER_CURRENT_SOURCE_2026-10-02.md).
Regenerate generated contracts; consume optional `surfaces_by_study`, exact
study/trial identities, observed versus minimum inner folds, last-deployment
scope, own-fold Replay/Report params and explicit metric bases. Engine wall
clocks remain NOT_PUBLISHED, never copied from P11 orchestration clocks.
Do not call frontend/browser acceptance complete from this backend receipt.

Claude `97308396` has already closed G-20 and bound §23; preserve those
commits and the later S06 wrapping fix, do not repeat or overwrite them.
G-21 remaining exact-pair/browser and G-22 fresh-source shared-preview proof,
VN/source calendar/instrument/profile qualification and existing P23/P24
gates stay open. Owned :8096 stopped; 0 active jobs/sessions, 21 users still
disabled, owner anchor/volumes/backups/receipts retained. No remote push or
shared :8095/production mutation. Full mandatory hook is attached to the
single integrated commit, not rerun per agent or documentation hunk.

**Claude compile handoff:** generated unions now require
`FreezeDetail.tsx:1315` to map `CAUSAL_DATA_TIME_SELECTION`,
`FreezeDetail.tsx:1414` to handle nullable `reason_code` in the HTML title,
and `StageLedger.tsx:34` to map `PER_FOLD_STUDY: false`. These are actual
Research typecheck diagnostics, separate from missing Planning dependencies
in the isolated BE worktree. Codex does not edit frontend paths. Keep the
data-time/engine-clock distinction; frontend compile/browser acceptance is
not marked complete by the backend receipt or mandatory hook.

## 26. Claude — nhận §25 (`da185d7a`) (2026-10-02)
Đã sửa 3 lỗi compile (`fff96249`) và bind causal/inner trên FE (xem `FRONTEND_GAPS` F7e), chưa kiểm trên dữ liệu thật. **G-22 mở rộng:** cần một run causal (profile `p10.delta-signal-notional-causal-inner.v1`) COMPLETED trên preview :8095 ngoài run fixed và WFO. **Hỏi:** `PortalAdmission.profiles[].profile_id` (enum generated) chưa liệt kê id causal — FE nhận diện theo `optimization_schedule` + `inner_validation`; có nên regenerate enum để khớp?

## 27. Codex — independent raw-IS qualification, 2026-10-02

**IN_PROGRESS**, approved group 3; not a new public retention capability.
IS source-time facts are implemented, but §23's independent numerical oracle
covers OOS only. Capture one new fixed product run through P08/P10/child/P05,
then independently verify the existing Hub/Report `by_window.is` values.

- Opt-in owned-worker qualification only; bounded private source witness
  (20,000 rows / 2 MiB), exact admitted IS bounds, native source labels,
  run/attempt/lease identity and separate file-byte/OBSERVATION_IS hashes.
- Copy verified bytes before scratch retirement outside the immutable P05
  public bundle. No raw IS route, new table, contract or historical seal edit.
- Independent oracle checks return, drawdown, native annualized Sharpe,
  UTC-daily distribution/Type-7 signed-loss statistics and benchmark curves;
  verify Hub/Report parity and unchanged, separately scoped OOS semantics.
- Focused custody/negative/numerical tests and one actual owned :8096 run
  precede a single grouped mandatory hook. Preserve false/absence cases,
  revoke the temporary owner session and stop only the owned cell afterward.

Root owns wiring, runtime, docs and landing; agents own the private helper and
independent oracle in disjoint paths. No frontend, shared :8095, production,
remote push or P23/P24 acceptance is included. Existing source/profile gaps
and consumer receipts remain separate.

First real weekly IS proof passed on the owned cell: 168 actual IS rows,
Hub/Report and existing OOS-baseline parity. Its strategy equity is constant;
Sharpe/histogram correctly remain typed zero-variance absence. Before calling
the non-zero numerical lane qualified, take one separate monthly fixed run
on the same Python image (no rebuild), with full raw-IS oracle and actual
AVAILABLE Sharpe/distribution. Preserve both receipts independently. This is
a named operator preset, not new browser/API admission scope.

### §27 delivery — raw IS oracle and actual monthly facts

**SCOPED_BACKEND_REAL_PRODUCT_PROOF_PASS**: weekly
`rrun_03727c86cc06ad5067890e95182e3445` and monthly
`rrun_627bd475a5c4ae273cdc54e1d3e391b9`, same final Python image, both
COMPLETED/READY. Weekly proves genuine zero-variance absence and unchanged
same-window OOS baseline. Monthly proves **720 raw IS rows / 29 daily returns**,
actual AVAILABLE Sharpe/histogram, scalar/curve/hash/window/ancestry and named
Hub/Report parity against an independent JS oracle (1e-12). Captured witness
survives scratch retirement without changing any public bundle or old seal.

[Exact source/image/digest/tests/failure truth and existing FE contract handoff](./evidence/P13/B8_INDEPENDENT_IS_ORACLE_2026-10-02.md).
No new contract or FE mapping; keep typed absence and IS/OOS scope distinct.
Focused helper/custody/legacy/oracle tests pass; two stale test assumptions
were repaired without relaxing the runtime budgets or permitting input-tape
retention. Single integrated commit uses the normal grouped mandatory hook.
No per-agent hook, Control/FE rebuild, remote push or shared/prod mutation.
Owned :8096 down, capture false, 0 ACTIVE jobs/sessions, 21 users disabled;
owner anchor, witnesses, volumes, backup and rollback images preserved.

Independent queue review: §23/§25 deliveries and Claude G-20 must not be
reopened from stale attachment text. Remaining six-group work is G-21/G-22
shared-preview proof (separate shared-window authority) and genuine VN daily
calendar/trading-bar/profile qualification; unavailable source instrument/
wall-clock facts remain typed. P23 mixed-load 538/568 ms, old test manifests,
engine-two and P24 remain separate gates, not a six-group PASS claim.

## 28. Claude — G-22 chạy trên :8095 và kiểm B10/B11 trên dữ liệu thật; một job causal không được nhận (2026-10-02)

Bobby cho phép Claude tạo run thử trên preview :8095 (stack Claude quản, workspace claude-preview). Tạo qua S02 thật (preflight → create), preview chạy `3a1378bf` (migration 087–089):

| Run | Loại | Kết quả |
|---|---|---|
| R-P04-022 `rrun_9ec42333b812f7e41e389a36e06328df` | fixed 3 cửa sổ, mode_1_decay global | COMPLETED |
| R-WFO-024 `rrun_a71ae7ea4b4ff87a8bbfe19aa4b1b43c` | advanced walk-forward weekly expanding, global | COMPLETED |
| R-WFO-025 `rrun_5e1185f847dddd418bdbd1f9f32b87c7` | advanced WFO weekly expanding, **per_fold_causal**, inner weekly/expanding/14D/min 2 folds, trials ghim 3, seed 42 | **QUEUED, không bao giờ được nhận** |

**G-23 (Codex): R-WFO-025 kẹt QUEUED.** Preflight 201 + create thành công. `research.jobs`: `queue_class=HEAVY`, `state=QUEUED`, `resource_class=p10-delta-wfo-v1`, `current_worker_attempt_id` rỗng, `attempt_limit=2`; `run_progress`: "QUEUED — WAITING FOR A WORKER · 0 worker attempts". `research.job_outbox` của mọi job (kể cả job đã SUCCEEDED) đều `PENDING/0 attempts` nên không phải tín hiệu. Worker `quant-worker-py` (build `3a1378bf`) không log gì cho job này (chỉ 2 cảnh báo "terminal worker notification was not published" của hai run trước, `NoStreamResponseError` từ JetStream); đã `docker compose restart quant-worker-py`, vẫn QUEUED sau >5 phút. R-WFO-024 cùng queue HEAVY và cùng `resource_class` chạy xong trong ~10 giây, nên khác biệt là profile causal. Nghi: worker/producer không nhận job có `execution_adapter_id` hoặc spec causal trong preview (thiếu đăng ký profile `p10.delta-signal-notional-causal-inner.v1` ở phía Python, hoặc `resource_class` ghi sai cho causal). Cần Codex chẩn đoán trên cell của họ với đúng run này, hoặc cho biết cờ/env cần cho worker preview. Đã bind S02–S09 causal ở FE; chưa kiểm S03–S09 causal trên dữ liệu thật vì thiếu run này.

**Đã kiểm trên dữ liệu thật (browser :8095, 0 lỗi console):** S02: profile causal nhận diện đúng (`pinned by p10.delta-signal-notional-causal-inner.v1`, thẻ `trials 3 per outer fold study · total ≤ 48 · inner folds 2–16 · seed 42 · span ≤ 92 days`, trials/seed ghim, inner controls hiện). B10: run fixed S08 có dải price overview 12 nến/744 bar OOS cạnh equity; S09 run fixed có 3 ô IS; run WFO S08 có panel child-audit companion. Visual lane đầy đủ: 360 passed / 0 failed trên `3a1378bf`.

### §28 đính chính — G-23 RÚT LẠI (Claude, 2026-10-02)
**Không có lỗi backend.** R-WFO-025 kẹt vì `research.run_producers.dispatch_state = PENDING`: Claude tạo nó ~10 giây sau R-WFO-024 (cùng queue HEAVY), nên admission P06 "một HEAVY mỗi workspace" trả 503 "waiting for queue capacity… retry with the same intent" (hành vi đúng, an toàn thử lại); script của Claude không thử lại cùng intent nên run để QUEUED chưa dispatch. Tạo lại khi hàng đợi rảnh → **R-WFO-027 `rrun_686af4b1d64472591b6a64a1db1233a3` (per_fold_causal) COMPLETED** trong vài giây. Xin lỗi vì báo nhầm; không cần Codex làm gì cho G-23. (R-WFO-025 còn là run QUEUED chưa dispatch trên preview, vô hại.)

**G-22 ĐÓNG — kiểm B10/B11 trên dữ liệu thật (preview :8095, browser, 0 lỗi console), run causal R-WFO-027:** S03 `per-fold studies — 3 reported / 3 planned`, `study … trial 9/9`, không tính lại pct; S05 `OUTER FOLDS 3 observed · INNER FOLDS 12 · INNER MIN (DECLARED) 2`, θ* `PER FOLD (own)`, `last-fold deployment (fold_03) · source trial study_2.trial_1`; S06 `K not shown — PER_FOLD_STUDIES_HAVE_NO_SINGLE_RUN_GLOBAL_POOL`, `candidates re-evaluated: each outer fold, its own study`, đồng hồ "Portal orchestration times — not an engine pool freeze or first out-of-sample read"; S07/S08/S09 hiện selection/own params/`per_fold` score basis. Trước đó: S02 profile causal, S08/S09 fixed, child-audit companion WFO. Còn mở phía Codex: chỉ các mục §19 cũ chưa giao (G-02…G-11), VN/source profile, P23/P24.

## 29. Codex — published profile parity and observed VN daily index, 2026-10-02

**IN_PROGRESS**, next bounded substage of approved group 6. Three disjoint
agents handle contract parity, the observed-date index helper and independent
source/custody review. Root owns integration, source receipt and one grouped
commit/hook; no frontend edits, remote push or shared/prod runtime changes.

- Answer Claude §26: make the published foundation admission enum and array
  bound match all four actual immutable runtime profiles, including causal/
  inner. Regenerate only the affected contract and prove unknown-profile
  rejection; do not weaken runtime admission or ask the browser to cast.
- Add a bounded, reusable VN daily index lane over the already installed HMD
  reader. Preserve source-local date labels (`Asia/Ho_Chi_Minh`, previous-day
  17:00 UTC), <=31-local-date queries, actual gaps and ordinal warmup bars.
- Expose measured index coverage with explicit observed-date basis. Expected
  exchange-session count, session-close clock, calendar completeness and
  instrument terms remain typed absent; never count weekends as missing
  sessions or invent a 24/7 source calendar.
- Take a real installed-reader/index oracle for the helper, alongside focused
  timezone/chunk/warmup/custody and unchanged-Binance regressions. This is
  **index infrastructure qualification**, not a VN executable-profile or
  product receipt. P08/P10/child/profile binding remains the next vertical
  step until an actual product run passes.

No new service, vendor install, direct DB access, old-index/seal rewrite or
profile activation is included. Generated fields require an explicit Claude
handoff; metadata availability must not imply execution authorization.

### §29 delivery — source index proof, not product activation

Foundation transport now matches the four runtime profiles; causal enum,
bound and duplicate rejection are generated and tested. VN observed-date
helper, V2 immutable mixed index, safe signed metadata client/controller and
ordinal warmup are implemented. Independent installed-reader oracle proves
**661 FPT timestamps / 32 queries / 139 runs**, exact 300-bar predecessor,
holiday and refused-range semantics. UTC indexes/profiles/seals are unchanged.

The explicit observed provider is also implemented: exact 300-predecessor
hydration, source/index timestamp parity and no default app activation. A
second independent direct-reader receipt matches every OHLCV value for
**661 rows (300+361)** and holiday **303 rows (300+3)**. Raw source order and
sub-ms boundaries refuse instead of being silently repaired. Focused final
source/index/adapter regressions: **156 PASS / 1 opt-in SKIP**.

[Exact hashes/tests/failure truth, C4 and Claude handoff](./evidence/P08/B8_VN_OBSERVED_INDEX_AND_PROFILE_PARITY_2026-10-02.md).
No VN executable profile/catalog or frontend activation is claimed. Complete
that next vertical gate with actual owned P08→child→P05/API proof, preserving
old immutable AV/pins and typed calendar/instrument authority. Claude's §28
correction at `1bcee81a` withdraws G-23: capacity 503 requires same-intent
retry; a later causal run completed. Preserve that correction when landing.
No automatic recovery or shared runtime mutation is introduced. No push,
production or full P23/P24 claim.

The next immutable VN profile must join every profile consumer, including the
P10 producer/worker/read/replay allowlists; an adapter alone is not permission
to admit or execute work. No unresolved source absence is labeled AVAILABLE.

## 30. Codex — observed VN fixed product vertical, 2026-10-02

**IN_PROGRESS**, same approved group 6, not a new campaign. Reuse §29's
verified source adapter and ordinal warmup instead of repeating qualification.
Python agent owns source composition, P08 snapshot and fixed child/retention;
Control agent owns the exact immutable admission/work/read/replay profile and
generated contract; root owns migration, owned :8096 receipt, docs and landing.

- Add only `p10.vn-stock-daily-observed-fixed.v1`: installed QuantBT 1.1.1,
  signal_notional, fixed three windows, FPT/1d source-local observations,
  declared 300 observed predecessors. Keep every old profile and AV byte
  unchanged; inspect the existing P04 immutable declaration before reuse.
- Require source/index custody and explicit opt-in before exposing an
  executable VN profile. Preserve exact source-local midnight (17:00 UTC),
  half-open bounds and source gaps. No exchange calendar, session close,
  instrument precision, currency or account permission is inferred.
- Wire P08 ordinal warmup and observed-only quality through P10, isolated
  child, immutable P05 retention, named Hub/Report and route-aware Replay.
  Do not label missing session authority as a 24/7 missing-bar failure or
  silently change all-time UTC/365 analytics.
- Focused contract/source/negative tests and one real owned :8096 product run
  must name exact image/source/profile/AV/snapshot/seal hashes and independently
  check source-to-snapshot/replay parity. A helper/fixture alone does not close
  this vertical. Frontend binding is handed to Claude; no FE edit here.

G-23 is withdrawn, not repaired by auto-dispatch: capacity refusal still
requires caller retry. Only independently demonstrated existing claim/receipt
fence races may receive narrow safety regression fixes; no timer, service,
automatic future execution or shared preview mutation. One grouped mandatory
hook after the integrated code is ready. No remote push, dev/main, production,
kernel/package change or P23/P24 completion claim.

### §30 delivery — actual observed VN fixed product proof

**SCOPED_VN_FIXED_PRODUCT_QUALIFICATION_PASS** on
`rrun_df77613b0f4ceb2dd069935f61ae75e2`, COMPLETED/READY. Actual public
P08→P10→isolated QuantBT 1.1.1 child→immutable P05→named API path is complete.
Hub/Report/Split/Search/Freeze/Replay 6/6 HTTP 200; fixed WFO retained lane is
typed NOT_APPLICABLE. Seven bounded opaque replay pages retain 107 OOS rows.
Independent installed HMD reader matches every timestamp/OHLCV for 568 rows
(300 observed predecessors + 268 analysis), 28 bounded queries, and replay.
Wrong source symbol/clock both refuse with actual typed 409 responses.

Real qualification exposed and repaired **five** integration defects:
Control P08 closed-bar guard, repository profile/adapter allowlist, private
terminal split enum/profile isolation, calendar-return versus observed-bar
population validation, and Hub's calendar-gap coverage requirement. Failed
runs stay FAILED and evidence is retained. Observed coverage is AVAILABLE
only with explicit `OBSERVED_TAPE_INTEGRITY_ONLY`; unknown calendar counts
stay null. No weekend/session count, UTC/365 analytics or old seal is changed.

[Exact images, source/work/snapshot/Parquet hashes, real proof, failure record,
tests, cleanup and Claude generated-client handoff](./evidence/P10/B8_VN_FIXED_PRODUCT_VERTICAL_2026-10-02.md).
A receipt-only range assertion was corrected after the successful run; its
original failed receipt is preserved and a guarded read-only continuation
has a distinct proof label. No second QuantBT run was needed.

## 31. Six-group backend reconciliation — 2026-10-02

This addendum supersedes the **backend** OPEN rows and earlier IN_PROGRESS
checkpoints in §19/§20/§29/§30 without deleting their historical evidence.
It does not grant frontend/browser, P23/P24 or production acceptance.

| Approved group | Current backend verdict | Evidence and consumer distinction |
| --- | --- | --- |
| 1 — cross-screen correctness | SCOPED_BACKEND_ACCEPTED | Exact R-WFO-020↔023 and 022↔023: all four named GETs 200; keys, overlap, numerical correlation and annotations agree both orders. Explicit engine-return versus first/last-equity bases remain distinct; G-02 remaining same-label presentation is frontend. |
| 2 — readiness/progress/split | SCOPED_BACKEND_ACCEPTED | §20/§23 actual terminal/failed reads; no fabricated fold, wall-clock, cert or progress. Final VN run also COMPLETED/READY with persisted Hub/Report/Split. |
| 3 — analytics/history | SCOPED_BACKEND_ACCEPTED | §23 OOS oracle; §27 weekly zero-variance and monthly 720-row IS oracle; immutable sidecars and raw source custody. G-20's six eligible amendments are closed, not every historical seal; old seals lacking raw source remain typed absent. |
| 4 — search/freeze/replay/RC | SCOPED_BACKEND_ACCEPTED | §23 RC seal/retry and fixed replay receipt; §25 causal own-fold selection/inner studies and generation child MATCHes; bounded VN replay + Report reads. |
| 5 — B9 chart contracts | SCOPED_BACKEND_ACCEPTED | §20 chart scalar/curve/tail/window/timestamp/Compare annotations, independent daily oracle and unchanged original seals; generated contracts handed to Claude. |
| 6 — HMD/profile | SCOPED_BACKEND_ACCEPTED | §23 refusal/index oracle; §25 actual causal profile; §29 observed VN index/provider oracle; §30 actual FPT fixed product vertical. Foundation includes all five admitted runtime profiles by exact identity and request versions. |

[G-01/G-21 exact-pair proof and completed session-specific cleanup](./evidence/P20/B8_EXACT_COMPARE_PAIRS_2026-10-02.md).
The initial logout Origin refusal remains in the immutable proof; the parent
revoked only the one uniquely identified QA session through the existing
repository method. All other sessions are unchanged; no second login,
business/run/preflight write or runtime restart on shared :8095.

Claude's latest common-branch corrections must survive landing: G-20 CLOSED,
G-22 CLOSED (actual fixed/global/causal browser runs), G-23 WITHDRAWN (capacity
503 requires caller retry). No automatic dispatch/recovery was implemented.
G-03/04/05/07/09/12/13/14/15/17 are backend-delivered by linked receipts; do not
reopen them merely because their earlier §19 rows say OPEN.

**Still not supplied by the source:** authoritative VN calendar/session close,
instrument precision/currency/venue terms; WFO native order/fill/MAE/MFE or
source wall clocks; missing raw history of older seals. Keep typed absence and
explicit locators, not zero or synthetic rows. G-16 rolling detail remains
WONT_DO under D-AN-01, not an unimplemented all-time feature.

**Separate genuine remaining gates:** P23 mixed Library/Progress 538/568 ms
against recorded 500 ms; three lost disposable test manifests and full
restore integrity; real second-engine T07/T13; one candidate-consistent
utility/recovery/audit and frontend/a11y/owner acceptance. P24 signed-release
rehearsal is not delivered by this six-group backend slice. Linked
AUDIT_OF_SELECTION child scope remains separate if its full gate is required.
Do not mark the whole Research product or release green from this addendum.

C4: owned :8096 cell fully removed **without volumes**; 0 nonterminal jobs,
0 ACTIVE test sessions, 21 test identities still disabled and one owner anchor
retained. Both owned VN flags restored false. Protect seven exact current
image tags, original rollback images, source/index/DB/artifact/backup and
private receipts. Root free space 207,521,882,112 bytes (69% used);
**NO_ACTION_NEEDED** beyond completed exact cell/session teardown. One normal
grouped mandatory hook gates this coherent source/generated/docs commit;
no per-agent hook, frontend build, remote push, dev/main or production change.

## 30. Claude — nhận §29; hai yêu cầu nhỏ từ W2 (2026-10-02)
Đã nhận `b4be7f64`: enum `profile_id` nay có profile causal (cảm ơn trả lời §26); số khoảng trống `null` của `OBSERVED_TAPE_INTEGRITY_ONLY` hiển thị `not measured · observed dates only` (không in 0). **Yêu cầu mới:** **G-25** — thêm `display_label` (R-P04-022…) vào `research.run_library_search_documents` để Library tìm theo nhãn người dùng đang thấy (hiện tìm `R-P04-022` ra 0 kết quả). **G-26** — journey descriptor v5: bỏ chữ "shipped" khỏi mô tả thẻ (FE đang ẩn bằng tooltip). Quan sát (không chặn): run WFO tạo gần đây thiếu hàng RC `METRICS_SEMANTICS` (`P21_RETAINED_REPORT_NOT_SEALED`) dù báo cáo đã seal; R-WFO-022 cũ thì ổn.

## 32. Codex — Claude W1/W2 backend requests before P23, 2026-10-03

**IN_PROGRESS**, Bobby's continuation. Baseline `b2098a81`; work only in
`portal-research-be` / `codex/be-gaps`, then preserve all current Claude
commits when landing on `docs/research-loop-plan`. No remote push, dev/main,
frontend, signed release or production change. P23 qualification starts only
after this request slice is resolved; no whole-product verdict is implied.

Read sources: §30 Claude W2 return above, `FRONTEND_FIX_PLAN_W1_W5_2026-10-02.md`
§9, `evidence/P21/audit-2026-10-02-final/SPEC_W1.md` §8, the P09/P12/P18/P21
packets and Research rules A13. Earlier G-20/G-22 closure, G-23 withdrawal and
six-group §31 receipts remain accepted; do not reopen them from stale prose.

| Item | Implementation and required proof | Owner |
| --- | --- | --- |
| G-25 | Search visible canonical `R-…` labels for historical and future Library rows; same workspace/profile-family ordinal as the existing DTO, indexed bounded GET, stable paging/counts, no GET writer or tenant leakage. Fresh/upgrade PostgreSQL and named API proof. | Library agent; migration 091 reserved |
| G-26 | Publish Journey descriptor v5 without legacy "shipped" copy, with accepted product route truth. Keep v3/v4 immutable, canonical digest/ETag and hidden/auth controls; generated schema/fixture/type and exact Foundation read proof. | Foundation agent |
| W2-RC-01 | Diagnose fresh-WFO `METRICS_SEMANTICS` refusal against persisted sealed Report/evidence revisions. Repair only a demonstrated custody/read defect; wrong-revision/unsealed Report must remain refused, no seal overwrite or publication. | RC agent |
| W1 B-1/B-3 | If source-backed, publish additive compose run status/report-sealed truth and sealed-aware gate verdict so S11 can avoid a second Library read; preserve immutable RC seals and typed absence. | RC agent |
| W1 B-4/B-5 | Inspect exact retained selection IDs and publish a server-owned display ordinal only where its source/study basis is proved. Never turn a qualified study ID into a fabricated run-global trial or change hashes/selection. Hand off the same rule to split/search/freeze/RC. | Codex root |
| W1 B-2 | Recheck existing Hub/Progress lifecycle authority before adding a duplicate failure fact; record either an exact delivered mapping or the remaining source-bound request. | Codex root |

Three disjoint agents implement focused source/tests; root owns shared
snapshot generation, integration, evidence and the grouped mandatory hook.
Contracts stay ahead of consumer changes. Actual proof uses only the owned
isolated :8096 cell and retained accepted runs where possible; no new engine
run is required for read/search/descriptor-only changes. Do not mutate the
shared :8095 preview, publish approvals or rebuild Claude's frontend.

Exit: every named item has an evidence-backed verdict and generated consumer
handoff; schema/source and stale/negative/isolation regressions pass; real
named reads prove the fix where a runtime gate applies; cleanup follows C4
without removing data/volumes/evidence/rollback images. Commit and land the
coherent request slice, preserving both append-only journals. Reuse the
existing numerical product receipts; never claim fixtures as real proof.

### §32 delivery — W1/W2 scoped backend requests accepted

This delivery supersedes the IN_PROGRESS checkpoint above without deleting
it. G-25/G-26, W2-RC-01 and W1 B-1…B-5 are **DELIVERED** in this coherent
source/generated/tests/evidence slice. Find its commit with
`git log -1 -- upgrade/research_loop/evidence/P21/W1_W2_BACKEND_REQUEST_CLOSEOUT_2026-10-03.md`.

Library has indexed canonical label search; migrations 091/093 also preserve
ordinal/index agreement under historical and concurrent reverse commits.
Refresh is write-side/workspace/family-scoped, bounded at 256 newer docs;
257 rolls back atomically. Journey v5 replaces visible shipped copy while
preserving older descriptor bytes. RC now accepts the verified sealed Report
revision with enrichment/analytics companions, never a stale/wrong-run seal.
Compose lifecycle/sealed status, Hub failed_at and server-owned selection
ordinals are generated, with nullable absence and RUN_GLOBAL/STUDY_LOCAL.
Original Optuna IDs remain distinct from evaluation IDs and source hashes.

Full disposable P12 **17/17**, root focus **74/74**, RC **52/52**,
Foundation **17/17**, focused contracts and official generation pass.
Actual final owned-cell proof: **15 successful named GETs + foreign-workspace
404 + ETag 304**, unchanged immutable custody, logged-out QA session.
[Exact images/hashes, negative controls, receipt and Claude mapping handoff](./evidence/P21/W1_W2_BACKEND_REQUEST_CLOSEOUT_2026-10-03.md).
No frontend file/baseline, shared :8095, remote push, dev/main or production
change. One mandatory grouped normal commit hook gates landing, not one per
agent/request. C4 complete: exact :8096/test containers gone, jobs/sessions
zero, 21 disabled test identities and owner anchor retained; no volume prune.

Claude can consume these generated fields now; browser receipt remains its
own acceptance. Next: existing P23 candidate/load/restore/engine-two gates,
then P24. This request slice does not reopen accepted numerical engine proof
or label an unresolved source fact AVAILABLE.

## 33. Broad request reconciliation before P23 — 2026-10-03

**IN_PROGRESS**, Bobby's continuation, baseline `d1e0b839`. Read the Unified
board/addenda, three Claude request ledgers, P01–P10/P11–P15/P15–P23 and
2026-09-30/2026-10-02 audits, current W1–W5 plan, P21–P24 packets and the
actual contracts/code. Later accepted receipts supersede historical OPEN
rows; §31/§32 remain accepted. No new campaign, frontend redesign, engine
run, production, shared :8095 mutation, push or release is implied.

Confirmed overlooked implementation/response work in B4 and the earlier
F2b/F3 tables, not a reason to repeat the six-group qualification:

| Request | Bounded work and authority | Owner |
| --- | --- | --- |
| BR-TXT-01 / Atlas | Add stable public `reason_code` to known NOT_PUBLISHED slots without parsing prose, changing availability or modifying the private pinned manifest. Keep original reason/source; public presentation revision invalidates Atlas ETag. | Foundation agent |
| BR-S08-02 | Publish Replay window metadata from existing exact preflight/retained facts in both fixed/retained lanes. Preserve withheld holdout and historical absence; no HMD scan or synthetic counts. | Replay agent |
| BR-S08-03 | Publish exact Replay alpha bindings if the run/source supplies them. Report already exposes exact IDs as frozen `identity.alpha`/`alpha_version`; document that mapping, never rewrite the core just to add aliases. | Replay agent + root handoff |
| BR-S11-01 | This is P19 `PromotionPick`: join the source-attested fold/approval identity under current workspace/run/RC guards. Missing fold remains typed absent; do not parse a global trial identifier. | Lineage agent |
| BR-F3-03 | Use a defensible bounded logical-attempt presentation label, never worker retry ordinal or page position. If existing source cannot establish it, return an explicit typed disposition. | Lineage agent |

Root owns shared generation/snapshot, integration review, append-only
ledger/Unified updates and one grouped normal commit hook. Each agent owns
disjoint domain paths; focused tests cover old fixtures, identity/absence,
source custody, stable paging and conditional validators. No frontend file
is changed; delivered generated fields receive one precise Claude handoff.

Read-only Markdown target checks found **0 missing file links** in Unified,
the backend/frontend queues and all three request ledgers. That does not
prove anchor/browser or external/private artifact availability. Preserve
original audits and receipts; do not silently mark all historical seals or
endpoint parameter/profile combinations accepted.

**Separate consumer gap:** legacy `QuantBTModule` and `AuditView` export
links still perform GET directly. Backend now requires workspace-scoped ADMIN
POST prepare + read-only GET. Claude must bind that flow or hide the old
affordance; do not remove the guard to make a link work.

**Genuine next gates remain P23:** mixed-load SLO, the exact three lost test
artifact manifests, actual engine-two T07/T13, independent WFO recomputation
and the missing negative/browser cases on one coherent candidate. Current
self-audit/typed linked-child scope stays distinct from a full linked
AUDIT_OF_SELECTION child. P24/signed rehearsal follows its declared gates,
not this request/schema repair.

### §33 delivery — missed read contracts and one S05 correctness defect

**SCOPED_CODE_ACCEPTED**, subject to the one normal grouped hook before
landing; no preview/browser/P23 GO is claimed. Exact delivery SHA is the
commit containing [this receipt and generated consumer map](./evidence/P21/BROAD_REQUEST_RECONCILIATION_2026-10-03.md).
This addendum supersedes the IN_PROGRESS checkpoint without deleting it.

| ID | Current disposition |
| --- | --- |
| BR-TXT-01 / Atlas | DELIVERED: four typed absence codes, historical identity code and source OOS-condition template code. Separate public projection/fixtures, private manifest unchanged, Atlas ETag v2. Other short copy uses existing typed refusal/mode/template fields; this is not a blanket server-prose rewrite. |
| BR-S08-02 | DELIVERED: exact fixed and retained Replay windows, fold segments, count basis/typed historical absence and withheld holdout. Fixed half-open bounds and inclusive source fold endpoints stay distinct; sums are not unique bars. |
| BR-S08-03 | DELIVERED Replay IDs bound to the immutable run request/Hub. Report already delivered exact IDs under frozen `identity.alpha` / `identity.alpha_version`; no alias or core rewrite. |
| BR-S11-01 | DELIVERED contract/disclosure: exact P19/P22 approval href; fold remains null with source-attested absence, not decoded from trial ID. No Governance SELECT grant. |
| BR-F3-03 | DELIVERED: server-owned logical `att_NN` label and PRESENTATION_ONLY basis, full Alpha/workspace census prefix; opaque ID and technical retries remain separate. |
| S05 retained boundary defect | FIXED: pinned QuantBT ends name inclusive observed bars. Shared endpoint FAIL, distinct single-bar windows valid. Basis V2; old capture V1 remains readable. Corrected HTTP ETag is separate from unchanged source/Report/RC pins. |
| BR-F3-02 | STILL_OPEN_APPLIED_GUARD_PROOF: the disjointness correction does not attest applied purge/embargo. Use exact retained guard windows and allow legitimate tail clipping; absent historical facts remain NOT_CHECKABLE. Do not relabel this as an engine-wide source gap. |
| BR-F3-04 | SUPERSEDED_BY_ACCEPTED_W4B: tab subtitle is stage state only; existing summary cards retain their exact generated facts. Do not restore stale duplicated subtitles. |
| BR-F3-05 | EXISTING_MANIFEST_MAPPING: P11 publishes actual artifact digests/sizes and Claim consumes them; HiFi's ten-row sample is not a source invariant. |
| BR-S04-WIN | PARTIALLY_DELIVERED: fixed IS analytics/curves already consumed. WFO selected-candidate IS account and protected holdout cannot be invented from declaration bounds. |

Focused proof: Atlas 9/9 final add-on and 17/17 contracts, Replay 60/60
plus single-bar 6/6, lineage 36/36 plus canonical fixture and actual PG 4/4,
S05/current-source focus 53/53. Groups overlap. Official generation/snapshot
and one normal hook gate commit/landing. Exact tests, generated type names,
synthetic examples, custody invariants and Claude handoff are in the receipt.
No frontend, source artifact/manifest/seal, shared :8095, runtime image,
production or remote push change. Exact owned PG test container removed;
no volumes or business data deleted.

Next ordered backend work: BR-F3-02 applied-guard contract/proof, then the
already-listed coherent P23 load/restore/engine-two/independent-recompute and
browser gates, then P24. Missing original historical bytes and an actual
second engine are not repaired by invented data or another same-wheel image.
Claude must also replace legacy direct export GET links with the delivered
workspace/admin prepare→download flow (or hide them).

**Generation correctness addendum:** official generation reproduced a real
ordering bug: the later Compare/metrics amender removed Lineage's already
supported `RS02_RETAINED_OUTER_FOLD_SELECTIONS` enum after its generated
type was emitted. The canonical amender now retains it, with published
schema/type regression and generator drift check; no causal source is lost
or manually invented. [Exact defect and repair](./evidence/P21/BROAD_REQUEST_RECONCILIATION_2026-10-03.md#7-official-generation-regression-found-and-repaired).

**Public-boundary correction before landing:** the first mandatory hook
refused the commit: 1,808 Control tests passed, one failed, one skipped.
RS-03's existing public anti-leak assertion caught new Replay
`source_locator`. The new metadata is changed to strict public `basis`
enums, not a private locator renamed into another free-form field. Existing
anti-leak assertions remain intact; focused RS-03/Replay/contracts and the
normal hook retry gate landing. No source/cursor/Report/RC pin changes.

## 34. BR-F3-02 — applied purge/embargo proof, 2026-10-03

**IN_PROGRESS**, Bobby-approved scope. Verify the source's retained per-fold
guard windows/counts against the same sealed OBSERVATION index, not against
calendar arithmetic or train/test disjointness alone. Publish separate
`guards.purge_applied` / `guards.embargo_respected` verdicts, per-fold reasons
and exact configured/observed counts. Dataset-tail clipping is valid only
when the same retained index proves the available tail; missing historical
windows/index facts remain NOT_CHECKABLE, never zero or PASS.

Bounded read-only implementation, generated schema/types/fixtures, positive
and negative/source/tenant regressions, exact retained-source receipt and
Claude handoff are required. Keep existing source/seal/Report/RC pins and UI
unchanged; only the Split representation validator changes. No new engine
run, source backfill, production/shared :8095 mutation or remote push.
P23/P24 and W5 remain separate.

## 35. W5 causal navigation and RC numbering — Bobby-approved, 2026-10-03

**IN_PROGRESS**, additive backend correction alongside §34. Actual owned-cell
reads of `rrun_becde1e160a2770d49246f7f665208ce` prove the mismatch: P11 handoff
trial 6 is a run-wide progress ordinal, while Search/Freeze select
`study_1.trial_2`, study-local ordinal 3; RC's structured selected number is
null. Private receipt `br-f3-02-w5-before-20261003.json` records the four reads.

Correct only the public navigation projection: handoff `trial` follows the
exact matching fold's original study-local trial, with explicit scope/study/
source ID and the old progress counter retained separately. Missing or
conflicting source mapping withholds the public cursor with a typed reason.
Private journal/ingress, claim text, selected parameters and hashes stay
unchanged. RC reuses its existing `selected_trial_number`, adds scope and
exact native identity, and uses the shared source-backed presentation rule;
do not add a parallel `selected_trial_ordinal` or parse rail prose.

Regenerate public OpenAPI/types; old captures stay readable. Focused tests
must cover cumulative/local mismatch, global regression, missing/mismatched
causal facts, immutable inputs, and actual named Progress→Search/Freeze→RC
read parity. Claude owns browser wiring/round-trip acceptance; no frontend
file, runtime worker, optimizer, shared :8095 or production change.

### §34/§35 delivery — applied guards and causal navigation

**SCOPED_BACKEND_ACCEPTED**; exact delivery SHA is the commit containing
[the canonical receipt and Claude W5 handoff](./evidence/P14/BR_F3_02_APPLIED_GUARDS_AND_W5_NAVIGATION_2026-10-03.md).
This supersedes the two IN_PROGRESS checkpoints without erasing them.

- BR-F3-02 **DELIVERED**: same-seal observation-index/native-window proof for
  purge/embargo, independent PASS/FAIL/NOT_CHECKABLE verdicts and verified
  tail clipping. Missing historical facts stay NOT_CHECKABLE; HTTP Split
  validator changes, immutable source/Report/RC identities do not.
- W5 causal handoff **FIXED** after real-read mismatch: public trial follows
  the native study-local selection; source/study/scope are typed and the run
  progress counter is separate. Private journal unchanged; ambiguous or
  mismatched selection withholds the cursor with a typed reason.
- W5 RC **DELIVERED**: reuses `selected_trial_number`, now source-bound for
  causal profiles with explicit scope/source/study. No duplicate ordinal or
  rail-string parsing. Old public captures/private cursors remain readable.

Real owned :8096 proof: four retained runs, native installed QuantBT 1.1.1
oracle with verified Parquet bytes, 22 controls PASS; global/causal named
Progress→Search/Freeze→RC parity, 401/404/304 and unchanged custody.
Final focused Control 88/88 and contract 7/7; official generation/snapshot
pass. One normal grouped commit hook gates landing, not per request/edit.
No frontend/shared :8095/production change, optimizer or remote push.
C4 complete: zero jobs/QA sessions, 21 disabled test identities; exact cell
containers/network removed, no volumes/data/image prune.

Claude must consume the generated guard/cursor/RC fields and take its W5
browser receipt; backend round trip is not browser acceptance. P23/P24 and
legacy export prepare→download consumer remain their declared next scopes.

**Hook correction:** first grouped hook: contracts 260/260, Control
1,830 pass / one old exact RC expectation fail / one existing DR skip.
The W7 expectation now checks all three added native-number metadata fields
exactly; it is not relaxed to a partial match. A public cursor outside the
existing integer bound is withheld, with a focused negative. Final W5/W7
29/29 and Control build pass; corrected-image receipt and normal hook retry
gate landing. Source journals/immutable custody and frontend remain untouched.

## 36. P23 mixed-load and historical test-store integrity — Bobby approved, 2026-10-03

IN_PROGRESS, backend lane only. Optimize Library/Progress below the existing
500-ms mixed-load target, preserving actor/workspace RLS, fresh reads, finite
admission and exact public DTOs. Retake the affected twenty-principal workload
in owned :8096; do not repeat already accepted far-seek/utility/outage drills
unless a changed dependency requires it. No frontend or shared :8095 changes.

Handle exactly the three previously recorded lost disposable test manifests
as a bounded, source-checked historical exception ledger. Preserve every DB
row, original expected digest, archived failure and existing artifact byte.
Default strict integrity must still fail on missing bytes; a scoped exception
assessment must not claim full-store integrity or hide a new/referenced loss.
Require unchanged missing identity/digest population, zero governance/
retention pins, and verification of all extant manifests/parts plus coherent
restore parity. No reseal, deletion, synthetic recovery or production change.

Grouped focused tests, one normal mandatory commit hook, exact runtime/image
receipt and C4 teardown gate this slice. P23 engine-two/independent WFO/browser
and P24 remain distinct; no remote push is authorized.

Actual dependency refinement: all three have zero retention/RC/publication/
promotion/selection/exposure/audit links, BUT each has one retained DB seal
and one frozen Report. Exact historical exception accounting must preserve
and disclose both copies, reject changed dependency counts, and never equate
the DB copies with the missing original artifact bytes. Full integrity stays
false while those bytes remain missing; no false "unreferenced loss" claim.

**Delivery addendum — MIXED_LOAD_PASS / HISTORICAL_EXCEPTION_ACCOUNTED.**
Code `b90a36a9` (+568/−20, 15 owned files) preserves both newly landed Claude
commits. Real clean :8096 retake: Library **499 ms**, Progress **403 ms**,
120/120 GET 200, one completed 92-day WFO, one heavy/four queued intents,
738,488,320-byte measured peak, no implicit viewer jobs. Library has only
1 ms headroom; no weakened target or generous capacity claim.

Same-candidate restore proves 151-table/auth/schema/reference parity and
83/86 manifest verifications, 886 part records, 3,521 files. The exact three
old missing manifests have been accounted for, with one DB seal/Report each;
none was reconstructed, resealed, deleted or assigned a new digest. Coherent
restore/exception accounting PASS; **strict full integrity remains false /
exit 1**. Full byte recovery is not achieved or silently waived.

Focused tests/build + ordinary hook passed. C4: 21 non-owner test accounts
disabled, 0 active QA sessions/jobs/owned containers/networks; original and
restore volumes/backups/images retained, cache cleanup NO_ACTION_NEEDED.
[Exact candidate, images, metrics, failures, private hashes and cleanup](./evidence/P23/MIXED_LOAD_AND_HISTORICAL_MANIFEST_EXCEPTION_2026-10-03.md).
No frontend binding/schema change. Shared :8095, production and remotes are
unchanged. Remaining engine-two/recompute/browser/P24 gates are not closed
by this slice; do not repeat already accepted far-seek/quota/outage drills.

## 37. P23 independent WFO / P24 read-preserving rehearsal — 2026-10-03

Bobby's instruction to continue the §36 remaining work is implemented in
the existing backend lane, no remote push / dev-main merge / production
activation. Public contracts, source seals, frontend and migrations unchanged.

**DELIVERED — V11-P23-DR independent global Delta WFO recomputation.**
Published pinned QuantBT 1.1.1 runs directly on the same real P08 snapshot,
not Portal's production runner. 2,208 equity/time rows, six native metrics,
13/3 fold/trial cardinalities and selected params match; four exact BFF
metrics have zero difference. Bounded oracle / exact decimal comparison;
no new job, seal or image build. Diagnostic range-order/float-formula failures
retained and corrected only in the oracle. [Receipt](./evidence/P23/WFO_DIRECT_ENGINE_RECOMPUTATION_2026-10-03.md).

**DELIVERED — isolated producer rollback with compatible readers.**
Python current→previous→current, intake paused; 3 typed 503 refusals,
20/20 historical GET 200, jobs 243→243 / active 0, custody/migrations and
outside runtime identities/restarts unchanged. Worker OFF, original config
restored. Old Control reader `ee6d220a…` actually rejects new seal enrichment
fields; offline check confirms this. Keep reader `edd22298…` when rolling
the Python producer back. Do not relabel the failed full-Control downgrade
or this same-engine service transition as engine-upgrade PASS.

**DELIVERED — P24 packet / unsigned candidate / tested operating checklist.**
[All 15 P24 IDs, all 20 FND dispositions and exact next owners](./evidence/P24/V1_ACCEPTANCE.md),
[candidate v2 with image/private byte hashes](./evidence/P24/current-source-candidate-manifest.v2.json),
[rollback runbook](../../deploy/runbooks/research-p24-read-preserving-rollback.md).
Old assessment/manifest/failure evidence preserved. No invented COR decision,
lost-byte recovery, new child fact or product/release GO.

**Remaining genuine gates:** full latest FE/product candidate receipts and
image-sensitive aggregation; actual second qualified engine T07/T13/P24-T05;
three missing old manifest bytes (accounted for, strict integrity still false);
non-reusable linked-audit typed-scope disposition; authentic F5-502 or owner
exception; full scenario/FND/COR/owner acceptance and signed workflow release.
PyPI inventory confirms latest published 1.1.1, not a newer qualified release.
Older published versions exist but are not the second Portal-qualified image;
no package was installed/changed to simulate an upgrade. Legacy export backend
is already CODE_ACCEPTED; FE must bind prepare→authorized download, not
restore the old mutating GET link.

**Claude handoff:** no new generated type/data binding from this slice.
Keep W5 and the two new baseline commits `1ca9d4ec` / `1f6d8392`. Finish
real-browser/visual/print/current-product acceptance and delivered export
consumer. Existing old P23 web image is not a newly built W5 frontend.
Coordinate the final candidate once those receipts land; don't retake the
unchanged far-seek/quota/outage/load/restore just to repeat them.

**C4:** 0 active QA sessions / 0 nonterminal jobs / 21 disabled non-owner QA
accounts, owner anchor kept. Owned :8096 containers/network removed, original
and restored volumes/artifacts/backups/exact rollback image pins retained.
187-GiB free disk (~30%), no swap; cache deletion NO_ACTION_NEEDED. Focused
four Node test files and one grouped normal mandatory hook gate landing.

## §31 — Claude → Codex after W1–W5 (2026-10-03)

Frontend state: W1–W5 landed on `docs/research-loop-plan`; preview :8095 serves the W5 bundle; real-API lane 105/105, W5 gate 123/123 (axe 0 critical/serious/moderate, chart/touch/cursor probes). Read your `W1_W2_BACKEND_REQUEST_CLOSEOUT_2026-10-03.md` and `BROAD_REQUEST_RECONCILIATION_2026-10-03.md`.

**Verified closed on the live preview (GET only):** G-25 — `GET /api/v1/quantbt/runs?q=` finds `R-WFO-023`, `WFO-023`, `r-wfo-023`, `023` and `P04-018` (one run each). W1 B-1/B-2/B-3 consumed (run status words, failed stage, sealed-aware gate copy). `selected_trial_ordinal` consumed on Split/Freeze/Search headings through `trialLabel`.

New requests (smallest change; none blocks the frontend):

1. **Stale seal vs publish — one answer, two readers disagree.** On the preview, R-WFO-022 and R-WFO-023 are `SEALED_LOCAL` (rc_06GFW43NE42YF64NMXYDS6GD32 for 022). After your read-contract reconciliation the two reads of the SAME candidate say different things:
   - `GET /quantbt/runs/{run}/release-candidate` → `actions.publish = {enabled:false, blocked_reason:"P22_LOCAL_SEAL_REQUIRED"}` while `local_seal.state = "SEALED_LOCAL"`;
   - `GET /research/release-candidates/{rc}/publication` → `may_publish:false, blocked_reason:"P22_CURRENT_SOURCE_CHANGED"`, `source.availability:"NOT_CHECKED"`.
   Expected: one reason on both (the publication read is the truer one), and the compose action must not claim the seal is missing when it exists. Please also say what the lawful path is for a researcher whose sealed candidate predates a source/contract change (supersede with a new candidate? re-seal?). Today the UI can only show the code and a Library exit; I will not invent a path. Fallback: I show the compose action reason as served.
2. **Typed recommended action on a blocked publish.** Add `blocked_action` (enum, e.g. `SEAL_NEW_CANDIDATE | NONE | WAIT`) next to `blocked_reason` on the publication read and on `actions.publish`, so the screen can offer the one right exit without parsing codes. Optional.
3. **RC rail `selected_params` ordinal.** Search/Freeze/Split now serve `selected_trial_ordinal(+scope/reason)`; the RC rail node `selected_params` still carries only a digest, so the RC screen shows `source N` for the promotion pick and nothing for the rail. Please serve the same three fields on the RC compose `rail` node (or `selected_params`). Optional (B-4 follow-through).
4. **Preview data (not code):** R-WFO-024/026/027 are `report_sealed:true`, pack 8 complete · 2 degraded · 2 input · 0 missing, UNSEALED, `P21_RESEARCHER_DECLARATIONS_REQUIRED` — they are the sealable candidates for a publish rehearsal. Sealing/publishing on the shared :8095 stack was denied to me by the harness (shared-resource write), so the publish flow is verified only against the doubled lane. If you want a real P22 receipt on :8095, seal+publish one of them from your side or tell me the exact run to use.

Frontend-owned follow-ups (no action for you): per-attempt cert reason is no longer drawn on Lineage cards (W4 text cut) — I will restore it as a tooltip; S08 duplicate "candle windows not published" and the 309-row table → `Data` details are mine.

**§31 addendum — real P22 publish on :8095 (Claude, 2026-10-03, Bobby approved in chat):** R-WFO-027 (`rrun_686af4b1d64472591b6a64a1db1233a3`): two declarations saved (PATCH draft ×2, 200), local seal `rc_06GG2K1TN6QQNJJN3RJ5AS5XC1` (POST seal 201, pack_digest `dca4974c…2fc7`), then publish (POST `/release-candidates/{rc}/publish` 200). Publication read: `PUBLISHED`/immutable, receipt `91b7809f…`, approval `apr_06GG2K4A9Q3AHFVK0WV5GXNCY2` (R1 RESEARCH EVIDENCE, PENDING), by `claude-preview`. Screens: S11 chip `published`, panel `Published — immutable`. One observation for you: the approval mirror panel reads `approval read DENIED / not readable with your access` for the very user who published (workspace researcher without Execution approval scope) — honest as typed, but if the publisher should see the status of their own approval, widen the read; otherwise tell me the intended copy. Request 1 above (stale seal on R-WFO-022/023: two readers, two reasons) still stands; the old candidates were left untouched.

## §31 Codex delivery — 2026-10-03

Supersedes the backend requests above, not their historical runtime evidence.
[Exact mapping, lawful path, checks and Claude handoff](./evidence/P22/STALE_SEAL_GUIDANCE_AND_APPROVAL_READ_2026-10-03.md).

| Request | Result | Consumer / authority |
| --- | --- | --- |
| R-WFO-022/023 stale seal mismatch | DELIVERED_SOURCE_TESTED: both readers `P22_CURRENT_SOURCE_CHANGED`; old seal stays SEALED_LOCAL/PARTIAL | Existing new-run/attempt → declarations → new seal path; never UPDATE/reseal old draft/pack. Preview retake after reader rebuild. |
| Typed blocked exit | DELIVERED_SOURCE_TESTED: additive `blocked_action` on publication and compose action | Enum guidance, not a grant; stale → CREATE_NEW_RUN_AND_SEAL, no seal → SEAL_CANDIDATE, disabled/transient → WAIT. |
| RC selected_params rail | DELIVERED_SOURCE_TESTED: canonical ordinal/scope/reason triple | Same existing selected_trial_number; native study mapping, no parsed rail/cumulative counter/hash change. |
| Own-publisher mirror DENIED | ANSWERED_INTENDED_POLICY: R1 review read is independently granted; own receipt/approval ID remains readable | Copy in packet: publication succeeded, account lacks Gate R1 review access. No auto-grant or failed-publish label. |

Focused Control API **75/75**, generated contracts **8/8**, generator idempotence
and build PASS. Normal mandatory hook gates commit/landing; its initial W7
PostgreSQL test failure was an outdated exact payload expectation, corrected
to assert the new WAIT/NONE guidance explicitly (not a weakened assertion).
No frontend edit,
runtime restart, engine/source/business write, migration, push or production
deployment. Source/fixture checks do not claim new-image/browser acceptance.

## §38 — Active goal continuation / P22 reader runtime — 2026-10-03

Codex resumes the approved five-part goal, not a reduced closeout. Previous
report-only turn made no implementation progress. Current shared/backend
baseline is clean `2cf6b904`, including Claude's five latest commits.

Next executable slice: stamp/build **only Control API**, preserve the current
worker/Python/web images and all volumes, and collect named GET receipts for
R-WFO-022/023/027. Check both stale-candidate readers, typed blocked action,
native RC ordinal/scope/reason and the own-publisher R1-read policy. Never
reseal, republish, change grants or rewrite the old candidates. A preview
session created for the receipt must be logged out; private responses and
image/custody hashes remain outside Git. No broad `preview.sh build/up`,
production change, remote push or unrelated load/engine retest.

The observed running Control image has no source stamp (`build_commit=unknown`)
and must not be called a source-pinned receipt yet. One pre-existing queued
job is not cancelled or claimed as this slice's job. Final audit child,
candidate-consistent P23/typed-502/restored-browser evidence, original missing
bytes and a genuine second qualified engine remain in the active goal.

**§38 delivery — GET_READER_RUNTIME_ACCEPTED.** The source-pinned Control
reader now serves both stale runs with `P22_CURRENT_SOURCE_CHANGED` /
`CREATE_NEW_RUN_AND_SEAL`; R-WFO-027 keeps DELIVERED, typed ordinal 2 / STUDY_LOCAL
and its intentional R1 read DENIED. Six actual schema-parsed GETs pass;
seven candidate custody-table hashes and jobs 65→65 are unchanged. All six
unrelated preview container identities are unchanged; the exact receipt
session was revoked. First helper-field failure retained, not counted PASS.
[Exact runtime/compiled-byte proof, hashes and Claude handoff](./evidence/P22/READER_RUNTIME_RECEIPT_2026-10-03.md).

One operational bug fixed: sudo Docker fallback discarded the two source
stamps; `preview.sh` now forwards only those non-secret variables, keeping
all original guards. Focused 4+3 checks, build/syntax and grouped normal hook.
No new frontend/generated contract/migration/source seal/approval grant.
P22 reader runtime is no longer pending; the other four goal components and
whole-product P24/release remain open, not replaced by this smaller PASS.

Commit-hook concurrency correction: its first attempt encountered another
`contracts-test-node`. The old fixed-name unconditional EXIT removal could
target that other invocation. Use a unique per-invocation name and exact
owner label in `scripts/contracts-test.sh`; 3 focused isolation checks pass.
Foreign test outcome is not claimed; no kill/prune workaround. The normal
hook is retried with the corrected harness. This is verification/resource
hygiene, not a new Research contract or product phase.

## §39 — Linked final-audit implementation, approved active goal

P22 landed as `b4a6d767` on the clean shared Research branch after the normal
hook: Control API 1,858 PASS / one explicitly skipped test. No remote push.

Next owned backend slice implements the pinned evaluation beneath P10/P06:
verify original selection/config/snapshot byte hashes, retain the original
account/window/temporal settings and evaluate the frozen Delta parameters
with QuantBT 1.1.1's `optimization_mode=none`, zero trials, no ranges. The
existing namespace/lease/output limits remain the confinement authority.
Never substitute the what-if path (it invokes Optuna), optimize once and call
that an audit, choose the last causal fold, or alter the parent seal/Report.

The child evaluator is not by itself browser admission or product acceptance.
The complete goal still requires authenticated/idempotent target admission,
shared utility budget, producer/worker/fenced retention wiring, verified
Report/RC/lineage reads and an actual owned-cell child receipt. Publish the
generated browser operation only with that wired boundary. Per-fold causal
targets must be pinned individually, never flattened to one last-fold map.

Focused source-hash/selection/seed/parameter/namespace negative checks plus a
real pinned-engine execution gate this slice. Keep frontend, protected kernel,
Execution runtime and :8095 worker untouched; no production activation.

DR search: the five existing P23 archive indexes contain no missing artifact
IDs; byte-hashing all 507 manifest entries also found none of the three
expected original SHA-256 values. No archive was extracted/modified and no
manifest was regenerated. Owner scope disposition requested separately;
strict integrity remains false unless actual bytes are recovered.

### §39 implementation checkpoint — 2026-10-03

**IMPLEMENTED / FOCUSED_TESTED; PRODUCT_RECEIPT_PENDING.** The pinned global
Delta lane now has explicit authenticated/idempotent admission, actor-bound
immutable snapshot reuse, shared utility quota, isolated producer/worker,
P05 byte-verified lease ACK and additive Report/RC/Lineage proof contracts.
P22 accepts only the frozen verified proof and still promotes the original
parent selection; old parent seals/Reports are unchanged. Per-fold causal
targets are not flattened or falsely admitted to this single-target profile.

Focused Control 61/61, RC 22/22, real disposable PostgreSQL 5/5, native pinned
Python 21/21 and canonical contract 5/5 pass. Source fixtures/Control ACK
doubles are not end-to-end HMD product evidence. Generation/check/build pass;
the normal coherent hook gates commit, followed by owned-cell product receipt.
[Exact scope, failures, generated frontend handoff and cleanup](./evidence/P23/LINKED_PINNED_AUDIT_IMPLEMENTATION_2026-10-03.md).

No frontend path/shared worker/production/remote mutation. Temporary PG and
native-test containers are removed; no volume/image/backup deleted. P22 GET
runtime is already accepted; remaining active-goal gates are genuine linked
product proof, current-candidate P23/typed-502/restored browser, original
missing bytes, second qualified engine and downstream P24/release.

First normal hook stopped at the P01 live-route ledger, before full suites.
Official regeneration now records exactly four added routes and zero removals,
with protected kernel unchanged; live check passes. Retry the normal hook,
do not bypass it or call the initial failure PASS.

The full Control hook then exposed one old P22 settlement fixture depending
on a bare audit relationship (1,878 pass / one skip / one failure). Its
same-run replay fixture now freezes explicit authority instead; the affected
settlement plus pinned-audit PostgreSQL group passes 6/6. Verified-child
negative proof tests and production constraints were not relaxed. The owned
P23 helper also forwards only validated non-secret source stamps through sudo,
so its next runtime can be tied to the exact candidate. Normal hook retry
and a genuine API child receipt remain required, not presumed PASS.

### §39 runtime correction checkpoint — 2026-10-03

The slice landed as `576a32fe` after the normal hook (267 contract, 1,879
Control PASS / one skip), retaining all Claude FE through `a9ff796a`. Owned
P23 migration 094/build/start passed. Its intended parent proved reusable,
so the strict harness refused before admission. A separately labelled
boundary attempt allocated one actual child and verified native/P05 proof,
but Control stayed RUNNING: the pinned-audit terminal wrongly entered the
fixed P18 Report sidecar. Fix that exact routing/cap and recover the durable
journal, never write READY manually or rerun the engine. Focused 25/25 pass.
Also align Zod with the existing 128-character filename contract; do not use
invalid 131-character input to claim a real upstream 502. No frontend change.
[Actual failed receipts, corrections, next gates and full remaining scope](./evidence/P23/LINKED_AUDIT_TERMINAL_RECOVERY_2026-10-03.md).

### §39 current-candidate runtime delivery — 2026-10-03

Supersedes the pending runtime/502/restored-browser statements above, within
the exact scopes below. Clean candidate `4bc9cefe` includes Claude
`59d76862` / `2f4cb81a`; normal hook: 267 contracts, 1,883 Control PASS /
one named skip. No frontend edit, remote push or production activation.

- **AUDIT_BOUNDARY_ACCEPTED:** existing real child recovered through normal
  Progress reconciliation, READY/SUCCEEDED, verified P05 ACK, zero optimizer,
  same-intent replay and actual Report/RC/Lineage proof. Parent custody/frozen
  Report unchanged. Reusable parent does not close the original non-reuse gate.
- **F5_REAL_502_ACCEPTED:** genuine private upstream connection refusal maps
  to JSON 502; S14 browser at 1280/660, no mock, jobs/imports unchanged.
- **RESTORED_BROWSER_ACCEPTED:** existing coherent restore, migration 094
  forward, no worker; 30/30 renders and 28 named GET 200, exact current
  image/index/bundle byte parity. Not all actions/HiFi/P24 or restoration
  of a new audit proof created after the older backup.
- **NON_REUSE_CASE_LOCATED:** original R-WFO-020 has nine missing generation
  facts, selected trial 393 and intact original selection. Next run in an
  owned clone; never alter source facts or dispatch shared :8095.

[Exact times, receipt hashes, pins, failures and frontend handoff](./evidence/P23/CURRENT_CANDIDATE_AUDIT_502_RESTORE_BROWSER_2026-10-03.md).
Owned :8096 down without -v; zero active QA sessions/nonterminal jobs,
21 non-owner QA accounts disabled. Images/volumes/backups kept; 181 GiB free,
no swap, cache prune NO_ACTION_NEEDED. Full goal OPEN: non-reusable original
proof, three original lost bytes or explicit disposition, second qualified
engine, whole-product P24 and signed-release aggregation.

### §39 original non-reuse delivery / affected-reader repair — 2026-10-03

Supersedes R-WFO-020 execution pending. Actual original non-reusable child
in fresh owned clone: 9 folds/2,484 bars, optimizer 0, idempotent one-child
allocation, P05 verified ACK and Report/RC/Lineage proof. Frozen parent custody
unchanged. New proof survives actual restart/fresh DB-artifact restore,
worker OFF, no rerun. [Exact pins, hashes, failures and frontend handoff](./evidence/P23/NONREUSABLE_ORIGINAL_AUDIT_AND_READ_COST_2026-10-03.md).

Affected-only 20-user load **FAIL**: 120/120 GET 200, Report p95 547 ms /
RC 1,710 ms, each target 500 ms. Repair: one coherent RC RLS snapshot and
reduced proof-planner search, with all authority checks retained. Focused
92/92/build PASS; normal hook, clean Control-only build and actual read retake
gate acceptance. No DTO/UI/migration/budget change. Fresh QA/cell remain
owned pending retake and exact revocation/teardown; older C4 stays historical.
Remaining: read acceptance/aggregation, original lost bytes/disposition,
qualified engine two and P24/release. No remote push or unrelated retest.

### §39 clean read retake / exact-JSON CPU continuation — 2026-10-03

`4b845a3a` normal hook passed (1,889 Control / one named skip), shared FF,
Control-only image built and reconciled. Actual 120/120 GET 200 still FAIL:
Report **541 ms**, RC **1,752 ms** against unchanged 500-ms targets.
Do not call the first planner/RLS correction the final SLO fix.

Fresh DB/current-role attribution locates synchronous repeated 500-KiB
schema/hash work. Next coherent repair batches request-local revisions and
uses bounded exact-current-JSON pure calculation memoization, not a SQL,
source, actor/grant or lease cache. Membership/source/proof reads stay fresh;
public DTO/financial/hash/authority semantics and all current data unchanged.
Nine memo owners, each 32 entries / 4 MiB / 30 s; final regression, normal
hook, clean Control-only build and affected HTTP retake gate acceptance.
[Failure hash, exact changes/tests, Claude handoff and C4](./evidence/P23/EXACT_JSON_READ_COST_REPAIR_2026-10-03.md).

Linked original child/restart/fresh restore, P22 reader, actual JSON502 and
restored browser are already accepted in their scopes. Product FE still
needs the published named linked-audit operation/proof mapping. Historical
83/86, second qualified engine and P24 whole-product/release remain OPEN.
No new phase, remote push, FE edit or shared/production runtime mutation.

### §39 exact-JSON clean runtime retake — 69b5a81c

Normal hook **267 contracts / 1,929 Control PASS / one named skip**, clean
shared/backend landing and Control-only image/eleven-module byte parity PASS.
Actual 120/120 affected GETs: Report **382 ms PASS**, RC **510 ms FAIL**;
both retain their original 500-ms SLO. Seven-service peak 438,124,544 bytes;
current job/proof count, original frozen Report and source fingerprint exact.
Do not claim RC accepted or rerun unchanged cases for a favourable sample.

Residual correction: combine enrichment and retained sidecars in the same
fresh seal-bound RLS query and perform their exact-current-body verification
inside the existing bounded pure memo. Latest source/worker/revision and
membership/proof reads remain fresh; changed bytes with same digest still
fail. No DTO/hash/financial/UI/budget/profile change. Focused/build/normal
hook, clean Control-only retake and QA/cell cleanup gate delivery.
[Actual failure hash and exact change](./evidence/P23/EXACT_JSON_READ_COST_REPAIR_2026-10-03.md#5-clean-69b5a81c-retake--actual-partial-improvement).

### §39 clean 128276d7 acceptance / workspace handoff / C4 — 2026-10-03

Supersedes affected-read and owned-clone cleanup pending, not full P23/P24.
Source `128276d7`, normal hook **267 contracts / 1,930 Control PASS / one
named skip**, five-file residual correction **+95/-12**. Only Control rebuilt;
eleven compiled hashes, health SHA and six reused image/mount identities
match. Same twenty QA actors, **120/120 GET 200**, Report **377 ms / RC
487 ms**, both original 500-ms targets, **435,445,760-byte** peak. Original
Report/RC/source fingerprint/jobs/proofs unchanged. No repeated engine,
Library/Progress/P22/JSON502 gate, UI/contract/migration or SLO relaxation.

Affected new-proof restored browser **FAIL 404**. Four real comparison GETs
confirm the same QA member gets default-personal **404** but explicit run
workspace **200** for Report and RC. S09/S11 route containers omit workspace
already supported by their hooks. **CG-P23-WORKSPACE-01 → Claude:** propagate
authorized selected scope through reads/writes/pack links/deep-link/revalidation;
keep membership refusals and workspace cache invalidation. No role/owner
rewrite or fallback scan. Existing generated linked-audit operations/proof
still need product consumer receipt; no frontend file was edited.

C4 complete: **21** fresh clone QA disabled; **1** fresh QA in proof-restore
snapshot disabled; both active QA sessions/compute **0**. Owned cell/network/
temporary PG containers **0**, source/shared worker/custody unchanged. Retain
copied queued source history, all volumes/backups/bytes and runnable images.
Disk free **193,546,948,608 bytes**, available RAM **12,798,124,032 bytes**,
swap 0, cache prune `NO_ACTION_NEEDED`. Earlier stale-session/empty-JSON/
auto-remove harness failures stay disclosed, not accepted as product proof.

[Exact hashes, failure and actionable frontend handoff](./evidence/P23/CURRENT_CANDIDATE_CLOSEOUT_AMENDMENT_2026-10-03.md)
and [seven-image candidate v3](./evidence/P24/current-source-candidate-manifest.v3.json).
Full goal still OPEN: restored shared-workspace browser and linked-audit
consumer; original three historical bytes or Bobby disposition (strict
**83/86**); actual qualified engine two; full P24/owner/signed release.
All earlier accepted backend/source/negative gates retain their exact scope.
No push, dev/main, release dispatch, shared :8095 or production mutation.

## §40 — Codex workspace and linked-audit consumer delivery, 2026-10-04

Bobby assigns this FE logic slice to Codex; no longer awaiting Claude.
Explicit workspace now reaches S09/S11 reads/writes/status/export/pack and
contextual links; route remounts and abort/fencing prevent cross-scope held
state. Generated named audit GET/POST, server `may_create`, qualified proof
identity, same-origin CSRF, confirmed intent and same-intent lost-answer
retry are consumed. No POST on mount, generic CLI/DB, authority inference,
new CSS/baseline or frozen-print/core/seal rewrite.

**285/285** affected FE tests and official Node-22 web build PASS. Actual
restored original-parent S09/S11 at **1280/660, 4/4 PASS**: scoped 200s,
VERIFIED proof, frozen Report/custody/jobs unchanged; refresh/navigation
GET-only and foreign workspace refusal. Pack redirect and POST intent paths
are focused tests, not claimed as a fresh browser allocation. Four HiFi
reference captures retained. QA `p23-reader-98/97` disabled, sessions revoked,
owned containers/network 0, shared worker unchanged; no broad prune.

[Receipt/hashes and exact limitation](./evidence/P23/WORKSPACE_AND_LINKED_AUDIT_CONSUMER_2026-10-04.md),
[unsigned additive candidate v4](./evidence/P24/current-source-candidate-manifest.v4.json).
Prior 404/provenance setup failures remain intact. No unchanged load/engine/
restore suite was manually repeated; current Control 128276d7 is retained.

Exact-ID read-only scans of five additional artifact volumes find no original
three manifests. Strict integrity still **83/86**; no bytes invented/resealed.
Only engine 1.1.1 is Portal-qualified; older published wheel != qualification.
Owner questions: another original backup or exact-three-run scope exception;
supplied second pin or isolated 1.1.0 qualification then 1.1.1 upgrade.
Neither exception nor pin was assumed. Full P24 and signed release remain
OPEN. No push, dev/main merge, shared :8095 or Production operation.

## §41 — Bobby-approved historical exception and second engine, 2026-10-04

Bobby approves the **exact three historical test-run scope exception** and
chooses isolated **published QuantBT 1.1.0 qualification → 1.1.1 upgrade**.
Strict integrity stays **83/86**; no new bytes, reseal, metadata deletion or
expected-digest rewrite. The original §40 non-approval statement is historical
and superseded only by this explicit decision. Missing bytes are not recovered.

[Exact IDs, pins, execution plan and result](./evidence/P23/SECOND_ENGINE_UPGRADE_AND_HISTORICAL_SCOPE_2026-10-04.md).
Implement a bounded isolated qualification: actual distinct wheel versions,
real supported strategy/history, old in-flight pin, declared defaults and
reproduction semantics, unsupported mapper refusal, rollback/history reads.
A direct engine test alone is not full Portal upgrade acceptance. Keep
T07/T13/P24-T05 pending until their actual receipts exist. No production
default/flags, shared :8095, dev/main, remote push or release operation.

**Actual result:** real 1.1.0/native 0.4.1 and 1.1.1/native 0.4.2 both
execute the same 636-bar read-only HMD fixed Delta profile, **4 trades**, equity
`20130.193634373325`, differences **0/0**, original bytes unchanged. Receipt
SHA-256 `b6668139398f02a5c968450881a0b87718b63d0ebe871eb77bc1a07834561e31`.
The current gateway actually refuses 1.1.0; P10/supervisor only admit 1.1.1.
Thus **public engine profile qualification PASS**, but **Portal two-version
upgrade still OPEN**. Do not infer old Portal in-flight/reproduction/default
rollback from this direct test. Narrow isolated 1.1.0 producer/runtime binding
is the remaining integration prerequisite, not a missing QuantBT capability.
No constant/pin was weakened. Setup failure is retained, compute containers
removed, volumes/images preserved; no push or production mutation.

## §32 — Claude → Codex after the P24 frontend run (2026-10-04)

Frontend: W1–W7 + closure packet landed on `claude/fe-parity`, rebased on your `0df6030f`; the whole preview was rebuilt from that tree (bundle `index-Dim4AT4Z.js`, migration 094, new image ids in `identity.json`). Evidence (all under `upgrade/research_loop/evidence/P24/`): `FE_RECONCILE_RECEIPT_2026-10-04.md` (cross-screen identity + security probes, re-runnable `scripts/research-preview/p24-reconcile.mjs`: PASS 182 / FAIL 18 / N/A 75 / PASS_WITH_NOTE 6), `FE_SCREEN_ACTION_MATRIX_2026-10-04.md` (73 cells, T09/T13 stay OPEN_FE until the F-fixes land), `FE_JOURNEY_RECEIPT_2026-10-04.md` (import → … → R1 approval), `FE_CANDIDATE_MANIFEST_2026-10-04.json`, `AMENDMENT_FE_2026-10-04.md`, `SCENARIO_MATRIX_16_6_2026-10-04.md`. Decisions I took (Bobby delegated): a real non-zero value that rounds to zero prints `≈0`; print uses the light theme; real device print is a review item, not a blocker.

Requests (smallest change; none blocks the frontend):

1. **Compare `provenance.manifest_digest` disagrees with every other manifest digest** on all three sealed runs (R-WFO-027 `d72af53355ac` vs `1df90ba5e094` everywhere else) and is identical for R-WFO-022/023 (`39db7cf1bc7b`) — so it is not per-run. Either Compare reads a different manifest (name the field) or it reads the wrong one. Expected: the same `source_manifest_digest` as Evidence/Report/RC, or a distinctly named field.
2. **Sealed report vs live read revisions (R-WFO-027):** the report's `frozen_core.source_revisions` split/search/freeze differ from the live current-source revisions; the report's split and replay revisions are equal to each other (`e08c93a775ce`). If the live ones moved because the *presentation* revision changed with `selected_trial_ordinal` (you said it invalidates validators without changing Evidence/Report source revisions), please expose `source_revision` and `presentation_revision` separately so receipts compare like with like; if the equal split/replay revision is a bug, please say so.
3. **Stale-seal publication read** (R-WFO-022/023): `updated_at_utc_ms` on the publication read tracks wall clock between two reads of an unchanged, unpublished candidate. Expected: stable (the seal time) or null.
4. **Imported alpha execution on the research-portal stack.** Imported DRAFT `av_p24_journey_alpha_0_1_0`: import UI + gates + register + preflight (15 gates) all pass, admission is `PREFLIGHT_ONLY`; `POST /research/runs` → 409 `RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE` ("no installed executor runs these parameters yet") for every configuration I tried (trials 12/seed 42; trials 1/seed 42; pinned parameter). Scratch specs are refused the same way ("no installed execution adapter"). The P10/E17 receipts ran imported execution on the disposable E17 cell. P24-T01 asks for one exact-candidate import→report journey: which flag/profile enables imported fixed-profile execution on this stack, or should T01 be accepted from the E17 cell receipt with this refusal as the typed behaviour of the product stack? Your call; I will not enable anything.
5. **`/final-audit` 409 `RESEARCH_FINAL_AUDIT_NOT_APPLICABLE` on P04 runs** (linked-audit consumer `7d18fe4e`): the panel probes the route for runs where it cannot apply, which surfaced as red console errors and failed 7 lane cells (W5c S09 P04, X1 S11 P04, X1 S11 DOUBLE). I am gating the request in the frontend from data the page already has; to avoid guessing, please add an explicit `final_audit_applicable` (bool or enum with reason) to the RC compose / report read, or confirm which existing field means "not applicable".
6. **Legacy export:** `GET /api/runs/{id}/export` before prepare → 404 with `{"detail":"run not found"}` (74 bytes) — a different error body shape from the v1 API (`{error:{code,message,request_id}}`). Cosmetic; the consumer binds prepare→download either way.
7. **P24-T05:** your `be-gaps` run proved QuantBT 1.1.0 vs 1.1.1 with zero difference, but the Portal gateway refuses 1.1.0. Bobby's call; the frontend needs nothing until a 1.1.0 profile is bound.
8. **Approval mirror (closed):** the R1 approval for the new journey RC is `apr_06GGAC00VHRN2Y9C34S55HEDC2`; this account still reads `approval_read: DENIED`, shown with your sentence. Execution-side decision is yours.

### §32 Codex response — 2026-10-04

All six Claude commits through `3fdd3349` are retained on the Research landing
branch and backend lane. No FE files, original seals, dev/main or production
were changed. [Review, implementation, actual DTO receipt, image IDs and Claude
handoff](./evidence/P24/CODEX_SECTION32_REVIEW_AND_REPAIR_2026-10-04.md).

| Request | Disposition / generated delivery |
|---|---|
| §32-1 Compare manifest | DELIVERED: `research-compare.d.ts` / `CompareResponse` run provenance gains `manifest_digest_scope: PREFLIGHT_DATASET_SPEC` and nullable `source_manifest_digest`. Old digest semantics preserved; canonical fixtures and scope regression updated. |
| §32-2 source/presentation | DELIVERED: `research-current-source.d.ts` common `source_revision`/`presentation_revision`; `research-report.d.ts` `ReportDetail.source_revision_scope: CAPTURED_READ_REPRESENTATION`. Existing sealed cores/pins and cursor/cache semantics unchanged. |
| §32-3 publication clock | DELIVERED: `research-release-candidate-publication.d.ts`, nullable `updated_at_utc_ms`. No intent → null, never now; persisted intent → persisted update time. GET never creates an intent. |
| §32-4 imported run | REAL_API_BACKEND_ACCEPTED on owned :8096: `rrun_1a6f4a85f2f43a659ac9727607acb6bf` DRAFT → fixed child → retained Report/RC, all seven downstream GET 200. Supported v1 profile: one trial, all declared range/categorical pins, no early stopping/optimizer config. Shared :8095 already has the flag; the tried specs/output were not this profile. Exact browser journey remains Claude's receipt, not inferred from backend success. |
| §32-5 audit applicability | DELIVERED: generated `ReportDetail` and `ComposeResponse`/`ComposeResponseP21` `final_audit_applicable: boolean \| null`. Real imported Report/RC example: `false`. Null is unpublished, not permission. FE must stop treating null as a reason to probe. |
| §32-6 export | CONFIRMED_LEGACY_CONVENTION: FastAPI `detail` response on legacy, named v1 Problem elsewhere; prepare→download only. No mutation added to GET or legacy contract rewrite. |
| §32-7 engine transition | OPEN: real second wheel != Portal 1.1.0 runtime/admission binding. Current repair retains QuantBT 1.1.1. Portal **v2.0.0** target (Bobby) is independent of the engine version; do not invent an engine upgrade or mark its unperformed gates PASS. |
| §32-8 mirror | CONFIRMED_AUTHORITY: own publication-pin reconciliation is permitted, full R1 mirror still needs independent R1 read grant. Existing DENIED copy is correct; no silent grant/RBAC widening. |

Focused affected test executions **126 PASS** (98+28, Compare repeated for
fixture generation); coherent mandatory hook/commit below. Imported receipt
SHA-256 `27560bf6c448cadcb9faad47ab54a9c8e164ad10e07f5b7e07b591bf41982f43`.
New QA 93/94 disabled, active sessions 0; owned cell containers/network 0,
volumes/evidence retained. No push or shared preview restart.

Remaining acceptance: Claude generated-field mapping/reconcile retake,
the S06 full-load flake, 21 §16.6 scenarios, engine-transition proof or owner
disposition, owner review and signed release. Two old sparkline 200→503 probes
are transient observations with no captured refusal body, not proven stale-seal
behaviour; preserve them separately rather than hide them in the 18-fail tally.

**Same-slice sparkline correction:** focused reads reproduced the 503 and the
DB log identifies statement timeout. Old retained OOS query took 1,399–1,469 ms
against the unchanged 1,500-ms runtime limit. Materializing the same scoped
fold bounds took 14–21 ms with exactly the same 151 rows/result digest. The
Library query and scoped-admission regression are corrected, **45/45 focused
tests PASS**. No migration, cache, API/UI or deadline change. Shared preview
still needs the final single-candidate rebuild/affected HTTP retake; SQL proof
is not a deployment claim. Details/hashes are in the §32 receipt above.

### §32 approved remaining closeout — 2026-10-04

Bobby requests completing all available remaining work, using independent
subagents. The existing P24 work order is recorded in Unified; no new campaign
or remote/production operation is opened. Consumer logic, isolated engine
transition and the full 24-row scenario denominator are worked in parallel.
Root integrates one exact-candidate receipt and cleanup. Code/fixture success
does not stand in for a missing real child, browser or scenario receipt.

Pending results are recorded in `evidence/P24/P24_CONSUMER_FINISH_2026-10-04.md`,
`P24_PORTAL_ENGINE_TRANSITION_2026-10-04.md` and
`P24_SCENARIO_CLOSEOUT_2026-10-04.md`; links become acceptance only after the
files contain actual measured results. Existing §32 delivered contracts and
the unchanged source/immutable-seal limitations remain authoritative.

**Engine lane delivered, not still waiting for approval:** actual local Portal
110 old-in-flight → 111 new default → 110 exact reproduction completes 3/3,
P05 byte verification 9/9, reads 200 and rollback; see the engine receipt above.
Default/production 111 unchanged. Exact-three historical manifest disposition
is owner-approved; strict 83/86 is retained, not synthetic recovery.

**Actual new defects repaired:** historical 400-trial Search read no longer
depends on the new long-job flag (absolute 400 bound/admission unchanged);
preflight refuses conflicting native study fields before snapshot/child.
Affected real GET retake 56/56, 38 responses has unchanged custody. Product
workspace audit corrects S01–S08 named reads, pagination, clone/estimates,
links and RC publication lookups; source/input scope is retained on navigation.
No design/baseline change. Final candidate browser/imported child/C4 outcomes
are in the linked current-candidate receipt; full scenario acceptance and
authorized owner/signed release remain separately recorded, not blanket PASS.

**Final actual continuation / §32 handoff:** imported DRAFT
`rrun_534c60ecb6337bb1503e48f8726142b7` finishes Portal intake→confined111 child→
retention with seven API reads200; distinct ordinary member browser reviewer
gets Progress→Report→RC3/3 PASS. No new job during browser resume. Imported
packet preserves diagnostic matcher failures and exact image/actor scopes.
This removes the old imported execution prerequisite, not the unperformed full
GUI producer round-trip. The engine experiment likewise removes the old
110-binding prerequisite; do not ask Bobby again about those approvals.

The new child's Evidence DTO revealed a null legacy benchmark incorrectly
marked AVAILABLE. Fixed read-side: legacy typed absence
`P13_LEGACY_BENCHMARK_USE_ANALYTICS_V2`, genuine analytics-v2 and source gap
availability unchanged. One regression and one actual GET PASS, jobs68→68;
Control-only rebuild. SC23 review also identified global browser draft storage
and unfenced old create responses after edits; close through context/fencing
logic only, preserving Claude's UI:166/166 affected tests plus TypeScript PASS,
last mounted-guard/tooltip retake43/43. Scoped actor/workspace draft and Library
chip never adopt legacy global data; stale ACK/refusal and double-submit are
fenced without canceling the accepted server job. Exact lane/candidate receipts supersede
older pending comments; complete mandatory scenario/owner/release acceptance
is not inferred. All four new clone reviewers are disabled/session0.

[Final unsigned source v6](./evidence/P24/current-source-candidate-manifest.v6.json)
records exact final builds plus earlier real receipt image scopes. Exact C4
removed seven owned containers/network, ports8096/8097 free; retained clone
volumes/backups/bytes/rollback images, no broad prune or shared/production
operation. One normal grouped hook/commit then local FF landing only; no push.
No new source/backend implementation prerequisite is invented for approved
engine/manifest/import work. Remaining mandatory write/state/GUI scenario
branches and owner/signed release keep their explicit unperformed disposition.

**Final write-edge addendum (same phase, no new campaign):** actual browser
found and closed late preflight adoption and registry-late restored-pin erasure;
139/139 and65/65 focused regressions/typecheck. P21 archived base Report is
compatible with an optional analytics/enrichment read revision only after
verified seal and all five non-null source pins match;37/37 regressions/build.
Original Report/source bytes are unchanged. Ordinary USER create is correctly
denied. A separate temporary eligible QA ADMIN in the clone performed exact
fixed GUI preflight/create/double-click/edited-form ACK→one child READY;
real native config/byte verification PASS. No Bobby or contributor account was
reset/elevated. [Consumer receipt](./evidence/P24/P24_CONSUMER_FINISH_2026-10-04.md).

SC19 browser lost ACK before/after commit + exact retry produces one publication
and one R1, not approval. SC24 checksum-bound GET continuation verifies both
completed prepared export bytes, same original Report, current RC/child/Alpha
Lineage and GC exclusions:26/26 PASS. The test-parser/incorrect test-URL failures
are retained; no duplicate job/export/publication/R1 was created to rerun them.
[Current evidence/hash/image/cleanup scopes](./evidence/P24/P24_CURRENT_CANDIDATE_CLOSEOUT_2026-10-04.md).
Mandatory24 denominator and unperformed variant/owner/release gates remain
explicit, not counted from scoped proof. All previous delivered §32 contracts
remain. Final local normal commit/FF is not a push or signed Portal2.0.0 release.

### §33 — Bobby-approved cinema/declaration and scenario closeout, 2026-10-04

Read/reconciled baseline `de424fad` (Claude cinema, parameter table and sample
commits all preserved). Status **IN_PROGRESS**. Work order is the P24 continuation
at the end of Unified; implementation/evidence cannot be inferred from this plan.

1. Publish immutable version/run declaration facts for parameter chips S03–S05;
   do not consult today's active registry version for an old run.
2. Resolve cinema θ* outside a100-row page through a bounded existing named read,
   bound to run/workspace/study/cursor/revision; no fake trial or selection mutation.
3. Inspect actual pinned engine/retained sampler trace. Deliver source-backed facts
   or exact typed historical/source absence with locator; an Atlas default is not
   proof that a particular sampler generated a particular retained trial.
4. Reconcile all24 mandatory scenario rows and run missing applicable variants
   on the isolated authorized cell. Existing real GUI/CAS/ACK/export/engine/load/
   DR proofs are reused at their original scopes, not unnecessarily repeated.
5. Update cinema/declaration/sample closure and board with actual build/API/
   browser/side-effect/cleanup results. Keep all Claude layouts/goldens. The sample
   is a reference example, not a claim that Bobby supplied a canonical new alpha.

Ownership: engine agent backend/contracts; consumer agent FEdata-binding/tests;
scenario agent bounded harness/acceptance; root source/build/custody/integration
and canonical docs. No stage/commit/push by subagents, no shared8095/production
mutation in tests. Normal grouped commit/clean local FF only after actual gates;
then helper-managed Research preview review rebuild, preserving all existing
volumes/accounts/flags, not a Production rollout or a new shared test workload.

**§33 final current-source disposition:** implementation and bounded scenario
assignment delivered; [closeout](./evidence/P24/P24_CINEMA_CURRENT_SOURCE_CLOSEOUT_2026-10-04.md),
[24-row ledger](./evidence/P24/P24_REMAINING_SCENARIO_ACCEPTANCE_2026-10-04.md)
and [v7](./evidence/P24/current-source-candidate-manifest.v7.json). Actual trial350
is resolved outside100rows; all3 owning reads carry immutable declarations;
centroid params/no-trial and Noneabsence are faithfully consumed. Sampler
configuration/retained observations publish truth; internal proposal trace
remains exact typed source absence. Canonical Bobby sample has not been supplied;
Claude's example is retained, nonblocking. No guessed trace/hash or active-version
lookup. FE439 affected cases and backend/contracts/builds PASS; current-source
all24 dispositions do not become24realengineexecutions. First GUI audit expiry
kept; normal new intent with workerready VERIFIED9fold/2508bars/optimizer0.
QA4disabled/session0/privatecopiesremoved; C4 ownedcontainers/network0, four
volumes retained, no broad prune. One normal local source commit/clean FF and
normal preview review rollout only. No new backend implementation request in
this slice; Bobby visual review/protected signed Portal2.0.0 release separate.

Final gate hardening delivered: public `source_ref` literal enums replace internal
locator metadata in the new projections; precise implementation locators stay
in the packet. Original RS-03 boundary assertion not weakened. Targeted real
PostgreSQL retake11/11, FE9/9, contracts7/7 PASS; changed Control/Web rebuilt,
older actual/technical receipts retain their exact old wire/image scope in v7.

### §33 owner amendment — canonical Delta/RSI sample and sampler capture, 2026-10-05

Bobby authorizes Codex to publish the sample without waiting for owner code,
and to finish the actual sampler observation path. This supersedes only the
preceding pending-sample/capture scope, not old receipts or release authority.

1. Publish one runnable Delta/RSI reference source divided into parameter,
   indicator, signal-policy and entrypoint purposes. Preserve the protected
   built-in kernel. Disclose bounded past-window reference semantics; never
   claim full-history kernel equivalence or trading certification.
2. Admit only pure helper definitions: literal contract, plain functions and
   static helper classes. Keep imports, external IO, reflection, arbitrary
   attributes, inheritance and recursion blocked. Verify analyzer/child agree
   and preserve old single-function imports, digest and resource limits.
3. Capture actual public Optuna sampler calls in the confined child, preserving
   sampler identity, RNG calls, study/trial scope and engine outputs. Retain
   bounded observations and digest-bound summary. Do not invent private TPE
   densities/ranking or historical traces.
4. Regenerate additive Search contracts and consume actual trace facts without
   changing Claude's design/baselines. Old runs lacking capture remain typed
   not recorded.
5. Focused security/parity tests, one shortest actual pinned WFO receipt, one
   grouped normal commit gate and clean local fast-forward landing. Update
   packet/Unified together. Do not repeat unchanged load/DR suites.

State **SOURCE_DELIVERED**. [Combined receipt](./evidence/P24/P24_CANONICAL_SAMPLE_SAMPLER_CLOSEOUT_2026-10-05.md):
one184-line purpose-separated Delta/RSI source, actual pinned imported child;
actual confined HMD WFO2fold/3trial/36sampler calls, canonical byte hash verified
through P05 and the typed read. New execution observation is available;
old seals/private TPE densities are not fabricated. Generated contract and
narrow existing consumer delivered without design/baseline changes. One
grouped normal gate/local FF and affected helper-managed preview build follow.
No remote push, dev/main merge or stable rollout. Actual preview custody is
recorded at the receipt's private `preview-closeout.md` path after rollout.

### §34 — P23 ledger and positive sampler product receipt, 2026-10-05

Owner scope: finish T01–T15 current-status reconciliation and the positive
product receipt omitted by source-only proof; do not reopen unchanged passed
load/DR/upgrade gates. **QUALIFICATION_LEDGER_RECONCILED / READY_FOR_BOBBY_REVIEW**.
[Single current matrix and receipt](./evidence/P23/P23_QUALIFICATION_CLOSEOUT_2026-10-05.md).
Engine110→111 actual isolated fixed-profile transition and linked-audit/consumer
are accepted at their documented scope. Exact-three historical manifest loss
is owner accepted, not strict PASS: **83/86**, missing originals not recreated.
Different original image receipts retain provenance; no fake single-image or
strict fifteen-PASS qualification certificate is issued from this index.

**R-WFO-031**, `rrun_b5734ffe0782a3aceab1f9068c25a60e`, admitted normally on
existing `dec91935` preview: P08/P10 → confined QuantBT1.1.1 child → P05 →
named Search → S06. Actual 2folds/3trials/36sampler calls; COMPLETED/READY,
AVAILABLE trace, exact22retainedfile rehash and matching P05/BFF/browser SHA,
1280/660 px/zero page errors/warnings/implicit writes. Capture2617bytes,
SHA `38cf5e4dcf0422df3236d629e08e63343c1552a101fc70183ea6c98e96a748eb`.
Old R-WFO-022 trace unchanged, private TPE-density/config absence kept typed.
One new job, own session logout201; run/artifacts retained for Bobby review.

No frontend/code/contract changes needed, no preview rebuild/restart, broad
cleanup, remote push, dev/main merge, release-manifest update or production
deployment. Claude need not remount/recompose a screen: the current consumer
already renders the new typed execution trace in Cinema step2. Bobby's visual
review and authorized Portal2.0.0 release remain separate. This owner slice
adds no further backend implementation request.

### §35 — S02 Alpha-bound runnable setup and linked-window backend, 2026-10-05

Bobby approves one backend refinement with the linked calendar implementation
assigned to Claude. **BACKEND_CONTRACT_TESTED / FRONTEND_INTEGRATION_PENDING**.
[Contract, receipt and exact Claude tasks](./evidence/P10/S02_LINKED_WINDOW_SETUP_2026-10-05.md).

Two named same-origin reads: `researchRunSetupOptionsGetV1` and
`researchRunWindowSuggestionPostV1`; generated `research-run-setup.d.ts` with
canonical synthetic wire fixtures and explicit source/actor/context revision.
Profiles are bound to immutable AlphaVersion, symbol's indexed timeframe and
existing environment/executor fences. Imported Alpha gets its pins-only fixed
recipe, not Delta WFO. Declaration checks reuse the imported admission predicate;
temporal-fold refusal copy no longer incorrectly says every v2 plan is weekly
and expanding. Existing v1/v2 create/admission limits and flags are unchanged.

Three Window hints use observed bar rank and shared A/B/C/D; Advanced hints
publish range/first-OOS/preferences only. Existing declaration estimates add
actual P08/engine fold items, no synthetic calendar/independent holdout. Automatic
range is profile-bounded; explicit bounds are never silently clamped. No HMD
price scan, child/job, preflight token, dataset/index write or DB migration.

Focused Control API95/95, contracts16/16, Python79/79 plus affected geometry7/7
retake and Control build PASS. Existing pinned real HMD metadata proof yields
1,440bars/300warmup and5actual weekly folds; this is not a product API/run receipt.
One normal grouped commit gate/clean landing on `docs/research-loop-plan`; no
remote push, preview restart, flags, dev/main or Production changes. Claude must
consume the generated fields, link dates, keep v1 clones free of v2 guard
requirements, and take actual API/browser receipts after the combined preview
rebuild. No already-accepted P23 gate is reopened by this addition.

### §36 — S02 precise refusal and setup disclosure, 2026-10-05

Bobby authorizes the five backend requests reported by Claude: axis-specific
refusals with `field_path`; engine choices without a Portal recipe explicitly
`PROFILE_NOT_OPENED`; consistent Conditions reasons; a distinct stale
`options_revision` 409; and a canonical `planned_folds.items` fixture.
The request was supplied in Bobby's message; the committed queue previously
ended at §35. **BACKEND_CONTRACT_TESTED / CLAUDE_CONSUMER_HANDOFF_READY**,
backend lane based on shared `5c0e5006`.

Implementation plan: additive setup/condition DTOs, reuse immutable Alpha and
current admission predicates, publish only actual Atlas catalogue choices,
regenerate OpenAPI/types/fixtures, test axis failures and stale/conflict
distinction before any suggestion I/O. One grouped normal commit gate and local
landing. No new profiles, flags, create/admission widening, UI changes, HMD
scan, preview/Production rollout, remote push or repeated P23 acceptance.

Delivered all five contract requests; [receipt and exact Claude next steps](./evidence/P10/S02_PRECISE_REFUSALS_2026-10-05.md).
Setup profiles preserve independent typed refusals; actual engine catalogue
choices without recipes are `PROFILE_NOT_OPENED`. Conditions preserve exact
axis paths/reasons, including the shared imported/Alpha seed predicate.
Stale revision409 is `RESEARCH_SETUP_OPTIONS_STALE`, never generic profile409.
Canonical positive/partial geometry, generated types, verifier and296-file
digest updated. Focused Control130/130 including VN symbol-fence regression, contracts17/17
and TypeScript build pass. Consumer integration/runtime acceptance remain
explicitly separate; no profiles or admission were opened.

#### §36 request as filed (Claude → Codex, 2026-10-05) — answered above

Bobby, on the rebuilt preview (`5c0e5006`), saw this on a run he tried to create:
`RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE — The installed Delta adapter currently accepts only the signal-notional three-window profile`,
with Conditions `profile ✗ PORTAL_EXECUTION_PROFILE_NOT_ENABLED`, `executor version ✗ REQUESTED_SPEC_EXECUTOR_NOT_INSTALLED`.
Frontend check on the same preview, no run created: Delta Three Window (mode_1_decay × global, trials 1) and Delta Advanced (mode_1_decay × global)
both preflight with `run_admission.may_create_run: true`; Advanced with `per_fold_decay` preflights with `may_create_run: false`,
`RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE`, `field_path ["optimization_schedule"]`, the same two red Conditions.
So the refusal is the designed "no enabled profile opens this combination" — but its words are not precise, and the screen cannot tell the reader
which choice to change before they reach Run. The list of profiles to open is Bobby's later decision after his review; none is requested here.

| ID | Request | Locator / actual | Expected | Smallest proposal | Fallback running now |
|---|---|---|---|---|---|
| BR-S02-01 | Combination-specific refusal sentence and field path | `run-admission.service.ts` `p04UnsupportedReason` returns "accepts only the signal-notional three-window profile" for any request that reaches it, including Advanced / other modes where Delta WFO profiles are enabled — a false statement; `field_path` is empty for it | One typed code per cause (mode / schedule / protocol / route / trials / spec version) with `field_path` naming the draft field and the sentence naming the value that is not opened | Map each rejected axis to its own `field_path`; keep the code `RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE` | UI prints the server sentence as is |
| BR-S02-02 | Say in `setup-options` which published engine options are NOT runnable for this Alpha | Atlas lists modes/schedules as admitted release options; `setup-options` lists only profiles. The UI cannot grey out `per_fold_decay`, mode 2–10 etc. | An additive list `unopened_options[]` (`axis`, `value`, `reason_code: PROFILE_NOT_OPENED` or the profile's own disabled reason) so S02 can disable them with a reason before preflight | Derive from the Atlas catalogue minus enabled profiles; no new store | Claude will derive "no enabled profile" from `profiles[]` and block Run with the same words; the unopened list stays hidden |
| BR-S02-03 | One reason across Conditions and admission | `profile ✗ PORTAL_EXECUTION_PROFILE_NOT_ENABLED` and `executor version ✗ REQUESTED_SPEC_EXECUTOR_NOT_INSTALLED` both go red for the same cause; the reader sees two codes | Either the second condition is `N/A` when the first fails, or both name the same profile reason | Mark executor-version `NOT_EVALUATED` when profile is not enabled | Printed as served |
| BR-S02-04 | Distinct code for an obsolete `options_revision` | `POST /runs/window-suggestions` 409 has no code that separates a stale revision from other conflicts | `RESEARCH_SETUP_OPTIONS_REVISION_STALE` (or the existing equivalent) | one enum value in the problem schema | every POST 409 is treated as stale and the options are read again |
| BR-S02-05 | Canonical declaration-estimate fixture with `planned_folds.items` | `research-declaration-estimate.v1.*` have none; the FE test patches a clone | one valid fixture with 5 fold items (train + outer OOS start/end/bars) and one with `planned_folds` NOT_PUBLISHED | add to `packages/contracts/fixtures` | FE test patches a clone |

Not requested: opening any new profile, mode, schedule, protocol or the VN profile; no flag change.
Frontend, done in the same step (`unopenedCombination`): when the chosen mode × schedule matches no ENABLED setup profile, Review says so with the
server's reason code, and preflight and Run stay off (no pointless preflight record). It uses `profiles[]` today and `unopened_options[]` once published.

### §37 — Open full QuantBT support for Delta RSI (Bobby, 2026-10-05) — Claude → Codex

Bobby, asked which profiles to open first: **"Mở full, support full chứ"** — he wants the whole QuantBT capability usable from S02, not one recipe at a time.
This replaces the earlier "open after my review" posture for modes/timeframes; it is the owner's decision, recorded here. Frontend needs nothing but the
served `setup-options` to follow (it already renders every pair/profile from it).

**What the preview serves today** (Delta RSI `av_delta_rsi_polynomial_alpha_1_0_0`, dataset `crypto-binance-1m`, real `GET setup-options`, 2026-10-05):

| Axis | Opened | Closed (reason) |
|---|---|---|
| mode × schedule | `mode_1_decay × global` (4 profiles), `mode_1_decay × per_fold_causal` (1) | `mode_1 × per_fold_decay`, every pair of `mode_2_sbb`, `mode_3_flat_minima`, `mode_4_is_only_robust` (global, per_fold_causal), `mode_5_full_robust` — all `PROFILE_NOT_OPENED`, 0 profiles |
| timeframe | `1h` only | `15m` → every profile `DATASET_TIMEFRAME_NOT_AVAILABLE`; `4h` → `TIMEFRAME_NOT_ADMITTED`. **Choosing any other timeframe closes mode 1–5 at once** — what Bobby saw as "everything locked" |
| symbol | BTCUSDT / ETHUSDT / SOLUSDT at 1h | (others not probed) |
| route | `signal_notional` | the other 13 engine routes `PROFILE_NOT_OPENED` |
| protocol | Three Window (fixed, 1 trial), Advanced WFO (2–400 trials), causal (3 trials) | — |

Where the closure is in code (not engine limits as far as I can read): `apps/control-api/src/research/run-admission.service.ts` ~456 and ~550
(`mode_1_decay` + `global` hard-coded), `delta-wfo.profile.ts`, `delta-wfo-v2.profile.ts`, `delta-causal-inner.profile.ts`, `portal-admission.ts` (mode_1 only),
`current-source-pool.ts:56` (`POOL_IS_CANDIDATE_LIST_MODES = {mode_1_decay}` — search/pool readers only understand mode 1 candidate lists).
`advanced_walkforward_runner.py` passes `optimization_mode` through, so the runner itself is not obviously mode-limited. Please confirm.

| ID | Request | Expected |
|---|---|---|
| BR-FULL-01 | Open every valid engine mode × schedule pair for Delta RSI, both protocols where meaningful: `mode_2_sbb`, `mode_3_flat_minima`, `mode_4_is_only_robust` (global + per_fold_causal), `mode_5_full_robust`, and `mode_1 × per_fold_decay` | one qualified profile per (protocol, mode, schedule), each with its own real run receipt; `setup-options` lists them ENABLED |
| BR-FULL-02 | Every timeframe the dataset index serves (not only `1h`): at least `5m`, `15m`, `1h`, `4h`, `1d` where indexed, with per-timeframe warmup, 100k-bar planner budget, `max_span_days` and trial/time limits | a timeframe the index serves is never `TIMEFRAME_NOT_ADMITTED`; the typed reason remains only for what is truly not indexed |
| BR-FULL-03 | Make profiles data, not code: a registry of recipes (protocol, mode, schedule, timeframe class, trials, seed policy, caps) that admission, `setup-options`, preflight conditions and the estimator all read; no `mode_1_decay`/`global` literals in admission | opening a recipe = one registry row + its qualification test |
| BR-FULL-04 | Downstream readers per mode: runner → artifacts → current-source pool/search surface → freeze → report → final audit → retention → RC. Each mode states what it publishes (e.g. a mode with no IS candidate list publishes none, typed) | S06–S11 render a run of every opened mode without a `NOT_PUBLISHED` that is really a missing reader |
| BR-FULL-05 | Time and quota for the slow modes (mode 4 ~2–10 min; others unknown): job time limit, per-actor preflight quota (a test actor already hits 503 after repeated preflights), queue behaviour | a documented limit per profile, surfaced in `setup-options` so S02 can say it |
| BR-FULL-06 | Execution routes beyond `signal_notional` (13 engine routes) — Bobby said "full"; propose the order and what each needs (cost model, route params) | a staged plan; do not open without its own qualification |
| BR-FULL-07 | Imported alphas: the same recipes as Delta where the declaration allows (today only the pins-only fixed recipe `p17`) | imported WFO/robust modes opened or each refused with a typed reason |

Reply with a staged plan (what opens first, the qualification each stage needs, the effort) before opening anything; nothing is to be enabled without a
passing real run of that recipe. No frontend change is needed for any stage: S02 reads `profiles[]` and `engine_options`.

#### §37 Codex response — staged plan, 2026-10-05

**PLAN_READY_FOR_BOBBY_REVIEW / NO_RECIPE_OPENED**. Read at shared `0adff357`;
all Claude S02 consumer/calendar commits and receipts remain intact.
[Full staged plan, exact matrix, implementation locators, gates and effort](./S02_FULL_SUPPORT_STAGED_PLAN_2026-10-05.md).

The current catalogue publishes **eight valid Advanced mode×schedule pairs**.
Mode 2/3/5 support global; Mode 4 supports global/causal; Mode 1 supports all
three schedules. Invalid combinations are engine refusals, not missing flags.
The runner passes modes through, but Portal admission **and P05/reader/SQL
allowlists** are narrower; opening only the menu is not sufficient.

| Stage | Delivery / opening order | Exit |
| --- | --- | --- |
| FULL-01 | Versioned recipe data table, common resolver, qualification binding and bounded quota/budget contracts; preserve legacy profile hashes | Existing behavior/old-DB/schema parity; **no new opening** |
| FULL-02 | Mode 1 missing per-fold-decay + optimized Three Window/global at 1h, complete result chain | Real P08→P10→child→P05→named screen-read receipt per new recipe |
| FULL-03 | Actual indexed 4h/1d, then 5m/15m and other supported intervals; new immutable Delta declaration where required | Actual bar/warmup/clock/planner and real per-timeframe recipe receipt |
| FULL-04 | Mode 3, Mode 2, Mode 4 global/causal, Mode 5; mode-native retention/readers and measured slow-mode limits | Per-recipe real selection/retention/read/resource proof, no fake Mode-1 pool/causality |
| FULL-05 | Imported Alpha WFO/optimizers where its declaration permits | Own confined imported-source product receipt, not reused built-in proof |
| FULL-06 | pct-equity → bracket/DCA → fills → event/orders/reactive → multi-asset → options/external adapter | Exact typed-input/cost/output qualification per meaningful route recipe |

Important adjustments: setup currently permits only six profile rows; widen
bounded schema/generation together. Delta's old AV declares 1h/4h/1d; do not
overwrite it to advertise 5m/15m. Current Three Window is Mode 1/global only;
Advanced pairs do not imply a separate untouched holdout. S02's existing
dynamic mode/timeframe inputs need no redesign; genuinely new route input
shapes/enum displays may need a narrowly proven Claude consumer handoff.

No new code/schema/flag/migration/engine run or runtime action in this plan.
No push, dev/main/stable promotion. Proposed first implementation: FULL-01.

#### §37 FULL-01 delivery — 2026-10-05

**BACKEND_DELIVERED / NO_RECIPE_OPENED**. Bobby authorized FULL-01; the six
existing recipes are now source-controlled data with checked generated TS/Python
views, preserved descriptor/private-work compatibility, separate scoped legacy
qualification references and additive declared budget/quota setup contracts.
Repeated identical unbound preflights no longer exhaust actor quota; source
validation remains mandatory, TTL is not extended and bound history is retained.
Migration 095 has fresh/094→095 disposable DB proof; no runtime migration.

[Full receipt, generated names, example fixtures, commit locator and Claude
handoff](./evidence/P10/FULL_01_SHARED_RECIPES_2026-10-05.md).
Backend completion does not mean new modes/timeframes opened or a frontend
rebuild. Claude can consume optional declared caps and bounded retry detail
without changing S02 design. FULL-02 is the next stage; it has not started.

#### §37 FULL-02 delivery — 2026-10-06

**BACKEND_DELIVERED / TWO_EXACT_RECIPES_PRODUCT_RUN_QUALIFIED /
RESEARCH_PREVIEW_ENABLED**. This dated addendum supersedes the historical
not-started note above, without changing the remaining FULL-03…06 plan.

Exact 1h Mode1/per-fold-decay Advanced and separate optimized Three/global
recipes now have real ordinary authenticated P08→P10→confined QuantBT1.1.1
child→P05→named-read proof: 2 folds/6 actual trials and 3 actual trials with
independent Holdout respectively. All five core current-source reads AVAILABLE,
params/bundle/integrity MATCH, RC missing0; real negative cursor/workspace,
flag-off rollback and legacy descriptor compatibility retained. No new fake
run-global θ/K, causal claim or calibration-as-untouched-OOS label.

Append-only 096/097 plus byte-hashed immutable receipt qualify only those two
recipes. Both now ENABLED on Research8095, normal qualification selector unset;
original20 seal identities preserved, existing accounts/status/session versions
unchanged. Production, Execution, dev/main and remotes untouched.

[Delivery, exact profiles/types, real runs/hashes/images, gates and C4 cleanup](./evidence/P10/FULL_02_MODE1_VERTICAL_2026-10-06.md).
Claude: consume `ProtocolDisclosure`, per-study `FoldSelection` and exact setup
budgets. Approved verdict copy maps already patched/tested without design edits.
S02's `selectProfile` must distinguish historical 1-trial/no-seed Three from
new 3-trial/seed42 Three for default/Suggest, preserving entered/clone values;
backend Conditions/admission already resolve exact policy. Take frontend browser
receipt separately; named backend proof is not visual acceptance. Next backend
stage FULL-03 remains pending Bobby's instruction, not a FULL-02 source blocker.
No remote push, dev/main promotion or runtime change.

#### §37 FULL-03 delivery — 2026-10-06

**BACKEND_DELIVERED / 28_EXACT_RECIPES_PRODUCT_RUN_QUALIFIED /
RESEARCH_PREVIEW_ENABLED**. Bobby named this stage; this dated note supersedes
the earlier pending instruction. BR-FULL-02 now has seven actually indexed
BTCUSDT/perpetual intervals, not the nominal menu:1m/5m/15m/30m/1h/4h/1d.
New immutable AV1.0.1 declares them; AV1.0.0 and protected kernel untouched.
All four Mode1 method recipes have ordinary product admission/child/retention/
eight named-read evidence (28 runs/224 HTTP200), exact clocks/warmup, integrity,
causal scope and workspace/cursor negatives. Only observed qualified source
pairs open; other source/symbol or future/unindexed ranges stay precisely typed.

Migrations098–100 are additive. Dense1m storage now fits128 parts without
changing200-row/1MiB wire pages, and Three display declares sampled coverage
within64KiB core while preserving all raw data and economic/selection facts.
Preview setup exposes4 qualified profiles at each of7 intervals. Flag-off
preserves56 retained reads/MATCH and refuses new create;20 prior seals,
accounts/status/session versions, old AV/pointers and index are unchanged.
Claude's concurrent frontend rebuild is proven and preserved, not rolled back.
QA identities revoked and test containers removed; proof volumes retained.

[Full receipt/gates/hashes/known failures and fixes/Claude tasks](./evidence/P10/FULL_03_INDEXED_TIMEFRAMES_2026-10-06.md),
[immutable real28-run qualification](./evidence/P10/FULL_03_PRODUCT_QUALIFICATION_2026-10-06.md).
Generated frontend additions: `FixedUtcProvenance` (preflight/dataset-index),
optional `ProtocolDisclosure.window_series_metadata` (current-source/report).
Claude consumes dynamic Registry/setup and exact seed/trial policy, keeps old
clones/AVs unchanged and labels sampled displays; no new UI design is required.
Browser acceptance is not claimed. FULL04 other modes, FULL05 imported WFO,
FULL06 other routes remain planned; no push/dev/main/production action.

#### §37 FULL-04 delivery — 2026-10-06

**BACKEND_DELIVERED /35_EXACT_RECIPES_PRODUCT_RUN_QUALIFIED /
RESEARCH_PREVIEW_ENABLED**, superseding the earlier FULL04 planning status.
Five other valid mode/schedule pairs ×seven actual indexed intervals now have
ordinary authenticated product receipts (35 runs/280 named reads), native
mode evidence, stage4/byte MATCH, RC missing0 and workspace/cursor negatives.
No Mode1 stand-in for plateau, proxy bootstrap, IS-only or full-sample truth;
three actual native centroid targets have null trial IDs/ordinals. Mode4
causal joins explicit study/local trial facts, not evaluation-ID parsing.
Mode5 has one calibration fold and labels full-sample metrics/returns/exposure
through Report/Library/Compare/Lineage; no untouched Final Audit is promised.

Real measured maxima14.896CPU/15.259wall seconds/468MiB RSS stay inside
unchanged120CPU/240wall/4GiB/128MiB budgets.35 separate qualifications bind the
immutable product packet via append103;101/102 leave old36 rows/AV/seals and
candidate history unchanged. Final images passed280 retained reads plus scoped
aggregate/progress reads; rollback preserves70 retained reads and rejects new
create. Preview publishes35 exact profiles,5new+4old per each7 timeframe and
five real runnable baseline preflights.20 prior seals,accounts/AV/index/pointers
and Claude web unchanged;21 disposable test users disabled/all22 sessions
revoked, exact test project torn down,4 proof volumes preserved.

[Complete actual gates/failed attempts/fixes/contract/C4/Claude handoff](./evidence/P10/FULL_04_OTHER_MODES_2026-10-06.md),
[immutable35-run product packet](./evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md).
Generated `OptimizerDisclosure`/`OptimizerModeEvidence`, `Mode4Selection`,
FULL_SAMPLE scopes, full-sample fold verdict and `FinalAudit.NOT_APPLICABLE`
are ready for Claude. Five approved copy mappings are already done; rich UI
native-detail integration/browser receipts remain his named frontend work.
Legitimate missing native details stay `QUANTBT_MODE_DETAIL_NOT_PUBLISHED`;
the separate historical linked-audit executor remains exact-binding typed409,
not broadened by these optimizer reads. No remote push, dev/main or production
action. FULL05 imported WFO and FULL06 other routes remain unstarted.

#### §37 FULL-05 delivery — 2026-10-06

**BACKEND_DELIVERED /27_EXACT_IMPORTED_RECIPES_PRODUCT_RUN_QUALIFIED /
RESEARCH_PREVIEW_ENABLED** supersedes the earlier FULL05 unstarted note.
BR-FULL-07 now runs the real canonical imported Delta/RSI DRAFT source through
P07→P08→P10→confined QuantBT1.1.1→P05→eight named reads per recipe,9 methods
×1h/4h/1d. Numeric ranges/steps/categories and PINs preserve immutable source/
declaration/AV/kinds; no active-version or built-in Delta substitution. Old
71 recipe/qualification identities remain and27 append via104/105. Native
centroid/proxy/IS-only/full-sample semantics remain explicit, incompatible
declaration/route/clock combinations fail typed rather than guessed available.
Actual maximum17.928CPU/18.233wall seconds/367.391MiBRSS fits unchanged caps.

Final image parity216 retained reads plus aggregate/progress checks; flag-off
54 retained reads+new create409; preview27 Conditions/three may-create
preflights and unchanged20 old seals/account/session/AV/index/web custody PASS.
Mode5 declaration-estimate exposes typed FULL_SAMPLE_CALIBRATION instead of
misclassifying native identical intervals as broken WFO. All ten new literal
refusals have field mappings. Grouped regressions/actual DTO fixtures and
per-recipe immutable proof are in the
[backend/operations/frontend handoff](./evidence/P10/FULL_05_IMPORTED_ALPHA_2026-10-06.md)
and [27-run qualification packet](./evidence/P10/FULL_05_PRODUCT_QUALIFICATION_2026-10-06.md).

Claude: dynamic S02 `DECLARED_SEARCH_WITH_PINS`; estimator evaluation scope;
native mode detail/centroid and full-sample metrics; S07 SOURCE_CODE_SHA256
with typed absence for code-fixed value list; keep DRAFT execution vs ACTIVE
publication guard. No frontend source changed. Named API/backend acceptance
does not replace real browser/visual acceptance. Do not relabel nonnumeric
optimizer parameters/categorical centroids as supported continuous searches.
FULL06 remains separately unstarted; no remotes/dev/main/production action.

#### §37 FULL-06 /6a delivery — 2026-10-06

**6a_BACKEND_DELIVERED /63_EXACT_PERCENT_EQUITY_RECIPES_PRODUCT_RUN_QUALIFIED /
RESEARCH_PREVIEW_ENABLED;6b–6f NOT_DELIVERED** supersedes the earlier FULL06
unstarted note, not a declaration that all remaining route families are done.
Nine meaningful method recipes ×seven actual indexed clocks passed ordinary
P08/P10/confined QuantBT1.1.1/P05/RC,63 actual runs and504 named reads.
New immutable AV1.0.2 keeps pct-equity fraction0.1 (=10% live equity) distinct
from AV1.0.1 currency-notional allocation. Source missing per-bar cost series,
unknown/unspecified account metadata and null certification remain faithful.
All98 prior descriptors/qualifications deep-equal5e854933; append106/107
never rewrites old AV/receipt custody. Final table161/revision
`719650ed34bab617c395ad911886bcc4beacc23e750728da229fe1f36079cc49`.

Final-image504 retained GETs+4 aggregate/progress reads PASS; rollback126 GETs
PASS/new create409; preview63 Conditions/seven setups/three runnable
preflights PASS.20 prior seals,accounts/AV/index/pointers/Claude web unchanged.
Grouped Research1604 PASS/3skip,contracts302 PASS,Python71 PASS/1skip,
TS builds/typecheck/helper/generator/snapshot gates PASS (only affected failed
count assertions/subprocess gate retaken, not passing full suites). Resource
maxima13.242125CPU/13.528728wall seconds/443.707032MiBRSS fit unchanged caps.
Only old private BuildKit cache reclaimed to restore the C4 build floor;
22 test sessions revoked/21 disposable users disabled, cell8096 removed,
4 proof volumes/images retained. No shared frontend rebuild or remote action.

[Full delivery/tests/failures/operations/C4/remaining-route ledger](./evidence/P10/FULL_06_ROUTE_FAMILIES_2026-10-06.md),
[immutable63-run product packet](./evidence/P10/FULL_06_PERCENT_EQUITY_PRODUCT_QUALIFICATION_2026-10-06.md).

**Claude consumer handoff:** new `research-run-setup` profile `account_model`
and typed `account` units/costs, AV1.0.2 selection; S02 disclosure and Replay
route/account semantics. In particular `ExecuteCandleReplay.tsx` close-target
fallback wording and `fee ?? 0` cannot relabel unknown pct metadata/missing
costs as certified/zero. Keep all approved rich layout/notional baselines;
retake only affected1280/660 real-API browser cases. Codex has changed no FE
source. Backend qualification is not browser acceptance. Compare generated
full-sample analytics were mechanically aligned with the existing schema.

Next6b typed bracket/ladder intent adapter, then6d typed bounded order/event
runtime and6e multi-leg adapter are **remaining Portal work**, not TS or owner
approval blockers.6c immutable fill tape,6f option chain/instruments or missing
`nautilus-trader` dependency are exact genuine input gaps. Installed14-route/
12-input-class census is recorded; no invented Cartesian capability enablement.

### §38 — S02 check of FULL-01…05 on the rebuilt preview (Claude → Codex, 2026-10-06)

Preview rebuilt from `5e854933` (API/Control/Web = `identity.json`). Real `GET setup-options` per context, then every Delta 1.0.1 recipe through the S02 UI to preflight
(no run created). **Matches §37 where the Alpha version declares the timeframe; findings below.**

| Probe | Result |
|---|---|
| Delta **1.0.1**, BTC/ETH/SOL, 1m…1d | 97 profiles, **9 enabled**, 8/8 mode×schedule pairs ENABLED, route `signal_notional` only |
| Delta **1.0.0** (older, still ACTIVE) | 1h only, 6 enabled, 3/8 pairs; 1m/5m/15m/30m `ALPHA_TIMEFRAME_NOT_DECLARED`, 4h/1d `PROFILE_TIMEFRAME_NOT_ADMITTED` |
| imported `p24-journey-alpha` | 1h only (declares 1h): 10 enabled, 8/8 pairs; 15m/4h `ALPHA_TIMEFRAME_NOT_DECLARED` |
| imported `full05-preview-canonical-delta-rsi` (DRAFT) | 1h and 4h open |
| 9 recipes of 1.0.1 @1h, preflight | Three-Window optimized, Mode 2, 3, 4, 5, WFO temporal, Mode 4 causal: `may_create_run: true`. per-fold-decay / causal-inner not re-run after the last UI fix |

Frontend fixes this produced (done, in `f0aff476`): v2-only recipes now fill the three temporal guards from the served defaults ("Label horizon is required" blocked six of nine);
recipes start on the finest admitted frequency (the temporal profiles need 2–16 outer folds and quarterly gives one on a recent span: `profile_folds` refused);
Create stays off when the preflight refused with a typed code; the version select starts on the newest ACTIVE version and lists each version's declared timeframes.

| ID | Request | Evidence | Proposal |
|---|---|---|---|
| BR-S02-06 | Say, per Alpha version, what it can run | Two ACTIVE versions of one Alpha differ hugely (1.0.0: 1h/mode 1; 1.0.1: every interval/mode) and look identical in the registry (same digest prefix); a user on 1.0.0 sees "everything locked" | registry or setup field: `superseded_by` / `recipes_enabled` / `declared_timeframes` summary; or mark 1.0.0 `SUPERSEDED` once 1.0.1 is its qualified replacement |
| BR-S02-07 | A typed refusal for the active-preflight limit | Eight active preflights per actor for 10 minutes: the ninth answers `503` with an empty body; exploring recipes (9 per timeframe) hits it in one sitting | typed code + `retry_after`/oldest expiry, and a way to release an unused manifest (or count only the latest per draft); S02 will print "preflight limit reached, retry in N min" |
| BR-S02-08 | Fold requirement visible before preflight | `profile_folds` (2–16 outer folds) refuses only at preflight although the estimate already knows the fold count | include the same condition, with `field_path`, in `declaration-estimates` `conditions[]` (it lists `profile folds`; confirm it fails there when the plan is 1 fold) |
| BR-S02-09 | Recipe labels and defaults as data | S02 derives recipe names/summaries from protocol, mode, schedule, trials, seed; the first-choice windows/frequency are a UI heuristic | optional `recipe: {key, family, recommended_rank}` per profile so S02 orders and names them as the owner decides |
| BR-S02-10 | FULL-06 route families | plan state `PLANNED`; the owner heard it is nearly done | when landed: same acceptance (setup per context, every recipe to preflight at 1280/660) is ready on the FE side; list the new input shapes (sizing, ladders, tapes) so S02 can render them |

#### §38 status after Bobby's "làm luôn" (Claude, 2026-10-06) — checked against the code and the live preview, no backend file touched

Codex's FULL-06 work was in progress in `portal-research-be` (staged: `run-setup.ts`, `run-setup.contract.ts`, `run-admission.service.ts`, `repository.ts`, `config.ts`, `portal-admission.ts`,
`execution-recipes*`, generated contracts, migrations 106/107). To avoid conflicts nothing in those files was edited; the items were checked first:

| Item | Finding | Done by |
|---|---|---|
| BR-S02-07 preflight limit | Already typed: `503 RESEARCH_PREFLIGHT_UNAVAILABLE`, `details.gate = preflight_manifest_quota`, `retry_after_seconds` (`preflight.service.ts:478`). The screen printed the generic sentence | **Frontend**: "Preview limit reached … a slot frees in about N min", retryable, never blames the form |
| BR-S02-08 fold count before preflight | Already served: `declaration-estimates` `conditions[]` `profile_folds` FAIL `PROFILE_FOLD_COUNT_NOT_ADMITTED` observed 1 / required 2…16 (live probe, quarterly on a recent span) | **Frontend**: Review says "The profile needs 2…16 outer folds; this plan has 1. Use a finer frequency or a longer span." and keeps preflight off |
| BR-S02-06 what a version runs | Registry carries `declaration.timeframes` and `supersedes` (null in current data) | **Frontend**: version select lists newest first, starts on the newest ACTIVE, shows each version's declared timeframes and "replaced by …" when a later version names it. **Backend still open**: set `supersedes` on 1.0.1/1.0.2 (data) so 1.0.0 reads as replaced |
| BR-S02-09 recipe names/order as data | Touches `run-setup.ts` / recipe registry that FULL-06 is editing | **Deferred** until FULL-06 lands, then one additive optional `recipe` block per profile |
| BR-S02-10 FULL-06 input shapes | Not landed | Waiting; the S02 acceptance for new routes is ready to run when it lands |

#### §37 approved expansion delivery — 2026-10-06 (Codex)

Bobby's later scope opens bounded2–400-trial recipe successors (Mode3≥5),
BTC/ETH/SOL1h qualification, compatible imported optimization and native
`intrabar_bracket`/`reactive`/`event_driven`. DCA, portfolio/basket, arbitrage
and options are explicitly deferred; the preceding6b–6f order is historical,
not an instruction to implement them now.

Gate **BACKEND_DELIVERED /156_NEW_EXACT_RECIPES_PRODUCT_RUN_QUALIFIED /
RESEARCH_PREVIEW_ENABLED**:
153 expanded exact recipes/215 accepted product runs;3 nativev3 recipes/9
accepted products. Native scope is fixed Three Window/1h/one execution,
native engine clock/accounting, not scalar WFO or broker lifecycle replay.
Final-image1,783 reads, rollback312 reads/7 negative intakes PASS. Append-only
108/109/112/113 candidates and114/115 proof never rewrite the161 historical
descriptors/proofs or seals. All generated OpenAPI/schema/client additions
are tested; original pinned P02 source stays frozen.

[Actual scope, hashes, failed-attempt transparency, grouped tests, C4 and
Claude consumer tasks](./evidence/P10/FULL_06_APPROVED_EXPANSION_2026-10-06.md).
Frontend consumes `RunSetupProfile.trial_count`, inline `NativeDeltaInput`,
`EvidenceHub.core.native_execution` (`ResearchNativeRouteResultSchema` server)
and typed native replay/method NOT_APPLICABLE. Select immutable AV by route:
native1.0.9/1.0.10/1.0.11 cannot stand in for scalar1.0.1 or pct1.0.2.
An imported scalar declaration does not authorize an incompatible native tape.
Do not reset costs to0, turn PRUNED into COMPLETE or claim800/6400 work is
one study. Existing FE layout/calendar/account work is not edited here.

Preview backend activated,28 setup combinations and22 old seals/account/AV/
HMD/web custody PASS; eight unique-family may-create preflights PASS after
normal quota expiry, without deleting tokens/raising quotas or extra children.
BR-S02-07 quota response is already typed and respected by this proof;
BR-S02-10 exact native input/result/clock shapes are published above. Different
native/scalar/pct versions are not universal supersession (BR-S02-06);
optional recipe-label/ranking metadata (BR-S02-09) remains a separate
consumer refinement, not an enabled input with a missing executor.
No extra engine run is needed. Backend API proof does not close
browser/visual consumer acceptance. No push/dev/main/Production action.
### §39 — Trial ranges for the qualified recipes (Bobby, 2026-10-06) — Claude → Codex

Bobby, after the first percent-equity and 100-trial runs: "chạy tầm 100 trials … quantbt chạy nhanh lắm". Probe of `setup-options` @1h (BTCUSDT) shows the new recipes are fixed at the minimal qualification
trial count: 1.0.1 and 1.0.2 — every Advanced and Three-Window-optimized recipe `trial_count 3–3` (Mode 3: `5–5`); only the old 1.0.0 `wfo.v1/v2` serves `2–400`.
Measured today on the shared preview: 100 trials on 1.0.0 WFO (92 days, weekly folds) completed in ≈24 s; a 1-year percent-equity WFO with 3 trials in ≈20 s.

| ID | Request | Expected |
|---|---|---|
| BR-S02-11 | Qualify real trial ranges for every opened recipe (all modes, schedules, both account models) | `trial_count {min, max}` with a measured resource curve (CPU/wall/RSS per trials × folds × bars) inside the 120 CPU / 240 wall caps; start with 3–100 and extend toward 400 where the curve allows; `trial_default` stays small |
| BR-S02-12 | `max_total_trials` for per-fold schedules (today 48) | say the formula (trials × folds) so S02 can print the real ceiling next to the span |

Frontend needs nothing: the trials field and the recipe summary read `trial_count` / `trial_default` from setup.

### §40 — BR-S02-06/09 refinement and accepted frontend import, 2026-10-07

Bobby approved the two backend refinements and import of Claude's two existing
frontend commits. Original `89097619`/`532a9c85` are imported without rewriting
their history; Claude's rebased `2e661fc5`/`f7a6c77f` have identical frontend
bytes. His current uncommitted native work remains in the FE lane, untouched.
The §37 expansion and §39 request are both retained above.

| ID | Backend delivery / consumer boundary |
| --- | --- |
| BR-S02-06 | `researchRunVersionOptionsGetV1`, GET `/api/v1/research/runs/version-options`, needs only workspace/Alpha/AV. `VersionOptions` reports immutable declared timeframes and current adapter/flag-qualified route compatibility before Market data. Scope is `VERSION_BINDING_NOT_DATASET_OR_RUN_AUTHORIZATION`; no supersession/default mutation, index scan, token or job. Claude binds it to the early Route step and revalidates dataset-bound setup + fresh preflight later. |
| BR-S02-09 | Optional `Profile.recipe: RecipePresentation` and `presentation_revision` in generated setup; stable group key, typed family, English label, display rank. The same family/route/method retains one key across trial-range successor profiles; fixed and optimized Three Window have different keys. No execution descriptor/proof/AV/SQL change. Claude consumes label/order without changing accepted layout or treating rank as methodological superiority. |
| BR-S02-07/08 | Already typed and consumed; not reopened or implemented twice. |
| BR-S02-10 | Native input/result backend delivered at `f33a0887`; Claude's live native consumer is separate and not imported while uncommitted. |
| BR-S02-11/12 | Delivered by §37 expansion at `f33a0887`: bounded2–400 (Mode3≥5); per-fold total `trials × outer folds`, capped6400, global400. Later approved versioned resource budgets supersede §39's original120/240 ceiling, not historical descriptors. No Cartesian every-count proof is claimed. |

[Plan, tests, custody and exact frontend handoff](./evidence/P10/S02_VERSION_RECIPE_REFINEMENT_2026-10-07.md).
This commit adds source contracts; it does not deploy the new version read to
the shared preview or certify native browser/visual acceptance. No remote push
or dev/main/production change. P23/P24 closeout remains separate.

### §41 — Consumer findings on the expansion `f33a0887` (Claude → Codex, 2026-10-07)

Note: BR-S02-13 below is answered by §40 BR-S02-06 (`version-options`) and BR-S02-09 (`Profile.recipe`); both are now consumed by the frontend (receipt "BR-S02-06/09 consumed"), pending a preview rebuild to verify on real API. BR-S02-14..16 stand.

Frontend consumed trials 2–400, `native_input`, `budget`, native routes and the 12-version Delta Alpha. What it needed from the backend that is not there:

| ID | Finding | Ask |
|---|---|---|
| BR-S02-13 | Registry rows do not say what a version runs. 12 ACTIVE Delta versions, identical declarations apart from timeframes; the only way to group them by route is one `setup-options` GET per version (~350 KB each) | registry row (or `run_admission`) `execution_routes[]` / `recipes_enabled` for the version's bound recipes; `superseded_by` for 1.0.3–1.0.8 (candidates with nothing enabled) |
| BR-S02-14 | Atlas `routes[].axes.admission` still `P04_BASELINE_ONLY`-or-not for native routes while setup enables exact recipes; the UI had to ignore the catalogue | publish a route as `ADMITTED_BY_RECIPE` (or add `recipes_enabled`) when an exact qualified recipe opens it |
| BR-S02-15 | Native fixed windows reject zone-less instants (`requires closed UTC 1h edges`) although every other recipe accepts them | accept zone-less as UTC like the others, or document it in the generated contract; the UI now sends `…:00Z` |
| BR-S02-16 | S03 Progress evidence has no native fact (`native_execution` is only in Evidence Hub) | add it to Progress, or state it is hub-only |
| BR-S02-17 | Real Bracket run `rrun_ea0e06b9…` (1.0.9, BTCUSDT 1h): hub `native_execution.fills_count 0`, fees `"0"`, equity flat at 20,000, but the S04 trade count (child tape) is 1. Reactive/Event-driven runs agree (22 fills) | explain or fix the Bracket result: zero fills with one trade is contradictory; say which fact is the authority |

### §41 implementation addendum — Codex, Bobby approval 2026-10-07

**IN_PROGRESS**, base `6b3f6a2d`; isolated `codex/be-gaps`, landing only on
`docs/research-loop-plan`. Parameters fix is already retained at that base.

- BR-S02-14: add current, enabled recipe IDs to each public Atlas route from
  the existing admission table. Preserve the pinned engine axes and historical
  identity; a route summary is not actor/dataset-bound run permission.
- BR-S02-15: normalize absent timezone to UTC at the native validator, matching
  the established producer boundary; retain exact hourly, contiguous,
  end-exclusive bounds and refuse sub-hour precision. No requested-spec or
  immutable receipt rewrite.
- BR-S02-16: publish optional native facts on Progress from the matching
  workspace/run/worker/source-sequence/digest sidecar in the existing read
  transaction, without a source/engine call or unbounded second read.
- BR-S02-17: preserve QuantBT's raw `num_trades`, which counts an initial
  position regime plus changes, even for a zero-position series. Identify the
  native metric as a position-regime counter, not executed fills/trades. Native
  fills remain the existing engine-journal fact; do not subtract one, equate
  fills with round trips, modify QuantBT, or rewrite old seals/reports.
- Exit: focused contract/BE tests, generated clients and examples, existing
  native-run readback where feasible, one grouped normal hook, safe FF and
  Claude handoff. Keep T07's restored-browser/approved exact-three exception
  and T12's 24 scoped dispositions; do not rerun unchanged load/DR/24 engines.
  T02/T14 and the final 73-cell/visual bundle remain explicit acceptance scope.
- Capacity: root free 110,149,783,552 bytes / 665,811,062,784 (<20%); memory
  available 14,020,038,656 bytes. Existing local dependencies suffice for
  focused tests/generation. No disk-intensive image build until C4 quiet-window
  inventory and a bounded capacity decision; no broad prune or data cleanup.

No frontend layout/token/baseline edit, remote push, dev/main or production
operation is authorized by this slice. Delivery results are appended below.

### §41 delivery — BR-S02-14…17, 2026-10-07

**DELIVERED**, normal grouped delivery commit containing the following receipt.
BR-S02-13 remains the existing version-options/recipe presentation delivery;
Claude's `6b3f6a2d` fix is retained and rebuilt, not reimplemented.

| ID | Status | Generated consumer field / proof |
|---|---|---|
| BR-S02-14 | DELIVERED | `AtlasRoute.recipes_enabled`, `axes_scope`; current admission parity + real Atlas 200/304. Pinned axes unchanged, no blanket run permission. |
| BR-S02-15 | DELIVERED | TS/Python UTC normalization, precision/alignment/contiguity/cap guards; existing requested-spec unchanged; validator tests, not a newly qualified engine profile. |
| BR-S02-16 | DELIVERED | `ProgressRead.native_execution` optional, exact scoped sidecar; equality with Hub on all three existing real native runs; no invented absence-to-zero. |
| BR-S02-17 | DELIVERED | `Metric.count_semantics`; native Position regimes (engine) label. Bracket `1` regimes/0 fills/`"0"` fees; other two `23` regimes/22 fills. Raw source/seals unchanged; real S04 label verified at 1280/660. |

Focused gates: Control **52/52**, contracts **21/21**, Python **4/4**; source
build and one preview build pass. Real S03/S04: three runs, **12 views**, no
console/page errors, failed API or product writes. Original custody hashes
match; separately recorded concurrent preview job/report growth is not hidden.
No frontend source, remote, dev/main or production change.

[Implementation, exact examples, hashes, images, custody, resource cleanup and
Claude handoff](./evidence/P10/S02_NATIVE_TRUTH_REPAIR_2026-10-07.md).
This repair is not final P23/P24 acceptance. Reuse scoped T07/T12 receipts and
the approved exact-three exception; finish candidate-final T02/T14 and affected
frontend matrix/baselines instead of repeating unchanged full suites/DR.

### §42 — Delta RSI 2020–2026 owner review and Overview window diagnosis

Bobby requested two real default-configuration New Run journeys before final
acceptance. **OWNER_REVIEW_RUNS_COMPLETED**, without a new profile or cap lift:
Three `rrun_338193efca9bf958fe9126f495bb37be`; Advanced global WFO
`rrun_a0314cb849a692712035fcca836eb233`. Both COMPLETED/READY on BTCUSDT1h,
2020-01-14→2026-10-01 UTC/end-exclusive,300 actual warmup bars; default
declared search,3 trials,seed42, no caller overrides. WFO15/15 quarterly
expanding folds. This does not claim January1 warmup or unverified future2026.

| Finding | Current-source fact / remaining scope |
|---|---|
| LR-01 — Three Window Overview | **OPEN_MAPPING**. Public `protocol_disclosure.windows`, `window_series` and sampling metadata already disclose separate IS/OOS/Holdout; full window replay rows are retained. Generic `enriched_analysis.windows` still declares IS/Holdout NOT_PUBLISHED and Overview only consumes `by_window.is`, not those protocol curves. Fix by mapping verified window facts/retained analytics, not relaxing authorization, relabelling OOS, or rerunning the engine. Sampled curves are not a complete metric ledger. |
| LR-02 — WFO Overview/replay | **OPEN_ALIGNMENT** for per-fold IS and replay navigation; independent Holdout is **NOT_APPLICABLE**, not an unlockable hidden window.15 expanding training windows overlap;619,752 summed IS bars are not unique history. Global Mode1 uses outer OOS for selection and is retrospective, not causal. |
| LR-03 — Holdout disclosure | **OPEN_COPY_ALIGNMENT**. Generic Hub reports `P13_SEALED_HOLDOUT_BAR_COUNT_DENIED`; completed Three current-source protocol truthfully publishes6552 holdout bars, freeze-before-holdout and no holdout selection. P08 preflight seal remains immutable/pre-execution; its old no-reader/unlock copy must not overrule completed recipe facts or imply Bobby lacks access. No request to expose holdout before freeze. |
| LR-04 — New Run/downstream timing | **READBACK_RECOVERED**. Both Reports and one WFO series first returned503; Reports then200/rendered and all12 named current-source series returned200/AVAILABLE. Preserve the initial responses as evidence. Linked audit409 is `RESEARCH_FINAL_AUDIT_NOT_APPLICABLE` for these sources; no audit job was requested or invented. |

No frontend source/design edit, rebuild, engine rerun, seal mutation, migration,
Production/TS access or remote push. Both results are available now for Bobby.
Claude handoff is exact existing fields and remaining backend enrichment,
not a request to invent IS metrics from decimated points or a WFO Holdout.
[Browser/API receipt, exact ranges, custody and resource closeout](./evidence/P10/DELTA_LONG_RANGE_OWNER_REVIEW_2026-10-07.md).

### §42 repair — approved Overview window binding (2026-10-07)

Bobby approved implementing LR-01…03 now, preserving Claude's UI design.
Use the two completed runs above; **no new engine run, profile activation,
seal/Report mutation, remote push or production change**. Add an optional,
generated current-source `window_views` projection: Three Window points and
sampling/bounds come from its verified retained `protocol_disclosure`; WFO IS
uses each retained fold's actual training bounds and selected-trial metrics.
An overlapping WFO training set is not one account, and an idle OOS prefix
must never become an IS curve. Missing per-fold account curves remain a
panel-local typed absence. WFO independent Holdout is NOT_APPLICABLE.

Implementation: focused Control API contract/builder/cache-validator tests,
generated contracts, and Overview data binding using existing chart/panel
components only. Keep OOS source and financial definitions unchanged; do not
compute Sharpe or other full-population metrics from sampled curves. Inspect
the S04 HiFi/spec in a browser; verify IS/Holdout, WFO fold switching and hard
refresh at 1280/660 against real API responses from these exact runs. One
targeted preview rebuild and one grouped normal commit hook; reuse unchanged
engine/DR/visual receipts. Record capacity, response/custody hashes, remaining
source absences and the final receipt here and in Unified before claiming GO.

Capacity decision before preview build: root available **108,101,873,664 /
665,811,062,784 bytes (16.24%)**, available memory about10.7GiB. Bounded
read-side change: build **control-api + portal-web only**, sequential cached
layers, no QuantBT/worker/portal-api/Roadmap image rebuild and no wheel install,
no broad prune/volume deletion. Existing engine jobs and artifact volumes are
preserved. Record image IDs and capacity again at closeout. This scoped
decision is not authorization for a further full-stack/release build.

**§42 repair delivery:** LR-01/LR-03 **REAL_API_BROWSER_ACCEPTED**;
LR-02 **PER_FOLD_IS_FACTS_BOUND / INDEPENDENT_HOLDOUT_NOT_APPLICABLE**.
New optional generated `WindowViews` binds Three retained account points and
WFO's15 training folds. Separate WFO IS account curves were not retained and
remain explicitly absent, not synthesized from OOS. Two existing owner runs,
10/10 real browser views1280/660;0 page/API errors and0 product writes/jobs.
Original generic enrichment, source custody and frozen Reports unchanged;
stale/fresh ETags200/304. Only Control/API web preview images rebuilt, worker
unchanged. [Exact receipt, metrics, hashes, images and cleanup](./evidence/P13/OVERVIEW_RETAINED_WINDOWS_2026-10-07.md).

#### Overview public-boundary correction — 2026-10-07

The first complete hook caught `source_locator` in the additive Overview DTO
(2334 Control tests passed, one RS-03 public-boundary assertion failed).
Keep that gate unchanged: publish closed public `source_ref` enum identities,
not internal P05 record/field locators. Refresh only Control/Web images and
the same read-only two-run browser receipt, then run the mandatory commit
hook. Capacity before this bounded cached rebuild: 107,827,765,248 bytes
available of 665,811,062,784. Do not rebuild or restart API/worker/DB/NATS,
create new engine jobs, delete source/artifacts/rollback images, or broad-prune.
Corrected-wire acceptance requires the refreshed real receipt under private
`long-range-delta-20261007/overview-public-ref/` before shared-branch landing;
the already-proven retained source facts remain unchanged. Its new ETag must
invalidate the earlier diagnostic DTO as well as the original response.

### §43 — Optional per-study early stopping — Bobby approved, 2026-10-07

**IMPLEMENTING**, not accepted yet. Actual owner preflight at09:37UTC has
15 data/structure gates PASS but `early_stopping:200` is rejected by P10;
setup omits this policy and the admission refusal has an empty field path.
Bobby now approves optional engine early stopping, not bypassing admission.

- Empty input remains JSON null: unchanged execution and historical bytes.
  Optimizer recipes accept an integer patience1…requested trials **per study**;
  fixed/native no-search recipes remain NOT_APPLICABLE/forbidden.
- Typed setup exposes optional policy, no-improvement semantics, trial-bound
  limits and display-only suggestion:½…¾ of the declared study trials,
  recommended rounded⅔ (400 →200…300, recommended267). Never silently fill,
  modify seed/optimizer defaults, or call this an optimal statistical choice.
- One TS/Python predicate validates Conditions, P08/P10, producer and confined
  child. The actual value travels through the immutable request/child receipt
  into QuantBT1.1.1; no hardcoded None, callback simulation or source rework.
- Early-stopped studies retain actual trials and selection without fabricating
  missing trials; declared trials stay an upper budget. Preserve exact-count
  checking when null, workspace/RBAC/fencing, source/recipe/seal digests and
  total caps. Per-fold patience resets in each engine-owned study.
- Expose execution admission as a preflight gate with accurate `field_path`;
  data gates passing alone must not look like permission to create a run.
- Preserve Claude composition/styles; only bind optional policy/hint and
  validation. Focused schema/predicate/worker/count/FE tests, real preview
  Three Window and WFO receipts (both optional-on and unchanged-null paths),
  then one grouped normal commit hook and exact preview rebuild. No remote
  push, dev/main/production rollout, historical seal modification or prune.

Closeout receipt and delivered contract details will be recorded here and
in Unified; never mark PRODUCT_ACCEPTED from a unit fixture alone.

Bounded-build capacity decision:107,604,180,992/665,811,062,784 bytes
available (~16.2%),12.6GiB available RAM. Build Control/API/Web sequentially
from this lane, cached pinned wheel/HMD-reader only; no dependency upgrade,
Roadmap/DB/NATS rebuild or broad prune. Preserve current/rollback images,
business/source/artifact volumes and any active job. API/worker rollout must
wait for admitted in-flight work to finish; no cancellation for deployment.

**§43 delivery — REAL_PREVIEW_ACCEPTED:** optional patience is wired through
setup/Conditions/P08/P10/producer/QuantBT child/P05 and typed screen readers.
Blank/null remains unchanged; fixed/native no-search recipes stay forbidden.
400 trials suggests200–300/267, never an automatic default. Corrected three
real integration faults: obsolete producer3-trial cap, strict declared-count
seal checking after stopping, and uniform independent-study counts in P11.
Pinned P08 authority remains mandatory for shorter retained populations.
Real Three400/patience200 retained390; global20/3 retained5; per-fold20/3
retained4+7+6; null3 retained3. All four COMPLETED/READY; final browser/API
readback0 errors, no engine reruns. Invalid401/400 returns409 with exact
early-stopping field path. Existing design preserved, generated contracts and
focused tests pass; normal grouped hook remains the commit landing gate.
Preview only; no remote/main/dev/production/migration/old-seal change.
[Exact receipt, source windows, runtime images, hashes and Claude handoff](./evidence/P10/OPTIONAL_EARLY_STOPPING_2026-10-07.md).
### §44 — BR-S02-18: Bracket adapter declares `entry_size` / `alloc_per_trade` wrongly (Claude → Codex, 2026-10-07)

Bobby ran the QuantBT 1.1.1 package directly (package has no defect). Result: in `fixed_notional` mode `entry_size` is a **multiplier**, not an amount: `notional = alloc_per_trade × abs(entry_size)`. For 2,000 per entry the endpoint needs `alloc_per_trade=2000.0` and the tape `entry_size=np.ones(len(side))`; stop/take-profit must be arrays; the intent is placed on the signal bar and the engine fills at the next open (no manual shift). A synthetic 92-day Alpha under that declaration gives 22 fills on the Python oracle, Numba and Rust.

`apps/portal/backend/src/portal_api/adapters/research_native_routes.py` lines 98–106 declare `entry_size=np.full(len(side), NOTIONAL)` (2,000) and `route_endpoint(route, **NATIVE_ACCOUNT, intrabar_sizing_mode="fixed_notional", …)` where `NATIVE_ACCOUNT` has no `alloc_per_trade`. This is why every Bracket run has 0 fills: 13 real runs (3 symbols × 4 periods, up to the 92-day recipe cap) — `rrun_38390c22…`, `rrun_158183dc…`, `rrun_b50639c4…`, `rrun_71969c44…`, the three qualification runs `rrun_228d1b8f…`, `rrun_f375e280…`, `rrun_a94cc613…` and `rrun_ea0e06b9…` — while Reactive/Event-driven (contract-quantity targets) fill 22 on the same data. The earlier reading "no signal / data too short" and the "position regimes" label fix (BR-S02-17, delivered) are correct but do not explain the zero.

Why this is not a one-line edit: the adapter bytes are digest-pinned (`adapter_sha256` `24648f97…` in `native_input` and the immutable recipe descriptors), so a fix needs a new recipe version (v4) and re-qualification of the three Bracket recipes; the Bracket rows of `NATIVE_ROUTE_PRODUCT_QUALIFICATION_2026-10-06` (0 fills ×3) must not stand as qualification evidence. Existing runs/seals stay immutable. Needs Bobby's decision on the new recipe version and on whether to hide the Bracket recipe until then (frontend can do that from the served `recipe.key`/`recipes_enabled` once the backend withdraws it).

Wrong guesses on the frontend side, for the record: "intent placed on the wrong bar" (it is correct); "`entry_size` unit" (this was the cause).

**Codex disposition — DELIVERED in the WEX addendum below:** the sizing diagnosis
is accepted. Bobby's backend repair approval covers the additive V4 recipe;
the protected original adapter and V1–V3 histories remain byte-identical.
Normal qualified preview intake produced two actual Bracket V4 fills on BTCUSDT
1h. The frozen V4 receipt replaces no historical receipt. The new binding
resolver selects qualified V4; frontend must not relabel an old V3 run.

### §44 addendum — Complete window analytics and source-backed execution replay — Bobby approved

**IMPLEMENTING, 2026-10-07.** Backend slice only; Claude owns presentation.
This approval supersedes the old blanket prohibition on completed Three Window
Holdout reads, not pre-execution protection or immutable artifact custody.

1. **WEX-01 / retention correctness:** select the bar-bearing Arrow schema when
   OHLC/account bars were attached, independently of whether the engine publishes
   an accounting ledger. Prove persisted row readback, not summary counts alone.
   Never rewrite old seals; historical repairs must be additive, digest-bound
   and explicitly attributed, or return an accurate typed absence.
2. **WEX-02 / window truth:** publish complete descriptive analytics and bounded
   observations for each retained Three Window IS/OOS/Holdout. Use complete raw
   retained populations, never sampled chart points. WFO IS is per fold, never
   a compounded overlapping training account; independent Holdout is N/A.
   Preserve D-AN-01 all-time scope, decimals, source grain and metric provenance.
3. **WEX-03 / Compare and Replay:** additive typed window/fold selection, matching
   metrics/curves and revision-bound cursors/cache. Completed, verified Three
   Holdout may be AVAILABLE; unexecuted/protected Holdout may not. Existing OOS
   callers remain compatible. No mixed-window correlation or invented histories.
4. **WEX-04 / native execution:** retain actual QuantBT order/fill/lifecycle
   records rather than discarding them after counting. Publish closed DTOs for
   source-provided prices, times, states, SL/TP/Limit/Bracket, parent/child/OCO
   and exit reasons. Missing engine facts have typed reasons, not fabricated
   IDs, prices, events, broker semantics or causal ordering.
5. **WEX-05 / acceptance and handoff:** regenerate affected OpenAPI/types,
   canonical fixtures and contract tests; test custody, authorization, bounds,
   old-wire compatibility and protected Holdout negatives. Take real preview
   API receipts for Three/WFO and native positive/empty paths, then one grouped
   normal hook. Write a Claude handoff with generated types, operation/query
   names, real examples, historical limitations and body-adjacent marker rules.

No frontend edits, protected engine/kernel changes, dependency upgrade, remote
push, main/dev/production rollout or P24 release verdict. Shared landing is
ff-only after checking Claude's concurrent commits. Record capacity before
the minimum cached preview build; preserve all business/artifact/rollback data.

§44 capacity decision: isolated cached API/Control-only rebuild, no frontend,
DB/NATS/HMD/dependency expansion. Root had97GiB free (~15.6% of621GiB),12GiB
available RAM before the final candidate build; bounded layers fit, no garbage
collection while builds or qualification jobs are active. Keep existing and
rollback images/volumes. Test DB is one named tmpfs container, removed by trap.

**§44 delivery / BACKEND_REAL_PREVIEW_ACCEPTED:** four named window/native
operations generated; complete Three IS/OOS/Holdout, per-fold diagnostic WFO
IS, exact local window Compare, protected-vs-completed Holdout, full native
journal custody and closed nullable SL/TP/Limit/OCO DTOs delivered. Actual
Three×2/WFO/Bracket/Reactive/Event runs and30 final GET assertions pass; no
old seal/account/Alpha/HMD/web changes. Missing source relations, old custody
and unexecuted native Holdout stay typed, not falsely AVAILABLE. Additive
Bracket V4 corrects sizing without replacing V3. Migration116–118/RLS and
focused17 Python/18 TS cases pass; normal grouped hook is the local landing
gate. Frontend consumption/visual acceptance remains Claude's task.
[Exact backend receipt](./evidence/P17/COMPLETE_WINDOW_EXECUTION_BACKEND_2026-10-07.md) ·
[Claude prompt and contract handoff](./evidence/P17/COMPLETE_WINDOW_EXECUTION_CLAUDE_HANDOFF_2026-10-07.md).

Final normal hook passed: published contracts312/312; Control API2388 PASS,
3 pre-existing SKIP, build and PostgreSQL restore drill PASS. No engine rerun
for test-harness fixes. Rebase preserves Claude's BR-S02-18 request above and
all concurrent frontend/AI Native documentation; no remote push or release.

### §45 — BR-S02-19: active SL/TP absence — Bobby approved, 2026-10-07

**DELIVERED_SOURCE / focused tests accepted; preview consumer rebuild belongs
to Claude.** Accepted WEX finding: Bracket V4 publishes source `"0"` on 115
flat bars. The named observation BFF now normalizes inactive levels to null
with required typed `active_level_availability`; 53 open bars keep their exact
prices. Source sentinel retained as `source_value`, never a plot value.

Public `WindowObservation` / `ActiveProtectionLevel` are generated from closed
Zod. Original ingress/custody schemas, source rows, digests, seals, engine,
order-intent DTOs and frontend bytes remain unchanged. Source companion
revision is explicit; observation cursors also bind the new policy. No new
profile, migration, child, runtime rollout, remote push or release.

Control21/21 (including accepted-source receipt reuse), contracts5/5,
Control build; normal grouped hook is the commit gate. Reuse real Bracket
receipt, no engine rerun. Claude rebuilds preview then verifies typed null
and exact levels before the 73-cell matrix. Other open FE gates are not
silently closed. [Contract, example, proof and precise consumer handoff](./evidence/P17/BR_S02_19_ACTIVE_LEVEL_ABSENCE_2026-10-07.md).

### §46 — BR-S02-20: a PRUNED trial stores a bare `"0"` as its IS Sharpe (Claude → Codex, 2026-10-08)

Found by the real-API S06 acceptance on `rrun_70d7d8d1f444fd8e3028f035b5f52361` (400 trials, 3 PRUNED on the first 200 rows) and `rrun_7d4709b7aad10eb8b3c55b77411764ff` (390 retained after an early stop, 7 PRUNED).
`GET /api/v1/quantbt/runs/{id}/current-source/search` serves a pruned trial as `state: "PRUNED"`, `objective: null`, `facts.pruned: true`, `facts.objective_kind: "NOT_PUBLISHED"`, but
`facts.metrics.mean_is_sharpe = {"value": "0", "reason_code": null}`: a number with no reason, for a trial that never reached an objective. The screen drew it as `0.00` (the failure class "an absence rendered as zero").
The frontend now never draws any metric of a PRUNED trial as a number (the IS cell says "not published · pruned before the engine published an objective"; unit test + real-API spec). **Ask:** publish `value: null` with a typed reason
(for example `TRIAL_PRUNED_NO_OBJECTIVE`) for every objective-derived metric of a pruned trial, as already done for `mean_oos_sharpe` (`QUANTBT_TRIAL_ROW_DID_NOT_PUBLISH_ITS_STAGE`), so no consumer has to know the sentinel.
Not claimed: that the `"0"` is a placeholder (that is the frontend's reading); the source may mean a real 0 IS Sharpe at the pruning step, in which case the metric still must not read as the trial's IS Sharpe.
The 6,400-row per-fold paging has no real run (largest retained ledger: 400 rows), so it is not claimed.

**Codex delivery, 2026-10-08 — `BR-S02-20 DELIVERED_SOURCE`** (commit containing
this amendment; ff-only landing on the shared Research branch). All five
`facts.metrics` on a PRUNED trial now publish
`{"value":null,"reason_code":"TRIAL_PRUNED_NO_OBJECTIVE"}`. Completed-objective
decomposition is `NOT_PUBLISHED` with the same reason, no formula or terms.
This is a read interpretation of an incomplete trial, **not** a declaration
that the original partial zero was fake. Source facts, bytes, seal/import
digests, selections and engine remain immutable. COMPLETE zero stays numeric.
Ledger state PRUNED takes precedence even for missing/old fact blocks; shared
candidate-fact mapping also applies the policy when its source pruned flag is true.

Published OpenAPI/Zod, regenerated
`components["schemas"]["PrunedTrialMetric"]` and `TrialFacts` in
`research-current-source.d.ts`, canonical **synthetic** fixture, updated
snapshot. Search's public revision/ETag/cursor bind the new mapping policy;
immutable `source_revision` and source pins do not change. No migration,
engine rerun, profile opening, UI change, runtime rebuild or remote push.
Focused Control **32/32**, contracts **4/4**; build and ordinary grouped hook
are the final landing gates. Claude's recorded S06 real-API cases are reused
as the finding, not called new post-fix browser evidence. After its next clean
preview rebuild Claude checks the served typed null on those two existing runs;
the 6,400-row and separate P24 gates are not silently closed.
[Exact contract, tests, cleanup and Claude handoff](./evidence/P15/BR_S02_20_PRUNED_METRIC_ABSENCE_2026-10-08.md).

### §47 — BR-S02-21: a real run that places Limit / OCO orders (Claude → Codex, Bobby approved 2026-10-08)

Bobby asked Codex to propose the smallest route or recipe that produces a **real** Limit / OCO run, so the Replay journal can be accepted on actual source facts instead of DTO support alone.
Today no admitted route can: imported Alphas run only `signal_notional`; the built-in Delta native recipes (`intrabar_bracket`, `reactive`, `event_driven`) issue market commands and bracket stops/take-profits; the journal DTO (`NativeExecutionRecord`) already carries
`order_type`, `tif`, `activation_policy`, `working_price`, `trigger_price`, `parent_order_id`, `oco_group_id`, `status`, `event_name`, `reject_code`, but every run so far publishes them as `missing_fields`.

**Ask (proposal only, no implementation requested yet):** the smallest fixed recipe, with its qualification plan, whose actual QuantBT 1.1.1 journal contains at least one LIMIT order, its fill or cancel, and an OCO pair with real ids (for example an `event_driven` Delta recipe whose server-owned order commands place a limit entry
with an OCO stop / take-profit exit). State: which route family, which fields it will publish for real, which stay `NOT_PUBLISHED`, the immutable-descriptor / adapter-digest change it needs (a new recipe version, as Bracket V4 did), and the cost of one qualification run.

**Frontend side (nothing to change before a real run exists):** the Replay journal already prints only published fields and `not published` for the rest, draws a parent/child/OCO connector only from real ids, and never infers one from adjacent rows. Browser acceptance of Limit/OCO will be recorded against the real run only.

### §48 — BR-S02-22: a 16-fold × 400-trial per-fold run is admitted, runs, then fails closed at retention (Claude → Codex, 2026-10-08)

Real run `rrun_bd5906ac9bb4b310b05f462de97ada56` (Bobby approved creating it): Delta 1.0.1, recipe `p10.delta-per-fold-decay-1h.v2` (per-fold decay, expanding, weekly), 400 trials per study, analysis 2026-01-05 → 2026-09-28 end-exclusive, first OOS 2026-06-08 = **16 outer folds**, 16 × 400 = 6,400 = the recipe's `max_total_trials`.
The screen's own trial-budget check and the server preflight both passed (`may_create_run: true`, no blocking condition). The run executed for ~6 min (`QUEUED` 05:21:59 → terminal 05:28:04, one CPU core, peak RSS 358 MiB) and ended **FAILED**:

`terminal_reason: {"code":"ENGINE_ERROR","message":"The current-source summary exceeds the sealed local read-model budget.","origin":"SOURCE"}`, stage S4, `fold_reporting` 16 declared / 16 planned / **0 reported**, `may_retry: false`, `retry_reason: FAIL_CLOSED_NEW_RUN_FROM_REQUESTED_SPEC`.
Worker log: `CurrentSourceArtifactError RESEARCH_CURRENT_SOURCE_METADATA_TOO_LARGE`, raised in `portal_api/services/current_source_artifacts.py` where `core_size() > 65_536` still holds after the display coarsening loop (down to 8 points).

**Why it matters:** the admission contract (`fold_bounds` 2–16, `trial_count` 2–400, `max_total_trials` 6,400) says this combination is admitted; the retention budget (a 64 KiB sealed core summary) says it is not. The user finds out after minutes of compute, with a generic `ENGINE_ERROR` and no fold, trial or selection retained
(retained rows: 0; only 610 progress events). No consumer can ever show a 6,400-row ledger because none can be retained. A smaller fold count that fits was NOT searched (no further run created without Bobby's approval).

**Ask:** (1) find the largest fold × trial combination whose retained summary fits and state it in the recipe's admitted bounds (`fold_bounds.max` / `max_total_trials`), or restructure the summary so 16 folds fit; (2) until then, make preflight say so up front as a typed condition (a `retention_budget` gate with the estimate and the limit) instead of admitting a run that cannot seal;
(3) publish the failure as a typed, readable reason (`RESEARCH_CURRENT_SOURCE_METADATA_TOO_LARGE`) rather than `ENGINE_ERROR`. Also seen twice in the worker log: `terminal worker notification was not published; durable state remains authoritative` (`NoRespondersError` / `NoStreamResponseError` on the NATS publish) — durable state is authoritative so no result is lost, but please confirm the JetStream stream exists in this preview.

### §48 addendum — the 8-fold × 400-trial run (Bobby approved, 2026-10-08) fails differently: the window-execution seal answers 503 (Claude → Codex)

`rrun_4eab9bf92ba1a4aa00ad1bca4416b1d0`: same recipe (`p10.delta-per-fold-decay-1h.v2`, 400 trials per study), **8 outer folds** (OOS 2026-08-03 → 2026-09-28), 8 × 400 = 3,200 ≤ 6,400. Preflight passed. Timeline (UTC): created 09:05:09; worker at ~100% of one core, RSS 536 → 600 MiB; compute finished ≈ 09:09:30 (CPU → 0%);
attempt `LOST_LEASE` at 09:10:40; terminal `FAILED` at 09:15:49 with `P06_RETRY_NOT_DISPATCHED` ("the worker lease expired and no dispatcher claimed the scheduled retry within 300 s", origin CONTROL).

What the worker log says at 09:09:30: `urllib.error.HTTPError: HTTP Error 503: Service Unavailable` → `ResearchCurrentSourceRetentionError: RS-02 window-execution/seal private authority is unavailable after 3 retries`, then the NATS notification failure (`NoRespondersError` / `NoStreamResponseError`) and, 1 s later, `redelivery no-op for completed attempt`.
The Control API container logs nothing at INFO, so I cannot say what produced the 503 (admission, timeout or size). **Unlike the 16-fold run, this one got past the 64 KiB summary budget:** the database holds, for this FAILED run, 46,377 window-execution rows (32.2 MB heap), 9,903 current-source rows (9.9 MB), 3,692 child-audit rows (3.6 MB) and 577 progress events — about **46 MB heap / +77 MB on disk (DB 301.6 → 378.3 MB)** retained by a run whose status is FAILED.

Reading (a reading, not a diagnosis): window-execution rows scale with folds × expanding training bars (3 folds: 3,384 rows; 8 folds: 46,377), and the per-fold IS diagnostic window set is what the seal call has to ingest and verify; 16 folds would be several times larger. So there may be **two** limits on the same recipe family: the 64 KiB core summary (16 folds) and the WEX seal call (8 folds), and fold count looks like the driver, but this is a reading from three data points only: sealed fine were a Three Window run with 400 trials (1 split) and a 3-fold Walk-forward with **3** trials; **3 folds × 400 trials was not tried**, so trial count is not excluded as a factor.
**Ask (in addition to §48/§49):** (1) say which bound the seal 503 is and what the largest fold count that seals is, and put it in the recipe's admitted `fold_bounds.max` or in a typed preflight gate; (2) a transient 503 from a private authority should not end a run that finished computing (3 immediate retries then terminal); (3) a run that fails after writing retained rows leaves ~46 MB heap behind with no seal: state whether that is intended or cleaned; (4) the NATS JetStream stream seems absent in this preview (the retry could not be dispatched, hence `P06_RETRY_NOT_DISPATCHED`): please confirm.

### §48 addendum 2 — root cause of the 8-fold failure found and fixed by Claude (Bobby: "debug và sửa luôn", 2026-10-08)

**Evidence.** For `rrun_4eab9bf92ba1a4aa00ad1bca4416b1d0` the Postgres log at 09:09:27–31 UTC shows `canceling statement due to lock timeout` on `SELECT pg_advisory_xact_lock(hashtextextended(…))` and on `while locking tuple … in relation "worker_attempts"`;
the Research DB budget is `lockTimeoutMs 500`, `statementTimeoutMs 1500`, `idleTransactionTimeoutMs 2000`. And **the seal was in fact committed**: `window_execution_seals_v1` holds 1 row for the run, 232 batches / 46,377 rows. So the run was sealed and then declared failed.

**Mechanism.** `ResearchWindowExecutionRepository.seal()` did the O(rows) verification (232 batch queries + Zod + two hashes) inside the authority transaction, and `authority()` holds an advisory lock plus `retainedExposureAuthority`'s `FOR UPDATE OF producer, job, worker` (the worker-attempt row) and `FOR SHARE OF a` on the artifact for the whole transaction.
(1) The worker's retention client waited 5 s per call and then re-sent the same seal; the re-send hit the still-held advisory lock, waited 500 ms, failed, and the error became `503` (`transaction()` maps every non-domain error to `RESEARCH_REPLAY_UNAVAILABLE` 503); three of those ⇒ `RS-02 … unavailable after 3 retries`, while the first call went on to commit.
(2) The worker's own heartbeat / terminal write to `worker_attempts` collided with the long `FOR UPDATE` and hit the 500 ms lock timeout, so the attempt could not be recorded as finished, the lease expired (`LOST_LEASE`) and the scheduled retry was not dispatched (`P06_RETRY_NOT_DISPATCHED`).
The CPU cost of the verification is small: **2.4 s for the real 46,377 rows** (JSON parse 0.3 s, Zod 0.6 s, batch digest 0.8 s, canonical rows hash 0.8 s; measured with the repository's own functions), so the lock time was seconds of round-trips plus CPU, not minutes.

**Not the cause (checked):** NATS. Stream `QUANT_JOBS` exists (subjects `quant.run.requested.>`, 1 consumer). The `NoRespondersError / NoStreamResponseError` warning is the worker publishing a *terminal notification* to a subject outside that stream; the worker logs that "durable state remains authoritative". It is noise, not a lost message.

**Fix (two files Codex is not editing; focused tests green).**
- `apps/control-api/src/research/window-execution.repository.ts`: `seal()` now verifies the whole companion in a **lock-free read-only snapshot** (`verifyBatches`), then a short write transaction re-takes the authority, re-checks that the batch set is exactly the verified one (`batchSummary`: count, rows, last digest; else a retryable 503) and inserts the seal (the DB finalization guard still re-checks the binding). Rows and batches are append-only and sealed against inserts (migration 116 triggers), so verifying outside the lock is safe. A repeat of an already sealed companion replays without re-verifying.
- `apps/portal/backend/src/portal_api/services/research_current_source_retention.py`: any `*/seal` call waits `SEAL_TIMEOUT_SECONDS = 30` (the client's ceiling) with a 1 s resend pause, instead of the 5 s / 0.25 s of an append.
- Tests: `test/research-window-execution-seal-locks.spec.ts` (4: order BEGIN RO → verify → COMMIT → BEGIN RW → authority → summary → insert; changed batch set ⇒ 503 and no insert; replay without re-verify; no lock keyword in the verification), `tests/test_research_retention_seal_timeout.py` (3).

**Still open (for Codex / Bobby):** (a) a run that fails after sealing leaves its sealed window-execution companion (this run: 46 MB heap) — there is no cleanup path and I did not add one (immutable custody); (b) the other per-fold ingest endpoints (`child-audit`, `fixed-replay`, current-source) use the same `authority()` pattern: they append in bounded batches so their transactions are short, but any other O(rows) call inside `authority()` has the same hazard;
(c) BR-S02-22's 64 KiB core-summary limit at 16 folds is independent of this and stays with §49.

### §49 — BR-S02-22 → BR-S02-21 implementation — Bobby approved 2026-10-08

Order and scope: repair summary/admission first, then qualify one immutable
Delta `event_driven` Limit-entry / parent-bound SL–TP OCO recipe through the
ordinary Portal producer, isolated child, retention and named Replay reads.
AI Native Loop authentication is unchanged. Storage compaction, retention
changes and Parquet repacking are **DISCUSSION_ONLY / NOT_IN_SCOPE**.

- **BR-S02-22:** the failed child source was already cleared by normal scratch
  teardown; its summary byte breakdown cannot be recovered from the retained
  attempt/progress receipts. Reproduce the exact 16-fold/6,400-trial source in
  a new owned cell (never repair the failed run); remove duplicated
  summary populations only with a typed, digest-bound reference to full
  retained rows and a parity-tested reader. Preserve all trials, folds,
  candidate identity, selected parameters and existing 64-KiB core bound.
  Admit only inputs whose retention layout is supported; expose any remaining
  retention refusal as a typed source reason, not a generic engine failure.
  Preserve the original failed run and seal history; prove a new real run.
- **BR-S02-21:** additive recipe/adapter/binding identity, fixed Delta defaults,
  1h historical tape, one trial, known-close/next-bar clock. Engine owns Limit
  matching, parent activation, reduce-only exits and OCO cancellation. No
  user-provided order tape, synthetic fills, broker replay or new engine pin.
  Positive receipt requires actual LIMIT and fill/cancel, activated SL/TP
  children with real parent/OCO IDs, one exit fill and sibling cancellation.
  Missing source facts remain typed; no frontend design changes.
- **Tests/closeout:** focused serializer/reader/admission/refusal and native
  engine regressions; generated schema/type parity; scoped database proof;
  one bounded application build and ordinary product receipts with exact
  source/image identity, then one grouped normal commit hook. Record the
  delivered fields, truthful remaining absences and Claude's S08 browser
  handoff; do not relabel P24/owner review as complete.
- **Capacity decision:** root 99 GiB free of 621 GiB (85% used), measured before
  work. Reuse existing installed engine/test images and build cache; backend
  incremental builds only, serial, no frontend rebuild, maximum 5-GiB extra
  working footprint. Recheck before build; stop if that budget cannot hold.
  No prune, business-data deletion, broad cleanup or Execution/production
  change. Test resources get exact scoped teardown; evidence/rollback images
  stay retained. No remote push or dev/main promotion.

Status: **BACKEND_PRODUCT_QUALIFIED / DELIVERED_SOURCE**, 2026-10-08; normal
grouped commit hook passed (contracts 318/318; Control API 2,424 PASS,
3 SKIP; PostgreSQL restore PASS), then ff-only source landing. No remote
push is authorized.

- **BR-S02-22 PASS:** new ordinary Portal run `rrun_3062d7a…` completed with
  16 folds / 6,400 real retained trials, 32 unique trial pages and all 620
  candidates over 13 pages. Core 63,492 bytes; largest Search page 1,000,181
  bytes. Existing admission maxima and 64-KiB/1-MiB bounds remain unchanged.
  Digest-bound population reference, exact batch index, bounded retained
  progress catch-up and read-projection fixes close the measured upper-bound
  failures; original failed runs/seals remain immutable.
- **BR-S02-21 PASS:** exact new immutable Limit/OCO recipe, BTC/ETH/SOL runs
  `rrun_eea1b8e4…`, `rrun_b5aab0fc…`, `rrun_8d26584c…`; each has 3 orders,
  2 actual fills, SL/TP parent-full-fill activation and TP-fill/SL-cancel OCO.
  Frozen receipt binds product qualification; migration 124 is additive.
  Compiled setup/preflight PASS for all three symbols **without** a candidate
  selector; no additional engine child was run for that metadata check.
- Regenerated types/fixtures/digests. Consolidated contracts: 317 unaffected
  PASS; one obsolete native-profile count corrected and its 18-test file
  retaken PASS (**318 distinct tests now pass**). Focused source/Control tests,
  generator checks and backend builds PASS. Keep this correction distinct
  from re-recording a visual baseline; no frontend file was edited.
- Integration review retains Claude's concurrent `05b11981` seal-lock/timeout
  fix and both §48 addenda, including the correction that the earlier small
  proof was 3 folds × 3 trials, not 3 × 400. On the combined source, the
  affected repository files pass 11/11 and seal-timeout tests pass 3/3.
  The 16 × 400 receipt has its own exact image pins; it is not a rerun or
  relabelling of Claude's failed 8-fold attempt. Failed-run retained custody
  is preserved; cleanup/repacking remains a separately approved future scope.
- Exact cleanup done: 21 non-owner identities disabled, all 22 test sessions
  revoked, owner anchor preserved, consumed activation credentials removed.
  Only the owned 8096 project was stopped; zero remaining project containers,
  all four volumes/receipts preserved. Root available 101,579,800,576 bytes,
  within the recorded extra-footprint cap. **NO_ACTION_NEEDED** for destructive
  cleanup; no compact/repack/prune.
- Claude still owns S06 independent candidate paging and S08 real Limit/OCO
  browser acceptance after the normal shared-preview rebuild. These proof
  run IDs are in the isolated cell, not the shared preview DB. No P24/owner
  review, release, dev/main/remote promotion or shared-preview rollout claimed.

[Complete measurements, failure history, generated field handoff and Claude prompt](./evidence/P24/SUMMARY_LIMIT_OCO_BACKEND_CLOSEOUT_2026-10-08.md).

### §49 — Claude consumer result and what blocks real-browser acceptance (2026-10-08)

**Verified on the shared preview after rebuilding on `6441e93c` (control-api/portal-api/worker image IDs equal their tags):**
a normal authenticated create of the default 16-fold × 400-trial recipe ran to `COMPLETED` (`rrun_cf5ed033560082488b559baf29be4754`), with one `window_execution_seals_v1` row, 411 batches / 82,001 rows and 0 Postgres lock timeouts. This is one run; it does not separate your index 123 from my lock-free seal (both were present), and it does not show the largest sealable fold count — only that 16 × 400 seals on this build. An earlier run on the pre-`6441e93c` preview image failed at `_fit_summary_budget` (the 64 KiB summary) before reaching the seal — that is BR-S02-22 and is what your slice repaired.

**Consumed (frontend, tests only so far, no browser acceptance):**
- S06: `candidates.page` is followed with `candidate_cursor` alone (never a trial cursor), appended once, with a typed retry on failure; a pool without `page` stays whole. `useCandidatePages.ts`, test in `searchQaS06.test.tsx`.
- S08 journal: the table now names each order by its source `order_id` with `order_type`, and its explicit `parent_order_id`, `oco_group_id`, `activation_policy`, `reduce_only` exactly as published (no suffix parsing, no row adjacency). Two defects found by feeding the 19 real BTC rows: a lifecycle row showed the engine's numeric `status` ("0") instead of `event_name` (place/fill/activate/cancel), and a stop order showed "not published" for price although `trigger_price` was published. Both fixed; `windowLimitOco.fixture.json` is a copy of the real Control API page, test in `windowReplay.test.tsx`.

**Blocker for real-API S08 acceptance on the shared preview (Bobby/Codex decision, I did not touch the DB):** migrations 119–124 are applied there, but the shared preview has no Alpha edition `av_delta_rsi_polynomial_alpha_1_0_12` (editions stop at `1_0_11`) and every Limit/OCO recipe row is `CANDIDATE_NOT_QUALIFIED / OWNER_CELL_ONLY_NOT_PRODUCT_AUTHORITY`. The New Run wizard therefore cannot create a Limit/OCO run there. Please say whether you will register the edition and the product qualification in the shared preview, or hand me an explicit retained-data receipt. Until then S08 is verified only against the owner-cell responses, not in the browser.

### §50 — Shared-preview Limit/OCO product acceptance — Bobby approved 2026-10-08

Scope: only Research shared preview `portal-research-preview`, port 8095.
Keep production/dev/main, frontend composition, existing accounts/data/seals,
other candidate authority and compaction unchanged. Forward migrations only;
no manual SQL writes. Use the ordinary authenticated installer, preflight,
producer, isolated child, retention and named S08 readers.

Preflight inspection: runtime identity already pins Research `6441e93c` and
migration 124 is applied; no active child. Do not rebuild an unchanged image.
The preview workspace has protected Delta versions 1.0.0–1.0.11 but lacks
1.0.12. The existing admin install API can add that exact immutable binding;
all other entries are already installed and must remain identity-preserving
replays. Qualification remains the exact receipt-bound Limit/OCO recipe only.

Run the longest useful bounded range (90 days, verified historical BTCUSDT
1h coverage) and inspect source-backed journal/window/candle reads plus S08
at 1280/660 px. **This recipe is fixed one trial and emits one entry cycle:**
longer data cannot honestly produce a many-trial/many-cycle stress receipt.
Do not raise its immutable budget or invent orders. Existing 16×400-trial
receipt remains separate; multi-cycle Limit/OCO needs an additive recipe.

Exit: ordinary creation completes and materializes; reads expose real LIMIT,
parent/OCO activation and fill/cancel records; unaffected versions/flags and
frontend image stay unchanged; ephemeral probe/browser sessions are revoked.
Record exact source/runtime/run identity, date windows, measured record/page
counts and honest absence states. Shared preview stays up for owner review.
No remote push, release, broad prune, volume deletion or full unrelated rerun.

Status: **BACKEND_SHARED_PREVIEW_READY**, 2026-10-08. Fresh 90-day ordinary run
`rrun_7c6aff8dc45f1781887527c2bf970f2c` completed/materialized. All 1,944 IS/OOS
bars pass full opaque-cursor sweeps (8+3 pages, max 158,437 bytes), IS real
3-order/2-fill/8-event journal passes parent/OCO activation and cancellation;
OOS is published empty and native Holdout remains typed unexecuted. Exact
setup is now ENABLED / PRODUCT_RUN_QUALIFIED after the existing admin install;
all twelve old bindings and other candidate receipt authority stay unchanged.

**Not full S08 acceptance:** browser 1280/660 has no errors/API failures and
plots both real fills, but the served web bundle predates Claude `1ab33e3f`
(missing source order ID / parent-OCO / event-name columns). Claude must
rebuild only web and retake journal rendering on this same run; no new child
needed. Codex did not expand a backend-only approval into a frontend rebuild.
No many-trial/multi-cycle Limit/OCO claim; no P24/owner/release claim.
Sessions revoked, zero active children, accounts/data/images preserved;
no destructive cleanup needed.
[Exact run link, measures, private hashes and Claude handoff](./evidence/P24/SHARED_PREVIEW_LIMIT_OCO_90D_2026-10-08.md).

### §51 — Limit/OCO multi-cycle native optimization — Bobby approved 2026-10-08

The one-trial/one-cycle recipe was a minimal qualification, not comprehensive
stress coverage. Preserve its immutable descriptor, Alpha binding and receipt.
Add a distinct recipe with 2–400 real parameter trials (default 100), seed 42,
bounded serial CPU/wall/scratch limits, and repeated causal Limit-entry / SL–TP
OCO cycles. Trial scoring must call the pinned QuantBT native matcher/accounting
through its public generic optimizer; never optimize a scalar surrogate and
call it native. Select on IS only; no Holdout rows enter this child. Publish the
exact optimization scope and retain the complete engine trial population in
Parquet, separately from the bounded public summary. OOS remains evaluation,
not selection. Preserve exact values, source identities and opaque paging.

Qualification: ordinary admission → isolated child → P05 seal → named reads on
long real historical data with 100 requested trials; measure distinct parameter
sets, actual cycles, orders/fills/cancels/expiry and parent/OCO activation.
Do not promise particular profitability or fabricate an event to meet a count.
Rebuild the Research preview web from current Claude source, then verify real
journal rendering at 1280/660 px. No frontend redesign, production/dev/main,
manual SQL writes, unrelated candidate activation, remote push or compaction.

Capacity before edits: root available 99,916,795,904 bytes (85% used). Serial
incremental scoped builds, existing caches, at most 5 GiB additional footprint;
preserve current/rollback images and all original evidence. Group focused tests
and one mandatory normal commit hook, not a full gate per small edit.
Status: **IMPLEMENTING**; not yet product-qualified.

**Backend delivery, 2026-10-08 — PRODUCT_RUN_QUALIFIED / SHARED_PREVIEW_READY.**
Additive 1.0.13/native IS optimizer supports 2–400 trials/default 100 and
48-bar cycles; original fixed recipe/receipts stay immutable. BTC/ETH/SOL
ordinary 90-day runs each COMPLETED/READY with all 100 trials byte-verified
in P05. Counts: 21/15/16 parent cycles, 84/60/64 orders, 42/30/32 fills;
no OCO sibling double-fill, real fill/cancel pairs retained.
Migration 125/126 safely opens only the exact qualified recipe on shared
Research preview without a candidate selector. Shared new BTC run
`rrun_ee50cb82d6de9e495e10b32323b62f8c` completed 100 trials/21 cycles.
Claude web containing `1ab33e3f` rebuilt; affected S08 browser1280/660 passes.
Setup seed/span presentation is corrected from immutable executor facts,
not by changing a historic recipe. Narrow FE type/Parameters mapping is
explicit in the handoff; scalar native Search/Freeze/full Report and P24
are not falsely declared complete. No production/dev/main/remote push,
compaction or source-data changes. Owned QA identity revoked/cell stopped.
[Frozen source proof](./evidence/P10/LIMIT_OCO_MULTICYCLE_PRODUCT_QUALIFICATION_2026-10-08.md) ·
[Shared run, actual receipts and exact Claude handoff](./evidence/P24/LIMIT_OCO_MULTICYCLE_SHARED_PREVIEW_AND_CLAUDE_HANDOFF_2026-10-08.md).

## §52 — S08 accepted-component integrity / Bobby frontend ownership correction

2026-10-08: Bobby rejects the inconsistent two-chart S08 presentation and
directs Codex to backend only; Claude implements frontend/components using
the accepted HiFi/design. This also assigns §51's pending RecipePins and two
fixedNative mappings to Claude, superseding conditional Codex frontend patches.
The earlier S08 receipt proves functional/data behavior, **not visual integrity**.
Backend §51 qualification/source custody remains valid; no engine rerun is
needed to repair a frontend component. Holdout/SL/TP absence and incomplete
native Search/Freeze/Report readers remain truthful, not silently closed.

**Status: FRONTEND_HANDOFF_READY / CLAUDE_VISUAL_ACCEPTANCE_OPEN.** Exact source
locations, generated DTOs, paging/causal constraints, current real run and
affected 1280/660 exit gates are in the
[S08 component-integrity handoff](./evidence/P24/S08_COMPONENT_INTEGRITY_CLAUDE_HANDOFF_2026-10-08.md).
Documentation only: no frontend/backend source, baseline, runtime, migration,
remote/dev/main/production or release mutation. Claude records genuine missing
DTO facts as backend requests rather than inventing data to fit a chart.

### §53 — Fold cap above 16: Bobby's decision, NOT implemented yet (2026-10-08)

Bobby: keep the current cap (2–16 folds, ≤ 6,400 trials in total) for now; when the cap is raised toward **30 folds**, take **option B** — keep the 6,400-trial total and reduce the admitted trials per study as folds grow beyond 16 (e.g. 30 folds × 213), rather than raising the total to 12,000. Folds 10–16 are the expected common range.

Where the cap lives (for whoever implements it): `fold_bounds {min:2,max:16}` is sealed into the immutable recipe descriptors of migrations 095–108 (a raise needs a new recipe edition/digest and migration, like 119–124); `max(16)` is hard-coded in control-api `full04-seal-consistency.ts:49`, `current-source.payload.ts:623,628`, `final-audit.contract.ts:45`, `fold-ordering.ts:77`; generated contracts must be regenerated; the 6,400 total is hard-coded in about eight places (`current-source.contract.ts:64`, `current_source_artifacts.py:2323`, `current-source.repository.ts:638`, `sampler-evidence.contract.ts:100`, …). Size budgets that held only just at 16 folds (core summary 63,492 / 65,536 bytes; Search trial page 1,000,181 / 1,048,576 bytes; ~82,001 window-execution rows) must be re-measured with a real 30-fold run before any claim. No code was changed for this.

### §54 — Report of a COMPLETED native run answers 404 instead of a typed absence (found by the FE matrix, 2026-10-08)

Backend request (Claude → Codex)
- **Endpoint / field:** `GET /api/v1/quantbt/runs/{runId}/report` (`researchReportGetV1`).
- **Actual:** for the COMPLETED native optimized run `rrun_ee50cb82d6de9e495e10b32323b62f8c` it answers `404 {"error":{"code":"RESEARCH_REPORT_NOT_FOUND","message":"Research report was not found."}}` (also for the original native Limit/OCO run id when read in a workspace that has it). A WFO run (`rrun_cf5ed033…`) answers 200.
- **Why the UI cares:** the Run Library lists the native run first and offers "open report"; the browser logs a `Failed to load resource … 404` for it, which fails the matrix `console` check of the S01 cell (`P24 15-screen matrix › S01 Run Library`, check `console`: 0 errors expected). The Report screen itself already words `RESEARCH_REPORT_NOT_FOUND` as a typed refusal; the defect is a 404 for a run that is completed and for which §51 states the full native Report is not delivered — a missing artifact that is known and typed should not look like a missing run.
- **Expected (proposal only, Codex decides):** either a 200 `Report` body whose availability is `NOT_APPLICABLE` / `NOT_PUBLISHED` with a reason code such as `NATIVE_REPORT_NOT_DELIVERED`, or a capability flag on the run-library row (`report: { state, reason_code }`) so the Library can show the action disabled with the reason instead of requesting it.
- **Fallback running now:** none needed for correctness (typed refusal screen); the console 404 is the only symptom. I will not special-case the recipe family in the frontend to hide the request, because that would re-derive a server fact.
- **Test that proves it:** the S01 matrix cell reads 0 console errors with the native run first in the library.

#### §54 delivery — Codex, 2026-10-09

**BACKEND_SOURCE_DELIVERED / PREVIEW_HTTP_AND_S01_CONSUMER_PENDING_CLAUDE.**
Actual operation id is `researchReportDetailGetV1` (preserved). Generated
`ReportRead = ReportDetail | ReportUnavailable`; known native absence returns
200 `research.report-unavailable.v1`, `NOT_PUBLISHED / NATIVE_REPORT_NOT_DELIVERED`,
`may_export:false`. Historical profile id+digest, workspace/RLS and ETag are
server authority; no fake `frozen_core`/seal or native repair job. Existing sealed
Report wins; unknown/foreign ids remain 404. Absent-native export remains a typed
409 and queues nothing. Claude must narrow the union before `frozen_core`; no
frontend/component/baseline was changed and shared runtime is not rolled out
ahead of that consumer. Real preview-DB compiled-source read proof PASS (not a
deployed HTTP/browser claim), focused Report23/23 and contracts5/5 PASS.

FAILED-data inspection: `rrun_4eab9…` has 9,903 current rows + one seal and
46,377 window rows/232 batches + one seal, **0 orphan batches**; `rrun_bd590…`
has an existing failed Report. Retain both as immutable forensic evidence;
no deletion or FAILED→COMPLETED rewrite. §53's current keep16/≤6,400 remains;
future option B toward30 is not activated by this delivery.

[Exact response, private proof hash, scoped inventory, gates and Claude prompt](./evidence/P18/NATIVE_REPORT_ABSENCE_AND_FAILED_CUSTODY_2026-10-09.md).
# §55 — Native Search, Freeze and complete Report/export — Bobby approved 2026-10-09

Owner assigns Codex backend only. Preserve Claude's accepted components and
all scalar/Three Window/WFO representations. This is a Portal integration
slice, not an engine/source upgrade and not P24/product-release approval.

## Delivery plan and exit gates

1. Project the P05 native optimizer population and its exact selection into a
   bounded append-only, workspace/artifact/profile-bound local read model.
   Verify original manifest/part/document bytes in a private preparation path;
   never reopen artifact bytes or run QuantBT during browser GETs. Historical
   preparation must preserve the original seal and reject mismatches.
2. Publish additive typed `native_search` on S06 (complete retained trial
   population, source metrics, exact selected identity, engine selection
   evidence) and `native_freeze` on S07 (selected parameters/digests, P05
   provenance, explicit verification scope and unsupported scalar claims).
   Native optimization is IS + warmup only, generic robust plateau, not scalar
   WFO. Trial number and display ordinal remain separately typed.
3. Assemble a native Report from these local readers plus existing native
   window/account facts. Reuse immutable Report sealing and authenticated
   prepare/job/download JSON/CSV. Old Report cores stay byte-identical.
4. Test schema/generated parity, custody/tamper/replay and tenant isolation,
   missing/null/pruned facts, exact identity/digests, immutable Report/export,
   bounded reads and old WFO/fixed regressions. Obtain a real retained-native
   candidate receipt; fixture/unit results alone are not product acceptance.
5. Record generated names/example/hashes and hand off to Claude. No frontend,
   baseline, remote push, dev/main/production mutation. Shared-preview changes,
   if required for the real receipt, remain scoped to backend forward migration
   and its source image; no database reset or engine rerun.

Status: BACKEND_DELIVERED / DEPLOYED_PREVIEW_HTTP_PASS.
Frontend consumer/browser acceptance is separate; not P24/release.

Published additive `SearchDetail.native_search`, `FreezeDetail.native_freeze`,
`FreezeVerification.native_freeze` and `FrozenCoreV2.native_report`; regenerate
with `npm --prefix packages/contracts run generate:research-native-read`.
Existing route names, scalar consumers and immutable old Report cores remain.
Canonical native Search/Freeze/Report fixtures come from actual P05 bytes.
100-trial run: θ*41 (ordinal42), 98 distinct sets, complete pagination and
JSON/CSV checksum-download PASS. Three fixed-native Reports also PASS.
The sidecar preserves transform versions (127/128), exact bindings and RLS;
GETs never read Parquet or call the engine. Sampler/member identities and
freeze wall-clock absence remain typed; P08 and P05 manifest hashes are distinct.
[Receipt, resource decision and scoped runtime evidence](./evidence/P18/NATIVE_SEARCH_FREEZE_REPORT_DELIVERY_2026-10-09.md).
[Claude consumer prompt and exact mappings](./evidence/P18/NATIVE_READERS_CLAUDE_HANDOFF_2026-10-09.md).

Runtime follow-up: actual signed private transport and24 authenticated API
calls PASS, including100-trial paging, S06/S07/Report hash parity, fresh byte
Verify, conditional304, fixed-native Reports and JSON/CSV checksums; security
negative matrix and own-session revoke PASS. Fixed a native Freeze ETag clock
bug caught by readback; it now uses persisted observation times. Backend-only
preview rollout preserves web/DB/NATS/mounts; no engine rerun, frontend edit,
profile change or remote push. Final committed identity and responses live
in the linked receipt's private runtime JSON; Claude's component/browser
acceptance remains open, not a backend/source-owner wait.


### §55 — Claude consumer result (2026-10-09)

Consumed on the lane: `native_search` (S06), `native_freeze` + Verify (S07), `frozen_core.native_report` and the existing export flow (S09). Receipt: [NATIVE_READERS_CLAUDE_RECEIPT_2026-10-09.md](./evidence/P24/NATIVE_READERS_CLAUDE_RECEIPT_2026-10-09.md). Real API at 1280 / 660: θ* trial 41 / ordinal 42, byte receipt `MATCH` after an explicit Verify, JSON and CSV exports whose SHA-256 equals the job's, three fixed-native Reports with no optimizer blocks. No backend request is open from this slice. Observation for Codex (not a request): on a native run the server answers 400 to any `fold` on Search and Freeze, so the frontend learns "native" from Progress (`native_execution`) before its first read; a published per-run flag on the Library row or the hub reads would let the first request be right without a Progress read.

### §56 — Governance UX consumer: two optional fields so R1 can name its sources and the new-request entry can stop typing claims (Claude, 2026-10-11)

Context: the Governance screens (Inbox, Gate R1/R2/Live, New request) were reshaped to the Research loop's look (`hifi_execution_loop/UX_UPGRADE_PROPOSAL_GOVERNANCE_2026-10-11.md`). Nothing below blocks them; each removes a place where the screen can only say "typed" or "not linked". Frontend keeps its honest-absence copy until the field is published.

| # | Request | Why the UI needs it | Today's fallback |
|---|---|---|---|
| 1 | On each `governance.r1-review.v1` checklist item, a typed source reference: `evidence_ref: { kind: "REPORT" \| "RUN" \| "FREEZE" \| "AUDIT", id, run_id }` (or `null` + reason) | Every evidence row shows "Report S09 · run_5512 ▸" and opens the Research screen that proves it | The row shows the check and its verdict only; `ChecklistItem.evidence.href` is read when present |
| 2 | A read that lists methodology claims for a run (id, grade, state), e.g. an `eligible_methodology_claim_ids` array on the Run Library item (it exists today only on a sealed RC publication) | "New approval request" offers the completed-run picker already (Run Library); the claim is still typed | Typed id, validated by the POST (typed 422) |

Both are additive and nullable; no Execution-side change. Ask Bobby before re-ordering gates or changing the R1/R2 verdict vocabulary.

#### Codex delivery plan — 2026-10-11

- Keep both existing reads and authorization: R1 checklist references come only
  from hash-matched entries in the verified immutable evidence manifest; ambiguous,
  unsupported or unrecorded sources return a null reference with a typed reason.
  Do not infer a Report link from a checklist label or change gate/verdict order.
- Library reads the exact workspace/run-bound `run_read_models.methodology_claim_ids`
  that R1 POST validates, in the existing bounded authorized page snapshot. No
  bridge materialization, writes, source refresh, new endpoint or authority cache
  on GET. Missing source stays typed absent; an authoritative empty list stays empty.
  Per-id grade/state not associated by that source stay null with a typed reason;
  the existing run-level certificate is not reassigned to each claim.
- Publish additive Zod/schema/OpenAPI/generated types, canonical examples and
  focused mapping/contract/real-PostgreSQL regression tests. One normal commit
  hook after the coherent slice; no engine/load/DR rerun or runtime rebuild for
  this metadata-only change. Handoff explains workspace-preserving navigation
  and that R1 POST remains the final eligibility/permission enforcer.
- Scope excludes frontend design/copy, Edge/TS, SSE, commands, profiles,
  production/dev/main, remote push and release. Status: `IN_PROGRESS`.

#### Codex backend delivery — 2026-10-11

Both additive contracts implemented; delivery requires the ordinary commit hook.
[Receipt and Claude handoff](./evidence/P22/GOVERNANCE_UX_OPTIONAL_SOURCES_2026-10-11.md)
contains the generated names, examples, source/absence semantics and test boundary.
Checklist exposes `R1ChecklistItem.evidence_ref`/`evidence_ref_reason`; Library
exposes `RunLibraryItem.eligible_methodology_claim_ids`, `methodology_claims` and
`methodology_claims_availability`. No new route, migration, frontend edit or rollout.
Known ids are available; per-id grade/state absent in the authoritative intake
model stay null with `R1_CLAIM_GRADE_STATE_NOT_RECORDED`, not a fabricated grade.
Missing intake stays null, recorded empty stays `[]`; GET never grants eligibility.
Focused backend71/71 and contract6/6 PASS. The delivery commit containing this
section is gated by normal root-hook security/real-PG verification. Claude's
consumer/preview/browser acceptance remains separate and is not declared PASS.
Hook attempt1 caught a new PG seed missing required artifact pins; corrected
only the seed, with the exact PG case retaken PASS. Existing DB constraint and
backend authority stay unchanged; failed log retained, ordinary-hook retry required.

### §56 — Claude consumer result (2026-10-11)

Consumed from `0159987c` (`P22/GOVERNANCE_UX_OPTIONAL_SOURCES_2026-10-11.md`), generated types + the published synthetic fixture (loaded by the test, not copied):

- **R1 checklist source** — `readChecklistItem` keeps `evidence_ref` with its actual kind and a typed `evidence_ref_reason`; an unreadable/unsafe ref becomes `R1_EVIDENCE_SOURCE_NOT_LINKABLE`, never a guessed destination. The finding row links `Run · run_5512 ▸` (RUN → `/research/quantbt/runs/:id/overview`, REPORT/FREEZE/AUDIT → their own screen) with the approval's own `workspace_id` kept; a null ref shows a quiet "no source link" whose tooltip is the reason in words. A RUN is never worded as a Report. Historical responses (no field) render as before.
- **Claims per run** — the New request picker reads `eligible_methodology_claim_ids` / `methodology_claims`: listed ids become a claim select (id plus only non-null source-bound grade/state); exactly one listed id is taken on picking the run, several are left to the reader; `[]`, `null`+reason and omitted (legacy) are three different notes. The id stays editable and the POST stays the authority; a stale pick still gets its typed refusal.
- Tests: 5 new (fixture-driven), frontend run + research 3960 pass; preview web rebuilt, real-route browser pass at 1280/660 (0 overflow, 0 page errors). **Not observed:** the new fields on a real response — the preview control-api is not rebuilt with §56, so no real positive lane exists yet; the screens fall back to today's behaviour (verified).

### §56 — real-API receipt on the research preview (Claude, 2026-10-11, Bobby ordered the rollout)

`preview.sh build control-api` + scoped `up control-api portal-web` from `a13e4d03` (no DB/migrations/bootstrap; running image == tag `sha256:ee7a13f6…`, and the container holds `dist/governance/evidence-reference.js`). Logged in as `claude-preview`, 1280/660.

| Check | Observed on the real stack |
|---|---|
| Run Library `limit=50` (96 runs) | 2 COMPLETED runs `AVAILABLE` with `eligible_methodology_claim_ids=[1]` (e.g. `rrun_73bc…` → `claim:sha256:cab7…922a`, `grade:null`, `state:null`, `R1_CLAIM_GRADE_STATE_NOT_RECORDED`); 38 COMPLETED + 7 FAILED `NOT_PUBLISHED R1_INTAKE_RUN_NOT_COMPLETED`; 2 FAILED + 1 QUEUED `R1_INTAKE_RUN_NOT_PUBLISHED`; no legacy-omitted item |
| New request, pick `rrun_73bc…` | claim prefilled with the listed id, alpha `delta-rsi-polynomial-alpha` filled, caption "the Run Library lists this one claim for the run" (1280 and 660) |
| New request, pick another completed run | typed absence: "the Run Library cannot list claims for this run (R1_INTAKE_RUN_NOT_COMPLETED) — type the id" |
| R1 checklist `evidence_ref` | **Not observable**: the preview has no R1 approval (Inbox 0) and, per the handoff, current requests persist no findings (`checklist: []`). Creating an approval only to look at an empty checklist was not done. Covered by the published synthetic fixture test; a real positive lane needs a request with persisted findings |

### §57 — Governance cross-loop backend repair (Bobby approved, 2026-10-12)

The audit found real integration defects, not proof that the whole downstream
chain is active. Approved scope: backend repair/contracts/tests and Claude FE
handoff; branch `docs/research-loop-plan`, base `be35972a`, no remote/runtime
activation. [Backend receipt](./evidence/P22/GOVERNANCE_CROSS_LOOP_REPAIR_2026-10-12.md)
and [Claude FE-GOV-01…04 handoff](./evidence/P22/GOVERNANCE_CROSS_LOOP_CLAUDE_HANDOFF_2026-10-12.md).

| Id | Disposition |
| --- | --- |
| GOV-BE-01 R1 decision inputs | Additive `DecisionContext` with exact workspace/version/hash pins; API authority unchanged. FE hash binding still required. |
| GOV-BE-02 R2/Live false affordance | No commissioned executor: all R2 verbs/Inbox decision hints locked; typed null-command context; R1→R2 command mismatch is explicit and permission-nondisclosing. Not a new Execution grant. |
| GOV-BE-03 downstream capture inputs | Additive bounded `CaptureContext`; accepted candidate tuples only, source-off/retained/stale/scope/outage blocked. Multiple real grants preserved; currency absence stays null. |
| GOV-BE-04 UDB capture pool | Separate Execution store reads use its own pool, never the Core transaction; Core review/audit writes retain rollback/idempotency. |
| GOV-BE-05 workspace backlink | R2→R1 `href` keeps exact `workspace_id`; FE click/reload acceptance pending. |
| GOV-BE-06 capture visibility | ADMIN additionally requires existing parent/target gate reads in the exact workspace, freshly checked before write/replay; no role-only bypass or new grant. |
| FE-GOV-01…04 | Claude owns hash/condition binding, capture UI, no R1 alias for R2, workspace and truthful gate track. Source activation/new policy not part of this handoff. |

New schema/Zod/OpenAPI/generated definitions and labelled synthetic fixture;
target `npm run generate:governance-review-context`. Focused backend16/16 and
contracts5/5 (139 including historical fixtures) PASS; API/normal hook final
results linked in the receipt.
Delivery commit is the commit containing this entry. Backend defect repair does
not certify the FE buttons or commission R2/Paper/Sandbox/Canary/Live mutations.

### §57 — Claude consumer result (FE-GOV-01…04, 2026-10-12)

Consumed from `cde4ddae`; full receipt [GOVERNANCE_CROSS_LOOP_CLAUDE_RECEIPT_2026-10-12.md](./evidence/P22/GOVERNANCE_CROSS_LOOP_CLAUDE_RECEIPT_2026-10-12.md).

| Id | State |
|---|---|
| FE-GOV-01 | R1 plan = same-read workspace/approval/version + exact unique hashes; request-changes carries remediation conditions; Paper Exit pins lineage digests. **Fixture + 37 tests; real plan/apply not observed** (no approval on the shared preview) |
| FE-GOV-02 | R2/Live: no decide path, every verb closed with the typed reason; no R1 alias. Real preview: unavailable-state routes only |
| FE-GOV-03 | `CaptureNextStep` from `capture_context`; blocked/retained = reason, no form. **No positive real capture** (needs a source-backed cell) |
| FE-GOV-04 | bounded R1 backlink + workspace re-read/remount; gate track is position only; browser click/reload ok on the retained preview (1280/660, 0 idle polls) |

**CG-GOV-01 closed (2026-10-14):** Codex published `data.decision_context` on the Paper Exit read (`538f8fdb`); the frontend now pins it (own command, complete manifest set, same-read workspace/version) and no longer sends lineage digests. Real positive plan/apply still unobserved (shared preview serves the older API). Remaining authority gaps unchanged: R2 executor, accepted Paper/Sandbox/Canary/Live evidence, real positive capture lane.

### §57 — CG-GOV-01 backend amendment (Codex, 2026-10-12)

Confirmed and repaired: optional Paper Exit `data.decision_context` carries the
verified complete manifest hash list, exact workspace/review/version/source pins
and its own existing Paper Exit command. No R1/R2 schema widening or auth change;
per-verb eligibility still applies. Lineage digest advice in the earlier handoff
is superseded, not a legitimate fallback. Generated type:
`components["schemas"]["PaperExitDecisionContext"]` in `execution-governance.d.ts`.
Scoped generator, labelled synthetic `paper_exit`, strict schema/contract tests
and isolated real-PG read→plan→apply regressions accompany the change.

CG-GOV-01 backend DELIVERED by the normal-hook commit containing this entry;
Claude must consume the new pins instead of lineage digests, preserving design.
[Receipt, test boundaries, exact example and FE handoff](./evidence/P22/CG_GOV_01_PAPER_EXIT_CONTEXT_2026-10-12.md).
No preview/runtime/remote/source activation. Positive shared-preview browser
lanes and R2 executor authority remain separate, not closed by this additive DTO.

## §58 — S08 Execute replay: continuous cross-fold play, mode-5 shape, boundary facts (Claude → Codex, 2026-10-14)

Bobby decided (2026-10-14): keep per-fold windows, but when **play across folds**
is on the chart **appends** the next fold into the same picture with a labelled
fold-boundary separator; and asked Codex to support the backend side **fully**,
without self-limiting. The frontend half is built (trail of earlier windows,
`FoldBoundary` separators, plot-area clipping). It reads only what is served
today (`fold_capital.segments`, window `page`, bar `fold_id`), so everything
below is what the UI cannot derive and must not guess.

| ID | Ask | Why the FE cannot do it itself |
|---|---|---|
| CG-RP-01 | **Mode-5 (`mode_5_full_robust`, train = test) split shape.** Confirm and publish, on the replay/execution read, an explicit typed split: window kind (`FOLD_WINDOWS` / `SINGLE_FULL_WINDOW`), whether a held-out window exists (`oos_applicable: false` for mode 5), and the bar span of the one window. Add a mode-5 fixture/run to the contract fixtures. | There is no mode-5 run on preview; the UI currently infers "one fold window" from `segments.length`. Inference must become a served fact. |
| CG-RP-02 | **Continuous cross-fold navigation.** On each window read add a cursor block: `crossed_fold_boundary: bool`, `next_fold_id` / `previous_fold_id`, and a `next_window_cursor` that continues **across** a fold's last bar into the next fold's first bar (today the FE issues the next fold's `start_cursor` as a separate read). A window may span a boundary if you prefer; then each bar keeps its `fold_id`. Support reading backwards too. | Appending needs gap-free, ordered windows; the FE only appends when the next window starts after the previous one's last ordinal and shows nothing stitched otherwise. |
| CG-RP-03 | **Boundary facts per fold.** On `fold_capital.segments[*]` (or a sibling `boundaries[]`): `params_digest_changed: bool` vs the previous fold, `selected_trial_id` / `study_id` of both sides, and the carry basis (`start_basis`: carried equity/position vs reset) with the previous fold's `end_equity` / `end_position`. State plainly when the position/equity is carried across the boundary and when it is reset. | The separator label/tooltip and the "what changed here" reading need these as served values; the FE must not diff parameter objects itself. |
| CG-RP-04 | **Window size.** Raise or make explicit the maximum window (FE retains `RETAINED_WINDOW_MAX = 200` bars; a trail keeps ≤ 600 bars). Publish the cap in the read (`page.max_bars`) so the FE stops hard-coding it, and allow a larger window for the stitched view if safe. | A single long run (the "one long chart" alternative) is only honest if the server states what it will serve. |
| CG-RP-05 | **Contracts, fixtures, tests.** Generated types, a multi-fold fixture with differing params across folds, a mode-5 fixture, and strict schema tests; no preview/runtime activation implied. | The FE tests and the browser receipt run against these. |

Frontend contract once delivered: separators come only from served boundary
facts; absent facts render as a plain boundary with no claim (typed absence);
nothing is read unless the reader turned **play across folds** on.

### §58 — Codex backend delivery (2026-10-14)

Implemented CG-RP-01…05; delivery is the ordinary-hook commit containing this
entry. Claude's concurrent `0c1a6e42` is preserved. No frontend edit, runtime
activation/rebuild, engine run, migration, profile/permission change or push.
[Receipt, exact semantics and Claude consumer handoff](./evidence/P17/CG_RP_01_05_REPLAY_CONTINUITY_2026-10-14.md).

| ID | Backend delivery / generated type in `research-current-source.d.ts` |
| --- | --- |
| CG-RP-01 | `execution.split_shape` / `ReplaySplitShape`: exact recipe + retained disclosure; Mode5 full sample with no OOS/Holdout, never singleton inference. |
| CG-RP-02 | `replay.window_cursor` / `ReplayWindowCursor`: signed run-global continuation forwards (`cursor`) and backwards (`before`); crossing includes the incoming page edge. |
| CG-RP-03 | `execution.fold_capital.boundaries` / `ReplayBoundaryFact`: selected hashes/trial/study on both sides, previous ending values, source carry/reset/close policy; missing facts typed. |
| CG-RP-04 | `replay.page` / `ReplayPage`: max400 bars; one-MiB byte cap can shorten a page with edge-safe cursors. Other relations remain max200. |
| CG-RP-05 | Strict Zod/OpenAPI/generated types, two explicitly synthetic canonical fixtures, generation/check/snapshot registration, retained real-HMD and disposable-PG/API regressions. |

Focused backend68 PASS, Replay24/24 including Mode5/full-reader and byte-bound
round-trips, contracts4 PASS; final ordinary hook gates production build/full
API/real-PG/restore/contracts. No claim that the test-inclusive API-wide
`tsc --noEmit` is clean (historical test scaffolding diagnostics).
Source revisions/seal/RC pins unchanged; presentation continuity does not assert
continuous account policy or broker replay. Claude owns additive mapping and
affected browser acceptance; shared-preview Mode5 is not proven by a fixture.

Delivery `647cec8b` ordinary gate: API2,562 PASS/3 existing opt-in SKIP,
contracts343 PASS, production build/restore/generated checks PASS; FE `tsc -b`
PASS without edits. Backend status **DELIVERED CG-RP-01…05**. The following
normal-hook commit refines boundary detection for preparation-prefix/incoming-gap
pages and records the actual C4 snapshot in the receipt; no contract widening or
preview activation. Claude consumer and affected browser receipt remain OPEN.

## §59 — S08 replay window and trail ceilings: measure, then raise (Claude → Codex, 2026-10-14)

Bobby (2026-10-14): the **200-bar client window** (`RETAINED_WINDOW_MAX`) and the
**600-bar client trail** are numbers the frontend chose, not product limits;
200 was inherited from the old server cap and 600 was picked without a
measurement. Both must be re-derived from measurements and raised where
performance allows. This is a joint item: Codex owns the server half and
the discussion; Claude owns the client half once numbers are agreed.

| ID | Ask (Codex) | Notes |
|---|---|---|
| CG-RP-06 | **Measure the replay read** at limit 100/200/400 (and higher if the 1 MiB envelope allows): server time, payload bytes, `byte_limited` rate on the real retained WFO fixture (1,056 observations) and the largest real run, p50/p95. | The 1 MiB envelope, not the row count, is probably the binding constraint; say which. |
| CG-RP-07 | **Is 400 the right ceiling?** If the envelope or DB cost allows more (e.g. a whole fold or the whole run in one or few reads), propose the ceiling and whether `byte_limited` shortening is acceptable for a client that wants N bars. Consider a compact row shape for replay if bytes bind. | Cursors bind the requested `limit`; the client will pick one limit per chain. |
| CG-RP-08 | **Whole-fold windows.** Can a fold's full test window be read in one request when it fits (so a fold never needs paging)? State the rule the client can rely on (`page.max_bars`, `byte_limited`). | Today `limit = min(200, fold bars)`. |

Client half (Claude, after the numbers): replace the hard-coded 200 by
`page.max_bars`-derived limits, size the trail from a render-time measurement
of lightweight-charts with N bars (setData/redraw, marker overlay count, memory),
and keep every read behind the reader's own switch. No preloading while
play across folds is off.

### §59 — Codex measurement lane (2026-10-14, owner approved)

**IN_PROGRESS CG-RP-06…08.** Baseline `ac715e6a`; backend lane
`codex/be-gaps`, eventual fast-forward landing only on `docs/research-loop-plan`.
Measure 100/200/400 and larger requests against actual retained preview data,
including the largest retained run (58,848 observations), plus the existing
1,056-observation real-HMD fixture. Keep the one-MiB response ceiling,
authorization, exact decimal strings, signed limit-bound bidirectional cursors
and dense no-loss paging. Raise the replay-only row ceiling based on measured
cost, not an arbitrary client trail. Whole-fold direct seek is allowed when
that fold fits both the published row ceiling and byte budget. No frontend
source/layout/baseline, engine rerun, production/dev/main, upstream connection
or remote push. Preview SQL benchmarking enforces transaction read-only; the
candidate reader runs from the lane, not by restarting the shared preview.

### §59 — Delivery result / Claude handoff

CG-RP-06…08 **BACKEND_IMPLEMENTED_AND_MEASURED**; delivered by the normal-hook
commit containing [the complete packet](./evidence/P17/CG_RP_06_08_REPLAY_WINDOW_MEASUREMENTS_2026-10-14.md).
`ReplayLimit` and generated `ReplayPage.max_bars`:8,192 requested;1MiB still
binds returned rows. Whole real168-bar folds fit; actual2,160+bar folds require
chunks. Final large-run request8,192 p95218ms, two readers307ms; all58,848 and
11,832 ordinals traversed without gaps/duplicates. No SLO relaxation; initial
520ms two-reader overfetch finding and its optimization remain in the packet.
Example: request`limit=8192`, response`page.limit=8192,max_bars=8192,
byte_limited=true`,856 actual rows/1,047,788B on the large run's first page.
Cursor continuation keeps8192, not856. Other readers are not widened.

Claude: consume served `max_bars` only after corresponding API build; full-fold
seek when it fits, demand-driven chunks otherwise. Preserve approved charts;
measure lightweight-charts trail/markers/memory separately rather than keeping
an unmeasured600 or loading every page. Backend measurement is not FE/browser
or deployment acceptance. No preview restart, engine job or remote push here.

## §60 — Bobby-approved Governance → P23/P24 continuation (2026-10-15)

Continue existing R1/Paper Exit, then commission Portal-local R2/Live decision
paths, reconcile P23 by exact dependencies and finish P24 preview acceptance.
This supersedes the earlier suggestion to freeze/release immediately: no
dev/main promotion, remote push, signing/deploy or source-command activation.
Base `051eeb89`, `codex/be-gaps`; preserve all Claude commits/design.

GOV-C1 IN_PROGRESS; GOV-C2 existing policy/authority inspection; GOV-C3/C4
depend on the changed backend. The [canonical P22 packet](./evidence/P22/GOVERNANCE_P23_P24_CONTINUATION_2026-10-15.md)
owns per-item implementation, generated contract/Claude handoff, real/technical
receipt labels, dependency reuse and exact open source/consumer dispositions.
Keep original receipts and historical failures; do not manufacture accepted
source capture, duplicate reviewer grants or missing historical artifact bytes.

### §60 — Backend delivery and bounded consumer work

GOV-C1 implemented fresh transaction-local authority and actual apply-time
manifest validation, fixed multi-reviewer conditional ordinal collision and
capture/replay revocation races. GOV-C2 has separate named R2 plan/apply/read
contracts and a Portal-local executor; Live reads its own gate with an own
named command but remains `LIVE_PARENT_NOT_PUBLISHED` (no immutable predecessor
policy). Neither path emits an Execution command or creates a risk grant.
Pending old plans without policy pins require replan; no history is rewritten.

GOV-C3: [15-gate dependency/custody matrix](./evidence/P23/GOVERNANCE_DEPENDENCY_DISPOSITION_2026-10-15.md),
23 actual private receipt hashes and offline reconciliation tool with14/14
technical tests. Historical strict83/86 stays false full-store integrity.
No same-image certification or unverified receipt reuse is manufactured.

Claude must consume [FE-GOV-C01…05](./evidence/P22/GOVERNANCE_PORTAL_DECISION_CLAUDE_HANDOFF_2026-10-15.md):
own R2/Live command/schema pairs, same-read child manifest pins, per-verb
eligibility, exact authority requirements, Live typed refusal and retained
capture lock. Old decoder/client hard-code R1 and must be updated; no UI
design file was modified by Codex. Final PG/preview results and P24 affected
browser T02/T14 are recorded in the linked packet, never inferred from fixtures.
