/**
 * Execution access (DR-30), owner only. One panel on the Users screen: who may read the shared execution workspace,
 * for which environments and until when. A grant is READ-ONLY and is not workspace membership.
 *
 * The server decides everything: a 404 on the list read means the feature is off and the panel is not drawn at all; a 401/403
 * says the account is not the owner; any other failure is named, with the server's own code, and can be retried. Every
 * change asks for the owner's password when the server says a step-up is needed, then repeats the same intent with the
 * same idempotency key. Revoking asks for a confirmation that names the account and what it loses. An absent value is
 * said in words ("Not revoked"), never as a dash or a zero.
 */
import { useCallback, useEffect, useId, useState } from "react";

import {
  executionGrants, GRANT_ENVIRONMENTS, newIdempotencyKey,
  type ExecutionGrant, type ExecutionGrantsRead, type GrantEnvironment, type GrantsClient,
} from "../../../../features/admin/executionGrantsApi";
import { PanelSkeleton, PanelState } from "../../../components/states";
import { SectionPanel } from "../../blocks";
import { formatInstant } from "../../boundary";
import { Flag } from "../../Flag";

type Load =
  | { phase: "loading" }
  | { phase: "off" }
  | { phase: "denied" }
  | { phase: "error"; reason: string }
  | { phase: "ready"; data: ExecutionGrantsRead };

interface Draft { username: string; environments: readonly GrantEnvironment[]; termDays: string; mode: "grant" | "renew" }
interface Pending { run: () => Promise<unknown>; key: string; label: string }

const ENV_LABEL: Record<GrantEnvironment, string> = { paper: "Paper", sandbox: "Sandbox", live: "Live" };
const STATUS_VIEW = { ACTIVE: { kind: "ok", label: "Active" }, EXPIRED: { kind: "paused", label: "Expired" }, REVOKED: { kind: "na", label: "Revoked" } } as const;

function words(error: unknown): { status: number | null; code: string | null; message: string } {
  const e = (typeof error === "object" && error !== null ? error : {}) as { status?: unknown; code?: unknown; message?: unknown; where?: unknown };
  const code = typeof e.code === "string" ? e.code : null;
  return { status: typeof e.status === "number" ? e.status : null, code,
    message: typeof e.message === "string" && e.message ? e.message : "The access change could not be completed." };
}

export function ExecutionGrantsPanel({ client = executionGrants }: { client?: GrantsClient }) {
  const [load, setLoad] = useState<Load>({ phase: "loading" });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [needPassword, setNeedPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const formId = useId();

  const read = useCallback(() => {
    client.list().then(
      (data) => setLoad({ phase: "ready", data }),
      (error: unknown) => {
        const w = words(error);
        if (w.status === 404) setLoad({ phase: "off" });
        else if (w.status === 401 || w.status === 403) setLoad({ phase: "denied" });
        else setLoad({ phase: "error", reason: `The execution grants could not be read${w.code ? ` (${w.code})` : ""}.` });
      },
    );
  }, [client]);
  useEffect(() => { read(); }, [read]);

  /** Run one confirmed change; a step-up request keeps the same intent (and key) for the retry. */
  const attempt = async (job: Pending) => {
    setBusy(true); setFailed(null); setNotice(null);
    try {
      await job.run();
      setPending(null); setNeedPassword(false); setPassword(""); setDraft(null); setConfirmRevoke(null);
      setNotice(`${job.label} done. It applies from the next request.`);
      read();
    } catch (error) {
      const w = words(error);
      if (w.code === "STEP_UP_REQUIRED") { setPending(job); setNeedPassword(true); }
      else { setPending(null); setFailed(`${w.message}${w.code ? ` (${w.code})` : ""}`); }
    } finally { setBusy(false); }
  };

  const submitDraft = () => {
    if (!draft || load.phase !== "ready") return;
    const max = load.data.maxTermDays, days = Number(draft.termDays);
    if (draft.mode === "grant" && !draft.username) return setDraftError("Choose an account.");
    if (draft.environments.length === 0) return setDraftError("Choose at least one environment. None is assumed.");
    if (!Number.isInteger(days) || days < 1 || days > max) return setDraftError(`Enter a term of 1 to ${max} days.`);
    setDraftError(null);
    const input = { username: draft.username, environments: draft.environments, termDays: days };
    const key = newIdempotencyKey();
    void attempt({ key, label: draft.mode === "grant" ? `Grant for ${draft.username}` : `Renewal for ${draft.username}`,
      run: () => (draft.mode === "grant" ? client.grant(input, key) : client.renew(input, key)) });
  };
  const submitPassword = async () => {
    if (!pending || password === "") return;
    setBusy(true);
    try { await client.confirmPassword(password); } catch (error) {
      setBusy(false); const w = words(error); setFailed(`${w.message}${w.code ? ` (${w.code})` : ""}`); return;
    }
    setPassword(""); setBusy(false);
    await attempt(pending);
  };

  if (load.phase === "off") return null;
  if (load.phase === "loading") return <PanelSkeleton label="Loading execution access" />;
  if (load.phase === "denied") return <PanelState status="denied" reason="Execution access is managed by the owner. This account is not the owner." />;
  if (load.phase === "error") {
    return <PanelState status="unavailable" reason={load.reason} actions={<button type="button" className="exec-usr-btn" onClick={() => { setLoad({ phase: "loading" }); read(); }}>Try again</button>} />;
  }

  const { data } = load;
  const toggle = (env: GrantEnvironment) => setDraft((d) => d && ({ ...d, environments: d.environments.includes(env) ? d.environments.filter((x) => x !== env) : [...d.environments, env] }));
  const active = new Set(data.grants.filter((g) => g.status === "ACTIVE").map((g) => g.username));
  const grantable = data.candidates.filter((c) => !active.has(c.username));
  const startRenew = (g: ExecutionGrant) => { setConfirmRevoke(null); setNotice(null); setFailed(null); setDraft({ mode: "renew", username: g.username, environments: g.environments, termDays: String(data.maxTermDays) }); };

  return (
    <SectionPanel title="Execution access" aside={`${data.grants.filter((g) => g.status === "ACTIVE").length} active`}>
      <p className="exec-usr-note">Read-only access to the shared execution workspace, per environment. It is not membership and allows no change. A grant or revoke applies from the next request.</p>
      {notice ? <p className="exec-usr-note" role="status">{notice}</p> : null}
      {failed ? <p className="exec-usr-note" role="alert" data-testid="grants-error">{failed}</p> : null}

      {data.grants.length === 0 ? (
        <PanelState status="empty" reason="No account holds an execution grant." />
      ) : (
        <table className="exec-usr-table" aria-label="Execution grants">
          <thead><tr><th scope="col">Account</th><th scope="col">Environments</th><th scope="col">Granted</th><th scope="col">Expires</th><th scope="col">Revoked</th><th scope="col">State</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            {data.grants.map((g) => (
              <tr key={g.userId}>
                <th scope="row">{g.displayName && g.displayName !== g.username ? `${g.displayName} (${g.username})` : g.username}</th>
                <td>{g.environments.map((e) => ENV_LABEL[e]).join(", ")}</td>
                <td>{formatInstant(g.termStartedAt)}</td>
                <td>{formatInstant(g.expiresAt)}</td>
                <td>{g.revokedAt ? formatInstant(g.revokedAt) : "Not revoked"}</td>
                <td><Flag kind={STATUS_VIEW[g.status].kind} label={STATUS_VIEW[g.status].label} size="sm" /></td>
                <td>
                  {g.status === "REVOKED" ? <span className="exec-usr-meta">Issue a new grant to restore access</span> : (
                    <>
                      <button type="button" className="exec-usr-btn" onClick={() => startRenew(g)} aria-label={`Renew ${g.username}`}>Renew</button>{" "}
                      <button type="button" className="exec-usr-btn" onClick={() => { setDraft(null); setNotice(null); setFailed(null); setConfirmRevoke(g.username); }} aria-label={`Revoke ${g.username}`}>Revoke</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {confirmRevoke ? (
        <div role="alertdialog" aria-label={`Confirm revoke ${confirmRevoke}`} className="exec-usr-note" data-testid="grants-revoke-confirm">
          <p>Revoke execution access for {confirmRevoke}? They lose every environment from their next request. You can issue a new grant later.</p>
          <button type="button" className="exec-usr-btn" aria-busy={busy} onClick={() => { const key = newIdempotencyKey(); void attempt({ key, label: `Revoke for ${confirmRevoke}`, run: () => client.revoke(confirmRevoke, key) }); }}>Confirm revoke</button>{" "}
          <button type="button" className="exec-usr-btn" onClick={() => setConfirmRevoke(null)}>Cancel</button>
        </div>
      ) : null}

      {draft ? (
        <form id={formId} noValidate className="exec-usr-note" aria-label={draft.mode === "grant" ? "Grant execution access" : `Renew ${draft.username}`} onSubmit={(event) => { event.preventDefault(); submitDraft(); }}>
          {draft.mode === "grant" ? (
            <label className="exec-usr-field">Account{" "}
              <select className="exec-usr-select" value={draft.username} onChange={(event) => { const value = event.target.value; setDraft((d) => d && { ...d, username: value }); }}>
                <option value="">Choose an account</option>
                {grantable.map((c) => <option key={c.username} value={c.username}>{c.displayName && c.displayName !== c.username ? `${c.displayName} (${c.username})` : c.username}</option>)}
              </select>
            </label>
          ) : <p>Renewing {draft.username}. The environments and term below replace the current ones.</p>}
          <fieldset>
            <legend>Environments (none is assumed)</legend>
            {GRANT_ENVIRONMENTS.map((env) => (
              <label key={env}><input type="checkbox" checked={draft.environments.includes(env)} onChange={() => toggle(env)} /> {ENV_LABEL[env]}</label>
            ))}
          </fieldset>
          <label className="exec-usr-field">Term in days (up to {data.maxTermDays}){" "}
            <input className="exec-usr-input" type="number" inputMode="numeric" min={1} max={data.maxTermDays} value={draft.termDays} onChange={(event) => { const value = event.target.value; setDraft((d) => d && { ...d, termDays: value }); }} />
          </label>
          {draftError ? <p role="alert" data-testid="grants-draft-error">{draftError}</p> : null}
          <button type="submit" className="exec-usr-btn" aria-busy={busy}>{draft.mode === "grant" ? "Grant read-only access" : "Renew grant"}</button>{" "}
          <button type="button" className="exec-usr-btn" onClick={() => { setDraft(null); setDraftError(null); }}>Cancel</button>
        </form>
      ) : (
        <button type="button" className="exec-usr-btn" onClick={() => { setConfirmRevoke(null); setNotice(null); setFailed(null); setDraft({ mode: "grant", username: "", environments: [], termDays: String(data.maxTermDays) }); }}>
          Grant access
        </button>
      )}
      {grantable.length === 0 && !draft ? <p className="exec-usr-meta">Every eligible account already has an active grant, or none is eligible yet.</p> : null}

      {needPassword ? (
        <form className="exec-usr-note" aria-label="Confirm with your password" onSubmit={(event) => { event.preventDefault(); void submitPassword(); }}>
          <p>This change needs your password again.</p>
          <label className="exec-usr-field">Password{" "}
            <input className="exec-usr-input" type="password" autoComplete="off" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>{" "}
          <button type="submit" className="exec-usr-btn" aria-busy={busy}>Confirm and apply</button>{" "}
          <button type="button" className="exec-usr-btn" onClick={() => { setNeedPassword(false); setPending(null); setPassword(""); }}>Cancel</button>
        </form>
      ) : null}
    </SectionPanel>
  );
}
