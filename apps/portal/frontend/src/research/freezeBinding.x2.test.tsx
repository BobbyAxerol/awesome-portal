/**
 * X2 · B3/B4 + F5 — Screen 07 on a retained WFO run: θ*'s declared range and
 * DR-02 warning (S07 = S06), the server's F4 binding (CG-P16-02) with the
 * parameter authority (CG-P16-03), and the θ* digest copy (T10).
 *
 * The freeze body is the published canonical fixture
 * (`research-current-source.freeze-binding.valid.json`, the real W5b seal
 * through the Control API service); progress and requested spec are the W3b
 * real bodies.
 */
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FreezeRoute } from "./FreezeRoute";
import { hubDigestChain, retainedDigestChain } from "./DigestChain";
import type { FreezeDetail } from "./freezeClient";
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

describe("X2 · B3 — S07 prints θ*'s declared range and the same DR-02 warning as S06", () => {
  it("each frozen value sits on its declared range with the server's placement; no UI code", async () => {
    const { container } = await settled();
    const panel = container.querySelector("[data-panel='frozen-parameters']") as HTMLElement;
    expect(panel.querySelector("[data-frozen-source]")?.getAttribute("data-frozen-source")).toBe("declared-space");
    expect(panel.querySelectorAll("[data-frozen-parameter]")).toHaveLength(8);
    const rsi = panel.querySelector("[data-frozen-position='rsi_l']") as HTMLElement;
    expect(rsi.getAttribute("data-tick-tone")).toBe("AT_BOUND");
    expect(rsi.style.background).toBe("var(--bad)");
    expect(panel.querySelector("[data-frozen-parameter='rsi_l'] [data-bound-warning]")?.textContent).toBe("100% · at upper bound");
    expect(panel.querySelector("[data-frozen-parameter='len_vol'] [data-bound-warning]")?.textContent).toBe("0% · at lower bound");
    expect(panel.querySelector("[data-frozen-range]")).toBeNull();
    expect(panel.textContent).not.toContain("UI_RETAINED_LANE_HAS_NO_FIELD");
  });

  it("a server that answers the range absent prints its own reason, never the UI code", async () => {
    stub({ ...FREEZE, declared_space: { ...FREEZE.declared_space!, state: "NOT_PUBLISHED", reason_code: "P16_HISTORICAL_PARAMETER_BINDING_NOT_REGISTERED", binding: null, parameters: [], grid_size: null } });
    const { container } = await settled();
    const range = container.querySelector("[data-frozen-range]");
    expect(range?.getAttribute("data-reason")).toBe("P16_HISTORICAL_PARAMETER_BINDING_NOT_REGISTERED");
    expect(container.textContent).not.toContain("UI_RETAINED_LANE_HAS_NO_FIELD");
  });
});

describe("X2 · B4 — F4 binding down to Stage 4 is the server's verdict (CG-P16-02/03)", () => {
  it("real W5b seal: BOUND, four rows with ticks, each fold's generation child named", async () => {
    const { container } = await settled();
    const card = container.querySelector("[data-panel='stage4-binding']") as HTMLElement;
    expect(card.getAttribute("data-binding-state")).toBe("BOUND");
    expect(card.querySelector("[data-binding-badge]")?.textContent).toBe("✓ BOUND");
    expect([...card.querySelectorAll("[data-binding-row]")].map((row) => [row.getAttribute("data-binding-row"), row.getAttribute("data-binding-row-state")])).toEqual([
      ["SEALED_PARAMS", "MATCH"], ["REPLAY_PARAMS", "MATCH"], ["SEALED_BUNDLE", "MATCH"], ["RUNTIME_BUNDLE", "MATCH"],
    ]);
    expect(card.querySelector("[data-binding-row='SEALED_PARAMS']")?.textContent).toContain("2671e27b827ab2701d52e6ce  ✓");
    expect([...card.querySelectorAll("[data-binding-folds='REPLAY_PARAMS'] [data-binding-fold]")].map((fold) => fold.getAttribute("data-binding-fold-state"))).toEqual(["MATCH", "MATCH"]);
    // CG-P16-03: code-fixed values are a typed absence with the exact hash scope.
    const authority = card.querySelector("[data-parameter-authority]") as HTMLElement;
    expect(authority.getAttribute("data-parameter-authority")).toBe("NOT_PUBLISHED");
    expect(authority.querySelector("[data-code-fixed-reason]")?.getAttribute("data-code-fixed-reason")).toBe("P04_DELTA_KERNEL_PUBLISHES_NO_CODE_FIXED_VALUE_LIST");
    expect(authority.textContent).toContain("8 declared parameters are inside the params digest");
  });

  it("a drifted generation child reads ✕ DRIFT — BLOCKED on the fold that drifted", async () => {
    const binding = structuredClone(FREEZE.stage4_binding!);
    binding.state = "DRIFT";
    binding.pairs.params = "MISMATCH";
    binding.rows[1] = { ...binding.rows[1]!, value: null, state: "MISMATCH", folds: [binding.rows[1]!.folds[0]!, { ...binding.rows[1]!.folds[1]!, value: "baf7c707c2436a55bb012a15", state: "MISMATCH" }] };
    stub({ ...FREEZE, stage4_binding: binding });
    const { container } = await settled();
    const card = container.querySelector("[data-panel='stage4-binding']") as HTMLElement;
    expect(card.querySelector("[data-binding-badge]")?.textContent).toBe("✕ DRIFT — BLOCKED");
    expect(card.querySelector("[data-binding-row='REPLAY_PARAMS']")?.textContent).toContain("differs by fold ✕");
    expect(card.querySelector("[data-binding-fold='1']")?.getAttribute("data-binding-fold-state")).toBe("MISMATCH");
    expect(card.textContent).toContain("Stage 5 must refuse this run");
  });
});

describe("X2 · F5 — T10 copy θ* digest", () => {
  it("copies the full θ* params digest — the one F4 binds — and confirms once written", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { container } = await settled();
    const button = container.querySelector("[data-panel='frozen-parameters'] [data-action='copy-theta-digest']") as HTMLElement;
    await act(async () => {
      fireEvent.click(button);
    });
    const digest = container.querySelector("[data-params-digest]")?.getAttribute("data-params-digest");
    expect(writeText).toHaveBeenCalledWith(digest);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(button.textContent).toBe("✓ θ* digest copied");
  });

  it("wall clock on the WFO lane carries the server's reason, not a UI code", async () => {
    const { container } = await settled();
    const wall = container.querySelector("[data-axis='WALL_CLOCK'] [data-absence]");
    expect(wall?.getAttribute("data-reason")).toBe("QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_FREEZE_OR_OOS_READ_CLOCKS");
    expect(container.innerHTML).not.toContain("UI_RETAINED_LANE_HAS_NO_FIELD");
  });
});

/* ------------------------------------------------------------------------
 * E2c · row 7.9 — the F3 digest chain on the retained WFO lane
 *
 * Every link is read from the published canonical fixture: the declared
 * parameter set and the strategy source from the X2 parameter authority, the
 * params and bundle digests from the server's own F4 rows, and the engine,
 * dataset and config from the seal's provenance. Nothing is recomputed.
 * --------------------------------------------------------------------- */
describe("E2c · 7.9 — S07 draws the digest chain from served facts only", () => {
  const LINKS = ["CANONICAL_FORM", "PARAMS_DIGEST", "STRATEGY_SOURCE", "ENGINE_PIN", "DATASET_HASH", "CONFIG_HASH", "BUNDLE_DIGEST"];

  it("does not label imported-source authority as the protected fixed kernel", () => {
    const fixture: CurrentSourceFreeze = { ...FREEZE, parameter_authority: { ...FREEZE.parameter_authority!,
      code_fixed: { ...FREEZE.parameter_authority!.code_fixed, hash_scope: "SOURCE_CODE_SHA256" } } };
    const source = retainedDigestChain(fixture).links.find(link => link.key === "STRATEGY_SOURCE")!;
    expect(source.rule).toBe("SOURCE_CODE_SHA256");
    expect(source.value).toBe(fixture.parameter_authority!.code_fixed.code_digest);
  });

  it("binds a newly published hub engine pin but preserves historical absence", () => {
    const old = W3B.hub_freeze as FreezeDetail;
    const fixture: FreezeDetail = { ...old, engine_pin: { state: "AVAILABLE", availability: { state: "AVAILABLE", reason_code: null },
      engine_version: "1.1.1", execution_adapter_id: "p04.delta-rsi.v1", adapter_contract_digest: "a".repeat(64),
    } };
    expect(hubDigestChain(fixture).links.find(link => link.key === "ENGINE_PIN")!.value).toBe("1.1.1");
    expect(hubDigestChain(old).links.find(link => link.key === "ENGINE_PIN")!.value).toBeNull();
  });

  it("draws all seven links in the hi-fi's order, each from its own served field", async () => {
    const { container } = await settled();
    const chain = container.querySelector("[data-panel='digest-chain']") as HTMLElement;
    expect(chain).toBeTruthy();
    expect(chain.getAttribute("data-chain-lane")).toBe("RS02_RETAINED_CHILD_AUDIT");
    expect([...chain.querySelectorAll("[data-chain-link]")].map((li) => li.getAttribute("data-chain-link"))).toEqual(LINKS);
    /* This seal publishes every link. */
    expect(chain.getAttribute("data-chain-published")).toBe("7");
    expect([...chain.querySelectorAll("[data-chain-link]")].every((li) => li.getAttribute("data-chain-link-state") === "PUBLISHED")).toBe(true);
  });

  it("prints the seal's own values: the theta digest, the protected source, the engine, the dataset and the config", async () => {
    const { container } = await settled();
    const link = (key: string) => container.querySelector(`[data-chain-link='${key}']`) as HTMLElement;
    const sealed = FREEZE.stage4_binding!.sealed_params_sha256!;
    /* The params digest is the sealed theta sha256 the server binds in F4, elided with the full value in the title. */
    expect(link("PARAMS_DIGEST").textContent).toContain(`sha256:${sealed.slice(0, 12)}`);
    expect(link("PARAMS_DIGEST").querySelector("span[title]")!.getAttribute("title")).toBe(sealed);
    /* The strategy source is the protected kernel digest, named by its hash rule. */
    expect(link("STRATEGY_SOURCE").textContent).toContain("PROTECTED_SHA256");
    expect(link("STRATEGY_SOURCE").querySelector("span[title]")!.getAttribute("title")).toBe(FREEZE.parameter_authority!.code_fixed.code_digest);
    /* The engine pin is the seal's own recorded version, not a build constant. */
    expect(link("ENGINE_PIN").textContent).toContain(FREEZE.provenance.engine_version);
    expect(link("DATASET_HASH").querySelector("span[title]")!.getAttribute("title")).toBe(FREEZE.provenance.dataset_binding_digest);
    expect(link("CONFIG_HASH").querySelector("span[title]")!.getAttribute("title")).toBe(FREEZE.provenance.effective_spec_digest);
    /* The bundle digest is QuantBT's own strategy fingerprint on this lane, and the card says so. */
    const bundle = FREEZE.stage4_binding!.rows.find((row) => row.key === "SEALED_BUNDLE")!;
    expect(link("BUNDLE_DIGEST").querySelector("span[title]")!.getAttribute("title")).toBe(bundle.value);
    expect(link("BUNDLE_DIGEST").textContent).toContain("QuantBT strategy fingerprint");
  });

  it("does not label the sealed sha256 with the candidate-id rule it is not", async () => {
    const { container } = await settled();
    const params = container.querySelector("[data-chain-link='PARAMS_DIGEST']") as HTMLElement;
    /* F4 compares QuantBT's candidate id on this lane; the digest printed here
       is the sha256 beside it, so it may not borrow that row's rule. */
    expect(params.querySelector("[data-chain-rule='PARAMS_DIGEST']")!.textContent).toBe("sha256 of the sealed canonical parameter map");
    expect(params.textContent).not.toContain("QuantBT candidate id");
    const candidateId = FREEZE.stage4_binding!.rows.find((row) => row.key === "SEALED_PARAMS")!.value;
    expect(candidateId).not.toBe(FREEZE.stage4_binding!.sealed_params_sha256);
    expect(params.textContent).not.toContain(candidateId!.slice(0, 12));
  });

  it("names the parameter set that is hashed, and the scope it is hashed into", async () => {
    const { container } = await settled();
    const canonical = container.querySelector("[data-chain-link='CANONICAL_FORM']") as HTMLElement;
    for (const name of FREEZE.parameter_authority!.declared.names) expect(canonical.textContent).toContain(name);
    expect(canonical.textContent).toContain("params digest");
  });

  it("a link the seal did not publish says so with the server's reason, never a dash or a zero", async () => {
    stub({
      ...FREEZE,
      parameter_authority: {
        ...FREEZE.parameter_authority!,
        state: "NOT_PUBLISHED",
        reason_code: "P16_HISTORICAL_PARAMETER_BINDING_NOT_REGISTERED",
        declared: { hash_scope: "PARAMS_DIGEST", names: [] },
        code_fixed: { ...FREEZE.parameter_authority!.code_fixed, code_digest: null },
      },
    });
    const { container } = await settled();
    const chain = container.querySelector("[data-panel='digest-chain']") as HTMLElement;
    expect(chain.getAttribute("data-chain-published")).toBe("5");
    for (const key of ["CANONICAL_FORM", "STRATEGY_SOURCE"]) {
      const link = container.querySelector(`[data-chain-link='${key}']`) as HTMLElement;
      expect(link.getAttribute("data-chain-link-state")).toBe("NOT_PUBLISHED");
      expect(link.textContent).toContain("not published");
      expect(link.textContent).not.toContain("—");
      expect(link.querySelector("[data-chain-reason]")!.getAttribute("data-chain-reason")).toBeTruthy();
    }
  });

  it("verify stays one control: the chain states its scope and points at the card that owns the button", async () => {
    const { container } = await settled();
    const chain = container.querySelector("[data-panel='digest-chain']") as HTMLElement;
    expect(chain.querySelector("[data-chain-verify]")!.textContent).toBe("verify digest — below");
    expect(chain.querySelector("[data-chain-verify]")!.tagName).not.toBe("BUTTON");
    expect(chain.querySelector("button")).toBeNull();
    expect(container.querySelectorAll("[data-action='verify']")).toHaveLength(1);
    expect(chain.querySelector("[data-chain-note]")!.textContent).toContain("artifact integrity, not selection correctness");
    expect(chain.querySelector("[data-chain-note]")!.textContent).toContain("never issues a digest of its own");
  });
});
