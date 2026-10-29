/**
 * Reads the equity projection of ONE deployment through the port, when the port offers it (R-C, FIXTURE lane).
 *
 * - `idle`: nothing asked (disabled, no deployment, or the port has no `getEquityProjection`); the screen keeps what it has today.
 * - `loading`: a read for the CURRENT request key is on its way.
 * - `absent`: the source does not serve it (404/501/5xx, network, aborted): the screen keeps the typed absence it has today, in its own words.
 * - `refused`: a body or an answer the screen must not use, with the closed word (denied, mismatch, unreadable, unsupported, invalid). The word is shown.
 *
 * Context isolation (Codex R-C 1): a stored answer carries the COMPLETE REQUEST KEY it was read for (workspace, deployment, window, intent,
 * enabled, port identity) and the state this hook RETURNS is derived during render: an answer whose key is not the current key is never
 * returned, so no commit shows one context's data under another (no passive-effect reset sits between the new props and the new output).
 * A late reply is fenced by the effect run that asked for it: after the key changes or the component unmounts it writes nothing.
 */
import { useEffect, useRef, useState } from "react";

import type { ExecutionApi } from "../../../api/ports";
import { identityOf } from "./keyedAnswer";
import type { EquityProjection, EquityProjectionAnswer, ProjectionFailure, ProjectionIntent, ProjectionWindow } from "../../readers/equityProjection";

export type ProjectionState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; projection: EquityProjection }
  | { phase: "absent"; word: ProjectionFailure }
  | { phase: "refused"; word: ProjectionFailure; refusal: string | null };

const IDLE: ProjectionState = { phase: "idle" };
const LOADING: ProjectionState = { phase: "loading" };
/** The words that mean "this source does not serve it": the screen keeps what it has. Everything else is a refusal the reader sees. */
const ABSENT_WORDS: ReadonlySet<ProjectionFailure> = new Set<ProjectionFailure>(["NOT_FOUND", "UNAVAILABLE", "NETWORK", "ABORTED", "NOT_OFFERED"]);

export interface EquityProjectionRequest {
  deploymentId: string | null;
  workspaceId?: string | null;
  enabled: boolean;
  window?: ProjectionWindow;
  intent?: ProjectionIntent;
}

/** The complete request key, or `null` when nothing is to be asked (disabled, no deployment, no port method). */
export function projectionRequestKey(api: ExecutionApi | undefined, request: EquityProjectionRequest): string | null {
  let method: unknown;
  try { method = api?.getEquityProjection; } catch { method = undefined; }
  if (typeof method !== "function") return null;
  // Fail closed: only an explicit `true` asks (an unreadable or missing flag does not).
  if (!(request.enabled === true) || request.deploymentId === null || request.deploymentId === "") return null;
  return JSON.stringify([identityOf(method as object), request.workspaceId ?? null, request.deploymentId, request.window ?? "30d", request.intent ?? null]);
}

export function useEquityProjectionFor(api: ExecutionApi | undefined, request: EquityProjectionRequest): ProjectionState {
  const key = projectionRequestKey(api, request);
  const [store, setStore] = useState<{ key: string; state: ProjectionState } | null>(null);
  const latest = useRef({ api, request });
  latest.current = { api, request };

  useEffect(() => {
    if (key === null) {
      // Nothing is asked; drop what was held so a later identical request starts from loading, not from a held answer.
      setStore((held) => (held === null ? held : null));
      return undefined;
    }
    let live = true;
    const { api: current, request: asked } = latest.current;
    const query = {
      deploymentId: asked.deploymentId!, window: asked.window ?? "30d",
      ...(asked.intent ? { intent: asked.intent } : {}), ...(asked.workspaceId ? { workspaceId: asked.workspaceId } : {}),
    };
    let pending: Promise<EquityProjectionAnswer | undefined>;
    try {
      pending = Promise.resolve(current!.getEquityProjection!(query));
    } catch {
      pending = Promise.resolve(undefined);
    }
    const settle = (state: ProjectionState) => { if (live) setStore({ key, state }); };
    pending.then(
      (answer) => {
        if (answer === undefined || answer === null || typeof answer !== "object" || !("kind" in answer)) settle({ phase: "absent", word: "NOT_OFFERED" });
        else if (answer.kind === "projection") settle({ phase: "ready", projection: answer.projection });
        else if (ABSENT_WORDS.has(answer.word)) settle({ phase: "absent", word: answer.word });
        else settle({ phase: "refused", word: answer.word, refusal: answer.refusal ?? null });
      },
      () => settle({ phase: "absent", word: "NETWORK" }),
    );
    return () => { live = false; };
  }, [key]);

  if (key === null) return IDLE;
  return store !== null && store.key === key ? store.state : LOADING;
}

/** The positional form the screens use. */
export function useEquityProjection(api: ExecutionApi | undefined, deploymentId: string | null, workspaceId: string | null | undefined, enabled = true, window: ProjectionWindow = "30d"): ProjectionState {
  return useEquityProjectionFor(api, { deploymentId, workspaceId, enabled, window });
}
