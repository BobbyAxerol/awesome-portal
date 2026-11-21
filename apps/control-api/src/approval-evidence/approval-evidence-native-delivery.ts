import type { ServerResponse } from "node:http";
import { accessDigest } from "../execution-v2/access-digest";
import type { CurrentViewSelection } from "../execution-v2/current-view-authority";
import type { CurrentViewCoreComposition } from "../execution-v2/current-view-composition";
import type { SelectedCurrentViewEdgeRead } from "../execution-v2/current-view-edge-client";
import { ExecutionReadScopeError, type ReadScopePrincipal } from "../execution-v2/read-scope";
import { GovernanceError } from "../governance/governance.service";
import { OperationalReadError } from "../operations/current-operational-read";
import type { ApprovalVisibility } from "./approval-evidence.authority";
import { APPROVAL_EVIDENCE_SECTION_NAMES, APPROVAL_ID_PATTERN, approvalEvidenceQuery, type ApprovalEvidenceSectionName } from "./approval-evidence.contract";
import type { ApprovalEvidenceAnswer } from "./approval-evidence.port";
import { ApprovalEvidenceReads } from "./approval-evidence.service";

type Read = (selection: SelectedCurrentViewEdgeRead) => Promise<{ status: 200; body: Buffer }>;
type Proof = Readonly<{ selection: number; field: string; detail: boolean }>;
type Requirement = Readonly<{ field: string; detail: boolean }>;
/** Server-owned, versioned output-path policy, NOT an Edge or HTTP payload.
 * A policy must be explicitly reviewed against the source's semantics. No
 * production policy or source is registered by importing this module. */
export type ApprovalEvidenceOutputPolicy = Readonly<Partial<Record<ApprovalEvidenceSectionName,
  Readonly<Record<string, Requirement>>>>>;
export interface ApprovalEvidenceNativeScope {
  readonly workspaceId: string; readonly viewerWorkspaceId: string; readonly principalId: string;
  readonly sessionId: string; readonly sessionGeneration: number; readonly approvalId: string;
}
/** A private server qualifier, never assembled from a caller or raw Edge DTO.
 * It must establish the exact approval-to-source relation, snapshot and
 * separately reviewed section permits, and keep them revocable in this flight. */
export interface ApprovalEvidenceNativePlan {
  readonly scope: ApprovalEvidenceNativeScope;
  readonly selections: readonly CurrentViewSelection[];
  readonly sections: readonly ApprovalEvidenceSectionName[];
  readonly fieldProofs: Readonly<Record<string, Proof>>;
  read(read: Read): Promise<ApprovalEvidenceAnswer>;
}
export interface ApprovalEvidenceNativeQualifier {
  prepare(scope: ApprovalEvidenceNativeScope): Promise<ApprovalEvidenceNativePlan>;
  revalidate(plan: ApprovalEvidenceNativePlan): Promise<void>;
  /** Synchronous and under the native physical-egress fence. Must revalidate
   * the approval, section grants, source relation and snapshot, not only user. */
  revalidateBeforeDispatch(plan: ApprovalEvidenceNativePlan): unknown;
}
const unavailable = (): never => { throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503); };
// deliverNative currently admits CURRENT only. Prior economic history and the
// previous-revision diff require a separately commissioned HISTORY purpose;
// a qualifier or selected CURRENT field cannot grant it by renaming a field.
const CURRENT_SECTIONS = new Set<ApprovalEvidenceSectionName>(["obligations_after_approval", "receipt_preview"]);

function leafPaths(value: unknown, path: string): string[] {
  if (Array.isArray(value)) return value.length ? value.flatMap(item => leafPaths(item, `${path}[]`)) : [path];
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value);
    return entries.length ? entries.flatMap(([key, item]) => leafPaths(item, `${path}.${key}`)) : [path];
  }
  return [path];
}

/** Unmounted server-side composition. Native custody remains held from source
 * read through physical HTTP dispatch. Importing this class grants nothing. */
export class ApprovalEvidenceNativeDelivery {
  private readonly policy: ApprovalEvidenceOutputPolicy;
  constructor(private readonly core: Pick<CurrentViewCoreComposition, "deliverNative" | "hasNativeCurrentRelations">,
    private readonly qualifier: ApprovalEvidenceNativeQualifier, private readonly visibility: ApprovalVisibility,
    policy: ApprovalEvidenceOutputPolicy, private readonly maxBytes = 262_144) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1024 || maxBytes > 1_048_576) throw Error("APPROVAL_EVIDENCE_BOUNDS_INVALID");
    this.policy = structuredClone(policy);
  }
  hasNativeCurrentRelations(): boolean { return this.core.hasNativeCurrentRelations(); }

  async deliver(principal: ReadScopePrincipal, approvalId: string, query: Record<string, unknown>, response: ServerResponse,
    beforeDispatch: () => void): Promise<void> {
    if (!this.hasNativeCurrentRelations()) return unavailable();
    const actor = structuredClone(principal), requested = structuredClone(query);
    const parsedQuery = approvalEvidenceQuery.safeParse(requested);
    if (!parsedQuery.success || !APPROVAL_ID_PATTERN.test(approvalId)) throw new OperationalReadError("OPERATIONAL_READ_INPUT_INVALID", 400);
    if (parsedQuery.data.workspace_id !== undefined && parsedQuery.data.workspace_id !== actor.workspaceId)
      throw new GovernanceError("WORKSPACE_NOT_FOUND", "Workspace not found.", 404);
    if (!(await this.visibility.visible({ user: actor.user, session: actor.session, workspaceId: actor.workspaceId }, approvalId)))
      throw new GovernanceError("APPROVAL_NOT_FOUND", "Approval not found.", 404);
    const scope: ApprovalEvidenceNativeScope = Object.freeze({ workspaceId: actor.workspaceId,
      viewerWorkspaceId: actor.viewerWorkspaceId ?? actor.workspaceId, principalId: actor.user.userId,
      sessionId: actor.session.sessionId, sessionGeneration: actor.session.sessionVersion, approvalId });
    const plan = await this.qualifier.prepare(scope);
    if (!plan || accessDigest(plan.scope) !== accessDigest(scope) || !Array.isArray(plan.selections) ||
      plan.selections.length < 1 || plan.selections.length > 4 || plan.selections.some(s => s.binding.environment !== "paper") ||
      !Array.isArray(plan.sections) || !plan.sections.length || new Set(plan.sections).size !== plan.sections.length ||
      plan.sections.some(s => !APPROVAL_EVIDENCE_SECTION_NAMES.includes(s) || !CURRENT_SECTIONS.has(s)) ||
      !plan.fieldProofs || typeof plan.fieldProofs !== "object" || typeof plan.read !== "function") return unavailable();
    const selections = structuredClone(plan.selections), proofs = structuredClone(plan.fieldProofs);
    const sections = new Set(plan.sections), sourceRead = plan.read;
    const signature = () => ({ scope: plan.scope, selections: plan.selections, sections: plan.sections, fieldProofs: plan.fieldProofs });
    const digest = accessDigest(signature());
    const unchanged = () => { if (accessDigest(signature()) !== digest || plan.read !== sourceRead) unavailable(); };
    const check = async () => { unchanged(); await this.qualifier.revalidate(plan); unchanged(); };
    await check();
    await this.core.deliverNative(actor, selections, response, async read => {
      await check();
      const observed = new Set<string>();
      const trackedRead: Read = async input => {
        const captured = structuredClone(input);
        const result = await read(captured);
        observed.add(accessDigest(captured.authority));
        return result;
      };
      const port = { read: async () => sourceRead.call(plan, trackedRead) };
      const fieldAuthority = { allows: (name: ApprovalEvidenceSectionName) => sections.has(name) };
      const reads = new ApprovalEvidenceReads(port, this.visibility, fieldAuthority, this.visibility);
      const body = await reads.detail({ user: actor.user, session: actor.session, workspaceId: actor.workspaceId }, approvalId, requested);
      for (const section of APPROVAL_EVIDENCE_SECTION_NAMES) {
        const value = body[section];
        if (value === undefined || value === null) continue;
        for (const path of new Set(leafPaths(value, section))) {
          const expected = this.policy[section]?.[path], proof = proofs[path];
          const selection = proof && selections[proof.selection];
          if (!expected || !proof || !Number.isSafeInteger(proof.selection) || !selection ||
            proof.field !== expected.field || proof.detail !== expected.detail ||
            !observed.has(accessDigest(selection)) ||
            !(proof.detail ? selection.detail_fields : selection.fields)?.includes(proof.field)) return unavailable();
        }
      }
      await check();
      const bytes = Buffer.from(JSON.stringify(body));
      if (bytes.length > this.maxBytes) return unavailable();
      return bytes;
    }, { validateAfterEnter: check, validateBeforeDispatch: () => {
      unchanged();
      const result = this.qualifier.revalidateBeforeDispatch(plan);
      if (result !== undefined) {
        if (result && typeof (result as { then?: unknown }).then === "function") void Promise.resolve(result).catch(() => undefined);
        unavailable();
      }
      unchanged(); beforeDispatch();
    } });
  }
}
