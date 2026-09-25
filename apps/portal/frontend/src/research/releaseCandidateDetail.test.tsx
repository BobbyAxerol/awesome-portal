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
 *  - **Local seal ≠ publish.** Before a delivered publication the mirror is a
 *    ghost with nothing interactive inside it; publish is one fenced click
 *    whose gate, state and mirror are the server's (P22, S11-U34…).
 *  - **Refusals are neutral.** 403 and 404 say the same sentence and take the
 *    same state; the server's prose is never rendered.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ALPHA360_TITLE,
  CEILING_TITLE,
  CLAIM_LEGEND,
  CLAIM_REQUIRED,
  ENGCERT_TITLE,
  MIRROR_CONDITIONS_NONE,
  MIRROR_INBOX_LINK,
  MIRROR_NOT_READABLE,
  MIRROR_NOTE,
  MIRROR_OUTCOMES,
  MIRROR_POOL_ABSENT,
  MIRROR_PUBLISHED_NOTE,
  MIRROR_SUPERSEDED,
  PUBLISHED_SENTENCE,
  PUBLISHING_LABEL,
  RECONCILE_NOT_ADMITTED,
  UNKNOWN_COPY,
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
  RC_ACTOR_MISMATCH_COPY,
  RC_CONFLICT_COPY,
  RC_DENIED_COPY,
  RC_NEUTRAL_REFUSAL,
  RC_NOT_PUBLISHABLE_COPY,
  RC_OPEN_APPROVAL_COPY,
  RC_PUBLISH_REFUSED_COPY,
  RC_RETRYABLE_COPY,
  RC_UNAVAILABLE_COPY,
  yamlText,
  type RcCompose,
  type RcField,
  type RcMirror,
  type RcPack,
  type RcPackItem,
  type RcPublication,
  type RcPublicationResponse,
  type RcSealResponse,
} from "./releaseCandidateClient";
import { MIRROR_POLL_MS, nextMirrorView } from "./useReleaseCandidateMirror";
import { PortalApiError } from "../lib/api";

vi.mock("../auth/authApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../auth/authApi")>()),
  csrfTokenFromCookie: () => "tok_123",
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
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
const VERDICT_TITLE = "local seal ready — seal before publishing";
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

/** `Publication` with nothing recorded yet (shape of `publicationBlock`). */
function publication(overrides: Partial<RcPublication> = {}): RcPublication {
  return {
    availability: np("P22_NOT_PUBLISHED"),
    state: null,
    release_candidate_id: RC,
    approval_id: null,
    conflicting_approval_id: null,
    downstream_code: null,
    downstream_receipt_digest: null,
    attempt_count: null,
    intent_actor: null,
    updated_at_utc_ms: null,
    reconcile_allowed: false,
    claim_candidates: ["claim_m1"],
    ...overrides,
  };
}

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
    published_comparison: { last_release_candidate_id: null, availability: np("P22_NO_PUBLISHED_PREDECESSOR") },
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
      publish: { enabled: false, blocked_reason: "P21_LOCAL_SEAL_NOT_CREATED", release_candidate_id: null },
    },
    publication: publication({ availability: np("P21_LOCAL_SEAL_NOT_CREATED"), release_candidate_id: null }),
    mirror: null,
    source_absences: {
      alpha_binding: AVAILABLE,
      approval_mirror: np("P22_NOT_PUBLISHED"),
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

function sealed(pub: Partial<RcPublication> = {}, action: Partial<RcCompose["actions"]["publish"]> = {}): RcCompose {
  const base = compose();
  return {
    ...base,
    rail: base.rail.map((node) => (node.key === "release_candidate" ? { ...node, value: RC, detail: "SEALED_LOCAL", tone: "green" } : node)),
    local_seal: sealedLocal(),
    actions: { ...base.actions, publish: { enabled: true, blocked_reason: null, release_candidate_id: RC, ...action } },
    publication: publication(pub),
  };
}

const PUBLISHED_AT = SEALED_AT + 3_600_000;
const APPROVAL = "apr_01";
const ACTOR = { user_id: "u_1", username: "researcher@bobby" };

/** `Mirror` as `release-candidate-publication.service.ts` answers a readable R1 approval. */
function mirror(overrides: Partial<RcMirror> = {}): RcMirror {
  return {
    schema_version: "research.release-candidate-approval-mirror.v1",
    release_candidate_id: RC,
    approval_id: APPROVAL,
    href: `/governance/approvals/${APPROVAL}/r1`,
    availability: AVAILABLE,
    gate: "R1",
    subject_id: ALPHA,
    subject_label: `${RC} — ${ALPHA} alphaver_1`,
    status: "PENDING",
    effective_status: "PENDING",
    sla_due_at: "2026-09-21T12:30:00.000Z",
    expires_at: "2026-09-23T12:30:00.000Z",
    created_at: "2026-09-20T12:30:00.000Z",
    quorum_met: 0,
    quorum_required: 1,
    approval_version: 1,
    evidence_set_hash: "sha256:evidence-set-1",
    blocker_count: 0,
    condition_count: 0,
    conditions: [],
    decision_outcomes: [],
    rc_superseded: false,
    as_of_utc_ms: PUBLISHED_AT,
    ...overrides,
  };
}

/** Without the R1 read authority: the id, the link and a typed absence, nothing else. */
function deniedMirror(): RcMirror {
  return mirror({
    availability: { state: "NOT_APPLICABLE", reason_code: "GOVERNANCE_R1_READ_DENIED" },
    gate: null,
    subject_id: null,
    subject_label: null,
    status: null,
    effective_status: null,
    sla_due_at: null,
    expires_at: null,
    created_at: null,
    quorum_met: null,
    quorum_required: null,
    approval_version: null,
    evidence_set_hash: null,
    blocker_count: null,
    condition_count: null,
  });
}

function published(m: RcMirror = mirror()): RcCompose {
  const base = sealed();
  return {
    ...base,
    state: "PUBLISHED",
    rail: base.rail.map((node) => (node.key === "release_candidate" ? { ...node, value: RC, detail: "published · immutable", tone: "green" } : node)),
    gate_verdict: { title: "published — immutable · R1 review in Approval Inbox", body: PUBLISHED_SENTENCE },
    local_seal: { ...sealedLocal(), delivery_state: "DELIVERED", approval_state: "PENDING" },
    actions: {
      may_edit_draft: false,
      may_seal: false,
      seal_blocked_reason: "P22_ALREADY_PUBLISHED",
      publish: { enabled: false, blocked_reason: "P22_ALREADY_PUBLISHED", release_candidate_id: RC },
    },
    publication: publication({
      availability: AVAILABLE,
      state: "DELIVERED",
      approval_id: APPROVAL,
      downstream_receipt_digest: "sha256:receipt-1",
      attempt_count: 1,
      intent_actor: ACTOR,
      updated_at_utc_ms: PUBLISHED_AT,
    }),
    mirror: m,
    source_absences: { alpha_binding: AVAILABLE, execution_deployment: { state: "NOT_APPLICABLE", reason_code: "P21_EXECUTION_DEPLOYMENT_OUT_OF_SCOPE" } },
  };
}

/** An attempt the governance store did not confirm; only the intent actor may reconcile. */
function unknownOutcome(): RcCompose {
  return sealed(
    { availability: AVAILABLE, state: "UNKNOWN", attempt_count: 1, intent_actor: ACTOR, updated_at_utc_ms: PUBLISHED_AT, reconcile_allowed: true },
    { enabled: false, blocked_reason: "P22_PUBLICATION_PENDING_RECONCILE" },
  );
}

function publicationAnswer(state: "DELIVERED" | "UNKNOWN", replayed = false): RcPublicationResponse {
  const delivered = state === "DELIVERED";
  return {
    schema_version: "research.release-candidate-publication.v1",
    release_candidate_id: RC,
    run_id: RUN,
    pack_digest: "sha256:pack-1",
    publication_state: state,
    replayed,
    approval_id: delivered ? APPROVAL : null,
    href: delivered ? `/governance/approvals/${APPROVAL}/r1` : null,
    downstream_receipt_digest: delivered ? "sha256:receipt-1" : null,
    attempt_count: 1,
    delivery_state: delivered ? "DELIVERED" : "UNKNOWN",
    approval_state: delivered ? "PENDING" : "UNKNOWN",
    updated_at_utc_ms: PUBLISHED_AT,
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
const SERVER_PROSE = "SECRET-SERVER-PROSE run owned by alice@example";
const problem = (status: number, code: string): Answer => ({
  status,
  body: { error: { code, message: SERVER_PROSE }, request_id: `req_${status}` },
});

/** `MIRROR` answers GET …/mirror; every other GET is the composition. */
function server(answers: Partial<Record<"GET" | "PATCH" | "POST" | "MIRROR", Answer[]>>) {
  const calls: Call[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const verb = (init?.method ?? "GET").toUpperCase() as "GET" | "PATCH" | "POST";
    const method = verb === "GET" && String(input).includes("/mirror") ? "MIRROR" : verb;
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
const publishButton = () => document.querySelector('[data-action="publish"]') as HTMLElement;
const reconcileButton = () => document.querySelector('[data-action="reconcile"]') as HTMLElement;

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
    expect(panelOrder()).toEqual(["header", "meta", "notice", "identity", "pack", "record", "seal", "publish", "mirror-ghost", "rules"]);
    expect((sealButton() as HTMLElement).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText(RC_RULES)).toBeTruthy();
  });

  it("S11-U02 renders the blocks in the hi-fi order RC_PANELS names", async () => {
    server({ GET: [ok(unbound())] });
    renderCompose();
    await ready("local seal blocked — review evidence");
    const notNow = (...names: string[]) => [...RC_PANELS.compose].filter((name) => !names.includes(name));
    expect(panelOrder()).toEqual(notNow("sealed", "publish-unknown", "published", "mirror"));
    cleanup();
    server({ GET: [ok(sealed())] });
    renderCompose();
    await ready();
    expect(panelOrder()).toEqual(notNow("banner", "publish-unknown", "published", "mirror"));
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
    expect(within(panel("publish")).getByText(SOD_NOTE)).toBeTruthy();
    expect(panel("seal").textContent).not.toContain(SOD_NOTE);
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
    expect(caption.querySelector("[data-reason-code]")?.textContent).toBe("P22_NO_PUBLISHED_PREDECESSOR");
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

  it("S11-U25 before a delivered publication the mirror is a ghost with nothing to operate, and publish names its blocker", async () => {
    const api = server({ GET: [ok(compose())] });
    renderCompose();
    await ready();
    const ghost = panel("mirror-ghost");
    expect(ghost.querySelectorAll("button, a, input, textarea, select, [tabindex]")).toHaveLength(0);
    expect(ghost.textContent).toContain("R1 · RESEARCH EVIDENCE");
    expect(ghost.textContent).toContain("SLA starts at publish");
    expect(ghost.querySelector("[data-mirror-foot]")?.textContent).toBe("mirror not published · P22_NOT_PUBLISHED");
    /* VD-P21-20: the hi-fi's bare "—" status is a typed absence here (hard rule 3). */
    expect(ghost.querySelector("[data-mirror-status]")?.textContent).toBe("status not published");
    for (const leaf of Array.from(ghost.querySelectorAll("span"))) expect(leaf.textContent?.trim()).not.toBe("—");
    const publish = publishButton();
    expect(publish.textContent).toBe("seal the evidence pack first");
    expect(publish.getAttribute("aria-disabled")).toBe("true");
    expect(document.getElementById(publish.getAttribute("aria-describedby")!)?.textContent).toBe("P21_LOCAL_SEAL_NOT_CREATED");
    fireEvent.click(publish);
    expect(api.of("POST")).toHaveLength(0);
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

describe("Screen 11 publish and approval mirror (P22)", () => {
  const PUBLISH_PATH = `/api/v1/research/release-candidates/${RC}/publish`;
  const PUBLISHED_TITLE = "published — immutable · R1 review in Approval Inbox";
  const describedBy = (el: HTMLElement) => document.getElementById(el.getAttribute("aria-describedby") ?? "")?.textContent;
  const setVisibility = (state: "visible" | "hidden") => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
  };
  afterEach(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  });

  it("S11-U34 a sealed candidate offers the hi-fi publish button with the rc id and keeps the SoD note", async () => {
    const api = server({ GET: [ok(sealed())] });
    renderCompose();
    await ready();
    const button = publishButton();
    expect(button.textContent).toBe(`Publish release candidate ${RC}`);
    expect(button.getAttribute("aria-disabled")).toBeNull();
    expect(button.getAttribute("aria-describedby")).toBeNull();
    const card = panel("publish");
    expect(card.querySelector("[data-publish-sentence]")?.textContent).toBe(
      `Publishing freezes this exact combination as ${RC} in the portal governance store. It creates no account, no allocation, and does not start Paper — it only makes the candidate reviewable.`,
    );
    expect(card.querySelector("[data-publish-rc]")?.className).toContain("rc-mono");
    expect(within(card).getByText(SOD_NOTE)).toBeTruthy();
    expect(card.querySelector("[data-claim-choice]")).toBeNull();
    expect(api.of("POST")).toHaveLength(0);
    expect(api.of("MIRROR")).toHaveLength(0);
  });

  it.each([
    ["P22_PUBLICATION_DISABLED", "publish — not enabled in this build"],
    ["P21_LOCAL_SEAL_NOT_CREATED", "seal the evidence pack first"],
    ["P22_RUN_NOT_MIRRORED", "publish blocked — this run is not mirrored to the governance store"],
    ["P22_PUBLICATION_PENDING_RECONCILE", "publication outcome unknown — reconcile first"],
    ["P21_SCRATCH_RUN_UNBOUND", "publish blocked — bind alpha_version first"],
    ["P22_PACK_NOT_CURRENT", "P22_PACK_NOT_CURRENT"],
  ])("S11-U35 a publish blocked by %s is labelled, described by its code and sends nothing", async (code, label) => {
    const api = server({ GET: [ok(sealed({}, { enabled: false, blocked_reason: code }))] });
    renderCompose();
    await ready();
    const button = publishButton();
    expect(button.textContent).toBe(label);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.getAttribute("data-publish-enabled")).toBe("false");
    expect(describedBy(button)).toBe(code);
    fireEvent.click(button);
    expect(api.of("POST")).toHaveLength(0);
  });

  it("S11-U36 one click publishes with the pack fence, shows publishing…, then prints the server's PUBLISHED state, card and mirror", async () => {
    const gate = deferred();
    const api = server({ GET: [ok(sealed()), ok(published())], POST: [{ ...ok(publicationAnswer("DELIVERED"), 201), hold: gate.promise }] });
    renderCompose();
    await ready();
    fireEvent.click(publishButton());
    fireEvent.click(publishButton());
    expect(publishButton().textContent).toBe(PUBLISHING_LABEL);
    expect(publishButton().getAttribute("aria-busy")).toBe("true");
    expect(document.querySelector("[data-state-chip]")?.textContent).toBe("DRAFT");
    gate.release();
    await screen.findByText(PUBLISHED_TITLE);
    expect(api.of("POST")).toHaveLength(1);
    const [post] = api.of("POST");
    expect(post.url).toBe(PUBLISH_PATH);
    expect(post.headers["x-portal-csrf"]).toBe("tok_123");
    expect(post.body).toEqual({ schema_version: "research.release-candidate-publish-request.v1", expected_pack_digest: "sha256:pack-1" });
    expect(api.of("GET")).toHaveLength(2);
    const chip = document.querySelector("[data-state-chip]")!;
    expect(chip.textContent).toBe("PUBLISHED");
    expect(chip.getAttribute("data-s")).toBe("PUBLISHED");
    const rc = document.querySelector('[data-rail-node="release_candidate"]')!;
    expect(rc.getAttribute("data-tone")).toBe("green");
    expect(rc.querySelector("[data-rail-detail]")?.textContent).toBe("published · immutable");
    const card = panel("published");
    expect(card.querySelector("h3")?.textContent).toBe("published — immutable");
    expect(within(card).getByRole("link", { name: RC }).getAttribute("href")).toBe(`/research/quantbt/release-candidates/${RC}`);
    expect(card.querySelector("[data-published-facts]")?.textContent).toBe(
      `published_at 2026-09-20 12:30Z · by researcher@bobby · evidence digest sha256:evidence-set-1. ${PUBLISHED_SENTENCE}`,
    );
    expect(card.querySelector("[data-published-receipt]")?.textContent).toBe(`receipt sha256:receipt-1 · approval ${APPROVAL}`);
    const mirrorCard = panel("mirror");
    expect(panel("mirror-ghost")).toBeNull();
    expect(mirrorCard.querySelector(".gate")?.textContent).toBe("R1 · RESEARCH EVIDENCE");
    expect(mirrorCard.querySelector("[data-mirror-subject]")?.textContent).toBe(`${RC} — ${ALPHA} alphaver_1`);
    expect(mirrorCard.querySelector("[data-mirror-status]")?.textContent).toBe("PENDING");
    expect(mirrorCard.querySelector("[data-mirror-sla]")?.textContent).toBe(
      "SLA due 2026-09-21T12:30:00.000Z · expires 2026-09-23T12:30:00.000Z · time left — not published",
    );
    expect(mirrorCard.querySelector("[data-mirror-meta]")?.textContent).toBe(`${MIRROR_POOL_ABSENT}·${MIRROR_CONDITIONS_NONE}·${MIRROR_OUTCOMES}`);
    expect(within(mirrorCard).getByText(MIRROR_PUBLISHED_NOTE)).toBeTruthy();
    expect(within(mirrorCard).getByRole("link", { name: MIRROR_INBOX_LINK }).getAttribute("href")).toBe(`/governance/approvals/${APPROVAL}/r1`);
    expect(mirrorCard.querySelectorAll("button, input, textarea, select")).toHaveLength(0);
    expect(mirrorCard.querySelector("[data-mirror-superseded]")).toBeNull();
    /* T07: a published candidate is read-only. */
    expect(document.querySelectorAll('[data-action="edit-declaration"]')).toHaveLength(0);
    expect(describedBy(sealButton())).toContain("published — immutable");
    expect(publishButton()).toBeNull();
    const absent = ["banner", "publish", "publish-unknown", "mirror-ghost"];
    expect(panelOrder()).toEqual(RC_PANELS.compose.filter((name) => !absent.includes(name)));
  });

  it("S11-U37 a 202 shows the unknown-outcome card, never PUBLISHED, and reconcile recovers the receipt", async () => {
    const api = server({
      GET: [ok(sealed()), ok(unknownOutcome()), ok(published())],
      POST: [ok(publicationAnswer("UNKNOWN"), 202), ok(publicationAnswer("DELIVERED"), 200)],
    });
    renderCompose();
    await ready();
    fireEvent.click(publishButton());
    const unknown = await until('[data-panel="publish-unknown"]');
    expect(unknown.textContent).toContain(UNKNOWN_COPY);
    await waitFor(() => expect(api.of("GET")).toHaveLength(2));
    await waitFor(() => expect(document.querySelector("[data-publication-facts]")).toBeTruthy());
    expect(document.querySelector("[data-state-chip]")?.textContent).toBe("DRAFT");
    expect(panel("published")).toBeNull();
    expect(panel("mirror")).toBeNull();
    expect(document.querySelector("[data-publication-facts]")?.textContent).toBe(
      "publication UNKNOWN · attempt 1 · recorded 2026-09-20 12:30Z · by researcher@bobby",
    );
    await waitFor(() => expect(reconcileButton().getAttribute("aria-disabled")).toBeNull());
    fireEvent.click(reconcileButton());
    await screen.findByText(PUBLISHED_TITLE);
    const posts = api.of("POST");
    expect(posts).toHaveLength(2);
    expect(posts[1].url).toBe(`${PUBLISH_PATH}/reconcile`);
    expect(posts[1].headers["x-portal-csrf"]).toBe("tok_123");
    expect(posts[1].body).toEqual({ schema_version: "research.release-candidate-publish-reconcile-request.v1" });
    expect(document.querySelector("[data-state-chip]")?.textContent).toBe("PUBLISHED");
  });

  it("S11-U38 a 409 on publish says the evidence changed and reads the composition again", async () => {
    const moved = sealed();
    moved.source_fingerprint = "sha256:source-fp-2";
    const api = server({ GET: [ok(sealed()), ok(moved)], POST: [problem(409, "RESEARCH_PUBLICATION_CONFLICT")] });
    renderCompose();
    await ready();
    fireEvent.click(publishButton());
    const notice = await until('[data-write-notice="publish"][data-outcome="conflict"]');
    expect(notice.firstElementChild?.textContent).toBe(RC_CONFLICT_COPY);
    expect(notice.querySelector("[data-error-code]")?.textContent).toBe("RESEARCH_PUBLICATION_CONFLICT");
    await waitFor(() => expect(panel("meta").textContent).toContain("sha256:source-fp-2"));
    expect(api.of("GET")).toHaveLength(2);
    expect(panel("published")).toBeNull();
  });

  it("S11-U39 an open R1 approval is reported, nothing is attached, and the server's conflicting id is printed without a link", async () => {
    const conflict = sealed({ availability: AVAILABLE, state: "CONFLICT", conflicting_approval_id: "apr_00", attempt_count: 1, intent_actor: ACTOR, updated_at_utc_ms: PUBLISHED_AT });
    const api = server({ GET: [ok(sealed()), ok(conflict)], POST: [problem(409, "RESEARCH_PUBLICATION_OPEN_APPROVAL_EXISTS")] });
    renderCompose();
    await ready();
    fireEvent.click(publishButton());
    const notice = await until('[data-write-notice="publish"][data-outcome="conflict"]');
    expect(notice.firstElementChild?.textContent).toBe(RC_OPEN_APPROVAL_COPY);
    await waitFor(() => expect(document.querySelector("[data-conflicting-approval]")?.textContent).toBe("apr_00"));
    expect(panel("publish").querySelectorAll("a")).toHaveLength(0);
    expect(document.querySelector("[data-state-chip]")?.textContent).toBe("DRAFT");
    expect(panel("mirror")).toBeNull();
    expect(panel("mirror-ghost")).toBeTruthy();
    expect(api.of("MIRROR")).toHaveLength(0);
  });

  it("S11-U40 a retryable 409 says the publication did not settle, not that the evidence changed", async () => {
    const pending = sealed(
      { availability: AVAILABLE, state: "PENDING", attempt_count: 1, intent_actor: ACTOR, updated_at_utc_ms: PUBLISHED_AT, downstream_code: "APPROVAL_CREATE_SERIALIZATION_CONFLICT", reconcile_allowed: true },
      { enabled: false, blocked_reason: "P22_PUBLICATION_PENDING_RECONCILE" },
    );
    server({ GET: [ok(sealed()), ok(pending)], POST: [problem(409, "RESEARCH_PUBLICATION_RETRYABLE")] });
    renderCompose();
    await ready();
    fireEvent.click(publishButton());
    const unknown = await until('[data-panel="publish-unknown"]');
    const notice = await until('[data-write-notice="publish"][data-outcome="conflict"]');
    expect(unknown.contains(notice)).toBe(true);
    expect(notice.firstElementChild?.textContent).toBe(RC_RETRYABLE_COPY);
    expect(notice.textContent).not.toContain(RC_CONFLICT_COPY);
    await waitFor(() => expect(document.querySelector("[data-downstream-code]")?.textContent).toBe("APPROVAL_CREATE_SERIALIZATION_CONFLICT"));
    expect(reconcileButton().getAttribute("aria-disabled")).toBeNull();
  });

  it("S11-U41 a 422 ends that publish with its code, keeps the INPUT rows and reads nothing again", async () => {
    const api = server({ GET: [ok(sealed())], POST: [problem(422, "RESEARCH_PUBLICATION_RUN_NOT_MIRRORED")] });
    renderCompose();
    await ready();
    fireEvent.click(publishButton());
    const notice = await until('[data-write-notice="publish"][data-outcome="terminal"]');
    expect(notice.firstElementChild?.textContent).toBe(RC_PUBLISH_REFUSED_COPY);
    expect(notice.querySelector("[data-error-code]")?.textContent).toBe("RESEARCH_PUBLICATION_RUN_NOT_MIRRORED");
    expect(document.querySelectorAll('[data-action="edit-declaration"]')).toHaveLength(2);
    expect(document.querySelector('[data-declared="KNOWN_LIMITATIONS_WAIVERS"]')?.textContent).toBe("fees modelled at taker");
    expect(api.of("GET")).toHaveLength(1);
    expect(document.querySelector("[data-state-chip]")?.textContent).toBe("DRAFT");
  });

  it("S11-U42 a 401 on publish locks every write, never retries and never polls", async () => {
    const api = server({ GET: [ok(sealed())], POST: [problem(401, "UNAUTHENTICATED")] });
    renderCompose();
    await ready();
    fireEvent.click(publishButton());
    const notice = await until('[data-write-notice="publish"][data-outcome="denied"]');
    expect(notice.firstElementChild?.textContent).toBe(RC_DENIED_COPY);
    expect(publishButton().getAttribute("aria-disabled")).toBe("true");
    expect(describedBy(publishButton())).toBe("writes are off — access changed");
    fireEvent.click(publishButton());
    fireEvent.click(sealButton());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(api.of("POST")).toHaveLength(1);
    expect(api.of("MIRROR")).toHaveLength(0);
    expect(page().getAttribute("data-mirror-polling")).toBe("false");
  });

  it("S11-U43 a publish refused with 403 and with 404 says the same neutral sentence", async () => {
    const seen: string[] = [];
    for (const status of [403, 404]) {
      server({ GET: [ok(sealed())], POST: [problem(status, "RESEARCH_RELEASE_CANDIDATE_NOT_FOUND")] });
      renderCompose();
      await ready();
      fireEvent.click(publishButton());
      const notice = await until('[data-write-notice="publish"][data-outcome="denied"]');
      seen.push(notice.firstElementChild!.textContent!);
      cleanup();
      vi.restoreAllMocks();
    }
    expect(seen[0]).toBe(`${RC_DENIED_COPY} ${RC_NEUTRAL_REFUSAL}`);
    expect(seen[1]).toBe(seen[0]);
  });

  it("S11-U44 a 503 on publish is unavailable, keeps DRAFT and lets the reader send it again", async () => {
    const api = server({
      GET: [ok(sealed()), ok(published())],
      POST: [problem(503, "RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE"), ok(publicationAnswer("DELIVERED"), 201)],
    });
    renderCompose();
    await ready();
    fireEvent.click(publishButton());
    const notice = await until('[data-write-notice="publish"][data-outcome="unavailable"]');
    expect(notice.firstElementChild?.textContent).toBe(RC_UNAVAILABLE_COPY);
    expect(document.querySelector("[data-state-chip]")?.textContent).toBe("DRAFT");
    expect(api.of("GET")).toHaveLength(1);
    expect(publishButton().getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(publishButton());
    await screen.findByText(PUBLISHED_TITLE);
    expect(api.of("POST")).toHaveLength(2);
  });

  it("S11-U45 while PUBLISHED the mirror is read every 60 s; a later 5xx keeps the last read as stale with its as-of", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const approved = mirror({ status: "APPROVED", effective_status: "APPROVED", decision_outcomes: ["APPROVED"], as_of_utc_ms: PUBLISHED_AT + 60_000 });
    const api = server({ GET: [ok(published())], MIRROR: [ok(approved), problem(503, "RESEARCH_PUBLICATION_MIRROR_UNAVAILABLE")] });
    renderCompose();
    await ready(PUBLISHED_TITLE);
    expect(api.of("MIRROR")).toHaveLength(0);
    await waitFor(() => expect(page().getAttribute("data-mirror-polling")).toBe("true"));
    await act(() => vi.advanceTimersByTimeAsync(MIRROR_POLL_MS));
    await waitFor(() => expect(panel("mirror").querySelector("[data-mirror-status]")?.textContent).toBe("APPROVED"));
    expect(api.of("MIRROR")[0].url).toBe(`/api/v1/research/release-candidates/${RC}/mirror`);
    expect(api.of("MIRROR")[0].headers["x-portal-csrf"]).toBeUndefined();
    expect(panel("mirror").querySelector("[data-mirror-facts]")?.textContent).toContain("decisions APPROVED");
    expect(page().getAttribute("data-mirror-requests")).toBe("1");
    await act(() => vi.advanceTimersByTimeAsync(MIRROR_POLL_MS));
    const stale = await until("[data-mirror-stale]");
    expect(stale.textContent).toBe("mirror as of 2026-09-20 12:31Z — the governance store did not answer");
    expect(panel("mirror").getAttribute("data-mirror-view")).toBe("stale");
    expect(panel("mirror").querySelector("[data-mirror-status]")?.textContent).toBe("APPROVED");
    expect(api.of("GET")).toHaveLength(1);
    expect(document.body.textContent).not.toContain("SECRET-SERVER-PROSE");
  });

  it("S11-U46 a 401 on the mirror is denied: the facts go, the poll stops", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = server({ GET: [ok(published())], MIRROR: [problem(401, "UNAUTHENTICATED")] });
    renderCompose();
    await ready(PUBLISHED_TITLE);
    await act(() => vi.advanceTimersByTimeAsync(MIRROR_POLL_MS));
    const denied = await until("[data-mirror-denied]");
    expect(denied.firstElementChild?.textContent).toBe(RC_DENIED_COPY);
    expect(panel("mirror").querySelector("[data-mirror-status]")).toBeNull();
    expect(panel("mirror").querySelector("[data-mirror-facts]")).toBeNull();
    expect(panel("published").querySelector("[data-evidence-digest]")).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(MIRROR_POLL_MS * 3));
    expect(api.of("MIRROR")).toHaveLength(1);
    expect(page().getAttribute("data-mirror-polling")).toBe("false");
  });

  it("S11-U47 a mirror read refused with 403 and with 404 reads the same", async () => {
    const seen: string[] = [];
    for (const status of [403, 404]) {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      server({ GET: [ok(published())], MIRROR: [problem(status, "RESEARCH_RELEASE_CANDIDATE_NOT_FOUND")] });
      renderCompose();
      await ready(PUBLISHED_TITLE);
      await act(() => vi.advanceTimersByTimeAsync(MIRROR_POLL_MS));
      const denied = await until("[data-mirror-denied]");
      seen.push(denied.firstElementChild!.textContent!);
      cleanup();
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
    expect(seen[0]).toBe(`${RC_DENIED_COPY} ${RC_NEUTRAL_REFUSAL}`);
    expect(seen[1]).toBe(seen[0]);
  });

  it("S11-U48 a refused mirror read with no prior read is unavailable; with one it is stale; denial drops it", () => {
    const prior = mirror();
    const down = new PortalApiError("503", 503, "RESEARCH_PUBLICATION_MIRROR_UNAVAILABLE", "req_503");
    expect(nextMirrorView(null, down)).toEqual({
      mirror: null,
      view: { state: "unavailable", status: 503, code: "RESEARCH_PUBLICATION_MIRROR_UNAVAILABLE", requestId: "req_503" },
    });
    expect(nextMirrorView(null, new TypeError("network"))).toEqual({ mirror: null, view: { state: "unavailable", status: 0, code: null, requestId: null } });
    expect(nextMirrorView(prior, down)).toEqual({
      mirror: prior,
      view: { state: "stale", asOfUtcMs: PUBLISHED_AT, status: 503, code: "RESEARCH_PUBLICATION_MIRROR_UNAVAILABLE", requestId: "req_503" },
    });
    for (const status of [401, 403, 404]) {
      const next = nextMirrorView(prior, new PortalApiError(String(status), status, "X", null));
      expect(next.mirror).toBeNull();
      expect(next.view.state).toBe("denied");
    }
  });

  it("S11-U49 a hidden tab clears the timer, a visible one re-arms it, and unmounting stops it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = server({ GET: [ok(published())], MIRROR: [ok(mirror())] });
    const view = renderCompose();
    await ready(PUBLISHED_TITLE);
    await waitFor(() => expect(page().getAttribute("data-mirror-polling")).toBe("true"));
    setVisibility("hidden");
    await waitFor(() => expect(page().getAttribute("data-mirror-polling")).toBe("false"));
    await act(() => vi.advanceTimersByTimeAsync(MIRROR_POLL_MS * 2));
    expect(api.of("MIRROR")).toHaveLength(0);
    setVisibility("visible");
    await waitFor(() => expect(page().getAttribute("data-mirror-polling")).toBe("true"));
    await act(() => vi.advanceTimersByTimeAsync(MIRROR_POLL_MS));
    await waitFor(() => expect(api.of("MIRROR")).toHaveLength(1));
    act(() => view.unmount());
    await act(() => vi.advanceTimersByTimeAsync(MIRROR_POLL_MS * 3));
    expect(api.of("MIRROR")).toHaveLength(1);
  });

  it("S11-U50 without the R1 read authority the mirror prints the id and link, 'not readable', and no status", async () => {
    server({ GET: [ok(published(deniedMirror()))] });
    renderCompose();
    await ready(PUBLISHED_TITLE);
    const card = panel("mirror");
    expect(card.querySelector("[data-mirror-status]")?.textContent).toBe(`approval status: ${MIRROR_NOT_READABLE}`);
    expect(card.querySelector(".rc-mstatus")).toBeNull();
    expect(card.querySelector("[data-mirror-subject] [data-reason-code]")?.textContent).toBe("GOVERNANCE_R1_READ_DENIED");
    expect(card.querySelector("[data-mirror-facts]")?.textContent).toContain(`approval ${APPROVAL} · version not published`);
    expect(within(card).getByRole("link", { name: MIRROR_INBOX_LINK }).getAttribute("href")).toBe(`/governance/approvals/${APPROVAL}/r1`);
    expect(panel("published").querySelector("[data-evidence-digest]")).toBeNull();
    expect(panel("published").querySelector("[data-published-facts] [data-reason-code]")?.textContent).toBe("GOVERNANCE_R1_READ_DENIED");
    for (const leaf of Array.from(card.querySelectorAll("*"))) {
      if (leaf.children.length === 0) expect(["0", "-", "N/A", "—"]).not.toContain((leaf.textContent ?? "").trim());
    }
  });

  it("S11-U51 rc_superseded is its own line; the raw status stays as the server sent it", async () => {
    server({
      GET: [ok(published(mirror({ status: "APPROVED", effective_status: "APPROVED", rc_superseded: true, conditions: ["paper only"], condition_count: 1 })))],
    });
    renderCompose();
    await ready(PUBLISHED_TITLE);
    const card = panel("mirror");
    expect(card.querySelector("[data-mirror-status]")?.textContent).toBe("APPROVED");
    expect(card.querySelector("[data-mirror-superseded]")?.textContent).toBe(MIRROR_SUPERSEDED);
    expect(card.querySelector("[data-mirror-conditions]")?.textContent).toBe("conditions: paper only");
  });

  it("S11-U52 several mirrored claims need a choice from the server's list before publish sends it", async () => {
    const api = server({
      GET: [ok(sealed({ claim_candidates: ["claim_a", "claim_b"] })), ok(published())],
      POST: [ok(publicationAnswer("DELIVERED"), 201)],
    });
    renderCompose();
    await ready();
    const choice = panel("publish").querySelector("[data-claim-choice]")!;
    expect(choice.querySelector("legend")?.textContent).toBe(CLAIM_LEGEND);
    expect([...choice.querySelectorAll("[data-claim]")].map((radio) => radio.getAttribute("data-claim"))).toEqual(["claim_a", "claim_b"]);
    expect(publishButton().textContent).toBe(CLAIM_REQUIRED);
    fireEvent.click(publishButton());
    expect(api.of("POST")).toHaveLength(0);
    fireEvent.click(choice.querySelector('[data-claim="claim_b"]')!);
    expect(publishButton().textContent).toBe(`Publish release candidate ${RC}`);
    fireEvent.click(publishButton());
    await screen.findByText(PUBLISHED_TITLE);
    expect(api.of("POST")[0].body).toEqual({
      schema_version: "research.release-candidate-publish-request.v1",
      expected_pack_digest: "sha256:pack-1",
      methodology_claim_id: "claim_b",
    });
  });

  it("S11-U53 no refusal on publish, reconcile or the mirror ever renders the server's prose", async () => {
    for (const [status, code] of [
      [409, "RESEARCH_PUBLICATION_CONFLICT"],
      [422, "RESEARCH_PUBLICATION_REFUSED_DOWNSTREAM"],
      [503, "RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE"],
    ] as const) {
      server({ GET: [ok(sealed())], POST: [problem(status, code)] });
      renderCompose();
      await ready();
      fireEvent.click(publishButton());
      await until('[data-write-notice="publish"]');
      expect(document.body.textContent, String(status)).not.toContain("SECRET-SERVER-PROSE");
      cleanup();
      vi.restoreAllMocks();
    }
    server({ GET: [ok(unknownOutcome())], POST: [problem(409, "RESEARCH_PUBLICATION_RECOVERY_ACTOR_MISMATCH")] });
    renderCompose();
    await ready();
    fireEvent.click(reconcileButton());
    const notice = await until('[data-write-notice="reconcile"]');
    expect(notice.firstElementChild?.textContent).toBe(RC_ACTOR_MISMATCH_COPY);
    expect(document.body.textContent).not.toContain("SECRET-SERVER-PROSE");
  });

  it("S11-U54 reconcile is off unless the server admits it for this reader", async () => {
    const base = unknownOutcome();
    const api = server({ GET: [ok({ ...base, publication: { ...base.publication, reconcile_allowed: false } })] });
    renderCompose();
    await ready();
    const button = reconcileButton();
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(describedBy(button)).toBe(RECONCILE_NOT_ADMITTED);
    fireEvent.click(button);
    expect(api.of("POST")).toHaveLength(0);
    expect(panel("publish")).toBeNull();
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
  const S11 = [
    "ReleaseCandidateDetail.tsx",
    "ReleaseCandidateRoute.tsx",
    "releaseCandidateClient.ts",
    "useReleaseCandidate.ts",
    "useReleaseCandidateMirror.ts",
  ];
  const source = (name: string) => readFileSync(join(process.cwd(), "src", "research", name), "utf8");

  it("S11-U32 no S11 file formats, sorts or scrolls on the client", () => {
    for (const name of S11) {
      expect(source(name), name).not.toMatch(/toFixed|Intl|toLocaleString|sort\(|scrollIntoView/);
    }
  });

  it("S11-U55 no S11 file writes a raw hex colour; the PUBLISHED chip and the mirror/ghost borders are palette tokens", () => {
    for (const name of S11) {
      const code = source(name)
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("*") && !line.trimStart().startsWith("//"))
        .join("\n");
      expect(code, name).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
    const detail = source("ReleaseCandidateDetail.tsx");
    expect(detail).toContain('.rc-state[data-s="SEALED_LOCAL"], .rc-state[data-s="PUBLISHED"] { border-color: var(--good); color: var(--good); background: var(--good-bg); }');
    expect(detail).toContain(".rc-mirror { border: 1px solid var(--line);");
    expect(detail).toContain(".rc-ghost { border: 1px dashed var(--line-strong);");
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
