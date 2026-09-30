/**
 * V2 (Bobby, 2026-09-30) — Screen 04's Atlas tab draws the Atlas itself.
 *
 * HiFi 04 renders the mode × schedule → claim matrix inside the tab; the hub
 * used to print a sentence and a link instead. This is the same read and the
 * same component Screen 12 renders (`foundationApi.atlas` → `EngineAtlas`),
 * with two differences only:
 *  - the Atlas's place (tab, mode, schedule, route) lives in local state, not
 *    the URL hash — the hub's hash is the evidence cursor and must not be
 *    rewritten by a click in the matrix;
 *  - the run's own cell comes from the hub's published run identity, so no
 *    second progress read is made. An identity field the hub withheld stays
 *    unset; nothing is guessed.
 */
import { useEffect, useState } from "react";

import { EngineAtlas, type AtlasLocation, type AtlasRunCell } from "./EngineAtlas";
import { preloadKatex } from "./Formula";
import type { AtlasDocument } from "./atlas";
import { foundationApi, type AtlasResponse } from "./foundationClient";
import { useFoundationRead } from "./foundationRoutes";

export interface HubAtlasIdentity {
  mode: string | null;
  schedule: string | null;
  route: string | null;
}

export function HubAtlasBody({ runId, identity }: { runId: string; identity: HubAtlasIdentity }) {
  useEffect(() => preloadKatex(), []);
  const [place, setPlace] = useState<AtlasLocation>(() => ({
    tab: "modes",
    mode: identity.mode,
    schedule: identity.schedule,
    route: identity.route,
    run: runId,
  }));
  const read = useFoundationRead<AtlasResponse>((signal) => foundationApi.atlas({}, signal), []);
  const doc: AtlasDocument | null = read.data?.atlas ?? null;
  const runCell: AtlasRunCell =
    identity.mode !== null || identity.schedule !== null
      ? { state: "known", mode: identity.mode, schedule: identity.schedule }
      : { state: "absent", reason: "the evidence hub publishes no mode or schedule for this run" };

  return (
    <div data-hub-atlas-body data-atlas-read={read.state.state}>
      <EngineAtlas
        embedded
        doc={doc}
        state={read.state}
        tab={place.tab}
        onTabChange={(tab) => setPlace((previous) => ({ ...previous, tab }))}
        location={place}
        onLocationChange={(change) => setPlace((previous) => ({ ...previous, ...change }))}
        runCell={runCell}
        selectedReleaseId={read.data?.selected_release_id ?? null}
        selectedReleaseKind={read.data?.selected_release_kind ?? null}
      />
    </div>
  );
}
