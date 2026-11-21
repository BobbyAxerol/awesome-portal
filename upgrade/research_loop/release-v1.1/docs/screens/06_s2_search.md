# SPEC 06 · S2 Search & Selection — `QuantBT 06 S2 Search and Selection.dc.html`

> Màn dày nhất về phương pháp: Stage A (search trên IS) và Stage B (selection trên pool đã đóng), ngăn bởi FREEZE LINE. Guide plan cho agent code; copy VERBATIM; số = CSS px.
> Luật gốc: (1) một run là MỘT mode — switcher chỉ mở demo run khác để học cách đọc; (2) không chữ "OOS" nào dưới objective IS-only; (3) UI không tính lại J nào — mọi term từ SelectionTraceV1; (4) thiếu field ⇒ panel degraded nói rõ, không suy diễn.

---

## 1. Meta

| Key | Value |
|---|---|
| File hi-fi | `QuantBT 06 S2 Search and Selection.dc.html` |
| Route | `/research/quantbt/runs/{id}/search` |
| Vai trò | Deep-dive Stage 2: search space + coverage, trial surface, tiến trình sampler, phân bố per-param, importance, freeze line, pool funnel, công thức J per mode (KaTeX), best ≠ selected, θ* journey, trial ledger |
| Shell | Có; content max-width **1560px** (màn duy nhất — grid 3 cột Stage A · freeze · Stage B) |
| Inbound | 04 tab search · 05 next-stage · 03 stage rail S2 · 12 deep-link `#mode=&schedule=` |
| Outbound | breadcrumb 04 (giữ hash) · next-stage `S3 · Freeze →` (07) · ledger row → cursor trial · evidence link copy |
| Hash | đọc/ghi `#fold=&trial=&pick=&schedule=` (+mode khi demo switcher) |
| Tweaks (hi-fi) | mode (5) · schedule (3) · scale 5/32 folds |
| Console chuẩn | 0 error/warning; KaTeX render lỗi → fallback chuỗi mono (không vỡ trang) |

### 1.1 Grid tổng
```
[Stage A col — flex 1.08]  [freeze line 52px]  [Stage B col — flex 1]
```
- < 1100px: 3 cột xếp dọc — freeze line xoay ngang (border-top dashed + label giữa).
- Panel thứ tự Stage A: A1 space → A2 surface → A3 progression → A4 distributions → A5 importance (+A6 interactions nếu có).
- Stage B: B1 pool freeze → B2 formula (per mode) → B3 best≠selected → B4 θ* journey.
- Dưới grid: trial ledger full-width; rules footer.

## 2. Mode × schedule header (card trắng đầu trang)
- Hàng 1: 5 pill mode + vách + 3 pill schedule + note phải: "one run is one mode — switching here opens another demo run to learn the reading; a real run's mode is fixed at submit."
- Schedule invalid với mode: pill DASHED + line-through + title lý do (map SCHED_REASON):
  - per_fold_decay: "cần OOS ranking per fold — objective của mode này IS-only hoặc không có fold"
  - per_fold_causal: "cần nested inner folds per fold — mode này không định nghĩa chúng"
- Hàng 2 (claim mini): validation_claim · chronological_claim · oos_used_for_selection · **trạng thái cột OOS** (4-state chip: `selection input` vàng / `retrospective` vàng / `report only` xám / `withheld` xám-đậm / `n/a` đỏ) · scoring_backend (proxy forced → vàng) · candidate_selection_metric + tag CONFIRMED/INFERRED.
- Hàng 3 (data-usage diagram): mỗi fold 1 cặp ô train/test mini pulse theo mode-schedule (mode 5: 1 khối full, không ô test) + câu diagramNote theo claim (4 câu verbatim trong hi-fi logic).

## 3. Stage A panels

### A1 · Search space as declared
- Bảng: `param 86 · kind 112 · low…high 96 · step 44 · levels 56 · θ* + vị trí trong range (flex)`.
- θ* tick trên thanh range: vạch 2px xanh #1e7b4f; SÁT BIÊN (≤6% hoặc ≥94%) → đỏ + note "SÁT BIÊN — nới range?"; gần biên (18/82%) → vàng.
- Coverage row: grid_size (dynamic float → "unbounded" vàng) · trials 512/600 · early stopping · sampler TPE multi-seed · rejected (grid unbounded, cmaes categorical).
- coverageNote verbatim: "atr_mult là dynamic float ⇒ grid_size = unbounded… Mọi kết luận bên dưới là về vùng đã sample, không phải toàn bộ space." (bản EN trong hi-fi hiện hành — chép từ file).

### A2 · Trial surface
- Scatter 2 trục chọn được (x/y axis picker 5 param); 512 điểm (render mẫu 1/2 + θ*/best luôn có); màu ramp 5 nấc theo quantile objective; θ* viền xanh 2px; best IS viền đỏ; PRUNED chấm rỗng dashed.
- Click điểm → `pick` (highlight vàng ring) → ledger cuộn tới + highlight; hash `pick=` cập nhật.
- Legend 5 mục cố định (ramp, θ*, best, pruned=duplicate, click-to-lineage).

### A3 · Progression + concentration + pruned rail
- Trái: objective theo trial order (chấm mờ) + best-so-far (vạch vàng); phải: giá trị 1 param theo trial order (concentration về θ* line xanh) — param picker.
- Dưới trái: pruned rail — vạch dashed vị trí trial pruned; note "46 pruned rải khắp chuỗi — duplicate ở vùng sampler đang co, không phải epoch pruning."
- concNote: "Nửa sau của chuỗi, giá trị {param} tụ quanh vạch xanh (θ*) — TPE đang khai thác vùng tốt. Tụ quá sớm = under-explore."

### A4 · Per-param sampled regions
- 6 mini-hist (12 bins): cao = số trial, màu = mean objective ramp; θ* vạch xanh; caption "{n}/12 vùng có sample".

### A5 · Importance
- Spearman |ρ| bar per param, sort desc; TAG vàng: "Spearman proxy, không phải fANOVA".

## 4. Freeze line (cột giữa 52px)
- 2 đoạn dashed dọc #9a6a1f + label xoay dọc: `POOL FROZEN · K = ⌈512 × 0.10⌉ = 52 · {frozen_at}`.
- Mũi tên giữa theo mode×schedule: per_fold_causal `→` (một chiều, viền vàng) · per_fold_decay `◀ OOS` đỏ + pulse (OOS đi vào selection) · global `◀ FULL` đỏ (retro) · mode 5 `×` đỏ (không có cửa sổ giữ lại). Title giải thích từng loại (4 câu verbatim hi-fi).

## 5. Stage B panels

### B1 · Pool freeze funnel
- 5 hàng: evaluated 512 → feasible 402 → top-IS pool FROZEN 52 → candidates re-evaluated 24 → selected 1; bar width tỷ lệ; note per hàng.
- K formula card vàng: "K = ⌈n_trials × top_is_fraction⌉ = ⌈512 × 0.10⌉ = 52 — pool đóng TRƯỚC khi bất kỳ giá trị OOS/robustness nào được tính. Đây là ranh giới làm nên claim."

### B2 · Formula per mode (KaTeX)
- Header: "công thức của {mode} — mở được từng term" + nguồn (walk_forward.md §7 §13 / sbb / flat / subperiod / full).
- Công thức KaTeX display; term table: `k 150 · detail flex · v (mono 600 phải)`.
- Evidence per mode (CHỈ mode active render):
  - m1: decay bars per fold (± quanh trục giữa, >0.3 đỏ, <0 xanh) + scatter S_IS×S̄_OOS pool với đường chéo decay=0.
  - m2: histogram 256 path bootstrap + μ_boot; note "KHÔNG có term OOS nào trong J₂".
  - m3: bảng cluster (cụm | |C| | Q_C | M_C | V_C | P_C | selected via) — hàng thắng nền vàng; note fallback_reasons.
  - m4: heatmap 6 candidate × 6 IS shard + M_T/Q_T/D_T/J₄; note B/C flag-off vẫn hiển thị 0.000.
  - m5: banner đỏ dashed "train_index = test_index = full_index… full_sample_used_for_selection = true" + 4 hàng thông tin.

### B3 · Best trial ≠ selected params
- 2 card: best (viền đỏ nhạt) vs selected (viền vàng + badge SELECTED BY POLICY); 4 hàng metric mỗi card (S_IS, S̄_OOS|withheld|n/a, d̄ decay, max_dd).
- bestVsSelNote verbatim (khác cho mode 5).

### B4 · θ* journey
- 5 param × 5 fold dots (vị trí trong range; fold hiện hành đậm) + cột phải top_parameter_frequency %; seed consensus 4/5.
- Mode không fold (2/3/5): panel thay bằng câu noJourney tương ứng.

## 6. Trial ledger (full-width)
- Cột: `trial 62 · seed 50 · state 96 · S_IS 76 · {S_OOS|S_full} 120 · digest 110 · ghi chú flex`.
- Window 11 hàng quanh focus (pick || θ*); click hàng → pick; PRUNED tooltip "duplicate theo duplicate_policy=prune — không phải epoch pruning"; INFEASIBLE tooltip constraint số.
- Cột OOS 4-state theo claim (giá trị · hậu tố `· report`/`· retro` / `S_OOS · withheld` / `n/a`).
- Footer: "PRUNED = duplicate… Cột OOS có 4 trạng thái theo ma trận mode × schedule — không phải boolean. UI không tính lại bất kỳ objective nào."
- ≥20 fold: ledger có thanh fold filter (dropdown nhóm) — trials của fold hiện hành.

## 7. Data contract

```ts
interface SearchDetail {
  run_id: string; mode: ModeId; schedule: ScheduleId;
  claim: { validation: string; chrono: string; oosSel: string;
           oosState: 'selection input'|'retrospective'|'report only'|'withheld'|'n/a';
           backend: string; backendForced: boolean;
           selector: string; selectorTag: 'CONFIRMED'|'INFERRED' };
  space: { name: string; kind: string; low: number; high: number; step: number|null;
           levels: string; theta: number|boolean; pos_pct: number }[];
  coverage: { grid_size: string; trials: string; early_stop: string;
              sampler: string; rejected: string; note: string };
  trials: { id: number; seed: string; p: Record<string, number>;
            is: number; oos: number|null; state: 'COMPLETE'|'PRUNED'|'INFEASIBLE'|'SELECTED';
            digest: string }[];                     // đã downsample ≤ 600 cho surface
  bestTrial: number; thetaTrial: number;
  freeze: { k_formula: string; frozen_at: string; arrow: 'none'|'decay'|'retro'|'na' };
  funnel: { label: string; n: number; note: string }[];
  formula: { expr_latex: string; source: string;
             terms: { k: string; detail: string; v: string }[] };
  evidence: M1|M2|M3|M4|M5;                         // discriminated union theo mode
  bestVsSel: { best: KV4; sel: KV4; note: string };
  journey: { name: string; dots: number[]; freq: number }[] | { none: string };
  ledgerMeta: string; oosColHead: string;
  diagramNote: string; importance: { name: string; rho: number }[];
  dists: { name: string; bins: {c: number; mean: number|null}[]; theta_pct: number }[];
}
```
- Endpoint: `GET /runs/{id}/search?fold={k}` — per-fold (Stage A data đổi theo fold khi per-fold schedule); immutable + ETag.
- Nguồn: trials.parquet (downsample server) + SelectionTraceV1 + search_diagnostics — read-model gộp; **evidence union đúng 1 nhánh theo mode** — FE switch exhaustive (never default).
- Degraded: field thiếu (vd search_diagnostics absent) → server gửi `journey: { none: "search_diagnostics absent in this engine release — journey unavailable" }`; FE render câu đó, KHÔNG tự tính.

## 8. Pitfalls — chớ làm sai
1. WRONG: FE tính J/decay/quantile từ trials. RIGHT: mọi term/threshold từ trace; surface chỉ vẽ tọa độ.
2. WRONG: render cả 5 evidence panel rồi ẩn 4. RIGHT: union 1 nhánh — mount đúng panel của mode.
3. WRONG: chữ "OOS" xuất hiện ở mode 5 (label, cột, tooltip). RIGHT: oosColHead = "S_full"; grep test cấm chuỗi OOS trong DOM mode 5.
4. WRONG: schedule invalid bị ẩn. RIGHT: dashed + line-through + reason title.
5. WRONG: switcher mode đổi data cùng run. RIGHT: switcher = mở demo run khác (portal thật: switcher chỉ ở Atlas; run view khoá mode — render read-only chip, switcher sau cờ `demo`).
6. WRONG: 512 chấm full DOM + shadow từng chấm. RIGHT: downsample 1/2 (giữ θ*/best/pick), một layer, box-shadow chỉ pick.
7. WRONG: pick không đồng bộ ledger/hash. RIGHT: pick là state cursor — surface ↔ ledger ↔ hash một nguồn.
8. WRONG: KaTeX fail làm trắng panel. RIGHT: try/catch → fallback chuỗi mono expr.
9. WRONG: tự đặt màu INFERRED giống CONFIRMED. RIGHT: INFERRED vàng — nó là suy luận của read-model, phải nhìn thấy.
10. WRONG: coverage "unbounded" đổi thành số to. RIGHT: chữ "unbounded (dynamic float)" — trung thực.
11. WRONG: freeze arrow luôn "→". RIGHT: 4 loại theo mode×schedule — arrow là NỘI DUNG, không trang trí.
12. WRONG: ledger scroll toàn bảng 512 hàng. RIGHT: window 11 quanh focus + nav.

## 9. Test matrix
| ID | Precondition | Action | Expected |
|---|---|---|---|
| T01 | mode_1 pfc | load | freeze arrow "→"; OOS state chip "withheld"; ledger cột "S_OOS · withheld" |
| T02 | mode_1 per_fold_decay | switch | arrow "◀ OOS" pulse đỏ; oosState "selection input"; claim đổi |
| T03 | mode_2 | switch | backend "proxy (forced)" vàng; evidence histogram; không panel decay |
| T04 | mode_3 | — | bảng cluster; hàng C1 nền vàng; medoid note |
| T05 | mode_4 | — | heatmap 6×6; B/C 0.000 hiển thị |
| T06 | mode_5 | — | banner đỏ; grep "OOS" trong DOM = 0; cột S_full; journey none |
| T07 | click điểm surface | — | ring vàng; ledger window nhảy quanh trial; hash pick= |
| T08 | click hàng ledger | — | pick đổi; surface ring theo |
| T09 | axis picker đổi x=atr_mult | — | scatter re-plot; legend giữ |
| T10 | schedule invalid pill | click | no-op; title lý do đúng map |
| T11 | θ* sát biên (fixture edge) | — | tick đỏ + note "SÁT BIÊN" |
| T12 | journey absent (fixture degraded) | — | câu degraded verbatim; không chart rỗng |
| T13 | fold selector 32-fold | đổi fold | Stage A refetch fold đó; hash fold= |
| T14 | breadcrumb | click | 04 stage=search giữ fold/trial/pick |
| T15 | next-stage | click | 07 nhận hash |
| T16 | copy evidence link | click | clipboard portal://…mode&schedule&trial&params; ✓ 1.5s |
| T17 | KaTeX bị chặn (mock fail) | load | expr mono fallback; panel sống |
| T18 | 660px | resize | 3 cột dọc; freeze line ngang; bảng cuộn trong card |
| T19 | axe | scan | pill aria-pressed; surface điểm role=button aria-label "trial {id}…"; 0 serious |

## 10. Copy inventory — VERBATIM (chuỗi hệ trọng, bản EN hi-fi)
- Note switcher: "one run is one mode — switching here opens another demo run to learn the reading; a real run's mode is fixed at submit."
- K formula card §5-B1.
- PRUNED tooltip + ledger footer §6.
- SCHED_REASON 2 câu §2.
- coverageNote · concNote · railNote · diagramNote (4 biến thể) · bestVsSelNote (2 biến thể) · noJourney (2 biến thể) — chép từ hi-fi logic, giữ nguyên.
- Tag: "Spearman proxy, không phải fANOVA" (bản EN trong file: "Spearman proxy, not fANOVA").
- Rules footer: "Một run là một mode… frontend không tự cluster, không tự tính J." (bản EN trong file).

## 11. TS architecture
```
<SearchPage>
  const d = useSearchDetail(runId, cursor.fold);
  const [cursor, setCursor] = useEvidenceCursor();   // pick = trial
  <PortalShell…>
    <ModeHeader claim pills diagram/>
    <div class=grid3>
      <StageA> <SpaceTable/> <Surface/> <Progression/> <Dists/> <Importance/> </StageA>
      <FreezeLine arrow/>
      <StageB> <Funnel/> <FormulaPanel evidence/> <BestVsSel/> <Journey/> </StageB>
    </div>
    <TrialLedger window focus/>
```
- Surface/Progression/Dists: div-based (không canvas) với memo theo (trials ref, axes, pick) — chấm là span absolute %.
- KaTeX: import lazy; render trong useEffect; fallback.
- Evidence: `switch (d.evidence.kind)` exhaustive — thêm mode mới = thêm nhánh + spec.

## 12. Perf budget
- Surface ≤ 300 span; re-plot đổi trục < 10ms.
- Ledger window 11 hàng — không virtual lib.
- Route < 120KB gzip + KaTeX lazy chunk.

## 13. Guide plan
1. Types + fixture 5 mode (mỗi mode một SearchDetail đúng union) — nguồn từ hi-fi logic values.
2. ModeHeader + claim chips + diagram (pulse CSS).
3. StageA panels theo thứ tự A1→A5 (SpaceTable trước — bảng giá trị cao nhất).
4. FreezeLine 4 arrow.
5. StageB B1→B4 + KaTeX.
6. Ledger + pick sync + hash.
7. Test T01–T19; grep-OOS test mode 5; screenshot 5 mode ≤1%.
8. DoD: tất cả xanh + integration 04↔06↔07 cursor + copy diff = 0.

## 14. Phi phạm vi
- Không chạy lại search/preview optimizer từ màn này.
- Không so mode cạnh nhau (Atlas 12 lo phần đọc; Compare 13 lo phần số giữa runs).
- Không chỉnh selector/threshold — đó là 02 (attempt mới).


## 15. Per-element CSS ledger

### 15.1 Mode header
- `.se-modebar`: border 1px solid #e3e0d7
- `.se-modebar`: border-radius 6px
- `.se-modebar`: background #ffffff
- `.se-modebar`: box-shadow 0 1px 2px rgba(28,37,50,.05)
- `.se-modebar .row1`: display flex; flex-wrap wrap; align-items center; gap 8px
- `.se-modebar .row1`: padding 9px 14px; border-bottom 1px solid #efede4
- `.se-pill`: border 1px solid #e3e0d7
- `.se-pill`: background #ffffff
- `.se-pill`: color #4e5a6e
- `.se-pill`: padding 3px 10px
- `.se-pill`: font-family JetBrains Mono
- `.se-pill`: font-size 10.5px
- `.se-pill[data-on=true]`: border-color #0f4c5c; background #e2edf0; color #0f4c5c
- `.se-pill[data-on=true][data-warn=true]`: border-color #9a6a1f; background #f4ecdb; color #9a6a1f
- `.se-pill[data-disabled=true]`: border-style dashed; color #c9c5ba; text-decoration line-through; cursor not-allowed
- `.se-claimrow`: display flex; flex-wrap wrap; gap 8px 24px; padding 9px 14px
- `.se-claim .k`: font-size 10px; uppercase; letter-spacing .07em; color #939db0
- `.se-claim .v`: font-family JetBrains Mono; font-size 11.5px
- `.se-oosstate`: font mono 11px 600; border 1px solid; border-radius 3px; padding 0 6px
- `.se-oosstate[data-s="selection input"]`: color/border #9a6a1f
- `.se-oosstate[data-s="retrospective"]`: color/border #9a6a1f
- `.se-oosstate[data-s="report only"]`: color/border #6f7a8c
- `.se-oosstate[data-s="withheld"]`: color/border #7a8699
- `.se-oosstate[data-s="n/a"]`: color/border #b43a3a
- `.se-diagram`: display flex; align-items center; gap 14px; padding 8px 14px
- `.se-diagram`: border-top 1px solid #efede4; background #f4f2ec; flex-wrap wrap
- `.se-diag-train`: display inline-block; height 12px; background #a8c6ce; animation sr-pulse 2.2s infinite
- `.se-diag-test[data-withheld]`: background repeating-linear-gradient(135deg,#f4ecdb 0 3px,transparent 3px 6px); border 1px solid #9a6a1f

### 15.2 Freeze line
- `.se-freeze`: display flex; flex-direction column; align-items center; padding-top 34px
- `.se-freeze .seg`: flex 1; width 0; border-left 2px dashed #9a6a1f
- `.se-freeze .label`: writing-mode vertical-rl; transform rotate(180deg)
- `.se-freeze .label`: font-family JetBrains Mono; font-size 9.5px; font-weight 700
- `.se-freeze .label`: letter-spacing .14em; color #9a6a1f; white-space nowrap
- `.se-arrow`: font mono 10px 700; padding 3px 6px; border-radius 3px; background #faf9f5
- `.se-arrow[data-k=none]`: border 1px solid #9a6a1f; color #9a6a1f
- `.se-arrow[data-k=decay]`: border 1px solid #b43a3a; color #b43a3a; animation sr-flow 1.6s infinite
- `.se-arrow[data-k=retro]`: như decay
- `.se-arrow[data-k=na]`: border 1px solid #b43a3a; color #b43a3a
- `@keyframes sr-flow`: 0% translateX(-4px) opacity .2 · 50% opacity 1 · 100% translateX(4px) opacity .2

### 15.3 Surface & charts
- `.se-surface`: position relative; height 250px; border 1px solid #e3e0d7; background #fdfdfa
- `.se-dot`: position absolute; border-radius 50%; padding 0; border 0
- `.se-dot[data-theta]`: border 2px solid #1e7b4f; z-index 3
- `.se-dot[data-best]`: border 2px solid #b43a3a; z-index 3
- `.se-dot[data-pruned]`: background transparent; border 1px dashed #939db0
- `.se-dot[data-pick]`: box-shadow 0 0 0 3px rgba(154,106,31,.35)
- ramp 5 nấc: #dbe5e7 · #a8c6ce · #6b9ea8 · #3d7a86 · #0f4c5c
- `.se-prog`: height 130px; border 1px solid #e3e0d7; background #fdfdfa; position relative
- `.se-rail`: height 12px; border 1px solid #e3e0d7; background #f7f4ec; position relative
- `.se-hist .bin`: flex 1; background theo mean ramp; border-right 1px solid #fff

### 15.4 Stage B
- `.se-funnel .bar`: height 9px; background #f4ecdb; border 1px solid #9a6a1f
- `.se-kcard`: border 1px solid #9a6a1f; background #f4ecdb; color #9a6a1f
- `.se-kcard`: padding 5px 10px; font mono 10.5px; line-height 1.6
- `.se-formula`: font mono 12.5px; line-height 1.6; border-left 2px solid #0f4c5c; padding-left 8px
- `.se-term`: display flex; gap 9px; font-size 10.5px; padding 2px 0; border-bottom 1px solid #f4f2ec
- `.se-bestcard`: border 1px solid #e3e0d7; border-radius 6px; padding 10px 12px
- `.se-selcard`: border 1px solid #9a6a1f; border-radius 6px; background #fdfbf5; padding 10px 12px
- `.se-selbadge`: font mono 8.5px 700; letter-spacing .08em; color #9a6a1f; border 1px solid #9a6a1f; padding 0 5px
- `.se-m5banner`: border 1px dashed #b43a3a; background #f7e8e8; color #b43a3a; padding 6px 10px; font-size 10.5px; line-height 1.55

### 15.5 Ledger
- `.se-ledger`: border 1px solid #e3e0d7; border-radius 6px; background #ffffff; overflow-x auto
- `.se-lrow`: display flex; align-items baseline; width 100%; text-align left
- `.se-lrow`: border 0; padding 4px 12px; border-bottom 1px solid #f4f2ec
- `.se-lrow`: font-family JetBrains Mono; font-size 10.5px; min-width 760px
- `.se-lrow[data-theta]`: background #f4ecdb
- `.se-lrow[data-pick]`: background #e2edf0
- state colors: SELECTED #9a6a1f · PRUNED #939db0 · INFEASIBLE #b43a3a · COMPLETE #1e7b4f

## 16. Fixture guide (5 mode)
- SEARCH_M1_PFC: claim withheld; arrow none; journey 5 param; evidence m1 {decay bars 5, scatter 24}.
- SEARCH_M1_DECAY: oosState "selection input"; arrow decay.
- SEARCH_M2: backendForced true; selectorTag INFERRED; evidence m2 {bins 18, mu, n 256}.
- SEARCH_M3: evidence m3 {rows 3, win C1}; journey none "single-span mode…".
- SEARCH_M4: evidence m4 {6×6}; schedule per_fold_causal INFERRED note.
- SEARCH_M5: oosColHead S_full; claim n/a; arrow na; grep-OOS=0 fixture.
- Trials generator: mulberry32 seed cố định per mode (như hi-fi) — golden số khớp screenshot.

## 17. Reviewer checklist
1. [ ] Union evidence exhaustive — thêm ModeId mới không compile nếu thiếu nhánh.
2. [ ] grep "OOS" DOM mode 5 = 0 (test tự động).
3. [ ] Không Math trên trials ngoài toạ độ % (grep reduce/mean trong components — chỉ được ở fixture).
4. [ ] 4 arrow đúng data-k; pulse chỉ decay/retro; reduced-motion tắt.
5. [ ] pick sync 3 nơi (surface/ledger/hash) một nguồn.
6. [ ] KaTeX lazy + fallback test.
7. [ ] Copy diff §10 = 0.
8. [ ] Ledger min-width 760 cuộn trong card, không tràn trang.
9. [ ] Screenshot 5 mode × 2 schedule chính ≤1%.
10. [ ] INFERRED tag vàng hiện đúng mode 2 (và m4 pfc note).

## 18. Glossary
- Stage A/B: search (sampler thấy IS) / selection (trên pool đã đóng).
- freeze line: ranh giới thông tin — mọi claim sinh ra từ hướng mũi tên ở đây.
- pool K: ⌈trials × fraction⌉ ứng viên đóng băng TRƯỚC khi chấm bằng dữ liệu bên kia.
- pick: trial đang soi (cursor phụ, không phải θ*).
- INFERRED: giá trị read-model suy ra vì engine không phát trực tiếp — luôn vàng.


## 19. Ma trận mode × schedule → claim + arrow + cột OOS (bảng quyết định đầy đủ — chép vào code như bảng dữ liệu, không if-else rời)

| mode | schedule | validation_claim | oosState | arrow | oosColHead |
|---|---|---|---|---|---|
| mode_1_decay | per_fold_decay | selection_adjusted_oos | selection input | decay | S_OOS |
| mode_1_decay | per_fold_causal | strict_nested_fold_local_retraining | withheld | none | S_OOS (withheld) |
| mode_1_decay | global | walk_forward_oos (compat) | retrospective | retro | S_OOS (retro) |
| mode_2_sbb | global | train-only robustness stress | report only | none | S_OOS (report) |
| mode_3_flat_minima | global | IS-only surface geometry | report only | none | S_OOS (report) |
| mode_4_is_only_robust | per_fold_causal | strict outer OOS if strategy causal — INFERRED | report only | none | S_OOS (report) |
| mode_4_is_only_robust | global | walk_forward_oos (compat) | retrospective | retro | S_OOS (retro) |
| mode_5_full_robust | global | none_full_sample_calibration | n/a | na | S_full |

- Bảng này là DATA (map key "mode|schedule") — một nguồn cho: claim mini, arrow, cột ledger, diagram note. Test: đủ 8 entry, không key lạ.
- Schedule không có trong bảng cho mode đó = invalid (dashed pill).

## 20. Interaction chi tiết từng control (bảng QA)
| Control | Sự kiện | Kết quả |
|---|---|---|
| mode pill (demo) | click | load fixture run mode đó; schedule reset defSched; pick reset |
| schedule pill valid | click | claim/arrow/cột OOS đổi theo bảng §19 |
| schedule pill invalid | click | no-op; title lý do |
| axis X/Y picker | click | scatter re-plot; θ*/best giữ ring |
| conc param picker | click | chart concentration đổi param |
| dot surface | click | pick=id; ring; ledger window; hash |
| dot surface | Enter (focus) | như click |
| ledger row | click | pick=id; surface ring |
| fold selector | ‹ › / dropdown | refetch Stage A fold đó; hash fold |
| copy evidence link | click | clipboard + ✓ 1.5s |
| next-stage | click | 07 + hash |
| breadcrumb | click | 04 stage=search + hash |

## 21. Perf & motion notes bổ sung
- sr-pulse/sr-flow: 2 keyframes duy nhất; prefers-reduced-motion → animation none (media query, không JS).
- Surface hover KHÔNG tooltip JS — title attr (tránh re-render 300 span).
- Đổi mode demo: swap fixture — không refetch mạng ở chế độ demo; portal thật không có switcher (chỉ chip read-only) trừ cờ demo.

## 22. Câu hỏi mở
- per-fold Stage A: schedule global/mode 2/3/5 chỉ có 1 "fold" — fold selector disabled + label "single span" (đồng bộ hành vi 04 §22).
- trials.parquet quá lớn (100k trial): server downsample lưới 600 + luôn kèm θ*/best/pick-id nếu client yêu cầu trial cụ thể (`?include_trial=`) — API đã chốt shape, số lượng chốt khi có run thật đầu tiên.

> End of spec 06 · v1.1 · ~500 dòng nội dung nén · pair with hi-fi `QuantBT 06 S2 Search and Selection.dc.html`.
