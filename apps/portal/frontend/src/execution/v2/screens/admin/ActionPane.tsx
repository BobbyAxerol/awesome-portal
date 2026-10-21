/**
 * The Admin Actions detail pane: one action, what it is, why it is not live,
 * and the only two things this page may do with it.
 *
 * - a CONNECTED read runs here (`runOperatorTask`): a bounded local projection
 *   read whose receipt says no source command was sent;
 * - a command may be PLANNED (`planCommand`): a preview the server records and
 *   refuses to apply while the relay is off. The plan comes back on the
 *   six-state command strip; Apply is a disabled action with the first reason
 *   it is not live. No code path here calls an apply.
 *
 * A request key belongs to an intent: the same inputs reuse it (a retry), any
 * edit mints a new one. The note rides as the payload, is hashed server-side
 * and is never repeated back on this page.
 */
import { useId, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { RISK_TIER_LABEL, blockedText } from "../../../adminCatalog";
import type { ExecutionApi } from "../../../api/ports";
import type { OperatorTaskRunResult } from "../../../api/profileRead";
import { planOutcomeText, planApplicable, PLAN_ENVIRONMENTS, type CommandPlan } from "../../../commandPlan";
import type { PanelStatus } from "../../../contracts";
import { PanelState } from "../../../components/states";
import type { StagedActivation } from "../../../stagedActivation";
import { NotPublished } from "../../blocks";
import { DockAction, Drawer, type DockMode } from "../../Drawer";
import { Flag } from "../../Flag";
import { withContext } from "../../urlState";
import {
  COMMAND_STATES, COMMAND_STATE_VIEW, KIND_VIEW, NOTE_MIN, ROW_STATE_VIEW, applyReason, commandStateOf, defaultEnvironment,
  firstReasonFor, formProblem, humanize, planGate, planRequest, type ActionRow, type PlanForm,
} from "./adminModel";
import { formatInstant } from "../../boundary";

const STALE_REASON = "The last refresh failed; refresh before acting.";

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface ActionPaneProps {
  row: ActionRow;
  api: ExecutionApi;
  activation: StagedActivation | null;
  /**
   * A refresh failed and the screen is showing the last good reads. What this pane would offer rests on
   * those reads, so the two acting controls (Run read, Make plan) stay off until a good refresh.
   */
  stale?: boolean;
  workspaceId: string | null;
  mode: DockMode;
  /** False while the screen opened this pane itself (nobody asked): focus is not pulled into it. */
  focusOnOpen?: boolean;
  onClose: () => void;
  portfoliosHref: string;
  operationsHref: string;
}

type PlanOutcome =
  | { phase: "idle" }
  | { phase: "busy" }
  | { phase: "plan"; plan: CommandPlan }
  | { phase: "error"; status: Exclude<PanelStatus, "ok" | "loading">; reason: string };

type RunOutcome =
  | { phase: "idle" }
  | { phase: "busy" }
  | { phase: "receipt"; receipt: OperatorTaskRunResult }
  | { phase: "error"; reason: string };

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt>{term}</dt>
      <dd>{children}</dd>
    </>
  );
}

function stepsOf(row: ActionRow): string {
  const { task } = row;
  const steps = [task.planRequired ? "Plan" : null, task.applyRequired ? (task.stepUpRequired ? "Apply with step-up" : "Apply") : null, task.verifyRequired ? "Verify" : null]
    .filter((step): step is string => step !== null);
  return steps.length > 0 ? steps.join(", then ") : "No plan, apply or verify path stated; treated as the full ceremony, not as none.";
}

/** The six-state strip. The current state is marked; the rest are the states a command can reach. */
function CommandStrip({ plan }: { plan: CommandPlan | null }) {
  const current = commandStateOf(plan);
  return (
    <ol className="exec-adm-strip" aria-label="Command state">
      {COMMAND_STATES.map((state) => (
        <li key={state} className="exec-adm-strip-item" data-current={state === current ? "true" : undefined} aria-current={state === current ? "step" : undefined}>
          <Flag kind={COMMAND_STATE_VIEW[state].kind} label={COMMAND_STATE_VIEW[state].label} size="sm" />
        </li>
      ))}
    </ol>
  );
}

/** `href` with one query param set, whatever query it already carries. */
export function withQuery(href: string, key: string, value: string): string {
  const hashAt = href.indexOf("#");
  const hash = hashAt < 0 ? "" : href.slice(hashAt);
  const rest = hashAt < 0 ? href : href.slice(0, hashAt);
  const queryAt = rest.indexOf("?");
  const query = new URLSearchParams(queryAt < 0 ? "" : rest.slice(queryAt + 1));
  query.set(key, value);
  return `${queryAt < 0 ? rest : rest.slice(0, queryAt)}?${query.toString()}${hash}`;
}

function PlanResult({ plan, operationsHref, params }: { plan: CommandPlan; operationsHref: string; params: URLSearchParams }) {
  const applicable = planApplicable(plan);
  return (
    <div className="exec-adm-plan" aria-label="Plan">
      <p className="exec-adm-plan-line">{planOutcomeText(plan)}</p>
      <dl className="exec-adm-facts">
        <Fact term="Operation"><span className="exec-adm-mono">{plan.operationId}</span></Fact>
        <Fact term="Status">{plan.status ?? "Not stated"}</Fact>
        <Fact term="Relay">{plan.relayCapability ?? "Not stated"}</Fact>
        <Fact term="Blockers">{plan.blockers.length > 0 ? plan.blockers.join(", ") : "None stated"}</Fact>
        <Fact term="Can be applied">{applicable.allowed ? "Yes" : applicable.reason}</Fact>
        <Fact term="What would change"><NotPublished id="FE-020" /></Fact>
        {plan.expiresAt ? <Fact term="Expires">{formatInstant(plan.expiresAt)}</Fact> : null}
        {plan.planDigest ? <Fact term="Digest"><span className="exec-adm-mono">{plan.planDigest}</span></Fact> : null}
        {plan.replayed ? <Fact term="Request">Replayed: the server recognised this request key and returned the existing plan.</Fact> : null}
      </dl>
      {plan.payloadStoragePolicy === "HASH_ONLY_NO_RAW" ? (
        <p className="exec-adm-note">The request is stored as a hash and never kept. It cannot be read back here.</p>
      ) : null}
      <Link className="exec-adm-link" to={withContext(withQuery(operationsHref, "operation", plan.operationId), params)}>Open in Operations</Link>
    </div>
  );
}

export function ActionPane({ row, api, activation, stale = false, workspaceId, mode, focusOnOpen = true, onClose, portfoliosHref, operationsHref }: ActionPaneProps) {
  const { task, entry } = row;
  const [params] = useSearchParams();
  const ids = { target: useId(), version: useId(), env: useId(), note: useId() };
  const [form, setForm] = useState<PlanForm>({ environment: defaultEnvironment(task.riskTier), targetId: "", version: "", note: "" });
  const [plan, setPlan] = useState<PlanOutcome>({ phase: "idle" });
  const [run, setRun] = useState<RunOutcome>({ phase: "idle" });
  const [readParams, setReadParams] = useState<Record<string, string>>(() => Object.fromEntries(task.params.map((p) => [p.key, p.defaultValue ?? ""])));
  const intent = useRef<{ sig: string; key: string } | null>(null);

  const state = ROW_STATE_VIEW[row.state];
  const first = firstReasonFor(task, activation);
  const gate = planGate(row, workspaceId);
  const problem = formProblem(form);
  const currentPlan = plan.phase === "plan" ? plan.plan : null;
  const missingRead = task.params.some((p) => p.required && (readParams[p.key] ?? "").trim() === "");

  const submitPlan = async () => {
    if (plan.phase === "busy") return;
    const sig = JSON.stringify(form);
    if (intent.current === null || intent.current.sig !== sig) intent.current = { sig, key: newKey() };
    const built = planRequest(row, form, workspaceId, intent.current.key);
    if (!built.ok) {
      setPlan({ phase: "error", status: "insufficient_data", reason: built.reason });
      return;
    }
    setPlan({ phase: "busy" });
    try {
      const result = await api.planCommand(built.value);
      setPlan(result.ok
        ? { phase: "plan", plan: result.value }
        : { phase: "error", status: result.status === "loading" ? "unavailable" : result.status, reason: result.reason });
    } catch {
      setPlan({ phase: "error", status: "unavailable", reason: "The plan request never reached the Portal." });
    }
  };

  const runRead = async () => {
    if (run.phase === "busy" || missingRead) return;
    setRun({ phase: "busy" });
    try {
      const filled = Object.fromEntries(Object.entries(readParams).filter(([, value]) => value.trim() !== ""));
      const result = await api.runOperatorTask(task.taskId, filled);
      setRun(result.ok ? { phase: "receipt", receipt: result.value } : { phase: "error", reason: result.reason });
    } catch {
      setRun({ phase: "error", reason: "The local read never reached the Portal." });
    }
  };

  const showCommandStrip = row.kind === "command";

  return (
    <Drawer
      title={row.title}
      subtitle={task.catalogKey ?? task.taskId}
      mode={mode}
      focusOnOpen={focusOnOpen}
      onClose={onClose}
      actions={
        row.kind === "read" || row.kind === "capital" ? undefined : (
          <DockAction label="Apply" reason={applyReason(currentPlan, first)} />
        )
      }
    >
      <dl className="exec-adm-facts">
        <Fact term="Kind"><Flag kind={KIND_VIEW[row.kind].kind} label={KIND_VIEW[row.kind].label} size="sm" /></Fact>
        <Fact term="Scope">{task.scope === "" ? "Not stated" : task.scope}</Fact>
        <Fact term="Who">{task.requiredRole ?? "Role not stated"}</Fact>
        <Fact term="Risk tier">{task.riskTier ? (RISK_TIER_LABEL as Record<string, string>)[task.riskTier] ?? humanize(task.riskTier) : "Not stated"}</Fact>
        <Fact term="How">{row.kind === "read" ? "Runs here as a local read. Nothing is sent to the trading system." : stepsOf(row)}</Fact>
        <Fact term="State"><Flag kind={state.kind} label={state.label} size="sm" /></Fact>
        <Fact term="Not live because">
          {first.code ?? first.sentence ? (
            <>
              {first.code ? <span className="exec-adm-mono">{first.code}</span> : null}
              {first.code && first.sentence ? " " : null}
              {first.sentence ?? null}
            </>
          ) : row.state === "ready" ? "Nothing: the server classifies this action as connected." : "No reason was published."}
        </Fact>
      </dl>

      {row.kind === "capital" ? (
        <div className="exec-adm-block">
          <h4 className="exec-adm-h4">Start in Portfolios</h4>
          <Link className="exec-adm-link" to={withContext(portfoliosHref, params)}>Open Portfolios</Link>
        </div>
      ) : row.kind === "read" ? (
        row.state === "ready" ? (
          <div className="exec-adm-block">
            <h4 className="exec-adm-h4">Run local read</h4>
            {stale ? (
              <DockAction label="Run read" reason={STALE_REASON} />
            ) : (
              <>
                {task.params.map((p) => (
                  <label className="exec-adm-field" key={p.key}>
                    <span className="exec-adm-label">{p.key}{p.required ? " (required)" : ""}</span>
                    <input
                      className="exec-adm-input"
                      value={readParams[p.key] ?? ""}
                      onChange={(event) => setReadParams((current) => ({ ...current, [p.key]: event.target.value }))}
                    />
                  </label>
                ))}
                <button type="button" className="exec-adm-btn" data-variant="primary" disabled={run.phase === "busy" || missingRead} aria-describedby={missingRead ? ids.note : undefined} onClick={() => void runRead()}>
                  {run.phase === "busy" ? "Running" : "Run read"}
                </button>
                {missingRead ? <p id={ids.note} className="exec-adm-note">Complete the required parameters before running.</p> : null}
              </>
            )}
            {run.phase === "error" ? <PanelState status="unavailable" reason={run.reason} /> : null}
            {run.phase === "receipt" ? (
              <div className="exec-adm-receipt" role="status">
                <Flag kind="applied" label="Read finished" size="sm" />
                <p>Source command sent: no. The answer is a bounded read of the local projection ({run.receipt.transport}).</p>
                <pre className="exec-adm-pre">{JSON.stringify(run.receipt.result, null, 2)}</pre>
                <p className="exec-adm-note">Receipt digest <span className="exec-adm-mono">{run.receipt.responseDigest}</span></p>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="exec-adm-block">
            <DockAction label="Run read" reason={row.state === "not-offered" ? "This action is not offered in the portal." : "This action is not enabled for this profile."} />
          </div>
        )
      ) : (
        <div className="exec-adm-block">
          <h4 className="exec-adm-h4">1 Plan</h4>
          {showCommandStrip ? <CommandStrip plan={currentPlan} /> : null}
          {gate.allowed && !stale ? (
            <>
              <label className="exec-adm-field" htmlFor={ids.env}>
                <span className="exec-adm-label">Environment</span>
              </label>
              <select id={ids.env} className="exec-adm-input" value={form.environment} onChange={(event) => setForm({ ...form, environment: event.target.value as PlanForm["environment"] })}>
                {PLAN_ENVIRONMENTS.map((env) => <option key={env} value={env}>{humanize(env)}</option>)}
              </select>
              <label className="exec-adm-field" htmlFor={ids.target}>
                <span className="exec-adm-label">Target ({humanize(task.scope.split(/[\s·,]+/)[0] ?? "system")} id)</span>
              </label>
              <input id={ids.target} className="exec-adm-input" value={form.targetId} onChange={(event) => setForm({ ...form, targetId: event.target.value })} />
              <label className="exec-adm-field" htmlFor={ids.version}>
                <span className="exec-adm-label">Target version you looked at</span>
              </label>
              <input id={ids.version} className="exec-adm-input" inputMode="numeric" value={form.version} onChange={(event) => setForm({ ...form, version: event.target.value })} />
              <label className="exec-adm-field" htmlFor={ids.note}>
                <span className="exec-adm-label">Note (at least {NOTE_MIN} characters)</span>
              </label>
              <input id={ids.note} className="exec-adm-input" placeholder="Why this change" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
              <button type="button" className="exec-adm-btn" data-variant="primary" disabled={problem !== null || plan.phase === "busy"} aria-describedby={problem !== null ? `${ids.note}-why` : undefined} onClick={() => void submitPlan()}>
                {plan.phase === "busy" ? "Making plan" : "Make plan"}
              </button>
              {problem !== null ? <p id={`${ids.note}-why`} className="exec-adm-note">{problem}</p> : null}
              <p className="exec-adm-note">A plan is a preview. Applying stays off while the command relay is disabled.</p>
            </>
          ) : (
            <DockAction label="Make plan" reason={gate.allowed ? STALE_REASON : gate.reason} />
          )}
          {plan.phase === "error" ? <PanelState status={plan.status} reason={plan.reason} /> : null}
          {currentPlan ? <PlanResult plan={currentPlan} operationsHref={operationsHref} params={params} /> : null}
        </div>
      )}

      <details className="exec-adm-prov">
        <summary>Provenance</summary>
        <dl className="exec-adm-facts">
          <Fact term="Task"><span className="exec-adm-mono">{task.taskId}</span> ({humanize(task.state)})</Fact>
          <Fact term="Catalogue key">{task.catalogKey ? <span className="exec-adm-mono">{task.catalogKey}</span> : "None published"}</Fact>
          {entry ? (
            <>
              <Fact term="Route">{entry.httpMethod && entry.httpPath ? `${entry.httpMethod} ${entry.httpPath}` : "No HTTP route published"}{entry.routeState ? ` (${humanize(entry.routeState)})` : ""}</Fact>
              <Fact term="Portal tier">{entry.riskTier ? (RISK_TIER_LABEL as Record<string, string>)[entry.riskTier] : "Not stated"}</Fact>
              <Fact term="Why blocked">{blockedText(entry)}</Fact>
              {entry.sourceReference ? <Fact term="Observed at"><span className="exec-adm-mono">{entry.sourceReference}</span></Fact> : null}
            </>
          ) : task.catalogKey ? (
            <Fact term="Catalogue">This catalogue revision does not carry that key.</Fact>
          ) : null}
          {task.meta ? <Fact term="Source">{task.meta}</Fact> : null}
          {task.unlistedReason ? <Fact term="Unlisted">{task.unlistedReason}</Fact> : null}
        </dl>
      </details>
    </Drawer>
  );
}
