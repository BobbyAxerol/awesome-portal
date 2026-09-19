# P04 phase report — QuantBT 1.1.1 adapter and resource baseline

Status: `BACKEND_COMPLETE_FE_HANDOFF_PENDING — 2026-09-19`.

P04 upgrades the **Research-only** executable pin from QuantBT 1.0.8 to the
published 1.1.1 release with its published native dependency. It does not
change Execution Loop, Trading System, broker, CLI, runtime containers,
deployment inputs or frontend code.

## Delivered

- A source-controlled Research Engine Catalog with one current 1.1.1 release,
  a retained 1.0.8 historical identity, exact installed provenance checks and
  an allowlisted map of all fourteen published constructors.
- An Atlas read DTO at `/api/v1/research/quantbt/atlas`. It is descriptive,
  read-only and intentionally contains neither hashes, paths nor dispatch
  handles.
- Four independent capability axes. Twelve engine-visible constructors remain
  explicitly not admitted because their typed Portal input/evidence contract
  does not exist; P04 does not turn their public wheel presence into a run
  path.
- A declared `research-run-evidence.v1` envelope, with exact strings for
  financial summary fields. P05, not P04, owns its durable writer and
  retention.
- Canonical optimizer field names and serial execution only. Persistent study
  storage/logging are refused before compute until a lifecycle/retention phase
  admits them.
- A compatibility adapter for QuantBT 1.1.1 fold metadata: established
  `wfo/folds.parquet` remains exactly v1 while additive fields are retained in
  `wfo/folds_extension.v1.parquet`.

## Actual evidence

The protected Delta kernel stayed byte-identical. Direct public QuantBT and
Portal adapter outputs match on both the 500-bar deterministic fixture and a
read-only approved historical BTCUSDT window. The latter is historical
research data only, not a Paper/Live outcome or alpha promotion.

Cold/warm measurements were recorded at minimal, score and audit report
levels. They are aggregate local process-RSS measurements; no private native
buffer attribution or production capacity claim is made.

See [contract-results.json](./contract-results.json),
[delta-real-data.json](./delta-real-data.json), and
[resource-results.json](./resource-results.json).

## Verification

P04 catalog/adapter/compatibility gates, real-HMD opt-in parity, broad backend
regression, post-export contract/freeze regression and the default forkserver
API worker suite all pass. The local restricted sandbox cannot create a
forkserver control socket; that was verified as environmental `EPERM`, then
the unchanged default worker suite was rerun outside that boundary and passed.
No fallback to unsafe `fork` was introduced.

## Handoff and next boundary

Claude receives the narrow Atlas handoff at
[frontend-handoff-claude.md](./frontend-handoff-claude.md). Claude owns visual
composition and browser acceptance; P09 owns the screen route. P05 owns
durable artifact bytes/retention, P06 the scheduler/isolated worker, and P10
the named submit BFF. These are deliberate downstream phases, not P04 debt.

Rollback is source/release-pointer only; see [rollback.md](./rollback.md).
