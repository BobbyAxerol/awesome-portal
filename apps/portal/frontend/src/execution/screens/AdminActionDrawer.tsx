/**
 * Admin Action Drawer — hi-fi WF 1i (CLI catalog), owner copy 2026-08-30.
 *
 * Two truths share this screen and neither is allowed to blur the other:
 *
 *   1. The PUBLISHED truth (`execution.command-catalog` rev 2, EX-BE-05b/F0):
 *      the Trading System command catalogue remains source-mutation dark.
 *      That catalogue is rendered in full
 *      below the task catalog, with no plan/apply control anywhere near it —
 *      a disabled button would advertise a capability that does not exist.
 *
 *   2. The HI-FI truth (WF 1i): the drawer an operator will eventually use —
 *      task-grouped commands, registry-picked parameters, PLAN → APPLY
 *      (step-up) → VERIFY, the two-man-rule key, read commands that stream a
 *      transcript. All of it runs here as a DECLARED DEMO on
 *      `adminCli.smoke.ts` frames (BR-EX-68), labelled SMOKE at the point of
 *      interaction, so the composition is reviewable before the relay ships.
 *
 * Product mode additionally consumes the Portal-owned task catalogue. Only
 * server-classified CONNECTED R0 reads receive a control; the receipt proves
 * no source command was sent. The lab demo remains separately routed.
 */
import { useMemo, useState, type ReactNode } from "react";

import {
  blockedText,
  groupEntries,
  RISK_TIER_LABEL,
  type CatalogEntry,
  type CommandCatalogue,
} from "../adminCatalog";
import type { CliAction } from "../adminCli.smoke";
import type { OperatorTask, OperatorTaskCatalogue, OperatorTaskRunResult } from "../api/profileRead";
import type { CommandAuthority, JournalRow } from "../operationalComposition";
import { sourceTone } from "../sourceTone";
import { utcStamp } from "../time";
import { ExecutionSurface } from "../ExecutionSurface";
import { PanelState } from "../components/states";
import { planApplicable, planOutcomeText, type CommandPlan } from "../commandPlan";
import { activationSentence, type StagedActivation } from "../stagedActivation";
import type { PanelStatus } from "../contracts";

/* ---------------------------------------------------------------------------
 * Published-catalogue pieces (F0) — unchanged semantics, no controls.
 * ------------------------------------------------------------------------ */

/** `PLAN → APPLY → VERIFY`, but only the steps this command actually requires. */
function StepRail({ entry }: { entry: CatalogEntry }) {
  const steps = [
    entry.planRequired ? "PLAN" : null,
    entry.applyRequired ? "APPLY" : null,
    entry.verifyRequired ? "VERIFY" : null,
  ].filter((s): s is string => s !== null);
  if (steps.length === 0) {
    return <span className="exec-admin-steps" data-empty="true">no plan/apply/verify path</span>;
  }
  return <span className="exec-admin-steps">{steps.join(" → ")}</span>;
}

function EntryRow({
  entry,
  selected,
  onSelect,
}: {
  entry: CatalogEntry;
  selected: boolean;
  onSelect: (entry: CatalogEntry) => void;
}) {
  return (
    <button
      type="button"
      className="exec-admin-row"
      data-reachable={entry.portalReachable ? "true" : "false"}
      data-selected={selected ? "true" : undefined}
      aria-pressed={selected}
      onClick={() => onSelect(entry)}
    >
      <span className="exec-admin-rowhead">
        <span className="exec-admin-rowtitle">
          {entry.command} <span className="exec-admin-action">{entry.action}</span>
        </span>
        <span className="exec-admin-tag" data-tier={entry.riskTier ?? "UNKNOWN"}>
          {entry.riskTier ? RISK_TIER_LABEL[entry.riskTier] : "tier not stated"}
        </span>
        {entry.ownerReviewRequired ? (
          <span className="exec-admin-owner">owner review</span>
        ) : null}
        <span className="exec-admin-scope">{entry.routeState ?? "route not stated"}</span>
      </span>
      <span className="exec-admin-cli">
        {entry.httpMethod && entry.httpPath
          ? `${entry.httpMethod} ${entry.httpPath}`
          : "no HTTP route published"}
      </span>
    </button>
  );
}

/**
 * The published-entry detail. No plan/apply footer at any tier: there is no
 * reachable command at any tier, and a disabled control would teach an
 * operator that the blocker is negotiable.
 */
function EntryDetail({ entry, plan }: { entry: CatalogEntry; plan?: CommandPlan | null }) {
  return (
    <>
      <p className="exec-admin-selmeta exec-role-meta">{entry.key}</p>

      <div className="exec-admin-blocked" role="note">
        <b>NOT EXPOSED IN PORTAL</b>
        <p>{blockedText(entry)}</p>
      </div>

      <dl className="exec-admin-facts">
        <div>
          <dt>Portal risk tier</dt>
          <dd>{entry.riskTier ? RISK_TIER_LABEL[entry.riskTier] : "not stated"}</dd>
        </div>
        {entry.sourceRiskTier && entry.sourceRiskTier !== entry.riskTier ? (
          <div>
            <dt>Source proposed</dt>
            <dd>{RISK_TIER_LABEL[entry.sourceRiskTier]} — the Portal is bound by its own tier</dd>
          </div>
        ) : null}
        <div>
          <dt>Steps required</dt>
          <dd>
            <StepRail entry={entry} />
          </dd>
        </div>
        <div>
          <dt>Owner review</dt>
          <dd>{entry.ownerReviewRequired ? "required" : "not required"}</dd>
        </div>
        <div>
          <dt>Route</dt>
          <dd>
            {entry.httpMethod && entry.httpPath
              ? `${entry.httpMethod} ${entry.httpPath}`
              : "none published"}
            {entry.routeState ? ` · ${entry.routeState}` : null}
          </dd>
        </div>
        {entry.sourceReference ? (
          <div>
            <dt>Observed at</dt>
            <dd>
              <code>{entry.sourceReference}</code>
            </dd>
          </div>
        ) : null}
      </dl>

      {plan ? (
        <div className="exec-admin-plan">
          <h3>Plan {plan.operationId}</h3>
          <p>{planOutcomeText(plan)}</p>
          <p className="exec-admin-planfacts">
            status {plan.status ?? "not stated"} · relay {plan.relayCapability ?? "not stated"} ·{" "}
            {plan.replayed ? "replayed" : "new"}
            {plan.blockers.length > 0 ? ` · blocked: ${plan.blockers.join(", ")}` : null}
          </p>
          <p className="exec-admin-planfacts">{planApplicable(plan).reason}</p>
          {plan.payloadStoragePolicy === "HASH_ONLY_NO_RAW" ? (
            <p className="exec-admin-planfacts">
              The request payload is stored as a hash and never kept. It cannot be read back here,
              and this screen never repeats a refused value.
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="exec-admin-nofooter">
        No plan or apply is offered: the command relay is disabled for this catalogue revision, so
        there is nothing here to run.
      </p>
    </>
  );
}

/** Risk-tier narrowing, applied by the SERVER (F0 — see the container). */
export const TIER_FILTERS = [
  "ALL",
  "R0_READ",
  "R1_PAPER_MUTATION",
  "R2_SANDBOX",
  "R3_LIVE_PROTECTIVE",
  "R4_LIVE_RISK_INCREASING",
] as const;
export type TierFilter = (typeof TIER_FILTERS)[number];

/** The N27 acceptance vocabulary, as a filter. `ALL` is not one of its words. */
const CLASSIFICATION_FILTERS = ["ALL", "CONNECTED", "SUPPORTED_BUT_INACTIVE", "SEMANTICALLY_INCOMPATIBLE"] as const;
type ClassificationFilter = (typeof CLASSIFICATION_FILTERS)[number];
const CLASSIFICATION_LABEL: Record<ClassificationFilter, string> = {
  ALL: "All",
  CONNECTED: "Connected",
  SUPPORTED_BUT_INACTIVE: "Supported, inactive",
  SEMANTICALLY_INCOMPATIBLE: "Incompatible",
};

const TIER_FILTER_LABEL: Record<TierFilter, string> = {
  ALL: "All",
  R0_READ: "R0 read",
  R1_PAPER_MUTATION: "R1 paper",
  R2_SANDBOX: "R2 sandbox",
  R3_LIVE_PROTECTIVE: "R3 protective",
  R4_LIVE_RISK_INCREASING: "R4 risk-increasing",
};

/* ---------------------------------------------------------------------------
 * WF 1i demo injection — the reviewed hi-fi CLI machine lives in
 * `lab/adminCliDemo.tsx`; the product route never constructs one.
 * ------------------------------------------------------------------------ */

export interface CliDemoInjection {
  groups: readonly string[];
  actions: readonly CliAction[];
  actorLabel: string;
  renderDrawer: (args: {
    action: CliAction;
    onReset: () => void;
    publishedEntry: CatalogEntry | null;
  }) => ReactNode;
}

/* ---------------------------------------------------------------------------
 * N27 operator tasks — the published truth (`command-tasks.v1`).
 * The catalogue may contain local R0 CONNECTED tasks. Nothing renders a run
 * control unless both the server says CONNECTED and the product container
 * supplies the typed runner.
 * ------------------------------------------------------------------------ */

const TASK_STATE_LABEL: Record<OperatorTask["state"], string> = {
  CONNECTED: "CONNECTED",
  SUPPORTED_BUT_INACTIVE: "SUPPORTED · INACTIVE",
  SEMANTICALLY_INCOMPATIBLE: "INCOMPATIBLE",
};

function TaskRow({ task, selected, onPick }: { task: OperatorTask; selected: boolean; onPick: (id: string) => void }) {
  return (
    <button
      type="button"
      className="exec-cli-row"
      data-tag={task.tag}
      data-task-state={task.state}
      data-selected={selected ? "true" : undefined}
      aria-pressed={selected}
      onClick={() => onPick(task.taskId)}
    >
      <span className="exec-cli-rowhead">
        <span className="exec-cli-rowtitle">{task.title}</span>
        <span className="exec-cli-tag" data-tag={task.tag}>{task.tag}</span>
        <span className="exec-cli-rowscope">{task.scope}</span>
      </span>
      <span className="exec-cli-rowcli">{task.cliForms[0] ?? "no CLI form published"}</span>
      <span className="exec-admin-scope" data-task-state={task.state}>
        {TASK_STATE_LABEL[task.state]}
        {task.reasonCode ? ` · ${task.reasonCode}` : ""}
      </span>
    </button>
  );
}

function ceremonyLine(task: OperatorTask): string {
  const bits = [
    task.stepUpRequired ? "step-up" : null,
    task.twoManRule ? "two-man rule" : null,
    task.planRequired ? "PLAN" : null,
    task.applyRequired ? "APPLY" : null,
    task.verifyRequired ? "VERIFY" : null,
  ].filter((x): x is string => x !== null);
  return bits.length > 0 ? bits.join(" · ") : "no ceremony stated — treated as full ceremony, not as none";
}

type TaskRunOutcome = { ok: true; value: OperatorTaskRunResult } | { ok: false; reason: string };

function TaskDetail({
  task,
  publishedEntry,
  onRun,
}: {
  task: OperatorTask;
  publishedEntry: CatalogEntry | null;
  onRun?: (taskId: string, params: Readonly<Record<string, string>>) => Promise<TaskRunOutcome>;
}) {
  const [params, setParams] = useState<Record<string, string>>(() =>
    Object.fromEntries(task.params.map((item) => [item.key, item.defaultValue ?? ""])),
  );
  const [running, setRunning] = useState(false);
  const [receipt, setReceipt] = useState<OperatorTaskRunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const missingRequired = task.params.some((item) => item.required && !(params[item.key] ?? "").trim());
  const run = async () => {
    if (!onRun || running || missingRequired) return;
    setRunning(true);
    setRunError(null);
    setReceipt(null);
    const outcome = await onRun(task.taskId, Object.fromEntries(Object.entries(params).filter(([, value]) => value.trim().length > 0)));
    if (outcome.ok) setReceipt(outcome.value);
    else setRunError(outcome.reason);
    setRunning(false);
  };
  return (
    <div className="exec-cli-drawer" aria-label="Task detail">
      <div className="exec-cli-drawhead">
        <span className="exec-cli-tag" data-tag={task.tag} data-size="lg">{task.tag}</span>
        <h1>{task.title}</h1>
        <span className="exec-cli-drawmeta">{task.meta}</span>
      </div>
      <div className="exec-cli-drawbody">
        {task.state !== "CONNECTED" ? (
          <div className="exec-cli-blockbanner" role="note">
            <b>{TASK_STATE_LABEL[task.state]}</b>
            <span>
              {task.reasonCode ? <>reason <code>{task.reasonCode}</code> · </> : null}
              {task.unlistedReason ?? "The server has not connected this task to a runnable route; nothing here can be run."}
            </span>
          </div>
        ) : (
          <div className="exec-cli-readbanner">
            <b>CONNECTED · LOCAL R0</b> — this read runs against the SGP projection. It never
            dispatches a request to the Trading System command path.
          </div>
        )}
        {publishedEntry ? (
          <p className="exec-cli-joined">
            joins <code>{publishedEntry.key}</code> in catalogue rev {publishedEntry.riskTier ? `— ${RISK_TIER_LABEL[publishedEntry.riskTier]}` : ""}
          </p>
        ) : task.catalogKey ? (
          <p className="exec-cli-joined" data-missing="true">
            declares catalogue key <code>{task.catalogKey}</code>, which this catalogue revision does not carry
          </p>
        ) : null}
        <dl className="exec-admin-facts">
          <div><dt>Task group</dt><dd>{task.taskGroup.replace(/_/g, " ")}</dd></div>
          <div><dt>Scope</dt><dd>{task.scope}</dd></div>
          <div><dt>Authority</dt><dd>{task.requiredRole ?? "role not stated"}{task.riskTier ? ` · ${task.riskTier}` : ""}</dd></div>
          <div><dt>Ceremony</dt><dd>{ceremonyLine(task)}</dd></div>
          {task.typedConfirmWord ? (
            <div><dt>Typed confirm</dt><dd><code>{task.typedConfirmWord}</code> — typed by the operator, never pre-filled</dd></div>
          ) : null}
        </dl>
        {task.cliForms.length > 0 ? (
          <div className="exec-cli-equiv">
            <div className="exec-cli-cardlabel">CLI forms — read-only, audit/training</div>
            <pre className="exec-cli-pre" data-cli="true">{task.cliForms.join("\n")}</pre>
          </div>
        ) : null}
        {task.params.length > 0 ? (
          <div className="exec-cli-params">
            <div className="exec-cli-paramhead">
              <span>Parameters — declared, validated against registries</span>
            </div>
            {task.params.map((p) => task.state === "CONNECTED" && onRun ? (
              <label className="exec-cli-paramrow" key={p.key}>
                <span className="exec-cli-paramk">{p.key}{p.required ? " *" : ""}</span>
                <input
                  className="exec-cli-paramv"
                  value={params[p.key] ?? ""}
                  placeholder={p.defaultValue ?? "optional"}
                  required={p.required}
                  onChange={(event) => setParams((current) => ({ ...current, [p.key]: event.target.value }))}
                />
                <span className="exec-cli-paramsrc">{p.sourceRegistry ?? p.constraint ?? "source not stated"}</span>
              </label>
            ) : (
              <div className="exec-cli-paramrow" key={p.key}>
                <span className="exec-cli-paramk">{p.key}{p.required ? " *" : ""}</span>
                <span className="exec-cli-paramv">{p.defaultValue ?? "no default published"}</span>
                <span className="exec-cli-paramsrc">{p.sourceRegistry ?? p.constraint ?? "source not stated"}</span>
              </div>
            ))}
          </div>
        ) : null}
        {task.state === "CONNECTED" && onRun ? (
          <div className="exec-cli-equiv">
            <button type="button" className="exec-btn-primary" disabled={running || missingRequired} onClick={() => void run()}>
              {running ? "Running local read…" : "Run local R0 read"}
            </button>
            {missingRequired ? <p className="exec-admin-nofooter">Complete the required parameters before running.</p> : null}
            {runError ? <PanelState status="unavailable" reason={runError} /> : null}
            {receipt ? (
              <div className="exec-cli-receipt" role="status">
                <b>Completed · {receipt.transport}</b>
                <p>Source command sent: no · response is a bounded SGP projection receipt.</p>
                <pre className="exec-cli-pre">{JSON.stringify(receipt.result, null, 2)}</pre>
                <details><summary>Receipt integrity</summary><code>{receipt.responseDigest}</code></details>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="exec-admin-nofooter">
            No run control is offered: this task&apos;s state is {TASK_STATE_LABEL[task.state]}.
            Visibility ≠ authority.
          </p>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Screen
 * ------------------------------------------------------------------------ */

export function AdminActionDrawerScreen({
  catalogue,
  status = "ok",
  reason,
  selected,
  onSelect,
  tier = "ALL",
  onTierChange,
  plan,
  tasks = null,
  tasksStatus = "ok",
  tasksReason,
  initialCommand = null,
  operationRef = null,
  actionRef = null,
  demoCli = null,
  authority = null,
  journal = null,
  crossEvidence = null,
  activation = null,
  onRunTask,
  children,
}: {
  catalogue: CommandCatalogue | null;
  status?: PanelStatus;
  reason?: string;
  selected: CatalogEntry | null;
  onSelect: (entry: CatalogEntry | null) => void;
  tier?: TierFilter;
  onTierChange?: (tier: TierFilter) => void;
  plan?: CommandPlan | null;
  /** N27 `command-tasks.v1` — the published operator tasks. */
  tasks?: OperatorTaskCatalogue | null;
  tasksStatus?: PanelStatus;
  tasksReason?: string;
  /** Deep-linked initial selection (`?cmd=`); `null` starts empty. */
  initialCommand?: string | null;
  /** `?operation=` deep link from Operations Queue / Incident Detail. */
  operationRef?: string | null;
  /** `?action=…&binding=…` deep link from Accounts & Bindings / Binding Detail. */
  actionRef?: { action: string; binding: string | null } | null;
  /** The reviewed WF 1i machine — the lab passes it; the product never does. */
  demoCli?: CliDemoInjection | null;
  /**
   * The command authority and the redacted journal, from the drawer's own
   * composition. Absent in the lab; the product always passes them.
   */
  authority?: CommandAuthority | null;
  journal?: { state: string | null; reasonCode: string | null; rows: readonly JournalRow[] } | null;
  /** Goal 9: the composition's other two blocks, which this screen fetched and never showed. */
  crossEvidence?: ReactNode;
  /**
   * Phase 5 · `execution.staged-activation-capabilities.v1`, read from
   * `/activation/capabilities`. It is a **state display**: nothing here can be
   * switched from this Portal, and the panel says so in as many words.
   */
  activation?: { read: StagedActivation | null; status: PanelStatus; reason?: string } | null;
  /** Present only on the product route; the server still classifies authority. */
  onRunTask?: (taskId: string, params: Readonly<Record<string, string>>) => Promise<TaskRunOutcome>;
  children?: ReactNode;
}) {
  const [cliSelected, setCliSelected] = useState<string | null>(initialCommand);
  const [classification, setClassification] = useState<ClassificationFilter>("ALL");
  // The catalogue the reader is looking at, after the classification filter.
  const shownTasks = (tasks?.tasks ?? []).filter((t) => classification === "ALL" || t.state === classification);
  const groups = catalogue ? groupEntries(catalogue.entries) : [];
  const reachable = catalogue ? catalogue.entries.filter((e) => e.portalReachable).length : 0;
  const relayDisabled = catalogue?.capabilityState === "DISABLED";
  const cliAction = selected || !demoCli ? null : demoCli.actions.find((a) => a.id === cliSelected) ?? null;
  const selectedTask = selected || demoCli ? null : tasks?.tasks.find((t) => t.taskId === cliSelected) ?? null;
  const publishedByKey = useMemo(() => {
    const map = new Map<string, CatalogEntry>();
    for (const e of catalogue?.entries ?? []) map.set(e.key, e);
    return map;
  }, [catalogue]);

  return (
    <ExecutionSurface kind="deployments" className="exec-admin exec-cli" data-hifi-exact="admin-cli-1i">
      <div className="exec-cli-head">
        <span className="exec-cli-headchip">ADMIN ACTIONS</span>
        <span className="exec-cli-headline">
          Operator Admin scope · UI and CLI share ONE command authority — the browser never runs a
          shell
        </span>
        <span className="exec-cli-wf">WF 1i · catalog: PORTFOLIO_MANAGEMENT_CLI_GUIDE</span>
        <span className="exec-cli-headgap" />
        <span className="exec-cli-stepup">CLI password → web step-up</span>
        {demoCli ? (
          <span className="exec-cli-actor">actor Stan · {demoCli.actorLabel}</span>
        ) : tasks?.actorRole ? (
          <span className="exec-cli-actor">role {tasks.actorRole}</span>
        ) : null}
      </div>

      {status !== "ok" ? (
        <PanelState status={status} reason={reason} />
      ) : (
        <>
          {relayDisabled ? (
            <p className="exec-admin-capability exec-role-body" role="status">
              The Portal&apos;s command relay is <b>disabled</b> for this catalogue
              {catalogue?.capabilityReason ? ` (${catalogue.capabilityReason})` : null}. The flow
              below is a declared demo of WF 1i — every published action is listed further down so
              you know it exists, and none of them can be run from here.
            </p>
          ) : null}
          {actionRef ? (
            <p className="exec-cli-opref" role="note">
              action <code>{actionRef.action}</code>
              {actionRef.binding ? <> for binding <code>{actionRef.binding}</code></> : null} arrived
              from an accounts link — neither the WF 1i catalog nor catalogue rev 2 carries a
              credential-rotation command yet (BR-EX-68 open decision 6) ·{" "}
              <a href={actionRef.binding ? `/deployments/accounts?binding=${encodeURIComponent(actionRef.binding)}` : "/deployments/accounts"}>
                back to Accounts &amp; Bindings →
              </a>
            </p>
          ) : null}
          {operationRef ? (
            <p className="exec-cli-opref" role="note">
              operation <code>{operationRef}</code> arrived from an operations link — the published
              catalogue offers no operation lookup yet (BR-EX-68) ·{" "}
              <a href={`/execution/operations?operation=${encodeURIComponent(operationRef)}`}>
                open it in the Operations Queue →
              </a>
            </p>
          ) : null}

          <div className="exec-cli-body">
            <div className="exec-cli-catalog">
              <p className="exec-cli-hint">
                every mutation follows PLAN → APPLY (step-up) → VERIFY · pick a command to load it
                into the drawer →
              </p>
              {demoCli
                ? demoCli.groups.map((name, gi) => (
                    <section className="exec-cli-group" key={name}>
                      <h2 className="exec-cli-groupname">{name}</h2>
                      {demoCli.actions.filter((a) => a.group === gi).map((a) => (
                        <button
                          type="button"
                          className="exec-cli-row"
                          data-tag={a.tag}
                          data-selected={!selected && a.id === cliSelected ? "true" : undefined}
                          aria-pressed={!selected && a.id === cliSelected}
                          key={a.id}
                          onClick={() => {
                            onSelect(null);
                            setCliSelected(a.id);
                          }}
                        >
                          <span className="exec-cli-rowhead">
                            <span className="exec-cli-rowtitle">{a.title}</span>
                            <span className="exec-cli-tag" data-tag={a.tag}>{a.tag}</span>
                            <span className="exec-cli-rowscope">{a.scope}</span>
                          </span>
                          <span className="exec-cli-rowcli">{a.cli.split("\n")[0]}</span>
                        </button>
                      ))}
                    </section>
                  ))
                : tasksStatus !== "ok"
                  ? <PanelState status={tasksStatus} reason={tasksReason} />
                  : tasks
                    ? (tasks.taskGroups.length > 0 ? tasks.taskGroups : [...new Set(shownTasks.map((t) => t.taskGroup))])
                      // A group with nothing left after the filter is dropped
                      // rather than shown empty: an empty heading reads as a
                      // group whose tasks failed to load.
                      .filter((group) => shownTasks.some((t) => t.taskGroup === group))
                      .map((group) => (
                        <section className="exec-cli-group" key={group}>
                          <h2 className="exec-cli-groupname">
                            {group.replace(/_/g, " ")}
                            <span className="exec-af-dim"> · {shownTasks.filter((t) => t.taskGroup === group).length}</span>
                          </h2>
                          {shownTasks.filter((t) => t.taskGroup === group).map((t) => (
                            <TaskRow
                              key={t.taskId}
                              task={t}
                              selected={!selected && t.taskId === cliSelected}
                              onPick={(id) => {
                                onSelect(null);
                                setCliSelected(id);
                              }}
                            />
                          ))}
                        </section>
                      ))
                    : <PanelState status="unavailable" reason="The operator task catalogue was not returned." />}
              {!demoCli && tasks ? (
                <>
                  {/*
                   * Why every control here is dark, in the server's own words.
                   *
                   * `command_authority` and `relay_state` were parsed and then
                   * dropped, so the drawer showed 24 disabled tasks and no
                   * reason for any of them. FAIL_CLOSED with the relay
                   * inactive is the reason, and it belongs above the catalogue
                   * rather than inside each task's tooltip.
                   */}
                  <p className="exec-cli-hint" data-tone={authority?.state === "OPEN" ? "good" : "warn"}>
                    <b>Command authority: {authority?.state ?? "not stated"}</b>
                    {" · "}relay {tasks.relayState ?? "not stated"}
                    {authority ? ` · relay ${authority.relayActive === null ? "state not published" : authority.relayActive ? "active" : "inactive"}` : ""}
                    {" — "}
                    {authority?.state === "OPEN"
                      ? "a CONNECTED task can be run through plan → apply → verify"
                      : "no task can be run from this Portal until the relay is opened; the catalogue below is what would run"}
                  </p>
                  {activation ? (
                    <section className="exec-cli-activation" aria-label="Staged activation capabilities">
                      <p className="exec-cli-hint">
                        <b>Staged activation (owner-controlled)</b>
                        {" — "}
                        {/*
                          * The sentence that stops this panel being read as a
                          * control. Activation is an owner action taken
                          * outside the Portal; this is a read of what the
                          * server says the state is, and nothing on this
                          * screen can change it.
                          */}
                        this Portal switches nothing on or off here; it reads what the server publishes
                      </p>
                      {activation.status !== "ok" || !activation.read ? (
                        <PanelState
                          status={activation.status === "ok" ? "unavailable" : activation.status}
                          reason={activation.reason ?? "The activation capabilities could not be read."}
                        />
                      ) : (
                        <>
                          <p className="exec-blotter-note">
                            source integration {activation.read.sourceIntegrationState ?? "not published"}
                            {" · "}
                            {activation.read.runtimeActivationRequested
                              ? "a runtime activation may have been requested"
                              : "no runtime activation requested"}
                            {" · "}
                            {activation.read.sourceSideEffectRequested
                              ? <b data-tone="bad">a source side effect may have been requested</b>
                              : "no source side effect requested"}
                            {" · "}
                            {activation.read.ownerArtifactImported ? "owner artifact imported" : "no owner artifact imported"}
                          </p>
                          {activation.read.capabilities.length === 0 ? (
                            <PanelState status="empty" reason="the server published no capability row" />
                          ) : (
                            <table className="exec-360-sync">
                              <caption className="exec-blotter-note">
                                what each capability is doing now, and the first reason it is not live
                              </caption>
                              <thead>
                                <tr><th scope="col">capability</th><th scope="col">effective</th><th scope="col">desired</th><th scope="col">state</th></tr>
                              </thead>
                              <tbody>
                                {activation.read.capabilities.map((capability) => (
                                  <tr key={capability.capabilityKey}>
                                    <th scope="row">{capability.capabilityKey}</th>
                                    <td>{capability.effectiveProfile ?? <span className="exec-blotter-note">not published</span>}</td>
                                    <td>{capability.desiredProfile ?? <span className="exec-blotter-note">not published</span>}</td>
                                    <td data-tone={capability.killSwitchEngaged ? "warn" : undefined}>{activationSentence(capability)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </>
                      )}
                    </section>
                  ) : null}
                  {/* Classification is the other half of the answer, and it is a
                      filter rather than a sentence: an operator looking for
                      something they can actually run should be able to ask. */}
                  <div className="exec-admin-tiers" role="group" aria-label="Filter by task classification">
                    {CLASSIFICATION_FILTERS.map((option) => {
                      const n = option === "ALL" ? (tasks.totalTasks ?? tasks.tasks.length)
                        : option === "CONNECTED" ? tasks.counts.connected
                          : option === "SUPPORTED_BUT_INACTIVE" ? tasks.counts.inactive
                            : tasks.counts.incompatible;
                      return (
                        <button
                          key={option}
                          type="button"
                          className="exec-inbox-filter"
                          aria-pressed={option === classification}
                          disabled={n === 0}
                          title={n === 0 ? "No task in the published catalogue carries this classification." : undefined}
                          onClick={() => setClassification(option)}
                        >
                          {CLASSIFICATION_LABEL[option]} <span className="exec-af-dim">{n ?? "?"}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="exec-cli-hint">only a CONNECTED task can ever carry a control</p>
                  {/*
                   * What has actually been run. The composition carries a
                   * redacted command journal and no screen was showing it, so
                   * the surface could say what MAY be run and never what WAS.
                   */}
                  <details className="exec-cli-published">
                    <summary>
                      Command journal — {journal ? `${journal.rows.length} redacted entries · ${journal.state ?? "state not stated"}` : "not read"}
                    </summary>
                    {journal && journal.rows.length > 0 ? (
                      <div className="exec-scroll-x">
                        <table className="exec-360-sync" aria-label="Redacted command journal">
                          <thead>
                            <tr><th scope="col">when (UTC)</th><th scope="col">actor</th><th scope="col">command</th><th scope="col">outcome</th><th scope="col">detail</th></tr>
                          </thead>
                          <tbody>
                            {journal.rows.slice(0, 100).map((row, index) => (
                              <tr key={`${row.at ?? index}-${row.command ?? index}`}>
                                <td className="exec-num">{row.at ? utcStamp(row.at) : <span className="exec-gate-unverified">no clock published</span>}</td>
                                <td>{row.actor ?? <span className="exec-gate-unverified">actor redacted</span>}</td>
                                <td>{row.command ?? "not published"}</td>
                                <td data-tone={sourceTone(row.outcome) ?? undefined}>{row.outcome ?? "outcome not published"}</td>
                                <td className="exec-role-meta">{row.detail ?? ""}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <PanelState
                        status={journal ? "empty" : "unavailable"}
                        reason={journal ? `The journal answered with no entry${journal.reasonCode ? ` · ${journal.reasonCode}` : ""}.` : "The composition that carries the journal has not been read."}
                      />
                    )}
                  </details>
                  {crossEvidence}
                </>
              ) : null}

              <details className="exec-cli-published">
                <summary>
                  Full published catalogue — rev {catalogue?.revision ?? "not stated"} ·{" "}
                  {catalogue?.returnedEntries ?? catalogue?.entries.length ?? 0} of{" "}
                  {catalogue?.totalEntries ?? "an unpublished number of"} actions ·{" "}
                  {reachable} reachable
                </summary>
                {onTierChange ? (
                  <div className="exec-admin-tiers" role="group" aria-label="Filter by risk tier">
                    {TIER_FILTERS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className="exec-inbox-filter"
                        data-tier-filter={option}
                        aria-pressed={option === tier}
                        onClick={() => onTierChange(option)}
                      >
                        {TIER_FILTER_LABEL[option]}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="exec-admin-catalog">
                  {groups.map((group) => (
                    <section className="exec-admin-group" key={group.code ?? "ungrouped"}>
                      <h3 className="exec-cli-groupname">
                        {group.label} <span className="exec-role-meta">{group.items.length}</span>
                      </h3>
                      {group.items.map((entry) => (
                        <EntryRow
                          key={entry.key}
                          entry={entry}
                          selected={entry.key === selected?.key}
                          onSelect={(e) => {
                            setCliSelected(null);
                            onSelect(e);
                          }}
                        />
                      ))}
                    </section>
                  ))}
                </div>
              </details>
            </div>

            {selected ? (
              <div className="exec-cli-drawer">
                <div className="exec-cli-drawhead">
                  <h1>
                    {selected.command} {selected.action}
                  </h1>
                </div>
                <div aria-label="Command detail" className="exec-admin-drawer exec-cli-drawbody">
                  <EntryDetail entry={selected} plan={plan} />
                  {children}
                </div>
              </div>
            ) : demoCli && cliAction ? (
              demoCli.renderDrawer({
                action: cliAction,
                onReset: () => setCliSelected(initialCommand),
                publishedEntry: cliAction.catalogKey ? publishedByKey.get(cliAction.catalogKey) ?? null : null,
              })
            ) : selectedTask ? (
              <TaskDetail
                task={selectedTask}
                publishedEntry={selectedTask.catalogKey ? publishedByKey.get(selectedTask.catalogKey) ?? null : null}
                onRun={onRunTask}
              />
            ) : (
              <div className="exec-cli-drawer">
                <div aria-label="Command detail" className="exec-cli-drawbody">
                  <p className="exec-admin-empty exec-role-body">
                    Pick an action to see its risk tier and steps.
                  </p>
                  {children}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </ExecutionSurface>
  );
}
