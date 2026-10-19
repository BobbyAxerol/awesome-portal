/** Offline owner maintenance ONLY. No HTTP listener, startup install, user,
 * password, membership or session creation, SQL grant seed or stable copy. */
import "reflect-metadata";
import {loadConfig} from "../config";
import {buildPool} from "../db/pool";
import {nativeCoreRuntimeReference,prepareNativeCoreRuntime,nativeResearchSchemaReference,prepareNativeResearchSchemaInstall} from "../execution-v2/native-core-runtime";
import {nativeResearchReview} from "../execution/native-review-profile";
import {installResearchCurrentHumanSchema,assertRegisteredResearchCurrentHumanSchema} from "../execution-v2/current-human-schema";
import {AuthService} from "../auth/auth.service";
import {Argon2CredentialService} from "../auth/argon";
import {ExecutionAccessService} from "../execution-v2/access.service";

async function main(){
  const [operation,...extra]=process.argv.slice(2),config=loadConfig();
  if(extra.length||!["schema","policy"].includes(operation??"")||!nativeResearchReview(config)||
    config.PORTAL_ENV!=="local"||config.AUTH_MODE!=="dev")throw new Error("NATIVE_RESEARCH_INSTALL_SCOPE_REQUIRED");
  if(operation==="schema"){
    const reference=nativeResearchSchemaReference();
    if(!reference)throw new Error("NATIVE_RESEARCH_SCHEMA_TARGET_REQUIRED");
    const prepared=await prepareNativeResearchSchemaInstall(reference,config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID!);
    const pool=buildPool(config.DATABASE_URL,prepared.poolProfile);
    try{process.stdout.write(JSON.stringify(await installResearchCurrentHumanSchema(pool,prepared.target))+"\n");}
    finally{await pool.end();}
    return;
  }
  const reference=nativeCoreRuntimeReference();
  if(!reference)throw new Error("NATIVE_RESEARCH_INSTALL_SCOPE_REQUIRED");
  const native=await prepareNativeCoreRuntime(reference),target=native.researchReviewTarget(config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID!);
  const pool=buildPool(config.DATABASE_URL,native.poolProfile);
  try{
    await assertRegisteredResearchCurrentHumanSchema(pool,target);
    const deps=await native.compose(pool);
    if(!deps.nativeManagerRead||!deps.currentHumanMutations||!deps.executionAccessTrust)
      throw new Error("NATIVE_RESEARCH_INSTALL_COMPOSITION_REQUIRED");
    const auth=new AuthService(pool,config,new Argon2CredentialService({memoryKib:config.ARGON2_MEMORY_KIB,
      iterations:config.ARGON2_ITERATIONS,parallelism:config.ARGON2_PARALLELISM}),deps.currentHumanMutations);
    const access=new ExecutionAccessService(pool,auth,deps.executionAccessTrust,false,deps.currentHumanMutations);
    const results=await deps.nativeManagerRead.installOwnerPolicies(access);
    process.stdout.write(JSON.stringify({schema_version:"portal.native-research-owner-install.v1",results})+"\n");
  }finally{await pool.end();}
}
void main().catch(error=>{
  // Neither paths, private JSON, SQL details, URLs nor source exceptions.
  const code=error instanceof Error&&/^CURRENT_HUMAN_SCHEMA_[A-Z_]+$/.test(error.message)?error.message:"NATIVE_RESEARCH_INSTALL_FAILED";
  process.stderr.write(JSON.stringify({code})+"\n");process.exitCode=1;
});
