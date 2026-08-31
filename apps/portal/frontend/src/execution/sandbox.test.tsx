/**
 * Sandbox Overview (entry for WF 1d) and the Sandbox Certification hi-fi body.
 *
 * The contract half of the workbench is covered in `certification.test.tsx`;
 * this file covers what the hi-fi added — the filters, the row target, the
 * deployment switcher, and the plan → apply → verify action bar. Every control
 * here is checked for being reachable and for doing what its label says,
 * because "looks like the hi-fi" and "can be operated" are different claims.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { SandboxOverview } from "./screens/SandboxOverview";
import { SandboxCertificationScreen } from "./screens/SandboxCertification";
import { readSandboxCertification } from "./certification";
import { SANDBOX_CERTIFICATION_FIXTURE } from "./certification.fixtures";
import { certSmoke, CERT_SMOKE_DATA, SANDBOX_SMOKE_DATA } from "./sandbox.smoke";

afterEach(cleanup);

const cert = () => readSandboxCertification(SANDBOX_CERTIFICATION_FIXTURE)!;

function overview() {
  return render(
    <MemoryRouter initialEntries={["/deployments/sandbox"]}>
      <Routes>
        <Route path="/deployments/sandbox" element={<SandboxOverview />} />
        <Route path="/deployments/sandbox/:id" element={<div>workbench for the row</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Sandbox Overview — entry screen for WF 1d (smoke until BR-EX-60)", () => {
  it("lists every deployment in certification and says the data is smoke", () => {
    overview();
    for (const r of SANDBOX_SMOKE_DATA.rows) expect(screen.getAllByText(new RegExp(r.dep)).length).toBeGreaterThan(0);
    expect(screen.getByText(/SMOKE DATA/)).toBeTruthy();
  });

  it("the progress bar draws seven segments per row, never a bare percentage", () => {
    const { container } = overview();
    const bars = container.querySelectorAll(".exec-sb-steps");
    expect(bars).toHaveLength(SANDBOX_SMOKE_DATA.rows.length);
    for (const bar of bars) expect(bar.querySelectorAll(".exec-sb-seg")).toHaveLength(7);
  });

  it("a filter chip narrows to the deployments that carry it, and back", () => {
    overview();
    // Scoped to the table: "Grid v2.1" also appears in the certified history,
    // and a filter that only looked global would pass without filtering.
    const table = () => screen.getByRole("table", { name: "Deployments in certification" });
    fireEvent.click(screen.getByRole("button", { name: /^Open findings/ }));
    expect(within(table()).getByText(/Grid v2.1/)).toBeTruthy();
    expect(within(table()).queryByText(/Carry v3.2/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^All \(/ }));
    expect(within(table()).getByText(/Carry v3.2/)).toBeTruthy();
  });

  it("the venue filter is disabled rather than absent — it needs BR-EX-60, and the screen says so", () => {
    overview();
    const okx = screen.getByRole("button", { name: "OKX TESTNET" });
    expect(okx).toHaveProperty("disabled", true);
    expect(okx.getAttribute("title")).toMatch(/BR-EX-60/);
  });

  it("a row opens its certification workbench, by click and by keyboard", () => {
    overview();
    fireEvent.click(screen.getByRole("button", { name: /Carry v3.2 dep_77/ }));
    expect(screen.getByText("workbench for the row")).toBeTruthy();
    cleanup();
    overview();
    fireEvent.keyDown(screen.getByRole("button", { name: /Grid v2.1 dep_91/ }), { key: "Enter" });
    expect(screen.getByText("workbench for the row")).toBeTruthy();
  });

  it("the stalled certification is marked in the row, not only in prose", () => {
    const { container } = overview();
    const stalled = container.querySelectorAll('.exec-sb-row[data-stalled="true"]');
    expect(stalled).toHaveLength(1);
    expect(within(stalled[0] as HTMLElement).getByText(/dep_91/)).toBeTruthy();
  });
});

describe("Sandbox Certification — the hi-fi body (smoke until BR-EX-61)", () => {
  it("the switcher marks the deployment being read and links the other one", () => {
    render(<SandboxCertificationScreen certification={cert()} deploymentId="dep_91" demo={certSmoke("dep_91")} />);
    const active = screen.getByText(/Grid v2.1 · dep_91/).closest("a")!;
    expect(active.getAttribute("aria-current")).toBe("page");
    const other = screen.getByText(/Carry v3.2 · dep_77/).closest("a")!;
    expect(other.getAttribute("href")).toBe("/deployments/sandbox/dep_77");
    expect(other.getAttribute("aria-current")).toBeNull();
  });

  it("reads the deployment in the route, not the one the fixture happens to carry", () => {
    render(<SandboxCertificationScreen certification={cert()} deploymentId="dep_91" demo={certSmoke("dep_91")} />);
    expect(screen.getByText(/acct-sbx-grid-okx/)).toBeTruthy();
    cleanup();
    render(<SandboxCertificationScreen certification={cert()} deploymentId="dep_77" demo={certSmoke("dep_77")} />);
    expect(screen.getByText(/acct-sbx-carry-okx/)).toBeTruthy();
  });

  it("a deployment with an open CRITICAL finding fails closed in the stepper and the banner", () => {
    render(<SandboxCertificationScreen certification={cert()} deploymentId="dep_91" demo={certSmoke("dep_91")} />);
    expect(screen.getByRole("alert").textContent).toMatch(/activation fail-closed/);
    expect(screen.getByText("✕ 1 critical")).toBeTruthy();
    // The smoke window is not a disabled button — it is not a control at all
    // while a critical finding is open, and it says which finding blocks it.
    expect(screen.queryByRole("button", { name: /Open smoke window/ })).toBeNull();
    expect(screen.getByText(/Open smoke window — blocked: critical finding/)).toBeTruthy();
  });

  it("each action opens its plan, and the plan's apply is disabled with the reason", () => {
    render(<SandboxCertificationScreen certification={cert()} deploymentId="dep_77" demo={certSmoke("dep_77")} />);
    for (const [name, title] of [
      [/Sync broker/, /broker snapshot sync/],
      [/Dry-run reconcile/, /reconciliation dry-run/],
      [/Open smoke window/, /smoke activation window/],
    ] as const) {
      fireEvent.click(screen.getByRole("button", { name }));
      const plan = screen.getByRole("region", { name: title });
      expect(within(plan).getByRole("button", { name: "Apply" })).toHaveProperty("disabled", true);
      expect(within(plan).getByRole("button", { name: "Apply" }).getAttribute("title")).toMatch(/BR-EX-61/);
      fireEvent.click(within(plan).getByRole("button", { name: "Close" }));
      expect(screen.queryByRole("region", { name: title })).toBeNull();
    }
  });

  it("the smoke plan the button previews is the plan the panel prints — one source, not two", () => {
    render(<SandboxCertificationScreen certification={cert()} deploymentId="dep_77" demo={certSmoke("dep_77")} />);
    fireEvent.click(screen.getByRole("button", { name: /Open smoke window/ }));
    const plan = screen.getByRole("region", { name: /smoke activation window/ });
    for (const row of CERT_SMOKE_DATA.dep_77.plan.rows) {
      expect(within(plan).getByText(row.v)).toBeTruthy();
    }
  });

  it("never states a runtime the contract did not publish", () => {
    const { container } = render(<SandboxCertificationScreen certification={cert()} deploymentId="dep_91" demo={certSmoke("dep_91")} />);
    const head = container.querySelector(".exec-cert-head")!;
    expect(head.textContent).toMatch(/runtime not stated/);
    expect(head.textContent).not.toMatch(/\bHALTED\b/);
  });
});
