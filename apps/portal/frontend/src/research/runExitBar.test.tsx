// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_CURSOR } from "./evidenceCursor";
import { RunExitBar } from "./RunExitBar";
import { runTerminalState } from "./runTerminalState";

const RUN = "rrun_3d5633d2adb712722fe4ba108102aa5d";

function bar(props: Partial<Parameters<typeof RunExitBar>[0]> & { status: string | null; read?: "ok" | "not-found" | "unread" }) {
  const { status, read = "ok", ...rest } = props;
  return render(
    <MemoryRouter>
      <RunExitBar runId={RUN} state={runTerminalState({ status, read })} {...rest} />
    </MemoryRouter>,
  );
}

const exits = (c: HTMLElement) => [...c.querySelectorAll("[data-exit]")].map((e) => e.getAttribute("data-exit"));

afterEach(cleanup);

describe("RunExitBar (W1 §1.3)", () => {
  it("renders nothing for a completed run", () => {
    expect(bar({ status: "COMPLETED" }).container.innerHTML).toBe("");
  });

  it("one line: banner (tip in title), then exits in order, primary first", () => {
    const { container } = bar({ status: "FAILED" });
    const root = container.querySelector("[data-run-exit-bar]")!;
    expect(root.getAttribute("role")).toBe("status");
    const phase = container.querySelector("[data-run-phase]")!;
    expect(phase.getAttribute("data-run-phase")).toBe("failed");
    expect(phase.textContent).toBe("Failed.");
    expect(phase.getAttribute("title")).toMatch(/Progress shows where/);
    expect(exits(container)).toEqual(["progress", "new-run", "library"]);
    expect(container.querySelector("[data-exit=new-run]")!.getAttribute("title")).toBe("Same draft, fresh preflight");
  });

  it("hide drops the exit that points at itself", () => {
    expect(exits(bar({ status: "QUEUED", hide: ["progress"] }).container)).toEqual(["library"]);
  });

  it("D8 · unavailable echoes the run id in mono with one Library button", () => {
    const { container } = bar({ status: null, read: "not-found" });
    expect(container.querySelector(".mono")!.textContent).toBe(RUN);
    expect(container.querySelectorAll("a")).toHaveLength(1);
    expect(container.querySelector("a")!.className).toContain("btn-ghost");
  });

  it("refused read: one banner, only Library, role status", () => {
    const { container } = bar({ status: null, read: "not-found" });
    expect(container.textContent).toContain("Run not available.");
    expect(exits(container)).toEqual(["library"]);
  });

  it("unread: alert role and Retry calls onRetry", () => {
    const onRetry = vi.fn();
    const { container } = bar({ status: null, read: "unread", onRetry });
    expect(container.querySelector("[data-run-exit-bar]")!.getAttribute("role")).toBe("alert");
    fireEvent.click(container.querySelector("[data-action=retry]")!);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("carries the cursor into hub/report hrefs only, and no fold=1 without one", () => {
    const state = { ...runTerminalState({ status: "FAILED", read: "ok" }), exits: ["hub", "report", "progress"] as const };
    const withCursor = render(
      <MemoryRouter>
        <RunExitBar runId={RUN} state={state} cursor={{ ...DEFAULT_CURSOR, fold: 4, trial: 351 }} />
      </MemoryRouter>,
    ).container;
    expect(withCursor.querySelector("[data-exit=hub]")!.getAttribute("href")).toContain("fold=4");
    expect(withCursor.querySelector("[data-exit=report]")!.getAttribute("href")).toContain("trial=351");
    expect(withCursor.querySelector("[data-exit=progress]")!.getAttribute("href")).not.toContain("#");
    cleanup();
    const without = render(
      <MemoryRouter>
        <RunExitBar runId={RUN} state={state} />
      </MemoryRouter>,
    ).container;
    for (const a of without.querySelectorAll("a")) expect(a.getAttribute("href")).not.toContain("fold");
  });
});
