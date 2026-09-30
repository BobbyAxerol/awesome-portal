/**
 * Screen 04's Execute tab body (HiFi 04, `isExecute`).
 *
 * The tab draws the same stage body as Screen 08: it mounts Screen 08's own
 * container with `embedded`, so the reads, the hash cursor and every body
 * block are the deep dive's, and the hub keeps its frame, title and cursor
 * bar. Nothing here reads or computes anything of its own.
 *
 * `fold` / `onFold` are the hub cursor's: the hub's fold stepper moves the
 * replay, and a fold the replay moves to by itself moves the hub's pill.
 */

import { useParams } from "react-router-dom";

import { ExecuteContainer } from "./ExecuteRoute";

export function HubExecuteBody({
  runId: given,
  fold,
  onFold,
}: { runId?: string; fold?: number | null; onFold?: (fold: number) => void } = {}) {
  const { runId: routed = "" } = useParams<{ runId: string }>();
  const runId = given ?? routed;
  /* Keyed by run, as on the deep-dive route: another run is a new arrival. */
  return <ExecuteContainer key={runId} runId={runId} embedded hubFold={fold} onHubFold={onFold} />;
}
