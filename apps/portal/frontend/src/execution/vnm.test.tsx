/**
 * Paper Workbench VNM tests (phase 13).
 *
 * `IMPLEMENTATION_PHASES` §13 closes this phase on one sentence — *"freshness
 * clock provably pauses outside 09:00–14:45 ICT"* — so the calendar gets its
 * own suite, held against the clock rather than against the rendering.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PaperWorkbench } from "./screens/PaperWorkbench";
import { VNM_OPEN, vnmWorkbench } from "./vnm.fixtures";
import { VN_MARKET, formatUntil, sessionState, tradingDaysBetween } from "./vnCalendar";
import { paperHandlers } from "./testHandlers";

afterEach(cleanup);

describe("the venue clock pauses outside the session", () => {
  it("is open inside 09:00–14:45 and closed outside it", () => {
    expect(sessionState("2026-08-21T09:00:00", VN_MARKET).phase).toBe("OPEN");
    expect(sessionState("2026-08-21T14:44:00", VN_MARKET).phase).toBe("OPEN");
    // 14:45 is the close itself, not a minute of trading.
    expect(sessionState("2026-08-21T14:45:00", VN_MARKET).phase).toBe("CLOSED_BY_CALENDAR");
    expect(sessionState("2026-08-21T08:59:00", VN_MARKET).phase).toBe("CLOSED_BY_CALENDAR");
  });

  it("reads PAUSED outside the session, never STALE", () => {
    // The distinction the whole screen turns on: outside the session the data
    // is exactly as fresh as the market allows, and STALE would send an
    // operator hunting a fault in a system working correctly.
    expect(sessionState("2026-08-21T20:14:00", VN_MARKET).freshness).toBe("PAUSED");
    expect(sessionState("2026-08-21T10:42:00", VN_MARKET).freshness).toBe("OK");
  });

  it("counts to the next open across an evening", () => {
    // 20:14 Friday → 09:00 Monday is a weekend, not twelve hours.
    const friday = sessionState("2026-08-21T20:14:00", VN_MARKET);
    expect(friday.reopensAt).toBe("2026-08-24T09:00:00");
    const thursday = sessionState("2026-08-20T20:14:00", VN_MARKET);
    expect(thursday.reopensAt).toBe("2026-08-21T09:00:00");
    expect(formatUntil(thursday.reopensInMinutes)).toBe("12h 46m");
  });

  it("skips a holiday the venue published", () => {
    const withHoliday = { ...VN_MARKET, holidays: ["2026-09-02"] };
    // 2026-09-01 is a Tuesday; the next day is National Day.
    const state = sessionState("2026-09-01T16:00:00", withHoliday);
    expect(state.reopensAt).toBe("2026-09-03T09:00:00");
  });

  it("does not let a closure consume the observation window", () => {
    // §13: the gate counts TRADING days. A deployment that sat through a
    // holiday week has not observed those days, and counting them would
    // promote an alpha on a fortnight of shut markets.
    const week = tradingDaysBetween("2026-08-17", "2026-08-23", VN_MARKET);
    expect(week).toBe(5);
    const withHoliday = tradingDaysBetween("2026-08-31", "2026-09-06", {
      ...VN_MARKET,
      holidays: ["2026-09-02"],
    });
    expect(withHoliday).toBe(4);
  });

  it("takes the venue's own local time, never the browser's clock", () => {
    // The same instant is a different session in two timezones, and the
    // reader is asking what the venue is doing.
    const before = sessionState("2026-08-21T08:59:00", VN_MARKET);
    const after = sessionState("2026-08-21T09:01:00", VN_MARKET);
    expect(before.phase).not.toBe(after.phase);
  });
});

describe("Paper Workbench VNM — the session variant", () => {
  it("shows the session chip and the runtime chip together", () => {
    // Session state is not runtime state. The venue is shut and the deployment
    // is still ready; collapsing the two reports a healthy deployment stopped.
    render(<PaperWorkbench {...paperHandlers()} {...vnmWorkbench()} />);
    expect(screen.getByText("SUSPENDED_BY_CALENDAR")).toBeTruthy();
    expect(screen.getByText("READY")).toBeTruthy();
  });

  it("explains the closure in INFO tone and says it is not STALE", () => {
    const { container } = render(<PaperWorkbench {...paperHandlers()} {...vnmWorkbench()} />);
    expect(screen.getByText(/paused against the venue calendar/)).toBeTruthy();
    expect(screen.getByText(/this is not STALE/)).toBeTruthy();
    // And it is the calendar banner, not the stale banner.
    expect(container.querySelector(".exec-paper-calendar")).toBeTruthy();
    expect(container.querySelector(".exec-paper-stale")).toBeNull();
  });

  it("says off-hours signals queue and risk re-validates at open", () => {
    render(<PaperWorkbench {...paperHandlers()} {...vnmWorkbench()} />);
    expect(screen.getByText(/queue as at-open intents/)).toBeTruthy();
    expect(screen.getByText(/re-validated by risk at session open/)).toBeTruthy();
  });

  it("drops the closure banner once the market opens", () => {
    const { container } = render(<PaperWorkbench {...paperHandlers()} {...vnmWorkbench(VNM_OPEN)} />);
    expect(container.querySelector(".exec-paper-calendar")).toBeNull();
    expect(screen.queryByText("SUSPENDED_BY_CALENDAR")).toBeNull();
  });

  it("keeps VN order types verbatim rather than translating them", () => {
    // ATO and ATC are not MARKET, and LO is not LIMIT: they match at the
    // auctions under rules a continuous-session type does not have, and a
    // translated word is one the venue would not recognise on a support call.
    render(<PaperWorkbench {...paperHandlers()} {...vnmWorkbench()} />);
    expect(screen.getByText("ATO BUY")).toBeTruthy();
    expect(screen.getByText("ATC SELL")).toBeTruthy();
    expect(screen.getAllByText("LO BUY").length).toBeGreaterThan(0);
    expect(screen.queryByText(/MARKET BUY|LIMIT BUY/)).toBeNull();
  });

  it("counts the gate in sessions and says closures do not consume it", () => {
    render(<PaperWorkbench {...paperHandlers()} {...vnmWorkbench()} />);
    expect(screen.getByText(/counts TRADING days/)).toBeTruthy();
    expect(screen.getByText(/21 more trading sessions/)).toBeTruthy();
  });

  it("shows credential status without offering a control that does nothing", () => {
    // Renewal is Execution-side. A button here would be a promise the Portal
    // cannot keep.
    const { container } = render(<PaperWorkbench {...paperHandlers()} {...vnmWorkbench()} />);
    const strip = container.querySelector(".exec-paper-credential") as HTMLElement;
    expect(within(strip).getByText("DNSE-01")).toBeTruthy();
    expect(within(strip).getByText("EXPIRING")).toBeTruthy();
    expect(within(strip).getByText(/renewal is Execution-side/)).toBeTruthy();
    expect(within(strip).queryByRole("button")).toBeNull();
  });

  it("keeps every figure in VND and never mixes a second currency", () => {
    const { container } = render(<PaperWorkbench {...paperHandlers()} {...vnmWorkbench()} />);
    expect(container.textContent).not.toContain("USDT");
    expect(screen.getAllByText("VND").length).toBeGreaterThan(0);
  });

  it("names the settlement convention the venue actually uses", () => {
    render(<PaperWorkbench {...paperHandlers()} {...vnmWorkbench()} />);
    expect(screen.getByText(/T\+2\.5/)).toBeTruthy();
    expect(screen.getByText(/lot size/)).toBeTruthy();
  });
});
