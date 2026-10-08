/** Additive native facts. Exact zero is allowed only in a published engine series. */
import {z} from 'zod';
const Decimal=z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(96);
const Cost=z.object({state:z.enum(['AVAILABLE','NOT_PUBLISHED']),total:Decimal.nullable(),
  reason_code:z.enum(['NATIVE_RESULT_SERIES_NOT_PUBLISHED']).nullable()}).strict().superRefine((v,c)=>{
  if((v.state==='AVAILABLE')!==(v.total!==null)||(v.state==='AVAILABLE')!==(v.reason_code===null))
    c.addIssue({code:z.ZodIssueCode.custom,message:'Native cost publication and payload disagree'});
});
export const ResearchNativeRouteResultSchema=z.object({schema_version:z.literal('research.native-route-result.v1'),
  execution_route:z.enum(['intrabar_bracket','reactive','event_driven']),
  authority:z.literal('PINNED_QUANTBT_ACCOUNTING_NOT_PORTAL_PNL'),
  input_protocol:z.enum(['DELTA_CLOSE_BRACKET_INTENTS_V1','DELTA_CLOSE_STATEFUL_CALLBACK_V1','DELTA_CLOSE_ORDER_COMMANDS_V1','DELTA_CLOSE_LIMIT_OCO_COMMANDS_V1']),
  clock:z.enum(['KNOWN_CLOSE_NEXT_BAR_INTRABAR','KNOWN_CLOSE_NEXT_BAR_CLOSE']),
  position_unit:z.literal('CONTRACT_QUANTITY'),target_notional:z.literal('2000'),
  fees:Cost,funding:Cost,cost_scope:z.literal('FULL_CHILD_TAPE'),
  fills_count:z.number().int().nonnegative().max(100000),orders_count:z.number().int().nonnegative().max(100000).nullable(),
  replay_authority:z.literal('RETAINED_ENGINE_AUDIT_ONLY_NOT_BROKER_EVENTS')}).strict().superRefine((v,c)=>{
  const protocol={intrabar_bracket:'DELTA_CLOSE_BRACKET_INTENTS_V1',
   reactive:'DELTA_CLOSE_STATEFUL_CALLBACK_V1',event_driven:'DELTA_CLOSE_ORDER_COMMANDS_V1'}[v.execution_route];
  const clock=v.execution_route==='intrabar_bracket'?'KNOWN_CLOSE_NEXT_BAR_INTRABAR':'KNOWN_CLOSE_NEXT_BAR_CLOSE';
  if((v.input_protocol!==protocol && !(v.execution_route==='event_driven'&&v.input_protocol==='DELTA_CLOSE_LIMIT_OCO_COMMANDS_V1'))||v.clock!==clock)
   c.addIssue({code:z.ZodIssueCode.custom,message:'Native route, protocol and execution clock disagree'});
});
