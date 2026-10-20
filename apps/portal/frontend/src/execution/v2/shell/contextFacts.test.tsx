/** The facts a screen publishes to the context bar: scope, and the currency it actually states. */
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { ConnectedContextBar } from "./ContextBar";
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

describe("context facts", () => {
  it("draws no scope and no currency when no screen states one", () => {
    mount("/execution", null);
    expect(chips()).toEqual([]);
  });

  it("draws the scope a screen publishes, and drops it when the screen unmounts", () => {
    const view = mount("/execution", { scope: "Scope: Your alphas" });
    expect(chips()).toEqual(["Scope: Your alphas"]);
    act(() => view.rerender(null));
    expect(chips()).toEqual([]);
  });

  it("follows a changed value without waiting for a remount", () => {
    const view = mount("/execution", { scope: "Scope: Your orders" });
    act(() => view.rerender({ scope: undefined }));
    expect(chips()).toEqual([]);
  });

  it("a screen that states a currency shows it without the URL carrying one", () => {
    mount("/deployments/portfolios?view=compare", { ccy: "USDT" });
    expect(chips()).toEqual(["USDT"]);
  });

  it("a screen that states no currency hides one left in the URL by another screen", () => {
    mount("/deployments/portfolios?view=compare&ccy=eur", { ccy: null });
    expect(chips()).toEqual([]);
  });

  it("a screen that publishes nothing about currency leaves the URL's ccy alone", () => {
    mount("/deployments/portfolios?ccy=eur", { scope: undefined });
    expect(chips()).toEqual(["EUR"]);
  });

  it("a scope prop on the bar wins over a published one", () => {
    mount("/execution", { scope: "Scope: Your alphas" }, { scope: "Scope: Fixed by caller" });
    expect(chips()).toEqual(["Scope: Fixed by caller"]);
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
    expect(chips()).toEqual(["Scope: second"]);
    view.rerender(<Two first={false} />);
    expect(chips()).toEqual(["Scope: second"]);
  });
});
