/**
 * Portfolio 360 Actions rail · the caller's own eligibility (DEBT-UXM07-011, W6; FE-015/060).
 *
 * Lane: FIXTURE_LAB. The batch bodies are built from the canonical `execution-access` batch case (session block, challenges, clock)
 * with the rail's own question swapped in, then read through the REAL strict reader (`readAccessEligibilityBatch`); the port is a
 * spy. Nothing here is a runtime read.
 *
 * What the rail may and may not do, each pinned:
 * - ask only while it is open and the address names a workspace, exactly one question, never polled;
 * - word the server's rows (ALLOWED / UNAVAILABLE reason classes) and NEVER enable a control, whatever the rows say;
 * - keep "Not published: per-row eligibility and the reason a control is off" for the three controls with no action in the vocabulary, naming the missing item;
 * - show nothing of an old scope, a refused read, a body for another question, a shape it does not read or an expired body;
 * - retry only on the user's word.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PF } from "../../../../../../e2e/bffDoublePortfolios";
import type { ExecutionApi, Result } from "../../../../api/ports";
import { ELIGIBILITY_ACTION_RULES, type EligibilityAction } from "../../../readers/accessSelf";
import { readAccessEligibilityBatch, type AccessEligibilityBatchRead } from "../../../readers/accessSelfBatch";
import { loadCanonical } from "../../../testkit/loadCanonical";
import type { Draft } from "../../../testkit/matrix";
import { makeApi } from "../harness.fixtures";
import PortfolioScreen from "./index";
import { ELIGIBILITY_REASON_COPY, RAIL_ELIGIBILITY_ACTIONS, RAIL_ELIGIBILITY_MAP, RAIL_PREVIEW_NOTE, railControlReason } from "./railEligibility";

const NOW = 1_792_094_400_000;

// Only `Date` is faked by default (so waitFor keeps its timers): the canonical bodies carry a 2026-10 clock, and the page's own
// clock must sit inside their ceiling for a read to count as live.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW + 1_000);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const FILE = loadCanonical<{ batch_cases: { case_name: string; value: Draft }[] }>("execution-access.synthetic");
const CANON = (FILE.batch_cases.find((c) => c.case_name === "STEP_UP_REQUIRED_NOT_ACTIVE") as { value: Draft }).value;

type Answer = "ALLOWED" | "NO_CURRENT_PERMISSION" | "POLICY_PENDING" | "FIELD_POLICY_PENDING";

/** The wire row for `action` on a PORTFOLIO: the rule fixes family and step-up, the answer fixes the rest. */
function wireRow(action: EligibilityAction, answer: Answer): Draft {
  const rule = ELIGIBILITY_ACTION_RULES[action];
  const allowed = answer === "ALLOWED";
  const stepUpState = rule.stepUp === false ? "NOT_REQUIRED" : rule.stepUp === null ? "PLAN_DEPENDENT" : "REQUIRED";
  return {
    action, permission: allowed ? "ALLOWED" : "UNAVAILABLE", reason_class: allowed ? "FAMILY_CHECK_REQUIRED" : answer,
    public_copy_key: allowed ? "FAMILY_CHECK_REQUIRED" : answer, grant_ref: allowed ? "grant_TEST_ONLY_1" : null,
    authority_mode: allowed ? "APP_ONLY" : "NOT_ESTABLISHED", step_up_required: rule.stepUp, step_up_freshness: "NOT_CHECKED",
    challenge_availability: "NOT_CHECKED", command_readiness: "NOT_CHECKED", family_check: rule.family, step_up_state: stepUpState,
  };
}

interface BodyOptions {
  workspace?: string;
  environment?: string;
  portfolio?: string;
  answers?: Partial<Record<EligibilityAction, Answer>>;
  /** Observed and ceiling, in ms from the injected clock. */
  observed?: number;
  until?: number;
  mutate?: (body: Draft) => void;
}

function body(options: BodyOptions = {}): Draft {
  const out = structuredClone(CANON) as Draft;
  out.workspace_id = options.workspace ?? "ws_1";
  out.environment = options.environment ?? "live";
  out.observed_at_ms = options.observed ?? NOW;
  out.valid_until_ms = options.until ?? NOW + 60_000;
  // The canonical session block stays: NOT_ACTIVE, so no ACTIVE ceiling to keep inside the new clock.
  out.results = [{
    resource: { kind: "PORTFOLIO", id: options.portfolio ?? PF.core },
    actions: RAIL_ELIGIBILITY_ACTIONS.map((action) => wireRow(action, options.answers?.[action] ?? "NO_CURRENT_PERMISSION")),
  }];
  options.mutate?.(out);
  return out;
}

const read = (raw: Draft): Result<AccessEligibilityBatchRead> => {
  const value = readAccessEligibilityBatch(raw);
  return value === null ? { ok: false, status: "unavailable", reason: "The eligibility batch response could not be read." } : { ok: true, value };
};

function mount(batch: ExecutionApi["getSelfEligibilityBatch"], query = "?workspace_id=ws_1&sel=rail:actions") {
  const base = makeApi().api;
  const api = { ...base, getSelfEligibilityBatch: batch } as unknown as ExecutionApi;
  const view = render(
    <MemoryRouter initialEntries={[`/deployments/portfolios/${PF.core}${query}`]}>
      <PortfolioScreen api={api} portfolioId={PF.core} />
      <Where />
    </MemoryRouter>,
  );
  return view;
}

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}
const search = () => new URLSearchParams((screen.getByTestId("where").textContent ?? "").split("?")[1] ?? "");

const rail = () => screen.getByRole("complementary", { name: "Actions" });
// One list item per action. An action the caller's grant ALLOWS wears "Review available" and a Review button (a preview of published figures,
// WP-F1), with the sentence in a note beside it; every other control is off and describes itself by its reason.
const item = (name: string) => within(rail()).getByText(name, { selector: "strong" }).closest("li") as HTMLElement;
const control = (name: string) => item(name).querySelector("button") as HTMLButtonElement;
const reasonOf = (name: string) => {
  const id = control(name).getAttribute("aria-describedby");
  if (id !== null) return document.getElementById(id)!.textContent ?? "";
  return [...item(name).querySelectorAll("p.exec-pf-note")].map((p) => p.textContent).join(" ");
};
const openedRail = () => screen.findByRole("complementary", { name: "Actions" });
const settled = (name: string, text: string | RegExp) => waitFor(() => expect(reasonOf(name)).toMatch(text));

describe("the table", () => {
  it("asks about five distinct capital actions and none twice; three controls have no action of their own", () => {
    expect(RAIL_ELIGIBILITY_ACTIONS).toEqual([
      "capital.initial_grant", "capital.top_up", "capital.recall_partial", "capital.recall_full", "capital.adjust_target_budget",
    ]);
    expect(new Set(RAIL_ELIGIBILITY_ACTIONS).size).toBe(RAIL_ELIGIBILITY_ACTIONS.length);
    expect(Object.entries(RAIL_ELIGIBILITY_MAP).filter(([, m]) => m.actions.length === 0).map(([id]) => id)).toEqual(["return", "lock", "deploy"]);
    // The vocabulary really has these actions and they take a PORTFOLIO (the reader would refuse otherwise).
    for (const action of RAIL_ELIGIBILITY_ACTIONS) expect(ELIGIBILITY_ACTION_RULES[action]).toBeDefined();
  });

  it("every reason class has words, and an unknown phase never leaves a control without a sentence", () => {
    for (const text of Object.values(ELIGIBILITY_REASON_COPY)) expect(text.length).toBeGreaterThan(10);
    for (const control of ["grant", "recall", "target", "return", "lock", "deploy"] as const) {
      for (const view of [
        { phase: "idle", reason: "x" }, { phase: "loading" }, { phase: "denied", reason: "d" }, { phase: "unavailable", reason: "u" }, { phase: "expired", reason: "e" },
      ] as const) expect(railControlReason(control, view).length).toBeGreaterThan(0);
    }
  });
});

describe("when it asks", () => {
  it("asks nothing before the rail is open, and nothing when the address names no workspace", async () => {
    const batch = vi.fn(async () => read(body()));
    mount(batch, "?workspace_id=ws_1");
    await screen.findByRole("tablist", { name: "Portfolio sections" });
    expect(batch).not.toHaveBeenCalled();
    cleanup();
    const none = vi.fn(async () => read(body()));
    mount(none, "?sel=rail:actions");
    await openedRail();
    expect(none).not.toHaveBeenCalled();
    // The three controls with a mapping say what happened; the three without keep their typed absence.
    for (const name of ["Grant budget", "Recall budget", "Set target budget"]) expect(reasonOf(name)).toMatch(/names no workspace/);
    for (const name of ["Return capital", "Lock allocation", "Deploy version"]) expect(reasonOf(name)).toContain("Not published: per-row eligibility and the reason a control is off");
  });

  it("asks one question when the rail opens, with the page's workspace and environment, and does not poll", async () => {
    const batch = vi.fn(async () => read(body({ environment: "paper" })));
    mount(batch, "?workspace_id=ws_1&env=paper&sel=rail:actions");
    await openedRail();
    await waitFor(() => expect(batch).toHaveBeenCalledTimes(1));
    expect((batch.mock.calls as unknown[][])[0]![0]).toEqual({
      workspaceId: "ws_1", environment: "paper", resources: [{ kind: "PORTFOLIO", id: PF.core }], actions: RAIL_ELIGIBILITY_ACTIONS,
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(batch).toHaveBeenCalledTimes(1);
  });

  it("opening the rail from the Actions button asks then, and closing it drops the sentence", async () => {
    const batch = vi.fn(async () => read(body()));
    mount(batch, "?workspace_id=ws_1");
    await screen.findByRole("tablist", { name: "Portfolio sections" });
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    await waitFor(() => expect(search().get("sel")).toBe("rail:actions"));
    await settled("Grant budget", /You don't have access to this action here/);
    expect(batch).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(search().has("sel")).toBe(false));
    expect(screen.queryByRole("complementary", { name: "Actions" })).toBeNull();
  });
});

describe("what it says", () => {
  it("words the server's rows per control, joined for the controls that stand for two actions", async () => {
    const batch = vi.fn(async () => read(body({ answers: {
      "capital.initial_grant": "ALLOWED", "capital.top_up": "NO_CURRENT_PERMISSION", "capital.recall_partial": "POLICY_PENDING",
      "capital.recall_full": "FIELD_POLICY_PENDING", "capital.adjust_target_budget": "ALLOWED",
    } })));
    mount(batch);
    await openedRail();
    await settled("Grant budget", /Initial grant: you hold a current grant/);
    expect(reasonOf("Grant budget")).toContain(`${RAIL_PREVIEW_NOTE} (FE-020)`);
    expect(reasonOf("Grant budget")).toContain(`Top up: ${ELIGIBILITY_REASON_COPY.NO_CURRENT_PERMISSION}`);
    expect(reasonOf("Recall budget")).toBe(`Partial recall: ${ELIGIBILITY_REASON_COPY.POLICY_PENDING} · Full recall: ${ELIGIBILITY_REASON_COPY.FIELD_POLICY_PENDING}`);
    expect(reasonOf("Set target budget")).toContain("Target budget: you hold a current grant");
  });

  it("an ALLOWED row offers a REVIEW of published figures and nothing else: no apply, no submit, no reserve; the three controls with no action stay off", async () => {
    const everything = Object.fromEntries(RAIL_ELIGIBILITY_ACTIONS.map((a) => [a, "ALLOWED"])) as Partial<Record<EligibilityAction, Answer>>;
    mount(vi.fn(async () => read(body({ answers: everything }))));
    await openedRail();
    await settled("Grant budget", /you hold a current grant/);
    for (const [name, review] of [["Grant budget", "Review grant"], ["Recall budget", "Review recall"], ["Set target budget", "Review target"]] as const) {
      expect(within(item(name)).getByText("Review available"), name).toBeTruthy();
      expect(control(name).textContent, name).toBe(review);
      expect(control(name).disabled, name).toBe(false);
      expect(reasonOf(name), name).toContain(`${RAIL_PREVIEW_NOTE} (FE-020)`);
    }
    for (const name of ["Return capital", "Lock allocation", "Deploy version"] as const) {
      expect(control(name).disabled, name).toBe(true);
      expect(reasonOf(name).length, name).toBeGreaterThan(0);
    }
    // Nothing in the rail can send: there is no submit, apply, reserve or confirm control, whatever the batch says.
    expect(within(rail()).queryByRole("button", { name: /Submit|Apply|Reserve|Confirm|Send|Preview$/ })).toBeNull();
  });

  it("Review opens a PREVIEW, NOT RECORDED: the published figures now, the result as Not published: command preview (the Preview only intent axis), no computed 'after'; Close review closes it", async () => {
    mount(vi.fn(async () => read(body({ answers: { "capital.initial_grant": "ALLOWED" } }))));
    await openedRail();
    await settled("Grant budget", /you hold a current grant/);
    fireEvent.click(control("Grant budget"));
    const review = await screen.findByTestId("rail-review");
    expect(review.textContent).toContain("Preview · not recorded");
    expect(review.textContent).toContain("Nothing is applied, reserved or recorded. Sending is not enabled.");
    // The test page's dataset is not served, so no figure is published: the panel says so and still names the missing result.
    expect(review.textContent).toContain("Not published: command preview (the Preview only intent axis)");
    expect(control("Grant budget").getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(within(review).getByRole("button", { name: "Close review" }));
    expect(screen.queryByTestId("rail-review")).toBeNull();
  });

  it("the three controls with no action keep Not published: per-row eligibility and the reason a control is off and name what is missing, whatever the batch says", async () => {
    mount(vi.fn(async () => read(body({ answers: { "capital.initial_grant": "ALLOWED" } }))));
    await openedRail();
    await settled("Grant budget", /you hold a current grant/);
    expect(reasonOf("Return capital")).toBe("Not published: per-row eligibility and the reason a control is off. The eligibility vocabulary has no action for returning capital.");
    expect(reasonOf("Lock allocation")).toContain("locking an allocation");
    expect(reasonOf("Deploy version")).toContain("deployment.register registers an instance");
  });

  it("prints no raw reason class, grant reference or permission word", async () => {
    mount(vi.fn(async () => read(body({ answers: { "capital.initial_grant": "ALLOWED" } }))));
    await openedRail();
    await settled("Grant budget", /you hold a current grant/);
    const text = rail().textContent ?? "";
    expect(text).not.toMatch(/NO_CURRENT_PERMISSION|POLICY_PENDING|FAMILY_CHECK_REQUIRED|grant_TEST_ONLY_1|APP_ONLY|PASSWORD_REAUTH/);
  });
});

describe("what it refuses to show", () => {
  it("a refused read (403) says what the Portal said, offers Read again, and a second read can recover", async () => {
    const batch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: "denied", reason: "The eligibility batch: HTTP 403" })
      .mockResolvedValueOnce(read(body({ answers: { "capital.initial_grant": "ALLOWED" } })));
    mount(batch);
    await openedRail();
    await settled("Grant budget", /HTTP 403/);
    expect(control("Recall budget").disabled).toBe(true);
    fireEvent.click(within(rail()).getByRole("button", { name: "Read again" }));
    await settled("Grant budget", /you hold a current grant/);
    expect(batch).toHaveBeenCalledTimes(2);
    expect(within(rail()).queryByRole("button", { name: "Read again" })).toBeNull();
  });

  it("an unavailable read is not 'not allowed': no row is invented", async () => {
    mount(vi.fn(async () => ({ ok: false as const, status: "unavailable" as const, reason: "The eligibility batch: HTTP 503" })));
    await openedRail();
    await settled("Grant budget", /HTTP 503/);
    expect(rail().textContent).not.toContain(ELIGIBILITY_REASON_COPY.NO_CURRENT_PERMISSION);
  });

  it("a body for another workspace, environment, resource or action set is not shown", async () => {
    for (const [name, options] of [
      ["another workspace", { workspace: "ws_OTHER" }],
      ["another environment", { environment: "paper" }],
      ["another portfolio", { portfolio: "pf_OTHER" }],
    ] as const) {
      mount(vi.fn(async () => read(body(options))), "?workspace_id=ws_1&env=live&sel=rail:actions");
      await openedRail();
      await settled("Grant budget", /answered another question/);
      expect(rail().textContent, name).not.toContain(ELIGIBILITY_REASON_COPY.NO_CURRENT_PERMISSION);
      cleanup();
    }
    const short = vi.fn(async () => read(body({ mutate: (b) => { (b.results as Draft[])[0]!.actions = (b.results as Draft[])[0]!.actions.slice(0, 2); } })));
    mount(short);
    await openedRail();
    await settled("Grant budget", /answered another question/);
  });

  it("a body of another schema version, and a body the strict reader refuses, are unavailable", async () => {
    mount(vi.fn(async () => read(body({ mutate: (b) => { b.schema_version = "portal.self-eligibility-batch.v1"; } }))));
    await openedRail();
    await settled("Grant budget", /shape this build does not read/);
    cleanup();
    mount(vi.fn(async () => read(body({ mutate: (b) => { delete b.session_step_up; } }))));
    await openedRail();
    await settled("Grant budget", /could not be read/);
  });

  it("a body whose ceiling has passed is not shown, and one that passes while open is dropped", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(NOW + 120_000);
    mount(vi.fn(async () => read(body())));
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(reasonOf("Grant budget")).toMatch(/ended and is no longer shown/);
    cleanup();

    vi.setSystemTime(NOW + 1_000);
    mount(vi.fn(async () => read(body({ answers: { "capital.initial_grant": "ALLOWED" } }))));
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(reasonOf("Grant budget")).toMatch(/you hold a current grant/);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(reasonOf("Grant budget")).toMatch(/ended and is no longer shown/);
    expect(rail().textContent).not.toMatch(/you hold a current grant/);
  });

  it("a late answer for a rail that was closed is dropped", async () => {
    const releases: ((value: Result<AccessEligibilityBatchRead>) => void)[] = [];
    const batch = vi.fn(() => new Promise<Result<AccessEligibilityBatchRead>>((resolve) => { releases.push(resolve); }));
    mount(batch);
    await openedRail();
    expect(reasonOf("Grant budget")).toMatch(/Reading what you may do here/);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(search().has("sel")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    await openedRail();
    // The first question is over; the answer to it lands now and must not appear.
    expect(releases).toHaveLength(2);
    await act(async () => { releases[0]!(read(body({ answers: { "capital.initial_grant": "ALLOWED" } }))); });
    expect(rail().textContent).not.toMatch(/you hold a current grant/);
    expect(reasonOf("Grant budget")).toMatch(/Reading what you may do here/);
    // The second question is the live one.
    await act(async () => { releases[1]!(read(body({ answers: { "capital.top_up": "ALLOWED" } }))); });
    await settled("Grant budget", /Top up: you hold a current grant/);
    expect(batch).toHaveBeenCalledTimes(2);
  });

  it("a thrown read is unavailable, not a crash", async () => {
    mount(vi.fn(async () => { throw new Error("boom"); }));
    await openedRail();
    await settled("Grant budget", /could not be completed/);
  });
});
