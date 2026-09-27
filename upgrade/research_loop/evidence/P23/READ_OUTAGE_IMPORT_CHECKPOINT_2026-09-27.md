# P23 bounded reads, outage recovery and E6 import-truth checkpoint

Date: 2026-09-27 · Codex · branch `docs/research-loop-plan` · base `eb4b034b`.
This continues Bobby's original eight-group goal. It is not full P23/P24,
production activation, a smaller substitute goal, or a signed-alpha claim.
No frontend source/design/baseline, shared preview 8095, dev/main, stable,
AWS-HK or Trading System was changed. Runtime drills target only
`portal-research-p23-ol12` at loopback 8096 and its private owned volumes.

## Sources and changes

Read the full private goal, root AGENTS, Research A13, Unified live ledger,
P23/P24 detailed guide and workload/SLO tables, P23 packets, current Library
and its P19 consumer, import Zod/schema/OpenAPI/controller/service, and the
existing private runtime identity/receipts. Preserve preceding F6, upgrade,
F4/E10 and OL-02 proofs; do not rerun their engines for documentation.

### Bounded Library and shared source reads

- Library uses existing bounded admission: four active and sixteen queued,
  finite queue/acquisition timeouts and exactly-once late-client release.
  Current-source and Evidence stay two active, with eighteen queued. The
  shared PostgreSQL pool remains ten; viewer requests cannot enlarge it.
- Apply metadata filters/keyset/limit before rich lateral card hydration.
  Combine census/facets in one snapshot query; fetch retained card aggregates
  on that same repeatable-read snapshot rather than a second service read.
- Do not fetch unused full fold/candle history for Library cards. Preserve
  exact selected-trial metrics, completeness, provenance, nulls and cursor
  precision. P19 still consumes the compatible bounded card projection.
- Named prepared statements reuse SQL parse/plan only, never data or actor
  authority. At most 128 fixed shapes per connection; workspace/actor/search/
  cursor remain parameters. RLS, membership, read-only role and snapshot are
  checked on every read. A focused test changes both actor and workspace
  under the same statement name and proves fresh authorization parameters.
- P10 WFO/imported creates enter the existing HEAVY lane; fixed P04 retains
  INTERACTIVE. Queued-intent uncertainty stays typed, not a fabricated 202.

### Actual PostgreSQL/process/NATS failure and repair

The first real PG stop found an unhandled idle-client `error` on `pg.Pool`;
Node terminated the Control API. Its failed receipt is retained unchanged.
The pool now has a five-second connect timeout and an error listener: pg
discards the dead idle client, API stays alive, warnings are rate-limited
and contain only a validated error code, not Error.message/client/DSN.

The repaired actual drill passes: PG-unavailable GET returns bounded sanitized
`500 / INTERNAL_ERROR` in **5014 ms**, not a false success; after PG returns,
the API PID/restart count and authenticated principal are unchanged, archived
source/producer/artifact hashes remain identical and Report reads normally.
This documents the actual generic refusal, not an unmeasured domain-specific
503. With worker and NATS stopped, replaying the same public P04 intent adds
no producer/job/source event. Restart resumes that exact durable message to
`COMPLETED/READY`, run `rrun_9389ed196036328829227ec11e12b027`, one intent.
All stopped services are restored in finally before receipt PASS.

Replacing the owned API container also exposed stale nginx startup DNS in
the cell. `cell.mjs up` refreshes only the owned gateway when that API's
container ID changes; no shared nginx edit or unrelated service restart.

### E6-BR-01: Alpha-source signing/SBOM semantics — delivered

Registration and RegistryEntry publish additive `import_attestation`, generated
as `research-alpha-import.d.ts:RegistrationResponse/RegistryEntry`. Its strict
fact schema is `research.alpha-import-attestation.v1`; scope is only
`REGISTERED_ALPHA_SOURCE_ONLY`. Actual server example:

```json
{
  "schema_version": "research.alpha-import-attestation.v1",
  "scope": "REGISTERED_ALPHA_SOURCE_ONLY",
  "source_digest": "82c0b2e7e83882dbe5969bd866d8a98b0320e75ac8456de253b9a7e9e51bd495",
  "signature": {
    "state": "NOT_PUBLISHED",
    "reason_code": "RESEARCH_ALPHA_IMPORT_SIGNATURE_NOT_PRODUCED",
    "source_locator": "apps/control-api/src/research/alpha-import.service.ts#register"
  },
  "sbom": {
    "state": "NOT_PUBLISHED",
    "reason_code": "RESEARCH_ALPHA_IMPORT_SBOM_NOT_PRODUCED",
    "source_locator": "apps/control-api/src/research/alpha-import.service.ts#register"
  }
}
```

Real parse/gates/register DRAFT/replay/list/injection-refusal PASS for
`av_p23_attestation_ee6148a8_0_3_0`. Registration/replay are 201, list 200,
caller-injected image attestation 400. An expired initial parse was replaced
only by public re-parse of the same bytes, not a DB expiry/hash rewrite.
Gates/Activate now explicitly return published 200 rather than Nest POST's
implicit 201; Parse/Register keep 201. No activation is inferred from DRAFT.
Signature/SBOM really are not produced for an imported alpha. Release-image
signing is a different subject and cannot fill those fields.

### Runtime dependency pins

Lockfile pins known advisory fixes: Fastify 5.12.1 and fast-uri 3.1.6/4.1.3,
without Nest/Node major change or `npm audit fix --force`. Primary references:
[Fastify advisory](https://github.com/advisories/GHSA-w2qp-rph6-63g4),
[fast-uri advisory](https://github.com/advisories/GHSA-5jgf-p345-68v8).
Lock SHA-256: `8938cd8a0fb727dafabf0846458c9f8f41d5fdcffb88da032b0c4d8926398939`.
The current diagnostic image predates these dependency overrides. Fresh
Node-22 install/build/full regression and a clean candidate remain required.
A new registry `npm audit` capture was rejected by infrastructure review
because it sends dependency metadata externally; no alternate path/bypass
was used and no new audit receipt/PASS is claimed from that rejected call.

## Actual measured results, without upgrading diagnostic evidence

First mixed probe: twenty actual readers + one active real WFO + four queued
intents; heavy completes, no implicit viewer job; seven-service peak
`684380160` bytes includes page cache. Library warm p95 **805 ms FAIL** (500
ms target). Preserve this failure; do not accept its older HTTP-only PASS.

After optimization, twenty-user warm read p95: Library **466**, Progress 182,
Evidence 328, Search 178, Report 164, Replay 348 ms; all six measured SLOs PASS.
This warm read was not simultaneous with a newly measured heavy workload.
Cell identity is still `dirty:true`; diagnostic results cannot close T01/T11.
The final candidate must pass simultaneous mixed load and all remaining gates.

### Mandatory-gate correction, same scope

The first full hook ended with 1329 passing tests, one failing and one external
skip. `research-w5a-migration.spec.ts` left its proxy-only WFO fixture holding
the HEAVY lease, then tried to dispatch a second primary. The scheduler
correctly refused it; the prior INTERACTIVE classification had hidden the
fixture's missing terminal transition. No hook/lease/admission guard is bypassed.

The fixture now completes each simulated job through `finishDurableJob` and
its real fence before comparing the immutable frozen parent. Two blocked
clone submissions also prove one QUEUED intent, no upstream dispatch, unchanged
parent and exact run-ID reuse after capacity returns. Public 503 copy now
names queue capacity or lease recovery, not a fictitious previous lease alone.
Fresh disposable PostgreSQL + pinned Node 22 focused rerun is **40/40 PASS**
(four migration/lineage tests and 36 profile tests); full hook retake is still
required and not predeclared green.

Two test-tooling attempts are retained: read-only Vite bundling failed EROFS;
the experimental config runner was killed at its 350 MiB test-process cap.
The successful native-config runner used an explicit 768 MiB build/test cap
with swap disabled, separate from the unchanged production-like P23 runtime
caps. These are test setup results, not a runtime 5 GB qualification or waiver.
All three temporary PostgreSQL containers/networks were removed in finally.
Private logs: `heavy-lineage-focused.log`, `heavy-lineage-focused-runner.log`,
`heavy-lineage-focused-native.log`; the failed full hook remains preserved as
`read-outage-import-commit-gate.log`.

Focused technical gates: P23 verifier **14/14** (Vitest); Node helpers **23/23**
(separate runner, excluding Vitest file); backend **68/68** in six files;
Control API build exit 0. P12 actual PostgreSQL **11/11** was also rerun after
SQL changes. Frontend generated-type consumption previously passed typecheck
and 50 import tests without editing frontend paths. The unbypassed mandatory
commit hook is recorded separately when terminal; no future PASS is asserted.

Reproduce verifier: `packages/contracts/node_modules/.bin/vitest run --config packages/contracts/vitest.p23.config.ts`.
For Node helpers, run `node --test` on `scripts/research-p23/*.test.mjs` except
`qualify.test.mjs` (which imports Vitest). An earlier combined Node invocation
failed because these are different runners; no product failure was inferred
and no required file was skipped. Both correct families now pass separately.

## Private evidence and cleanup

Files remain 0600 under
`/home/bobby/.local/state/portal-research-p23/20260927/`.

| Runtime file | Actual SHA-256 |
|---|---|
| `import-attestation-receipt.json` | `3d68c6882bf8a46efd945b5a84342e5a1b72d37ea0778532f3077f55561f3bf0` |
| `fault-pool-recovery-fixed.json` | `d80e598d86b4d0e2f0a63218212845805387406f2b6ba3bf66a8cbf06182a881` |
| `read-prepared-warm-diagnostic.json` | `d7ce1083d3562fa18bfacb40a9009f372c7fa9037224f88ed0558ece568d7f9e` |
| `mixed-workload.json` | `da87a19b79ef8e481ed080b23c44fb309821ca1c05a5fbce6819029b895b1468` |

Raw technical logs: checkpoint `wip-backend-focused.log` (68/68),
`wip-backend-build.log`, `wip-p23-verifier-node.log` (14/14),
`wip-p23-node-helpers.log` (23/23); each includes actual exit 0. Full/raw API
responses, cookies/source bytes and activation credentials stay private.

No active fault remains; PG/NATS/worker and observer root restored, gateway
healthy. Host has no swap, root 58% used/261 GiB free, 22139 MiB available
RAM at checkpoint. No image/volume/cache prune. The capped cell, 22 test
identities and original/copy artifacts remain owned by continuing P23; exact
revocation and down-without-volumes are due at full closeout, not claimed now.

## Full goal still active

After this slice is committed, five of eight scoped groups have technical
backend proof: F6, migration, F4/E10, OL-02 and E6-BR-01 semantics. The three
large groups remain: full OL-12/P23 (T01–T15), F3/F5/OL-24 exact-candidate
browser reads/writes/publication and P24 `READY_FOR_BOBBY_REVIEW`. Disk-full,
plateau/scale, tenant file/cache/export, coherent restore workers-off, cold,
upgrade/rollback/pins, utility quotas/GC, full browser/print/visual and cleanup
are not closed by the warm read or outage subset. No push/release authority.

## Clean candidate and measured Library repair continuation

The unbypassed `4e343fe9` commit gate completed: Control API **1330 PASS / one
external test skip**, contracts **196 PASS**, snapshot **219 MATCH**, route
inventory **241 / zero collisions**, disposable database restore drill PASS.
Private raw log: `checkpoint/read-outage-import-commit-gate-retake.log`.

Clean candidate build/up completed; identity binds `4e343fe9…`, `dirty:false`
and actual image IDs. Cold twenty-principal read PASS means new API process,
pool and prepared plans, not host/HMD cache clearing. Actual WFO HEAVY completed
with four distinct queued HEAVY intents. All 120 reads returned 200, measured
cgroup peak 611323904 bytes, viewer jobs 15→15. **Library p95 789 ms FAIL**;
Progress/Evidence/Search/Report/Replay 406/422/376/228/355 ms meet their targets.
The four queued-only intents were cancelled through the normal API afterward;
their producer/history rows remain. Receipts: `candidate-4e343fe9-{workload,
read,cold-read,resource-series}.json` under the private runtime directory.

Measured diagnosis on the same real, read-only scoped relations:

- EXPLAIN page execution 8.315–9.399 ms, census 4.376–4.986 ms; first page
  planning 26.738 ms. Twenty direct repository calls finished in 371 ms.
- Two sealed WFO summaries were 60080 bytes each; Library/P19's shared card
  mapping consumes neither the full summary nor full candidate payload.
- Select only immutable selection keys and exact selected-trial metrics;
  retain same-snapshot fold aggregates, nulls, cursor, RLS and membership.
- Validate each card once in `mapRow`, then the canonical envelope separately,
  preserving the 50-item ceiling and all public schema validation/defaults.
  No new cache, auth reuse, pool expansion or SLO change.
- Ephemeral read-only comparison of compiled old/new modules produces identical
  public DTOs (excluding only the database transaction timestamp). Warm
  diagnostic p95 340.677→247.907 ms. This is not an HTTP/heavy qualification.

New focused Library tests **30/30**, actual disposable P12 PostgreSQL **11/11**
and Control API build PASS. Private diagnosis files:
`library-query-diagnostic-4e343fe9.json`, `library-plan-diagnostic-4e343fe9.json`,
`library-decode-profile-4e343fe9.json`, `library-parity-narrow-diagnostic.json`.
No runtime application files or shared preview were edited for profiling.
Next exact candidate needs full commit gate/build/mixed receipt; full P23/P24
is still incomplete. No frontend, Production, AWS-HK/TS, push or merge changes.
