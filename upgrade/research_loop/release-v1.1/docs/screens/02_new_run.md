# SPEC 02 · New Run — context · route · preflight — `QuantBT 02 New Run Preflight.dc.html`

> Màn khai báo dày nhất domain. Agent code phải bám spec này từng control. Copy VERBATIM. Số = CSS px.
> Luật gốc: (1) khai báo ngoài không gian đã declare là KHÔNG THỂ submit; (2) claim forecast hiện TRƯỚC khi tốn compute; (3) field không sửa thì KHÔNG serialize — default của engine tự áp.

> **Presentation-state contract:** dùng chung
> [Research Screen State Semantics v1](../RESEARCH_SCREEN_STATE_SEMANTICS_V1.md).
> `denied`/`unavailable` là trạng thái trình bày, không phải `empty`, không
> thay domain/draft state và không cho phép màn rich bị thay bằng envelope.

---

## 1. Meta

| Key | Value |
|---|---|
| File hi-fi | `QuantBT 02 New Run Preflight.dc.html` |
| Route | `/research/quantbt/runs/new` |
| Vai trò | Wizard 8 bước khai báo một run: binding alpha·av_ → strategy → execution route → data → methodology → params (sweep/pin) → optimization (full config) → review + preflight |
| Shell | Có (topbar + sidebar) |
| Inbound | 01 `new run →` · 10 root "new run →" · 14 register "new run with this av_ →" · Journey P4 |
| Outbound | tạo run → 03 (`/runs/{id}/progress`) · 12 (route atlas) · 14 (import new version) · 01/10/11 từ Context |
| Console chuẩn | 0 error/warning |

### 1.1 Wizard steps (id · label · sub trên pill)
| # | id | label | sub |
|---|---|---|---|
| 1 | context | Context | alpha · av_ binding |
| 2 | strategy | Strategy | pinned by av_ / free when scratch |
| 3 | route | Route | 14 routes · per-route params |
| 4 | data | Data | dataset · symbol · timeframe |
| 5 | windows | Walk-forward | three-window / advanced |
| 6 | parameters | Parameters | sweep / pin · ceiling 8 |
| 7 | optimization | Optimization | trials · config surface |
| 8 | review | Review & run | preflight · create |

Pill: số tròn 20px (viền 1.5px; xanh lá #1e7b4f = valid đã qua, xanh biển #0f4c5c = current, đỏ #b43a3a + `!` = lỗi); label 11.5px/500; sub 9px (#939db0; đỏ khi lỗi "needs attention"; review: "preflight valid/pending"). Bar cuộn ngang khi hẹp.

---

## 2. Header
- Breadcrumb: `Runs / New Run` (link Runs → 01).
- Title row: **New Run** (22px/300) + **binding chip** cạnh title:
  - bound: `PUBLISHABLE · av_0_9_3` — mono 10px 700, viền #1e7b4f, nền #eef5f0.
  - scratch: `NOT_PUBLISHABLE · scratch` — viền DASHED #9a6a1f, nền #fdfbf5.
- Subtitle italic: "Bind the alpha version, pick how orders come to exist, then the methodology. Each step validates on its own — a problem is reported where it can be fixed."
- Phải: mono 10px #939db0 — "routes, protocols and ceilings read from the INSTALLED engine release — quantbt-engine==1.1.1 · er_quantbt_1_1_1".

Layout thân: 2 cột — trái flex 1.6 (bước hiện tại), phải flex 1 (review rail sticky).

---

## 3. Step 1 · Context (card trắng radius 8, padding 12 14)
### 3.1 Cấu trúc
- Header nhỏ: "Context — alpha & version binding" + phải: "the unit that later composes rc_ — *see where this lands*" (link 11).
- Grid `1fr 1fr auto` gap 10, align end:
  1. **Alpha** select — option: `{alphaName} · {alphaId}`.
  2. **Version (immutable after submit)** select — option: `{av} · {state} · {digest}`.
  3. Cặp nút `bound` / `scratch` — pill grammar; scratch on = tông vàng warn.
- **Passport strip** (chỉ khi bound; nền #faf9f5 viền #efede4, flex wrap gap 5/22): cột label 9px uppercase + value mono 10.5:
  `artifact digest` sha256:… · `import state (U14)` ACTIVE xanh/DRAFT vàng/SUPERSEDED xám · `entrypoint` alphas.momentum_btc:Alpha · `supersedes` av_0_9_2 · `last published rc` rc_2026_08_c · APPROVED (superseded on next publish).
  Phải: links `lineage →`(10) · `runs of this av_ →`(01) · `import new version →`(14).
- Note dưới strip theo state (verbatim):
  - ACTIVE: "This version can compose a release candidate after the run completes — evidence lands in the pack on the Release Candidate screen."
  - DRAFT: "DRAFT import — runnable as evidence, but activate it in Alpha 360° before any publish: a draft version cannot compose rc_." (màu vàng)
  - SUPERSEDED: "SUPERSEDED — runnable for comparison, but a new rc_ should come from the active version."
- **Scratch banner** (khi scratch): khối dashed vàng — badge `NOT_PUBLISHABLE` + "Scratch runs iterate freely and stay full evidence for you — but no release candidate can ever be composed from one. Strategy pick below becomes free."

### 3.2 Tính động
- Đổi alpha → version reset về version đầu (mới nhất) của alpha đó, strategyId đồng bộ theo entrypoint.
- Đổi version → passport re-render; KHÔNG đổi các bước sau trừ strategy pin.
- bound↔scratch → binding chip title đổi ngay; strategy step đổi chế độ pin (xem §4); review rail hàng `alpha binding` đổi.
- Mọi thay đổi bất kỳ trong wizard → `preflightRan=false` (kết quả preflight cũ vô hiệu).

### 3.3 Data
```ts
interface AlphaVersion { av: string; digest: string; state: 'DRAFT'|'ACTIVE'|'SUPERSEDED';
  entrypoint: string; strategyId: string; supersedes: string; lastRc: string; }
interface AlphaEntry { alphaId: string; name: string; versions: AlphaVersion[]; }
// GET /api/v1/alphas  (registry U14 projection — cùng type màn 14 tạo ra)
```

---

## 4. Step 2 · Strategy
- 3 card strategy (flex, min 210, max ~1/3): tên mono 11.5/600, badge, desc 10.5, meta mono 9px "timeframes … · warmup … · seed required/optional".
- Badge logic: `from av_` xanh (đúng entrypoint của av_ khi bound) · `PINNED OUT` xám + card DASHED + opacity .65 + cursor not-allowed (bound nhưng khác entrypoint) · `runnable` xanh (scratch) · `BLOCKED` đỏ (registry chặn — vd pair_spread_v1: "The installed engine release certifies no basket route — the registry blocks this strategy for single-symbol runs.").
- Dòng pin note vàng (khi bound): "Strategy is pinned by {av} (entrypoint {entry}) — switch to scratch in Context to explore other strategies."
- **Protocol**: 2 pill `Three-Window Decay` / `Advanced Walk-Forward` + note "Showing only the protocols the installed engine release certifies (2). An uncertified protocol is not offered."
- Động: click card hợp lệ → set strategy + timeframe default → tự nhảy bước `route`. Click PINNED OUT/BLOCKED: không làm gì (không toast — lý do đã nằm trên card/tooltip).

---

## 5. Step 3 · Route (điểm khai thác engine)
### 5.1 Grid 14 card
Card ~25% width (min 200): tên mono 10.5/600 + badge phải + desc 9.5 + meta mono 8.5 `{family} · {contract}`.
| route | family | contract | badge/tone |
|---|---|---|---|
| signal_notional | signal | close_target_v2 | DEFAULT xanh |
| pct_equity | signal | legacy | LEGACY vàng |
| intrabar_bracket | bracket | intrabar_bracket_v1 | RUST xanh biển |
| dca_ladder | bracket | ladder (legacy) | OK |
| reactive | event | native_event_strategy | RUST |
| event_driven | event | event_lifecycle_v2/v3 | OK |
| native_event_lifecycle | event | v2_next_bar_close · v3_next_open | OK |
| orders | tape | native_event v1 | OK |
| fill_replay | tape | fill_replay_v1/v2 | OK |
| basket | multi | native_event package | OK |
| arbitrage | multi | native_event package | 6/9 vàng |
| portfolio | multi | native_portfolio | OK |
| nautilus_dca_grid | valid. | nautilus | EXP vàng |
| options | multi | native_option | DEFERRED đỏ + dashed + disabled |
- Card disabled (options): opacity .6, click no-op, title = lý do: "options route is deferred this round — no portal parameters are declared for it yet." → chọn nó là routeError chặn wizard (nếu set qua URL).
- Header phải: `full route atlas →` (→ 12 tab routes).

### 5.2 Panel chi tiết route đang chọn (nền #faf9f5)
Hàng đầu: tên mono + chip contract (viền #0f4c5c) + backend mono #939db0 + note phương pháp phải:
- route WFO-able: "strategy-param route — walk-forward search applies" (xanh).
- tape (orders/fill_replay/lifecycle): "tape-driven — single-pass replay; the walk-forward step collapses to the tape span" (vàng).
**Form theo route (chỉ 4 route ưu tiên có form thật):**
- intrabar_bracket: select `level_mode` {hlc_conservative, ohlc_path, close_only} · select `same_bar_policy` {stop_first (conservative), target_first, flag ambiguity no resolve} · input `tick_size` · cột tĩnh "intent columns: sl_price · tp_price · trail_bps". Note link 08: "Ambiguous bars … resolved by same_bar_policy and every resolution is flagged in the fill ledger — inspect them in Execute Replay."
- portfolio: select mode {longshort, market_neutral, directional, equal_weight, risk_parity, beta_neutral} × select sizing {equal_weight, risk_parity, vol_target, kelly_fraction, fixed_notional, atr_risk, min_variance, score_weighted}. Note link 09/08.
- reactive: select runtime {R0 python reference, R1 numeric kernel, R2 sparse-wake, R3 block compile, R3B batch} · select audit_mode {minimal, standard, audit · wake trace} · cột "parity: R1–R3B certified vs R0". Note: audit=audit ghi wake trace mà 08 render; minimal thì panel sẽ NÓI là không có, không vẽ rỗng.
- dca_ladder: input base_order_usd · safety_orders · step_scale. Note link 08 ladder fills.
- Route khác: 1 dòng summary (vd arbitrage: liệt kê 6 executable spec + 3 schema-only disabled kèm lý do; tape: "Tape reference is attached at submit… no search, no folds").

### 5.3 Data & types
```ts
type RouteId = 'signal_notional'|'pct_equity'|'intrabar_bracket'|'dca_ladder'|'reactive'
  |'event_driven'|'native_event_lifecycle'|'orders'|'fill_replay'|'basket'
  |'arbitrage'|'portfolio'|'nautilus_dca_grid'|'options';
interface RouteInfo { id: RouteId; family: string; contract: string; backend: string;
  badge: string; tone: 'ok'|'warn'|'rust'|'blocked'; method: 'wfo'|'tape'|'none';
  blocked?: string; }
interface RouteCfg {
  ib: { levelMode: string; sameBar: string; tick: string };
  pf: { mode: string; sizing: string };
  rx: { runtime: 'R0'|'R1'|'R2'|'R3'|'R3B'; audit: 'minimal'|'standard'|'audit' };
  dc: { base: string; so: string; step: string };
}
```
**Nguồn**: `GET /api/v1/quantbt/releases/current` → `{ engine_release_id, routes: RouteInfo[], modes, schedules_matrix, ceilings, optimizer_defaults }` — grid render TỪ payload; engine thêm route mới ⇒ card mới tự mọc, KHÔNG sửa FE. Support matrix (arbitrage/nautilus) là field pass-through từ engine `arbitrage_support_matrix()` / `nautilus_support_matrix()`.

---

## 6. Step 4 · Data
- Khối "requirements" (nền #faf9f5, grid 2 cột): required columns · declared timeframes · warmup bars · seed — TỪ strategy declaration. Note: "Timeframe and seed are checked in this form. Required columns and warmup are checked by the server at preflight — the Review step names whichever gate failed."
- Grid `1.4fr .7fr .7fr`: Dataset select (`ds_btcusdt_4h · available`; note "Historical source — backtest only. Realtime and paper are separate services.") · Symbol* input · Timeframe* select {15m,1h,4h,1d}.
- Lỗi cục bộ (đỏ, khối viền #b43a3a nền #f7e8e8): thiếu symbol → "A symbol is required."; timeframe ∉ declared → "The strategy declares only {list}."

## 7. Step 5 · Walk-forward
- **Three-Window**: 3 hàng IS/OOS/Holdout × (start,end) datetime-local; luật half-open; lỗi verbatim: "OOS must begin exactly where IS ends." / "Holdout must begin exactly where OOS ends." / "Every window must have a positive length." / "A holdout end-exclusive is required for the historical query."
- **Advanced**: 5 input (Analysis start · End exclusive · Split mode/first OOS · Frequency · Window mode) + **fold plan preview** (nền #faf9f5): formula mono `{frequency} × ({split} → {end})`, badge `≈ N outer folds` (viền xanh; vàng khi N>20), strip cell/fold (min 4 max 26px; gradient mist→teal; expanding tăng % train theo i), note 3 tông: N<2 đỏ "fewer than 2 folds — walk-forward degenerates…"; N>20 vàng "{N} folds ⇒ {N} studies × {trials} trials = {tổng} declared trials. The portal renders this at scale… budget engine time, not screen space."; thường: "{N} studies × … · mist = train ({mode}), teal = OOS step." Không parse được → xám "fold count is computable once split mode is a date…".
- optimization_mode 5 pill + optimization_schedule 3 pill — schedule invalid với mode: pill DASHED gạch ngang + title lý do; đổi mode tự sửa schedule về hợp lệ đầu tiên.
- Timeline mini (mọi protocol): thanh ngang các đoạn IS xám/OOS xanh/Holdout vàng + số bar mỗi đoạn (từ timeframe ms).
- Route tape: bước này hiển thị note thay preview: span = tape (single-pass) — các field search bị bỏ qua (đúng §5.2 note).

## 8. Step 6 · Parameters (sweep/pin)
Bảng cột: `param 96 · declared 118 · dim 104 (nút sweep|pin) · low/value 90 · high 90 · step 44 · status flex`.
- sweep: low+high input trong declared bounds; narrow hợp lệ (status vàng "narrowed — allowed"); vượt → đỏ "outside the declared space — refused" (+viền input đỏ).
- pin: low thành value duy nhất, high `—`, step `—`; status vàng "pinned at {v} — fixed, out of sweep dims"; pin ngoài bounds → đỏ "pin value outside declared space — refused".
- categorical: declared `[true, false]`; sweep = mọi level (input mờ khoá); pin = chọn level (input value).
- Header phải: `{swept} swept · {pinned} pinned · sweep ceiling 8` — ceiling đếm SWEPT; >8 → blocking "sweep dims {n} > 8 — pin params or drop entries."
- Nút sweep/pin: mini pill 2 nút flex-1 (on xanh / on-warn vàng cho pin).
- Nguồn bounds: parameter_space của av_ (maximal surface từ màn 14) — FE không thêm/bớt param; chỉ đổi dim/khoảng.

## 9. Step 7 · Optimization
- 3 input: Optuna trials (ceiling 2000 — vượt: "The engine release publishes a ceiling of 2000 trials.") · Early stopping ("stagnation patience — actual trials may land lower") · Random seed (bắt buộc khi strategy `seed_required` — thiếu: "The strategy declares determinism.seed_required — a fixed random seed is required.").
- Chips "pinned by protocol": candidate_selection_metric = robust_decay · top_is_fraction = 0.1 · decay λ=γ=0.5 · scoring_backend = endpoint.
- **Accordion `optimization_config — full surface`** (nền #faf9f5):
  - Header nút: label + summary mono (`all defaults from er_quantbt_1_1_1 — nothing serialized` / `{n} override(s) · rest = release defaults`) + caret `expand ▾ / collapse ▴`.
  - 4 nhóm (label 9px uppercase #7a8699): **study** (n_trials 400, early_stopping_rounds 200, early_stopping_min_trials 800, seed 42, directions `(maximize,)`, `n_jobs 1 LOCKED`), **sampler** (name tpe, n_startup_trials 120, multivariate·group false·false, constraint_mode auto — note random/grid/cmaes+constraints REQUIRE post_filter, seeds multi `(None,41,42,43,44)`), **objective & constraints** (scoring_backend endpoint, value_metrics `(sharpe,)` — strict/MissingOptimizationMetricError, min_trades_constraint 100, max_drawdown_constraint 25.0, min_trades_per_year 100, trade_penalty_factor 0.5, use_numba true), **candidate selection** (selector.mode robust_decay(mode default), top_quantile .10, neighborhood_radius .10, min_neighbor_count 8, seed_consensus 3, instability_penalty·worst_weight .25·.25, initial_trials warm-start 0, effective_params_builder off).
  - Hàng: key mono 210px (title = note) · input 150px (viền vàng khi edited) hoặc value khoá · badge 64px `default`(mờ)/`OVERRIDE`(vàng)/`LOCKED`(đỏ) · note 9.5 ellipsis.
  - Semantics: input về đúng default hoặc rỗng ⇒ XOÁ override khỏi map. Footer: "Defaults come from the release manifest… an untouched field is NOT serialized… Missing objective metrics raise MissingOptimizationMetricError — there is no silent fallback."

## 10. Step 8 · Review & run + Review rail (cột phải, mọi bước)
Review rail rows (mono label 150px + value):
`alpha binding` (PUBLISHABLE…/scratch NOT_PUBLISHABLE) · `execution route` `{route} → {contract}` (+" · tape-driven, single-pass") · `strategy_id` (+" (pinned by av)") · `dataset · symbol · tf` · `protocol` · `windows` · `fold plan` · `parameter_space` `{n} entries · {swept} swept · {pinned} pinned (sweep ceiling 8)` · `mode × schedule` (+claim forecast: chuỗi claim + `cert ceiling {A-D}` màu theo hạng) · `trials · early stop · seed` · `optimization_config` (`release defaults — nothing serialized` / `{n} overrides ({keys}) — rest engine defaults`) · `account · execution`.
- Blocking tổng = routeError||strategyError||dataError||windowError||parameterError||trialsError||seedError → khối đỏ + nút preflight disabled.
- Preflight: `POST /api/runs/preflight` với draft → rows gate PASS/FAIL verbatim; valid → nút `create run` (primary vàng đậm) → `POST /api/runs` → điều hướng 03. Payload = draft + SPARSE cfg overrides; hash config sha256 hiển thị.

---

## 11. TS architecture
```
<NewRunPage>
  const release = useReleaseManifest();      // routes/modes/defaults — suspense
  const alphas  = useAlphaRegistry();
  const [draft, patch] = useRunDraft();      // immer reducer; mọi patch → preflightRan=false
  <WizardBar steps={validate(draft)} …/>
  <StepPanel/> | <ReviewRail rows={reviewRows(draft, release)}/>
```
- `RunDraft` = 1 object phản chiếu payload POST; validators thuần per-step trả `string|null` (message verbatim §6–9); `stepsState = validators(draft)`.
- `cfgOverrides: Record<string,string>` sparse; selector `serializePayload(draft, cfg)` dùng cho CẢ preview lẫn POST (một nguồn).
- Per-route form đăng ký qua map `ROUTE_FORMS: Partial<Record<RouteId, FC<…>>>` — thêm form mới không sửa switch.
- Draft persist sessionStorage (key theo user) — reload không mất khai báo; TTL 24h.

## 12. Edge cases
| Case | Hành vi |
|---|---|
| Manifest fetch lỗi | trang lỗi có retry — wizard KHÔNG mở với data giả |
| Alpha registry rỗng | Context gợi ý `import new version →` (14); scratch vẫn dùng được |
| av_ DRAFT được chọn | cho phép chạy; note vàng; review rail vẫn PUBLISHABLE=false cho publish? — KHÔNG: DRAFT vẫn PUBLISHABLE chip nhưng note cảnh báo activate trước publish (đúng hi-fi) |
| Route options qua URL | routeError chặn + card lý do |
| trials="" | coi 0 — fold note dùng "?" |
| Viewport hẹp | rail xuống dưới (flex wrap); bảng params cuộn ngang trong card |

## 13. Anti-patterns (cấm)
1. Cấm serialize default (payload phình + drift theo release).
2. Cấm FE tự thêm/bớt param ngoài maximal surface của av_.
3. Cấm ẩn control invalid — luôn hiện + lý do (dashed/strike + title).
4. Cấm tính fold plan như số chính thức — luôn kèm "server derives the authoritative plan at preflight".
5. Cấm dropdown route — grid card có desc/contract là bắt buộc (route là quyết định lớn).
6. Cấm tự sửa message validator — verbatim để khớp preflight server.

## 14. Acceptance checklist
1. [ ] Bound av_ → strategy pin đúng entrypoint; PINNED OUT không click được; scratch mở tự do + banner + chip title đổi.
2. [ ] 14 card route đúng badge/tone; options disabled + lý do; tape route đổi note methodology + review rail.
3. [ ] 4 form route ghi vào draft; đổi route giữ cfg các route khác (không reset chéo).
4. [ ] Sweep/pin: đếm swept/pinned đúng mọi tổ hợp; >8 swept chặn; pin ngoài bounds chặn; categorical pin được level.
5. [ ] Fold preview: quarterly 2022→2026-08 ≈ 18; monthly → cảnh báo vàng; N<2 đỏ; đổi windowMode đổi gradient.
6. [ ] Accordion: sửa 1 field → OVERRIDE + counter 1 + review rail liệt kê key; xoá về default → biến mất khỏi payload preview; n_jobs bất khả sửa.
7. [ ] Claim forecast đổi đúng ma trận mode×schedule (per_fold_causal→B, per_fold_decay→C, global→C/D-mode5) TRƯỚC khi preflight.
8. [ ] Blocking gom đúng thứ tự route→strategy→data→window→param→trials/seed; preflight verbatim; create → 03.
9. [ ] Reload giữa chừng giữ draft; URL step deep-link được (`?step=route`).
10. [ ] Console sạch; không tràn ngang 660px; payload preview == POST body (test so sánh).

---

## 15. Per-element CSS ledger (bổ sung ngoài grammar chung đã nêu)

### 15.1 Wizard bar
- `.nr-steps`: display flex; gap 4px; border 1px solid #e3e0d7; radius 6px; background #fff; box-shadow chuẩn; padding 5-6px; overflow-x auto
- `.nr-step`: display flex; align-items center; gap 8px; border 0; radius 6px; padding 6px 12px; flex none
- `.nr-step[data-current=true]`: background #e2edf0
- `.nr-step .num`: width 20px; height 20px; radius 999px; mono 10px 700; border 1.5px solid; display inline-flex; center
- `.nr-step .num[data-state=valid]`: viền/chữ #1e7b4f; nội dung "✓"
- `.nr-step .num[data-state=current]`: viền/chữ #0f4c5c; nội dung số
- `.nr-step .num[data-state=error]`: viền/chữ #b43a3a; nội dung "!"
- `.nr-step .sub`: 9px; #939db0; [data-state=error] → #b43a3a "needs attention"

### 15.2 Step card & field
- `.nr-card`: border 1px solid #e3e0d7; radius 8px; background #fff; shadow chuẩn; padding 12px 14px; flex column; gap 10px
- `.nr-card > h3`: font-size 12px; 600; uppercase; letter-spacing .05em
- `.nr-label`: 10px uppercase .07em 500 #939db0
- `.nr-input, .nr-select`: border 1px #e3e0d7; radius 6px; background #fff; padding 5px 8px; mono 11px; color #1c2532
- `.nr-input[data-bad=true]`: border #b43a3a
- `.nr-hint`: 9.5px #939db0
- `.nr-error`: border 1px #b43a3a; radius 6px; background #f7e8e8; color #b43a3a; padding 6px 10px; font-size 11.5px

### 15.3 Route grid
- `.nr-route`: width calc(25% − 5px); min-width 200px; flex column; gap 3px; text-align left
- `.nr-route`: border 1px solid #e3e0d7; radius 6px; background #fff; padding 8px 10px
- `.nr-route[data-active=true]`: border #0f4c5c; background #e2edf0
- `.nr-route[data-blocked=true]`: border dashed #c9c5ba; background #faf9f5; opacity .6; cursor not-allowed
- `.nr-route .name`: mono 10.5px 600 — .desc: 9.5px #4e5a6e lh 1.4 — .meta: mono 8.5px #939db0
- `.nr-route .badge`: mono 8.5px 700; radius 3px; padding 0 4px; viền+chữ theo tone (ok #1e7b4f · warn #9a6a1f · rust #0f4c5c · blocked #b43a3a)
- `.nr-routepanel`: border 1px #efede4; radius 6px; background #faf9f5; padding 10px 12px; flex column; gap 8px

### 15.4 Params table
- header row: 9.5px uppercase .06em #939db0; border-bottom #efede4
- cột: param 96 · declared 118 · dim 104 · low 90 · high 90 · step 44 · status flex (padding-left 12)
- `.nr-dim`: display flex; gap 3px — nút con flex 1; mono 9px; radius 4px; padding 1px 0
- dim on: viền/nền/chữ theo grammar (sweep xanh, pin vàng-warn)
- row: mono 11px; padding 3px 0; border-bottom #f4f2ec
- status: 10px Inter; màu: refused #b43a3a · narrowed/pinned #9a6a1f · declared #939db0

### 15.5 Accordion optimization_config
- shell: border 1px #efede4; radius 6px; background #faf9f5; overflow hidden
- header button: width 100%; flex; gap 10px; padding 8px 12px; text-align left; background none; border 0
- header summary: mono 9.5px #4e5a6e — caret: mono 10px #0f4c5c
- group: border-top 1px #efede4; padding 7px 12px — label nhóm: 9px uppercase .08em 700 #7a8699
- row: flex; align-items center; gap 10px; padding 2px 0
- key: mono 10px #4e5a6e; width 210px; title=note
- input: width 150px; mono 10px; viền #e3e0d7 → edited #9a6a1f
- locked value: mono 10px #939db0 (span, không input)
- badge 64px center mono 8.5 700: default (viền #efede4 chữ #c9c5ba) · OVERRIDE (viền/chữ #9a6a1f nền #fdfbf5) · LOCKED (viền/chữ #b43a3a)
- note: 9.5px #939db0; ellipsis 1 dòng; full ở title
- footer: border-top #efede4; padding 6px 12px; 10px #939db0; lh 1.5

### 15.6 Review rail
- sticky top 70px (dưới topbar 56 + 14 gap); flex column; gap 12px; min-width 340; max-width 430
- row: flex; gap 12px; font-size 11.5px; border-bottom #f4f2ec; padding 3px 0
- key: mono 10px uppercase #939db0; width 150px flex none
- claim forecast: chuỗi claim mono + chip cert ceiling (viền 1.5 màu hạng: B #9a6a1f · C #b4772f · D #b43a3a)
- preflight row PASS: chữ #1e7b4f mono — FAIL: #b43a3a + câu gate verbatim
- nút create: nền #9a6a1f; chữ #fff; mono 11px 600; padding 9px 14px; radius 6px; disabled → dashed #c9c5ba nền #faf9f5 chữ #939db0

## 16. Pitfalls — chớ làm sai

1. WRONG: giữ state riêng mỗi step rồi merge lúc submit. RIGHT: MỘT `draft` duy nhất; step chỉ là view.
2. WRONG: serialize toàn bộ optimization_config. RIGHT: chỉ overrides; test so payload preview == POST body.
3. WRONG: default accordion lấy hardcode FE. RIGHT: lấy từ `releases/current.optimizer_defaults` — release đổi, default đổi.
4. WRONG: disable = ẩn (route options, schedule invalid, PINNED OUT). RIGHT: hiện + strike/dash + reason ở title và/hoặc trên card.
5. WRONG: tự map entrypoint→strategy ở FE bằng string parse. RIGHT: registry gửi `strategyId` sẵn trong AlphaVersion.
6. WRONG: đổi bound→scratch giữ nguyên strategy pin state cũ. RIGHT: scratch mở tự do NGAY; quay lại bound → pin lại theo av_ (draft.strategyId có thể bị ghi đè — cảnh báo inline nếu khác).
7. WRONG: fold preview coi là số chính thức (đưa vào payload). RIGHT: preview only; payload gửi tham số thô; server derive.
8. WRONG: chặn gõ số ngoài bounds (input cứng). RIGHT: cho gõ, hiện refused đỏ — người dùng thấy vì sao sai.
9. WRONG: validate windows bằng Date so sánh lỏng (timezone lệch). RIGHT: so CHUỖI datetime-local như hi-fi (half-open, string equality biên).
10. WRONG: nút create bấm được rồi mới báo lỗi tổng. RIGHT: blocking sống theo draft; create chỉ enable khi preflightValid.
11. WRONG: preflight kết quả giữ lại sau khi sửa draft. RIGHT: mọi patch → preflightRan=false (nút quay về "run preflight").
12. WRONG: seed optional khi strategy yêu cầu (submit rồi server chửi). RIGHT: seedError chặn tại step 7 với câu verbatim.
13. WRONG: route tape vẫn cho sweep params/optimization đầy đủ. RIGHT: methodology collapse — step windows hiện note tape-span; optimization vẫn khai được nhưng review rail ghi tape-driven.
14. WRONG: mất draft khi F5. RIGHT: sessionStorage TTL 24h; nút "discard draft" rõ ràng ở Review.
15. WRONG: gọi manifest mỗi bước. RIGHT: 1 lần, cache theo engine_release_id; ETag.
16. WRONG: dropdown 14 route. RIGHT: grid card — quyết định lớn cần diện tích.

## 17. Test matrix

| ID | Precondition | Action | Expected |
|---|---|---|---|
| T01 | fresh | mở /runs/new | step Context; chip PUBLISHABLE · av_0_9_3; passport strip đủ 5 trường |
| T02 | bound | mở Strategy | mom_breakout_v3 badge "from av_"; 1 card PINNED OUT dashed; 1 BLOCKED đỏ; note pin vàng |
| T03 | — | bấm scratch | banner NOT_PUBLISHABLE; title chip đổi; Strategy hết pin (badge runnable) |
| T04 | — | chọn av_0_3_0 (DRAFT) | note vàng DRAFT; vẫn đi tiếp được |
| T05 | Route | chọn options | không chọn được; title lý do deferred |
| T06 | Route | chọn intrabar | form 3 field + cột intent; note link Execute Replay; review rail route đổi |
| T07 | Route | chọn fill_replay | summary tape; step Windows hiện note tape-span; review rail "tape-driven, single-pass" |
| T08 | Data | timeframe 15m với mom (declared 1h,4h) | lỗi "The strategy declares only 1h, 4h." + pill Data "!" |
| T09 | Windows 3W | sửa OOS start ≠ IS end | lỗi verbatim; pill "!" |
| T10 | Advanced | quarterly, 2022-01-01→2026-08-14 | badge ≈18; strip 18 cell; note thường |
| T11 | Advanced | monthly | badge vàng >20; note budget |
| T12 | Advanced | frequency "weekly" | note xám "computable once…"; badge ≈0 không đỏ chặn |
| T13 | Params | pin risk_pct | counter swept 5 · pinned 1; status "pinned at 0.25 — fixed, out of sweep dims"; step "—" |
| T14 | Params | low window = 5 (declared 12) | refused đỏ; blocking; pill Parameters "!" |
| T15 | Params | pin cả 6 → sweep 0 | hợp lệ (calibration-style); ceiling không chặn 0 |
| T16 | Params giả 9 swept (fixture 9 params) | — | blocking "sweep dims 9 > 8 — pin params or drop entries." |
| T17 | Optimization | trials 2500 | lỗi ceiling 2000 |
| T18 | Optimization | xoá seed (strategy seed_required) | lỗi determinism verbatim |
| T19 | Accordion | sửa n_startup_trials 120→200 | badge OVERRIDE; header "1 override"; review rail liệt kê key; payload chỉ chứa key đó |
| T20 | Accordion | sửa về 120 | override biến mất; "all defaults… nothing serialized" |
| T21 | Accordion | n_jobs | không input; badge LOCKED |
| T22 | mode×schedule | mode_2 chọn per_fold_causal | pill dashed strike; title lý do; không set được |
| T23 | mode 5 + global | xem forecast | claim NONE_FULL_SAMPLE_CALIBRATION; ceiling D đỏ |
| T24 | đủ hợp lệ | preflight | rows PASS; nút create enable |
| T25 | preflight xong, sửa 1 field | — | preflightRan=false; create disable lại |
| T26 | create | bấm | POST body == preview (deep equal); redirect /runs/R-…/progress |
| T27 | F5 giữa chừng | reload | draft khôi phục; step giữ (?step=) |
| T28 | manifest 500 | mở màn | `unavailable` + retry có chủ đích; không mở wizard data giả |
| T29 | 660px | resize | rail xuống dưới; params/accordion cuộn ngang trong card; không tràn trang |
| T30 | axe | scan | mọi input có label; step pill aria-current="step"; 0 serious |
| T31 | manifest/registry 401 hoặc 403 | mở màn hoặc refresh | `denied`; giữ local draft chưa gửi, panel shell còn nguyên, preflight/create disabled; không retry tự động, không render empty/data cũ trái scope |
| T32 | manifest/registry/preflight/create 502, 503, timeout hoặc offline | thử request | `unavailable`; giữ draft, không fixture fallback, retry do người dùng kích hoạt và bị hủy khi unmount/scope đổi |
| T33 | server trả manifest/registry partial có lý do | mở step phụ thuộc | `partial`; chỉ control phụ thuộc bị disable + reason nguồn, các control/data đã trả vẫn render; không suy field thiếu là default/zero |
| T34 | response giữ lại có `as_of`/freshness source | refresh thất bại sau response hợp lệ | `stale`; hiện timestamp/age nguồn, giữ composition; create cần preflight mới, không gọi stale nếu source không gửi metadata |
| T35 | create 409 hoặc 422 | submit | `terminal` cho request hiện tại: 409 giữ draft + reload manifest; 422 map `field_path` về step đầu tiên; không generic error thay cả route |

## 18. Guide plan cho agent code

1. Types từ manifest trước: codegen `RouteId/ModeId/ScheduleId/OptimizerDefaults` từ `releases/current` schema (zod) — chặn drift bằng test schema.
2. `useRunDraft` reducer + validators thuần + `serializePayload` — unit T08/T09/T13–T18/T19-T20/T26-so-payload TRƯỚC UI.
3. WizardBar + StepPanel switch + ReviewRail (rows là selector thuần từ draft) — storybook từng step với fixture draft.
4. Context step (alphas query + passport) — T01–T04.
5. Route step (grid từ manifest + ROUTE_FORMS map) — T05–T07.
6. Data/Windows (+fold preview pure fn, test bảng 10 case ranh giới tháng) — T08–T12.
7. Params sweep/pin — T13–T16.
8. Optimization + accordion (cfg sparse map) — T17–T23.
9. Review + preflight + create (msw) — T24–T27.
10. State semantics/a11y/perf — T28–T35; fixture phải tách `denied`, `unavailable`, `partial`, `stale`, `terminal` theo [state contract chung](../RESEARCH_SCREEN_STATE_SEMANTICS_V1.md).
11. DoD: §14 checklist + T01–T35 xanh + payload golden-file test + screenshot diff các step ≤1%.

## 19. Phi phạm vi
- Không template/preset lưu server (v2).
- Không clone-from-run (v2 — vào từ 04 "re-run with changes" sau).
- Không multi-symbol chọn nhiều symbol một run (portfolio route khai symbols ở submit — v1 hi-fi chỉ minh hoạ single).
- Không upload tape ở đây (tape route: attach ref ở submit — modal v2).

## 20. Wizard state-transition table (máy trạng thái chính thức)

| Từ | Sự kiện | Đến | Side effects |
|---|---|---|---|
| context | pick alpha | context | avId=versions[0]; strategyId=av.strategyId; preflight reset |
| context | pick av | context | passport re-render; preflight reset |
| context | bound→scratch | context | binding chip đổi; strategy unpin; preflight reset |
| context | scratch→bound | context | strategyId := av.strategyId (ghi đè + inline note nếu khác) |
| strategy | click card hợp lệ | route | strategyId, timeframe=tfs[0]; preflight reset |
| strategy | click PINNED OUT/BLOCKED | strategy | no-op |
| route | click card thường | route | route=id; KHÔNG reset routeCfg khác |
| route | click options | route | no-op (blocked) |
| bất kỳ | sửa field bất kỳ | như cũ | preflightRan=false; validators re-run; pills cập nhật |
| review | preflight PASS | review | preflightValid=true; create enable |
| review | preflight FAIL | review | rows FAIL verbatim; create disable |
| review | create 201 | (rời màn) | clear sessionStorage draft; push /runs/{id}/progress |
| review | create 4xx/5xx | review | error khối đỏ với message server; draft giữ |

Điều kiện enable nút:
- `run preflight`: !blockingError
- `create run`: preflightValid && !blockingError

## 21. API sequence (text diagram)

```
mount ── GET /releases/current ──▶ manifest (routes, modes, matrix, defaults, ceilings)
     └─ GET /api/v1/alphas ─────▶ registry (versions + states + strategy binding)
edit  ── (không gọi mạng) — validators thuần trên draft
review ─ POST /api/runs/preflight {payload} ─▶ [{gate, state, message}]
create ─ POST /api/runs {payload} ─▶ 201 {run_id} ─▶ nav 03
```
- Payload duy nhất: `serializePayload(draft, cfgOverrides)` — golden-file test giữ ổn định schema.
- Header `X-Engine-Release: er_quantbt_1_1_1` gửi kèm create — server từ chối nếu lệch manifest client đang cầm (409 → banner "release changed — reload manifest", nút reload giữ draft).

## 22. Copy inventory — VERBATIM các chuỗi hệ trọng

- Chip title: "PUBLISHABLE · {av}" / "NOT_PUBLISHABLE · scratch"
- Scratch banner: "Scratch runs iterate freely and stay full evidence for you — but no release candidate can ever be composed from one. Strategy pick below becomes free."
- Pin note: "Strategy is pinned by {av} (entrypoint {entry}) — switch to scratch in Context to explore other strategies."
- Route method notes: "strategy-param route — walk-forward search applies" / "tape-driven — single-pass replay; the walk-forward step collapses to the tape span" / "deferred — not runnable this round"
- Params statuses: "declared bounds" / "narrowed — allowed" / "outside the declared space — refused" / "pinned at {v} — fixed, out of sweep dims" / "pin value outside declared space — refused" / "categorical — levels fixed by declaration" / "pinned level — out of sweep dims"
- Ceiling error: "sweep dims {n} > 8 — pin params or drop entries."
- Trials/seed errors: "The engine release publishes a ceiling of 2000 trials." / "The strategy declares determinism.seed_required — a fixed random seed is required."
- Windows errors (3W): "OOS must begin exactly where IS ends." / "Holdout must begin exactly where OOS ends." / "Every window must have a positive length." / "A holdout end-exclusive is required for the historical query."
- Fold notes: xem §7 (3 tông + fallback) — chép nguyên từ hi-fi.
- Accordion summary: "all defaults from er_quantbt_1_1_1 — nothing serialized" / "{n} override(s) · rest = release defaults"
- Accordion footer: "Defaults come from the release manifest (er_quantbt_1_1_1) — an untouched field is NOT serialized into the payload; the engine's own default applies and the review rail says so. Missing objective metrics raise MissingOptimizationMetricError — there is no silent fallback."
- Review rail optimization_config: "release defaults — nothing serialized" / "{n} overrides ({keys}) — rest engine defaults"
- Review rail fold plan: "≈ {n} outer folds ({frequency}, {mode}) — server derives the authoritative plan at preflight"
- Data notes: "Historical source — backtest only. Realtime and paper are separate services." / "Timeframe and seed are checked in this form. Required columns and warmup are checked by the server at preflight — the Review step names whichever gate failed."
- Protocol note: "Showing only the protocols the installed engine release certifies (2). An uncertified protocol is not offered."
- Header note: "routes, protocols and ceilings read from the INSTALLED engine release — quantbt-engine==1.1.1 · er_quantbt_1_1_1"
- Subtitle: "Bind the alpha version, pick how orders come to exist, then the methodology. Each step validates on its own — a problem is reported where it can be fixed."

## 23. Fold-preview pure function — bảng case ranh giới (unit bắt buộc)

| splitMode | dataEnd | freq | N kỳ vọng |
|---|---|---|---|
| 2022-01-01 | 2026-08-14 | quarterly | 18 |
| 2022-01-01 | 2026-08-14 | monthly | 55 (vàng) |
| 2022-01-01 | 2026-08-14 | yearly | 4 |
| 2022-01-01 | 2022-06-30 | quarterly | 1 (đỏ degenerate) |
| 2022-01-15 | 2022-04-10 | monthly | 2 (biên giữa tháng: floor theo tháng lịch) |
| 2022-01-01 | 2022-01-01 | monthly | 0 (đỏ) |
| not-a-date | … | quarterly | fallback xám |
| 2022-01-01 | … | weekly | fallback xám (freq ngoài map) |
| dataEnd < splitMode | — | any | 0 (đỏ) |
| windowMode rolling vs expanding | — | — | N như nhau; chỉ gradient cell đổi |

## 24. Ràng buộc hiệu năng
- Validators + reviewRows chạy < 2ms cho draft đầy (memo theo draft ref — immer structural sharing).
- Route grid 14 card: render tĩnh, không ảo hoá.
- Accordion 26 hàng: render khi mở; đóng = unmount (giữ cfg trong state, không trong DOM).
- Không re-render toàn wizard khi gõ input: field bind qua local state + commit onBlur/onChange-debounce 120ms vào draft (đo bằng why-did-you-render trong dev).

> End of spec 02 · v1.1 · pair with hi-fi `QuantBT 02 New Run Preflight.dc.html`.

## 25. Bảng field draft → payload (đối chiếu từng key khi review PR)

| Draft field | Payload key | Điều kiện serialize |
|---|---|---|
| — (producer discriminator) | schema_version = `research.requested-spec.v1` | luôn; P02 structural contract, không phải control UI |
| alphaId / avId / scratch | alpha_binding {alpha_id, alpha_version_id} \| null | scratch ⇒ null + flag not_publishable=true |
| strategyId | strategy_id | luôn |
| route | execution_route | luôn |
| routeCfg.ib.* | route_params.intrabar {level_mode, same_bar_policy, tick_size} | chỉ khi route=intrabar_bracket |
| routeCfg.pf.* | route_params.portfolio {mode, sizing} | chỉ khi route=portfolio |
| routeCfg.rx.* | route_params.reactive {runtime, audit_mode} | chỉ khi route=reactive |
| routeCfg.dc.* | route_params.dca {base_order_usd, safety_orders, step_scale} | chỉ khi route=dca_ladder |
| datasetId/symbol/timeframe | data {dataset_id, symbol, timeframe} | luôn |
| protocol | protocol | luôn |
| windows (3W) | windows {is, oos, holdout} | protocol=three_window_decay |
| advanced.* | walk_forward {start, end_exclusive, split_mode, frequency, window_mode} | protocol=advanced |
| advanced.optimizationMode/Schedule | optimization_mode / optimization_schedule | luôn (3W pin mode_1×global theo template) |
| edits (params) | parameter_space_overrides [{name, kind: sweep\|pin, low, high?, value?}] | CHỈ param có edit; param nguyên bản không gửi |
| trials/earlyStopping/seed | optuna_trials / early_stopping / random_seed | luôn (early null nếu rỗng) |
| cfgOverrides | optimization_config {sparse keys} | CHỈ overrides |
| — | client {engine_release_id, config_digest} | luôn — server verify |

Golden test: 4 fixture draft (bound-3W-default · scratch-adv-intrabar-3overrides · tape-fill_replay · portfolio-pin-all) → snapshot payload JSON, review khi đổi.

## 26. Quan hệ với engine (nhắc để không hiểu sai)
- Portal KHÔNG gọi quantbt-engine trực tiếp — mọi thứ qua portal backend (QuantBTGateway) và chỉ qua public QuantBTEndpoint factories.
- optimization_config keys map 1:1 sang OptimizationConfig/SamplerConfig/RobustSelectionConfig của engine (docs/optimization.md) — cấm đặt tên khác.
- Route grid là ánh xạ của endpoint factory list (§ENGINE_ROUTE_MATRIX.md bảng 1) — thêm factory = server thêm entry manifest.
- Ceilings (trials 2000, sweep dims 8, protocols certified) là dữ liệu manifest, không hằng số FE.

> Hết. Spec 02 dài hơn tiêu chuẩn vì màn này là cửa khai báo của toàn hệ.

## 27. Keyboard map
- Tab: đi theo DOM — wizard bar → panel bước → review rail.
- Trong wizard bar: Arrow Left/Right di chuyển giữa pill (roving tabindex); Enter/Space chọn bước.
- Pill có `aria-current="step"` ở bước hiện tại; pill lỗi có `aria-invalid="true"`.
- Trong route grid: Arrow 4 hướng theo lưới; Enter chọn; card blocked nhận focus nhưng Enter no-op + aria-disabled.
- Trong bảng params: Tab đi qua dim buttons → low → high theo hàng; Escape trong input khôi phục giá trị trước đó (commit-on-blur).
- Accordion header: Enter/Space toggle; `aria-expanded` đúng trạng thái.
- Cmd/Ctrl+Enter tại Review: chạy preflight (nếu enable); KHÔNG bind phím cho create (chống submit nhầm).

## 28. Error-recovery table
| Tình huống | Khôi phục |
|---|---|
| manifest/registry 401 hoặc 403 | state `denied`; giữ draft local chưa gửi, tắt preflight/create/PATCH liên quan, hiển thị reauth/access path; không retry nền hoặc render `empty` |
| manifest/registry/preflight/create 502, 503, timeout hoặc offline | state `unavailable`; khối lỗi trong panel + retry do người dùng chọn; draft nguyên, không dùng fixture/mock/fallback |
| manifest/registry partial có reason nguồn | state `partial`; chỉ control phụ thuộc disable + reason; phần payload/rail đã có vẫn render, không giả default |
| response cũ có `as_of`/freshness nguồn | state `stale`; hiện timestamp/age; giữ draft nhưng yêu cầu preflight mới trước create; không gắn stale nếu source không nói freshness |
| preflight 500 | state `unavailable`; khối lỗi + retry có chủ đích; draft nguyên |
| create 409 release drift | banner "release changed — reload manifest"; nút reload manifest GIỮ draft; validators re-run trên manifest mới; field nào thành invalid thì pill "!" chỉ đúng chỗ |
| create 422 (server validator) | map message vào đúng step qua `field_path` server trả; nhảy tới step đầu tiên lỗi |
| sessionStorage đầy/hỏng | bỏ persist im lặng; console.debug; wizard vẫn chạy in-memory |
| alphas registry rỗng | Context hiện gợi ý import (link 14); scratch vẫn dùng |
| mất mạng giữa wizard | không chặn nhập; preflight/create fail có retry |

### 28.1 State invariants bắt buộc
- Dùng đúng bảy state tại [state contract chung](../RESEARCH_SCREEN_STATE_SEMANTICS_V1.md); `DRAFT`, `preflightRan` và lỗi validator local vẫn là domain/local state riêng.
- `denied` không tự refresh/stream retry; chỉ reauth hoặc scope change do người dùng khởi tạo mới được thử lại.
- `unavailable` không biến thành `terminal` chỉ vì timeout; retry phải bounded và hủy khi route unmount.
- `partial`/`stale` chỉ hợp lệ khi server trả explicit reason/freshness. Khi không có metadata đó, dùng `unavailable`, không suy diễn.
- Ở mọi state, giữ wizard/review rail theo hi-fi; thay content trong panel, không thay cả route bằng JSON/envelope.

## 29. Definition of Done (chốt PR)
1. [ ] T01–T35 xanh; golden payload 4 fixture khớp.
2. [ ] Bảng §25 đối chiếu đủ — không key thừa/thiếu trong payload.
3. [ ] Copy §22 diff tự động = 0 khác biệt.
4. [ ] Screenshot diff 8 step ≤ 1% với hi-fi (1280) + không tràn 660.
5. [ ] axe 0 serious; keyboard map §27 hoạt động.
6. [ ] Bundle route < 90KB gzip (không kéo chart libs vào màn này).

> End of spec 02 · v1.1 · pair with hi-fi `QuantBT 02 New Run Preflight.dc.html`.
