/**
 * Accounts: the physical bindings, and the sleeves on them (hi-fi accounts.html).
 *
 * One row is one binding (`GET /broker-bindings`): its venue, the account it
 * backs, the state and credential words the source published, and when it was
 * last updated. Physical equity, the sum of virtual allocations and the
 * check between them come from the figures the bindings list publishes per row
 * (FE-CAT-4, `figures`) when a row carries them: no further read for that row. A row
 * without them (a producer with no owning source) takes the capped fallback: two
 * published carriers (the account resource and the binding exposure) for the first
 * ROW_FACTS_CAP such rows, four at a time (DEBT-UXM07-052); a row beyond the cap, or a
 * failed read, prints `Not available` with the reason, never a dash and never 0. The
 * binding peek (the Drawer) reads the exposure for the one selected binding.
 *
 * Filters that the server can apply (environment lens, search, venue) are sent
 * with the read; the Issues lens and the credential filter narrow only the
 * rows already loaded, and the count line says so.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";

import type { ExecutionApi } from "../../../api/ports";
import { PanelState } from "../../../components/states";
import { CardsTable, type CardsColumn } from "../../cardsTable";
import { formatAsOf } from "../../boundary";
import { useDockMode, useDockSelection } from "../../Drawer";
import { Flag } from "../../Flag";
import { withOrigin } from "../../backTo";
import { ENV_LABEL, serializeUrlParams, useExecUrlState, withContext, type ExecEnv } from "../../urlState";
import { BindingDrawer } from "./BindingDrawer";
import { StateFlag, CredentialFlag, Na, Updated, Value } from "./parts";
import { factKey, useBindingPages, useRowFacts } from "./reads";
import {
  ACCESS_PATH, CREDENTIAL_FILTERS, ENV_TABS, ROW_CAP, ROW_FACTS_CAP, accountHref, checkOf, freshnessFlag, humanize, inScope, matchesCredential,
  readCredentialFilter, timeOf, toBindingRow, updatedAgo, UPDATED_STALE_MINUTES, type BindingEnv, type BindingRow, type ListRowFacts,
} from "./model";
import { GapWhy } from "../../blocks";

const SEARCH_DEBOUNCE_MS = 300;

export interface AccountsListProps {
  api: ExecutionApi;
  /** The V1 `?binding=` deep link: opens that binding's peek once. */
  binding?: string | null;
  capabilities: ReadonlySet<string>;
}

function mergeSeen(current: readonly string[], next: readonly string[]): readonly string[] {
  const merged = [...new Set([...current, ...next])].sort((a, b) => a.localeCompare(b));
  return merged.length === current.length ? current : merged;
}

const BEYOND = `Physical and virtual figures are read one row at a time for the first ${ROW_FACTS_CAP} rows only.`;
// Once some rows carry published figures the sentence is about the other rows alone.
const BEYOND_REST = `Physical and virtual figures the list does not publish are read one row at a time for the first ${ROW_FACTS_CAP} such rows only.`;

export function AccountsList({ api, binding = null, capabilities }: AccountsListProps) {
  const url = useExecUrlState();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const { selection, select, close } = useDockSelection();
  const mode = useDockMode();
  const panelId = useId();

  const { q, sel, env } = url.value;
  const issuesOnly = params.get("issues") === "1";
  const venue = params.get("venue")?.trim() || null;
  const credentialFilter = readCredentialFilter(params.get("credential"));

  const pages = useBindingPages(api, { env, q, venue });
  const envelope = pages.envelope;

  // The V1 `?binding=` link opens the peek once; after that `sel` owns it.
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (binding === null || opened.current === binding) return;
    opened.current = binding;
    if (sel === null) url.set({ sel: binding }, { replace: true });
  }, [binding, sel, url]);

  const all = useMemo(() => pages.items.map(toBindingRow), [pages.items]);
  const visible = useMemo(
    () => all.filter((row) => inScope(row, issuesOnly) && matchesCredential(row, credentialFilter)).slice(0, ROW_CAP),
    [all, issuesOnly, credentialFilter],
  );
  // Cached row figures belong to the identity that read them: another workspace, environment or authority starts from nothing.
  const factsScope = `${params.get("workspace_id") ?? ""}|${env}|${[...capabilities].sort().join(",")}`;
  // A row whose figures the bindings list published (FE-CAT-4) is never read again. Only the rows without them take the
  // capped two-read fallback, and the cap counts those rows alone.
  const unpublished = useMemo(() => visible.filter((row) => row.listFacts === null), [visible]);
  const rowFacts = useRowFacts(api, unpublished, factsScope);
  const factsCapped = unpublished.length > ROW_FACTS_CAP;
  const beyond = unpublished.length === visible.length ? BEYOND : BEYOND_REST;
  const factsOf = (row: BindingRow) => {
    if (row.listFacts !== null) return { phase: "ready", facts: row.listFacts, exposureFailed: false, accountFailed: false } as const;
    const index = unpublished.indexOf(row);
    if (index >= ROW_FACTS_CAP) return "beyond" as const;
    return rowFacts.get(factKey(row)) ?? ({ phase: "loading" } as const);
  };
  const selected = selection === null ? null : all.find((row) => row.bindingId === selection) ?? null;

  // Venue options come from rows the page has shown and survive filtering.
  const [seenVenues, setSeenVenues] = useState<readonly string[]>([]);
  useEffect(() => setSeenVenues((c) => mergeSeen(c, pages.items.map((item) => item.venue))), [pages.items]);
  const venueOptions = useMemo(() => mergeSeen(seenVenues, venue ? [venue] : []), [seenVenues, venue]);

  const setLocal = (name: "issues" | "venue" | "credential", value: string) => {
    const next = new URLSearchParams(params);
    if (value === "") next.delete(name);
    else next.set(name, value);
    next.delete("sel");
    setParams(next, { replace: true });
  };
  const pickEnv = (next: ExecEnv) => url.set({ env: next, sel: null });
  // Same roving tabindex and arrow keys as Account 360 and My access: the arrows cycle the three environments.
  const envKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const at = ENV_TABS.findIndex((id) => id === env);
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = ENV_TABS[(at + step + ENV_TABS.length) % ENV_TABS.length]!;
    pickEnv(next);
    requestAnimationFrame(() => document.getElementById(`${panelId}-tab-${next}`)?.focus());
  };
  const clearFilters = () => {
    const next = serializeUrlParams({ q: null, sel: null }, params);
    next.delete("issues");
    next.delete("venue");
    next.delete("credential");
    setParams(next);
  };

  // Search commits on Enter or after a pause; the URL is the state.
  const [text, setText] = useState(q ?? "");
  const setUrl = useRef(url.set);
  setUrl.current = url.set;
  useEffect(() => setText(q ?? ""), [q]);
  useEffect(() => {
    const next = text.trim() === "" ? null : text.trim();
    if (next === q) return;
    const timer = setTimeout(() => setUrl.current({ q: next, sel: null }, { replace: true }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, q]);

  const filtered = issuesOnly || q !== null || venue !== null || credentialFilter !== null;
  const drawerEnv: BindingEnv = envelopeEnvironment(envelope?.environment) ?? env;
  const fresh = envelope ? freshnessFlag(envelope.freshness) : null;
  const sourceAsOf = envelope ? timeOf({ source_as_of: envelope.sourceAsOf }, "source_as_of") : null;
  const readAtMs = envelope ? timeOf({ read_at: envelope.readAt }, "read_at") : null;
  const incomplete = envelope !== null && envelope.completeness.toUpperCase() !== "COMPLETE";
  const narrowedHere = issuesOnly || credentialFilter !== null;
  const capped = pages.items.length >= ROW_CAP;
  // The Issues lens counts what is loaded: the server does not filter on it.
  const issueCount = useMemo(() => all.filter((row) => inScope(row, true)).length, [all]);
  // Nothing is counted before the rows are read: an unread list is not "0 issues". More pages
  // behind the cursor mean the count is a floor, so it carries a plus.
  const issueCountText = pages.state.phase === "ready" ? `${issueCount}${pages.nextCursor !== null ? "+" : ""}` : null;

  // Tab counts come from the server's published counts block, from the same authorized snapshot as the page (FE-CAT-4). The selected
  // tab uses its published count; without one it uses this read's own authorized total (the page's total_count), never the filtered
  // count, so no filter moves a tab. Another environment's count is a number when published, a typed absence ("n/a", reason in the
  // note under the strip) when the block exists and says null, and nothing when the producer publishes no block at all. Never 0.
  const block = envelope?.counts ?? null;
  const published = block?.byEnvironment ?? null;
  type TabCount = { kind: "number"; value: number } | { kind: "absent" } | null;
  const tabCount = (id: BindingEnv): TabCount => {
    const count = published === null ? undefined : published[id];
    if (typeof count === "number") return { kind: "number", value: count };
    if (env === id) return envelope !== null ? { kind: "number", value: envelope.page.totalCount } : null;
    return block !== null ? { kind: "absent" } : null;
  };
  const issuesEverywhere = block?.issues;
  const issuesCount: TabCount = null; // the Issues control counts the loaded rows by the rules the rows show; the server's total is in its title
  const countNode = (count: TabCount) => (count === null ? null
    : count.kind === "number" ? <span className="exec-acct-tab-count">{count.value}</span>
      : <span className="exec-acct-tab-count" data-state="absent" aria-label="Count not published">n/a</span>);
  const someAbsent = [...ENV_TABS.map((id) => tabCount(id)), issuesCount].some((count) => count?.kind === "absent");

  // The freshness chip speaks for the read; a binding the source last updated long before that read is not fresh because the read was.
  // Counted over the loaded rows, with the same age rule the Updated column uses.
  const staleLoaded = readAtMs === null ? 0 : all.filter((row) => updatedAgo(row.updatedAt, readAtMs)?.stale === true).length;

  const columns: CardsColumn<BindingRow>[] = [
    {
      key: "binding",
      label: "Binding · Venue",
      render: (row) => (
        <span className="exec-acct-cell">
          <b className="exec-acct-name">{row.bindingId}</b>
          <span className="exec-acct-sub">{row.venue}{envelope ? ` · ${envWord(envelope.environment)}` : ""}</span>
        </span>
      ),
    },
    {
      key: "account",
      label: "Account",
      render: (row) => {
        const state = factsOf(row);
        const sleeves = state !== "beyond" && state.phase === "ready" ? state.facts.sleeves : null;
        return (
          <span className="exec-acct-cell">
            <Link className="exec-acct-link" to={withContext(withOrigin(accountHref(row.accountId), { kind: "accounts" }, params), params)} onClick={(event) => event.stopPropagation()}>{row.accountId}</Link>
            {sleeves !== null ? <span className="exec-acct-sub">{sleeves} {sleeves === 1 ? "sleeve" : "sleeves"}</span> : null}
          </span>
        );
      },
    },
    { key: "state", label: "State", render: (row) => <StateFlag word={row.stateWord} /> },
    { key: "credential", label: "Credential", render: (row) => <CredentialFlag word={row.credentialWord} /> },
    {
      key: "physical",
      label: "Physical equity",
      numeric: true,
      render: (row) => {
        const state = factsOf(row);
        if (state === "beyond") return <Na why={beyond} />;
        if (state.phase === "loading") return <span className="exec-acct-sub">Loading</span>;
        return linesOf(state.facts, (line) => (
          <>
            {line.physical === undefined && line.physicalWhy !== undefined ? (
              <span className="exec-acct-sub">{line.currency}: {line.physicalWhy}</span>
            ) : (
              <Value metric={line.physical} suffix={line.currency ?? undefined} />
            )}
            {line.physical === undefined && line.physicalWhy === undefined ? <span className="exec-acct-sub">{state.accountFailed ? "Account read failed" : "Venue report not published"}</span> : null}
            {line.physical != null && line.physical.kind === "absent" ? <span className="exec-acct-sub">Venue report not published</span> : null}
            {line.partial === true ? <span className="exec-acct-sub">Partial coverage</span> : null}
          </>
        ));
      },
    },
    {
      key: "virtual",
      label: "Σ Virtual · Headroom",
      numeric: true,
      render: (row) => {
        const state = factsOf(row);
        if (state === "beyond") return <Na why={beyond} />;
        if (state.phase === "loading") return <span className="exec-acct-sub">Loading</span>;
        return linesOf(state.facts, ({ virtual, headroom, currency, partial }) => (
          <>
            <Value metric={virtual} suffix={currency ?? undefined} />
            {virtual === undefined ? (
              <span className="exec-acct-sub">{state.exposureFailed ? "Exposure read failed" : currency === null ? "No physical currency to match" : "No virtual sum in this currency"}</span>
            ) : virtual !== null && virtual.kind === "absent" ? (
              <span className="exec-acct-sub">The source reported no virtual sum</span>
            ) : (
              <span className="exec-acct-sub">Headroom <Value metric={headroom} /></span>
            )}
            {partial === true ? <span className="exec-acct-sub">Partial coverage</span> : null}
          </>
        ));
      },
    },
    {
      key: "check",
      label: "Check",
      render: (row) => {
        const state = factsOf(row);
        if (state === "beyond") return <Flag kind="na" label="Not available" size="sm" />;
        if (state.phase === "loading") return <span className="exec-acct-sub">Loading</span>;
        const flagOf = (line: ListRowFacts) => {
          const word = checkOf(line.physical, line.virtual);
          if (word.kind === "within") return <Flag kind="ok" label="Within physical" size="sm" />;
          if (word.kind === "exceeded") return <Flag kind="attention" label="Exceeded" size="sm" />;
          return (
            <span className="exec-acct-cell">
              <Flag kind="na" label="Not available" size="sm" />
              <GapWhy name="Why the check is not available" rows={[line.physical === undefined && line.physicalWhy !== undefined ? line.physicalWhy : word.reason]} next={null} />
            </span>
          );
        };
        // One currency: the flag as before. Several: each line names its currency, and no line speaks for another.
        if (state.facts.more === undefined) return flagOf(state.facts);
        return linesOf(state.facts, (line) => <><span className="exec-acct-ccy">{line.currency}</span>{flagOf(line)}</>);
      },
    },
    {
      key: "updated",
      label: "Updated",
      sortOffReason: readAtMs !== null ? `Ages are measured against the read at ${formatAsOf(readAtMs)}, not the browser clock.` : "The read time was not published, so ages are shown as times.",
      render: (row) => <Updated at={row.updatedAt} readAt={readAtMs} />,
    },
  ];

  const countLine = (() => {
    if (!envelope || pages.state.phase !== "ready") return null;
    const { filteredCount, totalCount } = envelope.page;
    if (narrowedHere) {
      return `${visible.length} ${issuesOnly ? "with issues" : "match"} in the ${pages.items.length} loaded rows, ${filteredCount} on the server`;
    }
    const scope = filteredCount !== totalCount ? `, ${totalCount} in your scope` : "";
    const head = capped && visible.length >= ROW_CAP ? `Top ${visible.length} of ${filteredCount}` : `${visible.length} of ${filteredCount}`;
    return `${head} ${filteredCount === 1 ? "binding" : "bindings"}${scope}`;
  })();

  const empty = (() => {
    if (pages.state.phase !== "ready") return undefined;
    if (!filtered) return <PanelState status="empty" reason="No bindings yet. The source published an empty set." />;
    return (
      <div className="exec-acct-empty">
        <p>
          {narrowedHere && pages.nextCursor
            ? `None of the ${pages.items.length} loaded rows match. Load more to keep looking.`
            : "No bindings match these filters."}
        </p>
        <button type="button" className="exec-acct-btn" onClick={clearFilters}>Clear filters</button>
      </div>
    );
  })();

  const chips: { id: string; text: string; clear(): void }[] = [
    ...(issuesOnly ? [{ id: "issues", text: "issues only", clear: () => setLocal("issues", "") }] : []),
    ...(venue ? [{ id: "venue", text: `venue: ${venue}`, clear: () => setLocal("venue", "") }] : []),
    ...(credentialFilter ? [{ id: "credential", text: `credential: ${credentialFilter === "ok" ? "Synced" : "Needs attention"}`, clear: () => setLocal("credential", "") }] : []),
    ...(q ? [{ id: "search", text: `search: ${q}`, clear: () => url.set({ q: null, sel: null }, { replace: true }) }] : []),
  ];

  return (
    <div className="exec-acct-v2" data-screen="accounts-v2">
      <header className="exec-acct-head">
        <div>
          <h1 className="exec-acct-title">Accounts</h1>
          <p className="exec-acct-subtitle">Venue bindings and the sleeves on them</p>
        </div>
        <div className="exec-acct-fresh">
          {/* One chip for the worst of what is loaded: a fresh read never sits beside stale bindings (QA4 R4-04). */}
          {fresh && !(fresh.kind === "ok" && staleLoaded > 0) ? <Flag kind={fresh.kind} label={fresh.label} size="sm" /> : null}
          {staleLoaded > 0 ? <Flag kind="stale" label={`${staleLoaded} of ${all.length} last updated over ${UPDATED_STALE_MINUTES} min before the read`} size="sm" /> : null}
          {envelope ? (
            <span>
              {sourceAsOf !== null ? `As of ${formatAsOf(sourceAsOf)}` : "Source time not published"}
              {readAtMs !== null ? ` · Read ${formatAsOf(readAtMs)}` : ""}
            </span>
          ) : null}
        </div>
      </header>

      {incomplete && envelope ? (
        <div className="exec-acct-banner" role="status">
          <Flag kind="partial" label="Partial" size="sm" />
          <span>Some bindings may be missing</span><GapWhy name="Why bindings may be missing" rows={[`The read is ${humanize(envelope.completeness).toLowerCase()}`]} next={null} />
        </div>
      ) : null}

      <div className="exec-acct-main" data-docked={selection !== null && mode === "dock" ? "true" : undefined}>
        <div className="exec-acct-body">
          <div className="exec-acct-tabrow">
          <div className="exec-acct-tabs" role="tablist" aria-label="Environment" onKeyDown={envKeys}>
            {ENV_TABS.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`${panelId}-tab-${id}`}
                aria-selected={env === id}
                aria-controls={`${panelId}-panel`}
                tabIndex={env === id ? 0 : -1}
                className="exec-acct-tab"
                onClick={() => pickEnv(id)}
              >
                {ENV_LABEL[id]}
                {countNode(tabCount(id))}
              </button>
            ))}
          </div>
          {/* The Issues lens sits in the strip like the design's Issues tab; it is a toggle on the loaded rows (the server does not filter on it). */}
          <button type="button" className="exec-acct-tab" aria-pressed={issuesOnly}
              aria-label={issueCountText === null ? "Issues only, count shown once the rows are read" : `Issues only, ${issueCountText} in the ${all.length} loaded rows`}
              title={issueCountText === null
                ? "The count appears once the rows are read. The server does not filter on this."
                : `${issueCountText} of the ${all.length} loaded rows need attention: a wrong state or credential, or virtual capital above the physical equity. The server does not filter on this.${typeof issuesEverywhere === "number" ? ` ${issuesEverywhere} across all environments.` : ""}`}
              onClick={() => setLocal("issues", issuesOnly ? "" : "1")}
            >
              Issues{issueCountText !== null ? <span className="exec-acct-tab-count">{issueCountText}</span> : null}
            </button>
          </div>

          {someAbsent ? <p className="exec-acct-note">n/a: the server did not publish that count from this snapshot, so none is shown.</p> : null}

          <div className="exec-acct-tool" role="search">
            <label className="exec-acct-field">
              <span className="exec-acct-sr">Search binding or account</span>
              <input
                className="exec-acct-input"
                type="search"
                placeholder="Search binding or account"
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") url.set({ q: text.trim() === "" ? null : text.trim(), sel: null }, { replace: true });
                }}
              />
            </label>
            <label className="exec-acct-field">
              <span className="exec-acct-sr">Venue</span>
              <select className="exec-acct-select" value={venue ?? ""} onChange={(event) => setLocal("venue", event.target.value)}>
                <option value="">Venue: all</option>
                {venueOptions.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <label className="exec-acct-field">
              <span className="exec-acct-sr">Credential</span>
              <select className="exec-acct-select" value={credentialFilter ?? ""} onChange={(event) => setLocal("credential", event.target.value)}>
                <option value="">Credential: all</option>
                {CREDENTIAL_FILTERS.map((id) => <option key={id} value={id}>{id === "ok" ? "Synced" : "Needs attention"}</option>)}
              </select>
            </label>
            {filtered ? <button type="button" className="exec-acct-btn" onClick={clearFilters}>Clear all</button> : null}
            <span className="exec-acct-export">
              <button type="button" className="exec-acct-btn" disabled aria-describedby={`${panelId}-export`}>Export</button>
              <span id={`${panelId}-export`} className="exec-acct-note">Export is not available yet · <Link className="exec-acct-link" to={withContext(ACCESS_PATH, params)}>My access</Link></span>
            </span>
          </div>

          {/* The scope of this view is the address: the same link opens the same list (audit 8 #9). */}
          <details className="exec-acct-url">
            <summary>URL</summary>
            <p className="exec-acct-mono">{location.pathname}{location.search}</p>
          </details>

          {chips.length > 0 ? (
            <div className="exec-acct-chips" aria-label="Active filters">
              {chips.map((chip) => (
                <span key={chip.id} className="exec-acct-chip">
                  {chip.text}
                  <button type="button" className="exec-acct-chipx" aria-label={`Clear ${chip.id}`} onClick={chip.clear}>✕</button>
                </span>
              ))}
            </div>
          ) : null}

          <div role="tabpanel" id={`${panelId}-panel`} aria-labelledby={`${panelId}-tab-${env}`} className="exec-acct-panel">
            {pages.state.phase === "loading" || pages.state.phase === "idle" ? (
              <PanelState status="loading" />
            ) : pages.state.phase === "error" ? (
              <PanelState status={pages.state.status} reason={pages.state.reason} />
            ) : (
              <>
                <CardsTable
                  columns={columns}
                  rows={visible}
                  rowKey={(row) => row.bindingId}
                  label="Bindings"
                  selectedKey={selection}
                  onRowOpen={(row) => select(row.bindingId)}
                  empty={empty}
                />
                <div className="exec-acct-foot">
                  <span className="exec-acct-count" role="status" aria-live="polite">{countLine}</span>
                  {narrowedHere ? <GapWhy name="Why the filters narrow only what is loaded" rows={["The server does not filter these, so they narrow only what is loaded."]} next={null} /> : null}
                  {pages.nextCursor && !capped ? (
                    <button type="button" className="exec-acct-btn" disabled={pages.loadingMore} title={pages.loadingMore ? "Loading the next page" : "Load the next page"} onClick={pages.loadMore}>
                      {pages.loadingMore ? "Loading" : "Load more"}
                    </button>
                  ) : null}
                  <span className="exec-acct-note exec-acct-scrollhint">Scroll sideways for the other columns</span>
                  {factsCapped ? <span className="exec-acct-note">{beyond}</span> : null}
                  {pages.nextCursor && capped ? <span className="exec-acct-note">Showing the first {ROW_CAP} rows. Narrow the filters to see the rest.</span> : null}
                </div>
                {pages.moreError ? (
                  <p className="exec-acct-note" role="alert">The next page could not be read ({pages.moreError}). The rows above are unchanged.</p>
                ) : null}
              </>
            )}
          </div>
        </div>

        {selection !== null ? (
          <BindingDrawer
            api={api}
            bindingId={selection}
            row={selected}
            environment={drawerEnv}
            mode={mode}
            capabilities={capabilities}
            onClose={close}
          />
        ) : null}
      </div>
    </div>
  );
}

/** One currency is one cell as before; a mixed-currency row stacks one line per currency (FE-CAT-4), never a sum. */
function linesOf(facts: ListRowFacts, render: (line: ListRowFacts) => ReactNode): ReactNode {
  if (facts.more === undefined) return <span className="exec-acct-cell">{render(facts)}</span>;
  return (
    <span className="exec-acct-cell">
      {[facts, ...facts.more].map((line) => <span key={line.currency ?? "none"} className="exec-acct-cell">{render(line)}</span>)}
    </span>
  );
}

function envWord(word: string): string {
  const known = envelopeEnvironment(word);
  return known === null ? humanize(word) : ENV_LABEL[known];
}

/** The echo is a word; only the three environments are typed. */
function envelopeEnvironment(word: string | undefined): BindingEnv | null {
  const lower = (word ?? "").toLowerCase();
  return lower === "live" || lower === "paper" || lower === "sandbox" ? lower : null;
}
