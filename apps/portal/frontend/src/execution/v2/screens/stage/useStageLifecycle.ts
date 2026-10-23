/**
 * The lifecycle history a stage screen's spine prints (R1, R2, Paper, Sandbox, Canary ticks), read from the Manager DATASET of the
 * deployment's alpha through the same port the real Edge answers (`getManagerDataset`, ALPHA surface): the open `life_*` partition
 * keys WP-C already reads for Alpha 360 (`alpha/lifecycleModel.ts`, FIXTURE_LAB, register 2c-wpc).
 *
 * A stage is `done` only when the dataset published its exit instant; a dataset that carries no lifecycle key (the real Edge today,
 * FE-027/028) leaves the spine as it was: the current stage marked and nothing guessed. The read is asked once the alpha is known (the
 * identity keys of the body, FE-066) and only when the port can answer it: a port without the method (a screen's unit test) is `idle`.
 * Nothing here is computed: no day, no criterion and no instant is derived.
 */
import { useEffect, useMemo, useState } from "react";

import type { ExecutionApi } from "../../../api/ports";
import type { SpineStageId } from "../../blocks";
import type { ExecEnv } from "../../urlState";
import { lifecycleFacts, type LifecycleFacts } from "../alpha/lifecycleModel";
import { useManagerDataset } from "../manager/useManagerDataset";

export function useStageLifecycle(api: ExecutionApi, alphaId: string | null, current: SpineStageId, env: ExecEnv, workspaceId: string | null): LifecycleFacts | null {
  const canAsk = typeof (api as { getManagerDataset?: unknown }).getManagerDataset === "function";
  const read = useManagerDataset(api, canAsk && alphaId !== null, alphaId === null ? null : { surface: "ALPHA", id: alphaId, environment: env, ...(workspaceId ? { workspaceId } : {}) });
  const dataset = read.phase === "ready" ? read.value : null;
  return useMemo(() => lifecycleFacts(dataset, current), [dataset, current]);
}

/** Per-stage facts from two sources (the history from the dataset, a line from the lineage): one object per stage, the lineage's words kept. */
export function mergeSpine<T extends object>(history: Partial<Record<SpineStageId, { outcome: "done" }>> | undefined, facts: Partial<Record<SpineStageId, T>>): Partial<Record<SpineStageId, T | (T & { outcome: "done" })>> {
  if (history === undefined) return facts;
  const out: Partial<Record<SpineStageId, T | (T & { outcome: "done" })>> = { ...facts };
  for (const id of Object.keys(history) as SpineStageId[]) out[id] = { ...(facts[id] ?? ({} as T)), outcome: "done" };
  return out;
}

/** The compact spine's per-stage facts: only the history (`done`) a dataset published; days, criteria and lines belong to the full spine. */
export function spineHistory(lifecycle: LifecycleFacts | null): Partial<Record<SpineStageId, { outcome: "done" }>> | undefined {
  if (lifecycle === null) return undefined;
  const out: Partial<Record<SpineStageId, { outcome: "done" }>> = {};
  for (const [id, facts] of Object.entries(lifecycle.stages) as [SpineStageId, { outcome?: "done" } | undefined][]) {
    if (facts?.outcome === "done") out[id] = { outcome: "done" };
  }
  return Object.keys(out).length === 0 ? undefined : out;
}

/**
 * The gate criteria count of the stage the alpha is IN ("3 of 7 criteria"), from the published alpha lifecycle sibling read
 * (`getAlphaLifecycle`, `stages[].criteria {met, total}`). Only the stage whose state is CURRENT speaks: a finished stage's count says nothing
 * about this deployment's own gate. `null` = not published, not asked or another stage is current (the panel then names the gap).
 */
export function useStageCriteria(api: ExecutionApi, alphaId: string | null, stage: "PAPER" | "SANDBOX" | "CANARY" | "LIVE", env: ExecEnv, workspaceId: string | null): { met: number; total: number } | null {
  const [found, setFound] = useState<{ key: string; criteria: { met: number; total: number } | null } | null>(null);
  const key = `${alphaId}|${stage}|${env}|${workspaceId ?? ""}`;
  useEffect(() => {
    if (alphaId === null || typeof api.getAlphaLifecycle !== "function") return;
    let cancelled = false;
    let pending: ReturnType<NonNullable<ExecutionApi["getAlphaLifecycle"]>>;
    try {
      pending = api.getAlphaLifecycle(alphaId, env, workspaceId ?? undefined);
    } catch {
      return;
    }
    pending
      .then((result) => {
        if (cancelled) return;
        const stages = result.ok && result.value.stages.state === "PUBLISHED" ? result.value.stages.value : [];
        const row = stages.find((s) => s.stage === stage && s.state === "CURRENT");
        setFound({ key, criteria: row?.criteria == null ? null : { met: row.criteria.met, total: row.criteria.total } });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api, alphaId, env, workspaceId, stage, key]);
  return found !== null && found.key === key ? found.criteria : null;
}
