/**
 * Where a link on these screens goes. The defaults are the registry's
 * canonical routes (`/deployments/...`, review2/07 s1); the integrator passes
 * a different set only if a route moves. A screen never builds a path inline.
 */
export interface PortfolioRoutes {
  list: string;
  portfolio(portfolioId: string): string;
  compare: string;
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
  compare: "/deployments/compare",
  alpha: (id) => `/deployments/alphas/${enc(id)}`,
  fleet: "/deployments/alphas",
  account: (id) => `/deployments/accounts/${enc(id)}`,
  deployment: (id, stage) => {
    switch (stage.toUpperCase()) {
      case "SANDBOX": return `/deployments/sandbox/${enc(id)}`;
      case "LIVE": case "CANARY": return `/deployments/live/${enc(id)}`;
      default: return `/deployments/paper/${enc(id)}`;
    }
  },
  approvals: "/governance/approvals",
  operations: "/execution/operations",
  access: "/administration/profile-access",
};

/** `from` values these screens write and read; anything else goes back to the list. */
export const FROM_LIST = "portfolios";
export const FROM_PORTFOLIO_PREFIX = "portfolio:";
