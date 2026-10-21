/**
 * The event ribbon of Portfolio 360 (concept C3), under the equity panel.
 *
 * It draws what the published capital ledger can honestly place and nothing
 * more:
 * - `flow`: one mark per ledger entry that moved allocated capital, titled with
 *   the published movement word and the exact amount in its own currency. No
 *   amount is added to another, within a currency or across currencies;
 * - `stage`, `decision`, `incident`, `recall`: no source is published (FE-031,
 *   FE-032). The lanes stay on the ribbon and say so; they are not empty lanes.
 *   The ledger carries no movement word for a recall, so recall is among them.
 *
 * The ledger read is bounded to the latest entries and has no older page, so
 * the caption says "latest N of total" with the exact numbers. The ribbon is a
 * picture; the same entries are in the table under "Flow events as a table".
 */
import { useState } from "react";

import type { CapitalLedger } from "../../../../analytics";
import { formatExact } from "../../../../formatExact";
import { EventKindChips, EventRibbon, type ChartDomain, type EventKind } from "../../../charts";
import { CardsTable, type CardsColumn } from "../../../cardsTable";
import { Money, envWord } from "../format";
import type { TabCtx } from "./ctx";
import { RIBBON_UNPUBLISHED, ledgerFlow, unreadEntries, type LedgerRowView } from "./model";
import { ReadGate } from "./parts";

import "../../../css/portfolios.css";
import { formatInstant } from "../../../boundary";

const TABLE_CAP = 200;
const count = (n: number): string => formatExact(String(n), "count").display;

/** `Latest 1,500 of 4,180 entries, no older page`; the exact numbers the server published, never a guess. */
export function boundedCaption(ledger: CapitalLedger): string {
  const { total, returned, hasMore } = ledger.bounded;
  if (returned === null) return "The ledger read did not publish how many entries it returned";
  if (total === null) return `Latest ${count(returned)} entries; the total is not published${hasMore ? ", no older page" : ""}`;
  if (hasMore || returned < total) return `Latest ${count(returned)} of ${count(total)} entries, no older page`;
  return `${count(returned)} of ${count(total)} entries`;
}

function tableColumns(): readonly CardsColumn<LedgerRowView>[] {
  return [
    { key: "time", label: "Time · UTC", render: (row) => (row.entry.occurredAt === null ? "Time not published" : formatInstant(row.entry.occurredAt)) },
    { key: "event", label: "Event", render: (row) => row.movement },
    { key: "direction", label: "Direction", render: (row) => row.direction },
    { key: "account", label: "Account", render: (row) => row.entry.accountId },
    { key: "amount", label: "Amount", numeric: true, render: (row) => <Money value={row.entry.amount} currency={row.currency} /> },
  ];
}

export interface FlowRibbonProps {
  ctx: TabCtx;
  /** The window the equity panel draws; without one there is no axis to hang the ribbon on. */
  domain: ChartDomain | null;
  lanes: Partial<Record<EventKind, boolean>>;
}

/** The lanes, for `EquityPanel`'s `ribbon` slot. */
export function FlowRibbonLanes({ ctx, domain, lanes }: FlowRibbonProps) {
  const env = ctx.reads.selected;
  const read = ctx.reads.ledgers[env];
  return (
    <ReadGate state={read} idle={<p className="exec-pf-note">The capital ledger is read once the portfolio resolves.</p>}>
      {(value) => (domain === null ? (
        <p className="exec-pf-note" role="status">
          The ribbon needs the equity time axis, and the chart read published none. The {ledgerFlow(value.ledger).rows.length} flow
          entries read are in the table below.
        </p>
      ) : (
        <EventRibbon
          label={`Capital flow events, ${envWord(env)}`}
          events={ledgerFlow(value.ledger).events}
          domain={domain}
          enabled={lanes}
          unpublished={RIBBON_UNPUBLISHED}
        />
      ))}
    </ReadGate>
  );
}

/** The lane filter, shown only once the ledger has answered. */
export function FlowRibbonChips({ ctx, domain, lanes, onToggle }: FlowRibbonProps & { onToggle(kind: EventKind): void }) {
  const read = ctx.reads.ledgers[ctx.reads.selected];
  const ledger = read.phase === "ready" ? read.value.ledger : read.phase === "loading" || read.phase === "error" ? read.last?.ledger ?? null : null;
  if (ledger === null || domain === null) return null;
  return <EventKindChips events={ledgerFlow(ledger).events} domain={domain} enabled={lanes} onToggle={onToggle} unpublished={RIBBON_UNPUBLISHED} />;
}

function Notes({ ledger, env }: { ledger: CapitalLedger; env: string }) {
  const flow = ledgerFlow(ledger);
  const unread = unreadEntries(ledger);
  const shown = flow.rows.slice(0, TABLE_CAP);
  return (
    <div className="exec-pf-ribbon-notes">
      <p className="exec-pf-caption">
        <span title={`Flow lane: allocation ledger entries in ${envWord(env)}, per currency, never added together`}>Bounded: {boundedCaption(ledger)}</span>
      </p>

      {flow.undated > 0 ? (
        <p className="exec-pf-note" role="status">
          {count(flow.undated)} {flow.undated === 1 ? "entry has" : "entries have"} no readable time and {flow.undated === 1 ? "is" : "are"} not on the ribbon.
        </p>
      ) : null}
      {flow.unchanged > 0 ? (
        <p className="exec-pf-note">
          {count(flow.unchanged)} {flow.unchanged === 1 ? "entry" : "entries"} left the allocation unchanged and {flow.unchanged === 1 ? "is" : "are"} not drawn as a flow. They are in the Allocations ledger.
        </p>
      ) : null}
      {unread !== null && unread > 0 ? (
        <p className="exec-pf-banner" role="status">
          {count(unread)} returned {unread === 1 ? "entry" : "entries"} could not be read and {unread === 1 ? "is" : "are"} not shown. The ribbon is incomplete.
        </p>
      ) : null}
      {flow.read === 0 ? (
        <p className="exec-pf-note">The ledger published no entry in {envWord(env)}. An empty ledger is a fact, not a zero balance.</p>
      ) : null}
      <details className="exec-pf-ribbon-alt">
        <summary>Flow events as a table ({count(flow.rows.length)})</summary>
        {flow.rows.length === 0 ? (
          <p className="exec-pf-note">No flow entry with a readable time in the ledger read.</p>
        ) : (
          <>
            <CardsTable label={`Capital flow events in ${envWord(env)}`} columns={tableColumns()} rows={shown} rowKey={(row) => row.key} />
            {flow.rows.length > shown.length ? (
              <p className="exec-pf-note" role="status">Showing the first {TABLE_CAP} of {count(flow.rows.length)} flow events. The Allocations tab holds the ledger.</p>
            ) : null}
          </>
        )}
      </details>
    </div>
  );
}

/** Caption, the honest absences and the table alternative, under the equity panel. */
export function FlowRibbonNotes({ ctx }: { ctx: TabCtx }) {
  const env = ctx.reads.selected;
  return (
    <ReadGate state={ctx.reads.ledgers[env]} idle={null}>
      {(value) => <Notes ledger={value.ledger} env={env} />}
    </ReadGate>
  );
}

/** Local lane toggles, kept by the caller so the chips and the ribbon agree. */
export function useRibbonLanes(): [Partial<Record<EventKind, boolean>>, (kind: EventKind) => void] {
  const [lanes, setLanes] = useState<Partial<Record<EventKind, boolean>>>({});
  return [lanes, (kind) => setLanes((prev) => ({ ...prev, [kind]: prev[kind] === false }))];
}
