/**
 * Phase 12 — the evidence F4 requires.
 *
 * The test that matters most is "injected broker data is rejected, not merely
 * hidden". A screen that omits a value still holds it; a reader that drops it
 * makes the leak impossible rather than unlikely, and these assert the value is
 * gone from the parsed object, not just absent from the DOM.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { liveGuardRules, readLiveFullOperations } from "./liveFull";
import { LIVE_FULL_FIXTURE } from "./certification.fixtures";
import { LiveFullOperationsScreen } from "./screens/LiveFullOperations";
import { LiveFullOperationsContainer } from "./screens/containers";
import { createFixtureApi } from "./api/fixtureApi";

afterEach(cleanup);

const published = () =>
  JSON.parse(
    readFileSync(
      join(
        __dirname,
        "../../../../../packages/contracts/fixtures/execution-live-full-operations.unavailable.valid.json",
      ),
      "utf8",
    ),
  );

const live = () => readLiveFullOperations(LIVE_FULL_FIXTURE)!;
const patched = (mutate: (raw: Record<string, unknown>) => void) => {
  const raw = JSON.parse(JSON.stringify(LIVE_FULL_FIXTURE));
  mutate(raw);
  return readLiveFullOperations(raw)!;
};

describe("the inlined document has not drifted", () => {
  it("equals the published fixture", () => {
    expect(LIVE_FULL_FIXTURE).toEqual(published());
  });
});

describe("#1 — no fabricated zero or runtime state", () => {
  it("keeps runtime null and renders it as not stated", () => {
    expect(live().runtimeState).toBeNull();
    const { container } = render(<LiveFullOperationsScreen live={live()} />);
    const head = container.querySelector(".exec-live-head")!;
    expect(head.textContent).toMatch(/runtime not stated/);
    expect(head.textContent).not.toMatch(/HALTED|RUNNING/);
  });

  it("renders every KPI without inventing a figure", () => {
    const r = live();
    expect(r.kpis).toHaveLength(5);
    const { container } = render(<LiveFullOperationsScreen live={r} />);
    const kpis = container.querySelectorAll(".exec-live-kpi");
    expect(kpis).toHaveLength(5);
    for (const kpi of kpis) expect(kpi.querySelector(".exec-live-kpivalue")).toBeNull();
  });

  it("states fixture and PRODUCTION INACTIVE", () => {
    render(<LiveFullOperationsScreen live={live()} />);
    expect(screen.getByText(/fixture · PRODUCTION INACTIVE/)).toBeTruthy();
    expect(screen.getByText(/realtime inactive/)).toBeTruthy();
  });
});

describe("#2/#3 — broker data is rejected, not hidden", () => {
  it("drops an injected broker KPI value at the reader", () => {
    const injected = patched((raw) => {
      const kpis = raw.kpis as Record<string, unknown>[];
      const brokerKpi = kpis.find((k) => k.key === "broker_equity")!;
      brokerKpi.value = "999999.99";
    });
    const kpi = injected.kpis.find((k) => k.key === "broker_equity")!;
    // Gone from the PARSED OBJECT, not merely from the DOM. A value that
    // reaches a prop reaches the page eventually.
    expect(kpi.value).toBeNull();
    expect(kpi.suppressed).toBe(true);
    expect(injected.suppressedBrokerFields).toContain("kpi:broker_equity");
  });

  it("keeps the injected value out of the rendered page entirely", () => {
    const injected = patched((raw) => {
      const kpis = raw.kpis as Record<string, unknown>[];
      kpis.find((k) => k.key === "broker_equity")!.value = "999999.99";
    });
    const { container } = render(<LiveFullOperationsScreen live={injected} />);
    expect(container.textContent).not.toContain("999999.99");
  });

  it("does not suppress a non-broker KPI", () => {
    const injected = patched((raw) => {
      const kpis = raw.kpis as Record<string, unknown>[];
      kpis.find((k) => k.key === "capital")!.value = "1234.5600";
    });
    const capital = injected.kpis.find((k) => k.key === "capital")!;
    expect(capital.value).toBe("1234.5600");
    expect(capital.suppressed).toBe(false);
  });

  it("shows broker figures once the server says consistency is verified", () => {
    const verified = patched((raw) => {
      (raw.broker_consistency as Record<string, unknown>).broker_values_visible = true;
      const kpis = raw.kpis as Record<string, unknown>[];
      kpis.find((k) => k.key === "broker_equity")!.value = "10000.84";
    });
    expect(verified.kpis.find((k) => k.key === "broker_equity")!.value).toBe("10000.84");
  });

  it("treats an absent visibility flag as suppression", () => {
    const missing = patched((raw) => {
      delete (raw.broker_consistency as Record<string, unknown>).broker_values_visible;
      const kpis = raw.kpis as Record<string, unknown>[];
      kpis.find((k) => k.key === "broker_equity")!.value = "1";
    });
    // Absent is not permission.
    expect(missing.kpis.find((k) => k.key === "broker_equity")!.value).toBeNull();
  });
});

describe("#4 — suppressed is not unavailable", () => {
  it("reads the broker panel as suppressed", () => {
    expect(live().panels.broker.suppressed).toBe(true);
    expect(live().panels.internal.suppressed).toBe(false);
  });

  it("says the Portal is withholding rather than failing to read", () => {
    render(<LiveFullOperationsScreen live={live()} />);
    const broker = screen.getByLabelText("Broker");
    expect(within(broker).getByText(/Suppressed by policy/)).toBeTruthy();
    expect(within(broker).getByText(/withholding this, not failing to read/)).toBeTruthy();
  });

  it("marks it apart from the other two panels in the markup", () => {
    const { container } = render(<LiveFullOperationsScreen live={live()} />);
    expect(container.querySelectorAll('[data-suppressed="true"]').length).toBeGreaterThan(0);
    const internal = screen.getByLabelText("Internal");
    expect(internal.getAttribute("data-suppressed")).toBe("false");
  });
});

describe("#5 — the two guard rules, stated separately", () => {
  it("splits the token into suppression and gap rules", () => {
    const rules = liveGuardRules(live());
    expect(rules.suppression).toMatch(/Every broker-derived value is suppressed/);
    expect(rules.suppression).toMatch(/policy decision, not a missing reading/);
    expect(rules.gapRule).toMatch(/blocks risk-increasing actions and does not block protective/);
  });

  it("blocks R4 when nobody can say whether a gap exists", () => {
    // `gap_detected` is null. Not knowing is not the same as knowing there is
    // none, and this is where the difference costs money.
    expect(live().projectionContinuity!.gapDetected).toBeNull();
    expect(liveGuardRules(live()).r4Blocked).toBe(true);
  });

  it("stops blocking only when the server states there is no gap", () => {
    const clean = patched((raw) => {
      (raw.projection_continuity as Record<string, unknown>).gap_detected = false;
    });
    expect(liveGuardRules(clean).r4Blocked).toBe(false);
  });

  it("blocks when a gap is detected", () => {
    const gapped = patched((raw) => {
      (raw.projection_continuity as Record<string, unknown>).gap_detected = true;
    });
    expect(liveGuardRules(gapped).r4Blocked).toBe(true);
  });

  it("renders gap null as not stated, never as none", () => {
    render(<LiveFullOperationsScreen live={live()} />);
    const continuity = screen.getByLabelText("Projection continuity");
    expect(within(continuity).getByText(/gap not stated/)).toBeTruthy();
  });
});

describe("#6 — actions absent while invisible", () => {
  it("draws neither group", () => {
    const { container } = render(<LiveFullOperationsScreen live={live()} />);
    expect(container.querySelector(".exec-live-actions")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says an unblocked protective action is still not executable", () => {
    // `source_gap_blocks: false` on R3 must not be read as "R3 can be run".
    expect(live().commandPolicy!.protective!.sourceGapBlocks).toBe(false);
    render(<LiveFullOperationsScreen live={live()} />);
    expect(screen.getByText(/not the same as it being executable/)).toBeTruthy();
  });

  it("draws them once the server makes them visible, blocking only R4", () => {
    const visible = patched((raw) => {
      const policy = raw.command_policy as Record<string, Record<string, unknown>>;
      policy.protective.visible = true;
      policy.protective.enabled = true;
      policy.risk_increasing.visible = true;
      policy.risk_increasing.enabled = true;
    });
    render(<LiveFullOperationsScreen live={visible} />);
    expect(screen.getByRole("button", { name: "Protective action" }).hasAttribute("disabled")).toBe(false);
    expect(
      screen.getByRole("button", { name: "Risk-increasing action" }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("fails closed on an unreadable source_gap_blocks", () => {
    const odd = patched((raw) => {
      ((raw.command_policy as Record<string, Record<string, unknown>>).protective).source_gap_blocks = "no";
    });
    expect(odd.commandPolicy!.protective!.sourceGapBlocks).toBe(true);
  });
});

describe("the predecessor canary envelope is labelled inactive", () => {
  it("says it does not govern Live Full", () => {
    expect(live().predecessorEnvelope!.activeForLiveFull).toBe(false);
    render(<LiveFullOperationsScreen live={live()} />);
    const pred = screen.getByLabelText("Predecessor canary envelope");
    expect(within(pred).getByText(/NOT active for Live Full/)).toBeTruthy();
  });

  it("carries the caps as exact strings", () => {
    const e = live().predecessorEnvelope!;
    expect(e.capitalCap).toBe("5000");
    expect(e.dailyLossCap).toBe("250");
  });

  it("shows a typed gap when the predecessor is missing", () => {
    const raw = JSON.parse(JSON.stringify(LIVE_FULL_FIXTURE));
    delete raw.predecessor_canary_envelope;
    render(<LiveFullOperationsScreen live={readLiveFullOperations(raw)!} />);
    expect(screen.getByText(/absence is a gap rather than a default/)).toBeTruthy();
  });

  it("treats an unreadable active flag as inactive", () => {
    const odd = patched((raw) => {
      (raw.predecessor_canary_envelope as Record<string, unknown>).active_for_live_full = "yes";
    });
    expect(odd.predecessorEnvelope!.activeForLiveFull).toBe(false);
  });
});

describe("the reader fails closed", () => {
  it("returns null without a deployment", () => {
    expect(readLiveFullOperations({})).toBeNull();
    expect(readLiveFullOperations(null)).toBeNull();
  });

  it("reads the four activity flags fail-closed", () => {
    const raw = JSON.parse(JSON.stringify(LIVE_FULL_FIXTURE));
    raw.source_side_effect_requested = "no";
    raw.runtime_activation_requested = "no";
    raw.promotion_execution_requested = "no";
    raw.production_command_active = "yes";
    const parsed = readLiveFullOperations(raw)!;
    expect(parsed.sourceSideEffectRequested).toBe(true);
    expect(parsed.runtimeActivationRequested).toBe(true);
    expect(parsed.promotionExecutionRequested).toBe(true);
    expect(parsed.productionCommandActive).toBe(false);
  });

  it("publishes no realtime stream url while inactive", () => {
    expect(live().realtimeActive).toBe(false);
    expect(live().realtimeStreamUrl).toBeNull();
  });
});

describe("the container fetches through the port", () => {
  it("renders the screen", async () => {
    render(<LiveFullOperationsContainer api={createFixtureApi()} deploymentId="dep_88" />);
    expect(await screen.findByLabelText("Stage guard")).toBeTruthy();
  });

  it("shows the port's failure rather than a guard band over nothing", async () => {
    render(
      <LiveFullOperationsContainer
        api={createFixtureApi({ unavailableEndpoints: ["getLiveFullOperations"] })}
        deploymentId="dep_88"
      />,
    );
    await waitFor(() => expect(screen.queryByLabelText("Stage guard")).toBeNull());
  });
});
