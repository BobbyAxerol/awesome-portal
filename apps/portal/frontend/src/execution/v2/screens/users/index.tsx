/**
 * Users (UXM-07 S2, flag key `users`), read only.
 *
 * Mounted by `app/PortalRoutes.tsx` at the Users route in place of the V1
 * `features/admin/UsersAccess.tsx`, which stays untouched. This is NOT an
 * `ExecutionApi` screen: it reads `/api/admin/accounts` and `/api/admin/step-up`
 * through `features/admin/accountApi.ts`, the same client the V1 screen uses.
 *
 * The roster and the history are read by `./rosterReader`, which refuses a
 * malformed body instead of repairing it (one bad row refuses the whole roster,
 * as "unavailable", naming the row and the field); the V1 reader's repairs
 * (a non-list as an empty roster, a bad revision as 0) would be lies here.
 *
 * What the account read publishes is what is shown: the V1 roles `ADMIN` and
 * `USER`, the four lifecycle states, `locked` and `mustChangePassword`, the
 * revision, and the account's own operation history. Role presets and a last
 * sign-in time are not published; they are named as such with their request
 * ids and never drawn as a blank or a default. Changes (invite, disable,
 * enable, archive, activation) stay on the V1 screen: the buttons here are
 * disabled with that reason, and `legacyHref` links to it.
 *
 * Scale and degradation (evidence/UXM07/README.md 2b):
 *
 * | cardinality | break point | degradation | server contract | invariant | perf budget |
 * |---|---|---|---|---|---|
 * | roster of tens, p95 a few hundred, max thousands (one unpaged read) | 200 rows in the DOM | 50 rows, `Load more` to 200, then "narrow the search" | none yet: the roster is a single list, so a keyset page would replace this | counts are over the roster read and say so; no row is dropped by the cap without a count | one read; filtering is in memory; at most 200 table rows |
 *
 * URL: `q`, `sel` (the account's user id), and the screen-local `role` and `state`.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { stepUp, type AccountSummary, type HistoryEntry, type StepUpState } from "../../../../features/admin/accountApi";
import { useSession } from "../../../../auth/session";
import { PanelSkeleton, PanelState } from "../../../components/states";
import { ExecutionSurface } from "../../../ExecutionSurface";
import { CardsTable, type CardsColumn } from "../../cardsTable";
import { GapWhy, SectionPanel, gapTitle } from "../../blocks";
import { Drawer, DockAction, useDockMode, useDockSelection } from "../../Drawer";
import { Flag } from "../../Flag";
import { useExecUrlState, withContext } from "../../urlState";
import { readDetailFromServer, readRosterFromServer } from "./rosterReader";
import {
  ACCOUNT_ROLES, ACCOUNT_STATES, PAGE_SIZE, PRESET_REQUESTS, ROLE_LABEL, ROW_CAP, STATE_VIEW,
  failureOf, filterAccounts, isRole, isState, rosterCounts, stepUpView, type UsersFilters,
} from "./usersModel";

import "../../css/users.css";
import { formatInstant } from "../../boundary";

export const USERS_SCREEN_KEY = "users" as const;

/** The three reads, injectable so a test or a lab can stand in for the network. */
export interface UsersClient {
  roster(): Promise<AccountSummary[]>;
  detail(userId: string): Promise<{ history: HistoryEntry[] }>;
  stepUp(): Promise<StepUpState>;
}

const DEFAULT_CLIENT: UsersClient = { roster: readRosterFromServer, detail: readDetailFromServer, stepUp: stepUp.state };

export interface UsersScreenProps {
  client?: UsersClient;
  /** Route of the V1 Users screen, where changes are still made. */
  legacyHref?: string;
  /** Where "My access" lives, for the denied state. */
  accessHref?: string;
}

type RosterState =
  | { phase: "loading" }
  | { phase: "error"; status: "denied" | "unavailable"; reason: string }
  | { phase: "ready"; accounts: readonly AccountSummary[] };

type DetailState =
  | { phase: "idle" }
  | { phase: "loading"; userId: string }
  | { phase: "error"; userId: string; status: "denied" | "unavailable"; reason: string }
  | { phase: "ready"; userId: string; history: readonly HistoryEntry[] };

const SEARCH_DEBOUNCE_MS = 300;

const LAST_SIGN_IN_REQUEST = "FE-053";

const CHANGES_ELSEWHERE = "Account changes are made on the current Users screen.";

/** `Not published (FE-015, FE-026, FE-037, FE-038)`: the word, then the request ids. */
/** `Not published` on screen; the request ids stay in the title and in hidden text. */
function Unpublished({ ids, what }: { ids: string; what?: string }) {
  return (
    <span className="exec-blk-np">
      <GapWhy className="exec-blk-np-word" gap={ids} text="Not published" name="Not published, reason" rows={[gapTitle(ids)]} />
      <span className="exec-blk-sr"> ({ids})</span>
      {what ? <> {what}</> : null}
    </span>
  );
}

function flagsOf(account: AccountSummary) {
  return (
    <span className="exec-usr-flags">
      <Flag kind={STATE_VIEW[account.accountState].kind} label={STATE_VIEW[account.accountState].label} size="sm" />
      {account.locked ? <Flag kind="attention" label="Locked" size="sm" /> : null}
      {account.mustChangePassword && account.accountState !== "ARCHIVED" ? <Flag kind="pending" label="Awaiting first password" size="sm" /> : null}
    </span>
  );
}

/** `me` is the signed-in user's id when the session published it; that row reads "(you)". */
function columnsFor(me: string | null): readonly CardsColumn<AccountSummary>[] {
  return [
    {
      key: "account",
      label: "Account",
      render: (a) => (
        <span className="exec-usr-name">
          <span className="exec-usr-display">
            {a.displayName || a.username}
            {me !== null && a.userId === me ? <span className="exec-usr-you"> (you)</span> : null}
          </span>
          <span className="exec-usr-username">{a.username}</span>
        </span>
      ),
    },
    { key: "state", label: "State", render: flagsOf },
    { key: "role", label: "Role", render: (a) => ROLE_LABEL[a.role] },
    { key: "revision", label: "Revision", numeric: true, render: (a) => String(a.accountRevision) },
  ];
}

export default function UsersScreen({ client = DEFAULT_CLIENT, legacyHref, accessHref }: UsersScreenProps) {
  const url = useExecUrlState();
  const [params, setParams] = useSearchParams();
  const { access } = useSession();
  const me = access.kind === "ready" && access.access.userId !== "" ? access.access.userId : null;
  const columns = useMemo(() => columnsFor(me), [me]);
  const { selection, select, close } = useDockSelection();
  const mode = useDockMode();
  const reasonId = useId();
  const searchId = useId();

  const [roster, setRoster] = useState<RosterState>({ phase: "loading" });
  const [step, setStep] = useState<StepUpState | null>(null);
  const [stepRead, setStepRead] = useState<"loading" | "ready" | "failed">("loading");
  const [detail, setDetail] = useState<DetailState>({ phase: "idle" });
  const [reload, setReload] = useState(0);
  const [shown, setShown] = useState(PAGE_SIZE);

  const roleParam = params.get("role");
  const stateParam = params.get("state");
  const filters: UsersFilters = useMemo(
    () => ({ q: url.value.q ?? "", role: isRole(roleParam) ? roleParam : null, state: isState(stateParam) ? stateParam : null }),
    [url.value.q, roleParam, stateParam],
  );
  const filterKey = `${filters.q}|${filters.role ?? ""}|${filters.state ?? ""}`;

  /* ── reads ────────────────────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    setRoster((prev) => (prev.phase === "ready" ? prev : { phase: "loading" }));
    client.roster().then(
      (rows) => {
        if (!cancelled) setRoster({ phase: "ready", accounts: rows });
      },
      (error: unknown) => {
        if (!cancelled) setRoster({ phase: "error", ...failureOf(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [client, reload]);

  useEffect(() => {
    let cancelled = false;
    setStepRead("loading");
    client.stepUp().then(
      (state) => {
        if (cancelled) return;
        setStep(state);
        setStepRead("ready");
      },
      () => {
        if (cancelled) return;
        setStep(null);
        setStepRead("failed");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [client, reload]);

  useEffect(() => {
    if (selection === null) {
      setDetail({ phase: "idle" });
      return;
    }
    let cancelled = false;
    setDetail({ phase: "loading", userId: selection });
    client.detail(selection).then(
      (read) => {
        if (!cancelled) setDetail({ phase: "ready", userId: selection, history: read.history });
      },
      (error: unknown) => {
        if (!cancelled) setDetail({ phase: "error", userId: selection, ...failureOf(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [client, selection, reload]);

  useEffect(() => setShown(PAGE_SIZE), [filterKey]);

  /* ── search box: the URL is the state, written after a pause ───────── */
  const [text, setText] = useState(url.value.q ?? "");
  const setUrl = useRef(url.set);
  setUrl.current = url.set;
  useEffect(() => setText(url.value.q ?? ""), [url.value.q]);
  useEffect(() => {
    const next = text.trim() === "" ? null : text.trim();
    if (next === url.value.q) return;
    const timer = setTimeout(() => setUrl.current({ q: next, sel: null }, { replace: true }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, url.value.q]);

  const setLocal = useCallback(
    (name: "role" | "state", value: string) => {
      const next = new URLSearchParams(params);
      if (value === "") next.delete(name);
      else next.set(name, value);
      next.delete("sel");
      setParams(next, { replace: true });
    },
    [params, setParams],
  );
  const clearFilters = () => {
    setText("");
    const next = new URLSearchParams(params);
    for (const key of ["q", "role", "state", "sel"]) next.delete(key);
    setParams(next);
  };

  /* ── derived ─────────────────────────────────────────────────────── */
  const all = roster.phase === "ready" ? roster.accounts : [];
  const counts = useMemo(() => rosterCounts(all), [all]);
  // Filtering follows the text box at once; the URL catches up after the pause.
  const live: UsersFilters = useMemo(() => ({ ...filters, q: text }), [filters, text]);
  const matching = useMemo(() => filterAccounts(all, live), [all, live]);
  const visible = matching.slice(0, Math.min(shown, ROW_CAP));
  const capped = matching.length > ROW_CAP && visible.length >= ROW_CAP;
  const filtered = live.q.trim() !== "" || live.role !== null || live.state !== null;
  const selected = selection === null ? null : all.find((a) => a.userId === selection) ?? null;
  const stepView = stepUpView(stepRead === "ready" ? step : null);
  // A read that belongs to the previously selected account is not this one's history.
  const history: DetailState = detail.phase !== "idle" && detail.userId === selection ? detail : { phase: "loading", userId: selection ?? "" };

  const reload_ = () => setReload((n) => n + 1);

  // The route mounts this screen bare; the type roles and the Carbon theme exist only under a surface (USR-B1).
  return (
    <ExecutionSurface kind="deployments">
    <div className="exec-usr-v2" data-screen="users-v2">
      <header className="exec-usr-head">
        <div>
          <h1 className="exec-usr-title" title="Accounts and their lifecycle. Administrators only. This view reads accounts only.">Users</h1>
        </div>
        <div className="exec-usr-chips">
          {stepRead === "loading" ? (
            <span className="exec-usr-meta" role="status">Reading step-up</span>
          ) : (
            <span className="exec-usr-step" data-step={stepView.kind}>
              <Flag kind={stepView.kind} label={stepView.label} size="sm" />
              {stepView.until ? <span className="exec-usr-meta">until {formatInstant(stepView.until)}</span> : null}
            </span>
          )}
          {legacyHref ? <Link className="exec-usr-link" to={legacyHref}>Open the current Users screen</Link> : null}
        </div>
      </header>

      {roster.phase === "loading" ? (
        <PanelSkeleton label="Loading accounts" />
      ) : roster.phase === "error" ? (
        <PanelState
          status={roster.status}
          reason={roster.reason}
          actions={
            roster.status === "denied"
              ? accessHref ? <Link className="exec-usr-link" to={withContext(accessHref, params)}>My access</Link> : undefined
              : <button type="button" className="exec-usr-btn" onClick={reload_}>Try again</button>
          }
        />
      ) : (
        <>
          <section className="exec-usr-kpis" aria-label="Account counts">
            {([
              ["Accounts", counts.total, "In the roster read"],
              ["Active", counts.byState.ACTIVE, "Can sign in"],
              ["Invited", counts.byState.INVITED, "Hold no credential yet"],
              ["Disabled", counts.byState.DISABLED, "Sign-in blocked"],
              ["Archived", counts.byState.ARCHIVED, "Kept with history"],
              ["Locked", counts.locked, "Server-locked"],
            ] as const).map(([label, value, note]) => (
              <div className="exec-usr-kpi" key={label} title={note}>
                <span className="exec-usr-kpi-label">{label}</span>
                <span className="exec-usr-kpi-value">{value}</span>
              </div>
            ))}
          </section>

          <div className="exec-usr-main" data-docked={selection !== null && mode === "dock" ? "true" : undefined}>
            <div className="exec-usr-body">
              <div className="exec-usr-tool" role="search">
                <input
                  id={searchId}
                  className="exec-usr-input"
                  type="search"
                  aria-label="Search accounts"
                  placeholder="Search by name or username"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                />
                <label className="exec-usr-field">
                  <span className="exec-usr-sr">Role</span>
                  <select className="exec-usr-select" value={filters.role ?? ""} onChange={(event) => setLocal("role", event.target.value)}>
                    <option value="">Role: all</option>
                    {ACCOUNT_ROLES.map((role) => (
                      <option key={role} value={role}>{ROLE_LABEL[role]} ({counts.byRole[role]})</option>
                    ))}
                  </select>
                </label>
                <label className="exec-usr-field">
                  <span className="exec-usr-sr">State</span>
                  <select className="exec-usr-select" value={filters.state ?? ""} onChange={(event) => setLocal("state", event.target.value)}>
                    <option value="">State: all</option>
                    {ACCOUNT_STATES.map((state) => (
                      <option key={state} value={state}>{STATE_VIEW[state].label} ({counts.byState[state]})</option>
                    ))}
                  </select>
                </label>
                <button type="button" className="exec-usr-btn" disabled aria-describedby={reasonId}>Invite account</button>
                {filtered ? <button type="button" className="exec-usr-btn" onClick={clearFilters}>Clear filters</button> : null}
              </div>
              <ul id={reasonId} className="exec-usr-unpub">
                <li><Unpublished ids={PRESET_REQUESTS} what="Role presets" /></li>
                <li><Unpublished ids={LAST_SIGN_IN_REQUEST} what="Last sign-in" /></li>
                <li>{CHANGES_ELSEWHERE}</li>
              </ul>

              {counts.awaitingFirstPassword > 0 ? (
                <p className="exec-usr-note">{counts.awaitingFirstPassword} {counts.awaitingFirstPassword === 1 ? "account is" : "accounts are"} awaiting a first password.</p>
              ) : null}

              <SectionPanel title="Accounts" aside={matching.length === counts.total ? `${matching.length} of ${counts.total}` : `${matching.length} matching of ${counts.total}`} flush>
                <CardsTable
                  columns={columns}
                  rows={visible}
                  rowKey={(a) => a.userId}
                  label="Accounts"
                  selectedKey={selection}
                  onRowOpen={(a) => select(a.userId)}
                  empty={
                    all.length === 0 ? (
                      <PanelState status="empty" reason="The roster is empty. No account has been created." />
                    ) : (
                      <div className="exec-usr-empty">
                        <p>No accounts match these filters.</p>
                        <button type="button" className="exec-usr-btn" onClick={clearFilters}>Clear filters</button>
                      </div>
                    )
                  }
                />
              </SectionPanel>
              <div className="exec-usr-foot">
                <span className="exec-usr-count" role="status" aria-live="polite">
                  {matching.length === 0
                    ? `0 of ${counts.total} accounts in the roster read`
                    : `Showing ${visible.length} of ${matching.length}${filtered ? " matching" : ""} accounts, ${counts.total} in the roster read`}
                </span>
                {visible.length < matching.length && visible.length < ROW_CAP ? (
                  <button type="button" className="exec-usr-btn" onClick={() => setShown((n) => n + PAGE_SIZE)}>Load more</button>
                ) : null}
                {capped ? <span className="exec-usr-note">Showing the first {ROW_CAP} rows. Narrow the search to see the rest.</span> : null}
              </div>
            </div>

            {selection !== null ? (
              <Drawer
                title={selected ? selected.displayName || selected.username : "Account not in the roster read"}
                subtitle={selected ? selected.username : selection}
                mode={mode}
                onClose={close}
                actions={
                  <>
                    <DockAction label="Disable" reason={CHANGES_ELSEWHERE} reasonLabel="" accessHref={legacyHref} accessLabel="Current Users screen" />
                    <DockAction label="Archive" reason={CHANGES_ELSEWHERE} quietReason />
                  </>
                }
              >
                {selected ? (
                  <dl className="exec-usr-facts">
                    <dt>Role</dt>
                    <dd>{ROLE_LABEL[selected.role]}</dd>
                    <dt>State</dt>
                    <dd>{flagsOf(selected)}</dd>
                    <dt>Revision</dt>
                    <dd className="exec-usr-num">{selected.accountRevision}</dd>
                  </dl>
                ) : (
                  <p className="exec-usr-note">This account is not in the roster that was read. It may have been removed or the link is wrong.</p>
                )}
                <h3 className="exec-usr-h3">History</h3>
                {history.phase === "loading" ? (
                  <PanelSkeleton label="Loading account history" />
                ) : history.phase === "error" ? (
                  <PanelState status={history.status} reason={history.reason} />
                ) : history.history.length === 0 ? (
                  <PanelState status="empty" reason="This account has no recorded operations." />
                ) : (
                  <ol className="exec-usr-history" aria-label="Account history">
                    {history.history.slice(0, ROW_CAP).map((entry) => (
                      <li key={`${entry.operationId}:${entry.occurredAt}`}>
                        <span className="exec-usr-meta">{formatInstant(entry.occurredAt)}</span>
                        <span>{entry.action}</span>
                        <Flag
                          kind={entry.outcome === "APPLIED" ? "applied" : entry.outcome === "REPLAYED" ? "neutral" : entry.outcome === "CONFLICT" ? "partial" : "rejected"}
                          label={entry.outcome === "APPLIED" ? "Applied" : entry.outcome === "REPLAYED" ? "Replayed" : entry.outcome === "CONFLICT" ? "Conflict" : "Denied"}
                          size="sm"
                        />
                        {entry.reasonCode ? <span className="exec-usr-meta">{entry.reasonCode}</span> : null}
                        {entry.rollbackDescription ? <span className="exec-usr-meta">{entry.rollbackDescription}</span> : null}
                      </li>
                    ))}
                  </ol>
                )}
                {history.phase === "ready" && history.history.length > ROW_CAP ? (
                  <span className="exec-usr-note">{`Showing ${ROW_CAP} of ${history.history.length} history entries`}</span>
                ) : null}
              </Drawer>
            ) : null}
          </div>
        </>
      )}
    </div>
    </ExecutionSurface>
  );
}
