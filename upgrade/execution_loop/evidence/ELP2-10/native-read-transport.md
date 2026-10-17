# ELP2-10 — private source-pinned native business READ codec and TLS client

## Scope / entry / authority

Existing approved remaining-backend02–11 batch; continuation of the10
commissioning record, not a new generic provider/ledger or runtime approval.
Integration branch `docs/research-loop-plan`, HEAD
`609d11dd67d7ecd22f363707fd1e9476c7c7aa89`. The24staged heartbeat paths are
primary-owned; their failed gate/fixture correction is preserved in
[04](../ELP2-04/heartbeat-public-reader.md#actual-second-landing-terminal-2026-10-17t1511utc).
Native additions below are APPLIED/UNCOMMITTED, tests NOT_RUN at entry.

Own two new private modules, two new specs, extraction of the existing
in-memory test certificate helper and primary tracking/rules. No OpenAPI,
public route, DI/config installation, migration, source listener, signing
provider, credential, grant or source data is added. Constructor/import opens
no socket; no retry, command, SSE or Live activation. No frontend, runtime
build/restart, push/dev/main, sign/release/deploy. The test cell is the existing
isolated one-heavy-lane4CPU/4GiB/8GiB-transient correctness budget; no TS/DL
load, capacity or source qualification claim.

## Inputs / source pins

Read-only HK host `bobby@16.163.212.33`, PM worktree
`/home/bobby/.worktrees/trading-system-pm-v1_1`, branch
`feat/portfolio-account-v1_1-parallel`. Exact wire inspected at
`89293d0d2ecb075f34250dd1d516b062ca6c3275`, repinned14:45:15UTC to
`f02ebd78a61af4f61e38daa8488048f411ba2797`: six protocol file hashes unchanged.
This is SOURCE_CONFIRMED / UNMOUNTED / INSTALLATION_NOT_VERIFIED, not runtime.

| PM source under services/portfolio_management | SHA256 |
|---|---|
|native_business_read_provider.py|2e58d908585d1ca54a04c33cd8afa371f6c9ff5caee7a9f331e2510770c2052d|
|native_fence.py|75bf3db97d0c6d8283cd222dec8394635d335b0d68d47d1a51a968b41f287e12|
|business_root_held.py|0b2b4b9163c14b4c452ab184d6ed56c751d35a8f9ba39071d30bfe38ce4e11b3|
|portal_human_candidate.py|1abcfb7c197f6c23cf74c7ff7afb7875e869bede0019429f921651f9d32ec428|
|portal_human_recovery.py|972f172e72853fa871d83d68a4506061161f21f43f2b61a9b1693b4e08a9a88e|
|http_request_binding.py|722fca48d9fcd838f61fa1b0664528cc7e634b8b260a09ea9b54523b832f3f22|

Exact private wire witness `20261017/native-read-wire-current.md`, SHA256
`ce6e13254c6c8fadb7d44e2df4640859193ee219eee254c7c708effec07efd66`;
repin `native-read-wire-repin-144515.md`, SHA256
`22815468a3c92a4edc89bf16c00acb42f907f5ed0927576133f2c45ac2c9d347`.
Paths are under owner-local state `portal-execution-elp210`, not published
business data, installed trust or an independent source execution receipt.

## Delivered implementation / invariants

`native-business-read-codec.ts` closes six exact POST actions under
`/internal/elp210/business-root-read/`: issue, enter, unknown, status,
cancel-unentered, resolve. It preserves original Base including exact deadline
for same-attempt recovery, raw Binding/Manager/source digests and distinct
prefixed provider-delivery digest. UTF8, Gregorian UTC microseconds, int64
revision strings, decoded duplicate-key JSON, own-data/proxy/getter intake,
closed action/result correlation and explicit byte bounds are checked.
Prepared WeakMap carrier is correlation only, never a held read capability.
Opaque assertion bodies are sensitive and must never be logged.

`native-business-read-client.ts` uses explicit root-only HTTPS origin and
copied CA/key/cert, TLS1.3/mTLS, hostname and exact peer leaf SHA256 on the actual
socket **before HTTP write/end**. One fresh non-pooled connection per call,
no redirect/proxy/cookie/retry. Strict HTTP1.1/200/JSON/length/no-store/close,
finite headers/body/deadline/in-flight admission; slots release only on the
owned ClientRequest's actual close, not Promise settlement. Only five safe
client error codes escape. `http_delivery` reports NOT_ATTEMPTED or
MAY_HAVE_OCCURRED; neither proves source state, cancellation, rollback or safe
release. OBSERVATION/ABSENT/TTL/EOF cannot reconstruct a held native handle.

Explicit constructor ceilings10seconds/32KiB/16slots and PEM32KiB are local
candidate intake bounds, **not approved production budgets or defaults**.
No configured source acceptance, current-human signing, owning Core COMMIT,
durable attempt store or actual HTTP final-egress terminal is supplied here.
Do not reuse `CurrentHumanCandidate.issue()` as a JWT factory: it allocates a
reverse-human lease which native-only PM does not ENTER, leaking pending
state without an explicit composed lifecycle.

## Delegation / reviews / test bar

Private disjoint drafts: `elp210_mapping_review` codec/static review;
`elp210_mapping_tests` codec and real-TLS tests/certificate extraction;
primary client review/integration/shared docs/resource scheduling. No agent
ran jobs, edited repository/index, used SSH/credentials or claimed runtime.
Primary read the complete drafts before applying. Independent static codec
review `native-read-codec-independent-review.md` accepts source-only; digest
`b06e62d8b754bb69155947471a20411a9cc9374e77c56d324e29e53bf09bebcd`.
This is review, not test coverage or genuine source authority.

| Requirement | Impacted validation | Entry status |
|---|---|---|
|All six closed requests/results, exact byte-purpose correlation, immutable Base|elp210-native-business-read-codec.spec.ts,36expanded cases|NOT_RUN|
|Actual TLS1.3/mTLS, wrong pin/CA/host/version before HTTP, foreign client cert|elp210-native-business-read-client.spec.ts|NOT_RUN|
|Framing/encoding/duplicate/byte caps, sanitized error, timeout and actual-close quota|Same new client spec,44expanded cases total|NOT_RUN|
|Extracted certificate helper preserves accepted old behavior|elp210-current-human-transport.spec.ts actual TLS suite|NOT_RUN|
|Stable workspace publication negative plus existing races/clock/paging|04 heartbeat HTTP/PG39 and projector69 cases|Retest PENDING after fixture correction|
|Actual DB authorization restore and build|auth.spec.ts plus scoped PG restore in existing test script|NOT_RUN on this source|

The table preserves **entry** state. The actual focused terminal below
supersedes those pending test results; normal-hook landing is still separate.

Test helper generates only ephemeral in-memory EC certificates using Node
crypto. No checked-in PEM/private key, openssl installation or imported test
suite; extracted old helper defaults keep localhost/IP behavior unchanged.
Synthetic messages are clearly TEST_ONLY, not signed current-human assertions.
No full engine/browser/load/DR retake for this private transport; actual
results/cleanup/source hashes are appended only after terminal. A test plan
cannot become PASS or installation from a parsed reply.

## Exit / rollback / next work / Claude

Local code gate PENDING affected build/TLS/HTTP/PG + normal-hook landing.
Real commissioned provider/human/domain trust, signed current assertions,
same-attempt held lifecycle/durable recovery, actual Core final-send/confirmed
abort terminal, approved budgets/calibration/coexistence/P184G2 remain OPEN.
ELP2-10 is not full-PASS;11NOT_ENTRY_READY. Native client is not yet injected
into a Manager/realtime/command factory. Continue those independent approved
backend integrations, preserving actual late outcomes and revocations.

No new frontend field/type or UI change in this private slice. UXM00–10 stays
NOT_STARTED_BY_OWNER_DIRECTION / AWAITING_CONSUMER_REVIEW. Follow
[recurring Claude review intake](../../AGENT_WORKING_RULES.md#73-request-và-debt-ledger-hai-chiều):
record review revision/disposition, integrate accepted findings into canonical
phase to-do/exit tests, then return commit/fixture/limits. This receipt itself
is not proof of delivery acknowledgement or UI acceptance.

Rollback is reviewed removal of only uninstalled private modules/tests after
impact review; preserve all existing Core/source identities/grants, immutable
attempt/audit rows, credentials, snapshots and protected runtimes. Clean only
the exact correctness controller's disposable resources, retain receipts;
normal hooks must not be bypassed.

### Affected validation reservation —2026-10-17T15:21UTC

`20261017/native-read-focus-152104` reserved the one heavy lane only AFTER
the foreign PM capital-range owner released its window. Controller
`native-read-gate.py` SHA256
`5c62c25a3defb31c1a1eebe697b9dd46e79648dbc2cd33e7e410910e589f03b1`.
Six impacted suites include auth for actual scoped-restore base tables, both
heartbeat suites, both native suites and the old current-human TLS suite.
Source/index/HEAD frozen before starting; result PENDING at this entry.
No unrelated engine/browser/performance campaign or shared runtime operation.

### Actual focused terminal / type correction —2026-10-17T15:25UTC

The reserved run ended at15:25:47.010893UTC with **build FAIL / exit2**:
`native-business-read-client.ts:141`, TS2353, `ALPNProtocols` is not listed
on Node's HTTPS `RequestOptions`. All six suites and scoped PG restore are
**NOT_RUN** in this attempt, not failed tests. Log SHA256
`84815751d7832498a829173c81c401015e7819f5a9540faac3bea8522918283e`;
owner-local `20261017/native-read-focus-152104/controller.json` and `gate.log`.
Source/index stayed frozen; all eight protected runtime identities stayed
unchanged. Exact-owned Node/PG/network resources were removed, remainder[],
and the owned measurement lease was released. Sampled Node1.108GiB/3GiB and
PG73.98MiB/1GiB are samples, not peak/capacity or production SLO evidence.

After that terminal, the client declares the ALPN object as
`Pick<ConnectionOptions, "ALPNProtocols">` and spreads it into HTTPS options.
This uses the actual TLS type without `any`, an assertion, relaxed TLS policy
or a wire-policy change. Retest remains **PENDING**; keep this failed receipt.

Independent integrated source review accepts the client/codec/tests with
integration limits (`native-read-client/independent-review.md`, SHA256
`ff4957d18a4ae8887575cfd4d52c5fa7f8dcae4ec1f50228387cc8972f483231`).
It is a static source review, not compilation, test or installation proof;
the type failure above remains part of the record.

### Corrected affected gate —2026-10-17T15:34UTC

`20261017/native-read-focus-153026` ended15:34:28.044066UTC, controller
**PASS / exit0**. API build, six suites **221/221 PASS**, and actual scoped
PostgreSQL restore (including four row digests) PASS. Breakdown: codec36,
actual-loopback TLS client44, existing current-human TLS17, heartbeat pure
projector69, mounted heartbeat HTTP/PG39, auth16. The stable wrong-workspace
negative now passes while the independent changing-publication409 remains.
Log SHA256 `c46986e5db3ec8b8e58c75e4c72abab42d1ce7e21621a558a717912463e475cd`;
controller SHA unchanged from the reservation above. No new contract suite
was run in this focus; the grouped normal hook owns the final landing gates.

Source/index/HEAD stayed frozen throughout this measurement; eight protected
runtime identities unchanged, exact-owned resources remainder[], measurement
lease released. One observed sample: Node99.13%CPU/1.283GiB of3GiB,
PG0%/73.72MiB of1GiB; not peak/capacity, coexistence or production SLO proof.
After terminal, only the two test header comments were updated to remove the
obsolete private-draft NOT_APPLIED/NOT_RUN wording; test/runtime bytes unchanged.

Normal-hook coherent heartbeat/native/rules landing **PENDING**; no bypass or
separate unchanged engine/browser/load/DR campaign. The real PM source wire
and current-human/final-egress installation gates remain OPEN, not proven by
ephemeral synthetic TLS endpoints. No public field change for Claude in the
native slice; the additive heartbeat contract remains AWAITING_CONSUMER_REVIEW.


<a id="native-read-terminal-20261017-1602"></a>

## Normal-hook landing —2026-10-17T16:02:08UTC

Commit `f734db9d1cbdc8d409cbdc19bee23c1e4b09ad9d`,32owned paths
+3,698/−48, includes heartbeat and private native READ codec/client.760contract
tests, APIbuild,5,618API tests and real scoped PG restore/four access-row digests
PASS;3existing API skips across2files retained. These overlap prior221focused
passes; no summed unique coverage or source/provider acceptance.

Controller `/home/bobby/.local/state/portal-execution-elp210/20261017/native-read-land-153544/controller.json`;
logSHA256 `bd1b5b4de6d0fe2b1fc903c6e83418cd75f3bc27b20737d4e6132457604f599b`.
Source/index and all eight protected runtime tuples unchanged; owned resources
empty/lease released. It supersedes pending landing only, preserving failed
attempts and the private-source/authority limits. No push or runtime activation.

## Source repin —observed15:48:39–15:50:16UTC

PM `bobby@16.163.212.33:/home/bobby/.worktrees/trading-system-pm-v1_1`,
branch `feat/portfolio-account-v1_1-parallel`, moved fromf02ebd78 to
`afa1af81eb88fe51451515bc237769ec4e7f98a7`. All six previously pinned native
wire files remain byte-identical; this does not require a Portal wire change.

The actual source factory/installer now EXISTS; do not keep calling it absent:
`services/portfolio_management/native_business_read_runtime.py`,187lines,
SHA256 `76c8574a5cfcdc34a1f92e7967a5fea3192d970bf72b1952db500a4409452273`;
`native_business_read_installation.py`,314lines,
SHA256 `8a8ea939686bff4e48aa164536379fc1ea734188f5cd1aed554a2451c005872a`.
Primary read all501lines. Runtime composes explicit pinned separate pools,
observer/held bridge/provider/mTLS listener, with fresh preflight per start.
Installer is fresh-only or exact independently pinned resume, preserves two
durable schema/guard stages, UNKNOWN on uncertain COMMIT and explicit
acceptance maintenance. Neither import nor config load enables a listener.

PM current R2 guide lines45–51 and Unified §58.102.1 report235PASS TEST_ONLY;
the raw qualification receipt was NOT read/reused as a Portal gate. New owner
WIP §58.118 corrected62socket cases remains PENDING in the observation.
Preserved dirty Unified/readiness and untracked integration test; no remote
writes/tests/DB/business requests, install, credential access or service action.

Exact local static alignment note:
`20261017/source-repin-1545/source-alignment-review.md` SHA256
`20eef2822ccf6d4c19c56cc7963f5e3cbb458ae33a2c3c089e6be2affb26624e`;
501line witness SHA256
`9d78edd9eccb88a311cb99c87713f3db8c2015a58bcc43d6967a64e0d00f0c2f`.
This is SOURCE_CONFIRMED / INSTALLATION_NOT_OBSERVED, not runtime acceptance.
Owner-reported waiter/PID labels were not used as process correspondence proof.
No newly acknowledged Claude receipt/changed wire was found in this selected
delta; that narrow observation is not a global absence assertion.

Core current-session/app/domain grant proof, independent native JWT signer,
durable exact-attempt lifecycle, actual HTTP final-send/confirmed-abort terminal,
reviewed genuine configuration installation and connected revoke/recovery are
still OPEN integration work. Keep native Base/deadline immutable and do not
use reverse-human candidate.issue as a bare JWT factory. Numeric budget/
calibration, coexistence and applicable original P184 performance G2 stay OPEN.
