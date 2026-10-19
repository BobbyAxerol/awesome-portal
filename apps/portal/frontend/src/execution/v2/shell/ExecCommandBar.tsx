/**
 * ExecCommandBar — the V2 command bar bound to the shell (review2/00 C1, D18).
 *
 * `PortalShell` mounts this lazily and only when `opensV2CommandBar` says the
 * V2 bar owns the current route (shell flag on AND an Execution route). It
 * owns nothing about opening: the shell's single Cmd/Ctrl+K listener decides
 * which overlay to open, so exactly one of the V1 palette and this bar can
 * ever appear.
 *
 * Rows are the permission-filtered "Go to" entries. The capability set is the
 * session's own (`NavOptions.capabilities`, the same list the sidebar uses);
 * `roleNav` drops every entry the caller cannot enter, and an empty or
 * unreadable list therefore offers only the entries that need nothing. That
 * is a courtesy, never the boundary: the server refuses the route regardless.
 *
 * Choosing a row navigates with the Execution context (env, window, ccy,
 * workspace_id, from) carried over, via the same `withContext` the screens use.
 * Entity search has no published endpoint yet, so the bar says so instead of
 * implying a search that cannot answer.
 */
import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import type { PortalRegistryDocument } from "../../../portal/contracts";
import { isNavigable, sidebarGroups, type NavOptions } from "../../../portal/navigation";
import { withContext } from "../urlState";
import { CommandBar } from "./CommandBar";
import { goToEntries, type CommandEntry } from "./roleNav";

export const ENTITY_SEARCH_NOTICE = "Entity search · Not published (FE-023)";
export const EXEC_COMMAND_PLACEHOLDER = "Jump to a screen";
/** The whole "Go to" list is short and permission-filtered; the bar default of 12 would push Execution rows out of view. */
const GO_TO_LIMIT = 50;

export interface ExecCommandBarProps {
  registry: PortalRegistryDocument;
  /** The shell's navigation options: environment, preference and the session's capabilities. */
  options: NavOptions;
  open: boolean;
  onClose(): void;
}

/** The "Go to" rows for this registry and caller; pure, so it can be tested without a router. */
export function execGoToEntries(registry: PortalRegistryDocument, options: NavOptions): CommandEntry[] {
  const capabilities = new Set(options.capabilities ?? []);
  // Link-only targets (Blotter) may sit outside the sidebar in a registry revision; the same
  // visibility rules still apply, so a feature the caller cannot see is not offered here either.
  const extras = registry.features.filter((feature) => isNavigable(feature, options));
  return goToEntries(sidebarGroups(registry, options), capabilities, extras);
}

export function ExecCommandBar({ registry, options, open, onClose }: ExecCommandBarProps) {
  const navigate = useNavigate();
  const { search } = useLocation();
  const entries = useMemo(() => execGoToEntries(registry, options), [registry, options]);
  const onSelect = useCallback((entry: CommandEntry) => navigate(withContext(entry.href, search)), [navigate, search]);
  return (
    <CommandBar
      open={open}
      onClose={onClose}
      entries={entries}
      onSelect={onSelect}
      limit={GO_TO_LIMIT}
      placeholder={EXEC_COMMAND_PLACEHOLDER}
      searchNotice={ENTITY_SEARCH_NOTICE}
    />
  );
}
