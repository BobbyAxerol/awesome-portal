import type { components } from "@portal/contracts-screen-bff";

export type ScreenBffContract = components["schemas"]["DetailResponse"];
export type ScreenBffDefinition = components["schemas"]["ScreenDefinition"];
export type ScreenBffUiState = components["schemas"]["UiState"];

export const SCREEN_BFF_UI_STATES: readonly ScreenBffUiState[] = [
  "ready", "empty", "stale", "partial", "denied", "unavailable", "error",
];

/**
 * Narrow compatibility reader for the N20 handoff. It deliberately refuses
 * unknown versions and incomplete envelopes; it never interprets source data,
 * derives policy or turns a typed-unavailable contract into a network call.
 */
export function readScreenBffContract(value: unknown): ScreenBffContract | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (
    item.schema_version !== "execution.screen-bff-contract.v1" ||
    item.record_authority !== "PORTAL_CONTROL" ||
    !item.screen || typeof item.screen !== "object" ||
    !item.delivery || typeof item.delivery !== "object"
  ) return null;
  const screen = item.screen as Record<string, unknown>;
  const dataApi = screen.data_api as Record<string, unknown> | undefined;
  const states = screen.supported_ui_states;
  if (
    typeof screen.screen_id !== "string" ||
    !dataApi ||
    !["AVAILABLE", "TYPED_UNAVAILABLE"].includes(String(dataApi.status)) ||
    !Array.isArray(states) ||
    states.length !== SCREEN_BFF_UI_STATES.length ||
    !SCREEN_BFF_UI_STATES.every((state) => states.includes(state))
  ) return null;
  return value as ScreenBffContract;
}

export function screenBffDataFetchAllowed(contract: ScreenBffContract): boolean {
  return contract.screen.data_api.status === "AVAILABLE";
}
