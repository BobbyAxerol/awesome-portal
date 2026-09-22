# P17 current-source replay capability matrix

| Screen 08 / generic replay need | Current P04/P13 fact | P17-A outcome | Minimum future source receipt |
|---|---|---|---|
| OOS equity playhead | immutable P13 `EQUITY_OOS` UTC-ms/exact-decimal samples; sampling declared | bounded chronological sample window and direct playhead cursor | none for P17-A |
| account/position state at playhead | no account/position snapshot | `RETROSPECTIVE_EQUITY_NOT_EXECUTION_STATE`; execution state `NOT_PUBLISHED` | revisioned position/account snapshots keyed by original source event/checkpoint |
| orders/fills/trades | no execution ledger or IDs | each panel `NOT_PUBLISHED`, no decorative rows | bounded order/fill/trade records with original IDs, route/fold scope, exact quantities/prices/fees and retention rules |
| event order / same timestamp | only P11 worker lifecycle sequence; not execution order | `NOT_ASSERTED`, no causal chain or synthetic gap | source event stream identity, sequence scope, tie-break order, retention floor and cursor semantics |
| OCO / partial fill / multi-leg | no relationship or unit facts | `NOT_PUBLISHED` | original parent/child/leg IDs, state transitions, units and reconciliation rules |
| candles / SL-TP ambiguity / MAE-MFE | no candle or intrabar input | `NOT_PUBLISHED` | bounded candle/trade windows plus intrabar convention and MAE/MFE formula/input version |
| funding / capital / fold reset | no funding or fold-capital convention | `NOT_PUBLISHED`; never compound equity | funding rows and explicit per-fold capital/reset convention |
| child audit/reused original | no replay provenance relationship | `NOT_PUBLISHED` | immutable original/child IDs plus replay source/reuse semantics |
| certificate badge | P13 claim only; no Screen-08 execution certificate | no replay certificate generated | explicit versioned certificate/evidence fact |

No row authorizes direct P04/QuantBT worker, database, Parquet, artifact,
market-data or browser fixture access. A source receipt must be versioned and
integrated through a separate reader/projection contract before a richer panel
can become available.
