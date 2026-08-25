/**
 * EL-V2-06 — stage workbenches share the Paper anatomy without erasing
 * their safety differences. Guard budget, state matrix, dark commands,
 * the VNM session timeline, and the "no local clone" gate.
 */
import { cleanup, render, screen, within, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PaperWorkbench } from "./screens/PaperWorkbench";
import { SandboxCertificationScreen } from "./screens/SandboxCertification";
import { CanaryControlRoomScreen } from "./screens/CanaryControlRoom";
import { LiveFullOperationsScreen } from "./screens/LiveFullOperations";
import { SessionTimeline, localMinute } from "./components/sessionTimeline";
import { readSandboxCertification, readCanaryControlRoom } from "./certification";
import { readLiveFullOperations } from "./liveFull";
import { SANDBOX_CERTIFICATION_FIXTURE, CANARY_ROOM_FIXTURE, LIVE_FULL_FIXTURE } from "./certification.fixtures";
import { vnmWorkbench, VNM_OPEN } from "./vnm.fixtures";
import { paperHandlers } from "./testHandlers";
import { VN_MARKET } from "./vnCalendar";

afterEach(cleanup);

const sandbox = () => readSandboxCertification(SANDBOX_CERTIFICATION_FIXTURE)!;
const canary = () => readCanaryControlRoom(CANARY_ROOM_FIXTURE)!;
const live = () => readLiveFullOperations(LIVE_FULL_FIXTURE)!;

describe("one anatomy, four stages", () => {
  const cases = [
    ["Paper VNM", () => render(<PaperWorkbench {...paperHandlers()} {...vnmWorkbench()} />), 0],
    ["Sandbox", () => render(<SandboxCertificationScreen certification={sandbox()} />), 0],
    ["Canary", () => render(<CanaryControlRoomScreen room={canary()} />), 1],
    ["Live", () => render(<LiveFullOperationsScreen live={live()} />), 1],
  ] as const;
  it.each(cases)("%s renders the shared skeleton with its guard budget", (_name, mount, bands) => {
    const { container } = mount();
    expect(container.querySelector(".exec-ws")).not.toBeNull();
    expect(container.querySelector(".exec-masthead")).not.toBeNull();
    expect(container.querySelector(".exec-strip")).not.toBeNull();
    expect(container.querySelector(".exec-context-rail")).not.toBeNull();
    expect(container.querySelector(".exec-tabs-strip")).not.toBeNull();
    expect(container.querySelectorAll(".exec-guard-band")).toHaveLength(bands);
  });
  it("no stage screen carries a local masthead/KPI clone — all import the workspace primitives", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    for (const f of ["PaperWorkbench", "SandboxCertification", "CanaryControlRoom", "LiveFullOperations"]) {
      const src = readFileSync(join(here, "screens", `${f}.tsx`), "utf8");
      expect(src, f).toMatch(/from "\.\.\/components\/workspace"/);
      expect(src, f).not.toMatch(/<h1[\s>]/);
      expect(src, f).not.toMatch(/exec-(canary|live|cert)-kpis/);
    }
  });
});

describe("state matrix", () => {
  it("VNM OPEN vs CLOSED: timeline marker, PAUSED badge and the calendar banner", () => {
    const closed = render(<PaperWorkbench {...paperHandlers()} {...vnmWorkbench()} />);
    expect(closed.container.querySelector(".exec-session-timeline")?.getAttribute("data-phase")).toBe("CLOSED_BY_CALENDAR");
    expect(screen.getByText(/EXECUTION · PAUSED/)).toBeTruthy();
    expect(closed.container.querySelector(".exec-paper-calendar")).not.toBeNull();
    cleanup();
    const open = render(<PaperWorkbench {...paperHandlers()} {...vnmWorkbench(VNM_OPEN)} />);
    expect(open.container.querySelector(".exec-session-timeline")?.getAttribute("data-phase")).toBe("OPEN");
    expect(open.container.querySelector(".exec-paper-calendar")).toBeNull();
  });
  it("Sandbox NONE vs CRITICAL: a critical finding fails closed and names itself as a blocker", () => {
    const clean = render(<SandboxCertificationScreen certification={sandbox()} />);
    expect(clean.container.querySelector(".exec-cert-critical")).toBeNull();
    cleanup();
    const c = sandbox();
    const critical = {
      ...c,
      findings: { ...c.findings, rows: [...c.findings.rows, { findingId: "f_crit", severity: "CRITICAL", status: "OPEN", identity: "BTCUSDT position", localValue: "0", brokerValue: "0.0100" }] },
    };
    render(<SandboxCertificationScreen certification={critical} />);
    expect(screen.getByRole("alert").textContent).toContain("fail-closed");
    expect(screen.getByText("CRITICAL BTCUSDT position")).toBeTruthy();
    expect(screen.getByText("Critical open").parentElement?.textContent).toContain("1");
  });
  it("Canary OK vs STALE: a stale broker snapshot blocks scale-up and leaves protective actions alone", () => {
    const room = canary();
    const withPolicy = {
      ...room,
      commandPolicy: {
        productionCommandActive: true,
        guardSemantics: "protective first",
        protective: { riskTier: "T1", visible: true, enabled: true, brokerSyncBlocks: false, blockerCodes: [] },
        scaleUp: { riskTier: "T3", visible: true, enabled: true, brokerSyncBlocks: true, blockerCodes: [] },
      },
    };
    const ok = render(<CanaryControlRoomScreen room={withPolicy} />);
    expect(screen.getAllByText(/GUARDED/).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/READINESS DEGRADED/)).toBeNull();
    expect(within(ok.container.querySelector('[data-weight="protective"]') as HTMLElement).getByRole("button")).toHaveProperty("disabled", false);
    cleanup();
    const stale = render(<CanaryControlRoomScreen room={withPolicy} brokerStale />);
    expect(screen.getByText(/READINESS DEGRADED/)).toBeTruthy();
    expect(within(stale.container.querySelector('[data-weight="protective"]') as HTMLElement).getByRole("button")).toHaveProperty("disabled", false);
    fireEvent.click(screen.getByRole("tab", { name: /Guard rule/ }));
    const risk = stale.container.querySelector('[data-weight="risk"]') as HTMLElement;
    expect(within(risk).getByRole("button")).toHaveProperty("disabled", true);
    expect(within(risk).getByText(/Blocked while the broker snapshot is stale/)).toBeTruthy();
    // Protective sits in the rail; scale-up sits under the guard rule — different places, different weight.
    expect(stale.container.querySelector('.exec-context-rail [data-weight="protective"]')).not.toBeNull();
    expect(stale.container.querySelector('.exec-context-rail [data-weight="risk"]')).toBeNull();
  });
  it("Live OK vs MISMATCH: broker truth replaces presentation — banner in the chart slot, KPIs suppressed, tiles withheld", () => {
    const l = { ...live(), brokerConsistency: { ...live().brokerConsistency!, brokerValuesVisible: true } };
    const ok = render(<LiveFullOperationsScreen live={l} />);
    expect(ok.container.querySelector(".exec-mismatch-slot")).toBeNull();
    cleanup();
    const mismatch = {
      ...l,
      brokerConsistency: { state: "MISMATCH", mismatchBehavior: "SUPPRESS_BROKER_VALUES", brokerValuesVisible: false, findingHref: "/x", dryRunReconcileHref: null, blockerCodes: ["BROKER_MISMATCH"] },
      kpis: l.kpis.map((k, i) => (i === 0 ? { ...k, value: null, suppressed: true } : k)),
      panels: Object.fromEntries(Object.entries(l.panels).map(([k, v]) => [k, k === "broker" ? { ...v, suppressed: true } : v])),
    };
    const m = render(<LiveFullOperationsScreen live={mismatch} />);
    expect(m.container.querySelector(".exec-mismatch-slot")).not.toBeNull();
    expect(m.container.querySelector(".exec-chart-tile")).toBeNull();
    expect(screen.getByText("MISMATCH")).toBeTruthy();
    expect(screen.getAllByText("suppressed").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("BROKER_MISMATCH")).toBeTruthy();
    expect(m.container.querySelector('.exec-source-tile[data-suppressed]')).not.toBeNull();
  });
});

describe("commands stay dark", () => {
  it("every command button on Canary and Live is disabled with a reason unless the policy enables it", () => {
    const c = render(<CanaryControlRoomScreen room={canary()} />);
    const l = render(<LiveFullOperationsScreen live={live()} />);
    for (const root of [c.container, l.container]) {
      const buttons = Array.from(root.querySelectorAll(".exec-canary-actions button, .exec-live-actions button")) as HTMLButtonElement[];
      for (const b of buttons) expect(b.disabled, b.textContent ?? "").toBe(true);
    }
  });
  it("Sandbox actions are hidden from non-admins and blocked with codes for admins", () => {
    const c = sandbox();
    render(<SandboxCertificationScreen certification={{ ...c, actorRoles: ["OPERATOR"] }} />);
    expect(screen.queryByRole("button", { name: /Sandbox Exit Review/ })).toBeNull();
    expect(screen.getByText(/Admin operators only/)).toBeTruthy();
  });
});

describe("session timeline", () => {
  it("draws the HOSE phases in order with a now marker from venue-local time", () => {
    const { container } = render(<SessionTimeline calendar={VN_MARKET} venueLocalTime="2026-08-21T10:15:00" phase="OPEN" />);
    const blocks = Array.from(container.querySelectorAll(".exec-session-block")).map((b) => b.getAttribute("data-kind"));
    expect(blocks).toEqual(["auction", "continuous", "break", "continuous", "auction"]);
    expect(container.querySelector(".exec-session-now")?.getAttribute("aria-label")).toBe("now 10:15 venue time");
    expect(screen.getByText(/open 09:00–14:45 · now 10:15 · SESSION OPEN/)).toBeTruthy();
  });
  it("says the venue clock is not published rather than guessing", () => {
    const { container } = render(<SessionTimeline calendar={VN_MARKET} venueLocalTime={null} phase={null} />);
    expect(container.querySelector(".exec-session-now")).toBeNull();
    expect(screen.getByText(/venue clock not published/)).toBeTruthy();
    expect(localMinute("garbage")).toBeNull();
  });
});
