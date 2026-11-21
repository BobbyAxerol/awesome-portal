/**
 * ExecCommandBar — the V2 command bar bound to the shell (review2/00 C1, D18).
 *
 * `PortalShell` mounts this lazily and only when `opensV2CommandBar` says the
 * V2 bar owns the current route (shell flag ON and an Execution route). It
 * owns nothing about opening: the shell's single Cmd/Ctrl+K listener decides
 * which overlay to open, so exactly one of the V1 palette and this bar can
 * ever appear.
 *
 * Rows are the permission-filtered "Go to" entries. The capability set is the
 * session's own (`NavOptions.capabilities`, the same list the sidebar uses);
 * `roleNav` drops every entry the caller cannot enter, and an empty or
 * unreadable list therefore offers only the entries that need nothing. That
 * is a courtesy, never the boundary: the server refuses the route regardless.
 *
 * Choosing a row navigates with the Execution context (env, window, ccy,
 * workspace_id, from) carried over, via the same `withContext` the screens use.
 *
 * Entity search (WP-D): there is still no cross-entity index (FE-023), so the notice says so. What is searched are the list reads
 * that take a search of their own (`entitySearch.ts`): alphas, accounts and operations by the server, portfolios and approvals
 * matched here against the page the server returned, an incident by exact id. Every group names its read and its cap. The text is
 * debounced, a newer query aborts the older one, and a kind whose read fails is one note, not a silent absence.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import type { PortalRegistryDocument } from "../../../portal/contracts";
import { isNavigable, sidebarGroups, type NavOptions } from "../../../portal/navigation";
import { createHttpApi } from "../../api/httpApi";
import type { ExecutionApi } from "../../api/ports";
import { parseUrlParams, withContext } from "../urlState";
import { useSession } from "../../../auth/session";
import { CommandBar } from "./CommandBar";
import { MIN_QUERY, searchEntities, searchSourcesFor, type PeopleReader } from "./entitySearch";
import { goToEntries, type CommandEntry } from "./roleNav";

// Plain words for the palette: no HTTP verbs, no paths, no ticket numbers. Which list answered is under "Details".
export const ENTITY_SEARCH_NOTICE = "Search looks in alphas, portfolios, accounts, operations, approvals and incidents, one list at a time";
export const ENTITY_SEARCH_INDEX_NOTICE = "Search looks in alphas, portfolios, accounts, operations, approvals and incidents you may see";
export const ENTITY_SEARCH_NONE = "Search is not available for your access yet";
export const ENTITY_SEARCH_HINT = `Type ${MIN_QUERY} or more characters.`;
export const PEOPLE_NOT_SEARCHED = "People are searched for administrators only.";
export const EXEC_COMMAND_PLACEHOLDER = "Search or jump to";
/** The whole "Go to" list is short and permission-filtered; the bar default of 12 would push Execution rows out of view. */
const GO_TO_LIMIT = 50;
/** Keystrokes inside this window are one search. */
export const SEARCH_DEBOUNCE_MS = 250;

export interface ExecCommandBarProps {
  registry: PortalRegistryDocument;
  /** The shell's navigation options: environment, preference and the session's capabilities. */
  options: NavOptions;
  open: boolean;
  onClose(): void;
  /** Test seam: the port the search reads through (default: the same-origin HTTP port, one per search so an abort cancels it). */
  searchApi?: ExecutionApi;
  /** Test seam. */
  debounceMs?: number;
  /** Test seam: the roster read behind the People group (default: the Users screen's reader). */
  peopleReader?: PeopleReader;
}

/** The "Go to" rows for this registry and caller; pure, so it can be tested without a router. */
export function execGoToEntries(registry: PortalRegistryDocument, options: NavOptions): CommandEntry[] {
  const capabilities = new Set(options.capabilities ?? []);
  // Link-only targets (Blotter) may sit outside the sidebar in a registry revision; the same
  // visibility rules still apply, so a feature the caller cannot see is not offered here either.
  const extras = registry.features.filter((feature) => isNavigable(feature, options));
  return goToEntries(sidebarGroups(registry, options), capabilities, extras);
}

/** Reads that found nothing are one line, not six: the ones with results keep their own line (R3 I-41). */
export function compactNotes(notes: readonly string[]): string[] {
  const empty = (note: string) => /(?:, 0 of 0 shown|none returned|0 of 0 shown|none found|, 0 shown)/.test(note);
  const named = notes.filter(empty).map((note) => note.split(":")[0]!);
  const kept = notes.filter((note) => !empty(note));
  return named.length === 0 ? kept : [...kept, `No match in: ${named.join(", ")}`];
}

function matches(entry: CommandEntry, needle: string): boolean {
  return `${entry.group} ${entry.label} ${entry.detail ?? ""}`.toLowerCase().includes(needle);
}

export function ExecCommandBar({ registry, options, open, onClose, searchApi, debounceMs = SEARCH_DEBOUNCE_MS, peopleReader: peopleReaderProp }: ExecCommandBarProps) {
  const navigate = useNavigate();
  const { search } = useLocation();
  // The roster reader is loaded only when a search for people actually runs, so the palette chunk stays small.
  const peopleReader: PeopleReader = peopleReaderProp ?? ((query) => import("../screens/users/rosterReader").then((m) => m.readRosterPageFromServer(query)));
  const goToBase = useMemo(() => execGoToEntries(registry, options), [registry, options]);
  const sources = useMemo(() => searchSourcesFor(registry, options), [registry, options]);
  const { workspaceId, environment } = useMemo(() => {
    const value = parseUrlParams(search).value;
    return { workspaceId: value.workspace_id ?? undefined, environment: value.env };
  }, [search]);
  const { access } = useSession();
  const owner = access?.kind === "ready" && access.access?.isOwner === true;
  const searchSources = useMemo(() => ({ ...sources, person: owner }), [sources, owner]);
  // The owner's Administration screens are also "Go to" rows (the rail lists them for the owner, from the session's own read).
  const goTo = useMemo(
    () => (owner ? [...goToBase, { id: "go:ADMIN_USERS", group: "Go to", label: "Users", href: "/administration/users" }, { id: "go:EXECUTION_ADMIN_ACTIONS", group: "Go to", label: "Admin Actions", href: "/administration/actions" }].filter((row, i, all) => all.findIndex((x) => x.label === row.label) === i) : goToBase),
    [goToBase, owner],
  );
  // The owning scope of every search result: workspace, environment, the caller's capabilities (and so the kinds searched). A result belongs
  // to exactly one scope; when any part changes the old results are dropped on the same render and the search runs again.
  const scope = useMemo(
    () => JSON.stringify([workspaceId ?? null, environment, [...(options.capabilities ?? [])].sort(), searchSources]),
    [workspaceId, environment, options.capabilities, searchSources],
  );

  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ scope: string; for: string; entries: CommandEntry[]; notes: string[] }>({ scope: "", for: "", entries: [], notes: [] });
  // What the last search learned about `GET /search`: not asked yet, served, or not served (then the per-read fallback answers and the
  // index is not probed again for every keystroke; a fresh mount asks again).
  const [index, setIndex] = useState<"unknown" | "published" | "unpublished">("unknown");
  const skipIndex = useRef(false);
  const [busy, setBusy] = useState(false);
  const anySource = searchSources.alpha || searchSources.portfolio || searchSources.account || searchSources.operation || searchSources.approval || owner;
  const text = query.trim();
  const searching = open && anySource && text.length >= MIN_QUERY;

  // A closed bar forgets the query (the bar itself resets its input on open).
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // The routes the app owns: a server route hint outside them is not followed (it would land on "No feature claims this route").
  const routes = useMemo(() => registry.features.map((feature) => feature.canonical_route), [registry]);
  const latest = useRef({ searchApi, sources: searchSources, workspaceId, environment });
  latest.current = { searchApi, sources: searchSources, workspaceId, environment };
  // Whether /search is served is learned per scope: another workspace or permission asks again.
  const learnedFor = useRef(scope);
  if (learnedFor.current !== scope) {
    learnedFor.current = scope;
    skipIndex.current = false;
  }
  useEffect(() => {
    if (!searching) {
      setFound((previous) => (previous.entries.length === 0 && previous.notes.length === 0 ? previous : { scope: "", for: "", entries: [], notes: [] }));
      setBusy(false);
      return undefined;
    }
    setBusy(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const now = latest.current;
      const api = now.searchApi ?? createHttpApi({ policy: null, signal: controller.signal });
      void searchEntities(api, text, now.sources, now.workspaceId, controller.signal, now.environment, { skipIndex: skipIndex.current, routes, readPeople: peopleReader }).then((outcome) => {
        if (outcome === null || controller.signal.aborted) return;
        // A late answer for another scope never lands: the effect aborts on a scope change, and this guard is the second fence.
        if (learnedFor.current !== scope) return;
        if (outcome.via === "index") { skipIndex.current = false; setIndex("published"); }
        else if (outcome.via === "reads") { skipIndex.current = true; setIndex("unpublished"); }
        setFound({ scope, for: text, ...outcome });
        setBusy(false);
      });
    }, debounceMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searching, text, debounceMs, scope]);

  // An answer is shown only under the scope AND the text it was asked for.
  const current = searching && found.scope === scope && found.for === text;
  // The bar's own filter is off (`filterLocally`): "Go to" rows are matched here, the server rows are shown as the server returned them.
  const entries = useMemo(() => {
    const needle = text.toLowerCase();
    const jump = needle === "" ? goTo : goTo.filter((entry) => matches(entry, needle));
    // An answer for older text is not shown under newer text.
    return current ? [...jump, ...found.entries] : jump;
  }, [goTo, text, found, current]);
  const notes = current ? compactNotes(found.notes) : [];
  // An empty answer names what was searched, and once says what is not searched for this caller, instead of a bare "No result".
  const emptyText = current && found.entries.length === 0 && !busy
    ? `Nothing matched “${text}”.${owner ? "" : ` ${PEOPLE_NOT_SEARCHED}`}`
    : "No result";
  // Choosing a row navigates with the CURRENT context; a result of another scope cannot be chosen, because it is no longer in the list.
  const chosen = useMemo(() => new Set<CommandEntry>(entries), [entries]);
  const onSelect = useCallback(
    (entry: CommandEntry) => {
      if (!chosen.has(entry)) return;
      navigate(withContext(entry.href, search));
    },
    [chosen, navigate, search],
  );

  return (
    <CommandBar
      open={open}
      onClose={onClose}
      entries={entries}
      onSelect={onSelect}
      limit={GO_TO_LIMIT}
      filterLocally={false}
      onQueryChange={setQuery}
      placeholder={EXEC_COMMAND_PLACEHOLDER}
      searchNotice={!anySource ? ENTITY_SEARCH_NONE : `${index === "published" ? ENTITY_SEARCH_INDEX_NOTICE : ENTITY_SEARCH_NOTICE}. ${ENTITY_SEARCH_HINT}`}
      emptyText={emptyText}
      notes={notes}
      busy={busy && entries.length === 0}
    />
  );
}
