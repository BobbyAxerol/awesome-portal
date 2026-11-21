# RS-03 rollback

RS-03 adds no runtime behavior. Its safe rollback is to omit the acceptance
test/evidence from an unmerged development branch or keep
`FEATURE_RESEARCH_CURRENT_SOURCE=false`.

Do not delete, update or recreate retained import batches, rows or seals;
weaken immutable triggers; replay/recompute QuantBT as a GET workaround; or
touch Execution, Trading System, source infrastructure, credentials or
runtime services. RS-03 is evidence for the existing RS-02 reader, not an
activation authorization.
