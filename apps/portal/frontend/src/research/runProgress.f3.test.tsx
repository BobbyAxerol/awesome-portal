/**
 * Batch F3 · S03 — 03-O: the Gantt card and the artifact manifest sit in one
 * row aligned to the top, so a run with one or two folds leaves no blank block
 * above the cursor row inside the Gantt card (the shorter card is not stretched
 * to the manifest's height). The progress read is the committed
 * `e2e/research-foundation` fixture.
 */
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RunProgress } from "./RunProgress";
import type { ProgressRead } from "./progressClient";
import { researchState } from "./state";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const BASE = JSON.parse(
  readFileSync(join(ROOT, "apps/portal/frontend/e2e/research-foundation/progress-read.json"), "utf8"),
) as ProgressRead;

afterEach(cleanup);

function view(snapshot: NonNullable<ProgressRead["progress"]>) {
  return render(
    <MemoryRouter>
      <RunProgress
        runId={BASE.run_id}
        read={BASE}
        snapshot={snapshot}
        state={researchState({ kind: "ok", rowCount: 1 })}
        transport="closed"
        lines={[]}
        linesDropped={false}
        onLoadOlder={vi.fn()}
        foldCursor={1}
        onPinFold={vi.fn()}
        cancelling={false}
        onCancel={vi.fn()}
      />
    </MemoryRouter>,
  );
}

describe("F3 · S03 03-O — the Gantt row is top-aligned", () => {
  it("with two folds the Gantt card is not stretched against the manifest card", () => {
    const snapshot = structuredClone(BASE.progress!);
    snapshot.folds = snapshot.folds.slice(0, 2);
    view(snapshot);
    const gantt = document.querySelector("[data-gantt]") as HTMLElement;
    const row = gantt.closest("[data-research-panel]")!.parentElement as HTMLElement;
    expect(row.querySelectorAll(":scope > [data-research-panel]").length).toBeGreaterThanOrEqual(2);
    expect(row.style.display).toBe("flex");
    expect(row.style.alignItems).toBe("flex-start");
  });
});
