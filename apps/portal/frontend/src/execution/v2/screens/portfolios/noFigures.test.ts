/** QA8: the register's "Not published" says which book it is not published in and which book the portfolio does publish. */
import { describe, expect, it } from "vitest";

import { noFigures } from "./PortfolioTable";

describe("noFigures", () => {
  it("names the viewed environment and the portfolio's own", () => {
    expect(noFigures({ environments: ["sandbox"] }, "live")).toBe("Not published in the live book: this portfolio publishes sandbox only, and its page shows that book");
  });
  it("keeps the plain reason when the portfolio does publish the viewed environment", () => {
    expect(noFigures({ environments: ["live", "paper"] }, "live")).toBe("No live figures are published for this portfolio");
    expect(noFigures({ environments: [] }, "live")).toBe("No live figures are published for this portfolio");
  });
});
