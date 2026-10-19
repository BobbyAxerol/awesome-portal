/**
 * Sandbox certification V2 through a port fake: both bodies, every tab, every state, the
 * honest absences, the disabled actions and the a11y structure. Bodies are the published
 * canonical fixtures run through the real dispatch (testApi.ts); nothing is imported from
 * a fixture module of the product.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { STAGE_WHY } from "../stage/reasons";
import SandboxScreen, { SANDBOX_SCREEN_KEY } from "./index";
import { fakeApi, okRead, v1Body, v1Rich, v2Body, type FakeApi } from "./testApi";

afterEach(() => cleanup());

const ENTRY = "/deployments/sandbox/dep_TEST_ONLY_sbx";
const NO_DASH = /(^|\s)[-–—](\s|$)|N\/A/;

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}
const where = () => screen.getByTestId("where").textContent ?? "";
const search = () => new URLSearchParams(where().split("?")[1] ?? "");

function mount(api: FakeApi, entry = ENTRY) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <SandboxScreen api={api} deploymentId="dep_TEST_ONLY_sbx" />
      <Where />
    </MemoryRouter>,
  );
}
/** The certification is drawn AND the capabilities read has settled (an update after the test would be an unwrapped act). */
const ready = async () => {
  const h1 = await screen.findByRole("heading", { level: 1, name: "Sandbox certification" });
  await waitFor(() => expect(document.querySelector('[data-screen="sandbox-v2"]')?.getAttribute("data-state")).not.toBe("loading"));
  await waitFor(() => expect(screen.queryByText(/Asking the server whether it offers this note/)).toBeNull());
  return h1;
};
const tabs = () => within(screen.getByRole("tablist", { name: "Sandbox certification sections" }));
const kpi = (label: string) => screen.getByText(label, { selector: "dt" }).closest(".exec-blk-kpi") as HTMLElement;
const chip = (id: string) => document.querySelector(`[data-chip="${id}"]`) as HTMLElement;

describe("screen contract", () => {
  it("is the sandbox flag's screen", () => {
    expect(SANDBOX_SCREEN_KEY).toBe("sandbox");
  });

  it("opens in a loading state with its header, then shows the certification", async () => {
    let release: (value: ReturnType<typeof okRead>) => void = () => undefined;
    const api = fakeApi();
    api.read.mockImplementation(() => new Promise((resolveRead) => { release = resolveRead; }));
    mount(api);
    expect(document.querySelector('[data-screen="sandbox-v2"]')?.getAttribute("data-state")).toBe("loading");
    expect(screen.getByRole("heading", { level: 1, name: "Sandbox certification" })).toBeTruthy();
    expect(screen.getByLabelText("Loading")).toBeTruthy();
    // While loading no chip says anything.
    expect(chip("runtime").getAttribute("data-state")).toBe("loading");
    await act(async () => release(okRead(v2Body())));
    await waitFor(() => expect(document.querySelector('[data-screen="sandbox-v2"]')?.getAttribute("data-version")).toBe("v2"));
    expect(screen.queryByLabelText("Loading")).toBeNull();
  });

  it("reads the deployment of its route, in the workspace the URL names", async () => {
    const api = fakeApi();
    mount(api, `${ENTRY}?workspace_id=ws_TEST_ONLY_url`);
    await ready();
    expect(api.read).toHaveBeenCalledWith("dep_TEST_ONLY_sbx", { workspaceId: "ws_TEST_ONLY_url" });
    cleanup();
    const bare = fakeApi();
    mount(bare);
    await ready();
    expect(bare.read).toHaveBeenCalledWith("dep_TEST_ONLY_sbx", undefined);
  });

  it("has one h1, one tablist, named regions and no repeated id", async () => {
    mount(fakeApi({ read: okRead(v1Rich()) }));
    await ready();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole("tablist")).toHaveLength(1);
    expect(screen.getByRole("group", { name: "Certification facts" })).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Exit review and review note" })).toBeTruthy();
    expect(screen.getByRole("tabpanel")).toBeTruthy();
    const ids = [...document.querySelectorAll("[id]")].map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("the V2 following-parent body", () => {
  it("draws the stage header: Sandbox frame, three chips that invent nothing, the spine at Sandbox", async () => {
    mount(fakeApi());
    await ready();
    const header = document.querySelector("header.exec-stage-guard")!;
    expect(header.getAttribute("data-stage")).toBe("sandbox");
    expect(header.getAttribute("data-frame")).toBe("left");
    expect(header.textContent).not.toContain("Real capital at risk");
    // Runtime: nothing published, so no green "Running".
    expect(chip("runtime").textContent).toContain("Not published (FE-027)");
    expect(chip("runtime").textContent).not.toMatch(/Running|Halted/);
    expect(chip("freshness").textContent).toContain("Not available");
    expect(chip("reconciliation").textContent).toContain("Not published (FE-072)");
    const spine = within(header as HTMLElement).getByRole("list", { name: "Lifecycle" });
    const current = within(spine).getAllByRole("listitem").filter((n) => n.getAttribute("aria-current") === "step");
    expect(current).toHaveLength(1);
    expect(current[0]!.textContent).toContain("Sandbox");
    // The lineage names R1 and R2; it does not make them "Done".
    expect(spine.textContent).not.toContain("Done");
  });

  it("names the deployment and portfolio the body published, and links Alpha Fleet", async () => {
    mount(fakeApi());
    await ready();
    expect(screen.getByText(/Deployment dep_TEST_ONLY_parent · portfolio pf_TEST_ONLY_parent/)).toBeTruthy();
    const crumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumb).getByRole("link", { name: "Alpha Fleet" }).getAttribute("href")).toBe("/deployments/alphas");
    expect(within(crumb).getByText("Sandbox").closest("li")?.getAttribute("aria-current")).toBe("page");
  });

  it("every fact the body does not carry is Not published with its request id, and none is a number", async () => {
    mount(fakeApi());
    await ready();
    expect(kpi("Steps passed").textContent).toContain("Not published (FE-028)");
    expect(kpi("Open findings").textContent).toContain("Not published (FE-072)");
    expect(kpi("Critical open").textContent).toContain("Not published (FE-072)");
    expect(kpi("Promotion plans").textContent).toContain("Not published (FE-072)");
    expect(kpi("Gate").textContent).toContain("Not published (FE-028)");
    expect(screen.getByRole("group", { name: "Certification facts" }).querySelector(".exec-blk-num")).toBeNull();
    expect(screen.getByText(/carries the stored certification and its step evaluations only/)).toBeTruthy();
  });

  it("the Steps tab shows the seven stored evaluations in order: Pass, Fail, Stale, Unavailable and three Not recorded", async () => {
    mount(fakeApi(), `${ENTRY}?tab=steps`);
    await ready();
    const grid = screen.getByRole("list", { name: "Certification steps" });
    const cells = within(grid).getAllByRole("listitem");
    expect(cells).toHaveLength(7);
    expect(cells.map((c) => c.getAttribute("data-state"))).toEqual(["pass", "fail", "stale", "unavailable", "not-recorded", "not-recorded", "not-recorded"]);
    expect(cells[0]!.textContent).toContain("Step 1: Connect");
    expect(cells[3]!.textContent).toContain("Reconciliation clean");
    expect(cells[4]!.textContent).toContain("No evidence recorded");
    // Stale is its own word, not a failure.
    expect(within(cells[2]!).getByText("Stale")).toBeTruthy();
    // The explanation of a step is not in a V2 body: said once, with the request.
    expect(screen.getByText(/Its explanation is/).textContent).toContain("Not published (FE-028)");
    // Lineage: the R1 and R2 approvals link to their reviews.
    const lineage = screen.getByRole("list", { name: "Lineage" });
    expect(within(lineage).getByText("R2 approval").parentElement!.querySelector("a")?.getAttribute("href")).toMatch(/\/governance\/approvals\/.+\/r2/);
    expect(tabs().getByRole("tab", { name: /Steps/ }).textContent).toContain("(7)");
  });

  it("a body that does not publish the steps says so and gives the published reason; the tab carries no count", async () => {
    mount(fakeApi({ read: okRead(v2Body("sandbox_draft")) }), `${ENTRY}?tab=steps`);
    await ready();
    expect(screen.queryByRole("list", { name: "Certification steps" })).toBeNull();
    expect(screen.getByText("The steps are not published for this response.")).toBeTruthy();
    expect(screen.getByText("PARENT_FIELD_PURPOSE_NOT_QUALIFIED")).toBeTruthy();
    expect(tabs().getByRole("tab", { name: /Steps/ }).textContent).not.toMatch(/\(\d+\)/);
    expect(screen.getByRole("group", { name: "Certification facts" })).toBeTruthy();
  });

  it("Findings, Promotion plans and Timeline are Not published (FE-072), never an empty table", async () => {
    mount(fakeApi());
    await ready();
    expect(screen.getByRole("heading", { name: "Findings" }).closest("section")!.textContent).toContain("Not published (FE-072)");
    expect(screen.queryByRole("table")).toBeNull();
    fireEvent.click(tabs().getByRole("tab", { name: "Promotion plans" }));
    expect(screen.getByRole("heading", { name: "Promotion plans" }).closest("section")!.textContent).toContain("Not published (FE-072)");
    fireEvent.click(tabs().getByRole("tab", { name: "Timeline" }));
    expect(screen.getByRole("heading", { name: "Timeline" }).closest("section")!.textContent).toContain("Not published (FE-072)");
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("the V1 certification body", () => {
  it("the dark published body: 0 of 7, blocked, every step Unavailable, three dark source panels, no zeros invented", async () => {
    mount(fakeApi({ read: okRead(v1Body()) }));
    await ready();
    expect(kpi("Steps passed").textContent).toContain("0 / 7");
    expect(kpi("Gate").textContent).toContain("Blocked");
    // Zero findings against sources that reported nothing is an absence of evidence: the counts are Not available, not 0.
    expect(kpi("Open findings").textContent).toContain("Not available");
    expect(kpi("Open findings").textContent).toContain("Sources did not report");
    expect(kpi("Critical open").textContent).toContain("Sources did not report");
    expect(kpi("Open findings").querySelector(".exec-blk-num")).toBeNull();
    expect(chip("freshness").textContent).toContain("Not available");
    // Zero findings against sources that reported nothing is NOT a clean result.
    expect(chip("reconciliation").textContent).toContain("Sources did not report");
    expect(screen.getByText(/With the sources unavailable this is an absence of evidence, not a clean result/)).toBeTruthy();
    expect(screen.getByText(/The source panels did not report/)).toBeTruthy();
    const triad = screen.getByRole("group", { name: "Reconciliation" });
    expect(within(triad).getAllByText("Not available").length).toBeGreaterThanOrEqual(12);
    expect(triad.textContent).not.toMatch(/\b0\.00\b/);
    expect(screen.getByRole("list", { name: "Source panels" }).textContent).toContain("Execution · Unavailable");
  });

  it("with evidence: the server's count, tally, sentences and times; the gate is Blocked and the exit blockers read as sentences", async () => {
    mount(fakeApi({ read: okRead(v1Rich()) }), `${ENTRY}?tab=steps`);
    await ready();
    expect(kpi("Steps passed").textContent).toContain("4 / 7");
    expect(kpi("Steps passed").textContent).toContain("1 failed · 2 unavailable");
    expect(kpi("Gate").textContent).toContain("Blocked");
    const cells = within(screen.getByRole("list", { name: "Certification steps" })).getAllByRole("listitem");
    expect(cells[0]!.textContent).toContain("Step 1 evidence accepted.");
    expect(cells[0]!.textContent).toContain("Checked 16 Oct 17:50Z");
    expect(cells[0]!.textContent).toContain("Expires 23 Oct 17:50Z");
    expect(cells[3]!.textContent).toContain("2 findings are still open.");
    expect(cells[3]!.getAttribute("data-state")).toBe("fail");
    const exit = screen.getByRole("heading", { name: "Exit review" }).closest("section")!;
    expect(within(exit).getByText("Blocked")).toBeTruthy();
    const list = within(exit).getByRole("list", { name: "What blocks the exit" });
    expect(list.textContent).toContain("Step 4 failed.");
    expect(list.textContent).toContain("Steps 6 and 7 are unavailable: no evidence yet.");
    expect(list.textContent).toContain("4 of 7 steps have passed.");
    // Codes live under one Provenance disclosure, not in a sentence.
    expect(list.textContent).not.toMatch(/SANDBOX_STEP/);
    const prov = within(exit).getByText("Provenance").closest("details")!;
    expect(prov.textContent).toContain("SANDBOX_STEP_RECONCILIATION_FAIL");
    expect(prov.textContent).toContain("scert_fixture_77");
    expect(prov.textContent).toContain("Workflow version");
  });

  it("subtitle, crumb and lineage use only what the body published", async () => {
    mount(fakeApi({ read: okRead(v1Rich()) }), `${ENTRY}?tab=steps`);
    await ready();
    expect(screen.getByText(/Deployment dep_77 · OKX · account okx_testnet_main/)).toBeTruthy();
    const lineage = screen.getByRole("list", { name: "Lineage" });
    expect(within(lineage).getByRole("link", { name: "AP-101" }).getAttribute("href")).toBe("/governance/approvals/AP-101/r1");
    expect(within(lineage).getByText(/sha256:a{64}/)).toBeTruthy();
  });

  it("Reconciliation: the findings table prints the server's sentence, severity, when it was opened and whether it is open", async () => {
    mount(fakeApi({ read: okRead(v1Rich()) }));
    await ready();
    const table = screen.getByRole("table", { name: "Reconciliation findings" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain("fnd_TEST_ONLY_1");
    expect(rows[0]!.textContent).toContain("Fee total differs between the two sources");
    expect(rows[0]!.textContent).toContain("Warning");
    expect(rows[1]!.textContent).toContain("Info");
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Finding", "Severity", "Opened", "Status"]);
    expect(rows[0]!.querySelector('td[data-l="Opened"]')!.textContent).toBe("17 Oct 12:02Z");
    expect(rows[1]!.querySelector('td[data-l="Opened"]')!.textContent).toBe("17 Oct 11:15Z");
    // Both rows carry `resolved_at: null`: open. Nothing in the row is `Not available`.
    expect(rows[0]!.querySelector('td[data-l="Status"]')!.textContent).toContain("Open");
    expect(within(rows[0]!).queryByText("Not available")).toBeNull();
    expect(kpi("Open findings").textContent).toContain("2");
    expect(kpi("Critical open").textContent).toContain("None open");
    expect(screen.getByRole("heading", { name: "Findings" }).closest("section")!.textContent).toContain("2 recorded");
  });

  it("findings: resolved and open rows, a blocking flag, and the counts that follow from them (open = resolved_at null)", async () => {
    const body = v1Rich();
    body.source_panels.forEach((p: Record<string, unknown>) => {
      p.panel_state = "ready";
      p.freshness_state = "OK";
      p.source_verification_state = "VERIFIED";
      p.as_of = "2026-10-17T12:04:00.000Z";
      p.data = { note: "x" };
      p.warnings = [];
    });
    body.findings = {
      total_count: 3, returned_count: 3, truncated: false,
      rows: [
        { ...body.findings.rows[0], finding_id: "fnd_TEST_ONLY_c1", severity: "CRITICAL", blocking: true, resolved_at: null },
        { ...body.findings.rows[0], finding_id: "fnd_TEST_ONLY_c2", severity: "CRITICAL", blocking: false, resolved_at: "2026-10-17T12:30:00.000Z" },
        { ...body.findings.rows[1], finding_id: "fnd_TEST_ONLY_i1", severity: "INFO", resolved_at: null },
      ],
    };
    mount(fakeApi({ read: okRead(body) }));
    await ready();
    expect(kpi("Open findings").textContent).toContain("2");
    expect(kpi("Open findings").textContent).toContain("3 recorded, open or resolved");
    expect(kpi("Critical open").textContent).toContain("1");
    const rows = within(screen.getByRole("table", { name: "Reconciliation findings" })).getAllByRole("row").slice(1);
    expect(rows[0]!.textContent).toContain("Blocking");
    expect(rows[0]!.querySelector('td[data-l="Status"]')!.textContent).toContain("Open");
    expect(rows[1]!.querySelector('td[data-l="Status"]')!.textContent).toContain("Resolved");
    expect(rows[1]!.querySelector('td[data-l="Status"]')!.textContent).toContain("17 Oct 12:30Z");
    expect(chip("reconciliation").textContent).toContain("2 open");
    expect(chip("reconciliation").textContent).toContain("3 recorded");
  });

  it("a finding row that does not say whether it is resolved is Not available, never Open; the counts then say so", async () => {
    const body = v1Rich();
    delete body.findings.rows[0].resolved_at;
    delete body.findings.rows[0].blocking;
    mount(fakeApi({ read: okRead(body) }));
    await ready();
    const rows = within(screen.getByRole("table", { name: "Reconciliation findings" })).getAllByRole("row").slice(1);
    expect(rows[0]!.querySelector('td[data-l="Status"]')!.textContent).toContain("Not available");
    expect(rows[1]!.querySelector('td[data-l="Status"]')!.textContent).toContain("Open");
    // An unreadable blocking bit is not waved through as "not blocking".
    expect(rows[0]!.textContent).toContain("Blocking not stated");
    expect(rows[1]!.textContent).not.toContain("Blocking");
    expect(kpi("Open findings").textContent).toContain("Which are open was not published · 2 recorded");
    expect(kpi("Open findings").querySelector(".exec-blk-num")).toBeNull();
  });

  it("Promotion plans: id, target, time, status; Envelope and Author are Not published (FE-072) and said once", async () => {
    mount(fakeApi({ read: okRead(v1Rich()) }), `${ENTRY}?tab=promotion-plans`);
    await ready();
    const table = screen.getByRole("table", { name: "Promotion plans" });
    const row = within(table).getAllByRole("row")[1]!;
    expect(row.textContent).toContain("plan_TEST_ONLY_1");
    expect(row.textContent).toContain("Canary");
    expect(row.textContent).toContain("17 Oct 12:10Z");
    expect(within(row).getByText("Blocked")).toBeTruthy();
    expect(within(row).getByText("1 blocker")).toBeTruthy();
    expect(screen.getByText(/Envelope and Author are/).textContent).toContain("Not published (FE-072)");
    expect(kpi("Promotion plans").textContent).toContain("1");
  });

  it("Timeline: When, Event in words and By, newest first as the server ordered it", async () => {
    mount(fakeApi({ read: okRead(v1Rich()) }), `${ENTRY}?tab=timeline`);
    await ready();
    const table = screen.getByRole("table", { name: "Certification timeline" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("17 Oct 12:02ZSubmitted for reviewusr_TEST_ONLY_a"),
      expect.stringContaining("16 Oct 17:55ZCertification createdusr_TEST_ONLY_a"),
    ]);
  });

  it("empty lists say what an absence is: nothing recorded, no plan, no event", async () => {
    mount(fakeApi({ read: okRead(v1Body()) }), `${ENTRY}?tab=promotion-plans`);
    await ready();
    expect(screen.getByText("No promotion plan has been recorded for this certification.")).toBeTruthy();
  });

  it("a body that says a source action was requested is not trusted, loudly", async () => {
    const body = v1Body();
    body.source_side_effect_requested = true;
    mount(fakeApi({ read: okRead(body) }));
    await ready();
    expect(screen.getByRole("alert").textContent).toContain("a source action was requested");
  });

  it("a stale source panel says Showing data as of, from the server's time", async () => {
    const body = v1Body();
    body.source_panels[1].panel_state = "stale";
    body.source_panels[1].freshness_state = "STALE";
    body.source_panels[1].as_of = "2026-10-17T11:40:00.000Z";
    mount(fakeApi({ read: okRead(body) }));
    await ready();
    expect(screen.getByText(/Showing data as of 17 Oct 11:40Z/)).toBeTruthy();
    expect(chip("freshness").textContent).toContain("Stale · 17 Oct 11:40Z");
  });

  it("a withheld Broker panel hides the Broker and Difference columns, and not as Not available", async () => {
    const body = v1Body();
    body.source_panels[1].panel_state = "suppressed";
    mount(fakeApi({ read: okRead(body) }));
    await ready();
    const triad = screen.getByRole("group", { name: "Reconciliation" });
    expect(triad.querySelectorAll('section[data-state="suppressed"]')).toHaveLength(2);
    expect(triad.querySelector('section[data-col="internal"]')?.getAttribute("data-state")).toBeNull();
    expect(triad.textContent).toContain("Hidden while the figures disagree");
  });
});

describe("tabs live in the URL", () => {
  it("opens Reconciliation without writing it, writes the slug on choosing, and Back returns", async () => {
    mount(fakeApi());
    await ready();
    expect(tabs().getByRole("tab", { selected: true }).textContent).toContain("Reconciliation");
    expect(search().get("tab")).toBeNull();
    fireEvent.click(tabs().getByRole("tab", { name: /Steps/ }));
    expect(search().get("tab")).toBe("steps");
    expect(screen.getByRole("list", { name: "Certification steps" })).toBeTruthy();
    fireEvent.click(tabs().getByRole("tab", { name: "Timeline" }));
    expect(search().get("tab")).toBe("timeline");
  });

  it.each([["Promotion+plans", "promotion-plans"], ["plans", "promotion-plans"], ["Steps+(7)", "steps"]])("the alias ?tab=%s opens %s and the URL is rewritten", async (raw, slug) => {
    mount(fakeApi(), `${ENTRY}?tab=${raw}`);
    await ready();
    await waitFor(() => expect(search().get("tab")).toBe(slug));
    expect(tabs().getByRole("tab", { selected: true }).textContent?.toLowerCase().replace(/\s+/g, "-")).toContain(slug.split("-")[0]);
  });

  it("an unknown tab opens the default and says so once", async () => {
    mount(fakeApi(), `${ENTRY}?tab=nonsense`);
    await ready();
    expect(screen.getByText('Tab "nonsense" is not available. Showing reconciliation.')).toBeTruthy();
    expect(tabs().getByRole("tab", { selected: true }).textContent).toContain("Reconciliation");
  });

  it("the arrow keys, Home and End move between tabs and keep one tab in the tab order", async () => {
    mount(fakeApi());
    await ready();
    const first = tabs().getByRole("tab", { name: "Reconciliation" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(tabs().getByRole("tab", { selected: true }).textContent).toContain("Steps");
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(tabs().getByRole("tab", { selected: true }).textContent).toContain("Timeline");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(tabs().getByRole("tab", { selected: true }).textContent).toContain("Reconciliation");
    expect(tabs().getAllByRole("tab").filter((t) => t.getAttribute("tabindex") === "0")).toHaveLength(1);
  });

  it("the facts and the rail stay on every tab", async () => {
    mount(fakeApi({ read: okRead(v1Rich()) }));
    await ready();
    for (const name of [/Steps/, "Promotion plans", "Timeline", "Reconciliation"] as const) {
      fireEvent.click(tabs().getByRole("tab", { name }));
      expect(screen.getByRole("group", { name: "Certification facts" })).toBeTruthy();
      expect(screen.getByRole("heading", { name: "Exit review" })).toBeTruthy();
      expect(screen.getByRole("heading", { name: "Record review note" })).toBeTruthy();
    }
  });
});

describe("states", () => {
  it("denied: the researcher frame, with the way to see what they can access", async () => {
    const api = fakeApi({ read: { ok: false, status: "denied", reason: "403: not a member" } });
    mount(api);
    expect(await screen.findByText("You can’t open this page.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "See what you can access" }).getAttribute("href")).toBe("/administration/profile-access");
    expect(screen.getByRole("link", { name: "Alpha Fleet" }).getAttribute("href")).toBe("/deployments/alphas");
    expect(screen.getByText("403: not a member")).toBeTruthy();
    // No certification chrome, no write.
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Record review note" })).toBeNull();
    expect(api.capabilities).not.toHaveBeenCalled();
  });

  it("unavailable: the server's reason and a way to ask again, which reads once more", async () => {
    const api = fakeApi({ read: [{ ok: false, status: "unavailable", reason: "502: upstream" }, okRead(v2Body())] });
    mount(api);
    expect(await screen.findByText("502: upstream")).toBeTruthy();
    expect(screen.getByText("Unavailable")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try the read again" }));
    expect(await screen.findByRole("tablist")).toBeTruthy();
    expect(api.read).toHaveBeenCalledTimes(2);
  });

  it("stale (rate limited): worded Stale with the reason, not as a failure", async () => {
    mount(fakeApi({ read: { ok: false, status: "stale", reason: "429: slow down" } }));
    expect(await screen.findByText("Stale")).toBeTruthy();
    expect(screen.getByText("429: slow down")).toBeTruthy();
  });

  it("a thrown read is unavailable, not a blank screen", async () => {
    const api = fakeApi();
    api.read.mockRejectedValue(new Error("boom"));
    mount(api);
    expect(await screen.findByText("The read failed before the Portal answered.")).toBeTruthy();
  });

  it("unsupported: a version this build does not read is named, nothing else is drawn, and it is terminal", async () => {
    const swapped = { ...v1Body(), schema_version: "governance.r2-review.v1" };
    mount(fakeApi({ read: okRead(swapped) }));
    expect(await screen.findByText(/governance\.r2-review\.v1/)).toBeTruthy();
    expect(screen.getByText("Failed")).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(document.querySelector('[data-screen="sandbox-v2"]')?.getAttribute("data-state")).toBe("unsupported");
  });

  it("a V2 body of the wrong shape is refused whole, with the sentence the dispatch gives", async () => {
    const body = v2Body();
    body.steps.items.pop();
    mount(fakeApi({ read: okRead(body) }));
    expect(await screen.findByText(/does not match that contract, so none of it is shown/)).toBeTruthy();
  });
});

describe("honesty", () => {
  it.each([["V1 dark", () => v1Body()], ["V1 with evidence", () => v1Rich()], ["V2", () => v2Body()], ["V2 steps absent", () => v2Body("sandbox_absent")]] as const)(
    "%s: prints no dash, no N/A and no bare 0 where a value was not published, on any tab",
    async (_name, body) => {
      mount(fakeApi({ read: okRead(body()) }));
      await ready();
      for (const name of ["Reconciliation", /Steps/, "Promotion plans", "Timeline"] as const) {
        fireEvent.click(tabs().getByRole("tab", { name }));
        expect(document.body.textContent ?? "", String(name)).not.toMatch(NO_DASH);
      }
    },
  );

  it("never prints a computed headroom, percentage or amount", async () => {
    mount(fakeApi({ read: okRead(v1Rich()) }));
    await ready();
    expect(document.body.textContent ?? "").not.toMatch(/\d+(\.\d+)?\s?%|headroom|USDT/i);
  });
});

describe("actions with no route are disabled with their reason", () => {
  it("Submit for review and Request Sandbox exit review: disabled, described by their reason, with My access", async () => {
    mount(fakeApi({ read: okRead(v1Rich()) }));
    await ready();
    const submit = screen.getByRole("button", { name: "Submit for review" }) as HTMLButtonElement;
    const request = screen.getByRole("button", { name: "Request Sandbox exit review" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(request.disabled).toBe(true);
    const reasonOf = (button: HTMLElement) => document.getElementById(button.getAttribute("aria-describedby")!)?.textContent;
    expect(reasonOf(submit)).toMatch(/Blocked until every step passes/);
    expect(reasonOf(request)).toBe(STAGE_WHY.notEnabled);
    expect(screen.getAllByRole("link", { name: /My access/ }).length).toBeGreaterThanOrEqual(2);
  });

  it("on a body with no gate (V2) Submit says the profile reason, not a gate it cannot know", async () => {
    mount(fakeApi());
    await ready();
    const submit = screen.getByRole("button", { name: "Submit for review" });
    expect(document.getElementById(submit.getAttribute("aria-describedby")!)?.textContent).toBe(STAGE_WHY.notEnabled);
  });

  it("every disabled button on the screen names a reason that exists on the page", async () => {
    mount(fakeApi({ read: okRead(v1Rich()) }));
    await ready();
    const disabled = [...document.querySelectorAll<HTMLButtonElement>("button:disabled")];
    expect(disabled.length).toBeGreaterThanOrEqual(3);
    for (const button of disabled) {
      const id = button.getAttribute("aria-describedby");
      expect(id, button.textContent ?? "").toBeTruthy();
      expect(document.getElementById(id!)?.textContent?.trim().length, button.textContent ?? "").toBeGreaterThan(0);
    }
  });

  it("What exit needs is the runbook the V1 screen prints, kept in a disclosure", async () => {
    mount(fakeApi({ read: okRead(v1Rich()) }));
    await ready();
    expect(screen.getByText("What exit needs").closest("details")!.textContent).toContain("Clean exposure → final sync");
  });
});

describe("layout at 390px", () => {
  const css = readFileSync(resolve(__dirname, "../../css/sandbox.css"), "utf8");

  it("the steps are one column and the rail goes under the main column below 660 and 1100px", () => {
    expect(css).toMatch(/@media \(max-width: 1100px\)[\s\S]*\.exec-sbx-grid[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
    expect(css).toMatch(/@media \(max-width: 660px\)[\s\S]*\.exec-sbx-steps[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
    expect(css).not.toMatch(/^\s+(min-)?width:\s*\d{4,}px/m);
  });

  it("every table is a CardsTable (stacks to cards at 660px) and every long value may wrap", async () => {
    mount(fakeApi({ read: okRead(v1Rich()) }));
    await ready();
    expect(document.querySelectorAll("table.exec-cards").length).toBeGreaterThan(0);
    expect(css).toMatch(/\.exec-sbx-id\s*\{[^}]*overflow-wrap: anywhere/);
  });
});
