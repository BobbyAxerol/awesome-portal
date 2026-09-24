/**
 * Screen 13 Compare routes.
 *
 *  - `/research/quantbt/alphas/:alphaId/compare?mode=&runs=` — the canonical
 *    route (VD-P20-09): the contract reads inside one Alpha, so the Alpha is
 *    in the path. `mode` is the URL's; without one, two named runs mean
 *    `pair` and nothing means `attempts`. An unknown mode is sent as written:
 *    the 400 is the server's to give. A segment click pushes history (the
 *    reader may go back to the previous question) and drops `runs=` outside
 *    pair mode.
 *  - `/research/quantbt/compare?runs=&alpha=` — the route spec 13 names,
 *    kept as a resolver: with `alpha=` it redirects to the canonical route;
 *    without it nothing is sent and the screen says compare reads inside one
 *    Alpha.
 *
 * A pair that does not name exactly two runs is never sent (VD-P20-12).
 * Keying the container on the Alpha makes a different Alpha a fresh read.
 */

import { useCallback } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";

import { CompareScreen, PAIR_NEEDS_TWO, RESOLVER_NEEDS_ALPHA } from "./CompareDetail";
import { compareHref, isCompareMode, pairRuns, splitRuns, type CompareMode } from "./compareClient";
import { useCompare, type CompareQuery } from "./useCompare";

function CompareContainer({ alphaId }: { alphaId: string | null }) {
  const [params, setParams] = useSearchParams();
  const runs = splitRuns(params.get("runs"));
  const rawMode = params.get("mode");
  const requested = rawMode ?? (runs ? "pair" : "attempts");
  const mode: CompareMode | null = isCompareMode(requested) ? requested : null;
  const pairIncomplete = requested === "pair" && pairRuns(runs) === null;

  const query: CompareQuery | null = alphaId && !pairIncomplete ? { mode: requested, runs: requested === "pair" ? runs : null } : null;
  const controller = useCompare(alphaId, query);

  const onMode = useCallback(
    (next: CompareMode) => {
      setParams((current) => {
        const updated = new URLSearchParams(current);
        updated.set("mode", next);
        if (next !== "pair") updated.delete("runs");
        return updated;
      });
    },
    [setParams],
  );

  const idleReason = !alphaId ? RESOLVER_NEEDS_ALPHA : pairIncomplete ? PAIR_NEEDS_TWO : null;

  return (
    <CompareScreen
      alphaId={alphaId}
      mode={mode}
      runs={requested === "pair" ? runs : null}
      controller={controller}
      onMode={onMode}
      idleReason={idleReason}
    />
  );
}

export function CompareRoute() {
  const { alphaId = "" } = useParams();
  return <CompareContainer key={alphaId} alphaId={alphaId || null} />;
}

/** `/research/quantbt/compare` — resolves to the canonical route when the URL names an Alpha. */
export function CompareResolverRoute() {
  const [params] = useSearchParams();
  const alpha = params.get("alpha");
  if (alpha) {
    const runs = splitRuns(params.get("runs"));
    const mode = params.get("mode");
    /* A mode the client does not know is passed through untouched: the
       server owns the 400, and the resolver must not hide it (audit A10). */
    const href = isCompareMode(mode) || mode === null
      ? compareHref(alpha, { mode: isCompareMode(mode) ? mode : runs ? "pair" : undefined, runs })
      : `${compareHref(alpha, { runs })}${runs ? "&" : "?"}mode=${encodeURIComponent(mode)}`;
    return <Navigate replace to={href} />;
  }
  return <CompareContainer alphaId={null} />;
}
