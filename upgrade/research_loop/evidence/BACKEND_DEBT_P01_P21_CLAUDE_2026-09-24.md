# Research Loop — sổ nợ P01–P21 sau khi Claude nhận trọn phần ≤P21

Ngày 2026-09-24 · Claude · nhánh `docs/research-loop-plan` @ `cce22dc4`.

Bobby giao lại cho Claude **toàn bộ frontend và backend từ P01 tới P21**, kể cả
mọi request backend cũ/mới đang mở mà trước đây gửi Codex. Codex chuyển sang
**P22 trở đi**. File này là đợt rà trước khi nhận việc: đối chiếu từng mục trong
Unified §13, các file `CODEX_REQUESTS_*`, audit, receipt, `debt-register.json`
với **code thật**. Mỗi dòng có một trong ba kết luận: `OPEN`, `PARTIAL`, hoặc
`DOC_STALE` (code đã xong, tài liệu chưa ghi nhận).

Ký hiệu đường dẫn: `CA` = `apps/control-api/src/research/`, `PB` =
`apps/portal/backend/src/portal_api/`, `GEN` = `packages/contracts/generated/`,
`FE` = `apps/portal/frontend/src/research/`, `TV` =
`primus-origin/feat/thanhvuong/research-p17-p21`.

## 0. Ranh giới với Codex

| Mục | Đề xuất |
|---|---|
| Claude | P01–P21, FE + BE, gồm RF-03/RF-05 phần Codex, Astra A01–A12, RS-03 exit |
| Codex | P22 (publication saga), P23 (qualification), P24 (acceptance) |
| Điểm chạm P21↔P22 | P21 chỉ giữ local seal: `SEALED_LOCAL`, `actions.publish.enabled=false`, `P22_PUBLICATION_NOT_COMMISSIONED` (`EV/P21/README.md:50-66`). Codex **chỉ** làm backend/contract P22 sau khi Claude đóng băng contract P21; màn S11 (cả phần publish) do Claude giữ |
| P23/P24 | Chạm mọi màn nhưng phụ thuộc P11–P22 đã đóng, nên thực tế chạy sau; mỗi lần Codex cần sửa file ≤P21 thì gửi request, không sửa thẳng |
| Việc Codex đang dở | Adapter signal-notional RF-03 đã commit trong `5bc77b9b`; chỉ còn 2 đoạn doc chưa commit (Unified ~4337, RF-03 README §85–91). Claude nhận lại **sau khi Codex commit** hai đoạn đó |

## 1. Sửa tài liệu cũ (DOC_STALE) — làm ngay, không đổi code

| id | Code thật | Việc |
|---|---|---|
| CG-P11-04 budget facts | `PB/services/research_run_producer.py:105-127,299,305` (`5bc77b9b`) | Đánh DELIVERED `5bc77b9b` |
| CG-P11-06 cancel-before-source | `CA/progress.repository.ts` trả NOT_REQUIRED (`5bc77b9b`) | PARTIAL — còn ngữ nghĩa LOST_LEASE/`retry_not_before` |
| P17 A05/A06/A08 | đã sửa ở RS-01 (`EV/P17/debt-register.json` rs01_repairs) | Board P17 còn ghi AUDIT_REOPENED cho các mục này |
| P13/P14/P15/P16/RS-02/RS-03 `debt-register.json` | ghi `in_scope_backend_debt: []` | Trái với A09–A12 còn mở; ghi lại cho đúng (A12) |
| P02/P04/P05 debt registers | P02-DG-02, P04-DG-03, P05-DG-02/03 vẫn NOT_STARTED/PENDING | Đã giao ở P04/P09/P10/P11; cập nhật |
| Board P13–P15 | "AUDIT_REOPENED / 2026-09-22" | Ghi phần RS-01/RF-05 đã đóng, phần còn mở trỏ về file này |
| Runbook P21 | `deploy/runbooks/research-p21-release-candidate-dark-and-rollback.md:23` đòi `…_ATTEMPT_LINEAGE` — flag không tồn tại | Sửa thành `CONTROL_API_FEATURE_RESEARCH_LINEAGE` (`config.ts:500`) |
| §13.7 dòng 5455 | "Hiện tại: chỉ plan/rules…" | Lỗi thời |
| DQ-13 | Đã chốt theo khuyến nghị (AUDIT_P11_P15 §7): backend gắn snapshot vào event | CG-P11-08 không còn bị chặn |

## 2. Backend còn mở — theo cụm

### 2.1 Xương sống: chạy thật một WFO đầy đủ (mở khoá phần lớn các mục khác)

| id | Thiếu gì | Bằng chứng | KL | Cỡ |
|---|---|---|---|---|
| **CG-P10-02** | Admission chỉ nhận profile P04 cố định: từ chối scratch, DRAFT, bản import, route ≠ `signal_notional`+`three_window_decay`, mode ≠ `mode_1_decay`+`global`, override, trials ≠ 1, seed (`CA/run-admission.service.ts:110-176`). DTO riêng cứng `p04.delta-rsi.v1` (`PB/services/research_run_producer.py:471`); child chỉ nhận `P04_DELTA_SMOKE` (`PB/workers/research_child.py:475,498`; `research_supervisor.py:78,273,326`). `AdvancedWalkForwardRunner` signal-notional có sẵn (`advanced_walkforward_runner.py:64,125-155`) nhưng P10/P06 chưa gọi | OPEN | L |
| **CG-P05-01** | Không có đường ingest RS-02 (observations/folds/trials/candidates/selection): `current-source.repository.ts:217,279` append/seal không có caller; `assertSeal` chỉ nhận `rs02.delta-wfo-global.v1` (`:570`); read vẫn PENDING_RETENTION (`current-source.service.ts:486`) | PARTIAL (chỉ seal 1 row receipt, `d820d5ce`) | L |
| CG-P06-03 | Trần child 45 CPU-s / 90 s (`research_supervisor.py:41,45`) — không đủ cho WFO nhiều fold | OPEN (đã duyệt, chờ đo) | S–M |
| CG-P06-02 / CG-P10-04 | Child chỉ gửi heartbeat; không có `fold_segment_observed`, `eta_s`, rate; `tqdm_line`/`overall_pct` là literal (`research_run_producer.py:303,313-314`; `research_progress.py:655`); `run_completed` không có claim/cursor (`durable_worker.py:410-422`) | PARTIAL (budget_tick xong) | M |
| CG-RF02-01 | Child preview chạy `seccomp/apparmor=unconfined` (`deploy/research-preview/compose.research-preview.yaml:55-56`) — **chặn** thực thi source import | OPEN | M |
| CG-RF02-02 | Test image NATS cho `5b2cf660` chưa chạy | OPEN (test) | S |
| Profile literal | Lane NOT_APPLICABLE/provenance chỉ pin profile cũ (`CA/current-source.contract.ts:68-69,335`; `current-source.service.ts:538`) | OPEN | S |
| Split-read slot | Read current-source không seal vẫn chiếm slot split 2 active/8 queued → có thể 503 (`current-source.service.ts:220,500-509`; `current-source.repository.ts:394` không trả `adapter_contract_digest`) | OPEN | S |

Thứ tự bắt buộc trong cụm: signal-notional DRAFT/ACTIVE qua P10 → child P06 chạy
runner (caps đo lại) → ingest P05 RS-02 → current-source read SEALED. Source import
(bytes từ `research.import_sources`) đi sau CG-RF02-01.

### 2.2 P11 tiến độ (màn 03)

| id | Thiếu gì | Bằng chứng | KL | Cỡ |
|---|---|---|---|---|
| CG-P11-03 | Snapshot thiếu identity run, pct/best J/params digest theo fold, số fold khai báo, `claim.cursor` có cấu trúc, artifact `DENIED`, 403 trên GET | `CA/progress.contract.ts:600-660`; `research-progress.openapi.json:16-19` | OPEN | M |
| CG-P11-05 | Preview chưa bật `FEATURE_RESEARCH_RETAINED_ARTIFACTS` | `scripts/research-preview/preview.sh:72-81` | OPEN | S |
| CG-P11-07 | `retry_reason` trỏ route không tồn tại; không có read requested-spec cho clone `?from=` | `CA/progress.service.ts:56,298`; `run-create.service.ts:61` | OPEN | M |
| CG-P11-08 | SSE gửi `snapshot:null` mỗi event | `CA/progress.controller.ts:176` | OPEN (DQ-13 đã chốt) | M |
| CG-P11-09 | `evidence_digest`/`split_digest` không khai báo; usage chưa đo lại báo 0 | `research-progress.openapi.json:154`; `durable_worker.py:763-764` | OPEN | S |

### 2.3 P13–P15 (Astra A02/A03/A09/A11/A12)

| id | Thiếu gì | Bằng chứng | KL | Cỡ |
|---|---|---|---|---|
| CG-P13-05 | Chuỗi evidence bị cap 32/16/32/12 + 24 KiB; A02 đòi độ phân giải đầy đủ giữ ở P05 | `PB/workers/research_child.py:48-52` | OPEN | M |
| CG-P13-07 | Claim strip: validation/chronological claim, `oos_used_for_selection`, execution contract, runtime authority | không có trong `CA/evidence.contract.ts` | OPEN (A11) | M |
| CG-P13-08 | Verdict theo fold (S_OOS, decay, trades, maxDD, contrib, worst) | chỉ có cờ availability (`evidence.service.ts:203,572`) | OPEN (A09) | L |
| CG-P14-02 | Fold RS-02 thiếu warmup/label horizon/purge/embargo/inner folds | `CA/current-source.contract.ts:188-195` | OPEN (A03/A09) | M |
| CG-P15-03 | Trial→fold/stage, `Trial.state` typed, metric/constraint/feasible theo trial, raw-best vs selected vs centroid | `current-source.contract.ts:213-237` | OPEN (A09) | L |
| CG-P15-04 | Diagnostics cứng NOT_PUBLISHED, không có capability probe | `current-source.service.ts:364-366` | OPEN (A09) | M |
| A12 | Map 68 gate ID P13–P17 + 15 DR/BR/GX vào test/quyết định; hiện 0 mapping trong RS-03 | `EV/RS-03/` | OPEN | M |

### 2.4 P16–P17

| id | Thiếu gì | Bằng chứng | KL | Cỡ |
|---|---|---|---|---|
| A10a | Verify byte artifact kỳ vọng + receipt bền | `CA/freeze.service.ts:378` cứng `NOT_ATTESTED` | OPEN | L |
| A10b | Tra binding tham số lịch sử theo adapter digest của run | `freeze.service.ts:197` băm tham số hiện hành | OPEN | M |
| A10c | What-if reuse, lưới 81 ô, job chẩn đoán tường minh | `freeze.contract.ts:130-148` | OPEN — tài liệu mâu thuẫn (U:5040 nói "source blocked", U:3629 và Astra nói là việc phải làm) → cần Bobby chốt | L |
| A09/P17-B | Orders/fills/positions/candles/checkpoints theo route | `CA/replay.service.ts:208-229` toàn `P04_SOURCE_DID_NOT_PUBLISH_*` | OPEN, một phần là source gap thật | L |
| A12 P17 | 24 vs 25 test, T01–T14 chưa map | `EV/P17/test-results.json` | OPEN | M |

### 2.5 P02/P04/P07/P08 (wizard màn 02, Atlas màn 12, import màn 14)

| id | Thiếu gì | Bằng chứng | KL | Cỡ |
|---|---|---|---|---|
| CG-P02-02 | Requested-spec: inner folds, purge/embargo/label horizon, rolling train width | không có trong `CA/preflight.contract.ts`, `run-create.contract.ts` | OPEN | M |
| CG-P08-02 | Rolling window mode | `GEN/research-preflight.d.ts:139` `window_mode: "expanding"` | OPEN | M |
| CG-P08-03 | Danh sách gate preflight, reason typed, `field_path` | chỉ `may_create_run` (`research-preflight.d.ts:226`) | OPEN | M |
| CG-P08-04 | Catalog dataset nghiên cứu | không có route | OPEN | M |
| CG-P08-05 | Trần sweep/evaluation | seed + trần trial có; trần sweep chưa | PARTIAL | S |
| CG-P08-06 | Gap scan, holdout seal (DR-01), trần holdout | `research-split.d.ts:188` `gap_scan: AbsentFact` | OPEN | M |
| CG-P04-04 | `oos_use` 4 trạng thái + n/a | `research-foundation.d.ts:177` chỉ USED/NOT_USED | OPEN | S |
| CG-P04-06 | Route: mô tả, method, status, backend resolve, ma trận arbitrage, option list `route_params` | `research-foundation.d.ts:144-154` | OPEN | M |
| CG-P04-07 | Claim qualifier/locator, nghĩa từng term objective, trọng số mode 2–5 | không có trong GEN | OPEN | M |
| CG-P07-03 | Mirror 14 field (hiện 8 literal) | `research_alpha_analyzer.py:415,429` | PARTIAL (giới hạn DQ-05) | M |
| CG-P07-04 | Gate RUNNING + thời gian analyser từng gate | `ms` chỉ đo check in-memory | PARTIAL | S |

### 2.6 P17–P21 backend request của Thanhvuong (trên TV, chưa có ở base)

CG-P17-01…03, CG-P18-01…11, CG-P19-01…14 (trừ 11), CG-P20-01…11 — ở
`EV/P1x/thanhvuong-backend-requests.md` trên TV. Backend P18–P21 có sẵn
(migration 052–055) nhưng **tắt** (feature-dark). Chưa phân loại từng mục; làm khi
xử lý nhánh TV (§3).

## 3. Frontend còn mở

| Màn | Phase | Base | TV | Việc |
|---|---|---|---|---|
| S07 Freeze | P16 | có (`cce22dc4`) | TV viết lại `FreezeDetail.tsx` +324/−95 → **đụng** | Real-API receipt khi bật cờ |
| S08 Replay | P17 | không | có (104/104 với API giả) | merge/port |
| S09 Report | P18 | không | có (128/128 với API giả) | merge/port + print receipt |
| S10 Lineage | P19 | không | có (7 debt) | merge/port |
| S13 Compare | P20 | không | có (3+21 debt) | merge/port |
| S11 RC composer | P21 | không | **không** | Làm mới toàn bộ |
| 00/02/03/12/14 | RF-04 | xong phần không phụ thuộc | — | Nối theo từng CG ở §2.1/2.2/2.5 khi giao |

TV: `a5455848`, hơn base 44 commit, kém base 91 commit, +20318/−117, chưa có PR.
Nhánh này đụng `FreezeDetail.tsx`, `EvidenceFlow.tsx`, `RunLibrary.tsx`,
`QuantBTModule.tsx` và board Unified. Gate P20-FE-DG-01 của TV đang chờ Bobby
quyết về việc merge này.

## 4. Hạ tầng và gate

| Mục | Bằng chứng | Việc |
|---|---|---|
| Preview tắt REPLAY/REPORTS/LINEAGE/COMPARE/RC/RETAINED_ARTIFACTS | `preview.sh:72-81` | Bật dần theo phase để lấy receipt real-API |
| Migrations 056/057/060/061 chưa qua lane real-API (RF-02 receipt ở …055) | `EV/RF-02/README.md:25` | Chạy lại lane trên stack mới |
| Lỗ số migration 048/058/059, không ghi lý do | `apps/control-api/migrations/` | Ghi chú; số mới của Claude tiếp tục từ 062 (dải 060–069), Codex ≥070 |
| `verify-generated.sh` bỏ sót 4 spec (attempt-lineage, compare, release-candidate, report) | `packages/contracts/tooling/verify-generated.sh` | Thêm vào |
| Không có lane PostgreSQL cho P04, P18–P21 | `scripts/research-loop-v11/` | Thêm lane cho P18–P21 trước khi đóng |
| `verify-workspace.sh` không chạy migration/PG lane research; danh sách migration dừng trước 037 | `scripts/verify-workspace.sh:240-251,1771-1773` | Đề xuất bổ sung (hook dùng chung → hỏi Bobby) |
| Registry: New Run trỏ `/research/quantbt/new` (legacy `ConfigWorkspace`), deps còn `quantbt_engine_1_0_8` | `apps/portal/registry/registry.json:1206,1227-1229`; `links.v1.json:63` | Trỏ về `runs/new`; chạy validator portal-api |
| Spec real-API có thể lọt vào `npm run e2e` mặc định | `playwright.config.ts:81` không ignore `_preview-research-real-api.spec.ts` | Kiểm lại testDir; thêm ignore nếu lọt |
| Receipt real-API duy nhất là RF-02 16/16; P13–P16 chỉ có fixture receipt; RF-04 18/18 dùng BFF giả | §13.3.1 | Mỗi phase ≤P21 cần `REAL_API_E2E_RECEIPT` riêng |

## 5. Thứ tự làm đề xuất

| Đợt | Nội dung | Vì sao đứng đây |
|---|---|---|
| W0 | §1 sửa tài liệu cũ + hạ tầng S (runbook flag, verify-generated, registry link, playwright ignore, split-read slot, profile literal, CG-P11-09) | Rẻ, bỏ các ô sai đang nói dối trên board |
| W1 | Xương sống §2.1: CG-P10-02 (signal-notional qua P10→P06) → CG-P06-03 → CG-P05-01 ingest → bật RETAINED_ARTIFACTS | Mở khoá CG-P11-03, P13-05/08, P14-02, P15-03/04 — hơn một nửa danh sách |
| W2 | P11: CG-P11-03/-07/-08, CG-P06-02/P10-04 → nối màn 03 | Phụ thuộc W1 |
| W3 | P13–P15: CG-P13-05/07/08, CG-P14-02, CG-P15-03/04 → nối 04/05/06; A12 mapping; RS-03 exit | Phụ thuộc W1 |
| W4 | P02/P04/P08/P07: wizard, Atlas, import → nối 02/12/14 | Độc lập với W1–W3 nên có thể xen kẽ |
| W5 | P16–P17: A10a/b, A09 replay (phần source có) | Sau W1 vì cần artifact bytes đã giữ |
| W6 | P17–P21 frontend: xử lý TV theo quyết định Bobby → S08/S09/S10/S13; làm S11 mới; request CG-P17…P20 | Sau quyết định Bobby; cần bật cờ trên preview |
| W7 | Receipt real-API từng phase trên preview, PG lane P18–P21, đóng board | Điều kiện đóng mọi phase |
| — | CG-RF02-01 (seccomp hẹp) → thực thi source import | Việc bảo mật; làm song song W2–W3, trước khi mở import |

## 6. Quyết định của Bobby — 2026-09-24

| # | Quyết định | Hệ quả |
|---|---|---|
| D1 | Nhánh Thanhvuong do **Codex merge** vào `docs/research-loop-plan` (worktree tích hợp riêng, giữ nguyên 44 commit, không rebase/force-push; xung đột ở `QuantBTModule.tsx`, `EvidenceFlow.tsx`, `FreezeDetail.tsx`, `RunLibrary.tsx`) | Claude **không sửa 4 file đó** cho tới khi merge vào base; sau đó Claude nhận S08/S09/S10/S13 làm tiếp, làm S11 mới. Yêu cầu Bobby: không mất code, docs, evidence nào |
| D2 | **A10c phải làm** — luôn cố gắng trả nợ, so với HiFi và sáng tạo | A10c chuyển từ "SOURCE_CAPABILITY_BLOCKED" (U:5040) sang việc thật (§7) |
| D3 | Claude làm **tạm đến P21** | P22+ của Codex |
| D4 | Hook/tooling dùng chung được sửa khi cần cho sản phẩm; không hỏi việc vặt | Sửa `verify-workspace.sh`/`verify-generated.sh` khi cần, ghi lý do trong commit |
| D5 | Việc cần duyệt phải kèm giải thích, không hỏi trống | Áp dụng từ nay |

## 7. A10c là gì và cách làm

**Là gì.** Màn 07 (Freeze) trong HiFi có một thẻ **what-if sandbox** (spec
`release-v1.1/docs/screens/07_s3_freeze.md` §2.5, §3, §4): hai slider quanh θ*
đã freeze (`entry_z ±0.4`, `atr_mult ±1.0`), kéo slider thì hiện **ΔJ₁ preview**
đọc từ một **lưới 9×9 = 81 ô do server tính sẵn** quanh θ* (FE không tự tính), và
nút **"create sibling attempt →"** mở màn 02 với bản nháp copy tham số mới. Luật
gốc: what-if **không bao giờ ghi lên tham số đã freeze** — nó tạo một attempt
anh em có `config_hash` mới, nối lineage về run này (P19).

**Vì sao đang nợ.** Astra A10 (`P13_P17_ASTRA_AUDIT_AND_REMEDIATION_PLAN.md:266`)
chỉ ra P16 chưa có (a) verify byte artifact, (b) binding tham số lịch sử, (c)
what-if. Plan §P16 (U:5040) xếp (c) là "SOURCE_CAPABILITY_BLOCKED": source P04 cố
định không publish evaluation identity/grid/objective, nên không có gì để đọc.
Hiện `freeze.contract.ts:130-148` trả `NOT_APPLICABLE`, `may_submit=false`.

**Cách làm (sau W1, vì cần WFO thật đã retain):**

1. **Nguồn ô lưới = evaluation đã có.** Khi WFO signal-notional chạy qua P10→P06,
   Optuna đã đánh giá nhiều điểm; P05 retain trial ledger (CG-P15-03). Ô nào
   trùng đúng một evaluation đã có (khoá = params + dataset + objective + seed +
   engine) thì đọc ΔJ₁ từ đó. Ô chưa có → **typed missing**, không nội suy.
2. **Job chẩn đoán tường minh.** Nút "evaluate grid" (không phải lúc mở màn,
   không phải lúc kéo slider) tạo một Research job có admission/cancel/audit,
   dedup theo khoá trên, trần 81 evaluation; tiến độ đi qua P11 như mọi run.
   Kết quả seal vào P05 thành bảng `WHATIF_GRID` bất biến.
3. **Read.** `GET …/freeze?fold=k` thêm `whatif: { sliders, grid, coverage, job }`
   — `coverage` ghi "37 / 81 cells evaluated" để không ô trống nào giả là 0.
4. **Sibling attempt.** "create sibling attempt →" gọi read requested-spec cho
   clone (chung với CG-P11-07 `?from=`), mở màn 02 với draft đã đổi tham số; P19
   lineage ghi quan hệ `SIBLING_OF`. Không chạm run gốc.
5. **Run P04 cố định / không có search:** giữ card theo HiFi, slider disabled kèm
   lý do "this run froze a fixed profile — no evaluated neighbourhood exists"
   (Astra A11: giữ bố cục, không dựng số giả).

Test: đúng 81 ô unique, không job nào chạy khi mount/kéo slider, ô thiếu không
thành 0, passport freeze không đổi sau job, run fixed trả disabled có lý do.

## 8. Registry New Run — ghi chú rủi ro

`registry.json:1206` trỏ New Run về `/research/quantbt/new` (màn cũ). Registry
dùng chung với production, nơi `FEATURE_RESEARCH_RUN_PRODUCER` đang tắt; trỏ sang
`runs/new` lúc này sẽ đưa người dùng production vào màn 02 chưa gửi được run.
Đổi link **cùng lúc** bật RUN_PRODUCER cho môi trường đó (W7), kèm chạy
`test_portal_registry_contract`.
