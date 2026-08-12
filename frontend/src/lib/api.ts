/** Typed API clients — legacy compatibility + v1 backend. */
import { storageGet, LS_TASKS, LS_PHASES } from "./storage";

export interface LegacyHealth {
  ok: boolean;
  service: string;
  storage?: string;
  tasks: number;
  roadmap: number;
}

export interface LegacyCollection {
  initialized: boolean;
  items: Record<string, unknown>[];
}

export type ApiMode = "local" | "api" | "detecting";

export async function detectApi(): Promise<ApiMode> {
  try {
    const res = await fetch("api/health", { cache: "no-store" });
    if (res.ok) {
      const body = (await res.json()) as LegacyHealth;
      if (body?.ok) return "api";
    }
  } catch {
    /* offline -> local */
  }
  return "local";
}

export async function fetchLegacy(name: "tasks" | "roadmap"): Promise<Record<string, unknown>[]> {
  const res = await fetch(`api/${name}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET api/${name} failed: ${res.status}`);
  const body = (await res.json()) as LegacyCollection;
  if (body?.initialized && Array.isArray(body.items)) return body.items;
  if (Array.isArray(body) && body.length) return body;
  const local = storageGet(name === "tasks" ? LS_TASKS : LS_PHASES);
  if (local) return JSON.parse(local) as Record<string, unknown>[];
  return [];
}

export async function putLegacy(name: "tasks" | "roadmap", items: Record<string, unknown>[]): Promise<void> {
  await fetch(`api/${name}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(items),
  });
}