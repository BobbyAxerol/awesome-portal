import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";

describe("route-level feature loading", () => {
  afterEach(() => {
    window.location.hash = "";
    vi.unstubAllGlobals();
  });

  it("loads the board feature on its legacy hash without eagerly rendering docs", async () => {
    window.location.hash = "#view=board";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 503 })));

    render(<App />);
    expect(await screen.findByTestId("task-board-feature")).toBeInTheDocument();
    expect(screen.queryByTestId("docs-feature")).not.toBeInTheDocument();
  });
});
