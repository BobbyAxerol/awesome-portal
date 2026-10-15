import { schema, scoreBands } from './execution-v2-foundation.mjs';
const copy = value => structuredClone(value);
const hash = `sha256:${'a'.repeat(64)}`;
export const window = {start_ms:1704067200000,end_exclusive_ms:1704672000000};
export const quality = {completeness:'PARTIAL',freshness:'STALE',coverage:'AUTHORIZED_ONLY',
  source_as_of_ms:null,portal_observed_at_ms:1704672000000,source_set_ref:'test:source-set',confidence:'PROVISIONAL',reasons:['TEST_ONLY_PARTIAL_COVERAGE']};
export const identity = {user_id:'test:researcher',issuer:'test:issuer',subject:'stable-subject',mapping_state:'VERIFIED',ts_user_id:'test:ts-user',researcher_user_id:'test:researcher'};
export const binding = {alpha_id:'A1',alpha_version_id:'V1',portfolio_id:'P1',deployment_id:'D1',internal_account_id:'C1',physical_pool_id:'POOL1',
  binding_revision:'binding:r1',owner_user_id:'test:researcher',deploy_actor_user_id:'test:deployer',environment:'live',financial_stage:'CANARY',lifecycle:'ACTIVE',economic_domain:'ACTUAL'};
export const score = {model_revision:'qbts_prb_v1_1',band_revision:'quality_bands_v1_1',kind:'RAW_ALPHA',status:'provisional',value:'73.3',quality_band:'fair',
  comparable_basis_id:'test:7d-basis',evidence_ref:'test:raw-observations',requested_window:window,effective_window:window,economic_subject_ref:'A1:V1:P1',research_binding_ref:'test:binding',
  config_ref:hash,reason_code:null,availability:{state:'AVAILABLE',reason_code:null},subject_type:'alpha',reason_codes:[],
  policy_version:'test:policy1',formula_hash:hash,policy_hash:hash,approved_policy_id:'TEST_ONLY_NOT_OWNER_APPROVAL',
  components:{P:'80',R:'70',B:'65.2',atomic:Object.fromEntries([
    ['net_excess_twr','0.06','80','25.2'],['sharpe_period','0.12','80','10.8'],['mdd','0.03','70','12.6'],
    ['add','0.012','70','8.4'],['positive_block_ratio','0.652','65.2','8.15'],['stress_excess_twr','0.0452','65.2','8.15'],
  ].map(([k,raw,normalized,contribution])=>[k,{raw,normalized,contribution,reason_code:null}]))},
  bounds:null,evidence_status:'limited',sample_count:168,complete_block_count:250,trade_count:null,observed_duration_ms:604800000,actual_duration_ms:604800000,
  as_of_ms:window.end_exclusive_ms,knowledge_cutoff_ms:window.end_exclusive_ms,computed_at_ms:window.end_exclusive_ms,
  subject_binding_id:'test:subject-binding',data_snapshot_id:'test:snapshot1',revision:'score:r1',supersedes_revision:null,
  stage_breakdown:[{financial_stage:'CANARY',duration_ms:604800000}],series_kind:'ECONOMIC_NAV',economic_domain:'ACTUAL',
  cost_coverage:{state:'COMPLETE',source_ref:'test:costs',reason_code:null},stress_policy_id:'test:stress',allocation_weight:null,raw_score_ref:null,
  allocation_snapshot_id:null,score_coverage_allocated:null,provisional_allocated_weight:null,allocation_coverage_nav:null,
  return_source_snapshot_id:'test:returns',consolidation_manifest_id:'test:consolidation',preview:null};
export const pendingScore = {...score,status:'policy_pending',value:null,quality_band:null,config_ref:null,approved_policy_id:null,
  reason_code:'SCORE_CONFIG_NOT_APPROVED',reason_codes:['SCORE_CONFIG_NOT_APPROVED'],availability:{state:'UNAVAILABLE',reason_code:'SCORE_CONFIG_NOT_APPROVED'}};
export const capital = {schema_version:'pma.capital-command.v1.1',operation:'TOP_UP',idempotency_key:'test:same-intent',recipient_kind:'DEPLOYMENT_ACCOUNT',
  currency:'USDT',expected_versions:{budget:'9223372036854775807',source:'0',parent:'17'},reason:'Synthetic contract test, never submitted',
  recipient_account_id:'C1',recipient_deployment_id:'D1',amount:'500.00'};
export const metric = {metric_id:'nav',value:'1000.000000000000000001',unit:'MONEY',currency:'USDT',economic_domain:'ACTUAL',basis:'INTERNAL_ACCOUNT_BALANCE',
  denominator:null,denominator_kind:'NOT_APPLICABLE',denominator_reason_code:'ABSOLUTE_METRIC',methodology_revision:'test:nav-v1',policy_revision:'p1',
  domain_proof:{kind:'VERIFIED_NATIVE_PROFILE',ref:'test:profile-proof'},requested_window:window,effective_window:window,quality,
  availability:{state:'PARTIAL',reason_code:'PARTIAL_COVERAGE'},calculation_revision:'test:r1',provenance_ref:'test:postings'};
export const stream = {contract_version:'edge.v1',source_continuity_epoch:'source:epoch1',projection_generation:'edge:gen7',event_id:'opaque:event1',
  event_kind:'UPSERT',continuation:'opaque:bound-to-relation-policy',emitted_at_ms:1704672000000,as_of_ms:1704672000000,
  source_observed_at_ms:null,coverage_watermark:'opaque:authenticated-scope-watermark',policy_revision:'policy:r1',quality,
  entity_key:'opaque:entity1',entity_revision:'source:r1',replacement_ref:'test:replacement1'};
export const ceiling = {subject_user_id:'test:manager',resource:{kind:'PORTFOLIO',id:'P1'},environment:'sandbox',capabilities:['business.read','budget.manage'],
  delegable:['budget.manage'],policy_revision:'policy:test-only',approval_state:'TEST_ONLY',expires_at_ms:null};
export const restricted = {schema_version:'execution.restricted-portfolio.v2',portfolio_id:'P1',display_label:'Linked portfolio P1',linked_alpha_ids:['A1'],disclosure_state:'FIELD_POLICY_PENDING',policy_revision:'policy:r1'};
const raw = (kind,status='provisional') => ({...score,kind,status,...(kind==='DIRECT_NAV'?{subject_type:'portfolio',research_binding_ref:null}:{}),
  ...(kind==='CONTRIBUTION'?{value:'18.325',quality_band:null,allocation_weight:'0.25',raw_score_ref:'test:raw-q-r1'}:{})});
export const manager = {schema_version:'execution.manager-portfolio.v2',portfolio_id:'P1',financial_stages:['CANARY','LIVE'],lifecycle:'ACTIVE',economic_domain:'ACTUAL',
  nav:metric,raw_alpha_scores:[pendingScore],composition:{...pendingScore,kind:'COMPOSITION'},direct_nav_score:raw('DIRECT_NAV'),quality,policy_revision:'policy:r1'};
const fact = (type,value,valid=true) => ({type,value:copy(value),valid});
const cases=[];
const add=(id,title,facts,invariants)=>cases.push({id,title,facts,invariants});
add('FX-01','Identity and delegation',[fact('HumanIdentity',identity),fact('DelegationCeiling',ceiling),fact('HumanIdentity',{...identity,actor:'spoof'},false)],
  ['Manager read is not mutation/delegation authority','Synthetic ceiling is not a grant to Stan','Researcher owner differs from deployer']);
add('FX-02','Shared alpha, separate version/portfolio grain',[fact('Binding',binding),fact('Binding',{...binding,portfolio_id:'P2',deployment_id:'D2',internal_account_id:'C2'})],
  ['Fleet key is alpha_id + alpha_version_id + portfolio_id','Linked discovery is not peer-finance permission']);
add('FX-03','Shared physical pool, distinct economic accounts',[fact('Binding',binding),fact('Binding',{...binding,internal_account_id:'C3',deployment_id:'D3'})],
  ['Pool membership does not grant physical-custody disclosure','Dedupe economic source identity, never numeric equality']);
add('FX-04','Economic backing vs budget',[fact('MetricCapsule',{...metric,metric_id:'economic_backing',value:'1000'}),fact('MetricCapsule',{...metric,metric_id:'risk_budget',value:'800'}),fact('PmaCapitalCommand',capital)],
  ['Budget is not an economic cash transfer','No universal 1x exposure rule']);
add('FX-05','Partial recall and exact partition',[fact('AmountPartition',{requested:'500',applied:'200.01',pending:'299.99',cancelled:'0',rejected:'0'})],
  ['Exact requested = applied + pending + cancelled + rejected','Unknown obligations never imply flat']);
add('FX-06','Ownership intervals and late obligation',[fact('OwnershipInterval',{resource:{kind:'DEPLOYMENT',id:'D1'},owner_user_id:'test:old-owner',effective_from_ms:1704067200000,effective_to_ms:1704500000000,binding_revision:'b1',original_obligation_ref:'original:order1'})],
  ['Late fill retains original causal binding','Historical owner alone does not grant current read']);
add('FX-07','Duplicate intent/transport ACK',[fact('PmaCapitalCommand',capital),fact('GrantProposal',{proposal_id:'proposal1',subject_user_id:identity.user_id,resource:{kind:'PORTFOLIO',id:'P1'},environment:'live',policy_revision:'p1',app_state:'APPLIED',ts_state:'PENDING',accepted_receipt_ref:null})],
  ['Same intent uses same idempotency key','Delivery ACK is not TS APPLIED','ACK follows durable commit']);
add('FX-08','Continuity and projection generations',[fact('StreamEnvelope',stream),fact('StreamEnvelope',{...stream,event_kind:'RESYNC_REQUIRED',source_continuity_epoch:'epoch2',entity_key:null,entity_revision:null,replacement_ref:null}),
  fact('StreamEnvelope',{...stream,event_kind:'TOMBSTONE',replacement_ref:null})],
  ['Epoch is not projection generation','Opaque cursor is not global ordering','Missing source interval requires resync']);
add('FX-09','Revoke across surfaces',[fact('Availability',{state:'DENIED',reason_code:'CURRENT_GRANT_REVOKED'}),fact('GrantProposal',{proposal_id:'proposal2',subject_user_id:identity.user_id,resource:{kind:'PORTFOLIO',id:'P1'},environment:'live',policy_revision:'p2',app_state:'APPLIED',ts_state:'UNKNOWN',accepted_receipt_ref:null})],
  ['Recheck before query, cache result, export and commit','Committed obligations and late facts remain retained']);
const posting=(posting_id,kind,amount)=>({posting_id,source_id:posting_id,internal_account_id:'C1',currency:'USDT',kind,amount,observed_at_ms:window.start_ms});
add('FX-10','Flows are not PnL',[fact('CashflowPosting',posting('o','OPENING','1000')),fact('CashflowPosting',posting('d','DEPOSIT','200')),fact('CashflowPosting',posting('w','WITHDRAWAL','300')),fact('CashflowPosting',posting('p','TRADING_PNL','0'))],
  ['Net balance 900 with PnL exactly zero','Flow-adjusted return requires its own methodology']);
add('FX-11','Decimals and equal amount dedupe',[fact('CashflowPosting',posting('d1','DEPOSIT','100')),fact('CashflowPosting',posting('d2','DEPOSIT','100')),fact('MetricCapsule',{...metric,value:'9007199254740993.000000000000000001'})],
  ['Two distinct source postings of 100 total 200','Duplicate source posting counts once','No float coercion or currency merging']);
add('FX-12','Resource profile is not measurement',[fact('ResourceMeasurement',{profile_ref:'test:bounded-profile',state:'NOT_MEASURED',cpu_cores:null,rss_bytes:null,receipt_ref:null,runtime_config_approved:false})],
  ['Fixture limits are not production budgets','Performance receipt remains NOT_RUN']);
add('FX-13','Full business manager, limited mutation',[fact('DelegationCeiling',ceiling),fact('ManagerPortfolio',manager)],
  ['Business read all is independent of technical secrets and delegation ceiling','No display-name authorization']);
add('FX-14','Restricted researcher schema',[fact('RestrictedPortfolio',restricted),fact('RestrictedPortfolio',{...restricted,nav:metric},false),fact('RestrictedPortfolio',{...restricted,total_portfolio_count:99},false)],
  ['No hidden totals, peers, finance sort or inferred denominator','Current verified owner links only']);
add('FX-15','Fleet currency/stage semantics',[fact('Binding',binding),fact('MetricCapsule',{...metric,economic_domain:'MIXED',value:null,availability:{state:'UNAVAILABLE',reason_code:'MIXED_ECONOMIC_DOMAINS'}})],
  ['All is navigation, never a financial stage','No mixed-domain NAV aggregate','Snapshot and policy bind paging']);
add('FX-16','Archive without liquidation',[fact('ArchiveDisposition',{resource:{kind:'DEPLOYMENT',id:'D1'},lifecycle:'ARCHIVE_REQUESTED',financial_stage:'LIVE',open_obligations:null,automatic_liquidation:false,paper_clone_resource:null,lineage_ref:null,clone_lineage:null}),
  fact('ArchiveDisposition',{resource:{kind:'DEPLOYMENT',id:'D1'},lifecycle:'ARCHIVED',financial_stage:'LIVE',open_obligations:0,automatic_liquidation:false,paper_clone_resource:{kind:'DEPLOYMENT',id:'PAPER_CLONE'},lineage_ref:'test:clone',clone_lineage:{origin_deployment_id:'D1',origin_alpha_version_id:'V1',clone_reason:'ARCHIVE_MONITOR',effective_at_ms:window.end_exclusive_ms,approved_config_digest:hash}})],
  ['Archive is lifecycle, not financial stage','Paper clone is a separate deployment with approved lineage/quota']);
add('FX-17','Funding buckets',[fact('CashflowPosting',posting('initial','OPENING','1000')),fact('CashflowPosting',posting('added','DEPOSIT','200')),fact('Availability',{state:'UNAVAILABLE',reason_code:'COHORT_PNL_METHODOLOGY_NOT_PUBLISHED'})],
  ['Initial/added/returned funds are flows','Do not invent lot PnL or turnover']);
add('FX-18','Raw vs contribution vs direct score',[fact('ScoreCapsule',score),fact('ScoreCapsule',raw('CONTRIBUTION')),fact('ScoreCapsule',raw('DIRECT_NAV'))],
  ['73.3 fair provisional is a synthetic numerical example','18.325 contribution has no quality band','Direct NAV score is not an average of child q']);
add('FX-19','Correction of original source',[fact('StreamEnvelope',{...stream,event_kind:'CORRECTION',event_id:'source:correction1',projection_generation:'portal:gen8'})],
  ['Restatement creates a new calculation revision','Bounded recomputation outside TS hot path']);
add('FX-20','Actual versus virtual and Canary/Live',[fact('Binding',binding),fact('Binding',{...binding,financial_stage:'LIVE'}),fact('Binding',{...binding,environment:'paper',financial_stage:'PAPER',economic_domain:'PAPER_SIMULATION',internal_account_id:'C_PAPER'})],
  ['Canary/Live on same actual account counted once','Paper/Sandbox NAV never added to actual']);
add('FX-21','Same-basis provisional windows',[fact('ScoreCapsule',score),fact('ScoreCapsule',{...score,economic_subject_ref:'A2:V2:P1',evidence_ref:'test:other-inputs'})],
  ['Same comparable_basis_id does not require same subject evidence ref','Short history cannot pretend to be 30 days','Maturity policy still requires config']);
add('FX-22','Missing constituent, available direct NAV',[fact('ManagerPortfolio',manager),fact('ScoreCapsule',{...pendingScore,kind:'COMPOSITION',status:'partial_coverage',reason_code:'RAW_Q_MISSING',bounds:{lower:'67.5',upper:'92.5',reason_code:'RAW_Q_MISSING'},score_coverage_allocated:'0.75',availability:{state:'PARTIAL',reason_code:'RAW_Q_MISSING'}})],
  ['Missing 25% q gives composition bounds [67.5,92.5], not a fabricated point','Direct NAV remains independently available','No substitution of composition for direct NAV']);
add('FX-23','Stress/cost absence and known zero',[fact('ScoreCapsule',{...pendingScore,status:'partial_costs',reason_code:'REQUIRED_FEES_MISSING',availability:{state:'PARTIAL',reason_code:'REQUIRED_FEES_MISSING'}}),fact('MetricCapsule',{...metric,metric_id:'turnover',value:'0'}),fact('ScoreCapsule',{...pendingScore,status:'partial_components',reason_code:'STRESS_NOTIONAL_MISSING',bounds:{lower:'65.175',upper:'77.675',reason_code:'STRESS_NOTIONAL_MISSING'},availability:{state:'PARTIAL',reason_code:'STRESS_NOTIONAL_MISSING'}})],
  ['Missing stress bounds [65.175,77.675] do not license a numeric total','Known zero differs from missing cost/notional','No weight renormalization']);
add('FX-24','Forward diagnostic versus actual duration',[fact('Binding',{...binding,financial_stage:'LIVE'}),fact('MetricCapsule',{...metric,metric_id:'actual_observation_days',unit:'DAYS',currency:null,value:'10'})],
  ['Paper40+Sandbox20+actual10 may describe70 days but actual duration remains10','Version/overlap/cashflow gaps invalidate combined basis']);
add('FX-25','Fixed bands and independent model outputs',[fact('ScorePolicy',{model_revision:'qbts_prb_v1_1',weights:{P:'0.45',R:'0.30',B:'0.25'},atomic_weights:{twr_excess:'0.315',period_sr:'0.135',mdd:'0.180',add:'0.120',positive_blocks:'0.125',stress_twr_excess:'0.125'},bands:scoreBands,runtime_config_state:'policy_pending',runtime_config_ref:null,manager_book_kind:'ANALYTICS_ONLY_NOT_ECONOMIC_ENTITY'}),fact('ScoreCapsule',{...raw('CONTRIBUTION'),quality_band:'fair'},false)],
  ['Band uses unrounded canonical value','Contribution never gets a quality band','No legacy HHI penalty or average-child fallback']);
export const fixturePack = {schema_version:'execution.v2-foundation-fixtures.v1',lane:'TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT',
  production_config:false,authority_schema:schema.$id,cases};
