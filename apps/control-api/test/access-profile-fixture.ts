import type { AccessProfileBuildInput } from "../src/execution-v2/access-profile-artifact";
import { TS_PINS_20261123_ID } from "../src/execution-v2/access-profile-pins";

export const PROFILE_FROM = 1_800_000_000_000;
export const PROFILE_OWNER = "usr_TEST_ONLY_owner", PROFILE_READER = "usr_TEST_ONLY_reader";
export const profileTarget = {
  database_name: "TEST_ONLY_db", database_system_identifier: "7000000000000000001", role_name: "TEST_ONLY_role",
  protected_owner_user_id: PROFILE_OWNER, workspace_id: "ws_TEST_ONLY",
  principal_workspace_pins: [PROFILE_OWNER, PROFILE_READER].map(user_id => ({ user_id, workspace_id: "ws_TEST_ONLY" })),
};
export const profileInput = (): AccessProfileBuildInput => ({
  schema_version: "portal.access-profile-input.v1", target: structuredClone(profileTarget),
  policy_revision: "policy-TEST_ONLY-1", approval_ref: "TEST_ONLY_APPROVAL", provenance_ref: "TEST_ONLY_PROVENANCE",
  valid_from_ms: PROFILE_FROM, profiles: TS_PINS_20261123_ID,
  users: [{ user_id: PROFILE_OWNER, role: "OWNER", granted_by: PROFILE_OWNER, profiles: "ALL" },
    { user_id: PROFILE_READER, role: "ADMIN_READER", granted_by: PROFILE_OWNER, profiles: "ALL" }],
});
