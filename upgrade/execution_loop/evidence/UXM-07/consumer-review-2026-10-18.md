# UXM-07 — Consumer review F8 (Rules §10.3, §10.12 mục 4), 2026-10-18

Người viết: Claude (subagent F8, chỉ đọc code; file này là file repo duy nhất F8 ghi). Review là **ghi nhận, không phải ACK** (§10.3): ACK chỉ khi Bobby giao UXM tương ứng. Mọi verdict dưới đây là **đề xuất**.

## 0. Pin, phương pháp, giới hạn

| Mục | Giá trị |
| --- | --- |
| FE | `claude/fe-parity` (rebase trên Codex `ff83f176`). Worktree **không sạch**: phiên khác đang có WIP chưa commit (`screens/access/`, `readers/accessEffective.ts`, `apps/control-api/src/operations/*`, e2e); F8 chỉ đọc chúng để chạy fixture access |
| Delivered (trong repo, đã commit) | `0d5ceaba` (R2/Paper Exit parent) → `25218372` (Live/Activation/Sandbox/Canary/operations) → `ff83f176` (instance registration). Trước pin: digest §2 (`49bdc6e1`…`ac056d46`) |
| WIP KHÔNG GIAO | `/home/bobby/portal-research` (staged, **chưa commit**, HEAD vẫn `ff83f176`): pending-control. Chỉ đọc |
| Cách đo | (1) AJV 2020 (`ajv@8.20`, schema + OpenAPI trong repo) trên 53 mẫu fixture; (2) vitest scratch nạp fixture qua reader FE **hiện có** (`api/rows`, `api/profileRead`, `certification`, `liveFull`, `stagedActivation`, `operationalComposition`, `operations`, `v2/readers/*`, `v2/boundary`); (3) đọc controller/authority của control-api để biết khi nào route trả V2 |
| Script (scratch, không vào repo) | `/tmp/claude-1000/-home-bobby/e9193882-3547-4d96-bd79-71735ca75103/scratchpad/f8/` : `schema-conformance.mjs`, `fe-readers.f8.test.ts`, `boundary.f8.test.ts`, `detail.f8.test.ts`, `access.f8.test.ts`, `vitest.f8.config.mts` |
| Không làm | Không chạy full suite/Playwright/build; không SSH nguồn (gói chưa giao, §10.12 mục 2a); không đọc mẫu runtime: **mọi fixture là `TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT`, `runtime_qualified=false`** |

## 1. Bảng tổng hợp hợp đồng

Lane: **SD** = source-dark (route có mount, nguồn/trust chưa cài). Tất cả `R=KHÔNG, A=KHÔNG`. "FE đã đọc" = reader/màn product dùng fixture; hiện **0** cho mọi hàng trừ queue/incident V2 và access (WIP).

| # | Hợp đồng | operationId · route | schema_version | SHA (fixture) | Lane | Verdict đề xuất |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | positive-parent R2 + Paper Exit | `executionGovernanceR2Review` GET `/governance/approvals/{id}/r2`; `executionGovernancePaperExitReview` GET `/governance/exit-reviews/{id}` (oneOf legacy / V2) | `portal.execution.governance-parent.v2` | `0d5ceaba`, mở rộng `25218372` | SD | **CHANGES_REQUESTED** (F8-02..05; phía FE F8-01) |
| C2 | operation parent R2 / Paper Exit | `getExecutionCommandOperationF0`, `getPaperExitDecisionOperation` GET `/operations/{id}` (union 9 nhánh) | `portal.execution.governance-parent-operation.v2` | `25218372` | SD | ACCEPTED (hợp đồng) · F8-04 |
| C3 | Sandbox / Canary parent | `getSandboxCertification` GET `/deployments/{id}/certification`; `getCanaryControlRoom` GET `/deployments/{id}/canary` | `portal.execution.following-parent.v2` | `25218372` | SD | ACCEPTED |
| C4 | Live parent (đã lưu) | `executionGateLiveReviewV1` GET `/governance/approvals/{id}/live` | `portal.execution.live-parent.v2` | `25218372` | SD | ACCEPTED · F8-01 |
| C5 | compositions của parent | `/api/v1/execution/compositions/approvals/{id}?view=`, `/exit-reviews/{id}` | `execution.operational-composition.v1` | `0d5ceaba` | SD | ACCEPTED (reader composition hiện có nhận được) |
| C6 | live-source (panel Live) | `getLiveFullOperations` GET `/deployments/{id}/live?panel=&cursor=` | `portal.execution.live-source-operations.v2` | `25218372` | SD | ACCEPTED với ghi chú F8-07 |
| C7 | activation-current | `listActivationCapabilities` GET `/activation/capabilities`; `getStagedActivationPlan` GET `/activation/plans/{id}` | `portal.execution.activation-capabilities-read.v2`, `…activation-plan-read.v2` | `25218372` | SD | ACCEPTED · F8-12 |
| C8 | instance-registration | `executionInstanceRegistration{Preview,Submit,Status,Reconcile}V1` POST/GET `/instance-registrations*` | `…instance-registration-{intent,preview,status}.v1` | `ff83f176` | SD | ACCEPTED (hợp đồng) · **NOT_REVIEWABLE** cho màn (chưa có HiFi) |
| C9 | access (AccessEffective…) | `portalScopedAccessEffectiveGetV1`… | `portal.access-effective.v1` | `c1d6b2dc` (không đổi từ 10-15) | SD (POLICY_PENDING) | ACCEPTED (không có gì mới); F8-11 |
| C10 | operations V2: queue, workflow, incident, F0 get/list | `listExecutionOperationsQueue`, `getExecutionCommandOperationF0` (nhánh `OperationalWorkflowV2`), `getExecutionIncidentDetail`, `executionF0BlockedOperation{Get,sList}V2` | `…operational-queue.v2`, `…operational-workflow.v2`, `…incident-current-root.v2`, `…f0-command-collection.v1` | `49bdc6e1`, `880a3d66`, `d9fc67fb` | SD | ACCEPTED. Queue + incident đã có reader; **workflow + F0 chưa có reader** |
| C11 | capital commands collection + workflow | `executionCapitalCommandCollectionV1` GET `/capital-commands`; `executionCapitalCommandWorkflowGetV1` | `portal.execution.command-collection.v1`, `…capital-workflow.v1` | `5cac1151`, `005de29b`, `ac056d46` | SD | ACCEPTED với F8-08, F8-09 |
| C12 | heartbeat + account sync/policy pages | `executionRetainedServiceHeartbeatsPageV1` GET `/technical/service-heartbeats`; `managerAccountPoliciesPageV1`… | `…retained-service-heartbeats.v1`, `…manager-relation-page.v1` | `f734db9d`, `da3a5f5c` | SD | ACCEPTED với F8-13 |
| W1 | **pending-recall control (WIP, NOT DELIVERED)** | `executionPendingControl{Preview,Submit,Status,Reconcile}V1` `/pending-recalls*` | `…pending-recall-{intent,preview,status}.v1` | chưa có SHA | WIP | **NOT_REVIEWABLE** (ghi chú sơ bộ §6) |

## 2. Fixture: field published / consumed và "unused by FE until X"

| Fixture (`packages/contracts/fixtures/…`) | Published (tóm tắt) | FE consumed | Unused by FE until |
| --- | --- | --- | --- |
| `execution-positive-parent.synthetic.valid.json` (26 khóa: r2, r2_absent, paper_exit(+extended,+absent), *_composition, r2/paper_exit_operation(+uncaptured/applied/expired), sandbox(+absent,+draft), canary(+absent,+revision), live, live_composition) | `approval{approval_id,gate,status,approval_version,policy_version,quorum_required/met,evidence_complete,created/updated/sla_due/expires/decided_at_ms}`; `anchors{deployment_id,portfolio_id,environment}`; `lineage` (R2: `r1_approval_id`, `observed_risk_grant_id`, `currency`; Exit: `r1/r2_approval_id`, `source_snapshot_hash`, `evidence_set_hash`) hoặc `{availability:NOT_PUBLISHED, reason_code:PARENT_FIELD_PURPOSE_NOT_QUALIFIED}`; Exit: `review{review_state,extension_days…}`, `evaluation{panels[4 kind],findings[outcome,blocking,required]}`; operation: `operation_id,status,decision,expected_version,parent_*`; Canary `proposal{capital_cap,gross_notional_cap,daily_loss_cap,max_open_orders,duration_days}` PROPOSED_NOT_EFFECTIVE; Sandbox `steps.items[7]` | **0 field** (không reader V2) | UXM-07 S1b R2/Exit/Live lane khi mode `SCOPED_V2` bật; UXM-08/09 cho Sandbox/Canary/operation |
| `execution-live-source…` (populated, unpublished) | 11 panel × `{state,reason_code,source_as_of_ms|null,source_clock_reason,provenance{9},exact_total:null,grain,limit:200,returned_count,has_more,next/previous_cursor,records[{observation_id,values}]}`; `runtime{state:null}`, `realtime.active=false`, `commands.enabled=false` | 0 | màn Live/Deployment (HiFi `live.html`, `deployment.html`; chưa là S1) |
| `execution-activation-current…` (capabilities, plan, plan_absent) | 7 `capability_key` × `record_state` RECORDED/NOT_RECORDED, `effective_profile`, `source_enabled`, `runtime_enabled`, `kill_switch_engaged`; plan `stored_status`, `expiry_basis`, `evidence.items[]`, `compatibility`; `perspective{environment,root_id,basis}` | 0 | Access/"What the server offers" (FE-015) hoặc màn Admin; cần `maintenance.read` + `audit.read` mức ROOT |
| `execution-instance-registration…` (intent, preview_blocked, unknown, registry_applied) | preview `allowed/reason_code(9)/preview_digest/expires_at_ms/profile_ref`; status `delivery(5)`, `business{state UNKNOWN|APPLIED,business_applied,receipt{PM_REGISTRY_RECEIPT},source_instance_ref}`, `canonical_identity` NOT_PUBLISHED, `projection`, `venue`, `next_action` | 0 | UXM-09 (cần HiFi "register instance"; hiện không có trong `design/hifi/v2/*`) |
| `execution-access.synthetic.valid.json` | không đổi từ `c1d6b2dc` | WIP S1e phiên khác (untracked) | S1e commit |
| `execution-operational-current…` (queue, workflow, incident) | queue + incident: đã đọc. `workflow`: `operation{…}` + `intent{status,blockers[],warnings[],relay_receipt}` | queue, incident: có. **workflow: 0** (legacy `readWorkflowResult` chấp nhận nhưng bỏ `intent`) | Operations dock (FE-020 "Intent axis") |
| `execution-f0-command-collection…` | `F0_BLOCKED_INTENTS_ONLY`, `CURRENT_ACTOR_EXACT_RESOURCE_ONLY`, items `execution.command-operation.v1`, page(limit,returned_count,has_more,next_cursor) | 0 | "Your blocked intents" (Operations/M09) — nhãn riêng, không gộp queue |
| `execution-trusted-command-collection…`, `execution-capital-workflow…` | `CommandStatus` (delivery/business/projection/venue/next_action), `WorkflowCapital` (+`currency`, `effect_kind`, `form_cancel`, `after_submit_cancel`, `refresh`, `automatic_resend:false`) | 0 | M04 ledger/Allocation (UXM-09) |
| `execution-scoped-records…` (3 case ServiceHeartbeatsPage) | `capture_state(6)`, `captured_source_freshness/completeness`, `source_as_of_ms:null`+reason, `snapshot_received_at_ms`, `records[{record_id ẩn danh, source_last_seen_at_ms, source_status:null, health:null, status_reason_code}]` | 0 | Operations "Source health" (FE-021) — dùng được sớm, chỉ hiển thị `capture_state` + last seen |
| `execution-account-policy-metadata…` | `account_id,mode (PAPER hoa),venue,created_at (0),updated_at (null)` | 0 | màn Accounts (S2) |
| `execution-pending-control…` (WIP) | xem §6 | 0 | gói được giao + commit |

## 3. Kết quả nạp fixture qua reader FE hiện có (đã chạy)

Schema: **AJV 53 pass / 0 fail / 0 skip** (40 delivered + 13 WIP pending-control; mọi nhánh C1–C12 hợp lệ theo schema Codex xuất bản).

| Reader FE hiện có | Input (fixture V2) | Kết quả | Hệ quả |
| --- | --- | --- | --- |
| `rows.readGateR2Detail` | `r2`, `r2_absent`, `r2_operation` | **CHẤP NHẬN** (không `null`, `gaps:[]`) nhưng `r1State:"MISSING"`, `r1LineagePublished:false`, `capital:[]`, `readiness:[]`, `planAuthor:"unknown"`, `portfolioId:null`, `sla:null` | EvidenceFrame in "The response carried no R1 lineage" trong khi `lineage.availability=AVAILABLE` có `r1_approval_id`; "No capital rows published" sai (hợp đồng V2 không có capital). Cả body *operation* cũng bị nhận là gate R2 |
| `rows.readPaperExitDetail` | `paper_exit`, `paper_exit_extended` | CHẤP NHẬN: `panels:[]`, `stage:null`, `deploymentId:"unknown"`, `quorumRequired:null` (V2 có 2), `gateMet:false`, `gaps:["gate_met was not published; treated as unmet"]` | mất `evaluation.panels/findings`; có cảnh báo gap nhưng hiển thị "unmet"; `paper_exit_operation` → `null` |
| `certification.readSandboxCertification` | `sandbox*` | CHẤP NHẬN: `steps:[]`, `deploymentId:null`, **`sourceSideEffectRequested:true`, `runtimeActivationRequested:true`, `promotionExecutionRequested:true`** | V2 nói `false` (nằm trong `source{}`), reader đọc cấp trên → fail-closed sai chiều, báo "đã chạm Trading System" trên một read nói ngược lại |
| `profileRead.readLiveReview` | `live`, `live_composition` | `null` | UI "could not be read" cho body hợp lệ |
| `certification.readCanaryControlRoom` | `canary*` | `null` | như trên |
| `liveFull.readLiveFullOperations` | live-source `populated`, `unpublished` | `null` | Live V1 hỏng khi mode đổi |
| `stagedActivation.readStagedActivation` | `capabilities`, `plan`, `plan_absent` | `null` | như trên |
| `operationalComposition.readOperationalComposition` | 3 composition parent | CHẤP NHẬN đúng (`journal/sourceHealth/canaryTwin` UNAVAILABLE giữ reason_code) | ghi chú: `sourceHealth.profiles:[]` phải đọc cùng `sourceHealthEnvelope.state` |
| `operations.readOperationsQueue` (legacy) / `readIncidentDetail` | queue V2 / incident V2 | queue: chấp nhận (actor `null`); incident: `null` | `v2/readers/operationalQueue` (`readOperationalQueueV2`, `readIncidentRootV2`) đã nhận đúng |
| `v2/boundary.readDecimal` | canary caps, live positions/balances, WIP amounts | **nhận hết**, giữ `full` chính xác (`9007199254740993.123456789123456789`); `display` làm tròn: `daily_loss_cap 1e-18` → "0.00"; `quantity 1e-18` → "0" nhưng `zero:false`, `tone:neutral` | OK ở biên; màn phải in `full` khi `zero:false` mà `display` là 0 |
| `v2/boundary.readAsOf` | `observed_at_ms:0`, `created_at_ms:0`, `created_at:0` trong fixture | nhận, in "1 Jan 00:00Z" | xem F8-07 |
| `v2/readers/accessEffective` (WIP phiên khác) | AccessEffective POLICY_PENDING | nhận đúng; hạn chế: `MAX_GRANTS=500` < contract `maxItems 10000` → 501 grant bị `null` | MINOR, fail-closed; báo phiên S1e |

## 4. Ô "Not published" mà từng hợp đồng đóng được (đối chiếu FE-001..043 và code)

Ô trong code: `laneModel.ts` (`NOT_PUBLISHED.criteria/chart/decisionCall/lane/stepUp`), `notPublished.tsx` (`FE.intent/audit/assignee/events/receipts/eligibility`), `fleetModel.ts` (`NOT_PUBLISHED_LIST`), `Rail.tsx:164`, `EvidenceFrame.tsx`.

| Màn | Ô (FE-id) | Hợp đồng liên quan | Đóng được? |
| --- | --- | --- | --- |
| **Fleet** | group/board FE-012,027 · map FE-035 · readiness FE-027/028 · window FE-025 · compare FE-033 · archived FE-034 | không hợp đồng nào | **Không ô nào**. Live-source/registration không phải grain alpha fleet; `canonical_identity` NOT_PUBLISHED |
| **Cockpit** | criteria FE-028 | C1 Exit `findings[].outcome/blocking/required` + `panels[].panel_kind` | **Không đóng.** Chỉ có verdict 4 trạng thái + cờ; thiếu `label`, `observed`, `limit`, `op`, `unit`, `source_ref`. Chỉ thu hẹp "verdict" cho Paper Exit, và chỉ khi `SCOPED_V2` |
| | chart FE-029 | — | Không. Không series nào |
| | decisionCall/Ladder/Receipt ref/What changes FE-030 | C2 `operation_id,status,decision,expected_version,applied_at_ms` | **Không đóng.** "Receipt ref/Call" chỉ khả thi khi biết `operation_id`; không có link approval→operation (F8-04). Không creator/ladder/needs_you/what-changes; V2 cố ý bỏ actor (F8-05) |
| | lane Archive/Reactivation/Capital FE-034 | C11, C8, W1 | **Không.** Lệnh vốn/registration/pending không có grain approval; Archive/Reactivation không có gì |
| | stepUp FE-015 | C7 | Một phần cho quản trị viên (per capability `source_enabled/runtime_enabled/kill_switch_engaged`), không có `reason_class/grant_ref/step_up_required` |
| | bare "Not published": `index.tsx:279-280` (Approvers, Clock), `Rail.tsx:164` (Policy), `EvidenceFrame.tsx:107` | C1 có `quorum_*`, `sla_due_at_ms`, `policy_version` | Các ô này **không có FE-id** (vi phạm §10.12 mục 3) và dữ liệu V2 có sẵn; đề xuất gán id hoặc đọc từ parent |
| **Operations** | intent FE-020 | C10 workflow `intent{status,blockers,relay_receipt,source_side_effect_requested}` | **Một phần**: nói được "blocked trước relay (COMMAND_RELAY_DISABLED)". Không trả lời "backend có giữ preview không" |
| | display axis + amounts FE-032 | C11 | **Không và không thể**: hàng queue là F0 `op_…`, lệnh vốn là `ecm_…` (grain khác, digest §5#2); ô "Amounts requested/applied/pending" trong `OperationDock.tsx:105` neo sai grain → nên đổi thành "Not applicable (not a capital command)" cho F0 |
| | audit/source health FE-021 | C12 heartbeat | Một phần: thêm được `capture_state` + `source_last_seen_at_ms`; `health:null` nên vẫn "Not published (FE-021)" cho verdict. Composition `source_health` vẫn UNAVAILABLE `CURRENT_AUDIT_SOURCE_PURPOSE_NOT_QUALIFIED` |
| | events FE-031, assignee FE-030, eligibility FE-015 | — | Không đổi (`historical_children` vẫn NOT_PUBLISHED) |
| | FE-042/043 | — | Không đổi (queue V2 giữ nguyên); code S1 chưa render hai ô này dù board hàng 2 liệt kê |
| **Access** | FE-015/026/037/038 | C9 | Không đổi. Hai sự thật mới: `AccessAction` (55 tên) **không có `execution.*`**; thao tác đọc lấy từ `portfolio.read`, `account.read`, `audit.read` (cổng queue V2/F0/status), `maintenance.read` (activation), `deployment.register`. Tên `V2_CAPABILITY` tạm (`roleNav.ts:35-37`) sẽ không bao giờ khớp grant → FE-037 cần hướng "nav theo grant/eligibility" (khớp ý kiến Codex ở SYNC §0c) |

## 5. Câu hỏi của Bobby (a)

| Câu hỏi | Trả lời |
| --- | --- |
| FE-028 criteria | **Chưa đóng.** Xem bảng §4. Cần `criterion_key + label + observed/limit/op/unit + source_ref` |
| FE-029 evidence chart | **Chưa.** Không có series/baseline trong bất kỳ hợp đồng mới |
| FE-030 ladder/receipt | **Chưa.** Receipt chỉ với `operation_id` đã biết; không ladder/creator/needs_you/what-changes; không decision call |
| FE-034 archive lanes | **Chưa.** Không archive/reactivation; lane Capital là họ lệnh khác |
| FE-037/038 | **Chưa.** Registry không đổi (`apps/portal/registry` 0 diff `0d5ceaba..ff83f176`); chỉ làm rõ từ vựng action (F8-11) |
| FE-025/041 window | **Chưa.** Không route nào mới có `window/from_ms/to_ms`; live-source chỉ `limit`+`cursor` |

## 6. Pending-control WIP (NOT DELIVERED — chỉ đọc, đừng code theo)

Trạng thái: staged-uncommitted tại Codex checkout, HEAD `ff83f176`; `ELP2-07/pending-control.md`: lần chạy 13:42Z **4/10 suite fail "syntax error at end of input"** (migration `…144`, **không sửa, chỉ ghi**); sau sửa CASE→IF (14:27Z) 357 pass / 1 fail (setup test DENY). Retake/restore/contracts **chưa chạy**; hợp đồng còn đổi được. AJV: 13/13 case khớp schema của chính nó.

| Cần cho màn | Chi tiết |
| --- | --- |
| Cockpit | Không vào queue approval; "Capital" lane (FE-034) vẫn trống vì đây là lệnh, không phải approval. Chỉ cần nếu Bobby quyết đặt lệnh vốn thành lane |
| Operations | Không thuộc queue V2 (grain `ecm_…`, không nằm trong `CommandCollection` — họ lệnh tách rời); **không có collection/list** nên chỉ mở được khi đã có `command_id` + `workspace_id`; một panel "Recovery" cần lưu `command_id` phía client |
| Access | thêm 2 action `capital.apply_pending`, `capital.cancel_remaining` (đã nhìn thấy trong `execution-access.d.ts` staged) |
| Reader cần | `PendingControlPreview/Status`, mã `PENDING_CONTROL_*` (9), `CommandProblem` 400/401/403/404/409/503 |

Rủi ro ngữ nghĩa (cần quyết trước khi dựng UI):
1. `delivery:ACKNOWLEDGED` + `state:WAITING_ENCUMBRANCE` với `applied>0` **và** `pending>0`: không phải thành công; `next_action:QUERY_SAME_INTENT` = hỏi lại cùng lệnh, không gửi lại.
2. `business_applied:false` cho `CANCELLED` / `PARTIALLY_APPLIED_CANCELLED` / `REJECTED` (chỉ `APPLIED` mới `true`): đừng suy "chưa xảy ra gì"; `UNKNOWN` thì `business_applied:null`, `amounts:null` (không phải 0).
3. `FAILED_BEFORE_SEND` đi với `business.state:UNKNOWN`: nói "Not sent" từ `delivery`, không hiển thị business UNKNOWN như "lỗi nghiệp vụ".
4. Hằng số `economic_cash_changed:false`, `physical_transfer_performed:false`, `projection:UNKNOWN`, `venue:NOT_APPLICABLE` kể cả khi `APPLIED`: không in "synced/filled/cash moved".
5. **Status không có `currency`** (intent có `currency`); `amounts` trần → không thể in tiền sau reload (F8-08). Counter int64 là chuỗi (`"9007199254740993"` > 2^53): không `Number()`.
6. `blockers[]` là text nguồn PM (≤128), coi là opaque, không dịch/suy diễn; `original_payload_sha256` không có tiền tố `sha256:` còn `preview_digest` có.
7. `latest_operation:null` + `latest_operation_availability:NOT_PUBLISHED` ≠ "không có operation"; hai id receipt (`control_receipt_id` bất biến, `latest_receipt_id` tiến triển) phải hiển thị tách rời.
8. Mặc định source-dark: preview `allowed:false`/`PENDING_CONTROL_NOT_QUALIFIED` phải là nút tắt có lý do, không phải lỗi.

## 7. Phát hiện (ELP2-REV, severity theo §10.3)

| ID | Sev | Locator | Quan sát → Hệ quả → Đề xuất nhỏ nhất |
| --- | --- | --- | --- |
| F8-01 | MAJOR (FE) | `governance.controller.ts:322-368,523` (`coreSelectionMode==="SCOPED_V2"`), `api/rows.ts:627,818`, `certification.ts:232` | Cùng route trả **V2 thay legacy** theo mode workspace "sticky"; legacy mới 503 `OPERATIONS_SCOPED_PARENT_NOT_COMMISSIONED`. Reader cockpit chấp nhận V2 và in sai (§3). Đề xuất: FE thêm reader V2 + dispatch `schema_version` trước khi mode bật; Codex nêu cổng/ngày bật mode |
| F8-02 | MAJOR | `R2ParentReadV2` | Không `capital[]`, requested amount, `decision_context`, `evidence_set_hash` (chỉ `lineage.currency`); panel "Capital change preview" và việc lập kế hoạch quyết định R2 từ V2 là không thể. Xác nhận cố ý; nếu có, ghi thành khoảng trống FE-030 "what changes" (đề xuất amendment, chờ Bobby) |
| F8-03 | MAJOR | `findings[]` | `finding_id` opaque, không label/observed/limit. Thêm `criterion_key` + từ điển nhãn công khai hoặc trường `label_key`, `observed`, `limit`, `op`, `unit` (FE-028) |
| F8-04 | MAJOR | `R2/PaperExitParentReadV2` ↔ `…OperationReadV2` | Không có `operation_id`/`latest_operation_id` trên approval, và hàng history không mang; receipt/call (FE-030) không với tới được. Thêm liên kết approval→operation |
| F8-05 | MAJOR | mọi parent V2 | Không actor (creator, decided_by); separation-of-duty (`laneModel.ts:309`) giữ "unknown". Xác nhận cố ý; creator cho FE-030 cần kênh khác |
| F8-06 | MINOR | `LiveParentReadV2` | Không `governance_backbone`/`canary_ref`; cockpit Live mất panel backbone. FE dùng `anchors.deployment_id` để gọi Canary/Sandbox parent — xác nhận đây là cách dự kiến |
| F8-07 | MINOR | fixtures: queue/workflow/incident `observed_at_ms:0`, live deployments `created_at_ms:0`, policy `created_at:0` | `0` là instant hợp lệ → FE in "1 Jan 00:00Z". Xác nhận `0` là giá trị synthetic, hay quy ước "unknown"; muốn `null` + reason |
| F8-08 | MAJOR | `CommandStatus.business.amounts`; WIP `PendingControlStatus` | `amounts` không có `currency` (chỉ `WorkflowCapital.currency`); danh sách và status trần không in được tiền. Thêm `currency` vào `CommandStatus`/collection/pending status |
| F8-09 | MAJOR | registration, pending-control | Không có list/collection; UNKNOWN recovery sau reload cần `command_id` do client giữ. Thêm đọc theo resource hoặc đưa họ vào collection |
| F8-10 | MINOR | `delivery` vs `business` vs `venue` | `ACKNOWLEDGED` ≠ APPLIED ≠ filled; `venue` enum có `FILLED`. Cần bảng bất biến (RV-1) |
| F8-11 | NOTE | `execution-access.d.ts` `AccessAction`; `roleNav.ts:35-37` | Không có `execution.*`. FE-037: nav theo grant (`portfolio.read`…), không theo tên `execution.*` |
| F8-12 | NOTE | activation | `kill_switch_engaged:true` là mặc định fail-closed, không phải sự cố; `structure_valid:true` đi với `owner_accepted:false`, `trusted_for_activation:false`; `expires_at_ms` quá hạn chỉ là lịch sử (`HISTORICAL_CAPTURE_NOT_CURRENT_READ_AUTHORITY`) — không tô đỏ |
| F8-13 | MINOR | heartbeat + composition | Một panel có thể nhận hai sự thật mâu thuẫn (heartbeat AVAILABLE, composition `source_health` UNAVAILABLE). Nhãn nguồn riêng; `health:null` ⇒ không chấm xanh theo `source_last_seen_at_ms` |
| F8-14 | NOTE | chuẩn hóa | `environment`: HOA ở queue, parent `anchors`, `Account policy mode`; thường ở F0, capital, heartbeat, registration, activation, access, live-source. Thời gian: ISO µs (queue/workflow/incident/F0 items) vs epoch-ms (còn lại). Cần adapter tại biên (bảng bên dưới) |

Chuẩn hóa tại biên (đề xuất cho adapter):

| Trục | Dạng |
| --- | --- |
| env | `PAPER|SANDBOX|LIVE` (queue, incident, parent anchors) · `paper|sandbox|live` (F0, capital, heartbeat, registration, activation, access, live-source) |
| thời gian | ISO (`created_at`) · epoch-ms (`*_at_ms`); composition có cả hai |
| số | decimal = chuỗi, tối đa 18 dp, có thể không scale (`"0"`); counter int64 = chuỗi; `count`/`limit` = số nguyên JS |
| vắng | `null` + `reason_code`, hoặc `{availability:NOT_PUBLISHED,reason_code}`; `exact_total:null` ≠ 0; `free:null` ≠ `locked:"0"` |

## 8. Việc FE nhỏ nhất theo thứ tự

| # | Việc | Chặn gì | Cỡ |
| --- | --- | --- | --- |
| 1 | `v2/readers/governanceParent.ts`: dispatch `schema_version` cho R2/Exit/Sandbox/Canary/Live/operation; trả `unsupported_shape`/`v2` thay vì rơi vào reader legacy; test nạp `execution-positive-parent` (+ âm tính: legacy body, V2 hỏng) | F8-01, mọi lane cockpit khi mode đổi | S |
| 2 | `EvidenceFrame` nhánh V2: R2 lineage thật, Exit panels/findings với nhãn "id" trung thực, Live chỉ approval; ô capital hiện "Not published (FE-030)" thay vì "No capital rows published" | lời nói dối đang có | M |
| 3 | `readOperationalWorkflowV2` + dock "Intent" từ `intent.blockers`; đổi ô Amounts thành "Not applicable" cho F0 | FE-020, FE-032 | S |
| 4 | Panel Source health: `readHeartbeatsPage` chỉ `capture_state` + last seen, `health` luôn "Not published (FE-021)" | FE-021 | S |
| 5 | Gán FE-id hoặc đọc parent cho 3 ô "Not published" trần | §10.12 mục 3 | XS |
| 6 | Đến UXM-08/09: readers capital/registration/pending/live-source/activation + design HiFi cho registration | chờ giao | L |

Câu hỏi cho Codex (không tạo ID mới trước khi Bobby duyệt): F8-02/03/04/05/07/08/09 ở trên; ngày bật `SCOPED_V2`; pending-control có đi cùng `CommandCollection` hay không.

## 9. Đề xuất sửa Source Truth Board (chưa sửa)

| Hàng | Sửa |
| --- | --- |
| 4 | Fixture: `positive-parent` "nạp bởi scratch F8; **reader legacy chấp nhận sai**". Thêm cột "Consumer receipt (F8)" cho cả bảng; đọc mẫu = `MISMATCH@25218372 (reader legacy)`. Ô mở thêm: R2 capital/pins (đề xuất amendment FE-030), bare cells |
| 6 | "execution-access chưa đọc" đã lỗi thời: có reader WIP S1e (phiên khác, chưa commit). Thêm: `AccessAction` thiếu `execution.*` (FE-037) |
| 8 | Fixture `trusted-command-collection`, `capital-workflow`: "unused by FE until UXM-09/M04". Ô mở: FE-032 (neo sai grain ở dock), thêm `currency` thiếu |
| 9 | Fixture `scoped-records` (heartbeat): "dùng được sớm cho Operations Source health, không có health verdict" |
| 11 | "unused by FE until UXM-09; **chưa có HiFi** registration" |
| 12 | "WIP staged-uncommitted, HEAD `ff83f176`; 4 suite migration lỗi → sau sửa 357/1 fail; mục §6 F8; thêm 2 action vào AccessAction" |
| Hàng mới 13-17 | 13 Live-source panels (C6) · 14 Activation-current (C7) · 15 F0 collection/get + `OperationalWorkflowV2` (C10, chưa có reader) · 16 Account sync/policy pages (C12) · 17 Sandbox/Canary parents + operation parents (C2, C3) |
| Gap check | Chạy lại lệnh CLAUDE.md §7.8: "chưa đọc" thêm `positive-parent`, `live-source`, `activation-current`, `instance-registration`, `f0-command-collection`, `capital-workflow`, `trusted-command-collection(s)`, `scoped-records`, `account-policy-metadata`. Slug `access` khớp quá rộng nên **false-negative** (báo đã đọc); dùng `portal.access-effective` |
| Ô "Not published" ngược | Board hàng 2 liệt kê FE-042/043 nhưng code S1 không render hai ô này |
