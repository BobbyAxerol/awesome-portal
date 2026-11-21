// @vitest-environment node
/** WP-B2-A: the approvals, the Overview cards and the people are COMPUTED from the world: every link resolves to the entity the card names, counts tie, one capital world per approval, one last-seen per person. */
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createFixtureServer, loadConfig, resetFixtureGlobals } from "../../../fixture-bff/app";
import { resetScenario } from "../../../fixture-bff/scenario";
import { NATIVE_ALPHAS, WORLD_INCIDENTS, WORLD_OPERATIONS } from "../../e2e/bffWorld";
import { stageHistoryOf } from "../../e2e/bffWorldStage";
import { approvalHref, approvalOfAlpha, capitalOf, fleetCounts, partitionAllocationCents, pendingApprovals, worldApprovals, worldHistoryRows } from "../../e2e/bffWorldGovernance";

/* eslint-disable @typescript-eslint/no-explicit-any */
let server: Server;
let base = "";
const E = "/api/v1/execution";
const get = async (path: string): Promise<{ status: number; body: any }> => {
  const response = await fetch(`${base}${path}`);
  let body: any = null;
  try { body = await response.json(); } catch { /* empty */ }
  return { status: response.status, body };
};
const post = async (path: string): Promise<{ status: number; body: any }> => {
  const response = await fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  return { status: response.status, body: await response.json().catch(() => null) };
};

beforeAll(async () => {
  server = createFixtureServer(loadConfig({ PORT: "0", FIXTURE_HOST: "127.0.0.1", FIXTURE_REVIEW_PROFILE: "populated", FIXTURE_SCALE: "medium", FIXTURE_REBASE_TIME: "1", FIXTURE_WRITES: "doubles" }));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
  resetFixtureGlobals();
  resetScenario();
});

describe("approvals derive from the stage history", () => {
  it("an alpha that has left a stage has that gate APPROVED, by the person the stage history names, on its date", () => {
    for (const alpha of NATIVE_ALPHAS) {
      const history = stageHistoryOf(alpha.id);
      const r1 = approvalOfAlpha(alpha.id, "R1")!;
      const r2 = approvalOfAlpha(alpha.id, "R2")!;
      expect([r1.status, r1.decidedBy, r1.decidedMs]).toEqual(["APPROVED", history.r1.by, history.r1.atMs]);
      expect([r2.status, r2.decidedBy, r2.decidedMs]).toEqual(["APPROVED", history.r2.by, history.r2.atMs]);
    }
    // Carry A is Live: AP-352 (its R2) is decided, never pending or overdue
    expect(approvalOfAlpha("alpha_a", "R2")!.id).toBe("AP-352");
    expect(approvalOfAlpha("alpha_a", "R2")!.status).toBe("APPROVED");
  });

  it("a pending request exists only for an alpha standing in front of that gate", () => {
    const pending = pendingApprovals();
    // WP-B2-A3: the generated universe's alphas carry requests too (bffWorldGenerated); the native ones are unchanged
    expect(pending.filter((a) => !a.alphaId.startsWith("alpha_scale_")).map((a) => `${a.alphaId}:${a.gate}`).sort()).toEqual(["alpha_c:LIVE_GATE", "alpha_d:SANDBOX_EXIT"]);
    for (const a of pending.filter((x) => x.stageFrom !== null)) expect(stageHistoryOf(a.alphaId).stages[a.stageFrom!].status).toBe("current");
    for (const a of pending.filter((x) => x.gate === "R1" || x.gate === "R2")) expect(a.deploymentId).toBeNull();
  });

  it("the inbox holds the pending ones, the history the decided ones, and every id has a page", async () => {
    const inbox = (await get(`${E}/governance/approvals?limit=200`)).body;
    const ids = inbox.page.rows.map((row: any) => row.id);
    for (const a of worldApprovals()) expect(ids.includes(a.id), a.id).toBe(a.status === "PENDING");
    expect(inbox.counts.pending).toBe(inbox.page.rows.length);
    const history = (await get(`${E}/governance/approvals/history`)).body.page.rows.map((row: any) => row.approval_id);
    expect(history).toEqual(worldHistoryRows().map((row) => row.approval_id));
    for (const id of ["AP-118", "AP-152", "AP-311", "AP-101", "AP-352"]) expect(history, id).toContain(id);
    for (const a of worldApprovals()) {
      const r = await get(`${E}${approvalHref(a)}`);
      expect(r.status, `${a.id} ${approvalHref(a)}`).toBe(200);
    }
  });

  it("the exit review a stage page opens is the review of that deployment's own alpha", async () => {
    const review = (await get(`${E}/governance/exit-reviews/EX-701`)).body;
    expect(review.review.deployment_id).toBe("dep_paper_01");
    expect(review.review.subject_label).toContain("Carry A");
  });
});

describe("one capital world per approval", () => {
  it("AP-352: the review, the preview and the evidence diff state the Core statement's allocation", async () => {
    const a = approvalOfAlpha("alpha_a", "R2")!;
    const capital = capitalOf(a);
    expect(capital.after.replace(".00", "")).toBe(String(Number(partitionAllocationCents("pf_TEST_ONLY_core", "live")) / 100));
    const review = (await get(`${E}/governance/approvals/AP-352/r2`)).body;
    const row = review.capital.find((r: any) => r.label === "allocated capital");
    expect([row.before.replace(/,/g, ""), row.after.replace(/,/g, "")]).toEqual([capital.before, capital.after]);
    const preview = (await post(`${E}/approvals/AP-352/capital-preview`)).body.analytics.data;
    expect([preview.allocated_before, preview.allocated_after]).toEqual([capital.before, capital.after]);
    const evidence = (await get(`${E}/governance/approvals/AP-352/evidence`)).body;
    const diff = evidence.evidence_diff?.changes.find((c: any) => c.label === "Allocated capital");
    if (diff !== undefined) expect([diff.before, diff.after]).toEqual([capital.before, capital.after]);
    const register = (await get(`${E}/manager/portfolios/pf_TEST_ONLY_core/overview?environment=live&window=30D`)).body;
    expect(register.capital_statements[0].metrics.allocation.value).toBe(capital.after);
    expect(String(evidence.receipt_preview?.what_changes ?? "")).not.toMatch(/pf_TEST_ONLY/);
  });
});

describe("Overview cards resolve to what they name", () => {
  it("every Needs attention and Today link opens the entity of the card, with the card's name", async () => {
    const cc = (await get(`${E}/compositions/command-center`)).body.data.command_center;
    const needs = cc.panels.needs_you.items as any[];
    expect(needs.length).toBeGreaterThan(0);
    expect(cc.panels.needs_you.total_count).toBeGreaterThanOrEqual(needs.length);
    for (const item of needs) {
      if (item.kind === "INCIDENT") {
        const incident = WORLD_INCIDENTS.find((i) => i.id === item.id)!;
        expect(item.href).toBe(`/execution/operations/incidents/${incident.id}`);
        expect((await get(`${E}/operations/incidents/${incident.id}`)).status).toBe(200);
      } else if (item.kind === "OPERATION") {
        const op = WORLD_OPERATIONS.find((o) => o.id === item.id)!;
        expect(item.href).toBe(`/execution/operations?operation=${op.id}`);
        expect((await get(`${E}/operations/${op.id}`)).status).toBe(200);
      } else {
        const a = worldApprovals().find((x) => x.id === item.id)!;
        expect(item.title).toBe(a.alphaLabel);
        expect(item.href).toBe(approvalHref(a));
        expect(a.status).toBe("PENDING");
        const page = (await get(`${E}${item.href}`)).body;
        const label = page.approval?.subject_label ?? page.governance_backbone?.data?.approval?.subject_label ?? page.review?.subject_label;
        expect(String(label)).toContain(a.alphaLabel);
      }
    }
    for (const item of cc.panels.today.items as any[]) {
      if (!item.href.startsWith("/governance/") && !item.href.startsWith("/execution/operations")) continue;
      const path = item.href.startsWith("/execution/operations?operation=") ? `${E}/operations/${item.href.split("=")[1]}` : `${E}${item.href}`;
      expect((await get(path)).status, item.href).toBe(200);
    }
  });

  it("the Fleet cells are the world's counts, and the incident and its page share one age", async () => {
    const cc = (await get(`${E}/compositions/command-center`)).body.data.command_center;
    const counts = fleetCounts();
    const fleet = cc.panels.fleet_health;
    expect(fleet.total_deployments).toBe(counts.deployments);
    const cell = (code: string) => fleet.cells.find((c: any) => c.code === code).value;
    expect([cell("LIVE_FULL"), cell("LIVE_CANARY"), cell("SANDBOX"), cell("PAPER")]).toEqual([counts.deploymentsByStage.LIVE, counts.deploymentsByStage.CANARY, counts.deploymentsByStage.SANDBOX, counts.deploymentsByStage.PAPER]);
    const summary = (await get(`${E}/alphas?limit=1`)).body.summary;
    // the Fleet list also holds the double's research-only alpha_e (no deployment): deployments are the shared unit
    expect(summary.deployment_count).toBe(counts.deployments);
    expect(summary.alpha_count - counts.alphas).toBe(1);
    const card = cc.panels.needs_you.items.find((i: any) => i.kind === "INCIDENT");
    const incident = (await get(`${E}${card.href.replace("/execution", "")}`)).body;
    const opened = Date.parse(incident.incident?.created_at ?? incident.created_at ?? incident.data?.created_at ?? "");
    const readAt = Date.parse(incident.read_at ?? incident.incident?.read_at ?? "");
    if (Number.isFinite(opened) && Number.isFinite(readAt)) {
      expect(Math.round((Date.parse(cc.read_at) - Date.parse(card.created_at)) / 60_000)).toBe(Math.round((readAt - opened) / 60_000));
    }
  });
});

describe("one last-seen per person", () => {
  it("a person's last sign-in is the same in the whole list, a filtered list and a page of their own", async () => {
    const all = (await get("/api/admin/accounts")).body.accounts as any[];
    const paged = (await get("/api/admin/accounts?limit=10")).body.accounts as any[];
    const filtered = (await get("/api/admin/accounts?q=hoa&limit=10")).body.accounts as any[];
    const of = (rows: any[]) => rows.find((r) => r.username === "hoa")?.last_sign_in_at;
    expect(of(all)).toBeTruthy();
    expect(of(paged)).toBe(of(all));
    expect(of(filtered)).toBe(of(all));
    // never in the future of the world clock
    for (const row of all) if (row.last_sign_in_at) expect(Date.parse(row.last_sign_in_at)).toBeLessThanOrEqual(Date.parse(cc_now(all)));
  });
});
const cc_now = (rows: any[]): string => rows.map((r) => r.last_sign_in_at).filter(Boolean).sort().at(-1) as string;
