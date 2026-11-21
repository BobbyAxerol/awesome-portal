import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CommandBar } from "./CommandBar";
import type { CommandEntry } from "./roleNav";

afterEach(cleanup);

const ENTRIES: CommandEntry[] = [
  { id: "go:overview", group: "Go to", label: "Overview", href: "/execution" },
  { id: "go:fleet", group: "Go to", label: "Alpha Fleet", href: "/deployments/alphas" },
  { id: "al:1", group: "Alpha", label: "BTC-Trend v3", detail: "Live · Core", href: "/deployments/alphas/al_1" },
  { id: "al:2", group: "Alpha", label: "SOL-Break v1", detail: "Paper · Satellite", href: "/deployments/alphas/al_2" },
  { id: "go:ops", group: "Go to", label: "Operations", href: "/execution/operations" },
];

function Harness({ onSelect = () => undefined, entries = ENTRIES }: { onSelect?: (entry: CommandEntry) => void; entries?: CommandEntry[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Search or jump to</button>
      <CommandBar open={open} onClose={() => setOpen(false)} entries={entries} onSelect={onSelect} />
    </>
  );
}

function openBar(props: Parameters<typeof Harness>[0] = {}) {
  render(<Harness {...props} />);
  const opener = screen.getByRole("button", { name: "Search or jump to" });
  opener.focus();
  fireEvent.click(opener);
  return { opener, input: screen.getByRole("combobox") as HTMLInputElement };
}

const options = () => screen.getAllByRole("option").map((o) => o.textContent);
const activeLabel = () => {
  const input = screen.getByRole("combobox");
  return document.getElementById(input.getAttribute("aria-activedescendant") ?? "")?.textContent;
};

describe("CommandBar structure", () => {
  it("renders nothing while closed", () => {
    render(<CommandBar open={false} onClose={() => undefined} entries={ENTRIES} onSelect={() => undefined} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is a modal dialog with a combobox over a listbox, inside an exec-surface root", () => {
    const { input } = openBar();
    const dialog = screen.getByRole("dialog", { name: "Command bar" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.closest(".exec-cmdbar")?.classList.contains("exec-surface")).toBe(true);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(input.getAttribute("aria-controls")).toBe(screen.getByRole("listbox").id);
    expect(input.getAttribute("aria-autocomplete")).toBe("list");
  });

  it("groups rows by section in first-seen order, so arrow order equals screen order", () => {
    openBar();
    expect(screen.getAllByRole("group").map((g) => g.getAttribute("aria-labelledby")).every(Boolean)).toBe(true);
    expect(options()).toEqual(["Overview", "Alpha Fleet", "Operations", "BTC-Trend v3Live · Core", "SOL-Break v1Paper · Satellite"]);
  });

  it("does not bind Cmd/Ctrl+K itself", () => {
    render(<Harness />);
    fireEvent.keyDown(document.body, { key: "k", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "k", metaKey: true });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("CommandBar keyboard", () => {
  it("starts on the first row and moves with the arrows, clamped at both ends", () => {
    const { input } = openBar();
    expect(activeLabel()).toBe("Overview");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(activeLabel()).toBe("Alpha Fleet");
    for (let i = 0; i < 10; i += 1) fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(activeLabel()).toBe("SOL-Break v1Paper · Satellite");
    for (let i = 0; i < 10; i += 1) fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(activeLabel()).toBe("Overview");
    expect(screen.getAllByRole("option").filter((o) => o.getAttribute("aria-selected") === "true")).toHaveLength(1);
  });

  it("opens the active row on Enter, then closes", () => {
    const onSelect = vi.fn();
    const { input } = openBar({ onSelect });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(ENTRIES[1]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("selects by click too", () => {
    const onSelect = vi.fn();
    openBar({ onSelect });
    fireEvent.click(screen.getByRole("option", { name: /BTC-Trend v3/ }));
    expect(onSelect).toHaveBeenCalledWith(ENTRIES[2]);
  });

  it("closes on Escape without selecting", () => {
    const onSelect = vi.fn();
    const { input } = openBar({ onSelect });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("closes when the scrim is pressed but not when the panel is", () => {
    openBar();
    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.mouseDown(document.querySelector(".exec-cmdbar")!);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("CommandBar search", () => {
  it("filters locally and resets the active row to the first match", () => {
    const { input } = openBar();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.change(input, { target: { value: "sol" } });
    expect(options()).toEqual(["SOL-Break v1Paper · Satellite"]);
    expect(activeLabel()).toBe("SOL-Break v1Paper · Satellite");
  });

  it("says No result, with no listbox, when nothing matches", () => {
    const { input } = openBar();
    fireEvent.change(input, { target: { value: "zzz" } });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getAllByText("No result").length).toBeGreaterThan(0);
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.hasAttribute("aria-activedescendant")).toBe(false);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("gives a hidden entry and an absent one the same answer", () => {
    const visible = ENTRIES.filter((entry) => entry.id !== "al:2");
    const { input } = openBar({ entries: visible });
    fireEvent.change(input, { target: { value: "sol-break" } });
    const hidden = screen.getAllByText("No result").length;
    fireEvent.change(input, { target: { value: "nonexistent-alpha" } });
    expect(screen.getAllByText("No result")).toHaveLength(hidden);
  });

  it("says how many rows it drew when it capped the list", () => {
    const many = Array.from({ length: 30 }, (_, i): CommandEntry => ({ id: `e${i}`, group: "Alpha", label: `Alpha ${i}`, href: `/a/${i}` }));
    render(<CommandBar open onClose={() => undefined} entries={many} onSelect={() => undefined} limit={5} />);
    expect(screen.getAllByRole("option")).toHaveLength(5);
    expect(screen.getByText("Showing 5 of 30")).toBeTruthy();
  });

  it("leaves matching to the server when asked, and reports the query", () => {
    const onQueryChange = vi.fn();
    render(<CommandBar open onClose={() => undefined} entries={ENTRIES} onSelect={() => undefined} filterLocally={false} onQueryChange={onQueryChange} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "zzz" } });
    expect(onQueryChange).toHaveBeenCalledWith("zzz");
    expect(screen.getAllByRole("option")).toHaveLength(ENTRIES.length);
  });

  it("renders no dash for an absent detail", () => {
    openBar();
    const overview = screen.getByRole("option", { name: "Overview" });
    expect(overview.querySelector(".exec-cmdbar-detail")).toBeNull();
    expect(document.querySelector(".exec-cmdbar")?.textContent).not.toMatch(/[—–]|N\/A/);
  });
});

describe("CommandBar focus", () => {
  it("moves focus into the input on open and returns it to the opener on close", () => {
    const { opener, input } = openBar();
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(document.activeElement).toBe(opener);
  });

  it("returns focus to the opener after a selection", () => {
    const { opener, input } = openBar();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(document.activeElement).toBe(opener);
  });

  it("keeps Tab inside the panel", () => {
    const { input } = openBar();
    const panel = screen.getByRole("dialog");
    expect(within(panel).getAllByRole("combobox")).toHaveLength(1);
    const next = fireEvent.keyDown(input, { key: "Tab" });
    // Only one tabbable control: the trap cancels the browser default and keeps focus.
    expect(next).toBe(false);
    expect(document.activeElement).toBe(input);
    const back = fireEvent.keyDown(input, { key: "Tab", shiftKey: true });
    expect(back).toBe(false);
    expect(document.activeElement).toBe(input);
  });
});

describe("CommandBar hint and notice", () => {
  it("keeps the entity-search placeholder and shows no notice unless the caller supplies one", () => {
    const { input } = openBar();
    expect(input.getAttribute("placeholder")).toBe("Search alphas, portfolios, accounts, operations, approvals");
    expect(input.getAttribute("aria-describedby")).toBeNull();
    expect(document.querySelector(".exec-cmdbar-notice")).toBeNull();
  });

  it("takes its own placeholder and describes the input with the notice", () => {
    render(
      <CommandBar open onClose={() => undefined} entries={ENTRIES} onSelect={() => undefined} placeholder="Jump to a screen" searchNotice="Not published" />,
    );
    const input = screen.getByRole("combobox");
    expect(input.getAttribute("placeholder")).toBe("Jump to a screen");
    expect(document.getElementById(input.getAttribute("aria-describedby") ?? "")?.textContent).toBe("Not published");
  });
});
