# SPEC 10 · Attempt Lineage — `QuantBT 10 Attempt Lineage.dc.html`

> Lịch sử trung thực của một ý tưởng ở quy mô 50–100 attempt. Guide plan cho agent code; copy VERBATIM; số = CSS px.
> Luật gốc: (1) attempt bất biến — abandon là TRẠNG THÁI, không phải xoá; (2) đổi code = av_ mới ⇒ gates reset — hiển thị như diff, không phải attempt thường; (3) tổng số attempt là công bố multiple-testing, không giấu.

---

## 1. Meta

| Key | Value |
|---|---|
| File hi-fi | `QuantBT 10 Attempt Lineage.dc.html` |
| Route | `/research/quantbt/alphas/{alphaId}/lineage` (root theo alpha; deep-link `?av=`) |
| Vai trò | Version ledger per av_ + cây attempt: 6 attempt kể chuyện đầy đủ + 46 probe thu gọn, PROMOTION PICK, diff-vs-parent, trạng thái ACTIVE/SUPERSEDED/ABANDONED/DRAFT |
| Persona | researcher · manager (promotion pick) · auditor (multiple-testing) |
| Shell | Có |
| Inbound | 01 group header · 02 Context "lineage →" · 04 header chip · 07 sibling hook · 14 register xong |
| Outbound | 01 (runs of av) · 02 (new run) · 04 (attempt → run) · 09 · 11 (rc chip) · 14 (import new version) |
| Console chuẩn | 0 error/warning |

## 2. Layout anatomy

### 2.1 Header
- Breadcrumb `Alphas / alpha_momentum_btc / Lineage` + title **Attempt Lineage — the idea's honest history** + subtitle italic: "52 attempts, 6 worth telling, one promotable. Every dead end stays on the record — the count itself is a multiple-testing disclosure."
- Phải: filter chips status (ACTIVE/SUPERSEDED/ABANDONED/DRAFT) + counter `showing {n} of {m} attempts` + toggle `show 46 probes`.

### 2.2 Version ledger (root — 1 band per av_)
Mỗi band (card trắng, border-left 3px theo state):
- Hàng 1: chip `av_0_9_3` + state (ACTIVE xanh / SUPERSEDED xám) + digest + entrypoint + outcome text + link `import new version →` (14, chỉ band ACTIVE).
- Hàng 2: attempt chips cuộn ngang — `att_01 … att_52` ô mono nhỏ, màu theo status; ● vàng = có rc; click chip → scroll tới card attempt (nếu là probe → mở probe row).
- Hàng 3 "exercised": `routes: signal_notional · intrabar_bracket — modes: m1×pfc, m2×g — param ranges: window 12–72, entry_z 0.6–2.6` + `untried: portfolio, reactive → declare at New Run` (link 02).
- **PROMOTION PICK banner** (band ACTIVE, nếu có): nền #fdfbf5 viền vàng: "att_04 · R-WFO-118 is the single promotable attempt of this version — cert B · claim strict · rc_ draft composed. → open Release Candidate" (link 11).

### 2.3 Cây attempt (6 storied — card đầy đủ)
Mỗi card: cột trái đường nối cha-con (border-left + chấm); nội dung:
- Hàng 1: `att_04` mono 700 + status chip + run link `R-WFO-118` + av chip + rc chip (nếu có) + created.
- Hàng 2 spec line mono 10px: `signal_notional · mode_1_decay × per_fold_causal · space (6p · 5 swept / 1 pinned)`.
- Hàng 3 **diff vs parent** (vàng): `entry_z high 2.2 → 2.6 · schedule per_fold_decay → per_fold_causal` — mỗi diff một chip; diff av (code): chip ĐỎ NHẠT `alpha_version: av_0_9_2 → av_0_9_3 · GATES RESET`.
- Hàng 4 outcome 1 câu + metrics mini (cert · OOS · decay).
- ABANDONED: card opacity .72 + lý do: "abandoned — decay unstable across seeds; kept for the record."

### 2.4 Probe rows (46 — thu gọn sau toggle)
- Mỗi probe 1 dòng mono 10px: `att_17 · m2×g · window 24–48 · J 1.03 · ABANDONED` — nhóm theo tuần; không diff chips; click → expand 3 dòng chi tiết.

### 2.5 Rules footer
"Attempts are immutable and append-only; abandoning is a state, not a deletion. A code change is never an attempt — it is a new alpha_version, and both gates run again. The attempt count travels with any promotion as its multiple-testing context."

## 3. Data contract
```ts
interface LineageDetail {
  alpha: { id: string; name: string };
  versions: {
    av: string; digest: string; state: 'ACTIVE'|'SUPERSEDED'|'DRAFT'; entrypoint: string;
    outcome: string; exercised: { routes: string[]; modes: string[]; ranges: string };
    untried: string[]; promotion_pick: { att: string; run: string; note: string } | null;
    attempts: AttemptNode[];
  }[];
  total: number;
}
interface AttemptNode {
  id: string; parent: string | null; kind: 'storied'|'probe';
  status: 'ACTIVE'|'SUPERSEDED'|'ABANDONED'|'DRAFT';
  run_id: string | null; rc: RcRef | null; created_at: string;
  spec_line: string; diffs: { k: string; from: string; to: string; gates_reset?: boolean }[];
  outcome: string; metrics: { cert: string|null; oos: string|null; decay: string|null };
  abandon_reason: string | null;
}
```
- `GET /alphas/{id}/lineage` — read-model từ attempt registry (engine ghi parent + config-key diffs); probe/storied do server phân loại (storied = có rc, hoặc đổi ≥2 key chiến lược, hoặc được đánh dấu).
- Diff keys là CONFIG KEYS thật (khớp payload 02 §25) — không diễn giải tự do.

## 4. Pitfalls — chớ làm sai
1. WRONG: vẽ cây đồ thị tự do (edge chéo). RIGHT: cây thụt cấp đơn giản — lineage là danh sách có cha, không phải DAG vẽ mạng.
2. WRONG: probe ẩn hoàn toàn. RIGHT: toggle + counter luôn nói tổng (multiple-testing).
3. WRONG: diff paraphrase ("nới entry_z"). RIGHT: `k: from → to` config keys.
4. WRONG: av-change render như attempt thường. RIGHT: chip đỏ GATES RESET — khác loại.
5. WRONG: xoá/ẩn ABANDONED. RIGHT: opacity .72 + lý do.
6. WRONG: attempt chips band cuộn cả trang. RIGHT: cuộn ngang trong band.
7. WRONG: promotion pick suy từ metrics ở FE. RIGHT: server chỉ định (governance).
8. WRONG: click chip probe scroll tới card không tồn tại. RIGHT: mở probe row expand đúng nhóm.

## 5. Test matrix
| ID | Case | Expected |
|---|---|---|
| T01 | load | 2 band av (0_9_3 ACTIVE trước); 6 storied card; probes ẩn; counter "showing 6 of 52" |
| T02 | toggle probes | 46 row nhóm tuần; counter "52 of 52" |
| T03 | filter ABANDONED | chỉ card/row abandoned; counter đúng |
| T04 | click chip att_17 (probe, đang ẩn) | tự bật toggle + expand att_17 |
| T05 | diff av card | chip GATES RESET đỏ; không nằm trong diffs thường |
| T06 | promotion pick | banner đúng att_04; link 11 |
| T07 | rc chip att_04 | ● vàng; click → 11 |
| T08 | exercised/untried | untried link → 02 |
| T09 | deep-link ?av=av_0_9_2 | band đó mở đầu viewport (không scrollIntoView — dùng scrollTop container) |
| T10 | 100-attempt fixture | virtual list probe rows; band chips cuộn mượt |
| T11 | 660px | card wrap; spec line xuống dòng; không tràn |
| T12 | axe | chips role=button aria-label "attempt att_17 — ABANDONED"; 0 serious |

## 6. Copy inventory — VERBATIM
- Subtitle §2.1 · rules footer §2.5 · abandon mẫu §2.3 · GATES RESET chip text · promotion pick câu §2.2 · untried "declare at New Run".

## 7. TS architecture & guide plan
```
<LineagePage> → VersionBand[] → {PromotionBanner?, AttemptChips, ExercisedRow, AttemptTree}
AttemptTree: storied cards (indent theo depth cha) + ProbeGroups (virtual khi >40)
```
1. Types + fixture 52 attempt (6 storied + 46 probe, 2 av band) — số từ hi-fi.
2. VersionBand + chips scroll — T01/T09.
3. Storied card + diff chips + av-change đặc biệt — T05.
4. ProbeGroups + toggle + filter — T02/T03/T04.
5. Banner + links — T06/T07/T08.
6. Virtual 100 fixture — T10.
7. DoD: T01–T12 xanh; copy diff 0; screenshot 2 trạng thái toggle ≤1%.

## 8. Phi phạm vi
- Không so sánh số liệu giữa attempt (13 lo).
- Không tạo/sửa attempt từ đây (chỉ điều hướng 02).
- Không vẽ DAG merge — lineage là cây.


## 9. Per-element CSS ledger

### 9.1 Version band
- `.ln-band`: border 1px solid #e3e0d7
- `.ln-band`: border-left 3px solid #1e7b4f (ACTIVE)
- `.ln-band[data-state=SUPERSEDED]`: border-left-color #c9c5ba
- `.ln-band`: border-radius 8px; background #ffffff
- `.ln-band`: box-shadow 0 1px 2px rgba(28,37,50,.05)
- `.ln-band`: padding 12px 16px; display flex; flex-direction column; gap 8px
- `.ln-avchip`: font-family JetBrains Mono; font-size 11px; font-weight 700
- `.ln-avstate[data-s=ACTIVE]`: color #1e7b4f; border 1px solid #1e7b4f
- `.ln-avstate[data-s=SUPERSEDED]`: color #939db0; border 1px solid #c9c5ba
- `.ln-avstate`: font mono 8.5px 700; radius 3px; padding 0 5px; letter-spacing .06em
- `.ln-chips`: display flex; gap 3px; overflow-x auto; padding 2px 0
- `.ln-chip`: flex none; font mono 8.5px; border 1px solid #e3e0d7; radius 3px; padding 1px 5px; background #fff
- `.ln-chip[data-s=ABANDONED]`: color #939db0; border-style dashed
- `.ln-chip[data-s=ACTIVE]`: color #1e7b4f; border-color #1e7b4f
- `.ln-chip[data-s=SUPERSEDED]`: color #7a8699
- `.ln-chip[data-rc=true]::after`: content "●"; color #9a6a1f; margin-left 3px
- `.ln-exercised`: font-size 10.5px; color #4e5a6e; line-height 1.5
- `.ln-pick`: border 1px solid #9a6a1f; background #fdfbf5; border-radius 6px; padding 8px 12px
- `.ln-pick .t`: font mono 9px 700; letter-spacing .08em; color #9a6a1f

### 9.2 Attempt card (storied)
- `.ln-card`: border 1px solid #e3e0d7; border-radius 8px; background #fff; padding 10px 14px
- `.ln-card[data-status=ABANDONED]`: opacity .72
- `.ln-card`: margin-left theo depth × 22px; position relative
- `.ln-card::before`: content ""; position absolute; left -14px; top 50%; width 12px; height 1px; background #c9c5ba (nối cha)
- `.ln-spec`: font mono 10px; color #4e5a6e
- `.ln-diff`: font mono 9px; border 1px solid #9a6a1f; color #9a6a1f; background #fdfbf5; radius 3px; padding 0 5px
- `.ln-diff[data-gates=true]`: border-color #b43a3a; color #b43a3a; background #f7e8e8
- `.ln-outcome`: font-size 10.5px; color #4e5a6e
- `.ln-abandon`: font-size 10px; color #939db0; font-style italic

### 9.3 Probe rows
- `.ln-probe`: font mono 10px; color #4e5a6e; padding 2px 0 2px 22px; border-bottom 1px solid #f4f2ec
- `.ln-probe[aria-expanded=true]`: background #faf9f5
- `.ln-probegroup .h`: font-size 9px; uppercase; letter-spacing .07em; color #939db0; padding 6px 0 2px

## 10. Fixture canonical 52 attempt (cấu trúc — chép vào fixtures)
- Band av_0_9_3 (ACTIVE): att_04 (storied, rc draft, PROMOTION PICK) · att_03 (storied, cha att_02, diff schedule) · att_05 (storied ABANDONED — "decay unstable across seeds") · att_06 (storied DRAFT — holdout-unlock pattern) + 30 probe (nhóm 4 tuần).
- Band av_0_9_2 (SUPERSEDED): att_01 (storied gốc) · att_02 (storied, diff entry_z high 2.2→2.6) + 16 probe; ranh giới av: card att_03 mang chip đỏ "alpha_version: av_0_9_2 → av_0_9_3 · GATES RESET".
- Đếm: 6 storied + 46 probe = 52; counter mặc định "showing 6 of 52 attempts".
- Mỗi probe: {id, tuần, spec ngắn, J, status} — generator seed 11.

## 11. Bảng quyết định hiển thị
| Element | Điều kiện |
|---|---|
| PROMOTION PICK banner | band ACTIVE có promotion_pick ≠ null |
| import new version → | band ACTIVE |
| GATES RESET chip | diff k = alpha_version |
| probe groups | toggle ON hoặc deep-link tới probe |
| filter counter | luôn; format "showing {n} of {m} attempts" |
| virtual list | tổng node hiển thị > 40 |

## 12. Telemetry
- lineage_view {alpha, versions, total}
- lineage_probe_toggle {on}
- lineage_pick_click · lineage_untried_click {route} · lineage_chip_nav {att}

## 13. Reviewer checklist
1. [ ] Promotion pick không suy từ metrics FE (grep sort/compare metric = 0 trong component).
2. [ ] Diff chips render từ mảng server (k/from/to) — không template string tự chế.
3. [ ] GATES RESET là nhánh riêng (data-gates), không lẫn diff thường.
4. [ ] ABANDONED opacity + lý do — không display none.
5. [ ] Counter đúng mọi tổ hợp filter × toggle.
6. [ ] Deep-link ?av= scroll bằng scrollTop (grep scrollIntoView = 0).
7. [ ] Virtual 100-attempt không vỡ expand.
8. [ ] Copy diff §6 = 0; screenshot 2 band + toggle ≤1%.

## 14. Glossary
- storied attempt: attempt đáng kể (có rc, đổi ≥2 key chiến lược, hoặc được đánh dấu) — card đầy đủ.
- probe: thăm dò nhỏ — một dòng, đếm vào multiple-testing.
- version band: khối av_ — ranh giới code; mọi attempt thuộc đúng một band.
- promotion pick: attempt được governance chỉ định là ứng viên promote duy nhất của band.

> End of spec 10 · v1.1 · pair with hi-fi `QuantBT 10 Attempt Lineage.dc.html`.
