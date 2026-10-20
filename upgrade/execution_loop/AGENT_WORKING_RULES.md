# Execution Loop V2 — shared agent rules và Claude handoff

Owner directive: Bobby, 2026-10-15 (Asia/Saigon). Áp dụng cho campaign
`upgrade/execution_loop/`, cùng sản phẩm Portal hiện có. Đọc cùng
[entry point](README.md) và [Unified §14](../UNIFIED_IMPLEMENTATION_PLAN.md#execution-loop-v2).
Đây là rules, **không phải quyền triển khai mọi phase**.

## 1. Scope, authority và phối hợp

- Codex backend-first: identity/policy, generated contracts, BFF/projection,
  source/transport integration và backend evidence. Claude frontend-first:
  audit, IA/journeys, UI/UX, components, typed consumers và browser acceptance.
  Đây không phải cấm hai bên làm phía còn lại khi Bobby giao rõ. Không tự sửa
  accepted UI/baseline hoặc backend authority của bên kia để vượt gap.
- Quy tắc scope này thay các lệnh Execution-only/frontend-only và tracking cũ
  **chỉ trong campaign được giao**. Giữ nguyên contributor controls,
  protected kernel, security và release rules. UI tiếng Anh; báo cáo tiếng
  Việt. Legacy HiFi là reuse/regression baseline, không cấm nâng cấp đã duyệt.
- Main integration là `docs/research-loop-plan`. Trước sửa ghi repo/worktree,
  branch/full SHA, tracked/untracked state và owned files. Không tự tạo/move
  branch, merge, rebase, push hoặc checkout làm mất công việc song song.
  Worktree riêng chỉ theo gói đã duyệt; handoff contract pin theo SHA/schema.
- Chỉ một live progress index ở Unified §14; ELP2-00…11, EPG10-00…11,
  UXM-00…10 là namespaces khác nhau, không rename Pxx/UDB/EDS/PMA migrations.
  Chi tiết nằm trong guide và packet; addendum mới giữ lịch sử cũ, không xóa
  failed receipts hoặc đổi exit gate cho dễ PASS.
- Authority conflict: latest Bobby approval → applicable authority contract →
  recorded revision decision → current guide. Ghi locator, impact và đề xuất;
  dừng dependent feature, không bắt toàn track chờ một blocker độc lập.

## 2. Trước mỗi gói có liên quan HK

SSH read-only đúng host/worktree từ [source receipt](evidence/SOURCE_ALIGNMENT_2026-10-15.md).
Repin full SHA, dirty diff/untracked digests, guide/journal/receipt mới và
source manifest. PM dùng guide R2 ở **PM worktree**, không copy ở canonical
TS hoặc Library. TS/DL đang nâng cấp song song: đọc measurement lock/window
và handoff hiện hành trước mọi tác động đã được duyệt; repin khi nguồn đổi.

Branch name, clean checkout, migration file hoặc HTTP200 không chứng minh
runtime. Ghi riêng source SHA, deployed artifact digest, applied schema,
effective profile/config, publication/trust/TLS và observation time; phần
chưa quan sát là UNKNOWN. Journal báo rollout chỉ là reported runtime cho
đến khi có direct verification đúng quyền; không cộng PASS giữa các scope.

Trước remote file/code/config edit, tạo worktree, tests có ghi dữ liệu, build,
migration, credential/security hoặc service change: trình **target + scope +
resource ceiling + validation + risk + rollback**. Approval gói cho phép làm
đầy đủ gói, không hỏi lại từng dòng. Nhận guide không là quyền deploy, nâng
access, chuyển tiền hay đặt lệnh. Dùng DB/Redis/ports/volumes/test data riêng
được duyệt; không mượn workload TS/DL đang đo hoặc tự nâng quota.

## 3. Backend invariants để UI không phải đoán

1. Portal giữ login/session/app authority; TS giữ economic/capital/business
   authority; Edge chỉ transport/read projection. Không direct Trading DB,
   broker/CLI shortcut hoặc tạo ledger thứ hai để bù publication thiếu.
2. Reuse stable issuer+subject/user IDs, owner anchor và current grants.
   Bobby/Stan full business read không đồng nghĩa technical/secrets/mutation.
   Stan grant trong explicit ceiling, không self-elevation/protected-owner
   takeover. Researcher owner khác deployer. Thanhvuong linked discovery
   không mở full portfolio/peers/totals; exact field matrix còn cần duyệt.
3. Authorization trước list/detail/search/join/sort/filter/group/count/rank,
   export/download, cache và SSE/replay. Current grant trước historical
   attribution; opaque ID/cursor không phải quyền. Revoke không phục hồi qua
   cache/rollback, không hủy committed obligations hoặc bỏ late facts.
4. Fleet grain `(alpha_id, alpha_version_id, portfolio_id)`, children là
   deployment/internal account. Default balance là INTERNAL_ACCOUNT_BALANCE;
   physical custody restricted riêng, dedupe unique economic ownership.
   All chỉ navigation; Live/Canary actual cần source proof, Paper/Sandbox
   virtual không cộng vào actual NAV. Archive là lifecycle, không stage.
5. Economic backing, margin/risk budget, exposure cap và native margin tách
   riêng. PM R2 không universal1x. FUND/RETURN khác TOP_UP/recall, không native
   transfer. Preserve `pma.capital-command.v1.1` payload và amount partition.
6. Delivery/TS business outcome/projection freshness/venue execution là bốn
   chiều khác nhau. ACK không APPLIED; APPLIED không filled/flat. Unknown tra
   cùng intent/idempotency key, không blind retry bằng key mới. TS rechecks
   quyền/CAS tại commit; existing R1 executor không thay executor gate khác.
7. Public decimal strings, UTC epoch-ms, opaque revisions; null/zero/absence
   khác nhau. Source time, observation time, emitted time và coverage không
   tráo đổi. PARTIAL/stale/current-only không tự là empty/full-history.
8. Snapshot barrier/delta/correction/tombstone cần exact proof. Dedup+apply+
   checkpoint atomic; ACK sau durable commit. Hidden-event skips không false
   gap và không lộ hidden counts; source loss thật phải được phát hiện.
9. Reuse caches/coalescing/leases/indexes đã có; one bounded ingestion path,
   không mỗi browser fetch TS. Đo rows/bytes/QPS/WAL/CPU/RAM/lag thực trước
   tối ưu; theoretical50,000 rows không là measurement. Page cap không là
   silent total-history cap; exact analytical input khác chart decimation.

## 4. Scoring và metric semantics đã khóa

- Một shared Research calculator ngoài TS hot path: `qbts_prb_v1_1`,
  `F=0.45P+0.30R+0.25B`, six weights và bands theo FINAL spec. Không hỏi chọn
  lại công thức; không browser/controller formula hoặc HHI/lambda penalty.
- Raw q, contribution w*q, allocated-capital composition A và direct
  PortfolioScore F(NAV) khác nhau. Manager score dùng consolidated unique NAV,
  không average child scores. Contribution không nhận quality band.
- Numeric provisional chỉ khi math/input/config đủ, same window/basis mới
  aggregate; disclose provisional weight. Missing component không đổi weights
  hoặc thành0. Direct NAV score không đợi mọi alpha q/HHI/Regime/research run
  nếu economic inputs riêng đủ. Research binding bắt buộc đúng feature dùng nó.
- Formula/weights/bands đã duyệt; horizon anchors, stress delta, grid/block,
  maturity/freshness và Regime support config còn cần artifact/calibration
  approval. Fixture constants không là production defaults; chưa đủ config
  thì policy_pending. Không claim scientifically validated từ numerical tests.
- Preserve flow-adjusted returns/cost coverage/notional dedupe và original vs
  restated revisions. Initial/Added funds là cashflows, không tự gán cohort PnL.
  Mixed forward observations giữ actual duration riêng, không virtual NAV.
  Score/Regime unavailable không khóa authorized reduce-risk.

## 5. Claude: sáng tạo UI/UX, không đổi sự thật

### 5.1 Audit và thiết kế

Đọc UX guide đầy đủ; xem trực tiếp source, approved current components và
browser của đúng preview được giao. Đọc hai ảnh lowfi khi được cung cấp; nếu
thiếu, ghi missing input, không tuyên bố đã audit ảnh/deployed UI. Mỗi audit
ghi source/bundle/API identity và giới hạn (fixture, retained, real source).

Thiết kế manager-first: **Overview → Portfolios/Alpha Fleet → Portfolio,
Account, Alpha detail → Deployment → Orders/Fills/Reconciliation**. Giữ old
deep links hoặc compatibility mapping; Research RC→Governance phải giữ
workspace/resource context và các gates đã nghiệm thu.

Claude được đề xuất bố cục/interaction mới cho màn mới và refine màn cũ trong
gói được giao, không copy lowfi như Excel, cũng không thay toàn app. Bàn giao
sitemap, role-specific journeys, reuse/new component map, lowfi → HiFi desktop/
tablet/mobile, state inventory và interaction specification trước implementation
theo approval gate. Required fields/actions của guide không bị bỏ để làm đẹp.

### 5.2 Chất lượng thiết kế bắt buộc

- Hierarchy rõ: một headline chính, nhóm KPI ngắn, detail drawer/expandable
  evidence cho phần dài. Bỏ wording lặp, không dump internal reason codes hoặc
  nhiều badges ngang hàng thành nội dung chính. Public copy ngắn và action
  tiếp theo rõ; technical detail có request/receipt ID trong chỗ phù hợp.
- Reuse design tokens và components đã duyệt. Select/combobox có search,
  keyboard, selection summary và clear/reset; multi-filter, chips/grouping và
  saved views giữ URL/back/reload/date/currency/stage/workspace context.
  Không tự đổi global token/font/layout ảnh hưởng Research/Planning.
- Table đủ cột yêu cầu, units/basis/precision rõ; sort/filter/group phía server
  khi contract yêu cầu. Counts/group totals toàn authorized query, không page.
  Virtualization/scroll/responsive giữ chức năng, không bỏ dữ liệu theo viewport.
- Full business manager view và restricted researcher view riêng; không dùng
  full totals rồi hide vài rows. Không suy quyền từ display name hoặc score.
- Trạng thái loading, authorized-empty, partial, stale, unavailable, denied,
  revoked, replaying/resync, insufficient evidence và unknown outcome phải có
  thiết kế/copy/focus. Không dùng 0 che thiếu dữ liệu; màu không là tín hiệu duy nhất.
- Capital confirmation hiển thị exact operation/recipient/currency, before/
  after, source, pending/applied và consequence. Persist receipt sau reload;
  không success toast thay authoritative outcome. Archive/recall không auto
  close/cancel/transfer; Paper monitoring là deployment riêng có lineage/quota.
- QBTS dùng P/R/B/components/window/evidence; band từ server canonical value,
  không UI rounding đổi band. Regime là historical matching, không forecast.

### 5.3 Integration và evidence

Typed client sinh từ OpenAPI/schema của backend + canonical fixtures đã pin.
Mỗi card/column/action phải có field/operation, unit, availability, capability,
disabled reason và provenance. Thiếu contract: ghi request gồm locator, UI bị
chặn, expected semantics, fixture và done-when; không tự tạo backend fact,
parse server prose, route proxy hoặc relaxed type để xanh.

Browser bắt buộc cho giao diện thay đổi: so approved HiFi/current baseline với
build đang chạy ở desktop và narrow viewport (bao gồm1280/660 khi kế thừa gate
cũ), keyboard/focus, overflow, empty/error/permission, URL deep link/back/reload,
pagination/filter/group, reconnect/revoke/unknown khi applicable. Kiểm console,
request counts/idle polling và interaction latency với workload phù hợp.
Re-record baseline chỉ trong phạm vi được duyệt, giải thích từng visual delta;
không nuốt unrelated regression. Mock/fixture PASS không thay real API receipt.

## 6. Testing, resources và phase reporting

- Xác định impacted tests từ source/schema/profile/dependency hash. Chạy focused
  regressions theo gói, gom normal hook/gates theo tầng R0–R3 ở §10.10 (hook đầy đủ ở mốc, không
  bypass ngoài R0/R1 đã nêu); không lặp full build/engine/load/DR chỉ vì thay docs.
- Gói có build/test ghi dữ liệu cần approved target/budget. Không tự chạy24h
  soak mặc định: chọn duration/repeat/fault matrix có chứng minh workload,
  giữ exit gate; thay threshold phải có owner approval, không giảm data để PASS.
- Sau phase dọn đúng resources của mình theo root hygiene rules, giữ evidence,
  active/rollback images và immutable business data. No broad Docker prune.
- Phân loại SOURCE_CONFIRMED, HISTORICAL_EVIDENCE, RUNTIME_VERIFIED, PROPOSED,
  UNKNOWN/BLOCKED. Test statuses PASS/FAIL/NOT_RUN/N/A có reason và exact scope.
  Không cộng tests trùng; reuse receipt phải ghi impact analysis và limitations.
- P184 performance G2 mandatory khi applicable, khác optional mainnet G2.
  Design/UI fixtures không đợi live canary; trading-flow bị tác động cần own
  certification. Không tự bật source/SSE/relay vì screen đã render.

Mỗi packet ghi: goal; inputs/pins/dirty state; authority/approved scope; files;
contract/schema/migration impact; expected/actual tests và receipts; actual
resources hoặc NOT_MEASURED; gaps/blockers; exit verdict; rollback; Claude/
Codex handoff; independent next work. Cập nhật Unified cùng slice; không gọi
implementation-ready là runtime-ready hoặc READY_FOR_REVIEW là OWNER_ACCEPTED.

Trong gói onboarding này chỉ sửa Markdown và kiểm links/diff/hash. Không chạy
normal commit hook nếu nó kéo build/DB tests ngoài gói đã duyệt; để commit gate
PENDING, không bypass hook. Không deploy/push/merge dev/main/sign release.

## 7. Phase approval và bàn giao hai chiều bắt buộc

Addendum Bobby, **2026-10-16 (Asia/Saigon)**. Áp dụng mọi ELP2/UXM/Score slice,
kể cả audit/docs hoặc BLOCKED. Mỗi phase cần Bobby giao/duyệt trước;
**dependency ready không phải permission** chạy phase tiếp. Trong gói đã duyệt
không hỏi lại từng sửa đổi đúng scope.

**Batch assignment clarification,2026-10-16:** Bobby có thể duyệt một goal nêu
đích danh nhiều phase + ordered scope/test/resource boundaries, như
[Unified §14.9](../UNIFIED_IMPLEMENTATION_PLAN.md#elp2-backend-batch-01-04).
Đó là assignment cho từng phase được liệt kê; sau khi duyệt không hỏi lại quyền
chuyển bước đúng scope. Vẫn phải chốt journal, tests, coherent commit, handoff,
debt và exit riêng trước bước phụ thuộc; không tự mở phase ngoài danh sách.
Nếu frontend chưa được Bobby giao, ghi `NOT_STARTED_BY_OWNER_DIRECTION` và
handoff `AWAITING_CONSUMER_REVIEW`, không spawn frontend hoặc claim accepted.
Original mandatory gate chưa đạt vẫn OPEN/BLOCKED; đủ technical dependencies
chỉ cho phép backend độc lập tiếp tục, không thành full phase/runtime PASS.
Lập plan/bàn cách dùng goal không phải lệnh create goal hoặc triển khai batch.

### 7.1 Entry gate trước khi làm

- Đọc lại Unified, guide và packet/handoff mới nhất của dependencies, kể cả
  phản biện/request chưa đóng của bên kia; không chỉ dựa chat cũ.
- Ghi scope card: goal/requirement IDs, approval reference, repo/worktree/branch/
  full SHA/dirty paths, owned/forbidden files, exclusions, schema/fixture/HiFi
  pins, môi trường/resource budget, validation, risk và rollback.
- Lập requirement → implementation/contract → test/receipt → exit matrix;
  classify reuse/change/new và quyết định pending có owner. Old PASS thay đổi
  dependency phải impact review; không tự giữ xanh.
- Readiness ghi riêng design / fixture / real read / command. Fixture đủ không
  mở runtime. Dùng [template](PHASE_PACKET_TEMPLATE.md); không tạo receipt giả.

### 7.2 Backend → Claude: giao contract dùng được

Mỗi slice bàn giao đủ, không chỉ nói “backend xong”:

1. Requirement/màn/component, operationId/route, generated type/schema version,
   producer commit và landed state. Chưa commit: exact working-diff hash và ghi
   UNCOMMITTED; không coi working tree là artifact tái lập ổn định.
2. Field mapping: grain/units/exact decimals/UTC, null vs zero, availability và
   typed reasons, timestamps/provenance, quyền/disabled action, page/cursor/cache.
3. Compatibility và consumer changes: regenerate command, fixture path/version,
   fields thêm/bỏ/đổi nghĩa, impacted tests, migration/runtime prerequisites.
4. Examples ghi synthetic hay real receipt; IDs có nguồn, không secrets. Không
   dùng fixture làm source truth hoặc source-only thành runtime-ready.
5. Claude cần nối ở đâu, state/copy và acceptance nào; available environment,
   remaining blockers, điều kiện mở lane. Không tự thay accepted UI.

Delivery level riêng: **contract published / code landed / runtime qualified /
consumer accepted**. Producer DELIVERED chưa đóng integration. Claude ghi
ACCEPTED hoặc CHANGES_REQUESTED với locator/receipt; chưa online ghi
AWAITING_CONSUMER_REVIEW và gửi Bobby prompt/path, không claim đã nhắn/được nhận
chỉ vì đã viết file. Backend chủ động yêu cầu FE nối field mới, không đợi FE hỏi.

### 7.3 Request và debt ledger hai chiều

- ID mới `ELP2-REQ-<phase>-<nnn>`; giữ ID cũ đã tồn tại. Canonical record nằm
  trong packet phase phát sinh, Unified chỉ link/status/owner. Không tạo nhiều
  ledger sao chép dễ lệch. Phase khác chỉ tham chiếu ID gốc.
- Mỗi record: sender/receiver/owner, screen/phase, source locator, observed vs
  expected semantics, impact/priority, proposal, contract/test impact, dependency/
  decision owner, done-when, status và delivered commit/type/example/receipt.
- Lifecycle `OPEN → ACKNOWLEDGED → IN_PROGRESS → DELIVERED → VERIFIED → CLOSED`;
  consumer verification cần khi có integration impact. BLOCKED có reason/owner/
  unblock condition; DEFERRED cần approval/destination; NOT_APPLICABLE cần
  evidence. Regression reopen cùng ID kèm revision, không xóa history.
- Ngoài approved phase: ghi request xin duyệt scope, không tự mở rộng. Typed
  absence có thể hoàn thiện contract handling nhưng không đóng missing source.
  Mandatory request chưa đạt done-when thì gate liên quan chưa COMPLETE.

**Recurring Claude review intake — Bobby,2026-10-17:**

- Bobby nhắc lại2026-10-18: review, đóng góp code và request của Claude là
  input bắt buộc, không chỉ ý kiến trong chat. Nếu đang ở worktree khác, pin
  branch/full SHA/dirty state và ledger/receipt thực đọc; không mặc định đã
  merge vào nhánh chính. Triage phải cập nhật đúng phase sở hữu trước freeze;
  handoff/fixture không tự trở thành consumer ACK hay real-source PASS.

- Trước entry một gói backend, freeze contract, landing và báo cáo exit, đọc
  lại review, consumer receipt và request liên quan mới nhất của Claude. Ghi
  path/revision cùng source/schema mà review đã xét; dependency đổi phải có
  impact decision, receipt hợp lệ của phần không đổi không cần chạy lại.
- Mỗi finding ghi một disposition có lý do: `ACCEPTED_FOR_IMPLEMENTATION`,
  `ALREADY_DELIVERED_WITH_LOCATOR`, `CHANGES_REQUESTED_WITH_REASON` hoặc
  `NEEDS_OWNER_DECISION`. Đây là kết luận triage, không thay lifecycle phía
  trên. Giữ ID gốc và lịch sử; không chỉ trả lời trong chat hoặc tự đóng.
- Đưa finding được nhận vào to-do/exit matrix của **packet phase sở hữu**:
  owner, contract/consumer bị ảnh hưởng, test/receipt, dependency và done-when.
  Unified chỉ link record và next step, không sinh queue song song. Review
  code backend do Claude đóng góp cũng cần Codex kiểm tra trước integration.
- Review không tự cho quyền đổi formula/economic semantics, accepted UI/
  baseline, production calibration, kích hoạt runtime hoặc mở phase ngoài
  assignment. Tách đúng dependency cần duyệt; tiếp tục phần độc lập đã duyệt.
- Trả từng fix/contract với landed commit (hoặc UNCOMMITTED + diff hash),
  generated type/field/availability, fixture và giới hạn validation. Chỉ
  chuyển khỏi `AWAITING_CONSUMER_REVIEW` khi có acknowledgement/receipt thật
  của Claude; viết handoff không chứng minh đã gửi, nhận hoặc nghiệm thu.

### 7.4 Cuối mỗi phase hoặc khi dừng giữa chừng

Cập nhật packet + Unified trong cùng delivery. Báo cáo Bobby phải có đủ:

1. **Đã làm:** requirement IDs, code/docs paths, commits/landed state, file/line
   +/− theo baseline rõ; tách implementation/generated/tests/docs, không đếm
   công của Claude/subagent hai lần. Chưa commit báo dirty diff đúng scope.
2. **Kiểm chứng:** tests mới/chạy lại/reuse, actual results/receipts; chưa chạy
   gì và vì sao; resources/cleanup/rollback. Fixture/DB/browser/runtime riêng.
3. **Exit:** từng gate PASS/FAIL/NOT_RUN/N/A(reason); backend, FE/integration và
   owner acceptance riêng, không blanket xanh khi mandatory gate còn mở.
4. **Backend tiếp tục được:** exact phase/slice, dependency evidence, approval
   state và next step. Đề xuất không đồng nghĩa tự bắt đầu phase chưa duyệt.
5. **Còn nợ:** từng ID/owner, screen/flow ảnh hưởng, next action/destination;
   tách bug, source gap, decision, FE wiring, test/runtime evidence, optional
   scope. Không dùng một câu “chờ bên kia” hoặc tự bỏ mandatory work.
6. **Claude tiếp tục được:** UXM/màn/component, design/fixture/real-API level,
   exact schema/fixture/handoff pins và phần phải nối; chưa đủ thì nói điều kiện.
7. **Request hai chiều:** new/delivered/awaiting acknowledgement/closed, reviewer
   và evidence. Nếu không có ghi “Không phát sinh sau đối chiếu”, không bỏ mục.

Backend exit có thể đạt trước FE nếu guide tách gate, nhưng full product chưa
complete. Handoff thiếu để consumer tiếp tục thì delivery chưa sẵn sàng. Packet
dùng template và bảng next-step trong Unified; mọi unresolved item có owner.

## 8. Workflow subagent — độc lập, bounded, một người tích hợp

Bobby yêu cầu chuẩn hóa delegation. Sau khi phase được giao, primary chia
subtasks **trong đúng approved scope**, không mở quyền mới qua agent con. Task
nhỏ/shared-files/docs-only dùng một writer; không spawn chỉ để tăng số agent.

1. Primary đọc rules/guide, ghi task map trước giao: task ID, input pins, goal,
   output, owner, read/write allowlist, forbidden files, dependency, acceptance,
   resource/tests budget. Agent con đọc applicable rules/guide trước khi làm.
2. Parallel phù hợp: source audit, module độc lập với frozen contract, focused
   tests ở file/cell riêng. Producer schema → generated client → consumer là
   dependency, không cho nhiều agent tự định schema đồng thời.
3. **Một writer mỗi file.** Primary giữ Unified/ledger tổng, migration numbering,
   shared OpenAPI/generated outputs, lockfiles và integration. Agent con đề
   xuất patch/notes cho shared paths. Reserve migration ID trước khi dùng.
4. Agent con không tự checkout/tạo worktree/branch/commit/merge/rebase/push,
   regenerate shared outputs, deploy hay thao tác credential. Chỉ primary giao
   cụ thể trong approval mới được làm. Không bypass hooks; shared filesystem
   không cho phép revert dirty files của người khác.
5. Primary điều phối resources: không chạy nhiều full suites/build/DB/load/
   browsers cùng cell. Chia ports/DB/volume/cache theo approved budget; số agent
   không tự tăng quota. Contract change chưa freeze thì consumer chờ artifact.
6. Return packet: diff/paths, tests đã chạy/kết quả/receipt, assumptions,
   blockers/next dependency. Primary đọc diff và review correctness/security,
   chạy impacted integration một lần; không tin PASS chỉ từ summary, không
   rerun unchanged suites có receipt hợp lệ. High-risk auth/economics/commands
   nên có independent review, vẫn không thay runtime gate.
7. Land coherent batch qua normal hook theo approved branch rules, recheck
   shared HEAD/dirty state trước land. Không ours/theirs toàn bộ để resolve
   semantic conflict. Đếm evidence/diff một lần, ghi subagent contribution.
8. Khi pause/finish: thu handoff, dừng agent/process do mình tạo, dọn đúng
   resources đã xác định; giữ evidence/rollback/business data. Không hứa chạy
   nền sau turn nếu không có cơ chế task thực sự. Primary chịu trách nhiệm
   báo cáo cuối; Bobby vẫn duyệt từng phase tiếp theo.

## 9. Frontend V2 — quy tắc thiết kế trước khi có HiFi (APPROVED 2026-10-17, trừ mục reader ở 9.8.2)

Đề xuất của Claude, 2026-10-17. **Chưa có hiệu lực** cho tới khi Bobby ghi "duyệt" bên dưới; không thay §1–§8 và
không mở quyền triển khai phase nào. Phân tích, kế hoạch, request nằm ở
[FRONTEND_V2_METHOD_AND_PLAN_PROPOSAL_2026-10-17.md](FRONTEND_V2_METHOD_AND_PLAN_PROPOSAL_2026-10-17.md).

Duyệt: `PENDING` (Bobby). Ngày duyệt/sửa đổi: —.

### 9.1 Vì sao cần: V2 không có HiFi ban đầu

Legacy HiFi từng là điểm so sánh. V2 chỉ có UX guide, hai ảnh lowfi (là input nội dung, không phải HiFi) và các
contract/fixture backend. Vì vậy mỗi màn phải đi qua chuỗi cổng bên dưới; **wireframe được Bobby duyệt thay cho
HiFi** ở bước so sánh.

### 9.2 Chuỗi cổng cho mỗi màn (G0–G7)

| Cổng | Sản phẩm | Ai duyệt |
| --- | --- | --- |
| G0 Pin | Ghi source SHA producer, generated type, fixture + hash, bundle/API (hoặc "không có"), làn bằng chứng | Claude |
| G1 Screen Spec Card | Một trang/màn: câu hỏi người dùng cần trả lời, headline duy nhất, ≤6 KPI chính, field→contract (grain/unit/availability), action→capability→lý do khóa, điều hướng vào/ra, URL-state, 6 ô scale-refine (CLAUDE.md §8) | Bobby xem cùng wireframe |
| G2 Wireframe | HTML/CSS xám dùng token hiện có, 1280 và 660, đủ state (§9.4); lowfi không bắt chước Excel | **Bobby duyệt theo nhóm màn** |
| G3 Ma trận state + field | Mỗi ô trên wireframe ↔ field/state ↔ fixture ↔ copy key | Claude, Codex đối chiếu contract |
| G4 Build | Component thuần trình bày, props = generated types, chạy ở lab `/execution/_fixtures`; test + baseline **chỉ cho group mới** | — |
| G5 Receipt | Trình duyệt so wireframe đã duyệt: 1280/660, bàn phím/focus, overflow, console, request/idle polling, deep-link/back/reload | — |
| G6 Đọc thật | Chỉ khi endpoint qualified; receipt ghi source/bundle/API pin; fixture PASS không thay | Codex qualify nguồn |
| G7 Đóng | Hồ sơ phase (rules §7.4), request hai chiều cập nhật, debt có owner | Bobby |

Không được nhảy cổng; phát hiện contract thiếu → request (§9.6), không bịa.

### 9.3 Quy tắc dữ liệu (không đổi sự thật để UI đẹp)

1. Mọi field hiển thị truy được về: guide → generated type → fixture canonical. Không type viết tay, không
   `Record<string, unknown>` để vượt kiểm tra, không parse server prose.
2. **Một component duy nhất render metric** (value/unit/currency/basis/window/availability/reason/confidence); không
   nơi nào khác tự format số hoặc tự suy trạng thái. Decimal luôn string; null ≠ 0 ≠ "không áp dụng".
3. Sort/filter/group/aggregate/đếm là server-side theo allowlist của contract; không sort một trang rồi gọi là toàn bảng;
   không tính tổng client; không `global − visible`.
4. Phân biệt bốn trục: environment/stage/lifecycle/economic partition; tiền chỉ cộng trong một partition; "All" chỉ là
   điều hướng. Dòng tiền ≠ lãi; Initial/Added funds ≠ track record.
5. Score/Regime không tính ở browser; band lấy từ server canonical; contribution không band; `policy_pending` là
   state được thiết kế, không phải ô trống.
6. Realtime = thông báo rồi refetch có kiểm soát; không polling thay stream; retained = không stream.
7. Quyền: UI không suy từ ADMIN/tên/`grants.current`; nút khóa phải có lý do typed an toàn; không lộ hidden count
   trong chữ, tooltip hay nút export.
8. Mọi bản ghi/lệnh dùng receipt đa chiều (delivery / business / projection / venue); ACK ≠ APPLIED; unknown →
   tra lại cùng key, không gửi key mới.

### 9.4 Quy tắc thiết kế (sạch, dễ dùng, không nhét mọi thứ)

1. Mỗi màn **một headline**, nhóm KPI ngắn (≤6), chi tiết nằm trong drawer/tab/expandable. Không mười thẻ ngang hàng.
2. Mọi màn manager có **thanh ngữ cảnh** (phạm vi, environment/partition, cửa sổ + timezone, currency, as-of/freshness)
   lưu trong URL; back/forward/reload không âm thầm reset.
3. State bắt buộc có thiết kế + copy + focus: loading, authorized-empty, partial, stale, unavailable, denied, revoked,
   resync, insufficient evidence, outcome unknown, disconnected, policy_pending. Màu không là tín hiệu duy nhất.
4. Copy tiếng Anh, ngắn, có hành động tiếp theo; mã nội bộ/reason code/request ID chỉ ở chi tiết. Không dump enum
   làm heading. Nhãn từ guide tiếng Việt cần bản tiếng Anh được duyệt trước khi dùng.
5. Bảng: đủ cột yêu cầu, đơn vị/basis/precision rõ; sticky identity, chọn cột, header sort có `aria-sort`, chip bộ lọc
   xóa từng cái/tất cả, group header, row expand; số không ellipsize; cuộn trong panel, không cuộn trang.
6. Tham khảo cách tổ chức thông tin của sàn (tổng quan tài sản trước, rồi lệnh/lịch sử; account/environment luôn hiển
   thị) như **ý tưởng bố cục**, không sao chép asset/ma trận quyền; quyền thật theo policy nội bộ.
7. Dialog/drawer là modal đúng nghĩa (`role=dialog`, focus trap, Escape, trả focus) khi thiết kế mới; không sửa
   drawer cũ ngoài phạm vi.

### 9.5 Quy tắc code và kiểm chứng

1. Reuse component đã duyệt trước; component mới cần Reuse report (v0.5 §11.3). Component/chart V1 yếu → ghi đề xuất
   trong proposal cho Bobby, không tự thay giữa chừng.
2. V2 viết ở file CSS riêng, **chỉ dùng `font: var(--exec-font-*)`** (không `font:` literal), không đổi token chung,
   không đụng Research/Planning.
3. Screen V2 là component thuần trình bày; fixture chỉ ở lab/test (gate `productBoundary` giữ nguyên). Nối product
   route chỉ ở G6.
4. Test: unit cho state matrix và metric component; Playwright cho lab group mới ở 1280 và 660 (+ bàn phím);
   BFF double dựng từ fixture canonical, đánh dấu `BFF_DOUBLE`. Baseline: chỉ group mới, giải thích từng delta,
   không nuốt regression khác; chạy trong image pinned.
5. Mọi receipt ghi làn: `FIXTURE_LAB` / `BFF_DOUBLE` / `REAL_READ_RETAINED` / `REAL_READ_QUALIFIED`. Không gọi
   fixture là real-API; không claim "backend sẵn sàng" khi `SOURCE_NOT_QUALIFIED`.
6. Scale-refine 6 ô (CLAUDE.md §8) cho mỗi màn trước G7; hiệu năng đo bằng đo thật, không đoán.

### 9.6 Phối hợp với Codex

- Claude gửi request ở dạng ID `ELP2-REQ-FE-nnn` (locator, UI bị chặn, expected semantics, fixture, done-when);
  Codex ghi trạng thái trong packet của phase sở hữu; một ledger, không nhân bản.
- Trước mỗi gói: đọc handoff/commit mới, xin pin SHA producer, ghi vào G0. Contract mới → regenerate bằng lệnh của
  contracts, không sửa file generated.
- ACK của consumer = `ACCEPTED` hoặc `CHANGES_REQUESTED` kèm locator/receipt; viết file không phải ACK.
- Claude chỉ làm backend khi Bobby giao kèm; Codex chỉ đổi UI đã duyệt khi có handoff ghi nhận.
- **Hạ cánh code:** không ff-merge vào cây tích hợp khi cây đó có thay đổi chưa commit của bên kia; thống nhất lượt
  hạ cánh. Không `git stash` chung.

### 9.7 Phân loại màn (từ khảo sát kho frontend, chưa phải thiết kế)

| Màn | Phân loại | Ghi chú nguồn gần nhất |
| --- | --- | --- |
| M01 Manager Overview | NEW (tái dùng phần) | `/execution` Command Center có triage, FleetHealth, SourceHealth; thiếu NAV/flows/score/chart cấp quỹ |
| M02 Portfolios Directory | NEW (bảng mỏng) | `PortfolioList` 132 dòng, không sort/filter |
| M03 Alpha Fleet | REFINE | Lọc client, grain `alphaId`, chưa QBTS/sort/group/URL |
| M04 Portfolio 360 | REFINE + tab mới | Scope bar chỉ là span tĩnh; thiếu Allocations/Accounts/Risk/People |
| M05 Alpha 360 | REFINE | Thiếu Research Evidence, Regime, score, timeline xuyên stage |
| M06 Account 360 | REFINE (khớp nhất) | Thiếu identity logical/physical, margin, attribution |
| M07 Deployment detail | PRESERVE (refine nhỏ) | Breadcrumb dùng id thô |
| M08 Archived Alphas | NEW | Không có route đọc backend |
| M09 Operations & Decisions | REFINE + gộp | Thiếu trục projection (catching_up/resync) |
| M10 Profile & Access | REFINE (ngữ nghĩa) | Thiếu self-visibility, field-policy, delegation ceiling |

### 9.8 Port-first, fixture phải qua cổng schema, parity khi có dữ liệu thật (APPROVED, trừ khoản 2)

1. Mọi màn V2 chỉ gọi một interface `ManagerApi` (mỗi method = một `operationId` sinh ra). Hai adapter: `fixture`
   và `http`. Component không biết làn nào. Không import fixture từ product graph (gate `productBoundary` giữ nguyên).
2. Mọi response đi qua một reader ở ranh giới (kiểm enum, decimal, null/availability; không sửa). Fixture và thật
   dùng **cùng** reader. Cách cài (reader viết tay hay `ajv` theo JSON schema đã publish) do Bobby/Codex chọn.
3. Fixture bốn tầng: L0 canonical (nguyên văn Codex) · L1 ma trận state (biến đổi hợp lệ, phủ mọi tổ hợp availability ×
   status × reason × freshness × completeness) · L2 quy mô (200 hàng, nhiều nhóm, cursor, 1 MiB) · L3 âm tính. Mọi
   fixture FE tự thêm phải qua cổng conformance với schema đã publish; fixture L0 không bao giờ bị sửa.
4. Có profile fixture **"thưa thực tế"** (nhiều null/unavailable) phản ánh trạng thái nguồn; wireframe phải ổn khi KPI
   chính là `unavailable` có lý do.
5. Khi một endpoint qualified: chụp response đã che → fixture `REAL_RECEIPT` → chạy lại test component → so cấu trúc với
   synthetic; chênh lệch sửa fixture, không sửa dữ liệu thật.
6. Mỗi gói pin SHA bốn nguồn: Portal producer, TS execution, PM, Edge. Truy cập HK chỉ-đọc, chỉ khi được giao; không
   Docker/DB/ghi/build.

### 9.9 Source Truth Board (APPROVED)

Một tài liệu sống chung: field Portal → contract Portal → Edge → TS/PM nguồn → trạng thái (`EXISTS_MOUNTED` /
`SOURCE_DARK` / `MISSING`) → owner → request ID. Frontend đọc nó ở G0/G1 mỗi màn; Codex cập nhật khi nguồn đổi. Lát dọc
"đọc thật" đầu tiên đi từ field có khả năng sớm nhất (định danh, orders/fills/positions) — xem proposal Phần B §13.

## 10. Làm song song với Codex: đồng bộ mỗi round, review hai chiều, sáng tạo có kiểm soát (APPROVED 2026-10-17)

Yêu cầu của Bobby, 2026-10-17. Bổ sung cho §7 và §9.6; không thay thế. Mục tiêu: hai agent chạy song song mà không
lỗi thời, không giẫm lên nhau, và mọi phát hiện của một bên đến được bên kia trong round kế tiếp.

### 10.1 Round-start sync (bắt buộc, trước khi làm bất kỳ gì trong round)

Mỗi round — kể cả round chỉ trả lời câu hỏi — bắt đầu bằng đúng chuỗi này, ghi kết quả vào
[FRONTEND_BACKEND_SYNC.md](FRONTEND_BACKEND_SYNC.md) §0–§1 **trước khi** báo cáo:

1. **Đọc nhánh của bên kia (chỉ đọc):** `git log` + `git diff --stat` của `docs/research-loop-plan` (và nhánh
   worktree của Codex nếu có) từ pin lần đọc trước; Codex đọc `claude/fe-parity` tương tự. Không checkout, không
   sửa, không stash chung.
2. **Đọc phần review + request của bên kia:** hộp thư đến (request `ELP2-REQ-*` gửi cho mình, review `ELP2-REV-*`)
   trong packet các phase và trong sổ đồng bộ. Không chỉ đọc handoff của phase đang làm — đọc lại cả phase đã đóng
   (CLAUDE.md §7.9).
3. **Phân loại mục mới:** `ACT_NOW` (chặn việc đã được giao hoặc sửa sai sự thật đã dùng) · `NEXT_GATE` (xử lý ở G0
   của gói kế) · `INFO`. Mục `ACT_NOW` được xử lý hoặc báo Bobby ngay đầu round; không để chìm.
4. **Làm mới pin nguồn:** TS execution, PM, Edge (SSH chỉ-đọc, **chỉ khi gói được giao cho phép**). Hai pin khác nhau
   cho cùng một nguồn → ghi `UNRECONCILED` và đọc lại trước khi dùng ngữ nghĩa đó.
5. **Không có gì mới vẫn phải ghi** "Đã đối chiếu, không phát sinh" kèm pin; bỏ mục này = round chưa bắt đầu.

Nếu pin cũ hơn nhánh tích hợp thì **rebase trước G0** (§9.6); dữ liệu/field lấy từ pin cũ không được dùng làm sự thật.

### 10.2 Round-end write (bắt buộc, trước khi báo Bobby)

Cập nhật sổ đồng bộ §3 (request FE→BE mới/đã giao) và §4 (review mới); trong packet phase nêu mục "Request hai
chiều" theo §7.4(7). Báo cáo Bobby theo template 7 mục của CLAUDE.md §7.4 và **trỏ tới file**, không thay file bằng
chat (CLAUDE.md §7.7). Điều Codex cần biết ở round kế tiếp phải nằm trong file, không chỉ trong tin nhắn.

### 10.3 Review hai chiều (phản biện chi tiết, không chỉ chấp nhận)

- **FE review backend** từ góc người dùng contract: ID `ELP2-REV-<n>`, có severity `BLOCKER|MAJOR|MINOR|NOTE`, locator
  (file:line hoặc schema path), quan sát thực tế vs kỳ vọng, hệ quả lên UI/UX, đề xuất nhỏ nhất. Mỗi lần backend
  giao contract/handoff mới → FE review trong round gần nhất có thể, không đợi được giao phase. Review này chỉ ghi,
  **không** là ACK; ACK vẫn cần assignment (§9.6).
- **Backend review FE** việc dùng dữ liệu: field bị diễn giải sai, state bị bịa, copy hứa hơn dữ liệu cho phép.
- `BLOCKER` buộc bên nhận trả lời (chấp nhận / bác bằng bằng chứng / hoãn có owner) trong round kế tiếp; `MAJOR` trong
  gói liên quan; `MINOR/NOTE` ghi nhận. Bác bỏ phải có bằng chứng, không "đã đủ rồi".
- Review không đổi ownership: FE không sửa file backend/contracts; BE không sửa UI đã duyệt. Muốn đổi → request.

### 10.4 Mẫu request / review

```
ID: ELP2-REQ-FE-nnn (hoặc ELP2-REV-nnn)    Pri: P1|P2|P3 / Severity
Từ → Đến:  Claude → Codex        Phase/Màn:  UXM-xx / M0x
Locator:  <file:line | schema path | endpoint>
Quan sát (có pin SHA):  ...       Kỳ vọng / ngữ nghĩa cần:  ...
UI bị chặn / hệ quả:  ...         Đề xuất nhỏ nhất:  ...
Fixture cần (kịch bản §2.2 trong sổ):  ...    Contract/test ảnh hưởng:  ...
Done-when:  ...                   Status:  OPEN→ACKNOWLEDGED→IN_PROGRESS→DELIVERED→VERIFIED→CLOSED
```

### 10.5 Giữ nhánh thẳng hàng

- Mỗi bên chỉ ghi trong nhánh của mình; hạ cánh vào cây tích hợp theo lượt đã thống nhất (§9.6). Cây tích hợp có thay
  đổi chưa commit của bên kia → không ff-merge.
- Trước commit: fetch + so với `docs/research-loop-plan`; docs-only hạ cánh được sau hook, code Execution phải chạy
  `scripts/refresh-release-integrity-ledgers.sh --write` trước.
- Commit message nêu ID request/review liên quan. Codex nhắc ID khi giao; FE nhắc ID khi ACK.
- Không dựa vào chat cũ làm sự thật: pin (SHA + ngày) ghi trong sổ; đã quá 24h hoặc nhánh đã tiến → đọc lại.

### 10.6 Claude là lead UI/UX: sáng tạo trong khung, đề xuất chứ không chờ hỏi

- Theo guide v1.1 và thành phần hiện có; **đề xuất cải thiện chủ động**: mỗi màn trình hai phương án khác bản chất
  (không phải hai biến thể trang trí) kèm khuyến nghị, lý do, dữ liệu dùng, chi phí/nguy cơ.
- **Độ lệch khỏi guide = `DEVIATION`**: ghi lý do (người dùng làm được việc gì tốt hơn), dữ liệu nguồn, ảnh hưởng
  accessibility/hiệu năng; chỉ làm khi Bobby duyệt. Sáng tạo không bao giờ đổi sự thật, grain, quyền hay ngữ nghĩa
  thiếu dữ liệu (§9.3).
- Sáng tạo phải thấy được bằng wireframe + trạng thái thưa/lỗi, không chỉ trạng thái đẹp (§9.8.4).
- Gợi ý thay biểu đồ/component V1 chưa tốt ghi ở mục "Suggest" của gói, không tự thay trước khi duyệt.

### 10.7 Hỏi Bobby: chỉ khi cần, và phải đủ

Chỉ hỏi quyết định thực sự của Bobby (phase, phạm vi, đánh đổi sản phẩm). Mỗi câu hỏi nêu: bối cảnh, các lựa chọn,
hệ quả từng cái, **khuyến nghị kèm lý do**. Không hỏi việc có mặc định hợp lý hoặc tự kiểm chứng được.

### 10.8 Kinh tế subagent: giao đúng việc, tái dùng thay vì sinh mới (Bobby, 2026-10-17)

Cái gì tối ưu được bằng subagent thì **phải** giao, để giữ tiến độ và thời gian mà không đốt token của luồng chính.
Bổ sung cho §8 (độc lập, bounded, một người tích hợp); không mở rộng quyền ghi hay phạm vi phase.

1. **Nên giao:** quét/đọc nhiều file hoặc nhiều worktree rồi trả kết luận (digest nguồn TS/PM/Edge qua SSH chỉ-đọc, đối
   chiếu `git log` ở đầu round, đọc evidence dài); sinh và kiểm fixture theo schema; rà conformance/drift; review
   độc lập một diff khi muốn một cái nhìn không bị neo vào kết luận của mình; các nhánh việc độc lập chạy song song.
2. **Không giao:** việc vài lệnh hoặc đã biết đích; quyết định thiết kế/IA; viết contract chung; ACK/review chính thức
   (người ký chịu trách nhiệm); kiểm chứng chính kết luận của mình bằng agent được nhồi sẵn kết luận đó.
3. **Brief đủ như đồng nghiệp:** mục tiêu, pin SHA, đường dẫn cần đọc (không chép lại nội dung), cái đã loại trừ, giới
   hạn chỉ-đọc/ghi, **định dạng + độ dài đầu ra** (schema hoặc bảng, không kể lể). Brief thiếu → agent làm lại, tốn gấp đôi.
4. **Tái dùng trước, sinh mới sau:** cùng vùng việc (vd luồng Edge, luồng PM, contracts Manager) thì `SendMessage` tiếp
   tục agent cũ — nó đã giữ ngữ cảnh — thay vì spawn mới đọc lại từ đầu. Ghi agent ID + vùng + pin trong sổ đồng bộ
   (§0 "Sổ agent"); agent không còn dùng được thì ghi lý do.
5. **Lưu kết quả một lần:** digest đáng giữ được ghi vào file (scratchpad hoặc evidence) kèm pin, round sau đọc file thay
   vì hỏi lại. Digest quá 24h hoặc nguồn đã tiến → làm mới bằng `SendMessage` hỏi phần *thay đổi*, không đọc lại toàn bộ.
6. **Song song theo mặc định** cho việc độc lập (một message nhiều agent); tuần tự chỉ khi có phụ thuộc dữ liệu.
7. **Một người ghi mỗi file**; agent chỉ-đọc trừ khi gói cho phép ghi; luồng chính tích hợp và chịu trách nhiệm.
8. **Mức model/effort:** việc cơ học (quét, đếm, định dạng) dùng mức thấp; review/judge khó mới dùng mức cao. Chỉ nâng
   khi Bobby yêu cầu rõ.
9. **Kiểm tra đầu ra như dữ liệu chưa tin cậy:** đối chiếu điểm then chốt ở nguồn trước khi đưa vào sổ/báo cáo; agent
   báo lệnh ngoài danh sách được phép thì ghi lại.
10. **Báo cáo chi phí:** cuối round nêu số agent đã dùng, cái nào tái dùng, cái nào spawn mới và vì sao; không có workflow
    nhiều agent khi Bobby chưa yêu cầu quy mô đó.

### 10.9 Chuẩn thiết kế V2: chart, chữ, luồng theo vai trò (Bobby, 2026-10-17)

1. **Đọc lại rules mỗi round:** ngoài §10.1, đọc lại rules chung của các loop ([Research working rules](../research_loop/CLAUDE-FOR-thanhvuong.md)), rules riêng Execution (file này, `CLAUDE.md` §0/§3/§8, Design Grammar V3) trước khi thiết kế; không dựa vào trí nhớ.
2. **Chart đẹp như Research, màu Execution:** apparatus giống Research (lưới đứt, tick UTC, crosshair snap, tooltip gọn, nhấn điểm cuối, vùng stage/gap, drawdown tách panel, phím mũi tên) nhưng chỉ dùng token Carbon (`--exec-chart-*`, `--accent`, `--good/--bad`, stage). Không làm mịn đổi extrema; gap là gap; mô phỏng là nét/hatch, không dựa riêng màu.
3. **Chữ tối giản:** Execution gọn như app giao dịch: một câu trạng thái, một hệ quả, một hành động. Phụ đề ≤60 ký tự, ≤4 chuỗi ≥60 ký tự mỗi màn, giải thích cơ chế đặt sau `<details>`. Không viết như Research.
4. **Luồng theo vai trò rõ ràng:** mỗi màn nêu rõ phần của Manager (toàn quỹ), Researcher (chỉ lát của mình, có tên portfolio nhưng không có tổng/peer) và Operator (xử lý ngoại lệ). Khác biệt hiển thị bằng một banner ngắn, không bằng đoạn văn.
5. **Đúng design system hiện tại:** radius 0, không pill, panel không viền, một cỡ KPI, tab gạch chân, accent chỉ cho trạng thái active, một nút đặc duy nhất. Component sáng tạo mới chỉ khi dùng ≥2 màn hoặc có nghĩa nghiệp vụ, kèm Reuse report.
6. **Khi lowfi xung đột design system, design system thắng** (lowfi chỉ là bản nháp luồng); ghi độ lệch cần Bobby duyệt.

Duyệt: **APPROVED nguyên văn (Bobby, 2026-10-17)** cho §9 (trừ cách cài reader ở 9.8.2, chờ giải thích thêm) và §10;
hiệu lực từ round sau. Quyết định cùng ngày: không chọn lát dọc nối-thật sớm — **thiết kế cả bộ song song trước, nối
thật sau khi từng nguồn qualified**. Duyệt rules không phải giao UXM; phase vẫn cần Bobby giao.

### 10.10 Kiểm chứng và hook theo tầng, commit vẫn tách phần (Bobby, 2026-10-18, chọn phương án A)

Vấn đề: hook pre-commit chạy toàn bộ `verify-workspace.sh` (~20–25 phút, build Docker) cho **mọi** commit, kể cả docs; ở giai đoạn đầu phát triển, chờ hook sau mỗi commit làm chậm tiến độ mà không thêm bằng chứng. **Commit vẫn tách theo phần như rules** (code riêng, docs riêng, mỗi đơn vị/lát một commit có nghĩa); chỉ độ sâu kiểm chứng đổi theo tầng.

1. **Chọn tầng trước khi commit** bằng cách đọc path đã stage, ghi tầng vào thân commit (`Verification: R0|R1|R2 ...`) và vào `test-results.json` (`tier`). Chọn tầng cao hơn khi nghi ngờ.

| Tầng | Khi nào | Phải chạy trước commit | Hook |
| --- | --- | --- | --- |
| **R0** docs/design/evidence, không đụng code, không đụng ledger toàn vẹn | mọi commit chỉ Markdown/JSON tài liệu/HTML thiết kế | `git diff --cached --check`; link/path trong file đã sửa; `scripts/execution-tracking-test.sh` nếu sửa tracker/Unified/ledger | `--no-verify` được phép |
| **R1** phát triển trong lát, nhánh `claude/fe-parity`, chưa push | code frontend (hoặc test) của một đơn vị | vitest **focused** (thư mục chạm + gate liên quan trong thẻ lát) + `tsc --noEmit`; `scripts/refresh-release-integrity-ledgers.sh --write` nếu chạm Execution frontend; build cờ tắt + grep khi chạm điểm mount | `--no-verify` được phép |
| **R2** mốc | cuối mỗi lát (S0, S1…), trước bàn giao cho Codex/Bobby duyệt, trước **mọi** push, ff-merge hoặc hạ cánh | vitest rộng (`src/execution src/styles src/app src/portal`), build cờ tắt/bật, baseline ảnh pinned-image ở verify mode khi lát đụng pixel | hook đầy đủ, **không** bypass |
| **R3** chạm ngoài frontend | backend, contract, compose, Dockerfile, hạ tầng, `.githooks`, `scripts/verify-*` | gate riêng của khu vực đó | hook đầy đủ ngay lúc commit |

2. **Hook đầy đủ chạy một lần ở mốc R2 và phủ mọi commit R0/R1 từ lần R2 trước.** Lát chỉ được ghi DELIVERED sau khi R2 xanh; trước đó ghi `R1 only, R2 pending` trong packet. Commit mốc là commit cuối của lát (có thể là docs); hook chạy trên cây tại điểm đó.
3. **Không bao giờ báo xanh cho gate chưa chạy.** Gate nào bỏ qua ghi `NOT_RUN` + lý do + tầng nào sẽ chạy nó. Lỗi có sẵn trên tip Codex không chặn lát nhưng phải vào debt register với bằng chứng "fail không do thay đổi này".
4. **Phạm vi bypass hẹp:** chỉ `--no-verify` cho R0/R1 trên `claude/fe-parity`, chưa push. Không dùng cho nhánh khác, không dùng khi chạm tầng R3, không dùng để vượt một gate đã đỏ vì lỗi do mình gây ra. Mỗi push/ff-merge/hạ cánh yêu cầu R2 xanh trên đúng SHA đẩy đi.
5. **Chạy nền, không canh:** hook R2, vitest rộng và baseline chạy nền; trong lúc hook R2 chạy, cây code đóng băng (chỉ ghi vào scratchpad). Vitest focused và `tsc` chạy ngay trong lúc làm việc, không đợi.
6. **Subagent:** mỗi đơn vị chỉ chạy gate focused của mình; primary chạy gate rộng một lần sau khi hợp nhất.
7. Điều này **thay** câu "gom normal hook/gates một lần cho coherent commit" ở §6 bằng quy tắc cụ thể trên, vẫn giữ "không lặp full build/engine/load/DR chỉ vì thay docs" và "không bypass hook" cho mọi trường hợp ngoài R0/R1 nêu ở khoản 4.

Duyệt: **APPROVED (Bobby, 2026-10-18)**, phương án A của câu hỏi "Hook theo tầng".

### 10.10a Quy trình chạy test cho nhanh mà không thiếu (Bobby, 2026-10-19)
Đo thực tế ngày 2026-10-19: vitest rộng chỉ mất khoảng 2 phút chạy thật; phần chờ lâu (40–50 phút) là **xếp hàng sau khóa `/tmp/portal-heavy.lock`** khi hook của Codex (`gate.py land`) đang giữ. Visual pinned-image mất 18–21 phút, hook đầy đủ còn lâu hơn. Vì vậy:
1. **Writer (subagent) chỉ chạy test tập trung** (`vitest run <đường dẫn của mình>` + `tsc`). Không writer nào chạy vitest rộng, visual hay hook. Một người tích hợp chạy gộp **một lần** khi mọi writer đã dừng.
2. **Khóa `/tmp/portal-heavy.lock` chỉ dành cho việc dùng Docker/PostgreSQL hoặc rất nặng** (hook R2/R3, visual pinned-image, `control-api-test.sh`). Khóa này là **quy ước của hai agent** (§10.11.5), không cơ chế nào ép; nó có để hai gate không tranh CPU/RAM và làm trượt test có hạn chót. **vitest, tsc, Playwright V2 không cần khóa**: chạy thẳng, giới hạn worker (`--maxWorkers=3`) để không làm chậm gate của bên kia. Chuỗi việc nặng gói trong một script nền để không ai phải canh; không bao giờ để server dài hạn giữ lock.
3. **Việc không cần khóa chạy song song**: Playwright V2 (`chromium-v2`, cổng 4176) chạy cùng lúc với vitest rộng.
4. **Visual V1 theo phạm vi thay đổi**: đổi chỉ trong `v2/**` thì chỉ cần Playwright V2 + vitest (V1 build không nạp CSS/JS của V2, đã kiểm). Đổi file **dùng chung với V1** (ví dụ `ReplayCandleChart.tsx`, CSS `execution.css`) thì chạy visual V1 **có -g** cho spec chạm file đó. Visual **toàn bộ** chỉ ở mốc R2 trước hạ cánh.
5. **Hook đầy đủ chỉ ở mốc** (R2/R3 và trước hạ cánh); commit trong lát dùng `--no-verify` sau gate tập trung (§10.10). Khi sửa mã dùng chung, chứng minh đường mặc định không đổi bằng cách chạy test mới trên **mã cũ** trong worktree tạm (test "default" phải xanh, test mới phải đỏ).
6. **Review độc lập chỉ-đọc chạy song song với việc đang đóng băng** (hook đang chạy): đọc `git diff`, không chạy test nặng.

### 10.11 Chia việc Codex / Claude sau khi backend đã đi trước (Bobby, 2026-10-18)

Bối cảnh: Codex đã làm phần lớn nền backend (ELP2-02…10); Bobby giao Claude **làm chính FE và làm cả backend ở phần contract mà FE cần** để rút ngắn workflow, thay vì chờ từng request. Đây là một **giao việc có phạm vi** theo CLAUDE.md (Research override: "either may work both sides within an explicit assignment"); nó không bỏ quy tắc "backend authority thuộc Codex" cho phần còn lại.

**1. Ai giữ gì**
| Bên | Giữ | Không đụng |
| --- | --- | --- |
| **Codex** (backend lead) | Phần dở của Codex (gói pending-recall: sửa migration 144, đóng gate); identity/quyền/delegation (ELP2-02/03: FE-015/026/037/038, capability catalogue, self-nav); Manager/PM/Score/Regime (05/06: FE-002…013, 017…019, 022, 025, 029, 032, 033, 035, 036, 041); command/workflow và lifecycle/criteria cockpit (07/08: FE-020, 027, 028, 030, 031, 034, 039); realtime (09: FE-024); qualification/provider/HK/infra (10/11); registry rev 7; ledger R2 (gồm DEBT-UXM07-002) | `apps/portal/frontend/**`, thiết kế V2, ledger FE-xxx của Claude |
| **Claude, frontend** | Toàn bộ `apps/portal/frontend/**`, thiết kế/HIFI V2, double e2e và fixtures phía FE, recorder baseline, DEBT-UXM07-001/003, nghiệm thu trình duyệt, ledger FE-xxx và receipt UXM-07 | file backend của Codex |
| **Claude, backend (mới)** | Chỉ các lát **cộng thêm, phía đọc, hình dạng do FE cần**, nằm ngoài vùng Codex đang sửa: **B1** FE-042 + FE-043 (operations queue V2: liên kết incident nhiều-nhiều và `status_counts` cùng một snapshot truy vấn); **B2** FE-040 (`ARG EXECUTION_V2_SCREENS` trong `deploy/images/portal-web.Dockerfile`, mặc định rỗng) | quyền/grant/delegation, PM/Manager/Score, command, realtime, migration của Codex, bất kỳ file Codex đang có thay đổi chưa commit |

**2. Ràng buộc Codex đã đặt cho B1/B2 (đọc `evidence/ELP2-10/claude-review-intake-2026-10-18.md`, giữ nguyên):** FE-042 dùng bảng nhiều-nhiều `execution_incident_operation_links`, cả hai đầu phải được ủy quyền, kết quả có giới hạn, lịch sử không xác nhận được trả về dạng typed absence, **không** chọn incident đầu tiên hay suy quyền incident từ quyền operation; FE-043 dùng lại boundary aggregate repeatable-read của `query/postgres`, định nghĩa rõ predicate KPI được hỗ trợ, đếm trên **cùng** snapshot đã lọc và ủy quyền (không đếm theo trang, không gọi N lần), và "SUCCEEDED trong queue" không phải APPLIED tài chính hay thành công trên sàn. Không thêm tên vào danh mục `PORTAL_CAPABILITIES` (owner-all) cho FE-037.

**3. Nhánh và worktree (không ghi nhầm chỗ)**
- Codex: `docs/research-loop-plan` tại `/home/bobby/portal-research` (cây có thay đổi chưa commit). **Claude không bao giờ ghi vào checkout này** và không `git stash`.
- Claude: `claude/fe-parity` tại `/home/bobby/portal-research-fe` (cả FE lẫn B1/B2, commit tách theo đường dẫn). Bản sao lưu trước lần ghép này: `backup/fe-parity-pre-rebase-2026-10-18` = `3b6dad16`.
- Mỗi vòng, Claude `git rebase` lên tip Codex **chỉ khi cây sạch**. File sinh tự động (`services/portal-execution-edge-rs/contracts/{eds12,n29}*`, `packages/contracts/contracts-snapshot.json`, `generated/*`, ledger R2) **không ghép tay**: lấy bản của Codex rồi chạy lại script sinh. File chung còn lại (`UNIFIED_IMPLEMENTATION_PLAN.md`) ghép tay, mỗi bên chỉ sửa dòng của mình.

**4. Hạ cánh vào `docs/research-loop-plan`** (không có việc Claude tự ghi): khi Codex đã commit gói đang dở và cây của Codex sạch, Codex (hoặc Bobby) chạy `git merge --ff-only claude/fe-parity` trong checkout của Codex, sau khi Claude vừa rebase lên đúng tip đó và **R2 xanh trên đúng SHA** (§10.10). Nếu tip Codex đã đổi sau lần rebase của Claude thì Claude rebase lại trước. Không push, không merge dev/main khi chưa có Bobby.

**5. Tài nguyên dùng chung:** hook R2/R3 và Docker/PostgreSQL chạy một job nặng mỗi lần giữa hai agent. Claude bọc lệnh nặng bằng `flock /tmp/portal-heavy.lock`; Codex được đề nghị làm cùng (không bắt buộc, không chặn Codex).

**6. Hai chiều:** mỗi lát B1/B2 giao cho Codex theo §7.2 (contract, fixture canonical, test âm tính, giới hạn); Codex ghi ACCEPTED hoặc CHANGES_REQUESTED trong packet phase 04 và phase 10. Backend request FE khác vẫn đi qua sổ FE-xxx, không sửa thẳng file của Codex.

Duyệt: **Bobby 2026-10-18** ("Claude làm chính FE và cả backend phần liên quan contract với FE"); chia chi tiết ở trên do Claude đề xuất, Codex cập nhật cột của mình khi đọc.

### 10.12 Check chéo để không sinh gap, và cách đọc HK/Edge (Bobby, 2026-10-18)

**1. Chuỗi hợp đồng và chủ từng mắt xích**
`Nguồn HK (TS execution, PM, DL)` → `Edge (Rust, HK + contract pack trong repo)` → `control-api (BFF)` → `OpenAPI / generated types / fixture canonical` → `FE reader (v2/boundary)` → `màn`.
Codex giữ HK → Edge → control-api → OpenAPI/fixture. Claude giữ reader → màn → nghiệm thu trình duyệt, cộng B1/B2 (§10.11). Mắt xích chung duy nhất là **hợp đồng đã publish trong repo**: FE chỉ code theo thứ nằm ở đó, không theo lời kể, không theo chat.

**2. Ba kênh giao tiếp, tách bạch**
- **(a) Đọc nguồn:** SSH chỉ-đọc `bobby@16.163.212.33` vào đúng worktree trong [SOURCE_ALIGNMENT](evidence/SOURCE_ALIGNMENT_2026-10-15.md): repin SHA đầy đủ, digest thay đổi chưa commit, guide/journal mới (§2). Không Docker/DB/ghi/build/credential. **Codex là người đọc chính** (contract, catalogue dữ liệu, API nguồn, kết quả ghi thành locator `file@SHA:dòng`). **Claude chỉ đọc mẫu khi gói giao** (Bobby duyệt 2026-10-18): mỗi family một field, đối chiếu locator của Codex với nguồn, ghi vào bảng ở mục 3.
- **(b) Hợp đồng trong repo:** OpenAPI + generated types + fixture canonical + `services/portal-execution-edge-rs/contract-pack.lock.json`, ledger. Đây là thứ FE đọc. Mỗi thay đổi đi kèm SHA và ví dụ.
- **(c) API runtime qua Edge relay (trust/TLS/profile):** hôm nay **source-dark**; chỉ trở thành "thật" khi dòng tương ứng của Source Truth Board là `EXISTS_MOUNTED` kèm receipt nguồn thật và Bobby giao UXM-08. Một HTTP 200 hay một migration không chứng minh runtime (§2).

**3. Source Truth Board** — [evidence/SOURCE_TRUTH_BOARD.md](evidence/SOURCE_TRUTH_BOARD.md): một bảng sống, mỗi hàng một family đọc. Codex điền cột nguồn/Edge/trạng thái; Claude điền cột FE (route, reader, màn, fixture, mọi ô "Not published" kèm FE-id) và kết quả đọc mẫu. Quy tắc: mọi ô "Not published (FE-xxx)" trong UI phải trỏ về một hàng `SOURCE_DARK`/`MISSING` còn mở; không có hàng đó thì ô đó là lời nói dối.

**4. Gate check chéo cho mỗi giao hàng**
- **Codex giao contract** → trong vòng gần nhất Claude ra **consumer receipt** ACCEPTED/CHANGES_REQUESTED, gồm: nạp fixture L0 qua reader; số field published / consumed; field bị bỏ có chủ ý; ô "Not published" nào đóng được; đọc mẫu nguồn nếu gói cho phép. Không có receipt thì không DELIVERED→VERIFIED.
- **Claude giao lát (B1/B2 hoặc FE)** → Codex ra **producer receipt**: kiểm quyền/ủy quyền (hai đầu), snapshot, predicate, bảng giới hạn; ACCEPTED/CHANGES_REQUESTED trong packet phase.
- **Báo cáo gap mỗi vòng (một lệnh, không bằng trí nhớ):** (i) fixture canonical chưa có reader/màn nào dùng; (ii) ô "Not published" không có hàng board mở; (iii) endpoint mà FE gọi nhưng không có trong OpenAPI; (iv) hàng board `EXISTS_MOUNTED` chưa có consumer receipt. Ghi kết quả vào sổ đồng bộ §0.
- Không bên nào sửa file của bên kia (§10.3); bất đồng đi qua request/review có bằng chứng, `BLOCKER` phải trả lời vòng sau.

**5. Cadence:** round-start (§10.1) và round-end (§10.2) như cũ; khi một bên dừng, bên đó để lại một **handoff note** trong packet (đang dở gì, file nào chưa commit, đợi gì). Ghi hai SHA nhánh và thời điểm đọc.

Duyệt: **APPROVED 2026-10-18** (Bobby: check chéo; Claude được SSH đọc mẫu khi gói giao).

### 10.13 Bàn giao toàn bộ backend còn lại cho Claude (Bobby, 2026-10-20)

Yêu cầu mới nhất của Bobby: **Claude tiếp tục toàn bộ backend**, không chỉ frontend hoặc
B1/B2. Addendum này thắng các giới hạn phân vai cũ trong §10.11 và §10.12; không xóa lịch sử.

- Claude là implementation owner cho Portal Core/Execution backend còn lại, contracts,
  generated fixtures, policy/composition Research, nguồn đọc/financial projection, command
  bridge, realtime và qualification trong phạm vi đã duyệt; vẫn giữ frontend/design.
  Không phải chờ Codex sửa từng backend request đã nằm trong giao việc.
- Codex là reviewer/integrator và hỗ trợ source coordination, không còn độc quyền code các
  vùng cũ. Source TS/PM/Edge vẫn do owner bên HK kiểm soát; giao backend Portal không phải
  quyền sửa WIP hoặc deploy source bên kia.
- Claude được SSH **đọc đầy đủ nguồn liên quan** để repin contracts/catalogue/journal/receipts,
  không chỉ đọc một field mẫu. Mutation/runtime vẫn theo đúng gói Research/finite window đã
  duyệt và source owner confirmation; không stable/dev/main, command/Live hay sao chép quyền stable.
- Handoff hiện hành: [All-backend handoff 20/10](evidence/ELP2-10/CLAUDE_ALL_BACKEND_HANDOFF_2026-10-20.md).
  Nó phân biệt đã có code, consumer, installed và connected proof; không dùng note OPEN lịch sử
  để làm lại BE-P1…5 hoặc issue lại identity đã COMMIT/ACK.
- Giữ one-writer trên từng file/branch; không đụng canonical WIP. Claude tiếp tục lane hiện có;
  landing do integrator phối hợp khi sạch và gates tương ứng đạt, không tự merge/push.
- Giữ rules verification §10.10, source authority, immutable evidence, budgets, cleanup và
  two-way producer/consumer review. Khi cùng agent viết backend/FE, vẫn phải có hai receipt
  phân biệt và review độc lập ở mốc; không tự biến fixture thành source owner acceptance.
- Mỗi round nêu backend tiếp tục được gì, frontend nối gì, request nào gửi Edge/PM, blocker nào
  cần Bobby; làm việc độc lập tiếp khi một input nguồn chưa có. Không mở ELP2-11/release bằng
  cách thay định nghĩa gate hoặc đổi người giữ việc.

### 10.10c R0 Markdown cho Codex (Bobby, 2026-10-21)

Bobby duyệt áp dụng cùng R0 cho **commit thuần Markdown của Codex**, không còn
giới hạn R0 ở nhánh Claude. Đây là ngoại lệ hẹp bổ sung §10.10.4, không thay
quyền R1 hay gate R2/R3:

- Chỉ file Markdown tài liệu/receipt/tracking; không code, generated contract,
  schema, manifest/ledger toàn vẹn, runtime/config hoặc thay test/gate.
- Trước commit: kiểm explicit staged path, `git diff --cached --check`, link/
  locator của phần mới; chạy `scripts/execution-tracking-test.sh` khi sửa
  Unified/tracker. Ghi `Verification: R0` và kết quả thật trong receipt.
- Được `--no-verify` đúng commit R0 đó để không lặp build/test chỉ vì ghi nhận
  bằng chứng. Code và candidate hạ cánh vẫn qua normal gate theo §10.10;
  R0 không biến gate đỏ thành PASS hoặc source-only thành installed/connected.
- Không giữ heavy lock cho kiểm tài liệu; giữ one-writer, commit có scope và
  không push/deploy/dev/main nếu chưa có lệnh riêng.
