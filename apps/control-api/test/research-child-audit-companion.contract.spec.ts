import { describe, expect, it } from "vitest";
import { ChildAuditCompanionBatchIngressSchema, ChildAuditCompanionSealIngressSchema,
  ChildAuditCompanionQuerySchema, ChildAuditCompanionPageSchema } from "../src/research/child-audit-companion.contract";
import { auditBatch, auditRow, auditSeal } from "./research-child-audit-companion.fixture";

describe("bounded full lifecycle companion contract",()=>{
  it("binds exact source population, dense ordinals, fixed chunks and immutable manifest",()=>{
    const rows=Array.from({length:201},(_,i)=>auditRow(i)), first=auditBatch(rows), last=auditBatch(rows,1);
    expect(ChildAuditCompanionBatchIngressSchema.safeParse(first).success).toBe(true);
    expect(ChildAuditCompanionBatchIngressSchema.safeParse(last).success).toBe(true);
    for(const bad of [{...first,rows:first.rows.slice(1)}, {...last,batch_ordinal:0}, {...last,batch_digest:"0".repeat(64)},
      {...last,run_id:"foreign-run"},{...last,manifest:{...last.manifest,source_file_digest:"0".repeat(64)}},
      {...last,source_path:"private/file"}]) expect(ChildAuditCompanionBatchIngressSchema.safeParse(bad).success).toBe(false);
    expect(ChildAuditCompanionSealIngressSchema.safeParse(auditSeal([])).success).toBe(true);
  });
  it("closes context selectors and rejects generic tables, unbounded pages and ordinal/cursor mixtures",()=>{
    expect(ChildAuditCompanionQuerySchema.parse({audit_ordinal:"19999",limit:"200"})).toMatchObject({audit_ordinal:19999,limit:200});
    for(const bad of [{context:"arbitrary"},{limit:201},{limit:0},{table:"FOLD"},{audit_ordinal:20000},{audit_ordinal:1,cursor:"cursor"}])
      expect(ChildAuditCompanionQuerySchema.safeParse(bad).success).toBe(false);
  });
  it("never relabels a legacy sample as a full-source page",()=>{
    const page={schema_version:"research.child-audit-companion-page.v1",run_id:"audit-run",availability:{state:"NOT_PUBLISHED",reason_code:"LEGACY_SAMPLE"},
      custody:"LEGACY_SAMPLE",revision:null,manifest:null,scope:"SOURCE_LIFECYCLE_OBSERVATIONS_NOT_GENERATION_CLOCK",
      counts:{full_source_retained:null,records_dropped_by_source:2212,source_total_if_known:4212,matching_fold:null,matching_filter:null,legacy_sample_retained:64,returned:0},
      rows:[],next_cursor:null};
    expect(ChildAuditCompanionPageSchema.safeParse(page).success).toBe(true);
    expect(ChildAuditCompanionPageSchema.safeParse({...page,custody:"FULL_SOURCE_RETAINED"}).success).toBe(false);
    expect(ChildAuditCompanionPageSchema.safeParse({...page,counts:{...page.counts,full_source_retained:64}}).success).toBe(false);
  });
});
