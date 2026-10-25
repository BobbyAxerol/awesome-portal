/** SYNTHETIC codec vector only; never registered native authority. */
import {randomUUID} from "node:crypto";
import {accessDigest} from "../../src/execution-v2/access-digest";
import {nativeCurrentRelationsBase,type NativeCurrentRelationsSourceBase,type NativeCurrentRelationsSourceAction} from "../../src/execution-v2/native-current-relations-codec";
import {rootWireFacts} from "./elp210-native-root-wire";
export function currentRelationsWireBase(overrides:Partial<NativeCurrentRelationsSourceBase>={}):Readonly<NativeCurrentRelationsSourceBase>{
 const {fact}=rootWireFacts(),binding=overrides.binding??{lease_id:randomUUID(),attempt_id:randomUUID(),human_issuer:"TEST_ONLY-core",
 subject:"TEST_ONLY-native-human-not-portal-principal",workspace_id:fact.workspace_id,environment:"paper" as const,
 workload_id:"TEST_ONLY-native-current",operation:"READ" as const,request_digest:"0".repeat(64)};
 const body={schema_version:"pma.registered-current-relations.request.v1" as const,
 registration:{correspondence_id:"TEST_ONLY-correspondence",expected_version:"9007199254741001",manifest_sha256:"a".repeat(64)},
 original:{grant_id:fact.grant_id,accepted_fact_digest:accessDigest(fact)},purpose:{kind:"CURRENT_POLICY" as const,
 actor_id:"TEST_ONLY-human",principal_id:fact.portal_user_id,workspace_id:fact.workspace_id,environment:"paper" as const,
 action:"access.read" as const,resource_digest:accessDigest({kind:"CURRENT_POLICY_CONTEXT"}),flight_id:randomUUID()},
 deadline:new Date(Date.now()+30000).toISOString(),...overrides};
 const {request_digest:_digest,...meaning}=binding;
 return nativeCurrentRelationsBase({...body,binding:{...binding,request_digest:accessDigest({binding:meaning,
 registration:body.registration,original:body.original,purpose:body.purpose,deadline:body.deadline}).slice(7)}});
}
export function currentRelationsWireReply(base:Readonly<NativeCurrentRelationsSourceBase>,action:NativeCurrentRelationsSourceAction,
 relations=rootWireFacts().relations){
 const common={schema_version:"pma.registered-current-relations.result.v1",binding:base.binding};
 if(action==="issue")return{...common,state:"ISSUED",relations,correspondence:{registry_revision:accessDigest("TEST_ONLY-registry"),
 manifest_sha256:base.registration.manifest_sha256,payload_sha256:"b".repeat(64),approval_ref:"TEST_ONLY-independent-review"},
 lease:{source_digest:"c".repeat(64),source_fingerprint:"d".repeat(64),expires_at:base.deadline}};
 if(action==="enter")return{...common,state:"ENTERED"};
 if(action==="unknown")return{...common,state:"UNKNOWN"};
 if(action==="status")return{...common,state:"OBSERVATION",recovery:{state:"RECORDED",phase:"ENTERED",source_digest:"c".repeat(64),
 expires_at:base.deadline,terminal_authority:false,release_permitted:false}};
 if(action==="cancel-unentered")return{...common,state:"CANCELLED",recovery:{state:"CANCELLED",cancellation_authority:true,release_permitted:true}};
 return{...common,state:"SETTLED",recovery:{state:"SETTLED",phase:"SERVED",terminal_authority:true,release_permitted:true}};
}
