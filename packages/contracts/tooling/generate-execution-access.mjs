import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const obj=p=>({type:'object',additionalProperties:false,required:Object.keys(p),properties:p});
const text={type:'string',minLength:1,maxLength:256,pattern:'^[^\\u0000-\\u001f\\u007f]+$'};
const rev={type:'string',minLength:1,maxLength:256};
const ms={type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER};
const scopedText={...text,pattern:'^[^\\u0000-\\u001f\\u007f]+$(?![\\s\\S])',
  description:'Current self-projection text only. Runtime additionally rejects malformed UTF-16 and UTF8 byte length above256; standard JSON Schema maxLength counts Unicode codepoints, not bytes. No normalization.'};
const nullable=s=>({anyOf:[s,{type:'null'}]});
const list=(items,maxItems=200,minItems=0)=>({type:'array',items,minItems,maxItems,uniqueItems:true});
const digest={type:'string',pattern:'^sha256:[0-9a-f]{64}$'};
const ref=n=>({$ref:`#/components/schemas/${n}`});
const actions=['administration.users.manage','administration.profile_access.manage',
  'governance.r1.read','governance.r1.decide','governance.r2.read','governance.r2.decide',
  'governance.canary.read','governance.canary.decide','governance.live.read','governance.live.decide',
  'profile.read_self','profile.update_self','users.read','users.create','users.manage_status','sessions.revoke',
  'access.read','access.preview','access.propose','access.grant','access.revoke','alpha.read','alpha.metadata.edit',
  'alpha.owner.propose','business.read_all','portfolio.discover_linked','portfolio.read_restricted','portfolio.read',
  'portfolio.manage','membership.propose','account.read','binding.read','binding.change.propose','capital.preview',
  'capital.fund','capital.return_capital','capital.initial_grant','capital.top_up','capital.immediate_decrease',
  'capital.recall_partial','capital.recall_full','capital.adjust_target_budget','capital.set_root_limit',
  'capital.apply_pending','capital.cancel_remaining','deployment.register',
  'deployment.activate','deployment.assignment.propose','safety.halt','safety.reducing','safety.resume','audit.read',
  'report.export','stream.subscribe','maintenance.read','maintenance.execute','development.read','development.execute','owner.recovery'];
const environment={enum:['paper','sandbox','live']},environments=list(environment,3,1);
const resourceKind={enum:['ROOT','PORTFOLIO','ALPHA','ALPHA_VERSION','DEPLOYMENT','ACCOUNT','BINDING','USER']};
const selector={oneOf:[obj({kind:{const:'EXPLICIT_RESOURCE_SET'},resource_kind:resourceKind,ids:list(text,200,1)}),
  obj({kind:{const:'OWN_ALPHA'}}),obj({kind:{const:'PORTFOLIO_MEMBERSHIP'},portfolio_ids:list(text,200,1)}),
  obj({kind:{const:'ROOT_SCOPE'},root_id:text})],discriminator:{propertyName:'kind'}};
const reason={type:'string',minLength:1,maxLength:512,pattern:'^[^\\u0000-\\u001f\\u007f]+$'};
const change={...obj({subject_user_id:text,action:ref('AccessAction'),effect:{enum:['ALLOW','DENY']},selector:ref('AccessSelector'),
  environments,valid_from_ms:ms,valid_until_ms:nullable(ms),delegable_actions:list(ref('AccessAction'),actions.length),
  ceiling_grant_id:text,expected_ceiling_revision:rev,expected_policy_revision:rev,expected_ts_membership_revision:nullable(rev),reason}),
  description:'End-exclusive interval: valid_until_ms must be greater than valid_from_ms or null. Exact single current parent ceiling; no browser actor/issuer/TS-acceptance fields.',
  allOf:[{if:{properties:{action:{not:{const:'access.grant'}}},required:['action']},then:{properties:{delegable_actions:{maxItems:0}}}}]};
const receipt=obj({schema_version:{const:'portal.access-operation.v1'},operation_id:text,proposal_id:nullable(text),grant_id:nullable(text),
  outcome:{enum:['APP_APPLIED','TS_PENDING','REVOKED','DENIED','TS_APPLIED','TS_REJECTED','TS_UNKNOWN']},
  http_status:{type:'integer',minimum:200,maximum:599},reason_code:nullable(text),policy_revision:nullable(rev),grant_revision:nullable(rev),
  decided_at_ms:ms,ts_authority:{enum:['NOT_REQUIRED','PENDING','ACCEPTED','REJECTED','UNKNOWN']}});
const grant=obj({grant_id:text,action:ref('AccessAction'),effect:{enum:['ALLOW','DENY']},selector:ref('AccessSelector'),environments,
  valid_from_ms:ms,valid_until_ms:nullable(ms),revision:rev,current:{type:'boolean'},ts_authority:{enum:['NOT_REQUIRED','PENDING','ACCEPTED','REJECTED','UNKNOWN']}});
const effective=obj({schema_version:{const:'portal.access-effective.v1'},workspace_id:text,user_id:text,policy_revision:nullable(rev),
  availability:{enum:['AVAILABLE','POLICY_PENDING']},reason_code:nullable(text),grants:{type:'array',maxItems:10000,items:grant},
  researcher_field_policy:obj({state:{enum:['PENDING','QUALIFIED']},policy_ref:nullable(text)}),
  owner_recovery:obj({enabled:{const:false},reason_code:{const:'OWNER_RECOVERY_NOT_APPROVED'}})});
const preview=obj({schema_version:{const:'portal.access-preview.v1'},allowed:{type:'boolean'},reason_code:nullable(text),
  preview_digest:digest,policy_revision:nullable(rev),app_outcome:{enum:['DENIED','ELIGIBLE']},ts_authority:{enum:['NOT_REQUIRED','PENDING']},
  effective_business_right:{const:false},change:ref('AccessChange'),effect_preview:obj({
    before:obj({coverage:{const:'EXACT_SELECTOR_GRANTS_ONLY'},grants:{type:'array',maxItems:10000,items:obj({grant_id:text,revision:rev,effect:{enum:['ALLOW','DENY']}})}}),
    after:obj({application:{enum:['DENIED','ELIGIBLE_ON_COMMIT']},business:{enum:['PENDING','NOT_REQUIRED']},rights_effective_now:{const:false}})})});
const eligibilityActions=['alpha.read','portfolio.read','portfolio.read_restricted','portfolio.discover_linked','account.read','binding.read','audit.read',
  'governance.r1.read','governance.r2.read','governance.canary.read','governance.live.read',
  'governance.r1.decide','governance.r2.decide','governance.canary.decide','governance.live.decide',
  'maintenance.read','development.read','capital.fund','capital.initial_grant','capital.top_up','capital.immediate_decrease',
  'capital.recall_partial','capital.recall_full','capital.adjust_target_budget','capital.set_root_limit',
  'capital.apply_pending','capital.cancel_remaining','deployment.register'];
const eligibilityReasons=['FAMILY_CHECK_REQUIRED','NO_CURRENT_PERMISSION','POLICY_PENDING','FIELD_POLICY_PENDING','ACTION_TARGET_UNSUPPORTED'];
const eligibilityFamilies=['BUSINESS_READ_SCOPE','CURRENT_AUDIT_READ','GOVERNANCE_READER','GOVERNANCE_PLAN','TECHNICAL_READ_SCOPE',
  'CAPITAL_PREVIEW','PENDING_CONTROL_PREVIEW','INSTANCE_REGISTRATION_PREVIEW'];
// Exact existing RULES[action] producer facts; these are family prerequisites,
// never a claim that the family/source/step-up has already been commissioned.
const eligibilityRules={
  'alpha.read':['BUSINESS_READ_SCOPE',false],'portfolio.read':['BUSINESS_READ_SCOPE',false],
  'portfolio.read_restricted':['BUSINESS_READ_SCOPE',false],'portfolio.discover_linked':['BUSINESS_READ_SCOPE',false],
  'account.read':['BUSINESS_READ_SCOPE',false],'binding.read':['BUSINESS_READ_SCOPE',false],
  'audit.read':['CURRENT_AUDIT_READ',false],
  'governance.r1.read':['GOVERNANCE_READER',false],'governance.r2.read':['GOVERNANCE_READER',false],
  'governance.canary.read':['GOVERNANCE_READER',false],'governance.live.read':['GOVERNANCE_READER',false],
  'governance.r1.decide':['GOVERNANCE_PLAN',null],'governance.r2.decide':['GOVERNANCE_PLAN',null],
  'governance.canary.decide':['GOVERNANCE_PLAN',null],'governance.live.decide':['GOVERNANCE_PLAN',null],
  'maintenance.read':['TECHNICAL_READ_SCOPE',false],'development.read':['TECHNICAL_READ_SCOPE',false],
  'capital.fund':['CAPITAL_PREVIEW',true],'capital.initial_grant':['CAPITAL_PREVIEW',true],
  'capital.top_up':['CAPITAL_PREVIEW',true],'capital.immediate_decrease':['CAPITAL_PREVIEW',true],
  'capital.recall_partial':['CAPITAL_PREVIEW',true],'capital.recall_full':['CAPITAL_PREVIEW',true],
  'capital.adjust_target_budget':['CAPITAL_PREVIEW',true],'capital.set_root_limit':['CAPITAL_PREVIEW',true],
  'capital.apply_pending':['PENDING_CONTROL_PREVIEW',true],'capital.cancel_remaining':['PENDING_CONTROL_PREVIEW',true],
  'deployment.register':['INSTANCE_REGISTRATION_PREVIEW',true],
};
const featureIds=['EXECUTION_PORTFOLIOS','EXECUTION_ACCOUNTS_BINDINGS','EXECUTION_OPERATIONS','EXECUTION_BLOTTER'];
const eligibilityTokens=eligibilityActions.map(action=>action.replaceAll('.','\\.'));
const eligibilityCsv={type:'string',minLength:1,maxLength:1024,
  pattern:'^(?:'+eligibilityTokens.join('|')+')(?:,(?:'+eligibilityTokens.join('|')+')){0,15}$(?![\\s\\S])',
  allOf:eligibilityTokens.map(action=>({not:{pattern:'(?:^|,)'+action+'(?:,[^,]+)*,'+action+'(?:,|$)'}})),
  description:'One exact CSV string,1–16 unique finite actions. No whitespace normalization, repeated query keys, JSON, wildcards or actor/as-of selectors.'};
const eligibilityRow={...obj({action:ref('AccessEligibilityAction'),permission:{enum:['ALLOWED','UNAVAILABLE']},
  reason_class:{enum:eligibilityReasons},public_copy_key:{enum:eligibilityReasons},
  grant_ref:{...nullable(text),description:'Opaque existing own matched grant ID: canonical accessText, at most 256 Unicode codepoints, not the new caller-selector UTF8 byte limit. Returned unchanged without normalization.'},
  authority_mode:{enum:['VERSIONED_CURRENT','LEGACY_COMPATIBILITY','APP_ONLY','NOT_ESTABLISHED']},
  step_up_required:nullable({type:'boolean'}),step_up_freshness:{const:'NOT_CHECKED'},
  challenge_availability:{const:'NOT_CHECKED'},command_readiness:{const:'NOT_CHECKED'},family_check:{enum:eligibilityFamilies}}),
  allOf:[
    ...eligibilityActions.map(action=>({if:{properties:{action:{const:action}},required:['action']},
      then:{properties:{family_check:{const:eligibilityRules[action][0]},step_up_required:{const:eligibilityRules[action][1]}}}})),
    ...eligibilityReasons.map(code=>({if:{properties:{reason_class:{const:code}},required:['reason_class']},
      then:{properties:{public_copy_key:{const:code}}}})),
    {if:{properties:{permission:{const:'ALLOWED'}},required:['permission']},
      then:{properties:{reason_class:{const:'FAMILY_CHECK_REQUIRED'},grant_ref:text,
        authority_mode:{enum:['VERSIONED_CURRENT','LEGACY_COMPATIBILITY','APP_ONLY']}}},
      else:{properties:{reason_class:{enum:eligibilityReasons.filter(reason=>reason!=='FAMILY_CHECK_REQUIRED')},
        grant_ref:{type:'null'},authority_mode:{const:'NOT_ESTABLISHED'}}}}
  ]};
const selfNavigationItem={...obj({feature:{enum:featureIds},state:{enum:['ENTERABLE','HIDDEN']},
  authority_mode:{enum:['SCOPED_CURRENT','APP_ONLY','NOT_ESTABLISHED']},
  family_check:{const:'NOT_CHECKED'},source_readiness:{const:'NOT_CHECKED'},field_readiness:{const:'NOT_CHECKED'},command_readiness:{const:'NOT_CHECKED'}}),
  allOf:[
    {if:{properties:{state:{const:'HIDDEN'}},required:['state']},
      then:{properties:{authority_mode:{const:'NOT_ESTABLISHED'}}},
      else:{properties:{authority_mode:{enum:['SCOPED_CURRENT','APP_ONLY']}}}},
    {if:{properties:{feature:{const:'EXECUTION_OPERATIONS'}},required:['feature']},
      then:{properties:{authority_mode:{enum:['SCOPED_CURRENT','NOT_ESTABLISHED']}}}}
  ]};
const eligibilityQuery=obj({workspace_id:scopedText,environment,resource_kind:resourceKind,resource_id:scopedText,actions:eligibilityCsv});
const selfNavigationQuery=obj({workspace_id:scopedText,environment});
const schemas={AccessAction:{type:'string',enum:actions},AccessSelector:selector,AccessChange:change,
  AccessEligibilityAction:{type:'string',enum:eligibilityActions},
  AccessEligibilityQuery:eligibilityQuery,AccessSelfNavigationQuery:selfNavigationQuery,
  AccessEligibilityRow:eligibilityRow,
  AccessEligibility:{...obj({schema_version:{const:'portal.self-eligibility.v1'},workspace_id:scopedText,environment,
    resource:obj({kind:resourceKind,id:scopedText}),current_only:{const:true},advisory_only:{const:true},
    actions:{type:'array',minItems:1,maxItems:16,items:ref('AccessEligibilityRow'),
      allOf:eligibilityActions.map(action=>({contains:{type:'object',properties:{action:{const:action}},required:['action']},
        minContains:0,maxContains:1}))}}),
    description:'Current own application permission facts only; target existence, full lineage, field/source qualification, step-up and family/command readiness remain separately checked. Not a permit or TS activation.'},
  AccessSelfNavigationItem:selfNavigationItem,
  AccessSelfNavigation:{...obj({schema_version:{const:'portal.self-navigation.v1'},workspace_id:scopedText,environment,
    current_only:{const:true},advisory_only:{const:true},
    current_read_mode:{enum:['LEGACY_COMPATIBILITY','SCOPED_V2','NOT_ESTABLISHED'],
      description:'Current Core-workspace reader routing metadata only; not a grant, source readiness or command permit.'},
    features:{type:'array',minItems:4,maxItems:4,items:false,prefixItems:featureIds.map(feature=>({allOf:[
      ref('AccessSelfNavigationItem'),{properties:{feature:{const:feature}},required:['feature']}]}))},
    self_entry:obj({feature:{const:'PROFILE_ACCESS'},mode:{const:'SELF_ONLY'},permission:{const:'ALLOWED'},route:{type:'null'},
      consumer_state:{const:'AWAITING_CONSUMER_ROUTER'}})}),
    description:'Exactly four ordered own menu facts. APP_ONLY is exact reviewed Portal Manager domain permission, never source/field/economic/native/command readiness and never Operations audit. No target IDs, domain digests, peer grants or synthetic capability aliases.'},
  AccessPreviewRequest:obj({workspace_id:text,change:ref('AccessChange')}),
  AccessProposalRequest:obj({workspace_id:text,change:ref('AccessChange'),preview_digest:digest}),
  AccessRevokeRequest:obj({workspace_id:text,expected_policy_revision:rev,expected_grant_revision:rev,reason}),
  AccessRevokePreview:obj({schema_version:{const:'portal.access-revoke-preview.v1'},preview_digest:digest,policy_revision:rev,
    before:obj({grant_id:text,grant_revision:rev,action:ref('AccessAction'),effect:{enum:['ALLOW','DENY']},selector:ref('AccessSelector'),environments,revoked_at_ms:nullable(ms)}),
    after:obj({grant_state:{const:'REVOKED_ON_COMMIT'},effective_access:{const:'CURRENT_POLICY_REEVALUATED'},ts_revocation:{enum:['NOT_CONFIRMED','NOT_REQUIRED']},
      descendants:{const:'CURRENT_CHAIN_RECHECKED'},committed_obligations:{const:'CONTINUE'}}),
    step_up_required:{const:true},advisory_only:{const:true}}),
  AccessStepUpRequest:obj({workspace_id:text,password:{type:'string',minLength:1,maxLength:256,writeOnly:true}}),
  AccessReceipt:receipt,AccessResult:obj({schema_version:{const:'portal.access-result.v1'},receipt:ref('AccessReceipt'),replayed:{type:'boolean'}}),
  AccessEffective:effective,AccessPreview:preview,AccessProposal:obj({schema_version:{const:'portal.access-proposal.v1'},proposal_id:text,
    state:{enum:['APP_APPLIED','TS_PENDING','TS_APPLIED','TS_REJECTED','TS_UNKNOWN','REVOKED']},change:ref('AccessChange'),
    submission_receipt:ref('AccessReceipt'),updated_at_ms:ms}),
  AccessStepUp:obj({schema_version:{const:'portal.access-step-up.v1'},state:{const:'ACTIVE'},expires_at_ms:ms}),
  AccessAudit:obj({schema_version:{const:'portal.access-audit.v1'},workspace_id:text,subject_user_id:text,
    items:{type:'array',maxItems:100,items:obj({operation:text,receipt:ref('AccessReceipt'),occurred_at_ms:ms})},
    next_cursor:nullable({type:'string',maxLength:2048}),max_items:{const:100}}),
  AccessProblem:obj({error:obj({code:text,message:{type:'string'}}),request_id:{type:'string'}})};
const response=(s,description)=>({description,content:{'application/json':{schema:ref(s)}}});
const errors=Object.fromEntries([400,401,403,404,409,503].map(s=>[s,response('AccessProblem','Typed public refusal; current authority is required even for replay.')]));
const workspace={name:'workspace_id',in:'query',required:true,schema:text};
const id={name:'id',in:'path',required:true,schema:text};
const headers=[{name:'x-portal-idempotency-key',in:'header',required:true,schema:{type:'string',pattern:'^[A-Za-z0-9._:-]{8,128}$'}},
  {name:'x-portal-csrf',in:'header',required:true,schema:text},{name:'Origin',in:'header',required:true,schema:text}];
const read=(operationId,s,parameters)=>({operationId,security:[{PortalSession:[]}],parameters,
  responses:{200:response(s,'Private,no-store; Portal application authority, not TS business activation.'),...errors}});
const write=(operationId,input,output,parameters=[],created=false)=>({operationId,security:[{PortalSession:[]}],parameters:[...headers,...parameters],
  requestBody:{required:true,content:{'application/json':{schema:ref(input)}}},
  responses:{[created?201:200]:response(output,'Immutable original receipt, including original status on replay; private,no-store.'),...errors}});
const selfWorkspace={name:'workspace_id',in:'query',required:true,schema:scopedText};
const selfEnvironment={name:'environment',in:'query',required:true,schema:environment};
const privateRead=(operationId,s,parameters)=>{const operation=read(operationId,s,parameters);
  operation.description='Current-only self projection; reject unknown query keys, repeated/ambiguous values, subjects, roles, as_of_ms and browser profile/hash tuples. Advisory, never an execution permit.';
  for(const response of Object.values(operation.responses))response.headers={'Cache-Control':{required:true,schema:{type:'string',const:'private, no-store'}}};
  return operation;
};
const prefix='/api/admin/profile-access/v2';
const document={openapi:'3.1.0',info:{title:'Portal scoped access and delegation',version:'1.0.0'},paths:{
  [prefix+'/effective']:{get:read('portalScopedAccessEffectiveGetV1','AccessEffective',[workspace])},
  [prefix+'/eligibility']:{get:privateRead('portalScopedAccessEligibilityGetV1','AccessEligibility',[selfWorkspace,selfEnvironment,
    {name:'resource_kind',in:'query',required:true,schema:resourceKind},
    {name:'resource_id',in:'query',required:true,schema:scopedText},
    {name:'actions',in:'query',required:true,style:'form',explode:false,schema:eligibilityCsv}])},
  [prefix+'/self-navigation']:{get:privateRead('portalScopedAccessSelfNavigationGetV1','AccessSelfNavigation',[selfWorkspace,selfEnvironment])},
  [`${prefix}/preview`]:{post:write('portalScopedAccessPreviewPostV1','AccessPreviewRequest','AccessPreview')},
  [`${prefix}/proposals`]:{post:write('portalScopedAccessProposalPostV1','AccessProposalRequest','AccessResult',[],true)},
  [`${prefix}/proposals/{id}`]:{get:read('portalScopedAccessProposalGetV1','AccessProposal',[workspace,id])},
  [`${prefix}/grants/{id}/revoke`]:{post:write('portalScopedAccessRevokePostV1','AccessRevokeRequest','AccessResult',[id])},
  [`${prefix}/grants/{id}/preview-revoke`]:{post:write('portalScopedAccessRevokePreviewPostV1','AccessRevokeRequest','AccessRevokePreview',[id])},
  [`${prefix}/step-up`]:{post:write('portalScopedAccessStepUpPostV1','AccessStepUpRequest','AccessStepUp')},
  [`${prefix}/audit`]:{get:read('portalScopedAccessAuditGetV1','AccessAudit',[workspace,
    {name:'subject_user_id',in:'query',required:true,schema:text},{name:'limit',in:'query',required:false,schema:{type:'integer',minimum:1,maximum:100,default:25}},
    {name:'after',in:'query',required:false,schema:{type:'string',minLength:1,maxLength:2048}}])},
},components:{securitySchemes:{PortalSession:{type:'apiKey',in:'cookie',name:'__Host-portal_session'}},schemas}};
const sampleChange={subject_user_id:'usr_TEST_ONLY_researcher',action:'portfolio.read_restricted',effect:'ALLOW',
  selector:{kind:'EXPLICIT_RESOURCE_SET',resource_kind:'PORTFOLIO',ids:['portfolio_TEST_ONLY']},environments:['paper'],
  valid_from_ms:1792094400000,valid_until_ms:null,delegable_actions:[],ceiling_grant_id:'ceiling_TEST_ONLY',expected_ceiling_revision:'r1_TEST_ONLY',
  expected_policy_revision:'p1_TEST_ONLY',expected_ts_membership_revision:null,reason:'Synthetic example, not a granted production policy'};
const sampleEligibility={schema_version:'portal.self-eligibility.v1',workspace_id:'ws_TEST_ONLY',environment:'paper',
  resource:{kind:'PORTFOLIO',id:'portfolio_TEST_ONLY'},current_only:true,advisory_only:true};
const sampleEligibilityRow={action:'portfolio.read',permission:'ALLOWED',reason_class:'FAMILY_CHECK_REQUIRED',
  public_copy_key:'FAMILY_CHECK_REQUIRED',grant_ref:'acg_TEST_ONLY_OWN_SYNTHETIC',authority_mode:'VERSIONED_CURRENT',
  step_up_required:false,step_up_freshness:'NOT_CHECKED',challenge_availability:'NOT_CHECKED',
  command_readiness:'NOT_CHECKED',family_check:'BUSINESS_READ_SCOPE'};
const sampleNavigation={schema_version:'portal.self-navigation.v1',workspace_id:'ws_TEST_ONLY',environment:'paper',
  current_only:true,advisory_only:true,current_read_mode:'NOT_ESTABLISHED',self_entry:{feature:'PROFILE_ACCESS',mode:'SELF_ONLY',permission:'ALLOWED',route:null,
    consumer_state:'AWAITING_CONSUMER_ROUTER'}};
const navigationRows=(appOnly)=>featureIds.map(feature=>{
  const positive=appOnly&&feature!=='EXECUTION_OPERATIONS';
  return {feature,state:positive?'ENTERABLE':'HIDDEN',authority_mode:positive?'APP_ONLY':'NOT_ESTABLISHED',
    family_check:'NOT_CHECKED',source_readiness:'NOT_CHECKED',field_readiness:'NOT_CHECKED',command_readiness:'NOT_CHECKED'};
});
const fixtures={lane:'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT',cases:[
  {type:'AccessEligibility',case_name:'POSITIVE_SHAPE_NOT_INSTALLED_AUTHORITY',value:{...sampleEligibility,actions:[sampleEligibilityRow]}},
  {type:'AccessEligibility',case_name:'ABSENT_PERMISSION',value:{...sampleEligibility,actions:[{...sampleEligibilityRow,
    permission:'UNAVAILABLE',reason_class:'NO_CURRENT_PERMISSION',public_copy_key:'NO_CURRENT_PERMISSION',grant_ref:null,authority_mode:'NOT_ESTABLISHED'}]}},
  {type:'AccessSelfNavigation',case_name:'APP_ONLY_NOT_SOURCE_AUTHORITY',value:{...sampleNavigation,features:navigationRows(true)}},
  {type:'AccessSelfNavigation',case_name:'ABSENT_PERMISSION',value:{...sampleNavigation,features:navigationRows(false)}},
  ...['LEGACY_COMPATIBILITY','SCOPED_V2'].map(mode=>({type:'AccessSelfNavigation',case_name:`ROUTING_${mode}_NOT_A_GRANT`,
    value:{...sampleNavigation,current_read_mode:mode,features:navigationRows(false)}})),
  {type:'AccessEffective',value:{schema_version:'portal.access-effective.v1',workspace_id:'ws_TEST_ONLY',user_id:'usr_TEST_ONLY',policy_revision:null,
    availability:'POLICY_PENDING',reason_code:'POLICY_PENDING',grants:[],researcher_field_policy:{state:'PENDING',policy_ref:null},
    owner_recovery:{enabled:false,reason_code:'OWNER_RECOVERY_NOT_APPROVED'}}},
  {type:'AccessPreviewRequest',value:{workspace_id:'ws_TEST_ONLY',change:sampleChange}},
  {type:'AccessPreview',value:{schema_version:'portal.access-preview.v1',allowed:false,reason_code:'RESEARCHER_FIELD_POLICY_PENDING',
    preview_digest:`sha256:${'0'.repeat(64)}`,policy_revision:'p1_TEST_ONLY',app_outcome:'DENIED',ts_authority:'PENDING',effective_business_right:false,change:sampleChange,
    effect_preview:{before:{coverage:'EXACT_SELECTOR_GRANTS_ONLY',grants:[]},after:{application:'DENIED',business:'PENDING',rights_effective_now:false}}}},
  ...['ALLOW','DENY'].map(effect=>({type:'AccessRevokePreview',value:{schema_version:'portal.access-revoke-preview.v1',
    preview_digest:`sha256:${'0'.repeat(64)}`,policy_revision:'p1_TEST_ONLY',
    before:{grant_id:`acg_TEST_ONLY_${effect}`,grant_revision:'r1_TEST_ONLY',action:'users.read',effect,
      selector:{kind:'EXPLICIT_RESOURCE_SET',resource_kind:'USER',ids:['usr_TEST_ONLY_target']},environments:['paper'],revoked_at_ms:null},
    after:{grant_state:'REVOKED_ON_COMMIT',effective_access:'CURRENT_POLICY_REEVALUATED',ts_revocation:'NOT_REQUIRED',
      descendants:'CURRENT_CHAIN_RECHECKED',committed_obligations:'CONTINUE'},step_up_required:true,advisory_only:true}})),
  ...['APP_APPLIED','TS_PENDING','TS_APPLIED','TS_REJECTED','TS_UNKNOWN','REVOKED','DENIED'].map(outcome=>({type:'AccessReceipt',value:{
    schema_version:'portal.access-operation.v1',operation_id:`ace_TEST_ONLY_${outcome}`,proposal_id:'acp_TEST_ONLY',grant_id:'acg_TEST_ONLY',outcome,
    http_status:outcome==='DENIED'?409:200,reason_code:outcome==='DENIED'?'GRANT_REVISION_CONFLICT':null,policy_revision:'p1_TEST_ONLY',
    grant_revision:'r1_TEST_ONLY',decided_at_ms:1792094400000,ts_authority:({TS_PENDING:'PENDING',TS_APPLIED:'ACCEPTED',TS_REJECTED:'REJECTED',TS_UNKNOWN:'UNKNOWN'})[outcome]??'NOT_REQUIRED'}})),
]};
// Only the new C3 shapes receive examples; all existing schema/fixture semantics remain unchanged.
for(const name of ['AccessEligibility','AccessSelfNavigation'])
  schemas[name].examples=fixtures.cases.filter(entry=>entry.type===name).map(entry=>entry.value);
for(const [file,value] of Object.entries({'openapi/execution-access.openapi.json':document,'fixtures/execution-access.synthetic.valid.json':fixtures})){
  const bytes=JSON.stringify(value,null,2)+'\n',target=resolve(root,file);
  if(process.argv.includes('--check')){if(readFileSync(target,'utf8')!==bytes)throw new Error(`Generated drift: ${file}`);}
  else writeFileSync(target,bytes);
}
