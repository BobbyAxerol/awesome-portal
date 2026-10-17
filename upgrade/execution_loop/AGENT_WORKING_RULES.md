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
  regressions theo gói, gom normal hook/gates một lần cho coherent commit; không
  bypass hook, không lặp full build/engine/load/DR chỉ vì thay docs.
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
