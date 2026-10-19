/**
 * Envelope tab (hi-fi: Cap / Limit / Approved / Consumed / Used).
 *
 * What the body publishes is the envelope's own value for each cap (a draft is
 * "Proposed", never "Approved"), the compliance panel's own limits (Limit) and, when
 * it states them, consumed figures keyed by a cap's published name. Anything else
 * is `Not published (FE-071)`. The gauge is drawn only from a ratio the server
 * published (D7): there is no such field today, so no bar is drawn and nothing is
 * divided. The "Within envelope" verdict is the server's to give, and it has not.
 */
import { CardsTable, type CardsColumn } from "../../cardsTable";
import { CapGauge, NotPublished, SectionPanel } from "../../blocks";
import type { CanaryView } from "./readCanary";
import { FE, complianceNotes, envelopeColumn, limitRows, panelLine, type LimitRow } from "./model";
import { DecimalCell } from "./parts";

export function EnvelopeTab({ view }: { view: CanaryView }) {
  const rows = limitRows(view);
  const heading = envelopeColumn(view);
  const notes = complianceNotes(view);
  const columns: readonly CardsColumn<LimitRow>[] = [
    { key: "cap", label: "Cap", render: (row) => row.label },
    { key: "limit", label: "Limit", numeric: true, render: (row) => (row.limit === null ? <NotPublished id={FE.envelope} compact /> : <DecimalCell fact={row.limit} />) },
    { key: "value", label: heading, numeric: true, render: (row) => <DecimalCell fact={row.value} /> },
    { key: "consumed", label: "Consumed", numeric: true, render: (row) => (row.consumed === null ? <NotPublished id={FE.envelope} compact /> : <DecimalCell fact={row.consumed} />) },
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
          {notes.headroom.length > 0 || notes.other.length > 0 ? (
            <ul className="exec-cny-lineage" aria-label="Other published figures">
              {notes.headroom.map((item) => (
                <li key={`headroom-${item.key}`}>
                  Headroom, {item.label.toLowerCase()} <DecimalCell fact={item.value} />
                </li>
              ))}
              {notes.other.map((item) => (
                <li key={`${item.group}-${item.name}`}>
                  {item.group}, {item.name.replace(/_/g, " ")} <span className="exec-blk-num">{item.exact}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {notes.baseRiskProfile === null ? null : (
            <p className="exec-cny-foot">Base risk profile: {notes.baseRiskProfile === "verified" ? "verified" : "not verified"}.</p>
          )}
          <p className="exec-cny-foot">
            <NotPublished id={FE.envelope}>Used ratio and verdict</NotPublished>
            {view.envelope.status === "DRAFT" ? " The envelope is a draft, so its values are proposed, not effective." : ""}
          </p>
        </>
      )}
    </SectionPanel>
  );
}
