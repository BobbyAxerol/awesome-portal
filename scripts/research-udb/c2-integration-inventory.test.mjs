import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, writeFileSync, rmSync, mkdirSync, symlinkSync, unlinkSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const script=resolve(fileURLToPath(new URL('./c2-integration-inventory.mjs',import.meta.url)));
test('captures tracked/untracked, detects content and HEAD drift, and refuses staged changes and symlinks',()=>{
  const root=mkdtempSync(join(tmpdir(),'portal-c2-inventory-'));
  const run=(...args)=>execFileSync('git',args,{cwd:root,stdio:'ignore'});
  const invoke=(...args)=>spawnSync(process.execPath,[script,...args],{cwd:root,encoding:'utf8'});
  try {
    run('init','-q');run('config','user.name','Inventory Test');run('config','user.email','inventory@example.invalid');
    writeFileSync(join(root,'tracked'),'original');run('add','tracked');run('commit','-qm','baseline');
    writeFileSync(join(root,'tracked'),'modified');mkdirSync(join(root,'dir'));writeFileSync(join(root,'dir','new'),'new');
    // Inventory files normally live at the two explicitly excluded paths.
    const dir=join(root,'upgrade/execution_loop/evidence/ELP2-10');mkdirSync(dir,{recursive:true});
    const manifest=join(dir,'CORE_C2_INTEGRATION_WIP_INVENTORY_20261106.json');
    const captured=invoke('capture',manifest);assert.equal(captured.status,0,JSON.stringify(captured));
    assert.equal(invoke('verify',manifest).status,0);
    assert.notEqual(invoke('capture',manifest).status,0);
    writeFileSync(join(root,'dir','new'),'changed');assert.notEqual(invoke('verify',manifest).status,0);
    writeFileSync(join(root,'dir','new'),'new');assert.equal(invoke('verify',manifest).status,0);
    run('add','tracked');assert.match(invoke('verify',manifest).stderr,/STAGED_CHANGES_NOT_SUPPORTED/);
    run('reset','-q','HEAD','--','tracked');
    symlinkSync('/etc/passwd',join(root,'dir','link'));assert.notEqual(invoke('verify',manifest).status,0);
    unlinkSync(join(root,'dir','link'));
    unlinkSync(join(root,'tracked'));assert.notEqual(invoke('verify',manifest).status,0);
    writeFileSync(join(root,'tracked'),'modified');assert.equal(invoke('verify',manifest).status,0);
    assert.deepEqual(JSON.parse(readFileSync(manifest,'utf8')).entries.map(x=>x.path),['dir/new','tracked']);
    // A later, separately named capture must retain the historical manifest as
    // an input while excluding only itself; never overwrite the old evidence.
    const second=join(dir,'CORE_C2_INTEGRATION_WIP_INVENTORY_20261106_review-1.json');
    assert.equal(invoke('capture',second).status,0);
    assert.equal(invoke('verify',second).status,0);
    const paths=JSON.parse(readFileSync(second,'utf8')).entries.map(x=>x.path);
    assert(paths.includes('upgrade/execution_loop/evidence/ELP2-10/CORE_C2_INTEGRATION_WIP_INVENTORY_20261106.json'));
    assert(!paths.includes('upgrade/execution_loop/evidence/ELP2-10/CORE_C2_INTEGRATION_WIP_INVENTORY_20261106_review-1.json'));
    assert.notEqual(invoke('capture',second).status,0);
    assert.notEqual(invoke('verify',manifest).status,0);
    assert.notEqual(invoke('capture',join(root,'other.json')).status,0);
    run('add','tracked');run('commit','-qm','later');assert.notEqual(invoke('verify',manifest).status,0);
  } finally {rmSync(root,{recursive:true,force:true});}
});
