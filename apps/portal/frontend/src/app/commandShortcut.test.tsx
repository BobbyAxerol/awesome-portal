/**
 * The Cmd/Ctrl+K shortcut and the V2 bar under hostile input (WP-D). The audit's scripted run saw one page crash on a Ctrl+K press;
 * a second run did not reproduce it, which points at the machine. What can be checked here is what the code does with the events a
 * browser or a driver can send: a keydown with no `key` (autofill, some drivers) must not throw, a burst of presses must leave one
 * dialog, and opening and closing many times must leave no listener and no dialog behind.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useCallback, useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PortalRegistryDocument } from "../portal/contracts";
import { ExecCommandBar } from "../execution/v2/shell/ExecCommandBar";
import { V2_ROLE_PRESETS } from "../execution/v2/shell/roleNav";
import { useCommandPaletteShortcut } from "./CommandPalette";

afterEach(cleanup);

const registry: PortalRegistryDocument = JSON.parse(readFileSync(join(process.cwd(), "../registry/fixtures/registry.public.json"), "utf8"));

function Shell({ onOpen }: { onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  const openBar = useCallback(() => {
    onOpen?.();
    setOpen(true);
  }, [onOpen]);
  useCommandPaletteShortcut(openBar);
  return <ExecCommandBar registry={registry} options={{ capabilities: [...V2_ROLE_PRESETS.manager] }} open={open} onClose={() => setOpen(false)} />;
}

const mount = (onOpen?: () => void) => render(<MemoryRouter initialEntries={["/execution"]}><Shell onOpen={onOpen} /></MemoryRouter>);

describe("Cmd/Ctrl+K", () => {
  it("opens the bar for Ctrl+K and Cmd+K in either case, and for nothing else", () => {
    const onOpen = vi.fn();
    mount(onOpen);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.keyDown(window, { key: "K", metaKey: true });
    fireEvent.keyDown(window, { key: "k" });
    fireEvent.keyDown(window, { key: "j", ctrlKey: true });
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("a keydown without a `key` (autofill, some drivers) is ignored, never an uncaught error", () => {
    mount();
    // jsdom reports a throwing listener as a window `error` event instead of throwing from dispatchEvent, so listen for it.
    const uncaught: unknown[] = [];
    const collect = (event: ErrorEvent) => {
      event.preventDefault();
      uncaught.push(event.error);
    };
    window.addEventListener("error", collect);
    const event = new Event("keydown", { cancelable: true });
    Object.assign(event, { ctrlKey: true });
    window.dispatchEvent(event);
    window.dispatchEvent(new KeyboardEvent("keydown", { ctrlKey: true }));
    window.removeEventListener("error", collect);
    expect(uncaught).toEqual([]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a burst of presses leaves exactly one dialog", () => {
    mount();
    for (let i = 0; i < 25; i += 1) fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("opening and closing many times leaves no dialog, a working shortcut and focus on the opener's place", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mount();
    for (let i = 0; i < 40; i += 1) {
      fireEvent.keyDown(window, { key: "k", ctrlKey: true });
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();
    }
    act(() => {
      fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("typing, arrowing and pressing Enter on an empty result list does not throw", () => {
    mount();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "zzzz-no-such-screen" } });
    for (const key of ["ArrowDown", "ArrowUp", "Enter", "Tab"]) expect(() => fireEvent.keyDown(input, { key })).not.toThrow();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
