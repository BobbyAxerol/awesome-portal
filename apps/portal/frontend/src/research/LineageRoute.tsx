/**
 * `/research/quantbt/alphas/:alphaId/lineage` — Screen 10 Attempt Lineage.
 *
 * The route owns the one read and the URL. Keying the container on the Alpha
 * means a different Alpha is a fresh read, never a copy of the last one's
 * graph. `?av=` (a version label or id) and `?attempt=` are read once, at
 * mount; a later selection is mirrored into `?attempt=` with `replace`, so
 * clicking through attempts never grows the history stack.
 */

import { useCallback, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import { LineageScreen } from "./LineageDetail";
import { useLineage } from "./useLineage";

function LineageContainer({ alphaId }: { alphaId: string }) {
  const controller = useLineage(alphaId);
  const [params, setParams] = useSearchParams();
  const [initial] = useState(() => ({ av: params.get("av"), attempt: params.get("attempt") }));

  const onSelectAttempt = useCallback(
    (attemptId: string) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set("attempt", attemptId);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return (
    <LineageScreen
      alphaId={alphaId}
      controller={controller}
      initialAv={initial.av}
      initialAttempt={initial.attempt}
      onSelectAttempt={onSelectAttempt}
    />
  );
}

export function LineageRoute() {
  const { alphaId = "" } = useParams();
  return <LineageContainer key={alphaId} alphaId={alphaId} />;
}
