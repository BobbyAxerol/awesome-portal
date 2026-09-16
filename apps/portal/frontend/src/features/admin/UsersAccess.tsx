/**
 * Users & Access — the owner account control desk (A4-2).
 *
 * What replaced the old table is not a nicer table. The old screen edited rows:
 * it sent a change and hoped. This one issues *operations*, and every one of
 * them names the account it is acting on, the revision it believes is current,
 * and an idempotency key — so a retry is answerable, a second tab cannot
 * silently overwrite a decision, and a refusal can say which of those went
 * wrong.
 *
 * Three product rules shape the layout:
 *
 *  1. **Consequence before action.** Nothing destructive happens from a row
 *     button. Every one opens a confirmation that names the person, states
 *     what the server will do, shows whether the step-up is still live, and
 *     — after a failure — repeats the server's own refusal.
 *  2. **A credential is seen once.** The handoff panel stays until the owner
 *     says they have delivered it. It is never stored, never logged, never in
 *     a URL.
 *  3. **Nothing is deleted.** The danger zone archives; it does not remove. An
 *     archived account keeps its history and can be enabled again, which is
 *     why "Archive" and not "Delete" is the word on the button.
 *
 * Who may open it is the server's answer, read from `/api/admin/access/self`
 * and nothing else — A4-1 retired the `role === "ADMIN"` check the shell used
 * to make for itself. Hiding the screen is still only a courtesy: the boundary
 * is `OwnerAccessGuard`.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, LogOut, ShieldOff, ShieldCheck, Archive, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";

import { AuthRequestError } from "../../auth/authApi";
import { isOwnerAccess, useSession } from "../../auth/session";
import { Callout, Panel, SectionHeading } from "../../components/surface";
import { StateView } from "../../components/ui";
import {
  AccountActionConfirm,
  type AccountAction,
} from "./AccountActionConfirm";
import { ActivationHandoff } from "./ActivationHandoff";
import { StepUpPrompt } from "./StepUpPrompt";
import {
  accounts,
  newIdempotencyKey,
  stepUp,
  type AccountSummary,
} from "./accountApi";

/** Lifecycle state as a word plus a tone; never colour alone. */
function StateBadge({ account }: { account: AccountSummary }) {
  return (
    <span className="admin-status" data-state={account.accountState}>
      <span className="mono">{account.accountState}</span>
      {account.locked ? <span className="admin-flag">locked</span> : null}
      {account.mustChangePassword && account.accountState !== "ARCHIVED" ? (
        <span className="admin-flag">awaiting first password</span>
      ) : null}
    </span>
  );
}

interface PendingAction {
  account: AccountSummary;
  action: AccountAction;
  /** Minted when the owner opens the confirmation, reused for every retry of it. */
  idempotencyKey: string;
}

export function UsersAccess() {
  const { principal, access } = useSession();
  const owner = isOwnerAccess(access);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [failure, setFailure] = useState<AuthRequestError | null>(null);
  const [handoff, setHandoff] = useState<{ username: string; token: string } | null>(null);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [stepUpFailure, setStepUpFailure] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [draft, setDraft] = useState({ username: "", displayName: "" });

  const roster = useQuery({
    queryKey: ["account-roster"],
    queryFn: accounts.roster,
    enabled: owner,
    retry: 1,
  });

  const stepUpState = useQuery({
    queryKey: ["owner-step-up"],
    queryFn: stepUp.state,
    enabled: owner,
    retry: 1,
  });

  const detail = useQuery({
    queryKey: ["account-detail", expanded],
    queryFn: () => accounts.detail(expanded!),
    enabled: owner && expanded !== null,
    retry: 1,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["account-roster"] });
    void queryClient.invalidateQueries({ queryKey: ["account-detail"] });
    void queryClient.invalidateQueries({ queryKey: ["owner-step-up"] });
  };

  const stepUpMutation = useMutation({
    mutationFn: (password: string) => stepUp.grant(password),
    onSuccess: () => {
      setStepUpFailure(null);
      setStepUpOpen(false);
      refresh();
    },
    onError: (error: unknown) => {
      setStepUpFailure(
        error instanceof AuthRequestError
          ? error.message
          : "That password was not accepted.",
      );
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      accounts.create(
        { username: draft.username.trim(), displayName: draft.displayName.trim() || undefined },
        newIdempotencyKey(),
      ),
    onSuccess: () => {
      setDraft({ username: "", displayName: "" });
      setFailure(null);
      refresh();
    },
    onError: (error: unknown) =>
      setFailure(error instanceof AuthRequestError ? error : null),
  });

  const actionMutation = useMutation({
    mutationFn: async (request: PendingAction) => {
      const { account, action, idempotencyKey } = request;
      if (action === "issue-activation" || action === "reissue-activation") {
        return accounts.issueActivation(
          account.userId,
          {
            expectedRevision: account.accountRevision,
            reissue: action === "reissue-activation",
          },
          idempotencyKey,
        );
      }
      return accounts.action(
        account.userId,
        action,
        account.accountRevision,
        idempotencyKey,
      );
    },
    onSuccess: (result, request) => {
      setFailure(null);
      setPending(null);
      /*
       * A REPLAYED outcome carries no credential — the one view already
       * happened — so the panel is opened only for a token that is actually
       * present. Rendering an empty handoff would tell the owner a credential
       * exists somewhere when it does not.
       */
      if (result.activationToken) {
        setHandoff({ username: request.account.username, token: result.activationToken });
      }
      refresh();
    },
    onError: (error: unknown) =>
      setFailure(error instanceof AuthRequestError ? error : null),
  });

  const rows = useMemo(() => {
    const all = roster.data ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (row) =>
        row.username.toLowerCase().includes(needle) ||
        row.displayName.toLowerCase().includes(needle),
    );
  }, [roster.data, search]);

  // ------------------------------------------------------------- authority

  if (access.kind === "loading") {
    return (
      <div className="space-y-4">
        <SectionHeading title="Users & Access" />
        <StateView kind="loading" message="Checking your Portal access…" />
      </div>
    );
  }

  if (access.kind === "unavailable") {
    return (
      <div className="space-y-4">
        <SectionHeading title="Users & Access" />
        <StateView
          kind="unavailable"
          code={access.requestId ?? undefined}
          message="Your Portal access could not be read, so this screen cannot say what you may do. This is not a refusal — try again, and quote the request ID if it persists."
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  if (!access.access.isOwner) {
    return (
      <div className="space-y-4">
        <SectionHeading title="Users & Access" />
        <StateView
          kind="denied"
          code={access.access.ownerState}
          message={
            access.access.ownerState === "OWNER_ANCHOR_UNCLAIMED"
              ? "No Portal owner has been established on this deployment, so account administration is closed to everyone. An operator claims the owner during bootstrap; it cannot be granted from this screen."
              : "Account administration belongs to the Portal owner. A role is not ownership, so no change to your role would open this screen — ask the owner directly."
          }
        />
      </div>
    );
  }

  const currentStepUp = stepUpState.data ?? { state: "REQUIRED" as const, expiresAt: null };

  return (
    <div className="space-y-4" data-testid="account-desk">
      <SectionHeading
        title="Users & Access"
        description="Every action here changes somebody's ability to sign in. Each one names what it will do before it does it, and nothing on this screen deletes an account."
      />

      {/* The step-up state lives in the header rather than inside each dialog:
          an owner about to do three things in a row should be able to see, at
          a glance, whether they are going to be asked again. */}
      <div className="admin-desk-bar">
        <label className="admin-search">
          <span className="sr-only">Search accounts</span>
          <input
            className="input"
            placeholder="Search by username or name"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            data-testid="account-search"
          />
        </label>
        <span
          className="admin-stepup-chip"
          data-state={currentStepUp.state}
          data-testid="step-up-chip"
        >
          {currentStepUp.state === "ACTIVE" ? (
            <>
              <ShieldCheck size={13} aria-hidden="true" /> Step-up active
            </>
          ) : (
            <>
              <ShieldOff size={13} aria-hidden="true" /> Step-up required
            </>
          )}
        </span>
      </div>

      {handoff ? (
        <ActivationHandoff
          username={handoff.username}
          token={handoff.token}
          // Dropping the state is what makes the one view true: after this
          // there is no copy of the credential anywhere in the browser.
          onAcknowledge={() => setHandoff(null)}
        />
      ) : null}

      {stepUpOpen ? (
        <StepUpPrompt
          pending={stepUpMutation.isPending}
          failure={stepUpFailure}
          onSubmit={(password) => stepUpMutation.mutate(password)}
          onCancel={() => {
            setStepUpOpen(false);
            setStepUpFailure(null);
          }}
        />
      ) : null}

      {pending ? (
        <AccountActionConfirm
          account={pending.account}
          action={pending.action}
          stepUpState={currentStepUp}
          pending={actionMutation.isPending}
          failure={
            failure
              ? { code: failure.code, message: failure.message, requestId: failure.requestId }
              : null
          }
          onConfirm={() => actionMutation.mutate(pending)}
          onCancel={() => {
            setPending(null);
            setFailure(null);
          }}
          onStepUp={() => setStepUpOpen(true)}
        />
      ) : null}

      {failure && !pending ? (
        <Callout tone="danger" title="The server refused this">
          <p className="mono">{failure.code}</p>
          <p>{failure.message}</p>
        </Callout>
      ) : null}

      <Panel title="New account">
        <p className="admin-create-note">
          A new account starts invited and holds no credential. Issue one when you are
          ready to hand it over — it can only be read once.
        </p>
        <div className="admin-create-row">
          <input
            className="input"
            placeholder="username"
            value={draft.username}
            onChange={(event) => setDraft({ ...draft, username: event.target.value })}
            data-testid="new-account-username"
            aria-label="New account username"
          />
          <input
            className="input"
            placeholder="display name"
            value={draft.displayName}
            onChange={(event) => setDraft({ ...draft, displayName: event.target.value })}
            data-testid="new-account-display-name"
            aria-label="New account display name"
          />
          <button
            type="button"
            className="btn-primary"
            disabled={createMutation.isPending || draft.username.trim().length < 2}
            title={draft.username.trim().length < 2 ? "Enter a username first." : undefined}
            onClick={() => createMutation.mutate()}
            data-testid="new-account-submit"
          >
            <UserPlus size={13} aria-hidden="true" /> Create invited account
          </button>
        </div>
      </Panel>

      {roster.isPending ? (
        <StateView kind="loading" message="Reading the account roster…" />
      ) : roster.isError ? (
        <StateView
          kind="failed"
          message={`Could not read the account roster. ${
            roster.error instanceof AuthRequestError ? roster.error.message : ""
          }`}
          onRetry={refresh}
        />
      ) : rows.length === 0 ? (
        <StateView
          kind="empty"
          message={
            search
              ? `No account matches “${search}”.`
              : "This Portal has no accounts yet."
          }
        />
      ) : (
        <table className="admin-table" data-testid="account-roster">
          <thead>
            <tr>
              <th>Account</th>
              <th>Role</th>
              <th>State</th>
              <th className="mono">rev</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isSelf = row.userId === principal?.principalId;
              /*
               * An action that cannot mean anything is not offered.
               *
               * A credential issued to a withdrawn account cannot be used —
               * login refuses before it ever reads one — and "end sessions" on
               * an account whose sessions were already ended by the disable is
               * a button that does nothing and says it worked. Both were on
               * screen until the recorded baseline was actually looked at.
               */
              const withdrawn =
                row.accountState === "DISABLED" || row.accountState === "ARCHIVED";
              const withdrawnReason =
                row.accountState === "ARCHIVED"
                  ? "This account is archived. Enable it first — enabling issues a fresh credential."
                  : "Access is withdrawn, so a credential could not be used. Enable the account first.";
              return (
                <tr
                  key={row.userId}
                  data-testid={`account-${row.username}`}
                  data-self={isSelf}
                  data-state={row.accountState}
                >
                  <td>
                    <button
                      type="button"
                      className="admin-account-name"
                      onClick={() =>
                        setExpanded(expanded === row.userId ? null : row.userId)
                      }
                      aria-expanded={expanded === row.userId}
                    >
                      <span className="mono">{row.username}</span>
                      <span className="admin-account-display">{row.displayName}</span>
                    </button>
                    {isSelf ? <span className="admin-flag">you</span> : null}
                  </td>
                  <td className="mono">{row.role}</td>
                  <td>
                    <StateBadge account={row} />
                  </td>
                  <td className="mono">{row.accountRevision}</td>
                  <td>
                    <div className="admin-row-actions">
                      <RowAction
                        icon={<KeyRound size={13} aria-hidden="true" />}
                        label={
                          row.mustChangePassword ? "Reissue credential" : "Issue credential"
                        }
                        disabledReason={withdrawn ? withdrawnReason : undefined}
                        onClick={() =>
                          open(
                            row,
                            row.mustChangePassword ? "reissue-activation" : "issue-activation",
                          )
                        }
                      />
                      <RowAction
                        icon={<LogOut size={13} aria-hidden="true" />}
                        label="End sessions"
                        disabledReason={
                          withdrawn
                            ? "This account holds no sessions: withdrawing access already ended them."
                            : undefined
                        }
                        onClick={() => open(row, "revoke-sessions")}
                      />
                      {row.accountState === "ACTIVE" || row.accountState === "INVITED" ? (
                        <RowAction
                          icon={<ShieldOff size={13} aria-hidden="true" />}
                          label="Disable"
                          danger
                          disabledReason={
                            isSelf ? "You cannot withdraw your own access." : undefined
                          }
                          onClick={() => open(row, "disable")}
                        />
                      ) : (
                        <RowAction
                          icon={<ShieldCheck size={13} aria-hidden="true" />}
                          label="Enable"
                          onClick={() => open(row, "enable")}
                        />
                      )}
                      <RowAction
                        icon={<Archive size={13} aria-hidden="true" />}
                        label="Archive"
                        danger
                        disabledReason={
                          isSelf
                            ? "You cannot archive your own account."
                            : row.accountState === "ARCHIVED"
                              ? "Already archived."
                              : undefined
                        }
                        onClick={() => open(row, "archive")}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {expanded ? (
        <Panel title="Action history">
          {detail.isPending ? (
            <StateView kind="loading" message="Reading this account's history…" />
          ) : detail.isError ? (
            <StateView kind="failed" message="Could not read the history." onRetry={refresh} />
          ) : (detail.data?.history.length ?? 0) === 0 ? (
            <StateView kind="empty" message="Nothing has been done to this account yet." />
          ) : (
            <ul className="admin-history" data-testid="account-history">
              {detail.data!.history.map((entry) => (
                <li key={entry.operationId} data-outcome={entry.outcome}>
                  <span className="mono admin-history-action">{entry.action}</span>
                  <span className="mono admin-history-outcome">{entry.outcome}</span>
                  {entry.reasonCode ? (
                    <span className="mono admin-history-reason">{entry.reasonCode}</span>
                  ) : null}
                  <span className="admin-history-rollback">{entry.rollbackDescription}</span>
                  <span className="mono admin-history-when">{entry.occurredAt}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}
    </div>
  );

  function open(account: AccountSummary, action: AccountAction) {
    setFailure(null);
    // One key per confirmation, not per network attempt: that is exactly the
    // distinction the server checks when it decides whether a request is a
    // retry or a second deliberate action.
    setPending({ account, action, idempotencyKey: newIdempotencyKey() });
  }
}

function RowAction({
  icon,
  label,
  onClick,
  danger,
  disabledReason,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabledReason?: string;
}) {
  return (
    <button
      type="button"
      className={danger ? "btn-danger admin-row-action" : "btn-ghost admin-row-action"}
      onClick={onClick}
      disabled={disabledReason !== undefined}
      // §3.5: a disabled control names its reason.
      title={disabledReason}
      aria-label={`${label}`}
    >
      {icon}
      {label}
    </button>
  );
}
