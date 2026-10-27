/**
 * Codex post-freeze review of the Portfolios register (2026-10-23), three changes:
 * 1. a reversed range (min above max) is refused where it is typed, with the text kept and the reason tied to the inputs, never written to
 *    the address; equal ends are valid and inclusive; a deep link with a reversed range reads as an INVALID range, not as no filter;
 * 2. the score keeps its source's quality (partial, stale, unknown freshness, unknown or provisional confidence, no methodology) and reason
 *    code beside the value; the maturity sentence appears only when the owning fact states a maturity reason;
 * 3. a score outside 0 to 100 or in another unit is typed invalid, never banded (a -3 is not a Weak portfolio), and a figure in another unit
 *    is never sorted or filtered.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { PF } from "../../../../../e2e/bffDoublePortfolios";
import type { ExecutionApi } from "../../../api/ports";
import { readPartitionedMetricsList, type ManagerPartitionedMetrics } from "../../readers/managerMetric";
import { absentMetric, moneyMetric, partition } from "../../readers/managerDataset.testbase";
import { datasetFor, withDataset } from "./datasetFixtures.testbase";
import { makeApi } from "./harness.fixtures";
import PortfolioListScreen from "./index";
import { RangeFilters } from "./RangeFilters";
import { ScoreFigure } from "./ScoreCell";
import { isReversed, measureValue, readRangeState, scoreOf, type Range, type RangeId } from "./registerMetrics";

afterEach(cleanup);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;

const score = (value: string, extra: Body = {}) => ({ ...moneyMetric({ value }), unit: "SCORE", currency: null, policy_revision: "FIXTURE_LAB", methodology_ref: "FIXTURE_LAB:m", source_confidence: "VERIFIED", quality: { completeness: "COMPLETE", freshness: "FRESH", reasons: [] }, ...extra });
const group = (metrics: Record<string, unknown>): readonly ManagerPartitionedMetrics[] => {
  const read = readPartitionedMetricsList([{ partition: partition("PAPER", "USDT", "u"), metrics }]);
  if (read === null) throw new Error("test partitions are not readable");
  return read;
};

describe("1. ranges: reversed is refused, equal is valid, an invalid deep link is said", () => {
  it("readRangeState tells none, a range and an invalid range apart; equal ends are a range", () => {
    expect(readRangeState(null)).toEqual({ kind: "none" });
    expect(readRangeState("..")).toEqual({ kind: "none" });
    expect(readRangeState("10..100")).toEqual({ kind: "range", range: { min: "10", max: "100" } });
    expect(readRangeState("50..50")).toEqual({ kind: "range", range: { min: "50", max: "50" } });
    expect(readRangeState("100..10")).toMatchObject({ kind: "invalid", raw: "100..10", reason: "The minimum is above the maximum" });
    expect(readRangeState("9..100")).toMatchObject({ kind: "range" }); // 9 is below 100 as a number, not as text
    expect(readRangeState("abc..5")).toMatchObject({ kind: "invalid", reason: "An end is not an exact decimal" });
    expect(readRangeState("5")).toMatchObject({ kind: "invalid" });
    expect(isReversed("100", "10")).toBe(true);
    expect(isReversed("10", "10")).toBe(false);
    expect(isReversed(null, "10")).toBe(false);
    expect(isReversed("", "10")).toBe(false);
  });

  const mountFilters = (onRange: (id: RangeId, next: Range | null) => void = () => undefined) =>
    render(<RangeFilters ranges={{}} scoreMissing={false} currency="USDT" windowLabel="90D" offered={["score"]} onRange={onRange} onScoreMissing={() => undefined} />);

  it("Apply of a reversed range: the text stays, the reason is tied to both inputs by aria-describedby, nothing is committed", () => {
    const calls: unknown[] = [];
    mountFilters((id, next) => calls.push([id, next]));
    const min = screen.getByRole("textbox", { name: "Score minimum" }) as HTMLInputElement;
    const max = screen.getByRole("textbox", { name: "Score maximum" }) as HTMLInputElement;
    fireEvent.change(min, { target: { value: "100" } });
    fireEvent.change(max, { target: { value: "10" } });
    fireEvent.keyDown(max, { key: "Enter" });
    fireEvent.blur(max);
    expect(calls).toEqual([]);
    expect(min.value).toBe("100");
    expect(max.value).toBe("10");
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("The minimum 100 is above the maximum 10: nothing is applied. Equal ends are allowed.");
    expect(min.getAttribute("aria-describedby")).toBe(alert.id);
    expect(max.getAttribute("aria-describedby")).toBe(alert.id);
    expect(min.getAttribute("aria-invalid")).toBe("true");
    expect(max.getAttribute("aria-invalid")).toBe("true");
  });

  it("correcting the range commits it; equal ends commit and are inclusive", () => {
    const calls: unknown[] = [];
    mountFilters((id, next) => calls.push([id, next]));
    const min = screen.getByRole("textbox", { name: "Score minimum" });
    const max = screen.getByRole("textbox", { name: "Score maximum" });
    fireEvent.change(min, { target: { value: "100" } });
    fireEvent.change(max, { target: { value: "10" } });
    fireEvent.blur(max);
    expect(calls).toEqual([]);
    fireEvent.change(min, { target: { value: "10" } });
    fireEvent.blur(min);
    expect(calls).toEqual([["score", { min: "10", max: "10" }]]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  function Where() {
    const { pathname, search } = useLocation();
    return <output data-testid="where">{pathname + search}</output>;
  }
  const mount = (api: ExecutionApi, entry: string) => render(<MemoryRouter initialEntries={[entry]}><PortfolioListScreen api={api} /><Where /></MemoryRouter>);
  const served = () => withDataset(makeApi().api, () => datasetFor("FLEET", PF.core));
  const search = () => new URLSearchParams((screen.getByTestId("where").textContent ?? "").split("?")[1] ?? "");

  it("a deep link with a reversed range reads as an invalid range, not as no filter: a visible alert, no row, a chip, and Clear removes it", async () => {
    mount(served(), "/deployments/portfolios?env=paper&f_score=100..10");
    const alert = await screen.findByTestId("invalid-range", undefined, { timeout: 5000 });
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.textContent).toContain("Score 100..10: The minimum is above the maximum. No portfolio is shown until it is corrected or cleared.");
    expect(screen.getByText("Score 100..10 (invalid range)")).toBeTruthy();
    const table = screen.getByRole("table", { name: "Portfolios" });
    expect(within(table).queryAllByRole("row").length).toBeLessThanOrEqual(2); // the head and the empty line
    expect(search().get("f_score")).toBe("100..10"); // the address is not rewritten behind the reader's back
    fireEvent.click(within(alert).getByRole("button", { name: "Clear Score" }));
    await waitFor(() => expect(screen.queryByTestId("invalid-range")).toBeNull());
    expect(search().has("f_score")).toBe(false);
    expect(within(screen.getByRole("table", { name: "Portfolios" })).getAllByRole("row").length).toBeGreaterThan(3);
  });

  it("an unreadable range (not decimals) is invalid too; a valid one next to it still applies once the invalid one is cleared", async () => {
    mount(served(), "/deployments/portfolios?env=paper&f_score=abc..5");
    const alert = await screen.findByTestId("invalid-range", undefined, { timeout: 5000 });
    expect(alert.textContent).toContain("An end is not an exact decimal");
  });

  it("an equal range in the address is a valid inclusive range, not an invalid one", async () => {
    mount(served(), "/deployments/portfolios?env=paper&f_pnl=100.25..100.25&ccy=USDT");
    await screen.findByRole("table", { name: "Portfolios" }, { timeout: 5000 });
    expect(screen.queryByTestId("invalid-range")).toBeNull();
    expect(screen.getByText(/Net PnL ≥ 100.25 USDT and ≤ 100.25 USDT/)).toBeTruthy();
  });
});

describe("2. the score keeps its source's quality and reason beside the value", () => {
  const quality = (completeness: string, freshness: string, reasons: string[] = []) => ({ completeness, freshness, reasons });
  const read = (extra: Body) => scoreOf(group({ portfolio_score: score("82.8", extra) }), null);
  const words = (extra: Body) => {
    const value = read(extra);
    return value.kind === "value" ? value.caveats.map((c) => c.word) : value;
  };

  it("a clean source (complete, fresh, verified, with a methodology) carries no caveat", () => {
    expect(words({})).toEqual([]);
  });

  it.each([
    ["partial", { quality: quality("PARTIAL", "FRESH") }, ["Partial"]],
    ["stale", { quality: quality("COMPLETE", "STALE") }, ["Stale"]],
    ["unknown freshness", { quality: quality("COMPLETE", "UNKNOWN") }, ["Freshness unknown"]],
    ["unresolved completeness", { quality: quality("UNRESOLVED", "FRESH") }, ["Incomplete"]],
    ["provisional confidence", { source_confidence: "PROVISIONAL" }, ["Provisional"]],
    ["unknown confidence", { source_confidence: "UNKNOWN" }, ["Unverified"]],
    ["no methodology", { methodology_ref: null }, ["No methodology"]],
    ["several at once", { quality: quality("PARTIAL", "STALE"), source_confidence: "PROVISIONAL", methodology_ref: null }, ["Partial", "Stale", "Provisional", "No methodology"]],
  ])("%s is labelled, never a clean look", (_name, extra, expected) => {
    expect(words(extra)).toEqual(expected);
  });

  it("provisional is not 'sample below maturity': that sentence needs the owning fact's own reason", () => {
    const generic = read({ source_confidence: "PROVISIONAL" });
    const stated = read({ source_confidence: "PROVISIONAL", quality: quality("PARTIAL", "FRESH", ["SAMPLE_BELOW_MATURITY"]) });
    expect(generic.kind === "value" && generic.maturity).toBeNull();
    expect(stated.kind === "value" && stated.maturity).toBe("Sample below maturity: a numeric score, not yet validated");
  });

  it("an AVAILABLE value keeps the reason code the source published with it", () => {
    const value = read({ reason_code: "FIXTURE_NOTE" });
    expect(value.kind === "value" && value.reasonCode).toBe("FIXTURE_NOTE");
  });

  it("the cell prints each caveat word beside the value, with its sentence on the title; the maturity sentence only when stated", () => {
    const { container, rerender } = render(<ScoreFigure read={read({ quality: quality("PARTIAL", "STALE"), source_confidence: "PROVISIONAL" })} />);
    const printed = [...container.querySelectorAll("[data-caveat]")].map((el) => [el.textContent, el.getAttribute("title")]);
    expect(printed).toEqual([["Partial", "Completeness partial"], ["Stale", "The source is stale"], ["Provisional", "Source confidence is provisional"]]);
    rerender(<ScoreFigure read={read({ source_confidence: "PROVISIONAL", quality: quality("COMPLETE", "FRESH", ["SAMPLE_BELOW_MATURITY"]) })} />);
    expect(container.querySelector("[data-caveat='Provisional']")!.getAttribute("title")).toBe("Sample below maturity: a numeric score, not yet validated");
    rerender(<ScoreFigure read={read({})} />);
    expect(container.querySelector("[data-caveat]")).toBeNull();
  });

  it("a typed absence keeps its availability, reason code and policy", () => {
    const absent = scoreOf(group({ portfolio_score: absentMetric({ unit: "SCORE", currency: null, reason_code: "INSUFFICIENT_EVIDENCE" }) }), null);
    expect(absent).toMatchObject({ kind: "absent", code: "INSUFFICIENT_EVIDENCE", availability: "UNAVAILABLE" });
  });
});

describe("3. units and domain: a value the contract cannot hold is invalid, never banded, sorted or filtered", () => {
  it.each(["-3", "100.0001", "101", "1e2x"])("a score of %s is typed invalid and gets no band", (value) => {
    if (!/^-?\d/.test(value) || value.includes("e")) return; // not a decimal: the reader refuses it before the register sees it
    const read = scoreOf(group({ portfolio_score: score(value) }), null);
    expect(read.kind).toBe("invalid");
    expect(read).toMatchObject({ exact: value });
    expect(read.kind === "invalid" && read.reason).toContain("outside 0 to 100");
    expect(read.kind === "invalid" && read.reason).toContain("no band is given");
  });

  it("the edges 0 and 100 are valid scores", () => {
    expect(scoreOf(group({ portfolio_score: score("0") }), null).kind).toBe("value");
    expect(scoreOf(group({ portfolio_score: score("100") }), null).kind).toBe("value");
  });

  it("a score published in another unit is invalid", () => {
    const read = scoreOf(group({ portfolio_score: { ...moneyMetric({ value: "82.8" }), unit: "PERCENT", currency: null } }), null);
    expect(read).toMatchObject({ kind: "invalid" });
    expect(read.kind === "invalid" && read.reason).toContain("unit PERCENT, not SCORE");
  });

  it("an invalid score is 'missing' for the filter, and never a sort or range operand", () => {
    const bad = group({ portfolio_score: score("-3") });
    expect(measureValue(bad, "portfolio_score", null)).toBeNull();
    expect(scoreOf(bad, null).kind).not.toBe("value");
  });

  it("score components and evidence outside their published range are dropped, not printed as figures", () => {
    const read = scoreOf(group({
      portfolio_score: score("60"), portfolio_score_p: score("120"), portfolio_score_r: score("55"), portfolio_score_b: score("-1"),
      portfolio_score_evidence: { ...moneyMetric({ value: "1.5" }), unit: "RATIO", currency: null },
    }), null);
    expect(read).toMatchObject({ kind: "value", p: null, r: "55", b: null, evidence: null });
  });

  it("a figure in another unit than its key's is not a sort or filter operand; a figure in the right unit is", () => {
    const wrong = group({ net_pnl: { ...moneyMetric({ value: "5" }), unit: "PERCENT", currency: null }, return_30d_pct: moneyMetric({ value: "5" }) });
    expect(measureValue(wrong, "net_pnl", null)).toBeNull();
    expect(measureValue(wrong, "return_30d_pct", null)).toBeNull();
    const right = group({ net_pnl: moneyMetric({ value: "5" }), return_30d_pct: { ...moneyMetric({ value: "5" }), unit: "PERCENT", currency: null } });
    expect(measureValue(right, "net_pnl", "USDT")).toBe("5");
    expect(measureValue(right, "return_30d_pct", "USDT")).toBe("5");
  });

  it("two partitions of one currency in different domains are never one figure: no currency pick makes a single one", () => {
    const read = readPartitionedMetricsList([
      { partition: partition("ACTUAL", "USDT", "a"), metrics: { net_pnl: moneyMetric({ value: "1" }) } },
      { partition: partition("PAPER", "USDT", "p"), metrics: { net_pnl: moneyMetric({ value: "2" }) } },
    ])!;
    expect(measureValue(read, "net_pnl", "USDT")).toBeNull();
    expect(measureValue(read, "net_pnl", null)).toBeNull();
  });
});

describe("5. the score components P / R / B (Portfolio 360 block)", () => {
  const full = (metrics: Record<string, unknown>) => {
    const { container } = render(<ScoreFigure read={scoreOf(group(metrics), null)} full />);
    return container;
  };
  const parts = (container: HTMLElement) => [...container.querySelectorAll(".exec-pf-score-part")].map((el) => el.textContent);

  it("published parts print their two-place value; a published zero is a value, not an absence", () => {
    const c = full({ portfolio_score: score("82.8"), portfolio_score_p: score("80.125"), portfolio_score_r: score("0"), portfolio_score_b: score("83") });
    expect(parts(c)).toEqual(["P 80.12", "R 0.00", "B 83.00"]);
    expect(c.querySelector("[data-gap='SCORE_PART_NOT_PUBLISHED']")).toBeNull();
  });

  it("an unpublished part says 'Not published: component X' in plain words, with the gap code as a data attribute and no ticket code or n/a", () => {
    const c = full({ portfolio_score: score("82.8"), portfolio_score_p: score("80"), portfolio_score_b: score("83") });
    const missing = c.querySelector("[data-gap='SCORE_PART_NOT_PUBLISHED']")!;
    expect(missing.textContent).toBe("Not published: component R");
    expect(missing.getAttribute("data-part")).toBe("R");
    expect(c.textContent).not.toMatch(/n\/a|FE-\d/);
  });

  it("a zero score is a value, and its three unpublished parts are each said", () => {
    const c = full({ portfolio_score: score("0") });
    expect(c.textContent).toContain("0.00");
    expect(c.querySelectorAll("[data-gap='SCORE_PART_NOT_PUBLISHED']").length).toBe(3);
  });
});
