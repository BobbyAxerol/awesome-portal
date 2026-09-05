/**
 * Phase 16 — Portfolio 360° (hi-fi 1h→3a, WF 1h/3a, ops dark).
 *
 * The correlation view is the whole screen, and it has one property worth
 * stating before anything else:
 *
 *   **150 is a transport limit, not a rendering limit.**
 *
 * `EX-BE-07a` packs a lower triangle up to `dimension: 150` and switches to
 * ranked pairs above it. That bound is about bytes on a wire. A 150 × 150
 * heatmap is **22,500 cells**, and a browser asked to lay out 22,500 DOM nodes
 * inside a panel will not merely be slow — it will be a grid no human can read
 * a value out of. Today's fleet is 47 alphas (`workload-profile.md`), which is
 * 2,304 cells with the benchmark pinned in; that already sits near the edge.
 *
 * So this screen carries its own, much lower, display threshold, and past it
 * the **leader lens becomes the primary view** — one alpha's correlation row is
 * `n` cells rather than `n²`. That is not a fallback invented for scale: the
 * wireframe already draws the leader lens, so the degradation path is an
 * affordance the design already has. Three representations, one rule choosing
 * between them, and the choice is always stated on screen.
 */
import { useId, useState , type ReactNode } from "react";

import {
  compareAbsDecimal,
  correlationAt,
  samplesAt,
  type Correlation,
  type PackedCorrelation,
  type RankedCorrelation,
  type CapitalLedger,
} from "../analytics";
import type { Envelope, PanelStatus, PromotionStage, Readiness } from "../contracts";
import { AuthorityBadge, EnvironmentBadge, StatusChip } from "../components/badges";
import { PanelState } from "../components/states";
import { capNotice, capPreserving } from "../components/cap";
import { ExecutionSurface } from "../ExecutionSurface";
import { InfluenceGraph } from "../components/marketChart";
import type { PfDemo } from "../portfolio360.smoke";
import { ExecutionWorkspace } from "../components/workspace";

/**
 * Cells the matrix may lay out before the representation changes.
 *
 * A budget in cells rather than in entities, because cells are what the browser
 * pays for and what a reader scans. 4,096 is a 64 × 64 grid.
 *
 * The number was chosen against the fleet, not picked round. Today's 47 alphas
 * are 2,209 cells and must stay a matrix — the wireframe's primary view being
 * unreachable in production would make it a drawing rather than a design. 64
 * entities is roughly where a labelled grid stops being usable at all, and it
 * is still five times below the 22,500 the transport limit would permit.
 *
 * The first draft set this to 1,600 and quietly demoted today's fleet to the
 * lens. The test caught it, which is the argument for the rule being a pure
 * function rather than a branch inside a render path.
 */
export const MATRIX_CELL_BUDGET = 4_096;

/** Below this many samples a coefficient is not shown as a number. */
export const SAMPLE_FLOOR = 200;

export const PORTFOLIO_TABS = [
  "Overview",
  "Structure & Correlation",
  "Capital Ledger",
  "Approvals",
  "Incidents",
  "Audit",
] as const;
export type PortfolioTab = (typeof PORTFOLIO_TABS)[number];

export type CorrelationMode = "matrix" | "lens" | "ranked";

export interface CorrelationView {
  mode: CorrelationMode;
  /** Entities the source described, whatever is drawn. */
  entities: number;
  /** Cells a full matrix would cost. Stated, so the choice is checkable. */
  cells: number;
  /** Why this mode, in words a reader can act on. */
  reason: string;
}

/**
 * Choose how to draw a correlation result.
 *
 * Pure and exported so the rule is testable without a DOM — it is the decision
 * that keeps this screen usable at fleet scale, and it should not be buried in
 * a render path where the only way to check it is to count elements.
 */
export function correlationView(
  correlation: Correlation,
  cellBudget: number = MATRIX_CELL_BUDGET,
): CorrelationView {
  if (correlation.kind === "RANKED_PAIRS") {
    const entities = correlation.labels.length;
    return {
      mode: "ranked",
      entities,
      cells: entities * entities,
      reason: `The source ranked ${correlation.pairs.length.toLocaleString("en-US")} pairs across ${entities.toLocaleString("en-US")} entities rather than sending a matrix. A grid of ${(entities * entities).toLocaleString("en-US")} cells answers no question anyone asks of it.`,
    };
  }
  const n = correlation.dimension;
  const cells = n * n;
  if (cells <= cellBudget) {
    return { mode: "matrix", entities: n, cells, reason: `${n} × ${n} — the full matrix.` };
  }
  return {
    mode: "lens",
    entities: n,
    cells,
    reason: `${n} entities would be ${cells.toLocaleString("en-US")} cells, past the ${cellBudget.toLocaleString("en-US")} this panel can lay out and read. Showing one alpha's row at a time instead.`,
  };
}


/** The stage workbench a holdings row's deployment lives on (HiFi 3a). */
export function workbenchRouteFor(row: { deploymentId: string; stage: PromotionStage; mode: string }): string | null {
  switch (row.stage) {
    case "PAPER_OBSERVATION":
      return `/deployments/paper/${row.deploymentId}`;
    case "SANDBOX_VALIDATION":
      return `/deployments/sandbox/${row.deploymentId}`;
    case "LIVE_CANARY":
      return `/deployments/live/${row.deploymentId}/canary`;
    case "LIVE_FULL":
      return `/deployments/live/${row.deploymentId}`;
    default:
      return null;
  }
}

export interface HoldingRow {
  alpha: string;
  deploymentId: string;
  accountId: string;
  venue: string;
  mode: string;
  allocation: string | null;
  exposure: string | null;
  exposurePct: string | null;
  currency: string;
  stage: PromotionStage;
  readiness: Readiness;
}

/** One ranked list. Three of these; never merged into a single score. */
export interface LeaderList {
  title: string;
  formulaVersion: string | null;
  rows: readonly { label: string; value: string | null; detail?: string | null }[];
}

export interface ApprovalRow {
  id: string;
  gate: string;
  subject: string;
  decision: string;
  approvers: string;
  decidedAt: string | null;
  conditions: string;
}

export interface PortfolioThreeSixtyProps {
  portfolioId: string;
  portfolioName: string;
  envelope: Envelope;
  scopeWindow: string;
  benchmark: string;
  benchmarkId: string;
  tab: PortfolioTab;
  onTabChange: (tab: PortfolioTab) => void;
  /** Holdings row → Alpha 360° (HiFi 3a: "alpha click → Alpha 360°"). */
  onOpenAlpha: (alphaId: string) => void;
  /** Account cell → Account/Broker 360° (HiFi 3a: "account click → Account 360°"). */
  onOpenAccount: (accountId: string) => void;
  kpis: readonly { label: string; value: string | null; unit?: string | null }[];
  holdings: readonly HoldingRow[];
  /** FX note the hi-fi requires wherever a total crosses currencies. */
  fxNote?: string | null;
  correlation: Correlation | null;
  correlationEnvelope?: Envelope;
  /** Index of the alpha the leader lens is focused on. */
  lensIndex?: number | null;
  onLensChange: (index: number | null) => void;
  leaders: readonly LeaderList[];
  insight?: { code: string; grade: string; window: string; text: string } | null;
  ledger: CapitalLedger | null;
  ledgerStatus?: PanelStatus;
  ledgerReason?: string;
  ledgerTotals?: { allocated: string; max: string; free: string; currency: string } | null;
  approvals: readonly ApprovalRow[];
  /**
   * Open and resolved incidents.
   *
   * `undefined` renders as unavailable, never as "none open": a component that
   * was given no incident data cannot say a portfolio is clear.
   */
  incidents?: {
    open: readonly { id: string; at: string | null; severity: string; summary: string }[];
    resolved: readonly { id: string; at: string | null; closedBy: string | null }[];
  } | null;
  status?: PanelStatus;
  reason?: string;  /** Reviewed hi-fi demo layer — the lab passes it; the product never does. */
  demo?: PfDemo | null;
  demoPanels?: {
    liveStrip?: ReactNode;
    eraChart?: ReactNode;
    crossPortfolio?: ReactNode;
    configLog?: ReactNode;
    structureExtras?: ReactNode;
    corrMatrix?: ReactNode;
    marketCorr?: ReactNode;
    leadership?: (lensOn: boolean, onLens: () => void) => ReactNode;
    whatIf?: ReactNode;
    influence?: ReactNode;
    ddOverlap?: ReactNode;
    footerLinks?: ReactNode;
    ledger?: ReactNode;
    approvals?: ReactNode;
    incidents?: ReactNode;
    audit?: ReactNode;
    smokeNote?: ReactNode;
    rhoChart?: ReactNode;
    ddOverlapChart?: ReactNode;
  } | null;
  demoClock?: string | null;
}

function Num({ value, absent = "not available" }: { value: string | null; absent?: string }) {
  return value !== null ? (
    <span className="exec-num">{value}</span>
  ) : (
    <span className="exec-gate-unverified">{absent}</span>
  );
}

/**
 * One correlation cell.
 *
 * Returns the em dash — the hi-fi's own mark for `INSUFFICIENT_DATA` — rather
 * than a number whenever the pair cannot support one, and the panel caption
 * says which pairs those were. *"Pairwise coverage shown, never silently
 * dropped"*: a blank cell and a 0.00 cell make the same wrong claim in
 * different ways.
 */
function cellText(
  matrix: PackedCorrelation,
  row: number,
  column: number,
): { text: string; insufficient: boolean; samples: number | null } {
  const value = correlationAt(matrix, row, column);
  const samples = samplesAt(matrix, row, column);
  if (value === null) return { text: "—", insufficient: true, samples };
  // Only a published count below the floor is insufficiency. A count that was
  // never published means the rule cannot be applied, not that it failed.
  if (samples !== null && samples < SAMPLE_FLOOR) {
    return { text: "—", insufficient: true, samples };
  }
  return { text: value, insufficient: false, samples };
}

/** |ρ| → 0..4 for the heatmap tint. Colour is presentation; the coefficient itself is never rewritten. */
export function absBucket(coefficient: string): "0" | "1" | "2" | "3" | "4" {
  const n = Math.abs(Number(coefficient));
  if (!Number.isFinite(n)) return "0";
  if (n >= 0.8) return "4";
  if (n >= 0.6) return "3";
  if (n >= 0.4) return "2";
  if (n >= 0.2) return "1";
  return "0";
}

/**
 * Influence map (HiFi 3a): node = alpha, edge = |ρ| at or above the
 * threshold, both read straight off the published packed matrix. Radius
 * follows the holding's exposure share when published; otherwise nodes are
 * equal — the map never computes an exposure of its own.
 */
export function InfluenceMap({ matrix, exposures, threshold = "0.5" }: { matrix: PackedCorrelation; exposures: ReadonlyMap<string, string | null>; threshold?: string }) {
  const n = matrix.labels.length;
  const edges: { a: number; b: number; rho: string }[] = [];
  for (let a = 0; a < n; a += 1) for (let b = a + 1; b < n; b += 1) {
    const rho = correlationAt(matrix, a, b);
    if (rho !== null && compareAbsDecimal(rho, threshold) >= 0) edges.push({ a, b, rho });
  }
  const share = (id: string) => {
    const pct = exposures.get(id);
    const v = pct === null || pct === undefined ? NaN : Number(pct.replace("%", ""));
    return Number.isFinite(v) ? v : null;
  };
  return (
    <figure className="exec-influence-wrap">
      {/* The published matrix drawn as a real graph, at a contained height —
          the 320×240 SVG this replaces stretched to the full canvas width. */}
      <InfluenceGraph
        height={320}
        nodes={matrix.labels.map((l) => ({ id: l.entityId, label: l.displayName, sharePct: share(l.entityId), kind: "alpha" as const }))}
        edges={edges.map((e) => ({ a: matrix.labels[e.a].entityId, b: matrix.labels[e.b].entityId, rho: Number(e.rho) }))}
        provenance={{ authority: "DERIVED", asOf: "published matrix", formula: "corr.v1" }}
        ariaLabel={`Influence map: ${n} alphas, ${edges.length} edges with |ρ| ≥ ${threshold}`}
      />
      <figcaption className="exec-role-meta">node = alpha (radius = published exposure share) · edge = |ρ| ≥ {threshold} from the published matrix · {edges.length} edges</figcaption>
    </figure>
  );
}

function CorrelationMatrix({
  matrix,
  lensIndex,
  onLensChange,
}: {
  matrix: PackedCorrelation;
  lensIndex: number | null;
  onLensChange: (index: number | null) => void;
}) {
  const labels = matrix.labels;
  return (
    <div className="exec-pf-matrixwrap">
      <div className="exec-scroll-x">
      <table className="exec-pf-matrix">
        <thead>
          <tr>
            <th scope="col" />
            {labels.map((label, i) => (
              <th key={label.entityId} scope="col" data-lens={i === lensIndex ? "true" : undefined}>
                {label.displayName}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((rowLabel, row) => (
            <tr key={rowLabel.entityId} data-lens={row === lensIndex ? "true" : undefined}>
              <th scope="row">
                <button
                  type="button"
                  className="exec-pf-lensbtn"
                  onClick={() => onLensChange(row === lensIndex ? null : row)}
                >
                  {rowLabel.displayName}
                </button>
              </th>
              {labels.map((_, column) => {
                const cell = cellText(matrix, row, column);
                return (
                  <td
                    key={column}
                    data-insufficient={cell.insufficient ? "true" : undefined}
                    data-lens={row === lensIndex || column === lensIndex ? "true" : undefined}
                    data-self={row === column ? "true" : undefined}
                    data-abs={cell.insufficient || row === column ? undefined : absBucket(cell.text)}
                    title={
                      cell.samples !== null ? `${cell.samples} samples` : "sample count not published"
                    }
                  >
                    {/* Heatmap: the tint is |ρ| bucketed for colour only; the number stays the server's string. Click drills into the column's lens. */}
                    <button type="button" className="exec-pf-cellbtn" onClick={() => onLensChange(column === lensIndex ? null : column)} aria-label={`${rowLabel.displayName} × ${labels[column].displayName}: ${cell.text}`}>
                      <span className="exec-num">{cell.text}</span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

/**
 * One alpha's row, drawn when the full matrix would not fit.
 *
 * `n` cells instead of `n²`, and it answers the question the matrix is usually
 * scanned for anyway: what is this alpha coupled to. Rows are ordered by
 * absolute coefficient so the couplings that matter are at the top, and the
 * insufficient pairs are listed rather than dropped.
 */
function CorrelationLens({
  matrix,
  lensIndex,
  onLensChange,
}: {
  matrix: PackedCorrelation;
  lensIndex: number;
  onLensChange: (index: number | null) => void;
}) {
  const subject = matrix.labels[lensIndex];
  const others = matrix.labels
    .map((label, index) => ({ label, index, ...cellText(matrix, lensIndex, index) }))
    .filter((entry) => entry.index !== lensIndex);
  const ranked = [...others].sort((a, b) => {
    if (a.insufficient !== b.insufficient) return a.insufficient ? 1 : -1;
    // Ordering without a float. See `compareAbsDecimal`.
    return compareAbsDecimal(b.text, a.text);
  });
  const shown = capPreserving(ranked, 40, (entry) => entry.insufficient);
  const notice = capNotice(shown, "pairs");

  return (
    <div>
      <label className="exec-alpha-select">
        <span>Leader lens</span>
        <select
          value={lensIndex}
          onChange={(event) => onLensChange(Number(event.target.value))}
        >
          {matrix.labels.map((label, index) => (
            <option key={label.entityId} value={index}>
              {label.displayName}
            </option>
          ))}
        </select>
      </label>
      <div className="exec-scroll-x">
      <table className="exec-360-sync">
        <caption>{subject?.displayName} against every other entity</caption>
        <thead>
          <tr>
            <th scope="col">entity</th>
            <th scope="col">ρ</th>
            <th scope="col">samples</th>
          </tr>
        </thead>
        <tbody>
          {shown.shown.map((entry) => (
            <tr key={entry.label.entityId} data-insufficient={entry.insufficient ? "true" : undefined}>
              <th scope="row">{entry.label.displayName}</th>
              <td>
                <span className="exec-num">{entry.text}</span>
              </td>
              <td>
                {entry.samples !== null ? (
                  <span className="exec-num">{entry.samples.toLocaleString("en-US")}</span>
                ) : (
                  <span className="exec-gate-unverified">not published</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {notice ? <p className="exec-blotter-note">{notice}</p> : null}
    </div>
  );
}

function RankedPairs({ ranked }: { ranked: RankedCorrelation }) {
  const shown = capPreserving(
    ranked.pairs,
    60,
    (pair) => pair.sampleCount !== null && pair.sampleCount < SAMPLE_FLOOR,
  );
  const notice = capNotice(shown, "ranked pairs");
  return (
    <div>
      <div className="exec-scroll-x">
      <table className="exec-360-sync">
        <thead>
          <tr>
            <th scope="col">pair</th>
            <th scope="col">ρ</th>
            <th scope="col">samples</th>
          </tr>
        </thead>
        <tbody>
          {shown.shown.map((pair) => {
            const insufficient = pair.sampleCount !== null && pair.sampleCount < SAMPLE_FLOOR;
            return (
              <tr
                key={`${pair.leftId}-${pair.rightId}`}
                data-insufficient={insufficient ? "true" : undefined}
              >
                <th scope="row">
                  {pair.leftId} ↔ {pair.rightId}
                </th>
                <td>
                  <span className="exec-num">{insufficient ? "—" : pair.coefficient}</span>
                </td>
                <td>
                  {pair.sampleCount !== null ? (
                    <span className="exec-num">{pair.sampleCount.toLocaleString("en-US")}</span>
                  ) : (
                    <span className="exec-gate-unverified">not published</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      {notice ? <p className="exec-blotter-note">{notice}</p> : null}
      {ranked.clusters.length > 0 ? (
        <ul className="exec-pf-clusters">
          {ranked.clusters.map((cluster) => (
            <li key={cluster.clusterId}>
              <strong>{cluster.label}</strong> — {cluster.members.join(", ")}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function CorrelationPanel({
  correlation,
  envelope,
  lensIndex = null,
  onLensChange,
  cellBudget = MATRIX_CELL_BUDGET,
}: {
  correlation: Correlation | null;
  envelope?: Envelope;
  lensIndex?: number | null;
  onLensChange: (index: number | null) => void;
  cellBudget?: number;
}) {
  if (!correlation) {
    return (
      <PanelState
        status="unavailable"
        reason="No correlation result was published for this portfolio and window."
      />
    );
  }
  const view = correlationView(correlation, cellBudget);
  const packed = correlation.kind === "PACKED_MATRIX" ? correlation : null;
  const countsPublished = packed?.sampleCounts !== null && packed?.sampleCounts !== undefined;

  return (
    <section className="exec-gate-panel">
      <div className="exec-tile-title">Cross-alpha correlation</div>
      <div className="exec-360-colmeta">
        {envelope ? <AuthorityBadge envelope={envelope} /> : null}
        <StatusChip label={view.mode.toUpperCase()} tone="mute" />
      </div>
      {/* The representation is always explained. A reader who cannot tell
          whether they are looking at everything or at a selection cannot use
          either honestly. */}
      <p className="exec-blotter-note">{view.reason}</p>

      {view.mode === "matrix" && packed ? (
        <CorrelationMatrix matrix={packed} lensIndex={lensIndex} onLensChange={onLensChange} />
      ) : null}
      {view.mode === "lens" && packed ? (
        <CorrelationLens matrix={packed} lensIndex={lensIndex ?? 0} onLensChange={onLensChange} />
      ) : null}
      {view.mode === "ranked" && correlation.kind === "RANKED_PAIRS" ? (
        <RankedPairs ranked={correlation} />
      ) : null}

      <p className="exec-blotter-note">
        — = INSUFFICIENT_DATA · pairwise coverage shown, never silently dropped
        {packed && !countsPublished ? (
          <>
            {" · "}
            {/* Said plainly rather than implied by an absence. Without this the
                numbers read as having passed a sufficiency check that was never
                run. */}
            <strong>
              per-pair sample counts are not published for a packed matrix, so the {SAMPLE_FLOOR}
              -sample floor could not be applied to individual cells
            </strong>
          </>
        ) : null}
      </p>
    </section>
  );
}

/**
 * Three ranked lists, never one merged score.
 *
 * The hi-fi is explicit — *"three ranked lists, never one merged 'leader
 * score'"* — and the reason is that exposure share, variance contribution and
 * correlation influence disagree, and the disagreement is the finding. An alpha
 * that is 70% of exposure but 20% of variance is a different problem from one
 * that is 20% of exposure and 70% of variance, and a single blended number
 * would give them the same answer.
 */
function Leaders({ lists }: { lists: readonly LeaderList[] }) {
  return (
    <div className="exec-pf-leaders">
      {lists.map((list) => (
        <section key={list.title} className="exec-gate-panel">
          <div className="exec-tile-title">{list.title}</div>
          <dl className="exec-360-facts">
            {list.rows.map((row) => (
              <div key={row.label} className="exec-alpha-contrib">
                <dt>{row.label}</dt>
                <dd>
                  <Num value={row.value} />
                  {row.detail ? <span className="exec-blotter-note"> {row.detail}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
          {list.formulaVersion ? (
            <p className="exec-blotter-note">{list.formulaVersion}</p>
          ) : null}
        </section>
      ))}
    </div>
  );
}

/** Append-only, bucketed by currency, direction from the server. */
function Ledger({
  ledger,
  totals,
  status,
  reason,
}: {
  ledger: CapitalLedger | null;
  totals: PortfolioThreeSixtyProps["ledgerTotals"];
  status?: Exclude<PanelStatus, "ok">;
  reason?: string;
}) {
  if (!ledger) return (
    <PanelState
      status={status ?? "unavailable"}
      reason={reason ?? "The capital-ledger branch is not published for this portfolio."}
    />
  );
  return (
    <section className="exec-gate-panel">
      <div className="exec-tile-title">Capital ledger — append-only</div>
      {totals ? (
        <p className="exec-blotter-note">
          allocated <span className="exec-num">{totals.allocated}</span> / max{" "}
          <span className="exec-num">{totals.max}</span> · free{" "}
          <span className="exec-num">{totals.free}</span> {totals.currency}
        </p>
      ) : null}
      {ledger.bounded.hasMore ? (
        // Response-level, above the per-bucket caps, because it explains
        // something those cannot: rows are missing from the DOCUMENT, not just
        // from the render. The gross totals below are still exact for the whole
        // population — that is the pairing this sentence has to protect, since
        // a reader who sees "showing 12" beside a large total will otherwise
        // assume one of the two numbers is wrong.
        <p className="exec-ledger-bounded">
          {/* Not `?? 0`. An absent count is not a count of zero, and "0 of
              1,234 entries were returned" is a false sentence sitting inside
              the one paragraph written to stop a reader misreading this pair.
              It matches how `total` is handled on the next line. */}
          Bounded window — {ledger.bounded.returned?.toLocaleString("en-US") ?? "an unstated number of"} of{" "}
          {ledger.bounded.total?.toLocaleString("en-US") ?? "an unpublished number of"} entries were
          returned.
          {ledger.window === "LATEST" ? " The source sent the latest entries only." : null}
          {ledger.window === "LIFECYCLE_AND_LATEST"
            ? " The source sent lifecycle coverage plus the latest entries — not a full export."
            : null}{" "}
          The gross increase and decrease below are exact for the complete population, not for the
          rows shown.
        </p>
      ) : null}
      {ledger.buckets.map((bucket) => {
        // Bucketed, never merged. Two currencies in one running total is a
        // number with no unit, and the ledger's own invariant is per-currency.
        // The ledger is append-only and unbounded. A cap over it is a window,
        // not a summary, and the caption below says so — BR-EX-28 asks for the
        // per-bucket keyset page that would let this page properly.
        const shown = capPreserving(
          bucket.entries,
          50,
          (entry) => entry.direction !== "INCREASE",
          bucket.entryCount ?? bucket.entries.length,
        );
        const notice = capNotice(shown, `${bucket.currency} entries`);
        return (
          <div key={bucket.currency}>
            <div className="exec-scroll-x">
            <table className="exec-360-sync">
              <caption>
                {bucket.currency} — gross increase{" "}
                <span className="exec-num">{bucket.grossIncrease}</span> · gross decrease{" "}
                <span className="exec-num">{bucket.grossDecrease}</span>
              </caption>
              <thead>
                <tr>
                  <th scope="col">time (UTC)</th>
                  <th scope="col">type</th>
                  <th scope="col">account</th>
                  <th scope="col">amount</th>
                  <th scope="col">allocated →</th>
                  <th scope="col">operation</th>
                </tr>
              </thead>
              <tbody>
                {shown.shown.map((entry) => (
                  <tr key={entry.ledgerId} data-direction={entry.direction}>
                    <th scope="row">
                      <span className="exec-num">{entry.occurredAt ?? "time not stated"}</span>
                    </th>
                    <td>{entry.movementType}</td>
                    <td>{entry.accountId}</td>
                    <td>
                      {/* The direction is the server's word, never the sign of
                          the amount: a REBALANCE of 0 is UNCHANGED, and reading
                          the sign would call it nothing at all. */}
                      <span className="exec-num">{entry.amount}</span>
                      <StatusChip
                        label={entry.direction}
                        tone={
                          entry.direction === "INCREASE"
                            ? "good"
                            : entry.direction === "DECREASE"
                              ? "warn"
                              : "mute"
                        }
                      />
                    </td>
                    <td>
                      <span className="exec-num">
                        {entry.beforeAllocated} → {entry.afterAllocated}
                      </span>
                    </td>
                    <td>
                      {entry.allocationId ?? (
                        <span className="exec-gate-unverified">no allocation id</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {notice ? <p className="exec-blotter-note">{notice}</p> : null}
            {bucket.entryCount === null || bucket.entryCount === undefined ? (
              <p className="exec-blotter-note">
                A window over an append-only ledger — this endpoint publishes no
                entry count, so these are the most recent movements plus every
                decrease, not the whole ledger.
              </p>
            ) : null}
          </div>
        );
      })}
      <p className="exec-blotter-note">
        every entry ties to an operation from plan → apply → verify · before and after totals are
        the ledger&apos;s own invariant
      </p>
    </section>
  );
}

export function PortfolioThreeSixty(props: PortfolioThreeSixtyProps) {
  const {
    portfolioId,
    portfolioName,
    envelope,
    scopeWindow,
    benchmark,
    benchmarkId,
    tab,
    onTabChange,
    onOpenAlpha,
    onOpenAccount,
    kpis,
    holdings,
    fxNote,
    correlation,
    correlationEnvelope,
    lensIndex = null,
    onLensChange,
    leaders,
    insight,
    ledger,
    ledgerTotals,
    approvals,
    incidents,
    status = "ok",
    reason,
  } = props;

  const [localLens, setLocalLens] = useState<number | null>(null);
  // `useId`, not a literal. The tab ids and the panel id were hardcoded, so any
  // page holding two of this screen emits duplicate DOM ids — and an
  // `aria-controls` that resolves to the first match means the second screen's
  // tabs point at the FIRST screen's panel. The fixtures surface renders five
  // of one of these, so this was live on a real page, not hypothetical.
  const uid = useId();
  const [action, setAction] = useState<"rebalance" | "report" | null>(null);
  const lens = lensIndex ?? localLens;
  const setLens = onLensChange ?? setLocalLens;

  const shownHoldings = capPreserving(holdings, 40, (row) => row.readiness !== "READY");
  const holdingsNotice = capNotice(shownHoldings, "holdings");

  const { demo, demoPanels, demoClock } = props;
  const smoke = demo ?? null;
  const clock = demoClock ?? null;

  return (
    <ExecutionSurface kind="deployments" className="exec-pf exec-a3 exec-pf2" data-hifi-exact="portfolio-360">
      <ExecutionWorkspace layout="dense">
      <header className="exec-a3-masthead">
        <h1 className="exec-a3-h1">{portfolioId} <span className="exec-a3-id">— Portfolio 360°</span></h1>
        {smoke ? <span className="exec-pf2-status">● {smoke.status}</span> : null}
        <span className="exec-pf2-facts">{smoke ? smoke.facts : portfolioName}</span>
        <span className="exec-a3-wf">WF 3a</span>
        <span className="exec-a3-spacer" />
        <span className="exec-a3-source"><b>{envelope.authority}</b> · as_of {envelope.asOf ? envelope.asOf.slice(11) : "not stated"} · <span data-tone={envelope.freshness === "OK" ? "good" : envelope.freshness === "STALE" ? "bad" : "warn"}>{clock ? `age ${clock}` : envelope.freshness}</span></span>
        {/* Active controls: each opens its plan preview; the Apply/Generate
            inside is the single point BR-EX-51's route will enable. */}
        <button type="button" className="exec-a3-btn" aria-pressed={action === "report"} onClick={() => setAction(action === "report" ? null : "report")}>Report pack</button>
        <button type="button" className="exec-pf2-primary" aria-pressed={action === "rebalance"} onClick={() => setAction(action === "rebalance" ? null : "rebalance")}>Rebalance plan<span aria-hidden="true"> ▾</span></button>
      </header>
      {status !== "ok" && status !== "partial" ? (
        <section className="exec-gate-panel" aria-label="Portfolio resource state">
          <PanelState status={status} reason={reason ?? "This portfolio could not be read."} />
        </section>
      ) : null}
      {action === "rebalance" ? (
        <section className="exec-sbc-plan" aria-label="PLAN · portfolio rebalance">
          <header className="exec-sbc-planhead">
            <span className="exec-sbc-plantitle">PLAN · portfolio rebalance — preview</span>
            <span className="exec-a3-spacer" />
            <button type="button" className="exec-a3-btn" onClick={() => setAction(null)}>Close</button>
          </header>
          <div className="exec-lf-kv">
            <span className="exec-bd-k">operation</span><span>portfolio.rebalance · {portfolioName}</span>
            <span className="exec-bd-k">targets</span><span>Grid v2.1 69.8% → 60.0% · Carry v3.2 30.2% → 40.0% — labeled estimates from the what-if panel</span>
            <span className="exec-bd-k">writes</span><span>capital ledger entries only — positions move by the deployments' own orders, never by this plan</span>
            <span className="exec-bd-k">governance</span><span>ADMIN step-up · dual approval · plan → apply → verify · PARTIAL never renders green</span>
          </div>
          <footer className="exec-sbc-planfoot">
            <button type="button" className="exec-pf2-primary" disabled title="The rebalance route lands with BR-EX-51; this preview never leaves the browser.">Apply</button>
            <span>preview only — apply enables when BR-EX-51 ships the plan → apply → verify route · today's allocation actions live in the Admin Action Drawer</span>
          </footer>
        </section>
      ) : null}
      {action === "report" ? (
        <section className="exec-sbc-plan" aria-label="Report pack — preview">
          <header className="exec-sbc-planhead">
            <span className="exec-sbc-plantitle">Report pack — preview</span>
            <span className="exec-a3-spacer" />
            <button type="button" className="exec-a3-btn" onClick={() => setAction(null)}>Close</button>
          </header>
          <p className="exec-pw-reportbody">
            The pack would carry: the live strip and its KPIs, equity vs benchmark by revision era, the
            correlation matrix with the influence map, drawdown overlap, the capital ledger window, and the
            approvals touching this portfolio — at the digests they were read at.
          </p>
          <footer className="exec-sbc-planfoot">
            <button type="button" className="exec-pf2-primary" disabled title="Report generation lands with BR-EX-51; nothing is produced here.">Generate</button>
            <span>preview only — the export route ships with BR-EX-51</span>
          </footer>
        </section>
      ) : null}
      <div className="exec-alpha-scope exec-pf2-scope">
        <span className="exec-a3-scopelabel">Scope</span>
        <span className="exec-pf2-chip">Window {scopeWindow} ▾</span>
        <span className="exec-pf2-chip">Mode All ▾</span>
        <span className="exec-pf2-chip">Venue All ▾</span>
        <span className="exec-pf2-chip">Benchmark {benchmark} ▾ <span className="exec-pf2-dim">{benchmarkId}</span></span>
        <span className="exec-a3-scopenote">every panel below obeys this scope</span>
      </div>

      <div className="exec-alpha-tabs" role="tablist" aria-label="Portfolio detail">
        {PORTFOLIO_TABS.map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            id={`${uid}-tab-${option.replace(/\W+/g, "-")}`}
            aria-controls={`${uid}-tabpanel`}
            className="exec-a3-tab"
            data-active={tab === option ? "true" : undefined}
            aria-selected={tab === option}
            onClick={() => onTabChange(option)}
          >
            {option}
          </button>
        ))}
      </div>

      <div
        className="exec-alpha-body"
        role="tabpanel"
        id={`${uid}-tabpanel`}
        // Named by its tab rather than by a duplicate label: a screen reader
        // reading "Positions, tab panel, Positions" twice is the label doing
        // the tab's job.
        aria-labelledby={`${uid}-tab-${tab.replace(/\W+/g, "-")}`}
      >
        {tab === "Overview" ? (
          <>
            {demoPanels?.liveStrip ?? null}
            {demoPanels?.eraChart ?? null}
            {demoPanels?.crossPortfolio ?? null}
            {demoPanels?.configLog ?? null}
            <details className="exec-pf2-contract">
              <summary className="exec-pf2-note">{smoke ? "published KPIs (contract) — the strip above is smoke until BR-EX-51" : "published KPIs (contract)"}</summary>
            <div className="exec-alpha-kpis">
              {kpis.map((kpi) => (
                <div key={kpi.label} className="exec-alpha-kpi">
                  <div className="exec-blotter-note">{kpi.label}</div>
                  <div>
                    <Num value={kpi.value} />
                    {kpi.value !== null && kpi.unit ? (
                      <span className="exec-blotter-note"> {kpi.unit}</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            </details>
          </>
        ) : null}

        {tab === "Structure & Correlation" ? (
          <>
            {demoPanels?.structureExtras ?? null}
            <section className="exec-gate-panel">
              <div className="exec-tile-title">
                Holdings structure — portfolio → alpha → deployment → account
              </div>
              <div className="exec-blotter-note">
                one account = one alpha, never shared
              </div>
              <div className="exec-scroll-x">
              <table className="exec-alpha-deployments">
                <caption className="exec-blotter-note">
                  Holdings — one row per deployment
                </caption>
                <thead>
                  <tr>
                    <th scope="col">alpha</th>
                    <th scope="col">deployment</th>
                    <th scope="col">account_id</th>
                    <th scope="col">venue · mode</th>
                    <th scope="col">alloc</th>
                    <th scope="col">exposure</th>
                    <th scope="col">exp %</th>
                    <th scope="col">stage · health</th>
                  </tr>
                </thead>
                <tbody>
                  {shownHoldings.shown.length === 0 ? (
                    <tr><td colSpan={8} className="exec-gate-unverified">No deployment is currently bound to this portfolio in the selected source profiles.</td></tr>
                  ) : null}
                  {shownHoldings.shown.map((row) => (
                    <tr
                      key={row.deploymentId}
                      data-emphasis={row.readiness !== "READY" ? "warn" : undefined}
                    >
                      <th scope="row">
                        <button type="button" className="exec-link" onClick={() => onOpenAlpha(row.alpha)}>
                          {row.alpha}
                        </button>
                      </th>
                      <td>
                        {(() => {
                          const href = workbenchRouteFor(row);
                          return href ? <a href={href}>{row.deploymentId}</a> : row.deploymentId;
                        })()}
                      </td>
                      <td>
                        <button type="button" className="exec-link" onClick={() => onOpenAccount(row.accountId)}>
                          {row.accountId}
                        </button>
                      </td>
                      <td>
                        {row.venue} · {row.mode}
                      </td>
                      <td>
                        <Num value={row.allocation} absent="not published" />
                        <span className="exec-blotter-note"> {row.currency}</span>
                      </td>
                      <td>
                        <Num value={row.exposure} absent="not published" />
                      </td>
                      <td>
                        <Num value={row.exposurePct} absent="not published" />
                      </td>
                      <td>
                        <EnvironmentBadge stage={row.stage} />
                        <StatusChip
                          label={row.readiness}
                          tone={row.readiness === "READY" ? "good" : "warn"}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              {holdingsNotice ? <p className="exec-blotter-note">{holdingsNotice}</p> : null}
              {/* Required wherever a total crosses currencies. A portfolio total
                  over USDT and USDC is only meaningful with a named rate, and
                  the note names it. */}
              {fxNote ? <p className="exec-blotter-note">{fxNote}</p> : null}
            </section>
            {demoPanels ? <div className="exec-pf2-grid" data-ratio="1.15">{demoPanels.corrMatrix}{demoPanels.marketCorr}</div> : null}
            {demoPanels ? <div className="exec-pf2-grid" data-ratio="1">{demoPanels.leadership?.(lens !== null, () => setLens(lens === null ? 0 : null))}{demoPanels.whatIf}</div> : null}
            {demoPanels ? <div className="exec-pf2-grid" data-ratio="1.2r">{demoPanels.influence}{demoPanels.ddOverlap}</div> : null}
            {demoPanels?.footerLinks ?? null}
            <details className="exec-pf2-contract" open>
              <summary>published correlation · corr.v1 contract (matrix · lens · ranked · influence · ρ timeline · drawdown overlap · leaders)</summary>
            <CorrelationPanel
              correlation={correlation}
              envelope={correlationEnvelope}
              lensIndex={lens}
              onLensChange={setLens}
            />
            {correlation?.kind === "PACKED_MATRIX" ? (
              <InfluenceMap matrix={correlation} exposures={new Map(holdings.map((h) => [h.alpha, h.exposurePct]))} />
            ) : null}
            <div className="exec-alpha-tiles">
              <section className="exec-pf2-panel" aria-label="Correlation timeline vs benchmark">
                <header className="exec-pf2-head"><span className="exec-pf2-title">ρ(NAV, {benchmark}) · 30d</span><span className="exec-pf2-spacer" /><span className="exec-pf2-note">corr.v1</span></header>
                <div className="exec-pw-chartplot">
                  {demoPanels?.rhoChart ?? <PanelState status="unavailable" reason="The ρ timeline series is not published yet (BR-EX-65); the matrix above is the published correlation." />}
                </div>
              </section>
              <section className="exec-pf2-panel" aria-label="Drawdown overlap timeline (contract slot)">
                <header className="exec-pf2-head"><span className="exec-pf2-title">Drawdown overlap timeline</span><span className="exec-pf2-spacer" /><span className="exec-pf2-note">drawdown_overlap.v1</span></header>
                <div className="exec-pw-chartplot">
                  {demoPanels?.ddOverlapChart ?? <PanelState status="unavailable" reason="The drawdown-overlap series is not published yet (BR-EX-65)." />}
                </div>
              </section>
            </div>
            {demoPanels ? <p className="exec-af-smoke">! SMOKE DATA — the ρ timeline and drawdown overlap above are synthetic frames (BR-EX-65 publishes the series; the shapes are the reference); every other figure in this disclosure is the published contract. Delete when BR-EX-65/51 ship</p> : null}
            {insight ? (
              <section className="exec-gate-panel">
                <div className="exec-360-colmeta">
                  <StatusChip label={`INSIGHT · ${insight.code}`} tone="warn" />
                  <span className="exec-blotter-note">
                    grade {insight.grade} · {insight.window}
                  </span>
                </div>
                <p>{insight.text}</p>
              </section>
            ) : null}
            <Leaders lists={leaders} />
            </details>
          </>
        ) : null}

        {tab === "Capital Ledger" ? (
          <>
            {demoPanels?.ledger ?? null}
            <details className="exec-pf2-contract" open={!smoke}><summary>published ledger · capital-ledger.v1 contract</summary><Ledger ledger={ledger} totals={ledgerTotals} status={props.ledgerStatus === "ok" ? "empty" : props.ledgerStatus} reason={props.ledgerReason} /></details>
          </>
        ) : null}

        {tab === "Approvals" ? (
          <>
          {demoPanels?.approvals ?? null}
          <details className="exec-pf2-contract" open={!smoke}><summary>published approvals · contract</summary>
          <section className="exec-gate-panel">
            <div className="exec-tile-title">Approvals touching this portfolio</div>
            <div className="exec-scroll-x">
            <table className="exec-360-sync">
              <caption className="exec-blotter-note">Approvals touching this portfolio</caption>
              <thead>
                <tr>
                  <th scope="col">id</th>
                  <th scope="col">gate</th>
                  <th scope="col">subject</th>
                  <th scope="col">decision</th>
                  <th scope="col">approvers</th>
                  <th scope="col">decided</th>
                  <th scope="col">conditions</th>
                </tr>
              </thead>
              <tbody>
                {approvals.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">{row.id}</th>
                    <td>{row.gate}</td>
                    <td>{row.subject}</td>
                    <td>{row.decision}</td>
                    <td>{row.approvers}</td>
                    <td>
                      <Num value={row.decidedAt} absent="not decided" />
                    </td>
                    <td>{row.conditions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </section>
          </details>
          </>
        ) : null}

        {tab === "Incidents" ? (
          <>
          {demoPanels?.incidents ?? null}
          <details className="exec-pf2-contract" open={!smoke}><summary>published incidents · contract</summary>
          {
          // Read, never asserted. The previous version rendered "No open
          // incidents" unconditionally — a claim about safety made by a
          // component that had never been given any incident data, and one
          // that would keep reading clean while a portfolio burned.
          incidents ? (
            <section className="exec-gate-panel">
              <div className="exec-tile-title">
                Incidents — {incidents.open.length} open
              </div>
              {incidents.open.length === 0 ? (
                <p className="exec-blotter-note">
                  No incidents are open against this portfolio in this window.
                </p>
              ) : (
                <div className="exec-scroll-x">
                <table className="exec-360-sync">
                  <thead>
                    <tr>
                      <th scope="col">id</th>
                      <th scope="col">opened</th>
                      <th scope="col">severity</th>
                      <th scope="col">summary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incidents.open.map((row) => (
                      <tr key={row.id}>
                        <th scope="row">{row.id}</th>
                        <td><Num value={row.at} absent="time not stated" /></td>
                        <td>{row.severity}</td>
                        <td>{row.summary}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
              {incidents.resolved.length > 0 ? (
                <div className="exec-scroll-x">
                <table className="exec-360-sync">
                  <caption>resolved — and what closed them</caption>
                  <thead>
                    <tr>
                      <th scope="col">id</th>
                      <th scope="col">resolved</th>
                      <th scope="col">closed by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incidents.resolved.map((row) => (
                      <tr key={row.id}>
                        <th scope="row">{row.id}</th>
                        <td><Num value={row.at} absent="time not stated" /></td>
                        {/* The drawing asks for what closed each one, because
                            "resolved" without a cause is an assertion. */}
                        <td>
                          {row.closedBy ?? (
                            <span className="exec-gate-unverified">not recorded</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              ) : null}
            </section>
          ) : (
            <PanelState
              status="unavailable"
              reason="Incidents for this portfolio have not been published, so none can be claimed either way."
            />
          )
        }
          </details>
          </>
        ) : null}

        {demoPanels?.smokeNote ?? null}
        {tab === "Audit" ? (
          <>
          {demoPanels?.audit ?? null}
          <details className="exec-pf2-contract" open={!smoke}><summary>published audit · contract</summary>
          <PanelState
            status="unavailable"
            reason="The portfolio command journal is not published yet."
          />
          </details>
          </>
        ) : null}
      </div>
      </ExecutionWorkspace>
    </ExecutionSurface>
  );
}
