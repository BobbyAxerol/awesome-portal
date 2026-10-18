import {z} from "zod";
const text=z.string().min(1).max(4096).refine(v=>!/[\u0000-\u001f\u007f]/u.test(v));
// `$` alone accepts a final newline in JS regexes. Exact public scalars
// must end at the actual string boundary, not before a trailing line break.
const decimal=z.string().max(96).regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$(?![\s\S])/);
const count=z.string().max(96).regex(/^(?:0|[1-9]\d*)$(?![\s\S])/);
const ms=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
// Fixed screen vocabulary, not a relation/source/operation selector.
export const LIVE_SOURCE_PANELS=["deployments","positions","sessions","orders","fills","accounts",
  "account_balances","margin_balances","account_sync","reconciliation"] as const;
export type LiveSourceReadQuery={panel?:unknown;cursor?:unknown};
const continuation=z.string().max(128).regex(/^lps2\.[A-Za-z0-9_-]{1,32}\.\d{1,8}\.\d{10}\.[A-Za-z0-9_-]{43}$(?![\s\S])/).nullable();
export const liveSourcePanelGrain=(key:string):"ACCOUNT"|"DEPLOYMENT"|"NOT_COMMISSIONED"=>
  key==="broker_sync"?"NOT_COMMISSIONED":
    ["accounts","account_balances","margin_balances","account_sync"].includes(key)?"ACCOUNT":"DEPLOYMENT";
/** Explicit source-owned scalars only. Missing key != null != exact zero.
 * Additional fields, nested source JSON and private identities are rejected.
 * Each key still needs the ORIGINAL dataset's reviewed field permission. */
export const liveSourceValues=z.object({
  deployment_id:text.nullable().optional(),strategy_id:text.nullable().optional(),account_id:text.nullable().optional(),portfolio_id:text.nullable().optional(),
  position_id:text.nullable().optional(),order_id:text.nullable().optional(),fill_id:text.nullable().optional(),instrument_id:text.nullable().optional(),
  venue:text.nullable().optional(),currency:text.nullable().optional(),base_currency:text.nullable().optional(),mode:z.literal("live").nullable().optional(),
  state:text.nullable().optional(),status:text.nullable().optional(),side:text.nullable().optional(),
  signed_qty:decimal.nullable().optional(),quantity:decimal.nullable().optional(),price:decimal.nullable().optional(),
  avg_px_open:decimal.nullable().optional(),avg_px_close:decimal.nullable().optional(),mark_price:decimal.nullable().optional(),
  notional:decimal.nullable().optional(),realized_pnl:decimal.nullable().optional(),unrealized_pnl:decimal.nullable().optional(),
  total:decimal.nullable().optional(),locked:decimal.nullable().optional(),free:decimal.nullable().optional(),
  initial:decimal.nullable().optional(),maintenance:decimal.nullable().optional(),
  submitted_count:count.nullable().optional(),risk_rejected_count:count.nullable().optional(),
  broker_rejected_count:count.nullable().optional(),filled_count:count.nullable().optional(),
  created_at_ms:ms.nullable().optional(),updated_at_ms:ms.nullable().optional(),trade_time_ms:ms.nullable().optional(),
}).strict();
export const liveSourcePanel=z.object({
  state:z.enum(["PARTIAL","NOT_PUBLISHED"]),
  reason_code:z.enum(["AUTHORIZED_RETAINED_OBSERVATIONS_ONLY","NO_AUTHORIZED_RETAINED_OBSERVATION",
    "SOURCE_PANEL_NOT_CAPTURED","DEPLOYMENT_GRAIN_NOT_PROVEN","BROKER_PURPOSE_NOT_COMMISSIONED"]),
  source_as_of_ms:z.null(),source_clock_reason:z.literal("SOURCE_CLOCK_NOT_SCOPED"),
  provenance:z.object({dataset_id:text.nullable(),purpose:z.enum(["alpha.read","account.read"]).nullable(),
    field_contract_revision:z.literal("portal.execution.live-source-fields.v2"),field_policy_ref:text.nullable(),
    projection_basis:z.literal("SAME_RETAINED_DOCUMENT"),source_revision:z.null(),source_cursor:z.null(),
    source_completeness:z.literal("UNKNOWN"),history_semantics:z.literal("BOUNDED_RETAINED_NOT_FULL_HISTORY")}).strict(),
  grain:z.enum(["ACCOUNT","DEPLOYMENT","NOT_COMMISSIONED"]),
  exact_total:z.null(),limit:z.literal(200),returned_count:ms.max(200),has_more:z.boolean(),
  next_cursor:continuation,previous_cursor:continuation,
  records:z.array(z.object({observation_id:z.string().regex(/^por1_[0-9a-f]{64}$(?![\s\S])/),values:liveSourceValues}).strict()).max(200),
}).strict().superRefine((p,c)=>{
  if(p.returned_count!==p.records.length||p.has_more!==(p.next_cursor!==null)||
    p.state==="NOT_PUBLISHED"&&(p.records.length!==0||p.has_more||p.previous_cursor!==null))
    c.addIssue({code:z.ZodIssueCode.custom,message:"LIVE_SOURCE_PANEL_INVALID"});
});
export const liveSourceOperationsRead=z.object({
  schema_version:z.literal("portal.execution.live-source-operations.v2"),
  workspace_id:text,environment:z.literal("live"),profile_id:text,deployment_id:text,
  record_authority:z.literal("PORTAL_RETAINED_OBSERVATION"),source_verdict:z.literal("NOT_ASSERTED"),
  visibility:z.literal("SCOPED"),coverage:z.literal("AUTHORIZED_ONLY"),observed_at_ms:ms,
  source_side_effect_requested:z.literal(false),runtime_activation_requested:z.literal(false),
  data:z.object({deployments:liveSourcePanel,positions:liveSourcePanel,sessions:liveSourcePanel,
    orders:liveSourcePanel,fills:liveSourcePanel,accounts:liveSourcePanel,account_balances:liveSourcePanel,
    margin_balances:liveSourcePanel,account_sync:liveSourcePanel,reconciliation:liveSourcePanel,broker_sync:liveSourcePanel}).strict(),
  runtime:z.object({state:z.null(),reason_code:z.literal("SOURCE_RUNTIME_ACTIVATION_NOT_ASSERTED")}).strict(),
  realtime:z.object({active:z.literal(false),reason_code:z.literal("FINITE_SCOPED_READ_NOT_STREAM_AUTHORITY")}).strict(),
  commands:z.object({enabled:z.literal(false),reason_code:z.literal("READ_NOT_COMMAND_AUTHORITY")}).strict(),
}).strict().superRefine((view,c)=>{
  for(const [key,panel] of Object.entries(view.data))
    if(panel.grain!==liveSourcePanelGrain(key))
      c.addIssue({code:z.ZodIssueCode.custom,path:["data",key,"grain"],message:"LIVE_SOURCE_PANEL_INVALID"});
});
export type LiveSourceOperationsRead=z.infer<typeof liveSourceOperationsRead>;
export type LiveSourcePanel=z.infer<typeof liveSourcePanel>;
