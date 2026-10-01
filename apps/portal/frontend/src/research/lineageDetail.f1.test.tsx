/**
 * Batch F1 (honesty) · Screen 10, loaded from the canonical lineage fixtures —
 * never a hand-built body.
 *
 *  - CG-FG-S10-01: the PROMOTION PICK printed the approval's `source_digest` in the
 *    param-set slot. The slot is now the served selected trial / param set, or a
 *    short typed absence with the server's reason code.
 *  - CG-FG-S10-02 / VD-F1-02: a FAILED / CANCELLED attempt wore an ACTIVE chip (the version's
 *    lifecycle leaking onto the attempt). Closed as won't-do by VD-F1-02 (2026-10-01):
 *    a node shows only its OWN attempt state; the version lifecycle is in the band header.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LineageRoute } from "./LineageRoute";
import { resetLineageCache, type Lineage } from "./lineageClient";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const fixture = (name: string): Lineage =>
  JSON.parse(readFileSync(join(ROOT, "packages/contracts/fixtures", `research-attempt-lineage.${name}.valid.json`), "utf8")) as Lineage;

const HEALTHY = fixture("healthy");
const ALPHA = HEALTHY.alpha.alpha_id;
const clone = (): Lineage => JSON.parse(JSON.stringify(HEALTHY)) as Lineage;

beforeEach(() => resetLineageCache());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function server(body: unknown) {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
  );
}

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={[`/research/quantbt/alphas/${ALPHA}/lineage`]}>
      <Routes>
        <Route path="/research/quantbt/alphas/:alphaId/lineage" element={<LineageRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

const node = (id: string) => document.querySelector(`[data-attempt="${id}"]`) as HTMLElement | null;
const counter = () => document.querySelector("[data-counter]")?.textContent;
async function ready() {
  await waitFor(() => expect(document.querySelector('[data-panel="counts"]')).toBeTruthy());
  await waitFor(() => expect(document.querySelector("[data-band]")).toBeTruthy());
}
const activePick = () => document.querySelector('[data-pick-state="PUBLISHED"]') as HTMLElement;
const showProbes = () => fireEvent.click(document.querySelector('[data-action="toggle-probes"]') as HTMLElement);

describe("CG-FG-S10-01 — the promotion pick never prints the approval digest as a param set", () => {
  const SOURCE_DIGEST = HEALTHY.alpha.versions[1]!.promotion_pick.source_digest!;

  it("F1-S10-01a the canonical pick serves no trial / param set: both slots are typed absences with the server's code, and no digest is printed", async () => {
    server(HEALTHY);
    renderRoute();
    await ready();
    const pick = activePick();
    expect(pick.getAttribute("data-pick-attempt")).toBe(HEALTHY.alpha.versions[1]!.promotion_pick.attempt_id);
    const line = pick.querySelector(".v")!.textContent!;
    expect(line).toContain("trial — not published");
    expect(line).toContain("param set — not published");
    expect(line).toContain("P19_P22_PICK_RECEIPT_NOT_AVAILABLE");
    /* the lie: 8 hex of the approval's source digest in the param-set slot */
    expect(line).not.toContain(SOURCE_DIGEST.slice(0, 8));
    expect(pick.textContent).not.toContain(SOURCE_DIGEST.slice(0, 8));
    expect(pick.querySelector('[data-pick-fact="trial"]')?.getAttribute("data-absent-state")).toBe("not published");
    expect(pick.querySelector('[data-pick-fact="param set"] [data-reason-code]')?.textContent).toBe("P19_P22_PICK_RECEIPT_NOT_AVAILABLE");
    /* the digest stays reachable, labelled for what it is */
    expect(pick.querySelector("[data-pick-source]")?.getAttribute("title")).toBe(`approval source digest ${SOURCE_DIGEST}`);
  });

  it("F1-S10-01b a pick that serves selected_trial_id and selected_params_digest shows those, not the approval digest", async () => {
    const body = clone();
    const pick = body.alpha.versions[1]!.promotion_pick;
    const paramsDigest = "abcdef0123456789".repeat(4);
    Object.assign(pick, {
      selected_trial_id: "trial_394",
      selected_trial_availability: { state: "AVAILABLE", reason_code: null },
      selected_params_digest: paramsDigest,
      selected_params_availability: { state: "AVAILABLE", reason_code: null },
    });
    server(body);
    renderRoute();
    await ready();
    const row = activePick();
    expect(row.querySelector('[data-pick-fact="trial"]')?.textContent).toBe("trial trial_394");
    expect(row.querySelector('[data-pick-fact="param set"]')?.textContent).toBe(`param set ${paramsDigest.slice(0, 8)}`);
    expect(row.querySelector('[data-pick-fact="param set"]')?.getAttribute("title")).toBe(paramsDigest);
    expect(row.querySelector(".v")?.textContent).not.toContain(SOURCE_DIGEST.slice(0, 8));
    expect(row.querySelector("[data-absent]")).toBeNull();
  });

  it("F1-S10-01c a server that predates the fields says 'not published' and invents no reason code", async () => {
    const body = clone();
    const pick = body.alpha.versions[1]!.promotion_pick as unknown as Record<string, unknown>;
    for (const key of ["selected_trial_id", "selected_trial_availability", "selected_params_digest", "selected_params_availability"]) delete pick[key];
    server(body);
    renderRoute();
    await ready();
    const row = activePick();
    expect(row.querySelector(".v")?.textContent).toContain("trial — not published");
    expect(row.querySelector(".v")?.textContent).toContain("param set — not published");
    expect(row.querySelector('[data-pick-fact] [data-reason-code]')).toBeNull();
    expect(row.querySelector(".v")?.textContent).not.toContain(SOURCE_DIGEST.slice(0, 8));
  });
});

describe("VD-F1-02 — a node speaks for its attempt; the version lifecycle is in the band header (CG-FG-S10-02 won't-do)", () => {
  it("F1-S10-02a the canonical FAILED attempt in an ACTIVE version reads FAILED; READY ones read READY; no node chip carries a version word", async () => {
    server(HEALTHY);
    renderRoute();
    await ready();
    showProbes();
    const failed = HEALTHY.attempts.find((row) => row.state === "FAILED")!;
    const band = HEALTHY.alpha.versions.find((v) => v.alpha_version_id === failed.alpha_version_id)!;
    expect(band.lifecycle_state).toBe("ACTIVE");
    const chip = node(failed.attempt_id)!.querySelector(".ln-st")!;
    expect(chip.textContent).toBe("FAILED");
    expect(chip.getAttribute("data-status")).toBe("FAILED");
    expect(node("att_03")!.querySelector(".ln-st")!.textContent).toBe("READY");
    expect(node("att_01")!.querySelector(".ln-st")!.textContent).toBe("READY");
    for (const el of document.querySelectorAll(".ln-st")) {
      expect(el.textContent, el.textContent ?? "").not.toMatch(/version|ACTIVE|SUPERSEDED/);
      expect(el.getAttribute("data-chip-scope")).toBeNull();
    }
    /* the lifecycle is said once per band, in its header */
    expect(document.querySelector(`[data-band="${band.alpha_version_id}"] .ln-avchip`)?.textContent).toBe(`${band.label} · ACTIVE`);
    /* the band chip's accessible name is the attempt's own state */
    expect(screen.getByRole("button", { name: "attempt att_03 — READY" })).toBeTruthy();
  });

  it("F1-S10-02b a CANCELLED and a RECOVERY_REQUIRED attempt show their own state", async () => {
    const body = clone();
    body.attempts.find((row) => row.attempt_id === "att_04")!.state = "CANCELLED";
    body.attempts.find((row) => row.attempt_id === "att_01")!.state = "RECOVERY_REQUIRED";
    server(body);
    renderRoute();
    await ready();
    expect(node("att_04")!.querySelector(".ln-st")!.textContent).toBe("CANCELLED");
    expect(node("att_01")!.querySelector(".ln-st")!.textContent).toBe("RECOVERY REQUIRED");
    expect(node("att_01")!.querySelector(".ln-st")!.getAttribute("data-status")).toBe("RECOVERY_REQUIRED");
  });

  it("F1-S10-02c the filter chips say what they filter (version lifecycle / draft), and filter by it", async () => {
    server(HEALTHY);
    renderRoute();
    await ready();
    showProbes();
    const chips = [...document.querySelectorAll("[data-filter]")] as HTMLElement[];
    expect(chips.map((c) => c.textContent)).toEqual(["version active", "draft", "version superseded", "version abandoned"]);
    expect(chips.map((c) => c.getAttribute("title"))).toEqual([
      "attempts of an ACTIVE alpha version",
      "draft attempts, and attempts of a DRAFT alpha version",
      "attempts of a SUPERSEDED alpha version",
      "attempts of an ABANDONED alpha version",
    ]);
    expect(counter()).toBe("showing 7 of 7 attempts");
    const shown = () => [...document.querySelectorAll("[data-tree-scroll] [data-attempt]")].map((r) => r.getAttribute("data-attempt"));
    const versionOf = (id: string) => HEALTHY.alpha.versions.find((v) => v.alpha_version_id === id)!.lifecycle_state;
    fireEvent.click(chips[0]!);
    /* every attempt of the ACTIVE version, whatever its own state — the FAILED one included */
    const active = HEALTHY.attempts.filter((row) => versionOf(row.alpha_version_id) === "ACTIVE").map((row) => row.attempt_id);
    expect(shown()).toEqual(active);
    expect(shown()).toContain("att_07");
    fireEvent.click(chips[0]!);
    fireEvent.click(chips[3]!);
    /* "version abandoned" matches by the band: the canonical lineage has none, so that bucket is empty */
    expect(shown()).toEqual(HEALTHY.attempts.filter((row) => versionOf(row.alpha_version_id) === "ABANDONED").map((row) => row.attempt_id));
  });

  it("F1-S10-02d the selected panel shows the attempt's state in its pill and no second 'state' row", async () => {
    server(HEALTHY);
    renderRoute();
    await ready();
    showProbes();
    for (const id of ["att_03", "att_07"]) {
      fireEvent.click(node(id)!.querySelector("[data-row]") as HTMLElement);
      const panel = document.querySelector('[data-panel="selected"]') as HTMLElement;
      expect(panel.querySelector(".ln-st")?.textContent).toBe(HEALTHY.attempts.find((row) => row.attempt_id === id)!.state.replace(/_/g, " "));
      expect(panel.querySelector("[data-attempt-state]")).toBeNull();
    }
  });
});
