import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { AccountsBindings } from "./screens/AccountsBindings";
import { AlphaFleet } from "./screens/AlphaFleet";
import { BindingDetail } from "./screens/BindingDetail";
import { LiveOverview } from "./screens/LiveOverview";
import { PaperOverview } from "./screens/PaperOverview";
import { SandboxOverview } from "./screens/SandboxOverview";

afterEach(cleanup);

function mount(node: ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe("product screens preserve the reviewed composition when a source is unavailable", () => {
  const cases = [
    ["paper-overview", <PaperOverview status="unavailable" reason="paper source down" />],
    ["sandbox-overview", <SandboxOverview status="unavailable" reason="sandbox source down" />],
    ["live-overview", <LiveOverview status="unavailable" reason="live source down" />],
    ["alpha-fleet", <AlphaFleet status="unavailable" reason="fleet source down" />],
    ["accounts-bindings", <AccountsBindings status="unavailable" reason="bindings source down" />],
    ["binding-detail", <BindingDetail bindingId="binding-7" status="unavailable" reason="binding source down" />],
  ] as const;

  for (const [marker, node] of cases) {
    it(`keeps ${marker} and places source state inside it`, () => {
      const { container } = mount(node);
      expect(container.querySelector(`[data-hifi-exact="${marker}"]`)).not.toBeNull();
      expect(container.querySelector('.exec-state[data-status="unavailable"]')).not.toBeNull();
    });
  }

  it("keeps the binding identity visible while its source detail is unavailable", () => {
    mount(<BindingDetail bindingId="binding-7" status="unavailable" reason="binding source down" />);
    expect(screen.getByRole("heading", { name: /binding-7/ })).toBeTruthy();
    expect(screen.getByText("binding source down")).toBeTruthy();
  });
});
