/**
 * W4A — shared primitives: humanise, formatValue, Absence, PageHeader.
 * Inputs are literals copied from the TEXT_A shared-phrase table, not fixtures.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Absence, AbsenceSummary } from "./Absence";
import { formatValue } from "./formatValue";
import { humanise } from "./humanise";
import { PageHeader } from "./PageHeader";

afterEach(cleanup);

describe("humanise", () => {
  it("rewrites bare enum tokens", () => {
    expect(humanise("walk_forward_oos")).toBe("walk-forward OOS");
    expect(humanise("COMPLETED")).toBe("completed");
    expect(humanise("NOT_ISSUED")).toBe("not issued");
    expect(humanise("NOT_APPROVED")).toBe("not approved");
    expect(humanise("per_fold_causal")).toBe("per-fold causal");
    expect(humanise("three_window_decay")).toBe("three-window");
    expect(humanise("mode_1_decay")).toBe("mode 1 decay");
    expect(humanise("not_causal_multi_fold_global_calibration")).toBe("not causal · multi-fold · global calibration");
    expect(humanise("best_is_sharpe")).toBe("best IS sharpe");
  });
  it("leaves prose, ids and absent values alone", () => {
    expect(humanise(null)).toBe("");
    expect(humanise(undefined)).toBe("");
    expect(humanise("Run completed — R-WFO-023")).toBe("Run completed — R-WFO-023");
    expect(humanise("global")).toBe("global");
    expect(humanise("rrun_5e1185f8")).toBe("rrun 5e1185f8");
  });
});

describe("formatValue", () => {
  it("prints UTC minutes", () => {
    expect(formatValue.utc(Date.UTC(2026, 9, 2, 16, 31, 59))).toBe("2026-10-02 16:31 UTC");
    expect(formatValue.utc(Number.NaN)).toBe("");
  });
  it("never prints a raw float, uses U+2212 and no negative zero", () => {
    expect(formatValue.number(0.03386197520287556)).toBe("0.03");
    expect(formatValue.number("-0.537", { dp: 3 })).toBe("−0.537");
    expect(formatValue.number(-0.0001)).toBe("0.00");
    expect(formatValue.number(19909.419272059647, { dp: 2 })).toBe("19,909.42");
    expect(formatValue.number(6.1013, { unit: "ratio" })).toBe("6.101");
    expect(formatValue.number(12, { unit: "bars" })).toBe("12");
    expect(formatValue.number(1.5, { dp: 1, unit: "s" })).toBe("1.5 s");
    expect(formatValue.number("n/a")).toBe("n/a");
  });
});

describe("Absence", () => {
  it("says not published and keeps the code in the tooltip, reachable by keyboard", () => {
    render(<Absence reason="SOURCE_DID_NOT_PUBLISH_METRIC" />);
    const el = screen.getByText("not published");
    expect(el.getAttribute("title")).toContain("SOURCE_DID_NOT_PUBLISH_METRIC");
    expect(el.getAttribute("data-reason-code")).toBe("SOURCE_DID_NOT_PUBLISH_METRIC");
    expect(el.getAttribute("tabindex")).toBe("0");
    expect(el.textContent).not.toContain("SOURCE_");
  });
  it("uses the allowlist and never invents a phrase for an unknown code", () => {
    render(
      <>
        <Absence reason="P21_NO_PERSISTED_RELEASE_CANDIDATE" />
        <Absence reason="SOME_UNKNOWN_CODE" />
        <Absence reason={null} state="PENDING" what="seed" />
      </>,
    );
    expect(screen.getByText("no release candidate")).toBeTruthy();
    expect(screen.getByText("not published").getAttribute("title")).toBe("SOME_UNKNOWN_CODE");
    expect(screen.getByText("seed · pending").getAttribute("title")).toBeNull();
  });
});

describe("AbsenceSummary", () => {
  it("is one caption line", () => {
    const { container } = render(<AbsenceSummary column="seed" reason="SOURCE_DID_NOT_PUBLISH_METRIC" count={100} total={100} />);
    expect(container.textContent).toBe("seed · not published");
    cleanup();
    const partial = render(<AbsenceSummary column="seed" reason={null} count={7} total={100} />);
    expect(partial.container.textContent).toBe("seed · not published in 7 of 100");
  });
});

describe("PageHeader", () => {
  it("renders one h1, prev/next and no breadcrumb", () => {
    const { container } = render(
      <PageHeader title="Run completed" prev={{ label: "Library", href: "/a" }} next={{ label: "Evidence", href: "/b" }} />,
    );
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelector("[aria-label*=readcrumb]")).toBeNull();
    expect(screen.getByText("← Library").getAttribute("href")).toBe("/a");
    expect(screen.getByText("Evidence →").getAttribute("href")).toBe("/b");
  });
  it("copies the link on demand", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<PageHeader title="T" copy />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByRole("button", { name: "Copy link" }).getAttribute("title")).toBe("Copied"));
  });
  it("omits the nav when nothing is offered", () => {
    const { container } = render(<PageHeader title="T" />);
    expect(container.querySelector("nav")).toBeNull();
  });
});
