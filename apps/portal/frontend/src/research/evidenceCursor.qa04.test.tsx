/** QA 2026-10-02 S04 — U1: the hub's tab change names the new stage in the hash before an embedded body mounts. */
import { act, cleanup, renderHook } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { forgetObservedFolds, rememberObservedFolds, useEvidenceCursor } from "./evidenceCursor";

afterEach(() => {
  cleanup();
  forgetObservedFolds();
  window.history.replaceState(null, "", "/");
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={["/research/quantbt/runs/rrun_a/evidence"]}>
    <Routes>
      <Route path="/research/quantbt/runs/:runId/evidence" element={children} />
    </Routes>
  </MemoryRouter>
);

describe("S04 U1 · stage in the hash", () => {
  it("setStage writes the new stage before anything else can seed from the hash", () => {
    window.history.replaceState(null, "", "/x#stage=freeze&fold=1&seq=1");
    const hub = renderHook(() => useEvidenceCursor(), { wrapper });
    let hashAtMount = "";
    act(() => {
      hub.result.current.setStage("execute");
      /* An embedded body mounting right now reads this. */
      hashAtMount = window.location.hash;
    });
    expect(hashAtMount).toContain("stage=execute");
    const child = renderHook(() => useEvidenceCursor({ stage: "execute" }), { wrapper });
    expect(child.result.current.cursor.stage).toBe("execute");
    act(() => child.result.current.update({ seq: 1 }));
    expect(window.location.hash).toContain("stage=execute");
    expect(window.location.hash).toContain("seq=1");
  });

  it("U3: a hand-edited hash naming an unobserved fold is clamped, with the notice", () => {
    window.history.replaceState(null, "", "/x#stage=summary&fold=1");
    rememberObservedFolds("rrun_a", [1, 2, 3]);
    const hub = renderHook(() => useEvidenceCursor(), { wrapper });
    act(() => {
      window.history.replaceState(null, "", "/x#stage=summary&fold=99");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(hub.result.current.cursor.fold).toBe(3);
    expect(hub.result.current.notes.some((note) => note.code === "CURSOR_FOLD_CLAMPED")).toBe(true);
  });

  it("U3: with no published observed set the fold is left alone", () => {
    window.history.replaceState(null, "", "/x#stage=summary&fold=1");
    const hub = renderHook(() => useEvidenceCursor(), { wrapper });
    act(() => {
      window.history.replaceState(null, "", "/x#stage=summary&fold=99");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(hub.result.current.cursor.fold).toBe(99);
  });
});

describe("S05 U15 · history", () => {
  it("a picked fold is a history entry, typing is not, and Back returns to the earlier fold", () => {
    window.history.replaceState(null, "", "/x#stage=summary&fold=1");
    const hub = renderHook(() => useEvidenceCursor(), { wrapper });
    const before = window.history.length;
    act(() => hub.result.current.setFold(4));
    expect(window.history.length).toBe(before + 1);
    expect(window.location.hash).toContain("fold=4");
    act(() => hub.result.current.update({ seq: 7 }));
    expect(window.history.length).toBe(before + 1);
    act(() => hub.result.current.setFold(6));
    expect(window.history.length).toBe(before + 2);
  });

  it("the mount write and a clamp replace, never push", () => {
    window.history.replaceState(null, "", "/x");
    const before = window.history.length;
    const hub = renderHook(() => useEvidenceCursor(), { wrapper });
    expect(window.history.length).toBe(before);
    act(() => hub.result.current.replaceFold(2, "OUT_OF_RANGE"));
    expect(window.history.length).toBe(before);
  });
});
