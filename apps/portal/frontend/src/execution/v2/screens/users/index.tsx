/**
 * Users (UXM-07 S2, flag key `users`), read only.
 *
 * Mounted by `app/PortalRoutes.tsx` at the Users route in place of the V1
 * `features/admin/UsersAccess.tsx`, which stays untouched. This is NOT an
 * `ExecutionApi` screen: it reads `/api/admin/accounts` and `/api/admin/step-up`
 * through `features/admin/accountApi.ts`, the same client the V1 screen uses.
 *
 * The roster and the history are read by `./rosterReader`, which refuses a
 * malformed body instead of repairing it (one bad row, or a page whose counts do
 * not add up, refuses the whole roster as "unavailable", naming the row and the
 * field); the V1 reader's repairs (a non-list as an empty roster, a bad revision
 * as 0) would be lies here.
 *
 * The roster is read one keyset page at a time (BE-P23, DEBT-UXM07-031): 50 rows
 * (ten at 660px and narrower), and `Load more` asks the server for the next page
 * with the cursor it gave. Search, role and state are the SERVER's filters (a
 * filter over loaded rows would say "no match" for accounts that exist on a page
 * not yet read), and the counts on the cards and in the pickers are the server's
 * exact roster-wide counts.
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
 * | roster of tens, p95 a few hundred, max thousands | 200 rows in the DOM; at 660px and narrower a card list of 123 rows is 7,673 px | 50 rows per page (ten at 660px and narrower), `Load more` to 200, then "narrow the search" | `GET /api/admin/accounts?limit&cursor&q&role&state`: keyset on the unique username, signed cursor bound to the filters and limit, exact `counts` from the same statement | counts are the server's exact roster-wide counts; no row is dropped by the cap without the matching count beside it | one request per page (at most 4 at 50, 20 at ten); at most 200 table rows |
 *
 * URL: `q`, `sel` (the account's user id), and the screen-local `role` and `state`.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { stepUp, type AccountSummary, type HistoryEntry, type StepUpState } from "../../../../features/admin/accountApi";
import { useSession } from "../../../../auth/session";
import { PanelSkeleton, PanelState } from "../../../components/states";
import { ExecutionSurface } from "../../../ExecutionSurface";
import { CardsTable, type CardsColumn } from "../../cardsTable";
import { GapWhy, NaWhy, NotAvailableLine, SectionPanel, gapTitle } from "../../blocks";
import { Drawer, DockAction, useDockMode, useDockSelection } from "../../Drawer";
import { Flag } from "../../Flag";
import { useExecUrlState, withContext } from "../../urlState";
import { useMediaQuery } from "../../useMediaQuery";
import { PHONE_QUERY } from "../../usePhoneRows";
import { readDetailFromServer, readRosterPageFromServer, RosterMalformed, type RosterCounts, type RosterPage, type RosterQuery } from "./rosterReader";
import {
  ACCOUNT_ROLES, ACCOUNT_STATES, PAGE_SIZE, PRESET_REQUESTS, ROLE_LABEL, ROW_CAP, STATE_VIEW,
  PHONE_PAGE_SIZE, failureOf, isRole, isState, stepUpView, type UsersFilters,
} from "./usersModel";

import "../../css/users.css";
import { formatInstant } from "../../boundary";

export const USERS_SCREEN_KEY = "users" as const;

/** The three reads, injectable so a test or a lab can stand in for the network. `roster` is one keyset page. */
export interface UsersClient {
  roster(query: RosterQuery): Promise<RosterPage>;
  detail(userId: string): Promise<{ account?: AccountSummary | null; history: HistoryEntry[] }>;
  stepUp(): Promise<StepUpState>;
}

const DEFAULT_CLIENT: UsersClient = { roster: readRosterPageFromServer, detail: readDetailFromServer, stepUp: stepUp.state };

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
  | {
      phase: "ready";
      /** Every page read so far, in the server's order. */
      accounts: readonly AccountSummary[];
      counts: RosterCounts;
      /** The page size this walk started with: a cursor is only valid for the limit it was issued for. */
      limit: number;
      nextCursor: string | null;
      loadingMore: boolean;
    };

type DetailState =
  | { phase: "idle" }
  | { phase: "loading"; userId: string }
  | { phase: "error"; userId: string; status: "denied" | "unavailable"; reason: string }
  | { phase: "ready"; userId: string; account: AccountSummary | null; history: readonly HistoryEntry[] };

const SEARCH_DEBOUNCE_MS = 300;

const EMPTY_COUNTS: RosterCounts = {
  total: 0,
  matching: 0,
  byState: { ACTIVE: 0, INVITED: 0, DISABLED: 0, ARCHIVED: 0 },
  byRole: { ADMIN: 0, USER: 0 },
  locked: 0,
  awaitingFirstPassword: 0,
};

const LAST_SIGN_IN_REQUEST = "FE-053";
/** The request a role preset waits on (the first of PRESET_REQUESTS, the one the gap line is filed under). */
const ROLE_PRESET_FE = "FE-015";
/** Per-row Disable / Enable and Invite: the reason a control is off is the eligibility request. */
const ROW_ACTION_FE = "FE-015";

const CHANGES_ELSEWHERE = "Account changes are made on the current Users screen.";

function flagsOf(account: AccountSummary) {
  return (
    <span className="exec-usr-flags">
      <Flag kind={STATE_VIEW[account.accountState].kind} label={STATE_VIEW[account.accountState].label} size="sm" />
      {account.locked ? <Flag kind="attention" label="Locked" size="sm" /> : null}
      {account.mustChangePassword && account.accountState !== "ARCHIVED" ? <Flag kind="pending" label="Awaiting first password" size="sm" /> : null}
    </span>
  );
}

/** A cell's disclosure or control: a click or key in it is its own and never opens the row's drawer. */
function Inert({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={className} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>{children}</span>;
}

/** The per-row action: off, with its reason. Archived accounts and the signed-in account carry the design's rule words. */
function rowActionOf(account: AccountSummary, me: string | null): ReactNode {
  if (account.accountState === "ARCHIVED") return <span className="exec-usr-meta">Archived accounts stay as they are</span>;
  const label = account.accountState === "DISABLED" ? "Enable" : "Disable";
  const self = me !== null && account.userId === me;
  // Not a component, so no hook: the id is stable per account.
  const reasonId = `exec-usr-why-${account.userId}`;
  const reason = self ? "You cannot disable yourself" : gapTitle(ROW_ACTION_FE, "Per-row action", CHANGES_ELSEWHERE);
  // The click must not open the row's drawer: the control is off, and its reason is a disclosure of its own.
  // The signed-in account's reason is the design's own sentence, printed under the button: a rule of the screen, not a gap.
  return (
    <Inert className="exec-usr-rowact">
      <button type="button" className="exec-usr-btn" disabled aria-label={`${label} ${account.username}`} aria-describedby={reasonId}>{label}</button>
      {self ? (
        <span id={reasonId} className="exec-usr-meta exec-usr-inline-why" data-testid="users-inline-why">{reason}</span>
      ) : (
        <>
          <span id={reasonId} className="exec-blk-sr">{reason}</span>
          <GapWhy name={`Why ${label} is off for ${account.username}`} rows={[reason]} next={null} />
        </>
      )}
    </Inert>
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
    {
      key: "preset",
      label: "Role preset",
      render: () => <Inert><NaWhy reason={gapTitle(PRESET_REQUESTS, "Role preset")} gap={ROLE_PRESET_FE} className="exec-usr-na" /></Inert>,
    },
    { key: "role", label: "Role", render: (a) => ROLE_LABEL[a.role] },
    {
      key: "lastSeen",
      label: "Last seen (UTC)",
      // FE-CAT-8: a published instant prints as received; an omitted field (and a bare null, which the reader folds into it) is
      // unknown and keeps the typed gap: no "Never signed in" without a published coverage statement. Nothing is guessed from the lifecycle record or the revision.
      render: (a) => a.lastSignInAt === undefined || a.lastSignInAt === null
        ? <Inert><NaWhy reason={gapTitle(LAST_SIGN_IN_REQUEST, "Last sign-in")} gap={LAST_SIGN_IN_REQUEST} className="exec-usr-na" /></Inert>
        : formatInstant(a.lastSignInAt),
    },
    { key: "revision", label: "Revision", numeric: true, render: (a) => String(a.accountRevision) },
    { key: "actions", label: "Actions", render: (a) => rowActionOf(a, me) },
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
  const searchId = useId();

  const [roster, setRoster] = useState<RosterState>({ phase: "loading" });
  const [step, setStep] = useState<StepUpState | null>(null);
  const [stepRead, setStepRead] = useState<"loading" | "ready" | "failed">("loading");
  const [detail, setDetail] = useState<DetailState>({ phase: "idle" });
  const [reload, setReload] = useState(0);
  // At 660px and narrower the rows are cards: the server is asked for ten, and Load more asks for the next ten.
  const phone = useMediaQuery(PHONE_QUERY);
  const pageSize = useRef(PAGE_SIZE);
  pageSize.current = phone ? PHONE_PAGE_SIZE : PAGE_SIZE;
  // A walk that a filter or a retry replaced must not append its late pages.
  const walk = useRef(0);

  const roleParam = params.get("role");
  const stateParam = params.get("state");
  const filters: UsersFilters = useMemo(
    () => ({ q: url.value.q ?? "", role: isRole(roleParam) ? roleParam : null, state: isState(stateParam) ? stateParam : null }),
    [url.value.q, roleParam, stateParam],
  );

  /* ── reads ────────────────────────────────────────────────────────── */
  // The first page. The filters in the URL are the server's filters, so a change starts a new walk.
  useEffect(() => {
    let cancelled = false;
    walk.current += 1;
    setRoster((prev) => (prev.phase === "ready" ? prev : { phase: "loading" }));
    client.roster({ limit: pageSize.current, q: filters.q, role: filters.role, state: filters.state }).then(
      (read) => {
        if (!cancelled) {
          setRoster({ phase: "ready", accounts: read.accounts, counts: read.counts, limit: read.page.limit, nextCursor: read.page.nextCursor, loadingMore: false });
        }
      },
      (error: unknown) => {
        if (!cancelled) setRoster({ phase: "error", ...failureOf(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [client, reload, filters.q, filters.role, filters.state]);

  /** The next page, with the cursor the server gave and the limit it was issued for. */
  const loadMore = () => {
    if (roster.phase !== "ready" || roster.nextCursor === null || roster.loadingMore) return;
    const ticket = walk.current;
    const { limit, nextCursor, accounts: held } = roster;
    setRoster({ ...roster, loadingMore: true });
    client.roster({ limit, cursor: nextCursor, q: filters.q, role: filters.role, state: filters.state }).then(
      (read) => {
        if (walk.current !== ticket) return;
        const known = new Set(held.map((a) => a.userId));
        const again = read.accounts.findIndex((a) => known.has(a.userId));
        if (again >= 0) {
          setRoster({ phase: "error", ...failureOf(new RosterMalformed("ROSTER_MALFORMED", `row ${held.length + again + 1}, user_id (repeated)`)) });
          return;
        }
        setRoster({ phase: "ready", accounts: [...held, ...read.accounts], counts: read.counts, limit, nextCursor: read.page.nextCursor, loadingMore: false });
      },
      (error: unknown) => {
        if (walk.current === ticket) setRoster({ phase: "error", ...failureOf(error) });
      },
    );
  };

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
        if (!cancelled) setDetail({ phase: "ready", userId: selection, account: read.account ?? null, history: read.history });
      },
      (error: unknown) => {
        if (!cancelled) setDetail({ phase: "error", userId: selection, ...failureOf(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [client, selection, reload]);

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
  // Exact and roster-wide, from the server; `matching` is what the filters select.
  const counts: RosterCounts = roster.phase === "ready" ? roster.counts : EMPTY_COUNTS;
  const visible = all.slice(0, ROW_CAP);
  const capped = counts.matching > ROW_CAP && visible.length >= ROW_CAP;
  const moreToRead = roster.phase === "ready" && roster.nextCursor !== null && all.length < ROW_CAP;
  const filtered = filters.q.trim() !== "" || filters.role !== null || filters.state !== null || text.trim() !== "";
  // A selection no loaded page holds (a deep link) is shown from its own detail read.
  const fromDetail = detail.phase === "ready" && detail.userId === selection ? detail.account : null;
  const selected = selection === null ? null : all.find((a) => a.userId === selection) ?? fromDetail;
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
          <h1 className="exec-usr-title">Users</h1>
          <p className="exec-usr-sub" data-testid="users-subtitle">Accounts and their lifecycle · Administrators only</p>
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
                {filtered ? <button type="button" className="exec-usr-btn" onClick={clearFilters}>Clear filters</button> : null}
                <span className="exec-usr-invite">
                  <button type="button" className="exec-usr-btn" disabled aria-label="Invite account" aria-describedby="exec-usr-invite-why">Invite account</button>
                  <span id="exec-usr-invite-why" className="exec-blk-sr">{gapTitle(ROW_ACTION_FE, "Invite", CHANGES_ELSEWHERE)}</span>
                  <GapWhy name="Why Invite account is off" rows={[gapTitle(ROW_ACTION_FE, "Invite", CHANGES_ELSEWHERE)]} next={null} />
                </span>
              </div>
              <div className="exec-usr-unpub">
                <NotAvailableLine
                  facts={[
                    { label: "Role presets", why: gapTitle(PRESET_REQUESTS) },
                    { label: "Last sign-in", id: LAST_SIGN_IN_REQUEST },
                  ]}
                />
                <p>{CHANGES_ELSEWHERE}</p>
              </div>

              {counts.awaitingFirstPassword > 0 ? (
                <p className="exec-usr-note">{counts.awaitingFirstPassword} {counts.awaitingFirstPassword === 1 ? "account is" : "accounts are"} awaiting a first password.</p>
              ) : null}

              <SectionPanel title="Accounts" aside={counts.matching === counts.total ? `${counts.matching} of ${counts.total}` : `${counts.matching} matching of ${counts.total}`} flush>
                <CardsTable
                  columns={columns}
                  rows={visible}
                  rowKey={(a) => a.userId}
                  label="Accounts"
                  selectedKey={selection}
                  onRowOpen={(a) => select(a.userId)}
                  empty={
                    counts.total === 0 ? (
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
                  {counts.matching === 0
                    ? `0 of ${counts.total} accounts in the roster read`
                    : `Showing ${visible.length} of ${counts.matching}${filtered ? " matching" : ""} accounts, ${counts.total} in the roster read`}
                </span>
                {moreToRead ? (
                  <button type="button" className="exec-usr-btn" aria-busy={roster.phase === "ready" && roster.loadingMore} onClick={() => { if (!(roster.phase === "ready" && roster.loadingMore)) loadMore(); }}>Load more</button>
                ) : null}
                {capped ? <span className="exec-usr-note">Showing the first {ROW_CAP} rows. Narrow the search to see the rest.</span> : null}
              </div>
              <details className="exec-usr-how" data-testid="users-how">
                <summary>How accounts work</summary>
                <ul>
                  <li>An invited account holds no credential until its first password is set.</li>
                  <li>A disabled account cannot sign in; its history stays.</li>
                  <li>An archived account is kept as it is, with its history.</li>
                  <li>Administrator and User are the two roles the roster publishes; role presets are not published yet.</li>
                  <li>{CHANGES_ELSEWHERE}</li>
                </ul>
              </details>
            </div>

            {selection !== null ? (
              <Drawer
                title={selected ? selected.displayName || selected.username : history.phase === "loading" ? selection : "Account not in the roster read"}
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
                ) : history.phase === "loading" ? null : (
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
