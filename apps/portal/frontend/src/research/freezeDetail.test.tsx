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

import { FreezeScreen } from "./FreezeDetail";
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

/* W1: the stage pages read the Library status only when a lane refuses; these tests do not cover that read. */
vi.mock("./useRunStatus", () => ({
  useRunStatus: () => ({ state: "idle" }),
  setRunStatusSeed: () => undefined,
  clearRunStatusCache: () => undefined,
}));


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
    /* VD-TEXT-01: one short clause beside the mark; the full sentence is its title, never a paragraph. */
    const note = container.querySelector("[data-scope-note]");
    expect(note?.textContent).toBe("digest comparison only");
    expect(note?.getAttribute("title")).toBe(PARTIAL_SCOPE_NOTE);
    expect(screen.queryByText(PARTIAL_SCOPE_NOTE)).toBeNull();
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

  it("VD-TEXT-01: NOT_VERIFIED is the chip alone — its full sentence is the chip title, no repeated note", () => {
    const { container } = view();
    const chip = container.querySelector("[data-byte-state='NOT_VERIFIED']");
    expect(chip?.textContent).toBe("not verified yet");
    expect(chip?.getAttribute("title")).toContain("A read never re-opens them");
    expect(container.querySelector("[data-byte-note]")).toBeNull();
    expect(container.textContent).not.toContain("No verification has been requested");
  });

  it("leaves the frozen table empty and says why", () => {
    const { container } = view({ detail: blockedDetail() });
    expect(container.querySelector("[data-frozen]")).toBeNull();
    expect(container.querySelector("[data-frozen-blocked]")?.textContent).toContain("not this run's");
    const note = container.querySelector("[data-scope-note]");
    expect(note?.getAttribute("title")).toBe(BLOCKED_NOTE);
    expect(note?.textContent).toContain("nothing below is shown as frozen");
    expect(screen.queryByText(BLOCKED_NOTE)).toBeNull();
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
    expect(banner?.textContent).toContain("run BLOCKED from promotion until re-verified");
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

describe("P16-T04 — an unavailable question keeps its card, with nothing that can act", () => {
  it("A11 / QA D12: the what-if card keeps its place as one typed absence with the server's reason — no dead sliders", () => {
    const { container } = view();
    const card = container.querySelector("[data-panel='what-if']");
    expect(card?.getAttribute("data-what-if")).toBe(detail().freeze.what_if.state);
    expect(container.querySelectorAll("input[type='range']")).toHaveLength(0);
    expect(card?.querySelector("[data-what-if-reason]")).not.toBeNull();
    // The only ENABLED server action on the screen is the explicit verification;
    // X2 (spec 07 T10) adds "copy θ* digest", which writes the clipboard only.
    const enabled = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .filter((node) => !node.disabled)
      .map((node) => node.getAttribute("data-action"));
    /* E2: copy-evidence-link writes the clipboard only, like copy-theta-digest. */
    expect(enabled.filter((action) => action !== null)).toEqual(["copy-evidence-link", "copy-theta-digest", "verify"]);
    // No number stands in for an evaluation that does not exist.
    expect(card?.textContent).not.toMatch(/ΔJ\s*[−+-]?\d/);
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
    expect(container.querySelector("[data-panel='inspection']")?.textContent).toContain("fold 2 requested");
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
    const scope = container.querySelector("[data-retained-scope]");
    expect(scope?.textContent).toBe("match = manifest, row counts, batch receipt only");
    expect(scope?.getAttribute("title")).toContain("not a check of artifact bytes");
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
    // VD-FG-01-01: the code chip is on screen; the server's sentence is its tooltip, not text.
    const note = container.querySelector("[data-retained-refusal]");
    expect(note?.querySelector("[data-refusal-code]")?.textContent).toBe("NOT_ADMITTED");
    expect(note?.querySelector("[data-refusal-detail]")?.getAttribute("title")).toBe("Not an admitted profile.");
    expect(note?.textContent).not.toContain("Not an admitted profile.");
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
    /* D12: a P04 run is not held by the retained lane — no "custody check not applicable" card is drawn. */
    expect(container.querySelector("[data-retained-not-applicable]")).toBeNull();
    expect(container.querySelector("[data-retained]")).toBeNull();
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

  it("keeps the shell under a refusal — and carries no subtitle or rules footer (VD-TEXT-01)", () => {
    const { container } = view({
      detail: null,
      state: { state: "denied", reason: "Not your workspace.", mayRetry: false, retainsContent: false },
    });
    expect(container.querySelector("[data-screen='freeze-detail']")).toBeTruthy();
    expect(container.querySelector("[data-rules-footer]")).toBeNull();
    expect(container.querySelector("[data-subtitle]")).toBeNull();
    expect(container.textContent).not.toMatch(/rules of this screen|what that freeze can honestly be checked/i);
  });

  it("carries the cursor to the hub and back to S2", () => {
    const { container } = view({ cursor: { ...DEFAULT_CURSOR, stage: "freeze", fold: 3 } });
    expect(container.querySelector("[data-action='back-to-hub']")?.getAttribute("href")).toContain("fold=3");
    const back = container.querySelector("[data-action='back-to-search']")?.getAttribute("href") ?? "";
    expect(back).toContain("/runs/R-WFO-118/search#");
    /* QA D31: S2 opens on the search stage, not on the freeze stage the reader came from. */
    expect(back).toContain("stage=search");
    expect(back).not.toContain("stage=freeze");
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
    /* X3 2026-09-26 one refusal rule (F-04): a 404 reads exactly as a 403. */
    expect(of(404).state).toBe("denied");
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
    expect(axis?.querySelector("[data-axis-start]")?.textContent).toBe("2024-01-01 00:00 UTC");
    expect(axis?.querySelector("[data-axis-end]")?.textContent).toBe("2026-03-11 00:00 UTC");
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

  it("adds no live control: the verification is still the only enabled server action (T10 copy writes the clipboard only)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { container } = view();
    const actions = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .filter((node) => !node.disabled)
      .map((node) => node.getAttribute("data-action"))
      .filter((action) => action !== null);
    expect(actions).toEqual(["copy-evidence-link", "copy-theta-digest", "verify"]);
    await act(async () => {
      fireEvent.click(container.querySelector("[data-action='copy-theta-digest']") as Element);
    });
    expect(writeText).toHaveBeenCalledWith(detail().freeze.selection.parameter_bundle_digest);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(container.querySelector("[data-action='copy-theta-digest']")?.textContent).toBe("✓ θ* digest copied");
    vi.unstubAllGlobals();
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
    expect(container.querySelector("[data-shared-banner]")?.textContent).toMatch(/shared θ\* · folds 1–2/);
    expect(container.querySelector("[data-shared-banner] [title]")?.getAttribute("title")).toMatch(/one θ\* for every fold/);
  });

  it("F2b: the binding card links on to S4 Execute with the run kept, and says why in a tooltip", async () => {
    const { container } = await settled();
    const link = container.querySelector("[data-action='binding-to-execute']");
    expect(link?.getAttribute("href")).toMatch(/\/runs\/[^/]+\/execute/);
    expect(link?.getAttribute("title")).toMatch(/S4 · Execute/);
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
    /* D24: the sentence is the text, the server's code is the hover. */
    expect(bytes?.textContent).toContain("bytes verified at import; a read never reopens them");
    expect(bytes?.textContent).not.toContain("P05_SOURCE_BYTES");
    expect(bytes?.querySelector("[data-absence-code]")?.getAttribute("title")).toBe("P05_SOURCE_BYTES_WERE_VERIFIED_AT_IMPORT_BUT_A_GET_NEVER_REOPENS_PRIVATE_ARTIFACT_BYTES");
  });

  it("what-if names RS02_DOES_NOT_ENQUEUE_EVALUATION_FROM_A_GET and prints no numeric ΔJ", async () => {
    const { container } = await settled();
    const whatIf = container.querySelector("[data-panel='what-if']");
    expect(whatIf?.getAttribute("data-what-if")).toBe("NOT_PUBLISHED");
    expect(whatIf?.getAttribute("data-reason")).toBe("RS02_DOES_NOT_ENQUEUE_EVALUATION_FROM_A_GET");
    expect(whatIf?.textContent).toContain("RS02_DOES_NOT_ENQUEUE_EVALUATION_FROM_A_GET");
    expect(container.textContent).not.toMatch(/ΔJ\s*[=:]?\s*[−+-]?\d/);
    // An older server's bare absence keeps the card with disabled controls (A11).
    expect([...(whatIf?.querySelectorAll<HTMLInputElement>("input[type='range']") ?? [])].every((range) => range.disabled)).toBe(true);
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

/* -------------------------------------------------------------------------
 * W5a · P16-T02 / P16-T11 — per-fold ordering on two axes (guide IDs)
 * ---------------------------------------------------------------------- */

function foldOrderingFixture(overrides: { second?: Partial<Record<string, unknown>> } = {}) {
  const fold = (id: string, ordinal: number, isEnd: number, oosStart: number, oosEnd: number) => ({
    fold_id: id,
    source_ordinal: ordinal,
    data_time: {
      is: { start_utc_ms: 1780272000000, end_utc_ms: isEnd },
      oos: { start_utc_ms: oosStart, end_utc_ms: oosEnd },
      boundary: "IS_ENDS_BEFORE_OOS",
      reason_code: null,
    },
    verdict: "NOT_CAUSAL_GLOBAL_SELECTION",
    reason_code: "SELECTION_SAW_EVERY_OUTER_FOLD",
    oos_generation_child: { state: "MATCH", reason_code: null, audit_ordinal: 10 + ordinal, candidate_id: "2671e27b827ab2701d52e6ce" },
  });
  return {
    schema_version: "research.freeze-fold-ordering.v1",
    axes: ["DATA_TIME", "WALL_CLOCK"],
    selection_scope: "GLOBAL",
    optimization_schedule: "global",
    source_claims: {
      chronological_claim: "not_causal_multi_fold_global_calibration",
      causality_claim: "retrospective_global_calibration",
      oos_used_for_selection: true,
    },
    wall_clock: { state: "NOT_PUBLISHED", reason_code: "QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_FREEZE_OR_OOS_READ_CLOCKS" },
    frozen_candidate: { identity_rule: "QUANTBT_WALKFORWARD_STRATEGY_CANDIDATE_ID_V1", candidate_id: "2671e27b827ab2701d52e6ce", reason_code: null },
    counts: { folds: 2, not_causal_global_selection: 2, not_evaluated: 0, not_published: 0, oos_child_match: 2, oos_child_mismatch: 0 },
    folds: [
      fold("0", 0, 1782860400000, 1782864000000, 1783465200000),
      { ...fold("1", 1, 1783465200000, 1783468800000, 1784070000000), ...overrides.second },
    ],
  };
}

function delegatedView(ordering: unknown) {
  const hub = { ...detail(), availability: { state: "NOT_APPLICABLE", reason_code: "RS02_RETAINED_LANE_OWNS_THIS_RUN" } } as FreezeDetail;
  const lane = { ...retainedFreeze(), fold_ordering: ordering } as unknown as CurrentSourceFreeze;
  return view({ detail: hub, retained: { state: "ready", freeze: lane } });
}

describe("W5a · P16-T02 — the causal boundary per fold, on two axes", () => {
  it("draws DATA TIME and WALL CLOCK as two separate axes, with one row per retained fold", () => {
    const { container } = delegatedView(foldOrderingFixture());
    const panel = container.querySelector("[data-panel='ordering']") as HTMLElement;
    expect(panel.getAttribute("data-ordering-state")).toBe("GLOBAL");
    expect(panel.querySelector("[data-fold-ordering]")?.getAttribute("data-axes")).toBe("DATA_TIME WALL_CLOCK");
    expect(panel.querySelectorAll("[data-axis]")).toHaveLength(2);
    const rows = [...panel.querySelectorAll("[data-axis='DATA_TIME'] [data-fold-row]")];
    expect(rows.map((row) => row.getAttribute("data-fold-row"))).toEqual(["0", "1"]);
    for (const row of rows) {
      expect(row.getAttribute("data-boundary")).toBe("IS_ENDS_BEFORE_OOS");
      expect(row.querySelector("[data-verdict-words]")?.textContent).toBe("not causal · global selection");
      expect(row.querySelectorAll("[data-segment]")).toHaveLength(2);
    }
    // The wall-clock axis is a typed absence, never a drawn tick.
    const clock = panel.querySelector("[data-axis='WALL_CLOCK']") as HTMLElement;
    expect(clock.querySelector("[data-absence-state='NOT_PUBLISHED']")?.getAttribute("data-reason")).toBe(
      "QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_FREEZE_OR_OOS_READ_CLOCKS",
    );
    expect(clock.querySelector("[data-segment]")).toBeNull();
  });

  it("names the engine's own claim, never a PASS", () => {
    const { container } = delegatedView(foldOrderingFixture());
    const panel = container.querySelector("[data-panel='ordering']") as HTMLElement;
    expect(panel.querySelector("[data-ordering-badge]")?.textContent).toBe("⚠ NOT CAUSAL · GLOBAL SELECTION");
    expect(panel.querySelector("[data-source-claim]")?.textContent).toBe("not causal multi fold global calibration");
    expect(panel.querySelector("[data-source-claim]")?.getAttribute("title")).toContain("NOT_CAUSAL_MULTI_FOLD_GLOBAL_CALIBRATION");
    expect(panel.querySelector("[data-ordering-reason]")?.textContent).toContain("after every fold's OOS was read");
    expect(panel.querySelector("[data-two-clocks]")).toBeNull();
    expect(panel.textContent).not.toMatch(/\bPASS\b|causal ✓/);
  });

  it("marks only the fold whose IS overlaps its OOS", () => {
    const second = foldOrderingFixture().folds[1]!;
    const { container } = delegatedView(foldOrderingFixture({ second: { data_time: { ...second.data_time, boundary: "IS_OVERLAPS_OOS" } } }));
    const words = [...container.querySelectorAll("[data-fold-row] [data-boundary-words]")].map((node) => node.textContent);
    expect(words).toEqual(["IS ends before OOS", "IS overlaps OOS"]);
  });

  it("an older server without the block keeps the typed wall-clock absence", () => {
    const { container } = delegatedView(undefined);
    const panel = container.querySelector("[data-panel='ordering']") as HTMLElement;
    expect(panel.getAttribute("data-ordering-state")).toBe("NOT_PUBLISHED");
    expect(panel.querySelector("[data-fold-ordering]")).toBeNull();
    expect(panel.querySelector("[data-reason='UI_RETAINED_LANE_HAS_NO_FIELD']")).toBeTruthy();
  });
});

describe("W5a · P16-T11 — the OOS generation child is the frozen θ*", () => {
  it("prints the server's per-fold comparison, a mismatch in red on that fold only", () => {
    const { container } = delegatedView(foldOrderingFixture({
      second: { oos_generation_child: { state: "MISMATCH", reason_code: null, audit_ordinal: 11, candidate_id: "baf7c707c2436a55bb012a15" } },
    }));
    const children = [...container.querySelectorAll("[data-fold-row]")].map((row) => [
      row.getAttribute("data-oos-child"), row.querySelector("[data-child-words]")?.textContent,
    ]);
    expect(children).toEqual([
      ["MATCH", "OOS child = frozen θ* · candidate 2671e27b827a"],
      ["MISMATCH", "OOS child ≠ frozen θ* · candidate baf7c707c243"],
    ]);
  });
});

/* ------------------------------------------------------------------------
 * E2c · row 7.9 — the F3 digest chain on the P04 hub lane
 *
 * The hub read publishes the dataset and config digests, the adapter contract
 * digest and the fixed bundle digest — but no engine version. The chain draws
 * what it holds and says, in the link's own words, what the read does not
 * carry. It never borrows the retained lane's engine or a build constant.
 * --------------------------------------------------------------------- */
describe("E2c · 7.9 — the P04 digest chain draws the hub's own provenance", () => {
  const LINKS = ["CANONICAL_FORM", "PARAMS_DIGEST", "STRATEGY_SOURCE", "ENGINE_PIN", "DATASET_HASH", "CONFIG_HASH", "BUNDLE_DIGEST"];

  it("draws the seven links, with the dataset, config and bundle from this read's provenance", () => {
    const { container } = view();
    const chain = container.querySelector("[data-panel='digest-chain']") as HTMLElement;
    expect(chain.getAttribute("data-chain-lane")).toBe("P04_FIXED_QUALIFICATION");
    expect([...chain.querySelectorAll("[data-chain-link]")].map((li) => li.getAttribute("data-chain-link"))).toEqual(LINKS);
    const link = (key: string) => container.querySelector(`[data-chain-link='${key}']`) as HTMLElement;
    const fixture = detail();
    expect(link("PARAMS_DIGEST").querySelector("span[title]")!.getAttribute("title")).toBe(fixture.freeze.selection.parameter_bundle_digest);
    expect(link("DATASET_HASH").querySelector("span[title]")!.getAttribute("title")).toBe(fixture.provenance.dataset_binding_digest);
    expect(link("CONFIG_HASH").querySelector("span[title]")!.getAttribute("title")).toBe(fixture.provenance.effective_spec_digest);
    expect(link("BUNDLE_DIGEST").querySelector("span[title]")!.getAttribute("title")).toBe(fixture.provenance.adapter_contract_digest);
  });

  it("the engine pin the hub read does not carry is stated, not guessed and not left blank", () => {
    const { container } = view();
    const engine = container.querySelector("[data-chain-link='ENGINE_PIN']") as HTMLElement;
    expect(engine.getAttribute("data-chain-link-state")).toBe("NOT_PUBLISHED");
    expect(engine.textContent).toContain("not published");
    expect(engine.getAttribute("title")).toContain("publishes no engine version");
    /* The hub freeze read has no engine field at all, so no version may appear here. */
    expect(engine.textContent).not.toContain("1.1.1");
    expect(engine.textContent).not.toContain("—");
  });

  it("a hub read with no parameter authority leaves the set and the source unnamed, with a reason", () => {
    const { container } = view();
    const canonical = container.querySelector("[data-chain-link='CANONICAL_FORM']") as HTMLElement;
    expect(canonical.getAttribute("data-chain-link-state")).toBe("NOT_PUBLISHED");
    expect(canonical.getAttribute("title")).toContain("does not publish a parameter authority");
    expect(container.querySelector("[data-chain-link='STRATEGY_SOURCE']")!.getAttribute("data-chain-link-state")).toBe("NOT_PUBLISHED");
    expect(container.querySelector("[data-panel='digest-chain']")!.getAttribute("data-chain-published")).toBe("4");
  });

  it("the verify label follows this screen's one verify, and never becomes a second button", () => {
    expect(view().container.querySelector("[data-chain-verify]")).toBeNull();
    cleanup();
    expect((view({ verify: { state: "verifying" } }).container.querySelector("[data-chain-verify]") as HTMLElement).textContent).toBe("recomputing…");
    cleanup();
    const done = view({
      verify: {
        state: "done",
        verification: {
          schema_version: "research.freeze-verification.v1",
          read_authority: "PORTAL_PERSISTED_RESEARCH",
          run_id: "R-WFO-118",
          freeze_revision: null,
          verified_at_utc_ms: 1_760_000_000_000,
          result: "PARTIAL_MATCH",
          verification_scope: "PORTAL_RETAINED_DIGEST_BINDING_ONLY",
          integrity: detail().freeze.integrity,
          artifact_bytes: detail().artifact_bytes,
        } as never,
      },
    });
    expect((done.container.querySelector("[data-chain-verify]") as HTMLElement).textContent).toBe("verified — integrity only");
    expect(done.container.querySelector("[data-panel='digest-chain'] button")).toBeNull();
  });
});

describe("QA 2026-10-02 D12 — the P04 hub body is balanced, not repeated", () => {
  it("the what-if block sits in the left column under the frozen parameters, and no second what-if is drawn below", () => {
    const { container } = view();
    const left = container.querySelector("[data-column='left']") as HTMLElement;
    expect(left.querySelector("[data-panel='frozen-parameters']")).toBeTruthy();
    expect(left.querySelector("[data-panel='what-if']")).toBeTruthy();
    expect(container.querySelectorAll("[data-panel='what-if']")).toHaveLength(1);
    expect(container.querySelector("[data-column='right'] [data-panel='digest-chain']")).toBeTruthy();
  });

  it("the source-gap strip is one collapsed line with the count, the gaps one click away; no custody-check card for a lane that never holds the run", () => {
    const { container } = view({ retained: { state: "not-applicable", answer: { lane: { reason_code: "X", run_profile: "P04", run_adapter_contract_digest: "a" } } as never } });
    const strip = container.querySelector("[data-source-absences]") as HTMLElement;
    expect(strip.tagName).toBe("DETAILS");
    expect(strip.hasAttribute("open")).toBe(false);
    expect(strip.querySelector("summary")?.textContent).toMatch(/^source gaps · \d+$/);
    expect(container.querySelector("[data-retained]")).toBeNull();
  });

  it("the 'partial' integrity chip explains itself on hover", () => {
    const { container } = view();
    const chip = container.querySelector("[data-integrity-state]") as HTMLElement;
    expect(chip.getAttribute("title")).toBe(PARTIAL_SCOPE_NOTE);
  });
});

describe("G7 — axe `heading-order` on Screen 07", () => {
  it("has one h1 and every panel heading one level below it, never a level skipped", () => {
    const { container } = view();
    const levels = Array.from(container.querySelectorAll("h1, h2, h3, h4, h5, h6")).map((heading) => Number(heading.tagName.slice(1)));
    expect(levels.filter((level) => level === 1)).toHaveLength(1);
    expect(levels.filter((level) => level === 2).length).toBeGreaterThan(3);
    /* The first heading after the title is an h2 (it was an h3: h1 → h3 skips a level). Headings inside the shared
       panels stay h3, and sit under an h2 now. */
    expect(levels[1]).toBe(2);
    /* No heading is more than one level deeper than the one before it (what axe's heading-order checks). */
    levels.forEach((level, index) => {
      if (index > 0) expect(level - levels[index - 1]!, `heading ${index}`).toBeLessThanOrEqual(1);
    });
  });
});

describe("F2 · S07 — imported_alpha on the freeze read", () => {
  const IMPORTED = {
    schema_version: "research.imported-alpha-read-binding.v1",
    source_digest: "abcd1234ef567890abcd1234ef567890abcd1234ef567890abcd1234ef567890",
    entrypoint: "delta_signal",
    parameter_bundle_digest: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    parameters: [
      { name: "window", kind: "int_range", value: 34 },
      { name: "ma_kind", kind: "categorical", value: "ema" },
    ],
  };

  it("an imported run shows `imported · entrypoint · sha256:abcd1234…` and the categorical params in the header", () => {
    const { container } = view({ detail: detail({ imported_alpha: IMPORTED }) });
    const line = container.querySelector("[data-imported-alpha]") as HTMLElement;
    expect(line).toBeTruthy();
    expect(line.querySelector("[data-imported-entrypoint]")?.textContent).toBe("delta_signal");
    expect(line.querySelector("[data-imported-digest]")?.textContent).toBe("sha256:abcd1234…");
    expect(line.querySelector("[data-imported-param='ma_kind']")?.textContent).toBe("ma_kind=ema");
    expect(line.getAttribute("title")).toContain(`source_digest sha256:${IMPORTED.source_digest}`);
  });

  it("a built-in alpha (no imported_alpha) draws nothing", () => {
    const { container } = view({ detail: detail() });
    expect(container.querySelector("[data-imported-alpha]")).toBeNull();
  });
});

/* F3 · X6 / 07-10 / 07-17 */
describe("F3 · S07 — one timestamp format, and a back link that names the stage", () => {
  it("the hub link says stage=freeze even when the cursor arrived on another stage", () => {
    const { container } = view({ cursor: { ...DEFAULT_CURSOR, stage: "summary", fold: 2 } });
    const href = container.querySelector("[data-action='back-to-hub']")?.getAttribute("href") ?? "";
    expect(href).toContain("stage=freeze");
    expect(href).toContain("fold=2");
  });

  it("every timestamp is `YYYY-MM-DD HH:MM UTC` — no `Z` variant", () => {
    const { container } = view();
    expect(container.querySelector("[data-as-of]")?.textContent).toMatch(/as of \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/);
    expect(container.textContent).not.toMatch(/\d{2}:\d{2}Z/);
  });

  it("the OOS child candidate id is 12 hex", () => {
    const { container } = delegatedView(foldOrderingFixture());
    expect(container.querySelector("[data-child-words]")?.textContent).toMatch(/· candidate 2671e27b827a$/);
  });
});
