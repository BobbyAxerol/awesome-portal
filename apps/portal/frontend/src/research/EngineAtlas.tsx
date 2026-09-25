/**
 * Screen 12 — Engine Atlas (P04 composition scope).
 *
 * Reference surface, not a stage: three tabs — modes, execution routes, claims
 * by contract — rendered entirely from the release manifest. Spec 12's first
 * rule is that the engine adding a route makes the Atlas grow on its own, so
 * nothing here enumerates a route, mode or claim. Its reviewer checklist item 1
 * is "0 hardcoded route/mode in JSX", and the manifest-drive test asserts a
 * fifteenth route appears without touching this file.
 *
 * The component is presentational on purpose. P04 published a read-only
 * same-origin `GET /api/v1/research/quantbt/atlas`, but mounting it on a
 * product route is P09's shared-route work, so the document arrives as a prop
 * and the fetch stays with whoever owns the route. That keeps this file honest
 * about what it is: composition over a contract, not an activation.
 *
 * Visual system is the Portal's paper theme, whose tokens match the hi-fi
 * palette value for value — no raw hex, and no change to Execution Carbon.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { Formula } from "./Formula";
import { encodeInspectionCursor } from "./inspectionCursor";
import {
  ENGINE_SCHEDULES,
  isPublished,
  type AtlasDocument,
  type AtlasMode,
  type AtlasModeFacts,
  type AtlasNotPublishedFact,
  type AtlasObjectiveFact,
  type AtlasReadsFact,
  type AtlasScheduleFact,
  type AtlasSourceLocator,
  type CurrentRelease,
  type BlockingAxis,
  type RouteDisplay,
  allRouteDisplays,
  currentReleaseLabel,
  historicalReleaseLabels,
  routeDisplay,
} from "./atlas";
import { ResearchPanel } from "./ResearchPanel";
import type { ResearchState } from "./state";

export const ATLAS_TABS = ["modes", "routes", "claims"] as const;
export type AtlasTab = (typeof ATLAS_TABS)[number];

export function isAtlasTab(value: string): value is AtlasTab {
  return (ATLAS_TABS as readonly string[]).includes(value);
}

/** Reads `#tab=…` without owning routing. Unknown values fall back to `modes`. */
export function tabFromHash(hash: string): AtlasTab {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const value = new URLSearchParams(raw).get("tab") ?? "";
  return isAtlasTab(value) ? value : "modes";
}

/* -------------------------------------------------------------------------
 * Shared bits
 * ---------------------------------------------------------------------- */

const AXIS_LABEL: Record<BlockingAxis, string> = {
  engine: "engine",
  integration: "integration",
  evidence: "evidence",
  admission: "admission",
};

/**
 * All four axes, always all four.
 *
 * A route can be engine-supported and still integration-blocked; collapsing
 * that into one verdict blames the engine for a gap Portal owns, and the reader
 * loses the one fact that says who can unblock it.
 */
function AxisChips({ route }: { route: RouteDisplay }) {
  const entries = Object.entries(route.axes) as [BlockingAxis, string][];
  return (
    <span className="flex flex-wrap gap-1">
      {entries.map(([axis, value]) => {
        const isBlocker = route.blockedBy === axis;
        return (
          <span
            key={axis}
            title={`${AXIS_LABEL[axis]}: ${value}`}
            data-axis={axis}
            data-blocking={isBlocker || undefined}
            className="mono rounded-[3px] border px-[5px] text-[9px] leading-[15px]"
            style={{
              borderColor: isBlocker ? "var(--ink-soft)" : "var(--line)",
              borderStyle: isBlocker ? "dashed" : "solid",
              color: isBlocker ? "var(--ink-soft)" : "var(--ink-faint)",
            }}
          >
            {value}
          </span>
        );
      })}
    </span>
  );
}

/* -------------------------------------------------------------------------
 * Tab: routes
 * ---------------------------------------------------------------------- */

const ROUTE_COLUMNS = [
  { key: "route", width: 172 },
  { key: "status", width: 86 },
  { key: "family", width: 76 },
  { key: "contract", width: 170 },
  { key: "backend", width: 140 },
  { key: "report levels", width: 120 },
] as const;

/** Tone of the server's status word (spec 12 §3; derived server-side, CG-P04-06). */
export function statusTone(word: string | null | undefined): { color: string; dashed: boolean } {
  if (!word) return { color: "var(--ink-faint)", dashed: true };
  if (word === "DEFAULT") return { color: "var(--good)", dashed: false };
  if (word === "DEFERRED") return { color: "var(--bad)", dashed: true };
  if (word === "SUPPORTED") return { color: "var(--accent)", dashed: false };
  return { color: "var(--accent-2)", dashed: false };
}

const METHOD_LABEL: Record<string, string> = {
  wfo: "strategy-param route — walk-forward search applies",
  tape: "tape-driven — single-pass replay; the walk-forward step collapses to the tape span",
  single_pass: "single pass — the engine lists no walk-forward target for this route",
};

type EngineFacts = NonNullable<AtlasDocument["routes"][number]["engine_facts"]>;

function RouteEngineDetail({ routeId, facts }: { routeId: string; facts: EngineFacts }) {
  const matrix = facts.support_matrix ?? null;
  const params = facts.route_params ?? null;
  return (
    <div className="flex w-full flex-col gap-1.5 sm:pl-[172px]" data-route-engine={routeId}>
      <span className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink)" }} data-route-description={routeId}>
        {facts.description}
      </span>
      <span className="mono text-[9.5px]" style={{ color: "var(--ink-soft)" }} data-route-method={facts.method} title={facts.method_basis}>
        {METHOD_LABEL[facts.method] ?? facts.method}
      </span>
      {matrix ? (
        <div className="flex flex-col" data-support-matrix={matrix.function}>
          <span className="mono text-[9px] uppercase tracking-[.06em]" style={{ color: "var(--ink-faint)" }}>
            {matrix.function}() · {matrix.executable}/{matrix.total} executable
          </span>
          {matrix.rows.map((row) => (
            <span
              key={row.spec_id}
              className="mono flex flex-wrap gap-x-2 text-[9.5px]"
              data-support-row={row.spec_id}
              data-support-status={row.status}
              style={{ color: row.status === "supported" ? "var(--ink-soft)" : "var(--ink-faint)" }}
            >
              <span style={{ width: 170 }}>{row.spec_id}</span>
              <span style={{ width: 110, color: row.status === "supported" ? "var(--good)" : "var(--accent-2)" }}>{row.status}</span>
              <span className="flex-1 break-words">{row.status === "supported" ? row.backends : row.route}</span>
            </span>
          ))}
        </div>
      ) : null}
      {params ? (
        <details className="text-[10px]" data-route-params={params.group}>
          <summary className="mono cursor-pointer text-[9.5px]" style={{ color: "var(--accent)" }}>
            route_params · {params.group} · engine vocabulary
          </summary>
          <div className="mt-1 flex flex-col gap-1">
            {params.fields.map((field) => (
              <div key={field.name} className="flex flex-col gap-0.5" data-route-param={field.name}>
                <span className="mono text-[9.5px]">
                  {field.name}
                  {field.engine_field && field.engine_field !== field.name ? ` → ${field.engine_field}` : ""}
                </span>
                {field.engine_values.length > 0 ? (
                  <span className="mono text-[9.5px]" style={{ color: "var(--ink-soft)" }}>engine: {field.engine_values.join(" · ")}</span>
                ) : null}
                {field.requested_spec_values.length > 0 ? (
                  <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
                    form: {field.requested_spec_values.map((value) => (field.accepted_by_engine.includes(value) ? value : `${value}✕`)).join(" · ")}
                  </span>
                ) : null}
                <span className="text-[9.5px]" style={{ color: "var(--ink-faint)" }}>{field.note}</span>
              </div>
            ))}
          </div>
        </details>
      ) : null}
      <Locators sources={facts.source} />
    </div>
  );
}

function RoutesTab({
  doc,
  selectedRoute = null,
  onRoute,
}: {
  doc: AtlasDocument;
  selectedRoute?: string | null;
  onRoute?: (route: string) => void;
}) {
  const rows = useMemo(() => allRouteDisplays(doc), [doc]);
  const tableRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selectedRoute) return;
    const selected = [...(tableRef.current?.querySelectorAll<HTMLElement>("[data-route]") ?? [])]
      .find((row) => row.dataset.route === selectedRoute);
    if (typeof selected?.scrollIntoView === "function") selected.scrollIntoView({ block: "center", behavior: "auto" });
  }, [selectedRoute, rows]);
  return (
    /*
      No fixed-width track at all.

      It was 1020px — wider than the panel once the Portal sidebar takes 248px —
      so on the product route the input class and every refusal reason sat
      behind a horizontal scrollbar. Narrowing it to the column sum only moved
      the problem to 660px, where the reason then wrapped inside a track wider
      than the viewport.

      So the columns wrap instead. Alignment across fourteen rows is worth a
      lot at 1280, where all five still fit on one line; it is worth less than
      a readable refusal at 660. The fixture lane has no sidebar, which is
      exactly why it never showed this: a fixture lane is not a product route.
    */
    <div ref={tableRef}>
      <div>
        <div
          className="mono flex flex-wrap border-b px-3 py-[5px] text-[9.5px] uppercase tracking-[.06em]"
          style={{ borderColor: "var(--line-soft)", color: "var(--ink-faint)" }}
        >
          {ROUTE_COLUMNS.map((column) => (
            <span key={column.key} style={{ width: column.width, flex: "none" }}>
              {column.key}
            </span>
          ))}
        </div>

        {rows.map((row) => (
          <div
            key={row.routeId}
            data-route={row.routeId}
            data-admitted={row.admitted}
            data-selected={row.routeId === selectedRoute || undefined}
            aria-current={row.routeId === selectedRoute ? "true" : undefined}
            className="flex flex-col gap-1 border-b px-3 py-[7px]"
            style={{
              borderColor: row.routeId === selectedRoute ? "var(--accent)" : "var(--line-soft)",
              background: row.routeId === selectedRoute ? "var(--accent-soft)" : undefined,
            }}
          >
            <div className="flex flex-wrap items-baseline gap-y-0.5">
            <span
              className="mono text-[11px] font-semibold"
              style={{
                width: 172,
                flex: "none",
                color: row.admitted ? "var(--ink)" : "var(--ink-soft)",
              }}
            >
              <button
                type="button"
                className="mono text-left font-semibold"
                onClick={() => onRoute?.(row.routeId)}
                data-route-link={row.routeId}
                style={{ color: "inherit" }}
              >
                {row.routeId}
              </button>
            </span>
            {(() => {
              const route = doc.routes.find((r) => r.route_id === row.routeId);
              const word = route?.status_word ?? null;
              const tone = statusTone(word);
              return (
                <span style={{ width: 86, flex: "none" }}>
                  {word ? (
                    <span
                      className="mono rounded-[3px] border px-[5px] text-[9px] font-bold leading-[15px]"
                      style={{ color: tone.color, borderColor: tone.color, borderStyle: tone.dashed ? "dashed" : "solid" }}
                      data-status-word={word}
                    >
                      {word}
                    </span>
                  ) : (
                    /* An older manifest has no engine facts: say so, never a dash. */
                    <span className="mono text-[8.5px] italic" style={{ color: "var(--ink-faint)" }} data-status-word="none" title="This manifest publishes no engine facts for this route.">
                      not published
                    </span>
                  )}
                </span>
              );
            })()}
            <span
              className="mono text-[10px]"
              style={{ width: 76, flex: "none", color: "var(--ink-faint)" }}
            >
              {row.family}
            </span>
            <span
              className="mono text-[10px]"
              style={{ width: 170, flex: "none", color: "var(--ink-soft)" }}
            >
              {doc.routes.find((r) => r.route_id === row.routeId)?.execution_contract}
            </span>
            {(() => {
              const resolved = doc.routes.find((r) => r.route_id === row.routeId)?.engine_facts?.resolved_backend ?? null;
              return (
                <span
                  className="mono text-[10px]"
                  style={{ width: 140, flex: "none", color: "var(--ink-soft)" }}
                  data-resolved-backend={resolved?.state ?? "catalog"}
                  title={resolved?.reason ?? (resolved?.engine_mode ? `engine mode ${resolved.engine_mode}` : undefined)}
                >
                  {resolved?.state === "RESOLVED" ? resolved.value : resolved?.state === "SPEC_DEPENDENT" ? "spec-dependent" : row.backendLabel}
                </span>
              );
            })()}
            <span
              className="mono text-[10px]"
              style={{ width: 120, flex: "none", color: "var(--ink-faint)" }}
            >
              {doc.routes.find((r) => r.route_id === row.routeId)?.report_levels.join(" ")}
            </span>
            </div>

            {/* Axes and the engine's own refusal wording get the full row width:
                squeezed into a residual column the reason truncates, and a
                truncated refusal is the one thing a disabled route must not do. */}
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 sm:pl-[172px]">
              <AxisChips route={row} />
              {/* The input class moved here from a residual column on line one:
                  as `flex:1` after five fixed columns it had ~150px on the
                  product route and was cut mid-identifier. */}
              <span
                className="mono text-[10px]"
                data-input-class={row.routeId}
                style={{ color: "var(--ink-faint)" }}
              >
                {doc.routes.find((r) => r.route_id === row.routeId)?.required_input_class}
              </span>
              <span
                className="w-full text-[10px] leading-[1.5]"
                data-route-reason={row.routeId}
                style={{ color: "var(--ink-soft)" }}
              >
                {row.reason}
              </span>
              {/* Declaring is offered only for a route New Run can submit; a
                  blocked route keeps its reason and no action (spec 12 §3). */}
              {row.admitted ? (
                <Link
                  to={`/research/quantbt/runs/new?step=route&route=${encodeURIComponent(row.routeId)}`}
                  className="mono text-[9.5px] font-semibold"
                  style={{ color: "var(--accent)" }}
                  data-declare-route={row.routeId}
                >
                  declare →
                </Link>
              ) : null}
            </div>
            {(() => {
              const facts = doc.routes.find((r) => r.route_id === row.routeId)?.engine_facts ?? null;
              return facts ? <RouteEngineDetail routeId={row.routeId} facts={facts} /> : null;
            })()}
          </div>
        ))}

        <p className="px-3 py-[7px] text-[10px]" style={{ color: "var(--ink-faint)" }}>
          Disabled routes render with the engine&rsquo;s refusal reason — a route absent from the
          support matrix is not a defect.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Tab: claims
 * ---------------------------------------------------------------------- */

function ClaimsTab({ doc }: { doc: AtlasDocument }) {
  return (
    <div>
      <div>
        <div
          className="mono flex flex-wrap border-b px-3 py-[5px] text-[9.5px] uppercase tracking-[.06em]"
          style={{ borderColor: "var(--line-soft)", color: "var(--ink-faint)" }}
        >
          <span style={{ width: 216, flex: "none" }}>execution contract</span>
          <span style={{ width: 88, flex: "none" }}>engine cert</span>
          <span style={{ flex: 1 }}>numeric guarantee</span>
        </div>

        {doc.claims.map((claim) => (
          <div
            key={claim.contract_id}
            data-contract={claim.contract_id}
            className="flex flex-col gap-0.5 border-b px-3 py-[6px]"
            style={{ borderColor: "var(--line-soft)" }}
          >
            <div className="flex flex-wrap items-baseline gap-y-0.5">
              <span
                className="mono text-[11px] font-semibold"
                style={{ width: 216, flex: "none" }}
              >
                {claim.contract_id}
              </span>
              <span
                className="mono text-[10px]"
                style={{ width: 88, flex: "none", color: "var(--ink-soft)" }}
              >
                {claim.engine_certification}
              </span>
              <span
                className="flex-1 text-[10.5px] leading-[1.5]"
                style={{ color: "var(--ink-soft)" }}
              >
                {claim.numeric_guarantee}
              </span>
            </div>
            {/*
              The most important column on this tab, and the reason it is a
              line rather than a column: as a fourth fixed column it needed a
              980px table, so at 1280 with the sidebar it sat behind a
              horizontal scrollbar. A contract's honest limit that the reader
              has to scroll sideways to find is a limit nobody reads — the same
              defect the route refusal reason had in P04.
            */}
            <span
              className="text-[10.5px] leading-[1.5]"
              style={{ color: "var(--accent-strong)" }}
              data-never-claims={claim.contract_id}
            >
              {claim.never_claims}
            </span>
            {claim.qualifier ? (
              <span className="mono text-[9.5px] leading-[1.5]" style={{ color: "var(--ink-faint)" }} data-claim-qualifier={claim.qualifier.result_metadata_derivation}>
                {claim.qualifier.level_name} · {claim.qualifier.level_description} ·{" "}
                {claim.qualifier.result_metadata_derivation === "ENGINE_DERIVES_SAME_LEVEL"
                  ? `certify_result_metadata derives the same level (${claim.qualifier.result_metadata_status})`
                  : claim.qualifier.result_metadata_derivation === "ENGINE_DERIVES_OTHER_LEVEL"
                    ? `certify_result_metadata derives L${claim.qualifier.result_metadata_level} (${claim.qualifier.result_metadata_status}) — the catalog level is the Portal record`
                    : "certify_result_metadata has no branch for this contract — the catalog level is the Portal record"}
              </span>
            ) : null}
          </div>
        ))}

        <p
          className="mono border-t px-3 py-[7px] text-[10px]"
          style={{ borderColor: "var(--line-soft)", color: "var(--ink-faint)" }}
        >
          certificate = min(engine cert, methodology cap, artifact completeness)
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Tab: modes
 * ---------------------------------------------------------------------- */

/** Claim tone by what the chronological claim says (spec 12 §7 chip colours). */
function claimTone(claim: string): { color: string; border: string } {
  if (claim.startsWith("strict")) return { color: "var(--good)", border: "var(--good)" };
  if (claim.startsWith("selection_adjusted")) return { color: "var(--accent-2)", border: "var(--accent-2)" };
  if (claim.startsWith("not_causal") || claim.includes("retrospective")) return { color: "var(--bad)", border: "var(--bad)" };
  return { color: "var(--bad)", border: "var(--bad)" };
}

function Locators({ sources }: { sources: readonly AtlasSourceLocator[] }) {
  return (
    <span className="mono text-[9px] leading-[1.5]" style={{ color: "var(--ink-faint)" }} data-fact-source>
      source{" "}
      {sources.map((source, index) => (
        <span key={`${source.path}:${source.lines}`} title={`sha256 ${source.sha256} · “${source.anchor}”`}>
          {index > 0 ? " · " : ""}
          {source.path}:{source.lines}
        </span>
      ))}
    </span>
  );
}

function NotPublished({ fact, label }: { fact: AtlasNotPublishedFact; label: string }) {
  return (
    <span className="text-[10.5px] leading-[1.55]" style={{ color: "var(--ink-soft)" }} data-not-published={label}>
      <span className="mono text-[9px] font-bold uppercase tracking-[.06em]" style={{ color: "var(--ink-faint)" }}>
        not published
      </span>{" "}
      {fact.reason}
    </span>
  );
}

/** Spec 12 HiFi wording for the engine's OOS use of a mode × schedule (CG-P04-04). */
export const OOS_STATE_LABEL: Record<string, string> = {
  SELECTION_INPUT: "OOS: selection input",
  WITHHELD_UNTIL_S4: "OOS: withheld until Stage 4",
  RETROSPECTIVE: "OOS: retrospective",
  REPORT_ONLY: "OOS: report only",
  NOT_APPLICABLE: "no held-out window — train = test",
};

function oosStateColor(state: string): string {
  if (state === "SELECTION_INPUT" || state === "RETROSPECTIVE") return "var(--accent-2)";
  if (state === "REPORT_ONLY") return "var(--ink-mute)";
  if (state === "WITHHELD_UNTIL_S4") return "var(--ink-faint)";
  return "var(--bad)";
}

function ScheduleClaim({ fact }: { fact: AtlasScheduleFact }) {
  const tone = claimTone(fact.chronological_validation_claim);
  return (
    <div className="flex flex-col gap-1" data-schedule-claim={fact.schedule}>
      <div className="flex flex-wrap items-baseline gap-1.5">
        <span
          className="mono rounded-[3px] border px-[5px] text-[9px] leading-[15px]"
          style={{ color: tone.color, borderColor: tone.border }}
          data-claim={fact.chronological_validation_claim}
        >
          {fact.chronological_validation_claim}
        </span>
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-soft)" }}>
          validation {fact.validation_claim}
        </span>
        {fact.oos_use_state ? (
          <span
            className="mono rounded-[3px] border px-[6px] text-[10px] font-semibold leading-[16px]"
            style={{ color: oosStateColor(fact.oos_use_state), borderColor: oosStateColor(fact.oos_use_state) }}
            data-oos-state={fact.oos_use_state}
          >
            {OOS_STATE_LABEL[fact.oos_use_state] ?? fact.oos_use_state}
          </span>
        ) : null}
      </div>
      {fact.required_request_fields && fact.required_request_fields.length > 0 ? (
        <span className="text-[10px]" style={{ color: "var(--ink-soft)" }} data-required-fields={fact.schedule}>
          needs <span className="mono">{fact.required_request_fields.join(", ")}</span> (requested-spec v2) — preflight refuses it without them.
        </span>
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-0.5 text-[10.5px]">
        <dt className="mono text-[9px] uppercase tracking-[.06em]" style={{ color: "var(--ink-faint)" }}>causality</dt>
        <dd className="mono text-[10px]">{fact.causality_claim} · {fact.causality_schedule_v2}</dd>
        <dt className="mono text-[9px] uppercase tracking-[.06em]" style={{ color: "var(--ink-faint)" }}>outer OOS</dt>
        <dd className="text-[10.5px]" data-oos-use={fact.oos_use}>
          {fact.oos_use === "USED" ? "feeds selection" : "does not feed selection"}
          {fact.oos_use_condition ? (
            <span style={{ color: "var(--ink-faint)" }}> — {fact.oos_use_condition}</span>
          ) : null}
        </dd>
        <dt className="mono text-[9px] uppercase tracking-[.06em]" style={{ color: "var(--ink-faint)" }}>params</dt>
        <dd className="mono text-[10px]">{fact.params_semantics}</dd>
        <dt className="mono text-[9px] uppercase tracking-[.06em]" style={{ color: "var(--ink-faint)" }}>cert cap</dt>
        <dd>
          <NotPublished fact={fact.cert_cap} label="cert_cap" />
        </dd>
      </dl>
      <Locators sources={fact.source} />
    </div>
  );
}

function ObjectiveBlock({ facts }: { facts: AtlasModeFacts }) {
  if (!isPublished<AtlasObjectiveFact>(facts.objective)) {
    return <NotPublished fact={facts.objective} label="objective" />;
  }
  const objective = facts.objective;
  return (
    <div className="flex flex-col gap-1.5 border-l-2 pl-2.5" style={{ borderColor: "var(--accent)" }} data-objective>
      {objective.stages.map((stage) => (
        <div key={stage.stage} className="flex flex-col gap-0.5">
          <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }}>
            {stage.stage} · {stage.formula_id} · {objective.direction}
          </span>
          <Formula formula={stage.formula} />
        </div>
      ))}
      {objective.coefficients.length > 0 ? (
        <table className="text-[10px]" data-objective-terms>
          <tbody>
            {objective.coefficients.map((coefficient) => (
              <tr key={coefficient.name}>
                <td className="mono pr-3" style={{ color: "var(--ink)" }}>{coefficient.name}</td>
                <td className="mono pr-3">
                  {coefficient.release_default ?? (
                    <span style={{ color: "var(--ink-faint)" }}>unset</span>
                  )}
                </td>
                <td style={{ color: "var(--ink-faint)" }}>{coefficient.note ?? "release default"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {objective.terms && objective.terms.length > 0 ? (
        <table className="text-[10px]" data-objective-term-table>
          <thead>
            <tr className="mono text-[8.5px] uppercase tracking-[.06em]" style={{ color: "var(--ink-faint)" }}>
              <th className="pr-3 text-left font-normal">term</th>
              <th className="pr-3 text-left font-normal">meaning</th>
              <th className="text-left font-normal">source</th>
            </tr>
          </thead>
          <tbody>
            {objective.terms.map((term) => (
              <tr key={term.symbol} className="align-top" data-objective-term={term.symbol}>
                <td className="mono py-[2px] pr-3" style={{ color: "var(--ink)" }}>{term.symbol}</td>
                <td className="py-[2px] pr-3 leading-[1.45]" style={{ color: "var(--ink-soft)" }}>{term.meaning}</td>
                <td className="mono py-[2px] text-[9px]" style={{ color: "var(--ink-faint)" }} title={term.source.map((item) => `${item.path}:${item.lines} sha256 ${item.sha256}`).join("\n")}>
                  {term.source.map((item) => `${item.path.replace(/^quantbt\//, "")}:${item.lines}`).join(" · ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {objective.weights && objective.weights.length > 0 ? (
        <table className="text-[10px]" data-objective-weights>
          <thead>
            <tr className="mono text-[8.5px] uppercase tracking-[.06em]" style={{ color: "var(--ink-faint)" }}>
              <th className="pr-3 text-left font-normal">weight</th>
              <th className="pr-3 text-left font-normal">release default</th>
              <th className="text-left font-normal">role</th>
            </tr>
          </thead>
          <tbody>
            {objective.weights.map((weight) => (
              <tr key={weight.name} className="align-top" data-objective-weight={weight.name}>
                <td className="mono py-[2px] pr-3">{weight.name}</td>
                <td className="mono py-[2px] pr-3" title={weight.source.map((item) => `${item.path}:${item.lines}`).join(" · ")}>{weight.release_default}</td>
                <td className="py-[2px] leading-[1.45]" style={{ color: "var(--ink-soft)" }}>{weight.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <span className="mono text-[9.5px]" style={{ color: "var(--ink-soft)" }}>
        selection metric {objective.selection_metrics.join(" · ")}
      </span>
      {objective.note ? (
        <span className="text-[10px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>{objective.note}</span>
      ) : null}
      <Locators sources={objective.source} />
    </div>
  );
}

export interface ModeCardProps {
  mode: AtlasMode;
  /** The schedule whose claim is shown. Always one the mode lists. */
  schedule: string;
  onSchedule: (schedule: string) => void;
  /** A run to open Search & Selection for, when the Atlas was reached from one. */
  runId: string | null;
}

export function ModeCard({ mode, schedule, onSchedule, runId }: ModeCardProps) {
  const facts = mode.facts ?? null;
  const fact = facts?.schedules.find((item) => item.schedule === schedule) ?? null;
  return (
    <article
      data-mode={mode.mode_id}
      className="flex flex-col rounded-[10px] border px-4 py-3.5"
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
    >
      <header
        className="flex flex-wrap items-baseline gap-2.5 border-b pb-2"
        style={{ borderColor: "var(--line-soft)" }}
      >
        <span className="mono text-[12px] font-bold">{mode.mode_id}</span>
        <span className="text-[12px]" style={{ color: "var(--ink-soft)" }}>
          {mode.display_name}
        </span>
        <span className="ml-auto flex flex-wrap gap-1" role="group" aria-label={`${mode.mode_id} schedules`}>
          {ENGINE_SCHEDULES.map((candidate) => {
            const valid = mode.valid_schedules.includes(candidate);
            const selected = valid && candidate === schedule;
            return valid ? (
              <button
                key={candidate}
                type="button"
                aria-pressed={selected}
                data-schedule={candidate}
                onClick={() => onSchedule(candidate)}
                className="mono rounded-[3px] border px-[6px] text-[9.5px] leading-[17px]"
                style={{
                  borderColor: selected ? "var(--accent)" : "var(--line)",
                  background: selected ? "var(--accent-soft)" : "var(--paper-raised)",
                  color: selected ? "var(--accent)" : "var(--ink-soft)",
                }}
              >
                {candidate}
                {candidate === mode.default_schedule ? " · default" : ""}
              </button>
            ) : (
              /* Invalid schedules are struck through with the reason, never hidden. */
              <span
                key={candidate}
                data-schedule-invalid={candidate}
                tabIndex={0}
                role="note"
                aria-label={`${candidate}: not admitted by this mode in the installed release manifest`}
                title="Not in this mode's valid schedules in the installed release manifest."
                className="mono rounded-[3px] border border-dashed px-[6px] text-[9.5px] leading-[17px] line-through"
                style={{ borderColor: "var(--line)", color: "var(--ink-faint)" }}
              >
                {candidate}
              </span>
            );
          })}
        </span>
      </header>

      <div className="flex flex-wrap gap-4 pt-2.5">
        <div className="flex min-w-[280px] flex-[1.1] flex-col gap-2.5">
          <span className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
            claim · {mode.mode_id} × {schedule}
          </span>
          {fact ? (
            <ScheduleClaim fact={fact} />
          ) : (
            <span className="text-[10.5px]" style={{ color: "var(--ink-soft)" }} data-facts-unpublished>
              This manifest publishes no engine facts for this mode × schedule.
            </span>
          )}
          <span className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
            objective
          </span>
          <span className="text-[11.5px] leading-[1.55]" style={{ color: "var(--ink-soft)" }}>
            {mode.objective_summary}
          </span>
          {facts ? <ObjectiveBlock facts={facts} /> : null}
          {facts && isPublished<AtlasReadsFact>(facts.reads) ? (
            <span className="mono text-[10px]" style={{ color: "var(--ink-soft)" }} data-reads>
              reads {facts.reads.selection_inputs.join(" · ")} · retains {facts.reads.retention}
            </span>
          ) : null}
        </div>

        <div className="flex min-w-[260px] flex-1 flex-col gap-2">
          {/* The failure signature, from the manifest, never paraphrased. */}
          <div className="border-l-2 pl-2" style={{ borderColor: "var(--bad)" }}>
            <span
              className="mono block text-[8.5px] font-bold uppercase tracking-[.08em]"
              style={{ color: "var(--bad)" }}
            >
              suspect
            </span>
            <span className="text-[10.5px] leading-[1.55]" style={{ color: "var(--ink-soft)" }} data-suspect>
              {mode.suspect}
            </span>
          </div>
          {mode.artifact_fields.length > 0 ? (
            <span className="mono text-[10px]" style={{ color: "var(--ink-faint)" }}>
              artifacts: {mode.artifact_fields.join(" · ")}
            </span>
          ) : null}
          {mode.when_to_use ? (
            <span className="text-[10.5px] leading-[1.55]" style={{ color: "var(--ink-soft)" }}>
              {mode.when_to_use}
            </span>
          ) : null}
          {mode.rules.map((rule, index) => (
            <span key={index} className="text-[10.5px] leading-[1.55]" style={{ color: "var(--ink-soft)" }}>
              {rule}
            </span>
          ))}
          {runId ? (
            <Link
              to={`/research/quantbt/runs/${encodeURIComponent(runId)}/search#${encodeInspectionCursor({ stage: "search", mode: mode.mode_id, schedule })}`}
              className="mono self-start text-[10px] font-semibold uppercase tracking-[.06em]"
              style={{ color: "var(--accent)" }}
              data-open-search={mode.mode_id}
            >
              open search &amp; selection →
            </Link>
          ) : (
            <Link
              to={`/research/quantbt/runs?mode=${encodeURIComponent(mode.mode_id)}`}
              className="mono self-start text-[10px] font-semibold uppercase tracking-[.06em]"
              style={{ color: "var(--accent)" }}
              data-find-runs={mode.mode_id}
            >
              find runs in this mode →
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

function ModeTable({ modes }: { modes: readonly AtlasMode[] }) {
  return (
    <div className="overflow-x-auto rounded-[6px] border" style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }} data-mode-table>
      <div className="border-b px-3 py-2" style={{ borderColor: "var(--line)" }}>
        <span className="text-[10px] font-medium uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
          when to reach for which mode
        </span>
      </div>
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="mono text-[9px] uppercase tracking-[.06em]" style={{ color: "var(--ink-faint)" }}>
            <th className="px-3 py-1.5 text-left font-normal">mode</th>
            <th className="px-3 py-1.5 text-left font-normal">use when</th>
            <th className="px-3 py-1.5 text-left font-normal">avoid when</th>
          </tr>
        </thead>
        <tbody>
          {modes.map((mode) => (
            <tr key={mode.mode_id} className="border-t" style={{ borderColor: "var(--line-soft)" }} data-mode-row={mode.mode_id}>
              <td className="mono px-3 py-[7px] align-top" style={{ width: 190 }}>{mode.mode_id}</td>
              <td className="px-3 py-[7px] align-top" style={{ color: "var(--ink-soft)" }}>{mode.when_to_use}</td>
              <td className="px-3 py-[7px] align-top">
                {mode.facts ? (
                  <NotPublished fact={mode.facts.avoid_when} label={`avoid_when:${mode.mode_id}`} />
                ) : (
                  <span className="mono text-[10px]" style={{ color: "var(--ink-faint)" }}>not published</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ModesTab({
  doc,
  schedules,
  onSchedule,
  runId,
}: {
  doc: AtlasDocument;
  schedules: Readonly<Record<string, string>>;
  onSchedule: (modeId: string, schedule: string) => void;
  runId: string | null;
}) {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap gap-3.5">
        {/* Q4 / D-4: gold, as the HiFi has it — a claim warning, not an accent. */}
        <div
          className="flex min-w-[min(420px,100%)] flex-[1.4] items-start gap-3 rounded-[6px] border px-3.5 py-2.5"
          style={{ borderColor: "var(--accent-2)", background: "var(--accent-2-soft)" }}
          data-rule-one
        >
          {/* D-B2 (2026-09-23): gold on gold-soft is 4.0:1, below AA for this
              size. The gold frame carries the warning; the words are ink. */}
          <span
            className="mono flex-none text-[10px] font-bold uppercase tracking-[.1em]"
            style={{ color: "var(--ink)" }}
          >
            rule one
          </span>
          <span className="text-[11.5px] leading-[1.55]" style={{ color: "var(--ink)" }}>
            {/* HiFi copy, restored in W4: requested-spec v2 carries the inner
                folds, so `mode_1_decay + per_fold_causal` is a valid pair in
                the manifest again (CG-P02-02; it was struck under DQ-10). */}
            {/* An older manifest still strikes the pair; the sentence then names
                only pairs it admits (DQ-10), so it never contradicts a chip. */}
            The claim comes from <span className="mono">mode × schedule</span>, never from the mode
            alone.{" "}
            {doc.modes.find((mode) => mode.mode_id === "mode_1_decay")?.valid_schedules.includes("per_fold_causal") ? (
              <>
                <span className="mono">mode_1_decay + per_fold_causal</span> is strict outer OOS; the
                same mode with <span className="mono">per_fold_decay</span> is selection-adjusted.
              </>
            ) : (
              <>
                <span className="mono">mode_1_decay + per_fold_decay</span> is selection-adjusted outer
                OOS; the same mode with <span className="mono">global</span> is a global calibration, not
                causal.
              </>
            )}{" "}
            Click the schedule chips below and watch the claim change.
          </span>
        </div>
        <div
          className="flex min-w-[min(360px,100%)] flex-1 items-start gap-3 rounded-[6px] border px-3.5 py-2.5"
          style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
        >
          <span
            className="mono flex-none text-[10px] font-bold uppercase tracking-[.1em]"
            style={{ color: "var(--ink-soft)" }}
          >
            rule two
          </span>
          <span className="text-[11.5px] leading-[1.55]" style={{ color: "var(--ink-soft)" }}>
            Two selector layers, never mixed: <span className="mono">optimization_mode</span> belongs
            to this page; the execution route does not.
          </span>
        </div>
      </div>

      {doc.modes.map((mode) => (
        <ModeCard
          key={mode.mode_id}
          mode={mode}
          schedule={
            schedules[mode.mode_id] && mode.valid_schedules.includes(schedules[mode.mode_id]!)
              ? schedules[mode.mode_id]!
              : mode.default_schedule
          }
          onSchedule={(schedule) => onSchedule(mode.mode_id, schedule)}
          runId={runId}
        />
      ))}

      <ModeTable modes={doc.modes} />

      <div className="flex flex-col gap-1" data-screen-rules>
        <span className="mono text-[9.5px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
          rules of this screen
        </span>
        <p className="text-[10.5px] leading-[1.55]" style={{ color: "var(--ink-soft)" }}>
          Claim strings are the engine&rsquo;s, rendered verbatim from the mode × schedule matrix —
          the UI never composes its own. Invalid schedules render struck-through with the reason,
          never hidden. A real run locks mode and schedule at submit; this atlas exists so nobody
          learns that the hard way.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Release facts
 * ---------------------------------------------------------------------- */

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="mono text-[9px] uppercase tracking-[.06em]" style={{ color: "var(--ink-faint)" }}>{label}</dt>
      <dd className="mono text-[10.5px]">{children}</dd>
    </div>
  );
}

/**
 * The published facts of the selected release (audit F-09): what a researcher
 * needs before declaring a run, from the same read — trial ceiling, native
 * package, submission constraints, locked defaults and walk-forward values.
 */
function ReleaseFacts({ release }: { release: CurrentRelease }) {
  const options = release.walk_forward_options ?? null;
  return (
    <details className="rounded-[6px] border px-3 py-2" style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }} data-release-facts>
      <summary className="mono cursor-pointer text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        release facts · {release.release_id}
      </summary>
      <div className="flex flex-wrap gap-x-8 gap-y-3 pt-2">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <Fact label="package">{release.package} · expected {release.expected_version}</Fact>
          <Fact label="native">
            {release.native_package ? `${release.native_package} · expected ${release.native_expected_version ?? "not declared"}` : "none declared"}
          </Fact>
          <Fact label="trial ceiling">{release.trial_ceiling}</Fact>
          <Fact label="profile">{release.submission_constraints.profile_id}</Fact>
          <Fact label="overrides">{release.submission_constraints.optimization_overrides}</Fact>
          <Fact label="trials accepted">{release.submission_constraints.accepted_trial_count}</Fact>
          <Fact label="early stopping">{release.submission_constraints.early_stopping}</Fact>
          <Fact label="random seed">{release.submission_constraints.random_seed}</Fact>
          {release.config_digest ? <Fact label="config digest">{release.config_digest}</Fact> : null}
        </dl>
        <div className="flex min-w-[260px] flex-1 flex-col gap-1">
          {release.optimizer_defaults.groups.map((group) => (
            <span key={group.group_id} className="mono text-[10px] leading-[1.6]" data-default-group={group.group_id}>
              <span style={{ color: "var(--ink-faint)" }}>{group.group_id}</span>{" "}
              {group.fields.map((field) => (
                <span key={field.field_id} title={field.detail}>
                  {field.field_id}={Array.isArray(field.default_value) ? field.default_value.join(",") : String(field.default_value)}
                  <span style={{ color: "var(--ink-faint)" }}> {field.override_state.toLowerCase()} </span>
                </span>
              ))}
            </span>
          ))}
          {options ? (
            <span className="mono text-[10px] leading-[1.6]" data-walk-forward-options>
              <span style={{ color: "var(--ink-faint)" }}>walk-forward</span>{" "}
              frequency {options.frequency.filter((item) => item.admission === "ADMITTED").map((item) => item.value).join("/")} (default {options.frequency_default}) · window{" "}
              {options.window_mode.map((item) => `${item.value}${item.admission === "ADMITTED" ? "" : " (not admitted)"}`).join("/")}
              {options.train_window ? ` · rolling needs ${options.train_window.requested_spec_field}` : ""}
              {options.temporal_guards ? ` · guards ${options.temporal_guards.fields.join("/")} ≤ ${options.temporal_guards.maximum}` : ""}
            </span>
          ) : null}
          {release.preflight_limits ? (
            <span className="mono text-[10px] leading-[1.6]" data-preflight-limits>
              <span style={{ color: "var(--ink-faint)" }}>preflight limits</span>{" "}
              <span title={release.preflight_limits.sweep_dimension_ceiling.basis}>
                sweep dims {release.preflight_limits.sweep_dimension_ceiling.value} ({release.preflight_limits.sweep_dimension_ceiling.value_source.toLowerCase()})
              </span>
              {" · "}
              <span title={release.preflight_limits.outer_fold_ceiling.basis}>folds {release.preflight_limits.outer_fold_ceiling.value}</span>
              {" · "}
              <span title={release.preflight_limits.estimated_cpu_seconds_ceiling.basis}>
                cpu {release.preflight_limits.estimated_cpu_seconds_ceiling.value.toLocaleString("en-US")} s
              </span>
            </span>
          ) : null}
          <span className="text-[10px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
            {release.submission_constraints.reason}
          </span>
        </div>
      </div>
    </details>
  );
}

/* -------------------------------------------------------------------------
 * Location (hash)
 * ---------------------------------------------------------------------- */

/** Spec 12 §1: the hash carries tab, mode, route — plus the schedule and the run it came from. */
export interface AtlasLocation {
  tab: AtlasTab;
  mode: string | null;
  schedule: string | null;
  route: string | null;
  run: string | null;
}

const HASH_VALUE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/;

export function atlasLocationFromHash(hash: string): AtlasLocation {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const read = (key: string) => {
    const value = params.get(key);
    return value !== null && HASH_VALUE.test(value) ? value : null;
  };
  return { tab: tabFromHash(hash), mode: read("mode"), schedule: read("schedule"), route: read("route"), run: read("run") };
}

export function atlasHash(location: AtlasLocation): string {
  const params = new URLSearchParams();
  params.set("tab", location.tab);
  for (const key of ["mode", "schedule", "route", "run"] as const) {
    const value = location[key];
    if (value) params.set(key, value);
  }
  return `#${params.toString()}`;
}

/* -------------------------------------------------------------------------
 * Screen
 * ---------------------------------------------------------------------- */

/** Spec 12 §1 and the HiFi's tab labels, verbatim. */
const TAB_LABEL: Record<AtlasTab, string> = {
  modes: "WFO modes",
  routes: "Execution routes",
  claims: "Claims by contract",
};

export interface EngineAtlasProps {
  /** The published document, or null when it is not available. */
  doc: AtlasDocument | null;
  /** Resolved state for the Atlas request itself. */
  state: ResearchState;
  tab: AtlasTab;
  onTabChange: (tab: AtlasTab) => void;
  /**
   * Which release the server selected for this response (P09).
   *
   * Current versus historical is this fact and nothing else — not the presence
   * of a version string, and not whether the document happens to verify.
   */
  selectedReleaseId?: string | null;
  selectedReleaseKind?: "CURRENT" | "HISTORICAL" | null;
  /** RF02-F1: the rest of the hash — mode, schedule, route and the run it came from. */
  location?: Omit<AtlasLocation, "tab">;
  onLocationChange?: (change: Partial<Omit<AtlasLocation, "tab">>) => void;
}

export function EngineAtlas({
  doc,
  state,
  tab,
  onTabChange,
  selectedReleaseId = null,
  selectedReleaseKind = null,
  location = { mode: null, schedule: null, route: null, run: null },
  onLocationChange,
}: EngineAtlasProps) {
  const release = doc ? currentReleaseLabel(doc.current_release) : null;
  const history = doc ? historicalReleaseLabels(doc) : [];
  const [schedules, setSchedules] = useState<Record<string, string>>(() =>
    location.mode && location.schedule ? { [location.mode]: location.schedule } : {},
  );
  const onSchedule = useCallback(
    (modeId: string, schedule: string) => {
      setSchedules((previous) => ({ ...previous, [modeId]: schedule }));
      onLocationChange?.({ mode: modeId, schedule });
    },
    [onLocationChange],
  );

  return (
    <div
      data-screen="engine-atlas"
      className="flex flex-col gap-3.5 px-4 py-4"
      style={{ background: "var(--paper)", color: "var(--ink)" }}
    >
      <header
        className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2.5 border-b pb-2.5"
        style={{ borderColor: "var(--line)" }}
      >
        <div className="flex flex-col gap-[3px]">
          <nav className="flex items-center gap-1.5 text-[12px]" aria-label="Breadcrumb" data-breadcrumb>
            {location.run ? (
              <Link to={`/research/quantbt/runs/${encodeURIComponent(location.run)}/evidence`} style={{ color: "var(--accent)" }}>
                Evidence Flow
              </Link>
            ) : (
              /* Without a run there is no Evidence Flow to return to; the
                 crumb says where the Atlas sits without pretending to link. */
              <span style={{ color: "var(--ink-soft)" }} title="Open the Atlas from a run's Evidence Flow to link back to it.">
                Evidence Flow
              </span>
            )}
            <span style={{ color: "var(--ink-faint)" }}>/</span>
            <span style={{ color: "var(--ink)" }}>Engine Atlas</span>
          </nav>
          <h1
            className="text-[22px] font-light tracking-[-.01em]"
            style={{ fontFamily: "Newsreader, Georgia, serif" }}
          >
            Engine Atlas
          </h1>
          <p
            className="text-[13.5px] italic"
            style={{ fontFamily: "Newsreader, Georgia, serif", color: "var(--ink-faint)" }}
          >
            Reference, not a stage — modes, execution routes, and what each contract may claim.
            {doc ? ` Read from ${doc.current_release.release_id}.` : ""}
          </p>
        </div>

        {release || selectedReleaseId ? (
          <div className="flex flex-col items-end gap-[3px]">
            {selectedReleaseId ? (
              <span
                className="mono rounded-[3px] border px-[5px] text-[9px] font-bold leading-[15px]"
                data-selected-release={selectedReleaseId}
                data-selected-kind={selectedReleaseKind ?? undefined}
                style={{
                  color:
                    selectedReleaseKind === "HISTORICAL"
                      ? "var(--role-holdout)"
                      : "var(--ink-soft)",
                  borderColor:
                    selectedReleaseKind === "HISTORICAL"
                      ? "var(--role-holdout)"
                      : "var(--line-strong)",
                }}
              >
                {selectedReleaseKind ?? "SELECTED"} · {selectedReleaseId}
              </span>
            ) : null}
            {/* A retained historical identity is not a promise that it runs,
                so the kind is stated rather than left to the version string. */}
            {selectedReleaseKind === "HISTORICAL" ? (
              <span
                className="text-[10px]"
                style={{ color: "var(--role-holdout)" }}
                data-historical-note
              >
                Historical identity retained — this release is not installed and cannot run.
              </span>
            ) : null}
            {release ? (
              <span
                className="mono text-[10px]"
                data-release-verified={release.verified}
                style={{ color: release.isSafeState ? "var(--ink-soft)" : "var(--ink)" }}
              >
                {release.text}
              </span>
            ) : null}
            {history.map((label) => (
              <span key={label} className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
                {label}
              </span>
            ))}
            {location.run ? (
              <Link
                data-header-search
                to={`/research/quantbt/runs/${encodeURIComponent(location.run)}/search#${encodeInspectionCursor({ stage: "search", mode: location.mode ?? undefined, schedule: location.schedule ?? undefined })}`}
                className="mono mt-1 rounded-[4px] border px-2 py-1 text-[10px]"
                style={{ color: "var(--accent)", borderColor: "var(--accent)" }}
              >Open search &amp; selection →</Link>
            ) : null}
          </div>
        ) : null}
      </header>

      {/* A pre-P10 document carries no release facts; nothing is drawn for it. */}
      {doc?.current_release.submission_constraints && doc.current_release.optimizer_defaults ? (
        <ReleaseFacts release={doc.current_release} />
      ) : null}

      <div
        className="flex gap-1 self-start rounded-[6px] border p-[5px]"
        style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
        role="tablist"
        aria-label="Engine Atlas sections"
      >
        {ATLAS_TABS.map((candidate, index) => {
          const selected = candidate === tab;
          return (
            <button
              key={candidate}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              data-tab={candidate}
              onClick={() => onTabChange(candidate)}
              onKeyDown={(event) => {
                const next = event.key === "ArrowRight" ? (index + 1) % ATLAS_TABS.length
                  : event.key === "ArrowLeft" ? (index + ATLAS_TABS.length - 1) % ATLAS_TABS.length
                    : event.key === "Home" ? 0 : event.key === "End" ? ATLAS_TABS.length - 1 : -1;
                if (next < 0) return;
                event.preventDefault();
                onTabChange(ATLAS_TABS[next]!);
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
              }}
              className="rounded-[5px] px-3.5 py-[5px] text-[11.5px] font-medium"
              style={{
                background: selected ? "var(--accent-soft)" : "transparent",
                color: selected ? "var(--accent)" : "var(--ink-soft)",
              }}
            >
              {TAB_LABEL[candidate]}
            </button>
          );
        })}
      </div>

      <ResearchPanel
        variant="plain"
        title={`atlas · ${tab}`}
        meta={doc ? `manifest revision ${doc.manifest_revision}` : undefined}
        state={state}
        minBodyHeight={160}
      >
        {doc ? (
          <div role="tabpanel" aria-label={TAB_LABEL[tab]}>
            {tab === "routes" ? (
              <RoutesTab
                doc={doc}
                selectedRoute={location.route}
                onRoute={(route) => onLocationChange?.({ route })}
              />
            ) : null}
            {tab === "claims" ? <ClaimsTab doc={doc} /> : null}
            {tab === "modes" ? (
              <ModesTab doc={doc} schedules={schedules} onSchedule={onSchedule} runId={location.run} />
            ) : null}
          </div>
        ) : null}
      </ResearchPanel>
    </div>
  );
}

export { routeDisplay };
