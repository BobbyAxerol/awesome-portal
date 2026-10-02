/**
 * QA 2026-10-02 · S12 UX-2 - the Atlas "declare ->" link carries the mode and the
 * schedule, and New Run reads both against the same atlas (canonical fixtures).
 */
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RegistryListResponse } from "./alphaImportClient";
import type { AtlasDocument } from "./atlas";
import { declareModeHref } from "./EngineAtlas";
import { NewRunRoute } from "./NewRunRoute";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const fixture = <T,>(name: string): T => JSON.parse(readFileSync(join(ROOT, "packages/contracts/fixtures", name), "utf8")) as T;
const ATLAS_RESPONSE = fixture<{ atlas: AtlasDocument }>("research-foundation.atlas-current.valid.json");
const REGISTRY = fixture<RegistryListResponse>("research-alpha-import.registry.valid.json");
const CATALOG = fixture<unknown>("research-preflight.dataset-catalog.valid.json");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function serve() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/v1/research/quantbt/atlas") return json(ATLAS_RESPONSE);
      if (url.pathname === "/api/v1/research/alphas") return json(REGISTRY);
      if (url.pathname === "/api/v1/research/datasets") return json(CATALOG);
      return json({ error: { code: "RESEARCH_NOT_FOUND", message: "not found" }, request_id: "req_1" }, 404);
    }),
  );
}

async function open(href: string) {
  serve();
  render(
    <MemoryRouter initialEntries={[href]}>
      <NewRunRoute />
    </MemoryRouter>,
  );
  await waitFor(() => expect(document.querySelector("[data-screen=new-run]")).not.toBeNull());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
  return () => document.body.textContent ?? "";
}

describe("S12 UX-2 - declare carries the mode", () => {
  it("the link names the mode and the schedule the card shows", () => {
    expect(declareModeHref("mode_4_is_only_robust", "per_fold_causal")).toBe(
      "/research/quantbt/runs/new?step=optimization&mode=mode_4_is_only_robust&schedule=per_fold_causal",
    );
  });

  it("value path: New Run opens with that mode and schedule chosen", async () => {
    /* The review step prints the declared pair, so the pair is read there. */
    const text = await open(declareModeHref("mode_4_is_only_robust", "per_fold_causal").replace("step=optimization", "step=review"));
    expect(text()).toContain("mode_4_is_only_robust × per_fold_causal");
  });

  it("typed-absence path: a mode the atlas does not list is ignored, not invented", async () => {
    const text = await open("/research/quantbt/runs/new?step=review&mode=mode_99_made_up&schedule=global");
    expect(text()).not.toContain("mode_99_made_up");
  });
});
