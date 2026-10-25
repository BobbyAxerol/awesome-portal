/**
 * The Net PnL and Exposure tiles of Alpha 360, per BOOK (QA2 R2-02).
 *
 * Paper and Sandbox are simulated, Canary and Live are the Real-funded domain: a headline that adds them adds economic domains. So the tile
 * is the book in view (the Book the screen is on; by default the alpha's current stage's book), one line per deployment with its own
 * currency, and every other book is listed apart under its own name. Nothing is added across deployments, books or currencies on this
 * page; a figure is the one the resource published for that deployment.
 */
import type { ReactNode } from "react";

import { ENV_LABEL, type ExecEnv } from "../../urlState";
import { Dec, Na } from "./cells";
import { envOfStage, type DeploymentRow } from "./model";

export type BookMetric = "netPnl" | "exposure";

const bookOf = (row: DeploymentRow): ExecEnv | null => row.env ?? envOfStage(row.stage);

function Line({ row, metric }: { row: DeploymentRow; metric: BookMetric }): ReactNode {
  const value = metric === "netPnl" ? row.netPnl : row.exposure;
  return (
    <span className="exec-alp2-fig" data-testid={`book-line-${row.id}`}>
      <span className="exec-alp2-dim">{row.stageLabel} · {row.id} </span>
      <Dec value={value} currency={row.currency ?? undefined} signed={metric === "netPnl"} />
    </span>
  );
}

export function BookFigures({ rows, book, metric }: { rows: readonly DeploymentRow[]; book: ExecEnv; metric: BookMetric }): ReactNode {
  const here = rows.filter((row) => bookOf(row) === book);
  const apart = ENV_ORDER.filter((env) => env !== book).map((env) => ({ env, rows: rows.filter((row) => bookOf(row) === env) })).filter((entry) => entry.rows.length > 0);
  return (
    <>
      <span className="exec-alp2-lines" data-testid="book-here">
        {here.length === 0 ? <Na why={`No deployment of this alpha runs in the ${ENV_LABEL[book]} book.`} /> : here.map((row) => <Line key={row.id} row={row} metric={metric} />)}
      </span>
      {apart.length > 0 ? (
        <details className="exec-alp2-apart" data-testid="book-apart">
          <summary>Other books, apart: {apart.map((entry) => ENV_LABEL[entry.env]).join(", ")}</summary>
          {apart.map((entry) => (
            <span key={entry.env} className="exec-alp2-lines">
              <span className="exec-alp2-dim">{ENV_LABEL[entry.env]}</span>
              {entry.rows.map((row) => <Line key={row.id} row={row} metric={metric} />)}
            </span>
          ))}
        </details>
      ) : null}
    </>
  );
}

const ENV_ORDER: readonly ExecEnv[] = ["live", "paper", "sandbox"];
