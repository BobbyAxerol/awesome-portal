# ELP2-07 — source command, trust and status alignment

Observation window: **2026-10-16 08:39:50–08:42:49 UTC**. Read-only SSH to
`bobby@16.163.212.33`; source/metadata inspection only. Portal entry is
`docs/research-loop-plan@42c390796f4bd2a7de151313944b41f1245bdbc2`.
This subtask owns only this document. No remote edits, tests/builds, business DB
queries, source API calls, credentials, service/runtime inspection, changes to
branches, activation, command dispatch or deployment were performed.
Observations across worktrees are not one atomic runtime pin.

## 1. Current worktrees and artifact identity

Paths below are relative to `/home/bobby/.worktrees/` on HK.

| Track / worktree | Branch | Full source SHA | Working state |
| --- | --- | --- | --- |
| TS `trading-system-next-upgrade` | `feat/v2-rust-first-okx-demo` | `471ff37c12f02e4989089d16f5dfd048723a0d6e` | Four modified market-data-writer Rust/test paths; one untracked non-authoritative PM guide copy |
| PM `trading-system-pm-v1_1` | `feat/portfolio-account-v1_1-parallel` | `d16aa2b5f251596e469807f57e81fe14cdc7e763` | Clean; unchanged since ELP2-06 |
| DL `data-layer-p184-closure` | `fix/p184-dl-closure` | `68556d40a8ef71420f3d65ba850796ea5fe68887` | Clean |
| Edge `portal-execution-edge-upgrade-v1_2` | `feat/execution-edge-upgrade-v1_2` | `f762730f8751cdcdb6edc846da207115e4507d1a` | Clean at entry and final08:42:49Z |

SHA256 methods: unstaged=`git diff --no-ext-diff`; staged=`git diff --cached
--no-ext-diff`; untracked path list=`git ls-files --others --exclude-standard`
(ordinary Git quoted path output, with newline). Empty-output hash is
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
All staged diffs were empty. PM/DL/Edge unstaged and untracked-list hashes were
empty. TS unstaged hash:
`e00df2ed4fbd43a5c81f9f5cdf0eaab0a940518a4acf12fd54a3c2f798f9f671`;
TS untracked-list hash:
`b5b9433a17437c5e4c2525c2e29d67e64e957ce91ef34b94f56ad0a17f7eaae2`.
TS dirty paths are `rust/crates/market-data-writer/src/{health,session}.rs`
and `rust/crates/market-data-writer/tests/{health,session}.rs`. The untracked
`upgrade/TS_PORTFOLIO_ACCOUNT_MANAGEMENT_UPGRADE_GUIDE_v1.1 (1).md` is not the
authoritative PM R2 guide; use the separate PM worktree below. No peer WIP was
changed or imported.

### Guide and journal pins

| Worktree / relative path | SHA256 |
| --- | --- |
| PM `upgrade/TS_PORTFOLIO_ACCOUNT_MANAGEMENT_UPGRADE_GUIDE_v1.1 (1).md` | `7d79d8de84eab19d0d2de3dce2b4c9278a691277b0b8b4379a7db0000dfc8945` |
| PM `TRADING_SYSTEM_UNIFIED_IMPLEMENTATION_PLAN.md` | `96ee825d90a33f3cab614b8c7053408fc34b6ae965db867e6efc33ef769735fd` |
| TS `TRADING_SYSTEM_UNIFIED_IMPLEMENTATION_PLAN.md` | `75d9c80350050dcaa9e2efc999029d25dea98c3c3762dc00eeff8a3a80708e79` |
| DL `DATA_LAYER_UNIFIED_IMPLEMENTATION_PLAN.md` | `e10b8268813c0cd7ced8403157610ac76f737048a4d4e78f1fc709521ab1cb1c` |
| Edge `upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md` | `3152e638354a6093121b9afc17ca6b32f5d411472d2e5ca9f7430864b25a6169` |
| Edge `upgrade/upgrade_v1.2/EXECUTION_PORTAL_EDGE_UPGRADE_GUIDE_v1.2_VI.md` | `af6d53725d58aca4dfefb0fb212272c2df281b7d605a1f7bca5e54ced9b2eeb0` |

The initial Edge guide lookup without its `upgrade/` prefix found no file;
the correct source path was resolved above, not substituted with an older copy.
PM guide remains OWNER_APPROVED_DESIGN_R2. Root/portfolio/deployment-account,
economic backing, margin/risk budget and exposure cap remain separate; no
universal1× cap, native-transfer inference or new ledger is approved here.

## 2. Source changes since ELP2-06

Edge EPG10-06 is now committed at `f762730f...`. Its receipt
`upgrade/evidence/execution-edge-v1_2/EPG10-06/verification.json`, SHA256
`314fd5514c34e31d5aceaee1bd6a90d1424fd4e1e3a90f5a0867e07dfa22d910`,
reports **317 isolated automated PASS**, not tests run by this Portal subtask.
Phase exit remains NOT_MET, activation false, source_requests0. It closes
the isolated changed-key/A→B→A Manager path and bounded admission work; it does
not qualify command transport, trusted production providers, connected capacity
or financial ownership. Do not count its formal families as additional tests.

**Edge EPG10-07 is still PLANNED / NOT_STARTED / AWAITING_BOBBY_APPROVAL** in
the journal at10058–10105; tests NOT_RUN, runtime activation NOT_AUTHORIZED.
The producer-generation fence and selected publication/trust gates recorded
in ELP2-05/06 remain separate existing dependencies. No EPG10-07 receipt
directory was found in the current evidence tree. Portal ELP2-07 assignment
does not approve edits to, or activate, that Edge phase.

The latest observed PM journal §58.63 still keeps15/16 IN_PROGRESS. It reports
isolated complete egress-registration checks; qualified provider/native sender,
positive staging/readback, Paper effects/multi-step transitions, reviewed
historical input, export/full-source/applied checkpoint and full-workload/SLO
remain unfinished or external qualification gates. Source implementation and
isolated proof are not a deployed all-operation service.

## 3. Exact PM capital/control contract available in source

Read directly in PM `services/portfolio_management/`:

| Locator | SOURCE_CONFIRMED semantics |
| --- | --- |
| `operator_api_contract.py:30–42,104–153` | Closed `pma.capital-command.v1.1` fields; recipient/currency/environment and exact deployment-account pair; FUND requires source_ref; amount string normalized for source identity; source-owned recipient resolution and authority scope are included in canonical digest |
| `operator_adapters.py:23–45,48–78,129–170` | Candidate dispatch supports CAPITAL minus RETURN_CAPITAL, plus five operator-control operations; exact revision-key sets; wire revisions are unsigned decimal strings converted to source ints0…2^63−1; closed `pma.operator-control.v1` schema |
| `operator_adapters.py:164–213` | Current target/source/workload/human and capability checks precede owning writer; existing same intent checks source digest, requester and target; preview rolls back a DB-only savepoint; replay does not manufacture an effect |
| `operator_api_contract.py:173–277` | Requested=applied+pending+cancelled+rejected at Decimal precision80; owning before/after/source/policy/binding/version receipt, amount/state consistency; APPLIED not inferred from delivery; physical_transfer_performed=false |
| `operator_adapters.py:216–241` | Status reauthorizes current REPORT capability on exact scopes before receipt lookup; same authority/operation/key and target; recall status may return latest owning revision plus original receipt link; missing receipt returns UNKNOWN/business_applied=null/QUERY_SAME_INTENT |

Available **candidate implementation**, not an activation matrix:

- Capital: `FUND`, `INITIAL_GRANT`, `TOP_UP`, `SET_ROOT_LIMIT`,
  `IMMEDIATE_DECREASE`, `RECALL_PARTIAL`, `RECALL_FULL`,
  `ADJUST_TARGET_BUDGET`.
- Control: `ADMIN_LOCK`, `ADMIN_UNLOCK`, `REALLOCATE_BUDGET`,
  `APPLY_PENDING`, `CANCEL_REMAINING`.
- `RETURN_CAPITAL` is recognized by the capital parser and status vocabulary
  but explicitly excluded from dispatch. Its candidate manifest records
  `PM-G07-SEED-RETURN`, missing owning economic/free-cash/backing/profit-return
  integration; no synthetic adjustment or fallback is valid.
- `SET_ROOT_LIMIT` acts on ROOT; it does not FUND economic cash. FUND and
  budget grant/recall remain different owning paths and receipt dimensions.
- Profile source operations SET_LEVERAGE/SET_MARGIN_MODE/SET_POSITION_MODE/
  SET_ACCOUNT_MODE use `pma.profile-command.v1` on PREVIEW/PREPARE/RECONCILE/
  STATUS. PREPARE persists desired/guard only; do not call it broker APPLIED.
- `operator_management.py:23–44` additionally composes existing membership,
  owner, registry/lifecycle/alias, binding/revision/move/cancel-move and trading
  state operations. These use separate owning schemas/receipts; they are not
  extra capital operation enum aliases.

Operation-specific capital/control revision sets, not a universal CAS map:

| Operation | Exact expected_versions keys |
| --- | --- |
| FUND | budget,source,claim |
| SET_ROOT_LIMIT / ADMIN_LOCK | budget,source |
| INITIAL_GRANT / TOP_UP | budget,source,parent |
| IMMEDIATE_DECREASE / RECALL_PARTIAL / RECALL_FULL / ADJUST_TARGET_BUDGET | budget,source,parent,book |
| ADMIN_UNLOCK | budget,source,lock |
| REALLOCATE_BUDGET | budget,source,book,source_budget,source_book,target_budget,target_book |
| APPLY_PENDING / CANCEL_REMAINING | budget,source,parent,book,command |

### Canonical digest boundary — do not confuse Portal correlation with PM identity

`capital_contract.py:272–274` uses SHA256 of Python
`json.dumps(payload,sort_keys=True,separators=(',',':'),allow_nan=False).encode()`.
Default `ensure_ascii=True` escapes non-ASCII; ints support the source counter
range without JavaScript Number precision loss. `operator_api_contract.py:141–153`
first normalizes amount/trailing zeros and sorts versions, then hashes:
`{payload:normalized,resolved_recipient:asdict(recipient),authority_scope_id}`.
Recipient includes the exact CapitalScope/source/pool/model/profile/generation
and canonical target. `operator_adapters.py:75` uses a distinct control wrapper:
`{payload:normalized,recipient:asdict(target),authority}`.

Portal may compute its own immutable wire-intent digest for correlation, clearly
named as such, but cannot claim it equals the source PM canonical digest before
server-owned resolution. Preserve PM business payload semantics; never inject
caller human/workload assertions into that business document, convert revision
strings to lossy JSON numbers, or substitute approval delivery hash for source
business receipt identity. Source normalized digest remains separate in status.

## 4. Human/workload trust and commit boundary

- `services/portal_execution_owner/identity/human.py:26–111`: pinned issuer,
  key_id/public JWK, exact audience, EdDSA and no unknown critical header;
  principal_kind=human, pinned purpose/environment/workspace, iat/nbf/exp/jti,
  session ID/revision and authority revision. Lifetime1…60seconds. Token
  verification authenticates identity, not business capability.
- Same file117–175: **no production provider installed**. Current human lease
  must fence application/session/token revocation through owning transaction
  COMMIT; current identity and TS active status are locked/rechecked. Post-commit
  ACK/pool/lease-release ambiguity returns uncertain, not false rollback.
- `operator_session.py:17–41,59–82`: current workload access binds exact human
  issuer/subject/environment/workspace, active workload/delegation refs,
  audience `pma.management.v1`,1…1024 same-environment scopes. BOTH human and
  workload leases enclose the identity transaction through COMMIT. No cached
  boolean or body/header-authenticated actor replaces the provider lease.
- `operator_api_contract.py:56–68,156–170`: current TS membership issuer/subject
  must match verified human; server workload scopes contain exact target scopes;
  current TS capabilities and expected versions still apply at owning commit.
- `operator_runtime.py:46–76`: explicit same repository graph and provider
  interfaces/bounds, **unmounted factory**, no default authority or provider I/O
  at construction. Profile routes still prepare/reconcile; no native dispatch.

Candidate route prefix is `/internal/pma11-candidate`:
capital preview/apply/status; reports read; profile preview/prepare/reconcile/
status; management preview/apply/status. Current factory has11routes; older
PMA11-14 adapter manifest lists the earlier8-route subset and explicitly is
ISOLATED_HTTP_PG_TESTS_WITH_SYNTHETIC_TRUST_AND_SOURCE_ADAPTERS,
production_mounted=false, cli_installed=false. Do not treat that older manifest
as evidence the three newer management routes are absent or commissioned.

`operator_adapters.py:366–427` bounds semaphore/timeout/body/response and duplicate
JSON keys. It emits successful JSON **after** session context exit; commit/lease
uncertainty503 carries UNKNOWN/business_applied=null/QUERY_SAME_INTENT. Request
and response caps/timeout/concurrency are explicit configuration; manifest's
test-only10kB/5s/2handlers are not production capacity configuration.

## 5. Edge relay and receipt/retention readiness

Edge source paths below are under `services/portal-execution-edge-rs/`.

- `crates/command-relay/src/lib.rs:29–62`: `RelayPolicy::authorize` always
  returns DENIED/COMMAND_RELAY_DISABLED/retry_allowed=false/source_request_sent=false.
  No network client or TS authority is granted by this crate.
- Same file113–328: pure published-capability checks and exact delegated
  operation/environment/target/hash/version/expiry/step-up/dual-approval checks
  exist, but require owner-published+Portal-reachable capability and independent
  feature/kill-switch approval. Success is still pre-dispatch, not TS receipt.
- Same file332–410,442–481,488–627: process-local HashMap journal and
  snapshot/restore codec distinguish PREPARED/DISPATCHED/ACCEPTED/ACKNOWLEDGED/
  terminal/UNCERTAIN.202 and ACK do not imply APPLIED; uncertain cannot blindly
  retry; same key/different digest or target conflicts. JSON snapshot ability is
  **not a durable journal transaction, installed status endpoint or retention SLA**.
- `crates/command-relay/src/current_primitive.rs:1–6,200–249`: historical N16B
  protective compatibility acceptance remains transport/source-call/live-mutation
  inactive; read identity is forbidden. Existing emergency-close source primitive
  is not PM capital authority and cannot activate generic relay by analogy.
- `crates/edge-auth/src/lib.rs:91–111` verifies R0 read assertions. Do not reuse
  a read token's identity/scope as human command delegation. `edge-service/src/
  main.rs:838` loads protective compatibility; source scan did not find an EPG10-07
  mounted command dispatch/status adapter in the current service/query crates.

PM candidate `contracts/baseline/portfolio-account-v1_1/
pma11-14-operator-candidate.sql` is an immutable request→owning-receipt linkage:
FK to pm_capital.commands, PK authority/operation/key, update/delete protected
by preserve_history trigger. It is not another ledger. Source confirms retention
preservation, but no qualified end-to-end ambiguity retention duration, current
Portal→Edge→TS status route or production cleanup policy was supplied by these
sources. Do not invent a TTL that drops pending/unknown intents or accepted
obligations. Pending recall status must retain original and current receipts.

## 6. Source file and receipt pins

| Worktree / relative source path | SHA256 |
| --- | --- |
| PM `services/portfolio_management/operator_api_contract.py` | `20a8fb316ca8441dc46659416db58d5dee45c46218b4b84c71077293636c46f2` |
| PM `services/portfolio_management/operator_adapters.py` | `71254a25adb9a91b0211dfb4bc3644877caa57e219dc8d7294a4612213659f18` |
| PM `services/portfolio_management/operator_session.py` | `134cda3743f5e42fcf5526bb05eebc0f3fc081861c1f763815f50ba95831a148` |
| PM `services/portfolio_management/operator_runtime.py` | `a8231a07c8acb780e933608845e0e93307642737ffe80a3db8b9899c7ffb9a5e` |
| PM `services/portfolio_management/operator_management.py` | `06540b3749495c24cecf15ad10abd1666459f3a5df730c5544e4640707f3e2a1` |
| PM `services/portfolio_management/capital_contract.py` | `7826e07189e7c30c4624205b9168ab02783667dfb3cfe038fb79298aa3573ef0` |
| PM `services/portal_execution_owner/identity/human.py` | `abea7c04ba789226b8c0f069b7243014cbb0262e3f7a0f058350731b1343f01c` |
| PM `contracts/baseline/portfolio-account-v1_1/pma11-14-operator-candidate.sql` | `99b6c3b670a5b75636f9a39b52596324a05a9ea174a3d5c35cdc4c7545b5e9b4` |
| PM same directory `pma11-14-operator-adapter-manifest.json` | `cb2b5a70c3840c444ac7713055d18f7dd2793db576389e8be4e80e6e22bd2cb2` |
| PM same directory `pma11-16-composition-evidence.json` | `f8014bed6073ab07484ddd4b0b3885c7d329956f5cdf00d9aa9672c8be1e3779` |
| PM same directory `pma11-16-egress-registration-evidence.json` | `d49c35b51879eb7e70cfcc0027cdf6de4d0b48ff6781546df150b822211d2b84` |
| Edge `crates/command-relay/src/lib.rs` | `b7132db6e9fa6413ec7f94e515eec64b1261800b4be3f97c598568c391cda578` |
| Edge `crates/command-relay/src/current_primitive.rs` | `3ede19f3d9643eda9a40e6f9352faef03802a372924709fa857acaeb0015b113` |
| Edge `crates/edge-auth/src/lib.rs` | `b8485d326c1d7c81e21bde01f5931668348895a3080bcdcabc316f597587a343` |
| Edge `crates/ts-transport/src/lib.rs` | `5aed3c999dd8bc3ea92f61326add392d5f1c7fce59dc7e22ea910311c2bbfee7` |
| Edge `crates/edge-service/src/main.rs` | `ecb2ce7c33261f7e89610c4e5765d7f1313a1726725cae30f70f82f1c90bbb2c` |

Historical receipt read, not rerun: PM composition evidence says
TESTED_LOCALLY_UNMOUNTED with real crypto/ASGI and controlled authority/storage;
197pytest+25preflight PASS. Its old runtime inventory is reported evidence, not
current service observation. PM egress registration and Edge06 receipts likewise
do not certify Portal callers or live financial effects. No test count is added
to ELP2-07 merely by reading a producer receipt.

## 7. Verdict, scope and next dependency

**SOURCE_CONFIRMED:** current source heads/dirty states, pinned PM R2; strict PM
payloads/operation CAS/normalized digest; immutable owning receipt/status code;
current human+workload lease contracts and unmounted graph; existing Edge relay
denial plus pure in-memory ambiguity handling. This is enough for the assigned
Portal local contract/durable correlation/status-machine implementation and
source-dark negative/isolated DB proofs.

**HISTORICAL_EVIDENCE:** external PM/Edge isolated receipts above, not a live
source-connected command receipt. **RUNTIME_VERIFIED:** none in this subtask.
Actual deployed digest/schema/effective profile/trust provider/mTLS/command
publication, active operation×environment matrix and source financial population
remain NOT_OBSERVED; no source API, business DB or credentials were inspected.

**NOT_READY for command activation:** Edge07 durable relay/status/retention
implementation and exact selected PM runtime provider/operation qualification;
source commit rechecks and source financial before/after correlated receipts;
actual human/workload revocation integration; exact operation×environment approval
and applicable trading-flow certification. ELP2-07 M/full connected exit remains
blocked on those concrete gates, not on every unrelated score or UI phase.
Source unavailability must direct-API reject; full-business read is no mutation.

No new duplicate debt ID is minted here: primary links existing trust/publication
IDs and07-specific implementation dependencies in the phase canonical ledger.
Claude UXM-09 may later use published synthetic confirmation/receipt/unknown/
disabled fixtures when assigned, not advertise command-ready from them.
Rollback for this subtask is document-only; resource cleanup **NO_ACTION_NEEDED**
(no processes/services/containers/volumes/keys/artifacts created). Tests run:none;
no capacity, source-connected or browser acceptance claim. No08 phase is opened.
