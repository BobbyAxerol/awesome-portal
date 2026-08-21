# CLI → underlying access path

Portal may only use the HTTP column. `POSTGRES_DIRECT` / `REDIS_DIRECT` rows have no
API equivalent and are therefore capability gaps for the Portal.

| Command | Action | Tier (proposed) | Access | HTTP paths | Portal reachable |
|---|---|---|---|---|---|
| `account` | `state` | R0_READ | HTTP | `/v1/admin/accounts/paper/seed`, `/v1/admin/accounts/{args.account_id}/policy`, `/v1/admin/accounts/{args.account_id}/reconcile-open-orders` | YES |
| `account` | `policy` | R0_READ | HTTP | `/v1/admin/accounts/paper/seed`, `/v1/admin/accounts/{args.account_id}/policy`, `/v1/admin/accounts/{args.account_id}/reconcile-open-orders` | YES |
| `account` | `seed-paper` | R1_PAPER_MUTATION | HTTP | `/v1/admin/accounts/paper/seed`, `/v1/admin/accounts/{args.account_id}/policy`, `/v1/admin/accounts/{args.account_id}/reconcile-open-orders` | YES |
| `account` | `sync` | R2_SANDBOX | HTTP | `/v1/admin/accounts/paper/seed`, `/v1/admin/accounts/{args.account_id}/policy`, `/v1/admin/accounts/{args.account_id}/reconcile-open-orders` | YES |
| `account` | `reconcile-positions` | R2_SANDBOX | HTTP | `/v1/admin/accounts/paper/seed`, `/v1/admin/accounts/{args.account_id}/policy`, `/v1/admin/accounts/{args.account_id}/reconcile-open-orders` | YES |
| `account` | `reconcile-open-orders` | R2_SANDBOX | HTTP | `/v1/admin/accounts/paper/seed`, `/v1/admin/accounts/{args.account_id}/policy`, `/v1/admin/accounts/{args.account_id}/reconcile-open-orders` | YES |
| `allocation` | `<root>` | UNCLASSIFIED | HTTP | `/v1/admin/portfolio-allocations` | YES |
| `alpha` | `inspect` | R0_READ | HTTP | `/v1/admin/alphas/register`, `/v1/admin/alphas/{args.alpha_id}` | YES |
| `alpha` | `register` | R1_PAPER_MUTATION | HTTP | `/v1/admin/alphas/register`, `/v1/admin/alphas/{args.alpha_id}` | YES |
| `authority` | `list` | R0_READ | POSTGRES_DIRECT | — | NO — no HTTP equivalent |
| `authority` | `create` | R1_PAPER_MUTATION | POSTGRES_DIRECT | — | NO — no HTTP equivalent |
| `bracket-audit` | `<root>` | R0_READ | HTTP | `/v1/admin/order-brackets/lifecycle-audit` | YES |
| `broker` | `bindings` | R0_READ | HTTP | `/v1/admin/broker-bindings`, `/v1/admin/broker-bindings/{args.external_account_ref}/exposure`, `/v1/admin/broker-bindings/{args.external_account_ref}/reconcile-open-orders` | YES |
| `broker` | `state` | R0_READ | HTTP | `/v1/admin/broker-bindings`, `/v1/admin/broker-bindings/{args.external_account_ref}/exposure`, `/v1/admin/broker-bindings/{args.external_account_ref}/reconcile-open-orders` | YES |
| `broker` | `exposure` | R0_READ | HTTP | `/v1/admin/broker-bindings`, `/v1/admin/broker-bindings/{args.external_account_ref}/exposure`, `/v1/admin/broker-bindings/{args.external_account_ref}/reconcile-open-orders` | YES |
| `broker` | `reconcile-positions` | R2_SANDBOX | HTTP | `/v1/admin/broker-bindings`, `/v1/admin/broker-bindings/{args.external_account_ref}/exposure`, `/v1/admin/broker-bindings/{args.external_account_ref}/reconcile-open-orders` | YES |
| `broker` | `reconcile-open-orders` | R2_SANDBOX | HTTP | `/v1/admin/broker-bindings`, `/v1/admin/broker-bindings/{args.external_account_ref}/exposure`, `/v1/admin/broker-bindings/{args.external_account_ref}/reconcile-open-orders` | YES |
| `capital` | `history` | R0_READ | HTTP | `/v1/admin/portfolio-capital/history` | YES |
| `config` | `plan` | R0_READ | HTTP | `/v1/admin/accounts/{account_id}/policy`, `/v1/admin/alphas/register`, `/v1/admin/alphas/{alpha_id}/risk` | YES |
| `config` | `apply` | R1_PAPER_MUTATION | HTTP | `/v1/admin/accounts/{account_id}/policy`, `/v1/admin/alphas/register`, `/v1/admin/alphas/{alpha_id}/risk` | YES |
| `copy` | `policies` | R0_READ | HTTP | `/v1/admin/copy/policies`, `/v1/admin/copy/policies/{args.strategy_id}` | YES |
| `copy` | `policy` | UNCLASSIFIED | HTTP | `/v1/admin/copy/policies`, `/v1/admin/copy/policies/{args.strategy_id}` | YES |
| `deployment` | `state` | R0_READ | HTTP | `/v1/admin/deployments/{args.deployment_id}/state` | YES |
| `health` | `<root>` | R0_READ | HTTP | `/v1/health` | YES |
| `ops` | `trace-order` | R0_READ | HTTP, POSTGRES_DIRECT, REDIS_DIRECT | `/v1/admin/ops/emergency-close`, `/v1/admin/ops/emergency-close/plan?{`, `/v1/admin/ops/emergency-close/{args.operation_id}/verify` | PARTIAL — mixed access |
| `ops` | `dead-letters` | R0_READ | HTTP, POSTGRES_DIRECT, REDIS_DIRECT | `/v1/admin/ops/emergency-close`, `/v1/admin/ops/emergency-close/plan?{`, `/v1/admin/ops/emergency-close/{args.operation_id}/verify` | PARTIAL — mixed access |
| `ops` | `findings` | R0_READ | HTTP, POSTGRES_DIRECT, REDIS_DIRECT | `/v1/admin/ops/emergency-close`, `/v1/admin/ops/emergency-close/plan?{`, `/v1/admin/ops/emergency-close/{args.operation_id}/verify` | PARTIAL — mixed access |
| `ops` | `streams` | R0_READ | HTTP, POSTGRES_DIRECT, REDIS_DIRECT | `/v1/admin/ops/emergency-close`, `/v1/admin/ops/emergency-close/plan?{`, `/v1/admin/ops/emergency-close/{args.operation_id}/verify` | PARTIAL — mixed access |
| `ops` | `command-journal` | R0_READ | HTTP, POSTGRES_DIRECT, REDIS_DIRECT | `/v1/admin/ops/emergency-close`, `/v1/admin/ops/emergency-close/plan?{`, `/v1/admin/ops/emergency-close/{args.operation_id}/verify` | PARTIAL — mixed access |
| `ops` | `redis-retention` | R0_READ | HTTP, POSTGRES_DIRECT, REDIS_DIRECT | `/v1/admin/ops/emergency-close`, `/v1/admin/ops/emergency-close/plan?{`, `/v1/admin/ops/emergency-close/{args.operation_id}/verify` | PARTIAL — mixed access |
| `ops` | `alerts` | R0_READ | HTTP, POSTGRES_DIRECT, REDIS_DIRECT | `/v1/admin/ops/emergency-close`, `/v1/admin/ops/emergency-close/plan?{`, `/v1/admin/ops/emergency-close/{args.operation_id}/verify` | PARTIAL — mixed access |
| `ops` | `alpha-activity` | R0_READ | HTTP, POSTGRES_DIRECT, REDIS_DIRECT | `/v1/admin/ops/emergency-close`, `/v1/admin/ops/emergency-close/plan?{`, `/v1/admin/ops/emergency-close/{args.operation_id}/verify` | PARTIAL — mixed access |
| `ops` | `emergency-close` | R3_LIVE_PROTECTIVE | HTTP, POSTGRES_DIRECT, REDIS_DIRECT | `/v1/admin/ops/emergency-close`, `/v1/admin/ops/emergency-close/plan?{`, `/v1/admin/ops/emergency-close/{args.operation_id}/verify` | PARTIAL — mixed access |
| `ops` | `emergency-close-verify` | R3_LIVE_PROTECTIVE | HTTP, POSTGRES_DIRECT, REDIS_DIRECT | `/v1/admin/ops/emergency-close`, `/v1/admin/ops/emergency-close/plan?{`, `/v1/admin/ops/emergency-close/{args.operation_id}/verify` | PARTIAL — mixed access |
| `order-group` | `list` | R0_READ | HTTP | `/v1/admin/order-groups`, `/v1/admin/order-groups/{args.group_id}`, `/v1/admin/order-groups/{args.group_id}/{args.action}` | YES |
| `order-group` | `show` | R0_READ | HTTP | `/v1/admin/order-groups`, `/v1/admin/order-groups/{args.group_id}`, `/v1/admin/order-groups/{args.group_id}/{args.action}` | YES |
| `performance` | `account` | R0_READ | HTTP | `/v1/admin/performance/accounts/latest`, `/v1/admin/performance/accounts/{args.account_id}/history?limit={args.limit}`, `/v1/admin/performance/dashboard` | YES |
| `performance` | `account-history` | R0_READ | HTTP | `/v1/admin/performance/accounts/latest`, `/v1/admin/performance/accounts/{args.account_id}/history?limit={args.limit}`, `/v1/admin/performance/dashboard` | YES |
| `performance` | `instrument` | R0_READ | HTTP | `/v1/admin/performance/accounts/latest`, `/v1/admin/performance/accounts/{args.account_id}/history?limit={args.limit}`, `/v1/admin/performance/dashboard` | YES |
| `performance` | `portfolio` | R0_READ | HTTP | `/v1/admin/performance/accounts/latest`, `/v1/admin/performance/accounts/{args.account_id}/history?limit={args.limit}`, `/v1/admin/performance/dashboard` | YES |
| `performance` | `portfolio-history` | R0_READ | HTTP | `/v1/admin/performance/accounts/latest`, `/v1/admin/performance/accounts/{args.account_id}/history?limit={args.limit}`, `/v1/admin/performance/dashboard` | YES |
| `performance` | `dashboard` | R0_READ | HTTP | `/v1/admin/performance/accounts/latest`, `/v1/admin/performance/accounts/{args.account_id}/history?limit={args.limit}`, `/v1/admin/performance/dashboard` | YES |
| `portfolio` | `create` | R1_PAPER_MUTATION | HTTP | `/v1/admin/portfolios`, `/v1/admin/portfolios/{args.portfolio_id}/state` | YES |
| `portfolio` | `state` | R0_READ | HTTP | `/v1/admin/portfolios`, `/v1/admin/portfolios/{args.portfolio_id}/state` | YES |
| `portfolio` | `list` | R0_READ | HTTP | `/v1/admin/portfolios`, `/v1/admin/portfolios/{args.portfolio_id}/state` | YES |
| `redis` | `get` | R0_READ | REDIS_DIRECT | — | NO — no HTTP equivalent |
| `redis` | `scan` | R0_READ | REDIS_DIRECT | — | NO — no HTTP equivalent |
| `redis` | `alpha-auth` | R0_READ | REDIS_DIRECT | — | NO — no HTTP equivalent |
| `redis` | `trading-state` | R0_READ | REDIS_DIRECT | — | NO — no HTTP equivalent |
| `redis` | `stream` | UNCLASSIFIED | REDIS_DIRECT | — | NO — no HTTP equivalent |
| `replay` | `events` | R0_READ | HTTP | `/v1/admin/events`, `/v1/admin/replay/compare`, `/v1/admin/replay/export` | YES |
| `replay` | `lifecycle` | R0_READ | HTTP | `/v1/admin/events`, `/v1/admin/replay/compare`, `/v1/admin/replay/export` | YES |
| `replay` | `compare` | R0_READ | HTTP | `/v1/admin/events`, `/v1/admin/replay/compare`, `/v1/admin/replay/export` | YES |
| `replay` | `jobs` | R0_READ | HTTP | `/v1/admin/events`, `/v1/admin/replay/compare`, `/v1/admin/replay/export` | YES |
| `replay` | `show` | R0_READ | HTTP | `/v1/admin/events`, `/v1/admin/replay/compare`, `/v1/admin/replay/export` | YES |
| `replay` | `run` | R1_PAPER_MUTATION | HTTP | `/v1/admin/events`, `/v1/admin/replay/compare`, `/v1/admin/replay/export` | YES |
| `replay` | `create` | R1_PAPER_MUTATION | HTTP | `/v1/admin/events`, `/v1/admin/replay/compare`, `/v1/admin/replay/export` | YES |
| `replay` | `quantbt-diff` | R0_READ | HTTP | `/v1/admin/events`, `/v1/admin/replay/compare`, `/v1/admin/replay/export` | YES |
| `replay` | `export` | R0_READ | HTTP | `/v1/admin/events`, `/v1/admin/replay/compare`, `/v1/admin/replay/export` | YES |
| `risk` | `state` | R0_READ | HTTP | `/v1/admin/alphas/{args.alpha_id}/risk`, `/v1/admin/trading-state` | YES |
| `risk` | `profile` | R0_READ | HTTP | `/v1/admin/alphas/{args.alpha_id}/risk`, `/v1/admin/trading-state` | YES |
| `sizing` | `history` | R0_READ | HTTP | `/v1/admin/sizing/decisions`, `/v1/admin/sizing/decisions/summary`, `/v1/admin/sizing/decisions/{args.decision_id}` | YES |
| `sizing` | `summary` | R0_READ | HTTP | `/v1/admin/sizing/decisions`, `/v1/admin/sizing/decisions/summary`, `/v1/admin/sizing/decisions/{args.decision_id}` | YES |
| `sizing` | `decision` | R0_READ | HTTP | `/v1/admin/sizing/decisions`, `/v1/admin/sizing/decisions/summary`, `/v1/admin/sizing/decisions/{args.decision_id}` | YES |
