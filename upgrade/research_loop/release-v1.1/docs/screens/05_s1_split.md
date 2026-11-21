# SPEC 05 · S1 Split — `QuantBT 05 S1 Split.dc.html`

> Deep-dive đầu tiên của chuỗi bằng chứng: dữ liệu bị CẮT thế nào trước khi bất cứ thứ gì được search. Guide plan cho agent code; copy VERBATIM; số = CSS px.
> Luật gốc: (1) mọi ranh giới fold là sự thật engine (fold_plan artifact) — FE không tự tính lại ngày; (2) holdout là con dấu — màn này giải thích seal, không bao giờ đọc dữ liệu trong đó; (3) purge/embargo hiển thị bằng số và bằng hình, cùng nguồn.

---

## 1. Meta

| Key | Value |
|---|---|
| File hi-fi | `QuantBT 05 S1 Split.dc.html` |
| Route | `/research/quantbt/runs/{id}/split` |
| Vai trò | Giải phẫu fold: train/test span, purge 24h, embargo 72h, nested inner folds, holdout seal (cap ≤ B), gap scan, θ* digest per fold |
| Persona | researcher · auditor (ordering + seal) |
| Shell | Có |
| Inbound | 04 tab split "open deep dive →" (kèm cursor) · 03 stage rail S1 · 06/07 breadcrumb ngang |
| Outbound | breadcrumb → 04 (giữ hash) · next-stage `S2 · Search →` (06, kèm cursor) · per-fold → 06 `#fold=` |
| Hash | đọc/ghi `#fold=` (+pass-through phần còn lại của cursor) |
| Tweaks (hi-fi) | `scale`: 5 / 32 folds |
| Console chuẩn | 0 error/warning |

## 2. Layout anatomy

### 2.1 Header
- Breadcrumb: `Evidence Flow / R-WFO-118 / Stage 1 · Split` (link Evidence Flow giữ hash).
- Title 22px/300: **S1 · Split — how the data was cut**.
- Subtitle italic: "Every boundary below was fixed before the first trial ran. The sampler never saw a bar to the right of its fold's train edge — and nothing on this screen can read the sealed holdout."
- Phải: chip `fold_plan sha256:4bc21f` + next-stage nav `S2 · Search →`.

### 2.2 Protocol strip (card trắng, flex wrap gap 8/22)
Cặp label/value mono: `protocol advanced_walk_forward` · `frequency quarterly` · `window_mode expanding` · `outer folds 5` · `inner folds 3 per outer` · `purge 24h` · `embargo 72h` · `holdout 2026-01-01 → 2026-08-14 · SEALED`.
- Chip SEALED vàng đậm; title "cap ≤ B — unlock is an audited one-time read".

### 2.3 Fold anatomy diagram (panel chính, card trắng)
- Mỗi outer fold 1 hàng: label `fold_01` + track ngang:
  - đoạn TRAIN mist #a8c6ce (expanding: mỗi fold dài hơn);
  - vạch PURGE: khối gạch chéo 24h (repeating-linear-gradient 135°, #9a6a1f mờ) ngay sau train;
  - đoạn EMBARGO: gạch chéo nhạt hơn 72h;
  - đoạn TEST teal #0f4c5c;
  - cuối hàng: θ* digest mono 9.5px (prm_9d44f2 … theo fold, canonical).
- Trục thời gian dưới cùng: tick năm 2022→2026; vùng HOLDOUT phủ xám gạch + khoá 🔒 KHÔNG dùng emoji — dùng chữ `SEALED` xoay dọc.
- Hàng fold hiện hành (cursor): viền track #0f4c5c; click hàng → set fold + đồng bộ hash.
- Hover đoạn: tooltip "fold_03 · train 2022-01-01 → 2024-06-30 (912 bars) · purge 24h (6 bars) · test 2024-10-01 → 2024-12-31 (552 bars)".

### 2.4 Nested inner folds (card trắng)
- Cho fold hiện hành: 3 hàng inner — mỗi hàng train con + test con nằm TRONG train của outer; caption: "inner folds exist so selection can rank WITHOUT touching the outer test — per_fold_causal reads outer OOS exactly once, after freeze."
- Đổi fold cursor → panel này re-render theo fold.

### 2.5 Holdout seal card (viền vàng 1.5px, nền #fdfbf5)
- Badge `SEALED` + span + số bar + digest của seal record.
- 3 dòng luật (verbatim):
  1. "No panel on any screen reads a bar inside this span."
  2. "The seal caps this run's certificate at B — the cap is BINDING and travels to the cert chain."
  3. "Unlock is a one-time audited read that creates a sibling attempt — never a mutation of this run."
- Link: `cert chain → (hub S5)`.

### 2.6 Gap scan (card trắng)
- Bảng: `window · bars · gaps critical · gaps watch · verdict`; 3 hàng IS/OOS/holdout (holdout: bars "—" + "sealed — integrity checked at snapshot time, content unread").
- 2 gap WATCH liệt kê giờ UTC + độ dài; verdict chip PASS/WATCH.

### 2.7 Rules footer
"Boundaries come from the engine's fold_plan artifact — this screen renders them, it never recomputes a date. Purge and embargo are shown at true scale; if you cannot see them, zoom is lying, so the strip magnifies them with a marked ×6 lens instead."

---

## 3. Tính động

### 3.1 State
- `fold` (cursor pass-through) — nguồn: hash; click hàng/anatomy hoặc ‹ › selector đổi.
- `lens` boolean — bật kính ×6 phóng purge/embargo (mặc định ON khi tỷ lệ purge < 1px).
- `scale` (demo hi-fi 5/32) — portal thật: theo run.

### 3.2 Interactions
| Control | Hành vi |
|---|---|
| Hàng fold | click → fold cursor; Enter/Space khi focus |
| ‹ › fold nav (header phải) | prev/next; disabled biên |
| Đoạn track hover | tooltip span + bars |
| Lens toggle | phóng vùng purge+embargo ×6 với khung đánh dấu "×6"; layout track còn lại co tương ứng; caption đổi |
| Inner fold hover | tooltip inner span |
| Next-stage nav | → 06 kèm hash hiện hành |
| SEALED chip/card link | → hub #stage=claim |

### 3.3 Scale mode (≥20 fold)
- Anatomy chuyển compact: mỗi fold 1 hàng mỏng 14px, bỏ label từng đoạn, giữ màu; virtual scroll trong card max-height 480px.
- Fold selector dropdown nhóm 10 (fold 01–10, 11–20…).
- Inner panel chỉ render fold hiện hành (luôn vậy) — không đổi.
- Gap scan gộp: "32 folds · 0 critical · 5 watch" + bảng chi tiết behind "show all".

## 4. Data contract

```ts
interface SplitDetail {
  run_id: string;
  protocol: { name: string; frequency: string; window_mode: 'expanding'|'rolling';
              outer: number; inner_per_outer: number;
              purge: { label: '24h'; bars: number }; embargo: { label: '72h'; bars: number } };
  fold_plan_digest: string;
  timeline: { t0: string; t1: string };            // trục
  folds: {
    k: number;
    train: { t0: string; t1: string; bars: number };
    test:  { t0: string; t1: string; bars: number };
    theta_digest: string;                           // canonical per fold
    inner: { train: Span; test: Span }[];           // 3 phần tử
  }[];
  holdout: { t0: string; t1: string; bars: number; seal_digest: string; cap: 'B' };
  gaps: { window: 'IS'|'OOS'|'holdout'; bars: number|null; critical: number; watch: number;
          items: { at: string; len: string }[]; verdict: 'PASS'|'WATCH' }[];
}
```
- Endpoint: `GET /api/v1/quantbt/runs/{id}/split` → SplitDetail (từ fold_plan + dataset manifest; immutable, ETag).
- Nguồn: engine fold_plan artifact + snapshot gap scan (data service lúc submit) — 2 nguồn được read-model gộp, FE một call.
- Bars số do server tính từ timeframe — FE không đếm.

## 5. Kết nối backend (nhắc)
- fold_plan là artifact engine (walk_forward stack) — chuẩn spec 04_ENGINE_ROUTE_MATRIX §6.
- theta_digest per fold = digest canonical (cùng chuỗi hiển thị ở 03/04/07/08/09) — test chéo màn bắt buộc.
- Holdout seal record thuộc governance store (cùng nguồn cert chain hub).

## 6. TS architecture
```
<SplitPage>
  const d = useSplitDetail(runId);
  const [cursor, setCursor] = useEvidenceCursor();      // package chung
  <PortalShell…>
    <SplitHeader digestChip nextHref(cursor)/>
    <ProtocolStrip p={d.protocol} holdoutChip/>
    <FoldAnatomy folds cur={cursor.fold} onPick lens compact={d.folds.length>=20}/>
    <InnerFolds fold={curFold}/>
    <HoldoutSeal h={d.holdout}/>
    <GapScan gaps compact={…}/>
    <RulesFooter/>
```
- FoldAnatomy: thuần div/% width theo (t − t0)/(t1 − t0); KHÔNG canvas; memo theo folds ref + cur.
- Lens: transform layout tính trước (không CSS scale — tránh blur): width các đoạn tính lại với hệ số 6 cho purge/embargo, phần dư chia đều train/test, badge "×6".

## 7. Pitfalls — chớ làm sai
1. WRONG: FE tự cộng 24h/72h ra ranh giới. RIGHT: bars + span từ server; hình vẽ theo span.
2. WRONG: purge quá mảnh nên bỏ vẽ. RIGHT: lens ×6 có đánh dấu — trung thực về scale.
3. WRONG: vẽ holdout như đoạn test thường (màu teal). RIGHT: xám gạch + SEALED — không bao giờ giống dữ liệu đọc được.
4. WRONG: emoji 🔒 cho seal. RIGHT: chữ SEALED (design system không emoji).
5. WRONG: đổi fold reset lens/scroll. RIGHT: chỉ inner panel + highlight đổi.
6. WRONG: inner folds vẽ ngoài phạm vi train outer. RIGHT: clamp trong train — lệch 1px cũng là nói dối phương pháp.
7. WRONG: gap scan tự quét lại series ở FE. RIGHT: render kết quả snapshot-time.
8. WRONG: digest fold tự sinh demo khác chuỗi canonical. RIGHT: prm_9d44f2 · 3b81c7 · 7c1a9e · c25a1d · 66e09b — test chéo với 04/07/08/09.
9. WRONG: next-stage nav bỏ hash. RIGHT: mọi nav ngang mang nguyên cursor.
10. WRONG: compact mode ẩn purge hoàn toàn không chú thích. RIGHT: caption "purge/embargo below pixel scale at 32 folds — open a fold row to inspect" + click hàng mở row view chi tiết fold đó (expand inline).

## 8. Test matrix
| ID | Precondition | Action | Expected |
|---|---|---|---|
| T01 | mount #fold=3 | — | hàng 3 viền xanh; inner panel fold 3; hash giữ |
| T02 | click fold 5 | — | cursor 5; hash fold=5; inner re-render |
| T03 | hover train fold 3 | — | tooltip span + bars đúng fixture |
| T04 | lens off (đủ rộng) | — | purge/embargo vẽ true-scale; không badge |
| T05 | viewport hẹp / purge < 1px | — | lens tự ON + badge ×6 + caption |
| T06 | 32-fold | load | compact rows; virtual scroll; dropdown nhóm 10 |
| T07 | 32-fold | click hàng 17 | expand inline chi tiết fold 17 (đoạn + số) |
| T08 | SEALED chip | click | → hub #stage=claim (hash giữ fold) |
| T09 | next-stage | click | → 06 với hash nguyên vẹn |
| T10 | gap WATCH row | inspect | giờ UTC + độ dài đúng; verdict chip vàng |
| T11 | holdout card | đọc | 3 dòng luật verbatim; cap B nói "BINDING" |
| T12 | breadcrumb về hub | click | hub mở đúng fold hiện hành |
| T13 | 660px | resize | track co, label wrap; không tràn |
| T14 | axe | scan | hàng fold role=button aria-pressed; tooltip aria-describedby; 0 serious |
| T15 | ETag revisit | — | không flash |
| T16 | inner folds fixture lệch (test guard) | render | dev-warning console + clamp (không vẽ tràn) |

## 9. Copy inventory — VERBATIM
- Subtitle §2.1.
- Inner caption: "inner folds exist so selection can rank WITHOUT touching the outer test — per_fold_causal reads outer OOS exactly once, after freeze."
- Seal 3 luật §2.5.
- SEALED chip title: "cap ≤ B — unlock is an audited one-time read"
- Holdout gap row: "sealed — integrity checked at snapshot time, content unread"
- Lens caption compact: "purge/embargo below pixel scale at 32 folds — open a fold row to inspect"
- Rules footer §2.7 nguyên đoạn.

## 10. Per-element CSS ledger (rút gọn phần đặc thù)
- `.sp-track`: height 22px; background #fdfdfa; border 1px solid #efede4; position relative
- `.sp-seg[data-k=train]`: background #a8c6ce
- `.sp-seg[data-k=test]`: background #0f4c5c
- `.sp-seg[data-k=purge]`: background repeating-linear-gradient(135deg, rgba(154,106,31,.55) 0 3px, transparent 3px 6px)
- `.sp-seg[data-k=embargo]`: như purge, opacity .45
- `.sp-holdout`: background repeating-linear-gradient(135deg, #d8d4c9 0 4px, #efede4 4px 8px)
- `.sp-holdout .label`: writing-mode vertical-rl; font 9px mono 700 #7a8699; letter-spacing .14em
- `.sp-row[data-cur=true] .sp-track`: border-color #0f4c5c
- `.sp-lensbadge`: font mono 8.5px 700; border 1px solid #9a6a1f; color #9a6a1f; radius 3px; padding 0 4px
- `.sp-inner-track`: height 12px; margin-left theo offset train outer (%)
- `.sp-seal`: border 1.5px solid #9a6a1f; border-radius 10px; background #fdfbf5; padding 14px 16px
- `.sp-gap-verdict[data-v=PASS]`: màu xanh grammar; [data-v=WATCH]: vàng
- fold label: mono 10px #4e5a6e width 56 flex-none
- θ* digest cuối hàng: mono 9.5px #0f4c5c (link 07 #fold=k)

## 11. Guide plan cho agent
1. Types + fixture 5-fold canonical (span thật 2022→2026, digests canonical) + fixture 32-fold generator.
2. FoldAnatomy true-scale + lens engine (pure fn tính width) — unit test width tổng = 100% mọi case (T04/T05).
3. InnerFolds + clamp guard (T16).
4. HoldoutSeal + GapScan + ProtocolStrip.
5. Cursor wiring (package chung) — T01/T02/T09/T12.
6. Compact 32-fold + expand row — T06/T07.
7. A11y + copy diff + screenshot 5/32 fold ≤1%.
8. DoD: T01–T16 xanh; digest chéo màn test pass; bundle route < 60KB gzip (không chart lib).

## 12. Phi phạm vi
- Không chỉnh sửa fold plan từ màn này (nó là bằng chứng, không phải editor — sửa = New Run mới).
- Không hiển thị giá/equity (S4 lo); màn này chỉ THỜI GIAN và ranh giới.
- Không unlock holdout UI (v2 — attempt att_06 pattern, spec riêng khi làm).


## 13. Lens algorithm (pure function — spec chính xác)

```ts
interface SegIn { kind: 'train'|'purge'|'embargo'|'test'; ms: number }
interface SegOut extends SegIn { pct: number }   // tổng = 100
function lensWidths(segs: SegIn[], opts: { trackPx: number; minPx: 2; factor: 6 }): 
  { out: SegOut[]; lensed: boolean }
```
Luật:
1. pct thô = ms / tổng ms × 100.
2. lensed = true khi pct(purge) × trackPx / 100 < minPx (hoặc embargo tương tự).
3. Khi lensed: purge/embargo nhân factor 6 (theo pct thô), phần vượt trừ TỶ LỆ vào train và test (theo pct thô của chúng).
4. Không segment nào < minPx sau lens; nếu vẫn < minPx → clamp minPx và trừ tiếp phần dư.
5. Tổng luôn = 100 ± 0.01 (assert).
Unit cases (bắt buộc):
- 912h train · 24h purge · 72h embargo · 552h test, track 800px → lensed true; purge ≥ 2px.
- track 1600px cùng số → lensed false (true scale).
- fold rolling ngắn (train 400h) → lens vẫn tổng 100.
- purge 0 (protocol không purge) → segment bỏ, không NaN.

## 14. Fixture canonical 5-fold (chép nguyên vào fixtures/split.fixture.ts)

- timeline: 2022-01-01 → 2026-08-14
- holdout: 2026-01-01 → 2026-08-14 · 1344 bars · seal_digest seal_88ae02 · cap B
- fold_01: train 2022-01-01→2022-12-31 (2184 bars) · test 2023-01-01→2023-03-31 (540 bars) · θ* prm_9d44f2
- fold_02: train 2022-01-01→2023-03-31 · test 2023-04-01→2023-06-30 · θ* prm_3b81c7
- fold_03: train 2022-01-01→2023-06-30 · test 2023-07-01→2023-09-30 · θ* prm_7c1a9e
- fold_04: train 2022-01-01→2023-09-30 · test 2023-10-01→2023-12-31 · θ* prm_c25a1d
- fold_05: train 2022-01-01→2023-12-31 · test 2024-01-01→2024-03-31 · θ* prm_66e09b
- purge 24h = 6 bars (4h tf) · embargo 72h = 18 bars
- inner mỗi outer: 3 cặp chia đều train (33% mỗi inner-test khối cuối train con)
- gaps: IS {2 watch: 2022-03-12 08:00 UTC · 8h, 2022-11-02 00:00 UTC · 4h} · OOS {0} · holdout {bars null}
- 32-fold generator: quarterly→monthly, seed 7, digest sinh `prm_${fnv1a(k)}` — CHỈ dùng trong scale test, không bao giờ render cạnh dữ liệu canonical.

## 15. State-transition table

| Từ | Event | Đến | Side effects |
|---|---|---|---|
| idle | mount + hash fold=k | fold=k | highlight k; inner render k |
| fold=k | click hàng j | fold=j | hash replaceState; inner đổi; KHÔNG scroll list |
| fold=k | ‹ | fold=k−1 (≥1) | như trên |
| fold=k | › | fold=k+1 (≤N) | như trên |
| lens auto | resize track < ngưỡng | lensed=true | badge ×6 hiện; caption đổi |
| lens auto | resize đủ rộng | lensed=false | badge ẩn |
| compact | click hàng 17 | expandedRow=17 | inline expand chi tiết; hàng khác đóng |
| expandedRow=17 | click lần nữa | expandedRow=null | đóng |
| bất kỳ | next-stage | (rời màn) | href 06 + hash nguyên |

## 16. A11y matrix
| Element | Role/aria | Keyboard |
|---|---|---|
| Hàng fold | button; aria-pressed=cur | Enter/Space chọn; Arrow Up/Down di chuyển hàng |
| Đoạn track | img; aria-label=tooltip text | — |
| Lens badge | note; aria-label "magnified 6 times for visibility" | — |
| Fold nav ‹ › | button; aria-label previous/next fold | — |
| Dropdown nhóm | listbox | Arrow + Enter |
| SEALED chip | link | Enter |
| Gap bảng | table thật (th/td) | — |
| Expand hàng compact | button aria-expanded | Enter |

## 17. Telemetry
- `split_view` {run_id, folds}
- `split_fold_pick` {k, via: row|nav|dropdown}
- `split_lens` {on} — đo bao nhiêu viewport cần lens
- `split_seal_click` — quan tâm cert chain
- `split_next_stage` — luồng đọc tuần tự có được dùng không

## 18. Reviewer checklist
1. [ ] Không phép cộng ngày nào trong FE (grep Date math ngoài format hiển thị).
2. [ ] lensWidths tổng 100 mọi unit case; badge chỉ khi lensed.
3. [ ] Inner clamp guard hoạt động (fixture lệch → console dev-warning).
4. [ ] Digest 5 fold khớp canonical — test chéo import fixture chung.
5. [ ] Hash pass-through: mount→click→next-stage→breadcrumb giữ trọn key.
6. [ ] Copy khớp §9 từng ký tự.
7. [ ] Compact 32-fold: virtual scroll không nuốt hàng expand.
8. [ ] Holdout không bao giờ render màu teal/test (visual test màu pixel).
9. [ ] Screenshot 5/32 fold + lens on/off ≤1% diff.
10. [ ] Bundle < 60KB gzip; 0 chart lib import (grep).

## 19. Glossary
- purge: khoảng chết ngay sau train — chặn leakage feature nhìn xuyên biên.
- embargo: khoảng cách ly thêm sau purge trước khi test bắt đầu.
- expanding window: train mở rộng dần theo fold; rolling: train trượt độ dài cố định.
- inner folds: chia nhỏ TRONG train outer để selection xếp hạng không chạm outer test.
- seal: bản ghi governance khoá holdout; đọc là sự kiện audit một lần.
- lens ×6: phóng đại có khai báo cho segment dưới ngưỡng pixel — trung thực về scale.

## 20. Câu hỏi mở
- Purge/embargo có thể theo BAR thay giờ ở release sau — nếu engine đổi đơn vị, label lấy từ protocol.purge.label (đã là chuỗi server) — FE không đổi.
- Gap scan re-run theo snapshot mới (data patch) tạo attempt mới hay chỉ cập nhật note? — theo spec attempt: patch data = attempt mới; màn này luôn render đúng snapshot của run.


## 21. Per-element CSS ledger (đầy đủ, một dòng một thuộc tính)

### 21.1 Protocol strip
- `.sp-proto`: border 1px solid #e3e0d7
- `.sp-proto`: border-radius 8px
- `.sp-proto`: background #ffffff
- `.sp-proto`: box-shadow 0 1px 2px rgba(28,37,50,.05)
- `.sp-proto`: padding 10px 14px
- `.sp-proto`: display flex
- `.sp-proto`: flex-wrap wrap
- `.sp-proto`: gap 6px 22px
- `.sp-proto .k`: font-size 9px
- `.sp-proto .k`: text-transform uppercase
- `.sp-proto .k`: letter-spacing .07em
- `.sp-proto .k`: color #939db0
- `.sp-proto .v`: font-family JetBrains Mono
- `.sp-proto .v`: font-size 11px
- `.sp-proto .v`: color #1c2532
- `.sp-sealed`: font-family JetBrains Mono
- `.sp-sealed`: font-size 9.5px
- `.sp-sealed`: font-weight 700
- `.sp-sealed`: letter-spacing .06em
- `.sp-sealed`: color #9a6a1f
- `.sp-sealed`: border 1px solid #9a6a1f
- `.sp-sealed`: border-radius 3px
- `.sp-sealed`: padding 0 6px
- `.sp-sealed`: background #f4ecdb

### 21.2 Anatomy card
- `.sp-anat`: border 1px solid #e3e0d7
- `.sp-anat`: border-radius 10px
- `.sp-anat`: background #ffffff
- `.sp-anat`: padding 14px 16px
- `.sp-anat`: display flex
- `.sp-anat`: flex-direction column
- `.sp-anat`: gap 6px
- `.sp-row`: display flex
- `.sp-row`: align-items center
- `.sp-row`: gap 10px
- `.sp-row`: border 0
- `.sp-row`: background none
- `.sp-row`: padding 0
- `.sp-row .label`: width 56px
- `.sp-row .label`: flex none
- `.sp-row .label`: font-family JetBrains Mono
- `.sp-row .label`: font-size 10px
- `.sp-row .label`: color #4e5a6e
- `.sp-row .digest`: width 88px
- `.sp-row .digest`: flex none
- `.sp-row .digest`: text-align right
- `.sp-row .digest`: font-family JetBrains Mono
- `.sp-row .digest`: font-size 9.5px
- `.sp-row .digest`: color #0f4c5c
- `.sp-axis`: display flex
- `.sp-axis`: justify-content space-between
- `.sp-axis`: font-family JetBrains Mono
- `.sp-axis`: font-size 9px
- `.sp-axis`: color #939db0
- `.sp-axis`: padding-left 66px
- `.sp-axis`: padding-right 98px

### 21.3 Compact mode
- `.sp-compact .sp-track`: height 14px
- `.sp-compact`: max-height 480px
- `.sp-compact`: overflow-y auto
- `.sp-expand`: border 1px solid #e3e0d7
- `.sp-expand`: border-radius 6px
- `.sp-expand`: background #faf9f5
- `.sp-expand`: padding 8px 12px
- `.sp-expand`: margin 4px 0 8px 66px
- `.sp-expand .grid`: display flex
- `.sp-expand .grid`: gap 4px 22px
- `.sp-expand .grid`: flex-wrap wrap

### 21.4 Inner + seal + gap
- `.sp-inner`: border 1px solid #e3e0d7; border-radius 10px; background #ffffff; padding 14px 16px
- `.sp-inner .cap`: font-size 10.5px; color #4e5a6e; line-height 1.55
- `.sp-seal .badge`: font mono 9px 700; letter-spacing .08em; border 1px solid #9a6a1f; radius 3px; padding 1px 7px; background #f4ecdb; color #9a6a1f
- `.sp-seal .law`: font-size 11px; color #4e5a6e; line-height 1.6; padding-left 10px; border-left 2px solid #efede4
- `.sp-gap table`: width 100%; border-collapse collapse; font mono 10.5px
- `.sp-gap th`: font-size 9.5px; uppercase; letter-spacing .06em; color #939db0; text-align left; border-bottom 1px solid #efede4; padding 3px 6px
- `.sp-gap td`: padding 4px 6px; border-bottom 1px solid #f4f2ec

## 22. Perf budget
- Render 32 fold compact < 8ms script (memo + không đo DOM trong vòng render).
- Resize: lensWidths chạy qua rAF debounce 100ms; không layout thrash (đọc width 1 lần từ ResizeObserver entry).
- Hover tooltip: title attr native — 0 JS.
- Route bundle < 60KB gzip.

## 23. Thứ tự render & CLS
1. Header + protocol strip.
2. Anatomy (khung height theo N fold đặt trước — CLS 0).
3. Inner + seal (chiều cao cố định ~180/~150).
4. Gap scan.
- Skeleton: strip + 5 hàng track xám.

## 24. Integration tests liên màn (bắt buộc)
1. 04#stage=split&fold=4 → "open deep dive" → 05 hàng 4 active; breadcrumb về → hub fold 4.
2. 05 next-stage → 06 mở fold 4, panel Stage A đọc đúng fold.
3. θ* digest fold 3 click → 07#fold=3 — digest hiển thị ở 07 là prm_7c1a9e (chuỗi khớp).
4. 03 stage rail S1 (run khác 119) → 05 của 119 — không rò dữ liệu 118 (cache key theo run).

## 25. Tooltip copy templates (chép nguyên, thay biến)
- train: "fold_{kk} · train {t0} → {t1} ({bars} bars)"
- purge: "purge 24h ({bars} bars) — no sample may straddle this boundary"
- embargo: "embargo 72h ({bars} bars) — test starts only after the quarantine"
- test: "fold_{kk} · test {t0} → {t1} ({bars} bars) — outer OOS, read once after freeze"
- inner train/test: "inner_{i} · {kind} {t0} → {t1} — inside the outer train only"
- holdout: "holdout {t0} → {t1} — SEALED · content unread · cap ≤ B"
- θ* digest: "θ* of fold_{kk} · {digest} — open Freeze at this fold"

## 26. Điều kiện hiển thị (bảng quyết định)
| Element | Hiện khi |
|---|---|
| Lens badge ×6 | lensed=true |
| Expand row inline | compact mode (N≥20) và hàng được click |
| Dropdown nhóm 10 | N≥20 |
| Gap "show all" | N≥20 hoặc items > 6 |
| Next-stage nav | luôn (mọi trạng thái run terminal) |
| Inner panel | luôn — theo fold cursor |

## 27. Không-trạng-thái (những gì màn này KHÔNG có)
- Không fetch thứ hai theo fold (SplitDetail một call đủ).
- Không state nào ngoài {fold, lens, expandedRow}.
- Không URL query — chỉ hash cursor.
- Không animation ngoài focus/hover token (prefers-reduced-motion không cần xử lý gì thêm vì không có motion).

> End of spec 05 · v1.1 · pair with hi-fi `QuantBT 05 S1 Split.dc.html`.
