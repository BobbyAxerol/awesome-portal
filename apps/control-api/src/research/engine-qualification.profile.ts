/** Isolated P23 compatibility binding, not a production release/default. */
import { createHash } from "node:crypto";
import { P04_DELTA_ADAPTER_CONTRACT_DIGEST } from "./p04-delta.binding";

export const ENGINE_110_QUALIFICATION_BINDING = Object.freeze({
  schema_version: "research.engine-qualification-binding.v1",
  binding_id: "p23.quantbt-110-fixed-qualification.v1",
  execution_profile_id: "p04.fixed-qualification.v1",
  adapter_contract_digest: P04_DELTA_ADAPTER_CONTRACT_DIGEST,
  engine_release_id: "er_quantbt_110",
  engine_version: "1.1.0",
  native_version: "0.4.1",
  engine_wheel_sha256: "c319b24325230df99ce1803ae03df09c15acabd834dd2f6ccd17b21e70363e62",
  native_wheel_sha256: "f26681ad154aea38d9d0fc8f9e828a6c480176cf7f20041cbb86f06e1dd38b3d",
  execution_route: "signal_notional",
  protocol: "three_window_decay",
  production_admission: false,
} as const);
export const ENGINE_110_QUALIFICATION_BINDING_DIGEST = createHash("sha256")
  .update(JSON.stringify(Object.fromEntries(Object.entries(ENGINE_110_QUALIFICATION_BINDING).sort(([a], [b]) => a < b ? -1 : 1))))
  .digest("hex");

export function engine110QualificationEnabled(config: { PORTAL_ENV?: string; AUTH_MODE?: string; RESEARCH_ENGINE_QUALIFICATION_VERSION?: string }) {
  return config.PORTAL_ENV === "local" && config.AUTH_MODE === "dev"
    && config.RESEARCH_ENGINE_QUALIFICATION_VERSION === "1.1.0";
}
