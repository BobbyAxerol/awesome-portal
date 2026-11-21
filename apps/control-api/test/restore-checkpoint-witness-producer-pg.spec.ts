/** TEST_ONLY three isolated PG clusters and ephemeral keys, never runtime authority. */
import {createHash,generateKeyPairSync,randomUUID,sign} from "node:crypto";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {Pool} from "pg";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {restoreCheckpointEventHash,type RestoreCheckpointPin} from "../src/execution-v2/restore-checkpoint-authority";
import {RestoreCheckpointAuthorityReader} from "../src/execution-v2/restore-checkpoint-authority-reader";
import {RestoreCheckpointSignedAnchor} from "../src/execution-v2/restore-checkpoint-signed-anchor";
import {RestoreCheckpointFreshWitness} from "../src/execution-v2/restore-checkpoint-fresh-witness";
import {RestoreCheckpointIndependentFloor} from "../src/execution-v2/restore-checkpoint-independent-floor";
import {RestoreCheckpointWitnessProducerCandidate} from "../src/execution-v2/restore-checkpoint-witness-producer-candidate";

const urls=[process.env.TEST_DATABASE_URL,process.env.TEST_AUTHORITY_DATABASE_URL,process.env.TEST_WITNESS_DATABASE_URL];
const enabled=process.env.PORTAL_TEST_RESTORE_CHECKPOINT==="TEST_ONLY_DISPOSABLE_TWO_CLUSTERS"&&urls.every(Boolean);
describe.skipIf(!enabled).sequential("TEST_ONLY durable witness producer",()=>{
  let source:Pool,authority:Pool,witnessDb:Pool,pin:RestoreCheckpointPin,witnessId:string;
  let signed:RestoreCheckpointSignedAnchor,producer:RestoreCheckpointWitnessProducerCandidate,consumer:RestoreCheckpointFreshWitness;
  const anchorKeys=generateKeyPairSync("ed25519"),witnessKeys=generateKeyPairSync("ed25519"),floorKeys=generateKeyPairSync("ed25519");
  const keyHash=(key:typeof anchorKeys.publicKey)=>createHash("sha256").update(key.export({format:"der",type:"spki"})).digest("hex");
  const sha=(s:string)=>createHash("sha256").update(s).digest("hex");
  const checkpoint=randomUUID(),drain=`restore_v2:${randomUUID()}`;
  let head={generation:"0",event_hash:"0".repeat(64),operation_id:randomUUID()};
  let initialHead:typeof head;
  let independentHead:typeof head;
  const trust={issuer:"TEST_ONLY:anchor",audience:"TEST_ONLY:recovery"};
  const witnessTrust={issuer:"TEST_ONLY:witness",audience:"TEST_ONLY:recovery"};
  const floorTrust={issuer:"TEST_ONLY:independent-floor",audience:"TEST_ONLY:recovery"};
  let floorReader:RestoreCheckpointIndependentFloor;
  function floorProof(challenge:RestoreCheckpointPin & {nonce:string},selected=independentHead,key=floorKeys.privateKey) {
    const now=Date.now(),body=Buffer.from(JSON.stringify({schema:"portal.restore-checkpoint-independent-floor.candidate.v1",
      ...floorTrust,...challenge,...selected,issued_at_ms:now-50,expires_at_ms:now+5000}));
    return Buffer.from(JSON.stringify({payload:body.toString("base64url"),signature:sign(null,body,key).toString("base64url")}));
  }
  function anchorProof(selected=head) {
    const now=Date.now(),body=Buffer.from(JSON.stringify({schema:"portal.restore-checkpoint-anchor.candidate.v1",
      ...trust,...pin,...selected,issued_at_ms:now-50,expires_at_ms:now+60000}));
    return Buffer.from(JSON.stringify({payload:body.toString("base64url"),signature:sign(null,body,anchorKeys.privateKey).toString("base64url")}));
  }
  async function advance() {
    const previous=head,operation_id=randomUUID(),generation=String(Number(previous.generation)+1),revision=generation;
    const observation=JSON.stringify(["portal.restore-frozen-closed-db-observation.v1",checkpoint,pin.source_system_identifier,
      drain,revision,randomUUID(),"1","123","2",{target_oid:"55",operator_role:"test_operator",observer_pid:12,
        observer_start:"2026-11-06T00:00:00Z",application_name:`portal.restore.observer.${"a".repeat(32)}`},"b".repeat(64)]);
    const input={operation_id,expected_generation:previous.generation,source_revision:revision,inventory_digest:sha(observation)};
    const event_hash=restoreCheckpointEventHash(checkpoint,input,generation,previous.event_hash,"FROZEN_CLOSED_DB_OBSERVATION");
    await authority.query(`INSERT INTO portal_restore_authority.events(checkpoint_id,operation_id,expected_generation,generation,
      source_revision,inventory_digest,capture_kind,predecessor_hash,event_hash) VALUES($1,$2,$3,$4,$5,$6,'FROZEN_CLOSED_DB_OBSERVATION',$7,$8)`,
      [checkpoint,operation_id,previous.generation,generation,revision,input.inventory_digest,previous.event_hash,event_hash]);
    await authority.query("INSERT INTO portal_restore_authority.closed_observations VALUES($1,$2,$3)",[checkpoint,operation_id,observation]);
    await authority.query(`UPDATE portal_restore_authority.checkpoints SET generation=$2,source_revision=$2,event_hash=$3,event_count=$2
      WHERE checkpoint_id=$1`,[checkpoint,generation,event_hash]);
    head={generation,event_hash,operation_id};
  }
  beforeAll(async()=>{
    const expectedHosts=["elp2-ckpt-source-","elp2-ckpt-authority-","elp2-ckpt-witness-"];
    for(let i=0;i<urls.length;i++) {
      const url=new URL(urls[i]!);
      if(!new RegExp(`^${expectedHosts[i]}[a-f0-9]{8}$`).test(url.hostname)||
        !/^\/portal_restore_checkpoint_[a-f0-9]{8}$/.test(url.pathname)||url.search||url.username!=="portal")
        throw Error("TEST_ONLY_THREE_DISPOSABLE_CLUSTERS_REQUIRED");
    }
    [source,authority,witnessDb]=urls.map(connectionString=>new Pool({connectionString,max:2,connectionTimeoutMillis:2000,query_timeout:6000}));
    const identities=await Promise.all([source,authority,witnessDb].map(p=>p.query("SELECT system_identifier::text AS id FROM pg_control_system()")));
    const ids=identities.map(result=>result.rows[0].id as string);
    if(new Set(ids).size!==3)throw Error("TEST_ONLY_THREE_DISPOSABLE_CLUSTERS_REQUIRED");
    pin={checkpoint_id:checkpoint,source_system_identifier:ids[0],authority_system_identifier:ids[1]};witnessId=ids[2];
    for(const file of ["restore-checkpoint-authority.sql","restore-checkpoint-read-lock-candidate.sql"])
      await authority.query(await readFile(join(__dirname,"../src/execution-v2",file),"utf8"));
    await witnessDb.query(await readFile(join(__dirname,"../src/execution-v2/restore-checkpoint-witness-store-candidate.sql"),"utf8"));
    await authority.query(`INSERT INTO portal_restore_authority.checkpoints(checkpoint_id,source_system_identifier,authority_system_identifier,
      generation,source_revision,event_hash,event_count) VALUES($1,$2,$3,0,0,repeat('0',64),0)`,[checkpoint,ids[0],ids[1]]);
    await advance();
    initialHead={...head};
    const reader=new RestoreCheckpointAuthorityReader(authority,pin,8);
    signed=new RestoreCheckpointSignedAnchor(reader,{...trust,pin,public_key_pem:anchorKeys.publicKey.export({format:"pem",type:"spki"}).toString(),
      public_key_sha256:keyHash(anchorKeys.publicKey)});
    producer=new RestoreCheckpointWitnessProducerCandidate(witnessDb,signed,{pin,anchor_key_sha256:keyHash(anchorKeys.publicKey),
      witness_system_identifier:witnessId,...witnessTrust,public_key_sha256:keyHash(witnessKeys.publicKey),ttl_ms:5000},witnessKeys.privateKey);
    consumer=new RestoreCheckpointFreshWitness(signed,{pin,anchor_key_sha256:keyHash(anchorKeys.publicKey),...witnessTrust,
      public_key_pem:witnessKeys.publicKey.export({format:"pem",type:"spki"}).toString(),
      public_key_sha256:keyHash(witnessKeys.publicKey),timeout_ms:2000});
    independentHead={...head};
    floorReader=new RestoreCheckpointIndependentFloor(consumer,{pin,anchor_key_sha256:keyHash(anchorKeys.publicKey),
      witness_key_sha256:keyHash(witnessKeys.publicKey),...floorTrust,
      public_key_pem:floorKeys.publicKey.export({format:"pem",type:"spki"}).toString(),
      public_key_sha256:keyHash(floorKeys.publicKey),timeout_ms:5000});
    expect(()=>new RestoreCheckpointIndependentFloor(consumer,{pin,anchor_key_sha256:keyHash(anchorKeys.publicKey),
      witness_key_sha256:keyHash(witnessKeys.publicKey),...floorTrust,
      public_key_pem:witnessKeys.publicKey.export({format:"pem",type:"spki"}).toString(),
      public_key_sha256:keyHash(witnessKeys.publicKey),timeout_ms:5000})).toThrow("V2_CHECKPOINT_INDEPENDENT_FLOOR_INVALID");
  });
  afterAll(async()=>{await Promise.all([source?.end(),authority?.end(),witnessDb?.end()]);});
  it("persists and signs the exact verified closed head, rejects unregistered challenges and retries",async()=>{
    const request={...pin,nonce:"c".repeat(64)};
    const baseTrust={pin,anchor_key_sha256:keyHash(anchorKeys.publicKey),witness_system_identifier:witnessId,
      ...witnessTrust,public_key_sha256:keyHash(witnessKeys.publicKey),ttl_ms:5000};
    expect(()=>new RestoreCheckpointWitnessProducerCandidate(witnessDb,signed,
      {...baseTrust,witness_system_identifier:pin.source_system_identifier},witnessKeys.privateKey))
      .toThrow("V2_CHECKPOINT_WITNESS_PRODUCER_INVALID");
    expect(()=>new RestoreCheckpointWitnessProducerCandidate(witnessDb,signed,baseTrust,anchorKeys.privateKey))
      .toThrow("V2_CHECKPOINT_WITNESS_PRODUCER_INVALID");
    await expect(producer.respond(request)).rejects.toThrow("V2_CHECKPOINT_WITNESS_PRODUCER_INVALID");
    await expect(producer.admit(anchorProof())).resolves.toEqual({state:"STORED_NOT_CUTOVER",generation:"1"});
    await expect(producer.admit(anchorProof())).resolves.toEqual({state:"STORED_NOT_CUTOVER",generation:"1"});
    await expect(producer.respond({...request,nonce:"bad"})).rejects.toThrow("V2_CHECKPOINT_WITNESS_PRODUCER_INVALID");
    await expect(producer.respond({...request,checkpoint_id:randomUUID()})).rejects.toThrow("V2_CHECKPOINT_WITNESS_PRODUCER_INVALID");
    await expect(consumer.readFreshClosed(anchorProof(),c=>producer.respond(c)))
      .resolves.toMatchObject({witness:"FRESH_SIGNED_NOT_CUTOVER",generation:"1"});
    await expect(floorReader.readClosed(anchorProof(),c=>producer.respond(c),async c=>floorProof(c)))
      .resolves.toMatchObject({independent_floor:"ATTESTED_NOT_CUTOVER",generation:"1",floor:{generation:"1"}});
    await expect(floorReader.readClosed(anchorProof(),c=>producer.respond(c),async c=>floorProof(c,independentHead,anchorKeys.privateKey)))
      .rejects.toThrow("V2_CHECKPOINT_INDEPENDENT_FLOOR_INVALID");
    await expect(floorReader.readClosed(anchorProof(),c=>producer.respond(c),async c=>floorProof({...c,nonce:"e".repeat(64)})))
      .rejects.toThrow("V2_CHECKPOINT_INDEPENDENT_FLOOR_INVALID");
    let replay:Buffer|undefined;
    await expect(floorReader.readClosed(anchorProof(),c=>producer.respond(c),async c=>{
      if(!replay)replay=floorProof(c);return replay;
    })).rejects.toThrow("V2_CHECKPOINT_INDEPENDENT_FLOOR_INVALID");
    let calls=0;
    await expect(floorReader.readClosed(anchorProof(),c=>producer.respond(c),async c=>floorProof(c,++calls===1?independentHead:{...independentHead,event_hash:"a".repeat(64)})))
      .rejects.toThrow("V2_CHECKPOINT_INDEPENDENT_FLOOR_INVALID");
    const restart=new RestoreCheckpointWitnessProducerCandidate(witnessDb,signed,{pin,anchor_key_sha256:keyHash(anchorKeys.publicKey),
      witness_system_identifier:witnessId,...witnessTrust,public_key_sha256:keyHash(witnessKeys.publicKey),ttl_ms:5000},witnessKeys.privateKey);
    await expect(consumer.readFreshClosed(anchorProof(),c=>restart.respond(c))).resolves.toMatchObject({generation:"1"});
  });
  it("keeps timed-out witness and floor callbacks bounded until they actually settle",async()=>{
    const slowWitness=new RestoreCheckpointFreshWitness(signed,{pin,anchor_key_sha256:keyHash(anchorKeys.publicKey),...witnessTrust,
      public_key_pem:witnessKeys.publicKey.export({format:"pem",type:"spki"}).toString(),
      public_key_sha256:keyHash(witnessKeys.publicKey),timeout_ms:1000});
    const slowFloor=new RestoreCheckpointIndependentFloor(slowWitness,{pin,anchor_key_sha256:keyHash(anchorKeys.publicKey),
      witness_key_sha256:keyHash(witnessKeys.publicKey),...floorTrust,
      public_key_pem:floorKeys.publicKey.export({format:"pem",type:"spki"}).toString(),
      public_key_sha256:keyHash(floorKeys.publicKey),timeout_ms:1000});
    let finishFloor!:()=>void;
    let floorStarted!:()=>void;
    const floorReady=new Promise<void>(resolve=>{floorStarted=resolve;});
    const floorAttempt=slowFloor.readClosed(anchorProof(),c=>producer.respond(c),c=>new Promise(resolve=>{
      // Deliberately ignore AbortSignal to model a stuck transport.
      finishFloor=()=>resolve(floorProof(c));
      floorStarted();
    }));
    await floorReady;
    await expect(slowFloor.readClosed(anchorProof(),c=>producer.respond(c),async c=>floorProof(c)))
      .rejects.toThrow("V2_CHECKPOINT_INDEPENDENT_FLOOR_BUSY");
    await expect(floorAttempt).rejects.toThrow("V2_CHECKPOINT_INDEPENDENT_FLOOR_TIMEOUT");
    await expect(slowFloor.readClosed(anchorProof(),c=>producer.respond(c),async c=>floorProof(c)))
      .rejects.toThrow("V2_CHECKPOINT_INDEPENDENT_FLOOR_BUSY");
    finishFloor();await new Promise<void>(resolve=>setImmediate(resolve));
    await expect(slowFloor.readClosed(anchorProof(),c=>producer.respond(c),async c=>floorProof(c)))
      .resolves.toMatchObject({independent_floor:"ATTESTED_NOT_CUTOVER"});
    let finishWitness!:()=>Promise<void>;
    let witnessStarted!:()=>void;
    const witnessReady=new Promise<void>(resolve=>{witnessStarted=resolve;});
    const witnessAttempt=slowWitness.readFreshClosed(anchorProof(),c=>new Promise(resolve=>{
      finishWitness=async()=>{resolve(await producer.respond(c));};
      witnessStarted();
    }));
    await witnessReady;
    await expect(slowWitness.readFreshClosed(anchorProof(),c=>producer.respond(c)))
      .rejects.toThrow("V2_CHECKPOINT_WITNESS_BUSY");
    await expect(witnessAttempt).rejects.toThrow("V2_CHECKPOINT_WITNESS_TIMEOUT");
    await expect(slowWitness.readFreshClosed(anchorProof(),c=>producer.respond(c)))
      .rejects.toThrow("V2_CHECKPOINT_WITNESS_BUSY");
    await finishWitness();await new Promise<void>(resolve=>setImmediate(resolve));
    await expect(slowWitness.readFreshClosed(anchorProof(),c=>producer.respond(c)))
      .resolves.toMatchObject({witness:"FRESH_SIGNED_NOT_CUTOVER"});
  },30000);
  it("rejects a rolled-back authority head after recording a newer independent head",async()=>{
    const oldHead={...head},oldProof=anchorProof(oldHead);
    await advance();
    // Simulate loss of the reply only after the actual witness-store COMMIT.
    // The same signed original must be safe to retry without a new event.
    let commits=0;
    const lossyPool=new Proxy(witnessDb,{get(target,property){
      if(property==="connect")return async()=>{
        const client=await target.connect();
        return new Proxy(client,{get(connection,key){
          if(key==="query")return async(...args:unknown[])=>{
            const result=await Reflect.apply(connection.query,connection,args);
            if(args[0]==="COMMIT"&&++commits===2)throw Error("TEST_ONLY_LOST_COMMIT_RESPONSE");
            return result;
          };
          const value=Reflect.get(connection,key,connection);
          return typeof value==="function"?value.bind(connection):value;
        }});
      };
      const value=Reflect.get(target,property,target);
      return typeof value==="function"?value.bind(target):value;
    }});
    const lossy=new RestoreCheckpointWitnessProducerCandidate(lossyPool,signed,{pin,anchor_key_sha256:keyHash(anchorKeys.publicKey),
      witness_system_identifier:witnessId,...witnessTrust,public_key_sha256:keyHash(witnessKeys.publicKey),ttl_ms:5000},witnessKeys.privateKey);
    const nextProof=anchorProof();
    await expect(lossy.admit(nextProof)).rejects.toThrow("TEST_ONLY_LOST_COMMIT_RESPONSE");
    await expect(producer.admit(nextProof)).resolves.toEqual({state:"STORED_NOT_CUTOVER",generation:"2"});
    // The exact retained ancestor may precede the observed head; equality of
    // generations is not required when the verified chain includes it.
    await expect(floorReader.readClosed(nextProof,c=>producer.respond(c),async c=>floorProof(c)))
      .resolves.toMatchObject({generation:"2",floor:{generation:"1"}});
    independentHead={...head};
    await expect(floorReader.readClosed(nextProof,c=>producer.respond(c),async c=>floorProof(c)))
      .resolves.toMatchObject({independent_floor:"ATTESTED_NOT_CUTOVER",generation:"2",floor:{generation:"2"}});
    // Only this disposable authority cluster is deliberately rolled back.
    // A rollback of BOTH authority and witness remains unprotected.
    await authority.query("ALTER TABLE portal_restore_authority.closed_observations DISABLE TRIGGER USER");
    await authority.query("ALTER TABLE portal_restore_authority.events DISABLE TRIGGER USER");
    await authority.query("DELETE FROM portal_restore_authority.closed_observations WHERE checkpoint_id=$1 AND operation_id=$2",[checkpoint,head.operation_id]);
    await authority.query("DELETE FROM portal_restore_authority.events WHERE checkpoint_id=$1 AND operation_id=$2",[checkpoint,head.operation_id]);
    await authority.query(`UPDATE portal_restore_authority.checkpoints SET generation=1,source_revision=1,event_count=1,event_hash=$2 WHERE checkpoint_id=$1`,[checkpoint,oldHead.event_hash]);
    await authority.query("ALTER TABLE portal_restore_authority.events ENABLE TRIGGER USER");
    await authority.query("ALTER TABLE portal_restore_authority.closed_observations ENABLE TRIGGER USER");
    // The reader fails closed when its required stored ancestor is absent.
    await expect(producer.admit(oldProof)).rejects.toThrow("V2_CHECKPOINT_READ_INVALID");
    await expect(consumer.readFreshClosed(oldProof,c=>producer.respond(c))).rejects.toThrow("V2_CHECKPOINT_WITNESS_INVALID");
    expect((await witnessDb.query("SELECT generation::text FROM portal_restore_witness_candidate.heads WHERE checkpoint_id=$1",[checkpoint])).rows[0].generation).toBe("2");
    head=oldHead;
  });
  it("rejects a higher generation on a fork without the stored exact ancestor",async()=>{
    // The disposable authority was rolled back to generation 1 in the prior
    // test. Two new events form a valid but different branch through 2 to 3.
    await advance();await advance();
    expect(head.generation).toBe("3");
    await expect(producer.admit(anchorProof())).rejects.toThrow("V2_CHECKPOINT_READ_INVALID");
    expect((await witnessDb.query("SELECT generation::text FROM portal_restore_witness_candidate.heads WHERE checkpoint_id=$1",[checkpoint])).rows[0].generation).toBe("2");
  });
  it("demonstrates that rollback of both disposable stores defeats this candidate",async()=>{
    // Deliberately exercise the unresolved trust boundary: a privileged actor
    // restores BOTH stores to their old matching state. This test demonstrates
    // why a separate PG plus a second signature is NOT a restore authority.
    await authority.query("ALTER TABLE portal_restore_authority.closed_observations DISABLE TRIGGER USER");
    await authority.query("ALTER TABLE portal_restore_authority.events DISABLE TRIGGER USER");
    await authority.query(`DELETE FROM portal_restore_authority.closed_observations WHERE checkpoint_id=$1 AND operation_id IN
      (SELECT operation_id FROM portal_restore_authority.events WHERE checkpoint_id=$1 AND generation>1)`,[checkpoint]);
    await authority.query("DELETE FROM portal_restore_authority.events WHERE checkpoint_id=$1 AND generation>1",[checkpoint]);
    await authority.query("UPDATE portal_restore_authority.checkpoints SET generation=1,source_revision=1,event_count=1,event_hash=$2 WHERE checkpoint_id=$1",[checkpoint,initialHead.event_hash]);
    await authority.query("ALTER TABLE portal_restore_authority.events ENABLE TRIGGER USER");
    await authority.query("ALTER TABLE portal_restore_authority.closed_observations ENABLE TRIGGER USER");
    await witnessDb.query("UPDATE portal_restore_witness_candidate.heads SET generation=1,event_hash=$2,operation_id=$3 WHERE checkpoint_id=$1",
      [checkpoint,initialHead.event_hash,initialHead.operation_id]);
    await expect(consumer.readFreshClosed(anchorProof(initialHead),c=>producer.respond(c)))
      .resolves.toMatchObject({witness:"FRESH_SIGNED_NOT_CUTOVER",generation:"1"});
    // Unlike the witness-only reader, the new path must reject coordinated
    // rollback when the independently retained exact floor is still generation 2.
    await expect(floorReader.readClosed(anchorProof(initialHead),c=>producer.respond(c),async c=>floorProof(c)))
      .rejects.toThrow("V2_CHECKPOINT_READ_INVALID");
  });
});
