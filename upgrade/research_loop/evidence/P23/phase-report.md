# P23 backend report — 2026-09-25

Branch `docs/research-loop-plan`; owner Codex. Scope: resource profile,
read-only cgroup/load instruments, focused backend regressions and truthful
qualification ledger. No frontend code, runtime restart, production deploy,
P22 publication, Execution/Trading System or shared-preview data mutation.

## Actual evidence

| Check | Result |
| --- | --- |
| Merge concurrent Claude/RF commits | PASS: local P22 `05e7801e` and 8 remote commits merged without conflict at `c9ae3c7d`; no frontend paths edited by P23. |
| Compose profile render | PASS: isolated-project `docker compose ... -f compose.research-p23-5gb.yaml config -q`; no container created. |
| Resource/load harness unit tests | PASS: 5/5 `node --test scripts/research-p23/*.test.mjs`; rejects reused sessions, auto-login principal mismatch, mutation/external path, insecure manifest permissions and missing cgroup cap. |
| Research security/bounded-read regressions | PASS: 19 tests, 1 environment-skipped from 6 focused files. The skip is **not** a DR PASS. |
| WFO/current-source regression | PASS: 40 tests in 3 non-DB files. P22 migration initially failed only because no local PG fixture; rerun in exact-name disposable PostgreSQL 16: PASS 1/1. Container removed. |
| Actual shared preview cgroup baseline | `2026-09-25T09:15:09Z`: 7 active services total `441,843,712` bytes `memory.current`. **NOT QUALIFIED:** all seven have `memory.max=unlimited`/`HostConfig.Memory=0`; no heavy or 20-user load was running. |
| Source/host boundary | Protected strategy SHA-256 `34dc1847d051ca40f9ae3d2fbbf2d7e8fdc6b8d1e853beb0cc480b69afe2054d` equals `PROTECTED_SHA256`; host no swap; disk `/` 55% used, 281 GB available at sample. Shared preview remained healthy with unchanged container uptimes. |

One failed intermediate test command is retained honestly: `research-release-candidate-publication-migration.spec.ts`
against default `127.0.0.1:5432` got `ECONNREFUSED` because that fixture
was not started. It passed when rerun with the isolated PG16 container;
this is a test-setup error, not a schema or runtime failure.

## P23-T01…T15 status, no inflated PASS

| Test | Backend status and exact remaining receipt |
| --- | --- |
| T01 | NOT_RUN: 20 distinct identities + real heavy/queued job + cgroup time series under cap. |
| T02 | NOT_RUN: repeated complete/fail/cancel plateau. |
| T03 | NOT_RUN: isolated disk high-water/full and bounded failure. |
| T04 | NOT_RUN: isolated PG/NATS/worker outages and durable resume. |
| T05 | PARTIAL: focused controller/auth/CSRF/actor and bounded-read regressions pass; full cross-tenant file/cache/export matrix not yet run. |
| T06 | NOT_RUN: artifact-corruption and DB+artifact restore hash/readback. |
| T07 | PARTIAL: current WFO profile tests pass; new engine build, defaults and in-flight pinning not exercised. |
| T08 | NOT_RUN: isolated cold cache; no host-wide cache drop permitted. |
| T09 | PARTIAL: P23 has no Execution code/config mutation; no concurrent Execution behavior comparison under W06. |
| T10 | PARTIAL: focused suites above, not full required regression matrix. |
| T11 | NOT_RUN: 20-user inspect/slider/far-seek plus job-count/cgroup samples. |
| T12 | NOT_RUN: audit/what-if/verify/export alongside heavy with quota and queue measurements. |
| T13 | PARTIAL: current capability/profile regression passes; newer release route/default fixture and rollback not run. |
| T14 | NOT_RUN: restored GC/ref graph/exposure/audit child/selection/publication pins. |
| T15 | CLAUDE_BROWSER_PENDING: cold-load deep-link/cursor/reveal and cross-run browser receipt. |

`V11-P23-DR` needs real source/build/snapshot IDs and direct-vs-Portal numeric
diff under W01/W02/W06; `V11-P23-BR` belongs to Claude on the same immutable
candidate; `V11-P23-GX` is partial until actual resource/permission/rollback
and teardown receipts are taken. P22 remains pending actual Delta→R1 and S11.

## Next exact backend sequence

1. Finish P22 real preview receipt and pin a build/source/dataset identity.
2. Start a separate P23 cell using the opt-in profile; provision 20 distinct
   temporary identities, turn **off** preview auto-login and record session
   expiry/revocation. W01/W02/W06/W07/W08 cgroup and latency samples must
   pass together; a cap-triggered OOM is a fail requiring tuning.
3. Run faults/restore/upgrade only on that cell; compare DB and immutable
   artifact digests/ref graph and ensure Research failure leaves Execution
   unchanged. Then Claude runs browser-real on the same build and records
   visual/DOM/network receipt. Close P23 only with every required status PASS.
