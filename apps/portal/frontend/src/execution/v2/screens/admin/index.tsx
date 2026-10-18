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
 * | 24 tasks in 6 groups; catalogue bounded at 64 entries | 200 rows in the DOM (never met) | tier panels; state filter; provenance table capped | the catalogue bound (64) is the server's | a missing task is named ("N of M reported"), never dropped silently | four reads on mount, none polled; 24 table rows |
 *
 * URL: `sel` (the task id) and the screen-local `state` filter. Defaults omitted.
 */
import { useId, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { ExecutionApi } from "../../../api/ports";
import { PanelSkeleton, PanelState } from "../../../components/states";
import { activationSentence } from "../../../stagedActivation";
import { utcStamp } from "../../../time";
import { PanelGate, SectionPanel } from "../../blocks";
import { CardsTable, type CardsColumn } from "../../cardsTable";
import { useDockMode, useDockSelection } from "../../Drawer";
import { Flag } from "../../Flag";
import type { FlagKind } from "../../flagKinds";
import { withContext } from "../../urlState";
import { ActionPane } from "./ActionPane";
import {
  ROW_CAP, ROW_STATES, ROW_STATE_VIEW, firstNotLive, firstReasonFor, humanize, stateCounts, tiersOf, toRows, type ActionRow, type RowState,
} from "./adminModel";
import { useAdminReads } from "./useAdminReads";

import "../../css/admin.css";

export const ADMIN_SCREEN_KEY = "admin" as const;

export interface AdminScreenProps {
  api: ExecutionApi;
  /** Used for the catalogue read and the plan request when the catalogue states none. */
  workspaceId?: string;
  /** Where "My access" lives, for the denied state. */
  accessHref?: string;
  /** Capital actions start here. */
  portfoliosHref?: string;
  /** Plans are followed here. */
  operationsHref?: string;
}

function isRowState(value: string | null): value is RowState {
  return value !== null && (ROW_STATES as readonly string[]).includes(value);
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
  api, workspaceId, accessHref, portfoliosHref = "/execution/portfolios", operationsHref = "/execution/operations?source=admin",
}: AdminScreenProps) {
  const reads = useAdminReads(api, workspaceId);
  const [params, setParams] = useSearchParams();
  const { selection, select, close } = useDockSelection();
  const mode = useDockMode();
  const summaryId = useId();

  const stateParam = params.get("state");
  const filter: RowState | "all" = isRowState(stateParam) ? stateParam : "all";

  const taskCatalogue = reads.tasks.phase === "ready" ? reads.tasks.value : null;
  const catalogue = reads.catalogue.phase === "ready" ? reads.catalogue.value : null;
  const composition = reads.composition.phase === "ready" ? reads.composition.value : null;
  const activation = reads.activation.phase === "ready" ? reads.activation.value : null;

  const rows = useMemo(() => (taskCatalogue ? toRows(taskCatalogue.tasks.slice(0, ROW_CAP), catalogue) : []), [taskCatalogue, catalogue]);
  const counts = useMemo(() => stateCounts(rows), [rows]);
  const tiers = useMemo(() => tiersOf(rows, taskCatalogue?.taskGroups ?? [], filter), [rows, taskCatalogue, filter]);
  const selected = selection === null ? null : rows.find((r) => r.id === selection) ?? null;
  const planWorkspace = catalogue?.scope?.workspaceId ?? workspaceId ?? null;

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
          <span className="exec-adm-sub">{r.task.catalogKey ?? "No catalogue key"}</span>
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
          <h1 className="exec-adm-title">Admin Actions</h1>
          <p className="exec-adm-sub-head">Plan, apply and verify. Administrators only. This page plans; it does not apply.</p>
        </div>
        <div className="exec-adm-chips">
          <span className="exec-adm-fresh">
            <Flag kind={fresh.kind} label={fresh.label} size="sm" />
            {composition?.readAt ? <span className="exec-adm-meta">Read {utcStamp(composition.readAt)}</span> : null}
          </span>
          <Link className="exec-adm-link" to={withContext(operationsHref, params)}>Open in Operations (source: admin)</Link>
          <button type="button" className="exec-adm-btn" onClick={reads.reload}>Refresh</button>
        </div>
      </header>

      {authority || notLive ? (
        <div className="exec-adm-banner" role="status">
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
          <span>The staged-activation read failed ({reads.activation.reason}), so the first reason an action is not live is limited to what the task catalogue states.</span>
        </div>
      ) : null}
      {missing ? (
        <div className="exec-adm-banner" role="status">
          <Flag kind="partial" label="Partial" size="sm" />
          <span>Some actions are missing. {taskCatalogue!.tasks.length} of {asked} reported.</span>
        </div>
      ) : null}
      {reads.catalogue.phase === "error" ? (
        <div className="exec-adm-banner" role="status">
          <Flag kind={reads.catalogue.status === "denied" ? "rejected" : "unknown"} label={reads.catalogue.status === "denied" ? "Catalogue withheld" : "Catalogue not read"} size="sm" />
          <span>The command catalogue was not read, so routes and tiers are not joined. {reads.catalogue.status === "denied" ? "It is for administrators." : reads.catalogue.reason}</span>
        </div>
      ) : null}

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
        <div className="exec-adm-tiers">
          {rows.length === 0 ? (
            <PanelState status="empty" reason="No actions are published for this profile. Check Provenance for the catalogue source." />
          ) : tiers.length === 0 ? (
            <PanelState status="empty" reason="No action is in this state." actions={<button type="button" className="exec-adm-btn" onClick={() => setFilter("all")}>Show all</button>} />
          ) : (
            tiers.map((tier) => (
              <SectionPanel key={tier.group} title={tier.label} aside={`${tier.note ? `${tier.note} · ` : ""}${tier.ready} of ${tier.total} ready`} flush>
                <CardsTable columns={columns} rows={tier.rows} rowKey={(r) => r.id} label={`${tier.label} actions`} selectedKey={selection} onRowOpen={(r) => select(r.id)} />
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
              workspaceId={planWorkspace}
              mode={mode}
              onClose={close}
              portfoliosHref={portfoliosHref}
              operationsHref={operationsHref}
            />
          ) : (
            <aside className="exec-adm-gone" role="status">
              <p>This action is not in the catalogue that was read.</p>
              <button type="button" className="exec-adm-btn" onClick={close}>Close</button>
            </aside>
          )
        ) : null}
      </div>

      <p className="exec-adm-note">
        Capital actions are not started here. They begin in <Link className="exec-adm-link" to={withContext(portfoliosHref, params)}>Portfolios</Link> with a preview.
      </p>

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
