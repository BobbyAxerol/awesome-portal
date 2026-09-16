/**
 * Profile & Access — who may decide what (A4-3/A4-4).
 *
 * This is a policy surface, not an RBAC editor. The difference shows in what
 * it refuses to offer: there is no free-form role, no route pattern, no
 * permission string to type. There are four Governance gates, two things a
 * person can be trusted with at each — **see it** and **decide it** — and a
 * finite list of people who already have accounts.
 *
 * The matrix is the whole design. An owner's real question is not "what
 * permissions exist" but "who can approve R2 while I am away", and a grid of
 * people against gates answers that in one look. Read and Decide are separate
 * cells rather than a three-way selector, because §20.2 rule 4 makes them
 * genuinely separate grants: somebody can watch a gate for months without ever
 * being able to move it.
 *
 * Two things this screen says out loud that a permissions UI usually leaves
 * implicit:
 *
 *  - **Deciding a gate here changes nothing outside the Portal.** Every
 *    response carries `external_effect: NONE`, and the screen repeats it, so
 *    nobody reads a granted capability as a promotion or a command.
 *  - **The owner is not in the grid.** Their authority is the anchor, not a
 *    row, so there is no checkbox to accidentally clear.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, ShieldOff, Eye, Gavel } from "lucide-react";
import { useMemo, useState } from "react";

import { AuthRequestError } from "../../auth/authApi";
import { isOwnerAccess, useSession } from "../../auth/session";
import { Callout, Panel, SectionHeading } from "../../components/surface";
import { StateView } from "../../components/ui";
import { StepUpPrompt } from "./StepUpPrompt";
import { stepUp } from "./accountApi";
import {
  GOVERNANCE_GATES,
  capabilityOf,
  profileAccess,
  type GovernanceGateId,
  type GovernanceMode,
  type PolicyAccount,
} from "./profileAccessApi";

interface PendingChange {
  account: PolicyAccount;
  gate: GovernanceGateId;
  mode: GovernanceMode;
  /** Present when the click would REMOVE an existing grant. */
  grantId: string | null;
  grantRevision: number | null;
}

export function ProfileAccess() {
  const { access } = useSession();
  const owner = isOwnerAccess(access);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [failure, setFailure] = useState<AuthRequestError | null>(null);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [stepUpFailure, setStepUpFailure] = useState<string | null>(null);

  const policy = useQuery({
    queryKey: ["profile-access-policy"],
    queryFn: profileAccess.policy,
    enabled: owner,
    retry: 1,
  });

  const stepUpState = useQuery({
    queryKey: ["owner-step-up"],
    queryFn: stepUp.state,
    enabled: owner,
    retry: 1,
  });

  const activity = useQuery({
    queryKey: ["profile-access-activity", selected],
    queryFn: () => profileAccess.activity(selected!),
    enabled: owner && selected !== null,
    retry: 1,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["profile-access-policy"] });
    void queryClient.invalidateQueries({ queryKey: ["profile-access-activity"] });
    void queryClient.invalidateQueries({ queryKey: ["owner-step-up"] });
  };

  const stepUpMutation = useMutation({
    mutationFn: (password: string) => stepUp.grant(password),
    onSuccess: () => {
      setStepUpFailure(null);
      setStepUpOpen(false);
      refresh();
    },
    onError: (error: unknown) =>
      setStepUpFailure(
        error instanceof AuthRequestError ? error.message : "That password was not accepted.",
      ),
  });

  const changeMutation = useMutation({
    mutationFn: async (change: PendingChange) =>
      change.grantId
        ? profileAccess.revoke(change.grantId, change.grantRevision ?? 0)
        : profileAccess.grant(change.account.userId, capabilityOf(change.gate, change.mode)),
    onSuccess: () => {
      setFailure(null);
      setPending(null);
      refresh();
    },
    onError: (error: unknown) =>
      setFailure(error instanceof AuthRequestError ? error : null),
  });

  const rows = useMemo(() => {
    const all = policy.data ?? [];
    const needle = search.trim().toLowerCase();
    // The owner is deliberately absent from the grid: their authority is the
    // anchor, so there is no cell here that could change it.
    const delegable = all.filter((account) => !account.isOwner);
    if (!needle) return delegable;
    return delegable.filter(
      (account) =>
        account.username.toLowerCase().includes(needle) ||
        account.displayName.toLowerCase().includes(needle),
    );
  }, [policy.data, search]);

  const ownerRow = (policy.data ?? []).find((account) => account.isOwner) ?? null;
  const current = stepUpState.data ?? { state: "REQUIRED" as const, expiresAt: null };

  if (access.kind === "loading") {
    return (
      <div className="space-y-4">
        <SectionHeading title="Profile & Access" />
        <StateView kind="loading" message="Checking your Portal access…" />
      </div>
    );
  }

  if (access.kind === "unavailable") {
    return (
      <div className="space-y-4">
        <SectionHeading title="Profile & Access" />
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
        <SectionHeading title="Profile & Access" />
        <StateView
          kind="denied"
          code={access.access.ownerState}
          message={
            access.access.ownerState === "OWNER_ANCHOR_UNCLAIMED"
              ? "No Portal owner has been established on this deployment, so Governance delegation is closed to everyone."
              : "Deciding who may govern belongs to the Portal owner. A role is not ownership, so no change to your role would open this screen."
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="profile-access">
      <SectionHeading
        title="Profile & Access"
        description="Who may see a Governance gate, and who may record its Portal decision. Granting a capability here changes nothing outside the Portal — it records no command and moves no capital."
      />

      <div className="admin-desk-bar">
        <label className="admin-search">
          <span className="sr-only">Search accounts</span>
          <input
            className="input"
            placeholder="Search by username or name"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            data-testid="access-search"
          />
        </label>
        <span
          className="admin-stepup-chip"
          data-state={current.state}
          data-testid="access-step-up-chip"
        >
          {current.state === "ACTIVE" ? (
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

      {ownerRow ? (
        <Callout tone="muted" title="The Portal owner is not in this grid">
          <p>
            <span className="mono">{ownerRow.username}</span> holds every capability through the
            owner anchor rather than through a grant, so there is no cell here that could change
            it. That is deliberate: a Portal whose owner can be un-granted has no way back.
          </p>
        </Callout>
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
        <section
          className="admin-confirm"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm access change"
          data-testid="access-confirm"
        >
          <header className="admin-confirm-head">
            <p className="mono-label">
              {pending.grantId ? "Revoke a capability" : "Grant a capability"}
            </p>
            <h3 className="admin-confirm-target">
              <span className="mono">{pending.account.username}</span>
              <span className="admin-confirm-display">
                {GOVERNANCE_GATES.find((g) => g.id === pending.gate)?.label} ·{" "}
                {pending.mode === "decide" ? "Decide" : "See"}
              </span>
            </h3>
          </header>
          <p className="admin-confirm-consequence">
            {pending.grantId
              ? `${pending.account.username} stops being able to ${
                  pending.mode === "decide" ? "record a decision on" : "see"
                } this gate from the very next request. Any sessions they hold keep working — only this capability is withdrawn.`
              : pending.mode === "decide"
                ? `${pending.account.username} will be able to record a Portal decision on this gate, and to see it. Evidence, quorum, expiry and self-approval rules still apply to every decision they make — a grant never bypasses them.`
                : `${pending.account.username} will be able to see this gate. They get no decision affordance at all.`}
          </p>
          <dl className="admin-confirm-facts">
            <div>
              <dt>Capability</dt>
              <dd className="mono">{capabilityOf(pending.gate, pending.mode)}</dd>
            </div>
            <div>
              <dt>External effect</dt>
              <dd className="mono">NONE</dd>
            </div>
            <div>
              <dt>Step-up</dt>
              <dd className="mono" data-testid="access-confirm-step-up">
                {current.state}
              </dd>
            </div>
          </dl>
          {current.state !== "ACTIVE" ? (
            <Callout tone="warning" title="Confirm it is you">
              <p>Changing who may govern needs your password again.</p>
              <button type="button" className="btn-primary" onClick={() => setStepUpOpen(true)}>
                Re-enter password
              </button>
            </Callout>
          ) : null}
          {failure ? (
            <Callout tone="danger" title="The server refused this">
              <p className="mono admin-confirm-code">{failure.code}</p>
              <p>{failure.message}</p>
            </Callout>
          ) : null}
          <div className="admin-confirm-foot">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setPending(null);
                setFailure(null);
              }}
              disabled={changeMutation.isPending}
              title={
                changeMutation.isPending
                  ? "The request is with the server; wait for its answer."
                  : undefined
              }
            >
              Cancel
            </button>
            <button
              type="button"
              className={pending.grantId ? "btn-danger" : "btn-primary"}
              onClick={() => changeMutation.mutate(pending)}
              disabled={changeMutation.isPending || current.state !== "ACTIVE"}
              title={
                changeMutation.isPending
                  ? "The request is with the server; wait for its answer."
                  : current.state !== "ACTIVE"
                    ? "Re-enter your password to confirm an access change."
                    : undefined
              }
              data-testid="access-confirm-submit"
            >
              {changeMutation.isPending
                ? "Working…"
                : pending.grantId
                  ? "Revoke capability"
                  : "Grant capability"}
            </button>
          </div>
        </section>
      ) : null}

      {policy.isPending ? (
        <StateView kind="loading" message="Reading the access policy…" />
      ) : policy.isError ? (
        <StateView kind="failed" message="Could not read the access policy." onRetry={refresh} />
      ) : rows.length === 0 ? (
        <StateView
          kind="empty"
          message={
            search
              ? `No account matches “${search}”.`
              : "There is nobody to delegate to yet. Create an account in Users & Access first."
          }
        />
      ) : (
        <div className="access-matrix-wrap">
        <table className="admin-table access-matrix" data-testid="access-matrix">
          <thead>
            <tr>
              <th rowSpan={2}>Account</th>
              {GOVERNANCE_GATES.map((gate) => (
                <th key={gate.id} colSpan={2} className="access-gate-head">
                  {gate.label}
                </th>
              ))}
            </tr>
            <tr>
              {GOVERNANCE_GATES.map((gate) => (
                <>
                  <th key={`${gate.id}-read`} className="access-mode-head">
                    See
                  </th>
                  <th key={`${gate.id}-decide`} className="access-mode-head">
                    Decide
                  </th>
                </>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((account) => {
              const withdrawn =
                account.accountState === "DISABLED" || account.accountState === "ARCHIVED";
              return (
                <tr key={account.userId} data-testid={`access-row-${account.username}`}>
                  <td>
                    <button
                      type="button"
                      className="admin-account-name"
                      onClick={() =>
                        setSelected(selected === account.userId ? null : account.userId)
                      }
                      aria-expanded={selected === account.userId}
                    >
                      <span className="mono">{account.username}</span>
                      <span className="admin-account-display">{account.displayName}</span>
                    </button>
                    {withdrawn ? (
                      <span className="admin-flag">{account.accountState.toLowerCase()}</span>
                    ) : null}
                  </td>
                  {GOVERNANCE_GATES.flatMap((gate) =>
                    (["read", "decide"] as const).map((mode) => {
                      const capability = capabilityOf(gate.id, mode);
                      const held = account.capabilities.find((c) => c.capability === capability);
                      /*
                       * A `.decide` grant implies `.read` on the server, so the
                       * See cell shows as covered — but it is NOT independently
                       * revocable, and saying so is the difference between a
                       * grid that explains itself and one that looks broken
                       * when a click does nothing.
                       */
                      const impliedByDecide =
                        mode === "read" &&
                        account.capabilities.some(
                          (c) => c.capability === capabilityOf(gate.id, "decide"),
                        );
                      return (
                        <td key={`${gate.id}-${mode}`} className="access-cell">
                          <button
                            type="button"
                            className="access-toggle"
                            data-held={held ? "true" : impliedByDecide ? "implied" : "false"}
                            data-testid={`access-cell-${account.username}-${gate.id}-${mode}`}
                            aria-label={`${mode === "decide" ? "Decide" : "See"} ${gate.label} for ${account.username}`}
                            aria-pressed={Boolean(held) || impliedByDecide}
                            disabled={withdrawn || impliedByDecide}
                            title={
                              withdrawn
                                ? "This account has no access to the Portal, so a capability would mean nothing."
                                : impliedByDecide
                                  ? "Included with Decide. Revoke Decide to withdraw it."
                                  : undefined
                            }
                            onClick={() => {
                              setFailure(null);
                              setPending({
                                account,
                                gate: gate.id,
                                mode,
                                grantId: held?.grantId ?? null,
                                grantRevision: held?.grantRevision ?? null,
                              });
                            }}
                          >
                            {mode === "decide" ? (
                              <Gavel size={13} aria-hidden="true" />
                            ) : (
                              <Eye size={13} aria-hidden="true" />
                            )}
                          </button>
                        </td>
                      );
                    }),
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}

      {selected ? (
        <Panel title="Access history">
          {activity.isPending ? (
            <StateView kind="loading" message="Reading this account's access history…" />
          ) : activity.isError ? (
            <StateView kind="failed" message="Could not read the history." onRetry={refresh} />
          ) : (activity.data?.length ?? 0) === 0 ? (
            <StateView kind="empty" message="No capability has ever been granted to this account." />
          ) : (
            <ul className="admin-history" data-testid="access-activity">
              {activity.data!.map((entry) => (
                <li key={entry.eventId} data-outcome={entry.outcome}>
                  <span className="mono admin-history-action">{entry.action}</span>
                  <span className="mono admin-history-outcome">{entry.outcome}</span>
                  <span className="mono admin-history-reason">{entry.capability}</span>
                  {/* A refused attempt is listed beside an applied one: a trail
                      of only what worked cannot answer "why does this person
                      still not have it". */}
                  <span className="admin-history-rollback">
                    {entry.reasonCode ?? "Applied."}
                  </span>
                  <span className="mono admin-history-when">{entry.occurredAt}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}
    </div>
  );
}
