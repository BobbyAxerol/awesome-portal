# TS/PM → Execution Portal Edge → Portal Core: single owner request

22October2026. **OWNER_REQUESTED / RESPONSE_REQUIRED / NO_RUNTIME_CHANGE.**
Coordinator and return owner: Execution Portal Edge. PM is a component of the
TS upgrade, not a separate product/client integration. This request consolidates
current needs; it does not create phases, a second data plane or new permissions.
[Edge Unified](../../../EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#tspmedge-single-core-coordination-request-22oct2026),
[EPG10-08 guide](../../../upgrade_v1.2/EXECUTION_PORTAL_EDGE_UPGRADE_GUIDE_v1.2_VI.md#epg10-08-hoàn-thiện-revocation-scope-và-tls).

## 1. One counterpart, no circular handoff

Core sends requests/returns to **Edge**, and Edge coordinates TS/PM/PKI/target
owners and returns one accepted versioned pack. Do not send Bobby back and
forth between agents. Core5f8de2ca's single-counterpart directive agrees.

Business data path: Core → existing Edge Manager routes → SourceProxy → TS
Manager/source. Native28446 is the separate authority/custody qualification
side-leg, not a financial row API. Existing Core human/session/held-lease
protocol remains explicit; no direct Core→PM SQL/business-data adapter, raw
Redis or second ledger. Rust retains Edge compatibility/projection authority;
Core retains Portal human/app/field policy; TS/PM retain economic/business truth.

Core MUST ACK this request in its next working response and identify its
coordinator and next UTC checkpoint. Then complete all runnable Core-owned
parts, returning available rows immediately rather than waiting for unrelated
inputs. One return file accumulates progress with dated append-only sections.
Every row below MUST receive a real answer. Silence, generic BLOCKED, a stale
link or merely forwarding the question to PM is not an accepted return.
READY must have evidence; genuine external dependency must have exact owner,
missing input, action and next checkpoint. Never invent a receipt to satisfy
this requirement. Edge tracks the reply/checkpoint; delivery alone is not closure.

## 2. Latest source facts Core must consume, not re-request

HK Edge checkout `/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2`,
branch `feat/execution-edge-upgrade-v1_2`, entry `fe3da43f50545783be47b6ddb8940d1469616c42`.
HK TS canonical `/home/bobby/trading_system`, `668e10320c0b`; parallel release
worktree `/home/bobby/.worktrees/ts-pe1-v206rc9`, `c4553ff4` at inspection.
HK PM `/home/bobby/.worktrees/trading-system-pm-v1_1`, branch
`feat/portfolio-account-v1_1-parallel`, **`73c33a397991f765fba1379d9d0abe1f4dc64c89`**.
These are source pins, not deployment identities. Do not checkout or edit peers.

PM main plan `TRADING_SYSTEM_UNIFIED_IMPLEMENTATION_PLAN.md` §§58.337–338,
guide `upgrade/TS_PORTFOLIO_ACCOUNT_MANAGEMENT_UPGRADE_GUIDE_v1.1 (1).md`
PMA11-03/04/13–16, and runbook `upgrade/PMA11_GENERATION_SCHEMA_MIGRATION_RUNBOOK.md`
are read-only source references under that HK PM root:

| Current PM evidence / raw SHA256 | Actual scope, NOT financial commissioning |
| --- | --- |
| `contracts/baseline/portfolio-account-v1_1/pma11-shared-db-expansion-evidence.json`; `4434db7f33237307c1d88143d8fe76d6004d874c75b0a31c875e67183784f815` | Shared `live_data_executor` union ledger128,74/74relations, reapply0, generation head0. Existing data/ACL/native preserved; online reload, no DB restart |
| `contracts/baseline/portfolio-account-v1_1/pma11-ts-release-evidence.json`; `88f3ed870b31affbaf14da7bf6be35cc4364552b5f5d842d110230969afa3ac6` | Release entrypoint/128-bundle/native-generation source,87distinct impact PASS; actual candidate preflight/reapply0. NOT built/published/deployed final image |
| `contracts/baseline/portfolio-account-v1_1/pma11-13-14-16-portal-owner-intake.json`; `3e29f0395e3b07f885baecf3a0c0057367d3111359de34382af37fe904c8c407` | Existing source economic identity/disjoint-leaf/conflict rules; not current grants or accepted Portal wire mapping |
| Runbook raw `482ec40020669ca871d8cd2bbe78511a3c76dfe396b1ab41c367ad88e5d488d2` | Original union runner/checksum/advisory path and exact rollback; old TS-only runner must not be used against128ledger |

Independent reviewed whole installed-authority artifact already exists:
`/home/bobby/.local/state/trading-system/pma11-db-expansion-20261022/reviewed-authority.json`,
SHA `6cda80508a155f5084f7bd6cb1fffef434732099db10719003789b7a0f53a9ab`.
It is compatibility metadata, **not a financial grant/lease**. Do not request
schema creation, a replacement runner, another generic ACL baseline or fresh
identity accounts to solve these now-closed prerequisites.

Existing PM composition is not missing source implementation. Read under PM:
`services/portfolio_management/{operator_authority_binding,current_access_source,read_authority,operator_runtime,operator_session,operator_api_contract,read_policy}.py`.
`bind_operator_authority` composes existing current providers; `AcceptedCurrentAccess`
binds accepted workload/app/field policies; `CurrentReadAuthority` requires the
owning request/connection/transaction. Existing audience is `pma.management.v1`;
operations READ/HISTORY/EXPORT/STREAM remain distinct. Report/receipt permission
does not imply dataset `source_access_for`, financial mutations or STREAM.

## 3. One response matrix — Core-owned outputs and exact counterpart split

These IDs are request rows, **not new phases**. Existing source/connected
approvals and exact runtime blast-radius requirements remain unchanged.

| ID / priority | Core MUST provide or complete | Edge / TS-PM still own; not delegated to Core |
| --- | --- | --- |
| CORE-01 / immediate | Review native missing-active-revoke PREPARED hash `b974abaf740d59f05678b5edf19e7884f080404a99fa648549b78db7a12d2d64`; return exact pin/window/sole-client ACK or explicit mismatch/new feasible slot. Return candidate/rollback source-image-config preparation and official current READ/STREAM/session references after actual Edge READY. Execute only the one missing specimen under matched authority | Edge exact source preparation/install/READY/drain/native revoke; same original custody. No repeat completed READ/restart, no implicit expiry extension |
| CORE-02 / independent | Existing Edge-facing Manager consumer configuration: real Core workload/issuer/audience/JWKS and client leaf-chain references, pinned identity/SAN/EKU/SPKI/validity, intended Paper/Sandbox/Canary/Live binding matrix. For offline client CA issuer, identify actual controlled issuer or forwarding owner and track the return; no new keypair request. State actual image/config loading and finite reconcile/rollback readiness | Edge existing8443/8444/8445 targets, accepted client trust/JWKS overlap and scoped reconcile. Issuer owns signing; native Ed25519 trust is not Manager RS256 trust. Existing JWK/CSR/inactive config already received |
| CORE-03 / first PM financial dependency | Exact current Portal human/workload/delegation/app/field acceptance for the selected PM financial operations: identity mapping refs, workspace/profile/resource scopes, policy/session revisions, purpose/audience, operation/field matrix and private verifier/mTLS/current-session refs. Return real owning human held-lease ENTER/terminal/RESOLVE/RECOVER composition and rejection/revoke/expiry semantics **through TS owning COMMIT**, not just preflight. Supply reviewed acceptance input/ACK; do not self-install TS rows | Edge transports/binds these inputs; TS/PM installs/verifies its accepted current-access source, SQL/native fences and business authority on its own target. Broad business.read_all/heartbeat and retired grants are NOT financial commissioning |
| CORE-04 / source-independent consumer work now | Return accepted Portal financial destination/contract: exact existing route or ingestion boundary, DTO/schema/version/hash, required-field→source-semantic mapping or explicit proposed/unavailable status, current auth/policy enforcement, bounded paging/error/provenance/correction handling. Reuse one accepted reducer for dataset AND series. Specify durable dedup key, atomic projection+checkpoint transaction and recovery/replay/overlap-conflict behavior. Finish runnable dark consumer/contract tests now; actual source acceptance later | Edge and TS/PM return trusted source-row IDs, economic leaves/census, original/effective ownership, valuation/currency/basis/window/cost coverage/correction and reconciled real examples. TS owns history/backfill; Edge owns delivery/projection. Core must not invent producer identities/history or claim fixture acceptance as runtime |
| CORE-05 / command, independent of read | Existing Portal→Edge operation catalogue/claims/status consumer: exact action/environment/profile/resource/target approval semantics, current human/workload verifier references, request-key/digest/expected-version/receipt mapping and loss-of-ACK/status-recovery contract. Distinguish ACCEPTED/UNKNOWN/APPLIED; state which operations are commissioned versus source-only/unavailable. Provide its human/policy held-lease interfaces and exact testable coordination input, not a claim all PM commands are enabled | TS/PM owns business handlers, current permission/native effect/fence and authenticated TS submit/status target; Edge owns Rust command port+durable ledger/binding. No direct CLI/SQL/native bypass and no command/financial/Live activation from this request |
| CORE-06 / cache/cursor controls | Return exact integrated-versus-installed P22/current-policy/cache/cursor configuration and scoped acceptance cases/runner pins. Name the genuinely authorized independent control resource/user if available; otherwise exact missing authority. Reuse actual successful STREAM/restart evidence; specify remaining current-epoch revoke/cache/cursor/SSE checks without replaying unrelated proof | Edge source/schema/cursor/revoke propagation and TS source authority. READ never supplies STREAM; another URL/session or READ-after-STREAM-revoke is not an independent economic domain/control |
| CORE-07 / measured target contribution | Core's concrete image/config/collector/query/clock/B1-B2 driver and apparatus/schema/source-population pins; resource contribution to existing14-group numeric budget; stop/restore and proposed quiet window. Return ready independent preparation now, identify actual external population/target approvals. Preserve existing D1–D7 decisions and original M5/M7 NOT_RUN evidence | Edge coordinates TS/PM/DL target/workload/SLO/numeric bounds and calibration population. C288 or2CPU/1536MiB correctness is not production capacity, G2 or calibrated financial evidence. Core does not approve TS/DL budgets by itself |

**Mode/identity invariant:** manager product direction covers all approved
modes, not Paper-only by convenience. Return readiness per mode; do not
fabricate support or execute Live trading. Reuse approved Bobby protected
OWNER/Stan MANAGER ceiling model and accepted field policy; no new accounts,
self-elevation or fresh blanket approval request. Real identity and policy
revisions, not usernames or role names alone, are the executable authority.

## 4. Current native status and no replay

At10:40UTC no matching new ACK was observed. Existing proposal
[active-revoke PREPARED](EDGE_TO_CORE_08_ACTIVE_REVOKE_PREPARED_2026-10-22.md)
is for10:30–11:00UTC/17:30–18:00VN, **UNARMED**, actual head8 revoked,
install8→9/revoke9→10 only drafts. This consolidated request does not extend
that window or repin manifests. If exact review/activation/reserve cannot fit,
return NEW viable finite availability; Edge then prepares matching pins rather
than silently renewing. Core remains sole specimen HTTP/SSE executor.

Installed Core observed source8ac/image
`sha256:a96c754dfbd52801f6d451dfa329eeeb3ab37fe9e467db145e201c9fa9acf121`,
schema149/container46c94107/restart0. Candidate mapper image
`sha256:3cb7f24af12d8228406eca9f2b800b458067bbcd1616995f51438cfa9d58d069`
exists but remains uninstalled. Canonical source `5f8de2ca865c937cdeee3791fc5ea38028a48129`
is not that installed runtime. The combined normal gate and focused repairs
are credited at their exact source scopes; no need to rerun them for this doc.
Typed SNAPSHOT_REQUIRED409, natural expiry or socket EOF is not active revoke.
Preserve exact original attempt/artifact/physical receipt/Core-source ACK.

## 5. Required single return and acceptance of the handoff

Core canonical SGP root `/home/bobby/portal-research` must return:
`upgrade/execution_loop/evidence/ELP2-10/CORE_TO_EDGE_TS_PM_CONSOLIDATED_RETURN_2026-10-22.md`.
Mirror the same public bytes/hash to HK Edge EPG10-08; link Core Unified/sync.
Do not answer a subset through scattered new requests or address PM separately.

Required header: received request SHA256, coordinator/source branch+full commit,
actual UTC, next checkpoint UTC and input/readiness changes. Required **each
CORE-01…07 row**: status (READY_SOURCE, PREPARED, READY_INSTALLED,
CONNECTED_ACCEPTED, IN_PROGRESS or NOT_READY), exact artifact/config/image/
schema/trust/contract hashes and private references as applicable; cases with
PASS/FAIL/SKIP/NOT_RUN and receipts; runnable-now work completed; exact missing
input with owner/action; next timestamp/ETA; affected modes and next executable
step; rollback/cleanup evidence. Use NOT_APPLICABLE with reason for fields
which genuinely do not apply, never placeholder hashes or copied old pins.

Core-owned implementation left unfinished is IN_PROGRESS, not external debt.
If an external input blocks a row, return that row honestly and finish other
runnable Core work. Do not hold the native case for PM finance/Manager/G2, or
hold dark consumer/contract preparation for TS history/final image. First ACK
must commit to an explicit checkpoint; a missed checkpoint needs a dated
reason and revised next action, not another generic request to Bobby.

**Edge acceptance obligation:** verify returned hashes/source-vs-installed/
identity/scopes/COMMIT and real receipt coverage, mark each row ACCEPTED or
CHANGE with reason, send one correlated reply to Core and the relevant parts
to TS/PM through this coordinator, update the original phase plans and execute
eligible approved binding/tests. A delivery receipt is not runtime acceptance.
Missing source/financial mapping/fence remains owned TS/PM work; Edge must not
return those rows to Core as if Core were their economic source of truth.

## 6. Existing evidence/index, scope and verification

On Core read current `FIXTURE_REVIEW_DATA_2026-10-22.md` follow-up and
`CORE_TO_EDGE_08_ACTIVE_REVOKE_REPAIR_RETURN_2026-10-22.md` §§6–8. Existing
`CORE009_MANAGER_FINANCIAL_BUDGET_ACTIONS_2026-10-22.md` is historical input:
use current PM73c facts above, not its old bc5a/absent-schema/source-only pins.
On Edge read [PM source rules](../EPG10-03/PM_OWNER_ACK_AND_NET_PNL_RETURN_2026-10-21.md)
and [Manager/G2 current preparation](EDGE_TO_CORE_08_MANAGER_AND_G2_READINESS_2026-10-22.md).
PM code/evidence/guide paths in §2 are on HK, relative to the declared PM root;
Edge Unified/guide relative links target the HK Edge checkout, not Core Unified.

This is backend coordination/public Markdown only: no source/secret/DSN/private
key transfer, DB/schema/role/grant/session change, image build/restart, PM peer
checkout edit, command/Live/stable/dev/provider28445 mutation or new phase.
No test resource created; preserve existing active/rollback/custody and WIP.
**Verification: R0** explicit staged Markdown/diff/indexed-link/secret/source-pin/
row-coverage and execution-tracking checks before local commit; sanitized SSH
delivery has matching byte/hash readback and preserves Core locator/index.
No new product/PG/connected tests claimed, no push/merge/CI. Full07/08/read09
and PM full03/04/13–16 remain OPEN until their actual dependent gates pass.

## 7. 23Oct two executable contracts, original08/09

**CURRENT FOLLOW-UP / OWNER_RETURN_REQUIRED / NO_RUNTIME_CHANGE.** This section
narrows existing CORE-03/04/06, not new phases or a replacement seven-row ledger.
Earlier expired windows and source pins in sections1–6 remain historical.
Accepted READ/STREAM-active-revoke/restart are retired; do not rerun them.
[Current Edge journal](../../../EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#epg10-08-two-authority-contracts-20261023).

### 7.1 Current observed inputs and precise missing boundary

Source audit23Oct10:06–10:14UTC, NOT runtime qualification:

| Owner/source | Actual pin / finding |
| --- | --- |
| Edge HK | `/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2`, `feat/execution-edge-upgrade-v1_2@6803b3416f59d6192391d8aed666eb4c6aecdb5d`. Existing router/worker isolated qualification290Rust+127runner, not concrete authority. |
| Core SGP | `/home/bobby/portal-research`, `docs/research-loop-plan@2a89e6d0d6bb221e87f24da6be1e3394f8f22f4d`, tracked clean. Integrator `chore/core009-approved-closeout-20261023` same pin; Claude `claude/post-freeze-20261021@3aaf24f4e66bca6c27962ddbbc2049cfb6505421`, `claude/post-land-20261022@e13af8cfd00ddcf80ff8f2394f2848aa30f5507e`. |
| Core current scope | `apps/control-api/src/execution-v2/read-scope.ts`, SHA256 `fc9440e5f7835e85bc2664e610828c03ef90b184e30d409161290924549201f1`: branded WeakMap scope; detached manager context explicitly NOT transferable permission. |
| Core existing reverse transport | `apps/control-api/src/execution-v2/current-human-transport.ts`, SHA256 `4b24d4551977c067e106eb87f52bf2f39868e5274b34aacecf6e74c5d6ceff92`: authenticated ENTER/RESOLVE attempt custody, not generic query/history/export scope resolution. |
| TS/PM HK | `/home/bobby/.worktrees/trading-system-pm-v1_1`, `feat/portfolio-account-v1_1-parallel@b3ef69ece592c45f3589b5cdf5640c5ff432370f`. Private dormant membership loader is not Portal session authority. |
| PM exporter | `services/portfolio_management/report_publication_bootstrap.py`, SHA256 `68577ab8f667a7b8fde0789369cddf44021d6354d32d13d7dc19bb5521a68b5c`: complete binding/prefix/group/commit checks and opaque cursors already exist; explicitly no proof verifier/APPLIED ACK. |
| PM delivery | `services/portfolio_management/report_publication_endpoint.py`, SHA256 `bf1d421d3dd84dfe879246e1f4bd43b331b64aacf13b02791e3e8bdd80730e16`: three bounded data routes only; delivery does not create source approval or receiver checkpoint. |

Do not repeat schema128 installation, create accounts, add a second journal,
copy Portal login cookies/signing keys to HK, or request broad approval again.
Core six-lane packaging/P22 progress is credited separately; none of those
source receipts publishes either missing wire below.

### 7.2 CORE-03/06 — Core current authorized-view wire

**Implementation owner: Core/Claude; reviewer/integrator: Core/Codex; consumer:
Edge. OPEN, not OWNER_ACCEPTED.** Reuse current `ExecutionReadScopes`, current
human/session lookup, app/field policy and native membership composition.
Publish the smallest authenticated server-to-server resolve/recheck contract;
one bounded surface with operation-discriminated requests is acceptable. Core
chooses exact method/path/version and its original custody implementation.

Required semantics and consumer map:

1. Resolve only the actual authenticated Portal human/session and commissioned
   Edge workload, logical resource/profile/workspace/economic domain. Browser
   actor IDs, roles and delegated JWT claims do not choose a permission scope.
2. Return the exact current **authorized-view decision**, operation, explicit
   correlated entity/lineage and field rights, app/field/model/native revisions,
   principal/session-generation/workload binding and bounded original opaque
   recheck context. Keep private session/custody out of logs/public DTOs. Do not
   flatten correlated lineage into independently combined ID allowlists.
3. CURRENT, HISTORY, EXPORT and REPLAY/STREAM are separate decisions. An
   explicit manager-wide decision is not inferred from omitted IDs. State
   denied/changed/expired/unavailable/unknown semantics and finite byte/time/
   concurrency/context-retention limits; no cached ALLOW as current policy.
4. Recheck the SAME original actor/session/context and exact decision afresh
   around I/O, cached disclosure and every frame. Equal view digests across
   sessions must not merge revocation. Cancellation/timeout must preserve any
   original unresolved custody; no fabricated terminal/finished/ACK.
5. **Edge**, not Core, intersects that authorization with the independently
   qualified ingest binding, schema, source set, coverage and retention to
   construct `query_api::scoped::ReadScope`. Core does not invent source
   completeness or certify financial history. Publish the identity mapping
   between the decision's resource/source selection and that qualified binding.
6. Publish authenticated request binding and trust references: actual mTLS
   peer/SAN/audience, assertion issuer/purpose/algorithm/kid if applicable,
   rotation/revocation and fresh-recheck rules. Existing human ENTER/RESOLVE
   protocol is not automatically this grant; final native egress/owning-COMMIT
   fences stay separate and must not be weakened by a generic ALLOW.

Edge entrypoint to implement, relative to HK Edge:
`services/portal-execution-edge-rs/crates/edge-service/src/scoped_policy.rs`,
`CurrentPolicy::resolve/recheck`; private per-request `ResolvedPolicy` custody.
No new accepting implementation exists today; four binary routes stay503.

Required producer/consumer negatives: revoked/expired original session, foreign
context/session/workload, policy/field/native generation change, wrong profile/
resource/operation, CURRENT without HISTORY/EXPORT/STREAM, changed/foreign
cursor, timeout before/after read, cache/frame revoke and two equivalent views
where only one session is revoked. Return fixtures with TEST_ONLY provenance;
actual installed acceptance is a later, separately evidenced step in08/09.

### 7.3 CORE-03/04 — PM publication proof and receiver-APPLIED wire

**Implementation owner: TS/PM on HK; Core accepts original Portal human/workload
inputs through Edge; consumer: Edge. OPEN, not OWNER_ACCEPTED.** Reuse
`ReportPublicationBootstrap`, existing current HISTORY/EXPORT session and the
three POST data routes under `/internal/pma11-candidate/publication/`:
`snapshot`, `page`, `delta`. Preserve their existing bodies/version.

Only the missing authority/custody wrapper is requested:

1. Source assertion issuance/renewal for the approved original worker principal
   and exact delivered method/path/query/body digest. Publish current rights,
   revoke/expiry and original request custody. A temporary READ session is not
   an implicit perpetual ingestion/service permission.
2. One bounded source-owned attestation/revalidation contract can cover existing
   `MANIFEST`, `PAGE`, `CHUNK`, `GROUP`, `CONTROL` proof kinds. Authenticate exact
   full binding digest, canonical input digest, proof kind, current workload/
   policy, validity and original source identity. Five new endpoints are NOT
   required. State how the original output/COMMIT custody is retained or freshly
   revalidated, including control/empty-hidden groups and same-original resume.
3. Reuse current canonical JSON and Ed25519/JWKS mechanics where appropriate,
   but publish the separate financial purpose/audience/key acceptance and
   request binding. A local hash, TLS200, signed cursor, human lease JWS
   `pma.current-human-lease.v1` or source-terminal ACK is not financial proof.
4. Publish idempotent receiver-APPLIED acknowledgement/status for the actual
   post-receiver-COMMIT receipt: same original manifest/full binding/consumer,
   receiver UUID generation and opaque cursor. Lost response must resolve or
   retry that SAME receipt, never a new snapshot/key or guessed success. State
   whether/how existing durable acknowledgement storage is reused; do not add
   a financial ledger. Duplicate-identical ACK is idempotent; conflicting,
   wrong-consumer/generation/cursor and pre-COMMIT ACK reject.
   Define authenticated receiver identity/receipt acceptance explicitly; bare
   JSON is not proof of a receiver COMMIT or a commissioned consumer.
5. `report_storage_transport` STORED and `report_delivery` TRANSPORT_STORED have
   no consumer-applied checkpoint. Native P13 numeric `advance_cursor` is not
   Edge's UUID/opaque-cursor receipt. Do not alias any of them to APPLIED.

Edge binding target:
`services/portal-execution-edge-rs/crates/edge-service/src/scoped_worker.rs`,
`FinancialSourceAuthority::{assertion,manifest,page,chunk,group,control,acknowledge}`;
independent proof validation at `authoritative-event-core/src/bootstrap.rs`
`SourceProofVerifier/Verified` (max verified handoff age30s); actual receipt at
`projection-store-pg/src/bootstrap.rs::BootstrapReceipt` (serialized generation
and cursor, internal DB revision is not transmitted). Owner returns exact
schema/canonical-byte vectors so Python/Rust do not infer the signing preimage.

Required negatives: wrong kind/digest/binding/current policy, revoked/expired
assertion, retention/generation/control change, interrupted page/delta,
duplicate/corrupt/conflicting ACK, loss of ACK response and same-original
status/recovery, cancellation with unresolved custody. Preserve all data,
dedup+checkpoint atomicity and source fences. No production DB/transport
commissioning follows from this contract request.

### 7.4 Single return, no circular request or expired scheduling

Core coordinator appends its response to the existing
`CORE_TO_EDGE_TS_PM_CONSOLIDATED_RETURN_2026-10-22.md`; PM returns into its
existing `upgrade/PM_TO_EXECUTION_REVIEW_RESPONSE_2026-10-22.md`/owner channel,
referencing this section and sending it to Edge, NOT a direct Core→PM DB path.
Do not hold contract publication for P22, Manager trust, G2/calibration or a
fresh test window. Those remain separately tracked, not extra gates here.

For EACH of sections7.2/7.3 return: **CONTRACT_ACCEPTED** with exact method/path,
strict request/response/error schema and bounded positive/negative wire
examples/canonical hashes; or **CHANGE** with the minimal compatible alternative
and reason. No placeholder route/hashes or generic BLOCKED. Include original
custody/recovery/retirement contract; actual source commit + dirty/hash state;
tests/receipts; public trust pins + private configuration REFERENCES ONLY;
Paper/Sandbox/Canary/Live mapping (Canary is a Live binding where that is actual,
not an invented new environment); SOURCE_ONLY versus installed disposition;
owner/action and next event/checkpoint. Source-only publication can unblock
Edge adapter coding without claiming runtime ready or waiting for an image.

Edge then implements the concrete consumers against that accepted version,
runs focused security/protocol/PG tests where impacted and returns source pins
plus honest readiness. Only after artifacts/trust are actually ready do owners
agree a fresh finite installation/acceptance window. Full08/09 stays NOT_MET.
Delivery of this request is not an owner ACK, accepted wire or connected PASS.
