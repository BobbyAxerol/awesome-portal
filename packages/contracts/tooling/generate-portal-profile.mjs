import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const obj=p=>({type:'object',additionalProperties:false,required:Object.keys(p),properties:p});
const str={type:'string',minLength:1};
const counter={type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER};
const ref=n=>({$ref:`#/components/schemas/${n}`});
const mapping=obj({state:{const:'UNMAPPED'},reason:{const:'MAPPING_SOURCE_NOT_QUALIFIED'},source_locator:str});
const profile=obj({schema_version:{const:'portal.profile.v1'},user_id:str,display_name:str,
  account_state:{enum:['INVITED','ACTIVE','DISABLED','ARCHIVED']},
  account_revision:counter,external_identity:obj({state:{enum:['BOUND','UNBOUND']},authority:{const:'PORTAL_VERIFIED_ISSUER_SUBJECT'}}),
  ts_identity:mapping,researcher_identity:mapping,
  access:obj({is_owner:{type:'boolean'},capabilities:{type:'array',items:str,uniqueItems:true},
    scopes:{type:'object',additionalProperties:{type:'array',items:{anyOf:[str,{type:'null'}]}}}}),
  may_update_display_name:{type:'boolean'},owner_recovery:obj({enabled:{const:false},reason:{const:'OWNER_RECOVERY_NOT_APPROVED'}})});
const patch=obj({display_name:{type:'string',minLength:1,maxLength:120,pattern:'^(?=.*\\S)[^\\u0000-\\u001f\\u007f]+$',description:'Nonblank raw input without control characters, at most120 characters; trimmed by the server. Display name only. Identity, roles and grants are immutable here.'},expected_revision:counter});
const result=obj({schema_version:{const:'portal.profile-operation.v1'},outcome:{enum:['APPLIED','REPLAYED']},operation_id:str,resulting_revision:counter,profile:ref('OwnProfile')});
const problem=obj({error:obj({code:str,message:str}),request_id:str});
const response=(schema,description)=>({description,content:{'application/json':{schema}}});
const errors=Object.fromEntries([400,401,403,409,503].map(s=>[s,response(ref('ProfileProblem'),'Typed refusal; no secrets. Current authority is rechecked before replay/write.')]));
const document={openapi:'3.1.0',info:{title:'Portal own-profile identity and lifecycle',version:'1.0.0'},
  paths:{'/api/auth/profile':{
    get:{operationId:'portalOwnProfileGetV1',security:[{PortalSession:[]}],responses:{200:response(ref('OwnProfile'),'Own source-confirmed identity; private,no-store'),...errors}},
    patch:{operationId:'portalOwnProfilePatchV1',security:[{PortalSession:[]}],parameters:[
      {name:'x-portal-idempotency-key',in:'header',required:true,schema:{type:'string',pattern:'^[A-Za-z0-9._:-]{8,128}$'}},
      {name:'x-portal-csrf',in:'header',required:true,schema:str},
      {name:'Origin',in:'header',required:true,schema:str}],
      requestBody:{required:true,content:{'application/json':{schema:ref('OwnProfilePatch')}}},
      responses:{200:response(ref('OwnProfileOperation'),'Atomic own-profile lifecycle receipt; private,no-store'),...errors}},
  }},components:{securitySchemes:{PortalSession:{type:'apiKey',in:'cookie',name:'__Host-portal_session'}},schemas:{OwnProfile:profile,OwnProfilePatch:patch,OwnProfileOperation:result,ProfileProblem:problem}}};
const fixture={schema_version:'portal.profile.v1',user_id:'usr_TEST_ONLY',display_name:'Synthetic researcher',account_state:'ACTIVE',account_revision:1,
  external_identity:{state:'BOUND',authority:'PORTAL_VERIFIED_ISSUER_SUBJECT'},
  ts_identity:{state:'UNMAPPED',reason:'MAPPING_SOURCE_NOT_QUALIFIED',source_locator:'ELP2-00/ELP2-REQ-00-003'},
  researcher_identity:{state:'UNMAPPED',reason:'MAPPING_SOURCE_NOT_QUALIFIED',source_locator:'ELP2-00/ELP2-REQ-00-003'},
  access:{is_owner:false,capabilities:[],scopes:{}},may_update_display_name:true,
  owner_recovery:{enabled:false,reason:'OWNER_RECOVERY_NOT_APPROVED'}};
for(const [file,value] of Object.entries({'openapi/portal-profile.openapi.json':document,'fixtures/portal-profile.synthetic.valid.json':fixture})){
  const bytes=JSON.stringify(value,null,2)+'\n',target=resolve(root,file);
  if(process.argv.includes('--check')){if(readFileSync(target,'utf8')!==bytes)throw new Error(`Generated drift: ${file}`);}
  else writeFileSync(target,bytes);
}
