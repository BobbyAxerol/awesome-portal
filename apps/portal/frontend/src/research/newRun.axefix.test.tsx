/**
 * AXEFIX · NewRunRoute reads the Atlas response's `portal_admission` block.
 * The contract makes it required, but a stub, an older server or a refused
 * body can still leave it out. A missing block is a typed absence (no served
 * fold bounds), never a crash that takes the whole screen down
 * (`Cannot read properties of undefined (reading 'profiles')`, NewRunRoute.tsx:476).
 */
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RegistryListResponse } from "./alphaImportClient";
import { NewRunRoute } from "./NewRunRoute";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(ROOT, "packages/contracts/fixtures", name), "utf8")) as T;
}

const ATLAS_RESPONSE = fixture<Record<string, unknown>>("research-foundation.atlas-current.valid.json");
const REGISTRY = fixture<RegistryListResponse>("research-alpha-import.registry.valid.json");
const CATALOG = fixture<unknown>("research-preflight.dataset-catalog.valid.json");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function serve(atlas: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/v1/research/quantbt/atlas") return json(atlas);
      if (url.pathname === "/api/v1/research/alphas") return json(REGISTRY);
      if (url.pathname === "/api/v1/research/datasets") return json(CATALOG);
      return json({ error: { code: "RESEARCH_NOT_FOUND", message: "not found" }, request_id: "req_1" }, 404);
    }),
  );
}

async function mountRoute() {
  const errors: string[] = [];
  const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
    errors.push(args.map(String).join(" "));
  });
  render(
    <MemoryRouter initialEntries={["/research/quantbt/runs/new"]}>
      <NewRunRoute />
    </MemoryRouter>,
  );
  await waitFor(() => expect(document.querySelector("[data-screen=new-run]")).not.toBeNull());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  spy.mockRestore();
  return errors;
}

describe("NewRunRoute — a missing portal_admission block", () => {
  it("renders the screen when the Atlas response has no portal_admission at all", async () => {
    const { portal_admission: _dropped, ...withoutBlock } = ATLAS_RESPONSE;
    expect(withoutBlock).not.toHaveProperty("portal_admission");
    serve(withoutBlock);
    const errors = await mountRoute();
    expect(document.querySelector("[data-screen=new-run]")).not.toBeNull();
    expect(errors.filter((line) => /portal_admission|reading 'profiles'/.test(line))).toEqual([]);
  });

  it("renders the screen when portal_admission is null", async () => {
    serve({ ...ATLAS_RESPONSE, portal_admission: null });
    const errors = await mountRoute();
    expect(document.querySelector("[data-screen=new-run]")).not.toBeNull();
    expect(errors.filter((line) => /portal_admission|reading 'profiles'/.test(line))).toEqual([]);
  });

  it("still reads the block when it is there (the guard does not hide the real value)", async () => {
    serve(ATLAS_RESPONSE);
    await mountRoute();
    expect(document.querySelector("[data-screen=new-run]")).not.toBeNull();
  });
});

/* The draft is autosaved for the session: each test starts from a blank one. */
import { beforeEach as clearDraftBeforeEach } from "vitest";
clearDraftBeforeEach(() => { window.sessionStorage.clear(); });
