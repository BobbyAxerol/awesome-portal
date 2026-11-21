# BR-S02-20 — PRUNED completed-objective metrics are typed absence

Date UTC: 2026-10-08. Owner: Codex/backend. Base `ce9e2733` on
`codex/be-gaps`; land through the ordinary hook and ff-only onto
`docs/research-loop-plan`. Status **DELIVERED_SOURCE**, not new runtime or
browser acceptance. Bobby requested §46; all frontend bytes stay unchanged.

## Finding and interpretation

Claude's existing S06 real-API receipt found PRUNED rows with null objective,
`facts.pruned: true` and a bare `mean_is_sharpe: "0"` on:

- `rrun_70d7d8d1f444fd8e3028f035b5f52361`: 400 retained trials.
- `rrun_7d4709b7aad10eb8b3c55b77411764ff`: 390 retained after early stopping.

[Original consumer finding](../P24/FE_SCREEN_ACTION_MATRIX_RERUN_2026-10-08.md).
Read §46, P15 README/report/debt register/consumer handoff/capability matrix,
RF-05 W3 source-fact receipt, Unified latest addenda and Research A13 rules.

A partial pruning-step value may be a genuine zero. It must not read as the
**completed trial's objective metric**. No source row, retained bytes, manifest,
source transform, seal, engine, selection or historical receipt is rewritten.

## Delivered public contract

Operation unchanged: `researchCurrentSourceSearchGetV1`,
`GET /api/v1/quantbt/runs/{runId}/current-source/search`.
Generated file: `packages/contracts/generated/research-current-source.d.ts`.
Named types: `components["schemas"]["TrialFacts"]` and
`components["schemas"]["PrunedTrialMetric"]`.

For each of `mean_is_sharpe`, `mean_oos_sharpe`, `mean_decay`, `std_decay`,
`temporal_score`, a pruned trial publishes:

```json
{"value": null, "reason_code": "TRIAL_PRUNED_NO_OBJECTIVE"}
```

Its `objective_components` is:

```json
{"state": "NOT_PUBLISHED", "reason_code": "TRIAL_PRUNED_NO_OBJECTIVE", "formula": null, "terms": []}
```

This applies when either the retained ledger state is PRUNED or the source
fact's pruned flag is true. Known ledger PRUNED survives a missing historical
fact block without inventing its stage, study, OOS use or source identity.
The common candidate-fact mapping uses the same source-flag rule. Other
metrics (counts, pool, chronology, constraints, selection), COMPLETE real
zeros and non-pruned historical typed absences are unchanged.

Public Zod and OpenAPI enforce all five nulls/reason plus absent decomposition
when `facts.pruned` is true. `PrunedTrialMetric` gives consumers a generated
literal reason rather than a value sentinel. The canonical fixture is explicitly
synthetic; tests do not call it a new engine run or real API receipt.

Search public revision/ETag and opaque page/playback cursors bind
`PRUNED_TRIAL_COMPLETED_OBJECTIVE_ABSENCE_V1`. Old page cursors are refused;
start from a fresh first page. Immutable `source_revision`, source digests and
source pins stay unchanged, so this does not reseal or supersede old RCs.
Existing session/workspace/profile/page/size/admission bounds are unchanged.

## Focused verification

- Control API **32/32**: 13 dedicated policy regressions and 19 W3 Search/fact
  integration cases. Exact zero/positive/negative partial values; all five
  metrics and decomposition; causal metadata; ledger flag overriding old false
  or null flag; missing historical facts; COMPLETE zero; source non-mutation;
  Zod/OpenAPI agreement; invalid numeric/unqualified null rejection; policy
  revision, source revision preservation, old signed cursor refusal and fresh
  cursor traversal. Existing filtered paging and selected-source facts retained.
- Published contracts **4/4**: synthetic fixture, per-metric negative matrix,
  COMPLETE zero, absent decomposition, generated named literal, idempotent
  generator and preservation of unrelated components.
- Control production TypeScript build and generated snapshot checks are required.
  One normal grouped commit hook is the final full gate; no redundant manual
  full-suite campaign, new image, engine run or preview rebuild for this mapper.

Commands: `vitest run test/research-pruned-trial-metrics.spec.ts
test/research-w3-current-source-facts.spec.ts --maxWorkers=1
--no-file-parallelism` in Control; the named pruned-metrics contract suite
in contracts; normal contract generation and snapshot; `npm run build` in Control.

## Handoff to Claude

Backend source is ready for the next clean preview rebuild. Keep the accepted
layout, native observations, early-stop counts and existing defensive PRUNED
render guard. Read the typed metric null/reason; no zero or numeric-string
special-case is needed against the repaired server. Do not draw partial source
values as a completed metric. Regenerated types are already committed.

After that rebuild, GET the two existing runs above, check all five metric
nulls/reasons on every PRUNED row, and verify a genuine COMPLETE zero remains
numeric. Existing S06 spec is GET-only, uses 1280/660 layouts and own paging.
No new engine run or baseline re-record is requested. Unobserved 6,400-row,
pending Holdout, real Limit/OCO and product/release gates remain separately
tracked; this backend fix does not claim them PASS.

## C4 — bounded resource closeout

Before commit: root105,537,773,568 free bytes (~98GiB, below20%); available RAM
13,623MiB. Docker read-only snapshot: images262/25 active,83.8GB;
containers51/47 active,1.528MB; volumes88/21 active,115.6GB;
cache186.6GB. CI/publication, deployment and rootless-Docker runner services
are active. No runner restart or prune. **No disk-intensive image/release build**
in this slice; existing dependencies and bounded hook test cells only.

Cleanup decision: `NO_ACTION_NEEDED` for slice resources; the mandatory hook's
disposable test cells must leave via their existing exact EXIT teardown.
Retain original source/browser receipts; no business/backup/source volume is
deleted. Existing low-disk quiet maintenance remains separate, not broad cleanup.
