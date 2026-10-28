/** One-shot private observation. No authority write, registration or retry. */
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { isAbsolute, join, normalize } from "node:path";
import { z } from "zod";
import { nativeRootCanonical, nativeRootDecode } from "./native-root-codec";
import { readNativeRuntimeReference } from "./native-core-runtime";
import { prepareResearchMembershipDiscovery } from "./research-membership-discovery-runtime";

const pin = z.object({ path: z.string().refine(v => isAbsolute(v) && normalize(v) === v),
  sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const text = z.string().min(1).max(512).refine(v => v === v.trim()
  && !/[\u0000-\u001f\u007f]/.test(v) && Buffer.byteLength(v, "utf8") <= 256);
const binding = z.object({ schema_version: z.literal("portal.research-membership-discovery-binding.v1"),
  human_issuer: text, subject: text, workspace_id: text }).strict();
export class ResearchDiscoveryOperatorError extends Error {
  readonly code = "RESEARCH_DISCOVERY_OPERATOR_FAILED";
  constructor() { super("The private Research discovery operation failed."); }
}

/** Never overwrite existing output. The private artifact is an observation,
 * not an accepted original; only a hash and private path are returned. */
export async function runResearchMembershipDiscovery(options: { manifest: z.infer<typeof pin>;
  binding: z.infer<typeof pin>; outputDirectory: string }): Promise<{ path: string; sha256: string }> {
  let bindingBytes: Buffer | undefined;
  let dispose: (() => void) | undefined;
  try {
    const manifestPin = pin.parse(options.manifest), bindingPin = pin.parse(options.binding);
    if (manifestPin.path === bindingPin.path || !isAbsolute(options.outputDirectory)
      || normalize(options.outputDirectory) !== options.outputDirectory) throw new Error();
    const directory = await lstat(options.outputDirectory), uid = process.geteuid?.();
    if (uid === undefined || !directory.isDirectory() || directory.isSymbolicLink() || directory.uid !== uid
      || (directory.mode & 0o7777) !== 0o700 || await realpath(options.outputDirectory) !== options.outputDirectory)
      throw new Error();
    bindingBytes = await readNativeRuntimeReference(bindingPin, 8192);
    const decoded = nativeRootDecode(bindingBytes, 8192);
    if (nativeRootCanonical(decoded) !== bindingBytes.toString("utf8")) throw new Error();
    const expected = binding.parse(decoded);
    const prepared = await prepareResearchMembershipDiscovery(manifestPin, expected); dispose = prepared.dispose;
    const observation = await prepared.client.observe();
    const bytes = Buffer.from(nativeRootCanonical({ schema_version: observation.schema_version === "portal.edge.research-membership-observation.v2"
      ? "portal.research-membership-observation-artifact.v2" : "portal.research-membership-observation-artifact.v1",
      manifest_sha256: manifestPin.sha256, binding_sha256: bindingPin.sha256, observation }));
    if (bytes.length > 65536) throw new Error();
    // Check the same private directory again immediately before creating an
    // exclusive leaf; never remove or replace a prior observation.
    const rechecked = await lstat(options.outputDirectory);
    if (!rechecked.isDirectory() || rechecked.isSymbolicLink() || rechecked.uid !== uid
      || (rechecked.mode & 0o7777) !== 0o700 || directory.dev !== rechecked.dev || directory.ino !== rechecked.ino
      || await realpath(options.outputDirectory) !== options.outputDirectory) throw new Error();
    const path = join(options.outputDirectory, `research-membership-observation-${randomUUID()}.json`);
    const file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    return { path, sha256: createHash("sha256").update(bytes).digest("hex") };
  } catch { throw new ResearchDiscoveryOperatorError(); }
  finally { bindingBytes?.fill(0); dispose?.(); }
}
