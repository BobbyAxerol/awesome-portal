/**
 * W6b · Screen 10 on contract 1.1.0, loaded from the canonical fixtures the
 * control-api publishes (CG-P19-01) — never a hand-built body.
 *
 *  - CG-P19-02: a held copy and its validator; a `304` renders the same graph.
 *  - CG-P19-03/14: storied cards, probes hidden but counted, the toggle, and
 *    the promotion standing — all server words.
 *  - CG-P19-04/05/07/08: rc chips, cert, OOS Sharpe and decay (formatted for
 *    the eye, exact in the title, never a zero from null), outcome, spec line.
 *  - CG-P19-06: exercised and untried as the server aggregated them.
 *  - CG-P19-09: a bounded newest page and "load older" with the server cursor.
 *  - CG-P19-13: count definitions and the Run Library reconciliation link.
 */
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TREE_AIM } from "./LineageDetail";
import { LineageRoute } from "./LineageRoute";
import { resetLineageCache, type Lineage } from "./lineageClient";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const fixture = <T,>(name: string): T =>
  JSON.parse(readFileSync(join(ROOT, "packages/contracts/fixtures", `research-attempt-lineage.${name}.valid.json`), "utf8")) as T;

const HEALTHY = fixture<Lineage>("healthy");
const PARTIAL = fixture<Lineage>("partial");
const EMPTY = fixture<Lineage>("empty");
const BOUNDED = fixture<Lineage>("bounded");
const PROBLEMS = fixture<Record<string, unknown>>("problems");
const ALPHA = HEALTHY.alpha.alpha_id;

beforeEach(() => resetLineageCache());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type Answer = { status: number; body?: unknown; etag?: boolean };
type Call = { url: string; headers: Record<string, string> };

function server(answers: Answer[]) {
  const calls: Call[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    calls.push({ url: String(input), headers: (init?.headers ?? {}) as Record<string, string> });
    const answer = answers.length > 1 ? answers.shift()! : answers[0]!;
    if (answer.status === 304) return new Response(null, { status: 304 });
    const body = answer.body as { etag?: string } | undefined;
    return new Response(JSON.stringify(body), {
      status: answer.status,
      headers: { "content-type": "application/json", ...(answer.etag !== false && body?.etag ? { etag: body.etag } : {}) },
    });
  });
  return { calls };
}

function renderRoute(search = "") {
  return render(
    <MemoryRouter initialEntries={[`/research/quantbt/alphas/${ALPHA}/lineage${search}`]}>
      <Routes>
        <Route path="/research/quantbt/alphas/:alphaId/lineage" element={<LineageRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

const panel = (name: string) => document.querySelector(`[data-panel="${name}"]`) as HTMLElement;
const node = (id: string) => document.querySelector(`[data-attempt="${id}"]`) as HTMLElement | null;
const counter = () => document.querySelector("[data-counter]")?.textContent;
const screenRoot = () => document.querySelector('[data-screen="attempt-lineage"]') as HTMLElement;
async function ready() {
  await waitFor(() => expect(document.querySelector('[data-panel="counts"]')).toBeTruthy());
  await waitFor(() => expect(document.querySelector("[data-band]")).toBeTruthy());
}
const attempt = (id: string) => HEALTHY.attempts.find((row) => row.attempt_id === id)!;

describe("W6b S10 on contract 1.1.0 — canonical fixtures", () => {
  it("W6b-U01 CG-P19-02 keeps the copy and its validator; a 304 on return renders the same graph", async () => {
    const { calls } = server([{ status: 200, body: HEALTHY }, { status: 304 }]);
    const first = renderRoute();
    await ready();
    expect(calls[0]!.headers).toEqual({});
    const before = panel("root").textContent;
    first.unmount();
    renderRoute();
    await ready();
    expect(calls).toHaveLength(2);
    expect(calls[1]!.headers).toEqual({ "If-None-Match": HEALTHY.etag });
    expect(panel("root").textContent).toBe(before);
    /* att_06 is a draft with no persisted spec, so its diff is a declared gap: the state says partial. */
    expect(screenRoot().getAttribute("data-lineage-state")).toBe("partial");
  });

  it("W6b-U02 CG-P19-03 shows the storied cards, hides probes but counts them, and toggles them in", async () => {
    server([{ status: 200, body: HEALTHY }]);
    renderRoute();
    await ready();
    /* F4/MISC (S10 decision): a clone or reproduction is a step of the trace and is never folded away, so the
       toggle hides only the probes that are neither (here att_07, a plain NEW probe). */
    const shown = HEALTHY.attempts.filter((row) => row.presentation_kind === "STORIED" || row.intent_kind !== "NEW").map((row) => row.attempt_id);
    const hideable = HEALTHY.attempts.filter((row) => row.presentation_kind === "PROBE" && row.intent_kind === "NEW").map((row) => row.attempt_id);
    const storied = HEALTHY.attempts.filter((row) => row.presentation_kind === "STORIED").map((row) => row.attempt_id);
    expect(storied).toEqual(["att_01", "att_03", "att_04"]);
    expect(hideable).toEqual(["att_07"]);
    expect([...document.querySelectorAll("[data-attempt]")].map((el) => el.getAttribute("data-attempt"))).toEqual(shown);
    expect(counter()).toBe(`showing ${shown.length} of ${HEALTHY.counts.returned_attempts} attempts`);
    const toggle = panel("filters").querySelector('[data-action="toggle-probes"]') as HTMLButtonElement;
    expect(toggle.disabled).toBe(false);
    expect(toggle.textContent).toBe(`show ${hideable.length} probe attempts`);
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(counter()).toBe(`showing 7 of 7 attempts`);
    for (const id of ["att_02", "att_05", "att_06", "att_07"]) expect(node(id)?.querySelector(".ln-row"), id).toBeTruthy(); // compact row
    for (const id of storied) expect(node(id)?.querySelector(".ln-card"), id).toBeTruthy(); // full card
    /* Band: storied and traced chips plus one "+N probes" chip that toggles the same set. */
    const band = document.querySelector('[data-band-label="av_0_9_3"]') as HTMLElement;
    expect([...band.querySelectorAll("[data-chip]")].map((chip) => chip.textContent)).toEqual(["att_03", "att_04 ●", "att_05", "att_06"]);
    const probeChip = band.querySelector("[data-probe-chip]") as HTMLButtonElement;
    expect(probeChip.textContent).toBe("+1 probes");
    fireEvent.click(probeChip);
    expect(counter()).toBe("showing 6 of 7 attempts");
  });

  it("W6b-U03 CG-P19-07/06 prints each version's outcome, successor, exercised and untried as the server sent them", async () => {
    server([{ status: 200, body: HEALTHY }]);
    renderRoute();
    await ready();
    const [v92, v93] = HEALTHY.alpha.versions;
    const band92 = document.querySelector('[data-band-label="av_0_9_2"]') as HTMLElement;
    const band93 = document.querySelector('[data-band-label="av_0_9_3"]') as HTMLElement;
    expect(band92.querySelector(".ln-out")?.textContent).toBe(v92!.outcome.text);
    expect(band93.querySelector(".ln-out")?.textContent).toBe(v93!.outcome.text);
    expect(band92.querySelector("[data-superseded-by]")?.textContent).toBe(" · superseded by av_0_9_3");
    expect(band93.querySelector("[data-exercised-routes]")?.textContent).toBe(v93!.exercised.routes.join(" · "));
    expect(band93.querySelector("[data-exercised-modes]")?.textContent).toBe("mode_1_decay × global · mode_1_decay × per_fold_causal");
    expect(band93.querySelector("[data-exercised-params]")?.textContent).toBe("entry_z 0.6–2.6 · fee_bps 4 (pinned) · window 12–96");
    expect(band93.querySelector("[data-exercised-count]")?.textContent).toBe("4 attempts read · 1 without a persisted spec");
    const untried = panel("root").querySelector("[data-untried-routes]") as HTMLElement;
    expect(untried.textContent).toBe(v93!.untried.routes.map((route) => route.route_id).join(" · "));
    expect(panel("root").querySelector('[data-action="declare-at-new-run"]')?.getAttribute("href")).toBe(
      `/research/quantbt/runs/new?alpha=${encodeURIComponent(ALPHA)}&av=${encodeURIComponent(v93!.alpha_version_id)}`,
    );
  });

  it("W6b-U04 CG-P19-04/10 a published pick links its attempt, run and release-candidate draft (Screen 11)", async () => {
    server([{ status: 200, body: HEALTHY }]);
    renderRoute();
    await ready();
    const pick = document.querySelector('[data-pick-state="PUBLISHED"]') as HTMLElement;
    expect(pick.getAttribute("data-pick-attempt")).toBe("att_04");
    const rc = pick.querySelector('[data-pick-rc="ACTOR_DRAFT"] a') as HTMLAnchorElement;
    expect(rc.textContent).toBe("rc_ (draft)");
    expect(rc.getAttribute("href")).toBe("/research/quantbt/runs/run-att_04/release-candidate");
    expect(panel("root").querySelector('[data-action="release-candidate"]')?.getAttribute("href")).toBe("/research/quantbt/runs/run-att_04/release-candidate");
    /* On the card: the picked marker and the rc chip. */
    const card = node("att_04")!;
    expect(card.querySelector("[data-picked]")?.textContent).toBe("PROMOTION PICK");
    expect(card.querySelector('[data-rc="ACTOR_DRAFT"]')?.textContent).toBe("rc_ (draft)");
  });

  it("W6b-U05 CG-P19-05/08 prints cert, OOS Sharpe and decay with the exact value in the title, and the spec line", async () => {
    server([{ status: 200, body: HEALTHY }]);
    renderRoute();
    await ready();
    const att04 = attempt("att_04");
    const card = node("att_04")!;
    expect(card.querySelector("[data-grade]")?.textContent).toBe("cert B");
    const oos = card.querySelector('[data-metric="OOS"]') as HTMLElement;
    expect(oos.getAttribute("data-metric-value")).toBe(att04.run_facts.oos_sharpe.value);
    expect(oos.textContent).toBe("OOS 0.744");
    expect(oos.getAttribute("title")).toContain(att04.run_facts.oos_sharpe.value!);
    const decay = card.querySelector('[data-metric="decay"]') as HTMLElement;
    expect(decay.getAttribute("data-metric-state")).toBe("NOT_PUBLISHED");
    expect(decay.textContent).toBe("decay not published");
    expect(decay.textContent).not.toMatch(/\d/);
    expect(card.querySelector(".ln-spec")?.textContent).toBe(`${att04.spec_label.text}  ·  3p · 1 swept · 2 pinned`);
    expect(card.querySelector('[data-outcome-line="SOURCE_CLAIM_SENTENCE"]')?.textContent).toBe(att04.outcome.text);
    /* A Delta WFO run without a P13 projection shows its retained selected trial, labelled as such. */
    const wfo = node("att_03")!.querySelector('[data-metric="OOS"]') as HTMLElement;
    expect(wfo.getAttribute("data-metric-value")).toBe("1.19");
    expect(wfo.textContent).toBe("OOS 1.190 (selected trial, mean of folds)");
    expect(node("att_03")!.querySelector("[data-cert-absent]")?.textContent).toBe("cert not published");
  });

  it("B11 S13 a causal run's OUTER_FOLD_SELECTED_OOS_MEAN scope is labelled as the outer-fold basis (typed mutation of the canonical fixture)", async () => {
    const body = JSON.parse(JSON.stringify(HEALTHY)) as Lineage;
    const fact = body.attempts.find((row) => row.attempt_id === "att_03")!.run_facts.oos_sharpe;
    fact.source = "RS02_RETAINED_OUTER_FOLD_SELECTIONS";
    fact.scope = "OUTER_FOLD_SELECTED_OOS_MEAN";
    server([{ status: 200, body }]);
    renderRoute();
    await ready();
    const oos = node("att_03")!.querySelector('[data-metric="OOS"]') as HTMLElement;
    expect(oos.getAttribute("data-metric-value")).toBe(fact.value);
    expect(oos.textContent).toBe("OOS 1.190 (outer folds, each fold's own selection, mean OOS)");
    expect(oos.textContent).not.toContain("selected trial");
    expect(oos.getAttribute("title")).toContain("RS02_RETAINED_OUTER_FOLD_SELECTIONS");
  });

  it("W6b-U06 the selected attempt lists the hi-fi rows and links 04 · 09 · 07 · 11 · 02 · 13", async () => {
    server([{ status: 200, body: HEALTHY }]);
    renderRoute("?attempt=att_04");
    await ready();
    const selected = panel("selected");
    expect(selected.getAttribute("data-selected-attempt")).toBe("att_04");
    const row = (key: string) => selected.querySelector(`[data-row-key="${key}"]`)?.textContent;
    expect(row("mode × schedule")).toBe("signal_notional · mode_1_decay × per_fold_causal");
    /* 10-6: the claim state in words with the source's sentence as its reason, never the raw enum. */
    expect(selected.querySelector('[data-row-key="claim"] [data-claim-words]')?.textContent).toBe("issued");
    expect(selected.querySelector('[data-row-key="claim"] [data-claim-reason]')?.textContent).toBe(attempt("att_04").run_facts.claim.text);
    expect(row("claim")).not.toContain("ISSUED");
    expect(row("OOS sharpe")).toBe(" 0.744");
    expect(row("cert")).toBe("B");
    expect(row("promotion")).toBe("promotion pick");
    expect(row("release candidate")).toBe("rc_ (draft)");
    expect(row("presentation")).toBe("storied — promotion pick, has a release candidate, changes two or more declared keys");
    /* D8 (10-5): the hi-fi's rows stay open, the technical rows sit under one closed disclosure. */
    const technical = selected.querySelector('details[data-selected-rows="technical"]') as HTMLDetailsElement;
    expect(technical.open).toBe(false);
    expect([...technical.querySelectorAll("dt")].map((dt) => dt.textContent)).toEqual([
      "promotion", "release candidate", "presentation", "intent", "alpha version", "primary run", "run state",
      "execution profile", "engine release", "effective spec", "dataset binding", "technical retries", "space signature", "created", "updated",
    ]);
    /* VD-F1-02: the pill is the attempt state, so there is no second "state" row. */
    expect([...selected.querySelectorAll('[data-selected-rows="headline"] > dt')].map((dt) => dt.textContent)).toEqual([
      "parent", "mode × schedule", "claim", "OOS sharpe", "decay", "cert",
    ]);
    /* The hi-fi's verdict line sits on the published promotion pick. */
    expect(selected.querySelector('[data-tree-aim="picked"]')?.textContent).toBe(TREE_AIM);
    /* The source sentence is the claim's reason; the verdict line does not print it a second time. */
    expect(selected.querySelector("[data-verdict]")?.textContent).toBe("");
    expect(selected.textContent?.split(attempt("att_04").outcome.text ?? "").length).toBe(2);
    const href = (action: string) => selected.querySelector(`[data-action="${action}"]`)?.getAttribute("href");
    expect(href("open-evidence")).toBe("/research/quantbt/runs/run-att_04/evidence");
    expect(href("run-report")).toBe("/research/quantbt/runs/run-att_04/report");
    expect(href("open-freeze")).toBe("/research/quantbt/runs/run-att_04/freeze");
    expect(href("open-release-candidate")).toBe("/research/quantbt/runs/run-att_04/release-candidate");
    expect(href("clone-at-new-run")).toBe("/research/quantbt/runs/new?from=run-att_04");
    expect(href("compare-with-parent")).toBe(`/research/quantbt/alphas/${ALPHA}/compare?mode=pair&runs=run-att_03,run-att_04`);
  });

  it("W6b-U07 spec T04: a deep link to a probe opens the probes and selects it", async () => {
    server([{ status: 200, body: HEALTHY }]);
    renderRoute("?attempt=att_07");
    await ready();
    expect(panel("selected").getAttribute("data-selected-attempt")).toBe("att_07");
    expect(node("att_07")).toBeTruthy();
    expect(panel("filters").querySelector('[data-action="toggle-probes"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(panel("selected").querySelector('[data-row-key="presentation"]')?.textContent).toBe("probe");
  });

  it("W6b-U08 CG-P19-14/13 the rule is verbatim; standing and count definitions are the server's", async () => {
    server([{ status: 200, body: HEALTHY }]);
    renderRoute();
    await ready();
    const standing = panel("promotion-rule").querySelector("[data-promotion-standing]")?.textContent;
    expect(standing).toBe("promotion pick 1 · not the pick 4 · promotion closed 2");
    const count = panel("counts").querySelector('[data-count="submitted_attempts"]') as HTMLElement;
    const definition = HEALTHY.counts_definitions.rows.find((row) => row.key === "submitted_attempts")!;
    expect(count.getAttribute("title")).toBe(`${definition.includes} — Run Library: ${definition.run_library_equivalent}`);
    expect(panel("counts").querySelector('[data-count="probe_returned"] .n')?.textContent).toBe(String(HEALTHY.counts.probe_returned));
    expect(panel("counts").querySelector('[data-action="reconcile-run-library"]')?.getAttribute("href")).toBe(
      `/research/quantbt/runs?group=1&alpha=${ALPHA}`,
    );
  });

  it("W6b-U09 CG-P19-09 a bounded newest page reads older attempts only with the server's cursor", async () => {
    const { calls } = server([{ status: 200, body: BOUNDED }, { status: 200, body: PARTIAL }]);
    renderRoute();
    await ready();
    const bound = document.querySelector("[data-bounded]") as HTMLElement;
    expect(bound.getAttribute("data-window")).toBe("NEWEST");
    expect(bound.textContent).toContain(`${BOUNDED.counts.returned_attempts} of ${BOUNDED.counts.total_attempts} attempts were returned — the newest ones`);
    fireEvent.click(within(bound).getByRole("button", { name: "load older attempts" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    const older = new URL(calls[1]!.url, "http://localhost");
    expect(older.searchParams.get("cursor")).toBe(BOUNDED.coverage.older_cursor);
    expect(older.searchParams.get("limit")).toBe("128");
    await waitFor(() => expect(document.querySelector("[data-older-none]")).toBeTruthy());
    const merged = BOUNDED.counts.returned_attempts + PARTIAL.attempts.length;
    expect(document.querySelector("[data-bounded]")?.textContent).toContain(`${merged} of ${BOUNDED.counts.total_attempts} attempts`);
  });

  it("W6b-U10 an empty Alpha keeps its version row; a 404 problem is the neutral denied state", async () => {
    server([{ status: 200, body: EMPTY }]);
    const view = renderRoute();
    await ready();
    expect(screenRoot().getAttribute("data-lineage-state")).toBe("empty");
    expect(document.querySelectorAll("[data-band]")).toHaveLength(1);
    view.unmount();
    vi.restoreAllMocks();
    resetLineageCache();
    server([{ status: 404, body: PROBLEMS["404"] }]);
    renderRoute();
    await waitFor(() => expect(screenRoot().getAttribute("data-lineage-state")).toBe("denied"));
  });

  it("W6b-U11 a draft with no run: every per-run fact says not applicable, never 0", async () => {
    server([{ status: 200, body: HEALTHY }]);
    renderRoute("?attempt=att_06");
    await ready();
    const draft = node("att_06")!;
    for (const metric of draft.querySelectorAll("[data-metric]")) {
      expect(metric.getAttribute("data-metric-state")).toBe("NOT_APPLICABLE");
      expect(metric.textContent).not.toMatch(/\d/);
    }
  });
});
