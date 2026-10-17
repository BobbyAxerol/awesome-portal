# ELP2-04 — Finite account-sync and exact-target command readers

2026-10-17. Existing approved backend02–11 goal; entry
`888d017107e32664d9f016dfbe151fb674eba9f3`, branch
`docs/research-loop-plan`, checkout `/home/bobby/portal-research`.
Implementation **UNCOMMITTED; tests NOT_RUN** at entry. No frontend assignment,
source installation, runtime flag, migration, shared preview rebuild or push.
This narrows existing04-008/009; neither request is fully closed.

## Review intake, ownership and source pins

Primary re-read owning04 packet/closeout/positive-reader and07/10 handoffs;
campaign §7.3 governs recurring Claude review. No new Claude consumer receipt
exists for these additive readers; `AWAITING_CONSUMER_REVIEW` is not acceptance.
Independent account source/review/tests and command source/review/tests/generator
proposals were read in full before integration. Agents changed private drafts
only; primary owns all repository edits, shared contracts, inventory, docs,
resource scheduling, generation, validation and Git.

| Finding | Disposition / required correction |
| --- | --- |
| ASR-01: new snapshot capture keeps private sync_id | ACCEPTED_FOR_IMPLEMENTATION: finite five-field public whitelist in both legacy and V2, private declared identity for row IDs; all other legacy aliases unchanged |
| TCR-01: report filter discards app-only access.grant parents | ACCEPTED_FOR_IMPLEMENTATION: remove only app-only audit ALLOW leaves; preserve every DENY and ancestor; shared correction for detail and collection. A dropped parent can invalidate a real delegated DENY and incorrectly permit an independent accepted ALLOW |
| CC-03: retained guard confuses collection Core workspace with projection source | ACCEPTED_FOR_IMPLEMENTATION: classify only the exact additive collection path as Core. Existing capital detail source fence and retained mutation refusal remain unchanged |
| Response1MiB branch | No fabricated proof: closed legal100-item statuses have not reached that defensive ceiling. Test reachable100/1024/1025 bounds; keep this branch explicitly unproven defense-in-depth |

Frozen private proposal SHA256s: account source
`60c86e03b58e8715eca0071d37d8b4a7a9f9404b178dc1fe671d9a65b687aa1e`,
ASR correction
`f51bd05a2464099fa02fea65ec2fcff45472bc15fe9884e373061848f81adc30`,
command source
`bd6d1532ace7011afc7727a35b424fe8a0a5d177e9f092c39d6fdc48353a5aa7`,
command generator
`bc45ce0d6e1be9d960543cc717e5b1af3803471e4e4e00f8b5de04893ff445ee`.
Base production hashes matched again after the prior Regime hook ended.
No source-only review is called an executed test or deployed exploit.

## Account-sync implementation / unchanged public DTO

| Exact existing named source/relation | Purpose and public candidates | Private declared identity |
| --- | --- | --- |
| manager.current.account-sync-current-state / account_sync_current_state | account.read; account_id, currency, mode, status, updated_at | account_id |
| manager.current.account-sync-snapshots / account_sync_snapshots | account.read; account_id, currency, mode, status, created_at | sync_id; NEVER public |

`retained-operation-page.ts`, `retained-business-aliases.ts`,
`profile-projection.catalog.ts` and `durable-mirror.repository.ts` add only the
two exact purposes/bindings/PK recipes. No generic relation or browser selector.
V2 source/dataset/generation and correlated account scope precede fields,
identity, filters, counts and page. Owning an Alpha that shares a peer's account
does not grant account.read. Legacy IDs preserve existing unkeyed bytes; V2
HMAC binds workspace/environment/profile/operation/private PK, not actor.
Actor/session/query/source bind current authority and cursor instead.

Whitelist intersections cannot emit sync_id, buying power, checksum, archive or
source diagnostics. updated_at and created_at keep their source meanings, not
inferred completion/current-health clocks. Zero, null and omitted remain
different; visible malformed clock/identity refuses safely, hidden malformed
rows do not create an existence oracle. Existing PARTIAL/STALE/null-total
envelope does not become authoritative complete history.

These static collector bindings are NOT inherently runtime-inert after a future
deployment with an enabled worker. Existing worker/cadence/lease/drain remains;
no deployment or flag activation occurs in this delivery. Existing10pages ×
200rows bound gives at most20pages/4000rows per profile/pass for both aliases;
this arithmetic is not measured traffic, SLO, RAM or approved production budget.

## Command collection / generated client

Add `GET /api/v1/execution/capital-commands`, operationId
`executionCapitalCommandCollectionV1`, generated
`execution-trusted-commands.d.ts`: `CommandCollectionQuery` / `CommandCollection`.
Required query: workspace_id, resource_kind(ROOT/PORTFOLIO/DEPLOYMENT),
resource_id, environment. limit1..100 defaults25; optional opaque after≤4096.
No optional-resource workspace-wide discovery. Exact current TS-accepted
audit.read precedes SQL even for an authorized empty collection; business.read_all
or an app-only audit ALLOW does not substitute. Valid delegation ancestors and
all DENYs remain in the evaluator graph for both detail and collection.

`CommandStore.statusCandidates` uses BEGIN READ ONLY,5s statement timeout,
exact immutable intent target/environment predicate and1025 sentinel. It selects
only command ID, immutable resource/environment and public status; no intent
body, credential, authorization or key. Release DB client before current Core
confirmation. Every immutable tuple is authorized before status parsing,
sorting, fingerprinting, count and page. Mutable status must match ID and
immutable tuple or the whole read refuses503, never silently omits corruption.

Sort created_at_ms DESC then command_id ASC. The cursor binds actor/session/
generation/workspace/exact query/current Core decision and permitted statuses
only. Hidden target changes do not enter fingerprint or totals; visible changes
force409. A page has returned_count/has_more/next_cursor, **no global total**,
family TRUSTED_CAPITAL_COMMANDS_ONLY and coverage EXACT_AUTHORIZED_RESOURCE_ONLY.
It is not the mixed F0/R1/R2/Live/PaperExit queue. Page bound100, retained target
bound1024 with explicit overflow503, serialized defensive ceiling1MiB.

Closed unchanged CommandStatus preserves decimal strings, UTC epoch-ms,
nullable UNKNOWN and delivery/business/projection/venue distinctions. ACK is
not APPLIED and APPLIED is not filled. Uniform hidden/unknown404; input/invalid
cursor400; changed cursor/current authority409; unavailable/overflow/sanitized
driver failure503; authenticated responses private,no-store. No GET send,
lookup, recover, reconcile, write, ACK or current-source refresh. Current Core
checks remain sequential, not a held cross-authority native HTTP/COMMIT fence.

The generator preserves existing GET detail and POST submit on the same path:
five operations/four paths. CommandStatus and PM payload schema unchanged.
JSONSchema carries structural bounds; Zod also checks cross-row/page invariants.
Do not claim structural AJV proves those relational checks. Canonical example
`execution-trusted-command-collection.synthetic.valid.json` is explicitly
TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT, not a native acceptance receipt.
Capability inventory adds one backend-owned published/unconsumed read239→240;
this is not the count of every repository route.

## Validation matrix / resource boundary

All rows **NOT_RUN** at entry. One approved disposable Core lane,4CPU/4GiB,
8GiB transient, no public ports/production volumes; only one heavy lane.
Do not overlap the observed foreign PM recovery measurement window. Existing
normal hook is mandatory once for this coherent package, not per request.

| Scope | Required proof |
| --- | --- |
| Account fixture18 + PG component12 proposed cases | Exact finite fields/private identity; actual worker→decoder→snapshot/mirror→reader; scope/source/generation/clock/PK negatives,2000-row drains and deterministic current-fence refusal |
| Mounted command HTTP/real PG38 proposed cases | Genuine activated owner/delegator/nonowner sessions, actual valid delegation graph, exact positive/empty/hidden404, pre-scan DENY, status corruption, cursor/privacy, actual grant/session revoke after PG read,1024/1025 and unchanged command/audit rows |
| Contract/new fixture | Five operations/four paths, required target/default limit, closed statuses/typed problems and old PM schema unchanged; regenerate real OpenAPI/type/snapshot inputs |
| Existing impacted tests | Finite business/bracket aliases, command behavior, current-grant/retained guard regressions; reuse unchanged cursor crypto/source-independent receipts only after impact review |
| Delivery | Build and scoped PG restore; source/index/runtime pins; exact owned resource cleanup; actual focused and normal-hook receipts below |

Account authority/publication fixtures are TEST_ONLY; real PG proves storage
and reader, not mounted current PM authority. Its pool.query spy observes
metadata SELECTs, not all checked-out-client SQL. Actual READ ONLY repositories
separately constrain writes. Command HTTP uses genuine persisted Auth and Core
grant/session revokes, but synthetic CF/relations/TS receipt/authorization; not
real Cloudflare/PM trust, economic execution or source installation.
Bulk1025 is explicit disposable persistence fault injection, not a raised
intake cap or production authority. Never disable immutable triggers to pass.

## Handoff, remaining debt and rollback

Claude: **NOT_STARTED_BY_OWNER_DIRECTION / AWAITING_CONSUMER_REVIEW**.
When assigned, consume existing account named-page DTO and exact source-clock/
retained/absence semantics; use the new generated collection only with an
explicit authorized resource/environment and preserve cursor errors. No global
mixed queue, whole-history label, inferred grant/health, polling or command
activation. Frontend sources/layout/tokens/baselines remain untouched here.

Backend may continue remaining04 parents/purposes and qualified03/05/06/07/09/10
dependencies under the approved goal. Other27 null purposes and unqualified
parent/custody/source readers stay closed. These two aliases and one collection
do not complete all04. Native authority/trust, approved production budgets/
calibration, coexistence/G2 and browser remain explicit10 dependencies;
11 is not entry-ready. Writing this handoff is not evidence Claude received it.

Rollback is reviewed code-only unmount of additive readers/bindings, preserving
grant-ancestry safety, deny defaults, identity, audit, command/projection history
and all peer work. No destructive cleanup or data rewrite. Normal phase C4
teardown removes only exact disposable owned containers/network/lease; retain
failed logs and evidence. Terminal results are appended when actually obtained.

## First affected gate — terminal19:33UTC, NOT_PASS

`reader-completion-focus-192607`: build PASS;11files,382tests PASS/6FAIL,
73.71s. All six failures are the new command bulk fixture's PostgreSQL syntax
error at unquoted reserved word `authorization`; ordinary positive/negative,
genuine delegation DENY/ALLOW, retained Core/source separation and real post-read
grant/session revoke cases passed. Account fixture18 and real-PG capture12
passed; existing impacted scopes passed. These are overlapping parts of382,
not additional coverage. Restore did NOT_RUN after the test failure.

Fix only fixture JSON alias/declaration/select to `auth_fact`; do not change
production authority/schema/limits, SQL triggers or assertions. The coherent
normal hook will exercise corrected38 plus contracts/restore; do not repeat the
unchanged eleven-suite focused build first. Failed log SHA256
`46479180b0a29ff445f782f2e39e7bf9893a0e3dab8a0df4ac9fc93d273a0946`,
controller SHA256`10954545e47658df409b662a14a408b09f877bb5d51959f109d056d3c716aa98`.
All frozen source/index and eight runtime tuples unchanged, own resources=[];
own measurement lease released, no shared resources removed.

Generation note: direct host generator first lacked zod in its contracts-local
resolution path. Re-ran the same repository generator with existing control-api
node_modules via NODE_PATH; no install/dependency/lockfile change. Actual
OpenAPI comparison confirms every pre-existing schema byte-semantically
unchanged, four paths/five operations and only two added types. Snapshot454
inputs matches. One read-only child-process comparison hit sandbox EPERM; the
equivalent direct Git-to-node stdin comparison completed, no authority bypass.

Live static route ledger regenerated by existing `p01-baseline.mjs`:
295→296, exactly one GET addition/no removal/collision. Capability ledger
239→240 is a different denominator. N29/EDS-12 semantic/deployed state is not
changed by static generation. Final hook remains PENDING, not product PASS.

## First normal-hook attempt — terminal19:35UTC, static pin rejection

`reader-completion-land-193419` exited1 at the static EDS-12 verifier:
`evidence digest drifted: projection_relation_ladder`. The catalogue's two new
finite account bindings changed its source hash; the existing derived ledger
still pinned the old bytes. Contracts/build/API/restore did NOT_RUN in this
attempt. No commit was created. All35 intended delivery paths remain owned;
the first attempt froze33 before adding the two derived pin artifacts.

Failed log SHA256
`ca5c9a7ff5fa76bcf809840e9c73a0f775ac45deebfaaec1d752123cec405fd8`;
controller SHA256
`0dfaa0af34a260ed28d94638e628b9cc013aeeb3ccc8f6372adb08bb42e36183`.
Frozen source/index and eight runtime tuples were unchanged, resources=[],
own measurement lease released. Preserve this failure; it is not the earlier
focused fixture failure and is not a completed full-suite run.

Correction uses existing `scripts/refresh-release-integrity-ledgers.sh --write`:
N29 unchanged; EDS-12 changes only `projection_relation_ladder.sha256` and the
resulting qualification-file entry in `MANIFEST.sha256`. Semantic validation
PASS,42 EDS-12 inputs, `runtime_effect=NONE`; `product_active=false`,
`operations_qualified=false` and deployed-evidence-pending remain unchanged.
No authority/profile/gate weakening or runtime change. The corrected coherent
normal hook is PENDING; do not add a duplicate focused build before it.

<a id="finite-reader-terminal-20261017-2007"></a>
## Actual corrected normal-hook terminal — 2026-10-17T20:07:12Z

Landed `5cac1151e27a3276ed9c32f56fe485197c2cdcaa`,35 files,+2002/−49
(including attributed preserved peer Unified notes). Controller
`reader-completion-land-193956` exit0. Contracts67 files/791 PASS with
generation/parity/snapshot PASS; Control API build PASS; API375 files PASS,
2 existing skipped files,6011 PASS+3 existing skips (6014 total),1216.18s.
Command38/account-capture12/alias18 are subsets, not additional coverage.
Scoped PostgreSQL restore/four access-row digests PASS. Static296 routes/no
collision, protected kernel MATCH, N29/EDS-12 integrity PASS/runtime_effect NONE.

All35 source/index pins unchanged; eight protected runtime image/start/restart/
running tuples identical. Owned Node/PG/network absent, own lease released.
Gate log SHA256 `6f819f12487d074cdf0a2b76cb4280b457405f0de075e78c539400f9569f132d`;
terminal controller `c740b0fe235bd44a580783a8b06aff394569c749207b92c119fd818d622bf7ec`.
Preserve the focused fixture failure and first static-pin rejection above.
This supersedes pending corrected landing only: remaining purposes/current
source and full04/10/consumer acceptance do not become PASS. No push/runtime/FE.
