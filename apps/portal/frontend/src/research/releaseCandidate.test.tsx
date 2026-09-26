/**
 * P21 consumer tests — Screen 11 Release Candidate composer (S11-U01…U24).
 *
 * The base composition is the one the Research preview served for its seeded
 * P04 and WFO runs (`w5cRealRc.fixture.json`); each variant is that answer with
 * the fields the case needs changed, never a hand-built body.
 *
 * The claims that carry this phase:
 *
 *  - **every value is the server's** — 17 YAML lines and 12 rows in order, the
 *    counter as sent, digests whole, a null value `null` with its reason;
 *  - **declarations are the only input**, saved with the body CAS the contract
 *    publishes; a 409 re-reads and keeps the reader's text; a bad body is
 *    named by field path before any request;
 *  - **the local seal is the only verb**: saved draft + `may_seal` + confirm,
 *    then the immutable pack, `NOT_DELIVERED · NOT_APPROVED`, never PUBLISHED;
 *  - **publish and the mirror are the hi-fi's ghost**, typed by
 *    `P22_PUBLICATION_NOT_COMMISSIONED`, with nothing interactive in the mirror;
 *  - **refusals are panel-local** and no write is retried on its own.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReleaseCandidateRoute } from "./ReleaseCandidateRoute";
import {
  CONFLICT_COPY,
  DENIED_COPY,
  MIRROR_GHOST_NOTE,
  SEAL_BUTTON,
  UNAVAILABLE_COPY,
  declarationIssues,
  packFromHash,
  packSourceRoute,
  releaseCandidateHref,
  yamlText,
  type RcCompose,
  type RcPack,
  type RcSealResponse,
} from "./releaseCandidateClient";
import real from "./w5cRealRc.fixture.json";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.location.hash = "";
});

/* ---------------------------------------------------------------- fixtures */

const P04 = real.p04 as unknown as RcCompose;
const WFO = real.wfo as unknown as RcCompose;
const RUN = P04.run_id;
const RC_ID = "rc_01K5W5CSEA1ED0000000000000";
const DRAFT_ID = "rcd_01K5W5CDRAFT00000000000AB";
const SEALED_AT = 1_790_320_100_000;
const PACK_DIGEST = "5".repeat(64);

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** The P04 answer with its three MISSING rows resolved: what a sealable composition looks like. */
function sealable(overrides: { saved?: boolean; revision?: number } = {}): RcCompose {
  const body = clone(P04);
  const saved = overrides.saved ?? true;
  for (const item of body.pack) {
    if (item.status === "MISSING") {
      item.status = "COMPLETE";
      item.digest = "6".repeat(64);
      item.availability = { state: "AVAILABLE", reason_code: null };
    }
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
  body.actions = { ...body.actions, may_seal: saved, seal_blocked_reason: saved ? null : "P21_RESEARCHER_DECLARATIONS_REQUIRED" };
  body.gate_verdict = { ...body.gate_verdict, title: saved ? "local seal ready — downstream publish remains P22" : body.gate_verdict.title };
  return body;
}

function sealed(): RcCompose {
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
  body.rail = body.rail.map((node) =>
    node.key === "release_candidate" ? { ...node, value: RC_ID, detail: "sealed locally — not delivered", tone: "green" } : node,
  );
  return body;
}

function unbound(): RcCompose {
  const body = clone(P04);
  body.run.binding = null;
  body.rail = body.rail.map((node) =>
    node.key === "alpha" || node.key === "alpha_version" ? { ...node, value: "— unbound / scratch run", detail: null, tone: "dim" } : node,
  );
  body.actions = { ...body.actions, may_seal: false, seal_blocked_reason: "P21_SCRATCH_RUN_UNBOUND" };
  body.source_absences = { ...body.source_absences, alpha_binding: { state: "NOT_PUBLISHED", reason_code: "P21_SCRATCH_RUN_UNBOUND" } };
  body.yaml = body.yaml.map((field) => (field.key === "alpha_version_id" ? { ...field, value: null, tone: "red", availability: { state: "NOT_PUBLISHED", reason_code: "P21_ALPHA_BINDING_NOT_PUBLISHED" } } : field));
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

function pack(): RcPack {
  const body = sealed();
  return {
    schema_version: "research.release-candidate-pack.v1",
    read_authority: "PORTAL_PERSISTED_RESEARCH",
    release_candidate_id: RC_ID,
    run_id: RUN,
    pack_digest: PACK_DIGEST,
    sealed_at_utc_ms: SEALED_AT,
    frozen_core: {
      fields: body.fields.map((field) => (field.key === "release_candidate_id" ? { ...field, value: RC_ID, tone: "ink", availability: { state: "AVAILABLE", reason_code: null } } : field)),
      pack: body.pack,
      source_fingerprint: body.source_fingerprint,
      draft: {
        known_limitations: body.draft.known_limitations!,
        proposed_use_restrictions: body.draft.proposed_use_restrictions!,
      },
    },
    delivery: body.local_seal,
  };
}

/* ------------------------------------------------------------------ server */

type Answer = { status: number; body: unknown };
interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

const problem = (status: number, code: string, message = "refused") => ({ status, body: { error: { code, message }, request_id: `req_${status}` } });

function server(script: { compose?: Answer[]; patch?: Answer[]; seal?: Answer[]; pack?: Answer[] } = {}) {
  const calls: Call[] = [];
  const take = (queue: Answer[] | undefined, fallback: Answer) => (queue && queue.length > 1 ? queue.shift()! : queue?.[0] ?? fallback);
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ url, method, headers: (init?.headers ?? {}) as Record<string, string>, body: (init?.body as string) ?? null });
    let answer: Answer;
    if (method === "PATCH") answer = take(script.patch, { status: 200, body: sealable() });
    else if (method === "POST") answer = take(script.seal, { status: 201, body: sealResponse() });
    else if (url.includes("/api/v1/research/release-candidates/")) answer = take(script.pack, { status: 200, body: pack() });
    else answer = take(script.compose, { status: 200, body: P04 });
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } });
  });
  return {
    calls,
    composes: () => calls.filter((call) => call.method === "GET" && /\/release-candidate(\?|$)/.test(call.url)),
    patches: () => calls.filter((call) => call.method === "PATCH"),
    seals: () => calls.filter((call) => call.method === "POST"),
    packs: () => calls.filter((call) => call.url.includes("/api/v1/research/release-candidates/")),
  };
}

function renderRoute(runId = RUN, hash = "") {
  if (hash) window.location.hash = hash;
  return render(
    <MemoryRouter initialEntries={[`/research/quantbt/runs/${runId}/release-candidate${hash}`]}>
      <Routes>
        <Route path="/research/quantbt/runs/:runId/release-candidate" element={<ReleaseCandidateRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function flush() {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function ready() {
  await screen.findByRole("region", { name: "evidence pack" });
}

const q = <T extends Element = HTMLElement>(selector: string) => document.querySelector(selector) as T | null;
const qa = (selector: string) => Array.from(document.querySelectorAll(selector));
/** What a reader sees on the screen: its text without the injected stylesheet. */
function screenText(): string {
  const copy = q("[data-screen='release-candidate']")!.cloneNode(true) as HTMLElement;
  copy.querySelectorAll("style").forEach((style) => style.remove());
  return copy.textContent ?? "";
}

/* ------------------------------------------------------------------ screen */

describe("S11 Release Candidate — the composition as served", () => {
  it("S11-U01 renders the 17 server lines and the 12 rows in contract order with the server counter", async () => {
    server();
    renderRoute();
    await ready();
    const lines = qa("[data-yaml-key]");
    expect(lines.map((line) => line.getAttribute("data-yaml-key"))).toEqual(P04.yaml.map((field) => field.key));
    expect(lines).toHaveLength(17);
    /* A null value prints `null` with its reason; a digest prints whole. */
    const audit = q("[data-yaml-key='final_audit_run_id']")!;
    expect(audit.textContent).toContain("null");
    expect(audit.textContent).toContain("P21_FINAL_AUDIT_RUN_NOT_PUBLISHED");
    expect(q("[data-yaml-key='manifest_digest']")!.getAttribute("data-yaml-value")).toBe(P04.fields.find((f) => f.key === "manifest_digest")!.value);
    const rows = qa("[data-pack-row]");
    expect(rows.map((row) => row.getAttribute("data-pack-row"))).toEqual(P04.pack.map((item) => item.key));
    expect(rows.map((row) => row.getAttribute("data-status"))).toEqual(P04.pack.map((item) => item.status));
    expect(q("[data-pack-counts]")!.textContent).toBe("6 COMPLETE · 1 DEGRADED · 2 INPUT · 3 MISSING");
    expect(qa("[data-rail-key]").map((node) => node.getAttribute("data-rail-key"))).toEqual(["alpha", "alpha_version", "run", "selected_params", "release_candidate"]);
    expect(q("[data-rail-key='release_candidate']")!.getAttribute("data-tone")).toBe("gold");
    expect(q("[data-rc-state]")!.textContent).toBe("DRAFT");
  });

  it("S11-U02 keeps DEGRADED, MISSING and INPUT distinct, each with its own title and reason", async () => {
    server();
    renderRoute();
    await ready();
    const degraded = q("[data-pack-row='ROBUSTNESS_PARAM_STABILITY_REGIME']")!;
    expect(degraded.getAttribute("data-status")).toBe("DEGRADED");
    expect(degraded.querySelector(".rc-status")!.getAttribute("title")).toBe("partial artifact — travels as DEGRADED, reviewer sees it");
    const missing = q("[data-pack-row='METHODOLOGY_CLAIM']")!;
    expect(missing.getAttribute("data-status")).toBe("MISSING");
    expect(missing.querySelector("[data-reason-code='P21_METHODOLOGY_CLAIM_NOT_PUBLISHED']")).not.toBeNull();
    const input = q("[data-pack-row='KNOWN_LIMITATIONS_WAIVERS']")!;
    expect(input.querySelector(".rc-status")!.getAttribute("title")).toBe("researcher declaration — part of the signed pack");
    expect(input.querySelector("[data-absent='declaration']")!.textContent).toBe("— not declared");
    expect(input.querySelector("[data-action='edit-declaration']")).not.toBeNull();
    /* The seal names the server's reason; the verdict is the server's title. */
    expect(q("[data-seal-blocked]")!.getAttribute("data-seal-blocked")).toBe("P21_REQUIRED_EVIDENCE_MISSING");
    expect(q("[data-seal-blocked]")!.textContent).toContain("resolve MISSING rows first");
    expect(q("[data-gate-verdict] .t")!.textContent).toBe(P04.gate_verdict.title);
  });

  it("S11-U03 draws the taxonomy verbatim as UNSET and never labels a pin CHANGED", async () => {
    server();
    renderRoute();
    await ready();
    expect(qa("[data-taxonomy-row]").map((row) => row.getAttribute("data-taxonomy-state"))).toEqual(["UNSET", "UNSET", "UNSET", "UNSET"]);
    expect(q("[data-taxonomy]")!.textContent).not.toMatch(/\bCHANGED\b|\bUNCHANGED\b/);
    expect(q("[data-last-rc]")!.textContent).toContain("none published");
    expect(q("[data-taxonomy] [data-reason-code='P22_PUBLISHED_COMPARISON_NOT_COMMISSIONED']")).not.toBeNull();
  });

  it("S11-U04 renders the two certification axes as two separate chips, ghosted when absent", async () => {
    server();
    renderRoute();
    await ready();
    const claim = q("[data-cert-axis='methodology_claim']")!;
    const engine = q("[data-cert-axis='engine_execution_contract']")!;
    expect(claim).not.toBe(engine);
    expect(claim.hasAttribute("data-ghost")).toBe(true);
    expect(claim.getAttribute("title")).toContain("methodology claim ceiling — holdout locked, unlock lifts B → A");
    expect(engine.getAttribute("title")).toContain("engine execution-contract certification (0–4) — separate axis from the methodology claim");
    expect(engine.getAttribute("data-reason-code")).toBe("P21_ENGINE_EXECUTION_CERTIFICATION_NOT_PUBLISHED");
  });

  it("S11-U05 links every row that names a source to a screen this build serves; Alpha 360° stays unlinked", async () => {
    server();
    renderRoute();
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
      ROBUSTNESS_PARAM_STABILITY_REGIME: "/research/quantbt/alphas/delta-rsi-polynomial-alpha/compare",
      REPRODUCIBILITY_PARITY_CHECKSUMS: `${run}/freeze`,
    });
    const passport = q("[data-pack-row='ALPHA_VERSION_PASSPORT'] [data-unlinked]")!;
    expect(passport.getAttribute("title")).toContain("Alpha 360°");
    /* The rail links the Alpha to its lineage (10) and the run to its hub (04). */
    expect(q("[data-rail-key='alpha']")!.getAttribute("href")).toBe("/research/quantbt/alphas/delta-rsi-polynomial-alpha/lineage");
    expect(q("[data-rail-key='run']")!.getAttribute("href")).toBe(`${run}/evidence`);
    expect(q("[data-action='run-report']")!.getAttribute("href")).toBe(`${run}/report`);
  });

  it("S11-U06 draws publish and the Approval Inbox mirror as the typed not-commissioned ghost", async () => {
    server();
    renderRoute();
    await ready();
    const publish = q("[data-publish-ghost]")!;
    expect(publish.getAttribute("data-blocked-reason")).toBe("P22_PUBLICATION_NOT_COMMISSIONED");
    const button = within(publish as HTMLElement).getByRole("button", { name: "Publish release candidate" });
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(document.getElementById(button.getAttribute("aria-describedby")!)!.textContent).toContain("P22_PUBLICATION_NOT_COMMISSIONED");
    const mirror = q("[data-mirror-ghost]")!;
    expect(mirror.querySelectorAll("a, button, input, textarea, select, [tabindex]")).toHaveLength(0);
    expect(mirror.textContent).toContain(MIRROR_GHOST_NOTE);
    expect(mirror.textContent).toContain("SLA starts at publish");
    /* No fabricated governance state anywhere on the screen. */
    expect(screenText()).not.toMatch(/\bPUBLISHED\b(?!_)|PENDING|left\b/);
    fireEvent.click(button);
    await flush();
  });

  it("S11-U07 copies exactly the server's 17 lines joined, and says so for 1.5 s", async () => {
    server();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderRoute();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "copy yaml" }));
    await flush();
    expect(writeText).toHaveBeenCalledWith(yamlText(P04.yaml));
    expect(writeText.mock.calls[0]![0].split("\n")).toHaveLength(17);
    expect(writeText.mock.calls[0]![0]).toContain("final_audit_run_id: null");
    expect(screen.getByRole("button", { name: "✓ copied" })).toBeTruthy();
  });

  it("S11-U08 a scratch run keeps the whole screen, shows the banner and blocks the seal with the server's reason", async () => {
    server({ compose: [{ status: 200, body: unbound() }] });
    renderRoute();
    await ready();
    expect(q("[data-banner='NOT_PUBLISHABLE']")!.textContent).toContain("This run was submitted without an alpha_version binding — a scratch research run.");
    expect(q("[data-rc-state]")!.textContent).toBe("NOT_PUBLISHABLE");
    expect(q("[data-rail-key='alpha_version']")!.getAttribute("data-tone")).toBe("dim");
    expect(q("[data-yaml-key='alpha_version_id'] .v")!.getAttribute("data-tone")).toBe("red");
    const seal = screen.getByRole("button", { name: SEAL_BUTTON });
    expect(seal.getAttribute("aria-disabled")).toBe("true");
    expect(document.getElementById(seal.getAttribute("aria-describedby")!)!.textContent).toContain("P21_SCRATCH_RUN_UNBOUND");
    expect(qa("[data-pack-row]")).toHaveLength(12);
  });

  it("S11-U09 a partial composition (the real WFO run) says so beside the content, not instead of it", async () => {
    server({ compose: [{ status: 200, body: WFO }] });
    renderRoute(WFO.run_id);
    await ready();
    expect(q("[data-rc-state-panel]")!.getAttribute("data-rc-state-panel")).toBe("partial");
    expect(q("[data-research-detail]")!.textContent).toContain("P21_REFERENCED_SOURCE_INTEGRITY_FAILED");
    expect(q("[data-pack-counts]")!.textContent).toBe("3 COMPLETE · 0 DEGRADED · 2 INPUT · 7 MISSING");
    expect(q("[data-rail-key='selected_params']")!.getAttribute("data-tone")).toBe("dim");
    expect(q("[data-seal-blocked]")!.getAttribute("data-seal-blocked")).toBe("P21_REFERENCED_SOURCE_INTEGRITY_FAILED");
  });
});

describe("S11 Release Candidate — declarations (draft CAS)", () => {
  it("S11-U10 names a bad body by field path before any request", async () => {
    const api = server();
    renderRoute();
    await ready();
    fireEvent.click(q("[data-pack-row='KNOWN_LIMITATIONS_WAIVERS'] [data-action='edit-declaration']")!);
    const box = q<HTMLTextAreaElement>("[data-declaration-input='known_limitations']")!;
    fireEvent.change(box, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "save declarations" }));
    await flush();
    expect(api.patches()).toHaveLength(0);
    expect(q("[data-issue-path='known_limitations']")!.textContent).toContain("only whitespace");
    expect(q("[data-issue-path='(body)']")!.textContent).toContain("at least one declaration is required");
    expect(box.getAttribute("aria-invalid")).toBe("true");
    expect(declarationIssues({ known_limitations: "x".repeat(4097), proposed_use_restrictions: "ok" })).toEqual([
      { path: "known_limitations", message: "at most 4,096 characters (now 4,097)" },
    ]);
  });

  it("S11-U11 saves both declarations with the server's revision and source fingerprint, then shows the server's answer", async () => {
    const saved = sealable();
    const api = server({ patch: [{ status: 200, body: saved }] });
    renderRoute();
    await ready();
    fireEvent.click(q("[data-pack-row='KNOWN_LIMITATIONS_WAIVERS'] [data-action='edit-declaration']")!);
    fireEvent.change(q("[data-declaration-input='known_limitations']")!, { target: { value: "Single venue depth." } });
    expect(q("[data-unsaved='known_limitations']")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "save declarations" }));
    await flush();
    expect(api.patches()).toHaveLength(1);
    const call = api.patches()[0]!;
    expect(call.url).toBe(`/api/v1/quantbt/runs/${RUN}/release-candidate/draft`);
    expect(call.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(call.body!)).toEqual({
      expected_revision: 0,
      expected_source_fingerprint: P04.source_fingerprint,
      known_limitations: "Single venue depth.",
      proposed_use_restrictions: null,
    });
    /* The row now shows the server's saved revision; the box follows the server. */
    expect(q("[data-draft-revision]")!.getAttribute("data-draft-revision")).toBe("1");
    expect(q("[data-unsaved='known_limitations']")).toBeNull();
    expect(q<HTMLTextAreaElement>("[data-declaration-input='known_limitations']")!.value).toBe(saved.draft.known_limitations);
  });

  it("S11-U12 a 409 reads the composition again, says so verbatim and keeps every typed character", async () => {
    const api = server({ patch: [problem(409, "RESEARCH_RELEASE_CANDIDATE_CONFLICT", "Release Candidate draft changed; reload it.")] });
    renderRoute();
    await ready();
    fireEvent.click(q("[data-pack-row='PROPOSED_USE_RESTRICTIONS'] [data-action='edit-declaration']")!);
    fireEvent.change(q("[data-declaration-input='proposed_use_restrictions']")!, { target: { value: "Paper first." } });
    fireEvent.click(screen.getByRole("button", { name: "save declarations" }));
    await flush();
    expect(api.composes()).toHaveLength(2);
    expect(q("[data-mutation-state='conflict']")!.textContent).toContain(CONFLICT_COPY);
    expect(q<HTMLTextAreaElement>("[data-declaration-input='proposed_use_restrictions']")!.value).toBe("Paper first.");
    expect(q("[data-unsaved='proposed_use_restrictions']")).not.toBeNull();
    expect(api.patches()).toHaveLength(1);
  });

  it("S11-U13 a 403 locks both writes with the spec's denied sentence and never retries", async () => {
    const api = server({ patch: [problem(403, "RESEARCH_RELEASE_CANDIDATE_FORBIDDEN")] });
    renderRoute();
    await ready();
    fireEvent.click(q("[data-pack-row='KNOWN_LIMITATIONS_WAIVERS'] [data-action='edit-declaration']")!);
    fireEvent.change(q("[data-declaration-input='known_limitations']")!, { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "save declarations" }));
    await flush();
    expect(q("[data-mutation-state='denied']")!.textContent).toContain(DENIED_COPY);
    expect((screen.getByRole("button", { name: "save declarations" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: SEAL_BUTTON }).getAttribute("aria-disabled")).toBe("true");
    await flush();
    expect(api.patches()).toHaveLength(1);
    /* The composition stays on screen under the notice. */
    expect(qa("[data-pack-row]")).toHaveLength(12);
  });

  it("S11-U14 a 503 keeps the draft, says so, and retries only on the reader's click", async () => {
    const api = server({ patch: [problem(503, "RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE"), { status: 200, body: sealable() }] });
    renderRoute();
    await ready();
    fireEvent.click(q("[data-pack-row='KNOWN_LIMITATIONS_WAIVERS'] [data-action='edit-declaration']")!);
    fireEvent.change(q("[data-declaration-input='known_limitations']")!, { target: { value: "kept" } });
    fireEvent.click(screen.getByRole("button", { name: "save declarations" }));
    await flush();
    expect(q("[data-mutation-state='unavailable']")!.textContent).toContain(UNAVAILABLE_COPY);
    expect(q<HTMLTextAreaElement>("[data-declaration-input='known_limitations']")!.value).toBe("kept");
    await flush();
    expect(api.patches()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "try the save again" }));
    await flush();
    expect(api.patches()).toHaveLength(2);
  });

  it("S11-U15 a 400 is terminal for the request and keeps the text", async () => {
    server({ patch: [problem(400, "RESEARCH_RELEASE_CANDIDATE_INVALID")] });
    renderRoute();
    await ready();
    fireEvent.click(q("[data-pack-row='KNOWN_LIMITATIONS_WAIVERS'] [data-action='edit-declaration']")!);
    fireEvent.change(q("[data-declaration-input='known_limitations']")!, { target: { value: "kept" } });
    fireEvent.click(screen.getByRole("button", { name: "save declarations" }));
    await flush();
    expect(q("[data-mutation-state='terminal']")!.textContent).toContain("The server refused this save.");
    expect(q("[data-mutation-state='terminal']")!.textContent).toContain("RESEARCH_RELEASE_CANDIDATE_INVALID");
    expect(q<HTMLTextAreaElement>("[data-declaration-input='known_limitations']")!.value).toBe("kept");
  });
});

describe("S11 Release Candidate — the local seal", () => {
  it("S11-U16 needs a saved draft: unsaved text blocks the seal with its own reason", async () => {
    server({ compose: [{ status: 200, body: sealable() }] });
    renderRoute();
    await ready();
    const seal = screen.getByRole("button", { name: SEAL_BUTTON });
    expect(seal.getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(q("[data-pack-row='KNOWN_LIMITATIONS_WAIVERS'] [data-action='edit-declaration']")!);
    fireEvent.change(q("[data-declaration-input='known_limitations']")!, { target: { value: "edited" } });
    const blocked = screen.getByRole("button", { name: SEAL_BUTTON });
    expect(blocked.getAttribute("aria-disabled")).toBe("true");
    expect(document.getElementById(blocked.getAttribute("aria-describedby")!)!.textContent).toContain("save your declarations first");
  });

  it("S11-U17 asks for confirmation, sends only the server's identities, then reads the facts and the pack", async () => {
    const api = server({ compose: [{ status: 200, body: sealable() }, { status: 200, body: sealed() }] });
    renderRoute();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: SEAL_BUTTON }));
    expect(api.seals()).toHaveLength(0);
    const dialog = screen.getByRole("alertdialog", { name: "confirm local seal" });
    expect(dialog.textContent).toContain("Seal now?");
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm local seal" }));
    await flush();
    expect(api.seals()).toHaveLength(1);
    expect(JSON.parse(api.seals()[0]!.body!)).toEqual({
      draft_id: DRAFT_ID,
      expected_draft_revision: 1,
      expected_source_fingerprint: P04.source_fingerprint,
    });
    expect(api.composes()).toHaveLength(2);
    expect(api.packs()).toHaveLength(1);
    const card = q("[data-sealed]")!;
    expect(card.getAttribute("data-sealed")).toBe(RC_ID);
    expect(card.querySelector("[data-delivery-state]")!.textContent).toBe("NOT_DELIVERED");
    expect(card.querySelector("[data-approval-state]")!.textContent).toBe("NOT_APPROVED");
    /* SEALED_LOCAL sits beside DRAFT; nothing says PUBLISHED. */
    expect(q("[data-rc-state]")!.textContent).toBe("DRAFT");
    expect(q("[data-rc-seal-state]")!.textContent).toBe("SEALED_LOCAL");
    expect(q("[data-rail-key='release_candidate']")!.getAttribute("data-tone")).toBe("green");
    const view = q("[data-sealed-pack]")!;
    expect(view.querySelectorAll("[data-frozen-field]")).toHaveLength(17);
    expect(view.querySelectorAll("[data-frozen-row]")).toHaveLength(12);
    expect(view.querySelector("[data-frozen-field='release_candidate_id']")!.textContent).toBe(RC_ID);
    expect(view.querySelector("[data-frozen-declaration='known_limitations']")!.textContent).toBe(sealed().draft.known_limitations);
    expect(q("[data-seal-replayed]")).toBeNull();
    expect(screenText()).not.toMatch(/\bPUBLISHED\b(?!_)/);
  });

  it("S11-U18 a replayed seal says the server returned the same pack, not a second candidate", async () => {
    const api = server({ compose: [{ status: 200, body: sealed() }] });
    renderRoute();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: SEAL_BUTTON }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm local seal" }));
    await flush();
    expect(api.seals()).toHaveLength(1);
    expect(q("[data-seal-replayed]")!.textContent).toContain("a replay, not a second candidate");
  });

  it("S11-U19 a 422 is terminal for the seal; a 409 re-reads; neither is retried", async () => {
    const api = server({
      compose: [{ status: 200, body: sealable() }],
      seal: [problem(422, "RESEARCH_RELEASE_CANDIDATE_NOT_PUBLISHABLE"), problem(409, "RESEARCH_RELEASE_CANDIDATE_CONFLICT", "Evidence changed since composing; review the pack.")],
    });
    renderRoute();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: SEAL_BUTTON }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm local seal" }));
    await flush();
    expect(q("[data-mutation-state='terminal']")!.getAttribute("data-mutation-lane")).toBe("seal");
    expect(q("[data-mutation-state='terminal']")!.textContent).toContain("RESEARCH_RELEASE_CANDIDATE_NOT_PUBLISHABLE");
    expect(api.packs()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: SEAL_BUTTON }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm local seal" }));
    await flush();
    expect(q("[data-mutation-state='conflict']")!.textContent).toContain(CONFLICT_COPY);
    expect(api.seals()).toHaveLength(2);
    expect(api.composes()).toHaveLength(2);
  });

  it("S11-U20 a #pack= deep link opens the sealed pack; a refused pack read is panel-local", async () => {
    const api = server({ compose: [{ status: 200, body: sealed() }], pack: [problem(404, "RESEARCH_RELEASE_CANDIDATE_NOT_FOUND")] });
    renderRoute(RUN, `#pack=${RC_ID}`);
    await ready();
    await flush();
    expect(api.packs()).toHaveLength(1);
    expect(api.packs()[0]!.url).toBe(`/api/v1/research/release-candidates/${RC_ID}`);
    expect(q("[data-research-panel='sealed pack']")!.getAttribute("data-state")).toBe("terminal");
    expect(qa("[data-pack-row]")).toHaveLength(12);
  });
});

describe("S11 Release Candidate — the composition read refused", () => {
  it.each([
    [404, "RESEARCH_RELEASE_CANDIDATE_NOT_FOUND", "terminal"],
    [403, "RESEARCH_RELEASE_CANDIDATE_FORBIDDEN", "denied"],
    [503, "RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE", "unavailable"],
    [400, "RESEARCH_RELEASE_CANDIDATE_INVALID", "terminal"],
  ])("S11-U21 %s %s renders its own state inside the screen frame", async (status, code, state) => {
    const api = server({ compose: [problem(status, code)] });
    renderRoute();
    await flush();
    expect(q("[data-screen='release-candidate']")).not.toBeNull();
    expect(q("[data-rc-state-panel]")!.getAttribute("data-rc-state-panel")).toBe(state);
    expect(qa("[data-pack-row]")).toHaveLength(0);
    if (status === 404) expect(q("[data-action='run-library']")!.getAttribute("href")).toBe("/research/quantbt/runs");
    await flush();
    expect(api.composes()).toHaveLength(1);
    if (status === 503) {
      fireEvent.click(screen.getByRole("button", { name: "read again" }));
      await flush();
      expect(api.composes()).toHaveLength(2);
    }
  });
});

/* -------------------------------------------------------------------- pure */

describe("S11 Release Candidate — pure parts, wiring and boundary", () => {
  it("S11-U22 routes, fragments and the key-owned source map", () => {
    expect(releaseCandidateHref("rrun_1")).toBe("/research/quantbt/runs/rrun_1/release-candidate");
    expect(releaseCandidateHref("rrun_1", { pack: RC_ID })).toBe(`/research/quantbt/runs/rrun_1/release-candidate#pack=${RC_ID}`);
    expect(packFromHash(`#pack=${RC_ID}`)).toBe(RC_ID);
    expect(packFromHash("#pack=https://evil")).toBeNull();
    /* A server href is never a URL here: an unknown route string still maps by key. */
    const item = { ...P04.pack[5]!, source: { label: "Replay", href: "/research/quantbt/runs/x/replay" } };
    expect(packSourceRoute(item, "rrun_1", null)).toBe("/research/quantbt/runs/rrun_1/execute");
    expect(packSourceRoute({ ...item, source: { ...item.source, href: null } }, "rrun_1", null)).toBeNull();
  });

  it("S11-U23 the route is registered and 01/04/09/10/13 link into Screen 11", () => {
    const read = (...parts: string[]) => readFileSync(join(process.cwd(), "src", ...parts), "utf8");
    const module = read("features", "quantbt", "QuantBTModule.tsx");
    expect(module).toContain('<Route path="runs/:runId/release-candidate" element={<ReleaseCandidateRoute />} />');
    expect(module).toMatch(/report\|release-candidate\)\|runs\)\\\/\?\$\//);
    expect(read("research", "RunLibrary.tsx")).toContain("releaseCandidateHref(runId, { pack: rc.kind === \"LOCAL_SEAL\" ? rc.release_candidate_id : null })");
    expect(read("research", "EvidenceFlow.tsx")).toContain("to={releaseCandidateHref(hub.run_id)}");
    expect(read("research", "ReportDetail.tsx")).toContain('data-action="release-candidate"');
    expect(read("research", "LineageDetail.tsx")).toContain("releaseCandidateHref(pick.run_id)");
    expect(read("research", "CompareDetail.tsx")).toContain("releaseCandidateHref(run.run_id)");
  });

  it("S11-U24 the client has no publish call and no mirror poll (P22 boundary)", () => {
    const client = readFileSync(join(process.cwd(), "src", "research", "releaseCandidateClient.ts"), "utf8");
    const hook = readFileSync(join(process.cwd(), "src", "research", "useReleaseCandidate.ts"), "utf8");
    for (const source of [client, hook]) {
      expect(source).not.toMatch(/\/publish|\/mirror|setInterval/);
    }
    expect(client.match(/method: "(POST|PATCH)"/g)).toEqual(['method: "PATCH"', 'method: "POST"']);
  });
});

/* ------------------------------------------------ W7 · retained (WFO) lane */

/**
 * W7: the published compositions of the preview's real Delta WFO run as the
 * retained lane now composes them (packages/contracts fixtures, written by
 * the control-api service test from the run's real retained rows).
 */
const CONTRACT_FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
const retained = (name: string) => JSON.parse(readFileSync(join(CONTRACT_FIXTURES, name), "utf8")) as RcCompose;

describe("S11 Release Candidate — W7 retained (Delta WFO) lane", () => {
  it("S11-U25 shows the WFO run bound to its retained facts: no MISSING row, the uncertified claim DEGRADED with its reason", async () => {
    const body = retained("research-release-candidate.wfo-retained.valid.json");
    server({ compose: [{ status: 200, body }] });
    renderRoute(body.run_id);
    await ready();
    const rows = qa("[data-pack-row]");
    expect(rows.map((row) => [row.getAttribute("data-pack-row"), row.getAttribute("data-status")])).toEqual(body.pack.map((item) => [item.key, item.status]));
    expect(q("[data-pack-counts]")!.textContent).toBe("8 COMPLETE · 2 DEGRADED · 2 INPUT · 0 MISSING");
    expect(qa("[data-pack-row][data-status='MISSING']")).toHaveLength(0);
    const claim = q("[data-pack-row='METHODOLOGY_CLAIM']")!;
    expect(claim.getAttribute("data-status")).toBe("DEGRADED");
    expect(claim.querySelector("[data-reason-code='P21_METHODOLOGY_CERTIFICATE_NOT_ISSUED']")).not.toBeNull();
    expect(claim.textContent).toContain("no issued methodology certificate");
    expect(claim.textContent).toContain("walk_forward_oos");
    /* Every YAML line is the server's value; only the rc_ id waits for the local seal. */
    const lines = qa("[data-yaml-key]").map((line) => [line.getAttribute("data-yaml-key"), line.getAttribute("data-yaml-value")]);
    expect(lines).toEqual(body.yaml.map((field) => [field.key, field.value ?? ""]));
    expect(lines.filter(([, value]) => value === "").map(([key]) => key)).toEqual(["release_candidate_id"]);
    /* Digests print whole: the params lineage row carries the retained θ* digest. */
    const params = body.pack.find((item) => item.key === "SELECTED_PARAMS_LINEAGE")!;
    expect(q("[data-pack-row='SELECTED_PARAMS_LINEAGE'] [data-digest]")!.getAttribute("data-digest")).toBe(params.digest);
    expect(q("[data-seal-blocked]")!.getAttribute("data-seal-blocked")).toBe("P21_RESEARCHER_DECLARATIONS_REQUIRED");
    expect(q("[data-rc-state]")!.textContent).toBe("DRAFT");
    expect(screenText()).not.toMatch(/P21_REFERENCED_SOURCE_INTEGRITY_FAILED/);
  });

  it("S11-U26 the declared WFO composition offers the local seal; publish stays the P22 ghost", async () => {
    const body = retained("research-release-candidate.wfo-retained-declared.valid.json");
    server({ compose: [{ status: 200, body }] });
    renderRoute(body.run_id);
    await ready();
    expect(body.actions.may_seal).toBe(true);
    expect(q("[data-action='local-seal']")!.getAttribute("data-seal-enabled")).toBe("true");
    expect(q("[data-seal-blocked]")).toBeNull();
    expect(q("[data-publish-ghost]")!.getAttribute("data-blocked-reason")).toBe("P22_PUBLICATION_NOT_COMMISSIONED");
    expect(screenText()).not.toMatch(/\bPUBLISHED\b(?!_)/);
  });
});
