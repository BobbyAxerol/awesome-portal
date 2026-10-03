import assert from 'node:assert/strict';
import test from 'node:test';
import {proofArguments,acceptProof} from './pinned-audit-child-proof.mjs';
const id='11111111-1111-1111-1111-111111111111';
test('proof is networkless/read-only with only original owned volume and bounded source mounts',()=>{
  const args=proofArguments('/home/bobby/portal-research-be','sha256:'+'a'.repeat(64),`p23-pinned-audit-${id}`,id);
  const line=args.join(' ');
  for(const term of ['--pull never','--network none','--read-only','--memory 1536m','--memory-swap 1536m',
    'portal-research-p23-ol12_portal-artifacts:/var/lib/portal/artifacts:ro','apparmor=portal-research-child']) assert(line.includes(term));
  for(const bad of ['--privileged','docker.sock','--env-file','--cap-add','portal-postgres-data']) assert(!line.includes(bad));
});
test('mutable image, escaping source root and broad container identifiers are refused',()=>{
  for(const input of [['/home/bobby/portal-research-be','image:latest',`p23-pinned-audit-${id}`,id],
    ['../source','sha256:'+'a'.repeat(64),`p23-pinned-audit-${id}`,id],
    ['/source','sha256:'+'a'.repeat(64),'portal-research-preview-control-api-1',id]]) assert.throws(()=>proofArguments(...input));
});
test('successful child proof may never be relabelled connected admission or retained product',()=>{
  assert.throws(()=>acceptProof({passed:true,scope:'PRODUCT_ACCEPTED'}));
  assert.throws(()=>acceptProof({passed:true,scope:'REAL_HMD_PINNED_CHILD_BELOW_ADMISSION_NOT_PRODUCT_ACCEPTANCE',
    parent_run_id:'rrun_wrong'}));
});
