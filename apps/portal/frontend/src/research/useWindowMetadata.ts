/**
 * Screen 02 · bars per declared window and the warmup, from the B7 index.
 *
 * One `bar-metadata` read per declared window (IS / OOS / Holdout, or the one
 * analysis span), debounced on every change, the previous request aborted. The
 * counts and the half-open UTC bounds are the server's; nothing is computed
 * here. An answer belongs to the exact request it was made for, so a window the
 * reader has since edited never shows the old count.
 */

import { useEffect, useMemo, useState } from "react";

import { type BarMetadataQuery, type BarMetadataResult, readBarMetadata } from "./datasetClient";
import {
  type BarMetadata,
  type PreflightEstimate,
  type WindowMetadata,
  declaredRanges,
  estimateFromMetadata,
} from "./dataDeclaration";
import type { RunDraft } from "./runDraft";

export const WINDOW_METADATA_DEBOUNCE_MS = 350;

type WindowKey = "is" | "oos" | "holdout" | "analysis";

export interface WindowRequest {
  key: WindowKey;
  query: BarMetadataQuery;
}

const KEY_OF_LABEL: Readonly<Record<string, WindowKey>> = { IS: "is", OOS: "oos", Holdout: "holdout", Analysis: "analysis" };

/**
 * The requests the declared windows call for. Only the first window (IS, or the
 * analysis span) carries the warmup, and only when the bound version declares one.
 */
export function windowRequests(
  draft: Pick<RunDraft, "protocol" | "windows" | "walkForward" | "datasetId" | "symbol" | "timeframe">,
  warmupBars: number | null,
): readonly WindowRequest[] {
  const symbol = draft.symbol.trim().toUpperCase();
  if (draft.datasetId === "" || symbol === "" || draft.timeframe === "") return [];
  return declaredRanges(draft).flatMap((range, index): WindowRequest[] => {
    const key = KEY_OF_LABEL[range.label];
    if (key === undefined) return [];
    const warmup = index === 0 && warmupBars !== null ? { warmupBars } : {};
    return [{ key, query: { symbol, timeframe: draft.timeframe, startUtcMs: range.from, endExclusiveUtcMs: range.to, ...warmup } }];
  });
}

/** A window the server refused: no count, no bounds, the served problem code as the reason. */
function refusedWindow(code: string): BarMetadata {
  return {
    availability: "NOT_PUBLISHED",
    reasonCode: code,
    startUtcMs: null,
    endExclusiveUtcMs: null,
    bars: null,
    firstBarUtcMs: null,
    lastBarUtcMs: null,
    warmupBarsRequired: null,
    warmupBarsAvailableBeforeStart: null,
    asOfUtcMs: null,
    catalogRevision: null,
  };
}

export function useWindowMetadata(
  draft: Pick<RunDraft, "protocol" | "windows" | "walkForward" | "datasetId" | "symbol" | "timeframe">,
  warmupBars: number | null,
  /** False until the catalog is a v2 one: a server without the index has no such route to ask. */
  enabled: boolean,
  read: (datasetId: string, query: BarMetadataQuery, signal?: AbortSignal) => Promise<BarMetadataResult> = readBarMetadata,
  debounceMs: number = WINDOW_METADATA_DEBOUNCE_MS,
  workspaceId?: string,
): PreflightEstimate | null {
  const requests = useMemo(() => (enabled ? windowRequests(draft, warmupBars) : []), [enabled, draft, warmupBars]);
  const signature = JSON.stringify([workspaceId ?? null, draft.datasetId, requests]);
  const [answer, setAnswer] = useState<{ signature: string; estimate: PreflightEstimate | null } | null>(null);

  useEffect(() => {
    if (requests.length === 0) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void Promise.all(requests.map((request) => read(draft.datasetId, { ...request.query, ...(workspaceId ? { workspaceId } : {}) }, controller.signal))).then((results) => {
        if (controller.signal.aborted) return;
        const windows: { -readonly [K in WindowKey]?: NonNullable<WindowMetadata[K]> } = {};
        results.forEach((result, index) => {
          if (result.state === "metadata") windows[requests[index]!.key] = result.metadata;
          /* The server refused the bounds: its code is the reason, and it echoed no bounds or counts. */
          else if (result.state === "refused") windows[requests[index]!.key] = refusedWindow(result.code);
        });
        const first = requests[0]!.key;
        setAnswer({
          signature,
          estimate: estimateFromMetadata(windows, warmupBars !== null && (first === "is" || first === "analysis") ? first : null),
        });
      });
    }, debounceMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `signature` captures every input of the request; `draft` itself changes on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return answer !== null && answer.signature === signature ? answer.estimate : null;
}
