/**
 * Sandbox against the BE-P2 / BE-P3 members, published (lane FIXTURE_LAB: the populated values are the canonical SYNTHETIC
 * fixtures merged into `v1Rich`; a synthetic fixture is never source acceptance). Stage facts, identity, source figures,
 * the finding Opened column and the plan Author / Envelope facts; the sealed v2 body carries none and reads as typed absence;
 * the reader stays closed.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { loadCanonical } from "../../testkit/loadCanonical";
import type { Draft } from "../../testkit/matrix";
import { validateAgainst } from "../../testkit/schema";
import { readSandboxByVersion } from "../../readers/dispatch";
import SandboxScreen from "./index";
import { chipsOf } from "./model";
import { readSandboxView, type SandboxView } from "./readSandbox";
import { fakeApi, okRead, v1Rich, v2Body } from "./testApi";
import { whyButton, whyText } from "../../gapWhyTestUtil";

afterEach(cleanup);

const rows = (): Draft => loadCanonical<Draft>("execution-stage-rows.synthetic").value;

function published(): Draft {
  const body = v1Rich();
  body.stage_facts = loadCanonical<Draft>("execution-stage-facts.source-backed.synthetic").value;
  body.source_figures = rows().source_figures;
  Object.assign(body.certification, {
    alpha_id: "alpha_TEST_ONLY",
    alpha_name: null,
    portfolio_name: "Crypto Core",
    alpha_reason_code: "ALPHA_NAME_NOT_PUBLISHED",
    portfolio_name_reason_code: null,
  });
  body.certification.portfolio_id = "pf_crypto";
  body.findings.rows[0].opened_at = "2026-10-17T12:00:00.000Z";
  body.promotion_plans = rows().plan_rows.map((plan: Draft) => ({ ...plan }));
  return body;
}

const viewOf = (raw: unknown): SandboxView => {
  const read = readSandboxView(readSandboxByVersion(raw));
  if (read.kind !== "ready") throw new Error(read.text);
  return read.view;
};

function mount(raw: unknown) {
  render(
    <MemoryRouter initialEntries={["/deployments/sandbox/dep_TEST_ONLY_sbx"]}>
      <SandboxScreen api={fakeApi({ read: okRead(raw) })} deploymentId="dep_TEST_ONLY_sbx" />
    </MemoryRouter>,
  );
}
const ready = async () => {
  await screen.findByRole("heading", { level: 1, name: "Sandbox certification" });
  await waitFor(() => expect(document.querySelector('[data-screen="sandbox-v2"]')?.getAttribute("data-state")).not.toBe("loading"));
  await waitFor(() => expect(screen.queryByText(/Checking whether this note is offered/)).toBeNull());
};
const chip = (id: string) => document.querySelector<HTMLElement>(`[data-chip="${id}"]`)!;
async function openTab(name: string) {
  const tabs = within(screen.getByRole("tablist", { name: "Sandbox certification sections" }));
  fireEvent.click(tabs.getByRole("tab", { name }));
  await waitFor(() => expect(tabs.getByRole("tab", { name }).getAttribute("aria-selected")).toBe("true"));
}

describe("the merged body is wire-shaped", () => {
  it("its BE-P2/P3 members validate against the published schemas", () => {
    const body = published();
    expect(validateAgainst("execution-stage-facts.v1", "/$defs/StageFacts", body.stage_facts)).toEqual([]);
    expect(validateAgainst("execution-stage-facts.v1", "/$defs/StageSourceFigures", body.source_figures)).toEqual([]);
    expect(body.promotion_plans.every((plan: Draft) => validateAgainst("execution-sandbox-certification.v1", "/$defs/PromotionPlanSummary", plan).length === 0)).toBe(true);
  });
});

describe("chips and identity", () => {
  it("Runtime and Reconciliation are the server's stage facts", () => {
    const chips = chipsOf(viewOf(published()));
    expect(chips.runtime).toEqual({ state: "flag", kind: "ok", label: "Running", note: "since 12 Oct 08:00Z" });
    expect(chips.reconciliation).toMatchObject({ state: "flag", kind: "attention", label: "1 open finding" });
  });

  it("a stage fact NOT_PUBLISHED does not hide finding rows that say how many are open", () => {
    const body = published();
    body.stage_facts.reconciliation.verdict = { availability: "NOT_PUBLISHED", value: null, reason_code: "FINDINGS_NOT_READABLE" };
    body.findings.rows[0].resolved_at = null;
    body.findings.rows[1].resolved_at = null;
    // the finding rows decide: two recorded, both with resolved_at null
    expect(chipsOf(viewOf(body)).reconciliation).toMatchObject({ state: "flag", label: "2 open" });
  });

  it("the crumb links the Alpha only because alpha_id is published, the portfolio shows its name, the alpha name is Not published (FE-066) with its reason", async () => {
    mount(published());
    await ready();
    const crumb = within(screen.getByRole("navigation", { name: "Breadcrumb" }));
    expect(crumb.getByRole("link", { name: "alpha_TEST_ONLY" }).getAttribute("href")).toBe("/deployments/alphas/alpha_TEST_ONLY");
    expect(crumb.getByRole("link", { name: "Crypto Core" }).getAttribute("href")).toBe("/deployments/portfolios/pf_crypto");
    const sub = document.querySelector(".exec-stage-sub")!;
    expect(sub.textContent).toContain("Alpha alpha_TEST_ONLY");
    // The name is not announced a second time: the id stands alone and the request and reason are in its disclosure.
    expect(sub.textContent).not.toContain("Alpha name");
    expect(whyText(sub.querySelector(".exec-blk-why"))).toContain("ALPHA_NAME_NOT_PUBLISHED");
    expect(whyText(sub.querySelector(".exec-blk-why"))).toContain("FE-066");
    expect(chip("runtime").textContent).toContain("Running");
  });

  it("without published identity there is no Alpha link and no name", async () => {
    const body = published();
    for (const key of ["alpha_id", "alpha_name", "portfolio_name", "alpha_reason_code", "portfolio_name_reason_code"]) delete body.certification[key];
    mount(body);
    await ready();
    expect(document.querySelector('a[href^="/deployments/alphas/"]')).toBeNull();
  });
});

describe("Reconciliation: the server's figures", () => {
  it("Internal, Broker and the server's Difference; the unavailable source panels do not blank a published figure", async () => {
    mount(published());
    await ready();
    const triad = screen.getByRole("group", { name: "Reconciliation" });
    const row = (col: string, label: string) =>
      Array.from(triad.querySelector(`[data-col="${col}"]`)!.querySelectorAll(".exec-blk-triad-row")).find((r) => r.querySelector("dt")!.textContent === label)!;
    expect(row("internal", "Positions").querySelector("dd")!.textContent).toBe("2");
    expect(row("broker", "Positions").querySelector("dd")!.textContent).toBe("2");
    expect(row("difference", "Open orders").querySelector("dd")!.textContent).toBe("1");
    const gap = row("broker", "Equity").querySelector("[data-gap]")!;
    expect(gap.textContent).toBe("Not available");
    expect(whyText(gap)).toContain("BROKER_EQUITY_FIELD_NOT_PUBLISHED");
    expect(screen.getByText(/The Difference is the server's and is never worked out here\./)).toBeTruthy();
  });
});

describe("findings and plans", () => {
  it("Opened is opened_at when published, else created_at", () => {
    const view = viewOf(published());
    const [first, second] = view.findings!.rows;
    expect(first!.openedAt).toBe(Date.parse("2026-10-17T12:00:00.000Z"));
    expect(second!.openedAt).toBe(Date.parse("2026-10-17T11:15:00.000Z"));
  });

  it("a plan's Author and Envelope are the published facts; no envelope drafted reads 'None drafted'", async () => {
    mount(published());
    await ready();
    await openTab("Promotion plans");
    const table = screen.getByRole("table", { name: "Promotion plans" });
    const body = Array.from(table.querySelectorAll("tbody tr"));
    expect(body[0]!.querySelector('td[data-l="Author"]')!.textContent).toBe("usr_TEST_ONLY_author");
    expect(body[0]!.querySelector('td[data-l="Envelope"]')!.textContent).toBe("cenv_TEST_ONLY_1 · rev 1 · Draft");
    expect(body[1]!.querySelector('td[data-l="Envelope"]')!.textContent).toBe("None drafted");
    expect(screen.getByRole("tabpanel").textContent).not.toContain("Typed plan fields");
  });

  it("a plan without the members says Not available per cell (FE-072 in the title); a NOT_PUBLISHED envelope carries its reason", async () => {
    const body = published();
    delete body.promotion_plans[1].author;
    delete body.promotion_plans[1].envelope;
    body.promotion_plans[0].envelope = { availability: "NOT_PUBLISHED", value: null, reason_code: "ENVELOPE_LOOKUP_NOT_AVAILABLE" };
    mount(body);
    await ready();
    await openTab("Promotion plans");
    const rowsOf = Array.from(screen.getByRole("table", { name: "Promotion plans" }).querySelectorAll("tbody tr"));
    // No plan has an envelope, so that column is not drawn: it is one `Not available` line with the server's reason in its title.
    expect(rowsOf[0]!.querySelector('td[data-l="Envelope"]')).toBeNull();
    // Closed, the page names no request id; each disclosure holds its own.
    expect(screen.getByRole("tabpanel").textContent).not.toContain("(FE-072)");
    expect(whyText(screen.getByRole("tabpanel").querySelector(".exec-blk-gaps")!)).toContain("ENVELOPE_LOOKUP_NOT_AVAILABLE");
    expect(rowsOf[1]!.querySelector('td[data-l="Author"]')!.textContent).toBe("Not available");
    expect(whyText(rowsOf[1]!.querySelector('td[data-l="Author"] [data-gap]')!)).toContain("Not published (FE-072)");
    // Columns that still have a value stay; no note explaining the gaps is printed.
    expect(screen.getByRole("tabpanel").textContent).not.toContain("Typed plan fields");
  });
});

describe("closed, and the sealed v2 body", () => {
  it.each([
    ["stage_facts: an extra key", (b: Draft) => (b.stage_facts.surprise = 1), (v: SandboxView) => expect([v.runtime, v.reconciliation]).toEqual([null, null])],
    ["stage_facts: runtime `active`", (b: Draft) => (b.stage_facts.runtime.runtime_state.value = "active"), (v: SandboxView) => expect(v.runtime).toBeNull()],
    ["figures: a number", (b: Draft) => (b.source_figures.figures[2].internal.value = 2), (v: SandboxView) => expect(v.figures).toBeNull()],
    ["identity: a name without its reason rule", (b: Draft) => (b.certification.alpha_name = "Doge"), (v: SandboxView) => expect(v.identity).toBeNull()],
    ["plan: an author with an extra key", (b: Draft) => (b.promotion_plans[0].author.extra = 1), (v: SandboxView) => expect(v.plans![0]!.author).toBeNull()],
    ["plan: an envelope that is not DRAFT", (b: Draft) => (b.promotion_plans[0].envelope.value.status = "ACTIVE"), (v: SandboxView) => expect(v.plans![0]!.envelope).toBeNull()],
  ])("%s refuses only that member", (_name, mutate, check) => {
    const body = published();
    mutate(body);
    const view = viewOf(body);
    check(view);
    expect(view.findings!.rows).toHaveLength(2);
    expect(view.plans).toHaveLength(2);
  });

  it("the sealed following-parent v2 body carries none of the members", () => {
    const view = viewOf(v2Body());
    expect([view.runtime, view.reconciliation, view.identity, view.figures]).toEqual([null, null, null, null]);
  });
});

describe("BE-P12: the opt-in identity of the following-parent v2 body (include=identity)", () => {
  const parentFile = () => loadCanonical<Draft>("execution-positive-parent.synthetic");

  it("the view carries the closed identity the parent reader read; a body that did not carry it is the typed absence", () => {
    expect(viewOf(parentFile().sandbox_identity).identity).toMatchObject({ alphaId: "alpha_TEST_ONLY_identity", portfolioName: "TEST_ONLY portfolio name", alphaReasonCode: "ALPHA_NAME_NOT_PUBLISHED" });
    expect(viewOf(parentFile().sandbox_identity_hidden).identity).toMatchObject({ alphaId: null, portfolioName: null, alphaReasonCode: "ALPHA_IDENTITY_NOT_AUTHORIZED", portfolioNameReasonCode: "PORTFOLIO_NAME_NOT_AUTHORIZED" });
    expect(viewOf(parentFile().sandbox).identity).toBeNull();
  });

  it("published: the Alpha is linked by its id, the portfolio shows its name; the body without identity draws neither", async () => {
    mount(parentFile().sandbox_identity);
    await ready();
    const crumb = within(screen.getByRole("navigation", { name: "Breadcrumb" }));
    expect(crumb.getByRole("link", { name: "alpha_TEST_ONLY_identity" }).getAttribute("href")).toBe("/deployments/alphas/alpha_TEST_ONLY_identity");
    expect(crumb.getByRole("link", { name: "TEST_ONLY portfolio name" }).getAttribute("href")).toBe("/deployments/portfolios/pf_TEST_ONLY_parent");
    const sub = document.querySelector(".exec-stage-sub")!;
    expect(sub.textContent).not.toMatch(/ALPHA_NAME_NOT_PUBLISHED|FE-\d/);
    expect(whyText(sub)).toContain("ALPHA_NAME_NOT_PUBLISHED");
    cleanup();
    mount(parentFile().sandbox);
    await ready();
    const bare = within(screen.getByRole("navigation", { name: "Breadcrumb" }));
    expect(bare.queryByRole("link", { name: "alpha_TEST_ONLY_identity" })).toBeNull();
    expect(bare.getByRole("link", { name: "pf_TEST_ONLY_parent" })).toBeTruthy();
  });

  it("hidden: no Alpha link and the portfolio id stands in; the reason codes are in the disclosure, not in a sentence", async () => {
    mount(parentFile().sandbox_identity_hidden);
    await ready();
    const crumb = within(screen.getByRole("navigation", { name: "Breadcrumb" }));
    expect(document.querySelector('a[href^="/deployments/alphas/"]:not([href="/deployments/alphas"])')).toBeNull();
    expect(crumb.getByRole("link", { name: "pf_TEST_ONLY_parent" })).toBeTruthy();
    // the visible subtitle names no code and no FE id; the reason is behind the disclosure, reachable by click and Enter
    const sub = document.querySelector(".exec-stage-sub")!;
    expect(sub.textContent).not.toMatch(/ALPHA_IDENTITY_NOT_AUTHORIZED|PORTFOLIO_NAME_NOT_AUTHORIZED|FE-\d/);
    expect(screen.queryByText(/ALPHA_IDENTITY_NOT_AUTHORIZED|PORTFOLIO_NAME_NOT_AUTHORIZED/)).toBeNull();
    const why = whyButton(sub);
    expect(why.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(why);
    expect(why.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(why.getAttribute("aria-controls")!)!.textContent).toContain("ALPHA_IDENTITY_NOT_AUTHORIZED");
    fireEvent.click(why);
    expect(why.getAttribute("aria-expanded")).toBe("false");
    expect(whyText(sub)).toContain("ALPHA_IDENTITY_NOT_AUTHORIZED");
  });
});
