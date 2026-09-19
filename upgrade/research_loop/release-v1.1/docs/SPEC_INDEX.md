# SPEC_INDEX — QuantBT Backtest Transparency · spec pack v1.1

> Cửa vào bộ spec: đọc theo LUỒNG UX (đúng thứ tự index.html → Journey Map dẫn), mỗi màn một file ≥ chuẩn chi tiết đã thống nhất (anatomy px · tính động · data contract · backend wiring · pitfalls WRONG→RIGHT · test matrix · copy VERBATIM · guide plan · DoD).

## 1. Đọc theo luồng (thứ tự UX chính)

| # | Spec | Màn hi-fi | Vai trò trong luồng |
|---|---|---|---|
| 0 | `00_journey_map.md` | QuantBT 00 | Cửa vào — bản đồ 8 phase, index.html redirect tới đây |
| 1 | `14_alpha_import.md` | QuantBT 14 | P2 — nộp .py, 7 gate, sinh av_ (nguồn binding) |
| 2 | `01_run_library.md` | QuantBT 01 | P3 — chọn run theo bằng chứng; alpha scoping |
| 3 | `02_new_run.md` | QuantBT 02 | P4 — khai báo: context av_ · route · methodology · sweep/pin |
| 4 | `03_run_progress.md` | QuantBT 03 | P5 — SSE/poll, claim FORECAST→ISSUED, bàn giao cursor |
| 5 | `04_evidence_flow.md` | QuantBT 04 | P6 hub — claim strip, cursor, 7 tab |
| 6 | `05_s1_split.md` | QuantBT 05 | P6 S1 — fold anatomy, purge/embargo, holdout seal |
| 7 | `06_s2_search.md` | QuantBT 06 | P6 S2 — Stage A/B, freeze line, J₁…J₅ |
| 8 | `07_s3_freeze.md` | QuantBT 07 | P6 S3 — ordering 2 trục, digest chain, what-if fork |
| 9 | `08_s4_execute.md` | QuantBT 08 | P6 S4 — replay transport, route-honest panels |
| 10 | `09_run_report.md` | QuantBT 09 | P7 — one-sheet in được |
| 11 | `10_attempt_lineage.md` | QuantBT 10 | P6/P7 — version ledger, 52 attempt, promotion pick |
| 12 | `11_release_candidate.md` | QuantBT 11 | P7 — compose rc_, evidence pack 12, publish, mirror |
| 13 | `12_engine_atlas.md` | QuantBT 12 | tham chiếu — modes · routes · claims |
| 14 | `13_compare.md` | QuantBT 13 | so sánh trong 1 alpha — 3 chế độ, contract key guard |

Docs nền (cùng thư mục cha `docs/`): `00_README.md` (version freeze) · `01_IA_AND_WIRING.md` (IA + invariants) · `02_SCREEN_SPECS.md` (tóm tắt 1 khối/màn) · `03_ALPHA_RC_BINDING.md` (chuỗi alpha→rc_, taxonomy, payload) · `04_ENGINE_ROUTE_MATRIX.md` (14 route, J-formulas, mode×schedule, sweep/pin, fold plan).

## 2. Bảng nối màn (ai link sang ai, bằng gì)

| Từ → Đến | Cơ chế | Mang theo |
|---|---|---|
| index → 00 | meta refresh | — |
| 00 → mọi màn | card link | — |
| 14 → 02 | `new run with this av_ →` | alpha+av prefill |
| 14 → 10 | registry strip | ?av= |
| 01 → 04 | open evidence → | run route (04 tự đọc hash riêng) |
| 01 → 03 | watch progress → (RUNNING) | run route |
| 01 → 13 | compare bar | ?runs=a,b |
| 01 → 11 | rc chip | rc route |
| 02 → 03 | create run 201 | run mới |
| 03 → 04 | open evidence flow → | #stage=summary&fold&trial&params |
| 03 → 05/06/07/08 | stage rail (done) | #fold |
| 04 ↔ 05/06/07/08 | deep dive / breadcrumb | FULL hash cursor (bất biến khi đổi tab) |
| 05 → 06 · 06 → 07 · 07 → 08 | next-stage nav | FULL hash |
| 05/06/07/08 → 04 | breadcrumb | FULL hash |
| 07 → 02 | create sibling attempt | ?fork_from= (hook) |
| 04/09/10 → 11 | release candidate / promotion pick / rc chip | run route |
| 11 → 04/05/06/07/08/09 | evidence pack rows | màn nguồn (giữ ngữ cảnh SPA) |
| 04 → 09 | generate report → | run route |
| 04/02 → 12 | atlas link | #tab (=modes/routes) |
| 12 → 06 | see it live → | #mode=&schedule= |
| 12 → 02 | declare → | ?route= |
| 10 → 02 | untried routes | ?route= |

## 3. Hợp đồng chung mọi màn phải theo
1. **Cursor package** (`quantbt/cursor`): parse/serialize hash `#stage&fold&trial&params&schedule&route&seq` — key order cố định; 04 sở hữu `stage`; deep-dive chỉ đổi fold/trial/seq; golden cases ở spec 04 §30.
2. **SCREEN_ROUTES** map — mọi href nội bộ qua map; CI link-audit.
3. **Digest util chung** — `sha256:` + 6 hex · `prm_` + 6 hex; fold digests canonical: prm_9d44f2 · 3b81c7 · 7c1a9e · c25a1d · 66e09b; test chéo màn 03/04/05/07/08/09.
4. **Chip/pill grammar** — off/on/on-warn + status colors (spec 01 §2.3, 06 §15.1) dùng chung.
5. **Server-truth**: FE không tính cert/verdict/J/correlation/ETA/fold-count chính thức — chỉ render chuỗi server; các "preview" (fold plan 02, what-if 07) luôn dán nhãn preview.
6. **not_applicable/degraded có lời** — không bảng rỗng câm; na string do server viết.
7. **Copy VERBATIM** — mỗi spec có Copy inventory; CI diff copy = 0.
8. **A11y sàn**: focus ring token; aria đúng bảng mỗi spec; axe 0 serious; reduced-motion tắt pulse/blink.
9. **Không scrollIntoView** — scrollTop container.
10. **Engine release consistency** — `er_quantbt_1_1_1 · quantbt-engine==1.1.1[optimization]` mọi nơi hiển thị engine.

## 4. Thứ tự build đề xuất (dependency-first)
1. Nền: SCREEN_ROUTES · cursor package · digest util · chip grammar CSS · chart theme.
2. 01 → 02 → 03 (luồng tạo-chạy) — msw mock orchestrator.
3. 04 (hub + read-model contract) → 05 → 06 → 07 → 08 (deep-dives).
4. 09 → 10 → 11 (promote path) — governance mock.
5. 12 · 13 · 14 (tham chiếu, so sánh, intake).
6. Integration suite liên màn (03→04, 04↔06, 05→06→07→08, 10→11, 14→02→01) + screenshot-diff toàn bộ ≤1%.

## 5. Definition of Done toàn dự án
- 15 spec: mọi test matrix xanh; copy diff 0; screenshot diff ≤1% (1280 & 660).
- Link-audit 0 chết; cursor round-trip invariant pass.
- axe 0 serious mọi màn; bundle cap từng route theo spec.
- Digest & engine-release consistency test chéo màn pass.

> SPEC_INDEX v1.1 · frozen 2026-09-15 · đi kèm 15 hi-fi `.dc.html` + index.html trong release-v1.1.
