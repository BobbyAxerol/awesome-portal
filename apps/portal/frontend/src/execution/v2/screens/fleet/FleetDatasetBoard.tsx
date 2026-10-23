/**
 * Fleet board over the Manager DATASET (QA1 R2-10): the same loaded rows as the table, one lane per lifecycle stage, and a card that carries
 * what the design card carries: allocation (one figure per economic partition, never summed), QBTS as published, health, the stage's mini
 * spine, days in stage when the producer publishes them.
 *
 * Lanes are stage MEMBERSHIPS (`stage_presence`): an alpha in two stages is a card in both lanes, marked "also in" the other. R1 and R2 are
 * spine gates, never lanes. Readiness x/7 and the "Exit review ready" chip are not on the Manager row; each is a typed absence stated once at
 * the lane head, never a made-up number and never derived from the card.
 *
 * It makes no request of its own: it arranges the rows the page already read, keeps the table's filters and keyset "Load more", and says it
 * shows loaded rows only. A card is a link to the alpha's page; a plain click opens the same peek the table row opens.
 */
import type { MouseEvent } from "react";
import { Link } from "react-router-dom";

import { JourneySpine, NaWhy } from "../../blocks";
import { Flag } from "../../Flag";
import { MANAGER_STAGES, type ManagerRow, type ManagerStage } from "../../readers/managerDataset";
import { formatInstant } from "../../boundary";
import { BOARD_READINESS, healthView, notPublished, stageLabel, type UnpublishedFact } from "./fleetModel";
import { inStageOf, ENVIRONMENT_LABEL } from "./fleetDatasetModel";
import { PartitionFigures } from "./PartitionFigures";
import { QbtsCell } from "./FleetDatasetTable";
import { spineStage } from "./FleetTable";

import "../../css/fleet.css";
import "./partitionFigures.css";
import "./fleetMetrics.css";

const ALLOCATION_GAP: UnpublishedFact = { fe: "BQ-FLEET-ALLOC", what: "Allocation" };
const EXIT_REVIEW_GAP: UnpublishedFact = { fe: "FE-027", what: "Exit review readiness" };

const LANE_LABEL: Readonly<Record<ManagerStage, string>> = { PAPER: "Paper", SANDBOX: "Sandbox", CANARY: "Canary", LIVE: "Live" };
const SIMULATED: readonly ManagerStage[] = ["PAPER", "SANDBOX"];

export interface FleetDatasetBoardProps {
  rows: readonly ManagerRow[];
  /** The stages of the lens (empty: all four lanes). */
  stages?: readonly string[];
  metricKeys: readonly string[] | null;
  /** Show the environment tag on a card (an ALL read). */
  showEnvironment?: boolean;
  selectedKey?: string | null;
  hrefFor(row: ManagerRow): string;
  onOpen(row: ManagerRow): void;
}

function Card({ row, lane, selected, href, onOpen, metricKeys, showEnvironment }: {
  row: ManagerRow; lane: ManagerStage; selected: boolean; href: string; onOpen(row: ManagerRow): void; metricKeys: readonly string[] | null; showEnvironment: boolean;
}) {
  const current = spineStage(lane);
  const others = row.stagePresence.filter((code) => code !== lane).map(stageLabel);
  const health = row.health === null ? null : healthView(row.health);
  const carried = metricKeys === null || metricKeys.includes("score");
  const inStage = row.currentStage === lane ? inStageOf(row, formatInstant) : null;
  const click = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onOpen(row);
  };
  return (
    <li className="exec-fleet-card" data-selected={selected ? "true" : undefined} aria-current={selected ? "true" : undefined}>
      <Link className="exec-fleet-card-link" to={href} onClick={click}>
        <span className="exec-fleet-name">{row.name ?? row.alphaId}</span>{" "}
        <span className="exec-fleet-version">{row.alphaVersionId}</span>
        {showEnvironment && row.environment !== undefined ? <> <span className="exec-fleet-env-tag" data-environment={row.environment}>{ENVIRONMENT_LABEL[row.environment]}</span></> : null}
      </Link>
      <span className="exec-fleet-card-owner">
        {row.ownerUserId === null ? <span className="exec-fleet-none">Owner Not available</span> : `Owner ${row.ownerUserId}`}
        {` · ${row.portfolioId}`}
        {row.children.length > 1 ? ` · ${row.children.length} deployments` : ""}
      </span>
      {others.length > 0 ? <span className="exec-fleet-also">also in {others.join(", ")}</span> : null}
      <span className="exec-fleet-card-figures" data-testid="board-figures">
        <span className="exec-fleet-card-fig"><span className="exec-fleet-card-figlabel">Alloc</span><PartitionFigures partitions={row.economicPartitions} metricKey="allocation" metricKeys={metricKeys} gap={ALLOCATION_GAP} /></span>
        <span className="exec-fleet-card-fig"><span className="exec-fleet-card-figlabel">QBTS</span><QbtsCell row={row} carried={carried} /></span>
      </span>
      <span className="exec-fleet-card-health">
        {health ? <Flag kind={health.kind} label={health.label} size="sm" /> : <NaWhy className="exec-fleet-np" text="Health Not available" reason="The dataset published no health for this row." />}
        {inStage !== null && inStage.published ? <span className="exec-fleet-card-instage" title={inStage.detail}>{inStage.text} in stage</span> : null}
      </span>
      {current ? <JourneySpine variant="mini" current={current} label={`${row.name ?? row.alphaId} lifecycle`} /> : null}
    </li>
  );
}

export function FleetDatasetBoard({ rows, stages = [], metricKeys, showEnvironment = false, selectedKey, hrefFor, onOpen }: FleetDatasetBoardProps) {
  const wanted = stages.length === 0 ? MANAGER_STAGES : MANAGER_STAGES.filter((lane) => stages.some((stage) => stage.toUpperCase() === lane));
  return (
    <div className="exec-fleet-board" role="group" aria-label="Alpha fleet board">
      {wanted.map((lane) => {
        const cards = rows.filter((row) => row.stagePresence.includes(lane));
        const domain = SIMULATED.includes(lane) ? "simulated" : "real";
        const headingId = `exec-fleet-lane-${lane.toLowerCase()}`;
        return (
          <section key={lane} className="exec-fleet-lane" data-stage={lane} data-domain={domain} aria-labelledby={headingId}>
            <header className="exec-fleet-lane-head">
              <h3 id={headingId} className="exec-fleet-lane-title">{LANE_LABEL[lane]}</h3>
              <span className="exec-fleet-lane-tag" data-domain={domain}>{domain === "simulated" ? "SIMULATED" : "REAL-FUNDED"}</span>
              <span className="exec-fleet-lane-count">{cards.length} loaded</span>
              <span className="exec-fleet-sr exec-fleet-lane-gap">Readiness: {notPublished(BOARD_READINESS)} for every alpha here. Exit review: {notPublished(EXIT_REVIEW_GAP)}.</span>
            </header>
            {cards.length === 0 ? (
              <p className="exec-fleet-lane-empty">No loaded alpha is in this stage.</p>
            ) : (
              <ul className="exec-fleet-lane-cards" aria-label={`${LANE_LABEL[lane]}, ${cards.length} loaded`}>
                {cards.map((row) => (
                  <Card key={`${row.rowKey}|${lane}`} row={row} lane={lane} selected={row.rowKey === selectedKey} href={hrefFor(row)} onOpen={onOpen} metricKeys={metricKeys} showEnvironment={showEnvironment} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
