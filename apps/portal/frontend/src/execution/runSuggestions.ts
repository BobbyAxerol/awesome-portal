/**
 * Candidate evidence runs for a new R1 request — the Run Library the reader already trusts, offered as a list instead of an id to copy.
 *
 * It reads the Research run list (`/api/v1/quantbt/runs`, same origin, the caller's own session) and keeps only what a request can use:
 * runs that COMPLETED and name the alpha they were bound to. Everything else is simply not offered. The server still validates the pair on
 * submit — this list is a convenience, never authority — and a failed read says so and leaves the typed ids as they were.
 */
import { useEffect, useState } from "react";

export interface RunOption {
  runId: string;
  alphaId: string;
  alphaName: string | null;
  createdMs: number | null;
}

export type RunSuggestions =
  | { status: "loading"; options: readonly RunOption[]; reason: null }
  | { status: "ok"; options: readonly RunOption[]; reason: null }
  | { status: "unavailable"; options: readonly RunOption[]; reason: string };

const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** Pure reader: unknown shapes are skipped, never guessed. */
export function readRunOptions(raw: unknown): RunOption[] {
  const items = rec(raw)?.items;
  if (!Array.isArray(items)) return [];
  const out: RunOption[] = [];
  for (const item of items) {
    const r = rec(item);
    const binding = rec(r?.binding);
    if (!r || r.status !== "COMPLETED" || typeof r.run_id !== "string" || !binding || typeof binding.alpha_id !== "string" || binding.alpha_id === "") continue;
    out.push({
      runId: r.run_id,
      alphaId: binding.alpha_id,
      alphaName: typeof binding.alpha_name === "string" ? binding.alpha_name : null,
      createdMs: typeof r.created_at_utc_ms === "number" ? r.created_at_utc_ms : null,
    });
  }
  return out;
}

export function useRunSuggestions(enabled = true): RunSuggestions {
  const [state, setState] = useState<RunSuggestions>({ status: "loading", options: [], reason: null });
  useEffect(() => {
    if (!enabled || typeof fetch !== "function") return undefined;
    const abort = new AbortController();
    void fetch("/api/v1/quantbt/runs?limit=50", { credentials: "same-origin", headers: { accept: "application/json" }, signal: abort.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        setState({ status: "ok", options: readRunOptions(await response.json()), reason: null });
      })
      .catch(() => {
        if (!abort.signal.aborted) setState({ status: "unavailable", options: [], reason: "The Research run list could not be read, so no run is offered — type the ids instead." });
      });
    return () => abort.abort();
  }, [enabled]);
  return state;
}
