/**
 * `GET /api/v1/execution/screen-contracts` — the server's own catalogue of the
 * screens it serves (N20 · phase 3).
 *
 * Two jobs, both of which the frontend was doing by assumption:
 *
 *  1. **Parity.** The Feature Registry decides what routes exist here; the
 *     catalogue says what the server believes it serves. Nothing compared the
 *     two, so a screen could be renamed, re-routed or dropped on either side
 *     and the first sign of it would be a reader hitting an empty page.
 *  2. **Availability in the server's own words.** `data_api.status` and
 *     `unavailable_reason` are published per screen. Today every screen on dev
 *     reads `AVAILABLE`, so this path cannot be signed off by eye — but the
 *     mechanism has to exist before the first `TYPED_UNAVAILABLE` arrives,
 *     otherwise the screen will invent a sentence for it.
 */

export interface ScreenContract {
  screenId: string;
  uiRouteTemplate: string;
  resourceRequired: boolean;
  requiredRoles: readonly string[];
  supportedUiStates: readonly string[];
  dataApi: {
    status: string;
    operationId: string | null;
    unavailableReason: string | null;
    deliveryPhase: string | null;
  };
}

const str = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const obj = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.flatMap((entry) => (str(entry) ? [entry as string] : [])) : [];

function readScreen(raw: unknown): ScreenContract | null {
  const screen = obj(raw);
  const dataApi = screen && obj(screen.data_api);
  const screenId = screen && str(screen.screen_id);
  const route = screen && str(screen.ui_route_template);
  const status = dataApi && str(dataApi.status);
  if (!screen || !dataApi || !screenId || !route || !status) return null;
  return {
    screenId,
    uiRouteTemplate: route,
    resourceRequired: screen.resource_required === true,
    requiredRoles: strings(screen.required_roles),
    supportedUiStates: strings(screen.supported_ui_states),
    dataApi: {
      status,
      operationId: str(dataApi.operation_id),
      unavailableReason: str(dataApi.unavailable_reason),
      deliveryPhase: str(dataApi.delivery_phase),
    },
  };
}

/** The catalogue, or one screen's contract — the route serves both shapes. */
export function readScreenContracts(raw: unknown): ScreenContract[] | null {
  const body = obj(raw);
  if (!body) return null;
  if (Array.isArray(body.screens)) {
    const screens = body.screens.flatMap((entry) => {
      const screen = readScreen(entry);
      return screen ? [screen] : [];
    });
    // A catalogue that answered with rows none of which could be read is not an
    // empty catalogue; it is a shape we do not understand.
    return screens.length === 0 && body.screens.length > 0 ? null : screens;
  }
  const single = readScreen(body.screen);
  return single ? [single] : null;
}

export function isAvailable(contract: ScreenContract): boolean {
  return contract.dataApi.status === "AVAILABLE";
}

/**
 * What a screen says when the server declares it not available.
 *
 * The reason is printed verbatim: it is the server's own code, and a friendlier
 * paraphrase invented here would be the frontend explaining a decision it did
 * not make.
 */
export function unavailableSentence(contract: ScreenContract): string {
  const reason = contract.dataApi.unavailableReason;
  const phase = contract.dataApi.deliveryPhase;
  return [
    `The server does not serve this screen: ${contract.dataApi.status}`,
    reason ? `· ${reason}` : "· it published no reason",
    phase ? `· delivery phase ${phase}` : null,
  ].filter(Boolean).join(" ");
}

export interface ParityFinding {
  screenId: string;
  kind: "MISSING_IN_REGISTRY" | "ROUTE_DIFFERS" | "MISSING_ON_SERVER";
  serverRoute: string | null;
  registryRoute: string | null;
}

/**
 * Compare the server's catalogue with the routes this frontend actually mounts.
 *
 * `registryRoutes` is the Feature Registry's own screen → route map, which is
 * the only route authority the shell has (§3.2: no second feature model).
 */
export function screenContractParity(
  server: readonly ScreenContract[],
  registryRoutes: Readonly<Record<string, string>>,
  /** Screen ids the registry owns but the server is not expected to serve. */
  ignoreRegistryOnly: readonly string[] = [],
): ParityFinding[] {
  const findings: ParityFinding[] = [];
  const seen = new Set<string>();
  for (const contract of server) {
    seen.add(contract.screenId);
    const registryRoute = registryRoutes[contract.screenId] ?? null;
    if (registryRoute === null) {
      findings.push({ screenId: contract.screenId, kind: "MISSING_IN_REGISTRY", serverRoute: contract.uiRouteTemplate, registryRoute: null });
      continue;
    }
    if (registryRoute !== contract.uiRouteTemplate) {
      findings.push({ screenId: contract.screenId, kind: "ROUTE_DIFFERS", serverRoute: contract.uiRouteTemplate, registryRoute });
    }
  }
  for (const [screenId, registryRoute] of Object.entries(registryRoutes)) {
    if (seen.has(screenId) || ignoreRegistryOnly.includes(screenId)) continue;
    findings.push({ screenId, kind: "MISSING_ON_SERVER", serverRoute: null, registryRoute });
  }
  return findings.sort((left, right) => left.screenId.localeCompare(right.screenId));
}
