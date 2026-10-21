# Review tổng thể → Claude: backend, frontend và đường nối Edge

Thời điểm: **20/10/2026, 20:15 giờ Việt Nam**. Reviewer: Codex + ba subagent
đọc độc lập; implementation owner tiếp tục là **Claude**, theo Bobby và
[rules §10.13](../../AGENT_WORKING_RULES.md).

Đây là review/handoff trong các phase hiện hữu, **không mở campaign/phase mới**.
Các nhãn RV dưới đây chỉ giúp theo dõi review; request FE/ELP2 gốc vẫn là ledger
chính. Không sửa code, contract, runtime hay baseline trong lượt review này.

## 1. Pins, phạm vi và kết luận

- Canonical: `/home/bobby/portal-research`, `docs/research-loop-plan`,
  `7818d5631e0da37563bca5715fd46d40b66ef1de`; docs WIP của nhiều bên được giữ nguyên.
- Claude: `/home/bobby/portal-research-fe`, `claude/fe-parity`,
  **`0ec70a08b3cb0a6b6ede0a36cf3a8d68d5f26e52`**, cây sạch khi đọc.
  Ahead canonical **290 commit**, behind **0**; diff từ merge-base:
  **874 file, +175.690/−5.558 dòng**. Đây là cả phần tích lũy chưa landing,
  gồm generated/test/docs, không phải lượng code viết hôm nay.
- Review đối chiếu Unified §14, rules, design register/HiFi, source board,
  BE-P6…13, consumer receipts, UXM-07…10, actual readers/ports/routes/charts/tests.
  Locator code trong bảng sau là tại **peer pin trên**, không phải installed Core.
- Source Edge trong lượt này được đối chiếu qua handback mới nhất đã vào peer,
  **không có phiên SSH xác minh runtime mới**. Repin HK trước commissioning;
  không dùng receipt lịch sử làm current authority.

**Có tiến triển thực sự**, không phải chỉ đổi Markdown: Manager Dataset/Fleet,
series ratio/unit, self-context/step-up, scoped Alpha/records, catalogue và V2
command consumer đã có; nhiều lỗi focus/overflow đã được sửa. Tuy nhiên,
**chưa đủ để gọi toàn bộ backend–frontend–Edge hoàn tất**:

1. Có một lỗi tương thích V1 đã tái hiện bằng fixture canonical.
2. Có field đã publish nhưng frontend chưa nối; có user story mới dừng ở port.
3. Có thiếu sót UI/accessibility/chart và fixture cần làm ngay, không chờ Edge.
4. Core009, financial publication, scoped stream và một số command family còn
   commissioning/source work thật. Fixture đầy đủ không thay thế phần này.

Các file peer được dẫn bên dưới chưa mặc nhiên nằm trong canonical. Claude đọc
trên lane hiện có; integrator đối chiếu/land sau, không copy đè cả Unified/ledger.
Đọc cùng [all-backend handoff](CLAUDE_ALL_BACKEND_HANDOFF_2026-10-20.md), nhưng
**các disposition mới trong review này thắng nhận định cũ đã bị source/receipt mới thay thế**.

## 2. Những việc đã có — không giao làm lại

| Phần | Kết luận hiện tại |
| --- | --- |
| Manager Dataset + Fleet | Port và consumer đã nối; còn completeness của filters, fixture và design review của control mới |
| Series | `ratio_scale`, metric/unit/currency invariants và consumer đã có; publication writer/nguồn thật là việc khác |
| Access | Self-context, batch eligibility v2, capital-family step-up, self-entry consumer đã có; registry chính thức và một số control còn thiếu |
| Scoped Alpha/subject records | Dispatch/reader/consumer đã có; thiếu một số source semantics, không phải thiếu toàn bộ màn |
| BE-P13 | Catalogue served schema, V2 denial envelope, submit `replayed`, lookup reader và typed absence đã giao; V1/UNKNOWN UI còn thiếu |
| UXM-10 | Overflow/Access/Esc exception maps đã rỗng; Accounts tablet, sticky focus, drawer Summary, Replay false pointer đã sửa |
| Copy | Stage copy diet đã giảm chữ và giấu request IDs khỏi phần nhìn chính; cần giữ lý do truy cập được bằng bàn phím/touch |
| Core008 / Core009 revision3 | 008 là installed proof riêng. Ba lỗi source session/short-write/dry-run cũ của 009 đã được sửa và có qualification tập trung; không mở lại chúng |
| UDB-04 | Closeout 11/10 đã có receipt đúng phạm vi; không dùng OPEN lịch sử để bắt làm lại toàn bộ UDB |

## 3. Review hành động — ưu tiên sửa phần làm được ngay

Path rút gọn `FE/` = `apps/portal/frontend/src/execution/`;
`BE/` = `apps/control-api/src/`; `EV/` = `upgrade/execution_loop/evidence/`.

| Review / request gốc | Bằng chứng và phân loại | Claude làm tiếp / gate đóng |
| --- | --- | --- |
| **RV-01 · BE-P13 · ưu tiên 1** | **Lỗi tái hiện:** `FE/commandPlan.ts:273–285` đọc root, trong khi 409 có `details.source_request_sent:false`. `FE/api/httpApi.ts:1614` vẫn gọi reader này. Kết quả hiển thị “đã tới TS/UNKNOWN” dù nguồn nói chưa gửi. Consumer BE-P13 đã CHANGES_REQUESTED | Đọc đúng envelope mới, giữ fail-closed khi thiếu/malformed. Regression first/replayed denial, conflict, danger flags, các schema Governance dùng chung URL. Không bật F0 apply hay đổi quyết định authority |
| **RV-02 · BE-P12 / FE-067/071/072** | **Đã publish một phần, FE chưa nối:** `FE/v2/readers/dispatch.ts:315` thiếu `include`; `FE/api/httpApi.ts:971` bỏ option; strict roots ở `governanceParents.ts:1245`, `liveSourceOperations.ts:225` chưa đọc. Sandbox/Canary có optional identity; Live thêm partial stage facts. Sandbox/Canary scoped stage facts vẫn NOT_DELIVERED | Nối đúng từng member có thật qua options→HTTP→strict reader→view-model. Không gộp cả ba thành “đã đủ stage facts”. Test opt-in/no-opt-in, malformed/partial, late response/revoke; mở rộng field policy/purpose trước khi bổ sung fact còn thiếu |
| **RV-03 · BE-P13 UNKNOWN story** | Lookup NONE/FOUND/CONFLICT có reader/port, nhưng `FE/v2/screens/command/ReceiptPanel.tsx:211` vẫn nói không có id thì không query được. `current_primitive` chưa hiện; `parts.tsx:76–78` suy fill absence từ venue; V1 catalogue chưa hiểu N16B | Thêm query bằng operation/request key, không tạo key mới để dò. Hiện primitive và `venue_fill` từ typed member. Test timeout→lookup→FOUND/CONFLICT/NONE; giữ UNKNOWN khi chưa biết. V1 vocabulary theo served catalogue, không “no reason” khi server đã gửi lý do |
| **RV-04 · shared chart** | **Nguy cơ lỗi từ source, chưa tái hiện browser:** `FE/v2/charts/EquityPanel.tsx:138,213–218` giữ cursor ordinal rồi dereference trên series mới; Portfolio Overview đổi series không reset. `CompareOverlay.tsx:92,166` tương tự | Test rerender series dài→ngắn, window/metric/data change khi cursor pinned/keyboard. Preserve theo timestamp hoặc reset/clamp an toàn; xử lý empty/discontinuous series. Giữ component/design hiện có, không thay thư viện chart |
| **RV-05 · UXM10 F-5** | `e2e/execution-v2-coexistence.spec.ts:761–770` còn KNOWN_AXE trên **7 route variants** Sandbox/Workbench: scroll region không focusable; Sandbox Steps còn link-in-text. 138 test PASS có chứa assertion xác nhận các lỗi này tồn tại | Sửa đúng scroll region/tab semantics/inline link. Chạy lại axe+keyboard các route bị ảnh hưởng ở desktop/tablet/mobile, xóa exception khi lỗi đã hết. Không gọi 138 PASS là axe-clean |
| **RV-06 · copy diet** | `FE/v2/blocks/notPublished.tsx:215–244` compact reason chủ yếu nằm trong `title` của phần tử không focusable | Giữ copy ngắn, một Details có thể mở bằng keyboard/touch cho lý do/next action/provenance. Không khôi phục paragraph dài hoặc đưa FE-id ra headline; test touch và keyboard, không chỉ hover |
| **RV-07 · UXM10 F-8** | `FE/ExecutionPreviewRoute.tsx:343–354` đã có value-stable API nhưng mới Sandbox dùng; tab ở các màn khác có thể đổi API identity và lặp GET | Stabilize theo **giá trị policy/scope**, không cache quyền/tài chính dùng chung. Test tab thuần trình bày không đọc lại; workspace/query/auth thay đổi phải invalidation, abort hoặc fence response cũ |
| **RV-08 · Portfolio T-B5 / UXM07-008** | HiFi `design/hifi/v2/portfolio.html:35,158` có Table/Expand; `FE/v2/screens/portfolios/portfolio/Overview.tsx:72–97` hiện chủ yếu series/Export | Nối table cùng published points và shared expand affordance; focus/close/resize/mobile. Không tính thêm metric hay đổi units/denominator. Gate screenshot đối chiếu đúng HiFi + keyboard |
| **RV-09 · Manager/Fleet** | Consumer đã có nhưng `FE/v2/screens/fleet/index.tsx:152–172` derive owner/health options từ page đang tải; control “Fleet read / Manager dataset” ở `:329` là thay đổi chưa design-review | Không coi page options là toàn bộ authorized population. Publish authorized option metadata/search hoặc ghi rõ giới hạn. Đề xuất source selection tự động theo authority hoặc lựa chọn có ý nghĩa với manager; xin review đúng thay đổi thiết kế, không tự che nguồn |
| **RV-10 · Paper/cockpit FE-027…039** | `EV/UXM-07/consumer-receipt-be-p5-2026-10-20.md:56,73,156–158`: Paper exit control và discovery `expected_versions` chưa nối. Cockpit Archive/Reactivation/Capital unselectable; Fleet Archived không đọc dữ liệu | Hoàn thiện flow có contract: request→inbox→reviewer→decision/status đọc lại, workspace/target/version nhất quán. Với family chưa có writer, làm fixture story đầy đủ và typed-disabled product; giữ source request rõ, không tự dựng executor |
| **RV-11 · Alpha/replay R-5…R-9** | `EV/UXM-07/consumer-receipt-alpha-scoped-2026-10-20.md:79–83`: thiếu unit/clock order/fill, identity/name/version, deployment financial grain, reconciliation detail, order-leg/liquidity/fee. Một số record trả về không đủ timestamp để vẽ | Backend repin nguồn, publish từng field/purpose có authority; fixture→reader→chart. Ghi số record nhận/hiển thị/không thể đặt lên timeline. Không suy SL/TP/OCO từ suffix, không đoán ms/s hoặc join Research name bằng display ID |
| **RV-12 · fixture completeness / UXM08** | `execution-manager-scoped.synthetic.valid.json` chủ yếu ALPHA_FLEET một item, BINDINGS rỗng, `has_more:false`; chưa chứng minh PORTFOLIOS/multi-env/currency/shared-account/researcher/paging | Bổ sung canonical fixtures L0–L3 theo §5; role/scope trước aggregate, multiple cursors, partial/denied/revoked. Shared account không double-count; Compare mixed units phải incomparable. Không dựng UI riêng cho fixture |
| **RV-13 · BE-P13 migration146** | Append-only F0 attempts/lookup đã có source, nhưng packet ghi actual PG/HTTP migration gate NOT_RUN | Một disposable PG gate: first/replay/conflict, actor/workspace isolation, revoke-before/after-await, immutability, lookup HTTP. Kiểm migration number collision; BE-P7 alternative146 chỉ là proposal, không tạo hai migration cùng số |
| **RV-14 · self-entry / FE-054 remainder** | Self-entry workaround có rồi; registry rev7 formal entry chưa có. FE-054 decimal v2 có rồi; observed-timeline outcome còn thiếu | Hoàn thiện registry với guard self/admin riêng; chỉ bổ sung outcome/navigation còn thiếu. Không làm lại batch-v2/step-up/exact-decimal |

Các locator trên được kiểm theo pin §1; dùng symbol khi dòng dịch chuyển.
Phân biệt **bug**, **consumer missing**, **source missing** và **design acceptance**
trong ledger. Không biến tất cả thành “đợi Codex/Edge”.

## 4. Backend/phase còn nợ — không gộp với UI fixture

| Phase / family | Trạng thái chính xác và bước tiếp |
| --- | --- |
| ELP2-02…04 | Nền identity/policy/scoped readers có source và tests; BE-P10 release gates, BE-P12 scoped additions và BE-P13 migration phải qua impacted integration. Không gọi tất cả chưa làm, cũng không suy installed từ source |
| Core009 / ELP2-09…10 | Claude tiếp tục ordinary R3→image/config/policy/session→Research ready return trong quyền đã giao. Latest Edge handback có **89 focused tests, gồm 3 PG thật**, đã cung cấp `field_policy_ref`; không còn ba source bugs cũ. R3 runner cần mount đúng **7 public templates RO**. Sau đó Edge mở fresh bounded window, kiểm READ và STREAM riêng, revoke/restart/recovery/zero-custody cleanup. Không reissue identity008 đã COMMIT/ACK |
| ELP2-09 scoped realtime | DTO có nhưng generated paths/operations còn rỗng; cần named snapshot/stream cho `alpha_fleet_overview`, baseline/generation/cursor/gap/heartbeat/silence/reconnect caps. `/execution/slice` stream unmount trước khi tới target screen nên chưa chứng minh whole-product eviction. Native Core009 transport không tự đóng gap scoped screen này |
| ELP2-05/06 financial | Schema/readers/ratio có; bounded publication/materializer và nguồn đủ methodology, cashflow/FX/population/economic revision chưa đủ. Alpha/Deployment series chưa built. Làm off-request writer/lease/checkpoint theo contract; không tính nặng per browser, không gọi retained equity là NAV/TWR đã qualified |
| ELP2-07/08 workflow | Capital8/registration/pending-control có phần source-dark, không dựng lại. Còn per-family lock, reallocation3target, binding, move dual-scope, physical-profile readback, lifecycle dispatch/census, RETURN_CAPITAL/risk writer. BE-P13 source pins18/10 đã cũ: SSH repin từng family trước thực hiện; catalogue ≠ executor, ACK ≠ APPLIED |
| ELP2-10 qualification | Matrix hiện **0/14 CONNECTED_VERIFIED**, không có nghĩa 14 module chưa viết. Cần financial input, budget/calibration/RPO-RTO approved, mixed/coexistence/P184 performance G2 và browser. Re-pin affected score/lease dependencies Q03/Q13/Q19; reuse phần không đổi bằng hash/impact, không chạy lại máy móc |
| ELP2-11 | Chưa đủ entry. Không tự merge dev/main, signed release, deployment hay mở command/Live |
| UXM-01…06 | Thiết kế đã approved theo register mới; không quay lại light Governance/lowfi đã superseded |
| UXM-07 | Các màn chính/subscreen đã có nhiều implementation nhưng RV-02…12 còn consumer/story/UI/fixture acceptance. Route tồn tại không chứng minh story đủ |
| UXM-08/09 | Read/command stories và fixture-browser đã có. Cần từng family real API receipt trên authority đủ; fake port không được trở thành live authority |
| UXM-10 | 138 fixture-lane PASS là receipt của pin riêng; còn known axe và current-contract/story/visual retake có impact. Không coi capacity được đo từ BFF double là production budget |
| Research/UDB carryover | UDB-04 closeout có rồi. Research P23/P24 cần candidate/dependency/custody và affected cross-loop acceptance, nhất là GOV-C4/FE-GOV-C01…06. Giữ 83/86 + ba ngoại lệ đã duyệt, engine upgrade/scenario dispositions đã có; không mở lại 24 engine runs. Sau V2 review cần regression các shared shell/auth/route/chart có đổi, không retest toàn QuantBT không liên quan |

Nguồn phase matrix:
[peer closeout plan](</home/bobby/portal-research-fe/upgrade/execution_loop/evidence/BE-CLAUDE-2026-10-20/ELP2-10_CLOSEOUT_PLAN_2026-10-20.md>),
[peer Core009 return](</home/bobby/portal-research-fe/upgrade/execution_loop/evidence/ELP2-10/CLAUDE_CORE009_PRIORITY_HANDOFF_2026-10-20.md>),
[peer BE-P13](</home/bobby/portal-research-fe/upgrade/execution_loop/evidence/BE-CLAUDE-2026-10-20/BE-P13.md>).

## 5. Kiến trúc fixture → API và ma trận nghiệm thu bắt buộc

Giữ chuỗi **Edge/PM fact → authorized BFF → versioned schema/generated →
strict reader → cùng domain view-model/component**. Fixture và HTTP dùng chung
port/reader. Production transport vẫn same-origin BFF; không fixture fallback
khi API 403/404/malformed, không browser gọi HK trực tiếp, không đưa secrets vào JS.
Chuyển nguồn là composition theo capability/authority đã qualify, không fork màn.

Mỗi family cần một hàng kiểm:

`source locator/pin → endpoint+schema → fixture → reader/port → route/subscreen →
field/action consumed → consumer verdict → installed pin → real receipt`.

Fixture coverage tối thiểu, **không tạo Cartesian product vô hạn**:

- L0 canonical; L1 valid partial/empty/stale/denied/revoked/policy-pending/
  disconnected/UNKNOWN; null/0/N/A khác nhau, finance dùng exact decimals.
- L2 nhiều page/cursor, nhiều account/env/currency, shared physical account,
  long labels/time windows, authorized researcher subset và large-but-bounded
  series. Không sample một page rồi gọi toàn population.
- L3 malformed/version mismatch/extra sensitive fields, wrong workspace,
  stale revision, late response sau scope đổi, revoke giữa request/stream.
- Workflow: same-key replay/conflict, expiry, response loss→lookup, independent
  reviewer, captured-parent/version binding. Không fake positive source command.
- Khi real family qualified: lưu sanitized REAL_RECEIPT, chạy **cùng consumer**,
  đối chiếu grain/time/unit/population và advertised capabilities; không sửa
  fixture để che dữ liệu thật.

Route/subscreen inventory phải bao gồm:

1. Overview; Portfolio list/detail/compare, chart table/expand, Activity.
2. Fleet table/board/map/archive; Alpha360 và Replay, deployment drilldown.
3. Accounts/bindings/detail, Blotter, Operations/incident/detail.
4. Paper workbench/fills/VN-market; Sandbox steps/plans; Canary guard-rule;
   Live continuity; cả legacy/scoped version variants.
5. Approvals inbox/R1/R2/Live/Exit; New request page/drawer; capital/archive/
   reactivation story và status/recovery.
6. Users, admin actions, self-access vs management-access; old deep-link aliases.
7. Research→RC→Inbox→stage→back, workspace/filter/tab/window trên URL/reload.

Mỗi ô ghi **DONE_FIXTURE / DONE_REAL / BLOCKED_SOURCE / NEEDS_DESIGN_REVIEW /
NOT_APPLICABLE có lý do**, không chỉ “route loads”. Có loading/empty/error,
keyboard/touch, mobile/tablet/desktop, chart exact points/clock/units, no console
error/overflow, và request budget. So đúng
`design/review2/00-decision-register.md` + `design/hifi/v2/` current revision,
không tự re-record baseline để nuốt mismatch.

## 6. Chia subagent và thứ tự làm gọn

Claude lead giữ **shared contracts/generated/migrations/composition/ledger và
integration**. Tối đa ba worker độc lập cùng lead; giao file ownership trước
khi viết, không nhiều agent sửa `httpApi.ts`, `ExecutionPreviewRoute.tsx`,
shared chart hoặc một schema cùng lúc.

| Đợt | Lead | Worker A | Worker B | Worker C |
| --- | --- | --- | --- | --- |
| 1 — sửa gap local | RV-01, BE-P13 PG gate và Core009 ordinary gate/ready preparation; chốt shared file ownership | RV-02 scoped port/reader/view-model, backend thiếu báo lead | RV-04/05/06/08 shared chart/accessibility/copy/tools | RV-03/09/10 command/cockpit/Fleet story; nếu đụng shared file thì trả patch để lead tích hợp |
| 2 — coverage | Lead tích hợp schemas/fixtures/registry, source-owner request và field truth board | RV-11 source-to-field audit, scoped contracts qua lead | RV-12 canonical fixture/consumer conformance; không đổi implementation để ép test | Route/subscreen/HiFi/browser review độc lập; lập dispositions, không tự đổi baseline |
| 3 — connected | Một owner làm exact Research install/window; Edge xác nhận source pins và lifecycle | Named read/stream consumer theo đúng family đã qualify | Financial writer/family command độc lập khi đủ source | Impact matrix và connected browser, read/write scopes tách riêng |

Một job Docker/PG/build/R3 nặng tại một thời điểm theo lock/rules. Focused tests
theo file thay đổi trước; integration milestone mới chạy normal gate đầy đủ,
không chạy full hook sau từng chỉnh copy. Không bỏ hook/gate bắt buộc hoặc tự
gọi focused evidence là ordinary R3. Giữ `PENDING_GATE` cho các slice đã dùng
exception batching được duyệt, rồi đóng tại milestone. Không nới SLO cho pass.

Nếu Core009 chờ cửa sổ, tiếp tục worker local; không mở listener chỉ để chờ,
không tạo thêm identity hoặc dùng credentials stable. Cleanup chỉ exact
temporary sessions/grants/resources của round, giữ backup/audit/rollback.

## 7. Verification thực hiện trong review này

**Fresh diagnostics, không phải release gate:**

- Năm file Vitest: `commandPlan.test`, `productBoundary.test`,
  `v2/linkTargets.test`, `v2/readers/commandCatalogue.test`,
  `v2/readers/commandCatalogue.conformance.test`: **5/5 file, 6.790/6.790 cases
  PASS**, 14,37 giây, maxWorkers=2. Phần lớn là parameterized conformance,
  không phải 6.790 user journeys độc lập. Host Node20.20.2 không phải pinned
  Node22 release runner; kết quả chỉ diagnostic.
- Probe trực tiếp canonical
  `execution-command-apply-denied.valid.json` qua actual V1 `readRelayDenial`:
  input `details.source_request_sent=false` → output `sourceRequestSent=true`,
  `operationId=null`, copy “already reached the Trading System”.
  **RV-01 CONFIRMED**. Existing test suite xanh chưa cover envelope mới ở V1.
- Chromium chỉ GET/HEAD trên `http://127.0.0.1:8095/execution`, chặn writes/
  ngoài origin: V2 Overview có mount, FIXTURE DATA banner có, 0 pageerror,
  0 write attempt. Bundle `/assets/index-DW2TfJW0.js`. Chưa có artifact binding
  chứng minh bundle này là peer pin hiện tại; **không dùng làm current HiFi/
  32-route/real-source acceptance**. Không login/create session hoặc rebuild.
- Chart cursor là source finding cần regression reproduction, chưa khai là
  browser crash quan sát được. Accessibility exceptions đọc từ current test
  source; không nói vừa chạy axe ở lượt này.
- Không full suite, Docker/PG, SSH runtime, migration, image build, service
  restart, account/grant change, merge/push/deploy. Chromium đã đóng; không tạo
  stack/session/grant/test identity. C4: **NO_ACTION_NEEDED** cho runtime resources.

## 8. Giao lại / báo cáo round kế tiếp

Claude ACK pin trước làm, đọc latest peer delta và request mới từ Edge. Không
đợi Codex implement backend nữa; source TS/PM/Edge vẫn do owner nguồn. Trả từng
review row: **ACCEPTED_TO_FIX / ALREADY_FIXED kèm commit+receipt /
CHANGES_REQUESTED kèm locator / BLOCKED_SOURCE kèm input và owner**.

Mỗi giao hàng ghi:

- code/contract/generated/fixture commit; tests thật và NOT_RUN; pin runtime
  nếu đã cài; scope cleanup;
- published→consumed count và field cố ý không dùng; screenshot/route/story
  receipt đúng lane; chưa có nguồn không đổi thành AVAILABLE;
- backend làm tiếp được phase/family nào, frontend nối được gì ngay, request
  hai chiều còn gì và việc nào cần Bobby quyết;
- update Source Truth/FE request/debt/Unified theo receipt mới, giữ lịch sử.
  Xóa vai trò “chờ Codex sửa mọi backend” và OPEN đã superseded khỏi current
  disposition, không xóa receipt thất bại lịch sử.

Review này **đã viết vào canonical nhưng chưa có Claude ACK**, chưa landing
290 commit peer, chưa commit các docs WIP chung. Không được gọi DONE của
review/documentation là DONE của ELP2-10/UXM-10 hay quyền release.
