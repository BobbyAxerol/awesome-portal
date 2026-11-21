# SPEC 09 · Run Report — one sheet — `QuantBT 09 Run Report.dc.html`

> Artifact bằng chứng IN ĐƯỢC — một tờ đính kèm approval. Guide plan cho agent code; copy VERBATIM; số = CSS px (print: pt tương đương qua doc-page).
> Luật gốc: (1) report là BẢN CHỤP của read-model — không control tương tác nào lọt vào bản in; (2) headline = OOS only, holdout absent by design; (3) mọi digest in ra phải khớp chuỗi canonical các màn khác.

---

## 1. Meta

| Key | Value |
|---|---|
| File hi-fi | `QuantBT 09 Run Report.dc.html` |
| Route | `/research/quantbt/runs/{id}/report` |
| Vai trò | One-sheet printable: claim passport verbatim, identity block, headline metrics, equity/underwater tĩnh, per-fold verdict, stage checks, key artifacts + digests, promotion state, provenance |
| Persona | manager/approver (chính) · auditor |
| Shell | KHÔNG shell (cùng 00) — chỉ thanh no-print đầu trang |
| Print | doc-page flow: nội dung một cột; browser print → PDF; thanh no-print biến mất |
| Inbound | 04 "generate report →" · 11 evidence pack row · 03 artifacts |
| Outbound | thanh no-print: ← Hub · Release Candidate & Publish |
| Console chuẩn | 0 error/warning |

## 2. Layout (một cột, max-width 880px giữa trang, nền trắng, chữ 12px)

### 2.1 No-print bar (nền #f4f2ec, class no-print)
- `← Hub · Stage 5 Claim` · `Release Candidate & Publish` / `Run Report` + phải: "this bar does not print — Export → PDF gives the clean sheet".

### 2.2 Report header
- Hàng 1: **QuantBT Run Report** (Newsreader 24px/400) + phải chip `R-WFO-118 · att_04` mono 12px.
- Hàng 2 mono 9.5px #4e5a6e: `generated 2026-09-14 09:00Z · by portal read-model v1 · engine er_quantbt_1_1_1 · quantbt-engine==1.1.1[optimization]`.
- Kẻ đôi dưới header (double rule 3px: 1px + gap + 1px, #1c2532).

### 2.3 Claim passport (khung viền 1.5px #9a6a1f, nền #fdfbf5)
- Title nhỏ uppercase "claim passport — verbatim from Stage 5".
- 6 dòng mono 10.5px: validation_claim · chronological_claim · oos_used_for_selection · holdout `SEALED — never read` · causality `PASS` · cert `B (min of stage caps — S1 holdout seal binds)`.

### 2.4 Identity block (bảng 2 cột key/value, 12 hàng)
`alpha` alpha_momentum_btc (alpha_7f2) · `alpha_version` av_0_9_3 · sha256:3fe4a1 · import ACTIVE · **PUBLISHABLE** · `strategy` mom_breakout_v3 (pinned by av_0_9_3) · `dataset` ds_btcusdt_4h @ snap_2026_06_30 · `instrument` BTCUSDT · 4h · `protocol` advanced_walk_forward · quarterly · expanding · 5 outer / 3 inner · `route` signal_notional → close_target_v2 · `runtime authority` python — promotion table v1, below_promotion_min_bars · `optimization` mode_1_decay × per_fold_causal · 512 trials · multi-seed · `selected params` prm_7c1a9e (θ* trial #143) · `config digest` sha256:88ae02 · `random seed` 42.

### 2.5 Headline metrics (6 ô grid, viền mảnh)
`OOS Sharpe 1.186` · `decay d̄ +0.181` · `max drawdown −9.8%` · `trades 1,042` · `win rate 54.1%` · `funding −$412` — footnote: "headline = OOS only; IS and holdout never enter this row (holdout sealed, unread)."

### 2.6 Equity + underwater (ảnh tĩnh render từ series — không interactive)
- SVG/canvas render offline style lightweight-charts: line #0f4c5c + fill nhạt; underwater strip đỏ dưới; fold boundaries vạch vàng dashed + nhãn f1…f5.
- Caption mono 9px: "stitched OOS equity · fold boundaries marked · params handoff at each boundary".

### 2.7 Per-fold verdict (bảng in)
Cột `fold · span · S_OOS · decay · trades · maxDD · verdict`; verdict chữ (PASS/WARN/DRAG) + footnote rule v1. 32-fold: bảng đủ N hàng (in nhiều trang tự nhiên — flow).

### 2.8 Stage checks (5 dòng)
`S1 Split — PASS (holdout sealed · cap ≤ B)` · `S2 Search — PASS (strict schedule · pool frozen pre-OOS)` · `S3 Freeze — PASS (ordering 2m59s · chain intact)` · `S4 Execute — PASS (parity 1↔1 · report_level audit)` · `S5 Claim — ISSUED (cert B)`.

### 2.9 Key artifacts (bảng digest)
7 hàng: run_spec sha256:88ae02 · selection_trace prm_7c1a9e · fold_plan 4bc21f · fill_ledger 1af9d3 · metrics_summary 77e0b9 · claim c11a02 · bundle 1af9d3 — cột `artifact · digest · state (SEALED…)`.

### 2.10 Promotion state + footer
- 1 dòng: `release candidate: rc_ (draft) — composed on the Release Candidate screen · gate R1 pending publish`.
- Provenance footer mono 8.5px: "every number on this sheet is read from sealed artifacts of R-WFO-118 att_04; the sheet computes nothing. data_signature 4bc21f · read-model v1 · verdict rule v1."

## 3. Data & print

```ts
interface ReportDetail { /* đúng các khối §2.3–2.10 — mọi giá trị là CHUỖI đã format */ }
GET /runs/{id}/report → ReportDetail (immutable; cache mạnh)
```
- Equity series: `GET /runs/{id}/equity?scope=oos&res=print` (≤ 600 điểm).
- Print CSS: doc-page component sở hữu; FE không viết @page; `.no-print { display:none }` khi in; bảng `break-inside: avoid-row`; khối passport/identity `break-inside: avoid`.
- Màu in: print-color-adjust exact cho passport viền vàng + verdict chữ (không nền đậm — mực).

## 4. Pitfalls — chớ làm sai
1. WRONG: nhúng chart interactive vào report. RIGHT: render tĩnh (SVG path từ series) — in ổn định.
2. WRONG: FE format số (locale). RIGHT: chuỗi server; en-dash/− đúng như gửi.
3. WRONG: thêm section marketing (logo to, màu nền). RIGHT: tờ bằng chứng — mực tối thiểu.
4. WRONG: ẩn hàng DEGRADED/WARN cho đẹp. RIGHT: in đủ — người duyệt cần sự thật.
5. WRONG: holdout xuất hiện trong headline/bảng. RIGHT: chỉ dòng "sealed, unread".
6. WRONG: digest rút gọn khác màn khác. RIGHT: util chung.
7. WRONG: bảng 32 fold ép 1 trang (font 6px). RIGHT: flow nhiều trang; header bảng repeat (thead).
8. WRONG: nút print tự chế window.print inline khắp nơi. RIGHT: một nút trên no-print bar; hệ export portal lo PDF.

## 5. Test matrix
| ID | Case | Expected |
|---|---|---|
| T01 | load | đủ 9 khối đúng thứ tự; no-print bar hiện trên màn |
| T02 | print preview | bar biến mất; passport không bị cắt giữa trang; thead repeat |
| T03 | fixture 32 fold | bảng flow nhiều trang; không overflow ngang |
| T04 | digest chéo màn | 7 digest khớp canonical (test import fixture chung) |
| T05 | scratch run fixture | identity: binding "scratch — NOT_PUBLISHABLE"; promotion state "no rc_ can be composed" |
| T06 | FAILED run | headline thay bằng "no claim — run failed at {stage}"; stage checks tới điểm fail; artifacts ABORTED in rõ |
| T07 | copy diff | mọi câu §2 verbatim |
| T08 | axe | landmark đúng; bảng th scope; 0 serious |
| T09 | 660px màn hình | một cột co; không tràn |
| T10 | equity series lỗi | khung + "series unavailable — numbers unaffected"; phần còn lại in được |

## 6. Copy inventory — VERBATIM
- No-print note: "this bar does not print — Export → PDF gives the clean sheet"
- Headline footnote §2.5 · caption equity §2.6 · provenance footer §2.10 · passport title §2.3.
- Promotion dòng §2.10 (draft) / published: "release candidate: rc_2026_0914_a — PUBLISHED · gate R1 PENDING (SLA 5d)".

## 7. Guide plan
1. ReportDetail types + fixture canonical + scratch + failed.
2. Khối tĩnh theo thứ tự §2 (passport → identity → headline → equity SVG → verdict → checks → artifacts → promotion → footer).
3. Print pass với doc-page (break rules) — T02/T03.
4. Digest util chung + test chéo — T04.
5. DoD: T01–T10 xanh; print PDF soát tay 5/32 fold; copy diff 0.

## 8. Phi phạm vi
- Không chọn khối để in (v2 template).
- Không đa ngôn ngữ.
- Không watermark DRAFT (promotion state dòng chữ là đủ).


## 9. Per-element CSS ledger

### 9.1 Trang & khung
- `.rr-page`: background #ffffff
- `.rr-page`: color #1c2532
- `.rr-page`: font-family Inter, system-ui
- `.rr-page`: font-size 12px
- `.rr-sheet`: max-width 880px
- `.rr-sheet`: margin 0 auto
- `.rr-sheet`: padding 24px 28px 48px
- `.rr-noprint`: display flex; align-items center; gap 12px
- `.rr-noprint`: padding 10px 18px; background #f4f2ec; border-bottom 1px solid #e3e0d7
- `@media print`: .rr-noprint display none
- `.rr-doublerule`: border-top 1px solid #1c2532; position relative; margin-top 3px
- `.rr-doublerule::before`: content ""; position absolute; top -3px; left 0; right 0; border-top 1px solid #1c2532

### 9.2 Header & passport
- `.rr-title`: font-family Newsreader; font-size 24px; font-weight 400
- `.rr-runchip`: font-family JetBrains Mono; font-size 12px; font-weight 700
- `.rr-meta`: font-family JetBrains Mono; font-size 9.5px; color #4e5a6e
- `.rr-passport`: border 1.5px solid #9a6a1f; background #fdfbf5; border-radius 8px; padding 12px 14px
- `.rr-passport`: break-inside avoid
- `.rr-passport .t`: font-size 9px; uppercase; letter-spacing .08em; color #9a6a1f; font-weight 600
- `.rr-passport .row`: font-family JetBrains Mono; font-size 10.5px; line-height 1.7
- `.rr-passport .row b`: font-weight 600

### 9.3 Identity & bảng
- `.rr-id`: display grid; grid-template-columns 170px 1fr; row-gap 3px; column-gap 14px
- `.rr-id .k`: font-size 9.5px; uppercase; letter-spacing .06em; color #939db0
- `.rr-id .v`: font-family JetBrains Mono; font-size 10.5px
- `.rr-id`: break-inside avoid
- `.rr-table`: width 100%; border-collapse collapse
- `.rr-table th`: font-size 9px; uppercase; letter-spacing .06em; color #939db0; text-align left
- `.rr-table th`: border-bottom 1px solid #1c2532; padding 3px 6px
- `.rr-table td`: font-family JetBrains Mono; font-size 10px; padding 3px 6px
- `.rr-table td`: border-bottom 1px solid #efede4
- `.rr-table tr`: break-inside avoid
- `.rr-verdict[data-v=PASS]`: color #1e7b4f; font-weight 700
- `.rr-verdict[data-v=WARN]`: color #9a6a1f; font-weight 700
- `.rr-verdict[data-v=DRAG]`: color #b43a3a; font-weight 700

### 9.4 Headline & equity
- `.rr-headline`: display grid; grid-template-columns repeat(6, 1fr); gap 8px
- `.rr-headline .cell`: border 1px solid #e3e0d7; border-radius 6px; padding 8px 10px
- `.rr-headline .k`: font-size 8.5px; uppercase; color #939db0
- `.rr-headline .v`: font-family JetBrains Mono; font-size 14px; font-weight 600
- `.rr-equity svg`: width 100%; height 200px
- `.rr-equity .line`: stroke #0f4c5c; stroke-width 1.5; fill none
- `.rr-equity .fill`: fill rgba(15,76,92,.08)
- `.rr-equity .uw`: fill rgba(180,58,58,.5)
- `.rr-equity .boundary`: stroke #9a6a1f; stroke-dasharray 3 3; stroke-width 1
- `.rr-caption`: font-family JetBrains Mono; font-size 9px; color #939db0

## 10. State & biến thể (bảng quyết định)
| Biến thể run | Khối đổi |
|---|---|
| COMPLETED bound (canonical) | đủ 9 khối như §2 |
| COMPLETED scratch | identity binding = "scratch — NOT_PUBLISHABLE"; promotion = "no rc_ can be composed from this run — bind an alpha_version and re-run" |
| COMPLETED published rc | promotion = câu published + SLA |
| FAILED | headline → khối "no claim — run failed at {stage}"; stage checks dừng tại fail (hàng fail đỏ + message); artifacts có ABORTED; equity nếu thiếu → note unavailable |
| mode_5 run | protocol dòng ghi full-sample; verdict table 1 hàng; footnote thêm "calibration run — not an OOS validation" |
| 32-fold | verdict table N hàng flow nhiều trang; thead repeat |

## 11. Print QA checklist (thợ in soát tay)
1. [ ] Letter và A4 đều không tràn ngang (max-width 880 an toàn cả hai).
2. [ ] Passport, identity, headline không bị cắt giữa trang (break-inside avoid).
3. [ ] Bảng verdict 32 hàng: thead lặp mỗi trang; không hàng nào cắt đôi.
4. [ ] Màu verdict/passport giữ khi in màu; grayscale vẫn phân biệt (PASS/WARN/DRAG có chữ, không chỉ màu).
5. [ ] Footer provenance nằm cuối trang cuối, không mồ côi một mình (orphan control: gắn với khối promotion).
6. [ ] No-print bar không xuất hiện; không link màu xanh gạch chân trong bản in (print: color inherit, no underline).
7. [ ] Equity SVG nét ở 300dpi (vector — không raster).
8. [ ] Digest 7 hàng khớp canonical trước khi phát hành PDF.

## 12. Fixture guide
- REPORT_118: canonical đầy đủ (mọi chuỗi §2 verbatim).
- REPORT_118_32F: verdict 32 hàng.
- REPORT_SCRATCH · REPORT_FAILED (fail tại S2, artifacts ABORTED) · REPORT_MODE5 · REPORT_PUBLISHED.
- Mọi fixture dùng chung digest set với 04/05/07 fixtures (import từ fixtures/canonical.ts).

## 13. Telemetry
- report_view {run_id, variant}
- report_print_click (từ no-print bar)
- Không đo gì trong bản in.

## 14. Reviewer checklist
1. [ ] Không format số nào ở FE (grep toFixed/Intl trong feature = 0 ngoài fixture).
2. [ ] Equity là SVG path render từ series — không import chart lib route này.
3. [ ] break-inside rules đúng các khối §9.
4. [ ] Copy diff §6 = 0; digest util chung.
5. [ ] Variants T05/T06 render đúng bảng §10.
6. [ ] Bundle route < 40KB gzip.
7. [ ] In thử Letter + A4 lưu PDF vào PR artifact.

## 15. Glossary
- one sheet: một artifact in — mọi con số từ artifact đã seal, sheet không tính gì.
- provenance footer: dòng nguồn gốc — read-model version + rule version + data_signature.
- no-print bar: thanh điều hướng chỉ tồn tại trên màn hình.


## 16. Copy inventory đầy đủ — VERBATIM từng khối (chép nguyên khi code)

### 16.1 Header
- Title: "QuantBT Run Report"
- Meta line: "generated {ts} · by portal read-model v1 · engine er_quantbt_1_1_1 · quantbt-engine==1.1.1[optimization]"

### 16.2 Passport (6 dòng, format "k — v")
- "validation_claim — strict_nested_fold_local_retraining"
- "chronological_claim — strict_outer_oos_after_frozen_selection"
- "oos_used_for_selection — false"
- "holdout — SEALED — never read"
- "causality — PASS"
- "certificate — B (min of stage caps — S1 holdout seal binds)"

### 16.3 Identity keys (12 nhãn cột trái, đúng thứ tự)
- "alpha" · "alpha_version" · "strategy" · "dataset" · "instrument" · "protocol" · "route" · "runtime authority" · "optimization" · "selected params" · "config digest" · "random seed"

### 16.4 Headline (6 nhãn)
- "OOS Sharpe" · "decay d̄" · "max drawdown" · "trades" · "win rate" · "funding"
- Footnote: "headline = OOS only; IS and holdout never enter this row (holdout sealed, unread)."

### 16.5 Stage checks (5 dòng verbatim)
- "S1 Split — PASS (holdout sealed · cap ≤ B)"
- "S2 Search — PASS (strict schedule · pool frozen pre-OOS)"
- "S3 Freeze — PASS (ordering 2m59s · chain intact)"
- "S4 Execute — PASS (parity 1↔1 · report_level audit)"
- "S5 Claim — ISSUED (cert B)"

### 16.6 Artifacts (7 tên)
- run_spec · selection_trace · fold_plan · fill_ledger · metrics_summary · claim · bundle

### 16.7 Promotion + provenance
- Draft: "release candidate: rc_ (draft) — composed on the Release Candidate screen · gate R1 pending publish"
- Published: "release candidate: rc_2026_0914_a — PUBLISHED · gate R1 PENDING (SLA 5d)"
- Scratch: "no rc_ can be composed from this run — bind an alpha_version and re-run"
- Provenance: "every number on this sheet is read from sealed artifacts of R-WFO-118 att_04; the sheet computes nothing. data_signature 4bc21f · read-model v1 · verdict rule v1."

## 17. Bảng field ReportDetail → khối render (đối chiếu PR)
| Field | Khối |
|---|---|
| passport[6] | §2.3 — render đúng thứ tự mảng |
| identity[12] | §2.4 — grid 2 cột |
| headline[6] + footnote | §2.5 |
| equity {pts, boundaries, uw} | §2.6 SVG |
| folds[] {span, oos, decay, trades, maxdd, verdict} | §2.7 |
| checks[5] | §2.8 |
| artifacts[7] {name, digest, state} | §2.9 |
| promotion_line · provenance | §2.10 |
| variant ('canonical'\|'scratch'\|'failed'\|'mode5'\|'published') | chọn khối theo §10 |

## 18. SVG equity render spec (pure function)
```ts
function equitySvg(pts: number[], boundaries: number[], uw: number[], w=824, h=200): string
```
- scale y: min/max pts pad 4%; path M/L làm tròn 2 số lẻ.
- boundaries: index bar → x; vẽ line + text nhãn f1…fN (font 8px mono, #9a6a1f).
- underwater: path riêng height 40 dưới (baseline 0, fill đỏ .5).
- Unit: pts rỗng → placeholder rect + text unavailable; 1 điểm → line ngang; NaN bị lọc + dev-warning.

## 19. Không-trạng-thái
- Màn không có state ngoài fetch; không hash; không control ngoài no-print bar.
- Không polling; report của run terminal là bất biến — cache vĩnh viễn theo (run_id, attempt, read_model_version).

> End of spec 09 · v1.1 · pair with hi-fi `QuantBT 09 Run Report.dc.html`.
