/**
 * Admin Action Drawer catalogue — phase 6, Lane A.
 *
 * The hi-fi (WF 1i) draws "21 commands in 6 groups exactly as the CLI guide".
 * This module is that list, and nothing here is invented: every entry is a
 * command that appears in `PORTFOLIO_MANAGEMENT_CLI_GUIDE.md`, and every
 * `reachability`/`tier` value is copied from
 * `extract/cli-command-map.json` — the machine-derived map that CLAUDE.md §0
 * ranks above hand-written prose.
 *
 * WHY THIS FILE IS A FIXTURE AND NOT THE CONTRACT
 *
 * BR-EX-28 asks codex to publish a canonical catalogue in `packages/contracts`.
 * Until it exists, the drawer would otherwise have nothing to render, so this
 * file stands in — deliberately shaped as the schema BR-EX-28 proposes, so the
 * day the contract lands the swap is an adapter, not a rewrite.
 *
 * It is NOT authority. `catalogSource` says so on screen, so nobody mistakes a
 * frontend list for the operator's real permissions.
 */
import type { RiskTier } from "./contracts";

/** Why the Portal cannot reach a command that the CLI can run. */
export type Reachability =
  /** An HTTP route exists in the sanitized OpenAPI for this exact action. */
  | "HTTP"
  /**
   * The CLI reaches it only through direct Postgres or Redis access. Handoff
   * §2.3 forbids the Portal that path, so this is a capability gap, not a
   * convenience gap — the drawer shows it, disabled, with the reason.
   */
  | "DIRECT_DB_ONLY"
  /**
   * The extract attributes an HTTP path to this action's *handler*, but no
   * route in the OpenAPI serves the action itself. Looks reachable, is not.
   */
  | "HANDLER_PATH_ONLY";

export type CommandTag = "READ" | "MUTATION" | "DANGER" | "BLOCKED";

export interface CatalogCommand {
  /** `noun/verb`, the key that will join to the canonical catalogue. */
  readonly id: string;
  readonly title: string;
  readonly tag: CommandTag;
  /** What this command touches, shown right-aligned on the row. */
  readonly scope: string;
  /** First CLI line, display-only. The browser never runs a shell. */
  readonly cliShort: string;
  readonly tier: RiskTier;
  readonly reachability: Reachability;
  /** Present exactly when `reachability !== "HTTP"`. Rendered verbatim. */
  readonly blockedReason?: string;
  /** What a read command returns; drives the READ panel. */
  readonly returns?: string;
}

export interface CatalogGroup {
  readonly name: string;
  readonly items: readonly CatalogCommand[];
}

const CLI = "docker compose --profile cli run --rm --no-deps cli";

const REDIS_BLOCKED =
  "Reachable only through direct Redis access from the CLI host. The Portal is " +
  "forbidden that path (handoff §2.3), and opening a generic key reader would " +
  "expose every key in the cell, not this one view.";

const LAB_RESET_BLOCKED =
  "Pre-production lab reset deletes alpha, deployment and ledger rows outright. " +
  "It has no plan/apply/verify path and no audit trail to reverse it, so it is " +
  "not exposed in the Portal at any tier.";

export const ADMIN_CATALOG: readonly CatalogGroup[] = [
  {
    name: "Read & inspect",
    items: [
      {
        id: "health/<root>",
        title: "Gateway health",
        tag: "READ",
        scope: "cell",
        cliShort: `${CLI} health`,
        tier: "R0",
        reachability: "HTTP",
        returns: "Gateway reachability, build digest and dependency states.",
      },
      {
        id: "portfolio/list",
        title: "List portfolios",
        tag: "READ",
        scope: "workspace",
        cliShort: `${CLI} portfolio list`,
        tier: "R0",
        reachability: "HTTP",
        returns: "Every portfolio with its state, base currency and allocated capital.",
      },
      {
        id: "portfolio/state",
        title: "Portfolio state",
        tag: "READ",
        scope: "portfolio",
        cliShort: `${CLI} portfolio state <portfolio_id>`,
        tier: "R0",
        reachability: "HTTP",
        returns: "Lifecycle state, deployments and the capital ledger head.",
      },
      {
        id: "alpha/inspect",
        title: "Inspect alpha",
        tag: "READ",
        scope: "alpha",
        cliShort: `${CLI} alpha inspect <alpha_id>`,
        tier: "R0",
        reachability: "HTTP",
        returns: "Registration record, parameters and the deployments referencing it.",
      },
      {
        id: "capital/history",
        title: "Capital history",
        tag: "READ",
        scope: "portfolio",
        cliShort: `${CLI} capital history <portfolio_id>`,
        tier: "R0",
        reachability: "HTTP",
        returns: "Ledger movements in order, each with actor, reason and resulting balance.",
      },
      {
        id: "redis/trading-state",
        title: "Redis trading state",
        tag: "BLOCKED",
        scope: "cell",
        cliShort: `${CLI} redis trading-state <alpha_id>`,
        tier: "R0",
        reachability: "DIRECT_DB_ONLY",
        blockedReason: REDIS_BLOCKED,
      },
    ],
  },
  {
    name: "Portfolio & capital",
    items: [
      {
        id: "portfolio/create",
        title: "Create portfolio",
        tag: "MUTATION",
        scope: "workspace",
        cliShort: `${CLI} portfolio create --name <name> --currency <ccy>`,
        tier: "R1",
        reachability: "HTTP",
      },
      {
        id: "alpha/register",
        title: "Register alpha",
        tag: "MUTATION",
        scope: "alpha",
        cliShort: `${CLI} alpha register --file <spec.json>`,
        tier: "R1",
        reachability: "HTTP",
      },
      {
        // The extract keys this as `allocation/<root>`: its parser found no
        // sub-command, though the guide documents `allocation alpha`. Joined on
        // the extract's key so the gate below can actually match it, with the
        // discrepancy reported in BR-EX-28 rather than smoothed over here.
        id: "allocation/<root>",
        title: "Allocate capital to alpha",
        tag: "MUTATION",
        scope: "deployment",
        cliShort: `${CLI} allocation alpha <deployment_id> --amount <amount>`,
        tier: "R1",
        reachability: "HTTP",
      },
      {
        id: "config/apply",
        title: "Apply declarative config",
        tag: "MUTATION",
        scope: "portfolio",
        cliShort: `${CLI} config apply --file <portfolio.yaml>`,
        tier: "R1",
        reachability: "HTTP",
      },
    ],
  },
  {
    name: "Deployment & risk",
    items: [
      {
        id: "deployment/state",
        title: "Deployment state",
        tag: "READ",
        scope: "deployment",
        cliShort: `${CLI} deployment state <deployment_id>`,
        tier: "R0",
        reachability: "HTTP",
        returns: "Runtime state, promotion stage, readiness and broker sync — four separate fields.",
      },
      {
        id: "risk/state",
        title: "Risk state",
        tag: "READ",
        scope: "deployment",
        cliShort: `${CLI} risk state <deployment_id>`,
        tier: "R0",
        reachability: "HTTP",
        returns: "Effective limits and which precedence level supplied each one.",
      },
      {
        id: "config/plan",
        title: "Plan declarative config",
        tag: "READ",
        scope: "portfolio",
        cliShort: `${CLI} config plan --file <portfolio.yaml>`,
        tier: "R0",
        reachability: "HTTP",
        returns: "The diff apply would make. Computes nothing on the client.",
      },
    ],
  },
  {
    name: "Account",
    items: [
      {
        id: "account/state",
        title: "Account state",
        tag: "READ",
        scope: "account",
        cliShort: `${CLI} account state <account_id>`,
        tier: "R0",
        reachability: "HTTP",
        returns: "Balances, positions, open orders and the last broker sync.",
      },
      {
        id: "account/policy",
        title: "Account policy",
        tag: "READ",
        scope: "account",
        cliShort: `${CLI} account policy <account_id>`,
        tier: "R0",
        reachability: "HTTP",
        returns: "Position accounting mode, leverage and order policy in force.",
      },
      {
        id: "account/seed-paper",
        title: "Seed paper account",
        tag: "MUTATION",
        scope: "account",
        cliShort: `${CLI} account seed-paper <account_id> --balance <amount>`,
        tier: "R1",
        reachability: "HTTP",
      },
    ],
  },
  {
    name: "Broker sync & reconciliation",
    items: [
      {
        id: "broker/bindings",
        title: "Broker bindings",
        tag: "READ",
        scope: "account",
        cliShort: `${CLI} broker bindings`,
        tier: "R0",
        reachability: "HTTP",
        returns: "Every binding with its venue, credential state and sync age.",
      },
      {
        id: "broker/exposure",
        title: "Broker exposure",
        tag: "READ",
        scope: "venue",
        cliShort: `${CLI} broker exposure <venue>`,
        tier: "R0",
        reachability: "HTTP",
        returns: "Exposure the venue reports. The authoritative number, not a client sum.",
      },
      {
        id: "account/reconcile-positions",
        title: "Reconcile positions",
        tag: "MUTATION",
        scope: "account",
        cliShort: `${CLI} account reconcile-positions <account_id>`,
        tier: "R2",
        reachability: "HTTP",
      },
    ],
  },
  {
    name: "Emergency & destructive",
    items: [
      {
        id: "ops/emergency-close",
        title: "Emergency close",
        tag: "DANGER",
        scope: "deployment",
        cliShort: `${CLI} ops emergency-close <deployment_id> --confirm CLOSE`,
        tier: "R3",
        reachability: "HTTP",
      },
      {
        id: "lab/reset",
        title: "Pre-production lab reset",
        tag: "BLOCKED",
        scope: "cell",
        cliShort: `${CLI} <lab reset procedure, guide §22>`,
        tier: "R4",
        reachability: "DIRECT_DB_ONLY",
        blockedReason: LAB_RESET_BLOCKED,
      },
    ],
  },
];

/**
 * Shown under the catalogue so a fixture is never mistaken for authority.
 * Replaced by the contract's own provenance when BR-EX-28 lands.
 */
export const CATALOG_SOURCE =
  "Fixture catalogue derived from PORTFOLIO_MANAGEMENT_CLI_GUIDE and " +
  "extract/cli-command-map.json. Not the operator's permissions — the canonical " +
  "catalogue (BR-EX-28) has not been published yet.";

export function catalogCount(groups: readonly CatalogGroup[] = ADMIN_CATALOG): number {
  return groups.reduce((n, g) => n + g.items.length, 0);
}

export function findCommand(id: string, groups: readonly CatalogGroup[] = ADMIN_CATALOG) {
  for (const g of groups) {
    const hit = g.items.find((i) => i.id === id);
    if (hit) return hit;
  }
  return null;
}
