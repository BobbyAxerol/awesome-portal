/**
 * P09 consumer tests — Screens 00 and 12 on their product routes.
 *
 * The handoff names the required coverage; each item has a block below. Two of
 * them exist because of what they prevent rather than what they confirm:
 *
 *  - **`target_key` is not a path.** A descriptor value that became a URL would
 *    be an open redirect delivered by a product feature.
 *  - **A `304` reuses the last exact typed response.** Re-deriving a document,
 *    or rendering nothing, would both break the contract the ETag exists for.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EngineAtlasRoute, JourneyMapRoute, atlasQueryFromSearch } from "./foundationRoutes";
import { JourneyMap } from "./JourneyMap";
import type { AtlasDocument } from "./atlas";
import {
  FOUNDATION_PROBLEM_CODES,
  JourneyLinkConflict,
  SEQ_ALIAS_CONFLICT,
  type AtlasResponse,
  type JourneyResponse,
  __resetFoundationCaches,
  journeyQueryFromSearch,
  toFoundationRefusal,
} from "./foundationClient";
import journeySnapshot from "../../../../../packages/contracts/fixtures/research-foundation.journey-v2.valid.json";
import { KNOWN_SCREEN_KEYS, needsRunToOpen, resolveJourneyCardRoute, resolveScreenRoute } from "./screenRoutes";
import { PortalApiError } from "../lib/api";
import { researchState } from "./state";

afterEach(cleanup);

/* ---------------------------------------------------------------- fixtures */

const DESCRIPTOR: JourneyResponse["descriptor"] = {
  schema_version: "research.journey.v1",
  descriptor_id: "quantbt_journey",
  revision: 1,
  content_sha256: "sha256:journey01",
  mapping: [],
  phases: [
    {
      phase_id: "p1",
      ordinal: 1,
      title: "Access & command",
      description: "shipped shell — unchanged",
      cards: [
        {
          card_id: "c_command_center",
          title: "Command Center",
          description: "the shipped entry point",
          target_kind: "SHIPPED",
          target_key: "command_center",
          availability: "AVAILABLE", requires_run: false, target_fragment: null,
        },
        {
          card_id: "c_portal_map",
          title: "Portal Map",
          description: "what exists and what is planned",
          target_kind: "SHIPPED",
          target_key: "portal_map",
          availability: "AVAILABLE", requires_run: false, target_fragment: null,
        },
      ],
    },
    {
      phase_id: "p2",
      ordinal: 2,
      title: "Alpha intake",
      description: "shipped — quarantine is fail-closed",
      cards: [
        {
          card_id: "c_alpha_import",
          title: "Alpha Import — standardize av_",
          description: "single .py contract, 7 fail-closed gates, DRAFT to ACTIVE",
          target_kind: "RESEARCH_SCREEN",
          target_key: "engine_atlas",
          availability: "AVAILABLE", requires_run: false, target_fragment: null,
        },
        {
          card_id: "c_compare",
          title: "Compare",
          description: "not built in this release",
          target_kind: "RESEARCH_SCREEN",
          target_key: "compare",
          availability: "PLANNED", requires_run: false, target_fragment: null,
        },
        {
          card_id: "c_gate_r1",
          title: "Gate R1 · research evidence",
          description: "reads the published record",
          target_kind: "EXECUTION_HANDOFF",
          target_key: "gate_r1",
          availability: "DEPENDENCY_REQUIRED", requires_run: false, target_fragment: null,
        },
      ],
    },
  ],
};

function journey(overrides: Partial<JourneyResponse> = {}): JourneyResponse {
  return {
    schema_version: "research.journey-response.v1",
    descriptor: DESCRIPTOR,
    inspection: {
      cursor: {},
      canonical_query: "",
      pick_effect: "INSPECTION_ONLY",
      ambiguity_state: "NOT_APPLICABLE",
    },
    etag: 'W/"journey-1"',
    ...overrides,
  };
}

const ATLAS_DOC: AtlasDocument = {
  schema_version: "research-engine-atlas.v1",
  manifest_revision: 7,
  current_release: {
    release_id: "er_quantbt_1_1_1",
    package: "quantbt-engine",
    expected_version: "1.1.1",
    installed_version: "1.1.1",
    verified: true,
    native_package: "quantbt-native",
    native_expected_version: "0.4.2",
    native_installed_version: "0.4.2",
    detail: null,
  },
  historical_releases: [
    {
      release_id: "er_quantbt_1_0_8",
      package: "quantbt-engine",
      version: "1.0.8",
      status: "HISTORICAL_IDENTITY_RETAINED",
    },
  ],
  routes: [
    {
      route_id: "signal_notional",
      family: "signal",
      execution_contract: "close_target_v2",
      backend: "python",
      report_levels: ["full"],
      default_for_new_runs: true,
      axes: {
        engine: "ENGINE_SUPPORTED",
        integration: "ADAPTER_AVAILABLE",
        evidence: "EVIDENCE_MAPPED",
        admission: "P04_BASELINE_ONLY",
      },
      reason: "Certified in the installed release.",
      required_input_class: "ohlcv",
    },
  ],
  modes: [
    {
      mode_id: "per_fold_causal",
      display_name: "Per-fold causal",
      valid_schedules: ["per_fold_causal"],
      default_schedule: "per_fold_causal",
      objective_summary: "one selection per fold",
      suspect: "Suspect when a fold's OOS is short.",
      artifact_fields: ["selection_resolution"],
      when_to_use: "default for walk-forward",
      rules: ["reads outer OOS exactly once"],
    },
  ],
  claims: [
    {
      contract_id: "close_target_v2",
      engine_certification: "CERTIFIED",
      numeric_guarantee: "float64 parity",
      never_claims: "never claims intrabar fill ordering",
    },
  ],
  evidence_contract: {
    schema_id: "research-run-evidence.v1",
    writer_state: "P05_OWNED_NOT_ACTIVE",
    required_fields: ["engine_release_id", "route_id"],
  },
} as AtlasDocument;

function atlas(overrides: Partial<AtlasResponse> = {}): AtlasResponse {
  return {
    schema_version: "research.engine-atlas-response.v1",
    selected_release_id: "er_quantbt_1_1_1",
    selected_release_kind: "CURRENT",
    atlas: ATLAS_DOC,
    etag: 'W/"atlas-1"',
    historical_identity: null,
    ...overrides,
  } as AtlasResponse;
}

let sent: { url: string; headers: Record<string, string> }[] = [];

function stub(responder: (url: string, attempt: number) => [number, unknown, string?]) {
  const attempts = new Map<string, number>();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const attempt = (attempts.get(url) ?? 0) + 1;
      attempts.set(url, attempt);
      sent.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
      const [status, payload, etag] = responder(url, attempt);
      return {
        ok: status >= 200 && status < 300,
        status,
        statusText: "",
        headers: { get: (name: string) => (name.toLowerCase() === "etag" ? (etag ?? null) : null) },
        json: async () => payload,
      } as unknown as Response;
    }),
  );
}

function renderAt(path: string, element: React.ReactElement) {
  return render(<MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>);
}

beforeEach(() => {
  sent = [];
  __resetFoundationCaches();
});
afterEach(() => vi.unstubAllGlobals());

/* -------------------------------------------------------------------------
 * Screen 00
 * ---------------------------------------------------------------------- */

describe("P09-T01 — the journey map renders the descriptor the server pinned", () => {
  it("draws every phase and card from the response", async () => {
    stub(() => [200, journey(), 'W/"journey-1"']);
    renderAt("/research/quantbt/journey", <JourneyMapRoute />);

    await waitFor(() => expect(document.querySelectorAll("[data-phase]")).toHaveLength(2));
    expect(document.querySelectorAll("[data-card]")).toHaveLength(5);
    expect(screen.getByText("QuantBT Backtest — journey map")).toBeTruthy();
    expect(document.querySelector("[data-descriptor-digest]")?.textContent).toContain(
      "sha256:journey01",
    );
  });

  it("puts no arrow after the last card of a phase", async () => {
    stub(() => [200, journey(), 'W/"journey-1"']);
    renderAt("/research/quantbt/journey", <JourneyMapRoute />);
    await waitFor(() => expect(document.querySelectorAll("[data-phase]")).toHaveLength(2));

    for (const phase of Array.from(document.querySelectorAll("[data-phase]"))) {
      const cards = phase.querySelectorAll("[data-card]").length;
      expect(phase.querySelectorAll("[data-arrow]")).toHaveLength(cards - 1);
    }
  });

  it("nests no second shell inside the product route", async () => {
    stub(() => [200, journey(), 'W/"journey-1"']);
    renderAt("/research/quantbt/journey", <JourneyMapRoute />);
    await waitFor(() => expect(document.querySelector("[data-screen='journey-map']")).toBeTruthy());

    // The screen supplies no navigation chrome and no second shell: the
    // Portal's own `PortalShell` is the only one on the page.
    expect(document.querySelectorAll("nav")).toHaveLength(0);
    expect(document.querySelectorAll(".portal-shell")).toHaveLength(0);
    expect(document.querySelectorAll("aside")).toHaveLength(0);
    // Exactly one page title, so the route does not read as two screens.
    expect(document.querySelectorAll("h1")).toHaveLength(1);
  });
});

describe("P09-T02 — target_key is presentation data, never a path", () => {
  it("resolves only through the owned map", () => {
    expect(resolveScreenRoute("engine_atlas")).toBe("/research/quantbt/atlas");
    expect(resolveScreenRoute("journey_map")).toBe("/research/quantbt/journey");
    expect(resolveScreenRoute("not_a_screen")).toBeNull();
    // `FD-P09-02` resolved: Screen 14 and Screen 02 are served under QuantBT,
    // not under the still-COMMISSIONED ALPHA_POOL feature.
    expect(resolveScreenRoute("alpha_import")).toBe("/research/quantbt/alpha-import");
    expect(resolveScreenRoute("new_run")).toBe("/research/quantbt/runs/new");
    // Still absent: a preflight is declared inside Screen 02, so there is no
    // separate screen to route to.
    expect(resolveScreenRoute("preflight")).toBeNull();
  });

  it("refuses a key that is already trying to be a URL", () => {
    for (const hostile of [
      "/etc/passwd",
      "//evil.example.com",
      "https://evil.example.com",
      "javascript:alert(1)",
      "../../admin",
    ]) {
      expect(resolveScreenRoute(hostile), hostile).toBeNull();
    }
  });

  it("every known key is a same-origin absolute path", () => {
    for (const key of KNOWN_SCREEN_KEYS) {
      const route = resolveScreenRoute(key);
      expect(route, key).toMatch(/^\/(?!\/)/);
    }
  });

  it("draws an unreachable card instead of hiding it", async () => {
    stub(() => [200, journey(), 'W/"journey-1"']);
    renderAt("/research/quantbt/journey", <JourneyMapRoute />);
    await waitFor(() => expect(document.querySelectorAll("[data-card]")).toHaveLength(5));

    // `compare` is PLANNED and has no route; `gate_r1` needs a dependency.
    const planned = document.querySelector('[data-card="c_compare"]') as HTMLElement;
    expect(planned.tagName).not.toBe("A");
    expect(planned.getAttribute("data-card-unreachable")).toBe("SOON");
    expect(planned.getAttribute("aria-disabled")).toBe("true");

    const blocked = document.querySelector('[data-card="c_gate_r1"]') as HTMLElement;
    expect(blocked.getAttribute("data-card-unreachable")).toBe("BLOCKED");

    // A reachable card is a real link to the resolved path.
    const open = document.querySelector('[data-card="c_alpha_import"]') as HTMLElement;
    expect(open.tagName).toBe("A");
    expect(open.getAttribute("href")).toBe("/research/quantbt/atlas");
  });
});

describe("P09-T02b — an unrouted screen says so rather than blaming the roadmap", () => {
  it("distinguishes NOT ROUTED from SOON and BLOCKED", async () => {
    stub(() => [
      200,
      journey({
        descriptor: {
          ...DESCRIPTOR,
          phases: [
            {
              phase_id: "p3",
              ordinal: 3,
              title: "Evidence",
              description: "",
              cards: [
                {
                  card_id: "c_preflight",
                  title: "Data Preflight",
                  description: "immutable manifest metadata",
                  target_kind: "RESEARCH_SCREEN",
                  // The server says available; this build serves no route.
                  target_key: "preflight",
                  availability: "AVAILABLE", requires_run: false, target_fragment: null,
                },
              ],
            },
          ],
        },
      }),
      'W/"journey-3"',
    ]);
    renderAt("/research/quantbt/journey", <JourneyMapRoute />);
    await waitFor(() => expect(document.querySelector('[data-card="c_preflight"]')).toBeTruthy());

    const card = document.querySelector('[data-card="c_preflight"]') as HTMLElement;
    expect(card.getAttribute("data-card-availability")).toBe("AVAILABLE");
    expect(card.getAttribute("data-card-unreachable")).toBe("NOT ROUTED");
    expect(card.tagName).not.toBe("A");
  });
});

describe("E12 — the map opens every screen this build serves (audit 00-3, D2)", () => {
  /** A one-card descriptor for the key under test. */
  const oneCard = (targetKey: string, requiresRun: boolean) =>
    journey({
      descriptor: {
        ...DESCRIPTOR,
        phases: [
          {
            phase_id: "p_e12",
            ordinal: 1,
            title: "Evidence",
            description: "",
            cards: [
              {
                card_id: "c_e12",
                title: "The screen",
                description: "",
                target_kind: "RESEARCH_SCREEN",
                target_key: targetKey,
                availability: "AVAILABLE",
                requires_run: requiresRun,
                target_fragment: null,
              },
            ],
          },
        ],
      },
    });

  it("resolves the five screens the descriptor used to call PLANNED", () => {
    /* Three are per-run; the run id is the only thing the map holds. */
    expect(resolveJourneyCardRoute("execute_replay", "rrun_1")).toBe("/research/quantbt/runs/rrun_1/execute");
    expect(resolveJourneyCardRoute("release_candidate", "rrun_1")).toBe("/research/quantbt/runs/rrun_1/release-candidate");
    expect(resolveJourneyCardRoute("run_report", "rrun_1")).toBe("/research/quantbt/runs/rrun_1/report");
    /* Two are per-Alpha: a run id alone cannot open them, an Alpha can. */
    expect(resolveJourneyCardRoute("attempt_lineage", "rrun_1")).toBeNull();
    expect(resolveJourneyCardRoute("attempt_lineage", "rrun_1", "alpha_delta")).toBe(
      "/research/quantbt/alphas/alpha_delta/lineage",
    );
    expect(resolveJourneyCardRoute("compare_runs", null)).toBe("/research/quantbt/compare");
    expect(resolveJourneyCardRoute("compare_runs", "rrun_1", "alpha_delta")).toBe(
      "/research/quantbt/alphas/alpha_delta/compare",
    );
  });

  it("still refuses a hostile key on the run-scoped and alpha-scoped paths", () => {
    expect(resolveJourneyCardRoute("execute_replay", "../../admin")).toBeNull();
    expect(resolveJourneyCardRoute("attempt_lineage", "rrun_1", "../../admin")).toBeNull();
    expect(resolveJourneyCardRoute("//evil.example.com", "rrun_1")).toBeNull();
  });

  it("D2: a card that needs a run links to the Run Library carrying its target", async () => {
    stub(() => [200, oneCard("execute_replay", true), 'W/"journey-e12"']);
    renderAt("/research/quantbt/journey", <JourneyMapRoute />);
    await waitFor(() => expect(document.querySelector('[data-card="c_e12"]')).toBeTruthy());

    const card = document.querySelector('[data-card="c_e12"]') as HTMLElement;
    expect(card.tagName).toBe("A");
    expect(card.getAttribute("href")).toBe("/research/quantbt/runs?to=execute_replay");
    expect(card.getAttribute("data-card-picks-run")).toBe("execute_replay");
    /* The dead end is gone: no card says SELECT RUN with nowhere to select. */
    expect(card.getAttribute("data-card-unreachable")).toBeNull();
    expect(card.textContent).toContain("pick a run");
  });

  it("an unserved key still greys out rather than becoming a run picker", async () => {
    /* `alpha_version_legacy` became a run picker (its screen is mounted under an
       Alpha and a version, both of which a run's binding names), so the dead-end
       case now needs a key this build genuinely does not serve. */
    stub(() => [200, oneCard("no_such_screen", false), 'W/"journey-e12b"']);
    renderAt("/research/quantbt/journey", <JourneyMapRoute />);
    await waitFor(() => expect(document.querySelector('[data-card="c_e12"]')).toBeTruthy());

    const card = document.querySelector('[data-card="c_e12"]') as HTMLElement;
    expect(card.getAttribute("data-card-unreachable")).toBe("NOT ROUTED");
    expect(card.tagName).not.toBe("A");
  });

  it("the shipped alpha-version card is a run picker, not a dead end", async () => {
    stub(() => [200, oneCard("alpha_version_legacy", false), 'W/"journey-e12c"']);
    renderAt("/research/quantbt/journey", <JourneyMapRoute />);
    await waitFor(() => expect(document.querySelector('[data-card="c_e12"]')).toBeTruthy());

    const card = document.querySelector('[data-card="c_e12"]') as HTMLElement;
    expect(card.getAttribute("data-card-unreachable")).toBeNull();
    expect(card.textContent).toContain("pick a run");
    /* Resolved against a row: the Alpha and the version both come from its binding. */
    expect(resolveJourneyCardRoute("alpha_version_legacy", "rrun_1", "alpha_a", "av_a_1_0_0")).toBe(
      "/research/quantbt/alphas/alpha_a/av_a_1_0_0",
    );
    /* A row that names no version still cannot address it, and says so. */
    expect(resolveJourneyCardRoute("alpha_version_legacy", "rrun_1", "alpha_a", null)).toBeNull();
  });

  it("the published descriptor declares no PLANNED card", () => {
    const cards = (journeySnapshot as JourneyResponse).descriptor.phases.flatMap((phase) => phase.cards);
    expect(cards.filter((card) => card.availability === "PLANNED")).toHaveLength(0);
    expect((journeySnapshot as JourneyResponse).descriptor.revision).toBe(3);
    const unreachable = cards.filter(
      (card) =>
        card.availability === "AVAILABLE" &&
        resolveJourneyCardRoute(card.target_key, "rrun_1") === null &&
        !needsRunToOpen(card.target_key),
    );
    /* Every AVAILABLE card now either resolves or is a run picker: the shipped
       alpha-version screen joined the pickers, so nothing is left stranded. */
    expect(unreachable.map((card) => card.target_key)).toEqual([]);
  });
});

describe("P09-T03 — a journey deep link inspects and never dispatches", () => {
  it("forwards only declared P02 keys", () => {
    const query = journeyQueryFromSearch(
      "?run_id=r1&pick=p9&trade=t3&workspace_id=w1&promote=1&admin=true",
    );
    expect(query).toEqual({ workspace_id: "w1", run_id: "r1", pick: "p9", trade: "t3" });
    expect(Object.keys(query)).not.toContain("promote");
    expect(Object.keys(query)).not.toContain("admin");
  });

  it("accepts seq and event_seq together only when they agree", () => {
    // p02-cursor.v2: agreeing aliases fold to the one canonical `seq`, as the server does.
    expect(journeyQueryFromSearch("?seq=12&event_seq=12")).toEqual({ seq: "12" });
    expect(() => journeyQueryFromSearch("?seq=12&event_seq=13")).toThrow(JourneyLinkConflict);
  });

  it("reports the conflict before spending a request", async () => {
    stub(() => [200, journey(), 'W/"journey-1"']);
    renderAt("/research/quantbt/journey?seq=12&event_seq=13", <JourneyMapRoute />);
    await waitFor(() =>
      expect(screen.getAllByText(SEQ_ALIAS_CONFLICT).length).toBeGreaterThan(0),
    );
    expect(sent).toHaveLength(0);
  });

  it("prints the pick effect rather than leaving the limit to be inferred", async () => {
    stub(() => [
      200,
      journey({
        inspection: {
          cursor: { pick: "p9", study: "s2" },
          canonical_query: "run_id=r1&study=s2&pick=p9",
          pick_effect: "INSPECTION_ONLY",
          ambiguity_state: "RESOLVED",
        },
      }),
      'W/"journey-2"',
    ]);
    renderAt("/research/quantbt/journey?run_id=r1&pick=p9", <JourneyMapRoute />);

    await waitFor(() => expect(document.querySelector("[data-pick-effect]")).toBeTruthy());
    expect(document.querySelector("[data-pick-effect]")?.textContent).toBe("INSPECTION_ONLY");
    expect(document.querySelector("[data-ambiguity]")?.textContent).toBe("RESOLVED");
    expect(document.querySelector('[data-cursor-key="pick"]')?.textContent).toContain("p9");

    // Inspection only: the screen offers nothing that could promote or select.
    expect(document.querySelectorAll("button")).toHaveLength(0);
  });

  it("says a link carries no cursor instead of printing an empty strip", async () => {
    stub(() => [200, journey(), 'W/"journey-1"']);
    renderAt("/research/quantbt/journey", <JourneyMapRoute />);
    await waitFor(() => expect(document.querySelector("[data-no-cursor]")).toBeTruthy());
    expect(document.querySelector("[data-canonical-query]")?.textContent).toBe("(no query)");
  });
});

/* -------------------------------------------------------------------------
 * Screen 12
 * ---------------------------------------------------------------------- */

describe("P09-T04 — the Atlas renders from the manifest response", () => {
  it("builds the three tabs and the route rows from the document", async () => {
    stub(() => [200, atlas(), 'W/"atlas-1"']);
    renderAt("/research/quantbt/atlas", <EngineAtlasRoute />);

    await waitFor(() => expect(document.querySelector("[data-screen='engine-atlas']")).toBeTruthy());
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(document.querySelector("[data-selected-release]")?.getAttribute("data-selected-kind")).toBe(
      "CURRENT",
    );
  });

  it("states that a historical selection cannot run", async () => {
    stub(() => [
      200,
      atlas({ selected_release_id: "er_quantbt_1_0_8", selected_release_kind: "HISTORICAL" }),
      'W/"atlas-2"',
    ]);
    renderAt("/research/quantbt/atlas?release_id=er_quantbt_1_0_8", <EngineAtlasRoute />);

    await waitFor(() => expect(document.querySelector("[data-historical-note]")).toBeTruthy());
    expect(document.querySelector("[data-historical-note]")?.textContent).toBe(
      "Historical identity retained — this release is not installed and cannot run.",
    );
  });

  it("forwards only the four selection keys the contract accepts", () => {
    expect(atlasQueryFromSearch("?release_id=r&route=x&mode=m&workspace_id=w&run=1&admin=1")).toEqual(
      { release_id: "r", route: "x", mode: "m", workspace_id: "w" },
    );
  });

  it("offers no run or submit affordance", async () => {
    stub(() => [200, atlas(), 'W/"atlas-1"']);
    renderAt("/research/quantbt/atlas", <EngineAtlasRoute />);
    await waitFor(() => expect(document.querySelector("[data-screen='engine-atlas']")).toBeTruthy());

    // The Atlas is read-only: its buttons are tabs, schedule chips and route
    // rows, which move the reader within the page and change nothing.
    for (const button of document.querySelectorAll("button")) {
      const kind = button.getAttribute("role") === "tab" || button.hasAttribute("data-schedule") || button.hasAttribute("data-route-link");
      expect(kind, button.outerHTML).toBe(true);
    }
    expect(document.querySelectorAll('[role="tab"]')).toHaveLength(3);
    expect(document.querySelectorAll("[data-action]")).toHaveLength(0);
  });
});

describe("P09-T05 — the Atlas needs no narrowing layer", () => {
  it("renders the response document directly, with claims fully typed", async () => {
    // `CG-P09-01` closed: the foundation contract now types `claims` and
    // `evidence_contract`, and `atlas.ts` reads that same contract. The checked
    // narrowing that stood between the two generated descriptions is gone, and
    // this test exists so it cannot creep back as a silent cast.
    stub(() => [200, atlas(), 'W/"atlas-1"']);
    renderAt("/research/quantbt/atlas", <EngineAtlasRoute />);
    await waitFor(() => expect(document.querySelector("[data-screen='engine-atlas']")).toBeTruthy());

    const source = readFileSync(join(process.cwd(), "src", "research", "foundationRoutes.tsx"), "utf8");
    expect(source).not.toMatch(/narrowAtlas|as unknown as/);
  });

  it("types the Atlas from the contract the browser reads", () => {
    const source = readFileSync(join(process.cwd(), "src", "research", "atlas.ts"), "utf8");
    expect(source).toContain('@portal/contracts-research-foundation');
    // Two generated descriptions of one document is one too many.
    expect(source).not.toMatch(/from "@portal\/contracts"/);
  });
});

/* -------------------------------------------------------------------------
 * Transport contract
 * ---------------------------------------------------------------------- */

describe("P09-T06 — ETag and 304 reuse the last exact typed response", () => {
  it("sends If-None-Match on the second read and keeps the held document", async () => {
    stub((_url, attempt) =>
      attempt === 1 ? [200, journey(), 'W/"journey-1"'] : [304, null, 'W/"journey-1"'],
    );

    const { unmount } = renderAt("/research/quantbt/journey", <JourneyMapRoute />);
    await waitFor(() => expect(document.querySelectorAll("[data-phase]")).toHaveLength(2));
    unmount();

    renderAt("/research/quantbt/journey", <JourneyMapRoute />);
    await waitFor(() => expect(document.querySelectorAll("[data-phase]")).toHaveLength(2));

    expect(sent).toHaveLength(2);
    expect(sent[0].headers["If-None-Match"]).toBeUndefined();
    expect(sent[1].headers["If-None-Match"]).toBe('W/"journey-1"');
    // The same typed response, not a re-derived one.
    expect(document.querySelector("[data-descriptor-digest]")?.textContent).toContain(
      "sha256:journey01",
    );
  });

  it("keys the cache by the exact query, since two selections are two representations", async () => {
    stub((url) => [200, atlas({ selected_release_id: url.includes("release_id") ? "er_old" : "er_new" }), `W/"${url}"`]);

    renderAt("/research/quantbt/atlas", <EngineAtlasRoute />);
    await waitFor(() => expect(document.querySelector("[data-selected-release]")).toBeTruthy());
    cleanup();

    renderAt("/research/quantbt/atlas?release_id=er_old", <EngineAtlasRoute />);
    await waitFor(() =>
      expect(document.querySelector("[data-selected-release]")?.getAttribute("data-selected-release")).toBe("er_old"),
    );
    // Two distinct URLs, neither answered from the other's cache.
    expect(sent.map((r) => r.url)).toEqual([
      "/api/v1/research/quantbt/atlas",
      "/api/v1/research/quantbt/atlas?release_id=er_old",
    ]);
  });

  it("re-reads unconditionally when a 304 arrives with no held copy", async () => {
    stub((_url, attempt) =>
      attempt === 1 ? [304, null, 'W/"x"'] : [200, journey(), 'W/"journey-1"'],
    );
    renderAt("/research/quantbt/journey", <JourneyMapRoute />);
    await waitFor(() => expect(document.querySelectorAll("[data-phase]")).toHaveLength(2));
    expect(sent).toHaveLength(2);
  });
});

describe("P09-T07 — typed refusals keep their generated meaning", () => {
  it("maps every code the contract declares", () => {
    expect(FOUNDATION_PROBLEM_CODES).toHaveLength(11);
    for (const code of FOUNDATION_PROBLEM_CODES) {
      const refusal = toFoundationRefusal(new PortalApiError("server sentence", 400, code, "req_1"));
      expect(refusal.code).toBe(code);
      /* VD-P23-01 (X3 2026-09-26): fixed screen sentence; the server's text is detail only. */
      expect(refusal.message).not.toBe("server sentence");
      expect(refusal.detail).toBe("server sentence");
      expect(refusal.state).not.toBe("available");
    }
  });

  it.each([
    [400, "RESEARCH_FOUNDATION_INVALID", "terminal"],
    [404, "RESEARCH_FOUNDATION_RELEASE_NOT_FOUND", "empty"],
    [502, "RESEARCH_FOUNDATION_UNAVAILABLE", "unavailable"],
    [503, "RESEARCH_FOUNDATION_REJECTED", "failed-retryable"],
  ])("renders %i %s inside the composition", async (status, code, expected) => {
    stub(() => [status, { error: { code, message: "The server said so." }, request_id: "req_2" }]);
    renderAt("/research/quantbt/atlas", <EngineAtlasRoute />);

    await waitFor(() =>
      expect(document.querySelector(`[data-research-state='${expected}']`)).toBeTruthy(),
    );
    // The screen keeps its composition: heading, tabs and the panel frame.
    expect(screen.getByRole("heading", { name: "Engine Atlas" })).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    /* VD-P23-01: the server's sentence never reaches the screen. */
    expect(screen.queryAllByText("The server said so.")).toHaveLength(0);
  });

  it("does not fall back to a local manifest when the Atlas is unavailable", async () => {
    stub(() => [
      502,
      { error: { code: "RESEARCH_FOUNDATION_UNAVAILABLE", message: "No answer." }, request_id: "r" },
    ]);
    renderAt("/research/quantbt/atlas", <EngineAtlasRoute />);
    await waitFor(() =>
      expect(document.querySelector("[data-research-state='unavailable']")).toBeTruthy(),
    );
    // No route row is invented to fill the table.
    expect(document.querySelectorAll("[data-route]")).toHaveLength(0);
  });
});

describe("P09-T08 — the surface builds no DTO and makes no outside request", () => {
  const FILES = [
    "foundationClient.ts",
    "foundationRoutes.tsx",
    "JourneyMap.tsx",
    "screenRoutes.ts",
  ];

  function codeOf(name: string): string {
    return readFileSync(join(process.cwd(), "src", "research", name), "utf8")
      .split("\n")
      .filter((line) => {
        const t = line.trimStart();
        return !t.startsWith("*") && !t.startsWith("//") && !t.startsWith("/*");
      })
      .join("\n");
  }

  it("declares no interface for a P09 payload", () => {
    for (const name of FILES) {
      const code = codeOf(name);
      // Response shapes come from the generated contract; a local interface
      // named after one would be a second, drifting definition.
      expect(code, name).not.toMatch(
        /interface\s+(Journey(Response|Descriptor|Phase|Card)|Atlas(Response|Route|Mode|Release)|InspectionCursor)\b/,
      );
    }
  });

  it("requests only the two published same-origin paths", () => {
    const code = codeOf("foundationClient.ts");
    const paths = [...code.matchAll(/["'`](\/api\/[^"'`]*)["'`]/g)].map((m) => m[1]);
    expect([...new Set(paths)].sort()).toEqual([
      "/api/v1/research/journey",
      "/api/v1/research/quantbt/atlas",
    ]);
    // No scheme and no protocol-relative host anywhere on the surface.
    for (const name of FILES) {
      expect(codeOf(name), name).not.toMatch(/["'`](https?:)?\/\//);
    }
  });

  it("makes no request outside the client module", () => {
    for (const name of FILES.filter((f) => f !== "foundationClient.ts")) {
      expect(codeOf(name), name).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|EventSource|WebSocket/);
    }
  });

  it("imports no Control API, engine, loader or Execution adapter", () => {
    for (const name of FILES) {
      expect(codeOf(name), name).not.toMatch(
        /from\s+["'][^"']*(control-api|quantbt-engine|execution\/|postgres|historical-loader)/,
      );
    }
  });
});

describe("P09-T09 — the composition survives a document-less render", () => {
  it("keeps the journey heading, legend and panel frames", () => {
    render(
      <MemoryRouter>
        <JourneyMap
          descriptor={null}
          inspection={null}
          state={researchState({ kind: "transport", status: 503, retryable: false })}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("QuantBT Backtest — journey map")).toBeTruthy();
    expect(document.querySelectorAll("[data-legend-tag]")).toHaveLength(3);
    for (const name of ["journey", "deep link inspection"]) {
      const panel = document.querySelector(`[data-research-panel="${name}"]`) as HTMLElement;
      expect(panel, name).toBeTruthy();
      expect(panel.getAttribute("data-state")).toBe("unavailable");
    }
    expect(document.querySelectorAll("[data-phase]")).toHaveLength(0);
  });

  it("shows the three card kinds in the legend even with no data", () => {
    render(
      <MemoryRouter>
        <JourneyMap descriptor={null} inspection={null} state={researchState({ kind: "ok", rowCount: 0 })} />
      </MemoryRouter>,
    );
    const kinds = Array.from(document.querySelectorAll("[data-legend-tag]")).map((n) =>
      n.getAttribute("data-legend-tag"),
    );
    expect(kinds).toEqual(["SHIPPED", "RESEARCH_SCREEN", "EXECUTION_HANDOFF"]);
  });
});
