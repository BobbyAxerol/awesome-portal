/**
 * WP-F2, Codex package 6: the account resource may name a portfolio (`portfolio_name`) or say why it does not
 * (`portfolio_name_reason_code`). Driven from the canonical fixture `execution-resource-portfolio-names.synthetic.valid.json`
 * (execution.account-resource.v2): the reader accepts both cases, the name rides beside the id, an absent name falls back to the
 * id with the reason in a disclosure (not only a title), and nothing is looked up or inferred.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { readProfileEnvelope } from "../../../api/profileRead";
import { loadCanonical } from "../../testkit/loadCanonical";
import { readAccountView } from "./model";
import { PortfolioName } from "./parts";

const file = loadCanonical<{ cases: Record<string, any>[] }>("execution-resource-portfolio-names.synthetic.valid.json");
const NAMED = file.cases[0]!;
const UNNAMED = file.cases[1]!;

afterEach(cleanup);

describe("execution.account-resource.v2 portfolio names", () => {
  it("the reader accepts both canonical cases", () => {
    expect(readProfileEnvelope(NAMED)).not.toBeNull();
    expect(readProfileEnvelope(UNNAMED)).not.toBeNull();
    expect(readProfileEnvelope(NAMED)!.schemaVersion).toBe("execution.account-resource.v2");
  });

  it("a stated name is read beside the id, and carries no reason", () => {
    const view = readAccountView(readProfileEnvelope(NAMED)!, "account_TEST_ONLY");
    expect(view.names.portfolios).toEqual({ portfolio_TEST_ONLY: "TEST_ONLY Multi-currency portfolio" });
    expect(view.names.portfolioReasons).toEqual({});
  });

  it("an absent name keeps the id as the identity and keeps the reason code; no name is invented", () => {
    const view = readAccountView(readProfileEnvelope(UNNAMED)!, "account_TEST_ONLY");
    expect(view.names.portfolios).toEqual({});
    expect(view.names.portfolioReasons).toEqual({ portfolio_TEST_ONLY: "PORTFOLIO_NAME_NOT_PUBLISHED" });
    expect(view.identity.portfolios).toEqual(["portfolio_TEST_ONLY"]);
  });
});

describe("PortfolioName", () => {
  const mount = (node: React.ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>);

  it("prints the name with the whole id on its own line", () => {
    mount(<PortfolioName id="portfolio_TEST_ONLY" name="TEST_ONLY Multi-currency portfolio" reason={null} />);
    expect(screen.getByText("TEST_ONLY Multi-currency portfolio")).toBeTruthy();
    expect(screen.getByText("portfolio_TEST_ONLY")).toBeTruthy();
  });

  it("prints the id alone when there is no name, with the reason as a disclosure and never only a title", () => {
    mount(<PortfolioName id="portfolio_TEST_ONLY" name={null} reason="PORTFOLIO_NAME_NOT_PUBLISHED" />);
    expect(screen.getByText("portfolio_TEST_ONLY")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Why the portfolio has no name/ })).toBeTruthy();
    expect(document.body.textContent).not.toContain("TEST_ONLY Multi");
  });

  it("an id with neither name nor reason (a legacy row) is just the id", () => {
    mount(<PortfolioName id="pf_x" name={null} reason={null} />);
    expect(screen.getByText("pf_x")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
