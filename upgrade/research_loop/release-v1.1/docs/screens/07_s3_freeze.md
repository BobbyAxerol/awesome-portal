# SPEC 07 · S3 Freeze — `QuantBT 07 S3 Freeze.dc.html`

> Deep-dive Stage 3: chứng minh THỨ TỰ (selection đóng trước khi OOS được đọc) và TÍNH TOÀN VẸN (digest chain). Guide plan cho agent code; copy VERBATIM; số = CSS px.
> Luật gốc: (1) hai trục thời gian — wall clock và data time — không bao giờ vẽ chung một trục; (2) digest lệch = BLOCKED, không phải warning; (3) what-if không ghi lên params đã freeze — nó tạo sibling attempt.

---

## 1. Meta

| Key | Value |
|---|---|
| File hi-fi | `QuantBT 07 S3 Freeze.dc.html` |
| Route | `/research/quantbt/runs/{id}/freeze` |
| Vai trò | Ordering verdict (wall-clock vs data-time), digest chain config→params→bundle, frozen θ* table per fold, what-if sandbox (sibling attempt) |
| Persona | auditor (chính) · researcher |
| Shell | Có |
| Inbound | 04 tab freeze · 06 next-stage · 05 θ* digest link · 03 stage rail S3 |
| Outbound | breadcrumb 04 · next-stage `S4 · Execute →` (08) · what-if → 02-style attempt draft (hook) · attempt → 10 |
| Hash | `#fold=` (+pass-through) |
| Tweaks (hi-fi) | drift: clean / drifted · scale 5/32 |
| Console chuẩn | 0 error/warning |

## 2. Layout anatomy

### 2.1 Header
- Breadcrumb `Evidence Flow / R-WFO-118 / Stage 3 · Freeze` + title **S3 · Freeze — ordering & integrity** + subtitle italic: "Selection closed before any out-of-sample bar was read — and every artifact below can prove it, or the run is BLOCKED."
- Phải: fold selector `‹ fold_03 ▾ ›` (chip `shared` khi schedule global — 1 params cho mọi fold; chip `full` mode 5) + next-stage nav.

### 2.2 Ordering verdict (panel chính — 2 trục)
- **Trục A — wall clock (UTC)**: các mốc event: `search_started` → `pool_frozen_at 23:59:12Z` → `selection_committed 23:59:40Z` → `oos_first_read 00:02:11Z` → `replay_completed`. Mỗi mốc chấm + label mono 9.5px.
- **Trục B — data time**: span train (mist) → test (teal) của fold; mốc `last_train_bar` và `first_test_bar`.
- Giữa 2 trục: **verdict card**: `ORDERING PASS` xanh — "pool_frozen_at (23:59:12Z) precedes oos_first_read (00:02:11Z) by 2m59s — selection could not have seen the test window." / FAIL đỏ: câu engine verbatim.
- Chú thích cố định: "two clocks, never one axis — wall-clock proves WHO knew WHEN; data-time proves WHAT was knowable."

### 2.3 Digest chain (3 mắt xích + trạng thái)
- Mắt: `config sha256:88ae02` → `selected params prm_7c1a9e` → `bundle sha256:1af9d3`; mũi tên giữa; mỗi mắt card mono + nguồn artifact.
- Trạng thái chain: `CHAIN INTACT` xanh (mọi digest khớp manifest) hoặc **`BLOCKED — digest drift`** đỏ: mắt lệch viền đỏ + note: "recorded prm_7c1a9e ≠ recomputed prm_49xxxx — the run is BLOCKED from promotion until re-verified; nothing downstream of this screen may be trusted."
- Nút `verify now` (mono nhỏ): gọi verify; spinner inline; kết quả cập nhật chain (demo tweak drift).

### 2.4 Frozen θ* table (per fold)
- Cột: `param 96 · frozen value 90 · range pos (thanh mini + tick) · per-fold Δ vs fold trước 80 · note flex`.
- 6 param; giá trị mono; Δ màu (±); fold đầu Δ "—".
- Header phải: digest fold hiện hành `prm_7c1a9e` + copy button.
- Schedule global: bảng 1 bản + banner "shared params — one selection serves every fold (global schedule)". Mode 5: "full-sample params — single span".

### 2.5 What-if sandbox (card viền dashed vàng)
- 2 slider (entry_z ±0.4, atr_mult ±1.0) + readout J₁ preview delta (từ bảng precomputed server — KHÔNG tính client).
- Câu luật verbatim: "a what-if never writes onto frozen params — commit creates a SIBLING ATTEMPT with its own config_hash, lineage-linked to this one."
- Nút `create sibling attempt →` (hook — mở 02 với draft copy + đổi params; v1 portal: tạo draft; hi-fi: link demo).
- Sau kéo slider: badge `preview only` nhấp nháy nhẹ 1 lần (không loop).

### 2.6 Rules footer
"Ordering is proven by recorded clocks, not by trust. A digest mismatch BLOCKS — it never warns. What-if is a fork, not an edit; frozen artifacts are write-once."

## 3. Data contract

```ts
interface FreezeDetail {
  run_id: string; fold: number; schedule_kind: 'per_fold'|'global'|'full';
  ordering: {
    wall: { k: string; at: string }[];          // 5 mốc
    data: { train: Span; test: Span };
    verdict: 'PASS'|'FAIL'; verdict_note: string; gap_human: string;   // "2m59s"
  };
  chain: {
    links: { name: 'config'|'selected params'|'bundle'; digest: string;
             source: string; state: 'ok'|'drift' }[];
    state: 'INTACT'|'BLOCKED'; note: string | null;
  };
  frozen: { name: string; value: string; pos_pct: number;
            delta_prev: string | null; note: string }[];
  params_digest: string;
  whatif: { sliders: { name: string; min: number; max: number; step: number; base: number }[];
            grid: Record<string, number> };       // key "z|atr" → ΔJ precomputed
}
```
- Endpoint: `GET /runs/{id}/freeze?fold=k` (immutable, ETag); `POST /runs/{id}/freeze/verify` → chain mới.
- Nguồn: selection trace (mốc wall-clock engine ghi) + artifact manifest digests + what-if grid do read-model precompute quanh θ* (lưới thưa 9×9).
- verdict/gap/note là chuỗi server — FE không so thời gian.

## 4. Tính động — state machine

| Từ | Event | Đến | Side effects |
|---|---|---|---|
| fold=k | ‹ › / dropdown | fold=j | refetch FreezeDetail; hash; bảng + ordering đổi |
| chain INTACT | tweak drift (demo) / verify phát hiện lệch | BLOCKED | mắt drift đỏ; note; banner đầu trang đỏ mỏng |
| chain BLOCKED | verify now (đã sửa nguồn) | INTACT | note clear |
| whatif base | kéo slider | preview | ΔJ đọc từ grid key gần nhất; badge preview only |
| preview | create sibling attempt | (hook) | mở draft 02 copy + params đổi; KHÔNG đổi màn này |
| schedule global | đổi fold | fold đổi | bảng params GIỮ NGUYÊN (shared) — chỉ ordering/data-time đổi |

- verify now: disabled khi đang verify; kết quả áp theo response — không optimistic.
- Slider: step theo spec; keyboard Arrow ±step; Home/End min/max.

## 5. Pitfalls — chớ làm sai
1. WRONG: vẽ wall-clock và data-time chung một trục. RIGHT: 2 trục tách — trộn là nói dối phương pháp.
2. WRONG: FE so timestamp để ra PASS. RIGHT: verdict server; FE render + gap_human.
3. WRONG: drift render vàng warning. RIGHT: BLOCKED đỏ + chặn ngôn ngữ "trust" — copy §2.3.
4. WRONG: what-if tính J client bằng công thức. RIGHT: grid precomputed; ngoài lưới → nội suy KHÔNG — snap về node gần nhất + ghi "≈".
5. WRONG: commit what-if ghi đè bảng frozen. RIGHT: fork attempt — bảng này bất biến.
6. WRONG: global schedule mà bảng đổi theo fold. RIGHT: shared banner + params cố định.
7. WRONG: digest rút gọn khác nhau giữa màn (6 hex vs 8 hex). RIGHT: format chung `sha256:` + 6 hex; prm_ + 6 hex — util chung.
8. WRONG: verify optimistic UI. RIGHT: chờ server.
9. WRONG: badge preview nhấp nháy vô hạn. RIGHT: 1 lần 600ms.
10. WRONG: mốc wall-clock format local timezone. RIGHT: UTC Z verbatim — audit đọc log đối chiếu.

## 6. Test matrix
| ID | Precondition | Action | Expected |
|---|---|---|---|
| T01 | clean fixture | load #fold=3 | ORDERING PASS; gap "2m59s"; chain INTACT; bảng fold 3 |
| T02 | drift tweak | load | mắt params đỏ; BLOCKED note verbatim; banner đỏ |
| T03 | BLOCKED | verify (mock fixed) | INTACT trở lại |
| T04 | — | đổi fold ‹ › | refetch; hash; Δ prev đúng |
| T05 | global fixture | đổi fold | bảng giữ; banner shared; ordering đổi |
| T06 | mode 5 fixture | load | chip full; 1 span; không Δ |
| T07 | slider entry_z +0.2 | kéo | ΔJ từ grid; badge preview 1 lần |
| T08 | ngoài node lưới | kéo lẻ | snap node gần nhất + "≈" |
| T09 | create sibling | click | điều hướng draft 02 (mock); màn không đổi state |
| T10 | θ* digest copy | click | clipboard prm_7c1a9e; ✓ |
| T11 | breadcrumb/next | click | 04/08 giữ hash |
| T12 | 32-fold | dropdown nhóm | chọn fold 17 ok |
| T13 | 660px | resize | 2 trục xếp dọc; chain wrap; không tràn |
| T14 | axe | scan | slider có aria-valuetext "{v} (ΔJ {d})"; verdict role=status; 0 serious |
| T15 | ETag revisit | — | không flash |
| T16 | reduced-motion | — | badge không nhấp nháy |

## 7. Copy inventory — VERBATIM
- Subtitle §2.1 · chú thích 2 đồng hồ §2.2 · PASS note mẫu §2.2 · BLOCKED note §2.3 · shared/full banner §2.4 · luật what-if §2.5 · rules footer §2.6.
- Verify button: "verify now" / "verifying…"
- Sibling button: "create sibling attempt →"
- Preview badge: "preview only"

## 8. Per-element CSS ledger
- `.fz-axis`: position relative; height 46px; border-bottom 1px solid #e3e0d7
- `.fz-axis .tick`: position absolute; width 7px; height 7px; border-radius 50%; background #0f4c5c; top 12px
- `.fz-axis .tick[data-k=pool_frozen_at]`: background #9a6a1f; width 9px; height 9px
- `.fz-axis .tick[data-k=oos_first_read]`: background #b43a3a
- `.fz-axis .lbl`: position absolute; top 24px; font mono 9.5px; color #4e5a6e; transform translateX(-50%)
- `.fz-verdict`: border 1.5px solid #1e7b4f; border-radius 8px; background #eef5f0; padding 10px 14px
- `.fz-verdict[data-v=FAIL]`: border-color #b43a3a; background #f7e8e8
- `.fz-verdict .t`: font mono 12px 700; color #1e7b4f — [FAIL] #b43a3a
- `.fz-chain`: display flex; align-items stretch; gap 0; flex-wrap wrap
- `.fz-link`: border 1px solid #e3e0d7; border-radius 8px; background #fff; padding 8px 12px; min-width 170px
- `.fz-link[data-s=drift]`: border-color #b43a3a; background #f7e8e8
- `.fz-link .d`: font mono 11.5px 600
- `.fz-link .src`: font mono 9px; color #939db0
- `.fz-chainstate[data-s=INTACT]`: chip xanh grammar; [BLOCKED]: chip đỏ 1.5px
- `.fz-table row`: mono 10.5px; cột §2.4; border-bottom #f4f2ec
- `.fz-delta[data-sign=pos]`: color #b43a3a; [neg]: #1e7b4f; [zero]: #939db0
- `.fz-whatif`: border 1px dashed #9a6a1f; border-radius 10px; background #fdfbf5; padding 14px 16px
- `.fz-slider`: input range accent-color #9a6a1f; width 100%
- `.fz-badge`: font mono 8.5px 700; color #9a6a1f; border 1px solid #9a6a1f; radius 3px; padding 0 5px
- `@keyframes fz-blink`: 1 lần 600ms opacity .3→1 (animation-iteration-count 1)

## 9. TS architecture
```
<FreezePage>
  const d = useFreezeDetail(runId, cursor.fold);
  <PortalShell…>
    <FreezeHeader foldSel nextHref/>
    {d.chain.state==='BLOCKED' && <BlockedBanner/>}
    <OrderingPanel wall data verdict/>
    <DigestChain links state onVerify/>
    <FrozenTable rows digest sharedBanner/>
    <WhatIfCard sliders grid onFork/>
    <RulesFooter/>
```
- OrderingPanel: 2 trục div; vị trí tick = % theo min/max mốc (server gửi ts — FE chỉ scale toạ độ, không so sánh logic).
- WhatIf: state {z, atr}; lookup grid key `${snap(z)}|${snap(atr)}`; snap về step lưới.
- Verify: mutation RTK; invalidate FreezeDetail.

## 10. Guide plan
1. Types + fixtures (clean, drifted, global, mode5, 32fold).
2. OrderingPanel (scale fn unit: mốc đầu 0%, cuối 100%, không âm/NaN).
3. DigestChain + verify mutation — T02/T03.
4. FrozenTable + Δ util (format chung digest).
5. WhatIf grid snap — T07/T08 + keyboard.
6. Cursor wiring + guards — T04/T05/T11.
7. A11y/motion — T14/T16.
8. DoD: T01–T16 xanh; copy diff 0; screenshot clean/drifted/global ≤1%; digest util dùng chung (grep format tay = 0).

## 11. Phi phạm vi
- Không unlock/đọc OOS ở đây (S4 lo replay; đây chỉ chứng minh thứ tự).
- Không sửa params (fork-only).
- Không lịch sử verify (audit log là hệ governance — v2 link).

## 12. Glossary
- ordering verdict: bằng chứng pool đóng TRƯỚC lần đọc OOS đầu — xương sống của claim causal.
- digest chain: config → params → bundle; một mắt lệch là toàn chuỗi mất giá trị.
- sibling attempt: nhánh mới cùng lineage, config_hash mới — cách duy nhất để "thử params khác".
- shared params: global schedule — một selection phục vụ mọi fold.


## 13. Fixture canonical (chép nguyên)

### 13.1 Ordering (fold 3, clean)
- search_started: 2024-09-30 21:14:02Z
- pool_frozen_at: 2024-09-30 23:59:12Z
- selection_committed: 2024-09-30 23:59:40Z
- oos_first_read: 2024-10-01 00:02:11Z
- replay_completed: 2024-10-01 00:41:57Z
- gap_human: "2m59s" (frozen → first read)
- data: train 2022-01-01 → 2023-06-30 · test 2023-07-01 → 2023-09-30

### 13.2 Chain
- config: sha256:88ae02 · source run_spec.yaml
- selected params: prm_7c1a9e · source selection_trace.json
- bundle: sha256:1af9d3 · source artifact_bundle.manifest
- drifted fixture: params recomputed prm_49b2e0 → state drift, chain BLOCKED

### 13.3 Frozen θ* (fold 3)
- window 46 · pos 54% · Δ vs fold2 +2
- entry_z 1.6 · pos 50% · Δ +0.1
- atr_mult 2.8 · pos 36% · Δ −0.2
- risk_pct 0.75 · pos 29% · Δ 0
- cooldown 6 · pos 25% · Δ 0
- use_trail true · categorical · Δ —
- digest: prm_7c1a9e (fold digests canonical như spec 05 §14)

### 13.4 What-if grid
- lưới 9×9: entry_z 1.2→2.0 step 0.1 × atr_mult 1.8→3.8 step 0.25
- node base (1.6, 2.8) ΔJ = 0.000; ví dụ (1.8, 2.8) ΔJ −0.041; (1.4, 3.05) ΔJ −0.087
- ngoài lưới snap + tiền tố "≈"

## 14. Bảng quyết định hiển thị
| Element | Điều kiện |
|---|---|
| BlockedBanner | chain.state = BLOCKED |
| shared banner | schedule_kind = global |
| full banner | schedule_kind = full |
| Δ prev cột | schedule_kind = per_fold và fold > 1 |
| what-if card | luôn (kể cả BLOCKED — nhưng nút fork disabled + note "resolve the chain first") |
| verify now | luôn; disabled khi verifying |
| chip fold shared/full | theo schedule_kind |

## 15. Integration tests liên màn
1. 06 next-stage (fold 4, pick 517) → 07 fold 4; digest hiển thị = digest fold 4 canonical (prm_c25a1d).
2. 05 click θ* digest fold 3 → 07#fold=3 — bảng đúng fold 3.
3. 07 next-stage → 08 nhận hash fold 4 nguyên vẹn.
4. 07 BLOCKED (drift) → 04 hub claim tab: manifest params row DEGRADED/MISSING tương ứng — read-model đồng bộ (test contract 2 endpoint cùng fixture).
5. create sibling → 02 draft mở với params đổi + banner nguồn "forked from R-WFO-118 att_04 · what-if" (spec 02 nhận `?fork_from=`; v1 hook).

## 16. Telemetry
- freeze_view {run_id, fold, chain_state}
- freeze_verify_click {result}
- freeze_whatif_drag {param}
- freeze_fork_click
- freeze_fold_change {via}

## 17. Reviewer checklist
1. [ ] Không phép so sánh timestamp trong FE (grep Date.parse ngoài scale fn).
2. [ ] Digest format util chung (grep 'sha256:'.slice tay = 0).
3. [ ] BLOCKED chặn fork; copy đúng.
4. [ ] Grid snap đúng step; "≈" khi snap.
5. [ ] UTC Z hiển thị verbatim; không toLocale.
6. [ ] Hash pass-through 3 hướng (04/06/08).
7. [ ] Copy diff §7 = 0.
8. [ ] Screenshot clean/drifted/global/mode5 ≤1%.
9. [ ] Verify không optimistic (test race: response chậm 2s).
10. [ ] Reduced-motion: fz-blink tắt.

## 18. Câu hỏi mở
- verify endpoint có cần quyền auditor không? (đề xuất: mọi người verify được — đọc-only, ghi audit log).
- what-if fork mở 02 full wizard hay modal rút gọn? v1: mở 02 với draft prefill (ít code hơn, một luồng khai báo duy nhất).

> End of spec 07 · v1.1 · pair with hi-fi `QuantBT 07 S3 Freeze.dc.html`.
