# B3 CG-FG-S08-03 — P04 Replay execution counts

Status: backend accepted at `b4965e34` (rebased from `0db92ca2`); exact-head isolated preview read passed.

`ResearchReplayResponse.execution.counts` is additive and emitted only on the current P04 adapter lane. `bars` is the retained P13 OOS candle source-bar count with `scope=OOS_EQUITY_WINDOW`. `trades_reported` is the available P13 `TRADE_COUNT` metric and carries its original `CHILD_TAPE` or `IS_PLUS_OOS` scope. It is **not** an audited trade-record count. Order, fill, trade-record and transition ledgers retain typed `NOT_PUBLISHED` route gaps; no zero or invented rows are emitted. Imported/historical lanes do not gain P04 facts.

Example from the focused P04 source fixture: `bars.value=48`, `trades_reported={value:"7",scope:"CHILD_TAPE"}`, `orders_published.state=NOT_PUBLISHED`, `trades_published.state=NOT_PUBLISHED`. This is a test fixture, **not** a production run receipt.

Verification: Control API full hook 1401 pass/1 skip; generated contracts 204/204; Python progress tests 45/45. Isolated preview image `sha256:b12fd4b213f4aa6d4e640e8dae275ab3a23d312c80b880698a7a7b97771af786` healthy. Authenticated GET `/api/v1/quantbt/runs/rrun_464bf9c3dd8979af87e44388ea6910ef/execute/replay?limit=1` returned HTTP 200: 744 OOS bars, 45 `CHILD_TAPE` trades reported, and typed `NOT_PUBLISHED` for order/fill/trade/event ledgers. This is a real P04 run; no source business rows were copied into the receipt.
Claude may bind S08 existing cells to `execution.counts` without equating source-reported trades with audited trade records or changing the visual composition.

No frontend, production runtime, source, migration, or mutable sealed receipt changed.
