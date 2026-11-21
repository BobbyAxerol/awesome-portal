# LW-03 — bounded future-run lifecycle custody (2026-10-01)

QuantBT 1.1.1's public `WalkForwardConfig.metadata["lifecycle_ledger_max_rows"]`
controls its default 2,000-record cap. Portal's admitted WFO runner now sets a
20,000-record cap, bounded above the current 400-trial × 16-fold profile. The
P05 exporter reserves any source-published `out-of-sample generation` child
in each fold's 64-record display sample, then fills remaining slots in source
order. Original `audit_ordinal`, source count, truncation and
`records_dropped_by_source` remain truthful.

This does **not** recover R-WFO-020's 2,212 records already dropped by the
source. That run remains typed `QUANTBT_CHILD_AUDIT_HAS_NO_OUT_OF_SAMPLE_GENERATION_RECORD`.
No old seal or artifact was changed. A fresh long WFO is still required to
prove `records_dropped_by_source=0` and one generation child per fold on a
real admitted candidate; this is code-ready, not a product receipt.

Focused test: pinned QuantBT 1.1.1 accepts the metadata cap; an 81-record
synthetic fold keeps ordinal 80 as its OOS child while retaining 64 bounded
records; the existing real 3-trial W5b replay regression passes. The latter
had a pre-existing test-only byte-budget mismatch: it measured pretty JSON
instead of the compact JSON actually sealed; the assertion now matches the
writer's 65,536-byte transport check. No source package, UI or runtime flag
was changed.
