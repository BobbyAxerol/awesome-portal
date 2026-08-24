/**
 * Explicit handler spies for screen tests — EL-V2-03.
 *
 * Screens require their interaction handlers in the type, so a test that
 * mounts one supplies them here rather than the screen quietly allowing none.
 * These are spies on purpose: a test that wants to prove a click reached its
 * handler can assert on the same object.
 */
import { vi } from "vitest";

export function paperHandlers() {
  return { onRequestExit: vi.fn(), onTabChange: vi.fn(), onLoadOlder: vi.fn(), onAdminActions: vi.fn() };
}
export function alphaHandlers() {
  return { onScopeChange: vi.fn(), onTabChange: vi.fn(), onLoadOlder: vi.fn(), onOpenDeployment: vi.fn(), onOpenAccount: vi.fn() };
}
export function portfolioHandlers() {
  return { onTabChange: vi.fn(), onLensChange: vi.fn(), onOpenAlpha: vi.fn(), onOpenAccount: vi.fn() };
}
export function accountHandlers() {
  return { onSyncNow: vi.fn(), onDryRun: vi.fn() };
}
export function blotterHandlers() {
  return { onFilterChange: vi.fn(), onResetCrossFilter: vi.fn(), onLoadOlder: vi.fn(), onExpand: vi.fn() };
}
