/**
 * Which overlay Cmd/Ctrl+K opens.
 *
 * One shortcut, two overlays, never both. The V2 command bar owns the key
 * when, and only when:
 *   1. the V2 shell flag is on (`isV2Screen("shell")`, i.e. the manifest lists
 *      `shell` AND the Execution umbrella flag is on), and
 *   2. the current pathname is an Execution address, which is decided by the
 *      shell's own route classification (`presentationModeFor` returns
 *      `execution-carbon`: `/execution/*`, the registry's Execution screens
 *      and feature roots, plus the V2-flagged cockpit and access routes).
 * Everywhere else (Research, Planning, Governance routes still on their light
 * surface, the Command Center, bootstrap states) the V1 registry palette keeps
 * the key exactly as it is today. Flag off, the answer is always `false`.
 *
 * Pure and free of the V2 chunk: it imports only the flag constant and the
 * classifier that the shell already ships.
 */
import { EXECUTION_V2_SHELL } from "../execution/v2/flags";
import type { PortalRegistryDocument } from "../portal/contracts";
import { presentationModeFor } from "./presentation";

export function opensV2CommandBar(
  registry: PortalRegistryDocument | null,
  pathname: string,
  shellOn: boolean = EXECUTION_V2_SHELL,
): boolean {
  return shellOn && presentationModeFor(registry, pathname) === "execution-carbon";
}
