import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConnectedContextBar, ContextBar, WINDOW_NOT_SERVED_REASON } from "./ContextBar";

afterEach(cleanup);

const noop = () => undefined;

describe("ContextBar", () => {
  it("labels the live environment Real-funded and marks the current choice", () => {
    render(<ContextBar env="live" window="90D" onChange={noop} />);
    const real = screen.getByRole("button", { name: "Real-funded" });
    expect(real.getAttribute("data-v")).toBe("live");
    expect(real.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Paper" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Sandbox" })).toBeTruthy();
  });

  it("offers 7D, 30D, 90D and ALL with the given window pressed", () => {
    render(<ContextBar env="live" window="90D" onChange={noop} />);
    const group = screen.getByRole("group", { name: "Window" });
    expect([...group.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["7D", "30D", "90D", "ALL"]);
    expect(screen.getByRole("button", { name: "90D" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("reports a change as a patch and ignores a click on the current choice", () => {
    const onChange = vi.fn();
    render(<ContextBar env="live" window="90D" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "90D" }));
    fireEvent.click(screen.getByRole("button", { name: "Real-funded" }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "30D" }));
    fireEvent.click(screen.getByRole("button", { name: "Paper" }));
    expect(onChange.mock.calls).toEqual([[{ window: "30D" }], [{ env: "paper" }]]);
  });

  it("names the bar and its two controls for assistive tech", () => {
    render(<ContextBar env="live" window="90D" onChange={noop} />);
    expect(screen.getByRole("group", { name: "Context" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Environment" })).toBeTruthy();
  });

  it("disables the window control with its reason attached and leaves the environment live", () => {
    render(
      <ContextBar
        env="live"
        window="90D"
        onChange={noop}
        windowLock={{ reason: WINDOW_NOT_SERVED_REASON, effective: "ALL" }}
        accessHref="/administration/profile-access#do"
      />,
    );
    for (const name of ["7D", "30D", "90D", "ALL"]) {
      const button = screen.getByRole("button", { name }) as HTMLButtonElement;
      expect(button.disabled, name).toBe(true);
      const reason = document.getElementById(button.getAttribute("aria-describedby") ?? "");
      expect(reason?.textContent).toContain("Window applies when the server supports it.");
    }
    expect((screen.getByRole("button", { name: "Paper" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("Window fixed: ALL")).toBeTruthy();
    expect(screen.getByRole("link", { name: "My access" }).getAttribute("href")).toBe("/administration/profile-access#do");
  });

  it("does not click through a locked window", () => {
    const onChange = vi.fn();
    render(<ContextBar env="live" window="90D" onChange={onChange} windowLock={{ reason: WINDOW_NOT_SERVED_REASON }} />);
    fireEvent.click(screen.getByRole("button", { name: "7D" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("draws nothing for what it does not know: no As of, no dash, no placeholder chip", () => {
    const { container } = render(<ContextBar env="live" window="90D" onChange={noop} />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/as of/i);
    expect(text).not.toMatch(/[—–]|N\/A/);
    expect(container.querySelector(".exec-ctxbar-chip")).toBeNull();
    expect(container.querySelector(".exec-ctxbar-lock")).toBeNull();
    expect(container.querySelector(".exec-ctxbar-reason")).toBeNull();
  });

  it("shows currency and scope only when given", () => {
    render(<ContextBar env="live" window="90D" ccy="USDT" scope="Scope: Your alphas" onChange={noop} />);
    expect(screen.getByText("USDT · one basis")).toBeTruthy();
    expect(screen.getByText("Scope: Your alphas")).toBeTruthy();
  });
});

describe("ConnectedContextBar", () => {
  function Where() {
    const { pathname, search } = useLocation();
    return <output data-testid="where">{`${pathname}${search}`}</output>;
  }
  const mount = (url: string, lock?: null) =>
    render(
      <MemoryRouter initialEntries={[url]}>
        <ConnectedContextBar {...(lock === null ? { windowLock: null } : {})} />
        <Where />
      </MemoryRouter>,
    );
  const where = () => screen.getByTestId("where").textContent;

  it("reads env and window from the URL, with 90D as the default", () => {
    mount("/execution?env=paper");
    expect(screen.getByRole("button", { name: "Paper" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "90D" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("starts with the window locked and says why, since no read accepts one yet", () => {
    mount("/execution");
    const button = screen.getByRole("button", { name: "30D" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const described = button.getAttribute("aria-describedby");
    expect(described && document.getElementById(described)?.textContent).toContain(WINDOW_NOT_SERVED_REASON);
    fireEvent.click(button);
    expect(where()).toBe("/execution");
  });

  it("writes the choice and keeps every other param", () => {
    mount("/execution?q=btc&sel=al_1&workspace_id=ws_9&tab=risk", null);
    fireEvent.click(screen.getByRole("button", { name: "30D" }));
    expect(where()).toBe("/execution?q=btc&sel=al_1&workspace_id=ws_9&tab=risk&window=30d");
    fireEvent.click(screen.getByRole("button", { name: "Sandbox" }));
    expect(where()).toBe("/execution?q=btc&sel=al_1&workspace_id=ws_9&tab=risk&window=30d&env=sandbox");
  });

  it("keeps the URL value live for Real-funded and drops a default from the URL", () => {
    mount("/execution?env=paper&window=7d&q=x", null);
    fireEvent.click(screen.getByRole("button", { name: "Real-funded" }));
    expect(where()).toBe("/execution?window=7d&q=x");
    fireEvent.click(screen.getByRole("button", { name: "90D" }));
    expect(where()).toBe("/execution?q=x");
  });
});
