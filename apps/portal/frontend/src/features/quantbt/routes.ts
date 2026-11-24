/**
 * QuantBT route adaptation — U04.
 *
 * Canonical form puts the run identity in the path:
 *
 *   /research/quantbt/runs/:runId/overview
 *
 * The legacy form carried it in the query (`/overview?run=…`). Both resolve to
 * the same run for the whole compatibility window; the registry stays
 * authoritative for WHICH legacy paths exist and this module owns HOW each one
 * translates. `navigation.test.ts` fails if the registry declares a legacy
 * route this module cannot handle.
 */

/** Canonical module root. */
export const QUANTBT_ROOT = "/research/quantbt";

/** Result tabs, in flow order (v0.4 §P0.9). */
export const QUANTBT_TABS = ["overview", "optimization", "parameters", "execution", "audit"] as const;

export type QuantBTTab = (typeof QUANTBT_TABS)[number];

export function isQuantBTTab(value: string): value is QuantBTTab {
  return (QUANTBT_TABS as readonly string[]).includes(value);
}

/** Canonical path for a tab of a known run. */
export function runTabPath(runId: string, tab: QuantBTTab): string {
  return `${QUANTBT_ROOT}/runs/${encodeURIComponent(runId)}/${tab}`;
}

/** Canonical path for the run workspace root (resolves to overview). */
export function runPath(runId: string): string {
  return `${QUANTBT_ROOT}/runs/${encodeURIComponent(runId)}`;
}

/**
 * A producer run never lives in the legacy /api/runs store. Its bare and
 * old Overview bookmarks open the existing Research Evidence hub instead.
 * This is URL routing only, not proof of existence or permission: the hub
 * still reads its named contract with the exact run and workspace.
 */
export function producerOverviewTarget(pathname: string, search = ""): string | null {
  const match = /^\/research\/quantbt\/runs\/([^/]+)(?:\/overview)?\/?$/.exec(pathname);
  let id: string | null = null;
  try {
    if (match) id = decodeURIComponent(match[1]);
    else if (/^\/research\/quantbt\/overview\/?$/.test(pathname)) id = new URLSearchParams(search).get("run");
  } catch {
    return null;
  }
  // The published Research run identity grammar; no fallback after a failed read.
  return id && /^rrun_[a-f0-9]{32}$/.test(id) ? `${runPath(id)}/evidence` : null;
}

/**
 * Translates a legacy QuantBT location to its canonical equivalent.
 *
 * - `/overview?run=abc`   -> `/research/quantbt/runs/abc/overview`
 * - `/overview`           -> `/research/quantbt/overview` (module resolves the
 *                            default run exactly as the standalone app did)
 * - `/runs`               -> `/research/quantbt/runs`
 * - `/?new=1`             -> `/research/quantbt/runs/new`
 *
 * Returns `null` when the location is not a QuantBT legacy route.
 */
export function canonicalQuantBTPath(pathname: string, search = ""): string | null {
  const normalised = pathname.replace(/\/+$/, "") || "/";
  const query = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const runId = query.get("run");

  if (normalised === "/" ) {
    return query.get("new") === "1" ? `${QUANTBT_ROOT}/runs/new` : null;
  }

  if (normalised === "/runs") return `${QUANTBT_ROOT}/runs`;

  const tab = normalised.slice(1);
  if (!isQuantBTTab(tab)) return null;

  // Preserve any query keys other than `run`, which is now carried by the path.
  query.delete("run");
  const rest = query.toString();
  const suffix = rest ? `?${rest}` : "";

  return runId ? `${runTabPath(runId, tab)}${suffix}` : `${QUANTBT_ROOT}/${tab}${suffix}`;
}
