/**
 * PHASE 1 (round 2) · the adapter must derive, never fall back.
 *
 * The bug this guards against is subtle: if the browser ever accepted a V1 body
 * where it asked for V2, the payload would quietly double again and nobody
 * would notice, because the screen would look identical.
 */
import { describe, expect, it } from "vitest";
import { isScreenV2, legacyDataFromPanels, normaliseScreenBody, SCREEN_V2_MEDIA_TYPE } from "./screenV2";

const panel = (rows: unknown[] | null) => ({
  state: rows === null ? "EMPTY" : "READY",
  data: rows === null ? null : { rows },
  clocks: { read_at_ms: 1 },
  coverage: { source_total: rows === null ? "0" : String(rows.length) },
});

const v2 = {
  schema_version: "execution.paper-overview.v2",
  workspace_id: "ws_1",
  panels: { performance: panel([{ id: "a" }, { id: "b" }]), sessions: panel(null) },
  screen_context: { deployment: { id: "dep_1" }, query: { limit: 50 } },
};

describe("screen V2 adapter", () => {
  it("names the media type the server negotiates on", () => {
    expect(SCREEN_V2_MEDIA_TYPE).toBe("application/vnd.portal.execution.screen.v2+json");
  });

  it("recognises a V2 body by its own schema version, not by guessing", () => {
    expect(isScreenV2(v2)).toBe(true);
    expect(isScreenV2({ ...v2, schema_version: "execution.paper-overview.v1" })).toBe(false);
    expect(isScreenV2({ schema_version: "execution.paper-overview.v2" })).toBe(false);
    expect(isScreenV2(null)).toBe(false);
  });

  it("derives the rows map from panels, with an empty panel as an empty list", () => {
    expect(legacyDataFromPanels(v2.panels)).toEqual({
      performance: [{ id: "a" }, { id: "b" }],
      sessions: [],
    });
  });

  it("keeps a V1 body untouched, because there is nothing to derive", () => {
    const v1 = { schema_version: "execution.paper-overview.v1", panels: {}, data: { performance: [] } };
    expect(normaliseScreenBody(v1)).toBe(v1);
  });

  it("lifts screen_context back to the top level where the screens read it", () => {
    const out = normaliseScreenBody(v2) as Record<string, unknown>;
    expect(out.deployment).toEqual({ id: "dep_1" });
    expect(out.query).toEqual({ limit: 50 });
    expect(out.screen_context).toBeUndefined();
    expect(out.schema_version).toBe("execution.paper-overview.v1");
  });

  it("fails closed when a body claims V2 without carrying the shape", () => {
    expect(normaliseScreenBody({ schema_version: "x.v2", panels: {} })).toBeNull();
  });

  it("never reads a data branch, because a V2 body has none to read", () => {
    // A hostile body carrying both must still be derived from panels only.
    const both = { ...v2, data: { performance: [{ id: "STALE COPY" }] } };
    const out = normaliseScreenBody(both) as { data: Record<string, unknown> };
    expect(out.data.performance).toEqual([{ id: "a" }, { id: "b" }]);
  });
});
