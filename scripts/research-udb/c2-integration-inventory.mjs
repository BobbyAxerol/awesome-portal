#!/usr/bin/env node
// Point-in-time inventory only. This is not a security approval or backup.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {constants, closeSync, fstatSync, openSync, readFileSync, realpathSync, writeFileSync} from 'node:fs';
import {dirname, isAbsolute, relative, resolve, sep} from 'node:path';

const legacyExcluded = new Set([
  'upgrade/execution_loop/evidence/ELP2-10/CORE_C2_INTEGRATION_WIP_INVENTORY_20261106.json',
  'upgrade/execution_loop/evidence/ELP2-10/CORE_C2_INTEGRATION_WIP_INVENTORY_20261106.md',
]);
const git = (cwd, ...args) => execFileSync('git', args, {cwd, encoding:'buffer', maxBuffer:32*1024*1024});
const lines0 = value => {
  const decoded=value.toString('utf8');
  if (!Buffer.from(decoded,'utf8').equals(value)) throw Error('NON_UTF8_PATH_UNSUPPORTED');
  return value.length ? decoded.split('\0').filter(Boolean) : [];
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function inside(root, path) {
  const rel=relative(root,path);
  return rel!=='' && rel!=='..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
function inventory(cwd, excluded) {
  const root=realpathSync(git(cwd,'rev-parse','--show-toplevel').toString('utf8').trim());
  const head=git(root,'rev-parse','HEAD').toString('utf8').trim();
  if (lines0(git(root,'diff','--cached','--name-only','-z')).length) throw Error('STAGED_CHANGES_NOT_SUPPORTED');
  const tracked=lines0(git(root,'diff','--name-only','-z','--no-renames'));
  const untracked=lines0(git(root,'ls-files','--others','--exclude-standard','-z'));
  const entries=[];
  for (const [kind,paths] of [['tracked',tracked],['untracked',untracked]]) for (const name of paths) {
    if (excluded.has(name)) continue;
    const path=resolve(root,name);
    if (!inside(root,path)) throw Error(`PATH_OUTSIDE_REPOSITORY: ${name}`);
    let parent;
    try {parent=realpathSync(dirname(path));}
    catch (error) {
      if (kind==='tracked' && error.code==='ENOENT') {entries.push({path:name,kind,state:'deleted'});continue;}
      throw error;
    }
    if (parent!==root && !inside(root,parent)) throw Error(`PATH_OUTSIDE_REPOSITORY: ${name}`);
    let fd;
    try { fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW); }
    catch (error) {
      if (kind==='tracked' && error.code==='ENOENT') {entries.push({path:name,kind,state:'deleted'});continue;}
      throw error;
    }
    try {
      const before=fstatSync(fd);
      if (!before.isFile()) throw Error(`NOT_A_REGULAR_FILE: ${name}`);
      const bytes=readFileSync(fd),after=fstatSync(fd);
      if (before.size!==after.size || before.mtimeMs!==after.mtimeMs || before.ctimeMs!==after.ctimeMs || bytes.length!==after.size)
        throw Error(`FILE_CHANGED_DURING_READ: ${name}`);
      entries.push({path:name,kind,state:'present',size_bytes:bytes.length,mode:after.mode&0o777,sha256:hash(bytes)});
    } finally {closeSync(fd);}
  }
  entries.sort((a,b)=>Buffer.compare(Buffer.from(a.path),Buffer.from(b.path)));
  return {schema:'portal.c2.integration-wip-inventory.v1',head,exclusions:[...excluded].sort(),entries};
}
function stableInventory(cwd, excluded) {
  const first=inventory(cwd, excluded),second=inventory(cwd, excluded);
  if (JSON.stringify(first)!==JSON.stringify(second)) throw Error('WORKTREE_CHANGED_DURING_INVENTORY');
  return first;
}
function main() {
  const [mode,path,...rest]=process.argv.slice(2);
  if (!['capture','verify'].includes(mode)||!path||rest.length) throw Error('USAGE: c2-integration-inventory.mjs capture|verify <inventory.json>');
  const root=realpathSync(git(process.cwd(),'rev-parse','--show-toplevel').toString('utf8').trim());
  const target=resolve(path),rel=relative(root,target);
  const directory='upgrade/execution_loop/evidence/ELP2-10/';
  if (!rel.startsWith(directory)||!/^CORE_C2_INTEGRATION_WIP_INVENTORY_[0-9]{8}(?:_[A-Za-z0-9-]{1,48})?\.json$/.test(rel.slice(directory.length)))
    throw Error('INVENTORY_TARGET_MUST_BE_CANONICAL');
  // Never follow a replaced evidence directory outside the checkout. Earlier
  // artifacts are ordinary inputs, not exclusions from a later inventory.
  if (realpathSync(dirname(target))!==resolve(root,directory)) throw Error('INVENTORY_TARGET_MUST_BE_CANONICAL');
  const excluded=rel===[...legacyExcluded][0]?legacyExcluded:new Set([rel]);
  const current=stableInventory(process.cwd(),excluded);
  if (mode==='capture') {
    // wx refuses overwriting an existing artifact, including a symlink.
    writeFileSync(target,JSON.stringify(current,null,2)+'\n',{flag:'wx',mode:0o600});
    process.stdout.write(`CAPTURED ${current.entries.length} paths at ${current.head}\n`);
  } else {
    const recorded=JSON.parse(readFileSync(target,'utf8'));
    if (JSON.stringify(recorded)!==JSON.stringify(current)) throw Error('INVENTORY_MISMATCH');
    process.stdout.write(`MATCH ${current.entries.length} paths at ${current.head}\n`);
  }
}
try {main();} catch(error) {process.stderr.write(`${error.message}\n`);process.exitCode=1;}
