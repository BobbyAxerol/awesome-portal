# Core financial fallback review — 27 October 2026

## Disposition: CHANGE before source-backed economic qualification

This review does not re-open a closed real-source gate: the approved economic
source mapping and carrier are still absent. It identifies a Core path that
must be resolved before a new `SOURCE_VERIFIED` document with shared-account
facts is commissioned, not evidence that such a document is currently served.

At `docs/research-loop-plan@0e4382f84`,
`apps/control-api/src/execution-v2/manager-model.service.ts` obtains the
optional `economicSourceFor` and admits a `SOURCE_VERIFIED` document even if
that lookup returns `undefined`. In `manager-model.ts`, the no-mapping branch
of `managerPartitionTotals` uses `economicFacts`, whose snapshot dedupe set
does not contain `net_pnl`, followed by `sumMetric`. The series observation
path also calls `managerPartitionTotals`. That means the existence of the
proof-aware reducer alone does not fence the legacy dataset/series path.

This is not merely theoretical arithmetic: the existing, intentionally
preserved synthetic test `manager-economic-source-runtime.spec.ts`, test
`changes neither legacy default nor proposal status`, demonstrates the same
input producing legacy `42` versus proof-aware `28` for shared facts. The
test labels the mapping TEST_ONLY; its synthetic result is not a finding about
any real account or observed production value. An earlier independent review
already identified the legacy risk in
`C5_FINANCIAL_PRODUCER_REVIEW_AND_CLAUDE_HANDOFF_2026-10-21.md`; this review
adds the current service reachability and exact regression evidence rather
than claiming the problem is new or fixed.

## Required Core / Claude implementation disposition

Before admitting a source-backed profile with financial facts, make the
dataset and retained-series paths reject or return the existing typed absence
for NET_PNL when the required source ownership/census mapping is not installed
and current. Do not guess account ownership, deduplicate on equal amounts, or
assume all facts overlap. Keep safe independent quantities and existing
authorized nonfinancial reads working; only broaden the fence to NAV/other
metrics where their own current source contract requires it. Preserve
confirmed single-source evidence only if the source owner provides a proof
that makes it independently complete; do not infer it from row count.

Claude owns the current backend/consumer lane under campaign §10.13. Coordinate
the narrowly scoped implementation and exact reason contract with the
integrator, including the already-existing fixture/visual baselines. Add tests
for source-verified dataset and series without mapping, one source, shared
account clones, independent sources, missing cost/census, mapping installation,
revocation during request, cursor invalidation, and rollback without relabeling
old series. Reuse the shared reducer and do not let a fixture become real
authority. Core independently reviews and integrates the resulting source.

**Edge action:** continue the existing owner request for economic identity,
disjoint leaves, census, required cost layers, cut/revisions and financial
carrier. A source candidate or a Paper outcome event is not that proof.

## Verification and limitations

Read-only inspection of the service, dataset/series callers, reducer, existing
test and earlier review. On the same source, local single-worker Vitest ran
`manager-economic-source-runtime.spec.ts` and `binding-financial-batch.spec.ts`:
**2 files / 83 tests PASS**. These tests use TEST_ONLY/fake source inputs; no
source connection, HTTP production receipt, DB or browser qualification is
claimed. The first invocation failed before executing tests because the local
Vitest version does not support `--minWorkers`; the corrected invocation
passed. No runtime, UI, source or credential changed; no container, port or
volume was created.

Verification: R0 Markdown-only receipt and Unified link; exact-path staging,
`git diff --cached --check`, link inspection and execution tracking.
