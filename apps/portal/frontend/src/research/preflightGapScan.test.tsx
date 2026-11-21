/**
 * A2b-PF (CG-P08-06 FE) — the per-window gap scan never prints `0` for a count
 * the server did not publish. A window that "misses 0 bars" and a window whose
 * missing-bar count is unknown are different facts; the table used to show
 * both as `0`, and never showed `expected_bars` at all.
 *
 * The body is the canonical preflight fixture; windows are altered from it.
 */
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { PreflightPanel } from "./PreflightPanel";
import type { PreflightResponse } from "./preflightClient";
import { researchState } from "./state";

afterEach(cleanup);

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "..", "..", "..", "packages/contracts/fixtures/research-preflight.response.valid.json"), "utf8"),
) as PreflightResponse;
const OK = researchState({ kind: "ok", rowCount: 1 });

type Window = NonNullable<NonNullable<PreflightResponse["snapshot"]["gap_scan"]>["windows"]>[number];

function withWindow(change: Partial<Window>): PreflightResponse {
  const copy = structuredClone(FIXTURE);
  const scan = copy.snapshot.gap_scan!;
  const index = scan.windows.findIndex((window) => window.window === "IS");
  scan.windows[index] = { ...scan.windows[index]!, ...change };
  return copy;
}

const row = () => document.querySelector('[data-gap-window="IS"]') as HTMLElement;
const cells = () => [...row().querySelectorAll("td")].map((cell) => cell.textContent?.trim());

describe("A2b-PF — gap scan counts", () => {
  it("the canonical scan shows served counts, including a real 0, and expected_bars", () => {
    render(<PreflightPanel preflight={FIXTURE} state={OK} />);
    const is = FIXTURE.snapshot.gap_scan!.windows.find((window) => window.window === "IS")!;
    expect(is.missing_bars).toBe(0);
    expect(row().querySelector('[data-gap-count="missing_bars"]')?.textContent).toBe("0");
    expect(row().querySelector('[data-gap-count="expected_bars"]')?.textContent).toBe(String(is.expected_bars));
    expect(row().querySelector('[data-gap-count="bars"]')?.textContent).toBe(String(is.bars));
    expect(row().querySelector("[data-gap-absent]")).toBeNull();
    expect(document.querySelector("[data-gap-scan] thead")?.textContent).toContain("expected");
  });

  it("null counts are typed absences, never 0", () => {
    render(<PreflightPanel preflight={withWindow({ bars: null, expected_bars: null, missing_bars: null, gap_runs: null })} state={OK} />);
    for (const field of ["bars", "expected_bars", "missing_bars", "gap_runs"]) {
      expect(row().querySelector(`[data-gap-absent="${field}"]`)?.textContent).toBe("not published");
      expect(row().querySelector(`[data-gap-count="${field}"]`)).toBeNull();
    }
    /* No numeric cell of this window reads 0. */
    expect(cells().filter((text) => text === "0")).toEqual([]);
  });

  it("fields absent from the body (undefined) read the same as null", () => {
    const copy = structuredClone(FIXTURE);
    const scan = copy.snapshot.gap_scan!;
    const index = scan.windows.findIndex((window) => window.window === "IS");
    const bare = { ...scan.windows[index]! } as Record<string, unknown>;
    delete bare.bars;
    delete bare.missing_bars;
    delete bare.gap_runs;
    delete bare.expected_bars;
    scan.windows[index] = bare as unknown as Window;
    render(<PreflightPanel preflight={copy} state={OK} />);
    expect(row().querySelectorAll("[data-gap-absent]")).toHaveLength(4);
    expect(cells().filter((text) => text === "0")).toEqual([]);
  });

  it("only the unpublished count is absent; its neighbours keep their served numbers", () => {
    render(<PreflightPanel preflight={withWindow({ missing_bars: null })} state={OK} />);
    expect(row().querySelector('[data-gap-absent="missing_bars"]')).not.toBeNull();
    expect(row().querySelector('[data-gap-count="bars"]')).not.toBeNull();
    expect(row().querySelector('[data-gap-count="gap_runs"]')?.textContent).toBe("0");
  });

  it("a scanned window with no verdict says so instead of leaving the cell empty", () => {
    render(<PreflightPanel preflight={withWindow({ verdict: null })} state={OK} />);
    expect(row().querySelector('[data-gap-absent="verdict"]')?.textContent).toBe("verdict not published");
  });

  it("the sealed holdout row still spans the table with its own note", () => {
    render(<PreflightPanel preflight={FIXTURE} state={OK} />);
    const holdout = document.querySelector('[data-gap-window="holdout"]') as HTMLElement;
    expect(holdout.querySelector("td[colspan]")?.getAttribute("colspan")).toBe("5");
    expect(holdout.textContent).toContain("content unread");
  });
});
