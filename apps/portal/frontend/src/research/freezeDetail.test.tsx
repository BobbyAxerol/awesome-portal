/**
 * P16 consumer tests — Screen 07 S3 Freeze.
 *
 * The claims that carry this phase:
 *
 *  - **A match is only as wide as its scope.** `PARTIAL` is a retained-binding
 *    match and says so beside every mark; it is never "chain intact" and never
 *    turns the unattested artifact bytes green.
 *  - **`BLOCKED` empties the frozen table on purpose.** Filling it from a local
 *    default would put numbers on screen that are not this run's.
 *  - **One POST, from one click.** Never on mount, never from a fold change,
 *    never twice at once, and always with the same-origin CSRF proof.
 *  - **What-if is unavailable, so no control is offered** — not even a disabled
 *    slider, which is still a promise that it could move.
 */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FREEZE_RULES_FOOTER, FREEZE_SUBTITLE, FreezeScreen } from "./FreezeDetail";
import {
  BLOCKED_NOTE,
  PARTIAL_SCOPE_NOTE,
  toFreezeRefusal,
  type CurrentSourceFreeze,
  type FreezeDetail,
} from "./freezeClient";
import { DEFAULT_CURSOR } from "./evidenceCursor";
import { useFreeze } from "./useFreeze";
import { PortalApiError } from "../lib/api";
import { researchState } from "./state";

/*
 * The CSRF token lives in a `__Host-` cookie, which jsdom will not accept over
 * http. The reader is stubbed rather than the cookie faked, so the assertion
 * stays about what the client *sends* — the header, on the write and only the
 * write — instead of about jsdom's cookie jar.
 */
vi.mock("../auth/authApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../auth/authApi")>()),
  csrfTokenFromCookie: () => "tok_123",
}));

afterEach(cleanup);

function codeOf(name: string): string {
  return readFileSync(join(process.cwd(), "src", "research", name), "utf8")
    .split("\n")
    .filter((line) => {
      const t = line.trimStart();
      return !t.startsWith("*") && !t.startsWith("//") && !t.startsWith("/*");
    })
    .join("\n");
}

/* ---------------------------------------------------------------- fixtures */

const AVAILABLE = { state: "AVAILABLE", reason_code: null } as const;
const DAY = 86_400_000;
const T0 = Date.UTC(2024, 0, 1);

function gap(reason: string, state: "NOT_PUBLISHED" | "NOT_APPLICABLE" | "NOT_ASSERTED" | "NOT_ATTESTED" = "NOT_PUBLISHED") {
  return { state, reason_code: reason, availability: { state: "NOT_PUBLISHED", reason_code: reason } } as const;
}

function window(start: number, end: number, role: string, input: string) {
  return {
    start_utc_ms: start,
    end_exclusive_utc_ms: end,
    bars: 2994,
    data_role: role,
    child_input_state: input,
    evaluation_state: null,
    availability: AVAILABLE,
  };
}

function detail(overrides: Record<string, unknown> = {}): FreezeDetail {
  return {
    schema_version: "research.freeze-detail.v1",
    read_authority: "PORTAL_PERSISTED_RESEARCH",
    run_id: "R-WFO-118",
    revision: "p16r1_31bb90",
    etag: '"p16r1_31bb90"',
    availability: AVAILABLE,
    readiness: "PARTIAL",
    as_of_utc_ms: T0 + 900 * DAY,
    provenance: {
      source_adapter_id: "p04.delta-rsi.v1",
      adapter_contract_digest: "sha256:adapter01",
      p14_split_revision: "p14r1_55aa10",
      source_split_digest: "sha256:split01",
      requested_spec_digest: "sha256:88ae02",
      effective_spec_digest: "sha256:88ae02",
      dataset_binding_digest: "sha256:5b31c7",
      manifest_digest: "sha256:c25a1d",
    },
    freeze: {
      source_profile: {
        state: "FIXED_PROFILE_NO_SELECTION_ARTIFACT",
        reason_code: "P04_HAS_NO_SELECTION_ARTIFACT",
        availability: AVAILABLE,
      },
      inspection: {
        requested_fold: 2,
        state: "NOT_APPLICABLE",
        availability: { state: "NOT_APPLICABLE", reason_code: "P04_HAS_NO_FOLD_SELECTION_ARTIFACT" },
      },
      selection: {
        state: "FIXED_PARAMETER_PROFILE",
        selection_artifact_ref: null,
        selected_trial_ref: null,
        selection_sequence: null,
        parameter_bundle_digest: "sha256:bundle01",
        strict_outer_oos: gap("P04_ASSERTS_NO_STRICT_SELECTOR", "NOT_ASSERTED"),
        availability: AVAILABLE,
      },
      ordering: {
        state: "NOT_ASSERTED",
        reason_code: "P04_ASSERTS_NO_ORDERING",
        wall_clock: gap("P04_PUBLISHES_NO_WALL_CLOCK_ORDER", "NOT_ASSERTED"),
        data_time: {
          state: "AVAILABLE",
          chronology_kind: "THREE_WINDOW_CURRENT",
          is: window(T0, T0 + 500 * DAY, "IS_CALIBRATION_HISTORY", "EXPOSED_TO_CHILD_TAPE"),
          outer_oos: window(T0 + 500 * DAY, T0 + 700 * DAY, "OUTER_OOS_OBSERVATION", "EXPOSED_TO_CHILD_TAPE"),
          holdout: window(T0 + 700 * DAY, T0 + 800 * DAY, "HOLDOUT", "NOT_EXPOSED_TO_CHILD_TAPE"),
          availability: AVAILABLE,
        },
        availability: AVAILABLE,
      },
      frozen_parameters: [
        {
          name: "rsi_len",
          kind: "NUMERIC",
          minimum: "5",
          maximum: "40",
          step: "1",
          frozen_value: "14",
          position_percent: 25.7,
          bound_state: "WITHIN_DECLARED_RANGE",
        },
      ],
      integrity: {
        state: "PARTIAL",
        verification_scope: "PORTAL_RETAINED_DIGEST_BINDING_ONLY",
        checks: [
          {
            key: "P04_ADAPTER_CONTRACT",
            state: "MATCH",
            expected_digest: "sha256:adapter01",
            observed_digest: "sha256:adapter01",
            availability: AVAILABLE,
          },
          {
            key: "P10_MANIFEST_BINDING",
            state: "MATCH",
            expected_digest: "sha256:c25a1d",
            observed_digest: "sha256:c25a1d",
            availability: AVAILABLE,
          },
          {
            key: "P04_FIXED_PARAMETER_BUNDLE",
            state: "MATCH",
            expected_digest: "sha256:bundle01",
            observed_digest: "sha256:bundle01",
            availability: AVAILABLE,
          },
        ],
        source_artifact_bytes: gap("P10_ARTIFACT_BYTES_NOT_ATTESTED", "NOT_ATTESTED"),
        availability: AVAILABLE,
      },
      what_if: {
        state: "NOT_APPLICABLE",
        reason_code: "P04_PUBLISHES_NO_OBJECTIVE_DEFINITION",
        grid: {
          state: "NOT_APPLICABLE",
          effective_cell_count: null,
          objective_definition: null,
          availability: { state: "NOT_APPLICABLE", reason_code: "P04_PUBLISHES_NO_GRID" },
        },
        actions: {
          diagnostic_evaluate: {
            state: "NOT_APPLICABLE",
            may_submit: false,
            href: null,
            availability: { state: "NOT_APPLICABLE", reason_code: "P16_ENQUEUES_NO_EVALUATION" },
          },
          sibling_draft: {
            state: "NOT_APPLICABLE",
            may_create: false,
            href: null,
            availability: { state: "NOT_APPLICABLE", reason_code: "P16_CREATES_NO_SIBLING" },
          },
        },
        availability: { state: "NOT_APPLICABLE", reason_code: "P04_PUBLISHES_NO_OBJECTIVE_DEFINITION" },
      },
    },
    source_absences: {
      artifact_bytes: gap("P10_ARTIFACT_BYTES_NOT_ATTESTED", "NOT_ATTESTED"),
    },
    ...overrides,
  } as unknown as FreezeDetail;
}

function blockedDetail(): FreezeDetail {
  const base = detail();
  return {
    ...base,
    freeze: {
      ...base.freeze,
      frozen_parameters: [],
      integrity: {
        ...base.freeze.integrity,
        state: "BLOCKED",
        checks: [
          base.freeze.integrity.checks[0],
          {
            key: "P10_MANIFEST_BINDING",
            state: "MISMATCH",
            expected_digest: "sha256:c25a1d",
            observed_digest: "sha256:ffffff",
            availability: AVAILABLE,
          },
          base.freeze.integrity.checks[2],
        ],
      },
    },
  } as FreezeDetail;
}

function retainedFreeze(): CurrentSourceFreeze {
  return {
    read_authority: "PORTAL_RETAINED_CURRENT_SOURCE",
    run_id: "R-WFO-118",
    revision: "rs02r1_9c",
    etag: '"rs02r1_9c"',
    availability: { state: "AVAILABLE", reason_code: null },
    as_of_utc_ms: T0 + 900 * DAY,
    provenance: {
      source_adapter_id: "rs02.quantbt-advanced-wfo.v1",
      profile_id: "rs02.delta-wfo-global.v1",
      engine_version: "1.1.1",
      source_manifest_digest: "sha256:m",
      source_transform_digest: "sha256:t",
      retained_import_digest: "sha256:r",
      requested_spec_digest: "sha256:q",
      effective_spec_digest: "sha256:e",
      dataset_binding_digest: "sha256:d",
      retained_at_utc_ms: T0 + 890 * DAY,
    },
    schema_version: "research.current-source-freeze.v1",
    integrity: {
      state: "MATCH",
      expected_manifest_digest: "sha256:m",
      observed_manifest_digest: "sha256:m",
      expected_retained_import_digest: "sha256:r",
      observed_retained_import_digest: "sha256:r",
      retained_row_count: 2190,
      verification_scope: "PORTAL_RETAINED_MANIFEST_ROW_COUNTS_AND_BATCH_RECEIPT",
      availability: { state: "AVAILABLE", reason_code: null },
    },
    source_artifact_bytes: {
      state: "NOT_PUBLISHED",
      reason_code: "X",
      availability: { state: "NOT_PUBLISHED", reason_code: "X" },
    },
    frozen_selection: {
      state: "AVAILABLE",
      selected_trial_id: null,
      objective: null,
      parameters: {},
      availability: { state: "AVAILABLE", reason_code: null },
    },
    what_if: {
      state: "NOT_PUBLISHED",
      reason_code: "RS02_DOES_NOT_ENQUEUE_EVALUATION_FROM_A_GET",
      availability: { state: "NOT_PUBLISHED", reason_code: "RS02_DOES_NOT_ENQUEUE_EVALUATION_FROM_A_GET" },
    },
  } as unknown as CurrentSourceFreeze;
}

const OK = researchState({ kind: "ok", rowCount: 1 });

function view(overrides: Partial<React.ComponentProps<typeof FreezeScreen>> = {}) {
  return render(
    <MemoryRouter>
      <FreezeScreen
        runId="R-WFO-118"
        detail={detail()}
        state={OK}
        cursor={DEFAULT_CURSOR}
        verify={{ state: "idle" }}
        onVerify={vi.fn()}
        retained={{ state: "idle" }}
        ensureRetained={vi.fn()}
        onReread={vi.fn()}
        {...overrides}
      />
    </MemoryRouter>,
  );
}

let requested: { url: string; method: string; headers: Record<string, string> }[] = [];

function stub(responder: (url: string, method: string) => [number, unknown]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      const headers: Record<string, string> = {};
      new Headers(init?.headers).forEach((value, key) => {
        headers[key] = value;
      });
      requested.push({ url, method, headers });
      const [status, payload] = responder(url, method);
      return {
        ok: status >= 200 && status < 300,
        status,
        statusText: String(status),
        headers: new Headers(),
        json: async () => payload,
      } as unknown as Response;
    }),
  );
}

beforeEach(() => {
  requested = [];
  vi.unstubAllGlobals();
});

/* -------------------------------------------------------------------------
 * P16-T01 — what a match means
 * ---------------------------------------------------------------------- */

describe("P16-T01 — a match is only as wide as its published scope", () => {
  it("shows the scope beside every mark", () => {
    const { container } = view();
    expect(container.querySelector("[data-verification-scope='PORTAL_RETAINED_DIGEST_BINDING_ONLY']")).toBeTruthy();
    expect(screen.getByText(PARTIAL_SCOPE_NOTE)).toBeTruthy();
  });

  it("never says the chain is intact", () => {
    const { container } = view();
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/chain intact|fully verified|integrity verified|all checks pass/i);
  });

  it("keeps the artifact bytes unattested in the same panel as the matches", () => {
    const { container } = view();
    const bytes = container.querySelector("[data-integrity] [data-gap-fact='source artifact bytes']");
    expect(bytes?.getAttribute("data-gap-state")).toBe("NOT_ATTESTED");
    expect(bytes?.textContent).toContain("not attested");
  });

  it("prints both digests for every check", () => {
    const { container } = view();
    expect(container.querySelectorAll("[data-check]")).toHaveLength(3);
    expect(container.querySelector("[data-expected='P10_MANIFEST_BINDING']")?.textContent).toContain(
      "sha256:c25a1d",
    );
    expect(container.querySelector("[data-observed='P10_MANIFEST_BINDING']")?.textContent).toContain(
      "sha256:c25a1d",
    );
  });
});

/* -------------------------------------------------------------------------
 * P16-T02 — blocked
 * ---------------------------------------------------------------------- */

describe("P16-T02 — a blocked freeze shows the mismatch and nothing else", () => {
  it("names the check that failed, with both digests", () => {
    const { container } = view({ detail: blockedDetail() });
    expect(container.querySelector("[data-integrity='BLOCKED']")).toBeTruthy();
    expect(container.querySelector("[data-check='P10_MANIFEST_BINDING'] [data-check-state='MISMATCH']")).toBeTruthy();
    expect(container.querySelector("[data-observed='P10_MANIFEST_BINDING']")?.textContent).toContain(
      "sha256:ffffff",
    );
  });

  it("leaves the frozen table empty and says why", () => {
    const { container } = view({ detail: blockedDetail() });
    expect(container.querySelector("[data-frozen]")).toBeNull();
    expect(container.querySelector("[data-frozen-blocked]")?.textContent).toContain("not this run's");
    expect(screen.getByText(BLOCKED_NOTE)).toBeTruthy();
  });
});

/* -------------------------------------------------------------------------
 * P16-T03 — the one POST
 * ---------------------------------------------------------------------- */

describe("P16-T03 — one write, from one click", () => {
  it("sends nothing but a GET on mount", async () => {
    stub(() => [200, detail()]);
    const { result } = renderHook(() => useFreeze("R-WFO-118", 2));
    await waitFor(() => expect(result.current.detail).not.toBeNull());
    expect(requested.map((entry) => entry.method)).toEqual(["GET"]);
    expect(requested[0].url).toBe("/api/v1/quantbt/runs/R-WFO-118/freeze?fold=2");
  });

  it("posts the verification with the CSRF proof, then rereads", async () => {
    stub((_url, method) =>
      method === "POST"
        ? [
            200,
            {
              schema_version: "research.freeze-verification.v1",
              read_authority: "PORTAL_PERSISTED_RESEARCH",
              run_id: "R-WFO-118",
              freeze_revision: "p16r1_31bb90",
              verified_at_utc_ms: T0 + 901 * DAY,
              result: "PARTIAL_MATCH",
              verification_scope: "PORTAL_RETAINED_DIGEST_BINDING_ONLY",
              integrity: detail().freeze.integrity,
            },
          ]
        : [200, detail()],
    );

    const { result } = renderHook(() => useFreeze("R-WFO-118", null));
    await waitFor(() => expect(result.current.detail).not.toBeNull());
    await act(async () => result.current.runVerify());
    await waitFor(() => expect(result.current.verify.state).toBe("done"));

    const post = requested.find((entry) => entry.method === "POST");
    expect(post?.url).toBe("/api/v1/quantbt/runs/R-WFO-118/freeze/verify");
    expect(post?.headers["x-portal-csrf"]).toBe("tok_123");
    // The snapshot is reread only after the typed result.
    await waitFor(() => expect(requested.filter((entry) => entry.method === "GET").length).toBe(2));
  });

  it("shows the scope the verification itself carried", async () => {
    const { container } = view({
      verify: {
        state: "done",
        verification: {
          schema_version: "research.freeze-verification.v1",
          read_authority: "PORTAL_PERSISTED_RESEARCH",
          run_id: "R-WFO-118",
          freeze_revision: "p16r1_31bb90",
          verified_at_utc_ms: T0 + 901 * DAY,
          result: "PARTIAL_MATCH",
          verification_scope: "PORTAL_RETAINED_DIGEST_BINDING_ONLY",
          integrity: detail().freeze.integrity,
        },
      },
    });
    expect(
      container.querySelector("[data-verify-scope='PORTAL_RETAINED_DIGEST_BINDING_ONLY']")?.textContent,
    ).toContain("this verification covers");
  });

  it("will not send two verifications at once", async () => {
    stub((_url, method) => (method === "POST" ? [200, { result: "PARTIAL_MATCH" }] : [200, detail()]));
    const { result } = renderHook(() => useFreeze("R-WFO-118", null));
    await waitFor(() => expect(result.current.detail).not.toBeNull());

    await act(async () => {
      result.current.runVerify();
      result.current.runVerify();
      result.current.runVerify();
    });
    expect(requested.filter((entry) => entry.method === "POST")).toHaveLength(1);
  });

  it("carries the CSRF header on the write and on nothing else", () => {
    const code = codeOf("freezeClient.ts");
    expect(code).toMatch(/method === "POST"/);
    expect(code).not.toMatch(/method: "PUT"|method: "DELETE"|method: "PATCH"/);
  });
});

/* -------------------------------------------------------------------------
 * P16-T04 — what-if, ordering and inspection
 * ---------------------------------------------------------------------- */

describe("P16-T04 — an unavailable question gets no control", () => {
  it("offers no slider, no grid and no submit — not even disabled ones", () => {
    const { container } = view();
    expect(container.querySelector("input[type='range']")).toBeNull();
    expect(container.querySelector("[data-whatif-grid='NOT_APPLICABLE']")).toBeTruthy();
    expect(container.querySelector("[data-may-submit='false']")).toBeTruthy();
    expect(container.querySelector("[data-may-create='false']")).toBeTruthy();
    // The only button on the screen is the explicit verification.
    const buttons = [...container.querySelectorAll("button")].map((node) => node.getAttribute("data-action"));
    expect(buttons.filter((action) => action !== null)).toEqual(["verify"]);
  });

  it("renders the data windows without turning them into a verdict", () => {
    const { container } = view();
    expect(container.querySelector("[data-ordering-state='NOT_ASSERTED']")).toBeTruthy();
    expect(container.querySelectorAll("[data-window-row]")).toHaveLength(3);
    expect(container.querySelector("[data-gap-fact='wall clock ordering']")?.getAttribute("data-gap-state")).toBe(
      "NOT_ASSERTED",
    );
    // No verdict *mark*: the word appears only in the sentence that denies one.
    const ordering = container.querySelector("[data-panel='ordering']");
    expect(ordering?.querySelector("[data-verdict], [data-ordering-verdict]")).toBeNull();
    expect(ordering?.textContent).not.toMatch(/\bPASS\b|\bFAIL\b/);
  });

  it("answers the requested fold rather than inventing a selection artifact", () => {
    const { container } = view();
    expect(container.querySelector("[data-panel='inspection']")?.getAttribute("data-inspection-state")).toBe(
      "NOT_APPLICABLE",
    );
    expect(container.querySelector("[data-panel='inspection']")?.textContent).toContain("Fold 2 was requested");
    expect(container.querySelector("[data-selection-refs]")?.textContent).toContain("none published");
  });
});

/* -------------------------------------------------------------------------
 * P16-T05 — the retained custody check
 * ---------------------------------------------------------------------- */

describe("P16-T05 — retained custody is narrow, and says so", () => {
  it("states what its MATCH covers", () => {
    const { container } = view({ retained: { state: "ready", freeze: retainedFreeze() } });
    expect(container.querySelector("[data-retained-state='MATCH']")).toBeTruthy();
    expect(container.querySelector("[data-retained-scope-code]")?.textContent).toContain(
      "manifest row counts and batch receipt",
    );
    expect(container.querySelector("[data-retained-scope]")?.textContent).toContain("not a check of artifact bytes");
    expect(container.querySelector("[data-retained-rows]")?.textContent).toContain("2190");
  });

  it("keeps a profile refusal inside the panel", () => {
    const { container } = view({
      retained: {
        state: "refused",
        refusal: toFreezeRefusal(new PortalApiError("Not an admitted profile.", 404, "NOT_ADMITTED", null)),
      },
    });
    expect(container.querySelector("[data-retained-refusal]")?.textContent).toContain("Not an admitted profile.");
    expect(container.querySelector("[data-integrity]")).toBeTruthy();
  });
});

/* -------------------------------------------------------------------------
 * P16-T06 — the boundary
 * ---------------------------------------------------------------------- */

describe("P16-T06 — the surface requests only the three named operations", () => {
  it("names only the published paths", () => {
    const code = codeOf("freezeClient.ts");
    const paths = [...code.matchAll(/["'`](\/api\/[^"'`$]*)/g)].map((match) => match[1]);
    expect([...new Set(paths)]).toEqual(["/api/v1/quantbt/runs"]);
    // Path-like references, not the word "artifact" — which appears in the
    // scope sentence precisely to say the bytes were never opened.
    expect(code).not.toMatch(/\/internal\/|\.parquet|artifact_path|worker_|journal/i);
  });

  it("derives no digest and no verdict", () => {
    const code = codeOf("FreezeDetail.tsx") + codeOf("freezeClient.ts");
    expect(code).not.toMatch(/sha256\(|createHash|digest\s*===\s*/);
  });

  it("keeps the shell and the verbatim copy under a refusal", () => {
    const { container } = view({
      detail: null,
      state: { state: "denied", reason: "Not your workspace.", mayRetry: false, retainsContent: false },
    });
    expect(container.querySelector("[data-screen='freeze-detail']")).toBeTruthy();
    expect(screen.getByText(FREEZE_RULES_FOOTER)).toBeTruthy();
    expect(screen.getByText(FREEZE_SUBTITLE)).toBeTruthy();
  });

  it("carries the cursor to the hub and back to S2", () => {
    const { container } = view({ cursor: { ...DEFAULT_CURSOR, stage: "freeze", fold: 3 } });
    expect(container.querySelector("[data-action='back-to-hub']")?.getAttribute("href")).toContain("fold=3");
    expect(container.querySelector("[data-action='back-to-search']")?.getAttribute("href")).toContain(
      "/runs/R-WFO-118/search#",
    );
  });

  it("sends the ETag on a reread and keeps the copy on 304", async () => {
    let reads = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const headers: Record<string, string> = {};
        new Headers(init?.headers).forEach((value, key) => {
          headers[key] = value;
        });
        requested.push({ url, method: (init?.method ?? "GET").toUpperCase(), headers });
        reads += 1;
        const status = reads === 1 ? 200 : 304;
        return {
          ok: status === 200,
          status,
          statusText: String(status),
          headers: new Headers(),
          json: async () => detail(),
        } as unknown as Response;
      }),
    );

    const { result } = renderHook(() => useFreeze("R-WFO-118", null));
    await waitFor(() => expect(result.current.detail).not.toBeNull());
    const first = result.current.detail;

    await act(async () => result.current.reread());
    await waitFor(() => expect(reads).toBe(2));
    expect(result.current.detail).toBe(first);
    expect(requested[1].headers["if-none-match"]).toBe('"p16r1_31bb90"');
  });

  it("classifies each refusal the contract declares", () => {
    const of = (status: number) => toFreezeRefusal(new PortalApiError("no", status, null, null));
    expect(of(401).state).toBe("denied");
    expect(of(404).state).toBe("empty");
    expect(of(409).state).toBe("stale");
    expect(of(503).state).toBe("unavailable");
  });
});

/* -------------------------------------------------------------------------
 * P16-T07 — no write ever fires by itself
 * ---------------------------------------------------------------------- */

describe("P16-T07 — nothing but the button writes", () => {
  it("sends no POST when the fold changes", async () => {
    stub(() => [200, detail()]);
    const { result, rerender } = renderHook(({ fold }: { fold: number }) => useFreeze("R-WFO-118", fold), {
      initialProps: { fold: 1 },
    });
    await waitFor(() => expect(result.current.detail).not.toBeNull());
    rerender({ fold: 4 });
    await waitFor(() => expect(requested.length).toBe(2));
    expect(requested.every((entry) => entry.method === "GET")).toBe(true);
  });

  it("does not verify on render, however many times it renders", async () => {
    stub(() => [200, detail()]);
    const { result, rerender } = renderHook(() => useFreeze("R-WFO-118", null));
    await waitFor(() => expect(result.current.detail).not.toBeNull());
    rerender();
    rerender();
    rerender();
    expect(requested.filter((entry) => entry.method === "POST")).toHaveLength(0);
  });

  it("clicking verify is the only path to a write", () => {
    const onVerify = vi.fn();
    const { container } = view({ onVerify });
    fireEvent.click(container.querySelector("[data-action='verify']") as Element);
    expect(onVerify).toHaveBeenCalledTimes(1);
  });
});
