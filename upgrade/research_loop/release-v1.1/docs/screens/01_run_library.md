# SPEC 01 · Run Library — `QuantBT 01 Run Library.dc.html`

> Agent đọc hi-fi + spec này là code được màn thật. Copy trong spec là VERBATIM. Mọi giá trị số là CSS px.
> Nguyên tắc gốc: **thư viện render bằng chứng, không xếp hạng** — cert/claim đến từ Stage 5 của từng run; UI không suy diễn.

---

## 1. Meta

| Key | Value |
|---|---|
| File hi-fi | `QuantBT 01 Run Library.dc.html` |
| Route | `/research/quantbt/runs` |
| Vai trò | Điểm vào chính của domain: chọn run theo BẰNG CHỨNG (trail S1–S5, claim, cert, binding alpha·av_, rc) |
| Persona | researcher (chính) · manager (đọc claim/cert) · auditor (trail + superseded) |
| Shell | Có — topbar 56px + sidebar 248px (nhóm active: Research › QuantBT Backtest) |
| Inbound | Journey P3 · breadcrumb "Runs" từ 02 · sidebar |
| Outbound | 02 (New Run) · 03 (card RUNNING) · 04 (open evidence →, kèm cursor) · 10 (lineage) · 11 (rc chip) · 13 (compare bar) |
| Console chuẩn | 0 error, 0 warning |

---

## 2. Layout anatomy (top → bottom)

### 2.1 Khung
```
<shell topbar 56px/>
<shell sidebar 248px/> | <content>
                          width 100% · max-width 1280px · margin 0 auto ·
                          min-width 0 · padding 18px 26px 72px ·
                          flex column · gap 14px
```

### 2.2 Header block
- Breadcrumb 12px: `Runs` (đậm cuối chuỗi; topbar crumb: Research / QuantBT Backtest / Runs).
- Title Newsreader 22px/300: **Run Library**.
- Subtitle italic 13.5px #939db0: "Every card carries its own evidence — the trail, the claim, the certificate. The library renders them; it ranks nothing."
- Nút phải: `new run →` — viền 1px #0f4c5c, radius 6px, padding 4px 12px, mono 10px uppercase → `02`.

### 2.3 Filter bar (1 card trắng, radius 6px, padding 9px 14px, flex wrap, gap 8px)
Trái → phải:
1. `<input>` filter — width 230px, nền #faf9f5, placeholder "filter by run id, alpha, symbol…", mono 11px.
2. Vách `1px × 18px #e3e0d7`.
3. Label `status` (10px uppercase #939db0) + 3 chip: `completed` `running` `failed`.
4. Vách.
5. Label `mode` + 4 chip: `mode_1` `mode_2` `mode_5` `train_test`.
6. Vách.
7. Label `alpha` + 3 chip: `alpha_momentum_btc` `alpha_meanrev_eth` `scratch only`.
8. Nút `group by alpha` (chip radius 6px, toggle).
9. Counter mono 9.5px #939db0: `{N} of {M} runs`.
10. `margin-left:auto` → **claims ledger strip**: thanh 10px cao, 4 đoạn màu (đếm theo claim family) + caption mono 9.5px.

Chip grammar (dùng CHUNG toàn domain):
- Off: viền #e3e0d7, nền #fff, chữ #4e5a6e.
- On: viền #0f4c5c, nền #e2edf0, chữ #0f4c5c.
- On-warn (chip `scratch only`): viền/nền/chữ vàng #9a6a1f/#f4ecdb.
- Radius 999px, padding 2px 9px, mono 10px. Multi-select: mỗi chip là toggle độc lập (AND giữa nhóm, OR trong nhóm).

### 2.4 Group header (chỉ khi `group by alpha` bật)
```
<row> baseline · gap 10px · padding 6px 2px 0
  {alphaName} · {av}    mono 11px 700 #1c2532
  {sub}                 mono 9.5px #939db0
  <divider flex-1 border-bottom #e3e0d7/>
```
- sub bound: "strategy {strategy} · runs below share one immutable code artifact".
- sub scratch: "iterate freely · NOT_PUBLISHABLE". Nhóm scratch sort cuối.

### 2.5 Run card (lặp; card trắng radius 8px, padding 12px 16px, shadow chuẩn)
**Hàng 1 (header, baseline, wrap, border-bottom #efede4, padding-bottom 8px):**
| # | Element | Style | Nội dung/State |
|---|---|---|---|
| 1 | checkbox compare | 16px vuông, viền #c9c5ba; checked: nền #0f4c5c chữ ✓ trắng | chọn tối đa 2 (chọn cái 3 → thay cái cũ nhất) |
| 2 | run_id | mono 13px 700 | `R-WFO-118` |
| 3 | status pill | mono 8.5px 700 uppercase radius 999px | COMPLETED xanh #1e7b4f (viền) · RUNNING xanh đặc + pulse dot · FAILED đỏ #b43a3a |
| 4 | mode chip | mono 10px, viền #e3e0d7, nền #faf9f5 | `mode_1_decay · per_fold_causal` |
| 5 | binding chip | bound: như mode chip; scratch: viền DASHED #9a6a1f nền #fdfbf5 chữ vàng | `alpha_momentum_btc · av_0_9_3` / `scratch` — title đầy đủ ở tooltip |
| 6 | instrument | mono 10px #939db0 | `BTCUSDT · 4h` |
| 7 | rc chip (nếu có) | mono 9.5px 700 radius 999px, LINK → 11 | `rc_ (draft) · DRAFT` vàng · `rc_2026_08_c · APPROVED` xanh |
| 8 | cert chip | mono 10px 700, viền 1.5px màu theo hạng | `B` #9a6a1f · `C` #b4772f · `D` #b43a3a · null: `—` viền #c9c5ba |
| 9 | created | mono 9.5px #939db0, `margin-left:auto` | `2026-08-12 04:18Z` |
| 10 | open link | mono 10px uppercase | `open evidence →` (RUNNING: `watch progress →` → 03) |

**Hàng 2 (body, padding-top 8px, flex gap 18px wrap):**
1. **Evidence trail** — label 9px uppercase "evidence trail" + 5 ô S1…S5 (mỗi ô 26×18px, mono 9px):
   - `done` nền #e2edf0 viền #0f4c5c · `cap` nền #f4ecdb viền #9a6a1f (stage đặt trần cert — tooltip nói trần gì) · `blocked` nền #f7e8e8 viền #b43a3a · `run` viền xanh + pulse · `pend` viền #e3e0d7 chữ #c9c5ba.
   - Tooltip từng ô VERBATIM theo data (vd S2 của 118: "S2 Search — strict schedule, no cap").
2. **Sparkline** — label ("OOS equity" / "search progress" khi RUNNING); 150×26px, 24 cột 4px, màu #a8c6ce, cột cuối #0f4c5c; FAILED: 8 cột rồi đứt + ô đỏ.
3. **Stats** — 3 cặp label/value (label 9px uppercase; value mono 13px 600): COMPLETED = `OOS sharpe · Δ decay · trades`; RUNNING = `progress · trials · elapsed`; FAILED = `failed at · reason · runtime` (đỏ).
4. **Claim quote** — border-left 2px #9a6a1f, mono 9.5px vàng, max-width 300px: câu claim VERBATIM từ Stage 5 (vd "STRICT_OUTER_OOS — OOS read once after freeze · holdout sealed caps ≤ B"). RUNNING: "claim pending — engine issues it at Stage 5, never before".

**Hàng 3 (chỉ run có attempt bị thay):** strip mờ 0.7, border-top dashed: badge `superseded` + "att_00 · replaced by this attempt after a config fix — kept for lineage, may never support an approval".

### 2.6 Compare bar (fixed cuối list khi có selection)
- 1 chọn: nền #fff viền #e3e0d7 — note "pick one more run sharing the same ComparisonContractKey…".
- 2 chọn cùng key: viền #0f4c5c nền #e2edf0, nút `open compare →` (→ 13, query `?runs=a,b`).
- 2 chọn khác key: viền #b43a3a nền #f7e8e8, nút DISABLED, note VERBATIM: "these two runs do not share a ComparisonContractKey (symbol · timeframe · route · protocol) — a side-by-side would be a comparison lie, so the button refuses." + nút `clear`.

### 2.7 Rules footer
Label 9.5px uppercase "rules of this screen" + 1 đoạn 11px #4e5a6e (verbatim hi-fi).

---

## 3. Tính động — state machine từng control

### 3.1 URL là single source of truth cho filter
`/research/quantbt/runs?q=&status=&mode=&alpha=&group=1&sel=R-1,R-2`
- Mọi thay đổi filter → replaceState (không push); back/forward khôi phục nguyên trạng; share URL = share view.
- `sel` (compare) là push (điều hướng có ý nghĩa).

### 3.2 Filter pipeline (thứ tự cố định)
```
runs → text q (match run_id|alpha|av|rc_id|instrument|mode, case-insensitive)
     → status ∈ set → mode prefix ∈ set → alphaKey ∈ set
     → group? sort (alphaName??'zz_scratch', av, created desc) : sort created desc
```
- Counter luôn cập nhật `{visible} of {total} runs`; filter về 0 → empty state (§8), KHÔNG ẩn filter bar.

### 3.3 Compare selection
- State: `sel: string[]` max 2, FIFO thay thế; checkbox card + row compare bar đồng bộ.
- Disable không tồn tại ở checkbox — mọi run chọn được; tính hợp lệ chỉ quyết định Ở compare bar (người dùng được phép "thử sai" và nhận lời giải thích).

### 3.4 RUNNING card live
- Poll `GET /runs?ids=…` 10s cho card RUNNING đang hiển thị (hoặc SSE nếu trang 03 đã mở kênh chung); cập nhật stats + trail ô `run`; KHÔNG reorder list khi status đổi (giữ vị trí tới lần filter/sort kế).
- Pulse dot: `@keyframes` opacity 1→.35→1, 1.4s — chỉ chạy khi status RUNNING.

### 3.5 Hover/focus
- Card KHÔNG có hover state toàn khối (card không phải link) — chỉ các phần tử con (link, chip rc, checkbox) có hover riêng + focus ring token chuẩn.

---

## 4. Data contract

### 4.1 Endpoint
```
GET /api/v1/quantbt/runs
  ?q&status[]&mode[]&alpha[]&cursor&limit=50
→ 200 { items: RunSummary[], total: number, cursor?: string }
```
Server áp filter được thì áp; client vẫn giữ pipeline §3.2 cho demo/offline parity.

### 4.2 Types (đầy đủ)
```ts
export type RunStatus = 'COMPLETED' | 'RUNNING' | 'FAILED';
export type StageKey = 'S1'|'S2'|'S3'|'S4'|'S5';
export type StageState = 'done'|'cap'|'blocked'|'run'|'pend';
export type CertGrade = 'A'|'B'|'C'|'D';

export interface StageCell { s: StageState; tip: string; }          // tip verbatim từ engine
export interface MetricCell { k: string; v: string; tone?: 'bad'|'accent'; } // đã format server-side
export interface RcRef { id: string; state: 'DRAFT'|'APPROVED'|'EXPIRED'|'SUPERSEDED'; }
export interface AlphaBinding { alphaId: string; alphaName: string; av: string; digest: string; }

export interface RunSummary {
  run_id: string;
  attempt_id: string;
  status: RunStatus;
  mode: string;                    // "mode_1_decay · per_fold_causal" — chuỗi hiển thị từ server
  strategy_id: string;
  binding: AlphaBinding | null;    // null = scratch = NOT_PUBLISHABLE
  rc: RcRef | null;
  instrument: string;              // "BTCUSDT · 4h"
  created_at: string;              // ISO UTC, hiển thị "YYYY-MM-DD HH:mmZ"
  cert: CertGrade | null;
  claim_string: string;            // VERBATIM Stage-5 (hoặc câu pending/failed)
  stages: [StageCell,StageCell,StageCell,StageCell,StageCell];
  stats: [MetricCell,MetricCell,MetricCell];
  superseded_note: string | null;
  comparison_contract_key: string; // "BTCUSDT·4h·close_target_v2·walk_forward"
  sparkline_kind: 'oos_equity'|'search_progress'|'failed';
}
```

### 4.3 Sparkline
`GET /api/v1/quantbt/runs/{id}/sparkline → { values: number[] /*≤24, đã downsample*/ }` — lazy load bằng IntersectionObserver, placeholder cột xám #efede4 trong lúc chờ; lỗi → giữ placeholder + title "sparkline unavailable".

### 4.4 Field → element mapping (bảng bắt buộc khi review PR)
| Field | Element | Ghi chú |
|---|---|---|
| run_id | header#2 | mono 700 |
| status | pill#3 + trail ô `run` | pulse chỉ khi RUNNING |
| binding | chip#5 | null → chip dashed `scratch` |
| rc | chip#7 | null → không render (không chừa chỗ) |
| cert | chip#8 | null → `—` |
| claim_string | quote hàng 2 | KHÔNG truncate — wrap tối đa 300px |
| stages[i].tip | tooltip ô i | verbatim |
| comparison_contract_key | logic compare bar | không hiển thị trực tiếp |

### 4.5 Kết nối backend (chuỗi đầy đủ)
```
quantbt-engine (artifacts: claim payload, cert, stage states, metrics_summary.json)
  → portal backend BAR-12 read-model (đóng gói RunSummary, format số, câu claim verbatim)
  → GET /runs (envelope trên)
  → UI render — KHÔNG tính lại, KHÔNG format lại số (server đã format kèm đơn vị)
```
- Registry alpha (U14) cung cấp binding qua join server-side — FE không tự join.
- Governance store cung cấp `rc` ref — nguồn duy nhất cho chip rc (không suy từ tên run).
- RUNNING data từ run-orchestrator (cùng nguồn màn 03).

---

## 5. TS component architecture

```
<RunLibraryPage>
  useRunsQuery(filtersFromUrl)               // RTK Query
  <PortalShell active="quantbt/runs">
    <LibraryHeader onNewRun/>
    <FilterBar value={filters} counts={{visible,total}} ledger={claimLedger}/>
    <RunList>                                 // react-window khi items > 50
      {grouped(items).map(row =>
        row.kind === 'group'
          ? <GroupHeader {...row}/>
          : <RunCard run={row.run}
                     selected={sel.includes(row.run.run_id)}
                     onToggleSelect/>)}
    </RunList>
    {sel.length > 0 && <CompareBar sel={selRuns} onClear/>}
    <RulesFooter text={RULES_01}/>
```

```ts
// hooks
function useRunFilters(): [Filters, (patch: Partial<Filters>) => void]  // đọc/ghi URL
function useCompareSelection(): { sel: string[]; toggle(id: string): void; clear(): void }
const canCompare = (a: RunSummary, b: RunSummary) =>
  a.comparison_contract_key === b.comparison_contract_key
    ? { ok: true as const }
    : { ok: false as const, reason: REFUSAL_COPY };   // pure, unit-tested
```

- `RunCard` là component thuần props (không fetch) — sparkline là `<LazySparkline runId>` tự quản IO.
- `grouped()` là selector memo hoá (reselect): trả mảng `{kind:'group'|'run'}` — group header là ROW của list ảo, không phải wrapper lồng (virtualization phẳng).
- Poll RUNNING: `useRunningRefresh(visibleRunningIds)` — một interval chung, không interval-per-card.

---

## 6. Scale & performance
- 50 run: render thẳng. > 50: react-window, itemSize đo động (card ~132px, group 34px), overscan 6.
- Sparkline: chỉ fetch khi vào viewport; huỷ khi unmount.
- Filter gõ chữ: debounce 150ms trước khi ghi URL; pipeline chạy trên memo.
- 1.000 runs: mục tiêu < 16ms/khung khi cuộn (đo bằng Profiler trong CI perf test).

---

## 7. Trạng thái đặc biệt
| State | Render |
|---|---|
| Loading đầu | 5 skeleton card (khối xám #efede4 đúng khung card, KHÔNG shimmer) |
| Lỗi fetch | card lỗi giữa trang: mã lỗi + `retry` — filter bar vẫn hiển thị |
| Empty (0 run thật) | "No runs yet." + nút `new run →` |
| Empty (filter về 0) | "0 of {M} runs match — loosen a filter." + nút `clear filters` |
| RUNNING → COMPLETED | stats/trail đổi tại chỗ; toast KHÔNG dùng; vị trí giữ nguyên |

---

## 8. Accessibility
- Checkbox có `aria-label="select {run_id} for compare"`.
- Status pill có `role=status` khi RUNNING (screen reader đọc cập nhật tiến độ tối đa 1 lần/phút — throttle aria-live).
- Trail ô là `<span role=img aria-label={tip}>`.
- Toàn bộ interactive đạt hit-target ≥ 24px (checkbox 16px + padding 4px mỗi phía).

---

## 9. UX anti-patterns (cấm)
1. Cấm sort theo Sharpe/metric mặc định — thứ tự là created desc; "ranks nothing" là luật.
2. Cấm màu hoá giá trị metric theo tốt/xấu ở stats (trừ FAILED đỏ) — tránh biến library thành leaderboard.
3. Cấm truncate claim_string hoặc paraphrase nó.
4. Cấm ẩn run FAILED/superseded khỏi mặc định — bằng chứng xấu cũng là bằng chứng.
5. Cấm auto-mở compare khi đủ 2 selection — người dùng bấm nút.
6. Cấm spinner toàn trang — skeleton cục bộ.

---

## 10. Acceptance checklist
1. [ ] URL round-trip: set đủ 4 nhóm filter + group + 2 selection → reload → nguyên trạng.
2. [ ] Counter đúng ở mọi tổ hợp filter; 0-match hiện đúng empty copy.
3. [ ] Chip grammar đúng token cả 3 trạng thái (off/on/on-warn) — so screenshot với hi-fi.
4. [ ] Card RUNNING: pulse, stats live, link "watch progress →" đi 03.
5. [ ] rc chip chỉ hiện khi có rc; click đi 11; scratch chip dashed + tooltip đúng câu.
6. [ ] Trail tooltip đúng verbatim data từng ô; ô `cap` vàng ở đúng stage đặt trần.
7. [ ] Compare: cùng key → nút mở 13 kèm `?runs=`; khác key → disabled + câu từ chối verbatim; chọn run thứ 3 thay run cũ nhất.
8. [ ] Group by alpha: header đúng format, scratch cuối, virtualization vẫn phẳng.
9. [ ] 1.000 run cuộn mượt; sparkline lazy; không request trùng.
10. [ ] Không tràn ngang ở 660px; card wrap đúng (hàng 1 wrap trước, claim quote xuống dòng).
11. [ ] Console sạch; không warning React key.
12. [ ] Mọi số liệu hiển thị đúng chuỗi server gửi (không toFixed lại phía FE).

---

## 11. Per-element CSS ledger

### 11.1 Filter bar
- `.rl-filter`: border 1px solid #e3e0d7; border-radius 6px; background #ffffff
- `.rl-filter`: box-shadow 0 1px 2px rgba(28,37,50,.05); padding 9px 14px
- `.rl-filter`: display flex; flex-wrap wrap; align-items center; gap 8px
- `.rl-filter input`: border 1px solid #e3e0d7; border-radius 6px; background #faf9f5
- `.rl-filter input`: padding 4px 10px; font-family JetBrains Mono; font-size 11px; width 230px; outline none
- `.rl-filter input:focus-visible`: ring token chuẩn
- `.rl-divider`: width 1px; height 18px; background #e3e0d7
- `.rl-grouplabel`: font-size 10px; uppercase; letter-spacing .07em; font-weight 500; color #939db0
- `.chip`: border-radius 999px; padding 2px 9px; font-family JetBrains Mono; font-size 10px
- `.chip[data-on=false]`: border 1px solid #e3e0d7; background #ffffff; color #4e5a6e
- `.chip[data-on=true]`: border 1px solid #0f4c5c; background #e2edf0; color #0f4c5c
- `.chip[data-on=true][data-warn=true]`: border/vàng #9a6a1f; background #f4ecdb; color #9a6a1f
- `.chip`: transition border-color/background/color 120ms cubic-bezier(.2,0,.2,1)
- `.rl-groupbtn`: như .chip nhưng border-radius 6px
- `.rl-counter`: font-family JetBrains Mono; font-size 9.5px; color #939db0
- `.rl-ledger`: margin-left auto; display flex; gap 2px; height 10px; border-radius 5px; overflow hidden
- `.rl-ledger caption`: mono 9.5px #939db0

### 11.2 Group header
- `.rl-group`: display flex; align-items baseline; gap 10px; padding 6px 2px 0
- `.rl-group .id`: font-family JetBrains Mono; font-size 11px; font-weight 700; color #1c2532
- `.rl-group .sub`: mono 9.5px; color #939db0
- `.rl-group .rule`: flex 1; border-bottom 1px solid #e3e0d7

### 11.3 Run card
- `.rl-card`: border 1px solid #e3e0d7; border-radius 8px; background #ffffff
- `.rl-card`: box-shadow chuẩn; padding 12px 16px
- `.rl-card[data-hero=true]`: border-color #0f4c5c (run nổi bật/tham chiếu)
- `.rl-head`: display flex; align-items baseline; gap 10px; flex-wrap wrap
- `.rl-head`: border-bottom 1px solid #efede4; padding-bottom 8px
- `.rl-check`: width 16px; height 16px; border 1px solid #c9c5ba; border-radius 4px; background #fff
- `.rl-check[data-on=true]`: background #0f4c5c; color #fff; nội dung "✓" 10px
- `.rl-runid`: mono 13px 700
- `.rl-status`: mono 8.5px 700; uppercase; letter-spacing .06em; radius 999px; padding 1px 8px
- `.rl-status[data-s=COMPLETED]`: viền #1e7b4f; chữ #1e7b4f
- `.rl-status[data-s=RUNNING]`: nền #1e7b4f; chữ #fff; + dot 6px pulse 1.4s
- `.rl-status[data-s=FAILED]`: viền #b43a3a; chữ #b43a3a
- `.rl-modechip / .rl-avchip`: mono 10px; radius 999px; viền #e3e0d7; nền #faf9f5; padding 1px 8px; chữ #4e5a6e
- `.rl-avchip[data-scratch=true]`: border DASHED #9a6a1f; nền #fdfbf5; chữ #9a6a1f
- `.rl-rcchip`: mono 9.5px 700; radius 999px; padding 1px 8px; nền #fff; là <a>
- `.rl-rcchip[data-state=DRAFT]`: viền/chữ #9a6a1f — [APPROVED] #1e7b4f — [EXPIRED|SUPERSEDED] #939db0
- `.rl-cert`: mono 10px 700; viền 1.5px; padding 0 6px; radius 3px
- `.rl-created`: margin-left auto; mono 9.5px #939db0
- `.rl-open`: mono 10px; uppercase; letter-spacing .05em; màu link #0f4c5c
- `.rl-body`: display flex; align-items center; gap 18px; padding-top 8px; flex-wrap wrap
- `.rl-trail label / .rl-spark label / .rl-stat label`: 9px uppercase .07em #939db0
- `.rl-trail .cell`: width 26px; height 18px; mono 9px; display grid; place-items center
- `.rl-trail .cell[data-s=done]`: nền #e2edf0; viền 1px #0f4c5c; chữ #0f4c5c
- `.rl-trail .cell[data-s=cap]`: nền #f4ecdb; viền #9a6a1f; chữ #9a6a1f
- `.rl-trail .cell[data-s=blocked]`: nền #f7e8e8; viền #b43a3a; chữ #b43a3a
- `.rl-trail .cell[data-s=run]`: viền #0f4c5c; chữ #0f4c5c; pulse
- `.rl-trail .cell[data-s=pend]`: viền #e3e0d7; chữ #c9c5ba
- `.rl-spark`: width 150px; height 26px; display flex; gap 1px; align-items flex-end
- `.rl-spark .col`: width 4px; background #a8c6ce — .col:last #0f4c5c — placeholder #efede4
- `.rl-stat .v`: mono 13px 600 — [data-tone=bad] #b43a3a
- `.rl-claim`: mono 9.5px; color #9a6a1f; border-left 2px solid #9a6a1f; padding-left 6px; max-width 300px; line-height 1.45
- `.rl-superseded`: margin-top 8px; border-top 1px dashed #e3e0d7; padding-top 6px; opacity .7; mono 10px #939db0
- `.rl-superseded .badge`: uppercase .06em; viền 1px #c9c5ba; radius 3px; padding 0 5px

### 11.4 Compare bar
- `.rl-compare`: position sticky; bottom 12px; display flex; gap 12px; align-items center
- `.rl-compare`: border-radius 8px; padding 10px 14px; box-shadow 0 4px 14px rgba(28,37,50,.12)
- `.rl-compare[data-mode=one]`: viền #e3e0d7; nền #ffffff
- `.rl-compare[data-mode=ok]`: viền #0f4c5c; nền #e2edf0
- `.rl-compare[data-mode=refused]`: viền #b43a3a; nền #f7e8e8
- `.rl-compare .title`: mono 10px 700 uppercase .08em
- `.rl-compare .note`: font-size 11.5px; line-height 1.5; flex 1
- `.rl-compare .btn[disabled]`: viền dashed #c9c5ba; chữ #939db0; cursor not-allowed
- `.rl-compare .clear`: mono 10px; underline; color #4e5a6e; background none; border 0

## 12. Pitfalls — chớ làm sai

1. WRONG: sort mặc định theo Sharpe/metric. RIGHT: created desc — "ranks nothing" là bất biến sản phẩm.
2. WRONG: FE tự format số (toFixed, %) từ raw. RIGHT: server gửi chuỗi đã format kèm đơn vị; FE render nguyên.
3. WRONG: suy rc từ pattern tên run hoặc claim. RIGHT: rc chỉ đến từ governance ref trong RunSummary.
4. WRONG: filter chạy trên server một kiểu, client một kiểu (lệch đếm). RIGHT: pipeline §3.2 là spec chung; test parity 2 phía cùng fixture.
5. WRONG: mất selection khi filter đổi. RIGHT: sel giữ nguyên — run bị filter ẩn vẫn nằm trong sel, compare bar chú thích "(hidden by filter)".
6. WRONG: interval poll mỗi card RUNNING. RIGHT: một interval chung cho danh sách id RUNNING đang hiển thị.
7. WRONG: virtualization lồng group (list trong list). RIGHT: hàng phẳng {group|run} — đo size 2 loại.
8. WRONG: truncate claim bằng ellipsis. RIGHT: wrap trong 300px; claim là bằng chứng, không phải caption.
9. WRONG: click cả card mở evidence (card=link). RIGHT: chỉ "open evidence →"/"watch progress →" là link — card chứa nhiều control con.
10. WRONG: đổi copy từ chối compare. RIGHT: verbatim; copy là hợp đồng với user test.
11. WRONG: skeleton shimmer animation. RIGHT: khối tĩnh #efede4 — chuẩn portal.
12. WRONG: refetch toàn list khi 1 run COMPLETED. RIGHT: patch cache theo id (RTK Query updateQueryData).
13. WRONG: dựng chip bằng <button> cho binding/mode (không toggle). RIGHT: chip data là <span>, chip filter là <button aria-pressed>.
14. WRONG: đếm "N of M" sau debounce (nhảy số trễ). RIGHT: đếm theo state hiển thị hiện tại — đồng bộ cùng frame render list.

## 13. Test matrix

| ID | Precondition | Action | Expected |
|---|---|---|---|
| T01 | 7 run fixture | load | 7 card, thứ tự created desc, counter "7 of 7 runs" |
| T02 | — | gõ "wfo-118" | 1 card; counter "1 of 7"; xoá → 7 |
| T03 | — | chip completed + mode_1 | giao đúng AND-giữa-nhóm; counter khớp |
| T04 | — | chip scratch only | chỉ SBB-021 + FULL-004 |
| T05 | — | bật group by alpha | 3 section: momentum(av_0_9_3 rồi av_0_9_2)… scratch cuối; header sub đúng câu |
| T06 | — | reload với URL đầy filter | khôi phục đúng; back/forward hoạt động |
| T07 | — | chọn 118 + 117 | compare ok (cùng key) → nút mở /compare?runs=… |
| T08 | — | chọn 118 + TT-002 | refused: viền đỏ, nút disabled, copy verbatim |
| T09 | 2 đã chọn | chọn run thứ 3 | thay run CŨ NHẤT trong sel (FIFO) |
| T10 | card RUNNING | đợi poll | stats đổi tại chỗ; không reorder; pulse chạy |
| T11 | run RUNNING → COMPLETED (mock) | poll kế | pill đổi, trail S2 done, link đổi "open evidence →" |
| T12 | rc DRAFT | click rc chip | điều hướng 11 |
| T13 | binding null | xem chip | dashed "scratch"; tooltip câu NOT_PUBLISHABLE đầy đủ |
| T14 | 1000 run fixture | cuộn nhanh | 60fps profiler; sparkline chỉ fetch card đã vào viewport |
| T15 | API 500 | load | error card + retry; filter bar vẫn hiện |
| T16 | filter về 0 | — | copy "0 of 7 runs match — loosen a filter." + nút clear |
| T17 | 660px | resize | hàng head wrap; claim xuống dòng; không tràn ngang |
| T18 | keyboard | Space trên checkbox | toggle; aria-label đúng "select R-WFO-118 for compare" |
| T19 | trail hover | hover S1 ô cap | tooltip verbatim "S1 Split — holdout sealed · cap ≤ B (binding)" |
| T20 | superseded run | xem card 118 | strip att_00 hiện đúng câu, opacity .7 |
| T21 | ledger strip | so tổng | tổng đoạn = số run COMPLETED có claim; caption đúng |
| T22 | axe-core | scan | 0 serious violation |

## 14. Guide plan cho agent code

1. Types + fixtures trước: `RunSummary` (§4.2) + 7-run fixture chép từ hi-fi (giữ nguyên chuỗi) + 1000-run generator (seeded).
2. `useRunFilters` (URL round-trip) — unit test T06 trước khi có UI.
3. `canCompare` pure + test T07/T08/T09.
4. FilterBar (ledger §11.1) — storybook: đủ trạng thái chip, counter.
5. RunCard (ledger §11.3) — storybook 6 story: completed-bound-rc / completed-scratch / running / failed / superseded / hero.
6. Virtualized list + grouping selector — test T05, T14.
7. CompareBar 3 mode — T07/T08.
8. Wire RTK Query + poll RUNNING — T10/T11 với msw mock.
9. Empty/error/loading — T15/T16.
10. A11y pass — T18/T19/T22.
11. DoD: checklist §10 + toàn bộ T01–T22 xanh + screenshot diff hi-fi ≤1% ở 1280/660.

## 15. Backend chi tiết — cache, event, lỗi

### 15.1 RTK Query slice
```ts
runsApi.endpoints.listRuns: query<RunsPage, Filters>
  providesTags: [{type:'Run', id:'LIST'}, ...items.map(r=>({type:'Run', id:r.run_id}))]
runsApi.endpoints.sparkline: query<number[], string>   // keepUnusedDataFor 300s
onRunEvent (SSE chung với 03): dispatch(updateQueryData('listRuns', …, draft => patch theo run_id))
```
- Invalidation: tạo run mới (02) → invalidate 'LIST'; run COMPLETED → patch tại chỗ, KHÔNG invalidate LIST (giữ vị trí).
- Poll fallback khi SSE đóng: 10s, chỉ khi tab visible (document.visibilitychange).

### 15.2 Bảng lỗi endpoint
| Endpoint | Lỗi | UI |
|---|---|---|
| GET /runs | 401 | redirect login portal chuẩn |
| GET /runs | 403 | trang "no access to research module" |
| GET /runs | 500/timeout | error card + retry; giữ filter bar |
| GET /runs | 200 items rỗng | empty state §7 |
| GET sparkline | bất kỳ | giữ placeholder, title "sparkline unavailable", không retry tự động |
| SSE | drop | chuyển poll im lặng; không banner |

### 15.3 Idempotency & ordering
- Patch RUNNING áp theo `updated_at` — event cũ hơn state hiện tại thì bỏ (out-of-order SSE).
- `sel` không bao giờ chứa id không tồn tại: sau mỗi fetch, sel = sel ∩ ids (nếu run bị xoá quyền).

### 15.4 Quan hệ với các màn
- 01 → 04: href `/runs/{id}` + KHÔNG kèm hash (04 tự đọc hash riêng của nó; cursor thuộc 04).
- 01 → 03: `/runs/{id}/progress` cho RUNNING.
- 01 → 13: `/compare?runs=a,b` — 13 tự validate lại key (không tin query).
- 01 → 11: rc chip `/release-candidates/{rcId}` (hoặc route run-scoped v1: `/runs/{id}/release-candidate`).
- 14 → 01: sau register, filter mặc định `?alpha={alphaName}` để thấy ngay runs của av_ mới (chưa có → empty đúng nghĩa).

## 16. Phi phạm vi
- Không bulk action (archive/delete) — runs bất biến.
- Không cột tuỳ chỉnh/kéo thả.
- Không export CSV từ màn này (Report 09 là nơi xuất).
- Không infinite scroll — virtualization + cursor "load more" khi total > limit (nút cuối list, mono, "load 50 more · {còn lại}").

## 17. Copy inventory — VERBATIM (cấm viết lại)

Header:
- Title: "Run Library"
- Subtitle: "Every card carries its own evidence — the trail, the claim, the certificate. The library renders them; it ranks nothing."
- Nút: "new run →"

Filter bar:
- placeholder: "filter by run id, alpha, symbol…"
- labels: "status" · "mode" · "alpha"
- chips alpha: "alpha_momentum_btc" · "alpha_meanrev_eth" · "scratch only"
- nút group: "group by alpha"
- counter: "{n} of {m} runs"

Group headers:
- bound sub: "strategy {id} · runs below share one immutable code artifact"
- scratch: "scratch — unbound" / "iterate freely · NOT_PUBLISHABLE"

Card:
- open links: "open evidence →" · "watch progress →"
- superseded: "att_00 · replaced by this attempt after a config fix — kept for lineage, may never support an approval"
- claim pending: "claim pending — engine issues it at Stage 5, never before"
- claim failed: "no claim — the run failed before Stage 5; failure detail lives in the run console"

Tooltips binding chip:
- bound: "bound to {alphaName} {av} — publishable evidence"
- scratch: "no alpha_version binding — NOT_PUBLISHABLE, rc_ can never be composed from this run"

Tooltips rc chip:
- DRAFT: "release candidate being composed from this run — open the RC screen"
- khác: "published rc from this run's params · {state}"

Compare bar:
- 1 chọn: "pick one more run sharing the same ComparisonContractKey to unlock compare."
- refused: "these two runs do not share a ComparisonContractKey (symbol · timeframe · route · protocol) — a side-by-side would be a comparison lie, so the button refuses."
- nút: "open compare →" · "clear"

Empty states:
- không run: "No runs yet."
- filter 0: "0 of {m} runs match — loosen a filter."

Rules footer: "Certification and claim strings come from each run's Stage 5 — the library renders them, it ranks nothing. Compare only unlocks for runs sharing a ComparisonContractKey (symbol · timeframe · route · protocol); two different contracts side by side would be a comparison lie, so the button refuses instead of obliging. Superseded attempts stay visible for lineage and are excluded from every approval path."

> End of spec 01 · v1.1 · pair with hi-fi `QuantBT 01 Run Library.dc.html`.
