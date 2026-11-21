// Bundles server.ts (and the e2e doubles it reuses) into dist/server.mjs, plain Node >= 20 ESM.
//
// No dependency is added: the bundler is `rolldown`, which the frontend already installs for Vite.
// Run it where the frontend's node_modules exist:   node build.mjs
//
// The doubles read the published fixtures at start from `<repo>/packages/contracts/fixtures`, found
// by a path relative to their own file (four levels up from e2e/). dist/server.mjs sits at the same
// depth (apps/portal/fixture-bff/dist), so the SAME relative path reaches the same directory: an
// image must therefore copy dist/ and packages/contracts/fixtures/ to matching places under one root.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const frontend = join(here, "..", "frontend");
const require = createRequire(join(frontend, "package.json"));

let rolldownEntry;
try {
  rolldownEntry = require.resolve("rolldown");
} catch {
  console.error("fixture-bff build: rolldown not found. Run `npm ci` in apps/portal/frontend first.");
  process.exit(1);
}
const { rolldown } = await import(pathToFileURL(rolldownEntry).href);

const out = join(here, "dist");
mkdirSync(out, { recursive: true });

const bundle = await rolldown({
  input: join(here, "server.ts"),
  platform: "node",
  tsconfig: join(frontend, "tsconfig.json"),
  // Node built-ins only; everything else is bundled so the image needs no node_modules.
  external: [/^node:/],
  logLevel: "warn",
});
await bundle.write({ file: join(out, "server.mjs"), format: "esm", sourcemap: false });
await bundle.close();
console.log("fixture-bff build: wrote", join(out, "server.mjs"));
