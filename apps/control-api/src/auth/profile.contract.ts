import { z } from "zod";
import { PortalUser, accountStateOf } from "../domain";
import { EffectiveAccess } from "./owner-access.service";

export const OwnProfilePatch = z.object({
  display_name: z.string().min(1).regex(/^[^\u0000-\u001f\u007f]+$/u)
    // JSON Schema maxLength counts Unicode code points, not UTF-16 units.
    .refine(value => [...value].length <= 120 && value.trim().length > 0)
    .transform(value => value.trim()),
  expected_revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
}).strict();

/** Only source-confirmed Portal identity facts; no fuzzy TS/researcher mapping. */
export function ownProfile(user: PortalUser, bindingCount: number, access: EffectiveAccess) {
  return {
    schema_version: "portal.profile.v1" as const,
    user_id: user.userId,
    display_name: user.displayName,
    account_state: accountStateOf(user),
    account_revision: user.accountRevision,
    external_identity: { state: bindingCount > 0 ? "BOUND" as const : "UNBOUND" as const,
      authority: "PORTAL_VERIFIED_ISSUER_SUBJECT" as const },
    ts_identity: { state: "UNMAPPED" as const, reason: "MAPPING_SOURCE_NOT_QUALIFIED" as const,
      source_locator: "ELP2-00/ELP2-REQ-00-003" },
    researcher_identity: { state: "UNMAPPED" as const, reason: "MAPPING_SOURCE_NOT_QUALIFIED" as const,
      source_locator: "ELP2-00/ELP2-REQ-00-003" },
    access: { is_owner: access.isOwner, capabilities: access.capabilities, scopes: access.scopes },
    may_update_display_name: user.status === "ACTIVE" && !user.archivedAt && !user.mustChangePassword,
    owner_recovery: { enabled: false as const, reason: "OWNER_RECOVERY_NOT_APPROVED" as const },
  };
}
