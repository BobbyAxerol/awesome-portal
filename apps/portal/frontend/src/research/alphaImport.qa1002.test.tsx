/**
 * Screen 14 — QA 2026-10-02 fixes: no endpoint path in the header (U-text), no stale "waiting" notices after
 * progress (U9), the alpha id is validated and is not a hidden registry filter (U11), raw enum tokens read as words.
 * Server objects are the canonical contract fixtures.
 */
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ALPHA_ID_RULE,
  AlphaImport,
  DRAFT_NOTE,
  MIRROR_CHECK_WORD,
  RULE_PATTERNS,
  RUN_LINK_LABEL,
  awaitingStep,
  type AlphaImportProps,
} from "./AlphaImport";
import type { GatesResponse, RegistryListResponse, SourceResponse } from "./alphaImportClient";
import { researchState } from "./state";

afterEach(cleanup);

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const fixture = <T,>(name: string): T =>
  JSON.parse(readFileSync(join(ROOT, "packages/contracts/fixtures", `research-alpha-import.${name}.valid.json`), "utf8")) as T;
const SOURCE = fixture<SourceResponse>("source");
const GATES = fixture<GatesResponse>("gates");
const REGISTRY = fixture<RegistryListResponse>("registry");
const OK = researchState({ kind: "ok", rowCount: 1 });
const GATES_IDLE = "Gates run once a source parses.";
const REGISTER_IDLE = "Registration opens once all seven gates pass.";

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
    gatesState: awaitingStep(GATES_IDLE),
    registerState: awaitingStep(REGISTER_IDLE),
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
const q = (selector: string) => document.querySelector(selector) as HTMLElement | null;
const text = () => document.body.textContent ?? "";

describe("QA S14 header", () => {
  it("prints no endpoint path", () => {
    render(<AlphaImport {...props()} />);
    expect(q("[data-meta]")).toBeNull();
    expect(text()).not.toMatch(/POST \/api|\/api\/v1\/research\/alphas\/import/);
  });
});

describe("QA S14 U9 notices follow progress", () => {
  it("the gates notice shows before a source parses and is gone after the parse", () => {
    render(<AlphaImport {...props()} />);
    expect(text()).toContain(GATES_IDLE);
    cleanup();
    render(<AlphaImport {...props({ sourceText: "x", parse: SOURCE, parseState: OK })} />);
    expect(text()).not.toContain(GATES_IDLE);
  });

  it("the registration notice is gone once all seven gates passed, and stays while they have not", () => {
    render(<AlphaImport {...props({ sourceText: "x", parse: SOURCE, parseState: OK })} />);
    expect(text()).toContain(REGISTER_IDLE);
    cleanup();
    render(<AlphaImport {...props({ sourceText: "x", parse: SOURCE, parseState: OK, gates: GATES, gatesState: OK })} />);
    expect(GATES.all_pass).toBe(true);
    expect(text()).not.toContain(REGISTER_IDLE);
  });
});

describe("QA S14 U11 alpha id", () => {
  const registered = { sourceText: "x", parse: SOURCE, parseState: OK, gates: GATES, gatesState: OK, registry: REGISTRY.entries } as const;

  it("a malformed id says why, blocks Register and does not filter or rename the registry", () => {
    render(<AlphaImport {...props({ ...registered, alphaId: "Bad_ID" })} />);
    expect(q("[data-alpha-id-invalid]")?.textContent).toBe(ALPHA_ID_RULE);
    expect(q("[data-alpha-id-input]")?.getAttribute("aria-invalid")).toBe("true");
    const register = q('[data-action="register"]') as HTMLButtonElement;
    expect(register.disabled || register.getAttribute("aria-disabled") === "true").toBe(true);
    expect(register.textContent).toBeTruthy();
    expect(text()).toContain(ALPHA_ID_RULE);
    const heading = [...document.querySelectorAll("h2")].find((h) => h.textContent?.startsWith("alpha registry"))!;
    expect(heading.textContent).not.toMatch(/Bad_ID/i);
    expect(q("[data-registry-empty]")).toBeNull();
    expect(document.querySelectorAll("[data-registry-strip] > *").length).toBe(REGISTRY.entries.length);
  });

  it("a valid id has no message", () => {
    render(<AlphaImport {...props({ ...registered, alphaId: "delta-rsi-polynomial" })} />);
    expect(q("[data-alpha-id-invalid]")).toBeNull();
    expect(q("[data-alpha-id-input]")?.getAttribute("aria-invalid")).toBeNull();
  });

  it("the rule sentence is the contract's own pattern", () => {
    expect(RULE_PATTERNS.alphaId).toBe("^[a-z][a-z0-9-]{2,63}$");
    expect(ALPHA_ID_RULE).toMatch(/3.64/);
  });
});

describe("QA S14 words", () => {
  it("raw enum tokens read as words; the contract verdicts stay", () => {
    expect(MIRROR_CHECK_WORD).toEqual({ GATED: "gated", NOT_APPLICABLE: "not applicable" });
    render(<AlphaImport {...props({ sourceText: "x", parse: SOURCE, parseState: OK })} />);
    const verdicts = [...document.querySelectorAll("[data-mirror-verdict]")].map((node) => node.textContent ?? "");
    expect(verdicts.join(" ")).not.toMatch(/NOT_APPLICABLE|GATED/);
    for (const field of SOURCE.mirror) {
      const node = q(`[data-mirror-field="${field.field}"] [data-mirror-verdict]`)!;
      expect(node.getAttribute("data-mirror-verdict")).toBe(field.check);
    }
  });

  it("no av_ jargon in the labels", () => {
    expect(RUN_LINK_LABEL).toBe("new run with this version");
    expect(DRAFT_NOTE).not.toMatch(/rc_/);
    render(<AlphaImport {...props()} />);
    expect(text()).not.toContain("Register av_");
  });
});
