import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { candidatePopulationIds, selectionRoles } from "../src/research/current-source-facts";
import { CurrentSourceFactsSchema } from "../src/research/current-source.payload";

const original = JSON.parse(readFileSync(join(__dirname, "research-w3-real-hmd-seal.fixture.json"), "utf8")).summary.source_facts;
function referenced(ids: string[], source_field: "candidate_id" | "trial_facts.source_trial_id" = "candidate_id") {
  const facts = structuredClone(original);
  delete facts.search.candidate_source_trial_ids;
  facts.search.candidate_source_trial_ids_ref = { schema_version: "research.retained-candidate-population.v1",
    table: "CANDIDATE", source_field, count: ids.length,
    sha256: createHash("sha256").update(JSON.stringify(ids)).digest("hex") };
  return CurrentSourceFactsSchema.parse(facts);
}

describe("bounded seal metadata, complete candidate authority", () => {
  it("resolves all 6400 identities, not a 200-row display page", () => {
    const ids = Array.from({ length: 6400 }, (_, i) => `study_fold${Math.floor(i / 400)}.trial_${i % 400}`).sort();
    const facts = referenced(ids), rows = ids.map(candidate_id => ({ candidate_id }));
    expect(Buffer.byteLength(JSON.stringify(facts))).toBeLessThan(65536);
    expect(selectionRoles(facts, { trial_id: ids[0], objective: "0" }, undefined, rows).candidate_source_trial_ids).toEqual(ids);
    expect(() => candidatePopulationIds(facts, rows.slice(0, 200))).toThrow("sealed reference");
    expect(() => candidatePopulationIds(facts, [...rows.slice(0, -1), { candidate_id: "foreign" }])).toThrow("sealed reference");
  });
  it("retains historical inline identity unchanged", () => {
    const facts = CurrentSourceFactsSchema.parse(original);
    expect(candidatePopulationIds(facts)).toEqual(original.search.candidate_source_trial_ids);
  });
  it("resolves global source trial identities without substituting candidate display ids", () => {
    const ids = Array.from({length:400}, (_,i)=>String(i)).sort();
    const facts = referenced(ids, "trial_facts.source_trial_id");
    const rows = ids.map(id=>({candidate_id:`candidate_${id}`,trial_facts:{source_trial_id:id}}));
    expect(candidatePopulationIds(facts, rows)).toEqual(ids);
    expect(()=>candidatePopulationIds(facts, rows.map(({candidate_id})=>({candidate_id})))).toThrow("sealed reference");
  });
  it("rejects ambiguous or missing population representations", () => {
    const facts = referenced(["0"]);
    expect(CurrentSourceFactsSchema.safeParse({ ...facts, search: { ...facts.search, candidate_source_trial_ids: [] } }).success).toBe(false);
    const missing = structuredClone(original); delete missing.search.candidate_source_trial_ids;
    expect(CurrentSourceFactsSchema.safeParse(missing).success).toBe(false);
  });
});
