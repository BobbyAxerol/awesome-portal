# Round-start sync — Codex digest (Claude/FE), 2026-10-18

Rules §10.1 bước 1-5. Chỉ đọc: `git log/show/diff` trên `docs/research-loop-plan`; không checkout/sửa. Ghi vào `FRONTEND_BACKEND_SYNC.md` §0-§1 là việc kế tiếp (file này là nguồn).

## 0. Pin đã đọc

| Nguồn | Pin | Ghi chú |
| --- | --- | --- |
| Portal `docs/research-loop-plan` | `ac056d46` (2026-10-18 07:14Z), 19 commit trên base `0aad2697` (10-17 14:06Z → 10-18 07:14Z) | 230 file, +57k/-4.6k (đa số generated). Route census 294 → 299 (5 GET mới) |
| `claude/fe-parity` | `0796122e` trên `0aad2697` | Chưa rebase; không có commit nào của Codex đụng `design/`, `FRONTEND_BACKEND_SYNC.md`, Rules §9-§10 |
| PM (HK) theo Codex | `b9fae791` (clean, 10-18 06:06Z); các pin trước: `f02ebd78`, `afa1af81`, `768cc6c9`, `cc22e081`, `c080b4db`, `94822b53`, `66743c88`, `92a6a263` | Pin `673ce7cf`/`e62b6825` của FE-019 bị vượt; cần ghi lại pin mới, không dùng ngữ nghĩa PM từ pin cũ |
| Edge (HK) theo Codex | `20a1d27f` (07:03Z); owner WIP bẩn, 240 test cô lập NOT_DEPLOYED | Vẫn chỉ ở HK (FE-018 chưa đổi) |
| TS (HK) | Không có repin trong 19 commit; pin của tôi `c4819bc0` | Đọc lại khi gói được giao |

**Phát hiện cấu trúc:** nhánh Codex không chứa Rules §9-§10, `FRONTEND_BACKEND_SYNC.md`, hay `evidence/UXM-00`. Grep `ELP2-REQ-FE|FRONTEND_BACKEND_SYNC|claude/fe-parity` trong cây Codex = 0 kết quả. Mọi packet Codex vẫn ghi "no new Claude request/ACK found, UXM00-10 NOT_STARTED_BY_OWNER_DIRECTION". Tức FE-001..036 và UXM-00..05 chưa tới Codex (xem §6).

## 1. 19 commit (cũ → mới) và sức nặng với FE

| Commit | Gói | Public với FE? |
| --- | --- | --- |
| `609d11dd` | 06 PATH original proof qua score history | Không (không field mới) |
| `f734db9d` | 04 heartbeat reader + 10 native read transport | Có: `executionRetainedServiceHeartbeatsPageV1`; transport private |
| `f9034d52`, `233b217b` | 06 Composition original custody; dependent restatement | Có: `metric_family=COMPOSITION` trên score-view/score-revisions |
| `6a01686e`, `888d0171` | 06 Regime original; independent Regime worker + history | Có: `metric_family=REGIME`, migration 140 |
| `5cac1151` | 04 account sync pages + scoped capital command status | Có: `executionCapitalCommandCollectionV1` + 2 alias pages |
| `c730729e`, `43e877fd`, `0ccdc5ed` | 10 native read obligation/egress/lifecycle | Không (private, unmounted) |
| `005de29b` | 08 capital workflow receipt read | Có: `executionCapitalCommandWorkflowGetV1` |
| `da3a5f5c` | 04 account policy metadata | Có: `AccountPolicyMetadataValues` |
| `67e5ea66` | 04 exact-sharing / mixed Portfolio | Không schema; đổi tập/cursor Portfolio |
| `880a3d66`, `d9fc67fb` | 04 F0 intent detail + exact-own collection | Có: 2 GET `/operations/f0*` |
| `2c943e14`, `1b6df86e` | 09 native scoped_notice v2; frame coupled settlement | Không (DTO/cursor/ScopedRealtimeFrame giữ nguyên) |
| `49bdc6e1` | 04 Operations queue / workflow / Incident V2 | Có: 6 type V2, migration 141, fixture mới |
| `ac056d46` | 07/08 workflow read fences + captured governance identity | Có: workflow schema chặt hơn, fixture +296 dòng, migration 142 |

## 2. Hợp đồng/đọc mới hoặc đổi (FE-relevant)

Mức: **C** contract published (OpenAPI/schema/d.ts/fixture trong repo) · **L** code landed (commit hash) · **R** runtime qualified · **A** consumer accepted. Tất cả hàng dưới đây = C + L, **R=KHÔNG, A=KHÔNG**. Fixture đều `TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT` / `runtime_qualified=false`. "Source-dark" = route có mount trong code nhưng nguồn/ trust/ provider chưa cài (không có số thật). Đường dẫn d.ts/fixture tính từ `packages/contracts/`. Tái sinh: `npm --prefix packages/contracts run generate:<target>`; không sửa tay.

### 2a. Operations / Incident / F0 (`generated/execution-operations.d.ts`, `fixtures/execution-operational-current.synthetic.valid.json`, `…f0-command-collection…`)

| Route / operationId | Type (discriminate bằng `schema_version`) | Commit | Source-dark? |
| --- | --- | --- | --- |
| GET `/execution/operations` `listExecutionOperationsQueue` (oneOf legacy `OperationQueueResponse` / V2) | `OperationalQueueV2` + `OperationalQueueItemV2` (`portal.execution.operational-queue.v2`) | `49bdc6e1` | Có: `source_integration_state=UNAVAILABLE`, `source_as_of_ms=null` |
| GET `/execution/operations/{operation_id}` `getExecutionCommandOperationF0` (+ `getPaperExitDecisionOperation` thêm nhánh) | `OperationalWorkflowV2` (F0-backed; `provenance_basis` SQL_EXACT_SOURCE_TIMESTAMP / LEGACY_DATE_MILLISECOND_COPY) | `49bdc6e1` | Có |
| GET `/execution/operations/incidents/{incident_id}` `getExecutionIncidentDetail` (oneOf legacy `IncidentDetail` / V2) | `OperationalIncidentCurrentV2` (root-only, `historical_children` NOT_PUBLISHED / ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED) | `49bdc6e1` | Có |
| GET `/execution/compositions/operations`, `/compositions/incidents/{id}` | `OperationalQueueCompositionV2` / `OperationalIncidentCompositionV2`; `source_health`, `redacted_command_journal` UNAVAILABLE `CURRENT_AUDIT_SOURCE_PURPOSE_NOT_QUALIFIED`; `canary_twin_comparison` UNAVAILABLE `E5_CANARY_TWIN_COMPARISON_NOT_QUALIFIED` | `49bdc6e1` | Có |
| GET `/execution/operations/f0/{operation_id}` `executionF0BlockedOperationGetV2` | `F0BlockedOperationRead` (12 field, status BLOCKED, verification NOT_STARTED) | `880a3d66` | Có (không source call) |
| GET `/execution/operations/f0` `executionF0BlockedOperationsListV2` (workspace_id, resource_kind ACCOUNT/PORTFOLIO/DEPLOYMENT, resource_id, environment, limit 1..100 def 25, after) | `F0CommandCollection` (`F0_BLOCKED_INTENTS_ONLY`, `CURRENT_ACTOR_EXACT_RESOURCE_ONLY`; không total toàn cục; chỉ intent của chính actor) | `d9fc67fb` | Có |

Queue V2: grain **một `operation_id`** (`operation_kind=EXECUTION_COMMAND`, `command_key`, target ACCOUNT/PORTFOLIO/DEPLOYMENT). Hàng chỉ có `risk_tier, severity, source_authority, source_status, verification_result, triage_state, workflow_version, acknowledged_at, resolved_at, created/updated_at`. KHÔNG có actor, prose, evidence hash, ack/resolve by/reason, assignee, ladder, SLA. Filter: `triage_state, environment, source_status, verification_result, severity, target_type, command_key, target_id`, sort `created_at|operation_id`; `assigned_to=me` → **400**. Coverage `AUTHORIZED_SUPPORTED_TARGETS_ONLY`; đếm trước filter/page; `read_truth` AVAILABLE|EMPTY; không quyền → 404. Cursor kẹp µs; cursor cũ → context-mismatch (quay về trang 1). Ack/Resolve/Incident POST giữ nguyên (ADMIN-only, vẫn không có `ExecutionApi` method).

### 2b. Capital commands / workflow receipts (`generated/execution-trusted-commands.d.ts`, `execution-workflows.d.ts`)

| Route / operationId | Type | Fixture | Commit |
| --- | --- | --- | --- |
| GET `/execution/capital-commands` `executionCapitalCommandCollectionV1` (workspace_id, resource_kind ROOT/PORTFOLIO/DEPLOYMENT, resource_id, environment, limit 1..100, after) | `CommandCollectionQuery` → `CommandCollection` (items = `CommandStatus`, `TRUSTED_CAPITAL_COMMANDS_ONLY`, `EXACT_AUTHORIZED_RESOURCE_ONLY`; không total; 1024 + sentinel → 503 overflow) | `execution-trusted-command-collection.synthetic.valid.json` | `5cac1151` |
| GET `/execution/capital-commands/{id}/workflow` `executionCapitalCommandWorkflowGetV1` | `WorkflowCapital` (bốn trục trạng thái; `source_as_of_ms=null`, `observed_at_ms`=Portal đọc receipt; `public_copy_key`; amounts có thể `null` cho SET_ROOT_LIMIT/ADJUST_TARGET_BUDGET) | `execution-capital-workflow.synthetic.valid.json` | `005de29b`, siết `ac056d46` |
| (đã có) status GET, preview POST, submit POST, reconcile POST | không đổi route/DTO | `execution-trusted-commands.synthetic.valid.json` | — |
| Workflow Create/Lifecycle/Navigation/Confirmation | cùng field; thêm ràng buộc cấu trúc (864 tổ hợp 9 Create state; capacity provenance từng block) | `execution-workflows.synthetic.valid.json` (+296) | `ac056d46` |

Lỗi chung `CommandProblem`: 400/401/403/404/409/503 có type; `public_copy_key`/`safe_next_action` chỉ tùy chọn. 404 = unknown/hidden như nhau; 409 = quyền đổi, đọc lại; không retry bằng API legacy.

### 2c. Account / sync / metadata / heartbeat (`generated/execution-retained-review.d.ts`, `execution-scoped-records.d.ts`)

| Route / operationId | Type | Fixture | Commit |
| --- | --- | --- | --- |
| Named page `managerAccountSyncCurrentStatePageV1`, `managerAccountSyncSnapshotsPageV1` (retained operation page, không route mới) | 5 field công khai: account_id, currency, mode, status, updated_at (snapshots: created_at); `sync_id` private; mỗi alias đồng hồ riêng | (dùng fixture retained-page hiện có) | `5cac1151` |
| `managerAccountPoliciesPageV1` | `AccountPolicyMetadataValues` (account_id, mode giữ nguyên hoa/thường, venue, created_at, updated_at) | `execution-account-policy-metadata.synthetic.valid.json` | `da3a5f5c` |
| GET `/execution/technical/service-heartbeats` `executionRetainedServiceHeartbeatsPageV1` (environment bắt buộc, limit ≤200, after) | `ServiceHeartbeatsPage` + `ServiceHeartbeatObservation`: `capture_state` 6 giá trị; **`source_status=null`, `health=null`, `status_reason_code=SOURCE_STATUS_SEMANTICS_NOT_PUBLISHED`**; tên service ẩn (record_id ẩn danh) | `execution-scoped-records.synthetic.valid.json` (M) | `f734db9d` |

### 2d. Score / Composition / Regime history (`generated/execution-manager-models.d.ts`)

`executionManagerScoreRevisionGetV1` (`/manager/score-view`) và `…HistoryGetV1` (`/manager/score-revisions`) nhận thêm `metric_family=SCORE|COMPOSITION|REGIME` (mặc định SCORE, giữ nguyên). Type mới: `ManagerHistoricalComposition` (FUND/PORTFOLIO, allocation-bound), `ManagerHistoricalRegimeDetail/Entry/Result` (ALPHA/DEPLOYMENT; `status` supported|weak_support|out_of_support|insufficient_data|stale|unbound; `stage_breakdown.stage` = ResearchIS|ResearchOOS|ResearchValidation|Paper|Sandbox|Canary|Live; `evidence_kind` research_simulated|forward_simulated|actual). Luôn lịch sử, không phải Score/Regime tín hiệu hiện hành. Fixture: `execution-manager-composition-{original,restated,partial,no-allocation,history}…`, `execution-manager-regime-{original,restated,partial,missing-corpus,history,history-unavailable}…`. Commit `f9034d52`/`233b217b`/`6a01686e`/`888d0171`. Source-dark: có (không có manifest/source thật cài; ELP2-REQ-06-002 OPEN).

### 2e. Không đổi công khai (đã kiểm)

- **Manager dataset / Fleet / 360 / overview**: `ManagerDatasetQuery`/`Row` không đổi (không `window`, không `IN`, không text op, không `as_of_ms`, không lifecycle). Hành vi đổi duy nhất: `67e5ea66` sửa tập Portfolio theo exact-sharing (item thường thắng item bị hạn chế, không gộp field; total = visible-only; cursor Portfolio cũ vô hiệu).
- **Access/profile v2**: `manager_read_domains`, `ManagerDomainGrant` là private, "intentionally not exposed by access.controller/OpenAPI". Không route/field mới cho M10.
- **Scoped notice/frame (09)** và **native read (10)**: DTO `ScopedRealtimeFrame`, cursor, năm trạng thái không đổi; `EXECUTION_SCOPED_STREAM_NOT_COMMISSIONED` vẫn là refusal đúng. Không poll/stream mới cho FE.
- **Governance/Approvals**: queue/hàng duyệt không đổi; chỉ migration 142 khóa bất biến parent đã capture (Paper Exit, review-capture) và nhánh `OperationalWorkflowV2` trong union detail.
- Nhắc: môi trường viết **IN HOA** (`PAPER|SANDBOX|LIVE`) ở Operations V2/Incident nhưng **thường** (`paper|sandbox|live`) ở F0, capital collection, heartbeat; thời gian ISO µs (queue) vs epoch-ms (capital, heartbeat). Adapter phải chuẩn hóa tại biên.

## 3. Hộp thư Codex → Claude (mở)

Không có `ELP2-REQ-*` mới. Mọi mục dưới đây là request cũ, chỉ được thêm handoff mới. Tất cả `AWAITING_CONSUMER_REVIEW`, "Bobby assigns" (chưa giao FE code). Không ai ghi ACK.

| ID | Locator | Nội dung | Class / khi nào |
| --- | --- | --- | --- |
| ELP2-REQ-00-001 | `ELP2-00/decisions-and-handoff.md:56` | UXM-00 audit (1280/660, deep link, idle request) với pin source+bundle+API | **ACT_NOW (ghi sổ)**: UXM-00 đã làm ở `evidence/UXM-00/README.md` nhưng browser audit `BLOCKED_NEEDS_PIN`; Codex chưa thấy. Báo trạng thái thật cho Codex qua SYNC |
| ELP2-REQ-04-010 | `ELP2-04/contract-handoff.md` (+ `closeout-2026-10-16.md:208`, `f0-current-audit-read.md#additive-consumer-handoff`, `heartbeat-public-reader.md#contract-and-future-claude-handoff`) | Nối DTO V2: F0, queue/workflow/incident V2, capital collection, account sync/policy, heartbeat; ACK ACCEPTED/CHANGES_REQUESTED với pin+fixture tách khỏi browser thật | **NEXT_GATE** (G0 UXM-07/08). Phải diễn giải thành thay đổi thiết kế trước (§5) |
| ELP2-REQ-05-002 | `ELP2-05/README.md:105` | `PublicationCatalogue`/`ManagerPublicationManifest` | INFO (không đổi vòng này) |
| ELP2-REQ-06-001 | `ELP2-06/coverage-and-handoff.md` §5 | UXM-08 Manager named reads; vòng này thêm COMPOSITION/REGIME history (§2d) | NEXT_GATE (UXM-08/M05 Explain, Regime fit) |
| ELP2-REQ-08-001 | `ELP2-08/capital-workflow-read.md#claude-handoff--consumer-changes`, `workflow-parity-and-read-fences.md#claude-handoff--exit--next--remaining-debt` | Receipt vốn thật + 9 Create state; không tự gửi lại khi UNKNOWN; map `public_copy_key` | NEXT_GATE (M04 ledger/Allocation, §6 FE-032) |
| ELP2-REQ-09-001 | `ELP2-09/coverage-and-handoff.md:105` | Map `ScopedRealtimeFrame`, không biến notification thành replay | INFO |
| ELP2-REQ-10-001 | `ELP2-10/coverage-and-handoff.md:148` | Null/zero/methodology, đo build 1280/660, idle fanout | NEXT_GATE (UXM-10) |
| ELP2-REQ-10-002..007 | `ELP2-10/commissioning-followthrough.md` | Codex tự đặt cho ops/security nội bộ | INFO |
| Rules §7.3 "Recurring Claude review intake" | `AGENT_WORKING_RULES.md` (Codex), thêm ở `f734db9d` | Codex sẽ ghi disposition cho review/request của Claude trong packet sở hữu; cần ID gốc + locator + revision | **ACT_NOW (điều kiện)**: FE-001..036 chưa vào ledger của họ (§6) |

## 4. FE-001..036 so với việc Codex vừa giao

| ID | Trạng thái | Cơ sở |
| --- | --- | --- |
| FE-001 handoff spec | PARTLY | Mỗi packet Codex nay có operationId, type, fixture, lane `TEST_ONLY_SYNTHETIC`, lỗi `CommandProblem`, lệnh regenerate, nhưng thiếu `producer_sha` bảng, manifest fixture, bảng bất biến chéo (RV-1). Tốt nhất: `ELP2-04/contract-handoff.md` §2 |
| FE-002 stage map | NOT DELIVERED, thêm dữ kiện | Regime dùng `ResearchIS…Live`; `stage_filter` dùng `PAPER|SANDBOX|CANARY|LIVE`; chưa có bảng `LIVE_CANARY/LIVE_FULL` |
| FE-003..006, 017, 018 | Không đổi | không commit nào đụng |
| FE-007 | Không đổi | dataset không đổi |
| FE-008 text search | Không đổi | queue V2 chỉ `eq` (applied_filters op "eq"); `command_key`, `target_id` là eq |
| FE-009 1 MiB | PARTLY | History: byte-shortened page giữ continuation; command collection: 1024/1025 → 503 overflow, ceiling 1 MiB; dataset chưa nêu |
| FE-010, 011, 012, 013, 014 | Không đổi | (014: Portfolio cursor đổi, không thêm directory/All) |
| FE-015 disabled-control reason | PARTLY, vẫn thiếu | `CommandProblem.public_copy_key/safe_next_action` tùy chọn; preview `allowed=false`+typed reason (có từ ELP2-07 trước base); chưa có `reason_class/grant_ref/step_up_required` |
| FE-016 | Không đổi | |
| FE-019 pin PM | MOOT, cần ghi pin mới | PM `b9fae791`; Codex chưa nói gì về `673ce7cf` vs `e62b6825` |
| FE-020 preview | PARTLY (trả lời cho capital) | CÓ `executionCapitalCommandPreviewV1` (từ ELP2-07, `ELP2-07/coverage-and-handoff.md` §2); chưa có "what changes" cho quyết định governance (FE-030) |
| FE-021 audit source | CONTRADICTED một phần | `audit.read` (TS-accepted) nay là quyền cổng cho F0/queue/status, nhưng queue V2 cố ý bỏ actor/prose; journal nguồn UNAVAILABLE (`CURRENT_AUDIT_SOURCE_PURPOSE_NOT_QUALIFIED`). Không có audit feed "ai làm gì" |
| FE-022 | Không đổi | |
| FE-023..026, 028, 029, 033, 035, 036 | Không đổi | |
| FE-027 lifecycle read | Không đổi | Regime `stage_breakdown` là hỗ trợ bằng chứng, không phải lịch sử stage của alpha-version |
| FE-030 decision cockpit | CONTRADICTED về nguồn | Queue V2 không có creator/ladder/SLA/needs_you; F0 collection chỉ là intent của chính actor; không có decision-call hợp nhất |
| FE-031 event feed | CONTRADICTED một phần | Incident V2 `historical_children` = NOT_PUBLISHED; F0/capital collection chỉ là danh sách theo resource, không có feed tổng hợp |
| FE-032 capital flow/ledger | PARTLY | Có danh sách `CommandStatus` theo resource + `WorkflowCapital` receipt (non-amount được phép, `null` không phải 0); chưa có edge/seq/ledger page |
| FE-034 archive read | Không đổi | |

Tóm: delivered 0; partly 5 (001, 009, 015, 020, 032); contradicted/giảm kỳ vọng 3 (021, 030, 031); moot 1 (019); 27 còn lại không đổi (002 có thêm dữ kiện).

## 5. Dữ kiện thay đổi giả định của thiết kế V2

| # | Giả định trong thiết kế | Sự thật mới (locator) | Việc FE |
| --- | --- | --- | --- |
| 1 | M09 queue có Mine, assignee, ack/resolve by/reason/evidence hash (R1, R3) | Queue V2: không các cột đó; `assigned_to=me` 400 (`current-operational-parents.md`, `listExecutionOperationsQueue` mô tả) | Thiết kế hai biến thể theo `schema_version`; V2 ẩn Mine/assignee, hiện `acknowledged_at/resolved_at`; Ack/Resolve vẫn ADMIN-only. **ACT_NOW** (sửa `operations.html`, `incident.html`, review2/04) |
| 2 | Grain = `operation_id`, không phải request (R3) | Xác nhận: queue = một hàng/ `operation_id` immutable Portal root; capital command = `command_id` (`ecm_…`); governance approval là grain khác; không có queue hỗn hợp (`finite-account-command-readers.md` "not the mixed queue") | R3 đóng; M09 phải hợp nhất ≥3 nguồn ở client, mỗi nguồn nhãn lane/grain riêng |
| 3 | Incident drawer có state rail, evidence, annotations, timeline, correlated ops | V2 chỉ root hiện hành (state OPEN/MITIGATED/RESOLVED, timestamps, target, severity, version); children NOT_PUBLISHED; "MITIGATED/RESOLVED là triage cục bộ, không phải an toàn broker" | Drawer V2 = root + panel "Not published"; không vẽ timeline; **ACT_NOW** |
| 4 | Source health/Canary twin/journal panel theo profile | Cả ba UNAVAILABLE có reason_code trong V2 composition | Dùng đúng reason code, không "healthy" mặc định |
| 5 | Heartbeat = health dịch vụ (Ops, M01 attention) | `health=null`, `source_status=null`, tên service ẩn | Không suy sức khỏe từ timestamp; chỉ hiển thị `capture_state` |
| 6 | Receipt vốn luôn có bảng chia 5 phần | `amounts` null được phép (đã có SYNC §0); thêm: `source_as_of_ms=null` ≠ unknown, `observed_at_ms` ≠ source freshness; ACK≠APPLIED≠filled | Cập nhật Allocation/Receipt mock; không retry khóa mới khi UNKNOWN |
| 7 | Lệnh vốn nằm trong một "ledger" | Có danh sách theo exact resource (ROOT/PORTFOLIO/DEPLOYMENT), cursor ký, không tổng toàn cục, 503 khi >1024 | M04 ledger hiển thị "exact resource" + overflow; M09 ACCOUNT không phải resource lệnh vốn |
| 8 | Một danh sách F0 chung | F0 collection chỉ intent **của chính actor** trên một resource; không dùng cho người khác/toàn cục | Nhãn "Your blocked intents"; không đặt trong queue chung |
| 9 | M05 Explain: Score/Regime hiện hành | Regime/Composition/Score history có `metric_family`; mọi giá trị là lịch sử ORIGINAL/RESTATED, `operational_current=false` | Tab "History" riêng, không gộp vào card hiện hành |
| 10 | Stage chips chung | Ba bộ từ vựng: `PAPER…LIVE` (filter), `ResearchIS…Live` (Regime), `LIVE_CANARY/LIVE_FULL` (V1) | FE-002 vẫn mở: dựng bảng ánh xạ nội bộ có test |
| 11 | Chạy được với Portfolio list như trước | Cursor Portfolio cũ vô hiệu; `profile_dispositions` giải thích đọc một phần; mixed purposes giữ nguyên "item thường thắng" | Xử lý 409/cursor sai bằng đọc mới, không cắt cursor |

## 6. Chỉ số tiến độ theo Codex (Unified §14 + packet README, 2026-10-18T07:14Z)

Unified không có bảng riêng từng UXM. Bảng đầu §14 (dòng 9366-9368, cũ) vẫn ghi "Claude UXM-00…10 RULES_READY; browser audit/new design/implementation not performed" và "08…11 NOT_STARTED" — đã lạc hậu so với đuôi tài liệu. Cuối tài liệu (11425+) lặp lại cùng câu: `UXM00–10 NOT_STARTED_BY_OWNER_DIRECTION / AWAITING_CONSUMER_REVIEW`, "no Claude acknowledgement observed".

| Hàng | Codex ghi | Thực tế phía FE (nhánh tôi) |
| --- | --- | --- |
| UXM-00 | NOT_STARTED / AWAITING (ELP2-REQ-00-001 OPEN) | Audit tài liệu có (`evidence/UXM-00`), browser audit `BLOCKED_NEEDS_PIN` |
| UXM-01, 02 | NOT_STARTED | IA/dictionary/journeys đã viết (`design/UXM-01…`, `UXM-02…`) |
| UXM-03, 04, 05 | NOT_STARTED | Lowfi M01-M10 + V2 kit 19 màn có; chờ Bobby duyệt flow |
| UXM-06 | NOT_STARTED | HIFI M01-M10 + concepts C1-C4 có, chưa duyệt, chưa có "exact HiFi revision" liên kết vào Unified |
| UXM-07 | NOT_STARTED | Không có code |
| UXM-08, 09, 10 | NOT_STARTED; chờ sources | Không (đúng) |
| ELP2-04 | 04-008/009 PARTIALLY_DELIVERED (F0, queue/incident V2, 3 alias, heartbeat); 04-010 chờ FE | |
| ELP2-06 | History + Composition + Regime landed local; 06-002 OPEN (source/config/ALL) | |
| ELP2-07 | 8 capital candidate; source-dark; 07-001 OPEN | |
| ELP2-08 | workflow read landed; full08 OPEN (family producers, browser) | |
| ELP2-09 | frames/hub local; full09 `NOT_MET_SOURCE_PROPAGATION_BROWSER` | |
| ELP2-10 | NOT_MET (14 budgets, calibration, coexistence, P184G2) | |
| ELP2-11 | NOT_ENTRY_READY | |

Gói kế của Codex: các parent/technical alias còn lại, producer cho family lệnh còn thiếu, source adapter/factory thật. Không có gói nào chờ FE trừ 04-010/08-001/09-001/10-001 (đều "Bobby assigns").

## 7. Việc cần làm đầu round

| Class | Việc |
| --- | --- |
| ACT_NOW | (a) Ghi pin mới vào SYNC §0 (`ac056d46`, PM `b9fae791`, Edge `20a1d27f`). (b) Sửa giả định #1/#3/#4 trong `operations.html`, `incident.html`, review2/04, UXM-01 (V2 queue/incident hẹp, `assigned_to=me` 400). (c) Báo Bobby: nhánh Codex thiếu Rules §9-§10, SYNC, UXM-00; Codex ghi "no Claude request" nên FE-001..036 chưa vào ledger §7.3. Cần đường nào đó đưa SYNC + ELP2-REQ-00-001 status tới `docs/research-loop-plan` hoặc xác nhận Codex đọc `claude/fe-parity`. (d) Rebase `claude/fe-parity` lên `ac056d46` trước G0 (Rules §10.1 pin cũ). |
| NEXT_GATE | Regenerate types (tooling) trước mọi fixture UXM-07; thêm fixtures V2 vào manifest `FIXTURE_LAB`; viết adapter chuẩn hóa case env + thời gian; trả lời 04-010/08-001 khi Bobby giao UXM-07/08; thêm hàng reason mã (CommandProblem) vào D9 dictionary. |
| INFO | Dataset/Fleet/360/M10 access/scoped frame không đổi; FE-007/011/012/025 vẫn chờ Codex. |

Gap cấu trúc mới cho SYNC (đề xuất, chưa gửi): (G-A) cột reason cho disabled-control; (G-B) lifecycle read (FE-027) cần đi cùng Regime stage taxonomy; (G-C) hỏi Codex bảng case env. Không thêm ID mới trước khi Bobby duyệt.
