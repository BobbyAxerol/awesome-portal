/**
 * `GET /api/v1/execution/activation/capabilities` — what the owner may switch
 * on, and what is switched on now (N13a · phase 5).
 *
 * The contract has been published and answering 200 on dev for weeks, and the
 * §7.8 unread-contract check has named it every time. Nothing in the browser
 * read it, so no screen could say whether a capability was dark because the
 * source is dark, because the kill switch is engaged, or because nobody has
 * asked for it — three different sentences the screens were writing as one.
 *
 * This reader shows the state. It grants nothing: activation is an owner
 * action taken elsewhere, and every flag here is read with the operator that
 * makes an unreadable value the **safe** answer.
 */

const obj = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const str = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

export interface ActivationCapability {
  capabilityKey: string;
  effectiveProfile: string | null;
  desiredProfile: string | null;
  /** `!== true`: a flag that cannot be read leaves the capability off. */
  sourceEnabled: boolean;
  runtimeEnabled: boolean;
  /** `!== false`: a kill switch that cannot be read is treated as engaged. */
  killSwitchEngaged: boolean;
  lastPlanId: string | null;
}

export interface StagedActivation {
  sourceIntegrationState: string | null;
  runtimeActivationRequested: boolean;
  sourceSideEffectRequested: boolean;
  ownerArtifactImported: boolean;
  capabilities: readonly ActivationCapability[];
}

export function readStagedActivation(raw: unknown): StagedActivation | null {
  const body = obj(raw);
  if (!body || body.schema_version !== "execution.staged-activation-capabilities.v1") return null;
  const rows = Array.isArray(body.capabilities) ? body.capabilities : [];
  return {
    sourceIntegrationState: str(body.source_integration_state),
    /*
     * `!== false`, not `=== true`, and the fail-closed registry is why.
     *
     * I wrote `=== true` here first: "absent means nobody asked". That is the
     * reassuring reading of both flags — an unreadable
     * `source_side_effect_requested` would have rendered as "nothing reached
     * the Trading System", which is the one sentence this screen must never
     * say on a guess. Both are registered as dangerous, and the guard caught
     * it before it shipped.
     */
    runtimeActivationRequested: body.runtime_activation_requested !== false,
    sourceSideEffectRequested: body.source_side_effect_requested !== false,
    ownerArtifactImported: body.owner_artifact_imported === true,
    capabilities: rows.flatMap((entry) => {
      const row = obj(entry);
      const capabilityKey = row && str(row.capability_key);
      if (!capabilityKey) return [];
      return [{
        capabilityKey,
        effectiveProfile: str(row!.effective_profile),
        desiredProfile: str(row!.desired_profile),
        sourceEnabled: row!.source_enabled === true,
        runtimeEnabled: row!.runtime_enabled === true,
        killSwitchEngaged: row!.kill_switch_engaged !== false,
        lastPlanId: str(row!.last_plan_id),
      }];
    }),
  };
}

/** Why one capability is not live, in the order that decides it. */
export function activationSentence(capability: ActivationCapability): string {
  if (capability.killSwitchEngaged) return "kill switch engaged";
  if (!capability.sourceEnabled) return "the source is not enabled";
  if (!capability.runtimeEnabled) return "the runtime is not enabled";
  return `live on ${capability.effectiveProfile ?? "a profile the server did not name"}`;
}
