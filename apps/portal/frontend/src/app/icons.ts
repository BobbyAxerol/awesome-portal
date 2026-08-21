/**
 * Registry `icon_key` -> lucide component.
 *
 * The registry owns which icon a feature asks for; this module only knows how
 * to resolve that key to a glyph. An unknown key falls back to a neutral mark
 * rather than throwing, so adding a feature to the registry can never break
 * the shell before the icon map catches up.
 */
import {
  BadgeCheck,
  Boxes,
  Briefcase,
  Circle,
  ClipboardCheck,
  Database,
  FileClock,
  FlaskConical,
  Gauge,
  KanbanSquare,
  LayoutDashboard,
  LibraryBig,
  ListChecks,
  Map as MapIcon,
  Network,
  Pickaxe,
  RadioTower,
  Rows3,
  ShieldCheck,
  SlidersHorizontal,
  UserRoundCog,
  Wallet,
  Workflow,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  boxes: Boxes,
  database: Database,
  "file-clock": FileClock,
  "flask-conical": FlaskConical,
  "kanban-square": KanbanSquare,
  "layout-dashboard": LayoutDashboard,
  "library-big": LibraryBig,
  map: MapIcon,
  pickaxe: Pickaxe,
  "radio-tower": RadioTower,
  "shield-check": ShieldCheck,
  "user-round-cog": UserRoundCog,
  workflow: Workflow,

  /* Execution Loop, registry revision 3.
   *
   * The registry names these after IBM Carbon's icon set, which matches the
   * Carbon direction of the Execution surface. The repo draws with lucide, so
   * each key resolves to the nearest lucide glyph by MEANING rather than by
   * name — the key is the contract, the glyph is this module's business. */
  account: Wallet,
  "dashboard-reference": Gauge,
  "document-tasks": ClipboardCheck,
  "network-3": Network,
  portfolio: Briefcase,
  "settings-adjust": SlidersHorizontal,
  "table-split": Rows3,
  "task-approved": BadgeCheck,
  "task-view": ListChecks,
};

export function iconFor(key: string): LucideIcon {
  return ICONS[key] ?? Circle;
}

/** Exposed so a test can assert the registry's keys are all covered. */
export const KNOWN_ICON_KEYS = Object.keys(ICONS);
