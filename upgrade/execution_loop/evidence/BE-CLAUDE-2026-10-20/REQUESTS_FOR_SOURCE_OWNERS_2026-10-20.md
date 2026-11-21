# Yêu cầu gộp cho source owner (Edge / PM / Codex) — Claude, 2026-10-20

**Trạng thái:** `REQUESTS_WRITTEN / NOT_SENT` · R0. Mỗi yêu cầu có **locator**, **UI impact**, **done-when** kiểm được. Dùng ID gốc ở cột "Khoá SYNC" (hậu tố `#n` xem [SYNC proposal](SYNC_UPDATE_PROPOSAL_2026-10-20.md)); mã `SRC-x` chỉ là nhãn gộp trong file này, không phải ledger mới (SRC-H và SRC-J không có mục riêng: đã giải quyết, xem §0).
Không có yêu cầu nào là lệnh mở phase, không kèm secret/token/session; Claude không tự viết giá trị nguồn. Nguồn: ledger [BE-P1…P10](.), consumer receipt `../UXM-07/`, `../UXM-08/`, `../UXM-09/`, [ACK](ACK_ALL_BACKEND_2026-10-20.md). Mức gate nói về cái đã có, không phải cái yêu cầu này đòi (hiện: `FIXTURE_VERIFIED`/`SOURCE_ONLY`, không `CONNECTED_VERIFIED`).

## 0. Đã giải quyết bởi BE-P7 — không gửi lại

| Chủ đề cũ | Kết quả | Còn mở với Codex |
| --- | --- | --- |
| Capital step-up / `access.grant` (BE-P5 §6.1, FE-015/060/068): actor chỉ có `capital.*` không qua được `POST /step-up` | **ĐÃ SỬA ở nguồn** bởi BE-P7 (`034c463f`): `POST /step-up {family:"CAPITAL_COMMAND"}`, proof gắn family bằng tiền tố `stpcap_` (`apps/control-api/src/repos/account-lifecycle.ts:135`), không cấp quyền access-admin; `FIXTURE_VERIFIED`; PG 2 test NOT_RUN | BE-P7 Q1 (cột `proof_family` hay giữ tiền tố; ai giữ migration `1723680000146`), Q2 (TTL riêng), Q3 (proof ACCESS_ADMIN thoả lệnh vốn?) — FE-015#1 |
| Session phát workspace mặc định (self-navigation §7.2, FE-057) | **ĐÃ GIAO**: `GET /api/admin/profile-access/v2/self-context` (`41a72ba4`), không query; RESOLVED/AMBIGUOUS/NONE/UNAVAILABLE | Q5 quy tắc nhiều membership; `default_workspace.UNAVAILABLE` + entry `ALLOWED` — FE-057#1/#3 |
| `execution.accounts.manage` (FE-037/058) | **Gỡ token**; `account_operations` typed absence `COMMAND_FAMILY_NOT_COMMISSIONED` | Codex/Bobby xác nhận bỏ token — FE-037 |
| Hai nguồn cho sandbox note lệch nhau (be-p5 §6.2) | **Một predicate** `capture-authority.ts` (`29ec3ef9`) | — |

## SRC-A. UXM-08 realtime có phạm vi (owner: **Codex** hợp đồng; nguồn: Edge ELP2-09/05-001) — khoá `ELP2-REQ-09-001#A…#F`

| Mã | Locator | UI impact | Done-when |
| --- | --- | --- | --- |
| **A** (chặn cứng) | `packages/contracts/generated/execution-scoped-realtime.d.ts` `paths`/`operations = Record<string, never>`; handoff `ELP2-09/coverage-and-handoff.md` "Backend integration boundary" 1, 3 | `SnapshotPort` chỉ có bản fixture; không watchdog "stream im lặng"; 4 ngưỡng FE (gộp 1.000 ms, 3 resync/60 s, retry 5 s) là giả định | OpenAPI có operation snapshot đặt tên `alpha_fleet_overview` (+ stream hoặc "không có stream"); 4 số trong schema hoặc "FE tự chọn, trần server X"; fixture L0 + conformance |
| B | `$defs/ScopedRealtimeFrame` (10 key, không dataset) | frame dataset khác trên cùng connection không phát hiện | trường `dataset` + 1 ca âm, hoặc ghi "một connection/một dataset" |
| C | `$defs/NativeProfileRealtimeHeaders`, `projection_generation`, `Quality.source_set_ref` | pin generation lấy từ frame live đầu → trễ | snapshot mang generation + source set baseline |
| D | `apps/portal/frontend/src/execution/failClosed.test.ts:111` `DESCRIPTIVE` | không chặn gì | dòng `reconnect_required` kèm lý do (chủ gate: lead) |
| E | `evidence/SOURCE_TRUTH_BOARD.md` | ô `Not published` của slice không trỏ hàng mở | hàng 19 ([Board proposal](SOURCE_TRUTH_BOARD_PROPOSAL_2026-10-20.md)) |
| F | `fixtures/execution-manager-scoped.synthetic.valid.json` `cases[0..1]` | không dựng được tương phản UX-F02/F04/F05/F19 | ca ≥2 portfolio, ≥2 env (live+paper), 2 currency, account dùng chung, `has_more=true`, 1 researcher |

Phụ thuộc server (UXM-08 §8): snapshot barrier + binding có tên, `ScopedNoticeSource` kiểm chứng, coordinator cadence, guard business scope mỗi lần giao; `OPEN_SOURCE_CONTRACT` của ELP2-REQ-05-001 (TS/Edge: publisher cũ sống sau takeover).

## SRC-B. UXM-09 command UX (owner: **Codex + PM**) — khoá `FE-020#a/#b`, `FE-032#1`, `FE-015#2`, `FE-037#2`, `FE-034#1`

| Mã | Locator | UI impact | Done-when |
| --- | --- | --- | --- |
| B1 | `POST /api/v1/execution/operations/{operation_id}/apply` (`applyExecutionCommandF0`): chỉ `RelayDenied` 409 hoặc không gì | trạng thái ACCEPTED/REJECTED/UNKNOWN/REPLAYED chỉ có trên lane CAPITAL synthetic (`TEST_ONLY`) | publish body thành công, hoặc xác nhận "F0 chỉ DENIED" |
| B2 | cùng route: không idempotency key trong body | "cùng key" do fake port mô phỏng (`command_apply:<uuid>`) | Codex xác nhận key và hành vi cùng-key-khác-payload |
| B3 | `CommandStatus` (REJECTED không reason; không bit `replayed`; venue không `PARTIALLY_FILLED`) | `Not published (FE-032)` | lý do reject typed, bit `replayed`, số lượng partial, tra theo idempotency key |
| B4 | plan/preview F0 không cost/impact | `Not published (FE-020)`; xác nhận bắt buộc "none was computed" | cost/impact có đơn vị chính xác hoặc "không có" |
| B5 | eligibility per-operation; grant gửi lệnh | 78 nút disabled chỉ có `blocked_reason`; tên grant "provisional (FE-037)" | capability + grant + `reason_class` mỗi operation (extension của FE-015) |
| B6 | archive/monitor/reactivate (UX-F14/15/16) | 5 hàng "Requires separate certification" | contract + certification (FE-034) |
| B7 | `operations.service.ts#catalogue()` gắn `classification` vào mọi entry và `capability_state=PARTIAL`, schema ghi hằng `DISABLED`; fixture không có `classification` | reader chặt từ chối thay vì hiển thị | giữ DISABLED hoặc nới schema có chủ ý; thêm fixture canonical có `classification` (`ELP2-REQ-04-010#1`) |

## SRC-C. FE-065 ngữ pháp `currency` (owner: **PM**)

Locator: `Manager` `currency`/`partition.currency` là text mở 1..256 kế thừa từ PM (`manager-model.contract.ts`). **Portal không thu hẹp** (một mã lạ sẽ thành 503 cả dataset hoặc mất partition — BE-P8 §3). UI impact: FE từ chối bidi/zero-width chặt hơn schema; hiển thị thoát ký tự. Cần từ PM: (1) ngữ pháp hoặc từ vựng hữu hạn + phiên bản (ISO 4217, ticker crypto như `USDT`, hậu tố perpetual); (2) `currency` có thể mang gì ngoài mã không. **Done-when:** PM nêu trong tài liệu nguồn; Portal mirror một schema `managerCurrency` + `pattern` + fixture âm trong một commit. MD-5 (canonical zero) đã đóng riêng (BE-P6).

## SRC-D. Nguồn cho từng fact stage (owner: **Codex nối** ← TS/DL/PM nguồn) — khoá `FE-067#2`, `FE-071#1`, `FE-072#1`, `FE-070#1`

| Mã | Locator (producer Portal) | UI impact | Done-when |
| --- | --- | --- | --- |
| D1 `runtime_state` + since | `execution/stage-facts.ts` đọc `runtime_state`, `runtime_state_since\|changed_at`; `DEPLOYMENT_FIELDS` (`paper-read.service.ts:77`, `profile-read.service.ts:53`) thiếu field; mã `SOURCE_RUNTIME_STATE_FIELD_NOT_PUBLISHED` | chip Runtime cả 4 màn stage `Not published (FE-067)` | `strategy_deployments.runtime_state` (+ changed-at) vào Manager deployments catalogue + từ vựng `RUNNING\|PAUSED\|HALTED\|STOPPED` xác nhận (TS: từ `ts-contract-v1` chưa phân loại) |
| D2 sessions + reconciliation Paper | `execution/current-source.proxy.ts:51` `N22_PAPER_SCREEN_BINDINGS` thiếu `manager.sessions`/`manager.reconciliation` ở entry workbench | tab Sessions trống, chip Reconciliation | thêm hai relation vào binding (EDS pins); Portal không cần đổi code |
| D3 `finding_type` | `stage-facts.ts:105-107` `UNKNOWN_ORDER_FINDING_TYPES`/`OTHER_FINDING_TYPES` rỗng có chủ ý | `unknown_order_count` `FINDING_TYPE_VOCABULARY_NOT_CLASSIFIED` khi có finding mở | từ vựng `finding_type` của nguồn (TS) → điền hai tập |
| D4 lịch phiên | adapter `portal.execution.data-layer-session-calendar.v1` (`GET /v1/control/session-calendar`, SOURCE_DARK); `venue-calendar.ts:60` `venueCalendarFromSource` | chip VN market `N28_VENUE_CALENDAR_NOT_ACTIVE` | nối calendar thật + holiday + tên ATO/ATC (DL); sample n28 chỉ là shape |
| D5 base risk limits, daily loss | `canary-envelope-facts.ts` | `policy_limit`, `daily_loss` `Not published (FE-071)` | nguồn base risk profile limits; quan hệ PnL ngày |
| D6 rollback + trial | `FLATTEN_PLAN_NOT_RECORDED`, `ROLLBACK_DRILL_NOT_RECORDED`, `E5_CANARY_TWIN_COMPARISON_NOT_QUALIFIED`, `CANARY_ACTIVATION_NOT_RECORDED` | 4 mục rollback + trial strip | nguồn ghi nhận từng mục (TS/PM) |
| D7 phía broker, equity, phí | `BROKER_*_NOT_PUBLISHED`, `INTERNAL_EQUITY_FIGURE_NOT_PUBLISHED` | Triad chỉ một phía | tổng broker/equity/phí; equity snapshot gắn màn stage |
| D8 series deployment + gap | không relation series Canary/Live; `PROJECTION_GAP_WINDOW_NOT_RECORDED` | chart `Not published`; gap window | relation equity/PnL series; wall-clock gap trong projection journal |
| D9 vị thế | `E5_POSITION_CURRENCY_AND_MARK_LINEAGE_UNQUALIFIED`; leverage/ack latency không có cột | notional by side, gross, Leverage, Ack latency | tiền tệ + mark lineage (PM/Codex); cột hoặc join gateway-event |
| D10 SCOPED_V2 | `portal.execution.following-parent.v2`, `live-source-operations.v2` niêm phong, `runtime.state:null` | thân SCOPED_V2 không có stage facts/identity | v3 hoặc field purpose + fixture (R-1/R-2) — `FE-067#R1`, `FE-066#R2` |

## SRC-E. Nguồn tên alpha hiển thị (owner: **Codex / Bobby**) — khoá `FE-066#R4`

Locator: `execution/deployment-identity.contract.ts` `ALPHA_NAME_NOT_PUBLISHED`; không relation Execution nào có tên (`alphas` = id/description, `strategies` = ids; tên chỉ ở Research catalogue, khác namespace, không có join đã qualify). UI: tiêu đề Alpha là id; `Alpha name Not published (FE-066)`. **Done-when:** quyết định một trong hai: (a) publish `name` trên `strategies`/`alphas`; (b) quan hệ tương đương id Execution↔Research có qualify. Không tự dựng tên từ id.

## SRC-F. Đầu vào writer tài chính — ELP2-REQ-06-002 (12 hàng, BE-P8 §4) — owner: **Core / PM / Edge**

Không viết writer trước khi hàng 1, 2, 3, 6, 7 có chủ (BE-P8). Hook kiểm tra đã sẵn ở contract (`manager-series-publication.contract.ts`, `manager-series.ts`); thiếu là **đầu vào nguồn**. UI: mọi profile `SERIES_SOURCE_NOT_PUBLISHED`; Overview/Portfolio 360/Compare in `Not published (FE-013)`.

| # | Đầu vào cần | Owner | Done-when |
| --- | --- | --- | --- |
| 1 | định nghĩa population (tuple set, ownership scope) = `managerScorePopulationDigest` | Core/PM | tài liệu + digest khớp |
| 2 | cửa sổ tính (7D/30D/90D/custom), quy ước ngày, chứng tích inception cho ALL | Edge/PM | quy ước ghi rõ |
| 3 | từ vựng valuation basis + partition cùng basis | Edge/PM | từ vựng + partition |
| 4 | ngữ pháp currency (SRC-C) | PM | SRC-C |
| 5 | tiêu chí COMPLETE (không gap) và PARTIAL có được AVAILABLE không | Edge/PM | quyết định owner |
| 6 | methodology registry: grammar, versioning, nội dung (TWR/MWR, định giá, chi phí, denominator, FX) | Core/Edge | registry |
| 7 | revision của cashflow ledger và economic facts; trường `cashflow_revision`/`economic_revision` ràng buộc document | PM/Edge | id + trường |
| 8 | FX: nguồn tỷ giá + policy (hiện **không chuyển đổi**, chỉ series theo partition) | Core/PM | hoặc ghi "không bao giờ" |
| 9 | lớp chi phí NET_PNL (fee, funding, slippage, borrow) dạng danh sách đóng | PM/Edge | danh sách đóng |
| 10 | denominator của RETURN + tham chiếu NAV chia | Core/PM | định nghĩa |
| 11 | chứng minh đếm mỗi account vật lý một lần theo `ownership_partition_ref` | Core/PM | statement ràng buộc |
| 12 | restatement: chính sách thay bằng revision mới, giữ bản gốc trong custody; quan hệ `supersedes` | Core | policy |

Kèm theo: producer ghi `precomputed_series[]` vào `ManagerModelDocument` theo thời gian (không theo request); receipt API→UI `REAL_READ_QUALIFIED` có NAV/NET_PNL/RETURN đầy đủ; population hạn chế trả `SERIES_SCOPE_NOT_AUTHORIZED` trước mọi aggregate. Retained equity **không** thành NAV được chứng nhận (`portfolio_equity_snapshots` chưa có `methodology_ref`).

## SRC-G. Stage timeline cho `entered_at_ms` (owner: **PM / Edge**) — khoá `FE-027#1`

Locator: `apps/control-api/src/execution-v2/manager-lifecycle.ts` (`deriveManagerRowLifecycle`: `entered_at_ms`/`days_in_stage` = `null` + `STAGE_ENTRY_TIME_NOT_PUBLISHED`); PM stage timeline (`§58.154`, `IMPLEMENTING`, tests `NOT_RUN`). `valid_from_ms` (khoảng revision) và ngày duyệt gate **không** dùng làm entered_at (approved ≠ deployed). UI: Fleet "In stage", Alpha 360 header, Cockpit spine. **Done-when:** nguồn effective-stage-transition qualify (hoặc event journal); khi có, Portal bật cặp non-null (validator đã sẵn: `days_in_stage == floor((as_of_ms − entered_at_ms)/86_400_000)`) + thêm kiểu INTEGER vào sort enum. Cùng nguồn mở `gate_state` và ordered transitions (FE-027/028).

## SRC-I. Registry rev 7 — mục tự xem (owner: **Codex**) — khoá `FE-038#1`, `FE-039`

Locator: `apps/portal/registry/registry.json`. Đề xuất: feature `PROFILE_ACCESS_SELF`, route `/administration/my-access`, `permissions: []`, group `administration`, `show_in_sidebar: true` (JSON đầy đủ: `../UXM-07/consumer-receipt-be-p7-2026-10-20.md` §6). UI hiện tại: Sidebar mượn feature/icon của `PROFILE_ACCESS`. **Done-when:** entry có trong registry rev 7; FE bỏ `withSelfEntry`; `PROFILE_ACCESS` giữ guard admin. Cùng rev: ẩn `APPROVALS` cũ `/backtests/approvals` (FE-039). Registry **không** sửa ở đây.

## SRC-K. Đầu vào cho Core009 (owner: **Edge / PM / Bobby** ← từ Core)

Locator: [PREPARED return](../ELP2-10/CORE009_PREPARED_OWNER_RETURN_2026-10-20.md) §3–§5; [runbook rev 2](../ELP2-10/CORE009_OPERATOR_RUNBOOK_2026-10-20.md). Tất cả `NOT_PROVIDED`: (1) seals `catalogue_sha256`/`profile_sha256`/`field_policy_sha256`/`field_policy_ref` đã review cho `account-balances` và các relation đặt tên (Edge/PM; "catalogue = mounted" không được giả định); (2) pin quan sát nguồn của cửa sổ MỚI (origin, `pm_leaf_sha256`, `workload_id`, deadline, bytes, `max_inflight`, native acceptance mới — **không** dùng revision 1/2 của `b922c105…`); (3) trust gia hạn (ứng viên hết `2026-10-20T08:00:59Z` UTC); (4) `approval_ref`/policy revision/grant id (Bobby duyệt, Core điền); (5) cửa sổ hữu hạn, sớm/muộn nhất Edge phục vụ; (6) nơi giao token file cho harness Edge (UID sở hữu 0600; chỉ đường dẫn + `session_id`). **Done-when:** Core validate Plan B offline xanh, cài, ACK in `DOMAIN_READ_AND_STREAM_GRANT`; Edge chạy 08 READ/STREAM/revoke với receipt tương quan. Hiện mọi bước: `NOT_RUN`.

## SRC-L. PM (không nằm trong các mục trên)

| Mã | Locator | UI impact | Done-when |
| --- | --- | --- | --- |
| L1 | recall remainder-read + 5 CAS + tương quan lệnh gốc; `original_recall_id` = PM `command_id`? (`pma11-14-edge-command-handoff.json`) | dock chỉ liệt kê recall do Portal điều khiển (`RECALL_REMAINDER_SOURCE_READ_NOT_QUALIFIED`) | read qualify có receipt — `FE-062#2/#3` |
| L2 | `pma11-14-edge-command-handoff.json`: TEST_ONLY, lease provider chưa cấu hình, native targets rỗng | không command thật | qualification operation/env/target + held-COMMIT proof |
| L3 | `pma11-14-dataset-discovery.json`: 18 descriptor, #18 PREPARED_NOT_RUN, runtime false | Board không thể coi "catalogue = mounted" | mount + receipt thật, không chỉ descriptor |
| L4 | `pma11-13-selected-history-export.json`: 17 dataset, history PARTIAL | không NAV/census/corpus từ history chọn lọc | sự kiện thiếu (barrier, coverage, retention floor, delivery) nêu cụ thể |
