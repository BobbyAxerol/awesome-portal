import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertAttestation } from './import-attestation-receipt.mjs';

const source_digest='a'.repeat(64);
const fact={schema_version:'research.alpha-import-attestation.v1',scope:'REGISTERED_ALPHA_SOURCE_ONLY',source_digest,
  signature:{state:'NOT_PUBLISHED',reason_code:'RESEARCH_ALPHA_IMPORT_SIGNATURE_NOT_PRODUCED',
    source_locator:'apps/control-api/src/research/alpha-import.service.ts#register'},
  sbom:{state:'NOT_PUBLISHED',reason_code:'RESEARCH_ALPHA_IMPORT_SBOM_NOT_PRODUCED',
    source_locator:'apps/control-api/src/research/alpha-import.service.ts#register'}};
test('actual import proof requires exact subject, both typed reasons and source locator',()=>{
  assert.equal(assertAttestation({source_digest,import_attestation:fact}),fact);
  for(const changed of [{...fact,source_digest:'b'.repeat(64)},{...fact,scope:'SIGNED_RELEASE_IMAGE'},
    {...fact,signature:{state:'AVAILABLE'}},{...fact,sbom:{...fact.sbom,source_locator:'release-image-sbom'}}]) {
    assert.throws(()=>assertAttestation({source_digest,import_attestation:changed}));
  }
  assert.throws(()=>assertAttestation({source_digest}));
});
