/**
 * Registry `icon_key` -> lucide component.
 *
 * The registry owns which icon a feature asks for; this module only knows how
 * to resolve that key to a glyph. An unknown key falls back to a neutral mark
 * rather than throwing, so adding a feature to the registry can never break
 * the shell before the icon map catches up.
 */
import {
  Boxes,
  Circle,
  Database,
  FileClock,
  FlaskConical,
  KanbanSquare,
  LayoutDashboard,
  LibraryBig,
  Map as MapIcon,
  Pickaxe,
  RadioTower,
  ShieldCheck,
  UserRoundCog,
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
};

export function iconFor(key: string): LucideIcon {
  return ICONS[key] ?? Circle;
}

/** Exposed so a test can assert the registry's keys are all covered. */
export const KNOWN_ICON_KEYS = Object.keys(ICONS);
