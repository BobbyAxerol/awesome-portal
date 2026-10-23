/**
 * Envelope tab (hi-fi: Cap / Limit / Approved / Consumed / Used).
 *
 * What the body publishes is the envelope's own value for each cap (a draft is
 * "Proposed", never "Approved"), and, per cap, the compliance row (FE-071): the base risk
 * profile's Limit, Consumed and the SERVER's used ratio, each a fact that is published or says
 * why it is not. A column no cap can fill is not drawn: its name joins ONE `Not available` line
 * under the table (FE-071 and the server's reason codes in its title). The gauge is drawn only
 * from the server's ratio (D7); nothing is divided here. The verdict chip is the server's
 * (`WITHIN_ENVELOPE`, `BREACH`, `UNDETERMINED`); a body without a verdict says so.
 */
import { CardsTable, type CardsColumn } from "../../cardsTable";
import { CapGauge, GapLine, NaWhy, NotPublished, SectionPanel, type GapItem } from "../../blocks";
import { Flag } from "../../Flag";
import type { CanaryView } from "./readCanary";
import { FE, complianceNotes, envelopeColumn, limitRows, panelLine, verdictLine, type LimitRow } from "./model";
import { DecimalCell } from "./parts";

/** The first server reason among the rows that have one (the tooltip names a code, not every row's). */
const firstReason = (rows: readonly LimitRow[], pick: (row: LimitRow) => string | null): string | null => rows.map(pick).find((reason) => reason !== null) ?? null;

export function EnvelopeTab({ view }: { view: CanaryView }) {
  const rows = limitRows(view);
  const heading = envelopeColumn(view);
  const notes = complianceNotes(view);
  const verdict = verdictLine(view);
  const noLimit = rows.every((row) => row.limit === null);
  const noConsumed = rows.every((row) => row.consumed === null);
  const noUsed = rows.every((row) => row.usedRatio === undefined);
  const gaps: GapItem[] = [
    ...(noLimit ? [{ label: "Limit", id: FE.envelope, reason: firstReason(rows, (row) => row.limitReason) }] : []),
    ...(noConsumed ? [{ label: "Consumed", id: FE.envelope, reason: firstReason(rows, (row) => row.consumedReason) }] : []),
    ...(noUsed ? [{ label: "Used", id: FE.envelope, reason: firstReason(rows, (row) => row.usedReason) }] : []),
    ...(verdict === null ? [{ label: "Verdict", id: FE.envelope }] : []),
  ];
  const columns: readonly CardsColumn<LimitRow>[] = [
    { key: "cap", label: "Cap", render: (row) => row.label },
    ...(noLimit ? [] : [{ key: "limit", label: "Limit", numeric: true, render: (row: LimitRow) => (row.limit === null ? <NotPublished id={FE.envelope} titleReason={row.limitReason} /> : <DecimalCell fact={row.limit} />) }]),
    { key: "value", label: heading, numeric: true, render: (row) => <DecimalCell fact={row.value} /> },
    ...(noConsumed
      ? []
      : [
          {
            key: "consumed",
            label: "Consumed",
            numeric: true,
            render: (row: LimitRow) =>
              row.consumed === null ? (
                <NotPublished id={FE.envelope} titleReason={row.consumedReason} />
              ) : (
                <span title={row.asOf === null ? undefined : `As of ${row.asOf}`}>
                  <DecimalCell fact={row.consumed} />
                </span>
              ),
          },
        ]),
    ...(noUsed ? [] : [{ key: "used", label: "Used", render: (row: LimitRow) => {
          if (row.usedRatio !== undefined) return <CapGauge ratio={row.usedRatio} label={row.label} />;
          // The duration cap has no ratio (a request to the contracts lane): the published day and the envelope's own duration are the facts, no bar.
          if (row.key === "duration" && row.consumed?.kind === "value" && row.value?.kind === "value") return <span className="exec-blk-num">Day {row.consumed.decimal.display} of {row.value.decimal.display}</span>;
          return <NotPublished id={FE.envelope} titleReason={row.usedReason} />;
        } }]),
  ];

  return (
    <SectionPanel level={2} title="Envelope">
      {view.envelope === null ? (
        <p className="exec-blk-na">
          <NaWhy reason={view.proposalOnly ? view.proposalAbsentReason : "The response carries no Canary envelope"} />
        </p>
      ) : (
        <>
          {verdict === null ? null : (
            <p className="exec-cny-cmpl">
              <Flag kind={verdict.flag} label={verdict.label} size="sm" />
              <span className="exec-cny-cmpl-note"> {verdict.sentence}</span>
              <span className="exec-cny-cmpl-note">{panelLine(view.compliance)}</span>
            </p>
          )}
          <CardsTable columns={columns} rows={rows} rowKey={(row) => row.key} label="Canary envelope caps" />
          <GapLine items={gaps} because={verdict === null ? panelLine(view.compliance) : null} />
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
          {rows.some((row) => row.key === "duration" && row.limit === null) ? (
            <p className="exec-cny-foot">The duration cap has no published limit and no usage share; the day and the duration shown are the trial's own.</p>
          ) : null}
          {notes.baseRiskProfile === null && view.envelope.status !== "DRAFT" ? null : (
            <p className="exec-cny-foot">
              {notes.baseRiskProfile === null ? null : `Base risk profile: ${notes.baseRiskProfile === "verified" ? "verified" : "not verified"}.`}
              {view.envelope.status === "DRAFT" ? `${notes.baseRiskProfile === null ? "" : " "}Draft: values are proposed, not effective.` : ""}
            </p>
          )}
        </>
      )}
    </SectionPanel>
  );
}
