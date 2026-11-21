import { fireEvent, screen } from "@testing-library/react";

/** Open a drawn ChoiceMenu by its accessible name and pick the option whose text matches. */
export function choose(label: string, option: string | RegExp): void {
  fireEvent.click(screen.getByRole("button", { name: label }));
  fireEvent.click(screen.getByRole("option", { name: option }));
}
