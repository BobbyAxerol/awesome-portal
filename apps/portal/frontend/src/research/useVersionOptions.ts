/**
 * Screen 02 · what each version of an Alpha can bind to, read from `GET /api/v1/research/runs/version-options` before any dataset is chosen.
 *
 * One small read per ACTIVE version of the chosen Alpha (no dataset, no index, no bars), cached for a minute and aborted when the Alpha or
 * workspace changes. It discloses routes and timeframes early ("this version runs Bracket on 1h"); it never authorizes a run: the
 * dataset-bound setup and the fresh preflight stay the authority. `absent` means an older server without the route.
 */

import { useEffect, useMemo, useState } from "react";

import type { RegistryEntry } from "./alphaImportClient";
import { getVersionOptions, type VersionOptions } from "./setupClient";

export type VersionRoutes = { routes: readonly string[]; recipes: number };

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: VersionOptions }>();

export function resetVersionOptionsCache(): void {
  cache.clear();
}

/** The routes a version binds on `timeframe` (any timeframe when null), and how many exact recipes it names for them. */
export function compatibleRoutes(options: VersionOptions, timeframe: string | null): VersionRoutes {
  const open = options.routes.filter((route) => route.state === "COMPATIBLE" && (timeframe === null || route.compatible_timeframes.includes(timeframe)));
  return { routes: open.map((route) => route.execution_route), recipes: open.reduce((sum, route) => sum + route.compatible_recipe_keys.length, 0) };
}

export function useVersionOptions(
  enabled: boolean,
  entries: readonly RegistryEntry[],
  scope: { workspaceId?: string; alphaId: string } | null,
  get: typeof getVersionOptions = getVersionOptions,
): { status: "idle" | "pending" | "ready" | "absent"; byVersion: ReadonlyMap<string, VersionOptions> } {
  const [byVersion, setByVersion] = useState<ReadonlyMap<string, VersionOptions>>(new Map());
  const [status, setStatus] = useState<"idle" | "pending" | "ready" | "absent">("idle");
  const siblings = useMemo(
    () => (scope === null || scope.alphaId === "" ? [] : entries.filter((entry) => entry.alpha_id === scope.alphaId && entry.lifecycle_state === "ACTIVE")),
    [entries, scope],
  );
  const scopeKey = scope === null ? null : JSON.stringify([scope.workspaceId ?? "", scope.alphaId, siblings.map((entry) => entry.alpha_version_id)]);

  useEffect(() => {
    if (!enabled || scope === null || siblings.length === 0) {
      setByVersion(new Map());
      setStatus("idle");
      return;
    }
    const controller = new AbortController();
    setStatus("pending");
    const now = Date.now();
    Promise.all(
      siblings.map(async (entry) => {
        const key = JSON.stringify([scope.workspaceId ?? "", scope.alphaId, entry.alpha_version_id]);
        const hit = cache.get(key);
        if (hit && now - hit.at < TTL_MS) return { id: entry.alpha_version_id, result: "served" as const, value: hit.value };
        try {
          const result = await get({ workspaceId: scope.workspaceId, alphaId: scope.alphaId, alphaVersionId: entry.alpha_version_id }, controller.signal);
          if (result.state === "served") {
            cache.set(key, { at: Date.now(), value: result.body });
            return { id: entry.alpha_version_id, result: "served" as const, value: result.body };
          }
          return { id: entry.alpha_version_id, result: result.state === "absent" ? ("absent" as const) : ("failed" as const) };
        } catch {
          return { id: entry.alpha_version_id, result: "failed" as const };
        }
      }),
    ).then((rows) => {
      if (controller.signal.aborted) return;
      const served = rows.flatMap((row) => (row.result === "served" ? ([[row.id, row.value]] as const) : []));
      setByVersion(new Map(served));
      /* Absent = the server has no such route (every answer says so): the caller falls back to reading each version's setup. */
      setStatus(served.length === 0 && rows.every((row) => row.result === "absent") ? "absent" : "ready");
    });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, scopeKey]);

  return { status, byVersion };
}
