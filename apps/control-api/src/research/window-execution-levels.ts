import {ACTIVE_LEVEL_POLICY,type WindowExecutionRow} from "./window-execution.contract";

/** Public DTO only: do not mutate, reseal or replace the retained source row. */
export function normalizeWindowActiveLevels(row:WindowExecutionRow){
  if(row.kind!=="OBSERVATION")return row;
  const zero=(value:string)=>/^-?0(?:\.0+)?$/.test(value);
  const level=(source:string|null)=>{
    if(zero(row.payload.accepted_position))return {value:null,state:"NOT_APPLICABLE" as const,reason_code:"POSITION_FLAT" as const,source_value:source};
    if(source===null)return {value:null,state:"NOT_PUBLISHED" as const,reason_code:"SOURCE_FIELD_NOT_PUBLISHED" as const,source_value:source};
    if(zero(source))return {value:null,state:"NOT_APPLICABLE" as const,reason_code:"ENGINE_ACTIVE_LEVEL_NOT_SET" as const,source_value:source};
    if(source.startsWith("-"))return {value:null,state:"NOT_PUBLISHED" as const,reason_code:"SOURCE_ACTIVE_LEVEL_NON_POSITIVE" as const,source_value:source};
    return {value:source,state:"AVAILABLE" as const,reason_code:null,source_value:source};
  };
  const {value:stop,...stopFact}=level(row.payload.active_stop);
  const {value:takeProfit,...takeProfitFact}=level(row.payload.active_take_profit);
  return {...row,payload:{...row.payload,active_stop:stop,active_take_profit:takeProfit,
    active_level_availability:{policy_id:ACTIVE_LEVEL_POLICY,origin:"PORTAL_NORMALIZED" as const,
      source_ref:"RETAINED_WINDOW_OBSERVATION_PAYLOAD" as const,active_stop:stopFact,active_take_profit:takeProfitFact}}};
}
