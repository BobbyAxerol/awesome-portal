/**
 * Screen 14 — Batch F1 honesty rows (audit 2026-09-30).
 *
 *  - CG-FG-S14-02  the activation reason is the server's `may_activate_reason`, not a guess;
 *  - CG-FG-S14-03  the "new run with this av_" slot follows the served `run_admission`;
 *  - 14-09         the "signed publication" row prints the served `import_attestation`;
 *  - 14-21/22 + S14-C1  a 403 and a 404 are one neutral sentence; the origin 403 is not "invalid".
 *
 * Every server object is the canonical contract fixture with only the fields a
 * case needs changed (never a hand-built body); the enums are read from the
 * contract schema so a code added there fails here.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ACTIVATION_NOT_PERMITTED,
  ACTIVATION_REASON_COPY,
  AlphaImport,
  RUN_ADMISSION_COPY,
  REGISTRATION_ABSENT,
  RUN_LINK_LABEL,
  activationNotPermitted,
  awaitingStep,
  newRunHref,
  runSlot,
  type AlphaImportProps,
} from "./AlphaImport";
import {
  IMPORT_FORBIDDEN,
  IMPORT_INVALID,
  IMPORT_ORIGIN_REFUSED,
  toRefusal,
  type GatesResponse,
  type RegistrationResponse,
  type RegistryEntry,
  type RegistryListResponse,
  type SourceResponse,
} from "./alphaImportClient";
import { PortalApiError } from "../lib/api";
import { researchState } from "./state";

afterEach(cleanup);

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const fixture = <T,>(name: string): T =>
  JSON.parse(readFileSync(join(ROOT, "packages/contracts/fixtures", `research-alpha-import.${name}.valid.json`), "utf8")) as T;
const SCHEMA = JSON.parse(readFileSync(join(ROOT, "packages/contracts/schemas/research-alpha-import.v1.schema.json"), "utf8")) as {
  $defs: Record<string, { properties?: Record<string, { enum?: (string | null)[]; properties?: Record<string, { enum?: (string | null)[] }> }> }>;
};

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

/** The canonical registry row with only the named fields changed. */
function entry(overrides: Partial<RegistryEntry>): RegistryEntry {
  return { ...ENTRY, ...overrides };
}

const q = (selector: string) => document.querySelector(selector) as HTMLElement | null;
const text = () => document.body.textContent ?? "";

/* ------------------------------------------------------- CG-FG-S14-02 */

describe("CG-FG-S14-02 — the activation reason is the server's", () => {
  it("covers every may_activate_reason the contract declares", () => {
    const declared = SCHEMA.$defs.RegistryEntry.properties!.may_activate_reason.enum!.filter((code): code is string => code !== null);
    expect(Object.keys(ACTIVATION_REASON_COPY).sort()).toEqual([...declared].sort());
  });

  it("names no cause when the server served none", () => {
    expect(activationNotPermitted(null)).toEqual({ sentence: ACTIVATION_NOT_PERMITTED, code: null });
    expect(activationNotPermitted(undefined).code).toBeNull();
  });

  it.each([
    ["ROLE_NOT_ADMIN", "needs a workspace ADMIN"],
    ["VERSION_NOT_IMPORTED", "not an imported version"],
    ["VERSION_NOT_ACTIVATABLE", "this version cannot be activated"],
  ] as const)("a DRAFT registry row prints %s and its code", (reason, sentence) => {
    const draft = entry({ lifecycle_state: "DRAFT", may_activate: false, may_activate_reason: reason });
    render(<AlphaImport {...registered({ registry: [draft] })} />);
    const line = q("[data-activation-not-permitted]")!;
    expect(line.textContent).toBe(`${ACTIVATION_NOT_PERMITTED} — ${sentence} · ${reason}`);
    expect(within(line).getByText(reason).className).toContain("mono");
    expect(line.querySelector("[data-activation-reason]")?.getAttribute("data-activation-reason")).toBe(reason);
  });

  it("a DRAFT row with no served reason says 'not permitted' and never ADMIN", () => {
    const draft = entry({ lifecycle_state: "DRAFT", may_activate: false, may_activate_reason: null });
    render(<AlphaImport {...registered({ registry: [draft], registration: { ...REGISTRATION, may_activate: false, may_activate_reason: null }, activationAdmitted: false })} />);
    const lines = Array.from(document.querySelectorAll("[data-activation-not-permitted], [data-activation-not-admitted]"));
    expect(lines).toHaveLength(2);
    // The absence is stated in the tooltip, not as a second clause on the page.
    for (const line of lines) {
      expect(line.textContent).toBe(ACTIVATION_NOT_PERMITTED);
      expect(line.querySelector("[title]")?.getAttribute("title")).toBe("reason not published");
    }
    expect(text()).not.toMatch(/workspace ADMIN|can register a draft but not activate/);
  });

  it("the registration's own reason is printed on step 3 when the account may not activate", () => {
    const registration: RegistrationResponse = { ...REGISTRATION, may_activate: false, may_activate_reason: "ROLE_NOT_ADMIN" };
    render(<AlphaImport {...registered({ registration, activationAdmitted: false })} />);
    expect(q("[data-activation-not-admitted]")!.textContent).toBe(`${ACTIVATION_NOT_PERMITTED} — needs a workspace ADMIN · ROLE_NOT_ADMIN`);
  });

  it("does not call a permitted account 'not permitted' when only the handler is missing", () => {
    // may_activate true, no onActivateEntry: read-only view. The old branch printed the ADMIN sentence here.
    render(<AlphaImport {...registered({ registry: [entry({ lifecycle_state: "DRAFT", may_activate: true, may_activate_reason: null })] })} />);
    expect(q("[data-activation-not-permitted]")).toBeNull();
    expect(text()).not.toContain(ACTIVATION_NOT_PERMITTED);
  });
});

/* ------------------------------------------------------- CG-FG-S14-03 */

describe("CG-FG-S14-03 / 14-12 — the run slot follows the served run_admission", () => {
  it("covers every run_admission code the contract declares", () => {
    const declared = SCHEMA.$defs.RegistryEntry.properties!.run_admission.properties!.code.enum!.filter((code): code is string => code !== null);
    expect(Object.keys(RUN_ADMISSION_COPY).sort()).toEqual([...declared].sort());
  });

  it("shows no slot, no link and no reason before anything is registered", () => {
    render(<AlphaImport {...props({ registry: REGISTRY.entries })} />);
    expect(q("[data-absent-action='new-run']")).toBeNull();
    expect(q("[data-run-admission]")).toBeNull();
    expect(q("[data-run-not-admitted]")).toBeNull();
    expect(text()).not.toContain(RUN_LINK_LABEL);
    expect(runSlot(null, ENTRY)).toEqual({ kind: "none" });
    // The rest of "where it goes next" is unchanged.
    expect(q("[data-where-next]")!.textContent).toContain("Not registered.");
  });

  it("links to New Run bound to this version when the server admits a run", () => {
    const admitted = entry({ lifecycle_state: "ACTIVE", run_admission: { may_create_run: true, code: null } });
    render(<AlphaImport {...registered({ registry: [admitted] })} />);
    const link = q("a[data-run-admission='admitted']") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(newRunHref(ENTRY.alpha_id, ENTRY.alpha_version_id));
    expect(link.getAttribute("href")).toBe("/research/quantbt/runs/new?alpha=alpha-demo&av=av_alpha_demo_0_3_0");
    expect(link.textContent).toBe(`${RUN_LINK_LABEL} →`);
    expect(q("[data-absent-action='new-run']")).toBeNull();
    expect(q("[data-run-not-admitted]")).toBeNull();
  });

  it.each(Object.keys(RUN_ADMISSION_COPY) as (keyof typeof RUN_ADMISSION_COPY)[])("a refusal with %s prints its sentence and its code, as a non-link", (code) => {
    const refused = entry({ run_admission: { may_create_run: false, code } });
    render(<AlphaImport {...registered({ registry: [refused] })} />);
    const slot = q("[data-absent-action='new-run']")!;
    expect(slot.tagName).toBe("SPAN");
    expect(slot.getAttribute("data-absent-code")).toBe(code);
    expect(q("a[data-run-admission='admitted']")).toBeNull();
    expect(q("[data-run-not-admitted]")!.textContent).toBe(`${RUN_ADMISSION_COPY[code]} · ${code}`);
  });

  it("a refusal that carries no code says so and prints no code", () => {
    render(<AlphaImport {...registered({ registry: [entry({ run_admission: { may_create_run: false, code: null } })] })} />);
    expect(q("[data-run-not-admitted]")!.textContent).toBe("Not admitted");
  });

  it("a registry row with no run_admission is 'not published', not a refusal and not a link", () => {
    const { run_admission: _omit, ...without } = ENTRY;
    void _omit;
    render(<AlphaImport {...registered({ registry: [without as RegistryEntry] })} />);
    expect(q("[data-absent-action='new-run']")!.getAttribute("data-absent-code")).toBe("NOT_PUBLISHED");
    expect(q("[data-run-not-admitted]")!.textContent).toBe("run admission — not published");
    expect(q("a[data-run-admission]")).toBeNull();
  });

  it("a registry that has not returned the version is 'not read yet', not a refusal", () => {
    render(<AlphaImport {...registered({ registry: [] })} />);
    expect(q("[data-absent-action='new-run']")!.getAttribute("data-absent-code")).toBe("REGISTRY_NOT_READ");
    expect(q("[data-run-not-admitted]")!.textContent).toContain("not read yet");
  });

  it("never prints OL-01 or the old 'Not admitted yet' sentence in any state", () => {
    const states = [
      props(),
      registered(),
      registered({ registry: [] }),
      registered({ registry: [entry({ run_admission: { may_create_run: true, code: null } })] }),
    ];
    for (const state of states) {
      const { unmount } = render(<AlphaImport {...state} />);
      expect(text()).not.toMatch(/OL-01|Not admitted yet|no installed executor for an imported version/);
      unmount();
    }
  });
});

/* ---------------------------------------------------------------- 14-09 */

describe("14-09 — the signed-publication row prints the served attestation", () => {
  const row = () => q("[data-reg-row='signed publication']")!;

  it("prints each part's served state and reason code from the canonical registration", () => {
    expect(REGISTRATION.import_attestation).toBeTruthy();
    render(<AlphaImport {...registered()} />);
    const att = REGISTRATION.import_attestation!;
    expect(row().querySelector("[data-attestation-part='signature']")!.textContent).toBe(`signature not published · ${att.signature.reason_code}`);
    expect(row().querySelector("[data-attestation-part='sbom']")!.textContent).toBe(`SBOM not published · ${att.sbom.reason_code}`);
    expect(att.signature.reason_code).toBe("RESEARCH_ALPHA_IMPORT_SIGNATURE_NOT_PRODUCED");
    expect(att.sbom.reason_code).toBe("RESEARCH_ALPHA_IMPORT_SBOM_NOT_PRODUCED");
    expect(row().getAttribute("title")).toBe(`scope ${att.scope}`);
    expect(row().querySelector("dd")!.getAttribute("data-absent")).toBe(att.signature.reason_code);
  });

  it("falls back to the registry row's attestation when the registration carries none", () => {
    const { import_attestation: _omit, ...bare } = REGISTRATION;
    void _omit;
    render(<AlphaImport {...registered({ registration: bare as RegistrationResponse })} />);
    expect(row().textContent).toContain(ENTRY.import_attestation!.signature.reason_code);
  });

  it("with no attestation anywhere it says none was served — and asserts no fact of its own", () => {
    const { import_attestation: _a, ...bare } = REGISTRATION;
    const { import_attestation: _b, ...bareEntry } = ENTRY;
    void _a;
    void _b;
    render(<AlphaImport {...registered({ registration: bare as RegistrationResponse, registry: [bareEntry as RegistryEntry] })} />);
    expect(row().querySelector("dd")!.getAttribute("data-absent")).toBe(REGISTRATION_ABSENT.attestationNotServed.code);
    expect(row().textContent).toBe(`signed publication${REGISTRATION_ABSENT.attestationNotServed.text}`);
    expect(text()).not.toMatch(/no signature or SBOM is produced|not part of registration/);
  });
});

/* ------------------------------------------------ 14-21/22 + S14-C1 */

describe("14-21/22 — a 403 and a 404 read the same", () => {
  const ERRORS = [
    ["404 source not found", new PortalApiError("Workspace not found.", 404, "RESEARCH_ALPHA_IMPORT_SOURCE_NOT_FOUND", "req_404")],
    ["403 activation forbidden", new PortalApiError("Only a Research workspace administrator may activate an AlphaVersion.", 403, "RESEARCH_ALPHA_IMPORT_ACTIVATION_FORBIDDEN", "req_403")],
    ["403 with no code", new PortalApiError("nope", 403, null, "req_403b")],
    ["404 with no code", new PortalApiError("nope", 404, null, "req_404b")],
  ] as const;

  it.each(ERRORS)("%s resolves to the one F-04 sentence, marked neutral", (_label, error) => {
    const refusal = toRefusal(error);
    expect(refusal.neutral).toBe(true);
    expect(refusal.message).toBe(IMPORT_FORBIDDEN);
  });

  it("renders the same surface for 403 and 404, with the code only in the tooltip", () => {
    const surface = (refusal: ReturnType<typeof toRefusal>) => {
      const { unmount } = render(<AlphaImport {...props({ refusal })} />);
      const alert = q("[role='alert'][data-refusal]")!;
      const result = { visible: alert.textContent ?? "", attr: alert.getAttribute("data-refusal"), tip: alert.getAttribute("title") ?? "" };
      unmount();
      return result;
    };
    const notFound = surface(toRefusal(ERRORS[0][1]));
    const forbidden = surface(toRefusal(ERRORS[1][1]));
    expect(notFound.visible).toBe(forbidden.visible);
    expect(notFound.attr).toBe(forbidden.attr);
    expect(notFound.visible).toBe(IMPORT_FORBIDDEN);
    expect(notFound.visible).not.toMatch(/RESEARCH_|request req_|http 40/);
    // Diagnostics stay reachable.
    expect(notFound.tip).toContain("RESEARCH_ALPHA_IMPORT_SOURCE_NOT_FOUND");
    expect(notFound.tip).toContain("req_404");
    expect(forbidden.tip).toContain("RESEARCH_ALPHA_IMPORT_ACTIVATION_FORBIDDEN");
  });

  it("keeps the code of a refusal the reader can act on in the tooltip, once", () => {
    const refusal = toRefusal(new PortalApiError("busy", 503, "RESEARCH_ALPHA_IMPORT_ADMISSION_SATURATED", "req_9"));
    expect(refusal.neutral).toBe(false);
    render(<AlphaImport {...props({ refusal })} />);
    const alerts = document.querySelectorAll("[role='alert'][data-refusal]");
    expect(alerts).toHaveLength(1);
    const alert = alerts[0] as HTMLElement;
    expect(alert.getAttribute("data-refusal")).toBe("RESEARCH_ALPHA_IMPORT_ADMISSION_SATURATED");
    expect(alert.textContent).toBe("Queue full. Try again.");
    expect(alert.getAttribute("title")).toContain("RESEARCH_ALPHA_IMPORT_ADMISSION_SATURATED");
  });
});

describe("S14-C1 — the origin refusal does not misdescribe its cause", () => {
  const origin = new PortalApiError("Request origin is not allowed.", 403, "RESEARCH_ALPHA_IMPORT_INVALID", "req_o");
  const csrf = new PortalApiError("CSRF token is invalid.", 403, "RESEARCH_ALPHA_IMPORT_INVALID", "req_c");

  it.each([["origin", origin], ["CSRF", csrf]] as const)("a 403 INVALID (%s check) says the request was refused, not that the import is invalid", (_label, error) => {
    const refusal = toRefusal(error);
    expect(refusal.message).toBe(IMPORT_ORIGIN_REFUSED);
    // VD-F1-01 (Bobby, 2026-10-01): exactly this sentence; it names no cause, so neither "origin" nor "CSRF" appears.
    expect(refusal.message).toBe("Request refused.");
    expect(refusal.origin).toBe(true);
    expect(refusal.message).not.toMatch(/origin|csrf|RESEARCH_/i);
    expect(refusal.codeInDetails).toBe(true);
    expect(refusal.message).not.toMatch(/not valid|invalid|source/i);
    expect(refusal.neutral).toBe(false);
    expect(refusal.detail).toBe(error.message);
  });

  it("prints the refusal once, with one Reload action; the …_INVALID code and request id ride in the tooltip", () => {
    render(<AlphaImport {...props({ refusal: toRefusal(origin) })} />);
    const alerts = document.querySelectorAll("[role='alert'][data-refusal]");
    expect(alerts).toHaveLength(1);
    const alert = alerts[0] as HTMLElement;
    expect(alert.textContent).toBe(`${IMPORT_ORIGIN_REFUSED}Reload`);
    expect(document.body.textContent?.split(IMPORT_ORIGIN_REFUSED).length).toBe(2);
    expect(alert.getAttribute("title")).toContain("RESEARCH_ALPHA_IMPORT_INVALID");
    expect(alert.getAttribute("title")).toContain("req_o");
    expect(within(alert).getByRole("button", { name: "Reload" })).toBeTruthy();
  });

  it("a non-origin refusal offers no Reload", () => {
    render(<AlphaImport {...props({ refusal: toRefusal(new PortalApiError("x", 400, "RESEARCH_ALPHA_IMPORT_INVALID", null)) })} />);
    expect(screen.queryByRole("button", { name: "Reload" })).toBeNull();
  });

  it("a 400 INVALID is still an invalid import", () => {
    const refusal = toRefusal(new PortalApiError("Invalid Alpha import request.", 400, "RESEARCH_ALPHA_IMPORT_INVALID", "req_i"));
    expect(refusal.message).toBe(IMPORT_INVALID);
  });
});
