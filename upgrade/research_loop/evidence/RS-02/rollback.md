# RS-02 rollback

RS-02 is additive and feature-dark. The safe rollback is to keep
`FEATURE_RESEARCH_CURRENT_SOURCE=false` or deploy a signed reader selection
that does not route a client to the RS-02 operations.

Do **not** delete/update current-source import batches, rows or seals; alter
their immutable triggers; rewrite source identities/digests; drop the new
relations; rerun QuantBT to replace a historical retained result; or touch
Execution/Trading System/source infrastructure as a rollback shortcut. Old
fixed-run readers remain intact and are the compatibility path.
