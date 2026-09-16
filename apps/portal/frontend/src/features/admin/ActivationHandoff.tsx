/**
 * A4-2 · the one view of a credential.
 *
 * §20.2 rule 7: an activation credential is delivered once, over a no-store
 * response, and is never logged, persisted in browser storage, copied into an
 * audit row or replayed by idempotency. This component is the browser half of
 * that promise, and the promise is only as good as what the code actually does:
 *
 *  - the token lives in React state belonging to the screen and nowhere else.
 *    There is no `localStorage`, no `sessionStorage`, no ref that outlives the
 *    component and no URL that carries it;
 *  - it is never written to the console, including on an error path — a
 *    `console.error(response)` is how a credential ends up in a support
 *    screenshot;
 *  - dismissing it requires an explicit acknowledgement, because the failure
 *    this prevents is an owner closing the panel by reflex before they have
 *    actually delivered the string, and there is no second chance to read it;
 *  - there is no download. A file on disk is the exact opposite of no-store,
 *    and offering one would quietly undo the rule the rest of this is keeping.
 *
 * If the copy button fails — an insecure context, a denied permission — the
 * token is still on screen to read out. The failure is said plainly rather than
 * silently swallowed, because an owner who believes they copied something they
 * did not is worse off than one who knows they must retype it.
 */
import { useState } from "react";

import { Callout } from "../../components/surface";

export function ActivationHandoff({
  username,
  token,
  onAcknowledge,
}: {
  username: string;
  token: string;
  onAcknowledge: () => void;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopyState("copied");
    } catch {
      // Deliberately not logged: the catch has the token in scope.
      setCopyState("failed");
    }
  };

  return (
    <Callout tone="warning" title={`One-time credential for ${username}`}>
      <div data-testid="activation-handoff" data-username={username}>
        <p className="mono admin-token" data-testid="activation-token">
          {token}
        </p>
        <p>
          Shown <strong>once</strong>. It is stored nowhere and cannot be retrieved again —
          if it is lost, issue a new one, which revokes this. Send it over a channel you
          trust; {username} sets their own password with it on first sign-in.
        </p>
        <div className="admin-token-actions">
          <button type="button" className="btn-ghost" onClick={() => void copy()}>
            {copyState === "copied" ? "Copied" : "Copy credential"}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={onAcknowledge}
            data-testid="activation-acknowledge"
          >
            I have delivered it — hide
          </button>
        </div>
        {copyState === "failed" ? (
          <p className="admin-token-copy-failed" role="status">
            The browser would not let this page use the clipboard. Read the credential
            above instead — it is still the only copy.
          </p>
        ) : null}
      </div>
    </Callout>
  );
}
