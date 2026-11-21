/**
 * Screen 14 container tests — the wiring the presentational tests cannot see.
 *
 * Three behaviours only exist here, and each of them is a rule rather than a
 * convenience:
 *
 *  - **Admission is read, not inferred.** `CG-P07-01` was open for a phase
 *    because nothing published said whether the caller may activate. Now that
 *    `may_activate` exists, a test has to prove the control follows that field
 *    and not `lifecycle_state === "DRAFT"`, or the gap quietly reopens the
 *    first time someone "simplifies" the condition.
 *  - **A receipt belongs to exact bytes.** Editing the source must drop the
 *    parse receipt, the gate receipt and the registration together.
 *  - **A dead receipt is not retried.** `SOURCE_EXPIRED` forces a fresh parse
 *    rather than letting step 2 resend a reference known to be gone.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RegistrationResponse, RegistryEntry, SourceResponse } from "./alphaImportClient";
import { useAlphaImport } from "./useAlphaImport";

const REGISTRY_ENTRY: RegistryEntry = {
  alpha_id: "delta_rsi_polynomial",
  alpha_version_id: "av_0_2_0",
  version_label: "av_0_2_0",
  lifecycle_state: "ACTIVE",
  entrypoint: "alpha.delta_rsi:run",
  declaration: {
    schema_version: "research.alpha-version-declaration.v1",
    entrypoint: "alpha.delta_rsi:run",
    timeframes: ["1h", "4h"],
    determinism: { seed_required: true },
    parameter_space: { rsi_len: { kind: "int_range", low: 5, high: 30, step: 1 } },
  },
  source_digest_prefix: "sha256:11ab",
  alpha_revision: 6,
  registered_at_utc_ms: 1789836572369,
  may_activate: false,
};

const SOURCE: SourceResponse = {
  schema_version: "research.alpha-source.v1",
  source_file_ref: "sfr_01HZ",
  expires_at_utc_ms: 4102444800000,
  source_digest: "sha256:4f1c2b9ae0",
  analysis_digest: "sha256:aa91b3ce77",
  parse_ok: true,
  mirror: [{ field: "entrypoint", state: "parsed", check: "VERIFY", note: "Fixture-only source mirror", value: "alpha.delta_rsi:run" }],
};

function draft(mayActivate: boolean): RegistrationResponse {
  return {
    schema_version: "research.alpha-registration.v1",
    alpha_id: "delta_rsi_polynomial",
    alpha_version_id: "av_0_3_0",
    version_label: "av_0_3_0",
    source_digest: "sha256:4f1c2b9ae0",
    lifecycle_state: "DRAFT",
    supersedes: null,
    alpha_revision: 7,
    replayed: false,
    may_activate: mayActivate,
  };
}

/** Records every request so the tests can assert what was actually sent. */
let sent: { url: string; method: string; body: unknown }[] = [];

function stub(responder: (url: string, method: string) => [number, unknown]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      sent.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
      const [status, payload] = responder(url, method);
      return {
        ok: status < 400,
        status,
        statusText: "",
        headers: { get: () => null },
        json: async () => payload,
      } as unknown as Response;
    }),
  );
}

const REGISTRY_OK: [number, unknown] = [
  200,
  { schema_version: "research.alpha-registry.v1", entries: [REGISTRY_ENTRY] },
];

const GATES_OK: [number, unknown] = [
  200,
  {
    schema_version: "research.alpha-import-gates.v1",
    gate_receipt_id: "grc_1",
    source_file_ref: "sfr_01HZ",
    source_digest: SOURCE.source_digest,
    analysis_digest: SOURCE.analysis_digest,
    gates: [],
    all_pass: true,
    static_scan_disclosure: "Static scan — runtime causality is proven per run at Stage 3/4.",
  },
];

/** The real sequence: a registration exists only after a parse and green gates. */
async function registerDraft(result: { current: ReturnType<typeof useAlphaImport> }) {
  await waitFor(() => expect(result.current.registry).toHaveLength(1));
  await act(async () => result.current.onSourceChange("def run(): ...", "a.py"));
  await act(async () => result.current.onAlphaIdChange("delta-rsi-polynomial"));
  await act(async () => result.current.onParse());
  await waitFor(() => expect(result.current.parse).not.toBeNull());
  await act(async () => result.current.onRunGates());
  await waitFor(() => expect(result.current.gates).not.toBeNull());
  await act(async () => result.current.onRegister());
  await waitFor(() => expect(result.current.registration).not.toBeNull());
}

beforeEach(() => {
  sent = [];
});
afterEach(() => vi.unstubAllGlobals());

describe("activation admission comes from the server, not from lifecycle", () => {
  function stubSequence(mayActivate: boolean) {
    stub((url, method) => {
      if (method === "GET") return REGISTRY_OK;
      if (url.endsWith("/import/parse")) return [201, SOURCE];
      if (url.endsWith("/import/gates")) return GATES_OK;
      return [201, draft(mayActivate)];
    });
  }

  it("offers the control when may_activate is true", async () => {
    stubSequence(true);
    const { result } = renderHook(() => useAlphaImport());
    await registerDraft(result);

    expect(result.current.registration?.lifecycle_state).toBe("DRAFT");
    expect(result.current.activationAdmitted).toBe(true);
  });

  it("withholds it when may_activate is false, even on a DRAFT", async () => {
    stubSequence(false);
    const { result } = renderHook(() => useAlphaImport());
    await registerDraft(result);

    // DRAFT is exactly the state a lifecycle-based guess would have admitted.
    expect(result.current.registration?.lifecycle_state).toBe("DRAFT");
    expect(result.current.activationAdmitted).toBe(false);
  });
});

describe("DRAFT activation after reload uses registry authority", () => {
  it("sends the exact registry revision and refuses a caller without may_activate", async () => {
    const allowed = { ...REGISTRY_ENTRY, lifecycle_state: "DRAFT" as const, may_activate: true, alpha_revision: 9 };
    stub((url, method) => {
      if (method === "GET") return [200, { schema_version: "research.alpha-registry.v1", entries: [allowed] }];
      if (method === "POST" && url.endsWith("/activate")) return [200, {
        schema_version: "research.alpha-activation.v1", alpha_id: allowed.alpha_id,
        alpha_version_id: allowed.alpha_version_id, lifecycle_state: "ACTIVE",
        superseded_alpha_version_id: null, alpha_revision: 10, replayed: false,
      }];
      return [404, {}];
    });
    const { result } = renderHook(() => useAlphaImport());
    await waitFor(() => expect(result.current.registry).toHaveLength(1));
    await act(async () => result.current.onActivateEntry({ ...allowed, may_activate: false }));
    expect(sent.filter((request) => request.method === "POST")).toHaveLength(0);
    await act(async () => result.current.onActivateEntry(allowed));
    await waitFor(() => expect(sent.some((request) => request.method === "POST")).toBe(true));
    expect(sent.find((request) => request.method === "POST")).toMatchObject({
      url: `/api/v1/research/alphas/${allowed.alpha_version_id}/activate`,
      body: { expected_alpha_revision: 9 },
    });
  });
});

describe("a receipt belongs to exact bytes", () => {
  it("drops parse, gates and registration when the source is edited", async () => {
    stub((url, method) => {
      if (method === "GET") return REGISTRY_OK;
      if (url.endsWith("/import/parse")) return [201, SOURCE];
      if (url.endsWith("/import/gates")) return GATES_OK;
      return [201, draft(true)];
    });

    const { result } = renderHook(() => useAlphaImport());
    await registerDraft(result);

    await act(async () => result.current.onSourceChange("v2", "a.py"));

    expect(result.current.parse).toBeNull();
    expect(result.current.gates).toBeNull();
    expect(result.current.registration).toBeNull();
    expect(result.current.activationAdmitted).toBe(false);
  });

  it("sends the server's own receipt references and never a locally built one", async () => {
    stub((url, method) => {
      if (method === "GET") return REGISTRY_OK;
      if (url.endsWith("/import/parse")) return [201, SOURCE];
      return [200, { gates: [], all_pass: false }];
    });

    const { result } = renderHook(() => useAlphaImport());
    await waitFor(() => expect(result.current.registry).toHaveLength(1));
    await act(async () => result.current.onSourceChange("def run(): ...", "a.py"));
    await act(async () => result.current.onParse());
    await waitFor(() => expect(result.current.parse).not.toBeNull());
    await act(async () => result.current.onRunGates());
    await waitFor(() => expect(sent.some((r) => r.url.endsWith("/import/gates"))).toBe(true));

    const gatesCall = sent.find((r) => r.url.endsWith("/import/gates"))!;
    expect(gatesCall.body).toEqual({ source_file_ref: "sfr_01HZ" });
    // No digest is computed or forwarded by the browser.
    expect(JSON.stringify(gatesCall.body)).not.toContain("digest");
  });
});

describe("a dead receipt is not retried", () => {
  it("clears the parse receipt when the server says the source expired", async () => {
    let parsed = false;
    stub((url, method) => {
      if (method === "GET") return REGISTRY_OK;
      if (url.endsWith("/import/parse")) {
        parsed = true;
        return [201, SOURCE];
      }
      return [
        409,
        {
          error: {
            code: "RESEARCH_ALPHA_IMPORT_SOURCE_EXPIRED",
            message: "Parse expired. Parse again.",
          },
          request_id: "req_7",
        },
      ];
    });

    const { result } = renderHook(() => useAlphaImport());
    await waitFor(() => expect(result.current.registry).toHaveLength(1));
    await act(async () => result.current.onSourceChange("def run(): ...", "a.py"));
    await act(async () => result.current.onParse());
    await waitFor(() => expect(parsed).toBe(true));
    await act(async () => result.current.onRunGates());
    await waitFor(() => expect(result.current.refusal).not.toBeNull());

    expect(result.current.refusal?.code).toBe("RESEARCH_ALPHA_IMPORT_SOURCE_EXPIRED");
    // The server's sentence survives; the dead reference does not.
    expect(result.current.refusal?.message).toBe(
      "Parse expired. Parse again.",
    );
    expect(result.current.parse).toBeNull();
  });
});
