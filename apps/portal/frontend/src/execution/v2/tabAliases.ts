/**
 * Legacy `?tab=` labels to V2 tab keys (review2/07 s2).
 *
 * V1 URLs carry display labels (`Insight+Charts`, `Structure+%26+Correlation`)
 * and `useParamState` silently falls back for a value it does not know, so a
 * renamed tab would open the wrong tab with no word. This resolves before any
 * of that: a known label is mapped, a V2 key passes through, anything else gets
 * the default tab and a notice.
 */

export type TabSurface = "alpha" | "portfolio" | "paper";

export interface TabTarget {
  tab: string;
  /** Anchor inside the tab, without `#`. */
  hash: string | null;
  /** Extra params the old tab implied, e.g. `type=audit`. */
  params: Readonly<Record<string, string>>;
}

interface Alias {
  tab: string;
  hash?: string;
  params?: Readonly<Record<string, string>>;
}

interface Surface {
  default: string;
  keys: readonly string[];
  /** Keys are normalised V1 labels (lower-case, single spaces). */
  legacy: Readonly<Record<string, Alias>>;
}

const SURFACES: Readonly<Record<TabSurface, Surface>> = {
  alpha: {
    default: "performance",
    keys: ["performance", "deployments", "evidence", "regime", "orders", "activity", "positions", "replay", "reconciliation"],
    legacy: {
      overview: { tab: "performance" },
      "insight charts": { tab: "performance", hash: "charts" },
      "trade replay": { tab: "replay" },
      positions: { tab: "positions" },
      "orders & fills": { tab: "orders" },
      risk: { tab: "positions", hash: "risk" },
      sessions: { tab: "activity", params: { type: "session" } },
      accounting: { tab: "performance", hash: "costs" },
      reconciliation: { tab: "reconciliation" },
      audit: { tab: "activity", params: { type: "audit" } },
    },
  },
  portfolio: {
    default: "overview",
    keys: ["overview", "allocations", "alphas", "accounts", "risk", "people", "approvals", "incidents"],
    legacy: {
      overview: { tab: "overview" },
      "structure & correlation": { tab: "risk" },
      "capital ledger": { tab: "allocations", hash: "ledger" },
      approvals: { tab: "approvals" },
      incidents: { tab: "incidents" },
      audit: { tab: "people", params: { type: "audit" } },
    },
  },
  paper: {
    // V1 opened Orders on a bare URL; V2 opens Overview (decision 4).
    default: "overview",
    keys: ["overview", "orders", "fills", "positions", "sessions"],
    legacy: {
      overview: { tab: "overview" },
      positions: { tab: "positions" },
      orders: { tab: "orders" },
      fills: { tab: "fills" },
      sessions: { tab: "sessions" },
      accounting: { tab: "overview", hash: "accounting" },
      evidence: { tab: "overview", hash: "evidence" },
    },
  },
};

export interface TabResolution {
  target: TabTarget;
  /** The URL text differs from the canonical form (V1 label, odd case) and should be rewritten. */
  legacy: boolean;
  /** One line to show when the value matched nothing; null otherwise. */
  notice: string | null;
}

function decode(raw: string): string {
  const spaced = raw.replace(/\+/g, " ");
  try {
    return decodeURIComponent(spaced);
  } catch {
    return spaced;
  }
}

/** `+`, `%20` and `%26` all land on the same label whether or not the router already decoded them. */
function normalise(raw: string): string {
  return decode(raw).trim().replace(/\s+/g, " ").replace(/ ?& ?/g, " & ").toLowerCase();
}

export function resolveTab(surface: TabSurface, raw: string | null): TabResolution {
  const def = SURFACES[surface];
  const fallback: TabTarget = { tab: def.default, hash: null, params: {} };
  if (raw === null || raw.trim() === "") return { target: fallback, legacy: false, notice: null };

  const label = normalise(raw);
  const alias = Object.hasOwn(def.legacy, label) ? def.legacy[label] : undefined;
  if (alias) {
    const rewrite = decode(raw).trim() !== alias.tab || alias.hash !== undefined || alias.params !== undefined;
    return { target: { tab: alias.tab, hash: alias.hash ?? null, params: alias.params ?? {} }, legacy: rewrite, notice: null };
  }
  if (def.keys.includes(label)) {
    return { target: { tab: label, hash: null, params: {} }, legacy: decode(raw).trim() !== label, notice: null };
  }
  return { target: fallback, legacy: false, notice: `Tab "${decode(raw).trim()}" is not available. Showing ${def.default}.` };
}

/**
 * Writes a resolved tab into the URL: the default tab stays out of `search`
 * (defaults are never serialised), other params are kept.
 */
export function applyTab(
  surface: TabSurface,
  search: URLSearchParams,
  resolution: TabResolution,
): { search: URLSearchParams; hash: string } {
  const next = new URLSearchParams(search);
  const { target } = resolution;
  if (target.tab === SURFACES[surface].default) next.delete("tab");
  else next.set("tab", target.tab);
  for (const [key, value] of Object.entries(target.params)) next.set(key, value);
  return { search: next, hash: target.hash === null ? "" : `#${target.hash}` };
}
