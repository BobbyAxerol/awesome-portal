import assert from 'node:assert/strict';
import {test} from 'node:test';
import {classifyManagerProbe} from './qualification-browser.mjs';

test('existing preview observations never confer new Manager qualification', () => {
  assert.equal(classifyManagerProbe({status: 404, framework_route_absent: true}), 'ROUTE_NOT_MOUNTED');
  assert.equal(classifyManagerProbe({status: 404, code: 'EXECUTION_READ_NOT_AVAILABLE'}), 'TYPED_REFUSAL_NOT_POSITIVE_QUALIFICATION');
  assert.equal(classifyManagerProbe({status: 503, code: 'EXECUTION_READ_PUBLICATION_NOT_QUALIFIED'}), 'TYPED_REFUSAL_NOT_POSITIVE_QUALIFICATION');
  assert.equal(classifyManagerProbe({status: 200, schema_version: 'portal.execution.manager-dataset.v1'}), 'DATASET_OBSERVED_NOT_WHOLE_PHASE_ACCEPTANCE');
  assert.equal(classifyManagerProbe({status: 200, schema_version: 'legacy'}), 'UNEXPECTED_RESPONSE');
  assert.equal(classifyManagerProbe({status: 500}), 'UNEXPECTED_RESPONSE');
});
