/**
 * W5 · C - the `moved` fact the route's `seq` write is gated on (SPEC_W5 §3.5).
 * A load (arrival, a new window) is not the reader; a step, seek, play, pause or speed is.
 */
import { describe, expect, it } from "vitest";

import { ReplayTransport } from "./replayTransport";

describe("ReplayTransport.moved", () => {
  it("is false on mount and after a window load (no spurious seq=1 on P04)", () => {
    const transport = new ReplayTransport();
    expect(transport.getSnapshot().moved).toBe(false);
    transport.load(100, 0);
    expect(transport.getSnapshot()).toMatchObject({ moved: false, index: 0, playing: false });
    transport.load(100, 41);
    expect(transport.getSnapshot()).toMatchObject({ moved: false, index: 41 });
  });

  it.each([
    ["step", (t: ReplayTransport) => t.step(1)],
    ["seek", (t: ReplayTransport) => t.seek(5)],
    ["setSpeed", (t: ReplayTransport) => t.setSpeed(16)],
    ["toggle", (t: ReplayTransport) => t.toggle()],
  ])("%s sets it", (_name, act) => {
    const transport = new ReplayTransport({ request: () => 1, cancel: () => undefined, now: () => 0 });
    transport.load(100, 0);
    act(transport);
    expect(transport.getSnapshot().moved).toBe(true);
    transport.dispose();
  });

  it("a later load keeps what the reader did", () => {
    const transport = new ReplayTransport();
    transport.load(10, 0);
    transport.seek(3);
    transport.load(20, 0);
    expect(transport.getSnapshot().moved).toBe(true);
  });
});
