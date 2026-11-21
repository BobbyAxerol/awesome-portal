# Original07-002 — remaining callable source families

Ngày audit: 2026-10-18 UTC. Verdict: **SOURCE_ONLY / NOT_RUN**.
Không canonical edit, Git mutation, test/build/DB/API/process/runtime/resource,
credential, frontend hoặc remote write. Chỉ file private này được tạo.
Canonical original04 vẫn do Main giữ freeze cho normal-hook23493
`technical-readers-land-114510`; report không quan sát/poll hook và không claim
terminal của hook. Frontend `NOT_STARTED_BY_OWNER_DIRECTION`; consumer
`AWAITING_CONSUMER_REVIEW`.

## 1. Kết luận và thứ tự triển khai hữu ích

Sau package REGISTER_INSTANCE đang được Main đề xuất, chọn **một complete
pending-recall control family gồm APPLY_PENDING + CANCEL_REMAINING** làm gói
backend tiếp theo. Đây là ưu tiên triển khai, **không phải operation đã callable
qua commissioned runtime**. PM có reducer/writer/preview/status/original-intent
cần thiết; Portal mới có candidate codec. Phải đóng đủ public contract,
server-selected target/original recall, exact app/current TS acceptance,
durable submit-before-I/O, authenticated result correlation, current audit
status, same-key recovery và HTTP/PG tests trong cùng gói. Không thêm codec nữa
rồi gọi family complete.

Thứ tự đầy đủ, không bỏ objective original07/08:

| Ưu tiên | Complete family / phạm vi thật | Current source có gì | Chặn implementation / integration cụ thể |
|---|---|---|---|
| 0, Main đang làm | REGISTER_INSTANCE | PM management writer + registry receipt; private full Portal proposal đang soạn | Giữ package hiện tại, không đếm report này thành phần đã land/commissioned |
| 1 | APPLY_PENDING + CANCEL_REMAINING trên **original recall** P hoặc exact D/A | PM same-UoW writer, five CAS, original remainder, immutable revision/receipt, rolled-back preview, current REPORT status; Portal candidate codec có | Thiếu full family coordinator/store/public DTO/routes/exact app actions/accepted source correspondence; full Edge outcome/port hiện chưa admit controls |
| 2 | ADMIN_LOCK + ADMIN_UNLOCK, exact recipient + lock ID | PM lock heads/revisions, separate BUDGET vs UNLOCK; Portal candidate codec | Thiếu full family/app actions/result trust; generic full outcome không có lock receipt-proof coverage tương ứng; không dùng HALT/RESUME thay lock/unlock |
| 3 | REALLOCATE_BUDGET approved R2 composite | PM atomic parent/source/target budget+book writes, RETURN/REGRANT legs; Portal conservation codec | Full result binding/approval/three-resource authority; full existing outcome reader caps2budgets, không dùng được3budget composite; không route qua recall+FUND |
| 4 | BIND + credential-only REVISE_BINDING | Source metadata writer/receipt, exact pair, verified proof callback; no activation | Portal full family còn thiếu; app `binding.change.propose` chỉ propose; real binding authority/census/provider absent from commissioned command evidence; không native rebind |
| 5 | MOVE_ASSIGNMENT + CANCEL_MOVE | PM source/destination authority, persistent pending guard, seven-key census,3causal receipts, temporal intervals | Full Portal coordination/current dual-scope rights + source financial proof implementation/commissioning; pending progress needs explicit owning continuation, not GET or generic resend |
| 6 | SET_LEVERAGE / SET_MARGIN_MODE / SET_POSITION_MODE / SET_ACCOUNT_MODE **complete physical-profile transition** | Prepare/reconcile/status + guard, shared Rust compiler, PM/P09 staging/attempt correlation, separate service recovery | Wider complete family: exact app physical authority for whole affected scope, current capability/pre-send controller, real simulator/native readback/model/fence and post-COMMIT sender; PREPARE-only is not closure |
| 7 | LIFECYCLE / SET_TRADING_STATE + archive/monitor workflows | Narrow unbound registry lifecycle and separate capital trading-state writer | Bound registry lifecycle explicitly unsupported; actual state/admission/whole census provider and current app mapping; Paper clone/create-Portfolio/native rebind lack selected management dispatch in scanned source |
| Source-owner prerequisite, independent | RETURN_CAPITAL / SET_RISK_LIMITS | RETURN pure contract and parser/status vocabulary; RISK capability/design | RETURN persistent economic writer/receipt/source-claim reversal/free-cash/backing integration is missing; RISK has no selected management writer. Portal must not simulate either |

BIND/assignment/profile priorities can proceed independently after Main freezes
their exact contracts; no requirement to wait for every unrelated score or UI.
Ranking measures shortest dependency-closed useful package, not permission to
discard mandatory profile/RETURN/rebind/monitor requirements. Runtime admission
for **every** remaining family is unproved here.

## 2. Scope, current pins và concurrent dirty evidence

Đã đọc applicable /home/bobby + repo AGENTS, campaign rules ``1–8, entry point,
Unified original07/08/current returns, full07/08 README và07 candidate/handoff/
source notes; guide Portal ``3,9.2–9.4,10.7–10.8,11,12.3,14.3,15(07/08).
Đối chiếu PM R2 đúng PM worktree ``6.4/6.7/7/10 và current journal58.66;
Edge original07 current owner-return và actual Rust decoder. Root onboarding
URL không truy cập vì assignment này cấm network ngoài SSH readonly đã nêu;
không làm vnstock setup không liên quan.

| Source | Full HEAD / read boundary | Dirty observation |
|---|---|---|
| Local `/home/bobby/portal-research` | `0d5ceaba3281cd51e8dd2f7caebc9a7b8e82db05` |84staged paths; no unstaged diff/untracked at measured read. Staged diff SHA256 `941f272feefa5ca38035a60afc1da9fec9f7b11b040aa029c476886a01cab114`; porcelain digest `5afc79a28ccca7e36cff3bfac8f5b64b94a9de111019aedf1eae5c15c11db385`. Không sửa/index thao tác |
| HK PM `/home/bobby/.worktrees/trading-system-pm-v1_1` | `59ea9aa3a25595300dda29f02c5d384b1c088dc4`, commit11:44:21UTC | Initial clean; later **journal-only unstaged** `TRADING_SYSTEM_UNIFIED_IMPLEMENTATION_PLAN.md`, preserve peer58.148. Unstaged diff SHA256 `023130bab369f8d49dc8a35f6cb5eceacf892910d54b959d9a617b94e3a61698`; index/untracked-name digests empty; final porcelain digest `fc133c1f2d3f83bb7e6bb577131efb99b229cb0f0de283b95f55ffca9443167b` |
| HK Edge `/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2` | `20a1d27fa4d03ef7162a7980fda3fe3602995a8b` | Peer dirty. Unstaged diff `894a7f809e6a42327191efa3361f57b164817f81d8729a0b11c7842cc9761eee`; staged diff `367d90d940ab748a92eb216df3d3e235bdbd2c05b99fda19dbb33ae7dd1404a5`; untracked-name digest `9cb6373ced1880e977f8928d799f7be133cda050788e29e2de30adddbfdcd738`; porcelain `9896fc9c257fa039bbe7d13b5cf5977585fd947aa65acdfa658db86bc1ca3a99` |

Empty SHA256 is `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
Diff digests use `git diff --no-ext-diff` / `--cached`; untracked names use
`git ls-files --others --exclude-standard`, no untracked credential contents.
Edge dirty paths are six tracked entries: preflight script, EDS12 manifest/
qualification, Unified backend journal, two08final-egress receipt additions.
Untracked names are08native source/qualification artifacts, native-read-egress
test/source directory and feasibility review; no07command source change observed.
Remote `rg` unavailable, so bounded `find/grep/nl/sed` used. First sandboxed
SSH denied socket before connecting; approved escalation then performed readonly
source/metadata calls. No source execution or owning-resource operation.

PM HEAD advanced beyond Main's initial6f3c852 pin; audited management/binding/
recall/reallocation bytes below remain concrete. At this first snapshot58.148
was owner cleanup journal only, not newly commissioned command authority.
The follow-up snapshot and exact six-file registration comparison are in §9;
they supersede this table's PM HEAD/dirty observation, not its recorded bytes.
Source/journal may continue moving; repin before implementation/qualification.

## 3. Shared source auth and transport — what exists, what does not

PM `operator_session.py:82–147` composes ONE current human/workload/read lease
and identity transaction. `human.py:117–185` requires active exact issuer/
subject/session/authority/environment/workspace, rechecks before COMMIT, retains
lease through commit; release/ACK uncertainty becomes UNKNOWN, not rollback.
`operator_api_contract.py:56–68` additionally verifies stable TS user mapping,
exact nonempty scopes within workload scopes, same environment and
`pma.management.v1` audience. Repositories still check business capabilities,
policy CAS and target proofs. A token/typed access object/constructor alone is
not installed authority.

Current human byte-bound bridge **already exists**:
`portal_human_candidate.py:344–367` creates a per-request verified service and
request-bound attempt; it explicitly has no installed default client/trust.
`operator_adapters.py:498–525` recomputes request digest from delivered bounded
method/raw path/query/body before authority/TS borrowing. Do not ask PM to
reimplement the entire bridge or call READ-only accepted authority command-ready.
The journal's genuine installed **disposable READ** histories are not command
provider commissioning, nor mainnet/native proof.

Candidate HTTP factory `operator_adapters.py:422–489,525–582,584–623` has
request/response caps, duplicate-key rejection, finite semaphore and whole-call
timeout, private/no-store responses, and only returns success **after**
authorization context/COMMIT exits. Paths exist in a factory; not a production
mount. `operator_runtime.py:47–86` composes existing repositories/providers;
`106–125` constructs the private capital Edge handler only.

Real durable capital original-intent + outcome **are present now**, not the
stale58.66 “original persistence missing” shorthand:
`operator_intent_journal.py:22–33,89–149` stores/verifies original normalized
capital **and controls** through existing P03 journal, without today's profile;
`capital_outcome_source.py:74–193` validates owning receipts/journal/immutable
before/after revisions; `edge_command_handler.py:38–82` holds existing source
session around one submit or REPORT-only lookup and returns only after commit.
Do not recreate a second economic journal or re-request already delivered code.

But current full handoff is **not generic**:

- PM `edge_command_handoff.py:18,56–62` permits eight capital operations only;
  `EdgeIntentBinding` reparses `pma.capital-command.v1.1`, not controls,
  management or profiles.
- PM `capital_outcome_source.py:25,110–137` admits only those operations and
  caps proof snapshots at2budgets/2claims. Pending writer already stores usable
  receipt evidence; admin/reallocation writers currently do **not** pass such
  evidence into `_record`. Reallocation needs3budget proof, not raising a cap
  without exact scoped verification.
- Edge `command-relay/src/durable.rs:581–640` admits only eight operation/CAS
  shapes and capital schema; `pm_source.rs` is the compatible full-outcome
  decoder, not an authenticated network port or newfamily route.
- Edge owner-return lines11–38,125–144 records actual codec qualification,
  while authenticated mounted submit/status, command-current human/workload/
  field providers and exact runtime bindings remain required. Its activation
  matrix has zero qualified runtime operations and empty profile bindings,
  **not wildcard**. Do not call the reduced candidate API an existing full
  Edge authoritative-outcome wire by renaming it.

Portal actual `command.service.ts:20–22`, `command.contract.ts:24–36` and
`command-trust.ts` remain eight-capital-only. Candidate control/pending/profile/
reallocation modules have no imports from other production source consumers
in the checked `src` scan. No source send, public route, accepted grant or
trusted result follows from their parser/presenter functions. Existing strict
source default remains unqualified; preserve capital DTO/result/collection.

## 4. Exact family semantics and minimal blockers

### 4.1 Pending-recall controls — best next full package

PM `operator_adapters.py:23–45,59–78,147–149,233–303`:
`pma.operator-control.v1`, common schema/operation/key/recipient_kind/currency/
expected_versions/reason + `command_id`, plus account/deployment pair for D/A.
Five canonical signed64-range unsigned **string** CAS keys:
`budget,source,parent,book,command`. No amount input: only original remainder.
Target P or exact D/A; ROOT is refused by writer. Source capability is BUDGET
for **both** operations, current REPORT for status. The PM normalized digest
includes resolved recipient/authority and native integer versions; Portal wire
hash and delivered-byte hash are independent.

`recall_repository.py:125–198` owns pool+membership+target/parent locks, original
authority validation, budget/book/command/source CAS, FIFO/release causal proof
for APPLY_PENDING, cancel-only remainder for CANCEL_REMAINING, two budget
writes + recall head/revision + source advance + real receipt in one UoW.
CANCEL leaves parent budget unchanged and preserves cumulative applied amount.
Current source emits WAITING_ENCUMBRANCE whenever pending remains, including
nonzero applied; do not rewrite source disposition just from UI arithmetic.
`operator_adapters.py:273–303` status requires current REPORT+receipt policy
before lookup, returns latest recall revision while retaining original receipt
where different. Missing is UNKNOWN/null/QUERY_SAME_INTENT.

Private full source format blocker is narrower than missing writer:
original-control journaling exists; pending receipt evidence exists; eight-only
full outcome/Edge admission and source-family authenticated result contract
still need explicit owner binding. A new complete family may use a reviewed
family-specific trusted port against exact candidate preview/apply/status,
provided provider actually authenticates delivered response/source key/original
and latest receipt. It must not declare that existing capital CommandPort
already implements it. No generic caller-supplied URL/source/proof envelope.

Minimal Main implementation:

1. Freeze finite PendingControlIntent/Preview/Status/Problem, generated client
   and synthetic fixture; separate original recall ID, new control key and
   immutable source authority/key/digest. Preserve partition and original vs
   latest receipt semantics, absent/unverified distinct from zero.
2. Add exact app actions (proposed names `capital.apply_pending` and
   `capital.cancel_remaining`), exact selected resource/environment and
   current source acceptance mapping. They are **not present permissions**.
   Existing `capital.recall_partial/full` does not silently authorize cancellation
   or worker progression; no `business.read_all`/ADMIN/creator shortcut.
   Reuse current evaluator/ancestor/DENY/expiry graph + existing per-grant
   command correspondence; source BUDGET still necessary through commit.
3. Reuse registration-family structural patterns once Main integrates them:
   independent Core transport metadata only, durable claim-before-I/O,
   immutable intent/events + product audit atomic, bounded send-once trust
   default-unqualified, final clock/session/grant fence before local intake,
   no network inside Core row locks. No capital union widening or new ledger.
4. Source PREVIEW must rollback, never reserve. Submit only after rechecked
   preview/step-up/source qualifications and original command/target/CAS.
   Local GET has current exact audit independent of original submit grant or
   expired token; metadata authority before private decode, same final body/
   safe-error flight. Lookup is same original control intent, no new control key.
5. Separate explicit **new APPLY_PENDING control operation** from transport
   recovery: recovery only queries accepted control status, never auto-runs
   APPLY_PENDING to “refresh”. No inherited timer/worker permission from GET.
   Accepted obligation worker needs explicit current service authority, not
   human impersonation; original requester remains immutable.

All five are missing full implementation/test obligations, not a proposal to
close07 by a disabled endpoint. Real connected send still requires owning
source transport/provider/retention/current-COMMIT receipt.

### 4.2 Admin locks and reallocation

Admin source `lock_reallocation_repository.py:42–89`:
ADMIN_LOCK takes lock_id, lock_kind, amount, CAS budget/source and BUDGET;
ADMIN_UNLOCK takes exact lock_id, CAS budget/source/lock and **UNLOCK**.
AMOUNT requires release proof; ALL_NEW_RISK amount0 is a restriction, not
economic balance. Immutable lock revisions1(active)→2(inactive), no TTL/automatic
unlock. Unlock does not clear other locks/restrictions. Actual source result
contains real receipt/event, but no immutable receipt_evidence preimage passed
at source line84. To require full before/after outcome, add source-owned exact
lock/budget evidence and verification; don't create proof from presenter numbers.
Proposed exact app lock/unlock actions absent; do not borrow safety.resume.

Reallocation source `lock_reallocation_repository.py:91–131`:
parent must PORTFOLIO, source/target distinct DEPLOYMENT_ACCOUNT children of
that immediate parent; same authority/currency/pool scope, source+target
BUDGET locks acquired deterministically,7CAS:
`budget,source,book,source_budget,source_book,target_budget,target_book`.
Source release context + actor/policy/expiry-bound CompositePermit required;
no universal1x/economic amount inference. Writes all3budget/book states,
immutable RETURN/REGRANT legs and owning receipt atomically. “RETURN” leg is
budget bookkeeping, not economic RETURN_CAPITAL. Presenter lacks some original
request identity; candidate codec honestly marks it NOT_PUBLISHED.
Full coordinator must bind exact parent/source/target/amount/current approval,
not accept equal amount as proof. Add finite exact app action and actual
current authority on all three targets, no generic root read/grant shortcut.
Outcome proof must verify3actual budget revisions and both legs; current
capital full reader2budget cap is intentionally incompatible, not harmless cast.

### 4.3 Binding and assignment: existing metadata != native rebind

Management body `operator_management.py:23–44,283–311`:
seven exact top-level fields `schema_version,operation,idempotency_key,reason,
expected_version,expected_policy_revision,parameters`, schema
`pma.management-command.v1`, both CAS signed64 decimal strings.
BIND/REVISE_BINDING parameters exact pair + server `binding_ref`;
MOVE/CANCEL exact pair + destination_portfolio. Target resolver returns
ManagementTarget and scopes; browser cannot construct source proof objects.
Both source and destination are added for move/status. Source DEPLOY capability;
status REPORT+current receipt policy. Source key `pma14-`+digest of authority,
owning operation, **original route reference**, client key (lines64–80).
Keep that original reference/key immutable; alias re-resolution is not replay.

BIND source `binding_repository.py:135–177` records only an existing
MATERIALIZED_HALTED inactive candidate pair, exact validated venue/credential/
pool/native-binding and current assignment proof; returns RECORDED, no trade.
Its `current` also requires inactive account/deployment. This source is not
evidence of arbitrary active-native account mutation support.

REVISE_BINDING lines179–196 uses equality after replacing only credential_ref
and binding_revision: physical identity/pool/source/product/settlement remain
unchanged. **Credential rotation only**, not broker account/venue/environment
rebind. Real native rebind remains separate source/controller/qualification work.
`binding.change.propose` is proposal authority only; full apply needs exact
reviewed action mapping, not reuse of propose as apply permission.

MOVE lines198–253 + `binding_contract.py:169–193`:
same IDs/root/currency/binding; source/destination rights and CAS; exact census
`positions,orders,reservations,unknown,locks,pending_recall,fees`. Nonzero keeps
old interval and PENDING_DRAIN; zero without3MoveProofs receipts stays
BLOCKED_RECEIPTS. Verified source-budget return, destination grant and residual
settlement receipts are independent, not invented by move. Same intent may
progress through owning move call; status does not progress. CANCEL_MOVE uses
original MOVE key/intent/reason/CAS and only pending/blocked states, never
undoes applied budget/economic commands. APPLIED move requires new command
to reverse. Temporal starts append; SQL view computes old end with lead, so
no historical row rewrite. Actual financial proof provider must bind receipt
contents, not merely construct MoveProofs with nonempty references.

Portal next change is complete move/cancel coordinator against this schema,
not a capital wrapper. Existing `deployment.assignment.propose` cannot be
promoted into move apply. Need exact apply/cancel current authority on **both**
old and new portfolios before identity/private details, service continuation
policy for pending obligations and full late-fee original-attribution tests.
No proof that settlements count substitutes for fees census. No automatic
native cancel/liquidation/unlock, no atomic end-to-end claim if receipts were
produced by separate source transactions.

### 4.4 Profiles: complete family is larger than existing PREPARE routes

Actual source uses `pma.profile-command.v1` (not blindly the R2 guide's future
`pma.native-profile-command.v1` name),9exact fields:
schema_version,operation,idempotency_key,reason,desired,
expected_profile_revision,expected_affected_digest,
recipient_account_id,recipient_deployment_id.
`operator_adapters.py:306–379,604–614` offers fixed preview/prepare/reconcile/
status; operation maps to four separate physical-profile capabilities in
`membership_contract.py:35–39`. PREVIEW uses that operation authority too;
REPORT only for status. PREPARE/reconcile are not capital APPLY.

`binding_repository.py:255–341` expands all registered candidate physical
siblings (source+environment+venue+region+physical_account_ref), caps rows,
checks digest of **full rows** including assignment/binding/profile/fence,
checks all current scopes and same guard. PREPARE writes desired/affected/
expected revision and durable GUARDED receipt. Reconcile unknown keeps guard;
fresh complete observations for every affected deployment are verified, profile
revisions append and guard released only on APPLIED. Source presenter returns
**current** observed/effective refs and provenance (operator_adapters321–330),
not immutable original-native proof; keep current vs historical semantics clear.

Already implemented seams, not missing reimplementations:

- `profile_compiler.py:1–12` delegates Rust compiler and insists contract-only,
  execution_enabled=false/effective_profile_changed=false.
- `profile_plan.py:31–83` binds command/affected/binding/input recipe digest
  and prepares fixed CONTROL payload; rebuild must exactly equal staged plan.
- `profile_dispatch.py:42–104` current authorizes and stages bounded1..16step
  plan/deadlines/egress credential/fence in existing PM command events, no send.
- `profile_attempts.py:27–101` composes P09 on caller connection, exact
  registration/env/scope/owner epoch/credential generation, allow_resend=false,
  attempt1; uncertain retains UNKNOWN. P09 ACK is not PM effective receipt.
- `binding_repository.py:299–317` + `profile_recovery.py:14–36` support
  accepted-obligation worker with current server-issued receipt/affected/
  expiry proof; original requester/workload/reason/policy unchanged even after
  human revoke. That provider must be genuinely authenticated and held to commit.

Missing full Portal app actions/physical-scope mapping, public lifecycle/
capability/readiness DTOs, coordinator/dispatch orchestration and real provider
qualification remain implementation. Source candidate expansion enumerates
pm_binding recipients; by itself not proof of complete whole-wallet noncandidate
native census. Need actual affected-set owner incl other writers, quiesce/
current pre-send fence after DB COMMIT, immutable P09 attempts, simulator/native
request-bound readback matching desired values, model/backing/risk/exposure
revalidation, topology-transition fencing and release-cell evidence. Don't
“finish profiles” by exposing prepare/reconcile alone or marking simulated
Paper/contract-only recipes as native success. Existing source recovery is
settlement-only, no auto-resend or expired original-token read expiry.

### 4.5 Lifecycle/assignment/RETURN boundaries not to merge

`operator_management.py:213–221` explicitly rejects LIFECYCLE if any binding
or capital recipient linked. `instance_contract.py:139–144` only
REGISTERED_UNFUNDED→MATERIALIZED_HALTED/ARCHIVED, MATERIALIZED_HALTED→ARCHIVED;
ARCHIVED terminal. `instance_repository.py:281–313` requires inactive account,
zero existing account balances, materializes inactive deployment, records
registry receipt. Narrow unbound materialize/archive can be a complete explicitly
named family, but is **not** full operational archive/drain or source-Paper clone.

SET_TRADING_STATE uses exact source recipient/capital context, pair + target_state
+expected_source/budget in management parameters. Source caps:
HALT→HALT, REDUCING→REDUCE, ACTIVE→RESUME, ARCHIVED→DEPLOY
(operator_management295–300). `admission_repository.py:95–159` uses expected
state/source/budget/current fences, initial HALT only, archive terminal;
ACTIVE requires fresh risk-clear proof/all ancestors+local restrictions;
ARCHIVED requires nonACTIVE, budget0,8key census incl active_children/fees and
actual child/lock check. Tightening HALT/REDUCING does not depend on fresh
risk observations, but still needs current target/authority. APPLIED state
record explicitly execution_authorized=false: not a native sender/flat proof.
Existing `safety.halt/reducing/resume` can be exact mappings, but source
provider/certification and public fullfamily implementation still required.
R1 Paper HALT/executor and legacy protective routes stay independent.

CREATE_PORTFOLIO, CREATE_PAPER_CLONE, SET_RISK_LIMITS, true native REBIND are
not in current11management dispatch; scoped grep found no such dispatch/writer
in the scanned PM management/risk source. Alpha registration/owner/membership/
alias writers **do exist** (operator_management190–227); their raw receipt
operations differ (REVOKE_MEMBERSHIP/CHANGE_ALPHA_OWNER possible).
`alpha.owner.propose`/`membership.propose` don't authorize direct changes.
Keep current original02/03 intake semantics; no new admin queue/global authority
from this report. Autonomous new intents remain separately commissioned
workload capability, not “recovery” of arbitrary human actions.

RETURN is not totally absent code: `durable_economics_contract.py:159–235` has
ReturnProof/ReturnProposal and pure all-or-nothing return; validates parent,
same original source, budget/assignment/revisions/fence, economic/free amount/
minimum-retained/current proof; pending always0; budget unchanged. Parser maps
RETURN to source FUND capability; read/report vocabulary includes it.
But source operator SUPPORTED excludes RETURN, no VERSION_KEYS entry, no
dispatch branch; `pma11-10-admission-candidate.sql:42–45` capital command CHECK
also excludes RETURN. No persistent return writer found under PM/risk source
inventory. It needs source-owned economic claim/reducer/posting/receipt
integration, current verified free cash and original source/pool lineage,
budget-release links and profit-return policy implementation. A pure proposal
or reader flow name cannot supply those. Do not implement negative FUND,
recall alias, synthetic event or second Portal economic ledger. Same for risk
limits: capability/design exists, selected writer/apply contract missing.

## 5. Source schema / recovery compatibility

Existing PM unnumbered candidate SQLs are source artifacts, not observed
applied production migrations:

| Schema | Exact source invariant and implication |
|---|---|
|05registry | actual registry receipts/lifecycle revisions; source-namespaced key != client key; registration receipt cannot imply canonical pair/funding/binding |
|06binding lines5–89,91–127 | exact account/instance uniqueness; immutable binding/profile/assignment/event/outbox; deferred head FKs; ordered interval append; command state finite RECORDED/PENDING_DRAIN/BLOCKED_RECEIPTS/APPLIED/GUARDED/UNKNOWN/CANCELLED. Don't force capital business enum |
|08recall lines13–44,50–65 | original-intent FK, recipient/sequence uniqueness, requested=applied+pending+cancelled+rejected, monotonic immutable revisions/head CAS |
|09lock/reallocation lines2–35,39–53 | active lockv1/inactivev2 with exactkind/amount; immutable RETURN/REGRANT legs; no TTL; command whitelist finite |
|10admission lines2–45 | initial HALT, terminal ARCHIVED, immutable state receipts and finite allowed command enum; RETURN absent |
|14operator lines4–15 | pm_operator linkage PK(authority,operation,key) → actual capital receipt; immutable; not a second ledger or generic management result store |
|Edge0021 | real existing durable transport metadata/quota/same-key store; source interface remains capital typed. Reuse only with reviewed per-family types, not opaque generic JSON admission |

Core new family metadata migration reservation remains Main-only. Need not
modify source PM schema for pending writer mechanics; do need reviewed
source outcome/transport authority contract to qualify it. Any actual PM
schema/migration/owner change belongs source owner; no changes proposed as
already applied here. Rollback disables new sends, retains original IDs,
unknown/pending receipts, late-fact/status recovery and revoked permissions;
never financial reversal, TTL deletion or replaying expired human tokens.

## 6. Discriminating acceptance to define — all NOT_RUN here

Use existing approved PG/HTTP harness and one Main-coordinated affected gate;
no new runner/cell/port/DB/resource from this audit. Reuse tests only with
exact unchanged dependency impact, not sum historical codec tests as fullfamily.

| Required next-family case | What it discriminates |
|---|---|
| Actual pending recall→APPLY_PENDING partial/full→CANCEL_REMAINING→reload | Real owning cumulative partition, original/latest receipt refs, no undo; no source business action on GET |
| Current REPORT-only reader / mutation grant without audit / independently authorized new manager | Submit vs read separated; no creator-only status or expired submit token as read expiry |
| Wrong original command/recipient pair/currency/authority/env; source/destination alias/CAS; false source capability | No key/route selector authority, no first-match deployment, no wrong-parent progress |
| Two concurrent submits / restart after durable SENDING / source commit before lost response | One send/effect, UNKNOWN, same control key status-only recovery; no retry under new key |
| Conflicting immutable intent/client key; preserved source key/route reference | Distinct PM normalized digest / Portal semantic hash / byte digest, no silent retarget |
| App DENY/ancestor revoke/source membership revoke/session or source lease expiry before intake/after prepare/before source COMMIT | Actual fences hold; no TEST_ONLY booleans count as native provider |
| Authorized corrupt/missing/raw-loader errors and revoked source audit after read | Metadata auth before private decode, SAME final body/error Core/source clock fences; uniformly safe errors |
| Source unavailable/missing receipt/expired retention | UNKNOWN/unavailable, never zero/no-effect; no blind new send or dropped accepted obligations |
| Real source PREVIEW rollback | No registry/budget/recall/lock/command/event/audit writes leak from preview savepoint |
| Legacy8capital unchanged | Exact existing DTO/query/receipt behavior; controls not accepted by old capital endpoint/codec by accident |

Additional remaining-family gate bars: lock/unlock isolation/local+ancestor
restriction; reallocation three-budget exact conservation and failed-last-leg
rollback; move seven-key census/nonzero+missing3receipts/current dual rights/
late-fee old interval/cancel no economic rollback; profile whole-physical sibling
authority/topology/unknown-step/readback/claim fences + service recovery after
human revoke; bound lifecycle denial/unbound terminal/archive actual census;
RETURN genuine persistent source before/after/rollback once source writer exists.
Guide T07-01…11 and T08-02…10/13 still required per advertised family. None run,
and this audit does not close original07-001/002 or original08/source/browser.

## 7. Input SHA256 manifest

Paths prefixed PM are relative to the exact PM worktree; Edge relative to
exact Edge worktree. SHA256s are observed bytes, not runtime artifact digests.

| Input | SHA256 |
|---|---|
| Local task map registration-family/README.md |4d180098c1aedd1bf855f3f8d4728f934abe737fe403b0a2f44a1305e2d8dce3|
| Local repo AGENTS.md |5430307c303de62353a90f14ccd751e40adf9f66a6ed67377fd10c97f099827e|
| Local campaign AGENT_WORKING_RULES.md |188e443f96faa7e78b70a95f899fe7fd27045eb8fc08ff962431ea68915af51e|
| Local backend guide v1.2 |9047f765f7878f7284363bc6322ff14f3feb5fff4913cc7d4b9a328afd591985|
| Local Unified |0132a7fd2ff147bd1f3a82bf71a689ed1bde8dda81b307af150316b6f06dd12b|
| Local07README |5ac55c59af474c7922045d43cf9f22e5300df029496319e5600acaf25c700d9f|
| Local07candidate packet |edaa43ba170407799257c74ce209ab4c1868291f852872f656a927bbda5a6ad5|
| Local07handoff |74206c785ad963d9581ea0fed8ba74a83f4ef9385356cd39ab93ed438cc77075|
| Local07source alignment |82ce6e26bdb54626ac816bf104ada54b9146d12459f37bdfe6e958fad78ffee6|
| Local08README |c674422282c12a13044cdacc971099b786108bc6aae795b4c5b897e30366d16c|
| Local08handoff |d62f9db0bdab9055ae1107c847caf88726709b59c4fca17d412c771f18a7c17c|
| Local access.contract.ts |a1f19dfe94ba1c1b1fc07a8246673528cb9a8968bb1bc9aadb88e649cd47ee2c|
| Local command.service.ts |41ddeec14952ce82666e9537f942f0adbbc593590d7355bb60487086cecce810|
| Local command-trust.ts |7b58c6bb27b1b788e3e75d62c7a5db484fa4c8a7bc39474a2387b8bc48cc9559|
| Local command.store.ts |42bbbb7a86ee61a4b1d089c6c03aa56f635e79b0b99a00f59e64cb74a4c63169|
| Local command-current-authority.ts |23393f183e69f6864d991b8d7643f003d7b261e66194ec5f73d5f0fe77b840e0|
| Local pm-control-adapter.ts |2952c02b2ecb0d8a4c13ea5e730df57347cb366f45f0e20b56047f2e95d64242|
| Local pm-pending-control-adapter.ts |383ad9f8636ac8914f52a11f657cb6758b75ed420ecf247400748a65779250b9|
| Local pm-profile-adapter.ts |3e5f38bbd18adef7f66f2329a43fb73fa32bc3dc9f3fa5a2899b978cc6cd46e6|
| Local pm-reallocation-adapter.ts |eecfa68f89cb7075445342180853ef1aeac4554729a65056705af6b37fe178a9|
| Local pm-instance-registration-adapter.ts |a48b9472d08d2199f01ba4e44d5a0a17240bf13399f543e8d726942aaa5418b8|
| PM R2guide upgrade/TS_PORTFOLIO_ACCOUNT_MANAGEMENT_UPGRADE_GUIDE_v1.1 (1).md |2b3fa560be622c65747a789da3efa11a377cbeba681d1c70076c6030198794d3|
| PM TRADING_SYSTEM_UNIFIED_IMPLEMENTATION_PLAN.md, observed journal-only WIP |87aa9e9ed145e974a972fe79a688b96df218ba6cfa7179c9a9bdb2df4c6edf36|
| PM services/portfolio_management/operator_api_contract.py |757a9835089701102f8b3fa3176a305d2c8c262a72cf8cd78589d99413ad9cfc|
| PM services/portfolio_management/operator_adapters.py |ab57b9d57398f9166d358c61b2c004cbec552f2f6ce75a44c85ffddb3295943e|
| PM services/portfolio_management/operator_management.py |f0e18d47649040af67b708978b5ae07dba7faeafc65e91ac73e82525d2d956ab|
| PM services/portfolio_management/operator_session.py |52ff7a5168927d8c4794e1a8d5d82a3a36f29d20032c8bc414279a482f75f0b5|
| PM services/portfolio_management/operator_runtime.py |ad260baa12bf2f003dc06862c71faf1fcf5a15d3e4a19d3b4f2e1d41731cebc9|
| PM services/portfolio_management/binding_contract.py |1bf9848a8e37ad9324cce0959b9b8df970df6efba36f6a413c5abc57b00814a5|
| PM services/portfolio_management/binding_repository.py |cee38e2c62415043a00e8ba1b36d8e0da4747df3ef49f4ca5ceed5c00ffaa9b1|
| PM services/portfolio_management/profile_dispatch.py |7fb898537d9b733d7d57ecc4e8b5c4aa541ce8007bcbe2dd89040dd88341dce3|
| PM services/portfolio_management/profile_attempts.py |0d1c6832e43b4352744a341f388a0cd6843196f5fca40c0525b86fbc6f185d3d|
| PM services/portfolio_management/profile_recovery.py |1ae24f974becf2124aab75aca2791e650278057670d0eb7d8239d82773633631|
| PM services/portfolio_management/profile_compiler.py |7e4c6138acbc81efa2eee2c8c15cd80ac6b4a5f19c7fec7ee2d7f71ee861135c|
| PM services/portfolio_management/profile_plan.py |5ea2cbd55c4e210dc153a50935bb49fafe5976566a8dea448bfaf34cb1d844b1|
| PM services/portfolio_management/operator_intent_journal.py |6cb6fac7bb81e61dddd2d9decbb099d22c040f13a71565a253dddb06b364492b|
| PM services/portfolio_management/capital_outcome_source.py |bb2c7e0d2c242741a592d87193cc07ab79da79484c8e5d2e2f5ed72e911777f9|
| PM services/portfolio_management/edge_command_handoff.py |9736b858537ce726f8e1b511fc8980cb7e29fd72bb3fae6d107ef6e118ec9b1e|
| PM services/portfolio_management/edge_command_handler.py |957755dec22461377db219e3522f97f76b33e0bab7f2dd51c201b672cf0fec2d|
| PM services/portfolio_management/durable_economics_contract.py |bb2a4d0b62ac8e12b5459b4d18f986caf9f9b51382d19c3392747c4e7797f88b|
| PM services/portfolio_management/instance_contract.py |6effd65e8029c11397bbfc155598c2c6093e3955395a7d6207577b390b4c0ea5|
| PM services/portfolio_management/instance_repository.py |16fac06f8253c84e7a67729bd245681f7d5717744853bd440f87e080fb936f74|
| PM services/portfolio_management/membership_contract.py |4217d65f364186b45a83da49b76a3d05fadae2a7d05c66fcef5e947ad94328f6|
| PM services/portfolio_management/read_policy.py |86e903b337e7f28024ac548b2763f41e435ae55bce56cdb7c9a4387c7852251e|
| PM services/portal_execution_owner/identity/human.py |9c1f2929e09d65fac5fd65ade31c8fe1b6e874aa6190a2351255213570bb0932|
| PM services/risk_pool/capital_repository.py |a935a0e59b0b388b841a1efb9b94e8d1a22dd42e2192443e4dcf840c523d47f6|
| PM services/risk_pool/recall_repository.py |8c62e73045f7c39483d69ddeff439b747b724970986db91e204005e1d95750e3|
| PM services/risk_pool/lock_reallocation_repository.py |698d638dce94b28695c1fcb3751cd0e7efb9ad5eaa214d2e870e2ddc95810075|
| PM services/risk_pool/admission_repository.py |d868fec52e9a4c49ec45990118d3d9c6feb9ad664a96932e1a8160ee6fc25817|
| PM contracts/baseline/portfolio-account-v1_1/pma11-06-binding-candidate.sql |15331b2cebd6f32cecc1ffab7e7bf02e94b9ececfbd3a67722dcfc0417c35b7a|
| PM same directory pma11-08-recall-candidate.sql |bb3a8606651d58ffd72c6532f16dce07b38ffc903dbcf56e40aba382fabfce40|
| PM same directory pma11-09-lock-reallocation-candidate.sql |1938f4119eaec36b5ce783d686f06c16d5dcf9417fcdb133fd4de2fcbcb5edaf|
| PM same directory pma11-10-admission-candidate.sql |f2db47bd0bd855d582ebfbcab761ab7cc4037c0c463823477d30957fa07429eb|
| PM same directory pma11-14-operator-candidate.sql |99b6c3b670a5b75636f9a39b52596324a05a9ea174a3d5c35cdc4c7545b5e9b4|
| PM same directory pma11-14-management-manifest.json |1e6b5443472d63e3b59de820dc20983da149a6dc897c9201038a95d54cdedd57|
| PM same directory pma11-14-operator-adapter-manifest.json |feeadaf3741ea89ed5441bd8809c3df3197d6c549cc06e5f701d22ab77da6cd1|
| PM same directory pma11-14-edge-command-handoff.json |7b62d7e17198347c85adc5267a319a175733adc2cb3b540d167a35135ed04a0b|
| Edge AGENTS.md |655e2b92bbe80511babc75a5f3704f60584e3157ea82bc9bd3f011b26a713b48|
| Edge upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md |6d92e193177de022797e0539db149ffce0e1e641581030affaad75dca8c59721|
| Edge upgrade/evidence/execution-edge-v1_2/EPG10-07/COMMAND_RELAY_AND_OWNER_RETURN.md |9d15ea50deca0463e1f66d59e1a1c9c6d68a4aca7ecdca62256ccacc773d9a22|
| Edge same packet command-activation-matrix.json |486986a42ed21acb18d2a3ce52c3326b99a8e358f8c6d6c1b9adede460abe03b|
| Edge services/portal-execution-edge-rs/crates/command-relay/src/durable.rs |14e0d7db36646baed615ed0db86c6f28c6e2c6fa2d694d79f1a9f2212ceb24b4|
| Edge same crate pm_source.rs |af7da0b9f6447e4a1b9745521c1e6e1dde66caa46bcd6c4bab140e8ac0b93367|
| Edge same crate authority.rs |f8a3dcaf7620d83b0a6a2e9c19ddb99ac7aec0c9e8d5713410ce37ccf0f2a8ad|
| Edge services/portal-execution-edge-rs/crates/projection-store-pg/src/command.rs |462f0329d9249b121310ddf0304efc47088c80e4a75247dac2baf84bb9b6fe42|
| Edge same crate migrations/0021_command_relay.sql |c23b51dcbfed89ca0f476a525cad6267ba25ad9a363921d745834c43ded83b1c|

## 8. Disposition / handoff

SOURCE_CONFIRMED: exact writers, source grammar/policy/target/transaction and
bounded status/recovery seams above. HISTORICAL_EVIDENCE: own07candidate packet
codec results and PM/Edge isolated receipts, read not rerun; no totals added.
RUNTIME_VERIFIED by this task: **none**. Actual installed command router,
provider/authenticated authority, loaded policy/trust, deployed schema,
retention and before/after/native/source-connected receipt: **NOT_OBSERVED**.
No statement that all source providers are nonexistent; missing commissioning
of this exact command family is distinct from completed READ components.

Next concrete Main action: finish/apply/validate current registration family
after its own freeze clears; then freeze pending-control exact authority and
trusted result contract and implement all five steps `4.1 together. Register
remaining distinctions against existing original07-002/07-001 and08 gate matrix,
not a duplicate debt queue/new phase. Source owner receives narrowly scoped
controls/full-outcome/command transport requirements, not a demand to redo
existing original-intent journal/human bridge. Source-required changes and
runtime target approval are separate from independently runnable Portal code.

Validation `NOT_RUN` by assignment. No services/containers/keys/artifacts/processes
created; cleanup `NO_ACTION_NEEDED`. Report rollback is private-document removal
only; source/business data never changed.

## 9. Requested registration six-pin repin — exact59ea and later observed HEAD

Main's follow-up specifically requested comparison of the six literals in
private `instance-registration.trust.ts:20–30`, not a clean-tree inference.
Read input SHA256:
`8d3949bfc05dce070b53c6b292c600b15cb01b9c80d9ce478dff6e2308c4e200`.
Its semantic/source commit literal remains
`6f3c852bd61fcc45d7aadacafe2776cbbb0059b7`.

For **each** path, read-only `git show <commit>:<path> | sha256sum` compared
that original commit with the requested
`59ea9aa3a25595300dda29f02c5d384b1c088dc4`; `sha256sum <path>` independently
checked the live worktree. During this follow-up PM had already advanced to
`39aaa9c6f02077246abc9480a907455ece06f62b`, observed identically at call start
and end. Source reads completed before clock observation12:01:28UTC.

All paths below are under PM `services/portfolio_management/`:

| File / private literal | SHA256 at6f3c852 **and**59ea9aa **and** observed39aaa worktree | Disposition |
|---|---|---|
| `operator_adapters.py` / `operator_adapters` | `ab57b9d57398f9166d358c61b2c004cbec552f2f6ce75a44c85ffddb3295943e` | COMPATIBLE: identical reviewed bytes; not changed |
| `operator_management.py` / `operator_management` | `f0e18d47649040af67b708978b5ae07dba7faeafc65e91ac73e82525d2d956ab` | COMPATIBLE: identical reviewed bytes; not changed |
| `operator_session.py` / `operator_session` | `52ff7a5168927d8c4794e1a8d5d82a3a36f29d20032c8bc414279a482f75f0b5` | COMPATIBLE: identical reviewed bytes; not changed |
| `instance_repository.py` / `instance_repository` | `16fac06f8253c84e7a67729bd245681f7d5717744853bd440f87e080fb936f74` | COMPATIBLE: identical reviewed bytes; not changed |
| `operator_wire.py` / `operator_wire` | `3bfa1f6246224ae21da29668685835806112afa98d4893dd45a4c63b32b58fb9` | COMPATIBLE: identical reviewed bytes; not changed |
| `portal_human_candidate.py` / `portal_human_candidate` | `7352c1fb462d70731539f29e2ff1ae3f5cb2f8be95b5bb01a6da91e3d1be3418` | COMPATIBLE: identical reviewed bytes; not changed |

Exact six-path binary diff6f3c852→59ea9aa is empty, SHA256
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
59ea9aa→39aaa9c changes only tracked
`TRADING_SYSTEM_UNIFIED_IMPLEMENTATION_PLAN.md` and
`contracts/baseline/portfolio-account-v1_1/pma11-two-host-cleanup-evidence.json`;
that complete committed binary diff SHA256 is
`152907784fdc4cb0f1efa6fef3f41d2a0608ab0bf2475001423b9b2fef7279f6`.
Thus no tracked production source change occurs in that later commit range.
No cleanup receipt was executed or adopted here as command authority.

The later worktree is **not clean**, independently of those six matching pins:

- ` M TRADING_SYSTEM_UNIFIED_IMPLEMENTATION_PLAN.md`, SHA256
  `08590d19420fd5460605d8f79cc0cc51799811d8f70442f26e2502020f5ab793`.
- ` M scripts/pma11_pg_process_target.py`, SHA256
  `5c43cdbc2124409d0129538777f76295299c7439a93305c9a026222f9c07bed4`.
- `?? scripts/pma11_revision_concurrency_probe.py`, SHA256
  `864147d932d658b72b45fc7dec0d857ab3ea973c81d1ba7026af55980675a9bb`.

Full unstaged binary diff SHA256
`5ad0e521328eea2701217c64127c2010f1818065ab05ab8e6e75c0910ddf50a5`;
cached diff empty; untracked-name digest
`864b69695b9dd5dd8db699b33fcd978a444ea1a71cac8bacb334c93d1d7c316e`;
porcelain digest
`22e3609b02cb33cd4622cb79cebf43c9b1d0ff11873ac3f3e0a37491dd377a3e`.
Only metadata/source hashes read; neither script nor any process/test was run.

Conclusion: **six-file registration source compatibility CONFIRMED by bytes**
for the requested59ea commit and observed39aaa worktree. This is bounded to
those exact reviewed files, not automatic dependency/provider qualification.
The private strict `commit` literal still denotes6f3c852; this audit does not
edit it, relabel59ea/39aaa as that commit, or install a provider. Main must keep
source-version acceptance and selected-provider/current authority commissioning
explicit. Historical receipts/source pins remain immutable; no TEST_ONLY frame
becomes native-installed authority. All implementation/test/runtime verdicts
in this report remain **SOURCE_ONLY / NOT_RUN**.
