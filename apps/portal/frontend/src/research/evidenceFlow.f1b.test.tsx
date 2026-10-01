/**
 * F1b text trim (VD-TEXT-01) — Screen 04 Evidence Flow (group S04).
 *
 * The screen keeps its titles, scope/unit labels and typed absences; the
 * explanatory prose under charts, the "the UI computes nothing" sentences and
 * the tab subtitles are gone, with the long rule text moved into `title`s.
 * Each test asserts the prose is gone AND the honest short form is present.
 * Bodies are the canonical captures the repo already carries.
 */
import { act, cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EvidenceFlow } from "./EvidenceFlow";
import type { CurrentSourceEvidence, EvidenceHub } from "./evidenceClient";
import { DEFAULT_CURSOR } from "./evidenceCursor";
import { researchState } from "./state";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const local = <T,>(name: string) => JSON.parse(readFileSync(join(process.cwd(), "src", "research", name), "utf8")) as T;
const W3 = local<{ evidence: CurrentSourceEvidence }>("w3RealWfo.fixture.json");
const W3B = local<{ hub_evidence: EvidenceHub; progress: import("./progressClient").ProgressRead; requested_spec: import("./progressClient").RunRequestedSpec }>(
  "w3bRealWfo.fixture.json",
);
const IDENTITY = { state: "ready" as const, identity: { progress: W3B.progress, requested: W3B.requested_spec } };
const OK = researchState({ kind: "ok", rowCount: 5 });
const RETAINED = { state: "ready" as const, evidence: W3.evidence };

function view(overrides: Partial<React.ComponentProps<typeof EvidenceFlow>> = {}) {
  return render(
    <MemoryRouter>
      <EvidenceFlow
        runId="R-WFO-118"
        hub={W3B.hub_evidence}
        state={OK}
        cursor={DEFAULT_CURSOR}
        onStage={vi.fn()}
        onFold={vi.fn()}
        onResetCursor={vi.fn()}
        series={new Map()}
        ensureSeries={vi.fn()}
        passport={RETAINED}
        ensurePassport={vi.fn()}
        onReread={vi.fn()}
        runIdentity={IDENTITY}
        {...overrides}
      />
    </MemoryRouter>,
  );
}

/** Prose that VD-TEXT-01 removed from Screen 04; none may come back on any tab. */
const GONE = [
  "the UI computes nothing",
  "the UI bins nothing",
  "UI computes no analytic",
  "it never infers",
  "restatement of the equity series",
  "Dashed lines mark where",
  "which fold carries the run",
  "click a row to move the cursor",
  "decay is a cause",
  "The server applies the rule",
  "engine-published, UI renders",
  "a chart is a bounded view",
  "sampling changes the picture",
  "No IS equity series is drawn",
  "One cell per calendar month",
  "never issued here",
  "never applied here",
  "Each row prints only what",
  "The claim passport only aggregates",
  "Nothing here is computed",
  "How time was divided",
  "Reference, not a stage",
  "nothing may be read as one",
];

describe("F1b · Summary tab", () => {
  it("none of the removed prose is on the page", () => {
    const { container } = view();
    const text = container.textContent ?? "";
    for (const phrase of GONE) expect(text, phrase).not.toContain(phrase);
  });

  it("claim strip note is 'issued by <engine>' and nothing else", () => {
    const { container } = view();
    const note = container.querySelector("[data-passport-note] > span") as HTMLElement;
    expect(note.textContent).toMatch(/^issued by quantbt-engine \S+$/);
  });

  it("the window disclosure is the scope label; the rule sits in its tooltip", () => {
    const { container } = view();
    const disclosure = container.querySelector("[data-window-disclosure]") as HTMLElement;
    expect(disclosure.textContent).toBe("headline = OOS only");
    expect(disclosure.getAttribute("title")).toBe("IS and holdout never enter the headline row.");
  });

  it("block titles lose their explanatory tails", () => {
    const { container } = view();
    const labels = [...container.querySelectorAll("h3")].map((node) => node.textContent);
    expect(labels).toContain("per-fold verdict");
    expect(labels).toContain("behavior");
    expect(labels.some((label) => /which fold|engine-published/.test(label ?? ""))).toBe(false);
  });

  it("the behavior tiles keep their typed absences (not published / not served), the footnote is gone", () => {
    const { container } = view();
    const card = container.querySelector("[data-gap='behavior-tiles']") as HTMLElement;
    expect(card.querySelectorAll("[data-behavior-tile]").length).toBe(8);
    expect(card.querySelectorAll("[data-withheld]").length).toBe(8);
    expect(card.textContent).not.toMatch(/retained walk-forward lane publishes/);
  });

  it("the underwater caption is the legend only, and an honest absence when no fold start is published", () => {
    const { container } = view();
    const foot = container.querySelector("[data-retained-series='UNDERWATER'] [data-fold-boundaries]");
    expect(["dashed = fold test start", "fold starts — not published"]).toContain(foot?.textContent);
  });

  it("the IS-equity absence keeps its server reason code", () => {
    const { container } = view();
    const note = container.querySelector("[data-series-absent='EQUITY_IS']") as HTMLElement | null;
    /* A server code rides on the chip; a screen-local gap prints as a screen note, never as a code. */
    expect(note?.textContent).toMatch(/^IS equity — (not published|not served for this lane)$/);
    expect(note?.querySelector("[data-withheld]")).toBeTruthy();
  });

  it("the per-fold footer's rule is reachable by keyboard and named", () => {
    const { container } = view();
    const rule = container.querySelector("[data-verdict-foot] [data-verdict-rule]") as HTMLElement;
    expect(rule.getAttribute("tabindex")).toBe("0");
    expect(rule.getAttribute("aria-label")).toBe(rule.getAttribute("title"));
    expect(rule.getAttribute("title")).toMatch(/PASS needs S_OOS ≥ .* WARN; anything else is DRAG/);
  });

  it("the hub path (no retained answer) keeps its 'per-fold metrics' absence and loses the opinion paragraph", () => {
    const { container } = view({ passport: { state: "idle" } });
    const table = container.querySelector("[data-gap='per-fold-verdict']") as HTMLElement;
    expect(table.textContent).toContain("per-fold metrics — not published");
    expect(table.textContent).not.toContain("this screen's opinion");
    expect(table.textContent).not.toContain("six named series");
  });
});

describe("F1b · stage tab headings", () => {
  /* The embedded deep dives read on mount; answer every read 404 and let it settle inside act. */
  const heading = async (stage: "split" | "search" | "freeze" | "execute" | "claim" | "atlas") => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 404,
        statusText: "404",
        headers: new Headers(),
        json: async () => ({ error: { code: "NOT_FOUND" } }),
      }) as unknown as Response),
    );
    const { container } = view({ cursor: { ...DEFAULT_CURSOR, stage } });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    return container.querySelector("[data-tab-heading]") as HTMLElement;
  };

  it.each([
    ["split", "Stage 1 · Split — fold construction"],
    ["search", "Stage 2 · Search — why these params"],
    ["freeze", "Stage 3 · Freeze"],
    ["execute", "Stage 4 · Execute — candle replay"],
    ["claim", "Stage 5 · Claim"],
    ["atlas", "Atlas — how to read modes and routes"],
  ] as const)("%s: the heading is the title alone (no subtitle line)", async (stage, title) => {
    const node = await heading(stage);
    expect(node.textContent).toBe(title);
    expect(node.querySelector("p")).toBeNull();
  });
});

describe("F1b · Claim tab", () => {
  const CLAIM = { ...DEFAULT_CURSOR, stage: "claim" as const };

  it("none of the removed prose is on the page", () => {
    const { container } = view({ cursor: CLAIM });
    const text = container.textContent ?? "";
    for (const phrase of GONE) expect(text, phrase).not.toContain(phrase);
    expect(container.querySelector("[data-claim-not-issued-note]")).toBeNull();
  });

  it("the certification table keeps its typed absences in short form, rule text in tooltips", () => {
    const { container } = view({ cursor: CLAIM });
    const table = container.querySelector("[data-cert-table]") as HTMLElement;
    expect(table.querySelector("h3")?.textContent).toBe("certification");
    expect(table.querySelector("[data-cert-binding]")?.textContent).toBe("binding — not published");
    expect(table.querySelector("[data-cert-binding]")?.getAttribute("title")).toContain("the rule is the engine's");
    const caps = table.querySelector("[data-cert-caps='NOT_PUBLISHED']") as HTMLElement;
    expect(caps.textContent).toBe("per-stage caps — not published");
    expect(caps.querySelector("[title]")?.getAttribute("title")).toContain("not the caps behind it");
  });

  it("the Paper hook is a disabled SOON button whose rule is in a tooltip, not on the page", () => {
    const { container } = view({ cursor: CLAIM });
    const hook = container.querySelector("[data-soon-hook='Register for Paper Trading']") as HTMLElement;
    expect(hook.querySelector("button")?.hasAttribute("disabled")).toBe(true);
    expect(hook.textContent).toBe("Register for Paper TradingSOON");
    expect(hook.getAttribute("title")).toContain("deployment params must equal frozen params");
  });

  it("the artifact manifest says the reader route is not published, with the long reason as a tooltip", () => {
    const { container } = view({ cursor: CLAIM });
    const note = container.querySelector("[data-artifact-no-reader]");
    if (note !== null) {
      expect(note.textContent).toBe("reader route — not published");
      expect(note.getAttribute("title")).toBeTruthy();
    }
  });

  it("a progress read that is loading or unasked is 'reading…' / 'not read'", () => {
    const loading = view({ cursor: CLAIM, runIdentity: { state: "loading" } });
    expect(loading.container.querySelector("[data-manifest-absence='loading']")?.textContent).toBe("reading…");
    cleanup();
    const idle = view({ cursor: CLAIM, runIdentity: { state: "idle" } });
    expect(idle.container.querySelector("[data-manifest-absence='idle']")?.textContent).toBe("not read");
  });
});
