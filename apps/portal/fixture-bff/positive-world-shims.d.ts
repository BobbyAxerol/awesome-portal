/** Types for Codex's plain-JS fixture producers (packages/contracts/tooling/*.mjs), which have no declaration files. WP-P. */
declare module "*execution-manager-positive-series-fixtures.mjs" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function buildPositiveManagerSeries(input: { lane: "FIXTURE_LAB"; nav: any; pointCount?: number }): Record<"NAV" | "NET_PNL" | "RETURN" | "DRAWDOWN", any>;
}
declare module "*execution-manager-positive-world.mjs" {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  export interface PositiveTuple { alpha_id: string; alpha_version_id: string; portfolio_id: string; deployment_id: string; account_id: string }
  export interface PositiveWorld {
    kind: string;
    workspace_id: string;
    profiles: Record<string, string>;
    tuples: PositiveTuple[];
    strategy_pairs: { strategy_id: string; alpha_id: string }[];
    bindings: { binding_id: string; account_id: string }[];
    researcher: { own_alpha_ids: string[]; member_portfolio_ids: string[] };
    relations: Record<"paper" | "sandbox" | "live", {
      strategies: any[]; portfolios: any[]; venue_accounts: any[];
      portfolio_allocations: { portfolio_id: string; alpha_id: string; currency: string; allocated_capital: string }[];
      account_balances: { account_id: string; currency: string; total: string; free: string; locked: string }[];
      positions_v2: { position_id: string; strategy_id: string; account_id: string; realized_pnl: string; unrealized_pnl: string; notional: string }[];
    }>;
  }
  export function positiveManagerWorld(): PositiveWorld;
}
