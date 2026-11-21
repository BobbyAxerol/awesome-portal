/**
 * Screen 02 · the run types an Alpha offers, read from the setup of each of its ACTIVE versions for the SAME dataset, symbol and timeframe.
 *
 * The registry names versions, not what they run: one Alpha can carry a notional edition, a percent-equity edition and native bracket /
 * reactive / event-driven editions side by side, and "the newest ACTIVE version" is not the one the person wants. Each version's setup says,
 * through its enabled profiles, which route it runs. One GET per sibling (cached for a minute per context), only while the Walk-forward
 * step is open; a version with no enabled recipe for this context is not a run type (it is shown only when it is the one in use).
 */

import { useEffect, useMemo, useState } from "react";

import type { RegistryEntry } from "./alphaImportClient";
import { getRunSetupOptions, type SetupOptions, type SetupQuery } from "./setupClient";
import { routeWord } from "./nativeFacts";

export interface RunType {
  versionId: string;
  versionLabel: string;
  routes: readonly string[];
  recipes: number;
  /** The words on the chip: the route family, plus the version label when two versions share a route. */
  label: string;
}

const ROUTE_ORDER = ["signal_notional", "pct_equity", "intrabar_bracket", "reactive", "event_driven"];
const TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: { routes: readonly string[]; recipes: number } | "absent" }>();

export function resetRunTypeCache(): void {
  cache.clear();
}

function keyOf(query: SetupQuery): string {
  return JSON.stringify([query.workspaceId ?? "", query.alphaId, query.alphaVersionId, query.datasetId, query.symbol, query.timeframe]);
}

export function runTypesFrom(
  probed: ReadonlyMap<string, { routes: readonly string[]; recipes: number }>,
  entries: readonly RegistryEntry[],
  current: string,
): readonly RunType[] {
  const rows = entries
    .filter((entry) => probed.has(entry.alpha_version_id) && (probed.get(entry.alpha_version_id)!.recipes > 0 || entry.alpha_version_id === current))
    .map((entry) => ({ entry, ...probed.get(entry.alpha_version_id)! }));
  const byRoute = new Map<string, number>();
  for (const row of rows) for (const route of row.routes) byRoute.set(route, (byRoute.get(route) ?? 0) + 1);
  const rank = (routes: readonly string[]) => Math.min(...routes.map((route) => (ROUTE_ORDER.indexOf(route) === -1 ? ROUTE_ORDER.length : ROUTE_ORDER.indexOf(route))), ROUTE_ORDER.length);
  return rows
    .map(({ entry, routes, recipes }) => {
      const family = routes.length === 0 ? "No recipe" : routes.map(routeWord).join(" + ");
      const shared = routes.some((route) => (byRoute.get(route) ?? 0) > 1);
      return { versionId: entry.alpha_version_id, versionLabel: entry.version_label, routes, recipes, label: shared ? `${family} · ${entry.version_label.replace(/^av_/, "").replace(/_/g, ".")}` : family, order: rank(routes), registered: entry.registered_at_utc_ms };
    })
    .sort((a, b) => a.order - b.order || b.registered - a.registered)
    .map(({ order: _order, registered: _registered, ...type }) => type);
}

export function useRunTypes(
  enabled: boolean,
  entries: readonly RegistryEntry[],
  base: SetupQuery | null,
  /** The setup already read for the version in use: it is not asked for a second time. */
  known: { versionId: string; options: SetupOptions | null } | null = null,
  get: typeof getRunSetupOptions = getRunSetupOptions,
): { status: "idle" | "pending" | "ready"; versionsAsked: number; probed: ReadonlyMap<string, { routes: readonly string[]; recipes: number }> } {
  const [fetched, setProbed] = useState<ReadonlyMap<string, { routes: readonly string[]; recipes: number }>>(new Map());
  const [pending, setPending] = useState(false);
  const siblings = useMemo(
    () => (base === null ? [] : entries.filter((entry) => entry.alpha_id === base.alphaId && entry.lifecycle_state === "ACTIVE")),
    [entries, base],
  );
  /* The version in use is read once, by the setup the screen already holds. */
  const toFetch = useMemo(() => siblings.filter((entry) => !(known !== null && known.versionId === entry.alpha_version_id && known.options !== null)), [siblings, known]);
  const contextKey = base === null ? null : JSON.stringify([base.workspaceId ?? "", base.alphaId, base.datasetId, base.symbol, base.timeframe, toFetch.map((entry) => entry.alpha_version_id)]);

  useEffect(() => {
    if (!enabled || base === null || siblings.length < 2) {
      setProbed(new Map());
      return;
    }
    const controller = new AbortController();
    setPending(true);
    const now = Date.now();
    Promise.all(
      toFetch.map(async (entry) => {
        const query: SetupQuery = { ...base, alphaVersionId: entry.alpha_version_id };
        const key = keyOf(query);
        const hit = cache.get(key);
        if (hit && now - hit.at < TTL_MS) return [entry.alpha_version_id, hit.value] as const;
        try {
          const result = await get(query, controller.signal);
          if (result.state !== "served") {
            cache.set(key, { at: Date.now(), value: "absent" });
            return [entry.alpha_version_id, "absent"] as const;
          }
          const enabledProfiles = result.body.profiles.filter((profile) => profile.state === "ENABLED");
          const value = { routes: [...new Set(enabledProfiles.map((profile) => profile.execution_route))], recipes: enabledProfiles.length };
          cache.set(key, { at: Date.now(), value });
          return [entry.alpha_version_id, value] as const;
        } catch {
          return [entry.alpha_version_id, "absent"] as const;
        }
      }),
    ).then((rows) => {
      if (controller.signal.aborted) return;
      setProbed(new Map(rows.filter((row): row is readonly [string, { routes: readonly string[]; recipes: number }] => row[1] !== "absent")));
      setPending(false);
    });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, contextKey]);

  const probed = useMemo(() => {
    const all = new Map(fetched);
    if (known !== null && known.options !== null) {
      const on = known.options.profiles.filter((profile) => profile.state === "ENABLED");
      all.set(known.versionId, { routes: [...new Set(on.map((profile) => profile.execution_route))], recipes: on.length });
    }
    return all;
  }, [fetched, known]);
  return { status: !enabled || siblings.length < 2 ? "idle" : pending ? "pending" : "ready", versionsAsked: siblings.length, probed };
}
