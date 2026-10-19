import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DockAction, Drawer, useDockMode, useDockSelection, type DockMode } from "./Drawer";

afterEach(cleanup);

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

function Screen({ mode = "dock" }: { mode?: DockMode }) {
  const { selection, select, close } = useDockSelection();
  return (
    <>
      <button type="button" onClick={() => select("dep_1")}>Open row</button>
      <button type="button">Elsewhere</button>
      <Drawer
        open={selection !== null}
        onClose={close}
        title={`Deployment ${selection}`}
        subtitle="Peek"
        mode={mode}
        actions={<DockAction label="Recall" reason="Your role does not include this." accessHref="/profile/access" />}
      >
        <a href="/inside">Inside link</a>
      </Drawer>
      <Where />
    </>
  );
}

const mount = (entry = "/fleet", mode: DockMode = "dock") =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Screen mode={mode} />
    </MemoryRouter>,
  );

describe("sel opens and closes the drawer", () => {
  it("is closed without sel and opens when the URL carries it", () => {
    mount("/fleet?sel=dep_9");
    expect(screen.getByRole("complementary", { name: "Deployment dep_9" })).toBeTruthy();
    cleanup();
    mount("/fleet");
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("writes sel on open and removes only sel on close", () => {
    mount("/fleet?env=paper&q=btc");
    fireEvent.click(screen.getByText("Open row"));
    expect(screen.getByTestId("where").textContent).toBe("/fleet?env=paper&q=btc&sel=dep_1");
    fireEvent.click(screen.getByText("Close"));
    expect(screen.getByTestId("where").textContent).toBe("/fleet?env=paper&q=btc");
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("an invalid sel reads as closed", () => {
    mount(`/fleet?sel=${"x".repeat(300)}`);
    expect(screen.queryByRole("complementary")).toBeNull();
  });
});

describe("focus and Esc", () => {
  it("moves focus into the panel, Esc closes it, focus returns to the opener", () => {
    mount();
    const opener = screen.getByText("Open row");
    opener.focus();
    fireEvent.click(opener);
    const panel = screen.getByRole("complementary");
    expect(document.activeElement).toBe(panel);

    fireEvent.keyDown(panel, { key: "Escape" });
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.getByTestId("where").textContent).toBe("/fleet");
    expect(document.activeElement).toBe(opener);
  });

  it("Esc closes when focus is still outside the panel", () => {
    mount("/fleet?sel=dep_1");
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("does not steal focus the user moved elsewhere", () => {
    mount();
    const opener = screen.getByText("Open row");
    opener.focus();
    fireEvent.click(opener);
    const other = screen.getByText("Elsewhere");
    other.focus();
    fireEvent.click(screen.getByText("Close"));
    expect(document.activeElement).toBe(other);
  });

  it("an Esc another widget handled does not close it", () => {
    mount("/fleet?sel=dep_1");
    const swallow = (event: KeyboardEvent) => event.preventDefault();
    document.body.addEventListener("keydown", swallow);
    fireEvent.keyDown(document.body, { key: "Escape" });
    document.body.removeEventListener("keydown", swallow);
    expect(screen.getByRole("complementary")).toBeTruthy();
  });
});

describe("overlay mode", () => {
  it("is a modal dialog with a scrim that closes it", () => {
    const { container } = mount("/fleet?sel=dep_1", "overlay");
    const dialog = screen.getByRole("dialog", { name: "Deployment dep_1" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("data-mode")).toBe("overlay");
    expect(screen.queryByRole("complementary")).toBeNull();
    fireEvent.click(container.querySelector(".exec-dock-scrim")!);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps Tab inside the dialog", () => {
    mount("/fleet?sel=dep_1", "overlay");
    const dialog = screen.getByRole("dialog");
    const close = screen.getByText("Close");
    const inside = screen.getByText("Inside link");
    // Disabled Recall is skipped, the access link is the last stop.
    const access = screen.getByText("My access");
    access.focus();
    fireEvent.keyDown(access, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(access);
    expect(dialog.contains(inside)).toBe(true);
  });

  it("docked mode has no scrim and no aria-modal", () => {
    const { container } = mount("/fleet?sel=dep_1");
    expect(container.querySelector(".exec-dock-scrim")).toBeNull();
    expect(screen.getByRole("complementary").getAttribute("aria-modal")).toBeNull();
  });
});

describe("useDockMode", () => {
  function Probe() {
    return <output data-testid="mode">{useDockMode()}</output>;
  }

  it("is dock where matchMedia does not exist", () => {
    render(<Probe />);
    expect(screen.getByTestId("mode").textContent).toBe("dock");
  });

  it("follows the 1500px query and its changes", () => {
    let listener: () => void = () => {};
    const list = {
      matches: true,
      addEventListener: (_: string, fn: () => void) => { listener = fn; },
      removeEventListener: vi.fn(),
    };
    const original = window.matchMedia;
    window.matchMedia = vi.fn(() => list) as unknown as typeof window.matchMedia;
    try {
      render(<Probe />);
      expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 1500px)");
      expect(screen.getByTestId("mode").textContent).toBe("overlay");
      list.matches = false;
      act(() => listener());
      expect(screen.getByTestId("mode").textContent).toBe("dock");
    } finally {
      window.matchMedia = original;
    }
  });
});

describe("DockAction", () => {
  const wrap = (node: ReactNode) => render(<MemoryRouter initialEntries={["/x?env=paper&q=a"]}>{node}</MemoryRouter>);

  it("disables with a reason wired by aria-describedby", () => {
    wrap(<DockAction label="Recall" reason="Open obligations: recall pending." />);
    const button = screen.getByRole("button", { name: "Recall" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const reason = document.getElementById(button.getAttribute("aria-describedby")!);
    expect(reason?.textContent).toBe("Open obligations: recall pending.");
    expect(button.getAttribute("aria-describedby")).toBeTruthy();
  });

  it("links My access with the URL context carried over", () => {
    wrap(<DockAction label="Recall" reason="Your role does not include this." accessHref="/profile/access" />);
    const link = screen.getByRole("link", { name: "My access: Recall" });
    expect(link.getAttribute("href")).toBe("/profile/access?env=paper");
  });

  it("takes a custom link label and has no link without an href", () => {
    wrap(<DockAction label="A" reason="r" accessHref="/p" accessLabel="Why" />);
    expect(screen.getByRole("link", { name: "Why: A" })).toBeTruthy();
    cleanup();
    wrap(<DockAction label="A" reason="r" />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("is live, without reason or link, when it has a handler and no reason", () => {
    const onAction = vi.fn();
    wrap(<DockAction label="Open" onAction={onAction} accessHref="/p" />);
    const button = screen.getByRole("button", { name: "Open" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-describedby")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    fireEvent.click(button);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("fails closed: a reason wins over a handler, and no handler means disabled with a reason", () => {
    const onAction = vi.fn();
    wrap(
      <>
        <DockAction label="Blocked" onAction={onAction} reason="Step-up required." />
        <DockAction label="Orphan" />
        <DockAction label="Blank reason" reason="   " />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Blocked" }));
    expect(onAction).not.toHaveBeenCalled();
    for (const name of ["Orphan", "Blank reason"]) {
      const button = screen.getByRole("button", { name }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      expect(document.getElementById(button.getAttribute("aria-describedby")!)?.textContent).toBe("Not offered in the portal yet.");
    }
  });

  it("every disabled action in the drawer footer has a described reason", () => {
    mount("/fleet?sel=dep_1");
    const footer = screen.getByRole("complementary").querySelector(".exec-dock-actions")!;
    for (const button of footer.querySelectorAll("button:disabled")) {
      expect(document.getElementById(button.getAttribute("aria-describedby")!)).toBeTruthy();
    }
  });
});

describe("priority slot and footer", () => {
  it("draws the priority block before the children, and nothing when it is absent", () => {
    const { container } = render(
      <MemoryRouter>
        <Drawer onClose={() => {}} title="Incident" priority={<p>Not published (FE-031)</p>}>
          <p>Facts table</p>
        </Drawer>
      </MemoryRouter>,
    );
    const body = container.querySelector(".exec-dock-body")!;
    expect(body.firstElementChild?.className).toBe("exec-dock-priority");
    expect(body.firstElementChild?.textContent).toBe("Not published (FE-031)");
    expect(body.children[1]?.textContent).toBe("Facts table");
    cleanup();
    const bare = render(
      <MemoryRouter>
        <Drawer onClose={() => {}} title="Incident">
          <p>Facts table</p>
        </Drawer>
      </MemoryRouter>,
    );
    expect(bare.container.querySelector(".exec-dock-priority")).toBeNull();
  });

  it("a blocked action keeps its full reason in the DOM (title and description) with one line per action", () => {
    const { container } = render(
      <MemoryRouter>
        <Drawer
          onClose={() => {}}
          title="Incident"
          actions={
            <>
              <DockAction label="Acknowledge" reason="Not published (FE-015). Acknowledging is an ADMIN-only write." />
              <DockAction label="Assign to me" reason="Not published (FE-020). Nobody to assign." />
            </>
          }
        >
          <p>Body</p>
        </Drawer>
      </MemoryRouter>,
    );
    const lines = container.querySelectorAll(".exec-dock-why");
    expect(lines).toHaveLength(2);
    expect(lines[0].getAttribute("data-l")).toBe("Acknowledge");
    const p = lines[0].querySelector("p")!;
    expect(p.getAttribute("title")).toBe(p.textContent);
    expect(screen.getAllByText("Acknowledge")).toHaveLength(1);
  });
});

describe("focusOnOpen and the close fallback", () => {
  function Row({ focusOnOpen, withTable = true }: { focusOnOpen?: boolean; withTable?: boolean }) {
    const { selection, close } = useDockSelection();
    return (
      <>
        <main aria-label="Page">
          {withTable ? (
            <table aria-label="Rows">
              <tbody>
                <tr tabIndex={0} data-testid="first-row"><td>one</td></tr>
                <tr tabIndex={0}><td>two</td></tr>
              </tbody>
            </table>
          ) : null}
        </main>
        <Drawer open={selection !== null} onClose={close} title="Peek" focusOnOpen={focusOnOpen}>
          <p>Body</p>
        </Drawer>
      </>
    );
  }
  const mountRow = (props: { focusOnOpen?: boolean; withTable?: boolean }) =>
    render(
      <MemoryRouter initialEntries={["/fleet?sel=a"]}>
        <Row {...props} />
      </MemoryRouter>,
    );

  it("focuses the panel by default and leaves focus alone with focusOnOpen={false}", () => {
    mountRow({});
    expect(document.activeElement).toBe(screen.getByRole("complementary"));
    cleanup();
    (document.activeElement as HTMLElement | null)?.blur();
    mountRow({ focusOnOpen: false });
    expect(screen.getByRole("complementary")).toBeTruthy();
    expect(document.activeElement).toBe(document.body);
  });

  it("closing a panel nobody opened from a control lands on the first table row, never on nothing", () => {
    mountRow({ focusOnOpen: false });
    fireEvent.click(screen.getByText("Close"));
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId("first-row"));
  });

  it("with no table it lands on the main landmark", () => {
    mountRow({ focusOnOpen: false, withTable: false });
    fireEvent.click(screen.getByText("Close"));
    expect(document.activeElement).toBe(screen.getByRole("main"));
  });

  it("a real opener still gets focus back, not the fallback", () => {
    render(
      <MemoryRouter initialEntries={["/fleet"]}>
        <Screen />
        <table><tbody><tr tabIndex={0} data-testid="row"><td>x</td></tr></tbody></table>
      </MemoryRouter>,
    );
    const opener = screen.getByText("Open row");
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByText("Close"));
    expect(document.activeElement).toBe(opener);
  });
});
