/**
 * Screen 14 — E6 HiFi rebuild (Unified §13.4.1 E6, audit rows 14-1…14-7).
 *
 * Every server object here is a canonical contract fixture read from
 * `packages/contracts/fixtures`, never a local copy: if the contract moves,
 * these tests move with it. What they hold:
 *
 *  - 14-1 the HiFi title, its state chip and the endpoint meta line;
 *  - 14-2 the shared crumb pattern;
 *  - 14-3 a three-step stepper (DQ-06) whose views keep local input;
 *  - 14-4/14-5 the two-column step 1 and the three-column mirror + rules foot;
 *  - 14-6 the "rules of this screen" footer;
 *  - 14-7 / OL-01 running an imported alpha is a typed absence, not an action;
 *  - E1 display rules: short ids with the full value kept, no ISO-millisecond
 *    timestamp, one 403/404 sentence.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AlphaImport,
  DRAFT_NOTE,
  IMPORT_META,
  IMPORT_STEPS,
  IMPORT_TITLE,
  REGISTRATION_ABSENT,
  RULE_PATTERNS,
  RUN_NOT_ADMITTED,
  SCREEN_RULES,
  awaitingStep,
  importChip,
  stepForReceipts,
  type AlphaImportProps,
} from "./AlphaImport";
import {
  toRefusal,
  type ActivationResponse,
  type GatesResponse,
  type RegistrationResponse,
  type RegistryListResponse,
  type SourceResponse,
} from "./alphaImportClient";
import { PortalApiError } from "../lib/api";
import { REFUSAL_COPY } from "./researchRefusal";
import { formatUtc } from "./researchFormat";
import { researchState } from "./state";

afterEach(cleanup);

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const fixture = <T,>(name: string): T =>
  JSON.parse(readFileSync(join(ROOT, "packages/contracts/fixtures", `research-alpha-import.${name}.valid.json`), "utf8")) as T;
const SCHEMA = JSON.parse(
  readFileSync(join(ROOT, "packages/contracts/schemas/research-alpha-import.v1.schema.json"), "utf8"),
) as { $defs: Record<string, { pattern?: string; properties?: Record<string, { pattern?: string; items?: { pattern?: string } }> }> };

const SOURCE = fixture<SourceResponse>("source");
const GATES = fixture<GatesResponse>("gates");
const REGISTRATION = fixture<RegistrationResponse>("registration");
const ACTIVATION = fixture<ActivationResponse>("activation");
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

/** Every receipt the canonical fixtures carry, as after a full clean import. */
function registered(overrides: Partial<AlphaImportProps> = {}): AlphaImportProps {
  return props({
    sourceText: "ALPHA_CONTRACT = {}\n",
    fileName: "alpha_demo.py",
    parse: SOURCE,
    parseState: OK,
    gates: GATES,
    gatesState: OK,
    registration: REGISTRATION,
    registerState: OK,
    registry: REGISTRY.entries,
    alphaId: REGISTRATION.alpha_id,
    activationAdmitted: REGISTRATION.may_activate,
    ...overrides,
  });
}

function panel(n: 1 | 2 | 3): HTMLElement {
  return document.querySelector(`[data-step="${n}"]`) as HTMLElement;
}

function tab(n: 1 | 2 | 3): HTMLElement {
  return document.querySelector(`[data-step-marker="${n}"]`) as HTMLElement;
}

describe("14-1/14-2 — header: crumb, title, state chip, meta line", () => {
  it("prints the HiFi title, the shared crumb and the real endpoint meta", () => {
    render(<AlphaImport {...props()} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(IMPORT_TITLE);
    expect(IMPORT_TITLE).toBe("Alpha Import — standardize the code artifact");

    const crumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(crumb.textContent).toBe("Journey/Alpha Import·next: New Run →");
    expect(within(crumb).getByText("Alpha Import").getAttribute("aria-current")).toBe("page");
    expect(within(crumb).getByText("Journey").getAttribute("href")).toBe("/research/quantbt/journey");

    expect(document.querySelector("[data-meta]")?.textContent).toBe(IMPORT_META);
    // The meta names the endpoints this client really calls.
    expect(IMPORT_META).toContain("/api/v1/research/alphas/import");
    expect(IMPORT_META).toContain("activation ADMIN-only");
  });

  it("shows no chip before a parse: nothing is in quarantine yet", () => {
    render(<AlphaImport {...props()} />);
    expect(document.querySelector("[data-import-chip]")).toBeNull();
  });

  it("holds the parsed bytes in QUARANTINE until they are registered, gated or not", () => {
    const { rerender } = render(<AlphaImport {...props({ parse: SOURCE, parseState: OK })} />);
    const chip = () => document.querySelector("[data-import-chip]") as HTMLElement;
    expect(chip().textContent).toBe("QUARANTINE");
    expect(chip().getAttribute("data-chip")).toBe("QUARANTINE");

    rerender(<AlphaImport {...props({ parse: SOURCE, parseState: OK, gates: GATES, gatesState: OK })} />);
    expect(chip().textContent).toBe("QUARANTINE");
  });

  it("shows the server's lifecycle word and label once registered, and ACTIVE only from activation", () => {
    const { rerender } = render(<AlphaImport {...registered()} />);
    const chip = () => document.querySelector("[data-import-chip]") as HTMLElement;
    expect(chip().textContent).toBe(`DRAFT · ${REGISTRATION.version_label}`);

    rerender(<AlphaImport {...registered({ activation: ACTIVATION })} />);
    expect(chip().textContent).toBe(`ACTIVE · ${REGISTRATION.version_label}`);
    expect(importChip(null, null, null)).toBeNull();
  });
});

describe("14-3 — a three-step stepper (DQ-06) over mounted views", () => {
  it("has exactly three steps with the HiFi label + sub-line shape", () => {
    render(<AlphaImport {...props()} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(IMPORT_STEPS.map((step) => step.label)).toEqual(["Source & mirror", "Quarantine gates", "Register av_"]);
    tabs.forEach((node, index) => {
      expect(node.textContent).toContain(IMPORT_STEPS[index].label);
      expect(node.textContent).toContain(IMPORT_STEPS[index].sub);
    });
  });

  it("opens on the step of the latest receipt", () => {
    expect(stepForReceipts(null, null)).toBe(1);
    expect(stepForReceipts(GATES, null)).toBe(2);
    expect(stepForReceipts(GATES, REGISTRATION)).toBe(3);

    render(<AlphaImport {...registered()} />);
    expect(tab(3).getAttribute("aria-selected")).toBe("true");
    expect(panel(3).hidden).toBe(false);
    expect(panel(1).hidden).toBe(true);
    expect(panel(2).hidden).toBe(true);
  });

  it("switches the view on a click, and a click is not a request", () => {
    const p = registered();
    render(<AlphaImport {...p} />);
    fireEvent.click(tab(1));
    expect(panel(1).hidden).toBe(false);
    expect(panel(3).hidden).toBe(true);
    expect(tab(1).getAttribute("aria-selected")).toBe("true");
    for (const handler of [p.onParse, p.onRunGates, p.onRegister, p.onActivate]) {
      expect(handler).not.toHaveBeenCalled();
    }
  });

  it("keeps the pasted source when the view changes", () => {
    render(<AlphaImport {...props({ sourceText: "ALPHA_CONTRACT = {}\n" })} />);
    fireEvent.click(tab(3));
    fireEvent.click(tab(1));
    expect((screen.getByLabelText("Alpha source text") as HTMLTextAreaElement).value).toBe("ALPHA_CONTRACT = {}\n");
  });

  it("marks each step's progress from receipts, and a failed gate is not done", () => {
    const failing: GatesResponse = {
      ...GATES,
      all_pass: false,
      gates: GATES.gates.map((gate) =>
        gate.n === 3 ? { ...gate, state: "FAIL" } : gate.n > 3 ? { ...gate, state: "SKIPPED" } : gate,
      ),
    };
    const { rerender } = render(<AlphaImport {...props()} />);
    expect([1, 2, 3].map((n) => tab(n as 1).getAttribute("data-progress"))).toEqual(["open", "open", "open"]);

    rerender(<AlphaImport {...props({ parse: SOURCE, parseState: OK, gates: failing, gatesState: OK })} />);
    expect([1, 2, 3].map((n) => tab(n as 1).getAttribute("data-progress"))).toEqual(["done", "failed", "open"]);
  });

  it("offers Continue only after the step's own receipt allows it", () => {
    render(<AlphaImport {...props({ sourceText: "x", parse: SOURCE, parseState: OK })} />);
    const next = document.querySelector('[data-nav="2"]') as HTMLButtonElement;
    expect(next).toBeTruthy();
    fireEvent.click(next);
    expect(panel(2).hidden).toBe(false);
    expect(document.querySelector('[data-nav="3"]')).toBeNull();
  });
});

describe("14-4/14-5 — step 1: mirror table left, drop zone + entrypoint right", () => {
  it("renders the canonical mirror as FIELD / DECLARED VALUE / CHECK, one row per field", () => {
    render(<AlphaImport {...props({ parse: SOURCE, parseState: OK })} />);
    const rows = Array.from(document.querySelectorAll("[data-mirror-field]"));
    expect(rows.map((row) => row.getAttribute("data-mirror-field"))).toEqual(SOURCE.mirror.map((field) => field.field));
    for (const row of rows) {
      expect(row.querySelectorAll("dt")).toHaveLength(1);
      expect(row.querySelectorAll(":scope > dd")).toHaveLength(2);
    }
    expect(panel(1).textContent).toContain("fielddeclared valuecheck");
  });

  it("prints each field's value, verdict and note from the server, and a typed absence otherwise", () => {
    render(<AlphaImport {...props({ parse: SOURCE, parseState: OK })} />);
    for (const field of SOURCE.mirror) {
      const row = document.querySelector(`[data-mirror-field="${field.field}"]`) as HTMLElement;
      const [value, check] = Array.from(row.querySelectorAll(":scope > dd")) as HTMLElement[];
      expect(check.getAttribute("data-mirror-verdict")).toBe(field.check);
      expect(check.textContent?.startsWith(field.check)).toBe(true);
      expect(row.getAttribute("title")).toBe(field.gate ? `${field.gate} · ${field.note}` : field.note);
      if (field.state === "parsed" || field.state === "server_computed") {
        expect(value.querySelector("[data-absent]")).toBeNull();
      } else {
        expect(value.querySelector("[data-absent]")?.getAttribute("data-absent")).toBe(field.state);
        // Only the absence's own word — never a number, a dash or N/A.
        expect(value.textContent).toBe({ missing: "missing", server_assigned: "at register", not_in_contract: "not in v1" }[field.state]);
      }
    }
    expect(document.querySelector('[data-mirror-field="warmup_bars"] dd')?.textContent).toBe("32");
    expect(document.querySelector('[data-mirror-field="entrypoint"] dd')?.textContent).toBe("generate_signals");
  });

  it("shows the artifact digest as prefix + 8 hex and keeps the full value", () => {
    render(<AlphaImport {...props({ parse: SOURCE, parseState: OK })} />);
    const cell = document.querySelector('[data-mirror-field="artifact.digest"] dd') as HTMLElement;
    expect(cell.textContent).toBe("sha256:aaaaaaaa…");
    const digest = SOURCE.mirror.find((field) => field.field === "artifact.digest")?.value as string;
    expect(cell.querySelector("[data-full-id]")?.getAttribute("data-full-id")).toBe(digest.replace(/^sha256:/, ""));
  });

  it("states the field rules with the contract's own patterns", () => {
    render(<AlphaImport {...props()} />);
    const defs = SCHEMA.$defs;
    expect(RULE_PATTERNS.alphaId).toBe(defs.AlphaId.pattern);
    expect(RULE_PATTERNS.versionLabel).toBe(defs.RegistrationResponse.properties?.version_label.pattern);
    expect(RULE_PATTERNS.timeframe).toBe(defs.AlphaVersionDeclaration.properties?.timeframes.items?.pattern);
    const rules = document.querySelector("[data-mirror-rules]") as HTMLElement;
    for (const pattern of Object.values(RULE_PATTERNS)) expect(rules.textContent).toContain(pattern);
  });

  it("puts the drop zone and the entrypoint card beside the mirror, and Code anatomy below", () => {
    render(<AlphaImport {...props()} />);
    const step1 = panel(1);
    expect(step1.querySelector(".ai-cols .ai-mirror-card")).toBeTruthy();
    expect(step1.querySelector(".ai-cols .ai-side [data-dropzone]")).toBeTruthy();
    expect(step1.querySelector(".ai-cols .ai-side [data-entrypoint-card]")).toBeTruthy();
    expect(step1.querySelector(":scope > [data-code-anatomy]")).toBeTruthy();
    expect(step1.textContent).toContain("mismatch is refused as RESEARCH_ALPHA_IMPORT_DIGEST_MISMATCH");
  });

  it("shows the parsed source digest short and its byte size formatted", () => {
    render(<AlphaImport {...props({ sourceText: "x".repeat(18_432), fileName: "alpha_demo.py", parse: SOURCE, parseState: OK })} />);
    const custody = document.querySelector("[data-source-custody]") as HTMLElement;
    expect(custody.textContent).toContain("sha256:aaaaaaaa…");
    expect(custody.textContent).toContain("18.0 KB");
    expect(custody.querySelector("[data-full-id]")?.getAttribute("data-full-id")).toBe(SOURCE.source_digest);
  });
});

describe("step 2 — the quarantine gates card", () => {
  it("renders the canonical seven gates in order with the receipt short and its expiry in UTC", () => {
    render(<AlphaImport {...props({ parse: SOURCE, parseState: OK, gates: GATES, gatesState: OK })} />);
    // Reduced motion is not set; wait out nothing — the rows mount on the stagger.
    const step2 = panel(2);
    expect(step2.textContent).toContain(`expires ${formatUtc(GATES.expires_at_utc_ms)}`);
    expect(step2.querySelector("[data-full-id]")?.getAttribute("data-full-id")).toBe(GATES.gate_receipt_id);
    expect(step2.querySelector("[data-static-scan-disclosure]")?.textContent).toBe(GATES.static_scan_disclosure);
  });
});

describe("step 3 — registration rows, where it goes next, and OL-01", () => {
  it("writes the HiFi registry rows from the registration and its registry entry", () => {
    render(<AlphaImport {...registered()} />);
    const row = (k: string) => document.querySelector(`[data-reg-row="${k}"] dd`) as HTMLElement;
    const entry = REGISTRY.entries[0];
    expect(row("alpha_id").textContent).toBe(`${REGISTRATION.alpha_id} · ${entry.display_name}`);
    expect(row("alpha_version_id").textContent).toContain(REGISTRATION.version_label);
    expect(row("artifact digest").textContent).toBe("sha256:aaaaaaaa…");
    expect(row("entrypoint").textContent).toBe(entry.entrypoint);
    expect(row("import state").querySelector("[data-lifecycle]")?.textContent).toBe("DRAFT");
    expect(row("import state").querySelector("[data-draft-note]")?.textContent).toBe(DRAFT_NOTE);
    expect(row("registered at").textContent).toBe(formatUtc(entry.registered_at_utc_ms));
  });

  it("renders the rows no v1 response carries as typed absences", () => {
    render(<AlphaImport {...registered()} />);
    const capability = document.querySelector('[data-reg-row="capability registration"] dd') as HTMLElement;
    const signature = document.querySelector('[data-reg-row="signed publication"] dd') as HTMLElement;
    expect(capability.getAttribute("data-absent")).toBe(REGISTRATION_ABSENT.capability.code);
    expect(signature.getAttribute("data-absent")).toBe(REGISTRATION_ABSENT.signature.code);
    expect(capability.textContent).toBe(REGISTRATION_ABSENT.capability.text);
  });

  it("says the entrypoint was not read when the registry has not returned the version", () => {
    render(<AlphaImport {...registered({ registry: [] })} />);
    expect(document.querySelector('[data-reg-row="entrypoint"] dd')?.getAttribute("data-absent")).toBe("REGISTRY_NOT_READ");
  });

  it("OL-01: running the imported version is a typed absence, never a link or a button", () => {
    render(<AlphaImport {...registered({ activation: ACTIVATION })} />);
    const absent = document.querySelector('[data-absent-action="new-run"]') as HTMLElement;
    expect(absent.tagName).toBe("SPAN");
    expect(absent.getAttribute("href")).toBeNull();
    expect(absent.getAttribute("tabindex")).toBeNull();
    expect(absent.getAttribute("data-absent-code")).toBe(RUN_NOT_ADMITTED.code);
    expect(absent.getAttribute("title")).toBe(RUN_NOT_ADMITTED.reason);
    expect(document.querySelector("[data-run-not-admitted]")?.textContent).toBe(RUN_NOT_ADMITTED.reason);
    // No anchor anywhere hands this version to New Run.
    for (const anchor of Array.from(document.querySelectorAll("a[href]"))) {
      expect(anchor.getAttribute("href")).not.toMatch(/runs\/new\?/);
    }
  });

  it("keeps the lineage and run-library links working", () => {
    render(<AlphaImport {...registered()} />);
    const links = document.querySelector("[data-where-next] .links") as HTMLElement;
    expect(within(links).getByText("lineage").getAttribute("href")).toContain(REGISTRATION.alpha_id);
    expect(within(links).getByText("run library").getAttribute("href")).toBe("/research/quantbt/runs");
  });
});

describe("14-6 — rules of this screen", () => {
  it("closes the page with the footer every other Research screen has", () => {
    render(<AlphaImport {...props()} />);
    const foot = document.querySelector('[data-panel="rules"]') as HTMLElement;
    expect(foot.tagName).toBe("FOOTER");
    expect(foot.textContent).toBe(`rules of this screen${SCREEN_RULES}`);
  });
});

describe("E1 — display rules on Screen 14", () => {
  it("prints no ISO timestamp with milliseconds anywhere", () => {
    render(<AlphaImport {...registered({ activation: ACTIVATION })} />);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(text).not.toMatch(/\.\d{3}Z/);
    // A 64-hex digest never reaches the screen whole.
    expect(text).not.toMatch(/[0-9a-f]{64}/);
  });

  it("uses the one F-04 sentence for 403 and 404, coded or not", () => {
    for (const [status, code] of [
      [404, "RESEARCH_ALPHA_IMPORT_SOURCE_NOT_FOUND"],
      [403, "RESEARCH_ALPHA_IMPORT_ACTIVATION_FORBIDDEN"],
      [403, null],
      [404, null],
    ] as const) {
      expect(toRefusal(new PortalApiError("server text", status, code, null)).message).toBe(REFUSAL_COPY.denied);
    }
  });
});
