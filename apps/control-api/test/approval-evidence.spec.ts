import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { SessionGuard } from "../src/facade/session.guard";
import { ApprovalEvidenceController } from "../src/approval-evidence/approval-evidence.controller";
import { SourceNotCommissionedApprovalEvidencePort } from "../src/approval-evidence/approval-evidence.dark";
import { EVIDENCE_FIELD_AUTHORITY_DENY_ALL, type ApprovalEvidenceFieldAuthority, type ApprovalEvidencePrincipal, type ApprovalVisibility } from "../src/approval-evidence/approval-evidence.authority";
import { approvalEvidenceResponse } from "../src/approval-evidence/approval-evidence.contract";
import type { ApprovalEvidencePort } from "../src/approval-evidence/approval-evidence.port";
import { approvalEvidenceDependency } from "../src/approval-evidence/approval-evidence.bootstrap";
import { ApprovalEvidenceReads } from "../src/approval-evidence/approval-evidence.service";
import { OperationalReadError } from "../src/operations/current-operational-read";

const contracts = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const fixture = (name: string) => JSON.parse(readFileSync(resolve(contracts, "fixtures", `execution-approval-evidence.${name}.json`), "utf8"));
const published = fixture("published.synthetic.valid").value;
const negatives = fixture("synthetic.negative");

const WS = "ws-1";
const principal = { user: { userId: "u1" }, session: { sessionId: "s1" }, workspaceId: WS } as unknown as ApprovalEvidencePrincipal;
const SEE: ApprovalVisibility = { visible: async () => true };
const HIDE: ApprovalVisibility = { visible: async () => false };
const ALLOW: ApprovalEvidenceFieldAuthority = { allows: () => true };
const dark = () => new SourceNotCommissionedApprovalEvidencePort();
const reads = (port: ApprovalEvidencePort = dark(), vis: ApprovalVisibility = SEE, auth?: ApprovalEvidenceFieldAuthority) => new ApprovalEvidenceReads(port, vis, auth, vis);
const failure = async (p: Promise<unknown>, status: number, code?: string) => {
  const e = await p.then(() => null, (x) => x);
  expect(e).not.toBeNull();
  expect(e.status).toBe(status);
  if (code) expect(e.code).toBe(code);
};
const sections = ({ prior_economic_history, evidence_diff, obligations_after_approval, receipt_preview }: any) => ({ prior_economic_history, evidence_diff, obligations_after_approval, receipt_preview });

describe("approval evidence contract (zod mirrors the published fixtures)", () => {
  for (const name of ["published", "drawdown", "no-source", "not-read"]) {
    it(`accepts the ${name} fixture`, () => {
      expect(approvalEvidenceResponse.safeParse(fixture(`${name}.synthetic.valid`).value).success).toBe(true);
    });
  }
  for (const c of negatives.cases) {
    it(`rejects ${c.id}: ${c.rule}`, () => {
      const body = structuredClone(fixture(`${c.base}.synthetic.valid`).value);
      for (const op of c.ops) {
        const holder = op.path.slice(0, -1).reduce((node: any, key: string | number) => node[key], body);
        if (op.op === "delete") delete holder[op.path.at(-1)]; else holder[op.path.at(-1)] = op.value;
      }
      expect(approvalEvidenceResponse.safeParse(body).success).toBe(false);
    });
  }
});

describe("approval evidence read (dark port, deny-all field authority)", () => {
  it("answers the typed no-source body: sections omitted, never 0 or null", async () => {
    const body = await reads().detail(principal, "approval-1", { workspace_id: WS });
    expect(approvalEvidenceResponse.safeParse(body).success).toBe(true);
    expect(body).toMatchObject({ schema_version: "portal.execution.approval-evidence.v1", workspace_id: WS, approval_id: "approval-1", record_authority: "PORTAL_PROJECTION" });
    expect(Object.keys(body).sort()).toEqual(["approval_id", "read_at_ms", "record_authority", "schema_version", "workspace_id"]);
    const reference = fixture("no-source.synthetic.valid").value;
    expect(Object.keys(body).sort()).toEqual(Object.keys(reference).sort());
  });
  it("a source that was not read is null per section, matching the not-read fixture", async () => {
    const port: ApprovalEvidencePort = { read: async (r) => ({ identity: r, sections: { prior_economic_history: null, evidence_diff: null, obligations_after_approval: null, receipt_preview: null } }) };
    const body = await reads(port).detail(principal, "approval-1", {});
    expect(sections(body)).toEqual({ prior_economic_history: null, evidence_diff: null, obligations_after_approval: null, receipt_preview: null });
    expect(Object.keys(body).sort()).toEqual(Object.keys(fixture("not-read.synthetic.valid").value).sort());
  });
  it("a throwing source is not-read for every section, never an invented value", async () => {
    const port: ApprovalEvidencePort = { read: async () => { throw new Error("boom"); } };
    const body = await reads(port).detail(principal, "approval-1", {});
    expect(sections(body)).toEqual({ prior_economic_history: null, evidence_diff: null, obligations_after_approval: null, receipt_preview: null });
  });
  it("deny-all field authority withholds a published section as null (nothing leaks)", async () => {
    const port: ApprovalEvidencePort = { read: async (r) => ({ identity: r, sections: { obligations_after_approval: published.obligations_after_approval } }) };
    const body = await reads(port).detail(principal, "approval-1", {});
    expect(body.obligations_after_approval).toBeNull();
    expect(JSON.stringify(body)).not.toContain("open_positions");
    expect(EVIDENCE_FIELD_AUTHORITY_DENY_ALL.allows("evidence_diff", principal, "approval-1")).toBe(false);
  });
  it("with an authorizing override a published fixture passes the strict shape, true zeros kept", async () => {
    const port: ApprovalEvidencePort = { read: async (r) => ({ identity: r, sections: sections(published) }) };
    const body = await reads(port, SEE, ALLOW).detail(principal, "approval-1", {});
    expect(approvalEvidenceResponse.safeParse(body).success).toBe(true);
    expect(body.obligations_after_approval).toEqual(published.obligations_after_approval);
    expect(body.obligations_after_approval?.working_orders).toBe(0);
  });
  it("refuses a malformed published section instead of passing it through", async () => {
    const port: ApprovalEvidencePort = { read: async (r) => ({ identity: r, sections: { obligations_after_approval: { ...published.obligations_after_approval, working_orders: -1 } } as any }) };
    await failure(reads(port, SEE, ALLOW).detail(principal, "approval-1", {}), 503, "OPERATIONAL_READ_PROVENANCE_INVALID");
  });
  it("does not expose corruption of a section the principal cannot read", async () => {
    const port: ApprovalEvidencePort = { read: async (r) => ({ identity: r, sections: {
      obligations_after_approval: { ...published.obligations_after_approval, working_orders: -1 },
    } as any }) };
    const result = await reads(port).detail(principal, "approval-1", {});
    expect(result.obligations_after_approval).toBeNull();
  });
  it("withholds a malformed section when its field authority is revoked during the final visibility check", async () => {
    let allowed = true;
    const visibility: ApprovalVisibility = { visible: vi.fn().mockImplementationOnce(async () => true).mockImplementationOnce(async () => {
      allowed = false;
      return true;
    }) };
    const port: ApprovalEvidencePort = { read: async (r) => ({ identity: r, sections: {
      obligations_after_approval: { ...published.obligations_after_approval, working_orders: -1 },
    } as any }) };
    const result = await reads(port, visibility, { allows: () => allowed }).detail(principal, "approval-1", {});
    expect(result.obligations_after_approval).toBeNull();
    expect(visibility.visible).toHaveBeenCalledTimes(2);
  });
  it.each(["mismatched identity", "malformed section", "source refusal"])(
    "approval revoke after a held %s replaces its private error",
    async (kind) => {
      let visible = true;
      const visibility: ApprovalVisibility = { visible: vi.fn(async () => visible) };
      const port: ApprovalEvidencePort = { read: async (r) => {
        visible = false;
        if (kind === "source refusal") throw new OperationalReadError("OPERATIONAL_READ_PROVENANCE_INVALID");
        if (kind === "mismatched identity") return { identity: { ...r, approvalId: "other" }, sections: {} };
        return { identity: r, sections: { obligations_after_approval: { ...published.obligations_after_approval, working_orders: -1 } } as any };
      } };
      await failure(reads(port, visibility, ALLOW).detail(principal, "approval-1", {}), 404, "APPROVAL_NOT_FOUND");
      expect(visibility.visible).toHaveBeenCalledTimes(2);
    },
  );
  it("refuses a port that answers for another approval or workspace", async () => {
    const other: ApprovalEvidencePort = { read: async () => ({ identity: { workspaceId: WS, approvalId: "other" }, sections: {} }) };
    await failure(reads(other).detail(principal, "approval-1", {}), 503);
    const foreign: ApprovalEvidencePort = { read: async () => ({ identity: { workspaceId: "ws-2", approvalId: "approval-1" }, sections: {} }) };
    await failure(reads(foreign).detail(principal, "approval-1", {}), 503);
  });
  it("bad approval id or query is a 400 before any visibility check", async () => {
    const visible = vi.fn(async () => true);
    const r = reads(dark(), { visible });
    for (const id of ["bad id!", "a".repeat(192), "x/y"]) await failure(r.detail(principal, id, {}), 400, "OPERATIONAL_READ_INPUT_INVALID");
    await failure(r.detail(principal, "approval-1", { workspace_id: WS, extra: "1" }), 400, "OPERATIONAL_READ_INPUT_INVALID");
    expect(visible).not.toHaveBeenCalled();
  });
  it("another workspace is 404 WORKSPACE_NOT_FOUND; an invisible approval is 404 APPROVAL_NOT_FOUND", async () => {
    await failure(reads().detail(principal, "approval-1", { workspace_id: "ws-2" }), 404, "WORKSPACE_NOT_FOUND");
    await failure(reads(dark(), HIDE).detail(principal, "approval-1", {}), 404, "APPROVAL_NOT_FOUND");
  });
  it("a visibility refusal (403) propagates and the port is never read", async () => {
    const port = dark(); const spy = vi.spyOn(port, "read");
    const deny: ApprovalVisibility = { visible: async () => { throw Object.assign(new Error("denied"), { status: 403, code: "GOVERNANCE_FORBIDDEN" }); } };
    await failure(reads(port, deny).detail(principal, "approval-1", {}), 403);
    expect(spy).not.toHaveBeenCalled();
  });
  it("refuses the body if approval visibility is revoked while the source is read", async () => {
    let visible = true;
    const authority: ApprovalVisibility = { visible: vi.fn(async () => visible) };
    const port: ApprovalEvidencePort = { read: async (r) => {
      visible = false;
      return { identity: r, sections: { obligations_after_approval: published.obligations_after_approval } };
    } };
    await failure(reads(port, authority, ALLOW).detail(principal, "approval-1", {}), 404, "APPROVAL_NOT_FOUND");
    expect(authority.visible).toHaveBeenCalledTimes(2);
  });
  it("propagates a final session or gate refusal after source read", async () => {
    const denied = Object.assign(new Error("revoked"), { status: 403, code: "GOVERNANCE_FORBIDDEN" });
    const visible = vi.fn().mockResolvedValueOnce(true).mockRejectedValueOnce(denied);
    await failure(reads(dark(), { visible }).detail(principal, "approval-1", {}), 403, "GOVERNANCE_FORBIDDEN");
    expect(visible).toHaveBeenCalledTimes(2);
  });
  it("withholds a section if field authority is revoked during the final visibility check", async () => {
    let allowed = true;
    const visibility: ApprovalVisibility = { visible: vi.fn().mockImplementationOnce(async () => true).mockImplementationOnce(async () => {
      allowed = false;
      return true;
    }) };
    const authority: ApprovalEvidenceFieldAuthority = { allows: vi.fn(() => allowed) };
    const port: ApprovalEvidencePort = { read: async (r) => ({ identity: r, sections: { obligations_after_approval: published.obligations_after_approval } }) };
    const body = await reads(port, visibility, authority).detail(principal, "approval-1", {});
    expect(body.obligations_after_approval).toBeNull();
    expect(JSON.stringify(body)).not.toContain("open_positions");
    expect(authority.allows).toHaveBeenCalledTimes(2);
  });
  it("does not upgrade an initially withheld section if authority appears mid-read", async () => {
    let allowed = false;
    const visibility: ApprovalVisibility = { visible: vi.fn().mockImplementationOnce(async () => true).mockImplementationOnce(async () => {
      allowed = true;
      return true;
    }) };
    const authority: ApprovalEvidenceFieldAuthority = { allows: vi.fn(() => allowed) };
    const port: ApprovalEvidencePort = { read: async (r) => ({ identity: r, sections: { obligations_after_approval: published.obligations_after_approval } }) };
    const body = await reads(port, visibility, authority).detail(principal, "approval-1", {});
    expect(body.obligations_after_approval).toBeNull();
    expect(authority.allows).toHaveBeenCalledTimes(1);
  });
});

describe("approval evidence controller", () => {
  const request = { portalUser: { userId: "u1" }, portalSession: { sessionId: "s1" }, portalWorkspaceId: WS } as any;
  const make = (members: string[]) => {
    const detail = vi.fn(async () => ({ ok: true }));
    const c = new ApprovalEvidenceController({ detail } as any, { isMember: async (w: string) => members.includes(w) } as any);
    return { c, detail };
  };
  it("is session guarded, cache-private and routed under /api/v1/execution", () => {
    expect(Reflect.getMetadata("__guards__", ApprovalEvidenceController)).toContain(SessionGuard);
    expect(Reflect.getMetadata("path", ApprovalEvidenceController)).toBe("/api/v1/execution");
    expect(Reflect.getMetadata("path", ApprovalEvidenceController.prototype.detail)).toBe("/governance/approvals/:approval_id/evidence");
    expect(Reflect.getMetadata("__headers__", ApprovalEvidenceController.prototype.detail)).toEqual([{ name: "Cache-Control", value: "private, no-store" }]);
  });
  it("defaults to the session workspace and passes the explicit one through", async () => {
    const { c, detail } = make([WS, "ws-9"]);
    await c.detail(request, "a1", {});
    expect(detail).toHaveBeenLastCalledWith(expect.objectContaining({ workspaceId: WS }), "a1", {});
    await c.detail(request, "a1", { workspace_id: "ws-9" });
    expect(detail).toHaveBeenLastCalledWith(expect.objectContaining({ workspaceId: "ws-9" }), "a1", { workspace_id: "ws-9" });
  });
  it("a non-member or malformed workspace is 404 and reads nothing", async () => {
    const { c, detail } = make([WS]);
    await failure(c.detail(request, "a1", { workspace_id: "ws-9" }), 404, "WORKSPACE_NOT_FOUND");
    await failure(c.detail(request, "a1", { workspace_id: 5 }), 404, "WORKSPACE_NOT_FOUND");
    expect(detail).not.toHaveBeenCalled();
  });
});

describe("approval evidence bootstrap gate", () => {
  const base = { EXECUTION_READ_PROFILE: "retained_review_v1", PORTAL_ENV: "local", AUTH_MODE: "dev" };
  it("mounts only on the local dev retained-review stack", () => {
    expect(approvalEvidenceDependency(base)).toEqual({ approvalEvidence: "SOURCE_DARK" });
    for (const other of [{ EXECUTION_READ_PROFILE: "source_current_v1" }, { EXECUTION_READ_PROFILE: "native_manager_review_v1" }, { PORTAL_ENV: "production" }, { PORTAL_ENV: "dev" }, { AUTH_MODE: "cloudflare_access" }, { AUTH_MODE: undefined }])
      expect(approvalEvidenceDependency({ ...base, ...other })).toEqual({});
    expect(approvalEvidenceDependency({})).toEqual({});
  });
});
