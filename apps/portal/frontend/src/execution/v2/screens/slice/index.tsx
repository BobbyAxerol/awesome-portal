/**
 * Scoped slice (UXM-08, flag key `scoped`, FIXTURE ONLY): one portfolio, its fleet and an alpha, read-only, under a scope
 * banner, with the life cycle of the notification stream that would keep it current.
 *
 * It wires the EXISTING V2 screens together by link (Portfolio 360, Alpha Fleet, Alpha 360) and rewrites none of them.
 * Everything on this page comes from the published synthetic examples (`canonicalLane.ts`) through the strict readers, and
 * the page says so in the place a reader looks first: "Fixture frames, not a real stream" and "Not connected to a real
 * source". Nothing opens a stream, polls, fetches or sends. The buttons in the fixture group call the controller directly.
 *
 * UX-F02/03/04/05/07/19/21 are covered only as far as the examples reach; `evidence/UXM-08/README.md` lists what they cannot.
 *
 * Scale and degradation: one page of at most 100 rows (the contract's own cap), no client paging, sorting or totals; the
 * server's page is the page. Past one page the screen says "More pages exist" and offers nothing it cannot back.
 */
import { useEffect, useMemo, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { ExecutionSurface } from "../../../ExecutionSurface";
import { SectionPanel, StateBoundary, MetricText, NotPublished } from "../../blocks";
import { CardsTable, type CardsColumn } from "../../cardsTable";
import { Flag } from "../../Flag";
import type { FlagKind } from "../../flagKinds";
import { readAsOf, formatAsOf } from "../../boundary";
import type { Clock } from "../../realtime/scopedStreamController";
import { useScopedStream } from "../../realtime/useScopedStream";
import type { StreamConfig, StreamState } from "../../realtime/scopedStreamMachine";
import { DROP_COPY, FIXTURE_LANE_LABEL, NOT_CONNECTED_LABEL, POSTURE_COPY, causeCopy, streamHeadline } from "../../realtime/streamView";
import { evictScopedCaches } from "../../scopedEviction";
import { ENV_LABEL, withContext } from "../../urlState";
import { DEFAULT_ROUTES } from "../portfolios/routes";
import {
  FIXTURE_FRAME_IDS,
  NEXT_READ_LABEL,
  PAGE_REVOCATIONS,
  createFixtureLane,
  fixtureFrame,
  type FixtureFrameId,
  type FixtureLane,
  type NextRead,
  type RevocationMemory,
} from "./canonicalLane";
import { connectionKey, environmentWord, fleetRows, portfolioRows, scopeLines, type FleetRow, type PortfolioRow, type SliceContext } from "./model";
import type { ScopedRead } from "./scopedRead";

import "../../css/blocks.css";
import "../../css/flag.css";
import "../../css/cards.css";
import "./slice.css";

export const SLICE_SCREEN_KEY = "scoped" as const;

export interface SliceScreenProps {
  /** The URL context the lane is asked to authorize. */
  context: SliceContext;
  /** Injected by tests; the page uses the system clock. */
  clock?: Clock;
  config?: StreamConfig;
  /** Injected by tests to hold a read open; the page builds the published-example lane itself. */
  lane?: FixtureLane;
  /** The fixture server's memory of withdrawn access (the route passes the page's). Without it a lane forgets, per mount. */
  revocations?: RevocationMemory;
}

const FRAME_BUTTON: Readonly<Record<FixtureFrameId, string>> = {
  "N09-REVALIDATE": "Revalidate notice",
  "N09-HEARTBEAT": "Heartbeat",
  "N09-RESYNC_REQUIRED": "Resync required",
  "N09-ACCESS_REVOKED": "Access revoked",
  "N09-UNAVAILABLE": "Source unavailable",
};

const BURST = 50;
const DISPOSITION_FLAG: Readonly<Record<string, FlagKind>> = { PARTIAL: "partial", DENIED: "rejected", UNAVAILABLE: "attention" };
const AVAILABILITY_FLAG: Readonly<Record<string, { kind: FlagKind; label: string }>> = {
  AVAILABLE: { kind: "ok", label: "Available" },
  PARTIAL: { kind: "partial", label: "Partial" },
  NOT_PUBLISHED: { kind: "unknown", label: "Not published" },
};

function ScopePanel({ read }: { read: ScopedRead }) {
  const lines = scopeLines(read);
  const readAt = readAsOf(read.readAtMs);
  return (
    <SectionPanel title="Your scope" level={2}>
      <ul className="exec-slice-lines">
        <li>{lines.scope}</li>
        <li>{lines.totals}</li>
        <li>{lines.completeness}</li>
        <li>{lines.page}{lines.morePages ? ". More pages exist." : "."}</li>
        <li>{lines.policy}</li>
      </ul>
      <dl className="exec-slice-facts">
        <div>
          <dt>Workspace</dt>
          <dd className="exec-slice-id">{read.workspaceId}</dd>
        </div>
        <div>
          <dt>Environment</dt>
          <dd>{environmentWord(read.environment)}</dd>
        </div>
        <div>
          <dt>Read at</dt>
          <dd>{readAt === null ? "Unreadable instant" : formatAsOf(readAt)}</dd>
        </div>
      </dl>
      {read.dispositions.length === 0 ? null : (
        <ul className="exec-slice-lines" aria-label="Environment dispositions">
          {read.dispositions.map((d) => (
            <li key={d.environment}>
              {ENV_LABEL[d.environment]} <Flag kind={DISPOSITION_FLAG[d.state] ?? "unknown"} label={d.state === "PARTIAL" ? "Partial" : d.state === "DENIED" ? "Denied" : "Unavailable"} size="sm" />
              {d.reasonCode === null ? <span className="exec-slice-muted"> No reason published</span> : <span className="exec-slice-muted"> {d.reasonCode}</span>}
            </li>
          ))}
        </ul>
      )}
    </SectionPanel>
  );
}

function PortfoliosPanel({ rows, search }: { rows: readonly PortfolioRow[]; search: URLSearchParams }) {
  const columns: CardsColumn<PortfolioRow>[] = [
    { key: "id", label: "Portfolio", render: (row) => <span className="exec-slice-id">{row.portfolioId}</span> },
    { key: "name", label: "Name", render: () => <NotPublished id="FE-066">Portfolio name</NotPublished> },
    { key: "rows", label: "Rows on this page", numeric: true, render: (row) => row.rowsOnThisPage },
    { key: "env", label: "Environment", render: (row) => row.environments.map((env) => ENV_LABEL[env]).join(", ") },
    {
      key: "open",
      label: "Open",
      render: (row) => (
        <Link className="exec-slice-link" to={withContext(DEFAULT_ROUTES.portfolio(row.portfolioId), search)}>
          Open portfolio
        </Link>
      ),
    },
  ];
  return (
    <SectionPanel title="Portfolios in view" level={2}>
      <CardsTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.portfolioId}
        label="Portfolios in view"
        empty={<span className="exec-slice-muted">No portfolio is named on this page.</span>}
      />
    </SectionPanel>
  );
}

function FleetPanel({ rows, search }: { rows: readonly FleetRow[]; search: URLSearchParams }) {
  const columns: CardsColumn<FleetRow>[] = [
    {
      key: "alpha",
      label: "Alpha",
      render: (row) => (
        <span className="exec-slice-alpha">
          {row.alphaName === null ? <NotPublished id="FE-066">Alpha name</NotPublished> : <span>{row.alphaName}</span>}
          {row.alphaId === null ? null : (
            <Link className="exec-slice-link exec-slice-id" to={withContext(DEFAULT_ROUTES.alpha(row.alphaId), search)}>
              {row.alphaId}
            </Link>
          )}
        </span>
      ),
    },
    { key: "portfolio", label: "Portfolio", render: (row) => (row.portfolioId === null ? <span className="exec-slice-muted">Not named in this row</span> : <span className="exec-slice-id">{row.portfolioId}</span>) },
    { key: "env", label: "Environment", render: (row) => environmentWord(row.environment) },
    {
      key: "allocation",
      label: "Allocation",
      numeric: true,
      render: (row) =>
        row.allocation.length === 0 ? (
          <MetricText metric={row.allocationAbsent} />
        ) : (
          <span className="exec-slice-money">
            {row.allocation.map((cell) => (
              <MetricText key={cell.currency} metric={cell.metric} suffix={cell.currency} />
            ))}
          </span>
        ),
    },
    {
      key: "financial",
      label: "Financial data",
      render: (row) => {
        const flag = AVAILABILITY_FLAG[row.availability.state] ?? { kind: "unknown" as const, label: "Unknown" };
        return (
          <span className="exec-slice-avail">
            <Flag kind={flag.kind} label={flag.label} size="sm" />
            <span className="exec-slice-muted">{row.availability.reasonCode}</span>
          </span>
        );
      },
    },
    {
      key: "instances",
      label: "Instances",
      render: (row) => (row.instances === 0 ? <span className="exec-slice-muted">None in this read</span> : `${row.instances} in this read`),
    },
  ];
  return (
    <SectionPanel
      title="Fleet on this page"
      level={2}
      aside={
        <Link className="exec-slice-link" to={withContext(DEFAULT_ROUTES.fleet, search)}>
          Open Alpha Fleet
        </Link>
      }
    >
      <CardsTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.key}
        label="Fleet on this page"
        empty={<span className="exec-slice-muted">No row is visible to you in this read.</span>}
      />
    </SectionPanel>
  );
}

function boundaryFor<T>(state: StreamState<T>): {
  status: "ok" | "loading" | "stale" | "unavailable" | "denied";
  reason?: string;
} {
  switch (state.phase) {
    case "idle":
    case "loading":
      return { status: "loading" };
    case "live":
    case "revalidating":
      return { status: "ok" };
    case "access_revoked":
      return { status: "denied", reason: state.cause === null ? "Your access changed." : causeCopy(state.cause) };
    case "resync_required":
    case "unavailable": {
      const why = state.cause === null ? "The stream is not available." : causeCopy(state.cause);
      return state.data === null ? { status: "unavailable", reason: why } : { status: "stale", reason: `${why} ${POSTURE_COPY.not_confirmed}` };
    }
  }
}

export function SliceScreen({ context, clock, config, lane: injected, revocations }: SliceScreenProps) {
  const [search] = useSearchParams();
  const connection = connectionKey(context);
  const lane = useMemo(() => injected ?? createFixtureLane(context, revocations), [injected, context, revocations]);
  const { state, receive, retry } = useScopedStream<ScopedRead>({ snapshot: lane.port, connection, clock, config });
  // UXM08-DEBT-1: a revoked frame or a DENIED snapshot read also empties what the linked screens (Portfolio 360, Alpha Fleet,
  // Alpha 360) read under this scope, once per entry into the phase. Leaving the page is not a cause and evicts nothing.
  const revoked = state.phase === "access_revoked";
  const denied = revoked && state.cause?.origin === "local" && state.cause.code === "SNAPSHOT_DENIED";
  useEffect(() => {
    if (!revoked) return;
    lane.revoke();
    evictScopedCaches(denied ? "SNAPSHOT_DENIED" : "ACCESS_REVOKED");
  }, [revoked, denied, lane]);

  const headline = streamHeadline(state);
  const chip = headline.chip;
  const boundary = boundaryFor(state);
  const read = state.data;
  const readAt = read === null ? null : readAsOf(read.readAtMs);

  const send = (id: FixtureFrameId, on: string = connection) => receive(fixtureFrame(id), on);
  const dropped = Object.entries(state.drops).filter(([, count]) => count > 0);
  const droppedTotal = dropped.reduce((sum, [, count]) => sum + count, 0);

  const actions: ReactNode =
    boundary.status === "denied" ? (
      <Link className="exec-slice-link" to={withContext(DEFAULT_ROUTES.access, search)}>
        Open My access
      </Link>
    ) : (boundary.status === "stale" || boundary.status === "unavailable") && state.inFlight === null ? (
      <button type="button" className="exec-slice-btn" onClick={retry}>
        Retry once
      </button>
    ) : undefined;

  return (
    <ExecutionSurface kind="deployments" data-screen="slice-v2">
      <div className="exec-slice">
        <header className="exec-slice-head">
          <div>
            <h1 className="exec-slice-title">Scoped slice</h1>
            <p className="exec-slice-sub">Portfolio, fleet and alpha, read-only</p>
          </div>
          <div className="exec-slice-chips" role="status" aria-live="polite" data-testid="stream-chip">
            <Flag kind={chip.kind} label={chip.label} />
          </div>
        </header>
        <p className="exec-slice-lane" role="note">
          <strong>{FIXTURE_LANE_LABEL}.</strong> {NOT_CONNECTED_LABEL}.
        </p>

        <SectionPanel title="Stream" level={2}>
          <p className="exec-slice-line">{headline.line}</p>
          {headline.next === null ? null : <p className="exec-slice-next">{headline.next}</p>}
          <dl className="exec-slice-facts" data-testid="stream-facts">
            <div>
              <dt>Data</dt>
              <dd>
                {POSTURE_COPY[state.posture]}
                {readAt === null ? null : <> Read {formatAsOf(readAt)}.</>}
              </dd>
            </div>
            <div>
              <dt>Notices</dt>
              <dd>
                {state.counters.revalidates} received, {state.counters.coalesced} folded into an owed read, {state.counters.readsStarted} reads started
              </dd>
            </div>
            <div>
              <dt>Heartbeats</dt>
              <dd>{state.counters.heartbeats} (liveness only)</dd>
            </div>
            <div>
              <dt>Dropped</dt>
              <dd>
                {droppedTotal === 0
                  ? "None"
                  : dropped.map(([reason, count]) => `${DROP_COPY[reason as keyof typeof DROP_COPY]} ${count}`).join(", ")}
              </dd>
            </div>
          </dl>
          {state.notice === null ? null : (
            <details className="exec-slice-details">
              <summary>Last notice: quality of the notice, not of the data</summary>
              <ul className="exec-slice-lines">
                <li>Completeness {state.notice.quality.completeness.toLowerCase()}</li>
                <li>Freshness {state.notice.quality.freshness.toLowerCase()}</li>
                <li>Coverage {state.notice.quality.coverage.toLowerCase().replace(/_/g, " ")}</li>
                <li>Confidence {state.notice.quality.confidence.toLowerCase()}</li>
                <li>
                  {state.notice.quality.sourceAsOfMs === null
                    ? "The source did not state its own time"
                    : `Source time ${formatAsOf(state.notice.quality.sourceAsOfMs)}`}
                </li>
              </ul>
            </details>
          )}
          <fieldset className="exec-slice-fixture">
            <legend>{FIXTURE_LANE_LABEL}</legend>
            <div className="exec-slice-buttons">
              {FIXTURE_FRAME_IDS.map((id) => (
                <button key={id} type="button" className="exec-slice-btn" onClick={() => send(id)}>
                  {FRAME_BUTTON[id]}
                </button>
              ))}
              <button
                type="button"
                className="exec-slice-btn"
                onClick={() => {
                  for (let i = 0; i < BURST; i += 1) send("N09-REVALIDATE");
                }}
              >
                {BURST} notices at once
              </button>
              <button type="button" className="exec-slice-btn" onClick={() => send("N09-REVALIDATE", "previous-connection")}>
                Late frame from the previous scope
              </button>
              <button type="button" className="exec-slice-btn" onClick={() => receive({ ...(fixtureFrame("N09-REVALIDATE") as object), unexpected: true }, connection)}>
                Malformed frame
              </button>
            </div>
            <label className="exec-slice-dial">
              Next snapshot read{" "}
              <select defaultValue="ok" onChange={(event) => lane.setNext(event.target.value as NextRead)}>
                {(Object.keys(NEXT_READ_LABEL) as NextRead[]).map((key) => (
                  <option key={key} value={key}>
                    {NEXT_READ_LABEL[key]}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
        </SectionPanel>

        {boundary.status === "denied" ? (
          <StateBoundary status="denied" reason={boundary.reason ?? "Your access changed."} actions={actions} />
        ) : boundary.status === "loading" ? (
          <StateBoundary status="loading" />
        ) : boundary.status === "unavailable" ? (
          <StateBoundary status="unavailable" reason={boundary.reason ?? "The stream is not available."} actions={actions} />
        ) : read === null ? null : boundary.status === "stale" ? (
          <StateBoundary status="stale" reason={boundary.reason} actions={actions}>
            <ScopePanel read={read} />
            <PortfoliosPanel rows={portfolioRows(read)} search={search} />
            <FleetPanel rows={fleetRows(read)} search={search} />
          </StateBoundary>
        ) : (
          <>
            <ScopePanel read={read} />
            <PortfoliosPanel rows={portfolioRows(read)} search={search} />
            <FleetPanel rows={fleetRows(read)} search={search} />
          </>
        )}
      </div>
    </ExecutionSurface>
  );
}

/** Route entry: the URL context (`workspace_id`, `env`) is what the lane is asked to authorize. */
export default function SliceRoute() {
  const [search] = useSearchParams();
  const workspaceId = search.get("workspace_id");
  const environment = search.get("env");
  const context = useMemo<SliceContext>(() => ({ workspaceId, environment }), [workspaceId, environment]);
  return <SliceScreen context={context} revocations={PAGE_REVOCATIONS} />;
}
