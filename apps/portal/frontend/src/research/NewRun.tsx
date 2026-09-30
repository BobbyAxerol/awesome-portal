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
import { useEffect, useMemo, useState } from "react";

import {
  ALPHA_VERSION_PUBLICATION_WORDS,
  approvalStatusWords,
  useAlphaVersionPublications,
  type AlphaVersionPublicationView,
} from "./alphaVersionPublication";
import { scheduleChoices } from "./atlas";
import type { AtlasDocument } from "./atlas";
import { type CatalogDataset, type DatasetCatalog, coverageLabel, splitCatalogReason } from "./datasetClient";
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
import { claimToken, shortId } from "./researchFormat";

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

export const DATA_REQUIREMENTS_NOTE =
  "Timeframe and seed are checked in this form. Required columns and warmup are checked by the server at preflight — the Review step names whichever gate failed.";

export const DEFAULTS_FOOTER =
  "Defaults come from the release manifest — an untouched field is NOT serialized. Missing objective metrics raise MissingOptimizationMetricError, there is no silent fallback.";

/** Spec 02 §10 — shown while the run's existence is unknown. */
export const UNKNOWN_OUTCOME_NOTE =
  "The server did not say whether this run was created. Check again with the same request — a second submit could create a second run.";

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

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
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
        <h3 className="text-[12px] font-semibold uppercase tracking-[.05em]">{title}</h3>
        {meta}
      </header>
      {children}
    </section>
  );
}

/* --------------------------------------------------------------- wizard bar */

function WizardBar({
  current,
  onPick,
  errors,
}: {
  current: StepId;
  onPick: (step: StepId) => void;
  errors: ReadonlySet<StepId>;
}) {
  return (
    /* Wraps rather than scrolls.
     *
     * With the Portal sidebar taking 248px of 1280, eight pills overflowed and
     * the first two steps sat off-screen behind a horizontal scrollbar — a
     * wizard whose first step is invisible reads as a wizard that starts at
     * step three. */
    <div
      className="flex flex-wrap gap-1 rounded-[6px] border p-[5px]"
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
      role="tablist"
      aria-label="New run steps"
    >
      {STEPS.map((step, index) => {
        const isCurrent = step.id === current;
        const hasError = errors.has(step.id);
        const tone = hasError ? "var(--bad)" : isCurrent ? "var(--accent)" : "var(--good)";
        return (
          <button
            key={step.id}
            type="button"
            role="tab"
            aria-selected={isCurrent}
            aria-current={isCurrent ? "step" : undefined}
            data-step-pill={step.id}
            data-step-state={hasError ? "error" : isCurrent ? "current" : "valid"}
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
            className="flex flex-none items-center gap-2 rounded-[6px] px-3 py-1.5"
            style={{ background: isCurrent ? "var(--accent-soft)" : "transparent" }}
          >
            <span
              className="mono inline-flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] text-[10px] font-bold"
              style={{ color: tone, borderColor: tone }}
            >
              {hasError ? "!" : isCurrent ? index + 1 : "✓"}
            </span>
            <span className="flex flex-col items-start">
              <span className="text-[11px] font-medium">{step.label}</span>
              <span
                className="text-[9px]"
                style={{ color: hasError ? "var(--bad)" : "var(--ink-faint)" }}
              >
                {hasError ? "needs attention" : step.sub}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------- steps */

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

      {draft.bound ? (
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
              ) : (
                <span className="mono text-[10.5px]">{value}</span>
              )}
            </span>
          ))}
          {lookedUp !== null ? <LastPublishedRc view={publications.get(lookedUp) ?? { state: "loading" }} /> : null}
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
          <span className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
            {SCRATCH_BANNER}
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
 * one), the server's `candidate_relation` and the publish time as an exact ISO
 * string. Absence is typed with the server's reason code. A refusal shows the
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
        {found.published !== null ? `published ${new Date(found.published.at_utc_ms).toISOString()}` : "publish time not published"}
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
  limits,
  error,
}: {
  draft: RunDraft;
  patch: (change: Partial<RunDraft>) => void;
  atlas: AtlasDocument | null;
  limits: DraftConstraints;
  error: string | null;
}) {
  return (
    <Card
      title="Route"
      meta={
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
          {atlas ? `${atlas.routes.length} routes from the installed release` : null}
        </span>
      }
    >
      {atlas === null ? (
        <p className="text-[11px]" style={{ color: "var(--ink-soft)" }} data-no-atlas>
          The route grid is read from the Engine Atlas. It is not available, so no route can be
          offered — the form does not carry a local copy of the release's routes.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2" data-route-grid>
          {atlas.routes.map((route) => {
            const blocked = limits.blockedRoutes[route.route_id];
            const selected = draft.executionRoute === route.route_id;
            return (
              <button
                key={route.route_id}
                type="button"
                data-route-card={route.route_id}
                data-route-blocked={blocked ? "true" : undefined}
                data-selected={selected}
                /* Shown with its reason rather than hidden (§13-3). */
                title={blocked ?? undefined}
                onClick={() => {
                  if (!blocked) patch({ executionRoute: route.route_id as RunDraft["executionRoute"] });
                }}
                disabled={Boolean(blocked)}
                className="flex w-[calc(25%-6px)] min-w-[190px] flex-col gap-[3px] rounded-[6px] border px-2.5 py-2 text-left"
                style={{
                  borderColor: selected ? "var(--accent)" : blocked ? "var(--line-strong)" : "var(--line)",
                  borderStyle: blocked ? "dashed" : "solid",
                  background: selected ? "var(--accent-soft)" : "var(--paper-raised)",
                  opacity: blocked ? 0.6 : 1,
                  cursor: blocked ? "not-allowed" : "pointer",
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
                {blocked ? (
                  <span className="text-[9.5px] leading-[1.45]" style={{ color: "var(--bad)" }}>
                    {blocked}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
      {atlas ? <RoutePanel route={atlas.routes.find((route) => route.route_id === draft.executionRoute) ?? null} /> : null}
      {error ? <ErrorBlock message={error} /> : null}
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

function DataStep({
  draft,
  patch,
  limits,
  error,
  catalog = null,
  catalogReason = null,
}: {
  draft: RunDraft;
  patch: (change: Partial<RunDraft>) => void;
  limits: DraftConstraints;
  error: string | null;
  /** CG-P08-04: the research dataset catalog, or null when it was not read. */
  catalog?: DatasetCatalog | null;
  catalogReason?: string | null;
}) {
  const dataset: CatalogDataset | null = catalog?.datasets.find((item) => item.dataset_id === draft.datasetId) ?? null;
  /* FG-08 (FE-A1-01): client sentence, then the typed facts in mono. */
  const catalogNote = catalogReason ? splitCatalogReason(catalogReason) : null;
  const symbols = dataset?.symbols.state === "PUBLISHED" ? dataset.symbols.items : [];
  const selectedSymbol = symbols.find((item) => item.symbol === draft.symbol.trim().toUpperCase()) ?? null;
  /* D4: picking a dataset or symbol is what prefills the outer window bounds
     (and re-picking replaces them). It is done here, in the reader's own
     handler, and never in an effect — so a catalog that arrives late, a
     re-render or a copied run cannot overwrite anything. */
  const pickDataset = (datasetId: string) =>
    patch({ datasetId, ...applyCoveragePrefill(draft, planCoverage(catalog, datasetId, draft.symbol)) });
  const pickSymbol = (symbol: string) =>
    patch({ symbol, ...applyCoveragePrefill(draft, planCoverage(catalog, draft.datasetId, symbol)) });
  const prefillPlan = planCoverage(catalog, draft.datasetId, draft.symbol);
  const prefilledNow = outerFields(draft.protocol).some((field) => carriedCoverage(draft, field) !== null);
  const publishedTimeframes = limits.declaredTimeframes ?? [];
  const timeframeOptions = publishedTimeframes.length > 0
    ? publishedTimeframes
    : draft.timeframe ? [draft.timeframe] : [];
  const timeframeDeclared = publishedTimeframes.includes(draft.timeframe);
  return (
    <Card title="Data">
      <p className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-data-note>
        {DATA_REQUIREMENTS_NOTE}
      </p>
      <div className="flex flex-wrap gap-2.5">
        <Field label="Dataset" hint="Historical source — backtest only. Realtime and paper are separate services.">
          {catalog ? (
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
                <option key={item.dataset_id} value={item.dataset_id} disabled={item.availability !== "available"}>
                  {item.dataset_id} · {item.availability}
                </option>
              ))}
            </select>
          ) : (
            <input
              className={INPUT_CLASS}
              style={inputStyle()}
              value={draft.datasetId}
              onChange={(e) => pickDataset(e.target.value)}
              aria-label="Dataset"
            />
          )}
          {dataset && dataset.availability !== "available" ? (
            <span className="text-[10px]" style={{ color: "var(--bad)" }}>{dataset.unavailable_reason ?? "This dataset is unavailable."}</span>
          ) : null}
          {!catalog && catalogNote ? (
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
        </Field>
        <Field label="Symbol *">
          <input
            className={INPUT_CLASS}
            style={inputStyle(draft.symbol.trim().length === 0)}
            value={draft.symbol}
            onChange={(e) => pickSymbol(e.target.value.toUpperCase())}
            aria-label="Symbol"
            list={symbols.length > 0 ? "research-dataset-symbols" : undefined}
          />
          {symbols.length > 0 ? (
            <datalist id="research-dataset-symbols" data-symbol-list>
              {symbols.map((item) => (
                <option key={item.symbol} value={item.symbol}>
                  {item.contract_kind ?? ""} {coverageLabel(item) ?? ""}
                </option>
              ))}
            </datalist>
          ) : null}
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
        </Field>
        <Field label="Timeframe *">
          <select
            className={INPUT_CLASS}
            style={inputStyle(publishedTimeframes.length > 0 && !timeframeDeclared)}
            value={draft.timeframe}
            onChange={(e) => patch({ timeframe: e.target.value })}
            aria-label="Timeframe"
            disabled={publishedTimeframes.length === 0}
            title={publishedTimeframes.length === 0 ? "The bound version has not published its timeframes." : undefined}
          >
            {timeframeOptions.map((tf) => (
              <option key={tf} value={tf}>
                {tf}
              </option>
            ))}
          </select>
          {publishedTimeframes.length === 0 ? (
            <span className="text-[10px]" style={{ color: "var(--ink-faint)" }}>
              Version timeframes not published; preflight remains authoritative.
            </span>
          ) : !timeframeDeclared ? (
            <span className="text-[10px]" style={{ color: "var(--bad)" }}>
              The bound version does not declare {draft.timeframe}. Select one of its published timeframes.
            </span>
          ) : null}
        </Field>
      </div>
      {/* D4: what the pick did to the walk-forward dates — filled, kept, or
          why nothing was. Silent until a dataset is chosen. */}
      {draft.datasetId !== "" ? (
        <p className="text-[9.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-window-prefill-status data-prefill-state={prefillPlan.state}>
          {prefillPlan.state !== "ready"
            ? prefillPlan.reason
            : prefilledNow
              ? "Outer walk-forward bounds prefilled from this coverage — edit them in the Walk-forward step."
              : "Coverage is published; the outer walk-forward bounds already hold your own values, so nothing was prefilled."}
        </p>
      ) : null}
      {/* E4 (audit 02-12): the HiFi's declaration box. The registry already
          publishes all four facts and the form ignored them, so the reader
          could not see what the run needs until preflight refused. Shown, not
          checked: the server is still the authority at preflight. */}
      <div
        className="flex flex-wrap gap-x-5 gap-y-1 rounded-[6px] border px-3 py-2"
        style={{ borderColor: "var(--line-soft)", background: "var(--paper-raised)" }}
        data-declaration-box
      >
        <Label>version declaration</Label>
        {([
          ["required columns", limits.requiredColumns?.join(" · ") ?? null],
          ["warmup bars", limits.warmupBars === null ? null : String(limits.warmupBars)],
          ["declared timeframes", limits.declaredTimeframes?.join(" · ") || null],
          ["seed", limits.seedRequired === null ? null : limits.seedRequired ? "required" : "not required"],
        ] as const).map(([label, value]) => (
          <span key={label} className="flex items-baseline gap-1.5" data-declaration-fact={label}>
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
      {dataset ? (
        <p className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-dataset-facts>
          {dataset.venue} · {dataset.source_timezone} · {dataset.calendar_policy} · timeframes {dataset.timeframes.join(" · ")}
        </p>
      ) : null}
      {catalog ? (
        <p className="text-[9.5px] leading-[1.5]" style={{ color: "var(--ink-faint)" }}>{catalog.coverage_rule}</p>
      ) : null}
      {error ? <ErrorBlock message={error} /> : null}
    </Card>
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
}: {
  label: string;
  value: string;
  options: readonly { value: string; admission: string; reason?: string | null }[] | null;
  fallback: string;
  onChange: (value: string) => void;
}) {
  if (options === null) {
    return (
      <Field label={label}>
        <span className="mono text-[10px]" style={{ color: "var(--ink-faint)" }} data-options-unpublished={label}>
          not published by this release
        </span>
      </Field>
    );
  }
  const refused = options.filter((option) => option.admission !== "ADMITTED");
  return (
    <Field label={label}>
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
}: {
  draft: RunDraft;
  patch: (change: Partial<RunDraft>) => void;
  atlas: AtlasDocument | null;
  error: string | null;
  /** D4: the catalog the outer bounds were prefilled from. */
  catalog?: DatasetCatalog | null;
  /** D4: the warmup the bound version declares, or null when it was not read. */
  warmupBars?: number | null;
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
              <Field label="start">
                <input
                  type="datetime-local"
                  className={INPUT_CLASS}
                  style={inputStyle(Boolean(error))}
                  value={draft.windows[key].start}
                  onChange={(e) => setWindow(key, "start", e.target.value)}
                  aria-label={`${label} start`}
                />
              </Field>
              <Field label="end exclusive">
                <input
                  type="datetime-local"
                  className={INPUT_CLASS}
                  style={inputStyle(Boolean(error))}
                  value={draft.windows[key].endExclusive}
                  onChange={(e) => setWindow(key, "endExclusive", e.target.value)}
                  aria-label={`${label} end exclusive`}
                />
              </Field>
              <PrefillLine draft={draft} field={outerField(key, "start")} label={`${label} start`} />
              <PrefillLine draft={draft} field={outerField(key, "endExclusive")} label={`${label} end`} />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2.5" data-advanced-window>
          <Field label="Analysis start" hint={prefillHint(draft, "walkForward.start")}>
            <input
              type="datetime-local"
              className={INPUT_CLASS}
              style={inputStyle()}
              value={draft.walkForward.start}
              onChange={(e) =>
                patch({
                  walkForward: { ...draft.walkForward, start: e.target.value },
                  ...touchPatch(draft, "walkForward.start"),
                })
              }
              aria-label="Analysis start"
            />
          </Field>
          <Field label="End exclusive" hint={prefillHint(draft, "walkForward.endExclusive")}>
            <input
              type="datetime-local"
              className={INPUT_CLASS}
              style={inputStyle()}
              value={draft.walkForward.endExclusive}
              onChange={(e) =>
                patch({
                  walkForward: { ...draft.walkForward, endExclusive: e.target.value },
                  ...touchPatch(draft, "walkForward.endExclusive"),
                })
              }
              aria-label="Analysis end exclusive"
            />
          </Field>
          <Field label="First OOS instant">
            <input
              type="datetime-local"
              className={INPUT_CLASS}
              style={inputStyle()}
              value={draft.walkForward.splitMode}
              onChange={(e) => patch({ walkForward: { ...draft.walkForward, splitMode: e.target.value } })}
              aria-label="First OOS instant"
              data-split-mode
            />
          </Field>
          <PublishedSelect
            label="Frequency"
            value={draft.walkForward.frequency}
            options={options?.frequency ?? null}
            fallback={options?.frequency_default ?? ""}
            onChange={(frequency) => patch({ walkForward: { ...draft.walkForward, frequency } })}
          />
          <PublishedSelect
            label="Window mode"
            value={draft.walkForward.windowMode}
            options={options?.window_mode ?? null}
            fallback={options?.window_mode_default ?? ""}
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
            </div>
          ) : null}
        </div>
      )}

      {/* The authoritative fold plan is the server's; anything drawn here
          would be a second number for the same fact. */}
      <p className="text-[10px] leading-[1.5]" style={{ color: "var(--ink-faint)" }} data-fold-note>
        The server derives the authoritative fold plan at preflight — the Review step shows it.
      </p>

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
          {DEFAULTS_FOOTER}
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b py-[3px] last:border-b-0"
      style={{ borderColor: "var(--line-soft)" }}
      data-review-row={label}
    >
      <span
        className="mono flex-none text-[9px] uppercase tracking-[.06em]"
        style={{ width: 132, color: "var(--ink-faint)" }}
      >
        {label}
      </span>
      <span className="mono flex-1 break-words text-[10.5px]">{children}</span>
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
}: {
  draft: RunDraft;
  blocking: readonly { step: StepId; message: string }[];
  atlas: AtlasDocument | null;
  sweepCeiling: number | null;
  usesV2: boolean;
  /** E4: the rail prints the registry's short `version_label`, as the header does. */
  registry: readonly RegistryEntry[];
}) {
  const overrides = Object.keys(draft.optimizationConfigOverrides);
  const mode = atlas?.modes.find((item) => item.mode_id === draft.optimizationMode);
  const scheduleFact = mode?.facts?.schedules.find((item) => item.schedule === draft.optimizationSchedule);
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
      <section className="rounded-[6px] border px-2.5 py-2" style={{ borderColor: "var(--line-soft)" }} data-window-timeline>
        <h4 className="text-[10px] font-semibold uppercase tracking-[.05em]">Window timeline</h4>
        {draft.protocol === "three_window_decay" ? (
          <div className="mt-1 flex flex-col gap-1">
            {(["is", "oos", "holdout"] as const).map((key) => (
              <div key={key} className="grid grid-cols-[42px_1fr] gap-1 text-[10px]">
                <span className="mono uppercase" style={{ color: "var(--ink-faint)" }}>{key}</span>
                <span className="mono break-words">{draft.windows[key].start || "not declared"} → {draft.windows[key].endExclusive || "not declared"}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mono mt-1 text-[10px]" data-advanced-timeline>
            {draft.walkForward.start || "not declared"} → {draft.walkForward.endExclusive || "not declared"}
            {" · "}{draft.walkForward.frequency || "frequency not declared"}
            {" · "}{draft.walkForward.windowMode || "window mode not declared"}
          </p>
        )}
        {(() => {
          /* D4: a date the reader is about to send that they did not type. */
          const carried = outerFields(draft.protocol).flatMap((field) => carriedCoverage(draft, field) ?? []);
          const source = carried[0] ?? null;
          return source ? (
            <p className="mt-1 text-[9px]" style={{ color: "var(--ink-soft)" }} data-window-prefill-rail>
              Outer bounds prefilled from {source.symbol} coverage ({source.firstMonth} → {source.lastMonth}) until edited.
            </p>
          ) : null;
        })()}
        <p className="mt-1 text-[9px]" style={{ color: "var(--ink-faint)" }}>
          Declaration only · fold boundaries are decided by preflight.
        </p>
      </section>
      <section className="rounded-[6px] border px-2.5 py-2" style={{ borderColor: "var(--line-soft)" }} data-claim-forecast>
        <h4 className="text-[10px] font-semibold uppercase tracking-[.05em]">Claim forecast</h4>
        {scheduleFact && mode?.valid_schedules.includes(draft.optimizationSchedule) ? (
          <>
            <p className="mt-1 text-[10.5px] leading-[1.5]">{claimToken(scheduleFact.chronological_validation_claim)}</p>
            {scheduleFact.oos_use_state ? (
              <p className="mono mt-1 text-[9.5px]" data-forecast-oos={scheduleFact.oos_use_state}>
                {OOS_STATE_LABEL[scheduleFact.oos_use_state] ?? scheduleFact.oos_use_state}
              </p>
            ) : null}
            <p className="mono mt-1 text-[9px]" style={{ color: "var(--ink-faint)" }}>
              {mode.mode_id} × {scheduleFact.schedule} · cert ceiling not published
            </p>
          </>
        ) : (
          <p className="mt-1 text-[10px]" style={{ color: "var(--ink-faint)" }}>
            {draft.optimizationMode && draft.optimizationSchedule
              ? "No admitted mode × schedule fact was published for this selection."
              : "Choose an admitted mode and schedule to read the release claim."}
          </p>
        )}
      </section>
      <div className="flex flex-col">
        <Row label="alpha binding">
          <span title={bindingChip(draft, registry).title}>{bindingChip(draft, registry).text}</span>
        </Row>
        <Row label="execution route">{draft.executionRoute}</Row>
        <Row label="strategy_id">
          {effectiveStrategyId(draft) ? (
            <>
              {effectiveStrategyId(draft)}
              {draft.bound ? " (pinned by alpha_id)" : ""}
            </>
          ) : (
            <span className="italic" style={{ color: "var(--ink-faint)" }}>not declared</span>
          )}
        </Row>
        <Row label="dataset · symbol · tf">
          {/* §3.3: an absent value is never a dash. */}
          {draft.datasetId || <span className="italic" style={{ color: "var(--ink-faint)" }}>not declared</span>}
          {" · "}
          {draft.symbol || <span className="italic" style={{ color: "var(--ink-faint)" }}>not declared</span>}
          {" · "}
          {draft.timeframe}
        </Row>
        <Row label="protocol">{draft.protocol}</Row>
        <Row label="parameter_space">
          {draft.parameters.length} entries · {sweptCount(draft)} swept · {pinnedCount(draft)} pinned
          {sweepCeiling === null ? " (sweep ceiling not published)" : ` (sweep ceiling ${sweepCeiling})`}
        </Row>
        {draft.protocol === "advanced" && usesV2 ? (
          <Row label="walk-forward v2">
            {[
              draft.walkForward.windowMode === "rolling" && draft.walkForward.trainWindow ? `train ${draft.walkForward.trainWindow}` : null,
              draft.walkForward.labelHorizonBars ? `label ${draft.walkForward.labelHorizonBars}` : null,
              draft.walkForward.purgeBars ? `purge ${draft.walkForward.purgeBars}` : null,
              draft.walkForward.embargoBars ? `embargo ${draft.walkForward.embargoBars}` : null,
              draft.optimizationSchedule === "per_fold_causal" && draft.walkForward.inner ? `inner ${draft.walkForward.inner.splitFrequency || "?"}/${draft.walkForward.inner.trainWindow || "?"}` : null,
            ].filter(Boolean).join(" · ") || "requested-spec v2"}
          </Row>
        ) : null}
        <Row label="mode × schedule">
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
        <Row label="trials · stop · seed">
          {draft.optunaTrials || "not set"} · {draft.earlyStopping || "none"} ·{" "}
          {draft.randomSeed || "none"}
        </Row>
        <Row label="optimization_config">
          {overrides.length === 0
            ? "release defaults — nothing serialized"
            : `${overrides.length} overrides (${overrides.join(", ")}) — rest engine defaults`}
        </Row>
      </div>

      {blocking.length > 0 ? (
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
      ) : null}
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

  preflight: PreflightResponse | null;
  preflightState: ResearchState;
  clearedBecause?: string | null;
  onRunPreflight: () => void;
  /** CG-P08-03: the typed refusal of the last preflight, with its field path. */
  preflightRefusal?: PreflightRefusal | null;
  /** CG-P08-04: research dataset catalog for the data step. */
  catalog?: DatasetCatalog | null;
  catalogReason?: string | null;
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
    preflightRefusal = null,
    catalog = null,
    catalogReason = null,
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
      className="flex flex-col gap-3 px-4 py-4"
      style={{ background: "var(--paper)", color: "var(--ink)" }}
    >
      <header className="flex flex-col gap-1.5 border-b pb-2.5" style={{ borderColor: "var(--line)" }}>
        <div className="flex flex-wrap gap-3 text-[10px] font-semibold" style={{ color: "var(--accent)" }}>
          <a href="/research/quantbt/runs">Run Library</a>
          <a href="/research/quantbt/alpha-import">Import a version</a>
          <a href="/research/quantbt/atlas">Full route atlas</a>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1
            className="text-[22px] font-light tracking-[-.01em]"
            style={{ fontFamily: "Newsreader, Georgia, serif" }}
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
          <span className="mono ml-auto text-[10px]" style={{ color: "var(--ink-faint)" }} data-release-note>
            routes, protocols and ceilings read from the INSTALLED engine release —{" "}
            {atlas ? `${atlas.current_release.package}==${atlas.current_release.expected_version} · ${atlas.current_release.release_id}` : "release not available"}
          </span>
        </div>
        <p
          className="text-[13px] italic"
          style={{ fontFamily: "Newsreader, Georgia, serif", color: "var(--ink-faint)" }}
        >
          {SUBTITLE}
        </p>
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
              <a className="mono" href={`/research/quantbt/runs/${encodeURIComponent(cloneSource.runId)}/progress`}>{shortId(cloneSource.runId)}</a>
              <span style={{ color: "var(--ink-soft)" }}>
                A new run with a NEW intent: change anything, then run a fresh preflight. The original run is untouched.
              </span>
              {draft.alphaId ? (
                <LineageLink to={lineageHref(draft.alphaId, { av: draft.alphaVersionId || null })} className="mono" action="open-lineage">
                  attempt lineage →
                </LineageLink>
              ) : null}
            </>
          ) : cloneSource.state.state === "loading" ? (
            <span style={{ color: "var(--ink-soft)" }}>Reading the declaration of {cloneSource.runId}…</span>
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
          <a className="mono" href={`/research/quantbt/runs/${encodeURIComponent(forkSource.runId)}/freeze`}>{shortId(forkSource.runId)}</a>
          <span className="mono" style={{ color: "var(--ink-faint)" }}>· what-if {forkSource.cellId}</span>
          {forkSource.state === "ready" && forkSource.parameters ? (
            <>
              <span className="mono" data-fork-pins>
                {Object.entries(forkSource.parameters).map(([name, value]) => `${name} ${value}`).join(" · ")}
              </span>
              <span style={{ color: "var(--ink-soft)" }}>
                forked from {forkSource.runId} · what-if — a new intent with its own preflight and config_hash, lineage-linked to that run. The frozen run is untouched.
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

      <WizardBar current={step} onPick={(next) => {
        setVisited((previous) => new Set([...previous, step, next]));
        setStep(next);
      }} errors={errorSteps} />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {step === "context" ? (
            <>
              <ContextStep draft={draft} patch={patch} limits={limits} registry={registry} />
              {/* What could not be read, named. A rule the browser did not get
                  is not a rule that passed — and a blank space would read as
                  the second thing. */}
              {missing.length > 0 ? (
                <ResearchPanel
                  title="version declaration"
                  state={declarationState ?? atlasState}
                  minBodyHeight={48}
                >
                  <p className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-missing-constraints>
                    Not read for this declaration: {missing.join(", ")}. The checks that depend on
                    them do not run here; the server still applies its own at preflight.
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
            <ResearchPanel title="engine routes" state={atlasState} minBodyHeight={120}>
              <RouteStep
                draft={draft}
                patch={patch}
                atlas={atlas}
                limits={limits}
                error={errorByStep.get("route") ?? null}
              />
            </ResearchPanel>
          ) : null}
          {step === "data" ? (
            <DataStep draft={draft} patch={patch} limits={limits} error={errorByStep.get("data") ?? null} catalog={catalog} catalogReason={catalogReason} />
          ) : null}
          {step === "windows" ? (
            <WindowsStep draft={draft} patch={patch} atlas={atlas} error={errorByStep.get("windows") ?? null} catalog={catalog} warmupBars={limits.warmupBars} />
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
                    {preflightRefusal
                      ? "what preflight checks — 6 panels, preflight refused this request"
                      : "what preflight will check — 6 panels, none read yet"}
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

        <ReviewRail draft={draft} blocking={visibleBlocking} atlas={atlas} sweepCeiling={sweepCeiling} usesV2={v2} registry={registry} />
      </div>
    </div>
  );
}
