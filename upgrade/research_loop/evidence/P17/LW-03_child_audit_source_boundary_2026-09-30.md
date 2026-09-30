# LW-03 — missing child-audit OOS generation is source-side

R-WFO-020's retained lifecycle contract reports 2,212 records dropped before
the Portal adapter reads `strategy_lifecycle.v1.parquet`; only 2,000 rows are
present. In `current_source_artifacts.py::_attach_child_audit`, Portal assigns
an ordinal to each row *present in that frame* and merely groups them by fold.
It neither truncates the source frame to 2,000 nor reconstructs omitted
strategy instances. The per-fold Portal display cap is applied after grouping,
and cannot recover an OOS-generation record that QuantBT did not publish.

The existing missing-record status remains typed
`QUANTBT_CHILD_AUDIT_HAS_NO_OUT_OF_SAMPLE_GENERATION_RECORD`. No synthesized
audit event, altered ordinal, or false seal is allowed. The engine owner must
retain at least one OOS-generation record per fold (or publish a separate
attested fold summary) within a bounded source contract. This is an exact
source gap, not a blocker for current-source Search, Report, or unrelated
Portal screens.

Read-only source locators:
`apps/portal/backend/src/portal_api/services/advanced_walkforward_runner.py`
exports `strategy_lifecycle_records_dropped`;
`apps/portal/backend/src/portal_api/services/current_source_artifacts.py`
reads the already-capped lifecycle table and reports
`records_dropped_by_source`. No engine/source file was modified.
