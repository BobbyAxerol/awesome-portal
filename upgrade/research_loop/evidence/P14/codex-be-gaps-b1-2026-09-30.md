# B1 P14 backend receipt

- CG-FG-S05-01: current-source Split now returns `guards.train_test_disjoint` from retained half-open UTC fold windows and published purge/embargo conventions. Positive intersection produces FAIL even if guard metadata is absent; a complete disjoint plan with both guards produces PASS; missing windows/guards produce NOT_CHECKABLE, never an invented green tick.
- Canonical PASS/FAIL inputs: `packages/contracts/fixtures/research-current-source.disjoint-verdicts.valid.json`. Example: `{verdict:"FAIL",basis:"RETAINED_FOLD_UTC_WINDOWS_AND_PUBLISHED_TEMPORAL_GUARDS_V1",reason_code:"S05_TRAIN_TEST_WINDOWS_OVERLAP"}`.
- `ResearchCurrentSourceSplit.guards.train_test_disjoint?` is additive in OpenAPI/Zod/generated type. Focused helper 4/4, full Split service test 5/5, Control API build passed. Claude should replace the S05 FE-inferred tick with this field.

No frontend or production runtime changed.
