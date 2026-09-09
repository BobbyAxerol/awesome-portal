/**
 * Phase 3 · the two session-wide reads every execution screen depends on.
 *
 * `/runtime-manifest` states the server's page/byte/cursor bounds, and
 * `/screen-contracts` states which screens it serves and why any of them is
 * not. Both answer the same for every screen, so both are read **once per page
 * load** and shared — a per-screen fetch would add a request to each of 25
 * screens for a value that cannot differ between them.
 *
 * Neither read is allowed to stop a screen. A manifest that fails leaves the
 * bounds at the labelled frontend default; a catalogue that fails leaves the
 * screen to answer for itself, exactly as it did before this existed.
 */
import { useEffect, useState } from "react";

import type { ExecutionApi } from "./api/ports";
import { boundsOf, type BoundsSource, type PageBounds } from "./runtimeManifest";
import { setDeclaredPageBound } from "./api/managerRelations";
import type { ScreenContract } from "./screenContracts";

export interface ExecutionRuntime {
  bounds: PageBounds;
  boundsSource: BoundsSource;
  contracts: readonly ScreenContract[] | null;
}

let session: Promise<ExecutionRuntime> | null = null;

export function loadExecutionRuntime(api: ExecutionApi): Promise<ExecutionRuntime> {
  session ??= (async () => {
    const [manifest, contracts] = await Promise.all([
      // Called, not assumed: a port that predates these (an older fixture, a
      // test double) degrades rather than throwing inside an effect.
      typeof api.getRuntimeManifest === "function" ? api.getRuntimeManifest().catch(() => null) : null,
      typeof api.getScreenContracts === "function" ? api.getScreenContracts().catch(() => null) : null,
    ]);
    const answer = boundsOf(manifest && manifest.ok ? manifest.value : null);
    setDeclaredPageBound(answer.source === "SERVER_DECLARED" ? answer.bounds.maximumPageRows : null);
    return {
      bounds: answer.bounds,
      boundsSource: answer.source,
      contracts: contracts && contracts.ok ? contracts.value : null,
    };
  })();
  return session;
}

/** Tests own the session; a memoised promise would otherwise leak between them. */
export function forgetExecutionRuntime(): void {
  session = null;
  setDeclaredPageBound(null);
}

export function useExecutionRuntime(api: ExecutionApi): ExecutionRuntime | null {
  const [runtime, setRuntime] = useState<ExecutionRuntime | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadExecutionRuntime(api).then((value) => { if (!cancelled) setRuntime(value); });
    return () => { cancelled = true; };
  }, [api]);
  return runtime;
}

/** The contract for one screen, when the catalogue was read and knows it. */
export function contractFor(runtime: ExecutionRuntime | null, screenId: string): ScreenContract | null {
  return runtime?.contracts?.find((contract) => contract.screenId === screenId) ?? null;
}
