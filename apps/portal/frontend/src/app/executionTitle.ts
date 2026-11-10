/**
 * The browser tab title of an Execution screen (UI review F1 / D10).
 *
 * ONE rule: `<screen name> · <subject, when the address names one> · Quant Ecosystem Portal`.
 *
 * The screen name comes from the ROUTE, not from the registry feature that owns the route's prefix: a feature groups several
 * screens (Alpha 360 and Trade Replay both sit under "Alpha Fleet", Canary and Live under "Live Operations"), so a title derived
 * from the feature named the wrong screen. The table below mirrors the registry's screen routes (`registry.public.json`, a test
 * walks every Execution screen route and fails when one has no name here) plus the session screens that no feature owns (Users,
 * the scoped slice, the command story).
 *
 * Pure and registry-free, so the shell can set the title on the first render, before the registry has loaded; the tab never shows
 * the product the document was served with ("QuantBT Backtest Portal") on an Execution screen.
 */

import { useLayoutEffect } from "react";

import { EXECUTION_V2_SHELL } from "../execution/v2/flags";

export const PORTAL_TITLE_SUFFIX = "Quant Ecosystem Portal";

interface RouteTitle {
  /** `:param` segments match any one segment; the first param's value is the subject. */
  pattern: string;
  name: string;
  /** A name for the same route when the query selects another screen (`?tab=replay` is Trade Replay, not Alpha 360). */
  whenTab?: { tab: string; name: string };
}

/** Exact-segment routes only: a path that matches none of them is not an Execution screen and keeps the title it has. */
const ROUTES: readonly RouteTitle[] = [
  { pattern: "/execution", name: "Overview" },
  { pattern: "/execution/operations", name: "Operations" },
  { pattern: "/execution/operations/incidents/:incidentId", name: "Incident" },
  { pattern: "/execution/slice", name: "Scoped slice" },
  { pattern: "/execution/command", name: "Command" },
  { pattern: "/governance/approvals", name: "Approvals" },
  { pattern: "/governance/approvals/new", name: "New request" },
  { pattern: "/governance/approvals/:approvalId/r1", name: "R1 review" },
  { pattern: "/governance/approvals/:approvalId/r2", name: "R2 review" },
  { pattern: "/governance/approvals/:approvalId/live", name: "Live review" },
  { pattern: "/governance/waivers", name: "Waivers" },
  { pattern: "/governance/exit-reviews", name: "Exit reviews" },
  { pattern: "/governance/exit-reviews/:reviewId", name: "Exit review" },
  { pattern: "/deployments/paper", name: "Paper trading" },
  { pattern: "/deployments/paper/:deploymentId", name: "Paper workbench" },
  { pattern: "/deployments/paper/:deploymentId/vn-market", name: "Paper workbench" },
  { pattern: "/deployments/sandbox", name: "Sandbox" },
  { pattern: "/deployments/sandbox/:deploymentId", name: "Sandbox certification" },
  { pattern: "/deployments/live", name: "Live operations" },
  { pattern: "/deployments/live/:deploymentId", name: "Live" },
  { pattern: "/deployments/live/:deploymentId/canary", name: "Canary" },
  { pattern: "/deployments/blotter", name: "Blotter" },
  { pattern: "/deployments/alphas", name: "Alpha Fleet" },
  { pattern: "/deployments/alphas/archived", name: "Alpha Fleet" },
  { pattern: "/deployments/alphas/:alphaId", name: "Alpha 360", whenTab: { tab: "replay", name: "Trade Replay" } },
  { pattern: "/deployments/alphas/:alphaId/replay", name: "Trade Replay" },
  { pattern: "/deployments/portfolios", name: "Portfolios" },
  { pattern: "/deployments/portfolios/:portfolioId", name: "Portfolio 360" },
  { pattern: "/deployments/compare", name: "Compare" },
  { pattern: "/deployments/accounts", name: "Accounts" },
  { pattern: "/deployments/accounts/:accountId", name: "Account 360" },
  { pattern: "/administration/actions", name: "Admin actions" },
  { pattern: "/administration/users", name: "Users" },
  { pattern: "/administration/profile-access", name: "Profile & Access" },
  { pattern: "/administration/my-access", name: "My access" },
];

const segmentsOf = (path: string): string[] => path.split("/").filter((part) => part !== "");

function decoded(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function match(pattern: string, pathname: string): { subject: string | null } | null {
  const want = segmentsOf(pattern);
  const have = segmentsOf(pathname);
  if (want.length !== have.length) return null;
  let subject: string | null = null;
  for (let i = 0; i < want.length; i += 1) {
    if (want[i]!.startsWith(":")) {
      subject ??= decoded(have[i]!);
    } else if (want[i] !== have[i]) {
      return null;
    }
  }
  return { subject };
}

/** The screen and subject an address names, or `null` for a path that is not an Execution screen. */
export function executionScreenOf(pathname: string, search = ""): { screen: string; subject: string | null } | null {
  for (const route of ROUTES) {
    const hit = match(route.pattern, pathname);
    if (hit === null) continue;
    const tab = route.whenTab !== undefined && new URLSearchParams(search).get("tab") === route.whenTab.tab;
    return { screen: tab ? route.whenTab!.name : route.name, subject: hit.subject };
  }
  return null;
}

/** `<screen> · <subject> · Quant Ecosystem Portal`, or `null` when the path is not an Execution screen (the title is left alone). */
export function executionDocumentTitle(pathname: string, search = ""): string | null {
  const hit = executionScreenOf(pathname, search);
  if (hit === null) return null;
  return [hit.screen, ...(hit.subject === null ? [] : [hit.subject]), PORTAL_TITLE_SUFFIX].join(" · ");
}

/**
 * Sets the tab title of an Execution screen and puts the previous one back on leaving (the Research screens set their own).
 * A layout effect on the shell's first render, so `/execution` never flashes the title the document was served with. Flag off
 * (`shell` not in the manifest), or a path that is not an Execution screen: the title is left alone.
 *
 * Lives in `app/`, not under `execution/v2/`: the shell holds no static import of the V2 tree (PortalShell.v2Gating.test.ts). It
 * reads only the flag module the shell's command routing already reads.
 */
export function useExecutionDocumentTitle(pathname: string, search: string, enabled: boolean = EXECUTION_V2_SHELL): void {
  const title = enabled ? executionDocumentTitle(pathname, search) : null;
  useLayoutEffect(() => {
    if (title === null) return undefined;
    const before = document.title;
    document.title = title;
    return () => {
      document.title = before;
    };
  }, [title]);
}
