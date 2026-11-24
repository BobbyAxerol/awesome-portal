/** Per-profile Edge pins handed to Core by TS/Edge on 2026-11-23, as DATA for the OFFLINE access-profile
 * builder (access-profile-artifact.ts). Nothing here is imported by application startup, a module, a flag or a
 * route; it is not authority. A pin is only a statement of what Edge published, and every value is re-checked
 * (64 lowercase hex) when an artifact is built.
 *
 * - catalogue_sha256: the published catalogue seal (`catalogue_sha256` of relation-catalogue.json).
 * - profile_sha256: sha256 of the Edge `profile-selection.json` bytes. LIVE has none yet (TS offers to generate one),
 *   so LIVE is representable but not ready and is excluded from an artifact by default.
 * - field_policy_sha256: sha256 of the Edge `serving-policy.json` bytes.
 * - field_policy_dir: the directory named in field_policy_ref = "<dir>/serving-policy.json#<field_policy_sha256>".
 *   Edge release dir for OKX / Paper Binance / Sandbox; the secure runtime dir for LIVE (it has no release dir).
 * - catalogue_sha256 of PAPER_BINANCE_USDM is the post-T3 seal; the previous seal (4f38c58f…) stays a Core allow-list
 *   concern, not a pin here: an older seal would be a NEW version of the same profile_key, never an edit. */
import type { AccessProfileInput } from "./access-profile-artifact";

export const TS_PINS_20261123_ID = "ts-pins-20261123";

export const TS_PROFILE_PINS_20261123: readonly AccessProfileInput[] = Object.freeze([
  Object.freeze({
    profile_key: "paper-okx", version: 1, namespace: "execution", environment: "paper" as const, profile_id: "PAPER_OKX_SWAP",
    catalogue_sha256: "0c43022bc2a8d1a1ec7619d880fed84cdb02b661cda228fe753fe87cdb4a5135",
    profile_sha256: "a7d53331a8ce43c62abb7586b0ee0429a056175e95d970a06b1ceaafa68bc853",
    field_policy_sha256: "24fe07bee40b29213933c0e88287c27714a4ace2aca15231da0fcd3b0036064a",
    field_policy_dir: "t3-okx-20261119",
  }),
  Object.freeze({
    profile_key: "paper-binance", version: 1, namespace: "execution", environment: "paper" as const, profile_id: "PAPER_BINANCE_USDM",
    catalogue_sha256: "4eaca507fbc256c3e7089b90c41fa533f698b4eb141914aba5f6136ee8cbfb46",
    profile_sha256: "0d5e0f6419e4c598422cfad31e03177ba110314cc2b0cc90ec427c6d68145816",
    field_policy_sha256: "4a35212dcd3db537625b9e7cbf4fed8a7e766adc88b5400440f2f87ba605da74",
    field_policy_dir: "t3-binance-20261119",
  }),
  Object.freeze({
    profile_key: "sandbox-binance", version: 1, namespace: "execution", environment: "sandbox" as const, profile_id: "SANDBOX_BINANCE_USDM",
    catalogue_sha256: "3852c844e7d06f70317bd54e53776081213d82569c6d203f78f05caa5bda15df",
    profile_sha256: "7ed7d49b12c5153b003256a2fd17fe3bba83c4d5fea40c3f39cdb9f9d06054ca",
    field_policy_sha256: "30da2153d8e4743c5d37d6119232a9b976f57ef0605efc46867dd16a1c8b6032",
    field_policy_dir: "sandbox-switch-20261116",
  }),
  Object.freeze({
    // NOT READY: no profile-selection.json exists for Live yet (profile_sha256 pending from TS). Representable,
    // excluded by default, and refused if someone enables it before the pin exists.
    profile_key: "live-binance", version: 1, namespace: "execution", environment: "live" as const, profile_id: "LIVE_BINANCE_USDM",
    catalogue_sha256: "0c71b72cd5d23cb21e902837d2a6c496d11da5bd09af70123dca3918cd9b1b44",
    profile_sha256: null,
    field_policy_sha256: "b9fbe07d1a9826d3e9270798162c052dda3687d27a04809eb38c4ad9e1a054f3",
    field_policy_dir: "portal-manager-read-v2",
    enabled: false,
  }),
]);
