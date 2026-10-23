/**
 * Entity search of the V2 command bar (WP-D, FE-023 partly answered).
 *
 * There is NO cross-entity index. What exists are list reads that take a search of their own, so each kind is answered by the read
 * that owns it, and every result group names the read it came from:
 *
 * | Kind | Read | How the text is matched |
 * |---|---|---|
 * | Alpha | `GET /alphas?search=` (alpha fleet) | the server, by name |
 * | Account | `GET /broker-bindings?search=&environment=` | the server, in the environment the bar is on (the read takes one) |
 * | Operation | `GET /operations?target_id=` (queue v2) | the server, exact target id (deployment, portfolio or account) |
 * | Incident | `GET /operations/incidents/{id}` | exact id, only for an `inc_`-shaped text |
 * | Portfolio | `GET /portfolios` (no search parameter) | the text is matched HERE against the rows the server returned (id, name); said so |
 * | Approval | `GET /governance/approvals?view=ALL` (no search parameter) | matched HERE against the first page the server returned (id, subject); said so |
 *
 * Rules (each with a test): results are the server's rows, capped per kind (`PER_KIND`), never invented or ranked; a kind whose
 * read fails says so by name and does not hide the others; a kind the caller's rail does not list is not searched (a courtesy: the
 * server refuses regardless); fewer than `MIN_QUERY` characters search nothing; a stale answer is dropped by the caller's
 * abort signal. Where a read has no search parameter the label says the match is local to the page the server returned.
 */
import type { PortalRegistryDocument } from "../../../portal/contracts";
import { sidebarGroups, type NavOptions } from "../../../portal/navigation";
import type { ExecutionApi } from "../../api/ports";
import type { EntityKind } from "../readers/entitySearch";
import { ENV_LABEL, type ExecEnv } from "../urlState";
import { applyV2Nav, type CommandEntry } from "./roleNav";

export const MIN_QUERY = 2;
export const PER_KIND = 5;
/** The approvals read has no search parameter: one page is matched, and the label says it was one page. */
export const APPROVALS_PAGE = 50;

export type SearchKind = "alpha" | "portfolio" | "account" | "operation" | "approval";

export interface SearchSources {
  alpha: boolean;
  portfolio: boolean;
  account: boolean;
  operation: boolean;
  approval: boolean;
}

const FEATURE_OF: Readonly<Record<SearchKind, string>> = {
  alpha: "EXECUTION_ALPHA_FLEET",
  portfolio: "EXECUTION_PORTFOLIOS",
  account: "EXECUTION_ACCOUNTS_BINDINGS",
  operation: "EXECUTION_OPERATIONS",
  approval: "EXECUTION_APPROVALS",
};

/** The kinds the caller's rail lists: the same overlay the rail and the "Go to" rows use. */
export function searchSourcesFor(registry: PortalRegistryDocument, options: NavOptions): SearchSources {
  const listed = new Set(applyV2Nav(sidebarGroups(registry, options), new Set(options.capabilities ?? [])).flatMap((group) => group.items.map((item) => item.featureId)));
  return {
    alpha: listed.has(FEATURE_OF.alpha),
    portfolio: listed.has(FEATURE_OF.portfolio),
    account: listed.has(FEATURE_OF.account),
    operation: listed.has(FEATURE_OF.operation),
    approval: listed.has(FEATURE_OF.approval),
  };
}

export interface EntitySearchOutcome {
  /** `index`: one `GET /search` answered; `reads`: the per-read fallback. Absent for a text under the minimum (nothing was asked). */
  via?: "index" | "reads";
  entries: CommandEntry[];
  /** One honest line per kind searched: the read used, how it matched, how many were shown of how many matched. */
  notes: string[];
}

const GROUP = {
  alpha: "Alphas",
  portfolio: "Portfolios",
  account: "Accounts",
  operation: "Operations",
  incident: "Incidents",
  approval: "Approvals",
} as const;

const enc = encodeURIComponent;
const contains = (text: string, needle: string): boolean => text.toLowerCase().includes(needle);

function capNote(label: string, shown: number, matched: number | null, how: string): string {
  const of = matched === null ? "" : ` of ${matched}`;
  return `${label}: ${how}, ${shown}${of} shown`;
}

interface Settled {
  entries: CommandEntry[];
  note: string;
}

async function guard(label: string, run: () => Promise<Settled>, signal: AbortSignal): Promise<Settled | null> {
  try {
    const settled = await run();
    return signal.aborted ? null : settled;
  } catch {
    return signal.aborted ? null : { entries: [], note: `${label}: the read did not complete` };
  }
}

const failed = (label: string, reason: string): Settled => ({ entries: [], note: `${label}: not available (${reason})` });

async function alphas(api: ExecutionApi, text: string, workspaceId: string | undefined): Promise<Settled> {
  const label = GROUP.alpha;
  const result = await api.getAlphaFleet({ search: text, limit: PER_KIND, environment: "all", ...(workspaceId ? { workspace_id: workspaceId } : {}) });
  if (!result.ok) return failed(label, result.reason);
  const rows = result.value.page.rows.slice(0, PER_KIND);
  return {
    entries: rows.map((row) => ({ id: `alpha:${row.alphaId}`, group: label, label: row.alphaLabel || row.alphaId, detail: [row.stage, row.version].filter(Boolean).join(" · "), href: `/deployments/alphas/${enc(row.alphaId)}` })),
    note: capNote(label, rows.length, result.value.page.filteredCount, "alpha fleet read, server search by name"),
  };
}

async function accounts(api: ExecutionApi, text: string, environment: ExecEnv, workspaceId: string | undefined): Promise<Settled> {
  const label = GROUP.account;
  const result = await api.getBindings({ search: text, limit: PER_KIND, environment, ...(workspaceId ? { workspace_id: workspaceId } : {}) });
  if (!result.ok) return failed(label, result.reason);
  const seen = new Set<string>();
  const rows = result.value.page.rows.filter((row) => (seen.has(row.accountId) ? false : (seen.add(row.accountId), true))).slice(0, PER_KIND);
  return {
    entries: rows.map((row) => ({ id: `account:${row.accountId}`, group: label, label: row.accountId, detail: row.venue, href: `/deployments/accounts/${enc(row.accountId)}` })),
    note: capNote(label, rows.length, result.value.page.filteredCount, `bindings read, server search in ${ENV_LABEL[environment]}`),
  };
}

async function portfolios(api: ExecutionApi, text: string, workspaceId: string | undefined): Promise<Settled> {
  const label = GROUP.portfolio;
  const result = await api.listPortfolios(workspaceId ? { workspaceId } : undefined);
  if (!result.ok) return failed(label, result.reason);
  const needle = text.toLowerCase();
  const matched = result.value.items.filter((item) => contains(item.portfolioId, needle) || contains(item.name, needle));
  const rows = matched.slice(0, PER_KIND);
  const loaded = result.value.items.length;
  const how = `portfolio list read (no search parameter), matched here in ${loaded} loaded${result.value.truncated ? ", list truncated by the server" : ""}`;
  return {
    entries: rows.map((row) => ({ id: `portfolio:${row.portfolioId}`, group: label, label: row.name || row.portfolioId, detail: row.name ? row.portfolioId : undefined, href: `/deployments/portfolios/${enc(row.portfolioId)}` })),
    note: capNote(label, rows.length, matched.length, how),
  };
}

async function operations(api: ExecutionApi, text: string, workspaceId: string | undefined): Promise<Settled[]> {
  const label = GROUP.operation;
  const out: Settled[] = [];
  const result = await api.listOperationalQueueV2({ targetId: text, limit: PER_KIND, ...(workspaceId ? { workspaceId } : {}) });
  if (!result.ok) out.push(failed(label, result.reason));
  else if (result.value.kind !== "queue") out.push(failed(label, "unsupported queue shape"));
  else {
    const page = result.value.queue.page;
    const rows = page.rows.slice(0, PER_KIND);
    out.push({
      entries: rows.map((row) => ({ id: `operation:${row.operationId}`, group: label, label: row.operationId, detail: `${row.commandKey} · ${row.targetType} ${row.targetId}`, href: `/execution/operations?operation=${enc(row.operationId)}` })),
      note: capNote(label, rows.length, page.filteredCount, "queue read, exact target id"),
    });
  }
  // An incident id is looked up by that exact id; any other text is not guessed at.
  if (/^inc[_-]/i.test(text)) {
    const incident = await api.getIncidentRootV2(text, workspaceId);
    if (incident.ok && incident.value.kind === "incident") {
      const root = incident.value.incident;
      out.push({ entries: [{ id: `incident:${root.incidentId}`, group: GROUP.incident, label: root.incidentId, detail: root.workflowState, href: `/execution/operations/incidents/${enc(root.incidentId)}` }], note: `${GROUP.incident}: incident read, exact id, 1 shown` });
    } else out.push({ entries: [], note: `${GROUP.incident}: incident read, exact id, none found` });
  }
  return out;
}

async function approvals(api: ExecutionApi, text: string, workspaceId: string | undefined): Promise<Settled> {
  const label = GROUP.approval;
  const result = await api.listApprovals({ filter: "ALL", limit: APPROVALS_PAGE, ...(workspaceId ? { workspaceId } : {}) });
  if (!result.ok) return failed(label, result.reason);
  const needle = text.toLowerCase();
  const rows = result.value.page.rows;
  const matched = rows.filter((row) => contains(String(row.id), needle) || contains(row.subject, needle));
  const shown = matched.slice(0, PER_KIND);
  return {
    entries: shown.map((row) => ({ id: `approval:${row.id}`, group: label, label: row.subject || String(row.id), detail: `${row.gate} · ${String(row.id)}`, href: `/governance/approvals?sel=${enc(String(row.id))}` })),
    note: capNote(label, shown.length, matched.length, `approvals read (no search parameter), matched here in the first ${rows.length} rows`),
  };
}

/** The Portal's own words for a kind, in the order the bar prints them. */
const KIND_ORDER: readonly SearchKind[] = ["alpha", "portfolio", "account", "operation", "approval"];
const INDEX_GROUP: Readonly<Record<string, string>> = { alpha: GROUP.alpha, portfolio: GROUP.portfolio, account: GROUP.account, operation: GROUP.operation, incident: GROUP.incident, approval: GROUP.approval };

/**
 * The one server search (`GET /search`, `portal.execution.entity-search.v1`): one read for every kind the rail lists, the groups and caps the contract
 * defines (an unauthorized entity is absent; `total_matched` null = the source did not count). `null` when the port has no such method or the read
 * is not served (any refusal or unreadable body): the caller then falls back to the per-read searches, once, and the labels say which path answered.
 */
async function searchByIndex(api: ExecutionApi, query: string, sources: SearchSources, workspaceId: string | undefined, signal: AbortSignal): Promise<EntitySearchOutcome | null> {
  if (typeof api.searchEntities !== "function") return null;
  const kinds: EntityKind[] = [...KIND_ORDER.filter((kind) => sources[kind]), ...(sources.operation ? (["incident"] as const) : [])];
  if (kinds.length === 0) return null;
  let result;
  try {
    result = await api.searchEntities({ q: query, kinds, limit: PER_KIND, ...(workspaceId ? { workspaceId } : {}) });
  } catch {
    return null;
  }
  if (signal.aborted || !result.ok) return null;
  const entries: CommandEntry[] = [];
  const notes: string[] = [];
  for (const kind of kinds) {
    const group = result.value.groups.find((g) => g.kind === kind);
    const label = INDEX_GROUP[kind];
    if (group === undefined) { notes.push(`${label}: entity search read, none returned`); continue; }
    for (const hit of group.rows.slice(0, PER_KIND)) {
      entries.push({ id: `${kind}:${hit.id}`, group: label, label: hit.label, ...(hit.detail === null ? {} : { detail: hit.detail }), href: hit.routeHint });
    }
    const shown = Math.min(group.rows.length, PER_KIND);
    notes.push(group.totalMatched === null ? `${label}: entity search read, ${shown} shown, count not published` : `${label}: entity search read, ${shown} of ${group.totalMatched} shown`);
  }
  return { via: "index", entries, notes };
}

/**
 * Searches every kind in `sources` with `text`: through the one server search when it is published, else through the per-read searches.
 * Resolves to `null` when `signal` aborted. `skipIndex` is the caller's memory that `/search` is not served (no second probe per keystroke).
 */
export async function searchEntities(
  api: ExecutionApi,
  text: string,
  sources: SearchSources,
  workspaceId: string | undefined,
  signal: AbortSignal,
  environment: ExecEnv = "live",
  options: { skipIndex?: boolean } = {},
): Promise<EntitySearchOutcome | null> {
  const query = text.trim();
  if (query.length < MIN_QUERY) return { entries: [], notes: [] };
  if (options.skipIndex !== true) {
    const indexed = await searchByIndex(api, query, sources, workspaceId, signal);
    if (signal.aborted) return null;
    if (indexed !== null) return indexed;
  }
  const outcome = await searchByReads(api, query, sources, workspaceId, signal, environment);
  return outcome === null ? null : { via: "reads", ...outcome };
}

/** The fallback: one list read per kind, in parallel; a failing read is one note, never a thrown error and never an empty list posing as "no match". */
async function searchByReads(
  api: ExecutionApi,
  text: string,
  sources: SearchSources,
  workspaceId: string | undefined,
  signal: AbortSignal,
  environment: ExecEnv = "live",
): Promise<EntitySearchOutcome | null> {
  const query = text.trim();
  if (query.length < MIN_QUERY) return { entries: [], notes: [] };
  const jobs: Promise<Settled | Settled[] | null>[] = [];
  if (sources.alpha) jobs.push(guard(GROUP.alpha, () => alphas(api, query, workspaceId), signal));
  if (sources.portfolio) jobs.push(guard(GROUP.portfolio, () => portfolios(api, query, workspaceId), signal));
  if (sources.account) jobs.push(guard(GROUP.account, () => accounts(api, query, environment, workspaceId), signal));
  if (sources.operation) {
    jobs.push(
      (async () => {
        try {
          const settled = await operations(api, query, workspaceId);
          return signal.aborted ? null : settled;
        } catch {
          return signal.aborted ? null : [{ entries: [], note: `${GROUP.operation}: the read did not complete` }];
        }
      })(),
    );
  }
  if (sources.approval) jobs.push(guard(GROUP.approval, () => approvals(api, query, workspaceId), signal));
  const done = await Promise.all(jobs);
  if (signal.aborted) return null;
  const settled = done.flatMap((item) => (item === null ? [] : Array.isArray(item) ? item : [item]));
  return { entries: settled.flatMap((item) => item.entries), notes: settled.map((item) => item.note) };
}
