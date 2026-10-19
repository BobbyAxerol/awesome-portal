import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConnectedContextBar, ContextBar, WINDOW_NOT_SERVED_REASON, invalidNotice } from "./ContextBar";

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

  it("envLock disables the environment buttons and ties the reason to them, leaving the window alone", () => {
    const onChange = vi.fn();
    render(<ContextBar env="paper" window="90D" onChange={onChange} windowLock={null} envLock={{ reason: "Not published (FE-052). No environment filter." }} />);
    const sandbox = screen.getByRole("button", { name: "Sandbox" }) as HTMLButtonElement;
    expect(sandbox.disabled).toBe(true);
    expect(document.getElementById(sandbox.getAttribute("aria-describedby") ?? "")?.textContent).toBe("Not published (FE-052). No environment filter.");
    expect(screen.getByRole("button", { name: "Paper" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(sandbox);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "30D" }));
    expect(onChange).toHaveBeenCalledWith({ window: "30D" });
  });

  it("envLock.effective shows the screen's own environment as pressed, with 'Environment fixed' beside it (S3 plan s1)", () => {
    render(<ContextBar env="live" window="90D" onChange={noop} windowLock={null} envLock={{ reason: "The deployment fixes the environment.", effective: "paper" }} />);
    expect(screen.getByRole("button", { name: "Paper" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Real-funded" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("Environment fixed: Paper")).toBeTruthy();
    for (const name of ["Real-funded", "Paper", "Sandbox"]) {
      const button = screen.getByRole("button", { name }) as HTMLButtonElement;
      expect(button.disabled, name).toBe(true);
      expect(document.getElementById(button.getAttribute("aria-describedby") ?? "")?.textContent).toBe("The deployment fixes the environment.");
    }
  });

  it.each([
    ["sandbox", "Sandbox", "Environment fixed: Sandbox"],
    ["live", "Real-funded", "Environment fixed: Real-funded"],
  ] as const)("envLock.effective=%s presses %s", (effective, name, fixed) => {
    render(<ContextBar env="paper" window="90D" onChange={noop} windowLock={null} envLock={{ reason: "r", effective }} />);
    expect(screen.getByRole("button", { name }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Paper" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText(fixed)).toBeTruthy();
  });

  it("envLock.effective does not click through, and a window change still reports", () => {
    const onChange = vi.fn();
    render(<ContextBar env="live" window="90D" onChange={onChange} windowLock={null} envLock={{ reason: "r", effective: "sandbox" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Paper" }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "7D" }));
    expect(onChange).toHaveBeenCalledWith({ window: "7D" });
  });

  it("an envLock without effective keeps the URL's environment pressed and prints no 'fixed' chip (the Blotter pattern)", () => {
    const { container } = render(<ContextBar env="paper" window="90D" onChange={noop} windowLock={null} envLock={{ reason: "Not published (FE-052)." }} />);
    expect(screen.getByRole("button", { name: "Paper" }).getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector(".exec-ctxbar-lock")).toBeNull();
  });

  it("an effective value the bar cannot name is ignored, not printed", () => {
    const bad = { reason: "r", effective: "canary" } as unknown as Parameters<typeof ContextBar>[0]["envLock"];
    const { container } = render(<ContextBar env="paper" window="90D" onChange={noop} windowLock={null} envLock={bad} />);
    expect(screen.getByRole("button", { name: "Paper" }).getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector(".exec-ctxbar-lock")).toBeNull();
  });

  it("windowLock.effective and envLock.effective can sit together", () => {
    render(<ContextBar env="live" window="90D" onChange={noop} windowLock={{ reason: "w", effective: "Certification run" }} envLock={{ reason: "e", effective: "sandbox" }} />);
    expect(screen.getByText("Window fixed: Certification run")).toBeTruthy();
    expect(screen.getByText("Environment fixed: Sandbox")).toBeTruthy();
  it("D6: an effective environment (the path decides) is the pressed one, whatever the URL value, with the notice attached", () => {
    const onChange = vi.fn();
    render(<ContextBar env="live" window="90D" onChange={onChange} windowLock={null} envLock={{ reason: "The path sets the environment.", effective: "paper" }} />);
    expect(screen.getByRole("button", { name: "Paper" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Real-funded" }).getAttribute("aria-pressed")).toBe("false");
    for (const name of ["Real-funded", "Paper", "Sandbox"]) {
      const button = screen.getByRole("button", { name }) as HTMLButtonElement;
      expect(button.disabled, name).toBe(true);
      expect(document.getElementById(button.getAttribute("aria-describedby") ?? "")?.textContent).toBe("The path sets the environment.");
    }
    fireEvent.click(screen.getByRole("button", { name: "Real-funded" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("D7: names the rejected params, never their values, and dismisses on request", () => {
    const onDismiss = vi.fn();
    render(<ContextBar env="live" window="90D" onChange={noop} invalid={["stage", "env", "window"]} onDismissInvalid={onDismiss} />);
    const notice = screen.getByRole("status");
    expect(notice.textContent).toContain("Ignored invalid URL parameters: stage, env, window.");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("D7: one name reads in the singular, a long list is capped, nothing is drawn when empty", () => {
    expect(invalidNotice(["env"])).toBe("Ignored invalid URL parameter: env. Defaults are shown.");
    expect(invalidNotice(["a", "b", "c", "d", "e", "f", "g", "h"])).toContain("a, b, c, d, e, f and 2 more");
    const { container } = render(<ContextBar env="live" window="90D" onChange={noop} invalid={[]} />);
    expect(container.querySelector('[data-notice="invalid-params"]')).toBeNull();
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

  it("D7: stage=foo, env=xx and window=24h are named once on the bar, the URL is rewritten, and Dismiss clears the notice", () => {
    mount("/deployments/alphas?stage=foo&env=xx&window=24h&q=carry", null);
    const notice = document.querySelector('[data-notice="invalid-params"]')!;
    expect(notice.textContent).toContain("Ignored invalid URL parameters: env, window, stage.");
    // Names only: the rejected values are not printed anywhere.
    expect(document.body.textContent).not.toMatch(/foo|xx|24h/);
    // The bar shows the defaults it fell back to, and the screen-local param survives the rewrite.
    expect(screen.getByRole("button", { name: "Real-funded" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "90D" }).getAttribute("aria-pressed")).toBe("true");
    expect(where()).toBe("/deployments/alphas?q=carry");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(document.querySelector('[data-notice="invalid-params"]')).toBeNull();
    expect(where()).toBe("/deployments/alphas?q=carry");
  });

  it("D7: a clean URL draws no notice", () => {
    mount("/execution?env=paper&window=30d&q=x");
    expect(document.querySelector('[data-notice="invalid-params"]')).toBeNull();
  });

  it("keeps the URL value live for Real-funded and drops a default from the URL", () => {
    mount("/execution?env=paper&window=7d&q=x", null);
    fireEvent.click(screen.getByRole("button", { name: "Real-funded" }));
    expect(where()).toBe("/execution?window=7d&q=x");
    fireEvent.click(screen.getByRole("button", { name: "90D" }));
    expect(where()).toBe("/execution?q=x");
  });
});
