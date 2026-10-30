// @vitest-environment node
/**
 * The `handoff` fixture scenario (register section 2h): ONE linked, SIMULATED chain of synthetic approvals. A published RC -> R1 pending /
 * approved / expired -> the R2 requests reachable from the approved R1 -> the approval-evidence read for each. The reads must agree on
 * ids, release candidate, hashes and instants; every body must still conform to its published schema; the Research half is not served;
 * writes stay refused; the positive world's bytes are unchanged.
 */
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { HANDOFF_AS_OF_MS, HANDOFF_CHAIN, HANDOFF_EVIDENCE_KIND, HANDOFF_IDS, HANDOFF_RC } from "../../e2e/bffWorldHandoff";
import { createFixtureServer, loadConfig, resetFixtureGlobals } from "../../../fixture-bff/app";
import { disposeSchemaCheck, violationsOf } from "./schemaCheck";

type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const EX = "/api/v1/execution/governance/approvals";
const SHA = /^sha256:[0-9a-f]{64}$/;
let server: Server;
let base = "";
let refuse = "";
const servers: Server[] = [];

async function listen(env: Record<string, string>): Promise<string> {
  const s = createFixtureServer(loadConfig({ PORT: "0", FIXTURE_HOST: "127.0.0.1", FIXTURE_REVIEW_PROFILE: "populated", ...env }));
  servers.push(s);
  await new Promise<void>((done) => s.listen(0, "127.0.0.1", done));
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
}
const get = async (path: string, origin = base): Promise<{ status: number; body: Body }> => {
  const response = await fetch(`${origin}${path}`);
  return { status: response.status, body: (await response.json()) as Body };
};
const r1 = async (id: string): Promise<Body> => (await get(`${EX}/${id}/r1`)).body;
const r2 = async (id: string): Promise<Body> => (await get(`${EX}/${id}/r2`)).body;
const evidence = async (id: string): Promise<Body> => (await get(`${EX}/${id}/evidence`)).body;

beforeAll(async () => {
  base = await listen({ FIXTURE_SCENARIO: "handoff" });
  refuse = await listen({ FIXTURE_SCENARIO: "handoff", FIXTURE_WRITES: "refuse" });
  server = servers[0]!;
}, 30_000);
afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise<void>((done) => s.close(() => done()))));
  resetFixtureGlobals();
  disposeSchemaCheck();
});

describe("the handoff scenario: every body conforms to its published schema", () => {
  it.each(Object.values(HANDOFF_IDS).filter((id) => id.includes("_r1_")))("R1 %s", async (id) => {
    const body = await r1(id);
    expect(violationsOf({ file: "execution-governance-approval-workflow.v1", ptr: "/$defs/R1ReviewResponse" }, body).violations).toEqual([]);
  });
  it.each([HANDOFF_IDS.r2, HANDOFF_IDS.r2Satellite])("R2 %s", async (id) => {
    expect(violationsOf({ file: "execution-governance-r2-review.v1", ptr: "" }, await r2(id)).violations).toEqual([]);
  });
  it.each(Object.keys(HANDOFF_EVIDENCE_KIND))("evidence %s", async (id) => {
    expect(violationsOf({ file: "execution-approval-evidence.v1", ptr: "" }, await evidence(id)).violations).toEqual([]);
  });
});

describe("the chain is one record", () => {
  it("R1 states: pending, decided (approved) and expired, each with a NON-null release candidate", async () => {
    const pending = (await r1(HANDOFF_IDS.r1Pending)).data;
    const approved = (await r1(HANDOFF_IDS.r1Approved)).data;
    const expired = (await r1(HANDOFF_IDS.r1Expired)).data;
    expect([pending.approval.status, approved.approval.status, expired.approval.status]).toEqual(["PENDING", "APPROVED", "EXPIRED"]);
    for (const data of [pending, approved, expired]) {
      expect(typeof data.approval.release_candidate).toBe("string");
      expect(data.approval.release_candidate).not.toBe("");
      expect(data.approval.release_candidate).toMatch(/TEST_ONLY/);
    }
    expect(pending.eligibility.can_approve).toBe(true);
    expect(approved.eligibility).toMatchObject({ can_approve: false, locks: ["ALREADY_DECIDED"] });
    expect(expired.eligibility).toMatchObject({ can_approve: false, locks: ["EXPIRED"] });
    expect(approved.approval.quorum_met).toBe(approved.approval.quorum_required);
    expect(approved.decisions).toHaveLength(1);
    expect(pending.decisions).toEqual([]);
    expect(Date.parse(expired.approval.expires_at)).toBeLessThan(HANDOFF_AS_OF_MS);
    expect(Date.parse(approved.approval.expires_at)).toBeGreaterThan(HANDOFF_AS_OF_MS);
  });

  it("the approved R1 links to each R2, and each R2 links back with the same RC, id, hash and decision instant", async () => {
    const approved = (await r1(HANDOFF_IDS.r1Approved)).data;
    const targets = approved.linked_panels.map((panel: Body) => panel.approval_id).sort();
    expect(targets).toEqual([HANDOFF_IDS.r2, HANDOFF_IDS.r2Satellite].sort());
    for (const panel of approved.linked_panels as Body[]) {
      const { data } = await r2(panel.approval_id);
      expect(panel.href).toBe(`/governance/approvals/${panel.approval_id}/r2`);
      expect(data.approval.approval_id).toBe(panel.approval_id);
      expect(data.approval.release_candidate).toBe(HANDOFF_RC);
      expect(data.approval.release_candidate).toBe(approved.approval.release_candidate);
      expect(data.approval.portfolio_id).toBe(panel.portfolio_id);
      expect(data.r1_id).toBe(HANDOFF_IDS.r1Approved);
      expect(data.r1_reference).toMatchObject({ approval_id: approved.approval.approval_id, state: "APPROVED", href: `/governance/approvals/${HANDOFF_IDS.r1Approved}/r1` });
      expect(data.r1_reference.digest).toBe(approved.approval.evidence_set_hash);
      expect(data.r1_reference.expiry).toBe(approved.approval.expires_at);
      expect(data.r1_reference.decided_at).toBe(approved.decisions[0].decided_at);
      expect(data.evidence_manifest.entries[0].sha256).toBe(approved.approval.evidence_set_hash);
      expect(data.evidence_manifest.manifest_hash).toBe(data.approval.evidence_set_hash);
      expect(data.approval.evidence_set_hash).not.toBe(approved.approval.evidence_set_hash);
    }
  });

  it("only the approved R1 reaches an R2; the others link to none", async () => {
    expect((await r1(HANDOFF_IDS.r1Pending)).data.linked_panels).toEqual([]);
    expect((await r1(HANDOFF_IDS.r1Expired)).data.linked_panels).toEqual([]);
  });

  it("the three R1 requests do not share hashes or release candidates by accident", async () => {
    const approvals = await Promise.all([HANDOFF_IDS.r1Pending, HANDOFF_IDS.r1Approved, HANDOFF_IDS.r1Expired].map(async (id) => (await r1(id)).data.approval as Body));
    expect(new Set(approvals.map((a) => a.evidence_set_hash)).size).toBe(3);
    expect(new Set(approvals.map((a) => a.release_candidate)).size).toBe(3);
    for (const a of approvals) expect(a.evidence_set_hash).toMatch(SHA);
  });

  it("every read states the same instant, and the evidence ids/workspace match the request", async () => {
    for (const row of HANDOFF_CHAIN) {
      const review = row.gate === "R1" ? await r1(row.id) : await r2(row.id);
      const ev = await evidence(row.id);
      expect(Date.parse(review.read_at)).toBe(HANDOFF_AS_OF_MS);
      expect(ev.read_at_ms).toBe(HANDOFF_AS_OF_MS);
      expect(ev.approval_id).toBe(row.id);
      expect(review.data.approval.approval_id).toBe(row.id);
      expect(review.data.approval.release_candidate).toBe(row.release_candidate);
      expect(Date.parse(review.data.approval.created_at)).toBeLessThanOrEqual(HANDOFF_AS_OF_MS);
      if (ev.prior_economic_history) {
        expect(ev.prior_economic_history.as_of_ms).toBe(HANDOFF_AS_OF_MS);
        expect(ev.prior_economic_history.window.to_ms).toBe(HANDOFF_AS_OF_MS);
        expect(ev.prior_economic_history.points.at(-1).ts_ms).toBe(HANDOFF_AS_OF_MS);
      }
    }
    expect((await get(`${EX}/${HANDOFF_IDS.r2}/evidence?workspace_id=ws_TEST_ONLY_shared`)).body.workspace_id).toBe("ws_TEST_ONLY_shared");
  });

  it("the evidence read of an R2 names the portfolio its R2 names", async () => {
    for (const id of [HANDOFF_IDS.r2, HANDOFF_IDS.r2Satellite]) {
      const ev = await evidence(id);
      expect(ev.prior_economic_history.subject).toEqual({ subject_type: "PORTFOLIO", subject_id: (await r2(id)).data.approval.portfolio_id });
    }
  });
});

describe("the four published evidence cases, with typed absence kept", () => {
  it("published: NAV history, diff, obligations, preview", async () => {
    const ev = await evidence(HANDOFF_IDS.r2);
    expect(HANDOFF_EVIDENCE_KIND[HANDOFF_IDS.r2]).toBe("published");
    expect(ev.prior_economic_history.metric).toBe("NAV");
    expect(ev.evidence_diff.changes.length).toBeGreaterThan(0);
    expect(ev.obligations_after_approval.working_orders).toBe(0); // a true zero stays 0
    expect(ev.receipt_preview.what_changes).toContain("pf_TEST_ONLY_core");
  });
  it("drawdown: ratio history in FRACTION, no currency", async () => {
    const ev = await evidence(HANDOFF_IDS.r2Satellite);
    expect(ev.prior_economic_history).toMatchObject({ metric: "DRAWDOWN", unit: "RATIO", currency: null, ratio_scale: "FRACTION" });
    expect("evidence_diff" in ev).toBe(false);
  });
  it("no-source: the four sections are omitted, not null", async () => {
    for (const id of [HANDOFF_IDS.r1Pending, HANDOFF_IDS.r1Approved]) {
      const ev = await evidence(id);
      for (const key of ["prior_economic_history", "evidence_diff", "obligations_after_approval", "receipt_preview"]) expect(key in ev).toBe(false);
    }
  });
  it("not-read: the four sections are explicit null", async () => {
    const ev = await evidence(HANDOFF_IDS.r1Expired);
    expect(ev).toMatchObject({ prior_economic_history: null, evidence_diff: null, obligations_after_approval: null, receipt_preview: null });
  });
});

describe("boundaries", () => {
  it("is deterministic", async () => {
    expect(await r2(HANDOFF_IDS.r2)).toEqual(await r2(HANDOFF_IDS.r2));
    expect(await evidence(HANDOFF_IDS.r2)).toEqual(await evidence(HANDOFF_IDS.r2));
  });
  it("serves no Research route (the RC publication read stays on the real API)", async () => {
    expect((await get("/api/v1/research/release-candidates/rc_TEST_ONLY_handoff/publication")).status).toBe(404);
  });
  it("writes to the chain's paths stay refused (405 under FIXTURE_WRITES=refuse) and store nothing", async () => {
    const response = await fetch(`${refuse}${EX}/${HANDOFF_IDS.r1Pending}/r1`, { method: "POST", body: "{}" });
    expect(response.status).toBe(405);
    expect((await r1(HANDOFF_IDS.r1Pending)).data.approval.status).toBe("PENDING");
  });
  it("the lane declares itself and the scenario", async () => {
    const response = await fetch(`${base}${EX}/${HANDOFF_IDS.r1Pending}/r1`);
    expect(response.headers.get("x-fixture-lane")).toBe("FIXTURE_LAB");
    expect((await get("/__fixture/scenario")).body.scenario).toBe("handoff");
  });
  it("outside the chain's ids the scenario is the positive world, byte for byte; switching back leaves no trace", async () => {
    const positive = await listen({ FIXTURE_SCENARIO: "positive" });
    for (const path of [`${EX}/AP-101/r1`, `${EX}/AP-352/r2`, `${EX}/AP-352/evidence`, `${EX}`, "/api/v1/execution/manager/fleet?environment=live&limit=20"]) {
      const [a, b] = await Promise.all([fetch(`${base}${path}`).then((r) => r.text()), fetch(`${positive}${path}`).then((r) => r.text())]);
      expect(a, path).toBe(b);
    }
    const world = await get(`${EX}/AP-101/r1`);
    expect(world.body.data.approval.release_candidate).not.toBeNull();
    // in the positive world the chain's ids are not approvals at all
    expect((await get(`${EX}/${HANDOFF_IDS.r1Approved}/r1`, positive)).body.data?.approval?.status).not.toBe("EXPIRED");
    expect((await get(`${EX}/${HANDOFF_IDS.r2}/evidence`, positive)).body.workspace_id).toBe("ws_FIXTURE_LAB");
    await fetch(`${base}/__fixture/scenario`, { method: "POST", body: JSON.stringify({ scenario: "positive" }) });
    expect((await get(`${EX}/${HANDOFF_IDS.r2}/evidence`)).body.workspace_id).toBe("ws_FIXTURE_LAB");
    await fetch(`${base}/__fixture/scenario`, { method: "POST", body: JSON.stringify({ scenario: "handoff" }) });
    expect((await r1(HANDOFF_IDS.r1Approved)).data.approval.status).toBe("APPROVED");
    void server;
  });
});
