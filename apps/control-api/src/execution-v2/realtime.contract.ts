import { z } from "zod";
import { edgeMetadataSchema, executionEnvironment, utcMilliseconds } from "./foundation.contract";

const text=z.string().min(1).max(256).regex(/^[^\u0000-\u001f\u007f]+$(?![\s\S])/);
export const replayOpaqueToken=z.string().min(1).max(4096).regex(/^[A-Za-z0-9._~-]+$(?![\s\S])/);
/** Exact source ChangeNotice semantics, not a financial/order lifecycle event. */
export const edgeScopedNotice=z.object({resume_cursor:replayOpaqueToken,
  projection_generation:text,quality:edgeMetadataSchema.shape.quality}).strict();
export const edgeScopedNoticeBatch=z.object({notices:z.array(edgeScopedNotice).max(200),
  next_cursor:replayOpaqueToken.nullable(),caught_up:z.boolean()}).strict();
/** Internal only. No raw sequence, visible/hidden count or authority input is
 * accepted by a public controller. Every revision participates in cursor scope. */
export const scopedReplayBinding=z.object({workspace_id:text,environment:executionEnvironment,profile_id:text,
  principal_scope_digest:text,app_policy_revision:text,field_policy_revision:text,model_revision:text,
  schema_revision:z.literal("portal.execution.scoped-realtime.v1"),dataset:z.enum(["alpha_fleet_overview","execution_profile_observation"]),
  query_digest:text,source_set_digest:text,source_continuity_epoch:text,projection_generation:text,
  snapshot_id:text,window:z.object({from_ms:utcMilliseconds,to_ms:utcMilliseconds}).strict()
    .refine(w=>w.from_ms<w.to_ms,"REPLAY_WINDOW_INVALID").nullable()}).strict();
export const scopedRealtimeFrame=z.object({schema_version:z.literal("portal.execution.scoped-realtime.v1"),
  semantics:z.literal("NOTIFICATION_ONLY"),
  event_type:z.enum(["revalidate","heartbeat","resync_required","access_revoked","unavailable"]),
  terminal:z.boolean(),reconnect_required:z.boolean(),
  resume_cursor:replayOpaqueToken.nullable(),projection_generation:text.nullable(),
  quality:edgeMetadataSchema.shape.quality.nullable(),
  next_action:z.enum(["READ_NAMED_SNAPSHOT","RESUME_PORTAL_CURSOR","SIGN_IN_OR_REQUEST_ACCESS","WAIT"]),
  reason_code:z.enum(["SNAPSHOT_REQUIRED","CURSOR_INVALID_OR_EXPIRED","SCOPE_CHANGED","GENERATION_CHANGED",
    "SOURCE_COVERAGE_UNPROVED","SOURCE_UNAVAILABLE","SLOW_CLIENT","ACCESS_CHANGED","RECONNECT_LIMIT","STOPPED"]).nullable(),
}).strict().superRefine((f,c)=>{
  const terminal=["resync_required","access_revoked","unavailable"].includes(f.event_type);
  if(terminal!==f.terminal||terminal&&(f.resume_cursor!==null||f.projection_generation!==null||f.quality!==null)||
    !terminal&&(f.resume_cursor===null||f.projection_generation===null)||f.reconnect_required!==(f.event_type==="resync_required")||
    terminal&&f.reason_code===null||!terminal&&f.reason_code!==null||
    f.event_type==="revalidate"&&(f.next_action!=="READ_NAMED_SNAPSHOT"||f.quality===null)||
    f.event_type==="heartbeat"&&(f.next_action!=="RESUME_PORTAL_CURSOR"||f.quality!==null)||
    f.event_type==="resync_required"&&f.next_action!=="READ_NAMED_SNAPSHOT"||
    f.event_type==="unavailable"&&f.next_action!=="WAIT"||
    f.event_type==="access_revoked"&&f.next_action!=="SIGN_IN_OR_REQUEST_ACCESS")
    c.addIssue({code:z.ZodIssueCode.custom,message:"SCOPED_REALTIME_FRAME_INCONSISTENT"});
});
export type ScopedReplayBinding=z.infer<typeof scopedReplayBinding>;
export type EdgeScopedNoticeBatch=z.infer<typeof edgeScopedNoticeBatch>;
export type ScopedRealtimeFrame=z.infer<typeof scopedRealtimeFrame>;
