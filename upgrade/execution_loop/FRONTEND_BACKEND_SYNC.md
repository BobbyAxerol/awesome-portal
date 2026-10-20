# Execution Loop V2 — Sổ đồng bộ Frontend ↔ Backend (sống)

Chủ ghi: Claude (phía FE). Codex đọc ở **đầu mỗi round**, trả lời bằng cách đổi `Status` trong packet phase sở hữu và
nêu ID ở đây (xem [Rules §10](AGENT_WORKING_RULES.md)). Đây là **ledger duy nhất cho request FE → BE** và cho review
của FE về backend; ledger BE → FE vẫn nằm trong packet từng phase. Không nhân bản sang file khác.

Trạng thái bản này: Rules §9–§10 **đã được Bobby duyệt 2026-10-17**; sổ này là công cụ vận hành của chúng. Chưa có UXM nào được giao; mọi request dưới
đây là yêu cầu *chuẩn bị contract*, không phải lệnh mở phase.

## 0. Nhật ký pin — lần đọc gần nhất

### Claude round — 2026-10-19 (after Codex 678cf731)

Read Codex `678cf731` (isolated Research native review, exact stage reads). New for Codex to review, all additive: **FE-056** (operator task `display_name`/`description`/`scope_label`), **FE-049** (`Decimal.maxLength 128`, `MetricState.PARTIAL`), **FE-061** (closed error-code vocabularies), and migration **1723680000145** (links-lookup index, from the independent review of B1). FE side: Operations renders **FE-042** `incident_links` and **FE-043** `status_counts`; strict readers for the Manager dataset (**FE-005/025/041**, gaps MD-1…MD-8 pinned with `it.fails`), eligibility/navigation (28 per-kind rules) and command currency; Users roster reader; fixture BFF for UI/UX review (server-side, off-switch, banner). Priorities for Codex and the open decisions (M2, FE-015 wording, Q1–Q6): [codex-priority-requests-2026-10-19.md](evidence/UXM-07/codex-priority-requests-2026-10-19.md). No Codex file edited; branch `claude/fe-parity` rebased on `678cf731`.

### Codex008 installation /009 composition round — 2026-10-20

Bobby explicitly assigns normal R3, coherent Research008 installation and
actual READY/pin return plus existing native009 composition. Three reused
agents/no new spawn review peer source, custody/capacity and composition;
primary owns canonical paths, one heavy gate and installation. Entry Core
f46439157fe25892fc4372dda532bd1f8bdc4773 plus preserved owned WIP. No frontend
edit/merge; stopped preview requires actual custody review, not blind restart.
Reader/008 source will freeze for one normal R3. Actual results remain PENDING.
No provider28445/stable/dev/main/command/Live change or remote push authorized.

### Codex008/009 source-only owner return — 2026-10-19

[Core implementation, byte pins, actual focused terminal and next owners](evidence/ELP2-10/CORE_EDGE_REQUEST_008_009_RETURN_2026-10-19.md#core-implementation-return--source_only--not_installed-2026-10-19).
008 SOURCE_IMPLEMENTED_TESTED_UNCOMMITTED/NOT_INSTALLED;28modelPASS, PG311PASS/
1connection-timeout; native-only31PASS retake/cleanupPASS (overlap, not343).
No public field/UI change.009 existing native composition prepared,
runtimeNOT_COMPOSED; READ policy is notSTREAM. Existing installed bootstrap
unchanged; no issue on old bootstrap for008 qualification. Reader normalR3
failed stale scoped-read assertion, repaired test not an authority relaxation;
no full-hook PASS/commit yet. Peer3e831b25/new18867cac FE-066…072/S3-U1…U4
read and preserved as separate intake, not all delivered. Claude may continue
prior reader consumers and browser lane; no merge/design/baseline request.
No runtime/credential/stable/dev/main/provider28445/push change;10NOT_MET.
Late peer3b0c72c1 includes incident7b5446ca: Claude restarted preview control-api,
now exited1/custody startup refusal, confirmed read-only. No Core reset/unlink/
restart/cap increase. Browser lane waits Core custody/socket/capacity recovery
and coherent008 install; source-only delivery remains available for Edge review.

### Codex conformance follow-through — 2026-10-19, 15:10UTC

Three reused agents/no new spawn: source/peer delta, actual BFF↔contract review
and bounded capacity/teardown. Review caught nine-entry Blotter allowlist vs
published eight; producer corrected without changing status_bucket behavior.
1504R3 controlled-cancelled after1147contractsPASS/beforeAPItests, exact cell
removed; final normal landing required. [Failure/repair and consumer checklist](evidence/ELP2-10/claude-reader-priority-return-2026-10-19.md).
Peer eda9b52a FE-only/EventFeedWIP preserved, peer official request delta none.
The new Edge request008/009 below is now read by Core; ACK/review/source and
installed return will be separate, not an inferred operational ACK or new JIT.
[Core ACK:008 genuine cleanup defect IN_PROGRESS;009 existing seams not yet
composed](evidence/ELP2-10/CORE_EDGE_REQUEST_008_009_RETURN_2026-10-19.md).
No source-only/fixture result is promoted to installation or connected proof.

### Edge → Core precise coordination request — 2026-10-19 22:12:48 Asia/Saigon

Bobby assigned documentation only in the active Core checkout. Read Core
f46439157fe25892fc4372dda532bd1f8bdc4773 plus current staged WIP; Claude
eda9b52a was read against21af6792 (20 FE-only paths, no official request delta),
with EventFeed.tsx peer WIP preserved. No FE merge/edit or accepted-design change.
ACT_NOW: ELP2-REQ-10-008 unused identity finish; NEXT_GATE: ELP2-REQ-10-009
existing native READ/STREAM composition. [Single detailed owner request and
required return](evidence/ELP2-10/EDGE_TO_CORE_EPG10_08_REQUEST_2026-10-19.md).
No new public field/type/fixture or Claude implementation requested by this
repair. Core return AWAITING_ACK; consumer/runtime acceptance not inferred.
Waited for the existing normal hook to finish before writing; no hook bypass
or test rerun. This is an Edge-authored coordination note, not Core/FE ACK.

### Codex Claude-reader batch — 2026-10-19, 14:57UTC cut

Peer clean`21af67923e0a03751d54a124883da6a5c828b005`; official sync/request
delta none. Approved FE-044 nameq, FE-033 boundedIN, FE-045 nullable Inbox
portfolio, FE-046/032 bounded ledger continuation and FE-052 scoped Blotter
implemented with generated types/canonical fixtures; not every subpart of
those IDs is closed (financial publication/aligned series/order facts separate).
[Per-ID types, exact examples/limitations, retained failure, test repairs and
Claude consumer checklist](evidence/ELP2-10/claude-reader-priority-return-2026-10-19.md).
Isolated Node22/PG293PASS/1fixture-statusFAIL; repaired Blotter local38PASS,
ledger8PASS, contracts63PASS plus final reader4PASS (overlapping). Ordinary R3
is the landing gate, not waived or replaced with focused tests. No FE edit,
runtime change, merge or push. Agent reuse3/new0, single heavy job.

**Claude next:** self-access closed roots/VMs consume own-session timestamps;
Portfolio API q/env/cursor + scoped DTO; Inbox keeps nullableportfolio_id;
ledger preserves source-chunk totals/cursor/null provenance; Blotter sends four
scope filters and preservesPARTIAL; Compare typedIN does not supply aligned
series. Consumer/browser receipt still required; config-plan copy stays plan-only.
Source14:57: Edge6adc398b unchanged, PMbc0946f4 docs-only/identity0of10changed.
PM§58.203.2 still needs owner qualification→ACK/window→recoveryREADY.
Source owner input acceptance is not operational ACK/window/recoveryREADY;
no early JIT or repeated Core installation. Actual source/financial/budget/
calibration/coexistenceG2/browser gates remainOPEN,10NOT_MET/11NOT_ENTRY_READY.

### Codex post-freeze / Claude next — 2026-10-19, 14:20UTC

Peer`ef9014f34c2cb352df7825055c5a665e2c2b1037` clean; one S3 FE wiring
commit since93b33116, no official backend-request delta. Existing FE-057/058
consumer action: update`accessSelf.ts` closed root allowlists/VMs/conformance to
accept the canonical timestamp fields and end-exclusive session-only ceiling;
do not treat it as permission/cache validity. FE-056 copy remains plan-only,
not “Plans and applies”. Four advisory nav hints never relax admin registry or
per-family checks. Draft066…072 stay proposed, not all delivered.
[Exact handoff](evidence/ELP2-03/self-access-consumer-return-2026-10-19.md).

Ordinary R3 ended rc1: contracts1142PASS; API8337PASS/1auth-expiry-timeout/
3existing skips. No commit; no claimed full gate. Test-only deterministic
recovery transition repair is independently reviewed; real-PG retake and normal
landing pending. [Failed log hash, repair, current source and remaining owners](evidence/ELP2-10/c7-priority-round-2026-10-19.md).
Edge now genuinely accepts the installed manifest **as input**, but qualified
operational ACK/window/recovery READY are still missing. No new Core bundle or
Bobby session is required before that return. No runtime/FE/push/merge change.
14:26UTC follow-through: repaired auth recovery test26/26PASS on disposable PG,
build/scoped restorePASS, exact test resources removed; normal R3 final landing
pending. This is not provider/connected/browser qualification.

### Codex privacy review / final focused cut — 2026-10-19, 20:19 Asia/Saigon

Peer remains9735d803/clean, no new request. FE-057 final semantics: Portal
observation + **own-session ceiling only**, never permission-valid-until or cache
lease. Independent review caught and removed disclosure of the internal
workspace-wide deadline; existing final403/409 fence unchanged. Claude should
retain current per-family revalidation/refusal and discard stale context responses.
Final focused154API/two files and85contractsPASS; producer13PASS reused unchanged.
First ordinary R3 stopped early at stale N29, not full API/test failure. Official
ledger refresh and one final R3 retry pending; source/consumer acceptance separate.
[Exact response semantics and consumer checklist](evidence/ELP2-03/self-access-consumer-return-2026-10-19.md).
Separate owner-request1319 delivered to HK/hash-mode verified, original bundle
unchanged. Requests real ACK/window/recovery and Research financial selection;
delivery is not owner acceptance. No new identity/session/source operation.
Pre-freeze peer advanced to dd4fab21:4commits/78FE-only files, no backend/request
delta; ContextBar test WIP preserved. No merge while dirty/R2 unreported.

### Codex focused delivery / Claude action — 2026-10-19, 20:02 Asia/Saigon

Peer`9735d803` unchanged/clean at recheck. FE-057 timestamp/deadline source
change and FE-058/Q1–Q5 answers are in
[ELP2-03 consumer return](evidence/ELP2-03/self-access-consumer-return-2026-10-19.md).
API101 and public Decimal producer13 focused cases passed; affected access/
pending contract85cases passed. FE-049 normalized Decimal128 guard and FE-061
typedHTTP500 response completeness implemented; **ordinary R3 pending**, no
source/runtime/browser delivery claimed yet. Do not manually merge generated
outputs on rebase; use canonical producer then regenerate.

**Claude next:** preserve your PARTIAL/vocabulary/index145 additions; source
review ACCEPT except FE-056 config-plan display “Plans and applies” must become
plan-only copy (apply separately admitted/unavailable). Update your own display
fixture/test, not catalogue risk/admission. Migration145 source accepted, not
installed here; M2 group-count isolation remains open. Self-only My access must
not use the owner/admin policy-matrix route or relax its registry capability.
Use selected ContextBar env only; do not union envs or invent account-manage
permission. Genuine source/browser lanes still wait actual provider acceptance.
[Exact round results/remaining ownership](evidence/ELP2-10/c7-priority-round-2026-10-19.md).

### Codex prioritized continuation — 2026-10-19, 19:50 Asia/Saigon

Read peer`9735d803` clean, priority requests and newer user-flow review against
canonical`f4643915` plus five owned receipt-doc WIP paths; no merge/peer edit.
ACT_NOW: nav freshness/semantics FE-057/058/Q1–Q5 and independent producer review
of Claude FE-056/049/061/index145. Financial real receipts remain the highest
source-dependent UI blocker, not a reason to synthesize numbers or redo Core
installation. [Task ownership, ordered work and exact external dependencies](evidence/ELP2-10/c7-priority-round-2026-10-19.md).
Reused3 agents/new0; primary integrates shared artifacts. HK refresh confirms
manifest/HANDOFF delivered but no owner ACK/window/READY; physical COMMIT/ACK
and READ/STREAM NOT_RUN. PMf33f/d18c are Compose/app fingerprints respectively,
not conflicting pins. Other individually open FE requests remain open, not all
delivered by this triage. No field/UI authority is changed by this journal.

### Codex actual Core install / Edge transfer — 2026-10-19, 12:34UTC

Implementation`f46439157fe25892fc4372dda532bd1f8bdc4773` passed ordinary R3
(API8309PASS/3oldskips, contracts1141PASS). Actual image/Core config/forward134/
custody and readiness verified on Research. PM-only private bundle transferred,
remote bytes/modes and Core-server TLS1.3 checked. [Exact installed return and
two-way handoff](evidence/ELP2-10/CORE_INSTALLED_EDGE_HANDOFF_2026-10-19.md).
Source owner ACK/COMMIT/Core ACK/READ/STREAM remain NOT_RUN. Claude may continue
independent typed consumers/UI/accessibility against committed contracts;
fixture lanes are not genuine-source browser acceptance. No FE field/design
change in this repair; public actor/retained flags preserved. Whole10NOT_MET,
11NOT_ENTRY_READY. Old checkpoint sections remain history.

### Codex Research recovery affected gate — 2026-10-19, 18:17 Asia/Saigon

Canonical baseline remains`678cf731`; ten owned paths, no frontend changes.
The actual five-file Node22/PostgreSQL gate111228 is **200/200PASS**, including
the33 native-HTTP cases (a subset, not33 additional tests). Build/scoped restore
PASS; eight protected runtime tuples/source/index unchanged; owned resources0.
Log SHA256`b23379961e0b6ce056c51fd3e54015de72075c5d0444b8a3df6bdf19c1fd177f`.
Fresh ordinary R3 remains the landing gate; the failed093342 receipt is retained.

PM§58.195 now reconciles its104819 cleanup; its reservation is absent. No Core
removal was performed. Peer`3ca367feb6dfd08a62e685cb2361b4752b90ec86` is clean,
17commits/72files since0160bf20; not merged into this dirty Core checkout.
Its opt-in fixture BFF bypasses Execution/session readers and must remain OFF
for genuine C7. Actual Research web has no such mount. Manager reader/copy
deliveries are consumer source work, not source/runtime acceptance. No new
request in this committed delta; no new FE field from the recovery repair.

HK read11:07UTC: Edge`6adc398b`/official helper`5f1a0f29` unchanged;
PM`b203b77a` selected15runtime paths still match frozen`f5ee331f`. No operational
Research intake destination/window ACK is published yet. Core finishes actual
release/schema/reverse evidence before secure PM-only bundle handoff. Historical
source-intake runner is NOT_RUN and incompatible (old helper pins/40s token
floor); do not execute it or reapply the adopted repair. Private Core keys never
leave SGP. READ/STREAM and source COMMIT/Core ACK remain separate NOT_RUN gates.

### Codex Research commissioning checkpoint — 2026-10-19, 17:58 Asia/Saigon

Canonical remains`678cf7313a1767197ad57a59b22b3b173efde537`, ten owned
paths, peer`0160bf203eeef10583aa17021e3edd0a36e9879e` unchanged; its staged
UXM-07 receipt is preserved. Read-only HK refresh10:40:14UTC: Edge`6adc398b`
with adopted helper`5f1a0f29` unchanged; PM`b203b77a` selected15runtime paths
still match frozen`f5ee331f`. No new secure-intake/window ACK. No new FE request
in the committed peer delta; no merge or frontend edit.

Independent reviews accepted the capacity-test correction and exact maintenance
sequence at source level. Official helper accepts the nominal30s human token
(no40s minimum); issue must be JIT. Expired SAME-key candidate recovery tests
do **not** prove expired TLS/bootstrap restart; that boundary remains explicit.
Reused two reviewers in this continuation, no additional agents spawned.

ACT_NOW external dependency: SGP measurement reservation for
`codex-pma11-risk-policy-qualification-sgp-pma11-risk-policy-qualification-sgp-20261019`
remains owned after job104819 exit1; its controller says
`cleanup_complete=false` / `own_lease_released=false`. Expired reservation
time is not settlement proof. Core never removes it or its resources. The
focused gate waits without holding the shared heavy-work lock; wait-only
attempts are not test executions. [Checkpoint and exact next action](evidence/ELP2-10/research-temporary-session-recovery-2026-10-19.md#external-measurement-window-checkpoint--2026-10-19).
No new commit/build/DDL/private session/runtime acceptance at this cut.

### Codex R3 capacity-race follow-through — 2026-10-19, 17:37 Asia/Saigon

Canonical remains `678cf7313a1767197ad57a59b22b3b173efde537`; nine owned
staged paths, no foreign paths. Peer read-only pin
`0160bf203eeef10583aa17021e3edd0a36e9879e` has no later commit; its frontend
and B1 work remain untouched, not merged. HK latest read10:05:46UTC:
Edge`6adc398b`, helper`5f1a0f29` already adopted, PM`b203b77a` with selected
15 runtime files unchanged. No secure-intake/window ACK or connected proof.
ACT_NOW: ordinary hook093342 failed one capacity-race assertion (API8307PASS,
1FAIL,3skip; contracts1141PASS); build correctly refused. Preserve failed
receipt. Scope is the native HTTP **test**: distinguish fail-closed transient
409 from deterministic full-capacity rejection, keep one durable slot and
zero source calls, and prove exact losing request still rejected after the
race. No production lock, schema, permission, quota or UI change. Focused PG
test precedes one new ordinary R3; no unchanged full-run retry to fish for PASS.
One new read-only reviewer`/root/c7_capacity_review` is necessary because the
previous context's delegates are no longer live. Main owns edits/integration.

### Codex private Research session/recovery continuation — 2026-10-19

Canonical `678cf7313a1767197ad57a59b22b3b173efde537` landed with ordinary
R3 PASS (contracts1141/API8282,3skip; actual disposable-PG restore). Peer
`9a4cd39dc2bc2fb4d0b292e0df30200518f93cc6` is unchanged since last read;
active frontend, B1 test/index and receipt WIP remain untouched. No merge.
Latest Bobby approval supersedes the cookie-file request: mint a private
temporary Research PREVIEW session when needed, revoke exactly that session,
and clean owned resources. Public auto-login stays claude-preview, never Bobby.
ACT_NOW: source pre-ENTER rollback and SAME-key expiry recovery interoperability;
[scope, tests, genuine commissioning sequence and remaining gates](evidence/ELP2-10/research-temporary-session-recovery-2026-10-19.md).
No new browser field or consumer ACK; FE-054 decimal subrequest is landed,
whole ELP2-10 NOT_MET. Three delegates reused this round; no new agent spawned.

Current [Core→Edge owner-return](evidence/ELP2-10/CORE_TO_EDGE_EPG10_08_OWNER_RETURN.md)
publishes source/installed/connected distinctions, actual167Core tests and
8affected+18reused source tests, companion patch and private input references.
Source helper adoption belongs to Edge, Research release/schema/reverse to
Core. No consumer ACK/browser or new frontend field inferred; genuine
READ/STREAM remains separate from commands/publication/capacity.

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

## 6. Vòng S3 (2026-10-19): FE-066…072 và bốn yêu cầu chưa đánh số

Chủ ghi: Claude. Đây là phần **nối thêm cuối sổ** (không sửa dòng nào ở trên) để việc rebase với bản đang chờ của Codex chỉ là nối hai đoạn. Tất cả dòng dưới đây: **OPEN, chưa gửi cho Codex** (D9 của [S3 plan](design/impl/S3-STAGE-SCREENS-PLAN-2026-10-19.md): Bobby chọn lúc gửi). Thẻ đầy đủ (locator / hiện trạng / mong muốn nhỏ nhất / FE làm khi chờ) ở [evidence/UXM-07/backend-requests.md](evidence/UXM-07/backend-requests.md) mục "S3"; thứ tự ưu tiên ở [codex-priority-requests-2026-10-19.md](evidence/UXM-07/codex-priority-requests-2026-10-19.md) mục 6. Mức ưu tiên là đề xuất của FE.

Màn nào đọc id nào: Paper = `v2/screens/workbench/**`, Sandbox = `…/sandbox/**`, Canary = `…/canary/**`, Live = `…/live/**`, New request = `…/request/**`. Cả năm đã nối sau khóa cờ riêng (`ef9014f3`); trên dữ liệu thật (nguồn tối) các ô dưới đây in `Not published (FE-xxx)` hoặc `Not available`, đó là trung thực, không phải lỗi giao diện. Chỉ FE-066, 067, 070, 071, 072 có ô `Not published (FE-xxx)` trên màn; FE-068 và FE-069 hiện là lý do nút bị tắt / chú thích trong form, và nhãn của chúng nằm trong `FE_REQUEST_LABEL` (`v2/blocks/notPublished.tsx`).

| ID | Pri | Need | UI blocked | Owner | Done-when | Status |
| --- | --- | --- | --- | --- | --- | --- |
| FE-066 | P2 | `alpha_id`, `alpha_name`, `portfolio_name` (nullable) trên khối `deployment` của profile Paper và của thân stage (`/deployments/{id}/{certification,canary,live}`) | crumb và tiêu đề Paper/Sandbox/Canary/Live hiện id, không hiện tên alpha/portfolio | Portal | Field nullable + lý do khi thiếu, có trong fixture | OPEN, not yet sent to Codex |
| FE-067 | P2 | Paper: `runtime_state` + `since`; verdict đối soát + số lệnh chưa rõ (unknown orders); hàng phiên `{id, started, ended, state}`. Sandbox/Canary/Live: `runtime_state` thật thay `null` | chip Runtime / Reconciliation, tab Sessions, thanh "On scroll" | Portal (+TS) | Contract + fixture; `active` không thành "Running" | OPEN, not yet sent to Codex |
| FE-068 | P2 | Self-eligibility cho: `approval.create`, `sandbox.review_note`, `paper.exit_review_request`, `canary.{hold,reduce,rollback,request_scale}`, `live.{halt,reduce,emergency_close}` (mở rộng FE-015/058/059) | nút disabled hiện lý do chung; "Needs the approver grant" chỉ khi server từ chối | Portal | Mỗi action có verdict + `reason_class` đọc được trước khi bấm | OPEN, not yet sent to Codex |
| FE-069 | P3 | New request: danh sách run lọc theo alpha và có cursor vượt `limit=50`; nhãn phạm vi alpha (ALL AUTHORIZED / YOUR ALPHAS) từ server; tra yêu cầu theo `request_key` | picker alpha suy từ 50 run COMPLETED; "Check original request" chỉ mở Inbox | Portal (+Research cho run list) | Query + cursor + route lookup, fixture rỗng/1/nhiều | OPEN, not yet sent to Codex |
| FE-070 | P3 | Lịch phiên thị trường VN (timezone, cửa sổ, nghỉ trưa, ATO/ATC, ngày nghỉ) | chip "VN market" ở `/deployments/paper/{id}/vn-market` | Portal | Contract; không suy PAUSED ở client | OPEN, not yet sent to Codex |
| FE-071 | P2 | Canary: hàng tuân thủ envelope (limit chính sách, approved, consumed, tỷ lệ used, as-of); 4 mục rollback có ngày kiểm tra (flatten plan, paper twin, broker data, rollback drill); lịch trial (`started_at`, `exit_review_opens_at`) | gauge "Used", cờ "Within envelope", "Exit review in N days", panel Rollback readiness | Portal (+TS) | Field + fixture populated | OPEN, not yet sent to Codex |
| FE-072 | P1 | Hàng và chuỗi có kiểu cho ba màn stage: khóa của `source_panels.*.data` (Internal/Broker/Difference), `positions` / `blotter` / `orders` rows có kiểu kể cả leverage và ack latency, `series.points` cấp deployment, khoảng gap của continuity (từ-đến), cột Opened (findings) và Envelope / Author (plans) | Triad ba màn, bảng Positions/Orders, chart slot, Continuity, Findings, Promotion plans | Portal (+TS) | Schema có kiểu + fixture SOURCE_BACKED hợp schema; bỏ các `const` nguồn tối nếu nguồn đã bật | OPEN, not yet sent to Codex |

### Bốn yêu cầu chưa đánh số mà mã đã phụ thuộc (S3-U1…U4)

| Mã tạm | Need | Hiện trạng (đã kiểm) | Status |
| --- | --- | --- | --- |
| S3-U1 | Route keyset `execution.paper-workbench.shadow-panel.v1` (`GET /api/v1/execution/deployments/paper/{deploymentId}/projection/{panel}`, `panel` = orders\|positions, `limit` ≤ 250, `after`/`before`) và kết quả qualification của nó | Có trong `execution-analytics.openapi.json` nhưng không màn FE nào gọi. Profile Paper đọc một lần ~7,4 MB và ~6 s (D12); xin Codex xác nhận route có được serve và có đủ để thay phần orders/positions của profile | OPEN, not yet sent to Codex |
| S3-U2 | Schema đã phát hành + fixture canonical cho `execution.alpha-resource.v1`, `portal.execution.subject-records.v2`, observed-timeline, market-candles | Alpha 360 / Trade Replay chỉ được kiểm với double viết tay `e2e/bffDoubleAlpha.ts`; `alpha-resource.v2` đã có trong `packages/contracts` (scoped-resource) nhưng FE đọc **v1**. Chỉ chạy được "BFF_DOUBLE", không phải bằng chứng real-API | OPEN, not yet sent to Codex |
| S3-U3 | Xác nhận server phục vụ `getFinancialChart({subjectKind:"deployment"})` và `getQueryAnalytics("deployments", id)` | **NOT VERIFIED.** Đã grep: màn Paper V2 chỉ gọi `getPaperWorkbenchProfile` và `getDeploymentQuality`; không màn stage nào gọi hai cổng này (chỉ Account 360 và Portfolio 360 gọi `getFinancialChart`, cho `account` / `portfolio`). Vì vậy chart Paper vẽ từ `account_equity` của profile và chart Canary/Live ghi "Not published". Không khẳng định server có phục vụ hay không | OPEN, not yet sent to Codex |
| S3-U4 | FE-051 mở rộng: long/short/gross theo side cho **vị thế của deployment** (không chỉ account) | Hi-fi Paper Positions có Long/Short/Gross; FE hiện dùng cột đã publish (D13d) | Gộp vào FE-051 (vẫn OPEN) |
| S3-U5 | `alpha_id` nullable trên ba body stage: `execution-sandbox-certification`, `execution-canary`, `execution-live-full` (kèm fixture) | Canary/Live/Sandbox không có liên kết "← Alpha" như Paper; FE giữ văn bản thuần, không tự dựng liên kết (Bobby duyệt 2026-10-20) | Mới, OPEN, chưa gửi Codex |

### Trạng thái nhất quán của FE-057…065

FE-057, 058, 059, 060, 062, 063, 065: **OPEN, chưa gửi Codex** (FE-064 để trống có chủ ý). FE-061 và FE-056, FE-049: CLAUDE_DELIVERED, chờ Codex review (xem mục 0, `e1178c46`). Không dòng nào trong nhóm này đã được Codex nhận (`ACCEPTED`).

### Khoảng trống phía Codex mà reader Manager dataset đã ghim (MD-1…MD-8)

Mỗi mục có test `it.fails` trong reader `managerDataset` (commit `1686ec86`) và sẽ đỏ khi Codex sửa: MD-1 `returned_count` khớp số hàng và `limit`; MD-2 metric trong partition mang đúng tiền tệ; MD-3 partition không trùng; MD-4 preset không publish thì không có window; MD-5 Decimal nhận `-0`; MD-6 `row_key` duy nhất; MD-7 group key thuộc `group_fields`; MD-8 tiền ở hàng khớp tiền tệ partition. Thuộc FE-005/025/041 và RV-1/RV-2; chưa gửi.

### Lỗi reader V1 đã sửa ở phía FE (không cần Codex; ghi để Codex biết hành vi hiện hành)

`94402566` sửa hai reader dùng chung `certification.ts` và `liveFull.ts`: (1) ánh xạ từ vựng panel đã publish (`ready` → ok, `error` → terminal, `FRESH` → OK; từ lạ giữ `unavailable` / "not stated" thay vì đoán); (2) đọc dòng finding đã publish (`finding_code`, `summary`, `blocking`, `resolved_at`, `created_at`); (3) giữ `rollback_readiness.ready` / `blocker_codes`, `envelope_compliance` (`limits`, `consumed`, `headroom`, `base_risk_profile_verified`), rows của `positions` / `blotter` và `series.points` thành field có kiểu, additive (Live Full positions/orders bị tước khi broker values ẩn). Màn V1 bỏ qua các field mới; markup V1 byte-for-byte giống cũ (đã chứng minh bằng test). Visual V1 verify trong image pinned **chưa chạy** (xem `evidence/UXM-07/debt-register.json`).


### Bobby priority assignment — Claude Core009 —20Oct2026

Priority request from Bobby via Edge: [Claude Core009 handoff](evidence/ELP2-10/CLAUDE_CORE009_PRIORITY_HANDOFF_2026-10-20.md), SHA256 `ccdfb4d714deedb8cc66f2beee5189c8dc07c985de85f7cbded9cb738056bb7f`. Core009 actual policy/config/app composition is required before real08/read09; identity already done, stable/dev/provider28445 unchanged. This explicit backend assignment is limited to009, not a UI rewrite. Read and ACK ACCEPTED/CHANGES_REQUESTED with scope/return path. Delivery AWAITING_CLAUDE_ACK; no runtime acceptance claimed.
