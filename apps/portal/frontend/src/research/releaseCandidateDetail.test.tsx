/**
 * P21 consumer tests — Screen 11 Release Candidate (S11-U01…).
 *
 * The claims that carry this phase:
 *
 *  - **The server composes; the screen prints.** Rail, taxonomy, verdict, the
 *    12 pack rows, their counts, the 17 fields and the seal gate are printed
 *    as sent — the counter is the server's even when it disagrees with rows.
 *  - **Writes are fenced and explicit.** A save sends the revision and source
 *    fingerprint in hand; a seal sends the persisted draft; neither fires on
 *    its own, and a refusal never loses the text the reader typed.
 *  - **Local seal ≠ publish.** Publish and the approval-inbox mirror are P22
 *    ghosts with nothing interactive inside them.
 *  - **Refusals are neutral.** 403 and 404 say the same sentence and take the
 *    same state; the server's prose is never rendered.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ALPHA360_TITLE,
  CEILING_TITLE,
  ENGCERT_TITLE,
  MIRROR_NOTE,
  NOT_PUBLISHABLE_BADGE,
  RC_PANELS,
  RC_RULES,
  RC_SUBTITLE,
  RC_TITLE,
  SEAL_LABEL,
  SEAL_SENTENCE,
  SEALED_REPLAY,
  SOD_NOTE,
  STATUS_TITLE,
} from "./ReleaseCandidateDetail";
import { ReleaseCandidatePackRoute, ReleaseCandidateRoute } from "./ReleaseCandidateRoute";
import {
  RC_CONFLICT_COPY,
  RC_DENIED_COPY,
  RC_NEUTRAL_REFUSAL,
  RC_NOT_PUBLISHABLE_COPY,
  RC_UNAVAILABLE_COPY,
  yamlText,
  type RcCompose,
  type RcField,
  type RcPack,
  type RcPackItem,
  type RcSealResponse,
} from "./releaseCandidateClient";

vi.mock("../auth/authApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../auth/authApi")>()),
  csrfTokenFromCookie: () => "tok_123",
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/* ---------------------------------------------------------------- fixtures */

/*
 * Shapes, enums and reason codes from `apps/control-api/src/research/
 * release-candidate.contract.ts` and `release-candidate.service.ts` (no
 * canonical frontend fixture is published for P21).
 */
const RUN = "run_01";
const ALPHA = "alpha-momentum";
const RC = "rc_01";
const T0 = Date.UTC(2026, 8, 20, 10, 30);
const FP = "sha256:source-fp-1";
const AVAILABLE = { state: "AVAILABLE", reason_code: null } as const;
const np = (reason: string) => ({ state: "NOT_PUBLISHED", reason_code: reason }) as const;
const VERDICT_TITLE = "local seal ready — downstream publish remains P22";
const COMPOSE_PATH = `/api/v1/quantbt/runs/${RUN}/release-candidate`;

const FIELD_KEYS: RcField["key"][] = [
  "release_candidate_id",
  "alpha_id",
  "alpha_version_id",
  "alpha_code_digest",
  "alpha_entrypoint",
  "final_audit_run_id",
  "final_audit_attempt_id",
  "requested_spec_digest",
  "effective_spec_digest",
  "dataset_binding_digest",
  "manifest_digest",
  "source_transform_digest",
  "engine_release_id",
  "adapter_contract_digest",
  "parameter_bundle_digest",
  "evidence_revision",
  "report_revision",
];

function fields(): RcField[] {
  return FIELD_KEYS.map((key) =>
    key === "release_candidate_id"
      ? { key, label: "release candidate id", value: null, tone: "gold", availability: { state: "NOT_APPLICABLE", reason_code: "P21_ASSIGNED_ON_LOCAL_SEAL" } }
      : key === "source_transform_digest"
        ? { key, label: "source transform digest", value: null, tone: "dim", availability: np("P21_SOURCE_TRANSFORM_NOT_PUBLISHED") }
        : { key, label: key.replace(/_/g, " "), value: `${key}:v1`, tone: "ink", availability: AVAILABLE },
  );
}

const RUN_ROOT = `/research/quantbt/runs/${RUN}`;

function item(
  n: number,
  key: RcPackItem["key"],
  label: string,
  status: RcPackItem["status"],
  href: string | null,
  extra: Partial<RcPackItem> = {},
): RcPackItem {
  return {
    key,
    n,
    item: label,
    status,
    digest: status === "COMPLETE" || status === "DEGRADED" ? `sha256:${key.toLowerCase()}` : null,
    source: { label: href === null ? "Researcher declaration" : `source ${n}`, href },
    note: `note ${n}`,
    availability:
      status === "COMPLETE"
        ? AVAILABLE
        : status === "DEGRADED"
          ? { state: "PARTIAL", reason_code: "P21_SOURCE_DEGRADED_EVIDENCE" }
          : status === "INPUT"
            ? np("P21_RESEARCHER_DECLARATION_REQUIRED")
            : np("P21_REQUIRED_EVIDENCE_MISSING"),
    ...extra,
  } as RcPackItem;
}

function pack(): RcPackItem[] {
  return [
    item(1, "ALPHA_VERSION_PASSPORT", "alpha_version passport", "COMPLETE", `/research/alphas/${ALPHA}`),
    item(2, "ENGINE_CAPABILITY_BACKEND", "engine capability & backend", "COMPLETE", "/research/quantbt"),
    item(3, "DATASET_UNIVERSE_SNAPSHOTS", "dataset & universe snapshots", "COMPLETE", RUN_ROOT),
    item(4, "METHODOLOGY_CLAIM", "methodology claim", "DEGRADED", `${RUN_ROOT}/evidence`),
    item(5, "SELECTED_PARAMS_LINEAGE", "selected params lineage", "COMPLETE", `${RUN_ROOT}/search`),
    item(6, "FINAL_AUDIT_REPLAY", "final audit replay", "MISSING", `${RUN_ROOT}/replay`),
    item(7, "METRICS_SEMANTICS", "metrics semantics", "COMPLETE", `${RUN_ROOT}/report`),
    item(8, "EXECUTION_ASSUMPTIONS", "execution assumptions", "COMPLETE", `${RUN_ROOT}/split`),
    item(9, "ROBUSTNESS_PARAM_STABILITY_REGIME", "robustness · param stability · regime", "COMPLETE", `/research/alphas/${ALPHA}/compare`),
    item(10, "KNOWN_LIMITATIONS_WAIVERS", "known limitations & waivers", "INPUT", null),
    item(11, "REPRODUCIBILITY_PARITY_CHECKSUMS", "reproducibility · parity · checksums", "COMPLETE", `${RUN_ROOT}/freeze`),
    item(12, "PROPOSED_USE_RESTRICTIONS", "proposed use & restrictions", "INPUT", null),
  ];
}

type DraftOverrides = Partial<RcCompose["draft"]>;

function compose(overrides: Partial<RcCompose> = {}, draft: DraftOverrides = {}): RcCompose {
  const f = fields();
  return {
    schema_version: "research.release-candidate-compose.v1",
    read_authority: "PORTAL_PERSISTED_RESEARCH",
    run_id: RUN,
    state: "DRAFT",
    availability: AVAILABLE,
    as_of_utc_ms: T0,
    source_fingerprint: FP,
    run: { id: RUN, attempt: "att_01", binding: { alpha_id: ALPHA, alpha_version_id: "alphaver_1", lifecycle_state: "ACTIVE" } },
    rail: [
      { key: "alpha", value: ALPHA, detail: "momentum family", tone: "ink" },
      { key: "alpha_version", value: "alphaver_1", detail: "ACTIVE", tone: "ink" },
      { key: "run", value: `${RUN} / att_01`, detail: null, tone: "ink" },
      { key: "selected_params", value: "params:9f2", detail: "bundle pinned", tone: "green" },
      { key: "release_candidate", value: "rc_ — assigned on seal", detail: "DRAFT", tone: "gold" },
    ],
    taxonomy: [
      { what: "alpha code", state: "UNSET", consequence: "no published predecessor to compare" },
      { what: "params", state: "UNSET", consequence: "no published predecessor to compare" },
      { what: "data / universe", state: "UNSET", consequence: "no published predecessor to compare" },
      { what: "methodology", state: "UNSET", consequence: "no published predecessor to compare" },
    ],
    published_comparison: { last_release_candidate_id: null, availability: np("P22_PUBLISHED_COMPARISON_NOT_COMMISSIONED") },
    certification_axes: {
      methodology_claim: { value: "B", availability: AVAILABLE },
      engine_execution_contract: { value: null, availability: np("P21_ENGINE_EXECUTION_CERTIFICATION_NOT_PUBLISHED") },
    },
    gate_verdict: { title: VERDICT_TITLE, body: "Every required row is present; the declarations are signed." },
    draft: {
      draft_id: "rcd_1",
      revision: 2,
      source_fingerprint: FP,
      known_limitations: "fees modelled at taker",
      proposed_use_restrictions: null,
      state: "PERSISTED",
      updated_at_utc_ms: T0,
      ...draft,
    },
    fields: f,
    yaml: f,
    pack: pack(),
    /* Deliberately not the rows' own tally: the counter is the server's. */
    pack_counts: { complete: 9, degraded: 0, input: 2, missing: 1 },
    local_seal: {
      state: "UNSEALED",
      release_candidate_id: null,
      pack_digest: null,
      sealed_at_utc_ms: null,
      delivery_state: null,
      approval_state: null,
      availability: np("P21_LOCAL_SEAL_NOT_CREATED"),
    },
    actions: {
      may_edit_draft: true,
      may_seal: true,
      seal_blocked_reason: null,
      publish: { enabled: false, blocked_reason: "P22_PUBLICATION_NOT_COMMISSIONED" },
    },
    mirror: null,
    source_absences: {
      alpha_binding: AVAILABLE,
      approval_mirror: np("P22_PUBLICATION_NOT_COMMISSIONED"),
      execution_deployment: { state: "NOT_APPLICABLE", reason_code: "P21_EXECUTION_DEPLOYMENT_NOT_APPLICABLE" },
    },
    ...overrides,
  } as RcCompose;
}

function unbound(): RcCompose {
  const base = compose({}, { draft_id: null, revision: 0, state: "VIRTUAL", known_limitations: null, updated_at_utc_ms: null });
  return {
    ...base,
    run: { ...base.run, binding: null },
    rail: base.rail.map((node) =>
      node.key === "alpha" || node.key === "alpha_version" ? { ...node, value: "not bound", detail: null, tone: "dim" } : node,
    ),
    gate_verdict: { title: "local seal blocked — review evidence", body: "This run has no alpha_version binding." },
    actions: { ...base.actions, may_seal: false, seal_blocked_reason: "P21_SCRATCH_RUN_UNBOUND" },
    source_absences: { ...base.source_absences, alpha_binding: np("P21_SCRATCH_RUN_UNBOUND") },
  };
}

const SEALED_AT = T0 + 3_600_000;

function sealedLocal(): RcCompose["local_seal"] {
  return {
    state: "SEALED_LOCAL",
    release_candidate_id: RC,
    pack_digest: "sha256:pack-1",
    sealed_at_utc_ms: SEALED_AT,
    delivery_state: "NOT_DELIVERED",
    approval_state: "NOT_APPROVED",
    availability: AVAILABLE,
  };
}

function sealed(): RcCompose {
  const base = compose();
  return {
    ...base,
    rail: base.rail.map((node) => (node.key === "release_candidate" ? { ...node, value: RC, detail: "SEALED_LOCAL", tone: "green" } : node)),
    local_seal: sealedLocal(),
  };
}

const SEAL_RESPONSE: RcSealResponse = {
  schema_version: "research.release-candidate-local-seal.v1",
  release_candidate_id: RC,
  run_id: RUN,
  pack_digest: "sha256:pack-1",
  sealed_at_utc_ms: SEALED_AT,
  delivery_state: "NOT_DELIVERED",
  approval_state: "NOT_APPROVED",
};

function packResponse(): RcPack {
  const base = compose();
  return {
    schema_version: "research.release-candidate-pack.v1",
    read_authority: "PORTAL_PERSISTED_RESEARCH",
    release_candidate_id: RC,
    run_id: RUN,
    pack_digest: "sha256:pack-1",
    sealed_at_utc_ms: SEALED_AT,
    frozen_core: {
      fields: base.fields,
      pack: base.pack,
      source_fingerprint: FP,
      draft: { known_limitations: "fees modelled at taker", proposed_use_restrictions: "research only" },
    },
    delivery: sealedLocal(),
  };
}

/* ------------------------------------------------------------------ server */

interface Answer {
  status: number;
  body?: unknown;
  /** Hold the answer until the test releases it. */
  hold?: Promise<void>;
}
interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

const ok = (body: unknown, status = 200): Answer => ({ status, body });
const problem = (status: number, code: string): Answer => ({
  status,
  body: { error: { code, message: "server prose: run owned by alice@example" }, request_id: `req_${status}` },
});

function server(answers: Partial<Record<"GET" | "PATCH" | "POST", Answer[]>>) {
  const calls: Call[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const method = (init?.method ?? "GET").toUpperCase() as "GET" | "PATCH" | "POST";
    calls.push({
      url: String(input),
      method,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    const queue = answers[method] ?? [];
    const answer = queue.length > 1 ? queue.shift()! : queue[0];
    if (!answer) throw new Error(`no answer for ${method}`);
    if (answer.hold) await answer.hold;
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } });
  });
  return {
    calls,
    of: (method: string) => calls.filter((call) => call.method === method),
  };
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/research/quantbt/runs/:runId/release-candidate" element={<ReleaseCandidateRoute />} />
        <Route path="/research/quantbt/release-candidates/:releaseCandidateId" element={<ReleaseCandidatePackRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

const renderCompose = () => renderAt(`/research/quantbt/runs/${RUN}/release-candidate`);
const page = () => document.querySelector('[data-screen="release-candidate"]') as HTMLElement;
const panel = (name: string) => document.querySelector(`[data-panel="${name}"]`) as HTMLElement;
const panelOrder = () => [...page().querySelectorAll(":scope [data-panel]")].map((el) => el.getAttribute("data-panel"));
const row = (key: string) => document.querySelector(`[data-pack-row="${key}"]`) as HTMLElement;
const sealButton = () => document.querySelector('[data-action="local-seal"]') as HTMLElement;

async function ready(title = VERDICT_TITLE) {
  await screen.findByText(title);
}

async function until(selector: string): Promise<HTMLElement> {
  return waitFor(() => {
    const found = document.querySelector(selector);
    if (!found) throw new Error(`not yet: ${selector}`);
    return found as HTMLElement;
  });
}

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function openEditor(key: "KNOWN_LIMITATIONS_WAIVERS" | "PROPOSED_USE_RESTRICTIONS", text: string) {
  fireEvent.click(document.querySelector(`[data-edit="${key}"]`)!);
  const input = document.querySelector(`[data-declaration-input="${key}"]`) as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: text } });
  return input;
}

/* ------------------------------------------------------------------- tests */

describe("Screen 11 Release Candidate", () => {
  it("S11-U01 shows the loading frame, the header, every block and the rules before the server answers", () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => {}));
    renderCompose();
    expect(screen.getByRole("heading", { level: 2, name: RC_TITLE })).toBeTruthy();
    expect(page().getAttribute("data-rc-state")).toBe("loading");
    expect(screen.getAllByRole("status", { name: "Loading" }).length).toBeGreaterThan(0);
    expect(panelOrder()).toEqual(["header", "meta", "notice", "identity", "pack", "record", "seal", "publish-ghost", "mirror-ghost", "rules"]);
    expect((sealButton() as HTMLElement).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText(RC_RULES)).toBeTruthy();
  });

  it("S11-U02 renders the blocks in the hi-fi order RC_PANELS names", async () => {
    server({ GET: [ok(unbound())] });
    renderCompose();
    await ready("local seal blocked — review evidence");
    expect(panelOrder()).toEqual([...RC_PANELS.compose].filter((name) => name !== "sealed"));
    cleanup();
    server({ GET: [ok(sealed())] });
    renderCompose();
    await ready();
    expect(panelOrder()).toEqual([...RC_PANELS.compose].filter((name) => name !== "banner"));
  });

  it("S11-U03 prints the hi-fi title, subtitle, breadcrumb and verbatim copy", async () => {
    server({ GET: [ok(compose())] });
    renderCompose();
    await ready();
    expect(screen.getByText(RC_SUBTITLE)).toBeTruthy();
    const crumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(crumb.textContent).toBe(`Evidence Flow/${RUN}/Release Candidate & Publish`);
    expect(within(crumb).getByRole("link", { name: "Evidence Flow" }).getAttribute("href")).toMatch(
      new RegExp(`^/research/quantbt/runs/${RUN}/evidence#stage=claim`),
    );
    expect(screen.getByText(SEAL_SENTENCE)).toBeTruthy();
    expect(screen.getByText(SOD_NOTE)).toBeTruthy();
    expect(screen.getByText(MIRROR_NOTE)).toBeTruthy();
    expect(panel("pack").textContent).toContain(
      "DEGRADED travels as DEGRADED — the reviewer sees it. MISSING blocks publish. The two INPUT rows are the researcher's own signed declarations.",
    );
    expect(sealButton().textContent).toBe(SEAL_LABEL);
    expect(document.querySelector("[data-state-chip]")?.textContent).toBe("DRAFT");
  });

  it("S11-U04 prints the meta line from the composition: authority, as-of, fingerprint and draft", async () => {
    server({ GET: [ok(compose())] });
    renderCompose();
    await ready();
    const meta = panel("meta").textContent ?? "";
    expect(meta).toContain("PORTAL_PERSISTED_RESEARCH");
    expect(meta).toContain("as of 2026-09-20 10:30Z");
    expect(meta).toContain(`source ${FP}`);
    expect(meta).toContain("draft PERSISTED · revision 2 · saved 2026-09-20 10:30Z");
  });

  it("S11-U05 keeps the rail in server order with the server's tones, values and details", async () => {
    server({ GET: [ok(unbound())] });
    renderCompose();
    await ready("local seal blocked — review evidence");
    const nodes = [...document.querySelectorAll("[data-rail-node]")];
    expect(nodes.map((node) => node.getAttribute("data-rail-node"))).toEqual(["alpha", "alpha_version", "run", "selected_params", "release_candidate"]);
    expect(nodes.map((node) => node.getAttribute("data-tone"))).toEqual(["dim", "dim", "ink", "green", "gold"]);
    expect(nodes[2].querySelector(".k")?.textContent).toBe("run / attempt");
    expect(nodes[2].querySelector("[data-rail-value]")?.textContent).toBe(`${RUN} / att_01`);
    expect(nodes[2].querySelector("[data-rail-detail]")).toBeNull();
    expect(nodes[4].querySelector("[data-rail-value]")?.textContent).toBe("rc_ — assigned on seal");
    expect(nodes[4].querySelector("[data-rail-value] a")).toBeNull();
  });

  it("S11-U06 a scratch run shows the NOT_PUBLISHABLE banner and a refused seal that names its reason", async () => {
    const api = server({ GET: [ok(unbound())] });
    renderCompose();
    await ready("local seal blocked — review evidence");
    const banner = panel("banner");
    expect(within(banner).getByText(NOT_PUBLISHABLE_BADGE)).toBeTruthy();
    expect(banner.textContent).toContain(
      "This run was submitted without an alpha_version binding — a scratch research run. It stays fully usable as evidence for you, but no release candidate can be composed from it. Bind a version at New Run and re-run to publish.",
    );
    expect(within(banner).getByRole("link", { name: "New Run" }).getAttribute("href")).toBe("/research/quantbt/runs/new");
    expect(banner.querySelector("[data-reason-code]")?.textContent).toBe("P21_SCRATCH_RUN_UNBOUND");
    expect(document.querySelector("[data-state-chip]")?.textContent).toBe("DRAFT");
    const seal = sealButton();
    expect(seal.getAttribute("aria-disabled")).toBe("true");
    const reason = document.getElementById(seal.getAttribute("aria-describedby")!)!;
    expect(reason.textContent).toBe("seal blocked — bind alpha_version first · P21_SCRATCH_RUN_UNBOUND");
    fireEvent.click(seal);
    expect(api.of("POST")).toHaveLength(0);
  });

  it("S11-U07 prints the taxonomy as sent and the last-rc caption as a typed absence", async () => {
    server({ GET: [ok(compose())] });
    renderCompose();
    await ready();
    const rows = [...document.querySelectorAll("[data-taxonomy-row]")];
    expect(rows.map((r) => r.getAttribute("data-taxonomy-row"))).toEqual(["alpha code", "params", "data / universe", "methodology"]);
    expect(rows.every((r) => r.querySelector("td.state")?.textContent === "UNSET")).toBe(true);
    const caption = document.querySelector("[data-taxonomy-caption]")!;
    expect(caption.textContent).toContain("change taxonomy vs last published rc — ");
    expect(caption.querySelector("[data-last-rc]")).toBeNull();
    expect(caption.querySelector("[data-reason-code]")?.textContent).toBe("P22_PUBLISHED_COMPARISON_NOT_COMMISSIONED");
    expect(document.querySelector("[data-verdict-body]")?.textContent).toBe("Every required row is present; the declarations are signed.");
  });

  it("S11-U08 draws both certification axes with the spec titles; an absent axis is a ghost chip with its reason", async () => {
    server({ GET: [ok(compose())] });
    renderCompose();
    await ready();
    const ceiling = document.querySelector('[data-cert="methodology_claim"]')!;
    expect(ceiling.getAttribute("title")).toBe(CEILING_TITLE);
    expect(ceiling.getAttribute("data-ghost")).toBe("false");
    expect(ceiling.textContent).toBe("claim ceiling B");
    const engine = document.querySelector('[data-cert="engine_execution_contract"]')!;
    expect(engine.getAttribute("title")).toBe(ENGCERT_TITLE);
    expect(engine.getAttribute("data-ghost")).toBe("true");
    expect(engine.querySelector("[data-reason-code]")?.textContent).toBe("P21_ENGINE_EXECUTION_CERTIFICATION_NOT_PUBLISHED");
    expect(engine.textContent).not.toMatch(/\b0\b/);
  });

  it("S11-U09 lists the 12 pack rows in server order and prints the server's counter even where it disagrees", async () => {
    server({ GET: [ok(compose())] });
    renderCompose();
    await ready();
    const rows = [...document.querySelectorAll("[data-pack-row]")];
    expect(rows).toHaveLength(12);
    expect(rows.map((r) => r.getAttribute("data-n"))).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
    expect(document.querySelector("[data-pack-counts]")?.textContent).toBe("9 COMPLETE · 0 DEGRADED · 2 INPUT · 1 MISSING");
    expect(document.querySelector("[data-pack-scroll] table")).toBeTruthy();
  });

  it("S11-U10 titles each status as the hi-fi does; MISSING carries its reason and no digest stands in for a number", async () => {
    server({ GET: [ok(compose())] });
    renderCompose();
    await ready();
    expect(row("ALPHA_VERSION_PASSPORT").querySelector("[data-status]")?.getAttribute("title")).toBe(STATUS_TITLE.COMPLETE);
    expect(row("METHODOLOGY_CLAIM").querySelector("[data-status]")?.getAttribute("title")).toBe(STATUS_TITLE.DEGRADED);
    expect(row("METHODOLOGY_CLAIM").querySelector("[data-digest]")?.textContent).toBe("sha256:methodology_claim");
    expect(row("KNOWN_LIMITATIONS_WAIVERS").querySelector("[data-status]")?.getAttribute("title")).toBe(STATUS_TITLE.INPUT);
    const missing = row("FINAL_AUDIT_REPLAY");
    expect(missing.getAttribute("data-s")).toBe("MISSING");
    expect(missing.querySelector("[data-status]")?.getAttribute("title")).toBe("P21_REQUIRED_EVIDENCE_MISSING");
    expect(missing.querySelector("[data-digest] [data-reason-code]")?.textContent).toBe("P21_REQUIRED_EVIDENCE_MISSING");
    for (const cell of document.querySelectorAll("[data-digest]")) {
      expect(["0", "-", "N/A", ""]).not.toContain((cell.textContent ?? "").trim());
    }
  });

  it("S11-U11 links each source exactly as the server sent it, /replay included; a null or foreign href is not a link", async () => {
    const body = compose();
    body.pack[0] = { ...body.pack[0], source: { label: "Alpha 360°", href: null } };
    body.pack[1] = { ...body.pack[1], source: { label: "Engine Atlas", href: "//elsewhere.example/atlas" } };
    server({ GET: [ok(body)] });
    renderCompose();
    await ready();
    const expected: Record<string, string> = {
      DATASET_UNIVERSE_SNAPSHOTS: RUN_ROOT,
      METHODOLOGY_CLAIM: `${RUN_ROOT}/evidence`,
      SELECTED_PARAMS_LINEAGE: `${RUN_ROOT}/search`,
      FINAL_AUDIT_REPLAY: `${RUN_ROOT}/replay`,
      METRICS_SEMANTICS: `${RUN_ROOT}/report`,
      EXECUTION_ASSUMPTIONS: `${RUN_ROOT}/split`,
      ROBUSTNESS_PARAM_STABILITY_REGIME: `/research/alphas/${ALPHA}/compare`,
      REPRODUCIBILITY_PARITY_CHECKSUMS: `${RUN_ROOT}/freeze`,
    };
    for (const [key, href] of Object.entries(expected)) {
      expect(row(key).querySelector(".source a")?.getAttribute("href"), key).toBe(href);
    }
    const passport = row("ALPHA_VERSION_PASSPORT").querySelector("[data-source-unlinked]")!;
    expect(passport.tagName).toBe("SPAN");
    expect(passport.getAttribute("title")).toBe(ALPHA360_TITLE);
    expect(row("ENGINE_CAPABILITY_BACKEND").querySelector(".source a")).toBeNull();
    expect(row("KNOWN_LIMITATIONS_WAIVERS").querySelector("[data-source-unlinked]")?.textContent).toBe("Researcher declaration");
  });

  it("S11-U12 prints the record preview as the server's 17 fields; a null value reads its reason", async () => {
    server({ GET: [ok(compose())] });
    renderCompose();
    await ready();
    const lines = [...document.querySelectorAll("[data-yaml-key]")];
    expect(lines.map((line) => line.getAttribute("data-yaml-key"))).toEqual(FIELD_KEYS);
    expect(lines[0].querySelector("[data-yaml-value]")?.textContent).toBe("null  # P21_ASSIGNED_ON_LOCAL_SEAL");
    expect(lines[0].querySelector("[data-yaml-value]")?.getAttribute("data-tone")).toBe("gold");
    expect(lines[1].querySelector("[data-yaml-value]")?.textContent).toBe("alpha_id:v1");
  });

  it("S11-U13 copy yaml writes the server's join and says copied only once the clipboard accepts it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    server({ GET: [ok(compose())] });
    renderCompose();
    await ready();
    const button = document.querySelector('[data-action="copy-yaml"]') as HTMLElement;
    expect(button.textContent).toBe("copy yaml");
    fireEvent.click(button);
    expect(writeText).toHaveBeenCalledWith(yamlText(compose().yaml));
    expect(writeText.mock.calls[0][0].split("\n")).toHaveLength(17);
    await waitFor(() => expect(button.textContent).toBe("✓ copied"));
  });

  it("S11-U14 a refused clipboard never claims a copy", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    server({ GET: [ok(compose())] });
    renderCompose();
    await ready();
    const button = document.querySelector('[data-action="copy-yaml"]') as HTMLElement;
    fireEvent.click(button);
    await waitFor(() => expect(button.textContent).toBe("copy unavailable"));
    expect(button.textContent).not.toContain("copied");
  });

  it("S11-U15 shows the declared text under each INPUT row, and a missing declaration as not declared", async () => {
    server({ GET: [ok(compose())] });
    renderCompose();
    await ready();
    expect(document.querySelector('[data-declared="KNOWN_LIMITATIONS_WAIVERS"]')?.textContent).toBe("fees modelled at taker");
    expect(document.querySelector('[data-declared="PROPOSED_USE_RESTRICTIONS"]')?.textContent).toBe("not declared");
    expect(document.querySelectorAll('[data-action="edit-declaration"]')).toHaveLength(2);
  });

  it("S11-U16 saving a declaration sends the fences in hand with the CSRF proof and prints the server's answer", async () => {
    const saved = compose({}, { revision: 3, proposed_use_restrictions: "research only" });
    const api = server({ GET: [ok(compose())], PATCH: [ok(saved)] });
    renderCompose();
    await ready();
    await openEditor("PROPOSED_USE_RESTRICTIONS", "research only");
    fireEvent.click(document.querySelector('[data-action="save-declaration"]')!);
    await waitFor(() => expect(document.querySelector('[data-declared="PROPOSED_USE_RESTRICTIONS"]')?.textContent).toBe("research only"));
    const [patch] = api.of("PATCH");
    expect(patch.url).toBe(`${COMPOSE_PATH}/draft`);
    expect(patch.headers["x-portal-csrf"]).toBe("tok_123");
    expect(patch.body).toEqual({
      expected_revision: 2,
      expected_source_fingerprint: FP,
      known_limitations: "fees modelled at taker",
      proposed_use_restrictions: "research only",
    });
    expect(document.querySelector("[data-declaration-input]")).toBeNull();
    expect(document.querySelector('[data-write-notice="patch"]')?.getAttribute("data-outcome")).toBe("saved");
    expect(panel("meta").textContent).toContain("revision 3");
    expect(api.of("GET")).toHaveLength(1);
    expect(api.of("GET")[0].headers["x-portal-csrf"]).toBeUndefined();
  });

  it("S11-U17 save is refused before sending when both declarations would be empty", async () => {
    const api = server({ GET: [ok(compose({}, { proposed_use_restrictions: null }))] });
    renderCompose();
    await ready();
    await openEditor("KNOWN_LIMITATIONS_WAIVERS", "   ");
    const save = document.querySelector('[data-action="save-declaration"]') as HTMLElement;
    expect(save.getAttribute("aria-disabled")).toBe("true");
    expect(document.getElementById(save.getAttribute("aria-describedby")!)?.textContent).toBe("at least one declaration is required");
    fireEvent.click(save);
    expect(api.of("PATCH")).toHaveLength(0);
  });

  it("S11-U18 a 409 keeps the typed text, says the evidence changed, and reads the composition again", async () => {
    const moved = compose({ source_fingerprint: "sha256:source-fp-2" });
    const api = server({ GET: [ok(compose()), ok(moved)], PATCH: [problem(409, "RESEARCH_RELEASE_CANDIDATE_CONFLICT")] });
    renderCompose();
    await ready();
    await openEditor("PROPOSED_USE_RESTRICTIONS", "research only, no capital");
    fireEvent.click(document.querySelector('[data-action="save-declaration"]')!);
    const notice = await until('[data-write-notice="patch"][data-outcome="conflict"]');
    expect(notice.textContent).toContain(RC_CONFLICT_COPY);
    expect(notice.textContent).toContain("RESEARCH_RELEASE_CANDIDATE_CONFLICT");
    expect(notice.textContent).not.toContain("alice@example");
    await waitFor(() => expect(api.of("GET")).toHaveLength(2));
    await waitFor(() => expect(panel("meta").textContent).toContain("sha256:source-fp-2"));
    expect((document.querySelector('[data-declaration-input="PROPOSED_USE_RESTRICTIONS"]') as HTMLTextAreaElement).value).toBe(
      "research only, no capital",
    );
  });

  it.each([
    [401, "RESEARCH_RELEASE_CANDIDATE_UNAUTHENTICATED"],
    [403, "RESEARCH_RELEASE_CANDIDATE_FORBIDDEN"],
  ])("S11-U19 a %i on save keeps the text, locks both writes and never retries", async (status, code) => {
    const api = server({ GET: [ok(compose())], PATCH: [problem(status, code)] });
    renderCompose();
    await ready();
    await openEditor("PROPOSED_USE_RESTRICTIONS", "research only");
    const save = document.querySelector('[data-action="save-declaration"]') as HTMLElement;
    fireEvent.click(save);
    const notice = await until('[data-write-notice="patch"][data-outcome="denied"]');
    expect(notice.textContent).toContain(RC_DENIED_COPY);
    expect(notice.querySelector("[data-request-id]")?.textContent).toBe(`request req_${status}`);
    expect(notice.querySelector("button")).toBeNull();
    expect((document.querySelector('[data-declaration-input="PROPOSED_USE_RESTRICTIONS"]') as HTMLTextAreaElement).value).toBe("research only");
    expect(save.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(save);
    expect(sealButton().getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(sealButton());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(api.of("PATCH")).toHaveLength(1);
    expect(api.of("POST")).toHaveLength(0);
    expect(api.of("GET")).toHaveLength(1);
  });

  it("S11-U20 a write refused with 403 and with 404 says the same neutral sentence", async () => {
    const messages: string[] = [];
    for (const status of [403, 404]) {
      server({ GET: [ok(compose())], PATCH: [problem(status, "RESEARCH_RELEASE_CANDIDATE_X")] });
      renderCompose();
      await ready();
      await openEditor("PROPOSED_USE_RESTRICTIONS", "x");
      fireEvent.click(document.querySelector('[data-action="save-declaration"]')!);
      const notice = await until('[data-write-notice="patch"][data-outcome="denied"]');
      messages.push(notice.firstElementChild!.textContent!);
      cleanup();
      vi.restoreAllMocks();
    }
    expect(messages[0]).toBe(`${RC_DENIED_COPY} ${RC_NEUTRAL_REFUSAL}`);
    expect(messages[1]).toBe(messages[0]);
  });

  it("S11-U21 a 503 on save keeps the draft and lets the reader send it again", async () => {
    const saved = compose({}, { revision: 3, proposed_use_restrictions: "research only" });
    const api = server({ GET: [ok(compose())], PATCH: [problem(503, "RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE"), ok(saved)] });
    renderCompose();
    await ready();
    await openEditor("PROPOSED_USE_RESTRICTIONS", "research only");
    const save = document.querySelector('[data-action="save-declaration"]') as HTMLElement;
    fireEvent.click(save);
    const notice = await until('[data-write-notice="patch"][data-outcome="unavailable"]');
    expect(notice.textContent).toContain(RC_UNAVAILABLE_COPY);
    expect((document.querySelector('[data-declaration-input="PROPOSED_USE_RESTRICTIONS"]') as HTMLTextAreaElement).value).toBe("research only");
    expect(api.of("GET")).toHaveLength(1);
    expect(save.getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(save);
    await waitFor(() => expect(document.querySelector('[data-declared="PROPOSED_USE_RESTRICTIONS"]')?.textContent).toBe("research only"));
    expect(api.of("PATCH")).toHaveLength(2);
  });

  it("S11-U22 sealing sends the persisted draft and its fences, then prints the server's re-read seal", async () => {
    const api = server({ GET: [ok(compose()), ok(sealed())], POST: [ok(SEAL_RESPONSE, 201)] });
    renderCompose();
    await ready();
    expect(sealButton().getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(sealButton());
    fireEvent.click(sealButton());
    await waitFor(() => expect(panel("sealed")).toBeTruthy());
    const [post] = api.of("POST");
    expect(api.of("POST")).toHaveLength(1);
    expect(post.url).toBe(`${COMPOSE_PATH}/seal`);
    expect(post.headers["x-portal-csrf"]).toBe("tok_123");
    expect(post.body).toEqual({ draft_id: "rcd_1", expected_draft_revision: 2, expected_source_fingerprint: FP });
    expect(api.of("GET")).toHaveLength(2);
    const sealedCard = panel("sealed");
    expect(within(sealedCard).getByRole("link", { name: RC }).getAttribute("href")).toBe(`/research/quantbt/release-candidates/${RC}`);
    expect(sealedCard.querySelector("[data-sealed-facts]")?.textContent).toBe("sealed_at 2026-09-20 11:30Z · pack digest sha256:pack-1");
    expect(sealedCard.querySelector("[data-sealed-lifecycle]")?.textContent).toBe("NOT_DELIVERED · NOT_APPROVED");
    expect(document.querySelector("[data-seal-chip]")?.textContent).toBe("SEALED_LOCAL");
    expect(document.querySelector("[data-state-chip]")?.textContent).toBe("DRAFT");
    expect(document.querySelector('[data-write-notice="seal"]')?.textContent).toContain("sealed locally");
    expect(screen.queryByText(SEALED_REPLAY)).toBeNull();
  });

  it("S11-U23 a second seal answering the same identity is reported as the idempotent replay", async () => {
    server({ GET: [ok(sealed())], POST: [ok(SEAL_RESPONSE, 201)] });
    renderCompose();
    await ready();
    fireEvent.click(sealButton());
    await waitFor(() => expect(screen.getAllByText(SEALED_REPLAY).length).toBeGreaterThan(0));
    expect(document.querySelector("[data-seal-response-id]")?.textContent).toBe(RC);
  });

  it("S11-U24 a 422 on seal ends that request with its code; a draft that is not persisted cannot seal", async () => {
    server({ GET: [ok(compose())], POST: [problem(422, "RESEARCH_RELEASE_CANDIDATE_NOT_PUBLISHABLE")] });
    renderCompose();
    await ready();
    fireEvent.click(sealButton());
    const notice = await until('[data-write-notice="seal"][data-outcome="terminal"]');
    expect(notice.textContent).toContain(RC_NOT_PUBLISHABLE_COPY);
    expect(notice.querySelector("[data-error-code]")?.textContent).toBe("RESEARCH_RELEASE_CANDIDATE_NOT_PUBLISHABLE");
    cleanup();
    vi.restoreAllMocks();
    const api = server({ GET: [ok(compose({}, { draft_id: null, revision: 0, state: "VIRTUAL" }))] });
    renderCompose();
    await ready();
    expect(document.getElementById(sealButton().getAttribute("aria-describedby")!)?.textContent).toContain("draft is not persisted");
    fireEvent.click(sealButton());
    expect(api.of("POST")).toHaveLength(0);
  });

  it("S11-U25 publish and the approval-inbox mirror are P22 ghosts with nothing to operate", async () => {
    server({ GET: [ok(compose())] });
    renderCompose();
    await ready();
    for (const name of ["publish-ghost", "mirror-ghost"]) {
      const ghost = panel(name);
      expect(ghost.querySelectorAll("button, a, input, textarea, select, [tabindex]"), name).toHaveLength(0);
    }
    expect(panel("publish-ghost").querySelector("[data-reason-code]")?.textContent).toBe("P22_PUBLICATION_NOT_COMMISSIONED");
    expect(panel("mirror-ghost").textContent).toContain("R1 · RESEARCH EVIDENCE");
    expect(panel("mirror-ghost").textContent).toContain("SLA starts at publish");
    expect(screen.queryByRole("button", { name: /^publish/i })).toBeNull();
  });

  it("S11-U26 a read refused with 403 and with 404 is the same neutral denied state with no retry and no server prose", async () => {
    const seen: string[] = [];
    for (const status of [403, 404]) {
      const api = server({ GET: [problem(status, "RESEARCH_RELEASE_CANDIDATE_X")] });
      renderCompose();
      await waitFor(() => expect(page().getAttribute("data-rc-state")).toBe("denied"));
      expect(screen.getByText(RC_NEUTRAL_REFUSAL)).toBeTruthy();
      expect(document.body.textContent).not.toContain("alice@example");
      expect(document.querySelector("[data-request-id]")?.textContent).toBe(`request req_${status}`);
      expect(document.querySelector('[data-action="retry"]')).toBeNull();
      expect(document.querySelectorAll("[data-pack-row]")).toHaveLength(0);
      expect(api.calls).toHaveLength(1);
      seen.push(panel("notice").textContent!.replace(/req_\d+/, ""));
      cleanup();
      vi.restoreAllMocks();
    }
    expect(seen[1]).toBe(seen[0]);
  });

  it("S11-U27 a 503 read offers read again; a PARTIAL composition shows its reason and keeps the blocks", async () => {
    const api = server({ GET: [problem(503, "RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE"), ok(compose({ availability: { state: "PARTIAL", reason_code: "P21_REFERENCED_SOURCE_INTEGRITY_FAILED" } }))] });
    renderCompose();
    await waitFor(() => expect(page().getAttribute("data-rc-state")).toBe("unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "read again" }));
    await ready();
    expect(api.of("GET")).toHaveLength(2);
    expect(page().getAttribute("data-rc-state")).toBe("partial");
    expect(panel("notice").textContent).toContain("P21_REFERENCED_SOURCE_INTEGRITY_FAILED");
    expect(document.querySelectorAll("[data-pack-row]")).toHaveLength(12);
  });

  it("S11-U28 reads once per run: no poll, no refetch on a re-render", async () => {
    const api = server({ GET: [ok(compose())] });
    const view = renderCompose();
    await ready();
    view.rerender(
      <MemoryRouter initialEntries={[`/research/quantbt/runs/${RUN}/release-candidate`]}>
        <Routes>
          <Route path="/research/quantbt/runs/:runId/release-candidate" element={<ReleaseCandidateRoute />} />
        </Routes>
      </MemoryRouter>,
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(api.of("GET")).toHaveLength(1);
    expect(api.of("GET")[0].url).toBe(COMPOSE_PATH);
    expect(page().getAttribute("data-request-count")).toBe("1");
  });

  it("S11-U29 an overlapping save is sent once", async () => {
    const gate = deferred();
    const api = server({ GET: [ok(compose())], PATCH: [{ ...ok(compose({}, { revision: 3 })), hold: gate.promise }] });
    renderCompose();
    await ready();
    await openEditor("PROPOSED_USE_RESTRICTIONS", "x");
    const save = document.querySelector('[data-action="save-declaration"]') as HTMLElement;
    fireEvent.click(save);
    fireEvent.click(save);
    expect(save.getAttribute("aria-busy")).toBe("true");
    gate.release();
    await waitFor(() => expect(document.querySelector("[data-declaration-input]")).toBeNull());
    expect(api.of("PATCH")).toHaveLength(1);
  });
});

describe("Screen 11 sealed pack route", () => {
  const renderPack = () => renderAt(`/research/quantbt/release-candidates/${RC}`);

  it("S11-U30 reads the frozen pack by its id and prints it read-only", async () => {
    const api = server({ GET: [ok(packResponse())] });
    renderPack();
    await waitFor(() => expect(page().getAttribute("data-rc-state")).toBe("available"));
    expect(api.calls[0].url).toBe(`/api/v1/research/release-candidates/${RC}`);
    expect(page().getAttribute("data-rc-mode")).toBe("pack");
    expect(panelOrder()).toEqual([...RC_PANELS.pack]);
    expect(document.querySelectorAll("[data-pack-row]")).toHaveLength(12);
    expect(document.querySelector('[data-declared="PROPOSED_USE_RESTRICTIONS"]')?.textContent).toBe("research only");
    expect(document.querySelectorAll('[data-action="edit-declaration"], [data-action="local-seal"], textarea')).toHaveLength(0);
    expect(document.querySelector("[data-pack-counts]")).toBeNull();
    expect(document.querySelector("[data-pack-counts-absent]")).toBeTruthy();
    expect(document.querySelectorAll("[data-yaml-key]")).toHaveLength(17);
    expect(panel("meta").textContent).toContain("pack sha256:pack-1");
    expect(within(panel("identity")).getByRole("link", { name: /open the run's composition/ }).getAttribute("href")).toBe(
      `/research/quantbt/runs/${RUN}/release-candidate`,
    );
    expect(document.querySelector("[data-seal-chip]")?.textContent).toBe("SEALED_LOCAL");
  });

  it("S11-U31 a pack read refused with 403 and with 404 says the same thing", async () => {
    const seen: string[] = [];
    for (const status of [403, 404]) {
      server({ GET: [problem(status, "RESEARCH_RELEASE_CANDIDATE_X")] });
      renderPack();
      await waitFor(() => expect(page().getAttribute("data-rc-state")).toBe("denied"));
      seen.push(panel("notice").textContent!.replace(/req_\d+/, ""));
      cleanup();
      vi.restoreAllMocks();
    }
    expect(seen[0]).toContain(RC_NEUTRAL_REFUSAL);
    expect(seen[1]).toBe(seen[0]);
  });
});

describe("Screen 11 source guards", () => {
  const S11 = ["ReleaseCandidateDetail.tsx", "ReleaseCandidateRoute.tsx", "releaseCandidateClient.ts", "useReleaseCandidate.ts"];
  const source = (name: string) => readFileSync(join(process.cwd(), "src", "research", name), "utf8");

  it("S11-U32 no S11 file formats, sorts or scrolls on the client", () => {
    for (const name of S11) {
      expect(source(name), name).not.toMatch(/toFixed|Intl|toLocaleString|sort\(|scrollIntoView/);
    }
  });

  it("S11-U33 the routes are registered under QuantBT and the Hub and Report link to Screen 11", () => {
    const module = readFileSync(join(process.cwd(), "src", "features", "quantbt", "QuantBTModule.tsx"), "utf8");
    expect(module).toContain('<Route path="runs/:runId/release-candidate" element={<ReleaseCandidateRoute />} />');
    expect(module).toContain('<Route path="release-candidates/:releaseCandidateId" element={<ReleaseCandidatePackRoute />} />');
    expect(module.indexOf("runs/:runId/release-candidate")).toBeLessThan(module.indexOf('path="runs/:runId/*"'));
    expect(module).toContain("execute|report|release-candidate)");
    expect(source("EvidenceFlow.tsx")).toContain('data-action="release-candidate"');
    expect(source("ReportDetail.tsx")).toContain("/release-candidate`} data-action=\"release-candidate\"");
  });
});
