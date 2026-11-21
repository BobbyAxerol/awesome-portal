#!/usr/bin/env node
/** Installed-source input/dependency census, explicitly NOT product qualification. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateHome} from './cell.mjs';
import {savePrivate} from './api-client.mjs';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const home=validateHome(process.argv.find(a=>a.startsWith('--home='))?.slice(7));
assert(home.endsWith('/full06'),'EXACT_FULL06_OWNED_HOME');
const path=join(home,'installed-route-input-census.json');assert(!existsSync(path),'IMMUTABLE_CENSUS_EXISTS');
const container='portal-research-p23-ol12-portal-api-1';
const docker=args=>execFileSync('sudo',['-n','docker',...args],{encoding:'utf8',maxBuffer:1024*1024});
assert.equal(docker(['inspect','--format','{{index .Config.Labels "com.docker.compose.project"}}',container]).trim(),'portal-research-p23-ol12');
const installed=JSON.parse(docker(['exec','-i',container,'python','-c',`
import ast,hashlib,importlib.metadata as metadata,json
from pathlib import Path
root=Path('/usr/local/lib/python3.12/site-packages/quantbt')
names={'pct_equity','intrabar_bracket','intrabar_bracket_reference','dca_ladder','fill_replay','orders',
 'native_event_lifecycle','event_driven','reactive','native_event_strategy','portfolio','basket','arbitrage','options','nautilus_dca_grid'}
classes={'OrderIntent','OrderCommand','DcaGridSpec','BasketSpec','BasisArbitrageSpec','StatArbPairSpec',
 'NativeOptionConfig','OptionInstrumentSpec','OptionPackageIntent','FillReplayTape','IntrabarLevelMode','IntrabarSizingMode'}
routes=[];inputs=[]
for path in sorted(root.rglob('*.py')):
 raw=path.read_bytes();tree=ast.parse(raw);sha=hashlib.sha256(raw).hexdigest();rel=str(path.relative_to(root))
 for node in ast.walk(tree):
  if rel=='endpoint.py' and isinstance(node,ast.FunctionDef) and node.name in names:
   routes.append({'name':node.name,'source':rel+':'+str(node.lineno),'file_sha256':sha,'signature':ast.unparse(node.args),
     'documentation':ast.get_docstring(node),'direct_call_executed':False})
  if isinstance(node,ast.ClassDef) and node.name in classes:
   fields=[ast.unparse(n) for n in node.body if isinstance(n,(ast.AnnAssign,ast.Assign))]
   inputs.append({'name':node.name,'source':rel+':'+str(node.lineno),'file_sha256':sha,'declared_fields':fields[:64],
      'field_count':len(fields)})
print(json.dumps({'engine':metadata.version('quantbt-engine'),'native':metadata.version('quantbt-native'),
 'native_distribution_top_paths':sorted({str(p).split('/')[0] for p in metadata.distribution('quantbt-native').files or []}),
 'nautilus_installed':any(d.metadata['Name'].lower().replace('_','-')=='nautilus-trader' for d in metadata.distributions()),
 'routes':routes,'input_schemas':inputs}))` ]));
assert.equal(installed.engine,'1.1.1');assert.equal(installed.native,'0.4.2');
const localFiles=['apps/portal/strategy/main.py','apps/portal/strategy/delta_rsi.py',
 'apps/portal/backend/src/portal_api/adapters/market_data.py',
 'apps/portal/backend/src/portal_api/adapters/quantbt.py'];
const source_files=localFiles.map(file=>({path:file,sha256:createHash('sha256').update(readFileSync(join(root,file))).digest('hex')}));
const families=[
 {batch:'6a',routes:['pct_equity'],state:'PORTAL_PRODUCT_QUALIFICATION_IN_PROGRESS',
  input:'Immutable scalar Delta AV1.0.2 + indexed OHLCV;10% live-equity allocation; exact leverage/fee/slippage/funding descriptor.'},
 {batch:'6b',routes:['intrabar_bracket','dca_ladder'],state:'PORTAL_INPUT_ADAPTER_REQUIRED',
  reason:'Protected Delta emits pos_weight/exit_type/exit_price, not an immutable bracket-intent or integer ladder declaration. OHLC coverage exists. Add separate typed strategy/input adapter; do not cast draft level_mode or scalar weights.'},
 {batch:'6c',routes:['fill_replay'],state:'GENUINE_IMMUTABLE_FILL_TAPE_REQUIRED',
  reason:'The approved read-only HMD loader supplies bars, not observed fills or immutable fee/funding tape. Select an explicit fill source; no OHLC-to-fill fabrication or strategy-quality claim.'},
 {batch:'6d',routes:['orders','native_event_lifecycle','event_driven','reactive'],state:'PORTAL_TYPED_RUNTIME_ADAPTER_REQUIRED',
  reason:'Installed engine supports typed intents/commands/reactive strategy callbacks. Portal has no bounded declaration, reset/clock adapter, retention/read chain for this family yet. This is Portal implementation work, not an engine upgrade.'},
 {batch:'6e',routes:['portfolio','basket','arbitrage'],state:'PORTAL_MULTI_LEG_INPUT_ADAPTER_REQUIRED',
  reason:'Historical bars alone are not immutable aligned leg/hedge/position declarations. Need named multi-symbol legs, sizing/cost semantics and native result mapping. Preserve engine specialized-arbitrage exclusions.'},
 {batch:'6f-options',routes:['options'],state:'GENUINE_OPTION_CHAIN_AND_INSTRUMENT_INPUT_REQUIRED',
  reason:'Native option backend is installed; approved OHLCV store is not an option chain/instrument/package source. Do not invent instruments, Greeks, settlement or balances.'},
 {batch:'6f-nautilus',routes:['nautilus_dca_grid'],state:'EXTERNAL_DEPENDENCY_AND_TYPED_GRID_INPUT_REQUIRED',
  reason:'No nautilus-trader distribution in the exact candidate. Grid spec/typed package-order adapter also absent. Native wheel0.4.2 is installed and is not this dependency.'},
];
const proof={schema_version:'research.full06-input-census.v1',scope:'INSTALLED_SOURCE_AND_PORTAL_BOUNDARIES_NOT_ROUTE_EXECUTION',
 recorded_at_utc:new Date().toISOString(),image_id:docker(['inspect','--format','{{.Image}}',container]).trim(),installed,source_files,families};
savePrivate(path,proof);
console.log(JSON.stringify({engine:installed.engine,native:installed.native,nautilus_installed:installed.nautilus_installed,
 inspected_constructors:installed.routes.length,input_schemas:installed.input_schemas.length,
 evidence_sha256:createHash('sha256').update(readFileSync(path)).digest('hex'),scope:proof.scope}));
