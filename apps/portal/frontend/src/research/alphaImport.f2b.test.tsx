/**
 * Screen 14 — Batch F2b (UX flow, less text).
 *
 *  - the way back to the lineage the screen was opened for, and the way on to
 *    New Run, keep the alpha (and, once the server admits it, the version);
 *  - after registration the lineage link names the registered version;
 *  - every registry row has its own lineage link; its run link follows the
 *    server's `run_admission` for that very row;
 *  - the long sentences are tooltips; the gate strip draws one cell per gate.
 *
 * Server objects are the canonical contract fixtures (never hand-built).
 */
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AlphaImport, awaitingStep, newRunHref, type AlphaImportProps } from "./AlphaImport";
import { AlphaImportRoute } from "./AlphaImportRoute";
import type { GatesResponse, RegistrationResponse, RegistryEntry, RegistryListResponse, SourceResponse } from "./alphaImportClient";
import { alphaImportHref, lineageHref, newRunPrefillHref } from "./lineageClient";
import { researchState } from "./state";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const fixture = <T,>(name: string): T =>
  JSON.parse(readFileSync(join(ROOT, "packages/contracts/fixtures", `research-alpha-import.${name}.valid.json`), "utf8")) as T;

const SOURCE = fixture<SourceResponse>("source");
const GATES = fixture<GatesResponse>("gates");
const REGISTRATION = fixture<RegistrationResponse>("registration");
const REGISTRY = fixture<RegistryListResponse>("registry");
const ENTRY = REGISTRY.entries[0];
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

const entry = (overrides: Partial<RegistryEntry>): RegistryEntry => ({ ...ENTRY, ...overrides });
const q = (selector: string) => document.querySelector(selector) as HTMLElement | null;
const href = (selector: string) => q(selector)?.getAttribute("href");

describe("F2b — S14 links keep their context", () => {
  it("P24 retains workspace in admitted version, Lineage and New Run product links", () => {
    render(<MemoryRouter initialEntries={["/research/quantbt/alpha-import?workspace_id=ws%26review"]}><AlphaImport {...registered()} /></MemoryRouter>);
    const outgoing = [...document.querySelectorAll<HTMLAnchorElement>('a[href^="/research/quantbt/"]')];
    expect(outgoing.length).toBeGreaterThan(2);
    for (const link of outgoing) expect(new URL(link.href).searchParams.get("workspace_id")).toBe("ws&review");
  });

  it("the shared href helpers produce what the receiving screens read", () => {
    expect(newRunPrefillHref("alpha-demo")).toBe("/research/quantbt/runs/new?alpha=alpha-demo");
    expect(newRunPrefillHref("alpha-demo", "av_1")).toBe("/research/quantbt/runs/new?alpha=alpha-demo&av=av_1");
    expect(newRunHref("alpha-demo", "av_1")).toBe(newRunPrefillHref("alpha-demo", "av_1"));
    expect(alphaImportHref("alpha-demo")).toBe("/research/quantbt/alpha-import?alpha=alpha-demo");
    expect(alphaImportHref()).toBe("/research/quantbt/alpha-import");
  });

  it("without a context alpha the header has no back link and the next link is plain", () => {
    render(<AlphaImport {...props()} />);
    expect(q('[data-action="back-to-lineage"]')).toBeNull();
    expect(href('[data-action="next-new-run"]')).toBe("/research/quantbt/runs/new");
    expect(href(".ai-crumb a")).toBe("/research/quantbt/journey");
  });

  it("opened for an alpha, the crumb leads back to its lineage and the next link carries the alpha", () => {
    render(<AlphaImport {...props({ contextAlpha: "alpha-demo" })} />);
    expect(href('[data-action="back-to-lineage"]')).toBe(lineageHref("alpha-demo"));
    expect(q('[data-action="back-to-lineage"]')?.getAttribute("title")).toContain("alpha-demo");
    expect(href('[data-action="next-new-run"]')).toBe("/research/quantbt/runs/new?alpha=alpha-demo");
  });

  it("a whole typed alpha id is carried by the next link before anything is registered", () => {
    render(<AlphaImport {...props({ alphaId: "typed-alpha" })} />);
    expect(href('[data-action="next-new-run"]')).toBe("/research/quantbt/runs/new?alpha=typed-alpha");
  });

  it("after registration the lineage link names the registered version, and the library keeps the alpha", () => {
    render(<AlphaImport {...registered()} />);
    expect(href('[data-where-next] [data-action="open-lineage"]')).toBe(
      lineageHref(REGISTRATION.alpha_id, { av: REGISTRATION.alpha_version_id }),
    );
    expect(href('[data-where-next] [data-action="open-run-library"]')).toBe(
      `/research/quantbt/runs?group=1&alpha=${encodeURIComponent(REGISTRATION.alpha_id)}`,
    );
  });

  it("when the server admits a run the header's next link and the primary slot both bind the version", () => {
    const admitted = entry({ alpha_version_id: REGISTRATION.alpha_version_id, lifecycle_state: "ACTIVE", run_admission: { may_create_run: true, code: null } });
    render(<AlphaImport {...registered({ registry: [admitted] })} />);
    const bound = newRunHref(admitted.alpha_id, admitted.alpha_version_id);
    expect(href('[data-action="next-new-run"]')).toBe(bound);
    expect(href("a[data-run-admission='admitted']")).toBe(bound);
    expect(q("a[data-run-admission='admitted']")?.getAttribute("data-primary")).toBe("true");
    // The lineage link steps back from primary once a run is the obvious next step.
    expect(q('[data-where-next] [data-action="open-lineage"]')?.getAttribute("data-primary")).toBeNull();
  });

  it("every registry row links to its own lineage; the run link only where that row is admitted", () => {
    const admitted = entry({ alpha_version_id: "av_a", version_label: "0.1.0", run_admission: { may_create_run: true, code: null } });
    const refused = entry({ alpha_version_id: "av_b", version_label: "0.2.0", run_admission: { may_create_run: false, code: "RESEARCH_RUN_ALPHA_NOT_ACTIVE" } });
    render(<AlphaImport {...registered({ registry: [admitted, refused] })} />);
    const rowA = q('[data-registry-entry="av_a"]')!;
    const rowB = q('[data-registry-entry="av_b"]')!;
    expect(rowA.querySelector('[data-action="registry-lineage"]')?.getAttribute("href")).toBe(lineageHref(ENTRY.alpha_id, { av: "av_a" }));
    expect(rowB.querySelector('[data-action="registry-lineage"]')?.getAttribute("href")).toBe(lineageHref(ENTRY.alpha_id, { av: "av_b" }));
    expect(rowA.querySelector('[data-action="registry-new-run"]')?.getAttribute("href")).toBe(newRunHref(ENTRY.alpha_id, "av_a"));
    expect(rowB.querySelector('[data-action="registry-new-run"]')).toBeNull();
  });
});

describe("F2b — S14 less text, more picture", () => {
  it("the entrypoint sentence is a tooltip, not a paragraph", () => {
    render(<AlphaImport {...props()} />);
    const card = q("[data-entrypoint-card]")!;
    expect(card.querySelector("p")).toBeNull();
    expect(card.querySelector(".ai-entry")?.getAttribute("title")).toBe("Helpers may be plain functions or plain classes with static methods only; no inheritance, instance state or dynamic calls.");
  });

  it("each anatomy section carries its note as a tooltip and prints no paragraph", () => {
    render(<AlphaImport {...props()} />);
    const sections = document.querySelectorAll("[data-anatomy-section]");
    expect(sections.length).toBeGreaterThan(0);
    for (const section of Array.from(sections)) {
      expect(section.querySelector("p")).toBeNull();
      expect(section.querySelector("header")?.getAttribute("title")).toBeTruthy();
    }
  });

  it("the no-override rule is two words with the full sentence in the tooltip", () => {
    render(<AlphaImport {...props({ gates: GATES, gatesState: OK })} />);
    const note = q("[data-no-override]")!;
    expect(note.textContent).toBe("No override.");
    expect(note.getAttribute("title")).toBe("No override — fix the .py and import again.");
  });

  it("the gate strip draws one titled cell per served gate, coloured by that gate's own state, and none before a receipt", () => {
    const { unmount } = render(<AlphaImport {...props()} />);
    expect(q("[data-gate-strip]")).toBeNull();
    unmount();
    render(<AlphaImport {...props({ gates: GATES, gatesState: OK })} />);
    const cells = Array.from(document.querySelectorAll("[data-gate-strip] [data-gate-cell]"));
    expect(cells).toHaveLength(GATES.gates.length);
    cells.forEach((cell, index) => {
      const gate = GATES.gates[index];
      expect(cell.getAttribute("data-gate-cell")).toBe(gate.state);
      expect(cell.getAttribute("title")).toBe(`gate ${gate.n} · ${gate.name} — ${gate.state}`);
      expect(cell.getAttribute("aria-label")).toBe(`gate ${gate.n} ${gate.name} ${gate.state}`);
    });
  });

  it("while the gates request is in flight all seven cells pulse", () => {
    render(<AlphaImport {...props({ parse: SOURCE, parseState: OK, busyStep: "gates" })} />);
    const cells = Array.from(document.querySelectorAll("[data-gate-strip] [data-gate-cell]"));
    expect(cells).toHaveLength(7);
    expect(cells.every((cell) => cell.getAttribute("data-gate-cell") === "RUNNING" && cell.getAttribute("data-motion") === "pulse")).toBe(true);
  });

  it("the where-next panel does not animate before there is anything registered", () => {
    render(<AlphaImport {...props()} />);
    expect(q("[data-where-next]")?.getAttribute("data-motion")).toBe("false");
  });
});

describe("F2b — AlphaImportRoute keeps ?alpha= in the URL", () => {
  function Where() {
    const location = useLocation();
    return <output data-where>{`${location.pathname}${location.search}`}</output>;
  }

  function renderRoute(search: string) {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ entries: [], total: 0 }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    return render(
      <MemoryRouter initialEntries={[`/research/quantbt/alpha-import${search}`]}>
        <Where />
        <Routes>
          <Route path="/research/quantbt/alpha-import" element={<AlphaImportRoute />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  /* The registry read settles after mount; wait for it so no state update lands outside the test. */
  const settled = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });

  it("pre-fills the alpha id and shows the way back to that lineage", async () => {
    renderRoute("?alpha=alpha-demo");
    await settled();
    expect((document.querySelector('input[aria-label="Alpha id"]') as HTMLInputElement | null)?.value ?? "").toBe("alpha-demo");
    expect(href('[data-action="back-to-lineage"]')).toBe(lineageHref("alpha-demo"));
  });

  it("P24 keeps explicit workspace for the existing registry read and parse write", async () => {
    renderRoute("?alpha=alpha-demo&workspace_id=ws%26review");
    await settled();
    const fetch = vi.mocked(globalThis.fetch);
    expect(new URL(String(fetch.mock.calls[0][0]), "http://localhost").searchParams.get("workspace_id")).toBe("ws&review");
    fetch.mockResolvedValueOnce(new Response(JSON.stringify(SOURCE), { status: 200, headers: { "content-type": "application/json" } }));
    fireEvent.change(document.querySelector("textarea")!, { target: { value: "ALPHA_CONTRACT = {}\n" } });
    fireEvent.click(document.querySelector('[data-action="parse"]')!);
    await waitFor(() => expect(fetch.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
    const [, request] = fetch.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse(String(request?.body)).workspace_id).toBe("ws&review");
    expect(document.querySelector("[data-where]")?.textContent).toContain("workspace_id=ws%26review");
    for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href^="/research/quantbt/"]'))
      expect(new URL(link.href).searchParams.get("workspace_id")).toBe("ws&review");
  });

  it("an id that is not a valid alpha id is neither pre-filled as context nor linked", async () => {
    renderRoute("?alpha=NOT%20VALID");
    await settled();
    expect(q('[data-action="back-to-lineage"]')).toBeNull();
  });
});
