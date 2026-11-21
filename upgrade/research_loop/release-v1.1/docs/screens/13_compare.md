# SPEC 13 · Compare — within one alpha — `QuantBT 13 Compare.dc.html`

> So sánh là QUỸ ĐẠO PHƯƠNG PHÁP trong MỘT alpha — không phải leaderboard. Guide plan; copy VERBATIM.
> Luật gốc: (1) ComparisonContractKey (symbol·tf·route·protocol) là cổng — khác key thì TỪ CHỐI kèm lý do; (2) claim xếp trước số; (3) cặp được promote theo claim YẾU HƠN.

## 1. Meta
| Key | Value |
|---|---|
| Route | `/research/quantbt/compare?runs=a,b` hoặc `?alpha=&mode=` |
| 3 chế độ | `attempts` (mặc định): các attempt của 1 alpha — claim ladder · `markets`: 1 alpha × N market — small multiples · `pair`: 2 run cùng key — overlay + delta |
| Inbound | 01 compare bar · 10 · 04 |
| Outbound | 04 (từng run) · 10 (tree) · 11 |
| Console chuẩn | 0 error/warning |

## 2. Chế độ attempts — claim ladder
- Mỗi attempt 1 hàng: `att · run · claim chip (xếp bậc: strict > selection-adjusted > retrospective > calibration) · cert · OOS · decay · per-fold bars mini · diff-vs-parent chips`.
- Sắp theo BẬC CLAIM trước, số sau; header: "claims rank before numbers — a weaker claim with a prettier Sharpe still ranks lower."
- Card trajectory cuối: "what this trajectory says" — 1 đoạn server viết (vd 1.31→1.19 nhưng retrospective→promotable).

## 3. Chế độ markets — small multiples
- Grid card per market: equity mini + 4 số; **không overlay** — caption: "different contract keys — small multiples only; an overlay across keys would be a comparison lie."

## 4. Chế độ pair — 2 run cùng key
- Guard đầu trang: key match ✓ (chip 4 phần symbol·tf·route·protocol) — mismatch: card đỏ TỪ CHỐI verbatim (copy 01 §compare) + không render gì thêm.
- Overlay equity 2 line (#0f4c5c / #9a6a1f) + bảng delta (OOS · decay · maxDD · trades · claim) + hàng "pair promotes under: {claim yếu hơn}" + engine-published OOS-return correlation chip (từ artifact — KHÔNG tự tính: thiếu → "correlation artifact absent — the engine did not publish one for this pair").

## 5. Data & pitfalls & tests
```ts
GET /quantbt/compare?mode=&alpha=&runs= → CompareDetail  // per-mode union; guard verdict server
```
Pitfalls: (1) WRONG cho overlay khác key "để tham khảo" — RIGHT từ chối tuyệt đối; (2) WRONG FE tính correlation — RIGHT artifact hoặc absent note; (3) WRONG sort theo Sharpe mặc định ở attempts — RIGHT bậc claim trước; (4) WRONG line 2 run cùng màu đậm nhạt — RIGHT 2 màu token khác nhau + legend; (5) WRONG guard chip ẩn phần khớp — RIGHT hiện đủ 4 phần, phần lệch đỏ.
Tests: T01 attempts ladder sort đúng bậc; T02 trajectory card verbatim; T03 markets không overlay + caption; T04 pair match render overlay+delta; T05 pair mismatch → refusal verbatim, không chart; T06 correlation absent note; T07 "promotes under weaker claim" đúng; T08 deep-link ?runs= từ 01; T09 660px; T10 axe; T11 copy diff 0.

## 6. Copy & guide
- Copy verbatim: refusal (01), small-multiples caption, ladder header, promotes-under line, correlation-absent note.
- Guide: 1) types union 3 mode + fixtures; 2) guard chip 4 phần; 3) attempts ladder; 4) markets grid; 5) pair overlay/delta; 6) T01–T11. DoD: screenshot 3 mode + mismatch ≤1%.
- Phi phạm vi: không so >2 run pair; không so 2 alpha khác nhau (khác identity — ngoài phạm vi domain này v1); không export.


## 7. Per-element CSS ledger
- `.cp-guard`: display flex; gap 6px; align-items center; flex-wrap wrap
- `.cp-keypart`: font mono 10px; border 1px solid #e3e0d7; radius 3px; padding 1px 6px; background #fff
- `.cp-keypart[data-mismatch=true]`: border-color #b43a3a; color #b43a3a; background #f7e8e8
- `.cp-refusal`: border 1px solid #b43a3a; border-radius 8px; background #f7e8e8; padding 12px 14px; color #1c2532; font-size 11.5px; line-height 1.55
- `.cp-ladder .row`: display flex; gap 10px; align-items center; padding 5px 12px; border-bottom 1px solid #f4f2ec; font mono 10.5px
- `.cp-claimchip[data-rank=1]`: color #1e7b4f; border 1px solid #1e7b4f (strict)
- `.cp-claimchip[data-rank=2]`: color #9a6a1f (selection-adjusted) · [3] vàng nhạt (retro) · [4] #b43a3a (calibration)
- `.cp-foldbars`: display flex; gap 1px; align-items flex-end; height 22px — cột 3px per fold
- `.cp-overlay .lineA`: stroke #0f4c5c · `.lineB`: stroke #9a6a1f — legend bắt buộc
- `.cp-delta td[data-sign=pos]`: color #1e7b4f · [neg]: #b43a3a
- `.cp-smallmult`: grid minmax(240px,1fr); card grammar chuẩn

## 8. Copy inventory — VERBATIM
- Ladder header: "claims rank before numbers — a weaker claim with a prettier Sharpe still ranks lower."
- Refusal (chuẩn 01): "these two runs do not share a ComparisonContractKey (symbol · timeframe · route · protocol) — a side-by-side would be a comparison lie, so the button refuses."
- Small-multiples caption: "different contract keys — small multiples only; an overlay across keys would be a comparison lie."
- Promotes-under: "the pair promotes under its weaker claim: {claim}"
- Correlation absent: "correlation artifact absent — the engine did not publish one for this pair."

## 9. Claim rank map (DATA — không if-else rời)
| rank | claim family | chip màu |
|---|---|---|
| 1 | STRICT_OUTER_OOS* | xanh |
| 2 | SELECTION_ADJUSTED_OOS | vàng |
| 3 | retrospective / walk_forward_oos compat | vàng nhạt |
| 4 | NONE_FULL_SAMPLE_CALIBRATION / IS-only | đỏ |
- Sort attempts: rank asc → rồi OOS desc trong cùng rank. Map là bảng data + test đủ family.

## 10. Fixture guide
- CMP_ATTEMPTS: 5 attempt alpha_momentum (rank 1,1,2,3,4) — assert sort.
- CMP_MARKETS: 3 market key khác nhau.
- CMP_PAIR_OK: 118 vs 117 cùng key + correlation 0.42.
- CMP_PAIR_MISMATCH: 118 vs TT-002 (tf khác) — keypart tf đỏ.
- CMP_PAIR_NOCORR: artifact absent.

## 11. Reviewer checklist
1. [ ] Rank map data-driven; test đủ family; sort đúng T01.
2. [ ] Mismatch: không render bất kỳ chart/số nào sau refusal card (T05).
3. [ ] Correlation không tính ở FE (grep corr math = 0).
4. [ ] 2 line 2 màu + legend; không đậm/nhạt cùng màu.
5. [ ] Copy diff §8 = 0; screenshot 3 mode + mismatch ≤1%.

## 12. Glossary
- ComparisonContractKey: symbol·tf·route·protocol — điều kiện tối thiểu để một phép so KHÔNG nói dối.
- claim ladder: xếp bậc theo sức mạnh claim — trục chính của chế độ attempts.
- promotes under weaker claim: cặp run chỉ mạnh bằng claim yếu hơn của hai bên.

> End of spec 13 · v1.1 · pair with hi-fi `QuantBT 13 Compare.dc.html`.
