/**
 * Screen 04's split tab body (HiFi 04, `isSplit`).
 *
 * The hub draws the stage itself — fold timeline, fold table, containment,
 * stitched OOS — by mounting Screen 05's own reads and blocks without Screen
 * 05's frame, header or cursor notice. Nothing here re-reads or re-derives:
 * the deep dive and this tab are the same component on the same `:runId`, and
 * the fold is the hub's cursor, so the tab's fold rows move the hub's chip.
 */

import type { EvidenceCursor } from "./evidenceCursor";
import { SplitRouteBody } from "./SplitRoute";

export function HubSplitBody({
  runId,
  cursor,
  onFold,
}: {
  runId: string;
  cursor: EvidenceCursor;
  onFold: (fold: number) => void;
}) {
  return (
    <div data-hub-stage-body="split">
      <SplitRouteBody runId={runId} cursor={cursor} onFold={onFold} embedded />
    </div>
  );
}
