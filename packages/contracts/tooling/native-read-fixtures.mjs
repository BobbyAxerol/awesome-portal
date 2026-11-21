/** Explicit evidence import; canonical public DTOs only, never secrets/paths. */
import {readFileSync,writeFileSync} from 'node:fs';
const path=process.argv[2];
if(!path?.startsWith('/home/bobby/.local/state/portal-research-p23/'))throw Error('Explicit private native proof required');
const source=JSON.parse(readFileSync(path,'utf8'));
if(source.authority!=='CANDIDATE_READERS_AND_VERIFIED_REAL_P05_ON_PREVIEW_DB_NOT_DEPLOYED_HTTP')throw Error('Real retained candidate proof required');
for(const [name,value] of [
 ['research-native-search.valid.json',source.search_full.native_search],
 ['research-native-freeze.valid.json',source.freeze.native_freeze],
 ['research-native-report.valid.json',source.report.frozen_core.native_report],
]){
 if(!value||JSON.stringify(value).match(/private_key|artifact_store_path|x-portal-principal|lease_token/))throw Error('Unsafe native fixture');
 writeFileSync(new URL(`../fixtures/${name}`,import.meta.url),JSON.stringify(value,null,2)+'\n');
}
