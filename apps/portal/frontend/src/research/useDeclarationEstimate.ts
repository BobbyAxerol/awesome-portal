/**
 * Screen 02 · the server's estimate of the declaration (B7/B8 declaration-estimate).
 *
 * One POST for the whole declaration (windows, warmup, fold plan, conditions), debounced
 * when the declared windows, schedule or mode change, the previous request aborted, and
 * never asked before the minimum declaration exists. The answer belongs to the exact
 * request it was made for: an edited window never shows the old count.
 *
 * It is information. The preflight's own `run_admission` stays the authority on whether
 * a run may be created.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { type DeclarationEstimateResult, postDeclarationEstimate } from "./datasetClient";
import type { PreflightEstimate } from "./dataDeclarationV2";
import { type RunDraft, estimateReady, estimateSignature, serializeRequestedSpec } from "./runDraft";

export const DECLARATION_ESTIMATE_DEBOUNCE_MS = 450;

export type EstimateStatus =
  /** The minimum declaration does not exist yet, or the catalog is not a v2 one: nothing was asked. */
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "served"; estimate: PreflightEstimate }
  /** A 400 with the server's code, and the requested-spec field it names. */
  | { kind: "refused"; code: string; fieldPath: readonly string[] | null; message: string; requestId: string | null }
  /** 4xx / 5xx / no answer: three different states, each with a retry; never "not published". */
  | { kind: "error"; failure: "client-error" | "server-error" | "network"; status: number | null; code: string | null; requestId: string | null }
  /** The route is not there (older server): the per-window bar metadata is the fallback. */
  | { kind: "absent" };

export interface DeclarationEstimateState {
  status: EstimateStatus;
  /** The served estimate, or null in every other state. */
  estimate: PreflightEstimate | null;
  /** Asks again for the declaration on screen (the retry of an error state). */
  retry: () => void;
}

function statusOf(result: DeclarationEstimateResult): EstimateStatus {
  switch (result.state) {
    case "estimate":
      return { kind: "served", estimate: result.estimate };
    case "refused":
      return { kind: "refused", code: result.code, fieldPath: result.fieldPath, message: result.message, requestId: result.requestId };
    case "absent":
      return { kind: "absent" };
    case "network":
      return { kind: "error", failure: "network", status: null, code: null, requestId: null };
    default:
      return { kind: "error", failure: result.state, status: result.status, code: result.code, requestId: result.requestId };
  }
}

export function useDeclarationEstimate(
  draft: RunDraft,
  /** False until the catalog is a v2 one: a server without the index has no such route to ask. */
  enabled: boolean,
  post: (spec: unknown, workspaceId: string | undefined, signal?: AbortSignal) => Promise<DeclarationEstimateResult> = postDeclarationEstimate,
  debounceMs: number = DECLARATION_ESTIMATE_DEBOUNCE_MS,
  workspaceId?: string,
): DeclarationEstimateState {
  const ready = enabled && estimateReady(draft);
  const spec = useMemo(() => (ready ? serializeRequestedSpec(draft) : null), [ready, draft]);
  const signature = spec === null ? null : estimateSignature(spec);
  /* The latest spec, so a request made after the debounce carries what is on screen now. */
  const latest = useRef(spec);
  latest.current = spec;
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<{ key: string; status: EstimateStatus } | null>(null);
  const key = signature === null ? null : `${workspaceId ?? ""}|${attempt}|${signature}`;

  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const spec = latest.current;
      if (spec === null) return;
      post(spec, workspaceId, controller.signal).then(
        (result) => {
          if (!controller.signal.aborted) setAnswer({ key, status: statusOf(result) });
        },
        () => {
          /* An abort is the previous request being replaced: it says nothing. */
        },
      );
    }, debounceMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `key` captures every input of the request; `draft` itself changes on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const status: EstimateStatus = key === null ? { kind: "idle" } : answer !== null && answer.key === key ? answer.status : { kind: "pending" };
  return { status, estimate: status.kind === "served" ? status.estimate : null, retry };
}
