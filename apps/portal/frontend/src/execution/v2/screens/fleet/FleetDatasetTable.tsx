/**
 * Fleet rows read from the Manager DATASET (guide M03 section 8.1), on the shared CardsTable.
 *
 * One row is an alpha version in a portfolio (in one environment, when the read is ALL). The columns are the guide's: Alpha / Version,
 * Owner / Portfolio (a badge with the deployments when there are several), Stage Presence, Alloc, PNL Amount, Unrealized PNL, Account balance,
 * Equity 30D (a scalar the reader chooses, and a sparkline from the series port), Health / Source State, QBTS; the optional ones live in the
 * Columns menu. A money column is the row's `economic_partitions`, one cell per partition, never summed or merged across currencies or economic
 * domains (`PartitionFigures`). QBTS is read as published: value, band, evidence, provisional, policy; the client computes none of them.
 * Every absence is a statement: no owner is "Not available"; no single stage names why; days in stage is `Not published (FE-027)`, never a dash
 * and never 0. Sorting is the server's: a header is a sort control only for a field the dataset offers (money fields: with a basis pinned).
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { CardsTable, type CardsColumn } from "../../cardsTable";
import { GapWhy, JourneySpine, NaWhy } from "../../blocks";
import { Spark } from "../../charts";
import { Flag } from "../../Flag";
import type { ManagerRow, ManagerSortField } from "../../readers/managerDataset";
import { FE, healthView, humanize, type UnpublishedFact } from "./fleetModel";
import { ENVIRONMENT_LABEL, inStageOf, lifecycleFlagOf, stageViewOf } from "./fleetDatasetModel";
import {
  DATASET_COLUMNS, equityScalarOf, isMoneyField, qbtsOf, qbtsRows, sortFieldOf, type EquityScalar, type SortKey,
} from "./fleetMetricsModel";
import { DOMAIN_LABEL, PartitionFigures } from "./PartitionFigures";
import { spineStage } from "./FleetTable";
import { sparkKey, type SparkEntry } from "./useFleetSparks";

import "../../css/fleet.css";
import "./partitionFigures.css";
import "./fleetMetrics.css";
import { formatInstant } from "../../boundary";

function StageCell({ row }: { row: ManagerRow }) {
  const view = stageViewOf(row);
  if (view.kind === "single") {
    // The six-node mini spine is drawn from the published current stage alone: no history is inferred (guide section 4, JourneySpine).
    const current = view.code === null ? null : spineStage(view.code);
    return (
      <span className="exec-fleet-stagecell">
        <span className="exec-fleet-stageline">
          <span className="exec-fleet-stage" data-stage={view.code ?? undefined}>{view.label}</span>
        </span>
        {current ? <JourneySpine variant="mini" current={current} label={`${row.name ?? row.alphaId} lifecycle`} /> : null}
      </span>
    );
  }
  if (view.kind === "unpublished") {
    return <NaWhy className="exec-fleet-np" text={view.label} reason={view.reason} />;
  }
  return (
    <span className="exec-fleet-stagecell">
      <span className="exec-fleet-stageline">
        <NaWhy className="exec-fleet-none" text={view.label} reason={view.reason} />
        {view.presence.length > 0 ? <span className="exec-fleet-also">in {view.presence.join(", ")}</span> : null}
      </span>
    </span>
  );
}

function InStageCell({ row }: { row: ManagerRow }) {
  const view = inStageOf(row, formatInstant);
  return view.published
    ? <span title={view.detail}>{view.text}</span>
    : <NaWhy className="exec-fleet-np" text={view.text} reason={view.detail} />;
}

/** The portfolio, and a badge with the deployments behind the row when there are several (guide 8.1: "badge + children"). */
function PortfolioCell({ row }: { row: ManagerRow }) {
  const n = row.children.length;
  return (
    <span className="exec-fleet-portfolio">
      <span className="exec-fleet-trunc" title={row.portfolioId}>{row.portfolioId}</span>
      {n > 1 ? (
        <span className="exec-fleet-badge" title={`${n} deployments: ${row.children.map((child) => `${child.deploymentId} (${child.stage})`).join(", ")}`}>{n}</span>
      ) : null}
    </span>
  );
}

/** QBTS exactly as published (spec 5.8): the value, the band the dataset names, an evidence/provisional flag; the components and policy behind a disclosure. */
export function QbtsCell({ row, carried }: { row: ManagerRow; carried: boolean }) {
  if (!carried) return <NaWhy className="exec-fleet-np" reason="The Manager dataset does not carry score in its published metric set." />;
  const view = qbtsOf(row);
  if (view === null) return <NaWhy className="exec-fleet-np" reason="This row publishes no score." />;
  if (view.kind === "absent") {
    return (
      <span className="exec-fleet-qbts" data-state="absent">
        <NaWhy className="exec-fleet-np" text="Not available" reason={qbtsRows(view).join(" ")} />
        <span className="exec-fleet-qbts-why">{view.reason === null ? "" : humanize(view.reason)}</span>
      </span>
    );
  }
  return (
    <span className="exec-fleet-qbts" data-state="value" data-band={view.band?.code}>
      <span className="exec-mgr-num" title={view.policy === null ? (view.exact ?? undefined) : `${view.exact} · policy ${view.policy}`} data-zero={view.exact === "0" ? "true" : undefined}>{view.exact}</span>
      {view.band ? <Flag kind={view.band.kind} label={view.band.label} size="sm" /> : <span className="exec-fleet-np" title="The dataset names no band for this score.">No band</span>}
      {view.provisional ? <Flag kind="pending" label="Provisional" size="sm" /> : null}
      <GapWhy name={`QBTS details, ${row.name ?? row.alphaId}`} rows={qbtsRows(view)} next={null} />
    </span>
  );
}

/** The requests that publish a money column when the dataset does not carry its metric key. */
const ALLOCATION_GAP: UnpublishedFact = { fe: "BQ-FLEET-ALLOC", what: "Allocation" };
const EQUITY_GAP: UnpublishedFact = { fe: "FE-013", what: "Equity" };
const BALANCE_GAP: UnpublishedFact = { fe: "FE-CAT-7", what: "Account balance" };
const UNREALIZED_GAP: UnpublishedFact = { fe: "FE-CAT-7", what: "Unrealized PNL" };
const SCORE_COVERAGE_GAP: UnpublishedFact = { fe: "FE-CAT-7", what: "Score coverage" };

export interface FleetDatasetTableProps {
  rows: readonly ManagerRow[];
  /** `query_options.metric_keys` of the dataset the rows came from; `null` when unknown. */
  metricKeys?: readonly string[] | null;
  /** FE-CAT-3: an ALL read. Every row names its environment, and the table says it in its own column (never inferred from a stage). */
  showEnvironment?: boolean;
  /** Optional columns the reader switched on (the Columns menu). */
  shownOptional?: ReadonlySet<string>;
  /** Default columns the reader switched off. `alpha` is always shown. */
  hidden?: ReadonlySet<string>;
  /** The fields the dataset offers for sorting (`query_options.sort_fields`), or `null` when unknown. */
  offeredSorts?: readonly ManagerSortField[] | null;
  /** Whether one economic partition is pinned (a money order needs it). */
  basisPinned?: boolean;
  /** The ordered sort keys (priority = position). */
  sorts?: readonly SortKey[];
  onSort?(field: ManagerSortField): void;
  equityScalar?: EquityScalar;
  /** The portfolio NAV series per `sparkKey`, from the series port. */
  sparks?: ReadonlyMap<string, SparkEntry>;
  datasetEnvironment?: string;
  /** The Alpha 360 of the row's alpha, with the context the Fleet carries. */
  hrefFor(row: ManagerRow): string;
  empty?: ReactNode;
  /** The row's `sel` value when its peek is open. */
  selectedKey?: string | null;
  /** A click or Enter on the row opens the peek; the name stays a link to the alpha. */
  onOpen?(row: ManagerRow): void;
  /** Row selection for Compare: only with an explicit capability. Absent, the checkboxes are disabled and name why (aria-describedby). */
  selectionReasonId?: string;
}

export function FleetDatasetTable({
  rows, metricKeys = null, showEnvironment = false, shownOptional, hidden, offeredSorts = null, basisPinned = false, sorts = [], onSort,
  equityScalar = "value", sparks, datasetEnvironment, hrefFor, empty, selectedKey, onOpen, selectionReasonId,
}: FleetDatasetTableProps) {
  const scalar = equityScalarOf(equityScalar);
  const carried = metricKeys === null || metricKeys.includes("score");
  const money = (key: string, gap: UnpublishedFact, signed = false, keys: readonly string[] | null = metricKeys) =>
    (row: ManagerRow) => <PartitionFigures partitions={row.economicPartitions} metricKey={key} metricKeys={keys} gap={gap} signed={signed} />;

  const render: Readonly<Record<string, CardsColumn<ManagerRow>["render"]>> = {
    alpha: (row) => (
      <span className="exec-fleet-alpha">
        <Link className="exec-fleet-name exec-fleet-trunc" title={row.name ?? row.alphaId} to={hrefFor(row)} onClick={(event) => event.stopPropagation()}>{row.name ?? row.alphaId}</Link>
        <span className="exec-fleet-version">{row.alphaVersionId}</span>
      </span>
    ),
    owner: (row) => row.ownerUserId,
    portfolio: (row) => <PortfolioCell row={row} />,
    stage: (row) => <StageCell row={row} />,
    "in-stage": (row) => <InStageCell row={row} />,
    allocation: money("allocation", ALLOCATION_GAP),
    pnl: money("net_pnl", FE.window, true),
    unrealized: money("unrealized_pnl", UNREALIZED_GAP, true),
    balance: money("balance_total", BALANCE_GAP),
    equity: (row) => {
      const environment = row.environment ?? (datasetEnvironment === "ALL" || datasetEnvironment === undefined ? null : datasetEnvironment);
      const spark = environment === null || sparks === undefined ? undefined : sparks.get(sparkKey(environment as "paper" | "sandbox" | "live", row.portfolioId));
      return (
        <span className="exec-fleet-equity">
          <PartitionFigures partitions={row.economicPartitions} metricKey={scalar.key} metricKeys={scalar.id === "drawdown" ? null : metricKeys} gap={scalar.id === "value" ? EQUITY_GAP : { fe: "FE-013", what: scalar.label }} />
          {spark !== undefined && spark.kind === "series" ? (
            <span className="exec-fleet-spark" title={`Portfolio ${row.portfolioId} NAV, 30 days (${spark.basis}); the series port has portfolio and fund subjects only, not the alpha version`}>
              <Spark values={spark.values} unit="money" label={`Portfolio ${row.portfolioId} NAV, 30 days`} width={64} height={16} />
            </span>
          ) : null}
        </span>
      );
    },
    health: (row) => {
      const view = row.health === null ? null : healthView(row.health);
      const lifecycle = lifecycleFlagOf(row.lifecycle);
      if (view === null && lifecycle === null) return null;
      return (
        <span className="exec-fleet-stagecell">
          {view ? <Flag kind={view.kind} label={view.label} size="sm" /> : null}
          {lifecycle ? <Flag kind={lifecycle.kind} label={lifecycle.label} size="sm" /> : null}
        </span>
      );
    },
    source: (row) => (row.sourceState === null ? null : humanize(row.sourceState)),
    qbts: (row) => <QbtsCell row={row} carried={carried} />,
    venue: (row) => row.venue,
    lifecycle: (row) => (row.lifecycle === null ? null : humanize(row.lifecycle)),
    version: (row) => <span className="exec-fleet-trunc" title={row.alphaVersionId}>{row.alphaVersionId}</span>,
    domain: (row) => (row.economicPartitions.length === 0 ? null : (
      <span className="exec-fleet-parts">
        {row.economicPartitions.map((entry) => (
          <span key={`${entry.partition.economicDomain}|${entry.partition.currency}|${entry.partition.nativeProfileRef}`} className="exec-fleet-part-tag" title={`${entry.partition.basis} · ${entry.partition.nativeProfileRef}`}>
            {DOMAIN_LABEL[entry.partition.economicDomain]} · {entry.partition.currency}
          </span>
        ))}
      </span>
    )),
    drawdown: money("max_drawdown_pct", { fe: "FE-013", what: "Drawdown" }, false, null),
    coverage: (row) => {
      const view = qbtsOf(row);
      if (view === null) return <NaWhy className="exec-fleet-np" text={`Not published (${SCORE_COVERAGE_GAP.fe})`} reason="No score on this row, so no coverage." />;
      return <span>{view.evidence === null ? "Evidence not published" : humanize(view.evidence)}</span>;
    },
  };

  const columns: CardsColumn<ManagerRow>[] = [];
  if (selectionReasonId !== undefined) {
    columns.push({
      key: "select", label: "Select",
      render: (row) => <input type="checkbox" disabled aria-describedby={selectionReasonId} aria-label={`Select ${row.name ?? row.alphaId} for compare`} />,
    });
  }
  for (const spec of DATASET_COLUMNS) {
    if (spec.optional ? !(shownOptional?.has(spec.key) ?? false) : spec.key !== "alpha" && (hidden?.has(spec.key) ?? false)) continue;
    const field = sortFieldOf(spec, scalar);
    const offered = field !== null && offeredSorts !== null && offeredSorts.includes(field);
    const askable = offered && (!isMoneyField(field) || basisPinned);
    columns.push({
      key: spec.key,
      label: spec.key === "equity" ? `Equity 30D` : spec.label,
      numeric: spec.numeric && spec.key !== "qbts" ? true : undefined,
      ...(onSort !== undefined && askable ? { sortKey: field } : {}),
      ...(!askable ? { sortOffReason: field === null ? "This column is not a published sort field." : !offered ? "The dataset does not offer this field for sorting." : "A money order needs one economic partition: choose a Basis." } : {}),
      render: render[spec.key]!,
    });
    if (spec.key === "alpha" && showEnvironment) {
      columns.push({
        key: "environment", label: "Environment",
        render: (row) => row.environment === undefined
          ? <NaWhy className="exec-fleet-np" reason="This row does not name its environment." />
          : <span className="exec-fleet-env-tag" data-environment={row.environment}>{ENVIRONMENT_LABEL[row.environment]}</span>,
      });
    }
  }
  return (
    <CardsTable
      label="Alpha fleet"
      className={selectionReasonId !== undefined ? "exec-fleet-dataset exec-fleet-sel" : "exec-fleet-dataset"}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.rowKey}
      selectedKey={selectedKey}
      onRowOpen={onOpen}
      empty={empty}
      sorts={sorts.map((key) => ({ key: key.field, dir: key.dir }))}
      {...(onSort !== undefined ? { onSort: (key: string) => onSort(key as ManagerSortField) } : {})}
    />
  );
}
