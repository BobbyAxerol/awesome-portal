# UXM-09 — Operations và command UX (lane FIXTURE-ONLY)

Chủ: Claude (writer) · 2026-10-20 · base `claude/uxm-f9` @ `4ac2e3a7` · commits `24419ea0` (readers), `3326d23f` (UI) · Tier: **R1** (vitest focused + `tsc`); R2 chưa chạy.
Lane: **FIXTURE_LAB** (jsdom). Không Docker, không visual, không hook đầy đủ, không trình duyệt thật. **Không có gì ở đây chứng minh một lệnh đã từng được nguồn nhận.** Cổng gửi thật vẫn tắt: `Command sends are not connected to a source: UXM-09 fixture`.

**Cập nhật 2026-10-20 (vòng 2, nhánh `claude/fe-parity` @ `7df531d3` + `0febd295` mount, `384453fc` browser receipt):** story đã được **mount** sau cờ `command` tại `/execution/command` (§2, §8), có nhãn "Fixture story: not connected to a source; fake port", mỗi receipt tự nói "fake port"; browser receipt `FIXTURE_LAB` ở §11 (8 test, 1280 và 660). **Trạng thái đề xuất: ACCEPTED_FIXTURE_ONLY (không đổi); CHANGES_REQUESTED cho real-source lane còn nguyên (§6).** Vẫn **không** có gì chứng minh một lệnh đã được nguồn nhận: cổng gửi thật tắt, port là fake có kịch bản, không request nào tới route lệnh (§11 đếm bằng trình duyệt). `NOT_RUN`: R2 (vitest rộng, hook đầy đủ, baseline ảnh) → người tích hợp.

## 1. Entry gate
- Giao việc: lead (writer lane UXM-09 FIXTURE-ONLY), dựa trên ELP2-07 `coverage-and-handoff.md` §5 ("Handoff to Claude — NOT yet an assignment") và UXM-09 trong guide v1.1. Đây **không phải** duyệt của Bobby cho kết nối thật; không có mount route, không bật cờ nào.
- Pins: Portal `4ac2e3a7`; contract đọc từ `packages/contracts` cùng SHA; TS/PM/Edge: không dùng (source-dark). Source Truth Board: **không hàng nào đổi** (không hàng nào lên `EXISTS_MOUNTED`).
- Không sửa `FRONTEND_BACKEND_SYNC.md`, `UNIFIED_IMPLEMENTATION_PLAN.md`, `/home/bobby/portal-research`.

## 2. Đã dựng gì
| Phần | File |
| --- | --- |
| Readers chặt (đóng, chuỗi chính xác): plan, operation (base + F0), relay-denied, preview, problem, F0 collection | `v2/readers/commandOperation.ts` + `.test.ts` + `.conformance.test.ts` |
| Mô hình thuần: plan view, xác nhận gõ, cổng Submit, phân loại receipt, lookup, hàng disabled, bảng certification | `v2/screens/command/model.ts`, `lookup.ts`, `port.ts` |
| Hook luồng (khóa key theo intent, khóa payload khi UNKNOWN, chống double submit, quản lý focus) | `useCommandFlow.ts` |
| UI: Plan, Confirm, Receipt, Status lookup, Disabled operations, Certification, story page | `PlanPanel.tsx`, `ConfirmPanel.tsx`, `ReceiptPanel.tsx`, `StatusLookup.tsx`, `DisabledOperations.tsx`, `Certification.tsx`, `CommandFlow.tsx`, `index.tsx`, `parts.tsx`, `StepBar.tsx` |
| Fake port có kịch bản (không `fetch`, không URL, không socket) + dữ liệu story | `fakePort.ts`, `storyData.ts` |
| CSS (`.exec-cf-*`, token carbon, qua `v2Hygiene`) | `v2/css/command.css` |
| Cờ | key `command` trong `v2/flags.ts`; **2026-10-20: không còn pending** (`EXEC_V2_PENDING_KEYS = []`, bỏ trong cùng commit `0febd295` làm `PortalRoutes` đọc `isV2Screen("command")`), `flags.test.ts` |
| Mount (2026-10-20) | `app/PortalRoutes.tsx`: `V2Command = import.meta.env.VITE_EXECUTION_V2_SCREENS ? lazy(() => import(".../screens/command/storyRoute")) : null`, route `EXECUTION_COMMAND_ROUTE = "/execution/command"` có điều kiện `isV2Screen("command")` (cùng cách nối với `scoped`). Không phải feature trong registry, không có trong điều hướng. `storyRoute.tsx` = story page + catalogue công bố; `catalogueLane.ts` là module **duy nhất** của lane này nạp JSON `packages/contracts/fixtures/execution-command-catalog.valid.json` (qua reader V1 `adminCatalog`, như trước) |

Mount contract (đã thực hiện): default export của `v2/screens/command/storyRoute`, trong Router, sau cờ `command`; `command` đã bỏ khỏi `EXEC_V2_PENDING_KEYS` cùng commit mount. Reader catalogue V2 chặt vẫn **chưa làm** (cần lead đồng ý, §6 (c)): route dùng reader V1 `readCommandCatalogue`.

## 3. Bảng UX-F14…18 → component / state / test
Ghi chú: guide v1.1 định nghĩa UX-F14…16 là archive/reactivation, F17 là APPLIED+projection lag+venue, F18 là click lặp/timeout/back/cancel/reconnect.

| Case | Hành vi yêu cầu | Component / state | Test |
| --- | --- | --- | --- |
| UX-F14 Archive Live có positions/working orders | Pending disposition; không giả flat/trả vốn | `Certification.tsx` hàng `archive-live`: nút disabled, "Requires separate certification" + FE-034 | `command.test.tsx` "flows that require separate certification"; `model.test.ts` bảng |
| UX-F15 Monitor archived chưa provision/stale/quota | Không giả paper evidence | hàng `archived-monitor`, disabled | như trên |
| UX-F16 Reactivation đã review chưa certified | Không tự live/send funds; action gated | hàng `reactivate`, disabled | như trên |
| UX-F17 APPLIED + projection lag + venue partial | Ba trạng thái đồng thời, không duplicate command | `parts.tsx` `FacetList` (4 chiều độc lập), scenario `applied-lagging`: Applied / Catching up ("Never resubmit because a view is stale") / Pending; "Fill quantity and partial fills: Not published (FE-032)"; ACK+UNKNOWN cũng đúng | `command.test.tsx` "UX-F17…", "acknowledged is not applied"; `model.test.ts` "four answers" |
| UX-F18 click lặp/timeout/back/cancel/reconnect | request/status ổn định, không submit nhầm | `useCommandFlow`: `inFlight` ref chặn click 2; Enter không submit; form submit bị nuốt; UNKNOWN khóa payload, **Retry cùng key**, Discard có cảnh báo (focus vào "Keep the request"); lookup theo id; unmount giữa chừng; REPLAYED | `command.test.tsx` "one click sends one command", "Enter never submits", nhóm UNKNOWN (8 test), "an unmount during a send", "Query the same intent" |

Task 2 receipt states: ACCEPTED, REJECTED (có lý do typed: từ vựng 11 từ của `CommandPreview.reason_code` + `FAILED_BEFORE_SEND`), DENIED (RelayDenied đã publish), UNKNOWN (no answer / 5xx / unverified / unreadable / delivery unknown: "This command may already have been applied."), REPLAYED, ACCESS_STOPPED (401/403/404: ngừng hiển thị plan, lý do đã gõ, receipt cũ). Task 3: 64 catalogue + 8 capital + 6 họ chưa admit = 78 nút disabled, mỗi nút có lý do chính xác (`blocked_reason` của contract) và capability **chỉ khi đã publish** (`COMMAND_R1…R4` của staged-activation, chỉ cho lệnh bị chặn bởi relay); tên grant Portal = "provisional (FE-037)", không đặt tên. Task 4: 5 hàng "Requires separate certification" (F14, F15, F16, F17 = R3/R4 live, mainnet canary "never runs"), tất cả disabled, không handler, không prop/flag nào bật.

## 4. Không phủ được trên fixture, và vì sao
1. **ACCEPTED/REJECTED/UNKNOWN/REPLAYED không có body F0 nào publish.** F0 apply chỉ trả RelayDenied (409) hoặc không trả gì. Các trạng thái đó dùng lane CAPITAL **synthetic TEST_ONLY** (preview/status dựng từ từ vựng đã publish, schema-valid, `authority: TEST_ONLY`, màn hình nói rõ "Not a product receipt"). Không phải nhận lệnh thật.
2. **REPLAYED không có bit trên CommandStatus.** Chỉ có `replayed` trên plan F0. Ở lane capital, REPLAYED = "câu trả lời mang command id màn hình đã hiển thị" (suy ra phía FE, đã nêu trong UI); không phân biệt được "lần gửi đầu đã tới" với "retry tạo ra nó" khi chưa có id (UI nói "One key creates one command").
3. **Lý do source reject không publish** (CommandStatus REJECTED không có reason) ⇒ `Not published (FE-032)`. **Venue partial fill** không có trong từ vựng venue ⇒ cùng FE-032.
4. **Cost/impact của plan không publish** ⇒ `Not published (FE-020)`; xác nhận bắt buộc tick "I understand… none was computed". Không tính phía client.
5. **Tra cứu theo idempotency key không publish.** "Query the same intent" chỉ có khi đã có command/operation id; khi UNKNOWN không có id, UI nói thẳng "nothing to query by" và chỉ cho Retry cùng key.
6. **F0 apply không có idempotency key trong body** (route theo `operation_id`); "cùng key" ở F0 là key phía Portal (`command_apply:<uuid>`) mà fake port mô phỏng (cùng key khác payload ⇒ 409 `COMMAND_IDEMPOTENCY_CONFLICT`). Thật phải do Codex xác nhận.
7. Revoke chỉ mô phỏng bằng 403 ở fake; "revoke giữa chừng" thật, step-up, CSRF, giới hạn 60 giây của new-send authorization: không phủ (cần nguồn).
8. Họ **instance-registration** và **pending-control** (APPLY_PENDING/CANCEL_REMAINING): chỉ là hàng disabled (họ chưa admit); không UI preview/receipt riêng, chưa dùng `execution-instance-registration.d.ts`.
9. ~~Trình duyệt thật~~ **Đã có (2026-10-20, §11)** ở 1280 và 660, `FIXTURE_LAB`. Vẫn `NOT_RUN`: 390px, thứ tự Tab đầy đủ trên cả trang, đọc màn hình, axe riêng cho story. Visual baseline: `NOT_RUN` (chủ: người tích hợp/R2; story đã mount nhưng chưa có ảnh so sánh).

## 5. Source Truth Board và consumer receipt (ELP2-07 fixtures)
Source Truth Board: **không đổi hàng nào**. Đề xuất cột FE cho hàng command (khi lead cập nhật): reader `v2/readers/commandOperation.ts` · L0/L1/L2/L3 · màn = story fixture, chưa mount · FE-020/032/015/037/034 mở.

| Fixture | Receipt đề xuất | Ghi chú |
| --- | --- | --- |
| `execution-command-plan.valid.json` | **ACCEPTED_FIXTURE_ONLY** | L0 đọc + schema; 17/17 field consumed; cost/impact không có (FE-020) |
| `execution-command-operation.valid.json` | **ACCEPTED_FIXTURE_ONLY** | 12/12 field; refinement F0 (64 key, 1–3 blocker, warnings rỗng) |
| `execution-command-relay-denied.valid.json` | **ACCEPTED_FIXTURE_ONLY** | 6/6; `retry_allowed`/`source_request_sent` đọc fail-closed |
| `execution-f0-command-collection.synthetic.valid.json` | **ACCEPTED_FIXTURE_ONLY** (reader) | reader + L0–L3; **chưa có màn dùng** (gap (i) của §10.12) |
| `execution-command-catalog.valid.json` | **CHANGES_REQUESTED** (nhẹ) | đang đọc qua reader V1 `adminCatalog` (lỏng, không đóng); đề xuất reader V2 chặt; 64/64 hàng được dùng ở DisabledOperations |
| `execution-command-currency.synthetic.valid.json` + `execution-trusted-commands.synthetic` | **ACCEPTED_FIXTURE_ONLY** | dùng lại `commandCurrency.ts`; `ack_only` khớp bản sao trong story (test) |
| `execution-operation-workflow.valid.json` | **không tiêu thụ ở lane này** | thuộc màn Operations V2; không receipt từ lane này |
| `command.valid.json` (`command-envelope.v1`) | **không tiêu thụ** | envelope Research (`aggregate_type: run`), không phải lệnh Execution; chỉ lấy mẫu định dạng idempotency key (`^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$`) |
Ghi chú: ELP2-07 consumer vẫn là "AWAITING_CONSUMER_REVIEW" phía Codex; receipt trên là **đề xuất của Claude**, chưa được Codex ghi nhận.

## 6. Requests (cho Codex; chưa gửi; lead gán số FE mới)
Dùng id đã có khi khớp: **FE-020** (thêm: plan/preview phải publish cost/impact có đơn vị, chuỗi chính xác, hoặc "không có"), **FE-032** (thêm: lý do source reject typed; bit `replayed` trên CommandStatus; venue `PARTIALLY_FILLED` + số lượng; tra cứu theo idempotency key), **FE-015** (per-operation: capability + grant cần để bật, `reason_class`), **FE-037** (tên grant gửi lệnh), **FE-034** (archive/monitor/reactivate). Chưa có số: (a) F0 apply: publish body thành công/ACCEPTED hoặc xác nhận chỉ DENIED; (b) idempotency key cho F0 apply; (c) reader V2 cho catalogue (FE tự làm được nếu lead đồng ý).

## 7. Cổng đã chạy (R1)
- `tsc --noEmit` (toàn project): **exit 0**.
- vitest focused, `--maxWorkers=2`: 14 file, **15 620 test PASS** = readers `commandOperation` (conformance 15 250 + 18), `screens/command` 109 (model 39, command.test 55, storyData 15), `flags.test.ts`, và các cổng v2Hygiene, productBoundary, absentValues, castLeak, failClosed, disabledReason, testHygiene, linkTargets.
- Build tắt cờ (`VITE_EXECUTION_V2_SCREENS` không đặt): 448 asset, **0** chuỗi của lane này trong `dist` (không chunk mới; chưa module nào import `screens/command`).
- `NOT_RUN`: vitest rộng, visual, hook R2. Chạy ở mốc R2 trước hạ cánh. (Playwright V2 cho story: đã chạy ở vòng 2, §11.)
- **Vòng 2 (2026-10-20):**
  - `tsc --noEmit` (toàn project): **exit 0**.
  - vitest `src/execution/v2/readers realtime screens/slice screens/command flags.test.ts src/app scopedEviction.test.tsx --maxWorkers=2`: 44 file PASS, **47.122 test PASS**; 187 FAIL trong 4 file **không do lát này** (`readers/commandCurrency{,.conformance}.test.ts`, `readers/managerDataset{,.conformance}.test.ts`: reader của FE-A/FE-B, không file nào bị chạm; worktree sạch ở `7df531d3` cho 27 FAIL / 97 PASS trên hai file `*.test.ts`). Riêng `screens/command` + `flags.test.ts`: 144 PASS (gồm `command.mount.test.tsx` mới: cờ tắt ⇒ route không mount; mount chỉ khi manifest có `command` và có umbrella; nhãn story; catalogue đi theo route; một module duy nhất nạp JSON; chỉ lối vào lazy), `command.test.tsx` thêm 7 ca "a receipt from the scripted port says so".
  - Gate hygiene/chung (`v2Hygiene`, `productBoundary`, `absentValues`, `castLeak`, `failClosed`, `disabledReason`, `testHygiene`, `linkTargets`, `flagOff`, `flagOn`, `budgets` + 4 thư mục màn đích): 37 file, 2.180 PASS.
  - Build cờ tắt: 448 asset, **0** file `storyRoute-*`/`slice-*`, 0 chuỗi "Fixture story: not connected to a source", "Answered by the fake port", "UXM-09 fixture", "exec-cf-" trong `dist` (bản cờ bật: 545 asset, thêm `storyRoute-*.js/.css`).
  - Playwright `execution-v2-command.spec.ts`: 8/8 PASS, 19,3 s.

## 8. File dùng chung đã chạm (merge)
`v2/flags.ts` (một dòng `"command"` trong `EXEC_V2_SCREEN_KEYS` sau `"cockpit"`, `EXEC_V2_PENDING_KEYS = ["command"]`, một câu trong comment), `v2/flags.test.ts` (danh sách "knows every screen" và test reserved keys), `v2/css/command.css` (file mới trong thư mục chung). Không chạm `ExecutionPreviewRoute.tsx`, `PortalRoutes.tsx`, registry, token.

**Vòng 2 (2026-10-20), file dùng chung đã chạm (tối thiểu):** `v2/flags.ts` (`EXEC_V2_PENDING_KEYS = []`, bỏ comment "pending", +1 câu về `command`), `v2/flags.test.ts` (bỏ kỳ vọng pending, +1 test `command` mount), `app/PortalRoutes.tsx` (+1 lazy import raw-env, +`EXECUTION_COMMAND_ROUTE`, +1 `<Route>` có điều kiện; không chạm cái gì của `scoped`), `playwright.config.ts` (manifest 4176 thêm `scoped,command`), `v2/css/command.css` (+quy tắc `.exec-cf-page .exec-dock-*`: xem UXM09-DEV-2). **Không chạm** `ExecutionPreviewRoute.tsx` (story không phải màn registry, nên không đi qua nó; cùng cách `scoped`), registry, token, `testkit/schema.ts`, `FRONTEND_BACKEND_SYNC.md`, `UNIFIED_IMPLEMENTATION_PLAN.md`. Hook đích của UXM-08 (`portfolios/useRead.ts`, `fleet/useFleetRead.ts`, `alpha/useAlphaReads.ts`) thuộc lát UXM-08, không thuộc lane này.

## 9. Reuse report
Dùng lại: `Drawer.DockAction`, `Flag`, `SectionPanel`, `notPublishedText`, `receiptOutcome`, `commandCurrency` reader, `adminCatalog` (đọc + từ ngữ), tiện ích văn bản độc hại của `request/model`. Mới (lý do): `FacetList` bốn chiều (có nghĩa nghiệp vụ, dùng được cho Operations/Account), phân loại receipt, fake port. Lệch HiFi: không có HiFi cho receipt lệnh; CSS lấy số đo từ New request.

## 10. Rollback
Tắt: không đặt `command` trong `VITE_EXECUTION_V2_SCREENS` (mặc định) — route không mount, build không có chunk. Gỡ hẳn: xóa `v2/screens/command`, `v2/css/command.css`, `v2/readers/commandOperation*`, `e2e/execution-v2-command.spec.ts`, bỏ key `command` (và `scoped,command` thêm vào manifest 4176 trong `playwright.config.ts` nếu `scoped` cũng gỡ), bỏ `V2Command`/`EXECUTION_COMMAND_ROUTE`/`<Route>` trong `PortalRoutes.tsx`. Không đổi runtime/DB; không có lệnh nào từng được gửi.

## 11. Browser receipt — `FIXTURE_LAB` (2026-10-20, `384453fc`)

`e2e/execution-v2-command.spec.ts`, project `chromium-v2`, build cổng 4176 (manifest có `command`). **Làn: `FIXTURE_LAB`, không có `BFF_DOUBLE` nào được hỏi**: story không tạo request nào; trình duyệt chỉ gọi các đọc của shell (auth context, registry, summary, access/self). Mọi receipt trên trang là câu trả lời có kịch bản của **fake port**, và tự nói vậy ("Answered by the fake port: a scripted fixture answer, not a receipt from any source."). **Không** có gì ở đây chứng minh một lệnh được nhận, áp dụng hay hiểu bởi bất kỳ hệ thống thật nào.

| Test (8) | Khẳng định | Kết quả |
| --- | --- | --- |
| nhãn + overflow + console + zero writes @1280 và @660 (2) | `role=note` chứa "Fixture story: not connected to a source; fake port"; `scrollWidth - clientWidth ≤ 0` lúc tải, khi mở plan + form, và khi receipt Denied hiện; đường gửi thật là nút disabled với đúng câu "Command sends are not connected to a source: UXM-09 fixture" và click ép lên nó không làm gì; receipt Denied chứa "fake port"; console sạch, 0 request ra ngoài origin; **0 request ghi** (mọi method ≠ GET/HEAD) và **0 request tới bất kỳ route nào khớp `commands|plans|apply|operations|approvals|ecm_`** | PASS |
| mọi trạng thái receipt @1280 | `f0-denied` (Denied by the relay), `accepted` (Accepted), `rejected-preview-changed` (Rejected), `timeout-then-landed` (Outcome unknown), `revoked` (Access changed): mỗi receipt có đúng câu fake port, không overflow; vẫn 0 ghi, 0 route lệnh | PASS |
| UNKNOWN khoá payload, retry cùng key @1280 | "This command may already have been applied."; lý do và ô gõ xác nhận `:disabled` (fieldset), checkbox disabled; key trong Provenance (`request key …`) giữ nguyên sau "Retry with the same key"; số lần gửi 1 → 2; câu trả lời là Accepted/Already recorded và vẫn nói fake port; không có nút nào gửi bằng key thứ hai | PASS |
| double click gửi một lần, Enter không submit @1280 | Enter trong ô xác nhận và trong ô lý do: không receipt, Submit còn đó; `dblclick` trên Submit: Provenance `sends 1` | PASS |
| Submit đóng + Space @1280 | Submit `aria-disabled=true` và còn focus được; câu "Still needed" nêu cái thiếu; click ép lên nút đóng không gửi; đủ điều kiện thì Space gửi một lần và receipt nhận focus | PASS |
| 84 điều khiển disabled mang lý do @1280 | 1 đường gửi thật + 78 thao tác (64 catalogue, 8 capital, 6 họ) + 5 luồng cần certification: đủ **84** nút `disabled`, mỗi nút có `aria-describedby` trỏ tới đoạn chữ không rỗng (≥12 ký tự), **0** nút bật trong vùng "Operations that are not sendable"; mở một nhóm thì lý do hiển thị cho người đọc; "Requires separate certification" hiện | PASS |
| luồng đầy đủ @660 | plan → UNKNOWN, rồi mở **mọi** nhóm thao tác: không overflow; 0 ghi, 0 route lệnh, console sạch | PASS |

**Thời gian:** 19,3 s (8 test, 2 worker, build có sẵn). **Phát hiện và sửa:** ở 660 px story tràn ngang 98 px (rồi 7 px) vì dòng "blocked action" của dock (vẽ cho footer drawer rộng: tên hành động + lý do một dòng + link không co được) — sửa trong `command.css` (UXM09-DEV-2). **Chưa chứng minh / không claim:** bất kỳ đường gửi thật; 390 px; thứ tự Tab đầy đủ; đọc màn hình; baseline ảnh; "double click" là hai click liên tiếp của Playwright, không phải mọi cách người dùng bấm lặp; số lần gửi đo ở Provenance của chính trang (không có request nào để đếm, vì port là fake).

## 12. Trạng thái và các lệch UX cần xác nhận (vòng 2)

**Trạng thái đề xuất cho các fixture ELP2-07 (§5): không đổi**; thêm: *mount + browser receipt*: ACCEPTED_FIXTURE_ONLY cho story, **CHANGES_REQUESTED** giữ nguyên cho real-source lane (§6: FE-020/032/015/037/034 và (a) body ACCEPTED của F0 apply, (b) idempotency key của F0 apply, (c) reader V2 cho catalogue). `NOT_RUN` (chủ: người tích hợp ở R2): vitest rộng, baseline ảnh pinned-image của `/execution/command`, hook đầy đủ, config Playwright nguyên bản 3 webServer (spec chạy bằng config cục bộ chỉ có webServer 4176, cùng env/build, không commit).

Ba lệch cần lead/Bobby xác nhận (không tự chốt; mỗi cái nhỏ, đảo ngược được):
- **UXM09-DEV-1** Receipt có thêm một dòng cố định "Answered by the fake port: a scripted fixture answer, not a receipt from any source." (`data-notice="fake-port"`, chỉ khi port là `fixture`), do yêu cầu "receipt phải nói fake port". Component `ReceiptPanel` không đổi cấu trúc; dòng nằm trong receipt, trước Provenance. Bỏ: xoá `FakePortNote` (hai chỗ gọi).
- **UXM09-DEV-2** Trên trang story, dòng "blocked action" của `DockAction` wrap thay vì một dòng cắt bớt; **lý do được in đủ** (không còn `text-overflow: ellipsis` ở trang này). Lý do: tràn ngang 98 px ở 660 px; màn cảm ứng không có hover để xem lý do bị cắt. Chỉ trong `.exec-cf-page`, không đổi `dock.css` hay cách dock dùng ở nơi khác.
- **UXM09-DEV-3** Banner đầu trang có thêm nhãn in đậm "Fixture story: not connected to a source; fake port." trước câu cũ; chữ "Fixture only" và câu cũ giữ nguyên.
