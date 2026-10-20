import { Inject, Injectable } from "@nestjs/common";
import { Pool } from "pg";
import { CONTROL_API_CONFIG, EXECUTION_DATA_POOL } from "../tokens";
import { ControlApiConfig } from "../config";
import { QueryContractError } from "../query/contracts";
import { ExecutionReadScopes, ExecutionReadScopeError, type AuthorizedExecutionReadScope, type ReadScopePrincipal,
  type ReadScopeRequirement } from "./read-scope";
import { ManagerModelRepository } from "./manager-model.store";
import { rejectManagerAsOf } from "./manager-query-p1";
import { managerSeriesQuery } from "./manager-series.contract";
import { queryManagerSeries, type SeriesSubjectScope } from "./manager-series";

/**
 * FE-013 / FE-033 read service. It authorizes each subject on its own (a fund by
 * `business.read_all` over the whole population, a portfolio by `portfolio.read`),
 * delivers them together under one current-authority fence, and reads the pinned
 * Manager document. It performs no source I/O and computes nothing.
 */
@Injectable()
export class ManagerSeriesService {
  private readonly repository: ManagerModelRepository;
  constructor(@Inject(EXECUTION_DATA_POOL) pool: Pool, @Inject(ExecutionReadScopes) private readonly scopes: ExecutionReadScopes,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig) {
    this.repository = new ManagerModelRepository(pool);
  }

  async read(principal: ReadScopePrincipal, raw: unknown) {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) rejectManagerAsOf(raw as Record<string, unknown>);
    const parsed = managerSeriesQuery.safeParse(raw);
    if (!parsed.success) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 400);
    const q = parsed.data, env = q.environment;
    if (q.workspace_id && q.workspace_id !== principal.workspaceId) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
    const profile = env === "paper" ? this.config.EXECUTION_EDGE_PAPER_PROFILE_ID : env === "sandbox" ?
      this.config.EXECUTION_EDGE_SANDBOX_PROFILE_ID : this.config.EXECUTION_EDGE_LIVE_PROFILE_ID;
    if (!profile) throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
    try {
      const head = await this.repository.head(principal.workspaceId, env, profile);
      const dataset = { dataset_id: "alpha_fleet_overview", source_revision: head?.revision ?? "NOT_PUBLISHED",
        projection_generation: head?.projection_generation ?? "NOT_PUBLISHED", catalogue_revision: head?.catalogue_digest ?? null, window: null };
      const inputs: SeriesSubjectScope[] = [];
      for (const subject of q.subjects) {
        const fund = subject.subject_type === "FUND";
        const requirement: ReadScopeRequirement = { action: fund ? "business.read_all" : "portfolio.read", dataset,
          ...(fund ? { requireWholePopulation: true } : { resource: { kind: "PORTFOLIO" as const, id: subject.subject_id! } }) };
        let scope: AuthorizedExecutionReadScope;
        try { scope = await this.scopes.authorize(principal, { environment: env, profileId: profile }, requirement); }
        catch (error) {
          // A restricted portfolio viewer is still a viewer: the subject is answered, as a typed "not authorized as a whole".
          if (fund || !(error instanceof ExecutionReadScopeError) || error.code !== "EXECUTION_READ_NOT_AVAILABLE") throw error;
          scope = await this.scopes.authorize(principal, { environment: env, profileId: profile }, { ...requirement, action: "portfolio.read_restricted" });
        }
        if (scope.mode !== "SCOPED_V2" || !head) throw new ExecutionReadScopeError("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", 503);
        inputs.push({ subject, scope });
      }
      // Ordinary reads fence each scope with `deliver` (the realtime-oriented `deliverScopedTogether` needs a stream lease).
      // Nesting makes every subject's authority current BEFORE and AFTER the one document read, in a fixed bounded order.
      const deliverAll = <T>(index: number, read: () => Promise<T>): Promise<T> =>
        index >= inputs.length ? read() : this.scopes.deliver(inputs[index].scope, () => deliverAll(index + 1, read));
      return await deliverAll(0, async () => {
        const doc = await this.repository.document(principal.workspaceId, env, profile, head!.revision);
        // TEST_ONLY documents are exercised through the pure component only, never served.
        if (!doc || doc.qualification !== "SOURCE_VERIFIED") throw new ExecutionReadScopeError("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", 503);
        const response = queryManagerSeries(inputs, doc, q);
        const current = await this.repository.head(principal.workspaceId, env, profile);
        if (current?.payload_digest !== head!.payload_digest || current.revision !== head!.revision)
          throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
        return response;
      });
    } catch (error) {
      if (error instanceof ExecutionReadScopeError) throw error;
      if (error instanceof QueryContractError) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 400);
      throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
    }
  }
}
