/** Typed API clients — legacy compatibility plus opt-in v1 persistence. */
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

export interface ApiErrorShape {
  error?: { code?: string; message?: string };
  detail?: string;
}

export class PortalApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "PortalApiError";
    this.status = status;
    this.code = code;
  }
}

export interface VersionedItem<T extends object> {
  item: T;
  version: number;
  position: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ActivityEvent<T extends object> {
  id: string;
  entity_type: "task" | "roadmap_phase";
  entity_id: string;
  type: string;
  actor: string;
  occurred_at: string;
  before: VersionedItem<T> | null;
  after: VersionedItem<T> | null;
  metadata: Record<string, unknown>;
}

export type ApiMode = "local" | "api" | "detecting";
export type PersistenceMode = "local" | "legacy" | "v1";
export type CollectionName = "tasks" | "roadmap";

const apiBase = (import.meta.env.VITE_ROADMAP_TASK_BOARD_API_BASE ?? "api").replace(/\/$/, "");
const localOnly = import.meta.env.VITE_ROADMAP_TASK_BOARD_LOCAL_ONLY === "true";
const configuredPersistence = import.meta.env.VITE_ROADMAP_TASK_BOARD_PERSISTENCE ?? "legacy";
const CSRF_COOKIE = "__Host-portal_csrf";
const CSRF_HEADER = "x-portal-csrf";

function csrfTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CSRF_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(CSRF_COOKIE.length + 1)) : null;
}

function apiPath(path: "health" | "tasks" | "roadmap" | "ready"): string {
  return `${apiBase}/${path}`;
}

function v1Path(path: string): string {
  return `${apiBase}/v1/${path.replace(/^\//, "")}`;
}

export function persistenceMode(apiMode: ApiMode): PersistenceMode {
  if (apiMode !== "api" || localOnly) return "local";
  return configuredPersistence === "v1" ? "v1" : "legacy";
}

async function readError(response: Response): Promise<PortalApiError> {
  let payload: ApiErrorShape | undefined;
  try {
    payload = (await response.json()) as ApiErrorShape;
  } catch {
    // An upstream proxy can return an empty non-JSON error; keep the message useful.
  }
  return new PortalApiError(
    response.status,
    payload?.error?.code ?? "request_failed",
    payload?.error?.message ?? payload?.detail ?? `Request failed (${response.status})`,
  );
}

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const method = (options?.method ?? "GET").toUpperCase();
  const csrf = ["POST", "PUT", "PATCH", "DELETE"].includes(method)
    ? csrfTokenFromCookie()
    : null;
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(csrf ? { [CSRF_HEADER]: csrf } : {}),
      ...(options?.headers ?? {}),
    },
  });
  if (!response.ok) throw await readError(response);
  return response.json() as Promise<T>;
}

export async function detectApi(): Promise<ApiMode> {
  if (localOnly) return "local";
  try {
    const res = await fetch(apiPath("health"), {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (res.ok) {
      const body = (await res.json()) as LegacyHealth;
      if (body?.ok) return "api";
    }
  } catch {
    /* offline -> local */
  }
  return "local";
}

export async function fetchLegacy(name: CollectionName): Promise<Record<string, unknown>[]> {
  const collection = await fetchLegacyCollection(name);
  if (collection.initialized) return collection.items;
  const local = storageGet(name === "tasks" ? LS_TASKS : LS_PHASES);
  if (local) return JSON.parse(local) as Record<string, unknown>[];
  return [];
}

/** Preserve whether a compatibility server has been initialized. */
export async function fetchLegacyCollection(name: CollectionName): Promise<LegacyCollection> {
  const url = apiPath(name);
  const body = await requestJson<LegacyCollection | Record<string, unknown>[]>(url, { method: "GET" });
  if (!Array.isArray(body)) return { initialized: Boolean(body.initialized), items: Array.isArray(body.items) ? body.items : [] };
  return { initialized: true, items: body };
}

export async function putLegacy(name: CollectionName, items: Record<string, unknown>[]): Promise<void> {
  await requestJson<Record<string, unknown>>(apiPath(name), {
    method: "PUT",
    body: JSON.stringify(items),
  });
}

export async function listV1<T extends object>(name: CollectionName): Promise<VersionedItem<T>[]> {
  const body = await requestJson<{ items: VersionedItem<T>[] }>(v1Path(name), { method: "GET" });
  return body.items;
}

export async function createV1<T extends object>(name: CollectionName, item: T): Promise<VersionedItem<T>> {
  return requestJson<VersionedItem<T>>(v1Path(name), { method: "POST", body: JSON.stringify(item) });
}

export async function patchV1<T extends object>(
  name: CollectionName,
  id: string,
  changes: Partial<T>,
  expectedVersion: number,
): Promise<VersionedItem<T>> {
  return requestJson<VersionedItem<T>>(`${v1Path(name)}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ ...changes, expected_version: expectedVersion }),
  });
}

export async function moveTaskV1<T extends object>(
  id: string,
  status: string,
  position: number,
  expectedVersion: number,
): Promise<VersionedItem<T>> {
  return requestJson<VersionedItem<T>>(`${v1Path("tasks")}/${encodeURIComponent(id)}/move`, {
    method: "POST",
    body: JSON.stringify({ status, position, expected_version: expectedVersion }),
  });
}

export async function transitionTaskV1<T extends object>(
  id: string,
  status: string,
  expectedVersion: number,
): Promise<VersionedItem<T>> {
  return requestJson<VersionedItem<T>>(`${v1Path("tasks")}/${encodeURIComponent(id)}/transition`, {
    method: "POST",
    body: JSON.stringify({ status, expected_version: expectedVersion }),
  });
}

export async function moveRoadmapV1<T extends object>(
  id: string,
  position: number,
  expectedVersion: number,
): Promise<VersionedItem<T>> {
  return requestJson<VersionedItem<T>>(`${v1Path("roadmap")}/${encodeURIComponent(id)}/move`, {
    method: "POST",
    body: JSON.stringify({ position, expected_version: expectedVersion }),
  });
}

export async function deleteV1<T extends object>(
  name: CollectionName,
  id: string,
  expectedVersion: number,
): Promise<VersionedItem<T>> {
  return requestJson<VersionedItem<T>>(`${v1Path(name)}/${encodeURIComponent(id)}?expected_version=${expectedVersion}`, {
    method: "DELETE",
  });
}

export async function replaceV1<T extends object>(name: CollectionName, items: T[]): Promise<VersionedItem<T>[]> {
  const body = await requestJson<{ items: VersionedItem<T>[] }>(`${v1Path(name)}/import`, {
    method: "POST",
    body: JSON.stringify({ items, confirm_replace: true }),
  });
  return body.items;
}

export async function activityV1<T extends object>(name: CollectionName, id: string): Promise<ActivityEvent<T>[]> {
  const body = await requestJson<{ items: ActivityEvent<T>[] }>(`${v1Path(name)}/${encodeURIComponent(id)}/activity`, { method: "GET" });
  return body.items;
}
