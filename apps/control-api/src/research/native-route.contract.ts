/** Additive native facts. Exact zero is allowed only in a published engine series. */
import {z} from 'zod';
const Decimal=z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(96);
const Cost=z.object({state:z.enum(['AVAILABLE','NOT_PUBLISHED']),total:Decimal.nullable(),
  reason_code:z.enum(['NATIVE_RESULT_SERIES_NOT_PUBLISHED']).nullable()}).strict().superRefine((v,c)=>{
  if((v.state==='AVAILABLE')!==(v.total!==null)||(v.state==='AVAILABLE')!==(v.reason_code===null))
    c.addIssue({code:z.ZodIssueCode.custom,message:'Native cost publication and payload disagree'});
});
export const NativeOptimizationSchema=z.object({schema_version:z.literal('research.native-optimization.v1'),
  authority:z.literal('PINNED_QUANTBT_NATIVE_IS_SHARPE'),scope:z.literal('P08_WARMUP_PLUS_IS_ONLY'),objective_name:z.literal('sharpe'),
  selection_method:z.literal('QUANTBT_GENERIC_ROBUST_PLATEAU_NOT_SCALAR_WFO_V1'),
  requested_trials:z.number().int().min(2).max(400),completed_trials:z.number().int().min(1).max(400),
  retained_trials:z.number().int().min(1).max(400),distinct_parameter_sets:z.number().int().min(1).max(400),
  selected_trial_number:z.number().int().nonnegative().max(399),selected_parameters:z.record(Decimal),selected_objective:Decimal,
  train_start_utc_ms:z.number().int().nonnegative(),train_end_exclusive_utc_ms:z.number().int().nonnegative(),holdout_used:z.literal(false),
  table_kind:z.literal('native_optimizer_trials'),table_schema_version:z.literal('research.native-optimizer-trial-table.v1'),
  sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict().superRefine((v,c)=>{
    if(v.retained_trials>v.requested_trials||v.completed_trials>v.retained_trials||v.distinct_parameter_sets>v.retained_trials
      ||v.selected_trial_number>=v.retained_trials||v.train_start_utc_ms>=v.train_end_exclusive_utc_ms)
      c.addIssue({code:z.ZodIssueCode.custom,message:'Native optimization scope/population/selection disagree'});
  });
export const ResearchNativeRouteResultSchema=z.object({schema_version:z.literal('research.native-route-result.v1'),
  execution_route:z.enum(['intrabar_bracket','reactive','event_driven']),
  authority:z.literal('PINNED_QUANTBT_ACCOUNTING_NOT_PORTAL_PNL'),
  input_protocol:z.enum(['DELTA_CLOSE_BRACKET_INTENTS_V1','DELTA_CLOSE_STATEFUL_CALLBACK_V1','DELTA_CLOSE_ORDER_COMMANDS_V1','DELTA_CLOSE_LIMIT_OCO_COMMANDS_V1','DELTA_CLOSE_MULTICYCLE_LIMIT_OCO_COMMANDS_V1']),
  clock:z.enum(['KNOWN_CLOSE_NEXT_BAR_INTRABAR','KNOWN_CLOSE_NEXT_BAR_CLOSE']),
  position_unit:z.literal('CONTRACT_QUANTITY'),target_notional:z.literal('2000'),
  fees:Cost,funding:Cost,cost_scope:z.literal('FULL_CHILD_TAPE'),
  fills_count:z.number().int().nonnegative().max(100000),orders_count:z.number().int().nonnegative().max(100000).nullable(),
  replay_authority:z.literal('RETAINED_ENGINE_AUDIT_ONLY_NOT_BROKER_EVENTS'),optimization:NativeOptimizationSchema.optional()}).strict().superRefine((v,c)=>{
  const protocol={intrabar_bracket:'DELTA_CLOSE_BRACKET_INTENTS_V1',
   reactive:'DELTA_CLOSE_STATEFUL_CALLBACK_V1',event_driven:'DELTA_CLOSE_ORDER_COMMANDS_V1'}[v.execution_route];
  const clock=v.execution_route==='intrabar_bracket'?'KNOWN_CLOSE_NEXT_BAR_INTRABAR':'KNOWN_CLOSE_NEXT_BAR_CLOSE';
  if((v.input_protocol!==protocol && !(v.execution_route==='event_driven'&&['DELTA_CLOSE_LIMIT_OCO_COMMANDS_V1','DELTA_CLOSE_MULTICYCLE_LIMIT_OCO_COMMANDS_V1'].includes(v.input_protocol)))||v.clock!==clock)
   c.addIssue({code:z.ZodIssueCode.custom,message:'Native route, protocol and execution clock disagree'});
  if((v.input_protocol==='DELTA_CLOSE_MULTICYCLE_LIMIT_OCO_COMMANDS_V1')!==(v.optimization!==undefined))
    c.addIssue({code:z.ZodIssueCode.custom,message:'Multi-cycle optimizer source requires its typed selection receipt'});
});
