/**
 * Import inbox screen tests (U14).
 *
 * Three claims: the states stay visually and textually distinct, an empty inbox
 * is not confused with a failed read, and the screen offers no way to import a
 * file from the browser — which the strategy import contract §5 forbids.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ImportInbox } from "./ImportInbox";

const QUARANTINED = {
  alpha_id: "vb-quarantined-alpha",
  version: "0.2.0",
  import_id: "a1b2c3d4e5f60001",
  state: "QUARANTINED",
  digest_ok: true,
  received_at: "2026-08-17T09:40:00+00:00",
  reason: null,
};

const MISMATCH = {
  alpha_id: "vb-digest-mismatch-alpha",
  version: "0.1.0",
  import_id: "a1b2c3d4e5f60002",
  state: "DIGEST_MISMATCH",
  digest_ok: false,
  received_at: "2026-08-17T09:12:00+00:00",
  reason: "artifact digest mismatch: expected sha256:0000",
};

const originalFetch = globalThis.fetch;

function mount(handler: (url: string) => Response | Promise<Response>) {
  globalThis.fetch = (async (input: RequestInfo | URL) => handler(String(input))) as typeof fetch;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ImportInbox />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("populated inbox", () => {
  it("renders each import with a distinct state and the service's own reason", async () => {
    mount(() => json([QUARANTINED, MISMATCH]));

    const good = await screen.findByTestId("import-vb-quarantined-alpha-0.2.0");
    expect(within(good).getByText("Quarantined")).toBeTruthy();
    expect(within(good).getByText(/digest_ok = true/)).toBeTruthy();

    const bad = screen.getByTestId("import-vb-digest-mismatch-alpha-0.1.0");
    expect(within(bad).getByText("Digest mismatch")).toBeTruthy();
    // The rejection is quoted, not paraphrased.
    expect(within(bad).getByText(/artifact digest mismatch: expected sha256:0000/)).toBeTruthy();

    // Two different states must not render the same badge text.
    expect(within(good).queryByText("Digest mismatch")).toBeNull();
  });

  it("never says a quarantined alpha can run", async () => {
    mount(() => json([QUARANTINED]));
    const row = await screen.findByTestId("import-vb-quarantined-alpha-0.2.0");
    expect(within(row).getByText(/chưa chạy được/)).toBeTruthy();
    expect(screen.getByText(/Quarantine là fail-closed/)).toBeTruthy();
  });

  it("counts what it read", async () => {
    mount(() => json([QUARANTINED, MISMATCH]));
    const summary = await screen.findByTestId("import-summary");
    expect(within(summary).getByText("2")).toBeTruthy();
  });

  it("documents every declared state, marking the ones that never reach the inbox", async () => {
    mount(() => json([QUARANTINED]));
    await screen.findByTestId("import-summary");
    for (const label of ["Pending digest", "Invalid manifest", "Already registered"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    // One marker per non-persisted state, and the prose must not repeat it.
    expect(screen.getAllByText(/không ghi vào inbox/).length).toBe(3);
  });
});

describe("empty vs failed", () => {
  it("says an empty inbox is really empty", async () => {
    mount(() => json([]));
    expect(await screen.findByText(/inbox rỗng thật, không phải lỗi đọc/)).toBeTruthy();
  });

  it("does not substitute an empty inbox when the read fails", async () => {
    mount(() => json({ detail: "boom" }, 500));
    // The query retries once before giving up, so the error state legitimately
    // takes longer than the default findBy window.
    await waitFor(
      () => expect(screen.getByText(/Không đọc được \/api\/v1\/alphas\/imports/)).toBeTruthy(),
      { timeout: 5000 },
    );
    expect(screen.queryByText(/inbox rỗng thật/)).toBeNull();
    expect(screen.queryByTestId("import-summary")).toBeNull();
  });
});

describe("digest verification", () => {
  it("shows both digests rather than a bare verdict", async () => {
    mount((url) =>
      url.includes("/verify")
        ? json({
            alpha_id: "vb-quarantined-alpha",
            version: "0.2.0",
            registered_digest: "sha256:aaaa1111bbbb2222cccc3333",
            computed_digest: "sha256:aaaa1111bbbb2222cccc3333",
            matches: true,
          })
        : json([QUARANTINED]),
    );

    const row = await screen.findByTestId("import-vb-quarantined-alpha-0.2.0");
    fireEvent.click(within(row).getByRole("button", { name: "Verify digest" }));

    await waitFor(() => expect(within(row).getByText(/hai digest khớp/)).toBeTruthy());
    expect(within(row).getByText("registered")).toBeTruthy();
    expect(within(row).getByText("computed")).toBeTruthy();
  });

  it("does not verify until asked", async () => {
    const fetchMock = vi.fn((url: string) => json(url.includes("/verify") ? {} : [QUARANTINED]));
    mount(fetchMock);
    await screen.findByTestId("import-summary");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/verify"))).toBe(false);
  });

  it("reports a failed verification instead of implying a match", async () => {
    mount((url) => (url.includes("/verify") ? json({ detail: "not found" }, 404) : json([QUARANTINED])));
    const row = await screen.findByTestId("import-vb-quarantined-alpha-0.2.0");
    fireEvent.click(within(row).getByRole("button", { name: "Verify digest" }));
    await waitFor(() =>
      expect(within(row).getByText(/không verify được/)).toBeTruthy(),
    );
    expect(within(row).queryByText(/hai digest khớp/)).toBeNull();
  });
});

describe("no browser upload", () => {
  it("offers no file input and says why", async () => {
    const { container } = mount(() => json([QUARANTINED]));
    await screen.findByTestId("import-summary");
    // §5: "không chấp nhận import trực tiếp file từ browser".
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(screen.getByText(/không chấp nhận import trực tiếp file từ browser/)).toBeTruthy();
  });
});
