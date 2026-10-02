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

import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { Formula } from "./Formula";
import type { AtlasResponse } from "./foundationClient";
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
import { claimToken, groupDecimalString, shortId } from "./researchFormat";
import type { ResearchState } from "./state";

/** The identity a HISTORICAL atlas response serves in place of the document (CG-FG-S12-01). */
export type AtlasHistoricalIdentity = NonNullable<AtlasResponse["historical_identity"]>;

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

/**
 * D9 (Unified 13.4.1 E-D, 12-5): the HiFi's compact card — one line per
 * route (route · status · family · contract · backend · report levels ·
 * portal). A blocked route's refusal reason is its portal cell and wraps
 * inside it, never truncated. The four axis chips (D-1), the input class and
 * the engine facts open under the row when it is selected (hash `route=`),
 * so every fact keeps its place without fourteen multi-line blocks.
 */
const ROUTE_COLUMNS = [
  { key: "route", width: 164 },
  { key: "status", width: 84 },
  { key: "family", width: 72 },
  { key: "contract", width: 156 },
  { key: "backend", width: 136 },
  { key: "report levels", width: 176 },
] as const;

/** Tone of the server's status word (spec 12 §3; derived server-side, CG-P04-06). */
export function statusTone(word: string | null | undefined): { color: string; dashed: boolean } {
  if (!word) return { color: "var(--ink-faint)", dashed: true };
  if (word === "DEFAULT") return { color: "var(--good)", dashed: false };
  if (word === "DEFERRED") return { color: "var(--bad)", dashed: true };
  if (word === "SUPPORTED") return { color: "var(--accent)", dashed: false };
  return { color: "var(--accent-2)", dashed: false };
}

/* F2b: the long wording is the tooltip; the row carries the short token. */
const METHOD_TITLE: Record<string, string> = {
  wfo: "Strategy-param route — walk-forward search applies.",
  tape: "Tape-driven — single-pass replay; the walk-forward step collapses to the tape span.",
  single_pass: "Single pass — the engine lists no walk-forward target for this route.",
};

/** F2b: the walk-forward word the engine facts publish, carried by the status badge's tooltip only. */
export function routeStatusTitle(word: string | null, facts: { walk_forward_status: string } | null): string {
  const wf = facts ? `walk-forward: ${facts.walk_forward_status}` : "walk-forward: not published";
  return word ? `${word} · ${wf}` : `no engine facts for this route · ${wf}`;
}

const METHOD_LABEL: Record<string, string> = {
  wfo: "walk-forward",
  tape: "tape · single pass",
  single_pass: "single pass",
};

type EngineFacts = NonNullable<AtlasDocument["routes"][number]["engine_facts"]>;

function RouteEngineDetail({ routeId, facts }: { routeId: string; facts: EngineFacts }) {
  const matrix = facts.support_matrix ?? null;
  const params = facts.route_params ?? null;
  return (
    <div className="flex w-full flex-col gap-1.5" data-route-engine={routeId}>
      <span className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink)" }} data-route-description={routeId}>
        {facts.description}
      </span>
      <span className="mono text-[9.5px]" style={{ color: "var(--ink-soft)" }} data-route-method={facts.method} title={`${METHOD_TITLE[facts.method] ?? facts.method} ${facts.method_basis}`}>
        {METHOD_LABEL[facts.method] ?? facts.method}
      </span>
      {matrix ? (
        <div className="flex flex-col" data-support-matrix={matrix.function}>
          <span className="mono text-[9px] uppercase tracking-[.06em]" style={{ color: "var(--ink-soft)" }}>
            {matrix.function}() · {matrix.executable}/{matrix.total} executable
          </span>
          {matrix.rows.map((row) => (
            <span
              key={row.spec_id}
              className="mono flex flex-wrap gap-x-2 text-[9.5px]"
              data-support-row={row.spec_id}
              data-support-status={row.status}
              style={{ color: "var(--ink-soft)" }}
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
                  <span className="mono text-[9.5px]" style={{ color: "var(--ink-soft)" }}>
                    form: {field.requested_spec_values.map((value) => (field.accepted_by_engine.includes(value) ? value : `${value}✕`)).join(" · ")}
                  </span>
                ) : null}
                <span className="text-[9.5px]" style={{ color: "var(--ink-soft)" }}>{field.note}</span>
              </div>
            ))}
          </div>
        </details>
      ) : null}
      <Locators sources={facts.source} />
    </div>
  );
}

/** The support-matrix functions the manifest names, for the card's source line (HiFi: `arbitrage_support_matrix() · …`). */
function supportFunctions(doc: AtlasDocument): string[] {
  const names: string[] = [];
  for (const route of doc.routes) {
    const name = route.engine_facts?.support_matrix?.function;
    if (name) names.push(name);
  }
  return [...new Set(names)];
}

/** The HiFi's card frame for the routes and claims tabs: a title row, a mono source line, the body and a foot. */
function TabCard({ title, source, foot, children, name }: { title: string; source: ReactNode; foot?: ReactNode; children: ReactNode; name: string }) {
  return (
    <section className="rounded-[6px] border" style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }} data-tab-card={name} aria-label={title}>
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-b px-3 py-2" style={{ borderColor: "var(--line)" }}>
        <h2 className="m-0 text-[10px] font-medium uppercase tracking-[.07em]" style={{ color: "var(--ink-soft)" }}>
          {title}
        </h2>
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-soft)" }} data-tab-card-source>
          {source}
        </span>
      </div>
      {children}
      {foot ? (
        <p className="m-0 border-t px-3 py-[7px] text-[10px]" style={{ borderColor: "var(--line-soft)", color: "var(--ink-soft)" }}>
          {foot}
        </p>
      ) : null}
    </section>
  );
}

function RoutesTab({
  doc,
  selectedRoute = null,
  onRoute,
}: {
  doc: AtlasDocument;
  selectedRoute?: string | null;
  onRoute?: (route: string | null) => void;
}) {
  const rows = useMemo(() => allRouteDisplays(doc), [doc]);
  const tableRef = useRef<HTMLDivElement>(null);
  const functions = supportFunctions(doc);
  useEffect(() => {
    if (!selectedRoute) return;
    const selected = [...(tableRef.current?.querySelectorAll<HTMLElement>("[data-route]") ?? [])]
      .find((row) => row.dataset.route === selectedRoute);
    if (typeof selected?.scrollIntoView === "function") selected.scrollIntoView({ block: "center", behavior: "auto" });
  }, [selectedRoute, rows]);
  return (
    <TabCard
      name="routes"
      title="execution routes"
      source={functions.length ? functions.map((name) => `${name}()`).join(" · ") : "no support matrix published by this manifest"}
    >
      <div ref={tableRef}>
        <div
          className="mono hidden flex-wrap border-b px-3 py-[5px] text-[9.5px] uppercase tracking-[.06em] min-[900px]:flex"
          style={{ borderColor: "var(--line-soft)", color: "var(--ink-soft)" }}
          aria-hidden="true"
        >
          {ROUTE_COLUMNS.map((column) => (
            <span key={column.key} style={{ width: column.width, flex: "none" }}>
              {column.key}
            </span>
          ))}
          <span style={{ flex: 1 }}>portal</span>
        </div>

        {rows.map((row) => {
          const route = doc.routes.find((r) => r.route_id === row.routeId);
          const word = route?.status_word ?? null;
          const tone = statusTone(word);
          const resolved = route?.engine_facts?.resolved_backend ?? null;
          const facts = route?.engine_facts ?? null;
          const open = row.routeId === selectedRoute;
          return (
            <div
              key={row.routeId}
              data-route={row.routeId}
              data-admitted={row.admitted}
              data-selected={open || undefined}
              aria-current={open ? "true" : undefined}
              className="flex flex-col border-b px-3 py-[6px]"
              style={{
                borderColor: open ? "var(--accent)" : "var(--line-soft)",
                /* The selected row keeps white ground: gold/green chips on --accent-soft read < 4.5:1 (axe). */
                boxShadow: open ? "inset 3px 0 0 var(--accent)" : undefined,
              }}
            >
              <div className="flex flex-wrap items-baseline gap-y-0.5">
                <span className="mono text-[11px] font-semibold" style={{ width: ROUTE_COLUMNS[0].width, flex: "none" }}>
                  <span
                    aria-hidden="true"
                    data-route-dot={row.admitted ? "admitted" : "blocked"}
                    className="mr-1.5 inline-block h-[7px] w-[7px] rounded-full align-middle"
                    style={{ background: row.admitted ? tone.color : "transparent", border: `1.5px ${row.admitted ? "solid" : "dashed"} ${tone.color}` }}
                  />
                  <button
                    type="button"
                    className="mono text-left font-semibold"
                    onClick={() => onRoute?.(open ? null : row.routeId)}
                    data-route-link={row.routeId}
                    aria-expanded={open}
                    title={open ? "selected — click again to close its axes and engine facts" : "select this route: open its four axes and engine facts"}
                    style={{ color: row.admitted ? "var(--ink)" : "var(--ink-soft)" }}
                  >
                    {row.routeId}
                  </button>
                </span>
                <span style={{ width: ROUTE_COLUMNS[1].width, flex: "none" }}>
                  {word ? (
                    <span
                      className="mono rounded-[3px] border px-[5px] text-[9px] font-bold leading-[15px]"
                      style={{ color: tone.color, borderColor: tone.color, borderStyle: tone.dashed ? "dashed" : "solid" }}
                      data-status-word={word}
                      title={routeStatusTitle(word, facts)}
                    >
                      {word}
                    </span>
                  ) : (
                    /* An older manifest has no engine facts: say so, never a dash. */
                    <span className="mono text-[8.5px] italic" style={{ color: "var(--ink-soft)" }} data-status-word="none" title={routeStatusTitle(null, facts)}>
                      not published
                    </span>
                  )}
                </span>
                <span className="mono text-[10px]" style={{ width: ROUTE_COLUMNS[2].width, flex: "none", color: "var(--ink-soft)" }}>
                  {row.family}
                </span>
                <span className="mono text-[10px]" style={{ width: ROUTE_COLUMNS[3].width, flex: "none", color: "var(--ink-soft)" }}>
                  {route?.execution_contract}
                </span>
                <span
                  className="mono text-[10px]"
                  style={{ width: ROUTE_COLUMNS[4].width, flex: "none", color: "var(--ink-soft)" }}
                  data-resolved-backend={resolved?.state ?? "catalog"}
                  title={resolved?.reason ?? (resolved?.engine_mode ? `engine mode ${resolved.engine_mode}` : undefined)}
                >
                  {resolved?.state === "RESOLVED" ? resolved.value : resolved?.state === "SPEC_DEPENDENT" ? "spec-dependent" : row.backendLabel}
                </span>
                <span className="mono pr-2 text-[10px]" style={{ width: ROUTE_COLUMNS[5].width, flex: "none", color: "var(--ink-soft)" }}>
                  {route?.report_levels.join(" · ")}
                </span>
                {/* The portal cell: the declare link for an admitted route, else the engine's refusal reason in full (spec 12 §3). */}
                <span className="min-w-[min(240px,100%)] flex-1 text-[10px] leading-[1.45]" style={{ color: "var(--ink-soft)" }}>
                  {row.admitted ? (
                    <Link
                      to={`/research/quantbt/runs/new?step=route&route=${encodeURIComponent(row.routeId)}`}
                      className="mono text-[10px] font-semibold"
                      style={{ color: "var(--accent)" }}
                      data-declare-route={row.routeId}
                    >
                      declare →
                    </Link>
                  ) : null}
                  <span data-route-reason={row.routeId} className={row.admitted ? "sr-only" : undefined}>
                    {row.admitted ? ` — ${row.reason}` : row.reason}
                  </span>
                </span>
              </div>
              {/* The four axes (D-1), the input class and the engine facts: in the row, open when it is selected. */}
              <div className={`${open ? "flex" : "hidden"} flex-col gap-1.5 pt-1.5 min-[900px]:pl-[164px]`} hidden={!open} data-route-detail={row.routeId}>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <AxisChips route={row} />
                  <span className="mono text-[10px]" data-input-class={row.routeId} style={{ color: "var(--ink-soft)" }}>
                    {route?.required_input_class}
                  </span>
                </div>
                {facts ? <RouteEngineDetail routeId={row.routeId} facts={facts} /> : null}
              </div>
            </div>
          );
        })}
      </div>
    </TabCard>
  );
}

/* -------------------------------------------------------------------------
 * Tab: claims
 * ---------------------------------------------------------------------- */

/** The certification level with its word (12-6): `L2 · ENGINE_CAUSAL`, both from the manifest. */
function certText(claim: AtlasDocument["claims"][number]): string {
  return claim.qualifier ? `${claim.engine_certification} · ${claim.qualifier.level_name}` : claim.engine_certification;
}

function ClaimsTab({ doc }: { doc: AtlasDocument }) {
  return (
    <TabCard
      name="claims"
      title="claims by contract"
      source="engine cert ⊥ methodology claim (mode × schedule)"
      foot={
        <>
          <span className="mono">certificate = min(engine cert, methodology cap, artifact completeness)</span>
        </>
      }
    >
      <div
        className="mono hidden flex-wrap border-b px-3 py-[5px] text-[9.5px] uppercase tracking-[.06em] min-[900px]:flex"
        style={{ borderColor: "var(--line-soft)", color: "var(--ink-soft)" }}
        aria-hidden="true"
      >
        <span style={{ width: 216, flex: "none" }}>execution contract</span>
        <span style={{ width: 150, flex: "none" }}>engine cert</span>
        <span style={{ width: 300, flex: "none" }}>numeric guarantee</span>
        <span style={{ flex: 1 }}>never claims</span>
      </div>
      {doc.claims.map((claim) => (
        <div key={claim.contract_id} data-contract={claim.contract_id} className="flex flex-col gap-0.5 border-b px-3 py-[6px]" style={{ borderColor: "var(--line-soft)" }}>
          <div className="flex flex-wrap items-baseline gap-y-0.5">
            <span className="mono text-[11px] font-semibold" style={{ width: 216, flex: "none" }}>
              {claim.contract_id}
            </span>
            <span className="mono text-[10px] font-bold" style={{ width: 150, flex: "none", color: "var(--accent)" }} title="engine certification ceiling for this contract">
              {certText(claim)}
            </span>
            <span className="min-w-[min(240px,100%)] text-[10.5px] leading-[1.5] min-[900px]:w-[300px] min-[900px]:flex-none min-[900px]:pr-3.5" style={{ color: "var(--ink-soft)" }}>
              {claim.numeric_guarantee}
            </span>
            {/* HiFi: the never-claims column in gold (on white it reads ≥ 4.5:1, VD-P20-30's rule). */}
            <span className="min-w-[min(240px,100%)] flex-1 text-[10.5px] leading-[1.5]" style={{ color: "var(--accent-2)" }} data-never-claims={claim.contract_id}>
              {claim.never_claims}
            </span>
          </div>
          {claim.qualifier ? (
            <span
              className="mono text-[9.5px] leading-[1.5] [overflow-wrap:anywhere]"
              style={{ color: "var(--ink-soft)" }}
              data-claim-qualifier={claim.qualifier.result_metadata_derivation}
              title={
                claim.qualifier.result_metadata_derivation === "ENGINE_DERIVES_SAME_LEVEL"
                  ? "certify_result_metadata derives the same level as the catalog."
                  : claim.qualifier.result_metadata_derivation === "ENGINE_DERIVES_OTHER_LEVEL"
                    ? `certify_result_metadata derives L${claim.qualifier.result_metadata_level}; the catalog level is the Portal record.`
                    : "certify_result_metadata has no branch for this contract; the catalog level is the Portal record."
              }
            >
              {claim.qualifier.level_description} ·{" "}
              {/* E1: the engine's certification token is printed as a token (`CLOSE_TARGET_CERTIFIED`), never as prose. */}
              {claim.qualifier.result_metadata_derivation === "ENGINE_DERIVES_SAME_LEVEL"
                ? `certify_result_metadata = ${claimToken(claim.qualifier.result_metadata_status ?? "not published")}`
                : claim.qualifier.result_metadata_derivation === "ENGINE_DERIVES_OTHER_LEVEL"
                  ? `certify_result_metadata ≠ L${claim.qualifier.result_metadata_level} ${claimToken(claim.qualifier.result_metadata_status ?? "not published")}`
                  : "certify_result_metadata — no branch"}
            </span>
          ) : null}
        </div>
      ))}
    </TabCard>
  );
}

/* -------------------------------------------------------------------------
 * Tab: modes
 * ---------------------------------------------------------------------- */

/** Claim tone by what the chronological claim says (spec 12 §7 chip colours). */
function claimTone(claim: string): { color: string; border: string } {
  if (claim.startsWith("strict")) return { color: "var(--good)", border: "var(--good)" };
  if (claim.startsWith("selection_adjusted")) return { color: "var(--accent-2)", border: "var(--accent-2)" };
  return { color: "var(--bad)", border: "var(--bad)" };
}

function Locators({ sources }: { sources: readonly AtlasSourceLocator[] }) {
  return (
    <span className="mono text-[9px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-fact-source>
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
      <span className="mono text-[9px] font-bold uppercase tracking-[.06em]" style={{ color: "var(--ink-soft)" }}>
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
  if (state === "WITHHELD_UNTIL_S4") return "var(--ink-soft)";
  return "var(--bad)";
}

/** HiFi column 3 · SCHEDULE → CLAIM: the claim pair, the OOS state, then the rest of the facts under one disclosure. */
function ScheduleClaim({ fact }: { fact: AtlasScheduleFact }) {
  const tone = claimTone(fact.chronological_validation_claim);
  return (
    <div className="flex flex-col gap-1.5" data-schedule-claim={fact.schedule}>
      <span className="mono flex flex-col gap-0.5 text-[10.5px]">
        <span className="border-l-2 pl-1.5" style={{ borderColor: tone.border, color: tone.color }} data-claim={fact.chronological_validation_claim}>
          {fact.chronological_validation_claim}
        </span>
        <span style={{ color: "var(--ink-soft)" }}>validation {fact.validation_claim}</span>
      </span>
      {fact.oos_use_state ? (
        <span
          className="mono self-start rounded-[3px] border px-[6px] text-[10px] font-semibold leading-[16px]"
          style={{ color: oosStateColor(fact.oos_use_state), borderColor: oosStateColor(fact.oos_use_state) }}
          data-oos-state={fact.oos_use_state}
        >
          {OOS_STATE_LABEL[fact.oos_use_state] ?? fact.oos_use_state}
        </span>
      ) : null}
      {fact.required_request_fields && fact.required_request_fields.length > 0 ? (
        <span className="text-[10px]" style={{ color: "var(--ink-soft)" }} data-required-fields={fact.schedule}>
          <span title="Requested-spec v2 fields; preflight refuses the run without them." className="cursor-help">needs</span>{" "}
          <span className="mono">{fact.required_request_fields.join(", ")}</span>
        </span>
      ) : null}
      <details className="text-[10.5px]" data-claim-facts={fact.schedule}>
        <summary className="mono cursor-pointer text-[9.5px]" style={{ color: "var(--accent)" }}>
          causality, OOS use, params, cert cap
        </summary>
        <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-0.5">
          <dt className="mono text-[9px] uppercase tracking-[.06em]" style={{ color: "var(--ink-soft)" }}>causality</dt>
          <dd className="mono min-w-0 text-[10px] [overflow-wrap:anywhere]">{fact.causality_claim} · {fact.causality_schedule_v2}</dd>
          <dt className="mono text-[9px] uppercase tracking-[.06em]" style={{ color: "var(--ink-soft)" }}>outer OOS</dt>
          <dd className="min-w-0 text-[10.5px] [overflow-wrap:anywhere]" data-oos-use={fact.oos_use}>
            {fact.oos_use === "USED" ? "feeds selection" : "does not feed selection"}
            {fact.oos_use_condition ? <span style={{ color: "var(--ink-soft)" }}> — {fact.oos_use_condition}</span> : null}
          </dd>
          <dt className="mono text-[9px] uppercase tracking-[.06em]" style={{ color: "var(--ink-soft)" }}>params</dt>
          <dd className="mono min-w-0 text-[10px] [overflow-wrap:anywhere]">{fact.params_semantics}</dd>
          <dt className="mono text-[9px] uppercase tracking-[.06em]" style={{ color: "var(--ink-soft)" }}>cert cap</dt>
          <dd className="min-w-0 [overflow-wrap:anywhere]">
            <NotPublished fact={fact.cert_cap} label="cert_cap" />
          </dd>
        </dl>
        <Locators sources={fact.source} />
      </details>
    </div>
  );
}

/**
 * 12-2: the stage that governs selection opens the column — the OOS candidate
 * selection when the mode has one, else the IS search (IS-only modes). The
 * other stages, the coefficients' notes, the weights and every source locator
 * sit under one disclosure. The formula text is the engine's (RF-02 #5).
 */
const TERMS_SHOWN = 4;

export function governingStage<T extends { stage: string }>(stages: readonly T[]): T | null {
  return stages.find((stage) => stage.stage === "oos_candidate_selection") ?? stages.find((stage) => stage.stage === "is_search") ?? stages[0] ?? null;
}

/**
 * RF-04: the symbol gutter is measured against the symbols the manifest
 * actually publishes, not against the HiFi's sample.
 *
 * The HiFi's four terms are names — `S̄_OOS`, `λ·σ_d` — so a fixed 140 px
 * gutter fits them. QuantBT 1.1.1 publishes whole expressions: 108 characters
 * of `plateau_score = q + plateau_median_weight * median - …`. In 140 px that
 * broke over seven lines beside a three-line meaning, so the row cost 97 px to
 * carry 46 px of reading. The gutter is sized in `ch` of the mono face from
 * the longest symbol on the card, floored at the HiFi's own width and capped
 * so the meaning always keeps the larger half of the column.
 */
const GUTTER_MIN_CH = 23;
const GUTTER_MAX_CH = 42;

/**
 * The gutter for a set of terms, in `ch` of the mono face, or `null` when the
 * gutter has stopped paying for itself.
 *
 * Past `GUTTER_MAX_CH` the gutter is no longer a label column: it takes half
 * the width and the symbol still wraps, so both halves wrap and the row costs
 * the sum of two wrapped blocks instead of the taller of them. There the
 * symbol takes a full-width line of its own with the meaning under it.
 */
export function symbolGutterCh(terms: readonly { symbol: string }[]): number | null {
  const longest = terms.reduce((width, term) => Math.max(width, term.symbol.length), 0);
  if (longest > GUTTER_MAX_CH) return null;
  return Math.max(longest, GUTTER_MIN_CH);
}

type AtlasObjectiveTerm = NonNullable<AtlasObjectiveFact["terms"]>[number];

/** One term row: the engine's symbol in the measured gutter, or stacked above its meaning. */
function TermRow({ term, gutter }: { term: AtlasObjectiveTerm; gutter: number | null }) {
  const title = term.source.map((item) => `${item.path}:${item.lines} sha256 ${item.sha256}`).join("\n");
  if (gutter === null) {
    return (
      <span
        className="flex flex-col border-b py-[2px] text-[10.5px]"
        style={{ borderColor: "var(--line-soft)" }}
        data-objective-term={term.symbol}
        data-term-layout="stacked"
        title={title}
      >
        <span className="mono text-[10px]" style={{ color: "var(--ink)", overflowWrap: "anywhere" }}>
          {term.symbol}
        </span>
        {/* Indented so the expression still reads as the row's key and the
            meaning as its value, the way the gutter says it in the other cards. */}
        <span className="pl-2.5 leading-[1.45]" style={{ color: "var(--ink-soft)" }}>
          {term.meaning}
        </span>
      </span>
    );
  }
  return (
    <span
      className="flex items-baseline gap-2 border-b py-[2px] text-[10.5px]"
      style={{ borderColor: "var(--line-soft)" }}
      data-objective-term={term.symbol}
      data-term-layout="gutter"
      title={title}
    >
      <span
        className="mono flex-none text-[10px]"
        style={{ width: `${gutter}ch`, maxWidth: "48%", color: "var(--ink)", overflowWrap: "anywhere" }}
      >
        {term.symbol}
      </span>
      <span className="min-w-0 flex-1 leading-[1.45]" style={{ color: "var(--ink-soft)" }}>
        {term.meaning}
      </span>
    </span>
  );
}

function ObjectiveBlock({ facts }: { facts: AtlasModeFacts }) {
  if (!isPublished<AtlasObjectiveFact>(facts.objective)) {
    return <NotPublished fact={facts.objective} label="objective" />;
  }
  const objective = facts.objective;
  const lead = governingStage(objective.stages);
  const rest = objective.stages.filter((stage) => stage !== lead);
  const terms = objective.terms ?? [];
  /* D9: the HiFi shows up to four terms beside the formula; the rest are counted and open with the other stages. */
  const shownTerms = terms.slice(0, TERMS_SHOWN);
  const moreTerms = terms.slice(TERMS_SHOWN);
  const gutter = symbolGutterCh(shownTerms);
  /* RF-04: the disclosure summary names the cap it applies — "4 of 7 terms",
     never a silent slice — and every other thing it holds, on one line. */
  const opens = [
    terms.length === 0
      ? null
      : moreTerms.length > 0
        ? `${shownTerms.length} of ${terms.length} terms`
        : `all ${terms.length} ${terms.length === 1 ? "term" : "terms"} shown`,
    rest.length > 0 ? `${rest.length} more ${rest.length === 1 ? "stage" : "stages"}` : null,
    objective.weights && objective.weights.length > 0 ? "weights" : null,
    "selection metric",
    "sources",
  ].filter((part): part is string => part !== null);
  return (
    <div className="flex flex-col gap-1" data-objective>
      {lead ? (
        <div className="flex flex-col overflow-x-auto border-l-2 py-0.5 pl-2.5" style={{ borderColor: "var(--accent)" }} data-objective-lead={lead.stage}>
          <Formula formula={lead.formula} />
        </div>
      ) : null}
      {shownTerms.length > 0 ? (
        <div className="flex flex-col" data-objective-term-table>
          {shownTerms.map((term) => (
            <TermRow key={term.symbol} term={term} gutter={gutter} />
          ))}
        </div>
      ) : null}
      {objective.coefficients.length > 0 ? (
        <span className="mono text-[10px]" style={{ color: "var(--ink-soft)" }} data-objective-terms>
          {objective.coefficients.map((coefficient, index) => (
            <span key={coefficient.name} title={coefficient.note ?? "release default"}>
              {index > 0 ? " · " : ""}
              {coefficient.name}
              {" "}
              {coefficient.release_default ?? "unset"}
            </span>
          ))}
        </span>
      ) : null}
      <details className="text-[10px]" data-objective-more>
        <summary className="mono cursor-pointer text-[9.5px]" style={{ color: "var(--accent)" }} data-objective-cap={moreTerms.length > 0 ? `${shownTerms.length}/${terms.length}` : undefined}>
          {opens.join(" · ")}
        </summary>
        <div className="mt-1 flex flex-col gap-1.5">
          {moreTerms.length > 0 ? (
            <div className="flex flex-col" data-objective-term-table-more>
              {moreTerms.map((term) => (
                <TermRow key={term.symbol} term={term} gutter={symbolGutterCh(moreTerms)} />
              ))}
            </div>
          ) : null}
          {rest.map((stage) => (
            <div key={stage.stage} className="flex flex-col gap-0.5 overflow-x-auto" data-objective-stage={stage.stage}>
              <span className="mono text-[9px]" style={{ color: "var(--ink-soft)" }}>
                {stage.stage} · {stage.formula_id} · {objective.direction}
              </span>
              <Formula formula={stage.formula} />
            </div>
          ))}
          {lead ? (
            <span className="mono text-[9px]" style={{ color: "var(--ink-soft)" }}>
              {lead.stage} formula id {lead.formula_id}
            </span>
          ) : null}
          {objective.weights && objective.weights.length > 0 ? (
            <table className="text-[10px]" data-objective-weights>
              <thead>
                <tr className="mono text-[8.5px] uppercase tracking-[.06em]" style={{ color: "var(--ink-soft)" }}>
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
          {objective.coefficients.some((coefficient) => coefficient.note) ? (
            <span className="text-[10px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
              {objective.coefficients.filter((coefficient) => coefficient.note).map((coefficient) => `${coefficient.name}: ${coefficient.note}`).join(" · ")}
            </span>
          ) : null}
          <span className="mono text-[9.5px]" style={{ color: "var(--ink-soft)" }}>
            selection metric {objective.selection_metrics.join(" · ")}
          </span>
          {objective.note ? <span className="text-[10px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>{objective.note}</span> : null}
          {objective.terms && objective.terms.length > 0 ? (
            <span className="mono text-[9px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-fact-source>
              source{" "}
              {objective.terms.flatMap((term) => term.source).map((item, index) => `${index > 0 ? " · " : ""}${item.path}:${item.lines}`).join("")}
            </span>
          ) : null}
          <Locators sources={objective.source} />
        </div>
      </details>
    </div>
  );
}

/** What the Atlas knows about the run it was opened from (12-3), read by the route from the run's progress identity. */
export type AtlasRunCell =
  | { state: "known"; mode: string | null; schedule: string | null }
  | { state: "loading" }
  | { state: "absent"; reason: string };

/**
 * F3 7_root: the HiFi's "what it reads" strip, drawn from the SERVED `reads.selection_inputs`
 * (one cell per input; the server's token is the tooltip). The cell's look is chosen by the
 * token's name only: nothing is invented, and an input the strip cannot classify is a plain cell.
 */
export type ReadsGlyphKind = "oos" | "ghost" | "plateau" | "is" | "other";

export function readsGlyphKind(input: string): ReadsGlyphKind {
  if (/oos/.test(input)) return "oos";
  if (/bootstrap|replicate/.test(input)) return "ghost";
  if (/plateau|coordinate/.test(input)) return "plateau";
  if (/^(full_)?is_|_is_|^is_/.test(input)) return "is";
  return "other";
}

const GLYPH_STYLE: Record<ReadsGlyphKind, { width: number; style: CSSProperties }> = {
  is: { width: 34, style: { background: "var(--accent-soft)", border: "1px solid var(--accent)" } },
  oos: {
    width: 14,
    style: { background: "repeating-linear-gradient(135deg, var(--accent-2-soft) 0 3px, transparent 3px 6px)", border: "1px solid var(--accent-2)" },
  },
  ghost: { width: 34, style: { background: "transparent", border: "1px dashed var(--accent)" } },
  plateau: { width: 34, style: { background: "var(--paper-sunken)", border: "1px solid var(--line-strong)" } },
  other: { width: 20, style: { background: "var(--paper-raised)", border: "1px solid var(--line)" } },
};

function ReadsGlyphs({ inputs }: { inputs: readonly string[] }) {
  return (
    <span className="flex w-full flex-wrap items-center gap-[3px] pb-0.5" data-reads-glyphs role="img" aria-label={`reads: ${inputs.join(", ")}`}>
      {inputs.map((input) => {
        const kind = readsGlyphKind(input);
        return (
          <span
            key={input}
            title={input}
            data-reads-glyph={kind}
            data-reads-input={input}
            className="inline-block h-[14px] rounded-[2px]"
            style={{ width: GLYPH_STYLE[kind].width, ...GLYPH_STYLE[kind].style }}
          />
        );
      })}
    </span>
  );
}

/**
 * QA UX-2: "declare" opens New Run at Optimization WITH the mode and the schedule this
 * card shows, so the reader does not choose them again. New Run validates both against
 * the same atlas before using them.
 */
export function declareModeHref(modeId: string, schedule: string): string {
  const query = new URLSearchParams({ step: "optimization", mode: modeId, schedule });
  return `/research/quantbt/runs/new?${query.toString()}`;
}

export interface ModeCardProps {
  mode: AtlasMode;
  /** The schedule whose claim is shown. Always one the mode lists. */
  schedule: string;
  onSchedule: (schedule: string) => void;
  /** A run to open Search & Selection for, when the Atlas was reached from one. */
  runId: string | null;
  /** 12-3: the run's own mode × schedule when it is known; `undefined` when the caller did not read it. */
  runCell?: AtlasRunCell;
}

export function ModeCard({ mode, schedule, onSchedule, runId, runCell }: ModeCardProps) {
  const facts = mode.facts ?? null;
  const fact = facts?.schedules.find((item) => item.schedule === schedule) ?? null;
  const known = runCell?.state === "known" ? runCell : null;
  const thisRun = runId !== null && known !== null && known.mode === mode.mode_id;
  /* 12-8: with the run's mode known, only its card opens that run's Search; the others find runs in their mode. */
  const opensSearch = runId !== null && (known === null || thisRun);
  const objective = facts && isPublished<AtlasObjectiveFact>(facts.objective) ? facts.objective : null;
  const governing = objective ? governingStage(objective.stages) : null;
  const governingDirection = objective?.direction ?? "";
  return (
    <article
      data-mode={mode.mode_id}
      data-this-run={thisRun || undefined}
      className="flex flex-col rounded-[8px] border px-4 py-3.5"
      style={{
        borderColor: thisRun ? "var(--accent)" : "var(--line)",
        background: "var(--paper-raised)",
        boxShadow: "var(--shadow-e1)",
      }}
    >
      <header className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b pb-2" style={{ borderColor: "var(--line-soft)" }}>
        <span className="mono text-[13px] font-bold">{mode.mode_id}</span>
        <span className="text-[12px]" style={{ color: "var(--ink-soft)" }}>
          {mode.display_name}
        </span>
        {/* CG-P04-05: no per-mode cap is published; the chip keeps the HiFi's place and says so. */}
        <span
          className="mono rounded-[3px] border border-dashed px-1.5 text-[9.5px] font-bold"
          style={{ borderColor: "var(--line-strong)", color: "var(--ink-soft)" }}
          title={fact && fact.cert_cap.state === "NOT_PUBLISHED" ? fact.cert_cap.reason : "no certification cap is published for this mode"}
          data-cert-cap="not-published"
        >
          no cert cap
        </span>
        {thisRun ? (
          <span className="mono text-[9px]" style={{ color: "var(--accent)" }} data-this-run-marker title={`${runId} ran ${known?.mode ?? ""} × ${known?.schedule ?? "schedule not published"}`}>
            ← this run
          </span>
        ) : null}
        <span className="ml-auto flex flex-wrap items-baseline gap-x-3">
          <Link
            to={declareModeHref(mode.mode_id, schedule)}
            className="mono text-[10px] font-semibold uppercase tracking-[.05em]"
            style={{ color: "var(--ink-soft)" }}
            data-declare-mode={mode.mode_id}
            title={`Declare a run in ${mode.mode_id} × ${schedule}`}
            aria-label={`Declare a run in ${mode.mode_id}`}
          >
            declare →
          </Link>
          {opensSearch && runId ? (
            <Link
              to={`/research/quantbt/runs/${encodeURIComponent(runId)}/search#${encodeInspectionCursor({ stage: "search", mode: mode.mode_id, schedule })}`}
              className="mono text-[10px] font-semibold uppercase tracking-[.05em]"
              style={{ color: "var(--accent)" }}
              data-open-search={mode.mode_id}
              title="Open this run's Search & Selection with this mode and schedule"
            >
              search &amp; selection →
            </Link>
          ) : (
            <Link
              to={`/research/quantbt/runs?mode=${encodeURIComponent(mode.mode_id)}`}
              className="mono text-[10px] font-semibold uppercase tracking-[.05em]"
              style={{ color: "var(--accent)" }}
              data-find-runs={mode.mode_id}
              title={known ? "Not this run's mode — find runs that ran it" : "Find runs that ran this mode"}
            >
              runs in mode →
            </Link>
          )}
        </span>
      </header>

      {/* D9 (12-1): the HiFi's three columns — WHAT IT READS · OBJECTIVE · SCHEDULE → CLAIM. */}
      {/* RF-04: the objective column carries every pixel the card is taller
          than the HiFi, while "what it reads" and "schedule → claim" sit on
          ~200 px of slack each. The engine's terms get that width back. */}
      <div className="flex flex-wrap gap-x-[18px] gap-y-3 pt-2.5">
        <div className="flex min-w-[min(236px,100%)] flex-1 flex-col gap-1.5" data-mode-column="reads">
          <span className="text-[10px] font-medium uppercase tracking-[.07em]" style={{ color: "var(--ink-soft)" }}>
            what it reads
          </span>
          {facts && isPublished<AtlasReadsFact>(facts.reads) ? (
            <span className="flex flex-wrap gap-1" data-reads>
              <ReadsGlyphs inputs={facts.reads.selection_inputs} />
              {facts.reads.selection_inputs.map((input) => (
                <span key={input} className="mono rounded-[3px] border px-[5px] text-[9.5px] leading-[16px]" style={{ borderColor: "var(--line)", color: "var(--ink)" }}>
                  {input}
                </span>
              ))}
              {/* The engine's retention names run to 51 characters and have no
                  break opportunity; without this they crossed the column rule. */}
              <span className="mono text-[9.5px] leading-[18px]" style={{ color: "var(--ink-soft)", overflowWrap: "anywhere" }}>
                retains {facts.reads.retention}
              </span>
            </span>
          ) : facts ? (
            <NotPublished fact={facts.reads as AtlasNotPublishedFact} label="reads" />
          ) : (
            <span className="text-[10.5px]" style={{ color: "var(--ink-soft)" }} title="This manifest publishes no reads for this mode.">reads — not published</span>
          )}
          <span className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
            {mode.objective_summary}
          </span>
          {/* RF-04: `when_to_use` is the "when to reach for which mode" table's
              column, as it is in the HiFi. Printing it here too said the same
              sentence twice on one screen. */}
          {mode.rules.map((rule, index) => (
            <span key={index} className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
              {rule}
            </span>
          ))}
        </div>

        <div className="flex min-w-[min(384px,100%)] flex-[2] flex-col gap-1 min-[900px]:border-l min-[900px]:pl-[18px]" style={{ borderColor: "var(--line-soft)" }} data-mode-column="objective">
          {/* RF-04: the governing stage rides the label row rather than taking
              a line of its own above the formula (12-2 keeps the fact). */}
          <span className="flex flex-wrap items-baseline gap-x-2 text-[10px] font-medium uppercase tracking-[.07em]" style={{ color: "var(--ink-soft)" }}>
            objective — Stage 2 opens every term
            {governing ? (
              <span className="mono ml-auto text-[9px] normal-case tracking-normal" data-governing-stage={governing.stage}>
                {governing.stage} · {governingDirection}
              </span>
            ) : null}
          </span>
          {facts ? <ObjectiveBlock facts={facts} /> : null}
          {/* The failure signature, from the manifest, never paraphrased. */}
          <span className="text-[10px] leading-[1.5]" style={{ color: "var(--bad)" }}>
            <span className="text-[8.5px] font-bold uppercase tracking-[.05em]">suspect</span> · <span data-suspect>{mode.suspect}</span>
          </span>
          {mode.artifact_fields.length > 0 ? (
            <span className="mono text-[9px]" style={{ color: "var(--ink-soft)" }}>
              {mode.artifact_fields.join(" · ")}
            </span>
          ) : null}
        </div>

        <div className="flex min-w-[min(236px,100%)] flex-1 flex-col gap-1.5 min-[900px]:border-l min-[900px]:pl-[18px]" style={{ borderColor: "var(--line-soft)" }} data-mode-column="claim">
          <span className="text-[10px] font-medium uppercase tracking-[.07em]" style={{ color: "var(--ink-soft)" }}>
            schedule → claim
          </span>
          <span className="flex flex-wrap gap-1" role="group" aria-label={`${mode.mode_id} schedules`}>
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
                  className="mono rounded-[3px] border px-[8px] text-[9.5px] leading-[18px]"
                  style={{
                    borderColor: selected ? "var(--accent)" : "var(--line)",
                    background: selected ? "var(--accent-soft)" : "var(--paper-raised)",
                    color: selected ? "var(--accent)" : "var(--ink-soft)",
                  }}
                >
                  {candidate}
                  {candidate === mode.default_schedule ? " · default" : ""}
                  {thisRun && known?.schedule === candidate ? " · this run" : ""}
                </button>
              ) : (
                /* Invalid schedules are struck through with the reason, never hidden. */
                <span
                  key={candidate}
                  data-schedule-invalid={candidate}
                  tabIndex={0}
                  role="note"
                  aria-disabled="true"
                  aria-label={`${candidate}: not admitted by this mode in the installed release manifest`}
                  title="Not in this mode's valid schedules in the installed release manifest."
                  className="mono rounded-[3px] border border-dashed px-[8px] text-[9.5px] leading-[18px] line-through"
                  style={{ borderColor: "var(--line)", color: "var(--ink-soft)" }}
                >
                  {candidate}
                </span>
              );
            })}
          </span>
          {fact ? (
            <ScheduleClaim fact={fact} />
          ) : (
            <span className="text-[10.5px]" style={{ color: "var(--ink-soft)" }} data-facts-unpublished title="This manifest publishes no engine facts for this mode × schedule.">
              engine facts — not published
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * RF-04: the one avoid-when sentence every mode shares is said once.
 *
 * QuantBT 1.1.1 publishes the identical `NOT_PUBLISHED` reason on all five
 * modes. As a per-row column it printed the same sentence five times and took
 * 547 px of the table's width from the column that does carry five different
 * sentences. Returns the shared fact when there is exactly one, else `null`
 * and the rows keep their own column — a manifest that publishes real,
 * different guidance is not folded into one line.
 */
export function sharedAvoidWhen(modes: readonly AtlasMode[]): AtlasNotPublishedFact | null {
  const facts = modes.map((mode) => mode.facts?.avoid_when ?? null);
  if (facts.length === 0 || facts.some((fact) => fact === null)) return null;
  const first = facts[0] as AtlasNotPublishedFact;
  if (first.state !== "NOT_PUBLISHED") return null;
  return facts.every((fact) => (fact as AtlasNotPublishedFact).state === "NOT_PUBLISHED" && (fact as AtlasNotPublishedFact).reason === first.reason)
    ? first
    : null;
}

function ModeTable({ modes }: { modes: readonly AtlasMode[] }) {
  const shared = sharedAvoidWhen(modes);
  return (
    <div className="overflow-x-auto rounded-[6px] border" style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }} data-mode-table>
      <div className="border-b px-3 py-2" style={{ borderColor: "var(--line)" }}>
        {/* QA S12: the shared "avoid when — not published" line is no visible promise; its typed absence rides here. */}
        <span
          className="text-[10px] font-medium uppercase tracking-[.07em]"
          style={{ color: "var(--ink-soft)" }}
          {...(shared ? { "data-avoid-when-shared": true, "data-avoid-when-reason": shared.reason, title: `avoid when — not published: ${shared.reason}` } : {})}
        >
          when to reach for which mode
        </span>
      </div>
      <table className="w-full border-collapse text-[12px]">
        {/* The HiFi's table carries no visible head; the columns stay named for a reader who cannot see the shape. */}
        <thead className="sr-only">
          <tr>
            <th scope="col">mode</th>
            <th scope="col">use when</th>
            {shared ? null : <th scope="col">avoid when</th>}
          </tr>
        </thead>
        <tbody>
          {modes.map((mode) => (
            <tr key={mode.mode_id} className="border-t" style={{ borderColor: "var(--line-soft)" }} data-mode-row={mode.mode_id}>
              <td className="mono px-3 py-[7px] align-top" style={{ width: 190 }}>{mode.mode_id}</td>
              <td className="px-3 py-[7px] align-top" style={{ color: "var(--ink-soft)" }}>{mode.when_to_use}</td>
              {shared ? null : (
                <td className="px-3 py-[7px] align-top">
                  {mode.facts ? (
                    <NotPublished fact={mode.facts.avoid_when} label={`avoid_when:${mode.mode_id}`} />
                  ) : (
                    <span className="mono text-[10px]" style={{ color: "var(--ink-soft)" }}>not published</span>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Rule one's worked example, as a tooltip: a manifest that names only some pairs names only those (DQ-10). */
export function ruleOneExample(doc: AtlasDocument): string {
  return doc.modes.find((mode) => mode.mode_id === "mode_1_decay")?.valid_schedules.includes("per_fold_causal")
    ? "mode_1_decay + per_fold_causal is strict outer OOS; the same mode with per_fold_decay is selection-adjusted. Click the schedule chips below and watch the claim change."
    : "mode_1_decay + per_fold_decay is selection-adjusted outer OOS; the same mode with global is a global calibration, not causal. Click the schedule chips below and watch the claim change.";
}

/** Rule two, in full, as a tooltip. */
export const RULE_TWO_TITLE =
  "Two selector layers, never mixed: optimization_mode belongs to this page; the execution route does not.";

function ModesTab({
  doc,
  schedules,
  onSchedule,
  runId,
  runCell,
}: {
  doc: AtlasDocument;
  schedules: Readonly<Record<string, string>>;
  onSchedule: (modeId: string, schedule: string) => void;
  runId: string | null;
  runCell?: AtlasRunCell;
}) {
  const known = runCell?.state === "known" ? runCell : null;
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap gap-3.5">
        {/* Q4 / D-4: gold, as the HiFi has it — a claim warning, not an accent. */}
        <div
          className="flex min-w-[min(420px,100%)] flex-[1.4] items-start gap-3 rounded-[6px] border px-3.5 py-2.5"
          style={{ borderColor: "var(--accent-2)", background: "var(--accent-2-soft)" }}
          data-rule-one
          title={ruleOneExample(doc)}
        >
          {/* D-B2 (2026-09-23): gold on gold-soft is 4.0:1, below AA for this
              size. The gold frame carries the warning; the words are ink. */}
          <span className="mono flex-none text-[10px] font-bold uppercase tracking-[.1em]" style={{ color: "var(--ink)" }}>
            rule one
          </span>
          <span className="text-[11.5px] leading-[1.55]" style={{ color: "var(--ink)" }}>
            claim = <span className="mono">mode × schedule</span>, never the mode alone
          </span>
        </div>
        <div
          className="flex min-w-[min(360px,100%)] flex-1 items-start gap-3 rounded-[6px] border px-3.5 py-2.5"
          style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
          data-rule-two
          title={RULE_TWO_TITLE}
        >
          <span className="mono flex-none text-[10px] font-bold uppercase tracking-[.1em]" style={{ color: "var(--ink-soft)" }}>
            rule two
          </span>
          {/* 12-4: the HiFi's CandidateSelector list is not published by QuantBT 1.1.1's manifest; the sentence names no layer it cannot cite. */}
          <span className="text-[11.5px] leading-[1.55]" style={{ color: "var(--ink-soft)" }}>
            Execution route is chosen separately
          </span>
        </div>
      </div>

      {runId && runCell && runCell.state !== "known" ? (
        <span className="mono text-[10px]" style={{ color: "var(--ink-soft)" }} data-this-run-absent={runCell.state}>
          {runCell.state === "loading" ? "reading this run's mode × schedule…" : `this run's mode × schedule is not published here — ${runCell.reason}`}
        </span>
      ) : null}
      {known && !doc.modes.some((mode) => mode.mode_id === known.mode) ? (
        <span className="mono text-[10px]" style={{ color: "var(--ink-soft)" }} data-this-run-outside>
          this run declared {known.mode ?? "no mode"} × {known.schedule ?? "no schedule"} — not a walk-forward mode on this page
        </span>
      ) : null}

      {doc.modes.map((mode) => {
        const chosen = schedules[mode.mode_id];
        const runSchedule = known && known.mode === mode.mode_id && known.schedule && mode.valid_schedules.includes(known.schedule) ? known.schedule : null;
        return (
          <ModeCard
            key={mode.mode_id}
            mode={mode}
            schedule={chosen && mode.valid_schedules.includes(chosen) ? chosen : (runSchedule ?? mode.default_schedule)}
            onSchedule={(schedule) => onSchedule(mode.mode_id, schedule)}
            runId={runId}
            runCell={runCell}
          />
        );
      })}

      <ModeTable modes={doc.modes} />
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Release facts
 * ---------------------------------------------------------------------- */

/** QA UX-20: a server constraint token (`MUST_BE_NULL`) read as words (`must be unset`); the token stays in the tooltip. */
export function constraintWords(token: string): string {
  return token.split("_").join(" ").toLowerCase().replace(/\bnull\b/, "unset");
}

function Fact({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="mono text-[9px] uppercase tracking-[.06em]" style={{ color: "var(--ink-faint)" }} title={hint}>{label}</dt>
      <dd className="mono min-w-0 text-[10.5px] [overflow-wrap:anywhere]">{children}</dd>
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
  /* Closed it is a chip at the end of the tab row; open it takes the row's
     full width and the tabs move above it. */
  return (
    <details
      className="max-w-full flex-none self-start rounded-[6px] border px-3 py-2"
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
      data-release-facts
      onKeyDown={(event) => {
        /* QA UX-18: Escape closes the drawer and returns focus to its summary. */
        if (event.key !== "Escape" || !event.currentTarget.open) return;
        event.currentTarget.open = false;
        event.currentTarget.querySelector("summary")?.focus();
      }}
    >
      <summary className="mono cursor-pointer text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        release facts · {release.release_id}
      </summary>
      <div className="flex flex-wrap gap-x-8 gap-y-3 pt-2">
        <dl className="grid min-w-0 max-w-full grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
          <Fact label="package">{release.package} · expected {release.expected_version}</Fact>
          <Fact label="native">
            {release.native_package ? `${release.native_package} · expected ${release.native_expected_version ?? "not declared"}` : "none declared"}
          </Fact>
          {/* E1: an exact integer is grouped as a string, never turned into a float. */}
          <Fact label="trial ceiling" hint="Most trials the engine accepts in one run">{groupDecimalString(String(release.trial_ceiling))}</Fact>
          <Fact label="profile">{release.submission_constraints.profile_id}</Fact>
          <Fact label="overrides">{release.submission_constraints.optimization_overrides}</Fact>
          <Fact label="trials per run" hint="Trials the fixed qualification profile accepts in one run">{groupDecimalString(String(release.submission_constraints.accepted_trial_count))}</Fact>
          <Fact label="early stopping">
            <span title={release.submission_constraints.early_stopping}>{constraintWords(release.submission_constraints.early_stopping)}</span>
          </Fact>
          <Fact label="random seed">
            <span title={release.submission_constraints.random_seed}>{constraintWords(release.submission_constraints.random_seed)}</span>
          </Fact>
          {/* E1: a 64-character digest wraps every row it sits in; the full value stays in the title. */}
          {release.config_digest ? (
            <Fact label="config digest">
              <span title={release.config_digest} data-config-digest={release.config_digest}>
                {shortId(release.config_digest)}
              </span>
            </Fact>
          ) : null}
        </dl>
        <div className="flex min-w-[min(260px,100%)] flex-1 flex-col gap-1">
          {release.optimizer_defaults.groups.map((group) => (
            <span key={group.group_id} className="mono text-[10px] leading-[1.6]" data-default-group={group.group_id}>
              <span style={{ color: "var(--ink-faint)" }}>{group.group_id}</span>{" "}
              {group.fields.map((field) => (
                <span key={field.field_id} title={field.detail}>
                  {/* The engine's `None` default is a fact ("unset"), never the bare token "null" (P23 matrix). */}
                  {field.field_id}=
                  {Array.isArray(field.default_value)
                    ? field.default_value.join(",")
                    : field.default_value === null
                      ? "unset"
                      : String(field.default_value)}
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
                sweep dims {groupDecimalString(String(release.preflight_limits.sweep_dimension_ceiling.value))} ({release.preflight_limits.sweep_dimension_ceiling.value_source.toLowerCase()})
              </span>
              {" · "}
              <span title={release.preflight_limits.outer_fold_ceiling.basis}>folds {groupDecimalString(String(release.preflight_limits.outer_fold_ceiling.value))}</span>
              {" · "}
              {/* E1: grouped from the exact decimal string, not through `toLocaleString` on a float. */}
              <span title={release.preflight_limits.estimated_cpu_seconds_ceiling.basis}>
                cpu {groupDecimalString(String(release.preflight_limits.estimated_cpu_seconds_ceiling.value))} s
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

/**
 * CG-FG-S12-01: the body of a response that carries no atlas document.
 *
 * An `atlas: null` read used to leave an empty panel that said "available"
 * about nothing. A historical release now says why, in the server's words: the
 * `facts_state` code and its own `facts_reason`. A response with neither a
 * document nor a served identity is an absence with no reason, because none
 * was served.
 */
function AtlasFactsAbsent({
  kind,
  identity,
}: {
  kind: "CURRENT" | "HISTORICAL" | null;
  identity: AtlasHistoricalIdentity | null;
}) {
  const what = kind === "HISTORICAL" ? "route, mode and claim facts" : "atlas";
  return (
    <div
      className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[11px]"
      style={{ color: "var(--ink-soft)" }}
      role="status"
      data-atlas-facts-absent={identity?.facts_state ?? "NOT_PUBLISHED"}
    >
      {/* With a served state the code says it; without one, the words must. */}
      {identity ? (
        /* QA S12: the server's one sentence; its state code is the tooltip, not a second line. */
        <>
          <span className="sr-only" data-facts-state>
            {identity.facts_state}
          </span>
          <span className="text-[11px] leading-[1.55]" data-facts-reason title={identity.facts_state}>
            {identity.facts_reason}
          </span>
        </>
      ) : (
        <span>{`${what} — not published`}</span>
      )}
    </div>
  );
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
  /**
   * CG-FG-S12-01: the identity a HISTORICAL response serves in place of the
   * atlas (`atlas: null`). It is the only fact the server publishes for such a
   * release, so it is drawn as served — package, version, status and the
   * server's own `facts_state` / `facts_reason` — never reworded here.
   */
  historicalIdentity?: AtlasHistoricalIdentity | null;
  /** RF02-F1: the rest of the hash — mode, schedule, route and the run it came from. */
  location?: Omit<AtlasLocation, "tab">;
  onLocationChange?: (change: Partial<Omit<AtlasLocation, "tab">>) => void;
  /** 12-3: the mode × schedule of `location.run`, as its progress identity publishes it. */
  runCell?: AtlasRunCell;
  /** V2 (2026-09-30): inside Screen 04's Atlas tab — the hub already names the screen, so no own crumb/title. */
  embedded?: boolean;
  /** F3 12-15: the failed read's request id, printed with its refusal. */
  requestId?: string | null;
  /** F3 12-15: "read again" for a read that can be repeated (unavailable / failed-retryable). */
  onRetry?: () => void;
}

export function EngineAtlas({
  doc,
  state,
  tab,
  onTabChange,
  selectedReleaseId = null,
  selectedReleaseKind = null,
  historicalIdentity = null,
  location = { mode: null, schedule: null, route: null, run: null },
  onLocationChange,
  runCell,
  embedded = false,
  requestId = null,
  onRetry,
}: EngineAtlasProps) {
  const panelId = useId();
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
      className="flex min-w-0 flex-col gap-3.5"
      style={{ background: "var(--paper)", color: "var(--ink)" }}
    >
      <header
        className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2.5 border-b pb-2.5"
        style={{ borderColor: "var(--line)" }}
      >
        {embedded ? null : (
        <div className="flex flex-col gap-[3px]">
          <nav className="flex items-center gap-1.5 text-[12px]" aria-label="Breadcrumb" data-breadcrumb>
            {location.run ? (
              <Link to={`/research/quantbt/runs/${encodeURIComponent(location.run)}/evidence`} style={{ color: "var(--accent)" }}>
                Evidence Flow
              </Link>
            ) : (
              /* Without a run there is no Evidence Flow to return to; the way
                 out is the Journey Map the Atlas is a reference page of. */
              <Link to="/research/quantbt/journey" style={{ color: "var(--accent)" }} data-crumb-journey>
                Journey Map
              </Link>
            )}
            <span style={{ color: "var(--ink-faint)" }}>/</span>
            <span style={{ color: "var(--ink)" }} aria-current="page">Engine Atlas</span>
          </nav>
          <h1
            className="text-[22px] font-light tracking-[-.01em]"
            style={{ fontFamily: "Newsreader, Georgia, serif" }}
          >
            Engine Atlas
          </h1>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-3" data-atlas-exits>
              <Link to="/research/quantbt/runs" className="mono text-[10px]" style={{ color: "var(--accent)" }} data-exit-library title="Run Library">
                Run Library →
              </Link>
              <Link to="/research/quantbt/runs/new?step=route" className="mono text-[10px]" style={{ color: "var(--accent)" }} data-exit-new-run title="Declare a run: New Run at the Route step">
                New Run →
              </Link>
            </span>
        </div>
        )}

        {release || selectedReleaseId ? (
          /* 12-9: right-aligned beside the title at desktop width, stacked left under it at 660.
             RF-04: the release identity is one wrapped row, not four stacked lines. */
          <div className="flex flex-col items-start gap-[3px] min-[900px]:items-end">
            <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-[3px] min-[900px]:justify-end">
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
            {release ? (
              <span
                className="mono text-[10px]"
                data-release-verified={release.verified}
                style={{ color: release.isSafeState ? "var(--ink-soft)" : "var(--ink)" }}
              >
                {release.text}
              </span>
            ) : null}
            {history.map((label, index) => {
              const releaseId = doc?.historical_releases[index]?.release_id ?? null;
              /* QA UX-6: the retained release is one click away, not only by typing ?release_id=. */
              return releaseId && !embedded ? (
                <Link
                  key={label}
                  to={`/research/quantbt/atlas?release_id=${encodeURIComponent(releaseId)}`}
                  className="mono text-[9.5px] underline"
                  style={{ color: "var(--accent)" }}
                  data-historical-link={releaseId}
                >
                  {label}
                </Link>
              ) : (
                <span key={label} className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
                  {label}
                </span>
              );
            })}
            {selectedReleaseKind === "HISTORICAL" && !embedded ? (
              <Link to="/research/quantbt/atlas" className="mono text-[10px]" style={{ color: "var(--accent)" }} data-back-to-current>
                ← current release
              </Link>
            ) : null}
            </span>
            {/* CG-FG-S12-01: a historical selection states the identity the
                server served for it, in the server's own vocabulary. The old
                hard-coded "not installed and cannot run" was a claim the
                response never made. It keeps its own line: a warning is not a chip. */}
            {selectedReleaseKind === "HISTORICAL" && historicalIdentity ? (
              <span
                className="mono text-[10px]"
                style={{ color: "var(--role-holdout)" }}
                data-historical-note
                data-historical-identity={historicalIdentity.release_id}
                data-historical-status={historicalIdentity.status}
              >
                {historicalIdentity.package} {historicalIdentity.version} · {historicalIdentity.status}
              </span>
            ) : null}
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

      {/* RF-04: the tab bar is 369 px of a 1128 px row; the release facts sit
          in the space beside it instead of costing a band of their own. */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      {/* QA UX-6: a retained identity has no atlas document, so its three tabs would open nothing. */}
      {doc === null && selectedReleaseKind === "HISTORICAL" && state.state === "available" ? null : (
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
              id={`${panelId}-tab-${candidate}`}
              aria-controls={`${panelId}-panel`}
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
      )}

      {/* A pre-P10 document carries no release facts; nothing is drawn for it. */}
      {doc?.current_release.submission_constraints && doc.current_release.optimizer_defaults ? (
        <ReleaseFacts release={doc.current_release} />
      ) : null}
      </div>

      <ResearchPanel
        variant="plain"
        title={`atlas · ${tab}`}
        meta={doc ? `manifest revision ${doc.manifest_revision}` : undefined}
        state={state}
        minBodyHeight={160}
        recovery={
          onRetry ? (
            <button type="button" onClick={onRetry} className="btn-ghost self-start" data-action="retry-atlas">
              Read again
            </button>
          ) : undefined
        }
      >
        {!doc && state.state === "available" ? (
          <AtlasFactsAbsent kind={selectedReleaseKind} identity={historicalIdentity} />
        ) : null}
        {doc ? (
          <div role="tabpanel" id={`${panelId}-panel`} aria-labelledby={`${panelId}-tab-${tab}`}>
            {tab === "routes" ? (
              <RoutesTab
                doc={doc}
                selectedRoute={location.route}
                onRoute={(route) => onLocationChange?.({ route })}
              />
            ) : null}
            {tab === "claims" ? <ClaimsTab doc={doc} /> : null}
            {tab === "modes" ? (
              <ModesTab doc={doc} schedules={schedules} onSchedule={onSchedule} runId={location.run} runCell={runCell} />
            ) : null}
          </div>
        ) : null}
      </ResearchPanel>
      {/* F3 12-15: a refusal keeps its request id (403/404 included), so it can be quoted. */}
      {requestId && !doc && state.state !== "available" ? (
        <span className="mono text-[10px]" style={{ color: "var(--ink-faint)" }} data-request-id>
          request {requestId}
        </span>
      ) : null}
    </div>
  );
}

export { routeDisplay };
