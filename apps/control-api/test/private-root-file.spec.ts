/** TEST_ONLY. Exercise the private-file race with mocked descriptors, never a
 * real FIFO, private artifact, root-owned file or filesystem mutation. */
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fs = vi.hoisted(() => ({ lstat: vi.fn(), open: vi.fn() }));
vi.mock("node:fs/promises", () => fs);

import { readRootOwnedPinnedFile } from "../src/execution-v2/private-root-file";

const path = "/TEST_ONLY/private-input.json";
const raw = Buffer.from('{"test_only":true}', "utf8");
const pin = createHash("sha256").update(raw).digest("hex");
const regular = () => ({
  uid: 0, mode: 0o100600, dev: 1, ino: 2, size: raw.length,
  isFile: () => true, isSymbolicLink: () => false,
});

describe("private pinned-file nonblocking open", () => {
  beforeEach(() => { fs.lstat.mockReset(); fs.open.mockReset(); });

  it("opens nonblocking and closes a regular-to-FIFO replacement without reading", async () => {
    fs.lstat.mockResolvedValue(regular());
    const file = { stat: vi.fn().mockResolvedValue({ ...regular(), isFile: () => false }),
      read: vi.fn(), close: vi.fn().mockResolvedValue(undefined) };
    fs.open.mockImplementation(async (_path, flags) => {
      // A blocking FIFO open would never return a descriptor for the following
      // fstat rejection; assert the flag at this exact boundary.
      expect(flags & constants.O_NONBLOCK).toBe(constants.O_NONBLOCK);
      return file;
    });

    await expect(readRootOwnedPinnedFile(path, pin)).rejects.toThrow("invalid");
    expect(fs.open).toHaveBeenCalledWith(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    expect(file.stat).toHaveBeenCalledOnce();
    expect(file.read).not.toHaveBeenCalled();
    expect(file.close).toHaveBeenCalledOnce();
  });

  it("preserves exact-byte hash validation for a root-owned 0600 regular file", async () => {
    fs.lstat.mockResolvedValue(regular());
    const file = { stat: vi.fn().mockResolvedValue(regular()),
      read: vi.fn().mockImplementation(async (buffer: Buffer, offset: number) => {
        if (offset === 0) { raw.copy(buffer); return { bytesRead: raw.length }; }
        return { bytesRead: 0 };
      }), close: vi.fn().mockResolvedValue(undefined) };
    fs.open.mockResolvedValue(file);

    await expect(readRootOwnedPinnedFile(path, pin)).resolves.toEqual(raw);
    await expect(readRootOwnedPinnedFile(path, "0".repeat(64))).rejects.toThrow("invalid");
    expect(file.close).toHaveBeenCalledTimes(2);
  });
});
