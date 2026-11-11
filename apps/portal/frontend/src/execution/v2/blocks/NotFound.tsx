/**
 * A record that is not there (UI review F1 / D8): one plain sentence, the id as secondary text, and a way back to the list the
 * reader came from. A permanent not-found has no "Try again": asking again cannot change the answer.
 *
 * The sentence may name the machine code the read answered with in parentheses; `PanelState` takes it out of the words and keeps
 * it in `data-code`, a tooltip and its closed "Details" disclosure.
 */
import { Link } from "react-router-dom";

import { PanelState } from "../../components/states";
import "../css/blocks.css";

export interface NotFoundProps {
  /** `Incident`, `Account`, `Portfolio`. */
  what: string;
  /** The id the address named. */
  id: string;
  /** Plain words: what is missing and what the reader can check. */
  sentence: string;
  backTo: string;
  /** `Operations`, `Accounts`, `Portfolios`: the list the reader came from. */
  backLabel: string;
}

export function NotFound({ what, id, sentence, backTo, backLabel }: NotFoundProps) {
  return (
    <div className="exec-nf" data-not-found={what.toLowerCase()}>
      <PanelState
        status="empty"
        title={`${what} not found`}
        reason={sentence}
        actions={
          <>
            <p className="exec-nf-id">Looked for <code>{id}</code></p>
            <Link className="exec-nf-back" to={backTo}><span aria-hidden="true">← </span>Back to {backLabel}</Link>
          </>
        }
      />
    </div>
  );
}
