/**
 * Screen 02 on its product route (P10).
 *
 * `/research/quantbt/runs/new`. The declaration's constraints come from the
 * installed release's Atlas, so the route grid, the trial ceiling and the
 * blocked-route reasons are all the engine's facts rather than a local copy.
 * A route the release adds appears with no frontend change.
 *
 * When the Atlas cannot be read the form still renders — the reader's
 * declaration is theirs and does not disappear because a dependency did — but
 * no route is offered, and the step says why.
 */

import { useEffect, useMemo, useState } from "react";

import { NewRun } from "./NewRun";
import type { AtlasDocument } from "./atlas";
import { type AtlasResponse, foundationApi, toFoundationRefusal } from "./foundationClient";
import type { DraftConstraints, RunDraft } from "./runDraft";
import { useNewRun } from "./useNewRun";
import { researchState, type ResearchState } from "./state";

/** An empty declaration. Every field is the reader's to fill. */
export function emptyDraft(): RunDraft {
  return {
    bound: true,
    alphaId: "",
    alphaVersionId: "",
    strategyId: "",
    protocol: "three_window_decay",
    executionRoute: "signal_notional",
    routeParams: {},
    datasetId: "",
    symbol: "",
    timeframe: "4h",
    windows: {
      is: { start: "", endExclusive: "" },
      oos: { start: "", endExclusive: "" },
      holdout: { start: "", endExclusive: "" },
    },
    walkForward: { start: "", endExclusive: "", splitMode: "", frequency: "", windowMode: "" },
    optimizationMode: "",
    optimizationSchedule: "",
    parameters: [],
    optunaTrials: "",
    earlyStopping: "",
    randomSeed: "",
    optimizationConfigOverrides: {},
    engineReleaseId: "",
    configDigest: "",
  };
}

/**
 * Constraints derived from the Atlas.
 *
 * `blockedRoutes` carries the engine's own refusal wording for every route the
 * installed release will not admit, so the card can show the reason rather
 * than a generic "unavailable".
 */
export function constraintsFrom(atlas: AtlasDocument | null): DraftConstraints {
  if (atlas === null) {
    return {
      declaredTimeframes: [],
      seedRequired: false,
      /* Not zero: a ceiling the browser invented would refuse a legal trial
         count. With no manifest the ceiling is simply not enforced here, and
         the server still enforces its own at preflight. */
      trialCeiling: Number.POSITIVE_INFINITY,
      entrypoint: null,
      blockedRoutes: {},
    };
  }
  const blocked: Record<string, string> = {};
  for (const route of atlas.routes) {
    if (route.axes.admission !== "P04_BASELINE_ONLY") blocked[route.route_id] = route.reason;
  }
  return {
    declaredTimeframes: [],
    seedRequired: false,
    trialCeiling: Number.POSITIVE_INFINITY,
    entrypoint: null,
    blockedRoutes: blocked,
  };
}

export function NewRunRoute() {
  const [atlas, setAtlas] = useState<AtlasResponse | null>(null);
  const [atlasState, setAtlasState] = useState<ResearchState>(() =>
    researchState({ kind: "in-flight", hasAcceptedResponse: false }),
  );

  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    foundationApi
      .atlas({}, controller.signal)
      .then((response) => {
        if (!live) return;
        setAtlas(response);
        setAtlasState(researchState({ kind: "ok", rowCount: 1 }));
      })
      .catch((error: unknown) => {
        if (!live || controller.signal.aborted) return;
        const refusal = toFoundationRefusal(error);
        setAtlasState({
          state: refusal.state,
          reason: refusal.message,
          mayRetry: refusal.mayRetry,
          retainsContent: false,
        });
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, []);

  const document = atlas?.atlas ?? null;
  const limits = useMemo(() => constraintsFrom(document), [document]);
  const run = useNewRun(emptyDraft(), limits);

  return (
    <NewRun
      draft={run.draft}
      patch={run.patch}
      limits={limits}
      atlas={document}
      atlasState={atlasState}
      preflight={run.preflight.preflight}
      preflightState={run.preflight.preflightState}
      clearedBecause={run.preflight.clearedBecause}
      onRunPreflight={run.preflight.runPreflight}
      mayCreateRun={run.mayCreateRun}
      canSubmit={run.canSubmit}
      created={run.created}
      createState={run.createState}
      outcomeUnknown={run.outcomeUnknown}
      onSubmit={run.submit}
      onRecheck={run.recheck}
    />
  );
}
