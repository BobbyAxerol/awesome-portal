import "reflect-metadata";
import {Pool} from "pg";
import {loadConfig} from "../config";
import {migrateExecutionStore} from "../execution/store-schema";
import {importRetainedStore} from "../execution/retained-store-transfer";
import {provisionRetainedWorkspace} from "../execution/retained-workspace";
import {provisionRetainedReviewAccess} from "../execution/retained-review-access";

async function main() {
  const [operation,value]=process.argv.slice(2),cfg=loadConfig();
  // Operator tool is preview-only. This approval never changes prod/dev/main.
  if(cfg.PORTAL_ENV!=="local"||cfg.AUTH_MODE!=="dev"||!cfg.EXECUTION_DATABASE_URL) throw new Error("UDB02_PREVIEW_ONLY");
  const target=new Pool({connectionString:cfg.EXECUTION_DATABASE_URL,max:1});
  const core=new Pool({connectionString:cfg.DATABASE_URL,max:1});
  try {
    if(operation==="migrate"&&!value) console.log(JSON.stringify({schema_digest:await migrateExecutionStore(target)}));
    else if(operation==="provision"&&value) console.log(JSON.stringify(await provisionRetainedWorkspace(core,cfg,value)));
    else if(operation==="grant-review"&&value) console.log(JSON.stringify(await provisionRetainedReviewAccess(core,cfg,value)));
    else if(operation==="revoke-review"&&value) console.log(JSON.stringify(await provisionRetainedReviewAccess(core,cfg,value,true)));
    else if(operation==="import"&&value) console.log(JSON.stringify(await importRetainedStore(target,core,value)));
    else throw new Error("USAGE_execution-store_migrate_provision_import_grant-review_revoke-review");
  }finally{await Promise.all([target.end(),core.end()]);}
}
void main().catch(error=>{console.error(JSON.stringify({error:/^[A-Z0-9_]+$/.test(error.message)?error.message:"UDB02_OPERATION_FAILED",code:/^[A-Z0-9]{5}$/.test(error.code??"")?error.code:null}));process.exitCode=1;});
