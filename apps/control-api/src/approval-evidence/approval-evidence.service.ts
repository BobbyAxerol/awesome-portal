import { Inject, Injectable, Optional } from "@nestjs/common";
import { GovernanceError } from "../governance/governance.service";
import { OperationalReadError } from "../operations/current-operational-read";
import { EVIDENCE_FIELD_AUTHORITY_DENY_ALL, type ApprovalEvidenceFieldAuthority, type ApprovalEvidencePrincipal, type ApprovalVisibility } from "./approval-evidence.authority";
import { APPROVAL_EVIDENCE_SCHEMA, APPROVAL_ID_PATTERN, APPROVAL_EVIDENCE_SECTION_NAMES, approvalEvidenceQuery, approvalEvidenceResponse,
  approvalEvidenceSections, type ApprovalEvidenceResponse } from "./approval-evidence.contract";
import { APPROVAL_EVIDENCE_FIELD_AUTHORITY, APPROVAL_EVIDENCE_PORT, APPROVAL_EVIDENCE_VISIBILITY, type ApprovalEvidencePort } from "./approval-evidence.port";
import { GovernanceApprovalVisibility } from "./approval-evidence.visibility";

@Injectable()
export class ApprovalEvidenceReads {
  private readonly fieldAuthority: ApprovalEvidenceFieldAuthority;
  private readonly visibility: ApprovalVisibility;
  constructor(@Inject(APPROVAL_EVIDENCE_PORT) private readonly port: ApprovalEvidencePort,
    @Inject(GovernanceApprovalVisibility) defaultVisibility: ApprovalVisibility,
    /** Production binds nothing and gets the deny-all default. Only a test may inject an override; the commissioning slice supplies the real checks. */
    @Optional() @Inject(APPROVAL_EVIDENCE_FIELD_AUTHORITY) fieldAuthority?: ApprovalEvidenceFieldAuthority,
    @Optional() @Inject(APPROVAL_EVIDENCE_VISIBILITY) visibility?: ApprovalVisibility) {
    this.fieldAuthority = fieldAuthority ?? EVIDENCE_FIELD_AUTHORITY_DENY_ALL;
    this.visibility = visibility ?? defaultVisibility;
  }

  /** `rawQuery.workspace_id`, when present, must already have passed membership (controller) and must be the principal's reading workspace. */
  async detail(principal: ApprovalEvidencePrincipal, approvalId: string, rawQuery: Record<string, unknown>): Promise<ApprovalEvidenceResponse> {
    // Shape first: nothing here depends on, or reveals, an approval.
    const q = approvalEvidenceQuery.safeParse(rawQuery ?? {});
    if (!q.success || !APPROVAL_ID_PATTERN.test(approvalId)) throw new OperationalReadError("OPERATIONAL_READ_INPUT_INVALID", 400);
    if (q.data.workspace_id !== undefined && q.data.workspace_id !== principal.workspaceId) throw new GovernanceError("WORKSPACE_NOT_FOUND", "Workspace not found.", 404);
    if (!(await this.visibility.visible(principal, approvalId))) throw new GovernanceError("APPROVAL_NOT_FOUND", "Approval not found.", 404);

    const nowMs = Date.now();
    let sections: Record<string, unknown> = {};
    let heldSourceError: OperationalReadError | undefined;
    try {
      const answer = await this.port.read({ workspaceId: principal.workspaceId, approvalId, nowMs });
      if (!answer || typeof answer !== "object" || !answer.identity || answer.identity.workspaceId !== principal.workspaceId || answer.identity.approvalId !== approvalId)
        throw new OperationalReadError("OPERATIONAL_READ_PROVENANCE_INVALID");
      sections = { ...(answer.sections ?? {}) };
    } catch (e) {
      if (e instanceof OperationalReadError) heldSourceError = e;
      else {
        // A failing source is "not read" for every section, never an invented value and never a 0.
        sections = Object.fromEntries(APPROVAL_EVIDENCE_SECTION_NAMES.map((name) => [name, null]));
      }
    }
    const body: Record<string, unknown> = {};
    const malformed = new Set<string>();
    for (const name of APPROVAL_EVIDENCE_SECTION_NAMES) {
      const value = sections[name];
      if (value === undefined) continue;                       // no owning source: omitted
      if (value === null) { body[name] = null; continue; }     // not read
      // Do not let corruption in an undisclosed field become a 503 oracle.
      // An initially denied field can never be upgraded in this flight.
      if (!this.fieldAuthority.allows(name, principal, approvalId)) { body[name] = null; continue; }
      const parsed = approvalEvidenceSections[name].safeParse(value);
      if (!parsed.success) { malformed.add(name); body[name] = null; continue; }
      body[name] = parsed.data;
    }
    // Visibility is not a durable permit. Recheck the session/gate after the
    // source await so a revoked reader cannot receive even the dark body.
    // A future published port still needs its own same-flight field/source
    // authority fence; this recheck alone is not that commissioning proof.
    if (!(await this.visibility.visible(principal, approvalId))) throw new GovernanceError("APPROVAL_NOT_FOUND", "Approval not found.", 404);
    // Neither a source/provenance refusal nor a malformed private section may
    // escape the final approval visibility fence. Once fenced, preserve the
    // existing 503 for an authorized source failure or corrupt field.
    if (heldSourceError) throw heldSourceError;
    // Visibility can await I/O while an independently scoped field permit is
    // revoked. Check each *previously* authorized published section again;
    // never upgrade a section withheld by the first check during this read.
    for (const name of APPROVAL_EVIDENCE_SECTION_NAMES) {
      if (malformed.has(name)) {
        if (this.fieldAuthority.allows(name, principal, approvalId)) throw new OperationalReadError("OPERATIONAL_READ_PROVENANCE_INVALID");
        continue;
      }
      if (body[name] !== undefined && body[name] !== null && !this.fieldAuthority.allows(name, principal, approvalId)) body[name] = null;
    }
    const out = approvalEvidenceResponse.safeParse({ schema_version: APPROVAL_EVIDENCE_SCHEMA, workspace_id: principal.workspaceId, approval_id: approvalId,
      record_authority: "PORTAL_PROJECTION", read_at_ms: nowMs, ...body });
    if (!out.success) throw new OperationalReadError("OPERATIONAL_READ_PROVENANCE_INVALID");
    return out.data;
  }
}
