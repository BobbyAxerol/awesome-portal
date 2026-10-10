// UDB-02 bootstrap only: new Execution volume credentials, never Core keys.
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const dir='/home/bobby/.config/portal-research-preview/execution-store';
fs.mkdirSync(dir,{recursive:true,mode:0o700});
if(fs.lstatSync(dir).isSymbolicLink() || (fs.statSync(dir).mode & 0o777)!==0o700)
  throw Error('UDB_PRIVATE_DIRECTORY_REQUIRED');
const files=['owner-password','runtime-password','owner-url','runtime-url'];
const present=files.filter(f=>fs.existsSync(path.join(dir,f)));
if(present.length!==0 && present.length!==files.length) throw Error('UDB_PARTIAL_SECRET_SET_REFUSED');
if(!present.length){
  const owner=crypto.randomBytes(32).toString('hex'),runtime=crypto.randomBytes(32).toString('hex');
  // Parent0700; only PG receives password file mounts. PG's UID70 needs read.
  fs.writeFileSync(path.join(dir,'owner-password'),owner,{flag:'wx',mode:0o644});
  fs.writeFileSync(path.join(dir,'runtime-password'),runtime,{flag:'wx',mode:0o644});
  fs.writeFileSync(path.join(dir,'owner-url'),`postgres://exec_owner:${owner}@execution-postgres:5432/portal_execution`,{flag:'wx',mode:0o600});
  fs.writeFileSync(path.join(dir,'runtime-url'),`postgres://exec_runtime:${runtime}@execution-postgres:5432/portal_execution`,{flag:'wx',mode:0o600});
}
// writeFile's mode is filtered by the caller's umask077. Set the intended
// mount-only PG readability explicitly; the host parent remains0700.
for(const file of ['owner-password','runtime-password']) fs.chmodSync(path.join(dir,file),0o644);
console.log(JSON.stringify({result:present.length?'EXISTING_PRESERVED':'CREATED',files:files.length,credentials_printed:false}));
