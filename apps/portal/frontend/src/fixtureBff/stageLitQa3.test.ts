// @vitest-environment node
/**
 * WP-F3 QA3 round: on the canonical world the stage pages do not contradict THEMSELVES. One findings list drives the Sandbox chip, KPI and
 * Difference column; the envelope verdict is the rows' own; a live deployment's predecessor is its own alpha's canary or none; no content is
 * dated after the page's own as-of.
 */
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createFixtureServer, loadConfig, resetFixtureGlobals } from "../../../fixture-bff/app";

type Obj = Record<string, any>;
let server: import("node:http").Server;
let raw: (path: string) => Promise<Obj>;

beforeAll(async () => {
  server = createFixtureServer(loadConfig({ PORT: "0", FIXTURE_HOST: "127.0.0.1", FIXTURE_SCALE: "medium", FIXTURE_REVIEW_PROFILE: "populated", FIXTURE_SCENARIO: "positive" }));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  raw = async (path) => (await fetch(`${origin}/api/v1/execution${path}`)).json() as Promise<Obj>;
}, 30_000);
afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
  resetFixtureGlobals();
});

const cents = (text: string): bigint => {
  const negative = text.startsWith("-");
  const [w, f = ""] = (negative ? text.slice(1) : text).split(".");
  const v = BigInt(w!) * 100n + BigInt((f + "00").slice(0, 2));
  return negative ? -v : v;
};

describe("R4-01 Sandbox: one findings list", () => {
  for (const [id, mismatch] of [["dep_d1", false], ["dep_d1_mismatch", true]] as const) {
    it(`${id}: the open-finding count of the chip is the list's, and the Difference column shows exactly what the findings say`, async () => {
      const body = await raw(`/deployments/${id}/certification`);
      const rows = body.findings.rows as Obj[];
      expect(body.findings.total_count).toBe(rows.length);
      expect(body.stage_facts.reconciliation.open_finding_count.value).toBe(rows.length);
      expect(body.stage_facts.reconciliation.verdict.value).toBe("OPEN_FINDINGS");
      const by = Object.fromEntries((body.source_figures.figures as Obj[]).map((f) => [f.key, f]));
      expect(by.fees.difference.value).toBe("-0.01");
      expect(rows.some((r) => r.summary === "Fee total differs by 0.01 USDT")).toBe(true);
      if (mismatch) {
        expect(by.equity.difference.value).toBe("-46.87");
        expect(rows.some((r) => r.summary === "Equity differs by 46.87 USDT")).toBe(true);
      } else {
        expect(by.equity.difference.value).toBe("0");
        expect(rows.some((r) => String(r.summary).startsWith("Equity differs"))).toBe(false);
      }
    });
  }

  it("the timeline does not say it was submitted while the gate is blocked, names a person, and nothing is dated after the as-of or before its cause", async () => {
    const body = await raw("/deployments/dep_d1/certification");
    expect((body.timeline.rows as Obj[]).map((r) => r.action)).toEqual(["CREATE"]);
    expect(body.timeline.rows[0].actor_user_id).toBe("bobby");
    const asOf = Date.parse(body.stage_facts.reconciliation.as_of.value);
    const created = Date.parse(body.certification.created_at);
    for (const step of body.steps as Obj[]) if (step.as_of !== null) expect(Date.parse(step.as_of)).toBeGreaterThan(created);
    for (const plan of body.promotion_plans as Obj[]) expect(Date.parse(plan.created_at)).toBeLessThanOrEqual(asOf);
    for (const f of body.findings.rows as Obj[]) expect(Date.parse(f.created_at)).toBeLessThanOrEqual(asOf);
  });

  it("the venue is the account's: a Binance account is not an OKX certification", async () => {
    const body = await raw("/deployments/dep_d1/certification");
    expect(body.certification.venue).toBe("BINANCE");
  });
});

describe("R5-04 the envelope verdict is the rows' own", () => {
  for (const id of ["dep_canary_01", "dep_canary_01_breach", "dep_c1", "dep_canary_01_stale"]) {
    it(`${id}`, async () => {
      const body = await raw(`/deployments/${id}/canary`);
      const above = (body.envelope_compliance.rows as Obj[]).some((r) => cents(r.consumed.value) > cents(r.approved));
      expect(body.envelope_compliance.verdict.state).toBe(above ? "BREACH" : "WITHIN_ENVELOPE");
      for (const r of body.envelope_compliance.rows as Obj[]) expect(cents(r.policy_limit.value)).toBeGreaterThanOrEqual(cents(r.approved));
    });
  }
});

describe("R5-05 the predecessor is the alpha's own canary, or none", () => {
  it("Basis B's live deployments link its own canary; Carry A's finished trial is its history record (Alpha 360 lists Canary done)", async () => {
    const b = await raw("/deployments/dep_b1/live");
    expect((b.lineage as Obj[]).find((l) => l.kind === "CANARY_ENVELOPE")!.href).toBe("/deployments/live/dep_canary_01/canary");
    const a = await raw("/deployments/dep_live_01/live");
    const item = (a.lineage as Obj[]).find((l) => l.kind === "CANARY_ENVELOPE")!;
    // WP-B2-S3 R5-05: Alpha 360 says Carry A's Canary is done, so the predecessor tab has the finished trial's record and the link opens it
    expect(item).toMatchObject({ state: "AVAILABLE", href: "/deployments/live/dep_a_canary_hist/canary" });
    expect(a.predecessor_canary_envelope).not.toBeNull();
    const trial = await raw("/deployments/dep_a_canary_hist/canary");
    expect(trial.lifecycle.declared_stage).toBe("LIVE_CANARY");
    expect(trial.stage_facts.runtime.runtime_state.value).toBe("STOPPED");
  });
});

describe("R5-07 the roll-up header agrees with its rows", () => {
  it("a halted canary has a check that is not ready (the flatten plan), and so is not 'ready'", async () => {
    const body = await raw("/deployments/dep_c1/canary");
    const items = body.rollback_readiness.items as Obj[];
    expect(body.rollback_readiness.ready).toBe(false);
    expect(items.some((i) => i.ready.value === false)).toBe(true);
  });
});
