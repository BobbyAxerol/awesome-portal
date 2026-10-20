/**
 * "My access" is self-only: an audit of every link that leads to Profile & Access, read at the source (task 3 of the W1/W3 round).
 *
 * Lane: static source scan (no render, no network). The route `/administration/profile-access` is ONE path. With the `profile`
 * flag on it mounts the self-view for everyone and the V1 admin policy matrix only as the `manage` prop of that view, behind the
 * owner flag AND `administration.profile_access.manage` (access.test.tsx holds the behaviour). What this file pins is the other
 * half: no link anywhere can carry a caller to the matrix on its own. Every "My access" / "See what you can access" target is the
 * bare path (the shell adds only the shared context to it), and nothing but the view itself knows the `manage` tab value.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "../../../..");
const SELF_PATH = "/administration/profile-access";

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name === "node_modules") continue;
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.tsx?$/.test(name) && !/\.(test|smoke|fixtures)\.tsx?$/.test(name) && !/\.testbase\.ts$/.test(name)) out.push(path);
  }
  return out;
}
const FILES = sources(SRC).map((path) => ({ path, rel: relative(SRC, path), text: readFileSync(path, "utf8") }));
/** String literals naming the PAGE route (not the `/api/admin/profile-access/...` endpoints, which are reads, not links). */
const literals = (text: string) => [...text.matchAll(/["'`]([^"'`\n]*administration\/profile-access[^"'`\n]*)["'`]/g)].map((match) => match[1]!);

describe("every page link to Profile & Access is the one bare self path", () => {
  const pageLiterals = FILES.flatMap(({ rel, text }) => literals(text).map((value) => ({ rel, value })));

  it("the scan finds the links (an empty scan would prove nothing)", () => {
    expect(pageLiterals.length).toBeGreaterThanOrEqual(15);
    expect(new Set(pageLiterals.map((entry) => entry.rel)).size).toBeGreaterThanOrEqual(13);
  });

  it("each is exactly /administration/profile-access: no query, no fragment, no sub-path, no manage view", () => {
    const offenders = pageLiterals.filter((entry) => entry.value !== SELF_PATH);
    expect(offenders).toEqual([]);
  });

  it("the admin matrix's tab value is spelled in one place: the Access view", () => {
    const spellers = FILES.filter(({ text }) => /view=manage|view:\s*["']manage["']|["']manage["']\s*:/.test(text)).map(({ rel }) => rel);
    expect(spellers).toEqual(["execution/v2/screens/access/index.tsx"]);
  });

  it("only PortalRoutes mounts the V1 matrix inside the V2 view, as its `manage` prop", () => {
    const mounts = FILES.filter(({ text }) => /manage=\{/.test(text)).map(({ rel }) => rel);
    expect(mounts).toEqual(["app/PortalRoutes.tsx"]);
  });
});

describe("the other entrances to the policy matrix", () => {
  it("the V1 screen enables its policy reads only for the owner (flag-off path, unchanged)", () => {
    const v1 = FILES.find(({ rel }) => rel === "features/admin/ProfileAccess.tsx")!.text;
    expect(v1.match(/enabled: owner/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("the Users screen links to My access with the path its mount hands it, never to the matrix", () => {
    const users = FILES.find(({ rel }) => rel === "execution/v2/screens/users/index.tsx")!.text;
    expect(literals(users)).toEqual([]);
    const routes = FILES.find(({ rel }) => rel === "app/PortalRoutes.tsx")!.text;
    expect(routes).toMatch(/accessHref=\{withContext\(ADMIN_PROFILE_ACCESS_ROUTE, search\)\}/);
    expect(routes).toMatch(/export const ADMIN_PROFILE_ACCESS_ROUTE = "\/administration\/profile-access";/);
  });

  it("DockAction and the ContextBar take their access link as a prop and add nothing to it but the shared context", () => {
    const dock = FILES.find(({ rel }) => rel === "execution/v2/Drawer.tsx")!.text;
    expect(literals(dock)).toEqual([]);
    expect(dock).toMatch(/to=\{withContext\(accessHref, withoutOrigin\(params\)\)\}/);
    const bar = FILES.find(({ rel }) => rel === "execution/v2/shell/ContextBar.tsx")!.text;
    expect(literals(bar)).toEqual([]);
    expect(bar).toMatch(/<Link to=\{accessHref\}>My access<\/Link>/);
  });
});
