/**
 * QA 2026-10-02 second wave · S07 (D3 engine candidate id is not a params digest, D13 what-if under the left column,
 * D15 one name "J", D24 words not codes, H25/H26/H29 no static sub-lines or pill).
 *
 * The freeze body is the published canonical fixture (`research-current-source.freeze-binding.valid.json`).
 */
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FreezeRoute } from "./FreezeRoute";
import type { CurrentSourceFreeze } from "./freezeClient";
import { forgetRunIdentities } from "./retainedLane";

afterEach(cleanup);

const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
const FREEZE = JSON.parse(readFileSync(join(FIXTURES, "research-current-source.freeze-binding.valid.json"), "utf8")) as CurrentSourceFreeze;
const W3B = JSON.parse(readFileSync(join(process.cwd(), "src", "research", "w3bRealWfo.fixture.json"), "utf8")) as {
  progress: unknown;
  requested_spec: unknown;
  hub_freeze: unknown;
};
const RUN = FREEZE.run_id;

function stub(freeze: unknown = FREEZE) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = new URL(url, "http://x").pathname;
      const [status, payload] = path.endsWith("/progress")
        ? [200, W3B.progress]
        : path.endsWith("/requested-spec")
          ? [200, W3B.requested_spec]
          : path.endsWith("/current-source/freeze")
            ? [200, freeze]
            : path.endsWith("/freeze")
              ? [200, W3B.hub_freeze]
              : [404, { error: { code: "UNEXPECTED" } }];
      return { ok: status < 300, status, statusText: String(status), headers: new Headers(), json: async () => payload } as unknown as Response;
    }),
  );
}

async function settled() {
  const path = `/research/quantbt/runs/${RUN}/freeze`;
  window.history.replaceState(null, "", path);
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/research/quantbt/runs/:runId/freeze" element={<FreezeRoute />} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(view.container.querySelector("[data-panel='stage4-binding']")).toBeTruthy());
  await waitFor(() => expect(view.container.querySelector("[data-shared-banner]")).toBeTruthy());
  return view;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  forgetRunIdentities();
  stub();
});

describe("D3 — the engine's candidate id is never labelled a params digest", () => {
  it("F4's params rows say 'candidate id' where the server's identity rule is the candidate-id rule; the F3 params digest is the only 'params digest'", async () => {
    const { container } = await settled();
    const sealed = container.querySelector("[data-binding-row='SEALED_PARAMS']") as HTMLElement;
    const replay = container.querySelector("[data-binding-row='REPLAY_PARAMS']") as HTMLElement;
    expect(sealed.textContent).toContain("sealed candidate id (engine)");
    expect(replay.textContent).toContain("candidate id used by replay");
    expect(sealed.textContent).not.toContain("params digest");
    expect(replay.textContent).not.toContain("params digest");
    /* the bundle rows are fingerprints and keep the server's own labels */
    expect(container.querySelector("[data-binding-row='SEALED_BUNDLE']")?.textContent).toContain("sealed bundle digest");
    const card = container.querySelector("[data-panel='stage4-binding']") as HTMLElement;
    expect(card.querySelectorAll("[data-binding-row]")).toHaveLength(4);
  });
});

describe("D13 — the what-if sits under the frozen θ*, in the left column", () => {
  it("the left column holds frozen parameters then the what-if card; the right column holds the chain and custody", async () => {
    const { container } = await settled();
    const left = container.querySelector("[data-column='left']") as HTMLElement;
    const right = container.querySelector("[data-column='right']") as HTMLElement;
    expect(left.querySelector("[data-panel='frozen-parameters']")).toBeTruthy();
    expect(left.querySelector("[data-panel='what-if']")).toBeTruthy();
    expect(right.querySelector("[data-panel='what-if']")).toBeNull();
    expect(right.querySelector("[data-panel='digest-chain']")).toBeTruthy();
    expect(right.querySelector("[data-panel='stage4-binding']")).toBeTruthy();
  });
});

describe("H25 / H26 / H29 — no static pill, no sub-lines, code-fixed values stated plainly", () => {
  it("the F3 card has no 'verify digest — below' pill and no explanatory sub-line; the rule rides in the row's title", async () => {
    const { container } = await settled();
    const chain = container.querySelector("[data-panel='digest-chain']") as HTMLElement;
    expect(chain.textContent).not.toMatch(/verify digest/i);
    expect(chain.querySelector("[data-chain-verify]")).toBeNull();
    expect(chain.querySelector("p")).toBeNull();
    expect(chain.textContent).not.toContain("checks artifact integrity");
    const params = chain.querySelector("[data-chain-link='PARAMS_DIGEST']") as HTMLElement;
    expect(params.getAttribute("title")).toContain("sha256 of the sealed canonical parameter map");
  });

  it("F4 says 'Code-fixed values: not published'; the code digest and adapter contract are the hover, not visible hex", async () => {
    const { container } = await settled();
    const authority = container.querySelector("[data-parameter-authority]") as HTMLElement;
    expect(authority.textContent).toContain("Code-fixed values: not published");
    expect(authority.textContent).not.toMatch(/code digest|adapter contract|[0-9a-f]{8}…/);
    const digests = authority.querySelector("[data-code-fixed-digests]") as HTMLElement;
    expect(digests.getAttribute("title")).toContain(FREEZE.parameter_authority!.code_fixed.code_digest!);
    expect(digests.getAttribute("title")).toContain(FREEZE.parameter_authority!.code_fixed.adapter_contract_digest!);
  });
});

describe("D15 — one name, J, with the unit label", () => {
  it("the S07 strip says 'J' to two places, never 'objective', in the S06 claim row's precision", async () => {
    const { container } = await settled();
    const selected = container.querySelector("[data-selected-objective]") as HTMLElement;
    expect(selected.textContent).toMatch(/·\s*J\s+−9\.81/);
    expect(selected.textContent).not.toMatch(/objective/);
    expect(selected.getAttribute("title")).toBe(FREEZE.frozen_selection!.objective);
  });
});

describe("D24 — words are the text, the server's code is the hover", () => {
  it("the engine's claim reads in words and its token is the title; no QUANTBT_/NOT_CAUSAL_ token is visible", async () => {
    const { container } = await settled();
    const claim = container.querySelector("[data-ordering-badge]") as HTMLElement;
    expect(claim.getAttribute("title")).toContain("not causal · multi-fold · global calibration");
    expect(claim.getAttribute("title")).toContain("NOT_CAUSAL_MULTI_FOLD_GLOBAL_CALIBRATION");
    const visible = (container.querySelector("[data-screen='freeze-detail']") as HTMLElement).textContent!;
    expect(visible).not.toMatch(/QUANTBT_[A-Z_]{8,}/);
    const wall = container.querySelector("[data-axis='WALL_CLOCK'] [data-absence-code]") as HTMLElement;
    expect(wall.getAttribute("title")).toBe("QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_FREEZE_OR_OOS_READ_CLOCKS");
    expect(wall.textContent).toBe("no freeze or OOS-read timestamps published");
  });
});
