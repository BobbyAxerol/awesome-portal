import { afterEach, describe, expect, it } from "vitest";

import { installPrintLightTheme } from "./printTheme";

afterEach(() => document.documentElement.removeAttribute("data-theme"));

describe("print theme", () => {
  it("prints light and restores the chosen theme", () => {
    document.documentElement.setAttribute("data-theme", "operations");
    const off = installPrintLightTheme();
    window.dispatchEvent(new Event("beforeprint"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("research");
    window.dispatchEvent(new Event("afterprint"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("operations");
    off();
  });
});
