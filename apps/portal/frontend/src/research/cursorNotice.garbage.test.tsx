/** W5 §3.7 — a hand-edited hash is said in one short line and stripped from the address. */
import { act, cleanup, render, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { CursorNotice } from "./CursorNotice";
import { cursorNoteText, parseCursor, parseCursorProblems, useEvidenceCursor } from "./evidenceCursor";

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

describe("garbage in the hash", () => {
  it("a trial / seq that is an identifier but not a positive integer is reported and NOT carried", () => {
    const hash = "#stage=execute&fold=2&trial=zzz&seq=999999x";
    expect(parseCursorProblems(hash)).toEqual([
      { code: "CURSOR_VALUE_UNREADABLE", key: "trial", value: "zzz" },
      { code: "CURSOR_VALUE_UNREADABLE", key: "seq", value: "999999x" },
    ]);
    const cursor = parseCursor(hash);
    expect(cursor.trial).toBeNull();
    expect(cursor.seq).toBeNull();
    expect(cursor.carried).toBeUndefined();
  });

  it("the four garbage inputs: one notice, keys gone from the address, the screen still has a cursor", () => {
    window.history.replaceState(null, "", "/x#trial=zzz&seq=999999x&fold=abc&stage=nope&window=compare");
    const hub = renderHook(() => useEvidenceCursor(), { wrapper });
    expect(hub.result.current.cursor).toMatchObject({ stage: "summary", fold: 1, trial: null, seq: null, window: null });
    expect(window.location.hash).toBe("#stage=summary&fold=1");
    const { container } = render(<CursorNotice problems={hub.result.current.problems} notes={hub.result.current.notes} />);
    const notice = container.querySelector("[data-cursor-notice]") as HTMLElement;
    expect(notice.getAttribute("role")).toBe("status");
    const lines = [...notice.querySelectorAll("[data-cursor-problem]")].map((node) => node.textContent);
    expect(lines).toContain("Link value ignored: trial “zzz”.");
    expect(lines).toContain("Link value ignored: seq “999999x”.");
    expect(lines).toContain("Link value ignored: fold “abc”.");
    expect(lines).toContain("Link value ignored: window “compare”.");
    expect(notice.textContent).not.toMatch(/inspection cursor|not part of/);
  });

  it("a hash edited by hand while the screen is open is reported and stripped too", () => {
    window.history.replaceState(null, "", "/x#stage=summary&fold=1");
    const hub = renderHook(() => useEvidenceCursor(), { wrapper });
    act(() => {
      window.history.replaceState(null, "", "/x#stage=summary&fold=1&trial=zzz");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(hub.result.current.problems.some((problem) => problem.key === "trial")).toBe(true);
    expect(window.location.hash).toBe("#stage=summary&fold=1");
  });

  it("the new notes read as one short line", () => {
    expect(cursorNoteText({ code: "CURSOR_TRIAL_NOT_FOUND", value: "zzz" })).toBe("Link value ignored: trial “zzz”.");
    expect(cursorNoteText({ code: "CURSOR_SEQ_OUT_OF_RANGE", from: 999999, to: 1488 })).toBe("Link value ignored: bar 999,999 (last 1,488).");
    expect(cursorNoteText({ code: "CURSOR_FOLD_CLAMPED", from: 99, to: 9, reason: "BEYOND_LAST" })).toBe("Link fold 99 not in this run; fold 9 shown.");
  });
});
