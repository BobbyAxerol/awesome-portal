# Core backend six-package follow-through — 2026-11-02

## Scope and source

Base examined: `docs/research-loop-plan@f5993a79d`. This receipt describes
the working-tree changes alongside it, not a deployed image or a signed
qualification. The three untracked Edge mailbox files already in the checkout
are outside this change and remain untouched. The initial backend checkpoint
changed no frontend; the later Bobby-approved Alpha parser/data-binding
follow-through is recorded at the end of this receipt. No Edge runtime,
production, dev, main, Live, or command activation was changed.

## 1. Approval Evidence / R1

The optional producer and its real PostgreSQL/HTTP harness were already on the
base (`deabe3d73`, `cffaa28e2`); the Research review mount is `1c6a13e1c`.
It is source-dark, field authority is deny-all, and a governance fence can
return `503 ELP2_GOVERNANCE_PARENT_READ_NOT_COMMISSIONED`. A `503` is not
evidence. The retained-review profile also refuses R1 mutation.

This change rechecks approval visibility after the source await and before
returning the body; revocation or a final session/gate refusal fails closed.
It also rechecks each initially authorized field after the final visibility
await, without upgrading a section denied earlier in the same read. Deterministic
regression tests cover both revoke and mid-read grant. An HTTP harness discovered
that guard-level 401 responses lacked the contract's `private, no-store` header;
the error filter now sets it on this exact GET/HEAD route, including pre-handler
guard refusals. Synthetic Fastify injection covers 200/401/404/503, the public
problem schema, approval visibility revoke and section-level revoke. This is not a substitute
for an atomic field/source authority fence when a real source is commissioned,
nor does it prove a PostgreSQL revocation occurred during this test run.
An additional `elp204-positive-parent.spec.ts` case now uses the real
governance visibility and PostgreSQL membership fence, revokes membership on a
fresh test workspace during a source await, and checks HTTP non-disclosure.
The initial invocation was **NOT RUN** without the disposable DB: the test
file imported but skipped all 356 cases. A later dedicated disposable-PG
follow-through ran the new case and the related case successfully; see the
separate PostgreSQL/HTTP receipt below. This still uses TEST_ONLY sources.

The generated OpenAPI no longer claims that no producer exists; it describes
the optional source-dark mount and the actual sanitized session, workspace,
governance and operational error envelope and HTTP status families. Generated
types and the contract snapshot were regenerated. Frontend consumers must
continue to treat absent sections as absent; no positive source was enabled.

## 2. R-B / R-C disposition

The current branch already includes the newer follow-through: R-B same-snapshot
and grant-revocation coverage (`308c09940`), and R-C context isolation,
interval/coverage invariants and fail-closed source-field guard (`a19b5e19d`,
`da2d627db`, `bb378c24c`). The earlier CHANGES_REQUESTED note in Unified is
historical and superseded for these identified code findings. Focused consumer
and contract tests passed below. **Local implementation review: ACCEPTED for
the identified findings**, not a claim of connected source, current-image
browser or overall visual/release acceptance. R-C V2 remains source-dark; the
V1 fixture shown in screens does not prove real-source availability. R-B real
field access still requires the installed matching policy/grant.

## 3. Finite readers and source-dependent siblings

Current route/contract cross-check (route presence is not proof of a qualified
upstream payload or that two routes have identical granularity):

| Requested sibling | Existing related producer | Specific gap |
| --- | --- | --- |
| `order-detail` | `PaperReadController` serves `/screens/blotter`; `LiveOperationsController` serves `/deployments/:deployment_id/live`. | No dedicated order-detail producer was found under that contract; exact per-order execution/fee authority, order identity and bounded paging remain required. |
| `account-profile` | `ProfileReadController` serves `/screens/accounts/:account_id`; `ManagerModelController` serves `/manager/accounts/:id/overview`. | Neither fact alone proves the sibling's venue/network/margin and currency-bearing figure semantics or field-level authority; retain missing fields as missing. |
| `reconciliation` | Paper workbench, sandbox certification and Live operations already expose related screen data. | The sibling's independently scoped run/break records, complete counts and their source lineage have not been qualified. |
| `obligations` | Approval evidence has an optional scoped counts section and workflow code has an obligation summary. | Counts are not the requested per-obligation records; do not expand them into invented orders/positions. |
| portfolio / Operations health | Manager health contract and health publication composition exist. | Real publication, complete authorized population and roll-up still need source proof. |

Locators: `apps/control-api/src/paper-read/paper-read.controller.ts`,
`profile-read/profile-read.controller.ts`, `live/live-operations.controller.ts`,
`execution-v2/manager-model.controller.ts` and
`packages/contracts/tooling/generate-execution-siblings.mjs`. The latter
explicitly identifies the sibling set as contract-only. No synthetic order
fees, profile facts or reconciliation results were promoted to production
source here. Each owning projection must check principal, workspace, final
authority and pagination independently when wired.

The durable-mirror subject helper previously treated an explicitly supplied
but unrecognized entity filter (including `order_id`) as no filter at all;
prototype names could also resolve as inherited properties. A synthetic
regression reproduced that an unfiltered query was made. It now rejects an
unknown field or non-string value with `EXECUTION_READ_SCOPE_REQUIRED` before
either page or coverage SQL, while an intentionally absent filter retains its
existing meaning. Positive tests check account/strategy parameter binding for
orders/fills in both durable and retained shapes. Four focused suites passed
**221/221**, with **41 PostgreSQL cases skipped** without a disposable DB.
Current product subject callers use supported fields or deliberately use an
absent entity with the exact scoped Alpha predicate; this finding does not
claim the current HTTP route exposed an unfiltered order-detail endpoint.
It does not create the missing dedicated order-detail reader, qualify source,
or establish connected/native egress custody. The last backend build predates
this change and must be repeated on the stabilized candidate.

The existing `account-policies` source registry lists `margin_mode`, but its
approved retained capture explicitly limits public fields to `account_id`,
`mode`, `venue`, `created_at`, and `updated_at` (see
`ELP2-04/account-policy-metadata.md` and `retained-business-aliases.ts`). A
catalogue column is therefore not permission or proof that the dedicated
physical `account-profile` route can publish that field. Likewise, an Account
Resource DTO returned from a detached `ManagerCurrentAccounts.read` is not a
substitute for its native-custody HTTP path. No new always-empty 200 route was
added or called a completed producer. Follow-up must define the exact
binding/account/venue grain, approved field purpose and source semantics, then
wire the same held principal and physical egress; missing fields remain absent.

The existing Profile sandbox/live/account and non-native Resource
alpha/portfolio/account/binding controllers previously checked workspace
access only before their asynchronous reader. They now check the identical
workspace, viewer and requested environment again after the reader, withholding
the result with the existing 404 when membership was revoked. Focused
controller tests cover the seven affected paths and reject foreign Resource
workspaces before source access. This is a workspace-membership recheck,
not proof of an atomic session/field/source-authority fence or physical HTTP
egress. The native Account writer retains its distinct custody path; its
connected/PG acceptance was not run here.

The Paper overview, workbench (including VN-market) and blotter, plus Live
detail, now likewise recheck the same existing workspace membership after
their asynchronous source read. The Paper fan-out no longer converts a
source `EXECUTION_READ_ACCESS_CHANGED` or `EXECUTION_READ_AUTHORITY_UNAVAILABLE`
into a partial panel alongside sibling data: the whole composed read refuses.
Ordinary relation failures still use the existing partial behavior. Tests use
synthetic relation inputs and do not establish an atomic combined field/source
fence or prove READ/STREAM against Edge. The History-only permission remains
independent: unavailable history does not automatically deny otherwise
authorized CURRENT data.

## 4–5. Financial / NET_PNL and command STATUS

Two existing Account readers previously derived a seemingly valid headroom
after dropping or replacing missing financial values. The profile reader now
requires complete, same-projection account/balance/margin inputs, exact
decimal values and unambiguous currency/holding identities. The resource
reader also refuses derived totals on partial or truncated inputs, different
profiles/environments, unknown currency or unknown maintenance; conflicting
rows with one financial identity mark their relation `PARTIAL` with
`EDS04_RESOURCE_FINANCIAL_IDENTITY_CONFLICT` before display deduplication.
When the source explicitly supplies a zero, it remains zero. A real source
with incomplete data must remain unavailable, not be rendered as zero.

The profile reader's broker comparison also previously selected only the most
recent broker record across all currencies. Both profile and resource readers
now compare per currency and withhold the comparison when
account/balance/broker inputs do not share a complete projection, balances
are ambiguous, timestamps cannot be ordered or the latest source record ties.
The resource reader additionally detects a conflicting duplicate broker-sync
identity before deduplication. Carrier qualification, complete source
authority and economic ownership/census remain separate work.
Both readers also emit `portal_free` and `broker_buying_power` for a qualified
comparison, matching the Account UI and canonical fixture. The older
`internal_value` and `broker_value` fields remain for compatibility; all four
are the same exact source values, not new financial derivations. The existing
profile-read schema permits scalar record fields, so this does not change the
schema shape. Real-carrier and browser acceptance remain open.
Both Account readers now use the same bounded exact-money input policy for
derived headroom and broker comparison: decimal text or a safe integer is
accepted; fractional JSON numbers and unsafe integers are not treated as
exact decimal evidence. Invalid free balance yields an `UNAVAILABLE`
headroom row with null amounts in the Resource reader rather than silently
omitting that currency; invalid maintenance yields unavailable headroom.
Exact source text, including precision beyond a JavaScript float, remains
intact; an exact integer zero remains zero. The Profile Manager decoder rejects
fractional/unsafe numeric kind even earlier, as `INPUTS_NOT_QUALIFIED`.
These are synthetic-source safeguards, not qualification of the Edge carrier.
Exact arithmetic is bounded on output as well as input: two permitted values
can produce a sum or difference beyond the 128-character exact-money limit.
Profile and Resource now withhold such derived results rather than publishing
an out-of-bounds number or rounding it. Regression checks prove a 128-character
result remains available and the corresponding overflowing result is withheld.
The affected Profile, Resource, scoped Resource and producer suites passed
**85/85** on the current working tree; this is not a real-source receipt.
The Resource regression first proves that the same qualified snapshot with
decimal strings returns a correct available comparison/headroom, then changes
only the free or maintenance value to a fractional/unsafe JSON number and
checks unavailable. The strengthened Resource suite passed **33/33**.

### Alpha Resource V1: position and aggregate truthfulness (working tree)

The retained `positions_v2` catalogue does not publish amount currency or
economic-ownership/cost proof. The old V1 summary nevertheless attached the
deployment/account currency to position-derived PnL and notional, and turned
missing amounts into zero. This checkpoint keeps raw authorized source rows,
but marks deployment PnL/exposure and alpha position-PnL totals `UNAVAILABLE`
with `POSITION_FINANCIAL_SOURCE_NOT_QUALIFIED` and null amounts. It no longer
labels PnL `AVAILABLE` merely because a position row exists. A complete
single-profile position count can still be zero; partial/conflicted
populations produce a null count and `POSITION_POPULATION_NOT_QUALIFIED`.

Balance and allocation summary rows no longer silently drop missing values or
sum multiple assignments without ownership/census proof. One qualified
single source value remains visible, including a genuine zero; otherwise the
aggregate has `FINANCIAL_AGGREGATE_SOURCE_NOT_QUALIFIED` and null aggregate
values. Multiple allocation IDs are kept distinct and conflicting position or
allocation identities mark the relation partial, including a repeated source
ID whose currency, account or instrument changes. Position counts and those
single-source summaries also require the same epoch, sequence and payload
digest as the identity relation. Single-source availability is **not** proof
of qualified portfolio NAV, carrier ownership or economic PnL.

The owning generator, `execution-alpha-resource.v1` schema, generated
`execution-serving-reads.d.ts`, producer-written synthetic fixture and
contract snapshot were updated. Conditional schema tests reject false
`AVAILABLE`, missing reasons and fabricated PnL. **Historical blocker,
superseded by the later Alpha consumer follow-through:** at this checkpoint
`readProfileEnvelope` accepted the V1 envelope, but
`readAlphaFleetItem` rejected its nullable financial fields, so the Alpha
detail disappeared. The later fix uses a separate V1 Resource reader instead
of widening Fleet; see the follow-through below. At this checkpoint API
version-dispatch alone passed **7/7** but did not prove the screen:
Alpha canonical + model suites returned **99/100**, with
`canonicalServing.test.tsx:33` failing because the reader returned null.
UI/browser and visual acceptance remain open.
When auto-selection finds the same account in multiple environments, the
profile reader now withholds derived headroom and broker differences; its
existing raw selected-profile display remains marked `partial` and still
requires consumer review for that ambiguous case.
The existing response represents a withheld broker comparison as an empty
`differences` array; it does **not** by itself prove the account is reconciled.
This checkpoint adds `derived.differences` to Account/Broker capabilities and
`resource.account.differences` to the unscoped Account resource. The shared
`ComparisonCapability` type is generated in `execution-profile-read.d.ts`:
`AVAILABLE` means every authorized balance row was compared in one qualified
snapshot, **not** that the values match; `PARTIAL` means at least one but not
all could be compared; `UNAVAILABLE` comes with a typed reason. Each row's
`in_sync` remains the actual comparison outcome. The resource capability uses
the same states/reasons; scoped V2 currently does not publish this derivation.
Claude must use the capability and row outcome together, and treat missing
capability as not published, never as `in sync`. The resource V1 body does not
yet have its own dedicated generated schema for this capability.
The Account profile schema also now accepts the existing source capability's
redacted `relations: []` and optional non-negative lineage counters. Previously
the producer could return those facts but its published schema rejected them.
The focused test validates a response emitted by the actual service against
the revised schema; negative fixture tests reject invalid counters and
inconsistent comparison state/reason combinations. This is still a synthetic
source response, not a real Edge carrier receipt.
The resource reader's existing `SYNC_*` binding label is now withheld as
`NOT_PUBLISHED` if the broker relation is partial/truncated, a profile is
unavailable, environments mix, timestamps are invalid, or the newest
observation is ambiguous. This remains a broker-sync label, **not** proof of
credential validity or a qualified live credential state.

Focused existing reducer, financial composition/recovery, command STATUS,
transport, history budget and health tests passed. These are local test inputs,
not a qualified Edge carrier, an ownership/census proof, or a real gateway
receipt. The existing local recovery must preserve the same intent/original;
no command/Live was activated. Complete carrier same-snapshot/currency and
ownership reconciliation, APPLIED→ACK, and STATUS against a commissioned
gateway and original separately; don't infer them from fixture success.

STATUS preparation review found two local defects. A reused prepared context
checked authority twice but did not compare the second returned fingerprint;
it now refuses a change between the checks. A failure after reserving a new
context but before returning its token also left that *unissued* reservation
occupying capacity until expiry. The failure path now removes only the exact
reservation when there is no issued/pending delivery. It does not remove,
replace or acknowledge an issued, ambiguous or UNKNOWN original/custody.
Focused regression tests exercise the changed fingerprint, six failed
preparations and a subsequent successful preparation. STATUS authority and
composition suites passed **55/55**; loopback-only transport suites passed
**76/76** after sandbox permission for loopback. Their first run hit
`listen EPERM`; neither run commissioned a gateway, issued a real identity,
sent a business command or proved restart against actual PostgreSQL.

Further STATUS concurrency review reproduced two cancellation defects:
the first caller's aborted signal could fail an otherwise-live coalesced
caller, and an already-aborted caller could receive the shared preparation.
The same-original preparation now captures its input before scheduling,
shares the operation independently of individual caller signals, and refuses
each canceled waiter promptly without canceling another waiter or creating a
new original. If every waiter cancels, the shared authorization work may
still finish and leave its unissued, bounded context until the existing TTL
and pruning; it does not issue a native identity or send a command. This is
not a new durable cleanup/recovery guarantee. Four synthetic regressions
cover initial/during-read abort and caller mutation; the affected authority,
transport, gateway binding and composition suites passed **164/164** after
allowing local loopback. The first sandbox run refused loopback with EPERM
(96 pass, 68 fail) and is not a PASS receipt. Real gateway/original, source
custody and restart acceptance remain open.

The STATUS delivery authority fence also previously ignored a caller's abort
before or during its final asynchronous authority read. It now refuses a
canceled caller before that read and after its result, and checks again before
marking a retained read complete. The shared source operation is not canceled
or settled on behalf of another caller. Two synthetic regressions first failed
on the old path and pass with the fix; the same five suites were rerun
together with permitted local loopback: **166/166 PASS**. This does not prove
physical HTTP egress cancellation, source revoke, or real gateway recovery.
An additional authority regression verifies an aborted caller cannot mark
retained-read custody completed and that the same original remains reusable;
the authority suite alone then passed **28/28**.
The subsequent `tsc --noEmit` was started before the last fence edit and
interrupted (exit 130) after system load increased; it is **not** a final
typecheck PASS. Re-run once on the stabilized integration candidate. The
earlier successful build predates this STATUS fence edit.

Capacity/shutdown follow-through: a synthetic held authority read showed
that distinct preparations could accumulate before the old registered-context
limit was checked. The preparation map is now capped at `maximum_contexts`;
an exact retry still joins its existing preparation at the limit. A stopped
authority rejects new preparations before I/O. A second regression showed that
canceling the caller could remove the outer use from composition accounting
while its shared preparation still ran. Authority snapshot now exposes the
in-flight preparation count and composition shutdown waits for it; a hung read
returns the existing `COMMAND_STATUS_COMPOSITION_SHUTDOWN_PENDING` at the
deadline, never a false `STOPPED`. No issued/UNKNOWN custody is cleared.
Five affected suites passed **169/169** before the last stop-admission guard;
the final two authority/composition suites passed **58/58** afterward, including
a held preparation canceled before shutdown. These are synthetic/local tests,
not a real source shutdown, restart or gateway receipt. The last separate
typecheck predated these changes and is not a candidate typecheck receipt.
An additional regression exposed unlimited waiters joining the *same* pending
preparation even after distinct preparations were bounded. Concurrent waiters
are now bounded by `maximum_contexts × maximum_requests_per_context`, with a
slot released exactly once on cancellation or settlement; a rejected waiter
does not cancel or replace the shared operation. Shutdown observes both
preparation and waiter counts. The five affected suites were rerun together
after these changes: **172/172 PASS** with local loopback. A separately started
build was stopped with exit 130 before these final changes and is not a PASS.
Further review found that decrementing the waiter count alone did not detach
its promise callback from a held shared authority read. A shared preparation
now has one completion listener and a bounded explicit waiter set; abort
removes the waiter from that set. A test cancels 128 successive callers while
the same source read is held and checks that the set remains empty. The five
affected local suites then passed **173/173** with loopback. A second attempted
build was also interrupted (exit 130) before this final fix and is not a PASS.
Subsequently, `npm run build` for Control API exited **0** on the stabilized
working tree. The tracked `apps/control-api/src` + `packages/contracts` diff
SHA-256 was `ba220288ba6cc4e808fd6f53c1618254be709b7e86e161376c8939c06d3e0952`
both before and after the build; the untracked
`account-comparison-availability.ts` was
`bc504af8404e3ec06ee127d21c9aabb49a4ffde97d87728a95554e2d67aa7e4d`.
This is a backend build, not a normal hook or a final candidate/source receipt.

Read-only Edge mailbox check at **2026-11-02 11:05 UTC**: the inspected
`portal-execution-edge-upgrade-v1_2` checkout's HEAD was `636d58a7`; its
newest matching Core/Edge packet in EPG10-08 was dated 28 October. This
bounded check did not establish that no other source or channel exists, nor
qualify a binding, grant, gateway or financial source. No remote file, runtime,
database or permission was changed.

## 6. Qualification preparation

The migration-preservation, readiness, workload-selection and reservation
tooling tests passed with synthetic inputs, including negative preflight,
Canary-as-stage, approved target/14-budget pin checks and stop/cleanup guards.
This is not a PostgreSQL restore/rollback rehearsal on the final candidate,
G2 measurement, approved calibration/budget, or connected/browser acceptance.
Re-run the affected migration/restore slice on an isolated database for the
final schema/candidate; run actual load only with the required approved inputs.

### Disposable PostgreSQL follow-through — 2026-11-02

The earlier absence of a local server was overcome without using an existing
database: PostgreSQL **16.15** was unpacked into a mode-0700 temporary cell
from PGDG packages. The PGDG InRelease signature was checked against public
key fingerprint `B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8`; package hashes
matched that signed index. The server package SHA-256 was
`7c9ef4472262145d08d7263e6ba0dededa5a58e1ec71e58627d973c40c9eb59f`.
The server listened only on the cell's Unix socket (no TCP); the test client
verified `current_database() = portal_elpg16_disposable`, server version and
`inet_server_addr() IS NULL`. No system package or existing DB was modified.

On the working tree based on `f5993a79d3df54257a1ac0b9413a1662060f3ab1`:

- `elp204-positive-parent.spec.ts -t 'approval evidence'`: **2 PASS, 354
  deliberately skipped**. This covers real PostgreSQL and Nest/Fastify HTTP,
  typed dark source, wrong workspace, uncommissioned governance, and
  mid-read membership revoke. The positive source/field grant is synthetic;
  it does not commission evidence or Edge.
- `elp207-command-current-authority-pg.spec.ts`, `migration-recovery.spec.ts`
  and `phase2-binding-and-integrity.spec.ts`: **28/28 PASS** on the disposable
  PostgreSQL, including Core transaction rollback on authority changes and
  legacy-ledger migration recovery. The command source is TEST_ONLY, not a
  real gateway or upstream execution.
- M-6b seed and verify phases: **1 PASS + 1 intentionally skipped** in each
  phase, with `pg_dump -Fc` and `pg_restore --exit-on-error` into a separate
  fresh database between them. All 11 checks passed: the restored old holder
  was valid before reset; wrong epoch failed; correct reset fenced its renew,
  release and commit; a new epoch/token committed; both retained revisions
  remained byte-identical. Dump SHA-256 was
  `857db8a1c0ccec6c980ca21a1303ea6542305b2133482c1485536dfa7412296e`;
  verification JSON SHA-256 was
  `68c689e0897314c1fd70acb987a9228a96504cf1960f188b4065dbd34b0b31f1`.
  These synthetic temporary artifacts were deleted after recording the hashes;
  this is a mechanism rehearsal, **not** production-size DR/RTO, source
  recovery or the final-candidate migration/rollback gate. Timings include
  tool orchestration and are not performance evidence.
- The primary test DB had 149 migrations applied through
  `1723680000155_execution-command-status-original-fingerprints`. Tracked
  `apps/control-api` + `packages/contracts` diff SHA-256 at test time was
  `e18c33731f56b7ee834ebe0bfa4c03f13eb82e8fd8630ed3d72400aaede8d432`;
  this excludes untracked files and is not a final candidate SHA. Relevant
  untracked test/source hashes are respectively
  `f0f31d60b0742a48e5025c525ca8fefedc351f0352d67aa7c61881843409dfb4`
  (`approval-evidence-http.spec.ts`) and
  `bc504af8404e3ec06ee127d21c9aabb49a4ffde97d87728a95554e2d67aa7e4d`
  (`account-comparison-availability.ts`).

Cleanup: the PostgreSQL server was stopped and its single-use socket, three
synthetic databases, temporary package extraction and dump were removed with
the exact cell directory; no user database, stable, dev or service was removed.
The full normal hook, the final-candidate restore/rollback and genuine source
acceptance remain open.

### Operations health source review — 2026-11-02

`OperationalReadService.prepareQueue` already binds the optional source into
the same scoped snapshot and `readQueueSnapshot` counts the authorized,
filtered whole population rather than the page. Migration 154 **does define**
`execution_operation_queue_health_v2` as a left join; an existing synthetic
PostgreSQL test checks base-row preservation on its fixture. Do not repeat the
older statement that the view has no migration. Neither the migration nor that
fixture establishes a commissioned source or proves the installed view has
the same definition. `createOperationalQueueHealthSource` validates only
the *shape* of `schema_sha256`; it does not recompute or compare that value to
the installed DB view. A configured digest is therefore **not schema-proof**.
Before a health source is enabled, the owning Core/Edge commissioning slice
must define the canonical schema/view digest, verify it against the installed
view, prove its base-population identity and one-to-one join under the same
authorized snapshot, and cover altered-view/missing-row/duplicate-row and
revoked-scope negatives. Do not choose an undocumented digest algorithm,
assume the existing string proves the view, or mark health `AVAILABLE` from
this source-only review. Existing health projection remains dark by default.

Focused follow-through on a separate PostgreSQL 16.15 Unix-socket-only cell:
`operational-health-publication.pg.spec.ts`,
`operational-health-publication.spec.ts`, `operational-health-source.spec.ts`,
`operational-queue-health.spec.ts`, and `elp204-operational-current.spec.ts`
passed **147/147** in one sequential run. This includes the checked-in
migration/view with TEST_ONLY publication, source-proof doubles, scoped queue
and negative cases; it does not verify a commissioned source or installed
runtime schema digest. The server was stopped and its exact temporary cell
and synthetic databases removed afterward; no existing database was used.

Read-only Edge mailbox check on 2026-11-02: the designated Edge worktree still
had HEAD `636d58a7` and concurrent tracked/untracked WIP; its latest mailbox
filenames by mtime were dated 2026-10-28. No fresh connected acceptance was
inferred from this check, and no files, services, grants or credentials were
changed on Edge. Claude's checked consumer branch remained `c7429e1ed`; its
Alpha V1 reader still expects non-null money in the affected deployment rows,
so the recorded consumer blocker remains open.

### Native custody and ROOT/CURRENT follow-through — 2026-11-02

A second isolated PostgreSQL 16.15 cell used the same packages and checked
SHA-256 values above, with TCP disabled and a private Unix socket. On this
working tree, `elp210-native-core-obligations.spec.ts` passed **31/31**;
`elp210-native-root-provider.spec.ts`,
`elp210-native-current-relations-provider.spec.ts`, and
`elp210-native-root-coordinator.spec.ts` passed **50/50** together. These
exercise Core custody, terminal/recovery, ROOT/CURRENT and local finite
delivery against real PostgreSQL with **TEST_ONLY external source vectors**.
They do not establish real Edge source, entitlement or connected acceptance.

The attempted `elp210-native-current-manager-account.spec.ts` run was **not
a pass**: 14 synthetic tests passed, but the 17 real-PG cases were skipped
because its guard requires the named Docker test-container hostname and
database. The Unix-socket cell is not that environment. The guard was not
changed or bypassed. Run those cases using the approved isolated container
when Docker access is available. PostgreSQL was stopped and its exact
single-use cell and synthetic DB removed; no existing database was used.

## Tests performed on this working tree

| Scope | Result |
| --- | --- |
| Approval Evidence focused service/controller and synthetic HTTP tests | 34/34 PASS |
| Approval Evidence, equity-source and positive-parent contract suites | 104/104 PASS |
| Sibling schema and fixture negative-contract suite | 96/96 PASS (contract only; no serving proof) |
| Canonical contract fixtures, including comparison capability state/reason negatives | 143/143 PASS |
| R-B/R-C focused frontend consumer tests | 109/109 PASS |
| Financial, economic, STATUS, history-budget and health suites | 215/215 PASS after rerun with loopback permission |
| Manager economic runtime dataset/series and financial batch suites | 87/87 PASS |
| Economic runtime targeted follow-up, including foreign proof currency and foreign source-row currency on both dataset and series | 31/31 PASS; synthetic owning-source mapping, not financial-source commissioning |
| Profile and resource readers, including actual service response against schema, authority-change refusals, exact-money checks, position-source and aggregate cases | 64/64 PASS before final snapshot-fence refinement; latest relevant Resource run listed separately |
| Resource scoped, Resource V1 and producer Alpha/subject records | 54/54 PASS after final same-snapshot and source-identity refinements |
| Profile/Resource controllers, readers and native-account test file | 101 PASS, 17 SKIP without `TEST_DATABASE_URL`; synthetic tests only |
| Controller-context follow-up including foreign workspace tests | 21/21 PASS; overlaps the preceding run |
| Paper read, blotter scope, existing history HTTP and controller-context suites | 145/145 PASS after Paper/Live authority changes; HTTP uses in-process Fastify and synthetic sources, not a network/database measurement |
| Paper workbench HTTP revoke check | 1/1 PASS through Nest/Fastify injection with synthetic source; 31 other cases deliberately deselected in this focused run |
| Serving-read fixture/negative contract tests | 14/14 PASS |
| Alpha API version-dispatch only | 7/7 PASS; not full-screen acceptance |
| Alpha canonical-serving and model consumers | 99/100: one failing consumer requires nullable V1 integration by Claude |
| Paper history HTTP and current-source error filter regression | 32/32 PASS |
| Migration/qualification preparation and workload Node tests | 180/180 PASS after rerun with subprocess permission |
| `python3 packages/contracts/tooling/snapshot.py --check` | 716 files match |
| Control API `tsc --noEmit -p tsconfig.build.json` | PASS (exit 0) after STATUS preparation and preceding authority/financial refinements |
| Account frontend model/profile fixture tests | 367/367 PASS; no real-source/browser claim |
| `git diff --check` | PASS |

The first sandboxed runs of the loopback/subprocess suites encountered local
permission denials (`EPERM`); they were rerun successfully with the needed
permissions. These suites overlap and their counts are not a coverage total.
For the foreign source-row currency case the first new test expected the
wrong reason; the implementation correctly returned
`ECONOMIC_COMPARABILITY_MISMATCH` and, after correcting the test expectation,
both dataset and series passed. No production change or currency conversion
was introduced by this follow-up.
The new HTTP test first failed to mount its synthetic guard, then exposed the
missing 401 cache header; after fixing the harness and the filter it passed.
The earlier PostgreSQL/HTTP receipt belongs to its recorded commit, not a new
real-PG run for this working tree. At that earlier point no local
`initdb`/`pg_ctl` was installed and the available Docker socket denied access
even to a read-only container list; the later isolated PGDG-based follow-through
is reported above. No existing database was reused or mutated. An earlier attempt to run
`phase2-binding-and-integrity.spec.ts` failed its setup with `EPERM` connecting
to the default `127.0.0.1:5432`; all nine cases were skipped, and teardown
also failed because the pool was not initialized. Inspection showed the suite
calls `truncateAll` in `beforeEach`, so **do not retry it against the default
database**: it needs an explicitly isolated, disposable test database. No
truncation was executed in this denied-connection run. The full normal hook and final integration
gate have not run for this change. At inspection the filesystem was 83% used,
below the repository's 20% free-space threshold for a disk-intensive build;
do not bypass that guard or silently call a partial run a full gate.

## Allocation-to-deployment scope consistency

Two synthetic negative cases reproduced unsafe scope expansion: an allocation
could point at a different deployment while publishing contradictory account
or strategy, causing a Portfolio response to include that deployment's account
and order; the same contradictory allocation could also appear under Alpha.
The retained Resource reader now checks that a portfolio allocation resolves
to one unique visible deployment and that each published account, strategy and
venue agrees before using it for portfolio membership. The same check applies
when selecting allocation facts for other resource kinds. Missing or mismatched
links are withheld and the relation reports a partial reason; optional fields
that were not published are not invented. These checks use only the visible
snapshot; they are not an ownership/census or final native authority proof.

The two cases failed before the repair. Four affected suites (Resource,
scoped Resource, controller context, and producer fixture equality) passed
**162/162** after it. No UI, backend runtime, source grant or public schema was
changed. Order-detail is still contract-only: the existing blotter provides a
scoped page, not an independently authorized, complete single-order projection
with source-qualified fee/intent semantics.

Follow-through: malformed non-string/empty published account, strategy or venue
is a contradiction, not an absent optional field, for both allocations and
explicit-deployment transactions. An allocation whose owning Alpha/account
identity matches but names a deployment absent from the visible projection now
marks the allocation set partial rather than being silently dropped before
totals are derived. The duplicate-ID lookup is linear in the visible deployment
population. After these checks, the same four focused suites passed **165/165**;
an intermediate run caught the missing-deployment case before the final fix and
is not counted as a pass. This remains a visible-snapshot check, not a global
ownership/census assertion.
An attempted Control API typecheck was interrupted (exit 130) because source
changed while it was running; it is not counted as a pass. Run typecheck and
the normal integration hook once on the frozen final candidate.

## Alpha health and currency availability follow-through

The legacy Resource Alpha summary previously interpreted a missing/partial
reconciliation relation as no findings and declared active deployments READY;
it also called an absent deployment relation RESEARCH_ONLY. A focused test
reproduced the first case. The producer now returns deployment and aggregate
`UNKNOWN` when the relevant reconciliation/deployment population cannot be
established from the complete same-snapshot projection. A known inactive
deployment or open finding still reports ATTENTION/FINDING; a complete empty
reconciliation may report READY, and only a complete empty deployment
population reports RESEARCH_ONLY. Resolved/closed/dismissed findings alone
do not create ATTENTION. The result remains a Portal projection summary, not
a source health qualification. Balance aggregation also refuses to mark a
currency group AVAILABLE if any contributing currency is `UNKNOWN`.

The Alpha V1 deployment health enum and generated serving types now include
`UNKNOWN`; the canonical TEST_ONLY producer fixture and contract snapshot were
regenerated. Resource/scope/controller suites passed **157/157**; the latest
expanded health positive/negative case passed separately **1/1**. The producer
fixture equality check passed **1/1**; schema and fixture suites **157/157**;
the frontend fleet health model **26/26**, where unknown values render as
unknown rather than green. These overlapping synthetic tests do not establish
real source health, browser acceptance or a current-source entitlement. Claude
should consume `UNKNOWN` as unknown, never READY, in any consumer with its own
closed health mapping. The previously documented Alpha V1 nullable-financial
consumer issue remains a separate landing blocker.

Edge worktree was rechecked read-only at
`feat/execution-edge-upgrade-v1_2@636d58a7c4368a617903734ab1d0ce933d2804ca`;
the newest Core-related mailbox documents remain dated 28 Oct. Its substantial
existing uncommitted work was not changed. This observation does not prove a
current binding or any runtime status.

## Resource tuple and retained identity collision follow-through

The Resource reader formerly composed its fallback deployment tuple with an
unescaped unit-separator. Source projection values are not the validated URL
resource id; in a synthetic regression, separator-containing account/venue
fields produced the same string for two different tuples, and a foreign order
was assigned to the selected deployment. The test first reproduced that
failure. Tuple keys now use a structured JSON array, preserving exact field
boundaries and the existing unique-tuple requirement. Retained-fact dedupe
keys use the same collision-safe representation so distinct source
identities cannot be silently collapsed by embedded separators. This does not
claim that such an order existed in a commissioned source, or substitute for
final current-human/field authority and physical egress custody.

After the fix, Resource, scoped Resource and controller-context focused
suites passed **151/151** with synthetic projections; the additional distinct
retained-order identity check passed **1/1** separately (other cases skipped
by test selection). Existing workspace/authority gates are unchanged. No UI,
public contract, source authorization or runtime was changed for this fix.

Further scope review reproduced four more synthetic failures: an order with an
explicit deployment ID was previously accepted even when a published account,
strategy or venue contradicted that deployment; and a deployment ID repeated
on a different account within the visible projection was accepted after
filtering to the selected account. The reader now rejects contradictory rows,
marks that relation partial (`EDS04_TRANSACTIONAL_SCOPE_AMBIGUOUS`), and
requires the deployment ID to be unique across the available visible profile
projection before deriving scope. A transaction whose extra fields are absent
can still use an unambiguous explicit ID. Three affected suites now pass
**156/156**, including these negative and positive cases. This is a check
within the visible projection, not proof of uniqueness in hidden source data,
final egress custody or current-human authorization. The previously documented
retained-order collision test now uses differing instrument/symbol fields under
the same deployment rather than a deliberately contradictory account, to
remain consistent with the stricter scope rule.

## Operations health view-drift follow-through

The optional `createOperationalQueueHealthSource` binding now requires
`view_definition_sha256_v1` in addition to the existing `schema_sha256`.
The latter keeps its existing meaning and is not recomputed or presented as
verified. The new value hashes a versioned JSON descriptor comprising
PostgreSQL `pg_get_viewdef` and ordered `(attnum, attname, format_type)` for
the named `public.execution_operation_queue_health_v2` view. The actual
descriptor is checked inside the same page transaction, before links, grouped
health and the result are returned; a missing, oversized, malformed or
changed view fails closed. The commissioning owner must capture and review
the expected pin from the qualified installation; it is not a fixture value
or a self-authorizing API field. The internal injection seam and production
source remain uncommissioned. A definition fingerprint alone does **not**
verify underlying relation/function bodies, migration identity, the
one-to-one population invariant, scope authority or financial/Edge source.
Those remain explicit commissioning gates. Catalog inspection adds one query
to requests using this optional binding; load/latency is not qualified here.

Five affected suites passed **151/151** using PostgreSQL 16.15 on a private
Unix socket, real checked-in migration bytes, and TEST_ONLY source fixtures.
The new PG case verified the descriptor then changed a view column inside a
transaction and observed rejection; the transaction was rolled back. The
exact disposable server was stopped and its private cell removed. These are
isolated local tests, not a connected Edge or production acceptance. No
OpenAPI or UI change is involved; a source owner must add the new internal pin
before enabling this optional binding. The Control API `npm run build`
(`tsc -p tsconfig.build.json`) subsequently exited 0 on this working tree;
this is not the full integration hook.
PostgreSQL's view deparser and type formatting can depend on server version and
session `search_path`; commission the pin under the exact runtime role, server
version and search path, and requalify it after relevant upgrades. A mismatch
fails closed; a pin from a different environment is not a portable receipt.

## Alpha subject activity detail-scope audit

The V2 Alpha orders/fills reader passes no separate entity predicate to the
mirror. Investigation found this is intentional only because the authorization
scope is already minted for the exact requested Alpha: `purposeAllows` narrows
the allowed correlated tuples, and the mirror applies the same scope predicate
to both page and coverage. The predicate also rejects a partial account row
that could belong to a peer Alpha, even if the user independently has access to
both. A focused regression now checks the Alpha strategy mapping, peer strategy,
shared account and SQL population under whole-business authority. The focused
suite passed **65/65**, with **41 PostgreSQL cases skipped** without its DB;
the existing PG subject test is a separate receipt, not rerun in this check.
This is synthetic capability coverage, not source qualification or proof of
final native custody through HTTP egress. The Control API `npm run build`
subsequently exited **0** on this working tree; `git diff --check` passed.
Neither command is the full normal integration hook.

## Retained negative-result fences — 2 Nov 2026

Seven failing TEST_ONLY regressions first reproduced two independent cases:
(1) a data-dependent error could leave `ExecutionReadScopes.deliver` without
the final authority check; (2) a scoped deployment resolution or local relation
could return EMPTY/PARTIAL/unavailable from a snapshot that was replaced before
the outcome. `deliver` now revalidates after both success and a held error;
if the same nested revoke gives a uniform `EXECUTION_READ_NOT_AVAILABLE` 404
and changes the outer fingerprint, the existing non-disclosing 404 is retained.
A different final authority failure is not masked. The retained source now
checks the exact snapshot on its negative and error outcomes as well.

This does not add an order-detail producer, combine separately authorized
Profile relation scopes into one atomic authority cut, or retain native
custody through physical HTTP dispatch. These remain separate work. Source
data, gates and grants in the tests are synthetic, not Edge commissioning.

- Initial reproduction: **7 failed, 1 passed**, before the fix.
- Initial six affected source/service suites: **306/306 passed** before the
  nested-404 compatibility refinement; after that refinement the four
  retained/adapter/bracket suites passed **134/134**. The final standalone
  negative-fence suite passed **11/11**, including final-authority-503 priority.
- A fresh private Unix-socket-only PostgreSQL 16.15 cell passed **118/118**
  scoped-authority tests, including a real DB grant revoked during a failing
  read. Four History/financial/subject suites passed **55/55** against that
  disposable DB. The server's `listen_addresses` was empty and its selected
  database/socket were verified before migrations; it was stopped and the
  exact TEST_ONLY cell removed. This is not a real Edge/HTTP/browser receipt.
- One longer test batch was interrupted and is not a pass. A subsequent
  batch without `TEST_DATABASE_URL` had **22 passed, 33 skipped and one failed
  suite**: the suite attempted its documented default `127.0.0.1:5432`, was
  denied by the sandbox, and never touched that database. The separate 55/55
  run above used the explicitly verified private PostgreSQL cell instead.
- A subsequent `npm run build` / `tsc -p tsconfig.build.json` hit its
  150-second deadline and exited **124**, so that attempt is **not a pass**.
  The tracked Control API source diff hash before and after
  this attempt was
  `692147b5def443ed84fe490ed73ae6f37292be77051af37b9ffd364643065040`;
  the separately untracked source file `account-comparison-availability.ts`
  was `bc504af8404e3ec06ee127d21c9aabb49a4ffde97d87728a95554e2d67aa7e4d`.
  A subsequent `tsc -p tsconfig.build.json --noEmit --diagnostics` completed
  successfully in 179.56 seconds after the fence changes, but before the
  financial follow-through below. A later no-emit typecheck of the financial
  source also passed, as recorded below. Neither is an emitted build or normal
  hook.

## Deployment financial detail follow-through — 2 Nov 2026

The Alpha/Portfolio/Account legacy Resource360 summary already guarded
aggregate balances and allocation, but its nested deployment detail could
still display one row from a partial balance/allocation population, silently
select one duplicate, attach an allocation in another currency to the
deployment currency, or stringify a lossy fractional JSON number. A TEST_ONLY
regression reproduced the partial-balance error before the fix.

The same Resource360 producer now requires the deployment and relevant
account/balance or allocation relations to be complete, untruncated and
bound to the same single source snapshot before displaying nested values.
The exact account/currency and deployment/currency selection must be unique;
missing currency or conflicting duplicates keep the affected figure null.
Only exact decimal text or safe integral JSON numbers can produce a money
value; an explicit source `0` remains `"0"`. Currency fallback requires a
qualified unique relation. Raw observations remain available in their own
panels. The Alpha allocation summary retains each observed currency as an
`UNAVAILABLE` label when amounts cannot be qualified; it does not adopt a
first conflicting record. This does not add ownership/census proof, convert
the values into account equity or certify the real financial carrier.

Verification: six affected Resource/scoped/economic suites **249 passed,
41 skipped** (the 41 need their own disposable PostgreSQL; no default DB was
used). Two contracts/fixture suites **157/157 passed**. One pre-fix regression
failed as expected; two intermediate runs each had one failing expectation,
which were corrected by preserving typed unavailable currency labels and
testing all conflicting labels. The final combined six-suite run passed as
stated. Synthetic test results do not qualify a source, physical HTTP custody
or connected/browser acceptance. `resource-read.service.ts` at this checkpoint
has SHA-256 `0e02454fa0d581b5cabab7592b8884cb4448b7ec1b47bc4fe96a81aede5e3c6c`;
`resource-read.spec.ts` has SHA-256
`faa89552274b02e5a6c0e4033aa90434ea8bdb9a25873e811841e49afe32a554`.

The real producer/contract fixture check initially failed solely because an
exact source `"38900.10"` is now retained as-is instead of formatted as
`"38900.1"`. The named synthetic Alpha fixture was regenerated using its
checked-in producer (`BE_P3_WRITE_FIXTURES=1`, Alpha case only); a subsequent
non-writing producer/schema check passed **3/3** and the contract suites
again passed **157/157**. The regenerated fixture SHA-256 is
`b13984170ff9bff186e8c41ebd7dd53667bb124eae3fc2a8321c209217c12ab1`.
The final `tsc -p tsconfig.build.json --noEmit --diagnostics` passed **exit 0**
in 182.68 seconds against the source hash above. This is not an emitted build,
the normal hook, or an integrated Claude consumer gate.

The separate Resource360 change above does not establish a combined
cross-scope authority guarantee. The follow-through below addresses the
specifically reproduced retained-derivation race, not all other consumers.

## Retained derivation final-authority follow-through — 2 Nov 2026

A deterministic regression using genuine `ExecutionReadScopes` and synthetic
versioned source grants first reproduced an earlier Paper profile being
returned after its accepted source leg was removed while a later Sandbox
profile was being fenced. The original implementation revalidated each scope
separately, so it never rechecked the earlier Paper leg after later I/O. This
is a local TEST_ONLY reproduction, not a report of a demonstrated real-world
incident or a qualified native provider.

`PortalDerivationsService` now holds the contributing scopes through the whole
retained result. A single-profile derivation uses the existing same-binding
composition. The cross-profile source-health composition is restricted to its
explicit retained relation purposes, a single actor/session/workspace, the
same source head within each profile, at most twelve scopes per profile and
36 in total. It fences each retained head, renews every original scope and
uses a final shared Core confirmation; it grants no new purpose or
cross-environment access. A metadata head disappearing before its raw
snapshot is now a fenced 409, not a stable missing profile. Tests also refuse
foreign actor/session, a different same-profile source head, and a non-health
dataset before executing the read. The generic Fleet ALL and same-binding
restrictions remain in force. Mixed legacy/scoped snapshots are refused.

The pre-fix revocation test returned a Paper result rather than rejecting; the
new implementation rejects with the existing non-disclosing 404. Three
focused suites (`elp2-retained-metadata`, `portal-derivations`,
`fe-cat-3-manager-all`) subsequently passed **48/48**. A preceding test run
correctly found that a complete grant loss returns the existing 404 instead of
the test's initially expected 409; the assertion was corrected to the actual
public denial, not to an available result.

After adding a full-capacity 36-scope positive and a 37th-scope refusal, the
retained-metadata suite was rerun and passed **15/15**. The related
read-projection/read-scope/negative-fence/positive-parent batch
then reported **76 passed and 515 skipped** because its PostgreSQL cases did
not have a disposable DB in this run. Those skipped cases are **not PASS**.

A second regression then reproduced a revoked caller receiving the detail
reader's data-dependent `N31_PROJECTION_STALE_CEILING_EXCEEDED` 503 after its
source read. The stale branch now performs the same retained authority/head
fence before reporting the error: a revoked caller receives the existing 404,
while a still-authorized caller still receives the original stale-source 503.
The three focused retained/derivation/Fleet suites passed **50/50** after this
fix; the two explicit stale/refusal regressions passed **2/2** after adding the
positive stale case. Neither is a live Edge or browser receipt.

An additional negative checked the case where the Paper metadata head is
absent. The scoped entry has no qualified dataset publication, so the service
refuses the entire cross-profile result with
`EXECUTION_READ_PUBLICATION_NOT_QUALIFIED` (503) before reading the missing
Paper snapshot; it must not reveal a `NOT_READY` profile by assuming access.
The first exploratory assertion expected the missing profile to be disclosed
and failed against this existing fail-closed behavior; no production code was
changed to satisfy it. With the corrected expectation, the same three focused
suites passed **52/52**. This remains a TEST_ONLY scope/publication check.

The stabilized Control API source passed `tsc -p tsconfig.build.json --noEmit
--diagnostics` with exit 0 in 174.38 seconds. At that checkpoint,
`read-scope.ts` SHA-256 was
`2b2325451f037dac342096e7ab822ed9a85b27ede1b73ccd0a872a6dd9735943` and
`portal-derivations.service.ts` was
`0285af9339a62b7275e0e187437c522500885c7783011e1c3a4089fd903f42a6`;
the then-focused test file was
`fa33f946537226338c37bd37f20ebe74315dae5a19ac4e4458264851061ee2e0`.
After the additional negative test above, its final SHA-256 is
`3706fd7235d50b699dd9527480e9b6be4d2e8c63e34de430fc6ae21dad91d47c`.
The tracked `apps/control-api/src` plus `packages/contracts` diff was
`237830fa4646a10402f0716d093f2cadac5eacea4b22375f70459a0c54b6e8e7`;
as a Git diff hash, it does not include untracked files. This no-emit check is
not a normal hook, integration commit, or runtime installation.

This is a retained, point-in-time Core authority fence. It is not a source-side
atomic cut across independent external writers, native physical-HTTP custody,
connected revoke/STREAM acceptance, or a claim that Profile/other aggregate
readers have the same cross-scope fence. Source publication and authority in
this suite were synthetic; the earlier real-PostgreSQL receipts retain their
original hashes and were not silently recounted on this code revision.

## Handoff and remaining gates

- Profile read composition now fails closed when a constituent read detects
  `EXECUTION_READ_ACCESS_CHANGED` or `EXECUTION_READ_AUTHORITY_UNAVAILABLE`;
  it no longer emits successful sibling rows as merely partial in those cases.
  Ordinary unavailable panels and per-relation denials retain their existing
  partial behavior. Focused Profile/Resource tests: **57/57 PASS**, including
  both change/unavailable regressions. This does **not** establish a combined
  final authority fence or native custody through physical HTTP egress: a
  revoke after the individual reads is still a separate open integration and
  security acceptance item. No claim of connected/native proof is made. One
  earlier typecheck was interrupted; a later typecheck of the source after
  the fail-closed and exact-money fixes exited 0; the final source also passed
  its separate typecheck after the same-snapshot and identity refinements.
- Claude: consume the current generated Approval Evidence type/error contract;
  preserve the dark/denied states and do not synthesize evidence from a 503.
  Account headroom can now be `UNAVAILABLE` with null maintenance/headroom
  when its financial facts cannot be tied to one complete authorized snapshot;
  keep that distinction from source-provided zero. No component change is
  included in this backend slice.
  Account v2 `headroomFacts` currently maps `UNAVAILABLE` to `UNKNOWN` and
  does not consume the new differences capability: preserve null rather than
  showing zero/in-sync, and connect the typed capability when integrating.
  **Blocking Alpha V1 follow-up:** adapt `readAlphaFleetItem` and view models
  to the new nullable amount/count and typed availability fields described
  above; the current candidate's canonical Alpha consumer test was rerun and
  reports **28 passed / 1 failed**, with `readAlphaFleetItem` returning null at
  `canonicalServing.test.tsx:33`. Do not land/install
  the contract/projection alone or re-label missing values as zero.
  Exact schema rules and focused consumer acceptance are in the
  [dedicated Alpha V1 handoff](./CLAUDE_ALPHA_V1_NULLABLE_HANDOFF_2026-11-02.md).
  The nested `deployments[].allocation`, `balance_total`, `balance_free` and
  `balance_locked` can now be null when the source is partial, duplicated or
  currency-ambiguous; keep the typed absence and an explicit source `"0"`
  distinct. Multiple unavailable allocation-currency rows can be present.
  Existing R-B/R-C consumer changes are already in the branch, not a request
  to reimplement the fixture UI.
- Core/Edge: commission actual source/field policy and native current authority,
  then separately verify READ and STREAM, revoke and recovery, financial
  carrier/proof and original STATUS. Edge remains the source coordination
  point; never reuse expired bindings or broaden stable credentials.
- ELP2-10 and ELP2-11 remain open: qualify source and calibration/bounds, run
  relevant coexistence/G2 and browser lanes, then final-candidate migration,
  restore, rollback and integration gate. No release/deploy is implied.

## Profile retained-composition authority follow-through — 2 Nov 2026

This addendum supersedes only the previous statement that the retained Profile
readers have no combined final authority fence. A TEST_ONLY regression using
server-minted scoped grants first showed a stage response still returning
earlier relation rows after the grant was revoked at the end of the last
individual read. It did not establish an incident against a connected source.

The stage and Account 360 retained readers now hold each already-authorized
relation through the combined body or held error, revalidate its original
scope and source head, and perform the common final actor/authority check.
The opaque collector is in-process only and cannot mint a grant. Cross-profile
Account composition is confined to the nine named account relations and
their existing required actions, one original actor/session/workspace, at
most one copy of each relation per environment and 27 scopes total. Normal
single-profile composition remains limited to 16 scopes. Different source
heads, changed actor/session, revoked/changed field policy, unavailable
authority, foreign purpose, duplicate relation and overflow fail closed;
ordinary separately denied panels keep their existing typed behavior. A
deployment-resolution absence also retains its authorizing obligation.
Account's independent environment reads are settled before finalization so
one early rejection cannot release a composition while siblings are running.

The pre-fix test failed by returning the earlier rows; after the fix the seven
affected retained-metadata, Profile, deployment identity, product-read,
scoped-stage, derivation and Fleet suites passed **251/251**. The Account
regression exercised all 27 original relation scopes; on alpha-grant removal
with the independent account grant still present, the existing failure is
`EXECUTION_READ_ACCESS_CHANGED` (409), not an available partial result.
`git diff --check` passed. Source hashes at this checkpoint:

- `read-scope.ts`: `52ee59b05bccdbe0b8f17ac2608ec184204b7e38bab3639e36273d67531ce6c7`.
- `product-read-source.ts`: `853bae132ae87e5bd1f893f7c918ee40509f5ca2589c090cc96b823012a352d1`.
- `profile-read.service.ts`: `4ba8c483374e1d7eb76e2a27607c190b014ef618c1db6458faf0894acee8e1a1`.
- `elp2-retained-metadata.spec.ts`: `973efec60199cfe32a6316d821bf781999833f13300b217ba1713db039ff079a`.

The stabilized source also passed `tsc -p tsconfig.build.json --noEmit
--diagnostics` with exit 0 in 177.80 seconds (peak reported memory 1,641,713
KiB). This is a no-emit typecheck on the working candidate, not an emitted
build, normal hook, installed runtime or final combined frontend gate.

These are retained point-in-time Core checks, not native custody through
physical HTTP egress, not a source-atomic cut across independent writers and
not proof of connected Edge revoke/STREAM/browser acceptance. Native-current
composition and other aggregate consumers require their own qualification.
Up to 27 scopes are revalidated for the Account environment-selection path;
the local tests are not a latency/G2 measurement. No API field, permission or
frontend component was added, and no runtime was installed by this slice.
The earlier no-emit typecheck hashes above apply to their named earlier
checkpoint only; the 177.80-second check above is the check of this candidate.

## Retained Resource 360 final-authority follow-through — 2 Nov 2026

A distinct TEST_ONLY regression used server-minted scopes and versioned
synthetic source legs to reproduce Resource 360 returning the earlier Paper
Alpha after its Paper authority leg was removed during a later Sandbox check.
The earlier nested, individually fenced reads did not re-confirm Paper after
the later check. This is not a claim that an incident was observed on Edge.

Retained Resource composition now retains every original contributing scoped
profile for one common final authority confirmation. The new internal path
accepts at most one scope per environment and three total, only the exact
`resource360` purpose for ALPHA, PORTFOLIO, ACCOUNT or BINDING, and each
existing action/resource requirement. Alpha still resolves its requested id
against its authorized tuple/strategy population; the final fence does not
make a collection scope into an additional Alpha grant. Account, Portfolio
and Binding scopes remain exact resource ids. Actor, session and workspace
are rechecked; mixed legacy/scoped reads fail closed, and the existing pure
legacy compatibility path is not converted into a V2 entitlement. This does
not change the separately held native Account HTTP writer.

The original cross-environment regression failed before the change and
passed after it. Eight affected retained, Resource, controller, Profile,
deployment, scoped-stage and derivation suites passed **232/232** after the
change. The first combined run had **12 failures** because an older synthetic
Resource fixture had no actor lease for the new final confirmation; the
fixture now supplies a bounded TEST_ONLY lease, and a separate negative checks
that an absent lease remains 404. Two later focused cases passed separately:
changed session during final confirmation (**1 passed, 26 skipped**) and
the allowed ALPHA/PORTFOLIO/ACCOUNT/BINDING purposes plus wrong actor,
dataset, action, resource id and duplicate environment (**1 passed, 26
skipped**). A first attempt at the Binding test correctly refused a missing
binding-lineage proof; the synthetic fixture then supplied an explicitly
TEST_ONLY binding-account lineage. These test counts overlap and are not an
additive coverage claim. `git diff --check` passed.

Source and final test hashes at this checkpoint:

- `read-scope.ts`: `935e135683cf57f83a38b2117415beecd76d3580cc6c7356342522d5950d2287`.
- `resource-read.service.ts`: `e885e6b2d5021b927a0c753ed43548fffe5cf229afd60d3b386e347e8d47a887`.
- `elp2-retained-metadata.spec.ts`: `25962cd497b6437f013861dd20c62e7093c966c87124e1195efaf2003f28370a`.
- `elp2-resource-reads.spec.ts`: `bede54a07ee82a157d85c06871bd373dfe80504e1fb79edb123b784f6ba4e1ee`.

The current source passed `tsc -p tsconfig.build.json --noEmit --diagnostics`,
exit 0 in 180.36 seconds (reported peak 2,138,931 KiB). This source-only check
does not typecheck the tests, emit a build, run the normal hook or install the
candidate; the earlier 177.80-second checkpoint predates the Resource change.

This is a retained point-in-time Core fence, not physical HTTP-egress custody,
a source-atomic cut across external writers or connected Edge/STREAM/browser
acceptance. Order detail, account-profile, reconciliation and obligations
sibling producers listed above are not created by this fix. Real financial
carrier and ownership/census, command gateway/original, final candidate
qualification and the Claude consumer integration still need their own
evidence. Read-only capacity during the no-emit check showed 109 GiB free
on a 621 GiB root filesystem (83% used); no disk-intensive build was started.

## Conditional-order parent authority follow-through — 2 Nov 2026

While reviewing the order-detail and other Execution readers, a TEST_ONLY
named-operation regression reproduced a narrower leg tuple returning an
observation from a conditional-order group on a shared account even though
the original parent row was not visible. The test failed before the fix
(one returned record instead of none). This is a local privacy defect, not a
claim that a real Edge incident occurred.

The named retained page and the scoped conditional-leg derivation now preserve
the original parent when joining, check that parent under its own current
dataset scope, and check the merged child against both dataset scopes. The
join still uses the same retained snapshot, preserves exact decimals, caps work
at 2,000 rows and does not evaluate field getters. A duplicate parent identity
is poisoned even if one duplicate is malformed. An explicitly contradictory
mode cannot be joined, and parent/child LIVE observations cannot be published
from a PAPER retained profile. The derivative's group is filtered the same way.
No new grant, public DTO field, order execution or frontend change is implied.

The expanded six-suite checkpoint passed **339/339** after adapting an older
Resource360 TEST_ONLY fixture to provide the already-required bounded actor
lease. An earlier attempt recorded 326 passes and 12 failures: eleven of those
were the fixture's missing lease and one correctly refused a test publication
that no longer contained any authorized account. The latter negative now
asserts the existing 404 and that raw projection data was not read. The final
environment and parent changes then passed the three directly affected suites
**115/115**; these counts overlap and must not be added. Tests include an
independent parent-publication refusal, shared-account/peer-DENY regression,
foreign mode, malformed duplicate/accessor, scoped derivation, and preserved
legacy derivation behavior. All fixtures and grants are TEST_ONLY.

Checkpoint SHA-256:

- `retained-business-aliases.ts`: `05a801fd86e892ccb7da607e74a81d88b161b27782f8de78b6d6c10b19785813`.
- `retained-operation-page.ts`: `4b9e9518d19c1e7e475a073560ba8bff1b262db3c6e87510ab6fe7abf6ee8a99`.
- `portal-derivations.service.ts`: `8785071788bc89a47a7b85ec6cd8fc1285dc8412c033b8e9f61fbfb416fa5bc7`.
- `elp204-retained-business-aliases.spec.ts`: `d533c563b4ada05e23d9ce89724d969097ee3b9226fd826502cba491a4b2f488`.
- `elp2-retained-metadata.spec.ts`: `30ebc1dd4119b867692eb79df2611ef981d747bd317dbc0ee83eed9380e46dc9`.
- `be-p15-record-detail.spec.ts`: `bb1325c51862d8a3e54d1db4bf1608291f044a47658c55b731e92230701b9366`.

This does not implement the separate `order-detail` sibling: its route does not
yet identify an environment, and retained orders/fills do not prove a complete
same-snapshot per-order fill and commission census. In particular an absent
fee is not a zero or proof of `NO_FILLS`. Qualified identity, source field
authority, pagination and negative responses must be resolved before claiming
that producer. Financial source qualification, Edge connected acceptance,
normal integration hook and the Claude consumer remain separate gates.

Claude handoff: there is no new component or field to wire. A conditional
leg whose original group is outside current scope, ambiguous, or explicitly
from another environment may disappear from a retained partial view; preserve
the existing partial/unavailable presentation and do not translate that
into an assertion that the upstream group or leg does not exist. The separate
Alpha nullable-facts consumer fix is still required before integration.

## Order stage timestamp follow-through — 2 Nov 2026

The retained Canary/Live typed-order `since` mapper previously used permissive
`Date.parse`. A local regression demonstrated that `2026-02-30T08:00:00Z`
became a fabricated 2 March instant and zone-less/date-only strings were
silently assumed UTC. It now uses the existing explicit-zone, calendar-checked
Manager timestamp parser; invalid, unzoned or null values remain null. A valid
offset is converted to UTC and nanosecond source precision is reduced to the
existing millisecond wire format. The existing nullable contract is unchanged:
null does not distinguish absent from malformed source. No order, timestamp,
fee, source authority or Live action is invented.

Four source/contract/scoped-stage suites passed **87/87** after the fix. An
earlier combined attempt had those same 87 passes but exited 1 because the
separate Canary integration suite attempted its default `127.0.0.1:5432` and
the sandbox returned `EPERM`; nine Canary cases were skipped and the teardown
also errored because setup had failed. No existing PostgreSQL instance was
used. This is not a Canary DB, browser or qualified-source acceptance receipt.

- `stage-rows.ts` SHA-256:
  `3d977f495566d369b15bc60820a7ae3270fa0b4163ca77887f5332fc71ffe094`.
- `stage-rows.spec.ts` SHA-256:
  `cbac6b35bb087af4b2deadcdb03bc2088111f573f229f14025a9f3296ce2d5e4`.

The Control API no-emit typecheck passed at the immediately preceding
conditional-parent checkpoint (200.50 seconds, exit 0, peak 2,233,961 KiB);
that checkpoint predates this separate timestamp source edit. After both
edits, the same `tsc -p tsconfig.build.json --noEmit --diagnostics` passed
again (208.12 seconds, exit 0, peak 2,156,677 KiB). This checks source types,
not tests, an emitted build, the normal hook, or a deployed candidate.

## Retained Paper source-mode compatibility — 2 Nov 2026

Two TEST_ONLY positive regressions exposed that an otherwise authorized
conditional-order parent carrying the source-preserved value `PAPER` could
be dropped when the request and child used `paper`. Both tests failed before
the correction. The affected named reader and scoped derivation now compare
mode values case-insensitively, without rewriting the source fields. The
same comparison was applied to the same-snapshot bracket parent/leg join.
Parent and child remain independently authorized and a `LIVE`/`live` parent
or leg is still rejected from a PAPER snapshot. Invalid modes, ambiguous
parents, conflicting accounts and denied scopes do not become authority.
This is a local retained-reader correction, not a new field, permission,
connected-source qualification or an order-detail producer.

The final affected four-suite run passed **155/155**. It includes both
case-preserving positive cases, uppercase/lowercase LIVE negative cases,
parent/child scope, duplicate/ambiguous lineage, field filtering and existing
derivations. Fixtures and grants are synthetic. The Control API source
`tsc -p tsconfig.build.json --noEmit --diagnostics` also passed on these
source hashes (exit 0, 209.57 seconds, peak 2,347,624 KiB); this is not an
emitted build or the normal hook. `git diff --check` passed.
The code remains uncommitted and uninstalled. Claude has no new field or UI
layout to add for this correction; the separate Alpha V1 nullable-contract
handoff is still required before integrated frontend acceptance.

Source/test SHA-256 at this checkpoint:

- `retained-business-aliases.ts`: `23dd2f9ac3fa050968df7f69e9449dcbebe4bde2e7f71ae90ca2db6c7d67691e`.
- `portal-derivations.service.ts`: `bef57ba0d3c2ccdf60d8e33d14720bd60e82f7efe25a03ff8b979ad3565f76d1`.
- `elp204-retained-business-aliases.spec.ts`: `f139ffa4a24ed06fa8a0064e20ecd509e96da16d425a8a36060aa9834868dc0e`.
- `elp2-retained-metadata.spec.ts`: `4e6baa424375d3bb75d3de565e2465df3ee9c102029881314eb24639fc692396`.
- `elp204-retained-bracket-legs.spec.ts`: `67c491f5fc4cd540e2a2319279eef310aa25ff89fb9b826ba585ee0bd1010bac`.

No additional final-candidate database, normal hook, browser, Edge source,
G2, calibration, connected financial or command acceptance is claimed.

Documentation checkpoint verification: **R0** for Markdown only;
`scripts/execution-tracking-test.sh` passed, and the referenced Unified,
receipt and Claude-handoff paths are checked locally. The staged diff check
is required before the R0 commit. This does not commit or qualify backend code.

### Canary PostgreSQL test follow-through — 2 Nov 2026

The Canary suite that could not reach its default database above was rerun
against a new single-use PostgreSQL **16.15** cell, not against that default
address or any existing DB. The PGDG `InRelease` signature was verified with
the pinned public key fingerprint `B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8`;
the signed index matched the downloaded server package SHA-256
`7c9ef4472262145d08d7263e6ba0dededa5a58e1ec71e58627d973c40c9eb59f`.
The server was unpacked rather than system-installed. Its Unix socket lived
in a mode-0700 temporary directory, `listen_addresses` was empty, and the
test connection verified `current_database() = portal_canary_disposable` and
`inet_server_addr() IS NULL`. Local socket trust was limited to that private
test cell; no shared or remote authentication was changed.

`canary-control-room.spec.ts` passed **9/9** using this isolated database,
including its actual migrations and Nest/Fastify paths with source-dark test
data. The test file SHA-256 was
`fda9d980889289703200debbd57643c564d3d3ec4fef3fc86071e82167e36509`;
the `stage-rows.ts` SHA-256 was
`3d977f495566d369b15bc60820a7ae3270fa0b4163ca77887f5332fc71ffe094`.
The first sandbox attempt to bind the private socket was denied; the approved
isolated test then ran with elevated socket access. After the test, the server
was stopped, the temporary socket, synthetic database and downloaded/extracted
packages were removed, and no process for that cell remained. No existing DB
or service was modified. This supersedes the earlier **NOT RUN** disposition
for this particular suite only; it is not a real Canary deployment, native
source, browser, final-candidate migration/rollback or G2 acceptance.

At 12:55 UTC the approved Edge worktree was checked read-only again: HEAD
remained `636d58a7c4368a617903734ab1d0ce933d2804ca` and the newest twelve
files in its EPG10-08 mailbox were dated 28 Oct. This bounded mailbox check is
not proof that no other channel exists or that a source/grant is qualified;
no Edge file, credential, database or runtime was changed.

## Account identity, lineage and cursor follow-through — 2 Nov 2026

**SOURCE CANDIDATE, not installed/committed.** This follow-through is on
`docs/research-loop-plan` at base `f460537b874d1a9f4ce7db572433359045a12707`.
It addresses independently reproducible retained-reader defects, not source
commissioning. The existing Account 360 V2 resource reader is a separate
reader; the 200-row lookup limitation described below concerns the older
Account/Broker profile composer.

1. A returned parent page is not a complete lineage census just because its
   page says `COMPLETE`: continuation in either direction, a `PARTIAL` scope
   or relation state, and a requested but unavailable parent leave it
   unproved. Children whose parents cannot be proved are held as `PARTIAL`
   with `N30_PROFILE_LINEAGE_REJECTED`; a known-foreign row remains separately
   counted as scoped out. A partial child is not upgraded to `EMPTY` merely
   because its known-foreign rows were removed.
2. Bracket legs require a single complete parent census before their parent
   identity can be called unique. Continuation, a partial scope/state or an
   unavailable parent holds the affected legs and leaves a typed partial
   reason rather than attaching a leg to a potentially duplicated parent.
   A complete, unique parent still passes. Four of the new five negative
   cases reproduced the old incorrect behavior before the correction.
3. A ladder worker previously advanced its durable cursor even when it held a
   child whose parent was not established. It now commits the **same prior
   relation cursor** with the partial snapshot; a later refresh can re-read
   that child after the parent becomes available. Source rows proved foreign
   do not hold that cursor. A perpetually incomplete source can still stall
   that relation; stable upstream cursor/recovery behavior remains to be
   qualified through Edge.
4. The older Account/Broker composer no longer turns an incomplete first
   page, inaccessible source, unknown completeness or another incomplete
   environment into an authoritative account-not-found or unique environment.
   Duplicate account IDs, a null/blank broker reference or a reference shared
   by multiple visible account IDs cannot be used to choose a broker row or
   calculate a comparison. The response carries typed identity/broker absence
   and withholds unsupported differences instead of returning fabricated zero.
   This is a fail-closed correction: **exact lookup beyond the first 200 rows
   for this older route is still open**, and an available local snapshot does
   not by itself prove economic ownership/census across the real source.

Verification (all data and grants synthetic unless noted):

- Initial targeted tests reproduced eight account/lineage failures; the
  bracket tests separately reproduced four more before the last correction.
- After the correction, five focused suites (`profile-lineage`,
  `profile-projection-lineage-cursor`, `profile-read`, retained bracket legs
  and retained business aliases) passed **177/177**; Account/Broker responses
  in the added cases were checked against the current JSON schema.
- Three PostgreSQL suites passed **77/77** in a separately initialized
  PostgreSQL 16.15 Unix-socket-only test cell, including migration, real
  transactional cursor persistence, and reading the originally held child
  after the synthetic parent becomes available. This run preceded the final
  bracket-only source correction, so it is a receipt for that earlier source
  checkpoint, not a claim that the current whole candidate has been retested
  on PostgreSQL. The earlier default-port attempt was sandbox-denied and is
  not a PASS. The disposable cell, synthetic database and downloaded packages
  were stopped/removed; no existing DB was touched.
- A broader pre-bracket checkpoint had 252 passing non-DB tests; the 177
  above overlap those tests and must not be added as separate coverage. A
  typecheck that overlapped a further source edit is **not** counted as a
  typecheck of the final source. A subsequent no-emit Control API typecheck
  on the stabilized source exited **0** in 195.30 seconds (peak 2,759,912
  KiB); tracked source/contract diff SHA-256 was unchanged before/after at
  `cb02566db6e08386ebb494180168a924f192cc7dd6553205e5aba5b0acc39b5d`.
  The additional untracked `account-comparison-availability.ts` source hash
  was `bc504af8404e3ec06ee127d21c9aabb49a4ffde97d87728a95554e2d67aa7e4d`.
  This is not the normal hook, an emitted build, browser or qualified-source
  acceptance.

Final local source and test SHA-256 at this checkpoint:

- `profile-lineage.ts`: `5d603b46137783e20c0f6a3aee8ad97af6cd4807799d6ab4b5efc7b8bfe61404`.
- `profile-projection.worker.ts`: `74c11f188e65a86cd1742319fce9c8beb7535d950e4a28f4f63b2cb82af76d2f`.
- `profile-read.service.ts`: `e9ec612feb63f788988c2d540bc0b5aa40eae73400464a1bf70d11c1aede51c7`.
- `profile-lineage.spec.ts`: `d00e058824096552566b5f46401db811898e8e6a6dae5db3006b97f40c61130c`.
- `profile-projection.spec.ts`: `1a9da492e2cd81aad4d8ab4c47028f6ce00789f3085b0b691c9f1420da22b0b0`.
- `profile-projection-lineage-cursor.spec.ts`: `065e27adbaa55f5ff2db01209a991f458a6af6b13c144e8a8d9945aa71f78c8f`.
- `profile-read.spec.ts`: `0bb74fdff5b10599094aab865180586abe1011a8146bfa6f4ab8becd9636535d`.

An owner-private local recovery copy, **not a commit or remote backup**, is
under `/home/bobby/.local/state/portal-research-backend-20261102-7rY0guq1/`:
tracked backend patch `backend-code-recovery-lineage-final-20261102.patch`
SHA-256 `37e590cc1ebac0376c316ef271c0ab8a51e742239d55c67ca2f3bc253ab5a002`;
six untracked backend files in `untracked-backend-lineage-final-20261102.tar`
SHA-256 `bc3b482f0f1e59a29434815967470b79ce5c21d609b59269fb0f74ae7d0a1974`.
The three pre-existing Edge mailbox documents were not changed or included.

Claude consumer: use the existing partial/unavailable presentation and
handle `SOURCE_CONTINUATION_NOT_READ`, `SOURCE_COMPLETENESS_UNKNOWN`,
`SOURCE_PARTIAL`, `PHASE2_ACCOUNT_IDENTITY_UNRESOLVED`,
`PHASE2_ACCOUNT_ENVIRONMENT_UNRESOLVED`,
`PHASE2_ACCOUNT_IDENTITY_DUPLICATE`, and
`PHASE2_BROKER_REFERENCE_UNAVAILABLE` / `PHASE2_BROKER_REFERENCE_AMBIGUOUS`
without showing “not found”, zero, or a complete broker result. No component
or layout change is required. At this checkpoint the separate Alpha V1
nullable consumer remained a known integration failure; the later Codex
follow-through below fixes it in the local candidate, pending full integration.

### Resource 360 broker-reference census follow-through

The earlier no-emit typecheck is a receipt for its recorded checkpoint;
the later Resource source edits were typechecked again as recorded below.
Two new synthetic cases reproduced the legacy Resource 360 composer joining a
broker record when its reference was shared by accounts or the account census
was partial. A third showed that a second account with source mode `PAPER`
could be missed when the requested environment was `paper`. The composer now
counts a reference against the complete same-environment account population
before using it; an incomplete or ambiguous census withholds the corresponding
broker rows and carries `EDS04_EXTERNAL_ACCOUNT_CENSUS_INCOMPLETE` or
`EDS04_EXTERNAL_ACCOUNT_REF_AMBIGUOUS`. Valid `PAPER`/`paper` are compared
case-insensitively without rewriting the source and `LIVE` remains a different
environment. Multiple valid references can still be shown with a partial
branch when another reference is ambiguous; derived comparisons require the
branch to be complete. Source authority, account ownership and census from
Edge have not been proven by these local checks.

The tuple join needed the same case handling: two synthetic negative/positive
tests initially failed, showing both lost Paper orders and an erroneous unique
association when two Paper deployments differed only by the casing of their
mode. The internal tuple and duplicate census now use the canonical requested
environment for this enum alone. Distinct identifiers remain exact, source
payload fields are not rewritten, and a Live row is not admitted to Paper.
An ambiguous tuple remains withheld with
`EDS04_TRANSACTIONAL_SCOPE_AMBIGUOUS`; it is never assigned to the first
deployment. Additional red tests found that counting only the deployments
already selected for one portfolio could incorrectly attach another
portfolio's tuple-only order, and that a partial population could make an
unproved tuple look unique. The tuple census now counts the whole visible
same-environment deployment population, and fallback is allowed only when
the deployment relation is complete, not truncated, and has no held lineage
rejects. Each negative condition retains the ambiguous status. Explicit
deployment-id handling is separate and this change is not a proof of native
authority or physical HTTP egress.

This finding reproduces in the **legacy V1 Resource** read. The separately
scoped V2 Resource composer currently withholds broker custody altogether
without its own commissioned capability; it is not claimed to have disclosed
that broker observation. Synthetic tests also check V2 scoped refusal for a
narrow account and nondisclosure for a full viewer.

- The affected six-suite checkpoint passed **167/167**; the later Resource
  and scoped-Resource run passed **72/72**, adding a positive uppercase
  Paper/non-Paper separation case. The final affected six-suite run after the
  tuple fix passed **170/170**. After the global/partial census follow-through,
  the same six suites passed **174/174**; partial, truncated and held-lineage
  inputs each refuse tuple fallback. These runs overlap and must not be summed.
- Control API `npm exec -- tsc -p tsconfig.build.json --noEmit --diagnostics`
  exited **0**, 1,481 files, 192.97 seconds, peak process memory 2,377,864
  KiB. The tracked source/contract binary diff SHA-256 remained
  `8824aed38c9dcbea84a525c0498810c42f962f9a66f11e376eb4eb6c80ca4bfa`
  before and after; the separate untracked source
  `account-comparison-availability.ts` retained SHA-256
  `bc504af8404e3ec06ee127d21c9aabb49a4ffde97d87728a95554e2d67aa7e4d`.
  This is not an emitted build, integration hook, or runtime receipt.
- `resource-read.service.ts` SHA-256:
  `01cd23cc5e99cd61231e17011ad6954be395ffeabbdb75357585baa586ac6c59`.
- `resource-read.spec.ts` SHA-256:
  `cb6f2e4485fc5be4e919c9a429eae5c5af06f51f6aa72091c248c4da1e25f7f0`.
- `elp2-resource-reads.spec.ts` SHA-256:
  `5964619f256797ae6e48f0d7d0981715aeb85c10cc1b4b330b138f5e1f1be4ff`.
- The newer local recovery patch (not a Git commit or remote backup) is
  `/home/bobby/.local/state/portal-research-backend-20261102-7rY0guq1/backend-code-recovery-global-tuple-20261102.patch`,
  SHA-256 `6884594483fa0b0bc0333f48c952a001e5be0fb72a75ca6a5080a7be7a12540a`.
  The six untracked source files remain in the tar recorded above.

Claude: keep the existing partial/unavailable handling for these two new
reason codes; do not render an incomplete broker row or comparison as 0,
synced, or not-found. No component or design change is needed for this fix.

### Alpha V1 nullable consumer follow-through — 2 Nov 2026

Bobby approved a narrow frontend parser/data-binding and test fix without a
design change. This supersedes the historical 28/29 Alpha consumer blocker
above; it does **not** supersede the need for the integrated normal hook,
browser/visual acceptance or a qualified real source. The change is local
and uncommitted on the same candidate as the backend:

- `apps/portal/frontend/src/execution/api/profileRead.ts`
- `apps/portal/frontend/src/execution/screens/recomposeContainers.tsx`
- `apps/portal/frontend/src/execution/v2/screens/alpha/model.ts`
- `apps/portal/frontend/src/execution/v2/screens/alpha/view.ts`
- `apps/portal/frontend/src/execution/v2/screens/alpha/alpha.test.tsx`
- `apps/portal/frontend/src/execution/v2/screens/alpha/canonicalServing.test.tsx`

The V1 Resource reader now accepts the published typed absence without
weakening Fleet or reading a scoped V2 envelope as V1. Nulls and reasons are
preserved, as are real zeros. The existing presentation doesn't promote an
unknown health or unavailable aggregate into a healthy/complete value.
The React screen test uses the service-generated fixture through a synthetic
HTTP client, not a browser or a real Edge producer. Six focused FE suites
passed **494/494**, followed by four Alpha-scoped/Fleet-conformance/profile
integration/canonical suites passing **691/691**. These checks overlap; do
not total them. The latter included the final amended canonical assertion.
Frontend `npm exec -- tsc -b --pretty false` exited **0**, 157.29 seconds,
peak 2,596,156 KiB; the candidate frontend diff SHA-256 was unchanged before
and after at `24d9654029a9108f10b8a8d7eafd04195f847c61b3b1bd235c1ce913ecb17ea3`.
Execution tracking reconciliation and `git diff --check` passed. The root
filesystem was at **84% used**, below the project's 20% free-space threshold
for a disk-intensive build. The normal integration hook was not run or
bypassed for code; no runtime install or connected/browser proof is claimed.

For local recovery only, not a Git commit or remote backup, the exact tracked
frontend patch is
`/home/bobby/.local/state/portal-research-backend-20261102-7rY0guq1/alpha-v1-consumer-final-20261102.patch`,
SHA-256 `24d9654029a9108f10b8a8d7eafd04195f847c61b3b1bd235c1ce913ecb17ea3`.
No Edge mailbox was touched and no frontend design/baseline was modified.
Claude should review the candidate, not reimplement this parser.

### Retained deployment and broker-grain follow-through — 2 Nov 2026

**Source-only candidate, not a runtime/source qualification.** Focused red
tests revealed further issues in the retained compatibility readers. This
follow-through preserves the existing contracts and public reason codes:

1. Product deployment tuple fallback now needs an untruncated, complete
   deployment census with no rejected lineage, and counts another deployment
   with a missing tuple dimension as a possible owner. Paper mode comparison
   is case-insensitive; source IDs and payloads are not rewritten. Explicit
   deployment IDs remain usable when independently valid, while tuple-only
   or malformed/ambiguous identity facts are withheld with the existing
   `EDS03_DEPLOYMENT_SCOPE_AMBIGUOUS` rather than assigned to the first row.
2. Product broker resolution now requires a qualified, unique account
   `(venue, mode, external_account_ref)` binding; matching the reference
   alone is insufficient. Unavailable or partial account census and missing
   or conflicting grain cannot establish ownership. These checks reproduce
   on the legacy compatibility seam; the scoped V2 reader does not receive a
   new grant to physical custody fields.
3. Resource 360 applies the same broker grain. A different known venue is not
   conflated with the target, while an unknown venue, mode or possible owner
   withholds just the unproved broker fact and marks the branch partial. Its
   deployment uniqueness check counts wildcard/missing dimensions across the
   visible population in bounded signature lookups, rather than treating an
   incomplete competitor as a different tuple. A malformed published
   `deployment_id` cannot be recast as a tuple-only observation. Existing
   reasons include `EDS04_EXTERNAL_ACCOUNT_REF_UNAVAILABLE`,
   `EDS04_EXTERNAL_ACCOUNT_REF_AMBIGUOUS` and
   `EDS04_TRANSACTIONAL_SCOPE_AMBIGUOUS`.
4. A relation whose source window is truncated or has rejected lineage is
   partial even if its `completeness` field claims `COMPLETE`; dependent
   financial comparisons are withheld. A parent absent from such a census is
   `EDS04_ACCOUNT_OUTSIDE_RETAINED_WINDOW`, not a confirmed not-found.
   Known authorized data and real zeroes are not replaced with fabricated
   values. These changes do not assert qualified source ownership.
5. The separate legacy Account/Broker profile also joins against all three
   published grain dimensions. Unknown possible account owners and unknown
   broker dimensions produce the existing
   `PHASE2_BROKER_REFERENCE_AMBIGUOUS`/`UNAVAILABLE` states; a known row from
   another venue is not attached. When only an observation is ambiguous, a
   separately qualified row remains visible but the broker capability is
   partial and the derived comparison is withheld. No extra grant is created.

Local synthetic verification on the current candidate: targeted red cases
first reproduced incomplete/unknown census, wrong broker grain and tuple
ambiguity; the final eight affected suites passed **380/380** in 56.73 s:
`resource-read`, `elp2-resource-reads`, `elp2-product-reads`,
`retained-negative-fence`, `deployment-identity`, `profile-read`,
`paper-read`, and `elp2-retained-metadata`. Previous smaller test counts
overlap and must not be summed. `git diff --check` passed. No network source,
browser, real credential, live mutation or data migration was used.

Tracked source/contract diff before the final no-emit typecheck:
`aa6afa789dbfc28b2150cfd9a819fac404af86ec98facc486d4384be6464692e`.
An earlier typecheck was intentionally interrupted after the separate legacy
profile finding and is not counted as PASS.
The final `npm exec -- tsc -p tsconfig.build.json --noEmit --diagnostics`
then exited **0** on the unchanged tracked source/contract diff above, with
1,481 files, 218.22 s reported TypeScript time, 3:39.61 wall time and
2,279,692 KiB peak process RSS. The separate untracked helper
`account-comparison-availability.ts` retained SHA-256
`bc504af8404e3ec06ee127d21c9aabb49a4ffde97d87728a95554e2d67aa7e4d`.
This is not an emitted build, normal integration hook or runtime proof.
Local SHA-256 pins:

- `product-read-source.ts`: `555eab33bb50ae56395fa06f193e47a3d9e949b5b6c9c77feee639aed0d29615`.
- `resource-read.service.ts`: `d9ab7ce49426696cc04cd05b52589b9a1cf856fac1bde315778fffd9f2166d9d`.
- `profile-read.service.ts`: `3de2ac0d888e48c9fda376bf853f68905b340844828c0f623b9918dcbc03dd05`.
- `elp2-product-reads.spec.ts`: `ea130b44d74494589f223bbc03af4bdf69b3392dfcb2fbc2aa407ac4f826f037`.
- `resource-read.spec.ts`: `ca5d0e004af625ed6e60e61481870a6e6fff224a632bba29f400c89144916e16`.
- `profile-read.spec.ts`: `5ead82229500f04795e7e587a2c964c3e3e88c2a66710f191b604012200f0bfd`.

For recovery only, not a Git commit or remote backup: tracked backend patch
`/home/bobby/.local/state/portal-research-backend-20261102-7rY0guq1/backend-code-recovery-profile-broker-20261102.patch`
SHA-256 `ab3458f08a7c6db626288df3712b2417104d141fa767315e252f80b0c289400b`;
the six untracked backend files remain in the previously documented local tar
`bc3b482f0f1e59a29434815967470b79ce5c21d609b59269fb0f74ae7d0a1974`.
The tracked backend candidate spans 65 files at +4,904/−458, representing
the cumulative uncommitted candidate, not just this follow-through.

**Handoff to Claude:** use the existing partial/typed-absence presentation;
do not show withheld broker sync as zero/synced or infer a deployment from an
ambiguous tuple. No component/layout/baseline change is requested. The Alpha
V1 parser fix above is already in the same local candidate, not yet landed.
The older separate Account/Broker profile still has no exact lookup beyond
its first 200 records; safe pagination needs an authorized pre-pagination
identity read and a single retained end-of-response fence. Real Edge source,
ownership/census, physical HTTP custody and browser verification remain open.

**Gate/capacity and documentation verification:** the root filesystem had
104 GiB available of 621 GiB, 84% used, at this checkpoint. C4.5 in
`docs/production-feature-profile-and-cleanup.md` bars starting a new
disk-intensive local build below 20% free without an inventory-backed scoped
cleanup or owner-approved capacity change. The normal backend/code hook was
therefore **not run or bypassed**, and the code remains uncommitted; no shared
cache, backup, volume or Edge mailbox was removed. The three Markdown receipt/
tracking files are a separate, user-approved `Verification: R0` documentation
update: explicit paths, target/anchor, `git diff --check` and
`scripts/execution-tracking-test.sh` checked. This R0 does not authorize code
landing or change the remaining source/qualification gates.

Read-only follow-up inventory: `/tmp` was approximately 52 GiB and contains
Claude-owned scratch as well as paths cited by existing Edge evidence; these
are not assumed disposable. `sudo -n docker system df` reported 381 images
(27 active; 88.35 GB total, 73.85 GB labelled reclaimable), 99 volumes
(22 active; 32.98 GB total) and 141.3 GB build cache; no dangling image was
listed. Docker's reclaimable label is **not** evidence that tagged rollback,
release or another agent's assets may be removed. The direct Docker socket was
denied, while the existing test script has a passwordless-sudo fallback; no
Docker/volume cleanup or runtime mutation was attempted. Codex/ops must first
inventory exact candidates and their active/release/rollback/evidence owners,
or arrange an owner-approved capacity change, before the normal hook. This
observation is not an instruction to delete `/tmp` or prune Docker.

### Deployment negative-lookup correction — 2 Nov 2026

The follow-through above used a confirmed missing-deployment result even when
the census advertised `COMPLETE` but its window was truncated or its lineage
contained rejected rows. Product retained reads now reuse the already-required
complete-census fence for that negative lookup as well. A genuinely complete,
untruncated census with no rejected lineage may return
`EMPTY / EDS03_DEPLOYMENT_NOT_FOUND`; a partial, truncated or lineage-rejected
census instead returns `PARTIAL / EDS03_DEPLOYMENT_OUTSIDE_RETAINED_WINDOW`.
This does not add a grant, relax the final authorization fence, or claim a
real-source deployment is present. Four synthetic regressions cover these
distinctions.

On this newer candidate, `elp2-product-reads` and `retained-negative-fence`
passed **130/130** in 23.34 s. A focused TypeScript check of
`product-read-source.ts` and its transitive module graph exited 0 (803 files,
17.13 s compiler time, 18.01 s wall, peak process RSS 685,352 KiB), using the
Control API compiler settings. This is **not** a full-project typecheck. The
earlier **380/380** eight-suite run and the full Control API no-emit
typecheck described above apply to the immediately preceding tracked
source/contract hash `aa6afa789dbfc28b2150cfd9a819fac404af86ec98facc486d4384be6464692e`;
the suites overlap and must not be added. An intentionally interrupted
unnecessary all-suite rerun is not counted as PASS.

New tracked source/contract diff SHA-256:
`38548535d0b41acdeb9061fe5aa930e9a81a4aaf3032447ae2c43af43bbd29a4`.
`product-read-source.ts` SHA-256:
`20f705de698f1528d9937754554bb2bd2bc40987b61f81b8598979ab369f54a2`;
`elp2-product-reads.spec.ts` SHA-256:
`b5b3cdd6f996903d604d9bbba7ac6eed64aa749d5cb4ed4d113bf53f3f296bdf`.
The separately untracked `account-comparison-availability.ts` remains
`bc504af8404e3ec06ee127d21c9aabb49a4ffde97d87728a95554e2d67aa7e4d`.

The newer local recovery patch, superseding the prior tracked-backend patch,
is `/home/bobby/.local/state/portal-research-backend-20261102-7rY0guq1/backend-code-recovery-deployment-negative-20261102.patch`,
SHA-256 `233d7866f3544ba5e6c3efd6adca7917dae2427a755930f091b4175f18925bd7`.
The previously recorded untracked-file tar remains unchanged. Across earlier
work and this follow-through, the **cumulative, uncommitted** tracked backend,
contract and ownership-ledger diff is 65 files, +4,922/−459; six backend files
are additionally untracked. Separately, the approved frontend parser/test
candidate is six tracked files, +289/−39. These are not per-fix line counts,
commits, installed code or a remote backup. Normal hook, source-backed/Edge and
browser gates, final-candidate migration/rollback and the >200 legacy lookup
remain open. Claude should preserve the existing outside-window/partial state;
no component, copy or visual-baseline change is requested here.

### Account 360 identity selection follow-through — 2 Nov 2026

**Local candidate only.** A focused review found that the older Account/Broker
360 reader could report a first `selected_environment` and publish that
environment's account rows even after its own identity check found another
matching environment or could not rule one out. It could also return child
balances when the account identity was absent, or present a first profile and
its clock when auto-selection found no account. Duplicate account identities
could similarly expose unassigned candidate rows. These are separate from the
already recorded >200 exact-lookup limitation.

The composer now keeps the existing `candidate_environments` and existing
identity reason codes but withholds account-specific data when identity is
ambiguous, duplicated or absent. Auto-selection does not publish a selected
environment/profile/clock when it has no unique resolution; source
capabilities reflect the identity state instead of claiming the withheld rows
as available. A caller that explicitly selects a valid environment continues
to receive its authorized data. This adds no schema field, grant or visual
change; it does not prove native HTTP custody or qualify an Edge source.

Four focused regressions first failed on the prior candidate, and an additional
no-match auto-selection test subsequently failed on its first-profile clock.
The three related suites passed **182/182** before that last small profile
metadata correction, on tracked source/contract hash
`beba7533726f79e1d188210daac26a7910aba93b8b48cc771e8fb04e653a956f`.
On the newer final candidate the affected `profile-read` suite passed
**53/53**, including complete/partial orphan-parent cases, duplicate identity,
multi-environment selection, unavailable alternate census, no-match auto
selection, contract validation and explicit-environment positive control.
The counts overlap and must not be added. A focused TypeScript check of the
profile module and transitive graph exited 0 (810 files, 20.68 s compiler time,
608,969 KiB reported TypeScript memory). This is not the full-project check;
the earlier full check belongs only to the separately documented `aa6afa...`
checkpoint. No browser, production source or actual source-revoke test was run.

Current tracked source/contract diff SHA-256:
`be411cb2fdef55a3a01ffa0314e28c15f2a7b04a37102dff933183147f5f8973`.
Profile source SHA-256 `36d0cceca7eaf604e50372063f3e902c64d8ff25eb8e18c26d3a53a25f9ff990`;
profile test SHA-256 `a80c9e5d7152a5a937c47e42335f94755e8524b989dbdf2d164288688eb9b4be`.
Latest local recovery patch, superseding earlier tracked-backend patches:
`/home/bobby/.local/state/portal-research-backend-20261102-7rY0guq1/backend-code-recovery-account-selection-final-20261102.patch`,
SHA-256 `21107b246be6a74ece0607bd7c11a4bf6d013ace155b2173b35a2a4ba10f0eac`.
The six untracked backend files remain in the earlier tar
`bc3b482f0f1e59a29434815967470b79ce5c21d609b59269fb0f74ae7d0a1974`.
The cumulative uncommitted tracked backend/contract/ownership-ledger diff is
65 files, +4,997/−463; this is not the size of this particular correction.

**Claude handoff:** consume existing typed identity branches and, where
appropriate, let the user choose a listed environment explicitly; never show
withheld values as a zero or silently choose the first candidate. Preserve
the established UI and current ownership of components. Review/browser proof
remains separate. The exact >200 lookup, real-source authority, final hook,
connected/browser gates and final-candidate migration/rollback remain open.

### Account 360 request contract correction — 2 Nov 2026

The existing Account 360 OpenAPI path advertised `account_id` up to 191
characters with no pattern, while the actual controller accepts 1–128 ASCII
letters, digits, `.`, `_`, `:` and `-` only. The optional `workspace_id`
already supported by the controller was missing from OpenAPI. The contract
now documents the implemented identifier bounds and workspace parameter,
including that the server trims workspace input before validating it; the
schema describes the normalized workspace value. Its 200 description no
longer promises an exact result for an incomplete or ambiguous profile. This
changes neither the route's identifier validation nor authorization behavior.

The first contract/route parity test failed against the old OpenAPI. After the
correction, the full affected `profile-read` suite passed **54/54**, including
controller and JSON Schema checks for valid 1/128-character IDs, 129-character
and invalid-character refusal, empty/overlong workspace refusal, and trimmed
workspace forwarding. `openapi-typescript` 7.13.0 regenerated
`generated/execution-profile-read.d.ts`; its delta adds the optional
`workspace_id` and updates the description, without changing a UI component.
`node tooling/execution-operation-reader.mjs --check` passed. The focused
contract/fixture suites passed **5**, with **152 skipped** by the name filter;
this is not 157 executed tests. The supplied snapshot tool also reconciled a
pre-existing candidate Alpha synthetic-fixture digest, and `--check` now
matches **716** tracked files. The Alpha fixture cases were among those five
focused contract tests; synthetic fixture validation is not source evidence.

Current tracked source/contract diff SHA-256:
`8a8f3c149f612495051f5e6c8416179248784e75e0592781b1d9ab2de21e680e`.
Profile source SHA-256 remains
`36d0cceca7eaf604e50372063f3e902c64d8ff25eb8e18c26d3a53a25f9ff990`;
the final profile test is `d44ea0d40fce8c6a26b1e0779fe3ca62db3c7951ce23b4c043f1810c6a30038d`.
OpenAPI and generated type SHA-256 are respectively
`ba54410096f31b6ecf322b82c6856665df9e6097d9d305ee57bd7531a44622a8` and
`c80aa2e1d61ce654ea5213b0309269b96d28b61e77d472beb24d5e026cf0a1b8`.
The previous focused source typecheck remains applicable to the unchanged
profile source; no new full-project/frontend typecheck or normal hook is
claimed on this contract checkpoint.

Latest local tracked-backend recovery patch:
`/home/bobby/.local/state/portal-research-backend-20261102-7rY0guq1/backend-code-recovery-account-contract-20261102.patch`,
SHA-256 `b1d05b1ccc028b2b051ec99d670bd2e384ffa337d091447ee20a790b6639fce6`.
It supersedes earlier tracked-backend patches but is not a Git commit or remote
backup. The separately documented untracked tar and Alpha frontend patch are
unchanged. The cumulative tracked backend/contract/ownership-ledger candidate
is now 66 files, +5,036/−468, plus six untracked backend files; this is not
the size of this contract correction. All previously recorded qualification,
capacity, source, >200 lookup and integration gates remain open.

### STATUS canceled-preparation capacity follow-through — 2 Nov 2026

The earlier cancellation follow-through retained a newly prepared in-memory
STATUS context until its TTL even when **every** waiting caller had canceled
and its token had never been delivered. A focused regression reproduced the
unnecessary reserved context before this change: one test failed, its
previously-issued-context safety control passed, and 43 tests were skipped.

After the shared authority read finishes, the local candidate now reclaims
only the exact newly registered context when no waiter received it, its call
mapping still points to that context, and it has no delivery, pending work or
issued identity. The internal new-context marker is stripped from the return
value. A canceled retry on an already delivered context does **not** remove
the context or its outstanding lease: another retry receives the same context
and original lease. No source attempt, receipt or ACK is created, deleted or
replaced; the STATUS original remains the same. This supersedes only the
earlier note that all-canceled **newly registered** contexts necessarily stay
until TTL. It does not change cleanup of issued, ambiguous or UNKNOWN custody.

Verification at this candidate:

- The seven relevant authority, transport, gateway binding, composition,
  runtime and bootstrap suites passed **206/206**. The two transport suites
  used ephemeral loopback TLS listeners and synthetic credentials; temporary
  test fixtures were cleaned by their own tests. They did not connect to Edge,
  create a real source identity, call a real gateway or use PostgreSQL.
- A focused TypeScript no-emit check of the changed module and its transitive
  graph exited 0 (694 files, 18.29 s compiler time, 509,899 KiB TypeScript
  memory reported). This is not a full-project check or the normal hook.
- Source SHA-256:
  `70acdb8243ee49de17a3e72f10a87da8f807c164ec98e5d9752c4d1266a4dc18`;
  test SHA-256:
  `ee38c153541cec53977e1cc82aab0f72ff428cfd13c4d0fce0db6b950f5e6d74`.
  Tracked source/contract diff SHA-256:
  `746717949d1a63dc51185b0a71feb1ca0f61f11186ac3e96a544b750aab7245a`.

The current local tracked-backend recovery patch is
`/home/bobby/.local/state/portal-research-backend-20261102-7rY0guq1/backend-code-recovery-status-capacity-20261102.patch`,
SHA-256 `e6c7af6d52ce863f4e7e188301fd18416d5a2ba0934bc958559e4681cf87b027`.
It is a private local recovery artifact, **not** a Git commit or remote backup.
The previously recorded separate untracked-file tar and Alpha parser patch are
unchanged. The cumulative tracked backend/contract/ownership-ledger diff is
66 files, +5,099/−474, plus six untracked backend files; it includes work from
several earlier checkpoints, not just this change. Code remains uncommitted
and uninstalled. Real gateway/original/authority, final integration hook,
connected and browser acceptance, and migration/rollback on the final candidate
remain open. No command or Live capability was enabled.
