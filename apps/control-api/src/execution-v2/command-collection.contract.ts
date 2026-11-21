import { z } from "zod";
import { commandStatus,publicCommandStatus,commandWorkspace } from "./command.contract";

/** Separate exact-target capital receipt collection, NOT the mixed operation queue. */
export const commandCollectionQuery=z.object({
  workspace_id:commandWorkspace.shape.workspace_id,
  resource_kind:commandStatus.shape.resource.shape.kind,
  resource_id:commandStatus.shape.resource.shape.id,
  environment:commandStatus.shape.environment,
  limit:z.coerce.number().int().min(1).max(100).default(25),
  after:z.string().min(1).max(4096).optional(),
}).strict();
export type CommandCollectionQuery=z.infer<typeof commandCollectionQuery>;
export const commandCollection=z.object({
  schema_version:z.literal("portal.execution.command-collection.v1"),
  family:z.literal("TRUSTED_CAPITAL_COMMANDS_ONLY"),
  coverage:z.literal("EXACT_AUTHORIZED_RESOURCE_ONLY"),
  resource:commandStatus.shape.resource,environment:commandStatus.shape.environment,
  items:z.array(publicCommandStatus).max(100),
  page:z.object({limit:z.number().int().min(1).max(100),
    returned_count:z.number().int().min(0).max(100),has_more:z.boolean(),
    next_cursor:z.string().min(1).max(4096).nullable()}).strict(),
}).strict().superRefine((v,c)=>{
  if(v.page.returned_count!==v.items.length||v.items.length>v.page.limit||
    v.page.has_more!==(v.page.next_cursor!==null))
    c.addIssue({code:z.ZodIssueCode.custom,message:"COMMAND_COLLECTION_PAGE_INVALID"});
  if(v.items.some(i=>i.resource.kind!==v.resource.kind||i.resource.id!==v.resource.id||i.environment!==v.environment))
    c.addIssue({code:z.ZodIssueCode.custom,message:"COMMAND_COLLECTION_TARGET_MISMATCH"});
});
export type CommandCollection=z.infer<typeof commandCollection>;
export class CommandCollectionError extends Error {
  constructor(readonly code:"COMMAND_COLLECTION_OVERFLOW"|"COMMAND_COLLECTION_RESPONSE_BOUND"|
    "COMMAND_COLLECTION_CURSOR_INVALID"|"COMMAND_COLLECTION_CURSOR_CHANGED"|
    "COMMAND_COLLECTION_NOT_CONFIGURED",readonly status:number){super(code);}
}
