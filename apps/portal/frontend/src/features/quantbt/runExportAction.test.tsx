import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RunExportAction } from "./RunExportAction";

const RUN = "rrun_0123456789abcdef0123456789abcdef";

describe("legacy run export: prepare, then download (LEGACY-EXPORT-SEC)", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("is a button, not a link: nothing GETs the export until the archive is prepared", () => {
    const { container } = render(<RunExportAction runId={RUN} className="btn-ghost" />);
    expect(container.querySelector("a[href*='/export']")).toBeNull();
    expect(screen.getByRole("button", { name: /export/i })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs the prepare step first, then navigates to the read-only download", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const download = vi.fn();
    render(<RunExportAction runId={RUN} className="btn-ghost" download={download} />);
    fireEvent.click(screen.getByRole("button", { name: /export/i }));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/runs/${RUN}/export`);
    expect((fetchMock.mock.calls[0]![1] as RequestInit).method).toBe("POST");
    expect(download).toHaveBeenCalledWith(`/api/runs/${RUN}/export`);
  });

  for (const [status, words] of [
    [403, /workspace admins/],
    [404, /no archive to export/],
    [401, /Sign in again/],
  ] as const) {
    it(`shows the ${status} refusal as one short line and never downloads`, async () => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { code: "X", message: "server words", request_id: "req_1" } }), { status }));
      const download = vi.fn();
      render(<RunExportAction runId={RUN} className="btn-ghost" download={download} />);
      fireEvent.click(screen.getByRole("button", { name: /export/i }));
      const note = await screen.findByRole("status");
      expect(note.textContent).toMatch(words);
      expect(note.getAttribute("title")).toBe("server words");
      expect(download).not.toHaveBeenCalled();
    });
  }

  it("an unexpected failure says the export could not be prepared", async () => {
    fetchMock.mockRejectedValue(new TypeError("network"));
    render(<RunExportAction runId={RUN} className="btn-ghost" download={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /export/i }));
    expect((await screen.findByRole("status")).textContent).toMatch(/could not be prepared/);
  });
});
