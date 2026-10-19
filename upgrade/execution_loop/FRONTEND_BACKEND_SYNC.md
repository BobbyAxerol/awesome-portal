# Execution Loop V2 — Sổ đồng bộ Frontend ↔ Backend (sống)

Chủ ghi: Claude (phía FE). Codex đọc ở **đầu mỗi round**, trả lời bằng cách đổi `Status` trong packet phase sở hữu và
nêu ID ở đây (xem [Rules §10](AGENT_WORKING_RULES.md)). Đây là **ledger duy nhất cho request FE → BE** và cho review
của FE về backend; ledger BE → FE vẫn nằm trong packet từng phase. Không nhân bản sang file khác.

Trạng thái bản này: Rules §9–§10 **đã được Bobby duyệt 2026-10-17**; sổ này là công cụ vận hành của chúng. Chưa có UXM nào được giao; mọi request dưới
đây là yêu cầu *chuẩn bị contract*, không phải lệnh mở phase.

## 0. Nhật ký pin — lần đọc gần nhất

### Codex renewed C7 round — 2026-10-19, after d078 landing

Latest continuation reads peer`f9306af8030d89ac7b529be705b267c66f10e44d`,
including`0f58115a` reader SE-1/CC-1/CC-2 follow-through and ledger refresh.
No new request in that committed delta; peer staged receipt WIP untouched.
Research-only installation is now approved by Bobby. Explicit native profile,
registered offline schema and private preview overlay are implemented but NOT
installed. Actual official readonly lookup returned NO_ACTIVE_MAPPING for
the exact Research Bobby, not stable Bobby. [Implementation, preserved failed
focused gate, corrected diagnostic and next operational work](evidence/ELP2-10/c7-closeout-followthrough-2026-10-19.md#research-only-native-composition--implementation-and-actual-observations).
No consumer/browser or connected finite/SSE PASS inferred; FE-054 other
subrequests and each FE-057…063/065 remain individually OPEN. Reused3agents,
0new. No frontend edits, peer merge, push, dev/main or stable action.

Clean canonical `d0789674afdff9e9a168a5a6f75e0f582c96ba54`; peer read pin
`4f892c47dcdb984cdddc752d218e504b7a61b10e` plus active frontend/ledger WIP.
No peer merge/edit. Previous actual normal hook PASS is reused for unchanged
paths, not called genuine source acceptance. [Current task map, ACT_NOW /
NEXT_GATE / INFO intake and scope](evidence/ELP2-10/c7-closeout-followthrough-2026-10-19.md).
FE-054 remains an actual exact-decimal producer gap; the individually open
FE-057…063/065 and current source gates are reviewed, not declared delivered.

Renewed follow-through: peer repinned read-only to
`a23c9d34e334d0485448e3ee5527b3939f40c476` (FE-only F5 closeout); no merge.
FE-054 decimal subrequest has opt-in source/schema/generated/fixture and fast
diagnostics, normal R3/PG pending. Timeline outcome/replay route remain OPEN;
no whole-request or consumer ACK. [Exact operation, invariants, test boundaries
and Claude next](evidence/ELP2-10/c7-closeout-followthrough-2026-10-19.md#fe-054-decimal-subrequest--source-implemented-normal-gate-pending).

### Codex round-start — 2026-10-19

Canonical clean entry `35953e073f609c154ec484b19b4ceeeb09b566c8` already contains
the Claude landing after e19; peer read pin
`0362285526458dddf3695ec719d82c2512dd1e1c`. No merge/replay of peer work.
Bobby assigned remaining C7/ELP2-10 qualification. Main reviews latest requests
and refreshes exact HK sources before using them. [Scope, gate and delegated
ownership map](evidence/ELP2-10/c7-runtime-integration-2026-10-19.md).
Source/consumer follow-through is IN_PROGRESS, not a new provider/runtime PASS.

Peer follow-up during this round: `4f892c47dcdb984cdddc752d218e504b7a61b10e`
adds five FE-only commits after the entry pin (58 files,+1519/−136); no new
backend request document in that committed delta. Read-only review only; peer
WIP is preserved. [C7 applied changes, four producer corrections, source cut and
individual still-open requests](evidence/ELP2-10/c7-runtime-integration-2026-10-19.md).
No peer merge while this backend batch is dirty; later landing requires Claude
rebase and R2 on the new producer pin, per §10.11. No remote push authorized.

| Nguồn | Pin đã đọc | Ngày đọc | Ghi chú |
| --- | --- | --- | --- |
| Portal `docs/research-loop-plan` | **tip `5291a80f`** (2026-10-18, commit pending-recall của Codex; cây Codex lại có 161 file chưa commit; trước đó `0d5ceaba`, `ff83f176`; `claude/fe-parity` đã rebase lên đây, code S0 `d891b2a5`); digest đọc ở **`ac056d46`** (đọc 2026-10-18, 19 commit trên `0aad2697`; xem [digest](design/sync/2026-10-18-codex-digest.md)); trước đó `0aad2697` ("complete scoped score history and exact PM candidate codecs"); đã đọc kỹ đến `f1f5fc7d`, commit cuối đọc ELP2-06 scoped-score-history + README 06/07 | 2026-10-17 | `claude/fe-parity` đã rebase lên `0aad2697` (docs-only, chưa có code FE V2) |
| TS execution (HK) | `c4819bc0` (`feat/v2-rust-first-okx-demo`) | 2026-10-17 ~11:15Z | Tôi đọc qua SSH chỉ-đọc; không kiểm runtime |
| PM (HK) | tôi đọc `673ce7cf`; **Codex ghi `e62b6825…` (10:29–10:31Z)** | 2026-10-17 | **CHƯA ĐỐI CHIẾU**: hai pin khác nhau (khác worktree hoặc PM đã tiến). Phải đọc lại trước khi dùng bất kỳ ngữ nghĩa PM nào |
| Edge EPG10 (HK) | `8560ac10…` | 2026-10-17 | Hai bên cùng pin; code chỉ có ở HK, không trong repo local |

### Sổ agent (tái dùng theo Rules §10.8)

| Vùng | Agent | Pin đã đọc | Trạng thái | Khi nào hỏi tiếp |
| --- | --- | --- | --- | --- |
| TS execution (HK) | `a617b80c6a131e34a` | `c4819bc0` | Đã hoàn thành digest 2026-10-17 | Hỏi *phần thay đổi* khi pin TS tiến |
| PM (HK) | (agent digest PM, ID chưa ghi lại) | `673ce7cf` | Đã hoàn thành; **cần đối chiếu `e62b6825`** | FE-019 |
| Edge (HK) | (agent digest Edge, ID chưa ghi lại) | `8560ac10` | Đã hoàn thành | Khi Codex nêu EPG10 đổi |

| FE inventory V1 | `ad491faedaae87b94` | `eafeb31e` | Hoàn thành (UXM-00) | Khi V1 FE đổi |
| Lowfi M02+M04 / M05–07 / M08–10 | `a60392f32440041aa` / `a4acfcd98307ef547` / `abf05a72cf1644cfa` | kit @ 2026-10-17 | Hoàn thành | Sửa lowfi sau khi Bobby duyệt flow |

Ghi chú: hai ID PM/Edge chưa được ghi lại trong phiên này; lần giao kế tiếp phải lấy ID thật từ danh sách agent và cập nhật bảng.

### Thay đổi từ lần đọc trước (đã đọc, 2026-10-17) và tác động lên FE

| Thay đổi của Codex | Mức khẩn với FE | Việc FE cần nhớ khi được giao |
| --- | --- | --- |
| **Receipt đặt-mục-tiêu không có số tiền** (`SET_ROOT_LIMIT`, `ADJUST_TARGET_BUDGET` có thể `amounts: null`; fixture `W08-ROOT-LIMIT-NONAMOUNT`, `W08-TARGET-BUDGET-REJECTED-NONAMOUNT`) | **Cao khi dựng màn lệnh vốn** | Không vẽ bảng chia 5 phần giả cho receipt không có amount; hiển thị hiệu ứng đặt-mục-tiêu. `UNKNOWN` thì hỏi lại ý định gốc, không gửi lại |
| `manager-models.d.ts` +293 dòng, OpenAPI manager +4811, dataset schema +925; thêm `regime_details`, calculation revisions (migration `…138`) | Cao ở lúc sinh type | Regenerate types, không sửa tay; Regime ở dataset vẫn `value: null` (chỉ nằm per-alpha/deployment) |
| Regime publication/runtime, score recalculation, composition publication | Trung bình | Chi tiết Regime nằm ở `regime_details`; summary dataset vẫn "policy_pending/unavailable" |
| **Scoped Score history (06)**: `executionManagerScoreRevisionGetV1` / `…HistoryGetV1`, types `ManagerScoreRevisionView/History/HistoryQuery`, fixture `…score-history.available.synthetic.valid.json`; hai cursor `after`/`before`, supersedes ref, nhãn CURRENT/NOT_CURRENT/UNKNOWN, luôn `HISTORICAL_ANALYSIS_ONLY` | Trung bình (cho Score history UI) | Thứ tự pointer là **nhân quả, không theo đồng hồ**; 409 khi tập quyền đổi → xóa pin; không suy ra số đếm ẩn; không coi lịch sử là Score hiện hành. Ghi chú review: cần fixture 409 và `UNKNOWN` |
| Hub realtime lifecycle (09) — vẫn NOTIFICATION_ONLY | Thấp | Không biến notification thành event replay tài chính |
| PM control candidate (lock/unlock) — **module riêng, không mount** | Thấp | Không có hành động lock/unlock qua Portal |
| Retained business aliases, finite retained pages (04) | Trung bình | Alias/route retained có thể đổi; không hard-code |

### 0b. Đối chiếu FE-001…036 với giao hàng mới của Codex (2026-10-18, từ [digest](design/sync/2026-10-18-codex-digest.md) §4)

PM hiện `b9fae791` (vượt `673ce7cf` và `e62b6825`, FE-019 coi là hết hiệu lực; ghi pin mới, chưa dùng ngữ nghĩa PM ở S0/S1). Edge `20a1d27f` (vẫn chỉ ở HK, FE-018 giữ). TS: chưa repin (`c4819bc0`).
**Phát hiện cấu trúc:** nhánh Codex chưa chứa Rules §9–§10, sổ này hay `evidence/UXM-00`, nên **FE-001…036 chưa vào ledger packet của họ**; tin nhắn đề nghị gửi: [PROMPT_FOR_CODEX](design/sync/PROMPT_FOR_CODEX.md) (Bobby chuyển, chưa gửi).

| ID | Trạng thái | Ghi chú |
| --- | --- | --- |
| FE-001 | PARTLY | Packet nay có operationId, type, fixture, lỗi `CommandProblem`, lệnh regenerate; thiếu `producer_sha`, manifest fixture, bảng bất biến chéo |
| FE-002 | CHƯA GIAO, thêm dữ kiện | `stage_filter` PAPER\|SANDBOX\|CANARY\|LIVE; Regime dùng ResearchIS…Live; `environment` hoa/thường lẫn |
| FE-009 | PARTLY | Command collection trần 1 MiB (1025 → 503); dataset chưa nêu |
| FE-015 | PARTLY | `CommandProblem.public_copy_key/safe_next_action` tùy chọn; chưa có `reason_class/grant_ref/step_up_required` |
| FE-020 | PARTLY | Có `executionCapitalCommandPreviewV1` (vốn); chưa có "what changes" cho quyết định governance |
| FE-021 | MÂU THUẪN MỘT PHẦN | Journal nguồn UNAVAILABLE; queue V2 cố ý bỏ actor/prose → không có audit "ai làm gì" |
| FE-030 | MÂU THUẪN NGUỒN | Queue V2 không có creator/ladder/SLA/needs_you; F0 chỉ là intent của chính actor; chưa có decision call hợp nhất |
| FE-031 | MÂU THUẪN MỘT PHẦN | Incident V2 `historical_children` NOT_PUBLISHED |
| FE-032 | PARTLY | Có `CommandStatus` theo resource + receipt `WorkflowCapital` (non-amount OK); chưa có edge/seq/ledger page |
| Còn lại | không đổi | |

**Tác động lên thiết kế (đã chấp nhận):** hàng đợi Operations V2 grain `operation_id` (xác nhận R3) nhưng không có assignee/actor ack-resolve/SLA; `assigned_to=me` trả 400 → lens "Mine", Acknowledge, Resolve hiện bị tắt kèm lý do (D9). Incident chỉ có root hiện tại → timeline/evidence là "Not available". Source health, journal, canary twin đều UNAVAILABLE.

### 0d. Sau `e19ad906` (2026-10-19)
Codex trả lời một phần review F8: R2/Paper Exit parent có actors, latest_operation (approval → operation_id), decision_context, recorded_activity, criteria (Paper Exit: label/observed/limit/unit); FE-028 và FE-030 **MỘT PHẦN** (xem Board). Registry rev 7. Hợp đồng mới chưa đọc: self-eligibility, self-navigation, command-currency. `r2Ledger` đỏ do bảng `governance_approval_decision_inbox` (DEBT-UXM07-009, Codex).

### 0c. Codex đã tiếp nhận FE-001…043 và chia lại việc (2026-10-18, từ `evidence/ELP2-10/claude-review-intake-2026-10-18.md`, file chưa commit trong cây Codex)
Codex đọc ledger này tại `3b6dad16`, xếp mọi yêu cầu `ACCEPTED_FOR_IMPLEMENTATION` vào packet phase (**chưa DELIVERED**), trừ các điều chỉnh sau (tôi đã đọc, chưa phản hồi chính thức):
| Mục | Ý kiến Codex | Hệ quả cho FE |
| --- | --- | --- |
| FE-005, FE-009 | đã có implementation (`manager-model.ts`, tổng null + lý do; giới hạn 1 MiB / 200 nhóm) | chỉ cần fixture/doc mẫu; FE không đợi gì thêm |
| FE-006 | CHANGES_REQUESTED: `methodology_ref` theo nguồn, không phải mọi nơi TWR/Modified Dietz | FE đọc methodology theo nguồn, không hiển thị chung một công thức |
| FE-011 | CHANGES_REQUESTED: giữ Score số tính sẵn để sort/scalar | FE không bỏ cột Score số |
| FE-018 | CHANGES_REQUESTED: pin/compat có version, không vendor cả Edge | không ảnh hưởng FE |
| FE-030 | CHANGES_REQUESTED: dùng lại plan/apply/gate fence hiện có, không executor tổng quát | cockpit giữ dạng nhiều đường, không một "decide" chung |
| FE-026, FE-036 | NEEDS_OWNER_DECISION (ma trận trường researcher; `as_of_ms` current-only hay có as-of) | Bobby quyết; FE giữ "Not published" |
| FE-037 | không thêm tên vào catalogue owner-all; cần projection eligibility/navigation theo hiện hành | FE giữ nav fail-closed; tên `execution.*` tạm trong `V2_CAPABILITY` sẽ đổi |
| FE-042, FE-043 | many-to-many, hai đầu được ủy quyền; status counts cùng snapshot, không N call | **Claude làm (B1)**; xem Rules §10.11 |
| FE-040 | bảng phase 10: chỉ bật manifest sau khi code FE vào | **Claude làm (B2)** |
| DEBT-UXM07-002 | đã sửa phân loại queue_v2 (VIEW_DERIVED), chưa commit | Codex giữ; đóng khi commit |
| DEBT-UXM07-003 | cần trạng thái non-retained trung thực, không giấu lỗi console | Claude làm (FE double) |
| DEBT-UXM07-001 | cần việc FE/baseline được duyệt | Bobby quyết (xem báo cáo) |
Thứ tự Codex: queue-view ownership + self/nav an toàn → Manager P1 (query/metric/window) → lifecycle/criteria/cockpit → phần còn lại. Gói pending-recall vẫn `AWAITING_CONSUMER_REVIEW` và đang dở (4 suite migration lỗi `syntax error at end of input`, chưa commit); Claude sẽ review khi Codex commit và giao theo §7.2.
Bobby đã quyết 2026-10-18: FE-036 chỉ hiện tại; FE-026 Codex đề xuất ma trận hữu hạn rồi Bobby duyệt; DEBT-UXM07-001 Claude sửa ở mốc R2; Claude được SSH chỉ-đọc lấy mẫu khi gói giao.
Chia việc, nhánh/worktree và hạ cánh: **AGENT_WORKING_RULES §10.11**; check chéo và ba kênh đọc nguồn: **§10.12**; bảng sống: [SOURCE_TRUTH_BOARD](evidence/SOURCE_TRUTH_BOARD.md); kế hoạch phase gửi Codex: [PROMPT_FOR_CODEX](design/sync/PROMPT_FOR_CODEX.md) (chờ Bobby duyệt).

## 1. Hộp thư đến — request Codex → Claude còn mở (tất cả `AWAITING_CONSUMER_REVIEW`)

| ID | Nội dung ngắn | Cần làm ngay? |
| --- | --- | --- |
| ELP2-REQ-00-001 | Audit UXM-00 (browser/reuse/role journeys); preview hiện tại là bản lưu | Không — cần Bobby giao UXM-00 |
| ELP2-REQ-04-010 | ACK handoff scoped reader | Không — chờ giao |
| ELP2-REQ-05-002 | Catalogue tĩnh + ngữ nghĩa page hiện tại | Không — chờ giao |
| ELP2-REQ-06-001 | UXM-08: named reads/type/fixtures cho Score/Regime | Không — chờ giao |
| ELP2-REQ-08-001 | Receipt vốn; thêm non-amount | Không — chờ giao, nhưng **đọc §0 hàng 1** |
| ELP2-REQ-09-001 | UXM-08/09/10: map `ScopedRealtimeFrame`; không biến notification thành replay | Không — chờ giao |
| ELP2-REQ-10-001 | Commissioning/coverage | Không — chờ giao |

Kết quả đối chiếu round này: **không có request nào buộc FE hành động ngay**; không request nào bị bỏ qua.
Mọi ACK (ACCEPTED/CHANGES_REQUESTED) chỉ ghi khi Bobby giao UXM tương ứng.

## 2. Cách Codex bàn giao một API chính (đặc tả "đủ để FE nối thật")

Đề xuất này bổ sung (không thay) Rules §7.2. Với **mỗi** operation FE sẽ dùng (6 route Manager; `capital` commands;
access/profile; scoped realtime), Codex giao đủ:

1. **Định danh:** `operationId`, method + path, tên type sinh ra (vd `ManagerDatasetResponse`), đường dẫn file schema
   JSON + OpenAPI, `producer_sha`, mức giao hàng (published / landed / runtime-qualified).
2. **Schema đầy đủ chặt:** `additionalProperties:false`, enum khép kín, decimal là chuỗi, UTC ms, ràng buộc chéo
   (vd `availability ↔ value ↔ reason_code`) **được ghi ra như một bảng bất biến** (không chỉ nằm trong `superRefine`
   mà JSON schema không biểu diễn được — FE không có zod).
3. **Phong bì lỗi:** mọi mã lỗi có thể có (kể cả `EXECUTION_READ_PUBLICATION_NOT_QUALIFIED` 503, vượt 1 MiB, cursor
   hết hạn, cursor sai ngữ cảnh, quyền, vượt giới hạn filter), kèm HTTP status, `Retry-After`/idempotency, và UI nên
   làm gì (retry / hỏi lại / dừng).
4. **Ngữ nghĩa trang & cache:** cursor opacity, ổn định khi snapshot đổi, `snapshot_id` bắt buộc gửi lại hay không,
   header cache/ETag.
5. **Bộ fixture (xem §2.1)** theo kịch bản bắt buộc.
6. **Bảng "có thật / chưa có thật" theo field** (cột vào Source Truth Board): field nào luôn `null` do nguồn chưa có.
7. **Lệnh regenerate + test drift** và nếu schema đổi: changelog (thêm/bỏ/đổi nghĩa) và có phá tương thích không.

### 2.1 Vòng đời fixture: "mẫu → xóa khi ghép thật"

Mỗi fixture có khai báo trong một **manifest** (một file, ví dụ `fixtures/MANIFEST.json`):

```
fixture_id, operationId, schema_version, producer_sha, lane, scenario,
origin: CODEX_CANONICAL | FE_DERIVED | REAL_RECEIPT,
retire_when: "<ELP2-REQ-id> VERIFIED with real receipt"
```

- `CODEX_CANONICAL`: do Codex sinh; FE không sửa. `FE_DERIVED`: FE biến đổi hợp lệ từ canonical; phải qua schema.
- **Xóa khi ghép thật:** lúc operation vào G6 (nối thật), cùng một commit: (a) thêm receipt thật đã che, (b) xóa fixture
  `FE_DERIVED` và route BFF-double của operation đó, (c) gỡ entry khỏi manifest, (d) test `manifestHasNoRetiredFixtures`
  fail nếu operation đã đánh dấu `real: true` còn entry synthetic. Fixture L0 của Codex giữ lại ở contracts cho test
  producer; FE không import chúng vào product graph.
- Mọi receipt/screenshot ghi **lane**: `FIXTURE_LAB` / `BFF_DOUBLE` / `REAL_READ_RETAINED` / `REAL_READ_QUALIFIED`.

### 2.2 Kịch bản fixture bắt buộc cho mỗi dataset BFF

(a) trống (0 hàng) · (b) 1 hàng đầy đủ · (c) thưa thực tế (nhiều `UNAVAILABLE`/null, mọi reason_code đang có) ·
(d) 200 hàng + `next_cursor` + `previous_cursor` · (e) nhiều nhóm (`group_by` 2 cấp) · (f) STALE/UNKNOWN freshness,
PARTIAL/UNRESOLVED completeness · (g) nhiều `economic_partition` (ACTUAL/PAPER/SANDBOX tách) · (h) lỗi 503 not
qualified và các mã lỗi còn lại · (i) response sát 1 MiB · (j) âm tính (field thừa/enum lạ/decimal sai) cho reader.
Codex giao (a)(b)(c)(h) ở mức canonical; FE tự suy ra (d)(e)(f)(g)(i)(j) rồi nhờ Codex rà schema.

## 3. Request FE → BE (`ELP2-REQ-FE-nnn`)

Tất cả `OPEN`, **chưa đánh dấu bất kỳ phase nào bị chặn thật** cho đến khi Bobby giao UXM. Ưu tiên: **P1** cần trước
khi khóa wireframe; **P2** cần trước khi nối thật; **P3** tối ưu.

| ID | Pri | Cần gì | UI bị chặn | Owner luồng | Done-when | Ref đề xuất |
| --- | --- | --- | --- | --- | --- | --- |
| ELP2-REQ-FE-001 | P1 | Đặc tả bàn giao theo §2 cho 6 route Manager + commands + realtime | Mọi màn | Portal | Codex chấp nhận mẫu §2 và giao cho route đầu tiên | proposal §6 |
| ELP2-REQ-FE-002 | P1 | Bảng ánh xạ chính thức stage (`CANARY/LIVE` ↔ `LIVE_CANARY/LIVE_FULL`), `economic_domain` ↔ environment, lọc `replay/backtest` | Stage chips, partition | Portal+TS+PM | Bảng có owner + test | R-11 |
| ELP2-REQ-FE-003 | P1 | Nguồn của `alpha_version_id` (PM không có version) và cách gắn vào row grain | Fleet, Alpha | PM+Research+Portal | Quy tắc viết ra + fixture | R-12 |
| ELP2-REQ-FE-004 | P1 | Bảng từ vựng freshness/completeness thống nhất (4 bộ hiện có), chỗ của `AGING` | Chip freshness mọi màn | Edge+Portal | Một bảng ánh xạ + test | R-16 |
| ELP2-REQ-FE-005 | P1 | Quy ước tổng thiếu nguồn: PM null cả aggregate → Portal hiển thị `PARTIAL` thế nào, có tổng một phần không | Overview, Capital | PM+Portal | Quy ước + fixture (c) | R-14 |
| ELP2-REQ-FE-006 | P1 | Xác nhận mọi return hiện là Modified-Dietz **không phải TWR**; `methodology_ref` bắt buộc khi có return/DD | Ô return/DD | TS+Portal | Field + copy dictionary | R-15 |
| ELP2-REQ-FE-007 | P1 | Quy tắc `metrics`: tập khóa bảo đảm có mặt (hiện `z.record(managerScalar,…)` làm mọi khóa tùy chọn), chỉ DECIMAL hay cả TEXT | Fleet table | Portal | Schema/tài liệu chốt tập khóa | mới |
| ELP2-REQ-FE-008 | P1 | Tìm theo tên: filter chỉ có `EQ/GTE/LTE/IS_NULL` nên không tìm "chứa/bắt đầu bằng" | Fleet search | Portal | Thêm `q`/op `PREFIX` hoặc chốt không có | R-06 một phần |
| ELP2-REQ-FE-009 | P2 | Hành vi khi vượt 1 MiB hoặc `children` lớn (tối đa 10 000/hàng): cắt, lỗi, hay phân trang con; mã lỗi | Fleet, Portfolio | Portal | Mã lỗi + fixture (i) | mới |
| ELP2-REQ-FE-010 | P2 | `capital_statements`/`statement_scope = …BEFORE_TABLE_FILTERS`: xác nhận KPI strip **không** đổi theo filter bảng; cung cấp hay không bản có lọc | Overview, Fleet | Portal | Ghi rõ + field | mới |
| ELP2-REQ-FE-011 | P2 | `score` là scalar sort/filter được nhưng mọi score `policy_pending` → sort ra toàn null; có ẩn khỏi `managerScalar` tới khi qualified không | Fleet sort | Portal | Quyết định + test | mới |
| ELP2-REQ-FE-012 | P2 | Sort/filter theo `stage_presence`, `group_by` mở rộng; cursor ổn định khi snapshot đổi | Fleet | Portal | Spec + fixture (d)(e) | mới |
| ELP2-REQ-FE-013 | P2 | Manager time-series (equity/NAV theo thời gian), batch sparklines | M01, Alpha | Portal+TS | Operation + fixture | R-01, R-04 |
| ELP2-REQ-FE-014 | P2 | Portfolios directory; cross-env "All" (hiện bắt buộc `environment`) | M01 "All", Fleet | Portal | Operation hoặc quyết định bỏ | R-02, R-03 |
| ELP2-REQ-FE-015 | P2 | Hành động: danh sách eligibility theo hàng + lý do bị tắt (public copy dictionary) | Action menus | Portal | Field + dictionary | R-09, R-08 |
| ELP2-REQ-FE-016 | P3 | Saved views, export, archived read | M10, Archive | Portal | Quyết định có/không | R-05, R-07 |
| ELP2-REQ-FE-017 | P1 | Tên/đơn vị metric statement (`opening`↔`initial_funds`, tách decrease/recall, `pending_fees`) | Capital block | PM+Portal | Bảng ánh xạ | R-13 |
| ELP2-REQ-FE-018 | P1 | Đưa code Edge EPG10 (chỉ ở HK) vào nhánh tích hợp hoặc ghi rõ nó không phải nguồn của contract Portal | Căn cứ ELP2-09 | Codex/Bobby | Quyết định + pin | R-17 |
| ELP2-REQ-FE-019 | P1 | Đối chiếu pin PM (`673ce7cf` vs `e62b6825`) và cập nhật Source Truth Board | Toàn bộ ngữ nghĩa PM | Codex | Pin thống nhất | mới |
| ELP2-REQ-FE-020 | P2 | Backend có giữ **preview** lệnh không (hay chỉ receipt)? | M09 hàng "Preview only" | Portal | Trả lời có/không | design G1 |
| ELP2-REQ-FE-021 | P2 | Nguồn **audit** (ai làm gì) có contract/qualified chưa | M09 tab Audit | Portal | Trả lời + contract | design G2 |
| ELP2-REQ-FE-022 | P2 | Cách tính return paper sau archive; nguồn trọng số `w_i` cấp alpha (alpha trải nhiều portfolio); cửa sổ actual bắt đầu từ Canary hay Live | M05, M08 | Portal+Research | Quy ước ghi rõ | design G3 |

## 3b. Request mới từ vòng rà 2 (2026-10-18), tiếp ELP2-REQ-FE-023…036

Tất cả `OPEN`; chưa gửi cho Codex ngoài việc ghi ở đây (Codex đọc sổ này ở đầu round, Rules §10.1). Nguồn: [design/review2/04](design/review2/04-data-feasibility-backend-asks.md). Registry: V2 chỉ **thêm** màn, không đổi tên `screen_id`; yêu cầu thay đổi registry gom ở [design/review2/07](design/review2/07-routes-urls-migration.md) §3 (Codex là chủ registry).

| ID | Pri | Need | UI blocked | Owner | Done-when |
| --- | --- | --- | --- | --- | --- |
| FE-023 | P2 | Cross-entity scoped search `q` (PREFIX/CONTAINS) over alpha, portfolio, account, deployment, approval, operation -> `{kind,id,label,stage,env,route_key}`, authorized-only, no money | C1 command bar | Portal (+PM identity) | Operation + fixture (empty/1/many/not-authorized); text op rule stated (extends FE-008 beyond fleet) |
| FE-024 | P2 | Per-user last-visit marker (read + mark-seen) and change feed `since` marker: kinds INCIDENT, APPROVAL_DECIDED, OPERATION_APPLIED, SOURCE_PARTIAL, STAGE_MOVE, NEW_ALPHA, each with ref id, UTC ms, severity, no money | C1 digest, M01 | Portal (sources TS/PM/Edge) | Contract + fixture; marker cross-device; "no change" distinct from "feed unavailable" |
| FE-025 | P1 | `window` (7D/30D/90D/ALL or `from_ms/to_ms`) accepted by manager dataset/360 reads; windowed scalars (net PnL, Modified-Dietz return, DD) echo `metric.window`; unpublished window returns `UNAVAILABLE`+reason, not null | Every cell under UI3 | Portal + TS (+PM for capital) | Query field + per-window fixtures incl. one window UNAVAILABLE; cf. FE-006/013 |
| FE-026 | P2 | Approve researcher field-policy matrix (which fields a researcher sees on M01/M03/M04/M05 own-slice; portfolio name vs "your slice", D7) | Researcher variants all screens | Portal | Policy revision published, status not PENDING; fixture per role |
| FE-027 | P1 | Alpha-version lifecycle read: ordered stage transitions (R1,R2,Paper,Sandbox,Canary,Live) with state (done/current/blocked/not started), entered_at, days_in_stage, gate criteria met/required, blocker `reason_code`, decider role, decision/receipt ref; plus `current_stage`, `days_in_stage`, `gate_state` as sortable scalars | C3 spine, board, M05 header, M07 strip | Portal (PM lifecycle, TS stage moves) | Operation + fixtures (mid-journey, blocked, never-promoted); cf. FE-002 mapping |
| FE-028 | P1 | One `criteria[]` shape for all gates: `{key,label,observed,limit,op,unit,verdict(WITHIN/WARN/BLOCKER/NOT_PUBLISHED),source_ref}` + ladder, checklist counts | C4 drift verdict, GateReviewShell | Portal (evidence from TS/Research) | R1/R2/Exit/Live reviews return it; unknown verdict explicit |
| FE-029 | P2 | Approved-baseline and comparison series for evidence diff: approved return range band, approved in-sample/backtest path, paper-twin path for canary, restart-cycle markers, same clock and basis | C4 evidence diff | Portal + Research (+TS paper twin) | Series with `methodology_ref`, hatch flag for simulated; empty allowed; cf. FE-013, stage-drift |
| FE-030 | P1 | Decision cockpit contract: queue row adds `creator`, `ladder`, `sla_due_at`, `needs_you`/not-yours reason; server-computed "what changes" preview (derived, not applied); one idempotent decision call returning `receipt_ref`, `quorum_after`, state | C4 verdict panel, M09 | Portal | Fixtures for approve/reject/replay/duplicate/UNKNOWN; cf. FE-020 (preview kept or not) |
| FE-031 | P2 | Unified subject event feed `/subjects/{kind}/{id}/events?from_ms&to_ms&kinds` (promotion, approval, capital command, incident, restart, archive) with actor and receipt ref | C3 ribbon, M05/M04 Activity | Portal (TS journal, PM ledger, governance) | Contract + fixture; states audit gaps; may reuse FE-021 source |
| FE-032 | P2 | Capital flow read per portfolio: nodes/edges per basis (capital, budget, exposure, venue margin; never one amount), ledger page with `seq`, `command_id`, `receipt_ref`, `state` (pending/applied/recall), non-amount receipts allowed | C2 capital flow, M04 ledger | PM + Portal | Edges AVAILABLE/UNAVAILABLE per basis; fixture incl. no-amount receipt (SYNC §0); cf. FE-017, REQ-08-001 |
| FE-033 | P2 | Multi-subject read: filter op `IN` (portfolio/alpha ids, scope bar) and aligned rebased series for 2-4 subjects with common partition check (error on mixed currency) | C2 compare, C1 scope | Portal (+TS series) | Op + fixture; partition mismatch is a typed error; cf. FE-013 |
| FE-034 | P2 | Archive read + commands: archived-alpha list with archive disposition, paper-monitor return after archive, request/approve/reactivate commands (D3, D8) | M08, M09, M05 request-archive | Portal + PM + Research | Route list + fixture; cf. FE-016 (archived read now required), FE-022 |
| FE-035 | P3 | Fleet-map projection `view=MAP`: row_key, name, allocation, windowed return/net PnL, health, stage_presence only, ≤1000 rows, own byte cap | C1 heat map at fleet scale | Portal | Spec + 1000-row fixture; cf. FE-009/012 |
| FE-036 | P3 | Point-in-time read: `as_of_ms` on dataset/360 (retained snapshots) or explicit decision that it does not exist | C1 "As of", C2 retained snapshots | Portal | Operation or recorded "no" |
| FE-037 | P1 | Phát hành capability `execution.*` (portfolios/accounts/operations read, blotter read) vào session, hoặc chốt tên khác | `V2_CAPABILITY` trong `v2/shell/roleNav.ts` đặt tạm; nav fail-closed | Portal | Tên + phát hành |
| FE-038 | P2 | Mục Profile & Access tự xem cho mọi người dùng | D9 "My access" | Portal registry rev 7 | Registry |
| FE-039 | P2 | Registry rev 7 ẩn mục `APPROVALS` cũ `/backtests/approvals` | nav V2 chỉ một Approvals | Portal registry rev 7 | Registry |
| FE-040 | P2 | `ARG EXECUTION_V2_SCREENS` trong `portal-web.Dockerfile` | cờ manifest chưa tới được build | Ops/Codex | Dockerfile |
| FE-041 | P3 | Tham số `window` (gắn FE-025) | `ContextBar` `windowLock` | Portal | Trả lời FE-025 |
| FE-042 | P2 | Operations queue item V2 có `incident_id` (nullable) hoặc quan hệ operation→incident | Incident drawer mở từ hàng hàng đợi | Portal | Contract |
| FE-043 | P3 | `status_counts` cho KPI Operations (server-counted) hoặc quyết định không có | 4 ô KPI theo trạng thái trong hi-fi | Portal | Contract hoặc "no" |
| FE-052 | P2 | Blotter: `deployment_id`, filled qty, average price, slippage and fee per order; filter by stage/deployment/account/alpha in `BlotterQuery`; bracket legs carry `order_id` | order relations missing; scope chips cannot filter | Portal | Contract |
| FE-053 | P3 | Users: last sign-in; `accountApi.roster` answers an empty list for a malformed body (cannot be told from "no users") | Users table | Portal | Contract |
| FE-056 | P3 | `/operator-tasks`: `description`, `display_name`, `scope_label` (hiện `meta` là tham chiếu nguồn) | HIFI Admin sub-line | Portal | Contract |
| FE-057 | P2 | `observed_at_ms` / `valid_until_ms` (hoặc revision) trên `portal.self-navigation.v1` và `self-eligibility.v1` | rail không biết projection cũ đến đâu | Portal | Contract |
| FE-058 | P2 | Navigation: phủ đủ 7 mục rail, môi trường, và tên cho `accounts.manage` (thu hẹp FE-037) | thay `V2_CAPABILITY` | Portal | Contract |
| FE-059 | P3 | Eligibility cho danh sách (nhiều resource) | nút hành động trên bảng | Portal | Contract |
| FE-060 | P3 | Step-up / challenge đọc được trước khi bấm | FE-015 phần còn `NOT_CHECKED` | Portal | Contract |
| FE-061 | P3 | Từ vựng đóng cho `AccessProblem` / `PendingControlProblem` | thông báo lỗi trung thực | Portal | Contract |
| FE-062 | P2 | Khám phá pending-recall (R-1) | dock lệnh đang chờ | Portal | Contract |
| FE-063 | P3 | `recipient_account_id` trên pending status (R-2c) | dock lệnh đang chờ | Portal | Contract |
| FE-065 | P3 | Ngữ pháp `currency` hữu hạn, không bidi/zero-width | FE đang từ chối chặt hơn schema | Portal | Contract |
| FE-044…055 | P2/P3 | Yêu cầu từ lát S2/S1e: `/portfolios` cursor+q+theo env; approvals theo portfolio; ledger seq/command_id/receipt_ref; stage_counts zero; schema Decimal maxLength/unique id/enum/MetricState; bindings & sleeves; account long/short/margin ratio; blotter relation + lọc; users last sign-in; stage-drift decimal + timeline outcome; stream schema | Từng dòng: [evidence/UXM-07/backend-requests.md](evidence/UXM-07/backend-requests.md) mục "S2 và S1e" | Portal | Contract/quyết định |
(Chi tiết, locator, fallback FE: [evidence/UXM-07/backend-requests.md](evidence/UXM-07/backend-requests.md).)

**Amendments to existing requests (no new ID):** FE-007 add `attention_reasons[]`, `balance_free`, `balance_locked` to guaranteed row keys (V1 had them, V2 row dropped them) | FE-012 add `current_stage`/`days_in_stage` sort+group (see FE-027) | FE-015 reason payload must carry `reason_class`, `grant_ref` (link to M10), `step_up_required` and distinguish "not turned on" vs "no permission" vs "source not qualified" | FE-016 split: archived read -> FE-034; export and saved views stay P3; Report pack/Export need a route before the button is enabled | FE-010 decision needed: filtered statements for heat map/compare | Blotter query (V1 `BlotterQuery`) add stage/deployment/account/alpha filters (small, Portal) | V1 writes with no `ExecutionApi` method (incident ack/assign/resolve, activation plans): FE-001 handoff must list them.

## 4. Review của FE về phần backend của Codex (nhìn từ phía người dùng contract)

Đây là **review**, không phải yêu cầu sửa; mỗi mục có severity. Codex có thể bác bằng bằng chứng.

**Điểm làm tốt (giữ nguyên):**
- Phong bì `metric` nhất quán: `availability` + `reason_code` + `quality` + `provenance_refs` + `methodology_ref` cho mọi số.
- `economic_partition` bắt buộc cho tiền, không cộng chéo; `PARTITIONED_ONLY`.
- Từ chối an toàn: 503 `NOT_QUALIFIED` thay vì số giả; score `policy_pending` thay vì số tạm.
- Không rò thông tin: `AUTHORIZED_ONLY`, `authorized_filtered_count`.

**Mối lo ngại:**

| # | Severity | Locator | Nhận xét |
| --- | --- | --- | --- |
| RV-1 | MAJOR | `manager-model.contract.ts` `superRefine` trên metric/query | Ràng buộc chéo (`availability↔value↔reason_code`, `IS_NULL ↔ value`, decimal filter) chỉ sống trong zod; **FE không có zod** và JSON schema không biểu diễn hết. Cần bảng bất biến ghi rõ (xem §2.2) để reader viết tay không lệch |
| RV-2 | MAJOR | `managerDatasetRow.metrics: z.record(managerScalar, managerMetric)` | Mọi khóa tùy chọn; không rõ khóa nào bảo đảm có. FE phải code mọi ô như "có thể thiếu" thay vì "có hoặc `UNAVAILABLE`" |
| RV-3 | MAJOR | `statement_scope = …BEFORE_TABLE_FILTERS` | Bẫy UX: KPI strip không đổi khi lọc bảng, người dùng sẽ hiểu sai. Cần xác nhận + có thể cần bản có lọc |
| RV-4 | MAJOR | Filter `EQ/GTE/LTE/IS_NULL` trên TEXT | Không tìm theo tên được — thiếu thao tác cơ bản của sàn |
| RV-5 | MINOR | `scores.*` luôn `policy_pending` nhưng `score` vẫn là scalar sort/filter | Sort/filter vô nghĩa; ẩn đến khi qualified |
| RV-6 | MINOR | `children` ≤10 000/hàng trong tổng 1 MiB | Hành vi khi chạm trần chưa rõ |
| RV-7 | MINOR | `quality.freshness` chỉ `FRESH|STALE|UNKNOWN` | Edge có `AGING/PAUSED`; ánh xạ chưa viết |
| RV-8 | NOTE | Fixture canonical quá nhỏ (1 hàng, TEST_ONLY) | Không đủ để kiểm sort/page/group/quy mô |
| RV-9 | NOTE | Mọi lớp "đã giao" là source-dark | Mức giao hàng cần ghi rõ trong mọi handoff (đã làm tốt ở 7.2) |
| RV-10 | NOTE | Docs cũ (Edge-Unified §23.4, hàng guide ở Unified) | Dễ gây hiểu nhầm hiện trạng |

## 5. Quy ước dùng sổ này

- Đầu mỗi round: cập nhật §0 (pin) và §1 (hộp thư); không có thay đổi vẫn ghi "đã đối chiếu, không phát sinh".
- Cuối mỗi round: cập nhật §3 (request mới/đã giao) và §4 (review mới) trước khi báo Bobby.
- Codex đổi trạng thái request trong packet sở hữu và nhắc ID ở commit message; FE đổi `Status` trong cột done-when ở đây
  chỉ sau khi nhận ACCEPTED/CHANGES_REQUESTED có locator.
