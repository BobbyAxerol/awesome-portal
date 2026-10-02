/**
 * Screen 14 — Batch F3 (HiFi parity).
 *
 *  - a gate that carries `quarantine_code` prints it (mono, with the gate's own sentence);
 *  - analyser time prints in its own unit (`214 µs`), not `0.214 ms`;
 *  - a failed registry read has a retry button that reads again;
 *  - an answered-but-empty registry shows the screen's own sentence (it was swallowed by the panel notice);
 *  - every registry row links to its lineage (already in F2b, pinned here).
 */
import { act, cleanup, fireEvent, render, renderHook, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AlphaImport, awaitingStep, gateTiming, type AlphaImportProps } from "./AlphaImport";
import { alphaImportApi, type GatesResponse, type RegistryListResponse } from "./alphaImportClient";
import { researchState } from "./state";
import { useAlphaImport } from "./useAlphaImport";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const fixture = <T,>(name: string): T =>
  JSON.parse(readFileSync(join(ROOT, "packages/contracts/fixtures", `research-alpha-import.${name}.valid.json`), "utf8")) as T;
const GATES = fixture<GatesResponse>("gates");
const REGISTRY = fixture<RegistryListResponse>("registry");
const OK = researchState({ kind: "ok", rowCount: 1 });

function props(overrides: Partial<AlphaImportProps> = {}): AlphaImportProps {
  return {
    sourceText: "",
    fileName: null,
    onSourceChange: vi.fn(),
    onMultiFileRejected: vi.fn(),
    parse: null,
    gates: null,
    registration: null,
    activation: null,
    registry: [],
    parseState: awaitingStep("No source has been parsed yet."),
    gatesState: awaitingStep("Gates run once a source parses."),
    registerState: awaitingStep("Registration opens once all seven gates pass."),
    registryState: OK,
    refusal: null,
    alphaId: "",
    onAlphaIdChange: vi.fn(),
    onParse: vi.fn(),
    onRunGates: vi.fn(),
    onRegister: vi.fn(),
    onActivate: vi.fn(),
    activationAdmitted: false,
    reducedMotion: true,
    ...overrides,
  } as AlphaImportProps;
}
const mount = (p: AlphaImportProps) => render(<MemoryRouter><AlphaImport {...p} /></MemoryRouter>);
const q = (selector: string) => document.querySelector(selector) as HTMLElement | null;

describe("F3 — S14 gates", () => {
  it("prints the server's quarantine_code on the gate that carries it, and only there", async () => {
    const failed = {
      ...GATES,
      gates: GATES.gates.map((gate, index) =>
        index === 0 ? { ...gate, state: "FAIL" as const, quarantine_code: "QUARANTINED_CONTRACT" as const } : { ...gate, quarantine_code: undefined },
      ),
    };
    mount(props({ gates: failed, gatesState: OK }));
    await waitFor(() => expect(document.querySelectorAll("[data-gate]")).toHaveLength(GATES.gates.length), { timeout: 4000 });
    const codes = document.querySelectorAll("[data-gate-quarantine-code]");
    expect(codes).toHaveLength(1);
    expect(codes[0].textContent).toContain("QUARANTINED_CONTRACT");
  });

  it("analyser time keeps its own unit", () => {
    const base = { n: 1, name: "contract-complete" as const, state: "PASS" as const, message: "ok", ms: 0 };
    expect(gateTiming({ ...base, timing_source: "ANALYSER", analyser_us: 214 })).toBe("214 µs · analyser");
    expect(gateTiming({ ...base, timing_source: "ANALYSER", analyser_us: 1500 })).toBe("1.5 ms · analyser");
  });
});

describe("F3 — S14 registry", () => {
  it("a failed read shows a retry button that calls the retry handler", () => {
    const onRetryRegistry = vi.fn();
    mount(
      props({
        registryState: { state: "failed-retryable", reason: "A dependency did not respond.", mayRetry: true, retainsContent: false },
        onRetryRegistry,
      }),
    );
    const retry = q('[data-action="retry-registry"]');
    expect(retry).toBeTruthy();
    fireEvent.click(retry!);
    expect(onRetryRegistry).toHaveBeenCalledTimes(1);
  });

  it("no retry button while the registry reads fine", () => {
    mount(props({ registry: REGISTRY.entries, onRetryRegistry: vi.fn() }));
    expect(q('[data-action="retry-registry"]')).toBeNull();
  });

  it("an empty answered registry prints the screen's sentence", () => {
    mount(props({ registry: [], registryState: researchState({ kind: "ok", rowCount: 0 }) }));
    expect(q("[data-registry-empty]")?.textContent).toBe("No versions yet.");
  });

  it("an empty answer for a typed alpha says so for that alpha", () => {
    mount(props({ registry: [], alphaId: "momentum-btc", registryState: researchState({ kind: "ok", rowCount: 0 }) }));
    expect(q("[data-registry-empty]")?.textContent).toBe("No versions for this alpha.");
  });

  it("every registry chip links to its lineage", () => {
    mount(props({ registry: REGISTRY.entries }));
    for (const entry of REGISTRY.entries) {
      const chip = q(`[data-registry-entry="${entry.alpha_version_id}"]`);
      expect(chip?.querySelector('[data-action="registry-lineage"]')?.getAttribute("href")).toContain(`/alphas/${encodeURIComponent(entry.alpha_id)}/lineage`);
    }
  });

  it("the controller's retry goes back to loading and reads the registry again", async () => {
    const spy = vi.spyOn(alphaImportApi, "registry");
    spy.mockRejectedValueOnce(Object.assign(new Error("down"), { status: 503 }));
    spy.mockResolvedValue(REGISTRY);
    const { result } = renderHook(() => useAlphaImport());
    await waitFor(() => expect(result.current.registryState.state).not.toBe("loading"));
    expect(result.current.registryState.state).not.toBe("available");
    await act(async () => result.current.onRetryRegistry());
    await waitFor(() => expect(result.current.registry.length).toBe(REGISTRY.entries.length));
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
