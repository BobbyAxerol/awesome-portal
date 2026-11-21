import {z} from "zod";
import {NativeFreezeSchema} from "./native-read.contract";
import {NativeOptimizationSchema,ResearchNativeRouteResultSchema} from "./native-route.contract";
import {WindowAnalyticsSchema,WindowKindSchema} from "./window-execution.contract";
import {sha256ResearchJson} from "./preflight.service";
export const ResearchNativeReportSchema=z.object({schema_version:z.literal("research.native-report.v1"),
  kind:z.enum(["NATIVE_OPTIMIZED","NATIVE_FIXED"]).optional(),execution:ResearchNativeRouteResultSchema.optional(),
  optimization:NativeOptimizationSchema.nullable(),freeze:NativeFreezeSchema.nullable(),
  population:z.object({total:z.number().int().min(1).max(400),digest:z.string().regex(/^[a-f0-9]{64}$/),
    detail_operation:z.literal("researchSearchDetailGetV1"),pagination:z.literal("NATIVE_CURSOR_200_ROW_BOUND")}).strict().nullable(),
  windows:z.array(z.object({window:WindowKindSchema,
    availability:z.object({state:z.enum(["AVAILABLE","NOT_PUBLISHED","NOT_APPLICABLE"]),reason_code:z.string().nullable()}).strict(),
    analysis:WindowAnalyticsSchema.nullable()}).strict()).length(3),
  authority:z.literal("RETAINED_NATIVE_ENGINE_ACCOUNT_AND_IS_OPTIMIZATION_NOT_BROKER_OR_SCALAR_WFO"),
}).strict().superRefine((v,c)=>{
  if(new Set(v.windows.map(w=>w.window)).size!==3 || v.windows.some(w=>(w.availability.state==="AVAILABLE")!==(w.analysis!==null)
    || w.analysis!==null&&w.analysis.window!==w.window)
    ||v.kind!=="NATIVE_FIXED"&&(v.population===null||v.optimization===null||v.freeze===null
      ||v.population.total!==v.optimization.retained_trials||v.freeze.selected_trial_number!==v.optimization.selected_trial_number
      ||v.freeze.selected_parameters_digest!==sha256ResearchJson(v.optimization.selected_parameters))
    ||v.kind==="NATIVE_FIXED"&&(v.population!==null||v.optimization!==null||v.freeze!==null))
    c.addIssue({code:z.ZodIssueCode.custom,message:"Native Report windows/selection disagree"});
  if(v.execution&&(v.kind==="NATIVE_FIXED"?v.execution.optimization!==undefined:
    sha256ResearchJson(v.execution.optimization??null)!==sha256ResearchJson(v.optimization)))
    c.addIssue({code:z.ZodIssueCode.custom,message:"Native execution/optimization source facts disagree"});
});
