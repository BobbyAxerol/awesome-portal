/**
 * Account / Broker 360° tests (phase 17).
 *
 * This screen makes one safety claim — whether there is room for the next
 * order across every account a physical binding backs — and most of what
 * follows checks that the claim comes from whatever enforces it rather than
 * from the browser, and that a population it could not complete is never
 * presented as a total.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AccountBroker360, HeadroomBanner } from "./screens/AccountBroker360";
import {
  HEADROOM_EXCEEDED,
  HEADROOM_OK,
  HEADROOM_UNKNOWN,
  PARTIAL_EXPOSURE,
  account360,
} from "./account360.fixtures";

afterEach(cleanup);

describe("Account 360° — three authorities, never merged", () => {
  it("attributes each column to the source that vouches for it", () => {
    const { container } = render(<AccountBroker360 {...account360()} />);
    const columns = [...container.querySelectorAll(".exec-360-col")];
    expect(columns).toHaveLength(3);
    expect(columns[0].textContent).toContain("EXECUTION");
    expect(columns[1].textContent).toContain("BROKER");
    expect(columns[2].textContent).toContain("DERIVED");
  });

  it("names the formula behind the difference rather than showing a bare delta", () => {
    render(<AccountBroker360 {...account360()} />);
    expect(screen.getByText(/diff\.v1/)).toBeTruthy();
    expect(screen.getByText(/Δ 186\.00/)).toBeTruthy();
    expect(screen.getByText(/funding accrual pending/)).toBeTruthy();
  });

  it("distinguishes a match from a comparison that could not be made", () => {
    render(
      <AccountBroker360
        {...account360({
          difference: {
            envelope: { authority: "DERIVED", asOf: null, freshness: "UNKNOWN" },
            rows: [
              { label: "positions", verdict: "MATCH" },
              { label: "open orders", verdict: "UNKNOWN" },
            ],
          },
        })}
      />,
    );
    expect(screen.getByText("MATCH")).toBeTruthy();
    // "not compared" rather than a zero delta: neither side was read.
    expect(screen.getByText("not compared")).toBeTruthy();
  });

  it("states an unreported figure as unreported, never as zero", () => {
    const { container } = render(
      <AccountBroker360
        {...account360({
          broker: {
            positions: null,
            openOrders: "1",
            headline: { label: "balance", value: null, currency: "USDT" },
            envelope: { authority: "BROKER", asOf: null, freshness: "UNKNOWN" },
          },
        })}
      />,
    );
    // Scoped to the broker column. A bare `queryByText("0")` would also match
    // "open findings 0" elsewhere on the screen, which is a real zero — the
    // rule is about substituting one for a figure nobody reported.
    const brokerColumn = [...container.querySelectorAll(".exec-360-col")][1] as HTMLElement;
    expect(within(brokerColumn).getAllByText("not reported")).toHaveLength(2);
    expect(within(brokerColumn).queryByText("0")).toBeNull();
    expect(within(brokerColumn).getByText("1")).toBeTruthy();
  });
});

describe("Account 360° — the headroom verdict is read, never computed", () => {
  it("shows the server's OK verdict with both sides of it", () => {
    render(<HeadroomBanner aggregate={HEADROOM_OK} />);
    expect(screen.getByText(/Σ virtual 41,000\.00/)).toBeTruthy();
    expect(screen.getByText(/physical 43,120\.00/)).toBeTruthy();
    expect(screen.getByText(/within physical broker headroom/)).toBeTruthy();
  });

  it("says every linked account fails closed on a breach", () => {
    render(<HeadroomBanner aggregate={HEADROOM_EXCEEDED} />);
    expect(screen.getByText(/exceeds physical broker headroom/)).toBeTruthy();
    expect(screen.getByText(/fail closed across ALL linked accounts|ALL linked accounts fail closed/)).toBeTruthy();
    expect(screen.getByText(/alpha screens never conclude it alone/)).toBeTruthy();
  });

  it("refuses to invent a verdict when the server published none", () => {
    // The dangerous rendering is nothing at all: an absent banner reads as
    // "no problem found", which is the one reading this control cannot afford.
    render(<HeadroomBanner aggregate={null} />);
    expect(screen.getByText(/has not been published/)).toBeTruthy();
    expect(screen.getByText(/the browser's sum is not what the order path enforces/)).toBeTruthy();
  });

  it("does not sum the linked rows, even though they are on screen", () => {
    // 18,400 + 14,900 + 7,700 = 41,000, and the fixture's aggregate says so —
    // but only because the fixture was told to. Change the verdict alone and
    // the banner must follow the verdict, not the arithmetic.
    render(
      <AccountBroker360 {...account360({ aggregate: HEADROOM_EXCEEDED })} />,
    );
    expect(screen.getByText(/Σ virtual 46,800\.00/)).toBeTruthy();
    // The rows still add to 41,000 and the screen still says 46,800, because
    // the server is the one that knows what else this binding backs.
    expect(screen.getByText("18,400.00")).toBeTruthy();
  });

  it("carries an UNKNOWN verdict as unknown rather than as OK", () => {
    render(<HeadroomBanner aggregate={HEADROOM_UNKNOWN} />);
    expect(screen.getByText(/could not be determined/)).toBeTruthy();
  });
});

describe("Account 360° — a partial population is never a total", () => {
  it("qualifies an OK verdict drawn from 21 of 24 accounts", () => {
    render(<HeadroomBanner aggregate={HEADROOM_OK} exposure={PARTIAL_EXPOSURE} />);
    expect(screen.getByText(/21 of 24 accounts/)).toBeTruthy();
    expect(screen.getByText(/partial aggregate, not the binding total/)).toBeTruthy();
  });

  it("leaves a complete population unqualified", () => {
    render(<AccountBroker360 {...account360()} />);
    expect(screen.queryByText(/partial aggregate/)).toBeNull();
  });

  it("says how many accounts were expected when the list is short", () => {
    const { container } = render(
      <AccountBroker360 {...account360({ exposure: PARTIAL_EXPOSURE })} />,
    );
    const table = container.querySelector(".exec-360-linked")!;
    expect(table.querySelector("caption")!.textContent).toMatch(/of 24 expected/);
  });

  it("keeps the viewed account in the list, marked", () => {
    // Filtering it out would leave a sum whose parts do not add up on screen.
    const { container } = render(<AccountBroker360 {...account360()} />);
    const table = container.querySelector(".exec-360-linked") as HTMLElement;
    expect(within(table).getByText("acct-live-grid-v21")).toBeTruthy();
    expect(table.querySelector('tr[data-current="true"]')).toBeTruthy();
  });
});

describe("Account 360° — the secret, the guard band and the buttons", () => {
  it("shows the credential alias and says the secret is withheld on purpose", () => {
    render(<AccountBroker360 {...account360()} />);
    expect(screen.getByText(/credential alias BIN-01/)).toBeTruthy();
    expect(screen.getByText("VALID")).toBeTruthy();
    // A reader who cannot see the secret should know that is deliberate
    // rather than a rendering failure.
    expect(screen.getByText("secret never displayed")).toBeTruthy();
  });

  it("bands a live account, and does not band a paper one", () => {
    const { container, rerender } = render(<AccountBroker360 {...account360()} />);
    expect(container.querySelector(".exec-360-guard")).toBeTruthy();
    rerender(<AccountBroker360 {...account360({ stage: "PAPER_OBSERVATION" })} />);
    expect(container.querySelector(".exec-360-guard")).toBeNull();
  });

  it("bands a canary account too, because it is also live capital", () => {
    const { container } = render(<AccountBroker360 {...account360({ stage: "LIVE_CANARY" })} />);
    expect(container.querySelector(".exec-360-guard")).toBeTruthy();
  });

  it("hides mutation buttons entirely rather than disabling them", () => {
    // A button an actor may never press is a question they will keep asking.
    render(<AccountBroker360 {...account360()} />);
    expect(screen.queryByRole("button", { name: "Sync now" })).toBeNull();
    expect(screen.queryByRole("button", { name: /dry-run/i })).toBeNull();
  });

  it("offers them to an operator admin", () => {
    const onSyncNow = vi.fn();
    render(<AccountBroker360 {...account360({ operatorAdmin: true, onSyncNow })} />);
    screen.getByRole("button", { name: "Sync now" }).click();
    expect(onSyncNow).toHaveBeenCalledOnce();
  });

  it("keeps the stale sync row visible rather than showing only successes", () => {
    render(<AccountBroker360 {...account360()} />);
    expect(screen.getByText("STALE 6.2s")).toBeTruthy();
  });

  it("says apply-from-broker goes through plan, apply and verify", () => {
    render(<AccountBroker360 {...account360()} />);
    expect(screen.getByText(/plan → apply → verify/)).toBeTruthy();
  });

  it("renders a panel state rather than a half-populated screen when the read fails", () => {
    render(<AccountBroker360 {...account360({ status: "denied", reason: "Not your binding." })} />);
    expect(screen.getByText("Not your binding.")).toBeTruthy();
    expect(screen.queryByText(/Broker binding/)).toBeNull();
  });
});
