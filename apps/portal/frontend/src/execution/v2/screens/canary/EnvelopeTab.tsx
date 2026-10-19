/**
 * Envelope tab (hi-fi: Cap / Limit / Approved / Consumed / Used).
 *
 * What the body publishes is the envelope's own value for each cap (a draft is
 * "Proposed", never "Approved"). Limit, Consumed and Used are not published
 * (FE-071). The gauge is drawn only from a ratio the server published (D7): there
 * is no such field today, so no bar is drawn and nothing is divided. The
 * "Within envelope" verdict is the server's to give, and it has not.
 */
import { CardsTable, type CardsColumn } from "../../cardsTable";
import { CapGauge, NotPublished, SectionPanel } from "../../blocks";
import type { CanaryView } from "./readCanary";
import { FE, envelopeColumn, limitRows, panelLine, type LimitRow } from "./model";
import { DecimalCell } from "./parts";

export function EnvelopeTab({ view }: { view: CanaryView }) {
  const rows = limitRows(view);
  const heading = envelopeColumn(view);
  const columns: readonly CardsColumn<LimitRow>[] = [
    { key: "cap", label: "Cap", render: (row) => row.label },
    { key: "limit", label: "Limit", numeric: true, render: () => <NotPublished id={FE.envelope} compact /> },
    { key: "value", label: heading, numeric: true, render: (row) => <DecimalCell fact={row.value} /> },
    { key: "consumed", label: "Consumed", numeric: true, render: () => <NotPublished id={FE.envelope} compact /> },
    {
      key: "used",
      label: "Used",
      render: (row) =>
        row.usedRatio === undefined ? <NotPublished id={FE.envelope} compact /> : <CapGauge ratio={row.usedRatio} label={row.label} />,
    },
  ];

  return (
    <SectionPanel title="Envelope" aside="Used is the server's ratio">
      {view.envelope === null ? (
        <p className="exec-blk-na">
          {view.proposalOnly
            ? `Not available${view.proposalAbsentReason === null ? "" : ` · ${view.proposalAbsentReason}`}`
            : "Not available · the response carries no Canary envelope"}
        </p>
      ) : (
        <>
          <p className="exec-cny-cmpl">
            <NotPublished id={FE.envelope}>Envelope verdict</NotPublished>
            <span className="exec-cny-cmpl-note">{panelLine(view.compliance)}</span>
          </p>
          <CardsTable columns={columns} rows={rows} rowKey={(row) => row.key} label="Canary envelope caps" />
          <p className="exec-cny-foot">
            <NotPublished id={FE.envelope}>Limit, consumed and used</NotPublished>
            {view.envelope.status === "DRAFT" ? " The envelope is a draft, so its values are proposed, not effective." : ""}
          </p>
        </>
      )}
    </SectionPanel>
  );
}
