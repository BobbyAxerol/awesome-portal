# Stage workbenches — layout proposal đo bằng px (EL-V2-06, §14.5)

**Nguyên tắc:** tái dùng nguyên anatomy Paper đã dựng ở V2-04 (masthead → strip 5 ô → chart → tabs; rail
Next → Blockers → Freshness → Provenance). Không vẽ lại; chỉ *decision panel* (Next của rail) và *guard
treatment* đổi theo stage. Kích thước như `PAPER_LAYOUT_PROPOSAL_2026-08-24.md` (1440×900: main 780,
rail 340, fold 828).

| Stage | Guard | Next (rail) | Chart slot | Tabs |
|---|---|---|---|---|
| Paper VNM (4h) | không | Observation gate + CTA exit (như Paper) | equity honest state; **timeline phiên** (ATO · continuous · break · ATC, marker now) ngay dưới masthead, 28px | như Paper |
| Sandbox (1d) | không | exit requirements + `Submit for review` / `Request Sandbox Exit Review` (Admin) | — (stepper 7 bước thay chart) | Reconciliation (triptych + findings) · Steps · Promotion plans · Timeline |
| Canary (1e) | **1 band đỏ** trên masthead: `⛨ LIVE · CANARY` + double border | promotion decision (hold/reduce/rollback/scale qua Exit Review) + **Protective action** (nặng) | Live vs Paper vs Backtest — honest state (BR-EX-34) | Envelope (limits + compliance + rollback) · Positions & orders · Reconciliation · Guard rule (+ **Request scale**, nhẹ) |
| Live (1f) | **1 band đỏ**: `⛨ LIVE · FULL` | protective ladder halt→reduce→emergency close (nặng) | Contribution 30d — honest state; **MISMATCH banner thay chart** khi broker truth chưa verify | Exposure & orders (suppressed = withheld) · Continuity · Predecessor envelope · Guard rules (+ **Risk-increasing**, nhẹ) |

**Guard budget:** đúng một phần tử `.exec-guard-band` mỗi trang (probe e2e đếm phần tử có nền `--bad` đặc).
Badge stage trong masthead dùng tone chip, không nền đặc.

**Bất đối xứng protective vs risk-increasing:** vị trí khác (rail Next vs cuối tab Guard) + trọng lượng
khác (`data-weight="protective"` đậm, `data-weight="risk"` nhạt) + luật chặn khác (broker STALE / projection
gap chặn scale-up, không chặn protective). Visual case: nhóm fixtures `v2-guard-asymmetry` đặt Canary cạnh Live.

**Ma trận trạng thái phải phủ:** VNM OPEN / CLOSED (timeline marker + badge PAUSED) · Sandbox NONE / CRITICAL
(banner fail-closed + gate BLOCKED) · Canary OK / STALE (scale-up chặn, protective còn) · Live OK / MISMATCH
(KPI suppressed, banner thay chart, tile withheld).

**Reuse report (§11.3):** `ExecutionWorkspace/PageHeader/DecisionStrip/Tabs/ContextRail/ProvenanceDrawer`
(V2-02), `EquityChart` (V2-04), `SourceTile` + `StageGuardBand` (mới, dùng chung 3 màn), `SessionTimeline`
(mới, VNM), `ActionGroup`/`LiveActionGroup` (giữ), `exec-cert-strip` stepper (giữ). Không component clone.
