import { createHash } from 'node:crypto';
import { chmodSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { P23_TESTS, buildQualificationReceipt, readEvidence, runQualification, validateQualificationConfig } from './qualify.mjs';
import { RUNTIME_BUDGET_BYTES, evaluateContainers } from './resource-snapshot.mjs';

const config = { project:'portal-research-p23-ol12',base_url:'http://127.0.0.1:8096/',candidate_source_sha:'a'.repeat(40) };
const directories=[];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory,{recursive:true,force:true}); });

// Technical verifier fixtures only. No unit-generated file is an actual
// workload receipt and these tests never close a P23 product qualification.
function fixture() {
  const dir=mkdtempSync(join(tmpdir(),'research-p23-verifier-')); directories.push(dir);
  const write=(name,body) => {
    const locator=join(dir,name); writeFileSync(locator,typeof body === 'string' ? body : JSON.stringify(body),{mode:0o600});
    return {kind:'receipt',locator,command:'unit verifier fixture (not qualification)',exit_code:0,
      sha256:createHash('sha256').update(readFileSync(locator)).digest('hex')};
  };
  const base=write('proof.log','Technical fixture: no runtime qualification claim.');
  const samples=['2026-09-27T00:00:00.000Z','2026-09-27T00:00:10.000Z'].map(sampled_at_utc => ({
    ...evaluateContainers(Object.entries(RUNTIME_BUDGET_BYTES).map(([service,limit]) => ({service,
      currentBytes:Math.floor(limit/2),limitBytes:limit,swapLimitBytes:limit,pids:64})),{requireLimits:true,requireComplete:true}),
    project:config.project,sampled_at_utc,
  }));
  const resource={schema_version:'research.p23-resource-series.v1',project:config.project,
    passed:true,sample_count:2,peak_current_bytes:2_300_000_000,samples};
  const read_load={schema_version:'research.p23-read-load.v1',base_url:config.base_url,passed:true,distinct_users:20,
    started_at_utc:'2026-09-27T00:00:02.000Z',completed_at_utc:'2026-09-27T00:00:08.000Z',
    by_path:{'/api/v1/research/quantbt/atlas':{requests:20,statuses:{'200':20}}}};
  const workload={schema_version:'research.p23-mixed-workload.v1',project:config.project,candidate_source_sha:config.candidate_source_sha,
    started_at_utc:'2026-09-27T00:00:01.000Z',completed_at_utc:'2026-09-27T00:00:09.000Z',
    heavy_active_peak:1,distinct_heavy_intents_queued:4,completed_heavy_runs:1};
  const runtime={resource,read_load,workload};
  const refs=Object.entries(runtime).map(([role,body]) => {
    const ref=write(`${role}.json`,body); runtime[`${role}_locator`]=ref.locator; return ref;
  });
  for (const [test_id] of P23_TESTS) write(`${test_id}.json`,{...config,test_id,status:'PASS',
    evidence:['P23-T01','P23-T11'].includes(test_id) ? [base,...refs] : [base]});
  const evidence=()=>readEvidence(dir,config);
  const replaceRuntime=(role,body) => {
    const ref=write(`${role}.json`,body); runtime[role]=body;
    for (const id of ['P23-T01','P23-T11']) {
      const row=JSON.parse(readFileSync(join(dir,`${id}.json`),'utf8'));
      row.evidence=row.evidence.map(item => item.locator===ref.locator ? ref : item);
      write(`${id}.json`,row);
    }
  };
  return {dir,base,write,runtime,evidence,replaceRuntime};
}

describe('OL-12 P23 qualification verifier', () => {
  it('pins every T-id to the exact canonical Guide P23 requirement, not a replacement matrix', () => {
    const guide=readFileSync(new URL('../../upgrade/research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md',import.meta.url),'utf8');
    const scope=guide.slice(guide.indexOf('<a id="phase-p23"></a>'),guide.indexOf('<a id="phase-p24"></a>'));
    const rows=[...scope.matchAll(/^\| `(P23-T\d+)` \| (.*?) \|$/gm)].map(match => [match[1],match[2]]);
    expect(rows).toHaveLength(15); expect(P23_TESTS).toEqual(rows);
  });

  it('fails closed without actual receipts and never implies product activation', () => {
    const receipt=buildQualificationReceipt(config);
    expect(receipt.tests).toHaveLength(15);
    expect(receipt.tests.every(test => test.status === 'BLOCKED')).toBe(true);
    expect(receipt.passed).toBe(false); expect(receipt.product_active).toBe(false);
  });

  it('rejects shared/production/other-port targets and missing candidate binding', () => {
    expect(() => validateQualificationConfig({...config,project:'portal-research-preview'})).toThrow('P23_PROJECT_ISOLATION_REQUIRED');
    expect(() => validateQualificationConfig({...config,base_url:'http://127.0.0.1:8095/'})).toThrow('P23_LOOPBACK_8096_REQUIRED');
    expect(() => validateQualificationConfig({...config,production:true})).toThrow('P23_SHARED_OR_PRODUCTION_TARGET_REFUSED');
    expect(() => validateQualificationConfig({...config,candidate_source_sha:undefined})).toThrow('P23_CANDIDATE_SOURCE_SHA_REQUIRED');
  });

  it('accepts verifier-fixture byte/scope consistency only with linked timed mixed measurements', () => {
    const f=fixture(); const receipt=buildQualificationReceipt(config,f.evidence(),f.runtime);
    expect(receipt.passed).toBe(true); expect(receipt.product_active).toBe(false);
  });

  it('cannot pass from fifteen PASS manifests when runtime measurement is missing', () => {
    const f=fixture(); const receipt=buildQualificationReceipt(config,f.evidence());
    expect(receipt.passed).toBe(false);
    expect(receipt.tests.find(test => test.test_id === 'P23-T01').status).toBe('BLOCKED');
    expect(receipt.tests.find(test => test.test_id === 'P23-T11').status).toBe('BLOCKED');
  });

  it('checks the actual referenced byte hash, including modification after intake', () => {
    const f=fixture(); const evidence=f.evidence(); writeFileSync(f.base.locator,'modified bytes');
    expect(buildQualificationReceipt(config,evidence,f.runtime).passed).toBe(false);
    expect(f.evidence().get('P23-T02')).toBeNull();
  });

  it('rejects missing, symlink and non-private evidence references', () => {
    const f=fixture(); const original=f.base.locator; const copied=f.write('copy.log',readFileSync(original,'utf8'));
    unlinkSync(original); expect(f.evidence().get('P23-T02')).toBeNull();
    symlinkSync(copied.locator,original); expect(f.evidence().get('P23-T02')).toBeNull();
    unlinkSync(original); writeFileSync(original,readFileSync(copied.locator),{mode:0o600}); chmodSync(original,0o644);
    expect(f.evidence().get('P23-T02')).toBeNull();
  });

  it('rejects prior candidate, other project and malformed all-PASS Map input', () => {
    const f=fixture(); const body=JSON.parse(readFileSync(join(f.dir,'P23-T02.json'),'utf8'));
    f.write('P23-T02.json',{...body,candidate_source_sha:'b'.repeat(40)});
    expect(f.evidence().get('P23-T02')).toBeNull();
    f.write('P23-T02.json',{...body,project:'portal-research-p23-other'});
    expect(f.evidence().get('P23-T02')).toBeNull();
    const forged=new Map(P23_TESTS.map(([test_id]) => [test_id,{test_id,status:'PASS'}]));
    expect(buildQualificationReceipt(config,forged,f.runtime).passed).toBe(false);
  });

  it('rejects idle, wrong-cap or unlinked resource metadata even if top-level passed is true', () => {
    const f=fixture(); const original=f.runtime.resource;
    for (const resource of [
      {...f.runtime.resource,sample_count:1,samples:f.runtime.resource.samples.slice(0,1)},
      {...f.runtime.resource,project:'portal-research-preview'},
      {...f.runtime.resource,peak_current_bytes:1},
      {...f.runtime.resource,samples:f.runtime.resource.samples.map(sample => ({...sample,base_limit_bytes:8_000_000_000}))},
      {...original,samples:original.samples.map(sample => ({...sample,containers:sample.containers.map((row,i) => i===0 ? {...row,limit_bytes:0} : row)}))},
    ]) {
      f.replaceRuntime('resource',resource);
      expect(buildQualificationReceipt(config,f.evidence(),f.runtime).passed).toBe(false);
    }
    f.replaceRuntime('resource',original);
    expect(buildQualificationReceipt(config,f.evidence(),{...f.runtime,resource_locator:undefined}).passed).toBe(false);
  });

  it('rejects reused/insufficient-principal measurements and absent active/queued heavy work', () => {
    const f=fixture();
    const original=f.runtime.read_load;
    f.replaceRuntime('read_load',{...original,distinct_users:19});
    expect(buildQualificationReceipt(config,f.evidence(),f.runtime).passed).toBe(false);
    f.replaceRuntime('read_load',original);
    f.replaceRuntime('workload',{...f.runtime.workload,distinct_heavy_intents_queued:0});
    const receipt=buildQualificationReceipt(config,f.evidence(),f.runtime);
    expect(receipt.passed).toBe(false);
    expect(receipt.tests.find(test => test.test_id==='P23-T11').status).toBe('PASS');
  });

  it('rejects a validly hashed read receipt from a different measurement window', () => {
    const f=fixture(); const read_load={...f.runtime.read_load,started_at_utc:'2026-09-28T00:00:02Z',completed_at_utc:'2026-09-28T00:00:08Z'};
    f.write('read_load.json',read_load);
    for (const id of ['P23-T01','P23-T11']) {
      const body=JSON.parse(readFileSync(join(f.dir,`${id}.json`),'utf8'));
      body.evidence=body.evidence.map(item => item.locator===f.runtime.read_load_locator
        ? {...item,sha256:createHash('sha256').update(readFileSync(item.locator)).digest('hex')} : item);
      f.write(`${id}.json`,body);
    }
    expect(buildQualificationReceipt(config,f.evidence(),{...f.runtime,read_load}).passed).toBe(false);
  });

  it('refuses a mismatched manifest before issuing Docker or HTTP measurement commands', () => {
    const f=fixture(); const c=f.write('config.json',config); const m=f.write('manifest.json',{base_url:'http://127.0.0.1:8095/'});
    expect(() => runQualification({configPath:c.locator,readManifest:m.locator})).toThrow('P23_READ_MANIFEST_URL_MISMATCH');
  });
});
