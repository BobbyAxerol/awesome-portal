/**
 * Batch F2b · S03 — flow, less text, more visual.
 *
 *  - the header names where the run goes next (Evidence Flow), on the cursor
 *    the page already holds;
 *  - the fold on the evidence cursor opens Evidence Flow on that fold;
 *  - sentences that a chip, a tooltip or a dot can carry are tooltips.
 *
 * The progress read comes from the committed `e2e/research-foundation` fixture.
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
const RUN_ID = BASE.run_id;

afterEach(cleanup);

function view(overrides: Partial<React.ComponentProps<typeof RunProgress>> = {}) {
  return render(
    <MemoryRouter>
      <RunProgress
        runId={RUN_ID}
        read={BASE}
        snapshot={BASE.progress ?? null}
        state={researchState({ kind: "ok", rowCount: 1 })}
        transport="closed"
        lines={[]}
        linesDropped={false}
        onLoadOlder={vi.fn()}
        foldCursor={null}
        onPinFold={vi.fn()}
        cancelling={false}
        onCancel={vi.fn()}
        {...overrides}
      />
    </MemoryRouter>,
  );
}
const $ = (selector: string) => document.querySelector(selector) as HTMLElement | null;
const words = (text: string | null | undefined) => (text ?? "").trim().split(/\s+/).filter(Boolean).length;

describe("S03 flow — the way on and the way back", () => {
  it("the header offers Evidence Flow next, on this run, and the breadcrumb still leads to the Run Library", () => {
    view({ foldCursor: 1 });
    const next = $("[data-action='next-evidence']") as HTMLAnchorElement;
    expect(next.tagName).toBe("A");
    expect(next.textContent).toBe("next: Evidence Flow →");
    expect(next.getAttribute("href")).toContain(`/research/quantbt/runs/${encodeURIComponent(RUN_ID)}/evidence#`);
    expect(next.getAttribute("href")).toContain("stage=summary");
    expect(next.getAttribute("href")).toContain("fold=1");
    expect(document.querySelector("nav[aria-label='Research breadcrumbs'] a[href='/research/quantbt/runs']")?.textContent).toBe("Runs");
  });

  it("the evidence cursor's fold opens Evidence Flow on that fold once the fold is done", () => {
    view({ foldCursor: 1 });
    expect(BASE.progress?.folds.find((f) => f.fold === 1)?.state).toBe("DONE");
    const link = $("[data-action='open-fold-evidence']") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toContain(`/runs/${encodeURIComponent(RUN_ID)}/evidence#`);
    expect(link.getAttribute("href")).toContain("fold=1");
    expect(link.getAttribute("aria-label")).toBe("open fold_01 in Evidence Flow");
    expect(link.getAttribute("title")).toBe("Open fold_01 in Evidence Flow");
  });

  it("a fold that is not done offers no evidence link (nothing to open yet)", () => {
    const snap = structuredClone(BASE.progress!);
    snap.folds = snap.folds.map((fold) => (fold.fold === 1 ? { ...fold, state: "RUNNING" as const } : fold));
    view({ snapshot: snap, foldCursor: 1 });
    expect($("[data-action='open-fold-evidence']")).toBeNull();
  });

  it("the stage links keep the run and the cursor, and say so in a tooltip", () => {
    const snap = structuredClone(BASE.progress!);
    snap.readiness = { ...snap.readiness, mandatory: "SEALED" };
    view({ snapshot: snap, foldCursor: 1 });
    const links = [...document.querySelectorAll("[data-done-link]")] as HTMLAnchorElement[];
    expect(links).toHaveLength(5);
    for (const link of links) {
      expect(link.getAttribute("href")).toContain("fold=1");
      expect(link.getAttribute("href")).toContain(`/runs/${encodeURIComponent(RUN_ID)}/`);
      expect(link.getAttribute("title")).toMatch(/^Open Stage \d /);
    }
  });
});

describe("S03 less text — a sentence a tooltip can carry is a tooltip", () => {
  it("the passport note over eight words moves into the badge's tooltip", () => {
    view();
    const badge = $("[data-claim-badge]")!;
    const sentence = badge.getAttribute("title");
    expect($("[data-claim]")?.getAttribute("data-claim")).toBe("FORECAST");
    expect(sentence).toContain("computed from mode × schedule in the config");
    expect(words(sentence)).toBeGreaterThan(8);
    expect(badge.parentElement?.textContent).not.toContain("computed from mode");
  });

  it("the done banner no longer says 'open the evidence at:'", () => {
    const snap = structuredClone(BASE.progress!);
    snap.readiness = { ...snap.readiness, mandatory: "SEALED" };
    view({ snapshot: snap });
    const banner = $("[data-done-banner]")!;
    expect(banner.textContent).not.toContain("open the evidence at");
    // QA S03: the not-issued fact is the passport header's; the banner does not repeat it.
    expect(banner.textContent).not.toContain("no claim issued");
  });

  it("the seal reads as a status dot as well as words", () => {
    view();
    const dot = $("[data-readiness-dot]");
    expect(dot?.getAttribute("data-readiness-dot")).toBe("open");
    expect(dot?.getAttribute("aria-hidden")).toBe("true");
    expect($("[data-readiness]")?.textContent).toContain(`mandatory ${BASE.progress?.readiness.mandatory}`);
  });

  it("a sealed run's dot is the good colour", () => {
    const snap = structuredClone(BASE.progress!);
    snap.readiness = { ...snap.readiness, mandatory: "SEALED" };
    view({ snapshot: snap });
    expect($("[data-readiness-dot]")?.getAttribute("data-readiness-dot")).toBe("sealed");
    expect(($("[data-readiness-dot]") as HTMLElement).style.background).toContain("--good");
  });

  it("a waiting source and a terminal record still being written are one short phrase with the sentence as a tooltip", () => {
    view({ read: { ...BASE, availability: "PENDING_SOURCE_CALLBACK" } });
    const pending = $("[data-pending-source]")!;
    expect(words(pending.textContent)).toBeLessThanOrEqual(4);
    expect(pending.getAttribute("title")).toContain("Waiting for its source to report progress");
  });
});
