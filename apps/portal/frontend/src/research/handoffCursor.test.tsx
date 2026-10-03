/** W5 §3.3 — reset to θ* returns to the hand-off cursor, and a hash-less arrival opens on it. */
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { useEvidenceCursor, type HandoffTarget } from "./evidenceCursor";
import { cursorForHandoff } from "./handoffCursor";
import type { ProgressRead } from "./progressClient";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={["/research/quantbt/runs/rrun_a/evidence"]}>
    <Routes>
      <Route path="/research/quantbt/runs/:runId/evidence" element={children} />
    </Routes>
  </MemoryRouter>
);

const THETA: HandoffTarget = { fold: 9, trial: 351, params: "a74872" };

function mount(hash: string, handoff: HandoffTarget | null) {
  window.history.replaceState(null, "", `/research/quantbt/runs/rrun_a/evidence${hash}`);
  return renderHook(({ target }: { target: HandoffTarget | null }) => useEvidenceCursor({}, { handoff: target }), {
    wrapper,
    initialProps: { target: handoff },
  });
}

describe("useEvidenceCursor · hand-off", () => {
  it("seeds a hash-less arrival from the hand-off: one replaceState, no history entry", () => {
    const before = window.history.length;
    const hub = mount("", THETA);
    expect(hub.result.current.cursor).toMatchObject({ fold: 9, trial: 351, params: "a74872" });
    expect(window.location.hash).toBe("#stage=summary&fold=9&trial=351&params=a74872");
    expect(window.history.length).toBe(before);
  });

  it("a hand-off that arrives after first paint is applied once, with replace", () => {
    const before = window.history.length;
    const hub = mount("", null);
    expect(hub.result.current.cursor.fold).toBe(1);
    hub.rerender({ target: THETA });
    expect(hub.result.current.cursor).toMatchObject({ fold: 9, trial: 351 });
    expect(window.history.length).toBe(before);
  });

  it("not once the reader has moved the cursor", () => {
    const hub = mount("", null);
    act(() => hub.result.current.setFold(3));
    hub.rerender({ target: THETA });
    expect(hub.result.current.cursor.fold).toBe(3);
    expect(hub.result.current.cursor.trial).toBeNull();
  });

  it("a hash that names a fold wins over the hand-off", () => {
    const hub = mount("#stage=summary&fold=3", THETA);
    expect(hub.result.current.cursor.fold).toBe(3);
    expect(hub.result.current.cursor.trial).toBeNull();
    hub.rerender({ target: { ...THETA, fold: 8 } });
    expect(hub.result.current.cursor.fold).toBe(3);
  });

  it("reset returns to the hand-off, keeps the tab and the window, and the hash equals the arrival hash", () => {
    const hub = mount("", THETA);
    const arrival = window.location.hash;
    act(() => {
      hub.result.current.setFold(3);
      hub.result.current.update({ trial: 5 });
    });
    expect(hub.result.current.atHandoff).toBe(false);
    act(() => hub.result.current.setStage("freeze"));
    act(() => hub.result.current.update({ window: "is" }));
    act(() => hub.result.current.reset());
    expect(hub.result.current.cursor).toMatchObject({ fold: 9, trial: 351, params: "a74872", stage: "freeze", window: "is" });
    expect(hub.result.current.atHandoff).toBe(true);
    expect(window.location.hash).toBe(arrival.replace("stage=summary", "stage=freeze") + "&window=is");
  });

  it("with no hand-off (P04) reset falls back to the arrival cursor, as before", () => {
    const hub = mount("#stage=summary&fold=2", null);
    act(() => hub.result.current.setFold(4));
    act(() => hub.result.current.reset());
    expect(hub.result.current.cursor.fold).toBe(2);
    expect(hub.result.current.handoff).toBeNull();
    expect(hub.result.current.atHandoff).toBe(false);
  });

  it("Back after a window change restores the window before it", () => {
    const hub = mount("#stage=summary&fold=2", null);
    const length = window.history.length;
    act(() => hub.result.current.update({ window: "holdout" }));
    expect(window.history.length).toBe(length + 1);
  });
});

describe("cursorForHandoff", () => {
  const read = (handoff: unknown) => ({ progress: { claim: { handoff_cursor: handoff } } }) as unknown as ProgressRead;
  it("reads the structured hand-off and nothing else", () => {
    expect(cursorForHandoff(read({ fold: 9, trial: 351, params_digest: "a74872" }))).toEqual(THETA);
    expect(cursorForHandoff(read(null))).toBeNull();
    expect(cursorForHandoff(null)).toBeNull();
    expect(cursorForHandoff({ progress: null } as unknown as ProgressRead)).toBeNull();
  });
  it("refuses a hand-off it cannot place (never a plausible default)", () => {
    expect(cursorForHandoff(read({ fold: 0, trial: 1, params_digest: "x" }))).toBeNull();
    expect(cursorForHandoff(read({ fold: 1, trial: 1, params_digest: "" }))).toBeNull();
  });
});
