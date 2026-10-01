/**
 * Screen 14 — Batch F2 (served-but-unread fields).
 *
 *  - the registry request carries `alpha_id` (the server filters; the browser does not);
 *  - the registry header reads `total` and says "top N / total" only when the list is capped;
 *  - the e2e journey stubs serve the v4 canonical descriptor;
 *  - the Code anatomy captions stay short.
 */
import { act, cleanup, render, renderHook, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AlphaImport, awaitingStep, type AlphaImportProps } from "./AlphaImport";
import type { RegistryListResponse } from "./alphaImportClient";
import { ANATOMY_SUBSTAGE_NOTE, CODE_ANATOMY, UNLOCK_FOOTER, UNLOCK_MAP } from "./codeAnatomy";
import { researchState } from "./state";
import { useAlphaImport } from "./useAlphaImport";
import { JOURNEY_FIXTURE, journey } from "../../e2e/research-qualification/stubs";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const FIXTURES = join(ROOT, "packages/contracts/fixtures");
const REGISTRY = JSON.parse(readFileSync(join(FIXTURES, "research-alpha-import.registry.valid.json"), "utf8")) as RegistryListResponse;
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
    registry: REGISTRY.entries,
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
    ...overrides,
  };
}

const total = () => document.querySelector("[data-registry-total]");

describe("S14 registry total", () => {
  it("prints 'top N / total' when the server's total exceeds the served list", () => {
    render(<AlphaImport {...props({ registryTotal: 231 })} />);
    expect(total()?.textContent?.replace(/\s+/g, " ").trim()).toBe(`· top ${REGISTRY.entries.length} / 231`);
  });

  it.each([[REGISTRY.entries.length], [null]])("prints nothing when total is %s (not capped / not published)", (value) => {
    render(<AlphaImport {...props({ registryTotal: value })} />);
    expect(total()).toBeNull();
  });
});

describe("S14 registry request", () => {
  function stub() {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        const filtered = url.includes("alpha_id=");
        return {
          ok: true,
          status: 200,
          statusText: "",
          headers: { get: () => null },
          json: async () => ({ ...REGISTRY, total: filtered ? 1 : 231 }),
        } as unknown as Response;
      }),
    );
    return urls;
  }

  it("sends alpha_id once the typed id is whole, and reads the served total", async () => {
    const urls = stub();
    const { result } = renderHook(() => useAlphaImport());
    await waitFor(() => expect(result.current.registryTotal).toBe(231));
    expect(urls[0]).not.toContain("alpha_id");
    await act(async () => result.current.onAlphaIdChange("al")); // not a valid id yet
    await act(async () => result.current.onAlphaIdChange("alpha-demo"));
    await waitFor(() => expect(urls.some((u) => u.includes("alpha_id=alpha-demo"))).toBe(true));
    await waitFor(() => expect(result.current.registryAlpha).toBe("alpha-demo"));
    expect(result.current.registryTotal).toBe(1);
    expect(urls.some((u) => /alpha_id=al(&|$)/.test(u))).toBe(false);
  });

  it("applies the exact-match filter locally only while the typed id is ahead of the served list", () => {
    render(<AlphaImport {...props({ alphaId: "other-alpha", registryAlpha: "" })} />);
    expect(document.querySelectorAll("[data-registry-entry]")).toHaveLength(0);
    cleanup();
    render(<AlphaImport {...props({ alphaId: "alpha-demo", registryAlpha: "alpha-demo" })} />);
    expect(document.querySelectorAll("[data-registry-entry]")).toHaveLength(REGISTRY.entries.length);
  });
});

describe("S14 e2e journey stubs", () => {
  it("serve the v4 canonical descriptor", () => {
    expect(JOURNEY_FIXTURE).toBe("research-foundation.journey-v4");
    const doc = journey();
    expect(doc.descriptor.revision).toBe(4);
    const cards = doc.descriptor.phases.flatMap((phase) => phase.cards);
    const legacy = cards.find((card) => card.target_key === "alpha_version_legacy");
    expect(legacy?.requires_alpha).toBe(true);
    expect(cards.every((card) => typeof card.requires_run === "boolean")).toBe(true);
    expect(JSON.parse(readFileSync(join(FIXTURES, "research-foundation.journey-v4.valid.json"), "utf8"))).toEqual(doc);
  });

  it("e2e/fixtures.ts reads the v4 file, not v3", () => {
    const source = readFileSync(join(__dirname, "..", "..", "e2e", "fixtures.ts"), "utf8");
    expect(source).toContain("research-foundation.journey-v4.valid.json");
    expect(source).not.toContain("journey-v3");
  });
});

describe("S14 Code anatomy captions", () => {
  const words = (text: string) => text.trim().split(/\s+/).length;
  it("every explanatory caption is at most 8 words", () => {
    const captions = [...CODE_ANATOMY.map((s) => s.note), ...UNLOCK_MAP.map((r) => r.routes), UNLOCK_FOOTER, ANATOMY_SUBSTAGE_NOTE];
    for (const caption of captions) expect(words(caption), caption).toBeLessThanOrEqual(8);
  });
});
