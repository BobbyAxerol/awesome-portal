/**
 * SMOKE DATA — Admin Action Drawer CLI catalog (hi-fi WF 1i, owner copy
 * 2026-08-30). TEMPORARY. DELETE WHEN BR-EX-68 SHIPS.
 *
 * What this file is: the operator-task command catalog the hi-fi draws —
 * twenty-four curated actions in six task groups, each with registry-sourced
 * parameters, an assembled CLI line, a request preview, authority checks and
 * (for the seven reads) a canned terminal transcript — plus the PLAN →
 * APPLY (step-up) → VERIFY demo frames: preflight rows, the two-man-rule
 * grant, and the operation timeline for VERIFIED and PARTIAL outcomes.
 *
 * None of it is runnable and the screen says so beside every interactive
 * piece: catalogue rev 2 (`execution.command-catalog`, EX-BE-05b/F0)
 * publishes `portal_reachable: false` on all 64 entries and capability
 * `DISABLED`. The flow here is a DECLARED DEMO of the interaction the
 * hi-fi specifies, so the composition, states and wording are reviewable
 * before the relay exists. `catalogKey` joins each action to the published
 * catalogue entry it will become; an action without one is not in rev 2
 * and its detail says exactly that.
 *
 * Removal contract — one commit: delete this file, read the operator-task
 * catalog + plan/preflight/apply/verify + grant endpoints from BR-EX-68,
 * delete the SMOKE cases in `adminCli.test.tsx`, re-record the
 * admin-actions baseline.
 */

export type CliTag = "READ" | "MUTATION" | "DANGER" | "BLOCKED";
export type CliRole = "ADMIN" | "OPERATOR" | "VIEWER";
export type CliOutcome = "VERIFIED" | "PARTIAL";

export interface CliParam {
  k: string;
  v: string;
  src: string;
}

export interface CliLink {
  label: string;
  href: string;
}

export interface CliCheck {
  tone: "good" | "warn" | "mute";
  text: string;
  link?: CliLink;
}

export interface CliAction {
  id: string;
  group: number;
  title: string;
  tag: CliTag;
  scope: string;
  /** Full CLI form(s), multi-line — the hi-fi's audit/training block. */
  cli: string;
  /** Pending-change request preview, as the CLI prints it (generic mutations). */
  plan?: string;
  /** Authority & gate checks (generic mutations). */
  appr?: string;
  /** Default reason line (required — lands in portfolio_audit_log). */
  reason?: string;
  meta: string;
  /** Join to the published catalogue (`execution.command-catalog` rev 2). */
  catalogKey?: string;
}

export const CLI_GROUPS = [
  "Read & inspect — no password, no step-up",
  "Portfolio & capital",
  "Deployment & risk",
  "Account",
  "Broker sync & reconciliation",
  "Emergency & destructive",
] as const;

export const CLI_ACTIONS: readonly CliAction[] = [
  // ── group 0 · read & inspect ─────────────────────────────────────────────
  {
    id: "health", group: 0, title: "System health", tag: "READ", scope: "system",
    cli: "cli health",
    plan: "status READY · gateway / risk_engine / paper_execution /\nportfolio / performance / reconciliation — freshness table\nno stale services allowed",
    meta: "read-only · no password · no step-up",
  },
  {
    id: "inspect", group: 0, title: "Alpha / account inspect", tag: "READ", scope: "alpha · account",
    cli: "cli alpha inspect carry\ncli account state paper-binance-carry-v32",
    plan: "account · policy · balances · margin balances ·\nopen reservations · latest broker sync snapshot",
    meta: "read-only · no password · no step-up",
    catalogKey: "alpha/inspect",
  },
  {
    id: "capital", group: 0, title: "Capital history", tag: "READ", scope: "portfolio · account",
    cli: "cli capital history --portfolio-id PF-MAIN \\\n  --account-id paper-binance-carry-v32 --limit 50",
    plan: "portfolio_capital_ledger rows — movement type ·\namount · before/after · operation · actor",
    meta: "read-only · no password · no step-up",
    catalogKey: "capital/history",
  },
  {
    id: "perf", group: 0, title: "Performance & NAV", tag: "READ", scope: "alpha · account · portfolio",
    cli: "cli performance account --account-id …\ncli performance account-history … --limit 30\ncli performance portfolio PF-MAIN · dashboard --alpha-id …",
    plan: "minute-level equity snapshots = primary NAV/PnL history ·\npositions_v2 = open now · fills = immutable realized ledger",
    meta: "read-only · no password · no step-up",
    catalogKey: "performance/portfolio",
  },
  {
    id: "sizing", group: 0, title: "Sizing explanations", tag: "READ", scope: "alpha · symbol",
    cli: "cli sizing history --alpha-id carry --symbol BTCUSDT --limit 20\ncli sizing summary --alpha-id carry · sizing decision <id>",
    plan: "explains QTY_BELOW_MARKET_MINIMUM · NON_POSITIVE_EQUITY ·\nINVALID_CAPITAL_MODEL — equity source, allocation, leverage cap,\nlot/min-notional rule, risk capacity → final qty",
    meta: "read-only · no password · no step-up",
    catalogKey: "sizing/history",
  },
  {
    id: "brokerRead", group: 0, title: "Broker bindings & exposure", tag: "READ", scope: "external_account_ref",
    cli: "cli broker bindings --mode sandbox --venue BINANCE\ncli broker state binance_main_01 · broker exposure binance_main_01",
    plan: "physical binding state · aggregate virtual exposure vs\nphysical broker exposure — the headroom check",
    meta: "read-only · no password · no step-up",
    catalogKey: "broker/bindings",
  },
  {
    id: "redis", group: 0, title: "Redis inspection", tag: "READ", scope: "debug only",
    cli: "cli redis trading-state --mode paper --venue BINANCE\ncli redis scan \"gate:*\" · redis get system:trading_state:…\ncli redis stream events.risk.denied --limit 10",
    plan: "inspection/debugging only — NEVER a config channel;\nconfig changes go through admin endpoints",
    meta: "read-only · no password · no step-up",
    catalogKey: "redis/trading-state",
  },
  // ── group 1 · portfolio & capital ───────────────────────────────────────
  {
    id: "pfCreate", group: 1, title: "Create portfolio", tag: "MUTATION", scope: "portfolio",
    cli: "cli portfolio create alpha_lab_main --name \"Alpha Lab Main\" \\\n  --base-currency USDT --state ACTIVE --reason \"initial setup\"",
    plan: "METHOD: POST\nPATH: /v1/admin/portfolios\nPAYLOAD: { portfolio_id, name, base_currency, state, reason }",
    appr: "✓ admin scope · new container, no capital until allocation\n✓ reason required → portfolio_audit_log",
    reason: "initial setup",
    meta: "mutation · CLI password → web step-up",
    catalogKey: "portfolio/create",
  },
  {
    id: "pfState", group: 1, title: "Portfolio state (kill switch)", tag: "MUTATION", scope: "portfolio",
    cli: "cli portfolio state PF-MAIN HALTED --reason \"operator emergency stop\"\ncli portfolio state PF-MAIN REDUCING --reason \"close-only mode\"\ncli portfolio state PF-MAIN ACTIVE --reason \"resume after check\"",
    plan: "METHOD: POST\nPATH: /v1/admin/portfolios/PF-MAIN/state\nPAYLOAD: { state: HALTED|REDUCING|ACTIVE, reason }",
    appr: "✓ HALTED blocks new orders portfolio-wide · REDUCING = cancel/close only\n! halting needs no approval — RESUMING checks approvals/readiness\n✓ risk engine reads this state before normal checks",
    reason: "operator emergency stop",
    meta: "mutation · CLI password → web step-up",
    catalogKey: "portfolio/state",
  },
  {
    id: "alloc", group: 1, title: "Change allocation", tag: "MUTATION", scope: "portfolio · account",
    cli: "cli allocation PF-MAIN paper-binance-carry-v32 \\\n  --strategy-id carry --mode paper --venue BINANCE \\\n  --currency USDT --allocated-capital 75000 --max-capital 100000 \\\n  --state ACTIVE --movement-type ALLOCATE --reason \"scale within R2 cap\"",
    reason: "Scale within R2 cap after 12 clean observation days.",
    meta: "mutation · writes portfolio_capital_ledger · movement ALLOCATE|WITHDRAW|REBALANCE",
  },
  {
    id: "config", group: 1, title: "Declarative config plan / apply", tag: "MUTATION", scope: "multi-resource",
    cli: "cli config plan config/portfolio_setup.yaml\ncli config apply config/portfolio_setup.yaml --reason \"initial setup\"",
    plan: "one YAML → portfolios · trading state · symbol allowlist ·\nalpha + API key · accounts/balances/policies · allocations ·\nledger rows · risk profiles — full plan printed, ONE confirm",
    appr: "✓ preferred first source of truth for a new alpha\n✓ api keys from env (api_key_env), never in YAML\n✓ same plan → apply loop, one step-up",
    reason: "initial rsibound setup",
    meta: "mutation · batch — plan prints every sub-change",
    catalogKey: "config/plan",
  },
  // ── group 2 · deployment & risk ─────────────────────────────────────────
  {
    id: "depState", group: 2, title: "Deployment state (isolated)", tag: "MUTATION", scope: "alpha:mode:venue:account",
    cli: "cli deployment state carry:paper:BINANCE:paper-binance-carry-v32 \\\n  HALTED --reason \"observation window complete\"",
    plan: "METHOD: POST\nPATH: /v1/admin/deployments/{key}/state\nPAYLOAD: { state: HALTED|ACTIVE, reason }",
    appr: "✓ halts ONE alpha-mode-venue instance, siblings unaffected\n✓ HALTED blocks new orders + excludes from scheduled broker sync\n! resume of sandbox/live requires clean sync + reconciliation",
    reason: "sandbox observation window complete",
    meta: "mutation · preferred isolated stop",
    catalogKey: "deployment/state",
  },
  {
    id: "riskState", group: 2, title: "Trading state per mode/venue", tag: "MUTATION", scope: "mode · venue (global)",
    cli: "cli risk state HALTED --mode sandbox --venue BINANCE\ncli risk state ACTIVE --mode paper --venue DNSE",
    plan: "METHOD: POST\nPATH: /v1/admin/trading-state\nPAYLOAD: { state, mode, venue } → redis system:trading_state:<mode>:<venue>",
    appr: "✓ global kill switch ahead of per-alpha risk\n! live stays HALTED until credentials + sync + reconciliation + smoke pass",
    reason: "hold live until smoke passes",
    meta: "mutation · global kill switch",
    catalogKey: "risk/state",
  },
  {
    id: "riskProfile", group: 2, title: "Risk profile (alpha / instrument)", tag: "MUTATION", scope: "alpha · mode · venue [· instrument]",
    cli: "cli risk profile carry --mode paper --venue BINANCE \\\n  --max-notional-order 1000 --max-notional-position 5000 \\\n  --max-leverage 3 --max-order-per-minute 60 --max-daily-loss 500 \\\n  --max-drawdown 0.10 --allowed-order-types MARKET,LIMIT,STOP_MARKET \\\n  --trading-state ACTIVE",
    plan: "METHOD: POST\nPATH: /v1/admin/risk-profiles\nPAYLOAD: limits + allowed order types + trading state\n(--instrument-id FPT.DNSE for per-symbol overrides)",
    appr: "✓ within R2-approved risk envelope, else stage risk approval required\n✓ new revision — old revisions stay for lineage",
    reason: "tighten order cap for observation",
    meta: "mutation · R2/stage-approval scoped",
    catalogKey: "risk/profile",
  },
  {
    id: "alphaReg", group: 2, title: "Register alpha", tag: "MUTATION", scope: "alpha",
    cli: "cli alpha register carry --allowed-modes paper,sandbox \\\n  --allowed-venues BINANCE,DNSE --base-currency USDT \\\n  --account-balances-json '{…}' --account-policies-json '{…}' \\\n  --risk-json '{…}' --api-key $CARRY_API_KEY",
    plan: "registers alpha + gateway API key + accounts + balances +\npolicies + base risk in one admin change",
    appr: "✓ allowed modes/venues = hard ceiling later stages cannot exceed\n✓ prefer declarative config apply for new alphas",
    reason: "register imported alpha",
    meta: "mutation · prefer config apply",
    catalogKey: "alpha/register",
  },
  // ── group 3 · account ───────────────────────────────────────────────────
  {
    id: "acctPolicy", group: 3, title: "Account policy", tag: "MUTATION", scope: "account",
    cli: "cli account policy sandbox-binance-carry --mode sandbox --venue BINANCE \\\n  --account-type MARGIN --margin-mode CROSS \\\n  --position-accounting-mode HEDGE --require-broker-sync \\\n  --external-account-ref binance_testnet_main --reason \"hedge mode\"",
    plan: "METHOD: POST\nPATH: /v1/admin/account-policies\nPAYLOAD: CASH|MARGIN · CROSS|ISOLATED|NONE · leverage · fees ·\nsettlement · NET|HEDGE · require_broker_sync · external_account_ref",
    appr: "✓ NET on shared binding — risk rejects opposite-side opens\n  (OPPOSITE_SIDE_ON_SHARED_ONE_WAY_BINDING)\n! Binance live NET vs HEDGE = explicit fund-level decision\n! changing position mode may require flatten + re-sync first",
    reason: "enable hedge mode for shared sandbox binding",
    meta: "mutation · R2-scoped policy",
    catalogKey: "account/policy",
  },
  {
    id: "seed", group: 3, title: "Seed / reset paper account", tag: "MUTATION", scope: "paper account only",
    cli: "cli account seed-paper carry --account-id paper-binance-carry-v32 \\\n  --venue BINANCE --currency USDT --amount 100000 --account-type MARGIN",
    plan: "METHOD: POST\nPATH: /v1/admin/accounts/seed-paper\nPAYLOAD: { alpha_id, account_id, venue, currency, amount, account_type }",
    appr: "✓ paper only — virtual balance reset\n! resets observation evidence — Paper Exit clock restarts",
    reason: "reset for new observation cycle",
    meta: "mutation · paper only",
    catalogKey: "account/seed-paper",
  },
  // ── group 4 · broker sync & reconciliation ──────────────────────────────
  {
    id: "sync", group: 4, title: "Broker account sync", tag: "MUTATION", scope: "account · venue-specific",
    cli: "cli account sync sandbox-binance-carry --mode sandbox --venue BINANCE\ncli account sync live-dnse-carry --mode live --venue DNSE \\\n  --account-no <DNSE_NO> --market-type STOCK [--symbol FPT --price 100000 \\\n  --loan-package-id <ID>]  # PPSE/buying-power probe",
    plan: "BINANCE: python-binance futures endpoints (TESTNET/LIVE keys)\nDNSE: get_balances · get_positions · get_orders ·\nget_loan_packages · get_ppse → writes account_sync_snapshots",
    appr: "✓ paper syncs from internal projections\n! missing creds / dry-run → ERROR snapshot — intentional, not a pass\n! require_broker_sync=true: stale/ERROR/MISMATCH blocks new orders",
    reason: "startup sync",
    meta: "mutation · per-venue credentials",
    catalogKey: "account/sync",
  },
  {
    id: "reconPos", group: 4, title: "Reconcile positions", tag: "MUTATION", scope: "account",
    cli: "cli account reconcile-positions sandbox-binance-carry \\\n  --sync-first --mode sandbox --venue BINANCE --reason \"startup check\"\n# review findings, then:\ncli account reconcile-positions sandbox-binance-carry --apply \\\n  --reason \"apply broker authoritative state\"",
    plan: "dry-run: diff positions_v2 vs broker snapshot → findings,\nsync marked MISMATCH on diff (risk fail-closed)\napply: positions_v2 ← broker · findings RESOLVED ·\naudit APPLY_BROKER_POSITION_RECONCILIATION · sync → OK",
    appr: "✓ broker is authoritative for sandbox/live\n✓ dry-run before apply, always\n! detection-only mode can leave risk stuck in BROKER_SYNC_MISMATCH",
    reason: "startup position check",
    meta: "mutation · dry-run → apply",
    catalogKey: "account/reconcile-positions",
  },
  {
    id: "reconOrd", group: 4, title: "Reconcile open orders", tag: "MUTATION", scope: "account",
    cli: "cli account reconcile-open-orders sandbox-binance-carry \\\n  --sync-first --mode sandbox --venue BINANCE --reason \"startup check\"\ncli account reconcile-open-orders sandbox-binance-carry --apply \\\n  --reason \"apply broker authoritative state\"",
    plan: "findings: BROKER_OPEN_ORDER_STALE_IN_DB ·\nMISSING_IN_DB · STATE_MISMATCH\napply: stale locals → RECONCILED_MISSING · broker orders\nprojected in · sync → OK only if no other domain mismatched",
    appr: "✓ part of restart recovery: HALTED → sync → recon-positions →\n  recon-orders → review/apply → account state → ACTIVE",
    reason: "startup open-order check",
    meta: "mutation · dry-run → apply",
    catalogKey: "account/reconcile-open-orders",
  },
  {
    id: "brokerRecon", group: 4, title: "Aggregate physical reconcile", tag: "MUTATION", scope: "external_account_ref",
    cli: "cli broker reconcile-positions binance_testnet_main \\\n  --mode sandbox --venue BINANCE --sync-first --reason \"aggregate check\"\ncli broker reconcile-open-orders binance_testnet_main \\\n  --mode sandbox --venue BINANCE --sync-first --reason \"aggregate check\"",
    plan: "compares physical broker net state vs Σ of ALL virtual\naccounts sharing the binding — HEDGE compares SYMBOL:LONG\nand SYMBOL:SHORT separately",
    appr: "✓ the only place aggregate virtual vs physical is decided\n! one broker snapshot ≠ per-account authoritative snapshot",
    reason: "operator aggregate physical check",
    meta: "mutation · binding scope",
    catalogKey: "broker/reconcile-positions",
  },
  // ── group 5 · emergency & destructive ───────────────────────────────────
  {
    id: "emergency", group: 5, title: "Emergency close (flatten)", tag: "DANGER", scope: "account · alpha [· mode · venue]",
    cli: "cli ops emergency-close --account-id paper-binance-carry-v32\n# review read-only plan, then:\ncli ops emergency-close --account-id paper-binance-carry-v32 \\\n  --apply --confirm CLOSE --reason \"operator-requested flatten\"\ncli ops emergency-close-verify <operation_id>",
    reason: "operator-requested flatten",
    meta: "danger · plan → apply(--confirm CLOSE) → verify loop · PARTIAL re-applies",
    catalogKey: "ops/emergency-close",
  },
  {
    id: "testnetReset", group: 5, title: "Shared testnet hard reset", tag: "DANGER", scope: "binance_testnet_main only",
    cli: "docker compose run --rm --no-deps executor \\\n  python scripts/binance_testnet_account_cleanup.py \\\n  [--apply --confirm BINANCE_TESTNET_ONLY]",
    plan: "global disposable-testnet op: stop writers → inspect →\ncancel all + flatten physical → reset selected virtual accounts\n(--preserve-config) → aggregate recon ×2 must return OK/0 findings",
    appr: "! NEVER against live credentials — confirm word enforces it\n! affects EVERY virtual account sharing the binding\n✓ portal renders the plan; apply stays a deliberate operator act",
    reason: "isolated test window reset",
    meta: "danger · sandbox/testnet only",
  },
  {
    id: "labReset", group: 5, title: "Lab reset (alpha-scoped / global)", tag: "BLOCKED", scope: "lab only — never production",
    cli: "scripts/reset_lab_baseline.sh …",
    plan: "Destructive test-data reset (reset_lab_baseline.sh). Forbidden in production —\nproduction records are append-only; use Emergency close instead.\nThe portal intentionally does NOT expose this; it stays a host-CLI-only\nprocedure behind ALLOW_DESTRUCTIVE_LAB_RESET + typed confirm words.",
    meta: "not exposed — host CLI only",
  },
];

/** Target & parameters per action — ids picked from registries, never free-typed. */
export const CLI_PARAMS: Record<string, readonly CliParam[]> = {
  health: [{ k: "--mode", v: "all", src: "optional filter ▾" }],
  inspect: [
    { k: "alpha_id", v: "carry", src: "alpha registry ▾" },
    { k: "--account-id", v: "paper-binance-carry-v32", src: "accounts of alpha ▾" },
  ],
  capital: [
    { k: "--portfolio-id", v: "PF-CRYPTO", src: "portfolio registry ▾" },
    { k: "--account-id", v: "paper-binance-carry-v32", src: "accounts in portfolio ▾" },
    { k: "--limit", v: "50", src: "1–500" },
  ],
  perf: [
    { k: "--portfolio-id", v: "PF-CRYPTO", src: "portfolio registry ▾" },
    { k: "--alpha-id", v: "carry", src: "optional ▾" },
  ],
  sizing: [
    { k: "--alpha-id", v: "carry", src: "alpha registry ▾" },
    { k: "--symbol", v: "BTCUSDT", src: "symbol allowlist ▾" },
    { k: "--limit", v: "20", src: "1–200" },
  ],
  brokerRead: [
    { k: "external_account_ref", v: "binance_main_01", src: "binding registry ▾" },
    { k: "--mode", v: "sandbox", src: "mode ▾" },
    { k: "--venue", v: "BINANCE", src: "venue registry ▾" },
  ],
  redis: [
    { k: "--mode", v: "paper", src: "mode ▾" },
    { k: "--venue", v: "BINANCE", src: "venue registry ▾" },
  ],
  pfCreate: [
    { k: "portfolio_id", v: "alpha_lab_main", src: "new — uniqueness checked" },
    { k: "--base-currency", v: "USDT", src: "ccy ▾" },
    { k: "--state", v: "ACTIVE", src: "state ▾" },
    { k: "--reason", v: "initial setup", src: "required · audit" },
  ],
  pfState: [
    { k: "portfolio_id", v: "PF-MAIN", src: "portfolio registry ▾" },
    { k: "state", v: "HALTED", src: "HALTED | REDUCING | ACTIVE ▾" },
    { k: "--reason", v: "operator emergency stop", src: "required · audit" },
  ],
  alloc: [
    { k: "portfolio_id", v: "PF-MAIN", src: "portfolio registry ▾" },
    { k: "account_id", v: "paper-binance-carry-v32", src: "accounts in portfolio ▾" },
    { k: "--allocated-capital", v: "75,000", src: "≤ R2 cap 100,000" },
    { k: "--movement-type", v: "ALLOCATE", src: "ALLOCATE | WITHDRAW | REBALANCE ▾" },
    { k: "--reason", v: "scale within R2 cap", src: "required · audit" },
  ],
  config: [
    { k: "file", v: "config/portfolio_setup.yaml", src: "repo path ▾" },
    { k: "--reason", v: "initial setup", src: "required · audit" },
  ],
  depState: [
    { k: "key", v: "carry:paper:BINANCE:paper-…-v32", src: "deployment registry ▾" },
    { k: "state", v: "HALTED", src: "HALTED | ACTIVE ▾" },
    { k: "--reason", v: "observation window complete", src: "required · audit" },
  ],
  riskState: [
    { k: "state", v: "HALTED", src: "state ▾" },
    { k: "--mode", v: "sandbox", src: "mode ▾" },
    { k: "--venue", v: "BINANCE", src: "venue registry ▾" },
  ],
  riskProfile: [
    { k: "alpha_id", v: "carry", src: "alpha registry ▾" },
    { k: "--mode", v: "paper", src: "mode ▾" },
    { k: "--venue", v: "BINANCE", src: "venue ▾" },
    { k: "--max-notional-order", v: "1,000", src: "within R2 envelope" },
    { k: "--max-leverage", v: "3", src: "≤ policy cap" },
  ],
  alphaReg: [
    { k: "alpha_id", v: "carry", src: "new id" },
    { k: "--allowed-modes", v: "paper,sandbox", src: "hard ceiling" },
    { k: "--allowed-venues", v: "BINANCE,DNSE", src: "hard ceiling" },
    { k: "--api-key", v: "$CARRY_API_KEY", src: "env ref — never literal" },
  ],
  acctPolicy: [
    { k: "account_id", v: "sandbox-binance-carry", src: "account registry ▾" },
    { k: "--position-accounting-mode", v: "HEDGE", src: "NET | HEDGE ▾" },
    { k: "--external-account-ref", v: "binance_testnet_main", src: "binding ▾" },
    { k: "--reason", v: "hedge mode", src: "required · audit" },
  ],
  seed: [
    { k: "alpha_id", v: "carry", src: "alpha ▾" },
    { k: "--account-id", v: "paper-binance-carry-v32", src: "paper accounts only ▾" },
    { k: "--amount", v: "100,000", src: "USDT" },
  ],
  sync: [
    { k: "account_id", v: "sandbox-binance-carry", src: "account ▾" },
    { k: "--mode", v: "sandbox", src: "mode ▾" },
    { k: "--venue", v: "BINANCE", src: "venue ▾" },
  ],
  reconPos: [
    { k: "account_id", v: "sandbox-binance-carry", src: "account ▾" },
    { k: "--sync-first", v: "true", src: "flag" },
    { k: "--apply", v: "false", src: "dry-run enforced first" },
    { k: "--reason", v: "startup check", src: "required · audit" },
  ],
  reconOrd: [
    { k: "account_id", v: "sandbox-binance-carry", src: "account ▾" },
    { k: "--sync-first", v: "true", src: "flag" },
    { k: "--reason", v: "startup check", src: "required · audit" },
  ],
  brokerRecon: [
    { k: "external_account_ref", v: "binance_testnet_main", src: "binding ▾" },
    { k: "--mode", v: "sandbox", src: "mode ▾" },
    { k: "--sync-first", v: "true", src: "flag" },
  ],
  emergency: [
    { k: "--account-id", v: "paper-binance-carry-v32", src: "account ▾" },
    { k: "--confirm", v: "CLOSE", src: "typed word — apply only" },
    { k: "--reason", v: "operator-requested flatten", src: "required · audit" },
  ],
  testnetReset: [
    { k: "--confirm", v: "BINANCE_TESTNET_ONLY", src: "typed word" },
    { k: "--preserve-config", v: "true", src: "flag" },
  ],
};

/** Canned read transcripts — exit codes verbatim, output copyable. */
export const CLI_OUT: Record<string, string> = {
  health:
    "$ cli health\ngateway            READY    42ms    rev 2.14.1\nrisk_engine        READY     8ms    profiles 14\npaper_execution    READY    11ms    sessions 3\nportfolio          READY     9ms    ledger rev 1,204\nperformance        READY    14ms    snapshots 128,410\nreconciliation     READY      —     findings open 1\nfreshness  paper 1.2s · sandbox 41s/60s · live ws 0.9s/5s\nexit 0 · 6/6 READY",
  inspect:
    "$ cli account state paper-binance-carry-v32\nstate        ACTIVE           rev 88\npolicy       MARGIN · CROSS   lev cap 3.0x\nUSDT free    38,214.11        locked 3,120.00\nmargin used  6,441.20         reservations 2\nlast sync    N/A (paper)      projection OK\npositions    2 open           uPnL +60.94\nexit 0",
  capital:
    "$ cli capital history --portfolio-id PF-CRYPTO --limit 5\n2026-08-13  CANARY_ALLOCATE   +5,000.00  120,000 → 125,000  op_1201\n2026-08-01  ALLOCATE         +60,000.00   60,000 → 120,000  op_1240\n2026-07-28  REBALANCE        −10,000.00   70,000 → 60,000   op_1222\n2026-07-20  SEED             +10,000.00   60,000 → 70,000   op_1187\n2026-07-12  ALLOCATE         +50,000.00   10,000 → 60,000   op_1102\nexit 0 · 5 rows · cursor next op_1101",
  perf:
    "$ cli performance portfolio PF-CRYPTO\nNAV        126,954.20 USDT   as_of 10:42:01Z\nday PnL    +342.18 (+0.27%)  mtd +1,954.02\ndrawdown   −1.6% (uw 4d)     sharpe 90d 1.41\nby stage   live +112 · canary +38 · paper +1,804\nsnapshots  minute-level · 128,410 rows\nexit 0",
  sizing:
    "$ cli sizing history --alpha-id carry --symbol BTCUSDT --limit 3\n10:41:58  qty 0.0080  OK        eq 44,900 · lev 1.3/3.0\n10:22:47  qty 0.1000  REJECTED  MAX_POSITION_NOTIONAL\n09:58:03  qty 0.0000  SKIPPED   QTY_BELOW_MARKET_MINIMUM\ntrace  equity → allocation 75,000 → lev cap → lot/min-notional → grant\nexit 0",
  brokerRead:
    "$ cli broker exposure binance_main_01\nphysical equity  43,120.00 USDT   ws 0.9s FRESH\nΣ virtual        41,000.00        headroom +2,120.00 ✓\nBTCUSDT net      0.0480 vs broker 0.0480   MATCH\nETH-PERP net     −1.2000 vs broker −1.2000 MATCH\nfindings         0 open\nexit 0",
  redis:
    "$ cli redis trading-state --mode paper --venue BINANCE\nsystem:trading_state:paper:BINANCE = ACTIVE (rev 12)\ngate:* keys 42 · events.risk.denied len 1,204\ntail  10:22:47 DENIED MAX_POSITION_NOTIONAL carry BTCUSDT\nread-only — config changes go through admin endpoints\nexit 0",
};

/** Server-side preflight after PLAN — index 4 is the declared WARN row. */
export const CLI_PREFLIGHT: readonly string[] = [
  "identity & lineage — artifact digest 41bb7d… pinned",
  "approval AP-207 valid · amount within approved cap",
  "execution cell health READY · broker sync FRESH 0.9s",
  "expected revision pinned — account rev 88",
  "concentration +4.6% — WARN, non-blocking",
  "idempotency key minted · plan TTL 60s",
];
export const CLI_PREFLIGHT_WARN_INDEX = 4;

/** Allocation impact preview + policy checks (hi-fi's alloc plan pane). */
export const ALLOC_IMPACT = {
  before: { allocated: "50,000.00", weight: "8.1%", marginal: "5.2%" },
  after: { allocated: "75,000.00", weight: "11.7%", marginal: "8.9%" },
  checks: [
    { tone: "good", text: "R2 AP-207 valid · digest match", link: { label: "AP-207", href: "/governance/approvals/AP-207/r2" } },
    { tone: "good", text: "within approved max capital 100,000.00" },
    { tone: "good", text: "ledger row will be written · movement ALLOCATE" },
    { tone: "warn", text: "concentration +4.6% — warning, not blocking" },
    { tone: "mute", text: "blast radius: dep_74 · account · risk capacity", link: { label: "dep_74", href: "/deployments/paper/dep_74" } },
  ] as readonly CliCheck[],
} as const;

/** Emergency flatten plan lines (read-only preview before --confirm CLOSE). */
export const EMERGENCY_PLAN: readonly CliCheck[] = [
  { tone: "warn", text: "deployments → REDUCING (blocks new opens, keeps reduces)" },
  { tone: "good", text: "cancel 2 canonical open orders" },
  { tone: "good", text: "close 2 positions · reduce-only MARKET via normal lifecycle" },
  { tone: "mute", text: "async fills + broker max-qty chunking — verify may return PARTIAL; re-apply residue until VERIFIED" },
  { tone: "mute", text: "records are never deleted · final HALTED is a separate explicit action" },
];

/** The two-man-rule grant demo (OPERATOR role only). */
export const CLI_GRANT = {
  key: "AGK-7F2C-9D41",
  admin: "Lan",
  requestedAt: "10:44:22Z",
  ttlSeconds: 90,
  /** ms before the demo admin "issues" the key. */
  issueDelayMs: 2400,
} as const;

export interface VerifyRow {
  at: string;
  tone: "good" | "warn" | "mute";
  text: string;
  chip?: string;
}

/** Operation timeline rows per outcome — op_1251 · command cmd_9f12. */
export function verifyTimeline(kind: "emergency" | "generic", outcome: CliOutcome): readonly VerifyRow[] {
  const head: VerifyRow[] = [
    { at: "10:44:02.114", tone: "mute", text: "command accepted", chip: "202 — NOT success yet" },
    { at: "10:44:02.480", tone: "good", text: "execution cell re-validated identity · approvals · expected revision" },
  ];
  if (kind === "emergency") {
    return [
      ...head,
      { at: "10:44:02.512", tone: "good", text: "deployment → REDUCING" },
      { at: "10:44:02.688", tone: "good", text: "2/2 cancels ACKed by lifecycle" },
      outcome === "VERIFIED"
        ? { at: "10:44:09.301", tone: "good", text: "2/2 reduce-only closes filled · exposure 0" }
        : { at: "10:44:09.301", tone: "warn", text: "1/2 closes filled · residue BTCUSDT 0.0100 (broker max-qty chunking)" },
    ];
  }
  return [
    ...head,
    { at: "10:44:02.512", tone: "good", text: "local risk / policy re-checked (portal cannot bypass)" },
    outcome === "VERIFIED"
      ? { at: "10:44:02.688", tone: "good", text: "change applied · audit row written · terminal state" }
      : { at: "10:44:02.688", tone: "warn", text: "1 of 2 sub-intents timed out" },
  ];
}

export const CLI_DEMO = {
  planId: "cmd_9f12",
  operationId: "op_1251",
  operationHref: "/execution/operations?operation=op_1251",
  stepUpAt: "10:43:58Z",
  stepUpTtl: "45s",
  /** ms per streamed transcript line / per preflight step in the demo. */
  streamLineMs: 110,
  preflightStepMs: 650,
  watchSeconds: 10,
} as const;

export const CLI_SMOKE_NOTE =
  "! SMOKE DATA — WF 1i interaction demo: catalog, parameters, transcripts, preflight, grant and verify frames are declared fixtures until BR-EX-68; catalogue rev 2 publishes relay DISABLED and portal_reachable=false for every command, so nothing here reaches a cell.";
