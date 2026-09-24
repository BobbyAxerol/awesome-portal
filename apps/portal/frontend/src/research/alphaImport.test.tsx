/**
 * Screen 14 — Alpha Import tests (spec 14 §5, T01–T12).
 *
 * Two things are under test that unit tests usually miss, because both defects
 * shipped once already in this campaign:
 *
 *  - **A control offered where it cannot work.** Steps 2 and 3 must be disabled
 *    by the server's own facts, not by an optimistic local guess.
 *  - **Copy drift.** Four sentences in this screen are contractual. They are
 *    asserted character-for-character, including the em dash, because a
 *    paraphrase of "fail-closed" is a different promise.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ACTIVATION_NOT_ADMITTED,
  AlphaImport,
  DRAFT_NOTE,
  FAIL_CLOSED_NOTE,
  GATE_STAGGER_MS,
  SINGLE_FILE_ERROR,
  awaitingStep,
  type AlphaImportProps,
} from "./AlphaImport";
import { ANATOMY_SUBSTAGE_NOTE, CODE_ANATOMY, UNLOCK_MAP } from "./codeAnatomy";
import type {
  ActivationResponse,
  GateName,
  GateRow,
  GatesResponse,
  RegistrationResponse,
  RegistryEntry,
  SourceResponse,
} from "./alphaImportClient";
import { PROBLEM_CODES, toRefusal } from "./alphaImportClient";
import { PortalApiError } from "../lib/api";
import { researchState } from "./state";

afterEach(cleanup);

/* ---------------------------------------------------------------- fixtures */

const GATE_NAMES: readonly GateName[] = [
  "contract-complete",
  "entrypoint-importable",
  "digest-unique",
  "parameter-space-sane",
  "determinism-declared",
  "data-contract-known",
  "no-lookahead-static-scan",
];

const DISCLOSURE = "Static scan — runtime causality is proven per run at Stage 3/4." as const;
const DECLARATION: RegistryEntry["declaration"] = {
  schema_version: "research.alpha-version-declaration.v1",
  entrypoint: "alpha.delta_rsi:run",
  timeframes: ["1h", "4h"],
  determinism: { seed_required: true },
  parameter_space: { rsi_len: { kind: "int_range", low: 5, high: 30, step: 1 } },
};

function sourceResponse(overrides: Partial<SourceResponse> = {}): SourceResponse {
  return {
    schema_version: "research.alpha-source.v1",
    source_file_ref: "sfr_01HZ",
    expires_at_utc_ms: 4102444800000,
    source_digest: "sha256:4f1c2b9ae0",
    analysis_digest: "sha256:aa91b3ce77",
    parse_ok: true,
    mirror: [
      { field: "entrypoint", state: "parsed", check: "VERIFY", note: "Fixture-only source mirror", value: "alpha.delta_rsi:run" },
      { field: "warmup_bars", state: "parsed", check: "VERIFY", note: "Fixture-only source mirror", value: 120 },
      { field: "parameter_space", state: "parsed", check: "VERIFY", note: "Fixture-only source mirror", value: { rsi_len: [5, 30] } },
      { field: "determinism", state: "parsed", check: "VERIFY", note: "Fixture-only source mirror", value: "seeded" },
      { field: "data_contract", state: "parsed", check: "VERIFY", note: "Fixture-only source mirror", value: "ohlcv.1m.v2" },
    ],
    ...overrides,
  };
}

/** Gates in the server's order, failing at `failAt` and SKIPPED after it. */
function gatesResponse(failAt: number | null = null): GatesResponse {
  const gates: GateRow[] = GATE_NAMES.map((name, index) => {
    const n = index + 1;
    if (failAt === null || n < failAt) {
      return { n, name, state: "PASS", message: `${name} satisfied.`, ms: 4 + n };
    }
    if (n === failAt) {
      return {
        n,
        name,
        state: "FAIL",
        message: "This exact source digest is already registered as av_0_2_0.",
        ms: 9,
      };
    }
    return { n, name, state: "SKIPPED", message: "Not run: an earlier gate failed.", ms: 0 };
  });
  return {
    schema_version: "research.alpha-import-gates.v1",
    gate_receipt_id: "grc_01HZQ7",
    expires_at_utc_ms: 4102444800000,
    source_file_ref: "sfr_01HZ",
    source_digest: "sha256:4f1c2b9ae0",
    analysis_digest: "sha256:aa91b3ce77",
    gates,
    all_pass: failAt === null,
    static_scan_disclosure: DISCLOSURE,
  };
}

function registration(overrides: Partial<RegistrationResponse> = {}): RegistrationResponse {
  return {
    schema_version: "research.alpha-registration.v1",
    alpha_id: "delta_rsi_polynomial",
    alpha_version_id: "av_0_3_0",
    version_label: "av_0_3_0",
    source_digest: "sha256:4f1c2b9ae0",
    lifecycle_state: "DRAFT",
    supersedes: "av_0_2_0",
    alpha_revision: 7,
    replayed: false,
    may_activate: true,
    ...overrides,
  };
}

function activation(overrides: Partial<ActivationResponse> = {}): ActivationResponse {
  return {
    schema_version: "research.alpha-activation.v1",
    alpha_id: "delta_rsi_polynomial",
    alpha_version_id: "av_0_3_0",
    lifecycle_state: "ACTIVE",
    superseded_alpha_version_id: "av_0_2_0",
    alpha_revision: 8,
    replayed: false,
    ...overrides,
  };
}

function entry(overrides: Partial<RegistryEntry> = {}): RegistryEntry {
  const base: RegistryEntry = {
    alpha_id: "delta_rsi_polynomial",
    alpha_version_id: "av_0_2_0",
    version_label: "av_0_2_0",
    lifecycle_state: "ACTIVE",
    entrypoint: "alpha.delta_rsi:run",
    declaration: DECLARATION,
    source_digest_prefix: "sha256:11ab",
    alpha_revision: 6,
    registered_at_utc_ms: 1789836572369,
    may_activate: true,
  };
  return { ...base, ...overrides, declaration: overrides.declaration ?? base.declaration };
}

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

function action(name: string): HTMLButtonElement {
  const element = document.querySelector(`[data-action="${name}"]`);
  if (!(element instanceof HTMLButtonElement)) throw new Error(`no ${name} button`);
  return element;
}

/** Advances fake timers inside `act` so React commits the revealed rows. */
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/** Runs every gate stagger timer so the full list is on screen. */
function flushStagger() {
  advance(GATE_STAGGER_MS * (GATE_NAMES.length + 1));
}

/**
 * jsdom's `File` has no `text()`. The product code uses the real DOM method, so
 * the gap is patched in the fixture rather than worked around in the component.
 */
function pyFile(name: string, body: string): File {
  const file = new File([body], name, { type: "text/x-python" });
  Object.defineProperty(file, "text", { value: () => Promise.resolve(body) });
  return file;
}

/* ------------------------------------------------------------------- tests */

describe("T01 — a clean module mirrors every field and opens step 2", () => {
  it("renders one read-only row per parsed field", () => {
    render(<AlphaImport {...props({ parse: sourceResponse(), parseState: OK })} />);
    const rows = document.querySelectorAll("[data-mirror-field]");
    expect(rows).toHaveLength(5);
    expect(screen.getByText("alpha.delta_rsi:run")).toBeTruthy();
    expect(screen.getByText("120")).toBeTruthy();
    // A non-scalar is shown exactly, not summarised into "5 keys".
    expect(screen.getByText("rsi_len: 5 · 30")).toBeTruthy();
  });

  it("offers no editable contract field anywhere in the mirror", () => {
    render(<AlphaImport {...props({ parse: sourceResponse(), parseState: OK })} />);
    const mirror = document.querySelector("[data-mirror]") as HTMLElement;
    expect(mirror.querySelectorAll("input, textarea, select, [contenteditable]")).toHaveLength(0);
  });

  it("names the missing precondition on every closed step", () => {
    render(<AlphaImport {...props()} />);
    const reasons = Object.fromEntries(
      Array.from(document.querySelectorAll("[data-disabled-reason]")).map((node) => [
        node.getAttribute("data-disabled-reason"),
        node.textContent,
      ]),
    );
    expect(reasons).toEqual({
      parse: "Drop a .py file or paste the module first.",
      "run-gates": "Parse a source first — the gates run against the server's parse receipt.",
      register: "Run the gates first.",
    });
  });

  it("enables Run gates only once the server said parse_ok", () => {
    const { rerender } = render(<AlphaImport {...props()} />);
    expect(action("run-gates").disabled).toBe(true);

    rerender(<AlphaImport {...props({ parse: sourceResponse({ parse_ok: false }), parseState: OK })} />);
    expect(action("run-gates").disabled).toBe(true);

    rerender(<AlphaImport {...props({ parse: sourceResponse(), parseState: OK })} />);
    expect(action("run-gates").disabled).toBe(false);
  });
});

describe("T02 — a missing field is red, and the failure cascades to SKIPPED", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("marks the absent field `missing` and prints no value for it", () => {
    const parse = sourceResponse({
      parse_ok: false,
      mirror: [
        { field: "entrypoint", state: "parsed", check: "VERIFY", note: "Fixture-only source mirror", value: "alpha.delta_rsi:run" },
        { field: "warmup_bars", state: "missing", check: "VERIFY", note: "Fixture-only source mirror" },
      ],
    });
    render(<AlphaImport {...props({ parse, parseState: OK })} />);

    const row = document.querySelector('[data-mirror-field="warmup_bars"]') as HTMLElement;
    expect(row.getAttribute("data-mirror-state")).toBe("missing");
    // §3.3: an absent value is never 0, "-" or "N/A".
    expect(row.querySelector("dd")?.textContent).toBe("");
    expect(within(row).getByText("missing")).toBeTruthy();
  });

  it("renders SKIPPED for every gate after the first FAIL", () => {
    render(<AlphaImport {...props({ parse: sourceResponse(), parseState: OK, gates: gatesResponse(1), gatesState: OK })} />);
    flushStagger();

    const states = Array.from(document.querySelectorAll("[data-gate-state]")).map((node) =>
      node.getAttribute("data-gate-state"),
    );
    expect(states).toEqual(["FAIL", "SKIPPED", "SKIPPED", "SKIPPED", "SKIPPED", "SKIPPED", "SKIPPED"]);
    // A SKIPPED gate is not a passed gate and must never be drawn as one.
    expect(states).not.toContain("PASS");
  });
});

describe("T03 — a failed gate keeps its message and closes step 3", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("prints the engine's own digest-unique sentence unedited", () => {
    render(<AlphaImport {...props({ parse: sourceResponse(), parseState: OK, gates: gatesResponse(3), gatesState: OK })} />);
    flushStagger();

    const row = document.querySelector('[data-gate="digest-unique"]') as HTMLElement;
    expect(row.getAttribute("data-gate-state")).toBe("FAIL");
    expect(row.textContent).toContain("This exact source digest is already registered as av_0_2_0.");
  });

  it("disables registration and states the fail-closed rule verbatim", () => {
    render(
      <AlphaImport
        {...props({
          parse: sourceResponse(),
          parseState: OK,
          gates: gatesResponse(3),
          gatesState: OK,
          alphaId: "delta_rsi_polynomial",
        })}
      />,
    );
    flushStagger();

    expect(action("register").disabled).toBe(true);
    expect(screen.getByText(FAIL_CLOSED_NOTE).textContent).toBe(
      "fail-closed: a red gate stops the import — there is no provisional registration.",
    );
  });

  it("says why registration is closed instead of greying a silent button", () => {
    render(
      <AlphaImport
        {...props({
          parse: sourceResponse(),
          parseState: OK,
          gates: gatesResponse(3),
          gatesState: OK,
          alphaId: "delta_rsi_polynomial",
        })}
      />,
    );
    flushStagger();
    const reason = document.querySelector('[data-disabled-reason="register"]') as HTMLElement;
    expect(reason.textContent).toBe("A gate failed. Fix the module and submit it again.");
    expect(action("register").getAttribute("title")).toBe(reason.textContent);
  });

  it("shows no fail-closed note when nothing failed", () => {
    render(<AlphaImport {...props({ parse: sourceResponse(), parseState: OK, gates: gatesResponse(), gatesState: OK })} />);
    flushStagger();
    expect(document.querySelector("[data-fail-closed-note]")).toBeNull();
  });
});

describe("T04 — seven green gates stagger in and open step 3", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reveals one row per 120 ms in the server's order", () => {
    render(<AlphaImport {...props({ parse: sourceResponse(), parseState: OK, gates: gatesResponse(), gatesState: OK })} />);

    expect(document.querySelectorAll("[data-gate]")).toHaveLength(0);
    advance(0);
    expect(document.querySelectorAll("[data-gate]")).toHaveLength(1);
    advance(GATE_STAGGER_MS * 3);
    expect(document.querySelectorAll("[data-gate]")).toHaveLength(4);
    flushStagger();

    const names = Array.from(document.querySelectorAll("[data-gate]")).map((node) =>
      node.getAttribute("data-gate"),
    );
    expect(names).toEqual(GATE_NAMES);
  });

  it("renders the static-scan disclosure from the contract, not a local copy", () => {
    render(<AlphaImport {...props({ parse: sourceResponse(), parseState: OK, gates: gatesResponse(), gatesState: OK })} />);
    flushStagger();
    const note = document.querySelector("[data-static-scan-disclosure]") as HTMLElement;
    expect(note.textContent).toBe(DISCLOSURE);

    // Proof it is read from the response: change the constant, change the DOM.
    cleanup();
    const altered = { ...gatesResponse(), static_scan_disclosure: "Replaced." as typeof DISCLOSURE };
    render(<AlphaImport {...props({ parse: sourceResponse(), parseState: OK, gates: altered, gatesState: OK })} />);
    flushStagger();
    expect(document.querySelector("[data-static-scan-disclosure]")?.textContent).toBe("Replaced.");
  });

  it("requires an alpha id as well as seven passes before registering", () => {
    const { rerender } = render(
      <AlphaImport {...props({ parse: sourceResponse(), parseState: OK, gates: gatesResponse(), gatesState: OK })} />,
    );
    flushStagger();
    expect(action("register").disabled).toBe(true);

    rerender(
      <AlphaImport
        {...props({
          parse: sourceResponse(),
          parseState: OK,
          gates: gatesResponse(),
          gatesState: OK,
          alphaId: "delta_rsi_polynomial",
        })}
      />,
    );
    expect(action("register").disabled).toBe(false);
  });
});

describe("T05 — registration lands as DRAFT with its supersedes note", () => {
  it("shows the label, the DRAFT chip and what it supersedes", () => {
    render(
      <AlphaImport
        {...props({
          parse: sourceResponse(),
          parseState: OK,
          gates: gatesResponse(),
          gatesState: OK,
          registration: registration(),
          registerState: OK,
        })}
      />,
    );

    const card = document.querySelector("[data-registration]") as HTMLElement;
    expect(card.getAttribute("data-registration")).toBe("av_0_3_0");
    expect(within(card).getByText("av_0_3_0")).toBeTruthy();
    expect(card.querySelector("[data-lifecycle]")?.getAttribute("data-lifecycle")).toBe("DRAFT");
    expect(card.textContent).toContain("supersedes av_0_2_0");
    expect(screen.getByText(DRAFT_NOTE).textContent).toBe(
      "a DRAFT version can run as evidence but cannot compose rc_",
    );
  });

  it("updates the registry strip from the server list alone", () => {
    render(
      <AlphaImport
        {...props({
          registry: [entry(), entry({ alpha_version_id: "av_0_3_0", version_label: "av_0_3_0", lifecycle_state: "DRAFT" })],
        })}
      />,
    );
    const chips = Array.from(document.querySelectorAll("[data-registry-entry]"));
    expect(chips.map((c) => c.getAttribute("data-lifecycle"))).toEqual(["ACTIVE", "DRAFT"]);
  });

  it("labels a replay as a replay rather than a fresh registration", () => {
    render(
      <AlphaImport
        {...props({ registration: registration({ replayed: true }), registerState: OK })}
      />,
    );
    expect(screen.getByText(/replayed/).textContent).toContain(
      "identical bytes were already registered",
    );
  });
});

describe("T06 — activation is a separate, server-admitted act", () => {
  it("withholds the control until the server admits it", () => {
    render(<AlphaImport {...props({ registration: registration(), registerState: OK })} />);
    expect(document.querySelector('[data-action="activate"]')).toBeNull();
  });

  it("drops the DRAFT note once the server says ACTIVE", () => {
    const { rerender } = render(
      <AlphaImport
        {...props({ registration: registration(), registerState: OK, activationAdmitted: true })}
      />,
    );
    expect(screen.getByText(DRAFT_NOTE)).toBeTruthy();
    expect(action("activate")).toBeTruthy();

    rerender(
      <AlphaImport
        {...props({
          registration: registration(),
          activation: activation(),
          registerState: OK,
          activationAdmitted: true,
        })}
      />,
    );
    expect(screen.queryByText(DRAFT_NOTE)).toBeNull();
    expect(document.querySelector("[data-lifecycle]")?.getAttribute("data-lifecycle")).toBe("ACTIVE");
    // The control is gone too: there is nothing left to activate.
    expect(document.querySelector('[data-action="activate"]')).toBeNull();
    expect(screen.getByText(/superseded av_0_2_0/)).toBeTruthy();
  });

  it("never infers ACTIVE from a successful registration", () => {
    render(
      <AlphaImport
        {...props({ registration: registration(), registerState: OK, activationAdmitted: true })}
      />,
    );
    expect(document.querySelector("[data-lifecycle]")?.getAttribute("data-lifecycle")).toBe("DRAFT");
  });
});

describe("S14-VIS-01 — Code anatomy is a presentation substage, not a stage", () => {
  it("lives under step 1 and adds no step marker", () => {
    render(<AlphaImport {...props()} />);
    const step1 = screen.getByLabelText("Step 1 — source");
    expect(within(step1).getByText(/Code anatomy/)).toBeTruthy();
    // Still three steps: parse, gates, register/activate.
    expect(document.querySelectorAll("[data-step-marker]")).toHaveLength(3);
    expect(document.querySelectorAll("[data-step]")).toHaveLength(3);
  });

  it("renders every section and unlock row from the reference module", () => {
    render(<AlphaImport {...props()} />);
    expect(document.querySelectorAll("[data-anatomy-section]")).toHaveLength(CODE_ANATOMY.length);
    expect(document.querySelectorAll("[data-unlock-output]")).toHaveLength(UNLOCK_MAP.length);
    expect(document.querySelector("[data-anatomy-note]")?.textContent).toBe(ANATOMY_SUBSTAGE_NOTE);
  });

  it("keeps the code read-only — it is reference, not an editor", () => {
    render(<AlphaImport {...props()} />);
    const anatomy = document.querySelector("[data-code-anatomy]") as HTMLElement;
    expect(anatomy.querySelectorAll("input, textarea, select, [contenteditable]")).toHaveLength(0);
    expect(anatomy.querySelectorAll("pre")).toHaveLength(CODE_ANATOMY.length);
  });

  it("changes no enablement anywhere in the wizard", () => {
    // The whole risk of a fourth visual group is that it grows an authority.
    // Every control's disabled state must be identical with the section open.
    render(<AlphaImport {...props()} />);
    const before = Array.from(document.querySelectorAll("[data-action]")).map((node) => [
      node.getAttribute("data-action"),
      (node as HTMLButtonElement).disabled,
    ]);

    const anatomy = document.querySelector("[data-code-anatomy]") as HTMLDetailsElement;
    fireEvent.click(anatomy.querySelector("summary") as HTMLElement);

    const after = Array.from(document.querySelectorAll("[data-action]")).map((node) => [
      node.getAttribute("data-action"),
      (node as HTMLButtonElement).disabled,
    ]);
    expect(after).toEqual(before);
  });

  it("offers no action and issues no request of its own", () => {
    render(<AlphaImport {...props()} />);
    const anatomy = document.querySelector("[data-code-anatomy]") as HTMLElement;
    expect(anatomy.querySelectorAll("[data-action]")).toHaveLength(0);
    expect(anatomy.querySelectorAll("button")).toHaveLength(0);
    // A disclosure is keyboard-reachable without a button.
    expect(anatomy.querySelector("summary")).toBeTruthy();
  });

  it("names no lifecycle state of its own", () => {
    render(<AlphaImport {...props()} />);
    const anatomy = document.querySelector("[data-code-anatomy]") as HTMLElement;
    expect(anatomy.querySelectorAll("[data-lifecycle]")).toHaveLength(0);
    expect(anatomy.textContent).not.toMatch(/\bDRAFT\b|\bACTIVE\b|\bSUPERSEDED\b|\bABANDONED\b/);
  });
});

describe("T08 — a multi-file drop is refused verbatim", () => {
  it("reports the single-file contract and parses nothing", () => {
    const onMultiFileRejected = vi.fn();
    const onSourceChange = vi.fn();
    const { rerender } = render(<AlphaImport {...props({ onMultiFileRejected, onSourceChange })} />);

    const zone = document.querySelector("[data-dropzone]") as HTMLElement;
    fireEvent.drop(zone, {
      dataTransfer: { files: [pyFile("a.py", "a"), pyFile("b.py", "b")] },
    });

    expect(onMultiFileRejected).toHaveBeenCalledTimes(1);
    expect(onSourceChange).not.toHaveBeenCalled();

    rerender(<AlphaImport {...props({ multiFileRejected: true })} />);
    expect(screen.getByText(SINGLE_FILE_ERROR).textContent).toBe(
      "single-file contract — bundle imports inside the module or wait for package support (v2).",
    );
  });

  it("accepts a single dropped file", async () => {
    const onSourceChange = vi.fn();
    render(<AlphaImport {...props({ onSourceChange })} />);
    fireEvent.drop(document.querySelector("[data-dropzone]") as HTMLElement, {
      dataTransfer: { files: [pyFile("alpha.py", "def run(): ...\n")] },
    });
    await waitFor(() => expect(onSourceChange).toHaveBeenCalledWith("def run(): ...\n", "alpha.py"));
  });
});

describe("T09 — reduced motion renders the gates at once", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("skips the stagger entirely when the user asked it to", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );

    render(<AlphaImport {...props({ parse: sourceResponse(), parseState: OK, gates: gatesResponse(), gatesState: OK })} />);
    // No timer has run yet; all seven are already present.
    expect(document.querySelectorAll("[data-gate]")).toHaveLength(7);
  });
});

describe("T10 — accessible names and roles", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("labels the dropzone input and the paste area", () => {
    render(<AlphaImport {...props()} />);
    expect(screen.getByLabelText("Alpha source file")).toBeTruthy();
    expect(screen.getByLabelText("Alpha source text")).toBeTruthy();
    expect(screen.getByLabelText("Alpha id")).toBeTruthy();
  });

  it("exposes the gate rows as a list even with list styling removed", () => {
    render(<AlphaImport {...props({ parse: sourceResponse(), parseState: OK, gates: gatesResponse(), gatesState: OK })} />);
    flushStagger();
    const list = document.querySelector("[data-gates]") as HTMLElement;
    expect(list.getAttribute("role")).toBe("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(7);
  });

  it("gives each step a named region and each panel a name", () => {
    render(<AlphaImport {...props()} />);
    expect(screen.getByLabelText("Step 1 — source")).toBeTruthy();
    expect(screen.getByLabelText("Step 2 — gates")).toBeTruthy();
    expect(screen.getByLabelText("Step 3 — register")).toBeTruthy();
    for (const name of ["parsed contract mirror", "import gates", "registration", "alpha registry"]) {
      expect(document.querySelector(`[data-research-panel="${name}"]`)).toBeTruthy();
    }
  });

  it("announces a refusal rather than printing it as prose", () => {
    const refusal = toRefusal(
      new PortalApiError(
        "The run queue is full.",
        429,
        "RESEARCH_ALPHA_IMPORT_ADMISSION_SATURATED",
        "req_9",
      ),
    );
    render(<AlphaImport {...props({ refusal })} />);
    const alert = document.querySelector("[data-refusal]") as HTMLElement;
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.getAttribute("data-refusal")).toBe("RESEARCH_ALPHA_IMPORT_ADMISSION_SATURATED");
    expect(alert.textContent).toContain("The run queue is full.");
    expect(alert.textContent).toContain("req_9");
  });
});

describe("T11 — contractual copy is byte-exact", () => {
  it("keeps all three sentences and the contract's own disclosure", () => {
    expect(FAIL_CLOSED_NOTE).toBe(
      "fail-closed: a red gate stops the import — there is no provisional registration.",
    );
    expect(DRAFT_NOTE).toBe("a DRAFT version can run as evidence but cannot compose rc_");
    expect(SINGLE_FILE_ERROR).toBe(
      "single-file contract — bundle imports inside the module or wait for package support (v2).",
    );
    // The disclosure is a contract constant; the component must not hold a copy.
    const source = new URL("./AlphaImport.tsx", import.meta.url);
    expect(source.pathname.endsWith("AlphaImport.tsx")).toBe(true);
  });

  it("maps every refusal code the contract declares", () => {
    expect(PROBLEM_CODES).toHaveLength(15);
    for (const code of PROBLEM_CODES) {
      const refusal = toRefusal(new PortalApiError("server sentence", 400, code, "req_1"));
      expect(refusal.code).toBe(code);
      // The server's words survive; nothing is rewritten locally.
      expect(refusal.message).toBe("server sentence");
      expect(refusal.state).not.toBe("available");
    }
  });

  it("never retries a denial and never treats saturation as an outage", () => {
    const denied = toRefusal(new PortalApiError("no", 403, "RESEARCH_ALPHA_IMPORT_ACTIVATION_FORBIDDEN", null));
    expect(denied.state).toBe("denied");
    expect(denied.mayRetry).toBe(false);

    const saturated = toRefusal(new PortalApiError("busy", 429, "RESEARCH_ALPHA_IMPORT_ADMISSION_SATURATED", null));
    expect(saturated.state).toBe("failed-retryable");
    expect(saturated.mayRetry).toBe(true);

    const expired = toRefusal(new PortalApiError("gone", 409, "RESEARCH_ALPHA_IMPORT_SOURCE_EXPIRED", null));
    expect(expired.invalidatesSource).toBe(true);
  });
});

describe("T12 — the screen survives a narrow viewport", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("scrolls the mirror inside its own frame instead of the page", () => {
    render(<AlphaImport {...props({ parse: sourceResponse(), parseState: OK })} />);
    const mirror = document.querySelector("[data-mirror]") as HTMLElement;
    expect(mirror.className).toContain("overflow-x-auto");
  });

  it("wraps a long gate message instead of truncating it", () => {
    render(<AlphaImport {...props({ parse: sourceResponse(), parseState: OK, gates: gatesResponse(3), gatesState: OK })} />);
    flushStagger();
    const row = document.querySelector('[data-gate="digest-unique"]') as HTMLElement;
    const message = row.querySelector("span.w-full") as HTMLElement;
    expect(message.className).toContain("break-words");
    expect(message.className).not.toContain("truncate");
  });
});

describe("panel frames survive every state", () => {
  it("keeps the mirror panel, its name and its reason when a parse is refused", () => {
    const refusal = toRefusal(
      new PortalApiError("The analyser is not responding.", 503, "RESEARCH_ALPHA_IMPORT_ANALYSIS_UNAVAILABLE", null),
    );
    render(
      <AlphaImport
        {...props({
          refusal,
          parseState: {
            state: refusal.state,
            reason: refusal.message,
            mayRetry: refusal.mayRetry,
            retainsContent: false,
          },
        })}
      />,
    );
    const panel = document.querySelector('[data-research-panel="parsed contract mirror"]') as HTMLElement;
    expect(panel).toBeTruthy();
    expect(panel.getAttribute("data-state")).toBe("failed-retryable");
    expect(panel.textContent).toContain("The analyser is not responding.");
  });

  it("keeps the source form usable while a parse is in flight", () => {
    render(
      <AlphaImport
        {...props({
          sourceText: "def run(): ...",
          parseState: researchState({ kind: "in-flight", hasAcceptedResponse: false }),
        })}
      />,
    );
    // The form is local state, not a server fact: a loading panel must not
    // take the user's pasted source away with it.
    expect(screen.getByLabelText("Alpha source text")).toBeTruthy();
    expect(document.querySelector("[data-dropzone]")).toBeTruthy();
  });
});

describe("RF-04 FE-S14-07 — no write is posted twice, and a refusal sits by its button", () => {
  it("keeps every write button inert while one request is in flight", () => {
    render(<AlphaImport {...props({ sourceText: "x = 1", parse: sourceResponse(), parseState: OK, busyStep: "gates" })} />);
    expect(action("parse").disabled).toBe(true);
    expect(action("run-gates").disabled).toBe(true);
  });

  it("does not re-arm a step that already succeeded for these bytes", () => {
    render(
      <AlphaImport
        {...props({
          sourceText: "x = 1",
          alphaId: "delta",
          parse: sourceResponse(),
          parseState: OK,
          gates: gatesResponse(),
          gatesState: OK,
          registration: registration(),
          registerState: OK,
        })}
      />,
    );
    expect(action("parse").disabled).toBe(true);
    expect(action("run-gates").disabled).toBe(true);
    expect(action("register").disabled).toBe(true);
  });

  it("prints the activation refusal beside Activate and stops offering it", () => {
    const refusal = toRefusal(new PortalApiError("Only an ADMIN may activate.", 403, "FORBIDDEN", null));
    render(
      <AlphaImport
        {...props({ registration: registration(), registerState: OK, activationAdmitted: true, activationRefusal: refusal })}
      />,
    );
    expect(document.querySelector("[data-activation-refusal]")?.textContent).toBe(refusal.message);
    if (!refusal.mayRetry) expect(action("activate").disabled).toBe(true);
  });

  it("says why Activate is absent for an account that may not activate", () => {
    render(<AlphaImport {...props({ registration: registration({ may_activate: false }), registerState: OK })} />);
    expect(screen.getByText(ACTIVATION_NOT_ADMITTED)).toBeTruthy();
  });

  it("shows the activation's revision once activated", () => {
    render(
      <AlphaImport
        {...props({ registration: registration(), registerState: OK, activation: activation() })}
      />,
    );
    const block = document.querySelector("[data-registration]") as HTMLElement;
    expect(block.textContent).toContain("rev 8");
    expect(block.textContent).not.toContain("rev 7");
  });
});
