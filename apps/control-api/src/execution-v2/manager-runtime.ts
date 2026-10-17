import type { OnModuleInit, BeforeApplicationShutdown } from "@nestjs/common";
import type { Pool } from "pg";
import { setImmediate as yieldWorker } from "node:timers/promises";
import type { AccessTrustProvider } from "./access-trust";
import type { ExecutionReadPublicationRequest } from "./read-publication";
import { ManagerProjectionConsumer, type ManagerConsumerBounds, type ManagerConsumerDelivery, type ManagerProjectionSource } from "./manager-consumer";
import type { ManagerLeaseScope } from "./manager-lease";
import { prepareManagerProjection, ManagerModelRepository } from "./manager-model.store";
import { accessDigest } from "./access-policy";
import { qualifyDatasetPublication, publicationCommissioningCurrent, type PublicationCommissioning } from "./publication-adapter";
import { ManagerScoreRuntime, managerScorePublicationPolicyCurrent, type ApprovedManagerScorePolicy } from "./manager-score-runtime";
import { managerScorePublication } from "./manager-score-publication.contract";
import type { ManagerScoreReadFence } from "./manager-score-publication";
import { ManagerCompositionRuntime, managerCompositionPublicationCurrent, managerCompositionPublicationForRead,
  captureManagerCompositionOriginalAllocation, type ManagerCompositionOriginalAllocationCapture,
  type ManagerCompositionOriginalAllocationCustody,
  type ApprovedManagerAllocation, type ManagerCompositionRuntimeTask } from "./manager-composition-runtime";
import type { ManagerCompositionReadFence } from "./manager-composition-publication";
import type { ManagerScorePublication } from "./manager-score-publication.contract";
import type { ManagerCompositionPublication } from "./manager-composition-publication.contract";
import { ManagerRegimeRuntime, managerRegimePublicationCurrent, type ApprovedManagerRegimePolicy,
  type VerifiedManagerRegimeEvidence, type ManagerRegimeRuntimeTask } from "./manager-regime-runtime";
import type { ManagerRegimeReadFence } from "./manager-regime-publication";
import type { ManagerRegimeSubjectBinding, ManagerRegimePublication } from "./manager-regime-publication.contract";
import type { ScopedReplayHub } from "./realtime";
import { ManagerScoreRecalculation, type ManagerScoreRecalculationConfig,
  type ManagerScoreRecalculationTask } from "./manager-score-recalculation";
import { ManagerScoreRestatement } from "./manager-score-restatement";
import { captureManagerScoreOriginalInputs } from "./manager-score-original-custody";

export interface ManagerRuntimePartition {
  scope: ManagerLeaseScope;
  commissioning: PublicationCommissioning;
  source: ManagerProjectionSource;
  /** Existing private current publication provider. No new URL/wire is inferred. */
  publication(request: ExecutionReadPublicationRequest, signal: AbortSignal): Promise<unknown | null>;
  bounds: ManagerConsumerBounds;
  score?: { runtime: ManagerScoreRuntime; maximum_tasks_per_revision: number; currentPolicy(): ApprovedManagerScorePolicy | null;
    /** Explicit opt-in only; no extra timer, source checkpoint or runtime default. */
    recalculation?: ManagerScoreRecalculationConfig;
    /** Additive explicit historical mode; cannot share an initial writer with v1. */
    restatement?: ManagerScoreRecalculationConfig;
    tasks(delivery: ManagerConsumerDelivery, signal: AbortSignal): Promise<ManagerScoreRecalculationTask[]> };
  composition?: { runtime:ManagerCompositionRuntime;maximum_tasks_per_revision:number;currentAllocation():ApprovedManagerAllocation|null;
    tasks(delivery:ManagerConsumerDelivery,signal:AbortSignal):Promise<Array<Omit<ManagerCompositionRuntimeTask,"allocation"|"raw_scores">>> };
  regime?: { runtime: ManagerRegimeRuntime; maximum_tasks_per_revision: number;
    currentPolicy(): ApprovedManagerRegimePolicy | null;
    currentEvidence(binding: ManagerRegimeSubjectBinding): VerifiedManagerRegimeEvidence | null;
    tasks(delivery: ManagerConsumerDelivery, signal: AbortSignal):
      Promise<Array<Omit<ManagerRegimeRuntimeTask, "policy" | "evidence">>> };
}
/** Supplied only by an independently reviewed server deployment composition.
 * Not deserialized from ENV/HTTP, not a grant, not an arbitrary module import. */
export interface ManagerRuntimeInstallation {
  trust: AccessTrustProvider;
  partitions: readonly ManagerRuntimePartition[];
  cadence_ms: number;
  maximum_publication_reads: number;
  /** Private independently qualified hub; BUSINESS commissioning never grants STREAM. */
  realtime?: ScopedReplayHub;
}
const key = (s: ManagerLeaseScope) => JSON.stringify([s.workspace_id,s.environment,s.profile_id]);

/** Registered in the real Control API lifecycle. Default is zero timers/DB/source
 * calls; an installed provider gets one serial bounded loop across its partitions.
 * Never activates the legacy poller or changes current human/command authority. */
export class ExecutionManagerRuntime implements OnModuleInit, BeforeApplicationShutdown {
  private readonly partitions: readonly ManagerRuntimePartition[];
  private readonly consumers: ManagerProjectionConsumer[];
  private timer: NodeJS.Timeout | null = null;
  private flight: Promise<void> | null = null;
  private stopped = false;
  private publicationReads=0;
  private readonly publicationCancellations=new Set<AbortController>();
  private readonly publicationFlights=new Set<Promise<unknown>>();
  private lastState: "SOURCE_PROVIDER_NOT_INSTALLED" | "READY" | "TICK_OK" | "TICK_REFUSED" | "STOPPED";
  private readonly repository: ManagerModelRepository;
  private readonly recalculations=new Map<string,ManagerScoreRecalculation>();
  private readonly restatements=new Map<string,ManagerScoreRestatement>();
  private readonly cadenceMs: number;
  private readonly publicationReadLimit: number;
  private readonly installedTrust?: AccessTrustProvider;
  private readonly realtime?: ScopedReplayHub;
  constructor(pool: Pool, private readonly installation?: ManagerRuntimeInstallation) {
    this.repository=new ManagerModelRepository(pool);
    this.cadenceMs=installation?.cadence_ms ?? 0;this.publicationReadLimit=installation?.maximum_publication_reads ?? 0;
    this.installedTrust=installation?.trust;
    this.realtime=installation?.realtime;
    if (!installation) { this.partitions=[]; this.consumers=[]; this.lastState="SOURCE_PROVIDER_NOT_INSTALLED"; return; }
    if (!Number.isSafeInteger(installation.cadence_ms) || installation.cadence_ms < 1000 || installation.cadence_ms > 300_000 ||
      installation.partitions.length < 1 || installation.partitions.length > 3 ||
      !Number.isSafeInteger(installation.maximum_publication_reads)||installation.maximum_publication_reads<1||installation.maximum_publication_reads>4||
      new Set(installation.partitions.map(p=>key(p.scope))).size !== installation.partitions.length)
      throw new Error("MANAGER_RUNTIME_INSTALLATION_INVALID");
    // Finite I/O is a prerequisite, not an optional production default. Explicit
    // injected pools must meet it too; otherwise abort/stop cannot be bounded.
    if ([pool.options.connectionTimeoutMillis,pool.options.query_timeout].some(n=>!Number.isSafeInteger(n)||Number(n)<1||Number(n)>60_000))
      throw new Error("MANAGER_RUNTIME_POOL_TIMEOUT_REQUIRED");
    this.partitions = installation.partitions.map(p=>({...p,scope:Object.freeze({...p.scope}),bounds:Object.freeze({...p.bounds}),
      ...(p.score?{score:Object.freeze({...p.score})}:{}),...(p.composition?{composition:Object.freeze({...p.composition})}:{}),...(p.regime?{regime:Object.freeze({...p.regime})}:{})}));
    this.consumers = this.partitions.map(p=> {
      if (!publicationCommissioningCurrent(p.commissioning,p.scope,Date.now())) throw new Error("MANAGER_RUNTIME_COMMISSIONING_REQUIRED");
      if(p.score && (!Number.isSafeInteger(p.score.maximum_tasks_per_revision)||p.score.maximum_tasks_per_revision<1||p.score.maximum_tasks_per_revision>128))
        throw new Error("MANAGER_SCORE_TASK_BOUND");
      if(p.composition&&(!Number.isSafeInteger(p.composition.maximum_tasks_per_revision)||p.composition.maximum_tasks_per_revision<1||
        p.composition.maximum_tasks_per_revision>128||(p.score?.maximum_tasks_per_revision??0)+p.composition.maximum_tasks_per_revision>128))
        throw new Error("MANAGER_COMPOSITION_TASK_BOUND");
      if(p.regime && (!Number.isSafeInteger(p.regime.maximum_tasks_per_revision) || p.regime.maximum_tasks_per_revision < 1 ||
        p.regime.maximum_tasks_per_revision > 128 || (p.score?.maximum_tasks_per_revision ?? 0) +
        (p.composition?.maximum_tasks_per_revision ?? 0) + p.regime.maximum_tasks_per_revision > 128))
        throw new Error("MANAGER_REGIME_TASK_BOUND");
      if(p.score?.recalculation&&p.score.restatement)throw new Error("MANAGER_SCORE_CUSTODY_MODE_CONFLICT");
      const recalculation=p.score?.recalculation?new ManagerScoreRecalculation({pool,runtime:p.score.runtime,
        currentPolicy:()=>p.score!.currentPolicy(),commissioning:p.commissioning,source:p.source,
        publication:(request,signal)=>p.publication(request,signal),config:p.score.recalculation}):undefined;
      if(recalculation)this.recalculations.set(key(p.scope),recalculation);
      const restatement=p.score?.restatement?new ManagerScoreRestatement({pool,runtime:p.score.runtime,
        currentPolicy:()=>p.score!.currentPolicy(),commissioning:p.commissioning,source:p.source,
        publication:(request,signal)=>p.publication(request,signal),config:p.score.restatement}):undefined;
      if(restatement)this.restatements.set(key(p.scope),restatement);
      return new ManagerProjectionConsumer({pool,source:this.materializingSource(p,recalculation,restatement),scope:p.scope,bounds:p.bounds,
        commissioning:p.commissioning,recalculation:restatement??recalculation});
    });
    this.lastState="READY";
  }
  /** Private operator/test state: never contains a source exception, URL or credential. */
  status() { return {state:this.lastState,partitions:this.partitions.length,automatic_loop:this.timer!==null}; }
  /** Private reader dependency, never reconstructed from browser input. */
  recalculationFor(scope:ManagerLeaseScope):ManagerScoreRecalculation|undefined{return this.recalculations.get(key(scope));}
  restatementFor(scope:ManagerLeaseScope):ManagerScoreRestatement|undefined{return this.restatements.get(key(scope));}
  accessTrust(base?: AccessTrustProvider): AccessTrustProvider | undefined {
    if (!this.installation) return base;
    if (base && base !== this.installedTrust) throw new Error("MANAGER_RUNTIME_TRUST_CONFLICT");
    const trust = this.installedTrust!;
    return { verifyPolicy:i=>trust.verifyPolicy(i),verifyReceipt:i=>trust.verifyReceipt(i),
      verifyRootReceipt:i=>trust.verifyRootReceipt?.(i) ?? Promise.resolve(null),
      qualifyDelegatedReceipt:(i,s)=>trust.qualifyDelegatedReceipt?.(i,s) ?? Promise.resolve(null),
      relations:(u,w)=>trust.relations(u,w),verifiedHumanMapping:(u,w)=>trust.verifiedHumanMapping(u,w),
      readPublication:async request=>{
        if(request.binding.dataset_id!=="alpha_fleet_overview")return trust.readPublication?.(request) ?? null;
        const p = this.partitions.find(p=>key(p.scope)===key(request));
        if (!p) return null;
        if(!publicationCommissioningCurrent(p.commissioning,p.scope,Date.now()))throw new Error("MANAGER_COMMISSIONING_EXPIRED");
        const copy=structuredClone(request);
        if(this.stopped||this.publicationReads>=this.publicationReadLimit)throw new Error("MANAGER_PUBLICATION_CAPACITY");
        const cancellation=new AbortController();this.publicationReads++;this.publicationCancellations.add(cancellation);
        const timer=setTimeout(()=>cancellation.abort(new Error("MANAGER_PUBLICATION_TIMEOUT")),p.bounds.source_timeout_ms);
        let raw:unknown;
        const flight=Promise.resolve().then(()=>p.publication(structuredClone(copy),cancellation.signal));
        this.publicationFlights.add(flight);
        try {raw=await flight;if(cancellation.signal.aborted)throw cancellation.signal.reason;}
        finally{clearTimeout(timer);this.publicationReads--;this.publicationCancellations.delete(cancellation);this.publicationFlights.delete(flight);}
        return raw===null?null:qualifyDatasetPublication(raw,copy,{purpose:"BUSINESS",commissioning:p.commissioning,nowMs:Date.now()}).authority;
      } };
  }
  readonly scoreFence: ManagerScoreReadFence = { accepts:score=>{
    const p=this.partitions.find(p=>key(p.scope)===key(score.provenance.scope));
    return !!p?.score && publicationCommissioningCurrent(p.commissioning,p.scope,Date.now()) &&
      managerScorePublicationPolicyCurrent(p.score.currentPolicy(),{quality:{...score.quality,preview:null},provenance:score.provenance},Date.now());
  } };
  readonly compositionFence:ManagerCompositionReadFence={project:(publication,rawScores)=>{
    const p=this.partitions.find(p=>key(p.scope)===key(publication.provenance.scope));
    return p?.composition&&publicationCommissioningCurrent(p.commissioning,p.scope,Date.now())?
      managerCompositionPublicationForRead(p.composition.currentAllocation(),publication,rawScores,this.scoreFence,Date.now()):null;
  },accepts:(publication,rawScores,members)=>{
    const p=this.partitions.find(p=>key(p.scope)===key(publication.provenance.scope));
    return !!p?.composition&&publicationCommissioningCurrent(p.commissioning,p.scope,Date.now())&&
      managerCompositionPublicationCurrent(p.composition.currentAllocation(),publication,rawScores,this.scoreFence,Date.now(),members);
  }};
  readonly regimeFence: ManagerRegimeReadFence = { accepts: publication => {
    try {
      const p = this.partitions.find(p => key(p.scope) === key(publication.provenance.scope));
      return !!p?.regime && publicationCommissioningCurrent(p.commissioning, p.scope, Date.now()) &&
        managerRegimePublicationCurrent(p.regime.currentPolicy(), p.regime.currentEvidence(publication.provenance.binding),
          publication, Date.now());
    } catch { return false; }
  } };
  onModuleInit() { if (this.installation) this.schedule(); }
  private schedule() {
    if(this.stopped || !this.installation) return;
    this.timer=setTimeout(()=>{this.timer=null;void this.tick().finally(()=>this.schedule()).catch(()=>undefined);},this.cadenceMs);
    this.timer.unref();
  }
  tick(): Promise<void> {
    if(this.stopped) return Promise.reject(new Error("MANAGER_RUNTIME_STOPPED"));
    if(this.flight) return this.flight;
    if(!this.installation) return Promise.resolve();
    const run=(async()=>{
      let refused=false;
      // Revoke/continuation cannot depend on receiving a new financial document.
      // Reuse this serial tick, not a second timer or an unmeasured SLA claim.
      try {await this.realtime?.poll();}catch{refused=true;}
      for(const consumer of this.consumers) {
        if(this.stopped) break;
        try {await consumer.tick();}
        catch {refused=true;}
      }
      if(!this.stopped)this.lastState=refused?"TICK_REFUSED":"TICK_OK";
    })();
    this.flight=run;void run.finally(()=>{if(this.flight===run)this.flight=null;}).catch(()=>undefined);return run;
  }
  async beforeApplicationShutdown() {
    this.stopped=true;if(this.timer)clearTimeout(this.timer);this.timer=null;
    this.realtime?.stop();
    for(const c of this.publicationCancellations)c.abort(new Error("MANAGER_RUNTIME_STOPPED"));
    await Promise.allSettled([...this.publicationFlights]);
    await Promise.all(this.consumers.map(c=>c.stop()));await this.flight;this.lastState="STOPPED";
  }
  private materializingSource(p: ManagerRuntimePartition,recalculation?:ManagerScoreRecalculation,restatement?:ManagerScoreRestatement): ManagerProjectionSource {
    return {read:async input=>{
      const raw=await p.source.read(input);if(!raw)return null;
      if(Buffer.byteLength(JSON.stringify(raw.document))>p.bounds.maximum_document_bytes)throw new Error("MANAGER_PROJECTION_LIMIT");
      const delivery=structuredClone(raw);
      const prepared=prepareManagerProjection(delivery.document,delivery.publication,{commissioning:p.commissioning,
        expectedContinuity:delivery.expectedContinuity,rebuild:delivery.rebuild,nowMs:Date.now()});
      const document=prepared.document;
      if(document.members.length+document.facts.length>p.bounds.maximum_document_rows)throw new Error("MANAGER_PROJECTION_LIMIT");
      if(document.precomputed_scores!==undefined)throw new Error("MANAGER_SCORE_WORKER_RESULT_REQUIRED");
      if(document.precomputed_compositions!==undefined)throw new Error("MANAGER_COMPOSITION_WORKER_RESULT_REQUIRED");
      if(document.precomputed_regimes!==undefined)throw new Error("MANAGER_REGIME_WORKER_RESULT_REQUIRED");
      // Lost ACK / restart must reuse the identical immutable materialization,
      // including calculation timestamps. Never recompute into the same revision.
      if(input.head?.revision===document.revision) {
        const existing=await this.repository.document(document.workspace_id,document.environment,document.profile_id,document.revision);
        if(!existing)throw new Error("MANAGER_REVISION_NOT_FOUND");
        const {precomputed_scores:scores,precomputed_compositions:compositions,precomputed_regimes:regimes,...source}=existing;
        if(accessDigest(source)!==accessDigest(document))throw new Error("MANAGER_REVISION_CONFLICT");
        return {...delivery,document:{...document,...(scores===undefined?{}:{precomputed_scores:scores}),
          ...(compositions===undefined?{}:{precomputed_compositions:compositions}),
          ...(regimes===undefined?{}:{precomputed_regimes:regimes})}};
      }
      if(!p.score&&!p.composition&&!p.regime)return {...delivery,document};
      const provided=p.score?await p.score.tasks(delivery,input.signal):[];
      // The exact detached values drive BOTH original calculation and custody.
      // Capturing only in late attach would adopt provider mutation after yield.
      const originals=restatement?captureManagerScoreOriginalInputs(provided,p.bounds.maximum_document_bytes):undefined;
      // Custody's duplicate exact input_json bytes have their OWN optional cap;
      // they must not reduce admission of the original worker envelope.
      const tasks=originals?.map(({input_json:_bytes,...item})=>item)??provided;
      if(tasks.length>(p.score?.maximum_tasks_per_revision??0)||Buffer.byteLength(JSON.stringify(tasks))>p.bounds.maximum_document_bytes)
        throw new Error("MANAGER_SCORE_TASK_BOUND");
      const scores:ManagerScorePublication[]=[];
      for(const item of tasks) {
        await yieldWorker();
        if(input.signal.aborted)throw input.signal.reason;
        const t=item.task;
        if(key(t.scope)!==key(p.scope)||t.scope.catalogue_digest!==document.catalogue_digest||
          t.source_revision!==document.revision||t.source_set_digest!==document.source_set_digest||
          t.source_qualification!==document.qualification||t.input.quality.as_of_ms!==document.as_of_ms)
          throw new Error("MANAGER_SCORE_SOURCE_BINDING_INVALID");
        const result=await p.score!.runtime.calculate({...t,policy:p.score!.currentPolicy()});
        const {preview:_privatePreview,...quality}=result.quality;
        scores.push(managerScorePublication.parse({slot:item.slot,quality,raw_metrics:result.raw_metrics,provenance:result.provenance}));
      }
      const compositions:ManagerCompositionPublication[]=[];
      // Preserve the EXACT handle used by each worker; a later currentAllocation()
      // could be a different installed allocation even when its JSON looks equal.
      const compositionOriginals:Array<{allocation:ApprovedManagerAllocation|null;publication:ManagerCompositionPublication}>=[];
      if(p.composition){
        const tasks=await p.composition.tasks(delivery,input.signal);
        if(tasks.length>p.composition.maximum_tasks_per_revision||Buffer.byteLength(JSON.stringify(tasks))>p.bounds.maximum_document_bytes)
          throw new Error("MANAGER_COMPOSITION_TASK_BOUND");
        for(const task of tasks){
          await yieldWorker();if(input.signal.aborted)throw input.signal.reason;
          if(key(task.scope)!==key(p.scope)||task.scope.catalogue_digest!==document.catalogue_digest||
            task.source_revision!==document.revision||task.source_set_digest!==document.source_set_digest||
            task.source_qualification!==document.qualification||task.source_as_of_ms!==document.as_of_ms)
            throw new Error("MANAGER_COMPOSITION_SOURCE_BINDING_INVALID");
          const allocation=p.composition.currentAllocation();
          const result=await p.composition.runtime.calculate({...task,allocation,raw_scores:scores},this.scoreFence,input.signal);
          if(!this.compositionFence.accepts(result,scores))throw new Error("MANAGER_COMPOSITION_APPROVAL_CHANGED");
          compositions.push(result);
          if(restatement)compositionOriginals.push({allocation,publication:result});
        }
      }
      const regimes: ManagerRegimePublication[] = [];
      if(p.regime) {
        const tasks = await p.regime.tasks(delivery, input.signal);
        if(tasks.length > p.regime.maximum_tasks_per_revision ||
          Buffer.byteLength(JSON.stringify(tasks)) > p.bounds.maximum_document_bytes)
          throw new Error("MANAGER_REGIME_TASK_BOUND");
        for(const task of tasks) {
          await yieldWorker();if(input.signal.aborted)throw input.signal.reason;
          if(key(task.scope) !== key(p.scope) || task.scope.catalogue_digest !== document.catalogue_digest ||
            task.source_revision !== document.revision || task.projection_generation !== document.projection_generation ||
            task.source_set_digest !== document.source_set_digest || task.source_qualification !== document.qualification ||
            task.source_as_of_ms !== document.as_of_ms) throw new Error("MANAGER_REGIME_SOURCE_BINDING_INVALID");
          const result = await p.regime.runtime.calculate({...task, policy:p.regime.currentPolicy(),
            evidence:p.regime.currentEvidence(task.binding)}, input.signal);
          if(input.signal.aborted)throw input.signal.reason;
          // Missing/expired Regime config is independent of valid financial slots.
          if(result.status === "READY" && this.regimeFence.accepts(result.publication)) regimes.push(result.publication);
        }
      }
      const materialized={...document,...(p.score?{precomputed_scores:scores}:{}),
        ...(p.composition?{precomputed_compositions:compositions}:{}),...(p.regime?{precomputed_regimes:regimes}:{})};
      if(Buffer.byteLength(JSON.stringify(materialized))>p.bounds.maximum_document_bytes)throw new Error("MANAGER_PROJECTION_LIMIT");
      const result={...delivery,document:materialized};
      recalculation?.attach(result,tasks);
      if(originals&&restatement){
        if(compositionOriginals.length===0)restatement.attach(result,originals);
        else{
          // FULL final source includes all Score/Composition/Regime results.
          // Capture synchronously before attach; no allocation substitution or
          // JSON clone can replace genuine first-write custody identities.
          const captures:ManagerCompositionOriginalAllocationCustody[]=[];
          const maximumBytes=restatement.originalCustodyByteLimit();let capturedBytes=2;
          let omission:Extract<ManagerCompositionOriginalAllocationCapture,{status:"NOT_PUBLISHED"}>["reason_code"]|null=null;
          for(const original of compositionOriginals){
            try{
              const captured=captureManagerCompositionOriginalAllocation({...original,document:materialized,
                raw_fence:this.scoreFence,maximum_bytes:maximumBytes});
              if(captured.status!=="READY"){omission=captured.reason_code;break;}
              const bytes=Buffer.byteLength(JSON.stringify(captured.custody))+1;
              if(capturedBytes+bytes>maximumBytes){omission="COMPOSITION_ORIGINAL_CUSTODY_BOUND";break;}
              capturedBytes+=bytes;captures.push(captured.custody);
            }catch{omission="COMPOSITION_ORIGINAL_CUSTODY_INVALID";break;}
          }
          if(omission!==null){
            // Do not fall back to v1/v2 or retain a partial v3 census. Omit ONLY
            // optional ORIGINAL custody; financial publication/fences stay intact.
            captures.length=0;restatement.omitCompositionOriginal(result,omission);
          }else restatement.attach(result,originals,captures);
        }
      }
      return result;
    },recheck:i=>p.source.recheck(i),acknowledge:(r,s)=>p.source.acknowledge(r,s)};
  }
}
