import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConnectedContextBar, ContextBar, WINDOW_NOT_SERVED_REASON, invalidNotice } from "./ContextBar";
import { whyText } from "../gapWhyTestUtil";

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

  it("draws no window buttons when the window is locked; the reason stays in the title, the fixed window is a chip, My access links", () => {
    render(
      <MemoryRouter>
        <ContextBar
          env="live"
          window="90D"
          onChange={noop}
          windowLock={{ reason: WINDOW_NOT_SERVED_REASON, effective: "ALL" }}
          accessHref="/administration/profile-access#do"
        />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("group", { name: "Window" })).toBeNull();
    for (const name of ["7D", "30D", "90D", "ALL"]) expect(screen.queryByRole("button", { name }), name).toBeNull();
    // The environment is not locked: it stays a live choice.
    expect((screen.getByRole("button", { name: "Paper" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("Window: ALL")).toBeTruthy();
    expect(whyText(document.querySelector('[data-notice="lock"]'))).toContain("Window applies when the server supports it.");
    const access = screen.getByRole("link", { name: "My access" });
    expect(access.getAttribute("href")).toBe("/administration/profile-access#do");
    // A router link: the click is handled in the page (cancelled), not left to the browser as a full reload.
    expect(fireEvent.click(access)).toBe(false);
  });

  it("a locked window folds into one 'Not applied' line, with no dead button", () => {
    render(<ContextBar env="live" window="90D" onChange={noop} windowLock={{ reason: WINDOW_NOT_SERVED_REASON, unapplied: true }} />);
    expect(screen.queryByRole("button", { name: "7D" })).toBeNull();
    expect(document.querySelector('[data-notice="lock"]')?.textContent).toBe("Not applied: Window");
  });

  it("envLock without effective draws no environment buttons and presses nothing (the Blotter pattern)", () => {
    const { container } = render(<ContextBar env="live" window="90D" onChange={noop} windowLock={null} envLock={{ reason: "Not published (FE-052). No environment filter.", unapplied: true }} />);
    expect(screen.queryByRole("group", { name: "Environment" })).toBeNull();
    for (const name of ["Real-funded", "Paper", "Sandbox"]) expect(screen.queryByRole("button", { name }), name).toBeNull();
    expect(container.querySelector('[aria-pressed="true"]')?.closest('[data-control="env"]')).toBeNull();
    expect(container.querySelector('[data-control="env"]')).toBeNull();
    expect(document.querySelector('[data-notice="lock"]')?.textContent).toBe("Not applied: Environment");
    expect(container.textContent).toContain("Not published (FE-052). No environment filter.");
  });

  it("the window control still works beside a locked environment", () => {
    const onChange = vi.fn();
    render(<ContextBar env="paper" window="90D" onChange={onChange} windowLock={null} envLock={{ reason: "r", unapplied: true }} />);
    fireEvent.click(screen.getByRole("button", { name: "30D" }));
    expect(onChange).toHaveBeenCalledWith({ window: "30D" });
  });

  it("envLock.effective draws the screen's own environment as a chip, not as buttons; the short reason prints once, the full one is the chip's description and the bar's title", () => {
    const { container } = render(<ContextBar env="live" window="90D" onChange={noop} windowLock={null} envLock={{ reason: "The deployment fixes the environment.", short: "Set by the deployment", effective: "paper" }} />);
    expect(screen.queryByRole("button", { name: "Paper" })).toBeNull();
    const chip = container.querySelector<HTMLElement>('[data-control="env"]')!;
    expect(chip.textContent).toBe("Paper");
    expect(chip.dataset.v).toBe("paper");
    expect(chip.getAttribute("aria-label")).toBe("Environment: Paper");
    expect(document.getElementById(chip.getAttribute("aria-describedby") ?? "")?.textContent).toBe("The deployment fixes the environment.");
    expect(screen.getByText("Set by the deployment")).toBeTruthy();
    expect(whyText(document.querySelector('[data-notice="lock"]'))).toBe("The deployment fixes the environment.");
  });

  it.each([
    ["sandbox", "Sandbox"],
    ["live", "Real-funded"],
  ] as const)("envLock.effective=%s shows %s", (effective, name) => {
    const { container } = render(<ContextBar env="paper" window="90D" onChange={noop} windowLock={null} envLock={{ reason: "r", effective }} />);
    expect(container.querySelector('[data-control="env"]')?.textContent).toBe(name);
    expect(container.querySelector('[data-control="env"] button')).toBeNull();
    expect(document.querySelector('[data-notice="lock"]')?.textContent).toBe("r");
  });

  it("an effective value the bar cannot name is ignored, not printed", () => {
    const bad = { reason: "r", effective: "canary" } as unknown as Parameters<typeof ContextBar>[0]["envLock"];
    const { container } = render(<ContextBar env="paper" window="90D" onChange={noop} windowLock={null} envLock={bad} />);
    expect(container.querySelector('[data-control="env"]')).toBeNull();
    expect(container.querySelector(".exec-ctxbar-lock")).toBeNull();
  });

  it("windowLock.effective and envLock.effective can sit together", () => {
    render(<ContextBar env="live" window="90D" onChange={noop} windowLock={{ reason: "w", effective: "Certification run" }} envLock={{ reason: "e", effective: "sandbox" }} />);
    expect(screen.getByText("Window: Certification run")).toBeTruthy();
    expect(document.querySelector('[data-control="env"]')?.textContent).toBe("Sandbox");
  });

  it("D7: names the rejected params, never their values, and dismisses on request", () => {
    const onDismiss = vi.fn();
    render(<ContextBar env="live" window="90D" onChange={noop} invalid={["stage", "env", "window"]} onDismissInvalid={onDismiss} />);
    const notice = screen.getByRole("status");
    expect(notice.textContent).toContain("Ignored invalid URL parameters: stage, env, window");
    expect(notice.textContent).not.toContain("Defaults are shown");
    expect(notice.querySelector("[title]")?.getAttribute("title")).toBe("Defaults are shown");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("D7: one name reads in the singular, a long list is capped, nothing is drawn when empty", () => {
    expect(invalidNotice(["env"])).toBe("Ignored invalid URL parameter: env");
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
    expect(screen.getByText("USDT")).toBeTruthy();
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
    mount("/execution?env=paper", null);
    expect(screen.getByRole("button", { name: "Paper" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "90D" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("starts with the window locked and says so, since no read accepts one yet: no buttons, one line, the reason in the title", () => {
    mount("/execution");
    expect(screen.queryByRole("button", { name: "30D" })).toBeNull();
    const line = document.querySelector('[data-notice="lock"]')!;
    expect(line.textContent).toBe("Not applied: Window");
    expect(whyText(line)).toContain(WINDOW_NOT_SERVED_REASON);
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
    expect(notice.textContent).toContain("Ignored invalid URL parameters: env, window, stage");
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
