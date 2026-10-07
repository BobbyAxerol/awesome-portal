import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {normalizeWindowActiveLevels} from "../src/research/window-execution-levels";
import {WindowExecutionRowSchema,WindowExecutionReadRowSchema,WindowObservationSchema} from "../src/research/window-execution.contract";
import {sha256ResearchJson} from "../src/research/preflight.service";
import {openApiValidator} from "./research-rf05-openapi";

const observation=(position:string,stop:string|null,takeProfit:string|null)=>WindowExecutionRowSchema.parse({
  source_ordinal:0,kind:"OBSERVATION",window:"OOS",fold_id:null,at_utc_ms:1781280000000,
  payload:{equity:"20000",return_fraction:"0",drawdown_fraction:"0",accepted_position:position,signal_target:null,candle:null,
    fee:null,funding:null,turnover:null,active_stop:stop,active_take_profit:takeProfit},
});
const cases=[
  ["flat zero", "0", "0", "NOT_APPLICABLE", "POSITION_FLAT", null],
  ["flat signed decimal zero", "-0.000", "65209.5846", "NOT_APPLICABLE", "POSITION_FLAT", null],
  ["flat absent field", "0", null, "NOT_APPLICABLE", "POSITION_FLAT", null],
  ["long positive", "0.03146776677979329", "62730.8577", "AVAILABLE", null, "62730.8577"],
  ["short positive", "-0.03146776677979329", "65209.5846", "AVAILABLE", null, "65209.5846"],
  ["long level unset", "1", "0.000", "NOT_APPLICABLE", "ENGINE_ACTIVE_LEVEL_NOT_SET", null],
  ["short signed zero level", "-1", "-0.00", "NOT_APPLICABLE", "ENGINE_ACTIVE_LEVEL_NOT_SET", null],
  ["open missing field", "1", null, "NOT_PUBLISHED", "SOURCE_FIELD_NOT_PUBLISHED", null],
  ["open negative source", "1", "-1.25", "NOT_PUBLISHED", "SOURCE_ACTIVE_LEVEL_NON_POSITIVE", null],
  ["tiny exact decimals", "0."+"0".repeat(70)+"1", "0."+"0".repeat(70)+"2", "AVAILABLE", null, "0."+"0".repeat(70)+"2"],
] as const;

describe("BR-S02-19 position-bound active protection read projection",()=>{
  it.each(cases)("%s",(_name,position,level,state,reason,value)=>{
    const source=observation(position,level,level),before=sha256ResearchJson(source);
    const projected=WindowExecutionReadRowSchema.parse(normalizeWindowActiveLevels(source));
    if(projected.kind!=="OBSERVATION")throw new Error("Expected observation");
    expect(projected.payload.active_stop).toBe(value);
    expect(projected.payload.active_take_profit).toBe(value);
    for(const key of ["active_stop","active_take_profit"] as const)
      expect(projected.payload.active_level_availability[key]).toEqual({state,reason_code:reason,source_value:level});
    openApiValidator("research-window-execution.openapi.json","WindowObservation").assert(projected.payload);
    expect(sha256ResearchJson(source)).toBe(before);
    expect(source.payload).not.toHaveProperty("active_level_availability");
  });
  it("discloses the two levels independently and preserves other account/candle values",()=>{
    const source=observation("1","62730.857700000000000001",null),projected=normalizeWindowActiveLevels(source);
    if(projected.kind!=="OBSERVATION")throw new Error("Expected observation");
    expect(projected.payload.active_level_availability.active_stop.state).toBe("AVAILABLE");
    expect(projected.payload.active_level_availability.active_take_profit.reason_code).toBe("SOURCE_FIELD_NOT_PUBLISHED");
    expect(projected.payload.equity).toBe(source.payload.equity);
    expect(projected.payload.active_stop).toBe("62730.857700000000000001");
  });
  it("rejects disclosure/value contradictions; never admits public projection into immutable custody",()=>{
    const source=observation("0","0","0"),row=normalizeWindowActiveLevels(source);
    if(row.kind!=="OBSERVATION")throw new Error("Expected observation");
    for(const bad of [
      {...row.payload,active_stop:"0"},
      {...row.payload,active_level_availability:{...row.payload.active_level_availability,
        active_stop:{state:"AVAILABLE",reason_code:null,source_value:"0"}}},
      {...row.payload,accepted_position:"1"},
      {...row.payload,active_level_availability:{...row.payload.active_level_availability,policy_id:"UNKNOWN"}},
    ])expect(WindowObservationSchema.safeParse(bad).success).toBe(false);
    expect(WindowExecutionRowSchema.safeParse(source).success).toBe(true);
    expect(WindowExecutionRowSchema.safeParse(row).success).toBe(false);
    expect(WindowExecutionReadRowSchema.safeParse(source).success).toBe(false);
  });
  it("does not normalize journal intent prices or analytics",()=>{
    const raw={kind:"EXECUTION",payload:{stop_price:"0",take_profit_price:"0"}} as any;
    expect(normalizeWindowActiveLevels(raw)).toBe(raw);
    const analytics={kind:"ANALYTICS",payload:{}} as any;
    expect(normalizeWindowActiveLevels(analytics)).toBe(analytics);
  });
});

// Optional reuse of an existing accepted real-source receipt; no new child,
// DB writes or pretend live-API proof. The ordinary CI runs the synthetic bar above.
if(process.env.RESEARCH_ACTIVE_LEVEL_REAL_PAGE){
  describe("BR-S02-19 accepted Bracket V4 source receipt readback",()=>{
    it("projects all 168 retained observations without changing source bytes or exact levels",()=>{
      const receipt=JSON.parse(readFileSync(process.env.RESEARCH_ACTIVE_LEVEL_REAL_PAGE!,"utf8"));
      expect(receipt.status).toBe(200);
      const page=receipt.body;
      const before=sha256ResearchJson(page),rows=page.rows.map((r:unknown)=>WindowExecutionRowSchema.parse(r));
      const projected=rows.map(normalizeWindowActiveLevels);
      let flat=0,open=0;
      for(const row of projected){
        if(row.kind!=="OBSERVATION")throw new Error("Expected observations");
        WindowExecutionReadRowSchema.parse(row);
        if(row.payload.accepted_position==="0"){
          flat++;expect(row.payload.active_stop).toBeNull();expect(row.payload.active_take_profit).toBeNull();
          expect(row.payload.active_level_availability.active_stop.reason_code).toBe("POSITION_FLAT");
        }else{
          open++;expect(row.payload.active_level_availability.active_stop.state).toBe("AVAILABLE");
          expect(row.payload.active_level_availability.active_take_profit.state).toBe("AVAILABLE");
        }
      }
      expect({flat,open}).toEqual({flat:115,open:53});
      expect(sha256ResearchJson(page)).toBe(before);
    });
  });
}
