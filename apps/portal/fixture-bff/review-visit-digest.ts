/** Development-only stateful adapter. No real credential, DB, or command transport. */
import { scaled } from "../frontend/e2e/bffScale";
import { composeVisitDigest, makeBaseline, makeDigestSnapshot, type DigestBaseline, type DigestFact } from "../../control-api/src/command-center/visit-digest";
import type { BffRequest, BffResponse } from "../frontend/e2e/bffAnswerer";
import type { FixtureConfig } from "./app";

export function createVisitDigestFixture() {
  const baselines = new Map<string, DigestBaseline | null>();
  return (config: FixtureConfig, request: BffRequest): BffResponse | null => {
    if (!['/api/v1/execution/visit-digest','/api/v1/execution/visit-digest/seen'].includes(request.path)) return null;
    const fail = (status: number, code: string): BffResponse => ({status, headers:{'content-type':'application/json'}, body:{error:{code,message:'Refresh the visit digest.'},request_id:'TEST_ONLY:visit-digest'}});
    const query = new URLSearchParams(request.search);
    if ([...query.keys()].some(k=>k!=='workspace_id') || query.getAll('workspace_id').length>1) return fail(400,'VISIT_DIGEST_INPUT_INVALID');
    const workspace = query.get('workspace_id') ?? 'ws_TEST_ONLY';
    if (!workspace || workspace.length>96) return fail(400,'VISIT_DIGEST_INPUT_INVALID');
    if (workspace==='ws_TEST_DENIED') return fail(404,'WORKSPACE_NOT_FOUND');
    if (workspace==='ws_TEST_UNAVAILABLE') return fail(503,'VISIT_DIGEST_UNAVAILABLE');
    if ((request.path.endsWith('/seen') && request.method!=='POST') || (!request.path.endsWith('/seen') && request.method!=='GET')) return fail(405,'FIXTURE_METHOD_NOT_ALLOWED');
    const key = JSON.stringify([config.userId,workspace]);
    if (!baselines.has(key) && baselines.size>=32) return fail(503,'VISIT_DIGEST_CAPACITY');
    const world = scaled();
    const facts: DigestFact[] = world.alphas.slice(0,4).flatMap(alpha=>alpha.deployments.slice(0,1).map(d=>({
      id:`stage:${d.id}`,kind:'STAGE' as const,label:`${alpha.label} · ${d.stage}`,value:d.stage,
      href:`/deployments/alphas/${encodeURIComponent(alpha.id)}?deployment_id=${encodeURIComponent(d.id)}`,as_of:d.updatedAt,
    })));
    for(const op of world.operations.slice(0,4)) facts.push({id:`operation:${op.id}`,kind:'OPERATION',
      label:op.command,value:op.verify,href:`/execution/operations?operation_id=${encodeURIComponent(op.id)}`,as_of:op.at});
    const snapshot = makeDigestSnapshot(workspace,config.nowIso,facts);
    if(!baselines.has(key)) {
      // Explicit scenario baseline, not a guessed user visit from fixture dates.
      const previous = makeDigestSnapshot(workspace,config.nowIso,facts.slice(0,-2).map((f,i)=>i<2?{...f,value:'PREVIOUS_TEST_STATE'}:f));
      baselines.set(key,config.reviewProfile==='sparse-realistic'?null:makeBaseline(previous,1,config.nowIso));
    }
    let baseline=baselines.get(key)!;
    if(request.method==='POST') {
      const body=request.body as Record<string,unknown>|null;
      if(!body || Object.keys(body).sort().join(',')!=='expected_baseline_version,snapshot_revision' ||
        typeof body.snapshot_revision!=='string' || !/^[0-9a-f]{64}$/.test(body.snapshot_revision) ||
        !Number.isSafeInteger(body.expected_baseline_version) || Number(body.expected_baseline_version)<0)
        return fail(400,'VISIT_DIGEST_INPUT_INVALID');
      if(body.snapshot_revision!==snapshot.revision) return fail(409,'VISIT_DIGEST_SNAPSHOT_CHANGED');
      if(baseline?.snapshot_revision!==snapshot.revision) {
        if(body.expected_baseline_version!==(baseline?.version??0)) return fail(409,'VISIT_DIGEST_BASELINE_CHANGED');
        baseline=makeBaseline(snapshot,(baseline?.version??0)+1,config.nowIso);baselines.set(key,baseline);
      }
    }
    return {status:200,headers:{'content-type':'application/json'},body:composeVisitDigest(snapshot,baseline,config.writes!=='refuse')};
  };
}
