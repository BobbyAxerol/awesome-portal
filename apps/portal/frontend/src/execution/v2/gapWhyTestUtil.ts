/**
 * Test helper for the "Not available" disclosures (`GapWhy`, RV-06). The reason of a missing fact used to ride on a `title`;
 * it is now behind a button, so a test asks the way a reader does: open it, read what it says, put it back.
 */
import { fireEvent } from "@testing-library/react";

/** The disclosure button of `scope` (a gap line, a `[data-gap]` cell, a chip), or the scope itself when it is the button. */
export function whyButton(scope: Element | null): HTMLButtonElement {
  if (scope === null) throw new Error("no element to open");
  const button = scope.matches("button[aria-expanded]") ? scope : scope.querySelector("button[aria-expanded]");
  if (!(button instanceof HTMLButtonElement)) throw new Error("no disclosure button in the element");
  return button;
}

/**
 * Opens the disclosure, returns its rows (one per fact, joined by a newline: the old `title` text, without the next-action
 * line) and closes it again if it was closed, so a test can go on asserting what the page prints while nobody asks.
 */
export function whyText(scope: Element | null): string {
  const button = whyButton(scope);
  const wasOpen = button.getAttribute("aria-expanded") === "true";
  if (!wasOpen) fireEvent.click(button);
  const id = button.getAttribute("aria-controls");
  const body = id === null ? null : document.getElementById(id);
  if (body === null) throw new Error("the disclosure did not open");
  const text = Array.from(body.querySelectorAll(".exec-blk-why-row")).map((row) => row.textContent ?? "").join("\n");
  if (!wasOpen) fireEvent.click(button);
  return text;
}
