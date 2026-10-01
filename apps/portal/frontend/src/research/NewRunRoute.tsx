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

import { useLocation, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { NewRun } from "./NewRun";
import { type RegistryEntry, alphaImportApi, toRefusal } from "./alphaImportClient";
import type { AtlasDocument } from "./atlas";
import { type AtlasResponse, foundationApi, toFoundationRefusal } from "./foundationClient";
import { STEPS, type StepId, type DraftConstraints, type ParameterEntry, type RunDraft, applyCoveragePrefill, applyOverrides, draftFromRequestedSpec, parameterEntriesFrom, planCoverage } from "./runDraft";
import { type DatasetCatalog, catalogFailureState, readDatasetCatalog } from "./datasetClient";
import { type RunRequestedSpec, cloneFailureState, readRunRequestedSpec } from "./runCloneClient";
import { runLineageFor, useNewRun, type RunLineage } from "./useNewRun";
import { useRunLabelRead } from "./useRunLabelRead";
import { NOT_MODIFIED, freezeApi, isFreezeLaneNotApplicable } from "./freezeClient";
import { isWhatIf } from "./WhatIfCard";
import type { ForkSource } from "./NewRun";
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
    /* No version is chosen yet, so no timeframe is declared; the version's first declared one is adopted once it is. */
    timeframe: "",
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
    /* E4 (audit 02-12): already in the registry response, never read until now. */
    requiredColumns: declaration?.required_columns ?? null,
    warmupBars: declaration?.warmup_bars ?? null,
    blockedRoutes: blocked,
    /* CG-P08-05: the release's own sweep ceiling; null when unpublished. */
    sweepCeiling: atlas ? (atlas.current_release.preflight_limits?.sweep_dimension_ceiling.value ?? null) : null,
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

/**
 * HiFi 02-4: when the registry holds exactly one ACTIVE version, that is the
 * only thing a bound run could be about, so the form opens on it instead of on
 * two empty selects. Zero or several ACTIVE entries preselect nothing — the
 * reader chooses; a near-match is never a match.
 */
export function soleActiveEntry(registry: readonly RegistryEntry[]): RegistryEntry | null {
  const active = registry.filter((entry) => entry.lifecycle_state === "ACTIVE");
  return active.length === 1 ? active[0]! : null;
}

export function NewRunRoute() {
  const location = useLocation();
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

  /* CG-P08-04: the research dataset catalog; the form works without it. */
  const [catalog, setCatalog] = useState<DatasetCatalog | null>(null);
  const [catalogReason, setCatalogReason] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    readDatasetCatalog(undefined, controller.signal)
      .then((response) => setCatalog(response))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setCatalogReason(catalogFailureState(error).reason);
      });
    return () => controller.abort();
  }, []);

  const document = atlas?.atlas ?? null;
  const [draft, setDraft] = useState<RunDraft>(emptyDraft);
  const limits = useMemo(
    () => constraintsFrom(document, registry, draft.alphaVersionId),
    [document, registry, draft.alphaVersionId],
  );
  /*
   * W5a · `?from=<run>&fork=<cell>` (spec 07 §2.5 / §15.5): Screen 07's
   * "create sibling attempt →". The node's two values are read from the
   * server's own what-if grid for that run, never from the URL, and pinned on
   * top of the copied declaration; the submission carries SIBLING_OF so the
   * server links the new attempt to the frozen run's attempt.
   */
  const forkCell = new URLSearchParams(location.search).get("fork");
  const forkRun = new URLSearchParams(location.search).get("from");
  const [fork, setFork] = useState<ForkSource | null>(null);
  useEffect(() => {
    if (!forkRun || !forkCell) return;
    const controller = new AbortController();
    setFork({ runId: forkRun, cellId: forkCell, state: "loading", parameters: null, reason: null });
    freezeApi
      .currentSource(forkRun, { signal: controller.signal })
      .then((answer) => {
        if (answer === NOT_MODIFIED || isFreezeLaneNotApplicable(answer)) {
          setFork({ runId: forkRun, cellId: forkCell, state: "missing", parameters: null, reason: "That run has no what-if grid — nothing was pinned." });
          return;
        }
        const whatIf = (answer as { what_if?: unknown }).what_if;
        const cell = isWhatIf(whatIf) ? whatIf.grid?.cells.find((entry) => entry.cell_id === forkCell) ?? null : null;
        setFork(cell
          ? { runId: forkRun, cellId: forkCell, state: "ready", parameters: cell.parameters, reason: null }
          : { runId: forkRun, cellId: forkCell, state: "missing", parameters: null, reason: `Node ${forkCell} is not on that run's what-if grid — nothing was pinned.` });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setFork({ runId: forkRun, cellId: forkCell, state: "missing", parameters: null, reason: "The what-if grid could not be read — nothing was pinned." });
      });
    return () => controller.abort();
  }, [forkRun, forkCell]);
  /*
   * `?from=<runId>` (CG-P11-07): copy the run's admitted declaration into a
   * NEW draft. The copy is only the declaration — a fresh preflight is owed,
   * and none of the original run's admission (its token, manifest, lease or
   * digests) is reused by the new submission.
   *
   * E13: the submission does now *name* the run it was copied from, as
   * `CLONE_OF`. That is a provenance edge, not a dependency — it is the only
   * thing that gives the new attempt a `parent_attempt_id`. Without it every
   * clone landed as a root: all 33 attempts on the preview read
   * `parent_state: ROOT`, Screen 10's tree never nested, and "diff vs parent"
   * was always empty.
   */
  const fromRun = new URLSearchParams(location.search).get("from");
  /* D4 walk: the "copied from" / "sibling of" banners name the run `R-WFO-020`,
     not `rrun_…`. A cold link has no list read to learn the label from, so ask. */
  useRunLabelRead(fromRun);
  const [clone, setClone] = useState<{ runId: string; state: ResearchState; spec: RunRequestedSpec | null } | null>(null);
  useEffect(() => {
    if (!fromRun) return;
    const controller = new AbortController();
    setClone({ runId: fromRun, state: researchState({ kind: "in-flight", hasAcceptedResponse: false }), spec: null });
    readRunRequestedSpec(fromRun, controller.signal)
      .then((response) => {
        setClone({ runId: fromRun, state: researchState({ kind: "ok", rowCount: 1 }), spec: response });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setClone({ runId: fromRun, state: cloneFailureState(fromRun, error), spec: null });
      });
    return () => controller.abort();
  }, [fromRun]);
  /* Which parent, if any, this draft may name. The rule lives beside the
     lineage types so it can be read and tested without the route. */
  const forkReady = fork?.state === "ready";
  const forkRunId = fork?.runId ?? null;
  const forkCellId = fork?.cellId ?? null;
  const cloneCopied = clone?.spec != null;
  const cloneRunId = clone?.runId ?? null;
  const lineage = useMemo<RunLineage | null>(
    () => runLineageFor(
      forkRunId && forkCellId ? { runId: forkRunId, cellId: forkCellId, ready: forkReady } : null,
      cloneRunId ? { runId: cloneRunId, copied: cloneCopied } : null,
    ),
    [forkReady, forkRunId, forkCellId, cloneCopied, cloneRunId],
  );
  const run = useNewRun(draft, limits, undefined, lineage);

  const clonedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!clone?.spec || clonedFor.current === clone.runId) return;
    clonedFor.current = clone.runId;
    const copied = draftFromRequestedSpec(clone.spec.requested_spec, run.draft);
    run.patch({ ...copied, parameters: run.draft.parameters });
  }, [clone, run]);
  const prefilledFor = useRef<string | null>(null);
  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const alpha = query.get("alpha");
    const version = query.get("av");
    if (!alpha || !version || prefilledFor.current === version) return;
    const entry = registry.find((candidate) => candidate.alpha_id === alpha && candidate.alpha_version_id === version);
    if (!entry) return;
    prefilledFor.current = version;
    run.patch({ alphaId: entry.alpha_id, alphaVersionId: entry.alpha_version_id, strategyId: entry.strategy_id ?? entry.alpha_id });
  }, [location.search, registry, run]);

  /* HiFi 02-4: a registry with one ACTIVE version opens on it. Only for a plain
     visit: a `?alpha=`/`?av=` link, a `?from=` copy or a `?fork=` own the binding,
     and once the reader has touched the alpha or version this never runs again. */
  const preselectedFor = useRef<string | null>(null);
  useEffect(() => {
    if (preselectedFor.current !== null || registry.length === 0) return;
    const query = new URLSearchParams(location.search);
    if (query.get("alpha") || query.get("av") || query.get("from") || query.get("fork")) return;
    const only = soleActiveEntry(registry);
    if (!only) return;
    preselectedFor.current = only.alpha_version_id;
    if (run.draft.alphaId !== "" || run.draft.alphaVersionId !== "") return;
    run.patch({ alphaId: only.alpha_id, alphaVersionId: only.alpha_version_id, strategyId: only.strategy_id ?? only.alpha_id });
  }, [location.search, registry, run]);

  /* Once a version is chosen its first declared timeframe fills an empty field
     (the chip row already shows the declared set). Only an empty field: a
     copied run or the reader's own pick is never overwritten. */
  useEffect(() => {
    const first = limits.declaredTimeframes?.[0];
    if (run.draft.timeframe !== "" || run.draft.alphaVersionId === "" || first === undefined) return;
    run.patch({ timeframe: first });
  }, [limits.declaredTimeframes, run]);

  /* S02_DATA: when the catalog serves exactly one available dataset it is the
     only choice, so a plain visit opens on it (with its coverage prefill). Done
     here, once, in the same way as the sole ACTIVE version: a `?from=` copy owns
     its dataset, and a dataset the reader (or a copy) already holds is kept. */
  const datasetPreselected = useRef(false);
  useEffect(() => {
    if (datasetPreselected.current || catalog === null) return;
    if (new URLSearchParams(location.search).get("from")) return;
    const available = catalog.datasets.filter((item) => item.availability === "available");
    if (available.length !== 1) return;
    datasetPreselected.current = true;
    if (run.draft.datasetId !== "") return;
    const only = available[0]!;
    run.patch({
      datasetId: only.dataset_id,
      ...applyCoveragePrefill(run.draft, planCoverage(catalog, only.dataset_id, run.draft.symbol)),
    });
  }, [catalog, location.search, run]);

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
    /* A what-if fork's node arrives after the version binds; its arrival
       re-adopts once so the pins land (W5a · P16-T08). */
    const forkKey = fork?.state === "ready" ? `${fork.runId}@${fork.cellId}` : "";
    const adoptionKey = `${run.draft.alphaVersionId}|${forkKey}`;
    if (adoptedFor.current === adoptionKey) return;
    const declared = parametersFor(registry, run.draft.alphaVersionId);
    if (declared.length === 0 && run.draft.parameters.length === 0) return;
    adoptedFor.current = adoptionKey;
    /* A clone re-applies the copied overrides on the version's own table;
       a what-if fork then pins its node's two values on top. */
    const copied = clone?.spec?.requested_spec.parameter_space_overrides ?? [];
    const pins = fork?.state === "ready" && fork.parameters
      ? Object.entries(fork.parameters).map(([name, value]) => ({ name, kind: "pin" as const, value: Number(value) }))
      : [];
    const merged = [...copied.filter((entry) => !pins.some((pin) => pin.name === entry.name)), ...pins];
    run.patch({ parameters: merged.length > 0 ? applyOverrides(declared, merged) : declared });
  }, [registry, run, clone, fork]);

  /*
   * The release the form was built from travels with the declaration.
   *
   * `client.engine_release_id` is the identity of the manifest whose routes,
   * ceilings and defaults this draft was declared against — so it is adopted
   * from the Atlas rather than left empty. `config_digest` is adopted the same
   * way (CG-P10-01, closed in RF-02): the Atlas publishes the digest of the
   * release configuration this form renders, and the browser sends it
   * unchanged. It never computes one; with no published digest it stays empty
   * and preflight refuses, which is the honest outcome.
   */
  useEffect(() => {
    const releaseId = document?.current_release.release_id;
    const configDigest = document?.current_release.config_digest ?? "";
    if (releaseId && (run.draft.engineReleaseId !== releaseId || run.draft.configDigest !== configDigest)) {
      run.patch({ engineReleaseId: releaseId, configDigest });
    }
  }, [document, run]);

  /*
   * An empty trials field is filled with the count the release's
   * submission profile accepts (`accepted_trial_count`), so a fresh draft is
   * one the server admits. The reader can still change it; it is never
   * overwritten after that.
   */
  const accepted = document?.current_release.submission_constraints?.accepted_trial_count;
  /* A `?from=` copy owns the trial count. Until the read of that run has
     settled — and for good once it landed — this default must not run: it fired
     in the same commit as the copy, saw the still-empty field, and wrote the
     profile's 1 over the copied 400, so a 400-trial run came back as a 1-trial
     draft with nothing to say so. Only a copy that failed gets the default. */
  const cloneOwnsTrials = fromRun !== null
    && !(clone !== null && clone.runId === fromRun && clone.spec === null && clone.state.state !== "loading");
  useEffect(() => {
    if (cloneOwnsTrials) return;
    if (accepted !== undefined && run.draft.optunaTrials === "") {
      run.patch({ optunaTrials: String(accepted) });
    }
  }, [accepted, run, cloneOwnsTrials]);

  /*
   * Spec 02 T26 / §outbound: a created run leaves the form for its own
   * progress screen. The form used to stay put with the run id in a panel and
   * no way forward — a dead end after the one action the screen exists for.
   */
  const navigate = useNavigate();
  const createdId = run.created?.run_id ?? null;
  useEffect(() => {
    if (createdId) navigate(`/research/quantbt/runs/${encodeURIComponent(createdId)}/progress`);
  }, [createdId, navigate]);

  /* `?route=` from the Atlas "declare →" link preselects an offered route. */
  const routeFromQuery = new URLSearchParams(location.search).get("route");
  const routedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!routeFromQuery || routedFor.current === routeFromQuery || !document) return;
    routedFor.current = routeFromQuery;
    if (document.routes.some((route) => route.route_id === routeFromQuery) && !limits.blockedRoutes[routeFromQuery]) {
      run.patch({ executionRoute: routeFromQuery as RunDraft["executionRoute"] });
    }
  }, [routeFromQuery, document, limits, run]);

  /* HiFi 02-18: the wizard step is written to the address (replace, never push:
     moving through the steps must not fill the Back button). `context` is the
     default and leaves the address clean; every other parameter is kept. */
  const locationRef = useRef(location);
  locationRef.current = location;
  const writeStep = useCallback((step: StepId) => {
    const here = locationRef.current;
    const query = new URLSearchParams(here.search);
    const current = query.get("step");
    if (step === "context" ? current === null : current === step) return;
    if (step === "context") query.delete("step");
    else query.set("step", step);
    const text = query.toString();
    navigate({ pathname: here.pathname, search: text ? `?${text}` : "", hash: here.hash }, { replace: true });
  }, [navigate]);

  /* Keeps this component's copy of the draft in step with the controller's. */
  useEffect(() => setDraft(run.draft), [run.draft]);

  return (
    <NewRun
      initialStep={STEPS.find((step) => step.id === new URLSearchParams(location.search).get("step"))?.id ?? "context"}
      onStepChange={writeStep}
      draft={run.draft}
      patch={run.patch}
      limits={limits}
      atlas={document}
      atlasState={atlasState}
      declarationState={registryState}
      declarationBound={registry.some((e) => e.alpha_version_id === run.draft.alphaVersionId)}
      registry={registry}
      preflight={run.preflight.preflight}
      preflightState={run.preflight.preflightState}
      clearedBecause={run.preflight.clearedBecause}
      onRunPreflight={run.preflight.runPreflight}
      preflightRefusal={run.preflight.refusal}
      catalog={catalog}
      catalogReason={catalogReason}
      portalAdmission={atlas?.selected_release_kind === "CURRENT" ? atlas.portal_admission.profiles : null}
      cloneSource={clone ? { runId: clone.runId, state: clone.state } : null}
      forkSource={fork}
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
