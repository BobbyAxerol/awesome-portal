/**
 * Sessions: the profile publishes no session rows, so the tab says so, with
 * the request that will publish them (FE-067), and prints the one thing that
 * is known: how many execution sessions the quality read counts. It never
 * builds rows from the session ids on orders (that would name a state the
 * source never gave) and never draws an empty table.
 */
import { NotPublished, SectionPanel } from "../../blocks";
import { Fig } from "./cells";
import type { Figure } from "./model";

export function SessionsTab({ counted }: { counted: Figure }) {
  return (
    <SectionPanel level={2} title="Sessions">
      <table className="exec-wb-kv">
        <tbody>
          <tr>
            <th scope="row">Session rows</th>
            <td><NotPublished id="FE-067">Started, ended and state</NotPublished></td>
          </tr>
          <tr>
            <th scope="row">Sessions counted</th>
            <td><Fig value={counted} why="The execution-quality read has not answered" /></td>
          </tr>
        </tbody>
      </table>
    </SectionPanel>
  );
}
