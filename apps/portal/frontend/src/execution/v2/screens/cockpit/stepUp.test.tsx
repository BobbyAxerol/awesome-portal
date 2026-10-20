/**
 * FE-015/060 (BE-P7) · the cockpit step-up: when a control may OFFER a password re-check, and what the block does with the answers.
 *
 * Bodies are the canonical `execution-access` batch case (STEP_UP_REQUIRED_NOT_ACTIVE / STEP_UP_ACTIVE) read through the strict
 * reader, narrowed to the one resource and action the block asks about. The port is a recording fake. Lane: FIXTURE_LAB.
 * Nothing here enables a control: the block prints sentences and, for a re-check, a password field and a Confirm button.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ExecutionApi, Result } from "../../../api/ports";
import {
  readAccessEligibilityBatch, STEP_UP_PRECONDITIONS, type AccessEligibilityBatchRead, type BatchEligibilityRow, type BatchSessionStepUp,
} from "../../readers/accessSelfBatch";
import type { AccessStepUp, AccessStepUpInput, SessionStepUpOutcome } from "../../readers/accessStepUp";
import { loadCanonical } from "../../testkit/loadCanonical";
import { StepUpBlock } from "./StepUp";
import { Rail } from "./Rail";
import { NO_PRINCIPAL, STEP_UP_COPY, stepUpOffer, stepUpRefusalText } from "./laneModel";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

type Draft = any;
const FILE = loadCanonical<{ batch_cases: { case_name: string; value: Draft }[] }>("execution-access.synthetic");
const CASE = (name: string): Draft => structuredClone(FILE.batch_cases.find((c) => c.case_name === name)!.value);
const SECRET = "TEST_ONLY_hunter2-pw";

/** One resource, one action (capital.top_up), as the block asks. `edit` may change the raw body before it is read. */
function batchRead(name: "STEP_UP_REQUIRED_NOT_ACTIVE" | "STEP_UP_ACTIVE", edit: (raw: Draft) => void = () => {}): Result<AccessEligibilityBatchRead> {
  const raw = CASE(name);
  raw.results = [{ resource: raw.results[0].resource, actions: [raw.results[0].actions[1]] }];
  edit(raw);
  const read = readAccessEligibilityBatch(raw);
  if (read === null) throw new Error(`the ${name} body did not read`);
  return { ok: true, value: read };
}

const QUESTION = { workspaceId: "ws_TEST_ONLY", environment: "paper", resource: { kind: "PORTFOLIO", id: "portfolio_TEST_ONLY" }, action: "capital.top_up" } as const;

interface Fake {
  api: Pick<ExecutionApi, "getSelfEligibilityBatch" | "postSessionStepUp">;
  batch: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
}
function fakeApi(
  batches: (call: number) => Result<AccessEligibilityBatchRead> | Promise<Result<AccessEligibilityBatchRead>>,
  post: (input: AccessStepUpInput, call: number) => SessionStepUpOutcome | Promise<SessionStepUpOutcome> = () => ({ kind: "unavailable", reason: "x" }),
): Fake {
  let b = 0;
  let p = 0;
  const batch = vi.fn(async () => batches(++b));
  const postFn = vi.fn(async (input: AccessStepUpInput) => post(input, ++p));
  return { api: { getSelfEligibilityBatch: batch, postSessionStepUp: postFn } as unknown as Fake["api"], batch, post: postFn };
}
const okOutcome = (family: AccessStepUp["family"]): SessionStepUpOutcome => ({ kind: "ok", stepUp: { state: "ACTIVE", family, expiresAtMs: 1792094403000 } });
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
};

const field = () => screen.getByLabelText(STEP_UP_COPY.passwordLabel) as HTMLInputElement;
const confirm = () => screen.getByRole("button", { name: /Confirm|Checking/ }) as HTMLButtonElement;
const group = () => screen.getByRole("group", { name: "Step-up confirmation" });
const mount = (fake: Fake, overrides: Partial<Parameters<typeof StepUpBlock>[0]> = {}) =>
  render(<StepUpBlock api={fake.api} {...QUESTION} format={(ms) => `T${ms}`} {...overrides} />);

/* ── the pure rule ──────────────────────────────────────────────────────────────────────────────────────────────────────── */

const row = (patch: Partial<BatchEligibilityRow>): BatchEligibilityRow => ({ ...(batchRowOf("STEP_UP_REQUIRED_NOT_ACTIVE")), ...patch } as BatchEligibilityRow);
function batchRowOf(name: "STEP_UP_REQUIRED_NOT_ACTIVE" | "STEP_UP_ACTIVE"): BatchEligibilityRow {
  const result = batchRead(name);
  if (!result.ok || result.value.kind !== "eligibility_batch") throw new Error("unreadable");
  return result.value.batch.results[0]!.actions[0]!;
}
const challenge = (family: "CAPITAL_COMMAND" | "ACCESS_ADMIN", preconditionMet: boolean) =>
  ({ family, mechanism: "PASSWORD_REAUTH", route: "/api/admin/profile-access/v2/step-up", precondition: STEP_UP_PRECONDITIONS[family], preconditionMet }) as const;
const session = (capital: boolean, access: boolean, active = false): BatchSessionStepUp => ({
  state: active ? "ACTIVE" : "NOT_ACTIVE", validUntilMs: active ? 1792094403000 : null,
  challenges: [challenge("CAPITAL_COMMAND", capital), challenge("ACCESS_ADMIN", access)],
});

describe("stepUpOffer · the rule", () => {
  it("a capital-only actor (capital met, access-admin unmet) is offered a CAPITAL_COMMAND re-check", () => {
    expect(stepUpOffer(batchRowOf("STEP_UP_REQUIRED_NOT_ACTIVE"), session(true, false))).toEqual({ kind: "reauth", family: "CAPITAL_COMMAND" });
  });

  it("prefers CAPITAL_COMMAND when both are met", () => {
    expect(stepUpOffer(batchRowOf("STEP_UP_REQUIRED_NOT_ACTIVE"), session(true, true))).toEqual({ kind: "reauth", family: "CAPITAL_COMMAND" });
  });

  it("falls back to ACCESS_ADMIN only when that is the challenge that is met", () => {
    expect(stepUpOffer(batchRowOf("STEP_UP_REQUIRED_NOT_ACTIVE"), session(false, true))).toEqual({ kind: "reauth", family: "ACCESS_ADMIN" });
  });

  it("no challenge met: no offer, and the reason is a sentence", () => {
    expect(stepUpOffer(batchRowOf("STEP_UP_REQUIRED_NOT_ACTIVE"), session(false, false))).toEqual({
      kind: "none", why: "NO_CHALLENGE", text: STEP_UP_COPY.noChallenge, activeUntilMs: null,
    });
  });

  it("only an ALLOWED + REQUIRED row can be offered: every other state is a plain sentence", () => {
    const required = batchRowOf("STEP_UP_REQUIRED_NOT_ACTIVE");
    const unavailable = row({ permission: "UNAVAILABLE", reasonClass: "NO_CURRENT_PERMISSION", publicCopyKey: "NO_CURRENT_PERMISSION", grantRef: null, authorityMode: "NOT_ESTABLISHED" } as Partial<BatchEligibilityRow>);
    expect(stepUpOffer(unavailable, session(true, true))).toMatchObject({ kind: "none", why: "NOT_ALLOWED" });
    expect(stepUpOffer({ ...required, stepUpState: "NOT_REQUIRED" }, session(true, true))).toMatchObject({ kind: "none", why: "NOT_REQUIRED", text: STEP_UP_COPY.notRequired });
    expect(stepUpOffer({ ...required, stepUpState: "PLAN_DEPENDENT" }, session(true, true))).toMatchObject({ kind: "none", why: "PLAN_DEPENDENT", text: STEP_UP_COPY.planDecides });
    expect(stepUpOffer({ ...required, stepUpState: "ACTIVE" }, session(true, true, true))).toEqual({ kind: "none", why: "ACTIVE", text: "", activeUntilMs: 1792094403000 });
    expect(stepUpOffer(undefined, session(true, true))).toMatchObject({ kind: "none", why: "NO_ROW" });
  });

  it("the three refusals BE-P7 names have their own sentence; any other code is shown as the Portal's own word", () => {
    expect(stepUpRefusalText("STEP_UP_REJECTED")).toBe(STEP_UP_COPY.rejected);
    expect(stepUpRefusalText("ACCESS_DENIED")).toBe(STEP_UP_COPY.denied);
    expect(stepUpRefusalText("CURRENT_ACTOR_AUTHORITY_REQUIRED")).toBe(STEP_UP_COPY.authorityChanged);
    expect(stepUpRefusalText("RATE_LIMITED")).toBe("The Portal refused the step-up (RATE_LIMITED).");
    expect(stepUpRefusalText(null)).toBe("The Portal refused the step-up.");
  });
});

/* ── the block ──────────────────────────────────────────────────────────────────────────────────────────────────────────── */

describe("StepUpBlock · offer", () => {
  it("a capital-only actor (the canonical REQUIRED case) is offered the re-check, and the POST names CAPITAL_COMMAND", async () => {
    const fake = fakeApi(() => batchRead("STEP_UP_REQUIRED_NOT_ACTIVE"), () => okOutcome("CAPITAL_COMMAND"));
    mount(fake);
    await waitFor(() => expect(field()).toBeTruthy());
    expect(group().textContent).toContain(STEP_UP_COPY.needsRecheck);
    expect(confirm().disabled).toBe(true); // nothing typed
    expect(confirm().title).toBe(STEP_UP_COPY.enterFirst);
    fireEvent.change(field(), { target: { value: SECRET } });
    fireEvent.click(confirm());
    await waitFor(() => expect(fake.post).toHaveBeenCalledTimes(1));
    expect(fake.post).toHaveBeenCalledWith({ workspaceId: "ws_TEST_ONLY", family: "CAPITAL_COMMAND", password: SECRET });
  });

  it("the batch is asked for exactly the one resource and action, in the selected environment", async () => {
    const fake = fakeApi(() => batchRead("STEP_UP_REQUIRED_NOT_ACTIVE"));
    mount(fake);
    await waitFor(() => expect(fake.batch).toHaveBeenCalledTimes(1));
    expect(fake.batch).toHaveBeenCalledWith({
      workspaceId: "ws_TEST_ONLY", environment: "paper", resources: [{ kind: "PORTFOLIO", id: "portfolio_TEST_ONLY" }], actions: ["capital.top_up"],
    });
  });

  it("no challenge met: no password field, no button, and the reason is printed", async () => {
    const fake = fakeApi(() => {
      const result = batchRead("STEP_UP_REQUIRED_NOT_ACTIVE");
      if (!result.ok || result.value.kind !== "eligibility_batch") throw new Error("x");
      // A hand-built answer (the strict reader would void it): both challenges unmet beside a REQUIRED row.
      const batch = result.value.batch;
      return { ok: true, value: { kind: "eligibility_batch", batch: { ...batch, sessionStepUp: session(false, false) } } };
    });
    mount(fake);
    await waitFor(() => expect(group().textContent).toContain(STEP_UP_COPY.noChallenge));
    expect(screen.queryByLabelText(STEP_UP_COPY.passwordLabel)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("an ACTIVE session says until when, from the batch, and offers nothing", async () => {
    const fake = fakeApi(() => batchRead("STEP_UP_ACTIVE"));
    mount(fake);
    await waitFor(() => expect(group().textContent).toContain(STEP_UP_COPY.activeUntil("T1792094403000")));
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("a read that failed prints that, never 'required': no field, no button", async () => {
    const fake = fakeApi(() => ({ ok: false, status: "unavailable", reason: "down" }));
    mount(fake);
    await waitFor(() => expect(group().textContent).toContain(STEP_UP_COPY.unread));
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("a batch that answers another question than the one asked is unread, not shown", async () => {
    const fake = fakeApi(() => batchRead("STEP_UP_REQUIRED_NOT_ACTIVE"));
    mount(fake, { resource: { kind: "PORTFOLIO", id: "someone_else" } });
    await waitFor(() => expect(group().textContent).toContain(STEP_UP_COPY.unread));
  });
});

describe("StepUpBlock · the password", () => {
  it("is sent in the one POST and nowhere else: not in the batch ask, the DOM, storage or the next ask", async () => {
    const fake = fakeApi(() => batchRead("STEP_UP_REQUIRED_NOT_ACTIVE"), () => okOutcome("CAPITAL_COMMAND"));
    const { container } = mount(fake);
    await waitFor(() => expect(field()).toBeTruthy());
    fireEvent.change(field(), { target: { value: SECRET } });
    fireEvent.click(confirm());
    await waitFor(() => expect(fake.batch).toHaveBeenCalledTimes(2)); // the re-read after the 200
    expect(JSON.stringify(fake.batch.mock.calls)).not.toContain(SECRET);
    expect(fake.post.mock.calls.filter((call) => JSON.stringify(call).includes(SECRET))).toHaveLength(1);
    expect(field().value).toBe("");
    expect(container.innerHTML).not.toContain(SECRET);
    expect(JSON.stringify({ ...window.localStorage })).not.toContain(SECRET);
    expect(JSON.stringify({ ...window.sessionStorage })).not.toContain(SECRET);
  });

  it("is cleared the moment it is submitted, before the server answers", async () => {
    const wait = deferred<SessionStepUpOutcome>();
    const fake = fakeApi(() => batchRead("STEP_UP_REQUIRED_NOT_ACTIVE"), () => wait.promise);
    mount(fake);
    await waitFor(() => expect(field()).toBeTruthy());
    fireEvent.change(field(), { target: { value: SECRET } });
    fireEvent.click(confirm());
    await waitFor(() => expect(confirm().textContent).toBe(STEP_UP_COPY.checking));
    expect(field().value).toBe("");
    expect(confirm().disabled).toBe(true);
    expect(confirm().title).toBe(STEP_UP_COPY.withServer);
    await act(async () => wait.resolve(okOutcome("CAPITAL_COMMAND")));
  });

  it("a second submit while the first is with the server sends nothing (single flight)", async () => {
    const wait = deferred<SessionStepUpOutcome>();
    const fake = fakeApi(() => batchRead("STEP_UP_REQUIRED_NOT_ACTIVE"), () => wait.promise);
    mount(fake);
    await waitFor(() => expect(field()).toBeTruthy());
    fireEvent.change(field(), { target: { value: SECRET } });
    fireEvent.submit(field().closest("form")!);
    fireEvent.change(field(), { target: { value: `${SECRET}2` } });
    fireEvent.submit(field().closest("form")!);
    await act(async () => wait.resolve(okOutcome("CAPITAL_COMMAND")));
    expect(fake.post).toHaveBeenCalledTimes(1);
  });
});

describe("StepUpBlock · after the answer", () => {
  it("a 200 is NOT an ACTIVE row: it re-reads the batch and prints what that says (still required)", async () => {
    const fake = fakeApi(() => batchRead("STEP_UP_REQUIRED_NOT_ACTIVE"), () => okOutcome("CAPITAL_COMMAND"));
    mount(fake);
    await waitFor(() => expect(field()).toBeTruthy());
    fireEvent.change(field(), { target: { value: SECRET } });
    fireEvent.click(confirm());
    await waitFor(() => expect(fake.batch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(field().value).toBe(""));
    expect(group().textContent).not.toContain("active step-up");
    expect(group().textContent).toContain(STEP_UP_COPY.needsRecheck); // the batch still says REQUIRED
  });

  it("when the re-read says ACTIVE, that is what is printed", async () => {
    const fake = fakeApi((call) => batchRead(call === 1 ? "STEP_UP_REQUIRED_NOT_ACTIVE" : "STEP_UP_ACTIVE"), () => okOutcome("CAPITAL_COMMAND"));
    mount(fake);
    await waitFor(() => expect(field()).toBeTruthy());
    fireEvent.change(field(), { target: { value: SECRET } });
    fireEvent.click(confirm());
    await waitFor(() => expect(group().textContent).toContain(STEP_UP_COPY.activeUntil("T1792094403000")));
    expect(screen.queryByLabelText(STEP_UP_COPY.passwordLabel)).toBeNull();
  });

  it.each([
    ["STEP_UP_REJECTED", STEP_UP_COPY.rejected],
    ["ACCESS_DENIED", STEP_UP_COPY.denied],
    ["CURRENT_ACTOR_AUTHORITY_REQUIRED", STEP_UP_COPY.authorityChanged],
  ])("%s is its own sentence, and the precondition is re-read (it may be gone)", async (code, sentence) => {
    const fake = fakeApi(() => batchRead("STEP_UP_REQUIRED_NOT_ACTIVE"), () => ({ kind: "refused", status: 403, code }));
    mount(fake);
    await waitFor(() => expect(field()).toBeTruthy());
    fireEvent.change(field(), { target: { value: SECRET } });
    fireEvent.click(confirm());
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(sentence));
    expect(fake.batch).toHaveBeenCalledTimes(2);
    expect(field().value).toBe(""); // a wrong password is retyped, never kept
  });

  it("an answer for the OTHER family is refused: nothing is confirmed and the batch is not read again", async () => {
    const fake = fakeApi(() => batchRead("STEP_UP_REQUIRED_NOT_ACTIVE"), () => okOutcome("ACCESS_ADMIN"));
    mount(fake);
    await waitFor(() => expect(field()).toBeTruthy());
    fireEvent.change(field(), { target: { value: SECRET } });
    fireEvent.click(confirm());
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(STEP_UP_COPY.wrongFamily));
    expect(fake.batch).toHaveBeenCalledTimes(1);
  });

  it("an unavailable answer says nothing was confirmed", async () => {
    const fake = fakeApi(() => batchRead("STEP_UP_REQUIRED_NOT_ACTIVE"), () => ({ kind: "unavailable", reason: "network" }));
    mount(fake);
    await waitFor(() => expect(field()).toBeTruthy());
    fireEvent.change(field(), { target: { value: SECRET } });
    fireEvent.click(confirm());
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(STEP_UP_COPY.notCompleted));
  });
});

describe("StepUpBlock · late answers", () => {
  it("a step-up answer that arrives after the scope changed is dropped (no alert, no re-read, no state)", async () => {
    const wait = deferred<SessionStepUpOutcome>();
    const fake = fakeApi(() => batchRead("STEP_UP_REQUIRED_NOT_ACTIVE"), () => wait.promise);
    const view = mount(fake);
    await waitFor(() => expect(field()).toBeTruthy());
    fireEvent.change(field(), { target: { value: SECRET } });
    fireEvent.click(confirm());
    await waitFor(() => expect(fake.post).toHaveBeenCalledTimes(1));
    view.rerender(<StepUpBlock api={fake.api} {...QUESTION} workspaceId="ws_other" format={(ms) => `T${ms}`} />);
    await waitFor(() => expect(fake.batch).toHaveBeenCalledTimes(2)); // the new scope's own first read
    await act(async () => wait.resolve({ kind: "refused", status: 403, code: "STEP_UP_REJECTED" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(fake.batch).toHaveBeenCalledTimes(2); // the dropped answer did not trigger a re-read
  });

  it("a batch read that arrives after the scope changed is dropped; the new scope's answer is what stands", async () => {
    const slow = deferred<Result<AccessEligibilityBatchRead>>();
    const fake = fakeApi((call) => (call === 1 ? slow.promise : batchRead("STEP_UP_ACTIVE")));
    const view = mount(fake);
    await waitFor(() => expect(fake.batch).toHaveBeenCalledTimes(1));
    view.rerender(<StepUpBlock api={fake.api} {...QUESTION} workspaceId="ws_other" format={(ms) => `T${ms}`} />);
    // The fake answers whatever it is asked, so make the second answer match the second question.
    await waitFor(() => expect(fake.batch).toHaveBeenCalledTimes(2));
    await act(async () => slow.resolve(batchRead("STEP_UP_REQUIRED_NOT_ACTIVE")));
    expect(screen.queryByLabelText(STEP_UP_COPY.passwordLabel)).toBeNull(); // the old REQUIRED answer did not land
  });

  it("an answer after unmount does nothing", async () => {
    const wait = deferred<SessionStepUpOutcome>();
    const fake = fakeApi(() => batchRead("STEP_UP_REQUIRED_NOT_ACTIVE"), () => wait.promise);
    const view = mount(fake);
    await waitFor(() => expect(field()).toBeTruthy());
    fireEvent.change(field(), { target: { value: SECRET } });
    fireEvent.click(confirm());
    await waitFor(() => expect(fake.post).toHaveBeenCalledTimes(1));
    view.unmount();
    await act(async () => wait.resolve(okOutcome("CAPITAL_COMMAND")));
    expect(fake.batch).toHaveBeenCalledTimes(1);
  });
});

describe("Rail · the step-up block is mounted only when a target is given", () => {
  const railApi = (fake: Fake) => ({ ...fake.api, getReviewCaptureCapabilities: vi.fn(async () => ({ ok: false, status: "unavailable", reason: "x" })) }) as unknown as ExecutionApi;
  const target = { kind: "r2", id: "AP-1", row: null, decided: null, waiver: null } as const;

  it("without a target the rail keeps today's informational block and asks nothing", () => {
    const fake = fakeApi(() => batchRead("STEP_UP_REQUIRED_NOT_ACTIVE"));
    render(<MemoryRouter><Rail api={railApi(fake)} target={target} evidence={{ status: "idle" }} principal={NO_PRINCIPAL} /></MemoryRouter>);
    expect(screen.getByRole("group", { name: "Step-up confirmation" }).textContent).toContain("Not published (FE-015)");
    expect(screen.queryByRole("button", { name: /Confirm/ })).toBeNull();
    expect(fake.batch).not.toHaveBeenCalled();
  });

  it("with a target the block reads that row and offers the re-check", async () => {
    const fake = fakeApi(() => batchRead("STEP_UP_REQUIRED_NOT_ACTIVE"));
    render(<MemoryRouter><Rail api={railApi(fake)} target={target} evidence={{ status: "idle" }} principal={NO_PRINCIPAL} stepUp={QUESTION} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText(STEP_UP_COPY.passwordLabel)).toBeTruthy());
    expect(screen.getByRole("group", { name: "Step-up confirmation" }).textContent).not.toContain("Not published (FE-015)");
  });
});
