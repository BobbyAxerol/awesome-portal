/**
 * D1 — the shared run-label registry and what `ShortId` does with it.
 *
 * This change reaches every id rendered on the Research surface, so the risk
 * is not "the label is missing" but "the label replaced something it should
 * not have". These cases pin both directions: a labelled run reads as
 * `R-WFO-118`, and everything else — a digest, an alpha version, a run no
 * read has labelled — reads exactly as it did before.
 */

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ShortId } from "./ShortId";
import { forgetRunLabels, rememberRunLabel, rememberRunLabels, runLabelFor } from "./runLabels";

const RUN = "rrun_e1fa9e5c0f2b41d3a0c7e3b54a17d5aa";
const OTHER = "rrun_8c9c1f2a3b4c5d6e7f8091a2b3c41150";
const DIGEST = "sha256:9f0a90664b1c2d3e4f5061728394a5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c";

beforeEach(() => forgetRunLabels());
afterEach(() => {
  cleanup();
  forgetRunLabels();
});

describe("the run label registry", () => {
  it("remembers what a read published, per run", () => {
    rememberRunLabel(RUN, "R-WFO-118");
    rememberRunLabel(OTHER, "R-P04-007");
    expect(runLabelFor(RUN)).toBe("R-WFO-118");
    expect(runLabelFor(OTHER)).toBe("R-P04-007");
  });

  it("treats an absent label as no label, never as a number", () => {
    /* A pre-D1 server publishes no `display_label`; a child row publishes
       null. Both mean the same thing to a reader, and neither may become an
       ordinal this browser worked out. */
    rememberRunLabel(RUN, undefined);
    rememberRunLabel(OTHER, null);
    expect(runLabelFor(RUN)).toBeNull();
    expect(runLabelFor(OTHER)).toBeNull();
  });

  it("knows nothing about an id no read has carried", () => {
    expect(runLabelFor(DIGEST)).toBeNull();
    expect(runLabelFor(null)).toBeNull();
    expect(runLabelFor(undefined)).toBeNull();
  });

  it("learns a whole list read at once, unlabelled rows included", () => {
    rememberRunLabels([
      { run_id: RUN, display_label: "R-WFO-118" },
      { run_id: OTHER, display_label: null },
      { run_id: null, display_label: "R-WFO-999" },
    ]);
    expect(runLabelFor(RUN)).toBe("R-WFO-118");
    expect(runLabelFor(OTHER)).toBeNull();
    /* A row with no run id teaches nothing; it must not land under "null". */
    expect(runLabelFor("null")).toBeNull();
  });
});

describe("ShortId with a label in hand", () => {
  it("prints the label and keeps the full id everywhere it mattered", () => {
    rememberRunLabel(RUN, "R-WFO-118");
    render(<ShortId id={RUN} label="run" />);
    const button = screen.getByRole("button");
    expect(button.textContent).toBe("R-WFO-118");
    /* The id is still the identity: hover, copy target, the accessible name
       and the attribute tests and tools read. */
    expect(button.getAttribute("title")).toBe(`${RUN} — click to copy`);
    expect(button.getAttribute("data-full-id")).toBe(RUN);
    expect(button.getAttribute("aria-label")).toBe(`run ${RUN}, copy`);
    expect(button.getAttribute("data-display-label")).toBe("R-WFO-118");
  });

  it("falls back to the short id when no read has labelled the run", () => {
    render(<ShortId id={RUN} label="run" />);
    const button = screen.getByRole("button");
    expect(button.textContent).toBe("rrun_e1fa9e5c");
    expect(button.getAttribute("data-display-label")).toBeNull();
  });

  it("never labels a digest or an alpha version", () => {
    /* The registry is keyed by run id, so nothing else can collide with it —
       but a regression here would rewrite ids across six screens, so it is
       asserted rather than assumed. */
    rememberRunLabel(RUN, "R-WFO-118");
    render(
      <>
        <ShortId id={DIGEST} label="effective spec digest" />
        <ShortId id="av_delta_rsi_polynomial_alpha_1_0_0" label="alpha version" />
      </>,
    );
    const [digest, version] = screen.getAllByRole("button");
    expect(digest!.textContent).toBe("9f0a9066");
    expect(version!.textContent).toBe("av_delta_rsi_polynomial_alpha_1_0_0");
  });

  it("repaints when the label arrives after the first render", () => {
    /* The reads land after the first frame on every screen. A registry the
       component did not subscribe to would leave the short id on screen for
       the rest of the session. */
    render(<ShortId id={RUN} label="run" />);
    expect(screen.getByRole("button").textContent).toBe("rrun_e1fa9e5c");
    act(() => rememberRunLabel(RUN, "R-WFO-118"));
    expect(screen.getByRole("button").textContent).toBe("R-WFO-118");
  });
});
