import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Fig, scaleOf, widestScale } from "./cells";
import { figure } from "./model";

afterEach(cleanup);

describe("one decimal scale per column", () => {
  const values = ["0.1", "0.12", "0.08", "3"].map((v) => figure(v, "qty"));

  it("measures the printed scale by string work", () => {
    expect(values.map(scaleOf)).toEqual([1, 2, 2, 0]);
    expect(widestScale(values)).toBe(2);
  });

  it("keeps every digit exact and draws the missing places as invisible room, so the points line up", () => {
    const { container } = render(<>{values.map((value, i) => <Fig key={i} value={value} align={2} />)}</>);
    const nums = [...container.querySelectorAll<HTMLElement>(".exec-blk-num")];
    expect(nums.map((n) => n.textContent)).toEqual(["0.1", "0.12", "0.08", "3"]);
    expect(nums.map((n) => n.getAttribute("data-full"))).toEqual(["0.1", "0.12", "0.08", "3"]);
    expect(nums.map((n) => n.getAttribute("data-room"))).toEqual(["0", null, null, ".00"]);
  });

  it("adds nothing when no column scale is given", () => {
    const { container } = render(<Fig value={values[0]!} />);
    expect(container.querySelector("[data-room]")).toBeNull();
  });
});
