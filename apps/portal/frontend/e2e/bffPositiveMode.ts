/**
 * WP-P: the switch the fixture BFF flips when the selected scenario is the positive world (positive, zero, dense, denied, empty).
 * Module state like the doubles' variants: OFF by default, so every Playwright spec and unit test sees the doubles exactly as before; only
 * `fixture-bff/app.ts` turns it on. The doubles read it at the few places where a deliberate degradation (a stale sync, an expired credential,
 * a breached headroom, an empty account) used to be the default; with it on they answer the complete, reconciled story instead.
 *
 * `books` is how the account double learns the SAME deployment books the Manager dataset serves (allocation, realized, unrealized per
 * deployment), so an account's balance is allocation + net PnL of the deployments booked on it. The provider is the fixture BFF's; the doubles
 * never import the BFF.
 */
export interface PositiveDeploymentBook {
  deployment_id: string;
  alpha_id: string;
  alpha_label: string;
  portfolio_id: string;
  portfolio_name: string;
  environment: "paper" | "sandbox" | "live";
  stage: string;
  currency: string;
  allocation: string;
  realized: string;
  unrealized: string;
}

export interface PositiveAccountBook {
  account_id: string;
  deployments: PositiveDeploymentBook[];
}

/** The deployments booked in one portfolio, every environment: what the Portfolios list prints as its allocation, deployment count and environments. */
export interface PositivePortfolioBook {
  portfolio_id: string;
  deployments: PositiveDeploymentBook[];
}

/** What the world knows about one deployment id: the stage it is in and whose it is (the stage screens' lifecycle record and identity keys). */
export interface PositiveDeploymentFact {
  stage: "paper" | "sandbox" | "canary" | "live";
  alphaId: string;
  alphaName: string;
  portfolioId: string;
  portfolioName: string;
}
let deploymentFacts: ((deploymentId: string) => PositiveDeploymentFact | null) | null = null;
export const positiveDeploymentFact = (deploymentId: string): PositiveDeploymentFact | null => (positive && deploymentFacts !== null ? deploymentFacts(deploymentId) : null);

let positive = false;
let books: ((accountId: string) => PositiveAccountBook | null) | null = null;
let portfolioBooks: ((portfolioId: string) => PositivePortfolioBook | null) | null = null;

export const setPositiveMode = (on: boolean, provider: ((accountId: string) => PositiveAccountBook | null) | null = null,
  portfolioProvider: ((portfolioId: string) => PositivePortfolioBook | null) | null = null,
  facts: ((deploymentId: string) => PositiveDeploymentFact | null) | null = null): void => {
  positive = on;
  deploymentFacts = on ? facts : null;
  books = on ? provider : null;
  portfolioBooks = on ? portfolioProvider : null;
};
export const positivePortfolioBookOf = (portfolioId: string): PositivePortfolioBook | null => (positive && portfolioBooks !== null ? portfolioBooks(portfolioId) : null);
export const isPositiveMode = (): boolean => positive;
export const positiveBookOf = (accountId: string): PositiveAccountBook | null => (positive && books !== null ? books(accountId) : null);
