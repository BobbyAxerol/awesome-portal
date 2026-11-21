import { describe, expect, it } from "vitest";
import { documentInvalidReason } from "../src/execution/profile-projection.repository";
import { bumpedSeedDocument } from "../src/cli/execution-native-projection-bump";
import { nativeSnapshotSeedDocument } from "../src/cli/execution-native-snapshot-seed";

const WS = "ws_06G19F61YB8CFR7TEWMS7HQ660";
describe("projection revision bump (stage-2d helper draft)", () => {
  it("changes only the reason code and stays a valid, honest UNAVAILABLE seed document", () => {
    const seed = nativeSnapshotSeedDocument(WS), b = bumpedSeedDocument(WS, seed.profile_id, 3);
    expect(documentInvalidReason(b)).toBeNull();
    const [k] = Object.keys(b.relations);
    expect(b.relations[k!]!.reason_code).toBe("PORTAL_SEED_NO_SOURCE_READ_REV_3");
    expect({ ...b.relations[k!]!, reason_code: null }).toEqual({ ...seed.relations[k!]!, reason_code: null });
    expect(b.relations[k!]!.availability).toBe("UNAVAILABLE");
    expect(b.relations[k!]!.items).toEqual([]);
    expect(b.source_catalogue_sha256).toBe(seed.source_catalogue_sha256);
  });
  it("refuses an invalid revision", () => {
    expect(() => bumpedSeedDocument(WS, "PAPER_BINANCE_USDM", 1)).toThrow("BUMP_REVISION_INVALID");
  });
});
