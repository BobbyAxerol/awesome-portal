# ELP2-10 — current-source follow-through, 2026-10-16

## Entry and boundaries

Bobby assigned continuation of ELP2-10 and requested an explicit report when
the next phase is ready. Entry: `/home/bobby/portal-research`, branch
`docs/research-loop-plan`, clean
`fa857b8538c1dd38ab61af94700c71c911d81424`. No ELP2-11 assignment, frontend,
push, dev/main, signing, deployment or financial command is included.

Reuse the completed [local commissioning](commissioning.md) and
[reviewed-root intake](provider-continuation.md); do not repeat their tests as
new source-connected proof. HK inspection was initially read-only; the exact
candidate implementation package below was subsequently approved. No remote
runtime/credential change follows from that approval.

## Task map before delegation

| Task / owner | Read/write allowlist | Acceptance / output | Resource/dependency boundary |
| --- | --- | --- | --- |
|10F-SOURCE / source reviewer|Read exact current HK PM/Edge source, current-read handoff/evidence, current journals, manifests and host lock; return notes only|Identify newly qualified real contracts versus TEST_ONLY provider proofs, usable source ports and exact missing current authority/population mapping|Read-only SSH; no business queries, credentials, remote writes, tests/build or load|
|10F-BOUNDS / independent local reviewer|Read Portal private root verifier/runtime/consumer and tests; notes only|Check remaining bounded-provider and lease obligations against actual PM handoff; report concrete local bugs, not a new scaffold|No file edits/Git/tests; no frontend or source access changes|
|10F-PRIMARY / integration|Own this packet, Unified and canonical10ledger; local implementation only if a concrete bug or compatible qualified contract is identified|Review evidence, preserve existing receipts, implement justified local changes and test only affected paths, then report exact phase readiness|One heavy lane at most, existing aggregate4CPU/4GiB and8GiB transient ceiling; no HK load or mutation inferred|

### Candidate-only approval received during this continuation

Bobby explicitly approved the bounded candidate-only package in the asynchronous
reply: separate worktrees from exact PM/Edge SHAs; implement current-human/
read-only provider and evidence-backed alpha/version association; preserve peer
WIP; no credential change, runtime activation, commands or Live. Each isolated
qualification run is capped at2CPU/1536MiB/300seconds, only in a free allocated
measurement window. Production budgets/calibration remain separately reviewed.

Remote targets created after absence/preflight checks:

- PM `/home/bobby/.worktrees/portal-elp210-pm-provider-candidate`, branch
  `feat/portal-elp210-pm-provider-candidate`, base
  `98dbfd8c545b6d132a3c9fd4bbe709ea8ee88144`.
- Edge `/home/bobby/.worktrees/portal-elp210-edge-provider-candidate`, branch
  `feat/portal-elp210-edge-provider-candidate`, base
  `9db77811fb0845344422f1c77968f6fcbc64b66f` observed after the approval.

No edits to PM/Edge owners' original worktrees. Any source-package WIP imported
mechanically into a candidate must be byte-pinned/reviewed and recorded as WIP,
not silently attributed to its base commit. No source runtime is mounted merely
to obtain a positive test. Actual approved read grants and source associations
remain required; missing historical associations stay absent.

HK foreign measurement lock at16:31UTC belongs to`claude-ts-ci` through17:40UTC:
no HK build/container/pytest/cargo/load. Source preparation is independent of
that lock; isolated SGP testing requires its own current lock preflight.

Pending measurements and source-owner WIP are not permission to fabricate a
provider, source association, calibrated values or budget acceptance. A foreign
measurement lease expiring does not allocate a Portal test window.

## Follow-through result

**ISOLATED_ASSOCIATION_QUALIFIED / FULL_ELP2-10_NOT_MET**. PM candidate commit
`9c39b4663bac971d37b489445b8cfff5d2b463ad`, clean candidate branch. Actual final
**45PASS/0FAIL/0ERROR/0SKIP**,15new association tests and30registry regressions.
Five owned files **+548/−0**:142Python implementation,95candidate SQL,
175test,136journal/handoff lines. No Portal product code/frontend/contract
change; no source runtime activated. Edge candidate is clean at its original
base, with no invented transport adapter added merely to claim delivery.

### Candidate implementation reservation, before code

The PM candidate owns only new `research_association.py`, its focused tests,
`pma11-elp210-research-association-candidate.sql`, its private handoff and an
append-only journal entry in the candidate's main plan. Existing membership,
registry, identity and operator implementations remain byte-identical. Primary
owns these writes; the source reviewer reviews semantics without editing.
This implements an explicit immutable research-version association, not a
second ledger or a caller identity service. No HTTP endpoint or runtime installer.

Association input names the exact Portal issuer/workspace/alpha/version and
source digest, exact TS registered instance, source evidence digest and current
business owner/policy pins. The trusted caller must already hold verified
human/workload authority through the outer transaction. Candidate fixtures are
TEST_ONLY, not accepted source mappings. Existing histories without explicit
evidence remain absent; IDs/names never synthesize an `av_` association.

Qualification will use a mechanical source copy on SGP, cached pinned Python/
PostgreSQL images, a private network and disposable tmpfs database. Aggregate
2CPU/1536MiB, deadline300seconds including cleanup; no host port, persistent
volume, package install, build or active runtime mount. Cover validation,
idempotency/conflict, authorization/current-revision failure, concurrent retry,
immutable bytes and transaction rollback. Reuse existing registry fixtures and
lock probes. No source-connected or capacity PASS is inferred from this cell.

Observed PM owner advanced independently to
`d65c8f74b2b78c61fbb3e432aca9c59a0feac73c`, post-security-delta
**808 isolated tests,0failures/errors**. This supersedes729 only for that exact
source package; the candidate remains based on98dbfd8c, without copying owner
WIP or claiming its newer tested source as candidate HEAD.

**Later source observation at closeout:** owner WIP current-policy lease composition
has **832 isolated PASS** (24new+808regression), final16:51:02–16:53:57UTC,
not another Portal test run or an installed provider. Source receipt
`contracts/baseline/portfolio-account-v1_1/pma11-03-04-current-lease-evidence.json`,
SHA256 `07eea3daff26a3e83b46e16d3f359fb2bc272e64fa820f18cb90c9da482e1f46`,
explicitly says `actual_provider_installed:false`,
`actual_field_policy_enabled:false`, all authority inputs TEST_ONLY.
`read_authority.py` is still the same reviewed hash below. Existing owner WIP
and this newer receipt remain unimported; no missing-source gate is closed by
adding its832 cases to our45 or the prior Portal suites.

## Authority interoperability finding — actual code, not an owner-return guess

| Existing implementation | Actual contract | Missing compatibility |
| --- | --- | --- |
|Portal `execution/delegation.ts:118–139`|RS256, `execution.read`, Portal user/session/workspace/resource claims|Not PM `pma.identity.v1`; no PM integer authority revision or held remote lease|
|TS `manager_issuer.py:240–266,326–345`|EdDSA fixed configured workload subject, `portal.execution.manager.read`, mTLS binding; issuer accepts no human input|Cannot become a human by changing audience/purpose or reusing workload subject|
|PM `identity/human.py:86–110,150–164`|EdDSA `pma.identity.v1`, human kind, exact session/authority revisions; actual authority lease around outer TS COMMIT|No installed genuine Portal-current human provider; `gateway/identity.py` fails503 when absent|
|Portal `execution-v2/access.service.ts:31–110`|Short Core current-session/grant capture, opaque authority fingerprint, external checks outside Core locks, final recapture|Does not reserve authority across TS COMMIT; holding Core transaction/socket locks over network contradicts its explicit boundary|
|PM WIP `read_authority.py` at16:52UTC, SHA256 `a9341fb93a6dbe51cb3bbee9e6fc7e7232fb3f5c89eebf83ada56eaa3ef1204c`|Request/task/connection-local wrapper for a separately supplied real authority lease|Wrapper explicitly grants nothing; no provider/key/route installed. WIP not imported or called runtime-qualified|

The concrete remaining work is a versioned Portal↔PM issuance/current-revision
and **distributed revocation/lease agreement**, followed by configured trust
and real qualification. A short token, repeated GET, workload mTLS or cached
snapshot is not a through-COMMIT lease. Do not map opaque fingerprints to a
made-up integer, reuse `session_version` as app revision, read TS credentials,
share Core DSN or hold a Core DB connection across source network I/O.

This compatibility contract needs approval as an additional Portal/PM authority
change: the approved package is credential-neutral and cannot install the
missing trust. Existing canonical05-001/06-002 retain this exact blocker; no
duplicate generic request. Candidate review can design the protocol, but may
not claim it installed or unilaterally change when revocation becomes effective.

## Implemented independent candidate slice

New private PM `ResearchAssociationRepository.bind` and `ResearchVersionPin`
reuse canonical registry/membership lock order, exact current owner/user/policy
pins and immutable audit/outbox. Per-instance binding is immutable; a shared
Portal issuer/workspace/alpha/version key cannot change its source digest even
across deployments. Current registered TS tuple is server-read, never parsed
from the research ID or inferred from owner display names.

An additive **unnumbered, unmounted candidate SQL** creates only
`pm_registry.research_versions`, `research_associations` and
`research_association_outbox`. Existing source modules/registries/identity code
stay unchanged. DB FK and append-only history checks protect existing pins.
A deferred constraint trigger checks evaluated membership heads, user activity,
current policy and wall-clock expiry at outer COMMIT. Failed commit rolls back
association/version/outbox together. A valid old receipt still requires current
business permission; revocation does not replay into renewed authority.

This is an explicit provenance association, **not current portfolio assignment**,
a human verifier, accepted source fact, capital ledger or trade command.
`registered_portfolio_id` must never be presented as current economic assignment.
A publisher still needs current assignment/app/field authorization. No historical
association rows, root grants, source business rows or runtime services were made.

Independent source/security review accepted the corrected implementation. Review
caught two real candidate defects (cross-instance version/source drift and
membership expiry after bind return); both were corrected before final retake.
The test and source-executor qualification are recorded separately below.

## Actual tests and resource evidence

- Source copy is mechanical from candidate base98dbfd8c, not a second source
  repository or production deployment. New owned files are individually hashed.
- First environment attempt did not create a container; sudo was unavailable
  inside the sandbox. Its own unused local reservation was removed after exact
  owner/content check. The foreign HK lock was never deleted or changed.
- One collection attempt failed on an incomplete source dependency copy; the
  missing same-SHA package was copied mechanically, no library installed.
- Initial new slice **12/12PASS** in3.63s, before review additions; not terminal
  proof for the later schema. Private `source-candidate/attempt-164607`.
- Review retake **44PASS/1FAIL** in12.69s; failure was the revoke fixture keeping
  revision1 rather than required2. Fixture corrected, no authority check relaxed.
  Private `source-candidate/attempt-165041`; superseded by the final retake below.
- Final `source-candidate/attempt-165638`: **45PASS/0FAIL/0ERROR/0SKIP**,
  28deselected, pytest12.23s; controller16:56:38.406345–16:56:55.415074UTC,
  total17.009s. All three tested candidate file hashes match remote commit.
  SQL applied twice; new tests cover current permission before retry, conflict,
  shared-version/source drift, real concurrent blocking, expiry at outer COMMIT,
  revoke, rollback/no outbox and history immutability. No live human/source rows.
- Retained controller SHA256
  `ec6041945207711e64a8506ee1847dc454d2c704177253e1d785edb33abe02e5`;
  JUnit `64c7b92200edf68088ec30312ce342515300519c7b144d38622bede9aa900914`.
  Private parent `/home/bobby/.local/state/portal-execution-elp210/20261016/`.
- Foreign SGP PM window16:51:00–16:56:00 respected; no job started under it.
  Own preceding attempt finished16:50:58, before this reservation, not overlapping.
- All completed cells used cached exact images, internal network, no host ports,
  persistent volumes, image builds/pulls or installs. Own containers/network
  removed. Eight protected Portal services' image/start/restart tuples identical.
  Hard ceilings are not measured production capacity or sampled peak CPU/RAM.
- Exact final removed container IDs
  `495d36e26c8f49f7b4869bebcb1b9eb297357c21ba30f4086501de4c983a1a07`,
  `6f0ad830b368958cc84f56aa85a0cc24a6b0e017cf63706460b3def3a5467d59`,
  network `aaad203435c7845234811b8e36ad5256e8054bb99e1b40c20fe4848bdc0d3ade`;
  `cleanup_errors:[]`, own lock released. No image/cache created to prune.
  Disk free167,905,796,096→167,903,961,088bytes is shared-host observation,
  not all attributable to this test. Active candidate worktrees and private
  source/evidence remain retained for review, not abandoned runtime resources.
- Normal candidate commit used existing Git configuration, no executable hooks
  installed; no bypass. Portal unchanged source retains fa857b85 normal-hook
  receipt:678contracts/4016API+3existing skips/build/scoped restore PASS.
  Do not repeat those suites for this Markdown-only Portal return. The normal
  Portal verification hook is still the local documentation landing gate.

**Portal documentation landing:** links, owned-file hashes, receipt consistency
and `git diff --check` PASS. Local entry fa857b85 remains unchanged; this packet,
coverage addendum and Unified are the only owned dirty paths. Normal Portal hook
unconditionally invokes full contract/API/build/restore suites even for Markdown.
At17:01UTC SGP is reserved by `codex-epg10-11-8842721dbde5`,16:59:48–17:24:48UTC;
do not overlap that foreign lane or bypass the hook just to commit documentation.
Local documentation commit remains **PENDING_NORMAL_HOOK_FREE_WINDOW**; the tested
PM implementation itself is already committed. No additional suite is required
for unchanged source except the mandatory normal landing hook.

## One concrete additional authority package — proposal, not implementation

This is the remaining substantive source work for05-001/06-002, not a generic
request to return more evidence or a repeat of the approved candidate package.
The three existing identity protocols in the table above cannot be joined by
an adapter that merely translates claim names.

**Proposed target:** Portal private server authority/issuance boundary plus the
separate PM/Edge candidate adapters, never browser inputs, Core DSN sharing or
owner WIP. Version the authentic human subject/session/app-policy revision and
exact request/resource/workload binding; keep Portal app authority and TS
membership/economic authority independent. Do not derive integer revisions from
opaque digests or add a second identity database.

**Decision that must precede implementation:** how revocation linearizes with
an in-flight source COMMIT. Recommend an explicit bounded acquire/drain/release
protocol: stop new leases on revoke, settle existing qualified leases before
acknowledging revoke, and fence expired/uncertain leases at TS COMMIT. This is a
proposal, not an approved relaxation of immediate-revoke semantics. A different
commit-authority protocol needs the same exact race/partition proof. Existing
Core database locks must not span network I/O. Trust/key provisioning remains
separately approved; no installed key or credential changes in this return.

**Validation/resource proposal:** same isolated2CPU/1536MiB/300s envelope per
allocated run; valid human+workload/current revision, revoke-before-acquire,
revoke-during-source-transaction, TTL expiry before COMMIT, cancellation,
network partition/unknown release, cross-workspace/session substitution,
bounded drain and same-key recovery. Only genuinely configured trust can close
source-connected qualification; candidate TEST_ONLY cryptography is preparation.
Risk is changing when access revocation is accepted; rollback leaves installer
off and retains immutable receipts/history, never restores old revoked rights.

Approved production budgets/calibration and paired B0/B1/B2/performanceG2 remain
separate10-002/00-005 gates, not proposed defaults from the17second fixture run.
No new request ID duplicates those canonical records.

## Handoff and next phase

No public API, Zod/schema/OpenAPI/generated Portal type or frontend change in
this slice. Claude's existing six named Manager/360 contracts and Score handoff
remain available **when assigned**. There is no new UI field to bind from a
private source table. Consumer state remains NOT_STARTED_BY_OWNER_DIRECTION /
AWAITING_CONSUMER_REVIEW; no browser/UXM acceptance invented.

Backend can continue ELP2-10 authority interoperability after the exact additional
contract/trust scope, and approved source/budget/calibration measurement. It must
not create another fake-provider wrapper. Capacity instrumentation/harness from
the original packet is retained; no production thresholds chosen from this test.
Full10 remains NOT_MET_SOURCE_CURRENT_HUMAN_BUDGET_CALIBRATION_COEXISTENCE_BROWSER.
**ELP2-11 is not ready for full entry and was not started.** Its selected mandatory
dependencies and assigned consumer acceptance still have to pass, or Bobby must
explicitly approve named scope exclusions. Candidate-only approval is not such
an exclusion, calibration approval or runtime promotion.
