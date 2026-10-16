import {z} from "zod";
import {scopedAdapterFieldsSchema} from "./profile-adapter.contract";
const text=z.string().min(1).refine(value=>[...value].length<=256&&!/[\u0000-\u001f\u007f]/u.test(value));
const count=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const cursor=z.string().min(1).max(4096).regex(/^[A-Za-z0-9._-]+$(?![\s\S])/).nullable();
export const scopedSubjectActivitySchema=z.object({
  schema_version:z.literal("portal.execution.subject-records.v2"),
  logical_operation_id:z.enum(["executionAlphaOrdersV1","executionAlphaFillsV1","executionAccountOrdersV1","executionAccountFillsV1"]),
  authority:z.literal("PORTAL_SGP_RETAINED_CURRENT_WINDOW"),source_authority:z.literal("TRADING_SYSTEM_CURRENT_SOURCE"),
  history_semantics:z.literal("RETAINED_PORTAL_CURRENT_WINDOW_NOT_AUTHORITATIVE_REPLAY"),environment:z.enum(["paper","sandbox","live"]),profile_id:text,
  resource:z.object({kind:z.enum(["alpha","account"]),id:text}).strict(),
  read_scope:z.object({visibility:z.literal("SCOPED"),coverage:z.literal("AUTHORIZED_ONLY"),policy_revision:text}).strict(),
  state:z.enum(["EMPTY","PARTIAL"]),reason_code:z.literal("SCOPED_RETAINED_WINDOW_NOT_TOTAL_HISTORY"),
  coverage:z.object({retained_row_count:count,oldest_observed_at_ms:count.nullable(),newest_observed_at_ms:count.nullable()}).strict(),
  page:z.object({limit:count.min(1).max(500),maximum_page_rows:z.literal(500),returned_count:count.max(500),has_more:z.boolean(),next_cursor:cursor}).strict(),
  records:z.array(z.object({record_id:text,observed_at_ms:count,values:scopedAdapterFieldsSchema}).strict()).max(500),
}).strict().superRefine((value,ctx)=>{
  if(value.records.length!==value.page.returned_count||value.page.returned_count>value.page.limit||
    value.page.returned_count>value.coverage.retained_row_count||value.page.has_more!==(value.page.next_cursor!==null)||
    (value.state==="EMPTY")!==(value.coverage.retained_row_count===0))
    ctx.addIssue({code:"custom",message:"Inconsistent scoped page."});
});
