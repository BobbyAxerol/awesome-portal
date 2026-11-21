/** Canonical additive ELP2-01 schema. No routes, grants or runtime config activated. */
export const object = (properties, required = Object.keys(properties)) => ({
  type: 'object', additionalProperties: false, properties, required,
});
const ref = name => ({ $ref: `#/$defs/${name}` });
const enumeration = values => ({ type: 'string', enum: values });
const nullable = schema => ({ anyOf: [schema, { type: 'null' }] });
const array = (items, maxItems = 200) => ({ type: 'array', items, maxItems });
const text = { type: 'string', minLength: 1, maxLength: 256 };
const decimal = { type: 'string', pattern: '^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$', maxLength: 128 };
const money = { type: 'string', pattern: '^(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$', maxLength: 128 };
const counter = { type: 'string', pattern: '^(?:0|[1-9][0-9]{0,18})$',
  description: 'PM HTTP adapter decimal-counter string; maximum 9223372036854775807. Never a JS Number.' };
// Lexical int64 bound: numeric JSON-schema maximum would lose precision.
function boundedCounterPattern(bound) {
  const alternatives = ['0', '[1-9][0-9]{0,17}'];
  for (let i = 0; i < bound.length; i++) {
    const low = i === 0 ? 1 : 0; const high = Number(bound[i]) - 1;
    if (high >= low) alternatives.push(bound.slice(0, i) + (high === low ? String(low) : `[${low}-${high}]`) + (i < bound.length - 1 ? `[0-9]{${bound.length - i - 1}}` : ''));
  }
  alternatives.push(bound);
  return `^(?:${alternatives.join('|')})$`;
}
counter.pattern = boundedCounterPattern('9223372036854775807');
const utc = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const count = {...utc};
const points = {type:'string',pattern:'^(?:(?:0|[1-9][0-9]?)(?:\\.[0-9]+)?|100(?:\\.0+)?)$',maxLength:128};
const ratio = {type:'string',pattern:'^(?:0(?:\\.[0-9]+)?|1(?:\\.0+)?)$',maxLength:128};
const pmText = {type:'string',minLength:1,maxLength:512,
  pattern:'^(?![\\u0009-\\u000d\\u001c-\\u0020\\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000])(?![\\s\\S]*[\\u0000-\\u001f\\u007f])[\\s\\S]*(?<![\\u0009-\\u000d\\u001c-\\u0020\\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000])$',
  $comment:'PM text additionally requires <=512 UTF-8 bytes, enforced by runtime pmText validator; JSON Schema maxLength counts Unicode codepoints, not bytes.'};
const sha = { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' };
const environment = enumeration(['paper', 'sandbox', 'live']);
const stage = enumeration(['PAPER', 'SANDBOX', 'CANARY', 'LIVE']);
const availability = object({ state: enumeration(['AVAILABLE', 'PARTIAL', 'UNAVAILABLE', 'DENIED', 'NOT_APPLICABLE']), reason_code: nullable(text) });
availability.allOf = [{ if: { properties: { state: { const: 'AVAILABLE' } }, required: ['state'] }, then: { properties: { reason_code: { type: 'null' } } }, else: { properties: { reason_code: text } } }];
const window = object({ start_ms: utc, end_exclusive_ms: utc });
const versions = keys => object(Object.fromEntries(keys.map(key => [key, counter])));
const capitalFields = {
  FUND: ['amount', 'source_ref'], RETURN_CAPITAL: ['amount'], INITIAL_GRANT: ['amount'], TOP_UP: ['amount'],
  IMMEDIATE_DECREASE: ['amount'], RECALL_PARTIAL: ['amount'], RECALL_FULL: [],
  ADJUST_TARGET_BUDGET: ['target_budget'], SET_ROOT_LIMIT: ['target_root_limit'],
};
export const candidateVersionKeys = {
  FUND: ['budget', 'source', 'claim'], INITIAL_GRANT: ['budget', 'source', 'parent'], TOP_UP: ['budget', 'source', 'parent'],
  IMMEDIATE_DECREASE: ['budget', 'source', 'parent', 'book'], RECALL_PARTIAL: ['budget', 'source', 'parent', 'book'],
  RECALL_FULL: ['budget', 'source', 'parent', 'book'], ADJUST_TARGET_BUDGET: ['budget', 'source', 'parent', 'book'],
  SET_ROOT_LIMIT: ['budget', 'source'],
};
export const scoreBands = [
  {name:'weak',lower:'0',upper:'40',upper_inclusive:false},
  {name:'neutral',lower:'40',upper:'60',upper_inclusive:false},
  {name:'fair',lower:'60',upper:'75',upper_inclusive:false},
  {name:'good',lower:'75',upper:'90',upper_inclusive:false},
  {name:'very_good',lower:'90',upper:'100',upper_inclusive:true},
];
const capitalVariants = [];
for (const [operation, extras] of Object.entries(capitalFields)) {
  // RETURN_CAPITAL is a component contract only; actual candidate adapter excludes it.
  const kinds = operation === 'SET_ROOT_LIMIT' ? ['ROOT'] : ['PORTFOLIO', 'DEPLOYMENT_ACCOUNT'];
  for (const recipient_kind of kinds) {
    const properties = { schema_version: { const: 'pma.capital-command.v1.1' }, operation: { const: operation },
      idempotency_key: pmText, recipient_kind: { const: recipient_kind }, currency: pmText,
      expected_versions: operation === 'RETURN_CAPITAL' ? { type: 'object', minProperties: 1, maxProperties: 10,
        propertyNames: enumeration(['portfolio','budget','assignment','command','lock','root','source','parent','claim','book']), additionalProperties: counter }
        : versions(candidateVersionKeys[operation]), reason: pmText };
    if (recipient_kind === 'DEPLOYMENT_ACCOUNT') Object.assign(properties, { recipient_account_id: pmText, recipient_deployment_id: pmText });
    for (const field of extras) properties[field] = field === 'source_ref' ? pmText : money;
    if (extras.includes('amount')) properties.amount = { ...money, not: { pattern: '^0(?:\\.0+)?$' } };
    capitalVariants.push(object(properties));
  }
}
const quality = object({ completeness: enumeration(['COMPLETE', 'PARTIAL', 'UNRESOLVED']),
  freshness: enumeration(['FRESH', 'STALE', 'UNKNOWN']), coverage: enumeration(['AUTHORIZED_ONLY', 'CURRENT_PAGE_ONLY', 'RETAINED_OBSERVATIONS']),
  source_as_of_ms: nullable(utc), portal_observed_at_ms: utc, source_set_ref: text, confidence: enumeration(['VERIFIED', 'PROVISIONAL', 'UNKNOWN']),reasons:array(text,32) });
const scoreStates = ['available','provisional','policy_pending','unbound','invalid_data','stale','partial_costs','partial_components','insufficient_data','partial_coverage','incomparable_basis','no_allocation'];
const band = enumeration(['weak', 'neutral', 'fair', 'good', 'very_good']);
const score = object({ model_revision: { const: 'qbts_prb_v1_1' }, band_revision: { const: 'quality_bands_v1_1' },
  kind: enumeration(['RAW_ALPHA', 'CONTRIBUTION', 'COMPOSITION', 'DIRECT_NAV']), status: enumeration(scoreStates),
  value: nullable(points), quality_band: nullable(band), comparable_basis_id: nullable(text), evidence_ref: nullable(text),
  requested_window: window, effective_window: nullable(window), economic_subject_ref: text, research_binding_ref: nullable(text),
  config_ref: nullable(sha), reason_code: nullable(text), availability: ref('Availability'),
  subject_type:enumeration(['alpha','deployment','sleeve','portfolio','manager_book']),reason_codes:array(text,32),
  policy_version:nullable(text),formula_hash:nullable(sha),policy_hash:nullable(sha),approved_policy_id:nullable(text),
  components:object({P:nullable(points),R:nullable(points),B:nullable(points),
    atomic:object(Object.fromEntries(['net_excess_twr','sharpe_period','mdd','add','positive_block_ratio','stress_excess_twr']
      .map(k=>[k,object({raw:nullable(decimal),normalized:nullable(points),contribution:nullable(points),reason_code:nullable(text)})])))}),
  bounds:nullable(object({lower:points,upper:points,reason_code:text})),
  evidence_status:enumeration(['limited','sufficient_for_display','insufficient','unknown']),
  sample_count:nullable(count),complete_block_count:nullable(count),trade_count:nullable(count),
  observed_duration_ms:nullable(utc),actual_duration_ms:nullable(utc),as_of_ms:utc,knowledge_cutoff_ms:utc,computed_at_ms:utc,
  subject_binding_id:nullable(text),data_snapshot_id:nullable(text),revision:text,supersedes_revision:nullable(text),
  stage_breakdown:array(object({financial_stage:stage,duration_ms:utc}),4),
  series_kind:enumeration(['ECONOMIC_NAV','RESEARCH','MIXED_FORWARD_DIAGNOSTIC']),economic_domain:enumeration(['ACTUAL','SANDBOX_DEMO','PAPER_SIMULATION','MIXED_DIAGNOSTIC']),
  cost_coverage:object({state:enumeration(['COMPLETE','PARTIAL','UNKNOWN']),source_ref:nullable(text),reason_code:nullable(text)}),
  stress_policy_id:nullable(text),allocation_weight:nullable(ratio),raw_score_ref:nullable(text),allocation_snapshot_id:nullable(text),
  score_coverage_allocated:nullable(ratio),provisional_allocated_weight:nullable(ratio),allocation_coverage_nav:nullable(ratio),
  return_source_snapshot_id:nullable(text),consolidation_manifest_id:nullable(text),
  preview:nullable(object({label:{const:'TEST_ONLY_OR_UNAPPROVED_NOT_PRODUCTION'},value:nullable(points),config_ref:nullable(sha),reason_code:text})),
});
score.allOf = [
  { if: { properties: { status: { enum: ['available', 'provisional'] } }, required: ['status'] }, then: { properties: {
    value: points, comparable_basis_id: text, evidence_ref: text, effective_window: window, config_ref: sha,approved_policy_id:text,
    availability: { type: 'object', properties: { state: { const: 'AVAILABLE' } } }, reason_code: { type: 'null' } } },
    else: { properties: { value: { type: 'null' }, quality_band: { type: 'null' }, reason_code: text,
      availability: { type: 'object', properties: { state: { enum: ['PARTIAL','UNAVAILABLE','DENIED','NOT_APPLICABLE'] } } } } } },
  { if: { properties: { kind: { const: 'CONTRIBUTION' } }, required: ['kind'] }, then: { properties: { quality_band: { type: 'null' } } } },
  { if: { properties: { status: { enum: ['available', 'provisional'] }, kind: { enum: ['RAW_ALPHA','DIRECT_NAV'] } }, required: ['status','kind'] }, then: { properties: { quality_band: band } } },
  { if:{properties:{kind:{enum:['RAW_ALPHA','DIRECT_NAV','CONTRIBUTION']}},required:['kind']},then:{properties:{status:enumeration(scoreStates.filter(s=>!['partial_coverage','incomparable_basis','no_allocation'].includes(s)))}} },
];
for(const [name,pattern] of Object.entries({weak:'(?:0|[1-9]|[12][0-9]|3[0-9])(?:\\.[0-9]+)?',neutral:'[45][0-9](?:\\.[0-9]+)?',
  fair:'(?:6[0-9]|7[0-4])(?:\\.[0-9]+)?',good:'(?:7[5-9]|8[0-9])(?:\\.[0-9]+)?',very_good:'(?:9[0-9](?:\\.[0-9]+)?|100(?:\\.0+)?)'}))
  score.allOf.push({if:{properties:{quality_band:{const:name}},required:['quality_band']},then:{properties:{value:{type:'string',pattern:`^${pattern}$`}}}});
const binding = object({ alpha_id: text, alpha_version_id: text, portfolio_id: text, deployment_id: text,
  internal_account_id: text, physical_pool_id: nullable(text), binding_revision: text,
  owner_user_id: text, deploy_actor_user_id: text, environment, financial_stage: stage,
  lifecycle: enumeration(['ACTIVE','ARCHIVE_REQUESTED','ARCHIVED']), economic_domain: enumeration(['ACTUAL','SANDBOX_DEMO','PAPER_SIMULATION']) });
binding.allOf = [
  { if: { properties: { environment: { const: 'paper' } }, required: ['environment'] }, then: { properties: { financial_stage: { const: 'PAPER' }, economic_domain: { const: 'PAPER_SIMULATION' } } } },
  { if: { properties: { environment: { const: 'sandbox' } }, required: ['environment'] }, then: { properties: { financial_stage: { const: 'SANDBOX' }, economic_domain: { const: 'SANDBOX_DEMO' } } } },
  { if: { properties: { environment: { const: 'live' } }, required: ['environment'] }, then: { properties: { financial_stage: { enum: ['CANARY','LIVE'] }, economic_domain: { const: 'ACTUAL' } } } },
];
const defs = {
  Decimal: decimal, NonnegativeDecimal: money, PmCounter: counter, PmText:pmText,UtcMilliseconds: utc, OpaqueRevision: text,
  Environment: environment, FinancialStage: stage, Availability: availability, Window: window, Quality: quality,
  ResourceRef: object({ kind: enumeration(['ROOT','PORTFOLIO','ALPHA','ALPHA_VERSION','DEPLOYMENT','ACCOUNT','BINDING','USER']), id: text }),
  HumanIdentity: object({ user_id: text, issuer: text, subject: text, mapping_state: enumeration(['VERIFIED','UNMAPPED','CONFLICT']),
    ts_user_id: nullable(text), researcher_user_id: nullable(text) }),
  WorkloadIdentity: object({ workload_ref: text, audience: text, delegation_ref: nullable(text) }),
  Binding: binding, PmaCapitalCommand: { oneOf: capitalVariants },
  PmaCandidateCapitalCommand:{oneOf:capitalVariants.filter(variant=>variant.properties.operation.const!=='RETURN_CAPITAL')},
  BrowserCapitalIntent:object({schema_version:{const:'execution.capital-intent.v2'},workspace_id:text,
    resource:object({kind:enumeration(['ROOT','PORTFOLIO','DEPLOYMENT']),id:text}),environment,
    expected_policy_revision:text,business_payload:ref('PmaCandidateCapitalCommand')}),
  PmaAdapterReadiness: object({ operation: enumeration(Object.keys(capitalFields)),
    component_supported: { const: true }, candidate_supported: { type: 'boolean' }, runtime_enabled: { const: false },
    reason_code: enumeration(['TRUST_NOT_QUALIFIED','ADAPTER_UNAVAILABLE']) }),
  AmountPartition: object({ requested: money, applied: money, pending: money, cancelled: money, rejected: money }),
  TrustedHumanContext:object({user_id:{type:'string',pattern:'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'},issuer:text,subject:text,purpose:{const:'pma.identity.v1'},principal_kind:{const:'human'},
    environment,workspace_id:text,session_id:text,session_revision:counter,authority_revision:counter,token_id:text,expires_at_ms:utc}),
  TrustedWorkloadContext:object({workload_ref:text,audience:{const:'pma.management.v1'},delegation_ref:text,
    workload_scopes:{type:'array',minItems:1,maxItems:64,uniqueItems:true,items:text}}),
  TrustedCommandContext: object({ human: ref('TrustedHumanContext'), workload: ref('TrustedWorkloadContext'), environment,
    workspace_id: text, policy_revision: text, authority_scope_id: text }),
  GrantProposal: object({ proposal_id: text, subject_user_id: text, resource: ref('ResourceRef'), environment,
    policy_revision: text, app_state: enumeration(['PENDING','APPLIED','REJECTED']),
    ts_state: enumeration(['NOT_REQUIRED','PENDING','APPLIED','REJECTED','UNKNOWN']), accepted_receipt_ref: nullable(text) }),
  MetricCapsule: object({ metric_id: text, value: nullable(decimal), unit: text, currency: nullable(text),
    economic_domain: enumeration(['ACTUAL','SANDBOX_DEMO','PAPER_SIMULATION','MIXED']), basis: text,
    denominator: nullable(decimal),denominator_kind:enumeration(['NOT_APPLICABLE','OPENING_CAPITAL','CURRENT_ALLOCATION','NET_CONTRIBUTED','AVERAGE_WEIGHTED','METHODOLOGY_DEFINED']),
    denominator_reason_code:nullable(text),methodology_revision: nullable(text),policy_revision:text,
    domain_proof:nullable(object({kind:enumeration(['VERIFIED_NATIVE_PROFILE','EXPLICIT_NON_CUSTODIAL_PAPER']),ref:text})),requested_window: window,
    effective_window: nullable(window), quality: ref('Quality'), availability: ref('Availability'),
    calculation_revision: text, provenance_ref: nullable(text) }),
  ScoreCapsule: score,
  ScorePolicy: object({ model_revision: { const: 'qbts_prb_v1_1' },
    weights: object({ P: { const: '0.45' }, R: { const: '0.30' }, B: { const: '0.25' } }),
    atomic_weights: object({ twr_excess: { const: '0.315' }, period_sr: { const: '0.135' }, mdd: { const: '0.180' },
      add: { const: '0.120' }, positive_blocks: { const: '0.125' }, stress_twr_excess: { const: '0.125' } }),
    bands: {type:'array',minItems:5,maxItems:5,const:scoreBands,
      items:object({name:band,lower:decimal,upper:decimal,upper_inclusive:{type:'boolean'}})},
    runtime_config_state: { const: 'policy_pending' }, runtime_config_ref: { type: 'null' },
    manager_book_kind: { const: 'ANALYTICS_ONLY_NOT_ECONOMIC_ENTITY' } }),
  FieldCatalogueEntry: object({ field_id: text, scalar_type: enumeration(['DECIMAL','UTC_MS','ID','ENUM','BOOLEAN']),
    unit: nullable(text), visible_in: array(enumeration(['MANAGER','RESEARCHER']),2),
    sortable: { type: 'boolean' }, filter_operators: array(enumeration(['EQ','IN','LT','LTE','GT','GTE']),6),
    required_capability: text, methodology_revision: nullable(text) }),
  StreamEnvelope: object({ contract_version: { const: 'edge.v1' }, source_continuity_epoch: text,
    projection_generation: text, event_id: text, event_kind: enumeration(['SNAPSHOT','UPSERT','CORRECTION','TOMBSTONE','RESYNC_REQUIRED']),
    continuation: text, emitted_at_ms: utc, as_of_ms:utc,source_observed_at_ms:nullable(utc),
    coverage_watermark:nullable(text),policy_revision: text, quality: ref('Quality'),
    entity_key:nullable(text),entity_revision:nullable(text),replacement_ref:nullable(text) }),
  BrowserSnapshotMetadata:object({schema_version:{const:'portal.snapshot.v1'},snapshot_id:text,dataset:text,as_of_ms:utc,
    recorded_through_ms:nullable(utc),facts_through_ms:nullable(utc),produced_at_ms:utc,received_at_ms:utc,
    source_observed_at_ms:nullable(utc),emitted_at_ms:utc,quality:ref('Quality'),resume_cursor:text,coverage_watermark:nullable(text),
    versions:object({source_continuity_epoch:text,projection_generation:text,app_policy:text}),projection_lineage_ref:nullable(text),adapter_revision:{const:'edge-to-portal-metadata.v1'}}),
  LegacyObservation:object({schema_version:{const:'execution.legacy-observation.v1'},source_timestamp:text,
    source_generation:text,environment:enumeration(['paper','sandbox','live','DEMO']),availability:enumeration(['available','partial','unavailable'])}),
  AliasResolution:{oneOf:[object({state:{const:'RESOLVED'},alias:text,canonical:ref('ResourceRef'),mapping_revision:text}),
    object({state:enumeration(['AMBIGUOUS','NOT_FOUND','DENIED']),alias:text,canonical:{type:'null'},mapping_revision:nullable(text),reason_code:text})]},
  ManagerPortfolio: object({ schema_version: { const: 'execution.manager-portfolio.v2' }, portfolio_id: text,
    financial_stages: array(stage,4), lifecycle: enumeration(['ACTIVE','ARCHIVE_REQUESTED','ARCHIVED']),
    economic_domain: enumeration(['ACTUAL','SANDBOX_DEMO','PAPER_SIMULATION']), nav: ref('MetricCapsule'),
    raw_alpha_scores: array(ref('ScoreCapsule')), composition: ref('ScoreCapsule'), direct_nav_score: ref('ScoreCapsule'),
    quality: ref('Quality'), policy_revision: text }),
  RestrictedPortfolio: object({ schema_version: { const: 'execution.restricted-portfolio.v2' }, portfolio_id: text,
    display_label: text, linked_alpha_ids: { type: 'array', maxItems: 200, uniqueItems: true, items: text },
    disclosure_state: enumeration(['APPROVED_SLICE','FIELD_POLICY_PENDING']), policy_revision: text }),
  Problem: object({ code: text, status: { type: 'integer', enum: [400,401,403,404,409,410,413,429,502,503] },
    request_id: text, public_copy_key: text, field_path: nullable(text) }),
  EndpointReadiness: object({ operation_id: text, design_ready: { type: 'boolean' }, fixture_compatible: { type: 'boolean' },
    source_ready: { type: 'boolean' }, identity_policy_ready: { type: 'boolean' }, privacy_ready: { type: 'boolean' },
    metric_ready: { type: 'boolean' }, performance_ready: { type: 'boolean' }, runtime_enabled: { type: 'boolean' },
    blockers: array(text,32) }),
  CashflowPosting: object({ posting_id:text,source_id:text,internal_account_id:text,currency:text,
    kind:enumeration(['OPENING','DEPOSIT','WITHDRAWAL','TRADING_PNL','FEE']),amount:money,observed_at_ms:utc }),
  OwnershipInterval: object({ resource:ref('ResourceRef'),owner_user_id:text,effective_from_ms:utc,
    effective_to_ms:nullable(utc),binding_revision:text,original_obligation_ref:nullable(text) }),
  DelegationCeiling: object({ subject_user_id:text,resource:ref('ResourceRef'),environment,
    capabilities:{type:'array',maxItems:64,uniqueItems:true,items:text},
    delegable:{type:'array',maxItems:64,uniqueItems:true,items:text},policy_revision:text,
    approval_state:enumeration(['TEST_ONLY','APPROVED','PENDING']),expires_at_ms:nullable(utc) }),
  ArchiveDisposition: object({ resource:ref('ResourceRef'),lifecycle:enumeration(['ARCHIVE_REQUESTED','ARCHIVED']),
    financial_stage:stage,open_obligations:nullable({type:'integer',minimum:0}),
    automatic_liquidation:{const:false},paper_clone_resource:nullable(ref('ResourceRef')),lineage_ref:nullable(text),
    clone_lineage:nullable(object({origin_deployment_id:text,origin_alpha_version_id:text,clone_reason:{const:'ARCHIVE_MONITOR'},
      effective_at_ms:utc,approved_config_digest:sha})) }),
  ResourceMeasurement: object({ profile_ref:text,state:enumeration(['MEASURED','NOT_MEASURED']),
    cpu_cores:nullable(decimal),rss_bytes:nullable({type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER}),
    receipt_ref:nullable(text),runtime_config_approved:{const:false} }),
};
defs.HumanIdentity.allOf = [{ if: { properties: { mapping_state: { const: 'VERIFIED' } }, required:['mapping_state'] }, then: { properties: { ts_user_id: text } }, else: { properties: { ts_user_id: {type:'null'} } } }];
defs.PmaAdapterReadiness.allOf=[{if:{properties:{operation:{const:'RETURN_CAPITAL'}},required:['operation']},then:{properties:{candidate_supported:{const:false},reason_code:{const:'ADAPTER_UNAVAILABLE'}}},else:{properties:{candidate_supported:{const:true},reason_code:{const:'TRUST_NOT_QUALIFIED'}}}}];
defs.GrantProposal.allOf = [{ if: { properties: { ts_state: { const: 'APPLIED' } }, required:['ts_state'] }, then: { properties: { accepted_receipt_ref: text } }, else: { properties: { accepted_receipt_ref: {type:'null'} } } }];
defs.MetricCapsule.allOf = [{ if: { properties: { economic_domain: { const:'MIXED' } }, required:['economic_domain'] }, then: { properties: { value:{type:'null'}, availability:{type:'object',properties:{state:{const:'UNAVAILABLE'},reason_code:{const:'MIXED_ECONOMIC_DOMAINS'}}} } } }];
defs.MetricCapsule.allOf.push(
  {if:{properties:{availability:{type:'object',properties:{state:{const:'AVAILABLE'}},required:['state']}},required:['availability']},then:{properties:{value:decimal,methodology_revision:text,provenance_ref:text,domain_proof:ref('DomainProof')}}},
  {if:{properties:{unit:{enum:['MONEY','PRICE']}},required:['unit']},then:{properties:{currency:text}}},
  {if:{properties:{unit:{enum:['RATIO','PERCENT']},value:{type:'string'}},required:['unit','value']},then:{properties:{denominator:{...money,not:{pattern:'^0(?:\\.0+)?$'}},denominator_kind:enumeration(['OPENING_CAPITAL','CURRENT_ALLOCATION','NET_CONTRIBUTED','AVERAGE_WEIGHTED','METHODOLOGY_DEFINED']),methodology_revision:text}}},
  {if:{properties:{domain_proof:{type:'null'}},required:['domain_proof']},then:{properties:{value:{type:'null'},availability:{type:'object',properties:{state:{enum:['UNAVAILABLE','PARTIAL','DENIED','NOT_APPLICABLE']},reason_code:text}}}}},
);
defs.DomainProof=defs.MetricCapsule.properties.domain_proof.anyOf[0];
defs.EndpointReadiness.allOf = [{ if:{properties:{runtime_enabled:{const:true}},required:['runtime_enabled']}, then:{properties:Object.fromEntries(['design_ready','fixture_compatible','source_ready','identity_policy_ready','privacy_ready','metric_ready','performance_ready'].map(k=>[k,{const:true}]).concat([['blockers',{type:'array',maxItems:0}]]))} }];
export const schema = { $schema:'https://json-schema.org/draft/2020-12/schema',
  $id:'https://schemas.primusspark.com/portal/execution-v2-foundation.v1.schema.json',
  title:'Execution V2 authority foundation — additive contract, no runtime activation', $defs:defs };
export function openapiDocument() {
  const components = JSON.parse(JSON.stringify(defs).replaceAll('#/$defs/','#/components/schemas/'));
  return { openapi:'3.1.0',info:{title:schema.title,version:'1.0.0'},paths:{},components:{schemas:components} };
}
