# ELP2-01 — Authority schema và canonical fixtures

Historical preparation status: PLAN_ONLY / NOT_STARTED. This was a preparation note for the proposed
ELP2-01→04 batch in Unified §14.9, not an implementation/test receipt.
Bobby's current request is to arrange the plan before assigning the goal.
The earlier draft IN_PROGRESS/assignment wording was premature and is corrected;
automation state is not evidence of the required owner assignment.

Subsequent assignment: the active Bobby objective now explicitly assigns01→04
under Unified §14.9, including its local-test scope/budget. Current status
**IN_PROGRESS**; retain the planning record above as history. No frontend,
shared runtime, remote writes, push or dev/main merge is authorized.
Entry: `docs/research-loop-plan`, `be56efdf8a44b0fd8cd44202b04ada582293a1dd`,
`/home/bobby/portal-research`; prior onboarding/rules/Unified edits and delivered
guide assets/ELP2-00 packet remain local dirty and are preserved.

## Scope / entry

- Goal: versioned authority/resource/availability/PM/score contracts, generated
  types, FX-01…25 canonical TEST_ONLY fixtures and T01-01…15 focused checks.
- Reuse old contracts/routes; new schema additive. No production score config,
  real grants, TS acceptance, identity reset, runtime activation or frontend edit.
- Primary owns shared schema/OpenAPI/generated/package scripts/Unified/evidence.
  Read-only agent audits PM wire preservation and score/fixture coverage; no
  writes/commit/build/DB/runtime. Primary reads required guides/contracts itself
  and reviews findings before integration.
- Assigned budget: §14.9 one isolated cell,
  4CPU/4GiB/8GiB transient ceiling,workers≤2;
  no DB needed for this contract phase unless verification proves otherwise.
- Rollback: additive/versioned schema; preserve original legacy interpretation.
  No runtime resource created or changed; commit via normal hook, never bypass.

## Journal

- Preparation: branch/pins and pending ELP2-00 decisions re-read; existing
  generation/snapshot/test/hook paths inspected. No generation target, application
  code, schema, migration or grants changed; no application tests/builds run.
- On assignment: record the actual approval and fresh entry pins, then write
  requirement→code→test receipts, exit/handoff/debt and commit statistics.
  Current tests NOT_RUN; contract delivery NOT_DELIVERED; frontend
  NOT_STARTED_BY_OWNER_DIRECTION. Future handoff acknowledgement remains
  AWAITING_CONSUMER_REVIEW until a consumer actually reviews a delivered artifact.

## Implementation return — 2026-10-16 Asia/Saigon

**Current technical verdict: CONTRACT_DELIVERED / READY_FOR_REVIEW.** This return
supersedes the historical NOT_RUN preparation entry, not the original external
review/activation gates. No route is mounted by this phase. Full integration,
TS/Edge authority review and runtime qualification remain OPEN, not PASS.

### Requirement → implementation → actual evidence

All tests below are local contract/validator tests, **TEST_ONLY_SYNTHETIC**, not
product-source receipts. Test file:
`packages/contracts/test/execution-v2-foundation.spec.ts` (25 FX cases +15 named
requirements, 40 tests total). Schema source, compatibility and consumer details
are in [contract-map.md](contract-map.md).

| Gate | Implementation / negative path | Actual evidence / verdict |
| --- | --- | --- |
| T01-01 | Decimal strings and exact BigInt amount partition; null distinct from0 | PASS; tiny fractions and >JS-safe integer preserved; invalid partition denied |
| T01-02 | Safe UTC-ms integer; int64 PM counters remain bounded strings | PASS; overflow, decimal versions, leading zero, exponent and numeric counter denied |
| T01-03 | Strict browser intent excludes actor/workload/proxy/security fields | PASS; nine spoof/proxy fields and nested actor rejected |
| T01-04 | Resource/mode/currency and operation-specific PM fields/version keys | PASS; USDT retained; unsupported combinations, wrong keys and amount≤0 rejected |
| T01-05 | Exact candidate serializer, UTF-8 text bound, component vs adapter support | PASS; amount/counter unchanged; source RETURN_CAPITAL unavailable in candidate; no dispatch |
| T01-06 | Separate human/workload/trusted-context types and mapping states | PASS; no self-verification or interchange; required audience/delegation/scopes checked |
| T01-07 | Source continuity/generation/quality/clocks independently typed | PASS; missing fields, wrong vocabulary and timestamps rejected |
| T01-08 | Opaque canonical IDs; explicit ambiguous alias resolution | PASS; no first-match selection or name-derived canonical identity |
| T01-09 | Explicit Edge→Portal/legacy adapter, source coverage proof and lineage | PASS; missing proof stays UNRESOLVED/null; no inferred epoch, source clock or DEMO mapping |
| T01-10 | Environment, financial stage, lifecycle and domain independent | PASS; ARCHIVED is not stage, CANARY is not environment, ALL not financial scope |
| T01-11 | Strict metric capsule/field catalogue/model revision | PASS; AVAILABLE+null, invalid denominator/domain/currency, arbitrary SQL/expression denied |
| T01-12 | Separate manager/restricted schemas | PASS; peer/NAV/rank/totals/physical additions rejected; not a deployed field-policy proof |
| T01-13 | Fixed weights/bands, all typed score components and pending config | PASS; exact boundary strings tested, no float rounding or numeric pending score |
| T01-14 | Requested/effective windows; independent direct-NAV vs raw-alpha source | PASS; missing research binding does not invalidate independent direct-NAV fixture |
| T01-15 | Independent status dimensions and explicit runtime readiness | PASS; ACK/local app cannot become TS APPLIED without receipt; incomplete readiness cannot enable runtime |

### Commands and results

- `npm --prefix packages/contracts run generate:execution-v2-foundation`: exit0;
  additive schema-only OpenAPI (`paths:{}`), JSON Schema, fixtures and generated
  TypeScript. No unrelated Research generation or frontend edits.
- Focused Vitest, latest run2026-10-15 19:00:14 UTC: **40/40 PASS**,1.48s total.
  Initial run38/40 exposed a BigInt-refine exception on malformed input and a
  sandbox-denied subprocess check; fixed the validator and moved generation
  drift check to its standalone command. Initial failures are not hidden.
- `node packages/contracts/tooling/generate-execution-v2-foundation.mjs --check`:
  exit0; `snapshot.py --check`: exit0,370 tracked contract inputs match.
- `node --max-old-space-size=2048 apps/control-api/node_modules/typescript/bin/tsc
  --noEmit -p apps/control-api/tsconfig.build.json`: exit0, source-only build
  configuration. An earlier invocation against test-inclusive `tsconfig.json`
  failed on pre-existing test/import.meta typing; no unrelated test sources
  changed and no claim that the test-inclusive command passed.
- `git diff --check`: exit0. Normal pre-commit remains mandatory for landing;
  commit existence confirms it ran successfully, not a promise to bypass it.
- First normal-hook attempt exposed a missing explicit source dependency in
  the networkless contract test cell: the new validator/dictionary were absent
  from its staged allowlist.344 existing tests passed but the new suite could
  not load. Added only those two non-secret source inputs and isolation-test
  assertions; no guard removed, no dependency skipped. Retake uses normal hook.
- Second normal-hook attempt: contract suite **384 PASS**; isolated Control API
  build PASS; Control API **2,589 PASS / 3 skipped**, 276 files PASS / 2 skipped.
  The hook then stopped **before** the PostgreSQL restore drill: primary edited
  the running Bash test script to add resource ceilings, shifting its read
  offset. This was a coordination error, not a project syntax defect; the
  stabilized script passes `bash -n`. No commit or restore PASS is claimed for
  this attempt. Owned cell/network were removed by the existing EXIT trap.
- Independent read-only contract review found score band/component omissions,
  metric contradictions, wrong Edge names, PM text/context and alias gaps. The
  fixes above and corresponding negative tests are incorporated before freeze.
- Latest normal-hook checkpoint: contracts **388 PASS**, Control API build PASS,
  Control API **2,603 PASS / 1 FAIL / 3 skipped**, 276 files PASS / 1 FAIL /
  2 skipped, 755.45s. The sole failure is the retained-review harness expecting
  a revoked session to work after disable→enable (expected403, actual401).
  Phase02's harness correction now obtains a fresh authenticated session;
  its retake is NOT_RUN. No commit or restore PASS is claimed for this attempt.

### Artifact pins

| Artifact | SHA-256 |
| --- | --- |
| JSON Schema | `7a28e0545005789da1a54d304dbf242a2413d464aa905b83d5641e40821c4828` |
| Schema-only OpenAPI | `7af1d2024b6653bd05b0626d621e7de9b418bb8d45119c84291e00fee67610ab` |
| Generated types | `dc8e89c4589c5111ef1da6bbb590aabda11f41b2a6ec22e689e50e4362c9117a` |
| Synthetic FX pack | `7b3044c2f4c990633a4550ab2c521f0fdf0108f9e70027bcbc1c2df02643cb75` |

### Delivery / resources / rollback

New implementation: Control API foundation validators and three contract-tooling
sources; generated artifacts: schema/OpenAPI/types/FX pack; test: one focused
suite; existing tooling/package/snapshot updated. No migration, dependency or
lockfile change. The commit also preserves previously uncommitted onboarding
guides, images, ELP2-00 evidence and agreed rules/plan; those are **not** new
ELP2-01 implementation. See commit numstat for distinct file/line accounting.

The focused contract/compiler checks created no DB/container/listener. Subsequent
normal hooks used the test script's owned temporary PostgreSQL/Node cell; this
does not mean that the phase changed shared runtime. Contract test uses one process;
source compiler capped2GiB heap. Recorded focused-check capacity: disk169347518464 bytes
available, RAM12527550464 bytes available, no swap. CPU/RSS peak NOT_MEASURED;
do not infer resource/load qualification. Cleanup `NO_ACTION_NEEDED`, no broad
prune or user-data deletion. Rollback removes additive unused contracts/validator
and restores tooling list, never revoked identities/grants/audit.

### Handoff / debt / next steps

- Backend02 technical dependency ready: exact types/fixtures and compatibility
  are published locally; proceed under the already assigned batch.03/04 remain
  queued until identity/policy tests pass.05+ are not assigned.
- Claude: **NOT_STARTED_BY_OWNER_DIRECTION**;
  [schema/semantics/fixture handoff](contract-map.md#claude-handoff-not-an-instruction-to-start)
  is **AWAITING_CONSUMER_REVIEW**. Later UXM-01/02 can map types/states; no live
  route/operationId is implied. No frontend was delegated or modified.
- Canonical open requests remain [ELP2-00 register](../ELP2-00/decisions-and-handoff.md):
  request002 exact Stan ceiling/researcher fields;003 actual TS/Edge authority,
  trust and deployed-source proof;005 production score calibration/config.
  None is granted from synthetic examples. No new request after comparison.
- Original full exit: external authority review OPEN; consumer acceptance NOT_RUN;
  runtime activation NOT_RUN/out of scope. Technical contract delivery does not
  close those gates. No additional Bobby permission needed for assigned02.
