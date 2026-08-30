/**
 * Admin Action Drawer — WF 1i CLI-catalog flow (SMOKE until BR-EX-68).
 *
 * Every state the hi-fi draws is asserted here so no sub-screen goes missing:
 * the six task groups, the read terminal, the params table, the allocation
 * impact pane, the emergency flatten plan, the generic request preview, the
 * preflight, the two-man-rule grant per role, both verify outcomes, the
 * blocked command and the denied viewer. The honesty rails are asserted just
 * as hard: the SMOKE declaration, the published-catalogue join line, and the
 * F0 truth that the relay is disabled sitting right above the demo.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readCommandCatalogue } from "./adminCatalog";
import { COMMAND_CATALOGUE_FIXTURE } from "./adminCatalog.fixtures";
import { CLI_ACTIONS, CLI_GROUPS, CLI_PARAMS } from "./adminCli.smoke";
import { AdminActionDrawerScreen } from "./screens/AdminActionDrawer";
import { AdminCatalogueContainer } from "./screens/containers";
import { createFixtureApi } from "./api/fixtureApi";
import type { CliOutcome, CliRole } from "./adminCli.smoke";

const CATALOGUE = readCommandCatalogue(COMMAND_CATALOGUE_FIXTURE)!;

beforeEach(() => {
  // Motion off: the demo state machine must jump to terminal states so these
  // tests assert results, not timers.
  Object.defineProperty(window.navigator, "webdriver", { value: true, configurable: true });
});
afterEach(cleanup);

function mount(props: { role?: CliRole; outcome?: CliOutcome; initialCommand?: string | null; operationRef?: string | null } = {}) {
  return render(
    <AdminActionDrawerScreen
      catalogue={CATALOGUE}
      selected={null}
      onSelect={() => {}}
      {...props}
    />,
  );
}

const pick = (title: string) => {
  const row = [...document.querySelectorAll(".exec-cli-row")].find((r) =>
    (r.textContent ?? "").includes(title),
  );
  expect(row, title).toBeTruthy();
  fireEvent.click(row!);
};

const drawer = () => screen.getByLabelText("Command drawer");

describe("the task catalog — six groups, twenty-four commands", () => {
  it("renders every group name and every action row", () => {
    const { container } = mount();
    for (const g of CLI_GROUPS) expect(screen.getByText(g)).toBeTruthy();
    expect(container.querySelectorAll(".exec-cli-row")).toHaveLength(CLI_ACTIONS.length);
    expect(CLI_ACTIONS).toHaveLength(24);
  });

  it("shows only the first CLI line on a row — the rest lives in the drawer", () => {
    mount();
    const row = [...document.querySelectorAll(".exec-cli-row")].find((r) =>
      (r.textContent ?? "").includes("Performance & NAV"),
    )!;
    expect(row.querySelector(".exec-cli-rowcli")?.textContent).toBe(
      "cli performance account --account-id …",
    );
  });

  it("keeps the published F0 catalogue reachable below, all sixty-four rows", () => {
    const { container } = mount();
    expect(container.querySelectorAll(".exec-admin-row")).toHaveLength(64);
    expect(screen.getByText(/Full published catalogue/)).toBeTruthy();
  });

  it("quotes the live relay state above the demo — the F0 truth stays first", () => {
    mount();
    expect(screen.getByText(/command relay is/)).toBeTruthy();
    expect(screen.getByText(/EX_BE_05B_F0_CONTRACT_ONLY/)).toBeTruthy();
  });
});

describe("honesty rails on every drawer", () => {
  it("declares the SMOKE demo at the point of interaction", () => {
    mount();
    expect(drawer().textContent).toContain("SMOKE DATA");
    expect(drawer().textContent).toContain("BR-EX-68");
  });

  it("joins a command to its published catalogue entry when one exists", () => {
    mount();
    pick("Account policy");
    expect(drawer().textContent).toContain("published as");
    expect(drawer().textContent).toContain("account/policy");
    expect(drawer().textContent).toContain("not reachable");
  });

  it("says plainly when a command is not in catalogue rev 2", () => {
    mount(); // default selection: Change allocation
    expect(drawer().textContent).toContain("not in published catalogue rev 2");
  });
});

describe("read commands — terminal, run, watch", () => {
  it("shows the READ-ONLY banner, the run hint and the ghost CLI before Run", () => {
    mount();
    pick("System health");
    const d = drawer();
    expect(d.textContent).toContain("READ-ONLY");
    expect(d.textContent).toContain("no admin password (CLI)");
    expect(d.textContent).toContain("press Run to execute");
    expect(d.querySelector(".exec-cli-ghost")?.textContent).toBe("cli health");
  });

  it("prints the transcript verbatim with exit code, toned per line", () => {
    mount();
    pick("System health");
    fireEvent.click(screen.getByRole("button", { name: /Run ▸ read-only/ }));
    const lines = [...drawer().querySelectorAll(".exec-cli-outline")];
    expect(lines[0].textContent).toBe("$ cli health");
    expect(lines[0].getAttribute("data-tone")).toBe("cmd");
    expect(lines.at(-1)?.textContent).toBe("exit 0 · 6/6 READY");
    expect(drawer().textContent).toContain("exit codes verbatim");
  });

  it("marks rejected sizing lines bad and keeps the trace", () => {
    mount();
    pick("Sizing explanations");
    fireEvent.click(screen.getByRole("button", { name: /Run ▸ read-only/ }));
    const bad = [...drawer().querySelectorAll('.exec-cli-outline[data-tone="bad"]')];
    expect(bad.some((l) => l.textContent?.includes("MAX_POSITION_NOTIONAL"))).toBe(true);
  });

  it("watch is a banner owned by the row's freshness, toggleable", () => {
    mount();
    pick("Capital history");
    fireEvent.click(screen.getByRole("button", { name: /◉ Watch/ }));
    expect(drawer().textContent).toContain("freshness belongs to the row, not the screen");
    fireEvent.click(screen.getByRole("button", { name: /Watch ON/ }));
    expect(drawer().textContent).not.toContain("freshness belongs to the row");
  });
});

describe("target & parameters — declared before run", () => {
  it("renders every allocation parameter with its registry source", () => {
    mount();
    const d = drawer();
    for (const p of CLI_PARAMS.alloc) {
      expect(d.textContent).toContain(p.k);
      expect(d.textContent).toContain(p.v);
    }
    expect(d.textContent).toContain("≤ R2 cap 100,000");
    expect(d.textContent).toContain("never free-typed");
  });
});

describe("the allocation plan pane (hi-fi default)", () => {
  it("draws BEFORE and AFTER with the warn marginal risk", () => {
    mount();
    const d = drawer();
    expect(d.textContent).toContain("50,000.00");
    expect(d.textContent).toContain("75,000.00");
    expect(d.querySelector('[data-tone="warn"]')?.textContent).toBe("8.9%");
  });

  it("links the policy checks to the R2 approval and the blast-radius deployment", () => {
    mount();
    const d = drawer();
    expect(d.querySelector('a[href="/governance/approvals/AP-207/r2"]')?.textContent).toBe("AP-207");
    expect(d.querySelector('a[href="/deployments/paper/dep_74"]')).toBeTruthy();
    expect(d.textContent).toContain("concentration +4.6% — warning, not blocking");
  });

  it("shows the equivalent CLI as read-only audit text and the required reason", () => {
    mount();
    const d = drawer();
    expect(d.textContent).toContain("Equivalent CLI — read-only, audit/training");
    expect(d.textContent).toContain("--movement-type ALLOCATE");
    expect(d.textContent).toContain("lands in portfolio_audit_log");
    expect(d.textContent).toContain("Scale within R2 cap after 12 clean observation days.");
  });
});

describe("plan → preflight → two-man rule → apply → verify", () => {
  const genPlan = () => fireEvent.click(screen.getByRole("button", { name: "Generate plan" }));

  it("starts with Apply disabled — needs plan", () => {
    mount();
    const needs = screen.getByRole("button", { name: /Apply — needs plan/ }) as HTMLButtonElement;
    expect(needs.disabled).toBe(true);
  });

  it("generates cmd_9f12 and completes preflight with the declared WARN", () => {
    mount();
    genPlan();
    const d = drawer();
    expect(d.textContent).toContain("PLAN cmd_9f12 generated");
    expect(d.textContent).toContain("5 ✓ · 1 WARN — CLEAR TO APPLY");
    expect(d.textContent).toContain("concentration +4.6% — WARN, non-blocking");
    expect(d.textContent).toContain("APPLY runs immediately on the EXECUTION cell");
  });

  it("OPERATOR needs the single-use admin key, and the demo issues it", () => {
    mount({ role: "OPERATOR" });
    genPlan();
    expect(drawer().textContent).toContain("ADMIN EXECUTION KEY REQUIRED");
    fireEvent.click(screen.getByRole("button", { name: /Request admin key/ }));
    expect(drawer().textContent).toContain("KEY ISSUED — AGK-7F2C-9D41");
    expect(drawer().textContent).toContain("single-use");
    expect(screen.getByRole("button", { name: /Apply after step-up/ })).toBeTruthy();
  });

  it("ADMIN applies without a grant", () => {
    mount({ role: "ADMIN" });
    genPlan();
    expect(drawer().textContent).not.toContain("ADMIN EXECUTION KEY REQUIRED");
    expect(screen.getByRole("button", { name: /Apply after step-up/ })).toBeTruthy();
  });

  it("VERIFIED: the timeline says 202 is not success, and the op links to Operations", () => {
    mount({ role: "ADMIN" });
    genPlan();
    fireEvent.click(screen.getByRole("button", { name: /Apply after step-up/ }));
    const d = drawer();
    expect(d.textContent).toContain("202 — NOT success yet");
    expect(d.querySelector('a[href="/execution/operations?operation=op_1251"]')?.textContent).toBe(
      "op_1251",
    );
    expect(d.textContent).toContain("VERIFIED — terminal state confirmed by authoritative ACK");
    expect(d.textContent).toContain("PARTIAL never renders green");
    expect(d.textContent).toContain("step-up 10:43:58Z");
  });

  it("PARTIAL: residue is a real outcome with its own re-apply path", () => {
    mount({ role: "ADMIN", outcome: "PARTIAL" });
    genPlan();
    fireEvent.click(screen.getByRole("button", { name: /Apply after step-up/ }));
    const d = drawer();
    expect(d.textContent).toContain("PARTIAL — not success, residue must be resolved");
    expect(d.textContent).toContain("1 of 2 sub-intents timed out");
    expect(screen.getByRole("button", { name: "Plan residue re-apply" })).toBeTruthy();
    expect(d.querySelector('a[href="/execution/operations"]')?.textContent).toContain(
      "open reconciliation",
    );
  });
});

describe("emergency close — danger flow", () => {
  it("prints the read-only flatten plan and the typed CLOSE confirm", () => {
    mount({ initialCommand: "emergency" });
    const d = drawer();
    expect(d.textContent).toContain("Read-only flatten plan — paper-binance-carry-v32");
    expect(d.textContent).toContain("REDUCING (blocks new opens, keeps reduces)");
    expect(d.textContent).toContain("Type CLOSE to confirm");
    expect(d.textContent).toContain("records are never deleted");
  });

  it("its apply is the danger color and the PARTIAL timeline names the residue", () => {
    mount({ initialCommand: "emergency", role: "ADMIN", outcome: "PARTIAL" });
    fireEvent.click(screen.getByRole("button", { name: "Generate plan" }));
    const apply = screen.getByRole("button", { name: /Apply after step-up/ });
    expect(apply.getAttribute("data-danger")).toBe("true");
    fireEvent.click(apply);
    expect(drawer().textContent).toContain("residue BTCUSDT 0.0100");
  });
});

describe("generic mutations — exact request preview", () => {
  it("shows METHOD/PATH/PAYLOAD as the CLI prints it, plus authority checks", () => {
    mount({ initialCommand: "pfState" });
    const d = drawer();
    expect(d.textContent).toContain("PATH: /v1/admin/portfolios/PF-MAIN/state");
    expect(d.textContent).toContain("Authority & gate checks");
    expect(d.textContent).toContain("halting needs no approval — RESUMING checks approvals/readiness");
  });
});

describe("blocked and denied stay blocked and denied", () => {
  it("labReset: NOT EXPOSED IN PORTAL, and no mutation footer", () => {
    mount({ initialCommand: "labReset" });
    const d = drawer();
    expect(d.textContent).toContain("NOT EXPOSED IN PORTAL");
    expect(d.textContent).toContain("host-CLI-only");
    expect(d.textContent).toContain("no mutation footer — nothing to plan or apply");
    expect(d.querySelectorAll(".exec-cli-apply, .exec-cli-genplan")).toHaveLength(0);
  });

  it("a Viewer sees the role banner, keeps the catalog, gets no flow", () => {
    mount({ role: "VIEWER" });
    const d = drawer();
    expect(d.textContent).toContain("ROLE GRANT REQUIRED");
    expect(d.textContent).toContain("visibility ≠ authority");
    expect(d.textContent).toContain("no mutation footer");
    expect(d.querySelectorAll(".exec-cli-steps")).toHaveLength(0);
    // Read commands remain available to a Viewer.
    pick("System health");
    expect(screen.getByRole("button", { name: /Run ▸ read-only/ })).toBeTruthy();
  });
});

describe("the container wires demo states as addresses", () => {
  it("?cmd=&role=&outcome= preselect the drawer state", async () => {
    render(
      <MemoryRouter initialEntries={["/administration/actions?cmd=emergency&role=VIEWER"]}>
        <AdminCatalogueContainer api={createFixtureApi()} />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/ROLE GRANT REQUIRED/)).toBeTruthy();
    expect(screen.getByText(/actor Stan · Viewer/)).toBeTruthy();
  });

  it("?action=rotate_credential is answered honestly with a link back to Accounts", async () => {
    render(
      <MemoryRouter initialEntries={["/administration/actions?action=rotate_credential&binding=deribit_main_01"]}>
        <AdminCatalogueContainer api={createFixtureApi()} />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/credential-rotation command yet/)).toBeTruthy();
    expect(
      document.querySelector('a[href="/deployments/accounts?binding=deribit_main_01"]'),
    ).toBeTruthy();
  });

  it("?operation= is answered honestly with a link back to the Operations Queue", async () => {
    render(
      <MemoryRouter initialEntries={["/administration/actions?operation=op_1251"]}>
        <AdminCatalogueContainer api={createFixtureApi()} />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/no operation lookup yet/)).toBeTruthy();
    expect(
      document.querySelector('a[href="/execution/operations?operation=op_1251"]'),
    ).toBeTruthy();
  });
});
