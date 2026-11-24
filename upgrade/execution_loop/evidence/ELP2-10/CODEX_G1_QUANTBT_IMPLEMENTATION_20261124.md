# G1 QuantBT — producer Overview and definite dispatch refusal

Date: 2026-11-24 UTC. **SOURCE_IMPLEMENTED / FOCUSED_GATES_PASS**;
not deployed, not browser acceptance, not full G1/ELP2-10 closeout.
Bobby assigned G1 first, with G2 Access/Observed review in parallel.

## Inputs, ownership and pins

- Implementation: `/home/bobby/portal-t3-core-20261122`, branch
  `integrate/v13-candidate-20261122`, parent
  `cc861d38ec3d04761b28350d0c73e73444c2b1b8`.
- Current plan: `CODEX_CLAUDE_BACKEND_CONTINUATION_PLAN_20261124.md`, G1,
  in `/home/bobby/portal-research/upgrade/execution_loop/evidence/ELP2-10/`.
  Root/campaign/Research rules and existing 23 Nov QuantBT run receipt apply.
- Root owns routing/binding, tests, integration and tracking. One delegated
  writer owned the six backend/test paths. Two other agents reviewed Access
  and Observed without editing them; they independently reviewed the final
  G1 frontend/backend diff. Both G1 source reviews: ACCEPTED, no blocker.
- No UI component, layout, color, chart, baseline or strategy changes. No
  changes to Claude's two candidate branches or seven Access WIP files.

## Delivered behavior and contract impact

1. Valid producer IDs (`rrun_` plus 32 lowercase hex characters) entering a
   bare run, Overview or old query-style Overview resolve to the existing
   EvidenceFlow screen/read contract. Shell and legacy Overview hooks do not
   run first. Query/workspace/hash survive; query alias removes only `run`.
   Explicit Research screens remain unchanged; legacy IDs keep their reader.
   This ID grammar is routing, **not** proof of existence or authorization.
   Missing/revoked data stays with the existing Research reader's error path;
   no fallback to legacy or cross-workspace discovery was introduced.
2. The private Portal producer authenticates before publishing a definite
   pre-publish refusal. Only flag OFF or missing publisher returns the new
   strictly typed `research.run-dispatch-refusal.v1` with outcome
   `NOT_DISPATCHED`, reason `PRODUCER_DISABLED` / `PUBLISHER_NOT_INSTALLED`,
   and exact workspace/run/job/worker-attempt/lease-epoch tuple.
3. Core accepts that evidence only for the exact current, unstarted live claim.
   One PostgreSQL transaction locks producer/job/run/attempt/worker and stores
   the receipt, FAILED lifecycle, event and audit. P06 has already set the run
   RUNNING during claim; CLAIMED worker/attempt, no progress and no cancellation
   are required. Started, expired, superseded or cancelled claims cannot be
   settled by this path. Later claim/202 recording cannot overwrite the refusal.
4. Same-intent retry after retained refusal cannot re-claim or re-publish.
   Unclassified 5xx, timeout, malformed 202 or lost DB acknowledgement remain
   `RESEARCH_RUN_TRANSPORT_UNKNOWN`: a broker may already have committed.
   No inferred failure, duplicate engine run, fake progress or zero usage.

Existing columns and existing browser Problem codes are reused. **No migration,
public DTO or generated-contract change.** The private refusal is validated in
Zod and producer/service/PG tests; existing Portal middleware still adds its
normal request ID outside `detail`.

## Actual validation (all heavy commands in primus-build)

Envelope: shared 3 CPU, memory.high 6 GiB, memory.max 8 GiB, one slot. No
dependency installation, live engine run, runtime write or parallel heavy gates.

| Gate / command | Actual result |
| --- | --- |
| Pre-fix FE `legacyRedirects.w2b.test.tsx` | Four new routing cases failed / ten passed; failure reproduced before implementation |
| Frontend `npm exec vitest -- run src/features/quantbt/routes.test.ts src/features/quantbt/legacyRedirects.w2b.test.tsx src/research/evidenceFlow.test.tsx src/research/evidenceFlow.windows.test.tsx src/research/evidenceReadsGate.test.tsx --maxWorkers=2` | Five files / **166 PASS**, exit 0 |
| Frontend `npm exec tsc -- -b --pretty false` | **exit 0** |
| Core `npm exec vitest -- run test/research-run-dispatch-refusal.spec.ts test/research-w1-wfo-profile.spec.ts --maxWorkers=2` | Two files / **54 PASS**, exit 0 |
| `bash scripts/control-api-test.sh test/research-scheduler-concurrency-pg.spec.ts` | Core build, migrations through 158, real PostgreSQL **7 PASS**, exit 0; runner's preservation/restore drill PASS |
| Portal `./scripts/test_backend.sh -q -k 'p10_pre_publish_refusal or p10_publish_exception or p10_t06_private_ingress'` with existing `POOL_ALPHA_PYTHON=/home/bobby/portal/apps/portal/.venv/bin/python` and `PYTHONDONTWRITEBYTECODE=1` | **5 PASS**, exit 0; Starlette TestClient deprecation warning only |
| Protected strategy SHA; integrity ledger refresh `--check`; execution tracking reconciliation | PASS; ledger bytes unchanged |

Python's first assertion run had 1 PASS / 4 FAIL because middleware also
returns `request_id`. Assertions were corrected to validate `detail` and the
request-ID/header agreement; the five-case retake passed. One setup invocation
without the explicit Python path exited before tests; not counted as evidence.
PG negatives exercise already-won cancellation/start/supersession states, **not**
held-lock concurrent interleavings. Service fixtures are not real broker proof.
FE routing tests use real module/readers with controlled 404 responses; these
are not real-session/API or visual/browser acceptance. No new product build.
Normal commit hook is required on this frozen change; its terminal result and
commit SHA are recorded in the same-day closeout addendum, not assumed here.

## Existing runtime observation — read-only, not repaired by inference

Read at the current dev Control API using a read-only transaction with a 10s
statement timeout; no session/credential printed and no lifecycle changes:

| Run | Observed run / job state | Disposition |
| --- | --- | --- |
| R-P04-001 `rrun_8b7b1831d95c38e2ff1a509288356848` | QUEUED / RETRY_WAIT; no current lease/worker | Still an old orphan; old generic 503 does not prove NOT_DISPATCHED. No forced failure or SQL cleanup |
| R-P04-002 `rrun_ee2a335d9de38bf91477910e20a7b43c` | READY / SUCCEEDED, worker SUCCEEDED | Reuse for authorized final Overview/Report browser acceptance; no needless engine rerun |

Observed service pins were `local/portal-control-api:cc861d38e` (started
2026-11-23T11:41:28.346856184Z) and quant worker
`local/portal-portal-api:cc861d38e-hmd` (2026-11-23T12:07:17.973756259Z).
They were not swapped or modified. Any orphan cancellation must use the
existing owner/admin lifecycle endpoint
`POST /api/v1/research/runs/{id}/cancel` with real Origin/session/CSRF and an
explicit reason, after current worker/artifact checks in an authorized dev
operation. This source-only assignment does not widen dev/stable authority.

## Frozen source content hashes (SHA256)

| Path | SHA256 |
| --- | --- |
| `apps/control-api/src/research/repository.ts` | `5ab340bdc193cf409268aa161bb14bd4c05ffb2b129066955c153dfbde7b0e59` |
| `apps/control-api/src/research/run-create.service.ts` | `e9ca4b5d17066e3cf14810a73569a440c2e62b757dac2fcd4e84d43b608e41e1` |
| `apps/control-api/test/research-run-dispatch-refusal.spec.ts` | `0e304c6ff6cfc7a908d2a7e31612aef05562fabcc7cb2ccaa69dcc6582e7f82f` |
| `apps/control-api/test/research-scheduler-concurrency-pg.spec.ts` | `335970edd14886389e5f9e6c19a4351a0942589fba32bc3486e37e7a67c13f0e` |
| `apps/portal/backend/src/portal_api/api/routes_runs.py` | `b8afabc8e2c61d409dd68bb8e238e75e406914258ee34c5ef1006b62aae965f5` |
| `apps/portal/backend/tests/test_research_run_producer.py` | `8f7697b2723a6581af44d35a1a1bd74a0190ed7f8937b9192a676b3b4b65e757` |
| `apps/portal/frontend/src/features/quantbt/QuantBTModule.tsx` | `6992b9e0c9d83b411e191dd35ba27840f1cb88792c73909c8c0b52d7d411e37d` |
| `apps/portal/frontend/src/features/quantbt/legacyRedirects.w2b.test.tsx` | `e138c914b402a55a1268cf2472b284dc80efb6374df4008e4104d3bc740236aa` |
| `apps/portal/frontend/src/features/quantbt/routes.ts` | `eefdeea99927f7d1c94a9accef9065c3f71b23790f8aff7210da29256269e1a0` |
| `apps/portal/frontend/src/features/quantbt/routes.test.ts` | `4fd69fdeb20822c8497a2c33c4375a1ea8a9cc63617eec87fb6ff8deea2a861b` |

## Cleanup, handoff, remaining work and rollback

C4 read-only snapshot: root 621 GiB total, 481 GiB used, 140 GiB free (78%
used); host RAM 32,092 MiB total / 9,650 MiB available, no swap. Docker:
215 images / 41.53 GB, 290 containers, 75 volumes / 28.88 GB, build cache
19.73 GB. Reclaimable totals are not deletion authority. No matching runner
systemd units were listed by the host query; guessed unit names were inactive,
so online CI registration was **not verified**.

The real-PG runner removed its exact two containers and network
`12380822248510280` and disposable dependencies; post-exit name-filter queries
returned no resources. G2's three temporary dependency links were removed by
trap and checked absent. Keep the small source-only diagnostic harness for
Claude's retake. **NO_ACTION_NEEDED for owned resources**; no global prune,
backup deletion, shared dependency cleanup, service restart or account changes.

- Claude next: accept routing/binding-only diff; on a separately authorized
  built candidate, verify producer Overview/Report, workspace/deep link/reload,
  legacy and denied paths. Do not redesign the already accepted EvidenceFlow.
  No new public field needs a frontend mapping.
- Codex next: resolve old orphan only through authorized lifecycle, obtain
  deployed/browser receipt, and review [G2 changes](CODEX_G2_ACCESS_OBSERVED_REVIEW_20261124.md)
  returned from Claude. Published handoff is not Claude consumer ACK.
- G1 source tests complete, **G1 runtime/browser/orphan closeout still open**.
  G2 review delivered CHANGES_REQUESTED; its implementation stays offline/OFF.
  No new G3 phase, Edge commissioning, grant, command/Live, push, deploy,
  dev/main merge or signed release started in this slice.
- Rollback: source-only reviewed revert; there is no schema/runtime operation
  to reverse. If source is deployed later, preserve refusal receipts and FAILED
  lifecycle/audit; never erase them to make an old same-intent retry dispatch.
