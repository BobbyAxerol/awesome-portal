/**
 * `/research/quantbt/alphas/:alphaId/lineage` — Screen 10 Attempt Lineage.
 *
 * The route owns the one read and the URL. Keying the container on the Alpha
 * means a different Alpha is a fresh read, never a copy of the last one's
 * graph. `?av=` (a version label or id), `?attempt=`, `?run=` (the viewed run) and `?probes=1` are read once, at
 * mount; a later selection is mirrored into `?attempt=` with `replace`, so
 * clicking through attempts never grows the history stack.
 */

import { useCallback, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import { LineageScreen } from "./LineageDetail";
import { useLineage } from "./useLineage";

function LineageContainer({ alphaId }: { alphaId: string }) {
  const [params, setParams] = useSearchParams();
  const controller = useLineage(alphaId, { workspaceId: params.get("workspace_id") || undefined });
  const [initial] = useState(() => ({
    av: params.get("av"),
    attempt: params.get("attempt"),
    run: params.get("run"),
    probes: params.get("probes") === "1",
  }));

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

  const onProbesChange = useCallback(
    (shown: boolean) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (shown) next.set("probes", "1");
          else next.delete("probes");
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
      initialRun={initial.run}
      initialProbes={initial.probes}
      onSelectAttempt={onSelectAttempt}
      onProbesChange={onProbesChange}
    />
  );
}

export function LineageRoute() {
  const { alphaId = "" } = useParams();
  const [params] = useSearchParams();
  return <LineageContainer key={`${params.get("workspace_id") ?? ""}|${alphaId}`} alphaId={alphaId} />;
}
