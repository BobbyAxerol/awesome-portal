# P20 phase report — backend

## Scope completed

1. Added `research.compare.v1`, a generated OpenAPI client and one
   `SessionGuard`-protected named same-origin endpoint:
   `GET /api/v1/research/alphas/:alphaId/compare`.
2. Implemented three bounded result unions: claim-first attempts, market
   small multiples and an exact two-run pair. The repository selects a pair's
   opaque IDs only inside the already workspace/Alpha-scoped query.
3. Implemented server-side `ComparisonContractKey` refusal, deterministic
   intentional specification differences, conservative P14 protocol claim
   mapping and original-vs-common metric separation.
4. Implemented exact-timestamp raw-return Pearson correlation and retained
   two-line overlay over sealed RS-02 rows only. Missing, duplicate, invalid,
   insufficient and zero-variance input never becomes a synthetic zero.
5. Added additive migration `1723680000054_research-compare-v1.sql`: an
   indexed, expiring operational cache only. It has no evidence, run,
   selection, approval or source write authority.
6. Registered fail-closed configuration, controller/provider/error boundary,
   deployment overlay, generated contract snapshot, capability ledger and
   explicit test-harness cleanup for cache rows.

## Authority and source map

| Product need | Source | Handling |
| --- | --- | --- |
| Same-Alpha run identity / lifecycle | P12 persisted attempts/runs | workspace-scoped, bounded primary-run query |
| Comparison key / intended differences | P08 requested spec | server parses/normalizes; browser cannot submit a key |
| Original metric cards / market mini-chart | P13 immutable projection/series | labelled original scope; chart at most 192 persisted points |
| Claim family / outer-OOS interval | P14 immutable split receipt | conservative protocol-derived rank only |
| Pair raw return correlation | RS-02 sealed observations | exact timestamp inner join; raw rows never leave server |
| Cache | P20 expiring projection | operational only, scoped by request + source binding digest |

## Acceptance map

| Required P20 test | Backend evidence / status |
| --- | --- |
| T01 | Pair IDs are retrieved only through a same-workspace, same-Alpha snapshot; unknown/foreign IDs are one 404 absence. |
| T02 | Server emits `REFUSED` + `pair:null` before raw query/overlay. Browser hidden-DOM proof is Claude-owned. |
| T03 | Markets returns max 24 small multiples, no pair query/overlay. |
| T04 | Claim rank is the primary sort; metric is tie-breaker only. |
| T05 / T11 | no overlap, invalid facts, insufficient samples and zero variance return typed absence, never zero. |
| T06 | Disposable PostgreSQL test independently proves exact raw correlation `1.000000000000` from three aligned return pairs. |
| T07 / T09 / T12 | Reader graph has no command, job, publish, approval, selection or deployment collaborator/route. |
| T08 / V11-P20-BR | Pending Claude: rich S13 product route, HiFi/browser/console receipt. |
| T10 | Raw input is only each P14 outer-OOS interval bound to its exact RS-02 seal/revision; common-window values have distinct definitions. |
| V11-P20-DR | Pending an approved real Delta pair/runtime lane. The synthetic disposable numerical proof is explicitly not real-data evidence. |
| V11-P20-GX | Backend protected-surface/static evidence is recorded; UI/deployment portion remains pending the consumer/activation phase. |

## Test commands actually run

```text
npm --prefix apps/control-api test -- research-compare.contract.spec.ts research-compare.controller.spec.ts research-compare.service.spec.ts config.spec.ts
# PASS: 4 files, 29 tests

TEST_DATABASE_URL=postgres://portal:portal@127.0.0.1:55435/postgres \
  npm --prefix apps/control-api test -- research-compare-migration.spec.ts
# PASS: 1 file, 2 tests; temporary loopback PostgreSQL container removed

npm --prefix apps/control-api run build
# PASS

npm --prefix packages/contracts run generate:research-compare
python3 packages/contracts/tooling/snapshot.py
npm --prefix packages/contracts test
# PASS: 13 files, 170 tests

npm --prefix apps/portal/frontend test -- src/execution/r2Ledger.test.ts
# PASS: 1 file, 22 tests
```

The first disposable migration attempt exposed an unqualified `COMMENT ON
INDEX` reference. It was corrected in the new P20 migration before the
passing fresh-database proof; no existing migration or runtime data was
modified.

## Explicit non-goals and handoff

- No browser UI file was modified. Claude owns rich Screen 13 composition,
  URL/deep-link state, two-color overlay/legend, no-hidden-pair refusal DOM,
  responsive/accessible browser evidence and HiFi comparison.
- No feature was enabled, container rebuilt, migration applied to a shared
  database or runtime service activated.
- Cross-Alpha/portfolio compare, exports, selection/promotion semantics and
  engine jobs remain out of P20 scope. They are not silently substituted by a
  metric ranking.
- Strict and selection-adjusted source claim families are absent in current
  P14 receipts and remain typed source gaps. This is truthful contract state,
  not a backend heuristic/debt waiver.
