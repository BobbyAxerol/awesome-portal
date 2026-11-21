/** Canonical finite current-audit variants. No source/runtime commissioning. */
import {readFileSync,writeFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const str=(max=191)=>({type:"string",minLength:1,maxLength:max});
const id={type:"string",pattern:"^[A-Za-z0-9._:-]{1,191}$"};
const time={type:"string",format:"date-time",pattern:"Z$"};
const nullable=s=>({anyOf:[s,{type:"null"}]});
const count={type:"integer",minimum:0,maximum:Number.MAX_SAFE_INTEGER};
const enumeration=values=>({type:"string",enum:values});
const object=properties=>({type:"object",additionalProperties:false,required:Object.keys(properties),properties});
const ref=name=>({$ref:"#/$defs/"+name});
const target=object({type:enumeration(["ACCOUNT","PORTFOLIO","DEPLOYMENT"]),id});
const severity=enumeration(["INFO","WARNING","ERROR","CRITICAL"]);
const environment=enumeration(["PAPER","SANDBOX","LIVE"]);
const version={type:"integer",minimum:1,maximum:Number.MAX_SAFE_INTEGER};
const digest={type:"string",pattern:"^sha256:[0-9a-f]{64}$"};
const absent=reason=>object({state:{const:"UNAVAILABLE"},reason_code:{const:reason},source_side_effect_requested:{const:false}});

export function operationalCurrentSchemas(){
 const OperationalQueueItemV2=object({operation_id:id,operation_kind:{const:"EXECUTION_COMMAND"},
  command_key:{type:"string",minLength:1,maxLength:128,pattern:"^[a-z0-9-]+/(?:[a-z0-9-]+|<root>)$"},target,environment,
  risk_tier:enumeration(["R0_READ","R1_PAPER_MUTATION","R2_SANDBOX","R3_LIVE_PROTECTIVE","R4_LIVE_RISK_INCREASING","UNCLASSIFIED","BLOCKED"]),
  severity,source_authority:enumeration(["PORTAL","EXECUTION","BROKER"]),
  source_status:enumeration(["BLOCKED","PENDING","RUNNING","SUCCEEDED","FAILED","EXPIRED","UNCERTAIN"]),
  verification_result:enumeration(["NOT_STARTED","PENDING","SUCCEEDED","FAILED","PARTIAL","UNCERTAIN","DENIED","EXPIRED"]),
  triage_state:enumeration(["UNACKNOWLEDGED","ACKNOWLEDGED","RESOLVED"]),workflow_version:version,
  acknowledged_at:nullable(time),resolved_at:nullable(time),created_at:time,updated_at:time});
 OperationalQueueItemV2.description="Finite immutable Portal labels plus current local triage, not TS execution. Runtime additionally enforces nonnegative finite dates, updated>=created and the existing triage/timestamp shape. SQL retains six fractional UTC digits for exact keyset boundaries.";
 const linkHistory=object({availability:{const:"NOT_PUBLISHED"},reason_code:{const:"ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED"}});
 const OperationalIncidentLinkV2={oneOf:[
  object({state:{const:"LINKED"},incident_id:id,relationship:enumeration(["TRIGGERED_BY","MITIGATES","RELATED"]),linked_at:time,
   incident:object({target,environment,severity,workflow_state:enumeration(["OPEN","MITIGATED","RESOLVED"])}),link_history:linkHistory}),
  object({state:{const:"NOT_ATTESTED"},reason_code:{const:"INCIDENT_LINK_IDENTITY_NOT_REPRESENTABLE"},link_history:linkHistory})]};
 OperationalIncidentLinkV2.description="One current many-to-many link row (execution_incident_operation_links) to an incident whose OWN target tuple the caller is independently authorized for. LINKED publishes only incident id, relationship, link time and a minimal current-root summary (target, environment, severity, workflow_state); never title, prose, actors, evidence or counts. link_history is always the typed NOT_PUBLISHED / ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED absence: the link is a current pointer and does NOT attest the incident's target when the link was written. NOT_ATTESTED keeps the slot and the count for an authorized link whose id or time cannot be represented exactly; it is never dropped.";
 const OperationalIncidentLinksV2=object({basis:{const:"CURRENT_LINK_ROWS_AUTHORIZED_INCIDENTS_ONLY"},bound:{const:3},authorized_link_count:count,
  truncated:{type:"boolean"},items:{type:"array",maxItems:3,items:ref("OperationalIncidentLinkV2")}});
 OperationalIncidentLinksV2.description="FE-042. Per operation, at most 3 links, newest link first (link time descending, then incident id descending in byte order). BOTH ends must be authorized for the caller: the operation row is inside the minted audit scope AND the incident's own target/environment tuple is inside the SAME minted scope; operation access never implies incident access and no incident is picked as 'the' incident. Links to incidents outside the scope are omitted AND not counted, so an empty or short list never proves that no other incident exists; authorized_link_count counts only authorized links and truncated is true exactly when it exceeds items.length. Incident target types outside ACCOUNT/PORTFOLIO/DEPLOYMENT are never authorizable here. Read in the same repeatable-read snapshot as the page. Runtime additionally enforces items.length==min(authorized_link_count,3), truncated, and unique incident ids.";
 const countsObject=values=>object(Object.fromEntries(values.map(v=>[v,count])));
 const statusDimension=values=>object({own_filter_applied:{type:"boolean"},total:count,counts:countsObject(values)});
 const triageStates=["UNACKNOWLEDGED","ACKNOWLEDGED","RESOLVED"],verificationResults=["NOT_STARTED","PENDING","SUCCEEDED","FAILED","PARTIAL","UNCERTAIN","DENIED","EXPIRED"],
  sourceStatuses=["BLOCKED","PENDING","RUNNING","SUCCEEDED","FAILED","EXPIRED","UNCERTAIN"],severities=["INFO","WARNING","ERROR","CRITICAL"];
 const OperationalStatusCountsV2=object({basis:{const:"SAME_SNAPSHOT_AUTHORIZED_SCOPE_AND_FILTERS_EXCLUDING_OWN_DIMENSION"},
  succeeded_means:{const:"PORTAL_QUEUE_RECORD_STATE_ONLY"},dimensions:object({triage_state:statusDimension(triageStates),
   verification_result:statusDimension(verificationResults),source_status:statusDimension(sourceStatuses),severity:statusDimension(severities)})});
 OperationalStatusCountsV2.description="FE-043. Server-counted status distribution over the SAME repeatable-read snapshot, minted audit scope and applied filters as total_count, filtered_count and the page rows; not page rows and not separate status calls. Supported dimensions are exactly triage_state, verification_result, source_status and severity, each zero-filled over its closed domain. Each dimension counts the authorized set under every applied filter EXCEPT its own (own filter ignored so a selected KPI tile still shows its siblings); own_filter_applied says whether such a filter was dropped. Therefore: with no own filter, total equals filtered_count; with one, counts[selected value] (zero for a value outside the closed domain) equals filtered_count and total>=filtered_count; always total<=total_count and sum(counts)==total. Counts ignore cursor, limit and sort. 'SUCCEEDED' (source_status or verification_result) is the Portal queue record's state only (succeeded_means): it is NOT financial APPLIED, NOT projection convergence and NOT venue success; no source, projection or venue claim is made. environment, target_type, target_id and command_key are filters but not count dimensions. Runtime additionally enforces these arithmetic invariants.";
 const deliveryStates=["NOT_APPLICABLE","AWAITING_RECEIPT","RECEIPT_CONFIRMED","RECEIPT_FAILED"],displayStates=["CURRENT","CATCHING_UP","STALE"];
 const OperationalHealthCountV2=object({count:nullable(count),observed_at:nullable(time),coverage:enumeration(["COMPLETE","PARTIAL","UNKNOWN"])});
 OperationalHealthCountV2.description="FE-CAT-2. One health count with its own observation time and coverage. count is an integer or null: null means the owning source did not report it (not computable), 0 is a counted zero. count null requires observed_at null and coverage UNKNOWN; a number requires observed_at and coverage COMPLETE or PARTIAL. PARTIAL means some authorized filtered rows did not report the axis, so the number is a floor, never a total. observed_at is when the Portal counted it inside the page snapshot, not a source clock. Runtime additionally enforces that the two row-derived counts are <= page.filtered_count.";
 const OperationalQueueHealthV2=object({basis:{const:"SAME_SNAPSHOT_AUTHORIZED_SCOPE_AND_FILTERS"}});
 OperationalQueueHealthV2.required=["basis"];
 OperationalQueueHealthV2.properties.pending_receipt_count=ref("OperationalHealthCountV2");
 OperationalQueueHealthV2.properties.display_lag_count=ref("OperationalHealthCountV2");
 OperationalQueueHealthV2.properties.open_exception_count=ref("OperationalHealthCountV2");
 OperationalQueueHealthV2.description="FE-CAT-2. OPTIONAL additive queue health, counted inside the SAME repeatable-read snapshot, minted audit scope and applied filters as total_count, filtered_count and the page rows (the whole authorized filtered set, never the loaded rows; rows the caller may not see are never counted). A key that is OMITTED means this producer has no owning source for it (the reader prints 'Not published', never 0). pending_receipt_count = rows whose delivery_state is AWAITING_RECEIPT; display_lag_count = rows whose display_state is CATCHING_UP; open_exception_count = open exceptions the owning source counts for the same authorized scope. Absent on a server that predates it.";
 const rowProperties={...OperationalQueueItemV2.properties,incident_links:ref("OperationalIncidentLinksV2"),
  delivery_state:nullable(enumeration(deliveryStates)),display_state:nullable(enumeration(displayStates))};
 const OperationalQueueRowV2={type:"object",additionalProperties:false,required:OperationalQueueItemV2.required,properties:rowProperties,
  description:"OperationalQueueItemV2 plus the OPTIONAL additive FE-042 incident_links and FE-CAT-2 delivery_state / display_state axes (each nullable: null = the owning source did not report it; omitted = this producer has no owning source); absent on a server that predates them. A current server always sends it (possibly with zero authorized links). The workflow detail keeps the unextended item."};
 const page=object({rows:{type:"array",maxItems:250,items:ref("OperationalQueueRowV2")},total_count:count,filtered_count:count,
  next_cursor:nullable(str(4096)),prev_cursor:nullable(str(4096)),has_more:{type:"boolean"},has_previous:{type:"boolean"},
  applied_filters:{type:"array",maxItems:10,items:object({field:{type:"string",maxLength:64},op:{const:"eq"},value:{type:"string",maxLength:256}})},
  applied_sort:{type:"array",maxItems:2,items:object({field:enumeration(["created_at","operation_id"]),direction:enumeration(["asc","desc"])})}});
 page.properties.status_counts=ref("OperationalStatusCountsV2");
 page.properties.health=ref("OperationalQueueHealthV2");
 const OperationalQueueV2=object({schema_version:{const:"portal.execution.operational-queue.v2"},workspace_id:{type:"string",minLength:3,maxLength:96},
  record_authority:{const:"PORTAL"},record_basis:{const:"PORTAL_CURRENT_OPERATIONAL_WORKFLOW"},coverage:{const:"AUTHORIZED_SUPPORTED_TARGETS_ONLY"},
  supported_target_types:{type:"array",prefixItems:[{const:"ACCOUNT"},{const:"PORTFOLIO"},{const:"DEPLOYMENT"}],items:false,minItems:3,maxItems:3},
  source_integration_state:{const:"UNAVAILABLE"},source_side_effect_requested:{const:false},source_as_of_ms:{type:"null"},observed_at_ms:count,
  read_truth:object({state:enumeration(["AVAILABLE","EMPTY"]),reason_code:nullable({type:"string"}),scope:{const:"REQUEST"}}),page});
 OperationalQueueV2.description="Counts are scoped BEFORE filters/page/sort/edge probes to current supported audit tuples. Nonzero authority with zero rows is EMPTY; no authority is404. Runtime additionally enforces total>=filtered>=page rows, exact read_truth, and has_more/previous iff their opaque cursor is nonnull. Bound1MiB. No ADMIN/read_all/creator bypass or actor/prose/source journal disclosure. Optional additive amendment (FE-042/FE-043): rows may carry incident_links and page may carry status_counts, both read in the same repeatable-read snapshot; see OperationalIncidentLinksV2 and OperationalStatusCountsV2. Queue SUCCEEDED is a Portal queue-record state, not financial APPLIED, projection convergence or venue success.";
 const OperationalWorkflowV2=object({schema_version:{const:"portal.execution.operational-workflow.v2"},
  family:{const:"F0_BACKED_PORTAL_WORKFLOW"},record_authority:{const:"PORTAL"},source_side_effect_requested:{const:false},
  provenance_basis:enumeration(["SQL_EXACT_SOURCE_TIMESTAMP","LEGACY_DATE_MILLISECOND_COPY"]),
  observed_at_ms:count,operation:ref("OperationalQueueItemV2"),intent:ref("F0BlockedOperationRead")});
 OperationalWorkflowV2.description="Actual immutable workspace/id/key/target/environment/source queue-F0 join, not inferred family. provenance_basis distinguishes exact SQL timestamp copy from the existing writer's historical JS Date millisecond truncation (not arbitrary tolerance); historical bytes are not rewritten. Different author with full exact current audit is allowed; explicit F0 routes retain their own-author ceiling. Runtime additionally enforces operation ids equal; original planning expiry is not read expiry.";
 const OperationalIncidentCurrentV2=object({schema_version:{const:"portal.execution.incident-current-root.v2"},record_authority:{const:"PORTAL"},
  record_basis:{const:"CURRENT_ROOT_NOT_HISTORICAL_LINEAGE"},incident_id:id,workspace_id:{type:"string",minLength:3,maxLength:96},target,environment,severity,
  workflow_state:enumeration(["OPEN","MITIGATED","RESOLVED"]),workflow_version:version,acknowledged_at:nullable(time),mitigated_at:nullable(time),
  resolved_at:nullable(time),created_at:time,updated_at:time,observed_at_ms:count,source_integration_state:{const:"UNAVAILABLE"},
  source_side_effect_requested:{const:false},deployment_resume_requested:{const:false},
  historical_children:object({availability:{const:"NOT_PUBLISHED"},reason_code:{const:"ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED"}})});
 OperationalIncidentCurrentV2.description="Current Portal root only; target/env/version rechecked before final authority. Forward target guard never attests old annotations/evidence/links/actors or counts. MITIGATED/RESOLVED are local triage, not broker safety. Runtime additionally enforces finite ordered dates and lifecycle timestamp shape.";
 const composition=(field,body,surface)=>object({schema_version:{const:"execution.operational-composition.v1"},
  logical_operation_id:{const:"executionOperational"+surface+"V1"},record_authority:{const:"PORTAL_CONTROL"},source_authority:{const:"PORTAL_CONTROL_ONLY"},
  workspace_id:{type:"string",minLength:3,maxLength:96},read_at_ms:count,read_at:time,composite_revision:digest,
  source_health:{...absent("CURRENT_AUDIT_SOURCE_PURPOSE_NOT_QUALIFIED"),required:["input_digest","state","reason_code","source_side_effect_requested"],
    properties:{input_digest:digest,...absent("CURRENT_AUDIT_SOURCE_PURPOSE_NOT_QUALIFIED").properties}},
  redacted_command_journal:{...absent("CURRENT_AUDIT_SOURCE_PURPOSE_NOT_QUALIFIED"),required:["digest","state","reason_code","source_side_effect_requested"],
    properties:{digest,...absent("CURRENT_AUDIT_SOURCE_PURPOSE_NOT_QUALIFIED").properties}},
  canary_twin_comparison:absent("E5_CANARY_TWIN_COMPARISON_NOT_QUALIFIED"),
  command_authority:object({state:{const:"UNCHANGED_FAIL_CLOSED"},source_side_effect_requested:{const:false}}),
  lineage:object({source_health_input_digest:digest,command_journal_digest:digest,workflow_digest:digest,formula_version:{const:"execution.operational-composition.v1"}}),
  data:object({[field]:ref(body)})});
 return {OperationalQueueItemV2,OperationalIncidentLinkV2,OperationalIncidentLinksV2,OperationalStatusCountsV2,OperationalHealthCountV2,OperationalQueueHealthV2,OperationalQueueRowV2,OperationalQueueV2,OperationalWorkflowV2,OperationalIncidentCurrentV2,
  OperationalQueueCompositionV2:composition("operations_queue","OperationalQueueV2","OperationsQueue"),
  OperationalIncidentCompositionV2:composition("incident","OperationalIncidentCurrentV2","IncidentDetail")};
}

function response(schema,description){const headers={"Cache-Control":{schema:{const:"private, no-store"}}};
 const result={"200":{description,headers,content:{"application/json":{schema}}}};
 for(const status of [400,401,403,404,409,503])result[status]={headers,description:
  status===400?"Strict input/cursor invalid or unsupported assigned_to filter; contextual refusal fenced after current authority.":
   status===404?"Uniform missing/hidden operational record or no usable current audit authority.":
    status===409?"Current authority/cursor/incident root changed; refresh without legacy fallback.":
     status===503?"Fixed unqualified/not-configured/integrity/byte/census unavailable; never raw provider/SQL/prose or false empty.":"Authenticated current Portal session/authority required.",
  content:{"application/json":{schema:{$ref:"execution-trusted-commands.openapi.json#/components/schemas/CommandProblem"}}}};
 return result;
}
export function updateOperationalPaths(api){
 const path="/api/v1/execution/operations",get=api.paths[path].get;
 get.description="Sticky current Core mode is selected before strict parsing. Legacy v1 remains separate. V2 requires complete current TS-accepted audit tuples ACCOUNT/PORTFOLIO/DEPLOYMENT per environment BEFORE SQL counts/page; USER/ADMIN are not grants. Source journal unavailable, no mutation. assigned_to is unsupported in V2 (400), not ignored. Existing limit1..250 and both cursor directions preserved; optional target_id narrows the query. Additive and optional in the V2 body: rows[].incident_links (FE-042, at most 3 authorized links per operation, both ends independently authorized) and page.status_counts (FE-043, triage_state/verification_result/source_status/severity counted over the same snapshot, scope and filters as the page, each dimension ignoring its own filter). SUCCEEDED in the queue is not financial APPLIED, projection convergence or venue success.";
 get.parameters.push(...(!get.parameters.some(p=>p.name==="target_id")?[{name:"target_id",in:"query",required:false,schema:id}]:[]));
 get.responses=response({oneOf:[{$ref:"../schemas/execution-operations.v1.schema.json#/$defs/OperationQueueResponse"},
  {$ref:"../schemas/execution-operations.v1.schema.json#/$defs/OperationalQueueV2"}]},"Legacy Portal queue OR finite current-audit V2 cohort, never a global/source completeness claim.");
 const incident=api.paths["/api/v1/execution/operations/incidents/{incident_id}"].get;
 incident.description="Legacy detail remains separate. SCOPED_V2 publishes only current finite Portal root under current exact audit; original children are NOT_PUBLISHED. No title/prose/actors/evidence hashes/counts loaded. No mutation or source side effects.";
 incident.responses=response({oneOf:[{$ref:"../schemas/execution-operations.v1.schema.json#/$defs/IncidentDetail"},
  {$ref:"../schemas/execution-operations.v1.schema.json#/$defs/OperationalIncidentCurrentV2"}]},"Legacy incident OR finite authorized current root.");
}
export function operationalCurrentFixture(){
 const old=JSON.parse(readFileSync(resolve(root,"fixtures/execution-command-operation.valid.json"),"utf8"));
 const item={operation_id:old.operation_id,operation_kind:"EXECUTION_COMMAND",command_key:old.command_key,
  target:{type:"ACCOUNT",id:"acc_TEST_ONLY_operational"},environment:"PAPER",risk_tier:"BLOCKED",severity:"WARNING",
  source_authority:"PORTAL",source_status:"BLOCKED",verification_result:"NOT_STARTED",triage_state:"UNACKNOWLEDGED",workflow_version:1,
  acknowledged_at:null,resolved_at:null,created_at:old.created_at,updated_at:old.updated_at};
 return {lane:"TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT",runtime_qualified:false,
  queue:{schema_version:"portal.execution.operational-queue.v2",workspace_id:"ws_TEST_ONLY_operational",record_authority:"PORTAL",
   record_basis:"PORTAL_CURRENT_OPERATIONAL_WORKFLOW",coverage:"AUTHORIZED_SUPPORTED_TARGETS_ONLY",supported_target_types:["ACCOUNT","PORTFOLIO","DEPLOYMENT"],
   source_integration_state:"UNAVAILABLE",source_side_effect_requested:false,source_as_of_ms:null,observed_at_ms:0,
   read_truth:{state:"AVAILABLE",reason_code:null,scope:"REQUEST"},page:{rows:[item],total_count:1,filtered_count:1,next_cursor:null,prev_cursor:null,
    has_more:false,has_previous:false,applied_filters:[],applied_sort:[{field:"created_at",direction:"desc"},{field:"operation_id",direction:"desc"}]}},
  workflow:{schema_version:"portal.execution.operational-workflow.v2",family:"F0_BACKED_PORTAL_WORKFLOW",record_authority:"PORTAL",source_side_effect_requested:false,
   provenance_basis:"SQL_EXACT_SOURCE_TIMESTAMP",
   observed_at_ms:0,operation:item,intent:old},
  incident:{schema_version:"portal.execution.incident-current-root.v2",record_authority:"PORTAL",record_basis:"CURRENT_ROOT_NOT_HISTORICAL_LINEAGE",
   incident_id:"inc_TEST_ONLY_operational",workspace_id:"ws_TEST_ONLY_operational",target:item.target,environment:"PAPER",severity:"WARNING",
   workflow_state:"OPEN",workflow_version:1,acknowledged_at:null,mitigated_at:null,resolved_at:null,created_at:old.created_at,updated_at:old.updated_at,observed_at_ms:0,
   source_integration_state:"UNAVAILABLE",source_side_effect_requested:false,deployment_resume_requested:false,
   historical_children:{availability:"NOT_PUBLISHED",reason_code:"ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED"}}};
}
export function synchronizeOperationalFixture(check){
 const path=resolve(root,"fixtures/execution-operational-current.synthetic.valid.json"),bytes=JSON.stringify(operationalCurrentFixture(),null,2)+"\n";
 if(check){if(readFileSync(path,"utf8")!==bytes)throw new Error("Current operational fixture drift");}else writeFileSync(path,bytes);
 synchronizeOperationalLinksCountsFixture(check);
 synchronizeOperationalHealthFixture(check);
}
export const operationalLinksCountsFixtureName="execution-operational-queue-links-counts.synthetic.valid.json";
/** Additive FE-042/FE-043 example. Separate from the L0 fixture, whose meaning is unchanged. Row states
 * exercise a 4-link truncation, a NOT_ATTESTED slot and an operation with no authorized link. */
export function operationalLinksCountsFixture(){
 const base=operationalCurrentFixture().queue,item=base.page.rows[0],history={availability:"NOT_PUBLISHED",reason_code:"ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED"};
 const linked=(incident,relationship,at,state)=>({state:"LINKED",incident_id:incident,relationship,linked_at:at,
  incident:{target:item.target,environment:"PAPER",severity:"WARNING",workflow_state:state},link_history:history});
 const links=(authorized,items)=>({basis:"CURRENT_LINK_ROWS_AUTHORIZED_INCIDENTS_ONLY",bound:3,authorized_link_count:authorized,truncated:authorized>items.length,items});
 const row=(suffix,triage,verification,status,incident_links)=>({...item,operation_id:"op_TEST_ONLY_links_"+suffix,severity:"WARNING",
  source_status:status,verification_result:verification,triage_state:triage,risk_tier:"R2_SANDBOX",
  acknowledged_at:triage==="UNACKNOWLEDGED"?null:"2026-08-22T12:05:00Z",resolved_at:triage==="RESOLVED"?"2026-08-22T12:10:00Z":null,
  updated_at:triage==="RESOLVED"?"2026-08-22T12:10:00Z":item.updated_at,incident_links});
 const zero=values=>Object.fromEntries(values.map(v=>[v,0]));
 const dimension=(values,own,counts)=>({own_filter_applied:own,total:Object.values(counts).reduce((a,b)=>a+b,0),counts:{...zero(values),...counts}});
 const rows=[
  row("a","RESOLVED","SUCCEEDED","SUCCEEDED",links(4,[
   linked("inc_TEST_ONLY_links_4","RELATED","2026-08-22T12:09:00.000004Z","OPEN"),linked("inc_TEST_ONLY_links_3","MITIGATES","2026-08-22T12:08:00.000003Z","MITIGATED"),
   linked("inc_TEST_ONLY_links_2","TRIGGERED_BY","2026-08-22T12:07:00.000002Z","RESOLVED")])),
  row("b","ACKNOWLEDGED","UNCERTAIN","UNCERTAIN",links(2,[linked("inc_TEST_ONLY_links_1","TRIGGERED_BY","2026-08-22T12:06:00.000001Z","OPEN"),
   {state:"NOT_ATTESTED",reason_code:"INCIDENT_LINK_IDENTITY_NOT_REPRESENTABLE",link_history:history}])),
  row("c","UNACKNOWLEDGED","PENDING","PENDING",links(0,[]))];
 const queue={...base,page:{...base.page,rows,total_count:6,filtered_count:3,
  applied_filters:[{field:"severity",op:"eq",value:"WARNING"}],
  status_counts:{basis:"SAME_SNAPSHOT_AUTHORIZED_SCOPE_AND_FILTERS_EXCLUDING_OWN_DIMENSION",succeeded_means:"PORTAL_QUEUE_RECORD_STATE_ONLY",dimensions:{
   triage_state:dimension(["UNACKNOWLEDGED","ACKNOWLEDGED","RESOLVED"],false,{UNACKNOWLEDGED:1,ACKNOWLEDGED:1,RESOLVED:1}),
   verification_result:dimension(["NOT_STARTED","PENDING","SUCCEEDED","FAILED","PARTIAL","UNCERTAIN","DENIED","EXPIRED"],false,{SUCCEEDED:1,UNCERTAIN:1,PENDING:1}),
   source_status:dimension(["BLOCKED","PENDING","RUNNING","SUCCEEDED","FAILED","EXPIRED","UNCERTAIN"],false,{SUCCEEDED:1,UNCERTAIN:1,PENDING:1}),
   severity:dimension(["INFO","WARNING","ERROR","CRITICAL"],true,{INFO:1,WARNING:3,ERROR:1,CRITICAL:1})}}}};
 return {lane:"TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT",runtime_qualified:false,queue};
}
export function synchronizeOperationalLinksCountsFixture(check){
 const path=resolve(root,"fixtures/"+operationalLinksCountsFixtureName),bytes=JSON.stringify(operationalLinksCountsFixture(),null,2)+"\n";
 if(check){if(readFileSync(path,"utf8")!==bytes)throw new Error("Operational links/counts fixture drift");}else writeFileSync(path,bytes);
}
export const operationalHealthFixtureName="execution-operational-queue-health.synthetic.valid.json";
/** Additive FE-CAT-2 example, separate from the L0 fixture. Three authorized filtered rows, each reporting both axes:
 * one awaiting a receipt (pending 1, COMPLETE), none catching up (display lag a counted ZERO, COMPLETE), and an
 * open-exception count the owning source did not report (null, UNKNOWN). */
export function operationalHealthFixture(){
 const base=operationalCurrentFixture().queue,item=base.page.rows[0];
 const row=(suffix,delivery,display,source,verification)=>({...item,operation_id:"op_TEST_ONLY_health_"+suffix,
  source_status:source,verification_result:verification,delivery_state:delivery,display_state:display});
 const rows=[row("a","RECEIPT_CONFIRMED","CURRENT","SUCCEEDED","SUCCEEDED"),row("b","AWAITING_RECEIPT","CURRENT","PENDING","PENDING"),
  row("c","NOT_APPLICABLE","CURRENT","BLOCKED","NOT_STARTED")];
 const at="2026-08-22T12:00:00Z";
 const queue={...base,page:{...base.page,rows,total_count:5,filtered_count:3,
  health:{basis:"SAME_SNAPSHOT_AUTHORIZED_SCOPE_AND_FILTERS",
   pending_receipt_count:{count:1,observed_at:at,coverage:"COMPLETE"},
   display_lag_count:{count:0,observed_at:at,coverage:"COMPLETE"},
   open_exception_count:{count:null,observed_at:null,coverage:"UNKNOWN"}}}};
 return {lane:"TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT",runtime_qualified:false,queue};
}
export function synchronizeOperationalHealthFixture(check){
 const path=resolve(root,"fixtures/"+operationalHealthFixtureName),bytes=JSON.stringify(operationalHealthFixture(),null,2)+"\n";
 if(check){if(readFileSync(path,"utf8")!==bytes)throw new Error("Operational health fixture drift");}else writeFileSync(path,bytes);
}
