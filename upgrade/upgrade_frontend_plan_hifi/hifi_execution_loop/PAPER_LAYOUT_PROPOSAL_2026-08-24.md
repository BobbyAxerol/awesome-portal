# Paper Workbench — layout proposal đo bằng px (EL-V2-04, §14.5)

Mục tiêu một câu của route: **Deployment này có đang bám evidence đã duyệt không, và đã đủ điều kiện
rời Paper chưa — nếu chưa, cái gì chặn?** Mọi thứ không trả lời câu đó rời canvas mặc định.

## 1440 × 900 (khung shell: topbar 48 · sidebar 248 · gutter 24 ⇒ canvas 1144 rộng, fold ≈ 828 cao)

| Vùng | Vị trí (y từ đỉnh canvas) | Cao | Vai chữ | Nội dung |
|---|---|---|---|---|
| Preview strip | 0 | 32 | meta 11 | `FIXTURE PREVIEW · No live connection` + Details + Inspector |
| Masthead | 40 | 76 | title 24 sans + meta id · badges meta 11 · body 13 | `Carry v3.2` `dep_74` · badge **stage / runtime / readiness / sync** tách · 1 câu purpose · CTA `Request Paper Exit Review` (phải, trên) |
| Lifecycle rail | 124 | 32 | meta 11 | R1 ✓ AP-101 → R2 ✓ AP-207 → **PAPER ● 30/30 · 312/300** → SBX — → CANARY — → LIVE — |
| Decision strip | 168 | 76 | th 11 + **kpi 24 mono** | Equity · Net PnL 30d · Max DD · Allocation · Projection freshness — 5 ô auto-fit ≥160 |
| Canvas 8/4 | 260 | 340 | — | trái 780 × 340: **chart** equity vs approved (trục + tooltip + band + gap); phải 340 × 340: **rail** |
| — rail: Next | 260 | ~110 | section 15 + body 13 | "Next: Paper Exit Review" · gate MET/UNMET + 3 tiêu chí · CTA |
| — rail: Blockers | 370 | ~90 | th 11 + body 13 | tên từng blocker/WATCH (không chỉ đếm) |
| — rail: Freshness | 460 | ~40 | meta 11 | `EXECUTION · as_of … · age …` |
| — rail: Provenance | 500 | 32 đóng | th 11 → mở: meta 11 + Copy | artifact `9f3c1a…e2` · R1 · R2 · PF · acct · rev |
| Tabs | 616 | 40 | control 13 | Overview · Positions · Orders · Fills · Sessions · Accounting · Evidence |
| Tab panel | 656 → | ≥ 200 | data 12 / num 14 | nội dung tab đang chọn |

**Above the fold (≤ 828):** masthead + rail Next (quyết định) + Blockers + CTA — đủ, còn ~170px dư.
Chart body 340 cao ở 780 rộng = tỉ lệ 2.3:1, đọc được trục thời gian 30 ngày ở bucket 1h (720 điểm).

## 1728 × 1000 (canvas 1432, fold ≈ 928)

Cùng thứ tự; canvas max 1440 nên gần như cùng số đo; chart 1060 × 360; rail 340. Không phóng chữ.

## Di chuyển khỏi canvas mặc định (§10.2)

| Trước (trên canvas) | Sau |
|---|---|
| lineage strip 8 chip + digest đầy | rail → Provenance (đóng), digest head-6/tail-2 + Copy full |
| Runtime health panel | tab **Sessions** (cùng bảng session) |
| Accounting panel | tab **Accounting** |
| Portfolio contribution panel | tab **Evidence** |
| Drift table + 2 câu policy | tab **Evidence**; chỉ dòng drift WATCH/FAIL lên rail Blockers |
| Banner calendar/stale dài 3 câu | 1 dòng state → consequence (rail Freshness + strip note); phần giải thích vào disclosure |
| "These gates feed Paper Exit Review…" | disclosure trong Evidence |

## Ma trận tương tác

| Control | Lớp §8.1 | Kết quả |
|---|---|---|
| tab ×7 | local | panel đổi, `?tab=` |
| Request Paper Exit Review | navigation | `/governance/exit-reviews/EX-771?from=…`; disabled + tiêu chí unmet khi gate chưa đạt |
| chart drag / dblclick / expand / table | local | dataZoom · reset · panel toàn chiều · bảng số |
| Provenance Copy full | simulated | clipboard + ledger |
| Admin actions | navigation | `/administration/actions` |

## Trạng thái phải phủ

Freshness **FRESH / AGING / STALE / PAUSED / UNKNOWN** × gate **MET / UNMET / INSUFFICIENT** = 15 tổ hợp
(it.each). PAUSED = calendar đóng (VNM). INSUFFICIENT không bao giờ render như MET.

## Chart — sự thật về dữ liệu

**Không contract nào publish series equity** (`insight-batch` chỉ scalar; contract pack không có
`equity_projection`). Product route ⇒ trạng thái honest gọn: *"Equity series not published —
equity_projection.v1 requested (BR-EX-34)"* trong khung 340px có trục trống? **Không** — không khung
trống: một hộp compact 96px với lý do + link BR. Cơ chế chart (ECharts, tooltip+envelope, band, gap,
zoom/reset, expand, table) được chứng minh trên `/execution/_fixtures` với series **evidence-only**
(caption ghi rõ, không phải projection đã publish).
