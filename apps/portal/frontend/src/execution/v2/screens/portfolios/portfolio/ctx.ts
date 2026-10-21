/** What every tab of Portfolio 360 receives: the answers already read, and the links to build. */
import type { ProfileEnvelope } from "../../../../api/profileRead";
import type { PortfolioRoutes } from "../routes";
import type { AccountView, DeploymentView, Environment, Identity } from "./model";
import type { PortfolioReads } from "./use360";

export interface TabCtx {
  portfolioId: string;
  identity: Identity;
  resource: ProfileEnvelope;
  deployments: readonly DeploymentView[];
  accounts: readonly AccountView[];
  /** Environments the portfolio has a book in, live first. */
  environments: readonly Environment[];
  routes: PortfolioRoutes;
  /** The page's query string; every internal link carries its context params. */
  search: URLSearchParams;
  reads: PortfolioReads;
  window: string;
  /** Whether the session may see accounts (`nav:EXECUTION_ACCOUNTS_BINDINGS` (menu token)); links to them are off without it. */
  mayOpenAccounts: boolean;
}
