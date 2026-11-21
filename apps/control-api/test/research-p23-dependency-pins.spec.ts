/** Offline guard for the explicitly selected compatible-major security pins. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("P23 Control API dependency pins", () => {
  it("retains the selected patched HTTP adapter/parser versions in the actual lock, including nested copies", () => {
    const root = resolve(__dirname, "..");
    const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
    const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
    expect(manifest.dependencies["@nestjs/platform-fastify"]).toBe("11.2.4");
    expect(manifest.overrides["@nestjs/platform-fastify"].fastify).toBe("5.12.5");
    expect(manifest.overrides["fast-uri@^3"]).toBe("3.1.8");
    expect(manifest.overrides["fast-uri@^4"]).toBe("4.1.5");
    expect(manifest.overrides["brace-expansion@^5"]).toBe("5.0.12");
    expect(lock.packages[""].dependencies).toEqual(manifest.dependencies);
    const copies = (name: string) => Object.entries(lock.packages)
      .filter(([path]) => path.endsWith(`/node_modules/${name}`) || path === `node_modules/${name}`)
      .map(([, pkg]) => (pkg as { version: string }).version);
    expect(copies("@nestjs/platform-fastify")).toEqual(["11.2.4"]);
    expect(copies("fastify")).toEqual(["5.12.5"]);
    expect(copies("fast-uri").length).toBeGreaterThan(0);
    for (const version of copies("fast-uri")) expect(["3.1.8", "4.1.5"]).toContain(version);
    expect(copies("brace-expansion")).toEqual(["5.0.12"]);
    expect(manifest.devDependencies.undici).toBe("7.29.1");
    expect(copies("undici")).toEqual(["7.29.1"]);
  });
});
