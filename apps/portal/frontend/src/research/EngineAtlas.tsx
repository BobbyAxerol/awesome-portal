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

import { useMemo } from "react";

import {
  type AtlasDocument,
  type AtlasMode,
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
  { key: "family", width: 76 },
  { key: "contract", width: 230 },
  { key: "backend", width: 140 },
  { key: "report levels", width: 120 },
] as const;

function RoutesTab({ doc }: { doc: AtlasDocument }) {
  const rows = useMemo(() => allRouteDisplays(doc), [doc]);
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
    <div>
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
            className="flex flex-col gap-1 border-b px-3 py-[7px]"
            style={{ borderColor: "var(--line-soft)" }}
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
              {row.routeId}
              {row.isDefaultForNewRuns ? (
                <span className="ml-1.5 text-[9px]" style={{ color: "var(--accent)" }}>
                  default
                </span>
              ) : null}
            </span>
            <span
              className="mono text-[10px]"
              style={{ width: 76, flex: "none", color: "var(--ink-faint)" }}
            >
              {row.family}
            </span>
            <span
              className="mono text-[10px]"
              style={{ width: 230, flex: "none", color: "var(--ink-soft)" }}
            >
              {doc.routes.find((r) => r.route_id === row.routeId)?.execution_contract}
            </span>
            <span
              className="mono text-[10px]"
              style={{ width: 140, flex: "none", color: "var(--ink-soft)" }}
            >
              {row.backendLabel}
            </span>
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
            </div>
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

function ModeCard({ mode }: { mode: AtlasMode }) {
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
        <span className="mono text-[13px] font-bold">{mode.mode_id}</span>
        <span className="text-[12px]" style={{ color: "var(--ink-soft)" }}>
          {mode.display_name}
        </span>
        <span className="ml-auto flex flex-wrap gap-1">
          {mode.valid_schedules.map((schedule) => (
            <span
              key={schedule}
              className="mono rounded-[3px] border px-[5px] text-[9px] leading-[15px]"
              style={{
                borderColor: schedule === mode.default_schedule ? "var(--accent)" : "var(--line)",
                color: schedule === mode.default_schedule ? "var(--accent)" : "var(--ink-faint)",
              }}
            >
              {schedule}
            </span>
          ))}
        </span>
      </header>

      <div className="flex flex-wrap gap-4.5 pt-2.5">
        <div className="flex min-w-[300px] flex-[1.1] flex-col gap-1.5">
          <span
            className="mono text-[10px] uppercase tracking-[.07em]"
            style={{ color: "var(--ink-faint)" }}
          >
            objective
          </span>
          <span className="text-[11.5px] leading-[1.55]" style={{ color: "var(--ink-soft)" }}>
            {mode.objective_summary}
          </span>
          {mode.artifact_fields.length > 0 ? (
            <span className="mono text-[10px]" style={{ color: "var(--ink-faint)" }}>
              artifacts: {mode.artifact_fields.join(" · ")}
            </span>
          ) : null}
        </div>

        <div className="flex min-w-[280px] flex-1 flex-col gap-2">
          {/* The failure signature. Verbatim from the engine docs, never paraphrased. */}
          <div
            className="border-l-2 pl-2"
            style={{ borderColor: "var(--ink-soft)" }}
          >
            <span
              className="mono block text-[8.5px] font-bold uppercase tracking-[.08em]"
              style={{ color: "var(--ink-soft)" }}
            >
              suspect
            </span>
            <span className="text-[10.5px] leading-[1.55]" style={{ color: "var(--ink-soft)" }}>
              {mode.suspect}
            </span>
          </div>

          {mode.when_to_use ? (
            <span className="text-[10.5px] leading-[1.55]" style={{ color: "var(--ink-soft)" }}>
              {mode.when_to_use}
            </span>
          ) : null}

          {mode.rules.map((rule, index) => (
            <span
              key={index}
              className="text-[10.5px] leading-[1.55]"
              style={{ color: "var(--ink-soft)" }}
            >
              {rule}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}

function ModesTab({ doc }: { doc: AtlasDocument }) {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap gap-3.5">
        <div
          className="flex min-w-[420px] flex-[1.4] items-start gap-3 rounded-[6px] border px-3.5 py-2.5"
          style={{ borderColor: "var(--accent-strong)", background: "var(--accent-soft)" }}
        >
          <span
            className="mono flex-none text-[10px] font-bold uppercase tracking-[.1em]"
            style={{ color: "var(--accent-strong)" }}
          >
            rule one
          </span>
          <span className="text-[11.5px] leading-[1.55]" style={{ color: "var(--accent-strong)" }}>
            The claim comes from <span className="mono">mode × schedule</span>, never from the mode
            alone.
          </span>
        </div>
        <div
          className="flex min-w-[360px] flex-1 items-start gap-3 rounded-[6px] border px-3.5 py-2.5"
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
        <ModeCard key={mode.mode_id} mode={mode} />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Screen
 * ---------------------------------------------------------------------- */

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
}

export function EngineAtlas({
  doc,
  state,
  tab,
  onTabChange,
  selectedReleaseId = null,
  selectedReleaseKind = null,
}: EngineAtlasProps) {
  const release = doc ? currentReleaseLabel(doc.current_release) : null;
  const history = doc ? historicalReleaseLabels(doc) : [];

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
          </div>
        ) : null}
      </header>

      <div
        className="flex gap-1 self-start rounded-[6px] border p-[5px]"
        style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
        role="tablist"
        aria-label="Engine Atlas sections"
      >
        {ATLAS_TABS.map((candidate) => {
          const selected = candidate === tab;
          return (
            <button
              key={candidate}
              type="button"
              role="tab"
              aria-selected={selected}
              data-tab={candidate}
              onClick={() => onTabChange(candidate)}
              className="mono rounded-[4px] px-2.5 py-1 text-[10px] uppercase tracking-[.06em]"
              style={{
                background: selected ? "var(--accent)" : "transparent",
                color: selected ? "var(--accent-contrast)" : "var(--ink-soft)",
              }}
            >
              {candidate}
            </button>
          );
        })}
      </div>

      <ResearchPanel
        title={`atlas · ${tab}`}
        meta={doc ? `manifest revision ${doc.manifest_revision}` : undefined}
        state={state}
        minBodyHeight={160}
      >
        {doc ? (
          <div role="tabpanel" aria-label={tab}>
            {tab === "routes" ? <RoutesTab doc={doc} /> : null}
            {tab === "claims" ? <ClaimsTab doc={doc} /> : null}
            {tab === "modes" ? <ModesTab doc={doc} /> : null}
          </div>
        ) : null}
      </ResearchPanel>
    </div>
  );
}

export { routeDisplay };
