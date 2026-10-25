/** TEST_ONLY actual loopback mTLS. Handler data is synthetic protocol test
 * input, not a source registration, accepted authority or connected receipt. */
import { createHash,generateKeyPairSync,X509Certificate } from "node:crypto";
import { createServer,type Server } from "node:https";
import type { Socket } from "node:net";
import type { ServerResponse } from "node:http";
import { commonName,testCertificate } from "./elp210-test-certificates";
import { nativeCurrentRelationsBase,type NativeCurrentRelationsSourceAction,type NativeCurrentRelationsSourceBase } from "../../src/execution-v2/native-current-relations-codec";
import { NativeCurrentRelationsSourceClient,type NativeCurrentRelationsSourceClientConfig } from "../../src/execution-v2/native-current-relations-source-client";

export async function currentRelationsTestEndpoint(handler:(base:Readonly<NativeCurrentRelationsSourceBase>,action:NativeCurrentRelationsSourceAction,res:ServerResponse,
  body:Record<string,unknown>)=>unknown|Promise<unknown>) {
  const caKey=generateKeyPairSync("ec",{namedCurve:"prime256v1"}),name=commonName("TEST_ONLY-current-ca"),ca={key:caKey.privateKey,name};
  const certificate=testCertificate(name,caKey,ca,true);
  const identity=(label:string)=>{const key=generateKeyPairSync("ec",{namedCurve:"prime256v1"}),cert=testCertificate(commonName(label),key,ca,false);
    return{key:Buffer.from(key.privateKey.export({type:"pkcs8",format:"pem"})),cert};};
  const core=identity("TEST_ONLY-core"),edge=identity("TEST_ONLY-edge"),sockets=new Set<Socket>();
  const requests:Array<{action:NativeCurrentRelationsSourceAction;base:Readonly<NativeCurrentRelationsSourceBase>;body:Record<string,unknown>}> = [];
  const server:Server=createServer({key:edge.key,cert:edge.cert,ca:certificate,requestCert:true,rejectUnauthorized:true,
    minVersion:"TLSv1.3",maxVersion:"TLSv1.3"},(req,res)=>{
    req.on("error",()=>{});res.on("error",()=>{});const chunks:Buffer[]=[];req.on("data",b=>chunks.push(Buffer.from(b)));
    req.on("end",()=>{void(async()=>{try{
      const body=JSON.parse(Buffer.concat(chunks).toString("utf8")),{signed_terminal:_terminal,...raw}=body;
      const base=nativeCurrentRelationsBase(raw),action=req.url!.split("/").at(-1) as NativeCurrentRelationsSourceAction;
      requests.push({base,action,body});const value=await handler(base,action,res,body);if(res.destroyed||res.writableEnded)return;
      const bytes=Buffer.from(JSON.stringify(value));res.writeHead(200,{"content-type":"application/json","content-length":String(bytes.length),
        "cache-control":"no-store","connection":"close"});res.end(bytes);
    }catch{res.destroy();}})();});
  });
  server.on("tlsClientError",()=>{});server.on("clientError",(_e,s)=>s.destroy());
  server.on("connection",s=>{sockets.add(s);s.once("close",()=>sockets.delete(s));});
  await new Promise<void>((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",()=>{server.off("error",reject);resolve();});});
  const address=server.address();if(!address||typeof address==="string")throw new Error("TEST_ONLY_CURRENT_LISTEN");
  const config:NativeCurrentRelationsSourceClientConfig={origin:`https://127.0.0.1:${address.port}`,tls:{key:core.key,cert:core.cert,ca:certificate},
    edge_leaf_sha256:`sha256:${createHash("sha256").update(new X509Certificate(edge.cert).raw).digest("hex")}`,
    workload_id:"TEST_ONLY-native-current",deadline_ms:1500,request_bytes:32768,response_bytes:65536,max_inflight:1};
  return{config,requests,client:new NativeCurrentRelationsSourceClient(config),async close(){const done=new Promise<void>(resolve=>server.close(()=>resolve()));
    for(const s of sockets)s.destroy();server.closeAllConnections();await done;core.key.fill(0);edge.key.fill(0);}};
}
