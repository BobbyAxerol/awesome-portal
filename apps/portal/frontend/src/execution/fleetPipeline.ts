/**
 * Promotion pipeline from the Fleet register (BR-EX-72) — the real-data twin
 * of the showcase's smoke `CC_PIPELINE`.
 *
 * What the register publishes is the CURRENT deployment set per alpha, not a
 * promotion history: an alpha with a deployment in a stage is "in that stage
 * now". So a funnel bar is "alphas with a deployment in the stage" and a
 * matrix cell is either `current` (deployments there today) or `none`; there
 * is no `done` cell because the register does not say an alpha ever left a
 * stage. Conversions are therefore not computed — a ratio between two
 * "now" counts would be a promotion rate the source never published.
 */
import type { AlphaFleetItem, ManagerListEnvelope } from "./api/profileRead";
import type { FunnelStage, MatrixRow, Pipeline, StageKey } from "./commandCenter.smoke";

const STAGES: readonly StageKey[] = ["PAPER", "SANDBOX", "CANARY", "LIVE"];
const STAGE_LABEL: Record<StageKey, string> = { PAPER: "Paper", SANDBOX: "Sandbox", CANARY: "Canary", LIVE: "Live" };
const STAGE_OF: Readonly<Record<string, StageKey>> = {
  PAPER: "PAPER", PAPER_OBSERVATION: "PAPER",
  SANDBOX: "SANDBOX", SANDBOX_VALIDATION: "SANDBOX",
  CANARY: "CANARY", LIVE_CANARY: "CANARY",
  LIVE: "LIVE", LIVE_FULL: "LIVE",
};
const ROUTE: Record<StageKey, string> = { PAPER: "/deployments/paper", SANDBOX: "/deployments/sandbox", CANARY: "/deployments/live", LIVE: "/deployments/live" };
const HALTED = new Set(["HALTED", "PAUSED", "STOPPED", "SUSPENDED"]);

export const PIPELINE_ROW_CAP = 12;

export function stageKeyOf(stage: string | null | undefined): StageKey | null {
  return stage ? STAGE_OF[stage.toUpperCase()] ?? null : null;
}

export function fleetPipeline(list: ManagerListEnvelope<AlphaFleetItem>): Pipeline {
  const rows = list.page.rows;
  const byStage = (item: AlphaFleetItem) => {
    const map = new Map<StageKey, AlphaFleetItem["deployments"][number][]>();
    for (const d of item.deployments) {
      const key = stageKeyOf(d.stage);
      if (!key) continue;
      map.set(key, [...(map.get(key) ?? []), d]);
    }
    return map;
  };
  const grouped = rows.map((item) => ({ item, stages: byStage(item) }));
  const stages: FunnelStage[] = STAGES.map((key) => {
    const alphas = grouped.filter((g) => g.stages.has(key));
    const deployments = alphas.reduce((n, g) => n + (g.stages.get(key)?.length ?? 0), 0);
    const halted = alphas.reduce((n, g) => n + (g.stages.get(key) ?? []).filter((d) => HALTED.has(d.state.toUpperCase())).length, 0);
    return {
      key,
      label: STAGE_LABEL[key],
      entered: alphas.length,
      conversion: null,
      note: alphas.length === 0
        ? "none in stage now"
        : `in stage now · ${deployments} deployment${deployments === 1 ? "" : "s"}${halted > 0 ? ` · ${halted} halted` : ""}`,
    };
  });
  // Furthest-reaching alphas first, then by id, so the rows a reader wants on
  // a busy morning (anything live or canary) sit at the top of a capped list.
  const reach = (g: (typeof grouped)[number]) => STAGES.reduce((r, key, i) => (g.stages.has(key) ? i : r), -1);
  const ordered = [...grouped].sort((a, b) => reach(b) - reach(a) || a.item.alphaId.localeCompare(b.item.alphaId));
  const shown = ordered.slice(0, PIPELINE_ROW_CAP);
  const matrix: MatrixRow[] = shown.map(({ item, stages: s }) => ({
    alpha: item.alphaLabel && item.alphaLabel !== "Unnamed alpha" ? `${item.alphaLabel} · ${item.alphaId}` : item.alphaId,
    href: `/deployments/alphas/${encodeURIComponent(item.alphaId)}`,
    cells: Object.fromEntries(STAGES.map((key) => {
      const here = s.get(key) ?? [];
      if (here.length === 0) return [key, { kind: "none" as const }];
      const venues = Array.from(new Set(here.map((d) => d.venue))).join(" · ");
      const first = here[0]!;
      return [key, {
        kind: "current" as const,
        label: here.length === 1 ? first.state : `${here.length} deployments`,
        venue: venues,
        href: `${ROUTE[key]}/${encodeURIComponent(first.deploymentId)}`,
        paused: here.some((d) => HALTED.has(d.state.toUpperCase())),
      }];
    })) as MatrixRow["cells"],
  }));
  const total = list.page.filteredCount ?? rows.length;
  return {
    window: `current source facts · ${total} alpha${total === 1 ? "" : "s"}`,
    authority: "EXECUTION",
    stages,
    rows: matrix,
    note: `${shown.length < total ? `top ${shown.length} of ${total} by stage reach · ` : ""}cells = deployments in the stage today; the register publishes no promotion history, so no stage is ever shown as passed and no conversion is computed`,
  };
}
