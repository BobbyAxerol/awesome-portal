/**
 * Admin Actions (UXM-07 S2, flag key `admin`), plan only.
 *
 * Reads the operator task catalogue, the command catalogue, the admin
 * composition (command authority and redacted journal) and the staged
 * activation through the ExecutionApi port. The list is the server's six task
 * groups as tiers, each action with the state the server classified it in and
 * the first reason it is not live. A selected action opens the one Drawer: a
 * ready read runs locally, a command can be PLANNED (a preview the relay-off
 * server refuses to apply) and walks the six-state strip; Apply is a disabled
 * action with its reason. Nothing on this page applies anything.
 *
 * A non-ADMIN caller gets the server's 403 as a denial, naming neither an
 * action nor a count. The catalogue is not cached or shown from a previous
 * session.
 *
 * Scale and degradation (evidence/UXM07/README.md 2b):
 *
 * | cardinality | break point | degradation | server contract | invariant | perf budget |
 * |---|---|---|---|---|---|
 * | 24 tasks in 6 groups; catalogue bounded at 64 entries | 200 rows in the DOM (never met) | tier panels; state filter; provenance table capped | the catalogue bound (64) is the server's | a missing task is named ("N of M reported"), a row past the cap is named ("Showing 200 of N"), never dropped silently; a failed refresh keeps the last good rows, demoted, with the reason | four reads on mount, none polled; 24 table rows |
 *
 * URL: `sel` (the task id) and the screen-local `state` filter. Defaults omitted.
 */
import { useEffect, useId, useMemo, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { ExecutionApi } from "../../../api/ports";
import { PanelSkeleton, PanelState } from "../../../components/states";
import { activationSentence } from "../../../stagedActivation";
import { GapWhy, PanelGate, SectionPanel } from "../../blocks";
import { CardsTable, type CardsColumn } from "../../cardsTable";
import { useDockMode, useDockSelection } from "../../Drawer";
import { Flag } from "../../Flag";
import type { FlagKind } from "../../flagKinds";
import { useExecUrlState, withContext } from "../../urlState";
import { ActionPane, withQuery } from "./ActionPane";
import {
  ROW_CAP, ROW_STATES, ROW_STATE_VIEW, firstNotLive, firstReasonFor, humanize, stateCounts, tiersOf, toRows, type ActionRow, type RowState,
} from "./adminModel";
import { useAdminReads } from "./useAdminReads";

import "../../css/admin.css";
import { formatInstant } from "../../boundary";

export const ADMIN_SCREEN_KEY = "admin" as const;

/** The routes Admin links to when the mount passes none; the link-target guard checks both resolve to a mounted screen. */
export const ADMIN_PORTFOLIOS_HREF = "/deployments/portfolios";
export const ADMIN_OPERATIONS_HREF = "/execution/operations";

export interface AdminScreenProps {
  api: ExecutionApi;
  /** Used for the catalogue read and the plan request when the catalogue states none. */
  workspaceId?: string;
  /** Where "My access" lives, for the denied state. */
  accessHref?: string;
  /** Capital actions start here. Defaults to the Portfolios list; the route may pass its own. */
  portfoliosHref?: string;
  /** Plans are followed here. Defaults to the Operations queue; `?operation=<id>` is added per plan. */
  operationsHref?: string;
}

/** The params V1 links write (`/administration/actions?...`); V2 reads them and never runs anything from them. */
export interface LinkedParams {
  operation: string | null;
  action: string | null;
  binding: string | null;
  cmd: string | null;
}

/** A task the link named: by task id or catalogue key, exactly, never by a guessed spelling. */
export function linkedRowFor(rows: readonly ActionRow[], wanted: string | null): ActionRow | null {
  if (wanted === null || wanted === "") return null;
  return rows.find((r) => r.id === wanted) ?? rows.find((r) => r.task.catalogKey === wanted) ?? null;
}

function isRowState(value: string | null): value is RowState {
  return value !== null && (ROW_STATES as readonly string[]).includes(value);
}

/**
 * What an old V1 link asked for, said plainly. Admin Actions has no operation lookup, so `operation` is
 * handed back to Operations; `cmd` and `action` select a task only when the catalogue carries it.
 */
function LinkedNotice({ linked, row, selection, params, operationsHref }: {
  linked: LinkedParams;
  row: ActionRow | null;
  selection: string | null;
  params: URLSearchParams;
  operationsHref: string;
}) {
  const named = linked.cmd ?? linked.action;
  if (linked.operation === null && named === null) return null;
  return (
    <div className="exec-adm-banner" role="note" aria-label="What the link asked for">
      <Flag kind="unknown" label="From a link" size="sm" />
      <span>
        {named !== null ? (
          row !== null ? (
            <>
              The link named {linked.cmd !== null ? "command" : "action"} <code>{named}</code>
              {linked.binding ? <> for binding <code>{linked.binding}</code></> : null}.{" "}
              {selection === row.id ? `${row.title} is open. ` : `${row.title} is in the list. `}
              Nothing was run.{" "}
            </>
          ) : (
            <>
              The link named {linked.cmd !== null ? "command" : "action"} <code>{named}</code>
              {linked.binding ? <> for binding <code>{linked.binding}</code></> : null}, and this catalogue has no task with that key, so nothing is selected.{" "}
              {linked.binding !== null ? (
                <Link className="exec-adm-link" to={withContext(`/deployments/accounts?binding=${encodeURIComponent(linked.binding)}`, params)}>Back to the binding</Link>
              ) : null}{" "}
            </>
          )
        ) : null}
        {linked.operation !== null ? (
          <>
            Operation <code>{linked.operation}</code> came with the link. Admin Actions has no operation lookup.{" "}
            <Link className="exec-adm-link" to={withContext(withQuery(operationsHref, "operation", linked.operation), params)}>Open it in Operations</Link>
          </>
        ) : null}
      </span>
    </div>
  );
}

function freshness(state: string | null): { kind: FlagKind; label: string } {
  switch ((state ?? "").toUpperCase()) {
    case "FRESH": return { kind: "ok", label: "Fresh" };
    case "STALE": return { kind: "stale", label: "Stale" };
    case "": return { kind: "unknown", label: "Freshness not stated" };
    default: return { kind: "na", label: humanize(state ?? "") };
  }
}

export default function AdminScreen({
  api, workspaceId, accessHref, portfoliosHref = ADMIN_PORTFOLIOS_HREF, operationsHref = ADMIN_OPERATIONS_HREF,
}: AdminScreenProps) {
  const reads = useAdminReads(api, workspaceId);
  const [params, setParams] = useSearchParams();
  const { selection, select, close } = useDockSelection();
  const mode = useDockMode();
  const summaryId = useId();
  const url = useExecUrlState();

  const linked: LinkedParams = { operation: params.get("operation"), action: params.get("action"), binding: params.get("binding"), cmd: params.get("cmd") };
  const stateParam = params.get("state");
  const filter: RowState | "all" = isRowState(stateParam) ? stateParam : "all";

  const taskCatalogue = reads.tasks.phase === "ready" ? reads.tasks.value : null;
  const catalogue = reads.catalogue.phase === "ready" ? reads.catalogue.value : null;
  const composition = reads.composition.phase === "ready" ? reads.composition.value : null;
  const activation = reads.activation.phase === "ready" ? reads.activation.value : null;

  const loadedCount = taskCatalogue?.tasks.length ?? 0;
  const rows = useMemo(() => (taskCatalogue ? toRows(taskCatalogue.tasks.slice(0, ROW_CAP), catalogue) : []), [taskCatalogue, catalogue]);
  const counts = useMemo(() => stateCounts(rows), [rows]);
  const tiers = useMemo(() => tiersOf(rows, taskCatalogue?.taskGroups ?? [], filter), [rows, taskCatalogue, filter]);
  const selected = selection === null ? null : rows.find((r) => r.id === selection) ?? null;
  const planWorkspace = catalogue?.scope?.workspaceId ?? workspaceId ?? null;

  // The hi-fi opens its first ready action on arrival (ADM-B2). Once, in the docked layout only,
  // and never when the URL already names a selection, so Close stays closed and an overlay never
  // opens over a page nobody has touched. "Once" is the first successful load of the task
  // catalogue, whatever it holds (a first read with no actions spends it, so a later refresh that
  // returns rows opens nothing unprompted), and whatever the mode or filter then, so widening the
  // window or changing the filter later opens nothing either. A new workspace is a new arrival and
  // may open once more. The row is the first ready one in the order the tiers are drawn, among the
  // rows the active state filter shows; if none is, nothing opens. The pane it opens does not take
  // focus (WCAG 2.4.3) until the reader picks a row themselves.
  const autoOpened = useRef(false);
  const autoId = useRef<string | null>(null);
  const firstReady = tiers.flatMap((tier) => tier.rows).find((r) => r.state === "ready") ?? null;
  useEffect(() => {
    autoOpened.current = false;
    autoId.current = null;
  }, [workspaceId]);
  const tasksLoaded = reads.tasks.phase === "ready";
  // A link that names a task (`cmd`, or `action` from an accounts link) selects that row, once. It never runs it:
  // the pane opens on its facts and every control in it is the reader's to press. A URL that already names a
  // selection wins, as it does for the auto-open below.
  const linkedRow = linkedRowFor(rows, linked.cmd) ?? linkedRowFor(rows, linked.action);
  useEffect(() => {
    if (autoOpened.current || !tasksLoaded) return;
    autoOpened.current = true;
    if (selection !== null) return;
    if (linkedRow !== null) {
      url.set({ sel: linkedRow.id }, { replace: true });
      return;
    }
    // A link named a task this catalogue does not carry: opening some other action would look like an answer.
    if (linked.cmd || linked.action) return;
    if (mode !== "dock" || firstReady === null) return;
    autoId.current = firstReady.id;
    url.set({ sel: firstReady.id }, { replace: true });
  }, [tasksLoaded, mode, selection, firstReady, url]);
  const pickRow = (id: string) => {
    autoId.current = null;
    select(id);
  };
  const closePane = () => {
    autoId.current = null;
    close();
  };

  const setFilter = (next: RowState | "all") => {
    const copy = new URLSearchParams(params);
    if (next === "all") copy.delete("state");
    else copy.set("state", next);
    setParams(copy, { replace: true });
  };

  /* ── whole-page states ─────────────────────────────────────────────── */
  if (reads.tasks.phase === "loading") {
    return (
      <div className="exec-adm-v2" data-screen="admin-actions-v2">
        <h1 className="exec-adm-title">Admin Actions</h1>
        <PanelSkeleton label="Loading Admin Actions" />
      </div>
    );
  }
  if (reads.tasks.phase === "error") {
    const denied = reads.tasks.status === "denied";
    return (
      <div className="exec-adm-v2" data-screen="admin-actions-v2">
        <h1 className="exec-adm-title">Admin Actions</h1>
        {denied ? (
          <PanelState
            status="denied"
            title="You can't open this page"
            reason="Admin Actions is for administrators."
            actions={accessHref ? <Link className="exec-adm-link" to={accessHref}>See what you can access</Link> : undefined}
          />
        ) : (
          <PanelState
            status={reads.tasks.status}
            reason={reads.tasks.reason}
            actions={<button type="button" className="exec-adm-btn" onClick={reads.reload}>Try again</button>}
          />
        )}
      </div>
    );
  }

  const asked = taskCatalogue?.totalTasks ?? null;
  const missing = asked !== null && taskCatalogue !== null && taskCatalogue.tasks.length < asked;
  const capped = loadedCount > ROW_CAP;
  // The read that failed on refresh while an earlier good one is still on screen, by name.
  const staleReads = [
    { label: "task catalogue", read: reads.tasks },
    { label: "command catalogue", read: reads.catalogue },
    { label: "admin composition", read: reads.composition },
    { label: "staged activation", read: reads.activation },
  ].flatMap(({ label, read }) => (read.phase === "ready" && read.stale ? [{ label, reason: read.stale.reason }] : []));
  const fresh = freshness(catalogue?.scope?.freshnessState ?? null);
  const notLive = firstNotLive(activation);
  const authority = composition?.commandAuthority ?? null;
  // An unreadable relay bit is "not stated", never "inactive" (fail closed).
  const relayText = authority === null || authority.relayActive === null ? "not stated" : authority.relayActive ? "active" : "inactive";

  const columns: readonly CardsColumn<ActionRow>[] = [
    {
      key: "action",
      label: "Action",
      render: (r) => (
        <span className="exec-adm-name">
          <span className="exec-adm-title-cell">{r.title}</span>
          {r.task.catalogKey !== null ? <span className="exec-adm-sub">{r.task.catalogKey}</span> : null}
        </span>
      ),
    },
    { key: "scope", label: "Scope", render: (r) => (r.scope === "" ? "Not stated" : r.scope) },
    {
      key: "state",
      label: "State",
      render: (r) => (
        <span className="exec-adm-state">
          <Flag kind={ROW_STATE_VIEW[r.state].kind} label={ROW_STATE_VIEW[r.state].label} size="sm" />
          {r.state === "elsewhere" ? (
            <Link className="exec-adm-link" to={withContext(portfoliosHref, params)} onClick={(event) => event.stopPropagation()}>Open</Link>
          ) : null}
        </span>
      ),
    },
  ];

  return (
    <div className="exec-adm-v2" data-screen="admin-actions-v2">
      <header className="exec-adm-head">
        <div>
          <h1 className="exec-adm-title" title="Plan, apply and verify. Administrators only. This page plans; it does not apply.">Admin Actions</h1>
        </div>
        <div className="exec-adm-chips">
          <span className="exec-adm-fresh">
            <Flag kind={fresh.kind} label={fresh.label} size="sm" />
            {composition?.readAt ? <span className="exec-adm-meta">Read {formatInstant(composition.readAt)}</span> : null}
          </span>
          <Link className="exec-adm-link" data-variant="outline" to={withContext(operationsHref, params)}>Open in Operations</Link>
          <button type="button" className="exec-adm-btn" onClick={reads.reload}>Refresh</button>
        </div>
      </header>

      {authority || notLive ? (
        <div className="exec-adm-banner" data-tone="warn" role="status">
          <Flag kind="paused" label="Relay off" size="sm" />
          <span>
            {authority ? `Command authority: ${humanize(authority.state)}. ` : ""}
            {notLive ? `First reason nothing is live: ${notLive.capabilityKey}, ${activationSentence(notLive)}.` : ""}
          </span>
        </div>
      ) : null}
      {reads.activation.phase === "error" ? (
        <div className="exec-adm-banner" role="status">
          <Flag kind="unknown" label="Activation not read" size="sm" />
          <span>Reasons limited to the task catalogue</span>
          <GapWhy name="Why reasons are limited" rows={[`The staged-activation read failed (${reads.activation.reason}), so the first reason an action is not live is limited to what the task catalogue states.`]} next={null} />
        </div>
      ) : null}
      {staleReads.length > 0 ? (
        <div className="exec-adm-banner" data-tone="stale" role="status">
          <Flag kind="stale" label="Stale" size="sm" />
          <span>
            Showing the last good read. The refresh failed for the {staleReads.map((r) => `${r.label} (${r.reason})`).join(", the ")}.
          </span>
        </div>
      ) : null}
      {missing ? (
        <div className="exec-adm-banner" role="status">
          <Flag kind="partial" label="Partial" size="sm" />
          <span>Some actions are missing. {taskCatalogue!.tasks.length} of {asked} reported.</span>
        </div>
      ) : null}
      {capped ? (
        <div className="exec-adm-banner" data-tone="cap" role="status">
          <Flag kind="partial" label="Capped" size="sm" />
          <span>
            Showing {ROW_CAP} of {loadedCount} actions.
            {asked !== null && asked > loadedCount ? ` ${loadedCount} is only what was loaded; the server reports ${asked}.` : ""}
            {" "}Counts and the lists below cover the {ROW_CAP} shown.
          </span>
        </div>
      ) : null}
      {reads.catalogue.phase === "error" ? (
        <div className="exec-adm-banner" role="status">
          <Flag kind={reads.catalogue.status === "denied" ? "rejected" : "unknown"} label={reads.catalogue.status === "denied" ? "Catalogue withheld" : "Catalogue not read"} size="sm" />
          <span>The command catalogue was not read, so routes and tiers are not joined. {reads.catalogue.status === "denied" ? "It is for administrators." : reads.catalogue.reason}</span>
        </div>
      ) : null}

      <LinkedNotice linked={linked} row={linkedRow} selection={selection} params={params} operationsHref={operationsHref} />

      <div className="exec-adm-bar">
        <div className="exec-adm-seg" role="group" aria-label="Filter by state">
          {(["all", ...ROW_STATES] as const).map((key) => (
            <button key={key} type="button" className="exec-adm-segbtn" aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {key === "all" ? "All" : ROW_STATE_VIEW[key].filter} {counts[key]}
            </button>
          ))}
        </div>
        <span id={summaryId} className="exec-adm-meta" role="status">{counts.ready} of {counts.all} can run now</span>
      </div>

      <div className="exec-adm-main" data-docked={selection !== null && mode === "dock" ? "true" : undefined}>
        <div className="exec-adm-tiers" data-stale={reads.tasks.phase === "ready" && reads.tasks.stale ? "true" : undefined}>
          {rows.length === 0 && asked !== null && asked > 0 ? (
            <PanelState status="partial" reason={`The server reports ${asked} actions but none could be read. This is not an empty catalogue.`} />
          ) : rows.length === 0 ? (
            <PanelState status="empty" reason="No actions are published for this profile. Check Provenance for the catalogue source." />
          ) : tiers.length === 0 ? (
            <PanelState status="empty" reason="No action is in this state." actions={<button type="button" className="exec-adm-btn" onClick={() => setFilter("all")}>Show all</button>} />
          ) : (
            tiers.map((tier) => (
              <SectionPanel key={tier.group} title={tier.label} aside={<span title={tier.note || undefined}>{tier.ready} of {tier.total} ready</span>} flush>
                <CardsTable columns={columns} rows={tier.rows} rowKey={(r) => r.id} label={`${tier.label} actions`} selectedKey={selection} onRowOpen={(r) => pickRow(r.id)} />
              </SectionPanel>
            ))
          )}
        </div>
        {selection !== null ? (
          selected ? (
            <ActionPane
              key={selected.id}
              row={selected}
              api={api}
              activation={activation}
              stale={staleReads.length > 0}
              workspaceId={planWorkspace}
              mode={mode}
              focusOnOpen={selection !== autoId.current}
              onClose={closePane}
              portfoliosHref={portfoliosHref}
              operationsHref={operationsHref}
            />
          ) : (
            <aside className="exec-adm-gone" role="status">
              <p>This action is not in the catalogue that was read.</p>
              <button type="button" className="exec-adm-btn" onClick={closePane}>Close</button>
            </aside>
          )
        ) : null}
      </div>

      <div className="exec-adm-foot">
        <p className="exec-adm-note">
          Capital actions are not started here. They begin in <Link className="exec-adm-link" to={withContext(portfoliosHref, params)}>Portfolios</Link> with a preview.
        </p>
      </div>

      <details className="exec-adm-prov">
        <summary>Provenance</summary>
        <PanelGate status={composition ? "ok" : "unavailable"} reason={reads.composition.phase === "error" ? reads.composition.reason : "The admin composition was not read."}>
          <p className="exec-adm-note">
            Command authority {authority ? humanize(authority.state) : "not stated"}; relay {relayText}; journal {composition?.journal.state ? humanize(composition.journal.state) : "not stated"} ({composition?.journal.rows.length ?? 0} rows). Catalogue revision {catalogue?.revision ?? "not stated"}, {catalogue?.entries.length ?? 0} entries.
          </p>
        </PanelGate>
        <CardsTable
          label="Action provenance"
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            { key: "action", label: "Action", render: (r) => r.title },
            { key: "state", label: "Catalogue state", render: (r) => humanize(r.task.state) },
            {
              key: "reason",
              label: "First reason it is not live",
              render: (r) => {
                const first = firstReasonFor(r.task, activation);
                return first.code ?? first.sentence ?? (r.state === "ready" ? "Live" : "No reason was published");
              },
            },
          ]}
        />
      </details>
    </div>
  );
}
