# Portfolio Management CLI Guide

This guide is for operating portfolio, account, and risk config through the `trading_system` CLI.

The server is Docker-first, so the recommended way is to run the CLI inside the `trading_system` compose network. Do not depend on host Python.

## 1. Run The CLI

From `/root/bobby/trading_system`:

```bash
docker compose --profile cli run --rm --no-deps cli health
```

The CLI container joins `executor_network` and calls:

```text
http://gateway_service:8000
```

Use `--no-deps` intentionally. Without it, Docker Compose may inspect, start, or recreate services declared as dependencies. The CLI service itself has no `depends_on`, and `--no-deps` makes the command create only the temporary CLI container. If `gateway_service` is not already running, the command should fail instead of touching other containers.

Host Python can work only if dependencies, `.env`, and network access are available. On this server, use Docker.

## 2. Output Modes

Default output is compact tables:

```bash
docker compose --profile cli run --rm --no-deps cli portfolio list
docker compose --profile cli run --rm --no-deps cli account state paper-binance-alpha_smoke
```

Use raw JSON when scripting:

```bash
docker compose --profile cli run --rm --no-deps cli --json account state paper-binance-alpha_smoke
```

## 3. Password Confirmation For Changes

Read-only commands do not ask for password.

Any command that changes config prints the exact HTTP method, path, and payload, then asks for the admin password:

```text
Pending admin change
METHOD: POST
PATH:   /v1/admin/portfolios
PAYLOAD:
...
Confirm admin password:
```

This protects:

- alpha registration
- portfolio create/state changes
- allocation changes
- account seed/policy changes
- risk profile/trading-state changes

For automation only, the container can use `TRADING_CLI_CONFIRM_PASSWORD`, but interactive password entry is preferred.

## 4. Health

```bash
docker compose --profile cli run --rm --no-deps cli health
```

Expected:

- `status: READY`
- no stale services
- `gateway`, `risk_engine`, `paper_execution`, `portfolio`, `performance`, `reconciliation` fresh

## 5. Alpha Registration

Simple paper alpha:

```bash
docker compose --profile cli run --rm --no-deps cli alpha register alpha_smoke \
  --allowed-modes paper \
  --allowed-venues BINANCE \
  --base-currency USDT \
  --initial-balance 100000 \
  --api-key alpha-smoke-api-key
```

Multi-venue paper alpha with explicit balances and policies:

```bash
docker compose --profile cli run --rm --no-deps cli alpha register alpha_smoke \
  --allowed-modes paper,sandbox \
  --allowed-venues BINANCE,DNSE \
  --base-currency USDT \
  --account-balances-json '{"paper:BINANCE":{"currency":"USDT","initial_balance":"100000"},"paper:DNSE":{"currency":"VND","initial_balance":"1000000000"}}' \
  --account-policies-json '{"paper:BINANCE":{"account_type":"MARGIN","margin_mode":"CROSS","default_leverage":"3"},"paper:DNSE":{"account_type":"CASH","margin_mode":"NONE","settlement_policy":"IMMEDIATE"}}' \
  --risk-json '{"max_notional_order":10000000,"max_notional_position":100000000,"max_order_per_minute":60}' \
  --api-key alpha-smoke-api-key
```

Inspect alpha:

```bash
docker compose --profile cli run --rm --no-deps cli alpha inspect alpha_smoke
```

## 6. Portfolio

Create portfolio:

```bash
docker compose --profile cli run --rm --no-deps cli portfolio create alpha_lab_main \
  --name "Alpha Lab Main" \
  --base-currency USDT \
  --state ACTIVE \
  --reason "initial setup"
```

List portfolios:

```bash
docker compose --profile cli run --rm --no-deps cli portfolio list
```

Halt a portfolio:

```bash
docker compose --profile cli run --rm --no-deps cli portfolio state alpha_lab_main HALTED \
  --reason "operator emergency stop"
```

Set reducing-only:

```bash
docker compose --profile cli run --rm --no-deps cli portfolio state alpha_lab_main REDUCING \
  --reason "close-only mode"
```

Resume:

```bash
docker compose --profile cli run --rm --no-deps cli portfolio state alpha_lab_main ACTIVE \
  --reason "resume after check"
```

### Deployment State

Use deployment state when one alpha-mode-venue instance must stop without affecting the rest of
its portfolio. This is the preferred command for an isolated alpha observation window:

```bash
docker compose --profile cli run --rm --no-deps cli deployment state \
  alpha_smoke:sandbox:BINANCE:sandbox-binance-alpha_smoke HALTED \
  --reason "sandbox observation window complete"
```

Resume that deployment only:

```bash
docker compose --profile cli run --rm --no-deps cli deployment state \
  alpha_smoke:sandbox:BINANCE:sandbox-binance-alpha_smoke ACTIVE \
  --reason "resume isolated sandbox deployment"
```

`HALTED` deployment state blocks new orders through risk and excludes the deployment from
scheduled broker synchronization. It does not halt sibling alpha deployments.

## 7. Allocation

Attach an account/deployment to a portfolio:

```bash
docker compose --profile cli run --rm --no-deps cli allocation alpha_lab_main paper-binance-alpha_smoke \
  --strategy-id alpha_smoke \
  --mode paper \
  --venue BINANCE \
  --currency USDT \
  --allocated-capital 100000 \
  --max-capital 150000 \
  --state ACTIVE \
  --movement-type INITIAL_ALLOCATE \
  --reason "paper allocation"
```

Changing `allocated_capital` later writes a row into `portfolio_capital_ledger`.
Use `--movement-type ALLOCATE`, `WITHDRAW`, or `REBALANCE` when you want the ledger label to be explicit.

View capital movement history:

```bash
docker compose --profile cli run --rm --no-deps cli capital history \
  --portfolio-id alpha_lab_main \
  --account-id paper-binance-alpha_smoke \
  --limit 50
```

Risk engine now reads allocation/deployment/portfolio state:

- `HALTED`: blocks new orders.
- `REDUCING`: allows cancel/close/reduce only.
- `ACTIVE`: normal risk profile applies.

## 8. Account Policy

Binance-style paper margin:

```bash
docker compose --profile cli run --rm --no-deps cli account policy paper-binance-alpha_smoke \
  --mode paper \
  --venue BINANCE \
  --account-type MARGIN \
  --margin-mode CROSS \
  --default-leverage 3 \
  --taker-fee-bps 4 \
  --maintenance-margin-rate 0.005 \
  --reason "paper futures-like margin"
```

DNSE-style paper cash:

```bash
docker compose --profile cli run --rm --no-deps cli account policy paper-dnse-alpha_smoke \
  --mode paper \
  --venue DNSE \
  --account-type CASH \
  --margin-mode NONE \
  --settlement-policy IMMEDIATE \
  --reason "paper VN stock cash"
```

DNSE live/sandbox account policy with broker account reference:

```bash
docker compose --profile cli run --rm --no-deps cli account policy live-dnse-alpha_smoke \
  --mode live \
  --venue DNSE \
  --account-type CASH \
  --margin-mode NONE \
  --settlement-policy IMMEDIATE \
  --require-broker-sync \
  --external-account-ref "<DNSE_ACCOUNT_NO>" \
  --reason "dnse broker account"
```

Inspect account state:

```bash
docker compose --profile cli run --rm --no-deps cli account state paper-binance-alpha_smoke
```

The output shows:

- account
- policy
- balances
- margin balances
- open reservations
- latest broker sync snapshot

## 9. Broker Account Sync

Paper accounts sync from internal trading-system projections:

```bash
docker compose --profile cli run --rm --no-deps cli account sync paper-binance-alpha_smoke
```

Binance sandbox/live sync uses `python-binance` Futures account endpoints:

```bash
docker compose --profile cli run --rm --no-deps cli account sync sandbox-binance-alpha_smoke \
  --mode sandbox \
  --venue BINANCE
```

Required env:

- `BINANCE_TESTNET_KEYS` for `mode=sandbox`.
- `BINANCE_LIVE_KEYS` for `mode=live`.

DNSE sync uses the local DNSE OpenAPI SDK:

```bash
docker compose --profile cli run --rm --no-deps cli account sync live-dnse-alpha_smoke \
  --mode live \
  --venue DNSE \
  --account-no "<DNSE_ACCOUNT_NO>" \
  --market-type STOCK
```

Optional DNSE PPSE/buying-power probe:

```bash
docker compose --profile cli run --rm --no-deps cli account sync live-dnse-alpha_smoke \
  --mode live \
  --venue DNSE \
  --account-no "<DNSE_ACCOUNT_NO>" \
  --market-type STOCK \
  --symbol FPT \
  --price 100000 \
  --loan-package-id "<LOAN_PACKAGE_ID>"
```

DNSE sync calls:

- `get_balances`
- `get_positions`
- `get_orders`
- `get_loan_packages`
- `get_ppse` when `symbol`, `price`, and `loan_package_id` are provided

If credentials, account number, or dry-run mode prevent a broker-authoritative snapshot, sync writes an `ERROR` snapshot. That is intentional; do not treat it as pass.

## 10. Broker Reconciliation

For sandbox/live, broker state is authoritative. After service restart, Redis loss, listener gaps, DB re-apply, or any uncertain execution window, run both position and open-order reconciliation before enabling the alpha again.

Position dry-run with fresh broker sync:

```bash
docker compose --profile cli run --rm --no-deps cli account reconcile-positions sandbox-binance-alpha_smoke \
  --sync-first \
  --mode sandbox \
  --venue BINANCE \
  --reason "startup position check"
```

If local `positions_v2` differs from the broker snapshot, the command reports findings and marks the latest sync snapshot as `MISMATCH`. With `require_broker_sync=true`, risk rejects new sandbox/live orders while the latest sync is `MISMATCH`.

Apply broker-authoritative positions after reviewing findings:

```bash
docker compose --profile cli run --rm --no-deps cli account reconcile-positions sandbox-binance-alpha_smoke \
  --apply \
  --reason "apply broker authoritative position state"
```

Apply writes:

- `positions_v2` to match the latest broker snapshot.
- `reconciliation_findings` with `RESOLVED` rows.
- `portfolio_audit_log` with `APPLY_BROKER_POSITION_RECONCILIATION`.
- latest `account_sync_snapshots.status` back to `OK` when applied.

Open-order dry-run with fresh broker sync:

```bash
docker compose --profile cli run --rm --no-deps cli account reconcile-open-orders sandbox-binance-alpha_smoke \
  --sync-first \
  --mode sandbox \
  --venue BINANCE \
  --reason "startup open-order check"
```

If local open orders differ from the broker snapshot, the command reports findings and marks the latest sync snapshot as `MISMATCH`. Findings include:

- `BROKER_OPEN_ORDER_STALE_IN_DB`
- `BROKER_OPEN_ORDER_MISSING_IN_DB`
- `BROKER_OPEN_ORDER_STATE_MISMATCH`

Apply broker-authoritative open orders after reviewing findings:

```bash
docker compose --profile cli run --rm --no-deps cli account reconcile-open-orders sandbox-binance-alpha_smoke \
  --apply \
  --reason "apply broker authoritative open-order state"
```

Apply writes:

- stale local open orders to `RECONCILED_MISSING`.
- broker-authoritative open orders into the legacy order projection so alpha queries can see them.
- `reconciliation_findings` and `portfolio_audit_log`.
- latest sync back to `OK` only if no other reconciliation domain is still mismatched.

Scheduled reconciliation:

- `reconciliation` service runs broker position and open-order reconciliation for accounts with `require_broker_sync=true`.
- For sandbox/live accounts that use broker-authoritative risk, set `BROKER_POSITION_RECON_APPLY=true` and `BROKER_OPEN_ORDER_RECON_APPLY=true`.
- Detection-only mode is useful for audit drills, but it can leave risk stuck in `BROKER_SYNC_MISMATCH` because DB positions remain stale while the broker is already flat.
- Keep detection-only only when an operator will manually review and apply reconciliation before enabling alpha trading again.

Recommended restart recovery sequence:

1. Keep sandbox/live trading state `HALTED`.
2. Run `cli account sync`.
3. Run `cli account reconcile-positions --sync-first`.
4. Run `cli account reconcile-open-orders --sync-first`.
5. If mismatched, review and apply the relevant reconciliation command.
6. Inspect `cli account state`.
7. Only then move allocation/trading state back to `ACTIVE`.

## 11. Seed Paper Account

Seed/reset Binance paper account:

```bash
docker compose --profile cli run --rm --no-deps cli account seed-paper alpha_smoke \
  --account-id paper-binance-alpha_smoke \
  --venue BINANCE \
  --currency USDT \
  --amount 100000 \
  --account-type MARGIN
```

Seed/reset DNSE paper account:

```bash
docker compose --profile cli run --rm --no-deps cli account seed-paper alpha_smoke \
  --account-id paper-dnse-alpha_smoke \
  --venue DNSE \
  --currency VND \
  --amount 1000000000 \
  --account-type CASH
```

## 11. Risk

Set global trading state for mode/venue:

```bash
docker compose --profile cli run --rm --no-deps cli risk state HALTED --mode sandbox --venue BINANCE
docker compose --profile cli run --rm --no-deps cli risk state ACTIVE --mode paper --venue DNSE
```

Update alpha risk profile:

```bash
docker compose --profile cli run --rm --no-deps cli risk profile alpha_smoke \
  --mode paper \
  --venue BINANCE \
  --max-notional-order 1000 \
  --max-notional-position 5000 \
  --max-leverage 3 \
  --max-order-per-minute 60 \
  --max-daily-loss 500 \
  --max-drawdown 0.10 \
  --allowed-order-types MARKET,LIMIT,STOP_MARKET,TAKE_PROFIT_MARKET \
  --trading-state ACTIVE
```

Instrument-specific risk:

```bash
docker compose --profile cli run --rm --no-deps cli risk profile alpha_smoke \
  --mode paper \
  --venue DNSE \
  --instrument-id FPT.DNSE \
  --max-notional-order 20000000 \
  --max-notional-position 100000000 \
  --max-order-per-minute 30 \
  --trading-state ACTIVE
```

## 12. Current Risk Precedence

For a non-cancel order, risk checks in this order:

1. Strategy allowed mode/venue.
2. Market data exists.
3. Risk profile active.
4. Redis trading state: `system:trading_state:<mode>:<venue>`.
5. Account/deployment/allocation/portfolio state.
6. Broker sync freshness when account policy has `require_broker_sync=true`.
7. Rate limit.
8. Lot size, price deviation, notional/exposure.
9. Paper account cash/margin reservation.

Cancel orders bypass most checks so they can still reduce risk during halt.

## 13. Standard Account Model

Use this relationship model:

```text
Portfolio
  -> Allocation
    -> Account
      -> Alpha/Strategy deployment
      -> Mode: paper | sandbox | live
      -> Venue: BINANCE | DNSE | future brokers
      -> Account policy: cash/margin, settlement, leverage, broker sync
      -> Balances, margin balances, reservations, broker sync snapshots
```

Rules:

- One portfolio can contain many accounts.
- Internal `account_id` should be isolated per `alpha_id + mode + venue`.
- Do not let two alphas share the same internal `account_id`.
- If multiple internal accounts use the same physical broker account/key, store that relationship through `external_account_ref`.
- One alpha can run as separate accounts at the same time: `paper`, `sandbox`, and `live` are independent deployments.
- Paper accounts are virtual and funded by configured initial balances.
- Sandbox/live accounts must be broker-authoritative when `require_broker_sync=true`.
- Allocation controls how much of an account is allowed to be used inside a portfolio.
- Portfolio capital changes happen by changing allocation, never by direct alpha-to-alpha transfer.
- Every allocation amount change is recorded in `portfolio_capital_ledger`.
- Risk profile controls order limits for an alpha per mode/venue/symbol.
- Trading state and portfolio/allocation/account state are kill switches before normal risk checks.

Recommended account IDs:

```text
<mode>-<venue-lower>-<alpha_id>
paper-binance-rsibound
paper-dnse-rsibound
sandbox-binance-rsibound
live-dnse-rsibound
```

## 14. Declarative Portfolio Config

For a new alpha, prefer a YAML/JSON config file as the first source of truth. The CLI can read it and push the required setup through admin endpoints.

Plan:

```bash
docker compose --profile cli run --rm --no-deps cli config plan config/examples/portfolio_setup.example.yaml
```

Apply:

```bash
docker compose --profile cli run --rm --no-deps cli config apply config/examples/portfolio_setup.example.yaml \
  --reason "initial rsibound setup"
```

The apply command performs:

- create/update portfolios
- set Redis trading state through `/v1/admin/trading-state`
- sync manual symbol allowlist through `/v1/admin/symbols/sync`
- register alpha, gateway API key, strategies, accounts, balances, policies, base risk
- upsert account policies
- upsert portfolio allocations
- write portfolio capital ledger rows when allocated capital changes
- upsert risk profiles

The command prints the full plan and asks for the admin password once before applying.

Sensitive API keys should be loaded from env:

```yaml
alphas:
  - alpha_id: rsibound_ts_sample
    api_key_env: RSIBOUND_TS_API_KEY
```

Then set `RSIBOUND_TS_API_KEY` in the CLI container env before applying.

Preferred config shape keeps accounts and allocations at top-level:

```yaml
alphas:
  - alpha_id: rsibound
    allowed_modes: [paper, sandbox]
    allowed_venues: [BINANCE, DNSE]

accounts:
  - account_id: paper-binance-rsibound
    alpha_id: rsibound
    mode: paper
    venue: BINANCE
    balance:
      currency: USDT
      initial_balance: "100000"
    policy:
      account_type: MARGIN
      margin_mode: CROSS

allocations:
  - portfolio_id: alpha_lab_main
    account_id: paper-binance-rsibound
    alpha_id: rsibound
    mode: paper
    venue: BINANCE
    currency: USDT
    allocated_capital: "50000"
    max_capital: "100000"
    movement_type: INITIAL_ALLOCATE
```

Nested `alphas[].accounts` and `alphas[].allocations` are still accepted for backward compatibility, but new configs should use top-level `accounts` and `allocations`.

## 15. Redis Inspection

Use CLI Redis commands for inspection/debugging. They do not replace admin endpoints for config changes.

Inspect gateway auth:

```bash
docker compose --profile cli run --rm --no-deps cli redis alpha-auth rsibound_ts_sample
```

Inspect trading state:

```bash
docker compose --profile cli run --rm --no-deps cli redis trading-state --mode paper --venue BINANCE
```

Scan keys:

```bash
docker compose --profile cli run --rm --no-deps cli redis scan "gate:*" --limit 50
docker compose --profile cli run --rm --no-deps cli redis scan "system:trading_state:*" --limit 50
```

Read a key:

```bash
docker compose --profile cli run --rm --no-deps cli redis get system:trading_state:paper:BINANCE
```

Inspect latest stream messages:

```bash
docker compose --profile cli run --rm --no-deps cli redis stream events.risk.denied --limit 10
docker compose --profile cli run --rm --no-deps cli redis stream orders.approved --limit 10
```

## 17. End-To-End Scenario: New Alpha

1. Create a YAML from `config/examples/portfolio_setup.example.yaml`.
2. Set an API key env for the alpha, for example `RSIBOUND_TS_API_KEY`.
3. Run `cli config plan`.
4. Run `cli config apply`.
5. Verify gateway auth with `cli redis alpha-auth <alpha_id>`.
6. Verify alpha DB config with `cli alpha inspect <alpha_id>`.
7. Verify each account with `cli account state <account_id>`.
8. Verify capital grants with `cli capital history --account-id <account_id>`.
9. For sandbox/live, run `cli account sync <account_id> --mode <mode> --venue <venue>`.
10. Run `cli account reconcile-positions <account_id> --sync-first`.
11. If mismatched, review and apply with `cli account reconcile-positions <account_id> --apply`.
12. Keep sandbox/live trading state `HALTED` until broker sync is `OK`, fresh, and position reconciliation is clean.
13. Move state to `ACTIVE` only for the target mode/venue when ready.

For adjusting an existing alpha:

- change allocation with `cli allocation`
- change account policy with `cli account policy`
- change per-symbol risk with `cli risk profile`
- halt/resume by `cli risk state` or `cli portfolio state`
- inspect Redis state with `cli redis ...`

## 18. PnL And Equity Monitoring

Use account equity snapshots as the primary minute-level NAV/PnL history. Current
`positions_v2` rows answer which positions are open now; `fills` remains the immutable realized
PnL and fee ledger. Symbol-level `performance_snapshots` are diagnostics sampled every five
minutes by default and whenever a position changes.

Latest values for one alpha:

```bash
docker compose --profile cli run --rm --no-deps cli \
  performance account --alpha-id rsiboundportfolioA001_15m
```

Latest values and recent minute history for one account:

```bash
docker compose --profile cli run --rm --no-deps cli \
  performance account --account-id paper-binance-rsiboundportfolioA001_15m
docker compose --profile cli run --rm --no-deps cli \
  performance account-history paper-binance-rsiboundportfolioA001_15m --limit 30
```

Latest symbol/instrument diagnostics and one compact dashboard:

```bash
docker compose --profile cli run --rm --no-deps cli \
  performance instrument --alpha-id rsiboundportfolioA001_15m --symbol BTCUSDT
docker compose --profile cli run --rm --no-deps cli \
  performance dashboard --alpha-id rsiboundportfolioA001_15m
```

Latest portfolio rollup and recent history:

```bash
docker compose --profile cli run --rm --no-deps cli \
  performance portfolio portfolio_test_migrate
docker compose --profile cli run --rm --no-deps cli \
  performance portfolio-history portfolio_test_migrate --limit 30
```

Sizing explanations:

```bash
docker compose --profile cli run --rm --no-deps cli \
  sizing history --alpha-id rsiboundportfolioA001_15m --symbol BTCUSDT --limit 20
docker compose --profile cli run --rm --no-deps cli \
  sizing summary --alpha-id rsiboundportfolioA001_15m
docker compose --profile cli run --rm --no-deps cli \
  sizing decision <decision_id>
```

Use sizing history when an alpha logs `QTY_BELOW_MARKET_MINIMUM`, `NON_POSITIVE_EQUITY`,
`INVALID_CAPITAL_MODEL`, or an unexpected notional. The row explains which equity source,
allocation, leverage cap, market lot/min-notional rule, broker-binding context, and risk capacity
produced the final quantity.

## 19. Emergency Close

Normal production operations never delete trading records. To flatten one account, inspect the
read-only plan first:

```bash
docker compose --profile cli run --rm --no-deps cli ops emergency-close \
  --account-id paper-binance-rsiboundportfolioA001_15m
```

To flatten every account belonging to one alpha, optionally narrowed by mode and venue:

```bash
docker compose --profile cli run --rm --no-deps cli ops emergency-close \
  --alpha-id rsiboundportfolioA001_15m --mode paper --venue BINANCE
```

Apply only after reviewing the plan:

```bash
docker compose --profile cli run --rm --no-deps cli ops emergency-close \
  --account-id paper-binance-rsiboundportfolioA001_15m \
  --apply --confirm CLOSE --reason "operator-requested flatten"
```

Apply asks for the admin password, moves matching deployments to `REDUCING`, queues cancels for
canonical open orders, and queues reduce-only `MARKET` closes through the normal lifecycle.
Verify the resulting operation:

```bash
docker compose --profile cli run --rm --no-deps cli ops emergency-close-verify <operation_id>
```

Emergency flatten is intentionally a `plan -> apply -> verify` loop. With asynchronous fills or
broker max-quantity chunking, verify may return `PARTIAL`. Review the new plan and apply again for
the residue until verify returns `VERIFIED`. Also review broker reconciliation for sandbox/live.
Then explicitly move the deployment to `HALTED` if that is the desired final state. Direct
exchange cleanup is reserved for disaster recovery and must be followed by reconciliation.

## 20. Broker Bindings

`account_id` is an internal virtual account for one alpha deployment. It is the scope for
allocation, risk, orders, fills, positions, and PnL.

`external_account_ref` is the physical broker account/credential binding. For Binance sandbox/live,
several internal virtual accounts may share one physical binding, for example
`binance_testnet_main`.

List current broker bindings:

```bash
docker compose --profile cli run --rm --no-deps cli broker bindings
docker compose --profile cli run --rm --no-deps cli broker bindings --mode sandbox --venue BINANCE
```

Inspect one physical binding:

```bash
docker compose --profile cli run --rm --no-deps cli broker state binance_testnet_main \
  --mode sandbox --venue BINANCE
```

Inspect aggregate virtual exposure versus physical broker exposure:

```bash
docker compose --profile cli run --rm --no-deps cli broker exposure binance_testnet_main \
  --mode sandbox --venue BINANCE
```

Run physical aggregate position reconciliation:

```bash
docker compose --profile cli run --rm --no-deps cli broker reconcile-positions binance_testnet_main \
  --mode sandbox --venue BINANCE --sync-first \
  --reason "operator aggregate physical check"
```

Run physical aggregate open-order reconciliation:

```bash
docker compose --profile cli run --rm --no-deps cli broker reconcile-open-orders binance_testnet_main \
  --mode sandbox --venue BINANCE --sync-first \
  --reason "operator aggregate physical open-order check"
```

### Shared Binance Testnet Hard Reset

This is a **global disposable-testnet operation**, not an alpha-scoped reset. Multiple internal
`account_id` values can share `external_account_ref=binance_testnet_main`; Binance cannot identify
which virtual alpha owns a physical position after those orders have been netted or represented in
HEDGE mode. Never run this procedure against live credentials.

1. Stop every sandbox alpha container bound to `binance_testnet_main`. Leaving one writer running
   can recreate an order while cleanup is in progress.
2. Inspect the physical account without changing it:

```bash
cd /root/bobby/trading_system
docker compose run --rm --no-deps executor \
  python scripts/binance_testnet_account_cleanup.py
```

3. Cancel every ordinary/algo order and flatten every LONG/SHORT physical position:

```bash
docker compose run --rm --no-deps executor \
  python scripts/binance_testnet_account_cleanup.py \
  --apply --confirm BINANCE_TESTNET_ONLY
```

4. Reset only the selected internal sandbox accounts, preserving declarative config:

```bash
ALLOW_DESTRUCTIVE_LAB_RESET=true scripts/reset_lab_baseline.sh \
  --apply --confirm RESET_ALPHA_TEST_DATA --preserve-config \
  --account-ids sandbox-binance-alpha_a,sandbox-binance-alpha_b
```

5. Delete only those accounts' generated sandbox SDK state directories. Do not delete paper/live
   state and do not delete state while its broker or DB position remains open.
6. Run both aggregate reconciliation commands above with `--sync-first`. Both must return
   `status=OK` and `findings=0`.
7. Run the cleanup script once more without `--apply`. All credentials must report zero ordinary
   orders, zero algo orders, and zero positions before starting one chosen sandbox alpha.

The hard reset intentionally does not restart sandbox alphas. Start them explicitly after choosing
the next isolated test window.

Inspect one internal account and its binding:

```bash
docker compose --profile cli run --rm --no-deps cli account state sandbox-binance-rsiboundportfolioA001_1d
```

### Position Accounting Mode

`position_accounting_mode` controls how an internal virtual account expects the shared physical
broker account to represent positions:

- `NET`: one-way/net-book behavior. Opposite virtual positions on the same symbol must not share
  the same physical binding unless the strategies intentionally own one combined net book.
- `HEDGE`: side-separated behavior. Binance Futures uses `positionSide=LONG` / `SHORT`, so multiple
  independent sandbox alphas can hold opposite virtual positions without the broker silently netting
  them away.

Current production rule:

- Paper accounts stay virtual and normally use `NET`.
- Binance sandbox accounts default to `HEDGE` in
  `config/_config/portfolio_account_config_setup.yaml`.
- Binance live can use `NET` or `HEDGE`, but it must be an explicit fund-level decision before
  live deployment. Changing Binance position mode may fail if open orders or positions already
  exist; flatten/cancel first, then sync again.
- Future venues must map this policy at the adapter boundary. For example OKX may support a
  similar long/short mode with different API fields, while DNSE cash stock is effectively long-only
  unless a margin/loan product changes the policy.

Set or inspect account policy:

```bash
docker compose --profile cli run --rm --no-deps cli account policy sandbox-binance-rsiboundportfolioA001_1d \
  --mode sandbox --venue BINANCE \
  --account-type MARGIN --margin-mode CROSS \
  --position-accounting-mode HEDGE \
  --require-broker-sync \
  --reason "enable hedge mode for shared Binance sandbox binding"

docker compose --profile cli run --rm --no-deps cli account state sandbox-binance-rsiboundportfolioA001_1d
```

When `position_accounting_mode=NET` on a shared physical binding, risk rejects new opposite-side
opens for the same symbol with `OPPOSITE_SIDE_ON_SHARED_ONE_WAY_BINDING`. This prevents a virtual
LONG from one alpha and virtual SHORT from another alpha being silently netted on the broker. When
`position_accounting_mode=HEDGE`, risk infers `position_side` for the executor and physical
reconciliation compares `SYMBOL:LONG` and `SYMBOL:SHORT` separately.

For shared physical Binance accounts, broker sync checks freshness at the physical binding scope.
Per-alpha `positions_v2` remains virtual. Do not interpret one Binance broker snapshot as an
independent broker-authoritative position snapshot for every internal account. Use `broker exposure`
and `broker reconcile-*` to compare the physical broker net state with the aggregate of all internal
virtual accounts sharing the binding.

Production warning: physical flattening affects every virtual account sharing the credential. Halt
or reduce virtual deployments first, then use the emergency-close plan/verify loop. Direct broker
flatten is a disaster-recovery action and must be followed by physical aggregate reconciliation.

## 21. Notes

- Do not use `POST /v1/admin/market/seed` to claim data_layer passed. It is only a paper execution debug helper.
- `sandbox` and `live` account truth comes from broker/exchange sync snapshots. If `require_broker_sync=true`, risk rejects new orders when the latest snapshot is missing, stale, `ERROR`, or `MISMATCH`.
- For live, keep `risk state HALTED` until credentials, market data, broker account sync, reconciliation, and tiny-order smoke all pass.

## 22. Pre-Production Lab Reset

This procedure is destructive. Use it only when every row is confirmed test data. It is not a
normal portfolio-management workflow.

### Alpha-Scoped Reset

Use this when retesting one migrated alpha folder. The script extracts `TRADING_ALPHA_ID` and
`TRADING_ACCOUNT_ID` values from that alpha's `docker-compose.yml`, stops only those alpha
containers, deletes only DB rows linked to those alpha/account IDs, and optionally cleans generated
files in that alpha folder. It does not truncate the database and does not flush Redis DB0.

Read-only plan:

```bash
scripts/reset_lab_baseline.sh \
  --alpha-compose /root/bobby/execution_alpha/alphas/rsiboundportfolioA001/docker-compose.yml
```

Apply alpha-scoped cleanup:

```bash
ALLOW_DESTRUCTIVE_LAB_RESET=true scripts/reset_lab_baseline.sh \
  --apply --confirm RESET_ALPHA_TEST_DATA \
  --clean-alpha-files \
  --alpha-compose /root/bobby/execution_alpha/alphas/rsiboundportfolioA001/docker-compose.yml
```

Apply alpha-scoped cleanup but keep declarative config rows already applied:

```bash
ALLOW_DESTRUCTIVE_LAB_RESET=true scripts/reset_lab_baseline.sh \
  --apply --confirm RESET_ALPHA_TEST_DATA \
  --clean-alpha-files --preserve-config \
  --alpha-compose /root/bobby/execution_alpha/alphas/rsiboundportfolioA001/docker-compose.yml
```

Reset one account only, without touching other accounts in the same alpha folder:

```bash
ALLOW_DESTRUCTIVE_LAB_RESET=true scripts/reset_lab_baseline.sh \
  --apply --confirm RESET_ALPHA_TEST_DATA \
  --preserve-config \
  --account-id paper-binance-fib_sl_tp_strength_0015m
```

Use `--account-id` repeatedly or `--account-ids id1,id2,id3` for a small group of accounts. Add
`--alpha-id` only when rows must also be scoped by strategy id. With `--preserve-config`, runtime
rows such as orders, fills, positions, brackets, reservations, performance snapshots, copy outbox,
and reconciliation findings are removed, while strategy/account/risk/allocation config remains.
Paper account balances are unlocked back to their configured total so a new test cycle can start
without running `config apply` again.

Use the same pattern for any other alpha folder by changing only `--alpha-compose`.

### Global Disposable-Lab Reset

Use this only when the whole trading_system lab database is disposable and should be reset to a
clean baseline. This stops trading-system writers, truncates public test data except `venues`,
flushes trading Redis DB0, and restarts trading-system services.

Read-only global plan:

```bash
scripts/reset_lab_baseline.sh --global-reset
```

Apply full lab reset:

```bash
ALLOW_DESTRUCTIVE_LAB_RESET=true scripts/reset_lab_baseline.sh \
  --global-reset --apply --confirm RESET_ALL_TEST_DATA
```

Add `--flatten-binance-testnet` only for full disposable-lab cleanup when the configured Futures
testnet account is disposable and must be flattened before internal projections are cleared:

```bash
ALLOW_DESTRUCTIVE_LAB_RESET=true scripts/reset_lab_baseline.sh \
  --global-reset --apply --confirm RESET_ALL_TEST_DATA --flatten-binance-testnet
```

The script never deletes Docker volumes, never flushes Redis DB2 owned by data_layer, and never
uses Binance live credentials. `--clean-alpha-files` is explicit and deletes only generated
`logs/`, `state/`, and `main/__pycache__/` content below the selected
`/root/bobby/execution_alpha/alphas/*` folder. Alpha-scoped reset refuses Binance testnet flatten
because the physical testnet account may be shared by multiple virtual alpha accounts. All reset
commands are forbidden in production. Production records remain append only; use emergency close
instead.
