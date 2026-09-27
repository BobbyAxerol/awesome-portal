import "reflect-metadata";
import { HTTP_CODE_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";
import { ResearchAlphaImportController } from "../src/research/alpha-import.controller";
import {
  ResearchAlphaImportAttestationSchema,
  ResearchAlphaImportRegisterRequestSchema,
  researchAlphaImportAttestation,
} from "../src/research/alpha-import.contract";

describe("E6-BR-01 Alpha import attestation", () => {
  it("matches published success status codes instead of Nest's implicit POST 201", () => {
    for (const name of ["gates", "activate"] as const) {
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, ResearchAlphaImportController.prototype[name])).toBe(200);
    }
    for (const name of ["parse", "register"] as const) {
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, ResearchAlphaImportController.prototype[name])).toBe(201);
    }
  });
  it("publishes signature and SBOM absence with exact source digest and source locator", () => {
    const fact = researchAlphaImportAttestation("a".repeat(64));
    expect(fact.scope).toBe("REGISTERED_ALPHA_SOURCE_ONLY");
    expect(fact.source_digest).toBe("a".repeat(64));
    expect(fact.signature).toMatchObject({ state: "NOT_PUBLISHED", reason_code: "RESEARCH_ALPHA_IMPORT_SIGNATURE_NOT_PRODUCED" });
    expect(fact.sbom).toMatchObject({ state: "NOT_PUBLISHED", reason_code: "RESEARCH_ALPHA_IMPORT_SBOM_NOT_PRODUCED" });
    expect(fact.signature.source_locator).toBe(fact.sbom.source_locator);
  });
  it("never accepts another subject, release-image SBOM or malformed digest", () => {
    const fact = researchAlphaImportAttestation("a".repeat(64));
    expect(() => researchAlphaImportAttestation("sha256:image-ref")).toThrow();
    expect(ResearchAlphaImportAttestationSchema.safeParse({ ...fact, scope: "SIGNED_RELEASE_IMAGE" }).success).toBe(false);
    expect(ResearchAlphaImportAttestationSchema.safeParse({ ...fact, sbom: { state: "AVAILABLE", artifact: "image.json" } }).success).toBe(false);
  });
  it("does not let the caller inject attestation into durable registration", () => {
    expect(ResearchAlphaImportRegisterRequestSchema.safeParse({
      source_file_ref: "source_owned", alpha_id: "p23-source",
      import_attestation: researchAlphaImportAttestation("a".repeat(64)),
    }).success).toBe(false);
  });
});
