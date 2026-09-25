/**
 * P03–P06 composition tests.
 *
 * The claim under test throughout is the one the recovery brief exists for: a
 * panel keeps its composition in every state. A screen that collapses into a
 * centred message when the server says "denied" has lost every other fact it
 * was carrying, and that is the Execution failure being inherited against.
 *
 * Manifest-drive is asserted directly: adding a fifteenth route to the document
 * must grow the table without touching the component, which is spec 12's T06
 * and its reviewer-checklist item 1.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ArtifactPanel } from "./ArtifactPanel";
import { EngineAtlas, tabFromHash, type AtlasTab } from "./EngineAtlas";
import { QueuePanel } from "./QueuePanel";
import { ResearchPanel, ResearchValue } from "./ResearchPanel";
import type { AtlasDocument, AtlasRoute } from "./atlas";
import { RESEARCH_ARTIFACT_STATES, type ArtifactFacts } from "./artifacts";
import { RESEARCH_JOB_STATES, type LogicalRun } from "./scheduler";
import { researchState, type ResearchOutcome, type ResearchState } from "./state";

afterEach(cleanup);

/* ---------------------------------------------------------------- fixtures */

function atlasRoute(overrides: Partial<AtlasRoute> = {}): AtlasRoute {
  return {
    route_id: "signal_notional",
    family: "signal",
    backend: "python",
    reason: "Baseline admitted.",
    axes: {
      engine: "ENGINE_SUPPORTED",
      integration: "ADAPTER_AVAILABLE",
      evidence: "EVIDENCE_MAPPED",
      admission: "P04_BASELINE_ONLY",
    },
    default_for_new_runs: true,
    execution_contract: "close_target_v2",
    report_levels: ["R0", "R1"],
    required_input_class: "signal",
    ...overrides,
  };
}

function atlasDoc(overrides: Partial<AtlasDocument> = {}): AtlasDocument {
  return {
    schema_version: "research-engine-atlas.v1",
    manifest_revision: 7,
    current_release: {
      release_id: "quantbt-1.1.1",
      package: "quantbt-engine",
      expected_version: "1.1.1",
      installed_version: "1.1.1",
      verified: true,
      native_package: "quantbt-native",
      native_expected_version: "0.4.2",
      native_installed_version: "0.4.2",
      detail: null,
      trial_ceiling: 4000,
      optimizer_defaults: {
        schema_version: "research.optimizer-defaults.v1",
        groups: [
          { group_id: "study", fields: [{ field_id: "n_trials", default_value: 300, value_source: "RELEASE_DEFAULT", override_state: "LOCKED", detail: "Fixture release default." }] },
          { group_id: "sampler", fields: [{ field_id: "name", default_value: "tpe", value_source: "RELEASE_DEFAULT", override_state: "LOCKED", detail: "Fixture release default." }] },
          { group_id: "objective", fields: [{ field_id: "optuna_trials", default_value: 400, value_source: "RELEASE_DEFAULT", override_state: "LOCKED", detail: "Fixture release default." }] },
          { group_id: "candidate_selection", fields: [{ field_id: "candidate_selection_metric", default_value: "robust_decay", value_source: "RELEASE_DEFAULT", override_state: "LOCKED", detail: "Fixture release default." }] },
        ],
      },
      submission_constraints: {
        profile_id: "p10.fixed-qualification.v1", optimization_overrides: "FORBIDDEN",
        accepted_trial_count: 1, early_stopping: "MUST_BE_NULL", random_seed: "MUST_BE_NULL",
        reason: "Fixture fixed-qualification profile.",
      },
    },
    historical_releases: [
      {
        release_id: "quantbt-1.0.8",
        package: "quantbt-engine",
        version: "1.0.8",
        status: "HISTORICAL_IDENTITY_RETAINED",
      },
    ],
    routes: [
      atlasRoute(),
      atlasRoute({
        route_id: "arbitrage_triangular",
        family: "arbitrage",
        reason: "Schema-only: no adapter in Portal.",
        default_for_new_runs: false,
        axes: {
          engine: "ENGINE_SUPPORTED",
          integration: "INTEGRATION_GAP",
          evidence: "EVIDENCE_GAP",
          admission: "NOT_ADMITTED",
        },
      }),
    ],
    modes: [
      {
        mode_id: "m1",
        display_name: "selected best",
        objective_summary: "Maximise the in-sample objective.",
        when_to_use: "Use when the surface is smooth.",
        suspect: "pretty S̄_OOS with fat σ_d; negative d̄ everywhere smells like leakage",
        rules: ["The claim comes from mode × schedule."],
        artifact_fields: ["selection_trace"],
        default_schedule: "global",
        valid_schedules: ["global", "per_fold_decay"],
      },
    ],
    claims: [
      {
        contract_id: "close_target_v2",
        engine_certification: "L2",
        numeric_guarantee: "Deterministic bar-close accounting.",
        never_claims: "never claims intrabar SL/TP fills",
      },
    ],
    evidence_contract: {
      schema_id: "research-run-evidence.v1",
      writer_state: "P05_OWNED_NOT_ACTIVE",
      required_fields: ["engine_release_id", "route_id"],
    },
    ...overrides,
  };
}

function artifact(overrides: Partial<ArtifactFacts> = {}): ArtifactFacts {
  return { state: "SEALED", registered: true, serverAdmittedExport: true, ...overrides };
}

function logicalRun(overrides: Partial<LogicalRun> = {}): LogicalRun {
  return {
    runId: "run_abc",
    state: "RUNNING",
    attempts: [{ ordinal: 1, state: "RUNNING", message: null }],
    ...overrides,
  };
}

const OUTCOMES: Record<string, ResearchOutcome> = {
  loading: { kind: "in-flight", hasAcceptedResponse: false },
  stale: { kind: "in-flight", hasAcceptedResponse: true },
  empty: { kind: "ok", rowCount: 0 },
  partial: { kind: "ok", rowCount: 3, declaredUnavailable: ["trials"] },
  denied: { kind: "refusal", code: "RESEARCH_WORKSPACE_FORBIDDEN" },
  unavailable: { kind: "transport", status: 503, retryable: false },
  terminal: { kind: "terminal", reason: "The run failed." },
};

/* ----------------------------------------------------- P03 state boundary */

describe("P03 — every state keeps the panel", () => {
  it("renders the frame and title in all seven states", () => {
    for (const [name, outcome] of Object.entries(OUTCOMES)) {
      cleanup();
      render(
        <ResearchPanel title="alpha versions" state={researchState(outcome)}>
          <p>real content</p>
        </ResearchPanel>,
      );
      // The panel is a named region in every state, so it stays reachable.
      expect(screen.getByRole("region", { name: "alpha versions" }), name).toBeTruthy();
      expect(document.querySelector(`[data-state='${researchState(outcome).state}']`)).toBeTruthy();
    }
  });

  it("keeps content visible for stale and partial, and withholds it for denied", () => {
    render(
      <ResearchPanel title="p" state={researchState(OUTCOMES.stale)}>
        <p>real content</p>
      </ResearchPanel>,
    );
    expect(screen.getByText("real content")).toBeTruthy();
    cleanup();

    render(
      <ResearchPanel title="p" state={researchState(OUTCOMES.partial)}>
        <p>real content</p>
      </ResearchPanel>,
    );
    expect(screen.getByText("real content")).toBeTruthy();
    cleanup();

    render(
      <ResearchPanel title="p" state={researchState(OUTCOMES.denied)}>
        <p>real content</p>
      </ResearchPanel>,
    );
    expect(screen.queryByText("real content")).toBeNull();
  });

  it("names the state and its reason without leaking an identifier", () => {
    render(<ResearchPanel title="p" state={researchState(OUTCOMES.denied)} />);
    const notice = document.querySelector("[data-research-state='denied']");
    expect(notice).toBeTruthy();
    // RF01-F1: neutral — neither confirms the object exists nor says whose it is.
    expect(notice?.textContent).toMatch(/don't have access to this in your current workspace, or it doesn't exist/i);
    expect(notice?.textContent).not.toMatch(/not a member|belongs to/i);
    expect(notice?.textContent).not.toMatch(/ws_|workspace_id|run_/);
  });

  it("RF01-F2: offers recovery where reading again can help, and nowhere else", () => {
    const retry = <button type="button">read again</button>;
    const cases: Array<[ResearchState["state"], boolean]> = [
      ["unavailable", true],
      ["failed-retryable", true],
      ["stale", true],
      ["denied", false],
      ["empty", false],
      ["terminal", false],
      ["available", false],
      ["loading", false],
    ];
    for (const [state, shown] of cases) {
      const { unmount } = render(
        <ResearchPanel
          title="p"
          state={{ state, reason: "r", mayRetry: true, retainsContent: true }}
          recovery={retry}
          actions={<button type="button">export</button>}
        />,
      );
      expect(!!screen.queryByRole("button", { name: "read again" })).toBe(shown);
      // The content action keeps FE-P03-01: never offered on unavailable.
      if (state === "unavailable" || state === "failed-retryable") {
        expect(screen.queryByRole("button", { name: "export" })).toBeNull();
      }
      unmount();
    }
  });

  it("RF01-F4: keeps diagnostics in a details disclosure, not in the sentence", () => {
    render(
      <ResearchPanel
        title="p"
        state={{ state: "unavailable", reason: "The Research service did not answer. Try again.", detail: "RESEARCH_SPLIT_UNAVAILABLE · upstream 502", mayRetry: true, retainsContent: false }}
      />,
    );
    const details = document.querySelector("[data-research-detail]");
    expect(details?.tagName).toBe("DETAILS");
    expect(details?.textContent).toContain("upstream 502");
  });

  it("offers an action only where one could succeed", () => {
    // Retaining content and being actionable are different questions: an
    // `unavailable` panel keeps its last numbers, but a button there only
    // teaches the reader that the button fails.
    for (const [name, outcome] of Object.entries(OUTCOMES)) {
      cleanup();
      render(
        <ResearchPanel
          title="p"
          state={researchState(outcome)}
          actions={<button type="button">Export</button>}
        >
          <p>c</p>
        </ResearchPanel>,
      );
      const offered = screen.queryByRole("button", { name: "Export" }) !== null;
      const expected = ["available", "stale", "partial"].includes(researchState(outcome).state);
      expect(offered, `${name} offered=${offered}`).toBe(expected);
    }
  });

  it("hides actions whenever the content is withheld", () => {
    render(
      <ResearchPanel
        title="p"
        state={researchState(OUTCOMES.denied)}
        actions={<button type="button">Export</button>}
      >
        <p>c</p>
      </ResearchPanel>,
    );
    expect(screen.queryByRole("button", { name: "Export" })).toBeNull();
  });

  it("announces loading once, and keeps the skeleton out of the a11y tree", () => {
    render(<ResearchPanel title="p" state={researchState(OUTCOMES.loading)} />);
    expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy();
  });

  it("marks a withheld panel as an alert and a demoted one as status", () => {
    render(<ResearchPanel title="p" state={researchState(OUTCOMES.denied)} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    cleanup();
    render(
      <ResearchPanel title="p" state={researchState(OUTCOMES.stale)}>
        <p>c</p>
      </ResearchPanel>,
    );
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("renders an absent number as words, never as zero or a dash", () => {
    render(<ResearchValue value={null} />);
    expect(screen.getByText("not reported")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.queryByText("—")).toBeNull();
  });
});

/* -------------------------------------------------------- P04 Screen 12 */

describe("P04 — Engine Atlas composition", () => {
  function renderAtlas(doc: AtlasDocument | null, tab: AtlasTab = "routes", outcome = OUTCOMES.empty) {
    const onTabChange = vi.fn();
    render(
      <MemoryRouter>
        <EngineAtlas
          doc={doc}
          state={doc ? researchState({ kind: "ok", rowCount: 1 }) : researchState(outcome)}
          tab={tab}
          onTabChange={onTabChange}
        />
      </MemoryRouter>,
    );
    return onTabChange;
  }

  it("renders three tabs with the selected one marked", () => {
    renderAtlas(atlasDoc(), "claims");
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    // Spec 12 §1 / HiFi labels, verbatim (RF02-F1).
    expect(tabs.map((t) => t.textContent)).toEqual(["WFO modes", "Execution routes", "Claims by contract"]);
    expect(tabs.find((t) => t.getAttribute("aria-selected") === "true")?.textContent).toBe("Claims by contract");
  });

  it("changes tab on click without navigating", () => {
    const onTabChange = renderAtlas(atlasDoc(), "modes");
    fireEvent.click(screen.getByRole("tab", { name: "Execution routes" }));
    expect(onTabChange).toHaveBeenCalledWith("routes");
  });

  it("reads the tab from a hash and falls back safely", () => {
    expect(tabFromHash("#tab=claims")).toBe("claims");
    expect(tabFromHash("#tab=nonsense")).toBe("modes");
    expect(tabFromHash("")).toBe("modes");
  });

  it("grows a fifteenth route without touching the component (spec 12 T06)", () => {
    const base = atlasDoc();
    const fifteen = atlasDoc({
      routes: Array.from({ length: 15 }, (_, i) => atlasRoute({ route_id: `route_${i}` })),
    });
    renderAtlas(base, "routes");
    expect(document.querySelectorAll("[data-route]")).toHaveLength(base.routes.length);
    cleanup();
    renderAtlas(fifteen, "routes");
    expect(document.querySelectorAll("[data-route]")).toHaveLength(15);
  });

  it("shows all four axes on every route, and marks only the blocker", () => {
    renderAtlas(atlasDoc(), "routes");
    const blocked = document.querySelector("[data-route='arbitrage_triangular']");
    expect(blocked).toBeTruthy();
    expect(blocked?.querySelectorAll("[data-axis]")).toHaveLength(4);
    const blocking = blocked?.querySelectorAll("[data-blocking]");
    expect(blocking).toHaveLength(1);
    expect(blocking?.[0].getAttribute("data-axis")).toBe("integration");
    // The engine axis keeps saying it is supported.
    expect(blocked?.querySelector("[data-axis='engine']")?.textContent).toBe("ENGINE_SUPPORTED");
  });

  it("keeps a blocked route visible with its exact refusal reason and no action", () => {
    renderAtlas(atlasDoc(), "routes");
    const blocked = document.querySelector("[data-route='arbitrage_triangular']");
    expect(blocked?.textContent).toContain("Schema-only: no adapter in Portal.");
    // The only button in the row selects it in the hash (RF02-F1); nothing acts on it.
    for (const button of within(blocked as HTMLElement).queryAllByRole("button")) {
      expect(button.hasAttribute("data-route-link")).toBe(true);
    }
    expect(within(blocked as HTMLElement).queryByRole("link")).toBeNull();
  });

  it("renders never-claims text and the min-formula footer", () => {
    renderAtlas(atlasDoc(), "claims");
    expect(screen.getByText("never claims intrabar SL/TP fills")).toBeTruthy();
    expect(
      screen.getByText("certificate = min(engine cert, methodology cap, artifact completeness)"),
    ).toBeTruthy();
  });

  it("renders the suspect line verbatim on a mode card", () => {
    renderAtlas(atlasDoc(), "modes");
    expect(
      screen.getByText(
        "pretty S̄_OOS with fat σ_d; negative d̄ everywhere smells like leakage",
      ),
    ).toBeTruthy();
  });

  it("separates the current release from retained history", () => {
    renderAtlas(atlasDoc(), "modes");
    expect(screen.getByText("quantbt-engine 1.1.1")).toBeTruthy();
    expect(screen.getByText(/1\.0\.8 — retained history/)).toBeTruthy();
  });

  it("shows a safe state when the installed version is unverified", () => {
    const doc = atlasDoc();
    renderAtlas(
      atlasDoc({ current_release: { ...doc.current_release, verified: false } }),
      "modes",
    );
    expect(screen.getByText(/installed version not verified/)).toBeTruthy();
    expect(screen.queryByText("quantbt-engine 1.1.1")).toBeNull();
  });

  it("keeps the header and tabs when the document is unavailable", () => {
    renderAtlas(null, "routes", OUTCOMES.unavailable);
    // The screen must not collapse: its identity and navigation survive.
    expect(screen.getByRole("heading", { name: "Engine Atlas" })).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(document.querySelector("[data-research-state='unavailable']")).toBeTruthy();
  });

  it("offers no run, submit or engine control anywhere on the screen", () => {
    for (const tab of ["routes", "modes", "claims"] as const) {
      cleanup();
      renderAtlas(atlasDoc(), tab);
      // Every button moves the reader within the Atlas — a tab, a schedule
      // chip or a route row — and none of them runs, submits or starts anything.
      for (const button of screen.queryAllByRole("button")) {
        const kind = button.getAttribute("role") === "tab" || button.hasAttribute("data-schedule") || button.hasAttribute("data-route-link");
        expect(kind, button.outerHTML).toBe(true);
        expect(button.textContent?.toLowerCase()).not.toMatch(/\brun\b|submit|execute|start|launch/);
      }
      // Links only go to reading screens: a run list filtered by mode, or a run's Search & Selection.
      for (const link of screen.queryAllByRole("link")) {
        // W4: "declare →" opens New Run on the route step — a form, not a run.
        expect(link.getAttribute("href")).toMatch(/^\/research\/quantbt\/runs(\?mode=|\/new\?step=route\&route=|\/[^/]+\/(search|evidence))/);
      }
    }
  });
});

/* ------------------------------------------------------- P05 artifacts */

describe("P05 — artifact readiness panel", () => {
  it("keeps the panel for all six authority artifact states", () => {
    for (const state of RESEARCH_ARTIFACT_STATES) {
      cleanup();
      render(<ArtifactPanel title="evidence" facts={artifact({ state })} />);
      expect(screen.getByText("evidence")).toBeTruthy();
      expect(document.querySelector(`[data-artifact-state='${state}']`)).toBeTruthy();
    }
  });

  it("shows the export only when sealed, registered and admitted", () => {
    render(
      <ArtifactPanel
        title="evidence"
        facts={artifact()}
        exportAction={<button type="button">Download</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Download" })).toBeTruthy();
  });

  it("withholds the export from a disk-sealed but unregistered candidate, and says why", () => {
    render(
      <ArtifactPanel
        title="evidence"
        facts={artifact({ registered: false })}
        exportAction={<button type="button">Download</button>}
      />,
    );
    expect(screen.queryByRole("button", { name: "Download" })).toBeNull();
    expect(document.querySelector("[data-export-withheld]")?.textContent).toMatch(
      /not registered/i,
    );
  });

  it("removes the export for corrupt and missing while keeping the panel", () => {
    for (const state of ["CORRUPT", "MISSING"] as const) {
      cleanup();
      render(
        <ArtifactPanel
          title="evidence"
          facts={artifact({ state })}
          exportAction={<button type="button">Download</button>}
        />,
      );
      expect(screen.queryByRole("button", { name: "Download" })).toBeNull();
      expect(screen.getByText("evidence")).toBeTruthy();
    }
  });

  it("prints decimals exactly and never converts them through a float", () => {
    render(
      <ArtifactPanel
        title="evidence"
        facts={artifact()}
        metadata={{ rowCount: "1234567890.123456789", byteSize: null }}
      />,
    );
    expect(screen.getByText("1234567890.123456789")).toBeTruthy();
    // The absent byte size is words, not zero.
    expect(screen.getAllByText("not reported").length).toBeGreaterThan(0);
  });

  it("rejects a timestamp without UTC milliseconds rather than reformatting it", () => {
    render(
      <ArtifactPanel title="e" facts={artifact()} metadata={{ sealedAt: "2026-09-20T00:00:00Z" }} />,
    );
    expect(screen.queryByText("2026-09-20T00:00:00Z")).toBeNull();
  });

  it("captions a capped window with both numbers", () => {
    render(
      <ArtifactPanel
        title="e"
        facts={artifact()}
        window={{ returnedRows: 50, totalRows: 10_000, nextCursor: "c" }}
      />,
    );
    expect(screen.getByText(/50 of 10000 rows/)).toBeTruthy();
  });

  it("leaks no metadata when the request itself was denied", () => {
    render(
      <ArtifactPanel
        title="e"
        facts={artifact()}
        metadata={{ rowCount: "999" }}
        transportState={researchState(OUTCOMES.denied)}
      />,
    );
    expect(screen.queryByText("999")).toBeNull();
  });
});

/* -------------------------------------------------------- P06 queue */

describe("P06 — queue and attempt panels", () => {
  it("renders every job state with its own chip", () => {
    for (const state of RESEARCH_JOB_STATES) {
      cleanup();
      render(<QueuePanel run={logicalRun({ state })} />);
      expect(document.querySelector(`[data-job-state='${state}']`)).toBeTruthy();
    }
  });

  it("shows three attempts under one run id, not three runs", () => {
    render(
      <QueuePanel
        run={logicalRun({
          attempts: [
            { ordinal: 1, state: "FAILED", message: null },
            { ordinal: 2, state: "FAILED", message: null },
            { ordinal: 3, state: "RUNNING", message: null },
          ],
        })}
      />,
    );
    expect(document.querySelectorAll("[data-attempt-ordinal]")).toHaveLength(3);
    expect(document.querySelectorAll("[data-run-id]")).toHaveLength(1);
    expect(screen.getByText("3 attempts")).toBeTruthy();
  });

  it("says progress is not reported rather than drawing an empty bar", () => {
    render(<QueuePanel run={logicalRun()} />);
    expect(screen.getByText("progress not reported")).toBeTruthy();
    expect(document.querySelector("[data-progress]")).toBeNull();
    expect(document.querySelector("progress")).toBeNull();
  });

  it("prints published counts and never a percentage or estimate", () => {
    render(<QueuePanel run={logicalRun({ progress: { completed: 3, total: 10 } })} />);
    const progress = document.querySelector("[data-progress]");
    expect(progress?.textContent).toBe("3 of 10");
    expect(document.body.textContent).not.toMatch(/%|ETA|remaining/i);
  });

  it("reports an optional diagnostic failure without reddening the run", () => {
    render(
      <QueuePanel
        run={logicalRun({
          state: "SUCCEEDED",
          diagnostics: [{ id: "audit_trace", kind: "OPTIONAL", failed: true }],
        })}
      />,
    );
    expect(document.querySelector("[data-optional-failures]")?.textContent).toMatch(
      /result itself is unaffected/i,
    );
    expect(document.querySelector("[data-research-state='terminal']")).toBeNull();
  });

  it("marks a mandatory diagnostic failure as terminal", () => {
    render(
      <QueuePanel
        run={logicalRun({
          state: "SUCCEEDED",
          diagnostics: [{ id: "numeric_parity", kind: "MANDATORY", failed: true }],
          reason: "Numeric parity did not hold.",
        })}
      />,
    );
    expect(document.querySelector("[data-research-state='terminal']")).toBeTruthy();
  });

  it("offers no cancel, retry or submit control before P10 publishes them", () => {
    render(<QueuePanel run={logicalRun()} />);
    for (const button of screen.queryAllByRole("button")) {
      expect(button.textContent?.toLowerCase()).not.toMatch(/cancel|retry|submit|run/);
    }
  });
});
