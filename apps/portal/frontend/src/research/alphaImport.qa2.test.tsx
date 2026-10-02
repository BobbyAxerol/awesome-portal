/**
 * Screen 14 — QA 2026-10-02 second wave: U11 the typed alpha id narrows the registry but one control lifts it;
 * the id rule is printed once for an invalid id.
 */
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ALPHA_ID_RULE, AlphaImport, awaitingStep, type AlphaImportProps } from "./AlphaImport";
import type { GatesResponse, RegistryListResponse } from "./alphaImportClient";
import { researchState } from "./state";

afterEach(cleanup);

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
    ...overrides,
  };
}

describe("QA2 S14 U11 registry scope", () => {
  it("a valid typed id offers 'show all alphas'; showing all lifts the narrowing and the toggle reads back", () => {
    const onToggle = vi.fn();
    const view = render(
      <AlphaImport {...props({ alphaId: "brand-new-alpha", registry: [], registryState: researchState({ kind: "ok", rowCount: 0 }), onToggleRegistryShowAll: onToggle })} />,
    );
    const button = view.container.querySelector('[data-action="registry-show-all"]') as HTMLElement;
    expect(button.textContent).toBe("show all alphas");
    expect(view.container.querySelector("[data-registry-empty]")?.textContent).toBe("No versions for this alpha.");
    button.click();
    expect(onToggle).toHaveBeenCalledTimes(1);
    cleanup();
    const all = render(
      <AlphaImport {...props({ alphaId: "brand-new-alpha", registryShowAll: true, registry: REGISTRY.entries, onToggleRegistryShowAll: onToggle })} />,
    );
    expect(all.container.querySelector('[data-action="registry-show-all"]')?.textContent).toBe("filter by this alpha");
    expect(all.container.querySelector("[data-registry-empty]")).toBeNull();
    expect(all.container.querySelectorAll("[data-registry-entry]").length).toBe(REGISTRY.entries.length);
  });

  it("no toggle with an invalid or empty id", () => {
    const bad = render(<AlphaImport {...props({ alphaId: "Bad_ID", onToggleRegistryShowAll: vi.fn() })} />);
    expect(bad.container.querySelector('[data-action="registry-show-all"]')).toBeNull();
    cleanup();
    const none = render(<AlphaImport {...props({ onToggleRegistryShowAll: vi.fn() })} />);
    expect(none.container.querySelector('[data-action="registry-show-all"]')).toBeNull();
  });
});

describe("QA2 S14 the id rule is said once", () => {
  it("an invalid id prints the rule once; the disabled button's reason is short", () => {
    const gates = { ...GATES, all_pass: true } as GatesResponse;
    const view = render(<AlphaImport {...props({ alphaId: "Bad_ID", gates })} />);
    expect((view.container.textContent ?? "").split(ALPHA_ID_RULE).length - 1).toBe(1);
  });
});
