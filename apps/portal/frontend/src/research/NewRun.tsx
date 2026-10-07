/**
 * Screen 02 · New Run — context · route · preflight (P10 composition scope).
 *
 * The densest declaration screen in the domain: eight steps that end in one
 * immutable requested spec. Spec 02's three founding rules shape it —
 *
 *  1. a declaration outside the space the alpha declared cannot be submitted;
 *  2. the claim forecast is shown before compute is spent;
 *  3. an untouched field is not serialized, so the engine's default applies.
 *
 * Two composition decisions worth stating:
 *
 *  - **The route grid is rendered from the Atlas manifest, never from a local
 *    list.** A route the installed release adds appears here with no frontend
 *    change, and a route it blocks carries the engine's own refusal wording.
 *  - **A control that cannot be used is shown with its reason, never hidden**
 *    (spec 02 §13-3). Hiding an invalid option makes the reader wonder whether
 *    it exists; showing it struck through with a title says who to ask.
 *
 * The review rail is the same serializer the submit uses. It is not a
 * summary written beside the payload — it *is* the payload, rendered.
 */

import { useEntryRef, useReadout } from "./chartLife";
import { lineageHref } from "./LineageLink";
import { ResearchScopedLineageLink as LineageLink, ResearchScopedLink as RouterLink } from "./ResearchScopedLink";
import { ParameterSpaceTable, rowsFromEntries } from "./ParameterSpaceTable";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useInRouterContext } from "react-router-dom";

import {
  ALPHA_VERSION_PUBLICATION_WORDS,
  approvalStatusWords,
  useAlphaVersionPublications,
  type AlphaVersionPublicationView,
} from "./alphaVersionPublication";
import { RUN_ADMISSION_COPY } from "./AlphaImport";
import { scheduleChoices } from "./atlas";
import type { AtlasDocument } from "./atlas";
import { type CatalogDataset, type CatalogSymbol, type DatasetCatalog, splitCatalogReason } from "./datasetClient";
import {
  CoverageWarnings,
  DatasetIdentity,
  SymbolCombobox,
  SymbolFacts,
  TimeframeChips,
  UnavailableDatasets,
} from "./DataDeclaration";
import {
  type FoldPlan,
  type PreflightEstimate,
  type ProfileFoldBounds,
  type ProfilePins,
  coverageRange,
  coverageWarnings,
  foldPlan,
  foldCountProblem,
  trialBudgetProblem,
  SCHEDULE_PER_FOLD_CAUSAL,
  admitsSpecV2,
  causalScheduleProfile,
  isCausalProfile,
  refusesInner,
  admittedFrequencies,
  admittedWindowModes,
  hasDeclarationFacts,
  profileFamily,
  profileTimeframes,
  readCatalogIndex,
  readProfiles,
  seedPinned,
  selectProfile,
  sharedAxis,
  specVersionOf,
  symbolListing,
  timeframeChips,
  trialsPinned,
} from "./dataDeclaration";
import { ConditionsChecklist, EarliestStartOffer, PlannedFolds, WarmupChip, WindowBars, WindowBarsLine, hasEstimateStrip } from "./EstimateParts";
import { EstimateFieldRefusal, EstimateStatusLine, refusedAt } from "./EstimateStatus";
import { datetimeInputValue } from "./InstantInput";
import { FoldTimeline, foldsFromPlanned } from "./FoldTimeline";
import { humaniseTokens, setupReasonWords } from "./humanise";
import { LinkedWindowCalendar } from "./LinkedWindowCalendar";
import { WindowSetupBar } from "./WindowSetupBar";
import { DateInput } from "./DateInput";
import { AccountFacts } from "./AccountFacts";
import { RecipePicker } from "./RecipePicker";
import { routeWord } from "./nativeFacts";
import { RunTypePicker } from "./RunTypePicker";
import { runTypesFrom, useRunTypes } from "./useRunTypes";
import { compatibleRoutes, useVersionOptions } from "./useVersionOptions";
import { applyRecipe, recipesFromSetup } from "./runRecipes";
import { suggestionToDayEdges } from "./useWindowSuggestion";
import type { WindowSuggestion } from "./setupClient";
import { contextClosure, engineModeClosed, engineOptionPair, setupContextFrom, setupProfilesOr, type RunSetupState } from "./useRunSetup";
import { edgesOf, windowsFromEdges } from "./useWindowSuggestion";
import { timeframeBarMs } from "./windowGeometry";
import type { EstimateStatus } from "./useDeclarationEstimate";
import { OOS_STATE_LABEL, statusTone } from "./EngineAtlas";
import type { PreflightRefusal } from "./preflightClient";
import { ResearchPanel } from "./ResearchPanel";
import { PreflightPanel } from "./PreflightPanel";
import {
  type CoveragePlan,
  type CoverageSource,
  type DraftConstraints,
  type ParameterEntry,
  type PrefillField,
  type RunDraft,
  type StepId,
  STEPS,
  RECEIPT_ALPHA,
  SWEEP_CEILING,
  adoptGuardDefaults,
  applyCoveragePrefillFor,
  draftIsEmpty,
  validateWindows,
  guardAppliesNoProtection,
  blockingProblems,
  isIncompleteProblem,
  carriedCoverage,
  earlyStoppingInvalid,
  effectiveStrategyId,
  markPrefillTouched,
  missingConstraints,
  outerFields,
  planCoverage,
  randomSeedInvalid,
  stepForFieldPath,
  utcMs,
  parameterStatus,
  pinnedCount,
  sweptCount,
  usesSpecV2,
} from "./runDraft";
import type { AtlasRelease } from "./foundationClient";
import type { RegistryEntry } from "./alphaImportClient";
import type { RunCreateResponse } from "./runCreateClient";
import type { PreflightResponse } from "./preflightClient";
import type { ResearchState } from "./state";
import { ShortId } from "./ShortId";
import { claimToken, formatUtc, shortDigest, shortId } from "./researchFormat";
import { humanise } from "./humanise";
import { useRunLabel } from "./runLabels";

/* --------------------------------------------------------------- verbatim */

export const SUBTITLE =
  "Bind the alpha version, pick how orders come to exist, then the methodology. Each step validates on its own — a problem is reported where it can be fixed.";

export const SCRATCH_BANNER =
  "Scratch runs iterate freely and stay full evidence for you — but no release candidate can ever be composed from one. Strategy pick below becomes free.";

/**
 * The binding badge (E4, audit 02-3).
 *
 * It used to read "PUBLISHABLE · no version bound" on an empty form, which
 * contradicts itself: nothing is bound, so nothing is publishable yet. And
 * once a version was chosen it printed the long `alpha_version_id`, where the
 * HiFi prints the registry's short `version_label`.
 *
 * Three honest states, one place, so the header and the review rail can never
 * disagree (they held two copies of the same ternary).
 */
export function bindingChip(
  draft: Pick<RunDraft, "bound" | "alphaId" | "alphaVersionId">,
  registry: readonly RegistryEntry[],
): { state: "PUBLISHABLE" | "PENDING_VERSION" | "NOT_PUBLISHABLE"; text: string; title: string } {
  if (!draft.bound) {
    return {
      state: "NOT_PUBLISHABLE",
      text: "Scratch — cannot be published",
      title: "A scratch run keeps full evidence, but no release candidate can be composed from one.",
    };
  }
  if (!draft.alphaVersionId) {
    return {
      state: "PENDING_VERSION",
      text: "NO VERSION CHOSEN",
      title: "A run bound to an alpha version can compose a release candidate. Choose the version to bind it.",
    };
  }
  const label = registry.find(
    (entry) => entry.alpha_version_id === draft.alphaVersionId
      && (draft.alphaId === "" || entry.alpha_id === draft.alphaId),
  )?.version_label;
  return {
    state: "PUBLISHABLE",
    /* The registry's short label, as the HiFi prints it; the full id is in
       the title and in `data-alpha-version-id`. */
    text: `PUBLISHABLE · ${label ?? draft.alphaVersionId}`,
    title: label ? `${label} — ${draft.alphaVersionId}` : draft.alphaVersionId,
  };
}

export const DEFAULTS_FOOTER =
  "Defaults come from the release manifest — an untouched field is NOT serialized. Missing objective metrics raise MissingOptimizationMetricError, there is no silent fallback.";

/** Spec 02 §10 — shown while the run's existence is unknown. */
export const UNKNOWN_OUTCOME_NOTE =
  "The server did not say whether this run was created. Check again with the same request — a second submit could create a second run.";

/** Router navigation inside the app (no page reload); a same-origin anchor in isolated panels and tests. */
function Link({ to, children, ...rest }: { to: string; children: React.ReactNode } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const inRouter = useInRouterContext();
  return inRouter ? (
    <RouterLink to={to} {...rest}>
      {children}
    </RouterLink>
  ) : (
    <a href={to} {...rest}>
      {children}
    </a>
  );
}

/* ------------------------------------------------------------------ parts */

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="mono text-[10px] font-medium uppercase tracking-[.07em]"
      style={{ color: "var(--ink-faint)" }}
    >
      {children}
    </span>
  );
}

/** Wide enough for `05/01/2026, 12:00 AM`, the picker icon and the `UTC` suffix beside the input at 11px mono (RG1). */
const INSTANT_FIELD_WIDTH = 236;

function Field({
  label,
  children,
  hint,
  minWidth,
  title,
}: {
  label: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
  /** The long explanation, kept off the page: it rides on the label. */
  title?: string;
  /** Pixels the field keeps before the row wraps (a date-time input must show its time, not "12:" cut by the picker icon). */
  minWidth?: number;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1" style={minWidth ? { minWidth } : undefined} title={title}>
      <Label>{label}</Label>
      {children}
      {hint ? (
        <span className="text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export { datetimeInputValue };

const INPUT_CLASS = "mono rounded-[6px] border px-2 py-[5px] text-[11px]";
const inputStyle = (bad?: boolean) => ({
  borderColor: bad ? "var(--bad)" : "var(--line)",
  background: "var(--paper-raised)",
  color: "var(--ink)",
});

function ErrorBlock({ message }: { message: string }) {
  return (
    <p
      role="alert"
      data-step-error
      className="rounded-[6px] border px-2.5 py-1.5 text-[11.5px]"
      style={{ borderColor: "var(--bad)", background: "var(--bad-bg)", color: "var(--bad)" }}
    >
      {message}
    </p>
  );
}

function Card({ title, children, meta }: { title: string; children: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <section
      className="flex flex-col gap-2.5 rounded-[8px] border px-3.5 py-3"
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
      data-step-card={title}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        {/* HiFi 02-2: panel titles are Inter 12/600 caps; the global h3 rule would make them serif. */}
        <h2 className="text-[12px] font-semibold uppercase tracking-[.05em]" style={{ fontFamily: "var(--font-body)" }}>{title}</h2>
        {meta}
      </header>
      {children}
    </section>
  );
}

/**
 * A run named the way the HiFi names it (`R-WFO-020`): the server's label when a
 * read has published one, else the short id. The full id stays in `data-run-id`.
 * Never a bare `rrun_…` in a banner (D4 walk).
 */
function RunRef({ runId }: { runId: string }) {
  const label = useRunLabel(runId);
  return <span data-run-id={runId} data-display-label={label ?? undefined}>{label ?? shortId(runId)}</span>;
}

/* --------------------------------------------------------------- wizard bar */

/**
 * Below this width the eight pills with their captions no longer fit one row
 * (measured in Chromium: the full row needs 916 px). The bar then shows the label and
 * caption of the current step only; the other seven keep their number or mark
 * and name themselves in a tooltip and the accessible name. The HiFi scrolls
 * the row sideways; a first step that is off-screen reads as a wizard that
 * starts at step three, so this keeps all eight visible instead.
 */
export const WIZARD_FULL_WIDTH = 930;

export interface StepCaption {
  state: "error" | "current" | "valid" | "visited" | "not-visited" | "incomplete";
  /** The word under the label: valid · needs attention · not visited · preflight pending … */
  caption: string;
}

/**
 * The live caption of one pill (HiFi 02-7: valid / needs attention / preflight
 * pending). Every word is a fact the form already holds: its own checks, the
 * reader's visits and the preflight state. A step nobody opened has not been
 * checked, so it is "not visited", never "valid" (FG 02-8b).
 */
export function stepCaption({
  step,
  current,
  hasError,
  unfinished = false,
  visited,
  contextChosen,
  contextBlocked = false,
  reviewCaption,
  passive = false,
}: {
  step: StepId;
  current: boolean;
  hasError: boolean;
  /** The step has nothing left to choose (everything on it is pinned): it never blocks and reads "pinned", visited or not. */
  passive?: boolean;
  /** The step has a required field still empty that is not flagged yet (reached, not edited, not left). It never reads "valid". */
  unfinished?: boolean;
  visited: boolean;
  /** Context has no validator of its own: it passes once a version is chosen, or for a scratch run. */
  contextChosen: boolean;
  /** The bound version's served `run_admission.may_create_run` is false. */
  contextBlocked?: boolean;
  reviewCaption: string;
}): StepCaption {
  if (hasError) return { state: "error", caption: "needs attention" };
  /* Review's verdict is the server's preflight, which the bar cannot see, so
     Review never gets a tick; its caption is the preflight's own state. */
  if (step === "review") return { state: current ? "current" : visited ? "visited" : "not-visited", caption: reviewCaption };
  if (passive) return { state: current ? "current" : "valid", caption: "pinned" };
  /* W4A: an unvisited step says nothing; only an error, the current step and a valid mark carry a word. */
  if (!visited) return { state: "not-visited", caption: "" };
  if (unfinished) return { state: current ? "current" : "incomplete", caption: "in progress" };
  if (step === "context" && !contextChosen) return { state: current ? "current" : "incomplete", caption: "no version chosen" };
  if (step === "context" && contextBlocked) return { state: current ? "current" : "incomplete", caption: "cannot create runs" };
  /* The strategy of a bound run is the bound alpha: with no version chosen nothing is pinned yet. */
  if (step === "strategy" && !contextChosen) return { state: current ? "current" : "incomplete", caption: "not set" };
  return { state: current ? "current" : "valid", caption: "valid" };
}

function WizardBar({
  current,
  onPick,
  errors,
  unfinished,
  visited,
  contextChosen,
  contextBlocked,
  reviewCaption,
  passive,
}: {
  current: StepId;
  onPick: (step: StepId) => void;
  /** Steps with nothing left to choose: kept for orientation, never blocking, skipped by Back and Next. */
  passive: ReadonlySet<StepId>;
  errors: ReadonlySet<StepId>;
  /** Steps whose problems are not shown yet (reached, not edited or left). */
  unfinished: ReadonlySet<StepId>;
  /** Steps the reader has reached. A step nobody opened has not been checked, so it is never "valid". */
  visited: ReadonlySet<StepId>;
  contextChosen: boolean;
  contextBlocked: boolean;
  reviewCaption: string;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useLayoutEffect(() => {
    const element = barRef.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => setCompact(element.clientWidth > 0 && element.clientWidth < WIZARD_FULL_WIDTH);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    /* One row at any width the pills fit; narrower, the seven other pills
     * collapse to their mark (see WIZARD_FULL_WIDTH). Wrapping stays as the
     * last resort rather than a horizontal scrollbar that hides step one. */
    <div
      ref={barRef}
      className="flex flex-wrap gap-1 rounded-[6px] border p-[5px]"
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
      role="tablist"
      aria-label="New run steps"
      data-wizard-compact={compact || undefined}
    >
      {STEPS.map((step, index) => {
        const isCurrent = step.id === current;
        const hasError = errors.has(step.id);
        const { state: stepState, caption } = stepCaption({
          step: step.id,
          current: isCurrent,
          hasError,
          unfinished: unfinished.has(step.id),
          visited: visited.has(step.id),
          contextChosen,
          contextBlocked,
          reviewCaption,
          passive: passive.has(step.id),
        });
        const checked = stepState === "valid" && step.id !== "review";
        const tone = hasError ? "var(--bad)" : isCurrent ? "var(--accent)" : checked ? "var(--good)" : "var(--ink-faint)";
        const showText = !compact || isCurrent;
        return (
          <button
            key={step.id}
            type="button"
            role="tab"
            aria-selected={isCurrent}
            aria-current={isCurrent ? "step" : undefined}
            /* Roving tabindex: the tab list is one stop, arrows move inside it (U14). */
            tabIndex={isCurrent ? 0 : -1}
            aria-label={`${step.label}${caption ? ` — ${caption}` : ""}`}
            title={showText ? undefined : `${step.label}${caption ? ` — ${caption}` : ""}`}
            data-step-pill={step.id}
            data-step-state={stepState}
            onClick={() => onPick(step.id)}
            onKeyDown={(event) => {
              const next = event.key === "Home" ? 0 : event.key === "End" ? STEPS.length - 1
                : event.key === "ArrowRight" ? (index + 1) % STEPS.length
                  : event.key === "ArrowLeft" ? (index + STEPS.length - 1) % STEPS.length : null;
              if (next === null) return;
              event.preventDefault();
              onPick(STEPS[next]!.id);
              (event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next])?.focus();
            }}
            className={`flex flex-none items-center gap-2 rounded-[6px] py-1.5 ${showText ? "px-3" : "px-1.5"}`}
            style={{ background: isCurrent ? "var(--accent-soft)" : "transparent" }}
          >
            <span
              className="mono inline-flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] text-[10px] font-bold"
              style={{ color: tone, borderColor: tone }}
            >
              {hasError ? "!" : checked ? "✓" : index + 1}
            </span>
            {showText ? (
              <span className="flex flex-col items-start">
                <span className="text-[11px] font-medium">{step.label}</span>
                {caption ? (
                  <span
                    className="text-[9px]"
                    data-step-caption
                    style={{ color: hasError ? "var(--bad)" : "var(--ink-faint)" }}
                  >
                    {caption}
                  </span>
                ) : null}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------- steps */

/**
 * What the registry says this version supersedes (HiFi 02-5).
 *
 * `supersedes_state` decides what a `null` means: RECORDED is authoritative
 * ("this is a first version"), HISTORICAL_NOT_RECORDED is a row registered
 * before lineage was captured, so nothing is claimed about it. The server's
 * own state word is the reason code; a registry read that carries neither is
 * reported as not reported.
 */
export function supersedesFact(
  entry: Pick<RegistryEntry, "supersedes" | "supersedes_state"> | null,
  registry: readonly RegistryEntry[],
): { kind: "version" | "none" | "absent"; text: string; code: string | null } | null {
  if (entry === null) return null;
  if (entry.supersedes_state === "RECORDED") {
    if (typeof entry.supersedes === "string" && entry.supersedes !== "") {
      const label = registry.find((candidate) => candidate.alpha_version_id === entry.supersedes)?.version_label;
      return { kind: "version", text: label ?? entry.supersedes, code: null };
    }
    return { kind: "none", text: "none · first version", code: null };
  }
  if (entry.supersedes_state === "HISTORICAL_NOT_RECORDED") {
    return { kind: "absent", text: "not recorded", code: "HISTORICAL_NOT_RECORDED" };
  }
  return { kind: "absent", text: "not reported", code: null };
}

/** HiFi `avStateNote`, as the tooltip of the lifecycle value (the sentence itself is no longer printed). */
const LIFECYCLE_NOTE: Record<string, string> = {
  ACTIVE: "This version can compose a release candidate after the run completes — the evidence lands in the pack on the Release Candidate screen.",
  DRAFT: "DRAFT import — runnable as evidence, but activate it before any publish: a draft version cannot compose a release candidate.",
  SUPERSEDED: "SUPERSEDED — runnable for comparison, but a new release candidate should come from the active version.",
};

function ContextStep({
  workspaceId,
  draft,
  patch,
  limits,
  registry,
}: {
  draft: RunDraft;
  patch: (change: Partial<RunDraft>) => void;
  limits: DraftConstraints;
  registry: readonly RegistryEntry[];
  workspaceId?: string;
}) {
  const bound = registry.find((entry) => entry.alpha_id === draft.alphaId && entry.alpha_version_id === draft.alphaVersionId);
  /* The receipt alphas the platform's own checks register cannot create runs: they are not offered (one the draft already holds stays visible). */
  const alphaIds = [...new Set(registry.map((entry) => entry.alpha_id))].filter((id) => !RECEIPT_ALPHA.test(id) || id === draft.alphaId);
  /* An alpha with one version has nothing to choose: picking it picks the version. */
  /* An ACTIVE version a later version of the same alpha names as the one it supersedes is shown as replaced (it still runs what it declares). */
  const supersededBy = (entry: RegistryEntry): string | null =>
    registry.find((other) => other.alpha_id === entry.alpha_id && other.supersedes === entry.alpha_version_id)?.version_label ?? null;
  const pickAlpha = (alphaId: string) => {
    const versions = registry.filter((entry) => entry.alpha_id === alphaId);
    /* One version is that one; several start on the newest ACTIVE (a later version may declare more timeframes: the label says which). */
    /* One Alpha can carry editions for different routes (notional, percent equity, native); the registry does not name them, so the start is the
       ACTIVE version declaring the most timeframes (earliest of those: the notional edition, the default route), never "the newest edition".
       The Run type row on Walk-forward then offers the others. */
    const newestActive = [...versions]
      .filter((entry) => entry.lifecycle_state === "ACTIVE")
      .sort((a, b) => (b.declaration?.timeframes?.length ?? 0) - (a.declaration?.timeframes?.length ?? 0) || a.registered_at_utc_ms - b.registered_at_utc_ms)[0];
    patch({ alphaId, alphaVersionId: versions.length === 1 ? versions[0]!.alpha_version_id : (newestActive?.alpha_version_id ?? ""), strategyId: "" });
  };
  /* What each version binds, read before any dataset is chosen: the version list says it ("Bracket", "Percent equity"), never inferred. */
  const bindings = useVersionOptions(draft.bound && draft.alphaId !== "", registry, { workspaceId, alphaId: draft.alphaId });
  const bindingWords = (entry: RegistryEntry): string | null => {
    const options = bindings.byVersion.get(entry.alpha_version_id);
    if (options === undefined) return null;
    const routes = compatibleRoutes(options, null).routes;
    return routes.length === 0 ? "no open route" : routes.map(routeWord).join(" + ");
  };
  /* FG-05: the P22 lookup runs only for a bound version the registry listed. */
  const lookedUp = draft.bound && bound ? bound.alpha_version_id : null;
  const publications = useAlphaVersionPublications(lookedUp !== null ? [lookedUp] : [], { workspaceId });
  const supersedes = supersedesFact(bound ?? null, registry);
  /* `run_admission` as the registry serves it: a version that cannot create runs says why, here, before any step is filled. */
  const admission = draft.bound ? (bound?.run_admission ?? null) : null;
  const blockedWords = admission && !admission.may_create_run
    ? ((admission.code ? (RUN_ADMISSION_COPY as Record<string, string | undefined>)[admission.code] : undefined) ?? "run admission refused")
    : null;
  /* An alpha none of whose versions can create a run is named so in the list. */
  const cannotRun = (alphaId: string) => {
    const versions = registry.filter((entry) => entry.alpha_id === alphaId);
    return versions.length > 0 && versions.every((entry) => entry.run_admission?.may_create_run === false);
  };
  return (
    <Card title="Context — alpha &amp; version binding">
      <div className="flex flex-wrap items-end gap-2.5">
        {/* A scratch run binds no alpha: its two fields would only hold ids the serializer ignores. */}
        {draft.bound ? (<>
        <Field label="Alpha">
          {draft.bound ? (
            <select className={INPUT_CLASS} style={inputStyle()} value={draft.alphaId} onChange={(event) => pickAlpha(event.target.value)} aria-label="Alpha" data-alpha-selector disabled={registry.length === 0} title={registry.length === 0 ? "No registry entry is available for the bound declaration." : undefined}>
              <option value="">Select an alpha</option>
              {alphaIds.map((id) => <option key={id} value={id}>{registry.find((entry) => entry.alpha_id === id)?.display_name ?? id}{cannotRun(id) ? " · cannot create runs" : ""}</option>)}
            </select>
          ) : <input className={INPUT_CLASS} style={inputStyle()} value={draft.alphaId} onChange={(event) => patch({ alphaId: event.target.value })} aria-label="Alpha" />}
        </Field>
        <Field label="Version (immutable after submit)">
          {draft.bound ? (
            <select className={INPUT_CLASS} style={inputStyle()} value={draft.alphaVersionId} onChange={(event) => patch({ alphaVersionId: event.target.value })} aria-label="Alpha version" data-version-selector disabled={registry.length === 0 || !draft.alphaId} title={registry.length === 0 ? "No registry entry is available for the bound declaration." : !draft.alphaId ? "Select an alpha first." : undefined}>
              <option value="">Select a version</option>
              {registry.filter((entry) => entry.alpha_id === draft.alphaId).sort((a, b) => b.registered_at_utc_ms - a.registered_at_utc_ms).map((entry) => <option key={entry.alpha_version_id} value={entry.alpha_version_id} title={`declares timeframes ${(entry.declaration?.timeframes ?? []).join(", ") || "none"} · source ${entry.source_digest_prefix}`}>{entry.version_label} · {entry.lifecycle_state} · {(entry.declaration?.timeframes ?? []).join(" ") || "no timeframes"}{bindingWords(entry) !== null ? ` · ${bindingWords(entry)}` : ""}{supersededBy(entry) !== null ? ` · replaced by ${supersededBy(entry)}` : ""}</option>)}
            </select>
          ) : <input className={INPUT_CLASS} style={inputStyle()} value={draft.alphaVersionId} onChange={(event) => patch({ alphaVersionId: event.target.value })} aria-label="Alpha version" />}
        </Field>
        </>) : null}
        <div className="flex flex-none gap-1" role="group" aria-label="Binding mode">
          {([true, false] as const).map((bound) => (
            <button
              key={String(bound)}
              type="button"
              data-binding={bound ? "bound" : "scratch"}
              data-selected={draft.bound === bound}
              onClick={() => patch({ bound })}
              className="mono rounded-[5px] border px-2.5 py-1 text-[10px]"
              style={{
                borderColor: draft.bound === bound ? "var(--accent)" : "var(--line)",
                background: draft.bound === bound ? "var(--accent-soft)" : "var(--paper-raised)",
                color: draft.bound === bound ? "var(--accent)" : "var(--ink-soft)",
              }}
            >
              {bound ? "bound" : "scratch"}
            </button>
          ))}
        </div>
      </div>

      {/* HiFi 02-4: nothing chosen, nothing to report — six "not reported"
          labels before a choice said nothing. */}
      {draft.bound && draft.alphaVersionId === "" ? null : draft.bound ? (
        <div
          className="flex flex-wrap gap-x-5 gap-y-1.5 rounded-[6px] border px-3 py-2"
          style={{ borderColor: "var(--line-soft)", background: "var(--paper)" }}
          data-passport
        >
          {([
            ["alpha", bound?.display_name ?? bound?.alpha_id ?? null],
            ["version", bound?.version_label ?? null],
            ["lifecycle", bound?.lifecycle_state ?? null],
            ["source", bound?.source_digest_prefix ?? null],
            ["entrypoint", limits.entrypoint ?? null],
            ["declared timeframes", limits.declaredTimeframes?.join(" · ") || null],
          ] as const).map(([label, value]) => (
            <span key={label} className="flex items-baseline gap-1.5">
              <Label>{label}</Label>
              {/* A fact the manifest did not carry is absent, not a dash. */}
              {value === null ? (
                <span className="text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
                  not reported
                </span>
              ) : label === "lifecycle" ? (
                <span
                  className="mono text-[10.5px]"
                  data-lifecycle-state={value}
                  title={LIFECYCLE_NOTE[value]}
                  style={{ color: value === "ACTIVE" ? "var(--good)" : value === "DRAFT" ? "var(--role-holdout)" : "var(--ink-faint)" }}
                >
                  {value}
                </span>
              ) : (
                <span className="mono text-[10.5px]">{value}</span>
              )}
            </span>
          ))}
          {supersedes ? (
            <span className="flex items-baseline gap-1.5" data-supersedes={supersedes.kind}>
              <Label>supersedes</Label>
              {supersedes.kind === "absent" ? (
                <span className="text-[10px] italic" style={{ color: "var(--ink-faint)" }} title={supersedes.code ?? undefined} data-supersedes-code={supersedes.code ?? undefined}>
                  {supersedes.text}
                </span>
              ) : (
                <span className="mono text-[10.5px]">{supersedes.text}</span>
              )}
            </span>
          ) : null}
          {blockedWords !== null ? (
            <span className="flex items-baseline gap-1.5" data-run-admission="refused" title={admission?.code ?? undefined}>
              <Label>runs</Label>
              <span className="text-[10.5px] font-semibold" style={{ color: "var(--bad)" }}>cannot create runs — {blockedWords}</span>
            </span>
          ) : null}
          {lookedUp !== null ? <LastPublishedRc view={publications.get(lookedUp) ?? { state: "loading" }} /> : null}
          {/* HiFi 02-5b: where this version goes next. The library filters by
              alpha (not by version), so the link says "alpha". */}
          {bound ? (
            <span className="ml-auto flex items-center gap-3 text-[10px] font-semibold" style={{ color: "var(--accent)" }} data-passport-links>
              <LineageLink to={lineageHref(bound.alpha_id, { av: bound.alpha_version_id })} className="mono" action="open-lineage" title="This alpha's attempt lineage">
                lineage →
              </LineageLink>
              <Link to={`/research/quantbt/runs?alpha=${encodeURIComponent(bound.alpha_id)}`} className="mono" data-link="alpha-runs" title="Runs of this alpha in the Run Library">
                runs of this alpha →
              </Link>
              <Link to="/research/quantbt/alpha-import" className="mono" data-link="import-version" title="Import a new version of an alpha, then come back here">
                import new version →
              </Link>
            </span>
          ) : null}
        </div>
      ) : (
        <div
          className="flex flex-col gap-1 rounded-[6px] border-[1.5px] border-dashed px-3 py-2"
          style={{ borderColor: "var(--role-holdout)", background: "var(--paper)" }}
          data-scratch-banner
        >
          <span className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} title={SCRATCH_BANNER} data-scratch-note>
            Scratch — no release candidate can come from it.
          </span>
        </div>
      )}
    </Card>
  );
}

/**
 * FG-05 (Codex P22 closeout, S02; hi-fi 02 "last published rc"): the Alpha
 * version's latest delivered release candidate from
 * `researchAlphaVersionPublicationGetV1`. It shows the rc id, the raw
 * Governance status (the effective status beside it when the server sent
 * one), the server's `candidate_relation` and the publish time (`formatUtc`;
 * the exact instant is in the title). Absence is typed with the server's reason code. A refusal shows the
 * screen's own words, never the server's.
 */
function LastPublishedRc({ view }: { view: AlphaVersionPublicationView }) {
  let body: React.ReactNode;
  let state: string;
  if (view.state === "loading") {
    state = "loading";
    body = (
      <span className="text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
        reading the publication…
      </span>
    );
  } else if (view.state !== "available") {
    state = view.state;
    body = (
      <span className="text-[10px] italic" style={{ color: "var(--ink-faint)" }} data-last-rc-refusal={view.state}>
        {ALPHA_VERSION_PUBLICATION_WORDS[view.state]}
      </span>
    );
  } else if (view.read.publication === null) {
    state = view.read.availability;
    body = (
      <span className="text-[10px] italic" style={{ color: "var(--ink-faint)" }} data-last-rc-absent={view.read.reason_code ?? view.read.availability} title={view.read.reason_code ?? view.read.availability}>
        No release candidate yet
      </span>
    );
  } else {
    const found = view.read.publication;
    const status = approvalStatusWords(found);
    const effective = found.approval_read === "AVAILABLE" ? (found.approval?.effective_status ?? null) : null;
    state = found.candidate_relation;
    body = (
      <span className="mono text-[10.5px]" data-last-rc={found.release_candidate_id} data-last-rc-status={status.raw ?? found.approval_read}>
        {found.release_candidate_id} · {status.words}
        {effective !== null ? ` (effective ${effective})` : ""} · {found.candidate_relation} ·{" "}
        {found.published !== null ? (
          <span title={new Date(found.published.at_utc_ms).toISOString()}>
            published {formatUtc(found.published.at_utc_ms) ?? "time not published"}
          </span>
        ) : (
          "publish time not published"
        )}
      </span>
    );
  }
  return (
    <span className="flex items-baseline gap-1.5" data-last-published-rc={state}>
      <Label>last published rc</Label>
      {body}
    </span>
  );
}

/** The strategy of the run: the alpha's own when bound (nothing to choose), a free id when scratch. */
function StrategyStep({
  draft,
  patch,
  error,
  onAllParameters,
}: {
  draft: RunDraft;
  patch: (change: Partial<RunDraft>) => void;
  error: string | null;
  onAllParameters?: () => void;
}) {
  return (
    <Card title="Strategy">
      <Field
        label="strategy_id"
        hint={draft.bound ? (draft.alphaVersionId === "" ? undefined : "pinned to the alpha id") : "free while scratch"}
      >
        <input
          className={INPUT_CLASS}
          style={inputStyle(Boolean(error))}
          value={effectiveStrategyId(draft)}
          readOnly={draft.bound}
          onChange={(e) => patch({ strategyId: e.target.value })}
          aria-label="Strategy id"
        />
      </Field>
      {draft.bound && draft.parameters.length > 0 ? (
        <p className="m-0 flex flex-wrap items-center gap-1.5 text-[10.5px]" data-declared-params-summary style={{ color: "var(--ink-soft)" }}>
          <span className="mono">{draft.parameters.length} declared parameters</span>
          {draft.parameters.slice(0, 4).map((entry) => (
            <span key={entry.name} className="mono rounded-full border px-2 py-px text-[9.5px]" style={{ borderColor: "var(--line)", color: "var(--ink-faint)" }}>
              {entry.name}
            </span>
          ))}
          {onAllParameters ? (
            <button type="button" className="btn-ghost mono text-[10px]" data-action="all-parameters" onClick={onAllParameters}>
              all →
            </button>
          ) : null}
        </p>
      ) : null}
      {error ? <ErrorBlock message={error} /> : null}
    </Card>
  );
}

/** The protocol the run is validated under; it decides which windows the next block asks for. */
/** With recipes on offer the mode and schedule are already chosen by the recipe; the two selects stay available, folded, for a custom change. */
function CustomizeDisclosure({ folded, summary, children }: { folded: boolean; summary: string; children: React.ReactNode }) {
  if (!folded) return <>{children}</>;
  return (
    <details className="rounded-[6px] border px-2.5 py-1.5" style={{ borderColor: "var(--line)" }} data-customize>
      <summary className="mono cursor-pointer text-[10px]" style={{ color: "var(--ink-soft)" }}>
        Customize mode and schedule · {summary}
      </summary>
      <div className="pt-2">{children}</div>
    </details>
  );
}

function ProtocolToggle({ draft, patch }: { draft: RunDraft; patch: (change: Partial<RunDraft>) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Protocol" title="Only the protocols the installed engine release certifies are offered.">
      {(["three_window_decay", "advanced"] as const).map((protocol) => (
        <button
          key={protocol}
          type="button"
          data-protocol={protocol}
          data-selected={draft.protocol === protocol}
          onClick={() => patch({ protocol })}
          className="mono rounded-[5px] border px-2.5 py-1 text-[10px]"
          style={{
            borderColor: draft.protocol === protocol ? "var(--accent)" : "var(--line)",
            background: draft.protocol === protocol ? "var(--accent-soft)" : "var(--paper-raised)",
            color: draft.protocol === protocol ? "var(--accent)" : "var(--ink-soft)",
          }}
        >
          {protocol === "three_window_decay" ? "Three-Window Decay" : "Advanced Walk-Forward"}
        </button>
      ))}
    </div>
  );
}

function RouteStep({
  draft,
  patch,
  atlas,
  atlasState,
  limits,
  error,
}: {
  draft: RunDraft;
  patch: (change: Partial<RunDraft>) => void;
  atlas: AtlasDocument | null;
  /** State of the Atlas read; the card keeps its one heading in every state. */
  atlasState: ResearchState;
  limits: DraftConstraints;
  error: string | null;
}) {
  /* The reason of the not-admitted route the reader last pointed at or focused: a tooltip alone is invisible on touch. */
  const [blockedHint, setBlockedHint] = useState<{ id: string; text: string } | null>(null);
  return (
    <Card
      title="Execution route — how orders come to exist"
      meta={
        <span className="flex items-baseline gap-3">
          <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
            {atlas ? `${atlas.routes.filter((route) => !limits.blockedRoutes[route.route_id]).length} of ${atlas.routes.length} routes admitted` : null}
          </span>
          {/* HiFi 02-11: the atlas link lives in the route card. */}
          <Link to="/research/quantbt/atlas" data-link="atlas" className="mono text-[10px] font-semibold" style={{ color: "var(--accent)" }} title="Every route, protocol and ceiling the installed engine publishes">
            full route atlas →
          </Link>
        </span>
      }
    >
      {/* One heading: the card's. The panel only carries the Atlas read's state. */}
      <ResearchPanel title="engine routes" state={atlasState} minBodyHeight={120} variant="plain">
      {atlas === null ? (
        <p className="text-[11px]" style={{ color: "var(--ink-soft)" }} data-no-atlas>
          The route grid is read from the Engine Atlas. It is not available, so no route can be
          offered — the form does not carry a local copy of the release's routes.
        </p>
      ) : (
        <>
          {/* Admitted routes first, as selectable cards. */}
          <div className="flex flex-wrap gap-2" data-route-grid>
            {atlas.routes
              .filter((route) => !limits.blockedRoutes[route.route_id])
              .map((route) => {
                const selected = draft.executionRoute === route.route_id;
                return (
                  <button
                    key={route.route_id}
                    type="button"
                    data-route-card={route.route_id}
                    data-selected={selected}
                    aria-pressed={selected}
                    onClick={() => patch({ executionRoute: route.route_id as RunDraft["executionRoute"] })}
                    className="flex w-[calc(25%-6px)] min-w-[190px] flex-col gap-[3px] rounded-[6px] border px-2.5 py-2 text-left"
                    style={{
                      borderColor: selected ? "var(--accent)" : "var(--line)",
                      background: selected ? "var(--accent-soft)" : "var(--paper-raised)",
                      cursor: "pointer",
                    }}
                  >
                    <span className="flex items-baseline justify-between gap-1.5">
                      <span className="mono text-[10.5px] font-semibold">{route.route_id}</span>
                      {route.status_word ? (
                        <span
                          className="mono rounded-[3px] border px-1 text-[8.5px] font-bold leading-[13px]"
                          style={{
                            /* Text in an ink token (4.5:1 on the selected card's tint); the tone stays on the border. */
                            color: "var(--ink-soft)",
                            borderColor: statusTone(route.status_word).color,
                            borderStyle: statusTone(route.status_word).dashed ? "dashed" : "solid",
                          }}
                          data-route-status={route.status_word}
                        >
                          {route.status_word}
                        </span>
                      ) : null}
                    </span>
                    {route.engine_facts ? (
                      <span className="text-[9.5px] leading-[1.4]" style={{ color: "var(--ink-soft)" }} data-route-desc={route.route_id}>
                        {route.engine_facts.description}
                      </span>
                    ) : null}
                    <span className="mono text-[8.5px]" style={{ color: "var(--ink-faint)" }}>
                      {/* Family and contract can be the same word (`legacy`): printed once (R21/T16). */}
                      {route.family === route.execution_contract ? route.family : `${route.family} · ${route.execution_contract}`}
                    </span>
                  </button>
                );
              })}
          </div>
          {/* The rest under one line; each route's served reason is its tooltip. */}
          {atlas.routes.some((route) => limits.blockedRoutes[route.route_id]) ? (
            <details data-routes-not-admitted>
              <summary className="mono cursor-pointer text-[10.5px]" style={{ color: "var(--ink-soft)" }} data-routes-not-admitted-summary>
                {atlas.routes.filter((route) => limits.blockedRoutes[route.route_id]).length} routes not admitted
              </summary>
              <div className="flex flex-wrap gap-1.5 pt-1.5">
                {atlas.routes
                  .filter((route) => limits.blockedRoutes[route.route_id])
                  .map((route) => {
                    const blocked = limits.blockedRoutes[route.route_id]!;
                    return (
                      <button
                        key={route.route_id}
                        type="button"
                        aria-disabled="true"
                        aria-label={`${route.route_id}, not admitted — ${blocked}`}
                        title={blocked}
                        data-route-card={route.route_id}
                        data-route-blocked="true"
                        onFocus={() => setBlockedHint({ id: route.route_id, text: blocked })}
                        onMouseEnter={() => setBlockedHint({ id: route.route_id, text: blocked })}
                        onClick={() => setBlockedHint({ id: route.route_id, text: blocked })}
                        className="mono rounded-[6px] border border-dashed px-2 py-[3px] text-[10px]"
                        style={{
                          borderColor: blockedHint?.id === route.route_id ? "var(--ink-faint)" : "var(--line-strong)",
                          color: "var(--ink-faint)",
                          background: "var(--paper)",
                          cursor: "not-allowed",
                        }}
                      >
                        {route.route_id}
                      </button>
                    );
                  })}
              </div>
              {blockedHint ? (
                <p className="mono pt-1 text-[10px] leading-[1.45]" style={{ color: "var(--ink-soft)" }} data-route-blocked-reason={blockedHint.id}>
                  {blockedHint.id} — {blockedHint.text}
                </p>
              ) : null}
            </details>
          ) : null}
        </>
      )}
      {atlas ? <RoutePanel route={atlas.routes.find((route) => route.route_id === draft.executionRoute) ?? null} /> : null}
      {error ? <ErrorBlock message={error} /> : null}
      </ResearchPanel>
    </Card>
  );
}

/** Spec 02 §5.2 method notes, keyed by the engine-derived method (CG-P04-06). */
const ROUTE_METHOD_NOTE: Record<string, string> = {
  wfo: "Walk-forward searches strategy parameters.",
  tape: "Tape replay — one pass over the tape span.",
  single_pass: "Single pass — no walk-forward target.",
};

/**
 * The selected route's facts (spec 02 §5.2), all from the Atlas.
 *
 * Route parameters are shown as the engine's own vocabulary next to the form
 * values it accepts. The four route forms stay descriptive while the route is
 * not admitted: a control the server will refuse is not offered as a choice.
 */
function RoutePanel({ route }: { route: AtlasDocument["routes"][number] | null }) {
  if (!route) return null;
  const facts = route.engine_facts ?? null;
  const resolved = facts?.resolved_backend ?? null;
  const backendText = resolved?.state === "RESOLVED" ? resolved.value : resolved?.state === "SPEC_DEPENDENT" ? "backend per specification" : route.backend;
  return (
    <div
      className="flex flex-col gap-2 rounded-[6px] border px-3 py-2.5"
      style={{ borderColor: "var(--line-soft)", background: "var(--paper)" }}
      data-route-panel={route.route_id}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="mono text-[11px] font-semibold">{route.route_id}</span>
        <span className="mono rounded-[3px] border px-1 text-[9px]" style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
          {route.execution_contract}
        </span>
        {/* The backend word can be the contract's own (`legacy` twice): the second is dropped (R21/T16). */}
        {backendText !== route.execution_contract ? (
          <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} title={resolved?.reason ?? undefined} data-route-backend>
            {backendText}
          </span>
        ) : null}
        {facts ? (
          <span
            className="ml-auto text-[10px]"
            style={{ color: facts.method === "wfo" ? "var(--good)" : "var(--accent-2)" }}
            data-route-method-note={facts.method}
          >
            {ROUTE_METHOD_NOTE[facts.method] ?? facts.method}
          </span>
        ) : null}
      </div>
      {facts?.support_matrix ? (
        <div className="flex flex-col" data-route-support>
          {facts.support_matrix.rows.map((row) => (
            <span key={row.spec_id} className="mono text-[9.5px]" style={{ color: row.status === "supported" ? "var(--ink-soft)" : "var(--ink-faint)" }}>
              {row.spec_id} · {row.status}
              {row.status === "supported" ? "" : ` — ${row.route}`}
            </span>
          ))}
        </div>
      ) : null}
      {facts?.route_params ? (
        <div className="flex flex-wrap gap-3" data-route-form={facts.route_params.group}>
          {facts.route_params.fields.map((field) => (
            <label key={field.name} className="flex min-w-[180px] flex-col gap-0.5">
              <span className="mono text-[9.5px] uppercase tracking-[.06em]" style={{ color: "var(--ink-faint)" }}>{field.name}</span>
              {field.requested_spec_values.length > 0 ? (
                <select className={INPUT_CLASS} style={inputStyle()} disabled aria-label={field.name} title={field.note}>
                  {field.requested_spec_values.map((value) => (
                    <option key={value} value={value} disabled={!field.accepted_by_engine.includes(value)}>
                      {value}
                      {field.accepted_by_engine.includes(value) ? "" : " — not an engine value"}
                    </option>
                  ))}
                </select>
              ) : (
                <input className={INPUT_CLASS} style={inputStyle()} disabled aria-label={field.name} placeholder={field.engine_field ?? field.name} />
              )}
              <span className="text-[9px] leading-[1.4]" style={{ color: "var(--ink-faint)" }}>{field.note}</span>
            </label>
          ))}
        </div>
      ) : null}
      {route.axes.admission !== "P04_BASELINE_ONLY" ? (
        <span className="text-[10px]" style={{ color: "var(--ink-soft)" }}>{route.reason}</span>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------- coverage prefill (D4) */

/** The coverage as the reader reads it: `2020-01 → 2026-09 · 81 months`. */
function barInstant(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
}

function coverageSpan(source: CoverageSource): string {
  /* Exact bar edges: the first and last bar of the chosen timeframe, as the index served them (UTC). */
  if (source.exact) return `${barInstant(source.exact.firstBarUtcMs)} → ${barInstant(source.exact.lastBarUtcMs)} (${source.exact.timeframe})`;
  const months =
    source.months === source.monthsSpanned
      ? `${source.months} month${source.months === 1 ? "" : "s"}`
      : `${source.months} of ${source.monthsSpanned} months present`;
  return `${source.firstMonth} → ${source.lastMonth} · ${months}`;
}

/** The caption under a prefilled field: its source, and which edge of the coverage it is. */
function prefillCaption(field: PrefillField, source: CoverageSource): string {
  const start = field === "is.start" || field === "walkForward.start";
  const edge = source.exact
    ? start
      ? `first ${source.exact.timeframe} bar`
      : `end of the last ${source.exact.timeframe} bar`
    : start
      ? `first day of ${source.firstMonth}`
      : `end of ${source.lastMonth}`;
  /* The source (dataset, symbol, span) is the note above the windows; the caption names only the edge (T04). */
  return `prefilled · ${edge}`;
}

/** The field's caption node, or nothing when the field holds a value that is not from coverage. */
function prefillHint(draft: RunDraft, field: PrefillField | null): React.ReactNode {
  const source = field === null ? null : carriedCoverage(draft, field);
  if (field === null || source === null) return undefined;
  return <span style={{ color: "var(--ink-soft)" }} data-prefill-caption={field}>{prefillCaption(field, source)}</span>;
}

/**
 * The reader's own edit of a field. For one of the four outer bounds it also
 * records that the value is theirs, so no later pick replaces it.
 */
function touchPatch(draft: RunDraft, field: PrefillField | null): Pick<RunDraft, "coveragePrefill"> | Record<string, never> {
  return field === null ? {} : { coveragePrefill: markPrefillTouched(draft, field) };
}

/**
 * The Market data step (S02_DATA): dataset identity, a searchable symbol
 * picker with served coverage, a chip per served timeframe, and the version's
 * declaration as chips. Every value is a served catalog or registry fact; the
 * coverage-vs-window comparison draws on the review rail's timeline.
 *
 * Prefill (`planCoverage`) is done in the reader's own handlers, never in an
 * effect, so a late catalog or a copied run cannot overwrite anything.
 */
function DataStep({
  draft,
  patch,
  limits,
  error,
  catalog = null,
  catalogReason = null,
  registry = [],
  profileFit = null,
  onSymbolMiss,
  workspaceId,
  setupStatus = "idle",
}: {
  draft: RunDraft;
  patch: (change: Partial<RunDraft>) => void;
  limits: DraftConstraints;
  error: string | null;
  /** Reports the typed symbol when the server's own search says the dataset does not list it (a partial list). */
  onSymbolMiss?: (symbol: string | null) => void;
  workspaceId?: string;
  /** The run-setup read: while it serves (or is asked) the suggestion owns the windows, not the coverage envelope. */
  setupStatus?: RunSetupState["status"];
  /** CG-P08-04: the research dataset catalog, or null when it was not read. */
  catalog?: DatasetCatalog | null;
  catalogReason?: string | null;
  registry?: readonly RegistryEntry[];
  /** The timeframes the admitted profiles that fit this declaration cover; null restricts nothing. */
  profileFit?: { timeframes: readonly string[]; profileIds: readonly string[] } | null;
}) {
  const dataset: CatalogDataset | null = catalog?.datasets.find((item) => item.dataset_id === draft.datasetId) ?? null;
  /* FG-08 (FE-A1-01): client sentence, then the typed facts in mono. */
  const catalogNote = catalogReason ? splitCatalogReason(catalogReason) : null;
  const symbols = dataset?.symbols.state === "PUBLISHED" ? dataset.symbols.items : [];
  /* v2: a list the catalog served only in part is searched on the server; its answer, not this list, says "unlisted". */
  const listing = symbolListing(dataset);
  const [serverMiss, setServerMiss] = useState<string | null>(null);
  const [serverItems, setServerItems] = useState<readonly CatalogSymbol[]>([]);
  const richSymbols = symbols.some(hasDeclarationFacts);
  /* B7: the index's as-of, or why it has none; null for a v1 catalog. */
  const catalogIndex = readCatalogIndex(catalog);
  const typedSymbol = draft.symbol.trim().toUpperCase();
  const selectedSymbol = symbols.find((item) => item.symbol === typedSymbol) ?? serverItems.find((item) => item.symbol === typedSymbol) ?? null;
  const missRef = useRef(onSymbolMiss);
  missRef.current = onSymbolMiss;
  useEffect(() => {
    missRef.current?.(serverMiss !== null && serverMiss === typedSymbol ? serverMiss : null);
  }, [serverMiss, typedSymbol]);
  const pickDataset = (datasetId: string) =>
    patch({ datasetId, ...applyCoveragePrefillFor(draft, planCoverage(catalog, datasetId, draft.symbol, draft.timeframe), setupStatus) });
  const pickSymbol = (symbol: string) =>
    patch({ symbol, ...applyCoveragePrefillFor(draft, planCoverage(catalog, draft.datasetId, symbol, draft.timeframe), setupStatus) });
  /* The exact bar edges differ per timeframe, so a timeframe pick re-places bounds the reader never touched. */
  const pickTimeframe = (timeframe: string) =>
    patch({
      timeframe,
      ...(draft.coveragePrefill?.source ? applyCoveragePrefillFor(draft, planCoverage(catalog, draft.datasetId, draft.symbol, timeframe), setupStatus) : {}),
    });
  const prefillPlan = planCoverage(catalog, draft.datasetId, draft.symbol, draft.timeframe);
  /* One line, and only while the popup has no match to offer: typing `BNB` shows BNBUSDT, which is no reason to say "not listed". */
  const unlistedShown =
    selectedSymbol === null
    && dataset !== null
    && dataset.symbols.state === "PUBLISHED"
    && typedSymbol !== ""
    && (listing?.partial !== true || serverMiss === typedSymbol)
    && !symbols.some((item) => item.symbol.includes(typedSymbol))
    && !serverItems.some((item) => item.symbol.includes(typedSymbol));
  const publishedTimeframes = limits.declaredTimeframes ?? [];
  const timeframeDeclared = publishedTimeframes.includes(draft.timeframe);
  const versionLabel = bindingVersionLabel(draft, registry);
  const chips = timeframeChips(dataset, limits.declaredTimeframes, draft.timeframe, !draft.bound, profileFit);
  const warnings = coverageWarnings(draft, coverageRange(prefillPlan));
  const available = catalog?.datasets.filter((item) => item.availability === "available") ?? [];
  const unavailable = catalog?.datasets.filter((item) => item.availability !== "available") ?? [];
  /* One available dataset is the only choice: identity row, no select. */
  const soleDataset = catalog !== null && available.length === 1 ? available[0]! : null;
  return (
    <Card title="Market data">
      <div className="flex flex-col gap-1.5" data-dataset-block>
        <span title="Historical source — backtest only. Realtime and paper are separate services."><Label>Dataset</Label></span>
        {catalog === null ? (
          <>
            <input
              className={INPUT_CLASS}
              style={inputStyle()}
              value={draft.datasetId}
              onChange={(e) => pickDataset(e.target.value)}
              aria-label="Dataset"
            />
            {catalogNote ? (
              <span className="text-[10px]" style={{ color: "var(--ink-faint)" }} data-catalog-unread>
                Dataset catalog not read: {catalogNote.sentence}
                {catalogNote.facts ? (
                  <>
                    {" "}
                    <span className="mono text-[9.5px]" data-catalog-facts>{catalogNote.facts}</span>
                  </>
                ) : null}
              </span>
            ) : null}
          </>
        ) : soleDataset ? (
          <>
            <DatasetIdentity labelled dataset={soleDataset} chosen={draft.datasetId === soleDataset.dataset_id} onUse={() => pickDataset(soleDataset.dataset_id)} index={catalogIndex} />
            <UnavailableDatasets datasets={unavailable} />
          </>
        ) : (
          <>
            <select
              className={INPUT_CLASS}
              style={inputStyle()}
              value={draft.datasetId}
              onChange={(e) => pickDataset(e.target.value)}
              aria-label="Dataset"
              data-dataset-select
            >
              <option value="">choose a dataset</option>
              {catalog.datasets.map((item) => (
                <option
                  key={item.dataset_id}
                  value={item.dataset_id}
                  disabled={item.availability !== "available"}
                  title={item.availability !== "available" ? item.unavailable_reason ?? "unavailable" : undefined}
                >
                  {item.dataset_id} · {item.availability}
                </option>
              ))}
            </select>
            {dataset ? <DatasetIdentity dataset={dataset} chosen onUse={() => pickDataset(dataset.dataset_id)} index={catalogIndex} /> : null}
            <UnavailableDatasets datasets={unavailable} />
          </>
        )}
        {dataset && dataset.availability !== "available" ? (
          <span className="text-[10px]" style={{ color: "var(--bad)" }}>{dataset.unavailable_reason ?? "This dataset is unavailable."}</span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-start gap-x-4 gap-y-2.5">
        <div className="flex min-w-[220px] flex-1 flex-col gap-1">
          <span title={catalog?.coverage_rule ?? undefined}><Label>Symbol *</Label></span>
          <SymbolCombobox
            workspaceId={workspaceId}
            value={draft.symbol}
            symbols={symbols}
            total={dataset?.symbols.total ?? null}
            truncated={dataset?.symbols.truncated === true}
            bad={error !== null && (draft.symbol.trim().length === 0 || error.endsWith("is not a listed symbol."))}
            onChange={pickSymbol}
            datasetId={dataset?.dataset_id ?? ""}
            timeframe={draft.timeframe}
            nextCursor={listing?.nextCursor ?? null}
            onServerMiss={setServerMiss}
            onServerItems={setServerItems}
          />
          {selectedSymbol ? (
            <SymbolFacts symbol={selectedSymbol} timeframe={draft.timeframe} rich={richSymbols} />
          ) : unlistedShown ? (
            <span className="text-[10px]" style={{ color: "var(--accent-2)" }} data-symbol-unlisted title="Preflight refuses a symbol this dataset does not list.">
              {typedSymbol} is not a listed symbol
            </span>
          ) : dataset?.symbols.state === "NOT_PUBLISHED" ? (
            <span className="text-[10px]" style={{ color: "var(--ink-faint)" }}>{dataset.symbols.reason}</span>
          ) : null}
        </div>
        <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
          <Label>Timeframe *</Label>
          <TimeframeChips
            chips={chips}
            version={versionLabel}
            bad={draft.bound && publishedTimeframes.length > 0 && !timeframeDeclared}
            onPick={pickTimeframe}
          />
        </div>
      </div>

      <CoverageWarnings warnings={warnings} coverage={coverageRange(prefillPlan)} />

      {/* D4: what the pick did to the walk-forward dates — filled, kept, or
          why nothing was. Silent until a dataset is chosen. */}
      {/* The Symbol field is right above and the Walk-forward step says "Pick a symbol to prefill windows" where the blank dates are: not a third time here. */}
      {/* T04: that bounds were prefilled is said once, on the Walk-forward step where they are; here only a reason nothing could be. */}
      {draft.datasetId !== "" && prefillPlan.state !== "no-symbol" && prefillPlan.state !== "symbol-unlisted" && prefillPlan.state !== "ready" ? (
        <p className="text-[9.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-window-prefill-status data-prefill-state={prefillPlan.state}>
          {prefillPlan.reason}
        </p>
      ) : null}

      {/* E4 (audit 02-12): what the bound version needs, as chips. Shown, not
          checked: the server is still the authority at preflight. The long
          sentence that used to sit here is the chips' tooltips. */}
      <div className="flex flex-wrap items-center gap-1.5" data-declaration-box>
        {([
          ["required columns", limits.requiredColumns === null ? null : limits.requiredColumns.join(" · "), "Columns the version declares; the server checks them at preflight."],
          ["warmup bars", limits.warmupBars === null ? null : String(limits.warmupBars), "Bars the version declares it needs before the analysis start; the server checks the exact range at preflight."],
          ["seed", limits.seedRequired === null ? null : limits.seedRequired ? "required" : "not required", "determinism.seed_required, as the version declares it."],
        ] as const).filter(([, value]) => value !== null).map(([label, value, hint]) => (
          <span
            key={label}
            className="flex items-baseline gap-1.5 rounded-[3px] border px-1.5 py-[1px]"
            style={{ borderColor: "var(--line-soft)", background: "var(--paper)" }}
            title={hint}
            data-declaration-fact={label}
          >
            <Label>{label}</Label>
            <span className="mono text-[10.5px]">{value}</span>
          </span>
        ))}
      </div>
      {/* An unlisted symbol is said once, under the symbol field. */}
      {error && !(unlistedShown && error.endsWith("is not a listed symbol.")) ? <ErrorBlock message={error} /> : null}
    </Card>
  );
}

/** The short label the header chip prints for the bound version; the id when the registry has none. */
function bindingVersionLabel(draft: Pick<RunDraft, "alphaId" | "alphaVersionId">, registry: readonly RegistryEntry[]): string {
  if (!draft.alphaVersionId) return "the bound version";
  return (
    registry.find((entry) => entry.alpha_version_id === draft.alphaVersionId && (draft.alphaId === "" || entry.alpha_id === draft.alphaId))
      ?.version_label ?? draft.alphaVersionId
  );
}

/** The profile id that fixes a value, when the draft holds exactly that value; else undefined (the field stays editable). */
function pinnedBy(profile: ProfilePins | null, pinned: string | null, current: string): string | undefined {
  return profile?.enabled && pinned !== null && pinned === current ? profile.profileId : undefined;
}

type PublishedOption ={ value: string; admission: string; reason?: string | null; note?: string; title?: string };

/**
 * The published options as the selected profile admits them (`frequencies`, `window_modes`).
 * A value the release admits but the selected profile does not stays visible and disabled, with the
 * profile as the reason; one that only another enabled profile of the family admits (the requested-spec
 * v2 one) stays selectable and says which profile it declares. No profile, or a profile that served no
 * list, leaves the release's options as they are.
 */
function profileOptions(
  options: readonly PublishedOption[] | null,
  profile: ProfilePins | null,
  family: readonly ProfilePins[],
  kind: "frequency" | "windowMode",
): readonly PublishedOption[] | null {
  if (options === null || profile === null || !profile.enabled) return options;
  const listOf = (entry: ProfilePins) => (kind === "frequency" ? admittedFrequencies(entry) : admittedWindowModes(entry));
  const admitted = listOf(profile);
  if (admitted === null) return options;
  return options.map((option): PublishedOption => {
    if (option.admission !== "ADMITTED" || admitted.includes(option.value)) return option;
    const other = family.find((entry) => entry.profileId !== profile.profileId && listOf(entry)?.includes(option.value));
    if (other) return { ...option, note: "v2", title: `needs requested-spec v2 · ${other.profileId}` };
    return { ...option, admission: "NOT_ADMITTED_BY_PROFILE", reason: `not admitted by ${profile.profileId}` };
  });
}

function PublishedSelect({
  label,
  value,
  options,
  fallback,
  onChange,
  minWidth,
  pinnedBy,
}: {
  label: string;
  value: string;
  options: readonly { value: string; admission: string; reason?: string | null; note?: string; title?: string }[] | null;
  fallback: string;
  onChange: (value: string) => void;
  minWidth?: number;
  /** The profile that fixes this value: the select is then read-only and says by whom. */
  pinnedBy?: string;
}) {
  if (options === null) {
    return (
      <Field label={label} minWidth={minWidth}>
        <span className="mono text-[10px]" style={{ color: "var(--ink-faint)" }} data-options-unpublished={label}>
          not published by this release
        </span>
      </Field>
    );
  }
  const refused = options.filter((option) => option.admission !== "ADMITTED");
  return (
    <Field label={label} minWidth={minWidth}>
      <select
        className={INPUT_CLASS}
        style={inputStyle()}
        value={value || fallback}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        data-published-select={label}
        disabled={pinnedBy !== undefined}
        title={pinnedBy !== undefined ? `pinned by ${pinnedBy}` : undefined}
        data-pinned-by={pinnedBy}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.admission !== "ADMITTED"} title={option.admission !== "ADMITTED" ? (option.reason ?? undefined) : option.title} data-option-refused={option.admission !== "ADMITTED" ? option.value : undefined} data-option-note={option.note}>
            {option.value}
            {option.admission !== "ADMITTED" ? " — not admitted" : option.note ? ` · ${option.note}` : ""}
          </option>
        ))}
      </select>
      {refused.length > 0 ? <span className="sr-only">{refused.map((option) => `${option.value}: ${option.reason ?? "not admitted"}`).join(". ")}</span> : null}
    </Field>
  );
}

/**
 * D4 — what filled the outer bounds, in words the reader can check.
 *
 * Three honest cases, never blended: values are on screen that a coverage put
 * there (name the dataset, symbol and the coverage, and say what was left
 * empty and why); coverage exists but every outer bound is the reader's own;
 * or nothing could be prefilled, with the reason this pick gave.
 */
/**
 * What a month edge is not. The warmup is the version's own declared fact (the
 * registry's `warmup_bars`); saying it here is a reminder, not a date — the
 * preflight owns the arithmetic and refuses what does not fit.
 */
function edgesSentence(warmupBars: number | null, protocol: RunDraft["protocol"]): string {
  const first = protocol === "advanced" ? "the analysis start" : "IS start";
  const warmup =
    warmupBars === null
      ? " and the declared warmup"
      : warmupBars > 0
        ? `, and the ${warmupBars} warmup bars the version declares must fit before ${first}`
        : "";
  return `Month edges, not bar times — preflight checks the exact range${warmup}. Every value stays editable.`;
}

function WindowPrefillNote({ draft, plan, warmupBars }: { draft: RunDraft; plan: CoveragePlan; warmupBars: number | null }) {
  const carried = outerFields(draft.protocol).flatMap((field) => carriedCoverage(draft, field) ?? []);
  const source = carried[0] ?? null;
  return (
    <div className="flex flex-col gap-0.5 text-[9.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-window-prefill-note data-prefill-state={source ? "prefilled" : plan.state}>
      {source ? (
        <p
          data-prefill-source
          title={[
            source.exact
              ? `Exact bar edges, UTC, end exclusive: the index's first bar and the end of its last closed bar for ${source.exact.timeframe}. Bars before the start are answered by the index, not computed here. Every value stays editable.`
              : `${source.timezone} month partitions. ${edgesSentence(warmupBars, draft.protocol)}`,
            draft.protocol === "advanced"
              ? "First OOS instant is left empty: the release publishes no default for it."
              : "IS end, OOS and holdout start are left empty: the server publishes no rule for splitting coverage into windows.",
          ].join(" ")}
        >
          Prefilled from {source.datasetId} · {source.symbol} · {coverageSpan(source)}
        </p>
      ) : plan.state === "ready" ? (
        <p
          data-prefill-reason
          title={`The coverage of ${plan.source.datasetId} · ${plan.source.symbol} is ${coverageSpan(plan.source)}. The outer bounds here hold your own values, so nothing was prefilled.`}
        >
          Your bounds kept · coverage {coverageSpan(plan.source)}
        </p>
      ) : (
        <p data-prefill-reason>{plan.reason}</p>
      )}
    </div>
  );
}

function WindowsStep({
  draft,
  patch,
  adopt = patch,
  atlas,
  error,
  catalog = null,
  warmupBars = null,
  profile = null,
  family = [],
  profiles = null,
  estimateStatus = IDLE_ESTIMATE,
  estimate = null,
  setup = IDLE_SETUP,
  workspaceId,
  timeframe = "",
  registry = [],
}: {
  draft: RunDraft;
  patch: (change: Partial<RunDraft>) => void;
  /** The Alpha's registered versions: the run types are read from the setup of each ACTIVE sibling. */
  registry?: readonly RegistryEntry[];
  /** S02 linked-window setup: the runnable options the Suggest / Apply / Reset bar reads. */
  setup?: RunSetupState;
  workspaceId?: string;
  /** The declared timeframe: the bar size the linked calendar steps and counts by. */
  timeframe?: string;
  /** The merged served estimate: its earliest start (bar-metadata) is offered only when the index published one. */
  estimate?: PreflightEstimate | null;
  /** Every enabled profile of this protocol, route and mode (v1 and v2): what a v2 declaration would be admitted by. */
  family?: readonly ProfilePins[];
  /** Every served profile (enabled or not): the causal one answers for its own schedule option. */
  profiles?: readonly ProfilePins[] | null;
  /** The declaration-estimate call: its typed refusal prints under the field it names. */
  estimateStatus?: EstimateStatus;
  /** Where the release defaults are adopted on arrival: not a reader edit, so it must not mark the step as touched. */
  adopt?: (change: Partial<RunDraft>) => void;
  /** LW-07: the profile this declaration falls under; it pins the fold granularity and window mode it serves. */
  profile?: ProfilePins | null;
  atlas: AtlasDocument | null;
  error: string | null;
  /** D4: the catalog the outer bounds were prefilled from. */
  catalog?: DatasetCatalog | null;
  /** D4: the warmup the bound version declares, or null when it was not read. */
  warmupBars?: number | null;
}) {
  const options = atlas?.current_release.walk_forward_options ?? null;
  const frequencyOptions = profileOptions(options?.frequency ?? null, profile, family, "frequency");
  const windowModeOptions = profileOptions(options?.window_mode ?? null, profile, family, "windowMode");
  /* Controls that only a requested-spec v2 profile admits (rolling width, label horizon, purge, embargo) appear
     only when a profile admits them: the selected one, or the v2 one a declaration of them would select. With no
     profile identified the release's own options stand, as before. */
  const specV2Served = profile === null || !profile.enabled || profile.requestedSpecVersions === null;
  const temporalAdmitted = specV2Served || admitsSpecV2(profile) || family.some((entry) => admitsSpecV2(entry));
  const rollingAdmitted = profile === null || !profile.enabled || admittedWindowModes(profile) === null || admittedWindowModes(profile)!.includes("rolling") || family.some((entry) => admittedWindowModes(entry)?.includes("rolling"));
  /* A choice only the v2 profile admits is what makes the declaration a v2 one; going back to a value the v1 profile admits drops it. */
  const walkForwardChoice = (kind: "frequency" | "windowMode", value: string): Partial<RunDraft["walkForward"]> => {
    const list = profile?.enabled ? (kind === "frequency" ? admittedFrequencies(profile) : admittedWindowModes(profile)) : null;
    const outside = list !== null && !list.includes(value);
    return { [kind]: value, ...(outside ? { declaredV2: true } : admitsSpecV2(profile) ? {} : { declaredV2: undefined }) };
  };
  const prefillPlan = planCoverage(catalog, draft.datasetId, draft.symbol, draft.timeframe);
  /* The profile a suggestion is asked for: the one this declaration falls under, else the only enabled one of the protocol and route
     (the mode and schedule selects sit below the windows, so a fixed protocol has its single profile before they are chosen). */
  /* The step error reddens the edges only when it is about the windows (a missing mode is not an edge's fault). */
  const windowsFlagged = Boolean(error) && validateWindows(draft) !== null;
  const recipes = useMemo(
    () =>
      recipesFromSetup(setup.options, {
        atlasModes: atlas?.modes,
        frequencyDefault: atlas?.current_release.walk_forward_options?.frequency_default,
        windowModeDefault: atlas?.current_release.walk_forward_options?.window_mode_default,
      }),
    [setup.options, atlas],
  );
  /* The recipe a fresh declaration of this protocol starts from: the first enabled one the setup serves (Quick check for Three Window). */
  /* The single route every enabled recipe of this version shares, when there is one (1.0.1 notional, 1.0.2 percent-equity). */
  const routeOfRecipes = (() => {
    const routes = new Set(recipes.filter((recipe) => recipe.enabled).map((recipe) => recipe.executionRoute));
    return routes.size === 1 ? ([...routes][0] ?? null) : null;
  })();
  /* The run types of this Alpha for this context (one GET per ACTIVE sibling version, cached): picking one switches the version. */
  /* The server names what each version binds (`version-options`); an older server without it is read version by version through the setup. */
  const versionOptions = useVersionOptions(draft.bound && draft.alphaId !== "", registry, { workspaceId, alphaId: draft.alphaId });
  const versionRoutes = useMemo(
    () => new Map([...versionOptions.byVersion].map(([id, options]) => [id, compatibleRoutes(options, draft.timeframe || null)] as const)),
    [versionOptions.byVersion, draft.timeframe],
  );
  const runTypeProbe = useRunTypes(setup.status === "served" && versionOptions.status === "absent", registry, setupContextFrom(draft, workspaceId), { versionId: draft.alphaVersionId, options: setup.options });
  const runTypes = runTypesFrom(versionOptions.status === "ready" ? versionRoutes : runTypeProbe.probed, registry.filter((entry) => entry.alpha_id === draft.alphaId), draft.alphaVersionId);
  const recipesOffered = setup.status === "served" && recipes.some((recipe) => recipe.enabled);
  const defaultRecipe = recipes.find((recipe) => recipe.enabled && recipe.protocol === draft.protocol && recipe.executionRoute === draft.executionRoute)
    ?? recipes.find((recipe) => recipe.enabled && recipe.protocol === draft.protocol)
    ?? null;
  const suggestionProfile = profile?.enabled ? profile : (defaultRecipe?.profile ?? (family.length === 1 ? family[0]! : null));
  /* A draft with no mode and schedule yet starts on that recipe, once per protocol: a default the reader sees and can change, never an overwrite. */
  const recipeAdopted = useRef<string | null>(null);
  useEffect(() => {
    if (setup.status !== "served" || defaultRecipe === null) return;
    /* A version serves the recipes of ONE route (1.0.1 notional, 1.0.2 percent-equity): when the draft's route has none, the draft follows the
       version to its default recipe, switching the route with it. Otherwise only an empty mode and schedule start on the default. */
    const routeServed = recipes.some((recipe) => recipe.enabled && recipe.executionRoute === draft.executionRoute);
    if (routeServed && (draft.optimizationMode !== "" || draft.optimizationSchedule !== "")) return;
    const key = `${draft.protocol}|${defaultRecipe.id}`;
    if (recipeAdopted.current === key) return;
    recipeAdopted.current = key;
    adopt(applyRecipe(defaultRecipe, draft));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup.status, defaultRecipe, recipes, draft.optimizationMode, draft.optimizationSchedule, draft.protocol, draft.executionRoute]);
  /* Switching protocol moves to that protocol's default recipe (its trials, seed, frequency and window mode), so nothing stays from the other one. */
  const switchProtocol = (change: Partial<RunDraft>) => {
    const next = change.protocol;
    const target = next !== undefined && next !== draft.protocol ? recipes.find((recipe) => recipe.enabled && recipe.protocol === next) : undefined;
    patch(target ? { ...change, ...applyRecipe(target, { ...draft, protocol: next! }) } : change);
  };

  /* The verified range: from the served coverage's first bar to the end of the last bar the index verified (its as-of, floored to a bar).
     Month-partition coverage says "to the end of the month", which can lie in the future: not a verified end, so no range then. */
  const verifiedRange = (() => {
    const served = coverageRange(prefillPlan);
    const barMs = timeframeBarMs(timeframe);
    const asOf = setup.options?.as_of_utc_ms ?? null;
    return served && barMs !== null && asOf !== null ? { from: served.from, to: Math.min(Math.floor(asOf / barMs) * barMs, served.to) } : null;
  })();
  const [proposal, setProposal] = useState<WindowSuggestion | null>(null);
  const recommended = proposal !== null ? suggestionToDayEdges(proposal, verifiedRange) : null;
  /* Every profile of this protocol and route is disabled for this Alpha: the server's typed reason, said where Suggest would be. */
  const unavailableReason =
    suggestionProfile === null && family.length === 0
      ? ((profiles ?? []).find((entry) => !entry.enabled && entry.protocol === draft.protocol && entry.executionRoute === draft.executionRoute && entry.reason !== null)?.reason ?? null)
      : null;
  /* U01: only the declaration-estimate answer serves the earliest start; no other estimate does. */
  const servedEstimate = estimateStatus.kind === "served" ? estimateStatus.estimate : estimate?.earliestStartUtcMs != null ? estimate : null;
  const modes = atlas?.modes ?? [];
  const selectedMode = modes.find((mode) => mode.mode_id === draft.optimizationMode) ?? null;
  const scheduleOptions = atlas && selectedMode ? scheduleChoices(atlas, selectedMode) : [];
  /* The causal profile (when served and selected) admits inner folds and says exactly what they must declare. */
  const selectedCausal = isCausalProfile(profile) && profile?.enabled === true ? profile : null;
  const innerConstraints = selectedCausal?.innerConstraints ?? null;
  /* The served word that refuses inner folds: a global profile's `inner_validation`, or the reason (else the state
     word) of a disabled causal profile. Null when inner folds are admitted or no profile speaks. */
  const innerLockWord: string | null =
    profile === null || draft.optimizationSchedule !== SCHEDULE_PER_FOLD_CAUSAL
      ? null
      : profile.optimizationSchedule === SCHEDULE_PER_FOLD_CAUSAL && !profile.enabled
        ? (profile.reason ?? "DISABLED")
        : profile.enabled && refusesInner(profile)
          ? profile.innerValidation
          : null;

  /* A draft adopts the release defaults once, so the form never submits an
     empty value the reader did not see. The defaults are the published ones. */
  useEffect(() => {
    if (!options || draft.protocol !== "advanced") return;
    const change: Partial<RunDraft["walkForward"]> = {};
    /* LW-07: a profile that serves the fold granularity or window mode supplies the
       default, when the release lists it as admitted; otherwise the release's own. */
    const admitted = (list: readonly { value: string; admission: string }[], value: string | null) =>
      value !== null && list.some((option) => option.value === value && option.admission === "ADMITTED") ? value : null;
    /* A profile that serves a LIST (the Alpha-bound setup does) supplies the release default when it admits it, else its first entry. */
    const fromList = (list: readonly string[] | null, kind: readonly { value: string; admission: string }[], releaseDefault: string): string | null =>
      list === null || list.length === 0 ? null : admitted(kind, list.includes(releaseDefault) ? releaseDefault : list[0]!);
    const profileFrequency = profile?.enabled ? (admitted(options.frequency, profile.granularity) ?? fromList(profile.frequencies, options.frequency, options.frequency_default)) : null;
    const profileWindowMode = profile?.enabled ? (admitted(options.window_mode, profile.windowMode) ?? fromList(profile.windowModes, options.window_mode, options.window_mode_default)) : null;
    if (!draft.walkForward.frequency) change.frequency = profileFrequency ?? options.frequency_default;
    if (!draft.walkForward.windowMode) change.windowMode = profileWindowMode ?? options.window_mode_default;
    if (Object.keys(change).length > 0) adopt({ walkForward: { ...draft.walkForward, ...change } });
  }, [options, draft.protocol, draft.walkForward, adopt, profile]);

  return (
    <Card title="Walk-forward">
      {setup.status === "served" ? (
        <>
          <RunTypePicker
            types={runTypes}
            current={draft.alphaVersionId}
            pending={runTypeProbe.status === "pending"}
            /* A version change starts the recipe over: its mode, schedule and trials were another version's. */
            onPick={(alphaVersionId) => patch({ alphaVersionId, optimizationMode: "", optimizationSchedule: "", optunaTrials: "" })}
          />
          <RecipePicker recipes={recipes} draft={draft} onPick={patch} disabledReason={contextClosure(setup.options) !== null ? setupReasonWords(contextClosure(setup.options)!.reasonCode) : null} />
          {routeOfRecipes !== null ? (
            <p className="mono text-[9.5px]" style={{ color: "var(--ink-soft)" }} data-route-note>
              This version runs the <strong>{humaniseTokens(routeOfRecipes)}</strong> route only: picking a recipe sets it.
            </p>
          ) : null}
          <AccountFacts account={(profile?.enabled ? profile : defaultRecipe?.profile)?.account} native={(profile?.enabled ? profile : defaultRecipe?.profile)?.nativeInput ?? null} />
        </>
      ) : null}
      {recipesOffered ? null : <ProtocolToggle draft={draft} patch={setup.status === "served" ? switchProtocol : patch} />}
      {setup.status !== "served" ? <WindowPrefillNote draft={draft} plan={prefillPlan} warmupBars={warmupBars} /> : null}
      {draft.protocol === "three_window_decay" ? (
        <div className="flex flex-col gap-2" data-three-window>
          <WindowSetupBar draft={draft} patch={patch} setup={setup} profileId={suggestionProfile?.profileId ?? null} unavailableReason={unavailableReason} workspaceId={workspaceId} range={verifiedRange} onProposal={setProposal} />
          <LinkedWindowCalendar
            idPrefix="s02-windows"
            edges={{ a: draft.windows.is.start, b: draft.windows.is.endExclusive, c: draft.windows.oos.endExclusive, d: draft.windows.holdout.endExclusive }}
            onChange={(next) => {
              const current = edgesOf(draft);
              if (current === null) return;
              const edges = { a: current.a, b: current.b, c: current.c, d: current.d, ...next };
              /* A copied draft whose windows overlap or leave a gap is not linked: editing A or D then changes only that
                 edge's own field, never the OOS or holdout start the reader (or the copy) set. B and C link by definition. */
              const relink = current.linked || next.b !== undefined || next.c !== undefined;
              patch({
                windows: relink
                  ? windowsFromEdges(edges)
                  : {
                      ...draft.windows,
                      ...(next.a !== undefined ? { is: { ...draft.windows.is, start: next.a } } : {}),
                      ...(next.d !== undefined ? { holdout: { ...draft.windows.holdout, endExclusive: next.d } } : {}),
                    },
                ...(next.a !== undefined ? touchPatch(draft, "is.start") : {}),
                ...(next.d !== undefined ? touchPatch(draft, "holdout.endExclusive") : {}),
              });
            }}
            barMs={timeframeBarMs(timeframe)}
            range={verifiedRange}
            recommended={recommended}
            warmupBars={warmupBars}
            maxSpanMs={profile?.enabled && profile.maxSpanDays !== null ? profile.maxSpanDays * 86_400_000 : null}
            invalid={{
              a: windowsFlagged || refusedAt(estimateStatus, "windows", "is", "start"),
              b: windowsFlagged || refusedAt(estimateStatus, "windows", "is", "end_exclusive") || refusedAt(estimateStatus, "windows", "oos", "start"),
              c: windowsFlagged || refusedAt(estimateStatus, "windows", "oos", "end_exclusive") || refusedAt(estimateStatus, "windows", "holdout", "start"),
              d: windowsFlagged || refusedAt(estimateStatus, "windows", "holdout", "end_exclusive"),
            }}
          />
          {(["is", "oos", "holdout"] as const).map((key) => <EstimateFieldRefusal key={key} status={estimateStatus} owns="windows" key2={key} />)}
          <EarliestStartOffer estimate={servedEstimate} start={draft.windows.is.start} onUse={(instant) => patch({ windows: windowsFromEdges({ ...edgesOf(draft)!, a: instant }), ...touchPatch(draft, "is.start") })} />
        </div>
      ) : (
        <div className="flex flex-wrap gap-2.5" data-advanced-window>
          <div className="w-full"><WindowSetupBar draft={draft} patch={patch} setup={setup} profileId={suggestionProfile?.profileId ?? null} unavailableReason={unavailableReason} workspaceId={workspaceId} range={verifiedRange} onProposal={setProposal} /></div>
          <Field minWidth={INSTANT_FIELD_WIDTH} label="Analysis start" hint={prefillHint(draft, "walkForward.start")}>
            <DateInput
              style={inputStyle(refusedAt(estimateStatus, "walk_forward", "start"))}
              value={draft.walkForward.start}
              onChange={(value) =>
                patch({
                  walkForward: { ...draft.walkForward, start: value },
                  ...touchPatch(draft, "walkForward.start"),
                })
              }
              label="Analysis start"
            />
          </Field>
          <Field minWidth={INSTANT_FIELD_WIDTH} label="End exclusive" hint={prefillHint(draft, "walkForward.endExclusive")}>
            <DateInput
              style={inputStyle(refusedAt(estimateStatus, "walk_forward", "end_exclusive"))}
              value={draft.walkForward.endExclusive}
              onChange={(value) =>
                patch({
                  walkForward: { ...draft.walkForward, endExclusive: value },
                  ...touchPatch(draft, "walkForward.endExclusive"),
                })
              }
              label="Analysis end exclusive"
            />
          </Field>
          <Field minWidth={INSTANT_FIELD_WIDTH} label="First OOS instant" title={options?.split_mode_rule}>
            <DateInput
              style={inputStyle(refusedAt(estimateStatus, "walk_forward", "split_mode"))}
              value={draft.walkForward.splitMode}
              onChange={(value) => patch({ walkForward: { ...draft.walkForward, splitMode: value } })}
              label="First OOS instant"
              dataSplitMode
            />
          </Field>
          <PublishedSelect
            label="Frequency"
            value={draft.walkForward.frequency}
            options={frequencyOptions}
            fallback={options?.frequency_default ?? ""}
            minWidth={120}
            pinnedBy={family.length > 1 ? undefined : pinnedBy(profile, profile?.granularity ?? null, draft.walkForward.frequency || options?.frequency_default || "")}
            onChange={(frequency) => patch({ walkForward: { ...draft.walkForward, ...walkForwardChoice("frequency", frequency) } })}
          />
          <PublishedSelect
            label="Window mode"
            value={draft.walkForward.windowMode}
            options={windowModeOptions}
            fallback={options?.window_mode_default ?? ""}
            minWidth={120}
            pinnedBy={family.length > 1 ? undefined : pinnedBy(profile, profile?.windowMode ?? null, draft.walkForward.windowMode || options?.window_mode_default || "")}
            onChange={(windowMode) => patch({ walkForward: { ...draft.walkForward, ...walkForwardChoice("windowMode", windowMode) } })}
          />
          <EstimateFieldRefusal status={estimateStatus} owns="walk_forward" />
          <div className="w-full empty:hidden">
            <EarliestStartOffer
              estimate={servedEstimate}
              start={draft.walkForward.start}
              onUse={(instant) => patch({ walkForward: { ...draft.walkForward, start: instant }, ...touchPatch(draft, "walkForward.start") })}
            />
          </div>
          {draft.walkForward.windowMode === "rolling" && rollingAdmitted ? (
            <Field label="Train width" title={options?.train_window?.rule ?? "Required for rolling, e.g. 180D or 72h."}>
              <input
                className={INPUT_CLASS}
                style={inputStyle(!/^[1-9][0-9]{0,4}(D|h)$/.test(draft.walkForward.trainWindow ?? ""))}
                value={draft.walkForward.trainWindow ?? ""}
                onChange={(e) => patch({ walkForward: { ...draft.walkForward, trainWindow: e.target.value.trim() || undefined } })}
                aria-label="Train width"
                placeholder="180D"
                data-train-window
              />
            </Field>
          ) : null}
          {options?.temporal_guards && temporalAdmitted ? (
            <div className="flex w-full flex-wrap items-end gap-2.5" data-temporal-guards data-release-default={options.temporal_guards.release_default} title={options.temporal_guards.rule}>
              {([
                ["labelHorizonBars", "Label horizon (bars)"],
                ["purgeBars", "Purge (bars)"],
                ["embargoBars", "Embargo (bars)"],
              ] as const).map(([key, label]) => (
                <Field key={key} label={label}>
                  <input
                    className={INPUT_CLASS}
                    style={inputStyle()}
                    inputMode="numeric"
                    value={draft.walkForward[key] ?? ""}
                    onChange={(e) => patch({ walkForward: { ...draft.walkForward, [key]: e.target.value.trim() || undefined } })}
                    aria-label={label}
                    placeholder={String(options?.temporal_guards?.release_default ?? "")}
                  />
                </Field>
              ))}
              {/* Spec v1 carries no guards. Choosing v2 is explicit: the published defaults fill the EMPTY fields only. */}
              {profile?.temporalGuards?.defaults && (["labelHorizonBars", "purgeBars", "embargoBars"] as const).some((key) => (draft.walkForward[key] ?? "").trim() === "") ? (
                <button
                  type="button"
                  className="btn-ghost mono text-[10px]"
                  data-action="adopt-guard-defaults"
                  title="Declare requested-spec v2 and fill the EMPTY guard fields with the release defaults; values you typed stay. A zero applies no temporal guard."
                  onClick={() => adopt({ walkForward: adoptGuardDefaults(draft.walkForward, profile.temporalGuards!.defaults!) })}
                >
                  Use v2 guards
                </button>
              ) : null}
              {(["labelHorizonBars", "purgeBars", "embargoBars"] as const).some((key) => guardAppliesNoProtection(draft.walkForward[key])) ? (
                <span className="mono text-[9.5px]" style={{ color: "var(--ink-soft)" }} data-guard-zero title="A zero label horizon, purge or embargo applies no temporal guard; it is the published default, not a protection.">
                  0 applies no guard
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {profile?.enabled && (profile.folds !== null || profile.maxSpanDays !== null) ? (
        <p className="mono text-[9.5px]" style={{ color: "var(--ink-soft)" }} title={`profile ${profile.profileId}`} data-profile-folds={profile.profileId}>
          {[
            profile.folds ? `folds ${profile.folds.min}–${profile.folds.max}` : null,
            profile.maxSpanDays !== null ? `span ≤ ${profile.maxSpanDays} days` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
      {profile?.enabled && draft.protocol === "advanced" && profile.granularity !== null && draft.walkForward.frequency !== "" && draft.walkForward.frequency !== profile.granularity ? (
        <p className="mono text-[10px]" style={{ color: "var(--accent-2)" }} data-outside-profile-field="frequency">
          Frequency {draft.walkForward.frequency} — profile {profile.granularity}. Kept as entered.
        </p>
      ) : null}

      {contextClosure(setup.options) !== null ? (
        <p className="mono text-[10px]" style={{ color: "var(--role-holdout)" }} data-context-closed={contextClosure(setup.options)!.reasonCode} role="status">
          No profile runs this Alpha on {draft.symbol || "this symbol"} {draft.timeframe} · {setupReasonWords(contextClosure(setup.options)!.reasonCode)}. Change the timeframe, symbol or dataset on Market data: that, not the mode, closes every option below.
        </p>
      ) : null}

      {/* Keep invalid schedules visible but disabled; the source explains why. */}
      <CustomizeDisclosure folded={recipesOffered} summary={`${draft.optimizationMode || "no mode"} × ${draft.optimizationSchedule || "no schedule"}`}>
      <div className="flex flex-wrap gap-2.5">
        <Field label="optimization_mode">
          <select
            className={INPUT_CLASS}
            style={inputStyle()}
            value={draft.optimizationMode}
            onChange={(e) => {
              const mode = modes.find((candidate) => candidate.mode_id === e.target.value);
              patch({ optimizationMode: e.target.value, optimizationSchedule: mode?.default_schedule ?? "" });
            }}
            aria-label="Optimization mode"
            title={draft.optimizationMode || undefined}
            disabled={modes.length === 0}
          >
            <option value="">{modes.length === 0 ? "Atlas not available" : "choose a mode"}</option>
            {modes.map((mode) => {
              /* The setup's catalogue disclosure: a mode with no opened pair for this Alpha is shown closed, with the server's reason. */
              const closed = engineModeClosed(setup.options, mode.mode_id);
              return (
                <option key={mode.mode_id} value={mode.mode_id} title={closed !== null ? `${closed.reasonCode ?? "NOT_OPENED"} · ${mode.mode_id}` : mode.mode_id} disabled={closed !== null} data-mode-closed={closed !== null ? (closed.reasonCode ?? "") : undefined}>
                  {mode.display_name || mode.mode_id}{closed !== null ? ` · ${setupReasonWords(closed.reasonCode ?? "PROFILE_NOT_OPENED")}` : ""}
                </option>
              );
            })}
          </select>
        </Field>
        <Field label="optimization_schedule">
          <select
            className={INPUT_CLASS}
            style={inputStyle()}
            value={draft.optimizationSchedule}
            onChange={(e) => patch({ optimizationSchedule: e.target.value })}
            aria-label="Optimization schedule"
            disabled={selectedMode === null}
          >
            <option value="">{selectedMode === null ? "choose a mode first" : "choose a schedule"}</option>
            {scheduleOptions.map(({ schedule, valid }) => {
              /* The profile says inner (per-fold causal) selection is not admitted: its served word is the reason. */
              /* The causal profile, when served, is the profile that answers for this schedule: its own
                 state and reason decide, whatever profile the draft currently falls under. */
              const causal = schedule === SCHEDULE_PER_FOLD_CAUSAL ? causalScheduleProfile(profiles, draft) : null;
              const refusingProfile = schedule !== SCHEDULE_PER_FOLD_CAUSAL ? null : causal ?? (profile?.enabled === true ? profile : null);
              const innerRefused = refusingProfile !== null && (!refusingProfile.enabled || refusesInner(refusingProfile));
              const pair = engineOptionPair(setup.options, draft.optimizationMode, schedule);
              const pairClosed = pair !== null && !pair.enabled;
              const shown = valid && !innerRefused && !pairClosed;
              const refusalWord = refusingProfile === null ? null : !refusingProfile.enabled ? (refusingProfile.reason ?? "DISABLED") : refusingProfile.innerValidation;
              return (
                <option
                  key={schedule}
                  value={schedule}
                  disabled={!shown}
                  title={shown ? (isCausalProfile(causal) ? `profile ${causal?.profileId}` : undefined) : pairClosed ? (pair?.reasonCode ?? "NOT_OPENED") : innerRefused ? `${refusalWord} · ${refusingProfile?.profileId}` : (selectedMode?.invalid_schedules?.find((entry) => entry.schedule === schedule)?.reason ?? "Not admitted for this mode in the installed release manifest.")}
                  data-invalid-schedule={shown ? undefined : schedule}
                  data-causal-profile={shown && isCausalProfile(causal) ? causal?.profileId : undefined}
                >
                  {schedule}{shown ? "" : pairClosed ? ` · ${setupReasonWords(pair?.reasonCode ?? "PROFILE_NOT_OPENED")}` : " · not admitted"}
                </option>
              );
            })}
          </select>
        </Field>
      </div>
      </CustomizeDisclosure>
      {draft.protocol === "advanced" && draft.optimizationMode === "mode_1_decay" && draft.optimizationSchedule === "per_fold_causal" && innerLockWord !== null && profile !== null ? (
        <p
          className="mono rounded-[6px] border px-3 py-2 text-[10px]"
          style={{ borderColor: "var(--line-soft)", color: "var(--ink-faint)" }}
          title={`${innerLockWord} · ${profile.profileId}`}
          aria-label={`Inner folds not admitted · ${innerLockWord} · ${profile.profileId}`}
          tabIndex={0}
          data-inner-folds="locked"
          data-reason-code={innerLockWord}
        >
          inner folds — not admitted · {innerLockWord}
        </p>
      ) : draft.protocol === "advanced" && draft.optimizationMode === "mode_1_decay" && draft.optimizationSchedule === "per_fold_causal" ? (
        <div className="flex flex-wrap items-end gap-2.5 rounded-[6px] border px-3 py-2" style={{ borderColor: "var(--line-soft)" }} data-inner-folds={selectedCausal ? "causal" : ""} title={options?.inner_folds?.rule}>
          <span className="w-full mono text-[9.5px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
            inner folds — decay selection stays inside each outer IS
          </span>
          {selectedCausal ? (
            <span className="w-full mono text-[9.5px]" style={{ color: "var(--ink-soft)" }} data-causal-profile={selectedCausal.profileId} title={`${selectedCausal.innerValidation} · ${selectedCausal.profileId}`}>
              {causalCapsText(selectedCausal)}
            </span>
          ) : null}
          {(() => {
            const inner = draft.walkForward.inner ?? { splitFrequency: "", windowMode: "expanding", trainWindow: "", minFolds: "" };
            const set = (change: Partial<typeof inner>) => patch({ walkForward: { ...draft.walkForward, inner: { ...inner, ...change } } });
            return (
              <>
                <Field label="Inner frequency">
                  <select className={INPUT_CLASS} style={inputStyle()} value={inner.splitFrequency} onChange={(e) => set({ splitFrequency: e.target.value })} aria-label="Inner frequency">
                    <option value="">choose</option>
                    {(innerConstraints && innerConstraints.frequencies.length > 0 ? innerConstraints.frequencies : (options?.inner_folds?.split_frequency ?? [])).map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </Field>
                <Field label="Inner window mode">
                  <select className={INPUT_CLASS} style={inputStyle()} value={inner.windowMode} onChange={(e) => set({ windowMode: e.target.value })} aria-label="Inner window mode">
                    {(innerConstraints && innerConstraints.windowModes.length > 0 ? innerConstraints.windowModes : (options?.inner_folds?.window_mode ?? ["expanding", "rolling"])).map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </Field>
                <Field label="Inner train width">
                  <input className={INPUT_CLASS} style={inputStyle()} value={inner.trainWindow} onChange={(e) => set({ trainWindow: e.target.value.trim() })} aria-label="Inner train width" placeholder="90D" />
                </Field>
                <Field label="Minimum inner folds" hint={innerConstraints ? `profile ${innerConstraints.folds.min}–${innerConstraints.folds.max} per outer fold` : options?.inner_folds ? `release default ${options.inner_folds.min_folds_release_default}` : undefined}>
                  <input className={INPUT_CLASS} style={inputStyle()} inputMode="numeric" value={inner.minFolds} onChange={(e) => set({ minFolds: e.target.value.trim() })} aria-label="Minimum inner folds" placeholder={options?.inner_folds ? String(options.inner_folds.min_folds_release_default) : undefined} />
                </Field>
              </>
            );
          })()}
        </div>
      ) : null}

      {error ? <ErrorBlock message={error} /> : null}
    </Card>
  );
}

/** Below this width the seven columns no longer sit in one row; each cell then names itself instead of the header. */
const PARAM_TABLE_FULL_WIDTH = 760;

/** One cell of a parameter row: a fixed column at full width, a labelled pair when narrow. */
function PCell({ label, width, compact, children }: { label: string; width?: number; compact: boolean; children: React.ReactNode }) {
  return (
    <span className={compact ? "flex flex-none items-center gap-1.5" : "flex flex-none items-center"} style={compact || width === undefined ? undefined : { width }}>
      {compact ? (
        <span className="mono flex-none text-[8.5px] uppercase" style={{ width: label === "declared" ? 54 : 34, color: "var(--ink-faint)", letterSpacing: ".06em" }} aria-hidden="true">
          {label}
        </span>
      ) : null}
      {children}
    </span>
  );
}

function ParametersStep({
  draft,
  patch,
  error,
  ceiling = SWEEP_CEILING,
  fixedNative = false,
}: {
  draft: RunDraft;
  patch: (change: Partial<RunDraft>) => void;
  error: string | null;
  /** CG-P08-05: the release's published sweep ceiling; null when not published. */
  ceiling?: number | null;
  /** The chosen recipe is a native fixed Delta input: it runs the declared pins once, so these ranges are shown, not swept, and cannot be edited. */
  fixedNative?: boolean;
}) {
  const swept = sweptCount(draft);
  const hasRows = draft.parameters.length > 0;
  const tableRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useLayoutEffect(() => {
    const element = tableRef.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => setCompact(element.clientWidth > 0 && element.clientWidth < PARAM_TABLE_FULL_WIDTH);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasRows]);

  function update(index: number, change: Partial<ParameterEntry>) {
    const next = draft.parameters.map((entry, i) => (i === index ? { ...entry, ...change } : entry));
    patch({ parameters: next });
  }
  /* A refused row already says so in its own status cell; a second box under the table would be the same sentence again. */
  const rowRefused = draft.parameters.some((entry) => parameterStatus(entry).tone === "refused");

  return (
    <Card
      title="Parameters"
      meta={
        <span
          className="mono text-[9.5px]"
          data-sweep-count
          style={{ color: ceiling !== null && swept > ceiling ? "var(--bad)" : "var(--ink-faint)" }}
        >
          {fixedNative ? "declared · not swept" : `${swept} swept · ${pinnedCount(draft)} pinned · ${ceiling === null ? "sweep ceiling not published" : `sweep ceiling ${ceiling}`}`}
        </span>
      }
    >
      {fixedNative ? (
        <p className="mb-2 text-[11px]" style={{ color: "var(--ink-soft)" }} data-native-parameters-note title="A native fixed recipe is one execution of the Alpha's declared pins with the server-owned bracket and clock: it is not a scalar optimizer, so nothing here is swept or pinned by you.">
          Fixed recipe · the Alpha&apos;s declared values run once. Nothing here is swept or editable.
        </p>
      ) : null}
      {draft.parameters.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--ink-soft)" }} data-no-parameters>
          {draft.bound && draft.alphaVersionId === "" ? "Choose a version first." : "This version declares no parameters."}
        </p>
      ) : (
        <div className="flex flex-col" data-parameter-table data-parameter-compact={compact || undefined} data-parameters-readonly={fixedNative || undefined} ref={tableRef} style={fixedNative ? { opacity: 0.65 } : undefined} {...(fixedNative ? { inert: "" as unknown as undefined } : {})}>
          {/* E4 (audit 02-14): the HiFi's header row. Without it the two
              free-text boxes on each row are unlabelled, and the declared
              step — which the registry publishes and the form dropped — had
              nowhere to go. Narrow, every cell carries its own label instead. */}
          {compact ? null : (
            <div
              className="mono flex flex-wrap items-center gap-2 border-b pb-1 text-[9px] uppercase"
              style={{ borderColor: "var(--line)", color: "var(--ink-faint)", letterSpacing: ".06em" }}
              data-parameter-header
            >
              <span className="w-[104px] flex-none">param</span>
              <span className="w-[120px] flex-none">declared</span>
              <span className="w-[84px] flex-none">dim</span>
              <span className="w-[88px] flex-none">low</span>
              <span className="w-[88px] flex-none">high</span>
              <span className="w-[72px] flex-none">step</span>
              <span className="flex-1">status</span>
            </div>
          )}
          {draft.parameters.map((entry, index) => {
            const status = parameterStatus(entry);
            const refused = status.tone === "refused";
            return (
              <div
                key={entry.name}
                data-parameter={entry.name}
                data-parameter-tone={status.tone}
                className={compact ? "flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b py-2" : "flex flex-wrap items-center gap-2 border-b py-1.5"}
                style={{ borderColor: "var(--line-soft)" }}
              >
                <span className={compact ? "mono w-full text-[11px] font-semibold" : "mono w-[104px] flex-none text-[11px]"}>{entry.name}</span>
                <PCell label="declared" width={120} compact={compact}>
                  <span className="mono text-[10px]" style={{ color: "var(--ink-faint)" }}>
                    {entry.levels
                      ? `[${entry.levels.join(", ")}]`
                      : `${entry.declaredLow} … ${entry.declaredHigh}`}
                  </span>
                </PCell>
                <PCell label="dim" width={84} compact={compact}>
                  <span className="flex flex-none gap-[3px]">
                    {(["sweep", "pin"] as const).map((dimension) => (
                      <button
                        key={dimension}
                        type="button"
                        data-dimension={`${entry.name}:${dimension}`}
                        data-selected={entry.dimension === dimension}
                        onClick={() => update(index, { dimension })}
                        className="mono rounded-[4px] border px-2 py-px text-[9px]"
                        style={{
                          borderColor:
                            entry.dimension === dimension
                              ? dimension === "sweep"
                                ? "var(--accent)"
                                : "var(--role-holdout)"
                              : "var(--line)",
                          color:
                            entry.dimension === dimension
                              ? dimension === "sweep"
                                ? "var(--accent)"
                                : "var(--role-holdout)"
                              : "var(--ink-faint)",
                        }}
                      >
                        {dimension}
                      </button>
                    ))}
                  </span>
                </PCell>
                <PCell label={entry.dimension === "pin" ? "value" : "low"} width={88} compact={compact}>
                  <input
                    className={`${INPUT_CLASS} w-[88px] flex-none`}
                    style={inputStyle(refused)}
                    value={entry.low}
                    onChange={(e) => update(index, { low: e.target.value })}
                    aria-label={`${entry.name} ${entry.dimension === "pin" ? "value" : "low"}`}
                  />
                </PCell>
                {entry.dimension === "sweep" ? (
                  <PCell label="high" width={88} compact={compact}>
                    <input
                      className={`${INPUT_CLASS} w-[88px] flex-none`}
                      style={inputStyle(refused)}
                      value={entry.high}
                      onChange={(e) => update(index, { high: e.target.value })}
                      aria-label={`${entry.name} high`}
                    />
                  </PCell>
                ) : compact ? null : (
                  <span className="mono w-[88px] flex-none text-[11px]" style={{ color: "var(--ink-faint)" }}>
                    —
                  </span>
                )}
                {/* The declaration's grid, read from the registry. A fixed or
                    categorical parameter declares none, and says so. */}
                <PCell label="step" width={72} compact={compact}>
                  <span
                    className="mono text-[10px]"
                    style={{ color: "var(--ink-faint)" }}
                    data-parameter-step={entry.name}
                  >
                    {entry.declaredStep === null || entry.declaredStep === undefined ? (
                      <span className="italic" title="The declaration names no grid for this parameter.">no grid</span>
                    ) : (
                      String(entry.declaredStep)
                    )}
                  </span>
                </PCell>
                <span
                  className={compact ? "w-full text-[10px]" : "flex-1 text-[10px]"}
                  data-parameter-status={entry.name}
                  style={{
                    color: refused
                      ? "var(--bad)"
                      : status.tone === "narrowed"
                        ? "var(--role-holdout)"
                        : "var(--ink-faint)",
                  }}
                >
                  {status.text}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {error && !rowRefused ? <ErrorBlock message={error} /> : null}
    </Card>
  );
}

const GROUP_LABEL: Record<string, string> = {
  study: "Study",
  sampler: "Sampler",
  objective: "Objective & constraints",
  candidate_selection: "Candidate selection",
};

/**
 * The release's own optimizer defaults, in four named groups.
 *
 * Every field is `RELEASE_DEFAULT` and carries its `override_state`. They are
 * rendered read-only and are **never** copied into the draft's override map:
 * spec 02 §13-1 forbids serializing a default, and the amendment is explicit
 * that these groups explain the release without authorizing a browser
 * override. A `LOCKED` row has no input at all, because an input the server
 * will refuse is a promise the screen cannot keep.
 */
function OptimizerDefaults({ release }: { release: AtlasRelease }) {
  const fields = release.optimizer_defaults.groups.flatMap((group) => group.fields);
  /* A `detail` shared by three or more rows ("QuantBT OptimizationConfig default.") is a label, not information: it goes to the tooltip. */
  const detailCount = new Map<string, number>();
  for (const field of fields) detailCount.set(field.detail, (detailCount.get(field.detail) ?? 0) + 1);
  /* When every row carries the same source and lock state, that is said once, not once per row. */
  const kinds = new Set(fields.map((field) => `${field.value_source} · ${field.override_state}`));
  const uniform = kinds.size === 1 ? [...kinds][0]! : null;
  const words = (value: string) => value.split(" · ").map((part) => humanise(part)).join(" · ");
  const sharedDetail = fields.find((field) => (detailCount.get(field.detail) ?? 0) >= 3)?.detail;
  return (
    <details className="rounded-[5px] border px-2.5 py-1.5" style={{ borderColor: "var(--line)" }} data-optimizer-defaults>
      <summary className="cursor-pointer text-[11px] font-semibold" style={{ color: "var(--ink-soft)" }} title={sharedDetail}>
        Release defaults · {fields.length} fields{uniform !== null ? ` · ${words(uniform)}` : ""}
      </summary>
      <div className="mt-2 flex flex-col gap-2">
      {release.optimizer_defaults.groups.map((group) => (
        <section key={group.group_id} data-default-group={group.group_id} className="flex flex-col">
          <h4
            className="mono border-b py-1 text-[9.5px] uppercase tracking-[.07em]"
            style={{ borderColor: "var(--line-soft)", color: "var(--ink-faint)" }}
          >
            {GROUP_LABEL[group.group_id] ?? group.group_id}
          </h4>
          {group.fields.map((field) => (
            <div
              key={field.field_id}
              data-default-field={field.field_id}
              data-value-source={field.value_source}
              data-override-state={field.override_state}
              className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 border-b py-[3px] last:border-b-0"
              style={{ borderColor: "var(--line-soft)" }}
            >
              <span className="mono flex-none text-[10px]" style={{ width: 196 }}>
                {field.field_id}
              </span>
              <span className="mono flex-none text-[10.5px]" style={{ width: 132 }}>
                {field.default_value === null ? (
                  <span className="italic" style={{ color: "var(--ink-faint)" }}>null</span>
                ) : (
                  String(field.default_value)
                )}
              </span>
              {uniform === null ? (
                <span
                  className="mono flex-none rounded-[3px] border px-1 text-[8.5px] font-bold leading-[14px]"
                  style={{ color: "var(--ink-soft)", borderColor: "var(--line-strong)" }}
                  title={(detailCount.get(field.detail) ?? 0) >= 3 ? field.detail : undefined}
                >
                  {words(`${field.value_source} · ${field.override_state}`)}
                </span>
              ) : null}
              {(detailCount.get(field.detail) ?? 0) >= 3 ? null : (
                <span className="flex-1 text-[9.5px]" style={{ color: "var(--ink-soft)" }}>
                  {field.detail}
                </span>
              )}
            </div>
          ))}
        </section>
      ))}
      </div>
    </details>
  );
}

/** What this release will actually accept today, in its own words. */
function SubmissionConstraints({ release }: { release: AtlasRelease }) {
  const limits = release.submission_constraints;
  return (
    <div
      className="flex flex-col gap-1 rounded-[6px] border px-3 py-2"
      style={{ borderColor: "var(--role-holdout)", background: "var(--paper)" }}
      data-submission-constraints={limits.profile_id}
    >
      <span className="mono text-[9px] font-bold uppercase tracking-[.07em]" style={{ color: "var(--role-holdout)" }}>
        current submission profile · {limits.profile_id}
      </span>
      <span className="mono text-[10px]" style={{ color: "var(--ink-soft)" }}>
        trials {limits.accepted_trial_count} · optimizer overrides {limits.optimization_overrides} ·
        early stopping {limits.early_stopping} · random seed {limits.random_seed}
      </span>
      {/* The server's sentence. A richer request is still submittable — its
          refusal is typed and authoritative, and is not pre-empted here. */}
      <span className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
        {limits.reason}
      </span>
    </div>
  );
}

/** Declared values that differ from the Atlas's listed submission profile, one sentence each. */
export function outsideProfileNotes(
  draft: Pick<RunDraft, "optunaTrials" | "earlyStopping" | "randomSeed">,
  constraints: AtlasRelease["submission_constraints"],
): readonly { field: "trials" | "early_stopping" | "random_seed"; text: string }[] {
  const notes: { field: "trials" | "early_stopping" | "random_seed"; text: string }[] = [];
  const trials = draft.optunaTrials.trim();
  if (trials !== "" && trials !== String(constraints.accepted_trial_count)) {
    notes.push({
      field: "trials",
      text: `Trials ${trials} — the profile lists ${constraints.accepted_trial_count}. Kept as entered.`,
    });
  }
  if (draft.earlyStopping.trim() !== "") {
    notes.push({
      field: "early_stopping",
      text: `Early stopping ${draft.earlyStopping.trim()} — the profile admits no value. Kept as entered.`,
    });
  }
  if (draft.randomSeed.trim() !== "") {
    notes.push({
      field: "random_seed",
      text: `Random seed ${draft.randomSeed.trim()} — the profile admits no value. Kept as entered.`,
    });
  }
  return notes;
}

function OutsideProfileNotes({ draft, constraints }: { draft: RunDraft; constraints: AtlasRelease["submission_constraints"] }) {
  const notes = outsideProfileNotes(draft, constraints);
  if (notes.length === 0) return null;
  return (
    <ul className="flex flex-col gap-0.5" data-outside-profile>
      {notes.map((note) => (
        <li key={note.field} className="mono text-[10px]" style={{ color: "var(--accent-2)" }} data-outside-profile-field={note.field}>
          {note.text}
        </li>
      ))}
    </ul>
  );
}

function SelectedProfileNotes({ draft, profile }: { draft: RunDraft; profile: ProfilePins }) {
  const notes = outsideSelectedProfileNotes(draft, profile);
  if (notes.length === 0) return null;
  return (
    <ul className="flex flex-col gap-0.5" data-outside-profile>
      {notes.map((note) => (
        <li key={note.field} className="mono text-[10px]" style={{ color: "var(--accent-2)" }} data-outside-profile-field={note.field}>
          {note.text}
        </li>
      ))}
    </ul>
  );
}

/** The served `trial_scope` in words (`PER_OUTER_FOLD_STUDY` → "per outer fold study"); null when the profile serves none. */
function trialScopeText(profile: ProfilePins): string | null {
  return profile.trialScope === null ? null : profile.trialScope.toLowerCase().replace(/_/g, " ");
}

/** The served trial caps of a profile: the per-study range and the whole-run cap, each only when served. */
function trialCapsText(profile: ProfilePins): string | null {
  const scope = trialScopeText(profile);
  const parts = [
    profile.trials && scope !== null ? `trials ${profile.trials.min === profile.trials.max ? profile.trials.min : `${profile.trials.min}–${profile.trials.max}`} ${scope}` : null,
    profile.maxTotalTrials !== null ? `total ≤ ${profile.maxTotalTrials}` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** What the causal profile requires and caps, in its own served numbers. */
function causalCapsText(profile: ProfilePins): string {
  const inner = profile.innerConstraints;
  return [
    profile.profileId,
    inner ? `inner folds ${inner.folds.min}–${inner.folds.max} per outer fold` : null,
    trialCapsText(profile),
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");
}

/** What the selected profile fixes, in its own numbers (LW-07). Replaces the stale single-profile card when profiles are served. */
function ProfileCard({ profile }: { profile: ProfilePins }) {
  const caps = trialCapsText(profile);
  const inner = profile.innerConstraints;
  const parts = [
    profile.trialScope !== null && caps !== null ? caps : profile.trials ? (profile.trials.min === profile.trials.max ? `trials ${profile.trials.min}` : `trials ${profile.trials.min}–${profile.trials.max}`) : null,
    inner ? `inner folds ${inner.folds.min}–${inner.folds.max}${inner.frequencies.length > 0 ? ` ${inner.frequencies.join("/")}` : ""}${inner.windowModes.length > 0 ? ` ${inner.windowModes.join("/")}` : ""}` : null,
    profile.seed.state === "fixed" ? `seed ${profile.seed.value}` : profile.seed.state === "forbidden" ? "no seed" : null,
    profile.folds ? `folds ${profile.folds.min}–${profile.folds.max}` : null,
    profile.frequencies?.join("/") ?? profile.granularity,
    profile.windowModes?.join("/") ?? profile.windowMode,
    profile.earlyStopping === "forbidden" ? "no early stopping" : null,
    profile.maxSpanDays !== null ? `span ≤ ${profile.maxSpanDays} days` : null,
  ].filter((part): part is string => part !== null);
  return (
    <div
      className="flex flex-col gap-1 rounded-[6px] border px-3 py-2"
      style={{ borderColor: "var(--role-holdout)", background: "var(--paper)" }}
      data-profile-card={profile.profileId}
      data-profile-state={profile.enabled ? "ENABLED" : "DISABLED"}
    >
      <span className="mono text-[9px] font-bold uppercase tracking-[.07em]" style={{ color: "var(--role-holdout)" }}>
        profile · {profile.profileId}
      </span>
      {profile.enabled ? (
        <span className="mono text-[10px]" style={{ color: "var(--ink-soft)" }}>{parts.join(" · ")}</span>
      ) : (
        <span className="mono text-[10px]" style={{ color: "var(--bad)" }}>disabled{profile.reason ? ` · ${profile.reason}` : ""}</span>
      )}
    </div>
  );
}

/** Declared trials/seed outside the selected profile's pins, one sentence each; the value stays as entered. */
export function outsideSelectedProfileNotes(
  draft: Pick<RunDraft, "optunaTrials" | "randomSeed"> & { earlyStopping?: string },
  profile: ProfilePins,
): readonly { field: "trials" | "random_seed" | "early_stopping"; text: string }[] {
  const notes: { field: "trials" | "random_seed" | "early_stopping"; text: string }[] = [];
  if ((draft.earlyStopping ?? "").trim() !== "" && profile.earlyStopping === "forbidden") {
    notes.push({ field: "early_stopping", text: `Early stopping ${(draft.earlyStopping ?? "").trim()} — profile admits none. Kept as entered.` });
  }
  const trials = draft.optunaTrials.trim();
  const trialRange = profile.trials;
  if (trials !== "" && trialRange !== null) {
    const n = Number(trials);
    if (Number.isFinite(n) && (n < trialRange.min || n > trialRange.max)) {
      notes.push({ field: "trials", text: `Trials ${trials} — profile ${trialRange.min}–${trialRange.max}${trialScopeText(profile) ? ` ${trialScopeText(profile)}` : ""}. Kept as entered.` });
    }
  }
  const seed = draft.randomSeed.trim();
  if (seed !== "") {
    if (profile.seed.state === "fixed" && seed !== String(profile.seed.value)) {
      notes.push({ field: "random_seed", text: `Seed ${seed} — profile pins ${profile.seed.value}. Kept as entered.` });
    } else if (profile.seed.state === "forbidden") {
      notes.push({ field: "random_seed", text: `Seed ${seed} — profile admits none. Kept as entered.` });
    }
  }
  return notes;
}

function OptimizationStep({
  draft,
  patch,
  limits,
  release,
  error,
  profile = null,
  profilesServed = false,
}: {
  draft: RunDraft;
  patch: (change: Partial<RunDraft>) => void;
  limits: DraftConstraints;
  release: AtlasRelease | null;
  error: string | null;
  /** LW-07: the one profile this declaration falls under; it pins what it pins, the rest stays editable. */
  profile?: ProfilePins | null;
  /** The Atlas served its profiles: the single-profile `submission_constraints` is then no longer the source. */
  profilesServed?: boolean;
}) {
  const overrides = Object.keys(draft.optimizationConfigOverrides);
  const pinnedTrials = trialsPinned(profile);
  const trialsLocked = pinnedTrials !== null && draft.optunaTrials.trim() === String(pinnedTrials);
  const pinnedSeed = seedPinned(profile);
  const seedLocked = pinnedSeed !== null && draft.randomSeed.trim() === String(pinnedSeed);
  /* `seed_policy: FORBIDDEN` / `early_stopping_policy: FORBIDDEN`: the profile admits no value, so an empty field is
     read-only and says so. A value that is already there (a copied run) stays editable, and is noted below. */
  const seedForbidden = profile?.enabled === true && profile.seed.state === "forbidden" && draft.randomSeed.trim() === "";
  const earlyStopForbidden = profile?.enabled === true && profile.earlyStopping === "forbidden" && draft.earlyStopping.trim() === "";
  const guidance = profile?.earlyStoppingGuidance;
  const studyTrials = Number(draft.optunaTrials);
  const stoppingSuggestion = profile?.earlyStopping === "optional" && guidance && Number.isSafeInteger(studyTrials) && studyTrials > 1
    ? `Optional · suggested ${Math.max(1, Math.ceil(studyTrials * guidance.suggestedRangeRatio[0]))}–${Math.max(1, Math.floor(studyTrials * guidance.suggestedRangeRatio[1]))}; ≈${Math.max(1, Math.round(studyTrials * guidance.suggestedRatio))} per study. Blank = off; suggestion, not an optimum.`
    : profile?.earlyStopping === "optional" ? "Optional · trials without improvement; blank = off" : "Trials without gain before stopping";
  const lockStyle = { background: "var(--paper-sunken)", cursor: "not-allowed" } as const;
  return (
    <Card title="Optimization">
      <div className="flex flex-wrap gap-2.5">
          <Field
          label="Optuna trials"
          hint={
            trialsLocked
              ? "pinned"
              : profile?.enabled && profile.trials
                ? `profile ${profile.trials.min}–${profile.trials.max}${trialScopeText(profile) ? ` ${trialScopeText(profile)}` : ""}${profile.maxTotalTrials !== null ? ` · total ≤ ${profile.maxTotalTrials}` : ""}`
                : limits.trialCeiling === null
                  ? "the release's ceiling could not be read"
                  : `ceiling ${limits.trialCeiling}`
          }
        >
          <input
            className={INPUT_CLASS}
            style={trialsLocked ? { ...inputStyle(), ...lockStyle } : inputStyle(Boolean(error))}
            value={draft.optunaTrials}
            onChange={(e) => patch({ optunaTrials: e.target.value })}
            aria-label="Optuna trials"
            readOnly={trialsLocked}
            title={trialsLocked ? `pinned by ${profile?.profileId}` : undefined}
            data-pinned-by={trialsLocked ? profile?.profileId : undefined}
          />
        </Field>
        <Field label="Early stopping" hint={earlyStopForbidden ? `not admitted · ${profile?.profileId}` : stoppingSuggestion}>
          <input
            className={INPUT_CLASS}
            style={earlyStopForbidden ? { ...inputStyle(), ...lockStyle } : inputStyle(earlyStoppingInvalid(draft.earlyStopping))}
            value={draft.earlyStopping}
            onChange={(e) => patch({ earlyStopping: e.target.value })}
            aria-label="Early stopping"
            inputMode="numeric"
            aria-invalid={earlyStoppingInvalid(draft.earlyStopping) || undefined}
            readOnly={earlyStopForbidden}
            title={earlyStopForbidden ? `early stopping not admitted by ${profile?.profileId}` : undefined}
            data-forbidden-by={earlyStopForbidden ? profile?.profileId : undefined}
          />
        </Field>
        <Field label={limits.seedRequired === true ? "Random seed *" : "Random seed"} hint={seedLocked ? "pinned" : seedForbidden ? `not admitted · ${profile?.profileId}` : undefined}>
          <input
            className={INPUT_CLASS}
            style={seedLocked || seedForbidden ? { ...inputStyle(), ...lockStyle } : inputStyle((limits.seedRequired === true && draft.randomSeed.trim() === "") || randomSeedInvalid(draft.randomSeed))}
            value={draft.randomSeed}
            onChange={(e) => patch({ randomSeed: e.target.value })}
            aria-label="Random seed"
            aria-invalid={randomSeedInvalid(draft.randomSeed) || undefined}
            readOnly={seedLocked || seedForbidden}
            title={seedLocked ? `pinned by ${profile?.profileId}` : seedForbidden ? `random seed not admitted by ${profile?.profileId}` : undefined}
            data-pinned-by={seedLocked ? profile?.profileId : undefined}
            data-forbidden-by={seedForbidden ? profile?.profileId : undefined}
          />
        </Field>
      </div>

      {/* A copied run (or a typed value) can sit outside the submission profile
          the Atlas lists. It is kept as entered — never replaced — and said so;
          preflight and create decide, not this note. */}
      {profile?.enabled ? (
        <SelectedProfileNotes draft={draft} profile={profile} />
      ) : release && !profilesServed ? (
        <OutsideProfileNotes draft={draft} constraints={release.submission_constraints} />
      ) : null}

      {overrides.length > 0 ? (
        <div
          className="flex flex-col gap-1 rounded-[6px] border px-3 py-2"
          style={{ borderColor: "var(--line-soft)", background: "var(--paper)" }}
          data-config-surface
          title={DEFAULTS_FOOTER}
        >
          <span className="mono text-[9.5px]" data-override-summary style={{ color: "var(--ink-faint)" }}>
            {overrides.length} override(s) · rest = release defaults
          </span>
          {overrides.map((key) => (
            <span key={key} className="mono text-[10px]" data-override={key}>
              {key} = {String(draft.optimizationConfigOverrides[key])}
            </span>
          ))}
        </div>
      ) : null}

      {release ? (
        <>
          {profile ? <ProfileCard profile={profile} /> : profilesServed ? null : <SubmissionConstraints release={release} />}
          <OptimizerDefaults release={release} />
        </>
      ) : (
        <p className="text-[11px]" style={{ color: "var(--ink-soft)" }} data-no-defaults>
          The release's optimizer defaults are read from the Engine Atlas. It is not available, so
          no default is shown — the form does not carry a local copy of them.
        </p>
      )}

      {error ? <ErrorBlock message={error} /> : null}
    </Card>
  );
}

/* ------------------------------------------------------------ review rail */

function Row({ label, children, labelWidth = 132 }: { label: string; children: React.ReactNode; labelWidth?: number }) {
  return (
    <div
      className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b py-[3px] last:border-b-0"
      style={{ borderColor: "var(--line-soft)" }}
      data-review-row={label}
    >
      <span
        className="mono flex-none text-[9px] uppercase tracking-[.06em]"
        style={{ width: labelWidth, color: "var(--ink-faint)" }}
      >
        {label}
      </span>
      <span className="mono flex-1 break-words text-[10.5px]">{children}</span>
    </div>
  );
}

/* ---------------------------------------------------------- window timeline */

const ROLE_TONE = { is: "var(--role-is)", oos: "var(--role-oos)", holdout: "var(--role-holdout)", span: "var(--role-is)" } as const;

/** One drawn stretch of a timeline row, in percent of the frame. */
export interface TimelineSegment {
  left: number;
  width: number;
  tone: string;
  title: string;
}

export interface TimelineRow {
  key: "is" | "oos" | "holdout" | "span";
  label: string;
  tone: string;
  /** The reader's own text for the row's two edges; "not declared" for an empty one. */
  text: string;
  /** Empty when the row's edges are missing or out of order — the track stays empty rather than guessing. */
  segments: readonly TimelineSegment[];
}

const NOT_DECLARED = "not declared";

/**
 * A draft instant as one text: a copied run carries `2026-06-01T00:00:00Z`, the
 * form's own inputs `2026-06-01T00:00`. Both read the same minute, so both print
 * the second (shorter) form; any other text (an offset, a stray format) is shown as it is.
 */
export function instantText(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::00(?:\.0+)?)?Z?$/.exec(value);
  return match ? match[1]! : value;
}

function halfOpen(start: string, end: string): string {
  return `[${start || NOT_DECLARED}, ${end || NOT_DECLARED})`;
}

/**
 * HiFi 02-10a: the draft's windows as proportional bars (HiFi `timeline`).
 *
 * Pure geometry over the dates the reader typed or a coverage prefilled — the
 * same declaration the Review table prints. It is a drawing of the draft, not
 * a fold plan: the authoritative plan is the server's, at preflight, and the
 * bar counts per window need a served per-window count (CG-FG-S02-02), so none
 * is printed here. A window with a missing or reversed edge draws nothing.
 */
export function timelineRows(
  draft: Pick<RunDraft, "protocol" | "windows" | "walkForward">,
  /** S02_DATA: a clock shared with the served coverage bar; absent, each row spans its own windows. */
  axis: { from: number; to: number } | null = null,
): readonly TimelineRow[] {
  if (draft.protocol === "three_window_decay") {
    const parsed = (["is", "oos", "holdout"] as const).map((key) => {
      const window = draft.windows[key];
      const from = utcMs(window.start);
      const to = utcMs(window.endExclusive);
      return { key, window, from, to, drawn: from !== null && to !== null && to > from };
    });
    const drawn = parsed.filter((row) => row.drawn);
    const t0 = axis ? axis.from : Math.min(...drawn.map((row) => row.from as number));
    const t1 = axis ? axis.to : Math.max(...drawn.map((row) => row.to as number));
    const span = Math.max(1, t1 - t0);
    return parsed.map(({ key, window, from, to, drawn: isDrawn }) => ({
      key,
      label: key === "holdout" ? "Holdout" : key.toUpperCase(),
      tone: ROLE_TONE[key],
      text: `${window.start ? instantText(window.start) : NOT_DECLARED} → ${window.endExclusive ? instantText(window.endExclusive) : NOT_DECLARED}`,
      segments: isDrawn
        ? [{
          left: (((from as number) - t0) / span) * 100,
          width: Math.max((((to as number) - (from as number)) / span) * 100, 0.5),
          tone: ROLE_TONE[key],
          title: `${key.toUpperCase()} ${halfOpen(window.start, window.endExclusive)}`,
        }]
        : [],
    }));
  }
  const { start, endExclusive, splitMode } = draft.walkForward;
  const from = utcMs(start);
  const to = utcMs(endExclusive);
  const split = utcMs(splitMode);
  const drawn = from !== null && to !== null && to > from;
  const origin = axis && drawn ? axis.from : (from ?? 0);
  const span = axis && drawn ? Math.max(1, axis.to - axis.from) : drawn ? to - from : 1;
  const at = (instant: number) => ((instant - origin) / span) * 100;
  const segments: TimelineSegment[] = [];
  if (drawn) {
    if (split !== null && split > from && split < to) {
      segments.push(
        { left: at(from), width: ((split - from) / span) * 100, tone: ROLE_TONE.is, title: `before the first OOS instant ${halfOpen(start, splitMode)}` },
        { left: at(split), width: ((to - split) / span) * 100, tone: ROLE_TONE.oos, title: `from the first OOS instant ${halfOpen(splitMode, endExclusive)}` },
      );
    } else {
      segments.push({ left: at(from), width: ((to - from) / span) * 100, tone: "var(--line-strong)", title: `analysis span ${halfOpen(start, endExclusive)}` });
    }
  }
  return [{ key: "span", label: "span", tone: ROLE_TONE.span, text: `${start ? instantText(start) : NOT_DECLARED} → ${endExclusive ? instantText(endExclusive) : NOT_DECLARED}`, segments }];
}

/** The fold count as a served fact: "≈ 14 outer folds · server plan", a served range, or a typed absence. */
function hasNoOuterFolds(plan: FoldPlan, protocol: RunDraft["protocol"]): boolean {
  /* Three Window has no outer folds, whatever a planner answers for the declaration (it may plan one span): said once, never "≈ 1 fold". */
  return protocol === "three_window_decay" && (plan.kind !== "absent" || plan.reason === "profile publishes no fold bounds");
}

function FoldPlanLine({ plan, protocol }: { plan: FoldPlan; protocol: RunDraft["protocol"] }) {
  /* The admitted three-window profile serves `fold_bounds: null`: the protocol has no outer folds, so nothing is missing. */
  const noFolds = hasNoOuterFolds(plan, protocol);
  const text =
    plan.kind === "server-plan"
      ? `≈ ${plan.count} outer folds`
      : plan.kind === "profile-bounds"
        ? `folds ${plan.min}–${plan.max}`
        : noFolds
          ? "no outer folds"
          : "outer folds — not published";
  const source =
    plan.kind === "server-plan"
      ? "server plan · preflight"
      : plan.kind === "profile-bounds"
        ? `server profile · ${plan.profileId}`
        : noFolds
          ? "three-window protocol"
          : plan.reason;
  return (
    <p
      className="mono text-[9.5px]"
      style={{ color: plan.kind === "absent" ? "var(--ink-faint)" : "var(--ink-soft)", fontStyle: plan.kind === "absent" ? "italic" : "normal" }}
      data-fold-plan={plan.kind}
      title={
        plan.kind === "server-plan"
          ? "The outer fold count the server's preflight planned for this declaration."
          : plan.kind === "profile-bounds"
            ? "The admitted profile's served fold bounds; the preflight plans the exact count."
            : `The server has not published a fold count yet: ${plan.reason}.`
      }
    >
      {text} <span style={{ color: "var(--ink-faint)" }}>· {source}</span>
    </p>
  );
}

const IDLE_ESTIMATE: EstimateStatus = { kind: "idle" };
const IDLE_SETUP: RunSetupState = { status: "idle", options: null, error: null, retry: () => undefined, invalidate: () => undefined };

function WindowTimeline({
  draft,
  catalog = null,
  fold,
  estimate = null,
  estimateStatus = IDLE_ESTIMATE,
  onRetryEstimate,
}: {
  draft: RunDraft;
  catalog?: DatasetCatalog | null;
  fold: FoldPlan;
  /** What the declaration-estimate call is doing; its refusal and failure states print under the bars. */
  estimateStatus?: EstimateStatus;
  onRetryEstimate?: () => void;
  /** The server's optional `preflight_estimate`: bars per window, warmup, planned folds. Null prints none of it. */
  estimate?: PreflightEstimate | null;
}) {
  /* S02_DATA: the chosen symbol's served coverage on the same clock as the windows. */
  const coverage = coverageRange(planCoverage(catalog, draft.datasetId, draft.symbol, draft.timeframe));
  const axis = sharedAxis(draft, coverage);
  const warnings = coverageWarnings(draft, coverage);
  const rows = timelineRows(draft, axis);
  const timelineRef = useEntryRef<HTMLElement>();
  const readout = useReadout();
  const coverageSpan = axis && coverage ? { left: ((coverage.from - axis.from) / (axis.to - axis.from)) * 100, width: Math.max(((coverage.to - coverage.from) / (axis.to - axis.from)) * 100, 0.5) } : null;
  return (
    <section ref={timelineRef} className="rounded-[6px] border px-2.5 py-2" style={{ borderColor: "var(--line-soft)" }} data-window-timeline>
      <h4 className="text-[10px] font-semibold uppercase tracking-[.05em]" style={{ fontFamily: "var(--font-body)" }} title="Half-open windows, end-exclusive. A declaration only: fold boundaries are decided by preflight.">
        Window timeline
      </h4>
      <div className="mt-1.5 flex flex-col gap-1.5">
        {coverage && coverageSpan ? (
          <div className="grid grid-cols-[48px_1fr] items-center gap-x-1.5 gap-y-0.5" data-timeline-row="coverage">
            <span className="mono text-[9.5px]" style={{ color: "var(--accent-2)" }}>data</span>
            <span
              className="relative block h-[10px] rounded-full"
              style={{ background: "var(--paper-sunken)" }}
              role="img"
              aria-label={`${coverage.symbol} served coverage ${coverage.firstMonth} to ${coverage.lastMonth}`}
              data-timeline-track="coverage"
            >
              <span
                className="absolute top-0 h-full rounded-full"
                style={{ left: `${coverageSpan.left}%`, width: `${coverageSpan.width}%`, background: "var(--accent-2)", opacity: 0.55 }}
                title={`${coverage.symbol} served coverage ${coverage.firstMonth} → ${coverage.lastMonth} (month partitions)`}
                tabIndex={0}
                role="img"
                aria-label={`${coverage.symbol} served coverage ${coverage.firstMonth} to ${coverage.lastMonth}`}
                {...readout.bind(`data · ${coverage.symbol} served coverage ${coverage.firstMonth} → ${coverage.lastMonth} (month partitions)`)}
                data-timeline-segment="coverage"
                data-entry="x"
                data-entry-origin="left"
              />
            </span>
            <span />
            <span className="mono break-words text-[9px]" style={{ color: "var(--ink-faint)" }} data-timeline-text="coverage">
              {coverage.symbol} {coverage.firstMonth} → {coverage.lastMonth}
            </span>
          </div>
        ) : null}
        {rows.map((row) => (
          <div key={row.key} className="grid grid-cols-[48px_1fr] items-center gap-x-1.5 gap-y-0.5" data-timeline-row={row.key}>
            <span className="mono text-[9.5px]" style={{ color: row.key === "is" || row.key === "span" ? "var(--ink-faint)" : row.tone }}>{row.label}</span>
            <span
              className="relative block h-[10px] rounded-full"
              style={{ background: "var(--paper-sunken)" }}
              role="img"
              aria-label={`${row.label} ${row.segments.length > 0 ? row.text : NOT_DECLARED}`}
              data-timeline-track={row.key}
            >
              {row.segments.map((segment, index) => (
                <span
                  key={index}
                  className="absolute top-0 h-full rounded-full"
                  style={{ left: `${segment.left}%`, width: `${segment.width}%`, background: segment.tone, opacity: 0.85 }}
                  title={segment.title}
                  tabIndex={0}
                  role="img"
                  aria-label={`${row.label} ${segment.title}`}
                  {...readout.bind(`${row.label} · ${segment.title}`)}
                  data-timeline-segment={row.key}
                  data-entry="x"
                  data-entry-origin="left"
                />
              ))}
            </span>
            <span />
            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="mono break-words text-[9px]" style={{ color: "var(--ink-faint)" }} data-timeline-text={row.key}>
                {row.text}
              </span>
              {row.key === "is" || row.key === "oos" || row.key === "holdout" ? <WindowBars estimate={estimate} window={row.key} /> : null}
            </span>
          </div>
        ))}
        {/* Reserved readout line: the declared text of the focused or hovered segment, fixed height. */}
        <span
          className="mono block h-[13px] overflow-hidden text-ellipsis whitespace-nowrap text-[9.5px] leading-[13px]"
          style={{ color: "var(--ink-soft)" }}
          data-timeline-readout={readout.text ?? undefined}
          aria-live="polite"
        >
          {readout.text}
        </span>
        {draft.protocol === "advanced" ? (
          <>
            {draft.walkForward.frequency || draft.walkForward.windowMode || draft.walkForward.splitMode ? (
              <p className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} data-advanced-timeline>
                {[
                  draft.walkForward.frequency || null,
                  draft.walkForward.windowMode || null,
                  draft.walkForward.splitMode ? `first OOS ${instantText(draft.walkForward.splitMode)}` : null,
                ].filter(Boolean).join(" · ")}
              </p>
            ) : null}
            <WindowBarsLine estimate={estimate} />
            <FoldTimeline
              folds={foldsFromPlanned(estimate?.plannedFoldItems)}
              analysis={(() => {
                const from = utcMs(draft.walkForward.start);
                const to = utcMs(draft.walkForward.endExclusive);
                return from !== null && to !== null && to > from ? { startUtcMs: from, endUtcMs: to } : undefined;
              })()}
              firstOosUtcMs={utcMs(draft.walkForward.splitMode)}
              windowMode={draft.walkForward.windowMode}
              status={
                foldsFromPlanned(estimate?.plannedFoldItems) !== null
                  ? "served"
                  : estimateStatus.kind === "pending"
                    ? "pending"
                    : estimateStatus.kind === "refused"
                      ? "refused"
                      : "missing"
              }
              missingNote={estimateStatus.kind === "idle" ? "Fold geometry appears once the declaration is complete." : "Fold geometry not published for this declaration."}
              refusalNote={estimateStatus.kind === "refused" ? estimateStatus.message : undefined}
            />
          </>
        ) : null}
        {hasEstimateStrip(estimate) || estimateStatus.kind !== "idle" ? (
          <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1" data-estimate-strip>
            <WarmupChip estimate={estimate} />
            {/* One fold statement per protocol: the three-window protocol has no outer folds, so the planner's count would contradict it (RG2). */}
            {hasNoOuterFolds(fold, draft.protocol) ? null : <PlannedFolds estimate={estimate} />}
            <EstimateStatusLine status={estimateStatus} onRetry={onRetryEstimate} />
          </p>
        ) : null}
      </div>
      <div className="mt-1 flex flex-col gap-0.5">
        <CoverageWarnings warnings={warnings} coverage={coverage} />
        <FoldPlanLine plan={fold} protocol={draft.protocol} />
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- claim forecast */

/** The gold row: a faint label on the left, the value in mono on the right (HiFi `fc`). */
function ForecastLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex flex-wrap items-baseline justify-between gap-x-2.5 text-[10.5px]">
      <span className="flex-none" style={{ color: "var(--ink-faint)" }}>{label}</span>
      {/* A long enum token (the claim) drops under its label rather than past the card's edge. */}
      <span className="mono ml-auto min-w-0 break-all text-right">{children}</span>
    </span>
  );
}

/**
 * HiFi 02-9: the gold claim-forecast card — payload digest, mode × schedule,
 * source, claim, cert ceiling.
 *
 * Every value is one the form or the server already holds: the claim and OOS
 * state are the Atlas's for the chosen mode × schedule; the payload digest is
 * the server's `requested_spec_digest` and exists only once a preflight has
 * answered; the cert ceiling is an Atlas fact that is not published today, so
 * the card says so with the server's own reason (CG-FG-S02-01) and never
 * guesses a letter. The HiFi's italic "this card is the augmentation…" line is
 * the card's tooltip, not printed text.
 */
function ClaimForecast({
  draft,
  atlas,
  preflight,
}: {
  draft: RunDraft;
  atlas: AtlasDocument | null;
  preflight: PreflightResponse | null;
}) {
  const mode = atlas?.modes.find((item) => item.mode_id === draft.optimizationMode);
  const scheduleFact = mode?.facts?.schedules.find((item) => item.schedule === draft.optimizationSchedule);
  const digest = preflight?.requested_spec_digest ?? null;
  return (
    <section
      className="flex flex-col gap-1.5 rounded-[8px] border px-3 py-2.5"
      style={{ borderColor: "var(--role-holdout)", background: "var(--paper)", boxShadow: "var(--shadow-e2)" }}
      data-claim-forecast
      title="The ceiling is visible before compute is spent. The card reads the payload; it never changes it."
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <h4 className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[.07em]" style={{ color: "var(--role-holdout)", fontFamily: "var(--font-body)" }}>
          Claim forecast
        </h4>
        {digest !== null ? (
          <span className="mono ml-auto text-[9.5px]" style={{ color: "var(--ink-faint)" }} title={digest} data-payload-digest={digest}>
            payload sha256:{shortDigest(digest)}
          </span>
        ) : null}
      </header>
      {scheduleFact && mode?.valid_schedules.includes(draft.optimizationSchedule) ? (
        <>
          <ForecastLine label="mode × schedule">{mode.mode_id} × {scheduleFact.schedule}</ForecastLine>
          {/* The schedule is set when a mode is picked (its default) and can be changed in the Walk-forward step. */}
          <ForecastLine label="source">{draft.optimizationSchedule === mode.default_schedule ? "mode default" : "chosen"}</ForecastLine>
          <ForecastLine label="claim (forecast)">
            <span style={{ color: "var(--role-holdout)" }}>{humanise(String(claimToken(scheduleFact.chronological_validation_claim)))}</span>
          </ForecastLine>
          {scheduleFact.oos_use_state ? (
            /* The Atlas words NOT_APPLICABLE "no held-out window — train = test"; beside three declared windows that
               reads as a contradiction (R51), so here the served state is stated as it is. */
            <span className="mono text-right text-[9.5px]" style={{ color: "var(--ink-soft)" }} data-forecast-oos={scheduleFact.oos_use_state} title={scheduleFact.oos_use_state}>
              {scheduleFact.oos_use_state === "NOT_APPLICABLE" ? "OOS: not applicable" : (OOS_STATE_LABEL[scheduleFact.oos_use_state] ?? scheduleFact.oos_use_state)}
            </span>
          ) : null}
          {/* CG-P04-05 / S02-01: the cap is an Atlas fact. The sentence below
              is the server's own reason for it, not a line written here. */}
          <p className="flex flex-col gap-0.5 text-[9.5px] leading-[1.45]" style={{ color: "var(--ink-soft)" }} data-cert-cap={scheduleFact.cert_cap?.state ?? "NOT_SERVED"}>
            <span className="flex items-baseline justify-between gap-2.5">
              <span
                className="text-[10.5px]"
                style={{ color: "var(--ink-faint)" }}
                title={scheduleFact.cert_cap?.reason ?? undefined}
                aria-label={scheduleFact.cert_cap?.reason ? `cert ceiling — ${scheduleFact.cert_cap.reason}` : undefined}
                tabIndex={scheduleFact.cert_cap?.reason ? 0 : undefined}
                data-cert-cap-reason={scheduleFact.cert_cap?.reason ?? undefined}
              >
                cert ceiling
              </span>
              <span className="mono text-[10px] font-bold uppercase tracking-[.06em]" data-cert-ceiling-absent>not published</span>
            </span>
          </p>
        </>
      ) : (
        <p className="text-[10px]" style={{ color: "var(--ink-faint)" }}>
          {draft.optimizationMode && draft.optimizationSchedule
            ? "No admitted mode × schedule fact was published for this selection."
            : <span title="Choose an admitted mode and schedule to read the release claim.">Pick a mode and schedule.</span>}
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------- review rows */

/** The draft as one line per declaration — the same serializer facts the submit sends (HiFi `reviewRows`). */
function ReviewRows({
  draft,
  sweepCeiling,
  usesV2,
  registry,
  labelWidth,
  withWindows = false,
  versionDeclared = false,
  fixedNative = false,
}: {
  draft: RunDraft;
  /** A native fixed recipe runs the declared pins once: the parameter row says so instead of counting a sweep. */
  fixedNative?: boolean;
  sweepCeiling: number | null;
  usesV2: boolean;
  registry: readonly RegistryEntry[];
  /** True when the bound version's declaration was read (so an empty parameter space is the version's own). */
  versionDeclared?: boolean;
  labelWidth?: number;
  /** The Review table has a windows row (the rail has the timeline instead). */
  withWindows?: boolean;
}) {
  const overrides = Object.keys(draft.optimizationConfigOverrides);
  /* The instants as the form and the timeline print them (U12), not a second date-only format. */
  const at = (value: string) => instantText(value);
  /* Scratch is its own declaration; a bound run has nothing to show until a version is chosen. */
  const chosen = !draft.bound || draft.alphaVersionId !== "";
  const versionRead = chosen && versionDeclared;
  /* Only what is declared is listed: an absent value is not a row of "not declared" (the errors above name what is missing). */
  const dataParts = [draft.datasetId, draft.symbol, draft.timeframe].filter((part) => part !== "");
  const anyWindow = draft.protocol === "three_window_decay"
    ? [draft.windows.is, draft.windows.oos, draft.windows.holdout].some((window) => window.start !== "" || window.endExclusive !== "")
    : draft.walkForward.start !== "" || draft.walkForward.endExclusive !== "" || draft.walkForward.splitMode !== "";
  const trialParts = [draft.optunaTrials, draft.earlyStopping, draft.randomSeed];
  return (
    <div className="flex flex-col" data-review-rows>
      {chosen ? (
        <Row label="alpha binding" labelWidth={labelWidth}>
          <span title={bindingChip(draft, registry).title}>{bindingChip(draft, registry).text}</span>
        </Row>
      ) : null}
      <Row label="execution route" labelWidth={labelWidth}>{draft.executionRoute}</Row>
      {effectiveStrategyId(draft) ? (
        <Row label="strategy_id" labelWidth={labelWidth}>
          {effectiveStrategyId(draft)}
          {draft.bound ? " (pinned by alpha_id)" : ""}
        </Row>
      ) : null}
      {dataParts.length > 0 ? (
        <Row label="dataset · symbol · tf" labelWidth={labelWidth}>{dataParts.join(" · ")}</Row>
      ) : null}
      <Row label="protocol" labelWidth={labelWidth}>{draft.protocol}</Row>
      {withWindows && anyWindow ? (
        <Row label="windows" labelWidth={labelWidth}>
          {draft.protocol === "three_window_decay"
            ? [
              draft.windows.is.start ? `IS ${at(draft.windows.is.start)}` : null,
              draft.windows.oos.start ? `OOS ${at(draft.windows.oos.start)}` : null,
              draft.windows.holdout.start ? `holdout ${at(draft.windows.holdout.start)}` : null,
              draft.windows.holdout.endExclusive ? `end ${at(draft.windows.holdout.endExclusive)}` : null,
            ].filter(Boolean).join(" → ")
            : [
              draft.walkForward.start || draft.walkForward.endExclusive ? `walk-forward ${draft.walkForward.start ? at(draft.walkForward.start) : ""} → ${draft.walkForward.endExclusive ? at(draft.walkForward.endExclusive) : ""}`.trim() : null,
              draft.walkForward.splitMode ? `first OOS ${instantText(draft.walkForward.splitMode)}` : null,
              draft.walkForward.frequency || null,
              draft.walkForward.windowMode || null,
            ].filter(Boolean).join(" · ")}
        </Row>
      ) : null}
      {draft.parameters.length > 0 || versionRead ? (
        <Row label="parameter_space" labelWidth={labelWidth}>
          {fixedNative
            ? `${draft.parameters.length} declared · fixed recipe, not swept`
            : `${draft.parameters.length} entries · ${sweptCount(draft)} swept · ${pinnedCount(draft)} pinned${sweepCeiling === null ? "" : ` (sweep ceiling ${sweepCeiling})`}`}
          {withWindows && draft.parameters.length > 0 ? (
            <div className="mt-1.5" data-review-parameter-table>
              <ParameterSpaceTable rows={rowsFromEntries(draft.parameters)} ariaLabel="parameters of this run" />
            </div>
          ) : null}
        </Row>
      ) : null}
      {draft.protocol === "advanced" && usesV2 ? (
        <Row label="walk-forward v2" labelWidth={labelWidth}>
          {[
            draft.walkForward.windowMode === "rolling" && draft.walkForward.trainWindow ? `train ${draft.walkForward.trainWindow}` : null,
            draft.walkForward.labelHorizonBars ? `label ${draft.walkForward.labelHorizonBars}` : null,
            draft.walkForward.purgeBars ? `purge ${draft.walkForward.purgeBars}` : null,
            draft.walkForward.embargoBars ? `embargo ${draft.walkForward.embargoBars}` : null,
            draft.optimizationSchedule === "per_fold_causal" && draft.walkForward.inner ? `inner ${draft.walkForward.inner.splitFrequency || "?"}/${draft.walkForward.inner.trainWindow || "?"}` : null,
          ].filter(Boolean).join(" · ") || "requested-spec v2"}
        </Row>
      ) : null}
      {draft.optimizationMode || draft.optimizationSchedule ? (
        <Row label="mode × schedule" labelWidth={labelWidth}>
          {[draft.optimizationMode, draft.optimizationSchedule].filter((part) => part !== "").join(" × ")}
        </Row>
      ) : null}
      {chosen && trialParts.some((value) => value !== "") ? (
        <Row label="trials · stop · seed" labelWidth={labelWidth}>
          {[trialParts[0] ? `${trialParts[0]} trials` : null, trialParts[1] ? `stop ${trialParts[1]}` : null, trialParts[2] ? `seed ${trialParts[2]}` : null].filter(Boolean).join(" · ")}
        </Row>
      ) : null}
      <Row label="optimization_config" labelWidth={labelWidth}>
        {overrides.length === 0
          ? "release defaults"
          : `${overrides.length} overrides (${overrides.join(", ")}) — rest engine defaults`}
      </Row>
    </div>
  );
}

/**
 * Every problem that blocks the run, each a link to the step that owns it: one list, on Review. A message names its
 * own field, so the reader is sent to the thing to fix rather than told that something is wrong.
 */
function BlockingList({ blocking, onGo }: { blocking: readonly { step: StepId; message: string }[]; onGo?: (step: StepId) => void }) {
  if (blocking.length === 0) return null;
  return (
    <div
      role="alert"
      data-blocking
      className="flex flex-col gap-0.5 rounded-[6px] border px-2.5 py-2"
      style={{ borderColor: "var(--bad)", background: "var(--bad-bg)" }}
    >
      {blocking.map((problem, index) => {
        const label = STEPS.find((candidate) => candidate.id === problem.step)?.label ?? problem.step;
        return onGo ? (
          <button
            key={`${problem.step}-${index}`}
            type="button"
            className="flex flex-wrap items-baseline gap-x-2 text-left text-[10.5px]"
            style={{ color: "var(--bad)" }}
            data-blocking-link={problem.step}
            title={`Fix it in ${label}`}
            onClick={() => onGo(problem.step)}
          >
            <span>{problem.message}</span>
            <span className="underline">{label} →</span>
          </button>
        ) : (
          <span key={`${problem.step}-${index}`} className="text-[10.5px]" style={{ color: "var(--bad)" }}>
            {problem.message}
          </span>
        );
      })}
    </div>
  );
}

function ReviewRail({
  draft,
  blocking,
  atlas,
  sweepCeiling,
  usesV2,
  registry,
  preflight,
  showRows,
  scope = "review",
  catalog = null,
  portalAdmission = null,
  versionDeclared = false,
  estimate = null,
  estimateStatus = IDLE_ESTIMATE,
  onRetryEstimate,
}: {
  /** `review`: the one compact summary on the Review step. `timeline`: only the drawing of the windows, beside the steps that edit them. */
  scope?: "review" | "timeline";
  /** The server's optional `preflight_estimate` (bars, warmup, folds, conditions); null when none was served. */
  estimate?: PreflightEstimate | null;
  estimateStatus?: EstimateStatus;
  onRetryEstimate?: () => void;
  /** S02_DATA: the catalog the coverage bar reads, the Atlas's admitted profiles, and whether the version's declaration was read. */
  catalog?: DatasetCatalog | null;
  portalAdmission?: ProfileFoldBounds | null;
  versionDeclared?: boolean;
  draft: RunDraft;
  blocking: readonly { step: StepId; message: string }[];
  atlas: AtlasDocument | null;
  sweepCeiling: number | null;
  usesV2: boolean;
  /** E4: the rail prints the registry's short `version_label`, as the header does. */
  registry: readonly RegistryEntry[];
  /** The server's preflight, for the claim card's payload digest. */
  preflight: PreflightResponse | null;
  /** False on the Review step, where the same rows are the main panel's table (HiFi 02-16). */
  showRows: boolean;
}) {
  return (
    <aside
      className="flex w-full flex-col gap-2 rounded-[8px] border px-3 py-2.5 lg:sticky lg:top-3 lg:w-[320px] lg:flex-none"
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
      data-review-rail
      aria-label={scope === "review" ? "Review" : "Window timeline"}
    >
      {scope === "review" ? (
        <h3 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
          review
        </h3>
      ) : null}
      <WindowTimeline
        draft={draft}
        catalog={catalog}
        fold={foldPlan(draft, preflight?.resource_estimate?.outer_fold_count ?? null, portalAdmission)}
        estimate={estimate}
        estimateStatus={estimateStatus}
        onRetryEstimate={onRetryEstimate}
      />
      <ConditionsChecklist estimate={estimate} />
      {scope === "review" ? <ClaimForecast draft={draft} atlas={atlas} preflight={preflight} /> : null}
      {showRows ? <ReviewRows draft={draft} sweepCeiling={sweepCeiling} usesV2={usesV2} registry={registry} versionDeclared={versionDeclared} /> : null}
      <BlockingList blocking={blocking} />
    </aside>
  );
}

/* ----------------------------------------------------------------- screen */

/** W5a: a Screen-07 what-if fork (`?from=&fork=`), resolved against the server's grid. */
export interface ForkSource {
  runId: string;
  cellId: string;
  state: "loading" | "ready" | "missing";
  parameters: Record<string, string> | null;
  reason: string | null;
}

export interface NewRunProps {
  workspaceId?: string;
  draft: RunDraft;
  patch: (change: Partial<RunDraft>) => void;
  limits: DraftConstraints;
  /** The installed release's manifest. The route grid is rendered from it. */
  atlas: AtlasDocument | null;
  atlasState: ResearchState;
  /** State of the registry read the version's declaration comes from. */
  declarationState?: ResearchState;
  /** True when the selected version was found and its declaration adopted. */
  declarationBound?: boolean;
  /** Exact safe registry read; no legacy Alpha API fallback. */
  registry?: readonly RegistryEntry[];
  /** Optional deep link; the route accepts only known wizard step ids. */
  initialStep?: StepId;
  /** HiFi 02-18: called with the step the reader is on, so the route can write `?step=`. */
  onStepChange?: (step: StepId) => void;
  /** The Market data step found the typed symbol is not one the dataset lists (answered by the server's search for a partial list). */
  onSymbolMiss?: (symbol: string | null) => void;
  /** Drops the saved draft and opens the form blank; the link shows only while there is something to drop. */
  onStartOver?: () => void;
  /** False when named actor/workspace context cannot safely persist a draft. */
  draftPersistenceAvailable?: boolean;
  /** Bumped by the route when it turned the address's step down, so the screen follows the step it was given. */
  stepSyncKey?: number;

  preflight: PreflightResponse | null;
  preflightState: ResearchState;
  clearedBecause?: string | null;
  onRunPreflight: () => void;
  /** CG-P08-03: the typed refusal of the last preflight, with its field path. */
  preflightRefusal?: PreflightRefusal | null;
  /** True while a preflight request is in flight: the button locks (no second POST) and says so. */
  preflightPending?: boolean;
  /** CG-P08-04: research dataset catalog for the data step. */
  catalog?: DatasetCatalog | null;
  catalogReason?: string | null;
  /** The Atlas response's admitted profiles (`portal_admission.profiles`): fold bounds, and the pins on trials, seed, frequency and window mode. */
  portalAdmission?: ProfileFoldBounds | null;
  /** The server's optional `preflight_estimate` (bars per window, warmup, planned folds, conditions), or null. */
  estimate?: PreflightEstimate | null;
  /** What the declaration-estimate call is doing: asking, refused (typed, with a field path), or failed (4xx / 5xx / no answer). */
  estimateStatus?: EstimateStatus;
  onRetryEstimate?: () => void;
  /** S02 linked-window setup: the runnable options of this Alpha / dataset / symbol / timeframe, and the suggestion that reads them. */
  setup?: RunSetupState;
  /** The reason no enabled profile runs the chosen mode × schedule for this Alpha (from the setup), or null. */
  unopenedCombination?: string | null;
  /** CG-P11-07 `?from=`: the run this draft was copied from, and the read's state. */
  cloneSource?: { runId: string; state: ResearchState; copiedAt?: number | null } | null;
  /** W5a: the Screen-07 what-if node this draft forks, read from the server's grid. */
  forkSource?: ForkSource | null;

  mayCreateRun: boolean;
  canSubmit: boolean;
  created: RunCreateResponse | null;
  createState: ResearchState;
  outcomeUnknown: boolean;
  onSubmit: () => void;
  onRecheck: () => void;
}

export function NewRun(props: NewRunProps) {
  const workspaceId = props.workspaceId;
  const {
    draft,
    patch,
    limits,
    atlas,
    atlasState,
    declarationState,
    declarationBound,
    registry = [],
    preflight,
    preflightState,
    clearedBecause,
    onRunPreflight,
    mayCreateRun,
    canSubmit,
    created,
    createState,
    outcomeUnknown,
    onSubmit,
    onRecheck,
    initialStep = "context",
    onStepChange,
    onSymbolMiss,
    onStartOver,
    draftPersistenceAvailable,
    stepSyncKey = 0,
    preflightRefusal = null,
    preflightPending = false,
    catalog = null,
    catalogReason = null,
    portalAdmission = null,
    estimate = null,
    estimateStatus = IDLE_ESTIMATE,
    onRetryEstimate,
    setup = IDLE_SETUP,
    unopenedCombination = null,
    cloneSource = null,
    forkSource = null,
  } = props;
  /* LW-07: the profile this declaration falls under, when exactly one does. */
  const profiles = useMemo(() => setupProfilesOr(setup.options, readProfiles(portalAdmission)), [setup.options, portalAdmission]);
  /* Two advanced profiles can be enabled (v1 and v2): the one whose requested-spec version the draft serializes as. */
  const v2 = usesSpecV2(draft);
  const profile = useMemo(
    () => selectProfile(profiles, { protocol: draft.protocol, executionRoute: draft.executionRoute, optimizationMode: draft.optimizationMode, optimizationSchedule: draft.optimizationSchedule, trials: draft.optunaTrials, specVersion: specVersionOf(v2) }),
    [profiles, draft.protocol, draft.executionRoute, draft.optimizationMode, draft.optimizationSchedule, draft.optunaTrials, v2],
  );
  const family = useMemo(
    () => profileFamily(profiles, { protocol: draft.protocol, executionRoute: draft.executionRoute, optimizationMode: draft.optimizationMode }).filter((entry) => entry.enabled),
    [profiles, draft.protocol, draft.executionRoute, draft.optimizationMode],
  );
  const sweepCeiling = limits.sweepCeiling === undefined ? SWEEP_CEILING : limits.sweepCeiling;
  const refusalStep = preflightRefusal?.fieldPath ? stepForFieldPath(preflightRefusal.fieldPath) : null;
  const estimateRefusalStep = estimateStatus.kind === "refused" && estimateStatus.fieldPath ? stepForFieldPath(estimateStatus.fieldPath) : null;
  /* FG-08 (FE-A1-03): a refused preflight's panels state the client sentence,
     not the server's message that the hook carries as the panel reason. */
  const previewState: ResearchState = preflightRefusal
    ? { ...preflightState, reason: preflightRefusal.copy, detail: null }
    : preflightState;

  const [step, setStep] = useState<StepId>(initialStep);
  const [visited, setVisited] = useState<ReadonlySet<StepId>>(() => new Set(initialStep === "context" ? [] : [initialStep]));
  /* The address names the step: a Back, a Forward or a link moves the screen to it; a bumped key re-applies it when the
     route turned a step down (Review with nothing declared) and the address did not otherwise change. */
  useEffect(() => {
    setStep(initialStep);
  }, [initialStep, stepSyncKey]);
  /* E4 (audit 02-8): reaching a step counts as visiting it, however the
     reader got there — a pill, a refusal jump, or `?step=`. Before this, only
     a pill click counted, so the wizard's own error marks lagged behind the
     step on screen. */
  useEffect(() => {
    setVisited((previous) => (previous.has(step) ? previous : new Set([...previous, step])));
  }, [step]);
  /* HiFi 02-18: the step is part of the address, so a reload or a shared link lands where the reader was. Only a step
     the reader moved to is written (one history entry each): a step the address already names (a Back, a Forward,
     the opening one) is the address talking, and writing it back would undo the Back. */
  const onStepChangeRef = useRef(onStepChange);
  onStepChangeRef.current = onStepChange;
  const addressStepRef = useRef(initialStep);
  addressStepRef.current = initialStep;
  useEffect(() => {
    if (step !== addressStepRef.current) onStepChangeRef.current?.(step);
  }, [step]);
  /* Reaching a step, or walking through it, is not enough to call what is still EMPTY wrong: a fresh form opened
     on Market data read "A symbol is required." before a key was pressed, and passing through Market data on the
     way to Review turned it red (U18). An unfinished step reads "in progress" until the reader edits it. A value
     that is there and wrong (a copied 4h the version does not declare) is a different thing: leaving the step
     with it shows it. Review always lists every problem, so nothing walked past is hidden. */
  const [engaged, setEngaged] = useState<ReadonlySet<StepId>>(() => new Set());
  const previousStep = useRef<StepId>(step);
  const problemsRef = useRef<{ draft: RunDraft; blocking: ReturnType<typeof blockingProblems> } | null>(null);
  useEffect(() => {
    const left = previousStep.current;
    previousStep.current = step;
    const latest = problemsRef.current;
    if (left === step || latest === null) return;
    if (latest.blocking.some((problem) => problem.step === left && !isIncompleteProblem(latest.draft, problem))) {
      setEngaged((previous) => (previous.has(left) ? previous : new Set([...previous, left])));
    }
  }, [step]);
  const stepPatch = useCallback(
    (change: Partial<RunDraft>) => {
      /* Choosing the dataset opens the step's work; it is not yet an answer to the symbol, so it must not flag the symbol empty. */
      const picksDatasetOnly = ("datasetId" in change && !("symbol" in change)) || (Object.keys(change).length === 1 && "protocol" in change);
      if (!picksDatasetOnly) setEngaged((previous) => (previous.has(step) ? previous : new Set([...previous, step])));
      patch(change);
    },
    [patch, step],
  );
  /* The estimate already knows the fold count: a plan the profile refuses (1 fold where 2–16 are needed) is said before any preflight. */
  const foldProblem = foldCountProblem(estimate);
  /* The recipe's own trial range (and, per fold, its total cap) is said before a preflight spends a preview on it. */
  const trialProblem = trialBudgetProblem(draft.optunaTrials, profile, estimate?.plannedFolds?.count ?? null);
  /* A typed refusal in the preflight (may_create_run false with a code) will be refused again at create: no point offering the button. */
  const admissionRefused = canSubmit && !mayCreateRun && Boolean(preflight?.run_admission?.code);
  const blocking = useMemo(
    () => [
      ...blockingProblems(draft, limits),
      ...(unopenedCombination !== null ? [{ step: "windows" as const, message: unopenedCombination }] : []),
      ...(foldProblem !== null && draft.protocol === "advanced" ? [{ step: "windows" as const, message: foldProblem }] : []),
      ...(trialProblem !== null ? [{ step: "optimization" as const, message: trialProblem }] : []),
    ],
    [draft, limits, unopenedCombination, foldProblem, trialProblem],
  );
  problemsRef.current = { draft, blocking };
  const errorByStep = useMemo(
    () => new Map(blocking.map((problem) => [problem.step, problem.message])),
    [blocking],
  );
  const shownError = useMemo(
    () => new Map([...errorByStep].filter(([key]) => engaged.has(key))),
    [errorByStep, engaged],
  );
  const unfinishedSteps = useMemo(
    () => new Set([...errorByStep.keys()].filter((key) => !engaged.has(key))),
    [errorByStep, engaged],
  );
  const errorSteps = useMemo(() => {
    const steps = new Set([...errorByStep.keys()].filter((key) => engaged.has(key)));
    /* CG-P08-03: a server refusal marks the step that owns its field path. */
    if (refusalStep && refusalStep !== "review") steps.add(refusalStep);
    /* The declaration-estimate route names a field the same way. */
    if (estimateRefusalStep && estimateRefusalStep !== "review") steps.add(estimateRefusalStep);
    return steps;
  }, [errorByStep, engaged, refusalStep, estimateRefusalStep]);
  const missing = useMemo(() => missingConstraints(limits), [limits]);
  const chip = bindingChip(draft, registry);
  /* The bound version's served `run_admission`: shown on Context and in its step caption. Display only — the server decides at create. */
  const boundEntry = registry.find((entry) => entry.alpha_id === draft.alphaId && entry.alpha_version_id === draft.alphaVersionId);
  const contextBlocked = draft.bound && boundEntry?.run_admission?.may_create_run === false;
  const profileFit = useMemo(
    () => profileTimeframes(profiles, { protocol: draft.protocol, executionRoute: draft.executionRoute, optimizationMode: draft.optimizationMode }),
    [profiles, draft.protocol, draft.executionRoute, draft.optimizationMode],
  );

  /* Steps with nothing left to choose. A bound run's strategy is the alpha's own; the optimization step is read-only
     once the profile pins the trial count and the seed (when one is needed). They stay as pills for orientation, never
     block, and Back and Next walk past them. */
  const pinnedTrials = trialsPinned(profile);
  const pinnedSeedValue = seedPinned(profile);
  const optimizationPinned =
    profile?.enabled === true
    && pinnedTrials !== null
    && draft.optunaTrials.trim() === String(pinnedTrials)
    && (limits.seedRequired !== true || (pinnedSeedValue !== null && draft.randomSeed.trim() === String(pinnedSeedValue)))
    && !errorByStep.has("optimization");
  const passive = useMemo<ReadonlySet<StepId>>(() => {
    const out = new Set<StepId>();
    if (draft.bound && draft.alphaVersionId !== "" && !errorByStep.has("strategy")) out.add("strategy");
    if (optimizationPinned) out.add("optimization");
    return out;
  }, [draft.bound, draft.alphaVersionId, errorByStep, optimizationPinned]);
  const goTo = useCallback(
    (next: StepId) => {
      setVisited((previous) => new Set([...previous, step, next]));
      setStep(next);
    },
    [step],
  );
  /* The step Back or Next leads to: the next one that still has something to choose. */
  const neighbour = (direction: 1 | -1): StepId | null => {
    for (let index = STEPS.findIndex((candidate) => candidate.id === step) + direction; index >= 0 && index < STEPS.length; index += direction) {
      const candidate = STEPS[index]!.id;
      if (!passive.has(candidate) || candidate === "review") return candidate;
    }
    return null;
  };
  const previousStepId = neighbour(-1);
  const nextStepId = neighbour(1);

  /* One state for a session that may read but not write: the estimate, the preflight and the create all answer 403,
     and three sentences for one cause is noise. The codes are in the tooltip. */
  const estimateReadOnly = estimateStatus.kind === "error" && estimateStatus.status === 403;
  const preflightReadOnly = preflightRefusal !== null && preflightRefusal.status === 403;
  const createReadOnly = createState.state === "denied";
  const readOnly = estimateReadOnly || preflightReadOnly || createReadOnly;
  const readOnlyFacts = [
    "403",
    preflightReadOnly ? preflightRefusal?.code : null,
    estimateStatus.kind === "error" && estimateReadOnly ? estimateStatus.code : null,
    preflightReadOnly ? (preflightRefusal?.requestId ? `request ${preflightRefusal.requestId}` : null) : null,
  ].filter((part): part is string => Boolean(part));

  return (
    <div
      data-screen="new-run"
      className="flex flex-col gap-3 pb-4"
      style={{ background: "var(--paper)", color: "var(--ink)" }}
    >
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1.5 border-b pb-2.5" style={{ borderColor: "var(--line)" }}>
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap gap-3 text-[10px] font-semibold" style={{ color: "var(--accent)" }}>
            <Link to="/research/quantbt/runs" data-link="run-library" title="Back to the Run Library">← Run Library</Link>
            <Link to="/research/quantbt/alpha-import" data-link="alpha-import" title="Import a new alpha version, then come back here">Import a version</Link>
            {onStartOver && !draftIsEmpty(draft) ? (
              <button type="button" className="no-print text-[10px] font-semibold" style={{ color: "var(--accent)" }} data-action="start-over" title={draftPersistenceAvailable === false ? "Discard the current declaration and open a blank form" : "Drop the saved draft and open a blank form"} onClick={onStartOver}>
                Start over
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1
              className="text-[22px] font-light tracking-[-.01em]"
              style={{ fontFamily: "Newsreader, Georgia, serif" }}
              title={SUBTITLE}
            >
              New Run
            </h1>
            <span
              className="mono rounded-[3px] border px-[5px] text-[10px] font-bold leading-[16px]"
              data-binding-chip={chip.state}
              data-alpha-version-id={draft.alphaVersionId || undefined}
              title={chip.title}
              style={{
                color: chip.state === "PUBLISHABLE" ? "var(--good)" : chip.state === "PENDING_VERSION" ? "var(--ink-faint)" : "var(--role-holdout)",
                borderColor: chip.state === "PUBLISHABLE" ? "var(--good)" : chip.state === "PENDING_VERSION" ? "var(--line)" : "var(--role-holdout)",
                borderStyle: chip.state === "PUBLISHABLE" ? "solid" : "dashed",
                background: chip.state === "PUBLISHABLE" ? "var(--good-bg, var(--paper))" : "var(--paper)",
              }}
            >
              {chip.text}
            </span>
          </div>
        </div>
        {/* HiFi 02-2: the installed-release line sits bottom-right of the header. */}
        <span
          className="mono flex-none text-[10px]"
          style={{ color: "var(--ink-faint)" }}
          data-release-note
          title="Routes, protocols and ceilings are read from the installed engine release."
        >
          engine{" "}
          {atlas ? `${atlas.current_release.package}==${atlas.current_release.expected_version} · ${atlas.current_release.release_id}` : "release not available"}
        </span>
      </header>

      {cloneSource ? (
        <div
          role="status"
          className="flex flex-wrap items-baseline gap-2 rounded-[6px] border px-3 py-2 text-[11px]"
          style={{
            borderColor: cloneSource.state.state === "available" ? "var(--accent)" : "var(--bad)",
            background: "var(--paper-raised)",
          }}
          data-clone-source={cloneSource.runId}
          data-clone-state={cloneSource.state.state}
        >
          {cloneSource.state.state === "available" ? (
            <>
              <span className="mono text-[9px] font-bold uppercase tracking-[.07em]" style={{ color: "var(--accent)" }} title="A new run with a NEW intent: change anything, then run a fresh preflight. The original run is untouched.">copied from</span>
              <Link className="mono" data-link="clone-source" title="Open the source run" to={`/research/quantbt/runs/${encodeURIComponent(cloneSource.runId)}/progress`}><RunRef runId={cloneSource.runId} /></Link>
              {draft.alphaId ? (
                <LineageLink to={lineageHref(draft.alphaId, { av: draft.alphaVersionId || null })} className="mono" action="open-lineage">
                  attempt lineage →
                </LineageLink>
              ) : null}
            </>
          ) : cloneSource.state.state === "loading" ? (
            <span style={{ color: "var(--ink-soft)" }}>Reading the declaration of <RunRef runId={cloneSource.runId} />…</span>
          ) : (
            <span style={{ color: "var(--bad)" }}>{cloneSource.state.reason}</span>
          )}
        </div>
      ) : null}

      {forkSource ? (
        <div
          role="status"
          className="flex flex-wrap items-baseline gap-2 rounded-[6px] border border-dashed px-3 py-2 text-[11px]"
          style={{ borderColor: forkSource.state === "missing" ? "var(--bad)" : "var(--warn)", background: "var(--paper-raised)" }}
          data-fork-source={forkSource.runId}
          data-fork-cell={forkSource.cellId}
          data-fork-state={forkSource.state}
        >
          <span className="mono text-[9px] font-bold uppercase tracking-[.07em]" style={{ color: "var(--warn)" }}>
            sibling of
          </span>
          <Link className="mono" data-link="fork-source" title="Open the frozen run this what-if forks" to={`/research/quantbt/runs/${encodeURIComponent(forkSource.runId)}/freeze`}><RunRef runId={forkSource.runId} /></Link>
          <span className="mono" style={{ color: "var(--ink-faint)" }}>· what-if {forkSource.cellId}</span>
          {forkSource.state === "ready" && forkSource.parameters ? (
            <>
              <span className="mono" data-fork-pins>
                {Object.entries(forkSource.parameters).map(([name, value]) => `${name} ${value}`).join(" · ")}
              </span>
              <span
                style={{ color: "var(--ink-soft)" }}
                title={`Forked from ${forkSource.runId} · what-if — a new intent with its own preflight and config_hash, lineage-linked to that run. The frozen run is untouched.`}
              >
                new intent · own preflight
              </span>
              {draft.alphaId ? (
                <LineageLink to={lineageHref(draft.alphaId, { av: draft.alphaVersionId || null })} className="mono" action="open-lineage">
                  attempt lineage →
                </LineageLink>
              ) : null}
            </>
          ) : forkSource.state === "loading" ? (
            <span style={{ color: "var(--ink-soft)" }}>Reading that run's what-if grid…</span>
          ) : (
            <span style={{ color: "var(--bad)" }}>{forkSource.reason}</span>
          )}
        </div>
      ) : null}

      <WizardBar
        current={step}
        onPick={goTo}
        passive={passive}
        errors={errorSteps}
        unfinished={unfinishedSteps}
        visited={visited}
        contextChosen={!draft.bound || draft.alphaVersionId !== ""}
        contextBlocked={contextBlocked}
        reviewCaption={preflightRefusal ? "preflight refused" : preflight ? "preflight issued" : "preflight pending"}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {step === "context" ? (
            <>
              <ContextStep workspaceId={workspaceId} draft={draft} patch={stepPatch} limits={limits} registry={registry} />
              {/* What could not be read, named. A rule the browser did not get
                  is not a rule that passed — and a blank space would read as
                  the second thing. */}
              {/* HiFi 02-4: until a version is chosen there is no declaration to
                  report on, so the panel stays out rather than listing facts
                  that were never asked for. */}
              {!draft.bound || draft.alphaVersionId === "" ? null : missing.length > 0 ? (
                <ResearchPanel
                  title="version declaration"
                  state={declarationState ?? atlasState}
                  minBodyHeight={48}
                >
                  <p className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-missing-constraints>
                    <span title="The checks that depend on them do not run here; the server still applies its own at preflight.">
                      Not read for this declaration: {missing.join(", ")}.
                    </span>
                  </p>
                </ResearchPanel>
              ) : null}
            </>
          ) : null}
          {step === "strategy" ? (
            <StrategyStep draft={draft} patch={stepPatch} error={shownError.get("strategy") ?? null} onAllParameters={() => goTo("parameters")} />
          ) : null}
          {step === "route" ? (
            <RouteStep
              draft={draft}
              patch={stepPatch}
              atlas={atlas}
              atlasState={atlasState}
              limits={limits}
              error={shownError.get("route") ?? null}
            />
          ) : null}
          {step === "data" ? (
            <DataStep workspaceId={workspaceId} draft={draft} patch={stepPatch} limits={limits} error={shownError.get("data") ?? null} catalog={catalog} catalogReason={catalogReason} registry={registry} profileFit={profileFit} onSymbolMiss={onSymbolMiss} setupStatus={setup.status} />
          ) : null}
          {step === "windows" ? (
            <WindowsStep draft={draft} patch={stepPatch} adopt={patch} atlas={atlas} profile={profile} family={family} profiles={profiles} estimateStatus={estimateStatus} estimate={estimate} error={shownError.get("windows") ?? null} catalog={catalog} warmupBars={limits.warmupBars} setup={setup} workspaceId={workspaceId} timeframe={draft.timeframe} registry={registry} />
          ) : null}
          {step === "parameters" ? (
            <ParametersStep draft={draft} patch={stepPatch} error={shownError.get("parameters") ?? null} ceiling={sweepCeiling} fixedNative={(profile?.enabled ? profile : null)?.nativeInput != null} />
          ) : null}
          {step === "optimization" ? (
            <OptimizationStep
              draft={draft}
              patch={stepPatch}
              limits={limits}
              release={atlas?.current_release ?? null}
              error={shownError.get("optimization") ?? null}
              profile={profile}
              profilesServed={profiles !== null}
            />
          ) : null}

          {step === "review" ? (
            <div className="flex flex-col gap-2.5" data-review-step>
              {/* HiFi 02-16 (M): the summary table is the main panel's first
                  block, the same rows the submit serializes; the rail keeps the
                  timeline and the forecast. */}
              <Card title="Review &amp; run">
                <ReviewRows draft={draft} sweepCeiling={sweepCeiling} usesV2={v2} registry={registry} labelWidth={150} withWindows versionDeclared={declarationBound ?? false} fixedNative={profile?.nativeInput != null} />
                <AccountFacts account={profile?.account} native={profile?.nativeInput ?? null} />
              </Card>
              {clearedBecause && preflight === null ? (
                <p role="status" className="text-[11px]" style={{ color: "var(--role-holdout)" }} data-cleared-note>
                  {clearedBecause}
                </p>
              ) : null}

              {/* E4 (audit 02-16): the HiFi puts the primary action in the
                  main panel, above everything. It used to sit above seven
                  empty framed panels and a ghost button, so the reader
                  scrolled past an empty preflight to find "Create run". */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn-ghost mono text-[10px]"
                  data-action="preflight"
                  onClick={() => {
                    /* A second click while the first is in flight would persist a second preflight. */
                    if (!preflightPending) onRunPreflight();
                  }}
                  disabled={blocking.length > 0 || preflightPending}
                  aria-busy={preflightPending || undefined}
                  style={blocking.length > 0
                    ? { opacity: 0.4, cursor: "not-allowed" }
                    : {
                      border: "1px solid var(--accent)",
                      background: "var(--accent)",
                      color: "var(--accent-contrast)",
                      fontWeight: 600,
                      letterSpacing: ".05em",
                      textTransform: "uppercase",
                      padding: "6px 16px",
                      opacity: preflightPending ? 0.7 : 1,
                      cursor: preflightPending ? "progress" : undefined,
                    }}
                  title={blocking.length > 0 ? blocking[0].message : undefined}
                >
                  {preflightPending ? (
                    <span className="inline-flex items-center gap-1.5" data-preflight-running>
                      <span aria-hidden="true" className="inline-block h-[9px] w-[9px] rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin" />
                      Running preflight…
                    </span>
                  ) : (
                    "Run preflight"
                  )}
                </button>
              </div>
              {/* The one list of what blocks: the rail does not repeat it on this step. */}
              <BlockingList blocking={blocking} onGo={goTo} />
              {readOnly ? (
                <p
                  role="status"
                  className="text-[11px] font-semibold"
                  style={{ color: "var(--bad)" }}
                  data-read-only-session
                  title={readOnlyFacts.join(" · ")}
                  aria-label={`Read-only session · ${readOnlyFacts.join(" · ")}`}
                  tabIndex={0}
                >
                  Read-only session.
                </p>
              ) : null}

              {/* FG-08 (FE-A1-03/-04): every refusal shows here, with or
                  without a field path. The sentence is client copy keyed by
                  the typed code; the server's own message is never printed. */}
              {preflightRefusal && !readOnly ? (
                <div
                  role="alert"
                  className="flex flex-wrap items-baseline gap-2 rounded-[6px] border px-2.5 py-1.5 text-[11px]"
                  style={{ borderColor: "var(--bad)", background: "var(--bad-bg)", color: "var(--bad)" }}
                  data-refusal-field={preflightRefusal.fieldPath?.join(".") ?? ""}
                >
                  {preflightRefusal.gate ?? preflightRefusal.code ? (
                    <span className="mono text-[9.5px] font-bold">{preflightRefusal.gate ?? preflightRefusal.code}</span>
                  ) : null}
                  <span className="flex-1" data-refusal-copy>{preflightRefusal.copy}</span>
                  {preflightRefusal.fieldPath && preflightRefusal.fieldPath.length > 0 ? (
                    <span className="mono text-[9.5px]" data-refusal-path>{preflightRefusal.fieldPath.join(".")}</span>
                  ) : null}
                  {preflightRefusal.requestId ? (
                    <span className="mono text-[9.5px]" data-request-id>request {preflightRefusal.requestId}</span>
                  ) : null}
                  {refusalStep && refusalStep !== "review" ? (
                    <button
                      type="button"
                      className="btn-ghost mono text-[10px]"
                      data-action="go-to-refused-step"
                      onClick={() => {
                        setVisited((previous) => new Set([...previous, refusalStep]));
                        setStep(refusalStep);
                      }}
                    >
                      fix in {STEPS.find((candidate) => candidate.id === refusalStep)?.label ?? refusalStep} →
                    </button>
                  ) : null}
                </div>
              ) : null}

              {/* E4 (audit 02-16): before a preflight has run, its six panels
                  are six empty frames saying the same sentence. They stay in
                  the DOM — the reader can see what preflight will check, and
                  P08-T10 still finds every named panel — but they are folded,
                  so the primary action is not buried under them. */}
              {preflight === null && readOnly ? null : preflight === null ? (
                <details data-preflight-preview>
                  <summary
                    className="mono cursor-pointer text-[10.5px]"
                    style={{ color: "var(--ink-soft)" }}
                    data-preflight-preview-summary
                  >
                    {preflightRefusal ? "preflight refused" : "preflight not run"}
                  </summary>
                  <div className="flex flex-col gap-2.5 pt-2">
                    <PreflightPanel preflight={preflight} state={previewState} />
                  </div>
                </details>
              ) : (
                <PreflightPanel preflight={preflight} state={previewState} />
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn-primary mono text-[10px]"
                  data-action="create-run"
                  onClick={onSubmit}
                  disabled={!canSubmit || admissionRefused}
                  style={!canSubmit || admissionRefused ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
                  title={!canSubmit ? (unopenedCombination ?? "Run preflight first.") : admissionRefused ? `${preflight?.run_admission?.code}: change the declaration, then run preflight again.` : undefined}
                >
                  Create run
                </button>
                {!canSubmit ? /* W4A: the disabled button's tooltip and the folded "preflight not run" line say it; no third copy. */ null : !mayCreateRun ? (
                  <span className="text-[10.5px]" style={{ color: "var(--role-holdout)" }} data-admission-note>
                    {preflight?.run_admission?.message ? (
                      <>
                        <span className="mono text-[9.5px] font-bold">{preflight.run_admission.code}</span>{" "}
                        {preflight.run_admission.message} Change the declaration and run preflight again; the server
                        decides again when a run is requested.
                      </>
                    ) : (
                      <>
                        The server has not published creation admission for this preview. Submitting is
                        still allowed — admission is decided when the request arrives.
                      </>
                    )}
                  </span>
                ) : null}
              </div>

              {/* E4 (audit 02-16): the seventh empty frame. A run that has not
                  been created has no record to show and no state to report, so
                  the panel appears with the request rather than before it. */}
              {created || (createState.state !== "empty" && !readOnly) ? (
              <ResearchPanel title="run" state={createState} minBodyHeight={72}>
                {created ? (
                  <div className="flex flex-col" data-created={created.run_id}>
                    <Row label="run"><ShortId id={created.run_id} label="run" /></Row>
                    <Row label="status">{created.status}</Row>
                    <Row label="replayed">{String(created.replayed)}</Row>
                    <Row label="effective spec">{created.effective_spec_digest}</Row>
                    <Row label="manifest">{created.manifest_digest}</Row>
                  </div>
                ) : null}
              </ResearchPanel>
              ) : null}

              {outcomeUnknown ? (
                <div className="flex flex-wrap items-center gap-2" data-unknown-outcome>
                  <span className="text-[11px]" style={{ color: "var(--role-holdout)" }}>
                    {UNKNOWN_OUTCOME_NOTE}
                  </span>
                  <button type="button" className="btn-ghost mono text-[10px]" data-action="recheck" onClick={onRecheck}>
                    Check again
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Back and Next walk the steps that still have something to choose; the pills reach the rest. */}
          <nav className="flex flex-wrap items-center justify-between gap-2" aria-label="Step navigation" data-step-nav>
            {previousStepId ? (
              <button type="button" className="btn-ghost mono text-[10px]" data-action="step-back" onClick={() => goTo(previousStepId)}>
                ← Back · {STEPS.find((candidate) => candidate.id === previousStepId)?.label}
              </button>
            ) : <span />}
            {nextStepId && step !== "review" ? (
              <button type="button" className="btn-primary mono text-[10px]" data-action="step-next" onClick={() => goTo(nextStepId)}>
                Next · {STEPS.find((candidate) => candidate.id === nextStepId)?.label} →
              </button>
            ) : null}
          </nav>
        </div>

        {step === "review" || step === "windows" || step === "data" ? (
          <ReviewRail draft={draft} blocking={[]} atlas={atlas} sweepCeiling={sweepCeiling} usesV2={v2} registry={registry} preflight={preflight} showRows={false} scope={step === "review" ? "review" : "timeline"} catalog={catalog} portalAdmission={portalAdmission} versionDeclared={declarationBound ?? false} estimate={estimate} estimateStatus={step === "review" && readOnly ? IDLE_ESTIMATE : estimateStatus} onRetryEstimate={onRetryEstimate} />
        ) : null}
      </div>
    </div>
  );
}
