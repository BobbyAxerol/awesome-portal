/**
 * Sessions (FE-067): the rows the profile's `stage_facts.sessions` publishes, newest first, with the source's own state
 * word, and the one count the quality read adds. A block the server says NOT_PUBLISHED prints `Not published (FE-067)` with
 * its reason code in the title and draws no table; a body without the member says so without a reason. Rows are never built
 * from the session ids on orders (that would name a state the source never gave), an empty AVAILABLE window is "none
 * recorded in this window" (the server counted them), and `source_complete: false` or omitted rows are worded.
 */
import { CardsTable, type CardsColumn } from "../../cardsTable";
import { GapLine, SectionPanel } from "../../blocks";
import { formatAsOf, readAsOf } from "../../boundary";
import type { StageSessionRow, StageSessions } from "../../../stageFacts";
import { Fig, Na } from "./cells";
import { humanize, type Figure } from "./model";

const when = (iso: string | null): string | null => {
  const at = iso === null ? null : readAsOf(Date.parse(iso));
  return at === null ? null : formatAsOf(at);
};

const COLUMNS: readonly CardsColumn<StageSessionRow>[] = [
  { key: "id", label: "Session", render: (r) => <span className="exec-blk-id">{r.id}</span> },
  { key: "started", label: "Started", render: (r) => when(r.started) },
  { key: "ended", label: "Ended", render: (r) => (r.ended === null ? <Na why="No completion time" /> : when(r.ended)) },
  { key: "state", label: "State", render: (r) => (r.state === null ? <Na /> : humanize(r.state)) },
];

export function SessionsTab({ counted, sessions }: { counted: Figure; sessions: StageSessions | null }) {
  return (
    <SectionPanel level={2} title="Sessions">
      {sessions === null ? (
        <GapLine items={[{ label: "Session rows", id: "FE-067" }]} />
      ) : sessions.availability === "NOT_PUBLISHED" ? (
        <GapLine items={[{ label: "Session rows", id: "FE-067", reason: sessions.reasonCode }]} />
      ) : (
        <div className="exec-wb-tablewrap" data-table="Sessions">
          <CardsTable columns={COLUMNS} rows={sessions.rows} rowKey={(r) => r.id} label="Sessions" empty={<span className="exec-wb-empty">No sessions</span>} />
          <p className="exec-wb-cap" data-testid="Sessions-cap">
            {sessions.returnedCount === 1 ? "1 session" : `${sessions.returnedCount.toLocaleString("en-US")} sessions`}
            {sessions.omittedCount > 0 ? ` · ${sessions.omittedCount.toLocaleString("en-US")} could not be read and ${sessions.omittedCount === 1 ? "is" : "are"} not listed` : ""}
            {sessions.sourceComplete === false ? " · the window may be incomplete" : ""}
          </p>
        </div>
      )}
      <table className="exec-wb-kv">
        <tbody>
          <tr>
            <th scope="row">Sessions counted</th>
            <td><Fig value={counted} why="The execution-quality read has not answered" /></td>
          </tr>
        </tbody>
      </table>
    </SectionPanel>
  );
}
