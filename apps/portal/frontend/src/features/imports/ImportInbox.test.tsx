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

function mount(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  // `init` is forwarded so a test can assert what was actually sent — the whole
  // point of the source-reference contract is the shape of the body.
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init)) as typeof fetch;
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

describe("source-reference submit (R11)", () => {
  const DIGEST = `sha256:${"a".repeat(64)}`;

  function fill() {
    fireEvent.change(screen.getByLabelText(/alpha_id/), { target: { value: "vb-new-alpha" } });
    fireEvent.change(screen.getByLabelText(/^version/), { target: { value: "0.3.0" } });
    fireEvent.change(screen.getByLabelText(/artifact_relpath/), {
      target: { value: "vb/0.3.0/artifact.whl" },
    });
    fireEvent.change(screen.getByLabelText(/expected_digest/), { target: { value: DIGEST } });
  }

  it("submits a pointer and a digest — never file content", async () => {
    const calls: RequestInit[] = [];
    mount((url, init) => {
      if (url.endsWith("/alphas/import")) {
        calls.push(init!);
        return json({
          alpha_id: "vb-new-alpha",
          version: "0.3.0",
          import_id: "imp-new",
          state: "QUARANTINED",
          digest_ok: true,
          received_at: "2026-08-17T11:00:00+00:00",
          reason: null,
        });
      }
      return json([]);
    });
    await screen.findByTestId("import-request-form");
    fill();
    fireEvent.click(screen.getByRole("button", { name: /Gửi import request/ }));

    await waitFor(() => expect(calls.length).toBe(1));
    const body = JSON.parse(String(calls[0].body));
    expect(body).toEqual({
      alpha_id: "vb-new-alpha",
      version: "0.3.0",
      artifact_relpath: "vb/0.3.0/artifact.whl",
      expected_digest: DIGEST,
      git_ref: null,
    });
    // §5: the browser is not the channel for code.
    expect(String(calls[0].body)).not.toMatch(/base64|content|bytes/i);
    expect(calls[0].headers).toMatchObject({ "Content-Type": "application/json" });
  });

  it("has no file input anywhere on the screen", async () => {
    const { container } = mount(() => json([]));
    await screen.findByTestId("import-request-form");
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it("blocks a malformed digest and a traversal path before calling the server", async () => {
    let posts = 0;
    mount((url) => {
      if (url.endsWith("/alphas/import")) {
        posts += 1;
        return json({});
      }
      return json([]);
    });
    await screen.findByTestId("import-request-form");

    fill();
    fireEvent.change(screen.getByLabelText(/expected_digest/), { target: { value: "sha256:nope" } });
    expect((screen.getByRole("button", { name: /Gửi import request/ }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/expected_digest/), { target: { value: DIGEST } });
    fireEvent.change(screen.getByLabelText(/artifact_relpath/), {
      target: { value: "../etc/passwd" },
    });
    expect((screen.getByRole("button", { name: /Gửi import request/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(posts).toBe(0);
  });

  it("presents a 403 as missing authority, not as bad input", async () => {
    // Writes are ADMIN-only at the gateway; the input was fine.
    mount((url) =>
      url.endsWith("/alphas/import")
        ? json({ error: { code: "FORBIDDEN", message: "Chỉ ADMIN được import." } }, 403)
        : json([]),
    );
    await screen.findByTestId("import-request-form");
    fill();
    fireEvent.click(screen.getByRole("button", { name: /Gửi import request/ }));

    await waitFor(() => expect(screen.getByText(/Không đủ quyền/)).toBeTruthy());
    expect(screen.getByText(/Chỉ ADMIN được import/)).toBeTruthy();
    expect(screen.queryByText(/Import bị từ chối/)).toBeNull();
  });

  it("shows a rejection with its request id", async () => {
    mount((url) =>
      url.endsWith("/alphas/import")
        ? json(
            {
              error: {
                code: "ALPHA_IMPORT_REJECTED",
                message: "artifact digest mismatch",
                request_id: "req-77",
              },
            },
            400,
          )
        : json([]),
    );
    await screen.findByTestId("import-request-form");
    fill();
    fireEvent.click(screen.getByRole("button", { name: /Gửi import request/ }));

    await waitFor(() => expect(screen.getByText(/Import bị từ chối/)).toBeTruthy());
    expect(screen.getByText(/artifact digest mismatch/)).toBeTruthy();
    expect(screen.getByText(/req-77/)).toBeTruthy();
    expect(screen.queryByText(/Không đủ quyền/)).toBeNull();
  });

  it("says an accepted import still cannot run", async () => {
    mount((url) =>
      url.endsWith("/alphas/import")
        ? json({
            alpha_id: "vb-new-alpha",
            version: "0.3.0",
            import_id: "imp-new",
            state: "QUARANTINED",
            digest_ok: true,
            received_at: "2026-08-17T11:00:00+00:00",
            reason: null,
          })
        : json([]),
    );
    await screen.findByTestId("import-request-form");
    fill();
    fireEvent.click(screen.getByRole("button", { name: /Gửi import request/ }));

    // Accepted is not approved — that distinction IS the pipeline.
    await waitFor(() => expect(screen.getByText(/Đã nhận vào quarantine/)).toBeTruthy());
    // Scoped to the success callout: the reference panel below repeats the same
    // sentence for the QUARANTINED state.
    const callout = screen.getByText(/Đã nhận vào quarantine/).closest(".callout")!;
    expect(within(callout as HTMLElement).getByText(/chưa chạy được cho tới khi/)).toBeTruthy();
    expect(within(callout as HTMLElement).getByText("QUARANTINED")).toBeTruthy();
  });
});
