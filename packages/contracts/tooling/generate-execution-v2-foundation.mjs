import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {schema,openapiDocument} from './execution-v2-foundation.mjs';
import {fixturePack} from './execution-v2-fixtures.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const outputs={
  'schemas/execution-v2-foundation.v1.schema.json':schema,
  'openapi/execution-v2-foundation.openapi.json':openapiDocument(),
  'fixtures/execution-v2-foundation.synthetic.valid.json':fixturePack,
};
for(const [name,value] of Object.entries(outputs)){
  const bytes=JSON.stringify(value,null,2)+'\n'; const target=resolve(root,name);
  if(process.argv.includes('--check')) {if(readFileSync(target,'utf8')!==bytes) throw new Error(`Generated drift: ${name}`);}
  else writeFileSync(target,bytes);
}
