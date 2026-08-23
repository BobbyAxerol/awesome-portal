/**
 * B10 — the stream is wired and stays shut.
 *
 * Every published fixture carries `stream_available: false`, so the assertion
 * that matters most here is a negative one: the factory is never called. A test
 * suite that only proved the connect path would pass while the client opened a
 * socket codex's stop gates forbid.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { COMMAND_CENTER_STREAM, readCommandCenter, streamGate } from "./commandCenter";
import { CC_FIXTURES } from "./commandCenter.fixtures";
import { jitterFor, useCommandCentreStream } from "./commandCenterStream";
import { CommandCenterScreen } from "./screens/CommandCenter";

afterEach(cleanup);

const snap = (name: keyof typeof CC_FIXTURES) => readCommandCenter(CC_FIXTURES[name])!;

/** A factory that records every attempt to open a socket. */
function spyFactory() {
  const opened: string[] = [];
  const factory = (url: string) => {
    opened.push(url);
    return {
      addEventListener: () => {},
      removeEventListener: () => {},
      close: () => {},
    } as unknown as EventSource;
  };
  return { opened, factory };
}

function Harness({
  name,
  factory,
}: {
  name: keyof typeof CC_FIXTURES;
  factory: ((url: string) => EventSource) | null;
}) {
  const snapshot = snap(name);
  const { live, reason } = useCommandCentreStream({
    snapshot,
    factory,
    fetchSnapshot: async () => ({ cursor: "c1", epoch: "e1", sequence: 1 }),
  });
  return (
    <>
      <span data-testid="reason">{reason}</span>
      <span data-testid="live">{live ? live.phase : "none"}</span>
    </>
  );
}

describe("the route exists, and that is not permission", () => {
  it("names the route the Control API actually mounts", () => {
    const controller = readFileSync(
      join(__dirname, "../../../../../apps/control-api/src/execution/realtime.controller.ts"),
      "utf8",
    );
    // The path is asserted against the controller rather than a copy, so a move
    // upstream fails here rather than as a 404 on the day it is switched on.
    expect(controller).toMatch(/@Get\("\/command-center\/stream"\)/);
    expect(COMMAND_CENTER_STREAM).toBe("/api/v1/execution/command-center/stream");
  });

  it("is declared in the realtime OpenAPI", () => {
    const paths = Object.keys(
      JSON.parse(
        readFileSync(
          join(__dirname, "../../../../../packages/contracts/openapi/execution-realtime.openapi.json"),
          "utf8",
        ),
      ).paths,
    );
    expect(paths).toContain(COMMAND_CENTER_STREAM);
  });
});

describe("the gate refuses while the stream is unpublished", () => {
  for (const name of ["busy", "empty", "partial", "stale", "unavailable"] as const) {
    it(`${name}: refuses, and says so without calling it a setting`, () => {
      const gate = streamGate(snap(name));
      expect(gate.allowed).toBe(false);
      expect(gate.reason).toMatch(/publishes no live stream/);
      // "live updates are off" would read as something an operator could turn
      // back on.
      expect(gate.reason).not.toMatch(/turn on|enable|setting/i);
    });
  }

  it("refuses with no snapshot at all, for a different stated reason", () => {
    const gate = streamGate(null);
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/nothing to resume from/);
  });

  it("allows once the snapshot publishes one", () => {
    const raw = { ...CC_FIXTURES.busy, snapshot: { ...CC_FIXTURES.busy.snapshot, stream_available: true } };
    expect(streamGate(readCommandCenter(raw)!).allowed).toBe(true);
  });
});

describe("no EventSource is created while the stream is dark", () => {
  for (const name of ["busy", "empty", "partial", "stale", "unavailable"] as const) {
    it(`${name}: never opens a socket`, async () => {
      const { opened, factory } = spyFactory();
      render(<Harness name={name} factory={factory} />);
      await waitFor(() => expect(screen.getByTestId("reason").textContent).toBeTruthy());
      // The whole of B10 in one assertion.
      expect(opened).toEqual([]);
      expect(screen.getByTestId("live").textContent).toBe("none");
    });
  }

  it("does not open one even when a factory is supplied and the page re-renders", async () => {
    const { opened, factory } = spyFactory();
    const { rerender } = render(<Harness name="busy" factory={factory} />);
    rerender(<Harness name="busy" factory={factory} />);
    rerender(<Harness name="busy" factory={factory} />);
    await waitFor(() => expect(screen.getByTestId("live").textContent).toBe("none"));
    expect(opened).toEqual([]);
  });
});

describe("the screen reads the gate's own sentence", () => {
  it("shows the refusal rather than a phrase of its own", () => {
    render(<CommandCenterScreen snapshot={snap("busy")} />);
    expect(screen.getByText(new RegExp(streamGate(snap("busy")).reason.slice(0, 40)))).toBeTruthy();
  });

  it("offers no live or connect control while dark", () => {
    render(<CommandCenterScreen snapshot={snap("busy")} />);
    expect(screen.queryByRole("button", { name: /live|stream|connect/i })).toBeNull();
  });
});

describe("the resnapshot offset spreads clients without re-rolling", () => {
  it("is stable for one seed and different across seeds", () => {
    expect(jitterFor("ws-a")).toBe(jitterFor("ws-a"));
    expect(jitterFor("ws-a")).not.toBe(jitterFor("ws-b"));
  });

  it("stays inside the spread it was given", () => {
    for (const seed of ["a", "workspace-1", "", "much longer workspace identifier"]) {
      const jitter = jitterFor(seed, 5_000);
      expect(jitter).toBeGreaterThanOrEqual(0);
      expect(jitter).toBeLessThan(5_000);
    }
  });
});
