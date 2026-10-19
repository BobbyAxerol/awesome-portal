/**
 * Where a link on these screens goes. The defaults are the registry's
 * canonical routes (`/deployments/...`, review2/07 s1); the integrator passes
 * a different set only if a route moves. A screen never builds a path inline.
 */
export interface PortfolioRoutes {
  list: string;
  portfolio(portfolioId: string): string;
  /**
   * Where Compare lives, or `null` when this build does not mount it (its flag is off): then no screen draws a
   * link to it, only a disabled control that says so (M2).
   */
  compare: string | null;
  alpha(alphaId: string): string;
  fleet: string;
  account(accountId: string): string;
  /** The workbench its stage owns: paper, sandbox or live. */
  deployment(deploymentId: string, stage: string): string;
  approvals: string;
  operations: string;
  access: string;
}

const enc = encodeURIComponent;

export const DEFAULT_ROUTES: PortfolioRoutes = {
  list: "/deployments/portfolios",
  portfolio: (id) => `/deployments/portfolios/${enc(id)}`,
  // Compare has no registry row yet (rev 7 is Codex's, DEBT-UXM07-006): it rides the portfolios route as ?view=compare,
  // which is the only URL the app mounts it on. A path that carries its own query is joined with `joinQuery`.
  compare: "/deployments/portfolios?view=compare",
  alpha: (id) => `/deployments/alphas/${enc(id)}`,
  fleet: "/deployments/alphas",
  account: (id) => `/deployments/accounts/${enc(id)}`,
  deployment: (id, stage) => {
    switch (stage.toUpperCase()) {
      case "SANDBOX": return `/deployments/sandbox/${enc(id)}`;
      // D5 (S3 plan): Canary has its own control room under the Live route.
      case "CANARY": return `/deployments/live/${enc(id)}/canary`;
      case "LIVE": return `/deployments/live/${enc(id)}`;
      default: return `/deployments/paper/${enc(id)}`;
    }
  },
  approvals: "/governance/approvals",
  operations: "/execution/operations",
  access: "/administration/profile-access",
};

/** Why Compare is off when `routes.compare` is null; the sentence on the disabled control. */
export const COMPARE_OFF_REASON = "Compare is not enabled on this build";

/** `from` values these screens write and read; anything else goes back to the list. */
export const FROM_LIST = "portfolios";
export const FROM_PORTFOLIO_PREFIX = "portfolio:";

/** Append `query` (no leading ? or &) to a route that may already carry a query string. */
export function joinQuery(route: string, query: string): string {
  return `${route}${route.includes("?") ? "&" : "?"}${query}`;
}
