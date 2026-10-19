/**
 * Where Back goes on Alpha 360 and Trade Replay (flow audit #8 and #10).
 *
 * Alpha 360 honours the lists that link into it (Fleet, a Portfolio, the
 * Approvals cockpit, the Blotter) and falls back to the Fleet. Trade Replay's
 * Back is the list the reader came from: the Blotter when `from=blotter`,
 * otherwise this alpha's Orders & Fills tab.
 */
import { backLinkFor, sourceOf, type BackLink } from "../../backTo";

export const ALPHA_BACK_SOURCES = ["fleet", "portfolio", "cockpit", "blotter"] as const;

export function alphaBack(params: URLSearchParams): BackLink {
  return backLinkFor(params, { kind: "fleet" }, ALPHA_BACK_SOURCES);
}

export interface ReplayBack {
  /** The sentence after "Back to". */
  label: string;
  to: string;
}

/** `ordersHref` is the alpha's Orders & Fills tab, already carrying the context params. */
export function replayBack(params: URLSearchParams, ordersHref: string): ReplayBack {
  if (sourceOf(params.get("from"))?.kind === "blotter") {
    const back = backLinkFor(params, { kind: "blotter" }, ["blotter"]);
    return { label: back.label, to: back.to };
  }
  return { label: "Orders & Fills", to: ordersHref };
}
