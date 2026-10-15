# ELP2-03 — Scoped policy, delegation and TS membership proposals

Status: IN_PROGRESS / BACKEND_IMPLEMENTATION. Assigned in the active
01→04 goal;02 preservation/landing checkpoint passed at
`b448c0be655817dc49dd02f86aa2544e64c00d48` (normal hook21748 exit0,
contracts388/API2,607 PASS; identity18/18, retained-review8/8, restore PASS).
Frontend NOT_STARTED_BY_OWNER_DIRECTION. Current focused receipts are recorded
below; neither implementation presence nor a disposable test is runtime activation.

## Entry and scope

- Repo `/home/bobby/portal-research`, branch `docs/research-loop-plan`.
  Entry HEAD `b448c0be655817dc49dd02f86aa2544e64c00d48`; tracked checkout clean,
  only untracked03/04 preparation packets. Guide Portal §4 and §15 ELP2-03;
  foundation01, identity02, canonical decisions/requests in the00 packet.
- Reuse stable Portal identity, owner anchor, current session/CSRF and legacy
  capability semantics. No new auth system, no name-derived preset or authority.
- New capability registry/evaluator; explicit resource×environment×action
  ceilings; preview/app grant/revoke; revisioned TS proposal/receipt adapter;
  audit, current-authority replay and CAS. Preserve app-vs-TS authority.
- Owner recovery, actual Stan ceiling, researcher financial disclosure and TS
  trust/acceptance remain gated by00. Synthetic approved policies are TEST_ONLY
  dependency injection in an isolated harness, never a production default.
- Read-only HK repin at2026-10-15T20:27Z: PM worktree
  `/home/bobby/.worktrees/trading-system-pm-v1_1` remains clean at
  `d16aa2b5f251596e469807f57e81fe14cdc7e763`; current R2 guide SHA-256
  `7d79d8de84eab19d0d2de3dce2b4c9278a691277b0b8b4379a7db0000dfc8945`.
  Exact source pin unchanged; no remote files/services/tests/DB were changed.
  This does not attest deployment/schema/trust/TS membership acceptance.
- Owned paths: additive `execution-v2/access-*`, exact legacy grant-service
  fixes, needed repository/app wiring, one reserved additive migration,
  generated contracts/fixtures/tests and packet/Unified. No frontend, Research
  semantics, runtime config, real users/grants, HK writes, push or merges.
- Budget: one disposable PG; total4CPU/4GiB, transient8GiB, workers≤2 and one
  heavy lane. No public listener or existing-data mount. Rollback denies new
  proposals but preserves accepted revisions, revocations and immutable audit.

## Preparation findings / implementation requirements

1. Legacy A4 remains owner-only with its existing finite10 capabilities. V2
   adds exact actions rather than widening its SQL CHECK or turning ADMIN into
   an owner/delegation bypass. Only existing decide→matching-read implication
   survives automatically; read_all implies neither mutation nor technical.
2. Four additive stores: policy state/artifact revision, scoped current grants,
   proposals/idempotency, immutable decision/receipt events. Check migration
  inventory checked again at entry; reserve additive1723680000134 for this
  policy slice (no0134 file existed at02 landing).
3. Trusted effective-policy facts resolve current session, workspace membership,
   direct/deny/delegated grants and current ceiling lineage. DENY/expiry/revoke/
   protected constraints win. Scope selectors are typed and resolve to query
   predicates in04; arbitrary SQL, prefixes and browser-supplied owner facts
   are refused. No current ownership proof means no researcher disclosure.
4. Preview is advisory. Submit transaction locks/rechecks current actor/session,
   policy, ceiling and target; expected revisions and canonical digest bind
   exact action/scope. App changes and immutable audit/revision update commit
   atomically. Original outcome stays immutable on retry, current authority
   must still hold before exposing the receipt.
5. No public TS-acceptance write route. Internal verifier defaults unqualified;
   accepted receipt must bind trusted source, proposal/digest, canonical human
   mapping, resource/workspace/environment/actions, prior/new revision and
   effective interval. ACK/pending/rejected/unknown never create effective TS
   rights. App revoke immediately withdraws Portal access independently of TS.
6. Confirmed legacy repairs: replay must not turn DENIED/CONFLICT into200;
   bind replay to its original actor and validate the current session without
   rewriting historical fingerprint bytes; recheck authority/step-up at commit;
   record actual absent→ACTIVE and ACTIVE→REVOKED pre/post images; replay
   original receipt rather than mutable current grant. Denials need redacted
   audit even when no valid target FK exists.

## Validation / gate map — original plan, actual results appended below

At entry T03-01…11 were NOT_RUN. The implementation must cover stable three-principal
fixtures, exact ceilings, indirect self-escalation, explicit grant-of-grant,
pending TS states, CAS/key races, revoke-at-commit, authenticated receipt binding/
duplicate/out-of-order handling, business-read vs mutation/technical split,
scoped V2 vs owner-only legacy guards and pending disclosure. PG/API negatives
and migration preservation supplement pure evaluator/contract fixtures.
Actual TS producer acceptance remains a distinct BLOCKED external gate; a
test-only verifier proves only the local state machine.

Independent read-only design review also requires current ancestor/ceiling
checks for every delegated use, not only insert-time validation; do not union
an action from one parent with a wider scope from another. Scope tokens exposed
to readers must be opaque and scoped, not a global event counter. A pending
proposal must never overwrite the last accepted effective grant. Foundation01
`ts_state=APPLIED` is a presentation schema, not authenticated TS proof: only
the qualified server-side verifier may establish accepted authority, and no
browser field or public route can select a verifier or assert acceptance.

### Concrete test inventory — planned, not evidence

| Gate | Required positive and negative cases | Planned proof |
| --- | --- | --- |
| T03-01 | Synthetic protected owner; all-business reader with bounded mutation; linked researcher. IDs, never names or ADMIN, select rights | Shared evaluator + disposable API |
| T03-02 | Exact action, resource kind/ID, workspace, environment, validity interval and parent ceiling; strict subset accepted, wider set refused | Evaluator and transactional submit |
| T03-03 | Self grant, indirect delegation back to issuer, identity/preset mutation and protected-owner target refused | Direct service/API negatives |
| T03-04 | `access.grant` alone cannot delegate `access.grant`; explicit onward ceiling and no widening at any ancestor | Multi-level synthetic lineage |
| T03-05 | Pending, rejected, unknown, stale or unauthenticated TS receipt preserves previously accepted rights and never activates new rights | Proposal state machine + PG |
| T03-06 | Same key/same actor returns original receipt; different actor/payload or stale policy/grant/TS revision conflicts | Real PG concurrency/CAS |
| T03-07 | Revoke/disable/generation bump after preview but before submit invalidates the queued mutation; app revoke takes effect without claiming TS revoke | Locked PG race + API |
| T03-08 | Trusted receipt binds producer/proposal/digest/human/scope/revisions; duplicate unchanged is idempotent; changed duplicate and out-of-order are refused | TEST_ONLY verifier + PG; external trust still BLOCKED |
| T03-09 | Business-read-all remains independent of mutation ceiling and never implies export, stream, user admin, secrets or technical rights | Evaluator permission matrix |
| T03-10 | Legacy10 namespace and DTO remain owner-only; scoped V2 authority never broadens legacy ADMIN guard; replay checks current owner/session/step-up | Existing A4 + new regression cases |
| T03-11 | Missing approved researcher field matrix returns pending disclosure; ownership/member input cannot be browser-injected | Strict schemas + direct API |

Legacy receipt regressions additionally assert immutable absent→ACTIVE and
ACTIVE→REVOKED images, original refusal HTTP status, original grant snapshot
after later revoke, redacted unknown-target audit without invalid foreign keys,
and actor binding without changing historical fingerprint bytes. Correct only
synthetic fixture lifecycle/session generations, never weaken production auth
to accommodate the older test setup.

## Handoff and next

### Assigned task map (preparation; implementation waits for02 gate)

| Task | Writer / allowlist | Output / acceptance | Budget and exclusions |
| --- | --- | --- | --- |
| E03-CORE | Primary: new `execution-v2/access-*`, migration numbering, app wiring, contracts/generated outputs, dedicated tests, Unified and this packet | One current-policy evaluator and transactional proposals/revoke/receipt adapter; T03 matrix and exact handoff | Assigned local cell only; one heavy lane; no new runtime authority |
| E03-LEGACY | `elp203_legacy_grants`: `admin/governance-grants.service.ts`, `repos/governance-grants.ts`, `repos/account-lifecycle.ts`, `test/a4-governance-delegation.spec.ts` | Immutable original receipt/current authority, step-up and denial-audit repairs; primary reviews all four diffs | Read-only until primary sends02 gate-open; no tests/build/Git/shared schema changes |
| E04-PLAN | Route inventory writer, then read-only second review of `ELP2-04/route-authorization-plan.md` | Exactly112 baseline patterns and54 alias linkage, all implementation/test statuses PENDING | No04 code or dependent schema until03 checkpoint; no duplicate file writers |

The primary alone schedules isolated builds/PG tests, reserves migrations and
lands commits. Delegation does not increase the approved4CPU/4GiB/8GiB budget.
Pending researcher fields, Stan's exact ceiling and authenticated TS trust
remain external decisions; tests must label injected policy/verifier TEST_ONLY.

### V2 boundary design for implementation review

New operations are planned under the existing administration area,
`/api/admin/profile-access/v2`, not an unrelated identity product. Own effective
read, advisory preview, proposal submit/status, grant revoke and bounded audit
are separate named operations. No public route accepts TS acceptance, a policy
approval, actor identity, issuer, SQL/URL, role wildcard or a verifier selection.
These are proposed names only until OpenAPI generation and mounted API tests.

The reviewed policy artifact is a prerequisite, not a browser-editable flag.
No production policy/grant/TS mapping is seeded by an additive migration.
Default unqualified policy/receipt adapters report pending; existing legacy
capabilities remain unchanged. Synthetic positive policy/trust is confined to
the isolated harness and is not runtime qualification.

Delegation validation uses one complete parent/ceiling chain for action,
resource, environment, validity and onward delegation. It must not combine an
action from one parent with a wider scope from another. Re-evaluate every
current ancestor on use, including expiry/revoke and issuer lifecycle; local
parent revoke invalidates descendants without rewriting their historical rows.
Resolve OWN_ALPHA/membership selectors through trusted stable-ID relations;
unavailable source proof is not an empty selector or an all-resource fallback.

Transaction authority and idempotency are distinct: authenticate/lock current
actor+session and current policy/ceiling before revealing an earlier receipt.
Canonical payload hashes bind actor, workspace, target, exact action/scope,
validity, expected revisions and parent lineage. Same-key changed actor/body
conflicts. Replay returns the immutable original outcome with an explicit
replay indicator, never the current mutable grant or a refused change as200.
Lock order must remain consistent with existing lifecycle operations.

TS receipts are internal qualified-provider inputs, not a branded parsed JSON
object treated as cryptographic proof. Validate proposal/digest, verified human
mapping, workspace/resource/environment/actions, prior/new membership revision,
effective interval and provenance in the transaction. Pending/rejected/unknown
keeps prior accepted grants. Duplicate unchanged receipt returns its original
decision; conflicting/out-of-order/late-after-revoke input cannot re-enable
rights. Actual producer acceptance remains request003, not a local PASS.

No03 operation/schema has been published or mounted yet. Exact operations,
types, generation commands, fixture hashes and producer commit will be recorded
with implementation; do not consume this design as an existing API.
Claude acknowledgement AWAITING_CONSUMER_REVIEW; later M10 access preview/diff,
app-vs-TS pending states and disabled reasons only when Bobby assigns frontend.
Backend04 may prepare a read-only route/predicate matrix now; dependent code
waits for03's evaluator/revoke gate.00 request002/003 remain canonical; no new
owner permission is requested for the assigned local backend/test scope.

### Working checkpoint at the batch-plan review — 2026-10-15T20:43Z

Preserve, do not regenerate or overwrite, the uncommitted implementation in
`execution-v2/access.contract.ts`, `execution-v2/access-policy.ts` and the four
E03-LEGACY allowlisted files above. The legacy contributor reports16 added
regressions/40 total test definitions; **none has been run for this diff**.
Primary review, transactional V2 persistence/controller/generation, migration
and T03 gate receipts remain pending. A test definition is not a PASS receipt.
No03 API, current policy, TS grant or consumer acceptance is delivered yet.

The read-only review is complete; the legacy writer stopped without testing,
committing or touching runtime. Its deterministic, namespaced refusal-receipt
ID proposal needs primary review for idempotency scope and original outcome
binding before it is accepted. No new backend write/test task is dispatched
by this plan review. Resume order is [Unified §14.9.8](../../../UNIFIED_IMPLEMENTATION_PLAN.md#elp2-batch-current-resume).

### Active-goal continuation — implementation resumes after plan review

The active user goal explicitly continues01→04. Previous turn progressed the
authoritative plan only; this turn resumes03 implementation, not another plan
cycle. Preserve existing diffs and the02 checkpoint; no frontend/runtime work.
Additional bounded delegation: `E03-PURE-TESTS` owns only
`apps/control-api/test/elp2-access-policy.spec.ts` (pure evaluator/schema
regressions, no test execution/Git); `E03-SECURITY-REVIEW` is read-only review of
the four legacy grant diffs, returning concrete findings, no writes or tests.
Primary remains the only writer of shared contracts/migration/Unified and the
only scheduler of the single disposable test cell.

`E03-PG-TESTS` owns only `apps/control-api/test/elp2-access-transaction.spec.ts`:
real disposable-PG service/mounted-HTTP regression definitions against the
primary's frozen service interface. No execution, migrations, shared fixtures,
Git or runtime edits; primary schedules/reviews the eventual focused test cell.

### Implementation checkpoint —2026-10-15T21:08Z

Working tree only; no03 landing, shared DB/runtime, frontend or source activation.
Added four-store migration0134, repository/service and seven named HTTP
operations, strict browser/qualified-input schemas, generated OpenAPI/types and
explicit TEST_ONLY fixtures. See [contract handoff](contract-handoff.md).
The route census now has280 patterns (02 baseline273+seven); capability ledger
has221 routes (214+seven), four workflow stores have explicit retention owners.

Primary reviewed the legacy writer and independent audit. Preserved legacy
fingerprint bytes while binding replay actor/current session; original receipt
and HTTP status survive retry; audits distinguish absent→ACTIVE and
ACTIVE→REVOKED, unknown-target refusals do not write invalid FKs or raw inputs.
Commit-time session/step-up expiry aborts both change and success receipt.

Additional review corrections: a TS-dependent business ALLOW cannot disable
the TS gate via a stored boolean, even in a reviewed root artifact; current
ancestor DENY/revoke/expiry applies on use; empty dynamic scope cannot revoke
without authority. Submit rechecks whole delegation authority at wall-clock
commit time. Receipt acceptance rechecks current issuer/target membership and
ancestor ceiling, exact qualified mapping/receipt/revisions, and rolls back if
the ceiling expires during an awaited verification. Same policy revision cannot
silently substitute another root set. Refused mutations append redacted auth
audit, while business CAS refusals keep an immutable original DENIED outcome.
Pending/rejected/unknown proposal authority is explicit on the effective read;
never promote fixture acceptance into a production policy.

| Validation | Actual result at this checkpoint |
| --- | --- |
| `npm test -- test/elp2-access-policy.spec.ts` | **63/63 PASS**,923ms; synthetic pure evaluator, not TS acceptance |
| contracts `npm test -- test/execution-access.spec.ts` | **34/34 PASS**,751ms;10 fixture cases included, not counted twice |
| source `tsc --noEmit -p tsconfig.build.json` | exit0; no frontend build |
| generator `--check`, static280-route census, `git diff --check` | exit0 |
| focused isolated PG/API/A4/identity cell | STARTED, session27826; no result claimed yet |
| normal hook / coherent03 commit | PENDING |
| actual TS producer/trust/current policy; frontend/browser | BLOCKED external / NOT_STARTED_BY_OWNER_DIRECTION |

Current artifact SHA-256: OpenAPI
`adec9bcdf261775fa8a8a0647c46cd2a2d788003c8d60d1ec5a7bb67c0bc05ac`,
generated types `e65dcb384ddd5494ccbefff4ed1fa8eeaf8ae6a7791a8f2ffd912aacc94e8e45`,
fixtures `bcecb8173934af5fc85ec12c80ca75a91082dcfe71126c718ba19dbe98e75bc7`,
migration `279a15abf0bf03058e9c06dbf2d4d01516cb4d7f4eb233eab260e5ec8437862c`.
Hashes describe the local artifact only, not runtime/schema application.

Resource entry: host32,092MiB RAM,11,770MiB available;158GiB disk free,
75% used. No existing test cell was active. New cell has no host listener or
existing-data mount and uses script trap teardown, total4CPU/4GiB. Point/peak
measurements and cleanup are pending cell completion. The sandbox cannot reach
Docker/sudo; approved escalation accesses only this isolated test lane.

Task returns: pure evaluator writer63 cases, PG writer63 expanded cases and
contract writer34 cases are definitions until primary execution; first and
third have now run as above. No agent ran builds, tests, Git or runtime changes.
Independent security review found the TS-boolean bypass; the primary corrected
it with a pure regression (included in63) and PG installer regression pending.

Next within the already assigned goal: finish03 PG/race gates and normal-hook
commit, then04 enforcement.04 implementation is **not yet started**. Claude
may later consume M10 pending/preview/receipt states from the handoff only when
Bobby assigns it; ACK remains AWAITING_CONSUMER_REVIEW. Canonical00 request002
(exact ceiling/field matrix),003 (qualified TS mapping/acceptance) and owner
recovery remain open; no new owner choice is needed for these local tests.

### Focused cell return and final-review delta —2026-10-15T21:19Z

Cell27826 exited0: clean Control API build, **4 files/186 tests PASS** in40.63s:
transactional policy63 (13.159s), legacy delegation42 (5.957s), pure evaluator63
(79ms), identity18 (6.173s). The cell exercised real PostgreSQL migrations,
locked races, qualified TEST_ONLY receipt injection and mounted Fastify HTTP;
no public listener, real-user policy or TS runtime was used. The historical
56-counter dump/restore signature also passed. This is the snapshot copied
before the eight-operation/revoke-preview and final-review changes below;
**do not claim these186 results certify the later diff**.

The cell's exact containers `control-api-test-node-1773259` and
`control-api-test-postgres-1773259`, plus network `control-api-test-net-1773259`,
were absent on the read-only closeout at21:19Z. A point sample, not peak:
Node781.9MiB/3GiB,97.48%CPU,19pids; PG76.45MiB/1GiB,0.04%CPU,6pids.
Host closeout11,749MiB available and158GiB disk free/75% used.
Cleanup decision **NO_ACTION_NEEDED**; no image/volume/cache prune.

Final review corrections, all still UNCOMMITTED:

- Eight named operations now include advisory revoke preview. Its mounted
  status is explicit200, not Nest's implicit201. Preview carries before.effect
  and conditional grant-state/current-policy reevaluation; removing DENY is not
  falsely described as withdrawing effective access. A delegated ordinary
  revoke cannot remove DENY and indirectly restore its own ancestor rights;
  current locked owner still needs exact revoke permission and target guards.
- A reviewed Portal root artifact cannot supply an accepted TS summary or set
  a business grant app-only. Actual imported root membership must wait for the
  qualified action/scope-bound authority integration under canonical request003;
  Portal review cannot substitute for that acceptance. Existing live rights
  are not changed by this source/test work.
- Audit and proposal reads recheck current permissions at the final wall-clock
  fence. Wrong-password/unauthorized step-up refusals are redacted and audited;
  a DENY row alone cannot qualify a caller for step-up.
- The normal PG gate now additionally compares deterministic row digests of
  all four new stores after dump/restore. Its older counter-only PASS above
  does **not** prove this newly added byte-preservation assertion.

Latest canonical contract run at21:19:49Z: **37/37 PASS**,918ms,12 TEST_ONLY
fixtures included (not additional independent product receipts). Official
`generate:execution-access` and snapshot refresh completed. Eight operations
mean281 live route patterns and222 capability records, not seven/280/221.
New API/PG deltas and normal-hook landing remain PENDING until their result is
recorded. Independent reviewer found no remaining concrete source finding in
its allowlist after these corrections; that is SOURCE_CONFIRMED, not test PASS.

**Current exit:**03 backend checkpoint is still IN_PROGRESS until the latest
normal-hook/PG gate and coherent commit. Original actual TS acceptance,
reviewed preset ceiling/field policy and consumer acceptance remain OPEN.
04 stays preparation-only. Claude remains NOT_STARTED_BY_OWNER_DIRECTION;
[handoff](contract-handoff.md) is AWAITING_CONSUMER_REVIEW. No new owner approval
is requested for local tests; no push/shared-runtime changes are authorized.

Latest test definitions: pure63, transactional70, legacy42 and identity18;
expected focused union193, not an observed result for this final diff yet.
The new restore fixture is explicitly restricted to disposable database
`portal_control_test`: an INVITED unbound/no-password user, pending unqualified
policy and revoked TEST_ONLY history guarantee nonempty restore inputs. It is
test infrastructure, not a migration seed or a real policy change. All four
store row digests and existing migration/history signature must match restore.
Official281-route static census, generator/snapshot378-file drift and shell
syntax/diff checks passed at the pre-landing review. Full hook remains pending.
The exact staged code/test/contract pin is in [handoff](contract-handoff.md).

Final source-only Control API typecheck exited0;11 local packet/handoff links
resolved with0fail. No frontend build/test/browser was run. The normal-hook
landing now runs the latest snapshot; its actual outcome is not pre-declared.

### Normal-hook packaging correction — session86478

Normal commit attempt exited1 before Control API tests: the networkless
contracts cell passed the existing51 files/388 tests, but the new access test
could not collect because its explicit runtime-parser dependency was not
staged. Local37/37 was not evidence of this isolated packaging. No commit or
runtime change resulted; HEAD stayed at02.

The test script now stages only `access.contract.ts` and its finite capability
vocabulary dependency alongside the existing foundation parser. PostgreSQL
imports in that vocabulary are explicitly type-only. The cell still has no
network, credentials, app config or runtime mounts. No test was removed or
weakened. The next normal-hook attempt must certify the corrected packaging
and final API/restore snapshot; the old focused186 result is not reused for
these changed assertions.
