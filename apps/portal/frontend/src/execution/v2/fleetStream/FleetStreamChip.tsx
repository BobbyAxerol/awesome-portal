/**
 * The Fleet's one stream chip (ELP2-09, flag key `fleet-stream`; FIXTURE_LAB evidence only): Live, Paused or Stopped, with the
 * reason behind a stop in a disclosure (a real button, never a hover) and "Start over" when a retry is possible.
 *
 * Mounted by the Fleet only when the key is on AND the table is the Manager dataset of one environment (the fleet read the
 * barrier pairs with). It owns the stream for as long as it is mounted: unmounting stops the connection.
 *
 * The consumer it registers is the Fleet's own table: `lineage` is the `lineage.revision` the table shows, `refresh` reads the
 * first page again in place. The chip never draws a row and never says how fresh the table is.
 */
import { useMemo, useRef } from "react";

import { GapWhy } from "../blocks";
import { Flag } from "../Flag";
import type { FleetSessionDeps, FleetStreamConsumer } from "./fleetStreamSession";
import type { FleetStreamScope } from "./fleetStreamTransport";
import { useFleetStream } from "./useFleetStream";

export interface FleetStreamChipProps {
  scope: FleetStreamScope;
  /** `lineage.revision` of the fleet read on screen; `null` while it has not loaded. The last non-null value is kept. */
  lineage: string | null;
  /** Read the fleet again in place; resolves with the new `lineage.revision`, or `null`. */
  refresh: (signal: AbortSignal) => Promise<string | null>;
  /** The stream ended because access changed: read again so the table says what its own READ authority says. */
  onAccessEnded?: () => void;
  /** Tests only. */
  deps?: FleetSessionDeps;
}

export function FleetStreamChip({ scope, lineage, refresh, onAccessEnded, deps }: FleetStreamChipProps) {
  // The lineage of a fleet read does not depend on the table's filters, so it survives a reload of the table: a filter change
  // is not a new stream. A new scope remounts this component (the Fleet keys it by scope).
  const seen = useRef<string | null>(null);
  if (lineage !== null) seen.current = lineage;
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const accessRef = useRef(onAccessEnded);
  accessRef.current = onAccessEnded;

  const consumer = useMemo<FleetStreamConsumer>(
    () => ({
      lineage: () => seen.current,
      reread: async (signal) => {
        const next = await refreshRef.current(signal);
        if (next !== null) seen.current = next;
        return next;
      },
      onAccessEnded: () => accessRef.current?.(),
    }),
    [],
  );

  const { view, startOver } = useFleetStream({ scope, enabled: seen.current !== null, consumer, deps });
  const chip = view.chip;
  if (chip === null) return null;
  return (
    <span className="exec-fleet-stream" role="status" data-testid="fleet-stream" data-state={chip.kind}>
      <Flag kind={chip.flag} label={chip.label} size="sm" />
      {chip.reasons.length > 0 ? <GapWhy name={`Why the stream is ${chip.label.toLowerCase()}`} rows={chip.reasons} next={null} /> : null}
      {chip.startOver ? (
        <button type="button" className="exec-fleet-link" onClick={startOver}>
          Start over
        </button>
      ) : null}
    </span>
  );
}
