/** Fixture-lab presentation context, never a production identity or access grant. */
import { useEffect, useState } from "react";

type Context = { key: string; base: string } | null;

/** Called only after the room read succeeds. A fixture banner alone is not an access decision. */
export function useFixtureView(deploymentId: string, workspaceId: string | undefined, enabled = true): string | null {
  const key = `${workspaceId ?? ""}\u0000${deploymentId}`;
  const [context, setContext] = useState<Context>(null);
  useEffect(() => {
    if (!enabled || document.getElementById("fixture-banner") === null) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ view_id: deploymentId });
    if (workspaceId) params.set("workspace_id", workspaceId);
    void fetch(`/__fixture/variants?${params}`, { credentials: "same-origin", signal: controller.signal, headers: { accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok || !/^FIXTURE_LAB[A-Za-z0-9_./-]{0,48}$/.test(response.headers.get("x-fixture-lane") ?? "")) return null;
        const payload: unknown = await response.json();
        if (typeof payload !== "object" || payload === null) return null;
        const object = payload as { fixture?: unknown; view?: unknown };
        if (object.fixture !== true || typeof object.view !== "object" || object.view === null) return null;
        const view = object.view as { id?: unknown; fixture?: unknown; view_of_deployment_id?: unknown };
        return view.fixture === true && view.id === deploymentId && typeof view.view_of_deployment_id === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(view.view_of_deployment_id)
          ? view.view_of_deployment_id : null;
      })
      .then((base) => { if (!controller.signal.aborted && base !== null) setContext({ key, base }); })
      .catch(() => { /* A missing fixture endpoint never changes a product read. */ });
    return () => controller.abort();
  }, [deploymentId, workspaceId, key, enabled]);
  return enabled && context?.key === key ? context.base : null;
}
