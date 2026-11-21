# SPEC 04 · Evidence Flow hub — `QuantBT 04 Evidence Flow.dc.html`

> Màn trung tâm của domain: MỘT hub, MỘT cursor, BẢY stage-tab. Guide plan cho agent code; copy VERBATIM; số = CSS px.
> Luật gốc: (1) claim bar render giá trị engine — không suy diễn; (2) cursor không bao giờ reset khi đổi stage; (3) mọi con số click được đều dẫn về màn/stage chứng minh nó.

---

## 1. Meta

| Key | Value |
|---|---|
| File hi-fi | `QuantBT 04 Evidence Flow.dc.html` |
| Route | `/research/quantbt/runs/{id}` |
| Vai trò | Hub của một run: claim strip · run header (identity + dataset drawer) · 7 tab (Summary / Split / Search / Freeze / Execute / Claim / Atlas) · evidence cursor xuyên file |
| Persona | researcher · manager (Summary + Claim) · auditor (Claim + manifest) |
| Shell | Có |
| Inbound | 01 "open evidence →" · 03 bàn giao · 05–09/11 breadcrumb ngược · 12 deep-link |
| Outbound | 05/06/07/08 (deep-dive kèm cursor) · 09 (generate report) · 11 (release candidate) · 12 (Atlas tab link) · 14 (chip av_) |
| Hash | `#stage=&fold=&trial=&params=&schedule=&route=` — đọc khi mount, ghi mỗi thay đổi (replaceState) |
| Console chuẩn | 0 error/warning |

### 1.1 Bảy stage-tab (id · label)
`summary` Summary · `split` S1 · Split · `search` S2 · Search · `freeze` S3 · Freeze · `execute` S4 · Execute · `claim` S5 · Claim · `atlas` Atlas

- Tab S1–S4 trong hub là bản TÓM TẮT + nút "open deep dive →" sang màn 05–08; nội dung sâu sống ở màn riêng.
- Tab `claim` là nơi DUY NHẤT chứa claim tables / cert chain / artifact manifest (11 không lặp lại).
- Tab `atlas` là preview 5 mode + link sang 12.

## 2. Layout anatomy

### 2.1 Claim strip (sticky dưới topbar, nền #fdfbf5, viền dưới #9a6a1f 1px)
Chuỗi chip mono 10px, cách nhau dot #c9c5ba, wrap được:
1. `validation_claim` — vd `strict_nested_fold_local_retraining`
2. `chronological_claim` — vd `strict_outer_oos_after_frozen_selection`
3. `oos_used_for_selection false`
4. `holdout SEALED` (vàng)
5. `causality PASS` (xanh)
6. `execution_contract close_target_v2`
7. `runtime authority python · below_promotion_min_bars` (title = full reason)
8. `cert B` chip 1.5px viền vàng — title "min of stage caps — S1 holdout seal binds"
- Mỗi chip click → nhảy tab/stage đặt giá trị đó (cert → claim tab; contract → execute; …).
- Schedule switcher demo (hi-fi): 2 pill `per_fold_causal` / `per_fold_decay` — đổi toàn strip + cert B↔C (tweak; portal thật: read-only từ run).

### 2.2 Run header (card trắng)
- Hàng 1: run_id mono 15px 700 + status pill + binding chip `alpha_momentum_btc · av_0_9_3` (→ tooltip + link 14) + rc chip (nếu có → 11) + created + engine chip `er_quantbt_1_1_1 · quantbt-engine==1.1.1[optimization]`.
- Hàng 2: `mode_1_decay · per_fold_causal` · `BTCUSDT · 4h` · route chip `signal_notional → close_target_v2` · dataset chip `ds_btcusdt_4h @ snap_2026_06_30` (click mở **dataset drawer**) · config digest `sha256:88ae02` · seed `42`.
- Nút phải: `generate report →` (→09) · `release candidate →` (→11) · `copy evidence link` (portal:// URL kèm cursor — clipboard + ✓ 1.5s).

### 2.3 Dataset drawer (overlay phải 420px, nền trắng, shadow lớn)
- Header: dataset id + snapshot + nút ×.
- Coverage bar: IS / OOS / holdout đoạn màu + patched bars đánh dấu.
- Bảng: rows total · gap scan (0 critical · 2 WATCH — từng gap giờ UTC) · vendor · tz UTC aligned · digest.
- Footer note: "identity pinned at submit — the run read exactly this snapshot; Data Catalog module is SOON."
- Đóng: ×, Escape, click backdrop. Focus trap khi mở.

### 2.4 Tab bar
- 7 tab pill (grammar chip, current nền #e2edf0); mỗi tab có sub 9px (vd Search: "fold {f} · trial {t}").
- Đổi tab: nội dung swap; cursor GIỮ; hash `stage=` cập nhật; scroll top nội dung (không trang).

### 2.5 Evidence cursor bar (dưới tab bar, nền #f4f2ec)
- Chuỗi mono 10.5px: `cursor · fold {f} · trial {t} · params {digest} · seq {n?}` + fold selector `‹ {fold_03} ▾ ›` + nút `reset to θ*`.
- Fold selector: prev/next + dropdown danh sách fold (windowed khi ≥20: nhóm 10).
- Mọi deep-dive link trong hub mang cursor hiện hành.

### 2.6 Tab Summary (mặc định)
- **Verdict header**: 1 câu — "5 folds · 3 PASS · 1 WARN · 1 DRAG — OOS 1.186, decay +0.18, the claim below is the strongest supported." (số từ metrics).
- **Equity + underwater** (lightweight-charts v5): area OOS stitched + drawdown pane dưới; fold boundary vạch dọc; click boundary → set fold cursor.
- **Rolling row**: rolling Sharpe (window 63) + rolling beta vs BTC (63) — 2 line chart nhỏ cạnh nhau.
- **Monthly heat**: grid tháng × năm, ô = return tháng, ramp mist→teal, âm đỏ nhạt; title từng ô "2024-03 · +4.2%".
- **Behavior tiles**: 6 ô — win rate · payoff · avg hold · turnover · max consec loss · exposure — label 9px + value mono 15px.
- **Per-fold verdict table** (điểm nhấn): cột `fold · OOS bar · S_OOS · decay · trades · maxDD · contrib · worst moment · verdict`; verdict chip PASS xanh/WARN vàng/DRAG đỏ; **sort worst-first mặc định**; click hàng → set fold + mở tab tương ứng lỗi (DRAG decay → search; DRAG execution → execute).
- ≥20 fold: bảng windowed 10 hàng + "show all {N}"; OOS bar cột mini.

### 2.7 Tab Split/Search/Freeze/Execute (tóm tắt trong hub)
Mỗi tab: 2–4 panel tóm tắt + nút `open deep dive → {05|06|07|08}` kèm cursor. Nội dung tóm tắt:
- split: fold strip + purge/embargo số + holdout seal card (cap ≤ B).
- search: mini surface + best≠selected cặp card + freeze-line caption.
- freeze: digest chain 3 mắt + ordering verdict PASS.
- execute: mini equity fold hiện hành + 3 verdict tiles + route contract note.

### 2.8 Tab Claim (S5 — nơi duy nhất)
- Claim tables: validation × chronological × oos_used × holdout (4 hàng, giá trị mono, nguồn ghi cạnh).
- **Cert chain**: hàng cap từng stage — S1 ≤B (holdout seal) · S2 ≤A · S3 ≤A · S4 ≤A ⇒ `cert = min = B`; cap binding là LINK về stage đặt nó.
- **Artifact manifest**: bảng 7 trạng thái (PRESENT · SEALED · DEGRADED · MISSING · NOT_APPLICABLE · WITHHELD · ABORTED) cho từng artifact; DEGRADED/MISSING có note verbatim.
- Window disclosure: IS/OOS/holdout span + "headline = OOS only".
- Nút: `generate report →` (09) · `release candidate →` (11).

### 2.9 Tab Atlas (preview)
- 5 mode card mini (tên + 1 câu + claim chip) + link `full atlas →` (12) + deep-link mỗi mode → 12#mode=.

## 3. Hash cursor contract (chuẩn chung 04/05/06/07/08)
```
#stage={summary|split|search|freeze|execute|claim|atlas}
&fold={int>=1}&trial={int}&params={digest}&schedule={id}&route={id}&seq={int?}
```
- Mount: parse hash → state; thiếu key → default (stage=summary, fold=1, trial/params từ run θ*).
- Mọi thay đổi state → replaceState hash (KHÔNG push — back = rời trang, đúng kỳ vọng).
- Deep-dive href = `{screen}.html#` + serialize cursor hiện hành (portal thật: route + hash giữ nguyên format).
- Breadcrumb từ deep-dive về hub mang lại nguyên hash — vòng tròn không mất cursor (invariant test).
- params digest luôn là digest CANONICAL của fold (prm_9d44f2 · 3b81c7 · 7c1a9e · c25a1d · 66e09b cho 5 fold demo).

## 4. Data contract

```ts
interface RunDetail {
  run_id: string; status: RunStatus; binding: AlphaBinding|null; rc: RcRef|null;
  engine: { release_id: string; pkg: string };            // "er_quantbt_1_1_1", "quantbt-engine==1.1.1[optimization]"
  mode: string; schedule: string; instrument: string;
  route: { id: RouteId; contract: string };
  dataset: { id: string; snapshot: string; drawer: DatasetDrawer };
  config_digest: string; seed: number | null; created_at: string;
  claim: ClaimStrip;                                       // 8 field §2.1 — chuỗi engine verbatim
  cursorDefaults: { fold: number; trial: number; params: string };
  folds: FoldVerdictRow[];
  summary: SummaryAnalytics;                               // equity, rolling, heat, tiles — mảng số đã downsample
  claimTab: { tables: KV[]; certChain: CertCapRow[]; manifest: ManifestRow[]; windows: KV[] };
  stagePreviews: Record<'split'|'search'|'freeze'|'execute', PreviewPanel[]>;
}
interface FoldVerdictRow { k: number; oos: number; decay: number; trades: number;
  maxdd: number; contrib: number; worst: string; verdict: 'PASS'|'WARN'|'DRAG';
  drag_target: 'search'|'execute'|null; params_digest: string; }
interface ManifestRow { name: string;
  state: 'PRESENT'|'SEALED'|'DEGRADED'|'MISSING'|'NOT_APPLICABLE'|'WITHHELD'|'ABORTED';
  note: string; digest?: string; }
interface CertCapRow { stage: StageKey; cap: CertGrade; reason: string; binding: boolean; }
```

Endpoints:
- `GET /api/v1/quantbt/runs/{id}` → RunDetail (một call, đủ hub — panel nặng lazy).
- `GET /api/v1/quantbt/runs/{id}/equity?scope=oos` → series (fetch khi tab summary mở; cache).
- Charts: lightweight-charts@5 (equity/underwater), ECharts@5.5.0 (heat/rolling) — pin version, fontFamily = tokens.

## 5. Backend wiring
```
engine artifacts (claim.json, metrics_summary.json, fold_results/, manifest)
  → BAR-12 read-model builder: dựng RunDetail MỘT LẦN khi run seal (immutable cache theo run_id + attempt)
  → GET /runs/{id} (ETag mạnh — 304 cho revisit)
  → hub render; cert chain/claim strings pass-through — KHÔNG tính lại min() ở FE (server tính, FE render + test parity)
```
- Verdict PASS/WARN/DRAG là OUTPUT của rule server (ngưỡng versioned trong read-model) — FE không chứa ngưỡng.
- drawer dataset đọc từ manifest của run — không gọi Data Catalog (SOON).

## 6. TS architecture
```
<EvidenceFlowPage>
  const run = useRunDetail(runId);                 // suspense + ETag
  const [cursor, setCursor] = useEvidenceCursor(); // hash sync (parse/serialize 1 nơi)
  <PortalShell…>
    <ClaimStrip claim={run.claim} onChipJump={setStage}/>
    <RunHeader run onDrawer onCopyLink/>
    {drawerOpen && <DatasetDrawer data onClose/>}   // portal + focus trap
    <StageTabs stage sub={tabSubs(cursor)}/>
    <CursorBar cursor folds onPick onReset/>
    <StagePanel stage>                              // switch 7 tab
      summary → <SummaryTab analytics folds cursor onFoldPick/>
      split|search|freeze|execute → <PreviewTab panels deepDiveHref(cursor)/>
      claim → <ClaimTab data links/>
      atlas → <AtlasPreview modes/>
```
- `useEvidenceCursor`: 1 hook sở hữu parse/serialize hash — EXPORT cho 05–08 dùng chung (package `quantbt/cursor`).
- Charts mount trong `useEffect`, destroy on unmount; resize qua ResizeObserver; theme object chung `chartTheme.ts` (fontFamily Inter/JetBrains Mono, màu token).
- Verdict table: component thuần + sort local (worst-first = server đã xếp; toggle cột chỉ đảo mảng).
- Panel nặng (equity/heat) lazy import — hub paint claim strip + header trước.

## 7. Pitfalls — chớ làm sai
1. WRONG: FE tính cert = min(caps). RIGHT: server tính; FE render + assert parity trong test (nếu lệch → báo lỗi console.error, hiển thị server value).
2. WRONG: reset cursor khi đổi tab. RIGHT: cursor bất biến qua tab — invariant test.
3. WRONG: pushState mỗi lần đổi fold (history rác). RIGHT: replaceState.
4. WRONG: chip claim strip là text tĩnh. RIGHT: mỗi chip click nhảy đúng tab nguồn.
5. WRONG: verdict ngưỡng hardcode FE. RIGHT: server rule versioned.
6. WRONG: drawer render inline đẩy layout. RIGHT: overlay portal 420px + backdrop.
7. WRONG: fetch toàn bộ equity full-res. RIGHT: server downsample ≤ 2000 điểm; zoom sâu là việc màn 08.
8. WRONG: giữ 2 nguồn digest fold (hub tự sinh). RIGHT: digest canonical từ RunDetail — mọi màn cùng chuỗi.
9. WRONG: tab claim lặp lại ở 11. RIGHT: 11 chỉ link về đây — một nguồn.
10. WRONG: đổi copy chip (vd "holdout LOCKED"→"locked"). RIGHT: verbatim engine string.
11. WRONG: chart init trước font load (đo sai width). RIGHT: document.fonts.ready trước mount chart.
12. WRONG: manifest state màu tự chế. RIGHT: 7 state đúng grammar (SEALED xanh · DEGRADED vàng · MISSING đỏ · NOT_APPLICABLE xám nghiêng · WITHHELD tím-xám #7a8699 · ABORTED đỏ nhạt · PRESENT ink).

## 8. Test matrix
| ID | Precondition | Action | Expected |
|---|---|---|---|
| T01 | mount không hash | — | stage=summary; cursor = θ* defaults; hash được ghi đủ key |
| T02 | hash #stage=execute&fold=4 | mount | tab execute; fold selector = fold_04; deep-dive href mang fold=4 |
| T03 | đổi tab search | — | hash stage=search; fold GIỮ; sub tab hiện "fold 4 · trial …" |
| T04 | click chip cert | — | nhảy tab claim; scroll top |
| T05 | click fold boundary trên equity | — | cursor fold đổi; verdict row highlight |
| T06 | verdict row DRAG (drag_target=execute) | click | tab execute + fold của hàng |
| T07 | fold selector ‹ › | click | prev/next; disabled ở biên |
| T08 | reset to θ* | click | cursor = defaults; hash cập nhật |
| T09 | dataset chip | click | drawer mở; Escape đóng; focus trả về chip |
| T10 | copy evidence link | click | clipboard chứa portal://…#đủ cursor; nút ✓ 1.5s |
| T11 | 32-fold run | mở summary | verdict windowed 10 + show all; fold dropdown nhóm 10 |
| T12 | manifest DEGRADED row | hover/inspect | note verbatim; màu đúng grammar |
| T13 | rc null | header | không chip rc; nút release candidate vẫn hiện (compose mới) |
| T14 | deep-dive → breadcrumb về | vòng tròn | hash nguyên vẹn (fold/trial/params không đổi) |
| T15 | ETag 304 | revisit | render từ cache; không flash |
| T16 | 660px | resize | claim strip wrap; bảng verdict cuộn ngang; drawer full-width |
| T17 | axe | scan | tab role=tablist/tab/tabpanel; drawer focus trap; 0 serious |
| T18 | equity chart | fold boundary click vùng touch 44px | hoạt động (hit area mở rộng) |

## 9. Copy inventory — VERBATIM (chuỗi hệ trọng)
- Cert tooltip: "min of stage caps — S1 holdout seal binds"
- Drawer footer: "identity pinned at submit — the run read exactly this snapshot; Data Catalog module is SOON."
- Verdict header mẫu: "5 folds · 3 PASS · 1 WARN · 1 DRAG — OOS 1.186, decay +0.18, the claim below is the strongest supported."
- Window disclosure: "headline = OOS only — IS and holdout never enter the headline row."
- Manifest WITHHELD note: "holdout series — sealed by protocol, read once at unlock, never rendered here."
- Cursor bar: "cursor · fold {f} · trial {t} · params {digest}" · nút "reset to θ*"
- Nút header: "generate report →" · "release candidate →" · "copy evidence link" / "✓ evidence link copied"

## 10. A11y & keyboard
- Tab bar: role=tablist; Arrow trái/phải; Home/End; aria-selected.
- Cursor fold selector: nút prev/next aria-label "previous fold/next fold"; dropdown listbox.
- Claim strip chip: button, aria-label "{k} {v} — jump to source".
- Drawer: role=dialog aria-modal; trap; Escape.
- Charts: aria-hidden + bảng data thay thế ẩn (sr-only) cho verdict table đã đủ.

## 11. Perf budget
- First paint hub (strip+header) < 300ms sau data; charts lazy sau.
- RunDetail ≤ 300KB JSON (downsample server).
- Đổi tab < 16ms script (panel đã mount giữ bằng display:none? KHÔNG — unmount, trừ summary cache chart instance).
- Bundle route < 220KB gzip (2 chart libs lazy chunk riêng).

## 12. Guide plan cho agent
1. `quantbt/cursor` package (parse/serialize/hook) + test T01/T02/T14 — TRƯỚC mọi UI.
2. ClaimStrip + RunHeader (fixture RunDetail canonical R-WFO-118) — chip jump.
3. StageTabs + CursorBar + PreviewTab khung.
4. SummaryTab: verdict table trước (giá trị cao nhất), rồi equity/underwater, rolling, heat, tiles.
5. ClaimTab (tables/chain/manifest/windows).
6. DatasetDrawer + AtlasPreview.
7. Wire endpoints + ETag + lazy chunks.
8. Test T01–T18; integration 03→04→06→04 giữ cursor.
9. DoD: checklist + screenshot diff 7 tab ≤1% (1280/660) + Lighthouse perf ≥ 80 route này.

## 13. Phi phạm vi
- Không edit/annotate trên hub (comment là hệ portal chung).
- Không so sánh 2 run trong hub (13 lo).
- Không realtime khi run RUNNING — hub chỉ mở cho run terminal; RUNNING redirect 03 (guard route).
- Không export ảnh chart (09 in ấn lo).


---

## 14. Per-element CSS ledger

### 14.1 Claim strip
- `.ef-strip`: position sticky
- `.ef-strip`: top 56px
- `.ef-strip`: z-index 20
- `.ef-strip`: background #fdfbf5
- `.ef-strip`: border-bottom 1px solid #9a6a1f
- `.ef-strip`: padding 7px 16px
- `.ef-strip`: display flex
- `.ef-strip`: flex-wrap wrap
- `.ef-strip`: align-items center
- `.ef-strip`: gap 6px 10px
- `.ef-chip`: font-family JetBrains Mono
- `.ef-chip`: font-size 10px
- `.ef-chip`: color #4e5a6e
- `.ef-chip`: background none
- `.ef-chip`: border 0
- `.ef-chip`: padding 0
- `.ef-chip b`: color #1c2532; font-weight 600
- `.ef-chip[data-tone=gold] b`: color #9a6a1f
- `.ef-chip[data-tone=green] b`: color #1e7b4f
- `.ef-chip:hover b`: text-decoration underline
- `.ef-dot`: color #c9c5ba; font-size 9px
- `.ef-cert`: border 1.5px solid #9a6a1f; border-radius 3px
- `.ef-cert`: padding 0 7px; font-weight 700; color #9a6a1f; background #fdfbf5

### 14.2 Run header
- `.ef-head`: border 1px solid #e3e0d7; border-radius 8px; background #ffffff
- `.ef-head`: box-shadow 0 1px 2px rgba(28,37,50,.05); padding 12px 16px
- `.ef-head`: display flex; flex-direction column; gap 8px
- `.ef-head .row`: display flex; flex-wrap wrap; align-items baseline; gap 8px 10px
- `.ef-runid`: font-family JetBrains Mono; font-size 15px; font-weight 700
- `.ef-enginechip`: font-family JetBrains Mono; font-size 9.5px; color #939db0
- `.ef-btn`: border 1px solid #0f4c5c; border-radius 6px; background #ffffff
- `.ef-btn`: color #0f4c5c; padding 4px 12px
- `.ef-btn`: font-family JetBrains Mono; font-size 10px; letter-spacing .05em; text-transform uppercase
- `.ef-btn[data-primary=true]`: background #9a6a1f; border-color #9a6a1f; color #ffffff

### 14.3 Tabs + cursor bar
- `.ef-tabs`: display flex; gap 4px; flex-wrap wrap
- `.ef-tab`: border 1px solid #e3e0d7; border-radius 6px; background #ffffff
- `.ef-tab`: padding 5px 12px; display flex; flex-direction column; gap 1px
- `.ef-tab[aria-selected=true]`: border-color #0f4c5c; background #e2edf0
- `.ef-tab .l`: font-family JetBrains Mono; font-size 10.5px; font-weight 600
- `.ef-tab .s`: font-size 9px; color #939db0
- `.ef-cursor`: background #f4f2ec; border 1px solid #efede4; border-radius 6px
- `.ef-cursor`: padding 6px 12px; display flex; align-items center; gap 10px; flex-wrap wrap
- `.ef-cursor .txt`: font-family JetBrains Mono; font-size 10.5px; color #4e5a6e
- `.ef-cursor .nav`: display flex; gap 4px; align-items center
- `.ef-cursor button`: border 1px solid #e3e0d7; border-radius 4px; background #fff
- `.ef-cursor button`: font-family JetBrains Mono; font-size 10px; padding 1px 7px
- `.ef-cursor button:disabled`: color #c9c5ba; cursor default

### 14.4 Summary panels
- `.ef-verdictrow`: display flex; align-items center; gap 10px
- `.ef-verdictrow`: font-family JetBrains Mono; font-size 10.5px
- `.ef-verdictrow`: padding 4px 12px; border-bottom 1px solid #f4f2ec
- `.ef-verdictrow[data-cur=true]`: background #e2edf0
- `.ef-verdict[data-v=PASS]`: color #1e7b4f; border 1px solid #1e7b4f
- `.ef-verdict[data-v=WARN]`: color #9a6a1f; border 1px solid #9a6a1f
- `.ef-verdict[data-v=DRAG]`: color #b43a3a; border 1px solid #b43a3a
- `.ef-verdict`: font-size 8.5px; font-weight 700; border-radius 3px; padding 0 5px
- `.ef-tile`: border 1px solid #e3e0d7; border-radius 6px; padding 8px 10px; background #fff
- `.ef-tile .k`: font-size 9px; uppercase; letter-spacing .07em; color #939db0
- `.ef-tile .v`: font-family JetBrains Mono; font-size 15px; font-weight 600
- `.ef-heatcell`: width 100%; aspect-ratio 1; border 1px solid #ffffff

### 14.5 Drawer + manifest
- `.ef-drawer`: position fixed; top 0; right 0; bottom 0; width 420px; max-width 92vw
- `.ef-drawer`: background #ffffff; box-shadow -8px 0 24px rgba(28,37,50,.18); z-index 60
- `.ef-drawer`: padding 16px; overflow-y auto
- `.ef-backdrop`: position fixed; inset 0; background rgba(28,37,50,.25); z-index 55
- `.ef-manifest .state`: font-family JetBrains Mono; font-size 9px; font-weight 700
- `.ef-manifest [data-s=SEALED]`: color #1e7b4f
- `.ef-manifest [data-s=DEGRADED]`: color #9a6a1f
- `.ef-manifest [data-s=MISSING]`: color #b43a3a
- `.ef-manifest [data-s=NOT_APPLICABLE]`: color #939db0; font-style italic
- `.ef-manifest [data-s=WITHHELD]`: color #7a8699
- `.ef-manifest [data-s=ABORTED]`: color #d08770

## 15. Fixture guide
- `RUN_118_DETAIL`: run canonical đầy đủ (5 fold, digests canonical, claim strip §2.1, manifest 9 hàng đủ 7 state xuất hiện ≥1 lần trừ ABORTED, DEGRADED = regime evidence).
- `RUN_118_32F`: biến thể 32 fold cho scale tests.
- `RUN_SCRATCH`: binding null — header không chip alpha; nút release candidate mở 11 ở trạng thái blocked (spec 11 §scratch).
- `RUN_MODE5`: claim NONE_FULL_SAMPLE_CALIBRATION; cursor không có OOS label ở sub tab; verdict table 1 hàng full-sample.
- Golden hash cases: 12 chuỗi hash → parse → serialize → phải idempotent (bao gồm key thừa bị bỏ, giá trị rác → default).

## 16. Điều phối cursor với 05–08 (hợp đồng liên màn)
1. Hook `useEvidenceCursor` là package chung — 05–08 import, KHÔNG copy.
2. Serialize thứ tự key CỐ ĐỊNH: stage, fold, trial, params, schedule, route, seq — diff URL ổn định cho test.
3. 05–08 chỉ ĐỌC + đề xuất thay đổi cursor (fold/trial/seq); `stage` chỉ hub ghi.
4. Màn deep-dive breadcrumb: href = hub route + hash hiện hành của màn đó (đã đổi fold thì mang fold mới về).
5. Integration test chuẩn: 04(fold2) → 06 đổi trial → về 04: trial mới, fold 2 giữ, stage=search.

## 17. Reviewer checklist
1. [ ] Cursor parse/serialize chỉ tồn tại trong package cursor (grep import).
2. [ ] Không còn min()/threshold nào trong FE cho cert/verdict (grep).
3. [ ] Chart destroy on unmount — không leak (test mount/unmount 20 lần, listener count ổn định).
4. [ ] document.fonts.ready trước chart init.
5. [ ] Copy khớp §9; manifest grammar §14.5 đủ 7 state.
6. [ ] Strip sticky không che nội dung khi wrap 2 dòng (padding-top nội dung theo chiều cao thực).
7. [ ] Guard: run RUNNING → redirect /progress.
8. [ ] ETag revisit không flash trắng.
9. [ ] Screenshot 7 tab + drawer ≤1% diff.
10. [ ] Bundle: chart chunks lazy, route chính < 220KB gzip.


## 18. Chart spec chi tiết

### 18.1 Equity + underwater (lightweight-charts v5)
- container: height 260px (equity) + 90px (underwater), width 100%
- series equity: AreaSeries
- lineColor #0f4c5c
- topColor rgba(15,76,92,.18)
- bottomColor rgba(15,76,92,.02)
- lineWidth 1.5
- series underwater: HistogramSeries color #b43a3a opacity theo giá trị
- timeScale: rightOffset 2; borderColor #e3e0d7; timeVisible true
- grid: vertLines/horzLines color #f4f2ec
- crosshair: mode Normal; label mono
- fold boundary: vertical line series (LineStyle.Dashed, #9a6a1f, width 1) + primitive click hit-area 44px
- watermark: none (cấm)
- layout.fontFamily: 'Inter'; layout.textColor #4e5a6e; background transparent

### 18.2 Rolling charts (ECharts 5.5.0)
- grid {left 40, right 8, top 8, bottom 20}
- xAxis type time; axisLabel fontSize 9; fontFamily JetBrains Mono
- series line: width 1.2; showSymbol false
- rolling Sharpe color #0f4c5c; rolling beta color #9a6a1f
- markLine y=0 (beta) style dashed #c9c5ba
- tooltip: axisPointer line; formatter mono; confine true

### 18.3 Monthly heat (ECharts heatmap)
- visualMap hidden; ramp 5 nấc #dbe5e7→#0f4c5c; âm: #f7e8e8→#b43a3a 2 nấc
- cell borderColor #ffffff borderWidth 1
- label hiển thị khi |v| ≥ 8% (fontSize 8.5 mono trắng)

## 19. Tab-by-tab dynamic table

| Tab | Fetch riêng | Cursor tương tác | Nút chính |
|---|---|---|---|
| summary | equity series (lazy) | fold qua boundary click + verdict row | — |
| split | không (preview từ RunDetail) | fold strip click → fold | open deep dive → 05 |
| search | không | mini-surface KHÔNG tương tác (preview) | open deep dive → 06 |
| freeze | không | — | open deep dive → 07 |
| execute | mini equity fold (lazy theo fold) | đổi fold → refetch mini | open deep dive → 08 |
| claim | không | cap binding link → stage | generate report · release candidate |
| atlas | không | — | full atlas → 12 |

- Preview panel LUÔN đóng dấu "preview — the deep dive owns the full story" (mono 9px #939db0) để không ai đọc preview như bản đầy đủ.

## 20. Telemetry
- `hub_view` {run_id, entry: referrer-screen}
- `hub_tab_change` {from, to}
- `hub_cursor_change` {field: fold|trial|reset}
- `hub_chip_jump` {chip}
- `hub_deepdive_click` {target: 05|06|07|08}
- `hub_report_click` / `hub_rc_click` / `hub_copy_link`
- Mục tiêu đo: tab nào được đọc, cursor có được dùng như thiết kế không.

## 21. Glossary
- evidence cursor: bộ {fold, trial, params, seq} định vị MỘT điểm bằng chứng xuyên 5 màn.
- claim strip: 8 chip giá trị engine — hộ chiếu của run, luôn nhìn thấy (sticky).
- preview tab: bản tóm tắt trong hub; deep dive là màn riêng sở hữu sự thật đầy đủ.
- manifest: danh sách artifact + 1 trong 7 trạng thái — NOT_APPLICABLE là khai báo trung thực, không phải thiếu.
- binding cap: cap stage đang quyết định cert tổng (min).

## 22. Empty/degraded render rules
- summary thiếu series (DEGRADED metrics): khung chart + banner vàng "metrics_summary DEGRADED — {note}" — KHÔNG chart rỗng câm.
- claim strip thiếu field (engine cũ): chip hiện `{key} —` xám + title "absent in this engine release" — không ẩn chip.
- manifest MISSING row: đỏ + note; nút release candidate ở header vẫn hoạt động (11 sẽ block đúng hàng).
- folds rỗng (mode 5): verdict table 1 hàng "full sample"; fold selector disabled cả hai đầu + label "single span".

## 23. Route guards & lifecycle
- RUNNING → redirect `/progress` (03). QUEUED → 03. FAILED → hub mở được (đọc bằng chứng partial + manifest ABORTED).
- 404 run → trang lỗi + link 01.
- Attempt cũ (superseded): banner mỏng vàng dưới header "attempt att_00 — superseded by att_04 · open latest →" (link đổi attempt).


## 24. Per-fold verdict — rule spec (server, ghi lại để FE test parity)
- PASS: oos ≥ 0.6 · decay ≤ 0.35 · maxdd ≥ -15%
- WARN: một tiêu chí lệch trong biên (oos ≥ 0.3 hoặc decay ≤ 0.6 hoặc maxdd ≥ -22%)
- DRAG: còn lại; drag_target = 'search' khi decay là nguyên nhân, 'execute' khi maxdd/worst-moment là nguyên nhân
- rule_version đi kèm RunDetail (`verdict_rule: 'v1'`) — đổi rule là đổi version, hiển thị ở footer bảng
- FE parity test: chạy rule trên fixture và so verdict server — lệch = fail build (bắt drift)

## 25. Thứ tự render ưu tiên & CLS
1. ClaimStrip (sticky khung nhận thức)
2. RunHeader
3. Tabs + CursorBar
4. Verdict table (số quan trọng trước hình)
5. Charts lazy (khung height cố định 260/90 đặt trước — CLS 0)
6. Drawer/Atlas chỉ khi gọi
- Skeleton: strip + header + bảng 5 hàng xám; KHÔNG spinner toàn trang.

## 26. Bảng kích thước cố định (chống trôi khi code)
- Claim strip top: 56px (bằng topbar) — thay đổi topbar phải sửa cả hai
- Cursor bar height: ~32px nội dung + padding — không cố định cứng, min-height 32
- Equity 260 · underwater 90 · rolling 120 mỗi cái · heat cell aspect 1 · tiles minmax(120px,1fr)
- Drawer 420 (max 92vw) · backdrop mờ .25
- Verdict cột: fold 64 · bar flex · oos 64 · decay 64 · trades 56 · maxdd 64 · contrib 64 · worst flex · verdict 64

## 27. Điều kiện hiển thị nút header (bảng quyết định)
| Nút | Điều kiện hiện | Điều kiện enable |
|---|---|---|
| generate report → | status COMPLETED | luôn (report render mọi trạng thái manifest) |
| release candidate → | status COMPLETED | luôn hiện; 11 tự block scratch/MISSING |
| copy evidence link | luôn | luôn |
| open latest → (banner) | attempt superseded | luôn |

## 28. Lỗi chart & fallback
- lightweight-charts load fail (CDN/chunk): render bảng fold-equity min (fold · start · end · return) thay chart + note "chart engine unavailable — numbers unaffected".
- ECharts fail: ẩn rolling/heat, tiles + verdict vẫn đủ đọc — hub không bao giờ trắng vì chart.
- Series rỗng: khung + "no series in artifact — see manifest".

## 29. Câu hỏi mở
- Attempt switcher đầy đủ (dropdown att_01..att_04) đặt ở header hay chỉ banner? (v1: banner; v1.1 portal: quyết sau khi có usage data).
- copy evidence link: scheme portal:// hay https deep link? — theo hạ tầng share của portal, giữ format cursor.

## 30. Golden hash cases (chép vào test, mỗi dòng một case)
1. `#` → defaults (summary, fold 1, θ* trial/params)
2. `#stage=claim` → tab claim, cursor defaults
3. `#stage=execute&fold=4` → execute, fold 4
4. `#fold=4` → summary, fold 4
5. `#stage=search&fold=3&trial=517` → search, fold 3, trial 517
6. `#stage=search&trial=abc` → trial default (rác → default)
7. `#stage=xyz` → summary (stage rác)
8. `#fold=99` (run 5 fold) → clamp fold 5
9. `#fold=0` → clamp fold 1
10. `#stage=execute&fold=2&seq=1042` → execute giữ seq (08 dùng)
11. `#params=prm_zzz` (không khớp fold nào) → giữ nguyên chuỗi, cursor bar hiển thị, note title "unknown digest"
12. serialize(parse(x)) === canonical(x) cho cả 11 case trên
13. đổi tab từ case 3 → `#stage=summary&fold=4` (fold giữ)
14. reset θ* từ case 5 → fold giữ 3? KHÔNG — reset về cursorDefaults trọn bộ (fold θ* = 3 demo) — assert đúng defaults
15. key thừa `&foo=1` → bị bỏ khi serialize lại

## 31. Sơ đồ luồng đọc điển hình (nhắc UX khi code)
manager: 01 → 04 summary (verdict header + bảng) → claim tab (cert chain) → 09 report
researcher: 03 bàn giao → 04 summary → DRAG row → 06/08 deep-dive → breadcrumb về (cursor giữ) → 11 publish
auditor: 04 claim (manifest 7 state) → 07 digest chain → 09 report in

> End of spec 04 · v1.1 · pair with hi-fi `QuantBT 04 Evidence Flow.dc.html`.
