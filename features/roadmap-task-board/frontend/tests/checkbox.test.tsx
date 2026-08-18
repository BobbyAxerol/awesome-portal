/**
 * Checkbox states (v1.1 plan §3.2).
 *
 * The complaint was that the board used the browser default. The replacement
 * has to earn that: native semantics kept, every state distinguishable, and
 * `loading` genuinely distinct from `disabled` rather than the same grey.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Checkbox } from "../src/components/ui";

afterEach(cleanup);

function box() {
  return screen.getByRole("checkbox") as HTMLInputElement;
}

function wrapper(container: HTMLElement) {
  return container.querySelector(".checkbox") as HTMLElement;
}

describe("Checkbox", () => {
  it("keeps native checkbox semantics", () => {
    render(<Checkbox label="Select task" />);
    expect(box().type).toBe("checkbox");
    expect(screen.getByLabelText("Select task")).toBe(box());
  });

  it("reports each state distinctly", () => {
    const { container, rerender } = render(<Checkbox label="x" />);
    expect(wrapper(container).dataset.state).toBe("unchecked");

    rerender(<Checkbox label="x" checked />);
    expect(wrapper(container).dataset.state).toBe("checked");

    rerender(<Checkbox label="x" indeterminate />);
    expect(wrapper(container).dataset.state).toBe("indeterminate");
    expect(box().indeterminate).toBe(true);

    rerender(<Checkbox label="x" loading />);
    expect(wrapper(container).dataset.state).toBe("loading");
  });

  it("treats a fully-checked group as checked, not indeterminate", () => {
    // "Some selected" and "all selected" are different answers; a checked box
    // that also claims indeterminate would show a bar where a tick belongs.
    const { container } = render(<Checkbox label="x" checked indeterminate />);
    expect(wrapper(container).dataset.state).toBe("checked");
    expect(box().indeterminate).toBe(false);
  });

  it("blocks input while loading and says it is busy", () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox label="x" loading onCheckedChange={onCheckedChange} />);
    expect(box().disabled).toBe(true);
    expect(box().getAttribute("aria-busy")).toBe("true");
    fireEvent.click(box());
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it("does not claim to be busy when it is merely disabled", () => {
    const { container } = render(<Checkbox label="x" disabled />);
    expect(box().hasAttribute("aria-busy")).toBe(false);
    expect(wrapper(container).dataset.state).toBe("unchecked");
    expect(wrapper(container).dataset.disabled).toBe("true");
  });

  it("emits the next value on change", () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox label="x" onCheckedChange={onCheckedChange} />);
    fireEvent.click(box());
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("keeps a hidden label reachable for assistive technology", () => {
    render(<Checkbox label="Select ACQ-001" labelHidden />);
    expect(screen.getByLabelText("Select ACQ-001")).toBe(box());
  });
});
