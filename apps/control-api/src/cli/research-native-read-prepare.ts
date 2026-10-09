import "reflect-metadata";
/** Explicit preparation/backfill; no GET, engine run, seal replacement or SQL workaround. */
import {createControlApiApp} from "../app";
import {loadConfig} from "../config";
import {buildPool} from "../db/pool";
import {ResearchNativeReadService} from "../research/native-read.service";
import {ResearchReportService} from "../research/report.service";
async function main(){
  const args=process.argv.slice(2);
  if(args.length!==6||args[0]!=="--workspace-id"||args[2]!=="--actor-id"||args[4]!=="--run-id"
    ||args.filter((_,i)=>i%2===1).some(v=>!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(v)))
    throw new Error("usage: research-native-read-prepare --workspace-id <id> --actor-id <member> --run-id <id>");
  const config=loadConfig(),pool=buildPool(config.DATABASE_URL),app=await createControlApiApp(config,pool);
  try{
    const scope={workspaceId:args[1]!,actorUserId:args[3]!},runId=args[5]!;
    const source=await app.get(ResearchNativeReadService).prepare(scope,runId);
    const report=await app.get(ResearchReportService).materialize(scope,runId);
    console.log(JSON.stringify({run_id:runId,projection_digest:source?.digest??null,trials:source?.custody.trials.length??null,report_revision:report.report_revision}));
  }finally{await app.close();await pool.end();}
}
void main();
