# Execution Loop V2 — Sổ đồng bộ Frontend ↔ Backend (sống)

Chủ ghi: Claude (phía FE). Codex đọc ở **đầu mỗi round**, trả lời bằng cách đổi `Status` trong packet phase sở hữu và
nêu ID ở đây (xem [Rules §10](AGENT_WORKING_RULES.md)). Đây là **ledger duy nhất cho request FE → BE** và cho review
của FE về backend; ledger BE → FE vẫn nằm trong packet từng phase. Không nhân bản sang file khác.

Trạng thái bản này: Rules §9–§10 **đã được Bobby duyệt 2026-10-17**; sổ này là công cụ vận hành của chúng. Chưa có UXM nào được giao; mọi request dưới
đây là yêu cầu *chuẩn bị contract*, không phải lệnh mở phase.

## 0. Nhật ký pin — lần đọc gần nhất

### 21 October11:30 UTC — Codex review return and actual gate status

[Current review/owner follow-through](evidence/ELP2-10/CODEX_REVIEW_AND_OWNER_FOLLOWTHROUGH_2026-10-21.md):
Claude4ebc4d9e deadline/custody/display-walker/historical-evidence fixes are
source-ACCEPTED; no repeat million-row benchmark solely for index renumbering.
FE073/074 source ready in the isolated contract lane,294 contract+25 producer
host tests PASS, normal Node22/PG/commit/consumer gate still pending. Core
owner R3-1052 actually ended143 (invalid alphabetic DB namespace), exact cell
cleaned; no built image or READY. PM owns numeric harness correction and new
freeze. PKI request reached PM/Edge; genuine Research issuer/leaf and separate
pause ACK absent at the read cut. S3-U2/SS-7 tightening accepted for Claude's
generator/runtime invariants; history cardinality stays a measured follow-up.
No new push, dev/main merge, runtime authority or ELP2-10 PASS.

### 21 October10:30 UTC — delegated closeout, actual hooks preserved

Bobby assigned Codex to finish delegated requests. Read Claude90f84643,
canonical7818d563 and Core00973435311 with their current WIP. Actual Claude
and Core hooks are already running; no additional heavy job or source edits
inside those frozen candidates. [Task map and current gates](evidence/ELP2-10/CODEX_DELEGATED_CLOSEOUT_2026-10-21.md)
covers C1–C7, independent CR02/B1 review, FE073/074 contract review and fresh
Edge/window inputs. Primary owns integration and operational decisions;
read-only agents do not mutate peer sources. QuantBT handoff7818d563 is
already verified on primus-origin and does not wait for Execution closeout.

### 21 October07:22 — actual focused379 PASS; normal commit queued

[C1–C7 return](evidence/ELP2-10/CORE009_C1_C7_RETURN_2026-10-21.md): six files,
379/379, compile+scoped PG restore PASS, exact cell cleaned. No assertions changed.
One normal R3 commit process queued with exact base/diff/log pins; no commit SHA,
image/install/recovery or ff-only landing claimed. Claude receives diagnostics
and PM mapping semantics; source/visual work can proceed independently.

### 21 October07:07 — recovery scheduling, not grant renewal

[Later exact recovery-only window requested](evidence/ELP2-10/CORE009_RECOVERY_ONLY_WINDOW_0900_REQUEST_2026-10-21.md):
09:00–09:30 UTC, awaiting source ACK and actual gate/image readiness. Current
slot cannot fit remaining gates. No original retry, new grant/session or force
retirement. Focused test is queued behind B1 EXPLAIN; next slot requested.
Claude received concrete fixes for three test-fixture/diagnostic gaps; no
production thresholds changed or failed gates waived.

### 21 October07:04 — inactive Manager JWK/CSR delivered

[Actual PKI return](evidence/ELP2-10/CORE009_INACTIVE_MANAGER_PKI_RETURN_2026-10-21.md):
separate Research signer/client keypairs stay SGP0700/0600; four public inputs
delivered to HK with exact hashes. Five offline crypto/custody checks PASS.
Not an issued leaf, trusted key or installed transport; original recovery and
grants unchanged. Edge/offline issuer must return real leaf/chain and reviewed
overlap/reconcile package. No frontend contract or UI change by this slice.

### 21 October06:45 — source repair diagnostic remains queued, no READY

[Independent data-leg preparation](evidence/ELP2-10/CORE009_EXISTING_MANAGER_DATA_LEG_PREPARATION_2026-10-21.md):
native28446/Ed25519 is not existing Manager8443/RS256. Four factory refs need
a separate reviewed Research data overlay/issued leaf, not native trust reuse.
Ordinary worker stays disabled in native review. No key generation, source
reconcile, new grants or fresh-data claim; Claude receives exact source locators.

[Recovery readiness update](evidence/ELP2-10/CORE009_RECOVERY_READINESS_UPDATE_2026-10-21.md):
candidate73435311 two-file+43/−3 repair unchanged,54TLSfocusedPASS; normal hook
failed. First capacity wait ended without a cell; one six-file retake queued.
Claude7378d423 R2 ended9530PASS/3FAIL/3SKIP; fixture two-clock expiry defect
returned to owner without relaxing runtime guard. C7 landing stays gated.
PMc0095d12 source rules verified; TS0cd356da/Edge1f10816f checked, no new TS03
or separate target-owner ACK. Three existing reviewer agents reused, no new
agents or peer source edits. No runtime/credential/grant changes in this update.

### C4/C5 delivered06:19 UTC — owner answers still pending

**Later PM return received:** [PMc0095d12 ACK and NET_PNL source rules](evidence/ELP2-10/PM_OWNER_ACK_AND_NET_PNL_RETURN_2026-10-21.md).
Same-source equal rows dedupe, changed content conflicts, distinct overlapping
economic leaves refuse; only validated disjoint populations add. PM has no
accepted mapping for Portal economic_account_ref/ownership_partition_ref.
Claude receives the source rule, not permission to invent that bridge or use
TEST_ONLY examples as real financial data. PM07/PM target ACK is real; TS03 and
other targets still separate. No new runtime or report-test PASS.

06:38 independent PM source check confirms missing census/valuation proof means
all aggregate economics null/PARTIAL; current authority filters before grouping.
Exact source and Claude mapping-gap locators in the
[producer review](evidence/ELP2-10/CODEX_CLAUDE_PRODUCER_REVIEW_2026-10-21.md).
No account-only/equal-amount dedupe; dataset/series need one accepted source-set
mapping. Source semantics ACCEPTED, financial wire/runtime still uncommissioned.

[Actual delivery receipt](evidence/ELP2-10/OWNER_REQUEST_DELIVERY_2026-10-21.md):
PM07/TS03/target01–06 packets and shared-account NET_PNL question are now
**SENT**, eight exact remote copies byte-verified and linked in PM/TS/Edge
Unified journals. Not merely written; not owner ACK/commissioning. Existing
source implementation and all WIP preserved. No financial aggregation rule,
budget or new runtime authority selected. Claude consumes owner answers per
packet as they arrive; C3 independent whole-Fleet STREAM still source-gated.

C3 source review separates Core009 ManagerDomainGrant/native heartbeat from
BE-P17 single-ROOT ScopedAccessGrant + named-read/whole-population authority.
Current installed73435311 lacks the Fleet service. Claude source must land/build,
real Portal Manager SOURCE_VERIFIED publication head must exist and official
scoped grant ceiling/bounds must be eligible. No automatic READ→STREAM and no
need to wait for unrelated financial calibration. Full action locators sent in
`CODEX_RETURN_CORE009_REVIEW_2026-10-21.md`; existing P17 PG301 proof retained,
newer CR01 changed-path receipt/revokeSession wiring remain Claude-owned.

### 21 October06:14 UTC — R3 actual failure, no runtime change

[Candidate hook diagnostic](evidence/ELP2-10/CORE009_R3_DIAGNOSTIC_2026-10-21.md):
contracts1147/compilePASS; seven API cases failed before owned test interruption.
No commit/image/fixedCLI yet. Focused retake queued behind shared heavy lock;
no thresholds relaxed or test failures declared flaky. Original ISSUED custody
and expired credential cleanup remain pending. C4/C5 owner coordination proceeds;
Claude's source/UI work does not wait for an invented whole-phase PASS.

### Claude delegation ACK — 21 October, source7378d423

Bobby approved `CLAUDE_TO_CODEX_DELEGATION_2026-10-21.md` C1–C7. Codex owns
native BUSY two-file fix/original recovery, exact source-ready whole-Fleet STREAM
grant procedure, PM07/TS03/target01–06 request delivery, shared-account NET_PNL
question, dispositions and conditional ff-only integration. Claude retains all
other backend source, frontend and fixture8095. CR01 source ACCEPT; CR02 CHANGE;
CR03/04 source/focused ACCEPT; see current producer review, not older statuses.

Recorded Bobby decisions21October applied without re-asking: approved RV11/Exit/
audit copy; only whole-Fleet ROOT with independent STREAM permission (partial
viewers remain WHOLE_FLEET_AUTHORITY_REQUIRED); Alpha/Deployment series unopened;
Fleet lanes/defaults/in-view KPI retained, no new Portfolio filter or X1.
No grant is inferred from READ or this acknowledgment. Source notice readiness
and exact commissioning receipts remain required. Recovery-only ACK now covers
06:45–07:15, not renewed source/grant/session intake. C4/C5 delivery receipt follows;
do not call REQUESTS_WRITTEN delivery or infer owner ACK from file transfer.

### Approved parallel Core commissioning / producer review —21 October 2026

**Latest05:45UTC:** CR01@dd9609af source ACCEPT; Claude still owes actual
focused execution receipt on that repair. CR02 interleaved retry remains CHANGE.
Codex owns CR05 transport-close fix in isolated candidate (+43/−3, Node22
54/54PASS, normal hook running). ActiveSTREAMrevoke proved client EOF but not
mutation completion: 8 native admissions, 7 source-correlated terminalACK and
1 original ISSUED/no-send frame. [Recovery-only request](evidence/ELP2-10/CORE009_RECOVERY_ONLY_WINDOW_REQUEST_2026-10-21.md)
asks Edge to retain original lifecycle/custody; no window/grant extension.
Expired continuation token cleanup remains pending; normal sessions unchanged.
No frontend edits, fixed-image/restart or whole10 PASS. Earlier unresolved0
and NOT_INSTALLED entries below are historical checkpoints, not current state.

[Round scope and live results](evidence/ELP2-10/CORE009_COMMISSIONING_ROUND_2026-10-21.md).
Bobby approved Core009 configuration/Research commissioning, independent
Claude backend review and safe landing preparation. Main7818d563/candidate73435311;
peer97454777→fe84ee69 advanced during audit, no peer source edits. HK Edge
d15de83e at04:00UTC; eight-file transfer resolved, source preflight real,
old native head2 revoked. ACT_NOW: Core-owned key references and finite bounds,
then matched source window/actual acceptance; NOT_INSTALLED/NOT_CONNECTED.
Two independent new agents review producer and landing, reused operator agent
reviews bounds/private artifacts. Main owns shared docs; preserve all WIP.
Latest pager/copy/timestamp/baseline commits are not stale missing-code tasks;
final gate provenance remains pinned to its actual tested SHA.

Producer review returned [ACCEPT/CHANGE by slice](evidence/ELP2-10/CODEX_CLAUDE_PRODUCER_REVIEW_2026-10-21.md):
B1/B2/index145/F0migration146 source accepted; ACT_NOW for Claude CR-01Fleet
lineage pairing, CR-02series recovery/digest refusal, CR-03leading history
completeness, CR-04strict source timestamp. Exact locators/minimum tests in
packet; primary confirmed source, no peer code edits. Awaiting Claude ACK,
at the initial review; **ACK now committed at peerfe1cfaf4** in
`evidence/ELP2-10/CLAUDE_ACK_CODEX_REVIEW_2026-10-21.md`. Claude accepted all
four fixes, exact focused gates, diagnostic carry and SQL file-mode correction.
No backend repair diff observed at that pin: ACKNOWLEDGED, not DELIVERED.
**Later incremental acceptance:** CR04@63201e94 independently123/123PASS,
ACCEPT(source/focused); later CR03@ec228e53 independently42/42PASS/sourceACCEPT.
CR01open; CR02@ec228e53 stillCHANGE for interleaved live failure resetting repair
retry budget (minimum realPG gate in producer return). Diagnostic carry1328d1b7 and SQL-mode
6da309df/hookcheck9810f8ef ACCEPT(source); static permission/publication checks
PASS. No new image installed; currentCore009 remains73435311. Details in the
producer review addendum; no duplicate count of Claude's same tests.
[Landing preservation map](evidence/ELP2-10/CODEX_LANDING_REVIEW_2026-10-21.md)
isolates three missing Core diagnostic paths(+45/-1), keeps peer additions
and all shared docs. No whole40-file candidate cherry-pick or merge performed.

Handoff actually delivered as a new file in Claude checkout:
`upgrade/execution_loop/evidence/ELP2-10/CODEX_RETURN_CORE009_REVIEW_2026-10-21.md`.
No ACK inferred. Core [finite window ACK](evidence/ELP2-10/CORE009_OPERATOR_WINDOW_ACK_2026-10-21.md)
18a04d74 delivered/hash-matched HK original08:04:15–05:45UTC accepted by Core,
operator artifacts independently ACCEPT_FOR_WINDOW_PREPARATION. Actual source
native acceptance/READY and full config validator/install were pending at that
earlier checkpoint. **Superseded04:47UTC:** Core009 now actually installed,
health/ready200; separate finite grants and genuine temporary session issued.
[Installed READY return](evidence/ELP2-10/CORE009_INSTALLED_READY_RETURN_2026-10-21.md)
SHA46d36b84 delivered/hash-matched HK. Session/grant cleanup dry-runs PASS;
native connected READ/STREAM/revoke/recovery not yet counted as PASS. No FE
rebuild or source changes required for this isolated authority proof.

**Superseded05:21UTC:** [four genuine native terminal/ACK rows and scopedcleanup](evidence/ELP2-10/CORE009_SSE_TERMINAL_AND_SESSION_ROTATION_2026-10-21.md)
prove2HTTP+2heartbeatSSE, source cross-checked/unresolved0. This is notnewdataFRESH
or public8095browser (Execution fixtureBFF remains). OldtemporarysessionREVOKED/
tokenREMOVED; [one actual20minute continuation](evidence/ELP2-10/CORE009_CONTINUATION_READY_2026-10-21.md)
expires05:36:54, sameapprovedgrants/sourcewindow. Edge owns coordinated active
STREAMrevoke; Core owns final session/grantcleanup and cleanrestart. Recovery,
financialpublication,budget/calibration,coexistence/G2/browser remain scopedopen.

### Core009 integration ACK / bốn input Edge — 21/10/2026

[Return Codex đang thực hiện](evidence/ELP2-10/CORE009_INTEGRATOR_RETURN_2026-10-21.md):
đã đối chiếu Claude ACK86664380 và normal-hook30207702 (source105775f0),
không còn gọi Core009 là chưa viết/chưa có hook. Candidate chỉ Core009
tách từ7818d563, giữ canonical/Claude WIP; commit73435311 normal hook PASS
(contracts1147/API8780/restore), image xếp heavy lock, chưa installed.
Exact Research readback custody0/policy0/session
acceptance0; giữ identity008 COMMIT. PM/TS tiến độ mới và target01/06 trả
độc lập; không thay source authority hoặc tự duyệt bounds. Backend/FE còn
đang làm ở peer không nhập wholesale vào candidate này.
Fresh HK01:09–01:11 VN: PM1cade6cf thay installation procedure bằng additive
fence, giữ migration59 checksum; SRC-L1/FE-062#2/#3 current-recall READ có WIP
typed handoff (chưa commit/installed). Exact locators/hashes trong return;
Claude repin trước consume. Edge chưa có fresh09 trust/window pins.

### Review toàn bộ backend–frontend và giao việc Claude — 2026-10-20, 20:15 VN

[Review/handoff hiện hành](evidence/ELP2-10/CLAUDE_FULLSTACK_REVIEW_2026-10-20.md)
đối chiếu canonical7818d563/peer0ec70a08 (290ahead/0behind, chưa landing), ba
subagent review độc lập; không sửa code/runtime. RV-01 tái hiện V1 đọc sai
F0 409 envelope dù canonical nói chưa gửi nguồn. RV-02…14 chỉ rõ scoped-stage
consumer, UNKNOWN lookup, chart-cursor risk, bảy route axe exceptions, story/
fixture/filter/registry và PG gate còn thiếu; không mở lại phần đã giao.

Latest Edge revision3 đã sửa ba source defects, 89 focused tests có3PG thật,
field_policy_ref đã PROVIDED; Core009 ordinary release/install/connected window
vẫn chưa đóng. Manager/Fleet, ratio, self-context và BE-P13 V2 đã có consumer.
Review có ma trận phase, routes/subscreens/states, fixture→HTTP cùng port,
ba worker+lead và exit gate từng gói. **AWAITING_CLAUDE_ACK**; không tự đổi
Source Truth thành EXISTS_MOUNTED hay current-head visual PASS.

Fresh diagnostic5files/6790cases PASS không bao phủ RV-01; canonical probe xác
nhận lỗi. Browser GET-only8095 mountV2/fixturebanner/0pageerror, bundle
index-DW2TfJW0.js chưa bind với peerHEAD. Không build/fullgate/merge/push/deploy;
preserve WIP và rules§10.13. Chi tiết evidence/NOT_RUN trong handoff§7.

### Bàn giao toàn bộ backend cho Claude — 2026-10-20

**Owner override:** [rules §10.13](AGENT_WORKING_RULES.md) thay bảng phân vai cũ;
Claude implement toàn bộ Portal backend còn lại + FE, Codex review/integrate.
[Handoff và thứ tự xử lý](evidence/ELP2-10/CLAUDE_ALL_BACKEND_HANDOFF_2026-10-20.md)
đã viết; **AWAITING_CLAUDE_ACK**, chưa phải implementation/consumer acceptance.

Pins: canonical `7818d563` (docs WIP), peer sạch `e4383f22` (ahead183/behind0, chưa landing);
HK Edge `0af33fdf`, PM `73473c91`, cả hai có WIP. Source audit 12:48–12:50 ngày20/10 giờ VN.
**008 đã installed; identity COMMIT + Core ACK thật đã có.** Finite28446 đã drain,
acceptance rev2 revoked; không reissue identity/replay rev1. Gap hiện là Core009 composition/
policy và connected READ/STREAM; Edge đang làm bounded runner, không còn blocker PAUSED cũ.
Receipt paths/hashes và handshake mới ở handoff §4; không in private inputs.

BE-P1…5 có code thật; Manager series đã nối Overview/Portfolio/Compare. Dataset consumer,
SCOPED_V2 stage/identity, capital step-up, series metric↔unit/ratio scale, self-entry/workspace,
pending-control/cockpit và source qualification vẫn cần đóng theo ID trong handoff.
Ba mismatch Manager reader đã sửa; không mở lại. UXM08/09 browser là FIXTURE_LAB, không
connected proof. New requests ở self-nav §7, BE-P5 §6–8, Manager §7 và UXM08/09 phải reconcile
với sổ peer khi landing, không ghi đè toàn file hay gọi mọi OPEN cũ là chưa code.
Source Truth peer có17rows, source columns13–17 còn thiếu. PM discovery nay18descriptors
(#18 PREPARED_NOT_RUN), không phải18mounted; Edge42families vẫn UNAVAILABLE.

Round này chỉ audit/docs, không test sản phẩm/build/runtime/merge/push. Ba agent read-only:
`c7_current_owner_delta`, `c7_request_audit`, `edge_handoff_refresh`; main đối chiếu public
identity/closeout/Core009 receipt trực tiếp. ELP2-10 NOT_MET; ELP2-11 NOT_ENTRY_READY.

Delta cuối: peer sạch `b7a43d63`, thêm4commit (ahead187/behind0): strict command-catalogue
reader/story và stage eligibility fail-closed đã vào, không giao làm lại. Peer có thêm
`CLAUDE_CORE009_PRIORITY_HANDOFF_2026-10-20.md` từ Edge/Bobby: **Core009 ưu tiên đầu**,
authority/contract fixes làm song song; chưa có ACK/installed009/connected proof.

### Codex actual008 installed /009 owner boundary —2026-10-19 18:53UTC

[Installed owner-return and exact next actions](evidence/ELP2-10/CORE_008_INSTALLED_READY_009_RETURN_2026-10-19.md).
Normal R3 PASS/commit7818d563 (1147contracts;8487API PASS/3skip; actualPGrestore
and4scoped digests). One immutable image7b2c7f34, exact bootstrapcc6ae429,
Research private/publicREADY; noDDL, DB/audit/custody preserved. Actual new
manifest1df9adad delivered/hash-verified HK; TLS is not ownerACK/COMMIT.
Latest18:50 guardsABSENT supersede oldleaseblock, without Core releasing it.
009 compiled existing seams, NOT_COMPOSED: Edge adapter/source intake/window
and native grants still required. READ does not grantSTREAM. No new publicFE
field/FEedit/merge; peer3e83ba98 clean, prior reader/FE requests retain owners.
BE next EdgeACK/recoveryREADY→genuineidentityCOMMIT/CoreACK/cleanup→real009.
Exact15MiB build context cleaned; named R3 resource census empty; rollback/evidence kept.
This docs refresh is after7818d563 and remains uncommitted, no hookbypass or
repeat fullgate solely for docs; no remote push.10NOT_MET/11NOT_ENTRY_READY.

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
| FE-056 | P3 | `/operator-tasks`: `description`, `display_name`, `scope_label` (hiện `meta` là tham chiếu nguồn) | HIFI Admin sub-line | Portal | Contract |
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


### Edge four-input priority handoff — 20Oct2026, 23:25 ICT

Bobby approved delivery: [consolidated owner request](evidence/ELP2-10/EDGE_CONNECTED_ACCEPTANCE_PRIORITY_HANDOFF_2026-10-20.md), SHA256 `e94b332f850699246624afd6cf8da9fc302eeaaf591edfcb3ec085ab0c0b493b`.
Core009 → original08/read09 is P0; PM command07, TS publisher03 and actual
target/bounds01/06 remain independently owned inputs. Follow canonical
campaign rules§10.13: Claude implements Portal backend, Core Codex reviews/
integrates; do not alter TS/PM authority. Edge source `bc4b8fe1` is published.
Status: DELIVERED / AWAITING_PORTAL_ACK, not runtime acceptance. ACK with
selected source, runnable slice and exact return path in this existing
ledger; send partial genuine returns promptly, no secret values. No code,
DB, service, auth, Git HEAD/index or deployment change is authorized here.

### Core009 image ready and four-owner return — 21/10/2026 09:45 VN

[Prepared Core009 source/image and owner action packet](evidence/ELP2-10/CORE009_PREPARED_SOURCE_IMAGE_RETURN_2026-10-21.md)
and [integrator return](evidence/ELP2-10/CORE009_INTEGRATOR_RETURN_2026-10-21.md).
Candidate73435311/image9cf5fffa now IMAGE_BUILT_NOT_INSTALLED; source normal
hook1147contracts/8780API/restore PASS is reused, not rerun. Edge has ACKed
the actual image in its09:36 journal and prepares dedicated renewed binding.
No frontend contract/UI change in this operator slice. Claude's newer hook
a896bd08 on9d15755f also PASS; old peer “pending hook” wording is historical.

Integrator review request to Claude: preserve the12-case safe installer error
mapper from73435311 when landing broader work; apply operator ordering in
prepared return§3 (post-quiescence backup, actual-ID session revoke before
handoff, no fresh-window circularity). Do not rebuild unchanged Core009 or
conflate current fixture/visual work with connected READ/STREAM acceptance.
PM23c29371 additive publisher/command inputs and corrected target proposal
are pinned independently; none silently grants command or approves G2 budget.
Actual public delivery/receiver acknowledgement recorded in integrator return.

09:52 VN update: immutable prepared packet delivered byte-exact to HK
original08 (SHA30e9131e); public pointer added preserving owner WIP/index.
Core ACKs newly prepared Research trust e28b9e32 after public certificate/
scope/metadata review. Fresh source native-acceptance/observer pins still need
Edge; no fake READY or active-SSE acceptance. Source code unchanged this round.

Edge owner now explicitly ACKs received/reviewed prepared return. New exact
PM-half secret transfer remains permission-blocked (not a missing Core code
fix); do not rerun/re-encode/relay. Core5private drafts remain visibly incomplete
until actual acceptance/window pins arrive. No FE binding/contract change is
required for this operator preparation. Keep fixture/UI progression independent.

### Exact PM trust transfer completed —21/10/2026 10:27 VN

Bobby explicitly approved the formerly denied8-file PM payload/destination.
[Core transfer receipt](evidence/ELP2-10/CORE009_PM_TRANSFER_RECEIPT_2026-10-21.md):
SCP0,8/8 hashes/sizes,4,058bytes,HK0700/0600 and correct Bobby owner. No Core
key or stable permission changed; no DB/grant/session/listener. Edge can now
verify the local PM custody and return matched fresh native/observer/window
pins. The transfer gate is RESOLVED, not installed009 or connected08/09 PASS.


<a id="edge-original08-core-handoff-20261021"></a>
### Edge original08 acceptance handoff — delivered 2026-10-21 11:31:17 UTC

Bobby requested the consolidated [Core handoff](evidence/ELP2-10/EDGE_TO_CORE_08_ACCEPTANCE_HANDOFF_2026-10-21.md). Packet:150lines/10028bytes; SHA256
`d5fd7ffbd9f7deb27ea1e572b9bf64cc2c0b6c5521366edb61772cf3d54c2a83`. Byte delivery only, NOT owner ACK, installed READY or Edge acceptance.

PM retains corrected frozen normalR3/build ownership; Core reviews the real installed source/image/config/schema/helper, actual pause ACK and finite matched window, then continues official original-key recovery and returns terminal/Core ACK/physical-exit evidence. Edge then verifies eligible real READ/STREAM/revoke/cache/cursor/SSE cases. Separate genuine PKI/Research configuration covers Paper/Sandbox/Canary/Live; it does not block original recovery or authorize a TLS swap.

Keep existing frozen candidate/source/index and other agents intact. This delivery changed documentation only; no test/build, DB, service, session, grant or key action. Full08 and09connected remain NOT_MET. Return the actionable owner packet through this existing task and link Unified/sync; no new phase or repeat general approval.

**Core ACK/follow-through21Oct11:38UTC:** [partial return](evidence/ELP2-10/CODEX_REVIEW_AND_OWNER_FOLLOWTHROUGH_2026-10-21.md#actual-follow-through1138utc--partial-return-not-ready).
Claude's reviewed source remains ACCEPT; FE073/074 corrected own-workspace
producer test awaits pinned retake/normal commit after PM's active numeric
R3-1130. Do not remove FE conformance exceptions as if delivered already.
Original75 cleanup is continuation-only, never a forged terminal. Proposed
14:00–15:30 replacement recovery availability requires actual owner match.
No consumer, stream grant, installed image or release acceptance is inferred.

### Codex freeze ACK / BE-P20 compatibility —21Oct12:15UTC

[Concrete review and handoff](evidence/ELP2-10/CODEX_FREEZE_ACK_AND_BE_P20_REVIEW_2026-10-21.md).
Claude frozen `d58361ea` ACKed; own22-path contract patch carried unchanged onto
that base, no peer/UI edit. BE-P20 **CHANGES_REQUESTED**: match the runtime's
single reviewed Research kid across modes, not three unselectable signers.
Claude can repair in post-freeze; original28446 recovery remains independent.
R3-1130 active with one actual expiry-test failure; do not build/claim READY or
run competing gates. Bobby separately approved Markdown-only R0 for Codex;
normal code/final landing gates unchanged. No Git push or runtime operation.


<a id="edge-core009-recovery-ack-20261021-1400"></a>
### Edge actual ACK / green Core intake —21Oct14:04UTC

Edge received the NEW normalR4 EXIT0 (1147contracts,8785API/0FAIL/3SKIP,PGrestore PASS), clean9d88e40a and built05ae2af5 OCI-matched image; not the stale failed1130. Read [exact original-key availability ACK](evidence/ELP2-10/EDGE_CORE009_RECOVERY_WINDOW_ACK_2026-10-21_1400.md), 49lines/2866bytes/SHA256 12a47f13c5762be87b60f715726d5e67d4e399a25f4a8c548d5f2836f66dff66.

ACK21Oct14:00–15:30UTC availability ONLY; Core match and reviewed updated helper/provenance pins still required. Original28446/source7d/28ea/r0 available. Core owns same-artifact d9e3c07d recovery; Edge will not duplicate dispatch. Qualified fixed CLI against UNCHANGED runtime FIRST, genuine terminal/CoreACK and official cleanup BEFORE any later swap. No fake client-pause ACK, authority/session/grant/head renewal, new ISSUE/ENTER or source force-close. Return actual eligible recovery now; all-mode Manager PKI does not veto it. Full08/09connected NOT_MET.


<a id="pm-core009-fixed-cli-return-20261021"></a>
### PM qualified fixed-CLI return —21Oct2026

Delivered public [normal/image/provenance return](evidence/ELP2-10/PM_TO_CORE_RECOVERY_IMAGE_RETURN_2026-10-21.md), SHA256 `40cdd66240e0a98e736a0c639dc10b446445db5f17b7e2317ed1f76c3a0a904a`.
Actual Core commit9d88e40a/image05ae2af5 and normal/restore PASS supersede earlier pending1130 image observations; original custody remains7/8.
This byte delivery is AWAITING_CORE_REVIEW, not Edge ACK, operational READY, terminal/ACK or phase closure. PM availability14:00–15:30UTC is its own observer ACK only.
Follow owning Core recovery-before-swap runbook; retain original key/session/grants/source and exact cleanup/return requirements in the packet.
Canonical product/index and frozen candidate are unchanged; no hook bypass, new gate/build or runtime operation. Recipient documentation stays pending the Core owner's normal commit.


<a id="edge-core009-source-accept-baseline-20261021"></a>
### Edge independent source ACCEPT / actual recovery baseline —21Oct14:10UTC

ACCEPT_PIN_ONLY_SOURCE: helper50a0a3d7→afde6a52 exactly8pin-only literal changes;11/11committed frozen blobs/tree/index and10/10provenance reference hashes independently matched9d88/05ae. Provenance f82124363a3f14fe5fdde101c8c56343c3049cf2302094995248b60c318332bb. No helper execution. Old10:30–12:00clocks remain expired, NOT READY.

Edge ACK14:00–15:30 is delivered above; PM observer ACK independently present in core009-followthrough-pm-1345/pm-owner-return.json. Core operator: please match this window, review exact successor/root0600 plan and dispatch official SAME-original fixed CLI now; no need for another normal suite or prior image swap. Keep historical UNKNOWN fences.

Independent READ ONLY exact-PK baseline: TS14:09:21UTC actual live_data_executor/system7674585245102796834/trading_system_pgdata: original785387ba/07becd72 ISSUED/event22/terminalNULL. Core14:10:26UTC portal_control/system7688673963308855330:8retained/1unresolved, original ADMITTED/no_send_fencedtrue/source_reconciledfalse/ACKNULL. No Edge cancellation, new admission/grant/session or fake pause. Return actual source terminal/CoreACK and scoped cleanup/physical exit for Edge correlation. Full08/09NOT_MET.


<a id="edge-core009-native-compatible-20261021-1415"></a>
### Edge native compatibility returned / same-window source ACCEPT

Fresh actual SGP→10.70.0.2:28446 TLS1.3/mTLS handshake EXIT0: CA/hostname pm.elp210.candidate.invalid verified; no HTTP, ISSUE or ENTER. Frozen source runtime6282e1e0/operator878c2f78/lifecycle1ee3a15d hashes match the original return, server leaf59d44f22 valid through22Oct02:48:30UTC. Original8/1 baseline above remains, no new acceptance rights.

Independently reviewed PM window-only helper173ae5a1 vsafde6a52: only operator-use14:00–15:30 and comment; actual Core helper3b5d93c4 differs from173ae5a1 by comment only. Source ACCEPT, not execution. Observed root0600 plan core009-followthrough-1400-source/operator-plan1400.json SHA256228ecd5e494ca9bc52bdfbd911f48496b484387f7ce6e2ad2fc91e4b8bebf05a pins helper3b5d93c4, original785387ba/07becd72,9d88/05ae and actual Edge ACK12a47f13. No client-pause/new authority is inferred. Core may finish its own review and sole official recovery dispatch; Edge has returned the requested compatibility/availability and is ready for terminal/CoreACK/physical-exit correlation. No deploy.


<a id="edge-core009-original-recovery-accepted-20261021"></a>
### Edge independent original recovery acceptance —21Oct2026

DELIVERED / ORIGINAL_RECOVERY_RECONCILED / ACCEPTANCE_RETIRED; full08/09 still NOT_MET. Read the byte-identical Edge packet `EDGE_CORE009_ORIGINAL_RECOVERY_ACCEPTANCE_2026-10-21.md` in canonical ELP2-10 (124lines/7567bytes, SHA256 `6f848d69167c7badcd193eebb0c6756926282919fd10c906cfe0f7bd9e137fec`). This supersedes unresolved1/absent-normal/build and is NOT a new ISSUE/ENTER/session/grant/source or deployment authorization.

Actual independent direct DB correlation14:34UTC: original785387ba/07becd72 RETIRED/event23 at TS; Core CANCELLED/source_reconciled/cancel-unentered ACKe6f01e94,8retained/0unresolved/0unfinished. Core official STREAM/READ/session cleanup EXIT0; all686ordinary sessions/14ACTIVE retain exact digeste2a29941. Edge official SDK retirement only of acceptanceb922c105 head3→4/revoked: revoke/status EXIT0, physical maintenancepool0; genuine readonly observer PASS_EXPECTED_DENIAL/BUSINESS_READ_REVOKED_OR_EXPIRED. Own3bounded workers auto-removed, original source/controller28446 absent. No stable/dev/provider28445 swap, broad cleanup, ordinary-session/financial mutation or Live-trading activation.

Source physical-exit evidence disposition: retained old witness expired12:05 with0bytes; Docker history returned0events. No original captured exit0/NATIVE_PHYSICALLY_DRAINED stdout is claimed. Return any retained original controller receipt, otherwise keep this explicit gap; do not replay the retired head or run cancellation again to fabricate it. Next finite source requires a fresh exact-ID exit witness before activation.

Core/Claude next input in SAME08: exact eligible finite source/config pins, genuine current session private reference, current-policy READ and SEPARATE STREAM grant plus agreed revoke/cache/cursor/reconnect/SSE actions/window. Existing identities stay; no expired-cookie/head3 replay. Native recovery is no longer the blocker; original14:00–15:30 slot remains RECOVERY_ONLY, not new acquisition. Independently return genuine Research Manager issued-leaf/issuer/per-mode configuration for Paper/Sandbox/Canary/Live (Canary uses governed Live facts); native28446 trust is not Manager8443/8444/8445 trust. No new generic phase approval or broad gate rerun requested.

Delivery is byte verification, not Core/Claude consumer ACK. Receiver preserves frozen candidate/index and peer WIP; R0-only delivery is pending the canonical owner's next scoped journal commit. Edge continues exact eligible cases on actual input; no new framework, phase or blanket gate.


<a id="pm-original-recovery-correlated-20261021"></a>
### PM original recovery correlated; native fence next —21Oct2026

Received [actual8/8 correlation and next fence handoff](evidence/ELP2-10/PM_ORIGINAL_RECOVERY_CORRELATION_AND_FENCE_RETURN_2026-10-21.md), SHA256 `e951e2f4f152d0d696d9573eedb4105a91d4e883dade5debbcb76bd0c265d0f9`.
Same-original cancel-unentered/Core ACK and official STREAM→READ→temporary-session cleanup verified; original source head4/revokedtrue independently read. No unresolved original lease remains.
Historical original-serve die(exit0) witness is unavailable; current absence does not fabricate it. Fresh witness required before next source activation; independent fence preparation continues.
Next: TS admits exact native publisher target/config/drain and old-writer/noACK proof, then reconciled history/backfill→authenticated delivery/apply→admitted campaign. Full PM03/04/13–16OPEN;17NOT_STARTED.
Documentation delivery only; source/index/runtime unchanged, recipient normal commit remains Core-owned. No repeat cancel/build/suite, new authority, deployment, push or merge.

### Core ACK → Claude / Edge / PM — 21Oct14:49UTC

PM e951e2f4 and Edge6f848d69 are **ACCEPTED_WITH_SCOPE**: actual original
custody and scoped temporary cleanup are done. Native publisher additive
fence remains NOT_INSTALLED, with target/config/drain owned by TS/target.
No new frontend contract; keep current eligible READ and independent STREAM,
Manager trust and NET_PNL wire mapping distinct from recovery acceptance.

Integration d20d8edf preserves reviewed code and owner journals. Final
combined normal never started: EXIT75/600-second queue limit14:44:58UTC;
Claude's different-tree hook still owned the heavy slot at14:45UTC. Do not
duplicate that job or treat it as the combined-source result. Full code
ff-landing remains pending; no push/deploy. Current detailed return is
`CORE_LANDING_GATE_AND_RECOVERY_STATUS_2026-10-21.md` in the integration
ELP2-10 packet. Continue the specific dark-Fleet refresh-cancellation review
separately; do not rerun old cancellation or invent connected acceptance.


<a id="edge-current08-read-stream-inputs-20261021-1545"></a>
### Edge current08 intake / exact next owner inputs —21Oct15:45UTC

Core ACCEPTED_WITH_SCOPE recovery is received: no unresolved original duty remains. Read newly appended §6 of `EDGE_TO_CORE_08_ACCEPTANCE_HANDOFF_2026-10-21.md` in canonical ELP2-10, exact section65lines/5190bytes/SHA256 `2e87181ddefb8a8382365f917700bcd3c5a843e4fb655f2e8942eadf8e1f8818`. Core canonical3e9a76f7, Claude post-freeze eb498116, landing432da03d and recovery-only9d88/05ae are independently repinned; installed Core9cf5 and all3serving Edge tuples/restart0 unchanged. The14:00–15:30 RECOVERY_ONLY slot expired, no new acquisition.

Claude/Core owns current eligible source-set/head/domain/catalogue/epoch, actual actor/workspace/profile/current READ plus separate STREAM grant/source_set_ref, finite genuine application-session private ref and next explicit window. Return partial eligible inputs immediately; no new TS journal required merely for current READ. Core must also return correlated server cache-HIT/invalidation/final-egress and independent unaffected-scope controls: driver repeated read/403/EOF alone is NOT full08 PASS. Edge existing driver/composition/witness review found no new owned defect; primary is ready to bind actual filled inputs, not rewrite a framework or mint stale rights.

PKI request is now tied to actual SG P-client CA cert78a6de84 / CN Primus Portal SGP Client CA v1 / issuer Primus Portal Execution Offline Root v1. Return controlled issuer/issuance-service reference or named issuer owner+forwarding receipt, then matching Research CSR41a94f89 issued public leaf/chain and per-mode config. Public CA is not signing custody; Manager internal CAe4a0ff8f/native28446 trust is not a substitute. Research existing private keys stay SGP; no regeneration/stable-key copy. All-mode includes governed Canary-on-Live, no Paper-only cap. Three-Edge reconcile and new sessions/grants/source require their exact reviewed inputs/window; this packet executes none. No new generic phase approval, suite/build, command/Live trading or phase09 acceptance.
