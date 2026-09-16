/**
 * A4-2 · the confirmation, which is the last honest moment before a change.
 *
 * §20.5 forbids `window.confirm` as the final product interaction, and the
 * reason is not that it is ugly. A native confirm can show one string: it
 * cannot show WHO is affected, what the server will actually do, whether the
 * step-up is still live, or what came back when the request failed. People
 * click through a dialog that never tells them anything different; this one has
 * something different to say each time.
 *
 * Four things are always on screen before the button is reachable:
 *
 *   1. the target, by username, not "this user";
 *   2. the consequence, in the server's terms — sessions ended, credential
 *      revoked, access withdrawn;
 *   3. the step-up state, so "why is this greyed out" is never a guess;
 *   4. after a failure, the server's own refusal — stale revision, already
 *      issued, owner protected — rather than a generic "something went wrong".
 *
 * The most consequential action asks the owner to type the username. Not as
 * ceremony: ARCHIVE is the one that reads as deletion, and typing the name is
 * what makes "I am archiving *this* account" a deliberate sentence rather than
 * a reflex on the row the cursor happened to be over.
 */
import { useEffect, useState } from "react";

import { Callout } from "../../components/surface";
import type { AccountSummary } from "./accountApi";

export type AccountAction =
  | "issue-activation"
  | "reissue-activation"
  | "revoke-sessions"
  | "disable"
  | "enable"
  | "archive";

interface Consequence {
  title: string;
  /** What the server will do, stated as fact rather than as a warning. */
  consequence: string;
  /** The button's own words; never a bare "Confirm". */
  verb: string;
  tone: "neutral" | "danger";
  /** Typing the username is required for this one. */
  typedConfirmation?: boolean;
}

export const ACTION_COPY: Record<AccountAction, Consequence> = {
  "issue-activation": {
    title: "Issue an activation credential",
    consequence:
      "A one-time credential is generated and shown once. Every session this account holds ends, and it must sign in with the new credential and choose its own password. You will never see the credential again after you dismiss it.",
    verb: "Issue credential",
    tone: "neutral",
  },
  "reissue-activation": {
    title: "Replace the live activation credential",
    consequence:
      "The credential already issued for this account stops working immediately, and a new one is shown once. Do this only if the first one did not reach the person it was for.",
    verb: "Revoke and reissue",
    tone: "danger",
  },
  "revoke-sessions": {
    title: "End every session",
    consequence:
      "This account is signed out everywhere at once. Its credential still works, so it can sign in again straight away.",
    verb: "End sessions",
    tone: "neutral",
  },
  disable: {
    title: "Withdraw access",
    consequence:
      "The account can no longer sign in. Its sessions end and its activation credential is revoked. Nothing is deleted, and you can restore access later.",
    verb: "Disable account",
    tone: "danger",
  },
  enable: {
    title: "Restore access",
    consequence:
      "The account can sign in again — but not with whatever password it had before. A fresh activation credential is issued and shown once, and the account chooses a new password with it.",
    verb: "Enable and issue credential",
    tone: "neutral",
  },
  archive: {
    title: "Archive access",
    consequence:
      "Access is withdrawn and the account is filed away. Nothing is deleted: the account, its history and its audit trail are all kept, and enabling it later issues a fresh credential.",
    verb: "Archive account",
    tone: "danger",
    typedConfirmation: true,
  },
};

export function AccountActionConfirm({
  account,
  action,
  stepUpState,
  pending,
  failure,
  onConfirm,
  onCancel,
  onStepUp,
}: {
  account: AccountSummary;
  action: AccountAction;
  stepUpState: { state: "ACTIVE" | "REQUIRED"; expiresAt: string | null };
  pending: boolean;
  /** The server's own refusal, shown verbatim. */
  failure: { code: string; message: string; requestId: string | null } | null;
  onConfirm: () => void;
  onCancel: () => void;
  onStepUp: () => void;
}) {
  const copy = ACTION_COPY[action];
  const [typed, setTyped] = useState("");
  // A reopened drawer must not inherit the last one's typing.
  useEffect(() => setTyped(""), [account.userId, action]);

  const nameMatches = !copy.typedConfirmation || typed.trim() === account.username;
  const steppedUp = stepUpState.state === "ACTIVE";
  /*
   * §3.5: a disabled control names its reason — including while a request is
   * in flight. "Working…" says something is happening; it does not say why the
   * button stopped responding, and those are different questions.
   */
  const blockedReason = pending
    ? "The request is with the server; wait for its answer."
    : !steppedUp
      ? "Re-enter your password to confirm a change to someone's access."
      : !nameMatches
        ? `Type ${account.username} to confirm.`
        : null;

  return (
    <section
      className="admin-confirm"
      role="dialog"
      aria-modal="true"
      aria-label={copy.title}
      data-testid="account-action-confirm"
      data-action={action}
    >
      <header className="admin-confirm-head">
        <p className="mono-label">{copy.title}</p>
        <h3 className="admin-confirm-target">
          <span className="mono">{account.username}</span>
          <span className="admin-confirm-display">{account.displayName}</span>
        </h3>
      </header>

      <p className="admin-confirm-consequence">{copy.consequence}</p>

      {/* The revision is shown because it is what the request is pinned to: if
          somebody else changes this account first, the refusal below will name
          exactly this number. */}
      <dl className="admin-confirm-facts">
        <div>
          <dt>Current state</dt>
          <dd className="mono">{account.accountState}</dd>
        </div>
        <div>
          <dt>Account revision</dt>
          <dd className="mono">{account.accountRevision}</dd>
        </div>
        <div>
          <dt>Step-up</dt>
          <dd className="mono" data-testid="confirm-step-up-state">
            {steppedUp ? `ACTIVE until ${formatTime(stepUpState.expiresAt)}` : "REQUIRED"}
          </dd>
        </div>
      </dl>

      {!steppedUp ? (
        <Callout tone="warning" title="Confirm it is you">
          <p>
            Changing someone&rsquo;s access needs your password again. It is asked once and
            covers the next few minutes of work.
          </p>
          <button type="button" className="btn-primary" onClick={onStepUp}>
            Re-enter password
          </button>
        </Callout>
      ) : null}

      {copy.typedConfirmation && steppedUp ? (
        <label className="admin-confirm-typed">
          <span>
            Type <span className="mono">{account.username}</span> to confirm
          </span>
          <input
            className="mono"
            value={typed}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setTyped(event.target.value)}
            data-testid="account-typed-confirmation"
            aria-label={`Type ${account.username} to confirm`}
          />
        </label>
      ) : null}

      {failure ? (
        /* The server's refusal, verbatim. These messages are written to name
           the exact condition — a stale revision, a credential already live,
           the owner anchor — and a locally composed "could not complete" would
           throw away the only thing that tells the owner what to do next. */
        <Callout tone="danger" title="The server refused this">
          <p className="mono admin-confirm-code">{failure.code}</p>
          <p>{failure.message}</p>
          {failure.requestId ? (
            <p className="mono admin-confirm-request">request_id {failure.requestId}</p>
          ) : null}
        </Callout>
      ) : null}

      <div className="admin-confirm-foot">
        <button
          type="button"
          className="btn-ghost"
          onClick={onCancel}
          disabled={pending}
          title={pending ? "The request is with the server; wait for its answer." : undefined}
        >
          Cancel
        </button>
        <button
          type="button"
          className={copy.tone === "danger" ? "btn-danger" : "btn-primary"}
          onClick={onConfirm}
          disabled={blockedReason !== null}
          data-testid="account-action-submit"
          // §3.5: a disabled control states its reason rather than leaving the
          // reader to work out why nothing happens when they click.
          title={blockedReason ?? undefined}
        >
          {pending ? "Working…" : copy.verb}
        </button>
      </div>
      {blockedReason ? (
        <p className="admin-confirm-blocked" data-testid="account-action-blocked">
          {blockedReason}
        </p>
      ) : null}
    </section>
  );
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? "—"
    : at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
