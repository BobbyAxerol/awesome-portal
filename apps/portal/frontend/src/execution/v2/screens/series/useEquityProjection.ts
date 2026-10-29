/**
 * Reads the equity projection of ONE deployment through the port, when the port offers it (R-C, FIXTURE lane).
 *
 * - `idle`: nothing asked (disabled, no deployment, or the port has no `getEquityProjection`); the screen keeps what it has today.
 * - `absent`: the source does not serve it (404/501/5xx, network, aborted): the screen keeps the typed absence it has today, in its own words.
 * - `refused`: a body or an answer the screen must not use, with the closed word (denied, mismatch, unreadable, unsupported, invalid). The word is shown.
 * - A change of deployment or workspace drops the previous answer at once and aborts the read: one deployment's series is never shown for another.
 */
import { useEffect, useRef, useState } from "react";

import type { ExecutionApi } from "../../../api/ports";
import type { EquityProjection, EquityProjectionAnswer, ProjectionFailure, ProjectionWindow } from "../../readers/equityProjection";

export type ProjectionState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; projection: EquityProjection }
  | { phase: "absent"; word: ProjectionFailure }
  | { phase: "refused"; word: ProjectionFailure; refusal: string | null };

const IDLE: ProjectionState = { phase: "idle" };
/** The words that mean "this source does not serve it": the screen keeps what it has. Everything else is a refusal the reader sees. */
const ABSENT_WORDS: ReadonlySet<ProjectionFailure> = new Set<ProjectionFailure>(["NOT_FOUND", "UNAVAILABLE", "NETWORK", "ABORTED", "NOT_OFFERED"]);

export function useEquityProjection(api: ExecutionApi | undefined, deploymentId: string | null, workspaceId: string | null | undefined, enabled = true, window: ProjectionWindow = "30d"): ProjectionState {
  const [state, setState] = useState<ProjectionState>(IDLE);
  const apiRef = useRef(api);
  apiRef.current = api;
  const offered = (() => {
    try { return typeof api?.getEquityProjection === "function"; } catch { return false; }
  })();
  useEffect(() => {
    if (!enabled || !offered || deploymentId === null || deploymentId === "") {
      setState(IDLE);
      return undefined;
    }
    let live = true;
    setState({ phase: "loading" });
    const query = { deploymentId, window, ...(workspaceId ? { workspaceId } : {}) };
    let pending: Promise<EquityProjectionAnswer | undefined>;
    try {
      pending = Promise.resolve(apiRef.current!.getEquityProjection!(query));
    } catch {
      pending = Promise.resolve(undefined);
    }
    pending.then(
      (answer) => {
        if (!live) return;
        if (answer === undefined || answer === null || typeof answer !== "object" || !("kind" in answer)) setState({ phase: "absent", word: "NOT_OFFERED" });
        else if (answer.kind === "projection") setState({ phase: "ready", projection: answer.projection });
        else if (ABSENT_WORDS.has(answer.word)) setState({ phase: "absent", word: answer.word });
        else setState({ phase: "refused", word: answer.word, refusal: answer.refusal ?? null });
      },
      () => { if (live) setState({ phase: "absent", word: "NETWORK" }); },
    );
    return () => { live = false; };
  }, [enabled, offered, deploymentId, workspaceId, window]);
  return state;
}
