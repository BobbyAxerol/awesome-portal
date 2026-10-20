/**
 * Envelope tab (hi-fi: Cap / Limit / Approved / Consumed / Used).
 *
 * What the body publishes is the envelope's own value for each cap (a draft is
 * "Proposed", never "Approved"), and, per cap, the compliance row (FE-071): the base risk
 * profile's Limit, Consumed and the SERVER's used ratio, each a fact that is published or says
 * why it is not (`Not published (FE-071)`, the server's reason code in the title). The gauge
 * is drawn only from that ratio (D7); nothing is divided here. The verdict chip is the
 * server's (`WITHIN_ENVELOPE`, `BREACH`, `UNDETERMINED`); a body without a verdict says so.
 */
import { CardsTable, type CardsColumn } from "../../cardsTable";
import { CapGauge, NotPublished, SectionPanel } from "../../blocks";
import { Flag } from "../../Flag";
import type { CanaryView } from "./readCanary";
import { FE, complianceNotes, envelopeColumn, limitRows, panelLine, verdictLine, type LimitRow } from "./model";
import { DecimalCell } from "./parts";

export function EnvelopeTab({ view }: { view: CanaryView }) {
  const rows = limitRows(view);
  const heading = envelopeColumn(view);
  const notes = complianceNotes(view);
  const verdict = verdictLine(view);
  const columns: readonly CardsColumn<LimitRow>[] = [
    { key: "cap", label: "Cap", render: (row) => row.label },
    { key: "limit", label: "Limit", numeric: true, render: (row) => (row.limit === null ? <NotPublished id={FE.envelope} titleReason={row.limitReason} compact /> : <DecimalCell fact={row.limit} />) },
    { key: "value", label: heading, numeric: true, render: (row) => <DecimalCell fact={row.value} /> },
    {
      key: "consumed",
      label: "Consumed",
      numeric: true,
      render: (row) =>
        row.consumed === null ? (
          <NotPublished id={FE.envelope} titleReason={row.consumedReason} compact />
        ) : (
          <span title={row.asOf === null ? undefined : `As of ${row.asOf}`}>
            <DecimalCell fact={row.consumed} />
          </span>
        ),
    },
    {
      key: "used",
      label: "Used",
      render: (row) =>
        row.usedRatio === undefined ? <NotPublished id={FE.envelope} titleReason={row.usedReason} compact /> : <CapGauge ratio={row.usedRatio} label={row.label} />,
    },
  ];

  return (
    <SectionPanel level={2} title="Envelope" aside="Used is the server's ratio">
      {view.envelope === null ? (
        <p className="exec-blk-na">
          {view.proposalOnly
            ? `Not available${view.proposalAbsentReason === null ? "" : ` · ${view.proposalAbsentReason}`}`
            : "Not available · the response carries no Canary envelope"}
        </p>
      ) : (
        <>
          <p className="exec-cny-cmpl">
            {verdict === null ? (
              <NotPublished id={FE.envelope}>Envelope verdict</NotPublished>
            ) : (
              <>
                <span className="exec-cny-cmpl-label">Envelope verdict </span>
                <Flag kind={verdict.flag} label={verdict.label} size="sm" />
                <span className="exec-cny-cmpl-note"> {verdict.sentence}</span>
              </>
            )}
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
            {rows.every((row) => row.usedRatio !== undefined) && verdict !== null ? null : <NotPublished id={FE.envelope}>Used ratio and verdict</NotPublished>}
            {view.envelope.status === "DRAFT" ? " The envelope is a draft, so its values are proposed, not effective." : ""}
          </p>
        </>
      )}
    </SectionPanel>
  );
}
