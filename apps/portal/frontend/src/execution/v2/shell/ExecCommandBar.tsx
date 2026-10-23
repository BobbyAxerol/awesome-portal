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
import { CommandBar } from "./CommandBar";
import { MIN_QUERY, searchEntities, searchSourcesFor } from "./entitySearch";
import { goToEntries, type CommandEntry } from "./roleNav";

export const ENTITY_SEARCH_NOTICE = "Entity search · Not published as one index (FE-023)";
export const ENTITY_SEARCH_INDEX_NOTICE = "Entity search · one server search (GET /search), results scoped to your access";
export const ENTITY_SEARCH_HINT = `Type ${MIN_QUERY} or more characters to search each published list read.`;
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
}

/** The "Go to" rows for this registry and caller; pure, so it can be tested without a router. */
export function execGoToEntries(registry: PortalRegistryDocument, options: NavOptions): CommandEntry[] {
  const capabilities = new Set(options.capabilities ?? []);
  // Link-only targets (Blotter) may sit outside the sidebar in a registry revision; the same
  // visibility rules still apply, so a feature the caller cannot see is not offered here either.
  const extras = registry.features.filter((feature) => isNavigable(feature, options));
  return goToEntries(sidebarGroups(registry, options), capabilities, extras);
}

function matches(entry: CommandEntry, needle: string): boolean {
  return `${entry.group} ${entry.label} ${entry.detail ?? ""}`.toLowerCase().includes(needle);
}

export function ExecCommandBar({ registry, options, open, onClose, searchApi, debounceMs = SEARCH_DEBOUNCE_MS }: ExecCommandBarProps) {
  const navigate = useNavigate();
  const { search } = useLocation();
  const goTo = useMemo(() => execGoToEntries(registry, options), [registry, options]);
  const sources = useMemo(() => searchSourcesFor(registry, options), [registry, options]);
  const { workspaceId, environment } = useMemo(() => {
    const value = parseUrlParams(search).value;
    return { workspaceId: value.workspace_id ?? undefined, environment: value.env };
  }, [search]);
  const onSelect = useCallback((entry: CommandEntry) => navigate(withContext(entry.href, search)), [navigate, search]);

  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ for: string; entries: CommandEntry[]; notes: string[] }>({ for: "", entries: [], notes: [] })
  // What the last search learned about `GET /search`: not asked yet, served, or not served (then the per-read fallback answers and the
  // index is not probed again for every keystroke; a fresh mount asks again).
  const [index, setIndex] = useState<"unknown" | "published" | "unpublished">("unknown");
  const skipIndex = useRef(false);
  const [busy, setBusy] = useState(false);
  const anySource = sources.alpha || sources.portfolio || sources.account || sources.operation || sources.approval;
  const text = query.trim();
  const searching = open && anySource && text.length >= MIN_QUERY;

  // A closed bar forgets the query (the bar itself resets its input on open).
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const latest = useRef({ searchApi, sources, workspaceId, environment });
  latest.current = { searchApi, sources, workspaceId, environment };
  useEffect(() => {
    if (!searching) {
      setFound((previous) => (previous.entries.length === 0 && previous.notes.length === 0 ? previous : { for: "", entries: [], notes: [] }));
      setBusy(false);
      return undefined;
    }
    setBusy(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const now = latest.current;
      const api = now.searchApi ?? createHttpApi({ policy: null, signal: controller.signal });
      void searchEntities(api, text, now.sources, now.workspaceId, controller.signal, now.environment, { skipIndex: skipIndex.current }).then((outcome) => {
        if (outcome === null || controller.signal.aborted) return;
        if (outcome.via === "index") { skipIndex.current = false; setIndex("published"); }
        else if (outcome.via === "reads") { skipIndex.current = true; setIndex("unpublished"); }
        setFound({ for: text, ...outcome });
        setBusy(false);
      });
    }, debounceMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searching, text, debounceMs]);

  // The bar's own filter is off (`filterLocally`): "Go to" rows are matched here, the server rows are shown as the server returned them.
  const entries = useMemo(() => {
    const needle = text.toLowerCase();
    const jump = needle === "" ? goTo : goTo.filter((entry) => matches(entry, needle));
    // An answer for older text is not shown under newer text.
    return searching && found.for === text ? [...jump, ...found.entries] : jump;
  }, [goTo, text, searching, found]);
  const notes = searching && found.for === text ? found.notes : [];

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
      searchNotice={!anySource ? ENTITY_SEARCH_NOTICE : index === "published" ? ENTITY_SEARCH_INDEX_NOTICE : `${ENTITY_SEARCH_NOTICE}. ${ENTITY_SEARCH_HINT}`}
      notes={notes}
      busy={busy && entries.length === 0}
    />
  );
}
