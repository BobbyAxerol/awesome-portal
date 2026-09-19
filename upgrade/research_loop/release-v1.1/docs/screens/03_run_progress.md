# SPEC 03 · Run Progress — `QuantBT 03 Run Progress.dc.html`

> Guide plan cho agent code. Copy VERBATIM. Số = CSS px. Luật gốc: màn này là **Evidence Flow theo thời gian** — claim ở trạng thái FORECAST (nét đứt) khi RUNNING, lật ISSUED (nét liền) khi COMPLETED, và bàn giao cursor sang 04. Không bao giờ hiện chuỗi claim như sự thật trước Stage 5.

---

## 1. Meta

| Key | Value |
|---|---|
| File hi-fi | `QuantBT 03 Run Progress.dc.html` |
| Route | `/research/quantbt/runs/{id}/progress` |
| Vai trò | Theo dõi run đang chạy: stage stepper, tiến độ tqdm-grade + ETA, fold Gantt, console trial, artifact xuất hiện dần, budget bar, claim passport forecast→issued |
| Persona | researcher (chờ run) · manager (liếc tiến độ) |
| Shell | Có (topbar + sidebar) |
| Inbound | 01 card RUNNING "watch progress →" · 02 sau create · Journey P5 |
| Outbound | 04 (nút bàn giao khi COMPLETED, kèm hash cursor) · 05/06/07/08 từ stage rail (kèm `#fold=`) · 11 từ S5 rail |
| Demo tweaks (hi-fi) | `phase`: running / completed · `scale`: 5 folds / 32 folds |
| Console chuẩn | 0 error/warning |

### 1.1 Nguyên tắc màn
1. SSE là nguồn tăng tốc, polling 5s là sàn — UI không được phụ thuộc SSE để đúng.
2. Mọi con số tiến độ đến từ orchestrator event — FE không tự ước lượng ETA (server gửi `eta_s`).
3. Fail-closed: RuntimeBudgetError → run FAILED với mã lỗi engine verbatim, không retry tự động.
4. Stage rail = đúng 5 stage của Evidence Flow — cùng grammar, cùng thứ tự, link sang deep-dive với fold hiện hành.

---

## 2. Layout anatomy (top → bottom)

### 2.1 Header
- Breadcrumb: `Runs / R-WFO-119 / Progress`.
- Title 22px/300: **Run progress — R-WFO-119** (COMPLETED: "Run completed — R-WFO-119").
- Cạnh title: status pill (grammar 01) + SSE dot: 7px tròn; RUNNING nền #1e7b4f + pulse 1.4s; else #939db0; label mono 9.5px "SSE live · poll floor 5s" / "stream closed — final state".
- Subtitle italic: "The run narrates itself: stages, folds, trials, artifacts — and a claim that stays a dashed forecast until Stage 5 issues it."
- Phải: `alpha_momentum_btc · av_0_9_3` chip + `mode_1_decay · per_fold_causal` chip + created mono.

### 2.2 Stage rail (card trắng, flex 5 cột chia đều, gap 8)
Mỗi stage cell: số ô + tên + trạng thái dòng dưới:
| Stage | Label | Trạng thái có thể |
|---|---|---|
| S1 | Split | DONE (xanh ✓) |
| S2 | Search | RUNNING (progress mini-bar trong cell) / DONE |
| S3 | Freeze | PENDING (mờ) / DONE |
| S4 | Execute | PENDING / RUNNING / DONE |
| S5 | Claim | PENDING / ISSUED (vàng đậm) |
- Cell DONE là LINK → màn deep-dive tương ứng kèm `#fold={foldCursor}`; PENDING không link (aria-disabled).
- Grammar màu: done nền #e2edf0 viền #0f4c5c · running viền #1e7b4f + progress fill · pend viền #e3e0d7 chữ #c9c5ba · issued nền #f4ecdb viền #9a6a1f.

### 2.3 Progress block (card trắng)
- Hàng 1: label "overall" + thanh 12px (nền #f4f2ec, fill #0f4c5c bo 6px) + mono `{pct}%` + `elapsed {t}` + `eta {t}` (server) + `trials {done}/{declared}`.
- Hàng 2 (tqdm-grade): mono 10px #4e5a6e — `fold 07/32 · study 7 · trial 214/400 · best J₁ 1.049 · prune 12%` — cập nhật theo event.
- **Budget bar**: label "runtime budget" + thanh 8px fill #9a6a1f theo `budget_used_pct` + mono `{used}/{cap} core-min`; chạm 100% → run FAILED mã `RuntimeBudgetError.{code}` hiển thị đỏ verbatim.

### 2.4 Fold Gantt (card trắng)
- 5 fold: mỗi fold 1 hàng — label `fold_01` mono 10px + thanh ngang: đoạn search (mist #a8c6ce) → đoạn oos eval (teal #0f4c5c) → tick freeze (vạch vàng); width theo thời gian thật (server gửi start/end từng đoạn).
- ≥20 fold (scale demo 32): **compact mode** — mỗi fold 1 cột dọc 10px, chiều cao = tiến độ; hover tooltip chi tiết; hàng hiện hành viền xanh.
- Fold đang chạy: nhấp nháy nhẹ đoạn cuối (opacity pulse); fold FAILED: cột đỏ.
- Click fold (cả 2 mode) → set foldCursor (đồng bộ stage-rail links + console filter).

### 2.5 Trial console (card nền tối #1c2532, radius 8, chữ mono 10.5px)
- Header: "trial console" + filter chips `all / fold {n} / errors` + auto-scroll toggle (mặc định ON; user cuộn lên = tự OFF + nút "↓ latest").
- Dòng log: `[12:04:18] fold_07 trial 214 J₁=1.031 params={window:44,…} state=COMPLETE` — màu: COMPLETE #a8c6ce · PRUNED #939db0 · INFEASIBLE #e8a0a0 · lỗi #ff6b6b.
- Giữ tối đa 500 dòng trong DOM (cửa sổ trượt); "· · · older lines dropped (kept server-side)" ở đầu.
- KHÔNG dùng `scrollIntoView` — set `scrollTop` trực tiếp.

### 2.6 Artifacts strip (card trắng)
- Grid ô artifact: `trials.parquet` · `selection_trace.json` · `fold_results/` · `fill_ledger.parquet` · `metrics_summary.json` · `claim.json` — mỗi ô: tên mono + trạng thái `writing…` (mờ, pulse) / `sealed · {size}` (đậm + digest 8 hex) / `pending` (dashed).
- Artifact sealed là LINK xuống màn đọc nó (trials→06, trace→06, fill→08, metrics→04, claim→04#stage=claim).

### 2.7 Claim passport (card viền vàng #9a6a1f)
- RUNNING: viền DASHED + badge `FORECAST` + câu: "mode_1_decay × per_fold_causal ⇒ STRICT_OUTER_OOS_AFTER_FROZEN_SELECTION · cert ceiling B — issued only if every stage seals." — chữ #9a6a1f mờ 0.85.
- COMPLETED: viền LIỀN + badge `ISSUED` + chuỗi claim verbatim từ engine + cert chip B + **nút bàn giao**: `open evidence flow → (fold {n} · trial {m})` — primary vàng; href `04#stage=summary&fold={f}&trial={t}&params={digest}`.
- FAILED: viền đỏ + badge `NOT ISSUED` + "the run failed before Stage 5 — no claim exists. Failure detail is in the console above."

### 2.8 Rules footer
"A dashed claim is a forecast, not a promise — the engine issues the real one at Stage 5 or not at all. Progress numbers come from the orchestrator event stream; the page never estimates. A budget kill is a verdict, not an accident — it ships with its error code."

---

## 3. Tính động — state machine

### 3.1 Run lifecycle
```
QUEUED → RUNNING → COMPLETED
                 ↘ FAILED (engine error | RuntimeBudgetError | user cancel)
```
| Từ | Event | UI đổi |
|---|---|---|
| QUEUED | run_started | pill RUNNING; SSE dot pulse; progress 0% |
| RUNNING | stage_started {S2} | stage cell S2 → RUNNING + mini progress |
| RUNNING | trial_completed | console append; tqdm line update; overall pct update |
| RUNNING | fold_completed {k} | gantt fold k đủ đoạn; foldCursor giữ nguyên (không tự nhảy) |
| RUNNING | artifact_sealed {name} | ô artifact writing→sealed + digest; link bật |
| RUNNING | budget_tick | budget bar cập nhật |
| RUNNING | run_completed | pill COMPLETED; claim FORECAST→ISSUED (transition 240ms border-style); nút bàn giao hiện; SSE đóng "final state" |
| RUNNING | run_failed {code,msg} | pill FAILED; console dòng đỏ verbatim; claim NOT ISSUED; artifacts đang writing → "aborted" |
| bất kỳ | SSE drop | dot xám; poll 5s tiếp quản; KHÔNG banner |

### 3.2 foldCursor
- State cục bộ, khởi tạo = fold mới nhất có event; click gantt đổi; stage-rail links + console filter + nút bàn giao đọc nó.
- KHÔNG ghi vào URL khi RUNNING (tránh spam history); COMPLETED thì ghi `#fold=` một lần để share.

### 3.3 Auto-scroll console
- ON: mỗi batch append → scrollTop = scrollHeight (rAF gộp).
- User wheel/drag lên >40px từ đáy → OFF + nút "↓ latest" (click = ON + nhảy đáy).

### 3.4 Transition claim flip
- border-style dashed→solid + badge swap; KHÔNG confetti/toast — sự kiện lớn thể hiện bằng nút bàn giao primary xuất hiện.

## 4. Data contract

### 4.1 REST + SSE
```
GET /api/v1/quantbt/runs/{id}/progress → ProgressSnapshot   // đủ để vẽ toàn màn không cần SSE
GET /api/v1/quantbt/runs/{id}/events (SSE)                  // event = Patch<ProgressSnapshot> + console lines
GET /api/v1/quantbt/runs/{id}/console?after_seq=&limit=500  // backfill console
```
```ts
interface ProgressSnapshot {
  run_id: string; status: 'QUEUED'|'RUNNING'|'COMPLETED'|'FAILED';
  binding: AlphaBinding | null; mode: string; created_at: string;
  stages: { s: 'S1'|'S2'|'S3'|'S4'|'S5'; state: 'done'|'running'|'pend'|'issued'; pct?: number }[];
  overall: { pct: number; elapsed_s: number; eta_s: number | null;
             trials_done: number; trials_declared: number; tqdm_line: string };
  budget: { used: number; cap: number; unit: 'core-min'; pct: number };
  folds: { k: number; segments: {kind:'search'|'oos'|'freeze_tick'; t0:string; t1:string}[];
           state: 'pend'|'running'|'done'|'failed'; pct: number }[];
  artifacts: { name: string; state: 'pending'|'writing'|'sealed'|'aborted';
               size?: string; digest?: string; reader_href?: string }[];
  claim: { state: 'FORECAST'|'ISSUED'|'NOT_ISSUED'; text: string; cert: CertGrade | null;
           cursor?: { fold: number; trial: number; params: string } };
  failure?: { code: string; message: string };   // verbatim engine
}
interface ConsoleLine { seq: number; ts: string; fold: number; text: string;
  tone: 'complete'|'pruned'|'infeasible'|'error'; }
```

### 4.2 Backend wiring
```
quantbt-engine process (per-run) → orchestrator (thu event, tính pct/eta, seal artifact digest)
  → portal backend: snapshot store + SSE fanout
  → FE: snapshot đầu + patch stream; console backfill phân trang theo seq
```
- `tqdm_line` là CHUỖI server dựng — FE không format lại (giữ đúng ngữ pháp tqdm).
- `claim.text` FORECAST cũng do server dựng từ mode×schedule matrix (một nguồn với 02 forecast).
- Cancel run: `POST /runs/{id}/cancel` — nút "cancel run" mono nhỏ góc console, confirm dialog 1 bước, kết quả là run_failed {code: USER_CANCELLED}.

### 4.3 Field → element
| Field | Element |
|---|---|
| overall.tqdm_line | hàng tqdm §2.3 |
| budget.pct | budget bar fill |
| folds[k].segments | gantt đoạn |
| artifacts[i].digest | ô artifact digest 8-hex hiển thị |
| claim.state | passport border style + badge |
| claim.cursor | href nút bàn giao |
| failure.code+message | console dòng đỏ + passport NOT ISSUED |

## 5. TS architecture
```
<RunProgressPage>
  const snap = useProgressSnapshot(runId);       // RTK Query
  useProgressStream(runId, dispatchPatch);       // SSE→patch cache; visibilitychange pause
  <PortalShell…>
    <ProgressHeader…/> <StageRail stages cursor/> <OverallBlock…/>
    <FoldGantt folds cursor onPick scaleMode={folds.length>=20?'compact':'rows'}/>
    <TrialConsole runId filter={cursorFilter}/>  // tự quản window 500 dòng
    <ArtifactsStrip…/> <ClaimPassport claim status/>
```
- `useProgressStream`: EventSource; onmessage áp patch theo `seq` (bỏ event cũ); onerror → đặt cờ poll (RTK polling 5s) — một chỗ quyết định nguồn.
- Console: mảng vòng (ring buffer) trong ref + forceUpdate theo batch 100ms — KHÔNG đưa 500 dòng vào Redux.
- Gantt compact: canvas KHÔNG cần — div cột đủ (≤40 fold); memo theo folds ref.

## 6. Pitfalls — chớ làm sai
1. WRONG: FE tự tính ETA từ tốc độ trial. RIGHT: server `eta_s`; null → hiện "—".
2. WRONG: hiện claim string thật khi RUNNING (dù có sẵn ma trận). RIGHT: FORECAST wording + dashed — sự thật chỉ ở Stage 5.
3. WRONG: console vào Redux/state mỗi dòng (re-render bão). RIGHT: ring buffer + batch 100ms.
4. WRONG: scrollIntoView cho auto-scroll. RIGHT: scrollTop trực tiếp (luật toàn dự án).
5. WRONG: SSE chết → banner đỏ. RIGHT: im lặng chuyển poll; dot xám là đủ.
6. WRONG: tự nhảy foldCursor theo fold mới nhất khi user đã click chọn. RIGHT: user chọn là pin; chỉ auto khi chưa từng chọn.
7. WRONG: hiện % budget như tiến độ tốt (xanh). RIGHT: budget là chi phí — vàng #9a6a1f, đỏ khi >90%.
8. WRONG: artifact link bật khi writing. RIGHT: chỉ sealed mới link (đọc file dở là đọc rác).
9. WRONG: retry tự động khi FAILED. RIGHT: fail-closed; hành động duy nhất là "new run with same draft →" (link 02 kèm ?from={id} — v2, ghi chú SOON).
10. WRONG: unmount không đóng EventSource. RIGHT: cleanup + visibilitychange pause (tab ẩn 60s → đóng, mở lại → snapshot mới rồi stream).
11. WRONG: đổi thứ tự stage rail hoặc thêm stage. RIGHT: 5 stage cố định — grammar chung toàn domain.
12. WRONG: pct tổng nhảy lùi khi trial PRUNED. RIGHT: server đảm bảo đơn điệu; FE clamp max(prev, next) phòng event lệch.

## 7. Test matrix
| ID | Precondition | Action | Expected |
|---|---|---|---|
| T01 | snapshot RUNNING 5 fold | load | đủ 7 block; pill RUNNING; dot pulse; S2 RUNNING mini-bar |
| T02 | SSE gửi trial_completed | — | console thêm dòng; tqdm line đổi; pct tăng |
| T03 | SSE drop (mock error) | — | dot xám; poll 5s hoạt động; không banner |
| T04 | event seq cũ đến sau | — | bị bỏ; state không lùi |
| T05 | fold_completed 07 | — | gantt fold 7 đủ đoạn; cursor không tự đổi nếu user đã pin |
| T06 | click fold 3 | — | stage-rail links mang #fold=3; console filter "fold 3" |
| T07 | artifact sealed trials.parquet | — | ô đổi sealed + digest; click → 06 |
| T08 | run_completed | — | claim dashed→solid 240ms; nút bàn giao href đúng cursor; SSE "final state" |
| T09 | run_failed budget | — | pill FAILED; console dòng đỏ mã RuntimeBudgetError verbatim; passport NOT ISSUED; artifacts writing→aborted |
| T10 | cancel | confirm | POST cancel; failed USER_CANCELLED |
| T11 | scale 32 fold | load | gantt compact cột; hover tooltip; click chọn được |
| T12 | console 5000 dòng server | cuộn lên đầu | "older lines dropped" + backfill nút "load older" theo after_seq |
| T13 | auto-scroll | user cuộn lên | OFF + nút ↓ latest; click → ON đáy |
| T14 | tab ẩn 2 phút | mở lại | snapshot refetch; stream nối lại; không dòng trùng (dedupe seq) |
| T15 | COMPLETED reload | — | #fold= khôi phục cursor; mọi block ở trạng thái cuối |
| T16 | 660px | resize | gantt/console cuộn trong card; không tràn trang |
| T17 | axe | scan | console role=log aria-live=polite (throttle); stage pend aria-disabled |
| T18 | reduce-motion OS | — | pulse/blink tắt (prefers-reduced-motion) |

## 8. Copy inventory — VERBATIM
- SSE labels: "SSE live · poll floor 5s" / "stream closed — final state"
- Subtitle: "The run narrates itself: stages, folds, trials, artifacts — and a claim that stays a dashed forecast until Stage 5 issues it."
- FORECAST: "mode_1_decay × per_fold_causal ⇒ STRICT_OUTER_OOS_AFTER_FROZEN_SELECTION · cert ceiling B — issued only if every stage seals."
- NOT ISSUED: "the run failed before Stage 5 — no claim exists. Failure detail is in the console above."
- Handoff button: "open evidence flow → (fold {n} · trial {m})"
- Artifacts states: "writing…" / "sealed · {size}" / "pending" / "aborted"
- Console drop: "· · · older lines dropped (kept server-side)"
- Rules footer: §2.8 nguyên đoạn.

## 9. Guide plan cho agent
1. Types + mock orchestrator (msw SSE simulator có seq, out-of-order case) — trước UI.
2. `useProgressStream` + patch reducer — test T02/T03/T04/T14.
3. StageRail + OverallBlock + Budget — storybook 3 status.
4. FoldGantt rows/compact — T05/T06/T11.
5. TrialConsole ring buffer — T12/T13 + perf test 50 dòng/s không rớt khung.
6. ArtifactsStrip + ClaimPassport — T07/T08/T09.
7. Cancel flow — T10.
8. A11y/motion — T17/T18.
9. DoD: T01–T18 xanh; screenshot diff RUNNING/COMPLETED/FAILED ≤1%; CPU idle tab < 2% khi RUNNING (profiler).

## 10. Phi phạm vi
- Không log download từ màn này (nút "download full log" là v2, artifact store lo).
- Không nhiều run song song trong 1 view; mỗi tab 1 run.
- Không sửa draft/re-run tại chỗ.

> End of spec 03 · v1.1 · pair with hi-fi `QuantBT 03 Run Progress.dc.html`.

---

## 11. Per-element CSS ledger (một dòng một thuộc tính)

### 11.1 Header
- `.rp-title`: font-family Newsreader
- `.rp-title`: font-size 22px
- `.rp-title`: font-weight 300
- `.rp-title`: letter-spacing -0.01em
- `.rp-sub`: font-family Newsreader; font-style italic
- `.rp-sub`: font-size 13.5px
- `.rp-sub`: color #939db0
- `.rp-ssedot`: width 7px
- `.rp-ssedot`: height 7px
- `.rp-ssedot`: border-radius 50%
- `.rp-ssedot[data-live=true]`: background #1e7b4f
- `.rp-ssedot[data-live=true]`: animation rp-pulse 1.4s infinite
- `.rp-ssedot[data-live=false]`: background #939db0
- `.rp-sselabel`: font-family JetBrains Mono
- `.rp-sselabel`: font-size 9.5px
- `.rp-sselabel`: color #939db0
- `@keyframes rp-pulse`: 0%,100% opacity 1 · 50% opacity .35

### 11.2 Stage rail
- `.rp-stages`: display flex
- `.rp-stages`: gap 8px
- `.rp-stages`: border 1px solid #e3e0d7
- `.rp-stages`: border-radius 8px
- `.rp-stages`: background #ffffff
- `.rp-stages`: box-shadow 0 1px 2px rgba(28,37,50,.05)
- `.rp-stages`: padding 10px 12px
- `.rp-stage`: flex 1
- `.rp-stage`: min-width 0
- `.rp-stage`: display flex
- `.rp-stage`: flex-direction column
- `.rp-stage`: gap 3px
- `.rp-stage`: border-radius 6px
- `.rp-stage`: padding 7px 10px
- `.rp-stage .id`: font-family JetBrains Mono; font-size 9px; font-weight 700; letter-spacing .08em
- `.rp-stage .name`: font-size 11.5px; font-weight 600
- `.rp-stage .sub`: font-size 9px; color #939db0
- `.rp-stage[data-s=done]`: background #e2edf0; border 1px solid #0f4c5c
- `.rp-stage[data-s=running]`: background #ffffff; border 1px solid #1e7b4f
- `.rp-stage[data-s=pend]`: background #ffffff; border 1px solid #e3e0d7; color #c9c5ba
- `.rp-stage[data-s=issued]`: background #f4ecdb; border 1px solid #9a6a1f
- `.rp-stage .mini`: height 4px; background #f4f2ec; border-radius 2px
- `.rp-stage .mini > i`: display block; height 100%; background #1e7b4f; border-radius 2px

### 11.3 Progress + budget
- `.rp-bar`: height 12px; background #f4f2ec; border-radius 6px; overflow hidden
- `.rp-bar > i`: display block; height 100%; background #0f4c5c
- `.rp-bar > i`: transition width 400ms cubic-bezier(.2,0,.2,1)
- `.rp-tqdm`: font-family JetBrains Mono; font-size 10px; color #4e5a6e
- `.rp-budget`: height 8px; background #f4f2ec; border-radius 4px
- `.rp-budget > i`: background #9a6a1f
- `.rp-budget[data-hot=true] > i`: background #b43a3a
- `.rp-meta`: font-family JetBrains Mono; font-size 9.5px; color #939db0

### 11.4 Gantt
- `.rp-gantt-row`: display flex; align-items center; gap 8px; padding 2px 0
- `.rp-gantt-row .label`: width 56px; flex none; font-family JetBrains Mono; font-size 10px; color #4e5a6e
- `.rp-gantt-row .track`: flex 1; height 12px; background #fdfdfa; border 1px solid #efede4; position relative
- `.rp-seg[data-k=search]`: background #a8c6ce
- `.rp-seg[data-k=oos]`: background #0f4c5c
- `.rp-seg[data-k=freeze_tick]`: width 2px; background #9a6a1f
- `.rp-gantt-row[data-cur=true] .track`: border-color #0f4c5c
- `.rp-gantt-compact`: display flex; gap 2px; align-items flex-end; height 64px
- `.rp-col`: width 10px; background #a8c6ce
- `.rp-col[data-s=done]`: background #0f4c5c
- `.rp-col[data-s=failed]`: background #b43a3a
- `.rp-col[data-cur=true]`: outline 1px solid #0f4c5c

### 11.5 Console
- `.rp-console`: background #1c2532; border-radius 8px; padding 10px 12px
- `.rp-console`: font-family JetBrains Mono; font-size 10.5px; line-height 1.6
- `.rp-console`: height 260px; overflow-y auto
- `.rp-line[data-tone=complete]`: color #a8c6ce
- `.rp-line[data-tone=pruned]`: color #939db0
- `.rp-line[data-tone=infeasible]`: color #e8a0a0
- `.rp-line[data-tone=error]`: color #ff6b6b
- `.rp-latest`: position sticky; bottom 6px; margin-left auto
- `.rp-latest`: border 1px solid #a8c6ce; border-radius 999px; background #243044
- `.rp-latest`: color #a8c6ce; font-size 9.5px; padding 2px 10px

### 11.6 Artifacts + passport
- `.rp-art`: border 1px solid #e3e0d7; border-radius 6px; padding 7px 10px; background #ffffff
- `.rp-art[data-s=writing]`: opacity .75; animation rp-pulse 2.2s infinite
- `.rp-art[data-s=pending]`: border-style dashed; color #c9c5ba
- `.rp-art[data-s=aborted]`: border-color #b43a3a; color #b43a3a
- `.rp-art .name`: font-family JetBrains Mono; font-size 10.5px; font-weight 600
- `.rp-art .meta`: font-family JetBrains Mono; font-size 9px; color #939db0
- `.rp-claim`: border 1.5px solid #9a6a1f; border-radius 10px; background #fdfbf5; padding 14px 16px
- `.rp-claim[data-state=FORECAST]`: border-style dashed
- `.rp-claim[data-state=NOT_ISSUED]`: border-color #b43a3a; background #f7e8e8
- `.rp-claim .badge`: font-family JetBrains Mono; font-size 9px; font-weight 700; letter-spacing .08em
- `.rp-claim .text`: font-family JetBrains Mono; font-size 11px; line-height 1.6; color #9a6a1f
- `.rp-handoff`: background #9a6a1f; color #ffffff; border-radius 6px
- `.rp-handoff`: font-family JetBrains Mono; font-size 11px; font-weight 600; padding 9px 14px

## 12. A11y matrix
| Element | Role/aria | Ghi chú |
|---|---|---|
| Console | role=log; aria-live=polite | announce throttle 1/phút |
| Stage done | link; aria-label "Stage {n} {name} — open deep dive at fold {k}" | |
| Stage pend | aria-disabled=true | focusable, Enter no-op |
| Progress bar | role=progressbar; aria-valuenow=pct | |
| Budget bar | role=progressbar; aria-label "runtime budget used" | |
| Gantt fold | button; aria-pressed=cur | Arrow trái/phải đổi fold |
| SSE dot | aria-hidden | label text kế bên đọc thay |
| Claim passport | region; aria-label "claim passport — {state}" | |
| Cancel | button + confirm dialog role=alertdialog | |

## 13. Telemetry
- `progress_view` {run_id, status} lúc mount.
- `progress_handoff_click` {run_id, fold, trial} — đo bàn giao sang 04.
- `progress_cancel` {run_id}.
- `progress_sse_fallback` {reason} — theo dõi chất lượng stream.
- Fire-and-forget; lỗi không throw.

## 14. Perf budget
- SSE 50 event/s: console batch 100ms; khung < 16ms (Profiler CI).
- Idle CPU tab RUNNING < 2%; tab ẩn: stream đóng sau 60s.
- Bundle route < 70KB gzip (không chart lib).
- Memory: ring buffer console ≤ 500 dòng; snapshot patch không giữ history.

## 15. Điều phối với màn khác
1. Nút bàn giao và stage links dùng CHUNG format hash với 04/05/06/07/08 — thay đổi format phải sửa spec cursor chung (SPEC_INDEX §4) trước.
2. 01 card RUNNING dùng cùng SSE/poll nguồn — patch cache listRuns theo run_id (spec 01 §15.1).
3. FORECAST text dùng chung builder với claim-forecast của 02 review rail — một hàm, hai màn.
4. Khi COMPLETED, 04 phải mở được NGAY bằng nút bàn giao — integration test 03→04 giữ cursor là test bắt buộc trước merge.


## 16. Event schema chi tiết (SSE payload — hợp đồng với orchestrator)

```ts
type ProgressEvent =
  | { seq: number; t: 'run_started'; at: string }
  | { seq: number; t: 'stage_started'; stage: StageKey; at: string }
  | { seq: number; t: 'stage_completed'; stage: StageKey; at: string }
  | { seq: number; t: 'trial_completed'; fold: number; trial: number;
      j: number | null; state: 'COMPLETE'|'PRUNED'|'INFEASIBLE';
      tqdm_line: string; overall_pct: number; console: ConsoleLine }
  | { seq: number; t: 'fold_completed'; fold: number; at: string }
  | { seq: number; t: 'artifact_sealed'; name: string; size: string;
      digest: string; reader_href: string }
  | { seq: number; t: 'budget_tick'; used: number; pct: number }
  | { seq: number; t: 'run_completed'; claim: ProgressSnapshot['claim']; at: string }
  | { seq: number; t: 'run_failed'; code: string; message: string; at: string };
```

Luật áp event:
- `seq` đơn điệu tăng; patch bỏ mọi event có seq ≤ seq đã áp.
- `overall_pct` clamp không lùi (max với hiện tại).
- `run_completed`/`run_failed` là terminal — sau đó mọi event bị bỏ và stream đóng.
- Console line đi KÈM trial_completed (không kênh riêng) — backfill qua REST khi cần cuộn ngược.

## 17. Failure codes hiển thị (verbatim từ engine — không dịch)

| Code | Console line mẫu | Passport note |
|---|---|---|
| RuntimeBudgetError.WALL_CLOCK | "RuntimeBudgetError: wall_clock cap 120min exceeded at fold_11" | budget bar đỏ 100% |
| RuntimeBudgetError.TRIAL_CAP | "RuntimeBudgetError: trial cap …" | như trên |
| MissingOptimizationMetricError | "MissingOptimizationMetricError: metric 'sharpe' absent in study directions" | gợi ý sửa ở 02 step 7 |
| DataContractViolation | "DataContractViolation: required column 'volume' missing" | gợi ý xem preflight 02 |
| USER_CANCELLED | "run cancelled by researcher@…" | không gợi ý |

- Mã KHÔNG có trong bảng: hiển thị nguyên code + message — cấm nuốt.

## 18. Trạng thái khởi tạo & skeleton
- Snapshot chưa về: skeleton 7 khối đúng khung (stage rail 1 hàng, progress 2 thanh, gantt 5 hàng, console khối tối trống có chữ "connecting…", artifacts 6 ô, passport dashed rỗng).
- Snapshot 404 (run không tồn tại): trang lỗi "run not found" + link Run Library.
- Snapshot của run COMPLETED từ lâu: render đầy đủ trạng thái cuối, KHÔNG mở SSE (status terminal).
- QUEUED: stage rail toàn pend; console "queued — waiting for a worker…".

## 19. Reviewer checklist trước merge
1. [ ] Không setInterval nào ngoài poll fallback duy nhất.
2. [ ] EventSource đóng ở unmount + visibility 60s (kiểm bằng test leak).
3. [ ] Console không vào Redux (grep store slice).
4. [ ] Mọi copy khớp §8/§17 từng ký tự.
5. [ ] Hash bàn giao đúng format cursor chung.
6. [ ] prefers-reduced-motion tắt pulse/blink.
7. [ ] Clamp pct áp cả poll lẫn SSE path.
8. [ ] Không scrollIntoView (grep).
9. [ ] Terminal state chặn mọi patch sau đó (test T04 mở rộng).
10. [ ] Screenshot 3 trạng thái khớp hi-fi tweaks phase=running/completed (+failed mock).


## 20. Mock/fixture guide (msw)

```ts
// fixtures/progress.fixture.ts
export const SNAP_RUNNING_5: ProgressSnapshot;   // fold 2/5, S2 running, 3 artifact writing
export const SNAP_RUNNING_32: ProgressSnapshot;  // compact gantt case
export const SNAP_COMPLETED: ProgressSnapshot;   // claim ISSUED + cursor {fold:3,trial:143,params:'prm_7c1a9e'}
export const SNAP_FAILED_BUDGET: ProgressSnapshot;
export const SNAP_QUEUED: ProgressSnapshot;
// simulator phát event theo kịch bản, hỗ trợ: rate(n/s), outOfOrder(), dropAt(seq), terminalAt(seq)
export function makeStream(script: ProgressEvent[], opts?): MockEventSource;
```

Kịch bản bắt buộc trong CI:
- happy_path_5fold: 60 event → run_completed; assert T01–T08.
- out_of_order: seq 10 đến trước 9 — state không lùi.
- drop_reconnect: drop tại seq 30, poll vá, stream nối lại seq 31 — không trùng dòng console.
- budget_kill: budget_tick 96% → run_failed — UI đỏ đúng chỗ.
- fast_finish: run_completed đến khi user đang ở fold pin 2 — cursor giữ 2, nút bàn giao vẫn dùng fold pin (không ép fold cuối).

## 21. Integration test 03 → 04 (bắt buộc trước merge)
1. Render 03 với SNAP_COMPLETED.
2. Click "open evidence flow →".
3. Assert điều hướng `/runs/R-WFO-119#stage=summary&fold=3&trial=143&params=prm_7c1a9e`.
4. Mount 04 với hash đó → assert claim strip đọc fold 3, cursor chip hiển thị trial 143.
5. Back → 03 giữ nguyên trạng thái cuối (bfcache-safe: pageshow re-check status).

## 22. Câu hỏi mở (chốt với backend trước khi code)
- `eta_s` thuật toán phía orchestrator (EWMA theo trial? theo fold?) — FE chỉ render, nhưng cần biết null khi nào (trước fold đầu?).
- SSE auth: cookie session hay token query? (EventSource không custom header) — đề xuất cookie same-origin.
- Console retention server-side: bao lâu? (backfill "load older" phụ thuộc).
- Cancel semantics: kill ngay hay graceful sau trial hiện tại? — UI copy confirm dialog cần khớp: đề xuất "Cancel run? The current trial finishes, then the run stops and is marked FAILED (USER_CANCELLED)."

## 23. Confirm dialog cancel (spec đầy đủ)
- Trigger: nút "cancel run" mono 10px #b43a3a viền 1px, góc phải header console.
- Dialog: role=alertdialog; title "Cancel R-WFO-119?"; body copy §22; nút "keep running" (secondary, autofocus) + "cancel run" (đỏ #b43a3a nền, chữ trắng).
- Escape/click-out = keep running. Sau xác nhận: nút chuyển "cancelling…" disabled; chờ run_failed event (không tự đổi trạng thái trước server).

## 24. Phi phạm vi (nhắc lại + bổ sung)
- Không multi-run dashboard; không so sánh tiến độ 2 run.
- Không chỉnh budget từ UI.
- Không realtime chart equity khi RUNNING (equity chỉ có sau khi fold seal — artifact; chart sống là 04 việc sau COMPLETED).
- Không notification/browser push khi hoàn tất (v2 — portal notification center).


## 25. Trạng thái nút & control ledger (tổng hợp nhanh cho QA)
- `run preflight`-style không tồn tại ở màn này — control gồm:
- console filter chip "all": on mặc định
- console filter chip "fold {n}": on khi foldCursor pin
- console filter chip "errors": lọc tone=error|infeasible
- auto-scroll toggle: ON mặc định; OFF khi user cuộn lên
- nút "↓ latest": chỉ hiện khi auto-scroll OFF
- nút "load older": chỉ hiện khi đã chạm đầu buffer và server còn dòng
- nút "cancel run": chỉ hiện khi status ∈ {QUEUED, RUNNING}
- nút "open evidence flow →": chỉ hiện khi status = COMPLETED
- stage cell link: chỉ khi state ∈ {done, issued}
- artifact link: chỉ khi state = sealed
- gantt fold click: mọi fold có event; fold pend không click
- SSE dot: không phải control (aria-hidden)

## 26. Thứ tự render ưu tiên (streaming-first)
1. Header + stage rail (khung nhận thức).
2. Progress + budget (con số quan trọng nhất).
3. Claim passport (trạng thái pháp lý của run).
4. Gantt.
5. Console (nặng nhất — mount sau cùng, height cố định tránh CLS).
6. Artifacts.
- CLS mục tiêu = 0 (mọi khối có kích thước đặt trước; console height 260 cố định).

## 27. Glossary nhanh
- FORECAST: claim dự báo từ ma trận mode×schedule — chưa phải sự thật.
- ISSUED: claim engine phát tại Stage 5 — bất biến.
- seq: số thứ tự event; nguồn chân lý chống out-of-order.
- foldCursor: fold đang pin để link deep-dive + filter console.
- terminal state: COMPLETED | FAILED — sau nó không patch nào được áp.

> End of spec 03 · v1.1 · pair with hi-fi `QuantBT 03 Run Progress.dc.html`.
