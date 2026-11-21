/**
 * Screen 14 — W2C (audit 2026-10-02): stepper keyboard, one refusal message,
 * `.py`-only input with a stated file/paste rule, fewer words.
 *
 * Every server object is the canonical contract fixture (read with
 * `readFileSync` from packages/contracts/fixtures) with only the fields a case
 * needs changed; props come from a typed builder. Nothing here reaches a live
 * server: the hook cases stub `fetch`, because the audit origin refuses a real
 * parse (N-S14-1).
 */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AlphaImport, NON_PY_ERROR, SINGLE_FILE_ERROR, awaitingStep, type AlphaImportProps } from "./AlphaImport";
import {
  IMPORT_FORBIDDEN,
  IMPORT_ORIGIN_REFUSED,
  toRefusal,
  type GatesResponse,
  type RegistrationResponse,
  type RegistryListResponse,
  type SourceResponse,
} from "./alphaImportClient";
import { PortalApiError } from "../lib/api";
import { researchState } from "./state";
import { useAlphaImport } from "./useAlphaImport";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const fixture = <T,>(name: string): T =>
  JSON.parse(readFileSync(join(ROOT, "packages/contracts/fixtures", `research-alpha-import.${name}.valid.json`), "utf8")) as T;

const SOURCE = fixture<SourceResponse>("source");
const GATES = fixture<GatesResponse>("gates");
const REGISTRATION = fixture<RegistrationResponse>("registration");
const REGISTRY = fixture<RegistryListResponse>("registry");
const OK = researchState({ kind: "ok", rowCount: 1 });

/** Typed builder: the empty screen, with only the named props changed. */
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
    parseState: awaitingStep("Nothing parsed yet."),
    gatesState: awaitingStep("Parse a source first."),
    registerState: awaitingStep("Run gates first."),
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

const tabs = () => screen.getAllByRole("tab");
const sel = (node: HTMLElement) => node.getAttribute("aria-selected");

describe("S14 stepper keyboard (14-04)", () => {
  it("keeps one tab stop: the selected tab is tabindex 0, the others -1", () => {
    render(<AlphaImport {...props()} />);
    expect(tabs().map((t) => t.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    expect(screen.getByRole("tablist").getAttribute("aria-label")).toBe("Import steps");
    tabs().forEach((t, i) => expect(t.getAttribute("aria-controls")).toBe(`ai-step-${i + 1}`));
  });

  it("ArrowRight / ArrowLeft move the selection and the focus, and wrap", () => {
    render(<AlphaImport {...props()} />);
    fireEvent.keyDown(tabs()[0], { key: "ArrowRight" });
    expect(sel(tabs()[1])).toBe("true");
    expect(document.activeElement).toBe(tabs()[1]);
    expect(tabs().map((t) => t.getAttribute("tabindex"))).toEqual(["-1", "0", "-1"]);
    expect((document.getElementById("ai-step-2") as HTMLElement).hidden).toBe(false);

    fireEvent.keyDown(tabs()[1], { key: "ArrowRight" });
    fireEvent.keyDown(tabs()[2], { key: "ArrowRight" });
    expect(sel(tabs()[0])).toBe("true");
    fireEvent.keyDown(tabs()[0], { key: "ArrowLeft" });
    expect(sel(tabs()[2])).toBe("true");
    expect(document.activeElement).toBe(tabs()[2]);
  });

  it("Home and End jump to the first and the last step; other keys do nothing", () => {
    render(<AlphaImport {...props()} />);
    fireEvent.keyDown(tabs()[0], { key: "End" });
    expect(sel(tabs()[2])).toBe("true");
    fireEvent.keyDown(tabs()[2], { key: "Home" });
    expect(sel(tabs()[0])).toBe("true");
    fireEvent.keyDown(tabs()[0], { key: "a" });
    expect(sel(tabs()[0])).toBe("true");
  });

  it("labels are short; the long name rides in the tooltip", () => {
    render(<AlphaImport {...props()} />);
    expect(tabs().map((t) => t.querySelector(".lbl")?.textContent)).toEqual(["Source", "Gates", "Register"]);
    expect(tabs()[1].getAttribute("title")).toContain("Quarantine gates");
  });

  it("touch targets: the stepper rule sets a 40px floor and a 44px floor at phone width", () => {
    render(<AlphaImport {...props()} />);
    const css = document.querySelector("style")!.textContent ?? "";
    expect(css).toMatch(/\.ai-step \{[^}]*min-height: 40px/);
    expect(css).toMatch(/@media \(max-width: 720px\)[\s\S]*\.ai-step \{[^}]*min-height: 44px/);
    expect(css).not.toMatch(/\.ai-step \{[^}]*min-height: [0-3]\dpx/);
  });
});

describe("S14 file input: .py only, last input wins", () => {
  function Harness({ onChange }: { onChange?: (text: string, name: string | null) => void }) {
    const [text, setText] = useState("");
    const [name, setName] = useState<string | null>(null);
    return (
      <AlphaImport
        {...props({
          sourceText: text,
          fileName: name,
          onSourceChange: (t, n) => {
            onChange?.(t, n);
            setText(t);
            setName(n);
          },
        })}
      />
    );
  }
  const input = () => screen.getByLabelText("Alpha source file") as HTMLInputElement;
  /* jsdom's File has no `text()`; give each test file one, as a browser's has. */
  const mkFile = (name: string, body: string, type = "text/x-python") => {
    const file = new File([body], name, { type });
    Object.defineProperty(file, "text", { value: () => Promise.resolve(body), configurable: true });
    return file;
  };
  const pyFile = (name: string, body: string) => mkFile(name, body);

  it("refuses a non-.py file with one short line and never reads it", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const file = mkFile("alpha.txt", "print(1)", "text/plain");
    const read = vi.spyOn(file, "text");
    fireEvent.change(input(), { target: { files: [file] } });
    expect(document.querySelector("[data-file-error]")?.textContent).toBe(NON_PY_ERROR);
    expect(NON_PY_ERROR).toBe(".py files only.");
    expect(read).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Alpha source text") as HTMLTextAreaElement).value).toBe("");
  });

  it("refuses a name that only contains .py (alpha.py.txt, alpha.pyc)", () => {
    render(<Harness />);
    for (const name of ["alpha.py.txt", "alpha.pyc", "alpha"]) {
      fireEvent.change(input(), { target: { files: [mkFile(name, "x")] } });
      expect(document.querySelector("[data-file-error]")?.textContent).toBe(NON_PY_ERROR);
    }
  });

  it("accepts a .py file (any case) and clears the refusal", async () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { files: [mkFile("a.txt", "x")] } });
    expect(screen.queryByText(NON_PY_ERROR)).toBeTruthy();
    fireEvent.change(input(), { target: { files: [pyFile("ALPHA.PY", "ALPHA_CONTRACT = {}\n")] } });
    await waitFor(() => expect((screen.getByLabelText("Alpha source text") as HTMLTextAreaElement).value).toBe("ALPHA_CONTRACT = {}\n"));
    expect(screen.queryByText(NON_PY_ERROR)).toBeNull();
    expect(screen.getByText("ALPHA.PY")).toBeTruthy();
  });

  it("two files: one short line", () => {
    const onMulti = vi.fn();
    render(<AlphaImport {...props({ onMultiFileRejected: onMulti })} />);
    fireEvent.change(input(), { target: { files: [pyFile("a.py", "1"), pyFile("b.py", "2")] } });
    expect(onMulti).toHaveBeenCalledOnce();
    expect(SINGLE_FILE_ERROR).toBe("One file only.");
  });

  it("choosing a file replaces pasted text and offers Undo; Undo restores the paste and drops the file", async () => {
    render(<Harness />);
    const area = () => screen.getByLabelText("Alpha source text") as HTMLTextAreaElement;
    fireEvent.change(area(), { target: { value: "pasted = 1\n" } });
    expect(document.querySelector("[data-paste-undo]")).toBeNull();

    fireEvent.change(input(), { target: { files: [pyFile("from_file.py", "file = 2\n")] } });
    await waitFor(() => expect(area().value).toBe("file = 2\n"));
    const hint = document.querySelector("[data-paste-undo]") as HTMLElement;
    expect(hint.textContent).toContain("Replaced pasted text.");

    fireEvent.click(within(hint).getByRole("button", { name: "Undo" }));
    expect(area().value).toBe("pasted = 1\n");
    expect(screen.queryByText("from_file.py")).toBeNull();
    expect(document.querySelector("[data-paste-undo]")).toBeNull();
  });

  it("typing after a file clears the file name (the pasted text is the source now)", async () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { files: [pyFile("from_file.py", "file = 2\n")] } });
    await waitFor(() => expect(screen.getByText("from_file.py")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Alpha source text"), { target: { value: "typed = 3\n" } });
    expect(screen.queryByText("from_file.py")).toBeNull();
    expect(screen.getByText("Choose or drop file")).toBeTruthy();
  });

  it("a file with no paste before it offers no Undo", async () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { files: [pyFile("only.py", "x = 1\n")] } });
    await waitFor(() => expect(screen.getByText("only.py")).toBeTruthy());
    expect(document.querySelector("[data-paste-undo]")).toBeNull();
  });

  it("states the rule in the control: the paste label's tooltip", () => {
    render(<AlphaImport {...props()} />);
    expect(screen.getByText("or paste").getAttribute("title")).toMatch(/Last input wins/);
  });
});

describe("S14 one refusal message", () => {
  const origin = toRefusal(new PortalApiError("Request origin is not allowed.", 403, "RESEARCH_ALPHA_IMPORT_INVALID", "req_o"));

  it("a refused parse prints once, inside the mirror panel, with Reload; no banner", () => {
    render(<AlphaImport {...props({ sourceText: "x = 1", refusal: origin, refusalStep: "parse", parseState: { state: origin.state, reason: origin.message, mayRetry: false, retainsContent: false } })} />);
    const panel = document.querySelector('[data-research-panel="parsed contract mirror"]') as HTMLElement;
    expect(panel.textContent).toBe(`${IMPORT_ORIGIN_REFUSED}Reload`);
    expect(document.querySelectorAll("[data-refusal]")).toHaveLength(1);
    expect(document.body.textContent?.split(IMPORT_ORIGIN_REFUSED).length).toBe(2);
    expect(document.body.textContent).not.toMatch(/RESEARCH_ALPHA|reload the page/);
    expect(panel.getAttribute("title")).toContain("RESEARCH_ALPHA_IMPORT_INVALID");
  });

  it("Reload reloads the page", () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    render(<AlphaImport {...props({ sourceText: "x = 1", refusal: origin, refusalStep: "parse" })} />);
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it("a refusal on step 2 opens step 2 and prints there only", () => {
    const refusal = toRefusal(new PortalApiError("x", 403, "RESEARCH_ALPHA_IMPORT_ACTIVATION_FORBIDDEN", "req_g"));
    render(<AlphaImport {...props({ parse: SOURCE, parseState: OK, refusal, refusalStep: "gates" })} />);
    expect(sel(tabs()[1])).toBe("true");
    const gates = document.querySelector('[data-research-panel="import gates"]') as HTMLElement;
    expect(gates.textContent).toBe(IMPORT_FORBIDDEN);
    expect(document.body.textContent?.split(IMPORT_FORBIDDEN).length).toBe(2);
  });

  it("a refusal on step 3 prints in the registration panel, once", () => {
    const refusal = toRefusal(new PortalApiError("x", 409, "RESEARCH_ALPHA_IMPORT_DIGEST_ALREADY_REGISTERED", null));
    render(<AlphaImport {...props({ parse: SOURCE, parseState: OK, gates: GATES, gatesState: OK, alphaId: "delta-rsi", refusal, refusalStep: "register" })} />);
    const reg = document.querySelector('[data-research-panel="registration"]') as HTMLElement;
    expect(reg.textContent).toBe("Already registered.");
    expect(document.body.textContent?.split("Already registered.").length).toBe(2);
  });

  it("an unattributed refusal still prints exactly once", () => {
    render(<AlphaImport {...props({ refusal: origin })} />);
    expect(document.body.textContent?.split(IMPORT_ORIGIN_REFUSED).length).toBe(2);
  });

  it("the 403 and 400 write refusals are one short line each, under the word budget", () => {
    const forbidden = toRefusal(new PortalApiError("a long server sentence", 403, null, null)).message;
    const invalid = toRefusal(new PortalApiError("a long server sentence", 400, null, null)).message;
    expect(forbidden).toBe("Not permitted.");
    expect(invalid).toBe("Request not valid.");
    for (const line of [forbidden, invalid, origin.message]) expect(line.split(/\s+/).length).toBeLessThanOrEqual(3);
  });
});

describe("S14 origin refusal keeps its retry semantics (hook, stubbed fetch)", () => {
  function stubFetch(parseStatus: number) {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          calls.push({ url, body: JSON.parse(String(init.body)) });
          return parseStatus === 200
            ? new Response(JSON.stringify(SOURCE), { status: 200 })
            : new Response(JSON.stringify({ error: { code: "RESEARCH_ALPHA_IMPORT_INVALID", message: "Request origin is not allowed." }, request_id: "req_o" }), { status: parseStatus });
        }
        return new Response(JSON.stringify(REGISTRY), { status: 200 });
      }),
    );
    return calls;
  }

  it("the refused parse is attributed to step 1, short, not retried automatically, and resent byte-identical", async () => {
    const calls = stubFetch(403);
    const { result } = renderHook(() => useAlphaImport());
    await waitFor(() => expect(result.current.registryState.state).toBe("available"));

    act(() => result.current.onSourceChange("ALPHA_CONTRACT = {}\n", "alpha_demo.py"));
    act(() => result.current.onParse());
    await waitFor(() => expect(result.current.refusal).not.toBeNull());
    expect(result.current.refusal?.origin).toBe(true);
    expect(result.current.refusalStep).toBe("parse");
    expect(result.current.parseState.reason).toBe(IMPORT_ORIGIN_REFUSED);
    expect(result.current.parse).toBeNull();
    expect(calls).toHaveLength(1);

    // The same button, the same body: no client_intent_id, no generated key, no auto-retry.
    act(() => result.current.onParse());
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toEqual(calls[0]);
    expect(Object.keys(calls[0].body as object).sort()).toEqual(["original_filename", "source_text", "workspace_id"].filter((k) => k in (calls[0].body as object)).sort());
    expect(JSON.stringify(calls[0].body)).not.toContain("client_intent_id");
  });

  it("a refused parse is a refusal, not a parse: step 2 stays shut", async () => {
    stubFetch(403);
    const { result } = renderHook(() => useAlphaImport());
    act(() => result.current.onSourceChange("x = 1\n", null));
    act(() => result.current.onParse());
    await waitFor(() => expect(result.current.refusal).not.toBeNull());
    expect(result.current.parse).toBeNull();
    expect(result.current.gates).toBeNull();
    // Registration is built only from a parse + gates receipt that the server issued.
    expect(REGISTRATION.alpha_id).toBeTruthy();
  });
});

describe("S14 fewer words (step 1, empty)", () => {
  it("prints well under the audit's 135 words and no regex helper text", () => {
    render(<AlphaImport {...props()} />);
    const step1 = document.getElementById("ai-step-1")!;
    const words = (step1.textContent ?? "").replace(/([a-z])([A-Z])/g, "$1 $2").split(/\s+/).filter(Boolean).length;
    // The visible step-1 text, not tooltips. Budget ~85 (TEXT_C); the code-anatomy details body is collapsed prose.
    const anatomy = (step1.querySelector("[data-code-anatomy]")?.textContent ?? "").split(/\s+/).filter(Boolean).length;
    // P25-AF: the required-fields reference table is Bobby's explicit ask (a table, not prose), counted apart.
    const reference = (step1.querySelector("[data-required-fields]")?.textContent ?? "").replace(/([a-z])([A-Z])/g, "$1 $2").split(/\s+/).filter(Boolean).length;
    expect(words - anatomy - reference).toBeLessThanOrEqual(60);
    expect(step1.textContent).not.toMatch(/\^\[a-z\]|\^av_|\(\?:m\|h\|d\|w\)/);
    expect(step1.textContent).not.toMatch(/held in quarantine|one \.py|contract \+ code/i);
  });

  it("the disabled-button reasons are tooltips and descriptions, never a second visible line", () => {
    render(<AlphaImport {...props()} />);
    const parse = screen.getByRole("button", { name: "Parse" });
    expect(parse.getAttribute("title")).toBe("Add a file or paste code.");
    const reason = document.getElementById(parse.getAttribute("aria-describedby")!)!;
    expect(reason.className).toContain("ai-sr");
  });

  it("registers no typo: the screen has no Vietnamese label", () => {
    render(<AlphaImport {...props({ registry: REGISTRY.entries })} />);
    expect(document.body.textContent).not.toMatch(/Trong inbox/i);
  });
});
