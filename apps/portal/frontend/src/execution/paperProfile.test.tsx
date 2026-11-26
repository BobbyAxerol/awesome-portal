import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PaperProfileBar, isPaperScreenPath, parsePaperProfile, readProfilesOf, withPaperProfile } from "./paperProfile";
import { withContext } from "./v2/urlState";

const BOTH = ["PAPER_BINANCE_USDM", "PAPER_OKX_SWAP"] as const;

function Where() {
  const location = useLocation();
  return <output data-testid="where">{location.pathname}{location.search}</output>;
}
function mount(initial: string, props: Parameters<typeof PaperProfileBar>[0]) {
  return render(<MemoryRouter initialEntries={[initial]}><PaperProfileBar {...props} /><Where /></MemoryRouter>);
}
afterEach(() => vi.unstubAllGlobals());

describe("paper profile selection: pure helpers", () => {
  it("accepts only the two Paper profiles", () => {
    expect(parsePaperProfile("PAPER_OKX_SWAP")).toBe("PAPER_OKX_SWAP");
    expect(parsePaperProfile("PAPER_DNSE_VNM")).toBeNull();
    expect(parsePaperProfile("")).toBeNull();
    expect(parsePaperProfile(null)).toBeNull();
    expect(readProfilesOf(["PAPER_BINANCE_USDM", "x", 3, "PAPER_OKX_SWAP"])).toEqual(BOTH);
    expect(readProfilesOf(undefined)).toEqual([]);
  });

  it("leaves a default read path byte-identical and adds profile_id otherwise", () => {
    expect(withPaperProfile("/screens/paper", null)).toBe("/screens/paper");
    expect(withPaperProfile("/screens/paper", "PAPER_OKX_SWAP")).toBe("/screens/paper?profile_id=PAPER_OKX_SWAP");
    expect(withPaperProfile("/screens/blotter?limit=50", "PAPER_OKX_SWAP")).toBe("/screens/blotter?limit=50&profile_id=PAPER_OKX_SWAP");
  });

  it("knows which routes are Paper screens", () => {
    for (const path of ["/deployments/paper", "/deployments/paper/dep_1", "/deployments/paper/dep_1/vn-market", "/deployments/blotter"]) expect(isPaperScreenPath(path)).toBe(true);
    for (const path of ["/deployments/sandbox", "/deployments/papers", "/fleet"]) expect(isPaperScreenPath(path)).toBe(false);
  });

  it("carries the selection only between Paper screens", () => {
    const current = "?paper_profile=PAPER_OKX_SWAP&env=paper";
    expect(withContext("/deployments/paper/dep_1", current)).toContain("paper_profile=PAPER_OKX_SWAP");
    expect(withContext("/deployments/blotter?deployment=dep_1", current)).toContain("paper_profile=PAPER_OKX_SWAP");
    expect(withContext("/deployments/sandbox/dep_2", current)).not.toContain("paper_profile");
    expect(withContext("/deployments/paper/dep_1", "?paper_profile=PAPER_DNSE_VNM")).not.toContain("paper_profile");
  });
});

describe("PaperProfileBar", () => {
  it("renders no selector when only one profile is allowed, but still names the profile shown", () => {
    mount("/deployments/paper", { delivered: "PAPER_BINANCE_USDM", allowed: ["PAPER_BINANCE_USDM"] });
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByTestId("paper-profile-shown").textContent).toBe("Paper Binance USDM");
  });

  it("renders a selector for two allowed profiles, default first and selected when no param is set", () => {
    mount("/deployments/paper", { delivered: "PAPER_BINANCE_USDM", allowed: BOTH });
    const select = screen.getByRole("combobox", { name: "Paper profile" }) as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual([...BOTH]);
    expect(select.value).toBe("PAPER_BINANCE_USDM");
  });

  it("keeps the selection in the URL param, drops it for the default, and keeps other params", () => {
    mount("/deployments/blotter?filter=OPEN&after=abc", { delivered: "PAPER_BINANCE_USDM", allowed: BOTH });
    const select = screen.getByRole("combobox", { name: "Paper profile" });
    fireEvent.change(select, { target: { value: "PAPER_OKX_SWAP" } });
    expect(screen.getByTestId("where").textContent).toBe("/deployments/blotter?filter=OPEN&paper_profile=PAPER_OKX_SWAP");
    fireEvent.change(select, { target: { value: "PAPER_BINANCE_USDM" } });
    expect(screen.getByTestId("where").textContent).toBe("/deployments/blotter?filter=OPEN");
  });

  it("labels the profile the body describes, not the one asked for, while the other read is pending", () => {
    mount("/deployments/paper?paper_profile=PAPER_OKX_SWAP", { delivered: "PAPER_BINANCE_USDM", allowed: BOTH });
    expect(screen.getByTestId("paper-profile-shown").textContent).toBe("Paper Binance USDM");
    expect(screen.getByTestId("paper-profile-pending").textContent).toContain("Paper OKX Swap");
  });

  it("says the per-profile panels are hidden while a non-default profile is selected, and keeps the selector after a failed read", () => {
    mount("/deployments/paper?paper_profile=PAPER_OKX_SWAP", { delivered: "PAPER_OKX_SWAP", allowed: BOTH });
    expect(screen.getByTestId("paper-profile-bar").textContent).toContain("not available per profile");
    // A later read that failed publishes no list: the last one stays so the reader can switch back.
    mount("/deployments/paper?paper_profile=PAPER_OKX_SWAP", { delivered: null, allowed: [] });
    expect(screen.getAllByRole("combobox", { name: "Paper profile" }).length).toBe(2);
  });
});
