import {resolve} from "node:path";
export default {root:resolve(import.meta.dirname,"../.."),test:{include:["scripts/research-loop-v11/window-execution-postgres.spec.ts"],
  environment:"node",testTimeout:60000,hookTimeout:90000,pool:"forks",fileParallelism:false,minWorkers:1,maxWorkers:1}};
