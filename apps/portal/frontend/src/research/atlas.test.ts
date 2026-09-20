/**
 * P04 FE/consumer tests.
 *
 * The P04 handoff names four required frontend tests. Each has a block below,
 * plus the P04 FE to-do's own guards: resolved-backend labels, disabled reason,
 * and "no Rust badge merely because the wheel ships native code".
 *
 * These are derivation tests over the published DTO. No request is made and no
 * screen is rendered; P09 owns Atlas composition and browser acceptance.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  type AtlasAxes,
  type AtlasDocument,
  type AtlasMode,
  type AtlasRoute,
  type CurrentRelease,
  allRouteDisplays,
  currentReleaseLabel,
  describesApprovalState,
  engineReportLevels,
  evidenceIsDescriptiveOnly,
  evidenceRequiredFields,
  firstBlockingAxis,
  historicalReleaseLabels,
  isScheduleValid,
  releaseHasNativeDependency,
  routeDisplay,
  scheduleChoices,
} from "./atlas";

const CLEAR: AtlasAxes = {
  engine: "ENGINE_SUPPORTED",
  integration: "ADAPTER_AVAILABLE",
  evidence: "EVIDENCE_MAPPED",
  admission: "P04_BASELINE_ONLY",
};

function route(overrides: Partial<AtlasRoute> = {}): AtlasRoute {
  return {
    route_id: "signal_notional",
    family: "signal",
    backend: "python",
    reason: "Baseline admitted.",
    axes: CLEAR,
    default_for_new_runs: false,
    execution_contract: "three_window_decay",
    report_levels: ["R0", "R1"],
    required_input_class: "signal",
    ...overrides,
  };
}

function mode(overrides: Partial<AtlasMode> = {}): AtlasMode {
  return {
    mode_id: "selected_best",
    display_name: "Selected best",
    objective_summary: "",
    when_to_use: "",
    suspect: "",
    rules: [],
    artifact_fields: [],
    default_schedule: "global",
    valid_schedules: ["global", "per_fold_decay"],
    ...overrides,
  };
}

function release(overrides: Partial<CurrentRelease> = {}): CurrentRelease {
  return {
    release_id: "quantbt-1.1.1",
    package: "quantbt-engine",
    expected_version: "1.1.1",
    installed_version: "1.1.1",
    verified: true,
    native_package: "quantbt-native",
    native_expected_version: "0.4.2",
    native_installed_version: "0.4.2",
    detail: null,
    ...overrides,
  };
}

function doc(overrides: Partial<AtlasDocument> = {}): AtlasDocument {
  return {
    schema_version: "research-engine-atlas.v1",
    manifest_revision: 1,
    current_release: release(),
    historical_releases: [
      {
        release_id: "quantbt-1.0.8",
        package: "quantbt-engine",
        version: "1.0.8",
        status: "HISTORICAL_IDENTITY_RETAINED",
      },
    ],
    routes: [route()],
    modes: [mode()],
    claims: [],
    evidence_contract: {
      schema_id: "research-run-evidence.v1",
      writer_state: "P05_OWNED_NOT_ACTIVE",
      required_fields: ["engine_release_id", "route_id"],
    },
    ...overrides,
  };
}

describe("1 — current and historical release labels", () => {
  it("prints the installed version only when the server verified it", () => {
    expect(currentReleaseLabel(release()).text).toContain("1.1.1");
    expect(currentReleaseLabel(release()).isSafeState).toBe(false);
  });

  it("falls back to a safe state when the version is unknown", () => {
    const unknown = currentReleaseLabel(release({ installed_version: null, verified: false }));
    expect(unknown.isSafeState).toBe(true);
    expect(unknown.verified).toBe(false);
    // The expected version must not be printed as though it were installed.
    expect(unknown.text).not.toContain("1.1.1");
  });

  it("treats verified=false as unknown even when a version string is present", () => {
    const claimed = currentReleaseLabel(release({ installed_version: "9.9.9", verified: false }));
    expect(claimed.isSafeState).toBe(true);
    expect(claimed.text).not.toContain("9.9.9");
  });

  it("labels historical releases as retained history with no selectable identity", () => {
    const labels = historicalReleaseLabels(doc());
    expect(labels).toHaveLength(1);
    expect(labels[0]).toContain("retained history");
    expect(labels[0]).not.toMatch(/select|activate|switch|current/i);
  });
});

describe("2 — all four-axis combinations, with no auto-enable", () => {
  const ENGINE = ["ENGINE_SUPPORTED", "ENGINE_PARTIAL", "ENGINE_DEFERRED"] as const;
  const INTEGRATION = ["ADAPTER_AVAILABLE", "INTEGRATION_GAP", "DEFERRED_BY_PORTAL"] as const;
  const EVIDENCE = ["EVIDENCE_MAPPED", "EVIDENCE_GAP", "NOT_APPLICABLE"] as const;
  const ADMISSION = ["P04_BASELINE_ONLY", "NOT_ADMITTED", "DEFERRED"] as const;

  it("resolves every one of the 81 combinations without throwing", () => {
    let admitted = 0;
    let total = 0;
    for (const engine of ENGINE)
      for (const integration of INTEGRATION)
        for (const evidence of EVIDENCE)
          for (const admission of ADMISSION) {
            total += 1;
            const display = routeDisplay(route({ axes: { engine, integration, evidence, admission } }));
            expect(display.reason).not.toBe("");
            if (display.admitted) {
              admitted += 1;
              expect(display.blockedBy).toBeNull();
            } else {
              expect(display.blockedBy).not.toBeNull();
            }
          }
    expect(total).toBe(81);
    // Admitted requires all four clear; `NOT_APPLICABLE` evidence also counts
    // as clear, so exactly two combinations qualify.
    expect(admitted).toBe(2);
  });

  it("reports an integration gap as an integration gap, not an engine failure", () => {
    const display = routeDisplay(
      route({ axes: { ...CLEAR, integration: "INTEGRATION_GAP" } }),
    );
    expect(display.admitted).toBe(false);
    expect(display.blockedBy).toBe("integration");
    // The engine axis is still supported and must keep saying so.
    expect(display.axes.engine).toBe("ENGINE_SUPPORTED");
  });

  it("keeps all four axes on the display, not a single verdict", () => {
    const display = routeDisplay(route({ axes: { ...CLEAR, evidence: "EVIDENCE_GAP" } }));
    expect(Object.keys(display.axes).sort()).toEqual([
      "admission",
      "engine",
      "evidence",
      "integration",
    ]);
  });

  it("never derives a submit permission from admission", () => {
    const display = routeDisplay(route());
    expect(display.admitted).toBe(true);
    // A "can run" flag would turn an admission fact into an authorization.
    expect(display).not.toHaveProperty("canSubmit");
    expect(display).not.toHaveProperty("canRun");
    expect(display).not.toHaveProperty("enabled");
  });

  it("returns a blocker for every non-clear axis in a fixed order", () => {
    expect(firstBlockingAxis({ ...CLEAR, engine: "ENGINE_DEFERRED" })).toBe("engine");
    expect(firstBlockingAxis({ ...CLEAR, admission: "NOT_ADMITTED" })).toBe("admission");
    // Engine is checked before admission, so the earlier axis wins.
    expect(
      firstBlockingAxis({ ...CLEAR, engine: "ENGINE_DEFERRED", admission: "NOT_ADMITTED" }),
    ).toBe("engine");
  });
});

describe("3 — invalid mode/schedule and deferred routes keep their panel", () => {
  it("marks an invalid schedule rather than removing it from the list", () => {
    const choices = scheduleChoices(doc({ modes: [mode()] }), mode());
    expect(choices.length).toBeGreaterThan(0);
    expect(choices.some((c) => !c.valid)).toBe(false);

    const narrow = mode({ valid_schedules: ["global"], default_schedule: "global" });
    const withInvalid = scheduleChoices(
      doc({ modes: [mode({ valid_schedules: ["global", "per_fold_decay", "per_fold_causal"] })] }),
      narrow,
    );
    // Every schedule stays present; the invalid ones carry their state.
    expect(withInvalid).toHaveLength(3);
    expect(withInvalid.filter((c) => !c.valid)).toHaveLength(2);
  });

  it("agrees with the mode's own valid_schedules", () => {
    expect(isScheduleValid(mode(), "global")).toBe(true);
    expect(isScheduleValid(mode(), "per_fold_causal")).toBe(false);
  });

  it("keeps a deferred route in the list with its own reason", () => {
    const deferred = route({
      route_id: "deferred_route",
      reason: "Deferred by Portal until P10.",
      axes: { ...CLEAR, integration: "DEFERRED_BY_PORTAL" },
    });
    const displays = allRouteDisplays(doc({ routes: [route(), deferred] }));
    expect(displays).toHaveLength(2);
    const found = displays.find((d) => d.routeId === "deferred_route");
    expect(found?.admitted).toBe(false);
    expect(found?.reason).toBe("Deferred by Portal until P10.");
  });

  it("renders every route the document carries, filtering none", () => {
    const routes = Array.from({ length: 14 }, (_, i) =>
      route({ route_id: `route_${i}`, axes: { ...CLEAR, admission: "NOT_ADMITTED" } }),
    );
    expect(allRouteDisplays(doc({ routes }))).toHaveLength(14);
  });
});

describe("4 — the module issues no mutation or engine request", () => {
  it("contains no network call, no mutation verb and no engine handle", () => {
    const source = readFileSync(join(process.cwd(), "src", "research", "atlas.ts"), "utf8");
    const code = source
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("*") && !line.trimStart().startsWith("//"))
      .join("\n");
    expect(code).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|axios|EventSource|WebSocket/);
    expect(code).not.toMatch(/method:\s*["'](POST|PUT|PATCH|DELETE)/i);
    // No wheel/RECORD escape hatch, per the handoff.
    expect(code).not.toMatch(/RECORD|wheel|sys\.path|dist-info/i);
  });
});

describe("resolved backend labels and vocabulary separation", () => {
  it("takes the backend label from the route, never from the release", () => {
    const pythonRoute = routeDisplay(route({ backend: "python" }));
    expect(pythonRoute.backendLabel).toBe("python");
    // The release ships a native package; that must not relabel the route.
    expect(releaseHasNativeDependency(release())).toBe(true);
    expect(pythonRoute.backendLabel).not.toMatch(/rust|native/i);
  });

  it("keeps the label a route declares for itself", () => {
    expect(routeDisplay(route({ backend: "native" })).backendLabel).toBe("native");
  });

  it("separates an engine report level from a governance approval gate", () => {
    expect(engineReportLevels(route())).toContain("R1");
    // The Atlas document carries no governance state at all.
    expect(describesApprovalState()).toBe(false);
  });
});

describe("evidence contract is described, not rendered as data", () => {
  it("treats the pinned writer state as descriptive only", () => {
    expect(evidenceIsDescriptiveOnly(doc())).toBe(true);
    expect(evidenceRequiredFields(doc())).toContain("engine_release_id");
  });

  it("enumerates required fields from the contract, not free-form strings", () => {
    // The contract pins both the writer state and the field names. A widened
    // union in P05 breaks compilation here on purpose: the screen must then be
    // told how to render a written artifact rather than a described shape.
    const fields = evidenceRequiredFields(doc());
    for (const field of fields) {
      expect([
        "engine_release_id",
        "route_id",
        "effective_spec_digest",
        "market_data_content_hash",
        "report_level",
        "selection_resolution",
        "result_summary",
      ]).toContain(field);
    }
  });
});
