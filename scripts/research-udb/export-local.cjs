// Run ONLY the reviewed code image in a local Portal-dev network one-shot.
// No app server/workers/source traffic; rows go to a private receipt.
const {Pool}=require('pg');
const {exportRetainedStore}=require('/opt/control-api/dist/execution/retained-store-transfer.js');
async function main(){
  const [workspace,run,prefix,lane]=process.argv.slice(2);
  if(lane && !['projection-history','current-entities'].includes(lane)) throw Error('UDB_TRANSFER_LANE_INVALID');
  const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
  try{const manifest=await exportRetainedStore(pool,workspace,run,prefix,lane);console.log(JSON.stringify(manifest));}
  finally{await pool.end();}
}
main().catch(e=>{console.error(JSON.stringify({error:/^[A-Z0-9_]+$/.test(e.message)?e.message:'UDB_LOCAL_EXPORT_FAILED'}));process.exitCode=1;});
