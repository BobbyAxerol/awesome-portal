# Core seven-package follow-through — 28 October 2026

Status: **PARTIAL — independently verified slices, not final ELP2-10/11 acceptance**.
Core `docs/research-loop-plan` starts at `71284cf898d08d369e2f09a26d8c30c1de404457`;
Claude integration was inspected at `fc05a2478`. No runtime installation, remote
push, real-source commission, command enablement or Live action is claimed.

## 1–2. Cross-screen fixture and financial graph

Claude's integration contains `04514714f` (workspace/deployment routing),
`fb2fbff82` (Research-stage HTTP 500), `ef0ea0d53` (account list/detail),
`8ed3dba36` (approval weight) and `9ae204266` (margin with no basis). These
are fixture changes; they do not prove source production or browser acceptance.
An independent run of `worldTies.test.ts` at `fc05a2478` gave 60/61: W38
still returned `PAPER` for `alpha_scale_004` whose Fleet stage is `RESEARCH`.

Core prepared disjoint worktree `/home/bobby/portal-alpha-fixture-fix`, branch
`fix/fixture-research-alpha-stage`, commit `78b0a8477`. It uses the fixture's
own stages when there is no deployment; it does not add a product stage or
alter UI. The new test checks each Research-only scaled alpha with no query,
workspace query and workspace+deployment query. On that candidate the new test
and complete world ties passed **62/62** on a temporary loopback server. Claude
should integrate/review that commit onto the matching fixture world (its parent
is `fc05a2478`), then retake the browser; the commit is not on Core mainline
and this result is not a browser receipt. Avoid rewriting her active worktrees.

Independent Core financial/recovery tests: the economic reducer/runtime,
financial batch and command composition/runtime suites returned 192 passes;
their associated transport initially failed 18 tests because the sandbox
refused loopback `listen` with `EPERM`. A separately authorized loopback retake
of that transport returned **18/18**. These are synthetic/local checks and do
not establish a qualified financial source or gateway.

## 3. Discovery V1 boundary

The earlier Core ACK has been corrected: Edge `unique_json` rejects numbers
above `Number.MAX_SAFE_INTEGER` before its `u64` checks, so both V1 sides fail
closed rather than the Edge forwarding an unsafe value. Native PostgreSQL
`BIGINT` can exceed that boundary; a separately versioned, coordinated
decimal-string wire is needed to support that full domain. Neither this test
nor a zero-candidate observation qualifies full-range source availability.
Core `3051ecf16` adds an mTLS loopback regression for the max-safe boundary
and all six nested unsafe revision positions; **1/1 selected test PASS**. Edge
reported **13 PASS / 1 SKIP** for its focused regression at test-only
`6c63d652`; its skipped Core-codec case is not represented as a pass. Corrected
ACK mirrored to EPG10-08 with SHA256
`794de92361ca9754a65dd48a620dd9072e0e62cc416832fda074c999661afd3a`.
Both Core and fixture candidate whole-project TypeScript checks were interrupted
before completion; neither is reported as passing. The fixture candidate's
temporary dependency symlink was removed after its focused test.

## 4–5. Financial mapping and STATUS

The Edge report-history carrier is historical as-published, not a qualified
current batch or ownership proof: nullable NAV and currency cannot establish
source census completeness, ownership, cut or cashflow/net-PnL semantics.
Do not turn those omissions into zero, `COMPLETE` or `PROVEN`. Existing tests
cover decimal precision, overlap, census and same-original STATUS/custody;
the genuine carrier, financial APPLIED→ACK and gateway/restart receipt remain
open. No command is enabled.

## 6–7. Workload and migration preparation

Core `3051ecf16` adds a no-I/O Canary workload regression: Canary is a stage in
the `live` profile using the `ACTUAL` economic partition, not an invented
environment. `node scripts/measure/test/current-manager-workload.test.mjs`:
**11/11 PASS**, no load or authority. Five focused selection guards also pass;
an earlier full selection subprocess failed without a useful individual
failure and is **not** recorded as passing. Target, 14 approved numeric groups,
calibration, actual coexistence/G2 and browser qualification remain open.

Migration preservation helpers **33/33**, CLI **3/3**, plus the existing
inactive-stage test file passed locally. The older real-backup 30-relation
roundtrip can be reused only for its documented source/profile compatibility;
it is not a new candidate migration, forward/rollback, connected read or release
receipt. See [ELP2-11 packet](../ELP2-11/README.md). No disposable DB was run
in this round; final candidate restore, qualification and acceptance remain.

## Remaining work and consumer handoff

- Claude: integrate/review fixture fix `78b0a8477`, retain W38 and the four
  financial ties, then run the affected browser cells on the integrated SHA.
- Core/Edge: design and implement the shared, lossless V2 discovery wire when
  full PostgreSQL `BIGINT` availability is needed; retain V1 and its fences.
  Continue real source qualification and READ/STREAM independently.
- Core/Edge: obtain qualified financial carrier/ownership/census and an actual
  status original/gateway, then perform APPLIED→ACK and recovery commissioning.
- Qualification owner: pin approved target/bounds/calibration, run the actual
  workload/G2 and browser on the same candidate; then rehearse final migration.
