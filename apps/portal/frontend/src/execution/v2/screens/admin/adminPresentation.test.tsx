/**
 * Admin Actions V2, WP-E presentation: the subtitle, the tier sentence beside its count, the pane that is always open in the docked
 * layout, the Plan / Apply / Verify strip, and the simulated lane's six connected local reads (register 2d), through the real HTTP
 * client over the fixture answerer (the composition the deployed fixture BFF serves).
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { answerFixtureRequest, V2_OPTIONS } from "../../../../../e2e/bffAnswerer";
import { resetOverviewDouble, setOverviewDoubleVariants } from "../../../../../e2e/bffDoubleOverview";
import { overlayAdminTasks, SIMULATED_CONNECTED_READS, simulatedRunResult } from "../../../../../e2e/bffSimulated";
import { httpApi } from "../../../../../e2e/screensV2Harness";
import { SLOW } from "../../waitsTestUtil";
import AdminScreen from "./index";

let simulated = false;
let posts: string[] = [];
beforeEach(() => {
  resetOverviewDouble();
  simulated = false;
  posts = [];
  vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
    const url = new URL(String(input), "http://portal.test");
    const method = init?.method ?? "GET";
    let body: unknown = null;
    if (typeof init?.body === "string") body = JSON.parse(init.body);
    if (method !== "GET") posts.push(`${method} ${url.pathname}`);
    const answer = answerFixtureRequest({ method, path: url.pathname, search: url.search, headers: {}, body }, { ...V2_OPTIONS, simulated });
    if (answer === null) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mount = (entry = "/administration/actions") =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <AdminScreen api={httpApi()} />
    </MemoryRouter>,
  );
const loaded = () => screen.findByRole("heading", { name: "Read" }, SLOW);
const dock = () => screen.findByRole("complementary", {}, SLOW);
const tierTable = (label: string) => screen.getByRole("table", { name: `${label} actions` });

describe("header and tiers", () => {
  it("prints the subtitle, and says the page plans and does not apply", async () => {
    mount();
    await loaded();
    expect(screen.getByTestId("admin-subtitle").textContent).toBe("Plan, apply and verify · Administrators only. This page plans; it does not apply.");
  });

  it("every tier carries its sentence and its ready count in one line", async () => {
    mount();
    await loaded();
    expect(screen.getAllByTestId("admin-tier-aside").map((n) => n.textContent)).toEqual([
      "Look only. Nothing changes. · 0 of 7 ready",
      "Moves money. Starts in Portfolios. · 0 of 4 ready",
      "Changes how a deployment may trade. · 0 of 4 ready",
      "Changes account rules. · 0 of 2 ready",
      "Re-reads the broker. Fixes drift. · 0 of 4 ready",
      "Needs a second approver and a security key. · 0 of 3 ready",
    ]);
  });
});

describe("the detail pane", () => {
  it("opens on the first action when none is ready, and says why it is not live", async () => {
    mount();
    await loaded();
    const pane = await dock();
    expect(within(pane).getByRole("heading", { name: "System health" })).toBeTruthy();
    for (const term of ["What", "Scope", "Who", "Risk tier", "How", "State", "Not live because"]) expect(within(pane).getByText(term)).toBeTruthy();
    expect(pane.textContent).toContain("Not enabled for this profile");
  });

  it("a command row shows Plan, Apply and Verify as the catalogue states them, Apply Off", async () => {
    mount("/administration/actions?sel=account-sync");
    const pane = await dock();
    const strip = within(pane).getByTestId("admin-pav");
    expect([...strip.querySelectorAll(".exec-adm-pav-label")].map((n) => n.textContent)).toEqual(["Plan", "Apply", "Verify"]);
    expect(strip.textContent).toMatch(/Plan\s*Required/);
    expect(strip.querySelector('[data-step="apply"]')?.textContent).toContain("Off");
    expect(strip.querySelector('[data-step="verify"]')?.textContent).toContain("Not started");
    // Nothing was sent by opening it.
    expect(posts).toEqual([]);
  });

  it("a read row has no ceremony strip: it runs here", async () => {
    mount("/administration/actions?sel=health");
    const pane = await dock();
    expect(within(pane).queryByTestId("admin-pav")).toBeNull();
  });
});

describe("QA1 I-35: the detail pane is the page's right column from 1101px", () => {
  it("at 1440px (the shared dock mode says overlay up to 1500) the pane is docked, open on the first ready read, with Run local read", async () => {
    // overlay query true (max-width: 1500) AND the page's own wide query true (min-width: 1101): wide wins.
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: true, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
    simulated = true;
    mount();
    await loaded();
    const pane = await dock();
    expect(pane.getAttribute("data-mode")).toBe("dock");
    expect(within(pane).getByRole("heading", { name: "System health" })).toBeTruthy();
    expect(within(pane).getByText("Run local read")).toBeTruthy();
    // A ready action is not "not live": the line says it is connected, not a kill-switch reason.
    const why = within(pane).getByText("Not live because").nextElementSibling as HTMLElement;
    expect(why.textContent).toContain("Nothing: the server classifies this action as connected");
    expect(document.querySelector('.exec-adm-main')?.getAttribute("data-docked")).toBe("true");
  });

  it("QA2 R3-19: a read parameter whose values come from a server registry says so (no read lists it yet)", async () => {
    simulated = true;
    mount("/administration/actions?sel=health");
    const pane = await dock();
    const note = await within(pane).findByTestId("admin-param-registry");
    expect(note.textContent).toContain("modes registry");
  });

  it("at 1000px it is an overlay again, and nothing opens unprompted", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("max-width"), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
    mount();
    await loaded();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector('.exec-adm-main')?.getAttribute("data-docked")).toBeNull();
  });
});

describe("simulated lane: six connected local reads", () => {
  it("the sparse default keeps 0 of 24 and the published states", async () => {
    mount();
    await loaded();
    expect(screen.getByText("0 of 24 can run now")).toBeTruthy();
  });

  it("overlays exactly the six reads, never redis-inspect, and moves the counts with them", () => {
    const base = answerFixtureRequest({ method: "GET", path: "/api/v1/execution/commands/tasks", search: "", headers: {}, body: null }, V2_OPTIONS)!.body as Record<string, unknown>;
    const out = overlayAdminTasks(base) as { tasks: { task_id: string; state: string; reason_code: unknown }[]; classification_counts: Record<string, number> };
    const connected = out.tasks.filter((t) => t.state === "CONNECTED").map((t) => t.task_id);
    expect(connected.sort()).toEqual([...SIMULATED_CONNECTED_READS].sort());
    expect(out.tasks.find((t) => t.task_id === "redis-inspect")!.state).toBe("SEMANTICALLY_INCOMPATIBLE");
    expect(out.tasks.filter((t) => t.state === "CONNECTED").every((t) => t.reason_code === null)).toBe(true);
    expect(out.classification_counts).toEqual({ CONNECTED: 6, SUPPORTED_BUT_INACTIVE: 12, SEMANTICALLY_INCOMPATIBLE: 6 });
    // Pure: the input body is untouched, and a second pass changes nothing.
    expect((base as { classification_counts: Record<string, number> }).classification_counts.CONNECTED).toBe(0);
    expect(overlayAdminTasks(out as never)).toEqual(out);
  });

  it("the screen counts 6 of 24 can run now, Read is 6 of 7, and the first ready read opens", async () => {
    simulated = true;
    mount();
    await loaded();
    expect(screen.getByText("6 of 24 can run now")).toBeTruthy();
    expect(screen.getAllByTestId("admin-tier-aside")[0]!.textContent).toBe("Look only. Nothing changes. · 6 of 7 ready");
    const pane = await dock();
    expect(within(pane).getByRole("heading", { name: "System health" })).toBeTruthy();
    expect(within(pane).getByText("Run local read")).toBeTruthy();
    // Capital, command and emergency rows keep their published states: nothing else became ready.
    const states = (label: string) => within(tierTable(label)).getAllByRole("row").slice(1).map((r) => r.querySelector("td[data-l='State']")?.textContent ?? "");
    expect(states("Account").every((s) => !s.includes("Ready"))).toBe(true);
    expect(states("Emergency").every((s) => !s.includes("Ready"))).toBe(true);
  });

  it("running a connected read answers a local-projection receipt, labelled FIXTURE_LAB, with no source command", async () => {
    simulated = true;
    mount("/administration/actions?sel=performance");
    const pane = await dock();
    await waitFor(() => expect(within(pane).getByRole("button", { name: "Run read" })).toBeTruthy(), SLOW);
    await act(async () => {
      for (const field of within(pane).getAllByLabelText(/\(required\)/)) fireEvent.change(field, { target: { value: "x" } });
    });
    fireEvent.click(within(pane).getByRole("button", { name: "Run read" }));
    await waitFor(() => expect(within(pane).getByText("Read finished")).toBeTruthy(), SLOW);
    expect(pane.textContent).toContain("Source command sent: no");
    expect(pane.textContent).toContain("FIXTURE_LAB");
    expect(posts).toEqual(["POST /api/v1/execution/commands/tasks/performance/run"]);
  });

  it("a task that is not one of the six still answers 409 on a simulated lane", () => {
    const answer = answerFixtureRequest({ method: "POST", path: "/api/v1/execution/commands/tasks/account-sync/run", search: "", headers: {}, body: {} }, { ...V2_OPTIONS, simulated: true })!;
    expect(answer.status).toBe(409);
    expect(simulatedRunResult("account-sync")).toBeNull();
    expect(simulatedRunResult("redis-inspect")).toBeNull();
  });

  it("every simulated receipt is a valid command-run-result with a digest and a FIXTURE_LAB provenance", () => {
    for (const id of SIMULATED_CONNECTED_READS) {
      const receipt = simulatedRunResult(id) as { response_digest: string; source_request_sent: boolean; transport: string; result: { provenance: string } };
      expect(receipt.response_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(receipt.source_request_sent).toBe(false);
      expect(receipt.transport).toBe("SGP_LOCAL_PROJECTION");
      expect(receipt.result.provenance).toContain("FIXTURE_LAB");
    }
  });

  it("with the connected-read variant on top, the overlay does not double count health", async () => {
    setOverviewDoubleVariants({ admin: "connected-read" });
    simulated = true;
    mount();
    await loaded();
    expect(screen.getByText("6 of 24 can run now")).toBeTruthy();
  });
});

describe("G2: the relay and the READY label agree", () => {
  it("says in one sentence what the relay state means for running an action", async () => {
    simulated = true;
    mount();
    await loaded();
    const meaning = screen.getByTestId("admin-relay-meaning").textContent ?? "";
    expect(meaning).toMatch(/commands can be planned \(a preview\) but never delivered/);
    expect(meaning).toMatch(/Local reads do not use the relay and can still run/);
  });

  it("a ready local read is labelled as one, so READY never promises a relay delivery", async () => {
    simulated = true;
    mount();
    await loaded();
    const states = within(tierTable("Read")).getAllByRole("row").slice(1).map((r) => r.querySelector("td[data-l='State']")?.textContent ?? "");
    expect(states.filter((s) => s.includes("Ready: local read"))).toHaveLength(6);
    expect(states.some((s) => /Ready to run/.test(s))).toBe(false);
    const pane = await dock();
    expect(pane.textContent).toContain("It does not use the command relay");
  });

  it("a read parameter with no published list of values says where the values live and what happens to a wrong one", async () => {
    simulated = true;
    mount("/administration/actions?sel=health");
    const pane = await dock();
    const note = await within(pane).findByTestId("admin-param-registry");
    expect(note.textContent).toContain("held in the server's modes registry");
    expect(note.textContent).toContain("does not list it");
    expect(note.textContent).toContain("refuses an unknown value");
  });
});
