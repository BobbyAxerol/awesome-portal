/* TEST_ONLY: hold a delivery transaction after HTTP finish until SIGKILL.
 * Only the uniquely named disposable RLS cluster and test login are allowed. */
const {createServer} = require("node:http");
const {createJiti} = require("jiti");
const {Pool} = require("pg");
const {deliverC2TestResponse} = createJiti(__filename,{fsCache:false})("../../src/execution-v2/c2-p7-http-delivery-candidate.ts");
let started=false;
process.on("disconnect",()=>process.exit(1));
process.on("message",async message=>{
  if(started)return;started=true;
  try {
    const url=new URL(message.database),match=/^control-api-test-postgres-([a-f0-9]{8})$/.exec(url.hostname);
    if(message.type!=="START"||process.env.PORTAL_TEST_RESTORE_RLS!=="TEST_ONLY_DISPOSABLE_RLS"||!match||
       url.pathname!==`/portal_restore_rls_${match[1]}`||!/^test_delivery_app_[a-f0-9]{12}$/.test(url.username)||
       url.protocol!=="postgres:"||url.search||url.hash)throw Error("TEST_ONLY_GUARD");
    const pool=new Pool({connectionString:message.database,max:1,connectionTimeoutMillis:3000,query_timeout:5000});
    const payload=Buffer.from("X".repeat(128));
    const server=createServer((_request,response)=>{
      deliverC2TestResponse(pool,response,message.binding,payload,5000,async()=>{
        process.send?.({type:"AFTER_FINISH_BEFORE_COMMIT"});
        await new Promise(()=>{});
      }).catch(()=>{process.send?.({type:"REFUSED"});});
    });
    server.listen(0,"127.0.0.1",()=>{const address=server.address();
      if(!address||typeof address==="string")return process.send?.({type:"REFUSED"});
      process.send?.({type:"READY",port:address.port});
    });
  } catch {process.send?.({type:"REFUSED"});}
});
