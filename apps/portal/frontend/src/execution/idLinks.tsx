/**
 * Where an identifier goes when you click it.
 *
 * The reviewed blotter states the rule in its own footer — "every id
 * navigates" — and the product screens kept only half of it: a deployment id
 * was a link, while the account and portfolio ids printed beside it were plain
 * text. That asymmetry is the expensive kind. An operator reading a halted
 * deployment wants the account it trades through, and a row that names the
 * account without reaching it makes them go to the register and search for a
 * string they are already looking at.
 *
 * One table, so a route rename moves every link at once rather than leaving
 * some screens pointing at a path that no longer resolves.
 */
import type { ReactNode } from "react";

/** The registry's own routes for the four addressable subjects. */
export const ID_ROUTES = {
  deploymentPaper: (id: string) => `/deployments/paper/${encodeURIComponent(id)}`,
  deploymentSandbox: (id: string) => `/deployments/sandbox/${encodeURIComponent(id)}`,
  deploymentLive: (id: string) => `/deployments/live/${encodeURIComponent(id)}`,
  account: (id: string) => `/deployments/accounts/${encodeURIComponent(id)}`,
  portfolio: (id: string) => `/deployments/portfolios/${encodeURIComponent(id)}`,
  alpha: (id: string) => `/deployments/alphas/${encodeURIComponent(id)}`,
} as const;

/**
 * An id drawn as a link, or the source's own absence sentence drawn plain.
 *
 * `absent` is a sentence, not a dash: "account not published" says which fact
 * is missing, where "—" leaves the reader to guess whether the account is
 * absent, unpublished, or simply not applicable here.
 */
export function IdLink({
  id,
  href,
  absent,
}: {
  id: string | null | undefined;
  href: (id: string) => string;
  absent: string;
}): ReactNode {
  if (typeof id !== "string" || id.length === 0) {
    return <span className="exec-gate-unverified">{absent}</span>;
  }
  return <a href={href(id)}>{id}</a>;
}

/**
 * Where an operation's or an incident's target goes.
 *
 * The contract publishes six kinds — ACCOUNT, BROKER_BINDING, DEPLOYMENT,
 * ORDER, PORTFOLIO, SYSTEM — and the queue routed by sniffing the id for an
 * `acct-` prefix instead. Prefix-sniffing is inference: it links the ids that
 * happen to be named a certain way, silently drops the ones that are not, and
 * breaks the day the source renames anything. The published `type` is the
 * answer the source already gave.
 *
 * `null` where the Portal genuinely has nowhere to send the reader: SYSTEM is
 * not a subject, an ORDER has no per-order route, and a DEPLOYMENT is only
 * addressable once the environment says which of the three books it lives in.
 * A link to a route that does not resolve is worse than plain text.
 */
export function targetHrefFor(
  type: string | null | undefined,
  id: string | null | undefined,
  environment?: string | null,
): string | null {
  if (typeof id !== "string" || id.length === 0) return null;
  switch ((type ?? "").toUpperCase()) {
    case "ACCOUNT": return ID_ROUTES.account(id);
    case "BROKER_BINDING": return `/deployments/accounts?binding=${encodeURIComponent(id)}`;
    case "PORTFOLIO": return ID_ROUTES.portfolio(id);
    case "DEPLOYMENT":
      switch ((environment ?? "").toUpperCase()) {
        case "PAPER": return ID_ROUTES.deploymentPaper(id);
        case "SANDBOX": return ID_ROUTES.deploymentSandbox(id);
        case "LIVE": return ID_ROUTES.deploymentLive(id);
        default: return null;
      }
    default: return null;
  }
}
