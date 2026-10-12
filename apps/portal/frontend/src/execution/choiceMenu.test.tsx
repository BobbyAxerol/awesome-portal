/** The drawn listbox and segmented control: reachable by keyboard, closes like a menu, filters a long list. */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChoiceMenu, Segmented } from "./components/choiceMenu";

afterEach(cleanup);

const OPTIONS = [{ value: "", label: "Any gate" }, { value: "R1", label: "Research · R1" }, { value: "R2", label: "Ops · R2" }];
function Harness({ onChange = vi.fn(), options = OPTIONS }: { onChange?: (v: string) => void; options?: readonly { value: string; label: string; hint?: string }[] }) {
  const [value, setValue] = useState("");
  return <ChoiceMenu label="Gate" value={value} options={options} onChange={(v) => { setValue(v); onChange(v); }} />;
}

describe("ChoiceMenu", () => {
  it("opens as a listbox, picks with the mouse, shows the choice and closes", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const trigger = screen.getByRole("button", { name: "Gate" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(screen.getByRole("listbox", { name: "Gate" })).toBeTruthy();
    fireEvent.click(screen.getByRole("option", { name: /Ops · R2/ }));
    expect(onChange).toHaveBeenCalledWith("R2");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger.textContent).toContain("Ops · R2");
  });
  it("moves with the arrow keys, chooses with Enter and closes with Escape", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Gate" }), { key: "ArrowDown" });
    const pop = document.querySelector(".exec-cm-pop")!;
    fireEvent.keyDown(pop, { key: "ArrowDown" });
    fireEvent.keyDown(pop, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("R1");
    fireEvent.click(screen.getByRole("button", { name: "Gate" }));
    fireEvent.keyDown(document.querySelector(".exec-cm-pop")!, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });
  it("closes on a press outside", () => {
    render(<><Harness /><button type="button">elsewhere</button></>);
    fireEvent.click(screen.getByRole("button", { name: "Gate" }));
    fireEvent.pointerDown(screen.getByText("elsewhere"));
    expect(screen.queryByRole("listbox")).toBeNull();
  });
  it("filters a long list by what is typed and says when nothing matches", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ value: `v${i}`, label: i === 7 ? "Delta-RSI Polynomial" : `Alpha ${i}` }));
    render(<Harness options={many} />);
    fireEvent.click(screen.getByRole("button", { name: "Gate" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Filter: Gate" }), { target: { value: "delta" } });
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Delta-RSI Polynomial"]);
    fireEvent.change(screen.getByRole("textbox", { name: "Filter: Gate" }), { target: { value: "zzz" } });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText(/Nothing matches/)).toBeTruthy();
  });
});

describe("Segmented", () => {
  it("marks the active segment, reports a choice, and shows a count only when one is given", () => {
    const onChange = vi.fn();
    render(<Segmented label="View" value="INBOX" onChange={onChange} options={[{ value: "INBOX", label: "Mine", count: 3 }, { value: "ALL", label: "All" }]} />);
    expect(screen.getByRole("button", { name: /^Mine\s*3$/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "All" }).querySelector(".exec-seg-count")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(onChange).toHaveBeenCalledWith("ALL");
  });
});
