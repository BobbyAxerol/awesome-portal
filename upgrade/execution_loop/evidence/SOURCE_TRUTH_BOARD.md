# Source Truth Board — Execution V2 (sống; Rules §9.9, §10.12)

Khởi tạo: Claude, 2026-10-18 @ `claude/fe-parity`. Codex điền **cột nguồn** (Edge, TS/PM/DL locator `file@SHA:dòng`, trạng thái mount); Claude điền **cột FE** và **đọc mẫu**. Chưa phải bằng chứng runtime: trạng thái `SOURCE_DARK` nghĩa là contract + code đã vào repo nhưng nguồn thật chưa mount/qualified. Cập nhật mỗi round (Rules §10.1).

Trạng thái: `EXISTS_MOUNTED` (đọc thật có receipt) · `SOURCE_DARK` (contract + code, chưa nguồn thật) · `SYNTHETIC_ONLY` · `MISSING` (chưa có contract/nguồn) · `UNKNOWN`.

Latest four-source cut **2026-10-18T22:17–22:18UTC**:
[exact source/WIP pins and scoped successor](ELP2-10/source-truth-2026-10-18.md#19-fresh-four-source-follow-through-2026-10-18t22172218utc).
Edgeea620d9b, PM908169aa, TSf2229d7a and DLd74f9fc4. PM now has eight finite32
mounted cases PASS across four separate runs; this does not qualify runtime43,
current Core WIP, real provider authority or SSE. Edge's additive commissioning
preparation is owner-reported PREPARED/UNKNOWN, not accepted serving. No current
Portal mount/consumer acceptance follows; twelve FE columns and all historical
source cuts below are preserved, including the earlier unqualified PM result.
Đọc mẫu: `NOT_DONE` · `MATCH@pin` · `MISMATCH@pin (ghi lệch)`.

**Nguồn addendum Codex, 2026-10-18 — SOURCE_ONLY / NOT_RUN:** cập nhật cột nguồn/trạng thái dưới đây từ [source truth §1–§7](ELP2-10/source-truth-2026-10-18.md), không thay consumer/sample acceptance của Claude. Snapshot đầu chốt metadata HK ở **14:35:09Z**; source-publication follow-up kết thúc **15:11:38Z**, ghi riêng tại §7 và phần cuối bảng này. Không inspect runtime/provider/applied DB. `SOURCE_DARK` trong bảng không biến current mount `UNKNOWN` thành một lần quan sát “đã tắt”; cũng không phủ nhận receipt retained thật ở pin cũ. Main quản lý trạng thái commit/gate hiện hành, không lấy private audit làm commit hoặc runtime receipt.

Pins dùng cho locator ngắn ở **snapshot lịch sử14:35**: **P** = Portal `/home/bobby/portal-research`, HEAD audit `ff83f1766b513c18d3fb0102cfc5c6889ffb6343` + Main-owned working bytes (byte hashes ở source truth §5); **TS** = HK `trading-system-next-upgrade@bc71311362828382c88daa6de8f1ff45287d4285`; **PM** = HK `trading-system-pm-v1_1@e4dbc5209f19ca97f22cc7c316eb18e9dd3238e2`; **E** = HK `portal-execution-edge-upgrade-v1_2@20a1d27fa4d03ef7162a7980fda3fe3602995a8b` + owner dirty/untracked hashes; **DL** = HK `data-layer-p184-closure@ff5ec7a48ef3531696d4621e97d1c44484660854` ở metadata read đó. P source paths dưới đây bắt đầu từ `apps/control-api/src/`; E Rust paths bắt đầu từ `services/portal-execution-edge-rs/`. Locator thuộc working bytes không được coi mặc nhiên là nội dung HEAD.

**Fresh source follow-up15:11:38Z:** E HEAD`8b7eb0c1b5a1a4f4b717cd96799df658e1981a42` (guarded publication commit`d0aed38b` + fixture correction`8b7eb0c1`, owner untracked paths còn giữ); PM HEAD`91ca9dfaf36a5c4ccedfa78209d38deafff29c72` + owner tracked/untracked WIP. Catalogue E và command/registration/recall/native PM bytes được kiểm không đổi; metadata discovery/index mới và implementation WIP tách ở addendum dưới. TS unchanged/DL`54caaa0c47de4c77c3d4239956cec852f3d0f238` là **Main-reported15:05:08Z**, không fresh source read bởi delegate này. Không thay embedded original qualification pins bằng các HEAD mới. [Exact source/diff/byte pins §7](ELP2-10/source-truth-2026-10-18.md).

| # | Family / đọc | Portal route + schema | Nguồn HK / Edge (Codex điền) | Trạng thái nguồn | FE consumer (Claude) | Fixture / reader | Ô "Not published" đang mở | Đọc mẫu | Request |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Alpha fleet (danh tính) | `GET /alphas` · `execution.alpha-fleet-list.v2` | P `manager-lists/manager-lists.controller.ts:21–34`, `scoped-manager.reader.ts:37–118,343–389` → exact `/api/v1/execution/alphas`; TS `services/portal_execution_owner/manager_facade.py@bc713113:233–397,703–779,860–1007`; E `contracts/execution-catalogue-v1/registry.json@20a1d27f:411–489`, `crates/manager-projection/src/lib.rs:283–328,421–489`. [Pins/gaps §2.1](ELP2-10/source-truth-2026-10-18.md). | SOURCE_DARK V2; **current mount UNKNOWN**. Identity contract/projection exists; financial normalization MISSING separately at row10. Historical retained evidence is not current V2 mounting. | S1a `v2/screens/fleet` | `execution-alpha-fleet-list.v2.valid.json` · `readAlphaFleet` | readiness FE-027/028 · Compare FE-033 · Archived FE-034 · Group FE-012 · Map FE-035 · Window FE-025 | NOT_DONE | FE-012/025/027/028/033/034/035 |
| 2 | Operations queue V2 | `GET /operations` · `portal.execution.operational-queue.v2` | **Portal Core**, not missing HK API: P `governance/governance.controller.ts:116–132`, `operations/operational-read.service.ts:26–44,62–87`, `.repository.ts:22–51`; exact `/api/v1/execution/operations`, immutable `execution_operation_queue_v2`. E/PM/DL NOT_APPLICABLE to finite Core queue facts; external outcome/health separate. [§2.2](ELP2-10/source-truth-2026-10-18.md). | SOURCE_DARK V2 mount; **current mount UNKNOWN**. Core producer/local PG-HTTP evidence exists. Served `source_integration_state=UNAVAILABLE`, side effect false, source clock null remain honest; FE-042/043 B1 not credited here. | S1c `v2/screens/operations` | `execution-operational-current.synthetic.valid.json` (.queue) · `v2/readers/operationalQueue.ts` | Mine FE-030 · Intent FE-020 · Display/amounts FE-032 · Audit/source health FE-021 · Exceptions FE-031 · liên kết incident FE-042 · status_counts FE-043 | NOT_DONE | FE-020/021/030/031/032/042/043 |
| 3 | Incident root | `GET /operations/incidents/{id}` · `portal.execution.incident-current-root.v2` | **Portal Core `execution_incidents`**: P `operations/operational-read.service.ts:111–130`, `.repository.ts:54–77`; exact `/api/v1/execution/operations/incidents/{id}`. Historical child attribution is NOT_PUBLISHED / `ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED`; no invented PM incident export. [§2.3](ELP2-10/source-truth-2026-10-18.md). | SOURCE_DARK V2; **current mount UNKNOWN**. Finite current root/local PG-HTTP proof exists, not only synthetic; historical evidence/timeline/actor facts remain absent independently. | S1d drawer | `.incident` cùng fixture | evidence/ops/gates/timeline FE-031 · assignee FE-030 · hành động ghi FE-015 | NOT_DONE | FE-015/030/031 |
| 4 | Governance inbox + R1/R2/Live/Exit | `GET /governance/approvals*` | **Portal Core records**: P `governance/governance.controller.ts:252–317,334–367`, `positive-parent.repository.ts:126–146,334–464`, `.service.ts:43–76`, `live-parent.service.ts:25–59`. Routes under `/api/v1/execution`; inbox dispatch still `governance.service.ts:231–275,364–383`. E/PM needed only for independently claimed external panels/effects. [§2.4](ELP2-10/source-truth-2026-10-18.md). | SOURCE_DARK V2; **current mount UNKNOWN**. Finite positive parents have real local PG proof; fixture-only consumer remains SYNTHETIC_ONLY. Detail delivery does not establish inbox readiness, external execution or R2/Live commissioning. | S1b `v2/screens/cockpit` | `execution-governance.approval-inbox.valid.json`, `execution-positive-parent.synthetic.valid.json` (chưa đọc) | criteria FE-028 · chart FE-029 · ladder/call/receipt FE-030 · làn Archive/Reactivation/Capital FE-034 | NOT_DONE | FE-028/029/030/034 |
| 5 | Waivers | `GET /governance/waivers` | Actual **Portal Conditions register**, schema `governance.conditions-register.v1`: P `governance/governance.controller.ts:284–297`, `.service.ts:298–319`, `contracts.ts:487–506`; Core `governance_conditions_register`, authority PORTAL_CONTROL. E/PM/DL NOT_APPLICABLE; not a TS economic waiver producer. [§2.5](ELP2-10/source-truth-2026-10-18.md). | SOURCE_DARK scoped parent availability; **current mount UNKNOWN**. Legacy finite Core contract exists; `assertParentReadCommissioned` still applies. Do not replace denied/uncommissioned with empty or ADMIN read-all. | S1b làn Waiver | _(chưa gắn)_ | — | NOT_DONE | — |
| 6 | Access effective / self | `GET /api/admin/profile-access/v2/effective` · `AccessEffective` | P `execution-v2/access.controller.ts:15–46`, `access.service.ts:51–91,279–297`, `access-trust.ts:14–43`; `portal.access-effective.v1`. Core session/policy/grants plus separately qualified TS mapping/membership; PM `services/portfolio_management/native_business_read_provider.py@e4dbc520:24–127`, `native_fence.py:240–281` are implementation, not Portal installed grants. [§2.6](ELP2-10/source-truth-2026-10-18.md). | SOURCE_DARK / POLICY_PENDING; **current policy/provider mount UNKNOWN**. FE-037/038 C3 eligibility/self projection and FE-026 researcher matrix are separate, not automatically granted by field catalogue. | S1e (chưa làm) | `execution-access` fixture · reader S1e `v2/readers/accessEffective.ts` (đang làm) | "granted by", preset, reason_class FE-015 · researcher FE-026 · self entry FE-038 · nav capability FE-037 | NOT_DONE | FE-015/026/037/038 |
| 7 | Retained review context | `GET /api/v1/execution/retained-review` | P `execution/retained-review.controller.ts:23–84,87–135`; imported retained snapshot + current Core permissions, no live Edge refresh/stream/mutation/eligibility. **Historical real** UDB-03 API222/222, browser68/68; six-cell retained consumer image/bundle receipt preserved. [Exact images/raw hashes §3](ELP2-10/source-truth-2026-10-18.md). | **UNKNOWN current V2 mount**; **HISTORICAL EXISTS_MOUNTED** retained@UDB-03 pins. Not merely SYNTHETIC_ONLY. Older retained REAL receipt does not qualify current V2 source/authority/UI. | `retainedReview.ts` (V1) | `execution-retained-review.valid.json` | double e2e chưa trả — DEBT-UXM07-003 | NOT_DONE | DEBT-003 |
| 8 | Capital commands collection/workflow | `executionCapitalCommand*` | P `execution-v2/command.controller.ts:15,30–64`, `.store.ts:18–53`, `command-trust.ts:7–60`; `/api/v1/execution/capital-commands`, `/preview`, `/{id}`, `/{id}/workflow`, `/{id}/reconcile`. PM `contracts/baseline/portfolio-account-v1_1/pma11-14-edge-command-handoff.json@e4dbc520:1–19,48–121,177–243`: eight capital ops, not management/controls. [§2.8/§4](ELP2-10/source-truth-2026-10-18.md). | SOURCE_DARK; **current provider/mount UNKNOWN**, source handoff `UNCONFIGURED_FAIL_CLOSED`, production/Edge wire not mounted per descriptor. Local transport/recovery + PG proof not source effect. Empty enabled scope is no scope; same-key lookup, no resend. | chưa có màn V2 | `capital-command` collection/workflow fixtures (unused đến UXM-09) | FE-032 neo nhầm: queue F0 `op_` ≠ capital `ecm_`; `CommandStatus` thiếu `currency` | NOT_DONE | FE-020 |
| 9 | Heartbeats / source health | `executionRetainedServiceHeartbeatsPageV1` | P `execution/service-heartbeats.controller.ts:11–26`, `.service.ts:36–43,76–173`, `retained-service-heartbeat-projector.ts:7–55`; exact `/api/v1/execution/technical/service-heartbeats`, `portal.execution.retained-service-heartbeats.v1`. Retained relation `manager.current.service-heartbeats:service_heartbeats`; E/TS current-page substrate ≠ live health authority. [§2.9](ELP2-10/source-truth-2026-10-18.md). | SOURCE_DARK current source-health; **current mount UNKNOWN**. Retained clock reader exists; `source_status=null`, `health=null`, `SOURCE_STATUS_SEMANTICS_NOT_PUBLISHED` remain typed, not green healthy/live proof. | chưa có màn V2 | heartbeat fixture dùng được sớm cho Source health (không có verdict sức khoẻ) | source health panel FE-021 | NOT_DONE | FE-021 |
| 10 | Manager overview / Score / Composition / Regime | Six `GET /api/v1/execution/manager/`: `fund-overview`, `fleet`, `portfolios/{id}/overview`, `alphas/{id}/overview`, `accounts/{id}/overview`, `deployments/{id}/overview` · `portal.execution.manager-dataset.v1` | P `execution-v2/manager-model.controller.ts:13–28`, `.service.ts:29–99`, `manager-runtime.ts:36–105,244–278`, `app.module.ts:245–263,350`; existing shared pipeline/workers, no install→no timers/source IO. E `contracts/execution-catalogue-v1/registry.json@20a1d27f:2041–2085`, field dictionary759–827 explicitly unavailable; PM `source_history_export.py@e4dbc520:16–53` has17 selected-history factories, not full normalized NAV/census/basis/corpus. DL source candidates ≠ Manager financial authority. [§2.10/§4–5](ELP2-10/source-truth-2026-10-18.md). | Financial normalized source **MISSING / unqualified**; implemented Portal pipeline **SOURCE_DARK**, **current mount UNKNOWN**. Unique NAV/partition, allocation denominator, flow/cost grid, exact tuples/stages/revisions and independent Regime corpus remain actual prerequisites; no duplicate worker/calculator requested. | Overview/Portfolios/Alpha 360 (chưa làm; S2) | fixture sưu tập sau | KPI tiền, Score FE-011, window FE-025/041, q FE-008 | NOT_DONE | FE-008/011/025/041 |
| 11 | Instance registration (preview/submit/status) | `/instance-registrations*` | P `execution-v2/instance-registration.controller.ts:19,49–72`, `.service.ts:74–87,139–221,254–300`, `.trust.ts:20–50`; four paths under `/api/v1/execution/instance-registrations` (`/preview`, POST collection, GET `/{id}`, POST `/{id}/reconcile`). PM `operator_management.py@e4dbc520:27–43,208–249,284–327`, `operator_adapters.py:422–454,511–519`. [§2.11/§5](ELP2-10/source-truth-2026-10-18.md). | SOURCE_DARK (local commit `ff83f176`); **current selected provider/mount UNKNOWN**. REGISTER_INSTANCE0→1 means REGISTERED_UNFUNDED only: no FUND/grant/pair/Live activation. Claude F8 below: ACCEPTED contract, screen NOT_REVIEWABLE (no HiFi), not runtime/sample acceptance. | chưa có màn | `execution-instance-registration.synthetic.valid.json` | UXM-09 | NOT_DONE | FE-020 |
| 12 | Pending-recall control | Four paths under `/api/v1/execution/pending-recalls`: `/preview` POST, collection POST, `/{id}` GET, `/{id}/reconcile` POST · pending-control typed contracts | P `execution-v2/pending-control.controller.ts:18,48–71`, `.service.ts:87–96,143–218,247–297`, `.trust.ts:24–54`; PM `operator_adapters.py@e4dbc520:27–36,147–175,233–312`, `services/risk_pool/recall_repository.py:126–179`. APPLY_PENDING/CANCEL_REMAINING bind original remainder, five CAS/partition and immutable original vs latest receipts. [§2.12/§5–6](ELP2-10/source-truth-2026-10-18.md). | SOURCE_DARK; **current provider/mount UNKNOWN**. Local C1 WIP, no final commit here. Historical migration144 failure preserved; **Main reports PG34PASS after repair, full R3 still running** at this handoff. Do not infer full gate/commit/runtime PASS or consumer ACK. | chưa có màn | NOT_REVIEWABLE (chưa DELIVERED) | thêm `capital.apply_pending`, `capital.cancel_remaining`; rủi ro hiển thị: `business_applied:false` ở CANCELLED/REJECTED, `FAILED_BEFORE_SEND` + business `UNKNOWN`, int64 > 2^53, `blockers` mờ | NOT_DONE | — |

## Gap check lần đầu (Claude, 2026-10-18, từ repo; chưa chạy tự động)
- Fixture canonical **chưa có reader/màn FE nào dùng**: `execution-positive-parent`, `execution-live-source`, `execution-activation-current`, `execution-instance-registration`, `execution-pending-control` (mới), `execution-access`, capital-command và heartbeats. Cần consumer review khi từng cái vào luồng thật (Rules §7.8).
- Ô "Not published" của S1 đều có hàng mở ở trên (kiểm bằng tay lần này).
- `v2/boundary` + mọi reader V2 mới đã nạp fixture L0 trong test; L1 (ma trận state), L2 (quy mô), L3 (âm tính) mới có từng phần — việc F3 trong kế hoạch.

## Source qualification addendum — giữ scope và lịch sử

- **Edge:** owner receipt mới có **213 distinct PASS =145pure+68PG-fixture**, strict gates pass; local/isolated, **NOT_MOUNTED**, full connected acceptance **NOT_MET**, connected09 chưa được chứng minh. PM wire trong lane đó vẫn synthetic. Không cộng thêm các snapshot114 cũ thành test mới và không đổi213 thành Portal mounted/runtime PASS. Source manifest, dirty receipt hashes và owning journal nằm ở [source truth §4–5](ELP2-10/source-truth-2026-10-18.md).
- **PM:** receipt mới có **90 distinct PASS =52PG+38unit**,17 typed selected-history datasets qua isolated TLS/PG/storage.17new+35regression chỉ là chia nhỏ52PG; không cộng offline26 lần nữa. External identity/workload/destination vẫn TEST_ONLY; runtime mount, full census, publication boundary/generation và consumer applied checkpoint chưa được chứng minh. Selected history không tự là NAV snapshot/corpus cho row10.
- **Catalogue:**42logical rows =39Edge families+3BE views, không phải42endpoint đang chạy. Registry `new_runtime_exports_enabled=false`, per-family enabled environments rỗng/UNAVAILABLE; PM discovery12logical/17selected vẫn explicit opt-in/unmounted. Giữ original frozen source pins bên trong artifact; đừng thay bằng fresh worktree HEAD để giả tính hiện hành.
- **Retained:** UDB-03 API222/222, browser68/68 và sáu retained cells là receipt thật ở image/bundle cũ; preserved at [source truth §3](ELP2-10/source-truth-2026-10-18.md). Không dùng chúng chứng minh V2 current source mount/revoke/outage. Cũng không xoá/giảm chúng thành SYNTHETIC_ONLY.
- **C1/gate:** PG34PASS/fullR3RUNNING là cập nhật **Main-reported** tại handoff, không phải test chạy bởi source audit này. Main thay bằng terminal receipt/actual commit khi có, giữ migration144 failure lịch sử. Không prefill commit/PASS tương lai.
- **Promotion rule:** chỉ đổi current status thành EXISTS_MOUNTED sau exact source/image/schema/provider/profile/workspace/current-authority receipt + consumer sample trên cùng pin. Fixture, migration, route DI, source test PASS hay canonical commit không đủ. Các cột FE/fixture/sample/request và gap check lịch sử trên đây giữ nguyên; không có consumer ACK mới từ bản cập nhật nguồn này.

## Fresh source follow-through —15:11:38Z, không đổi sample/acceptance

- **Edge source publication đã có thật:** `upgrade/integration/execution-native-read-v1/` tại`8b7eb0c1` chứa26file guarded patch, manifest và qualification/source pins. Đây là tiến bộ mã nguồn cần semantic intake vào SAME Core, không còn gọi toàn bộ là “chưa publish”.4overlap current Core phải giữ authorization/terminal-lease repairs; không force patch preimage cũ.213isolated cases không thành mounted/connected proof. Normal hook cũ exit1 do fixture ngày cố định; commit mới sửa fixture nhưng corrected terminal **NOT_OBSERVED**, không tự ghi PASS. [Source truth §7.2/§7.4](ELP2-10/source-truth-2026-10-18.md).
- **PM metadata/source-owner progress:** discovery bounds16→17 và chỉ mục9approved steps đã commit ở`91ca9dfa`; `runtime_enabled=false`, environments rỗng/UNAVAILABLE không đổi. Research association, archive-origin Paper và executable/stage timeline đang owner WIP, fresh tests NOT_RUN/API-capture-history chưa hoàn tất. Không dùng candidate stage để điền current stage/days hoặc dùng17selected histories làm NAV/census/Score corpus. [§7.3](ELP2-10/source-truth-2026-10-18.md).
- **Ảnh hưởng12dòng:** row1/6/8/11/12 source wire được pin lại ở metadata mới nhưng không mở provider/grant; row10 còn thiếu financial normalization/corpus, source-owner WIP không phải served fact. Core rows2–5 không cần invent HK endpoint. Các row còn lại không có mounted evidence mới. Current mount vẫn UNKNOWN/SOURCE_DARK; historical retained REAL/213/90receipts giữ nguyên ở source/image riêng. Không có FE sample MATCH/ACK hoặc kết quả hook hiện hành của Main được suy từ follow-up này.

## F8 consumer receipt (Claude, 2026-10-18) — nguồn peer: `UXM-07/consumer-review-2026-10-18.md`, [pinned source/history §8](ELP2-10/source-truth-2026-10-18.md#8-late-peer-board-preservation-check-2026-10-18t151449z)
Pin: producer `ff83f176` (+ `25218372`). Schema AJV 53/53 mẫu hợp lệ (40 delivered, 13 WIP). Không SSH (gói chưa giao). **Chưa SSH đọc mẫu nguồn nào**: cột "Đọc mẫu" vẫn `NOT_DONE`.
| Contract | Đề xuất verdict | Ghi chú |
| --- | --- | --- |
| R2 / Paper Exit parent | **CHANGES_REQUESTED** | quá mỏng cho cockpit (không actors, capital/pins, nhãn finding, observed/limit, liên kết approval→operation_id); **reader V1 hiện đọc sai body V2** (FE đang sửa: F10) |
| Operation parents, Sandbox/Canary/Live parents, compositions, live-source, activation-current, F0/workflow/queue/incident, capital collection/workflow, heartbeat, access | ACCEPTED có ghi chú | ghi chú: `AccessAction` không có `execution.*` → tên `V2_CAPABILITY` sẽ không bao giờ khớp grant (FE-037 phải theo `portfolio.read/account.read/audit.read/maintenance.read`) |
| Instance registration | ACCEPTED (contract) · NOT_REVIEWABLE (màn: chưa có HiFi) | không có list read |
| Pending-control | NOT_REVIEWABLE | chưa DELIVERED |
Hàng mới: 13 live-source panels · 14 activation-current · 15 F0 collection/get + `OperationalWorkflowV2` (chưa reader) · 16 account sync/policy metadata · 17 Sandbox/Canary/operation parents.
Không contract nào đã giao đóng FE-028/029/030/034/037/038/025/041; FE-020/021 hẹp hơn một chút (F0 `intent`, heartbeat `capture_state`).
Slug gap check đúng: dùng `portal.access-effective` (slug `access` quá rộng).

**Peer-history preservation note (Codex):** F8 và các ô FE mới ở rows6/8/9/12 được sao nguyên văn từ peer board được đọc lúc15:14:49Z, SHA256`52717576624822eca6e47e6f77d5acce40ba0291612730b61074b21bea295d1a`. Đây là verdict/observations do Claude ghi, không phải test hoặc ACK do Codex tự tạo; không ghi đè chúng bằng snapshot board14:35. Historical C1 text `WIP staged-uncommitted; 4 suite lỗi migration 144, sau sửa 357 pass / 1 fail (theo note Codex)` được giữ riêng tại source truth §8, không biến thành actual result mới; Main chốt actual terminal/commit mới nhất.

## Main integration disposition — 2026-10-18

- F8's original report explicitly calls its verdicts **proposed review, not
  consumer ACK**. ACCEPTED in the copied peer table/source shorthand above
  therefore means proposed contract acceptance only; no source sample, assigned
  UXM consumer/browser acceptance or runtime qualification is asserted here.
- C1 first full R3 is now terminal **FAIL_OR_INCOMPLETE**, not RUNNING:
  `pending-control-land-142935`, finished15:12:31UTC. Pending34/34 and
  access130/130 passed, but History/retained fixtures omitted Core's finite
  checkout timeout. Fixed exactly those two disposable pools, no production
  relaxation. [Actual failed terminal/retake](ELP2-07/pending-control.md#first-normal-r3-terminal--2026-10-18t151231utc).
- C6's twelve source columns and source history are integrated as source-only
  documentation. C3/C4/C5 are not delivered by this board. C7 actual provider,
  budget/calibration/coexistence/G2 remain open; ELP2-11 NOT_ENTRY_READY.

## Main current delivery update —2026-10-18T16:16UTC

- C1/C2 terminal normal R3 **PASS**, landed `5291a80f`;996contracts and
  7503API tests PASS/3skip, supported Node22 build PASS. Exact cell teardown and
  eight protected runtime tuples unchanged. The earlier failure above remains
  historical, not the current gate status. See [actual terminal](ELP2-07/pending-control.md).
- C3/C4/C5/C7 and F8-08 currency are integrated WIP, **NOT_RUN** pending the
  single heavy lane; this updates local source only, not FE/fixture/sample
  columns or proposed Claude verdicts. Paper Exit rich criteria is a separate
  purpose on BOTH anchors, not release of ROOT integrity preimages.
- [Fresh SSH checkpoint](ELP2-10/source-truth-2026-10-18.md#9-fresh-upstream-checkpoint-2026-10-18t161600z):
  PM now prepares18datasets, NOT_RUN; the previous17-dataset receipt remains
  historical at its own digest. Edge current5291 integration is still being
  assembled/qualified. All current mount/provider states above remain unchanged.

**Fresh source follow-through16:37:34UTC:** [four-source checkpoint](ELP2-10/source-truth-2026-10-18.md#10-fresh-four-source-checkpoint-2026-10-18t163734z)
repins Edge8b7eb0c1, PM699c70d2, TS-next8e2849dd and DL97c9ecb6 with separate
tracked/untracked-manifest hashes. PM's new Manager joint attempt has6failures;
Edge's native SSE draft is NOT_RUN. Neither is a current mounted/qualified
provider. Existing FE cells and historical receipts are not overwritten.

**Fresh source delta18:03–18:04UTC:** [checkpoint14](ELP2-10/source-truth-2026-10-18.md#14-fresh-upstream-delta-2026-10-18t180311z-to180433z)
pins Edge8204eeea and PMc889872d. Edge SSE270executed251PASS/19FAIL plus3load
errors; corrected attempt NOT_RUN. PM reports separate30mixed and162history
TEST_ONLY results, not a commissioned provider or current Core WIP acceptance.
All12 family mount/authority statuses remain unchanged; old evidence retained.

**Fresh follow-through18:44:48–49UTC:** [checkpoint15](ELP2-10/source-truth-2026-10-18.md#15-fresh-peersource-delta-2026-10-18t184448z184449z)
repins Edge8204eeea/PMc889872d newer working bytes and DL24bb43c4. Edge reports
strict/focused fixed5 success, full360 pending; PM mounted eight-case BFF is
preparation only, raw mixed/RETURN have actual failures. No mounted family,
financial source, authority or current-human commissioning is inferred.

**Fresh publication21:03:41UTC:** [checkpoint17](ELP2-10/source-truth-2026-10-18.md#17-fresh-edge-runtime-profile-publication-2026-10-18t210341z)
pins Edge9d9d0950/PM2d166ec6. Edge's new43-file runtime profile has upstream
389+4 distinct isolated cases but explicitly no installed/connected acceptance;
it targets historical Core5291, not current C3–C7 WIP. Do not overwrite current
files or convert upstream receipt counts into mounted family/provider truth.
The twelve authority/mount states and Claude-owned consumer columns stay intact.

**Fresh scoped successor22:17–22:18UTC:** [checkpoint19](ELP2-10/source-truth-2026-10-18.md#19-fresh-four-source-follow-through-2026-10-18t22172218utc)
records committed PM908169aa evidence, unchanged discovery/history/command wire,
and Edge's separate native-only compatibility repair. Stop listing the original
finite32 eight-case execution as missing; keep every broader source/trust/
current-runtime/financial/SSE/capacity gate and all12 mount states unchanged.
