# SPEC 08 · S4 Execute Replay — `QuantBT 08 S4 Execute Replay.dc.html`

> Deep-dive Stage 4: replay thực thi bar-by-bar với artifact TRUNG THỰC THEO ROUTE. Guide plan cho agent code; copy VERBATIM; số = CSS px.
> Luật gốc: (1) route quyết định artifact nào TỒN TẠI — thứ không tồn tại render `not_applicable` có lời, không bao giờ bảng rỗng câm; (2) transport một nguồn thời gian — mọi panel nghe cùng seq; (3) mọi fill có causal chain đọc được.

---

## 1. Meta

| Key | Value |
|---|---|
| File hi-fi | `QuantBT 08 S4 Execute Replay.dc.html` |
| Route | `/research/quantbt/runs/{id}/execute` |
| Vai trò | Candle replay (lightweight-charts) + markers, stitched-account fold strip, transport (play/speed/seek), event ledger, trade blotter, causal chain per fill, MAE×MFE, exit-leg labels, verdict tiles, route-aware panels (intrabar ambiguity / OCO / wake trace / DCA ladder), tab Validation (nautilus parity) |
| Persona | researcher · auditor (event ledger + chain) · manager (verdict tiles) |
| Shell | Có |
| Inbound | 04 tab execute · 07 next-stage · 03 stage rail S4 · 09 liên kết ngược |
| Outbound | breadcrumb 04 · next-stage `Run Report →` (09) · trade → cursor seq |
| Hash | `#fold=&seq=&trade=` (+pass-through) |
| Tweaks (hi-fi) | route: close_target / intrabar / lifecycle / reactive / dca · validation on/off · scale 5/32 |
| Console chuẩn | 0 error/warning |

## 2. Layout anatomy (top → bottom)

### 2.1 Header + route banner
- Breadcrumb + title **S4 · Execute Replay — how orders came to exist** + subtitle italic: "Every fill below has a cause you can read. What the route cannot produce is declared not_applicable — honesty, not absence."
- Route banner (nền #f4f2ec): `route {id} → contract {contract}` + backend resolved + report_level chip (`audit` xanh / `standard` / `minimal` vàng + title "fill ledger absent at this level — the engine said so, not the UI").

### 2.2 Stitched fold strip
- N đoạn equity mini nối nhau; ranh giới fold có chip `⇄ param handoff` (title: digest fold trước → sau); đoạn hiện hành viền xanh; click đoạn → fold cursor + seek đầu fold.
- ≥20 fold: strip cuộn ngang trong card, snap từng đoạn; nút ‹ › fold.

### 2.3 Candle replay (lightweight-charts v5, height 360)
- CandlestickSeries màu: up #1e7b4f / down #b43a3a wick cùng màu; volume histogram pane dưới (60px, #a8c6ce mờ).
- Markers: entry ▲ dưới nến (xanh) / exit ▼ trên nến (đỏ khi loss, xanh gain) + exit-leg label chữ mono 8px (`TP1`, `SL`, `TRAIL`, `TIME`).
- Route intrabar: 2 price line SL/TP quanh vị thế mở (LineStyle.Dotted #b43a3a/#1e7b4f) + nến ambiguous: marker ⚠ vàng (circle) + tooltip same_bar_policy.
- Crosshair sync với event ledger (hover nến → highlight event cùng ts).
- KHÔNG autoscale nhảy khi play — visible range trượt theo playhead (logical range shift), zoom user giữ.

### 2.4 Transport bar (sticky trong card replay)
- Nút: `⏮ fold start` · `◀ step` · `▶ play/pause` · `step ▶` · `fold end ⏭` + speed pill `1× 4× 16× 64×` + seek slider (theo seq) + readout mono `bar 412/552 · seq 1042 · 2023-08-14 04:00Z`.
- Play: rAF loop; mỗi tick áp N event theo speed; pause khi tab ẩn; Space toggle; ←/→ step; Shift+←/→ nhảy 10.

### 2.5 Event ledger (cửa sổ ~14 hàng quanh playhead)
- Cột: `seq 56 · ts 118 · kind 120 · detail flex · Δequity 90`.
- kind grammar: SIGNAL (#0f4c5c) · ORDER_NEW / ORDER_CANCEL / ORDER_REPLACE (#4e5a6e) · FILL (#1e7b4f đậm) · FUNDING (#9a6a1f) · MARK (#939db0) · REJECT (#b43a3a).
- Hàng playhead nền #e2edf0; click hàng → seek seq đó; FILL click → mở causal chain.
- Route close_target: kinds chỉ SIGNAL/TARGET/FILL(close)/FUNDING — cột vẫn đủ, không kind giả.

### 2.6 Causal chain drawer (panel phải 380px hoặc inline dưới ledger khi hẹp)
- Cho FILL đang chọn: chuỗi mắt `SIGNAL seq 1031 → ORDER_NEW seq 1032 (intent sl/tp đính kèm) → [ORDER_REPLACE …] → FILL seq 1042 @ 29,412.5 · qty 0.42 · fee 1.2bps → position Δ + equity Δ`.
- Mỗi mắt: card mono nhỏ + ts; mắt thiếu (route không sinh) ghi `not_applicable — {route} emits no order events` xám nghiêng.
- Nút `copy chain` (text log).

### 2.7 Trade blotter (bảng full-width)
- Cột: `# 40 · side 44 · entry ts/px · exit ts/px · leg 56 · qty 56 · pnl 72 · mae 64 · mfe 64 · bars 48 · fold 48`; filter side/leg/fold; sort pnl/mae/bars; pager 25/hàng (1,042 trades).
- Row click → seek entry seq + highlight markers; đang-mở (chưa exit) nền vàng nhạt.
- Route intrabar: thêm cột `ambig 44` — ⚠ đếm nến ambiguous trong đời trade (title policy).

### 2.8 MAE × MFE scatter + verdict tiles
- Scatter: x=MAE% y=MFE%, diagonal từ (0,0) tới min(maxX,maxY) làm mốc; điểm win xanh/loss đỏ mờ; click điểm → trade row.
- Trục: max làm tròn per-axis (nice number); KHÔNG ép vuông.
- Verdict tiles (manager): `fills matched 1,042/1,042` · `slippage p50 1.8bps · p95 4.6bps` · `funding paid −$412` · `reject rate 0` · `ambiguous bars 7 · policy stop_first` (route intrabar) — tile nào route không sinh → not_applicable xám nghiêng.

### 2.9 Route-aware panel (1 khối, đổi theo route)
- close_target_v2: card "orders & fills not_applicable — close_target_v2 fills at next close; the causal chain is SIGNAL → TARGET → CLOSE-FILL." (xám, chữ nghiêng phần not_applicable).
- intrabar: bảng ambiguity — nến ⚠: `ts · both-touch (SL & TP in bar) · resolved: stop_first · flag kept in ledger`.
- lifecycle: OCO tree — parent order + 2 leg, leg huỷ có strikethrough + `OCO cancel seq`.
- reactive: wake-trace strip dưới equity — tick mỗi bar sampler dậy: nguồn `price|timer|order-event` màu khác nhau + đếm `wakes 214 of 552 bars (38%) · audit_mode=audit`; audit_mode=minimal → panel nói "wake trace absent — audit_mode=minimal declared it away" (không vẽ).
- dca: ladder chain — rung fills B0→S3 nối position avg-price line.

### 2.10 Tab Validation (hiện khi run có artifact)
- Card parity: `equity Δ 0.00% · fills matched 1,042/1,042 · funding Δ $0.00 · PARITY PASS → engine cert L4`; depth preflight verdicts; nếu không artifact → tab ẩn hoàn toàn (không tab trống).

### 2.11 Rules footer
"The transport is the only clock — every panel listens to the same seq. A missing artifact is declared with its reason (route or report_level), never rendered as an empty table. Replays are read-only: nothing here mutates a run."

## 3. Data contract

```ts
interface ExecuteDetail {
  run_id: string; fold: number;
  route: { id: RouteId; contract: string; backend: string;
           report_level: 'minimal'|'standard'|'audit'|'score' };
  candles: { t: number; o: number; h: number; l: number; c: number; v: number }[]; // fold window
  markers: { seq: number; t: number; kind: 'entry'|'exit'; side: 'L'|'S';
             leg?: 'TP1'|'TP2'|'SL'|'TRAIL'|'TIME'; win?: boolean }[];
  pricelines: { from_seq: number; to_seq: number; sl: number; tp: number }[] | null;  // intrabar
  ambiguous: { t: number; policy: string; note: string }[] | null;
  events: { seq: number; ts: string; kind: string; detail: string; dEquity: string }[];
  chains: Record<number /*fill seq*/, ChainLink[]>;
  trades: TradeRow[];                         // pager server-side: ?page=&sort=
  maemfe: { x: number; y: number; win: boolean; trade: number }[];
  tiles: { k: string; v: string; na?: string }[];       // na = câu not_applicable
  routePanel: RoutePanelUnion;                          // theo route.id
  validation: ParityCard | null;
  stitched: { k: number; pts: number[]; handoff: string|null }[];
  foldMeta: { bars: number; seq0: number; seq1: number };
}
type ChainLink = { seq: number|null; kind: string; text: string; na?: boolean };
```
- Endpoints: `GET /runs/{id}/execute?fold=k` (core, ETag) · `GET …/trades?fold=&page=&sort=` · `GET …/events?fold=&around_seq=&limit=100` (window).
- Nguồn: fill ledger + event tape (report_level=audit) · trades.parquet · parity artifact (nautilus) — read-model đóng gói; **na strings do server viết** (một nguồn cho lý do not_applicable).
- 1,042 trades: blotter server-pager; events window quanh playhead (fetch thêm khi seek xa — debounce 200ms).

## 4. Transport engine (spec chính xác)
```ts
interface Transport { playing: boolean; speed: 1|4|16|64; seq: number; }
// tick rAF: seq += speed sự kiện mỗi 1/30s (đều theo EVENT, không theo bar)
// seek(seq): clamp [seq0, seq1]; mọi panel đọc seq qua context; candle visible-range trượt giữ playhead ở 70% khung
```
- Panel subscribe qua useSyncExternalStore (store nhỏ riêng — KHÔNG Redux; 30fps không được kéo cả app).
- Đổi fold: transport dừng, seq = seq0 fold mới.
- Events window: nếu seq ngoài window đã tải → fetch around_seq (spinner inline 1 hàng, không che bảng).

## 5. Pitfalls — chớ làm sai
1. WRONG: route nào cũng render đủ panel rồi để trống. RIGHT: RoutePanelUnion + na strings server — bảng rỗng câm bị cấm.
2. WRONG: transport setState Redux mỗi tick. RIGHT: external store + useSyncExternalStore; re-render chỉ panel nhìn seq.
3. WRONG: chart autoscale mỗi tick (giật). RIGHT: logical range shift; autoscale chỉ khi đổi fold.
4. WRONG: blotter tải 1,042 hàng DOM. RIGHT: server pager 25 + sort server.
5. WRONG: chain thiếu mắt thì bỏ mắt. RIGHT: mắt na với lý do route.
6. WRONG: ambiguity chỉ là icon không policy. RIGHT: tooltip + bảng policy verbatim.
7. WRONG: wake trace tự suy từ fills khi audit_mode=minimal. RIGHT: câu declared-away.
8. WRONG: parity tab hiện trống khi không artifact. RIGHT: ẩn tab.
9. WRONG: seek xa khoá UI chờ fetch. RIGHT: window cũ giữ, hàng "loading events…" inline.
10. WRONG: marker exit không leg label. RIGHT: leg luôn có (TIME nếu hết hạn).
11. WRONG: MAE×MFE ép trục vuông làm bẹt phân bố. RIGHT: per-axis nice max.
12. WRONG: play tiếp khi tab ẩn (cháy CPU). RIGHT: visibilitychange pause; badge "paused (tab hidden)".
13. WRONG: dùng emoji ⚠ thật. RIGHT: ký hiệu vẽ (triangle SVG inline) — nhất quán font.

## 6. Test matrix
| ID | Precondition | Action | Expected |
|---|---|---|---|
| T01 | close_target fixture | load #fold=3 | banner route; tiles có na nghiêng; panel not_applicable card; ledger kinds đúng subset |
| T02 | play 16× | 2s | seq tăng đều; ledger window trượt; playhead 70% khung; không autoscale nhảy |
| T03 | click event FILL | — | chain drawer mở đúng seq; copy chain hoạt động |
| T04 | intrabar fixture | load | SL/TP pricelines; 7 marker ambiguous; bảng ambiguity; blotter cột ambig |
| T05 | lifecycle fixture | — | OCO tree; leg huỷ strikethrough + seq |
| T06 | reactive audit | — | wake strip 3 màu nguồn; đếm "214 of 552 (38%)" |
| T07 | reactive minimal | — | câu declared-away; không strip |
| T08 | dca fixture | — | ladder chain B0→S3 + avg line |
| T09 | validation on | — | tab hiện; PARITY PASS → cert L4 text |
| T10 | validation off | — | tab ẩn hoàn toàn |
| T11 | blotter sort pnl desc | click | server sort; page reset 1 |
| T12 | blotter row click | — | seek entry seq; markers highlight; hash trade= |
| T13 | scatter click điểm | — | trade row focus (page nhảy đúng) |
| T14 | stitched handoff chip hover | — | title digest trước→sau đúng canonical |
| T15 | đổi fold ‹ › | — | transport dừng; seq0 mới; hash fold |
| T16 | seek slider kéo xa | — | events fetch around; inline loading; không khoá |
| T17 | 32-fold | load | strip cuộn snap; fold nav ok |
| T18 | tab ẩn khi playing | — | pause + badge; quay lại resume thủ công |
| T19 | Space/←/→/Shift+→ | — | play/step/x10 đúng |
| T20 | 660px | resize | chain inline dưới ledger; blotter cuộn ngang; không tràn |
| T21 | axe | scan | transport buttons aria-label; ledger row button; slider aria-valuetext "bar {n} of {m}"; 0 serious |
| T22 | reduced-motion | — | playhead vẫn chạy (chức năng) nhưng highlight không pulse |

## 7. Copy inventory — VERBATIM
- Subtitle §2.1 · rules footer §2.11.
- not_applicable card close_target: "orders & fills not_applicable — close_target_v2 fills at next close; the causal chain is SIGNAL → TARGET → CLOSE-FILL."
- report_level minimal title: "fill ledger absent at this level — the engine said so, not the UI"
- wake declared-away: "wake trace absent — audit_mode=minimal declared it away"
- paused badge: "paused (tab hidden)"
- handoff chip: "⇄ param handoff" + title "prm_{a} → prm_{b}"
- parity: "PARITY PASS → engine cert L4"
- chain na mẫu: "not_applicable — {route} emits no order events"

## 8. Per-element CSS ledger (đặc thù)
- `.ex-transport`: display flex; align-items center; gap 8px; padding 8px 12px
- `.ex-transport`: border-top 1px solid #efede4; background #faf9f5; position sticky; bottom 0
- `.ex-tbtn`: border 1px solid #e3e0d7; border-radius 6px; background #fff; width 30px; height 26px; font mono 11px
- `.ex-tbtn[data-on=true]`: border-color #0f4c5c; background #e2edf0; color #0f4c5c
- `.ex-speed`: như se-pill grammar; 4 giá trị
- `.ex-seek`: flex 1; accent-color #0f4c5c
- `.ex-readout`: font mono 10px; color #4e5a6e; white-space nowrap
- `.ex-ledger row`: mono 10.5px; padding 3px 12px; border-bottom #f4f2ec; min-width 720px
- `.ex-ledger [data-play=true]`: background #e2edf0
- kind colors §2.5 (data-kind attr)
- `.ex-chain`: width 380px; border-left 1px solid #e3e0d7; padding-left 14px
- `.ex-chain .link`: border 1px solid #e3e0d7; radius 6px; padding 6px 10px; margin 4px 0; font mono 10px
- `.ex-chain .link[data-na=true]`: color #939db0; font-style italic; border-style dashed
- `.ex-wake`: height 26px; position relative; border 1px solid #efede4; background #fdfdfa
- `.ex-wake .tick[data-src=price]`: background #0f4c5c; [timer]: #9a6a1f; [order-event]: #1e7b4f; width 2px; top 2px; bottom 2px
- `.ex-ambig-marker`: tam giác SVG 10px fill #9a6a1f
- `.ex-tile .na`: color #939db0; font-style italic
- `.ex-strip seg[data-cur=true]`: outline 1.5px solid #0f4c5c

## 9. TS architecture
```
<ExecutePage>
  const core = useExecuteDetail(runId, cursor.fold);
  const transport = useTransport(core.foldMeta);       // external store
  <PortalShell…>
    <RouteBanner/> <StitchedStrip onFold/> 
    <ReplayChart candles markers pricelines transportSeq/>  // lightweight-charts, fonts.ready
    <TransportBar store/>
    <div class=row> <EventLedger window seq onPick/> <ChainDrawer chain/> </div>
    <RouteAwarePanel union/>
    <TradeBlotter pager/> <MaeMfe scatter/> <VerdictTiles/>
    {core.validation && <ValidationTab/>}
```
- ReplayChart: markers setMarkers theo seq ≤ playhead (append incremental — không setMarkers full mỗi tick; batch 100ms).
- ChainDrawer inline khi < 1100px.

## 10. Guide plan
1. Transport store + unit (clamp, speed, pause-on-hidden) — T02/T18/T19.
2. Fixtures 5 route (số liệu từ hi-fi logic; canonical digests cho handoff).
3. ReplayChart + markers incremental — T02/T04.
4. EventLedger window + around_seq fetch — T03/T16.
5. ChainDrawer + na links — T03/T01.
6. RouteAwarePanel union 5 nhánh — T01/T04–T08.
7. Blotter pager/sort + scatter + tiles — T11–T13.
8. Validation tab — T09/T10.
9. A11y/motion/responsive — T20–T22.
10. DoD: T01–T22 xanh; copy diff 0; screenshot 5 route + validation ≤1%; CPU play 16× < 30% một core.

## 11. Phi phạm vi
- Không export video replay; không chỉnh fill; không slippage what-if (attempt mới).
- Không realtime feed — dữ liệu là tape đã seal.

## 12. Glossary
- transport/seq: đồng hồ duy nhất của màn — chỉ số sự kiện trong tape fold.
- causal chain: chuỗi SIGNAL→ORDER→FILL của một fill — bằng chứng nhân quả.
- ambiguous bar: nến chạm cả SL lẫn TP — same_bar_policy quyết định và flag ở ledger.
- wake trace: những bar sampler reactive thức dậy + nguồn đánh thức.
- param handoff: ranh giới fold nơi digest params đổi (per-fold schedule).

> End of spec 08 · v1.1 · pair with hi-fi `QuantBT 08 S4 Execute Replay.dc.html`.
