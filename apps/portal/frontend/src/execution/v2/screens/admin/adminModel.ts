/**
 * Admin Actions, pure model (UXM-07 S2, flag key `admin`).
 *
 * Two published catalogues meet here and neither is rewritten:
 *
 * - the operator TASK catalogue (`execution.command-tasks.v1`, 24 tasks in six
 *   groups) is the list on screen. Its groups are the tiers of the hi-fi
 *   (Read, Portfolio capital, Deployment risk, Account, Sync and
 *   reconciliation, Emergency), in the order the server sent them;
 * - the COMMAND catalogue (`execution.command-catalog.v1`, 64 entries) is joined
 *   by `catalog_key` for the route, the Portal risk tier and the reason a
 *   command is out of reach. A task whose key the catalogue lacks says so.
 *
 * The state words of the hi-fi map onto the server's classification, never the
 * other way round: CONNECTED is Ready; SUPPORTED_BUT_INACTIVE is Not enabled;
 * SEMANTICALLY_INCOMPATIBLE is Not offered; and anything in the capital group
 * starts in Portfolios whatever its classification. "First reason it is not
 * live" is the task's own reason code, or else the first staged-activation
 * capability that is not live, in the contract's order.
 *
 * Nothing here applies a command. `planRequest` builds the one POST this screen
 * may make (a plan, which the server refuses or previews) and refuses to build
 * it without a workspace, a note of twelve characters and a positive version.
 */
import type { CatalogEntry, CommandCatalogue } from "../../../adminCatalog";
import { BLOCKED_REASON_TEXT } from "../../../adminCatalog";
import type { OperatorTask } from "../../../api/profileRead";
import { PLAN_ENVIRONMENTS, planApplicable, type CommandPlan, type CommandPlanRequestInput, type PlanEnvironment } from "../../../commandPlan";
import { activationSentence, type ActivationCapability, type StagedActivation } from "../../../stagedActivation";
import { codeName } from "../../displayNames";
import type { FlagKind } from "../../flagKinds";

export const NOTE_MIN = 12;

/** DOM budget: the contract bounds the task catalogue at 64, so this is a guard, not a limit anyone meets. */
export const ROW_CAP = 200;

export function humanize(code: string): string {
  const words = code.replace(/[_-]+/g, " ").trim().toLowerCase();
  return words === "" ? code : words.charAt(0).toUpperCase() + words.slice(1);
}

/* ── tiers ─────────────────────────────────────────────────────────────── */

export interface TierCopy {
  label: string;
  note: string;
}

/** The hi-fi's six tier names for the server's six task groups. An unknown group keeps its own words. */
export const TIER_COPY: Readonly<Record<string, TierCopy>> = {
  READ_INSPECT: { label: "Read", note: "Look only. Nothing changes." },
  PORTFOLIO_CAPITAL: { label: "Portfolio capital", note: "Moves money. Starts in Portfolios." },
  DEPLOYMENT_RISK: { label: "Deployment risk", note: "Changes how a deployment may trade." },
  ACCOUNT: { label: "Account", note: "Changes account rules." },
  BROKER_SYNC_RECONCILIATION: { label: "Sync and reconciliation", note: "Re-reads the broker. Fixes drift." },
  EMERGENCY_DESTRUCTIVE: { label: "Emergency", note: "Needs a second approver and a security key." },
};

export function tierCopy(group: string): TierCopy {
  return TIER_COPY[group] ?? { label: humanize(group), note: "" };
}

/* ── row state ─────────────────────────────────────────────────────────── */

export type RowState = "ready" | "not-enabled" | "elsewhere" | "not-offered";
export const ROW_STATES: readonly RowState[] = ["ready", "not-enabled", "elsewhere", "not-offered"];

export const ROW_STATE_VIEW: Readonly<Record<RowState, { kind: FlagKind; label: string; filter: string }>> = {
  ready: { kind: "ok", label: "Ready to run", filter: "Ready" },
  "not-enabled": { kind: "na", label: "Not enabled for this profile", filter: "Not enabled" },
  elsewhere: { kind: "operation", label: "Start in Portfolios", filter: "Start elsewhere" },
  "not-offered": { kind: "paused", label: "Not offered in the portal", filter: "Not offered" },
};

export type ActionKind = "read" | "capital" | "command" | "danger";

export const KIND_VIEW: Readonly<Record<ActionKind, { kind: FlagKind; label: string }>> = {
  read: { kind: "ok", label: "Read" },
  capital: { kind: "operation", label: "Capital" },
  command: { kind: "approval", label: "Command" },
  danger: { kind: "incident", label: "Emergency" },
};

export interface ActionRow {
  id: string;
  title: string;
  group: string;
  scope: string;
  kind: ActionKind;
  state: RowState;
  task: OperatorTask;
  entry: CatalogEntry | null;
}

export function kindOf(task: OperatorTask): ActionKind {
  if (task.taskGroup === "EMERGENCY_DESTRUCTIVE") return "danger";
  if (task.taskGroup === "PORTFOLIO_CAPITAL") return "capital";
  if (task.taskGroup === "READ_INSPECT") return "read";
  return "command";
}

export function stateOf(task: OperatorTask): RowState {
  if (task.taskGroup === "PORTFOLIO_CAPITAL") return "elsewhere";
  switch (task.state) {
    case "CONNECTED": return "ready";
    case "SUPPORTED_BUT_INACTIVE": return "not-enabled";
    default: return "not-offered";
  }
}

export function entryFor(task: OperatorTask, catalogue: CommandCatalogue | null): CatalogEntry | null {
  if (!catalogue || !task.catalogKey) return null;
  return catalogue.entries.find((entry) => entry.key === task.catalogKey) ?? null;
}

export function toRows(tasks: readonly OperatorTask[], catalogue: CommandCatalogue | null): ActionRow[] {
  return tasks.map((task) => ({
    id: task.taskId,
    title: task.title,
    group: task.taskGroup,
    scope: task.scope,
    kind: kindOf(task),
    state: stateOf(task),
    task,
    entry: entryFor(task, catalogue),
  }));
}

export interface TierBlock {
  group: string;
  label: string;
  note: string;
  rows: readonly ActionRow[];
  /** All rows of the tier before the state filter, for "2 of 7 ready". */
  total: number;
  ready: number;
}

/** Tiers in the order the server declared them; a group it did not declare follows. */
export function tiersOf(rows: readonly ActionRow[], declared: readonly string[], filter: RowState | "all"): TierBlock[] {
  const order = [...declared, ...rows.map((r) => r.group).filter((g) => !declared.includes(g))];
  const seen = new Set<string>();
  const out: TierBlock[] = [];
  for (const group of order) {
    if (seen.has(group)) continue;
    seen.add(group);
    const all = rows.filter((r) => r.group === group);
    const shown = all.filter((r) => filter === "all" || r.state === filter);
    if (shown.length === 0) continue;
    const copy = tierCopy(group);
    out.push({ group, label: copy.label, note: copy.note, rows: shown, total: all.length, ready: all.filter((r) => r.state === "ready").length });
  }
  return out;
}

export function stateCounts(rows: readonly ActionRow[]): Readonly<Record<RowState | "all", number>> {
  const counts: Record<RowState | "all", number> = { all: rows.length, ready: 0, "not-enabled": 0, elsewhere: 0, "not-offered": 0 };
  for (const row of rows) counts[row.state] += 1;
  return counts;
}

/* ── activation: the first reason it is not live ───────────────────────── */

export function capabilityLive(capability: ActivationCapability): boolean {
  return capability.sourceEnabled && capability.runtimeEnabled && !capability.killSwitchEngaged;
}

/** The staged-activation capability that governs a risk tier. Reads and unclassified tiers have none of their own. */
const TIER_CAPABILITY: Readonly<Record<string, string>> = {
  R1_PAPER_MUTATION: "COMMAND_R1",
  R2_SANDBOX: "COMMAND_R2",
  R3_LIVE_PROTECTIVE: "COMMAND_R3",
  R4_LIVE_RISK_INCREASING: "COMMAND_R4",
};

export interface FirstReason {
  /** Machine words, as the server published them. */
  code: string | null;
  /** One sentence, from the staged-activation read. */
  sentence: string | null;
  /** Which capability the sentence is about. */
  capability: string | null;
}

/** First capability in the contract's order that is not live. */
export function firstNotLive(activation: StagedActivation | null): ActivationCapability | null {
  return activation?.capabilities.find((capability) => !capabilityLive(capability)) ?? null;
}

export function firstReasonFor(task: OperatorTask, activation: StagedActivation | null): FirstReason {
  const wanted = task.riskTier ? TIER_CAPABILITY[task.riskTier] : undefined;
  const own = wanted ? activation?.capabilities.find((c) => c.capabilityKey === wanted) ?? null : null;
  const capability = own && !capabilityLive(own) ? own : firstNotLive(activation);
  return {
    code: task.reasonCode,
    sentence: capability ? `${capability.capabilityKey}: ${activationSentence(capability)}` : null,
    capability: capability?.capabilityKey ?? null,
  };
}

/* ── plan gate and request ─────────────────────────────────────────────── */

export interface Gate {
  allowed: boolean;
  /** Why not, one short sentence. Empty when allowed. */
  reason: string;
}

/**
 * May this action be planned from here? A plan is a preview the server records
 * and refuses to apply while the relay is off; it is never an apply.
 */
export function planGate(row: ActionRow, workspaceId: string | null): Gate {
  const { task, entry } = row;
  if (row.kind === "read") return { allowed: false, reason: "A read runs here; it is not planned." };
  if (row.kind === "capital") return { allowed: false, reason: "Capital actions begin in Portfolios with a preview. Nothing is started from this page." };
  if (row.kind === "danger") return { allowed: false, reason: "Needs a second approver and a security key. Not offered here." };
  if (task.twoManRule || task.typedConfirmWord) return { allowed: false, reason: "Needs a second approver. Not offered here." };
  if (row.state === "not-offered") {
    return { allowed: false, reason: `Not offered in the portal${task.reasonCode ? ` (${codeName(task.reasonCode).name})` : ""}.` };
  }
  if (!task.catalogKey) return { allowed: false, reason: "No catalogue key is published for this action, so there is nothing to plan." };
  if (!entry) return { allowed: false, reason: `The command catalogue does not carry ${task.catalogKey}.` };
  if (entry.blockedReason === "GENERIC_REDIS_ACCESS_PROHIBITED" || entry.blockedReason === "DESTRUCTIVE_OR_LAB_ONLY_COMMAND_PROHIBITED") {
    return { allowed: false, reason: BLOCKED_REASON_TEXT[entry.blockedReason] };
  }
  if (!workspaceId) return { allowed: false, reason: "The workspace for this plan was not stated by the catalogue." };
  return { allowed: true, reason: "" };
}

export function defaultEnvironment(riskTier: string | null): PlanEnvironment {
  switch (riskTier) {
    case "R2_SANDBOX": return "SANDBOX";
    case "R3_LIVE_PROTECTIVE":
    case "R4_LIVE_RISK_INCREASING": return "LIVE";
    default: return "PAPER";
  }
}

/** The first scope word names the target kind: "account · venue" targets an ACCOUNT. */
export function targetTypeOf(scope: string): string {
  const first = scope.split(/[\s·,]+/).find((word) => word !== "");
  return (first ?? "system").toUpperCase();
}

export interface PlanForm {
  environment: PlanEnvironment;
  targetId: string;
  version: string;
  note: string;
}

export function formProblem(form: PlanForm): string | null {
  if (form.targetId.trim() === "") return "Enter the target to plan against.";
  if (!/^[1-9]\d{0,8}$/.test(form.version.trim())) return "Enter the target version you looked at, a whole number from 1.";
  if (form.note.trim().length < NOTE_MIN) return `Add a note of at least ${NOTE_MIN} characters.`;
  return null;
}

/**
 * The plan request, or the reason it cannot be built. The note travels as the
 * payload and is hashed by the server; it is never echoed back by this screen.
 */
export function planRequest(
  row: ActionRow,
  form: PlanForm,
  workspaceId: string | null,
  requestKey: string,
): { ok: true; value: CommandPlanRequestInput } | { ok: false; reason: string } {
  const gate = planGate(row, workspaceId);
  if (!gate.allowed) return { ok: false, reason: gate.reason };
  const problem = formProblem(form);
  if (problem) return { ok: false, reason: problem };
  if (!(PLAN_ENVIRONMENTS as readonly string[]).includes(form.environment)) return { ok: false, reason: "Choose an environment." };
  return {
    ok: true,
    value: {
      workspaceId: workspaceId as string,
      requestKey,
      commandKey: row.task.catalogKey as string,
      environment: form.environment,
      target: { type: targetTypeOf(row.task.scope), id: form.targetId.trim() },
      expectedTargetVersion: Number(form.version.trim()),
      payload: { note: form.note.trim() },
    },
  };
}

/* ── command state ─────────────────────────────────────────────────────── */

export const COMMAND_STATES = ["not-started", "preview", "accepted", "uncertain", "applied", "catching-up"] as const;
export type CommandState = (typeof COMMAND_STATES)[number];

export const COMMAND_STATE_VIEW: Readonly<Record<CommandState, { kind: FlagKind; label: string }>> = {
  "not-started": { kind: "neutral", label: "Not started" },
  preview: { kind: "pending", label: "Preview" },
  accepted: { kind: "operation", label: "Accepted" },
  uncertain: { kind: "unknown", label: "Uncertain" },
  applied: { kind: "applied", label: "Applied" },
  "catching-up": { kind: "display", label: "Catching up" },
};

/**
 * Where a plan stands on the six-state strip. A status this table does not
 * know reads as Uncertain, never as Applied: a word we cannot place is not
 * a success.
 */
export function commandStateOf(plan: CommandPlan | null): CommandState {
  if (plan === null) return "not-started";
  switch (plan.status ?? "") {
    case "BLOCKED":
    case "PREVIEW":
    case "PLANNED":
      return "preview";
    case "ACCEPTED":
    case "AWAITING_APPLY":
    case "QUEUED":
    case "RUNNING":
      return "accepted";
    case "APPLIED":
    case "VERIFIED":
    case "SUCCEEDED":
      return "applied";
    case "APPLIED_UNVERIFIED":
    case "CATCHING_UP":
      return "catching-up";
    default:
      return "uncertain";
  }
}

/** Why Apply is off for a plan: the plan's own answer first, then the activation. */
export function applyReason(plan: CommandPlan | null, first: FirstReason): string {
  if (plan === null) return "Make a plan first. Applying is off while the command relay is disabled.";
  const answer = planApplicable(plan);
  if (!answer.allowed) return first.sentence ? `${answer.reason} First reason it is not live: ${first.sentence}.` : answer.reason;
  return "Applying is not offered on this page yet. Open the operation to follow it.";
}
