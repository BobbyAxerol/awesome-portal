/** PRIVATE artifact intake dependency graph. Keep G2/runtime imports out of
 * the public pure contract used by networkless contract generators. */
import { z } from "zod";
import { ownerTarget } from "./owner-target";
import { ordinaryProfileLifecycleRequest } from "./ordinary-profile-lifecycle";
import { ordinaryExpectedHead } from "./ordinary-profile-authority.contract";
const text = z.string().min(1).max(256).regex(/^[^\u0000-\u001f\u007f]+$(?![\s\S])/u);
const epoch = z.number().int().nonnegative().safe();
/** Delegation rights must be part of the owner-pinned envelope, not inferred
 * from G2's advisory role summary or the actor's application role. */
export const ordinaryAuthorityInstallDocument = z.object({ schema_version: z.literal("portal.ordinary-profile-install.v1"),
  operation_id: text, lifecycle: ordinaryProfileLifecycleRequest,
  current_artifact_bytes: z.string().max(131_072).nullable(), expected_head: ordinaryExpectedHead.nullable(),
  administrator_user_ids: z.array(text).max(64).refine(v => new Set(v).size === v.length, "DUPLICATE_PRINCIPAL"),
}).strict();
export const ordinaryAuthorityInstallPin = z.object({ artifact_path: z.string().startsWith("/"),
  approved_sha256: z.string().regex(/^[a-f0-9]{64}$(?![\s\S])/), target: ownerTarget,
  not_before_ms: epoch, not_after_ms: epoch,
}).strict().refine(v => v.not_after_ms > v.not_before_ms, "INVALID_INTAKE_WINDOW");
export type OrdinaryAuthorityInstallPin = z.infer<typeof ordinaryAuthorityInstallPin>;
