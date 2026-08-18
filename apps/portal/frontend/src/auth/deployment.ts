/**
 * What can be known about this deployment before anyone signs in.
 *
 * The sign-in plate used to carry a hard-coded list of three product
 * capabilities — "QuantBT Backtest", "Roadmap / Task Board", "other modules are
 * commissioned". That list was a second feature model: the Feature Registry is
 * the authority for what exists, and a constant beside it can only drift, and
 * can only ever be marketing. It also could not be true, since the registry is
 * behind the session the visitor does not have yet.
 *
 * These two health endpoints are the facts a visitor CAN be told, and they are
 * the ones an operator actually wants before signing in: which build of each
 * service is answering. They are unauthenticated by design (the gateway routes
 * `/api/health` and `/api/control/healthz` past the façade), so no claim here
 * depends on a session.
 *
 * A service that does not answer is reported as unreachable. It is never
 * softened into a blank, because "the API is down" is exactly the thing a login
 * screen should say out loud rather than let the visitor discover after
 * authenticating.
 */
import { useEffect, useState } from "react";

export interface ServiceFact {
  /** Service name as the deployment knows it. */
  name: string;
  /** Version the service reports, or null when it did not answer. */
  version: string | null;
  reachable: boolean;
}

const PROBES: { name: string; path: string }[] = [
  { name: "portal-api", path: "/api/health" },
  { name: "control-api", path: "/api/control/healthz" },
];

async function probe(name: string, path: string): Promise<ServiceFact> {
  try {
    const response = await fetch(path, { headers: { accept: "application/json" } });
    if (!response.ok) return { name, version: null, reachable: false };
    const body = (await response.json()) as { version?: unknown };
    return {
      name,
      version: typeof body.version === "string" ? body.version : null,
      reachable: true,
    };
  } catch {
    return { name, version: null, reachable: false };
  }
}

/**
 * Reads the service facts once, without blocking the form.
 *
 * Returns `null` until every probe has settled, so the strip appears complete
 * rather than filling in one row at a time next to a form the visitor is
 * already typing into.
 */
export function useDeploymentFacts(): ServiceFact[] | null {
  const [facts, setFacts] = useState<ServiceFact[] | null>(null);

  useEffect(() => {
    let live = true;
    void Promise.all(PROBES.map((entry) => probe(entry.name, entry.path))).then((settled) => {
      if (live) setFacts(settled);
    });
    return () => {
      live = false;
    };
  }, []);

  return facts;
}
