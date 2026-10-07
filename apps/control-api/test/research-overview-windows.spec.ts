import { describe, it, expect } from "vitest";
import { currentSourceWindowViews, ResearchCurrentSourceWindowViewsSchema } from "../src/research/current-source-window-views";
import { CurrentSourceProtocolDisclosureSchema } from "../src/research/current-source.payload";
import { evidenceWindowDisclosure } from "../src/research/evidence.coverage";
import { ResearchEvidenceWindowDisclosureSchema } from "../src/research/evidence.contract";
import { p13WindowTopology } from "./research-evidence-window-disclosure.fixture";

// Synthetic contract units; the separate browser receipt names actual owner runs.
export function syntheticWindowProtocol() {
  const topology = p13WindowTopology;
  const roles = { is: topology.folds[0]!.train, oos: topology.folds[0]!.outer_oos, holdout: topology.sealed_holdout };
  const windows = Object.fromEntries(Object.entries(roles).map(([key, value]) => [key, {
    start_utc_ms: value.start_utc_ms, end_exclusive_utc_ms: value.end_exclusive_utc_ms, bar_count: value.bars,
  }]));
  return CurrentSourceProtocolDisclosureSchema.parse({ schema_version: "research.current-source-protocol-disclosure.v1",
    protocol: "three_window_decay", engine_operation: "train_test_split", calibration_scope: "IS_OOS_ONLY", observation_scope: "OOS_SELECTION_INPUT",
    windows, independent_holdout: { ...windows.holdout, state: "AVAILABLE", holdout_used_for_selection: false,
      selected_params_digest: "a".repeat(64), freeze_before_holdout: true },
    window_series: Object.fromEntries(Object.entries(roles).map(([key, value]) => [key, [{ at_utc_ms: value.start_utc_ms,
      equity: "20000", return_fraction: "0", accepted_position: "0", drawdown_fraction: "0", signal_target: null }]])),
  });
}
const folds = [0, 1].map(i => ({ sourceOrdinal: i, payload: { fold_id: String(i), train_start_utc_ms: 10,
  train_end_utc_ms: 20 + i * 10, test_start_utc_ms: 21 + i * 10, test_end_utc_ms: 29 + i * 10 } }));
describe("Overview retained windows", () => {
  it("publishes completed Three Window access without replacing immutable OOS analytics", () => {
    const protocol = syntheticWindowProtocol(), before = JSON.stringify(protocol);
    const views = currentSourceWindowViews(protocol, folds);
    expect(views.is.kind).toBe("ACCOUNT_REPLAY"); expect(views.holdout.kind).toBe("ACCOUNT_REPLAY");
    expect(views.is).toHaveProperty("source_ref", "RETAINED_WINDOW_ACCOUNT_V1");
    expect(JSON.stringify(views)).not.toMatch(/source_locator|P05[.]/);
    expect(JSON.stringify(protocol)).toBe(before);
    expect(views).not.toHaveProperty("metrics"); // no metrics calculated from display points
  });
  it("scopes WFO IS by source ordinal, not verdict sort order or identifier", () => {
    const views = currentSourceWindowViews(undefined, [...folds].reverse());
    expect(views.is.kind).toBe("FOLD_FACTS");
    if (views.is.kind !== "FOLD_FACTS") throw Error("fixture");
    expect(views.is.folds.map(r => r.source_ordinal)).toEqual([0, 1]);
    expect(views.is.folds[0]).toHaveProperty("source_ref", "RETAINED_FOLD_IS_FACTS_V1");
    expect(JSON.stringify(views)).not.toMatch(/source_locator|P05[.]/);
    expect(views.is.folds[0]!.is_sharpe).toBeNull();
    expect(views.is.folds[0]!.curve.state).toBe("NOT_PUBLISHED");
    expect(views.holdout.state).toBe("NOT_APPLICABLE");
    expect(() => currentSourceWindowViews(undefined, [folds[1]!])).toThrow();
    expect(ResearchCurrentSourceWindowViewsSchema.safeParse({ ...views, holdout: { ...views.holdout, state: "NOT_PUBLISHED" } }).success).toBe(false);
  });
  it("does not manufacture independent IS from full-sample calibration", () => {
    expect(currentSourceWindowViews(undefined, folds, true).is).toMatchObject({ state: "NOT_APPLICABLE" });
  });
  it("keeps preflight holdout denied, exposing count only for the verified completed protocol", () => {
    const protocol = syntheticWindowProtocol();
    expect(evidenceWindowDisclosure(p13WindowTopology).holdout_bars.state).toBe("DENIED");
    const disclosed = evidenceWindowDisclosure(p13WindowTopology, protocol);
    expect(disclosed.holdout_bars).toEqual({ state: "AVAILABLE", reason_code: null, value: 96 });
    expect(ResearchEvidenceWindowDisclosureSchema.safeParse(disclosed).success).toBe(true);
    expect(ResearchEvidenceWindowDisclosureSchema.safeParse({ ...disclosed, holdout_bars: { state: "AVAILABLE", reason_code: null, value: null } }).success).toBe(false);
    expect(() => evidenceWindowDisclosure(p13WindowTopology, { ...protocol, independent_holdout: { ...protocol.independent_holdout, freeze_before_holdout: false } })).toThrow();
    expect(() => evidenceWindowDisclosure(p13WindowTopology, { ...protocol, windows: { ...protocol.windows, is: { ...protocol.windows.is, bar_count: 143 } } })).toThrow();
    expect(() => evidenceWindowDisclosure(p13WindowTopology, { ...protocol, windows: { ...protocol.windows, is: { ...protocol.windows.is, start_utc_ms: protocol.windows.is.start_utc_ms - 1 } } })).toThrow();
  });
});
