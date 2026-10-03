/**
 * W4 · C / W5 · C - S06/S08 transport keys act only inside the replay section.
 * The section's own `onKeyDown` (no window listener): Space and the arrows
 * scroll and move focus as usual everywhere else on the page.
 */
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReplayTransport, replayKeyDown } from "./replayTransport";

describe("replayKeyDown - scoped to the replay section", () => {
  it("ignores Space and the arrows outside the section, acts on them inside", () => {
    const transport = new ReplayTransport();
    const toggle = vi.spyOn(transport, "toggle");
    const step = vi.spyOn(transport, "step");
    const { getByText } = render(
      <main>
        <a href="#x">outside</a>
        <section aria-label="stitched account replay" tabIndex={-1} onKeyDown={replayKeyDown(transport)}>
          <span>inside</span>
        </section>
      </main>,
    );
    expect(fireEvent.keyDown(getByText("outside"), { key: " " })).toBe(true);
    expect(fireEvent.keyDown(getByText("outside"), { key: "ArrowRight" })).toBe(true);
    expect(toggle).not.toHaveBeenCalled();
    expect(step).not.toHaveBeenCalled();
    expect(fireEvent.keyDown(getByText("inside"), { key: " " })).toBe(false);
    expect(fireEvent.keyDown(getByText("inside"), { key: "ArrowRight" })).toBe(false);
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(step).toHaveBeenCalledTimes(1);
  });

  it("a key the chart region already handled is not done twice", () => {
    const transport = new ReplayTransport();
    const step = vi.spyOn(transport, "step");
    const { getByText } = render(
      <section onKeyDown={replayKeyDown(transport)}>
        <div tabIndex={0} onKeyDown={(event) => event.preventDefault()}>
          region
        </div>
      </section>,
    );
    fireEvent.keyDown(getByText("region"), { key: "ArrowRight" });
    expect(step).not.toHaveBeenCalled();
  });
});
