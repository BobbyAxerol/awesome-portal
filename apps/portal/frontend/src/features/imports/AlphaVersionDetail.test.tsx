/**
 * Alpha 360° tests.
 *
 * The screen's job is to say where a version sits and what it is made of, without
 * implying it can move it. So: the lifecycle rail marks the current stage and
 * nothing else; an absent certification and an empty promotion trail are stated as
 * facts rather than rendered as blanks; a quarantine quotes the service's reason;
 * digest verification only runs when asked; and there is no promote control.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AlphaVersionDetail } from "./AlphaVersionDetail";

const DETAIL = {
  alpha_id: "vb-momentum-alpha",
  version: "0.3.1",
  name: "VB Momentum Alpha",
  entrypoint: "alphas.vb_momentum:build",
  artifact_digest: "sha256:11112222333344445555666677778888aaaabbbbccccddddeeeeffff00001111",
  lifecycle: {
    stage: "RESEARCH",
    certification: null,
    promotion_evidence: [],
    quarantined: false,
    quarantine_reason: null,
  },
};

const originalFetch = globalThis.fetch;
let requested: string[] = [];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function mount(handler: (url: string) => Response | Promise<Response>) {
  requested = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requested.push(String(input));
    return handler(String(input));
  }) as typeof fetch;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/research/quantbt/alphas/vb-momentum-alpha/0.3.1"]}>
        <Routes>
          <Route
            path="/research/quantbt/alphas/:alphaId/:version"
            element={<AlphaVersionDetail />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("lifecycle", () => {
  it("marks exactly one stage as current and the ones before it as past", async () => {
    mount(() => json(DETAIL));
    const rail = await screen.findByTestId("alpha-lifecycle-rail");
    const states = Array.from(rail.querySelectorAll("li")).map((li) => li.dataset.state);
    // DRAFT REGISTERED CANDIDATE | RESEARCH | PAPER SANDBOX LIVE
    expect(states).toEqual(["past", "past", "past", "current", "future", "future", "future"]);
    expect(within(rail).getByText("RESEARCH").closest("li")).toHaveProperty("ariaCurrent", "step");
  });

  it("states an absent certification and an empty promotion trail as facts", async () => {
    mount(() => json(DETAIL));
    expect(await screen.findByText("chưa certify")).toBeTruthy();
    expect(screen.getByText("chưa có evidence nào được ghi")).toBeTruthy();
    // Never a zero or a dash standing in for "the trail is empty".
    expect(screen.queryByText("0")).toBeNull();
  });

  it("quotes the service's quarantine reason instead of writing its own", async () => {
    mount(() =>
      json({
        ...DETAIL,
        lifecycle: {
          ...DETAIL.lifecycle,
          quarantined: true,
          quarantine_reason: "artifact digest mismatch: expected sha256:0000",
        },
      }),
    );
    expect(
      await screen.findByText("artifact digest mismatch: expected sha256:0000"),
    ).toBeTruthy();
  });

  it("says so when a quarantine arrives with no reason attached", async () => {
    mount(() =>
      json({
        ...DETAIL,
        lifecycle: { ...DETAIL.lifecycle, quarantined: true, quarantine_reason: null },
      }),
    );
    expect(await screen.findByText(/không kèm lý do quarantine/)).toBeTruthy();
  });
});

describe("authority", () => {
  it("offers no promote control — stage changes belong to certification", async () => {
    mount(() => json(DETAIL));
    await screen.findByTestId("alpha-lifecycle-rail");
    expect(screen.queryByRole("button", { name: /promote/i })).toBeNull();
    expect(screen.getByText(/Việc chuyển stage thuộc slice certification/)).toBeTruthy();
  });

  it("reports a failed read as failed rather than an empty alpha", async () => {
    mount(() => json({ error: { code: "NOT_FOUND" } }, 404));
    // The screen retries once before giving up, so the failure is not instant.
    expect(
      await screen.findByText(/Không đọc được alpha version này/, {}, { timeout: 3000 }),
    ).toBeTruthy();
    expect(screen.queryByTestId("alpha-lifecycle-rail")).toBeNull();
  });
});

describe("verify digest", () => {
  it("hashes nothing until asked, then compares both digests", async () => {
    mount((url) =>
      url.endsWith("/verify")
        ? json({
            alpha_id: DETAIL.alpha_id,
            version: DETAIL.version,
            registered_digest: DETAIL.artifact_digest,
            computed_digest: DETAIL.artifact_digest,
            matches: true,
          })
        : json(DETAIL),
    );
    const button = await screen.findByRole("button", { name: "Verify digest" });
    expect(requested.some((url) => url.endsWith("/verify"))).toBe(false);

    fireEvent.click(button);

    await waitFor(() => expect(requested.some((url) => url.endsWith("/verify"))).toBe(true));
    expect(await screen.findByText("hai digest khớp")).toBeTruthy();
    // Both sides are shown, so a reader can see which one disagreed.
    expect(screen.getByText("registered")).toBeTruthy();
    expect(screen.getByText("computed")).toBeTruthy();
  });

  it("says the two digests differ, not just that verification finished", async () => {
    mount((url) =>
      url.endsWith("/verify")
        ? json({
            alpha_id: DETAIL.alpha_id,
            version: DETAIL.version,
            registered_digest: DETAIL.artifact_digest,
            computed_digest: "sha256:9999888877776666555544443333222211110000aaaabbbbccccddddeeee",
            matches: false,
          })
        : json(DETAIL),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Verify digest" }));
    expect(await screen.findByText("hai digest KHÁC nhau")).toBeTruthy();
  });

  it("does not claim a match when verification itself failed", async () => {
    mount((url) => (url.endsWith("/verify") ? json({}, 500) : json(DETAIL)));
    fireEvent.click(await screen.findByRole("button", { name: "Verify digest" }));
    expect(await screen.findByText(/không verify được/)).toBeTruthy();
    expect(screen.queryByText("hai digest khớp")).toBeNull();
  });
});
