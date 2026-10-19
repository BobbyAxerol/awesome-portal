/**
 * The cockpit's shortcut list (HIFI `#ck-helpbox`, opened by the masthead Keys
 * button and by `?`). It states what each key does in this build: A, R and N
 * do not record anything (the preview never writes), so the list says that
 * rather than copying the kit's "Primary decision, then Ctrl+Enter".
 *
 * A modal dialog: focus goes in on open and back to what opened it, Tab stays
 * inside, and Esc (or the scrim, or Close) closes it. Esc is taken in the
 * capture phase and prevented, so the cockpit's own Esc, which clears the
 * selection, does not also fire.
 */
import { useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { PREVIEW_REASON } from "./laneModel";

export interface KeysHelpProps {
  onClose(): void;
}

const ROWS: readonly { keys: readonly string[]; what: string }[] = [
  { keys: ["J", "K"], what: "Next and previous request" },
  { keys: ["A"], what: `Approve. ${PREVIEW_REASON}` },
  { keys: ["R"], what: `Deny. ${PREVIEW_REASON}` },
  { keys: ["N"], what: `Note. ${PREVIEW_REASON}` },
  { keys: ["Esc"], what: "Close this list, or clear the selection" },
  { keys: ["?"], what: "Show this list" },
];

export function KeysHelp({ onClose }: KeysHelpProps) {
  const titleId = useId();
  const close = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    close.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
    };
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("keydown", key, true);
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  // Close is the only control, so Tab has nowhere else to go.
  const trap = (event: ReactKeyboardEvent) => {
    if (event.key === "Tab") {
      event.preventDefault();
      close.current?.focus();
    }
  };

  return (
    <div className="exec-ck-help-scrim" onClick={onClose}>
      <div className="exec-ck-help" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => event.stopPropagation()} onKeyDown={trap}>
        <div className="exec-ck-ph">
          <h2 id={titleId} className="exec-ck-pt">Keys</h2>
          <span className="exec-ck-pr">Esc closes</span>
        </div>
        <table className="exec-ck-helptable">
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.keys.join("")}>
                <th scope="row">{row.keys.map((k) => <kbd key={k}>{k}</kbd>)}</th>
                <td>{row.what}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="exec-ck-helpfoot">
          <button ref={close} type="button" className="exec-ck-more" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
