/**
 * Phase 11 — the evidence F3 requires.
 *
 * Three of these are the reason the screen is careful. The guard cannot be
 * colour-only, five KPI slots must never render zero, and both action groups
 * must be ABSENT rather than disabled — each one is a way the page could look
 * like a canary that is running when none is.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { guardAsymmetry, readCanaryControlRoom } from "./certification";
import { CANARY_ROOM_FIXTURE } from "./certification.fixtures";
import { CanaryControlRoomScreen } from "./screens/CanaryControlRoom";
import { CanaryControlRoomContainer } from "./screens/containers";
import { createFixtureApi } from "./api/fixtureApi";

afterEach(cleanup);

const published = () =>
  JSON.parse(
    readFileSync(
      join(
        __dirname,
        "../../../../../packages/contracts/fixtures/execution-canary-control-room.unavailable.valid.json",
      ),
      "utf8",
    ),
  );

const room = () => readCanaryControlRoom(CANARY_ROOM_FIXTURE)!;
const patched = (mutate: (raw: Record<string, unknown>) => void) => {
  const raw = JSON.parse(JSON.stringify(CANARY_ROOM_FIXTURE));
  mutate(raw);
  return readCanaryControlRoom(raw)!;
};

describe("the inlined document has not drifted", () => {
  it("equals the published fixture", () => {
    expect(CANARY_ROOM_FIXTURE).toEqual(published());
  });
});

describe("the guard cannot be missed, and is not a colour", () => {
  it("says LIVE · CANARY in text a screen reader reaches", () => {
    render(<CanaryControlRoomScreen room={room()} />);
    const guard = screen.getByLabelText("Stage guard");
    expect(within(guard).getByText("LIVE · CANARY")).toBeTruthy();
    // The shield is decoration; the words carry the meaning.
    expect(guard.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });

  it("states fixture and PRODUCTION INACTIVE explicitly", () => {
    render(<CanaryControlRoomScreen room={room()} />);
    expect(screen.getByText(/fixture · PRODUCTION INACTIVE/)).toBeTruthy();
    expect(screen.getByText(/no canary is running/)).toBeTruthy();
  });

  it("would say ACTIVE only if the server did", () => {
    const active = patched((raw) => {
      raw.production_command_active = true;
    });
    render(<CanaryControlRoomScreen room={active} />);
    expect(screen.getByText(/PRODUCTION COMMAND ACTIVE/)).toBeTruthy();
  });
});

describe("five KPI slots never render zero", () => {
  it("reads all five and shows each as unavailable", () => {
    const r = room();
    expect(r.kpis).toHaveLength(5);
    expect(r.kpis.every((k) => k.value === null)).toBe(true);
    const { container } = render(<CanaryControlRoomScreen room={r} />);
    const kpis = container.querySelectorAll(".exec-canary-kpi");
    expect(kpis).toHaveLength(5);
    for (const kpi of kpis) {
      expect(kpi.querySelector(".exec-canary-kpiunavailable")).toBeTruthy();
      // A zero here is a measurement; the absence of one is not.
      expect(kpi.querySelector(".exec-canary-kpivalue")).toBeNull();
    }
  });

  it("renders a value when one is published, unchanged", () => {
    const withValue = patched((raw) => {
      (raw.kpis as Record<string, unknown>[])[0].value = "1234.5600";
    });
    render(<CanaryControlRoomScreen room={withValue} />);
    // Exact decimal string, not reformatted.
    expect(screen.getByText(/1234\.5600/)).toBeTruthy();
  });
});

describe("runtime_state stays null", () => {
  it("is null and renders as not stated", () => {
    expect(room().runtimeState).toBeNull();
    const { container } = render(<CanaryControlRoomScreen room={room()} />);
    expect(container.querySelector(".exec-canary-head")!.textContent).toMatch(/runtime not stated/);
  });

  it("never becomes RUNNING, HALTED or zero", () => {
    const { container } = render(<CanaryControlRoomScreen room={room()} />);
    const head = container.querySelector(".exec-canary-head")!;
    expect(head.textContent).not.toMatch(/RUNNING|HALTED/);
    expect(head.textContent).toMatch(/envelope day not stated/);
  });
});

describe("exact decimal caps are carried through untouched", () => {
  it("prints the strings the server sent", () => {
    const r = room();
    expect(r.envelope!.limits.capitalCap).toBe("5000");
    expect(r.envelope!.limits.grossNotionalCap).toBe("10000");
    expect(r.envelope!.limits.dailyLossCap).toBe("250");
    render(<CanaryControlRoomScreen room={r} />);
    const envelope = screen.getByLabelText("Canary envelope");
    // No thousands separator, no rounding: a cap the operator cannot match
    // against the server's own string is a cap they cannot check.
    expect(within(envelope).getByText(/^5000/)).toBeTruthy();
  });

  it("says consumed is unavailable rather than showing it against the cap", () => {
    render(<CanaryControlRoomScreen room={room()} />);
    expect(screen.getByText(/consumed against these caps is unavailable/)).toBeTruthy();
  });
});

describe("the broker-stale asymmetry is stated as two facts", () => {
  it("reads each group's own flag", () => {
    const policy = room().commandPolicy!;
    expect(policy.protective!.brokerSyncBlocks).toBe(false);
    expect(policy.scaleUp!.brokerSyncBlocks).toBe(true);
    expect(policy.guardSemantics).toBe("BROKER_STALE_BLOCKS_SCALE_ONLY");
  });

  it("describes it from the booleans, not from the summary string", () => {
    const guard = guardAsymmetry(room().commandPolicy);
    expect(guard.asymmetric).toBe(true);
    expect(guard.text).toMatch(/blocks scaling up and does not block protective/);
    expect(guard.text).toMatch(/what the Portal can SEE/);
  });

  it("stops claiming asymmetry if the booleans stop being asymmetric", () => {
    // The string could still say BROKER_STALE_BLOCKS_SCALE_ONLY while the
    // booleans say otherwise; the booleans are what the server enforces.
    const symmetric = patched((raw) => {
      ((raw.command_policy as Record<string, Record<string, unknown>>).protective).broker_sync_blocks = true;
    });
    const guard = guardAsymmetry(symmetric.commandPolicy);
    expect(guard.asymmetric).toBe(false);
    expect(guard.text).toMatch(/blocks every action/);
  });

  it("renders the two statements separately on screen", () => {
    render(<CanaryControlRoomScreen room={room()} />);
    const rule = screen.getByLabelText("Guard rule");
    expect(within(rule).getByText(/Protective actions are not blocked/)).toBeTruthy();
    expect(within(rule).getByText(/Scale-up is blocked/)).toBeTruthy();
  });

  it("fails closed when a group's flag cannot be read", () => {
    const unreadable = patched((raw) => {
      ((raw.command_policy as Record<string, Record<string, unknown>>).scale_up).broker_sync_blocks = "maybe";
    });
    // The safe error is refusing a scale, not permitting one.
    expect(unreadable.commandPolicy!.scaleUp!.brokerSyncBlocks).toBe(true);
  });

  it("says the rule was not published when a group is missing", () => {
    const missing = patched((raw) => {
      delete (raw.command_policy as Record<string, unknown>).scale_up;
    });
    expect(guardAsymmetry(missing.commandPolicy).text).toMatch(/was not published/);
  });
});

describe("both action groups stay absent while invisible", () => {
  it("draws no protective or scale control at all", () => {
    const { container } = render(<CanaryControlRoomScreen room={room()} />);
    expect(container.querySelector(".exec-canary-actions")).toBeNull();
    // Absent, not disabled: a greyed control advertises a capability that does
    // not exist and teaches that the blocker is negotiable.
    expect(screen.queryByRole("button", { name: /Protective action|Request scale/ })).toBeNull();
    expect(screen.getByText(/nothing here that could be issued/)).toBeTruthy();
  });

  it("draws them only once the server makes them visible", () => {
    const visible = patched((raw) => {
      const policy = raw.command_policy as Record<string, Record<string, unknown>>;
      policy.protective.visible = true;
      policy.protective.enabled = true;
      policy.scale_up.visible = true;
      policy.scale_up.enabled = true;
    });
    render(<CanaryControlRoomScreen room={visible} />);
    expect(screen.getByRole("button", { name: "Protective action" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Request scale" })).toBeTruthy();
  });

  it("blocks only scale-up when the broker is stale", () => {
    const visible = patched((raw) => {
      const policy = raw.command_policy as Record<string, Record<string, unknown>>;
      policy.protective.visible = true;
      policy.protective.enabled = true;
      policy.scale_up.visible = true;
      policy.scale_up.enabled = true;
    });
    render(<CanaryControlRoomScreen room={visible} brokerStale />);
    // The whole point of the screen.
    expect(screen.getByRole("button", { name: "Protective action" }).hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("button", { name: "Request scale" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/Blocked while the broker snapshot is stale/)).toBeTruthy();
  });

  it("treats an unreadable visible flag as invisible", () => {
    const odd = patched((raw) => {
      ((raw.command_policy as Record<string, Record<string, unknown>>).protective).visible = "yes";
    });
    expect(odd.commandPolicy!.protective!.visible).toBe(false);
  });
});

describe("the source panels degrade independently", () => {
  it("renders each of the eight frames", () => {
    render(<CanaryControlRoomScreen room={room()} />);
    for (const title of [
      "Internal", "Broker", "Difference", "Positions",
      "Blotter", "Series", "Envelope compliance", "Rollback readiness",
    ]) {
      expect(screen.getByLabelText(title), title).toBeTruthy();
    }
  });

  it("lets one differ from the rest", () => {
    const mixed = patched((raw) => {
      (raw.source_panels as Record<string, unknown>[])[0].panel_state = "stale";
    });
    expect(mixed.sourcePanels[0].panelState).toBe("stale");
    expect(mixed.sourcePanels[1].panelState).toBe("unavailable");
  });
});

describe("the reader fails closed", () => {
  it("returns null without a deployment", () => {
    expect(readCanaryControlRoom({})).toBeNull();
    expect(readCanaryControlRoom(null)).toBeNull();
  });

  it("reads the three side-effect flags fail-closed", () => {
    const raw = JSON.parse(JSON.stringify(CANARY_ROOM_FIXTURE));
    raw.source_side_effect_requested = "no";
    raw.runtime_activation_requested = "no";
    raw.promotion_execution_requested = "no";
    const parsed = readCanaryControlRoom(raw)!;
    expect(parsed.sourceSideEffectRequested).toBe(true);
    expect(parsed.runtimeActivationRequested).toBe(true);
    expect(parsed.promotionExecutionRequested).toBe(true);
  });

  it("treats an unreadable production_command_active as inactive", () => {
    const raw = JSON.parse(JSON.stringify(CANARY_ROOM_FIXTURE));
    raw.production_command_active = "yes";
    expect(readCanaryControlRoom(raw)!.productionCommandActive).toBe(false);
  });
});

describe("the container fetches through the port", () => {
  it("renders the room", async () => {
    render(<CanaryControlRoomContainer api={createFixtureApi()} deploymentId="dep_88" />);
    expect(await screen.findByLabelText("Stage guard")).toBeTruthy();
  });

  it("shows the port's failure rather than a guard band over nothing", async () => {
    render(
      <CanaryControlRoomContainer
        api={createFixtureApi({ unavailableEndpoints: ["getCanaryControlRoom"] })}
        deploymentId="dep_88"
      />,
    );
    await waitFor(() => expect(screen.queryByLabelText("Stage guard")).toBeNull());
  });
});
