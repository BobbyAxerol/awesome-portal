/** The retained-review notice lives in the top bar as one pill, only on Execution routes of a retained stack. */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import fixture from "../../../../../packages/contracts/fixtures/execution-retained-review.valid.json";
import { RetainedPill } from "./RetainedBanner";
import { ensureRetainedReview, resetRetainedReviewForTests } from "./retainedReview";

const ok = () => new Response(JSON.stringify(fixture), { status: 200, headers: { "content-type": "application/json" } });
const mount = (path: string) => render(<MemoryRouter initialEntries={[path]}><RetainedPill /></MemoryRouter>);

describe("RetainedPill", () => {
  beforeEach(() => { resetRetainedReviewForTests(); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetRetainedReviewForTests(); });

  it("draws nothing until the stack has said it is a retained review", () => {
    const { container } = mount("/governance/approvals");
    expect(container.querySelector(".exec-ret-pill")).toBeNull();
  });

  it("shows a quiet pill on Execution routes, opens the panel with Refresh, and closes on Escape", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok()));
    ensureRetainedReview();
    mount("/governance/approvals");
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const pill = await screen.findByRole("button", { name: /Retained/ });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(pill);
    const dialog = screen.getByRole("dialog", { name: "Retained review" });
    expect(dialog.textContent).toContain("RETAINED REVIEW · STALE · PARTIAL");
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is not shown on a Research route even when the stack is retained", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok()));
    ensureRetainedReview();
    const { container } = mount("/research/quantbt/runs");
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(container.querySelector(".exec-ret-pill")).toBeNull();
  });
});
