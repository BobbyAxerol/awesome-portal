/**
 * Screen 11 Release Candidate — consumer tests (P21 compose/seal + P22 publish).
 *
 * The compositions are the ones the Research preview served (`w5cRealRc.fixture.json`:
 * P04 and the pre-W7 WFO run) and the two canonical W7 retained-lane bodies
 * (`packages/contracts/fixtures/research-release-candidate.wfo-retained*.valid.json`);
 * each variant is that answer with the fields a case needs changed, never a
 * hand-built body. The publication read is the Codex P22 wire
 * (`research.release-candidate-publication.v1`), the only P22 read there is.
 *
 * The claims this file carries:
 *
 *  - **the server composes; the screen prints** — 17 lines and 12 rows in
 *    order, the counter as sent, reasons with their sentence and their code;
 *  - **writes are fenced, confirmed and never retried on their own** — a save
 *    carries the fences in hand, a seal and a publish each need a confirmation,
 *    a refusal keeps every typed character;
 *  - **publish is the server's gate** — P21 `actions.publish` and P22
 *    `may_publish` / `blocked_reason` both hold, the body carries only the
 *    pack digest and a listed claim, and `PUBLISHED` is printed only from a
 *    server fact;
 *  - **the publication read has typed states** — a transient failure keeps
 *    polling on a backoff and never becomes "denied"; 401 is its own state and
 *    raises the shell's session signal; 403 and 404 are one state with one
 *    sentence; a delivered candidate never shows the ghost;
 *  - **nothing is invented** — the assignee pool, decisions, quorum and the
 *    effective status print only as the server sent them (FG-05);
 *  - **two P22 routes only** — no request in this file ever reaches `/mirror`
 *    or `/publish/reconcile`.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ALPHA360_TITLE,
  CEILING_TITLE,
  CLAIM_REQUIRED,
  ENGCERT_TITLE,
  MIRROR_INBOX_LINK,
  MIRROR_NOT_READABLE,
  MIRROR_NOTE,
  MIRROR_OUTCOMES,
  MIRROR_POOL_ABSENT,
  MIRROR_PUBLISHED_NOTE,
  MIRROR_SUPERSEDED,
  NOT_PUBLISHABLE_BADGE,
  NOT_PUBLISHABLE_TITLE,
  PUBLISH_SENTENCE,
  SEALED_SENTENCE,
  UNKNOWN_SHORT,
  PACK_FOOT_TITLE,
  PUBLISH_CONFIRM,
  PUBLISH_UNBOUND_LABEL,
  PUBLISHED_SENTENCE,
  PUBLISHING_LABEL,
  RC_PANELS,
  RC_TITLE,
  SEAL_CONFIRM,
  SEAL_DIRTY,
  SEAL_LABEL,
  SEAL_SENTENCE,
  SOD_NOTE,
  STATUS_TITLE,
  UNKNOWN_COPY,
  digestText,
  publishBlock,
  stateWords,
} from "./ReleaseCandidateDetail";
import { ReleaseCandidatePackRoute, ReleaseCandidateRoute } from "./ReleaseCandidateRoute";
import {
  RC_CONFLICT_COPY,
  RC_DENIED_COPY,
  RC_NEUTRAL_REFUSAL,
  RC_PUBLISH_CONFLICT_COPY,
  RC_PUBLISH_UNAVAILABLE_COPY,
  RC_REASON_SENTENCES,
  RC_UNAVAILABLE_COPY,
  declarationIssues,
  packFromHash,
  packSourceRoute,
  rcReasonSentence,
  releaseCandidateHref,
  releaseCandidatePackHref,
  yamlText,
  type RcCompose,
  type RcPack,
  type RcPublication,
  type RcSealResponse,
} from "./releaseCandidateClient";
import { PUBLICATION_BACKOFF_MS, PUBLICATION_POLL_MS, nextPublicationView } from "./useReleaseCandidatePublication";
import { PortalApiError } from "../lib/api";
import { onSessionExpired } from "../auth/sessionExpiry";
import { iso } from "./utcMinute";
import real from "./w5cRealRc.fixture.json";
import { forgetRunLabels } from "./runLabels";

vi.mock("../auth/authApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../auth/authApi")>()),
  csrfTokenFromCookie: () => "tok_123",
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  forgetRunLabels();
  vi.useRealTimers();
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
});

/* ---------------------------------------------------------------- fixtures */

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const P04 = real.p04 as unknown as RcCompose;
const WFO_PRE_W7 = real.wfo as unknown as RcCompose;
const contractFixture = (name: string) =>
  JSON.parse(readFileSync(join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures", name), "utf8")) as RcCompose;
const W7_VIRTUAL = contractFixture("research-release-candidate.wfo-retained.valid.json");
const W7_DECLARED = contractFixture("research-release-candidate.wfo-retained-declared.valid.json");

const RUN = P04.run_id;
const ALPHA = P04.run.binding!.alpha_id;
const AV = P04.run.binding!.alpha_version_id;
const RC_ID = "rc_01K5W5CSEA1ED0000000000000";
const OTHER_RC = "rc_01K5W5CSEA1ED0000000000001";
const DRAFT_ID = "rcd_01K5W5CDRAFT00000000000AB";
const SEALED_AT = 1_790_320_100_000;
const PUBLISHED_AT = SEALED_AT + 3_600_000;
const PACK_DIGEST = "5".repeat(64);
const CLAIM = "mclaim_delta_oos";
const APPROVAL = "apr_01K5W5C";
const SERVER_PROSE = "SECRET-SERVER-PROSE run owned by alice@example";

/** The P04 answer with its three MISSING rows resolved: what a sealable composition looks like. */
function sealable(overrides: { saved?: boolean; revision?: number } = {}): RcCompose {
  const body = clone(P04);
  const saved = overrides.saved ?? true;
  for (const item of body.pack) {
    if (item.status === "MISSING") Object.assign(item, { status: "COMPLETE", digest: "6".repeat(64), availability: { state: "AVAILABLE", reason_code: null } });
    if (item.status === "INPUT" && saved) Object.assign(item, { digest: "7".repeat(64), availability: { state: "AVAILABLE", reason_code: null } });
  }
  body.pack_counts = { complete: 9, degraded: 1, input: 2, missing: 0 };
  body.draft = saved
    ? {
        draft_id: DRAFT_ID,
        revision: overrides.revision ?? 1,
        source_fingerprint: body.source_fingerprint,
        known_limitations: "Single venue depth; funding modelled at a constant rate.",
        proposed_use_restrictions: "Paper first; BTCUSDT-PERP only.",
        state: "PERSISTED",
        updated_at_utc_ms: 1_790_320_050_000,
      }
    : body.draft;
  body.actions = {
    ...body.actions,
    may_seal: saved,
    seal_blocked_reason: saved ? null : "P21_RESEARCHER_DECLARATIONS_REQUIRED",
    publish: { enabled: false, blocked_reason: "P22_LOCAL_SEAL_REQUIRED" },
  };
  body.gate_verdict = { ...body.gate_verdict, title: saved ? "local seal ready — downstream publish remains P22" : body.gate_verdict.title };
  body.source_absences = { ...body.source_absences, approval_mirror: { state: "NOT_PUBLISHED", reason_code: "P22_LOCAL_SEAL_REQUIRED" } };
  return body;
}

/** A sealed candidate; `publish` is the P21 affordance the server returns (intake open by default). */
function sealed(publish: RcCompose["actions"]["publish"] = { enabled: true, blocked_reason: null }): RcCompose {
  const body = sealable();
  body.local_seal = {
    state: "SEALED_LOCAL",
    release_candidate_id: RC_ID,
    pack_digest: PACK_DIGEST,
    sealed_at_utc_ms: SEALED_AT,
    delivery_state: "NOT_DELIVERED",
    approval_state: "NOT_APPROVED",
    availability: { state: "AVAILABLE", reason_code: null },
  };
  body.rail = body.rail.map((node) => (node.key === "release_candidate" ? { ...node, value: RC_ID, detail: "sealed locally — not delivered", tone: "green" } : node));
  /* Typed builder (derived from the generated RcCompose type + the canonical P04 fixture): the server after 8bd781ed
     serves ACTOR-LOCAL flags — this actor's own draft is sealed, so edit and seal are off with the typed reason. */
  body.actions = { ...body.actions, may_edit_draft: false, may_seal: false, seal_blocked_reason: "P21_ALREADY_SEALED", publish };
  body.source_absences = { ...body.source_absences, approval_mirror: { state: "NOT_PUBLISHED", reason_code: "P22_NOT_PUBLISHED" } };
  return body;
}

/** A PEER actor sealed this run: the run-level pack is served, but this actor's own flags stay open (typed builder, as above). */
function peerSealed(): RcCompose {
  const body = sealed();
  body.actions = { ...body.actions, may_edit_draft: true, may_seal: true, seal_blocked_reason: null };
  return body;
}

/** The composition after P22 delivered it: the seal's own delivery fact says so. */
function deliveredCompose(): RcCompose {
  const body = sealed({ enabled: false, blocked_reason: "P22_ALREADY_DELIVERED" });
  body.local_seal = { ...body.local_seal, delivery_state: "DELIVERED", approval_state: "PENDING" };
  body.source_absences = { ...body.source_absences, approval_mirror: { state: "NOT_APPLICABLE", reason_code: "P22_MIRROR_READ_ON_PUBLICATION_ROUTE" } };
  return body;
}

function unbound(): RcCompose {
  const body = clone(P04);
  body.run.binding = null;
  body.rail = body.rail.map((node) => (node.key === "alpha" || node.key === "alpha_version" ? { ...node, value: "— unbound / scratch run", detail: null, tone: "dim" } : node));
  body.actions = { ...body.actions, may_seal: false, seal_blocked_reason: "P21_SCRATCH_RUN_UNBOUND", publish: { enabled: false, blocked_reason: "P22_LOCAL_SEAL_REQUIRED" } };
  body.source_absences = { ...body.source_absences, alpha_binding: { state: "NOT_PUBLISHED", reason_code: "P21_SCRATCH_RUN_UNBOUND" } };
  body.yaml = body.yaml.map((field) =>
    field.key === "alpha_version_id" ? { ...field, value: null, tone: "red", availability: { state: "NOT_PUBLISHED", reason_code: "P21_ALPHA_BINDING_NOT_PUBLISHED" } } : field,
  );
  body.fields = body.yaml;
  return body;
}

const sealResponse = (id = RC_ID): RcSealResponse => ({
  schema_version: "research.release-candidate-local-seal.v1",
  release_candidate_id: id,
  run_id: RUN,
  pack_digest: PACK_DIGEST,
  sealed_at_utc_ms: SEALED_AT,
  delivery_state: "NOT_DELIVERED",
  approval_state: "NOT_APPROVED",
});

function pack(delivery: RcPack["delivery"] = sealed().local_seal): RcPack {
  const body = sealed();
  return {
    schema_version: "research.release-candidate-pack.v1",
    read_authority: "PORTAL_PERSISTED_RESEARCH",
    release_candidate_id: RC_ID,
    run_id: RUN,
    display_label: null,
    pack_digest: PACK_DIGEST,
    sealed_at_utc_ms: SEALED_AT,
    frozen_core: {
      fields: body.fields.map((field) => (field.key === "release_candidate_id" ? { ...field, value: RC_ID, tone: "ink", availability: { state: "AVAILABLE", reason_code: null } } : field)),
      pack: body.pack,
      source_fingerprint: body.source_fingerprint,
      draft: { known_limitations: body.draft.known_limitations!, proposed_use_restrictions: body.draft.proposed_use_restrictions! },
    },
    delivery,
  };
}

/** The Codex P22 publication read (`research.release-candidate-publication.v1`), nothing published yet. */
function publication(overrides: Partial<RcPublication> = {}): RcPublication {
  return {
    schema_version: "research.release-candidate-publication.v1",
    release_candidate_id: RC_ID,
    run_id: RUN,
    alpha_id: ALPHA,
    alpha_version_id: AV,
    pack_digest: PACK_DIGEST,
    source: {
      availability: "AVAILABLE",
      reason_code: null,
      run_status: "COMPLETED",
      legacy_artifact_sha256: `sha256:${"b".repeat(64)}`,
      artifact_schema_version: "quantbt.selected-params.v1",
      eligible_methodology_claim_ids: [CLAIM],
      captured_at: "2026-09-25T10:00:00.000Z",
    },
    state: "NOT_PUBLISHED",
    candidate_relation: "CURRENT",
    may_publish: true,
    blocked_reason: null,
    published: null,
    approval_read: "NOT_PUBLISHED",
    approval: null,
    as_of_utc_ms: SEALED_AT + 60_000,
    replayed: false,
    ...overrides,
  };
}

const APPROVAL_BODY: NonNullable<RcPublication["approval"]> = {
  approval_id: APPROVAL,
  gate: "R1",
  status: "PENDING",
  subject_id: ALPHA,
  requester_user_id: "usr_researcher",
  evidence_set_hash: `sha256:${"c".repeat(64)}`,
  sla_due_at: "2026-09-27T09:12:00.000Z",
  expires_at: "2026-12-25T09:12:00.000Z",
  created_at: "2026-09-26T09:12:00.000Z",
  read_at: "2026-09-26T09:13:00.000Z",
  conditions: [],
  href: `/governance/approvals/${APPROVAL}/r1`,
  assignee_pool_availability: {
    state: "NOT_PUBLISHED",
    reason_code: "P22_GOVERNANCE_ASSIGNEE_POOL_NOT_PUBLISHED",
  },
};

function deliveredRead(overrides: Partial<RcPublication> = {}, approval: Partial<NonNullable<RcPublication["approval"]>> = {}): RcPublication {
  return publication({
    state: "DELIVERED",
    may_publish: false,
    blocked_reason: "P22_ALREADY_DELIVERED",
    published: { by_user_id: "usr_researcher", by_username: "researcher@bobby", approval_id: APPROVAL, at_utc_ms: PUBLISHED_AT, receipt_digest: "d".repeat(64) },
    approval_read: "AVAILABLE",
    approval: { ...APPROVAL_BODY, ...approval },
    as_of_utc_ms: PUBLISHED_AT + 60_000,
    ...overrides,
  });
}

/* ------------------------------------------------------------------ server */

type Lane = "COMPOSE" | "PATCH" | "SEAL" | "PACK" | "PUBLICATION" | "PUBLISH" | "OTHER";
interface Answer {
  status: number;
  body?: unknown;
  hold?: Promise<void>;
}
interface Call {
  url: string;
  lane: Lane;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

const ok = (body: unknown, status = 200): Answer => ({ status, body });
const problem = (status: number, code: string): Answer => ({ status, body: { error: { code, message: SERVER_PROSE }, request_id: `req_${status}` } });

function laneOf(url: string, method: string): Lane {
  const path = url.split("?")[0]!;
  if (/\/api\/v1\/quantbt\/runs\/[^/]+\/release-candidate$/.test(path) && method === "GET") return "COMPOSE";
  if (/\/release-candidate\/draft$/.test(path) && method === "PATCH") return "PATCH";
  if (/\/release-candidate\/seal$/.test(path) && method === "POST") return "SEAL";
  if (/\/api\/v1\/research\/release-candidates\/[^/]+\/publication$/.test(path) && method === "GET") return "PUBLICATION";
  if (/\/api\/v1\/research\/release-candidates\/[^/]+\/publish$/.test(path) && method === "POST") return "PUBLISH";
  if (/\/api\/v1\/research\/release-candidates\/[^/]+$/.test(path) && method === "GET") return "PACK";
  return "OTHER";
}

/** Every request any test in this file sent, for the file-wide route guard (S11-U60). */
const ALL_CALLS: Array<{ url: string; method: string }> = [];

/** Counts the shell's session-expired reports until the returned stop is called. */
function sessionReports() {
  let count = 0;
  const stop = onSessionExpired(() => {
    count += 1;
  });
  return { count: () => count, stop };
}

function server(answers: Partial<Record<Lane, Answer[]>>) {
  const calls: Call[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const lane = laneOf(url, method);
    ALL_CALLS.push({ url, method });
    calls.push({
      url,
      lane,
      method,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    const queue = answers[lane] ?? [];
    const answer = queue.length > 1 ? queue.shift()! : queue[0];
    if (!answer) return new Response(JSON.stringify({ error: { code: "NOT_STUBBED" } }), { status: 404, headers: { "content-type": "application/json" } });
    if (answer.hold) await answer.hold;
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } });
  });
  return { calls, of: (lane: Lane) => calls.filter((call) => call.lane === lane) };
}

function Where() {
  const location = useLocation();
  return <span data-testid="where">{`${location.pathname}${location.hash}`}</span>;
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/research/quantbt/runs/:runId/release-candidate" element={<ReleaseCandidateRoute />} />
        <Route path="/research/quantbt/release-candidates/:releaseCandidateId" element={<ReleaseCandidatePackRoute />} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );
}

const renderCompose = (runId = RUN) => renderAt(`/research/quantbt/runs/${runId}/release-candidate`);
const q = <T extends Element = HTMLElement>(selector: string) => document.querySelector(selector) as T | null;
const qa = (selector: string) => Array.from(document.querySelectorAll(selector));
const page = () => q("[data-screen='release-candidate']")!;
const panel = (name: string) => q(`[data-panel="${name}"]`);
const panelOrder = () => qa("[data-screen='release-candidate'] [data-panel]").map((el) => el.getAttribute("data-panel"));
const sealButton = () => q("[data-action='local-seal']")!;
const publishButton = () => q("[data-action='publish']");
/* W4: the reason code rides the sentence's tooltip, not its text; the helper reads both, as a reader of the tooltip does. */
const describedBy = (el: Element) => {
  const node = document.getElementById(el.getAttribute("aria-describedby") ?? "");
  if (!node) return null;
  const code = node.getAttribute("title");
  return code ? `${node.textContent} · ${code}` : node.textContent;
};

/** What a reader sees on the screen: its text without the injected stylesheet. */
function screenText(): string {
  const copy = page().cloneNode(true) as HTMLElement;
  copy.querySelectorAll("style").forEach((style) => style.remove());
  return copy.textContent ?? "";
}

async function ready() {
  await waitFor(() => expect(qa("[data-pack-row]")).toHaveLength(12));
}

async function flush() {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function until(selector: string): Promise<HTMLElement> {
  return waitFor(() => {
    const found = q(selector);
    if (!found) throw new Error(`not yet: ${selector}`);
    return found;
  });
}

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

function edit(key: "KNOWN_LIMITATIONS_WAIVERS" | "PROPOSED_USE_RESTRICTIONS", text: string) {
  fireEvent.click(q(`[data-edit="${key}"]`)!);
  const input = q<HTMLTextAreaElement>(`[data-declaration-input="${key}"]`)!;
  fireEvent.change(input, { target: { value: text } });
  return input;
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

/* ------------------------------------------------------------ composition */

describe("S11 composition as served (P21)", () => {
  it("S11-U01 shows the loading frame, the header, every block and the rules before the server answers", () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => {}));
    renderCompose();
    expect(screen.getByRole("heading", { level: 2, name: RC_TITLE })).toBeTruthy();
    expect(page().getAttribute("data-rc-state")).toBe("loading");
    expect(screen.getAllByRole("status", { name: "Loading" }).length).toBeGreaterThan(0);
    expect(panelOrder()).toEqual(["header", "meta", "notice", "identity", "pack", "record", "seal", "publish", "mirror-ghost"]);
    expect(sealButton().getAttribute("aria-disabled")).toBe("true");
    /* W1 (fewer words): the rules footer and the subtitle are gone; the title is only the title. */
    expect(q("[data-panel='rules']")).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: RC_TITLE }).getAttribute("title")).toBeNull();
  });

  it("S11-U02 renders the blocks in the hi-fi order RC_PANELS names", async () => {
    server({ COMPOSE: [ok(unbound())] });
    renderCompose();
    await ready();
    const without = (...names: string[]) => [...RC_PANELS.compose].filter((name) => !names.includes(name));
    expect(panelOrder()).toEqual(without("sealed", "publish-unknown", "published", "mirror"));
    cleanup();
    server({ COMPOSE: [ok(sealed())], PUBLICATION: [ok(publication())] });
    renderCompose();
    await ready();
    /* QA S11 U1: a sealed candidate has no seal card — only the sealed card. */
    expect(panelOrder()).toEqual(without("banner", "seal", "publish-unknown", "published", "mirror"));
  });

  it("S11-U03 prints the hi-fi title, subtitle, breadcrumb and verbatim copy; DRAFT is the server's state", async () => {
    server({ COMPOSE: [ok(P04)] });
    renderCompose();
    await ready();
    /* W1: no subtitle prose and no tooltip copy of it. */
    expect(q("[data-subtitle]")!.getAttribute("title")).toBeNull();
    const crumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(crumb.textContent).toBe(`Evidence/${RUN.slice(0, 13)}/Release candidate`);
    expect(q("[data-crumb-run]")!.getAttribute("title")).toBe(RUN);
    /* W1 B3: opened with no cursor, the way back carries none (it used to say fold=1). */
    expect(within(crumb).getByRole("link", { name: "Evidence" }).getAttribute("href")).toBe(`/research/quantbt/runs/${RUN}/evidence`);
    expect(panel("seal")!.querySelector("h3")!.getAttribute("title")).toBe(SEAL_SENTENCE);
    expect(within(panel("publish")!).getByTitle(SOD_NOTE)).toBeTruthy();
    expect(panel("seal")!.textContent).not.toContain(SOD_NOTE);
    expect(panel("mirror-ghost")!.querySelector("[title]")!.getAttribute("title")).toBe(MIRROR_NOTE);
    expect(panel("pack")!.querySelector("th[title]")!.getAttribute("title")).toBe(PACK_FOOT_TITLE);
    expect(sealButton().textContent).toBe("Seal");
    expect(sealButton().getAttribute("title")).toContain(SEAL_LABEL);
    expect(q("[data-state-chip]")!.getAttribute("data-state-chip")).toBe("DRAFT");
    expect(q("[data-action='run-report']")!.getAttribute("href")).toBe(`/research/quantbt/runs/${RUN}/report`);
  });

  it("D1-O1 cold Compose read prints the server's run label without changing its identity", async () => {
    const body = clone(P04);
    body.display_label = "R-P04-001";
    server({ COMPOSE: [ok(body)] });
    renderCompose();
    await ready();
    const crumb = q("[data-crumb-run]")!;
    expect(crumb.textContent).toBe("R-P04-001");
    expect(crumb.getAttribute("title")).toBe(RUN);
    const rail = q('[data-rail] [data-rail-node="run"] [data-rail-value]')!;
    expect(rail.textContent).toBe("R-P04-001");
  });

  it("S11-U04 prints the meta line from the composition: authority, as-of, fingerprint and draft", async () => {
    server({ COMPOSE: [ok(sealable())] });
    renderCompose();
    await ready();
    const meta = panel("meta")!.textContent ?? "";
    /* W4: authority and source are the as-of line's tooltip; the draft line is two words. */
    expect(q("[data-as-of]")!.getAttribute("title")).toContain("portal-persisted research record");
    expect(q("[data-read-authority]")!.getAttribute("data-read-authority")).toBe("PORTAL_PERSISTED_RESEARCH");
    expect(q("[data-as-of]")!.getAttribute("title")).toContain(`source ${P04.source_fingerprint.replace(/^sha256:/, "").slice(0, 8)}`);
    expect(q("[data-source-fingerprint]")!.getAttribute("data-source-fingerprint")).toBe(P04.source_fingerprint);
    expect(meta).toContain("Draft saved");
    expect(q("[data-draft-meta]")!.getAttribute("title")).toContain("revision 1 · saved 2026-");
  });

  it("S11-U05 keeps the rail in server order and tones; alpha links to Screen 10, run to Screen 04; a dim node never links", async () => {
    server({ COMPOSE: [ok(P04)] });
    renderCompose();
    await ready();
    const nodes = qa("[data-rail-node]");
    expect(nodes.map((node) => node.getAttribute("data-rail-node"))).toEqual(P04.rail.map((node) => node.key));
    expect(nodes.map((node) => node.getAttribute("data-tone"))).toEqual(P04.rail.map((node) => node.tone));
    const avId = P04.run.binding!.alpha_version_id;
    /* W1 B3: Lineage opens on this run's attempt (`?run=`, and `?attempt=` when the compose read serves a valid id). */
    const lineage = `/research/quantbt/alphas/${ALPHA}/lineage?av=${encodeURIComponent(avId)}&attempt=${encodeURIComponent(P04.run.attempt)}&run=${encodeURIComponent(RUN)}`;
    expect(q("[data-rail-node='alpha']")!.getAttribute("href")).toBe(lineage);
    /* F2b: version → Screen 10 on that version; selected params → Screen 07 on this run. */
    expect(q("[data-rail-node='alpha_version']")!.getAttribute("href")).toBe(lineage);
    expect(q("[data-rail-node='selected_params']")!.getAttribute("href")).toBe(`/research/quantbt/runs/${RUN}/freeze`);
    /* F2b: the header's way out to lineage and the report, with the run and version kept. */
    expect(q("[data-action='open-lineage']")!.getAttribute("href")).toBe(lineage);
    expect(q("[data-action='open-lineage']")!.getAttribute("title")).toContain("lineage");
    expect(q("[data-action='run-report']")!.getAttribute("href")).toBe(`/research/quantbt/runs/${RUN}/report`);
    expect(q("[data-rail-node='run']")!.getAttribute("href")).toBe(`/research/quantbt/runs/${RUN}/evidence`);
    expect(q("[data-rail-node='release_candidate']")!.tagName).toBe("DIV");
    cleanup();
    server({ COMPOSE: [ok(unbound())] });
    renderCompose();
    await ready();
    expect(q("[data-rail-node='alpha']")!.tagName).toBe("DIV");
    expect(q("[data-rail-node='alpha']")!.getAttribute("data-tone")).toBe("dim");
  });

  it("S11-U06 a scratch run keeps the whole screen: NOT_PUBLISHABLE chip and banner, seal and publish blocked by name", async () => {
    const api = server({ COMPOSE: [ok(unbound())] });
    renderCompose();
    await ready();
    const chip = q("[data-state-chip]")!;
    expect(chip.getAttribute("data-state-chip")).toBe(NOT_PUBLISHABLE_BADGE);
    expect(chip.getAttribute("data-s")).toBe("NOT_PUBLISHABLE");
    const banner = panel("banner")!;
    expect(banner.textContent).toContain("Scratch run — no alpha_version bound. Bind one at New Run and re-run.");
    expect(banner.getAttribute("title")).toBe(NOT_PUBLISHABLE_TITLE);
    /* a scratch run has no binding, so no lineage link is offered */
    expect(q("[data-action='open-lineage']")).toBeNull();
    expect(within(banner).getByRole("link", { name: "New Run" }).getAttribute("href")).toBe("/research/quantbt/runs/new");
    expect(describedBy(sealButton())).toBe("bind alpha_version first — a scratch run cannot be sealed · P21_SCRATCH_RUN_UNBOUND");
    expect(publishButton()!.textContent).toBe(PUBLISH_UNBOUND_LABEL);
    expect(publishButton()!.getAttribute("aria-disabled")).toBe("true");
    expect(q("[data-yaml-key='alpha_version_id'] .v")!.getAttribute("data-tone")).toBe("red");
    fireEvent.click(sealButton());
    fireEvent.click(publishButton()!);
    expect(q("[data-confirm]")).toBeNull();
    expect(api.of("SEAL")).toHaveLength(0);
    expect(api.of("PUBLICATION")).toHaveLength(0);
  });

  it("S11-U07 taxonomy, last-rc and verdict are the server's; a predecessor links to its pack and CHANGED is red", async () => {
    server({ COMPOSE: [ok(W7_VIRTUAL)] });
    renderCompose(W7_VIRTUAL.run_id);
    await ready();
    /* W4: no predecessor is ONE line, not four UNSET rows. */
    expect(qa("[data-taxonomy-row]")).toHaveLength(0);
    expect(q("[data-taxonomy-none]")).not.toBeNull();
    const caption = q("[data-taxonomy-caption]")!;
    expect(caption.textContent).toContain("earlier candidate — not published");
    expect(caption.querySelector("[data-reason-code='P22_NO_PUBLISHED_PREDECESSOR']")).not.toBeNull();
    expect(caption.querySelector("[title]")!.getAttribute("title")).toContain("P22_NO_PUBLISHED_PREDECESSOR");
    cleanup();
    const compared = clone(W7_DECLARED);
    compared.published_comparison = { last_release_candidate_id: OTHER_RC, availability: { state: "AVAILABLE", reason_code: null } };
    compared.taxonomy = [
      { what: "code / entrypoint (av_)", state: "UNCHANGED", consequence: `No gate re-run from this row — equal by digest to ${OTHER_RC}.` },
      { what: "selected strategy params", state: "CHANGED", consequence: "R1 + R2 re-run — numerical artifact changed" },
      { what: "data contract / dataset snapshot", state: "UNCHANGED", consequence: `No gate re-run from this row — equal by digest to ${OTHER_RC}.` },
      { what: "target venue / account / capital", state: "UNSET", consequence: "belongs to deployment candidate → Gate R2, Execution side" },
    ];
    compared.gate_verdict = { title: "R1 + R2 must run — selected params changed", body: `Compared by digest with the last published candidate ${OTHER_RC}.` };
    server({ COMPOSE: [ok(compared)] });
    renderCompose(compared.run_id);
    await ready();
    expect(within(q("[data-taxonomy-caption]")!).getByRole("link", { name: OTHER_RC }).getAttribute("href")).toBe(releaseCandidatePackHref(OTHER_RC));
    expect(q("[data-taxonomy-state='CHANGED'] td.state")!.getAttribute("data-s")).toBe("CHANGED");
    expect(q("[data-verdict-title]")!.textContent).toBe("R1 + R2 must run — selected params changed");
  });

  it("S11-U08 draws both certification axes as separate chips with the spec titles; an absent axis is a ghost with its reason", async () => {
    server({ COMPOSE: [ok(P04)] });
    renderCompose();
    await ready();
    const claim = q("[data-cert='methodology_claim']")!;
    const engine = q("[data-cert='engine_execution_contract']")!;
    expect(claim).not.toBe(engine);
    expect(claim.getAttribute("title")).toContain(CEILING_TITLE);
    expect(engine.getAttribute("title")).toContain(ENGCERT_TITLE);
    expect(engine.getAttribute("data-ghost")).toBe("true");
    expect(engine.getAttribute("data-reason-code")).toBe("P21_ENGINE_EXECUTION_CERTIFICATION_NOT_PUBLISHED");
    expect(engine.getAttribute("title")).toContain("no engine execution-contract certificate");
  });

  it("S11-U09 lists the 12 pack rows in server order and prints the server's counter even where it disagrees", async () => {
    const body = clone(P04);
    body.pack_counts = { complete: 5, degraded: 2, input: 2, missing: 3 };
    server({ COMPOSE: [ok(body)] });
    renderCompose();
    await ready();
    expect(qa("[data-pack-row]").map((row) => row.getAttribute("data-pack-row"))).toEqual(P04.pack.map((item) => item.key));
    expect(qa("[data-pack-row]").map((row) => row.getAttribute("data-status"))).toEqual(P04.pack.map((item) => item.status));
    expect(q("[data-pack-counts]")!.textContent).toBe("5 complete · 2 degraded · 2 declared · 3 missing");
  });

  it("S11-U10 keeps DEGRADED, MISSING and INPUT distinct: titles, sentence + code, never a digit in a withheld cell", async () => {
    server({ COMPOSE: [ok(P04)] });
    renderCompose();
    await ready();
    const degraded = q("[data-pack-row='ROBUSTNESS_PARAM_STABILITY_REGIME']")!;
    expect(degraded.querySelector(".rc-status")!.getAttribute("title")).toContain(STATUS_TITLE.DEGRADED);
    expect(degraded.querySelector("[data-reason-code='P21_SOURCE_DEGRADED_EVIDENCE']")!.getAttribute("title")).toContain("P21_SOURCE_DEGRADED_EVIDENCE");
    const missing = q("[data-pack-row='METHODOLOGY_CLAIM']")!;
    expect(missing.querySelector(".rc-status")!.getAttribute("title")).toContain("P21_METHODOLOGY_CLAIM_NOT_PUBLISHED");
    expect(missing.querySelector("[data-digest]")!.getAttribute("data-digest")).toBe("");
    expect(missing.querySelector("[data-digest]")!.textContent).toBe("not published"); /* the code is its tooltip, once */
    const input = q("[data-pack-row='KNOWN_LIMITATIONS_WAIVERS']")!;
    expect(input.querySelector(".rc-status")!.getAttribute("title")).toContain(STATUS_TITLE.INPUT);
    expect(input.querySelector("[data-digest]")!.textContent).toBe("not declared");
    expect(q("[data-seal-blocked]")!.getAttribute("data-seal-blocked")).toBe("P21_REQUIRED_EVIDENCE_MISSING");
    expect(q("[data-seal-blocked]")!.textContent).toBe("resolve MISSING rows first");
    expect(q("[data-seal-blocked]")!.getAttribute("title")).toBe("P21_REQUIRED_EVIDENCE_MISSING");
  });

  it("S11-U11 links each row to the screen this build serves by contract key, only when the server named a source", async () => {
    server({ COMPOSE: [ok(P04)] });
    renderCompose();
    await ready();
    const run = `/research/quantbt/runs/${RUN}`;
    const links = Object.fromEntries(qa("[data-source-link]").map((a) => [a.getAttribute("data-source-link"), a.getAttribute("href")]));
    expect(links).toEqual({
      ENGINE_CAPABILITY_BACKEND: "/research/quantbt/atlas",
      DATASET_UNIVERSE_SNAPSHOTS: `${run}/split`,
      METHODOLOGY_CLAIM: `${run}/evidence#stage=claim`,
      SELECTED_PARAMS_LINEAGE: `${run}/search`,
      FINAL_AUDIT_REPLAY: `${run}/execute`,
      METRICS_SEMANTICS: `${run}/report`,
      EXECUTION_ASSUMPTIONS: `${run}/split`,
      ROBUSTNESS_PARAM_STABILITY_REGIME: `/research/quantbt/alphas/${ALPHA}/compare`,
      REPRODUCIBILITY_PARITY_CHECKSUMS: `${run}/freeze`,
    });
    /* The preview's old `/replay` and `/research/alphas/…` hrefs are never navigated to. */
    expect(qa("a").map((a) => a.getAttribute("href"))).not.toContain(`${run}/replay`);
    const passport = q("[data-pack-row='ALPHA_VERSION_PASSPORT'] [data-source-unlinked]")!;
    expect(passport.getAttribute("title")).toBe(ALPHA360_TITLE);
    expect(q("[data-pack-row='KNOWN_LIMITATIONS_WAIVERS'] [data-source-unlinked]")!.getAttribute("title")).toBe("your own declaration — edited on this row");
  });

  it("S11-U12 prints the record preview as the server's 17 fields; a null value reads its reason", async () => {
    server({ COMPOSE: [ok(P04)] });
    renderCompose();
    await ready();
    const lines = qa("[data-yaml-key]");
    expect(lines.map((line) => line.getAttribute("data-yaml-key"))).toEqual(P04.yaml.map((field) => field.key));
    expect(lines).toHaveLength(17);
    expect(q("[data-yaml-key='final_audit_run_id']")!.textContent).toContain("null  # P21_FINAL_AUDIT_RUN_NOT_PUBLISHED");
    expect(q("[data-yaml-key='manifest_digest']")!.getAttribute("data-yaml-value")).toBe(P04.fields.find((field) => field.key === "manifest_digest")!.value);
  });

  it("S11-U13 copy yaml writes the server's join and says copied only once the clipboard accepts it; a refusal never claims a copy", async () => {
    server({ COMPOSE: [ok(P04)] });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderCompose();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "copy yaml" }));
    await flush();
    expect(writeText).toHaveBeenCalledWith(yamlText(P04.yaml));
    expect(writeText.mock.calls[0]![0].split("\n")).toHaveLength(17);
    expect(screen.getByRole("button", { name: "✓ copied" })).toBeTruthy();
    cleanup();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    server({ COMPOSE: [ok(P04)] });
    renderCompose();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "copy yaml" }));
    await flush();
    expect(screen.getByRole("button", { name: "copy unavailable" })).toBeTruthy();
  });

  it("S11-U14 a PARTIAL composition (the pre-W7 WFO run) says so above the blocks, with sentence and code, and keeps them", async () => {
    server({ COMPOSE: [ok(WFO_PRE_W7)] });
    renderCompose(WFO_PRE_W7.run_id);
    await ready();
    const notice = q("[data-rc-notice]")!;
    expect(notice.getAttribute("data-rc-notice")).toBe("partial");
    expect(page().getAttribute("data-rc-state")).toBe("partial");
    /* W4: "Partial composition." is the sentence; the long reason and the code are its tooltip. */
    expect(notice.textContent).toContain("Partial composition.");
    expect(notice.outerHTML).toContain("a referenced source is absent, malformed or disagrees with another copy");
    expect(notice.outerHTML).toContain("P21_REFERENCED_SOURCE_INTEGRITY_FAILED");
    expect(q("[data-pack-counts]")!.textContent).toBe("3 complete · 2 declared · 7 missing");
    expect(q("[data-seal-blocked]")!.getAttribute("data-seal-blocked")).toBe("P21_REFERENCED_SOURCE_INTEGRITY_FAILED");
  });

  it("S11-U15 reads once per run: no poll, no refetch on a re-render, no publication read before a seal, never /mirror", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = server({ COMPOSE: [ok(P04)] });
    const view = renderCompose();
    await ready();
    view.rerender(
      <MemoryRouter initialEntries={[`/research/quantbt/runs/${RUN}/release-candidate`]}>
        <Routes>
          <Route path="/research/quantbt/runs/:runId/release-candidate" element={<ReleaseCandidateRoute />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(() => vi.advanceTimersByTimeAsync(PUBLICATION_POLL_MS * 3));
    expect(api.of("COMPOSE")).toHaveLength(1);
    expect(api.of("PUBLICATION")).toHaveLength(0);
    expect(api.calls.filter((call) => call.url.includes("/mirror"))).toHaveLength(0);
  });
});

/* ------------------------------------------------------------ W7 lane */

describe("S11 W7 retained lane (Delta WFO)", () => {
  it("S11-U16 the W7 composition renders 8 COMPLETE · 2 DEGRADED · 2 INPUT · 0 MISSING with each reason's sentence", async () => {
    server({ COMPOSE: [ok(W7_VIRTUAL)] });
    renderCompose(W7_VIRTUAL.run_id);
    await ready();
    expect(q("[data-pack-counts]")!.textContent).toBe("8 complete · 2 degraded · 2 declared");
    expect(qa("[data-pack-row]").map((row) => row.getAttribute("data-status"))).toEqual(W7_VIRTUAL.pack.map((item) => item.status));
    expect(page().getAttribute("data-rc-state")).toBe("available");
    expect(q("[data-rc-notice]")).toBeNull();
    const claim = q("[data-pack-row='METHODOLOGY_CLAIM']")!;
    expect(claim.getAttribute("data-status")).toBe("DEGRADED");
    expect(claim.querySelector("[data-reason-code='P21_METHODOLOGY_CERTIFICATE_NOT_ISSUED']")!.getAttribute("title")).toContain(
      "claim retained, no issued methodology certificate — travels as DEGRADED",
    );
    /* The claim-ceiling token wraps in its note cell instead of being clipped. */
    expect(claim.querySelector(".note")!.getAttribute("data-note")).toContain("not_causal_multi_fold_global_calibration");
    expect(q("[data-pack-row='ROBUSTNESS_PARAM_STABILITY_REGIME']")!.getAttribute("data-status")).toBe("DEGRADED");
    const rail = q("[data-rail-node='selected_params']")!;
    expect(rail.querySelector("[data-rail-detail]")!.textContent).toBe("retained trial 0 · global");
    expect(rail.getAttribute("data-tone")).toBe("ink");
    expect(q("[data-yaml-key='release_candidate_id']")!.textContent).toContain("null  # P21_ASSIGNED_ON_LOCAL_SEAL");
    expect(q("[data-yaml-key='release_candidate_id'] .v")!.getAttribute("data-tone")).toBe("gold");
    expect(q("[data-yaml-key='manifest_digest']")!.getAttribute("data-yaml-value")).toMatch(/^b71259790d93/);
    expect(q("[data-seal-blocked]")!.textContent).toBe("complete and save the two declarations first");
    expect(q("[data-seal-blocked]")!.getAttribute("title")).toBe("P21_RESEARCHER_DECLARATIONS_REQUIRED");
    expect(q("[data-cert='methodology_claim']")!.getAttribute("data-reason-code")).toBe("P21_METHODOLOGY_CERTIFICATION_NOT_PUBLISHED");
  });

  it("S11-U17 the declared W7 composition may be sealed; publish waits for the seal and says so", async () => {
    const api = server({ COMPOSE: [ok(W7_DECLARED)] });
    renderCompose(W7_DECLARED.run_id);
    await ready();
    expect(sealButton().getAttribute("aria-disabled")).toBeNull();
    expect(publishButton()!.getAttribute("aria-disabled")).toBe("true");
    expect(describedBy(publishButton()!)).toBe("seal the evidence pack first · P22_LOCAL_SEAL_REQUIRED");
    expect(q("[data-mirror-foot] [data-reason-code='P22_LOCAL_SEAL_REQUIRED']")).not.toBeNull();
    expect(api.of("PUBLICATION")).toHaveLength(0);
  });

  it("S11-U18 every reason code a composition, a publication or W7 can carry has its sentence", () => {
    for (const code of [
      "P21_METHODOLOGY_CERTIFICATE_NOT_ISSUED",
      "P21_RETAINED_CURRENT_SOURCE_NOT_SEALED",
      "P21_RETAINED_CLAIM_FACTS_NOT_PUBLISHED",
      "P21_RETAINED_CHILD_AUDIT_MISMATCH",
      "P21_RETAINED_PARAMETER_DIGEST_MISMATCH",
      "P21_RETAINED_REPORT_NOT_SEALED",
      "P22_PUBLICATION_INTAKE_DISABLED",
      "P22_GOVERNANCE_SOURCE_UNAVAILABLE",
      "P22_ALREADY_DELIVERED",
    ]) {
      expect(rcReasonSentence(code), code).toBeTruthy();
    }
    for (const body of [W7_VIRTUAL, W7_DECLARED]) {
      for (const item of body.pack) {
        if (item.availability.reason_code) expect(RC_REASON_SENTENCES[item.availability.reason_code], item.availability.reason_code).toBeTruthy();
      }
    }
    expect(rcReasonSentence("SOMETHING_NEW")).toBeNull();
  });
});

/* ------------------------------------------------------------ declarations */

describe("S11 declarations (draft CAS)", () => {
  it("S11-U19 shows the declared text under each INPUT row, and a missing declaration as not declared", async () => {
    server({ COMPOSE: [ok(sealable())] });
    renderCompose();
    await ready();
    expect(q("[data-declared='KNOWN_LIMITATIONS_WAIVERS']")!.textContent).toBe("Single venue depth; funding modelled at a constant rate.");
    cleanup();
    server({ COMPOSE: [ok(P04)] });
    renderCompose();
    await ready();
    expect(q("[data-declared='PROPOSED_USE_RESTRICTIONS']")!.textContent).toBe("not declared");
  });

  it("S11-U20 names a bad body by field path before any request", async () => {
    const api = server({ COMPOSE: [ok(P04)] });
    renderCompose();
    await ready();
    const box = edit("KNOWN_LIMITATIONS_WAIVERS", "   ");
    expect(document.activeElement).toBe(box);
    fireEvent.click(q("[data-action='save-declaration']")!);
    await flush();
    expect(api.of("PATCH")).toHaveLength(0);
    expect(q("[data-issue-path='known_limitations']")!.textContent).toContain("only whitespace");
    expect(q("[data-issue-path='(body)']")!.textContent).toContain("at least one declaration is required");
    expect(box.getAttribute("aria-invalid")).toBe("true");
    expect(declarationIssues({ known_limitations: "x".repeat(4097), proposed_use_restrictions: "ok" })).toEqual([
      { path: "known_limitations", message: "at most 4096 characters (now 4097)" },
    ]);
  });

  it("S11-U21 saving sends the fences in hand with the CSRF proof and prints the server's answer", async () => {
    const api = server({ COMPOSE: [ok(P04)], PATCH: [ok(sealable())] });
    renderCompose();
    await ready();
    edit("KNOWN_LIMITATIONS_WAIVERS", "Single venue depth.");
    fireEvent.click(q("[data-action='save-declaration']")!);
    await until("[data-write-notice='patch'][data-outcome='saved']");
    const [call] = api.of("PATCH");
    expect(call!.url).toBe(`/api/v1/quantbt/runs/${RUN}/release-candidate/draft`);
    expect(call!.headers["x-portal-csrf"]).toBe("tok_123");
    expect(call!.body).toEqual({
      expected_revision: 0,
      expected_source_fingerprint: P04.source_fingerprint,
      known_limitations: "Single venue depth.",
      proposed_use_restrictions: null,
    });
    expect(q("[data-draft-revision]")!.getAttribute("data-draft-revision")).toBe("1");
    expect(q("[data-declaration-input]")).toBeNull();
  });

  it("S11-U22 a 409 reads the composition again, says so verbatim and keeps every typed character", async () => {
    const api = server({ COMPOSE: [ok(P04)], PATCH: [problem(409, "RESEARCH_RELEASE_CANDIDATE_CONFLICT")] });
    renderCompose();
    await ready();
    edit("PROPOSED_USE_RESTRICTIONS", "Paper first.");
    fireEvent.click(q("[data-action='save-declaration']")!);
    const notice = await until("[data-write-notice='patch'][data-outcome='conflict']");
    expect(notice.textContent).toContain(RC_CONFLICT_COPY);
    await waitFor(() => expect(api.of("COMPOSE")).toHaveLength(2));
    expect(q<HTMLTextAreaElement>("[data-declaration-input='PROPOSED_USE_RESTRICTIONS']")!.value).toBe("Paper first.");
    expect(api.of("PATCH")).toHaveLength(1);
  });

  it("S11-U23 a write refused with 403 and with 404 says the same neutral sentence, locks every write and never retries", async () => {
    const seen: string[] = [];
    for (const status of [403, 404]) {
      const api = server({ COMPOSE: [ok(sealable())], PATCH: [problem(status, "RESEARCH_RELEASE_CANDIDATE_FORBIDDEN")] });
      renderCompose();
      await ready();
      edit("KNOWN_LIMITATIONS_WAIVERS", "x");
      fireEvent.click(q("[data-action='save-declaration']")!);
      const notice = await until("[data-write-notice='patch'][data-outcome='denied']");
      seen.push(notice.firstElementChild!.textContent!.replace(/^\W+/, ""));
      expect(sealButton().getAttribute("aria-disabled")).toBe("true");
      expect(describedBy(sealButton())).toContain("writes are off — access changed");
      await flush();
      expect(api.of("PATCH")).toHaveLength(1);
      expect(qa("[data-pack-row]")).toHaveLength(12);
      expect(screenText()).not.toContain("SECRET-SERVER-PROSE");
      cleanup();
      vi.restoreAllMocks();
    }
    expect(seen[0]).toBe(`${RC_DENIED_COPY} ${RC_NEUTRAL_REFUSAL}`);
    expect(seen[1]).toBe(seen[0]);
  });

  it("S11-U24 a 503 keeps the draft and the text; only the reader sends it again", async () => {
    const api = server({ COMPOSE: [ok(P04)], PATCH: [problem(503, "RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE"), ok(sealable())] });
    renderCompose();
    await ready();
    edit("KNOWN_LIMITATIONS_WAIVERS", "kept");
    fireEvent.click(q("[data-action='save-declaration']")!);
    const notice = await until("[data-write-notice='patch'][data-outcome='unavailable']");
    expect(notice.textContent).toContain(RC_UNAVAILABLE_COPY);
    expect(q<HTMLTextAreaElement>("[data-declaration-input='KNOWN_LIMITATIONS_WAIVERS']")!.value).toBe("kept");
    await flush();
    expect(api.of("PATCH")).toHaveLength(1);
    fireEvent.click(q("[data-action='save-declaration']")!);
    await until("[data-write-notice='patch'][data-outcome='saved']");
    expect(api.of("PATCH")).toHaveLength(2);
  });

  it("S11-U25 a 400 is terminal for the request and keeps the text; an overlapping save is sent once", async () => {
    const gate = deferred();
    const api = server({ COMPOSE: [ok(P04)], PATCH: [{ ...problem(400, "RESEARCH_RELEASE_CANDIDATE_INVALID"), hold: gate.promise }] });
    renderCompose();
    await ready();
    edit("KNOWN_LIMITATIONS_WAIVERS", "kept");
    fireEvent.click(q("[data-action='save-declaration']")!);
    fireEvent.click(q("[data-action='save-declaration']")!);
    gate.release();
    const notice = await until("[data-write-notice='patch'][data-outcome='terminal']");
    expect(notice.outerHTML).toContain("RESEARCH_RELEASE_CANDIDATE_INVALID");
    expect(api.of("PATCH")).toHaveLength(1);
    expect(q<HTMLTextAreaElement>("[data-declaration-input='KNOWN_LIMITATIONS_WAIVERS']")!.value).toBe("kept");
  });
});

/* ------------------------------------------------------------ local seal */

describe("S11 local seal", () => {
  it("S11-U26 needs a saved draft: unsaved text blocks the seal with its own reason", async () => {
    server({ COMPOSE: [ok(sealable())] });
    renderCompose();
    await ready();
    expect(sealButton().getAttribute("aria-disabled")).toBeNull();
    edit("KNOWN_LIMITATIONS_WAIVERS", "edited");
    expect(sealButton().getAttribute("aria-disabled")).toBe("true");
    expect(describedBy(sealButton())).toBe(SEAL_DIRTY);
  });

  it("S11-U27 asks for confirmation, sends only the server's identities, then prints the server's re-read seal", async () => {
    const api = server({ COMPOSE: [ok(sealable()), ok(sealed())], SEAL: [ok(sealResponse(), 201)], PUBLICATION: [ok(publication())] });
    renderCompose();
    await ready();
    fireEvent.click(sealButton());
    expect(api.of("SEAL")).toHaveLength(0);
    const dialog = screen.getByRole("alertdialog", { name: "confirm local seal" });
    expect(dialog.textContent).toContain(SEAL_CONFIRM);
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Confirm local seal" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(api.of("SEAL")).toHaveLength(0);
    fireEvent.click(sealButton());
    fireEvent.click(screen.getByRole("button", { name: "Confirm local seal" }));
    await until("[data-panel='sealed']");
    expect(api.of("SEAL")).toHaveLength(1);
    expect(api.of("SEAL")[0]!.body).toEqual({ draft_id: DRAFT_ID, expected_draft_revision: 1, expected_source_fingerprint: P04.source_fingerprint });
    expect(api.of("SEAL")[0]!.headers["x-portal-csrf"]).toBe("tok_123");
    expect(api.of("COMPOSE")).toHaveLength(2);
    expect(q("[data-sealed]")!.getAttribute("data-sealed")).toBe(RC_ID);
    expect(q("[data-delivery-state]")!.textContent).toBe("not delivered");
    expect(q("[data-delivery-state]")!.getAttribute("title")).toBe("NOT_DELIVERED");
    expect(q("[data-approval-state]")!.textContent).toBe("not approved");
    expect(q("[data-sealed-facts]")!.textContent).not.toContain(PACK_DIGEST);
    expect(q("[data-sealed-facts]")!.getAttribute("title")).toBe(`pack digest ${PACK_DIGEST}`);
    /* QA S11 U1: the sealed header says SEALED, not DRAFT; nothing says PUBLISHED. */
    expect(q("[data-state-chip]")!.getAttribute("data-state-chip")).toBe("SEALED");
    expect(q("[data-seal-chip]")).toBeNull();
    expect(q("[data-panel='seal']")).toBeNull();
    expect(q("[data-lifecycle]")!.getAttribute("title")).toBe("not delivered · not approved");
    expect(within(q("[data-panel='sealed']")!).getByRole("link", { name: RC_ID }).getAttribute("href")).toBe(releaseCandidatePackHref(RC_ID));
    expect(q("[data-seal-replayed]")).toBeNull();
    /* The seal opens the P22 read of the new candidate — and only that read. */
    await waitFor(() => expect(api.of("PUBLICATION")).toHaveLength(1));
    expect(api.of("PUBLICATION")[0]!.url).toBe(`/api/v1/research/release-candidates/${RC_ID}/publication`);
    expect(screenText()).not.toMatch(/\bPUBLISHED\b(?!_)/);
  });

  it("S11-U28 a composition that is already sealed offers no second seal: no seal card, no seal request (QA S11 U1)", async () => {
    const api = server({ COMPOSE: [ok(sealed({ enabled: false, blocked_reason: "P22_PUBLICATION_INTAKE_DISABLED" }))], SEAL: [ok(sealResponse(), 201)], PUBLICATION: [ok(publication({ may_publish: false, blocked_reason: "P22_PUBLICATION_INTAKE_DISABLED" }))] });
    renderCompose();
    await ready();
    expect(q("[data-action='local-seal']")).toBeNull();
    expect(q("[data-panel='seal']")).toBeNull();
    expect(q("[data-panel='sealed']")).not.toBeNull();
    expect(api.of("SEAL")).toHaveLength(0);
  });

  it("S11-U29 a 422 is terminal for the seal; a 409 re-reads; neither is retried", async () => {
    const api = server({
      COMPOSE: [ok(sealable())],
      SEAL: [problem(422, "RESEARCH_RELEASE_CANDIDATE_NOT_PUBLISHABLE"), problem(409, "RESEARCH_RELEASE_CANDIDATE_CONFLICT")],
    });
    renderCompose();
    await ready();
    fireEvent.click(sealButton());
    fireEvent.click(screen.getByRole("button", { name: "Confirm local seal" }));
    const terminal = await until("[data-write-notice='seal'][data-outcome='terminal']");
    expect(terminal.outerHTML).toContain("RESEARCH_RELEASE_CANDIDATE_NOT_PUBLISHABLE");
    fireEvent.click(sealButton());
    fireEvent.click(screen.getByRole("button", { name: "Confirm local seal" }));
    const conflict = await until("[data-write-notice='seal'][data-outcome='conflict']");
    expect(conflict.textContent).toContain(RC_CONFLICT_COPY);
    await waitFor(() => expect(api.of("COMPOSE")).toHaveLength(2));
    expect(api.of("SEAL")).toHaveLength(2);
  });
});

/* ------------------------------------------------------------ read refused */

describe("S11 composition read refused", () => {
  it.each([
    [404, "RESEARCH_RELEASE_CANDIDATE_NOT_FOUND", "denied"],
    [403, "RESEARCH_RELEASE_CANDIDATE_FORBIDDEN", "denied"],
    [401, "UNAUTHENTICATED", "denied"],
    [503, "RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE", "unavailable"],
    [400, "RESEARCH_RELEASE_CANDIDATE_INVALID", "terminal"],
  ])("S11-U30 %s %s renders its own state inside the screen frame, with no server prose", async (status, code, state) => {
    const api = server({ COMPOSE: [problem(status, code)] });
    renderCompose();
    if (state === "denied") {
      /* W1 (F-04): a 401/403/404 is one face: the line, the Library exit, nothing from the composer. */
      const bar = await until("[data-run-exit-bar]");
      expect(bar.querySelector("[data-run-phase]")!.textContent).toBe("Run not available.");
      expect([...bar.querySelectorAll("[data-exit]")].map((el) => el.getAttribute("data-exit"))).toEqual(["library"]);
      expect(q("[data-screen='release-candidate']")!.getAttribute("data-run-phase")).toBe("unavailable");
      for (const name of ["identity", "pack", "record", "seal", "publish", "mirror-ghost", "meta"]) expect(panel(name)).toBeNull();
      expect(q("[data-action='run-report']")).toBeNull();
      expect(q("[data-rc-notice]")).toBeNull();
      expect(screenText()).not.toContain("denied — nothing from this block");
      expect(screenText()).not.toContain("SECRET-SERVER-PROSE");
      await flush();
      expect(api.of("COMPOSE")).toHaveLength(1);
      return;
    }
    const notice = await until("[data-rc-notice]");
    expect(notice.getAttribute("data-rc-notice")).toBe(state);
    expect(qa("[data-pack-row]")).toHaveLength(0);
    expect(q("[data-refusal-code]")!.getAttribute("data-refusal-code")).toBe(code);
    expect(screenText()).not.toContain("SECRET-SERVER-PROSE");
    if (status === 403 || status === 404) expect(notice.textContent).toContain("Not available to you.");
    if (status !== 503) expect(q("[data-action='run-library']")!.getAttribute("href")).toBe("/research/quantbt/runs");
    await flush();
    expect(api.of("COMPOSE")).toHaveLength(1);
    if (status === 503) {
      fireEvent.click(screen.getByRole("button", { name: "Read again" }));
      await waitFor(() => expect(api.of("COMPOSE")).toHaveLength(2));
    }
  });
});

/* ------------------------------------------------------------ P22 publish */

describe("S11 publish (P22, two routes)", () => {
  it("S11-U31 a sealed candidate reads its publication and offers the hi-fi publish button only when both gates hold", async () => {
    const api = server({ COMPOSE: [ok(sealed())], PUBLICATION: [ok(publication())] });
    renderCompose();
    await ready();
    await waitFor(() => expect(publishButton()!.getAttribute("data-publish-enabled")).toBe("true"));
    expect(publishButton()!.textContent).toBe("Publish");
    expect(publishButton()!.getAttribute("title")).toContain(`Publish ${RC_ID}`);
    expect(publishButton()!.getAttribute("aria-describedby")).toBeNull();
    expect(q("[data-publish-sentence]")!.getAttribute("data-publish-rc")).toBe(RC_ID);
    expect(panel("publish")!.querySelector("h3")!.getAttribute("title")).toBe(`${PUBLISH_SENTENCE[0]}${RC_ID}${PUBLISH_SENTENCE[1]}`);
    expect(q("[data-sod]")!.getAttribute("title")).toContain(SOD_NOTE);
    expect(api.of("PUBLICATION")[0]!.headers["x-portal-csrf"]).toBeUndefined();
    expect(api.of("PUBLISH")).toHaveLength(0);
    expect(api.calls.filter((call) => call.url.includes("/mirror") || call.url.includes("reconcile"))).toHaveLength(0);
  });

  it.each([
    ["P21 intake dark", sealed({ enabled: false, blocked_reason: "P22_PUBLICATION_INTAKE_DISABLED" }), publication({ may_publish: false, blocked_reason: "P22_PUBLICATION_INTAKE_DISABLED" }), "P22_PUBLICATION_INTAKE_DISABLED"],
    ["P22 governance source down", sealed(), publication({ may_publish: false, blocked_reason: "P22_GOVERNANCE_SOURCE_UNAVAILABLE", source: { ...publication().source, availability: "UNAVAILABLE", reason_code: "P22_GOVERNANCE_SOURCE_UNAVAILABLE", eligible_methodology_claim_ids: [] } }), "P22_GOVERNANCE_SOURCE_UNAVAILABLE"],
    ["P22 superseded", sealed(), publication({ may_publish: false, blocked_reason: "P22_RELEASE_CANDIDATE_SUPERSEDED", candidate_relation: "SUPERSEDED" }), "P22_RELEASE_CANDIDATE_SUPERSEDED"],
    ["P22 unknown code", sealed(), publication({ may_publish: false, blocked_reason: "P22_SOMETHING_NEW" }), "P22_SOMETHING_NEW"],
  ])("S11-U32 %s: publish is disabled, described by its sentence and code, and a click sends nothing", async (_label, body, read, code) => {
    const api = server({ COMPOSE: [ok(body)], PUBLICATION: [ok(read)] });
    renderCompose();
    await ready();
    await waitFor(() => expect(q("[data-publish-blocked]")!.getAttribute("data-publish-blocked")).toBe(code));
    const button = publishButton()!;
    expect(button.getAttribute("aria-disabled")).toBe("true");
    const sentence = rcReasonSentence(code);
    expect(describedBy(button)).toBe(sentence ? `${sentence} · ${code}` : `the server does not offer publish for this candidate · ${code}`);
    fireEvent.click(button);
    expect(q("[data-confirm]")).toBeNull();
    await flush();
    expect(api.of("PUBLISH")).toHaveLength(0);
  });

  it("S11-U33 publish asks for confirmation, sends only the pack digest and the listed claim, then prints PUBLISHED from the server", async () => {
    const gate = deferred();
    const api = server({
      COMPOSE: [ok(sealed()), ok(deliveredCompose())],
      PUBLICATION: [ok(publication()), ok(deliveredRead())],
      PUBLISH: [{ ...ok(deliveredRead()), hold: gate.promise }],
    });
    renderCompose();
    await ready();
    await waitFor(() => expect(publishButton()!.getAttribute("data-publish-enabled")).toBe("true"));
    fireEvent.click(publishButton()!);
    const dialog = screen.getByRole("alertdialog", { name: "confirm publish" });
    expect(dialog.textContent).toContain(PUBLISH_CONFIRM);
    expect(dialog.textContent).toContain(`${RC_ID} · pack 55555555 · claim ${CLAIM}`);
    expect(dialog.querySelector(`[title="pack ${PACK_DIGEST}"]`)).not.toBeNull();
    expect(api.of("PUBLISH")).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm publish" }));
    expect(publishButton()!.textContent).toBe(PUBLISHING_LABEL);
    expect(publishButton()!.getAttribute("aria-busy")).toBe("true");
    expect(q("[data-state-chip]")!.getAttribute("data-state-chip")).toBe("SEALED");
    fireEvent.click(publishButton()!);
    gate.release();
    await until("[data-panel='published']");
    expect(api.of("PUBLISH")).toHaveLength(1);
    const [post] = api.of("PUBLISH");
    expect(post!.url).toBe(`/api/v1/research/release-candidates/${RC_ID}/publish`);
    expect(post!.headers["x-portal-csrf"]).toBe("tok_123");
    /* No summary, no request key: the server writes both from the sealed pack. */
    expect(post!.body).toEqual({ schema_version: "research.release-candidate-publish-request.v1", expected_pack_digest: PACK_DIGEST, methodology_claim_id: CLAIM });
    await waitFor(() => expect(api.of("COMPOSE")).toHaveLength(2));
    expect(q("[data-state-chip]")!.getAttribute("data-state-chip")).toBe("PUBLISHED");
    expect(q("[data-state-chip]")!.getAttribute("data-s")).toBe("PUBLISHED");
    expect(q("[data-seal-chip]")).toBeNull();
    const card = panel("published")!;
    expect(card.querySelector("[data-published-facts]")!.textContent).toBe(
      `published_at ${iso(PUBLISHED_AT)} · by researcher@bobby · evidence digest cccccccc`,
    );
    expect(card.querySelector("h3")!.getAttribute("title")).toBe(PUBLISHED_SENTENCE);
    expect(card.querySelector("[data-published-receipt]")!.textContent).toBe(`receipt dddddddd · approval ${APPROVAL}`);
    expect(card.querySelector("[data-published-receipt]")!.getAttribute("title")).toBe(`receipt ${"d".repeat(64)}`);
    expect(card.querySelector("[data-evidence-digest]")!.getAttribute("title")).toBe(`sha256:${"c".repeat(64)}`);
    /* No ghost after publish: the solid mirror, with the server's facts only. */
    expect(panel("mirror-ghost")).toBeNull();
    const mirror = panel("mirror")!;
    expect(mirror.querySelector("[data-mirror-subject]")!.textContent).toBe(`${RC_ID} — ${ALPHA} ${AV}`);
    expect(mirror.querySelector("[data-mirror-status]")!.textContent).toBe("PENDING");
    expect(mirror.querySelector("[data-mirror-effective-status]")!.textContent).toBe("effective status not published");
    expect(mirror.querySelector("[data-mirror-sla]")!.textContent).toBe("SLA due 2026-09-27T09:12:00.000Z · expires 2026-12-25T09:12:00.000Z");
    expect(mirror.querySelector("[data-mirror-meta]")!.textContent).toBe(
      `${MIRROR_POOL_ABSENT} · ⓘ·conditions: none·${MIRROR_OUTCOMES}`,
    );
    expect(mirror.querySelector("[data-mirror-pool]")!.getAttribute("data-mirror-pool")).toBe("NOT_PUBLISHED");
    expect(mirror.querySelector("[data-mirror-decisions]")!.textContent).toBe("decisions recorded: not published");
    expect(mirror.querySelector("h3")!.getAttribute("title")).toBe(MIRROR_PUBLISHED_NOTE);
    expect(within(mirror).getByRole("link", { name: MIRROR_INBOX_LINK }).getAttribute("href")).toBe(`/governance/approvals/${APPROVAL}/r1`);
    expect(mirror.querySelectorAll("button, input, textarea, select")).toHaveLength(0);
    /* T07: the published candidate's declarations are read-only; the seal and publish cards are gone. */
    expect(qa("[data-action='edit-declaration']")).toHaveLength(0);
    expect(panel("seal")).toBeNull();
    expect(publishButton()).toBeNull();
    const absent = ["banner", "seal", "publish", "publish-unknown", "mirror-ghost"];
    expect(panelOrder()).toEqual(RC_PANELS.compose.filter((name) => !absent.includes(name)));
  });

  it("S11-U34 several listed claims need a choice from the server's list before publish is offered", async () => {
    const api = server({
      COMPOSE: [ok(sealed())],
      PUBLICATION: [ok(publication({ source: { ...publication().source, eligible_methodology_claim_ids: ["claim_a", "claim_b"] } }))],
      PUBLISH: [ok(deliveredRead())],
    });
    renderCompose();
    await ready();
    await until("[data-claim-choice]");
    expect(publishButton()!.getAttribute("aria-disabled")).toBe("true");
    expect(describedBy(publishButton()!)).toBe(CLAIM_REQUIRED);
    fireEvent.click(q("[data-claim='claim_b']")!);
    expect(publishButton()!.getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(publishButton()!);
    fireEvent.click(screen.getByRole("button", { name: "Confirm publish" }));
    await waitFor(() => expect(api.of("PUBLISH")).toHaveLength(1));
    expect((api.of("PUBLISH")[0]!.body as { methodology_claim_id: string }).methodology_claim_id).toBe("claim_b");
  });

  it("S11-U35 an UNKNOWN outcome is neither published nor refused; only the server may admit the same request again", async () => {
    const unknown = publication({ state: "UNKNOWN", may_publish: true, blocked_reason: null });
    const api = server({ COMPOSE: [ok(sealed())], PUBLICATION: [ok(unknown)], PUBLISH: [ok(deliveredRead())] });
    renderCompose();
    await ready();
    const card = await until("[data-panel='publish-unknown']");
    expect(card.querySelector("[data-unknown-copy]")!.getAttribute("title")).toContain(UNKNOWN_SHORT);
    expect(card.querySelector("[data-unknown-copy]")!.getAttribute("title")).toContain(UNKNOWN_COPY);
    expect(q("[data-state-chip]")!.getAttribute("data-state-chip")).toBe("SEALED");
    expect(panel("publish")).toBeNull();
    expect(panel("mirror-ghost")).not.toBeNull();
    fireEvent.click(q("[data-action='publish-retry']")!);
    await waitFor(() => expect(api.of("PUBLISH")).toHaveLength(1));
    expect(api.of("PUBLISH")[0]!.body).toEqual({ schema_version: "research.release-candidate-publish-request.v1", expected_pack_digest: PACK_DIGEST, methodology_claim_id: CLAIM });
    cleanup();
    vi.restoreAllMocks();
    const other = server({ COMPOSE: [ok(sealed())], PUBLICATION: [ok(publication({ state: "UNKNOWN", may_publish: false, blocked_reason: "P22_PUBLICATION_OWNED_BY_ANOTHER_ACTOR" }))] });
    renderCompose();
    await ready();
    const retry = await until("[data-action='publish-retry']");
    await waitFor(() => expect(retry.getAttribute("aria-disabled")).toBe("true"));
    expect(describedBy(retry)).toBe("another researcher recorded this publication; only they may retry it · P22_PUBLICATION_OWNED_BY_ANOTHER_ACTOR");
    fireEvent.click(retry);
    await flush();
    expect(other.of("PUBLISH")).toHaveLength(0);
  });

  it("S11-U36 a 409 on publish says so, reads the composition and the publication again, and sends nothing more", async () => {
    const api = server({ COMPOSE: [ok(sealed())], PUBLICATION: [ok(publication())], PUBLISH: [problem(409, "RESEARCH_RELEASE_CANDIDATE_CONFLICT")] });
    renderCompose();
    await ready();
    await waitFor(() => expect(publishButton()!.getAttribute("data-publish-enabled")).toBe("true"));
    fireEvent.click(publishButton()!);
    fireEvent.click(screen.getByRole("button", { name: "Confirm publish" }));
    const notice = await until("[data-write-notice='publish'][data-outcome='conflict']");
    expect(notice.textContent).toContain(RC_PUBLISH_CONFLICT_COPY);
    await waitFor(() => expect(api.of("COMPOSE")).toHaveLength(2));
    await waitFor(() => expect(api.of("PUBLICATION")).toHaveLength(2));
    expect(api.of("PUBLISH")).toHaveLength(1);
  });

  it("S11-U37 a publish refused with 401 locks every write, polls nothing and raises the shell's session signal once; 403 and 404 say the same neutral sentence", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const seen: string[] = [];
    for (const status of [401, 403, 404]) {
      const reports = sessionReports();
      const api = server({ COMPOSE: [ok(sealed())], PUBLICATION: [ok(publication())], PUBLISH: [problem(status, "RESEARCH_RELEASE_CANDIDATE_FORBIDDEN")] });
      renderCompose();
      await ready();
      await waitFor(() => expect(publishButton()!.getAttribute("data-publish-enabled")).toBe("true"));
      fireEvent.click(publishButton()!);
      fireEvent.click(screen.getByRole("button", { name: "Confirm publish" }));
      const notice = await until("[data-write-notice='publish'][data-outcome='denied']");
      seen.push(notice.firstElementChild!.textContent!.replace(/^\W+/, ""));
      expect(publishButton()!.getAttribute("aria-disabled")).toBe("true");
      expect(q("[data-action='local-seal']")).toBeNull();
      /* FG-05: the shell's Frame 01D answers a 401; the card builds no sign-in link of its own. */
      expect(within(notice).queryByRole("link", { name: "sign in again" })).toBeNull();
      await act(() => vi.advanceTimersByTimeAsync(PUBLICATION_POLL_MS * 3));
      expect(reports.count()).toBe(status === 401 ? 1 : 0);
      reports.stop();
      expect(api.of("PUBLISH")).toHaveLength(1);
      expect(api.of("PUBLICATION")).toHaveLength(1);
      expect(screenText()).not.toContain("SECRET-SERVER-PROSE");
      cleanup();
      vi.restoreAllMocks();
    }
    expect(seen[0]).toBe(RC_DENIED_COPY);
    expect(seen[1]).toBe(`${RC_DENIED_COPY} ${RC_NEUTRAL_REFUSAL}`);
    expect(seen[2]).toBe(seen[1]);
  });

  it("S11-U38 a 503 on publish is unavailable: DRAFT and the pack stay, the reader may send it again", async () => {
    const api = server({ COMPOSE: [ok(sealed())], PUBLICATION: [ok(publication())], PUBLISH: [problem(503, "RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE"), ok(deliveredRead())] });
    renderCompose();
    await ready();
    await waitFor(() => expect(publishButton()!.getAttribute("data-publish-enabled")).toBe("true"));
    fireEvent.click(publishButton()!);
    fireEvent.click(screen.getByRole("button", { name: "Confirm publish" }));
    const notice = await until("[data-write-notice='publish'][data-outcome='unavailable']");
    expect(notice.textContent).toContain(RC_PUBLISH_UNAVAILABLE_COPY);
    expect(q("[data-state-chip]")!.getAttribute("data-state-chip")).toBe("SEALED");
    await flush();
    expect(api.of("PUBLISH")).toHaveLength(1);
    fireEvent.click(publishButton()!);
    fireEvent.click(screen.getByRole("button", { name: "Confirm publish" }));
    await waitFor(() => expect(api.of("PUBLISH")).toHaveLength(2));
  });
});

/* ------------------------------------------------------------ publication read */

describe("S11 publication read and R1 mirror (P22)", () => {
  it("S11-U39 a transient governance outage is 'unavailable', never 'denied', and is read again on a backoff until it answers", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = server({
      COMPOSE: [ok(sealed())],
      PUBLICATION: [problem(503, "RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE"), problem(502, "BAD_GATEWAY"), ok(publication())],
    });
    renderCompose();
    await ready();
    const read = await until("[data-publication-read='unavailable']");
    expect(read.textContent).toContain("the publication read did not answer — it is tried again on its own");
    expect(read.outerHTML).toContain("RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE");
    expect(screenText()).not.toContain(RC_DENIED_COPY);
    expect(publishButton()!.getAttribute("aria-disabled")).toBe("true");
    expect(page().getAttribute("data-publication-polling")).toBe("true");
    await act(() => vi.advanceTimersByTimeAsync(PUBLICATION_BACKOFF_MS[0]));
    await waitFor(() => expect(api.of("PUBLICATION")).toHaveLength(2));
    await act(() => vi.advanceTimersByTimeAsync(PUBLICATION_BACKOFF_MS[1]));
    await waitFor(() => expect(api.of("PUBLICATION")).toHaveLength(3));
    await waitFor(() => expect(publishButton()!.getAttribute("data-publish-enabled")).toBe("true"));
    expect(q("[data-publication-read]")).toBeNull();
    /* NOT_PUBLISHED needs no poll: nothing more is read. */
    await act(() => vi.advanceTimersByTimeAsync(PUBLICATION_POLL_MS * 2));
    expect(api.of("PUBLICATION")).toHaveLength(3);
  });

  it.each([
    [401, "session", "Your session has ended."],
    [403, "denied", RC_NEUTRAL_REFUSAL],
    [404, "denied", RC_NEUTRAL_REFUSAL],
    [400, "terminal", "The publication read was refused as invalid."],
  ])("S11-U40 a publication read refused with %s is its own state (%s), is not read again, and only a 401 raises the session signal", async (status, state, words) => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const reports = sessionReports();
    const api = server({ COMPOSE: [ok(sealed())], PUBLICATION: [problem(status, `CODE_${status}`)] });
    renderCompose();
    await ready();
    const read = await until(`[data-publication-read='${state}']`);
    expect(read.textContent).toContain(words);
    expect(read.outerHTML).toContain(`CODE_${status}`);
    expect(publishButton()!.getAttribute("aria-disabled")).toBe("true");
    expect(within(read).queryByRole("link", { name: "sign in again" })).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(PUBLICATION_BACKOFF_MS[4] * 2));
    expect(api.of("PUBLICATION")).toHaveLength(1);
    expect(reports.count()).toBe(status === 401 ? 1 : 0);
    reports.stop();
    expect(screenText()).not.toContain("SECRET-SERVER-PROSE");
  });

  it("S11-U40b a publication read refused with 403 and with 404 renders the identical words and state", async () => {
    const seen: string[] = [];
    for (const status of [403, 404]) {
      server({ COMPOSE: [ok(sealed())], PUBLICATION: [problem(status, "RESEARCH_RELEASE_CANDIDATE_FORBIDDEN")] });
      renderCompose();
      await ready();
      const read = await until("[data-publication-read='denied']");
      seen.push(read.firstElementChild!.textContent!.replace(/^\W+/, ""));
      expect(screenText()).not.toContain(SERVER_PROSE);
      cleanup();
      vi.restoreAllMocks();
    }
    expect(seen[0]).toBe(`${RC_DENIED_COPY} ${RC_NEUTRAL_REFUSAL}`);
    expect(seen[1]).toBe(seen[0]);
  });

  it("S11-U41 while DELIVERED the publication is read every 60 s while visible; a later 5xx keeps the last read as stale with its as-of", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const approved = deliveredRead({ as_of_utc_ms: PUBLISHED_AT + 120_000 }, { status: "APPROVED" });
    const api = server({ COMPOSE: [ok(deliveredCompose())], PUBLICATION: [ok(deliveredRead()), ok(approved), problem(503, "RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE")] });
    renderCompose();
    await ready();
    await waitFor(() => expect(panel("mirror")!.querySelector("[data-mirror-status]")!.textContent).toBe("PENDING"));
    await waitFor(() => expect(page().getAttribute("data-publication-polling")).toBe("true"));
    await act(() => vi.advanceTimersByTimeAsync(PUBLICATION_POLL_MS));
    await waitFor(() => expect(panel("mirror")!.querySelector("[data-mirror-status]")!.textContent).toBe("APPROVED"));
    await act(() => vi.advanceTimersByTimeAsync(PUBLICATION_POLL_MS));
    const stale = await until("[data-panel='mirror'] [data-publication-read='stale']");
    expect(stale.textContent).toContain(`publication as of ${iso(PUBLISHED_AT + 120_000)} — the last read did not answer; it is read again in 15 s`);
    expect(panel("mirror")!.querySelector("[data-mirror-status]")!.textContent).toBe("APPROVED");
    expect(api.of("PUBLICATION")).toHaveLength(3);
    setVisibility("hidden");
    await waitFor(() => expect(page().getAttribute("data-publication-polling")).toBe("false"));
    await act(() => vi.advanceTimersByTimeAsync(PUBLICATION_POLL_MS * 3));
    expect(api.of("PUBLICATION")).toHaveLength(3);
    setVisibility("visible");
    await act(() => vi.advanceTimersByTimeAsync(PUBLICATION_BACKOFF_MS[0]));
    await waitFor(() => expect(api.of("PUBLICATION")).toHaveLength(4));
  });

  it("S11-U42 a delivered candidate never shows the ghost: denied, not-found and unavailable R1 reads each say so", async () => {
    const cases: Array<[RcPublication["approval_read"], string]> = [
      ["DENIED", MIRROR_NOT_READABLE],
      ["NOT_FOUND", "the governance store has no approval by this id"],
      ["UNAVAILABLE", "the governance store did not answer this read"],
    ];
    for (const [read, words] of cases) {
      server({ COMPOSE: [ok(deliveredCompose())], PUBLICATION: [ok(deliveredRead({ approval_read: read, approval: null }))] });
      renderCompose();
      await ready();
      const mirror = await until("[data-panel='mirror']");
      await waitFor(() => expect(mirror.getAttribute("data-mirror-read")).toBe(read));
      expect(panel("mirror-ghost")).toBeNull();
      expect(mirror.textContent).toContain(`approval status: ${words}`);
      expect(mirror.querySelector("[data-mirror-facts]")!.textContent).toContain(`approval ${APPROVAL}`);
      expect(mirror.querySelector("a")).toBeNull();
      expect(panel("published")!.querySelector("[data-evidence-digest-absent]")!.textContent).toBe(`not read (${read})`);
      cleanup();
      vi.restoreAllMocks();
    }
    /* The composition says delivered but the publication read itself failed: still no ghost. */
    server({ COMPOSE: [ok(deliveredCompose())], PUBLICATION: [problem(503, "RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE")] });
    renderCompose();
    await ready();
    await until("[data-panel='mirror'] [data-publication-read='unavailable']");
    expect(panel("mirror-ghost")).toBeNull();
    expect(q("[data-state-chip]")!.getAttribute("data-state-chip")).toBe("PUBLISHED");
  });

  it("S11-U43 a superseded candidate is its own line; the raw status and conditions are the server's", async () => {
    const read = deliveredRead({ candidate_relation: "SUPERSEDED" }, {
      status: "APPROVED_WITH_CONDITION",
      conditions: [{ limitation_id: "lim_1", kind: "restriction", label: "Paper only", statement: "Paper only until R2.", expires_at: null }],
    });
    server({ COMPOSE: [ok(deliveredCompose())], PUBLICATION: [ok(read)] });
    renderCompose();
    await ready();
    const mirror = await until("[data-panel='mirror'] [data-mirror-superseded]");
    expect(mirror.textContent).toBe(MIRROR_SUPERSEDED);
    expect(q("[data-mirror-status]")!.textContent).toBe("APPROVED_WITH_CONDITION");
    expect(q("[data-mirror-conditions]")!.textContent).toBe("conditions: restriction — Paper only");
  });

  it("S11-U44 nothing is invented: no assignee pool, no decisions, no quorum, no summary; the server's prose never renders", async () => {
    const api = server({ COMPOSE: [ok(sealed())], PUBLICATION: [ok(publication())], PUBLISH: [ok(deliveredRead())] });
    renderCompose();
    await ready();
    await waitFor(() => expect(publishButton()!.getAttribute("data-publish-enabled")).toBe("true"));
    expect(screenText()).not.toMatch(/Quant Reviewers|none recorded|quorum|decisions none|time left/);
    /* W4: the ghost is ONE line; no pool / conditions / outcomes meta. */
    expect(q("[data-panel='mirror-ghost'] [data-mirror-meta]")).toBeNull();
    /* W4: the ghost is one line whose tooltip is keyboard-reachable; it holds no control. */
    expect(panel("mirror-ghost")!.querySelectorAll("a, button, input, textarea, select")).toHaveLength(0);
    fireEvent.click(publishButton()!);
    fireEvent.click(screen.getByRole("button", { name: "Confirm publish" }));
    await waitFor(() => expect(api.of("PUBLISH")).toHaveLength(1));
    const body = api.of("PUBLISH")[0]!.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["expected_pack_digest", "methodology_claim_id", "schema_version"]);
    expect(screenText()).not.toMatch(/Quant Reviewers|none recorded|quorum/);
  });

  it("S11-U45 a failed publication read is typed without a timer: transient keeps the last read, anything else drops it", () => {
    const prior = publication();
    const down = new PortalApiError("503", 503, "UNAVAILABLE", "req_503");
    expect(nextPublicationView(null, down, 0)).toEqual({ state: "unavailable", failure: { status: 503, code: "UNAVAILABLE", requestId: "req_503" }, retryInMs: PUBLICATION_BACKOFF_MS[0] });
    expect(nextPublicationView(prior, new TypeError("network"), 1)).toEqual({ state: "stale", publication: prior, failure: { status: 0, code: null, requestId: null }, retryInMs: PUBLICATION_BACKOFF_MS[1] });
    expect(nextPublicationView(prior, new PortalApiError("429", 429, null, null), 99)).toMatchObject({ state: "stale", retryInMs: PUBLICATION_BACKOFF_MS[4] });
    expect(nextPublicationView(prior, new PortalApiError("401", 401, null, null), 0).state).toBe("session");
    expect(nextPublicationView(prior, new PortalApiError("403", 403, null, null), 0).state).toBe("denied");
    expect(nextPublicationView(prior, new PortalApiError("404", 404, null, null), 0)).toEqual({ state: "denied", failure: { status: 404, code: null, requestId: null } });
    expect(nextPublicationView(prior, new PortalApiError("422", 422, null, null), 0).state).toBe("terminal");
    expect("publication" in nextPublicationView(prior, new PortalApiError("403", 403, null, null), 0)).toBe(false);
  });

  it("S11-U46 the publish gate is the server's, first reason first (pure)", () => {
    const fresh = { state: "fresh" as const, publication: publication() };
    const base = { writesLocked: false, busy: false, publishing: false, claim: null };
    expect(publishBlock({ ...base, compose: sealed(), view: fresh })).toBeNull();
    expect(publishBlock({ ...base, compose: unbound(), view: fresh })).toEqual({ label: PUBLISH_UNBOUND_LABEL, code: "P21_SCRATCH_RUN_UNBOUND" });
    expect(publishBlock({ ...base, compose: sealed({ enabled: false, blocked_reason: "P22_LOCAL_SEAL_REQUIRED" }), view: fresh })!.code).toBe("P22_LOCAL_SEAL_REQUIRED");
    expect(publishBlock({ ...base, compose: sealed(), view: { state: "loading" } })!.label).toBe("reading the publication…");
    expect(publishBlock({ ...base, compose: sealed(), view: { state: "stale", publication: publication(), failure: { status: 503, code: null, requestId: null }, retryInMs: 15_000 } })!.label).toContain("stale");
    expect(publishBlock({ ...base, compose: sealed(), view: { state: "fresh", publication: publication({ may_publish: false, blocked_reason: null }) } })!.label).toBe(
      "the server does not offer publish for this candidate",
    );
    expect(publishBlock({ ...base, writesLocked: true, compose: sealed(), view: fresh })!.label).toBe("writes are off — access changed");
    expect(publishBlock({ ...base, busy: true, compose: sealed(), view: fresh })!.label).toBe("another write is in flight");
  });
});

/* ------------------------------------------------------------ pack route */

describe("S11 sealed pack route", () => {
  it("S11-U47 reads the frozen pack by its id and prints it read-only, with its publication read", async () => {
    const api = server({ PACK: [ok(pack())], PUBLICATION: [ok(publication())] });
    renderAt(releaseCandidatePackHref(RC_ID));
    await ready();
    expect(page().getAttribute("data-rc-mode")).toBe("pack");
    expect(api.of("PACK")[0]!.url).toBe(`/api/v1/research/release-candidates/${RC_ID}`);
    await waitFor(() => expect(api.of("PUBLICATION")).toHaveLength(1));
    expect(qa("[data-yaml-key]")).toHaveLength(17);
    expect(q("[data-yaml-key='release_candidate_id']")!.getAttribute("data-yaml-value")).toBe(RC_ID);
    expect(qa("[data-action='edit-declaration'], [data-action='local-seal'], [data-action='publish']")).toHaveLength(0);
    const ghost = panel("publish-ghost")!;
    expect(within(ghost).getByRole("link", { name: "open the run's composition →" }).getAttribute("href")).toBe(releaseCandidateHref(RUN));
    /* 11-26: the state word is the server's; no `P22_NOT_PUBLISHED` is made from it. */
    await waitFor(() => expect(ghost.querySelector("[data-publication-state='NOT_PUBLISHED']")).not.toBeNull());
    expect(ghost.querySelector("[data-reason-code]")).toBeNull();
    expect(q("[data-pack-counts-absent]")!.textContent).toBe("no counts in the frozen pack");
  });

  it.each(["NOT_PUBLISHED", "PENDING", "UNKNOWN", "REFUSED"] as const)(
    "S11-F1-26 a %s publication with no served blocked_reason prints the state word and no reason code, on every slot",
    async (state) => {
      server({ PACK: [ok(pack())], PUBLICATION: [ok(publication({ state, may_publish: false, blocked_reason: null }))] });
      renderAt(releaseCandidatePackHref(RC_ID));
      await ready();
      const ghost = panel("publish-ghost")!;
      const mirror = panel("mirror-ghost")!;
      await waitFor(() => expect(ghost.querySelector(`[data-publication-state='${state}']`)).not.toBeNull());
      const word = `publication ${state.toLowerCase().replace(/_/g, " ")}`;
      expect(ghost.querySelector("[data-publication-state]")!.textContent).toBe(word);
      expect(mirror.querySelector("[data-mirror-foot]")!.textContent).toBe(word);
      expect(ghost.querySelector("[data-reason-code]")).toBeNull();
      expect(mirror.querySelector("[data-reason-code]")).toBeNull();
      expect(`${ghost.textContent}${mirror.textContent}`).not.toContain(`P22_${state}`);
    },
  );

  it("S11-F1-26 the compose route's mirror ghost prints the state word, not a made-up code", async () => {
    server({ COMPOSE: [ok(sealed())], PUBLICATION: [ok(publication({ state: "PENDING", may_publish: false, blocked_reason: null }))] });
    renderCompose();
    await ready();
    await waitFor(() => expect(q("[data-mirror-foot] [data-publication-state='PENDING']")).not.toBeNull());
    expect(q("[data-mirror-foot]")!.textContent).toBe("publication pending");
    expect(q("[data-mirror-foot] [data-reason-code]")).toBeNull();
    expect(page().textContent).not.toContain("P22_PENDING");
  });

  it("S11-F1-26 a served blocked_reason is the only code printed beside the state word", async () => {
    server({
      PACK: [ok(pack())],
      PUBLICATION: [ok(publication({ state: "REFUSED", may_publish: false, blocked_reason: "P22_PUBLICATION_REFUSED" }))],
    });
    renderAt(releaseCandidatePackHref(RC_ID));
    await ready();
    const ghost = panel("publish-ghost")!;
    await waitFor(() => expect(ghost.querySelector("[data-reason-code]")).not.toBeNull());
    expect(qa("[data-panel='publish-ghost'] [data-reason-code], [data-panel='mirror-ghost'] [data-reason-code]").map((el) => el.getAttribute("data-reason-code"))).toEqual([
      "P22_PUBLICATION_REFUSED",
      "P22_PUBLICATION_REFUSED",
    ]);
    expect(ghost.querySelector("[data-publication-state]")!.textContent).toBe("publication refused");
  });

  it("S11-F1-26 no reason code outside the codes the server publishes is ever printed", async () => {
    /* The universe: every `P2x_` code the control-api release-candidate sources can emit, plus the
       frozen sentence table the screen reads. A code the screen would mint from a state is in neither. */
    const dir = join(__dirname, "..", "..", "..", "..", "control-api", "src", "research");
    const emitted = new Set<string>();
    for (const file of readdirSync(dir).filter((name) => /^release-candidate.*\.ts$/.test(name) && !name.endsWith(".test.ts"))) {
      for (const match of readFileSync(join(dir, file), "utf8").matchAll(/\bP2[12]_[A-Z0-9_]+/g)) emitted.add(match[0]);
    }
    expect(emitted.has("P22_PUBLICATION_REFUSED")).toBe(true);
    const universe = new Set<string>([...emitted, ...Object.keys(RC_REASON_SENTENCES)]);
    for (const invented of ["P22_PENDING", "P22_UNKNOWN", "P22_REFUSED", "P22_DELIVERED"]) expect(universe.has(invented), invented).toBe(false);

    const states = ["NOT_PUBLISHED", "PENDING", "UNKNOWN", "REFUSED", "DELIVERED"] as const;
    for (const state of states) {
      server({
        PACK: [ok(pack())],
        PUBLICATION: [ok(state === "DELIVERED" ? deliveredRead() : publication({ state, may_publish: false, blocked_reason: null }))],
      });
      renderAt(releaseCandidatePackHref(RC_ID));
      await ready();
      await flush();
      const printed = qa("[data-screen='release-candidate'] [data-reason-code]").map((el) => el.getAttribute("data-reason-code")!);
      for (const code of printed) expect(universe.has(code), `${state}: ${code}`).toBe(true);
      expect(`${page().textContent}`).not.toMatch(new RegExp(`P22_${state}\\b`));
      cleanup();
      vi.restoreAllMocks();
    }
  });

  it("S11-U48 a delivered pack shows PUBLISHED, the receipt and the mirror, never the ghost", async () => {
    server({ PACK: [ok(pack({ ...sealed().local_seal, delivery_state: "DELIVERED", approval_state: "PENDING" }))], PUBLICATION: [ok(deliveredRead())] });
    renderAt(releaseCandidatePackHref(RC_ID));
    await ready();
    await until("[data-panel='published'] [data-published-receipt]");
    expect(q("[data-state-chip]")!.getAttribute("data-state-chip")).toBe("PUBLISHED");
    expect(panel("mirror-ghost")).toBeNull();
    expect(panel("publish-ghost")).toBeNull();
    expect(panel("mirror")!.querySelector("[data-mirror-status]")!.textContent).toBe("PENDING");
  });

  it("D1-O1 cold sealed-pack read prints its own published run label", async () => {
    const body = pack();
    body.display_label = "R-WFO-011";
    server({ PACK: [ok(body)], PUBLICATION: [ok(publication())] });
    renderAt(releaseCandidatePackHref(RC_ID));
    await ready();
    expect(q("[data-crumb-run]")!.textContent).toBe("R-WFO-011");
    const run = q('[data-rail-node="run"] .v')!;
    expect(run.textContent).toBe("R-WFO-011");
    expect(run.getAttribute("title")).toBe(RUN);
  });

  it("S11-U49 a pack read refused with 403 and with 404 says the same neutral sentence", async () => {
    const seen: string[] = [];
    for (const status of [403, 404]) {
      const api = server({ PACK: [problem(status, "RESEARCH_RELEASE_CANDIDATE_NOT_FOUND")] });
      renderAt(releaseCandidatePackHref(RC_ID));
      const notice = await until("[data-rc-notice]");
      seen.push(notice.getAttribute("data-rc-notice")!);
      expect(notice.textContent).toContain("Not available to you.");
      await flush();
      expect(api.of("PUBLICATION")).toHaveLength(0);
      cleanup();
      vi.restoreAllMocks();
    }
    expect(seen).toEqual(["denied", "denied"]);
  });

  it("S11-U50 a W5c #pack= deep link on the composition route forwards to the pack route; a malformed one is ignored", async () => {
    server({ PACK: [ok(pack())], PUBLICATION: [ok(publication())], COMPOSE: [ok(P04)] });
    renderAt(`/research/quantbt/runs/${RUN}/release-candidate#pack=${RC_ID}`);
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe(releaseCandidatePackHref(RC_ID)));
    await ready();
    cleanup();
    vi.restoreAllMocks();
    server({ COMPOSE: [ok(P04)] });
    renderAt(`/research/quantbt/runs/${RUN}/release-candidate#pack=https://evil`);
    await ready();
    expect(page().getAttribute("data-rc-mode")).toBe("compose");
    expect(packFromHash(`#pack=${RC_ID}`)).toBe(RC_ID);
    expect(packFromHash("#pack=%E0%A4%A")).toBeNull();
  });
});

/* ------------------------------------------------------------ source guards */

describe("S11 source guards", () => {
  const S11 = ["ReleaseCandidateDetail.tsx", "ReleaseCandidateRoute.tsx", "releaseCandidateClient.ts", "useReleaseCandidate.ts", "useReleaseCandidatePublication.ts"];
  const source = (...parts: string[]) => readFileSync(join(process.cwd(), "src", ...parts), "utf8");

  it("S11-U51 no S11 file formats, sorts or scrolls on the client, or writes a raw hex colour", () => {
    for (const name of S11) {
      const code = source("research", name)
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("*") && !line.trimStart().startsWith("//"))
        .join("\n");
      expect(code, name).not.toMatch(/toFixed|Intl\.|toLocaleString|\.sort\(|scrollIntoView/);
      expect(code, name).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
    /* W5c D-07/D-08: gold/green text keeps the white ground; the ghost is not faded. */
    const detail = source("research", "ReleaseCandidateDetail.tsx");
    expect(detail).not.toMatch(/opacity:\s*\.75/);
    expect(detail).toContain('.rc-state[data-s="SEALED_LOCAL"], .rc-state[data-s="PUBLISHED"] { border-color: var(--good); color: var(--good); background: var(--paper-raised); }');
  });

  it("S11-U52 the client reads two P22 routes only: /publication and /publish; no /mirror, no reconcile, no summary", () => {
    const code = (name: string) =>
      source("research", name)
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("*") && !line.trimStart().startsWith("//") && !line.trimStart().startsWith("/*"))
        .join("\n");
    const client = code("releaseCandidateClient.ts");
    const hooks = code("useReleaseCandidatePublication.ts") + code("useReleaseCandidate.ts");
    expect(client).toContain("/publication");
    expect(client).toContain("/publish");
    for (const text of [client, hooks]) {
      expect(text).not.toMatch(/\/mirror|reconcile|summary:|request_key:|setInterval/);
    }
    expect(client.match(/method: "(POST|PATCH)"/g)).toEqual(['method: "PATCH"', 'method: "POST"', 'method: "POST"']);
  });

  it("S11-U53 the routes are registered and 01/04/09/10/13 link into Screen 11; the 01 rc chip opens a sealed pack's route", () => {
    const module = source("features", "quantbt", "QuantBTModule.tsx");
    expect(module).toContain('<Route path="runs/:runId/release-candidate" element={<ReleaseCandidateRoute />} />');
    expect(module).toContain('<Route path="release-candidates/:releaseCandidateId" element={<ReleaseCandidatePackRoute />} />');
    expect(module.indexOf("runs/:runId/release-candidate")).toBeLessThan(module.indexOf('path="runs/:runId/*"'));
    expect(source("research", "RunLibrary.tsx")).toContain(
      'rc.kind === "LOCAL_SEAL" && rc.release_candidate_id ? releaseCandidatePackHref(rc.release_candidate_id) : releaseCandidateHref(runId)',
    );
    expect(source("research", "EvidenceFlow.tsx")).toContain("to={rcHref(hub.run_id,");
    expect(source("research", "ReportDetail.tsx")).toContain('data-action="release-candidate"');
    expect(source("research", "LineageDetail.tsx")).toContain("releaseCandidateHref(pick.run_id)");
    expect(source("research", "CompareDetail.tsx")).toContain("releaseCandidateHref(run.run_id)");
    expect(releaseCandidateHref("rrun_1")).toBe("/research/quantbt/runs/rrun_1/release-candidate");
    const item = { ...P04.pack[5]!, source: { label: "Replay", href: "/research/quantbt/runs/x/replay" } };
    expect(packSourceRoute(item, "rrun_1", null)).toBe("/research/quantbt/runs/rrun_1/execute");
    expect(packSourceRoute({ ...item, source: { ...item.source, href: null } }, "rrun_1", null)).toBeNull();
  });
});

/* ------------------------------------------------ FG-05: P22 closeout bindings */

describe("S11 P22 closeout bindings (FG-05)", () => {
  it("S11-U54 the raw approval status and the effective status are two separate, labelled facts; the mirror prints the server's optional facts as sent", async () => {
    const read = deliveredRead({}, {
      status: "APPROVED_WITH_CONDITION",
      effective_status: "EXPIRED",
      rc_superseded: true,
      decision_outcomes: [{ actor_user_id: "usr_reviewer_1", outcome: "APPROVE_WITH_CONDITION" }],
      condition_count: 2,
      quorum: { required: 2, met: 1 },
      approval_version: 3,
      blocker_count: 0,
      subject_label: "Delta RSI polynomial v3",
      as_of_utc_ms: PUBLISHED_AT + 30_000,
      assignee_pool_availability: { state: "AVAILABLE", reason_code: null },
      assignee_pool: [{ user_id: "usr_reviewer_1", username: "reviewer@bobby", role: "QUANT_REVIEWER" }],
    });
    server({ COMPOSE: [ok(deliveredCompose())], PUBLICATION: [ok(read)] });
    renderCompose();
    await ready();
    const effective = await until("[data-panel='mirror'] [data-mirror-effective-status='EXPIRED']");
    const raw = q("[data-panel='mirror'] [data-mirror-status]")!;
    expect(raw.textContent).toBe("APPROVED_WITH_CONDITION");
    expect(raw.getAttribute("title")).toBe("raw Governance approval status");
    expect(effective.textContent).toBe("effective EXPIRED");
    expect(raw.contains(effective)).toBe(false);
    expect(effective.contains(raw)).toBe(false);
    const superseded = q("[data-mirror-superseded]")!;
    expect(superseded.textContent).toBe(MIRROR_SUPERSEDED);
    expect(superseded.getAttribute("data-candidate-relation")).toBe("CURRENT");
    expect(superseded.getAttribute("data-rc-superseded")).toBe("true");
    expect(q("[data-mirror-pool]")!.textContent).toBe("assignee pool: reviewer@bobby (QUANT_REVIEWER)");
    expect(q("[data-mirror-decisions]")!.textContent).toBe("decisions recorded: usr_reviewer_1 APPROVE_WITH_CONDITION · condition_count 2");
    expect(q("[data-mirror-facts]")!.textContent).toBe(
      `approval ${APPROVAL} · created 2026-09-26T09:12:00.000Z · read 2026-09-26T09:13:00.000Z · subject Delta RSI polynomial v3 · approval_version 3 · blocker_count 0 · quorum met 1 of required 2 · mirror as of ${new Date(PUBLISHED_AT + 30_000).toISOString()} · publication as of ${iso(PUBLISHED_AT + 60_000)}`,
    );
    expect(screenText()).not.toContain("Quant Reviewers");
  });

  it("S11-U61 once Governance has recorded a decision the static outcome vocabulary is gone and only the real decisions print", async () => {
    const read = deliveredRead({}, {
      status: "APPROVED_WITH_CONDITION",
      decision_outcomes: [{ actor_user_id: "usr_reviewer_1", outcome: "APPROVE_WITH_CONDITION" }],
    });
    server({ COMPOSE: [ok(deliveredCompose())], PUBLICATION: [ok(read)] });
    renderCompose();
    await ready();
    const decisions = await until("[data-panel='mirror'] [data-mirror-decisions]");
    expect(decisions.textContent).toBe("decisions recorded: usr_reviewer_1 APPROVE_WITH_CONDITION");
    const meta = q("[data-panel='mirror'] [data-mirror-meta]")!;
    expect(meta.querySelector("[data-mirror-outcomes]")).toBeNull();
    expect(meta.textContent).toBe(`${MIRROR_POOL_ABSENT} · ⓘ·conditions: none`);
    expect(meta.querySelector("[data-reason-code]")!.getAttribute("title")).toContain("P22_GOVERNANCE_ASSIGNEE_POOL_NOT_PUBLISHED");
    expect(screenText()).not.toContain(MIRROR_OUTCOMES);
    expect(screenText()).not.toMatch(/(decision|possible) outcomes:/);
  });

  it("S11-U62 with no decision recorded the contract's outcome vocabulary stays, as a legend headed possible outcomes", async () => {
    expect(MIRROR_OUTCOMES).toBe("possible outcomes: APPROVED · APPROVED_WITH_CONDITION · CHANGES_REQUESTED · DENIED · EXPIRED");
    for (const decisions of [[], undefined]) {
      const read = deliveredRead({}, { status: "PENDING", decision_outcomes: decisions });
      server({ COMPOSE: [ok(deliveredCompose())], PUBLICATION: [ok(read)] });
      renderCompose();
      await ready();
      const legend = await until("[data-panel='mirror'] [data-mirror-outcomes='legend']");
      expect(legend.textContent).toBe(MIRROR_OUTCOMES);
      expect(screenText()).not.toContain("decision outcomes:");
      /* An empty list is said; the line never ends in a bare separator. */
      const recorded = document.querySelector("[data-panel=\"mirror\"] [data-mirror-decisions]")!.textContent ?? "";
      expect(recorded.startsWith(decisions === undefined ? "decisions recorded: not published" : "decisions recorded: none")).toBe(true);
      expect(recorded).not.toContain("recorded:  ·");
      expect(recorded).not.toMatch(/recorded: ·/);
      cleanup();
    }
  });

  it("S11-U63 every mirror meta separator closes the item before it, so a wrapped line cannot start with a separator", async () => {
    server({ COMPOSE: [ok(deliveredCompose())], PUBLICATION: [ok(deliveredRead({}, { status: "PENDING" }))] });
    renderCompose();
    await ready();
    const meta = await until("[data-panel='mirror'] [data-mirror-meta]");
    const segments = Array.from(meta.querySelectorAll(":scope > .rc-mseg"));
    expect(segments).toHaveLength(2);
    for (const segment of segments) expect(segment.lastElementChild!.textContent).toBe("·");
    for (const child of Array.from(meta.children)) {
      expect(child.textContent).not.toBe("·");
      expect(child.firstElementChild?.textContent ?? child.textContent).not.toBe("·");
    }
  });

  it("S11-U55 a conflict keeps the conflicting approval and the downstream code; the recorded intent's actor and attempts print; reconcile_allowed false blocks the same-request retry", async () => {
    const unknown = publication({
      state: "UNKNOWN",
      may_publish: true,
      blocked_reason: null,
      conflicting_approval_id: "apr_01K5CONFLICT",
      conflicting_approval_href: "/governance/approvals/apr_01K5CONFLICT/r1",
      downstream_code: "P22_DOWNSTREAM_OUTCOME_UNKNOWN",
      intent_actor: { user_id: "usr_researcher", username: "researcher@bobby" },
      attempt_count: 2,
      publication_created_at: "2026-09-26T09:10:00.000Z",
      updated_at_utc_ms: PUBLISHED_AT,
      reconcile_allowed: false,
    });
    const api = server({ COMPOSE: [ok(sealed())], PUBLICATION: [ok(unknown)], PUBLISH: [ok(deliveredRead())] });
    renderCompose();
    await ready();
    const card = await until("[data-panel='publish-unknown']");
    const conflict = card.querySelector<HTMLElement>("[data-publication-conflict]")!;
    expect(conflict.getAttribute("data-publication-conflict")).toBe("apr_01K5CONFLICT");
    expect(conflict.getAttribute("data-downstream-code")).toBe("P22_DOWNSTREAM_OUTCOME_UNKNOWN");
    expect(within(conflict).getByRole("link", { name: "apr_01K5CONFLICT" }).getAttribute("href")).toBe("/governance/approvals/apr_01K5CONFLICT/r1");
    expect(conflict.textContent).toBe(
      `conflicting approval apr_01K5CONFLICT · downstream code ⓘ`,
    );
    expect(card.querySelector("[data-publication-intent]")!.textContent).toBe(
      `recorded by researcher@bobby · attempt_count 2 · recorded 2026-09-26T09:10:00.000Z · updated ${new Date(PUBLISHED_AT).toISOString()}`,
    );
    const retry = await until("[data-action='publish-retry']");
    await waitFor(() => expect(retry.getAttribute("aria-disabled")).toBe("true"));
    expect(describedBy(retry)).toBe("the server does not admit a retry of the recorded request");
    fireEvent.click(retry);
    await flush();
    expect(api.of("PUBLISH")).toHaveLength(0);
    expect(screenText()).not.toContain(SERVER_PROSE);
    cleanup();
    vi.restoreAllMocks();
    /* A server href that is not a same-origin path is printed, never linked. */
    server({
      COMPOSE: [ok(deliveredCompose())],
      PUBLICATION: [ok(deliveredRead({ conflicting_approval_id: "apr_01K5CONFLICT", conflicting_approval_href: "https://governance.example/apr_01K5CONFLICT", downstream_code: null }))],
    });
    renderCompose();
    await ready();
    const published = await until("[data-panel='published'] [data-publication-conflict]");
    expect(published.querySelector("a")).toBeNull();
    expect(published.querySelector("[data-conflicting-approval-unrouted]")!.textContent).toBe("apr_01K5CONFLICT");
    expect(published.textContent).toBe("conflicting approval apr_01K5CONFLICT");
  });

  it("S11-U56 a draft save refused with 401 raises the shell's session signal once and builds no sign-in link", async () => {
    const reports = sessionReports();
    const api = server({ COMPOSE: [ok(sealable())], PATCH: [problem(401, "UNAUTHENTICATED")] });
    renderCompose();
    await ready();
    edit("KNOWN_LIMITATIONS_WAIVERS", "x");
    fireEvent.click(q("[data-action='save-declaration']")!);
    const notice = await until("[data-write-notice='patch'][data-outcome='denied']");
    await flush();
    expect(reports.count()).toBe(1);
    reports.stop();
    expect(within(notice).queryByRole("link")).toBeNull();
    expect(api.of("PATCH")).toHaveLength(1);
    expect(screenText()).not.toContain(SERVER_PROSE);
  });

  it("S11-U57 repeated clicks while a publish is in flight send one POST: the confirmed publish and the same-request retry", async () => {
    const gate = deferred();
    const api = server({
      COMPOSE: [ok(sealed())],
      PUBLICATION: [ok(publication())],
      PUBLISH: [{ ...ok(deliveredRead()), hold: gate.promise }],
    });
    renderCompose();
    await ready();
    await waitFor(() => expect(publishButton()!.getAttribute("data-publish-enabled")).toBe("true"));
    fireEvent.click(publishButton()!);
    fireEvent.click(screen.getByRole("button", { name: "Confirm publish" }));
    fireEvent.click(publishButton()!);
    fireEvent.click(publishButton()!);
    gate.release();
    await waitFor(() => expect(api.of("PUBLISH")).toHaveLength(1));
    await flush();
    expect(api.of("PUBLISH")).toHaveLength(1);
    cleanup();
    vi.restoreAllMocks();
    const hold = deferred();
    const retryApi = server({
      COMPOSE: [ok(sealed())],
      PUBLICATION: [ok(publication({ state: "UNKNOWN", may_publish: true, blocked_reason: null, reconcile_allowed: true }))],
      PUBLISH: [{ ...ok(deliveredRead()), hold: hold.promise }],
    });
    renderCompose();
    await ready();
    const retry = await until("[data-action='publish-retry']");
    await waitFor(() => expect(retry.getAttribute("aria-disabled")).toBeNull());
    fireEvent.click(retry);
    fireEvent.click(retry);
    fireEvent.doubleClick(retry);
    hold.release();
    await waitFor(() => expect(retryApi.of("PUBLISH")).toHaveLength(1));
    await flush();
    expect(retryApi.of("PUBLISH")).toHaveLength(1);
  });

  it("S11-U58 a typed 422 on publish is terminal and is followed by one publication read, never a second POST", async () => {
    const api = server({ COMPOSE: [ok(sealed())], PUBLICATION: [ok(publication())], PUBLISH: [problem(422, "RESEARCH_RELEASE_CANDIDATE_NOT_PUBLISHABLE")] });
    renderCompose();
    await ready();
    await waitFor(() => expect(publishButton()!.getAttribute("data-publish-enabled")).toBe("true"));
    fireEvent.click(publishButton()!);
    fireEvent.click(screen.getByRole("button", { name: "Confirm publish" }));
    await until("[data-write-notice='publish']");
    await waitFor(() => expect(api.of("PUBLICATION")).toHaveLength(2));
    await flush();
    expect(api.of("PUBLISH")).toHaveLength(1);
    expect(screenText()).not.toContain(SERVER_PROSE);
  });
});

/* ------------------------------------- F2 · the publication's promotion_pick */

describe("S11 F2 promotion_pick in the lineage rail", () => {
  const FACT = `sha256:${"e".repeat(64)}`;
  const PICK: NonNullable<RcPublication["promotion_pick"]> = {
    state: "WRITTEN",
    approval_id: APPROVAL,
    approval_status: "APPROVED_WITH_CONDITION",
    approval_version: 2,
    run_id: RUN,
    selected_trial_id: "trial_0007",
    artifact_id: "art_selected_params_01",
    fact_digest: FACT,
  };

  it("F2-S11-01 the served pick state, approval status, trial, artifact and fact digest are read (pack route)", async () => {
    server({ PACK: [ok(pack())], PUBLICATION: [ok(deliveredRead({ promotion_pick: PICK }))] });
    renderAt(releaseCandidatePackHref(RC_ID));
    await ready();
    const node = await until("[data-rail-node='promotion_pick'][data-pick-state]");
    expect(node.getAttribute("data-pick-state")).toBe("WRITTEN");
    expect(node.getAttribute("data-pick-status")).toBe("APPROVED_WITH_CONDITION");
    expect(node.querySelector("[data-state-chip]")!.getAttribute("data-state-chip")).toBe("APPROVED_WITH_CONDITION");
    expect(node.querySelector("[data-pick-state-word]")!.textContent!.trim()).toBe("WRITTEN");
    expect(node.querySelector("[data-pick-trial]")!.textContent).toBe("source trial_0007");
    /* F2b: the artifact and the fact digest are the node's tooltip and data, not two more lines. */
    expect(node.getAttribute("data-pick-artifact")).toBe("art_selected_params_01");
    expect(node.getAttribute("data-pick-fact")).toBe(FACT);
    expect(node.getAttribute("title")).toContain(FACT);
    expect(node.getAttribute("title")).toContain("artifact art_selected_params_01");
    /* the trial opens Screen 06 with the trial selected (hash pick=), on the pick's own run */
    const trial = node.querySelector("[data-pick-trial] a")!;
    expect(trial.getAttribute("href")).toBe(`/research/quantbt/runs/${RUN}/search#stage=search&pick=trial_0007`);
    expect(trial.getAttribute("title")).toContain("picked trial");
    /* the approval chip opens the mirror's own href, because the mirror served this approval */
    expect(node.querySelector("[data-action='open-pick-approval']")!.getAttribute("href")).toBe(`/governance/approvals/${APPROVAL}/r1`);
  });

  it("F2-S11-02 a pending pick shows the served PENDING status and PENDING_APPROVAL state as sent", async () => {
    server({
      PACK: [ok(pack())],
      PUBLICATION: [ok(publication({ state: "PENDING", promotion_pick: { ...PICK, state: "PENDING_APPROVAL", approval_status: "PENDING", approval_version: null } }))],
    });
    renderAt(releaseCandidatePackHref(RC_ID));
    await ready();
    const node = await until("[data-rail-node='promotion_pick'][data-pick-state]");
    expect(node.getAttribute("data-pick-state")).toBe("PENDING_APPROVAL");
    expect(node.querySelector("[data-state-chip]")!.getAttribute("data-state-chip")).toBe("PENDING");
  });

  it("F2-S11-03 a pick whose trial and artifact are null says each is not published, never 0 or a dash", async () => {
    server({ PACK: [ok(pack())], PUBLICATION: [ok(publication({ promotion_pick: { ...PICK, selected_trial_id: null, artifact_id: null } }))] });
    renderAt(releaseCandidatePackHref(RC_ID));
    await ready();
    const node = await until("[data-rail-node='promotion_pick'][data-pick-state]");
    expect(node.querySelector("[data-pick-trial]")!.textContent).toBe("trial — not published");
    expect(node.querySelector("[data-pick-artifact-absent]")!.textContent).toBe("artifact — not published");
    expect(node.querySelector("[data-pick-trial] a")).toBeNull();
  });

  it("F2-S11-04 no pick on the read is a typed absence (pack route)", async () => {
    server({ PACK: [ok(pack())], PUBLICATION: [ok(publication({ promotion_pick: null }))] });
    renderAt(releaseCandidatePackHref(RC_ID));
    await ready();
    const node = await until("[data-rail-node='promotion_pick']");
    expect(node.getAttribute("data-pick-absent")).toBe("true");
    expect(node.textContent).toBe("picknone yet");
    expect(node.querySelector("[title]")!.getAttribute("title")).toBe("promotion pick — not published");
    expect(node.querySelector("[data-state-chip]")).toBeNull();
  });

  it("F2-S11-05 the sealed composition reads the same served pick, and its absence", async () => {
    server({ COMPOSE: [ok(deliveredCompose())], PUBLICATION: [ok(deliveredRead({ promotion_pick: PICK }))] });
    renderCompose();
    await ready();
    const node = await until("[data-rail] [data-rail-node='promotion_pick'][data-pick-state]");
    expect(node.getAttribute("data-pick-status")).toBe("APPROVED_WITH_CONDITION");
    expect(node.querySelector("[data-pick-trial]")!.textContent).toBe("source trial_0007");
    cleanup();

    server({ COMPOSE: [ok(deliveredCompose())], PUBLICATION: [ok(deliveredRead())] });
    renderCompose();
    await ready();
    const absent = await until("[data-rail] [data-rail-node='promotion_pick'][data-pick-absent]");
    expect(absent.querySelector("[title]")!.getAttribute("title")).toContain("promotion pick — not published");
  });
});

/* --------------------------------------------- F2b · flow, tooltips, visuals */

describe("S11 F2b flow links, tooltips and the pack strip", () => {
  it("F2b-S11-01 the pack route's crumb returns to the run's composition and the header keeps report and lineage", async () => {
    server({ PACK: [ok(pack())], PUBLICATION: [ok(publication())] });
    renderAt(releaseCandidatePackHref(RC_ID));
    await ready();
    expect(q("[data-action='crumb-composition']")!.getAttribute("href")).toBe(releaseCandidateHref(RUN));
    expect(q("[data-action='run-report']")!.getAttribute("href")).toBe(`/research/quantbt/runs/${RUN}/report`);
    const lineage = q("[data-action='open-lineage']")!.getAttribute("href")!;
    expect(lineage).toContain(`/research/quantbt/alphas/${ALPHA}/lineage`);
    expect(lineage).toContain(`av=`);
  });

  it("F2b-S11-02 the long sentences are tooltips: seal, sealed, mirror, ghost and pack headings", async () => {
    server({ COMPOSE: [ok(sealed())], PUBLICATION: [ok(publication())] });
    renderCompose();
    await ready();
    expect(panel("seal")).toBeNull();
    expect(panel("sealed")!.querySelector("h3")!.getAttribute("title")).toBe(SEALED_SENTENCE);
    expect(panel("mirror-ghost")!.querySelector("[title]")!.getAttribute("title")).toBe(MIRROR_NOTE);
    expect(screen.queryByText(MIRROR_NOTE)).toBeNull();
    expect(screen.queryByText(SEAL_SENTENCE)).toBeNull();
    expect(q("[data-pack-counts]")!.getAttribute("title")).toBe(PACK_FOOT_TITLE);
    /* the typed legend of outcomes stays on the page */
    expect(q("[data-mirror-outcomes='legend']")).toBeNull();
    cleanup();
    server({ COMPOSE: [ok(sealable())] });
    renderCompose();
    await ready();
    expect(panel("seal")!.querySelector("h3")!.getAttribute("title")).toBe(SEAL_SENTENCE);
    expect(sealButton().getAttribute("title")).toContain(SEAL_SENTENCE);
  });

  it("F2b-S11-03 the pack strip has one cell per served row, in served order and status, and hover lights the row", async () => {
    server({ COMPOSE: [ok(P04)] });
    renderCompose();
    await ready();
    const cells = qa("[data-pack-strip] .cell");
    expect(cells.map((cell) => cell.getAttribute("data-s"))).toEqual(P04.pack.map((item) => item.status));
    expect(cells[0]!.getAttribute("title")).toBe(`${P04.pack[0]!.n} · ${P04.pack[0]!.item} — ${P04.pack[0]!.status}`);
    fireEvent.mouseEnter(cells[3]!);
    expect(q(`[data-pack-row][data-n='${P04.pack[3]!.n}']`)!.getAttribute("data-hl")).toBe("true");
    fireEvent.mouseLeave(cells[3]!);
    expect(q("[data-pack-row][data-hl='true']")).toBeNull();
  });

  it("F2b-S11-04 the progress dots follow the seal and the delivery the server stated", async () => {
    server({ COMPOSE: [ok(P04)] });
    renderCompose();
    await ready();
    const on = () => qa("[data-steps] .step").map((step) => step.getAttribute("data-on") === "true");
    expect(on()).toEqual([true, false, false]);
    cleanup();
    server({ COMPOSE: [ok(deliveredCompose())], PUBLICATION: [ok(deliveredRead())] });
    renderCompose();
    await ready();
    await waitFor(() => expect(on()).toEqual([true, true, true]));
  });
});

/* -------------------------------------------- file-wide route guard (last) */

describe("S11 F3 digests, lifecycle words and layout", () => {
  it("S11-F3-01 prints digests short with the full value in a title and lifecycle tokens as words", () => {
    expect(digestText(`sha256:${"a".repeat(64)}`)).toBe("aaaaaaaa");
    expect(digestText("not a digest")).toBe("not a digest");
    expect(stateWords("NOT_DELIVERED")).toBe("not delivered");
    expect(stateWords("APPROVED_WITH_CONDITION")).toBe("approved with condition");
  });
  it("S11-F3-02 source guards: the pack header keeps chips right, the pack table shows a scroll affordance, the record card does not stretch, YAML values wrap", () => {
    const detail = readFileSync(join(process.cwd(), "src", "research", "ReleaseCandidateDetail.tsx"), "utf8");
    expect(detail).toMatch(/\.rc-chips \{[^}]*margin-left: auto/);
    expect(detail).toMatch(/\.rc-pack \{[^}]*no-repeat local[^}]*no-repeat scroll/s);
    expect(detail).toMatch(/\.rc-group3 \{[^}]*align-items: flex-start/);
    expect(detail).toMatch(/\.rc-yaml \.v \{[^}]*overflow-wrap: anywhere/);
    expect(detail).not.toMatch(/\.rc-yaml \.line \{[^}]*white-space: nowrap/);
    expect(detail).not.toMatch(/\.rc-pack \.digest \{[^}]*text-overflow: ellipsis/);
  });
});

describe("S11 QA 2026-10-02 fixes", () => {
  it("QA-S11-U1 a sealed candidate is frozen: SEALED chip (no DRAFT), no seal card or confirm, no edit buttons; the open composition keeps them", async () => {
    server({ COMPOSE: [ok(sealable())] });
    renderCompose();
    await ready();
    expect(q("[data-state-chip]")!.getAttribute("data-state-chip")).toBe("DRAFT");
    expect(q("[data-action='local-seal']")).not.toBeNull();
    expect(qa("[data-action='edit-declaration']").length).toBeGreaterThan(0);
    cleanup();
    server({ COMPOSE: [ok(sealed())], PUBLICATION: [ok(publication())] });
    renderCompose();
    await ready();
    expect(q("[data-state-chip]")!.getAttribute("data-state-chip")).toBe("SEALED");
    expect(screenText()).not.toMatch(/\bDRAFT\b/);
    expect(q("[data-action='local-seal']")).toBeNull();
    expect(screen.queryByText(SEAL_CONFIRM)).toBeNull();
    expect(qa("[data-action='edit-declaration']")).toHaveLength(0);
    expect(q("[data-panel='sealed']")).not.toBeNull();
  });

  it("QA-S11-U3 Escape closes an open declaration editor without saving", async () => {
    const api = server({ COMPOSE: [ok(sealable())] });
    renderCompose();
    await ready();
    fireEvent.click(q("[data-action='edit-declaration']")!);
    const input = await until("[data-declaration-input]");
    expect(q("[data-editor]")).not.toBeNull();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(q("[data-editor]")).toBeNull();
    expect(api.of("COMPOSE")).toHaveLength(1);
  });

  it("QA-S11-U19 the record preview prints the sealed id from local_seal; unsealed it keeps the typed absence", async () => {
    server({ COMPOSE: [ok(sealable())] });
    renderCompose();
    await ready();
    const before = q("[data-yaml-key='release_candidate_id']")!;
    expect(before.getAttribute("data-yaml-value")).toBe("");
    expect(before.outerHTML).toContain("P21_ASSIGNED_ON_LOCAL_SEAL");
    cleanup();
    server({ COMPOSE: [ok(sealed())], PUBLICATION: [ok(publication())] });
    renderCompose();
    await ready();
    const after = q("[data-yaml-key='release_candidate_id']")!;
    expect(after.getAttribute("data-yaml-value")).toBe(RC_ID);
    expect(after.textContent).toContain(RC_ID);
    expect(after.textContent).not.toContain("P21_ASSIGNED_ON_LOCAL_SEAL");
  });

  it("B9-S11-A a peer's pack never locks this actor: the run-level seal is shown, this actor's seal and edit controls follow the served flags", async () => {
    server({ COMPOSE: [ok(peerSealed())], PUBLICATION: [ok(publication())] });
    renderCompose();
    await ready();
    expect(q("[data-panel='sealed']")).not.toBeNull();
    expect(q("[data-action='local-seal']")!.getAttribute("data-seal-enabled")).toBe("true");
    expect(qa("[data-action='edit-declaration']").length).toBeGreaterThan(0);
  });

  it("B9-S11-B own sealed draft: edit buttons are gone and no second seal is offered (flags: may_edit_draft=false, P21_ALREADY_SEALED)", async () => {
    server({ COMPOSE: [ok(sealed())], PUBLICATION: [ok(publication())] });
    renderCompose();
    await ready();
    expect(qa("[data-action='edit-declaration']")).toHaveLength(0);
    expect(q("[data-panel='seal']")).toBeNull();
  });

  it("B9-S11-C a seal answered 409 keeps the ORIGINAL request: the re-read says sealed (typed refusal) and the retry replays the same body, not the new fence", async () => {
    const moved = sealed();
    moved.source_fingerprint = "9".repeat(64);
    const api = server({
      COMPOSE: [ok(sealable()), ok(moved)],
      SEAL: [problem(409, "RESEARCH_RELEASE_CANDIDATE_CONFLICT"), ok(sealResponse(), 201)],
      PUBLICATION: [ok(publication())],
    });
    renderCompose();
    await ready();
    fireEvent.click(sealButton());
    fireEvent.click(screen.getByRole("button", { name: "Confirm local seal" }));
    const notice = await until("[data-write-notice='seal'][data-post-seal-refusal]");
    expect(notice.outerHTML).toContain("P21_ALREADY_SEALED");
    expect(notice.textContent).not.toContain(RC_CONFLICT_COPY);
    const retry = await until("[data-action='retry-seal-original']");
    fireEvent.click(retry);
    await waitFor(() => expect(api.of("SEAL")).toHaveLength(2));
    expect(api.of("SEAL")[1]!.body).toEqual(api.of("SEAL")[0]!.body);
    expect(api.of("SEAL")[1]!.body).toEqual({ draft_id: DRAFT_ID, expected_draft_revision: 1, expected_source_fingerprint: P04.source_fingerprint });
  });

  it("QA-S11-U2 below 720px a pack row is a labelled card: source and note stay", () => {
    const detail = readFileSync(join(process.cwd(), "src", "research", "ReleaseCandidateDetail.tsx"), "utf8");
    expect(detail).toContain(".rc-pack tbody tr { display: grid;");
    expect(detail).toContain('data-label="source"');
    expect(detail).toContain('data-label="note"');
  });
});

describe("S11 P22 route guard across this file", () => {
  it("S11-U60 no request sent by any test in this file reached /mirror or /publish/reconcile", () => {
    expect(ALL_CALLS.filter((call) => /\/mirror(\/|\?|$)|\/publish\/reconcile|reconcile/.test(call.url))).toEqual([]);
  });
});
