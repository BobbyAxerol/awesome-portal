/**
 * W4 · C — S06/S08 transport keys act only inside the replay section.
 * Space and the arrows scroll and move focus as usual everywhere else on the page.
 */
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useTransportInput } from "./ExecuteDetail";
import { ReplayTransport } from "./replayTransport";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useTransportInput — scoped to [data-replay-section]", () => {
  it("ignores Space and the arrows outside the replay section, acts on them inside", () => {
    const transport = new ReplayTransport();
    const toggle = vi.spyOn(transport, "toggle");
    const step = vi.spyOn(transport, "step");
    document.body.innerHTML = `<main><a id="outside" href="#x">x</a><section data-replay-section tabindex="0"><span id="inside">y</span></section></main>`;
    renderHook(() => useTransportInput(transport));
    const press = (id: string, key: string) => {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      document.getElementById(id)!.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(press("outside", " ")).toBe(false);
    expect(press("outside", "ArrowRight")).toBe(false);
    expect(toggle).not.toHaveBeenCalled();
    expect(step).not.toHaveBeenCalled();
    expect(press("inside", " ")).toBe(true);
    expect(press("inside", "ArrowRight")).toBe(true);
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(step).toHaveBeenCalledTimes(1);
  });
});
