/**
 * What the Fleet shows about its stream: ONE chip, Live / Paused / Stopped, and the reason behind a stop (ELP2-09; FIXTURE_LAB).
 *
 * Pure: it reads the stream machine's state, the transport's status and two typed codes, and answers the chip. Every sentence is
 * taken from `realtime/streamView.ts` (the approved life-cycle words); the published `reason_code` appears only inside the
 * disclosure, never in a headline. The three chip words are the only new words (listed in the Fleet STREAM note).
 *
 * Rules:
 *  - the chip says what the CONNECTION is doing, never how fresh the table is (the table keeps its own "As of" line);
 *  - "Paused" is the client's own wait (a hidden tab, a reconnect after a drop, a re-read after a notice the machine could not
 *    trust): it has no reason to disclose, so it carries none;
 *  - "Stopped" always carries one: the machine's cause in the approved sentence, the typed code if the server gave one, and
 *    what happens next ("Nothing is retrying by itself; retry when ready.");
 *  - an access end has no "Start over": a new context is a new sign-in, not a retry;
 *  - before the first connection is accepted there is no chip. An absent chip is not a state.
 */
import type { FlagKind } from "../flagKinds";
import type { AlphaFleetStreamUnavailableReason } from "../readers/alphaFleetRealtime";
import { causeCopy, NEXT_ACTION_COPY } from "../realtime/streamView";
import type { StreamPhase, StreamState } from "../realtime/scopedStreamMachine";
import type { TransportStatus } from "./fleetStreamTransport";

export type FleetStreamChipKind = "live" | "paused" | "stopped";

export const FLEET_STREAM_CHIP_WORDS: Readonly<Record<FleetStreamChipKind, string>> = { live: "Live", paused: "Paused", stopped: "Stopped" };

export interface FleetStreamChip {
  kind: FleetStreamChipKind;
  label: string;
  flag: FlagKind;
  /** The disclosure behind a Stopped chip. Empty for Live and Paused. */
  reasons: readonly string[];
  /** "Start over" is offered: the machine would read the snapshot again if pressed. */
  startOver: boolean;
}

export interface FleetStreamView {
  chip: FleetStreamChip | null;
  phase: StreamPhase;
  transport: TransportStatus;
}

export interface ViewExtras {
  /** The transport accepted a connection in this cycle (so a later `connecting` is a reconnect, not the first attempt). */
  accepted: boolean;
  /** Why the snapshot said there is no stream (a finite published code), or `null`. */
  notOffered: AlphaFleetStreamUnavailableReason | null;
  /** The typed problem code of a stream refusal, or `null`. */
  refusalCode: string | null;
}

const chip = (kind: FleetStreamChipKind, flag: FlagKind, reasons: readonly string[] = [], startOver = false): FleetStreamChip => ({
  kind, label: FLEET_STREAM_CHIP_WORDS[kind], flag, reasons, startOver,
});

export function deriveFleetStreamView<T>(state: StreamState<T>, transport: TransportStatus, extras: ViewExtras): FleetStreamView {
  const base = { phase: state.phase, transport };
  switch (state.phase) {
    case "idle":
    case "loading":
      return { ...base, chip: null };

    case "live":
    case "revalidating": {
      if (transport === "open") return { ...base, chip: chip("live", "neutral") };
      if (transport === "idle" || (transport === "connecting" && !extras.accepted)) return { ...base, chip: null };
      return { ...base, chip: chip("paused", "paused") };
    }

    case "resync_required":
      // A read in flight is the machine re-syncing by itself; with none, it is held until "Start over" (the server asked it to stop).
      if (state.inFlight !== null) return { ...base, chip: chip("paused", "paused") };
      return { ...base, chip: chip("stopped", "attention", reasonRows(state, extras, true), true) };

    case "access_revoked":
      return { ...base, chip: chip("stopped", "rejected", reasonRows(state, extras, false), false) };

    case "unavailable": {
      const notOffered = state.cause !== null && state.cause.origin === "local" && state.cause.code === "STREAM_NOT_OFFERED";
      return { ...base, chip: chip("stopped", notOffered ? "na" : "attention", reasonRows(state, extras, true), true) };
    }
  }
}

function reasonRows<T>(state: StreamState<T>, extras: ViewExtras, retryable: boolean): string[] {
  const rows: string[] = [];
  if (state.cause !== null) rows.push(causeCopy(state.cause));
  // The finite codes the server gave. A code is control information, so it sits in the disclosure only.
  if (state.cause !== null && state.cause.origin === "local") {
    if (state.cause.code === "STREAM_NOT_OFFERED" && extras.notOffered !== null) rows.push(extras.notOffered);
    if (state.cause.code === "SNAPSHOT_FAILED" && extras.refusalCode !== null) rows.push(extras.refusalCode);
  }
  if (state.cause !== null && state.cause.origin === "frame") rows.push(state.cause.code);
  rows.push(retryable ? NEXT_ACTION_COPY.WAIT : NEXT_ACTION_COPY.SIGN_IN_OR_REQUEST_ACCESS);
  return rows;
}
