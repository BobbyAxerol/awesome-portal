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

import { useEffect, useMemo, useRef, useState } from "react";

import { NewRun } from "./NewRun";
import { type RegistryEntry, alphaImportApi, toRefusal } from "./alphaImportClient";
import type { AtlasDocument } from "./atlas";
import { type AtlasResponse, foundationApi, toFoundationRefusal } from "./foundationClient";
import { type DraftConstraints, type ParameterEntry, type RunDraft, parameterEntriesFrom } from "./runDraft";
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
 * Constraints from the two typed reads.
 *
 * Every field is `null` until a response supplies it. There is no fallback —
 * the earlier `Infinity` ceiling read as "no limit", which is a claim about the
 * release that no response supported. A rule the browser could not read is a
 * rule it does not enforce, and the step says so; the server still enforces its
 * own at preflight.
 *
 * The version is located by an exact `alpha_version_id` match. An entrypoint is
 * never inferred from an identifier, and a near-match is not a match: if the
 * selected version is not in the registry, nothing is declared.
 */
export function constraintsFrom(
  atlas: AtlasDocument | null,
  registry: readonly RegistryEntry[],
  alphaVersionId: string,
): DraftConstraints {
  const blocked: Record<string, string> = {};
  for (const route of atlas?.routes ?? []) {
    if (route.axes.admission !== "P04_BASELINE_ONLY") blocked[route.route_id] = route.reason;
  }

  const bound = registry.find((entry) => entry.alpha_version_id === alphaVersionId) ?? null;
  const declaration = bound?.declaration ?? null;

  return {
    declaredTimeframes: declaration ? declaration.timeframes : null,
    seedRequired: declaration ? declaration.determinism.seed_required : null,
    trialCeiling: atlas ? atlas.current_release.trial_ceiling : null,
    entrypoint: declaration ? declaration.entrypoint : null,
    blockedRoutes: blocked,
  };
}

/** The declared parameter space of the bound version, or none. */
export function parametersFor(
  registry: readonly RegistryEntry[],
  alphaVersionId: string,
): readonly ParameterEntry[] {
  const bound = registry.find((entry) => entry.alpha_version_id === alphaVersionId);
  return bound ? parameterEntriesFrom(bound.declaration.parameter_space) : [];
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

  const [registry, setRegistry] = useState<readonly RegistryEntry[]>([]);
  const [registryState, setRegistryState] = useState<ResearchState>(() =>
    researchState({ kind: "in-flight", hasAcceptedResponse: false }),
  );

  useEffect(() => {
    let live = true;
    alphaImportApi
      .registry()
      .then((response) => {
        if (!live) return;
        setRegistry(response.entries);
        setRegistryState(researchState({ kind: "ok", rowCount: response.entries.length }));
      })
      .catch((error: unknown) => {
        if (!live) return;
        const refusal = toRefusal(error);
        setRegistryState({
          state: refusal.state,
          reason: refusal.message,
          mayRetry: refusal.mayRetry,
          retainsContent: false,
        });
      });
    return () => {
      live = false;
    };
  }, []);

  const document = atlas?.atlas ?? null;
  const [draft, setDraft] = useState<RunDraft>(emptyDraft);
  const limits = useMemo(
    () => constraintsFrom(document, registry, draft.alphaVersionId),
    [document, registry, draft.alphaVersionId],
  );
  const run = useNewRun(draft, limits);

  /*
   * Binding a version adopts its declared parameter space, once.
   *
   * The browser never adds, removes or widens an entry — it adopts the surface
   * the server projected and then lets the reader narrow within it. Re-running
   * on every render would throw away those narrowings, so this fires only when
   * the selected version changes.
   */
  const adoptedFor = useRef<string | null>(null);
  useEffect(() => {
    if (adoptedFor.current === run.draft.alphaVersionId) return;
    const declared = parametersFor(registry, run.draft.alphaVersionId);
    if (declared.length === 0 && run.draft.parameters.length === 0) return;
    adoptedFor.current = run.draft.alphaVersionId;
    run.patch({ parameters: declared });
  }, [registry, run]);

  /*
   * The release the form was built from travels with the declaration.
   *
   * `client.engine_release_id` is the identity of the manifest whose routes,
   * ceilings and defaults this draft was declared against — so it is adopted
   * from the Atlas rather than left empty. `config_digest` stays empty: no
   * response publishes one and the browser must not compute a digest, which is
   * recorded rather than papered over.
   */
  useEffect(() => {
    const releaseId = document?.current_release.release_id;
    if (releaseId && run.draft.engineReleaseId !== releaseId) {
      run.patch({ engineReleaseId: releaseId });
    }
  }, [document, run]);

  /* Keeps this component's copy of the draft in step with the controller's. */
  useEffect(() => setDraft(run.draft), [run.draft]);

  return (
    <NewRun
      draft={run.draft}
      patch={run.patch}
      limits={limits}
      atlas={document}
      atlasState={atlasState}
      declarationState={registryState}
      declarationBound={registry.some((e) => e.alpha_version_id === run.draft.alphaVersionId)}
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
