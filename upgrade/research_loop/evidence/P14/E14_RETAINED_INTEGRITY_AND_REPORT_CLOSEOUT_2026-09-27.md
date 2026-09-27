# E14 — Retained integrity and report closeout

Date: 2026-09-27  
Scope: backend/contracts only; no frontend, runtime, deployment or source-system mutation.

## Superseded before merge

This draft was superseded during the 2026-09-27 origin reconciliation by the
preview-receipted E14 contract. Its second `summary.integrity` producer and its
OOS-only relabelling of the retained final-account return were removed before
the reconciliation merge was committed.

The canonical implementation publishes:

- QuantBT boundary events as `ResearchCurrentSourceSplitResponse.gap_scan`;
- a Portal digest of the retained fold-segment plan as
  `ResearchCurrentSourceSplitResponse.stitch`, with an explicit basis and
  bounded fold-plan check;
- `NET_RETURN` and drawdown with scope `IS_PLUS_OOS`, because the retained
  final account begins before the first outer-OOS window.

Legacy seals remain typed absent. No seal was rewritten and no source/runtime
system was changed. The accepted implementation, tests and frontend receipt
are recorded in `P18/E14_S05_S09_FIELDS_CLAUDE_2026-09-26.md` and the E14 row
of the Unified Plan. Consumers must not recompute gaps, hashes or financial
scope.
