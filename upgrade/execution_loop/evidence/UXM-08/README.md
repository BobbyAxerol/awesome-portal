# UXM-08 — Lát đọc chỉ-đọc, làn FIXTURE ONLY (scoped realtime consumer + slice portfolio → fleet → alpha)

Chủ: Claude (writer UXM-08 fixture-only) · 2026-10-20 (Asia/Saigon) · Nhánh `claude/uxm-f9` @ `4ac2e3a7`, worktree riêng `agent-a92a07d54a2eca488` · Tầng kiểm chứng: **R1 only, R2 pending** (Rules §10.10).
**Lane mọi receipt: `FIXTURE_LAB`.** Mọi thứ ở đây chạy trên fixture công bố (`TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT`), sau cờ `scoped` (mặc định TẮT). Không có endpoint, không mở stream, không poll, không gửi gì. Màn tự gắn nhãn **"Fixture frames, not a real stream"** và **"Not connected to a real source"**.
Đây **không** phải real source-to-API-to-UI tie-out của UXM-08 (guide §UXM-08): nguồn thật `SOURCE_NOT_QUALIFIED`, hàng nào của Source Truth Board cũng **không lật**.

## 1. Pins (G0)

| Mục | Giá trị |
| --- | --- |
| Base FE | `claude/uxm-f9` @ `4ac2e3a78011baca2276cea7c1c0f02b4625759a` (reset cứng từ `53316263`) |
| Contract frame | `packages/contracts/schemas/execution-scoped-realtime.v1.schema.json` sha256 `e13ea045…`, generated `execution-scoped-realtime.d.ts` `6bc7c0de…`, fixture `execution-scoped-realtime.synthetic.valid.json` `aeef8740…` (producer commit `d0789674`) |
| Contract đọc có phạm vi | `execution-manager-scoped.v1.schema.json` `7c9e02a3…`, fixture `execution-manager-scoped.synthetic.valid.json` `986d91d5…` (commit `2ec5924d`) |
| Handoff | `evidence/ELP2-09/coverage-and-handoff.md` (ELP2-REQ-09-001), `evidence/ELP2-06/README.md` (ELP2-REQ-06-001, named reads) |
| Source pins (TS/PM/Edge/DL) | **Không đọc** (gói không giao SSH; §10.12.2a). Mọi ngữ nghĩa lấy từ contract đã publish trong repo (§10.12.1) |
| Ledger release-integrity | `scripts/refresh-release-integrity-ledgers.sh --check` = current (không `--write`: file ngoài đường dẫn được giao) |

## 2. Đã dựng (đường dẫn, một người ghi)

| Task | File | Nội dung |
| --- | --- | --- |
| 1 Reader | `src/execution/v2/readers/scopedRealtime.ts` (+ `.test.ts`, `.conformance.test.ts`) | `readScopedRealtimeFrame` (5 frame, đóng, `{ok, frame}` hoặc `{ok:false, drop}` có lý do kiểu), `checkScopedBinding` (CONTEXT/GENERATION/SOURCE_SET), `readNativeBaselineHeaders` |
| 2 State machine | `src/execution/v2/realtime/{scopedStreamMachine,scopedStreamController,useScopedStream,streamView}.ts(x)` (+ test, `fakes.testbase.ts`) | reducer thuần (`stepStream`), controller bơm port/clock, hook React, bảng copy/chip |
| 3 Slice | `src/execution/v2/screens/slice/{index.tsx,model.ts,scopedRead.ts,canonicalLane.ts,slice.css}` (+ test) | màn, dẫn xuất thuần, reader `manager-scoped.v1`, làn fixture, CSS |
| Cờ + route (**file dùng chung**) | `v2/flags.ts` (+1 khoá `scoped`), `v2/flags.test.ts` (+1 chuỗi trong danh sách khoá), `src/app/PortalRoutes.tsx` (+lazy import raw-env, `EXECUTION_SLICE_ROUTE = "/execution/slice"`, 1 `<Route>` có điều kiện `isV2Screen("scoped")`) | xem §8 |

Slice không viết lại màn nào: nối bằng link tới Portfolio 360 (`/deployments/portfolios/{id}`), Alpha Fleet (`/deployments/alphas`), Alpha 360 (`/deployments/alphas/{id}`) bằng `DEFAULT_ROUTES` của `screens/portfolios/routes.ts`, mang `withContext` (env, window, ccy, workspace_id, from).

## 3. Ánh xạ trạng thái frame → component / field / state / assertion (ELP2-REQ-09-001)

| Frame (`event_type`) | Reader trả | Machine (phase, effect) | Component / field hiển thị | Assertion chính (file) |
| --- | --- | --- | --- | --- |
| `revalidate` (terminal=false, cursor+generation+quality, `READ_NAMED_SNAPSHOT`) | `kind:"revalidate"`, `quality` của **notice** | `live`→`revalidating`: đúng 1 `read_snapshot` (single-flight); burst gộp theo `coalesceWindowMs`; tab ẩn: không đọc, nợ 1 | chip "Revalidating"; "Notices: N received, M folded into an owed read, R reads started"; `<details>` "Last notice: quality of the notice, not of the data" | một notice → đúng một đọc, dữ liệu chỉ đổi bằng câu trả lời của đọc (`machine.test` R1); 100k notice → 1 đọc thêm + 1 wake-up (`scale.test`); ẩn 1 giờ → 0 đọc, 1 khi quay lại |
| `heartbeat` (quality=null, `RESUME_PORTAL_CURSOR`) | `kind:"heartbeat"`, **không có thuộc tính `quality`** | chỉ giữ cursor/generation; không đổi phase, data, `dataReadAtMs`, `notice`, posture | "Heartbeats: N (liveness only)"; dòng "Data" không đổi | `machine.test` R2, `slice.test` ("a heartbeat changes nothing…"), 1.000.000 heartbeat → 0 đọc, state không lớn (`scale.test`) |
| `resync_required` (terminal, reconnect_required, `READ_NAMED_SNAPSHOT`) | `kind:"resync_required"`, `reason` | `resync_required`: bỏ cursor/generation/pin, đóng stream, abort đọc đang chạy, **1** đọc snapshot lại rồi `open_stream` từ baseline; ngân sách `maxAutoResyncs`/`resyncWindowMs`; sau `RECONNECT_LIMIT`/`STOPPED` không tự đọc | chip "Resync required"; dòng lý do (bảng copy theo `reason_code`); dữ liệu cũ dưới trạng thái `stale` "Last read; not confirmed since."; sau đọc xong → "Live (fixture)" | cursor bị bỏ, không phát lại financial event (`machine.test` "a resync is not a financial event"); bão resync 10.000 frame → ≤ ngân sách rồi `unavailable` RESYNC_LIMIT |
| `access_revoked` (terminal, `SIGN_IN_OR_REQUEST_ACCESS`) | `kind:"access_revoked"`, `reason` | **terminal**: data/notice/cursor = null, abort đọc, `clear_scoped_data`; mọi frame/tick/retry/visibility **bất động**; chỉ `start` (context mới) thoát | chip "Access revoked"; panel `denied` "Your access to this scope changed."; link "Open My access"; **không còn** workspace/portfolio/alpha/giá trị nào trên trang | `slice.test` (quét văn bản: không còn `workspace_TEST_ONLY`, `portfolio_TEST_ONLY`, `100.1234…`); 1 giờ frame+retry+ẩn/hiện → 0 đọc; đọc muộn trả về sau revoke không áp dụng (`controller.test`) |
| `unavailable` (terminal, `WAIT`) | `kind:"unavailable"`, `reason` | **terminal cho stream**: đóng stream; data giữ nhưng `posture:"not_confirmed"`; không tự thử lại; `retry` bấm tay cách nhau ≥ `retryMinGapMs` | chip "Unavailable"; `stale` + nút "Retry once"; dòng "Last read; not confirmed since." | 24 giờ không đọc gì (`controller.test`); không bao giờ `as_read` ở phase này (`machine.test`) |
| (không phải frame) snapshot trả `DENIED` | — | như `access_revoked` với cause cục bộ `SNAPSHOT_DENIED` | chip **"Access denied"** (khác "revoked": đọc bị từ chối ≠ quyền bị thu hồi) | `slice.test` |
| (không phải frame) header `NATIVE_SCOPED_STREAM_UNAVAILABLE` hoặc không có header | `readNativeBaselineHeaders` | `unavailable`, cause `STREAM_NOT_OFFERED`; không `open_stream`, không poll | "This read has no live stream behind it." | `machine.test`, `slice.test` |
| frame hỏng / lệch ngữ cảnh | `drop` có lý do (`MALFORMED`+detail, `WRONG_SEMANTICS`, `SERVER_PRIVATE_SHAPE`, `UNSUPPORTED_SCHEMA`, `CONTEXT_MISMATCH`, `GENERATION_MISMATCH`, `SOURCE_SET_MISMATCH`) | frame từ connection khác: **chỉ drop** (không đổi gì). Frame hỏng/lệch generation/source set trên connection của view: **fail-closed** = bỏ stream + đọc snapshot lại (nó có thể là lệnh revoke bị làm hỏng), cùng ngân sách resync | "Dropped: Another connection 1" / "Failed the published shape 1" | `reader.test`, `machine.test` R4/R7; bão frame hỏng → ≤ ngân sách rồi `unavailable` |

Quy tắc consumer của ELP2-REQ-09-001 và nơi chứng minh: *notification không bao giờ là financial event* → frame có kiểu không có trường nào chở số; `semantics != NOTIFICATION_ONLY` bị từ chối `WRONG_SEMANTICS`; *heartbeat không ngầm chất lượng/độ tươi* → kiểu heartbeat không có `quality`; *retained polling không bao giờ bật lại* → không timer khi không nợ đọc (`scale.test`, `controller.test`, `slice.boundary.test`: không `EventSource/WebSocket/fetch/XMLHttpRequest/sendBeacon/setInterval`, `setTimeout` chỉ trong `systemClock`); *frame sai context bị drop có lý do kiểu* → `checkScopedBinding` + `drops` theo lý do.

## 4. Fields: published vs consumed

| Contract | Published | Reader validate (đóng) | Hiển thị / dùng cho hành vi | Giữ nhưng không hiển thị | Cố ý bỏ |
| --- | --- | --- | --- | --- | --- |
| `ScopedRealtimeFrame` | 10 | 10/10 (+ ràng buộc chéo `if/else/allOf` của schema, 20 `detail` kiểu) | `event_type` → phase; `next_action`, `reason_code` → copy; `quality.{completeness,freshness,coverage,confidence,source_as_of_ms}` → `<details>` về notice | `resume_cursor` (giữ để mở lại, không bao giờ in/so sánh), `projection_generation` (pin + so), `quality.source_set_ref` (pin + so), `portal_observed_at_ms`, `quality.reasons` | `terminal`/`reconnect_required` chỉ là kiểm cấu trúc (hành vi suy ra từ `event_type`); `schema_version`/`semantics` chỉ kiểm |
| `Quality` | 8 | 8/8 | 5 trường như trên | 3 trường như trên | quality **không bao giờ** thành độ tươi của dữ liệu trên màn |
| `NativeProfileRealtimeHeaders` | 2 header | 2/2 (đóng, đúng 1 hoặc 2 khoá) | baseline cursor → `open_stream`; STREAM_UNAVAILABLE → `unavailable` | cursor baseline (opaque) | — |
| `EdgeScopedNotice`, `EdgeScopedNoticeBatch` | 3 | từ chối theo tên `SERVER_PRIVATE_SHAPE` | 0 (server-private, không bao giờ vào đường browser) | — | cố ý |
| `ManagerScopedResponse` | 13 khoá gốc | 13/13 (+ mọi cấp đóng, SS-1…SS-6) | `workspace_id`, `environment`, `read_at_ms`, `read_scope` (3 hằng + số policy revision), `profile_dispositions`, `completeness`/`reason_code` (câu chữ), `page.{visible,returned,limit,has_more}`, `items` | `surface`, `record_authority`, `source_authority` (hằng), cursor trang (chỉ biết có/không) | `financial_facts[]` (đọc, không in: grain chưa có quy tắc dedupe, xem UX-F04), `balance_*`/`pnl`/`exposure` trong `financial_totals` (đọc, không in: slice chỉ in `allocation` + `currency`), `is_full_resource` (đọc, giữ trong model) |

## 5. UX-F02/03/04/05/07/19/21: phủ đến đâu fixture cho phép

| ID | Phủ được (bằng chứng) | **Không phủ được** (lý do, cần gì) |
| --- | --- | --- |
| UX-F02 (1 alpha, nhiều peer) | Banner nói hằng số hợp đồng: "Scoped view: authorized rows only", "Totals cover the rows you can see"; chỉ in số do server cấp ("1 on this page, 1 visible to you, limit 50"), không "N of M", không %, không chữ "peer/others"; danh sách portfolio chỉ đếm **hàng trên trang này**; `model.ts` không export hàm total/sum/rank/share (`scopedRead.test`, `slice.test`) | Không có fixture "researcher có 1 alpha trong portfolio đông peer" đối lập với manager; field policy researcher chưa quyết (FE-026). Không thể chứng minh rò rỉ đếm/mẫu số qua tương phản |
| UX-F03 (đổi/thu hồi quyền khi SSE đang mở) | `access_revoked` và `DENIED` xoá dữ liệu có phạm vi khỏi view ngay, nói lý do, không retry; đọc về muộn không áp dụng; đổi context = connection mới = xoá dữ liệu cũ; frame muộn của scope cũ bị drop; `clear_scoped_data` cho chủ cache | **Cache của các màn đích** (Portfolio 360, Fleet, Alpha 360 có React Query riêng) **không** bị xoá bởi slice: chưa có điểm hook chung (nợ FE, §9). Không có export để thử; thay đổi ownership giữa chừng chỉ mô tả bằng `resync_required SCOPE_CHANGED` (đã xử lý như resync) |
| UX-F04 (nhiều deployment/stage, shared physical account) | Slice **không bao giờ cộng** balance; "Instances: None in this read" (không phải 0) | Fixture có `instances: []` duy nhất. Không có kịch bản tài khoản vật lý dùng chung → không chứng minh đếm unique/source-set |
| UX-F05 (All: Live+Canary thật, Paper/Sandbox mô phỏng) | Mỗi hàng giữ `environment` riêng; tiền giữ `currency` riêng, nhiều currency = nhiều ô, không cộng chéo (`scopedRead.test` UX-F05) | Fixture chỉ có `paper`, một currency, không có stage Canary trong facts có phạm vi → không dựng được tương phản NAV thật/mô phỏng |
| UX-F07 (thiếu fee/funding, valuation cũ) | `null` ≠ omitted ≠ `"0"`: omitted = "Not available · <reason của hàng>", `PARTIAL` giữ chuỗi thập phân chính xác và không tô theo dấu, "0" xuất bản là giá trị | Facts có phạm vi không chứa fee/funding/valuation-as-of → không có "metric/score N/A do thiếu fee" để hiển thị |
| UX-F19 (phân trang server, nulls, nhóm) | Trang là trang của server; không sort/total client; "More pages exist." khi `has_more`; số đếm đúng nhãn "visible to you" | Cursor trang mờ và **chưa có operation** để lấy trang kế → không có nút trang; không có sort/null/tie-break để kiểm |
| UX-F21 (reset epoch cache/replay, consumer chậm) | `resync_required` (kể cả `SLOW_CLIENT`): bỏ cursor, 1 đọc, mở lại có ngân sách; không nhân đôi hiệu ứng tài chính vì notice không tạo dữ liệu; "stale honest" = `not_confirmed` | Epoch reset trên cache thật và nguồn SSE thật: chưa có (không stream, không cache chung) |

## 6. Bác bỏ có chủ ý (deliberate omissions)

1. Không transport thật: không `EventSource`/`fetch`/`WebSocket`; `paths = {}` trong generated type nên **không có operation để gọi**; không tạo endpoint.
2. Không watchdog "stream im lặng": không có nhịp heartbeat/độ im tối đa được publish; mọi ngưỡng sẽ là bịa (xem request A).
3. Không polling thay thế, không lập lịch đọc định kỳ, không retry vô hạn. Retry duy nhất do người bấm, cách nhau ≥ 5 s.
4. Các hằng cấu hình (`coalesceWindowMs` 1.000 ms, `maxAutoResyncs` 3 / 60 s, `retryMinGapMs` 5.000 ms) là **lựa chọn của FE**, không phải giá trị đã publish (`DEFAULT_STREAM_CONFIG`).
5. Không hiển thị cursor/generation/source_set_ref/portal_observed_at; không dùng `quality` của notice để tô độ tươi dữ liệu.
6. Không tổng/sort/lọc/nhóm/xuất/saved view; không phân trang client.
7. Không chạm: `FRONTEND_BACKEND_SYNC.md`, `UNIFIED_IMPLEMENTATION_PLAN.md`, Source Truth Board, `FE_REQUEST_LABEL` (dùng FE-066 / FE-024 hiện có; không thêm id).

## 7. Source Truth Board

**Không hàng nào được chạm hay lật.** Slice là fixture (`SYNTHETIC_ONLY`); không có hàng nào thành `EXISTS_MOUNTED` và không có consumer receipt thật. Hàng liên quan để Codex quyết định có thêm hay không: "Scoped realtime `alpha_fleet_overview`" (contract+code vào repo, `SOURCE_DARK`; request C dưới đây). Ô "Not published (FE-xxx)" đang in: tên portfolio/alpha → `(FE-066)` (hàng gần nhất đang mở; **giả định cần chủ board xác nhận**, id không nói riêng về portfolio của scoped read).

## 8. Request (cho Codex; chưa gửi, không sửa file Codex)

Mã tạm `UXM08-REQ-x`; Codex/lead cấp ID chính thức theo §7.3 khi nhận. Mẫu §10.4 rút gọn.

| Mã | Locator | Quan sát vs mong đợi | UI bị chặn / hệ quả | Đề xuất nhỏ nhất | Done-when |
| --- | --- | --- | --- | --- | --- |
| A | `execution-scoped-realtime.d.ts` (`paths = {}`), handoff §"Backend integration boundary" | Chưa có operationId/route cho snapshot đặt tên `alpha_fleet_overview` và cho stream; không có nhịp heartbeat, độ im tối đa, cửa sổ gộp tối thiểu, ngân sách reconnect | FE không thể phát biểu "stream im lặng" hay chọn ngưỡng; mọi giá trị FE là giả định | Publish operation + 4 số trên (hoặc nói rõ là FE chọn) | Có trong generated type/OpenAPI + fixture kèm giá trị |
| B | `ScopedRealtimeFrame` | Frame không mang dataset/subscription → chỉ chống được frame sai context bằng danh tính connection của client | Frame của dataset khác trên cùng connection là không phát hiện được | Thêm trường `dataset` (enum các subscription đã đặt tên) vào frame; không lộ định danh | Schema + fixture + reader từ chối lệch |
| C | `NativeProfileRealtimeHeaders` / `Quality.source_set_ref` | Pin generation/source set hiện lấy từ frame live **đầu tiên**; frame đầu có generation lạ không phát hiện được | Pin muộn | Snapshot (header hoặc body) cũng mang `projection_generation` + `source_set_ref` baseline | Fixture snapshot có hai trường; reader pin từ baseline |
| D | `failClosed.test.ts` `DESCRIPTIVE` | Quét `\.field === true/false` coi `reconnect_required` là cờ an toàn chưa khai báo; reader mới đọc nó vào biến cục bộ để kiểm cấu trúc | Không chặn; nhưng lần sau ai đọc `.reconnect_required ===` sẽ đỏ | Thêm `reconnect_required` vào `DESCRIPTIVE` (file dùng chung, chủ gate quyết) | Một dòng + lý do |
| E | `SOURCE_TRUTH_BOARD.md` | Thiếu hàng cho scoped realtime | Ô "Not published" của stream không trỏ hàng mở | Thêm hàng `SOURCE_DARK` | Hàng có owner/request |
| F | `fixtures/execution-manager-scoped.synthetic.valid.json` | 1 hàng ALPHA_FLEET, 1 env, 1 currency, 0 instance; không có PORTFOLIOS | Không dựng được F02/F04/F05/F19 đối lập; danh sách portfolio phải suy từ hàng alpha | Fixture L0 thêm: ≥2 portfolio, ≥2 env, 2 currency, instance dùng chung account, `has_more=true`, 1 case researcher | Fixture + test conformance |

## 9. Nợ FE (không phải request cho Codex)

- **UXM08-DEBT-1** Cache của màn đích không bị xoá khi `clear_scoped_data`: cần điểm chung (query client eviction theo scope) khi nối thật. Chủ: Claude. Điều kiện: có stream thật hoặc cache chung.
- **UXM08-DEBT-2** Browser receipt (Playwright 1280/660, bàn phím/focus, request đếm/idle polling, deep link/back/reload) **NOT_RUN**; chưa có double e2e cho `/execution/slice`. Cần cờ `scoped` trong `playwright.config.ts` (file dùng chung, chưa sửa).
- **UXM08-DEBT-3** Baseline ảnh của `/execution/slice`: NOT_RUN (R2); build bật cờ đã chạy (xem §10) nhưng chỉ đếm chunk, không mở trình duyệt.
- **UXM08-DEBT-4** `productBoundary.test.ts` chỉ cấm import `*.fixtures`/`*.smoke`/`createFixtureApi`; slice nạp JSON canonical từ `packages/contracts` trong **một** module (`canonicalLane.ts`) nằm trong chunk lazy sau cờ. Test `slice.boundary.test.ts` giữ điều này (chỉ một module, chỉ một lối vào). Lead quyết nếu muốn cổng chặt hơn.

## 10. Kiểm chứng (R1; tất cả chạy không khoá, `--maxWorkers=2..3`)

| Gate | Kết quả |
| --- | --- |
| `npx tsc --noEmit -p .` | **exit 0** (cần `features/roadmap-task-board/frontend/node_modules`, symlink tới cây `portal-research-fe` chỉ để chạy, không commit) |
| vitest các đường dẫn của lát | **4.310/4.310 PASS** trong 10 file: reader unit 53, reader conformance 3.185 (L0–L3), machine 43, controller 20, scale 10, scopedRead unit 35, scopedRead conformance 925, màn 20, mount/cờ 6, boundary/CSS 13 |
| Gate chung: `v2Hygiene`, `productBoundary`, `absentValues`, `castLeak`, `failClosed`, `disabledReason`, `testHygiene`, `linkTargets`, `flags`, `flagOff`, `flagOn` | PASS (hai lần đỏ đầu do chính lát này — `reconnect_required` trong quét `failClosed`, và `if (!read.ok) return;` trong `testHygiene` — đã sửa trong lát, không sửa gate) |
| Build cờ tắt không phát chunk mới | `vite build` với `VITE_EXECUTION_V2_SCREENS` không đặt: 448 asset, **không có** `slice-*`, và không file nào chứa "Fixture frames, not a real stream", "Scoped slice", `alpha_fleet_overview`, `NATIVE_SCOPED_BASELINE_V1`. Đối chứng cờ bật (`scoped` + umbrella): 539 asset, thêm `slice-*.js` + `slice-*.css` chứa các chuỗi trên. Cơ chế = mẫu của mọi khoá V2: `import.meta.env.VITE_EXECUTION_V2_SCREENS ? lazy(() => import(...)) : null` (raw env, bundler gập) |
| `refresh-release-integrity-ledgers.sh --check` | current |
| Gate liên quan chạm `PortalRoutes.tsx` | `src/app` + `src/execution/v2/shell`: 21 file, 298 PASS + 3 skip có sẵn |
| NOT_RUN | vitest rộng (`src/execution src/styles src/app src/portal`), Playwright V2, visual pinned-image, hook đầy đủ — thuộc R2 |

Conformance (L0–L3) theo Rules §9.8.3: L0 fixture nguyên văn + digest không đổi + không họ publish nào khác đọc được thành frame; L1 hai ma trận so với schema làm oracle (1.920 và 648 trạng thái, reader chấp nhận ⇔ schema chấp nhận); L2 cursor 4096/4097, generation 256/257, 32 reasons, 20.000 lần đọc, chuỗi 70.000 ký tự, 100.000 notice và 1 giờ lưu lượng trên trục thời gian mô phỏng; L3 sinh âm tính (enum, required, string, integer, array, schema_version, prototype pollution, root xấu) — reader **không bao giờ lỏng hơn schema** (0 trong 265 payload sai schema của bộ revalidate; 0 trong 592 của scoped read); chặt hơn có chủ ý: SR-S1 (an toàn hiển thị), SR-S2 (miền Date), SR-S3 (reasons duy nhất) và SS-1…SS-6 cho đọc có phạm vi.

## 11. Consumer receipt — ELP2-REQ-09-001

```
ID: ELP2-REQ-09-001           Phase/Màn: UXM-08 (09/10 phần fixture)    Lane: FIXTURE_LAB
Người ký đề xuất: Claude (writer UXM-08 fixture-only) — cần lead/Bobby xác nhận ký (Rules §9.6: viết file không phải ACK)
Verdict đề xuất: ACCEPTED_FIXTURE_ONLY
Bằng chứng: §3 (ánh xạ 5 trạng thái + 3 nguồn trạng thái cục bộ), §4 (field published/consumed), §10 (4.310 test PASS, tsc exit 0)
Phạm vi được chấp nhận: hợp đồng published (schema+fixture 5 frame, 2 header, 3 server-private) đọc đúng; quy tắc consumer
  (notification không là event, heartbeat không là chất lượng, polling không bật lại, sai context bị drop có lý do kiểu)
  được giữ bằng reader + machine + màn + test, trên fixture.
KHÔNG chấp nhận / không claim: nguồn thật, SSE thật, receipt trình duyệt, tie-out nguồn→API→UI, bất kỳ hàng Source Truth Board nào.
CHANGES_REQUESTED (không chặn ACCEPTED_FIXTURE_ONLY, chặn ACCEPTED thật): UXM08-REQ-A, B, C (contract); F (fixture đa dạng); E (board).
Trạng thái handoff: AWAITING_CONSUMER_REVIEW → giữ cho tới khi Bobby/lead ký. Không có ACK nào đã được nhận.
```

## 12. Rollback

Tắt: không đặt `scoped` trong `VITE_EXECUTION_V2_SCREENS` (mặc định). Gỡ hẳn: xoá `readers/scopedRealtime*`, `realtime/`, `screens/slice/`, khoá `scoped` trong `flags.ts`/`flags.test.ts`, và 3 chỗ trong `PortalRoutes.tsx`. Không có schema, migration, backend hay dữ liệu bị chạm.
