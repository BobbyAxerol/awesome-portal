/**
 * P19 consumer tests — Screen 10 Attempt Lineage (S10-U01…).
 *
 * The claims that carry this phase:
 *
 *  - **One read, no validator.** The contract declares no ETag, so the screen
 *    sends one GET with `limit=128` and never a POST.
 *  - **Order and values are the server's.** Bands follow `alpha.versions`,
 *    chips and siblings follow `attempts`; diff chips are the server's array.
 *  - **No pick is made in the browser.** A promotion pick is PUBLISHED or a
 *    typed absence; GATES RESET is a disclosure chip that does nothing.
 *  - **Bounded means bounded.** PARTIAL coverage and bounded child runs say so;
 *    retries are never attempts; 100+ attempts render a window.
 *  - **Refusals are neutral.** 403 and 404 say the same F-04 sentence and
 *    take the same state and badge.
 *  - **No lineage, same frame.** Loading and every refusal keep all nine
 *    blocks in place, each loading or withheld, with no number in any of them.
 *  - **Hi-fi, as fixed by the owner (R1).** Four status filters derived from
 *    the contract, ACTIVE version first, chips that wrap, a rail of dots, the
 *    hi-fi's copy verbatim, and a probe toggle that is disabled with its reason.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DETAIL_HEIGHT,
  GATES_RESET,
  LINEAGE_PANELS,
  TREE_AIM,
  lineageSourceChip,
  onlyPickGap,
  LINEAGE_STATUSES,
  LINEAGE_TITLE,
  LineageLink,
  NOT_IN_CONTRACT,
  PICK_ABSENT,
  PROBES_REASON,
  PROMOTION_RULE,
  ROW_HEIGHT,
  VIRTUAL_THRESHOLD,
  bandOrder,
  counterText,
  lineageStatus,
  matchesLineageFilter,
  PROMOTION_RULE_TITLE,
  type LineageFilter,
  railWidth,
  treeOrder,
  windowRange,
} from "./LineageDetail";
import { LineageRoute } from "./LineageRoute";
import {
  LINEAGE_NEUTRAL_REFUSAL,
  LINEAGE_REFUSAL_COPY,
  lineageGaps,
  lineagePath,
  lineageState,
  toLineageRefusal,
  type Lineage,
  type LineageAttempt,
  type LineageVersion,
} from "./lineageClient";
import { forgetRunLabels, rememberRunLabel } from "./runLabels";
import { PortalApiError } from "../lib/api";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  /* D1: the run-label registry outlives a render, so one case seeding it
     must not decide what the next case sees. */
  forgetRunLabels();
});

/* ---------------------------------------------------------------- fixtures */

/*
 * Shape, keys, enums and reason codes from
 * `apps/control-api/src/research/lineage.contract.ts` and
 * `lineage.service.ts` (no canonical frontend fixture is published for P19 —
 * CG-P19-01).
 */
const ALPHA = "alpha-momentum";
const T0 = 1_785_000_000_000;
const MIN = 60_000;
const AVAILABLE = { state: "AVAILABLE", reason_code: null } as const;
const np = (reason: string) => ({ state: "NOT_PUBLISHED", reason_code: reason }) as const;
const hex = (c: string) => c.repeat(64);

const PICK_ABSENT_FACT = {
  state: "NOT_PUBLISHED",
  attempt_id: null,
  run_id: null,
  source_contract_rev: null,
  source_digest: null,
  source_as_of_utc_ms: null,
  availability: np("P19_SOURCE_DID_NOT_PUBLISH_PROMOTION_PICK"),
} as const;

function pickPublished(attempt: string, run: string) {
  return {
    state: "PUBLISHED",
    attempt_id: attempt,
    run_id: run,
    source_contract_rev: "governance.promotion.v1",
    source_digest: hex("9"),
    source_as_of_utc_ms: T0 + 90 * MIN,
    availability: AVAILABLE,
  } as const;
}

function version(id: string, label: string, state: LineageVersion["lifecycle_state"], pick: unknown = PICK_ABSENT_FACT): LineageVersion {
  return {
    alpha_version_id: id,
    label,
    code_digest: hex(label.endsWith("2") ? "a" : "b"),
    entrypoint: "alphas.momentum_btc:Alpha",
    lifecycle_state: state,
    registered_at_utc_ms: T0,
    promotion_pick: pick,
  } as unknown as LineageVersion;
}

const V1 = "alphaver_092";
const V2 = "alphaver_093";

function attempt(
  id: string,
  over: Partial<Record<keyof LineageAttempt, unknown>> & { minute?: number } = {},
): LineageAttempt {
  const { minute = 0, ...rest } = over;
  return {
    attempt_id: id,
    parent_attempt_id: null,
    parent_state: "ROOT",
    alpha_version_id: V1,
    alpha_version_label: "av_0_9_2",
    state: "READY",
    intent_kind: "NEW",
    relation_to_parent: null,
    reason: null,
    space_signature: hex("c"),
    created_at_utc_ms: T0 + minute * MIN,
    updated_at_utc_ms: T0 + (minute + 1) * MIN,
    primary_run: {
      run_id: `run_${id}`,
      state: "READY",
      effective_spec_digest: hex("d"),
      engine_release_id: "quantbt-1.1.1",
      dataset_binding_digest: hex("e"),
      technical_retry_count: 0,
    },
    child_runs: [],
    child_runs_coverage: { state: "COMPLETE", reason_code: null },
    semantic_diff: { state: "ROOT", changes: [], gates_reset: false, availability: AVAILABLE },
    exposure: {
      state: "NOT_PUBLISHED",
      count: 0,
      roles: [],
      latest_source_as_of_utc_ms: null,
      availability: np("P19_NO_EXPOSURE_FACT_PUBLISHED_FOR_ATTEMPT"),
    },
    ...rest,
  } as unknown as LineageAttempt;
}

const diffOf = (changes: LineageAttempt["semantic_diff"]["changes"], gates = false): LineageAttempt["semantic_diff"] => ({
  state: "AVAILABLE",
  changes,
  gates_reset: gates,
  availability: AVAILABLE,
});

/** The six-attempt story: two bands, a three-level tree, one of every treatment. */
function sixAttempts(): LineageAttempt[] {
  return [
    attempt("att_01", { minute: 0 }),
    attempt("att_02", {
      minute: 10,
      parent_attempt_id: "att_01",
      parent_state: "RETURNED",
      intent_kind: "CLONE_FOR_EXPERIMENT",
      semantic_diff: diffOf([
        { path: "optimization.effective_schedule", kind: "CONFIG", before: "global", after: "per_fold_decay" },
      ]),
    }),
    attempt("att_04", {
      minute: 20,
      parent_attempt_id: "att_02",
      parent_state: "RETURNED",
      state: "ABANDONED",
      reason: "decay unstable across seeds; kept for the record.",
      primary_run: { ...attempt("x").primary_run, run_id: "run_att_04", state: "CANCELLED" },
      semantic_diff: diffOf([{ path: "route_params", kind: "CONFIG", before: "window 12-72", after: "window 12-96" }]),
    }),
    attempt("att_03", {
      minute: 30,
      parent_attempt_id: "att_02",
      parent_state: "RETURNED",
      alpha_version_id: V2,
      alpha_version_label: "av_0_9_3",
      primary_run: { ...attempt("x").primary_run, run_id: "run_att_03", technical_retry_count: 3 },
      child_runs: [
        {
          run_id: "run_att_03_audit",
          run_kind: "AUDIT",
          relationship_kind: "AUDIT_OF_SELECTION",
          parent_run_id: "run_att_03",
          state: "READY",
          created_at_utc_ms: T0 + 40 * MIN,
        },
      ],
      semantic_diff: diffOf(
        [
          { path: "alpha_version", kind: "ALPHA_VERSION", before: "av_0_9_2", after: "av_0_9_3" },
          { path: "optimization.effective_schedule", kind: "CONFIG", before: "per_fold_decay", after: "per_fold_causal" },
          { path: "optimization.effective_trial_count", kind: "CONFIG", before: null, after: "64" },
        ],
        true,
      ),
      exposure: {
        state: "RECORDED",
        count: 2,
        roles: ["OUTER_OOS", "SELECTION_INPUT"],
        latest_source_as_of_utc_ms: T0 + 50 * MIN,
        availability: AVAILABLE,
      },
    }),
    attempt("att_05", {
      minute: 60,
      parent_attempt_id: "att_03",
      parent_state: "RETURNED",
      alpha_version_id: V2,
      alpha_version_label: "av_0_9_3",
      state: "FAILED",
      reason: "engine refused the effective spec",
      primary_run: { ...attempt("x").primary_run, run_id: "run_att_05", state: "FAILED" },
      semantic_diff: diffOf([{ path: "random_seed", kind: "CONFIG", before: "7", after: "11" }]),
    }),
    attempt("att_06", {
      minute: 70,
      parent_attempt_id: "att_03",
      parent_state: "RETURNED",
      alpha_version_id: V2,
      alpha_version_label: "av_0_9_3",
      state: "DRAFT",
      primary_run: {
        run_id: null,
        state: null,
        effective_spec_digest: null,
        engine_release_id: null,
        dataset_binding_digest: null,
        technical_retry_count: 0,
      },
      semantic_diff: diffOf([]),
    }),
  ];
}

function lineage(over: Partial<Record<keyof Lineage, unknown>> & { attempts?: LineageAttempt[] } = {}): Lineage {
  const attempts = over.attempts ?? sixAttempts();
  return {
    schema_version: "research.attempt-lineage.v1",
    read_authority: "PORTAL_PERSISTED_RESEARCH",
    alpha: {
      alpha_id: ALPHA,
      name: "alpha_momentum_btc",
      active_version_id: V2,
      active_version_state: "ACTIVE",
      active_version_availability: AVAILABLE,
      versions: [
        version(V1, "av_0_9_2", "SUPERSEDED", pickPublished("att_02", "run_att_02")),
        version(V2, "av_0_9_3", "ACTIVE", pickPublished("att_03", "run_att_03")),
      ],
    },
    attempts,
    counts: {
      total_attempts: attempts.length,
      returned_attempts: attempts.length,
      draft_attempts: attempts.filter((a) => a.state === "DRAFT").length,
      submitted_attempts: attempts.filter((a) => a.state !== "DRAFT").length,
      failed_attempts: attempts.filter((a) => a.state === "FAILED").length,
      abandoned_attempts: attempts.filter((a) => a.state === "ABANDONED").length,
      child_runs: 1,
      technical_retries: 3,
    },
    coverage: {
      state: "COMPLETE",
      reason_code: null,
      oldest_returned_created_at_utc_ms: attempts[0]?.created_at_utc_ms ?? null,
    },
    source_absences: { promotion_pick: AVAILABLE, historical_semantic_diff: AVAILABLE },
    as_of_utc_ms: T0 + 100 * MIN,
    ...over,
  } as unknown as Lineage;
}

/** 120 attempts over two bands, for the window. */
function manyAttempts(n = 120): LineageAttempt[] {
  const out: LineageAttempt[] = [];
  for (let i = 0; i < n; i += 1) {
    const id = `att_${String(i).padStart(3, "0")}`;
    const second = i >= n / 2;
    out.push(
      attempt(id, {
        minute: i,
        alpha_version_id: second ? V2 : V1,
        alpha_version_label: second ? "av_0_9_3" : "av_0_9_2",
        state: i % 7 === 3 ? "ABANDONED" : i % 11 === 5 ? "FAILED" : "READY",
      }),
    );
  }
  return out;
}

/* ------------------------------------------------------------------ server */

type Answer = { status: number; body: unknown };
type Call = { url: string; method: string; headers: Record<string, string>; credentials?: string };

function server(answers: Answer[] = [{ status: 200, body: lineage() }]) {
  const calls: Call[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    calls.push({
      url: String(input),
      method: (init?.method ?? "GET").toUpperCase(),
      headers: (init?.headers ?? {}) as Record<string, string>,
      credentials: init?.credentials,
    });
    const answer = answers.length > 1 ? answers.shift()! : answers[0];
    return new Response(JSON.stringify(answer.body), {
      status: answer.status,
      headers: { "content-type": "application/json" },
    });
  });
  return { calls };
}

const problem = (status: number, code: string): Answer => ({
  status,
  body: { error: { code, message: "server prose: alpha owned by alice@example" }, request_id: "req_p19" },
});

function LocationProbe() {
  const location = useLocation();
  return <output data-location>{`${location.pathname}${location.search}`}</output>;
}

function renderRoute(search = "", alphaId = ALPHA) {
  return render(
    <MemoryRouter initialEntries={[`/research/quantbt/alphas/${alphaId}/lineage${search}`]}>
      <Routes>
        <Route
          path="/research/quantbt/alphas/:alphaId/lineage"
          element={
            <>
              <LineageRoute />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const panel = (name: string) => document.querySelector(`[data-panel="${name}"]`) as HTMLElement;
const screenState = () => document.querySelector('[data-screen="attempt-lineage"]')?.getAttribute("data-lineage-state");
const node = (id: string) => document.querySelector(`[data-attempt="${id}"]`) as HTMLElement;
/** Cards are compact by default (hi-fi); run detail opens from the card's own button. */
const openNode = (...ids: string[]) => {
  for (const id of ids) fireEvent.click(node(id).querySelector("[data-row]") as HTMLElement);
};
const counter = () => document.querySelector("[data-counter]")?.textContent;
const locationText = () => document.querySelector("[data-location]")?.textContent ?? "";

/** The blocks in order when no lineage is in hand: the notice sits under the header. */
const PENDING_ORDER = ["header", "notice", ...LINEAGE_PANELS.slice(1)];

/** Every block keeps its place, says the state, and carries no lineage fact or digit. */
function expectPendingFrame(state: string) {
  const order = [...document.querySelectorAll("[data-panel]")].map((el) => el.getAttribute("data-panel"));
  expect(order).toEqual(PENDING_ORDER);
  for (const name of ["root", "filters", "tree", "selected", "diff", "counts"]) {
    expect(panel(name).getAttribute("data-panel-state"), name).toBe(state);
  }
  for (const name of LINEAGE_PANELS.filter((n) => n !== "header")) {
    expect(panel(name).textContent, name).not.toMatch(/\d/);
  }
  expect(document.querySelectorAll("[data-pending]").length).toBeGreaterThanOrEqual(6);
  expect(document.querySelector("[data-band]")).toBeNull();
  expect(document.querySelector("[data-attempt]")).toBeNull();
  expect(document.querySelector("[data-count]")).toBeNull();
  expect(document.querySelector("[data-counter]")).toBeNull();
  for (const button of panel("filters").querySelectorAll("button")) expect((button as HTMLButtonElement).disabled).toBe(true);
}

async function ready() {
  await waitFor(() => expect(document.querySelector('[data-panel="counts"]')).toBeTruthy());
  await waitFor(() => expect(document.querySelector('[data-panel="root"]')).toBeTruthy());
}

/* ------------------------------------------------------------------ screen */

describe("S10 Attempt Lineage — the screen", () => {
  it("S10-U01 shows the loading frame and the header before the server answers (no rules footer, VD-TEXT-01)", () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => {}));
    renderRoute();
    expect(screenState()).toBe("loading");
    expect(panel("header")).toBeTruthy();
    expect(document.querySelector('[data-panel="rules"]')).toBeNull();
    expect(document.body.textContent).not.toContain("rules of this screen");
    expectPendingFrame("loading");
    expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy();
    expect(screen.getByText(LINEAGE_TITLE)).toBeTruthy();
  });

  it("S10-U02 renders every block in the screen's order when the lineage is complete", async () => {
    server();
    renderRoute();
    await ready();
    expect(screenState()).toBe("available");
    const order = [...document.querySelectorAll("[data-panel]")].map((el) => el.getAttribute("data-panel"));
    expect(order).toEqual([...LINEAGE_PANELS]);
  });

  it("S10-U03 sends exactly one same-origin GET with limit=128, no validator and no POST", async () => {
    const { calls } = server();
    renderRoute();
    await ready();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`/api/v1/research/alphas/${ALPHA}/lineage?limit=128`);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].credentials).toBe("same-origin");
    expect(Object.keys(calls[0].headers)).not.toContain("If-None-Match");
    expect(lineagePath(ALPHA, { workspaceId: "ws_1", limit: 5 })).toBe(`/api/v1/research/alphas/${ALPHA}/lineage?workspace_id=ws_1&limit=5`);
  });

  it("S10-U04 renders one band per version in the server's order, with lifecycle, digest and entrypoint", async () => {
    const reversed = lineage();
    reversed.alpha.versions = [...reversed.alpha.versions].reverse();
    server([{ status: 200, body: reversed }]);
    renderRoute();
    await ready();
    const bands = [...document.querySelectorAll("[data-band]")];
    expect(bands.map((b) => b.getAttribute("data-band-label"))).toEqual(["av_0_9_3", "av_0_9_2"]);
    expect(bands.map((b) => b.getAttribute("data-state"))).toEqual(["ACTIVE", "SUPERSEDED"]);
    expect(within(bands[0] as HTMLElement).getByText("alphas.momentum_btc:Alpha")).toBeTruthy();
    expect(bands[0].querySelector("[data-code-digest]")?.getAttribute("title")).toBe(hex("b"));
    expect(within(bands[0] as HTMLElement).getByText("import new version →")).toBeTruthy();
    expect(within(bands[1] as HTMLElement).queryByText("import new version →")).toBeNull();
  });

  it("S10-U05 lists each band's attempt chips in server order as buttons labelled 'attempt {id} — {STATUS}'", async () => {
    server();
    renderRoute();
    await ready();
    const v1 = document.querySelector('[data-band="alphaver_092"]') as HTMLElement;
    const v2 = document.querySelector('[data-band="alphaver_093"]') as HTMLElement;
    expect([...v1.querySelectorAll("[data-chip]")].map((c) => c.getAttribute("data-chip"))).toEqual(["att_01", "att_02", "att_04"]);
    expect([...v2.querySelectorAll("[data-chip]")].map((c) => c.getAttribute("data-chip"))).toEqual(["att_03", "att_05", "att_06"]);
    expect(screen.getByRole("button", { name: "attempt att_04 — ABANDONED" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "attempt att_05 — FAILED" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "attempt att_06 — DRAFT" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "attempt att_01 — READY" })).toBeTruthy();
  });

  it("S10-U06 keeps the server's chronological order and gives each node its depth under its returned parent", async () => {
    server();
    renderRoute();
    await ready();
    const rows = [...document.querySelectorAll("[data-tree-scroll] [data-attempt]")];
    expect(rows.map((r) => [r.getAttribute("data-attempt"), r.getAttribute("data-depth")])).toEqual([
      ["att_01", "0"],
      ["att_02", "1"],
      ["att_04", "2"],
      ["att_03", "2"],
      ["att_05", "3"],
      ["att_06", "3"],
    ]);
  });

  it("S10-U07 shows a node whose parent is outside the returned graph at depth 0 with its typed diff absence", async () => {
    const attempts = sixAttempts();
    attempts[0] = attempt("att_01", {
      parent_attempt_id: "att_00",
      parent_state: "OUTSIDE_RETURNED_GRAPH",
      semantic_diff: {
        state: "PARENT_OUTSIDE_RETURNED_GRAPH",
        changes: [],
        gates_reset: false,
        availability: { state: "PARTIAL", reason_code: "P19_PARENT_OUTSIDE_BOUNDED_GRAPH" },
      },
    });
    server([{ status: 200, body: lineage({ attempts }) }]);
    renderRoute();
    await ready();
    const row = node("att_01");
    expect(row.getAttribute("data-depth")).toBe("0");
    expect(within(row).getByText("parent outside returned graph")).toBeTruthy();
    expect(within(row).getAllByText("P19_PARENT_OUTSIDE_BOUNDED_GRAPH").length).toBeGreaterThan(0);
  });

  it("S10-U08 renders diff chips exactly from the server's array, a missing side as 'not set'", async () => {
    server();
    renderRoute();
    await ready();
    const chips = [...node("att_03").querySelectorAll(".ln-diffs [data-diff]")];
    expect(chips.map((c) => c.getAttribute("data-diff"))).toEqual([
      "optimization.effective_schedule",
      "optimization.effective_trial_count",
    ]);
    expect(chips[0].textContent).toBe("optimization.effective_schedule: per_fold_decay → per_fold_causal");
    expect(chips[1].textContent).toBe("optimization.effective_trial_count: not set → 64");
  });

  it("S10-U09 keeps the version change in its own red GATES RESET chip, never among the ordinary diffs", async () => {
    server();
    renderRoute();
    await ready();
    const gates = node("att_03").querySelectorAll('[data-gates="true"]');
    expect(gates).toHaveLength(1);
    expect(gates[0].tagName).toBe("SPAN");
    expect(gates[0].textContent).toBe(`alpha_version: av_0_9_2 → av_0_9_3 · ${GATES_RESET}`);
    expect(node("att_03").querySelector('.ln-diffs [data-diff-kind="ALPHA_VERSION"]')).toBeNull();
    expect(node("att_02").querySelector('[data-gates="true"]')).toBeNull();
  });

  it("S10-U10 clicking GATES RESET sends nothing and changes nothing", async () => {
    const { calls } = server();
    renderRoute();
    await ready();
    const before = { calls: calls.length, selected: panel("selected").getAttribute("data-selected-attempt"), url: locationText() };
    const chip = node("att_03").querySelector('[data-gates="true"]') as HTMLElement;
    fireEvent.click(chip);
    fireEvent.keyDown(chip, { key: "Enter" });
    await act(async () => {});
    expect(calls.length).toBe(before.calls);
    expect(calls.every((c) => c.method === "GET")).toBe(true);
    expect(panel("selected").getAttribute("data-selected-attempt")).toBe(before.selected);
    expect(locationText()).toBe(before.url);
    expect(chip.getAttribute("role")).toBeNull();
    expect(chip.getAttribute("tabindex")).toBeNull();
  });

  it("S10-U11 discloses gates_reset even when the diff itself was not published", async () => {
    const attempts = sixAttempts();
    attempts[3] = {
      ...attempts[3],
      semantic_diff: {
        state: "NOT_PUBLISHED",
        changes: [],
        gates_reset: true,
        availability: np("P19_PERSISTED_PREFLIGHT_MANIFEST_NOT_AVAILABLE_FOR_PARENT_DIFF"),
      },
    };
    server([{ status: 200, body: lineage({ attempts }) }]);
    renderRoute();
    await ready();
    const row = node("att_03");
    expect(row.querySelector('[data-gates="true"]')?.textContent).toBe(`alpha version changed · ${GATES_RESET}`);
    expect(within(row).getByText("P19_PERSISTED_PREFLIGHT_MANIFEST_NOT_AVAILABLE_FOR_PARENT_DIFF")).toBeTruthy();
  });

  it("S10-U12 keeps an abandoned attempt visible, dimmed, with its reason — or says the reason was not published", async () => {
    const attempts = sixAttempts();
    attempts.push(attempt("att_07", { minute: 80, state: "ABANDONED", reason: null }));
    server([{ status: 200, body: lineage({ attempts }) }]);
    renderRoute();
    await ready();
    expect(node("att_04").getAttribute("data-status")).toBe("ABANDONED");
    expect(within(node("att_04")).getByText("abandoned — decay unstable across seeds; kept for the record.")).toBeTruthy();
    expect(within(node("att_07")).getByText("abandoned — reason not published")).toBeTruthy();
    const css = document.querySelector("style")?.textContent ?? "";
    /* Hi-fi card opacity .82 for SUPERSEDED and ABANDONED (spec §9.2 says .72 for ABANDONED; the hi-fi wins). */
    expect(css).toContain('.ln-node[data-status="ABANDONED"] .ln-card');
    expect(css).toMatch(/\.ln-node\[data-status="ABANDONED"\] \.ln-row \{ opacity: \.82; \}/);
  });

  it("S10-U13 shows a failed attempt with the reason the server returned", async () => {
    server();
    renderRoute();
    await ready();
    expect(node("att_05").getAttribute("data-state")).toBe("FAILED");
    expect(within(node("att_05")).getByText("failed — engine refused the effective spec")).toBeTruthy();
  });

  it("S10-U14 lists child runs by the relationship the server declared, and says when they are bounded", async () => {
    const attempts = sixAttempts();
    attempts[0] = { ...attempts[0], child_runs_coverage: { state: "PARTIAL", reason_code: "P19_CHILD_RUNS_BOUNDED_PER_ATTEMPT" } };
    server([{ status: 200, body: lineage({ attempts }) }]);
    renderRoute();
    await ready();
    expect(node("att_03").querySelector("[data-detail]")).toBeNull();
    openNode("att_03", "att_01");
    const child = node("att_03").querySelector('[data-child-run="run_att_03_audit"]');
    expect(child?.getAttribute("data-relationship")).toBe("AUDIT_OF_SELECTION");
    expect(child?.textContent).toContain("AUDIT_OF_SELECTION · AUDIT · run_att_03_audit · READY");
    expect(node("att_01").querySelector("[data-child-runs-partial]")?.textContent).toBe(
      "+ more child runs not returned (P19_CHILD_RUNS_BOUNDED_PER_ATTEMPT)",
    );
    expect(screenState()).toBe("partial");
  });

  it("W5a · P19 names a what-if fork 'sibling of' its parent, never 'parent'", async () => {
    const attempts = sixAttempts();
    attempts[1] = { ...attempts[1], relation_to_parent: "SIBLING_OF" };
    server([{ status: 200, body: lineage({ attempts }) }]);
    renderRoute();
    await ready();
    openNode("att_02", "att_03");
    const sibling = node("att_02").querySelector("[data-parent-line]") as HTMLElement;
    expect(sibling.getAttribute("data-relation")).toBe("SIBLING_OF");
    expect(sibling.textContent).toBe("sibling of att_01 — a what-if fork with its own config_hash");
    const plain = node("att_03").querySelector("[data-parent-line]") as HTMLElement;
    expect(plain.getAttribute("data-relation")).toBe("");
    expect(plain.textContent).toBe("parent att_02");
  });

  it("S10-U15 shows technical retries as a secondary fact that never becomes an attempt", async () => {
    server();
    renderRoute();
    await ready();
    openNode("att_03");
    expect(node("att_03").querySelector("[data-technical-retries]")?.textContent).toBe("technical retries: 3 (not attempts)");
    expect(document.querySelectorAll("[data-tree-scroll] [data-attempt]")).toHaveLength(6);
    expect(document.querySelectorAll("[data-chip]")).toHaveLength(6);
    expect(counter()).toBe("showing 6 of 6 attempts");
  });

  it("S10-U16 renders a published promotion pick with its source, linking only to returned identities", async () => {
    server();
    renderRoute();
    await ready();
    const pick = document.querySelector('[data-pick-version="alphaver_093"][data-pick-state="PUBLISHED"]') as HTMLElement;
    expect(pick.getAttribute("data-pick-attempt")).toBe("att_03");
    expect(pick.querySelector("[data-pick-run]")?.getAttribute("href")).toBe("/research/quantbt/runs/run_att_03/evidence");
    expect(pick.querySelector("[data-pick-source]")?.textContent).toContain("governance.promotion.v1");
    expect(pick.querySelector("[data-pick-source]")?.textContent).toContain("as of 2026-07-25");
    /* Hi-fi line "att · run · … → rc_": W5c — the pick's run opens Screen 11 (P21). */
    /* CG-FG-S10-01: the approval's source digest (hex 9…) is no longer printed in the param-set slot; this body serves no trial / param set, so both slots are typed absences. */
    expect(pick.querySelector(".v")?.textContent).toBe("att_03 · run_att_03 · trial — not published · param set — not published → rc_");
    expect(pick.querySelector(".v")?.textContent).not.toContain(hex("9").slice(0, 8));
    const rc = pick.querySelector("[data-pick-rc]") as HTMLElement;
    expect(rc.tagName).toBe("A");
    expect(rc.getAttribute("href")).toBe("/research/quantbt/runs/run_att_03/release-candidate");
    /* The pick row sits where the hi-fi puts it: last in the root card, after "untried". */
    expect(panel("root").lastElementChild).toBe(pick);
    /* The superseded version's own published pick is not hidden: its row names it. */
    expect(document.querySelector('[data-band="alphaver_092"] [data-band-pick]')?.textContent).toBe("promotion pick att_02");
  });

  it("S10-U17 keeps a missing promotion pick as a typed source gap and picks nothing", async () => {
    const body = lineage();
    body.alpha.versions = body.alpha.versions.map((v) => ({ ...v, promotion_pick: PICK_ABSENT_FACT })) as unknown as LineageVersion[];
    body.source_absences = { ...body.source_absences, promotion_pick: np("P19_SOURCE_DID_NOT_PUBLISH_PROMOTION_PICK") };
    server([{ status: 200, body }]);
    renderRoute();
    await ready();
    const gaps = document.querySelectorAll('[data-pick-state="NOT_PUBLISHED"]');
    expect(gaps).toHaveLength(1);
    expect(gaps[0].getAttribute("data-pick-version")).toBe("alphaver_093");
    expect(gaps[0].textContent).toContain("PROMOTION PICK");
    expect(gaps[0].textContent).toContain(PICK_ABSENT);
    expect(gaps[0].textContent).toContain("P19_SOURCE_DID_NOT_PUBLISH_PROMOTION_PICK");
    expect(panel("root").lastElementChild).toBe(gaps[0]);
    expect(document.querySelector("[data-pick-attempt]")).toBeNull();
    expect(screenState()).toBe("partial");
    /* D8 (10-8): the pick card says it; no screen-level PARTIAL notice repeats it above the tree. */
    expect(document.querySelector('[data-panel="notice"]')).toBeNull();
    /* D8 (10-5): with no published pick the hi-fi's verdict line stands in the rule, on no attempt. */
    expect(panel("promotion-rule").querySelector('[data-tree-aim="rule"]')?.textContent).toBe(TREE_AIM);
    expect(document.querySelector('[data-tree-aim="picked"]')).toBeNull();
  });

  it("S10-U18 shows recorded exposure with its roles, and an unpublished one as a typed absence", async () => {
    server();
    renderRoute();
    await ready();
    openNode("att_03", "att_01");
    expect(node("att_03").querySelector('[data-exposure="RECORDED"]')?.textContent).toBe(
      "exposure recorded · 2 · OUTER_OOS · SELECTION_INPUT · latest 2026-07-25 18:10Z",
    );
    const absent = node("att_01").querySelector('[data-exposure="NOT_PUBLISHED"]') as HTMLElement;
    expect(within(absent).getByText("P19_NO_EXPOSURE_FACT_PUBLISHED_FOR_ATTEMPT")).toBeTruthy();
    expect(absent.textContent).not.toMatch(/\b0\b/);
  });

  it("S10-U19 says a bounded history is bounded and never calls the returned prefix complete", async () => {
    const attempts = sixAttempts().slice(0, 3);
    const body = lineage({ attempts });
    body.counts = { ...body.counts, total_attempts: 200, returned_attempts: 3 };
    body.coverage = { state: "PARTIAL", reason_code: "P19_BOUNDED_GRAPH_LIMIT_REACHED", oldest_returned_created_at_utc_ms: T0 } as unknown as Lineage["coverage"];
    server([{ status: 200, body }]);
    renderRoute();
    await ready();
    expect(screenState()).toBe("partial");
    /* A gap other than the pick still raises the screen notice (D8 drops only the duplicate). */
    expect(document.querySelector('[data-panel="notice"]')?.getAttribute("data-lineage-notice")).toBe("partial");
    const bound = document.querySelector("[data-bounded]") as HTMLElement;
    expect(bound.textContent).toContain("3 of 200 attempts were returned");
    expect(bound.textContent).toContain("P19_BOUNDED_GRAPH_LIMIT_REACHED");
    expect(counter()).toBe("showing 3 of 3 attempts · 200 on record");
    expect(document.querySelector('[data-coverage-line="PARTIAL"]')?.textContent).toContain("oldest returned 2026-07-25 17:20Z");
  });

  it("S10-U20 has the hi-fi's four filter chips and reconciles the counter with all sixteen combinations", async () => {
    server();
    renderRoute();
    await ready();
    const chips = [...document.querySelectorAll("[data-filter]")] as HTMLButtonElement[];
    expect(chips.map((c) => [c.getAttribute("data-filter"), c.textContent, c.getAttribute("aria-pressed")])).toEqual([
      ["ACTIVE", "version active", "false"],
      ["DRAFT", "draft", "false"],
      ["SUPERSEDED", "version superseded", "false"],
      ["ABANDONED", "version abandoned", "false"],
    ]);
    /* Filter buckets (VD-F1-02, see matchesLineageFilter): version filters match the band lifecycle — att_01/02/04 in SUPERSEDED av_0_9_2 ·
       att_03, att_05 and att_06 in ACTIVE av_0_9_3 — and att_06, a DRAFT attempt, also matches "draft". */
    const statusOf: Record<string, LineageFilter[]> = {
      att_01: ["SUPERSEDED"],
      att_02: ["SUPERSEDED"],
      att_04: ["SUPERSEDED"],
      att_03: ["ACTIVE"],
      att_05: ["ACTIVE"],
      att_06: ["ACTIVE", "DRAFT"],
    };
    const order = ["att_01", "att_02", "att_04", "att_03", "att_05", "att_06"];
    const chip = (key: string) => document.querySelector(`[data-filter="${key}"]`) as HTMLElement;
    let on = new Set<LineageFilter>();
    for (let mask = 0; mask < 16; mask += 1) {
      const want = new Set(LINEAGE_STATUSES.filter((_, i) => mask & (1 << i)));
      for (const status of LINEAGE_STATUSES) {
        if (want.has(status) !== on.has(status)) fireEvent.click(chip(status));
      }
      on = want;
      const expected = order.filter((id) => want.size === 0 || statusOf[id]!.some((filter) => want.has(filter)));
      const rows = [...document.querySelectorAll("[data-tree-scroll] [data-attempt]")].map((r) => r.getAttribute("data-attempt"));
      expect(rows, `mask ${mask}`).toEqual(expected);
      expect(counter(), `mask ${mask}`).toBe(counterText(expected.length, 6, 6));
      for (const status of LINEAGE_STATUSES) expect(chip(status).getAttribute("aria-pressed")).toBe(String(want.has(status)));
    }
    /* VD-F1-02: the "version active" filter matches the band lifecycle, so the FAILED attempt stays in it, and its node chip says FAILED (its own state). */
    for (const status of ["DRAFT", "SUPERSEDED", "ABANDONED"]) fireEvent.click(chip(status));
    expect(counter()).toBe("showing 3 of 6 attempts");
    expect(node("att_05").querySelector(".ln-st")?.textContent).toBe("FAILED");
  });

  it("S10-U21 a band chip selects its attempt, widens a filter that hid it, and opens it in the tree", async () => {
    server();
    renderRoute();
    await ready();
    fireEvent.click(document.querySelector('[data-filter="DRAFT"]') as HTMLElement);
    expect(node("att_04")).toBeNull();
    const chip = screen.getByRole("button", { name: "attempt att_04 — ABANDONED" });
    chip.focus();
    fireEvent.click(chip);
    expect(node("att_04")).toBeTruthy();
    expect(node("att_04").getAttribute("data-selected")).toBe("true");
    expect(node("att_04").querySelector("[data-row]")?.getAttribute("aria-expanded")).toBe("true");
    expect(counter()).toBe("showing 6 of 6 attempts");
    expect(chip.getAttribute("aria-current")).toBe("true");
    expect(document.activeElement).toBe(chip);
  });

  it("S10-U22 selecting a node fills the selected-attempt panel and the diff table from its own fields", async () => {
    server();
    renderRoute();
    await ready();
    fireEvent.click(node("att_03").querySelector("[data-row]") as HTMLElement);
    const selected = panel("selected");
    expect(selected.getAttribute("data-selected-attempt")).toBe("att_03");
    expect(selected.querySelector('[data-row-key="parent"]')?.textContent).toBe("att_02");
    expect(selected.querySelector('[data-row-key="engine release"]')?.textContent).toBe("quantbt-1.1.1");
    expect(selected.querySelector('[data-row-key="technical retries"]')?.textContent).toBe("3 (not attempts)");
    expect(within(selected).getByText("open evidence →").getAttribute("href")).toBe("/research/quantbt/runs/run_att_03/evidence");
    expect(within(selected).getByText("run report").getAttribute("href")).toBe("/research/quantbt/runs/run_att_03/report");
    const diff = panel("diff");
    expect([...diff.querySelectorAll("[data-diff-row]")].map((r) => r.getAttribute("data-diff-row"))).toEqual([
      "alpha_version",
      "optimization.effective_schedule",
      "optimization.effective_trial_count",
    ]);
    expect(diff.querySelector('[data-diff-row="alpha_version"]')?.getAttribute("data-gates")).toBe("true");
    expect(locationText()).toBe(`/research/quantbt/alphas/${ALPHA}/lineage?attempt=att_03`);
  });

  it("S10-U23 a draft attempt without a run offers no evidence link and names the absent run facts", async () => {
    server();
    renderRoute();
    await ready();
    fireEvent.click(node("att_06").querySelector("[data-row]") as HTMLElement);
    const selected = panel("selected");
    expect(selected.querySelector('[data-row-key="primary run"]')?.textContent).toBe("no primary run recorded");
    expect(selected.querySelector('[data-row-key="engine release"]')?.textContent).toBe("not published");
    expect(within(selected).queryByText("open evidence →")).toBeNull();
    expect(panel("diff").textContent).toContain("No allow-listed key changed from the parent.");
  });

  it("S10-U24 ?av= opens that band and selects its first attempt", async () => {
    server();
    renderRoute("?av=av_0_9_3");
    await ready();
    expect(document.querySelector('[data-band="alphaver_093"]')?.getAttribute("data-selected")).toBe("true");
    expect(document.querySelector('[data-band="alphaver_092"]')?.getAttribute("data-selected")).toBe("false");
    expect(panel("selected").getAttribute("data-selected-attempt")).toBe("att_03");
  });

  it("S10-U25 ?attempt= selects that attempt; an unknown one falls back to the first returned", async () => {
    server();
    renderRoute("?attempt=att_05");
    await ready();
    expect(panel("selected").getAttribute("data-selected-attempt")).toBe("att_05");
    cleanup();
    vi.restoreAllMocks();
    server();
    renderRoute("?attempt=att_99");
    await ready();
    expect(panel("selected").getAttribute("data-selected-attempt")).toBe("att_01");
  });

  it("S10-U26 renders the short promotion rule (rest in its tooltip), no rules footer, and the counts strip", async () => {
    server();
    renderRoute();
    await ready();
    expect(document.querySelector('[data-panel="rules"]')).toBeNull();
    expect(panel("promotion-rule").querySelector("p")?.textContent).toBe(PROMOTION_RULE);
    expect(panel("promotion-rule").querySelector("p")?.getAttribute("title")).toBe(PROMOTION_RULE_TITLE);
    const counts = [...panel("counts").querySelectorAll("[data-count]")].map((c) => [c.getAttribute("data-count"), c.querySelector(".n")?.textContent ?? null]);
    /* A pre-1.1 server has no storied/probe split: those two say so, never 0. */
    expect(counts).toEqual([
      ["total_attempts", "6"],
      ["returned_attempts", "6"],
      ["draft_attempts", "1"],
      ["submitted_attempts", "5"],
      ["failed_attempts", "1"],
      ["abandoned_attempts", "1"],
      ["child_runs", "1"],
      ["technical_retries", "3"],
      ["storied_returned", null],
      ["probe_returned", null],
    ]);
    expect(panel("counts").querySelector('[data-count="probe_returned"]')?.textContent).toContain("not published");
    expect(panel("header").querySelector("[data-subtitle]")).toBeNull();
    expect(panel("counts").querySelector("[data-read-authority]")?.textContent).toContain("PORTAL_PERSISTED_RESEARCH");
    expect(panel("header").querySelector("[data-source-chip]")?.getAttribute("title")).toContain("PORTAL_PERSISTED_RESEARCH");
  });

  it("S10-U27 a server older than contract 1.1.0 leaves every W6b cell a typed absence, never an invented value", async () => {
    server();
    renderRoute();
    await ready();
    const root = panel("root");
    /* outcome ×2 bands, exercised ×2 bands, untried ×1 — each names the missing contract, not a guess. */
    expect(within(root).getAllByText("P19_SERVER_PREDATES_LINEAGE_CONTRACT_1_1").length).toBeGreaterThanOrEqual(5);
    expect(root.querySelectorAll("[data-outcome] [data-absent=outcome]")).toHaveLength(2);
    expect(root.querySelectorAll('[data-exercised="NOT_PUBLISHED"]')).toHaveLength(2);
    expect(root.querySelector('[data-untried="NOT_PUBLISHED"]')).toBeTruthy();
    expect(NOT_IN_CONTRACT).toBe("not a field of the lineage contract");
    /* W5c: the active version's published pick names a run, so "rc & publish →" opens Screen 11 for it. */
    const rc = root.querySelector('[data-action="release-candidate"]') as HTMLElement;
    expect(rc.tagName).toBe("A");
    expect(rc.getAttribute("href")).toBe("/research/quantbt/runs/run_att_03/release-candidate");
    expect(root.querySelector('[data-action-unrouted="release-candidate"]')).toBeNull();
    expect(root.querySelector('[data-action="runs"]')?.getAttribute("href")).toBe(`/research/quantbt/runs?group=1&alpha=${ALPHA}`);
    expect(root.querySelector('[data-action="declare-at-new-run"]')?.getAttribute("href")).toBe("/research/quantbt/runs/new");
    for (const key of ["OOS sharpe", "decay", "cert"]) {
      expect(panel("selected").querySelector(`[data-row-key="${key}"]`)?.textContent, key).toMatch(/not published/);
      expect(panel("selected").querySelector(`[data-row-key="${key}"]`)?.textContent, key).not.toMatch(/\b0\b/);
    }
    expect(panel("selected").querySelector("[data-verdict] [data-absent=verdict]")).toBeTruthy();
    expect(node("att_01").querySelector("[data-cert-absent]")?.textContent).toBe("cert not published");
  });

  it("S10-U28 an alpha with no attempt is empty, keeps its bands, and still reconciles the counter", async () => {
    const body = lineage({ attempts: [] });
    body.counts = { ...body.counts, child_runs: 0, technical_retries: 0 };
    server([{ status: 200, body }]);
    renderRoute();
    await ready();
    expect(screenState()).toBe("empty");
    expect(document.querySelectorAll("[data-band]")).toHaveLength(2);
    expect(document.querySelectorAll("[data-band-empty]")).toHaveLength(2);
    expect(document.querySelector("[data-tree-empty]")?.textContent).toBe("No attempt is recorded for this alpha yet.");
    expect(counter()).toBe("showing 0 of 0 attempts");
    expect(panel("selected").textContent).toContain("No attempt selected");
  });
});

describe("S10 Attempt Lineage — refusals", () => {
  it("S10-U29 a 400 is terminal: fixed copy, no retry, no content", async () => {
    server([problem(400, "RESEARCH_LINEAGE_INVALID")]);
    renderRoute();
    await screen.findByText(LINEAGE_REFUSAL_COPY[400]);
    expect(screenState()).toBe("terminal");
    expectPendingFrame("terminal");
    expect(document.querySelector('[data-action="retry"]')).toBeNull();
  });

  it("S10-U30 a 401 is denied and is not retried", async () => {
    const { calls } = server([{ status: 401, body: { error: { code: "UNAUTHORIZED", message: "Invalid session." } } }]);
    renderRoute();
    await screen.findByText(LINEAGE_REFUSAL_COPY[401]);
    expect(screenState()).toBe("denied");
    expectPendingFrame("denied");
    expect(document.querySelector('[data-action="retry"]')).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("S10-U31 403 and 404 say the same neutral F-04 sentence, take the same state and badge, never echo the server's prose", async () => {
    const seen: string[][] = [];
    for (const [status, code] of [
      [403, "RESEARCH_LINEAGE_FORBIDDEN"],
      [404, "RESEARCH_LINEAGE_NOT_FOUND"],
    ] as const) {
      server([problem(status, code)]);
      renderRoute();
      await screen.findByText(LINEAGE_NEUTRAL_REFUSAL);
      expect(document.body.textContent).not.toContain("alice@example");
      expect(document.body.textContent).not.toContain("alpha_momentum_btc");
      expect(document.querySelector("[data-request-id]")?.textContent).toBe("request req_p19");
      const badge = panel("notice").querySelector("[data-research-state]") as HTMLElement;
      seen.push([
        String(screenState()),
        String(panel("notice").getAttribute("data-lineage-notice")),
        String(badge.getAttribute("data-research-state")),
        String(badge.textContent),
      ]);
      expectPendingFrame("denied");
      cleanup();
      vi.restoreAllMocks();
    }
    expect(seen[0][0]).toBe("denied");
    expect(seen[1]).toEqual(seen[0]);
    expect(LINEAGE_REFUSAL_COPY[403]).toBe(LINEAGE_REFUSAL_COPY[404]);
  });

  it("S10-U32 a 503 is unavailable and one explicit retry reads again", async () => {
    const { calls } = server([problem(503, "RESEARCH_LINEAGE_UNAVAILABLE"), { status: 200, body: lineage() }]);
    renderRoute();
    await screen.findByText(LINEAGE_REFUSAL_COPY[503]);
    expect(screenState()).toBe("unavailable");
    expectPendingFrame("unavailable");
    fireEvent.click(document.querySelector('[data-action="retry"]') as HTMLElement);
    await ready();
    expect(calls).toHaveLength(2);
    expect(screenState()).toBe("available");
  });

  it("S10-U33 maps every refusal to its state, retry rule and copy", () => {
    const table = [400, 401, 403, 404, 503, 500].map((status) => {
      const r = toLineageRefusal(new PortalApiError("x", status, "C", "req"));
      return [status, r.state, r.mayRetry, r.terminal];
    });
    expect(table).toEqual([
      [400, "terminal", false, true],
      [401, "denied", false, true],
      [403, "denied", false, true],
      [404, "denied", false, true],
      [503, "unavailable", true, false],
      [500, "unavailable", true, false],
    ]);
    const network = toLineageRefusal(new TypeError("offline"));
    expect([network.state, network.mayRetry, network.message]).toEqual(["failed-retryable", true, LINEAGE_REFUSAL_COPY.network]);
    expect(toLineageRefusal(new PortalApiError("x", 500, null, null)).message).toBe(LINEAGE_REFUSAL_COPY.other);
  });
});

describe("S10 Attempt Lineage — scale and pure parts", () => {
  it("S10-U34 renders only a window of a 120-attempt lineage and moves it with the container's scrollTop", async () => {
    const attempts = manyAttempts();
    server([{ status: 200, body: lineage({ attempts }) }]);
    renderRoute();
    await ready();
    const scroller = document.querySelector("[data-tree-scroll]") as HTMLElement;
    expect(scroller.getAttribute("data-virtual")).toBe("true");
    const rendered = () => [...scroller.querySelectorAll("[data-attempt]")].map((r) => r.getAttribute("data-attempt"));
    expect(rendered().length).toBeGreaterThan(0);
    expect(rendered().length).toBeLessThan(40);
    expect(rendered()).not.toContain("att_080");
    expect(counter()).toBe("showing 120 of 120 attempts");
    expect(document.querySelectorAll("[data-chip]")).toHaveLength(120);
    scroller.scrollTop = 80 * ROW_HEIGHT;
    fireEvent.scroll(scroller);
    expect(rendered()).toContain("att_080");
    expect(rendered()).not.toContain("att_000");
    expect(scroller.querySelector("[data-virtual-spacer]")?.getAttribute("data-virtual-spacer")).toBe(String(120 * ROW_HEIGHT));
  });

  it("S10-U35 expanding a windowed row keeps the selection and the focus and grows the spacer by one detail box", async () => {
    server([{ status: 200, body: lineage({ attempts: manyAttempts() }) }]);
    renderRoute();
    await ready();
    const button = node("att_002").querySelector("[data-row]") as HTMLButtonElement;
    expect(button.getAttribute("aria-expanded")).toBe("false");
    button.focus();
    fireEvent.click(button);
    const again = node("att_002").querySelector("[data-row]") as HTMLButtonElement;
    expect(again.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(again);
    expect(node("att_002").getAttribute("data-selected")).toBe("true");
    expect(node("att_002").querySelector("[data-detail]")).toBeTruthy();
    expect(document.querySelector("[data-virtual-spacer]")?.getAttribute("data-virtual-spacer")).toBe(
      String(120 * ROW_HEIGHT + DETAIL_HEIGHT),
    );
    expect(node("att_003").parentElement?.style.top).toBe(`${3 * ROW_HEIGHT + DETAIL_HEIGHT}px`);
  });

  it("S10-U36 ?av= on a windowed lineage scrolls the tree container (not the element) to the band's first attempt", async () => {
    server([{ status: 200, body: lineage({ attempts: manyAttempts() }) }]);
    renderRoute("?av=av_0_9_3");
    await ready();
    const scroller = document.querySelector("[data-tree-scroll]") as HTMLElement;
    await waitFor(() => expect(scroller.scrollTop).toBe(60 * ROW_HEIGHT));
    expect(panel("selected").getAttribute("data-selected-attempt")).toBe("att_060");
    expect(node("att_060")).toBeTruthy();
  });

  it("S10-U37 a band chip on a windowed lineage brings its attempt into the window", async () => {
    server([{ status: 200, body: lineage({ attempts: manyAttempts() }) }]);
    renderRoute();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "attempt att_100 — READY" }));
    const scroller = document.querySelector("[data-tree-scroll]") as HTMLElement;
    await waitFor(() => expect(scroller.scrollTop).toBe(100 * ROW_HEIGHT));
    expect(node("att_100")?.getAttribute("data-selected")).toBe("true");
    expect(node("att_100").querySelector("[data-row]")?.getAttribute("aria-expanded")).toBe("true");
  });

  it("S10-U38 windowRange covers the viewport plus overscan and nothing else", () => {
    const heights = Array.from({ length: 100 }, () => ROW_HEIGHT);
    const top = windowRange(heights, 0, 340, 2);
    expect([top.start, top.end, top.total]).toEqual([0, 12, 3400]);
    const mid = windowRange(heights, 34 * 50, 340, 2);
    expect([mid.start, mid.end]).toEqual([48, 62]);
    const end = windowRange(heights, 3400, 340, 2);
    expect(end.end).toBe(100);
    expect(VIRTUAL_THRESHOLD).toBe(40);
  });

  it("S10-U39 treeOrder nests each child under its own parent, keeping the server's order among siblings and roots", () => {
    const a = attempt("b_root", { minute: 5 });
    const b = attempt("a_child", { minute: 6, parent_attempt_id: "b_root", parent_state: "RETURNED" });
    const c = attempt("c_orphan", { minute: 7, parent_attempt_id: "gone", parent_state: "OUTSIDE_RETURNED_GRAPH" });
    const d = attempt("0_child", { minute: 8, parent_attempt_id: "b_root", parent_state: "RETURNED" });
    const e = attempt("grandchild", { minute: 9, parent_attempt_id: "0_child", parent_state: "RETURNED" });
    /* G10 (first real clone, 2026-09-30): the flat server order drew `0_child` right under
       `c_orphan`, so the rail named the wrong parent. Each child now follows its parent's
       subtree; `b_root`'s two children keep their server order, and so do the two roots. */
    expect(treeOrder([a, b, c, d, e]).map((n) => [n.attempt.attempt_id, n.depth])).toEqual([
      ["b_root", 0],
      ["a_child", 1],
      ["0_child", 1],
      ["grandchild", 2],
      ["c_orphan", 0],
    ]);
    /* A child listed before its parent is still placed under it, with its depth. */
    expect(treeOrder([e, d, a]).map((n) => [n.attempt.attempt_id, n.depth])).toEqual([
      ["b_root", 0],
      ["0_child", 1],
      ["grandchild", 2],
    ]);
    /* Every attempt the server returned is on screen exactly once. */
    expect(treeOrder([a, b, c, d, e])).toHaveLength(5);
    /* A (refused) cycle cannot loop and drops nothing. */
    const x = attempt("x", { parent_attempt_id: "y", parent_state: "RETURNED" });
    const y = attempt("y", { parent_attempt_id: "x", parent_state: "RETURNED" });
    expect(treeOrder([x, y])).toHaveLength(2);
  });

  it("S10-U40 lineageState is partial for each declared gap and available only without one", () => {
    expect(lineageState(lineage()).state).toBe("available");
    const child = lineage();
    child.attempts[0] = { ...child.attempts[0], child_runs_coverage: { state: "PARTIAL", reason_code: "P19_CHILD_RUNS_BOUNDED_PER_ATTEMPT" } };
    expect(lineageGaps(child)).toEqual(["bounded child runs (P19_CHILD_RUNS_BOUNDED_PER_ATTEMPT)"]);
    const diff = lineage({
      source_absences: {
        promotion_pick: AVAILABLE,
        historical_semantic_diff: np("P19_PERSISTED_PREFLIGHT_MANIFEST_NOT_AVAILABLE_FOR_PARENT_DIFF"),
      },
    });
    expect(lineageState(diff).state).toBe("partial");
    expect(lineageState(diff).reason).toContain("P19_PERSISTED_PREFLIGHT_MANIFEST_NOT_AVAILABLE_FOR_PARENT_DIFF");
    expect(lineageState(lineage({ attempts: [] })).state).toBe("empty");
    /* D8 (10-8): only a pick-only gap is left to the pick card. */
    expect(onlyPickGap(lineage())).toBe(false);
    expect(onlyPickGap(child)).toBe(false);
    const pickOnly = lineage({ source_absences: { promotion_pick: np("P19_SOURCE_DID_NOT_PUBLISH_PROMOTION_PICK"), historical_semantic_diff: AVAILABLE } });
    expect(onlyPickGap(pickOnly)).toBe(true);
  });

  it("S10-U41 the lineage link is a router link inside a router and a plain same-origin anchor outside one", () => {
    const outside = render(<LineageLink to="/research/quantbt/alphas/a-b/lineage">lineage →</LineageLink>);
    expect(outside.container.querySelector("a")?.getAttribute("href")).toBe("/research/quantbt/alphas/a-b/lineage");
    cleanup();
    const inside = render(
      <MemoryRouter>
        <LineageLink to="/research/quantbt/alphas/a-b/lineage" action="open-lineage">
          lineage →
        </LineageLink>
      </MemoryRouter>,
    );
    const link = inside.container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/research/quantbt/alphas/a-b/lineage");
    expect(link?.getAttribute("data-action")).toBe("open-lineage");
  });

  it("S10-U42 no S10 file formats numbers, sorts, compares or scrolls an element into view", () => {
    for (const name of ["lineageClient.ts", "useLineage.ts", "LineageDetail.tsx", "LineageRoute.tsx"]) {
      const source = readFileSync(join(process.cwd(), "src", "research", name), "utf8");
      expect(source, name).not.toMatch(/toFixed|Intl\.|Intl\b|toLocaleString|scrollIntoView|\.sort\(/);
      expect(source, name).not.toMatch(/method:\s*["']POST/);
    }
    const module = readFileSync(join(process.cwd(), "src", "features", "quantbt", "QuantBTModule.tsx"), "utf8");
    expect(module.indexOf('path="alphas/:alphaId/lineage"')).toBeGreaterThan(0);
    expect(module.indexOf('path="alphas/:alphaId/lineage"')).toBeLessThan(module.indexOf('path="alphas/:alphaId/:version"'));
    const library = readFileSync(join(process.cwd(), "src", "research", "RunLibrary.tsx"), "utf8");
    expect(library).toContain("lineageHref(group.alphaId)");
    const importer = readFileSync(join(process.cwd(), "src", "research", "AlphaImport.tsx"), "utf8");
    expect(importer).toContain("lineageHref(registration.alpha_id)");
  });

  it("S10-U43 the button font reset has zero specificity, so every chip class keeps its mono size", () => {
    /* jsdom computes no cascade; the browser probe measures the computed font. This guards the source. */
    const source = readFileSync(join(process.cwd(), "src", "research", "LineageDetail.tsx"), "utf8");
    expect(source).toContain(":where(.ln-page) button { font: inherit; }");
    expect(source).not.toMatch(/^\.ln-page button\s*\{/m);
    for (const cls of ["ln-chip", "ln-fchip", "ln-toggle", "ln-btn"]) {
      expect(source, cls).toMatch(new RegExp(`^\\.${cls} \\{[^}]*font-family: var\\(--font-mono\\)`, "m"));
    }
  });
});

/* ------------------------------------------------ R1: back to the hi-fi */

describe("S10 Attempt Lineage — hi-fi as fixed by the owner (R1)", () => {
  it("S10-U44 VD-F1-02 a node chip is the attempt's OWN state for every contract state; the version lifecycle never reaches it", () => {
    const states: LineageAttempt["state"][] = [
      "DRAFT", "PREFLIGHT_VALID", "QUEUED", "CLAIMED", "RUNNING", "COMPUTE_DONE", "SEALING",
      "READY", "CANCEL_REQUESTED", "CANCELLED", "FAILED", "RECOVERY_REQUIRED", "ABANDONED",
    ];
    for (const state of states) {
      const got = lineageStatus(state);
      expect(got.label, state).toBe(state.replace(/_/g, " "));
      expect(got.key, state).toBe(state === "PREFLIGHT_VALID" ? "DRAFT" : state);
      /* the lie being removed: no attempt chip ever reads a version word */
      expect(got.label, state).not.toMatch(/ACTIVE|SUPERSEDED|version/);
    }
  });

  it("S10-U44b the filter buckets: version filters match the band lifecycle; draft matches draft attempts (or a DRAFT version)", () => {
    const lifecycles: LineageVersion["lifecycle_state"][] = ["ACTIVE", "SUPERSEDED", "ABANDONED", "DRAFT"];
    for (const life of lifecycles) {
      for (const filter of ["ACTIVE", "SUPERSEDED", "ABANDONED"] as const) {
        /* a FAILED attempt belongs to its band's bucket, whatever its own state */
        expect(matchesLineageFilter("FAILED", life, filter), `FAILED in ${life} / ${filter}`).toBe(life === filter);
      }
      expect(matchesLineageFilter("READY", life, "DRAFT"), `READY in ${life}`).toBe(life === "DRAFT");
    }
    expect(matchesLineageFilter("DRAFT", "ACTIVE", "DRAFT")).toBe(true);
    expect(matchesLineageFilter("PREFLIGHT_VALID", "SUPERSEDED", "DRAFT")).toBe(true);
    /* an ABANDONED attempt is not an "abandoned version" */
    expect(matchesLineageFilter("ABANDONED", "ACTIVE", "ABANDONED")).toBe(false);
    /* a version that was not returned matches no bucket, except a draft attempt's own */
    for (const filter of LINEAGE_STATUSES) expect(matchesLineageFilter("READY", null, filter)).toBe(false);
    expect(matchesLineageFilter("DRAFT", null, "DRAFT")).toBe(true);
  });

  it("S10-U45 an attempt whose version was not returned still shows its own state, matches no version chip, and keeps the counter honest", async () => {
    const attempts = sixAttempts();
    attempts.push(attempt("att_07", { minute: 90, alpha_version_id: "alphaver_gone", alpha_version_label: "av_gone" }));
    server([{ status: 200, body: lineage({ attempts }) }]);
    renderRoute();
    await ready();
    expect(counter()).toBe("showing 7 of 7 attempts");
    expect(node("att_07").getAttribute("data-status")).toBe("READY");
    expect(node("att_07").querySelector(".ln-st")?.textContent).toBe("READY");
    for (const status of LINEAGE_STATUSES) {
      fireEvent.click(document.querySelector(`[data-filter="${status}"]`) as HTMLElement);
    }
    expect(counter()).toBe("showing 6 of 7 attempts");
    expect(node("att_07")).toBeNull();
  });

  it("S10-U46 keeps the server's order for bands (hi-fi: SUPERSEDED above ACTIVE) and for each band's chips", async () => {
    const body = lineage();
    body.alpha.versions = [
      version("alphaver_090", "av_0_9_0", "DRAFT"),
      ...body.alpha.versions,
      version("alphaver_091", "av_0_9_1", "ABANDONED"),
    ];
    server([{ status: 200, body }]);
    renderRoute();
    await ready();
    const bands = [...document.querySelectorAll("[data-band]")].map((b) => b.getAttribute("data-band-label"));
    expect(bands).toEqual(["av_0_9_0", "av_0_9_2", "av_0_9_3", "av_0_9_1"]);
    expect(bandOrder(body.alpha.versions).map((v) => v.label)).toEqual(bands);
    const active = document.querySelector('[data-band="alphaver_093"]') as HTMLElement;
    expect([...active.querySelectorAll("[data-chip]")].map((c) => c.getAttribute("data-chip"))).toEqual(["att_03", "att_05", "att_06"]);
    expect(active.querySelector(".ln-avchip")?.textContent).toBe("av_0_9_3 · ACTIVE");
  });

  it("S10-U47 attempt chips wrap inside the band (no horizontal scroll) and end with the probe chip, disabled with its reason", async () => {
    server([{ status: 200, body: lineage({ attempts: manyAttempts() }) }]);
    renderRoute();
    await ready();
    const css = document.querySelector("style")?.textContent ?? "";
    const rule = /\.ln-chips \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toContain("flex-wrap: wrap");
    expect(rule).not.toMatch(/overflow/);
    expect(css).not.toMatch(/\.ln-chips[^{]*\{[^}]*overflow-x/);
    for (const band of document.querySelectorAll("[data-band-chips]")) {
      const probe = band.lastElementChild as HTMLButtonElement;
      expect(probe.getAttribute("data-probe-chip")).not.toBeNull();
      expect(probe.disabled).toBe(true);
      expect(probe.getAttribute("title")).toBe(PROBES_REASON);
      expect(probe.textContent).toBe("+ probes");
    }
  });

  it("S10-U48 every node sits on a rail with a dot, the rail widening one step per depth", async () => {
    server();
    renderRoute();
    await ready();
    for (const [id, depth] of [["att_01", 0], ["att_02", 1], ["att_04", 2], ["att_05", 3]] as const) {
      const rail = node(id).querySelector(".ln-rail") as HTMLElement;
      expect(rail.getAttribute("aria-hidden")).toBe("true");
      expect(rail.style.width).toBe(`${railWidth(depth)}px`);
      expect(rail.querySelector(".ln-dot")).toBeTruthy();
    }
    expect(railWidth(0)).toBe(34);
    expect(railWidth(3)).toBe(34 + 3 * 26);
    expect(railWidth(30)).toBe(railWidth(8));
    expect(node("att_03").querySelector(".ln-dot")?.getAttribute("data-status")).toBe("READY");
    const css = document.querySelector("style")?.textContent ?? "";
    expect(css).toMatch(/\.ln-card::before \{ content: ""; position: absolute; left: -13px; top: 50%; width: 12px; height: 1px;/);
    expect(css).toMatch(/\.ln-rail \{[^}]*border-right: 2px solid var\(--line\)/);
  });

  it("S10-U49 prints the trimmed copy (VD-TEXT-01): title, source chip, short promotion rule; no subtitle and no rules footer", async () => {
    server();
    renderRoute();
    await ready();
    /* Literals, not the module's constants, so a drift fails here. */
    expect(panel("header").querySelector("h2")?.textContent).toBe("Attempt lineage");
    expect(panel("header").querySelector("[data-subtitle]")).toBeNull();
    expect(panel("header").querySelector("[data-source-chip]")?.textContent).toBe("PORTAL_PERSISTED_RESEARCH");
    expect(panel("header").querySelector("nav")?.textContent).toBe("Runs/Attempt Lineage — alpha_momentum_btc");
    expect(panel("promotion-rule").querySelector("p")?.textContent).toBe("Only the ACTIVE attempt promotes.");
    expect(panel("promotion-rule").querySelector("p")?.getAttribute("title")).toContain("multiple-testing information");
    expect(panel("promotion-rule").querySelector("p .ln-mono")?.textContent).toBe("ACTIVE");
    expect(document.querySelector('[data-panel="rules"]')).toBeNull();
    expect(document.body.textContent).not.toMatch(/rules of this screen|Attempts are immutable|Immutable nodes|never reconstructed/);
    expect(LINEAGE_TITLE).toBe("Attempt lineage");
    /* D8 (S10-SOURCE-CHIP-VS-READ-AUTHORITY): the chip names the read this screen made, never attempts.json. */
    const chip = panel("header").querySelector("[data-source-chip]") as HTMLElement;
    expect(chip.getAttribute("data-read-authority-chip")).toBe("PORTAL_PERSISTED_RESEARCH");
    expect(document.body.textContent).not.toContain("attempts.json");
    expect(lineageSourceChip(null)).toBe("read authority pending");
    /* D8 (10-1): the crumb names the alpha only — no market or timeframe the lineage does not carry. */
    expect(panel("header").querySelector("nav")?.textContent).not.toMatch(/USDT|· \d+[mhd]\b/);
    const root = panel("root");
    expect(root.querySelector(".ln-k")?.textContent).toBe("root · alpha");
    expect([...root.querySelectorAll(".ln-links > *")].map((l) => l.textContent)).toEqual(["runs →", "new run →", "rc & publish →"]);
    expect(within(root).getByText("declare at New Run →").getAttribute("href")).toBe("/research/quantbt/runs/new");
    expect(panel("selected").querySelector("h3")?.textContent).toContain("selected attempt — att_01");
    expect(panel("diff").querySelector("h3")?.textContent).toBe("diff vs parent — config keys only");
  });

  it("S10-U50 against a pre-1.1 server the probe toggle keeps the hi-fi's place and shape but is disabled with its reason and no invented count", async () => {
    const { calls } = server();
    renderRoute();
    await ready();
    const filters = panel("filters");
    const kids = [...filters.children].map((c) => c.getAttribute("data-filter") ?? c.getAttribute("data-action") ?? (c.hasAttribute("data-counter") ? "counter" : "?"));
    expect(kids).toEqual(["ACTIVE", "DRAFT", "SUPERSEDED", "ABANDONED", "toggle-probes", "counter"]);
    const toggle = filters.querySelector('[data-action="toggle-probes"]') as HTMLButtonElement;
    expect(toggle.disabled).toBe(true);
    expect(toggle.textContent).toBe("show probe attempts");
    expect(toggle.textContent).not.toMatch(/\d/);
    expect(toggle.getAttribute("title")).toBe("probe classification not published by this server (P19_SERVER_PREDATES_LINEAGE_CONTRACT_1_1)");
    expect(toggle.getAttribute("aria-label")).toContain(PROBES_REASON);
    expect(toggle.getAttribute("data-reason-code")).toBe("P19_SERVER_PREDATES_LINEAGE_CONTRACT_1_1");
    const before = counter();
    fireEvent.click(toggle);
    expect(counter()).toBe(before);
    expect(calls).toHaveLength(1);
    expect(document.querySelector('[data-action="expand-all"]')).toBeNull();
  });

  it("S10-U51 each node carries one pill: its own attempt state, never the version lifecycle", async () => {
    server();
    renderRoute();
    await ready();
    /* D8 (S10-RAW-STATE-CHIP) + VD-F1-02: one pill per attempt; it is the attempt's state and nothing else. */
    expect([...["att_01", "att_03", "att_05", "att_04", "att_06"].map((id) => node(id).querySelector(".ln-st")?.textContent)]).toEqual([
      "READY", "READY", "FAILED", "ABANDONED", "DRAFT",
    ]);
    for (const id of ["att_01", "att_03", "att_05", "att_04", "att_06"]) {
      const pill = node(id).querySelector(".ln-st") as HTMLElement;
      expect(pill.getAttribute("data-raw-state"), id).toBeNull();
      expect(pill.getAttribute("data-chip-scope"), id).toBeNull();
      expect(pill.textContent, id).not.toMatch(/version|ACTIVE|SUPERSEDED/);
    }
    expect(node("att_05").querySelector(".ln-st")?.getAttribute("data-status")).toBe("FAILED");
    /* the version lifecycle is printed once, in each band's header */
    expect(document.querySelector('[data-band="alphaver_093"] .ln-avchip')?.textContent).toBe("av_0_9_3 · ACTIVE");
    expect(document.querySelector('[data-band="alphaver_092"] .ln-avchip')?.textContent).toBe("av_0_9_2 · SUPERSEDED");
    for (const id of ["att_01", "att_03", "att_05", "att_04", "att_06"]) expect(node(id).querySelectorAll(".ln-st")).toHaveLength(1);
    expect(document.querySelector(".ln-raw")).toBeNull();
    expect(node("att_03").querySelector(".ln-st")?.getAttribute("data-fill")).toBe("true");
    const css = document.querySelector("style")?.textContent ?? "";
    expect(css).toMatch(/^\.ln-st \{ font-family: var\(--font-mono\)/m);
  });

  it("S10-U52 with no ACTIVE version the pick row still holds its place with the source's reason", async () => {
    const body = lineage();
    body.alpha.versions = body.alpha.versions.map((v) => ({ ...v, lifecycle_state: "SUPERSEDED" as const }));
    body.alpha.active_version_id = null;
    body.alpha.active_version_state = null;
    body.alpha.active_version_availability = np("P19_ALPHA_HAS_NO_ACTIVE_VERSION");
    server([{ status: 200, body }]);
    renderRoute();
    await ready();
    const pick = panel("root").lastElementChild as HTMLElement;
    expect(pick.getAttribute("data-pick-state")).toBe("NOT_PUBLISHED");
    expect(pick.textContent).toContain("P19_SOURCE_DID_NOT_PUBLISH_PROMOTION_PICK");
    expect(within(panel("root")).getByText("P19_ALPHA_HAS_NO_ACTIVE_VERSION")).toBeTruthy();
    /* Both superseded versions still show their own published picks in their rows. */
    expect(document.querySelectorAll("[data-band-pick]")).toHaveLength(2);
  });

  it("S10-U60 E1 short ids: a real 37-character attempt/run id prints as prefix + 8 hex, the full id in the title (10-2)", async () => {
    const LONG_ATT = "ratt_8c9c9991bdd0cfe72100da64ebee1150";
    const LONG_RUN = "rrun_8c9c9991bdd0cfe72100da64ebee1150";
    const attempts = sixAttempts();
    attempts[0] = { ...attempts[0], attempt_id: LONG_ATT, primary_run: { ...attempts[0].primary_run, run_id: LONG_RUN } };
    server([{ status: 200, body: lineage({ attempts }) }]);
    renderRoute(`?attempt=${LONG_ATT}`);
    await ready();
    const card = node(LONG_ATT);
    const button = card.querySelector("[data-row]") as HTMLElement;
    expect(button.textContent).toBe("ratt_8c9c9991");
    expect(button.getAttribute("title")).toBe(LONG_ATT);
    const run = card.querySelector(`[data-run-link="${LONG_RUN}"]`) as HTMLElement;
    expect(run.textContent).toBe("rrun_8c9c9991");
    expect(run.getAttribute("title")).toBe(LONG_RUN);
    const chip = document.querySelector(`[data-chip="${LONG_ATT}"]`) as HTMLElement;
    expect(chip.textContent).toBe("ratt_8c9c9991");
    expect(chip.getAttribute("title")).toContain(LONG_ATT);
    /* The selected heading keeps the id's case (the heading is uppercase) and copies the full value. */
    const selectedId = panel("selected").querySelector("h3 [data-full-id]") as HTMLElement;
    expect(selectedId.textContent).toBe("ratt_8c9c9991");
    expect(selectedId.getAttribute("data-full-id")).toBe(LONG_ATT);
    expect(selectedId.className).toContain("ln-selid");
    /* No full 32-hex tail is printed as visible text anywhere on the screen. */
    expect(document.querySelector('[data-screen="attempt-lineage"]')?.textContent).not.toContain("8c9c9991bdd0cfe72100da64ebee1150");
  });

  it("S10 D1 (10-3): once a read has published the run's label, the card names it R-WFO-118", async () => {
    /* Audit 10-3: the hi-fi writes the run beside the attempt as
       `R-WFO-114`; the screen printed a full `rrun_`. Screen 10 reaches this
       through the shared registry the Library read fills — no edit to this
       screen was needed, which is the point of the change. */
    const LONG_RUN = "rrun_8c9c9991bdd0cfe72100da64ebee1150";
    const attempts = sixAttempts();
    /* The label rides in on this screen's own read — `primary_run.display_label`
       — not on a seeded registry. The client remembers it, and `ShortId` picks
       it up with no edit to this screen. */
    attempts[0] = {
      ...attempts[0],
      primary_run: { ...attempts[0].primary_run, run_id: LONG_RUN, display_label: "R-WFO-114" },
    };
    server([{ status: 200, body: lineage({ attempts }) }]);
    renderRoute(`?attempt=${attempts[0].attempt_id}`);
    await ready();
    const run = panel("selected").querySelector('[data-row-key="primary run"] [data-full-id]') as HTMLElement;
    expect(run.textContent).toBe("R-WFO-114");
    /* The id is still the identity: the hover and the copy target keep it. */
    expect(run.getAttribute("data-full-id")).toBe(LONG_RUN);
    expect(run.getAttribute("title")).toBe(`${LONG_RUN} — click to copy`);
  });

  it("S10 D1: a run the read did not label keeps the short id, never a guessed number", async () => {
    const LONG_RUN = "rrun_8c9c9991bdd0cfe72100da64ebee1150";
    const attempts = sixAttempts();
    /* A pre-D1 server, or a run with no ordinal of its own. The read's silence
       must beat anything the registry happens to be holding, so the label a
       previous screen remembered cannot survive a server that says there is
       none — that is what this seed proves. */
    rememberRunLabel(LONG_RUN, "R-WFO-114");
    attempts[0] = { ...attempts[0], primary_run: { ...attempts[0].primary_run, run_id: LONG_RUN } };
    server([{ status: 200, body: lineage({ attempts }) }]);
    renderRoute(`?attempt=${attempts[0].attempt_id}`);
    await ready();
    const run = panel("selected").querySelector('[data-row-key="primary run"] [data-full-id]') as HTMLElement;
    expect(run.textContent).toBe("rrun_8c9c9991");
  });
});
