import {resolve} from "node:path";
export default {root:resolve(import.meta.dirname,"../.."),test:{
  include:["scripts/research-loop-v11/p08-preflight.spec.ts","scripts/research-loop-v11/p10-run-create.spec.ts",
    "scripts/research-loop-v11/full01-recipes-postgres.spec.ts"],environment:"node",testTimeout:60_000,
  hookTimeout:90_000,pool:"forks",fileParallelism:false,minWorkers:1,maxWorkers:1,
}};
