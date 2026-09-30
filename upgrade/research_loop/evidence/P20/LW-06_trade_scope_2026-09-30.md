# LW-06 — Trade counts have different authorities

Read-only isolated-preview GET for R-WFO-020 at Control API image
`sha256:6899d21a9f6474ab6da1c78fea887cee24118c7f7bdb8775c54076e727da6cf3`
(source commit `4df0074f`) returned Library `trade_count=19`,
`scope=OOS`, `definition_id=research.current-source.v1.sum-of-published-fold-oos-trade-counts`.
The underlying retained fact is the sum of QuantBT's nine per-fold
`oos_trade_count` fields, published only when all folds have counts
(`run-library.service.ts`, `retainedCardFacts`). Compare uses the same
fold count with explicit `scope=RS02_OOS_SUM_OF_FOLDS` and
`definition_id=research.compare.metric.v1.rs02-oos-trade-count`.

Replay separately says **zero audited trade-record rows** and six settled
target transitions. Those are not the same unit: a target transition is
`TARGET_TRANSITION_SETTLED_AT_CLOSE_NOT_A_FILL`, not a broker fill or
trade record. Portal must not equate 19 fold-level engine trade counts,
zero audited records and six transitions or infer a missing ledger.

Backend correction: the retained Library metric label is now **OOS fold
trades** (value, scope and definition unchanged). The legacy full-child
`trades` label is not altered. Claude's S13/S08 binding should show the
definition/scope already in the DTO and use separate captions; no new
QuantBT fact or frontend design change is requested here.
