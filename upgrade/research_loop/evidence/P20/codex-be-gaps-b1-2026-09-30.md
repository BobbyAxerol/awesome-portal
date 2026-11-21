# B1 P20 backend receipt

- AN-22 / CMP-V3-01: Compare P04 OOS Sharpe comes only from P13 `oos_analytics.metrics.sharpe` with AVAILABLE state and the canonical `full_report.sharpe` source locator. Example: `{key:"OOS_SHARPE",scope:"OOS",value:"0.744",availability:{state:"AVAILABLE",reason_code:null}}`; wrong locator remains typed NOT_PUBLISHED.
- CG-FG-S13-02: Compare grade comes only from persisted progress `claim.methodology_certificate` with `state:"ISSUED"`; no source certificate remains NOT_PUBLISHED. Example: `{state:"AVAILABLE",grade:"B",reason_code:null,availability:{state:"AVAILABLE",reason_code:null}}`.
- `ResearchCompareRun.certification` OpenAPI/Zod/generated type is additive AVAILABLE/NOT_PUBLISHED. Compare focused 13/13 and Control API build passed.

Claude should consume issued grade and exact OOS Sharpe without changing screen layout. No frontend or production runtime changed.
