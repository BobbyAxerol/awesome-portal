/**
 * G2: a canceled order is closed, not paused. The Blotter's own chip draws a "no entry" shape and announces "Closed: Canceled"; the shared
 * `paused` kind (a pause shape, "Paused: Canceled") is not used for anything that is over.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Flag } from "../../Flag";
import { ClosedFlag, CLOSED_GLYPH } from "./ClosedFlag";
import { statusView } from "./blotterModel";

afterEach(cleanup);

describe("ClosedFlag", () => {
  it("reads 'Closed: Canceled' with a closed shape, in the grey of the not-applicable kind, and never as paused", () => {
    const { container } = render(<ClosedFlag label="Canceled" />);
    const chip = container.querySelector(".exec-flag") as HTMLElement;
    expect(chip.getAttribute("data-k")).toBe("na");
    expect(chip.querySelector("[aria-hidden='true']")!.textContent).toBe(CLOSED_GLYPH);
    expect(chip.textContent).toBe(`${CLOSED_GLYPH}Closed: Canceled`);
    expect(chip.textContent).not.toMatch(/Paused|❚/);
  });

  it("is what the Blotter uses for a canceled order, and the old pause chip is gone from CANCELED and EXPIRED", () => {
    expect(statusView("CANCELED").closed).toBe(true);
    expect(statusView("EXPIRED").closed).toBeUndefined();
    const paused = render(<Flag kind="paused" label="Canceled" size="sm" />).container.textContent;
    expect(paused).toMatch(/Paused: Canceled/);
    for (const status of ["CANCELED", "EXPIRED"]) expect(statusView(status).kind).not.toBe("paused");
  });
});
