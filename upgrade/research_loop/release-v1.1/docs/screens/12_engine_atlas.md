# SPEC 12 · Engine Atlas — `QuantBT 12 Mode Atlas.dc.html`

> Màn THAM CHIẾU (không phải stage): 3 tab — WFO modes · Execution routes · Claims by contract. Guide plan; copy VERBATIM.
> Luật gốc: Atlas đọc từ release manifest + support matrix — engine thêm route/mode thì Atlas mọc theo, FE không sửa.

## 1. Meta
| Key | Value |
|---|---|
| Route | `/research/quantbt/atlas` |
| Tabs | `modes` · `routes` · `claims` (hash `#tab=&mode=&route=`) |
| Inbound | 04 tab atlas · 02 route grid "full route atlas →" · Journey |
| Outbound | 06 deep-link `#mode=&schedule=` · 02 (declare route) · 08 (replay route) |
| Console chuẩn | 0 error/warning; KaTeX fallback như 06 |

## 2. Tab modes (5 card lớn, 1 cột dọc)
Mỗi card: header `mode_x` + tên + claim chips per schedule; thân 2 cột:
- Trái: **data-usage animation** (pulse train/test như 06 §2 diagram, loop 2.2s) + KaTeX objective + bảng term (k · nghĩa · nguồn).
- Phải: `SUSPECT` line (chữ ký thất bại — vd m1: "pretty S̄_OOS with fat σ_d; negative d̄ everywhere smells like leakage") + `artifacts` line (SelectionTraceV1 fields) + `when to reach for it` 1 câu + `rule one/two` (2 câu chuẩn mực).
- Nút: `see it live → S2` (06 demo mode đó) — mang `#mode=&schedule=`.
- Bảng cuối tab: "when to reach for which mode" 5 hàng (mode · dùng khi · tránh khi).

## 3. Tab routes (bảng 14 hàng — từ manifest)
Cột: `route · family · contract · backend · report levels · status · declare · replay`.
- status: OK/DEFAULT/RUST/LEGACY/6-9/EXP/DEFERRED + refusal reason cho hàng disabled (arbitrage 3 spec schema-only liệt kê tên + lý do).
- declare → 02 (`?route=`), replay → 08 fixture route đó (demo) — portal thật: link 08 của run gần nhất route đó hoặc disabled + "no run with this route yet".

## 4. Tab claims (7 contract × hàng)
Cột: `contract · engine cert L · numeric guarantee · never claims`.
- 7 hàng: close_target_v2 L2 · intrabar_bracket_v1 L2 · fill_replay L1 · event_lifecycle L2 · reactive R1–R3B L3 · native_portfolio L2 · nautilus L4.
- "never claims" là NỘI DUNG CHÍNH (vd close_target_v2: "never claims intrabar SL/TP fills"); footer: `certificate = min(engine cert, methodology cap, artifact completeness)`.

## 5. Data & pitfalls & tests
```ts
GET /quantbt/atlas → { modes: ModeCard[], routes: RouteRow[], claims: ClaimRow[] }  // manifest-driven
```
Pitfalls: (1) WRONG hardcode 14 hàng — RIGHT render từ manifest; (2) WRONG animation chạy khi reduced-motion — RIGHT tắt; (3) WRONG SUSPECT/never-claims paraphrase — RIGHT verbatim engine docs; (4) WRONG tab claims trộn 2 trục cert — RIGHT chỉ engine cert ở đây, footer nhắc công thức min; (5) WRONG deep-link 06 thiếu schedule — RIGHT mang cả cặp.
Tests: T01 3 tab render + hash; T02 mode card KaTeX + fallback; T03 deep-link 06 đúng mode/schedule; T04 route DEFERRED disabled + reason; T05 claims đủ 7 + footer; T06 manifest thêm route thứ 15 (fixture) → hàng mới tự mọc; T07 660px bảng cuộn; T08 axe 0 serious; T09 reduced-motion pulse tắt; T10 copy diff = 0.

## 6. Copy & guide
- Copy verbatim: SUSPECT lines (5), rule one/two (5 cặp), never-claims (7), refusal reasons (3 arbitrage + options deferred), footer min-formula.
- Guide: 1) types+fixture manifest; 2) ModeCard (KaTeX lazy chung 06); 3) RoutesTable; 4) ClaimsTable; 5) tests T01–T10. DoD: screenshot 3 tab ≤1%; manifest-drive test T06 pass.
- Phi phạm vi: không playground chạy thử mode; không so 2 mode side-by-side (đọc là đủ).


## 7. Per-element CSS ledger
- `.at-tabs`: display flex; gap 4px — grammar ef-tab (spec 04 §14.3)
- `.at-modecard`: border 1px solid #e3e0d7; border-radius 10px; background #fff; padding 14px 16px
- `.at-modecard .name`: font mono 12px 700
- `.at-claimchip`: font mono 9px; border 1px solid; radius 3px; padding 0 5px — màu theo claim bậc (strict xanh · adjusted vàng · retro vàng · calibration đỏ)
- `.at-suspect`: border-left 2px solid #b43a3a; padding-left 8px; font-size 10.5px; color #4e5a6e
- `.at-suspect .t`: font mono 8.5px 700; color #b43a3a; letter-spacing .08em
- `.at-rule`: font-size 10.5px; color #4e5a6e; line-height 1.55
- `.at-anim .train`: display inline-block; height 12px; background #a8c6ce; animation sr-pulse 2.2s infinite
- `.at-anim .test`: border 1px solid #0f4c5c; background #e2edf0
- `.at-routes table`: min-width 900px trong overflow-x auto
- `.at-routes .status[data-s=DEFERRED]`: color #b43a3a; border-style dashed
- `.at-claims .never`: color #b43a3a; font-size 10.5px
- `.at-footer`: font mono 10px; color #4e5a6e; border-top 1px solid #efede4; padding-top 8px

## 8. Copy inventory — VERBATIM (các chuỗi chuẩn mực)
- 5 SUSPECT lines (m1 đã nêu §2; m2: "a fat right tail alone — bootstrap flatters momentum; check d_boot"; m3: "fallback_reasons non-empty — the surface is a spike field, not a plateau"; m4: "fine M_T with fat D_T — subperiod luck, not robustness"; m5: "any attempt to read J₅ as an OOS proof — it is calibration by construction")
- 5 cặp rule one/two (chép từ hi-fi card values)
- 7 never-claims (close_target_v2 "never claims intrabar SL/TP fills" · intrabar "never claims queue position or partial fills" · fill_replay "never claims signal quality — accounting only" · lifecycle "never claims exchange latency realism" · reactive "never claims tick-level fills — bar-close wakes only" · portfolio "never claims per-leg venue microstructure" · nautilus "never claims live-market slippage — sim parity only")
- Footer: "certificate = min(engine cert, methodology cap, artifact completeness)"

## 9. Fixture & manifest-drive test
- ATLAS_MANIFEST: 5 mode + 14 route + 7 claim — nguồn duy nhất render.
- T06 chi tiết: thêm route thứ 15 {id:'options_v2', status:'EXP'} vào fixture → bảng routes 15 hàng, không sửa component (assert bằng snapshot số hàng).

## 10. Reviewer checklist
1. [ ] 0 hardcode route/mode trong JSX (grep 'signal_notional' ngoài fixture = 0).
2. [ ] KaTeX chung util với 06; fallback test.
3. [ ] Deep-link 06 mang cặp mode+schedule; 02 mang ?route=.
4. [ ] reduced-motion tắt pulse; copy diff §8 = 0.
5. [ ] Screenshot 3 tab ≤1%; bảng cuộn ở 660px.

## 11. Glossary
- Atlas: tham chiếu sống từ manifest — không phải tài liệu tĩnh.
- SUSPECT line: chữ ký thất bại — dấu hiệu nên nghi kết quả của mode.
- never claims: ranh giới trung thực của contract — nội dung quan trọng nhất tab claims.

> End of spec 12 · v1.1 · pair with hi-fi `QuantBT 12 Mode Atlas.dc.html`.
