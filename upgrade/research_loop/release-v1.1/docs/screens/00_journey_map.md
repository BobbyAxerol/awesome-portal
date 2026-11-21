# SPEC 00 · Journey Map — `QuantBT 00 Journey Map.dc.html`

> Spec đích: một agent đọc hi-fi này + spec này là dựng lại đúng màn bằng TS/React trong portal thật, không cần hỏi thêm.
> Trạng thái nguồn: hi-fi release v1.1 (frozen 2026-09-15). Mọi copy trong spec là VERBATIM từ hi-fi — không tự viết lại.

---

## 1. Meta

| Key | Value |
|---|---|
| File hi-fi | `QuantBT 00 Journey Map.dc.html` |
| Route đề xuất | `/research/quantbt/journey` |
| Vai trò | Bản đồ đọc (reading map) của toàn bộ domain backtest: 8 phase, mỗi phase là một hàng card; KHÔNG phải màn làm việc |
| Persona | Mọi persona; đặc biệt người mới vào domain và reviewer muốn hiểu luồng |
| Entry points | `index.html` redirect thẳng vào đây; sidebar không có mục riêng (đây là trang tổng quan ngoài shell) |
| Exit points | Mọi card là một link — 15 màn + các trang shipped portal-hifi |
| Shell | KHÔNG mặc shell portal (không topbar/sidebar) — đây là canvas tổng quan, in được, pan được |
| Console chuẩn | 0 error, 0 unresolved-hole warning |

### 1.1 Nguyên tắc màn
- Journey Map là VIEW tĩnh của registry màn — file cấu hình, không phải state.
- Ba loại card phân biệt bằng THỊ GIÁC (viền + badge), không bằng vị trí: `shipped` (trang portal đã ship), `redesign` (màn QuantBT mới — bộ này), `execution` (bàn giao sang Execution side — không phải màn research).
- Không card nào được phép mô tả quá 1 dòng rưỡi; mô tả là "cái màn này THÊM gì", không phải giới thiệu chung.

---

## 2. Vị trí trong luồng & liên kết

### 2.1 Outbound links (đầy đủ, theo phase)

| Phase | Card | Tag | Href |
|---|---|---|---|
| P1 | 01 · Login | shipped | `uploads/portal-hifi/01-login-research-6e03941d.html` |
| P1 | 02 · Command Center | shipped | `uploads/portal-hifi/02-command-center-research-1699576e.html` |
| P1 | 03 · Portal Map | shipped | `uploads/portal-hifi/03-portal-map-research-a906d25e.html` |
| P2 | 12 · Alpha imports | shipped | `uploads/portal-hifi/12-alpha-imports-research-c4c36e56.html` |
| P2 | Alpha Import — standardize av_ | redesign | `QuantBT 14 Alpha Import.dc.html` |
| P2 | 13 · Alpha version | shipped | `uploads/portal-hifi/13-alpha-version-research-4e2ddb3b.html` |
| P3 | 04 · Run Library | shipped | `uploads/portal-hifi/04-run-library-research-9cb36f03.html` |
| P3 | Run Library — evidence cards | redesign | `QuantBT 01 Run Library.dc.html` |
| P4 | 05 · New Run | shipped | `uploads/portal-hifi/05-new-run-research-31b929b0.html` |
| P4 | New Run — context · route · preflight | redesign | `QuantBT 02 New Run Preflight.dc.html` |
| P5 | 06 · Run Progress | shipped | `uploads/portal-hifi/06-run-progress-research-77e4b644.html` |
| P5 | Run Progress — claims pending | redesign | `QuantBT 03 Run Progress.dc.html` |
| P6 | Evidence Flow hub | redesign | `QuantBT 04 Evidence Flow.dc.html` |
| P6 | S1 · Split | redesign | `QuantBT 05 S1 Split.dc.html` |
| P6 | S2 · Search & Selection | redesign | `QuantBT 06 S2 Search and Selection.dc.html` |
| P6 | S3 · Freeze | redesign | `QuantBT 07 S3 Freeze.dc.html` |
| P6 | S4 · Execute Replay | redesign | `QuantBT 08 S4 Execute Replay.dc.html` |
| P6 | S5 · Claim (in hub) | redesign | `QuantBT 04 Evidence Flow.dc.html#stage=claim` |
| P6 | Attempt Lineage | redesign | `QuantBT 10 Attempt Lineage.dc.html` |
| P6 | Engine Atlas | redesign | `QuantBT 12 Mode Atlas.dc.html` |
| P6 | Compare | redesign | `QuantBT 13 Compare.dc.html` |
| P7 | Release Candidate & Publish | redesign | `QuantBT 11 Release Candidate and Publish.dc.html` |
| P7 | Run Report — one sheet | redesign | `QuantBT 09 Run Report.dc.html` |
| P7 | Paper Trading — SOON | shipped | `uploads/portal-hifi/03-portal-map-research-a906d25e.html` |
| P8 | Approval Inbox | execution | `QuantBT 11 Release Candidate and Publish.dc.html` |
| P8 | Gate R1 · research evidence | execution | `QuantBT 11 Release Candidate and Publish.dc.html` |
| P8 | Gate R2 · deployment fit | execution | `uploads/portal-hifi/03-portal-map-research-a906d25e.html` |
| P8 | Paper / Sandbox / Canary / Live | execution | `uploads/portal-hifi/03-portal-map-research-a906d25e.html` |

### 2.2 Inbound links
- `index.html` (meta refresh 0s) — điểm vào duy nhất chính thức.
- Breadcrumb "Journey" từ màn 14; các màn khác breadcrumb về 01/04 (map không nằm trong breadcrumb chuẩn — chủ đích: map là cửa, không phải hành lang).

### 2.3 Bảng mapping cuối trang (shipped tab → redesign)
6 hàng, VERBATIM:

| shipped | mine | adds |
|---|---|---|
| 07 · OVERVIEW | Evidence Flow · Summary | adds window disclosure (IS/OOS/holdout), rolling Sharpe & beta, monthly heat, behavior tiles |
| 08 · OPTIMIZATION | S2 · Search & Selection | adds search cinema, freeze line, per-mode formulas J₁…J₅, θ* journey, 4-state OOS column |
| 09 · PARAMETERS | S3 · Freeze | adds ordering verdict (wall clock vs data time), digest drift check, what-if as sibling attempt |
| 10 · EXECUTION | S4 · Execute Replay | adds event-level replay transport, causal chain per fill, route-honest not_applicable |
| 11 · AUDIT | hub S5 + Release Candidate | adds cert chain (min of caps), 7-state artifact manifest, report gate, promotion hooks |
| — no shipped tab | S1 · Split + Engine Atlas | fold anatomy, nested inner folds, holdout seal — and the modes × routes reference |

---

## 3. Layout anatomy

### 3.1 Khung trang
```
<page>                              background #faf9f5, min-height 100vh
  <content>                         max-width 1280px · margin 0 auto ·
                                    padding 16px 24px 56px · flex column · gap 12px
    <header row>                    title + intro + legend
    <phase row × 8>                 rail trái 150px + card row phải
    <mapping card>                  bảng 6 hàng shipped→mine
```
- KHÔNG shell (không topbar 56px, không sidebar 248px) — màn duy nhất cùng 09 được phép trần.
- Wrapper PHẢI fluid: `width:100%; max-width:1280px; min-width:0` — cấm width cứng.

### 3.2 Header
- Title: Newsreader 22px weight 300, letter-spacing -0.01em — "QuantBT Backtest — journey map".
- Subtitle italic Newsreader 13.5px #939db0 (1 câu).
- Legend 3 chip mẫu: shipped (viền #e3e0d7, chữ #939db0) · redesign (viền 1.5px #9a6a1f, nền #fdfbf5, chữ #9a6a1f) · execution (viền #1c2532, nền #f0f1f3, chữ #1c2532).

### 3.3 Phase row (lặp 8 lần)
```
<row> flex · gap 14px · align-items flex-start
  <rail> width 150px flex-none · padding-top 6px
    P{n}    JetBrains Mono 11px 700 #0f4c5c
    name    Inter 13px 600 #1c2532
    note    Inter 10.5px #939db0 · line-height 1.45
  <cards> flex 1 · flex wrap · gap 8px ·
          border-left 2px solid #efede4 · padding 6px 0 14px 14px
```
- Card: flex 1, min-width 180px, **max-width 300px**, radius 8px, padding 10px 12px, shadow `0 1px 2px rgba(28,37,50,.05)`.
- Card nội dung: hàng 1 = name (12px/600 #1c2532) + badge phải (mono 8.5px uppercase); hàng 2 = desc (10.5px #4e5a6e, line-height 1.45).
- Mũi tên `→` giữa các card: #c9c5ba 12px, align-self center; card CUỐI mỗi phase không có mũi tên (builder `last()` xoá arrow).

### 3.4 Ba kiểu card (style chính xác)
| Tag | border | background | badge |
|---|---|---|---|
| shipped | 1px solid #e3e0d7 | #ffffff | chữ #939db0, viền #e3e0d7 |
| redesign | **1.5px solid #9a6a1f** | #fdfbf5 | chữ #9a6a1f 700, viền #9a6a1f |
| execution | 1px solid #1c2532 | #f0f1f3 | chữ #1c2532 700, viền #1c2532 |

### 3.5 Nội dung 8 phase (VERBATIM rail)
| # | name | note |
|---|---|---|
| P1 | Access & command | shipped shell — unchanged |
| P2 | Alpha intake | shipped — quarantine is fail-closed |
| P3 | Pick a run | redesign adds the evidence trail to every card |
| P4 | Configure — New Run, preflight first | same frozen payload; the redesign adds the claim forecast |
| P5 | Run it | redesign adds the forecast claim bar + handoff into evidence |
| P6 | Read the evidence | the redesigned run view — one hub, one cursor, five stages |
| P7 | Promote | compose rc_ → publish → Execution side approves |
| P8 | Execution side | reads the published record — nothing here is a research screen |

Copy card P2-redesign: "alpha.yaml contract mirror of delta-rsi, 6 fail-closed gates, DRAFT→ACTIVE registry — feeds New Run Context" → **cập nhật khi code thật**: "single .py contract…, 7 fail-closed gates" (hi-fi đã đổi sang 7 gate ở màn 14; card này giữ mô tả ngắn — khi implement lấy verbatim mới nhất từ file).

---

## 4. Design tokens dùng trên màn

| Token | Giá trị | Dùng cho |
|---|---|---|
| paper | #faf9f5 | nền trang |
| card | #ffffff | card shipped |
| card-redesign | #fdfbf5 | card redesign |
| card-execution | #f0f1f3 | card execution |
| line | #e3e0d7 | viền chuẩn |
| line-soft | #efede4 | rail trái phase, kẻ bảng |
| ink | #1c2532 | chữ chính |
| ink-soft | #4e5a6e | mô tả |
| ink-faint | #939db0 | note, badge shipped |
| accent | #0f4c5c | số phase, link |
| gold | #9a6a1f | redesign |
| font-display | Newsreader | title |
| font-body | Inter | mọi chữ thường |
| font-mono | JetBrains Mono | P-number, badge, mapping cols |

---

## 5. Tính động & interaction

### 5.1 State machine
Màn này CHỈ có hover/focus — không state nội bộ, không fetch. React component KHÔNG có useState.

| Element | Default | Hover | Focus-visible |
|---|---|---|---|
| Card (a) | như §3.4 | border-color đậm hơn 1 nấc (#c9c5ba → shipped; #b4772f → redesign); KHÔNG dịch chuyển layout | ring `0 0 0 2px #fff, 0 0 0 4px #0f4c5c` |
| Mapping row link | underline none | underline + màu #226173 | ring như trên |

- Transition: `border-color 120ms cubic-bezier(.2,0,.2,1)` — KHÔNG transform, KHÔNG shadow động.
- Không có tooltip nào trên màn này ngoài title mặc định của link (bỏ được).

### 5.2 Điều hướng bàn phím
- Tab order = DOM order = thứ tự đọc (P1 trái→phải, xuống P2…).
- Enter mở link; không có control nào khác.

### 5.3 Print
- Màn in được nguyên trạng (không shell); giữ nguyên màu (print-color-adjust: exact cho các badge).

---

## 6. Data contract & TS

### 6.1 Nguồn dữ liệu
Journey Map là màn DUY NHẤT được phép dữ liệu tĩnh — một module config, không endpoint:

```ts
// features/quantbt/journey/journeyMap.ts
export type CardTag = 'shipped' | 'redesign' | 'execution';
export interface JourneyCard {
  name: string;          // verbatim §2.1
  href: string;          // route nội bộ hoặc trang shipped
  desc: string;          // ≤ 140 ký tự
  tag: CardTag;
}
export interface JourneyPhase {
  num: `P${1|2|3|4|5|6|7|8}`;
  name: string;
  note: string;
  cards: JourneyCard[];  // card cuối tự mất mũi tên khi render
}
export interface MappingRow {
  shipped: string; shippedHref: string;
  mine: string;    mineHref: string;
  adds: string;
}
export const JOURNEY: JourneyPhase[];
export const TAB_MAPPING: MappingRow[];
```

- Khi portal có registry màn động (BAR-12 module registry), thay module bằng `GET /api/v1/quantbt/journey` trả đúng shape trên — component KHÔNG đổi.
- Href của card redesign trong portal thật = route nội bộ (`/research/quantbt/runs` v.v.), map qua một bảng `SCREEN_ROUTES` duy nhất dùng chung toàn feature (xem SPEC_INDEX §3) — cấm hardcode route rời rạc trong card data.

### 6.2 Kết nối backend
- KHÔNG gọi quantbt-engine. KHÔNG gọi run API.
- Tuỳ chọn (nice-to-have, cờ tắt mặc định): đếm badge nhỏ trên card Run Library ("N runs") từ `GET /api/v1/quantbt/runs?count_only=1` — nếu bật, lỗi fetch chỉ ẩn badge, không được chặn render map.

---

## 7. TS component architecture

```
<JourneyMapPage>                    // route component, no state
  <JourneyHeader/>                  // title + subtitle + <TagLegend/>
  {JOURNEY.map(p => <PhaseRow key={p.num} phase={p}/>)}
  <TabMappingCard rows={TAB_MAPPING}/>
```

```ts
// PhaseRow.tsx
export function PhaseRow({ phase }: { phase: JourneyPhase }) {
  return (
    <div className="jm-row">
      <PhaseRail num={phase.num} name={phase.name} note={phase.note}/>
      <div className="jm-cards">
        {phase.cards.map((c, i) => (
          <Fragment key={c.href}>
            <JourneyCardLink card={c}/>
            {i < phase.cards.length - 1 && <span className="jm-arrow">→</span>}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
```

- `JourneyCardLink` = 1 component, style theo `data-tag={card.tag}` — CSS attribute selector, không if-else style trong JS.
- Không memo hoá gì (render 1 lần); không virtualization (≤ 30 card).
- Test: snapshot đủ 8 phase; assert card cuối mỗi phase không render arrow; assert 100% href thuộc SCREEN_ROUTES hoặc whitelist shipped.

---

## 8. Edge cases & trạng thái

| Case | Hành vi |
|---|---|
| Viewport < 700px | cards wrap xuống dòng; rail 150px giữ; KHÔNG tràn ngang (đã fluid) |
| Route redesign chưa deploy (feature flag off) | card render disabled: opacity .55, cursor not-allowed, badge đổi "SOON", href bỏ — KHÔNG ẩn card |
| Trang shipped không tồn tại trong môi trường | giống trên (whitelist kiểm ở build-time) |
| Dark mode | ngoài phạm vi v1 — portal Research Light only |

---

## 9. UX anti-patterns (cấm)
1. Cấm thêm mô tả dài/marketing vào card — desc là "adds gì", một mệnh đề.
2. Cấm đổi thứ tự phase hoặc gộp P8 vào P7 — ranh giới research/execution là nội dung chính của map.
3. Cấm hover transform (scale/translate) — chuẩn portal chỉ đổi border-color.
4. Cấm biến map thành dashboard (số liệu sống, sparkline…) — trừ badge đếm run ở §6.2 có cờ.
5. Cấm dùng emoji/icon trong badge — chữ uppercase mono là đủ.

---

## 10. Acceptance checklist

1. [ ] index.html mở ra map trong < 1s, không FOUC font (preconnect + display=swap).
2. [ ] Đủ 8 phase, đủ số card như §2.1, đúng thứ tự.
3. [ ] 3 kiểu card phân biệt được khi in đen trắng (viền dày khác nhau: 1 / 1.5 / 1px + nền khác).
4. [ ] Mọi link đi đúng đích; 0 link chết (test tự động duyệt href).
5. [ ] Card cuối phase không có mũi tên; mũi tên không bao giờ wrap một mình đầu dòng (arrow đi liền card trước bằng Fragment + white-space giữ).
6. [ ] Không tràn ngang ở 660px content width.
7. [ ] Tab đi hết card theo thứ tự đọc; focus ring đúng token.
8. [ ] Console 0 error/warning.
9. [ ] Bảng mapping đủ 6 hàng, cột "adds" đúng verbatim §2.3.
10. [ ] Không component nào giữ state; đổi JOURNEY config là màn đổi theo (không sửa JSX).

---

## 11. Per-element CSS ledger (một dòng một thuộc tính — agent copy nguyên)

### 11.1 Page & content
- `.jm-page`: background #faf9f5
- `.jm-page`: min-height 100vh
- `.jm-page`: color #1c2532
- `.jm-page`: font-family Inter, system-ui, sans-serif
- `.jm-page`: font-size 13px
- `.jm-content`: width 100%
- `.jm-content`: max-width 1280px
- `.jm-content`: margin 0 auto
- `.jm-content`: min-width 0
- `.jm-content`: padding 16px 24px 56px
- `.jm-content`: display flex; flex-direction column; gap 12px

### 11.2 Header
- `.jm-title`: font-family Newsreader, Georgia, serif
- `.jm-title`: font-size 22px; font-weight 300; letter-spacing -0.01em
- `.jm-sub`: font-family Newsreader; font-style italic
- `.jm-sub`: font-size 13.5px; color #939db0
- `.jm-legend`: display flex; gap 6px; flex-wrap wrap; align-items center
- `.jm-legend .chip`: font-family JetBrains Mono; font-size 8.5px; font-weight 600
- `.jm-legend .chip`: text-transform uppercase; letter-spacing .06em
- `.jm-legend .chip`: border-radius 3px; padding 0 4px

### 11.3 Phase row
- `.jm-row`: display flex; gap 14px; align-items flex-start
- `.jm-rail`: flex none; width 150px; padding-top 6px
- `.jm-rail .num`: font-family JetBrains Mono; font-size 11px; font-weight 700; color #0f4c5c
- `.jm-rail .name`: font-size 13px; font-weight 600
- `.jm-rail .note`: font-size 10.5px; color #939db0; line-height 1.45
- `.jm-cards`: flex 1; display flex; flex-wrap wrap; gap 8px
- `.jm-cards`: border-left 2px solid #efede4; padding 6px 0 14px 14px
- `.jm-arrow`: align-self center; color #c9c5ba; font-size 12px

### 11.4 Card (3 biến thể qua data-tag)
- `.jm-card`: flex 1; min-width 180px; max-width 300px
- `.jm-card`: display flex; flex-direction column; gap 4px
- `.jm-card`: border-radius 8px; padding 10px 12px
- `.jm-card`: box-shadow 0 1px 2px rgba(28,37,50,.05)
- `.jm-card`: text-decoration none
- `.jm-card[data-tag=shipped]`: border 1px solid #e3e0d7; background #ffffff
- `.jm-card[data-tag=redesign]`: border 1.5px solid #9a6a1f; background #fdfbf5
- `.jm-card[data-tag=execution]`: border 1px solid #1c2532; background #f0f1f3
- `.jm-card:hover[data-tag=shipped]`: border-color #c9c5ba
- `.jm-card:hover[data-tag=redesign]`: border-color #b4772f
- `.jm-card:focus-visible`: box-shadow 0 0 0 2px #fff, 0 0 0 4px #0f4c5c; outline none
- `.jm-card`: transition border-color 120ms cubic-bezier(.2,0,.2,1)
- `.jm-card .name`: font-size 12px; font-weight 600; color #1c2532
- `.jm-card .desc`: font-size 10.5px; color #4e5a6e; line-height 1.45
- `.jm-card .badge`: như .jm-legend .chip; màu theo tag (§3.4)
- `.jm-card[data-disabled=true]`: opacity .55; cursor not-allowed; pointer-events none (trừ tooltip)

### 11.5 Mapping card
- `.jm-map`: border 1px solid #e3e0d7; border-radius 8px; background #ffffff
- `.jm-map`: box-shadow chuẩn; padding 12px 14px; display flex; flex-direction column; gap 8px
- `.jm-map .label`: font-size 10px; uppercase; letter-spacing .07em; font-weight 500; color #939db0
- `.jm-map .row`: display flex; align-items baseline; gap 10px; font-size 11.5px
- `.jm-map .row`: border-bottom 1px solid #f4f2ec; padding 3px 0
- `.jm-map .shipped`: width 200px; flex none; font-family JetBrains Mono; font-size 10.5px
- `.jm-map .mine`: width 290px; flex none; font-family JetBrains Mono; font-size 10.5px; color #9a6a1f
- `.jm-map .adds`: flex 1; color #4e5a6e

## 12. Pitfalls — chớ làm sai (WRONG → RIGHT)

1. WRONG: bọc card trong `<div onClick>` + inner `<a>`. RIGHT: card LÀ `<a>` — middle-click/cmd-click mở tab mới phải hoạt động.
2. WRONG: render mũi tên như phần tử độc lập trong mảng flex (wrap lẻ đầu dòng). RIGHT: Fragment ghép [card, arrow] và arrow của card cuối không render.
3. WRONG: style theo tag bằng ternary trong JSX. RIGHT: `data-tag` + CSS attribute selector — một chỗ đổi token.
4. WRONG: thêm phase/card bằng cách sửa JSX. RIGHT: chỉ sửa `journeyMap.ts`; JSX là máy render thuần.
5. WRONG: hover thêm transform scale/translateY. RIGHT: chỉ border-color 120ms — chuẩn portal, tránh layout shift.
6. WRONG: dùng `scrollIntoView` cho anchor P8. RIGHT: không anchor scroll trên màn này.
7. WRONG: fetch đếm run rồi block render khi lỗi. RIGHT: badge đếm là progressive enhancement — lỗi thì ẩn im lặng.
8. WRONG: đổi href card redesign thành đường dẫn file .html trong portal thật. RIGHT: mọi href qua `SCREEN_ROUTES` map.
9. WRONG: dịch copy sang tiếng Việt trong code. RIGHT: copy tiếng Anh verbatim; i18n là tầng sau (key hoá, không dịch tay).
10. WRONG: dark-mode tự chế màu. RIGHT: ngoài phạm vi v1 — không thêm biến tối.
11. WRONG: đặt max-width card bằng %, card giãn theo hàng. RIGHT: max-width 300px cứng — nhịp thị giác của map.
12. WRONG: lazy-load cả trang sau spinner. RIGHT: màn tĩnh, render đồng bộ ngay.

## 13. Test matrix

| ID | Precondition | Action | Expected |
|---|---|---|---|
| T01 | fresh load | mở /journey | đủ 8 phase, thứ tự P1→P8, không spinner |
| T02 | — | đếm card từng phase | P1=3 · P2=3 · P3=2 · P4=2 · P5=2 · P6=9 · P7=3 · P8=4 (khớp §2.1) |
| T03 | — | kiểm arrow | card cuối MỖI phase không có →; không arrow nào đứng đầu dòng khi wrap 400px |
| T04 | — | click card "Run Library — evidence cards" | điều hướng route 01 (SPA push, không reload) |
| T05 | — | cmd+click card bất kỳ | mở tab mới đúng href |
| T06 | flag 13-compare off | render P6 | card Compare disabled: opacity .55, badge SOON, không click |
| T07 | — | Tab liên tục | focus đi đúng thứ tự đọc; ring token đúng; không focus-trap |
| T08 | viewport 660px | resize | không scrollbar ngang; rail 150 giữ; card wrap |
| T09 | print preview | in | 3 kiểu card phân biệt được grayscale; không cắt card giữa trang (break-inside avoid) |
| T10 | — | console | 0 error/warning |
| T11 | link audit CI | chạy test duyệt href | 100% href ∈ SCREEN_ROUTES ∪ SHIPPED_WHITELIST |
| T12 | mapping card | so văn bản | 6 hàng, cột adds verbatim §2.3 |
| T13 | data đổi (thêm card P6 mới vào config) | rebuild | card mới xuất hiện, không sửa JSX nào (assert bằng review diff) |
| T14 | badge đếm bật, API 500 | load | map render đủ; badge ẩn; không error console (catch + log debug) |

## 14. Guide plan cho agent code (thứ tự bắt buộc)

1. Tạo `features/quantbt/journey/journeyMap.ts` — chép data §2.1 verbatim; export JOURNEY + TAB_MAPPING; unit test đếm card như T02.
2. Tạo `SCREEN_ROUTES` (file dùng chung feature) trước — mọi màn sau đều import.
3. Dựng `JourneyCardLink` + CSS ledger §11.4; storybook 3 tag × (default/hover/focus/disabled) = 12 story, so với hi-fi.
4. Dựng `PhaseRow` (Fragment+arrow logic) → `JourneyMapPage`.
5. Dựng `TabMappingCard`.
6. Viết test T01–T14; link-audit chạy trong CI.
7. Definition of done: checklist §10 tick đủ + screenshot diff với hi-fi ≤ 1% pixel (Chromatic hoặc tương đương) ở 1280 và 660.

## 15. Copy inventory — desc VERBATIM từng card (agent chép nguyên, cấm viết lại)

| Card | desc |
|---|---|
| 01 · Login | Cloudflare Zero Trust → portal credential → session |
| 02 · Command Center | registry truth, priority items, module KPIs |
| 03 · Portal Map | lifecycle 01→09, persona × status filters |
| 12 · Alpha imports | quarantine inbox · digest verification · contract states |
| Alpha Import — standardize av_ | single-.py contract mirror of delta-rsi, 7 fail-closed gates, DRAFT→ACTIVE registry — feeds New Run Context |
| 13 · Alpha version | lifecycle DRAFT→LIVE · artifact identity · read-only |
| 04 · Run Library | shipped table: id, status, protocol, strategy |
| Run Library — evidence cards | S1–S5 trail chips, cert + claim on the face, compare guarded by ComparisonContractKey |
| 05 · New Run | shipped 6-step form: strategy, data, windows, params, optimization, review |
| New Run — context · route · preflight | binds alpha · av_ (or scratch = NOT_PUBLISHABLE), 14-route grid with per-route params, sweep/pin per param, fold-plan preview, claim forecast before compute |
| 06 · Run Progress | stage pipeline, fold 1/20 timeline, per-trial console |
| Run Progress — claims pending | same console + Gantt, plus the claim passport in forecast state — it flips to issued and hands its cursor to Evidence Flow the moment the run completes |
| Evidence Flow hub | claim bar + evidence cursor over 7 stages: Summary · Split · Search · Freeze · Execute · Claim · Atlas |
| S1 · Split | fold anatomy, purge/embargo, holdout seal |
| S2 · Search & Selection | search cinema, freeze line, J₁…J₅ in real math, best ≠ selected |
| S3 · Freeze | two-axis timeline, digest chain, what-if → new attempt |
| S4 · Execute Replay | candle replay, trade tape, event ledger, MAE×MFE |
| S5 · Claim (in hub) | cert = min of caps, manifest states, window disclosure — lives inside the hub |
| Attempt Lineage | version ledger per av_, 52-attempt scale (probes collapsed), promotion pick |
| Engine Atlas | modes × routes × claims — the support matrix as a reference |
| Compare | within one alpha: methodology trajectory, guarded by ComparisonContractKey |
| Release Candidate & Publish | lineage rail alpha→av_→run→params→rc_, the 12-item R1 evidence pack, publish → approval-inbox mirror |
| Run Report — one sheet | printable evidence artifact: claim passport, cert chain, per-fold verdict, digests — attach it to the approval |
| Paper Trading — SOON | deployment params must equal the frozen digest, or declare a refit |
| Approval Inbox | reads the rc_ read-model · SLA · assignee pool |
| Gate R1 · research evidence | 6 outcomes · conditions & waivers · expiry |
| Gate R2 · deployment fit | venue, account, capital — belongs to dc_, not rc_ |
| Paper / Sandbox / Canary / Live | deployment params must equal the frozen digest |

Ghi chú đồng bộ: desc card "Alpha Import" ở trên là bản MỚI NHẤT (single-.py · 7 gates) — hi-fi 00 có thể còn chuỗi cũ "alpha.yaml … 6 gates"; khi code lấy theo bảng này và sửa hi-fi cho khớp (một commit riêng, ghi chú "copy sync").

## 16. Data fixtures cho test

```ts
// fixtures/journey.fixture.ts — dùng cho unit + storybook
export const FIXTURE_COUNTS = { P1:3, P2:3, P3:2, P4:2, P5:2, P6:9, P7:3, P8:4 };
export const FIXTURE_TAGS: Record<CardTag, number> = { shipped: 9, redesign: 14, execution: 4 };
// tổng card = 27; tổng arrow render = 27 − 8 (card cuối mỗi phase) = 19
export const FIXTURE_HREF_INTERNAL = 14;   // card redesign → SCREEN_ROUTES
export const FIXTURE_HREF_SHIPPED = 9;     // whitelist portal-hifi
export const FIXTURE_HREF_EXECUTION = 4;   // 2 → route 11, 2 → shipped 03-portal-map
```

Assert cấu trúc (vitest):
- `sum(FIXTURE_COUNTS) === JOURNEY.flatMap(p=>p.cards).length`
- mỗi phase: card cuối `arrow === undefined` sau khi qua builder.
- không href nào chứa khoảng trắng chưa encode khi build sang route thật.

## 17. Accessibility matrix

| Element | Role | Name (aria) | Keyboard |
|---|---|---|---|
| Card link | link (native a) | "{name} — {tag}" qua aria-label | Enter mở; Tab tới |
| Card disabled | link + aria-disabled=true | thêm " — coming soon" | focusable NHƯNG Enter no-op |
| Arrow → | presentation (aria-hidden) | — | không focus |
| Phase rail | heading h2 (visually 13px) | "{num} {name}" | — |
| Mapping row link | link | text nội dung | Enter |
| Legend chip | presentation | — | không focus |

Kiểm bằng axe-core: 0 violation mức serious trở lên; heading order h1(title)→h2(phase)→không nhảy cấp.

## 18. Điều phối với các màn khác (đồng bộ hoá copy)
1. Khi màn nào đổi TÊN hiển thị (vd 12 "Mode Atlas"→"Engine Atlas"), Journey card + mapping table PHẢI đổi cùng PR — checklist review có mục "journey sync".
2. Khi thêm màn mới: thêm card vào đúng phase + 1 hàng mapping nếu thay tab shipped + cập nhật FIXTURE_COUNTS — 3 nơi, đủ cả 3 mới merge.
3. Route mới phải vào SCREEN_ROUTES trước khi card trỏ tới (CI link-audit chặn).
4. P8 card không bao giờ trỏ vào màn research mới — nếu Execution side có màn thật, đổi href sang app execution, giữ tag execution.

## 19. Build-order dependencies & rollout

| Bước | Phụ thuộc | Artifact ra |
|---|---|---|
| 1 | tokens.css portal có sẵn | jm.css (ledger §11) |
| 2 | SCREEN_ROUTES | journeyMap.ts + fixtures |
| 3 | 1+2 | JourneyCardLink + stories |
| 4 | 3 | PhaseRow, TabMappingCard, Page |
| 5 | 4 | tests T01–T14 xanh |
| 6 | 5 | screenshot-diff 1280/660 ≤ 1% |
| 7 | 6 | route /research/quantbt/journey behind flag `quantbt_v2` |

Rollout: flag bật cho team research trước; index redirect đổi sau khi 01/02/03/04 cùng bật (map trỏ màn chưa bật sẽ hiển thị SOON — T06 cover).

## 20. Rà soát trước merge (reviewer checklist bổ sung)
1. [ ] Diff chỉ chạm journeyMap.ts khi thay nội dung card (T13).
2. [ ] Không import lodash/moment — màn này 0 dependency ngoài React.
3. [ ] Không inline style trong JSX (trừ không có) — toàn bộ qua class ledger §11.
4. [ ] aria-label card đúng format "{name} — {tag}".
5. [ ] Bundle size trang < 30KB gzip (không kéo chart lib vào route này — kiểm bằng bundle analyzer).
6. [ ] Copy so khớp §15 từng ký tự (script diff copy tự động trong CI).
7. [ ] Lighthouse a11y ≥ 95, best-practices ≥ 95 cho route này.
8. [ ] Không console.log sót.
9. [ ] Story đủ 12 biến thể card.
10. [ ] README feature cập nhật link spec này.

## 21. Telemetry (tối thiểu, không tracking thừa)
- event `journey_card_click` {href, tag, phase} — đo màn nào được vào từ map.
- event `journey_soon_click` {href} — nhu cầu màn chưa bật.
- KHÔNG heatmap, KHÔNG session-replay trên màn này.
- Log qua portal telemetry client chung; fire-and-forget; lỗi telemetry không được throw.

## 22. Phi phạm vi (để khỏi làm thừa)
- Không search trên map; không collapse phase; không drag sắp xếp; không badge số trừ §6.2; không dark mode; không i18n runtime.

> End of spec 00 · v1.1 · frozen 2026-09-15 · pair with hi-fi `QuantBT 00 Journey Map.dc.html`.
