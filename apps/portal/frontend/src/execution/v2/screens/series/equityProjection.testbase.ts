/**
 * Test helpers for the screens that consume the equity projection (R-C, FIXTURE lane). Tests only.
 * The bodies are the published `execution-analytics.equity-projection` shape (schema-valid, held by the reader conformance suite);
 * the port answers through the PRODUCT fetch + reader (`fetchEquityProjection`), so a body the reader refuses is refused here too.
 */
import { act, cleanup, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ExecutionApi } from "../../../api/ports";
import { fetchEquityProjection, type EquityProjectionQuery } from "../../readers/equityProjection";

const STEP = 60_000;
const START = Date.UTC(2026, 9, 17, 0, 0, 0);
const DIGEST = `sha256:${"a".repeat(64)}`;
const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z");

/** A schema-valid COMPLETE projection of `n` one-minute buckets for `deploymentId`, with an illustrative band joined to the series. */
export function projectionBody(deploymentId: string, n = 6, over: { band?: boolean; runId?: string } = {}): Record<string, unknown> {
  let peak = 0;
  const points = Array.from({ length: n }, (_, i) => {
    const equity = 1000 + ((i * 7) % 23) + i * 0.5;
    peak = Math.max(peak, equity);
    const dd = equity >= peak ? "0" : `-${((peak - equity) / peak).toFixed(6)}`;
    return { bucket_start: iso(START + i * STEP), equity: equity.toFixed(2), drawdown: dd };
  });
  const band = over.band === false ? null : {
    run_id: over.runId ?? "run_fixture_screen",
    artifact_digest: DIGEST,
    points: points.map((p) => ({ bucket_start: p.bucket_start, lower: (Number(p.equity) * 0.97).toFixed(2), upper: (Number(p.equity) * 1.03).toFixed(2) })),
  };
  return {
    schema_version: "execution.analytics.equity-projection.v1",
    runtime_active: false,
    source_side_effect_requested: false,
    analytics: {
      schema_version: "execution.analytics.v1", formula_version: "equity_projection.v1", source_authority: "DERIVED", input_freshness_floor: "OK", panel_state: "ok",
      input_completeness: "COMPLETE", input_as_of: iso(START + (n - 1) * STEP),
      warnings: [{ code: "FIXTURE_ILLUSTRATIVE_BAND", message: "The band is an illustrative fixture band." }],
      data: {
        deployment_id: deploymentId, currency: "USDT", requested_from: iso(START), requested_to: iso(START + (n - 1) * STEP), interval: "1m", interval_seconds: 60,
        expected_buckets: n, returned_buckets: n, source_rows: n, coverage: "1", joined_run_id: "run_fixture_screen", artifact_digest: DIGEST, points, approved_band: band, gaps: [],
        retention: { availability: "HOT", policy_version: "retention.fixture.v1" },
      },
    },
  };
}

export type Served = { status: number; body: unknown } | "throws";

export interface ProjectionPort {
  queries: EquityProjectionQuery[];
  api<T extends object>(base: T): T & ExecutionApi;
  method(): NonNullable<ExecutionApi["getEquityProjection"]>;
}

/** A `getEquityProjection` that goes through the product fetch and reader; `serve` decides the HTTP answer per deployment. */
export function projectionPort(serve: (query: EquityProjectionQuery) => Served): ProjectionPort {
  const queries: EquityProjectionQuery[] = [];
  const method: NonNullable<ExecutionApi["getEquityProjection"]> = async (query) => {
    queries.push(query);
    const served = serve(query);
    const fake = (async () => {
      if (served === "throws") throw new TypeError("network");
      return { ok: served.status >= 200 && served.status < 300, status: served.status, json: async () => served.body } as unknown as Response;
    }) as unknown as typeof fetch;
    return fetchEquityProjection(query, undefined, fake);
  };
  return { queries, method: () => method, api: <T extends object>(base: T) => ({ ...base, getEquityProjection: method }) as unknown as T & ExecutionApi };
}

/** Elements under a node: the DOM weight of a panel. */
export const weight = (node: Element | null): number => (node === null ? 0 : node.querySelectorAll("*").length);

/* ── the five views every consuming screen must show (populated, missing, unauthorized, mismatch, long series) ─────────────────────────── */

const section = () => document.querySelector<HTMLElement>('[data-testid="equity-projection"]');
const refused = () => document.querySelector<HTMLElement>('[data-testid="equity-projection-refused"]');
/** The nodes a 5,000-point projection may add over a 6-point one: the existing EquityPanel reduces to its pixel width. */
export const MAX_EXTRA_NODES = 400;

export function describeProjectionScreen(
  name: string,
  deploymentId: string,
  mount: (serve: (query: EquityProjectionQuery) => Served) => Promise<ProjectionPort>,
  options: { workspaceId?: string } = {},
): void {
  const mine = (id: string, n?: number, over?: Parameters<typeof projectionBody>[2]): Served => ({ status: 200, body: projectionBody(id, n, over) });
  describe(`${name} · the equity projection (FIXTURE lane)`, () => {
    it("populated: the existing chart is drawn from the reader's output, labelled Fixture projection, band named illustrative", async () => {
      const port = await mount((q) => mine(q.deploymentId));
      await waitFor(() => expect(section()).not.toBeNull());
      const text = section()!.textContent ?? "";
      expect(section()!.getAttribute("data-lane")).toBe("fixture");
      expect(text).toContain("Fixture projection");
      expect(text).toContain("Illustrative band (fixture), not an approved band");
      expect(Array.from(section()!.querySelectorAll("li")).map((li) => li.textContent)).not.toContain("Approved band");
      expect(section()!.querySelector("svg")).not.toBeNull();
      expect(section()!.querySelector('[data-testid="band"]')).not.toBeNull();
      expect(port.queries.length).toBeGreaterThan(0);
      expect(port.queries.every((q) => q.deploymentId === deploymentId)).toBe(true);
      if (options.workspaceId !== undefined) expect(port.queries.every((q) => q.workspaceId === options.workspaceId)).toBe(true);
    });

    it("a body without a band draws no band at all", async () => {
      await mount((q) => mine(q.deploymentId, 6, { band: false }));
      await waitFor(() => expect(section()).not.toBeNull());
      expect(section()!.querySelector('[data-testid="band"]')).toBeNull();
      expect(section()!.textContent).not.toContain("Illustrative band");
    });

    it("missing (the real API's 404 and 501, a network failure, a client that throws): nothing new, the screen keeps its own typed absence", async () => {
      for (const served of [{ status: 404, body: { error: { code: "X" } } }, { status: 501, body: {} }, "throws"] as const) {
        cleanup();
        await mount(() => served);
        await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
        expect(section(), String(served === "throws" ? served : served.status)).toBeNull();
        expect(refused()).toBeNull();
      }
    });

    it("unauthorized (403): the word is shown, no chart", async () => {
      await mount(() => ({ status: 403, body: { error: { code: "ACCESS_DENIED" } } }));
      await waitFor(() => expect(refused()).not.toBeNull());
      expect(refused()!.getAttribute("data-word")).toBe("DENIED");
      expect(refused()!.textContent).toContain("denied");
      expect(section()).toBeNull();
    });

    it("mismatch: a body for another deployment is refused with its word and draws nothing", async () => {
      await mount(() => mine("dep_someone_else"));
      await waitFor(() => expect(refused()).not.toBeNull());
      expect(refused()!.getAttribute("data-word")).toBe("MISMATCH");
      expect(section()).toBeNull();
    });

    it("mismatch: a band joined to another run than the series is refused whole (the series is not drawn without its lineage)", async () => {
      await mount((q) => {
        const body = projectionBody(q.deploymentId) as { analytics: { data: { approved_band: { run_id: string } } } };
        body.analytics.data.approved_band.run_id = "run_other";
        return { status: 200, body };
      });
      await waitFor(() => expect(refused()).not.toBeNull());
      expect(refused()!.getAttribute("data-word")).toBe("UNREADABLE");
      expect(refused()!.textContent).toContain("band_lineage");
      expect(section()).toBeNull();
    });

    it("a real-source body (runtime_active true) cannot be shown: the V1 reader refuses it", async () => {
      await mount((q) => {
        const body = projectionBody(q.deploymentId) as { runtime_active: boolean };
        body.runtime_active = true;
        return { status: 200, body };
      });
      await waitFor(() => expect(refused()).not.toBeNull());
      expect(refused()!.textContent).toContain("runtime_active");
      expect(section()).toBeNull();
    });

    it("long series: 5,000 points add a bounded number of DOM nodes (the chart reduces its own path)", async () => {
      await mount((q) => mine(q.deploymentId, 6));
      await waitFor(() => expect(section()).not.toBeNull());
      const small = weight(section());
      cleanup();
      await mount((q) => mine(q.deploymentId, 5000));
      await waitFor(() => expect(section()).not.toBeNull());
      const big = weight(section());
      expect(big - small).toBeLessThan(MAX_EXTRA_NODES);
      expect(big).toBeLessThan(1200);
    });
  });
}
