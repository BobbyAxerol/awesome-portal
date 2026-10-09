/**
 * §55 · Screen 09 for a natively searched run — from the published canonical fixture. The claims: the block states what kind of native run
 * it is; fees and funding are the full child tape; the optimization / frozen selection / population are shown for an optimized run and
 * said to be absent (never zero) for a fixed one; an older sealed core without `kind` or `execution` keeps typed missing facts; the three
 * windows print the engine's analysis exactly and an unexecuted Holdout stays a typed absence with its reason; the population points to S06.
 */
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { NativeReportBlock, type NativeReportData } from "./NativeReportBlock";

afterEach(cleanup);

const RAW = JSON.parse(readFileSync(join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures", "research-native-report.valid.json"), "utf8")) as Record<string, unknown>;
const FOUND = (RAW.native_report ?? (RAW.frozen_core as { native_report?: unknown } | undefined)?.native_report ?? RAW) as NativeReportData;
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const show = (native: NativeReportData) => render(<MemoryRouter><NativeReportBlock native={native} searchHref="/research/quantbt/runs/rrun_x/search" /></MemoryRouter>);

describe("the native report block", () => {
  it("names the kind and prints the engine's execution facts; costs say they are the full child tape", () => {
    const { container } = show(FOUND);
    const native = container.querySelector("[data-panel='native-report']")!;
    expect(native.getAttribute("data-native-kind")).toBe(FOUND.kind ?? "unspecified");
    expect(container.querySelector("[data-native-kind-line]")!.textContent).toMatch(/^Native · (optimized|fixed)/);
    expect(container.querySelector('[data-native-report-fact="fees"] th')!.textContent).toContain("full child tape");
    expect(container.querySelector('[data-native-report-fact="funding"] th')!.textContent).toContain("full child tape");
    if (FOUND.execution?.fees.total) expect(container.querySelector('[data-native-report-fact="fees"] [data-exact]')!.getAttribute("data-exact")).toBe(FOUND.execution.fees.total);
  });

  it("an optimized report shows the optimization, the frozen selection and the population, with the trial number and the ordinal apart", () => {
    const native = copy(FOUND);
    if (native.kind !== "NATIVE_OPTIMIZED") return;
    const { container } = show(native);
    expect(container.querySelector("[data-native-optimization-block]")).not.toBeNull();
    const selected = container.querySelector('[data-native-report-fact="selected"] td')!.textContent!;
    expect(selected).toContain(`trial ${native.optimization!.selected_trial_number}`);
    const frozen = container.querySelector('[data-native-freeze-block] [data-native-report-fact="trial"] td')!.textContent!;
    expect(frozen).toContain(`number ${native.freeze!.selected_trial_number} · ordinal ${native.freeze!.selected_trial_ordinal}`);
    expect(container.querySelector("[data-prep-state]")!.textContent).toBe("match at preparation");
    expect(container.querySelector("[data-current-bytes-rechecked]")!.getAttribute("data-current-bytes-rechecked")).toBe("false");
    expect(container.querySelector('[data-native-freeze-block] [data-native-report-fact="certificate"]')!.textContent).toMatch(/n\/a/i);
    expect(container.querySelector("[data-native-population]")!.getAttribute("data-native-population")).toBe(String(native.population!.total));
    expect(container.querySelector("[data-action='open-native-search']")!.getAttribute("href")).toBe("/research/quantbt/runs/rrun_x/search");
  });

  it("a fixed report ran no optimizer: it says so, and draws no optimization, freeze or population (never zero)", () => {
    const native = copy(FOUND);
    native.kind = "NATIVE_FIXED";
    native.optimization = null;
    native.freeze = null;
    native.population = null;
    if (native.execution) delete native.execution.optimization;
    const { container } = show(native);
    expect(container.querySelector("[data-native-no-optimizer]")).not.toBeNull();
    expect(container.querySelector("[data-native-optimization-block], [data-native-freeze-block], [data-native-population]")).toBeNull();
  });

  it("an older sealed core without kind or execution keeps typed missing facts instead of guessing", () => {
    const native = copy(FOUND);
    delete (native as { kind?: unknown }).kind;
    delete (native as { execution?: unknown }).execution;
    const { container } = show(native);
    expect(container.querySelector("[data-native-kind-line]")!.textContent).toContain("kind not recorded");
    expect(container.querySelector("[data-native-execution-absent]")).not.toBeNull();
  });

  it("prints each window's analysis exactly and keeps an unexecuted window a typed absence with its reason", () => {
    const { container } = show(FOUND);
    for (const window of FOUND.windows) {
      const state = container.querySelector(`[data-window-state="${window.window}"]`)!;
      if (window.analysis) {
        expect(state.textContent).toContain(`${window.analysis.observation_count.toLocaleString("en-US")} observations`);
        const sharpe = container.querySelector(`[data-window-metric="sharpe"] td:nth-of-type(${FOUND.windows.indexOf(window) + 1}) [data-exact]`);
        expect(sharpe?.getAttribute("data-exact")).toBe(window.analysis.metrics.sharpe.value);
      } else {
        expect(state.querySelector("[data-window-absent]")!.getAttribute("data-reason-code")).toBe(window.availability.reason_code);
      }
    }
    expect(container.querySelector("[data-native-windows-note]")!.textContent).toContain("not a Portal P&L");
  });
});
