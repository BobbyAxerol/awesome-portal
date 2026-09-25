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
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FREEZE_RULES_FOOTER, FREEZE_SUBTITLE, FreezeScreen } from "./FreezeDetail";
import {
  BLOCKED_NOTE,
  PARTIAL_SCOPE_NOTE,
  isFreezeLaneNotApplicable, toFreezeRefusal,
  type ArtifactBytes,
  type CurrentSourceFreeze,
  type FreezeDetail,
} from "./freezeClient";
import { DEFAULT_CURSOR } from "./evidenceCursor";
import { useFreeze } from "./useFreeze";
import { PortalApiError } from "../lib/api";
import { researchState } from "./state";
import { FreezeRoute } from "./FreezeRoute";
import { HUB_LANE_REASON, forgetRunIdentities } from "./retainedLane";

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
          bound_warning: { definition_id: "research.bound-warning.v1", copy_version: "research.bound-warning-copy.v1", reference_space: "DECLARED_RANGE", state: "INTERIOR", side: null, reason_code: null },
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
    artifact_bytes: bytes("NOT_VERIFIED"),
    ...overrides,
  } as unknown as FreezeDetail;
}

/** A10a receipt fixtures, in the server's own vocabulary. */
function bytes(state: ArtifactBytes["state"], mismatch = false): ArtifactBytes {
  const receipt = state === "MATCH" || state === "MISMATCH" || state === "MISSING";
  return {
    schema_version: "research.artifact-byte-verification.v1",
    state,
    reason_code: state === "MATCH" ? null : `P16_${state}`,
    verification_scope: "P05_SEALED_MANIFEST_PARTS_AND_DOCUMENTS",
    receipt_id: receipt ? `rabv_${"1".repeat(32)}` : null,
    verified_at_utc_ms: receipt ? T0 + 902 * DAY : null,
    artifact_revision: 1,
    expected_manifest_digest: "1".repeat(64),
    observed_manifest_digest: receipt ? "1".repeat(64) : null,
    parts_checked: receipt ? 5 : 0,
    parts_mismatched: mismatch ? 1 : 0,
    documents_checked: receipt ? 2 : 0,
    mismatches: mismatch
      ? [{ kind: "PART", table_kind: "trials", ordinal: 1, expected_digest: "a".repeat(64), observed_digest: "e".repeat(64) }]
      : [],
  };
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
 * A10a — the byte receipt (P16-T03/T04/T10, UI half)
 * ---------------------------------------------------------------------- */

describe("A10a — sealed bytes: a receipt, never a timer", () => {
  it("a read before any verify says 'not verified yet', never a match", () => {
    const { container } = view();
    const receipt = container.querySelector("[data-byte-receipt]");
    expect(receipt?.getAttribute("data-byte-receipt")).toBe("NOT_VERIFIED");
    expect(receipt?.textContent).toContain("not verified yet");
    expect(container.querySelector("[data-blocked-banner]")).toBeNull();
  });

  it("P16-T03: a MISMATCH receipt shows the red BLOCKED banner and both digests of the bad part", () => {
    const { container } = view({ detail: detail({ artifact_bytes: bytes("MISMATCH", true) }) });
    const banner = container.querySelector("[data-blocked-banner]");
    expect(banner?.getAttribute("role")).toBe("alert");
    expect(banner?.textContent).toContain("BLOCKED — digest drift");
    expect(banner?.textContent).toContain("nothing downstream of this screen may be trusted");
    const mismatch = container.querySelector("[data-byte-mismatch='PART']");
    expect(mismatch?.textContent).toContain("part trials #1");
    expect(mismatch?.textContent).toContain("≠ observed");
  });

  it("P16-T10: a held verify cannot turn into a PASS by the clock, and a failed one never does", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    try {
      let reject: (reason: unknown) => void = () => undefined;
      const pending = new Promise<Response>((_resolve, fail) => { reject = fail; });
      vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
        if ((init?.method ?? "GET").toUpperCase() === "POST") return pending;
        return { ok: true, status: 200, statusText: "200", headers: new Headers(), json: async () => detail() } as unknown as Response;
      }));
      const { result } = renderHook(() => useFreeze("R-WFO-118", null));
      await act(async () => { await vi.advanceTimersByTimeAsync(10); });
      expect(result.current.detail).not.toBeNull();
      act(() => result.current.runVerify());
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
      expect(result.current.verify.state).toBe("verifying");
      const held = view({ detail: result.current.detail, verify: result.current.verify });
      expect(held.container.querySelector("[data-verify-pending]")).not.toBeNull();
      expect(held.container.textContent).not.toContain("bytes match the seal");
      expect(held.container.querySelector("[data-verify-result]")).toBeNull();
      held.unmount();
      await act(async () => {
        reject(new TypeError("network down"));
        await vi.advanceTimersByTimeAsync(10);
      });
      expect(result.current.verify.state).toBe("refused");
      const failed = view({ detail: result.current.detail, verify: result.current.verify });
      expect(failed.container.textContent).not.toContain("bytes match the seal");
      expect(failed.container.querySelector("[data-verify-refusal]")).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("the verify answer's own receipt wins over the read's older one", () => {
    const { container } = view({
      detail: detail({ artifact_bytes: bytes("MATCH") }),
      verify: {
        state: "done",
        verification: {
          schema_version: "research.freeze-verification.v1",
          read_authority: "PORTAL_PERSISTED_RESEARCH",
          run_id: "R-WFO-118",
          freeze_revision: "p16r1_31bb90",
          verified_at_utc_ms: T0 + 903 * DAY,
          result: "BLOCKED",
          verification_scope: "PORTAL_RETAINED_DIGEST_BINDING_ONLY",
          integrity: detail().freeze.integrity,
          artifact_bytes: bytes("MISMATCH", true),
        },
      },
    });
    expect(container.querySelector("[data-byte-receipt]")?.getAttribute("data-byte-receipt")).toBe("MISMATCH");
    expect(container.querySelector("[data-blocked-banner]")).not.toBeNull();
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
          artifact_bytes: bytes("NOT_ENABLED"),
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
        laneState: null,
      },
    });
    expect(container.querySelector("[data-retained-refusal]")?.textContent).toContain("Not an admitted profile.");
    expect(container.querySelector("[data-integrity]")).toBeTruthy();
  });

  /* RF-05 CG-P13-09 changed the lane: a fixed-profile run gets a typed 200.
     S07 read that body as a retained Freeze and crashed on `integrity.state`
     (real-API receipt, 2026-09-24). */
  it("renders the typed not-applicable 200 instead of crashing on it", () => {
    const answer = {
      schema_version: "research.current-source-not-applicable.v1" as const,
      read_authority: "PORTAL_RETAINED_CURRENT_SOURCE" as const,
      run_id: "rrun_3935d7d16bbccabcc43382108ffca89d",
      revision: "csna_1",
      etag: '"csna_1"',
      availability: { state: "NOT_APPLICABLE" as const, reason_code: "RS02_RETAINED_LANE_NOT_APPLICABLE_TO_P04_FIXED_QUALIFICATION" },
      lane: {
        state: "NOT_APPLICABLE" as const,
        operation: "freeze" as const,
        run_profile: "P04_FIXED_QUALIFICATION" as const,
        run_adapter_contract_digest: "a".repeat(64),
        retainable_profile_id: "rs02.delta-wfo-global.v1" as const,
        reason_code: "RS02_RETAINED_LANE_NOT_APPLICABLE_TO_P04_FIXED_QUALIFICATION",
      },
    };
    expect(isFreezeLaneNotApplicable(answer)).toBe(true);
    const { container } = view({ retained: { state: "not-applicable", answer } });
    const note = container.querySelector("[data-retained-not-applicable]");
    expect(note?.textContent).toContain("not applicable");
    expect(note?.textContent).toContain("nothing is pending");
    expect(container.querySelector("[data-retained-state]")).toBeNull();
    expect(container.querySelector("[data-retained-refusal]")).toBeNull();
  });

  it("names the lane state of a 409, not the server's message text", () => {
    const { container } = view({
      retained: {
        state: "refused",
        refusal: toFreezeRefusal(new PortalApiError("Current QuantBT output is PENDING_RETENTION.", 409, "RESEARCH_CURRENT_SOURCE_CONFLICT", null)),
        laneState: "PENDING_RETENTION",
      },
    });
    const refusal = container.querySelector("[data-retained-refusal]");
    expect(refusal?.querySelector("[data-lane-state='PENDING_RETENTION']")).toBeTruthy();
    expect(refusal?.textContent).not.toContain("admits one Advanced-WFO profile");
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
    expect(of(404).state).toBe("terminal");
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

/* -------------------------------------------------------------------------
 * Hi-fi F1 / F2 / F4 composition — rich panels, published facts only
 * ---------------------------------------------------------------------- */

describe("Screen 07 composition — the hi-fi panels carry only published facts", () => {
  it("draws the published data windows on one data-time track, at their published proportion", () => {
    const { container } = view();
    const axis = container.querySelector("[data-data-time-axis]");
    expect(axis?.getAttribute("data-data-time-axis")).toBe("3");
    // 500 + 200 + 100 days: the offsets and widths are the published spans, nothing else.
    const style = (label: string) =>
      (container.querySelector(`[data-axis-window='${label}']`) as HTMLElement | null)?.style;
    expect(style("IS")?.left).toBe("0%");
    expect(style("IS")?.width).toBe("62.5%");
    expect(style("outer OOS")?.left).toBe("62.5%");
    expect(style("outer OOS")?.width).toBe("25%");
    expect(style("holdout")?.left).toBe("87.5%");
    expect(style("holdout")?.width).toBe("12.5%");
    // The endpoints are printed exactly; no tick is generated in between.
    expect(axis?.querySelector("[data-axis-start]")?.textContent).toBe("2024-01-01 00:00Z");
    expect(axis?.querySelector("[data-axis-end]")?.textContent).toBe("2026-03-11 00:00Z");
    expect(axis?.querySelectorAll("[data-tick]")).toHaveLength(0);
  });

  it("never puts a wall-clock mark on the data-time track", () => {
    const { container } = view();
    const axis = container.querySelector("[data-data-time-axis]");
    expect(axis?.textContent).not.toMatch(/frozen_at|first_read|committed|wall/i);
  });

  it("draws only the windows that were published", () => {
    const base = detail();
    const { container } = view({
      detail: {
        ...base,
        freeze: {
          ...base.freeze,
          ordering: {
            ...base.freeze.ordering,
            data_time: { ...base.freeze.ordering.data_time, holdout: null },
          },
        },
      },
    });
    expect(container.querySelector("[data-data-time-axis]")?.getAttribute("data-data-time-axis")).toBe("2");
    expect(container.querySelector("[data-axis-window='holdout']")).toBeNull();
  });

  it("lays the frozen parameters out as the hi-fi's five columns, one row per published parameter", () => {
    const { container } = view();
    const table = container.querySelector("[data-frozen-table]");
    expect([...(table?.querySelectorAll("thead th") ?? [])].map((th) => th.textContent)).toEqual([
      "parameter",
      "declared range",
      "range position",
      "frozen θ*",
      "reading",
    ]);
    const row = table?.querySelector("[data-frozen-parameter='rsi_len']");
    expect(row?.children).toHaveLength(5);
    expect(row?.querySelector("[data-frozen-value='rsi_len']")?.textContent).toBe("14");
    // The reading and the tick are the server's own placement, printed and positioned — never recomputed.
    // DR-02: the reading is the shared server definition through the shared renderer.
    const reading = row?.querySelector("[data-bound-warning]");
    expect(reading?.textContent).toBe("25.7% · interior");
    expect(reading?.getAttribute("data-bound-definition")).toBe("research.bound-warning.v1");
    expect(reading?.getAttribute("title")).toContain("25.7% of the declared range");
    expect((row?.querySelector("[data-frozen-position='rsi_len']") as HTMLElement).style.left).toBe(
      "calc(25.7% - 1.5px)",
    );
  });

  it("keeps the Stage 4 binding card, with the one published digest and nothing marked bound", () => {
    const { container } = view();
    const card = container.querySelector("[data-panel='stage4-binding']");
    expect(card?.getAttribute("data-binding-compared")).toBe("false");
    expect(card?.querySelectorAll("[data-binding-row]")).toHaveLength(4);
    expect(card?.querySelectorAll("[data-binding-published='true']")).toHaveLength(1);
    expect(card?.querySelector("[data-binding-row='sealed-bundle']")?.textContent).toContain("sha256:bundle01");
    expect(card?.querySelector("[data-binding-row='runtime-bundle']")?.textContent).toContain("not published");
    expect(card?.textContent).not.toMatch(/✓|\bBOUND\b/);
  });

  it("adds no control: the verification is still the only action", () => {
    const { container } = view();
    const actions = [...container.querySelectorAll("button")]
      .map((node) => node.getAttribute("data-action"))
      .filter((action) => action !== null);
    expect(actions).toEqual(["verify"]);
  });
});

/* -------------------------------------------------------------------------
 * Re-scan regressions — the route state and the announced answer
 * ---------------------------------------------------------------------- */

describe("a BLOCKED read is an answer, and the answer is announced", () => {
  it("does not turn a BLOCKED snapshot into an empty scope because its table is empty", async () => {
    stub(() => [200, blockedDetail()]);
    const { result } = renderHook(() => useFreeze("R-WFO-118", null));
    await waitFor(() => expect(result.current.detail).not.toBeNull());
    expect(result.current.detail?.freeze.frozen_parameters).toEqual([]);
    expect(result.current.state.state).toBe("available");
  });

  it("keeps the verification answer in a live status region that exists before the click", () => {
    const { container } = view();
    const live = container.querySelector("[data-verify-live]");
    expect(live?.getAttribute("role")).toBe("status");
    expect(live?.getAttribute("aria-live")).toBe("polite");
    expect(live?.querySelector("[data-verify-result]")).toBeNull();
  });
});

/* -------------------------------------------------------------------------
 * W3b — Screen 07 on the retained WFO lane (rrun_c860…, real served bodies)
 * ---------------------------------------------------------------------- */

const W3B_F = JSON.parse(readFileSync(join(process.cwd(), "src", "research", "w3bRealWfo.fixture.json"), "utf8")) as {
  freeze: CurrentSourceFreeze;
  progress: unknown;
  requested_spec: unknown;
  hub_freeze: FreezeDetail;
};
const W3B_FREEZE_RUN = W3B_F.freeze.run_id;

describe("W3b — Freeze on the retained WFO lane", () => {
  beforeEach(() => {
    forgetRunIdentities();
    stub((url) => {
      const path = new URL(url, "http://x").pathname;
      if (path.endsWith("/progress")) return [200, W3B_F.progress];
      if (path.endsWith("/requested-spec")) return [200, W3B_F.requested_spec];
      if (path.endsWith("/current-source/freeze")) return [200, W3B_F.freeze];
      if (path.endsWith("/freeze")) return [200, W3B_F.hub_freeze];
      return [404, { error: { code: "UNEXPECTED" } }];
    });
  });

  async function settled() {
    const path = `/research/quantbt/runs/${W3B_FREEZE_RUN}/freeze`;
    globalThis.window.history.replaceState(null, "", path);
    const view = render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/research/quantbt/runs/:runId/freeze" element={<FreezeRoute />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(view.container.querySelector("[data-freeze-strip='RETAINED']")).toBeTruthy());
    await waitFor(() => expect(view.container.querySelector("[data-shared-banner]")).toBeTruthy());
    await waitFor(() => expect(view.container.querySelector("[data-requested-window]")).toBeTruthy());
    return view;
  }

  it("draws one frozen θ* row per published parameter (8), under the shared-params (global) banner", async () => {
    const { container } = await settled();
    const published = Object.keys(W3B_F.freeze.frozen_selection.parameters);
    expect(published).toHaveLength(8);
    const rows = [...container.querySelectorAll("[data-frozen-param]")];
    expect(rows).toHaveLength(published.length);
    expect(new Set(rows.map((row) => row.getAttribute("data-frozen-param")))).toEqual(new Set(published));
    expect(container.querySelector("[data-frozen-table]")?.getAttribute("data-frozen")).toBe("8");
    expect(container.querySelector("[data-panel='frozen-parameters']")?.getAttribute("data-frozen-scope")).toBe("GLOBAL");
    expect(container.querySelector("[data-shared-banner]")?.textContent).toMatch(/shared params — global schedule/);
  });

  it("integrity MATCH for the manifest and retained import digests, over 1,063 retained rows", async () => {
    const { container } = await settled();
    const panel = container.querySelector("[data-panel='retained-integrity']");
    expect(panel?.getAttribute("data-integrity-state")).toBe("MATCH");
    for (const row of ["manifest", "retained-import"]) {
      expect(panel?.querySelector(`[data-integrity-row='${row}'] [data-integrity-row-state]`)?.getAttribute("data-integrity-row-state"), row).toBe("MATCH");
    }
    expect(panel?.querySelector("[data-expected='manifest']")?.getAttribute("title")).toBe(W3B_F.freeze.integrity.expected_manifest_digest);
    expect(panel?.querySelector("[data-observed='retained-import']")?.getAttribute("title")).toBe(
      W3B_F.freeze.integrity.observed_retained_import_digest,
    );
    const rows = panel?.querySelector("[data-retained-rows]");
    expect(rows?.getAttribute("data-retained-rows")).toBe("1063");
    expect(rows?.textContent).toBe("1,063 retained rows");
  });

  it("source bytes carry the P05 import-time reason", async () => {
    const { container } = await settled();
    const bytes = container.querySelector("[data-absence='source artifact bytes']");
    expect(bytes?.getAttribute("data-reason")).toBe("P05_SOURCE_BYTES_WERE_VERIFIED_AT_IMPORT_BUT_A_GET_NEVER_REOPENS_PRIVATE_ARTIFACT_BYTES");
    expect(bytes?.textContent).toContain("P05_SOURCE_BYTES_WERE_VERIFIED_AT_IMPORT_BUT_A_GET_NEVER_REOPENS_PRIVATE_ARTIFACT_BYTES");
  });

  it("what-if names RS02_DOES_NOT_ENQUEUE_EVALUATION_FROM_A_GET and prints no numeric ΔJ", async () => {
    const { container } = await settled();
    const whatIf = container.querySelector("[data-panel='what-if']");
    expect(whatIf?.getAttribute("data-what-if")).toBe("NOT_PUBLISHED");
    expect(whatIf?.getAttribute("data-reason")).toBe("RS02_DOES_NOT_ENQUEUE_EVALUATION_FROM_A_GET");
    expect(whatIf?.textContent).toContain("RS02_DOES_NOT_ENQUEUE_EVALUATION_FROM_A_GET");
    expect(container.textContent).not.toMatch(/ΔJ\s*[=:]?\s*[−+-]?\d/);
    expect(whatIf?.querySelector("input[type='range']")).toBeNull();
  });

  it("readiness READY, and no P04-hub reason although the hub answered P16 NOT_APPLICABLE", async () => {
    const { container } = await settled();
    const readiness = container.querySelector("[data-freeze-strip] [data-readiness]");
    expect(readiness?.getAttribute("data-readiness")).toBe("READY");
    expect(readiness?.textContent).toBe("readiness ready");
    expect(W3B_F.hub_freeze.availability.reason_code).toBe("P16_DELTA_WFO_PROFILE_USES_RETAINED_CURRENT_SOURCE_FREEZE");
    expect(container.textContent).not.toMatch(HUB_LANE_REASON);
    expect(container.innerHTML).not.toMatch(HUB_LANE_REASON);
  });
});
