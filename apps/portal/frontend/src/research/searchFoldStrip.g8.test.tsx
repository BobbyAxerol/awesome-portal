/**
 * G8 · Screen 06 "what this mode reads" — the per-fold glyph strip (HiFi audit
 * 6.4).
 *
 * Every body is a canonical published one, never a hand-built response:
 *
 *  - the Atlas: `research-foundation.atlas-current.valid.json` (all five modes,
 *    eight mode × schedule descriptors);
 *  - the fold plan: `research-current-source.split.valid.json`;
 *  - the retained search: `research-current-source.search-surface.valid.json`
 *    (the real W5b seal, mode_1_decay · global);
 *  - progress, requested spec and the hub's WFO read: the W3b real bodies;
 *  - the P04 hub read and the retained lane's typed not-applicable answers: the
 *    real preview capture `g8RealP04.fixture.json` (no `packages/contracts`
 *    fixture carries the P04 hub search).
 *
 * A variant changes one served fact at a time and checks that what it removes
 * is printed as an absence — never as a guess and never as a zero.
 */
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SearchScreen } from "./SearchDetail";
import { SearchRoute } from "./SearchRoute";
import {
  FOLD_STRIP_CAP,
  FoldStrip,
  OOS_READING_NOTE,
  OOS_READING_WORDS,
  UI_MODE_READS_CODES,
  foldReadsWords,
  hubModeReadsAbsence,
  modeReadsView,
  stripFoldOf,
  type FoldPlanSlot,
  type ModeReadsStrip,
  type ModeReadsView,
} from "./SearchFoldStrip";
import type { AtlasResponse } from "./foundationClient";
import { __resetFoundationCaches } from "./foundationClient";
import { foldLabel, formatUtc } from "./researchFormat";
import { forgetObservedFolds, DEFAULT_CURSOR } from "./evidenceCursor";
import { forgetRunIdentities } from "./retainedLane";
import type { CurrentSourceSearch, SearchDetail } from "./searchClient";
import { researchState } from "./state";
import type { CurrentSourceSplit } from "./splitClient";
import { forgetSearchReads } from "./useSearch";

afterEach(cleanup);

const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
const read = <T,>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const ATLAS = read<AtlasResponse>(join(FIXTURES, "research-foundation.atlas-current.valid.json"));
const SPLIT = read<CurrentSourceSplit>(join(FIXTURES, "research-current-source.split.valid.json"));
const SURFACE = read<CurrentSourceSearch>(join(FIXTURES, "research-current-source.search-surface.valid.json"));
const W3B = read<{ progress: unknown; requested_spec: unknown; hub_search: unknown }>(
  join(process.cwd(), "src", "research", "w3bRealWfo.fixture.json"),
);
const P04 = read<{ hub_search: SearchDetail; lane_search: unknown; lane_split: unknown }>(
  join(process.cwd(), "src", "research", "g8RealP04.fixture.json"),
);
const RUN = SURFACE.run_id;
const P04_RUN = P04.hub_search.run_id;
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function codeOf(name: string): string {
  return readFileSync(join(process.cwd(), "src", "research", name), "utf8")
    .split("\n")
    .filter((line) => {
      const t = line.trimStart();
      return !t.startsWith("*") && !t.startsWith("//") && !t.startsWith("/*");
    })
    .join("\n");
}

/* --------------------------------------------------------------- the stub */

type Reply = [number, unknown] | "never";
interface Stubs {
  search?: unknown;
  split?: Reply;
  atlas?: Reply;
  hub?: unknown;
  laneSearch?: Reply;
}

/** Every request path the screen made, in order — the tests read it to say what was (not) asked. */
let calls: string[] = [];

function stub(over: Stubs = {}) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = new URL(url, "http://x").pathname;
      calls.push(path);
      const reply = (status: number, payload: unknown) =>
        ({ ok: status < 300, status, statusText: String(status), headers: new Headers(), json: async () => payload }) as unknown as Response;
      const answer = (given: Reply | undefined, fallback: [number, unknown]): Promise<Response> | Response => {
        const [status, payload] = given === undefined ? fallback : given === "never" ? [0, null] : given;
        return given === "never" ? new Promise<Response>(() => undefined) : reply(status, payload);
      };
      if (path.endsWith("/progress")) return reply(200, W3B.progress);
      if (path.endsWith("/requested-spec")) return reply(200, W3B.requested_spec);
      if (path.endsWith("/current-source/split")) return answer(over.split, [200, SPLIT]);
      if (path.endsWith("/current-source/search")) return answer(over.laneSearch, [200, over.search ?? SURFACE]);
      if (path === "/api/v1/research/quantbt/atlas") return answer(over.atlas, [200, ATLAS]);
      if (path.endsWith("/search")) return reply(200, over.hub ?? W3B.hub_search);
      return reply(404, { error: { code: "UNEXPECTED", message: "not stubbed" } });
    }),
  );
}

async function mount(runId: string, over: Stubs = {}, ready: (root: HTMLElement) => boolean = () => true) {
  stub(over);
  const path = `/research/quantbt/runs/${runId}/search`;
  window.history.replaceState(null, "", path);
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/research/quantbt/runs/:runId/search" element={<SearchRoute />} />
      </Routes>
    </MemoryRouter>,
  );
  /* The first KaTeX chunk of a cold worker can take seconds when the whole suite is running. */
  await waitFor(
    () => {
      const strip = view.container.querySelector("[data-mode-reads] [data-fold-strip]");
      expect(strip).toBeTruthy();
      expect(ready(view.container)).toBe(true);
    },
    { timeout: 10_000 },
  );
  return view.container;
}

/** KaTeX is a lazy chunk: the retained run's formula settles after the data, and its state update must land inside the wait. */
const typeset = (root: ParentNode) => [...root.querySelectorAll("[data-formula-state]")].every((node) => node.getAttribute("data-formula-state") === "katex");

/** The retained run, once the strip has left `loading` and the formulas are typeset. */
const settledWfo = (over: Stubs = {}) =>
  mount(RUN, over, (root) => root.querySelector("[data-mode-reads] [data-fold-strip]")?.getAttribute("data-fold-strip") !== "loading" && typeset(root));

beforeEach(() => {
  vi.unstubAllGlobals();
  forgetSearchReads();
  forgetRunIdentities();
  forgetObservedFolds();
  __resetFoundationCaches();
});

const strip = (root: ParentNode) => root.querySelector("[data-mode-reads] [data-fold-strip]") as HTMLElement;
const text = (root: ParentNode, selector: string) => root.querySelector(selector)?.textContent ?? null;
const cells = (root: ParentNode, kind: "train" | "test") => [...root.querySelectorAll(`[data-strip-cell='${kind}']`)] as HTMLElement[];

/** A published view, the way the screen builds it, from the canonical bodies (one served fact changed at a time). */
function view(over: { mode?: string; schedule?: string; atlas?: AtlasResponse; folds?: CurrentSourceSplit["fold_plan"]["folds"] } = {}): ModeReadsView {
  const atlas = over.atlas ?? ATLAS;
  return modeReadsView({
    mode: over.mode ?? "mode_1_decay",
    schedule: over.schedule ?? "global",
    engineVersion: SURFACE.provenance.engine_version,
    plan: { state: "ready", folds: over.folds ?? SPLIT.fold_plan.folds },
    atlas: { state: "ready", doc: atlas.atlas!, kind: atlas.selected_release_kind },
  });
}

/* ----------------------------------------------------------- 1 · the strip */

describe("G8 · the strip on the retained WFO run", () => {
  it("draws the served folds — fold_01, fold_02 — with the train and test cells the HiFi measures", async () => {
    const root = await settledWfo();
    const drawn = strip(root);
    expect(drawn.getAttribute("data-fold-strip")).toBe("drawn");
    expect(drawn.getAttribute("data-strip-mode")).toBe("mode_1_decay");
    expect(drawn.getAttribute("data-strip-schedule")).toBe("global");
    expect(drawn.getAttribute("data-strip-release")).toBe("er_quantbt_111");
    const folds = [...root.querySelectorAll("[data-strip-fold]")];
    expect(folds.map((fold) => fold.getAttribute("data-strip-fold"))).toEqual(SPLIT.fold_plan.folds.map((fold) => fold.fold_id));
    expect(folds.map((fold) => fold.textContent)).toEqual(["fold_01", "fold_02"]);
    expect(cells(root, "train")).toHaveLength(2);
    expect(cells(root, "test")).toHaveLength(2);
    /* HiFi: train 34 × 12, test 14 × 12 with a 1 px border, a 1 px gap, fold label mono 8.5. */
    for (const cell of cells(root, "train")) expect(cell.className).toContain("w-[34px]");
    for (const cell of cells(root, "test")) {
      expect(cell.className).toContain("w-[14px]");
      expect(cell.className).toContain("border");
    }
    expect(root.querySelector("[data-strip-fold] > span.flex.gap-px")).toBeTruthy();
    expect(root.querySelector("[data-strip-fold] > .mono")?.className).toContain("text-[8.5px]");
  });

  it("mode_1_decay · global is RETROSPECTIVE in the Atlas: the gold OOS cell pulses and the note is the HiFi's", async () => {
    const root = await settledWfo();
    expect(strip(root).getAttribute("data-strip-oos")).toBe("RETROSPECTIVE");
    for (const cell of cells(root, "test")) {
      expect(cell.getAttribute("data-oos-reading")).toBe("RETROSPECTIVE");
      expect(cell.getAttribute("data-motion")).toBe("pulse");
      expect(cell.style.background).toBe("var(--accent-2)");
      expect(cell.style.borderColor).toBe("var(--accent)");
    }
    expect(text(root, "[data-fold-strip-note]")).toBe(OOS_READING_NOTE.RETROSPECTIVE);
    /* VD-TEXT-01: one short line, not the HiFi's sentence. */
    expect(text(root, "[data-fold-strip-note]")).toBe("retrospective — not a deployment claim");
    expect(text(root, "[data-fold-strip-note]")).not.toContain("Refit after reading the full span");
  });

  it("asks for the fold plan and the Atlas once each, and writes nothing", async () => {
    await settledWfo();
    expect(calls.filter((path) => path.endsWith("/current-source/split"))).toHaveLength(1);
    expect(calls.filter((path) => path === "/api/v1/research/quantbt/atlas")).toHaveLength(1);
    const init = (fetch as unknown as { mock: { calls: [string, RequestInit?][] } }).mock.calls;
    for (const [, options] of init) expect(options?.method ?? "GET").toBe("GET");
  });

  it("the windows are the fold plan's, in UTC, in each cell's title and in the text alternative — never an epoch", async () => {
    const root = await settledWfo();
    const first = SPLIT.fold_plan.folds[0]!;
    const title = root.querySelector("[data-strip-fold='0']")?.getAttribute("title") ?? "";
    expect(title).toContain(`train ${formatUtc(first.train_start_utc_ms)} to ${formatUtc(first.train_end_utc_ms)}, 720 bars`);
    expect(title).toContain(`test ${formatUtc(first.test_start_utc_ms)} to ${formatUtc(first.test_end_utc_ms)}, 168 bars — retrospective`);
    expect(title).not.toMatch(/1970|NaN|undefined|null/);
    expect(text(root, "[data-fold-strip-line='0']")).toBe(title);
  });

  it("the row is a labelled group with a text alternative: one summary line, then one line per fold", async () => {
    const root = await settledWfo();
    const row = root.querySelector("[data-mode-reads]") as HTMLElement;
    expect(row.getAttribute("role")).toBe("group");
    const name = document.getElementById(row.getAttribute("aria-labelledby") ?? "");
    expect(name?.textContent).toBe("what this mode reads");
    /* The glyphs are decoration for the text that follows them. */
    expect(row.querySelector("[data-fold-glyphs]")?.getAttribute("aria-hidden")).toBe("true");
    const alt = [...row.querySelectorAll("[data-fold-strip-text] li")].map((item) => item.textContent);
    expect(alt).toHaveLength(1 + SPLIT.fold_plan.folds.length);
    expect(alt[0]).toBe("mode_1_decay under the global schedule: OOS is retrospective. 2 folds in the fold plan.");
    expect(alt[1]).toMatch(/^fold_01: train 2026-06-01 00:00 UTC to 2026-06-30 23:00 UTC, 720 bars; test 2026-07-01 00:00 UTC to 2026-07-07 23:00 UTC, 168 bars — retrospective$/);
    expect(alt[2]).toMatch(/^fold_02: /);
    expect(row.querySelector("[data-fold-strip-text]")?.className).toContain("sr-only");
    /* Nothing in the strip takes focus: it is a picture with a caption. */
    expect(row.querySelectorAll("[data-fold-glyphs] a, [data-fold-glyphs] button, [data-fold-glyphs] [tabindex]")).toHaveLength(0);
  });

  it("prints the Atlas's own words for the mode: selection inputs, retention, release, and its OOS condition verbatim", async () => {
    const root = await settledWfo();
    const facts = ATLAS.atlas!.modes.find((mode) => mode.mode_id === "mode_1_decay")!.facts!;
    const reads = facts.reads as { selection_inputs: string[]; retention: string };
    expect(text(root, "[data-mode-read='selection_inputs']")).toBe(`selection_inputs ${reads.selection_inputs.join(" · ")}`);
    expect(text(root, "[data-mode-read='retention']")).toBe(`retention ${reads.retention}`);
    expect(text(root, "[data-mode-read='atlas_release']")).toBe("atlas_release er_quantbt_111");
    const condition = facts.schedules.find((fact) => fact.schedule === "global")!.oos_use_condition!;
    expect(text(root, "[data-oos-use-condition]")).toBe(`oos_use USED — ${condition}`);
    /* The contract tokens the claim row above already prints are not repeated. */
    for (const key of ["validation_claim", "chronological_claim", "oos_used_for_selection", "candidate_selection_metric"]) {
      expect(root.querySelector(`[data-mode-reads] [data-mode-read='${key}']`)).toBeNull();
    }
    expect(root.querySelector("[data-action='open-atlas-mode']")?.getAttribute("href")).toContain("mode=mode_1_decay&schedule=global");
  });
});

/* ------------------------------------- 2 · every mode × schedule the Atlas states */

describe("G8 · every mode × schedule the Atlas publishes is drawn from its own descriptor", () => {
  const modes = ATLAS.atlas!.modes;
  const pairs = modes.flatMap((mode) => mode.facts!.schedules.map((fact) => ({ mode: mode.mode_id, schedule: fact.schedule, fact })));

  it("the canonical Atlas has the five modes and eight descriptors this table covers", () => {
    expect(modes.map((mode) => mode.mode_id)).toEqual([
      "mode_1_decay",
      "mode_2_sbb",
      "mode_3_flat_minima",
      "mode_4_is_only_robust",
      "mode_5_full_robust",
    ]);
    expect(pairs).toHaveLength(8);
  });

  for (const pair of pairs) {
    it(`${pair.mode} · ${pair.schedule}: OOS is ${pair.fact.oos_use_state} because the Atlas says so`, () => {
      const drawn = view({ mode: pair.mode, schedule: pair.schedule }) as ModeReadsStrip;
      expect(drawn.kind).toBe("strip");
      expect(drawn.oos.state).toBe(pair.fact.oos_use_state);
      expect(drawn.oos.use).toBe(pair.fact.oos_use);
      expect(drawn.oos.condition).toBe(pair.fact.oos_use_condition ?? null);
      const reads = modes.find((mode) => mode.mode_id === pair.mode)!.facts!.reads as { selection_inputs: string[]; retention: string };
      expect(drawn.reads).toEqual({ state: "PUBLISHED", inputs: reads.selection_inputs, retention: reads.retention });
      expect(drawn.folds.map((fold) => fold.foldId)).toEqual(SPLIT.fold_plan.folds.map((fold) => fold.fold_id));

      const { container } = render(<FoldStrip view={drawn} />);
      const drawnCells = cells(container, "test");
      if (pair.fact.oos_use_state === "NOT_APPLICABLE") {
        /* HiFi mode 5: no test cell at all — and the note says why, in the engine's word. */
        expect(drawnCells).toHaveLength(0);
      } else {
        expect(drawnCells).toHaveLength(SPLIT.fold_plan.folds.length);
        for (const cell of drawnCells) expect(cell.getAttribute("data-oos-reading")).toBe(pair.fact.oos_use_state);
      }
      expect(text(container, "[data-fold-strip-note]")).toBe(OOS_READING_NOTE[pair.fact.oos_use_state!]);
    });
  }

  it("the OOS cell has the HiFi's five looks: gold pulse, gold pulse, hatched, light, none", () => {
    const look = (mode: string, schedule: string) => {
      const { container } = render(<FoldStrip view={view({ mode, schedule })} />);
      const [cell] = cells(container, "test");
      cleanup();
      return cell === undefined ? null : { bg: cell.style.background, border: cell.style.borderColor, motion: cell.getAttribute("data-motion") };
    };
    expect(look("mode_1_decay", "per_fold_decay")).toEqual({ bg: "var(--accent-2)", border: "var(--accent)", motion: "pulse" });
    expect(look("mode_1_decay", "global")).toEqual({ bg: "var(--accent-2)", border: "var(--accent)", motion: "pulse" });
    const withheld = look("mode_1_decay", "per_fold_causal")!;
    expect(withheld.bg).toContain("repeating-linear-gradient(135deg, var(--accent-2-soft) 0 3px, transparent 3px 6px)");
    expect(withheld.border).toBe("var(--accent-2)");
    expect(withheld.motion).toBeNull();
    expect(look("mode_2_sbb", "global")).toEqual({ bg: "var(--accent-soft)", border: "var(--accent)", motion: null });
    expect(look("mode_5_full_robust", "global")).toBeNull();
  });

  it("the strip follows the served state, not the mode's name: change one descriptor and the glyph changes with it", () => {
    const changed = copy(ATLAS);
    const fact = changed.atlas!.modes.find((mode) => mode.mode_id === "mode_2_sbb")!.facts!.schedules[0]!;
    expect(fact.oos_use_state).toBe("REPORT_ONLY");
    fact.oos_use_state = "SELECTION_INPUT";
    const drawn = view({ mode: "mode_2_sbb", atlas: changed }) as ModeReadsStrip;
    expect(drawn.oos.state).toBe("SELECTION_INPUT");
    const { container } = render(<FoldStrip view={drawn} />);
    expect(cells(container, "test")[0]!.getAttribute("data-motion")).toBe("pulse");
  });

  it("no mode, schedule or OOS rule lives in the strip's own code", () => {
    const code = codeOf("SearchFoldStrip.tsx");
    /* The strip may not know which mode reads what: no mode id, no schedule id, no hex colour. */
    expect(code).not.toMatch(/mode_[1-5]_/);
    expect(code).not.toMatch(/["']per_fold_(decay|causal)["']|["']global["']/);
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    /* Colours are design tokens only. */
    expect(code.match(/var\(--[a-z0-9-]+\)/g)?.length ?? 0).toBeGreaterThan(5);
  });
});

/* ------------------------------------------------------- 3 · typed absences */

describe("G8 · what cannot be drawn is a typed absence with its reason", () => {
  const nothingDrawn = (root: ParentNode) => {
    expect(root.querySelectorAll("[data-strip-fold], [data-strip-cell]")).toHaveLength(0);
    expect(text(root, "[data-mode-reads]")).not.toMatch(/\b0 (folds|bars)\b/);
  };

  it("the Atlas refuses: not published, its refusal code, and no glyph", async () => {
    const root = await settledWfo({ atlas: [503, { error: { code: "RESEARCH_FOUNDATION_UNAVAILABLE", message: "down" } }] });
    const absent = strip(root);
    expect(absent.getAttribute("data-fold-strip")).toBe("absent");
    expect(absent.getAttribute("data-absence-state")).toBe("NOT_PUBLISHED");
    expect(absent.getAttribute("data-absence-code")).toBe("RESEARCH_FOUNDATION_UNAVAILABLE");
    expect(text(root, "[data-fold-strip-note]")).toContain("Engine Atlas could not be read");
    expect(text(root, "[data-fold-strip-note]")).not.toContain("What this mode reads is not drawn");
    expect(text(root, "[data-absence-word]")).toBe("not published");
    nothingDrawn(root);
  });

  it("the fold plan says the run is not retained yet (a 409 with its lane state): that sentence, not a guess", async () => {
    const root = await settledWfo({
      split: [409, { error: { code: "RESEARCH_CURRENT_SOURCE_CONFLICT", message: "conflict" }, details: { lane_state: "PENDING_RETENTION" } }],
    });
    expect(strip(root).getAttribute("data-fold-strip")).toBe("absent");
    expect(strip(root).getAttribute("data-absence-code")).toBe("RESEARCH_CURRENT_SOURCE_CONFLICT");
    expect(text(root, "[data-fold-strip-note]")).toContain("The run completed; its sealed artifact has not been retained yet.");
    expect(text(root, "[data-fold-strip-note]")).toContain("No fold is drawn.");
    nothingDrawn(root);
  });

  it("the fold plan is not applicable to this run (the lane's typed 200): NOT_APPLICABLE, in the lane's words", async () => {
    const root = await settledWfo({ split: [200, P04.lane_split] });
    expect(strip(root).getAttribute("data-fold-strip")).toBe("absent");
    expect(strip(root).getAttribute("data-absence-state")).toBe("NOT_APPLICABLE");
    expect(strip(root).getAttribute("data-absence-code")).toBe("RS02_RETAINED_LANE_NOT_APPLICABLE_TO_P04_FIXED_QUALIFICATION");
    expect(text(root, "[data-absence-word]")).toBe("not applicable");
    nothingDrawn(root);
  });

  it("a fold plan that lists no fold draws nothing and says so", async () => {
    const empty = copy(SPLIT);
    empty.fold_plan.folds = [];
    const root = await settledWfo({ split: [200, empty] });
    expect(strip(root).getAttribute("data-absence-code")).toBe(UI_MODE_READS_CODES.PLAN_LISTS_NO_FOLDS);
    nothingDrawn(root);
  });

  it("an Atlas that answers with a retained historical identity carries no mode facts: nothing is drawn from it", async () => {
    const historical = read<AtlasResponse>(join(FIXTURES, "research-foundation.historical-identity.valid.json"));
    expect(historical.selected_release_kind).toBe("HISTORICAL");
    expect(historical.atlas).toBeNull();
    const root = await settledWfo({ atlas: [200, historical] });
    expect(strip(root).getAttribute("data-fold-strip")).toBe("absent");
    expect(strip(root).getAttribute("data-absence-code")).toBe(UI_MODE_READS_CODES.ATLAS_NOT_CURRENT);
    expect(text(root, "[data-fold-strip-note]")).toContain("historical identity with no mode facts");
    nothingDrawn(root);
  });

  it("an Atlas mode with no engine facts is not drawn from a neighbour's", async () => {
    const atlas = copy(ATLAS);
    delete atlas.atlas!.modes.find((mode) => mode.mode_id === "mode_1_decay")!.facts;
    const root = await settledWfo({ atlas: [200, atlas] });
    expect(strip(root).getAttribute("data-absence-code")).toBe(UI_MODE_READS_CODES.NO_FACTS);
    expect(text(root, "[data-fold-strip-note]")).toContain("manifest publishes no engine facts for this mode × schedule");
    nothingDrawn(root);
  });

  it("an Atlas that does not list the run's mode names the mode it could not find", async () => {
    const atlas = copy(ATLAS);
    atlas.atlas!.modes = atlas.atlas!.modes.filter((mode) => mode.mode_id !== "mode_1_decay");
    const root = await settledWfo({ atlas: [200, atlas] });
    expect(strip(root).getAttribute("data-absence-code")).toBe(UI_MODE_READS_CODES.NO_MODE_ENTRY);
    expect(text(root, "[data-fold-strip-note]")).toContain("no entry for mode_1_decay");
    nothingDrawn(root);
  });

  it("an Atlas stated for another engine release is not drawn as this run's: both releases are named", async () => {
    const atlas = copy(ATLAS);
    atlas.atlas!.current_release.expected_version = "1.2.0";
    const root = await settledWfo({ atlas: [200, atlas] });
    expect(strip(root).getAttribute("data-absence-code")).toBe(UI_MODE_READS_CODES.RELEASE_DIFFERS);
    expect(text(root, "[data-fold-strip-note]")).toContain("quantbt-engine 1.2.0");
    expect(text(root, "[data-fold-strip-note]")).toContain("this run ran on 1.1.1");
    nothingDrawn(root);
  });

  it("a schedule the Atlas states no fact for is not drawn", async () => {
    const atlas = copy(ATLAS);
    const facts = atlas.atlas!.modes.find((mode) => mode.mode_id === "mode_1_decay")!.facts!;
    facts.schedules = facts.schedules.filter((fact) => fact.schedule !== "global");
    const root = await settledWfo({ atlas: [200, atlas] });
    expect(strip(root).getAttribute("data-absence-code")).toBe(UI_MODE_READS_CODES.NO_SCHEDULE_FACT);
    expect(text(root, "[data-fold-strip-note]")).toContain("no global fact for mode_1_decay");
    nothingDrawn(root);
  });

  it("a search contract that names no mode draws nothing and says there is no Atlas entry to read", async () => {
    const search = copy(SURFACE);
    search.search_contract.optimization_mode = null;
    const root = await settledWfo({ search });
    expect(strip(root).getAttribute("data-absence-code")).toBe(UI_MODE_READS_CODES.NO_MODE);
    nothingDrawn(root);
  });

  it("an engine that states no OOS use for the schedule is drawn as unstated: a dashed cell, never a guessed state", async () => {
    const atlas = copy(ATLAS);
    const fact = atlas.atlas!.modes.find((mode) => mode.mode_id === "mode_1_decay")!.facts!.schedules.find((item) => item.schedule === "global")!;
    delete fact.oos_use_state;
    const root = await settledWfo({ atlas: [200, atlas] });
    expect(strip(root).getAttribute("data-fold-strip")).toBe("drawn");
    expect(strip(root).getAttribute("data-strip-oos")).toBe("NOT_STATED");
    for (const cell of cells(root, "test")) {
      expect(cell.getAttribute("data-oos-reading")).toBe("NOT_STATED");
      expect(cell.style.border).toContain("dashed");
      expect(cell.getAttribute("data-motion")).toBeNull();
    }
    expect(text(root, "[data-fold-strip-note]")).toContain("OOS use not stated by the engine for this mode × schedule");
  });

  it("a reads fact the Atlas withholds is printed as its reason, and the windows are still drawn", async () => {
    const atlas = copy(ATLAS);
    const facts = atlas.atlas!.modes.find((mode) => mode.mode_id === "mode_1_decay")!.facts!;
    facts.reads = { state: "NOT_PUBLISHED", reason: "QUANTBT_DID_NOT_STATE_WHAT_THE_MODE_READS" };
    const root = await settledWfo({ atlas: [200, atlas] });
    expect(strip(root).getAttribute("data-fold-strip")).toBe("drawn");
    const inputs = root.querySelector("[data-mode-read='selection_inputs']")!;
    expect(inputs.textContent).toBe("selection_inputs not published");
    expect(inputs.querySelector("[title]")?.getAttribute("title")).toBe("QUANTBT_DID_NOT_STATE_WHAT_THE_MODE_READS");
  });

  it("a window the fold plan does not publish is a dashed cell that says so — never a date, never 0 bars", async () => {
    const plan = copy(SPLIT);
    plan.fold_plan.folds[1]!.test_end_utc_ms = null;
    const root = await settledWfo({ split: [200, plan] });
    const [first, second] = cells(root, "test");
    expect(first!.getAttribute("data-window")).toBe("published");
    expect(second!.getAttribute("data-window")).toBe("not-published");
    expect(second!.style.border).toContain("dashed");
    expect(text(root, "[data-fold-strip-line='1']")).toContain("test window not published");
    expect(text(root, "[data-fold-strip-line='1']")).not.toMatch(/168 bars — retrospective$/);
  });

  it("loading, not read and absent are three different things", async () => {
    const loading = await mount(RUN, { split: "never" });
    expect(strip(loading).getAttribute("data-fold-strip")).toBe("loading");
    expect(text(loading, "[data-fold-strip='loading']")).toContain("reading the fold plan and this mode's Atlas entry");
    cleanup();
    forgetSearchReads();
    forgetRunIdentities();

    /* Not asked: a bare screen with a retained lane and no reads has not read anything. */
    const bare = render(
      <MemoryRouter>
        <SearchScreen
          runId={RUN}
          detail={W3B.hub_search as SearchDetail}
          state={researchState({ kind: "ok", rowCount: 1 })}
          cursor={DEFAULT_CURSOR}
          ledger={{ state: "ready", search: SURFACE }}
          ensureLedger={() => undefined}
          onReread={() => undefined}
        />
      </MemoryRouter>,
    );
    await waitFor(() => expect(typeset(bare.container)).toBe(true), { timeout: 10_000 });
    expect(strip(bare.container).getAttribute("data-fold-strip")).toBe("idle");
    expect(text(bare.container, "[data-fold-strip='idle']")).toBe("not read");
  });

  it("the pure view puts an absence before a loading state: an answer that cannot change is shown at once", () => {
    const absent: FoldPlanSlot = { state: "absent", absence: "NOT_APPLICABLE", code: "X", sentence: "s" };
    const loading = modeReadsView({ mode: "mode_1_decay", schedule: "global", engineVersion: "1.1.1", plan: absent, atlas: { state: "loading" } });
    expect(loading).toEqual({ kind: "absent", state: "NOT_APPLICABLE", code: "X", sentence: "s" });
    expect(modeReadsView({ mode: "mode_1_decay", schedule: "global", engineVersion: "1.1.1", plan: { state: "loading" }, atlas: { state: "idle" } })).toEqual({ kind: "idle" });
  });
});

/* ---------------------------------------------------------------- 4 · scale */

describe("G8 · scale: many folds wrap, a very large plan is capped and says how many it left out", () => {
  const plan = (count: number) => {
    const body = copy(SPLIT);
    const [first, second] = SPLIT.fold_plan.folds as [CurrentSourceSplit["fold_plan"]["folds"][number], CurrentSourceSplit["fold_plan"]["folds"][number]];
    body.fold_plan.folds = Array.from({ length: count }, (_, index) => ({ ...(index % 2 === 0 ? first : second), source_ordinal: index, fold_id: String(index) }));
    return body;
  };

  it("32 folds: every one is drawn, labelled fold_01…fold_32, and none is marked as left out", async () => {
    const root = await settledWfo({ split: [200, plan(32)] });
    expect(root.querySelectorAll("[data-strip-fold]")).toHaveLength(32);
    expect(root.querySelector("[data-strip-fold='31']")?.textContent).toBe("fold_32");
    expect(root.querySelector("[data-fold-strip-more]")).toBeNull();
    expect(root.querySelectorAll("[data-fold-strip-text] li")).toHaveLength(33);
  });

  it(`${FOLD_STRIP_CAP + 12} folds: ${FOLD_STRIP_CAP} glyphs, "+12 more folds", and the text alternative still lists all of them`, async () => {
    const root = await settledWfo({ split: [200, plan(FOLD_STRIP_CAP + 12)] });
    expect(root.querySelectorAll("[data-strip-fold]")).toHaveLength(FOLD_STRIP_CAP);
    expect(text(root, "[data-fold-strip-more]")).toBe("+12 more folds");
    expect(root.querySelector("[data-fold-strip-more]")?.getAttribute("title")).toBe(`${FOLD_STRIP_CAP} of ${FOLD_STRIP_CAP + 12} folds are drawn; the text alternative lists all of them`);
    expect(root.querySelectorAll("[data-fold-strip-text] li")).toHaveLength(FOLD_STRIP_CAP + 12 + 1);
    expect(text(root, "[data-fold-strip-text] li")).toContain(`${FOLD_STRIP_CAP + 12} folds in the fold plan, ${FOLD_STRIP_CAP} drawn`);
    expect(root.querySelector(`[data-fold-strip-line='${FOLD_STRIP_CAP + 11}']`)).toBeTruthy();
  });
});

/* ------------------------------------------------------ 5 · the P04 lane */

describe("G8 · a run that ran no search (the P04 fixed profile) has no per-fold read", () => {
  it("is NOT_APPLICABLE with the hub's own reason, keeps the Atlas link tagged not-run-evidence, and asks for neither read", async () => {
    const root = await mount(P04_RUN, { hub: P04.hub_search, laneSearch: [200, P04.lane_search] });
    const row = root.querySelector("[data-mode-reads]") as HTMLElement;
    expect(row.getAttribute("data-mode-reads")).toBe("reference");
    const absent = row.querySelector("[data-fold-strip='absent']") as HTMLElement;
    expect(absent.getAttribute("data-absence-state")).toBe("NOT_APPLICABLE");
    expect(absent.getAttribute("data-absence-code")).toBe("P04_FIXED_PROFILE_DOES_NOT_CREATE_OPTIMIZER_STUDY");
    expect(text(row, "[data-absence-word]")).toBe("not applicable");
    expect(text(row, "[data-fold-strip-note]")).toBe("no fold strip — fixed profile, no optimizer study");
    expect(row.querySelectorAll("[data-strip-fold], [data-strip-cell]")).toHaveLength(0);
    expect(row.querySelector("[data-mode-relation='DECLARED_MODE_RELEASE_METADATA_NOT_RUN_EVIDENCE']")?.textContent).toBe("release metadata · not run evidence");
    expect(row.querySelector("[data-action='open-atlas-mode']")?.getAttribute("href")).toContain("mode=mode_1_decay&schedule=global");
    /* The fold plan and the Atlas are asked only when the retained lane holds the run. */
    expect(calls.filter((path) => path.endsWith("/current-source/split") || path === "/api/v1/research/quantbt/atlas")).toEqual([]);
  });

  it("falls back on the hub's profile state when it sent no reason code, and on not published when the source has not reported", () => {
    const noReason = copy(P04.hub_search);
    noReason.source_profile.reason_code = null;
    expect(hubModeReadsAbsence(noReason)).toMatchObject({ state: "NOT_APPLICABLE", code: "FIXED_PROFILE_NO_SEARCH" });
    const pending = copy(P04.hub_search);
    pending.source_profile = { ...pending.source_profile, state: "PENDING_SOURCE_CALLBACK", reason_code: null };
    expect(hubModeReadsAbsence(pending)).toMatchObject({
      state: "NOT_PUBLISHED",
      code: "PENDING_SOURCE_CALLBACK",
      sentence: "no search published — no fold read drawn",
    });
  });

  it("a run whose read names no declared mode keeps the frame and says not published, with the claim basis as its code", async () => {
    const shell = copy(P04.hub_search);
    shell.claim_row.mode_reference = null;
    shell.claim_row.basis = "NOT_PUBLISHED";
    const root = await mount(P04_RUN, { hub: shell, laneSearch: [200, P04.lane_search] });
    const row = root.querySelector("[data-mode-reads]") as HTMLElement;
    expect(row.getAttribute("data-mode-reads")).toBe("shell");
    expect(row.querySelector("[data-fold-strip='absent']")?.getAttribute("data-absence-state")).toBe("NOT_PUBLISHED");
    expect(row.querySelector("[data-fold-strip='absent']")?.getAttribute("data-absence-code")).toBe("NOT_PUBLISHED");
    expect(row.querySelector("[data-action='open-atlas-mode']")).toBeNull();
    expect(text(row, "[data-absence-word]")).toBe("not published");
  });
});

/* ------------------------------------------------ 6 · the pure derivation */

describe("G8 · the fold cells are the fold plan's, through the E1 helpers", () => {
  it("fold ids count from 1 in the label and stay the engine's in the data attribute", () => {
    const folds = SPLIT.fold_plan.folds.map(stripFoldOf);
    expect(folds.map((fold) => fold.label)).toEqual(SPLIT.fold_plan.folds.map((fold) => foldLabel(fold.fold_id)));
    expect(folds.map((fold) => fold.label)).toEqual(["fold_01", "fold_02"]);
    expect(folds.map((fold) => fold.foldId)).toEqual(["0", "1"]);
  });

  it("a window is published only when both ends are: half a window is none", () => {
    const fold = copy(SPLIT.fold_plan.folds[0]!);
    fold.train_start_utc_ms = null;
    const cells = stripFoldOf(fold);
    expect(cells.train).toEqual({ published: false, startUtcMs: null, endUtcMs: fold.train_end_utc_ms, bars: null });
    expect(cells.test.published).toBe(true);
    expect(foldReadsWords(cells, { state: "RETROSPECTIVE", use: "USED", condition: null })).toBe(
      `fold_01: train window not published; test ${formatUtc(fold.test_start_utc_ms)} to ${formatUtc(fold.test_end_utc_ms)}, 168 bars — retrospective`,
    );
  });

  it("the OOS words are the engine's five states, each with a sentence", () => {
    expect(Object.keys(OOS_READING_WORDS).sort()).toEqual(Object.keys(OOS_READING_NOTE).sort());
    expect(Object.keys(OOS_READING_WORDS).sort()).toEqual(["NOT_APPLICABLE", "REPORT_ONLY", "RETROSPECTIVE", "SELECTION_INPUT", "WITHHELD_UNTIL_S4"]);
  });
});
