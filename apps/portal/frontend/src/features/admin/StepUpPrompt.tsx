/**
 * A4-2 · the owner proving, again, that they are present.
 *
 * The only password this control plane handles is the caller's own, and this
 * is the only place it is collected. It is passed to the request as an
 * argument and never held: the field is cleared the moment the server answers,
 * there is no state that survives the component, and `autoComplete="off"` with
 * `type="password"` keeps the browser from offering to remember it either.
 *
 * Asked once per window rather than per action. A prompt that appears before
 * every click stops being read; one that appears when the owner starts working
 * on access, and again a few minutes later, is still a decision.
 */
import { useState, type FormEvent } from "react";

import { Callout } from "../../components/surface";

export function StepUpPrompt({
  pending,
  failure,
  onSubmit,
  onCancel,
}: {
  pending: boolean;
  failure: string | null;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!password) return;
    onSubmit(password);
    // Cleared immediately: the request already holds what it needs, and a
    // populated field is a credential sitting in the DOM for as long as the
    // owner leaves the tab open.
    setPassword("");
  };

  return (
    <Callout tone="info" title="Confirm it is you">
      <form onSubmit={submit} data-testid="step-up-prompt">
        <p>
          Managing access asks for your password again. This covers the next few minutes,
          not every action.
        </p>
        <label className="admin-stepup-field">
          <span>Your password</span>
          <input
            className="input"
            type="password"
            autoComplete="off"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            data-testid="step-up-password"
            aria-label="Your password"
          />
        </label>
        {failure ? (
          <p className="admin-stepup-failed" role="alert" data-testid="step-up-failure">
            {failure}
          </p>
        ) : null}
        <div className="admin-token-actions">
          {/* §3.5: every disabled state here says which of the two it is —
              still typing, or already sent. */}
          <button
            type="button"
            className="btn-ghost"
            onClick={onCancel}
            disabled={pending}
            title={pending ? "Your password is with the server; wait for its answer." : undefined}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={pending || !password}
            title={
              pending
                ? "Your password is with the server; wait for its answer."
                : !password
                  ? "Enter your password first."
                  : undefined
            }
          >
            {pending ? "Checking…" : "Confirm"}
          </button>
        </div>
      </form>
    </Callout>
  );
}
