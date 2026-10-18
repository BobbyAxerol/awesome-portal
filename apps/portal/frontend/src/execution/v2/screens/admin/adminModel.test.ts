/**
 * Admin Actions model, L0 to L3 on the two published catalogues it joins: the
 * operator task catalogue (`execution.command-tasks.v1`) and the command
 * catalogue (`execution.command-catalog.v1`).
 */
import { describe, expect, it } from "vitest";

import { readCommandCatalogue } from "../../../adminCatalog";
import { readOperatorTasks, type OperatorTask } from "../../../api/profileRead";
import { readCommandPlan } from "../../../commandPlan";
import { readStagedActivation } from "../../../stagedActivation";
import { canonicalDigest, loadCanonical } from "../../testkit/loadCanonical";
import { ABSENT, dimension, pairwise, type Draft } from "../../testkit/matrix";
import { enumCases, leaked, prototypeIsClean, requiredCases, rootCases, stringCases } from "../../testkit/negative";
import {
  COMMAND_STATES, NOTE_MIN, applyReason, capabilityLive, commandStateOf, defaultEnvironment, entryFor, firstNotLive, firstReasonFor, formProblem, kindOf,
  planGate, planRequest, stateCounts, stateOf, targetTypeOf, tierCopy, tiersOf, toRows,
} from "./adminModel";

const TASKS = "execution-command-tasks";
const CATALOGUE = "execution-command-catalog";
const ACTIVATION = "execution-staged-activation.capabilities";
const PLAN = "execution-command-plan";
const digests = [TASKS, CATALOGUE, ACTIVATION, PLAN].map((n) => [n, canonicalDigest(n)] as const);

const tasks = readOperatorTasks(loadCanonical(TASKS))!;
const catalogue = readCommandCatalogue(loadCanonical(CATALOGUE))!;
const activation = readStagedActivation(loadCanonical(ACTIVATION))!;
const plan = readCommandPlan(loadCanonical(PLAN))!;
const rows = toRows(tasks.tasks, catalogue);
const row = (id: string) => rows.find((r) => r.id === id)!;

describe("L0 canonical", () => {
  it("reads the three catalogues and the plan", () => {
    expect(tasks.tasks).toHaveLength(24);
    expect(catalogue.entries).toHaveLength(64);
    expect(activation.capabilities).toHaveLength(7);
    expect(plan.status).toBe("BLOCKED");
  });
  it("leaves the files as it found them", () => {
    for (const [name, digest] of digests) expect(canonicalDigest(name), name).toBe(digest);
  });
});

describe("rows", () => {
  it("map the server's classification onto the hi-fi words, capital always starting elsewhere", () => {
    expect(stateOf(row("health").task)).toBe("not-enabled");
    expect(stateOf(row("inspect").task)).toBe("not-offered");
    expect(stateOf(row("allocation-change").task)).toBe("elsewhere");
    expect(stateOf(row("portfolio-create").task)).toBe("elsewhere");
    expect(stateCounts(rows)).toEqual({ all: 24, ready: 0, "not-enabled": 12, elsewhere: 4, "not-offered": 8 });
  });

  it("a CONNECTED task is Ready, and only then", () => {
    const connected: OperatorTask = { ...row("health").task, state: "CONNECTED" };
    expect(stateOf(connected)).toBe("ready");
    expect(stateOf({ ...connected, state: "WIZARD" as never })).toBe("not-offered");
  });

  it("kind follows the group", () => {
    expect(kindOf(row("health").task)).toBe("read");
    expect(kindOf(row("emergency-close").task)).toBe("danger");
    expect(kindOf(row("account-policy").task)).toBe("command");
    expect(kindOf(row("allocation-change").task)).toBe("capital");
  });

  it("joins the catalogue by key, and a missing key joins nothing", () => {
    expect(entryFor(row("account-sync").task, catalogue)?.key).toBe("account/sync");
    expect(entryFor(row("health").task, catalogue)).toBeNull();
    expect(entryFor(row("account-sync").task, null)).toBeNull();
    expect(entryFor({ ...row("account-sync").task, catalogKey: "no/such" }, catalogue)).toBeNull();
  });
});

describe("tiers", () => {
  it("come out in the server's order with the hi-fi names, and a state filter drops empty tiers", () => {
    const all = tiersOf(rows, tasks.taskGroups, "all");
    expect(all.map((t) => t.label)).toEqual(["Read", "Portfolio capital", "Deployment risk", "Account", "Sync and reconciliation", "Emergency"]);
    expect(all.map((t) => t.total)).toEqual([7, 4, 4, 2, 4, 3]);
    expect(tiersOf(rows, tasks.taskGroups, "elsewhere").map((t) => t.label)).toEqual(["Portfolio capital"]);
    expect(tiersOf(rows, tasks.taskGroups, "ready")).toEqual([]);
  });

  it("a group the server did not declare still appears, under its own words", () => {
    const odd = toRows([{ ...row("health").task, taskId: "x", taskGroup: "NEW_GROUP" }], null);
    expect(tiersOf(odd, tasks.taskGroups, "all").map((t) => t.label)).toEqual(["New group"]);
    expect(tierCopy("NEW_GROUP").note).toBe("");
  });
});

describe("first reason it is not live", () => {
  it("reads the task's code and the activation's sentence for the tier it falls in", () => {
    const first = firstReasonFor(row("account-sync").task, activation);
    expect(first.code).toBe("N27_COMMAND_TRANSPORT_NOT_ACTIVATED");
    expect(first.capability).toBe("COMMAND_R2");
    expect(first.sentence).toBe("COMMAND_R2: kill switch engaged");
  });
  it("falls back to the first capability that is not live, in the contract's order", () => {
    expect(firstNotLive(activation)?.capabilityKey).toBe("PROJECTION");
    expect(firstReasonFor(row("health").task, activation).capability).toBe("PROJECTION");
  });
  it("says nothing when the activation was not read, rather than inventing a sentence", () => {
    expect(firstReasonFor(row("account-sync").task, null)).toEqual({ code: "N27_COMMAND_TRANSPORT_NOT_ACTIVATED", sentence: null, capability: null });
  });
  it("a capability is live only with source, runtime and the kill switch released", () => {
    const cap = activation.capabilities[0]!;
    expect(capabilityLive(cap)).toBe(false);
    expect(capabilityLive({ ...cap, sourceEnabled: true, runtimeEnabled: true, killSwitchEngaged: false })).toBe(true);
    expect(capabilityLive({ ...cap, sourceEnabled: true, runtimeEnabled: true, killSwitchEngaged: true })).toBe(false);
    expect(capabilityLive({ ...cap, sourceEnabled: true, runtimeEnabled: false, killSwitchEngaged: false })).toBe(false);
  });
});

describe("plan gate", () => {
  const ws = "ws_1";
  it("allows a plan for a command the catalogue carries", () => {
    expect(planGate(row("account-sync"), ws)).toEqual({ allowed: true, reason: "" });
  });
  it.each([
    ["health", /runs here/],
    ["allocation-change", /begin in Portfolios/],
    ["emergency-close", /second approver and a security key/],
    ["risk-profile", /Not offered in the portal \(SOURCE_ROUTE_MAPPING_AMBIGUOUS\)/],
  ])("refuses %s with its reason", (id, reason) => {
    const gate = planGate(row(id), ws);
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(reason);
  });
  it("refuses without a workspace, and when the catalogue does not carry the key", () => {
    expect(planGate(row("account-sync"), null).reason).toMatch(/workspace/);
    expect(planGate({ ...row("account-sync"), entry: null }, ws).reason).toMatch(/does not carry account\/sync/);
    expect(planGate({ ...row("account-sync"), task: { ...row("account-sync").task, catalogKey: null }, entry: null }, ws).reason).toMatch(/No catalogue key/);
  });
  it("refuses a command the catalogue marks prohibited", () => {
    const entry = { ...row("account-sync").entry!, blockedReason: "GENERIC_REDIS_ACCESS_PROHIBITED" as const };
    expect(planGate({ ...row("account-sync"), entry }, ws).allowed).toBe(false);
  });
});

describe("plan request", () => {
  const form = { environment: "SANDBOX" as const, targetId: " acc_1 ", version: "3", note: "Pause while the broker is checked" };
  it("builds the request from the form: scope word names the target kind, the note rides as the payload", () => {
    const built = planRequest(row("account-sync"), form, "ws_1", "key-1");
    expect(built).toEqual({
      ok: true,
      value: {
        workspaceId: "ws_1",
        requestKey: "key-1",
        commandKey: "account/sync",
        environment: "SANDBOX",
        target: { type: "ACCOUNT", id: "acc_1" },
        expectedTargetVersion: 3,
        payload: { note: "Pause while the broker is checked" },
      },
    });
  });
  it("refuses a short note, a missing target, and a version that is not a whole number from 1", () => {
    expect(formProblem({ ...form, note: "x".repeat(NOTE_MIN - 1) })).toMatch(/at least 12/);
    expect(formProblem({ ...form, targetId: "  " })).toMatch(/target/);
    for (const v of ["", "0", "01", "-1", "1.5", "abc", "1e3", "12345678901"]) expect(formProblem({ ...form, version: v }), v).toMatch(/whole number/);
    expect(formProblem(form)).toBeNull();
  });
  it("never builds a request the gate refuses", () => {
    expect(planRequest(row("emergency-close"), form, "ws_1", "k").ok).toBe(false);
    expect(planRequest(row("account-sync"), form, null, "k").ok).toBe(false);
  });
  it("environment defaults follow the risk tier, and an unknown tier is the safest one", () => {
    expect(defaultEnvironment("R1_PAPER_MUTATION")).toBe("PAPER");
    expect(defaultEnvironment("R2_SANDBOX")).toBe("SANDBOX");
    expect(defaultEnvironment("R3_LIVE_PROTECTIVE")).toBe("LIVE");
    expect(defaultEnvironment(null)).toBe("PAPER");
  });
  it("targetTypeOf takes the first scope word", () => {
    expect(targetTypeOf("account · venue")).toBe("ACCOUNT");
    expect(targetTypeOf("")).toBe("SYSTEM");
  });
});

describe("command state", () => {
  const withStatus = (status: string | null) => ({ ...plan, status });
  it.each([
    [null, "not-started"],
    ["BLOCKED", "preview"],
    ["ACCEPTED", "accepted"],
    ["AWAITING_APPLY", "accepted"],
    ["UNKNOWN", "uncertain"],
    ["UNCERTAIN", "uncertain"],
    ["APPLIED", "applied"],
    ["APPLIED_UNVERIFIED", "catching-up"],
  ])("%s lands on %s", (status, expected) => {
    expect(commandStateOf(status === null ? null : withStatus(status))).toBe(expected);
  });
  it("a status it cannot place is uncertain, never applied", () => {
    for (const s of ["WIZARD", "applied", "", "OK", "SUCCESS", "__proto__"]) expect(commandStateOf(withStatus(s))).toBe("uncertain");
    expect(commandStateOf(withStatus(null))).toBe("uncertain");
  });
  it("the strip has six distinct states", () => {
    expect(COMMAND_STATES).toHaveLength(6);
  });
  it("apply is never offered: its reason follows the plan, then the activation", () => {
    const first = firstReasonFor(row("account-sync").task, activation);
    expect(applyReason(null, first)).toMatch(/Make a plan first/);
    expect(applyReason(plan, first)).toMatch(/relay is disabled/);
    expect(applyReason(plan, first)).toContain("COMMAND_R2: kill switch engaged");
    expect(applyReason({ ...plan, applyToken: "tok", blockers: [], relayCapability: "ENABLED" }, first)).toMatch(/not offered on this page/);
  });
});

describe("L1 matrix: task classification x group x ceremony", () => {
  const base = loadCanonical<Draft>(TASKS);
  const dims = [
    dimension("state", ["tasks", 12, "state"], ["CONNECTED", "SUPPORTED_BUT_INACTIVE", "SEMANTICALLY_INCOMPATIBLE"]),
    dimension("group", ["tasks", 12, "task_group"], ["READ_INSPECT", "PORTFOLIO_CAPITAL", "DEPLOYMENT_RISK", "EMERGENCY_DESTRUCTIVE"]),
    dimension("two_man", ["tasks", 12, "authority", "two_man_rule"], [true, false, ABSENT]),
    dimension("key", ["tasks", 12, "catalog_key"], ["account/sync", "no/such", null]),
  ];
  it("every state reads and never grants a plan the gate would refuse", () => {
    for (const state of pairwise(base, dims)) {
      const read = readOperatorTasks(state.value)!;
      const [r] = toRows([read.tasks[12]!], catalogue);
      const gate = planGate(r!, "ws");
      if (r!.kind === "read" || r!.kind === "capital" || r!.kind === "danger") expect(gate.allowed, state.name).toBe(false);
      if (r!.state === "not-offered") expect(gate.allowed, state.name).toBe(false);
      if (gate.allowed) expect(r!.entry, state.name).not.toBeNull();
    }
  });
});

describe("L3 negative", () => {
  const base = loadCanonical<Draft>(TASKS);
  const cases = [
    ...enumCases(base, ["tasks", 0, "state"], ["CONNECTED", "SUPPORTED_BUT_INACTIVE", "SEMANTICALLY_INCOMPATIBLE"]),
    ...stringCases(base, ["tasks", 0, "task_id"]),
    ...stringCases(base, ["tasks", 0, "task_title"]),
    ...requiredCases(base, [["tasks"], ["task_groups"], ["schema_version"]]),
    ...rootCases(),
  ];
  it("never throws and never leaks; an unknown state is never Ready", () => {
    for (const c of cases) {
      const holder: { out: ReturnType<typeof readOperatorTasks> } = { out: null };
      expect(() => { holder.out = readOperatorTasks(c.value); }, c.name).not.toThrow();
      expect(leaked(holder.out, c.probe), c.name).toBe(false);
      if (holder.out) for (const t of holder.out.tasks) if (stateOf(t) === "ready") expect(t.state, c.name).toBe("CONNECTED");
    }
    expect(prototypeIsClean()).toBe(true);
  });
});
