import { Inject, Injectable } from "@nestjs/common";
import { AccessPolicyError } from "../execution-v2/access.contract";
import { ExecutionAccessService } from "../execution-v2/access.service";
import { ExecutionReadScopes, type ReadScopePrincipal } from "../execution-v2/read-scope";
import { CurrentOperationalReads, OperationalReadError, operationalHttpCall, type PreparedOperationalRead } from "../operations/current-operational-read";
import { IdentifierSchema } from "../operations/contracts";
import { PositiveParentRepository, PositiveParentRepositoryError,
  type PositiveParentFamily, type PositiveParentSnapshot } from "./positive-parent.repository";
import { ParentFieldPurposeError, qualifyPositiveParent, positiveParentSections } from "./positive-parent.authority";
import { mapPositiveParent, mapPositiveParentOperation, type PositiveParentRead } from "./positive-parent.mapper";
import type { PositiveParentOperationRead } from "./positive-parent.contract";

// Per-call private control result. It can escape ONLY after the exact same
// actor-only flight finishes; a fresh-source/Core/session error replaces it.
// Identity comparison, never an error code/string, permits the F0 dispatch.
class F0OperationSelected extends OperationalReadError {
  constructor() { super("OPERATIONAL_READ_NOT_FOUND", 404); }
}

/** Fixed public copy/codes only. Never provider, PG, Zod or private prose. */
export function positiveParentError(error: unknown): Error {
  if (error instanceof AccessPolicyError || error instanceof OperationalReadError) return error;
  if (error instanceof ParentFieldPurposeError)
    return new OperationalReadError("GOVERNANCE_PARENT_FIELD_PURPOSE_UNAVAILABLE");
  if (error instanceof PositiveParentRepositoryError) {
    if (error.code === "PARENT_NOT_FOUND" || error.code === "PARENT_IDENTITY_INVALID")
      return new OperationalReadError("OPERATIONAL_READ_NOT_FOUND", 404);
    if (error.code === "PARENT_READ_BOUND") return new OperationalReadError("OPERATIONAL_READ_RESPONSE_BOUND");
    return new OperationalReadError("GOVERNANCE_PARENT_INTEGRITY_UNAVAILABLE");
  }
  return new OperationalReadError("GOVERNANCE_PARENT_UNAVAILABLE");
}

@Injectable()
export class PositiveParentReads {
  private readonly flights: CurrentOperationalReads;
  constructor(@Inject(PositiveParentRepository) private readonly repository: PositiveParentRepository,
    @Inject(ExecutionAccessService) access: ExecutionAccessService,
    @Inject(ExecutionReadScopes) private readonly readScopes: ExecutionReadScopes) {
    this.flights = new CurrentOperationalReads(access);
  }
  mode(principal: ReadScopePrincipal) { return this.readScopes.coreSelectionMode(principal); }
  finish<T, R = T>(prepared: PreparedOperationalRead<T>, project?: (body: T) => R): Promise<R> {
    return operationalHttpCall(() => this.flights.finish(prepared, project));
  }
  prepare(principal: ReadScopePrincipal, family: PositiveParentFamily, id: string): Promise<PreparedOperationalRead<PositiveParentRead>> {
    const actor = { user_id: principal.user.userId, session_id: principal.session.sessionId,
      session_generation: principal.session.sessionVersion };
    // Contextual errors are held through the SAME final current authority
    // fence, including malformed/not-found identity and private read failures.
    return operationalHttpCall(() => this.flights.prepareExact(actor, principal.workspaceId, async () => {
      if (!IdentifierSchema.safeParse(id).success) throw new OperationalReadError("OPERATIONAL_READ_NOT_FOUND", 404);
      const candidate = await this.repository.identityCandidate(principal.workspaceId, family, id);
      if (!candidate) throw new OperationalReadError("OPERATIONAL_READ_NOT_FOUND", 404);
      let snapshot: PositiveParentSnapshot | undefined;
      let includeCurrency = false;
      return {
        target: { resource: { kind: "DEPLOYMENT" as const, id: candidate.deploymentId }, environment: "paper" as const },
        authorize: context => qualifyPositiveParent(context, candidate),
        decode: async context => {
          // The issuer-bound flight has just qualified root purpose and BOTH
          // audit anchors. Transient hash preimages never leave the repository.
          const sections = positiveParentSections(context, candidate);
          includeCurrency = candidate.family === "R2" && sections.lineage;
          snapshot = await this.repository.protectedDetails(candidate, undefined, { includeCurrency });
          return mapPositiveParent(snapshot.raw, sections, Math.max(context.now_ms, Date.now()));
        },
        beforeFinal: async () => {
          if (snapshot && !await this.repository.isUnchanged(candidate, snapshot.revision, undefined, { includeCurrency }))
            throw new OperationalReadError("OPERATIONAL_READ_CHANGED", 409);
        },
      };
    }, positiveParentError));
  }
  async detail(principal: ReadScopePrincipal, family: PositiveParentFamily, id: string): Promise<PositiveParentRead> {
    return this.finish(await this.prepare(principal, family, id));
  }

  /** Existing generic GET only. null means positively selected F0, never an
   * unknown parent or an exception. The existing F0 reader performs its full
   * cohort/provenance/collision flight; this method does not decode F0. */
  async operationOrNull(principal: ReadScopePrincipal, operationId: string): Promise<PositiveParentOperationRead | null> {
    return operationalHttpCall(async () => {
      const actor = { user_id: principal.user.userId, session_id: principal.session.sessionId,
        session_generation: principal.session.sessionVersion };
      const f0Selected = new F0OperationSelected();
      try {
        const prepared = await this.flights.prepareExact<PositiveParentOperationRead>(actor, principal.workspaceId, async () => {
          if (!IdentifierSchema.safeParse(operationId).success)
            throw new OperationalReadError("OPERATIONAL_READ_NOT_FOUND", 404);
          const route = await this.repository.operationIdentityCandidate(principal.workspaceId, operationId);
          if (route.kind === "F0") throw f0Selected;
          if (route.kind !== "PARENT") throw new OperationalReadError("OPERATIONAL_READ_NOT_FOUND", 404);
          const selected = route.selected, parent = selected.parent;
          if (selected.operationId !== operationId) throw new OperationalReadError("OPERATIONAL_READ_NOT_FOUND", 404);
          let snapshot: PositiveParentSnapshot | undefined;
          return {
            target: { resource: { kind: "DEPLOYMENT" as const, id: parent.deploymentId }, environment: "paper" as const },
            // Required operation purpose AND exact immutable selected ID are
            // retained in the SAME proof as ROOT, both anchors and current gate.
            authorize: context => qualifyPositiveParent(context, parent, operationId),
            decode: async context => {
              snapshot = await this.repository.protectedDetails(parent, operationId, { includeCurrency: false });
              return mapPositiveParentOperation(snapshot.raw, operationId, Math.max(context.now_ms, Date.now()));
            },
            beforeFinal: async () => {
              if (snapshot && !await this.repository.isUnchanged(parent, snapshot.revision, operationId, { includeCurrency: false }))
                throw new OperationalReadError("OPERATIONAL_READ_CHANGED", 409);
            },
          };
        }, positiveParentError);
        return await this.flights.finish(prepared);
      } catch (error) {
        if (error === f0Selected) return null;
        throw error;
      }
    });
  }
}
