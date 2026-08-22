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
import { useState } from "react";

import {
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
  onTabChange?: (tab: PortfolioTab) => void;
  kpis: readonly { label: string; value: string | null; unit?: string | null }[];
  holdings: readonly HoldingRow[];
  /** FX note the hi-fi requires wherever a total crosses currencies. */
  fxNote?: string | null;
  correlation: Correlation | null;
  correlationEnvelope?: Envelope;
  /** Index of the alpha the leader lens is focused on. */
  lensIndex?: number | null;
  onLensChange?: (index: number | null) => void;
  leaders: readonly LeaderList[];
  insight?: { code: string; grade: string; window: string; text: string } | null;
  ledger: CapitalLedger | null;
  ledgerTotals?: { allocated: string; max: string; free: string; currency: string } | null;
  approvals: readonly ApprovalRow[];
  status?: PanelStatus;
  reason?: string;
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

function CorrelationMatrix({
  matrix,
  lensIndex,
  onLensChange,
}: {
  matrix: PackedCorrelation;
  lensIndex: number | null;
  onLensChange?: (index: number | null) => void;
}) {
  const labels = matrix.labels;
  return (
    <div className="exec-pf-matrixwrap">
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
                  onClick={() => onLensChange?.(row === lensIndex ? null : row)}
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
                    title={
                      cell.samples !== null ? `${cell.samples} samples` : "sample count not published"
                    }
                  >
                    <span className="exec-num">{cell.text}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
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
  onLensChange?: (index: number | null) => void;
}) {
  const subject = matrix.labels[lensIndex];
  const others = matrix.labels
    .map((label, index) => ({ label, index, ...cellText(matrix, lensIndex, index) }))
    .filter((entry) => entry.index !== lensIndex);
  const ranked = [...others].sort((a, b) => {
    if (a.insufficient !== b.insufficient) return a.insufficient ? 1 : -1;
    return Math.abs(Number(b.text)) - Math.abs(Number(a.text));
  });
  const shown = capPreserving(ranked, 40, (entry) => entry.insufficient);
  const notice = capNotice(shown, "pairs");

  return (
    <div>
      <label className="exec-alpha-select">
        <span>Leader lens</span>
        <select
          value={lensIndex}
          onChange={(event) => onLensChange?.(Number(event.target.value))}
        >
          {matrix.labels.map((label, index) => (
            <option key={label.entityId} value={index}>
              {label.displayName}
            </option>
          ))}
        </select>
      </label>
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
  onLensChange?: (index: number | null) => void;
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
}: {
  ledger: CapitalLedger | null;
  totals: PortfolioThreeSixtyProps["ledgerTotals"];
}) {
  if (!ledger) return <PanelState status="loading" reason="Loading the capital ledger." />;
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
      {ledger.buckets.map((bucket) => {
        // Bucketed, never merged. Two currencies in one running total is a
        // number with no unit, and the ledger's own invariant is per-currency.
        const shown = capPreserving(
          bucket.entries,
          50,
          (entry) => entry.direction !== "INCREASE",
        );
        const notice = capNotice(shown, `${bucket.currency} entries`);
        return (
          <div key={bucket.currency}>
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
                    <td>{entry.allocationId ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {notice ? <p className="exec-blotter-note">{notice}</p> : null}
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
    status = "ok",
    reason,
  } = props;

  const [localLens, setLocalLens] = useState<number | null>(null);
  const lens = lensIndex ?? localLens;
  const setLens = onLensChange ?? setLocalLens;

  if (status !== "ok" && status !== "partial") {
    return (
      <ExecutionSurface kind="deployments" className="exec-pf">
        <PanelState status={status} reason={reason ?? "This portfolio could not be read."} />
      </ExecutionSurface>
    );
  }

  const shownHoldings = capPreserving(holdings, 40, (row) => row.readiness !== "READY");
  const holdingsNotice = capNotice(shownHoldings, "holdings");

  return (
    <ExecutionSurface kind="deployments" className="exec-pf">
      <header className="exec-inbox-head">
        <div className="exec-tile-title">
          {portfolioName} · <span className="exec-num">{portfolioId}</span>
        </div>
        <div className="exec-alpha-identity">
          <AuthorityBadge envelope={envelope} />
          <span className="exec-blotter-note">
            window {scopeWindow} · benchmark {benchmark} ({benchmarkId})
          </span>
        </div>
      </header>

      <div className="exec-alpha-tabs" role="tablist" aria-label="Portfolio detail">
        {PORTFOLIO_TABS.map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            className="exec-inbox-filter"
            data-active={tab === option ? "true" : undefined}
            aria-selected={tab === option}
            onClick={() => onTabChange?.(option)}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="exec-alpha-body" role="tabpanel" aria-label={tab}>
        {tab === "Overview" ? (
          <>
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
            <section className="exec-gate-panel">
              <div className="exec-tile-title">
                Holdings structure — portfolio → alpha → deployment → account
              </div>
              <div className="exec-blotter-note">
                one account = one alpha, never shared
              </div>
              <table className="exec-alpha-deployments">
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
                  {shownHoldings.shown.map((row) => (
                    <tr
                      key={row.deploymentId}
                      data-emphasis={row.readiness !== "READY" ? "warn" : undefined}
                    >
                      <th scope="row">{row.alpha}</th>
                      <td>{row.deploymentId}</td>
                      <td>{row.accountId}</td>
                      <td>
                        {row.venue} · {row.mode}
                      </td>
                      <td>
                        <Num value={row.allocation} absent="—" />
                        <span className="exec-blotter-note"> {row.currency}</span>
                      </td>
                      <td>
                        <Num value={row.exposure} absent="—" />
                      </td>
                      <td>
                        <Num value={row.exposurePct} absent="—" />
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
              {holdingsNotice ? <p className="exec-blotter-note">{holdingsNotice}</p> : null}
              {/* Required wherever a total crosses currencies. A portfolio total
                  over USDT and USDC is only meaningful with a named rate, and
                  the note names it. */}
              {fxNote ? <p className="exec-blotter-note">{fxNote}</p> : null}
            </section>
          </>
        ) : null}

        {tab === "Structure & Correlation" ? (
          <>
            <CorrelationPanel
              correlation={correlation}
              envelope={correlationEnvelope}
              lensIndex={lens}
              onLensChange={setLens}
            />
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
          </>
        ) : null}

        {tab === "Capital Ledger" ? <Ledger ledger={ledger} totals={ledgerTotals} /> : null}

        {tab === "Approvals" ? (
          <section className="exec-gate-panel">
            <div className="exec-tile-title">Approvals touching this portfolio</div>
            <table className="exec-360-sync">
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
          </section>
        ) : null}

        {tab === "Incidents" ? (
          // The wireframe keeps this honest rather than filling it: zero open
          // incidents with a resolved history is a real and useful state.
          <PanelState status="empty" reason="No open incidents for this portfolio." />
        ) : null}

        {tab === "Audit" ? (
          <PanelState
            status="unavailable"
            reason="The portfolio command journal is not published yet."
          />
        ) : null}
      </div>
    </ExecutionSurface>
  );
}
