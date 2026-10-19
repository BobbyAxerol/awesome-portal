/**
 * Phase 12 — the evidence F4 requires.
 *
 * The test that matters most is "injected broker data is rejected, not merely
 * hidden". A screen that omits a value still holds it; a reader that drops it
 * makes the leak impossible rather than unlikely, and these assert the value is
 * gone from the parsed object, not just absent from the DOM.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { liveGuardRules, readLiveFullOperations } from "./liveFull";
import { LIVE_FULL_FIXTURE } from "./certification.fixtures";
import { LiveFullOperationsScreen } from "./screens/LiveFullOperations";
import { LiveFullOperationsContainer } from "./screens/containers";
import { createFixtureApi } from "./api/fixtureApi";

afterEach(cleanup);

const published = () =>
  JSON.parse(
    readFileSync(
      join(
        __dirname,
        "../../../../../packages/contracts/fixtures/execution-live-full-operations.unavailable.valid.json",
      ),
      "utf8",
    ),
  );

const live = () => readLiveFullOperations(LIVE_FULL_FIXTURE)!;
const patched = (mutate: (raw: Record<string, unknown>) => void) => {
  const raw = JSON.parse(JSON.stringify(LIVE_FULL_FIXTURE));
  mutate(raw);
  return readLiveFullOperations(raw)!;
};

describe("the inlined document has not drifted", () => {
  it("equals the published fixture", () => {
    expect(LIVE_FULL_FIXTURE).toEqual(published());
  });
});

describe("#1 — no fabricated zero or runtime state", () => {
  it("keeps runtime null and renders it as not stated", () => {
    expect(live().runtimeState).toBeNull();
    const { container } = render(<LiveFullOperationsScreen live={live()} />);
    const head = container.querySelector(".exec-live-head")!;
    expect(head.textContent).toMatch(/runtime not stated/);
    expect(head.textContent).not.toMatch(/HALTED|RUNNING/);
  });

  it("renders every KPI without inventing a figure", () => {
    const r = live();
    expect(r.kpis).toHaveLength(5);
    const { container } = render(<LiveFullOperationsScreen live={r} />);
    const kpis = container.querySelectorAll(".exec-strip-cell");
    expect(kpis).toHaveLength(5);
    for (const kpi of kpis) expect(kpi.querySelector(".exec-role-kpi")).toBeNull();
  });

  it("states fixture and PRODUCTION INACTIVE", () => {
    render(<LiveFullOperationsScreen live={live()} />);
    expect(screen.getByText(/fixture · PRODUCTION INACTIVE/)).toBeTruthy();
    expect(screen.getByText(/realtime inactive/)).toBeTruthy();
  });
});

describe("#2/#3 — broker data is rejected, not hidden", () => {
  it("drops an injected broker KPI value at the reader", () => {
    const injected = patched((raw) => {
      const kpis = raw.kpis as Record<string, unknown>[];
      const brokerKpi = kpis.find((k) => k.key === "broker_equity")!;
      brokerKpi.value = "999999.99";
    });
    const kpi = injected.kpis.find((k) => k.key === "broker_equity")!;
    // Gone from the PARSED OBJECT, not merely from the DOM. A value that
    // reaches a prop reaches the page eventually.
    expect(kpi.value).toBeNull();
    expect(kpi.suppressed).toBe(true);
    expect(injected.suppressedBrokerFields).toContain("kpi:broker_equity");
  });

  it("keeps the injected value out of the rendered page entirely", () => {
    const injected = patched((raw) => {
      const kpis = raw.kpis as Record<string, unknown>[];
      kpis.find((k) => k.key === "broker_equity")!.value = "999999.99";
    });
    const { container } = render(<LiveFullOperationsScreen live={injected} />);
    expect(container.textContent).not.toContain("999999.99");
  });

  it("does not suppress a non-broker KPI", () => {
    const injected = patched((raw) => {
      const kpis = raw.kpis as Record<string, unknown>[];
      kpis.find((k) => k.key === "capital")!.value = "1234.5600";
    });
    const capital = injected.kpis.find((k) => k.key === "capital")!;
    expect(capital.value).toBe("1234.5600");
    expect(capital.suppressed).toBe(false);
  });

  it("shows broker figures once the server says consistency is verified", () => {
    const verified = patched((raw) => {
      (raw.broker_consistency as Record<string, unknown>).broker_values_visible = true;
      const kpis = raw.kpis as Record<string, unknown>[];
      kpis.find((k) => k.key === "broker_equity")!.value = "10000.84";
    });
    expect(verified.kpis.find((k) => k.key === "broker_equity")!.value).toBe("10000.84");
  });

  it("treats an absent visibility flag as suppression", () => {
    const missing = patched((raw) => {
      delete (raw.broker_consistency as Record<string, unknown>).broker_values_visible;
      const kpis = raw.kpis as Record<string, unknown>[];
      kpis.find((k) => k.key === "broker_equity")!.value = "1";
    });
    // Absent is not permission.
    expect(missing.kpis.find((k) => k.key === "broker_equity")!.value).toBeNull();
  });
});

describe("#4 — suppressed is not unavailable", () => {
  it("reads the broker panel as suppressed", () => {
    expect(live().panels.broker.suppressed).toBe(true);
    expect(live().panels.internal.suppressed).toBe(false);
  });

  it("says the Portal is withholding rather than failing to read", () => {
    render(<LiveFullOperationsScreen live={live()} />);
    const broker = screen.getByLabelText("Broker");
    expect(within(broker).getByText(/Suppressed by policy/)).toBeTruthy();
    expect(within(broker).getByText(/withholding this, not failing to read/)).toBeTruthy();
  });

  it("marks it apart from the other two panels in the markup", () => {
    const { container } = render(<LiveFullOperationsScreen live={live()} />);
    expect(container.querySelectorAll('[data-suppressed="true"]').length).toBeGreaterThan(0);
    const internal = screen.getByLabelText("Internal");
    expect(internal.getAttribute("data-suppressed")).toBe("false");
  });
});

describe("positions and orders rows (additive; the V1 screen ignores them)", () => {
  const meta = (id: string, authority: string, state = "ready") => ({
    panel_id: id, source_authority: authority, panel_state: state, freshness_state: "FRESH", delivery_profile: "fixture",
    source_verification_state: "VERIFIED", as_of: "2026-10-17T12:04:00.000Z", read_at: "2026-10-17T12:04:00.000Z", age_seconds: null, lag_ms: null,
    source_cursor: null, projection_epoch: null, projection_sequence: null, capability_snapshot_id: null, data: { page: "first" }, warnings: [],
  });
  const collection = (id: string, authority: string, rows: unknown[], state = "ready") => ({
    envelope: meta(id, authority, state), exact_total: rows.length, returned_count: rows.length, next_cursor: null, previous_cursor: null, rows,
  });
  const withRows = (authority: string, visible: boolean, rows: unknown[] = [{ instrument: "BTCUSDT", qty: "0.0120", reduce_only: false, size: 3 }]) =>
    patched((raw) => {
      raw.positions = collection("positions", authority, rows);
      raw.orders = collection("orders", authority, [{ order_id: "o-1" }]);
      (raw.broker_consistency as Record<string, unknown>).broker_values_visible = visible;
    });

  it("the published dark body: collections are read, empty, and unavailable", () => {
    const r = live();
    expect(r.positionRows).toMatchObject({ exactTotal: null, returnedCount: 0, rows: [], rowsDropped: 0 });
    expect(r.positionRows?.envelope.panelState).toBe("unavailable");
    expect(r.orderRows?.envelope.panelState).toBe("unavailable");
  });

  it("keeps scalar cells as the server wrote them; a number, array or object cell is dropped, never printed", () => {
    const r = withRows("EXECUTION", false);
    expect(r.positionRows?.rows).toEqual([{ instrument: "BTCUSDT", qty: "0.0120", reduce_only: false }]);
    expect(r.positionRows?.exactTotal).toBe(1);
    expect(r.suppressedBrokerFields).not.toContain("positions:rows");
  });

  it("strips a BROKER collection at the reader while broker figures are hidden, and names it", () => {
    const hidden = withRows("BROKER", false);
    expect(hidden.positionRows).toMatchObject({ rows: [], exactTotal: null, returnedCount: null });
    expect(hidden.orderRows).toMatchObject({ rows: [], exactTotal: null });
    // V2 reads `withheldRows`; the V1 list is not extended (V1 never read rows).
    expect(hidden.withheldRows).toEqual(["positions", "orders"]);
    expect(hidden.suppressedBrokerFields.some((f) => f.endsWith(":rows"))).toBe(false);
    expect(JSON.stringify(hidden)).not.toContain("BTCUSDT");
    expect(JSON.stringify(hidden)).not.toContain("0.0120");
    // An absent visibility flag is hidden too.
    const absent = patched((raw) => {
      raw.positions = collection("positions", "BROKER", [{ instrument: "BTCUSDT" }]);
      delete (raw.broker_consistency as Record<string, unknown>).broker_values_visible;
    });
    expect(JSON.stringify(absent)).not.toContain("BTCUSDT");
    const shown = withRows("BROKER", true);
    expect(shown.positionRows?.rows).toHaveLength(1);
    expect(shown.withheldRows).toEqual([]);
  });

  it.each(["DERIVED", "MYSTERY", "", "broker"])("fail-closed: a collection with authority %j is stripped like a BROKER one while broker figures are hidden", (authority) => {
    const hidden = withRows(authority, false);
    expect(hidden.positionRows).toMatchObject({ rows: [], exactTotal: null, returnedCount: null });
    expect(hidden.withheldRows).toEqual(["positions", "orders"]);
    expect(JSON.stringify(hidden)).not.toContain("BTCUSDT");
    expect(withRows(authority, true).positionRows?.rows).toHaveLength(1);
  });

  it("fail-closed: a collection whose authority is missing altogether is stripped", () => {
    const missing = patched((raw) => {
      const c = collection("positions", "EXECUTION", [{ instrument: "BTCUSDT" }]);
      delete (c.envelope as Record<string, unknown>).source_authority;
      raw.positions = c;
    });
    expect(missing.positionRows?.rows).toEqual([]);
    expect(missing.withheldRows).toContain("positions");
  });

  it.each(["EXECUTION", "PORTAL", "RESEARCH"])("a collection explicitly authored by %s keeps its rows", (authority) => {
    const kept = withRows(authority, false);
    expect(kept.positionRows?.rows).toHaveLength(1);
    expect(kept.withheldRows).toEqual([]);
  });

  it.each([["DERIVED"], ["MYSTERY"], [null]])("fail-closed: a KPI with authority %j and a value is stripped while broker figures are hidden", (authority) => {
    const r = patched((raw) => {
      const k = (raw.kpis as Record<string, unknown>[]).find((x) => x.key === "daily_pnl")!;
      k.value = "-38.60";
      const env = k.envelope as Record<string, unknown>;
      if (authority === null) delete env.source_authority;
      else env.source_authority = authority;
    });
    const kpi = r.kpis.find((x) => x.key === "daily_pnl")!;
    expect(kpi.value).toBeNull();
    expect(kpi.suppressed).toBe(true);
    expect(r.suppressedBrokerFields).toContain("kpi:daily_pnl");
    expect(JSON.stringify(r)).not.toContain("-38.60");
  });

  it("a KPI with a value and an authority the server names as not broker keeps it", () => {
    for (const authority of ["EXECUTION", "PORTAL", "RESEARCH"]) {
      const r = patched((raw) => {
        const k = (raw.kpis as Record<string, unknown>[]).find((x) => x.key === "capital")!;
        k.value = "1234.5600";
        (k.envelope as Record<string, unknown>).source_authority = authority;
      });
      expect(r.kpis.find((x) => x.key === "capital")!.value).toBe("1234.5600");
    }
  });

  it("a DERIVED KPI with NO value reads exactly as the published body always did (not flagged suppressed)", () => {
    expect(live().kpis.find((x) => x.key === "daily_pnl")).toMatchObject({ value: null, suppressed: false });
    expect(live().suppressedBrokerFields).toEqual(["kpi:broker_equity"].filter(() => false));
  });

  it("bounds a collection: 200 rows, at most 80 cells a row, 256 characters a cell, and counts what it did not keep", () => {
    const wide = Object.fromEntries(Array.from({ length: 90 }, (_, i) => [`k${i}`, "v"]));
    const r = withRows("EXECUTION", true, [...Array.from({ length: 205 }, () => wide), {}, "not a row", null]);
    expect(r.positionRows?.rows).toHaveLength(200);
    expect(Object.keys(r.positionRows!.rows[0]!)).toHaveLength(80);
    expect(r.positionRows?.rowsDropped).toBe(8);
    const long = withRows("EXECUTION", true, [{ a: "x".repeat(257), b: "x".repeat(256) }]);
    expect(Object.keys(long.positionRows!.rows[0]!)).toEqual(["b"]);
  });

  it("the V1 screen renders identically with or without rows (it reads only the panels)", () => {
    // React's generated ids count up per render; the markup is otherwise compared byte for byte.
    const markup = (html: string) => html.replace(/:r[0-9a-z]+:/g, ":r:");
    const plain = markup(render(<LiveFullOperationsScreen live={live()} />).container.innerHTML);
    cleanup();
    const raw = JSON.parse(JSON.stringify(LIVE_FULL_FIXTURE));
    raw.positions = collection("positions", "EXECUTION", [{ instrument: "BTCUSDT" }]);
    const rich = markup(render(<LiveFullOperationsScreen live={readLiveFullOperations(raw)!} />).container.innerHTML);
    expect(rich).toBe(plain);
  });

  it("V1 is unchanged by cells the reader drops (a number, an array, an unsafe key): the markup and the V1 list are the same as with no rows", () => {
    const markup = (html: string) => html.replace(/:r[0-9a-z]+:/g, ":r:");
    const base = readLiveFullOperations(LIVE_FULL_FIXTURE)!;
    const plain = markup(render(<LiveFullOperationsScreen live={base} />).container.innerHTML);
    cleanup();
    const raw = JSON.parse(JSON.stringify(LIVE_FULL_FIXTURE));
    raw.positions = collection("positions", "EXECUTION", [{ instrument: "BTCUSDT", qty: 0.012, legs: ["a"], "bad name": "x" }, { qty: 5 }]);
    const withDrops = readLiveFullOperations(raw)!;
    expect(withDrops.positionRows?.rows).toEqual([{ instrument: "BTCUSDT" }]);
    expect(withDrops.positionRows?.rowLosses?.[0]).toEqual({ cells: { qty: "number", legs: "unreadable" }, notShown: 1 });
    expect(withDrops.suppressedBrokerFields).toEqual(base.suppressedBrokerFields);
    expect(markup(render(<LiveFullOperationsScreen live={withDrops} />).container.innerHTML)).toBe(plain);
  });

  it("V1 is unchanged by rows that the strip empties: a BROKER collection (hidden) prints and lists exactly what a body without rows does", () => {
    const markup = (html: string) => html.replace(/:r[0-9a-z]+:/g, ":r:");
    const base = readLiveFullOperations(LIVE_FULL_FIXTURE)!;
    const plain = markup(render(<LiveFullOperationsScreen live={base} />).container.innerHTML);
    cleanup();
    const raw = JSON.parse(JSON.stringify(LIVE_FULL_FIXTURE));
    raw.positions = collection("positions", "BROKER", []);
    raw.orders = collection("orders", "BROKER", [{ order_id: "o-1" }]);
    const withBroker = readLiveFullOperations(raw)!;
    // The pre-change reader (855ad7c0) had no rows: its list was the KPI entries only, and this still is.
    expect(withBroker.suppressedBrokerFields).toEqual(base.suppressedBrokerFields);
    expect(withBroker.suppressedBrokerFields.some((f) => f.endsWith(":rows"))).toBe(false);
    expect(withBroker.withheldRows).toEqual(["positions", "orders"]);
    const rich = markup(render(<LiveFullOperationsScreen live={withBroker} />).container.innerHTML);
    expect(rich).toBe(plain);
    expect(rich).not.toContain("o-1");
  });
});

describe("panel vocabulary is the schema's", () => {
  it("ready reads as ok, FRESH as OK; error is a failed read; a word outside the schema is unavailable", () => {
    const state = (word: string, freshness: string) =>
      patched((raw) => {
        const internal = (raw.source_panels as Record<string, Record<string, unknown>>).internal!;
        internal.panel_state = word;
        internal.freshness_state = freshness;
      }).panels.internal!.envelope;
    expect(state("ready", "FRESH")).toMatchObject({ panelState: "ok", freshness: "OK" });
    expect(state("error", "AGING")).toMatchObject({ panelState: "terminal", freshness: "AGING" });
    expect(state("ok", "OK")).toMatchObject({ panelState: "unavailable", freshness: "OK" });
    expect(state("loading", "PAUSED")).toMatchObject({ panelState: "unavailable", freshness: null });
  });
});

describe("#5 — the two guard rules, stated separately", () => {
  it("splits the token into suppression and gap rules", () => {
    const rules = liveGuardRules(live());
    expect(rules.suppression).toMatch(/Every broker-derived value is suppressed/);
    expect(rules.suppression).toMatch(/policy decision, not a missing reading/);
    expect(rules.gapRule).toMatch(/blocks risk-increasing actions and does not block protective/);
  });

  it("blocks R4 when nobody can say whether a gap exists", () => {
    // `gap_detected` is null. Not knowing is not the same as knowing there is
    // none, and this is where the difference costs money.
    expect(live().projectionContinuity!.gapDetected).toBeNull();
    expect(liveGuardRules(live()).r4Blocked).toBe(true);
  });

  it("stops blocking only when the server states there is no gap", () => {
    const clean = patched((raw) => {
      (raw.projection_continuity as Record<string, unknown>).gap_detected = false;
    });
    expect(liveGuardRules(clean).r4Blocked).toBe(false);
  });

  it("blocks when a gap is detected", () => {
    const gapped = patched((raw) => {
      (raw.projection_continuity as Record<string, unknown>).gap_detected = true;
    });
    expect(liveGuardRules(gapped).r4Blocked).toBe(true);
  });

  it("renders gap null as not stated, never as none", () => {
    render(<LiveFullOperationsScreen live={live()} />);
    fireEvent.click(screen.getByRole("tab", { name: /Continuity/ }));
    const continuity = screen.getByLabelText("Projection continuity");
    expect(within(continuity).getByText(/gap not stated/)).toBeTruthy();
  });
});

describe("#6 — actions absent while invisible", () => {
  it("draws neither group", () => {
    const { container } = render(<LiveFullOperationsScreen live={live()} />);
    expect(container.querySelector(".exec-live-actions")).toBeNull();
    // Tabs and the provenance Copy are the only buttons — none of them is a command.
    expect(container.querySelectorAll(".exec-live-actions button, .exec-stage-actions button")).toHaveLength(0);
  });

  it("says an unblocked protective action is still not executable", () => {
    // `source_gap_blocks: false` on R3 must not be read as "R3 can be run".
    expect(live().commandPolicy!.protective!.sourceGapBlocks).toBe(false);
    render(<LiveFullOperationsScreen live={live()} />);
    expect(screen.getByText(/not the same as it being executable/)).toBeTruthy();
  });

  it("draws them once the server makes them visible, blocking only R4", () => {
    const visible = patched((raw) => {
      const policy = raw.command_policy as Record<string, Record<string, unknown>>;
      policy.protective.visible = true;
      policy.protective.enabled = true;
      policy.risk_increasing.visible = true;
      policy.risk_increasing.enabled = true;
    });
    render(<LiveFullOperationsScreen live={visible} />);
    fireEvent.click(screen.getByRole("tab", { name: /Guard rules/ }));
    expect(screen.getByRole("button", { name: "Protective action" }).hasAttribute("disabled")).toBe(false);
    expect(
      screen.getByRole("button", { name: "Risk-increasing action" }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("fails closed on an unreadable source_gap_blocks", () => {
    const odd = patched((raw) => {
      ((raw.command_policy as Record<string, Record<string, unknown>>).protective).source_gap_blocks = "no";
    });
    expect(odd.commandPolicy!.protective!.sourceGapBlocks).toBe(true);
  });
});

describe("the predecessor canary envelope is labelled inactive", () => {
  it("says it does not govern Live Full", () => {
    expect(live().predecessorEnvelope!.activeForLiveFull).toBe(false);
    render(<LiveFullOperationsScreen live={live()} />);
    fireEvent.click(screen.getByRole("tab", { name: /Predecessor envelope/ }));
    const pred = screen.getByLabelText("Predecessor canary envelope");
    expect(within(pred).getByText(/NOT active for Live Full/)).toBeTruthy();
  });

  it("carries the caps as exact strings", () => {
    const e = live().predecessorEnvelope!;
    expect(e.capitalCap).toBe("5000");
    expect(e.dailyLossCap).toBe("250");
  });

  it("shows a typed gap when the predecessor is missing", () => {
    const raw = JSON.parse(JSON.stringify(LIVE_FULL_FIXTURE));
    delete raw.predecessor_canary_envelope;
    render(<LiveFullOperationsScreen live={readLiveFullOperations(raw)!} />);
    fireEvent.click(screen.getByRole("tab", { name: /Predecessor envelope/ }));
    expect(screen.getByText(/absence is a gap rather than a default/)).toBeTruthy();
  });

  it("treats an unreadable active flag as inactive", () => {
    const odd = patched((raw) => {
      (raw.predecessor_canary_envelope as Record<string, unknown>).active_for_live_full = "yes";
    });
    expect(odd.predecessorEnvelope!.activeForLiveFull).toBe(false);
  });
});

describe("the reader fails closed", () => {
  it("returns null without a deployment", () => {
    expect(readLiveFullOperations({})).toBeNull();
    expect(readLiveFullOperations(null)).toBeNull();
  });

  it("reads the four activity flags fail-closed", () => {
    const raw = JSON.parse(JSON.stringify(LIVE_FULL_FIXTURE));
    raw.source_side_effect_requested = "no";
    raw.runtime_activation_requested = "no";
    raw.promotion_execution_requested = "no";
    raw.production_command_active = "yes";
    const parsed = readLiveFullOperations(raw)!;
    expect(parsed.sourceSideEffectRequested).toBe(true);
    expect(parsed.runtimeActivationRequested).toBe(true);
    expect(parsed.promotionExecutionRequested).toBe(true);
    expect(parsed.productionCommandActive).toBe(false);
  });

  it("publishes no realtime stream url while inactive", () => {
    expect(live().realtimeActive).toBe(false);
    expect(live().realtimeStreamUrl).toBeNull();
  });
});

describe("the container fetches through the port", () => {
  it("renders the screen", async () => {
    render(<LiveFullOperationsContainer api={createFixtureApi()} deploymentId="dep_88" />);
    expect(await screen.findByLabelText("Stage guard")).toBeTruthy();
  });

  it("shows the port's failure rather than a guard band over nothing", async () => {
    render(
      <LiveFullOperationsContainer
        api={createFixtureApi({ unavailableEndpoints: ["getLiveFullOperations"] })}
        deploymentId="dep_88"
      />,
    );
    await waitFor(() => expect(screen.queryByLabelText("Stage guard")).toBeNull());
  });
});
