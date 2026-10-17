# ELP2-02 — Identity, current sessions and safe profile lifecycle

**Current continuation2026-10-17:** approved remaining-backend batch02–11,
entry `8ba33de3`. [OwnProfile mapping follow-through](current-mapping.md)
now owns the additive current workspace-scoped mapping delivery and its test/
handoff status. Earlier always-UNMAPPED source locators below are historical;
actual source installation and researcher binding remain separate open gates.

Status: BACKEND_TECHNICAL_CHECKPOINT_PASS / EXTERNAL_MAPPING_BLOCKED.
Landed `b448c0be655817dc49dd02f86aa2544e64c00d48` at2026-10-15T20:37Z.
ELP2-01 landed at
`700aa6a47cdfc72c53ced8f1851144e1ab58f3e0` with a successful normal hook.
Assigned under
Bobby's active01→04 goal, Unified §14.9. This is not
frontend or shared-runtime permission. Frontend NOT_STARTED_BY_OWNER_DIRECTION.

## Entry / scope / test plan

- Same repo/worktree and `docs/research-loop-plan`; record actual dependency
  commit after01 lands. Read Portal guide §§3–5/15 ELP2-02, root/campaign rules,
  ELP2-00 decisions and ELP2-01 contract dictionary; no external authority grant.
- Reuse Portal users, immutable provider+issuer+subject bindings, protected owner
  singleton, sessions/CSRF, lifecycle CAS/audit/idempotency. Add allowlisted own
  profile operation, not a second auth system or generic identity mutation API.
- Fix source-confirmed login target-binding/current-session/first-binding races
  and revalidate lifecycle actor/session at transaction commit. TS/researcher
  mapping is never inferred from name/deployer; unqualified source stays typed
  UNMAPPED/pending. Existing accounts/credentials/owner/grants must survive.
- Owned: `auth/**`, needed repositories/lifecycle service, application wiring,
  versioned contract/generation/fixtures/tests and this packet/Unified. Forbidden:
  frontend, Research business semantics, real users/grants, HK writes, runtime,
  push/dev/main. No migration unless required; recheck inventory before reserving.
- Tests: T02-01…10 through authenticated HTTP + disposable PostgreSQL;
  identity collision, safe-self field rejects, CSRF, expiry/revoke/generation,
  owner preservation, first-binding concurrency, history and read/mutation split.
  Singleton multi-owner gate N/A only with schema/concurrent-claim proof.
- Budget: one isolated PG, no public listener/existing volumes; total≤4CPU/4GiB,
  transient≤8GiB, workers≤2 and one heavyweight test/build/hook at once. Check
  capacity before cell. Rollback keeps identity/grant/session/audit history;
  owner recovery stays disabled, no account reset or new protected backdoor.
- Ownership: primary integration writer for shared paths, contracts and packet.
  Prior independent read-only route audit supplied source locators and race
  findings; no test/write/runtime action was delegated. Any further delegation
  receives disjoint paths and this budget, not permission to start frontend.

### Delegation task map

- `elp2_routes`: read-only03/04 audit, completed; exact reuse/authorization/cache
  gaps returned to primary. No source writes or runtime actions.
- `elp201_wire_review`: identity test author, sole write allowlist
  `apps/control-api/test/elp2-identity.spec.ts`; no build/test/DB/Docker/staging.
  Primary owns implementation, schema/generation, integration execution and review.
  Test cases exercise production-like source identities using only the disposable
  harness and never shared preview. This is02 evidence support, not03 implementation.

## Journal / evidence

- Entry source review found target-binding validation missing from login,
  generation validation incomplete on general session reads, and no first-binding
  row lock. Existing lifecycle/owner defenses are reused, not removed. Tests
  NOT_RUN until implementation and the isolated cell exist.
- Independent final review found no new auth/locking defect after the initial
  four fixes. Harmonized Unicode code-point length with OpenAPI, and bound
  legacy lifecycle replay to its original actor without rewriting historical
  fingerprints. Added exact120/121-code-point and cross-actor receipt tests.
  These late cases await the final02 source snapshot; do not count them in an
  earlier normal hook merely because its process is still running.

## Exit / handoff / debt

Backend IN_PROGRESS; original exit not yet satisfied.
Claude handoff AWAITING_CONSUMER_REVIEW; no consumer work assigned.03 waits for
current identity/session preservation gates. Canonical external decisions remain
in ELP2-00 (exact ceiling/disclosure, trusted TS mapping/acceptance, recovery).
No new approval request: the local backend/test scope is already assigned.

### Final landing addendum — later result supersedes pending notes below

Normal hook21748 completed **exit0** and committed
`b448c0be655817dc49dd02f86aa2544e64c00d48`:51 contract files/388 tests PASS;
clean Control API build;277 API files/2,607 tests PASS,2 files/3 tests SKIP;
duration769.01s, including final identity18/18 and retained-review8/8.
Disposable PostgreSQL dump/restore signature and normal workspace/tracking
checks PASS. Earlier failed/pending receipts below remain historical, not the
current verdict. This is local PG/API proof, not shared-runtime qualification.

Commit scope25 files,+1,656/−69: existing identity/lifecycle preserved, new own
profile API/contracts/tests and tracking. No migration, account/grant reset,
frontend edit, push or shared runtime change. Test cell suffix1579242 used
Node3CPU/3GiB and PG1CPU/1GiB; point sample Node379.4MiB, PG716.8MiB
(not measured peaks). Disk free169,046,573,056bytes/25%; no capacity cleanup
required beyond owned cell teardown. Preserve evidence and shared caches.

Backend checkpoint02→03 **PASS**. Original full exit remains limited by
request003 verified TS/researcher mapping; recovery explicitly disabled under
request001/DEC01, not falsely claimed implemented. Frontend remains unassigned,
consumer acknowledgement AWAITING_CONSUMER_REVIEW. Next approved backend03
may implement local policy/proposals without activating pending authority.

## Requirement → implementation → verification matrix

| Gate | Implementation / evidence scope | Actual result / limitation |
| --- | --- | --- |
| T02-01 stable identity / collision | `AuthService.login/context`; `UsersRepository.lockById`; bindings by stable issuer+subject; first binding requires verified external identity AND existing Portal credential | Disposable PG focused identity/auth matrix PASS in the earlier 90-test cell; latest first-binding/replay regressions await the current normal hook result. Verified-identity stub is TEST_ONLY, not proof of Cloudflare deployment |
| T02-02 safe own edit | `GET/PATCH /api/auth/profile`, strict `OwnProfilePatch`, server-derived self target, lifecycle CAS/idempotency | Earlier focused HTTP/PG PASS; latest replay receipt keeps original operation revision while profile carries current revision. No browser acceptance claimed |
| T02-03 lifecycle / CSRF | Current actor + locked session/generation rechecked in lifecycle transaction before prior-result replay; Origin and session-bound double submit | Focused lifecycle/auth suites PASS; normal hook pending. A previously refused operation remains refused, never successful REPLAYED |
| T02-04 expiry / revoke | Central session lookup validates current disabled/archive state and generation; password completion atomically rechecks and revokes | Focused HTTP + auth/lifecycle suites PASS; no runtime sessions changed |
| T02-05 protected owner | Existing singleton owner anchor and owner lifecycle denial; self-profile cannot change identity/role/grants/target | Focused owner/lifecycle suites PASS; recovery remains disabled, not implemented as a hidden fallback |
| T02-06 concurrent last owner | Schema allows exactly one immutable `PORTAL_OWNER`; claim rejects a different user | Singleton preservation is exercised; multi-owner last-owner workflow N/A because this phase does not introduce multiple owners |
| T02-07 restart/bootstrap | Reuse existing bootstrap once/anchor guards, no new bootstrap/migration path | Focused `bootstrap.spec.ts` + owner tests PASS; real shared-runtime restart NOT_RUN/out of scope |
| T02-08 archive history | Existing A4 archive/lifecycle journey plus identity/credential/grant/anchor fingerprints across own-profile mutations | Focused `a4-account-lifecycle.spec.ts` PASS; no hard delete or migration introduced |
| T02-09 verified mapping | Profile publishes `UNMAPPED / MAPPING_SOURCE_NOT_QUALIFIED` with `ELP2-00/ELP2-REQ-00-003` locator | Typed absence only; actual TS/researcher binding/receipt still BLOCKED by canonical request003, not inferred from name or deployer |
| T02-10 read vs mutate | Own effective capabilities re-read from existing grant evaluator; unrelated ADMIN has no owner powers | Focused PG/HTTP PASS; resource/mode V2 policy remains Phase03, not claimed here |

Focused cell command: `./scripts/control-api-test.sh test/elp2-identity.spec.ts
test/auth.spec.ts test/a4-account-lifecycle.spec.ts test/bootstrap.spec.ts
test/a4-owner-access.spec.ts` → clean Control API build, **5 files / 90 tests PASS**,
disposable PostgreSQL dump/restore schema signature PASS. That snapshot had14
identity cases; later identity cases are not retroactively covered by this
count. Normal hook51825 ended with **2,603 PASS / 1 FAIL / 3 skipped**;
the15-case identity suite passed, but the retained-review harness failed when
it reused a cookie revoked by disable→enable. The correction preserves401 for
the old cookie and authenticates a new session before subsequent permission
checks. Hook89394 ended exit0: clean build,2,606 API tests PASS/3 skipped and
restore signature PASS, including17 identity and8 retained-review cases.
The final working identity file
now contains18 cases, including raw-name validation, Unicode code-point parity
and cross-actor lifecycle replay. These latest changes require the final02
snapshot; no final02 full-hook or landing PASS is claimed in advance.
Contract `portal-profile.spec.ts`: **4/4 PASS**, including the latest nonblank,
control-character and length constraints at that snapshot. The later120/121
Unicode assertions await the final02 hook as well.

## Consumer handoff — not an instruction to start frontend

- Operations: `portalOwnProfileGetV1` and `portalOwnProfilePatchV1` in
  `packages/contracts/openapi/portal-profile.openapi.json`; generated
  `components["schemas"]["OwnProfile"]`, `OwnProfilePatch`, `OwnProfileOperation`,
  `ProfileProblem` from `packages/contracts/generated/portal-profile.d.ts`.
- Regenerate narrow target: `npm --prefix packages/contracts run generate:portal-profile`.
  Canonical synthetic example: `packages/contracts/fixtures/portal-profile.synthetic.valid.json`.
  It names `usr_TEST_ONLY`; never copy it into an account or authority mapping.
- GET is current-session-only and `private, no-store`. Mapping states do not
  reveal issuer/subject/email, credentials, tokens or another person's grants.
  PATCH accepts display name + expected account revision only; server fixes actor
  and target. Origin, `x-portal-csrf` and `x-portal-idempotency-key` are mandatory.
- Refusals:400 invalid fields/key,401 invalid current session,403 security/current
  authority,409 stale revision/key-payload conflict/previous refusal.503 remains
  service-unavailable shape; database details are never public copy.
- Operation `resulting_revision` is the immutable applied receipt revision;
  `profile.account_revision` is current at response time and may be newer on replay.
  UI must not overwrite that receipt revision with the latest profile value.
- Later Claude M10 task: map typed identity/current rights/lifecycle/recovery
  states into approved components and test edit/conflict/revoke/replay. Source
  mapping stays pending; owner recovery disabled with its reason. No new layout,
  frontend implementation, preview rebuild or browser lane has been assigned.
- Producer code currently UNCOMMITTED, runtime NOT_ACTIVATED; handoff
  **AWAITING_CONSUMER_REVIEW**. Final commit/hashes and current-hook results are
  recorded at landing, not fabricated from this preparatory return.

## Resource / rollback record

No additive migration required: existing users/identity/session/lifecycle/audit
tables are reused. No dependency or lockfile change. Test cell owns its exact
temporary PG/Node containers/network and uses its EXIT trap; no existing volumes
mounted. Measured point in focused cell: Node661.7MiB of3GiB, PG72.95MiB of1GiB;
this is **not peak usage**. Shared runtime and real accounts/grants unchanged.
Rollback must retain identity bindings/owner/audit and revoked session generations;
it must not restore revoked cookies or introduce owner recovery.

## Candidate pins — working source, not a committed/runtime identity

Recorded2026-10-15 UTC before the final02 landing gate. Any later source change
invalidates the affected pin; the pending hook must use the final snapshot.

| Artifact | SHA-256 |
| --- | --- |
| `auth/auth.service.ts` | `bef3e752635d880b36762eba32807e6177aad5b44ed92178ef636102eaaf0d57` |
| `admin/account-lifecycle.service.ts` | `de54a57e0c22dbb1e23937b5b14e17e716ff9e76267cc871e5aa715d7e209da9` |
| `auth/profile.controller.ts` | `caff01eec873db3757b221e1a5fbf9154b6538af7932aed21b5dc14a55146db6` |
| `auth/profile.contract.ts` | `fc6cdfe7a41819e89aa0298a85a583ac90f3230c283e9c1a7dcc9aba354a2965` |
| `test/elp2-identity.spec.ts` | `6ac2777db3acb08724f7654a7d665b04c61cc4cd9b90d98fdba4f125ce75f4da` |
| `portal-profile.openapi.json` | `9a8e8ba48f175ff312658913071b79df5050fc229231c0fe25592cdb45c7ef6b` |
| `portal-profile.d.ts` | `2d7c10d947beee45c834a448949a8242c7578f24f561ba14bd9021300847881f` |
| `portal-profile.synthetic.valid.json` | `0e5d8b22abc09ffad74f4d03578d8b7bb576b8b801f27a75ac9ed9c9faab7227` |

Read-only HK repin in this window: PM R2 worktree remains clean at
`d16aa2b5f251596e469807f57e81fe14cdc7e763`; its current guide SHA-256 remains
`7d79d8de84eab19d0d2de3dce2b4c9278a691277b0b8b4379a7db0000dfc8945`.
This confirms source alignment only, not deployed trust, schema or TS acceptance.
