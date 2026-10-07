/** BR-S02-16: S03 shows the persisted native result facts when Progress serves them, and nothing when it does not. */
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RunProgress } from "./RunProgress";
import type { ProgressRead } from "./progressClient";
import { researchState } from "./state";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const BASE = JSON.parse(readFileSync(join(ROOT, "apps/portal/frontend/e2e/research-foundation/progress-read.json"), "utf8")) as ProgressRead;

afterEach(cleanup);

const NATIVE = {
  schema_version: "research.native-route-result.v1", execution_route: "intrabar_bracket", authority: "PINNED_QUANTBT_ACCOUNTING_NOT_PORTAL_PNL",
  input_protocol: "DELTA_CLOSE_BRACKET_INTENTS_V1", clock: "KNOWN_CLOSE_NEXT_BAR_INTRABAR", position_unit: "CONTRACT_QUANTITY", target_notional: "2000",
  fees: { state: "AVAILABLE", total: "0", reason_code: null }, funding: { state: "NOT_PUBLISHED", total: null, reason_code: "NATIVE_RESULT_SERIES_NOT_PUBLISHED" },
  cost_scope: "FULL_CHILD_TAPE", fills_count: 0, orders_count: null, replay_authority: "RETAINED_ENGINE_AUDIT_ONLY_NOT_BROKER_EVENTS",
} as unknown as NonNullable<ProgressRead["native_execution"]>;

function view(read: ProgressRead) {
  return render(
    <MemoryRouter>
      <RunProgress runId={read.run_id} read={read} snapshot={read.progress ?? null} state={researchState({ kind: "ok", rowCount: 1 })} transport="closed" lines={[]} linesDropped={false}
        onLoadOlder={vi.fn()} foldCursor={null} onPinFold={vi.fn()} cancelling={false} onCancel={vi.fn()} />
    </MemoryRouter>,
  );
}

describe("S03 native execution", () => {
  it("prints the served facts exactly: a real zero is 0, a missing cost series says not published", () => {
    view({ ...BASE, native_execution: NATIVE });
    const panel = document.querySelector("[data-native-execution]")!;
    expect(panel.getAttribute("data-native-execution")).toBe("intrabar_bracket");
    expect(panel.querySelector('[data-native-value="fees"]')!.textContent).toBe("0");
    expect(panel.querySelector('[data-native-value="fills_count"]')!.textContent).toBe("0");
    expect(panel.querySelector('[data-native-value="funding"]')!.getAttribute("data-native-state")).toBe("NOT_PUBLISHED");
    expect(panel.querySelector('[data-native-value="orders_count"]')!.getAttribute("data-native-state")).toBe("NOT_PUBLISHED");
  });
  it("renders nothing before the source receipt matches (the field is absent), and never from the route alone", () => {
    view({ ...BASE, native_execution: undefined });
    expect(document.querySelector("[data-native-execution]")).toBeNull();
  });
});
