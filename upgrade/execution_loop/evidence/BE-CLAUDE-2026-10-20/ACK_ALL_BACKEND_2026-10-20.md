# ACK toàn bộ backend còn lại — Claude, 2026-10-20

**Disposition:** `ACK_WRITTEN / ACCEPTED_WITH_CHANGES` (Core009: 3 điều chỉnh của Edge, §5). Không phải phase PASS, không phải ACK của Bobby (Rules §10.3), không phải source/owner acceptance.
**Người viết:** Claude (backend writer + consumer). **Tầng:** R0 (chỉ Markdown; không chạy gate sản phẩm, không runtime, không secret). **Trả lời:** "First return requested from Claude" của
`/home/bobby/portal-research/upgrade/execution_loop/evidence/ELP2-10/CLAUDE_ALL_BACKEND_HANDOFF_2026-10-20.md` (đọc read-only ở đường dẫn tuyệt đối; sha256 `7da2f79a1d9635fcdd244470be7bb5de61e328b1f93e0aec4545b965effda112`, 335 dòng) và
[Core009 priority handoff](../ELP2-10/CLAUDE_CORE009_PRIORITY_HANDOFF_2026-10-20.md) gồm revision 2 + phần Edge handback (sha256 hiện tại `f178947d7bc4a00c5a9feb07eee923f419c03b18a2c55769492e9471664c3d07`; raw hash `ccdfb4d7…` trong handoff là bản trước khi Edge nối thêm).
Ba tài liệu đề xuất đi kèm (không sửa file của Codex): [SYNC](SYNC_UPDATE_PROPOSAL_2026-10-20.md), [Unified](UNIFIED_UPDATE_PROPOSAL_2026-10-20.md), [Source Truth Board](SOURCE_TRUTH_BOARD_PROPOSAL_2026-10-20.md), [yêu cầu cho source owner](REQUESTS_FOR_SOURCE_OWNERS_2026-10-20.md).

## 1. Pin và trạng thái WIP

| Mục | Giá trị | Ghi chú |
| --- | --- | --- |
| Cây này (peer, `claude/fe-parity`) | `e1f3938e76a03ca79ae81a801463d45fc7017ff0` (nội dung đã đọc; bắt đầu round ở `be6d98d1`, ref tiến 6 commit trong lúc đọc; khi commit ACK này đã rebase lên `e8e5f571`, thêm tài liệu T10 `2325dd94` và copy capture `e8e5f571` — không ảnh hưởng gate nào ở đây) | `git status` sạch lúc bắt đầu, không untracked; 259 commit trên `7818d563`; commit cuối của round là BE-P10 Revision 3 (Edge 3 điều chỉnh, §5) |
| Pin trong handoff | peer `e4383f22` (ahead183) → `b7a43d63` (ahead187) | đều là tổ tiên của cây này |
| Core (`docs/research-loop-plan`) | `7818d5631e0da37563bca5715fd46d40b66ef1de` — ref đọc từ kho đối tượng dùng chung lúc viết, **WIP chưa commit của Core/Edge không thấy được, Core HEAD có thể đã đi tiếp** | là tổ tiên của cây này; image cài `sha256:7b2c7f34…` build từ `7818d563` nên **không chứa** BE-P6…P10 |
| Edge (`feat/execution-edge-upgrade-v1_2`) | handoff pin `0af33fdf`; các publication sau theo Core009 handoff: `e2f337a4`, `e37a5e39`, `6e8f7f2d`, `e766034c` | chỉ đọc qua Markdown; lấy pin cuối sau publication, không chạy draft |
| PM (`feat/portfolio-account-v1_1-parallel`) | `73473c91` (handoff) | không sửa hộ; descriptor #18 PREPARED_NOT_RUN |
| WIP của người khác | Core: các Markdown WIP (`UNIFIED_IMPLEMENTATION_PLAN.md`, `FRONTEND_BACKEND_SYNC.md`…) không đụng; BE-P11/P12/P13: **đang được writer khác viết, chưa có file trong cây này** | không `stash`/`reset` canonical; chỉ ghi dưới `evidence/BE-CLAUDE-2026-10-20/` |

Gate: ordinary hook R2/R3 **NOT_RUN** cho mọi BE-P (mỗi ledger BE-P tự ghi NOT_RUN; commit BE-P dùng `-c core.hooksPath=/dev/null`); PostgreSQL-backed specs **NOT_RUN** (không có `TEST_DATABASE_URL`); `REAL_READ_RETAINED` và `REAL_READ_QUALIFIED` **NOT_RUN** (image cài không phục vụ route mới; nguồn tài chính MISSING).

### Mức gate dùng trong mọi tài liệu của round này

| Mức | Nghĩa ở đây | Chưa có nghĩa |
| --- | --- | --- |
| `SOURCE_ONLY` | mã/contract đã commit, test focused chạy trên fake/in-memory | không có consumer/fixture đối chiếu, chưa PG, chưa image |
| `FIXTURE_VERIFIED` | schema + generator `--check` + `contracts-test.sh` (Docker) hoặc test focused xanh **và** reader/màn FE đã đọc fixture canonical (`FIXTURE_LAB`) hoặc double (`BFF_DOUBLE`) | hook R2/R3, PG, image cài, nguồn thật |
| `INSTALLED` | image/config/policy đã cài và đọc lại trên runtime Research | chưa có đọc kết nối nguồn |
| `CONNECTED_VERIFIED` | READ/STREAM thật + revoke/cursor/replay có tương quan receipt | chưa có owner accept |
| `OWNER_ACCEPTED` | Codex producer receipt ACCEPTED + source owner/Bobby xác nhận | — |

Kết quả hiện tại: **không có gì đạt `INSTALLED`, `CONNECTED_VERIFIED` hay `OWNER_ACCEPTED`.** Đếm gói: `FIXTURE_VERIFIED` 8 (BE-P1…P8), `SOURCE_ONLY` 2 (BE-P9, BE-P10), đang viết 3 (BE-P11…P13, chưa đánh giá).

## 2. Gói BE-P đã có, SHA gốc → SHA đã vào cây này, file sở hữu

SHA khớp theo **subject** (không tính patch-id); ledger của từng gói giữ SHA gốc. Chi tiết gate/NOT_RUN: ledger tương ứng.

| Gói | Phạm vi (ID) | SHA gốc → landed | File sở hữu (thư mục) | Mức |
| --- | --- | --- | --- | --- |
| [BE-P1](BE-P1.md) | MD-1…MD-8 | `0189c2aa`→`2179c771`, `1120b01a`→`85bc5e15`, `5a5a28d4`→`cff42287`, ledger `470dd1d2` | `control-api/src/execution-v2/manager-dataset-invariants.ts`, `manager-model.contract.ts`, `manager-query-p1*`; `contracts/tooling/execution-manager-p1-*`; FE `managerDataset.conformance` | `FIXTURE_VERIFIED` |
| [BE-P2](BE-P2.md) | FE-067/071/072/070 | `7591dca0`→`642a7ab9`, `53630719`→`3088be07`, `61245988`→`8cb0eb61`, `a25d50cb`→`8a9f9569`, ledger `53f91258` | `control-api/src/execution/{stage-facts*,canary-envelope-facts,stage-rows,venue-calendar}.ts`; `contracts/.../generate-execution-stage-facts.mjs` | `FIXTURE_VERIFIED` (thân V1; SCOPED_V2 chưa) |
| [BE-P3](BE-P3.md) | FE-066, S3-U1…U5 | `1ac72a26`→`aa1c91d3`, `61194261`→`02ab03a0`, `6484c595`→`57b2d3ce`, `8199d6ef`→`77eea7d5`, ledger `a3f29234` | `execution/deployment-identity*`, `paper-read/positions-by-side.ts`; schemas `execution-{financial-chart,alpha-resource,subject-records,observed-timeline,market-candles}` | `FIXTURE_VERIFIED` |
| [BE-P4](BE-P4.md) | FE-027/012 scalars, FE-013/033 series | `4ecef0f8`→`b9d1de8b`, `9fca133e`→`e8fd3c2c`, `e6eb15c9`→`58b88c6c`, ledger `1d4be13d` | `execution-v2/manager-lifecycle.ts`, `manager-series*.ts`; schemas `execution-manager-series*` | `FIXTURE_VERIFIED` (nguồn series MISSING) |
| [BE-P5](BE-P5.md) | FE-062/063/068/069 | `6cd24760`→`7f45f663`, `de4ebb4c`→`8d725f1a`, `a74f6456`→`e2199885`, `f48a97c6`→`19478d73`, ledger `fa277f97` | `execution-v2/pending-control*`, `self-eligibility.ts`; `governance/{stage-action-eligibility*,approval-request-lookup}.ts` | `FIXTURE_VERIFIED` |
| [BE-P6](BE-P6.md) | MD-5 canonical zero | `2aeb444d`→`a7094697`, ledger `c23be17a`; FE oracle `5152cee3` | `manager-dataset-invariants.ts`, `manager-series.ts`; schemas dataset/series | `FIXTURE_VERIFIED` |
| [BE-P7](BE-P7.md) | FE-015/060/068, FE-037/058, FE-057/058/038 | `10149b66`→`034c463f`, `594c298f`→`29ec3ef9`, `1449455e`→`41a72ba4`, ledger `5f75fd08` | `execution-v2/{access.service,access.controller,self-eligibility,self-context,step-up-family}.ts`, `governance/capture-authority.ts`, `repos/account-lifecycle.ts` | `FIXTURE_VERIFIED` (PG NOT_RUN) |
| [BE-P8](BE-P8.md) | FE-013 invariants; MD-4/FE-065 review; ELP2-REQ-06-002 checklist | `9e219e44`→`b69a919e`, ledger `fb97e846` | `manager-series*.contract.ts`, `manager-series.ts`; schemas series | `FIXTURE_VERIFIED` (checklist: tài liệu) |
| BE-P9 (không có `BE-P9.md`) | Core009 preparation (validator, template, readback SQL, runbook rev 1, PREPARED return) | `2062fcdc`→`85fc86b8`; docs `10de713e`, `4972daec` | `execution-v2/{core009-preparation,native-core-runtime,core-owner-commissioning}.ts`, `cli/core009-validate.ts`, `deploy/research-preview/native-core-templates/`; [CORE009_PREPARATION](../ELP2-10/CORE009_PREPARATION_2026-10-20.md), [PREPARED return](../ELP2-10/CORE009_PREPARED_OWNER_RETURN_2026-10-20.md) | `SOURCE_ONLY` |
| [BE-P10](BE-P10.md) | Core009 Plan B, revoke chính thức, session issuer/revoker; **Revision 3** | `cfade7cc`→`f1d18dc5`, `630d5fdf`→`110bb875`, `d5983721`→`5ae9e17e`, docs `0deeee70`; rev 3: `6fa94980`→`b70f8f77`, `e04f1684`→`4b2b76e0`, `6111eb39`→`81e8a546`, `be83e7fb`→`a0e545e9`, `32c0d6eb`→`7abacd69`, ledger `e1f3938e` | `execution-v2/{manager-domain-revoke,private-root-file,owner-target,research-acceptance-session}.ts`, `cli/execution-native-{revoke,install,session}.ts`, `auth/auth.service.ts`, `r2_ledger/persistence-ownership.v1.json` | `SOURCE_ONLY` |
| BE-P11, BE-P12, BE-P13 | Core009 điều chỉnh của Edge (BE-P11 theo brief) và các gói khác | **đang viết, chưa có file** | — | chưa đánh giá |

Gói **chưa** thuộc BE-P nào (nhóm C/D của handoff, §4): SCOPED_V2 stage subtrees (R-1/R-2), `getManagerDataset` đã nối Fleet (FE) nhưng nguồn thật chưa, writer `precomputed_series`, các family command còn lại của ELP2-07, qualification ELP2-10.

## 3. Disposition theo ID

Cột: **Implemented** = backend/contract đã có (gói, SHA landed); **Consumed** = FE đã đọc/nối; **Tested** = mức gate cao nhất đạt · lane; **Pending** = còn thiếu (chủ). `—` = không có bằng chứng giao hàng trong các file đã đọc (trạng thái giữ như sổ SYNC: OPEN).
Không dòng nào đạt `INSTALLED`/`CONNECTED_VERIFIED`/`OWNER_ACCEPTED`; `REAL_READ_*` NOT_RUN ở mọi dòng.

### 3.1 FE-005 … FE-043 (Manager, shell, stage lifecycle)

| ID | Implemented | Consumed | Tested | Pending (chủ) |
| --- | --- | --- | --- | --- |
| FE-005, FE-009, FE-010 | Codex: totals null+lý do, trần 1 MiB/200 nhóm, `statement_scope`; BE-P1 MD-1…8 siết | dataset reader 25/25 key; Fleet in `statement_scope` | `FIXTURE_VERIFIED` · BFF_DOUBLE | nguồn tài chính chuẩn hoá MISSING (PM/Edge/Core, ELP2-REQ-06-002); KPI có lọc FE-010 chờ quyết định |
| FE-006 | CHANGES_REQUESTED của Codex: `methodology_ref` theo nguồn; series mang `methodology_ref` (BE-P4/P8) | caption series | `FIXTURE_VERIFIED` · FIXTURE_LAB | methodology registry/grammar (Core/Edge); Modified-Dietz vs TWR (TS) |
| FE-007, FE-022 | — | — | — | OPEN (Codex/PM/Research) |
| FE-008, FE-014, FE-036, FE-055 | Codex: `q`/`q_mode`, `environment`, current-only, stream schema | đã nối | `FIXTURE_VERIFIED` · BFF_DOUBLE | đã đóng phía FE (SYNC priority §4) |
| FE-011 | — (Score số giữ cho sort; policy pending) | cột Score `Not published (FE-011)` | — | Score config/calibration (Bobby/Codex, T10-13) |
| FE-012 | BE-P4 `current_stage` trong sort+group (`b9d1de8b`) | Fleet dataset mode (`0e39e684`) | `FIXTURE_VERIFIED` · BFF_DOUBLE | đọc thật NOT_RUN; Cockpit/Portfolios không có điều khiển để nối |
| FE-013 | BE-P4 series (`e8fd3c2c`) + BE-P8 metric↔unit, `ratio_scale` (`b69a919e`) | Overview NAV/MeasureSeg, Portfolio 360, Compare | `FIXTURE_VERIFIED` · BFF_DOUBLE | mọi profile trả `SERIES_SOURCE_NOT_PUBLISHED`; writer `precomputed_series` + 12 đầu vào (SRC-F, [requests](REQUESTS_FOR_SOURCE_OWNERS_2026-10-20.md)) |
| FE-015 | BE-P5 batch + BE-P7 `CAPITAL_COMMAND` step-up (`034c463f`), batch v2 | reader `accessSelfBatch`/`accessStepUp`, cockpit StepUp (mount PARTIAL: chưa có target vốn) | `FIXTURE_VERIFIED` · BFF_DOUBLE | PG: 2 test `elp2-access-transaction` NOT_RUN; Q1…Q3 của Codex (BE-P7 §7); copy cho Bobby |
| FE-016, FE-035 | — | `Not published (FE-016)`/map | — | quyết định P3 (Codex/Bobby) |
| FE-017 | MD-2/MD-8 siết partition/headline | Account/Overview `Not published (FE-017)` | `FIXTURE_VERIFIED` · FIXTURE_LAB | bảng ánh xạ tên metric statement (PM+Portal) |
| FE-018, FE-019 | không phải việc FE; FE-019 hết hiệu lực (PM pin đổi) | — | — | Codex/Bobby (pin có version) |
| FE-020 | UXM-09 lane fixture (reader `commandOperation`, story) | story `/execution/command` | `FIXTURE_VERIFIED` · FIXTURE_LAB | plan/preview cost+impact có đơn vị; F0 apply body (Codex+PM); đọc thật NOT_RUN |
| FE-021, FE-023, FE-024, FE-029, FE-031, FE-034 | — | các ô `Not published (FE-0xx)` | — | OPEN (nguồn audit/search/feed/baseline/events/archive: Codex+TS+PM) |
| FE-025, FE-041 | Codex: `window`; BE-P1 MD-4 (preset không publish → `resolved:null`) | `selected_window`, `windowLock` gỡ khi server hỗ trợ | `FIXTURE_VERIFIED` · BFF_DOUBLE | cửa sổ chính xác 7D/30D/90D và ALL (`ALL_HISTORY_WINDOW_NOT_PUBLISHED`): PM/Edge; Codex ACCEPTED cho MD-4 |
| FE-026 | — | `Not published` | — | Bobby/Codex: ma trận trường researcher |
| FE-027 | BE-P4 `current_stage` published; `entered_at_ms`/`days_in_stage` = `NOT_PUBLISHED` `STAGE_ENTRY_TIME_NOT_PUBLISHED` | Fleet (cột current stage; "In stage" `Not published`) | `FIXTURE_VERIFIED` · BFF_DOUBLE | stage timeline PM §58.154 / effective-stage journal; `gate_state` và ordered transitions (cùng FE-028) |
| FE-028, FE-030 | Codex PARTIAL (R2/Paper Exit parent có criteria/actors) | Cockpit `EvidenceFrame` | `FIXTURE_VERIFIED` · FIXTURE_LAB | criteria[] thống nhất, ladder/SLA/needs-you (Codex+TS) |
| FE-032, FE-046 | Codex: ledger continuation có chặn, `CommandStatus` capital; UXM-09 yêu cầu thêm | Portfolio 360 ledger | `FIXTURE_VERIFIED` · FIXTURE_LAB | lý do source reject, bit `replayed`, venue partial qty, tra theo idempotency key (UXM09) |
| FE-033 | Codex `IN` + BE-P4 `comparison` (`e8fd3c2c`) | Compare ALIGNED/INCOMPARABLE | `FIXTURE_VERIFIED` · BFF_DOUBLE | nguồn series MISSING |
| FE-037 | BE-P7 `account_operations` typed absence (`41a72ba4`); token `execution.accounts.manage` bỏ | `d4bfcae0` | `FIXTURE_VERIFIED` · BFF_DOUBLE | OWNER_DECISION: Codex/Bobby xác nhận bỏ token; tên `execution.*` còn lại theo projection |
| FE-038 | BE-P7 `GET /self-context` + `self_entry.route` `/administration/my-access` | route + rail entry (`9c90e68a`) | `FIXTURE_VERIFIED` · BFF_DOUBLE | registry rev 7 `PROFILE_ACCESS_SELF` (Codex; đề xuất JSON trong consumer-receipt-be-p7 §6) |
| FE-039 | — | — | — | registry rev 7 ẩn APPROVALS cũ (Codex) |
| FE-040, FE-042, FE-043 | B2 Dockerfile ARG; B1 `incident_links`, `status_counts` (ACCEPTED_FOR_INTEGRATION) | Operations render | `FIXTURE_VERIFIED` · BFF_DOUBLE | PG-backed specs Codex; M2 đếm khi chậm |

### 3.2 FE-044 … FE-072 và S3-U1…U5

| ID | Implemented | Consumed | Tested | Pending (chủ) |
| --- | --- | --- | --- | --- |
| FE-044, FE-045, FE-052 | Codex reader-batch 2026-10-19 (q/env/cursor, `portfolio_id` nullable, Blotter 4 filter) | không có consumer receipt trong các file đã đọc | — (chưa xác minh phía FE) | consumer receipt (Claude); fill/fee facts của order (nguồn) |
| FE-048, FE-050, FE-053 | — | — | — | OPEN (D4 stage_counts 0; bindings; Users last sign-in) |
| FE-049, FE-056, FE-061 | `CLAUDE_DELIVERED` (schema Decimal, operator-task text, closed error vocab) | — | `FIXTURE_VERIFIED` · FIXTURE_LAB | Codex review |
| FE-051 | S3-U4 quantity theo instrument; notional bị chặn E5 | Paper Positions | `FIXTURE_VERIFIED` · FIXTURE_LAB | account A360-1…4 chưa làm; notional OWNER_DECISION |
| FE-054 | exact-decimal đóng; timeline outcome chưa | — | — | observed timeline thiếu status/outcome (Codex) |
| FE-057 | Codex `observed_at_ms`/`valid_until_ms` + BE-P7 self-context | `a68f17a6`, `fcb1f9c2`, `84f0ee53` | `FIXTURE_VERIFIED` · BFF_DOUBLE | đọc thật NOT_RUN; Q focus-fetch (Codex) |
| FE-058 | BE-P7 route + rail; 4/7 mục theo thiết kế | shell W1/W3, rail entry | `FIXTURE_VERIFIED` · BFF_DOUBLE | quyết định chung: màn đọc cap đã gộp hay server từ chối (screen-local `execution.*`) |
| FE-059, FE-060 | BE-P5 batch + BE-P7 `challenges[2]` | reader ACCEPTED; cockpit PARTIAL | `FIXTURE_VERIFIED` · BFF_DOUBLE | nối laneModel vào mọi màn có hành động vốn |
| FE-062 | BE-P5 `GET /pending-recalls` (`8d725f1a`) | dock `PendingRecallsSection` | `FIXTURE_VERIFIED` · FIXTURE_LAB | first-control discovery cần PM remainder read (`RECALL_REMAINDER_SOURCE_READ_NOT_QUALIFIED`); `expected_versions` prefill chưa có form |
| FE-063 | BE-P5 `recipient_account_id` (`7f45f663`) | reader ACCEPTED | `FIXTURE_VERIFIED` · FIXTURE_LAB | status chưa có màn riêng |
| FE-065 | không thu hẹp ở Portal (BE-P8 khuyến nghị) | FE từ chối bidi/zero-width | — | **PM** nêu ngữ pháp/từ vựng currency (SRC-C) |
| FE-066 | BE-P3 5 key identity (`aa1c91d3`) | 4 màn stage (thân V1) | `FIXTURE_VERIFIED` · FIXTURE_LAB | SCOPED_V2 (R-2); nguồn tên alpha (R-4) |
| FE-067 | BE-P2 `stage_facts` (`642a7ab9`) | 4 màn stage (thân V1) | `FIXTURE_VERIFIED` · FIXTURE_LAB | SCOPED_V2 (R-1); runtime_state/sessions/finding_type chưa nối nguồn |
| FE-068 | BE-P5 stage-action eligibility (`19478d73`) + BE-P7 parity (`29ec3ef9`) | 9/10 action có điều khiển V2; `paper.exit_review_request` chưa có control | `FIXTURE_VERIFIED` · FIXTURE_LAB | copy 3 câu capture đã được Bobby duyệt (`e8e5f571`), copy mới khác chờ Bobby; canary/live `NOT_COMMISSIONED` giữ |
| FE-069 | BE-P5 request lookup + run list (Research đã phục vụ) | form request | `FIXTURE_VERIFIED` · FIXTURE_LAB | copy "All completed runs in this workspace" (Bobby) |
| FE-070 | BE-P2 contract + validating mapping (`8a9f9569`) | Calendar chip | `FIXTURE_VERIFIED` · FIXTURE_LAB | nguồn lịch: `N28_VENUE_CALENDAR_NOT_ACTIVE` (DL/Codex) |
| FE-071 | BE-P2 envelope/rollback/trial (`3088be07`) | Canary | `FIXTURE_VERIFIED` · FIXTURE_LAB | 5 nhóm fact nguồn (xem Board proposal) |
| FE-072 | BE-P2 typed rows/figures/series/gap (`8cb0eb61`) | Canary/Live/Sandbox (thân V1) | `FIXTURE_VERIFIED` · FIXTURE_LAB | Broker side, equity, series, gap window nguồn |
| S3-U1 | VERIFIED không đổi code (route flag-off, passthrough POST) | không nối | — | qualify hoặc retire (Codex); không bật để né Paper 7,4 MB |
| S3-U2 | BE-P3 4 schema + fixture legacy (`77eea7d5`) | double e2e đã sửa 7 probe (`566d6b9a`) | `FIXTURE_VERIFIED` · BFF_DOUBLE | R-3 (FE đọc v2 SCOPED) |
| S3-U3 | BE-P3 chart `subject_kind=deployment` (`57b2d3ce`) | reader đọc 7 case; chưa màn | `FIXTURE_VERIFIED` · FIXTURE_LAB | nối màn là quyết định FE |
| S3-U4 | BE-P3 `positions_by_side` (`02ab03a0`) | Paper Positions | `FIXTURE_VERIFIED` · FIXTURE_LAB | notional: E5 |
| S3-U5 | cùng FE-066 | liên kết Alpha chỉ khi có `alpha_id` | `FIXTURE_VERIFIED` · FIXTURE_LAB | SCOPED_V2 R-2 |

### 3.3 MD-1…MD-8, UXM08-A…F, UXM09, ELP2-REQ-*

| ID | Implemented | Consumed | Tested | Pending (chủ) |
| --- | --- | --- | --- | --- |
| MD-1, 2, 3, 6, 7, 8 | BE-P1 (`2179c771`); producer-only phần JSON Schema không nói được | reader theo producer (`3f459836`); 5 `it.fails` giữ có chủ ý | `FIXTURE_VERIFIED` · FIXTURE_LAB | Codex ACCEPTED; PG specs NOT_RUN |
| MD-4 | BE-P1 + BE-P8 §2 khuyến nghị ACCEPT | không màn nào đọc `presets[].resolved` | `FIXTURE_VERIFIED` · FIXTURE_LAB | Codex ACCEPTED (đổi hành vi producer) |
| MD-5 | BE-P6 canonical zero khi emit (Bobby chọn C) | oracle FE đã lật (`5152cee3`) | `FIXTURE_VERIFIED` · FIXTURE_LAB | Codex ACCEPTED; `*_details` niêm phong giữ nguyên |
| UXM08-A…F (`UXM08-REQ-x`) | — (không có code backend) | slice `/execution/slice` + eviction (FE) | `FIXTURE_VERIFIED` · FIXTURE_LAB (`ACCEPTED_FIXTURE_ONLY` đề xuất) | A chặn cứng real-source (operation); B/C hợp đồng frame; D chủ gate; E hàng Board; F fixture đa scope |
| UXM09 (a)(b) + FE-020/032/015/037/034 | — | story `/execution/command` + reader catalogue V2 chặt | `FIXTURE_VERIFIED` · FIXTURE_LAB | F0 apply body; idempotency key; reject reason… (Codex+PM) |
| ELP2-REQ-00-001…005 | — | — | — | giữ như packet ELP2-00 |
| ELP2-REQ-04-001/008/009/010 | Codex; 04-010 DTO V2 | readers V2 | `FIXTURE_VERIFIED` · FIXTURE_LAB | 04-001 adapter thật ngoài |
| ELP2-REQ-05-001, 05-002 | — | — | — | OPEN_SOURCE_CONTRACT (TS/Edge capture owner) |
| ELP2-REQ-06-001 | Codex named reads | slice + series/dataset | `FIXTURE_VERIFIED` · FIXTURE_LAB | thật NOT_RUN |
| ELP2-REQ-06-002 | contract nhận `precomputed_series`; **chưa có writer** | — | `SOURCE_ONLY` | 12 đầu vào (SRC-F) |
| ELP2-REQ-07-001, 07-002 | Codex trusted command, pending-recall | BE-P5 read side | `FIXTURE_VERIFIED` · FIXTURE_LAB | provider PM chưa qualify |
| ELP2-REQ-08-001 | Codex receipt vốn non-amount | UXM-09 fixture | `FIXTURE_VERIFIED` · FIXTURE_LAB | — |
| ELP2-REQ-09-001 | Codex frame states | slice, 9/9 Playwright | `FIXTURE_VERIFIED` · FIXTURE_LAB | `ACCEPTED_FIXTURE_ONLY` đề xuất; thật = UXM08-A |
| ELP2-REQ-10-001 | — | UXM-10 fixture receipt | `FIXTURE_VERIFIED` · BFF_DOUBLE (138/138) | G2/budget thật: NOT_MET |
| ELP2-REQ-10-002 … 10-007 | Codex nội bộ (INFO) | — | — | giữ |
| ELP2-REQ-10-008 | Core008 `INSTALLED` (image `7b2c7f34…`); identity COMMIT+ACK (Edge, không reissue) | — | `INSTALLED` (008 only) | negative lost-issue-response: NOT_RUN, giữ riêng |
| ELP2-REQ-10-009 | BE-P9/P10: `SOURCE_ONLY` | — | `SOURCE_ONLY` | §4 |

## 4. Slice chạy được đầu tiên và nhóm ưu tiên

| Nhóm handoff | Việc | Slice chạy được **ngay** (không chờ Edge/PM) | Người chạy / gate |
| --- | --- | --- | --- |
| **B / Core009 (đầu tiên)** | Edge 3 điều chỉnh đã có ở nguồn (§5) | (1) disposable PG + `be-p10-manager-revoke-pg.spec.ts` + các spec PG hiện có; (2) ordinary R3 trên đúng composition cuối (`7abacd69`+); (3) build image từ commit đó | Claude/Codex, khoá `/tmp/portal-heavy.lock`, `TEST_DATABASE_URL` dùng một lần; **NOT_RUN** |
| A (song song) | capital step-up, account, self-nav, advisory parity, FE-013 invariants, MD-4/5 | đã ở `FIXTURE_VERIFIED`; slice kế: 2 test PG của `elp2-access-transaction.spec.ts` + parity batch↔route trên PG | cùng gate PG ở trên |
| C | SCOPED_V2 stage subtrees (R-1/R-2), `getManagerDataset` thật, writer series | thiết kế v3 / purpose seal; **chưa có package** — chưa gán BE-P nào | cần Codex quyết purpose/field-policy |
| D | family command còn lại, F0 apply body | contract-first; repin PM trước kết luận thiếu nguồn | cần PM/Codex |
| E | FE nối typed fields | đã làm với `FIXTURE_LAB`/`BFF_DOUBLE` | Claude FE lane |
| F | ELP2-10 T10-01…14 | đề xuất số đo + config cho Bobby duyệt một lần (T10-13) | chưa bắt đầu |

## 5. Core009: ACK, 3 điều chỉnh của Edge, đường trả

**ACK:** Claude nhận Core009 là việc đầu tiên. `PREPARED_SOURCE_ONLY` (xem [PREPARED return](../ELP2-10/CORE009_PREPARED_OWNER_RETURN_2026-10-20.md)): **chưa cài, chưa kết nối, chưa phát session thật, chưa revoke thật.** Identity thật đã COMMIT+Core ACK, không reissue. Không restart stable/dev/main/provider28445, không bật command/Live.

| # | Điều chỉnh của Edge (revision 2) | Verdict | Bằng chứng ở nguồn | Còn thiếu |
| --- | --- | --- | --- | --- |
| 1 | cleanup revoke gắn đúng session/file (S1→S2 tái dùng path) | **ACCEPTED_WITH_CHANGES** | BE-P10 Rev 3: `b70f8f77`, sha256 `research-acceptance-session.ts` `6a4ed7dc790318d60c4fd2593e48ac1845629afde444b38b11bbfba3661d1eb3` (cũ `2bd35bb2…`); receipt `RETAINED_NOT_BOUND_TO_SESSION` | PG/R3/image NOT_RUN; chưa thử trên filesystem root thật |
| 2 | ghi token đầy đủ, kiểm `bytesWritten`, bù revoke | **ACCEPTED_WITH_CHANGES** | `4b2b76e0`: vòng ghi ≤16 lần, fstat + đọc lại; `be-p10-acceptance-session.spec.ts` 63/63 | như trên |
| 3 | `--dry-run` offline trước Pool/schema/compose | **ACCEPTED_WITH_CHANGES** | `81e8a546`, sha256 `execution-native-session.ts` `fa353d3398acd79fdff8525972c1130622c8978306d0c2227c2e092be4290257` (cũ `df0f3277…`); `be-p10-native-session-cli.spec.ts` 23/23 (21/23 đỏ trên bytes cũ) | như trên |

"WITH_CHANGES" = giữ nguyên yêu cầu của Edge và thêm: ledger ingress `a0e545e9`, runbook rev 2 sửa tại chỗ (sha256 `bd9c908ba238f7cc9eabd2d2c13764ab1ab6ceee30ff1e0b22b6c129f7dcb35e`, thay `3417afbd…`), hai ghi chú còn lại của Rev 3 ("Residual notes": cửa sổ swap không đóng được ở user space; file token cũ giữ lại để operator kiểm).
**BE-P11** được giao các điều chỉnh này theo brief; Rev 3 của BE-P10 đã có mã + test fake cho cả ba mục. BE-P11 phải đối chiếu `e1f3938e` trước khi làm, **không viết lại**; phần BE-P11 còn có thể sở hữu là PG/R3/image, không phải mã đã có.

**Đường trả (không giá trị bí mật):**
1. Công khai: nối phụ lục vào [PREPARED return](../ELP2-10/CORE009_PREPARED_OWNER_RETURN_2026-10-20.md) (pin mới ở bảng trên + `PREPARED_SOURCE_ONLY → INSTALLED` chỉ khi có ACK thật), rồi đề xuất text Unified ở [UNIFIED proposal](UNIFIED_UPDATE_PROPOSAL_2026-10-20.md) (mục "Core009"); Edge đọc cùng đường dẫn Edge request `EDGE_TO_CORE_EPG10_08_REQUEST_2026-10-19.md`.
2. Riêng tư giới hạn (qua kênh đã duyệt, **chỉ tham chiếu đường dẫn/hash**): nơi đặt artifact/config/phiên chưa được thoả thuận — `NOT_PROVIDED`, Core và Edge cần thống nhất trước; không ghi vào thư mục secure của Edge.
3. Đầu vào Edge phải cấp (PREPARED return §3–§5, `NOT_PROVIDED`): seals catalogue/profile/field-policy của `account-balances`, pin quan sát nguồn mới, trust gia hạn (trust hiện hết `2026-10-20T08:00:59Z` UTC), `approval_ref`/revision (Bobby), cửa sổ hữu hạn mới.
4. Chỉ sau khi 1–3 đủ: Codex thực hiện hoán đổi zero-custody (runbook §9), rồi Edge chạy 08 READ/STREAM/revoke, sau đó read09. Mọi kết quả chưa chạy ghi `NOT_RUN`.

## 6. Bảng gate cuối (năm mức, không dùng nhãn "done")

| Mức | Gói / ID | Số |
| --- | --- | --- |
| `SOURCE_ONLY` | BE-P9, BE-P10 (cả Rev 3), ELP2-REQ-06-002 (contract) | 2 gói |
| `FIXTURE_VERIFIED` | BE-P1…P8 và consumer tương ứng (FIXTURE_LAB/BFF_DOUBLE) | 8 gói |
| `INSTALLED` | chỉ Core008 (ngoài phạm vi BE-P); không BE-P nào | 0 gói |
| `CONNECTED_VERIFIED` | — | 0 |
| `OWNER_ACCEPTED` | — (mọi producer receipt chờ Codex; copy chờ Bobby) | 0 |
