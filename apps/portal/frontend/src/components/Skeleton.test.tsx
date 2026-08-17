/**
 * Loading skeleton tests.
 *
 * A skeleton exists to stop the page jumping, so the claims are about shape and
 * about what a screen reader hears: the placeholder reserves the same slots the
 * content will occupy, announces once in words, and never leaks its grey
 * rectangles into the accessibility tree as content.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ResultsSkeleton, Skeleton } from "./ui";

afterEach(cleanup);

describe("Skeleton", () => {
  it("renders one block per count, tagged with its variant", () => {
    const { container } = render(<Skeleton variant="row" count={4} />);
    const blocks = container.querySelectorAll(".skeleton");
    expect(blocks).toHaveLength(4);
    expect(Array.from(blocks).every((block) => block.getAttribute("data-variant") === "row")).toBe(
      true,
    );
  });

  it("hides the blocks from assistive tech — they are not content", () => {
    const { container } = render(<Skeleton count={2} />);
    expect(
      Array.from(container.querySelectorAll(".skeleton")).every(
        (block) => block.getAttribute("aria-hidden") === "true",
      ),
    ).toBe(true);
  });
});

describe("ResultsSkeleton", () => {
  it("reserves the shape of a results screen: metric strip, chart, rows", () => {
    const { container } = render(<ResultsSkeleton />);
    // Five metric slots, because the headline strip has five metrics.
    expect(container.querySelectorAll('.skeleton[data-variant="metric"]')).toHaveLength(5);
    expect(container.querySelectorAll('.skeleton[data-variant="chart"]')).toHaveLength(1);
    expect(container.querySelectorAll('.skeleton[data-variant="row"]')).toHaveLength(6);
  });

  it("says what is loading, once, in words", () => {
    render(<ResultsSkeleton message="Đang tải kết quả run…" />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Đang tải kết quả run…");
  });

  it("falls back to a generic message rather than announcing nothing", () => {
    render(<ResultsSkeleton />);
    expect(screen.getByRole("status").textContent).toBe("Đang tải…");
  });
});
