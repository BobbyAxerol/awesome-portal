# Execution V2 — đóng gói báo cáo 48 giờ, 2026-10-18

REPORT_ONLY / NOT_A_RELEASE / ELP2-10_NOT_FULL_PASS / ELP2-11_NOT_ENTRY_READY.

## 1. Phạm vi và cách đếm

- Window cố định: 2026-10-16T13:39:37Z → 2026-10-18T13:39:37Z.
- Repo / branch: /home/bobby/portal-research / docs/research-loop-plan.
- Baseline: 630eafc563159305727bab7c588a27da27df827f.
- HEAD đã commit: ff83f1766b513c18d3fb0102cfc5c6889ffb6343.
- 40 first-parent commits, 450 file paths khác nhau, +137910/-2624 dòng.
- Đây là NET DIFF baseline→HEAD, không cộng lại churn qua từng commit.
  Không cộng generated/contracts/tests thành số dòng nghiệp vụ.
- [Toàn bộ 450 file và số dòng](work-summary-2026-10-18.files.tsv).
- Claude FE peer được đọc sạch tại 3b6dad1671e0a8ef2e479b3110dea9fddc2d0689
  trên claude/fe-parity. Không merge peer, sửa FE hoặc tính công FE vào 40 commit.
- Chỉ tổng kết Portal Git. Candidate ngoài repo/SSH và thời gian tool chờ không
  tự trở thành code Portal hay runtime qualification.

| Khâu | Files | Thêm | Xóa |
| --- | ---: | ---: | ---: |
| Backend apps/control-api/src |159|22619|672|
| Migration SQL |6|313|0|
| API + contract tests |121|35774|207|
| Schema/OpenAPI/generated/fixtures |66|60723|1638|
| Plan/evidence/handoff/ledger |68|15479|4|
| Tooling/scripts/integrity metadata khác |30|3002|103|
| Tổng |450|137910|2624|

## 2. Đã xây gì theo phase/khâu

| Khâu | Implementation đã commit | Ranh giới chưa được gọi là hoàn tất |
| --- | --- | --- |
| ELP2-02/03/10 identity và authority | Current-human transaction/commit fencing; revoke/delegation/current grants; paired identity write; private workspace provisioning; one-view session recovery; existing TS mapping verification | Candidate/protocol proof không thay actual provider installation và production trust. One-view không lưu lại token/cookie để tạo login thành công giả sau crash |
| ELP2-04 readers và Governance | Scope trước list/detail/aggregate/status/history; account metadata, F0, operation/incident/runtime/heartbeat; R1/R2/Paper Exit/activation/Live parent readers và current-purpose checks | Đọc được không nghĩa R2/Live executor hoặc upstream trading được bật. Phải còn current-source và owning-provider qualification |
| ELP2-05/06 Manager | Shared Score calculation integration; original/restated Score/Composition/Regime publication/history; bounded workers/readers; custody, source dependency, immutable revision và current scope | Financial denominator/NAV/input assembly/corpus, approved calibration và actual mounted worker/provider vẫn có gate mở |
| ELP2-07/08 command/workflow | PM typed codecs; current command fences; capital workflow receipt reads; durable instance-registration family với preview/submit/status/history và same-key UNKNOWN recovery | Registration local family đã commit/test; provider vẫn default-dark. Những family còn lại không được nhận quyền từ capital/register |
| ELP2-09 realtime/native reads | Exact selected source, bounded final egress, custody/lifecycle, durable settlement→source ACK và current revoke fences | Chưa commissioning actual selected runtime continuity/correction/revocation provider cho toàn luồng |
| ELP2-10 quality | Actual API/contract tests, scoped disposable PG/restore/access digests, readiness tooling, immutable source/index checks và cleanup receipts | Approved budgets/calibration, paired coexistence/P184 G2 và Claude real-browser consumer không được thay bằng fixture PASS |

Các thư mục chính:
`apps/control-api/src/{execution-v2,execution,governance,operations,auth,activation,admin,profile-read,manager-lists}`;
`apps/control-api/test/elp2*`; `packages/contracts/{openapi,generated,fixtures,test,tooling}`;
`upgrade/execution_loop/evidence/ELP2-02…10/`.
Sáu migration đã commit là 138…143. Migration144 mới nằm trong WIP.

## 3. Yêu cầu Claude: đã đọc, đã làm và còn mở

[Review intake hiện tại](claude-review-intake-2026-10-18.md) pin ledger gốc
FE-001…043/RV-1…10 của peer; không tạo một request authority thứ hai.

- Đã đọc ledger, design/sync digest, review2 feasibility, UXM-07 receipt,
  backend requests và debt. Đưa to-do/exit về packet phase sở hữu02…10,
  cập nhật Unified/rules. Đây là planning/triage, KHÔNG phải 43 DELIVERED.
- FE-005 conservative totals và FE-009 bounded output đã có implementation:
  thiếu fact không tự thành tổng đủ; không thêm implementation trùng.
- DEBT-UXM07-002: đã sửa ownership metadata của queue_v2 thành VIEW_DERIVED,
  không tạo writer hay TTL riêng; undecided retention của backing table vẫn giữ.
  Thay đổi metadata này hiện UNCOMMITTED.
- FE-006 universal TWR, FE-011 bỏ numeric Score, FE-018 vendor toàn Edge,
  FE-030 generic decision executor: CHANGES_REQUESTED kèm source reason,
  không tự làm theo cách gây sai semantics.
- FE-026 own-researcher finite field matrix và FE-036 as-of behavior:
  NEEDS_OWNER_DECISION, không tự allow-all hoặc bỏ qua as_of.
- Self/nav eligibility, Manager query/window/metric, lifecycle/cockpit
  refinements khác đã vào owning plans; chưa được coi là đã code hết.
- Đã sửa generator cookie registration về actual canonical
  __Host-portal_session và thêm regression; hiện UNCOMMITTED.
- FE hiện có UXM-00 audit/design + UXM-07 S0/S1 fixture/BFF-double, không còn
  đúng nếu nói blanket frontend chưa bắt đầu. Chưa có real-source acceptance.
- Không tuyên bố handoff đã được Claude nhận/ACK chỉ vì đã viết file.

## 4. Validation: tách HEAD xanh với WIP đỏ

### HEAD ff83f176 — normal hook terminal PASS

Finished 2026-10-18T13:28:43.703383Z:
969 contract tests PASS; 7427 API tests PASS, 3 existing skips.
Supported Node22 build, actual scoped PG restore, four access row digests,
frozen source/index/eight protected runtime tuples và owned cleanup PASS.
Không cộng các focused/full rerun thành coverage mới.

[Registration receipt](../ELP2-07/instance-registration.md#actual-normal-hook-terminal-2026-10-18t132843utc).
Private log:
`/home/bobby/.local/state/portal-execution-elp210/20261018/registration-family/instance-registration-land-124722/gate.log`.
SHA256: 0f1580c03abd5edf15709c1d048512e27fc208d16a43ec7e9d1268a56196c178.

### WIP pending-control — FAIL_OR_INCOMPLETE, KHÔNG LAND

Snapshot trước report packaging: 32 modified +15 untracked =47 files,
+6905/-17 dòng (untracked6586 dòng). Không nằm trong thống kê40 commit.

Đã viết: APPLY_PENDING/CANCEL_REMAINING trên recall cũ; exact CAS/source byte
proof; separate current mutation/audit; rollback preview; durable key/attempt/
event/audit trước send; nguyên receipt gốc tách latest owning receipt; typed
UNKNOWN/absence; additive Core144; OpenAPI/types/fixtures và PG/HTTP tests.
Provider vẫn default-dark, không có source command thật.

Gate khởi động từ trước yêu cầu report, chờ foreign measurement lock được nhả,
không xóa/chiếm lock của bên kia. Terminal 2026-10-18T13:42:45.034550Z:
Node22 build PASS; 279 tests PASS, 79 skipped; 4/10 suites FAIL tại setup
migrateTestDatabase, PostgreSQL báo syntax error at end of input.
Vì migration/setup thất bại, KHÔNG có PG/HTTP transaction receipt PASS,
không được tính skipped thành N/A, không chạy tới restore/contract gate tiếp.
Nguyên nhân chính xác trong migration cần sửa/validate ở gói tiếp; chưa giả vờ đã fix.

Private controller/log:
`/home/bobby/.local/state/portal-execution-elp210/20261018/pending-control/pending-control-focus-133848/`.
Log SHA256: 15fb17b98ffccb7773b72f398fe53f3bf7b2b5a1ef1fb28fbb4a8953d7bd63ba.
Controller: source unchanged, remaining_owned_resources=[], terminal FAIL_OR_INCOMPLETE.
Trước report, tracked diff SHA256 (không bao gồm15 untracked):
ee9f80f9360fe7127edf07bc703f067d607977cfcb50e8f1784911eb43125632.

## 5. Còn gì / thứ tự tiếp

1. Sửa và qualify migration/PG/HTTP của pending-control; gom một coherent
   landing khi gate đạt. Không trộn WIP đỏ vào ff83f176 đã chứng minh xanh.
2. Claude current self/nav eligibility và Manager query/window requests
   theo owning packet, giữ original request IDs và consumer ACK riêng.
3. Những source/trust/provider gaps, remaining command families và actual
   Composition/Regime/realtime financial input qualification theo đúng guide.
4. Budget/calibration artifact được duyệt; actual coexistence/P184 performance
   G2 và independent browser integration. Không dùng fixture constants làm
   production defaults.
5. ELP2-10 chưa full-PASS; ELP2-11 chưa entry-ready. Không mở phase mới trong
   lượt packaging này.

40 commit là nền backend + contract + tests/evidence, không phải40 tính năng
đã chạy production. Việc chia nhiều gói/hook và sửa regression đã tăng thời
gian; không thể lấy khối lượng test/generated code để gọi toàn sản phẩm xong.
Lượt này chỉ đọc Git/log và đóng gói Markdown/TSV; không thêm full suite.
Không push, merge dev/main/peer, ký release, deploy, đổi credential, bật runtime,
upstream command hay Live. Giữ nguyên code WIP và toàn bộ dữ liệu.

## 6. Danh sách 40 commit, cũ → mới

| Commit | Committer time (UTC) | Nội dung |
| --- | --- | --- |
| `12a6412b` | 2026-10-16T14:13:38+00:00 | feat(execution): wire bounded Manager commissioning and precomputed Score |
| `fa857b85` | 2026-10-16T15:01:25+00:00 | fix(execution): qualify reviewed root membership receipts |
| `d92efc0e` | 2026-10-16T18:20:53+00:00 | feat(execution): fence candidate current-human commit authority |
| `26e688e4` | 2026-10-16T20:28:24+00:00 | feat(execution): coordinate candidate human drain and private recovery |
| `31c2322c` | 2026-10-16T20:54:55+00:00 | fix(execution): preserve paired identity writes and pending contracts |
| `b3620cf5` | 2026-10-16T21:31:04+00:00 | fix(execution): fence personal workspace provisioning and exact recovery |
| `a241a587` | 2026-10-16T22:15:25+00:00 | fix(execution): coordinate verified policy and root receipt purposes |
| `30162a3f` | 2026-10-16T22:43:33+00:00 | fix(execution): fence delegated receipt authority through commit |
| `9a3a27c8` | 2026-10-17T02:49:25+00:00 | fix(auth): fence verified one-view session issuance and recovery |
| `0d8bbaee` | 2026-10-17T03:59:33+00:00 | feat(execution): provision and bind private candidate identity trust |
| `8ba33de3` | 2026-10-17T05:04:24+00:00 | feat(execution): verify existing TS identity mappings over pinned mTLS |
| `be97b20e` | 2026-10-17T06:14:04+00:00 | feat(execution): complete scoped identity and regime calculation foundations |
| `68923d29` | 2026-10-17T06:56:38+00:00 | feat(execution): add current-authorized operation and technical runtime readers |
| `fdab164c` | 2026-10-17T07:34:19+00:00 | feat(execution): materialize and fence full-accounting composition publications |
| `d483357a` | 2026-10-17T09:04:17+00:00 | fix(execution): bind current grants to exact native resource proofs |
| `322e2347` | 2026-10-17T10:26:13+00:00 | feat(execution): complete bounded manager derivations and current command fences |
| `f1f5fc7d` | 2026-10-17T11:11:51+00:00 | feat(execution): retain metric dependencies and bounded bracket observations |
| `0aad2697` | 2026-10-17T13:18:44+00:00 | feat(execution): complete scoped score history and exact PM candidate codecs |
| `609d11dd` | 2026-10-17T14:06:54+00:00 | feat(execution): retain original PATH proof through historical score revisions |
| `f734db9d` | 2026-10-17T15:35:45+00:00 | feat(execution): publish bounded heartbeat and source-pinned private read transport |
| `f9034d52` | 2026-10-17T16:06:29+00:00 | feat(execution): retain exact original composition allocation through immutable history |
| `233b217b` | 2026-10-17T16:50:51+00:00 | feat(execution): retain dependent composition through scoped immutable history |
| `6a01686e` | 2026-10-17T17:49:34+00:00 | feat(execution): retain independent original regime inputs through one source transaction |
| `888d0171` | 2026-10-17T18:55:26+00:00 | feat(execution): complete independent regime historical worker and scoped history |
| `5cac1151` | 2026-10-17T19:40:18+00:00 | feat(execution): complete finite account sync and scoped command status readers |
| `c730729e` | 2026-10-17T20:19:39+00:00 | feat(execution): retain native read obligations before source admission |
| `43e877fd` | 2026-10-17T21:16:36+00:00 | feat(execution): add exact native source selection and bounded final egress |
| `0ccdc5ed` | 2026-10-17T21:55:49+00:00 | feat(execution): bind native read lifecycle to actual final egress and source ACK |
| `005de29b` | 2026-10-17T22:35:46+00:00 | feat(execution): serve current-authorized capital workflow receipts |
| `da3a5f5c` | 2026-10-17T23:18:28+00:00 | feat(execution): serve finite account metadata with exact current account scope |
| `67e5ea66` | 2026-10-18T00:06:00+00:00 | fix(execution): preserve independent resource and mixed Portfolio read authority |
| `880a3d66` | 2026-10-18T00:49:47+00:00 | feat(execution): serve finite F0 intents with exact current audit authority |
| `2c943e14` | 2026-10-18T01:26:52+00:00 | feat(execution): bind exact scoped notice v2 without granting finite frame authority |
| `1b6df86e` | 2026-10-18T02:14:16+00:00 | feat(execution): couple scoped frames to current authority and durable native settlement |
| `d9fc67fb` | 2026-10-18T03:48:52+00:00 | feat(execution): add exact-own F0 history with current session fences |
| `49bdc6e1` | 2026-10-18T05:37:32+00:00 | feat(execution): fence finite operational queue workflow and incident reads |
| `ac056d46` | 2026-10-18T07:14:20+00:00 | fix(execution): fence workflow reads and preserve captured governance identity |
| `0d5ceaba` | 2026-10-18T08:16:09+00:00 | feat(execution): publish current-qualified finite R2 and Paper Exit parents |
| `25218372` | 2026-10-18T11:45:10+00:00 | feat(execution): complete scoped governance activation and Live readers |
| `ff83f176` | 2026-10-18T12:47:23+00:00 | feat(execution): add source-dark durable instance registration family |

Commit timestamp là thời điểm commit được tạo/normal-hook bắt đầu, không
phải số đo thời gian lao động hay chứng minh test kết thúc tại timestamp đó.
