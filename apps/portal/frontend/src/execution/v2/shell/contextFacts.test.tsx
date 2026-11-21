/** The facts a screen publishes to the context bar: scope, and the currency it actually states. */
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { BASIS_EACH_CURRENCY, ConnectedContextBar, SCOPE_EVERY_PORTFOLIO } from "./ContextBar";
import { useContextFacts, type ContextFacts } from "./contextFacts";

afterEach(cleanup);

function Screen({ facts }: { facts: ContextFacts }) {
  useContextFacts(facts);
  return <p>screen</p>;
}

function mount(url: string, facts: ContextFacts | null, barProps: Parameters<typeof ConnectedContextBar>[0] = {}) {
  const ui = (f: ContextFacts | null) => (
    <MemoryRouter initialEntries={[url]}>
      <ConnectedContextBar {...barProps} />
      {f === null ? null : <Screen facts={f} />}
    </MemoryRouter>
  );
  const view = render(ui(facts));
  return { rerender: (f: ContextFacts | null) => view.rerender(ui(f)) };
}

const chips = () => [...document.querySelectorAll(".exec-ctxbar-chip")].map((el) => el.textContent);

/** Every route states basis and scope (WP-D): a screen's facts replace the published defaults, they are never absent. */
const DEFAULTS = [BASIS_EACH_CURRENCY, SCOPE_EVERY_PORTFOLIO];

describe("context facts", () => {
  it("states the published defaults when no screen states a scope or a currency: each currency on its own, every portfolio you may see", () => {
    mount("/execution", null);
    expect(chips()).toEqual(DEFAULTS);
  });

  it("draws the scope a screen publishes, and drops it when the screen unmounts", () => {
    const view = mount("/execution", { scope: "Scope: Your alphas" });
    expect(chips()).toEqual([BASIS_EACH_CURRENCY, "Scope: Your alphas"]);
    act(() => view.rerender(null));
    expect(chips()).toEqual(DEFAULTS);
  });

  it("follows a changed value without waiting for a remount", () => {
    const view = mount("/execution", { scope: "Scope: Your orders" });
    act(() => view.rerender({ scope: undefined }));
    expect(chips()).toEqual(DEFAULTS);
  });

  it("a screen that states a currency shows it without the URL carrying one", () => {
    mount("/deployments/compare", { ccy: "USDT" });
    expect(chips()).toEqual(["Basis: USDT, one currency", SCOPE_EVERY_PORTFOLIO]);
  });

  it("a screen that states no currency hides one left in the URL by another screen", () => {
    mount("/deployments/compare?ccy=eur", { ccy: null });
    expect(chips()).toEqual(DEFAULTS);
  });

  it("a screen that publishes nothing about currency leaves the URL's ccy alone", () => {
    mount("/deployments/portfolios?ccy=eur", { scope: undefined });
    expect(chips()).toEqual(["Basis: EUR, one currency", SCOPE_EVERY_PORTFOLIO]);
  });

  it("a scope prop on the bar wins over a published one", () => {
    mount("/execution", { scope: "Scope: Your alphas" }, { scope: "Scope: Fixed by caller" });
    expect(chips()).toEqual([BASIS_EACH_CURRENCY, "Scope: Fixed by caller"]);
    expect(screen.queryByText("Scope: Your alphas")).toBeNull();
  });

  it("the later screen owns the facts; the earlier one unmounting later does not clear them", () => {
    function Two({ first }: { first: boolean }) {
      return (
        <MemoryRouter initialEntries={["/execution"]}>
          <ConnectedContextBar />
          {first ? <Screen facts={{ scope: "Scope: first" }} /> : null}
          <Screen facts={{ scope: "Scope: second" }} />
        </MemoryRouter>
      );
    }
    const view = render(<Two first />);
    expect(chips()).toEqual([BASIS_EACH_CURRENCY, "Scope: second"]);
    view.rerender(<Two first={false} />);
    expect(chips()).toEqual([BASIS_EACH_CURRENCY, "Scope: second"]);
  });
});
