// @vitest-environment node
/**
 * The register reads of the screen run over the BODY THE FIXTURE SERVES (N9b-01): the closed V2 reader must accept it.
 * Round E changed the register health; the screen went Unavailable on the preview although the route answered 200. This class must not regress.
 */
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFixtureServer, loadConfig, resetFixtureGlobals } from "../../../fixture-bff/app";
import { resetScenario } from "../../../fixture-bff/scenario";
import { readPortfolioList } from "../execution/api/profileRead";
import { readManagerDataset } from "../execution/v2/readers/managerDataset";

let server: Server;
let base = "";
beforeAll(async () => {
  server = createFixtureServer(loadConfig({ PORT: "0", FIXTURE_HOST: "127.0.0.1", FIXTURE_REVIEW_PROFILE: "populated", FIXTURE_SCALE: "medium" }));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/execution`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
  resetFixtureGlobals();
  resetScenario();
});
const get = async (path: string) => { const r = await fetch(`${base}${path}`); return { status: r.status, body: await r.json() as any }; }; // eslint-disable-line @typescript-eslint/no-explicit-any

describe("the register reads over the served bodies", () => {
  it("GET /portfolios is read by the screen's own reader, every row, with the Canary health", async () => {
    const { status, body } = await get("/portfolios");
    expect(status).toBe(200);
    const read = readPortfolioList(body);
    expect(read, "the reader rejected the body the fixture serves").not.toBeNull();
    expect(read!.items.length).toBe(body.items.length);
    expect(body.items.length).toBeGreaterThan(20);
  });
  it("the Canary row is not HEALTHY while a Critical incident is open on it, in the reader's own vocabulary", async () => {
    const read = readPortfolioList((await get("/portfolios")).body)!;
    const canary = read.items.find((item) => item.portfolioId === "pf_TEST_ONLY_canary")!;
    expect(canary.health?.state).toBe("PUBLISHED");
    expect(canary.health && canary.health.state === "PUBLISHED" ? canary.health.value : null).not.toBe("HEALTHY");
  });

  it("the grouped Fleet read the register and Compare make is read by the manager reader in every environment, asked with limit 1 or 200", async () => {
    for (const environment of ["live", "paper", "sandbox"]) {
      for (const limit of [1, 200]) {
        const { status, body } = await get(`/manager/fleet?environment=${environment}&window=${encodeURIComponent('"90D"')}&group_by=portfolio_id&limit=${limit}`);
        expect(status, `${environment} limit ${limit}`).toBe(200);
        expect(readManagerDataset(body), `${environment} limit ${limit}: the reader rejected the served fleet group read`).not.toBeNull();
      }
    }
  });

  it("the portfolio overview (Compare's pair) is read by the manager reader", async () => {
    for (const id of ["pf_TEST_ONLY_core", "pf_TEST_ONLY_satellite", "pf_scale_001", "pf_scale_006"]) {
      const { status, body } = await get(`/manager/portfolios/${id}/overview?environment=live&window=${encodeURIComponent('"90D"')}`);
      expect(status, id).toBe(200);
      expect(readManagerDataset(body), `${id}: rejected`).not.toBeNull();
    }
  });
});
