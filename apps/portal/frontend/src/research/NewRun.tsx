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

import { LineageLink, lineageHref } from "./LineageLink";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link as RouterLink, useInRouterContext } from "react-router-dom";

import {
  ALPHA_VERSION_PUBLICATION_WORDS,
  approvalStatusWords,
  useAlphaVersionPublications,
  type AlphaVersionPublicationView,
} from "./alphaVersionPublication";
import { scheduleChoices } from "./atlas";
import type { AtlasDocument } from "./atlas";
import { type CatalogDataset, type DatasetCatalog, coverageLabel, splitCatalogReason } from "./datasetClient";
import {
  CoverageWarnings,
  DatasetIdentity,
  SymbolCombobox,
  TimeframeChips,
  UnavailableDatasets,
} from "./DataDeclaration";
import {
  type FoldPlan,
  type ProfileFoldBounds,
  coverageRange,
  coverageWarnings,
  foldPlan,
  sharedAxis,
  timeframeChips,
} from "./dataDeclaration";
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
  SWEEP_CEILING,
  applyCoveragePrefill,
  blockingProblems,
  carriedCoverage,
  effectiveStrategyId,
  markPrefillTouched,
  missingConstraints,
  outerFields,
  planCoverage,
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
      text: "NOT_PUBLISHABLE · scratch",
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

/** Wide enough for `05/01/2026, 12:00 AM` and the picker icon at the input's 11px mono. */
const INSTANT_FIELD_WIDTH = 196;

function Field({
  label,
  children,
  hint,
  minWidth,
}: {
  label: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
  /** Pixels the field keeps before the row wraps (a date-time input must show its time, not "12:" cut by the picker icon). */
  minWidth?: number;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1" style={minWidth ? { minWidth } : undefined}>
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
      style={{ borderColor: "var(--bad)", background: "var(--bad-bg-soft)", color: "var(--bad)" }}
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
        <h3 className="text-[12px] font-semibold uppercase tracking-[.05em]" style={{ fontFamily: "var(--font-body)" }}>{title}</h3>
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
  visited,
  contextChosen,
  reviewCaption,
}: {
  step: StepId;
  current: boolean;
  hasError: boolean;
  visited: boolean;
  /** Context has no validator of its own: it passes once a version is chosen, or for a scratch run. */
  contextChosen: boolean;
  reviewCaption: string;
}): StepCaption {
  if (hasError) return { state: "error", caption: "needs attention" };
  /* Review's verdict is the server's preflight, which the bar cannot see, so
     Review never gets a tick; its caption is the preflight's own state. */
  if (step === "review") return { state: current ? "current" : visited ? "visited" : "not-visited", caption: reviewCaption };
  if (!visited) return { state: "not-visited", caption: "not visited" };
  if (step === "context" && !contextChosen) return { state: current ? "current" : "incomplete", caption: "no version chosen" };
  return { state: current ? "current" : "valid", caption: "valid" };
}

function WizardBar({
  current,
  onPick,
  errors,
  visited,
  contextChosen,
  reviewCaption,
}: {
  current: StepId;
  onPick: (step: StepId) => void;
  errors: ReadonlySet<StepId>;
  /** Steps the reader has reached. A step nobody opened has not been checked, so it is never "valid". */
  visited: ReadonlySet<StepId>;
  contextChosen: boolean;
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
          visited: visited.has(step.id),
          contextChosen,
          reviewCaption,
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
            aria-label={showText ? undefined : `${step.label} — ${caption}`}
            title={showText ? undefined : `${step.label} — ${caption}`}
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
                <span
                  className="text-[9px]"
                  data-step-caption
                  style={{ color: hasError ? "var(--bad)" : "var(--ink-faint)" }}
                >
                  {caption}
                </span>
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
  draft,
  patch,
  limits,
  registry,
}: {
  draft: RunDraft;
  patch: (change: Partial<RunDraft>) => void;
  limits: DraftConstraints;
  registry: readonly RegistryEntry[];
}) {
  const bound = registry.find((entry) => entry.alpha_id === draft.alphaId && entry.alpha_version_id === draft.alphaVersionId);
  const alphaIds = [...new Set(registry.map((entry) => entry.alpha_id))];
  /* FG-05: the P22 lookup runs only for a bound version the registry listed. */
  const lookedUp = draft.bound && bound ? bound.alpha_version_id : null;
  const publications = useAlphaVersionPublications(lookedUp !== null ? [lookedUp] : []);
  const supersedes = supersedesFact(bound ?? null, registry);
  return (
    <Card title="Context — alpha &amp; version binding">
      <div className="flex flex-wrap items-end gap-2.5">
        <Field label="Alpha">
          {draft.bound ? (
            <select className={INPUT_CLASS} style={inputStyle()} value={draft.alphaId} onChange={(event) => patch({ alphaId: event.target.value, alphaVersionId: "", strategyId: "" })} aria-label="Alpha" data-alpha-selector disabled={registry.length === 0} title={registry.length === 0 ? "No registry entry is available for the bound declaration." : undefined}>
              <option value="">Select an alpha</option>
              {alphaIds.map((id) => <option key={id} value={id}>{registry.find((entry) => entry.alpha_id === id)?.display_name ?? id}</option>)}
            </select>
          ) : <input className={INPUT_CLASS} style={inputStyle()} value={draft.alphaId} onChange={(event) => patch({ alphaId: event.target.value })} aria-label="Alpha" />}
        </Field>
        <Field label="Version (immutable after submit)">
          {draft.bound ? (
            <select className={INPUT_CLASS} style={inputStyle()} value={draft.alphaVersionId} onChange={(event) => patch({ alphaVersionId: event.target.value })} aria-label="Alpha version" data-version-selector disabled={registry.length === 0 || !draft.alphaId} title={registry.length === 0 ? "No registry entry is available for the bound declaration." : !draft.alphaId ? "Select an alpha first." : undefined}>
              <option value="">Select a version</option>
              {registry.filter((entry) => entry.alpha_id === draft.alphaId).map((entry) => <option key={entry.alpha_version_id} value={entry.alpha_version_id}>{entry.version_label} · {entry.lifecycle_state} · {entry.source_digest_prefix}</option>)}
            </select>
          ) : <input className={INPUT_CLASS} style={inputStyle()} value={draft.alphaVersionId} onChange={(event) => patch({ alphaVersionId: event.target.value })} aria-label="Alpha version" />}
        </Field>
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
                <span className="text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
                  {supersedes.text}
                  {supersedes.code ? <span className="mono not-italic"> · {supersedes.code}</span> : null}
                </span>
              ) : (
                <span className="mono text-[10.5px]">{supersedes.text}</span>
              )}
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
          <span
            className="mono text-[9px] font-bold"
            style={{ color: "var(--role-holdout)" }}
          >
            NOT_PUBLISHABLE
          </span>
          <span className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} title={SCRATCH_BANNER}>
            no release candidate from a scratch run
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
      <span className="text-[10px] italic" style={{ color: "var(--ink-faint)" }} data-last-rc-absent={view.read.reason_code ?? view.read.availability}>
        not published · {view.read.reason_code ?? view.read.availability}
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

function StrategyStep({
  draft,
  patch,
  limits,
  error,
}: {
  draft: RunDraft;
  patch: (change: Partial<RunDraft>) => void;
  limits: DraftConstraints;
  error: string | null;
}) {
  return (
    <Card title="Strategy &amp; protocol">
      <Field
        label="strategy_id"
        hint={draft.bound ? "pinned to the bound alpha_id — the server admits no other" : "free while scratch"}
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
      {error ? <ErrorBlock message={error} /> : null}

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Protocol">
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
        <span className="self-center text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
          Showing only the protocols the installed engine release certifies (2). An uncertified
          protocol is not offered.
        </span>
      </div>
      <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-seed-required>
        {/* Three states, not two: a rule that was not read is not a rule that
            says no. */}
        seed required: {limits.seedRequired === null ? "not declared" : limits.seedRequired ? "yes" : "no"}
      </span>
    </Card>
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
                            color: statusTone(route.status_word).color,
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
                      {route.family} · {route.execution_contract}
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
                        disabled
                        aria-label={`${route.route_id}, not admitted — ${blocked}`}
                        title={blocked}
                        data-route-card={route.route_id}
                        data-route-blocked="true"
                        className="mono rounded-[6px] border border-dashed px-2 py-[3px] text-[10px]"
                        style={{ borderColor: "var(--line-strong)", color: "var(--ink-faint)", background: "var(--paper)", cursor: "not-allowed" }}
                      >
                        {route.route_id}
                        {route.status_word ? <span className="ml-1.5 text-[8.5px]">{route.status_word}</span> : null}
                      </button>
                    );
                  })}
              </div>
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
  wfo: "strategy-param route — walk-forward search applies",
  tape: "tape-driven — single-pass replay; the walk-forward step collapses to the tape span",
  single_pass: "single pass — the engine lists no walk-forward target for this route",
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
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} title={resolved?.reason ?? undefined}>
          {resolved?.state === "RESOLVED" ? resolved.value : resolved?.state === "SPEC_DEPENDENT" ? "backend per specification" : route.backend}
        </span>
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
function coverageSpan(source: CoverageSource): string {
  const months =
    source.months === source.monthsSpanned
      ? `${source.months} month${source.months === 1 ? "" : "s"}`
      : `${source.months} of ${source.monthsSpanned} months present`;
  return `${source.firstMonth} → ${source.lastMonth} · ${months}`;
}

/** The caption under a prefilled field: its source, and which edge of the coverage it is. */
function prefillCaption(field: PrefillField, source: CoverageSource): string {
  const edge = field === "is.start" || field === "walkForward.start"
    ? `first day of ${source.firstMonth}`
    : `end of ${source.lastMonth}`;
  return `prefilled from ${source.symbol} coverage · ${edge}`;
}

/** The field's caption node, or nothing when the field holds a value that is not from coverage. */
function prefillHint(draft: RunDraft, field: PrefillField | null): React.ReactNode {
  const source = field === null ? null : carriedCoverage(draft, field);
  if (field === null || source === null) return undefined;
  return <span style={{ color: "var(--ink-soft)" }} data-prefill-caption={field}>{prefillCaption(field, source)}</span>;
}

/**
 * The same caption for a three-window row. It sits on its own line under the
 * row, because a hint under one input would lift that input out of line with
 * its neighbour (the row aligns its inputs by their bottom edge).
 */
function PrefillLine({ draft, field, label }: { draft: RunDraft; field: PrefillField | null; label: string }) {
  const source = field === null ? null : carriedCoverage(draft, field);
  if (field === null || source === null) return null;
  return (
    <p className="w-full pl-[82px] text-[9.5px]" style={{ color: "var(--ink-soft)" }}>
      {label} <span data-prefill-caption={field}>{prefillCaption(field, source)}</span>
    </p>
  );
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
}: {
  draft: RunDraft;
  patch: (change: Partial<RunDraft>) => void;
  limits: DraftConstraints;
  error: string | null;
  /** CG-P08-04: the research dataset catalog, or null when it was not read. */
  catalog?: DatasetCatalog | null;
  catalogReason?: string | null;
  registry?: readonly RegistryEntry[];
}) {
  const dataset: CatalogDataset | null = catalog?.datasets.find((item) => item.dataset_id === draft.datasetId) ?? null;
  /* FG-08 (FE-A1-01): client sentence, then the typed facts in mono. */
  const catalogNote = catalogReason ? splitCatalogReason(catalogReason) : null;
  const symbols = dataset?.symbols.state === "PUBLISHED" ? dataset.symbols.items : [];
  const selectedSymbol = symbols.find((item) => item.symbol === draft.symbol.trim().toUpperCase()) ?? null;
  const pickDataset = (datasetId: string) =>
    patch({ datasetId, ...applyCoveragePrefill(draft, planCoverage(catalog, datasetId, draft.symbol)) });
  const pickSymbol = (symbol: string) =>
    patch({ symbol, ...applyCoveragePrefill(draft, planCoverage(catalog, draft.datasetId, symbol)) });
  const prefillPlan = planCoverage(catalog, draft.datasetId, draft.symbol);
  const prefilledNow = outerFields(draft.protocol).some((field) => carriedCoverage(draft, field) !== null);
  const publishedTimeframes = limits.declaredTimeframes ?? [];
  const timeframeDeclared = publishedTimeframes.includes(draft.timeframe);
  const versionLabel = bindingVersionLabel(draft, registry);
  const chips = timeframeChips(dataset, limits.declaredTimeframes, draft.timeframe);
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
            <DatasetIdentity labelled dataset={soleDataset} chosen={draft.datasetId === soleDataset.dataset_id} onUse={() => pickDataset(soleDataset.dataset_id)} />
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
            {dataset ? <DatasetIdentity dataset={dataset} chosen onUse={() => pickDataset(dataset.dataset_id)} /> : null}
            {available.length === 0 ? <UnavailableDatasets datasets={unavailable} /> : null}
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
            value={draft.symbol}
            symbols={symbols}
            total={dataset?.symbols.total ?? null}
            truncated={dataset?.symbols.truncated === true}
            bad={draft.symbol.trim().length === 0}
            onChange={pickSymbol}
          />
          {selectedSymbol ? (
            <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-symbol-coverage>
              {selectedSymbol.contract_kind ? `${selectedSymbol.contract_kind.toLowerCase()} · ` : ""}
              {coverageLabel(selectedSymbol) ?? "coverage not published"}
            </span>
          ) : dataset && dataset.symbols.state === "PUBLISHED" && draft.symbol.trim() ? (
            <span className="text-[10px]" style={{ color: "var(--accent-2)" }} data-symbol-unlisted>
              {draft.symbol.trim().toUpperCase()} is not in this dataset&rsquo;s {dataset.symbols.total} listed symbols — preflight will refuse it.
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
            bad={publishedTimeframes.length > 0 && !timeframeDeclared}
            onPick={(timeframe) => patch({ timeframe })}
          />
        </div>
      </div>

      <CoverageWarnings warnings={warnings} coverage={coverageRange(prefillPlan)} />

      {/* D4: what the pick did to the walk-forward dates — filled, kept, or
          why nothing was. Silent until a dataset is chosen. */}
      {draft.datasetId !== "" ? (
        <p
          className="text-[9.5px] leading-[1.5]"
          style={{ color: "var(--ink-soft)" }}
          data-window-prefill-status
          data-prefill-state={prefillPlan.state}
          title={
            prefillPlan.state !== "ready"
              ? undefined
              : prefilledNow
                ? "Outer walk-forward bounds prefilled from this coverage — edit them in the Walk-forward step."
                : "Coverage is published; the outer walk-forward bounds already hold your own values, so nothing was prefilled."
          }
        >
          {prefillPlan.state !== "ready"
            ? prefillPlan.reason
            : prefilledNow
              ? "Bounds prefilled from coverage"
              : "Not prefilled — bounds already set"}
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
        ] as const).map(([label, value, hint]) => (
          <span
            key={label}
            className="flex items-baseline gap-1.5 rounded-[3px] border px-1.5 py-[1px]"
            style={{ borderColor: "var(--line-soft)", background: "var(--paper)" }}
            title={hint}
            data-declaration-fact={label}
          >
            <Label>{label}</Label>
            {value === null ? (
              <span className="text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
                {draft.alphaVersionId ? "not declared" : "no version chosen"}
              </span>
            ) : (
              <span className="mono text-[10.5px]">{value}</span>
            )}
          </span>
        ))}
      </div>
      {error ? <ErrorBlock message={error} /> : null}
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

/**
 * What a `datetime-local` input can be handed for a draft instant.
 *
 * A copied run carries its instants as the server stored them
 * (`2026-05-01T00:00:00Z`); the input only takes local text with no zone, so
 * with the "Z" on it the browser dropped the value and showed a blank
 * `mm/dd/yyyy` box over a draft that held a real date. The draft keeps its own
 * text; only what the input is given loses the trailing "Z" (the form reads
 * these instants as UTC everywhere). An instant the input cannot show at all -
 * an explicit offset, a stray format - comes back as `raw`, to be printed
 * beside the input instead of vanishing.
 */
export function datetimeInputValue(draftValue: string): { input: string; raw: string | null } {
  if (draftValue === "") return { input: "", raw: null };
  const local = draftValue.endsWith("Z") ? draftValue.slice(0, -1) : draftValue;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/.test(local)
    ? { input: local, raw: null }
    : { input: "", raw: draftValue };
}

function DateTimeInput({
  value,
  onChange,
  label,
  style,
  dataSplitMode = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  style: React.CSSProperties;
  dataSplitMode?: boolean;
}) {
  const shown = datetimeInputValue(value);
  return (
    <>
      <input
        type="datetime-local"
        className={INPUT_CLASS}
        style={style}
        value={shown.input}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        data-split-mode={dataSplitMode ? "" : undefined}
      />
      {shown.raw !== null ? (
        <span className="mono text-[9.5px]" style={{ color: "var(--accent-2)" }} data-instant-unshown>
          copied as {shown.raw} — this input cannot show it
        </span>
      ) : null}
    </>
  );
}

/**
 * CG-P02-02 / CG-P08-02: preflight accepts the requested-spec v2 controls
 * (rolling width, label/purge/embargo, inner folds) but run creation has
 * refused every v2 spec so far. Offering the control without saying so
 * teaches the reader that Create fails. The note states the observed fact and
 * no cause — a cause is the server's to state, at Review, once it has spoken —
 * and it steps aside when a served `run_admission` says creation is admitted.
 */
function V2CreateNote({ where, admitted }: { where: string; admitted: boolean }) {
  if (admitted) return null;
  return (
    <span className="block w-full text-[9.5px] leading-[1.5]" style={{ color: "var(--role-holdout)" }} data-v2-create-note={where}>
      Preflight accepts this; create does not admit it yet.
    </span>
  );
}

/**
 * One published walk-forward choice (RF02-F2).
 *
 * The values come from the Atlas (`walk_forward_options`), never from a list in
 * this file. A value the Portal does not admit stays visible, disabled, with
 * the server's reason — preflight would refuse it, so offering it would only
 * teach the reader that the button fails.
 */
function PublishedSelect({
  label,
  value,
  options,
  fallback,
  onChange,
  minWidth,
}: {
  label: string;
  value: string;
  options: readonly { value: string; admission: string; reason?: string | null }[] | null;
  fallback: string;
  onChange: (value: string) => void;
  minWidth?: number;
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
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.admission !== "ADMITTED"}>
            {option.value}
            {option.admission !== "ADMITTED" ? " — not admitted" : ""}
          </option>
        ))}
      </select>
      {refused.map((option) => (
        <span
          key={option.value}
          className="text-[9.5px] leading-[1.45]"
          style={{ color: "var(--ink-faint)" }}
          data-option-refused={option.value}
        >
          {option.value}: {option.reason}
        </span>
      ))}
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
        <>
          <p data-prefill-source>
            Prefilled from the coverage of {source.datasetId} · {source.symbol}: {coverageSpan(source)}, {source.timezone} month partitions.
          </p>
          <p data-prefill-edges>{edgesSentence(warmupBars, draft.protocol)}</p>
          <p data-prefill-interior>
            {draft.protocol === "advanced"
              ? "First OOS instant is left empty: the release publishes no default for it."
              : "IS end, OOS and holdout start are left empty: the server publishes no rule for splitting coverage into windows."}
          </p>
        </>
      ) : plan.state === "ready" ? (
        <p data-prefill-reason>
          The coverage of {plan.source.datasetId} · {plan.source.symbol} is {coverageSpan(plan.source)}. The outer bounds here hold your own values, so nothing was prefilled.
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
  atlas,
  error,
  catalog = null,
  warmupBars = null,
  createAdmitted = false,
}: {
  draft: RunDraft;
  patch: (change: Partial<RunDraft>) => void;
  atlas: AtlasDocument | null;
  error: string | null;
  /** D4: the catalog the outer bounds were prefilled from. */
  catalog?: DatasetCatalog | null;
  /** D4: the warmup the bound version declares, or null when it was not read. */
  warmupBars?: number | null;
  /** The preflight's served `run_admission.may_create_run === true`; hides the v2 create note. */
  createAdmitted?: boolean;
}) {
  const options = atlas?.current_release.walk_forward_options ?? null;
  const prefillPlan = planCoverage(catalog, draft.datasetId, draft.symbol);
  const modes = atlas?.modes ?? [];
  const selectedMode = modes.find((mode) => mode.mode_id === draft.optimizationMode) ?? null;
  const scheduleOptions = atlas && selectedMode ? scheduleChoices(atlas, selectedMode) : [];

  /* A draft adopts the release defaults once, so the form never submits an
     empty value the reader did not see. The defaults are the published ones. */
  useEffect(() => {
    if (!options || draft.protocol !== "advanced") return;
    const change: Partial<RunDraft["walkForward"]> = {};
    if (!draft.walkForward.frequency) change.frequency = options.frequency_default;
    if (!draft.walkForward.windowMode) change.windowMode = options.window_mode_default;
    if (Object.keys(change).length > 0) patch({ walkForward: { ...draft.walkForward, ...change } });
  }, [options, draft.protocol, draft.walkForward, patch]);
  const rows = [
    ["is", "IS"],
    ["oos", "OOS"],
    ["holdout", "Holdout"],
  ] as const;

  /* D4: of the six three-window inputs only the IS start and the holdout end
     are outer bounds a coverage can fill; the four between them are not. */
  const outerField = (key: (typeof rows)[number][0], edge: "start" | "endExclusive"): PrefillField | null =>
    key === "is" && edge === "start" ? "is.start" : key === "holdout" && edge === "endExclusive" ? "holdout.endExclusive" : null;
  const setWindow = (key: (typeof rows)[number][0], edge: "start" | "endExclusive", value: string) =>
    patch({
      windows: { ...draft.windows, [key]: { ...draft.windows[key], [edge]: value } },
      ...touchPatch(draft, outerField(key, edge)),
    });

  return (
    <Card title="Walk-forward">
      <WindowPrefillNote draft={draft} plan={prefillPlan} warmupBars={warmupBars} />
      {draft.protocol === "three_window_decay" ? (
        <div className="flex flex-col gap-2" data-three-window>
          {rows.map(([key, label]) => (
            <div key={key} className="flex flex-wrap items-end gap-2.5" data-window={key}>
              <span className="mono w-[72px] flex-none text-[10.5px] font-semibold">{label}</span>
              <Field minWidth={INSTANT_FIELD_WIDTH} label="start">
                <DateTimeInput
                  style={inputStyle(Boolean(error))}
                  value={draft.windows[key].start}
                  onChange={(value) => setWindow(key, "start", value)}
                  label={`${label} start`}
                />
              </Field>
              <Field minWidth={INSTANT_FIELD_WIDTH} label="end exclusive">
                <DateTimeInput
                  style={inputStyle(Boolean(error))}
                  value={draft.windows[key].endExclusive}
                  onChange={(value) => setWindow(key, "endExclusive", value)}
                  label={`${label} end exclusive`}
                />
              </Field>
              <PrefillLine draft={draft} field={outerField(key, "start")} label={`${label} start`} />
              <PrefillLine draft={draft} field={outerField(key, "endExclusive")} label={`${label} end`} />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2.5" data-advanced-window>
          <Field minWidth={INSTANT_FIELD_WIDTH} label="Analysis start" hint={prefillHint(draft, "walkForward.start")}>
            <DateTimeInput
              style={inputStyle()}
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
            <DateTimeInput
              style={inputStyle()}
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
          <Field minWidth={INSTANT_FIELD_WIDTH} label="First OOS instant">
            <DateTimeInput
              style={inputStyle()}
              value={draft.walkForward.splitMode}
              onChange={(value) => patch({ walkForward: { ...draft.walkForward, splitMode: value } })}
              label="First OOS instant"
              dataSplitMode
            />
          </Field>
          <PublishedSelect
            label="Frequency"
            value={draft.walkForward.frequency}
            options={options?.frequency ?? null}
            fallback={options?.frequency_default ?? ""}
            minWidth={120}
            onChange={(frequency) => patch({ walkForward: { ...draft.walkForward, frequency } })}
          />
          <PublishedSelect
            label="Window mode"
            value={draft.walkForward.windowMode}
            options={options?.window_mode ?? null}
            fallback={options?.window_mode_default ?? ""}
            minWidth={120}
            onChange={(windowMode) => patch({ walkForward: { ...draft.walkForward, windowMode } })}
          />
          {draft.walkForward.windowMode === "rolling" ? (
            <Field label="Train width" hint={options?.train_window?.rule ?? "Required for rolling, e.g. 180D or 72h."}>
              <input
                className={INPUT_CLASS}
                style={inputStyle(!/^[1-9][0-9]{0,4}(D|h)$/.test(draft.walkForward.trainWindow ?? ""))}
                value={draft.walkForward.trainWindow ?? ""}
                onChange={(e) => patch({ walkForward: { ...draft.walkForward, trainWindow: e.target.value.trim() || undefined } })}
                aria-label="Train width"
                placeholder="180D"
                data-train-window
              />
              <V2CreateNote where="train-window" admitted={createAdmitted} />
            </Field>
          ) : null}
          {options ? (
            <p className="w-full text-[10px] leading-[1.5]" style={{ color: "var(--ink-faint)" }} data-split-rule>
              {options.split_mode_rule}
            </p>
          ) : null}
          {options?.temporal_guards ? (
            <div className="flex w-full flex-wrap items-end gap-2.5" data-temporal-guards>
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
                    placeholder="0"
                  />
                </Field>
              ))}
              <p className="w-full text-[9.5px] leading-[1.5]" style={{ color: "var(--ink-faint)" }}>{options.temporal_guards.rule}</p>
              <V2CreateNote where="temporal-guards" admitted={createAdmitted} />
            </div>
          ) : null}
        </div>
      )}

      {/* Keep invalid schedules visible but disabled; the source explains why. */}
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
            disabled={modes.length === 0}
          >
            <option value="">{modes.length === 0 ? "Atlas not available" : "choose a mode"}</option>
            {modes.map((mode) => (
              <option key={mode.mode_id} value={mode.mode_id}>
                {mode.mode_id} — {mode.display_name}
              </option>
            ))}
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
            {scheduleOptions.map(({ schedule, valid }) => (
              <option key={schedule} value={schedule} disabled={!valid}>
                {schedule}{valid ? "" : " · not admitted"}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {draft.protocol === "advanced" && draft.optimizationMode === "mode_1_decay" && draft.optimizationSchedule === "per_fold_causal" ? (
        <div className="flex flex-wrap items-end gap-2.5 rounded-[6px] border px-3 py-2" style={{ borderColor: "var(--line-soft)" }} data-inner-folds>
          <span className="w-full mono text-[9.5px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
            inner folds — decay selection stays inside each outer IS
          </span>
          {(() => {
            const inner = draft.walkForward.inner ?? { splitFrequency: "", windowMode: "expanding", trainWindow: "", minFolds: "" };
            const set = (change: Partial<typeof inner>) => patch({ walkForward: { ...draft.walkForward, inner: { ...inner, ...change } } });
            return (
              <>
                <Field label="Inner frequency">
                  <select className={INPUT_CLASS} style={inputStyle()} value={inner.splitFrequency} onChange={(e) => set({ splitFrequency: e.target.value })} aria-label="Inner frequency">
                    <option value="">choose</option>
                    {(options?.inner_folds?.split_frequency ?? []).map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </Field>
                <Field label="Inner window mode">
                  <select className={INPUT_CLASS} style={inputStyle()} value={inner.windowMode} onChange={(e) => set({ windowMode: e.target.value })} aria-label="Inner window mode">
                    {(options?.inner_folds?.window_mode ?? ["expanding", "rolling"]).map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </Field>
                <Field label="Inner train width">
                  <input className={INPUT_CLASS} style={inputStyle()} value={inner.trainWindow} onChange={(e) => set({ trainWindow: e.target.value.trim() })} aria-label="Inner train width" placeholder="90D" />
                </Field>
                <Field label="Minimum inner folds" hint={options?.inner_folds ? `release default ${options.inner_folds.min_folds_release_default}` : undefined}>
                  <input className={INPUT_CLASS} style={inputStyle()} inputMode="numeric" value={inner.minFolds} onChange={(e) => set({ minFolds: e.target.value.trim() })} aria-label="Minimum inner folds" placeholder={String(options?.inner_folds?.min_folds_release_default ?? 2)} />
                </Field>
                {options?.inner_folds ? (
                  <p className="w-full text-[9.5px] leading-[1.5]" style={{ color: "var(--ink-faint)" }}>{options.inner_folds.rule}</p>
                ) : null}
                <V2CreateNote where="inner-folds" admitted={createAdmitted} />
              </>
            );
          })()}
        </div>
      ) : null}
      {scheduleOptions.filter((choice) => !choice.valid).map((choice) => {
        const reason = selectedMode?.invalid_schedules?.find((entry) => entry.schedule === choice.schedule)?.reason;
        return <p key={choice.schedule} data-invalid-schedule={choice.schedule} className="text-[10px]" style={{ color: "var(--ink-soft)" }}>
          {choice.schedule} · {reason ?? "Not admitted for this mode in the installed release manifest."}
        </p>;
      })}


      {error ? <ErrorBlock message={error} /> : null}
    </Card>
  );
}

function ParametersStep({
  draft,
  patch,
  error,
  ceiling = SWEEP_CEILING,
}: {
  draft: RunDraft;
  patch: (change: Partial<RunDraft>) => void;
  error: string | null;
  /** CG-P08-05: the release's published sweep ceiling; null when not published. */
  ceiling?: number | null;
}) {
  const swept = sweptCount(draft);

  function update(index: number, change: Partial<ParameterEntry>) {
    const next = draft.parameters.map((entry, i) => (i === index ? { ...entry, ...change } : entry));
    patch({ parameters: next });
  }

  return (
    <Card
      title="Parameters"
      meta={
        <span
          className="mono text-[9.5px]"
          data-sweep-count
          style={{ color: ceiling !== null && swept > ceiling ? "var(--bad)" : "var(--ink-faint)" }}
        >
          {swept} swept · {pinnedCount(draft)} pinned · {ceiling === null ? "sweep ceiling not published" : `sweep ceiling ${ceiling}`}
        </span>
      }
    >
      {draft.parameters.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--ink-soft)" }} data-no-parameters>
          The bound version declares no parameter space. The browser never adds one.
        </p>
      ) : (
        <div className="flex flex-col" data-parameter-table>
          {/* E4 (audit 02-14): the HiFi's header row. Without it the two
              free-text boxes on each row are unlabelled, and the declared
              step — which the registry publishes and the form dropped — had
              nowhere to go. */}
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
          {draft.parameters.map((entry, index) => {
            const status = parameterStatus(entry);
            const refused = status.tone === "refused";
            return (
              <div
                key={entry.name}
                data-parameter={entry.name}
                data-parameter-tone={status.tone}
                className="flex flex-wrap items-center gap-2 border-b py-1.5"
                style={{ borderColor: "var(--line-soft)" }}
              >
                <span className="mono w-[104px] flex-none text-[11px]">{entry.name}</span>
                <span className="mono w-[120px] flex-none text-[10px]" style={{ color: "var(--ink-faint)" }}>
                  {entry.levels
                    ? `[${entry.levels.join(", ")}]`
                    : `${entry.declaredLow} … ${entry.declaredHigh}`}
                </span>
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
                <input
                  className={`${INPUT_CLASS} w-[88px] flex-none`}
                  style={inputStyle(refused)}
                  value={entry.low}
                  onChange={(e) => update(index, { low: e.target.value })}
                  aria-label={`${entry.name} ${entry.dimension === "pin" ? "value" : "low"}`}
                />
                {entry.dimension === "sweep" ? (
                  <input
                    className={`${INPUT_CLASS} w-[88px] flex-none`}
                    style={inputStyle(refused)}
                    value={entry.high}
                    onChange={(e) => update(index, { high: e.target.value })}
                    aria-label={`${entry.name} high`}
                  />
                ) : (
                  <span className="mono w-[88px] flex-none text-[11px]" style={{ color: "var(--ink-faint)" }}>
                    —
                  </span>
                )}
                {/* The declaration's grid, read from the registry. A fixed or
                    categorical parameter declares none, and says so. */}
                <span
                  className="mono w-[72px] flex-none text-[10px]"
                  style={{ color: "var(--ink-faint)" }}
                  data-parameter-step={entry.name}
                >
                  {entry.declaredStep === null || entry.declaredStep === undefined ? (
                    <span className="italic">not declared</span>
                  ) : (
                    String(entry.declaredStep)
                  )}
                </span>
                <span
                  className="flex-1 text-[10px]"
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
      {error ? <ErrorBlock message={error} /> : null}
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
  return (
    <details className="rounded-[5px] border px-2.5 py-1.5" style={{ borderColor: "var(--line)" }} data-optimizer-defaults>
      <summary className="cursor-pointer text-[11px] font-semibold" style={{ color: "var(--ink-soft)" }}>
        Optimizer defaults · {release.optimizer_defaults.groups.reduce((count, group) => count + group.fields.length, 0)} fields · pinned by protocol
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
              <span
                className="mono flex-none rounded-[3px] border px-1 text-[8.5px] font-bold leading-[14px]"
                style={{
                  color: field.override_state === "LOCKED" ? "var(--bad)" : "var(--ink-soft)",
                  borderColor: field.override_state === "LOCKED" ? "var(--bad)" : "var(--line-strong)",
                }}
              >
                {field.value_source} · {field.override_state}
              </span>
              <span className="flex-1 text-[9.5px]" style={{ color: "var(--ink-soft)" }}>
                {field.detail}
              </span>
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

function OptimizationStep({
  draft,
  patch,
  limits,
  release,
  error,
}: {
  draft: RunDraft;
  patch: (change: Partial<RunDraft>) => void;
  limits: DraftConstraints;
  release: AtlasRelease | null;
  error: string | null;
}) {
  const overrides = Object.keys(draft.optimizationConfigOverrides);
  return (
    <Card title="Optimization">
      <div className="flex flex-wrap gap-2.5">
          <Field
          label="Optuna trials"
          hint={
            limits.trialCeiling === null
              ? "the release's ceiling could not be read"
              : `ceiling ${limits.trialCeiling}`
          }
        >
          <input
            className={INPUT_CLASS}
            style={inputStyle(Boolean(error))}
            value={draft.optunaTrials}
            onChange={(e) => patch({ optunaTrials: e.target.value })}
            aria-label="Optuna trials"
          />
        </Field>
        <Field label="Early stopping" hint="stagnation patience — actual trials may land lower">
          <input
            className={INPUT_CLASS}
            style={inputStyle()}
            value={draft.earlyStopping}
            onChange={(e) => patch({ earlyStopping: e.target.value })}
            aria-label="Early stopping"
          />
        </Field>
        <Field label={limits.seedRequired === true ? "Random seed *" : "Random seed"}>
          <input
            className={INPUT_CLASS}
            style={inputStyle(limits.seedRequired === true && draft.randomSeed.trim() === "")}
            value={draft.randomSeed}
            onChange={(e) => patch({ randomSeed: e.target.value })}
            aria-label="Random seed"
          />
        </Field>
      </div>

      {/* A copied run (or a typed value) can sit outside the submission profile
          the Atlas lists. It is kept as entered — never replaced — and said so;
          preflight and create decide, not this note. */}
      {release ? (
        <OutsideProfileNotes draft={draft} constraints={release.submission_constraints} />
      ) : null}

      <div
        className="flex flex-col gap-1 rounded-[6px] border px-3 py-2"
        style={{ borderColor: "var(--line-soft)", background: "var(--paper)" }}
        data-config-surface
      >
        <span className="mono text-[9.5px]" data-override-summary style={{ color: "var(--ink-faint)" }}>
          {overrides.length === 0
            ? draft.engineReleaseId
              ? `all defaults from ${draft.engineReleaseId} — nothing serialized`
              : "all release defaults — nothing serialized"
            : `${overrides.length} override(s) · rest = release defaults`}
        </span>
        {overrides.map((key) => (
          <span key={key} className="mono text-[10px]" data-override={key}>
            {key} = {String(draft.optimizationConfigOverrides[key])}
          </span>
        ))}
        <p className="text-[9.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-defaults-footer>
          <span title={DEFAULTS_FOOTER}>release-manifest defaults · untouched fields not serialized</span>
        </p>
      </div>

      {release ? (
        <>
          <SubmissionConstraints release={release} />
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
      text: `${window.start || NOT_DECLARED} → ${window.endExclusive || NOT_DECLARED}`,
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
  return [{ key: "span", label: "span", tone: ROLE_TONE.span, text: `${start || NOT_DECLARED} → ${endExclusive || NOT_DECLARED}`, segments }];
}

/** The fold count as a served fact: "≈ 14 outer folds · server plan", a served range, or a typed absence. */
function FoldPlanLine({ plan }: { plan: FoldPlan }) {
  const text =
    plan.kind === "server-plan"
      ? `≈ ${plan.count} outer folds`
      : plan.kind === "profile-bounds"
        ? `folds ${plan.min}–${plan.max}`
        : "outer folds — not published";
  const source =
    plan.kind === "server-plan"
      ? "server plan · preflight"
      : plan.kind === "profile-bounds"
        ? `server profile · ${plan.profileId}`
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

function WindowTimeline({
  draft,
  catalog = null,
  fold,
}: {
  draft: RunDraft;
  catalog?: DatasetCatalog | null;
  fold: FoldPlan;
}) {
  /* S02_DATA: the chosen symbol's served coverage on the same clock as the windows. */
  const coverage = coverageRange(planCoverage(catalog, draft.datasetId, draft.symbol));
  const axis = sharedAxis(draft, coverage);
  const warnings = coverageWarnings(draft, coverage);
  const rows = timelineRows(draft, axis);
  const coverageSpan = axis && coverage ? { left: ((coverage.from - axis.from) / (axis.to - axis.from)) * 100, width: Math.max(((coverage.to - coverage.from) / (axis.to - axis.from)) * 100, 0.5) } : null;
  /* D4: a date the reader is about to send that they did not type. */
  const carried = outerFields(draft.protocol).flatMap((field) => carriedCoverage(draft, field) ?? []);
  const source = carried[0] ?? null;
  return (
    <section className="rounded-[6px] border px-2.5 py-2" style={{ borderColor: "var(--line-soft)" }} data-window-timeline>
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
                data-timeline-segment="coverage"
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
            <span className="mono text-[9.5px]" style={{ color: row.tone }}>{row.label}</span>
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
                  data-timeline-segment={row.key}
                />
              ))}
            </span>
            <span />
            <span className="mono break-words text-[9px]" style={{ color: "var(--ink-faint)" }} data-timeline-text={row.key}>
              {row.text}
            </span>
          </div>
        ))}
        {draft.protocol === "advanced" ? (
          <p className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} data-advanced-timeline>
            {draft.walkForward.frequency || "frequency not declared"}
            {" · "}{draft.walkForward.windowMode || "window mode not declared"}
            {" · first OOS "}{draft.walkForward.splitMode || NOT_DECLARED}
          </p>
        ) : null}
      </div>
      <div className="mt-1 flex flex-col gap-0.5">
        <CoverageWarnings warnings={warnings} coverage={coverage} />
        <FoldPlanLine plan={fold} />
      </div>
      {source ? (
        <p className="mt-1 text-[9px]" style={{ color: "var(--ink-soft)" }} data-window-prefill-rail>
          Outer bounds prefilled from {source.symbol} coverage ({source.firstMonth} → {source.lastMonth}) until edited.
        </p>
      ) : null}
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
        ) : (
          <span className="mono ml-auto text-[9.5px] italic" style={{ color: "var(--ink-faint)" }} data-payload-digest="pending">
            payload sha256 · after preflight
          </span>
        )}
      </header>
      {scheduleFact && mode?.valid_schedules.includes(draft.optimizationSchedule) ? (
        <>
          <ForecastLine label="mode × schedule">{mode.mode_id} × {scheduleFact.schedule}</ForecastLine>
          <ForecastLine label="source">chosen in Walk-forward step</ForecastLine>
          <ForecastLine label="claim (forecast)">
            <span style={{ color: "var(--role-holdout)" }}>{claimToken(scheduleFact.chronological_validation_claim)}</span>
          </ForecastLine>
          {scheduleFact.oos_use_state ? (
            <span className="mono text-right text-[9.5px]" style={{ color: "var(--ink-soft)" }} data-forecast-oos={scheduleFact.oos_use_state}>
              {OOS_STATE_LABEL[scheduleFact.oos_use_state] ?? scheduleFact.oos_use_state}
            </span>
          ) : null}
          {/* CG-P04-05 / S02-01: the cap is an Atlas fact. The sentence below
              is the server's own reason for it, not a line written here. */}
          <p className="flex flex-col gap-0.5 text-[9.5px] leading-[1.45]" style={{ color: "var(--ink-soft)" }} data-cert-cap={scheduleFact.cert_cap?.state ?? "NOT_SERVED"}>
            <span className="flex items-baseline justify-between gap-2.5">
              <span className="text-[10.5px]" style={{ color: "var(--ink-faint)" }}>cert ceiling</span>
              <span className="mono text-[10px] font-bold uppercase tracking-[.06em]" data-cert-ceiling-absent>not published</span>
            </span>
            {scheduleFact.cert_cap?.reason ? <span data-cert-cap-reason>{scheduleFact.cert_cap.reason}</span> : null}
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

/** Typed absence in a review row: italic, never a digit. */
function NotDeclared({ children }: { children: React.ReactNode }) {
  return <span className="italic" style={{ color: "var(--ink-faint)" }} data-not-declared>{children}</span>;
}

/** The draft as one line per declaration — the same serializer facts the submit sends (HiFi `reviewRows`). */
function ReviewRows({
  draft,
  sweepCeiling,
  usesV2,
  registry,
  labelWidth,
  withWindows = false,
  versionDeclared = false,
}: {
  draft: RunDraft;
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
  const day = (value: string) => (value === "" ? NOT_DECLARED : value.slice(0, 10));
  /* Scratch is its own declaration; a bound run has nothing to show until a version is chosen. */
  const chosen = !draft.bound || draft.alphaVersionId !== "";
  const versionRead = chosen && versionDeclared;
  return (
    <div className="flex flex-col" data-review-rows>
      <Row label="alpha binding" labelWidth={labelWidth}>
        <span title={bindingChip(draft, registry).title}>{bindingChip(draft, registry).text}</span>
      </Row>
      <Row label="execution route" labelWidth={labelWidth}>{draft.executionRoute}</Row>
      <Row label="strategy_id" labelWidth={labelWidth}>
        {effectiveStrategyId(draft) ? (
          <>
            {effectiveStrategyId(draft)}
            {draft.bound ? " (pinned by alpha_id)" : ""}
          </>
        ) : (
          <span className="italic" style={{ color: "var(--ink-faint)" }}>not declared</span>
        )}
      </Row>
      <Row label="dataset · symbol · tf" labelWidth={labelWidth}>
        {/* §3.3: an absent value is never a dash. */}
        {draft.datasetId || <span className="italic" style={{ color: "var(--ink-faint)" }}>not declared</span>}
        {" · "}
        {draft.symbol || <span className="italic" style={{ color: "var(--ink-faint)" }}>not declared</span>}
        {" · "}
        {draft.timeframe}
      </Row>
      <Row label="protocol" labelWidth={labelWidth}>{draft.protocol}</Row>
      {withWindows ? (
        <Row label="windows" labelWidth={labelWidth}>
          {draft.protocol === "three_window_decay"
            ? `IS ${day(draft.windows.is.start)} → OOS ${day(draft.windows.oos.start)} → holdout ${day(draft.windows.holdout.start)}`
            : `walk-forward · ${draft.walkForward.frequency || "frequency not declared"} · ${draft.walkForward.windowMode || "window mode not declared"}`}
        </Row>
      ) : null}
      <Row label="parameter_space" labelWidth={labelWidth}>
        {/* A real 0 is a version that published an empty space; before a version
            is chosen there is nothing to count. */}
        {draft.parameters.length === 0 && !versionRead ? (
          <NotDeclared>{chosen ? "not declared" : "no version chosen"}</NotDeclared>
        ) : (
          <>
            {draft.parameters.length} entries · {sweptCount(draft)} swept · {pinnedCount(draft)} pinned
            {sweepCeiling === null ? " (sweep ceiling not published)" : ` (sweep ceiling ${sweepCeiling})`}
          </>
        )}
      </Row>
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
      <Row label="mode × schedule" labelWidth={labelWidth}>
        {/* Two empty fields rendered as a bare `×` printed a separator where
            a value belongs; an undeclared field says so. */}
        {draft.optimizationMode || draft.optimizationSchedule ? (
          `${draft.optimizationMode || "not declared"} × ${draft.optimizationSchedule || "not declared"}`
        ) : (
          <span className="italic" style={{ color: "var(--ink-faint)" }}>
            not declared
          </span>
        )}
      </Row>
      <Row label="trials · stop · seed" labelWidth={labelWidth}>
        {/* Each part is its own value: one the step has not supplied says so,
            and nothing is shown before a version is chosen. */}
        {[
          chosen ? draft.optunaTrials : "",
          chosen ? draft.earlyStopping : "",
          chosen ? draft.randomSeed : "",
        ].map((value, index) => (
          <span key={index}>
            {index > 0 ? " · " : ""}
            {value !== "" ? value : <NotDeclared>not declared</NotDeclared>}
          </span>
        ))}
      </Row>
      <Row label="optimization_config" labelWidth={labelWidth}>
        {overrides.length === 0
          ? "release defaults — nothing serialized"
          : `${overrides.length} overrides (${overrides.join(", ")}) — rest engine defaults`}
      </Row>
    </div>
  );
}

function BlockingList({ blocking }: { blocking: readonly { step: StepId; message: string }[] }) {
  if (blocking.length === 0) return null;
  return (
    <div
      role="alert"
      data-blocking
      className="flex flex-col gap-1 rounded-[6px] border px-2.5 py-2"
      style={{ borderColor: "var(--bad)", background: "var(--bad-bg-soft)" }}
    >
      {blocking.map((problem) => (
        <span key={problem.step} className="text-[10.5px]" style={{ color: "var(--bad)" }}>
          {problem.message}
        </span>
      ))}
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
  catalog = null,
  portalAdmission = null,
  versionDeclared = false,
}: {
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
      aria-label="Review"
    >
      <h3 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        review
      </h3>
      <WindowTimeline
        draft={draft}
        catalog={catalog}
        fold={foldPlan(draft, preflight?.resource_estimate?.outer_fold_count ?? null, portalAdmission)}
      />
      <ClaimForecast draft={draft} atlas={atlas} preflight={preflight} />
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

  preflight: PreflightResponse | null;
  preflightState: ResearchState;
  clearedBecause?: string | null;
  onRunPreflight: () => void;
  /** CG-P08-03: the typed refusal of the last preflight, with its field path. */
  preflightRefusal?: PreflightRefusal | null;
  /** CG-P08-04: research dataset catalog for the data step. */
  catalog?: DatasetCatalog | null;
  catalogReason?: string | null;
  /** The Atlas response's admitted profiles (`portal_admission.profiles`), for the served fold bounds. */
  portalAdmission?: ProfileFoldBounds | null;
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
    preflightRefusal = null,
    catalog = null,
    catalogReason = null,
    portalAdmission = null,
    cloneSource = null,
    forkSource = null,
  } = props;
  const sweepCeiling = limits.sweepCeiling === undefined ? SWEEP_CEILING : limits.sweepCeiling;
  const v2 = usesSpecV2(draft);
  const refusalStep = preflightRefusal?.fieldPath ? stepForFieldPath(preflightRefusal.fieldPath) : null;
  /* FG-08 (FE-A1-03): a refused preflight's panels state the client sentence,
     not the server's message that the hook carries as the panel reason. */
  const previewState: ResearchState = preflightRefusal
    ? { ...preflightState, reason: preflightRefusal.copy, detail: null }
    : preflightState;

  const [step, setStep] = useState<StepId>(initialStep);
  const [visited, setVisited] = useState<ReadonlySet<StepId>>(() => new Set(initialStep === "context" ? [] : [initialStep]));
  useEffect(() => {
    setStep(initialStep);
  }, [initialStep]);
  /* E4 (audit 02-8): reaching a step counts as visiting it, however the
     reader got there — a pill, a refusal jump, or `?step=`. Before this, only
     a pill click counted, so the wizard's own error marks lagged behind the
     step on screen. */
  useEffect(() => {
    setVisited((previous) => (previous.has(step) ? previous : new Set([...previous, step])));
  }, [step]);
  /* HiFi 02-18: the step is part of the address, so a reload or a shared link lands where the reader was. */
  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);
  const blocking = useMemo(() => blockingProblems(draft, limits), [draft, limits]);
  const errorByStep = useMemo(
    () => new Map(blocking.map((problem) => [problem.step, problem.message])),
    [blocking],
  );
  const errorSteps = useMemo(() => {
    const steps = new Set([...errorByStep.keys()].filter((key) => visited.has(key)));
    /* CG-P08-03: a server refusal marks the step that owns its field path. */
    if (refusalStep && refusalStep !== "review") steps.add(refusalStep);
    return steps;
  }, [errorByStep, visited, refusalStep]);
  const missing = useMemo(() => missingConstraints(limits), [limits]);
  /*
   * E4 (audit 02-8): a form that opens on a red box has told the reader they
   * are wrong before they have typed anything. The HiFi shows no error until
   * the reader reaches a step. The rail therefore lists the problems of steps
   * they have been to; Review lists all of them, because Review is where the
   * decision to run is made and every problem blocks it. `blocking` itself is
   * unchanged, so the preflight button's own guard still sees everything.
   */
  const visibleBlocking = useMemo(
    () => (step === "review" ? blocking : blocking.filter((problem) => visited.has(problem.step))),
    [blocking, visited, step],
  );
  const chip = bindingChip(draft, registry);

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
              <span className="mono text-[9px] font-bold uppercase tracking-[.07em]" style={{ color: "var(--accent)" }}>copied from</span>
              <Link className="mono" data-link="clone-source" title="Open the source run" to={`/research/quantbt/runs/${encodeURIComponent(cloneSource.runId)}/progress`}><RunRef runId={cloneSource.runId} /></Link>
              <span style={{ color: "var(--ink-soft)" }} title="A new run with a NEW intent: change anything, then run a fresh preflight. The original run is untouched.">
                new intent · fresh preflight
              </span>
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
        onPick={(next) => {
          setVisited((previous) => new Set([...previous, step, next]));
          setStep(next);
        }}
        errors={errorSteps}
        visited={visited}
        contextChosen={!draft.bound || draft.alphaVersionId !== ""}
        reviewCaption={preflightRefusal ? "preflight refused" : preflight ? "preflight issued" : "preflight pending"}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {step === "context" ? (
            <>
              <ContextStep draft={draft} patch={patch} limits={limits} registry={registry} />
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
              ) : (
                <p className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-declaration-bound={String(declarationBound ?? false)}>
                  declaration read for {draft.alphaVersionId}
                </p>
              )}
            </>
          ) : null}
          {step === "strategy" ? (
            <StrategyStep draft={draft} patch={patch} limits={limits} error={errorByStep.get("strategy") ?? null} />
          ) : null}
          {step === "route" ? (
            <RouteStep
              draft={draft}
              patch={patch}
              atlas={atlas}
              atlasState={atlasState}
              limits={limits}
              error={errorByStep.get("route") ?? null}
            />
          ) : null}
          {step === "data" ? (
            <DataStep draft={draft} patch={patch} limits={limits} error={errorByStep.get("data") ?? null} catalog={catalog} catalogReason={catalogReason} registry={registry} />
          ) : null}
          {step === "windows" ? (
            <WindowsStep draft={draft} patch={patch} atlas={atlas} error={errorByStep.get("windows") ?? null} catalog={catalog} warmupBars={limits.warmupBars} createAdmitted={preflight?.run_admission?.may_create_run === true} />
          ) : null}
          {step === "parameters" ? (
            <ParametersStep draft={draft} patch={patch} error={errorByStep.get("parameters") ?? null} ceiling={sweepCeiling} />
          ) : null}
          {step === "optimization" ? (
            <OptimizationStep
              draft={draft}
              patch={patch}
              limits={limits}
              release={atlas?.current_release ?? null}
              error={errorByStep.get("optimization") ?? null}
            />
          ) : null}

          {step === "review" ? (
            <div className="flex flex-col gap-2.5" data-review-step>
              {/* HiFi 02-16 (M): the summary table is the main panel's first
                  block, the same rows the submit serializes; the rail keeps the
                  timeline and the forecast. */}
              <Card title="Review &amp; run">
                <ReviewRows draft={draft} sweepCeiling={sweepCeiling} usesV2={v2} registry={registry} labelWidth={150} withWindows versionDeclared={declarationBound ?? false} />
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
                  onClick={onRunPreflight}
                  disabled={blocking.length > 0}
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
                    }}
                  title={blocking.length > 0 ? blocking[0].message : undefined}
                >
                  Run preflight
                </button>
                {blocking.length > 0 ? (
                  <span className="text-[10.5px]" style={{ color: "var(--ink-faint)" }} data-disabled-reason="preflight">
                    {blocking[0].message}
                  </span>
                ) : null}
              </div>

              {/* FG-08 (FE-A1-03/-04): every refusal shows here, with or
                  without a field path. The sentence is client copy keyed by
                  the typed code; the server's own message is never printed. */}
              {preflightRefusal ? (
                <div
                  role="alert"
                  className="flex flex-wrap items-baseline gap-2 rounded-[6px] border px-2.5 py-1.5 text-[11px]"
                  style={{ borderColor: "var(--bad)", background: "var(--bad-bg-soft)", color: "var(--bad)" }}
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
              {preflight === null ? (
                <details data-preflight-preview open={preflightRefusal ? true : undefined}>
                  <summary
                    className="mono cursor-pointer text-[10.5px]"
                    style={{ color: "var(--ink-soft)" }}
                    data-preflight-preview-summary
                  >
                    {preflightRefusal ? "preflight checks · 6 panels · refused" : "preflight checks · 6 panels · not read"}
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
                  disabled={!canSubmit}
                  style={!canSubmit ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
                  title={!canSubmit ? "Run preflight first." : undefined}
                >
                  Create run
                </button>
                {!canSubmit ? (
                  <span className="text-[10.5px]" style={{ color: "var(--ink-faint)" }} data-disabled-reason="create-run">
                    Run preflight first.
                  </span>
                ) : !mayCreateRun ? (
                  <span className="text-[10.5px]" style={{ color: "var(--role-holdout)" }} data-admission-note>
                    {preflight?.run_admission?.message ? (
                      <>
                        <span className="mono text-[9.5px] font-bold">{preflight.run_admission.code}</span>{" "}
                        {preflight.run_admission.message} Submitting is still allowed — admission is decided
                        again when the request arrives.
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
              {created || createState.state !== "empty" ? (
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
        </div>

        <ReviewRail draft={draft} blocking={visibleBlocking} atlas={atlas} sweepCeiling={sweepCeiling} usesV2={v2} registry={registry} preflight={preflight} showRows={step !== "review"} catalog={catalog} portalAdmission={portalAdmission} versionDeclared={declarationBound ?? false} />
      </div>
    </div>
  );
}
