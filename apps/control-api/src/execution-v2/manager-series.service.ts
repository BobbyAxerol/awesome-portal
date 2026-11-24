import { Inject, Injectable, Optional } from "@nestjs/common";
import { Pool } from "pg";
import type {ServerResponse} from "node:http";
import { CONTROL_API_CONFIG, EXECUTION_DATA_POOL } from "../tokens";
import { ControlApiConfig } from "../config";
import { QueryContractError } from "../query/contracts";
import { ExecutionReadScopes, ExecutionReadScopeError, type AuthorizedExecutionReadScope, type ReadScopePrincipal,
  type ReadScopeRequirement } from "./read-scope";
import { ManagerModelRepository } from "./manager-model.store";
import { rejectManagerAsOf } from "./manager-query-p1";
import { managerSeriesQuery } from "./manager-series.contract";
import { queryManagerSeries, type SeriesSubjectScope } from "./manager-series";
import { ExecutionManagerRuntime } from "./manager-runtime";
import {NativeCurrentAccountScopes} from "./native-current-runtime";
import {resolveManagerProfile} from "./manager-profile-registry";

type SeriesResponse=ReturnType<typeof queryManagerSeries>;
type NativeDelivery={response:ServerResponse;beforeDispatch?:()=>void};

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
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Optional() @Inject(ExecutionManagerRuntime) private readonly runtime?: ExecutionManagerRuntime,
    @Optional() @Inject(NativeCurrentAccountScopes) private readonly nativeAccount?:NativeCurrentAccountScopes) {
    this.repository = new ManagerModelRepository(pool);
  }

  hasNativeCurrentRelations():boolean{return this.nativeAccount?.scopes.hasNativeCurrentRelations()===true;}

  shouldUseNativeCurrent(principal:ReadScopePrincipal,raw:unknown):boolean{
    const parsed=managerSeriesQuery.safeParse(raw);
    if(!parsed.success)throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE",400);
    const profile=this.resolveProfile(principal,parsed.data.environment,parsed.data.profile_id);
    return parsed.data.environment==="paper"&&profile===this.profileFor("paper")&&this.hasNativeCurrentRelations();
  }
  private profileFor(env:"paper"|"sandbox"|"live"){
    return env==="paper"?this.config.EXECUTION_EDGE_PAPER_PROFILE_ID:env==="sandbox"?
      this.config.EXECUTION_EDGE_SANDBOX_PROFILE_ID:this.config.EXECUTION_EDGE_LIVE_PROFILE_ID;
  }
  private resolveProfile(principal:ReadScopePrincipal,env:"paper"|"sandbox"|"live",requestedProfileId?:string):string{
    try{return resolveManagerProfile({defaultProfileId:this.profileFor(env),requestedProfileId,
      installedProfileIds:this.runtime?.profilesFor?.(principal.workspaceId,env)});}
    catch(error){throw new ExecutionReadScopeError(error instanceof Error&&error.message==="EXECUTION_READ_NOT_AVAILABLE"?
      "EXECUTION_READ_NOT_AVAILABLE":"EXECUTION_READ_AUTHORITY_UNAVAILABLE",error instanceof Error&&error.message==="EXECUTION_READ_NOT_AVAILABLE"?404:503);}
  }

  read(principal:ReadScopePrincipal,raw:unknown):Promise<SeriesResponse>{return this.readPrepared(principal,raw);}

  readNative(principal:ReadScopePrincipal,raw:unknown,response:ServerResponse,beforeDispatch?:()=>void):Promise<void>{
    if(!this.hasNativeCurrentRelations())return Promise.reject(new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE",503));
    return this.readPrepared(principal,raw,{response,beforeDispatch});
  }

  private readPrepared(principal:ReadScopePrincipal,raw:unknown):Promise<SeriesResponse>;
  private readPrepared(principal:ReadScopePrincipal,raw:unknown,native:NativeDelivery):Promise<void>;
  private async readPrepared(principal:ReadScopePrincipal,raw:unknown,native?:NativeDelivery):Promise<SeriesResponse|void> {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) rejectManagerAsOf(raw as Record<string, unknown>);
    const parsed = managerSeriesQuery.safeParse(raw);
    if (!parsed.success) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 400);
    const q = parsed.data, env = q.environment;
    if(native&&env!=="paper")throw new ExecutionReadScopeError("EXECUTION_READ_CURRENT_ONLY",503);
    const profile=this.resolveProfile(principal,env,q.profile_id);
    const selectedNative=env==="paper"&&profile===this.profileFor("paper")&&this.hasNativeCurrentRelations();
    if(native&&!selectedNative||!native&&selectedNative)
      throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE",503);
    if (q.workspace_id && q.workspace_id !== principal.workspaceId) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
    const scopes=native?this.nativeAccount!.scopes:this.scopes;
    try {
      const head = await this.repository.head(principal.workspaceId, env, profile);
      const dataset = { dataset_id: "alpha_fleet_overview", source_revision: head?.revision ?? "NOT_PUBLISHED",
        projection_generation: head?.projection_generation ?? "NOT_PUBLISHED", catalogue_revision: head?.catalogue_digest ?? null, window: null };
      const inputs: SeriesSubjectScope[] = [];
      for (const subject of q.subjects) {
        const fund = subject.subject_type === "FUND";
        const alpha = subject.subject_type === "ALPHA";
        const requirement: ReadScopeRequirement = { action: fund ? "business.read_all" : alpha ? "alpha.read" : "portfolio.read", dataset,
          ...(fund ? { requireWholePopulation: true } : { resource: { kind: alpha ? "ALPHA" as const : "PORTFOLIO" as const, id: subject.subject_id! } }) };
        let scope: AuthorizedExecutionReadScope;
        try { scope = await scopes.authorize(principal, { environment: env, profileId: profile }, requirement); }
        catch (error) {
          // A restricted portfolio viewer is still a viewer: the subject is answered, as a typed "not authorized as a whole".
          if (fund || alpha || !(error instanceof ExecutionReadScopeError) || error.code !== "EXECUTION_READ_NOT_AVAILABLE") throw error;
          scope = await scopes.authorize(principal, { environment: env, profileId: profile }, { ...requirement, action: "portfolio.read_restricted" });
        }
        if (scope.mode !== "SCOPED_V2" || !head) throw new ExecutionReadScopeError("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", 503);
        inputs.push({ subject, scope });
      }
      const economic = this.runtime?.economicSourceFor({workspace_id:principal.workspaceId,environment:env,profile_id:profile});
      const assertEconomic = () => { if (economic && !economic.isCurrent())
        throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409); };
      assertEconomic();
      const checkHead=async()=>{
        const current=await this.repository.head(principal.workspaceId,env,profile);
        if(current?.payload_digest!==head!.payload_digest||current.revision!==head!.revision||
          current.projection_generation!==head!.projection_generation)
          throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED",409);
        assertEconomic();
      };
      const build=async()=>{
        const doc = await this.repository.document(principal.workspaceId, env, profile, head!.revision);
        // TEST_ONLY documents are exercised through the pure component only, never served.
        if (!doc || doc.qualification !== "SOURCE_VERIFIED") throw new ExecutionReadScopeError("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", 503);
        // Revision qualification occurs after subject authorization and exact
        // publication selection, not on other subjects' retained history.
        const response = {...queryManagerSeries(inputs, doc, q, !economic, economic?.calculation_revision ?? null),profile_id:doc.profile_id};
        await checkHead();
        return response;
      };
      if(native){
        // The scopes retain separate source purposes even for a mixed
        // fund/portfolio/alpha batch. Only this writer owns physical HTTP.
        await scopes.deliverNativeTogether(inputs.map(input=>input.scope),native.response,
          async()=>Buffer.from(JSON.stringify(await build())),{validateAfterEnter:checkHead,
            validateBeforeDispatch:()=>{assertEconomic();const checked:unknown=native.beforeDispatch?.();
              if(checked!==undefined){if(checked&&typeof (checked as {then?:unknown}).then==="function")
                void Promise.resolve(checked).catch(()=>undefined);
                throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE",503);}}});
        return;
      }
      // Retain EVERY subject through one final shared confirmation after the
      // last publication await. Native physical custody stays separate above;
      // the same composition also preserves scoped legacy authorization.
      const response=await scopes.deliverScopedTogether(inputs.map(input=>input.scope),()=>build(),assertEconomic);
      assertEconomic();
      return response;
    } catch (error) {
      if (error instanceof ExecutionReadScopeError) throw error;
      if (error instanceof QueryContractError) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 400);
      throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
    }
  }
}
