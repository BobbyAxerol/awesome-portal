# P19 backend and typed-contract packet — Attempt Lineage

Status: **BACKEND_AND_TYPED_CONTRACT_COMPLETE · FEATURE_DARK · S10_PRODUCT_BROWSER_PENDING_CLAUDE.**

P19 adds one bounded, same-origin, Portal-persisted Research reader for Screen 10. It does not claim a QuantBT rerun, direct QuantBT/worker/artifact read, activated deployment, browser acceptance, or `PRODUCT_ACTIVE`.

Read [phase-report.md](./phase-report.md) and [frontend-handoff-claude.md](./frontend-handoff-claude.md) before changing Screen 10.

## Published operation

| Generated operation | Route | Bound truth |
| --- | --- | --- |
| `researchAttemptLineageGetV1` | `GET /api/v1/research/alphas/{alphaId}/lineage?workspace_id=&limit=` | One session/workspace-scoped repeatable-read Portal lineage. `limit` is 1–128; each attempt returns at most 32 non-primary child runs and declares any truncation. |

The browser may supply only the Alpha id, optional workspace id and bounded limit. It cannot submit a parent edge, select a promotion, reset a gate, create/fork/reproduce/upgrade a run, name a source relation/cursor/path, or see raw requested/effective specs, worker identity, lease or credentials.

## Truth model

- Logical Research attempts come only from `research.attempts`; worker retry ordinals remain a secondary `technical_retry_count`, never graph nodes or a multiple-testing attempt count.
- `failed`, `abandoned` and `draft` attempts are retained and counted. Child relationships are explicit `research.runs.relationship_kind`, never inferred from timestamps or names.
- Parent edges are scoped to workspace and Alpha and rechecked at read time for duplicate/cyclic/cross-Alpha corruption. Returned chronology exposes `coverage=PARTIAL` with `P19_BOUNDED_GRAPH_LIMIT_REACHED`; dense child lists expose `P19_CHILD_RUNS_BOUNDED_PER_ATTEMPT` rather than silently omitting rows.
- Semantic diffs are server-normalized from persisted P08/P10 requested and effective specs using a fixed allow-list. Structured values are stable SHA-256 values, not raw config objects. Missing manifests remain typed `NOT_PUBLISHED`.
- Exposure rows are returned as persisted facts. Zero facts means `NOT_PUBLISHED`, not a clean exposure result.
- `research.attempt_promotion_pick_facts_v1` accepts only an immutable, source-attested same-version attempt/run fact. Portal runtime has `SELECT` only and no browser write route. If absent, P19 returns `P19_SOURCE_DID_NOT_PUBLISH_PROMOTION_PICK`; it never substitutes newest, active, best-metric or Sharpe logic.

## Feature and rollback

Default remains dark:

```dotenv
CONTROL_API_FEATURE_RESEARCH_RUN_LIBRARY=false
CONTROL_API_FEATURE_RESEARCH_LINEAGE=false
```

`FEATURE_RESEARCH_LINEAGE=true` requires `FEATURE_RESEARCH_RUN_LIBRARY=true`; otherwise startup fails closed. The signed-release sequence and flag-only rollback are in [the P19 runbook](../../../../deploy/runbooks/research-p19-lineage-dark-and-rollback.md). Rollback disables the reader only; it never deletes attempts, exposure facts, promotion facts or supporting indexes.

## Evidence actually run

| Check | Result |
| --- | --- |
| Control API production-source compile | `npm --prefix apps/control-api run build` — pass |
| P19 service/controller/contract focused units | pass; retry separation, failed/abandoned retention, material diff, cross-Alpha/cycle rejection, bounded graph/child lists, no heuristic promotion and dark gates |
| P19 disposable PostgreSQL migration/repository proof | pass; UUID-named disposable database validates migration, runtime `SELECT`/no `INSERT`, immutable same-version picks, cross-workspace rejection, retry separation and child sentinel bound; teardown drops it |
| Generated contract | `npm --prefix packages/contracts run generate:research-attempt-lineage` — pass |
| Contract snapshot and guard | snapshot write + `--check`, then focused contract suite — pass |
| Capability ledger | exact P19 GET declared as `AUTO_READ` / `TYPED_FRONTEND_PORT`; route count 173 |

Focused backend evidence is not a substitute for Claude's rich Screen-10 browser/HiFi receipt. No frontend file was modified by this P19 backend slice.
